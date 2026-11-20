// Procedural explorable world: authored instanced building kit, layered ground,
// parallax skyline, contact shadows, key/fill/rim lighting, water and sky shaders.
// Everything is generated at construction; update() never allocates.
import * as THREE from 'three';
import { CONFIG } from './config.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Merge small boxes into one non-indexed BufferGeometry (local boxes: w,h,d and centre x,y,z).
function mergeBoxes(boxes) {
  const src = new THREE.BoxGeometry(1, 1, 1);
  const sp = src.attributes.position, sn = src.attributes.normal, su = src.attributes.uv, idx = src.index;
  const p = [], n = [], u = [];
  for (const b of boxes) {
    for (let i = 0; i < idx.count; i++) {
      const v = idx.getX(i);
      p.push(sp.getX(v) * b.w + b.x, sp.getY(v) * b.h + b.y, sp.getZ(v) * b.d + b.z);
      n.push(sn.getX(v), sn.getY(v), sn.getZ(v));
      u.push(su.getX(v), su.getY(v));
    }
  }
  src.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
  g.computeBoundingSphere();
  return g;
}

// Three crossed blades, vertex-tinted root -> tip, one geometry for all grass.
function makeGrassGeometry() {
  const p = [], n = [], c = [];
  const blades = [
    [[-.5, 0, 0], [.5, 0, 0], [0, 1, 0]],
    [[0, 0, -.5], [0, 0, .5], [0, .9, 0]],
    [[-.42, 0, -.3], [.42, 0, .3], [0, .78, .08]],
  ];
  for (const b of blades) {
    const ax = b[1][0] - b[0][0], ay = b[1][1] - b[0][1], az = b[1][2] - b[0][2];
    const cx = b[2][0] - b[0][0], cy = b[2][1] - b[0][1], cz = b[2][2] - b[0][2];
    let nx = ay * cz - az * cy, ny = az * cx - ax * cz, nz = ax * cy - ay * cx;
    const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
    for (const v of b) {
      p.push(v[0], v[1], v[2]); n.push(nx, ny, nz);
      c.push(.09 + v[1] * .16, .24 + v[1] * .30, .07 + v[1] * .12);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.computeBoundingSphere();
  return g;
}

function makeSoftDisc() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(.55, 'rgba(255,255,255,.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Facade albedo + emissive window map: warm/cool lit windows on a panelled wall.
function makeFacadeTextures(R) {
  const W = 128, H = 256, cols = 4, rows = 12, cw = W / cols, ch = H / rows;
  const aC = document.createElement('canvas'); aC.width = W; aC.height = H;
  const eC = document.createElement('canvas'); eC.width = W; eC.height = H;
  const a = aC.getContext('2d'), e = eC.getContext('2d');
  a.fillStyle = '#2b3542'; a.fillRect(0, 0, W, H);
  e.fillStyle = '#000000'; e.fillRect(0, 0, W, H);
  a.strokeStyle = 'rgba(10,16,24,.9)'; a.lineWidth = 2;
  for (let r = 0; r <= rows; r++) { a.beginPath(); a.moveTo(0, r * ch); a.lineTo(W, r * ch); a.stroke(); }
  for (let c = 0; c <= cols; c++) { a.beginPath(); a.moveTo(c * cw, 0); a.lineTo(c * cw, H); a.stroke(); }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x0 = c * cw + cw * .18, y0 = r * ch + ch * .2, ww = cw * .64, hh = ch * .56;
    a.fillStyle = R() < .34 ? '#172636' : '#0c141e';
    a.fillRect(x0, y0, ww, hh);
    if (R() < .42) {
      e.fillStyle = R() < .76 ? '#ffd9a2' : '#a6e6ff';
      e.globalAlpha = .5 + R() * .5;
      e.fillRect(x0, y0, ww, hh);
      e.globalAlpha = 1;
    }
  }
  const albedo = new THREE.CanvasTexture(aC), emissive = new THREE.CanvasTexture(eC);
  albedo.colorSpace = emissive.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = albedo.wrapT = emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  albedo.anisotropy = 4;
  return { albedo, emissive };
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.records = [];
    this.pads = [];
    this.time = 0;
    const R = rng(90210);
    this.rand = R;

    // one shared hidden transform for destroyed / quality-culled instances
    this._hidden = new THREE.Matrix4().makeScale(.0001, .0001, .0001).setPosition(0, -9999, 0);
    this._shadowSpots = [];
    this._maxBuildings = Math.max(...Object.keys(CONFIG.quality).map(k => CONFIG.quality[k].buildings));

    scene.fog = new THREE.FogExp2(0x7fa8c6, .00085);

    // sky dome
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 20), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uSun: { value: new THREE.Vector3(.5, .22, -.84).normalize() } },
      vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vD; uniform vec3 uSun;
        void main(){
          float h=clamp(vD.y*.5+.5,0.0,1.0);
          vec3 c=mix(vec3(.58,.72,.84),vec3(.05,.17,.36),smoothstep(.47,.96,h));
          c+=vec3(1.0,.80,.60)*exp(-abs(vD.y)*8.0)*.10;
          float s=max(dot(normalize(vD),normalize(uSun)),0.0);
          c+=vec3(1.0,.78,.45)*pow(s,10.0)*.28;
          c+=vec3(1.0,.95,.82)*pow(s,600.0)*1.6;
          gl_FragColor=vec4(c,1.0);
        }`
    }));
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // terrain (heightAt is unchanged; only the colour grading is richer)
    const S = CONFIG.world.size, SEG = CONFIG.world.segments;
    const geo = new THREE.PlaneGeometry(S, S, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = this.heightAt(x, z);
      pos.setY(i, h);
      const t = THREE.MathUtils.clamp((h + 2) / 8, 0, 1);
      const v = .92 + .08 * Math.sin(x * .21) * Math.cos(z * .17);
      colors[i*3] = (.16 + t*.30) * v;
      colors[i*3+1] = (.26 + t*.25) * v;
      colors[i*3+2] = (.14 + t*.12) * v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96 }));
    this.terrain.receiveShadow = true;
    scene.add(this.terrain);

    // water: fresnel tint, drifting foam lines and a specular glint
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(S, S, 1, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uSun: { value: new THREE.Vector3(180, 260, -220).normalize() },
      },
      vertexShader: `varying vec2 vUv; varying vec3 vW; varying vec3 vWN; varying float vH;
        uniform float uTime;
        float wave(vec2 q){
          return sin(q.x*.045+uTime*1.2)*.28 + cos(q.y*.055-uTime*.9)*.22
               + sin((q.x+q.y)*.03+uTime*.7)*.14;
        }
        void main(){
          vUv=uv; vec3 p=position;
          float h=wave(p.xy); p.z+=h; vH=h;
          float e=.6;
          float hx=wave(p.xy+vec2(e,0.0))-wave(p.xy-vec2(e,0.0));
          float hy=wave(p.xy+vec2(0.0,e))-wave(p.xy-vec2(0.0,e));
          vec3 ln=normalize(vec3(-hx/(2.0*e),-hy/(2.0*e),1.0));
          vWN=normalize(mat3(modelMatrix)*ln);
          vec4 w=modelMatrix*vec4(p,1.0); vW=w.xyz;
          gl_Position=projectionMatrix*viewMatrix*w;
        }`,
      fragmentShader: `varying vec2 vUv; varying vec3 vW; varying vec3 vWN; varying float vH;
        uniform float uTime; uniform vec3 uSun;
        void main(){
          vec3 N=normalize(vWN);
          vec3 V=normalize(cameraPosition-vW);
          float fres=pow(1.0-max(dot(N,V),0.0),3.0);
          float w=sin(vW.x*.11+uTime*1.7)*.5+.5;
          float f=sin(vW.z*.15-uTime*1.3)*.5+.5;
          vec3 col=mix(vec3(.035,.16,.26),vec3(.12,.42,.52),clamp(.32+w*.34+f*.28+vH*.22,0.0,1.0));
          col=mix(col,vec3(.44,.67,.75),fres*.55);
          float foam=sin(vW.x*.21+vW.z*.06+uTime*2.2)*.5+.5;
          foam*=sin(vW.z*.27-uTime*1.4)*.5+.5;
          foam=smoothstep(.76,.93,foam+w*.08);
          col=mix(col,vec3(.80,.91,.93),foam*.55);
          vec3 L=normalize(uSun), Hh=normalize(L+V);
          float spec=pow(max(dot(N,Hh),0.0),90.0);
          col+=vec3(1.0,.92,.72)*spec*.9;
          gl_FragColor=vec4(col,.80);
        }`
    }));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = CONFIG.world.waterY;
    scene.add(this.water);

    // lighting: warm key + cool fill + cool rim; only the key casts shadows
    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x445038, .85));
    this.sun = new THREE.DirectionalLight(0xffd9a8, 2.35);
    this.sun.position.set(180, 260, -220);
    this.sun.castShadow = true;
    this.sun.shadow.camera.left = -260; this.sun.shadow.camera.right = 260;
    this.sun.shadow.camera.top = 260; this.sun.shadow.camera.bottom = -260;
    this.sun.shadow.camera.far = 900;
    this.sun.shadow.bias = -.0006;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.fill = new THREE.DirectionalLight(0x9fc4ff, .55);
    this.fill.position.set(-160, 120, 140);
    scene.add(this.fill);
    this.rim = new THREE.DirectionalLight(0x8ad4ff, .85);
    this.rim.position.set(-120, 90, -260);
    scene.add(this.rim);

    this._buildCity(R);
    this._buildTrees(R);
    this._buildGround(R);
    this._buildPads();
    this._buildLandmarks();
    this._buildBackdrop(R);
    this._buildContactShadows();
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
    const MAX = this._maxBuildings;
    const tex = makeFacadeTextures(R);
    const facade = new THREE.MeshStandardMaterial({
      color: 0xffffff, map: tex.albedo,
      emissive: 0xffffff, emissiveMap: tex.emissive, emissiveIntensity: .95,
      roughness: .72, metalness: .12,
    });
    // three authored silhouettes: setback tower, stepped ziggurat, slab + crown
    const kits = [
      mergeBoxes([
        { w: 1, h: .62, d: 1, x: 0, y: .31, z: 0 },
        { w: .72, h: .26, d: .72, x: 0, y: .75, z: 0 },
        { w: .50, h: .12, d: .50, x: 0, y: .94, z: 0 },
      ]),
      mergeBoxes([
        { w: 1, h: .40, d: 1, x: 0, y: .20, z: 0 },
        { w: .80, h: .25, d: .80, x: 0, y: .525, z: 0 },
        { w: .60, h: .20, d: .60, x: 0, y: .75, z: 0 },
        { w: .40, h: .15, d: .40, x: 0, y: .925, z: 0 },
      ]),
      mergeBoxes([
        { w: .85, h: .86, d: .70, x: 0, y: .43, z: 0 },
        { w: .92, h: .06, d: .76, x: 0, y: .89, z: 0 },
        { w: .08, h: .10, d: .08, x: 0, y: .95, z: 0 },
      ]),
    ];
    const meshes = kits.map(g => {
      const m = new THREE.InstancedMesh(g, facade, MAX);
      m.castShadow = m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      return m;
    });
    const roofGeo = mergeBoxes([
      { w: 1, h: 1, d: 1, x: 0, y: .5, z: 0 },
      { w: .5, h: .3, d: .5, x: 0, y: 1.15, z: 0 },
    ]);
    this.rooftops = new THREE.InstancedMesh(roofGeo,
      new THREE.MeshStandardMaterial({ color: 0x596877, roughness: .8, metalness: .2 }), MAX);
    this.rooftops.castShadow = true;
    this.rooftops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rooftops.frustumCulled = false;

    const o = new THREE.Object3D();
    const tint = new THREE.Color();
    const perMesh = [0, 0, 0];
    this._buildingSlots = [];
    this._roofOwners = [];
    this._roofMatrices = [];
    let placed = 0, guard = 0, roofCount = 0;
    while (placed < MAX && guard++ < 3000) {
      const x = (R() - .5) * 1500, z = (R() - .5) * 1500;
      if (Math.abs(x) < 26 && Math.abs(z) < 26) continue;
      const gy = this.heightAt(x, z);
      if (gy < CONFIG.world.waterY + .3) continue;
      const kit = placed % 3;
      const mesh = meshes[kit], idx = perMesh[kit]++;
      const h = 6 + R() * 36, w = 5 + R() * 9, dp = 5 + R() * 9;
      o.position.set(x, gy, z);
      o.rotation.set(0, R() * Math.PI * 2, 0);
      o.scale.set(w, h, dp); o.updateMatrix();
      mesh.setMatrixAt(idx, o.matrix);
      tint.setHSL(.55 + R() * .07, .14 + R() * .14, .72 + R() * .16);
      mesh.setColorAt(idx, tint);

      let roofIdx = -1;
      if (R() < .72) {
        roofIdx = roofCount++;
        o.position.set(x, gy + h * (kit === 1 ? .87 : .93), z);
        o.rotation.set(0, R() * Math.PI, 0);
        o.scale.set(w * (.22 + R() * .16), 1.1 + R() * 2.2, dp * (.22 + R() * .16));
        o.updateMatrix();
        this.rooftops.setMatrixAt(roofIdx, o.matrix);
        this._roofMatrices.push(o.matrix.clone());
        this._roofOwners.push(placed);
      }

      const slot = { mesh, idx, roofIdx, shadowIdx: -1 };
      this._buildingSlots.push(slot);
      this._addRecord({ type: 'building', index: placed, x, y: gy + h * .5, z,
        r: Math.max(w, dp) * .55, hp: 3, alive: true });
      slot.shadowIdx = this._shadowSpots.length;
      this._shadowSpots.push({ x, z, r: Math.max(w, dp) * .9, owner: placed });
      placed++;
    }
    for (let k = 0; k < 3; k++) {
      meshes[k].count = perMesh[k];
      meshes[k].instanceMatrix.needsUpdate = true;
      if (meshes[k].instanceColor) meshes[k].instanceColor.needsUpdate = true;
    }
    this.rooftops.count = roofCount;
    this.rooftops.instanceMatrix.needsUpdate = true;
    this.city = meshes[0];           // public property preserved
    this.cityMeshes = meshes;
    this.cityTotal = placed;
    this._meshSlots = perMesh;
    this.scene.add(meshes[0], meshes[1], meshes[2], this.rooftops);
  }

  _buildTrees(R) {
    const MAX = Math.max(...Object.keys(CONFIG.quality).map(k => CONFIG.quality[k].trees));
    const trunkG = new THREE.CylinderGeometry(.16, .22, 1, 6);
    const leafG = new THREE.ConeGeometry(1, 2.2, 7);
    const tm = new THREE.MeshStandardMaterial({ color: 0x4b3323, roughness: .95 });
    const lm = new THREE.MeshStandardMaterial({ color: 0x2f5b36, roughness: .9, flatShading: true });
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
      d.position.set(x, gy + s, z); d.scale.set(s, s * 2, s); d.rotation.set(0, R() * 6, 0); d.updateMatrix();
      this.trunks.setMatrixAt(placed, d.matrix);
      d.position.y = gy + 2.5 * s; d.scale.set(s * 1.5, s * 1.4, s * 1.5); d.updateMatrix();
      this.leaves.setMatrixAt(placed, d.matrix);
      placed++;
    }
    this.trunks.count = this.leaves.count = placed;
    this.treeTotal = placed;
    this.scene.add(this.trunks, this.leaves);
  }

  _buildGround(R) {
    // faceted rocks
    const rockMax = 220;
    this.rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0x8d9082, roughness: .97, flatShading: true }), rockMax);
    this.rocks.castShadow = this.rocks.receiveShadow = true;
    this.rocks.frustumCulled = false;
    // grass tufts
    const grassMax = 420;
    this.grass = new THREE.InstancedMesh(makeGrassGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }), grassMax);
    this.grass.frustumCulled = false;
    // flat ground decals (dirt patches)
    const decalMax = 150;
    this.groundDecals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: makeSoftDisc(), color: 0x4a5636, transparent: true,
        opacity: .38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      decalMax);
    this.groundDecals.frustumCulled = false;
    this.groundDecals.renderOrder = 1;

    const o = new THREE.Object3D(), tint = new THREE.Color();
    let rc = 0, gc = 0, dc = 0, guard = 0;
    while ((rc < rockMax || gc < grassMax || dc < decalMax) && guard++ < 6000) {
      const x = (R() - .5) * 1900, z = (R() - .5) * 1900;
      if (Math.abs(x) < 30 && Math.abs(z) < 30) continue;
      const gy = this.heightAt(x, z);
      if (gy < CONFIG.world.waterY + .3) continue;
      if (rc < rockMax) {
        const s = .6 + R() * 2.2;
        o.position.set(x, gy + s * .35, z);
        o.rotation.set(R() * 3, R() * 6, R() * 3);
        o.scale.set(s, s * (.55 + R() * .5), s * (.8 + R() * .4));
        o.updateMatrix(); this.rocks.setMatrixAt(rc, o.matrix);
        tint.setHSL(.22 + R() * .08, .08 + R() * .1, .55 + R() * .2);
        this.rocks.setColorAt(rc, tint); rc++;
      }
      if (gc < grassMax) {
        const s = .7 + R() * 1.5;
        o.position.set(x + (R() - .5) * 6, gy + .02, z + (R() - .5) * 6);
        o.rotation.set(0, R() * 6, 0);
        o.scale.set(s, s * (.8 + R() * .8), s);
        o.updateMatrix(); this.grass.setMatrixAt(gc, o.matrix); gc++;
      }
      if (dc < decalMax) {
        const s = 3 + R() * 9;
        o.position.set(x, gy + .05, z);
        o.rotation.set(-Math.PI / 2, 0, R() * 6);
        o.scale.set(s, s * (.6 + R() * .6), 1);
        o.updateMatrix(); this.groundDecals.setMatrixAt(dc, o.matrix); dc++;
      }
    }
    this.rocks.count = rc; this.grass.count = gc; this.groundDecals.count = dc;
    this._rockTotal = rc; this._grassTotal = gc; this._decalTotal = dc;
    this.rocks.instanceMatrix.needsUpdate = true;
    this.grass.instanceMatrix.needsUpdate = true;
    this.groundDecals.instanceMatrix.needsUpdate = true;
    if (this.rocks.instanceColor) this.rocks.instanceColor.needsUpdate = true;
    // Near-field detail around the playable corridor so the first 100 m reads authored.
    const nearGrass = 90, nearRocks = 26;
    this.nearGrass = new THREE.InstancedMesh(this.grass.geometry, this.grass.material, nearGrass);
    this.nearRocks = new THREE.InstancedMesh(this.rocks.geometry, this.rocks.material, nearRocks);
    this.nearGrass.frustumCulled = this.nearRocks.frustumCulled = false;
    this.nearRocks.castShadow = true;
    let ng = 0, nr = 0, guard2 = 0;
    while ((ng < nearGrass || nr < nearRocks) && guard2++ < 800) {
      const a = R() * Math.PI * 2, rad = 11 + R() * 68;
      const x = Math.cos(a) * rad, z = 30 + Math.sin(a) * rad;
      if (Math.hypot(x, z - 38) < 7) continue;
      const gy = this.heightAt(x, z);
      if (gy < CONFIG.world.waterY + .3) continue;
      if (ng < nearGrass) {
        const s = .9 + R() * 1.4;
        o.position.set(x, gy + .02, z); o.rotation.set(0, R() * 6, 0);
        o.scale.set(s, s * (1 + R()), s); o.updateMatrix();
        this.nearGrass.setMatrixAt(ng++, o.matrix);
      }
      if (nr < nearRocks) {
        const s = .7 + R() * 1.5;
        o.position.set(x + (R()-.5)*5, gy + s*.3, z + (R()-.5)*5);
        o.rotation.set(R()*3, R()*6, R()*3);
        o.scale.set(s, s*.6, s*.85); o.updateMatrix();
        this.nearRocks.setMatrixAt(nr++, o.matrix);
      }
    }
    this.nearGrass.count = ng; this.nearRocks.count = nr;
    this.nearGrass.instanceMatrix.needsUpdate = true;
    this.nearRocks.instanceMatrix.needsUpdate = true;
    this.scene.add(this.rocks, this.grass, this.groundDecals, this.nearGrass, this.nearRocks);
  }

  _buildPads() {
    const spots = [[0, 0], [70, 55], [-80, 90], [120, -110], [-140, -60]];
    const dm = new THREE.MeshStandardMaterial({ color: 0x283443, roughness: .6, metalness: .3 });
    const em = new THREE.MeshBasicMaterial({ color: 0xffb547 });
    this.padBases = new THREE.InstancedMesh(new THREE.CylinderGeometry(5, 5, .5, 28), dm, spots.length);
    this.padRings = new THREE.InstancedMesh(new THREE.TorusGeometry(4.4, .14, 8, 40), em, spots.length);
    this.padBases.castShadow = this.padBases.receiveShadow = true;
    const o = new THREE.Object3D();
    for (let i = 0; i < spots.length; i++) {
      const [x, z] = spots[i];
      const y = this.heightAt(x, z) + .35;
      o.position.set(x, y, z); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); o.updateMatrix();
      this.padBases.setMatrixAt(i, o.matrix);
      o.rotation.set(Math.PI / 2, 0, 0); o.position.y = y + .3; o.updateMatrix();
      this.padRings.setMatrixAt(i, o.matrix);
      this.pads.push({ x, y, z });
      this._addRecord({ type: 'pad', index: -1, x, y, z, r: 5, hp: Infinity, alive: true });
      this._shadowSpots.push({ x, z, r: 5.5, owner: -1 });
    }
    this.padBases.instanceMatrix.needsUpdate = true;
    this.padRings.instanceMatrix.needsUpdate = true;
    this.scene.add(this.padBases, this.padRings);
  }

  _buildLandmarks() {
    const m = new THREE.MeshStandardMaterial({ color: 0x6c7884, roughness: .7, metalness: .2 });
    // tower: one merged mesh instead of six boxes
    const tb = [];
    for (let i = 0; i < 6; i++) tb.push({ w: 10 - i, h: 8, d: 10 - i, x: 0, y: i * 8 + 4, z: 0 });
    const tower = new THREE.Group();
    const tMesh = new THREE.Mesh(mergeBoxes(tb), m);
    tMesh.castShadow = tMesh.receiveShadow = true;
    tower.add(tMesh);
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x2a0a04, emissive: 0xff5a2a, emissiveIntensity: 2.2, roughness: .4 }));
    this.beacon.position.y = 50;
    tower.add(this.beacon);
    tower.position.set(0, this.heightAt(0, 0), 0);
    this.scene.add(tower);
    this.tower = tower;
    this._addRecord({ type: 'tower', index: -1, x: 0, y: tower.position.y + 24, z: 0,
      r: 6, hp: Infinity, alive: true });
    this._shadowSpots.push({ x: 0, z: 0, r: 9, owner: -1 });

    // arch: one merged mesh
    const arch = new THREE.Mesh(mergeBoxes([
      { w: 3, h: 14, d: 3, x: -8, y: 7, z: 0 },
      { w: 3, h: 14, d: 3, x: 8, y: 7, z: 0 },
      { w: 19, h: 2.4, d: 3, x: 0, y: 14, z: 0 },
    ]), m);
    arch.castShadow = arch.receiveShadow = true;
    arch.position.set(250, this.heightAt(250, 250), 250);
    this.scene.add(arch);
    this.arch = arch;
    for (const s of [-1, 1]) {
      this._addRecord({ type: 'pillar', index: -1, x: s * 8 + 250, y: 7 + this.heightAt(250, 250),
        z: 250, r: 2.4, hp: Infinity, alive: true });
      this._shadowSpots.push({ x: s * 8 + 250, z: 250, r: 3.2, owner: -1 });
    }
  }

  _buildBackdrop(R) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const nearMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const farMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const layers = [
      { mesh: new THREE.InstancedMesh(box, nearMat, 110), count: 110, radius: 820, base: -8, dark: .40 },
      { mesh: new THREE.InstancedMesh(box, farMat, 100), count: 100, radius: 1320, base: -12, dark: .62 },
    ];
    const o = new THREE.Object3D(), tint = new THREE.Color();
    for (const L of layers) {
      L.mesh.frustumCulled = false;
      for (let i = 0; i < L.count; i++) {
        const a = (i / L.count) * Math.PI * 2 + (R() - .5) * .05;
        const rad = L.radius + (R() - .5) * 160;
        const h = 14 + R() * 78, w = 8 + R() * 22, d = 8 + R() * 22;
        o.position.set(Math.cos(a) * rad, L.base + h * .5, Math.sin(a) * rad);
        o.rotation.set(0, -a, 0);
        o.scale.set(w, h, d);
        o.updateMatrix(); L.mesh.setMatrixAt(i, o.matrix);
        const v = L.dark + R() * .12;
        tint.setRGB(v * .74, v * .86, v);
        L.mesh.setColorAt(i, tint);
      }
      L.mesh.count = L.count;
      L.mesh.instanceMatrix.needsUpdate = true;
      if (L.mesh.instanceColor) L.mesh.instanceColor.needsUpdate = true;
      this.scene.add(L.mesh);
    }
    this.skyline = layers[0].mesh;
    this.skylineFar = layers[1].mesh;

    // foreground speed props: thin pylons with emissive caps, clear of the origin path
    const N = 46;
    this.speedProps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x3b4855, roughness: .8, metalness: .25 }), N);
    this.speedCaps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffa23c }), N);
    this.speedProps.frustumCulled = this.speedCaps.frustumCulled = false;
    let placed = 0, guard = 0;
    while (placed < N && guard++ < 600) {
      const a = R() * Math.PI * 2, rad = 46 + R() * 150;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      const gy = this.heightAt(x, z);
      if (gy < CONFIG.world.waterY + .2) continue;
      const h = 3 + R() * 6;
      o.position.set(x, gy + h * .5, z); o.rotation.set(0, a, 0); o.scale.set(.55, h, .55);
      o.updateMatrix(); this.speedProps.setMatrixAt(placed, o.matrix);
      o.position.y = gy + h + .3; o.scale.set(1.1, .6, 1.1); o.updateMatrix();
      this.speedCaps.setMatrixAt(placed, o.matrix);
      placed++;
    }
    this.speedProps.count = this.speedCaps.count = placed;
    this.speedProps.instanceMatrix.needsUpdate = true;
    this.speedCaps.instanceMatrix.needsUpdate = true;
    this.scene.add(this.speedProps, this.speedCaps);
  }

  _buildContactShadows() {
    const n = this._shadowSpots.length;
    this.contactShadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: makeSoftDisc(), color: 0x0a160f, transparent: true,
        opacity: .55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      n);
    this.contactShadows.frustumCulled = false;
    this.contactShadows.renderOrder = 2;
    const o = new THREE.Object3D();
    this._shadowMatrices = [];
    this._shadowOwners = [];
    for (let i = 0; i < n; i++) {
      const s = this._shadowSpots[i], sz = s.r * 2.3;
      o.position.set(s.x, this.heightAt(s.x, s.z) + .06, s.z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.set(sz, sz, 1);
      o.updateMatrix();
      this._shadowMatrices.push(o.matrix.clone());
      this._shadowOwners.push(s.owner);
      this.contactShadows.setMatrixAt(i, o.matrix);
    }
    this.contactShadows.instanceMatrix.needsUpdate = true;
    this.scene.add(this.contactShadows);
  }

  _buildClouds(R) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    for (const [px, py, r] of [[64, 72, 38], [40, 74, 28], [88, 72, 30], [64, 52, 26]]) {
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(c);
    const MAX = 520;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    const off = new Float32Array(MAX * 3), scl = new Float32Array(MAX * 2), alp = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) {
      off[i*3] = (R() - .5) * 2400; off[i*3+1] = 60 + R() * 180; off[i*3+2] = (R() - .5) * 2400;
      const s = 50 + R() * 130;
      scl[i*2] = s; scl[i*2+1] = s * .45; alp[i] = .25 + R() * .3;
    }
    g.setAttribute('iOffset', new THREE.InstancedBufferAttribute(off, 3));
    g.setAttribute('iScale', new THREE.InstancedBufferAttribute(scl, 2));
    g.setAttribute('iAlpha', new THREE.InstancedBufferAttribute(alp, 1));
    g.instanceCount = MAX;
    this.clouds = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uMap: { value: tex }, uTime: { value: 0 } },
      vertexShader: `attribute vec3 iOffset; attribute vec2 iScale; attribute float iAlpha;
        uniform float uTime; varying vec2 vUv; varying float vA;
        void main(){ vec3 o=iOffset; o.x+=sin(uTime*.05+iOffset.z)*12.0;
          vec4 mv=modelViewMatrix*vec4(o,1.0); mv.xy+=position.xy*iScale;
          vUv=uv; vA=iAlpha*smoothstep(30.0,200.0,-mv.z);
          gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uMap; varying vec2 vUv; varying float vA;
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

    const N = Math.min(this._maxBuildings, q.buildings);
    for (let k = 0; k < 3; k++) {
      const want = N > k ? Math.floor((N - 1 - k) / 3) + 1 : 0;
      this.cityMeshes[k].count = Math.min(want, this._meshSlots[k]);
    }
    for (let i = 0; i < this._roofOwners.length; i++) {
      const owner = this._roofOwners[i];
      const alive = owner < N && this.records[owner] && this.records[owner].alive;
      this.rooftops.setMatrixAt(i, alive ? this._roofMatrices[i] : this._hidden);
    }
    this.rooftops.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this._shadowOwners.length; i++) {
      const owner = this._shadowOwners[i];
      const alive = owner < 0 || (owner < N && this.records[owner] && this.records[owner].alive);
      this.contactShadows.setMatrixAt(i, alive ? this._shadowMatrices[i] : this._hidden);
    }
    this.contactShadows.instanceMatrix.needsUpdate = true;

    const ratio = N / this._maxBuildings;
    this.rocks.count = Math.max(1, Math.round(this._rockTotal * ratio));
    this.grass.count = Math.max(1, Math.round(this._grassTotal * ratio));
    this.groundDecals.count = Math.max(1, Math.round(this._decalTotal * ratio));

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
    if (record.type === 'building') {
      const slot = this._buildingSlots[record.index];
      if (slot) {
        slot.mesh.setMatrixAt(slot.idx, this._hidden);
        slot.mesh.instanceMatrix.needsUpdate = true;
        if (slot.roofIdx >= 0) {
          this.rooftops.setMatrixAt(slot.roofIdx, this._hidden);
          this.rooftops.instanceMatrix.needsUpdate = true;
        }
        if (slot.shadowIdx >= 0) {
          this.contactShadows.setMatrixAt(slot.shadowIdx, this._hidden);
          this.contactShadows.instanceMatrix.needsUpdate = true;
        }
      }
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
