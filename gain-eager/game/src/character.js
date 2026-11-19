// Procedural, jointed character driven by AnimationMixer clips.
// A licensed photoreal GLB cannot be shipped here, so this is the honest
// high-detail fallback: PBR materials, modelled face, glasses, suit and
// named joints animated with real AnimationClip/AnimationAction crossfades.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function mat(color, rough = .7, metal = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
}

export class Character {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'pilotRoot';
    this.joints = {};
    this.eyeL = new THREE.Object3D();
    this.eyeR = new THREE.Object3D();
    this._v1 = new THREE.Vector3(); this._v2 = new THREE.Vector3();

    const M = {
      skin: mat(0xd9ad8c, .68, 0),
      skinShadow: mat(0xb98a6a, .8),
      hair: mat(0x302a26, .85),
      suit: mat(0x151c28, .62, .12),
      suit2: mat(0x212c3c, .68, .1),
      shirt: mat(0xe8ecf0, .82),
      tie: mat(0x5b1d22, .6),
      glass: mat(0x20262e, .18, .8),
      lens: new THREE.MeshPhysicalMaterial({ color: 0xbfe4ff, transparent: true, opacity: .32, roughness: .08, metalness: .1 }),
      eye: mat(0xf5f5f2, .3),
      pupil: mat(0x101318, .2),
      brow: mat(0x2b2420, .9),
      shoe: mat(0x0c0f14, .5, .1),
      glow: new THREE.MeshBasicMaterial({ color: 0xff5533 }),
    };
    this.M = M;

