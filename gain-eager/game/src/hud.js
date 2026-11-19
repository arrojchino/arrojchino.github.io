// DOM HUD, menus, cooldown readouts and a live minimap.
import { CONFIG } from './config.js';

const $ = id => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['alt','spd','status','healthFill','energyFill','cameraMode','fps','reticle',
                      'minimap','event','screen','menu','pause','settings','controls','bokehState',
                      'healthNum','energyNum','cdLaser','cdBlast','cdShock','cdBlink','cdSpeed']) {
      this.el[id] = $(id);
    }
    this.map = this.el.minimap.getContext('2d');
    this.mapTick = 0;
  }

  bind(handlers) {
    const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', fn); };
    on('startBtn', handlers.start);
    on('controlsBtn', handlers.controls);
    on('settingsBtn', handlers.settings);
    on('restartBtn', handlers.restart);
    on('resumeBtn', handlers.resume);
    on('pauseControlsBtn', handlers.controls);
    on('pauseSettingsBtn', handlers.settings);
    on('quitBtn', handlers.quit);
    on('closeControls', handlers.close);
    on('closeSettings', handlers.close);
    const q = $('qualitySelect');
    if (q) { q.value = handlers.state.quality; q.addEventListener('change', () => handlers.quality(q.value, false)); }
    const v = $('volumeRange');
    if (v) v.addEventListener('input', () => handlers.volume(parseFloat(v.value)));
    const a = $('adaptiveCheck');
    if (a) a.addEventListener('change', () => handlers.adaptive(a.checked));
  }

  show(name) {
    const panels = { menu: this.el.menu, pause: this.el.pause, settings: this.el.settings, controls: this.el.controls };
    for (const [k, e] of Object.entries(panels)) if (e) e.classList.toggle('hidden', k !== name);
    this.el.screen.classList.toggle('hidden', name === 'none');
    this.el.reticle.style.opacity = name === 'none' ? '.85' : '0';
  }

  setBokeh(on) { if (this.el.bokehState) this.el.bokehState.textContent = on ? 'ON' : 'OFF'; }

  update(state, world, perf) {
    const pl = state.player;
    this.el.alt.textContent = Math.round(pl.pos.y) + ' m';
    this.el.spd.textContent = Math.round(pl.speed * 3.6) + ' km/h';
    this.el.status.textContent = !pl.flying ? (pl.grounded ? 'GROUND' : 'JUMP') : pl.hovering ? 'HOVER' : pl.boosting ? 'BOOST' : 'FLIGHT';
    this.el.healthFill.style.width = pl.health + '%';
    this.el.energyFill.style.width = pl.energy + '%';
    this.el.healthNum.textContent = Math.round(pl.health);
    this.el.energyNum.textContent = Math.round(pl.energy);
    this.el.cameraMode.textContent = state.cameraMode.toUpperCase();
    this.el.fps.textContent = state.stats.fps + ' FPS';
    const cd = state.cooldowns;
    const setCd = (e, v, max) => { if (e) { e.textContent = v > 0 ? v.toFixed(1) : 'READY'; e.classList.toggle('cooling', v > 0); } };
    setCd(this.el.cdLaser, cd.laser, CONFIG.combat.laserCooldown);
    setCd(this.el.cdBlast, cd.blast, CONFIG.combat.blastCooldown);
    setCd(this.el.cdShock, cd.shock, CONFIG.combat.shockCooldown);
    setCd(this.el.cdBlink, cd.teleport, CONFIG.combat.teleportCooldown);
    setCd(this.el.cdSpeed, cd.speed, 2.4);
    const ev = state.events[state.events.length - 1];
    if (ev) { this.el.event.textContent = ev.text; this.el.event.style.opacity = state.time - ev.at < 2.4 ? '1' : '0'; }

    // minimap: 2D top-down, drawn every third frame
    if (++this.mapTick % 3 === 0 && world) {
      const c = this.map, S = 160, R = 78, scale = R / 320;
      c.clearRect(0, 0, S, S);
      c.fillStyle = 'rgba(8,14,22,.82)'; c.fillRect(0, 0, S, S);
      c.strokeStyle = 'rgba(160,190,210,.18)'; c.beginPath(); c.arc(S/2,S/2,R,0,7); c.stroke();
      c.save(); c.translate(S/2,S/2); c.rotate(-pl.yaw);
      for (const r of world.records) {
        if (!r.alive) continue;
        const dx = (r.x - pl.pos.x)*scale, dy = (r.z - pl.pos.z)*scale;
        if (dx*dx+dy*dy > R*R) continue;
        c.fillStyle = r.type === 'pad' ? '#ffb547' : 'rgba(190,205,220,.5)';
        const s = r.type === 'pad' ? 3.6 : 2;
        c.fillRect(dx - s/2, dy - s/2, s, s);
      }
      c.restore();
      c.fillStyle = '#ff5a3c'; c.beginPath(); c.arc(S/2,S/2,3.2,0,7); c.fill();
      c.strokeStyle = 'rgba(255,90,60,.45)'; c.beginPath(); c.moveTo(S/2,S/2); c.lineTo(S/2,S/2-10); c.stroke();
    }
  }
}
