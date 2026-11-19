// Ridiculous superpowers: eye lasers, blast projectiles, shockwave, blink, speed.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { emit, state } from './state.js';

const AB = CONFIG.combat;

export class Abilities {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.eyeL = new THREE.Vector3(); this.eyeR = new THREE.Vector3();
    this.dir = new THREE.Vector3(); this.tmp = new THREE.Vector3(); this.up = new THREE.Vector3(0,1,0);
    this.beams = [];
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform float uTime;
        void main(){
          float edge = abs(vUv.x-.5)*2.0;
          float core = 1.0-smoothstep(0.0,.35,edge);
          float flick = .82+.18*sin(uTime*60.0+vUv.y*40.0);
          vec3 c = mix(vec3(1.0,.18,.05),vec3(1.0,.92,.65),core);
          gl_FragColor=vec4(c, core*flick*(.85-vUv.y*.25));
        }`
    });
    this.beamMat = beamMat;
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(.085, .18, 1, 10, 1, true), beamMat);
      m.visible = false; m.frustumCulled = false; scene.add(m);
      this.beams.push(m);
    }
    // pooled projectiles
    this.shots = [];
    const shotGeo = new THREE.SphereGeometry(.75, 12, 10);
    const shotMat = new THREE.MeshBasicMaterial({ color: 0xffc266 });
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(shotGeo, shotMat); m.visible = false; scene.add(m);
      this.shots.push({ mesh: m, active: false, vel: new THREE.Vector3(), life: 0 });
    }
    // shockwave ring
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(.85, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: .9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false; scene.add(this.ring);
    this.ringT = 0;
    this.laserTimer = 0; this.beamOn = false;
  }

  _aimPoint(ctx) {
    const { camera, world } = ctx;
    camera.getWorldDirection(this.dir);
    const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
    let best = AB.laserRange;
    for (const r of world.records) {
      if (!r.alive) continue;
      const ex = r.x - ox, ey = r.y - oy, ez = r.z - oz;
      const t = ex*this.dir.x + ey*this.dir.y + ez*this.dir.z;
      if (t <= 0 || t > best) continue;
      const px = ox + this.dir.x*t, py = oy + this.dir.y*t, pz = oz + this.dir.z*t;
      const dx = r.x-px, dy = r.y-py, dz = r.z-pz;
      if (dx*dx+dy*dy+dz*dz <= r.r*r.r) best = t;
    }
    // ground plane approximation
    if (this.dir.y < -.01) {
      const t = (world.heightAt(ox,oz) - oy) / this.dir.y;
      if (t > 0 && t < best) best = t;
    }
    return this.tmp.set(ox + this.dir.x*best, oy + this.dir.y*best, oz + this.dir.z*best);
  }

  _beam(mesh, from, to) {
    const d = this.tmp.copy(to).sub(from);
    const len = d.length();
    mesh.position.copy(from).addScaledVector(d, .5);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(this.up, d.normalize());
  }

  _fireBlast(ctx) {
    if (state.cooldowns.blast > 0 || state.player.energy < AB.blastEnergy) return;
    const s = this.shots.find(x => !x.active);
    if (!s) return;
    state.cooldowns.blast = AB.blastCooldown;
    state.player.energy -= AB.blastEnergy;
    ctx.camera.getWorldDirection(this.dir);
    s.active = true; s.life = 2.4;
    s.mesh.visible = true;
    s.mesh.position.set(state.player.pos.x + this.dir.x*1.4, state.player.pos.y + 1.4 + this.dir.y*1.4, state.player.pos.z + this.dir.z*1.4);
    s.vel.copy(this.dir).multiplyScalar(AB.blastSpeed);
    ctx.audio.play('blast');
    emit('Energy blast');
  }

  _shock(ctx) {
    if (state.cooldowns.shock > 0 || state.player.energy < AB.shockEnergy) return;
    state.cooldowns.shock = AB.shockCooldown;
    state.player.energy -= AB.shockEnergy;
    this.ringT = .01; this.ring.visible = true;
    this.ring.position.set(state.player.pos.x, state.player.pos.y + 1, state.player.pos.z);
    ctx.audio.play('shock'); ctx.cameraRig.addShake(.55);
    for (const r of ctx.world.records) {
      if (!r.alive) continue;
      const dx=r.x-state.player.pos.x, dy=r.y-state.player.pos.y, dz=r.z-state.player.pos.z;
      if (dx*dx+dy*dy+dz*dz < 42*42) ctx.world.damage(r, 2, ctx.particles);
    }
    ctx.particles.burst({x:state.player.pos.x,y:state.player.pos.y+1,z:state.player.pos.z}, [.4,.8,1], 110, 22, .7, 1.1);
    emit('Shockwave');
  }

  _teleport(ctx) {
    if (state.cooldowns.teleport > 0 || state.player.energy < AB.teleportEnergy) return;
    state.cooldowns.teleport = AB.teleportCooldown;
    state.player.energy -= AB.teleportEnergy;
    const pl = state.player;
    ctx.particles.burst({x:pl.pos.x,y:pl.pos.y+1,z:pl.pos.z}, [.6,.4,1], 40, 9, .5, .6);
    ctx.camera.getWorldDirection(this.dir);
    pl.pos.x += this.dir.x * 18; pl.pos.y += this.dir.y * 12 + 2; pl.pos.z += this.dir.z * 18;
    pl.vel.x *= .4; pl.vel.y *= .4; pl.vel.z *= .4;
    ctx.particles.burst({x:pl.pos.x,y:pl.pos.y+1,z:pl.pos.z}, [.6,.4,1], 40, 9, .5, .6);
    ctx.audio.play('teleport'); emit('Blink');
  }

  update(dt, ctx) {
    const { input, state, character, world, particles, audio } = ctx;
    const pl = state.player;
    for (const k of Object.keys(state.cooldowns)) state.cooldowns[k] = Math.max(0, state.cooldowns[k] - dt);

    if (input.hit('Shift') && pl.energy >= 20 && state.cooldowns.speed <= 0) {
      state.cooldowns.speed = 2.4; pl.energy -= 20; audio.play('boost'); emit('Super speed');
    }
    if (input.hit('q')) this._shock(ctx);
    if (input.hit('e')) this._teleport(ctx);
    if (input.mouse.rightPressed) this._fireBlast(ctx);

    const holding = input.mouse.left && pl.energy >= AB.laserEnergy;
    if (holding && state.cooldowns.laser <= 0) {
      state.cooldowns.laser = AB.laserCooldown;
      pl.energy -= AB.laserEnergy;
      if (!this.beamOn) { this.beamOn = true; audio.play('laser'); emit('Laser eyes'); }
    }
    if (holding) {
      const target = this._aimPoint(ctx);
      character.eyes(this.eyeL, this.eyeR);
      this._beam(this.beams[0], this.eyeL, target);
      this._beam(this.beams[1], this.eyeR, target);
      this.beams.forEach(b => b.visible = true);
      character.setFiring(true);
      state.anim = 'laser';
      this.laserTimer -= dt;
      if (this.laserTimer <= 0) {
        this.laserTimer = .08;
        particles.burst({x:target.x,y:target.y,z:target.z}, [1,.5,.15], 12, 7, .35, .45);
        for (const r of world.records) {
          if (!r.alive) continue;
          const dx=r.x-target.x, dy=r.y-target.y, dz=r.z-target.z;
          if (dx*dx+dy*dy+dz*dz < r.r*r.r*1.5) { if (world.damage(r, 1, particles)) { audio.play('boom'); ctx.cameraRig.addShake(.4); } }
        }
      }
    } else {
      this.beamOn = false;
      this.beams.forEach(b => b.visible = false);
      character.setFiring(false);
    }
    this.beamMat.uniforms.uTime.value = state.time;

    // projectiles
    for (const s of this.shots) {
      if (!s.active) continue;
      s.life -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      particles.trail({x:s.mesh.position.x,y:s.mesh.position.y,z:s.mesh.position.z}, [1,.65,.2], .45, .35);
      let hit = null;
      for (const r of world.records) {
        if (!r.alive) continue;
        const dx=r.x-s.mesh.position.x, dy=r.y-s.mesh.position.y, dz=r.z-s.mesh.position.z;
        if (dx*dx+dy*dy+dz*dz < r.r*r.r) { hit = r; break; }
      }
      if (hit || s.life <= 0) {
        audio.play('boom'); ctx.cameraRig.addShake(.5);
        particles.burst({x:s.mesh.position.x,y:s.mesh.position.y,z:s.mesh.position.z}, [1,.55,.2], 80, 18, .9, 1.2);
        if (hit) world.damage(hit, 3, particles);
        s.active = false; s.mesh.visible = false;
      }
    }

    // shockwave expansion
    if (this.ring.visible) {
      this.ringT += dt;
      const r = this.ringT * 42;
      this.ring.scale.setScalar(r);
      this.ring.material.opacity = Math.max(0, .9 - this.ringT * 1.1);
      if (this.ringT > .9) this.ring.visible = false;
    }
  }
}