    const add = (parent, mesh, name) => { if (name) mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };
    const joint = (parent, name, x, y, z) => {
      const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g);
      this.joints[name] = g; return g;
    };
    const capsule = (parent, r, len, material, name) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(.01, len - 2*r), 6, 12), material);
      m.position.y = -len * .5; return add(parent, m, name);
    };

    // ---- torso and head
    const torso = joint(this.group, 'torso', 0, 0, 0);
    const chest = add(torso, new THREE.Mesh(new THREE.CapsuleGeometry(.26, .48, 8, 18), M.suit), 'chest');
    chest.scale.set(1.12, 1, .74);
    const belly = add(torso, new THREE.Mesh(new THREE.SphereGeometry(.23, 16, 12), M.suit), 'belly');
    belly.position.set(0, -.42, 0); belly.scale.set(1, .8, .8);
    const shirt = add(torso, new THREE.Mesh(new THREE.BoxGeometry(.26, .38, .06), M.shirt), 'shirt');
    shirt.position.set(0, .16, .2);
    const tie = add(torso, new THREE.Mesh(new THREE.BoxGeometry(.065, .34, .035), M.tie), 'tie');
    tie.position.set(0, .1, .245);
    for (const s of [-1, 1]) {
      const lapel = add(torso, new THREE.Mesh(new THREE.BoxGeometry(.09, .34, .04), M.suit2), 'lapel');
      lapel.position.set(s*.11, .13, .235); lapel.rotation.z = s*.28;
    }
    const neck = add(torso, new THREE.Mesh(new THREE.CylinderGeometry(.085, .1, .16, 12), M.skin), 'neck');
    neck.position.y = .5;

    const head = joint(torso, 'head', 0, .66, 0);
    const skull = add(head, new THREE.Mesh(new THREE.SphereGeometry(.19, 24, 20), M.skin), 'skull');
    skull.scale.set(1, 1.14, .96);
    const jaw = add(head, new THREE.Mesh(new THREE.SphereGeometry(.145, 18, 14), M.skin), 'jaw');
    jaw.position.set(0, -.11, .045); jaw.scale.set(1, .72, .92);
    for (const s of [-1, 1]) {
      const ear = add(head, new THREE.Mesh(new THREE.SphereGeometry(.042, 10, 8), M.skin), 'ear');
      ear.position.set(s*.19, -.01, 0); ear.scale.set(.6, 1, .7);
      const eyeW = add(head, new THREE.Mesh(new THREE.SphereGeometry(.052, 12, 10), M.eye), 'eyeWhite');
      eyeW.position.set(s*.073, .035, .172); eyeW.scale.set(1, .72, .5);
      const pupil = add(head, new THREE.Mesh(new THREE.SphereGeometry(.021, 10, 8), M.pupil), 'pupil');
      pupil.position.set(s*.073, .035, .205); pupil.scale.set(1, 1, .5);
      const brow = add(head, new THREE.Mesh(new THREE.BoxGeometry(.085, .016, .02), M.brow), 'brow');
      brow.position.set(s*.075, .105, .177); brow.rotation.z = s*.09;
      const frame = add(head, new THREE.Mesh(new THREE.TorusGeometry(.066, .009, 8, 20), M.glass), 'glasses');
      frame.position.set(s*.075, .035, .205);
      const lensM = add(head, new THREE.Mesh(new THREE.CircleGeometry(.061, 20), M.lens), 'lens');
      lensM.position.set(s*.075, .035, .204); lensM.castShadow = false;
      const glow = add(head, new THREE.Mesh(new THREE.SphereGeometry(.016, 8, 6), M.glow), 'eyeGlow');
      glow.position.set(s*.075, .035, .212); glow.visible = false;
      if (s < 0) this.glowL = glow; else this.glowR = glow;
      const anchor = s < 0 ? this.eyeL : this.eyeR;
      anchor.position.set(s*.075, .035, .22); head.add(anchor);
    }
    const bridge = add(head, new THREE.Mesh(new THREE.BoxGeometry(.045, .01, .012), M.glass), 'bridge');
    bridge.position.set(0, .045, .212);
    const nose = add(head, new THREE.Mesh(new THREE.ConeGeometry(.03, .12, 10), M.skin), 'nose');
    nose.rotation.x = Math.PI/2; nose.position.set(0, -.03, .2);
    const mouth = add(head, new THREE.Mesh(new THREE.BoxGeometry(.09, .012, .014), M.skinShadow), 'mouth');
    mouth.position.set(0, -.13, .172);
    const hairCap = add(head, new THREE.Mesh(new THREE.SphereGeometry(.194, 20, 14, 0, Math.PI*2, 0, Math.PI*.52), M.hair), 'hair');
    hairCap.position.y = .025; hairCap.scale.set(1, 1.06, 1);
    for (const s of [-1, 1]) {
      const temple = add(head, new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), M.hair), 'hairSide');
      temple.position.set(s*.15, .03, -.02); temple.scale.set(.7, 1.4, 1);
    }

    // ---- arms (upper and lower joints)
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'L' : 'R';
      const up = joint(torso, 'armU' + side, s*.29, .36, 0);
      capsule(up, .075, .38, M.suit, 'upperArm' + side);
      const lo = joint(up, 'armL' + side, 0, -.38, 0);
      capsule(lo, .062, .34, M.suit2, 'foreArm' + side);
      const hand = add(lo, new THREE.Mesh(new THREE.SphereGeometry(.068, 12, 10), M.skin), 'hand' + side);
      hand.position.y = -.36; hand.scale.set(.9, 1.15, .6);
    }
    // ---- legs
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'L' : 'R';
      const up = joint(this.group, 'legU' + side, s*.13, -.52, 0);
      capsule(up, .105, .46, M.suit, 'thigh' + side);
      const lo = joint(up, 'legL' + side, 0, -.46, 0);
      capsule(lo, .085, .44, M.suit2, 'shin' + side);
      const shoe = add(lo, new THREE.Mesh(new THREE.BoxGeometry(.14, .09, .26), M.shoe), 'shoe' + side);
      shoe.position.set(0, -.45, .06);
    }
    this.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    // Optional real photoportrait overlay (public-domain booking photograph).
    const FACE_PARTS = ['eyeWhite','pupil','brow','glasses','lens','eyeGlow','bridge','nose','mouth','hair','hairSide'];
    this.faceParts = [];
    this.group.traverse(o => { if (o.isMesh && FACE_PARTS.includes(o.name)) this.faceParts.push(o); });
    const faceGeo = new THREE.PlaneGeometry(.32, .40, 10, 10);
    const fa = faceGeo.attributes.position;
    for (let i = 0; i < fa.count; i++) {
      const x = fa.getX(i), y = fa.getY(i);
      fa.setZ(i, -(x*x*3.4 + y*y*1.2));
    }
    fa.needsUpdate = true; faceGeo.computeVertexNormals();
    this.photoPlane = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({
      map: null, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false
    }));
    this.photoPlane.position.set(0, .005, .205);
    this.photoPlane.visible = false;
    head.add(this.photoPlane);
    scene.add(this.group);

    this._buildClips();
    this.current = 'idle';
  }

  _buildClips() {
    const P = {
      idle:      { torso:[0,0,0], head:[0,0,0], armUL:[0,0,.12], armUR:[0,0,-.12], armLL:[-.15,0,0], armRL:[-.15,0,0], legUL:[0,0,0], legUR:[0,0,0], legLL:[0,0,0], legRL:[0,0,0] },
      walk:      { torso:[.06,0,0], head:[0,0,0], armUL:[.5,0,.14], armUR:[-.5,0,-.14], armLL:[-.35,0,0], armRL:[-.35,0,0], legUL:[-.55,0,0], legUR:[.55,0,0], legLL:[.3,0,0], legRL:[0,0,0] },
      run:       { torso:[.18,0,0], head:[-.1,0,0], armUL:[.85,0,.1], armUR:[-.85,0,-.1], armLL:[-.6,0,0], armRL:[-.6,0,0], legUL:[-.9,0,0], legUR:[.9,0,0], legLL:[.55,0,0], legRL:[.1,0,0] },
      takeoff:   { torso:[-.12,0,0], head:[-.2,0,0], armUL:[-2.3,0,.2], armUR:[-2.3,0,-.2], armLL:[-.3,0,0], armRL:[-.3,0,0], legUL:[.35,0,0], legUR:[.35,0,0], legLL:[.5,0,0], legRL:[.5,0,0] },
      hover:     { torso:[-.1,0,0], head:[0,0,0], armUL:[-1.1,0,.55], armUR:[-1.1,0,-.55], armLL:[-.25,0,0], armRL:[-.25,0,0], legUL:[.2,0,0], legUR:[.2,0,0], legLL:[.3,0,0], legRL:[.3,0,0] },
      fly:       { torso:[-.06,0,0], head:[-.08,0,0], armUL:[-1.5,0,.18], armUR:[-1.5,0,-.18], armLL:[-.12,0,0], armRL:[-.12,0,0], legUL:[.42,0,.05], legUR:[.42,0,-.05], legLL:[.16,0,0], legRL:[.16,0,0] },
      fast:      { torso:[-.3,0,0], head:[-.25,0,0], armUL:[-1.75,0,.05], armUR:[-1.75,0,-.05], armLL:[-.05,0,0], armRL:[-.05,0,0], legUL:[.62,0,0], legUR:[.62,0,0], legLL:[.1,0,0], legRL:[.1,0,0] },
      turn:      { torso:[0,.22,.16], head:[0,.3,0], armUL:[-1.2,0,.6], armUR:[-1.5,0,-.05], armLL:[-.2,0,0], armRL:[-.1,0,0], legUL:[.4,0,.1], legUR:[.4,0,-.1], legLL:[.2,0,0], legRL:[.2,0,0] },
      descend:   { torso:[.12,0,0], head:[.12,0,0], armUL:[-.7,0,.4], armUR:[-.7,0,-.4], armLL:[-.3,0,0], armRL:[-.3,0,0], legUL:[-.2,0,0], legUR:[-.2,0,0], legLL:[.1,0,0], legRL:[.1,0,0] },
      land:      { torso:[.32,0,0], head:[-.2,0,0], armUL:[-.5,0,.4], armUR:[-.5,0,-.4], armLL:[-.8,0,0], armRL:[-.8,0,0], legUL:[.55,0,0], legUR:[.55,0,0], legLL:[1.1,0,0], legRL:[1.1,0,0] },
      laser:     { torso:[-.05,0,0], head:[-.05,0,0], armUL:[-1.62,0,.08], armUR:[-1.62,0,-.08], armLL:[-.02,0,0], armRL:[-.02,0,0], legUL:[.35,0,0], legUR:[.35,0,0], legLL:[.12,0,0], legRL:[.12,0,0] },
      damage:    { torso:[.28,0,.2], head:[.22,.2,0], armUL:[-.4,0,.9], armUR:[-.6,0,-.8], armLL:[-.7,0,0], armRL:[-.5,0,0], legUL:[.2,0,.15], legUR:[.3,0,-.1], legLL:[.25,0,0], legRL:[.15,0,0] },
    };
    this.mixer = new THREE.AnimationMixer(this.group);
    this.actions = {};
    for (const [name, pose] of Object.entries(P)) {
      const tracks = [];
      const dur = name === 'idle' || name === 'fly' || name === 'hover' ? 1.6 : .9;
      for (const [joint, rot] of Object.entries(pose)) {
        for (let a = 0; a < 3; a++) {
          const wobble = (name === 'idle' && joint === 'torso' && a === 0) ? .025 :
                         (name === 'fly' && joint === 'armUL' && a === 2) ? .08 : 0;
          tracks.push(new THREE.NumberKeyframeTrack(`${joint}.rotation[${'xyz'[a]}]`,
            [0, dur*.5, dur], [rot[a], rot[a] + wobble, rot[a]]));
        }
      }
      const clip = new THREE.AnimationClip(name, dur, tracks);
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      this.actions[name] = action;
    }
    this.actions.idle.play();
    this.actions.idle.setEffectiveWeight(1);
  }

  setAnimation(name) {
    if (!this.actions[name] || name === this.current) return;
    const old = this.actions[this.current], next = this.actions[name];
    next.reset(); next.setEffectiveWeight(1); next.play();
    if (old) old.crossFadeTo(next, .28, false);
    this.current = name;
  }

  setPhoto(texture) {
    this.photoPlane.material.map = texture;
    this.photoPlane.material.needsUpdate = true;
    this.photoPlane.visible = true;
    this.faceParts.forEach(m => { m.visible = false; });
  }

  setFiring(on) {
    if (this.photoPlane && this.photoPlane.visible) return;
    this.glowL.visible = this.glowR.visible = on;
  }

  update(dt) { this.mixer.update(dt); }

  eyes(outL, outR) {
    this.group.updateWorldMatrix(true, true);
    this.eyeL.getWorldPosition(outL);
    this.eyeR.getWorldPosition(outR);
  }

  dispose() {
    this.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); } });
    Object.values(this.M).forEach(m => m.dispose());
  }
}
