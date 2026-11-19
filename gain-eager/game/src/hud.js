// DOM HUD, menus, cooldown readouts and a live minimap.
import { CONFIG } from './config.js';

const $ = id => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['alt','spd','status','healthFill','energyFill','cameraMode','fps','reticle',
                      'minimap','event','screen','menu','pause','settings','controls','bokehState',
                      'healthNum','energyNum','cdLaser','cdBlast','cdShock','cdBlink','cdSpeed','hintbar']) {
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

    if (state.time > 9 && this.el.hintbar) this.el.hintbar.classList.add('hidden');

    // radar: clipped disc, water/terrain sample, structures, pads, sweep and heading cone
    if (++this.mapTick % 2 === 0 && world) {
      const c = this.map, S = 200, R = 94, scale = R / 340;
      c.clearRect(0, 0, S, S);
      c.save();
      c.beginPath(); c.arc(S/2, S/2, R, 0, 7); c.clip();
      c.fillStyle = '#0a121b'; c.fillRect(0, 0, S, S);
      for (let gy = -8; gy <= 8; gy++) for (let gx = -8; gx <= 8; gx++) {
        const wx = pl.pos.x + gx * 42, wz = pl.pos.z + gy * 42;
        if (world.heightAt(wx, wz) < CONFIG.world.waterY) {
          const dx = (wx - pl.pos.x) * scale, dy = (wz - pl.pos.z) * scale;
          c.fillStyle = 'rgba(38,110,150,.30)';
          c.fillRect(S/2 + dx - 21*scale, S/2 + dy - 21*scale, 42*scale + 1, 42*scale + 1);
        }
      }
      c.strokeStyle = 'rgba(150,185,205,.14)'; c.lineWidth = 1;
      for (let rr = R/3; rr <= R; rr += R/3) { c.beginPath(); c.arc(S/2, S/2, rr, 0, 7); c.stroke(); }
      c.beginPath(); c.moveTo(S/2,0); c.lineTo(S/2,S); c.moveTo(0,S/2); c.lineTo(S,S/2); c.stroke();

      c.save(); c.translate(S/2, S/2); c.rotate(-pl.yaw);
      for (const r of world.records) {
        if (!r.alive) continue;
        const dx = (r.x - pl.pos.x) * scale, dy = (r.z - pl.pos.z) * scale;
        if (dx*dx + dy*dy > R*R) continue;
        if (r.type === 'pad') {
          const pulse = .6 + .4 * Math.sin(state.time * 4);
          c.strokeStyle = 'rgba(255,181,71,' + pulse + ')'; c.lineWidth = 1.5;
          c.beginPath(); c.arc(dx, dy, 5, 0, 7); c.stroke();
          c.fillStyle = '#ffb547'; c.beginPath(); c.arc(dx, dy, 2, 0, 7); c.fill();
        } else if (r.type === 'building') {
          c.fillStyle = 'rgba(185,205,220,.58)'; c.fillRect(dx - 2, dy - 2, 4, 4);
        }
      }
      c.restore();

      const a = state.time * .9;
      c.strokeStyle = 'rgba(120,210,255,.35)';
      c.beginPath(); c.moveTo(S/2, S/2); c.lineTo(S/2 + Math.cos(a)*R, S/2 + Math.sin(a)*R); c.stroke();
      c.save(); c.translate(S/2, S/2); c.rotate(-pl.yaw);
      c.fillStyle = 'rgba(255,90,60,.16)';
      c.beginPath(); c.moveTo(0,0); c.arc(0,0,20,-.45,.45); c.closePath(); c.fill();
      c.fillStyle = '#ff5a3c';
      c.beginPath(); c.moveTo(0,-9); c.lineTo(6,7); c.lineTo(0,3); c.lineTo(-6,7); c.closePath(); c.fill();
      c.restore();
      c.restore();
      c.fillStyle = '#ffb547'; c.font = '9px ui-monospace,monospace'; c.fillText('N', S/2 - 3, 13);
      c.fillStyle = 'rgba(190,210,225,.65)'; c.fillText('340 m', 10, S - 10);
    }
  }
}
