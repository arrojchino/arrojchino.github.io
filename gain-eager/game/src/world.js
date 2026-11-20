// Procedural explorable world: terrain, water, city, trees, clouds, pads.
// Repeated geometry uses InstancedMesh; nothing is loaded from disk.
import * as THREE from 'three';
import { CONFIG } from './config.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export class World {
  constructor(scene) {
    this.scene = scene;
    this.records = [];
    this.pads = [];
    this.time = 0;
    const R = rng(90210);
    this.rand = R;

    scene.fog = new THREE.FogExp2(0x9fc0d8, .0016);

    // sky dome
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 20), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uSun: { value: new THREE.Vector3(.5, .22, -.84).normalize() } },
      vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vD; uniform vec3 uSun;
        void main(){
          float h=clamp(vD.y*.5+.5,0.0,1.0);
          vec3 c=mix(vec3(.72,.82,.90),vec3(.05,.16,.34),smoothstep(.48,.95,h));
          float s=max(dot(normalize(vD),normalize(uSun)),0.0);
          c+=vec3(1.0,.78,.45)*pow(s,10.0)*.25;
          c+=vec3(1.0,.95,.82)*pow(s,600.0)*1.6;
          gl_FragColor=vec4(c,1.0);
        }`
    }));
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // terrain
    const S = CONFIG.world.size, SEG = CONFIG.world.segments;
    const geo = new THREE.PlaneGeometry(S, S, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = this.heightAt(x, z);
      pos.setY(i, h);
      const t = THREE.MathUtils.clamp((h + 2) / 8, 0, 1);
      colors[i*3] = .18 + t*.28; colors[i*3+1] = .27 + t*.24; colors[i*3+2] = .16 + t*.1;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96 }));
    this.terrain.receiveShadow = true;
    scene.add(this.terrain);

    // water
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(S, S, 1, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; uniform float uTime;
        void main(){ vUv=uv; vec3 p=position; p.z+=sin(p.x*.05+uTime*1.4)*.16+cos(p.y*.06-uTime)*.12;
          vec4 w=modelMatrix*vec4(p,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec2 vUv; varying vec3 vW; uniform float uTime;
        void main(){
          float w=sin(vW.x*.12+uTime*2.0)*.5+.5;
          float f=sin(vW.z*.17-uTime*1.6)*.5+.5;
          vec3 c=mix(vec3(.05,.24,.36),vec3(.14,.46,.60),w*.5+f*.5);
          gl_FragColor=vec4(c,.72);
        }`
    }));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = CONFIG.world.waterY;
    scene.add(this.water);

    // lights
    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x445038, 1.25));
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.5);
    this.sun.position.set(180, 260, -220);
    this.sun.castShadow = true;
    this.sun.shadow.camera.left = -260; this.sun.shadow.camera.right = 260;
    this.sun.shadow.camera.top = 260; this.sun.shadow.camera.bottom = -260;
    this.sun.shadow.camera.far = 900;
    this.sun.shadow.bias = -.0006;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this._buildCity(R);
    this._buildTrees(R);
    this._buildPads();
    this._buildLandmarks();
    this._buildClouds(R);
    this.setQuality('high');
  }

  heightAt(x, z) {
    return 2.2 * Math.sin(x * .011) * Math.cos(z * .013)
         + 1.4 * Math.sin(x * .027 + z * .018)
         + .8 * Math.cos(z * .031) - 1.1;
  }

  _addRecord(o) { this.records.push(o); return o; }

  _buildCity(R) {
    const MAX = 130;
    const g = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.MeshStandardMaterial({ color: 0x8e9aa6, roughness: .82, metalness: .08 });
    this.city = new THREE.InstancedMesh(g, m, MAX);
    this.city.castShadow = this.city.receiveShadow = true;
    this.city.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const dummy = new THREE.Object3D();
    let placed = 0, guard = 0;
    while (placed < MAX && guard++ < 3000) {
      const x = (R() - .5) * 1500, z = (R() - .5) * 1500;
      if (Math.abs(x) < 26 && Math.abs(z) < 26) continue;
      const h = 5 + R() * 34, w = 4 + R() * 9, d = 4 + R() * 9;
      const y = this.heightAt(x, z) + h * .5;
      dummy.position.set(x, y, z); dummy.rotation.set(0, R() * .5, 0);
      dummy.scale.set(w, h, d); dummy.updateMatrix();
      this.city.setMatrixAt(placed, dummy.matrix);
      this._addRecord({ type:'building', index:placed, x, y, z, r: Math.max(w,d)*.55, h, hp: 3, alive:true });
      placed++;
    }
    this.city.count = placed;
    this.cityTotal = placed;
    this.scene.add(this.city);
  }

  _buildTrees(R) {
    const MAX = 280;
    const trunkG = new THREE.CylinderGeometry(.16, .22, 1, 6);
    const leafG = new THREE.ConeGeometry(1, 2.2, 7);
    const tm = new THREE.MeshStandardMaterial({ color: 0x4b3323, roughness: .95 });
    const lm = new THREE.MeshStandardMaterial({ color: 0x2f5b36, roughness: .9 });
    this.trunks = new THREE.InstancedMesh(trunkG, tm, MAX);
    this.leaves = new THREE.InstancedMesh(leafG, lm, MAX);
    this.trunks.castShadow = this.leaves.castShadow = true;
    const d = new THREE.Object3D();
    let placed = 0, guard = 0;
    while (placed < MAX && guard++ < 4000) {
      const x = (R() - .5) * 1900, z = (R() - .5) * 1900;
      const gy = this.heightAt(x, z);
      if (gy < CONFIG.world.waterY + .5) continue;
      const s = .8 + R() * .9;
      d.position.set(x, gy + s, z); d.scale.set(s, s*2, s); d.rotation.set(0, R()*6, 0); d.updateMatrix();
      this.trunks.setMatrixAt(placed, d.matrix);
      d.position.y = gy + 2.5*s; d.scale.set(s*1.5, s*1.4, s*1.5); d.updateMatrix();
      this.leaves.setMatrixAt(placed, d.matrix);
      placed++;
    }
    this.trunks.count = this.leaves.count = placed;
    this.treeTotal = placed;
    this.scene.add(this.trunks, this.leaves);
  }

  _buildPads() {
    const spots = [[0,0],[70,55],[-80,90],[120,-110],[-140,-60]];
    const dm = new THREE.MeshStandardMaterial({ color: 0x283443, roughness: .6, metalness: .3 });
    const em = new THREE.MeshBasicMaterial({ color: 0xffb547 });
    for (const [x, z] of spots) {
      const y = this.heightAt(x, z) + .35;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, .5, 28), dm);
      pad.position.set(x, y, z); pad.receiveShadow = true; this.scene.add(pad);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.4, .14, 8, 40), em);
      ring.rotation.x = Math.PI/2; ring.position.set(x, y + .3, z); this.scene.add(ring);
      this.pads.push({ x, y, z });
      this._addRecord({ type:'pad', index:-1, x, y, z, r:5, hp:Infinity, alive:true });
    }
  }

  _buildLandmarks() {
    const m = new THREE.MeshStandardMaterial({ color: 0x6c7884, roughness: .7, metalness: .2 });
    const tower = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(10 - i, 8, 10 - i), m);
      b.position.y = i * 8; b.castShadow = true; tower.add(b);
    }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff5533 }));
    beacon.position.y = 50; tower.add(beacon); this.beacon = beacon;
    tower.position.set(0, this.heightAt(0, 0) + 6, 0);
    this.scene.add(tower);
    this._addRecord({ type:'tower', index:-1, x:0, y:tower.position.y+24, z:0, r:6, hp:Infinity, alive:true });
    const arch = new THREE.Group();
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(3, 14, 3), m);
      p.position.set(s*8, 7, 0); p.castShadow = true; arch.add(p);
      this._addRecord({ type:'pillar', index:-1, x:s*8+250, y:7+this.heightAt(250,250), z:250, r:2.4, hp:Infinity, alive:true });
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(19, 2.4, 3), m);
    top.position.y = 14; arch.add(top);
    arch.position.set(250, this.heightAt(250,250), 250);
    this.scene.add(arch);
  }

  _buildClouds(R) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    for (const [px,py,r] of [[64,72,38],[40,74,28],[88,72,30],[64,52,26]]) {
      const g = x.createRadialGradient(px,py,0,px,py,r);
      g.addColorStop(0,'rgba(255,255,255,.85)'); g.addColorStop(1,'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0,0,128,128);
    }
    const tex = new THREE.CanvasTexture(c);
    const MAX = 520;
    const base = new THREE.PlaneGeometry(1,1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const off = new Float32Array(MAX*3), scl = new Float32Array(MAX*2), alp = new Float32Array(MAX);
    for (let i=0;i<MAX;i++){
      off[i*3]=(R()-.5)*2400; off[i*3+1]=60+R()*180; off[i*3+2]=(R()-.5)*2400;
      const s=50+R()*130; scl[i*2]=s; scl[i*2+1]=s*.45; alp[i]=.25+R()*.3;
    }
    g.setAttribute('iOffset', new THREE.InstancedBufferAttribute(off,3));
    g.setAttribute('iScale', new THREE.InstancedBufferAttribute(scl,2));
    g.setAttribute('iAlpha', new THREE.InstancedBufferAttribute(alp,1));
    g.instanceCount = MAX;
    this.clouds = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, side:THREE.DoubleSide,
      uniforms:{ uMap:{value:tex}, uTime:{value:0} },
      vertexShader:`attribute vec3 iOffset; attribute vec2 iScale; attribute float iAlpha;
        uniform float uTime; varying vec2 vUv; varying float vA;
        void main(){ vec3 o=iOffset; o.x+=sin(uTime*.05+iOffset.z)*12.0;
          vec4 mv=modelViewMatrix*vec4(o,1.0); mv.xy+=position.xy*iScale;
          vUv=uv; vA=iAlpha*smoothstep(30.0,200.0,-mv.z);
          gl_Position=projectionMatrix*mv; }`,
      fragmentShader:`uniform sampler2D uMap; varying vec2 vUv; varying float vA;
        void main(){ float a=texture2D(uMap,vUv).a*vA; if(a<.01) discard; gl_FragColor=vec4(.92,.96,1.0,a); }`
    }));
    this.clouds.frustumCulled = false;
    this.cloudTotal = MAX;
    this.scene.add(this.clouds);
  }

  setQuality(name) {
    const q = CONFIG.quality[name] || CONFIG.quality.high;
    this.clouds.geometry.instanceCount = q.clouds;
    this.trunks.count = this.leaves.count = Math.min(this.treeTotal, q.trees);
    this.city.count = Math.min(this.cityTotal, q.buildings);
    this.sun.shadow.mapSize.set(q.shadow, q.shadow);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
  }

  // approximate sphere collision against solid structures
  hitTest(x, y, z, radius) {
    for (const r of this.records) {
      if (!r.alive) continue;
      const dx = r.x - x, dy = r.y - y, dz = r.z - z;
      const rr = r.r + radius;
      if (dx*dx + dy*dy + dz*dz < rr*rr) return r;
    }
    return null;
  }

  damage(record, amount, particles) {
    if (!record.alive || !isFinite(record.hp)) return false;
    record.hp -= amount;
    if (record.hp > 0) return false;
    record.alive = false;
    if (record.type === 'building' && record.index >= 0) {
      const d = new THREE.Object3D();
      d.position.set(record.x, -9999, record.z); d.scale.set(.001,.001,.001); d.updateMatrix();
      this.city.setMatrixAt(record.index, d.matrix);
      this.city.instanceMatrix.needsUpdate = true;
    }
    if (particles) particles.burst({x:record.x,y:record.y,z:record.z}, [1,.55,.2], 90, 24, 1.1, 1.5);
    return true;
  }

  update(dt, cameraPos) {
    this.time += dt;
    this.water.material.uniforms.uTime.value = this.time;
    this.clouds.material.uniforms.uTime.value = this.time;
    this.sky.position.copy(cameraPos);
    this.beacon.scale.setScalar(1 + Math.sin(this.time * 3) * .18);
  }
}
