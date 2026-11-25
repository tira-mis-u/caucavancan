// player.js — nhân vật ngư dân, di chuyển, camera, thuyền, bị kéo xuống nước, đánh nhau với cá, bắn cá
(function () {
  const G = window.G;
  const U = G.util;
  const V3 = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const clamp = G.util.clamp;
  const TAU = Math.PI * 2;

  const P = (G.player = {
    obj: null, pos: null, facing: 0, hand: null, locked: false,
    cameraFocus: null, cameraYaw: 0, cameraPitch: 0.32, cameraDist: 7,
    boat: null, combat: null, anim: 'idle', onGround: true, swimming: false,
  });

  // ======================================================================
  // Helpers an toàn
  // ======================================================================
  const W = () => G.world || {};
  function groundH(x, z) { const w = W(); try { return w.groundHeight ? w.groundHeight(x, z) : 0; } catch (e) { return 0; } }
  function waterH(x, z) {
    const w = W();
    try { if (w.getWaterHeight) return w.getWaterHeight(x, z); if (w.getWaterLevel) return w.getWaterLevel(); } catch (e) { /* */ }
    return -1e6;
  }
  function isWater(x, z) { const w = W(); try { return w.isWater ? !!w.isWater(x, z) : false; } catch (e) { return false; } }
  function depthAt(x, z) { if (!isWater(x, z)) return 0; return Math.max(0, waterH(x, z) - groundH(x, z)); }
  function fx(name) {
    const f = G.fx && G.fx[name];
    if (typeof f === 'function') { try { return f.apply(G.fx, Array.prototype.slice.call(arguments, 1)); } catch (e) { console.warn('[player fx]', e); } }
  }
  function sfx(name, opts) { try { if (G.audio && G.audio.play) G.audio.play(name, opts); } catch (e) { /* */ } }
  function toast(msg, type) { try { if (G.ui && G.ui.toast) G.ui.toast(msg, type || 'info'); } catch (e) { /* */ } }
  function envId() { const c = W().current; return (c && c.id) || G.state.env; }
  function getBounds() { const w = W(); try { return w.getBounds ? w.getBounds() : null; } catch (e) { return null; } }
  function clampBounds(v, m) {
    const b = getBounds(); if (!b) return false;
    m = m || 1;
    const x = clamp(v.x, b.minX + m, b.maxX - m), z = clamp(v.z, b.minZ + m, b.maxZ - m);
    const hit = x !== v.x || z !== v.z;
    v.x = x; v.z = z;
    return hit;
  }
  function inBounds(x, z, m) { const b = getBounds(); if (!b) return true; m = m || 1; return x > b.minX + m && x < b.maxX - m && z > b.minZ + m && z < b.maxZ - m; }
  const dampAngle = G.util.dampAngle;
  function getSpawn() {
    const w = W();
    try { const s = w.getSpawn && w.getSpawn(); if (s) return s.clone ? s.clone() : V3(s.x, s.y, s.z); } catch (e) { /* */ }
    return V3(0, groundH(0, 0), 0);
  }
  const tmpV = V3(), tmpV2 = V3(), tmpM = new THREE.Matrix4();

  // ---------- Vật lý (G.physics) ----------
  const PH = () => G.physics || null;
  const STEP = 1 / 60;
  const PLAYER_R = 0.35, STEP_UP = 0.4;
  function fallbackStepper() {
    return { acc: 0, alpha: 0, advance(dt) { if (!(dt > 0)) return 0; this.acc += Math.min(dt, STEP * 5); let n = 0; while (this.acc >= STEP - 1e-7 && n < 5) { this.acc -= STEP; n++; } if (this.acc < 0) this.acc = 0; this.alpha = clamp(this.acc / STEP, 0, 1); return n; }, reset() { this.acc = 0; this.alpha = 0; } };
  }
  let stepper = null;
  function getStepper() { if (!stepper) stepper = (G.physics && G.physics.makeStepper) ? G.physics.makeStepper(STEP, 5) : fallbackStepper(); return stepper; }
  const camHit = V3();
  // đẩy điểm (x,z) ra khỏi collider; trả về true nếu chạm (pháp tuyến ở G.physics.lastNormal)
  function collide(v, r, y, h) { const ph = PH(); if (!ph || !ph.resolveCircle) return false; try { return ph.resolveCircle(v, r, y, h); } catch (e) { return false; } }
  function colliderFloor(x, z, y) { const ph = PH(); if (!ph || !ph.floorAt) return -Infinity; try { return ph.floorAt(x, z, y, STEP_UP); } catch (e) { return -Infinity; } }

  // ---------- Sàn máy bay ----------
  const deckRay = new THREE.Raycaster();
  const DOWN = V3(0, -1, 0);
  function getDeck() {
    const d = W().planeDeck;
    if (!d || !d.isObject3D || envId() !== 'airplane') return null;
    return d;
  }
  function deckFloor(x, z, y) {
    const d = getDeck(); if (!d) return null;
    const dp = d.getWorldPosition(tmpV2);
    if (y < dp.y - 40) return null;
    deckRay.set(tmpV.set(x, y + 1.2, z), DOWN);
    deckRay.far = 60;
    deckRay.camera = G.camera;
    let hits;
    try { hits = deckRay.intersectObject(d, true); } catch (e) { return null; }
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      if (!h.object.isMesh || h.object.visible === false) continue;
      if (h.point.y <= y + 0.6) return h.point.y;
    }
    return null;
  }

  // ======================================================================
  // Nhân vật
  // ======================================================================
  const J = {};
  const props = {};
  function mat(color, o) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0 }, o || {})); }
  function mesh(geo, m, x, y, z, parent) {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x || 0, y || 0, z || 0);
    o.castShadow = true;
    if (parent) parent.add(o);
    return o;
  }
  function grp(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(g); return g; }

  function buildCharacter() {
    const root = new THREE.Group();
    root.name = 'player';
    root.rotation.order = 'YXZ';
    const skin = mat(0xc98d5a), shirt = mat(0x6e4a2c), shirtDark = mat(0x5a3b22), pants = mat(0x242424);
    const sandal = mat(0x7a4a22), hatM = mat(0xe6cf8f, { roughness: 0.95, side: THREE.DoubleSide }), hatLine = mat(0xb08f4c);
    const black = mat(0x151515), white = mat(0xf0f0f0), scarf = mat(0x3b3b3b), belt = mat(0x3a2414);

    const body = grp(root, 0, 0.95, 0); J.body = body;
    mesh(new THREE.BoxGeometry(0.34, 0.2, 0.22), pants, 0, -0.03, 0, body);
    const beltM = mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.05, 14), belt, 0, 0.07, 0, body); beltM.scale.z = 0.7;

    const spine = grp(body, 0, 0.08, 0); J.spine = spine;
    const chest = grp(spine, 0, 0, 0); J.chest = chest;
    const torso = mesh(new THREE.CylinderGeometry(0.205, 0.175, 0.52, 14), shirt, 0, 0.26, 0, chest); torso.scale.z = 0.72;
    for (let i = 0; i < 4; i++) mesh(new THREE.SphereGeometry(0.013, 6, 4), white, 0, 0.1 + i * 0.1, 0.138, chest);
    mesh(new THREE.BoxGeometry(0.1, 0.09, 0.012), shirtDark, 0.09, 0.14, 0.132, chest);
    mesh(new THREE.BoxGeometry(0.1, 0.09, 0.012), shirtDark, -0.09, 0.14, 0.132, chest);
    // cổ + khăn rằn
    mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 8), skin, 0, 0.56, 0, chest);
    const sc = mesh(new THREE.TorusGeometry(0.085, 0.032, 6, 14), scarf, 0, 0.53, 0, chest); sc.rotation.x = Math.PI / 2;
    // đầu
    const head = grp(chest, 0, 0.6, 0); J.head = head;
    const hd = mesh(new THREE.SphereGeometry(0.125, 16, 12), skin, 0, 0.12, 0, head); hd.scale.set(0.95, 1.08, 1);
    mesh(new THREE.SphereGeometry(0.016, 6, 4), black, 0.045, 0.145, 0.108, head);
    mesh(new THREE.SphereGeometry(0.016, 6, 4), black, -0.045, 0.145, 0.108, head);
    mesh(new THREE.BoxGeometry(0.045, 0.012, 0.01), black, 0.046, 0.175, 0.112, head);
    mesh(new THREE.BoxGeometry(0.045, 0.012, 0.01), black, -0.046, 0.175, 0.112, head);
    mesh(new THREE.SphereGeometry(0.024, 6, 5), skin, 0, 0.11, 0.125, head);
    mesh(new THREE.BoxGeometry(0.085, 0.016, 0.02), black, 0, 0.075, 0.115, head);
    mesh(new THREE.SphereGeometry(0.03, 6, 5), skin, 0.118, 0.12, 0, head);
    mesh(new THREE.SphereGeometry(0.03, 6, 5), skin, -0.118, 0.12, 0, head);
    // nón lá
    const hat = grp(head, 0, 0.2, 0);
    mesh(new THREE.ConeGeometry(0.34, 0.24, 24, 1, true), hatM, 0, 0.12, 0, hat);
    for (const f of [0.25, 0.5, 0.75]) {
      const r = mesh(new THREE.TorusGeometry(0.34 * (1 - f), 0.005, 4, 24), hatLine, 0, f * 0.24, 0, hat);
      r.rotation.x = Math.PI / 2;
    }
    const rim = mesh(new THREE.TorusGeometry(0.338, 0.008, 4, 28), hatLine, 0, 0.002, 0, hat); rim.rotation.x = Math.PI / 2;
    const strap = mesh(new THREE.TorusGeometry(0.13, 0.006, 4, 16, Math.PI), black, 0, 0.01, 0.0, head);
    strap.position.y = 0.16; strap.rotation.z = Math.PI;

    // tay
    function arm(side) {
      const sh = grp(chest, 0.235 * side, 0.47, 0);
      mesh(new THREE.SphereGeometry(0.075, 10, 8), shirt, 0, 0, 0, sh);
      mesh(new THREE.CylinderGeometry(0.066, 0.058, 0.3, 10), shirt, 0, -0.15, 0, sh);
      const el = grp(sh, 0, -0.29, 0);
      mesh(new THREE.SphereGeometry(0.05, 8, 6), skin, 0, 0, 0, el);
      mesh(new THREE.CylinderGeometry(0.048, 0.041, 0.25, 8), skin, 0, -0.125, 0, el);
      const hand = grp(el, 0, -0.27, 0);
      const fist = mesh(new THREE.SphereGeometry(0.055, 8, 6), skin, 0, 0, 0.01, hand); fist.scale.set(0.85, 1, 1.1);
      mesh(new THREE.SphereGeometry(0.022, 5, 4), skin, 0.04 * side, 0.01, 0.035, hand);
      return { sh, el, hand };
    }
    const la = arm(1), ra = arm(-1);
    J.lSh = la.sh; J.lEl = la.el; J.rSh = ra.sh; J.rEl = ra.el;
    P.hand = ra.hand; P.hand.name = 'playerHand';
    J.lHand = la.hand;

    // chân (quần xắn, dép tổ ong)
    function leg(side) {
      const hip = grp(body, 0.1 * side, -0.06, 0);
      mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.44, 10), pants, 0, -0.21, 0, hip);
      const knee = grp(hip, 0, -0.42, 0);
      mesh(new THREE.SphereGeometry(0.068, 8, 6), pants, 0, 0, 0, knee);
      mesh(new THREE.CylinderGeometry(0.07, 0.064, 0.2, 10), pants, 0, -0.09, 0, knee);
      mesh(new THREE.CylinderGeometry(0.047, 0.04, 0.24, 8), skin, 0, -0.29, 0, knee);
      const ank = grp(knee, 0, -0.41, 0);
      mesh(new THREE.BoxGeometry(0.08, 0.06, 0.17), skin, 0, -0.02, 0.035, ank);
      mesh(new THREE.BoxGeometry(0.1, 0.022, 0.25), sandal, 0, -0.05, 0.03, ank);
      const st = mesh(new THREE.BoxGeometry(0.09, 0.02, 0.03), sandal, 0, -0.01, 0.07, ank); st.rotation.x = 0.3;
      return { hip, knee, ank };
    }
    const ll = leg(1), rl = leg(-1);
    J.lHip = ll.hip; J.lKnee = ll.knee; J.lAnk = ll.ank; J.rHip = rl.hip; J.rKnee = rl.knee; J.rAnk = rl.ank;

    // đạo cụ trên tay phải
    props.bottle = grp(P.hand, 0, -0.03, 0.05);
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.17, 10), mat(0x2f7a3a, { roughness: 0.3, transparent: true, opacity: 0.85 }), 0, 0, 0, props.bottle);
    mesh(new THREE.CylinderGeometry(0.014, 0.03, 0.08, 8), mat(0x2f7a3a, { roughness: 0.3 }), 0, 0.12, 0, props.bottle);
    mesh(new THREE.BoxGeometry(0.072, 0.06, 0.072), mat(0xeec04a), 0, 0, 0, props.bottle);
    props.bottle.rotation.x = 1.2;
    props.banhmi = grp(P.hand, 0, -0.04, 0.08);
    const bm = mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.26, 10), mat(0xd9a048), 0, 0, 0, props.banhmi); bm.rotation.z = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.046, 8, 6), mat(0xd9a048), 0.13, 0, 0, props.banhmi);
    mesh(new THREE.SphereGeometry(0.041, 8, 6), mat(0xd9a048), -0.13, 0, 0, props.banhmi);
    props.sling = grp(P.hand, 0, -0.02, 0.04);
    const wood = mat(0x7a5230);
    const hdl = mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.14, 6), wood, 0, 0, 0, props.sling); hdl.rotation.x = Math.PI / 2;
    const p1 = mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.12, 6), wood, 0.035, 0.04, 0.1, props.sling); p1.rotation.set(Math.PI / 2 - 0.5, 0, -0.5);
    const p2 = mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.12, 6), wood, -0.035, 0.04, 0.1, props.sling); p2.rotation.set(Math.PI / 2 - 0.5, 0, 0.5);
    mesh(new THREE.BoxGeometry(0.13, 0.008, 0.008), mat(0xcc3333), 0, 0.08, 0.13, props.sling);
    props.bottle.visible = props.banhmi.visible = props.sling.visible = false;

    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    return root;
  }

  // ======================================================================
  // Hoạt ảnh thủ tục (pose = tập góc khớp, nội suy mượt)
  // ======================================================================
  const KEYS = ['by', 'bpx', 'bry', 'brz', 'sx', 'sy', 'sz', 'hx', 'hy', 'lsx', 'lsy', 'lsz', 'lex', 'rsx', 'rsy', 'rsz', 'rex', 'lhx', 'lhz', 'lkx', 'rhx', 'rhz', 'rkx', 'lax', 'rax'];
  const LEG_KEYS = ['by', 'lhx', 'lhz', 'lkx', 'rhx', 'rhz', 'rkx', 'lax', 'rax'];
  function B(o) {
    const p = { by: 0, bpx: 0, bry: 0, brz: 0, sx: 0, sy: 0, sz: 0, hx: 0, hy: 0, lsx: 0, lsy: 0, lsz: 0.08, lex: -0.15, rsx: 0, rsy: 0, rsz: -0.08, rex: -0.15, lhx: 0, lhz: 0, lkx: 0, rhx: 0, rhz: 0, rkx: 0, lax: 0, rax: 0 };
    return o ? Object.assign(p, o) : p;
  }
  const ss = U.smoothstep, lerp = U.lerp;
  function envelope(u, a, b) { return u < a ? ss(0, a, u) : u > b ? 1 - ss(b, 1, u) : 1; }
  const ANIMS = {
    idle(c) {
      const b = Math.sin(c.t * 2) * 0.5 + 0.5;
      return B({ sx: 0.02 * b, lsz: 0.1 + 0.025 * b, rsz: -0.1 - 0.025 * b, lex: -0.2, rex: -0.2, hy: Math.sin(c.t * 0.4) * 0.18, hx: Math.sin(c.t * 0.7) * 0.04, lhz: 0.04, rhz: -0.04 });
    },
    guard(c) {
      const b = Math.sin(c.t * 7);
      return B({ by: -0.06 + 0.02 * b, sx: 0.14, lsx: -1.0, lex: -1.9, rsx: -0.85, rex: -2.0, lsz: 0.18, rsz: -0.18, lhx: -0.3, lkx: 0.35, rhx: 0.2, rkx: 0.3, lhz: 0.08, rhz: -0.08, sy: 0.15 });
    },
    walk(c) {
      const s = Math.sin(c.ph), co = Math.cos(c.ph);
      return B({ lhx: -0.5 * s, rhx: 0.5 * s, lkx: 0.08 + 0.8 * Math.max(0, co), rkx: 0.08 + 0.8 * Math.max(0, -co),
        lax: -0.2 * Math.max(0, co), rax: -0.2 * Math.max(0, -co),
        by: 0.035 * Math.abs(co) - 0.035, lsx: 0.45 * s, rsx: -0.45 * s, lex: -0.3, rex: -0.3, sy: 0.1 * s, sx: 0.05, hy: -0.05 * s });
    },
    run(c) {
      const s = Math.sin(c.ph), co = Math.cos(c.ph);
      return B({ lhx: -0.95 * s - 0.1, rhx: 0.95 * s - 0.1, lkx: 0.2 + 1.3 * Math.max(0, co), rkx: 0.2 + 1.3 * Math.max(0, -co),
        by: 0.07 * Math.abs(co) - 0.09, lsx: 0.9 * s, rsx: -0.9 * s, lex: -1.3, rex: -1.3, lsz: 0.15, rsz: -0.15, sy: 0.18 * s, sx: 0.28, hx: -0.15 });
    },
    swim(c) {
      const s = Math.sin(c.sw), co = Math.cos(c.sw), f = Math.sin(c.sw * 2.5);
      return B({ bpx: 1.35, hx: -1.05, lsx: -1.6 - 1.5 * s, rsx: -1.6 + 1.5 * s, lsz: 0.25 + 0.25 * Math.max(0, co), rsz: -0.25 - 0.25 * Math.max(0, -co),
        lex: -0.45 * Math.max(0, co), rex: -0.45 * Math.max(0, -co), lhx: 0.35 * f, rhx: -0.35 * f, lkx: 0.25, rkx: 0.25, sy: 0.22 * s, brz: 0.12 * s });
    },
    tread(c) {
      const s = Math.sin(c.t * 3);
      return B({ bpx: 0.15, hx: -0.1, lsx: -0.45, rsx: -0.45, lsz: 0.9 + 0.35 * s, rsz: -0.9 - 0.35 * s, lex: -0.35, rex: -0.35,
        lhx: -0.5 + 0.4 * s, rhx: -0.5 - 0.4 * s, lkx: 0.8 + 0.3 * s, rkx: 0.8 - 0.3 * s });
    },
    cast(c) {
      const u = c.u, stance = { lhx: -0.35, lkx: 0.25, rhx: 0.2, rkx: 0.15, by: -0.03 };
      if (u < 0.4) {
        const a = ss(0, 0.4, u);
        return B(Object.assign({ rsx: lerp(-0.3, -3.3, a), rex: -0.6 * a, sx: -0.22 * a, lsx: -1.0 * a, lex: -0.6, hx: -0.15 * a, sy: 0.25 * a }, stance));
      }
      const b = ss(0.4, 0.72, u);
      return B(Object.assign({ rsx: lerp(-3.3, -1.0, b), rex: lerp(-0.6, -0.1, b), sx: lerp(-0.22, 0.3, b), lsx: -1.0, lex: -0.6, sy: lerp(0.25, -0.2, b), hx: 0.1 * b }, stance));
    },
    reel(c) {
      const w = c.t * 13;
      return B({ rsx: -0.95, rex: -0.55, rsz: -0.05, lsx: -0.85 + 0.22 * Math.sin(w), lex: -1.1 + 0.3 * Math.cos(w), lsz: -0.1, sx: 0.12, hx: 0.15, lhx: -0.2, lkx: 0.15, rhx: 0.15, rkx: 0.1 });
    },
    pull(c) {
      const tr = Math.sin(c.t * 31) * 0.03;
      return B({ sx: -0.38 + tr, bpx: -0.08, rsx: -1.4 + tr, lsx: -1.3 - tr, rex: -0.3, lex: -0.35, lhx: -0.45, lkx: 0.35, rhx: 0.3, rkx: 0.45, by: -0.1, hx: -0.15, lax: 0.2 });
    },
    fall(c) {
      const t = c.t;
      return B({ lsx: -2.5 + Math.sin(t * 14) * 0.8, lsz: 0.8 + Math.sin(t * 9) * 0.3, rsx: -2.5 + Math.cos(t * 13) * 0.8, rsz: -0.8 - Math.cos(t * 10) * 0.3,
        lex: -0.5, rex: -0.5, lhx: Math.sin(t * 11) * 0.7, rhx: -Math.sin(t * 11) * 0.7, lkx: 0.6 + Math.sin(t * 9) * 0.3, rkx: 0.6 - Math.sin(t * 9) * 0.3, hx: -0.35, sx: -0.15 });
    },
    drink(c) {
      const e = envelope(c.u, 0.22, 0.82), tip = envelope(c.u, 0.35, 0.75);
      return B({ rsx: -1.25 * e, rsz: 0.3 * e, rex: -1.95 * e - 0.15, hx: -0.55 * tip, sx: -0.1 * tip, lsz: 0.2, lex: -0.3 });
    },
    eat(c) {
      const e = envelope(c.u, 0.2, 0.85);
      return B({ rsx: -1.15 * e, rsz: 0.3 * e, rex: -2.0 * e - 0.15 + 0.15 * Math.sin(c.t * 12) * e, lsx: -0.9 * e, lex: -1.6 * e - 0.15, lsz: -0.15 * e, hx: 0.08 * Math.sin(c.t * 14) * e + 0.1 * e });
    },
    attack(c) {
      const u = c.u, ext = u < 0.35 ? ss(0, 0.35, u) : 1 - ss(0.45, 1, u);
      const stance = { lhx: -0.3, lkx: 0.3, rhx: 0.2, rkx: 0.25, by: -0.05, sx: 0.12 };
      if (c.v === 2) {
        return B({ rhx: -1.5 * ext, rkx: 1.0 * (1 - ext) + 0.05, lkx: 0.2, lhx: 0.1, sx: -0.3 * ext, lsx: -0.9, lex: -1.8, rsx: -0.6, rex: -1.8, lsz: 0.6 * ext + 0.15, rsz: -0.6 * ext - 0.15, by: -0.05 });
      }
      if (c.v === 1) {
        return B(Object.assign({ rsx: -0.6 - 0.95 * ext, rex: -1.8 + 1.7 * ext, rsz: -0.1 + 0.18 * ext, sy: 0.45 * ext, lsx: -0.9, lex: -2.0, lsz: 0.15 }, stance));
      }
      return B(Object.assign({ lsx: -0.6 - 0.95 * ext, lex: -1.8 + 1.7 * ext, lsz: 0.1 - 0.18 * ext, sy: -0.45 * ext, rsx: -0.9, rex: -2.0, rsz: -0.15 }, stance));
    },
    hit(c) {
      const r = Math.sin(clamp(c.u, 0, 1) * Math.PI);
      return B({ sx: -0.4 * r, hx: -0.4 * r, lsz: 0.6 * r + 0.08, rsz: -0.6 * r - 0.08, lsx: -0.5 * r, rsx: -0.5 * r, by: -0.06 * r, lkx: 0.25 * r, rkx: 0.25 * r });
    },
    shoot(c) {
      const k = c.kick;
      return B({ rsx: -1.5 - 0.35 * k, rex: -0.05, rsz: 0.12, lsx: -1.45 - 0.1 * k, lex: -0.45, lsz: -0.3, sy: 0.15, sx: -0.05 * k, hx: 0.05, lhx: -0.15, lkx: 0.1, rhx: 0.12 });
    },
    sit() {
      return B({ by: -0.5, lhx: -1.45, rhx: -1.45, lkx: 1.45, rkx: 1.45, lhz: 0.08, rhz: -0.08, sx: 0.1, lsx: -0.5, rsx: -0.5, lex: -0.6, rex: -0.6 });
    },
    jump() {
      return B({ lhx: -0.7, lkx: 1.1, rhx: -0.25, rkx: 0.6, lsx: -0.5, rsx: -0.5, lsz: 0.5, rsz: -0.5, lex: -0.6, rex: -0.6 });
    },
    roll() {
      return B({ lhx: -1.8, rhx: -1.8, lkx: 2.0, rkx: 2.0, sx: 0.8, hx: 0.5, lsx: -1.2, rsx: -1.2, lex: -1.5, rex: -1.5, by: -0.35 });
    },
    dead() {
      return B({ by: -0.8, bpx: -1.5, lsz: 1.2, rsz: -1.2, hx: -0.2, lhz: 0.15, rhz: -0.15, lex: -0.3, rex: -0.3 });
    },
  };
  const UPPER = { cast: 1, reel: 1, pull: 1, drink: 1, eat: 1, attack: 1, hit: 1, shoot: 1 };
  const DEFAULT_DUR = { cast: 0.8, drink: 1.6, eat: 1.6, attack: 0.4, hit: 0.4 };
  const HOLD_BREAKABLE = { reel: 1, pull: 1, sit: 1, fall: 1, idle: 1, walk: 1, run: 1, swim: 1, shoot: 1 };

  // ======================================================================
  // Trạng thái runtime
  // ======================================================================
  const S = {
    vel: V3(), onGround: true, airTime: 0, swimming: false, phase: 0, swimPhase: 0, speed: 0, inputMoving: false,
    targetFacing: 0, override: null, pose: null, flight: null, dodge: null, iframes: 0,
    deckMat: null, onDeck: false, rescueT: 0, stumbleT: 3, rippleT: 0, camSnap: true,
    atkCd: 0, combo: 0, comboT: 0, pendingHit: null, shootCd: 0, shootKick: 0, shootPrev: 'explore',
    deadT: 0, spinX: 0, exhaustedToast: 0, boatHintT: 0, boatHinted: false, lastStep: 0, lastSwim: 0, airplaneFall: false,
    // vật lý bước cố định + nội suy
    simPos: V3(), prevPos: V3(), renderPos: V3(), renderValid: false, snap: false, visYOff: 0,
    jumpBuf: 0, dodgeBuf: 0, coyote: 0, jumpArc: false, camBoom: -1,
  };
  let C = null; // combat
  const dying = [];
  const projectiles = [];
  const camTarget = V3();
  let camDistSm = 7, fovSm = 60;

  // ======================================================================
  // API hoạt ảnh
  // ======================================================================
  P.setAnim = function (name, seconds, variant) {
    if (!name || name === 'auto') { S.override = null; return; }
    if (!ANIMS[name]) return;
    const dur = seconds != null && seconds > 0 ? seconds : (seconds === 0 ? 0 : DEFAULT_DUR[name] || 0);
    S.override = { name, k: 0, dur, variant: variant || 0 };
  };

  function updateAnim(dt, t) {
    const st = G.state, mode = st.mode, sp = S.speed;
    let auto;
    if (mode === 'dead' || S.deadT > 0) auto = 'dead';
    else if (S.flight) auto = 'fall';
    else if (S.dodge) auto = 'roll';
    else if (P.boat) auto = 'sit';
    else if (S.swimming) auto = sp > 0.5 ? 'swim' : 'tread';
    else if (!S.onGround && S.airTime > 0.2) auto = (S.vel.y < -9 && S.airTime > 0.7) ? 'fall' : 'jump';
    else if (mode === 'shoot') auto = 'shoot';
    else if (sp > 4.6) auto = 'run';
    else if (sp > 0.35) auto = 'walk';
    else auto = mode === 'combat' ? 'guard' : 'idle';

    // pha bước chân
    if (auto === 'walk' || auto === 'run' || (auto === 'shoot' && sp > 0.35) || (sp > 0.35 && S.onGround && !S.swimming && !P.boat)) {
      const prev = Math.floor(S.phase / Math.PI);
      S.phase += dt * sp * (sp > 4.6 ? 2.7 : 3.6);
      if (Math.floor(S.phase / Math.PI) !== prev && S.onGround && !S.swimming) sfx('footstep', { volume: sp > 4.6 ? 0.6 : 0.35 });
    }
    if (S.swimming) {
      const prev = Math.floor(S.swimPhase / TAU);
      S.swimPhase += dt * (sp > 0.5 ? 5.5 : 2.5);
      if (Math.floor(S.swimPhase / TAU) !== prev && sp > 0.5) sfx('swim', { volume: 0.5 });
    }

    let ov = S.override;
    if (ov) {
      ov.k += dt;
      if (ov.dur > 0 && ov.k >= ov.dur) S.override = ov = null;
      else if (ov.dur === 0 && HOLD_BREAKABLE[ov.name] && S.inputMoving && !P.locked) S.override = ov = null;
    }
    let name = auto;
    const priority = auto === 'dead' || (auto === 'fall' && S.flight) || auto === 'roll';
    if (ov && !priority) name = ov.name;
    S.shootKick = Math.max(0, S.shootKick - dt * 6);
    const ctx = { t, k: ov ? ov.k : 0, u: ov && ov.dur > 0 ? ov.k / ov.dur : clamp(ov ? ov.k : 0, 0, 1), ph: S.phase, sw: S.swimPhase, sp, v: ov ? ov.variant : 0, kick: S.shootKick };
    const target = ANIMS[name](ctx);
    if (UPPER[name]) {
      let legs = null;
      if (P.boat) legs = ANIMS.sit(ctx);
      else if (S.swimming) legs = ANIMS.tread(ctx);
      else if (sp > 0.35 && S.onGround) legs = ANIMS[sp > 4.6 ? 'run' : 'walk'](ctx);
      if (legs) for (const k of LEG_KEYS) target[k] = legs[k];
      if (S.swimming) target.bpx = 0.15;
    }
    // say: lắc lư
    const dr = st.drunk || 0;
    if (dr > 0.02 && !S.swimming && name !== 'dead') { target.brz += Math.sin(t * 1.3) * 0.1 * dr; target.sx += Math.sin(t * 0.9) * 0.08 * dr; target.hx += Math.sin(t * 1.7) * 0.1 * dr; }

    if (!S.pose) S.pose = B();
    const cur = S.pose;
    const a = 1 - Math.exp(-(name === 'attack' || name === 'cast' ? 22 : 13) * dt);
    for (const k of KEYS) cur[k] += (target[k] - cur[k]) * a;
    applyPose(cur, t);

    props.bottle.visible = name === 'drink';
    props.banhmi.visible = name === 'eat';
    props.sling.visible = mode === 'shoot';
    P.anim = name;
  }

  function applyPose(p, t) {
    let extraPitch = 0, extraY = 0;
    if (S.dodge) { const u = clamp(S.dodge.k / S.dodge.dur, 0, 1); extraPitch = u * TAU; extraY = -0.25 * Math.sin(u * Math.PI); }
    if (S.flight) extraPitch = S.spinX;
    J.body.position.y = 0.95 + p.by + extraY;
    J.body.rotation.set(p.bpx + extraPitch, p.bry, p.brz);
    J.spine.rotation.set(p.sx, p.sy, p.sz);
    J.head.rotation.set(p.hx, p.hy, 0);
    J.lSh.rotation.set(p.lsx, p.lsy, p.lsz); J.lEl.rotation.x = p.lex;
    J.rSh.rotation.set(p.rsx, p.rsy, p.rsz); J.rEl.rotation.x = p.rex;
    J.lHip.rotation.set(p.lhx, 0, p.lhz); J.lKnee.rotation.x = p.lkx; J.lAnk.rotation.x = p.lax;
    J.rHip.rotation.set(p.rhx, 0, p.rhz); J.rKnee.rotation.x = p.rkx; J.rAnk.rotation.x = p.rax;
    const br = 1 + 0.015 * Math.sin(t * 2);
    J.chest.scale.set(br, 1, br);
  }

  // ======================================================================
  // Di chuyển
  // ======================================================================
  P.getAimDirection = function () { return V3(Math.sin(P.cameraYaw), 0, Math.cos(P.cameraYaw)); };

  function readMoveInput(canInput) {
    const k = G.input.keys;
    let ix = 0, iz = 0;
    if (canInput) {
      if (k.KeyW || k.ArrowUp) iz += 1;
      if (k.KeyS || k.ArrowDown) iz -= 1;
      if (k.KeyA || k.ArrowLeft) ix -= 1;
      if (k.KeyD || k.ArrowRight) ix += 1;
    }
    const yaw = P.cameraYaw;
    let mx = Math.sin(yaw) * iz - Math.cos(yaw) * ix, mz = Math.cos(yaw) * iz + Math.sin(yaw) * ix;
    const ml = Math.hypot(mx, mz);
    if (ml > 0.01) { mx /= ml; mz /= ml; }
    return { mx, mz, moving: ml > 0.01 };
  }

  // Đọc input dạng "nhấn" 1 lần mỗi frame vào bộ đệm (vì có thể chạy 0 hoặc nhiều bước vật lý / frame)
  function bufferFrameInput(dt, blocked) {
    const inp = G.input, mode = G.state.mode;
    if (blocked || P.locked) return;
    if (inp.pressed('Space')) S.jumpBuf = 0.15;
    if (mode === 'combat' && (inp.pressed('ShiftLeft') || inp.pressed('ShiftRight'))) S.dodgeBuf = 0.12;
  }

  // Một bước vật lý cố định (dt = STEP) cho người chơi đi bộ / bơi / rơi
  function updateMove(dt, t, blocked) {
    const st = G.state, mode = st.mode, k = G.input.keys, pos = P.obj.position;
    const canInput = !blocked && !P.locked && mode !== 'dead' && mode !== 'menu' && mode !== 'fight';
    let { mx, mz, moving } = readMoveInput(canInput);
    S.inputMoving = moving;
    const dr = st.drunk || 0;
    if (moving && dr > 0.05) {
      const a = Math.sin(t * 1.7) * 0.6 * dr + Math.sin(t * 4.3 + 1) * 0.3 * dr;
      const c = Math.cos(a), s = Math.sin(a);
      const nx = mx * c + mz * s, nz = -mx * s + mz * c; mx = nx; mz = nz;
    }
    const shift = k.ShiftLeft || k.ShiftRight;
    S.jumpBuf = Math.max(0, S.jumpBuf - dt);
    S.dodgeBuf = Math.max(0, S.dodgeBuf - dt);
    // né (combat)
    if (mode === 'combat' && canInput && S.dodgeBuf > 0 && !S.dodge && st.stamina >= 12 && S.onGround && !S.swimming) {
      S.dodgeBuf = 0;
      let dx = mx, dz = mz;
      if (!moving) { dx = -Math.sin(P.facing); dz = -Math.cos(P.facing); }
      S.dodge = { dx, dz, k: 0, dur: 0.5 };
      S.iframes = 0.55;
      st.stamina = Math.max(0, st.stamina - 12);
      sfx('whoosh');
    }
    let run = canInput && shift && st.stamina > 1 && moving && mode !== 'combat' && mode !== 'shoot';
    let maxSp;
    if (S.swimming) maxSp = run ? 3.4 : 2.1;
    else if (mode === 'shoot') maxSp = 2.2;
    else if (mode === 'combat') maxSp = 4.2;
    else maxSp = run ? (st.wanted > 0.3 && mode === 'explore' ? 7.8 : 7.0) : 4.0;
    const gHere = groundH(pos.x, pos.z);
    const wading = !S.swimming && isWater(pos.x, pos.z) && waterH(pos.x, pos.z) - gHere > 0.35 && pos.y < waterH(pos.x, pos.z);
    if (wading) maxSp *= 0.65;
    if (run) st.stamina = Math.max(0, st.stamina - (S.swimming ? 9 : 11) * dt);
    if (S.swimming && moving) st.stamina = Math.max(0, st.stamina - 2.5 * dt);
    if (S.swimming && st.stamina <= 0) {
      st.hp = Math.max(0, st.hp - 1.5 * dt);
      S.exhaustedToast -= dt;
      if (S.exhaustedToast <= 0) { S.exhaustedToast = 6; toast('Kiệt sức! Bơi vào bờ nhanh lên!', 'bad'); }
    }

    // độ dốc địa hình (gradient) tại chỗ đứng: chậm lại khi leo, không leo được vách quá dốc
    let gx = 0, gz = 0, slope = 0;
    if (S.onGround && !S.swimming && !S.onDeck) {
      const e = 0.35;
      gx = (groundH(pos.x + e, pos.z) - groundH(pos.x - e, pos.z)) / (2 * e);
      gz = (groundH(pos.x, pos.z + e) - groundH(pos.x, pos.z - e)) / (2 * e);
      slope = Math.hypot(gx, gz);
    }

    // vận tốc ngang: gia tốc / giảm tốc có giới hạn (không đổi vận tốc tức thời)
    if (S.dodge) {
      S.dodge.k += dt;
      const sp = 7.5 * (1 - 0.5 * S.dodge.k / S.dodge.dur);
      S.vel.x = S.dodge.dx * sp; S.vel.z = S.dodge.dz * sp;
      if (S.dodge.k >= S.dodge.dur) S.dodge = null;
    } else {
      let tx = moving ? mx * maxSp : 0, tz = moving ? mz * maxSp : 0;
      if (slope > 0.05 && moving) {
        const up = (mx * gx + mz * gz) / slope; // >0: đang leo dốc
        if (up > 0) { const f = clamp(1 - up * Math.max(0, slope - 0.25) * 0.45, 0.35, 1); tx *= f; tz *= f; }
      }
      let accel, decel;
      if (S.swimming) { accel = 6; decel = 4; }
      else if (S.onGround) { accel = wading ? 22 : 45; decel = wading ? 26 : 38; }
      else { accel = 9; decel = 1.5; } // điều khiển trên không hạn chế
      const dvx = tx - S.vel.x, dvz = tz - S.vel.z, dl = Math.hypot(dvx, dvz);
      if (dl > 1e-6) {
        // tăng tốc khi cùng hướng, phanh khi ngược hướng / thả phím
        const along = moving ? (S.vel.x * tx + S.vel.z * tz) : -1;
        const lim = (moving && along >= 0 ? accel : Math.max(accel, decel)) * dt;
        const m = Math.min(1, lim / dl);
        S.vel.x += dvx * m; S.vel.z += dvz * m;
      }
      // trượt khỏi vách quá dốc
      if (slope > 1.25 && !wading) {
        const ux = gx / slope, uz = gz / slope;
        const vUp = S.vel.x * ux + S.vel.z * uz;
        if (vUp > 0) { S.vel.x -= ux * vUp; S.vel.z -= uz * vUp; }
        S.vel.x -= ux * 6 * dt; S.vel.z -= uz * 6 * dt;
      }
    }

    // vấp khi say
    if (dr > 0.3 && moving && S.onGround && !S.swimming && mode !== 'combat') {
      S.stumbleT -= dt;
      if (S.stumbleT <= 0) {
        S.stumbleT = U.rand(2.5, 6) / dr;
        const side = Math.random() < 0.5 ? -1 : 1;
        S.vel.x += -mz * side * 3.5 * dr; S.vel.z += mx * side * 3.5 * dr;
        P.setAnim('hit', 0.35);
        if (Math.random() < 0.3) toast(U.pick(['Ối... lảo đảo!', 'Hic! Say quá...', 'Đường gì mà nghiêng thế này...', 'Đất đang xoay hay mình xoay?']), 'warn');
      }
    }

    // nhảy: coyote time (vừa rời mép vẫn nhảy được) + bộ đệm nhảy (nhấn sớm trước khi chạm đất)
    if (S.onGround) S.coyote = 0.12; else S.coyote = Math.max(0, S.coyote - dt);
    if (canInput && S.jumpBuf > 0 && (S.onGround || S.coyote > 0) && !S.swimming && (mode === 'explore' || mode === 'combat' || mode === 'shoot')) {
      S.vel.y = 7; S.onGround = false; S.airTime = 0.01; S.jumpBuf = 0; S.coyote = 0; S.jumpArc = true;
    }

    let nx = pos.x + S.vel.x * dt, nz = pos.z + S.vel.z * dt;
    // khi cầm cần: không tự lội ra chỗ sâu
    if ((mode === 'fishing' || mode === 'fight') && !S.swimming && depthAt(nx, nz) > 1.1 && deckFloor(nx, nz, pos.y) === null) {
      nx = pos.x; nz = pos.z; S.vel.x = S.vel.z = 0;
    }
    // va chạm collider tĩnh (nhà, cây, đá, NPC...). Vật thấp hơn STEP_UP thì bước qua / đứng lên.
    tmpV2.set(nx, 0, nz);
    if (collide(tmpV2, PLAYER_R, pos.y + STEP_UP, 1.8 - STEP_UP)) {
      const n = G.physics.lastNormal;
      const vn = S.vel.x * n.x + S.vel.z * n.z;
      if (vn < 0) { S.vel.x -= n.x * vn; S.vel.z -= n.z * vn; } // trượt dọc tường
      if (S.dodge) { const dn = S.dodge.dx * n.x + S.dodge.dz * n.z; if (dn < 0) { S.dodge.dx -= n.x * dn; S.dodge.dz -= n.z * dn; } }
    }
    if (clampBounds(tmpV2, 1)) { S.vel.x *= 0.2; S.vel.z *= 0.2; }
    nx = tmpV2.x; nz = tmpV2.z;

    const g = groundH(nx, nz);
    const deckY = deckFloor(nx, nz, pos.y);
    let floor = g;
    if (deckY !== null && deckY > floor) floor = deckY;
    const cf = colliderFloor(nx, nz, pos.y);
    if (cf > floor) floor = cf;
    const wet = isWater(nx, nz);
    const water = wet ? waterH(nx, nz) : -1e6;
    const depth = wet ? water - g : 0;
    let ny = pos.y;

    if (!S.swimming) {
      if (wet && depth > 1.2 && pos.y < water - 0.55 && (deckY === null || deckY < water) && cf < water - 0.5) {
        enterSwim(nx, nz, water);
      }
    } else if (!wet || depth < 1.0 || floor > water - 0.95) {
      S.swimming = false;
      S.vel.y = 0;
    }

    if (S.swimming) {
      S.jumpArc = false;
      let ty = water - 1.0 + Math.sin(t * 2.2) * 0.05;
      if (canInput && k.Space) ty += 0.3;
      // lò xo nổi + cản nước
      S.vel.y += ((ty - pos.y) * 14 - S.vel.y * 5) * dt;
      ny = pos.y + S.vel.y * dt;
      if (ny < g + 0.05) { ny = g + 0.05; S.vel.y = Math.max(0, S.vel.y); }
      S.onGround = false; S.airTime = 0;
      S.rippleT -= dt;
      if (S.rippleT <= 0 && ny > water - 1.4) { S.rippleT = S.speed > 0.5 ? 0.45 : 1.1; fx('ripple', V3(nx, water, nz), S.speed > 0.5 ? 0.7 : 0.4); }
      if (envId() === 'airplane') {
        S.rescueT += dt;
        if (S.rescueT > 8) {
          S.rescueT = 0;
          P.teleport(getSpawn());
          toast('Đội cứu hộ đã kéo bạn trở lại máy bay!', 'good');
          return;
        }
      }
    } else {
      // trọng lực: cú nhảy dùng trọng lực "game" (gọn, chắc tay); rơi tự do dùng trọng lực thật + cản không khí
      if (S.jumpArc && S.vel.y < -12) S.jumpArc = false;
      if (S.jumpArc) S.vel.y -= 24 * dt;
      else {
        const vt = 55, kd = 9.81 / (vt * vt);
        S.vel.y += (-9.81 + kd * S.vel.y * S.vel.y * (S.vel.y < 0 ? 1 : -1)) * dt;
      }
      if (S.vel.y < -60) S.vel.y = -60;
      ny = pos.y + S.vel.y * dt;
      if (ny <= floor) {
        const impact = -S.vel.y;
        if (!S.onGround && impact > 13) {
          const dmg = Math.round((impact - 13) * 3);
          st.hp = Math.max(0, st.hp - dmg);
          fx('shake', 0.5, 0.4); sfx('hit');
          fx('floatText', V3(nx, floor + 2, nz), '-' + dmg, '#ff5555');
          P.setAnim('hit', 0.5);
        }
        // bước lên bậc thấp: dịch hình ảnh mượt thay vì giật
        if (S.onGround && floor - pos.y > 0.12 + slope * S.speed * dt) S.visYOff -= Math.min(STEP_UP, floor - pos.y);
        ny = floor; S.vel.y = 0; S.onGround = true; S.jumpArc = false;
      } else if (S.onGround && S.vel.y <= 0 && ny - floor < 0.4 + Math.min(0.3, slope * S.speed * dt * 2)) {
        // bám mặt đất khi đi xuống dốc / bậc nhỏ (không bị "bay" lắt nhắt)
        if (pos.y - floor > 0.12 + slope * S.speed * dt) S.visYOff += Math.min(STEP_UP, pos.y - floor);
        ny = floor; S.vel.y = 0;
      } else S.onGround = false;
      S.airTime = S.onGround ? 0 : S.airTime + dt;
      if (wading && S.speed > 0.6) {
        S.rippleT -= dt;
        if (S.rippleT <= 0) { S.rippleT = 0.35; fx('ripple', V3(nx, water, nz), 0.5); }
      }
    }
    S.onDeck = S.onGround && deckY !== null && Math.abs(floor - deckY) < 1e-4;
    pos.set(nx, ny, nz);
    S.speed = Math.hypot(S.vel.x, S.vel.z);
    if (S.speed < 0.05 && !moving) { S.speed = 0; if (S.onGround && !S.dodge) S.vel.x = S.vel.z = 0; }

    // hướng nhìn
    if (mode === 'shoot') S.targetFacing = P.cameraYaw;
    else if (S.dodge) S.targetFacing = Math.atan2(S.dodge.dx, S.dodge.dz);
    else if (mode === 'combat' && C && !moving) { const m = C.model.position; S.targetFacing = Math.atan2(m.x - pos.x, m.z - pos.z); }
    else if (moving) S.targetFacing = Math.atan2(mx, mz);
    P.facing = dampAngle(P.facing, S.targetFacing, mode === 'shoot' ? 20 : 11, dt);
    P.obj.rotation.set(0, P.facing, 0);

    // đồng bộ mode
    if (S.swimming && (mode === 'explore' || mode === 'shoot' || mode === 'fishing')) G.setMode('swim');
    if (!S.swimming && mode === 'swim') G.setMode('explore');
    if (!S.swimming) S.rescueT = 0;
  }

  // Chạy các bước cố định cho người chơi rồi nội suy vị trí hiển thị giữa 2 bước (mượt ở mọi tần số màn hình)
  function runWalk(dt, t, blocked) {
    const pos = P.obj.position;
    // module khác ghi thẳng vào vị trí (teleport, systems...) → đồng bộ lại, không nội suy
    if (!S.renderValid || pos.x !== S.renderPos.x || pos.y !== S.renderPos.y || pos.z !== S.renderPos.z) {
      S.simPos.copy(pos); S.prevPos.copy(pos); S.visYOff = 0;
    }
    pos.copy(S.simPos);
    bufferFrameInput(dt, blocked);
    const stp = getStepper();
    const n = stp.advance(dt);
    S.snap = false;
    for (let i = 0; i < n; i++) {
      S.prevPos.copy(pos);
      updateMove(STEP, t - (n - 1 - i) * STEP, blocked);
      if (S.flight || P.boat) break;
    }
    S.simPos.copy(pos);
    if (S.snap || S.flight || P.boat) { S.prevPos.copy(pos); S.visYOff = 0; }
    if (P.boat || S.flight) { S.renderValid = false; return; }
    pos.lerpVectors(S.prevPos, S.simPos, stp.alpha);
    S.visYOff *= Math.exp(-16 * dt);
    if (Math.abs(S.visYOff) < 1e-3) S.visYOff = 0;
    pos.y += S.visYOff;
    S.renderPos.copy(pos); S.renderValid = true;
  }

  function enterSwim(x, z, water) {
    const pos = P.obj.position;
    const fast = S.vel.y < -9;
    S.swimming = true;
    if (fast) {
      fx('splash', V3(x, water, z), S.vel.y < -25 ? 3.5 : 1.6);
      sfx(S.vel.y < -20 ? 'bigsplash' : 'splash');
      if (S.vel.y < -25) fx('shake', 0.6, 0.6);
      fx('bubbles', V3(x, water - 1.5, z), 20);
    } else {
      fx('ripple', V3(x, water, z), 0.8); sfx('splash', { volume: 0.4 });
    }
    S.vel.y *= 0.2;
    if (pos.y < water - 3) S.vel.y = Math.max(S.vel.y, 2);
    if (envId() === 'airplane') {
      S.rescueT = 0;
      toast('Bạn rơi khỏi máy bay! Nhấn M để bay lại — hoặc chờ 8 giây đội cứu hộ.', 'warn');
    }
  }

  // ======================================================================
  // Bị cá kéo xuống nước
  // ======================================================================
  function onDragged(d) {
    if (S.flight || G.state.mode === 'dead') return;
    const pos = P.obj.position;
    let focus = P.cameraFocus;
    if (!(focus && focus.isVector3) && G.fishing) {
      const f = G.fishing;
      focus = (f.bobberPos && f.bobberPos.isVector3 && f.bobberPos) || (f.bobber && f.bobber.position && f.bobber.isObject3D && f.bobber.getWorldPosition(V3())) || null;
    }
    const dir = V3();
    if (focus && focus.isVector3) dir.set(focus.x - pos.x, 0, focus.z - pos.z);
    if (dir.lengthSq() < 0.01) dir.copy(P.getAimDirection());
    dir.normalize();
    if (P.boat) removeBoat();
    if (G.state.mode === 'shoot') exitShoot();
    let tgt = null;
    for (let s = 2; s <= 60; s += 1) {
      const x = pos.x + dir.x * s, z = pos.z + dir.z * s;
      if (depthAt(x, z) > 1.6) {
        const x2 = x + dir.x * 4, z2 = z + dir.z * 4;
        tgt = depthAt(x2, z2) > 1.6 ? V3(x2, 0, z2) : V3(x, 0, z);
        break;
      }
    }
    if (!tgt) tgt = V3(pos.x + dir.x * 8, 0, pos.z + dir.z * 8);
    clampBounds(tgt, 2);
    const wet = isWater(tgt.x, tgt.z);
    tgt.y = wet ? waterH(tgt.x, tgt.z) - 0.9 : groundH(tgt.x, tgt.z);
    const dist = pos.distanceTo(tgt);
    S.flight = { from: pos.clone(), to: tgt, k: 0, dur: clamp(0.9 + dist * 0.025, 1, 3.5), arc: Math.min(8, 3 + dist * 0.2), dir, wet, catchInfo: d && d.catchInfo };
    S.spinX = 0;
    S.swimming = false; S.vel.set(0, 0, 0);
    P.locked = false;
    P.facing = S.targetFacing = Math.atan2(dir.x, dir.z);
    sfx('whoosh'); sfx('roar', { volume: 0.5 });
    fx('shake', 0.4, 0.5);
  }

  function updateFlight(dt, t) {
    const f = S.flight, pos = P.obj.position;
    f.k += dt;
    const u = Math.min(1, f.k / f.dur);
    pos.lerpVectors(f.from, f.to, u);
    pos.y += f.arc * 4 * u * (1 - u);
    S.spinX = u * TAU * 1.0 + Math.sin(t * 9) * 0.2;
    P.obj.rotation.set(0, P.facing, 0);
    S.speed = 0; S.inputMoving = false;
    if (u >= 1) {
      S.flight = null; S.spinX = 0;
      P.cameraFocus = null;
      const st = G.state;
      st.hp = Math.max(1, st.hp - 8);
      fx('splash', V3(pos.x, waterH(pos.x, pos.z), pos.z), 3);
      fx('shake', 0.8, 0.6);
      sfx('bigsplash');
      fx('floatText', V3(pos.x, pos.y + 2.5, pos.z), '-8', '#ff5555');
      if (f.wet) {
        S.swimming = true; S.vel.set(0, -1, 0);
        G.setMode('swim');
        if (envId() === 'airplane') { S.rescueT = 0; toast('Nhấn M để bay lại — hoặc chờ 8 giây đội cứu hộ.', 'warn'); }
      } else {
        S.onGround = true; S.vel.set(0, 0, 0);
        if (G.state.mode !== 'explore') G.setMode('explore');
      }
    }
  }

  // ======================================================================
  // Sàn máy bay: đi theo chuyển động của planeDeck
  // ======================================================================
  function trackDeck() {
    const d = getDeck();
    if (!d) { S.deckMat = null; return; }
    d.updateMatrixWorld(true);
    if (S.deckMat && S.onDeck && !S.flight && !P.boat) {
      tmpM.copy(S.deckMat).invert().premultiply(d.matrixWorld);
      const wasValid = S.renderValid && P.obj.position.equals(S.renderPos);
      P.obj.position.applyMatrix4(tmpM);
      camTarget.applyMatrix4(tmpM);
      // giữ trạng thái bước cố định đồng bộ với sàn đang di chuyển
      S.simPos.applyMatrix4(tmpM); S.prevPos.applyMatrix4(tmpM);
      if (wasValid) S.renderPos.copy(P.obj.position);
    }
    if (!S.deckMat) S.deckMat = new THREE.Matrix4();
    S.deckMat.copy(d.matrixWorld);
  }

  // ======================================================================
  // Thuyền
  // ======================================================================
  let weaveTex = null;
  function getWeaveTex() {
    if (weaveTex) return weaveTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    c.fillStyle = '#3b2a18'; c.fillRect(0, 0, 64, 64);
    c.strokeStyle = '#5c4426'; c.lineWidth = 3;
    for (let i = 0; i < 64; i += 8) {
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 64, 64); c.stroke();
      c.beginPath(); c.moveTo(i, 64); c.lineTo(i + 64, 0); c.stroke();
      c.beginPath(); c.moveTo(i - 64, 0); c.lineTo(i, 64); c.stroke();
      c.beginPath(); c.moveTo(i - 64, 64); c.lineTo(i, 0); c.stroke();
    }
    weaveTex = new THREE.CanvasTexture(cv);
    weaveTex.wrapS = weaveTex.wrapT = THREE.RepeatWrapping;
    weaveTex.repeat.set(6, 3);
    return weaveTex;
  }

  function hullOutline(L, Wd) {
    const s = new THREE.Shape(), hl = L / 2, hw = Wd / 2;
    s.moveTo(0, -hl);
    s.quadraticCurveTo(hw, -hl + L * 0.12, hw, -hl + L * 0.38);
    s.lineTo(hw, hl - L * 0.08);
    s.quadraticCurveTo(hw, hl, hw * 0.6, hl);
    s.lineTo(-hw * 0.6, hl);
    s.quadraticCurveTo(-hw, hl, -hw, hl - L * 0.08);
    s.lineTo(-hw, -hl + L * 0.38);
    s.quadraticCurveTo(-hw, -hl + L * 0.12, 0, -hl);
    return s;
  }
  function makeHull(L, Wd, H, color, innerColor, floorH, wall) {
    const g = new THREE.Group();
    wall = wall || 0.07;
    const outer = hullOutline(L, Wd);
    outer.holes.push(hullOutline(L - wall * 3, Wd - wall * 2));
    const geo = new THREE.ExtrudeGeometry(outer, { depth: H, bevelEnabled: false, curveSegments: 8 });
    geo.rotateX(-Math.PI / 2);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i), k = 0.68 + 0.32 * clamp(y / H, 0, 1);
      pa.setX(i, pa.getX(i) * k); pa.setZ(i, pa.getZ(i) * (0.9 + 0.1 * clamp(y / H, 0, 1)));
    }
    geo.computeVertexNormals();
    const hm = mesh(geo, mat(color, { roughness: 0.7, side: THREE.DoubleSide }), 0, 0, 0, g);
    hm.receiveShadow = true;
    if (floorH === null || floorH === undefined) return g;
    const kf = 0.68 + 0.32 * clamp(floorH / H, 0, 1);
    const fgeo = new THREE.ExtrudeGeometry(hullOutline((L - wall * 3) * (0.9 + 0.1 * floorH / H), (Wd - wall * 2) * kf), { depth: 0.08, bevelEnabled: false, curveSegments: 8 });
    fgeo.rotateX(-Math.PI / 2);
    const fm = mesh(fgeo, mat(innerColor, { roughness: 0.9 }), 0, floorH, 0, g);
    fm.receiveShadow = true;
    return g;
  }

  function buildBoat(data) {
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    const id = data.id;
    const r = { obj: g, seat: V3(), len: data.size || 3, wid: 1.6, draft: 0.25, kind: 'row', spinner: null, oars: [], prop: null };
    const brown = mat(0x6b4220), rope = mat(0xc9b27a);
    if (id === 'boat_raft') {
      r.len = 2.7; r.wid = 1.7; r.draft = 0.06; r.kind = 'row';
      const logM = mat(data.color || 0xc8b16a), logM2 = mat(0xa8a058);
      for (let i = 0; i < 7; i++) {
        const lg = mesh(new THREE.CylinderGeometry(0.12, 0.13, 2.6 + (i % 2) * 0.15, 8), i % 2 ? logM2 : logM, -0.72 + i * 0.24, 0.03, 0, g);
        lg.rotation.x = Math.PI / 2;
      }
      for (const z of [-0.9, 0, 0.9]) mesh(new THREE.BoxGeometry(1.75, 0.06, 0.12), brown, 0, 0.17, z, g);
      for (const z of [-0.9, 0.9]) for (const x of [-0.7, 0.7]) { const rp = mesh(new THREE.TorusGeometry(0.14, 0.02, 4, 8), rope, x, 0.1, z, g); rp.rotation.y = Math.PI / 2; }
      const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6), mat(0x9fae5a), 0.6, 0.9, -0.6, g); pole.rotation.set(0.5, 0, -0.3);
      r.seat.set(0, 0.2, -0.3);
    } else if (id === 'boat_basket') {
      r.len = 2.1; r.wid = 2.1; r.draft = 0.3; r.kind = 'basket';
      const spinner = new THREE.Group(); g.add(spinner); r.spinner = spinner;
      const pts = [];
      for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.001, 1.0 * Math.sin(a)), -0.5 * Math.cos(a))); }
      const bowl = mesh(new THREE.LatheGeometry(pts, 28), new THREE.MeshStandardMaterial({ color: 0xffffff, map: getWeaveTex(), roughness: 0.95, side: THREE.DoubleSide }), 0, 0.1, 0, spinner);
      bowl.receiveShadow = true;
      const rimT = mesh(new THREE.TorusGeometry(1.0, 0.06, 6, 32), mat(0x2a1d10), 0, 0.1, 0, spinner); rimT.rotation.x = Math.PI / 2;
      const pad = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6), brown, 0.75, 0.4, 0.2, spinner); pad.rotation.set(0.3, 0, 0.9);
      mesh(new THREE.BoxGeometry(0.12, 0.02, 0.4), brown, 1.45, 0.0, 0.3, spinner);
      r.seat.set(0, 0.02, 0);
    } else if (id === 'boat_motor') {
      r.len = 5; r.wid = 1.9; r.draft = 0.32; r.kind = 'motor';
      const hull = makeHull(5, 1.9, 0.85, data.color || 0xf2f2f2, 0x9fb7c9, 0.12, 0.07); hull.position.y = -0.32; g.add(hull);
      const stripe = makeHull(5.04, 1.94, 0.1, 0xcc2222, 0xcc2222, null, 0.02); stripe.position.y = 0.25; stripe.scale.set(0.995, 1, 0.995); g.add(stripe);
      const ws = mesh(new THREE.BoxGeometry(1.5, 0.42, 0.04), mat(0x88ccff, { transparent: true, opacity: 0.45, roughness: 0.1 }), 0, 0.72, 0.8, g); ws.rotation.x = -0.45;
      mesh(new THREE.BoxGeometry(0.6, 0.45, 0.4), mat(0xdddddd), 0, 0.3, 0.45, g);
      mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 12), mat(0x222222), 0, 0.6, 0.35, g).rotation.x = -0.6;
      mesh(new THREE.BoxGeometry(0.9, 0.4, 0.5), mat(0x1f4f7a), 0, 0.0, -0.9, g);
      const ob = grp(g, 0, 0.35, -2.55);
      mesh(new THREE.BoxGeometry(0.36, 0.55, 0.42), mat(0x2b2b2b, { metalness: 0.3 }), 0, 0.1, 0, ob);
      mesh(new THREE.BoxGeometry(0.38, 0.12, 0.44), mat(0xcc2222), 0, 0.42, 0, ob);
      mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 6), mat(0x333333), 0, -0.55, -0.05, ob);
      const prop = grp(ob, 0, -0.95, -0.12);
      for (let i = 0; i < 3; i++) { const bl = mesh(new THREE.BoxGeometry(0.05, 0.22, 0.02), mat(0x999999, { metalness: 0.6 }), 0, 0, 0, prop); bl.rotation.z = (i / 3) * TAU; }
      r.prop = prop;
      r.seat.set(0, 0.2, -0.9);
    } else if (id === 'boat_ship') {
      r.len = 12; r.wid = 4; r.draft = 0.8; r.kind = 'ship';
      const hull = makeHull(12, 4, 2.2, data.color || 0x2255aa, 0x8a8f96, 1.35, 0.14); hull.position.y = -0.8; g.add(hull);
      const stripe = makeHull(12.06, 4.06, 0.25, 0xaa2222, 0xaa2222, null, 0.03); stripe.position.y = -0.2; g.add(stripe);
      const white = mat(0xf4f4f4), dark = mat(0x1c2a3a, { roughness: 0.2, metalness: 0.3 });
      mesh(new THREE.BoxGeometry(3, 2.2, 3.2), white, 0, 0.65 + 1.1, -1.5, g);
      mesh(new THREE.BoxGeometry(2.6, 0.55, 0.05), dark, 0, 2.2, 0.11, g);
      mesh(new THREE.BoxGeometry(0.05, 0.55, 2.4), dark, 1.51, 2.2, -1.5, g);
      mesh(new THREE.BoxGeometry(0.05, 0.55, 2.4), dark, -1.51, 2.2, -1.5, g);
      mesh(new THREE.BoxGeometry(3.4, 0.14, 3.6), mat(0xcc3322), 0, 2.85, -1.5, g);
      mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 8), mat(0xdddddd), 0, 4.7, -1.5, g);
      mesh(new THREE.BoxGeometry(1.6, 0.06, 0.06), mat(0xdddddd), 0, 5.6, -1.5, g);
      mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffee88 }), 0, 6.55, -1.5, g);
      const boom = mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 6), mat(0xe0b020), 0, 2.6, -4.2, g); boom.rotation.x = -0.9;
      mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), mat(0x8b5a2b), 0, 0.8, 2.6, g);
      mesh(new THREE.BoxGeometry(0.7, 0.45, 0.7), mat(0x8b5a2b), 1.2, 0.78, -4.3, g);
      mesh(new THREE.BoxGeometry(1.2, 0.3, 0.9), mat(0x2f6b3a), -1.0, 0.7, -4.0, g);
      for (const x of [-1.85, 1.85]) mesh(new THREE.BoxGeometry(0.05, 0.05, 7), mat(0xdddddd), x, 1.75, 1.0, g);
      r.seat.set(0, 1.05, 2.6);
    } else {
      // thuyền gỗ (mặc định)
      r.len = 4; r.wid = 1.45; r.draft = 0.25; r.kind = 'row';
      const hull = makeHull(4, 1.45, 0.62, data.color || 0x8b5a2b, 0x6b4220, 0.08, 0.07); hull.position.y = -0.25; g.add(hull);
      const plank = mat(0x9a6a3a);
      mesh(new THREE.BoxGeometry(1.25, 0.05, 0.3), plank, 0, 0.12, -0.6, g);
      mesh(new THREE.BoxGeometry(1.0, 0.05, 0.28), plank, 0, 0.12, 0.9, g);
      for (const side of [-1, 1]) {
        const piv = grp(g, 0.62 * side, 0.33, -0.25);
        const oar = mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.1, 6), mat(0xb08050), 0.85 * side, 0, 0, piv); oar.rotation.z = Math.PI / 2;
        mesh(new THREE.BoxGeometry(0.35, 0.02, 0.14), mat(0xb08050), 1.8 * side, 0, 0, piv);
        piv.rotation.z = -0.35 * side;
        r.oars.push({ piv, side });
      }
      r.seat.set(0, 0.15, -0.6);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return r;
  }

  function findWater(origin, minDepth, maxR, clearance) {
    clearance = clearance || 0;
    for (let r = 0; r <= maxR; r += 1.5) {
      const n = r === 0 ? 1 : Math.max(8, Math.round(r * 2));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const x = origin.x + Math.sin(a) * r, z = origin.z + Math.cos(a) * r;
        if (!inBounds(x, z, 2) || depthAt(x, z) < minDepth) continue;
        if (clearance > 0) {
          let ok = true;
          for (let j = 0; j < 4 && ok; j++) { const b = j * Math.PI / 2; if (depthAt(x + Math.sin(b) * clearance, z + Math.cos(b) * clearance) < minDepth * 0.5) ok = false; }
          if (!ok) continue;
        }
        return V3(x, 0, z);
      }
    }
    return null;
  }
  function findLand(origin, maxR) {
    for (let r = 1; r <= maxR; r += 1) {
      const n = Math.max(8, Math.round(r * 3));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, sx = Math.sin(a), sz = Math.cos(a);
        const x = origin.x + sx * r, z = origin.z + sz * r;
        if (!inBounds(x, z, 2) || depthAt(x, z) > 0.15) continue;
        const x2 = x + sx * 1.2, z2 = z + sz * 1.2;
        if (inBounds(x2, z2, 2) && depthAt(x2, z2) <= 0.05) return V3(x2, groundH(x2, z2), z2);
        return V3(x, groundH(x, z), z);
      }
    }
    return null;
  }

  P.boardBoat = function (boatId) {
    const data = (G.data.item && G.data.item(boatId)) || (G.data.BOATS || []).find((b) => b.id === boatId);
    if (!data || (data.type && data.type !== 'boat')) return false;
    if (envId() === 'airplane') { toast('Không thể hạ thuyền từ máy bay!', 'warn'); return false; }
    if (S.flight || G.state.mode === 'dead') return false;
    if (P.boat) removeBoat();
    if (C) loseCombat(null, true);
    if (G.state.mode === 'shoot') exitShoot();
    const b = buildBoat(data);
    const spot = findWater(P.obj.position, Math.max(0.9, b.draft + 0.6), 60, b.len * 0.45);
    if (!spot) { toast('Không có chỗ nước đủ rộng và sâu gần đây để hạ thuyền!', 'warn'); G.disposeObject(b.obj); return false; }
    G.scene.add(b.obj);
    const pp = P.obj.position;
    const heading = Math.atan2(spot.x - pp.x, spot.z - pp.z) || P.cameraYaw;
    b.obj.position.set(spot.x, waterH(spot.x, spot.z), spot.z);
    Object.assign(b, { data, id: data.id, heading, speed: 0, vx: 0, vz: 0, spin: 0, angV: 0, thr: 0, turn: 0, pitch: 0, roll: 0, wakeT: 0, paddleT: 0, bumpT: 0, engine: null });
    b.obj.rotation.order = 'YXZ';
    b.obj.rotation.set(0, heading, 0);
    b.body = { position: b.obj.position.clone(), rotation: { y: heading }, userData: {} };
    b.prev = { x: b.body.position.x, y: b.body.position.y, z: b.body.position.z, h: heading, pitch: 0, roll: 0 };
    P.boat = b;
    G.state.onBoat = data.id;
    S.swimming = false; S.vel.set(0, 0, 0); S.dodge = null; S.onGround = true; S.onDeck = false;
    S.override = null;
    if ((b.kind === 'motor' || b.kind === 'ship') && G.audio && G.audio.loop) {
      try { b.engine = G.audio.loop('engine'); if (b.engine && b.engine.setVolume) b.engine.setVolume(0.25); } catch (e) { b.engine = null; }
    }
    fx('splash', V3(spot.x, waterH(spot.x, spot.z), spot.z), 1.2);
    sfx('splash');
    P.cameraYaw = heading;
    G.setMode('boat');
    return true;
  };

  function removeBoat() {
    const b = P.boat;
    if (!b) return;
    if (b.engine) { try { b.engine.stop(); } catch (e) { /* */ } }
    G.disposeObject(b.obj);
    P.boat = null;
    G.state.onBoat = null;
    P.obj.rotation.set(0, P.facing, 0);
  }

  // leaveBoat(): luôn rời thuyền (lên bờ gần nhất trong 40m, nếu không có thì xuống nước bơi)
  P.leaveBoat = function () {
    const b = P.boat;
    if (!b) { G.state.onBoat = null; return false; }
    const bp = b.obj.position.clone();
    const land = findLand(bp, Math.ceil(b.len * 0.5 + 40));
    removeBoat();
    if (land) {
      P.teleport(land);
    } else {
      const w = waterH(bp.x, bp.z);
      P.obj.position.set(bp.x + Math.cos(b.heading) * (b.wid * 0.5 + 0.8), w - 0.6, bp.z - Math.sin(b.heading) * (b.wid * 0.5 + 0.8));
      S.vel.set(0, 0, 0); S.onGround = false;
      S.swimming = true;
    }
    const m = G.state.mode;
    if (m === 'boat' || m === 'combat' || m === 'shoot') G.setMode(S.swimming ? 'swim' : 'explore');
    return true;
  };

  function tryLeaveBoatByKey() {
    const b = P.boat; if (!b) return;
    const land = findLand(b.obj.position, Math.ceil(b.len * 0.5 + 9));
    if (!land) { toast('Lái thuyền lại gần bờ hơn rồi nhấn E để lên bờ!', 'warn'); return; }
    P.leaveBoat();
    toast('Đã lên bờ.', 'info');
  }

  // ---------- Vật lý thuyền (bước cố định) ----------
  // Trạng thái mô phỏng: b.body = {position, rotation, userData} (proxy cho lực nổi), b.vx/b.vz vận tốc thế giới,
  // b.heading, b.angV. Hiển thị = nội suy giữa b.prev và trạng thái hiện tại.
  function boatShallow(b, x, z) { return !inBounds(x, z, 2) || depthAt(x, z) < b.draft + 0.15; }
  // các điểm mẫu trên thân (mũi, đuôi, hai mạn, 4 góc) theo hướng h
  const HULL_PTS = [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [0.35, 0.4], [0.35, -0.4], [-0.35, 0.4], [-0.35, -0.4]];
  const hullN = { x: 0, z: 0 };
  // đẩy thuyền khỏi bờ: trả về số điểm còn mắc cạn (0 = ổn), pháp tuyến trung bình ở hullN
  function boatShore(b, pos, h) {
    const fx_ = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    const L = b.len * 0.92, Wd = b.wid * 0.92;
    let stuck = 0; hullN.x = 0; hullN.z = 0;
    for (let it = 0; it < 8; it++) {
      let sx = 0, sz = 0, cnt = 0;
      for (let i = 0; i < HULL_PTS.length; i++) {
        const a = HULL_PTS[i][0] * L, c = HULL_PTS[i][1] * Wd;
        const x = pos.x + fx_ * a + rx * c, z = pos.z + fz * a + rz * c;
        if (!boatShallow(b, x, z)) continue;
        cnt++;
        // hướng ra chỗ sâu: gradient độ sâu; nếu phẳng thì hướng về tâm thuyền
        const e = 0.6;
        let gx = depthAt(x + e, z) - depthAt(x - e, z), gz = depthAt(x, z + e) - depthAt(x, z - e);
        let gl = Math.hypot(gx, gz);
        if (gl < 1e-4) { gx = pos.x - x; gz = pos.z - z; gl = Math.hypot(gx, gz) || 1; }
        sx += gx / gl; sz += gz / gl;
      }
      stuck = cnt;
      if (!cnt) break;
      const l = Math.hypot(sx, sz) || 1;
      hullN.x = sx / l; hullN.z = sz / l;
      pos.x += hullN.x * 0.06; pos.z += hullN.z * 0.06;
    }
    return stuck;
  }
  const boatTmp = V3();
  function boatStep(h, t, blocked) {
    const b = P.boat, st = G.state, k = G.input.keys;
    const canDrive = !blocked && !P.locked && st.mode === 'boat';
    const maxS = (b.data.speed || 5) * 0.75;
    let thr = 0, turn = 0;
    if (canDrive) {
      thr = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      turn = (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0);
    }
    b.thr = thr; b.turn = turn;
    S.inputMoving = !!(thr || turn);
    const p = b.body.position;
    const fx_ = Math.sin(b.heading), fz = Math.cos(b.heading), rx = Math.cos(b.heading), rz = -Math.sin(b.heading);
    // gió + dòng chảy làm thuyền trôi nhẹ
    let wx = 0, wz = 0;
    try { const c = G.world && G.world.getConditions && G.world.getConditions(p.x, p.z); if (c && c.wind) { wx = c.wind.x || 0; wz = c.wind.z || 0; } } catch (e) { /* */ }
    // (tắt trôi khi đang vật cá để không thay đổi hình học trận vật đã cân bằng)
    const windK = (G.fishing && G.fishing.fight) ? 0 : b.kind === 'ship' ? 0.004 : b.kind === 'basket' ? 0.03 : 0.015;
    if (b.kind === 'basket') {
      const mi = readMoveInput(canDrive);
      const a = 1 - Math.exp(-1.5 * h);
      b.vx += ((mi.moving ? mi.mx * maxS : 0) - b.vx) * a;
      b.vz += ((mi.moving ? mi.mz * maxS : 0) - b.vz) * a;
      b.speed = Math.hypot(b.vx, b.vz);
      b.spin = U.damp(b.spin, 0.35 + b.speed * 0.5 + (mi.moving ? Math.sin(t * 0.7) * 0.6 : 0), 2, h);
      b.angV = b.spin;
      S.inputMoving = mi.moving;
    } else {
      // tách vận tốc theo trục thuyền: dọc (lực đẩy, cản nhẹ) và ngang (cản lớn nhờ sống thuyền → trôi khi bẻ lái)
      let vF = b.vx * fx_ + b.vz * fz, vR = b.vx * rx + b.vz * rz;
      const accel = maxS * 0.55;
      if (thr) vF += thr * accel * h;
      vF -= vF * (thr ? 0.35 : 0.9) * h;
      vF = clamp(vF, -maxS * 0.35, maxS);
      const latK = b.kind === 'ship' ? 1.2 : b.kind === 'motor' ? 1.8 : 2.6;
      vR -= vR * Math.min(1, latK * h);
      b.speed = vF;
      const turnRate = b.kind === 'ship' ? 0.45 : b.kind === 'motor' ? 1.1 : 0.9;
      const wantAng = turn * turnRate * (0.35 + Math.min(1, Math.abs(vF) / 3)) * (vF < -0.1 ? -1 : 1);
      const angResp = b.kind === 'ship' ? 1.6 : 4;
      b.angV += (wantAng - b.angV) * (1 - Math.exp(-angResp * h));
      b.vx = fx_ * vF + rx * vR; b.vz = fz * vF + rz * vR;
    }
    b.vx += (wx - b.vx) * windK * h; b.vz += (wz - b.vz) * windK * h;
    const oldX = p.x, oldZ = p.z, oldH = b.heading;
    b.heading += b.angV * h;
    p.x += b.vx * h; p.z += b.vz * h;
    // va chạm bờ: thuyền không thể lên cạn — đẩy về chỗ sâu, triệt tiêu vận tốc hướng vào bờ
    let nX = 0, nZ = 0, hitAny = false;
    const stuck = boatShore(b, p, b.heading);
    if (hullN.x || hullN.z) { nX += hullN.x; nZ += hullN.z; hitAny = true; }
    if (stuck) {
      // không gỡ được (vd đâm thẳng vào mũi đất) → quay về vị trí cũ
      if (boatShore(b, boatTmp.set(oldX, 0, oldZ), oldH) === 0) { p.x = boatTmp.x; p.z = boatTmp.z; b.heading = oldH; b.angV *= -0.3; }
    }
    // va chạm collider (cầu cảng, đá, nhà sàn...) bằng 3 vòng tròn dọc thân
    const ph = PH();
    if (ph && ph.resolveCircle) {
      const r = b.wid * 0.5, wl = waterH(p.x, p.z);
      const hfx = Math.sin(b.heading), hfz = Math.cos(b.heading);
      for (const s of [0.5 - b.wid * 0.5 / Math.max(1, b.len), 0, -(0.5 - b.wid * 0.5 / Math.max(1, b.len))]) {
        const ox = hfx * s * b.len, oz = hfz * s * b.len;
        boatTmp.set(p.x + ox, 0, p.z + oz);
        if (collide(boatTmp, r, wl - b.draft, 3 + b.draft)) {
          p.x = boatTmp.x - ox; p.z = boatTmp.z - oz;
          nX += ph.lastNormal.x; nZ += ph.lastNormal.z; hitAny = true;
        }
      }
    }
    if (hitAny) {
      const nl = Math.hypot(nX, nZ) || 1; nX /= nl; nZ /= nl;
      const vn = b.vx * nX + b.vz * nZ;
      if (vn < 0) {
        b.vx -= nX * vn * 1.25; b.vz -= nZ * vn * 1.25; // nảy nhẹ (hệ số hồi phục 0.25)
        b.vx *= 0.85; b.vz *= 0.85;
        if (b.bumpT <= 0 && -vn > 1.2) { b.bumpT = 0.8; fx('shake', 0.15, 0.25); sfx('hit', { volume: 0.4 }); fx('ripple', V3(p.x - nX * b.len * 0.4, waterH(p.x, p.z), p.z - nZ * b.len * 0.4), 1); }
      }
      if (b.kind === 'basket') { b.speed = Math.hypot(b.vx, b.vz); }
      else b.speed = b.vx * Math.sin(b.heading) + b.vz * Math.cos(b.heading);
    }
    b.bumpT -= h;
    tmpV2.set(p.x, 0, p.z);
    if (clampBounds(tmpV2, b.len * 0.5 + 1)) { p.x = tmpV2.x; p.z = tmpV2.z; b.vx *= 0.5; b.vz *= 0.5; }
    // lực nổi: nhấp nhô, chòng chành theo sóng thật (lò xo - giảm chấn tại 4 điểm)
    const sp01 = Math.min(1, Math.abs(b.speed) / maxS);
    let pitchBias = 0, rollBias = 0;
    if (b.kind === 'motor') pitchBias -= 0.09 * sp01;
    if (b.kind === 'ship') pitchBias -= 0.02 * sp01;
    rollBias += b.turn * sp01 * (b.kind === 'motor' ? 0.12 : 0.05);
    const lift = b.kind === 'motor' ? 0.12 * sp01 : 0;
    const stab = b.data.stability != null ? b.data.stability : 0.5;
    const bs = G.physics && G.physics.buoyancy ? G.physics.buoyancy(b.body, {
      dt: h, draft: b.draft, length: b.len * 0.84, width: b.wid * 0.84, heading: b.heading,
      extraForce: lift * 9.81 / b.draft, pitchBias, rollBias, angStiffness: 18 + stab * 30, damping: 0.35 + stab * 0.3,
    }) : null;
    if (bs) { b.pitch = bs.pitch; b.roll = bs.roll; }
    else { p.y = waterH(p.x, p.z); b.pitch = pitchBias; b.roll = rollBias; }
  }

  function updateBoat(dt, t, blocked) {
    const b = P.boat, st = G.state;
    // ----- các bước cố định -----
    const stp = getStepper();
    const n = stp.advance(dt);
    const bp = b.body.position;
    for (let i = 0; i < n; i++) {
      b.prev.x = bp.x; b.prev.y = bp.y; b.prev.z = bp.z; b.prev.h = b.heading; b.prev.pitch = b.pitch; b.prev.roll = b.roll;
      boatStep(STEP, t - (n - 1 - i) * STEP, blocked);
      if (!P.boat) return;
    }
    // ----- hiển thị nội suy -----
    const a = stp.alpha, p = b.obj.position;
    const amp = 1.25 - (b.data.stability || 0.5) * 0.55;
    p.set(U.lerp(b.prev.x, bp.x, a), U.lerp(b.prev.y, bp.y, a), U.lerp(b.prev.z, bp.z, a));
    const dh = ((((b.heading - b.prev.h + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
    const hd = b.prev.h + dh * a;
    const pitch = U.lerp(b.prev.pitch, b.pitch, a) * amp + Math.sin(t * 1.3) * 0.012 * amp;
    const roll = U.lerp(b.prev.roll, b.roll, a) * amp + Math.sin(t * 1.1 + 1) * 0.016 * amp;
    b.obj.rotation.set(pitch, hd, roll);
    const maxS = (b.data.speed || 5) * 0.75, sp01 = Math.abs(b.speed) / maxS;
    const fx_ = Math.sin(hd), fz = Math.cos(hd);
    if (b.spinner) b.spinner.rotation.y += dt * 0.2;
    if (b.prop) b.prop.rotation.z += dt * (4 + Math.abs(b.speed) * 6);
    for (const o of b.oars) {
      const row = S.inputMoving && st.mode === 'boat';
      o.piv.rotation.y = row ? Math.sin(t * 4) * 0.5 * o.side : U.damp(o.piv.rotation.y, 0, 3, dt);
      o.piv.rotation.z = -0.35 * o.side + (row ? Math.cos(t * 4) * 0.15 * o.side : 0);
    }
    // sóng sau đuôi / tiếng động cơ
    b.wakeT -= dt;
    if (Math.abs(b.speed) > 1.5 && b.wakeT <= 0) {
      b.wakeT = b.kind === 'motor' ? 0.09 : 0.16;
      const sx = p.x - fx_ * b.len * 0.5, sz = p.z - fz * b.len * 0.5;
      fx('ripple', V3(sx, 0, sz), 0.5 + Math.abs(b.speed) * 0.08);
      if (b.kind === 'motor' && sp01 > 0.55 && Math.random() < 0.35) fx('splash', V3(p.x + fx_ * b.len * 0.45, 0, p.z + fz * b.len * 0.45), 0.35);
    }
    if (b.kind !== 'motor' && b.kind !== 'ship' && S.inputMoving) {
      b.paddleT -= dt;
      if (b.paddleT <= 0) { b.paddleT = 1.2; sfx('swim', { volume: 0.35 }); }
    }
    if (b.engine) {
      try { b.engine.setRate && b.engine.setRate(0.7 + sp01 * 1.1); b.engine.setVolume && b.engine.setVolume(0.2 + sp01 * 0.35); } catch (e) { /* */ }
    }
    // ngồi trên thuyền
    b.obj.updateMatrixWorld(true);
    tmpV.copy(b.seat).applyMatrix4(b.obj.matrixWorld);
    P.obj.position.set(tmpV.x, tmpV.y - 0.33, tmpV.z);
    P.facing = S.targetFacing = hd;
    P.obj.rotation.set(pitch, hd, roll);
    S.speed = 0; S.onGround = true; S.swimming = false; S.onDeck = false; S.renderValid = false;
    // né trên thuyền (combat)
    if (st.mode === 'combat' && !blocked && (G.input.pressed('ShiftLeft') || G.input.pressed('ShiftRight')) && st.stamina >= 12 && S.iframes <= 0) {
      S.iframes = 0.55; st.stamina -= 12; sfx('whoosh'); P.setAnim('hit', 0.4);
    }
  }

  // ======================================================================
  // Đánh nhau với cá
  // ======================================================================
  function fishFloor(x, z) {
    if (P.boat) return null;
    const d = deckFloor(x, z, P.obj.position.y + 0.5);
    if (d !== null) return d;
    return groundH(x, z);
  }
  function standable(x, z) {
    return deckFloor(x, z, P.obj.position.y + 0.5) !== null || depthAt(x, z) < 0.25;
  }
  function fallbackFishModel(len, color) {
    const g = new THREE.Group();
    const m = mat(color || 0x667788);
    const b = mesh(new THREE.SphereGeometry(0.5, 14, 10), m, 0, 0, 0, g); b.scale.set(0.45, 0.55, 1);
    const tail = mesh(new THREE.ConeGeometry(0.25, 0.4, 4), m, 0, 0, -0.6, g); tail.rotation.x = -Math.PI / 2;
    g.scale.setScalar(len);
    return g;
  }

  function onCombatStart(d) {
    const ci = d && d.catchInfo;
    if (!ci) return;
    if (C) loseCombat(null, true);
    if (G.state.mode === 'shoot') exitShoot();
    const sp = ci.species || (G.fish && G.fish.get && G.fish.get(ci.id)) || {};
    let len = 1;
    try { if (G.fish && G.fish.lengthFromWeight) len = G.fish.lengthFromWeight(sp, ci.weight); } catch (e) { /* */ }
    len = clamp(len || 1, 0.6, 4.5);
    let model = null;
    if (d.fishObj && d.fishObj.isObject3D) { model = d.fishObj; if (model.parent) model.parent.remove(model); model.visible = true; model.scale.setScalar(1); }
    else { try { if (G.fish && G.fish.createModel) model = G.fish.createModel(ci.id, len); } catch (e) { model = null; } }
    if (!model) model = fallbackFishModel(len, sp.color);
    const mats = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      if (Array.isArray(o.material)) o.material = o.material.map((m) => m.clone());
      else if (o.material) o.material = o.material.clone();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (m && m.emissive) { m.userData._e = m.emissive.clone(); mats.push(m); }
      });
    });
    model.position.set(0, 0, 0); model.rotation.set(0, 0, 0);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(V3());
    const bottom = -box.min.y;
    const radius = clamp(Math.max(size.x, size.z) * 0.5, 0.3, 3);
    G.scene.add(model);

    const key = (String(ci.id) + ' ' + (ci.name || '') + ' ' + (sp.name || '')).toLowerCase();
    let kind = 'bite';
    if (/shoe|giay|giày|sneaker|chan|chân/.test(key)) kind = 'kick';
    else if (/croc|sau|sấu|gator/.test(key)) kind = 'croc';
    else if (/chicken|(^|[_\s])ga([_\s]|$)|gà/.test(key)) kind = 'chicken';

    const C0 = {
      catchInfo: ci, species: sp, model, mats, bottom, radius, kind,
      maxHp: Math.round(clamp(35 + (ci.weight || 1) * 1.2 + (sp.strength || 30) * 1.2, 40, 420)),
      speed: clamp(1.4 + (sp.speed || 5) * 0.35, 1.5, 5),
      dmg: Math.round(clamp(4 + (sp.strength || 30) * 0.12 + (ci.weight || 1) * 0.01, 4, 26) * (kind === 'croc' ? 1.35 : 1)),
      state: 'approach', timer: 0.8, elapsed: 0, flash: 0, knock: V3(), hop: 0, hopV: 0, lunge: 0, facing: 0, escapeTo: null,
      onBoat: !!P.boat, boatLocal: null,
    };
    C0.hp = C0.maxHp;
    if (P.boat) {
      const b = P.boat;
      C0.boatLocal = V3(0, b.seat.y - 0.05, b.seat.z + clamp(radius + 1.0, 1.2, b.len * 0.45));
    } else {
      const pp = P.obj.position, f = P.getAimDirection();
      const base = Math.atan2(f.x, f.z);
      let spot = null;
      for (let i = 0; i < 16 && !spot; i++) {
        const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 8);
        for (const r of [radius + 2.5, radius + 1.8, radius + 4]) {
          const x = pp.x + Math.sin(a) * r, z = pp.z + Math.cos(a) * r;
          if (standable(x, z) && inBounds(x, z, 2)) { spot = V3(x, 0, z); break; }
        }
      }
      if (!spot) spot = V3(pp.x + f.x * (radius + 2.5), 0, pp.z + f.z * (radius + 2.5));
      model.position.set(spot.x, (fishFloor(spot.x, spot.z) || 0) + bottom, spot.z);
      fx('splash', model.position.clone(), 1.2);
    }
    C = C0;
    P.locked = false;
    P.combat = { fishHp: C.hp, fishMaxHp: C.maxHp, name: ci.name || sp.name || 'Cá' };
    S.override = null; S.combo = 0; S.atkCd = 0.3;
    G.setMode('combat');
    sfx(kind === 'chicken' ? 'chicken' : 'roar');
    toast((ci.name || 'Con cá') + ' nhảy lên đòi đánh nhau! Chuột trái đấm, Shift né!', 'epic');
    fx('shake', 0.3, 0.4);
  }

  function fishWorldPos(out) {
    if (C.onBoat && P.boat) {
      tmpV2.copy(C.boatLocal); tmpV2.z -= C.lunge; tmpV2.y += C.bottom + C.hop;
      return out.copy(tmpV2).applyMatrix4(P.boat.obj.matrixWorld);
    }
    return out.copy(C.model.position);
  }
  function setGlow(r, g, b) {
    for (const m of C.mats) { const e = m.userData._e; if (e) m.emissive.setRGB(e.r + r, e.g + g, e.b + b); }
  }

  function playerAttack() {
    S.combo = S.comboT > 0 ? (S.combo + 1) % 3 : 0;
    S.comboT = 0.9;
    S.atkCd = S.combo === 2 ? 0.55 : 0.32;
    P.setAnim('attack', S.combo === 2 ? 0.5 : 0.36, P.boat && S.combo === 2 ? 1 : S.combo);
    S.pendingHit = { t: S.combo === 2 ? 0.18 : 0.12, combo: S.combo };
    sfx('whoosh', { volume: 0.5 });
    G.state.stamina = Math.max(0, G.state.stamina - 1.5);
    if (!P.boat) {
      const m = C.model.position, pp = P.obj.position;
      S.targetFacing = Math.atan2(m.x - pp.x, m.z - pp.z);
    }
  }

  function resolvePlayerHit() {
    const h = S.pendingHit; S.pendingHit = null;
    if (!C || C.state === 'dead') return;
    const fp = fishWorldPos(V3()), pp = P.obj.position;
    const dist = Math.hypot(fp.x - pp.x, fp.z - pp.z);
    if (dist > C.radius + 1.45) { fx('floatText', V3(pp.x, pp.y + 2.1, pp.z), 'Hụt!', '#cccccc'); return; }
    let dmg = h.combo === 2 ? U.rand(17, 24) : U.rand(9, 14);
    dmg *= 1 + (G.state.drunk || 0) * 0.4;
    if (G.state.buffs && G.state.buffs.strength) dmg *= 1.5;
    const crit = Math.random() < 0.12;
    if (crit) dmg *= 1.8;
    dmg = Math.round(dmg);
    C.hp = Math.max(0, C.hp - dmg);
    C.flash = 0.15;
    fx('floatText', V3(fp.x, fp.y + 1 + C.radius * 0.4, fp.z), (crit ? 'CHÍ MẠNG -' : '-') + dmg, crit ? '#ff8800' : '#ffdd55');
    sfx('punch');
    fx('shake', h.combo === 2 ? 0.25 : 0.12, 0.15);
    if (!C.onBoat) {
      const dx = fp.x - pp.x, dz = fp.z - pp.z, l = Math.hypot(dx, dz) || 1;
      C.knock.set(dx / l, 0, dz / l).multiplyScalar(h.combo === 2 ? 5 : 2.5);
    } else C.lunge = -0.3;
    if (h.combo === 2 && (C.state === 'windup' || C.state === 'approach')) { C.state = 'stunned'; C.timer = 0.7; setGlow(0, 0, 0); }
    if (C.hp <= 0) winCombat();
  }

  function fishAttackHit() {
    const st = G.state;
    if (S.iframes > 0) { fx('floatText', P.obj.position.clone().add(V3(0, 2.1, 0)), 'Né!', '#88ddff'); return; }
    const dmg = Math.round(C.dmg * U.rand(0.85, 1.15));
    st.hp = Math.max(10, st.hp - dmg);
    fx('shake', 0.45, 0.3);
    sfx('hit');
    if (C.kind === 'chicken') sfx('chicken');
    const word = C.kind === 'kick' ? 'Bị đá! ' : C.kind === 'chicken' ? 'Bị mổ! ' : C.kind === 'croc' ? 'Bị đớp! ' : '';
    fx('floatText', P.obj.position.clone().add(V3(0, 2.1, 0)), word + '-' + dmg, '#ff4444');
    P.setAnim('hit', 0.4);
    S.iframes = 0.35;
    if (!P.boat) {
      const fp = C.model.position, pp = P.obj.position;
      const dx = pp.x - fp.x, dz = pp.z - fp.z, l = Math.hypot(dx, dz) || 1;
      S.vel.x += dx / l * 5; S.vel.z += dz / l * 5;
    }
    if (st.hp <= 10) loseCombat('Bạn kiệt sức... ' + (C.catchInfo.name || 'con cá') + ' đã chạy mất!');
  }

  function endCombatMode() {
    P.combat = null;
    C = null;
    S.pendingHit = null;
    if (G.state.mode === 'combat') G.setMode(P.boat ? 'boat' : S.swimming ? 'swim' : 'explore');
  }

  function winCombat() {
    const ci = C.catchInfo;
    setGlow(0, 0, 0);
    const fp = fishWorldPos(V3());
    if (C.onBoat) { C.model.position.copy(fp); }
    dying.push({ model: C.model, t: 0, mode: 'win', mats: C.mats, bottom: C.bottom });
    fx('floatText', V3(fp.x, fp.y + 1.6, fp.z), 'K.O.!', '#ffee00');
    fx('sparkle', fp, 0xfff3a0);
    sfx('catch');
    const info = ci;
    endCombatMode();
    G.bus.emit('fish:caught', { catchInfo: info });
    G.bus.emit('combat:end', { win: true, catchInfo: info });
  }

  function loseCombat(msg, silentToast) {
    if (!C) return;
    const ci = C.catchInfo;
    setGlow(0, 0, 0);
    const fp = fishWorldPos(V3());
    C.model.position.copy(fp);
    const w = findWater(fp, 0.8, 30, 0);
    dying.push({ model: C.model, t: 0, mode: 'escape', to: w, mats: C.mats, bottom: C.bottom, speed: C.speed * 1.5, onBoat: C.onBoat });
    if (msg && !silentToast) toast(msg, 'bad');
    endCombatMode();
    G.bus.emit('combat:end', { win: false, catchInfo: ci });
  }

  function updateCombat(dt, t, blocked) {
    S.atkCd -= dt; S.comboT -= dt; S.iframes -= dt;
    updateDying(dt, t);
    if (!C) return;
    const st = G.state, pp = P.obj.position, m = C.model;
    if (st.mode !== 'combat') {
      if (C.elapsed < 1 && ['explore', 'fishing', 'fight', 'boat', 'swim'].indexOf(st.mode) >= 0) G.setMode('combat');
      else { loseCombat(null, true); return; }
    }
    C.elapsed += dt; C.timer -= dt;
    if (!blocked && G.input.mouse.leftPressed && S.atkCd <= 0 && !S.dodge && !S.flight) playerAttack();
    if (S.pendingHit && (S.pendingHit.t -= dt) <= 0) { resolvePlayerHit(); if (!C) return; }

    const fp = fishWorldPos(V3());
    let dx = pp.x - fp.x, dz = pp.z - fp.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    dx /= dist; dz /= dist;
    const reach = C.radius + 1.1;
    let move = 0;
    if (C.elapsed > 40 && C.state !== 'escape') {
      C.state = 'escape';
      C.escapeTo = C.onBoat ? null : findWater(fp, 0.8, 40, 0);
      toast((C.catchInfo.name || 'Con cá') + ' chán đánh nhau, đang chạy về nước!', 'warn');
    }
    switch (C.state) {
      case 'approach':
        if (!C.onBoat && dist > reach * 0.85) move = C.speed;
        if (C.kind === 'chicken' && C.hop <= 0.001 && Math.random() < dt * 1.5) { C.hopV = Math.random() < 0.3 ? 7 : 3.5; if (C.hopV > 5) sfx('chicken'); }
        if (dist <= reach + (C.kind === 'croc' ? 1.5 : 0) && C.timer <= 0) {
          C.state = 'windup';
          C.timer = clamp(1.0 - (C.species.speed || 5) * 0.05, 0.45, 0.95);
          if (C.kind === 'croc') sfx('roar', { volume: 0.6 });
        }
        break;
      case 'windup': {
        const g = 0.4 + 0.4 * Math.sin(t * 30);
        setGlow(g, g * 0.15, 0);
        if (C.onBoat) C.lunge = U.damp(C.lunge, -0.25, 6, dt);
        if (C.timer <= 0) { C.state = 'strike'; C.timer = 0.28; C.didHit = false; setGlow(0, 0, 0); }
        break;
      }
      case 'strike': {
        const ld = C.kind === 'croc' ? 9 : C.kind === 'chicken' ? 6 : 5;
        if (!C.onBoat) move = ld;
        else C.lunge = Math.min(0.6, C.lunge + dt * 5);
        if (C.kind === 'chicken' && C.hop <= 0.01) C.hopV = 4;
        if (!C.didHit && C.timer < 0.16) {
          C.didHit = true;
          const d2 = Math.hypot(pp.x - fp.x, pp.z - fp.z);
          if (d2 < reach + (C.kind === 'croc' ? 0.8 : 0.4)) { fishAttackHit(); if (!C) return; }
          else sfx('whoosh', { volume: 0.4 });
        }
        if (C.timer <= 0) { C.state = 'recover'; C.timer = U.rand(0.7, 1.2); }
        break;
      }
      case 'recover':
        if (C.onBoat) C.lunge = U.damp(C.lunge, 0, 4, dt);
        if (C.timer <= 0) { C.state = 'approach'; C.timer = U.rand(0.2, 0.6); }
        break;
      case 'stunned':
        setGlow(0.3, 0.3, 0.3 * (Math.sin(t * 20) > 0 ? 1 : 0));
        if (C.timer <= 0) { setGlow(0, 0, 0); C.state = 'approach'; C.timer = 0.4; }
        break;
      case 'escape': {
        if (C.onBoat) { loseCombat((C.catchInfo.name || 'Con cá') + ' nhảy khỏi thuyền trốn mất!'); return; }
        const to = C.escapeTo;
        if (!to || isWater(m.position.x, m.position.z) && depthAt(m.position.x, m.position.z) > 0.5) {
          fx('splash', m.position.clone(), 1.5); sfx('splash');
          loseCombat((C.catchInfo.name || 'Con cá') + ' đã trốn về nước!');
          return;
        }
        const ex = to.x - m.position.x, ez = to.z - m.position.z, el = Math.hypot(ex, ez) || 1;
        m.position.x += ex / el * C.speed * 1.4 * dt; m.position.z += ez / el * C.speed * 1.4 * dt;
        C.facing = Math.atan2(ex, ez);
        if (el < 0.6) { C.escapeTo = null; }
        break;
      }
    }
    // di chuyển trên mặt đất
    if (!C.onBoat) {
      if (C.state !== 'escape') C.facing = dampAngle(C.facing, Math.atan2(dx, dz), 8, dt);
      let vx = 0, vz = 0;
      if (move > 0 && C.state !== 'escape') { vx = dx * move; vz = dz * move; }
      vx += C.knock.x; vz += C.knock.z;
      C.knock.multiplyScalar(Math.exp(-6 * dt));
      const nx = m.position.x + vx * dt, nz = m.position.z + vz * dt;
      const nd = Math.hypot(pp.x - nx, pp.z - nz);
      if (C.state !== 'escape' && (standable(nx, nz) || !standable(m.position.x, m.position.z)) && (nd > C.radius * 0.7 || C.knock.lengthSq() > 0.5)) {
        m.position.x = nx; m.position.z = nz;
      }
      // nhảy (cá gà)
      if (C.hopV > 0 || C.hop > 0) { C.hop += C.hopV * dt; C.hopV -= 18 * dt; if (C.hop <= 0) { C.hop = 0; C.hopV = 0; } }
      const fl = fishFloor(m.position.x, m.position.z);
      m.position.y = (fl === null ? m.position.y : fl) + C.bottom + C.hop;
      m.rotation.set(C.state === 'windup' ? -0.25 : 0, C.facing, Math.sin(t * 9) * 0.06);
    } else if (P.boat) {
      if (C.hopV > 0 || C.hop > 0) { C.hop += C.hopV * dt; C.hopV -= 18 * dt; if (C.hop <= 0) { C.hop = 0; C.hopV = 0; } }
      P.boat.obj.updateMatrixWorld(true);
      fishWorldPos(m.position);
      m.rotation.set(P.boat.pitch, P.boat.heading + Math.PI, P.boat.roll);
    }
    if (C.flash > 0) { C.flash -= dt; setGlow(C.flash > 0 ? 0.8 : 0, C.flash > 0 ? 0.8 : 0, C.flash > 0 ? 0.8 : 0); }
    try { if (m.userData && m.userData.animate) m.userData.animate(t, C.state === 'strike' ? 1 : 0.6); } catch (e) { /* */ }
    if (P.combat) P.combat.fishHp = C.hp;
  }

  function disposeFishModel(model) {
    if (model.parent) model.parent.remove(model);
    model.traverse((o) => { if (o.isMesh && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm) => mm.dispose && mm.dispose()); });
  }

  function updateDying(dt, t) {
    for (let i = dying.length - 1; i >= 0; i--) {
      const d = dying[i], m = d.model;
      d.t += dt;
      if (d.mode === 'win') {
        m.rotation.z = Math.sin(d.t * 22) * 0.5 * Math.max(0, 1 - d.t / 1.2) + Math.min(1, d.t * 2) * 1.4;
        if (d.t > 1.1) m.scale.multiplyScalar(Math.exp(-5 * dt));
        if (d.t > 1.7) { fx('sparkle', m.position.clone(), 0xfff3a0); disposeFishModel(m); dying.splice(i, 1); }
      } else {
        if (d.to) {
          const ex = d.to.x - m.position.x, ez = d.to.z - m.position.z, el = Math.hypot(ex, ez) || 1;
          m.position.x += ex / el * d.speed * dt; m.position.z += ez / el * d.speed * dt;
          m.rotation.y = Math.atan2(ex, ez);
          if (!d.onBoat) m.position.y = groundH(m.position.x, m.position.z) + d.bottom + Math.abs(Math.sin(d.t * 10)) * 0.3;
          if (el < 0.8 || d.t > 5) { d.to = null; }
        } else {
          fx('splash', m.position.clone(), 1.3); sfx('splash');
          disposeFishModel(m); dying.splice(i, 1);
          continue;
        }
        try { if (m.userData && m.userData.animate) m.userData.animate(t, 1); } catch (e) { /* */ }
      }
    }
  }

  // ======================================================================
  // Bắn cá
  // ======================================================================
  const aimCaster = new THREE.Raycaster();
  const projGeo = { tracer: null, pebble: null }, projMat = { tracer: null, pebble: null };
  function enterShoot() {
    S.shootPrev = P.boat ? 'boat' : 'explore';
    S.override = null;
    G.setMode('shoot');
    toast('Chế độ bắn cá: chuột trái bắn, chuột phải xoay, G/Esc để thoát.', 'info');
  }
  function exitShoot() {
    if (G.state.mode === 'shoot') G.setMode(P.boat ? 'boat' : S.swimming ? 'swim' : 'explore');
  }
  function entryInfo(e, out) {
    if (!e || e.alive === false || e.dead || e.caught || e.killed || e.collected) return 0;
    const o = e.obj || e.mesh || e.model || e.group || (e.isObject3D ? e : null);
    if (o && o.isObject3D) { if (!o.parent) return 0; o.getWorldPosition(out); }
    else if (e.pos && e.pos.isVector3) out.copy(e.pos);
    else if (e.position && e.position.isVector3) out.copy(e.position);
    else return 0;
    const r = e.radius || (e.length ? e.length * 0.55 : 0) || (e.size ? e.size * 0.5 : 0) || 0.6;
    return clamp(r, 0.45, 4);
  }
  function getAmbient() {
    try { const a = G.fish && G.fish.getAmbient && G.fish.getAmbient(); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  P.getAimRay = function () {
    aimCaster.setFromCamera({ x: G.input.mouse.nx, y: G.input.mouse.ny }, G.camera);
    return aimCaster.ray;
  };
  function fire() {
    S.shootCd = 0.4;
    S.shootKick = 1;
    const ray = P.getAimRay();
    const o = ray.origin, d = ray.direction;
    let aim = null, best = Infinity;
    const c = V3();
    for (const e of getAmbient()) {
      const r = entryInfo(e, c); if (!r) continue;
      const tt = c.clone().sub(o).dot(d);
      if (tt <= 0 || tt > 160) continue;
      const d2 = o.clone().addScaledVector(d, tt).distanceToSquared(c);
      const rr = r * 1.6 + 0.3;
      if (d2 < rr * rr && tt < best) { best = tt; aim = c.clone(); }
    }
    if (!aim) {
      for (let s = 1; s < 220; s += 0.4 + s * 0.02) {
        const px = o.x + d.x * s, py = o.y + d.y * s, pz = o.z + d.z * s;
        if (py < groundH(px, pz) || (isWater(px, pz) && py < waterH(px, pz))) { aim = V3(px, py, pz); break; }
      }
    }
    if (!aim) aim = o.clone().addScaledVector(d, 120);
    P.obj.updateMatrixWorld(true);
    const start = P.hand.getWorldPosition(V3());
    const vel = aim.clone().sub(start);
    const dist = vel.length();
    vel.normalize().multiplyScalar(75);
    vel.y += 3 * Math.min(1, dist / 75);
    if (!projGeo.tracer) {
      projGeo.tracer = new THREE.BoxGeometry(0.05, 0.05, 1.4);
      projGeo.pebble = new THREE.SphereGeometry(0.07, 8, 6);
      projMat.tracer = new THREE.MeshBasicMaterial({ color: 0xffe877, transparent: true, opacity: 0.85 });
      projMat.pebble = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
    }
    const g = new THREE.Group();
    const tr = new THREE.Mesh(projGeo.tracer, projMat.tracer); tr.position.z = -0.7; g.add(tr);
    g.add(new THREE.Mesh(projGeo.pebble, projMat.pebble));
    g.position.copy(start);
    G.scene.add(g);
    projectiles.push({ obj: g, pos: start.clone(), vel, life: 2.2, inWater: false });
    sfx('gunshot');
    fx('sparkle', start, 0xffe877);
    fx('shake', 0.05, 0.08);
  }
  function removeProjectile(i) { const p = projectiles[i]; if (p.obj.parent) p.obj.parent.remove(p.obj); projectiles.splice(i, 1); }
  function updateProjectiles(dt) {
    if (!projectiles.length) return;
    const amb = getAmbient();
    const c = V3(), seg = V3(), rel = V3();
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      const p0 = p.pos.clone();
      p.vel.y -= (p.inWater ? 2 : 6) * dt;
      p.pos.addScaledVector(p.vel, dt);
      seg.subVectors(p.pos, p0);
      const segLen2 = seg.lengthSq() || 1e-6;
      let hit = null;
      for (const e of amb) {
        const r = entryInfo(e, c); if (!r) continue;
        rel.subVectors(c, p0);
        const u = clamp(rel.dot(seg) / segLen2, 0, 1);
        const cx = p0.x + seg.x * u - c.x, cy = p0.y + seg.y * u - c.y, cz = p0.z + seg.z * u - c.z;
        if (cx * cx + cy * cy + cz * cz < (r + 0.3) * (r + 0.3)) { hit = { e, pos: c.clone() }; break; }
      }
      if (hit) {
        let ci = null;
        try { ci = G.fish.killAmbient(hit.e); } catch (err) { ci = null; }
        hit.e.claimed = true; // đã tính vào túi — hệ thống vớt cá không nhặt lại
        fx('explosion', hit.pos, 0.5);
        if (ci) {
          fx('floatText', hit.pos.clone().add(V3(0, 1.2, 0)), 'Trúng! ' + (ci.name || ''), '#7CFC00');
          G.bus.emit('fish:caught', { catchInfo: ci });
        } else fx('floatText', hit.pos.clone().add(V3(0, 1, 0)), 'Trúng!', '#ffffff');
        removeProjectile(i);
        continue;
      }
      // CCD: quét đoạn bay trong frame với collider (nhà, cây...) → đạn không xuyên tường
      const ph = PH();
      if (ph && ph.raycastXZ && !p.inWater) {
        let wh = null;
        try { wh = ph.raycastXZ(p0, p.pos, 0.03, (p0.y + p.pos.y) * 0.5, { skipTag: 'npc', out: camHit }); } catch (err) { wh = null; }
        if (wh) { fx('sparkle', V3(wh.x, wh.y, wh.z), 0xaa9977); sfx('hit', { volume: 0.25 }); removeProjectile(i); continue; }
      }
      const x = p.pos.x, z = p.pos.z;
      if (!p.inWater && isWater(x, z) && p.pos.y < waterH(x, z)) {
        p.inWater = true;
        fx('splash', V3(x, waterH(x, z), z), 0.35);
        sfx('plop');
        p.vel.multiplyScalar(0.12);
        p.life = Math.min(p.life, 0.35);
      } else if (p.pos.y < groundH(x, z) && !(isWater(x, z))) {
        fx('sparkle', p.pos.clone(), 0xaa9977);
        removeProjectile(i);
        continue;
      }
      if (p.life <= 0) { removeProjectile(i); continue; }
      p.obj.position.copy(p.pos);
      p.obj.lookAt(tmpV.copy(p.pos).add(p.vel));
    }
  }
  function updateShoot(dt, blocked) {
    S.shootCd -= dt;
    if (G.state.mode !== 'shoot' || blocked) return;
    if (G.input.mouse.leftPressed && S.shootCd <= 0) fire();
  }

  // ======================================================================
  // Phím chung
  // ======================================================================
  function bestOwnedBoat() {
    const owned = G.state.ownedBoats || [];
    let best = null, bs = -1;
    for (const id of owned) { const d = G.data.item && G.data.item(id); if (d && (d.speed || 0) > bs) { bs = d.speed || 0; best = id; } }
    return best;
  }
  function handleKeys(dt, blocked) {
    const st = G.state, mode = st.mode, inp = G.input;
    if (blocked) return;
    if (inp.pressed('KeyG')) {
      if (mode === 'shoot') exitShoot();
      else if ((mode === 'explore' || mode === 'boat') && !P.locked && !S.flight) enterShoot();
    }
    if (inp.pressed('Escape') && mode === 'shoot') exitShoot();
    if (inp.pressed('KeyE')) {
      if (mode === 'boat' && !P.locked) tryLeaveBoatByKey();
      else if (mode === 'explore' && !P.locked && !P.boat && !(G.systems && G.systems.nearestNPC) && envId() !== 'airplane') {
        const id = bestOwnedBoat();
        if (id && findWater(P.obj.position, 1.0, 5, 0)) {
          if (P.boardBoat(id)) toast('Lên ' + ((G.data.item(id) || {}).name || 'thuyền') + '! WASD để lái, E để lên bờ, F để câu.', 'good');
        }
      }
    }
    // gợi ý hạ thuyền
    S.boatHintT -= dt;
    if (S.boatHintT <= 0) {
      S.boatHintT = 1;
      if (!S.boatHinted && mode === 'explore' && !P.boat && (st.ownedBoats || []).length && envId() !== 'airplane' && findWater(P.obj.position, 1.0, 4, 0)) {
        S.boatHinted = true;
        toast('Nhấn E ở mép nước để hạ thuyền.', 'info');
      }
    }
  }

  // ======================================================================
  // Camera
  // ======================================================================
  function updateCamera(dt, t, blocked) {
    const cam = G.camera;
    if (!cam) return;
    const m = G.input.mouse, st = G.state, mode = st.mode, pp = P.obj.position;
    if (!blocked && m.right) {
      P.cameraYaw -= m.dx * 0.005;
      P.cameraPitch += m.dy * 0.004;
    }
    P.cameraPitch = clamp(P.cameraPitch, S.swimming ? -0.2 : -0.3, 1.35);
    if (!blocked && m.wheel && mode !== 'fishing' && mode !== 'fight') P.cameraDist = clamp(P.cameraDist * (1 + m.wheel * 0.12), 2.2, 30);

    let tx = pp.x, ty = pp.y + (S.swimming ? 1.0 : P.boat ? 1.2 : 1.55), tz = pp.z;
    if (mode === 'dead') ty = pp.y + 0.6;
    let dist = P.cameraDist, side = 0;
    const yaw = P.cameraYaw, pitch = P.cameraPitch;
    if (P.boat) dist = Math.max(dist, P.boat.len * 1.1 + 3);
    if (mode === 'shoot') { dist = 3.2; side = 0.85; ty = pp.y + 1.75; }
    if (mode === 'combat' && C) dist = Math.max(dist, 6 + C.radius * 2);
    const f = P.cameraFocus;
    if (f && f.isVector3 && mode !== 'shoot') {
      const sep = Math.hypot(f.x - pp.x, f.y - pp.y, f.z - pp.z);
      const w = sep > 40 ? 15 / sep : 0.45;
      tx += (f.x - pp.x) * w; tz += (f.z - pp.z) * w; ty += (f.y - ty) * w * 0.5;
      dist = Math.max(dist, Math.min(60, sep * w * 1.6 + 4));
      if (!m.right && Math.hypot(f.x - pp.x, f.z - pp.z) > 1) P.cameraYaw = dampAngle(P.cameraYaw, Math.atan2(f.x - pp.x, f.z - pp.z), 1.2, dt);
    }
    if (S.camSnap || !dt) {
      if (S.camSnap) { camTarget.set(tx, ty, tz); camDistSm = dist; S.camSnap = false; }
    } else {
      const a = 1 - Math.exp(-(S.flight ? 6 : 12) * dt);
      camTarget.x += (tx - camTarget.x) * a; camTarget.y += (ty - camTarget.y) * a; camTarget.z += (tz - camTarget.z) * a;
      camDistSm = U.damp(camDistSm, dist, 6, dt);
    }
    const cp = Math.cos(pitch), fwx = Math.sin(yaw), fwz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const cx = camTarget.x - fwx * cp * camDistSm + rx * side, cy = camTarget.y + Math.sin(pitch) * camDistSm, cz = camTarget.z - fwz * cp * camDistSm + rz * side;
    const pos = tmpV.set(cx, cy, cz);
    const onDeckView = !!getDeck() && !S.swimming;
    // va chạm collider (nhà, cây...) dọc cần camera: co vào nhanh khi bị che, giãn ra chậm khi thoáng (không giật)
    {
      const full = Math.hypot(pos.x - camTarget.x, pos.y - camTarget.y, pos.z - camTarget.z);
      let want = full;
      const ph = PH();
      if (ph && ph.raycastXZ && full > 0.5 && mode !== 'shoot') {
        let h = null;
        try { h = ph.raycastXZ(camTarget, pos, 0.25, (camTarget.y + pos.y) * 0.5, { out: camHit, skipTag: 'npc' }); } catch (e) { h = null; }
        if (h) want = Math.max(1.0, h.t * full - 0.15);
      }
      if (S.camBoom < 0 || !dt || (want >= full && S.camBoom >= (S.camFull || 0) - 0.05)) S.camBoom = want; // không bị che: bám theo zoom ngay
      else S.camBoom = want < S.camBoom ? U.damp(S.camBoom, want, 25, dt) : U.damp(S.camBoom, want, 3.5, dt);
      if (S.camBoom < full - 1e-3) {
        const k = S.camBoom / full;
        pos.set(camTarget.x + (pos.x - camTarget.x) * k, camTarget.y + (pos.y - camTarget.y) * k, camTarget.z + (pos.z - camTarget.z) * k);
      } else S.camBoom = Math.min(S.camBoom, full);
      S.camFull = full;
    }
    // va chạm địa hình dọc đường nhìn
    if (!onDeckView) {
      for (let i = 1; i <= 4; i++) {
        const fr = i / 5;
        const sx = camTarget.x + (pos.x - camTarget.x) * fr, sy = camTarget.y + (pos.y - camTarget.y) * fr, sz = camTarget.z + (pos.z - camTarget.z) * fr;
        if (sy < groundH(sx, sz) + 0.25) {
          const k = Math.max(0.15, fr - 0.12);
          pos.set(camTarget.x + (pos.x - camTarget.x) * k, camTarget.y + (pos.y - camTarget.y) * k, camTarget.z + (pos.z - camTarget.z) * k);
          break;
        }
      }
    }
    const gy = groundH(pos.x, pos.z) + 0.35;
    if (pos.y < gy) pos.y = gy;
    if (isWater(pos.x, pos.z)) {
      const wy = waterH(pos.x, pos.z) + (S.swimming ? -0.2 : 0.3);
      if (pos.y < wy) pos.y = wy;
    }
    cam.position.copy(pos);
    if (mode === 'shoot') cam.lookAt(camTarget.x + fwx * 10 + rx * side, camTarget.y + 0.3 - Math.sin(pitch) * 4, camTarget.z + fwz * 10 + rz * side);
    else cam.lookAt(camTarget);
    const dr = st.drunk || 0;
    if (dr > 0.02) {
      cam.rotateZ(Math.sin(t * 0.9) * 0.1 * dr + Math.sin(t * 2.3) * 0.03 * dr);
      cam.rotateY(Math.sin(t * 0.6) * 0.04 * dr);
      cam.rotateX(Math.sin(t * 0.75 + 1) * 0.025 * dr);
    }
    const fov = mode === 'shoot' ? 48 : 60;
    if (Math.abs(fovSm - fov) > 0.05) {
      fovSm = dt ? U.damp(fovSm, fov, 8, dt) : fov;
      cam.fov = fovSm; cam.updateProjectionMatrix();
    }
  }

  // ======================================================================
  // API khác
  // ======================================================================
  P.teleport = function (v) {
    if (!v || !P.obj) return;
    P.obj.position.set(v.x, v.y, v.z);
    const g = groundH(v.x, v.z);
    const dk = deckFloor(v.x, v.z, v.y + 0.5);
    const floor = dk !== null ? Math.max(dk, g) : g;
    if (P.obj.position.y < floor) P.obj.position.y = floor;
    S.vel.set(0, 0, 0);
    S.onGround = Math.abs(P.obj.position.y - floor) < 0.3;
    S.onDeck = S.onGround && dk !== null;
    S.airTime = 0; S.swimming = false; S.flight = null; S.dodge = null; S.rescueT = 0;
    S.deckMat = null;
    S.simPos.copy(P.obj.position); S.prevPos.copy(P.obj.position); S.renderPos.copy(P.obj.position);
    S.renderValid = true; S.snap = true; S.visYOff = 0; S.jumpArc = false; S.camBoom = -1;
    S.camSnap = true;
    if (!P.boat) P.obj.rotation.set(0, P.facing, 0);
  };
  P.rodTip = function () {
    const out = V3();
    const h = P.hand; if (!h) return out;
    let tip = (h.userData && h.userData.tip && h.userData.tip.isObject3D) ? h.userData.tip : null;
    if (!tip) h.traverse((o) => { if (!tip && o !== h && (o.name === 'rodTip' || o.name === 'tip' || (o.userData && o.userData.isRodTip))) tip = o; });
    if (tip) return tip.getWorldPosition(out);
    P.obj.updateMatrixWorld(true);
    return h.localToWorld(out.set(0, 0.6, 1.8));
  };
  P.toggleShoot = function () { if (G.state.mode === 'shoot') exitShoot(); else if (G.state.mode === 'explore' || G.state.mode === 'boat') enterShoot(); };

  function faceWater(sp) {
    for (const r of [8, 15, 25, 40]) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        if (isWater(sp.x + Math.sin(a) * r, sp.z + Math.cos(a) * r)) return a;
      }
    }
    return P.facing;
  }

  function clearTransient() {
    if (C) loseCombat(null, true);
    while (dying.length) { disposeFishModel(dying[0].model); dying.shift(); }
    while (projectiles.length) removeProjectile(0);
    removeBoat();
    S.flight = null; S.dodge = null; S.override = null; S.spinX = 0; S.pendingHit = null;
  }

  function onEnvChanged() {
    clearTransient();
    P.cameraFocus = null;
    P.locked = false;
    S.boatHinted = false;
    const sp = getSpawn();
    P.facing = S.targetFacing = 0;
    P.teleport(sp);
    const a = faceWater(sp);
    P.facing = S.targetFacing = a;
    P.cameraYaw = a; P.cameraPitch = 0.3;
    P.obj.rotation.set(0, a, 0);
    S.camSnap = true;
    const m = G.state.mode;
    if (m !== 'menu' && m !== 'explore') G.setMode('explore');
  }

  function onWardenCaught() {
    if (C) loseCombat(null, true);
    removeBoat();
    if (G.state.mode === 'shoot') exitShoot();
    S.flight = null;
    P.teleport(getSpawn());
  }

  function onModeChanged(d) {
    if (!d) return;
    if (d.to === 'explore' || d.to === 'boat' || d.to === 'swim') {
      if (S.override && S.override.dur === 0) S.override = null;
    }
    if (d.to === 'dead') { S.override = null; if (C) loseCombat(null, true); }
    if (d.from === 'dead' && d.to !== 'dead') { S.deadT = 0; }
  }

  // ======================================================================
  // Vòng cập nhật
  // ======================================================================
  let deathFallback = 0;
  function update(dt, t) {
    if (!P.obj) return;
    const st = G.state;
    const blocked = !!G.input.blocked || st.mode === 'menu';
    if (dt <= 0) return;
    handleKeys(dt, blocked);
    trackDeck();
    // fallback nếu không có systems xử lý ngất
    if (st.hp <= 0 && st.mode !== 'dead') {
      deathFallback += dt;
      if (deathFallback > 1.5) { deathFallback = 0; clearTransient(); P.teleport(getSpawn()); st.hp = 50; G.setMode('explore'); toast('Bạn ngất xỉu và được đưa về bờ.', 'bad'); }
    } else deathFallback = 0;

    if (st.mode === 'dead') {
      S.speed = 0; S.inputMoving = false; S.vel.set(0, 0, 0);
      if (!P.boat) P.obj.rotation.set(0, P.facing, 0);
    } else if (S.flight) updateFlight(dt, t);
    else if (P.boat) {
      if (st.mode === 'explore' || st.mode === 'swim') G.setMode('boat');
      updateBoat(dt, t, blocked);
    } else runWalk(dt, t, blocked);

    updateCombat(dt, t, blocked);
    updateShoot(dt, blocked);
    updateProjectiles(dt);
    P.onGround = S.onGround; P.swimming = S.swimming;
    updateAnim(dt, t);
    updateCamera(dt, t, blocked);
  }

  P.init = function () {
    P.obj = buildCharacter();
    P.obj.rotation.order = 'YXZ'; // nghiêng theo thuyền quanh trục cục bộ
    P.pos = P.obj.position;
    G.scene.add(P.obj);
    S.pose = B();
    G.addUpdate(update, 30);
    G.bus.on('env:changed', onEnvChanged);
    G.bus.on('player:dragged', onDragged);
    G.bus.on('combat:start', onCombatStart);
    G.bus.on('warden:caught', onWardenCaught);
    G.bus.on('mode:changed', onModeChanged);
    // camera ban đầu
    if (G.camera) { G.camera.position.set(0, 4, -7); G.camera.lookAt(0, 1.5, 0); }
  };
})();
