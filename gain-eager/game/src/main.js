// Bootstrap + fixed-order game loop. Everything else lives in its own module.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from './config.js';
import { state, emit } from './state.js';
import { input } from './input.js';
import { AudioEngine } from './audio.js';
import { Particles } from './particles.js';
import { World } from './world.js';
import { Character } from './character.js';
import { Flight } from './flight.js';
import { CameraRig } from './camera.js';
import { Abilities } from './abilities.js';
import { HUD } from './hud.js';
import { Perf } from './perf.js';

const host = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, CONFIG.quality.high.pr));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;
host.appendChild(renderer.domElement);
input.attach(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.camera.fovBase, innerWidth/innerHeight, .2, 9000);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .72, .48, .82);
composer.addPass(bloom);
const bokeh = new BokehPass(scene, camera, { focus: 14, aperture: .00012, maxblur: .008 });
bokeh.enabled = false;
composer.addPass(bokeh);
composer.addPass(new OutputPass());

const audio = new AudioEngine();
const particles = new Particles(scene);
const world = new World(scene);
const character = new Character(scene);
new THREE.TextureLoader().load('assets/epstein-face.png', tex => {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  character.setPhoto(tex);
});
const flight = new Flight();
const cameraRig = new CameraRig(camera);
const abilities = new Abilities(scene, camera);
const hud = new HUD();

const ctx = { renderer, scene, camera, composer, bloom, bokeh, state, input, audio,
              particles, world, character, flight, cameraRig, abilities, hud };
const perf = new Perf(renderer, (name, auto) => applyQuality(name, auto));
ctx.perf = perf;

function applyQuality(name, auto) {
  const q = CONFIG.quality[name] || CONFIG.quality.high;
  state.quality = name;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pr));
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  world.setQuality(name);
  particles.limit = q.particles;
  bloom.enabled = q.bloom;
  bokeh.enabled = q.bokeh;
  hud.setBokeh(q.bokeh);
  if (auto) emit('Quality reduced to ' + name);
  const sel = document.getElementById('qualitySelect');
  if (sel) sel.value = name;
}

function startGame() {
  audio.ensure();
  state.started = true; state.paused = false; state.over = false;
  state.player.pos.x = 0; state.player.pos.z = 38;
  cameraRig.mode = 'chase';
  hud.show('none');
  emit('Flight active');
  try {
    const lock = renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock();
    if (lock && lock.catch) lock.catch(() => {});
  } catch (e) { /* pointer lock is optional */ }
}

hud.bind({
  state,
  start: () => { audio.play('ui'); startGame(); },
  controls: () => { hud.show('controls'); audio.play('ui'); },
  settings: () => { hud.show('settings'); audio.play('ui'); },
  close: () => hud.show(state.started ? 'none' : 'menu'),
  restart: () => location.reload(),
  resume: () => { state.paused = false; hud.show('none'); },
  quit: () => { state.started = false; state.paused = false; hud.show('menu'); },
  quality: (name, auto) => { applyQuality(name, auto); audio.play('ui'); },
  volume: v => audio.setVolume(v),
  sensitivity: v => { cameraRig.sens = v; },
  invert: v => { cameraRig.invertY = v; },
  adaptive: v => { perf.adaptive = v; },
});
hud.show('menu');
applyQuality(state.quality, false);

addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'r' && state.started && !state.paused) {
    const pl = state.player;
    pl.pos.x = 0; pl.pos.y = 2; pl.pos.z = 38;
    pl.vel.x = pl.vel.y = pl.vel.z = 0;
    pl.flying = false; pl.grounded = true; pl.hovering = false;
    pl.health = CONFIG.player.maxHealth; pl.energy = CONFIG.player.maxEnergy;
    emit('Respawn');
  }
  if (e.key === 'Escape') {
    if (!state.started) return;
    state.paused = !state.paused;
    hud.show(state.paused ? 'pause' : 'none');
    if (document.exitPointerLock) document.exitPointerLock();
  }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  particles.resize();
});

function tick(dt) {
  state.dt = dt; state.time += dt;
  if (!state.started) {
    cameraRig.mode = 'cinematic';
    cameraRig.update(dt, ctx);
    world.update(dt, camera.position);
    particles.update(dt);
  } else if (!state.paused) {
    cameraRig.update(dt, ctx);
    flight.update(dt, ctx);
    character.setAnimation(state.anim);
    character.update(dt);
    character.group.position.set(state.player.pos.x, state.player.pos.y, state.player.pos.z);
    character.group.rotation.order = 'YXZ';
    character.group.rotation.set(state.player.pitch, state.player.yaw, state.player.roll);
    abilities.update(dt, ctx);
    world.update(dt, camera.position);
    particles.update(dt);
    hud.update(state, world, perf, input);
  }
  renderer.info.reset();
  composer.render();
  perf.update(dt, state);
  input.endFrame();
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  tick(Math.min(clock.getDelta(), .05));
}
animate();

// Debug surface for automated verification; does not affect gameplay.
window.__JEFF_GAME__ = {
  state, ctx,
  start: startGame,
  setQuality: applyQuality,
  step: (n = 1, dt = 1/60) => { for (let i = 0; i < n; i++) tick(dt); },
  trigger: kind => {
    if (kind === 'laser') { input.mouse.left = true; tick(1/60); input.mouse.left = false; }
    if (kind === 'blast') abilities._fireBlast(ctx);
    if (kind === 'shock') abilities._shock(ctx);
    if (kind === 'blink') abilities._teleport(ctx);
    if (kind === 'kill') { const r = world.records.find(x => x.alive && x.type === 'building'); if (r) world.damage(r, 99, particles); }
  },
  camera: name => { cameraRig.mode = name; state.cameraMode = name; },
};
