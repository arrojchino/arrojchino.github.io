// Five camera modes with smoothing, velocity lag, FOV push and shake.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const C = CONFIG.camera;
const MODES = ['chase', 'close', 'first', 'free', 'cinematic'];

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; this.pitch = .08;
    this.pos = new THREE.Vector3(0, 6, 26);
    this.look = new THREE.Vector3();
    this.shake = 0;
    this.freeDist = 16;
    this.mode = 'chase';
    this._d = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._l = new THREE.Vector3();
    this._f = new THREE.Vector3(); this._dir = new THREE.Vector3();
  }
  cycle(input, audio) {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    if (audio) audio.play('ui');
    return this.mode;
  }
  addShake(v) { this.shake = Math.min(1.4, this.shake + v); }

  update(dt, ctx) {
    const { input, state, world } = ctx;
    const pl = state.player;
    const m = input.mouseDelta();
    const sens = .0022;
    this.yaw -= m.x * sens;
    this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - m.y * sens));
    if (!input.locked) {
      if (input.down('ArrowLeft')) this.yaw += dt * 1.5;
      if (input.down('ArrowRight')) this.yaw -= dt * 1.5;
      if (input.down('ArrowUp')) this.pitch += dt * 1.2;
      if (input.down('ArrowDown')) this.pitch -= dt * 1.2;
    }
    if (input.hit('v')) this.cycle(input, ctx.audio);

    const cp = this._p.set(pl.pos.x, pl.pos.y + (pl.flying ? .6 : 1.5), pl.pos.z);
    this._f.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    let dist = C.chaseDist, up = C.chaseHeight;
    if (this.mode === 'close') { dist = 3.1; up = 1.25; }
    if (this.mode === 'free') { dist = this.freeDist; up = this.freeDist * .32; }
    if (this.mode === 'cinematic') { dist = 11 + Math.sin(state.time * .4) * 3; up = 1.4; }
    if (pl.speed > 50) dist += (pl.speed - 50) * .06;

    if (this.mode === 'first') {
      this._d.copy(cp).addScaledVector(this._f, .12);
      this._l.copy(cp).addScaledVector(this._f, 12);
    } else {
      if (this.mode === 'cinematic') {
        const a = state.time * .22;
        this._d.set(cp.x + Math.sin(a) * dist, cp.y + up, cp.z + Math.cos(a) * dist);
      } else {
        this._d.copy(cp).addScaledVector(this._f, -dist);
        this._d.y += up;
      }
      // obstacle avoidance: pull in when a structure sits between player and camera
      const dir = this._dir.copy(this._d).sub(cp);
      const len = dir.length(); dir.normalize();
      for (const r of world.records) {
        if (!r.alive) continue;
        const ox = r.x - cp.x, oy = r.y - cp.y, oz = r.z - cp.z;
        const proj = ox*dir.x + oy*dir.y + oz*dir.z;
        if (proj <= 0 || proj > len) continue;
        const px = cp.x + dir.x*proj, py = cp.y + dir.y*proj, pz = cp.z + dir.z*proj;
        const dx = r.x-px, dy = r.y-py, dz = r.z-pz;
        if (dx*dx+dy*dy+dz*dz < r.r*r.r) {
          const pull = Math.max(1.6, proj - r.r - .8);
          this._d.copy(cp).addScaledVector(dir, pull); break;
        }
      }
      this._l.copy(cp).addScaledVector(this._f, 4);
    }

    const a = 1 - Math.exp(-dt * C.lerp);
    this.pos.lerp(this._d, a);
    this.look.lerp(this._l, 1 - Math.exp(-dt * C.lookLerp));
    this.camera.position.copy(this.pos);
    if (this.shake > .001) {
      const s = this.shake * .35;
      this.camera.position.x += (Math.random()-.5)*s;
      this.camera.position.y += (Math.random()-.5)*s;
      this.camera.position.z += (Math.random()-.5)*s;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    this.camera.lookAt(this.look);
    this.camera.rotateZ(-pl.roll * .22);

    const targetFov = Math.min(88, C.fovBase + pl.speed * C.fovSpeed + (pl.boosting ? 7 : 0));
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3.5);
    this.camera.updateProjectionMatrix();
    state.cameraMode = this.mode;
  }
}
