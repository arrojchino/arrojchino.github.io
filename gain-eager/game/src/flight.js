// Frame-rate independent arcade flight: acceleration, momentum, damping,
// hover, takeoff/landing and simple sphere collisions. No teleporting.
import { CONFIG } from './config.js';
import { emit } from './state.js';

const P = CONFIG.player;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Flight {
  constructor() { this.lastYaw = 0; }

  update(dt, ctx) {
    const { input, state, world, particles, audio, cameraRig } = ctx;
    const pl = state.player;
    const g = world.heightAt(pl.pos.x, pl.pos.z);
    const yaw = cameraRig.yaw, pitch = cameraRig.pitch;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const boosting = input.down('Shift') && pl.energy > 2;
    pl.boosting = boosting;
    if (boosting) {
      pl.energy = Math.max(0, pl.energy - dt * 24);
      state.cooldowns.speed = .3;
      if (!this.wasBoosting) { audio.play('boost'); emit('Super speed'); }
    }
    this.wasBoosting = boosting;

    let ix = 0, iz = 0, iy = 0;
    if (input.down('w')) { ix += fx; iz += fz; }
    if (input.down('s')) { ix -= fx; iz -= fz; }
    if (input.down('d')) { ix += rx; iz += rz; }
    if (input.down('a')) { ix -= rx; iz -= rz; }
    if (input.down(' ')) iy += 1;
    if (input.down('Control')) iy -= 1;
    const mag = Math.hypot(ix, iz);
    if (mag > 1) { ix /= mag; iz /= mag; }

    if (input.hit('f')) {
      if (pl.flying) { pl.hovering = !pl.hovering; emit(pl.hovering ? 'Hover hold' : 'Hover off'); }
      else { pl.flying = true; pl.vel.y = P.takeoffVelocity; emit('Takeoff'); }
      audio.play('boost');
    }

    if (!pl.flying) {
      // ---- ground movement
      const run = input.down('Shift');
      const speed = run ? P.runSpeed : P.walkSpeed;
      pl.vel.x += (ix * speed - pl.vel.x) * Math.min(1, dt * 10);
      pl.vel.z += (iz * speed - pl.vel.z) * Math.min(1, dt * 10);
      if (input.hit(' ') && pl.grounded) { pl.vel.y = P.jumpVelocity; pl.grounded = false; }
      pl.vel.y -= P.gravity * dt;
      pl.pos.x += pl.vel.x * dt; pl.pos.z += pl.vel.z * dt;
      pl.pos.y += pl.vel.y * dt;
      const floor = world.heightAt(pl.pos.x, pl.pos.z) + P.radius + .2;
      if (pl.pos.y <= floor) {
        if (!pl.grounded && pl.vel.y < -4) { audio.play('land'); particles.burst({x:pl.pos.x,y:floor,z:pl.pos.z}, [.6,.55,.45], 12, 4, .3, .4); }
        pl.pos.y = floor; pl.vel.y = 0; pl.grounded = true;
      }
      pl.yaw = Math.atan2(ix, iz) || pl.yaw;
      pl.pitch = 0; pl.roll = 0;
      state.anim = !pl.grounded ? 'takeoff' : Math.hypot(pl.vel.x, pl.vel.z) > P.runSpeed * .55 ? 'run' : Math.hypot(pl.vel.x, pl.vel.z) > .6 ? 'walk' : 'idle';
    } else {
      // ---- flight
      const speedMul = boosting ? P.boostMul : 1;
      const thrust = P.airAccel * speedMul;
      const dy = Math.cos(pitch);
      pl.vel.x += (ix * thrust + fx * Math.sin(pitch) * thrust * .5) * dt;
      pl.vel.z += (iz * thrust + fz * Math.sin(pitch) * thrust * .5) * dt;
      pl.vel.y += (iy * thrust * .85 + (mag > 0 ? Math.sin(pitch) * thrust * .55 : 0)) * dt;
      pl.vel.y -= P.gravity * (pl.hovering && iy === 0 ? .12 : .34) * dt;

      const damping = pl.hovering && iy === 0 ? P.hoverDamping : P.airDamping;
      const d = Math.max(0, 1 - damping * dt);
      pl.vel.x *= d; pl.vel.z *= d; pl.vel.y *= d;
      const sp = Math.hypot(pl.vel.x, pl.vel.y, pl.vel.z);
      const max = P.maxSpeed * (boosting ? 1.5 : 1);
      if (sp > max) { const k = max / sp; pl.vel.x *= k; pl.vel.y *= k; pl.vel.z *= k; }
      pl.pos.x += pl.vel.x * dt; pl.pos.y += pl.vel.y * dt; pl.pos.z += pl.vel.z * dt;

      pl.yaw = yaw; pl.pitch = clamp(pitch, -1.15, 1.15);
      const turn = clamp((yaw - this.lastYaw) / Math.max(dt, .001) * .18, -1, 1);
      this.lastYaw = yaw;
      pl.roll += (-turn * .7 - pl.roll) * Math.min(1, dt * 5);

      const floor = world.heightAt(pl.pos.x, pl.pos.z) + P.radius + .3;
      if (pl.pos.y <= floor && pl.vel.y < 0) {
        pl.pos.y = floor; pl.vel.y = 0; pl.flying = false; pl.grounded = true; pl.hovering = false;
        audio.play('land'); particles.burst({x:pl.pos.x,y:floor,z:pl.pos.z}, [.65,.6,.5], 18, 6, .35, .5);
        emit('Landing complete');
      }
      if (sp > 22 && Math.random() < Math.min(1, dt * (boosting ? 90 : 34))) {
        particles.trail({x:pl.pos.x, y:pl.pos.y + .6, z:pl.pos.z}, boosting ? [1,.62,.25] : [.45,.75,1], .3, .45);
      }
      state.anim = pl.vel.y < -9 ? 'descend' : boosting ? 'fast' : Math.abs(turn) > .45 ? 'turn'
                 : pl.hovering ? 'hover' : sp < 4 ? 'hover' : 'fly';
    }

    // world collision (cheap sphere test) and damage
    const hit = world.hitTest(pl.pos.x, pl.pos.y, pl.pos.z, P.radius);
    if (hit) {
      pl.pos.x -= pl.vel.x * dt * 1.5; pl.pos.y -= pl.vel.y * dt * 1.5; pl.pos.z -= pl.vel.z * dt * 1.5;
      pl.vel.x *= .2; pl.vel.y *= .2; pl.vel.z *= .2;
      if (Math.hypot(pl.vel.x, pl.vel.y, pl.vel.z) > 18) {
        pl.health = Math.max(0, pl.health - 6);
        pl.damageFlash = .3; audio.play('hurt');
        particles.burst({x:pl.pos.x,y:pl.pos.y,z:pl.pos.z}, [1,.4,.2], 16, 7, .35, .5);
      }
    }

    pl.speed = Math.hypot(pl.vel.x, pl.vel.y, pl.vel.z);
    pl.energy = clamp(pl.energy + dt * 9, 0, P.maxEnergy);
    pl.health = clamp(pl.health + dt * 1.2, 0, P.maxHealth);
    pl.damageFlash = Math.max(0, pl.damageFlash - dt);
    pl.age += dt;
    audio.wind(pl.speed);
    if (pl.damageFlash > 0) state.anim = 'damage';
  }
}
