// One pooled Points buffer for every particle effect. No per-frame allocations.
import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Particles {
  constructor(scene) {
    const N = CONFIG.particles.max;
    this.N = N; this.head = 0; this.live = 0;
    this.pos = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    this.max = new Float32Array(N);
    this.size = new Float32Array(N);
    for (let i = 0; i < N; i++) this.pos[i * 3 + 1] = -99999;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: innerHeight * .5 } },
      vertexShader: `
        attribute vec3 aColor; attribute float aLife; attribute float aSize;
        varying vec3 vC; varying float vL; uniform float uScale;
        void main(){
          vC=aColor; vL=clamp(aLife,0.0,1.0);
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * uScale / max(1.0,-mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC; varying float vL;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5,0.05,length(d)) * vL;
          if(a < 0.01) discard;
          gl_FragColor = vec4(vC,a);
        }`
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.limit = CONFIG.quality.high.particles;
  }
  spawn(x, y, z, vx, vy, vz, r, g, b, size, life) {
    const i = this.head; this.head = (this.head + 1) % this.limit;
    this.pos[i*3]=x; this.pos[i*3+1]=y; this.pos[i*3+2]=z;
    this.vel[i*3]=vx; this.vel[i*3+1]=vy; this.vel[i*3+2]=vz;
    this.col[i*3]=r; this.col[i*3+1]=g; this.col[i*3+2]=b;
    this.size[i]=size; this.life[i]=life; this.max[i]=life;
  }
  burst(p, color, count, power = 10, size = .4, life = .8) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI/2;
      const s = power * (.35 + Math.random() * .8);
      this.spawn(p.x, p.y, p.z,
        Math.cos(a)*Math.cos(b)*s, Math.sin(b)*s + power*.25, Math.sin(a)*Math.cos(b)*s,
        color[0], color[1], color[2], size*(.6+Math.random()), life*(.6+Math.random()*.7));
    }
  }
  trail(p, color, size = .22, life = .35) {
    this.spawn(p.x + (Math.random()-.5)*.3, p.y + (Math.random()-.5)*.3, p.z,
      (Math.random()-.5)*.8, (Math.random()-.5)*.8, (Math.random()-.5)*.8,
      color[0], color[1], color[2], size, life);
  }
  update(dt) {
    let live = 0;
    for (let i = 0; i < this.limit; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i*3+1] = -99999; this.life[i] = 0; continue; }
      this.pos[i*3]   += this.vel[i*3]   * dt;
      this.pos[i*3+1] += this.vel[i*3+1] * dt;
      this.pos[i*3+2] += this.vel[i*3+2] * dt;
      this.vel[i*3+1] -= 9 * dt;
      this.vel[i*3]   *= 1 - dt * .8;
      this.vel[i*3+2] *= 1 - dt * .8;
      live++;
    }
    this.live = live;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aLife.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
  resize() { this.points.material.uniforms.uScale.value = innerHeight * .5; }
}
