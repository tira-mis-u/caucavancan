// fishing.js — cần câu, quăng câu, chờ cá cắn, giật câu, vật cá, kéo cá lên, thuốc nổ
(function () {
  const G = (window.G = window.G || {});
  const F = (G.fishing = G.fishing || {});

  // ================= Trạng thái công khai =================
  F.state = 'idle';          // 'idle'|'charging'|'casting'|'waiting'|'bite'|'fight'|'landing'
  F.active = false;          // đang cầm cần
  F.depth = 1.5;             // độ sâu thả mồi mong muốn (m)
  F.maxDepth = 0;            // độ sâu nước tại phao
  F.hookDepth = 0;           // độ sâu thực của lưỡi câu
  F.bobberPos = null;        // Vector3 điểm dây chạm nước (phao) hoặc null
  F.hookPos = null;          // Vector3 vị trí lưỡi câu
  F.technique = 'float';
  F.fight = null;            // {tension, fishStamina, distance, catchInfo, fishDir, hint, ...}
  F.quality = 0;             // 0..1 chất lượng kỹ thuật hiện tại (cuộn đều / nhịp nhấp)
  F.biteMult = 1;            // hệ số cắn câu hiện tại
  F.castPower = 0;
  F.sweetSpot = { min: 0.75, max: 0.9 };
  F.tangled = 0;             // giây còn lại bị rối dây

  // ================= Tiện ích =================
  const clamp = G.util.clamp;
  const lerp = G.util.lerp;
  const damp = G.util.damp;
  const rand = G.util.rand;
  const PI = Math.PI;
  const dampAngle = G.util.dampAngle;
  function emit(e, d) { if (G.bus) G.bus.emit(e, d); }
  function toast(m, t) { try { if (G.ui && G.ui.toast) G.ui.toast(m, t || 'info'); } catch (e) { } }
  function sfx(n, o) { try { if (G.audio && G.audio.play) G.audio.play(n, o); } catch (e) { } }
  function fx(name, a, b, c) { try { const f = G.fx; if (f && typeof f[name] === 'function') return f[name](a, b, c); } catch (e) { } }
  function floatText(pos, text, color) { if (pos) fx('floatText', pos.clone(), text, color || '#ffffff'); }
  function uiMeter(v, s) { try { if (G.ui && G.ui.setCastMeter) G.ui.setCastMeter(v, s); } catch (e) { } }
  let strikeShown = false;
  function uiStrike(on, p) {
    if (!on && !strikeShown) return;
    strikeShown = on;
    try { if (G.ui && G.ui.setStrikePrompt) G.ui.setStrikePrompt(on, p); } catch (e) { }
  }
  let curAnim = '';
  function setAnim(n, force) {
    if (!force && curAnim === n) return;
    curAnim = n;
    const P = G.player;
    if (P && P.setAnim) { try { P.setAnim(n); } catch (e) { } }
  }
  const K = (c) => !!(G.input && G.input.keys && G.input.keys[c]);
  const KP = (c) => !!(G.input && G.input.pressed && G.input.pressed(c));
  const mouse = () => (G.input && G.input.mouse) || {};
  let selfMode = false;
  function setModeSelf(m) {
    if (!G.setMode || G.state.mode === m) return;
    selfMode = true;
    try { G.setMode(m); } finally { selfMode = false; }
  }

  // ---- thế giới (defensive) ----
  function waterH(x, z) {
    const w = G.world;
    if (w && w.getWaterHeight) { const h = w.getWaterHeight(x, z); if (isFinite(h)) return h; }
    if (w && w.getWaterLevel) return w.getWaterLevel();
    return 0;
  }
  function isWater(x, z) { const w = G.world; return w && w.isWater ? !!w.isWater(x, z) : true; }
  function depthAt(x, z) { const w = G.world; if (w && w.getDepth) { const d = w.getDepth(x, z); return isFinite(d) ? d : 0; } return 3; }
  function groundH(x, z) { const w = G.world; if (w && w.groundHeight) { const h = w.groundHeight(x, z); return isFinite(h) ? h : -100; } return -100; }
  const condCache = { t: -1, x: 0, z: 0, c: null };
  function conditions(x, z) {
    if (condCache.c && G.time - condCache.t < 0.5 && Math.abs(condCache.x - x) + Math.abs(condCache.z - z) < 4) return condCache.c;
    let c = null;
    try { c = G.world && G.world.getConditions ? G.world.getConditions(x, z) : null; } catch (e) { }
    c = c || { time: G.state.time, isNight: false, light: 1, tide: 0, waterTemp: 22, weather: 'clear', waveHeight: 0.1, env: G.state.env };
    condCache.t = G.time; condCache.x = x; condCache.z = z; condCache.c = c;
    return c;
  }
  function wind() { const c = condCache.c; return (c && c.wind) || { x: 0, z: 0 }; }
  function isAirplane() {
    const w = G.world;
    return G.state.env === 'airplane' || !!(w && w.current && w.current.waterBody === 'sky');
  }

  // ---- trang bị ----
  function eq() {
    const s = G.state;
    if (!s.equipped) s.equipped = { rod: 'rod_bamboo', line: 'line_basic', bait: 'bait_worm' };
    return s.equipped;
  }
  function item(id) { return id && G.data && G.data.item ? G.data.item(id) : null; }
  const DEF_ROD = { id: 'rod_bamboo', name: 'Cần trúc tre', technique: 'float', power: 8, maxWeight: 8, castRange: 18, sensitivity: 0.5, reelSpeed: 2, color: 0xc8a165 };
  function rodD() { return item(eq().rod) || (G.data && G.data.RODS && G.data.RODS[0]) || DEF_ROD; }
  function lineD() { return item(eq().line) || { id: 'line_basic', name: 'Dây cước', strength: 10 }; }
  function baitD() { return item(eq().bait); }
  function invCount(id) { const inv = G.state.inventory || {}; return inv[id] || 0; }
  function owns(list, id) { const arr = G.state[list]; return !Array.isArray(arr) || arr.indexOf(id) >= 0; }
  function hasBait() { const b = baitD(); return !!b && invCount(b.id) > 0; }
  // độ vững của thuyền đang đứng (0 = trên bờ, 1 = tàu thép)
  function boatStability() {
    const id = G.state.onBoat;
    if (!id || G.state.mode === 'swim') return 0;
    const b = item(id);
    return b && typeof b.stability === 'number' ? clamp(b.stability, 0, 1) : 0;
  }
  function playerStrength() {
    const s = G.state;
    let buff = 0;
    if (s.buffs && typeof s.buffs.strength === 'number') buff += s.buffs.strength;
    else if (s.buffs && s.buffs.strength && typeof s.buffs.strength.amount === 'number') buff += s.buffs.strength.amount;
    if (typeof s.strengthBuff === 'number') buff += s.strengthBuff;
    return 15 + buff;
  }
  function fishLength(sp, kg) {
    try { if (G.fish && G.fish.lengthFromWeight && sp) { const l = G.fish.lengthFromWeight(sp, kg); if (l > 0) return l; } } catch (e) { }
    return 0.42 * Math.cbrt(Math.max(0.01, kg));
  }

  // ================= Vector tạm =================
  let V3, UP, tipW, handW, aimV, rightV, entry, hook, lure, tmpA, tmpB, tmpC, invQ, axisV, bendTarget, qTmp, castFrom, castTo;

  // ================= Mô hình cần câu =================
  const ROD_STYLE = {
    rod_bamboo: { len: 4.2, r0: 0.026, r1: 0.006, reel: 'none', guides: false, nodes: true },
    rod_spin: { len: 2.4, r0: 0.016, r1: 0.004, reel: 'spin', reelSize: 1.0, accent: 0x3388ff },
    rod_vertical: { len: 1.8, r0: 0.022, r1: 0.007, reel: 'drum', reelSize: 1.1, accent: 0xffd040 },
    rod_horizontal: { len: 3.6, r0: 0.02, r1: 0.005, reel: 'spin', reelSize: 1.3, accent: 0xddaa33 },
    rod_carbon: { len: 2.7, r0: 0.018, r1: 0.004, reel: 'spin', reelSize: 1.15, accent: 0xdd2222, gloss: true },
    rod_steel: { len: 3.0, r0: 0.026, r1: 0.008, reel: 'spin', reelSize: 1.5, metal: true, accent: 0x445566 },
    rod_titan: { len: 3.3, r0: 0.03, r1: 0.009, reel: 'drum', reelSize: 1.9, metal: true, glow: true, accent: 0xff5500 },
  };
  const SEG_N = 10;
  const rod = { id: null, root: null, segs: [], tip: null, weights: [], reelHandle: null, glowMats: [], len: 2.5, yaw: 0, elev: 0.9, bend: null, twitch: 0, lean: 0 };

  function styleFor(data) {
    if (ROD_STYLE[data.id]) return ROD_STYLE[data.id];
    const t = data.technique;
    if (t === 'float') return ROD_STYLE.rod_bamboo;
    if (t === 'vertical') return ROD_STYLE.rod_vertical;
    if (t === 'horizontal') return ROD_STYLE.rod_horizontal;
    return ROD_STYLE.rod_spin;
  }

  function buildRod(id) {
    if (rod.root) { G.disposeObject ? G.disposeObject(rod.root) : rod.root.parent && rod.root.parent.remove(rod.root); }
    const data = item(id) || rodD();
    const st = styleFor(data);
    const root = new THREE.Group();
    root.name = 'fishingRod';
    root.rotation.order = 'YXZ';
    rod.glowMats = [];
    const mat = new THREE.MeshStandardMaterial({
      color: data.color != null ? data.color : 0x886644,
      roughness: st.metal ? 0.28 : st.gloss ? 0.25 : 0.6,
      metalness: st.metal ? 0.85 : st.gloss ? 0.3 : 0.05,
      emissive: st.glow ? 0xaa6600 : 0x000000, emissiveIntensity: st.glow ? 0.6 : 0,
    });
    if (st.glow) rod.glowMats.push(mat);
    const gripMat = new THREE.MeshStandardMaterial({ color: st.nodes ? 0xa07a45 : st.glow ? 0x332200 : 0x9b7653, roughness: 0.95 });
    const accentMat = new THREE.MeshStandardMaterial({ color: st.accent || 0xcc9922, metalness: 0.6, roughness: 0.35, emissive: st.glow ? 0x552200 : 0, emissiveIntensity: st.glow ? 0.5 : 0 });
    // tay cầm
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(st.r0 * 1.5, st.r0 * 1.7, 0.5, 8), gripMat);
    butt.position.y = -0.1; butt.castShadow = true; root.add(butt);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(st.r0 * 1.8, 8, 6), accentMat);
    cap.position.y = -0.36; root.add(cap);
    if (!st.nodes) {
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(st.r0 * 1.25, st.r0 * 1.25, 0.14, 8), accentMat);
      seat.position.y = 0.21; root.add(seat);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(st.r0 * 1.15, st.r0 * 1.4, 0.18, 8), gripMat);
      fore.position.y = 0.37; root.add(fore);
    }
    // khúc cần (chuỗi đốt uốn cong)
    rod.segs = []; rod.weights = [];
    const segLen = st.len / SEG_N;
    let parent = root, wsum = 0;
    const guideSide = st.reel === 'drum' ? -1 : 1; // spin: khoen phía dưới (+Z), drum: phía trên (-Z)
    for (let i = 0; i < SEG_N; i++) {
      const t0 = i / SEG_N, t1 = (i + 1) / SEG_N;
      const rA = lerp(st.r0, st.r1, t0), rB = lerp(st.r0, st.r1, t1);
      const g = new THREE.Group();
      g.position.y = i === 0 ? 0.15 : segLen;
      parent.add(g);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rB, rA, segLen * 1.01, 7), mat);
      m.position.y = segLen / 2; m.castShadow = true;
      g.add(m);
      if (st.nodes && i > 0) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rA * 1.05, rA * 0.3, 4, 10), gripMat);
        ring.rotation.x = PI / 2; g.add(ring);
      }
      if (!st.nodes && (i === 2 || i === 4 || i === 6 || i === 8 || i === 9)) {
        const gr = 0.006 + (1 - t0) * 0.018 * (st.reelSize || 1);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(gr, 0.0018, 4, 12), accentMat);
        ring.rotation.x = PI / 2;
        ring.position.set(0, 0.02, guideSide * (rA + gr + 0.006));
        g.add(ring);
        const stand = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, gr + 0.008), accentMat);
        stand.position.set(0, 0.02, guideSide * (rA + gr * 0.5 + 0.002));
        g.add(stand);
      }
      if (st.glow && i % 3 === 1) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(rA * 1.1, rA * 0.25, 4, 10), accentMat);
        band.rotation.x = PI / 2; band.position.y = segLen * 0.5; g.add(band);
      }
      const w = Math.pow(i + 1, 1.6);
      rod.weights.push(w); wsum += w;
      rod.segs.push(g);
      parent = g;
    }
    rod.weights = rod.weights.map((w) => w / wsum);
    const tip = new THREE.Object3D();
    tip.position.y = segLen;
    parent.add(tip);
    if (!st.nodes) {
      const tt = new THREE.Mesh(new THREE.SphereGeometry(st.r1 * 1.6, 6, 4), accentMat);
      tt.position.y = segLen; parent.add(tt);
    }
    rod.tip = tip;
    rod.len = st.len;
    // máy câu
    rod.reelHandle = null;
    if (st.reel !== 'none') buildReel(root, st);
    root.visible = false;
    G.scene.add(root);
    rod.root = root;
    rod.id = data.id;
  }

  function buildReel(root, st) {
    const s = st.reelSize || 1;
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: st.glow ? 0xffc233 : 0x2a2d33, metalness: 0.75, roughness: 0.35, emissive: st.glow ? 0x664400 : 0, emissiveIntensity: st.glow ? 0.6 : 0 });
    if (st.glow) rod.glowMats.push(bodyMat);
    const spoolMat = new THREE.MeshStandardMaterial({ color: st.glow ? 0xfff0a0 : 0xb8bcc4, metalness: 0.9, roughness: 0.2 });
    const accMat = new THREE.MeshStandardMaterial({ color: st.accent || 0xd0a020, metalness: 0.5, roughness: 0.4 });
    const knobMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    const h = new THREE.Group();
    if (st.reel === 'spin') {
      g.position.set(0, 0.21, 0);
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.012 * s, 0.025 * s, 0.07 * s), bodyMat);
      stem.position.z = 0.04 * s; g.add(stem);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.028 * s, 0.034 * s, 0.07 * s, 12), bodyMat);
      body.position.set(0, -0.01 * s, 0.09 * s); g.add(body);
      const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.036 * s, 0.032 * s, 0.035 * s, 14), spoolMat);
      spool.position.set(0, 0.04 * s, 0.09 * s); g.add(spool);
      const lineWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.03 * s, 14), accMat);
      lineWrap.position.set(0, 0.04 * s, 0.09 * s); lineWrap.scale.set(1.02, 0.9, 1.02); g.add(lineWrap);
      const bail = new THREE.Mesh(new THREE.TorusGeometry(0.04 * s, 0.003 * s, 4, 16, PI), spoolMat);
      bail.position.set(0, 0.045 * s, 0.09 * s); bail.rotation.x = PI / 2; g.add(bail);
      h.position.set(0.04 * s, -0.01 * s, 0.09 * s);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006 * s, 0.006 * s, 0.06 * s), bodyMat);
      arm.position.z = 0.03 * s; h.add(arm);
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.009 * s, 0.009 * s, 0.03 * s, 8), knobMat);
      knob.rotation.z = PI / 2; knob.position.set(0.015 * s, 0, 0.06 * s); h.add(knob);
    } else {
      // máy ngang / trống lớn ở phía trên (-Z)
      g.position.set(0, 0.2, 0);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.038 * s, 0.038 * s, 0.07 * s, 16), spoolMat);
      drum.rotation.z = PI / 2; drum.position.z = -0.055 * s; g.add(drum);
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.034 * s, 0.034 * s, 0.06 * s, 16), accMat);
      wrap.rotation.z = PI / 2; wrap.position.z = -0.055 * s; wrap.scale.set(1.08, 1, 1.08); g.add(wrap);
      for (const sx of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 0.012 * s, 16), bodyMat);
        plate.rotation.z = PI / 2; plate.position.set(sx * 0.041 * s, 0, -0.055 * s); g.add(plate);
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.03 * s, 0.08 * s, 0.03 * s), bodyMat);
      base.position.z = -0.02 * s; g.add(base);
      h.position.set(0.055 * s, 0, -0.055 * s);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006 * s, 0.08 * s, 0.01 * s), bodyMat);
      h.add(arm);
      for (const sy of [-1, 1]) {
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.01 * s, 0.01 * s, 0.025 * s, 8), knobMat);
        knob.rotation.z = PI / 2; knob.position.set(0.014 * s, sy * 0.04 * s, 0); h.add(knob);
      }
    }
    g.add(h);
    rod.reelHandle = h;
    root.add(g);
  }

  // ================= Dây, phao, mồi =================
  const LINE_N = 40;
  let lineObj, lineGeo, underObj, underGeo, bobber, lureMesh, lureMat, shadowMesh;
  const LINE_COLORS = { line_basic: 0xe8e8e8, line_nylon: 0x9ad8ff, line_braid: 0x3ccf5a, line_steel: 0xa0a8b2, line_carrier: 0x1c1c1c };
  const BAIT_COLORS = {
    bait_worm: 0xb5651d, bait_bread: 0xf5deb3, bait_corn: 0xffd700, bait_shrimp: 0xff8c69, bait_lure: 0xdddddd, bait_jig: 0xff3355,
    bait_frog: 0x55aa33, bait_chicken: 0xc87533, bait_pate: 0x8b5a3c, bait_beer: 0xd4a017, bait_glow: 0x66ffcc, bait_meat: 0xa01818, bait_nuke: 0x44ff33,
  };

  function buildLineObjects() {
    lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_N * 3), 3));
    lineObj = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.9 }));
    lineObj.frustumCulled = false; lineObj.visible = false; lineObj.renderOrder = 2;
    G.scene.add(lineObj);
    underGeo = new THREE.BufferGeometry();
    underGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(UNDER_N * 3), 3));
    underObj = new THREE.Line(underGeo, new THREE.LineBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.35 }));
    underObj.frustumCulled = false; underObj.visible = false;
    G.scene.add(underObj);

    bobber = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xff2222, roughness: 0.4, emissive: 0x330000 });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 6, 0, PI * 2, 0, PI / 2), red);
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 6, 0, PI * 2, PI / 2, PI / 2), white);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 5), new THREE.MeshStandardMaterial({ color: 0xffee22 }));
    ant.position.y = 0.09;
    const tipBall = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 0.8 }));
    tipBall.position.y = 0.165;
    bobber.add(top, bot, ant, tipBall);
    bobber.scale.setScalar(1.5);
    bobber.visible = false;
    G.scene.add(bobber);

    lureMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.5, roughness: 0.35 });
    lureMesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), lureMat);
    body.scale.set(0.7, 1.3, 0.45);
    const hookM = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.003, 4, 10, PI * 1.3), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.3 }));
    hookM.position.y = -0.04; hookM.rotation.z = PI * 0.6;
    lureMesh.add(body, hookM);
    lureMesh.visible = false;
    G.scene.add(lureMesh);

    shadowMesh = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshBasicMaterial({ color: 0x001820, transparent: true, opacity: 0.35, depthWrite: false }));
    shadowMesh.rotation.order = 'YXZ';
    shadowMesh.visible = false;
    G.scene.add(shadowMesh);
  }

  function refreshLineLook() {
    const ln = lineD();
    const c = LINE_COLORS[ln.id] != null ? LINE_COLORS[ln.id] : 0xe8e8e8;
    lineObj.material.color.setHex(c);
    lineObj.material.opacity = ln.id === 'line_basic' ? 0.75 : 0.95;
    underObj.material.color.setHex(c);
    const b = baitD();
    const bc = b && BAIT_COLORS[b.id] != null ? BAIT_COLORS[b.id] : 0xb5651d;
    lureMat.color.setHex(bc);
    const glow = b && (b.id === 'bait_glow' || b.id === 'bait_nuke');
    lureMat.emissive.setHex(glow ? bc : 0x000000);
    lureMat.emissiveIntensity = glow ? 1.2 : 0;
    lureMat.metalness = b && (b.id === 'bait_lure' || b.id === 'bait_jig') ? 0.85 : 0.1;
    const big = b && (b.id === 'bait_meat' || b.id === 'bait_chicken') ? 2.6 : 1;
    lureMesh.scale.setScalar(big);
  }

  // ---- Dây verlet (G.physics.Rope): đầu cần → phao/mồi (trên mặt nước) và phao → lưỡi (dưới nước) ----
  const UNDER_N = 12;
  let ropeTop = null, ropeUnder = null, lineDt = 1 / 60;
  function ensureRopes() {
    if (ropeTop || !G.physics || !G.physics.Rope) return !!ropeTop;
    ropeTop = new G.physics.Rope(LINE_N - 1, 1);
    ropeUnder = new G.physics.Rope(UNDER_N - 1, 1);
    return true;
  }
  const ROPE_TOP_OPT = { slack: 0, extra: 0, length: null, wind: null, airDrag: 0.9, waterDrag: 10, waterGravity: 0.05, iterations: 14, floatOnWater: true, collideGround: true };
  const ROPE_UNDER_OPT = { slack: 0, extra: 0, length: null, wind: null, airDrag: 0.5, waterDrag: 7, waterGravity: 0.35, iterations: 10, floatOnWater: false, collideGround: true };
  // slack 0..~0.55 như trước: quy đổi sang độ dư chiều dài thực (dây thật thì võng theo trọng lực + gió)
  function drawLine(P0, E, slack, fixedLen) {
    if (!ensureRopes()) return drawLineCurve(P0, E, slack);
    const o = ROPE_TOP_OPT;
    o.slack = 0.075 * slack * slack; o.extra = slack * 0.06; o.length = fixedLen != null ? fixedLen : null;
    const w = wind(); o.wind = w;
    ropeTop.update(lineDt, P0, E, o);
    ropeTop.writeTo(lineGeo.attributes.position.array);
    lineGeo.attributes.position.needsUpdate = true;
    lineObj.visible = true;
  }
  function drawUnder(A, B, slack) {
    if (!ensureRopes()) {
      const arr = underGeo.attributes.position.array;
      for (let i = 0; i < UNDER_N; i++) { const u = i / (UNDER_N - 1); arr[i * 3] = lerp(A.x, B.x, u); arr[i * 3 + 1] = lerp(A.y, B.y, u); arr[i * 3 + 2] = lerp(A.z, B.z, u); }
    } else {
      const o = ROPE_UNDER_OPT;
      o.slack = 0.04 * (slack || 0); o.extra = 0.05 * (slack || 0);
      ropeUnder.update(lineDt, A, B, o);
      ropeUnder.writeTo(underGeo.attributes.position.array);
    }
    underGeo.attributes.position.needsUpdate = true;
    underObj.visible = true;
  }
  // độ căng dây ước lượng từ mô phỏng (0 = chùng, 1 = thẳng căng) để uốn cần
  function ropeTension() { return ropeTop && lineObj && lineObj.visible ? ropeTop.tension : 0; }
  // dự phòng khi không có G.physics: đường cong parabol như cũ
  function drawLineCurve(P0, E, slack) {
    const arr = lineGeo.attributes.position.array;
    const dist = P0.distanceTo(E);
    const sag = slack * (dist * 0.16 + 0.05);
    const w = wind();
    const wl = slack * 0.035 * dist;
    const minY = Math.min(P0.y, E.y);
    for (let i = 0; i < LINE_N; i++) {
      const t = i / (LINE_N - 1);
      const k = 4 * t * (1 - t);
      const x = lerp(P0.x, E.x, t) + w.x * wl * k;
      let y = lerp(P0.y, E.y, t) - sag * k;
      const z = lerp(P0.z, E.z, t) + w.z * wl * k;
      if (t > 0.03 && t < 0.999 && y < minY + 0.6) {
        const wh = waterH(x, z);
        if (y < wh + 0.01 && isWater(x, z)) y = wh + 0.01;
        else { const gh = groundH(x, z); if (y < gh + 0.03) y = gh + 0.03; }
      }
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
    lineGeo.attributes.position.needsUpdate = true;
    lineObj.visible = true;
  }

  // ================= Biến nội bộ phiên câu =================
  let prevMode = 'explore';
  let charge = null;      // {phase, power}
  let cast = null;        // {t,T,from,to,h,water,vertical,retrieve}
  let wait = null;        // dữ liệu chờ cá
  let bite = null;        // dữ liệu cá cắn
  let fs = null;          // dữ liệu vật cá nội bộ
  let landing = null;     // trình diễn cá
  let perfectT = 0;
  let reelLoop = null;
  const timers = [];
  const dynamites = [];
  let lastCorrectFx = 0;

  function lineOut() { return F.state === 'casting' || F.state === 'waiting' || F.state === 'bite' || F.state === 'fight'; }

  function handPos(out) {
    const P = G.player;
    if (P && P.hand && P.hand.getWorldPosition) { P.hand.getWorldPosition(out); return out; }
    if (P && P.pos) { out.copy(P.pos); out.y += 1.3; return out; }
    return out.set(0, 1.3, 0);
  }
  function playerPos(out) {
    const P = G.player;
    if (P && P.pos) return out.copy(P.pos);
    if (P && P.obj) return out.copy(P.obj.position);
    return out.set(0, 0, 0);
  }
  function aimDir(out) {
    const P = G.player;
    let d = null;
    if (P && P.getAimDirection) { try { d = P.getAimDirection(); } catch (e) { d = null; } }
    if (d) out.set(d.x, 0, d.z);
    else if (G.camera) { G.camera.getWorldDirection(out); out.y = 0; }
    if (out.lengthSq() < 1e-6) { const f = (P && P.facing) || 0; out.set(Math.sin(f), 0, Math.cos(f)); }
    return out.normalize();
  }

  // ================= Cầm / cất cần =================
  function ensureOwnedRod() {
    const e = eq();
    if (owns('ownedRods', e.rod) && item(e.rod)) return true;
    const arr = G.state.ownedRods;
    if (Array.isArray(arr) && arr.length) { e.rod = arr[0]; return true; }
    return false;
  }
  function activate() {
    if (!ensureOwnedRod()) { toast('Bạn không còn cái cần câu nào! Ra tiệm mua đi.', 'bad'); return false; }
    if (rod.id !== eq().rod || !rod.root) buildRod(eq().rod);
    rod.root.visible = true;
    F.active = true;
    F.state = 'idle';
    refreshLineLook();
    if (!hasBait()) autoSelectBait(true);
    setAnim('idle', true);
    return true;
  }
  function deactivate() {
    cleanupLine(true);
    if (rod.root) rod.root.visible = false;
    F.active = false;
    F.state = 'idle';
    if (G.player) { G.player.locked = false; G.player.cameraFocus = null; }
    uiMeter(null);
  }

  // dọn mọi thứ liên quan dây đang thả
  function cleanupLine(external) {
    if (fs) {
      const ci = fs.ci;
      disposeFight();
      if (external) emit('fight:end', { result: 'escaped', catchInfo: ci });
    }
    if (landing) { if (landing.model && landing.model.parent) landing.model.parent.remove(landing.model); landing = null; }
    charge = null; cast = null; wait = null; bite = null;
    F.bobberPos = null; F.hookPos = null; F.fight = null;
    uiMeter(null); uiStrike(false);
    stopReelSound();
    if (lineObj) { lineObj.visible = false; underObj.visible = false; bobber.visible = false; lureMesh.visible = false; shadowMesh.visible = false; }
    if (G.player) G.player.cameraFocus = null;
    if (F.active) F.state = 'idle';
  }

  function cancelLine(silent) {
    if (F.state === 'fight') { cutLine(); return; }
    if (lineOut()) {
      if (!silent) sfx('reel');
      if (F.bobberPos) fx('ripple', F.bobberPos.clone(), 0.3);
    }
    cleanupLine(false);
    F.state = 'idle';
  }
  function cutLine() {
    if (!fs) return;
    toast('Cắt dây! Thả cá đi.', 'warn');
    sfx('line_snap');
    endFight('escaped');
  }

  // ================= Trang bị API =================
  F.setRod = function (id) {
    const r = item(id);
    if (!r || r.type !== 'rod') return false;
    if (!owns('ownedRods', id)) { toast('Bạn chưa có ' + r.name + '.', 'bad'); return false; }
    if (F.state === 'fight') { toast('Đang vật cá, đổi cần sao được!', 'warn'); return false; }
    if (lineOut() || F.state === 'charging') cancelLine(true);
    eq().rod = id;
    F.technique = r.technique;
    if (F.active) { buildRod(id); rod.root.visible = true; }
    const techName = { float: 'câu phao', spin: 'cuộn mồi giả', vertical: 'câu dọc', horizontal: 'câu lục/đáy' }[r.technique] || r.technique;
    toast('🎣 ' + r.name + ' — kỹ thuật: ' + techName, 'info');
    emit('equip:changed', { slot: 'rod', id });
    return true;
  };
  F.setLine = function (id) {
    const l = item(id);
    if (!l || l.type !== 'line') return false;
    if (!owns('ownedLines', id)) { toast('Bạn chưa có ' + l.name + '.', 'bad'); return false; }
    if (F.state === 'fight') { toast('Đang vật cá, thay dây sao được!', 'warn'); return false; }
    eq().line = id;
    if (lineObj) refreshLineLook();
    toast('🧵 ' + l.name, 'info');
    emit('equip:changed', { slot: 'line', id });
    return true;
  };
  F.setBait = function (id) {
    const b = item(id);
    if (!b || b.type !== 'bait') return false;
    if (invCount(id) <= 0) { toast('Hết ' + b.name + ' rồi!', 'bad'); return false; }
    eq().bait = id;
    if (lineObj) refreshLineLook();
    toast((b.icon || '') + ' Mồi: ' + b.name, 'info');
    emit('equip:changed', { slot: 'bait', id });
    return true;
  };
  F.equipped = function () { return { rod: rodD(), line: lineD(), bait: baitD() }; };
  F.rodTip = function () { return tipW ? tipW.clone() : null; };
  F.isLineOut = lineOut;

  function autoSelectBait(silent) {
    const baits = (G.data && G.data.BAITS) || [];
    const tech = rodD().technique;
    let best = null;
    for (const b of baits) {
      if (invCount(b.id) <= 0) continue;
      const fit = b.forTech && b.forTech.indexOf(tech) >= 0;
      if (!best || (fit && !best.fit)) best = { b, fit };
    }
    if (best) {
      eq().bait = best.b.id;
      if (lineObj) refreshLineLook();
      if (!silent) toast('Tự đổi sang mồi: ' + best.b.name, 'info');
      return true;
    }
    if (!silent) toast('Hết sạch mồi! Câu không mồi chỉ vớt được rác thôi.', 'warn');
    return false;
  }
  function cycleRod() {
    const arr = (Array.isArray(G.state.ownedRods) ? G.state.ownedRods : ['rod_bamboo']).filter((id) => item(id));
    if (arr.length <= 1) { toast('Bạn chỉ có một cây cần.', 'info'); return; }
    const i = arr.indexOf(eq().rod);
    F.setRod(arr[(i + 1) % arr.length]);
  }
  function cycleBait() {
    const baits = ((G.data && G.data.BAITS) || []).filter((b) => invCount(b.id) > 0);
    if (!baits.length) { toast('Không còn mồi nào!', 'bad'); return; }
    const i = baits.findIndex((b) => b.id === eq().bait);
    F.setBait(baits[(i + 1) % baits.length].id);
  }
  function consumeBait() {
    const b = baitD();
    if (!b || b.reusable) return;
    const inv = G.state.inventory || (G.state.inventory = {});
    if ((inv[b.id] || 0) > 0) {
      inv[b.id]--;
      if (inv[b.id] <= 0) { toast('Hết ' + b.name + '!', 'warn'); autoSelectBait(false); }
    }
  }
  function loseBait(chance) {
    const b = baitD();
    if (!b || b.reusable || Math.random() > chance) return;
    const inv = G.state.inventory || {};
    if ((inv[b.id] || 0) > 0) {
      inv[b.id]--;
      toast('Cá ăn mất mồi rồi! (-1 ' + b.name + ')', 'warn');
      if (inv[b.id] <= 0) autoSelectBait(false);
    }
  }

  // ================= Quăng câu =================
  function tri(p) { const v = p % 2; return v < 1 ? v : 2 - v; }

  function startCharging() {
    charge = { phase: 0, power: 0 };
    F.state = 'charging';
    F.castPower = 0;
  }
  function updateCharging(dt, t, inp) {
    const r = rodD();
    const drunk = G.state.drunk || 0;
    const speed = 0.65 + (r.castRange || 20) / 80;
    const wobble = 1 + drunk * (0.9 * Math.sin(t * 5.3) + 0.5 * Math.sin(t * 13.1));
    charge.phase += dt * speed * Math.max(0.15, wobble);
    let p = tri(charge.phase);
    if (drunk > 0) p = clamp(p + drunk * 0.07 * Math.sin(t * 17.3), 0, 1);
    charge.power = p;
    F.castPower = p;
    const ss = { min: 0.75 + drunk * 0.03, max: 0.9 - drunk * 0.04, center: 0.825 };
    F.sweetSpot = ss;
    uiMeter(p, ss);
    const m = mouse();
    if (!inp) { charge = null; F.state = 'idle'; uiMeter(null); return; }
    if (KP('Escape')) { charge = null; F.state = 'idle'; uiMeter(null); return; }
    if (!m.left || m.leftReleased) releaseCast();
  }

  function releaseCast() {
    const p = charge ? charge.power : 0.5;
    charge = null;
    uiMeter(null);
    const ss = F.sweetSpot;
    if (p > 0.95 && Math.random() < 0.45 + (p - 0.95) * 10) {
      F.tangled = 2;
      F.state = 'idle';
      toast('Rối dây! Gỡ mất 2 giây... (quăng quá mạnh)', 'bad');
      sfx('fail');
      floatText(tipW.clone().add(tmpA.set(0, 0.4, 0)), 'Rối dây!', '#ff5555');
      setAnim('cast', true);
      return;
    }
    const perfect = p >= ss.min && p <= ss.max;
    let acc = perfect ? 1 : clamp(1 - Math.abs(p - 0.825) * 1.6, 0.25, 0.92);
    if (p > 0.95) acc *= 0.7;
    acc *= 1 - (G.state.drunk || 0) * 0.4;
    doCast(Math.max(0.06, p), acc, perfect);
  }

  function doCast(p, acc, perfect) {
    const r = rodD();
    const tech = r.technique;
    const drunk = G.state.drunk || 0;
    aimDir(aimV);
    const from = castFrom.copy(tipW);
    conditions(from.x, from.z);
    const air = isAirplane();
    lure.copy(from);
    cast = { t: 0, T: 1, from, to: castTo, h: 2, water: true, vertical: false, retrieve: false, midAirChecked: 0 };
    // Câu dọc: thả thẳng xuống dưới đầu cần nếu dưới là nước (thuyền/máy bay/cầu cảng)
    if (tech === 'vertical') {
      const bx = from.x + aimV.x * 0.8, bz = from.z + aimV.z * 0.8;
      if (air || isWater(bx, bz)) {
        const wy = waterH(bx, bz);
        castTo.set(bx, wy, bz);
        const drop = Math.max(0.5, from.y - wy);
        cast.T = clamp(Math.sqrt(2 * drop / 9.8) * 1.3, 0.35, 7);
        cast.vertical = true;
        cast.h = 0;
        F.state = 'casting';
        setAnim('cast', true);
        sfx('whoosh');
        if (drop > 30) toast('Thả dây xuống biển... ' + Math.round(drop) + 'm!', 'info');
        emit('cast', { pos: castTo.clone(), power: p, accuracy: 1 });
        rod.elev = 1.3;
        return;
      }
    }
    let dist = Math.max(1.5, p * (r.castRange || 20));
    if (perfect) dist *= 1.06;
    let err = (1 - acc) * rand(-0.4, 0.4) + drunk * rand(-0.35, 0.35);
    const c = Math.cos(err), s = Math.sin(err);
    const dx = aimV.x * c + aimV.z * s, dz = -aimV.x * s + aimV.z * c;
    const T = 0.45 + dist / 28;
    const w = wind();
    let tx = from.x + dx * dist + w.x * T * 0.35;
    let tz = from.z + dz * dist + w.z * T * 0.35;
    const b = G.world && G.world.getBounds ? G.world.getBounds() : null;
    if (b) { tx = clamp(tx, b.minX + 1, b.maxX - 1); tz = clamp(tz, b.minZ + 1, b.maxZ - 1); }
    let water = isWater(tx, tz);
    if (!water) {
      // Quăng quá đà qua mặt nước: mồi đập bờ bên kia rồi rơi xuống điểm nước xa nhất trên đường bay
      const ox = tx - from.x, oz = tz - from.z, steps = Math.ceil(dist / 0.5);
      for (let k = steps - 1; k > 2; k--) {
        const u = k / steps, px = from.x + ox * u, pz = from.z + oz * u;
        if (isWater(px, pz) && depthAt(px, pz) > 0.4) {
          const back = Math.max(0, k - 3) / steps; // lùi ~1.5m khỏi mép bờ
          tx = from.x + ox * back; tz = from.z + oz * back;
          if (!isWater(tx, tz)) { tx = px; tz = pz; }
          water = true;
          toast('Quăng hơi quá tay — mồi rơi sát bờ bên kia.', 'info');
          break;
        }
      }
    }
    castTo.set(tx, water ? waterH(tx, tz) : groundH(tx, tz) + 0.05, tz);
    if (castTo.y < -500) castTo.y = from.y - 2;
    cast.T = T;
    cast.h = 1.2 + dist * 0.28;
    cast.water = water;
    // Bay đạn đạo thật: trọng lực + cản không khí bậc hai + gió. Giải vận tốc ban đầu để rơi đúng điểm castTo
    // (giữ nguyên logic điểm rơi), quỹ đạo tích phân bước cố định 1/120s → xác định, cong theo gió.
    if (G.physics && G.physics.solveLaunch) {
      const Tf = clamp(0.6 + dist / 20, 0.6, 4.5);
      const k = 0.012;
      const sol = G.physics.solveLaunch(from, castTo, Tf, k, { x: w.x, z: w.z }, 1 / 120, {});
      cast.ball = { x: from.x, y: from.y, z: from.z, vx: sol.vx, vy: sol.vy, vz: sol.vz, px: from.x, py: from.y, pz: from.z, n: 0, steps: sol.steps, h: sol.h, acc: 0, k, wx: w.x, wz: w.z };
      cast.T = sol.T;
    }
    F.state = 'casting';
    setAnim('cast', true);
    sfx('whoosh');
    sfx('cast');
    rod.elev = 1.8;
    emit('cast', { pos: castTo.clone(), power: p, accuracy: acc });
    if (perfect) {
      perfectT = 25;
      floatText(from.clone().add(tmpA.set(0, 0.5, 0)), 'Quăng hoàn hảo!', '#7CFC00');
      toast('Quăng hoàn hảo! Cá dễ cắn hơn.', 'good');
      fx('sparkle', from.clone(), 0x9cff6a);
    }
  }

  const ballWind = { x: 0, z: 0 };
  function updateCasting(dt, t) {
    if (cast.retrieve) {
      cast.t += dt;
      const u = Math.min(1, cast.t / 0.9);
      lure.lerpVectors(cast.to, tipW, u * u);
      lure.y += Math.sin(u * PI) * 0.6;
      if (u >= 1) { cast = null; F.state = 'idle'; }
      return;
    }
    cast.t += dt;
    const u = Math.min(1, cast.t / cast.T);
    if (cast.vertical) {
      lure.lerpVectors(cast.from, cast.to, u * u);
      // cá bay có thể đớp mồi giữa không trung (máy bay)
      if (isAirplane() && u < 0.95 && u > 0.1) {
        cast.midAirChecked += dt;
        if (cast.midAirChecked > 0.5) {
          cast.midAirChecked = 0;
          if (Math.random() < 0.035 && tryMidAirBite()) return;
        }
      }
    } else if (cast.ball) {
      const B = cast.ball, wnd = ballWind;
      wnd.x = B.wx; wnd.z = B.wz;
      B.acc += dt;
      while (B.acc >= B.h && B.n < B.steps) {
        B.acc -= B.h; B.n++;
        B.px = B.x; B.py = B.y; B.pz = B.z;
        G.physics.ballisticStep(B, B.h, B.k, wnd);
      }
      if (B.n >= B.steps) { lure.copy(cast.to); landCast(); return; }
      const a = clamp(B.acc / B.h, 0, 1);
      lure.set(lerp(B.px, B.x, a), lerp(B.py, B.y, a), lerp(B.pz, B.z, a));
      return;
    } else {
      lure.lerpVectors(cast.from, cast.to, u);
      lure.y += cast.h * 4 * u * (1 - u);
    }
    if (u >= 1) landCast();
  }

  function tryMidAirBite() {
    if (!G.fish || !G.fish.rollCatch) return false;
    let ci = null;
    try { ci = G.fish.rollCatch({ x: lure.x, z: lure.z, depth: 0, baitId: eq().bait, rodId: eq().rod, conditions: conditions(lure.x, lure.z), airborne: true, technique: F.technique }); } catch (e) { ci = null; }
    if (!ci || ci.kind !== 'fish') return false;
    const sp = ci.species || (G.fish.get && G.fish.get(ci.id));
    if (!sp || sp.behavior !== 'flying') return false;
    entry.copy(lure); hook.copy(lure);
    F.bobberPos = entry; F.hookPos = hook;
    F.maxDepth = 0; F.hookDepth = 0;
    wait = newWait();
    cast = null;
    toast('Có con gì đớp mồi giữa không trung!!', 'epic');
    startBite(ci);
    return true;
  }

  function newWait() {
    return {
      t: 0, biteCD: 1.5, holdFrac: 0, jerk: 0, lastReel: false, twitchBonus: 0, lastTwitch: -9,
      rhythm: 0, lastJig: -9, lastJigKey: '', jigOff: 0, nibble: null, nibbleT: 0, depthT: 0, rippleT: 0, stillT: 0, reelPrev: false,
    };
  }

  function landCast() {
    if (!cast.water) {
      toast('Quăng lên bờ rồi! Thu dây về...', 'warn');
      sfx('fail');
      fx('splash', cast.to.clone(), 0.1);
      cast.retrieve = true; cast.t = 0;
      cast.to = cast.to.clone();
      return;
    }
    entry.copy(cast.to);
    entry.y = waterH(entry.x, entry.z);
    const vert = cast.vertical;
    cast = null;
    F.bobberPos = entry;
    F.hookPos = hook;
    F.maxDepth = Math.max(0.3, depthAt(entry.x, entry.z) - 0.1);
    const tech = F.technique;
    if (tech === 'spin') F.depth = Math.min(1.2, F.maxDepth * 0.5);
    else if (tech === 'vertical') F.depth = Math.max(0.5, F.maxDepth * 0.6);
    else if (tech === 'horizontal') F.depth = F.maxDepth;
    else F.depth = clamp(F.depth, 0.2, F.maxDepth);
    F.hookDepth = 0;
    hook.copy(entry);
    const heavy = tech === 'horizontal' || tech === 'vertical';
    fx('splash', entry.clone(), heavy ? 0.5 : 0.3);
    fx('ripple', entry.clone(), 0.6);
    sfx(vert && heavy ? 'splash' : 'plop');
    emit('bobber:landed', { pos: entry.clone(), depth: F.maxDepth });
    wait = newWait();
    F.state = 'waiting';
    if (F.maxDepth < 0.5) toast('Nước nông quá, khó có cá to đây.', 'warn');
    if (!hasBait()) toast('Không có mồi — chỉ vớt được rác thôi!', 'warn');
  }

  // ================= Chờ cá =================
  function retrieved(msg) {
    if (msg) toast(msg, 'info');
    if (F.bobberPos) fx('ripple', F.bobberPos.clone(), 0.3);
    wait = null; bite = null;
    F.bobberPos = null; F.hookPos = null;
    F.state = 'idle';
    stopReelSound();
  }

  function moveEntryToward(target, speed, dt) {
    tmpA.set(target.x - entry.x, 0, target.z - entry.z);
    const d = tmpA.length();
    if (d < 1e-4) return d;
    const step = Math.min(d, speed * dt);
    entry.x += (tmpA.x / d) * step;
    entry.z += (tmpA.z / d) * step;
    return d - step;
  }

  function updateWaiting(dt, t, inp) {
    const w = wait;
    const r = rodD();
    const tech = F.technique;
    const m = mouse();
    w.t += dt;
    const reeling = inp && !!m.left;
    if (reeling !== w.reelPrev) { w.jerk += 1; w.reelPrev = reeling; }
    w.jerk = Math.max(0, w.jerk - dt * 0.8);
    w.holdFrac = damp(w.holdFrac, reeling ? 1 : 0, 1.6, dt);
    playerPos(tmpB);

    // độ sâu bằng lăn chuột
    if (inp && m.wheel && tech !== 'horizontal') {
      const step = clamp(F.maxDepth / 15, 0.1, 5);
      F.depth = clamp(F.depth + m.wheel * step, 0.2, Math.max(0.2, F.maxDepth));
    }
    w.depthT -= dt;
    if (w.depthT <= 0) {
      w.depthT = 0.2;
      F.maxDepth = Math.max(0.3, depthAt(entry.x, entry.z) - 0.1);
      if (tech === 'horizontal') F.depth = F.maxDepth;
      F.depth = clamp(F.depth, 0.2, Math.max(0.2, F.maxDepth));
    }

    let tm = 1, targetDepth = F.depth, sinkSpeed = 1.5;
    const reelSpd = r.reelSpeed || 2;
    let remaining = 99;
    if (tech === 'float') {
      if (reeling) remaining = moveEntryToward(tmpB, reelSpd * 0.6, dt);
      else {
        const wd = wind();
        const nx = entry.x + wd.x * 0.02 * dt, nz = entry.z + wd.z * 0.02 * dt;
        if (isWater(nx, nz)) { entry.x = nx; entry.z = nz; }
      }
      w.stillT = reeling ? 0 : w.stillT + dt;
      F.quality = clamp(w.stillT / 4, 0, 1);
      tm = reeling ? 0.35 : 0.6 + 0.4 * F.quality;
    } else if (tech === 'spin') {
      if (reeling) remaining = moveEntryToward(tmpB, reelSpd * 0.55, dt);
      targetDepth = reeling ? F.depth : F.maxDepth;
      sinkSpeed = reeling ? 1.2 : 0.6;
      if (inp && KP('KeyW')) {
        if (w.t - w.lastTwitch > 0.7) { w.twitchBonus = 1.2; moveEntryToward(tmpB, 0.5, 1); fx('ripple', entry.clone(), 0.25); rod.twitch += 0.25; }
        else w.jerk += 1;
        w.lastTwitch = w.t;
      }
      w.twitchBonus = Math.max(0, w.twitchBonus - dt * 1.5);
      const consistency = clamp(w.holdFrac * (1 - Math.min(1, w.jerk * 0.3)), 0, 1);
      F.quality = consistency;
      tm = 0.25 + 2.0 * consistency + w.twitchBonus;
    } else if (tech === 'vertical') {
      sinkSpeed = 5;
      if (reeling) {
        F.depth = Math.max(0, F.depth - reelSpd * dt);
        if (F.depth <= 0.15) { retrieved(); return; }
      }
      if (inp && (KP('KeyW') || KP('KeyS'))) {
        const key = KP('KeyW') ? 'W' : 'S';
        const iv = w.t - w.lastJig;
        if (key !== w.lastJigKey && iv > 0.3 && iv < 1.2) w.rhythm = Math.min(1, w.rhythm + 0.22);
        else w.rhythm = Math.max(0, w.rhythm - 0.2);
        w.lastJig = w.t; w.lastJigKey = key;
        if (key === 'W') { w.jigOff = 0.8; rod.twitch += 0.2; } else w.jigOff = -0.2;
      }
      w.rhythm = Math.max(0, w.rhythm - dt * 0.15);
      w.jigOff = damp(w.jigOff, 0, 3, dt);
      targetDepth = Math.max(0.1, F.depth - w.jigOff);
      F.quality = w.rhythm;
      tm = 0.4 + 2.2 * w.rhythm;
    } else { // horizontal
      if (reeling) remaining = moveEntryToward(tmpB, reelSpd * 0.5, dt);
      targetDepth = F.maxDepth;
      sinkSpeed = 3;
      F.quality = reeling ? 0.3 : 1;
      tm = reeling ? 0.3 : 0.6;
    }
    // về tới bờ / chạm đất
    if (remaining < 2.5 || !isWater(entry.x, entry.z)) {
      retrieved();
      return;
    }
    entry.y = waterH(entry.x, entry.z);
    const dd = targetDepth - F.hookDepth;
    F.hookDepth += clamp(dd, -2.5 * dt, sinkSpeed * dt);
    F.hookDepth = clamp(F.hookDepth, 0, Math.max(0.2, F.maxDepth));
    hook.set(entry.x, entry.y - F.hookDepth, entry.z);

    // hệ số cắn
    const b = baitD();
    const baitOk = hasBait();
    let mult = tm;
    if (b && b.forTech) mult *= b.forTech.indexOf(tech) >= 0 ? 1.2 : 0.75;
    if (perfectT > 0) mult *= 1.3;
    if (!baitOk) mult *= 0.25;
    if (tech === 'horizontal') mult *= 0.9;
    F.biteMult = mult;

    // cá rỉa mồi giả
    if (w.nibble) {
      w.nibble.t += dt;
      if (w.nibble.t > w.nibble.dur) w.nibble = null;
    } else if (w.t > 2 && Math.random() < dt * 0.1 * (b ? b.attract || 1 : 0.5)) {
      w.nibble = { t: 0, dur: rand(0.25, 0.55) };
      if (tech === 'float') fx('ripple', entry.clone(), 0.15);
      rod.twitch += 0.06;
    }

    // giật hụt
    if (inp && KP('Space')) {
      if (w.nibble) toast('Mới rỉa mồi thôi, giật hụt!', 'warn');
      else toast('Giật hụt! Cá sợ chạy mất.', 'warn');
      w.biteCD = Math.max(w.biteCD, 2.5);
      rod.twitch += 0.4;
      sfx('whoosh');
      if (w.nibble) loseBait(0.15);
      w.nibble = null;
      return;
    }

    w.biteCD -= dt;
    if (w.biteCD > 0) return;
    if (F.hookDepth < Math.min(F.depth, F.maxDepth) * 0.4 && tech !== 'spin') return; // mồi chưa xuống tới
    let p = 0.05;
    const cond = conditions(entry.x, entry.z);
    if (G.fish && G.fish.biteChance) {
      try { p = G.fish.biteChance({ x: entry.x, z: entry.z, depth: F.hookDepth, baitId: b ? b.id : null, rodId: eq().rod, conditions: cond, technique: tech }) || 0; } catch (e) { p = 0.05; }
    }
    p *= mult;
    if (Math.random() < 1 - Math.exp(-p * dt)) {
      const ci = rollCatch(cond);
      if (ci) startBite(ci);
    }
  }

  function rollCatch(cond) {
    const b = baitD();
    const params = { x: entry.x, z: entry.z, depth: F.hookDepth, baitId: b && hasBait() ? b.id : null, rodId: eq().rod, conditions: cond, technique: F.technique };
    let ci = null;
    try {
      if (G.fish && G.fish.rollCatch) {
        ci = G.fish.rollCatch(params);
        if (F.technique === 'horizontal') { // ít cắn nhưng cá to hơn
          const c2 = G.fish.rollCatch(params);
          if (c2 && (!ci || (c2.weight || 0) > (ci.weight || 0))) ci = c2;
        }
      }
    } catch (e) { console.error('[fishing rollCatch]', e); }
    if (!ci) {
      const junk = (G.data && G.data.JUNK) || [];
      const j = junk.length ? junk[Math.floor(Math.random() * Math.min(5, junk.length))] : { id: 'junk_can', name: 'Lon bia', weight: 0.05, price: 200 };
      ci = { kind: 'junk', id: j.id, name: j.name, weight: j.weight, value: j.price };
    }
    if (ci.kind === 'fish' && !ci.species && G.fish && G.fish.get) ci.species = G.fish.get(ci.id);
    return ci;
  }

  // ================= Cá cắn =================
  function startBite(ci) {
    const r = rodD();
    const isFish = ci.kind === 'fish' && ci.species;
    const diff = isFish ? (ci.species.difficulty || 3) : 1;
    let win = isFish ? lerp(1.2, 0.25, diff / 10) * (0.7 + (r.sensitivity || 0.5) * 0.5) : 1.4;
    win *= 1 - (G.state.drunk || 0) * 0.3;
    const strength = isFish ? clamp(Math.log10((ci.weight || 1) + 1) / 2.5, 0.1, 1) : 0.15;
    bite = { air: F.maxDepth === 0 && !!F.bobberPos && F.bobberPos.y > waterH(F.bobberPos.x, F.bobberPos.z) + 1, ci, t: 0, pre: rand(0.3, 1.3) * (strength > 0.7 ? 0.6 : 1), window: Math.max(0.18, win), phase: 'pre', strength, rippleT: 0, wStart: 0 };
    F.state = 'bite';
    if (wait) wait.nibble = null;
    emit('bite', { species: isFish ? ci.species : null, catchInfo: ci });
  }

  function updateBite(dt, t, inp) {
    const bt = bite;
    bt.t += dt;
    if (bt.phase === 'pre') {
      rod.twitch += Math.random() < dt * 8 ? 0.08 : 0;
      if (bt.t >= bt.pre) {
        bt.phase = 'window'; bt.wStart = bt.t;
        sfx('bite');
        uiStrike(true, 1);
        if (bt.strength > 0.6) { fx('splash', entry.clone(), 0.4 + bt.strength); sfx('bigsplash'); }
        else fx('ripple', entry.clone(), 0.4);
      }
    } else {
      const prog = 1 - (bt.t - bt.wStart) / bt.window;
      uiStrike(true, Math.max(0, prog));
      rod.twitch = Math.max(rod.twitch, (0.15 + 0.5 * bt.strength) * Math.abs(Math.sin(t * 22)));
      bt.rippleT -= dt;
      if (bt.rippleT <= 0) { bt.rippleT = 0.25; fx('ripple', entry.clone(), 0.2 + bt.strength * 0.6); }
      // cá to kéo phao chạy
      if (bt.strength > 0.4 && !bt.air) {
        playerPos(tmpB);
        tmpA.set(entry.x - tmpB.x, 0, entry.z - tmpB.z).normalize();
        const nx = entry.x + tmpA.x * bt.strength * 0.8 * dt, nz = entry.z + tmpA.z * bt.strength * 0.8 * dt;
        if (isWater(nx, nz)) { entry.x = nx; entry.z = nz; }
      }
      if (prog <= 0) { missBite(false); return; }
    }
    if (!bt.air) {
      entry.y = waterH(entry.x, entry.z);
      hook.set(entry.x, entry.y - F.hookDepth, entry.z);
    } else hook.copy(entry);
    if (inp && KP('Space')) {
      if (bt.phase === 'pre') missBite(true);
      else hookIt();
      return;
    }
    if (inp && KP('KeyF')) { cancelLine(); }
  }

  function missBite(early) {
    uiStrike(false);
    toast(early ? 'Giật sớm quá! Cá nhả mồi!' : 'Chậm tay! Cá nhả mồi!', 'warn');
    sfx('fail');
    loseBait(early ? 0.35 : 0.6);
    const wasAir = bite && bite.air;
    bite = null;
    if (wasAir) { cleanupLine(false); F.state = 'idle'; return; }
    if (!wait) wait = newWait();
    wait.biteCD = rand(2, 5);
    F.state = F.bobberPos ? 'waiting' : 'idle';
    if (F.state === 'idle') cleanupLine(false);
  }

  function hookIt() {
    const ci = bite.ci;
    uiStrike(false);
    sfx('strike');
    fx('shake', 0.15, 0.2);
    consumeBait();
    bite = null; wait = null;
    emit('hooked', { catchInfo: ci });
    startFight(ci);
  }

  // ================= Vật cá =================
  function startFight(ci) {
    const r = rodD();
    const sp = ci.kind === 'fish' ? (ci.species || (G.fish && G.fish.get && G.fish.get(ci.id)) || null) : null;
    const isFish = !!sp;
    const W = Math.max(0.03, ci.weight || 1);
    const len = isFish ? fishLength(sp, W) : 0.5;
    playerPos(tmpB);
    const fwd = new THREE.Vector3(hook.x - tmpB.x, 0, hook.z - tmpB.z);
    if (fwd.lengthSq() < 0.01) aimDir(fwd); else fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    const beh = isFish ? sp.behavior || 'normal' : 'junk';
    const air = isAirplane();
    fs = {
      ci, sp, isFish, W, len, beh,
      force: isFish ? Math.pow(W, 0.75) * (1.2 + (sp.strength || 10) / 50) : Math.pow(W, 0.75) * 0.5 + 0.3,
      vBase: isFish ? 0.6 + (sp.speed || 3) * 0.45 : 0,
      stamStat: isFish ? sp.stamina || 30 : 1,
      stam: isFish ? 1 : 0,
      D: Math.max(2.5, tipW.distanceTo(hook)),
      fwd, right, angle: 0, targetAngle: 0, angleT: rand(1, 3),
      depth: Math.max(0.3, F.hookDepth), targetDepth: F.hookDepth,
      running: 0, actionT: rand(2, 4), jump: null, jumpCD: rand(2.5, 5), pumpCD: 0, pumpAnim: 0, spike: 0, overT: 0, dragT: 0, burstCD: 2,
      tension: 0, fishDir: 0, strain: 0, pos: hook.clone(), prevPos: hook.clone(), vel: new THREE.Vector3(),
      model: null, flying: beh === 'flying', t: 0, rippleT: 0, splashT: 0, combatSent: false, correct: false, side: 0, lower: false, reeling: false,
      maxLine: air ? 400 : r.technique === 'vertical' ? 250 : 150, yaw: 0, airborne: hook.y > waterH(hook.x, hook.z) + 1,
    };
    // mô hình
    let model = null;
    try {
      if (isFish && G.fish && G.fish.createModel) model = G.fish.createModel(sp.id, len);
      else if (!isFish && G.fish && G.fish.createJunkModel) model = G.fish.createJunkModel(ci.id);
    } catch (e) { model = null; }
    if (!model) model = fallbackModel(isFish ? (sp && sp.color) || 0x7799aa : 0x665544, len, isFish);
    // cá vừa dính câu lao đi một đoạn (tránh kéo lên ngay khi thả mồi sát thuyền)
    if (isFish) fs.D = Math.max(fs.D, Math.min(fs.maxLine * 0.4, 5 + fs.vBase * 2 + len * 1.5));
    model.rotation.order = 'YXZ';
    model.visible = false;
    G.scene.add(model);
    fs.model = model;
    shadowMesh.scale.set(Math.max(0.3, len * 0.35), Math.max(0.5, len * 0.9), 1);
    F.fight = { tension: 0, fishStamina: fs.stam, distance: fs.D, catchInfo: ci, fishDir: 0, hint: 'Giữ chuột trái để cuộn dây', maxDistance: fs.maxLine, strain: 0, jumping: false, kind: ci.kind };
    F.state = 'fight';
    setModeSelf('fight');
    if (G.player) G.player.cameraFocus = fs.pos;
    if (isFish) {
      const cat = sp.category;
      if (cat === 'khong_lo' || cat === 'quai_vat' || cat === 'dot_bien' || W > 300) { toast('Cái gì thế này?! Cần cong như cánh cung!', 'epic'); fx('shake', 0.4, 0.6); }
      else toast('Dính cá rồi! Vật nào!', 'good');
    } else toast('Có gì đó nặng nặng... cuộn lên xem nào.', 'info');
  }

  function fallbackModel(color, len, isFish) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    if (isFish) {
      m.scale.set(len * 0.25, len * 0.35, len);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(len * 0.2, len * 0.3, 4), m.material);
      tail.rotation.x = -PI / 2; tail.position.z = -len * 0.6; g.add(tail);
    } else m.scale.setScalar(0.4);
    g.add(m);
    g.userData.animate = function (t, k) { g.rotation.z = Math.sin(t * 12) * 0.15 * (k || 1); };
    return g;
  }

  function disposeFight() {
    if (!fs) return;
    if (fs.model && fs.model.parent) fs.model.parent.remove(fs.model);
    fs = null;
    F.fight = null;
    shadowMesh.visible = false;
    if (G.player) G.player.cameraFocus = null;
    stopReelSound();
  }

  function endFight(result) {
    const ci = fs ? fs.ci : null;
    disposeFight();
    cleanupLine(false);
    F.state = 'idle';
    setAnim('idle', true);
    if (F.active) setModeSelf('fishing');
    emit('fight:end', { result, catchInfo: ci });
    return ci;
  }

  function snapLine() {
    sfx('line_snap');
    const b = baitD();
    if (b && b.reusable && invCount(b.id) > 0) {
      G.state.inventory[b.id]--;
      toast('Mất luôn ' + b.name + ' theo dây!', 'warn');
      if (invCount(b.id) <= 0) autoSelectBait(false);
    }
    endFight('line_broke');
  }
  function escapeFish(msg) {
    toast(msg || 'Cá thoát rồi!', 'warn');
    sfx('fail');
    if (fs && fs.pos) fx('splash', fs.pos.clone(), 0.6);
    endFight('escaped');
  }
  function draggedIn() {
    const ci = fs.ci;
    // hiệu ứng rơi nước do player.js lo, thông báo lớn do ui.js lo
    endFight('dragged');
    emit('player:dragged', { catchInfo: ci });
  }
  function startCombat() {
    const ci = fs.ci;
    const model = fs.model;
    fs.model = null; // giao cho player.js
    model.visible = true;
    playerPos(tmpB);
    // cá phóng lên bờ trước mặt người chơi
    model.position.set(lerp(tmpB.x, fs.pos.x, 0.5), 0, lerp(tmpB.z, fs.pos.z, 0.5));
    const gy = groundH(model.position.x, model.position.z), wy = waterH(model.position.x, model.position.z);
    model.position.y = Math.max(gy, wy) + fs.len * 0.2;
    fx('splash', fs.pos.clone(), 1.2);
    sfx('roar');
    endFight('combat');
    emit('combat:start', { catchInfo: ci, fishObj: model });
  }

  function computeFishPos(f, out) {
    playerPos(tmpC);
    const wy = waterH(f.pos.x, f.pos.z);
    let fy;
    if (f.flying) fy = Math.max(wy + 3, tipW.y - 8 + Math.sin(f.t * 0.8) * 6);
    else if (f.jump) { const u = f.jump.t / f.jump.dur; fy = wy + Math.sin(u * PI) * f.jump.h; }
    else fy = wy - f.depth;
    const vd = tipW.y - fy;
    let hd;
    if (f.D <= Math.abs(vd)) { hd = 0.3; if (vd > 0) fy = tipW.y - f.D; }
    else hd = Math.sqrt(f.D * f.D - vd * vd);
    const ca = Math.cos(f.angle), sa = Math.sin(f.angle);
    out.set(
      tmpC.x + (f.fwd.x * ca + f.right.x * sa) * hd,
      fy,
      tmpC.z + (f.fwd.z * ca + f.right.z * sa) * hd
    );
    return out;
  }

  function updateFight(dt, t, inp) {
    const f = fs;
    const r = rodD(), ln = lineD();
    const m = mouse();
    f.t += dt;
    const reelHeld = inp && !!m.left;
    const side = inp ? (K('KeyD') ? 1 : 0) - (K('KeyA') ? 1 : 0) : 0;
    const lower = inp && K('KeyS');
    const pumpPress = inp && KP('KeyW');
    const pStr = playerStrength();
    const boatHold = boatStability();
    const pst = typeof G.state.stamina === 'number' ? G.state.stamina : 100;
    const holdForce = (r.power || 8) * (1 + pStr / 60);
    const reeling = reelHeld;
    const exhausted = pst <= 0.5;
    f.side = side; f.lower = lower; f.reeling = reeling;

    if (inp && KP('KeyF')) { cutLine(); return; }

    // ---- AI cá ----
    let act = 1, speedMul = 1;
    if (f.isFish) {
      f.angleT -= dt;
      if (f.angleT <= 0) { f.targetAngle = rand(-1, 1) * (f.beh === 'runner' ? 1.25 : f.flying ? 1.5 : 0.95); f.angleT = rand(1.5, 4); }
      f.actionT -= dt;
      if (f.running > 0) { f.running -= dt; act = f.beh === 'runner' ? 1.6 : 1.3; speedMul = f.beh === 'runner' ? 2.4 : 1.6; }
      else if (f.actionT <= 0 && f.stam > 0.12 && (f.beh === 'runner' || f.beh === 'normal' || f.beh === 'fighter')) {
        f.running = (f.beh === 'runner' ? rand(1.5, 3.5) : rand(0.8, 1.6)) * (0.5 + f.stam);
        f.actionT = f.beh === 'runner' ? rand(3, 6) : rand(5, 10);
        f.targetAngle = rand(-1.3, 1.3); f.angleT = f.running;
        if (f.beh === 'runner') { toast('Cá chạy dài! Nhả chuột cho cá chạy!', 'warn'); sfx('reel', { rate: 2 }); }
      }
      // độ sâu
      const md = Math.max(0.3, depthAt(f.pos.x, f.pos.z) - 0.2);
      if (f.beh === 'diver') f.targetDepth = Math.max(0.5, md * 0.9 * (0.3 + 0.7 * f.stam));
      else f.targetDepth = clamp(lerp(2.5, 0.6, 1 - f.stam), 0.4, md);
      if (f.D < 6) f.targetDepth = Math.min(f.targetDepth, 0.5);
      const ddep = clamp(f.targetDepth - f.depth, -1.2 * dt, (f.beh === 'diver' ? 2.5 : 1) * dt);
      f.depth = clamp(f.depth + ddep, 0.2, Math.max(0.3, md));
      if (f.beh === 'diver' && ddep > 0.3 * dt) { act *= 1.25; }
      if (f.beh === 'puller') { act *= 1.3; speedMul *= 0.9; }
      if (f.flying) { act *= 1.1; speedMul *= 1.6; }
      if (f.beh === 'fighter') act *= 1.15;
      // nhảy
      if (!f.jump && !f.flying) {
        if (f.beh === 'jumper') f.jumpCD -= dt;
        else if (f.beh === 'normal' && f.W < 20 && Math.random() < dt * 0.03) f.jumpCD = 0;
        if (f.jumpCD <= 0 && f.D > 4 && f.stam > 0.08) {
          f.jump = { t: 0, dur: 0.95 + Math.min(1.2, f.len * 0.25), h: 1.0 + Math.min(4, f.len * 1.2), lowered: false, checked: false };
          fx('splash', f.pos.clone().setY(waterH(f.pos.x, f.pos.z)), 0.5 + Math.min(2, f.len));
          sfx('bigsplash');
        }
      }
    }
    if (f.jump) {
      const j = f.jump;
      j.t += dt;
      if (lower) j.lowered = true;
      if (!j.checked && j.t > j.dur * 0.55) {
        j.checked = true;
        if (!j.lowered) {
          f.spike += 0.6;
          if (Math.random() < 0.3 * (1 - (r.sensitivity || 0.5) * 0.4)) { escapeFish('Cá nhảy văng lưỡi câu! (phải nhấn S hạ cần)'); return; }
          toast('Không hạ cần! Dây giật căng!', 'bad');
        } else {
          floatText(f.pos.clone().add(tmpA.set(0, 1, 0)), 'Hạ cần chuẩn!', '#7CFC00');
          f.stam = Math.max(0, f.stam - 0.06);
        }
      }
      if (j.t >= j.dur) {
        fx('splash', f.pos.clone().setY(waterH(f.pos.x, f.pos.z)), 0.6 + Math.min(2.5, f.len));
        sfx('splash');
        f.jump = null;
        f.depth = 0.5;
        f.jumpCD = rand(3.5, 8) * (1.3 - 0.5 * f.stam);
      }
    }

    const stamF = f.isFish ? 0.35 + 0.65 * f.stam : 1;
    let pull = f.force * stamF * act;
    if (f.jump) pull *= 0.5;
    const vFish = f.vBase * speedMul * (0.3 + 0.7 * f.stam);

    // ---- ghì cần A/D ----
    const fdAbs = Math.abs(f.fishDir);
    let loadMul = 1, dmgMul = 1, correct = false;
    if (side !== 0 && f.isFish) {
      if (fdAbs > 0.2) {
        if (Math.sign(side) === -Math.sign(f.fishDir)) { correct = true; loadMul = 0.7; dmgMul = 2.2; f.targetAngle *= 1 - dt * 0.8; }
        else loadMul = 1.35;
      } else loadMul = 1.05;
    }
    f.correct = correct;
    if (correct && G.time - lastCorrectFx > 2.5) { lastCorrectFx = G.time; floatText(tipW.clone().add(tmpA.set(0, 0.3, 0)), 'Ghì cần đúng hướng!', '#7CFC00'); }
    if (lower && !f.jump) loadMul *= 0.85;

    // ---- khoảng cách & lực ----
    const strain = pull / holdForce;
    f.strain = strain;
    let dD, load;
    if (reeling) {
      // cá còn khỏe thì cưỡng lại, cuộn chậm; cá đuối thì cuộn nhanh
      const resist = f.isFish ? 0.45 + 0.55 * (1 - f.stam * 0.85) : 1;
      const gain = (r.reelSpeed || 2) * resist * clamp(1.2 - strain * 0.55, 0.06, 1) * (lower ? 0.6 : 1) * (correct ? 1.15 : 1) * (exhausted ? 0.25 : 1);
      const slip = (strain > 1 ? vFish * Math.min(1, strain - 1) : f.running > 0 ? vFish * 0.25 : 0) + (f.isFish ? vFish * 0.22 * f.stam : 0);
      dD = (slip - gain) * dt;
      load = pull + (r.power || 8) * 0.03;
    } else {
      dD = (f.isFish ? vFish * (f.running > 0 ? 1 : 0.35) : 0) * dt;
      load = pull * 0.42;
    }
    f.pumpCD -= dt;
    f.pumpAnim = Math.max(0, f.pumpAnim - dt);
    if (pumpPress && f.pumpCD <= 0) {
      f.pumpCD = 0.55; f.pumpAnim = 0.35;
      G.state.stamina = Math.max(0, pst - 3);
      if (f.isFish && f.stam < 0.3) {
        dD -= 1.2 + (r.reelSpeed || 2) * 0.3; f.stam = Math.max(0, f.stam - 0.05); f.spike += 0.2;
        floatText(tipW.clone().add(tmpA.set(0, 0.3, 0)), 'Giật cần!', '#ffd84a');
        if (f.beh === 'diver') f.depth = Math.max(0.3, f.depth - 1);
      } else {
        dD -= 0.4; f.spike += f.isFish ? 0.45 : 0.1;
        if (f.isFish) f.stam = Math.max(0, f.stam - 0.012);
      }
      rod.twitch += 0.2;
    }
    const prevD = f.D;
    // đứng trên thuyền: cá phải kéo theo cả thuyền nên rút dây chậm hơn
    if (dD > 0 && boatHold > 0 && f.isFish) {
      dD *= 1 - 0.85 * boatHold;
      if (boatHold >= 0.8 && strain > 1.5 && !f.towMsg) { f.towMsg = true; toast('Cá kéo cả con tàu đi! Bám chắc vào!', 'epic'); fx('shake', 0.3, 0.5); }
    }
    f.D = Math.max(0, f.D + dD);

    // vùng vẫy khi gần
    f.burstCD -= dt;
    const bigFresh = f.isFish && f.W > 20 && f.stam > 0.35;
    if (f.isFish && f.D < 3.5 && (f.stam > 0.45 || bigFresh) && f.W > 3 && f.burstCD <= 0 && !f.flying) {
      f.D += 3 + f.vBase + Math.min(25, f.len * 2); f.burstCD = f.W > 20 ? 2.5 : 4; f.spike += 0.3;
      fx('splash', f.pos.clone().setY(waterH(f.pos.x, f.pos.z)), 0.8 + Math.min(2, f.len));
      sfx('bigsplash');
      toast('Cá vùng vẫy dữ dội! Làm nó mệt đã!', 'warn');
    }

    // ---- tension ----
    f.spike = Math.max(0, f.spike - dt * 2.2);
    const tTarget = (load * loadMul) / Math.max(1, ln.strength || 10) + f.spike;
    f.tension = damp(f.tension, tTarget, 10, dt);
    if (f.tension > 1) { f.overT += dt; if (f.overT > 0.4) { snapLine(); return; } }
    else f.overT = Math.max(0, f.overT - dt * 1.5);

    // ---- thể lực cá ----
    if (f.isFish) {
      const drain = 0.032 / (0.5 + f.stamStat / 35) * (reeling ? 1.3 : 0.45) * dmgMul * (f.beh === 'puller' ? 0.6 : 1) * clamp((r.power || 8) / f.force, 0.4, 2);
      // cá đuối dần theo thời gian: sau 90s mất sức ngày càng nhanh (trận nào cũng có hồi kết)
      const fatigue = 1 + Math.max(0, f.t - 90) / 45;
      f.stam -= drain * (strain > 1 ? 1 + boatHold : 1) * fatigue * dt;
      if (!reeling && !correct) f.stam += 0.003 * dt;
      f.stam = clamp(f.stam, 0, 1);
    }
    // ---- thể lực người ----
    const st = Math.min(strain, 4);
    // cuộn tốn sức; ghì cần không cuộn tốn ít hơn; lực kéo nhẹ mà không cuộn thì hồi sức (nghỉ tay)
    let pdrain = reeling ? 0.8 + 4 * st : st > 1 ? 1.2 * (st - 1) + 0.6 : -4 * (1 - st);
    if (pdrain > 0) pdrain *= 1 - 0.5 * boatHold;
    G.state.stamina = clamp((typeof G.state.stamina === 'number' ? G.state.stamina : 100) - pdrain * dt, 0, 100);
    // ---- bị kéo xuống nước ----
    if (f.isFish && G.state.stamina <= 0 && pull > ((r.power || 8) + pStr) * 2 * (1 + boatHold * 2)) {
      if (boatHold >= 1) {
        // tàu thép: không bị kéo xuống nước, cá kéo cả tàu đi
        // tàu thép quá nặng: không bị kéo xuống nước
      } else {
        f.dragT += dt;
        if (f.dragT > 1.5) { draggedIn(); return; }
      }
    } else f.dragT = Math.max(0, f.dragT - dt);

    // ---- di chuyển cá ----
    const prevAngle = f.angle;
    if (f.isFish) {
      const angSpeed = (vFish * 0.9 + 0.2) / Math.max(f.D, 3);
      f.angle += clamp(f.targetAngle - f.angle, -angSpeed * dt, angSpeed * dt);
      f.fishDir = damp(f.fishDir, clamp((f.targetAngle - f.angle) * 2.5, -1, 1), 6, dt);
    } else f.fishDir = 0;
    f.prevPos.copy(f.pos);
    computeFishPos(f, tmpA);
    if (!f.flying && !f.jump && f.D > 6 && !isWater(tmpA.x, tmpA.z)) {
      f.angle = prevAngle;
      f.targetAngle = -f.targetAngle * 0.5;
      if (f.D > prevD) f.D = prevD;
      computeFishPos(f, tmpA);
    }
    f.pos.copy(tmpA);
    if (dt > 0) f.vel.subVectors(f.pos, f.prevPos).divideScalar(dt);

    // ---- kết thúc ----
    if (f.D > f.maxLine) { escapeFish('Cá kéo hết sạch dây — sổng mất!'); return; }
    if (f.beh === 'fighter' && !f.combatSent && f.D < 9) { f.combatSent = true; startCombat(); return; }
    const beached = !f.flying && f.D < 4 && !isWater(f.pos.x, f.pos.z);
    if (f.D < 2 || beached) {
      if (!bigFresh) { landCatch(); return; }
      f.D = Math.max(f.D, 2); // cá to còn khỏe: chưa kéo lên được
    }

    // ---- hint ----
    let hint;
    if (f.jump && !f.jump.lowered) hint = 'CÁ NHẢY! Nhấn [S] hạ cần!';
    else if (f.tension > 0.85) hint = 'Căng dây quá! Nhả chuột trái!';
    else if (G.state.stamina <= 0) hint = 'Hết sức! Nhả chuột nghỉ tay, hoặc ăn bánh mì / uống rượu (phím 1-5)!';
    else if (f.isFish && fdAbs > 0.35 && !correct) hint = f.fishDir > 0 ? 'Cá chạy sang phải — giữ [A] ghì cần!' : 'Cá chạy sang trái — giữ [D] ghì cần!';
    else if (bigFresh && f.D < 8) hint = 'Cá còn khỏe, chưa kéo lên được — ghì cần [A/D] cho nó mệt!';
    else if (correct) hint = 'Ghì cần đúng hướng!';
    else if (f.isFish && f.stam < 0.3) hint = 'Cá đã đuối — [W] giật cần, cuộn mạnh!';
    else if (f.running > 0) hint = 'Cá chạy dài! Nhả dây, đừng cuộn!';
    else if (strain > 1.6) hint = 'Cá quá khỏe so với cần! Coi chừng bị kéo xuống nước!';
    else hint = f.isFish ? 'Giữ chuột trái để cuộn dây' : 'Cuộn từ từ lên...';
    const ff = F.fight;
    if (ff) {
      ff.tension = f.tension; ff.fishStamina = f.stam; ff.distance = f.D; ff.fishDir = f.fishDir; ff.hint = hint;
      ff.strain = strain; ff.jumping = !!f.jump; ff.maxDistance = f.maxLine; ff.correct = correct;
    }
    setAnim(reeling ? 'reel' : 'pull');
    if (reeling) startReelSound(0.6 + (r.reelSpeed || 2) * 0.15 * clamp(1.2 - strain * 0.55, 0.1, 1));
    else stopReelSound();

    // ---- hiệu ứng ----
    const wy = waterH(f.pos.x, f.pos.z);
    const under = f.pos.y < wy - 0.05 && !f.flying;
    f.rippleT -= dt; f.splashT -= dt;
    if (under && f.rippleT <= 0) { f.rippleT = 0.3; fx('ripple', tmpB.set(f.pos.x, wy, f.pos.z).clone(), 0.3 + f.tension * 0.6); }
    if (under && f.splashT <= 0 && f.depth < 0.9 && (f.running > 0 || f.tension > 0.7) && f.isFish) {
      f.splashT = 0.55; fx('splash', tmpB.set(f.pos.x, wy, f.pos.z).clone(), 0.3 + Math.min(1.5, f.len * 0.5));
      if (Math.random() < 0.3) fx('bubbles', tmpB.clone());
    }
    // bóng cá
    if (under && f.isFish && f.depth < 6) {
      shadowMesh.visible = true;
      shadowMesh.position.set(f.pos.x, wy + 0.03, f.pos.z);
      shadowMesh.rotation.set(-PI / 2, f.yaw, 0);
      shadowMesh.material.opacity = 0.45 * (1 - f.depth / 6);
    } else shadowMesh.visible = false;
    // mô hình
    const mdl = f.model;
    if (mdl) {
      mdl.visible = f.D < 8 || !!f.jump || f.flying || f.pos.y > wy - 0.3;
      mdl.position.copy(f.pos);
      const hs = Math.hypot(f.vel.x, f.vel.z);
      if (hs > 0.05) f.yaw = dampAngle(f.yaw, Math.atan2(f.vel.x, f.vel.z), 6, dt);
      let pitch = 0;
      if (f.jump || f.flying || f.pos.y > wy) pitch = -Math.atan2(f.vel.y, Math.max(0.3, hs));
      if (!under && !f.jump && !f.flying && f.pos.y > wy + 0.2) pitch = -1.2; // treo lủng lẳng
      mdl.rotation.set(clamp(pitch, -1.4, 1.4), f.yaw, f.isFish ? Math.sin(f.t * 9) * 0.15 * act : Math.sin(f.t * 3) * 0.3);
      if (mdl.userData && typeof mdl.userData.animate === 'function') { try { mdl.userData.animate(f.t, 0.5 + act * 0.6); } catch (e) { } }
    }
  }

  // ================= Kéo lên =================
  function landCatch() {
    const f = fs;
    const ci = f.ci;
    const model = f.model;
    f.model = null;
    const len = f.len;
    const sp = f.sp;
    disposeFight();
    cleanupLine(false);
    setModeSelf('fishing');
    F.state = 'landing';
    playerPos(tmpB);
    aimDir(aimV);
    rightV.crossVectors(aimV, UP).normalize();
    const cat = sp ? sp.category : null;
    const epic = !!sp && (cat === 'khong_lo' || cat === 'quai_vat' || cat === 'dot_bien' || ci.weight >= 500);
    const big = ci.weight > 2000 || len > 3.2;
    landing = { t: 0, dur: epic ? 4.5 : 3, model, ci, big, len, yaw: Math.atan2(aimV.x, aimV.z), basePos: new THREE.Vector3() };
    if (model) {
      model.visible = true;
      if (big) {
        const px = tmpB.x + rightV.x * (len * 0.5 + 1.5) + aimV.x * 1.5;
        const pz = tmpB.z + rightV.z * (len * 0.5 + 1.5) + aimV.z * 1.5;
        const gy = Math.max(groundH(px, pz), isWater(px, pz) ? waterH(px, pz) : -1e9);
        landing.basePos.set(px, (gy > -1e8 ? gy : tmpB.y) + Math.max(0.3, len * 0.12), pz);
        model.rotation.set(0, landing.yaw, 0);
        fx('splash', landing.basePos.clone(), 2.5);
        fx('shake', 0.5, 0.6);
      } else {
        landing.basePos.set(tmpB.x + aimV.x * 0.7, tmpB.y + 1.35, tmpB.z + aimV.z * 0.7);
        model.rotation.set(0, landing.yaw + PI / 2, 0.2);
      }
      model.position.copy(landing.basePos);
    }
    setAnim('pull', true);
    const wtxt = G.util && G.util.fmtWeight ? G.util.fmtWeight(ci.weight || 0) : (ci.weight || 0).toFixed(1) + ' kg';
    const color = epic ? '#ff5a1f' : ci.kind === 'fish' ? '#ffd84a' : '#bbbbbb';
    sfx(epic ? 'fanfare' : 'catch');
    const sp0 = landing.basePos.clone();
    fx('sparkle', sp0, epic ? 0xffaa00 : 0xffffaa);
    if (ci.kind === 'fish') floatText(sp0.clone().add(tmpA.set(0, 0.8, 0)), wtxt, color);
    else if (ci.kind === 'junk') floatText(sp0.clone().add(tmpA.set(0, 0.6, 0)), 'Rác... 😅', '#cccccc');
    emit('fish:caught', { catchInfo: ci });
    emit('fight:end', { result: 'caught', catchInfo: ci });
    // pháo hoa + chuỗi nổ "bùm bùm" cho cá khổng lồ do fx.js lo (nghe fish:caught)
  }

  function updateLanding(dt, t, inp) {
    const L = landing;
    L.t += dt;
    const mdl = L.model;
    if (mdl) {
      if (L.big) {
        mdl.position.copy(L.basePos);
        mdl.rotation.z = Math.sin(L.t * 3) * 0.08;
      } else {
        mdl.position.copy(L.basePos);
        mdl.position.y += Math.sin(L.t * 4) * 0.03;
        mdl.rotation.z = 0.2 + Math.sin(L.t * 14) * 0.25 * Math.max(0.2, 1 - L.t / L.dur);
      }
      if (mdl.userData && typeof mdl.userData.animate === 'function') { try { mdl.userData.animate(L.t, Math.max(0.2, 1 - L.t / L.dur)); } catch (e) { } }
      if (Math.random() < dt * 3) fx('sparkle', mdl.position.clone().add(tmpA.set(rand(-0.3, 0.3), rand(0, 0.4), rand(-0.3, 0.3))), 0xffffcc);
    }
    if (L.t >= L.dur || (inp && L.t > 1 && mouse().leftPressed)) {
      if (mdl && mdl.parent) mdl.parent.remove(mdl);
      landing = null;
      F.state = 'idle';
      setAnim('idle', true);
    }
  }

  // ================= Âm thanh cuộn =================
  function startReelSound(rate) {
    if (!reelLoop) {
      try { reelLoop = G.audio && G.audio.loop ? G.audio.loop('reel') : null; } catch (e) { reelLoop = null; }
      if (!reelLoop) reelLoop = { stop() { }, setRate() { }, setVolume() { }, dummy: true };
    }
    try { reelLoop.setRate && reelLoop.setRate(rate || 1); } catch (e) { }
  }
  function stopReelSound() {
    if (reelLoop) { try { reelLoop.stop(); } catch (e) { } reelLoop = null; }
  }

  // ================= Thuốc nổ (đạn vật lý: bay có cản, nảy trên đất, chìm trong nước rồi nổ) =================
  let dynMatRed, dynMatFuse;
  const DYN_H = 1 / 120, DYN_R = 0.07, DYN_K = 0.02;
  const dynWind = { x: 0, z: 0 };
  F.throwDynamite = function () {
    if (!G.scene) return false;
    if (!dynMatRed) {
      dynMatRed = new THREE.MeshStandardMaterial({ color: 0xcc1a1a, roughness: 0.6 });
      dynMatFuse = new THREE.MeshStandardMaterial({ color: 0xffaa22, emissive: 0xff6600, emissiveIntensity: 1.5 });
    }
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 8), dynMatRed);
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 4), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    fuse.position.y = 0.18;
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), dynMatFuse);
    spark.position.y = 0.23;
    g.add(stick, fuse, spark);
    const from = handPos(new THREE.Vector3());
    const dir = aimDir(new THREE.Vector3());
    const dist = 14;
    let tx = from.x + dir.x * dist, tz = from.z + dir.z * dist;
    const water = isWater(tx, tz);
    const to = new THREE.Vector3(tx, water ? waterH(tx, tz) : groundH(tx, tz) + 0.05, tz);
    g.position.copy(from);
    G.scene.add(g);
    const c = conditions(from.x, from.z), w = (c && c.wind) || { x: 0, z: 0 };
    // rơi rất cao (máy bay): thời gian bay theo rơi tự do, không ép 0.9s
    const drop = from.y - to.y, T = drop > 15 ? Math.sqrt(2 * drop / 9.81) * 1.1 : 0.9, kd = drop > 15 ? 0.002 : DYN_K;
    const sol = G.physics && G.physics.solveLaunch ? G.physics.solveLaunch(from, to, T, kd, w, DYN_H, {})
      : { vx: (to.x - from.x) / T, vy: (to.y - from.y) / T + 0.5 * 9.81 * T, vz: (to.z - from.z) / T };
    dynamites.push({
      g, spark, water: false, t: 0, landed: false, fuse: 2.0, sparkT: 0, landT: 0, acc: 0, rest: false, bounces: 0,
      s: { x: from.x, y: from.y, z: from.z, vx: sol.vx, vy: sol.vy, vz: sol.vz }, px: from.x, py: from.y, pz: from.z,
      spinX: 9, spinZ: 5, wind: w, k: kd,
    });
    setAnim('cast', true);
    sfx('whoosh');
    toast('🧨 Ném thuốc nổ! Tránh xa ra!', 'warn');
    return true;
  };
  const dynV = { x: 0, y: 0, z: 0 };
  function dynLand(d) { if (!d.landed) { d.landed = true; d.landT = 0; } }
  function dynStep(d, h) {
    const s = d.s, PH = G.physics;
    if (d.rest) return;
    const wy = waterH(s.x, s.z), inWater = s.y < wy && isWater(s.x, s.z);
    if (inWater) {
      if (!d.water) {
        // chạm nước: mất phần lớn động năng, bắn nước
        d.water = true; dynLand(d);
        s.vx *= 0.3; s.vz *= 0.3; s.vy *= 0.25;
        fx('splash', new THREE.Vector3(s.x, wy, s.z), 0.4); sfx('plop');
      }
      // chìm: trọng lực trừ lực nổi (khối lượng riêng ~1.3 nước) + cản nước mạnh
      const dmp = Math.exp(-3.2 * h);
      s.vx *= dmp; s.vz *= dmp; s.vy = s.vy * dmp - 9.81 * 0.25 * h;
      s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h;
      const gy = groundH(s.x, s.z) + DYN_R;
      if (s.y < gy) { s.y = gy; s.vy = 0; s.vx *= 0.5; s.vz *= 0.5; }
    } else {
      if (d.water && s.y >= wy) d.water = false;
      dynWind.x = d.wind.x || 0; dynWind.z = d.wind.z || 0;
      if (PH && PH.ballisticStep) PH.ballisticStep(s, h, d.k, dynWind);
      else { s.vy -= 9.81 * h; s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h; }
      const gy = groundH(s.x, s.z);
      if (s.y < gy + DYN_R && !(isWater(s.x, s.z) && s.y < waterH(s.x, s.z))) {
        // nảy trên đất theo pháp tuyến địa hình: hồi phục 0.35, ma sát tiếp tuyến
        const e = 0.4;
        let nx = -(groundH(s.x + e, s.z) - groundH(s.x - e, s.z)) / (2 * e), ny = 1, nz = -(groundH(s.x, s.z + e) - groundH(s.x, s.z - e)) / (2 * e);
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= nl; ny /= nl; nz /= nl;
        const vn = s.vx * nx + s.vy * ny + s.vz * nz;
        s.y = gy + DYN_R;
        if (vn < 0) {
          s.vx -= nx * vn; s.vy -= ny * vn; s.vz -= nz * vn; // bỏ thành phần pháp tuyến
          s.vx *= 0.7; s.vy *= 0.7; s.vz *= 0.7;            // ma sát
          s.vx -= nx * vn * 0.35; s.vy -= ny * vn * 0.35; s.vz -= nz * vn * 0.35; // nảy
          if (-vn > 1.5) { sfx('hit', { volume: Math.min(1, -vn / 8) }); d.bounces++; }
          d.spinX *= 0.6; d.spinZ *= 0.6;
        }
        dynLand(d);
        if (s.vx * s.vx + s.vy * s.vy + s.vz * s.vz < 0.09) { s.vx = s.vy = s.vz = 0; d.rest = true; }
      }
    }
    // va chạm collider tĩnh (tường, cây...) → phản xạ vận tốc ngang
    if (PH && PH.resolveCircle) {
      dynV.x = s.x; dynV.z = s.z;
      if (PH.resolveCircle(dynV, DYN_R, s.y, 0.1)) {
        s.x = dynV.x; s.z = dynV.z;
        const n = PH.lastNormal, vn = s.vx * n.x + s.vz * n.z;
        if (vn < 0) { s.vx -= n.x * vn * 1.4; s.vz -= n.z * vn * 1.4; if (-vn > 1.5) sfx('hit', { volume: 0.4 }); }
        d.rest = false;
      }
    }
  }
  function updateDynamites(dt, t) {
    for (let i = dynamites.length - 1; i >= 0; i--) {
      const d = dynamites[i];
      d.t += dt;
      d.spark.scale.setScalar(0.7 + Math.random() * 0.8);
      d.sparkT -= dt;
      // tích phân bước cố định (CCD bằng bước nhỏ 1/120s: tốc độ ~20m/s → 0.17m/bước < bề dày mặt đất)
      d.acc += Math.min(dt, 0.1);
      while (d.acc >= DYN_H) { d.acc -= DYN_H; d.px = d.s.x; d.py = d.s.y; d.pz = d.s.z; dynStep(d, DYN_H); }
      const a = d.acc / DYN_H;
      d.g.position.set(lerp(d.px, d.s.x, a), lerp(d.py, d.s.y, a), lerp(d.pz, d.s.z, a));
      d.g.rotation.x += dt * d.spinX; d.g.rotation.z += dt * d.spinZ;
      if (d.water) { d.spinX *= Math.exp(-3 * dt); d.spinZ *= Math.exp(-3 * dt); }
      if (d.landed) {
        d.landT += dt;
        if (d.water) { if (d.sparkT <= 0) { d.sparkT = 0.25; fx('bubbles', d.g.position.clone()); } }
        else if (d.sparkT <= 0) { d.sparkT = 0.15; fx('sparkle', d.g.position.clone(), 0xffaa33); }
      }
      if ((d.landed && d.landT >= d.fuse) || d.t > 12) {
        const pos = d.g.position.clone();
        if (d.water || (isWater(pos.x, pos.z) && pos.y < waterH(pos.x, pos.z))) pos.y = waterH(pos.x, pos.z); // nổ dưới nước: cột nước trồi lên mặt
        if (G.disposeObject) G.disposeObject(d.g); else if (d.g.parent) d.g.parent.remove(d.g);
        dynamites.splice(i, 1);
        emit('explosion', { pos, size: 3 });
      }
    }
  }

  // ================= Cập nhật cần & dây =================
  function rodPose(dt, t) {
    const st = F.state;
    const tech = F.technique;
    let elev = 0.95, lean = 0, tv = 0.05, lambda = 8;
    let yawTarget = null;
    aimDir(aimV);
    const aimYaw = Math.atan2(aimV.x, aimV.z);
    yawTarget = aimYaw;
    const target = st === 'fight' && fs ? fs.pos : (st === 'waiting' || st === 'bite') ? entry : st === 'casting' ? lure : null;
    if (target) {
      const dx = target.x - rod.root.position.x, dz = target.z - rod.root.position.z;
      if (dx * dx + dz * dz > 1) yawTarget = Math.atan2(dx, dz);
    }
    if (st === 'charging') { elev = 1.6 + (charge ? charge.power * 0.35 : 0); lambda = 10; tv = 0.1; }
    else if (st === 'casting') { elev = cast && cast.vertical ? 0.35 : 0.4; lambda = 14; tv = 0.12; }
    else if (st === 'waiting' || st === 'bite') {
      const reeling = !!mouse().left && !(G.input && G.input.blocked);
      if (tech === 'float') elev = 0.62;
      else if (tech === 'spin') elev = reeling ? 0.25 : 0.4;
      else if (tech === 'vertical') elev = 0.25 + (wait ? wait.jigOff * 0.35 : 0);
      else elev = 0.75;
      tv = tech === 'float' ? 0.06 : reeling ? 0.3 : 0.15;
      if (st === 'bite' && bite && bite.phase === 'window') tv += 0.2 + bite.strength * 0.4;
    } else if (st === 'fight' && fs) {
      elev = 0.85 + (fs.pumpAnim > 0 ? 0.5 : 0) - (fs.lower ? 0.45 : 0);
      lean = fs.side * 0.45;
      tv = 0.3 + fs.tension * 1.15;
      lambda = 9;
    } else if (st === 'landing') { elev = 1.15; tv = 0.1; }
    rod.lean = damp(rod.lean, lean, 8, dt);
    rod.elev = damp(rod.elev, elev, lambda, dt);
    rod.yaw = dampAngle(rod.yaw, yawTarget, 10, dt);
    rod.root.rotation.set(PI / 2 - rod.elev, rod.yaw + rod.lean, 0);
    rod.root.updateMatrix();
    return tv;
  }

  function updateRod(dt, t, endPoint) {
    if (!rod.root) return;
    handPos(rod.root.position);
    const tv = rodPose(dt, t);
    // bend
    invQ.copy(rod.root.quaternion).conjugate();
    tmpA.set(0, -1, 0).applyQuaternion(invQ);
    bendTarget.copy(tmpA).multiplyScalar(0.12);
    if (endPoint) {
      // hướng uốn theo đoạn dây đầu tiên (dây võng → cần cúi theo dây), độ uốn tăng theo độ căng dây mô phỏng
      const rp = ropeTop && ropeTop.inited && lineObj && lineObj.visible ? ropeTop.points[Math.min(3, ropeTop.n)] : endPoint;
      tmpB.subVectors(rp, tipW);
      if (tmpB.lengthSq() < 1e-4) tmpB.subVectors(endPoint, tipW);
      if (tmpB.lengthSq() > 1e-6) {
        tmpB.normalize().applyQuaternion(invQ);
        bendTarget.addScaledVector(tmpB, tv + rod.twitch + (lineOut() ? ropeTension() * 0.12 : 0));
      }
    }
    rod.twitch = Math.max(0, rod.twitch - dt * 3);
    rod.bend.lerp(bendTarget, 1 - Math.exp(-14 * dt));
    const v = rod.bend;
    const mxz = Math.hypot(v.x, v.z);
    let total = 0;
    if (mxz > 1e-4) { axisV.set(v.z / mxz, 0, -v.x / mxz); total = Math.min(1.8, mxz * 1.5); }
    for (let i = 0; i < rod.segs.length; i++) {
      if (total > 0) rod.segs[i].quaternion.setFromAxisAngle(axisV, total * rod.weights[i]);
      else rod.segs[i].quaternion.set(0, 0, 0, 1);
    }
    rod.root.updateMatrixWorld(true);
    rod.tip.getWorldPosition(tipW);
    // máy cuộn
    if (rod.reelHandle) {
      const reeling = !!mouse().left && (F.state === 'waiting' || F.state === 'fight' || F.state === 'bite');
      if (reeling) rod.reelHandle.rotation.x += dt * (rodD().reelSpeed || 2) * 6;
    }
    if (rod.glowMats.length) {
      const k = 0.5 + 0.35 * Math.sin(t * 3);
      for (const m of rod.glowMats) m.emissiveIntensity = k;
    }
  }

  function currentEndPoint(t) {
    const st = F.state;
    if (st === 'casting') return lure;
    if (st === 'waiting' || st === 'bite') return entry;
    if (st === 'fight' && fs) {
      const wy = waterH(fs.pos.x, fs.pos.z);
      if (fs.pos.y < wy && !fs.flying) return tmpC.set(fs.pos.x, wy, fs.pos.z);
      return fs.pos;
    }
    if (st === 'landing' && landing && landing.model && !landing.big) return landing.model.position;
    // treo lủng lẳng dưới đầu cần
    return tmpC.set(tipW.x + Math.sin(t * 1.3) * 0.05, tipW.y - 0.9, tipW.z + Math.cos(t * 1.1) * 0.05);
  }

  let bobberPrevState = 'idle';
  const BOB_OPT = { dt: 0, draft: 0.03, maxSubmerge: 0.7, extraForce: 0, damping: 0.3, gravity: 9.81 };
  function updateVisuals(dt, t) {
    const st = F.state;
    const tech = F.technique;
    lineDt = dt > 0 ? dt : 1 / 60;
    const E = currentEndPoint(t);
    const hookBelow = (st === 'waiting' || st === 'bite') ? hook : st === 'fight' && fs && !fs.flying && fs.pos.y < E.y ? fs.pos : null;
    let slack = 0.4;
    if (st === 'idle' || st === 'charging') slack = 0;
    else if (st === 'casting') slack = cast && cast.vertical ? 0.02 : 0.35;
    else if (st === 'waiting') slack = tech === 'float' ? 0.55 : mouse().left ? 0.08 : 0.3;
    else if (st === 'bite') slack = bite && bite.phase === 'window' ? 0.1 : 0.4;
    else if (st === 'fight' && fs) slack = Math.max(0, (1 - fs.tension) * 0.3); // căng dần khi lực căng tăng
    else if (st === 'landing') slack = 0.05;
    if (st === 'landing' && landing && landing.big) { lineObj.visible = false; underObj.visible = false; }
    else {
      // idle/charging: dây treo lủng lẳng 0.9m dưới đầu cần như con lắc
      drawLine(tipW, E, slack, (st === 'idle' || st === 'charging') ? 0.92 : null);
      if (hookBelow) drawUnder(E, hookBelow, st === 'fight' ? 0 : 0.6); else underObj.visible = false;
    }
    // phao: nổi bằng lực đẩy Archimedes (lò xo - giảm chấn theo độ ngập), bị cá rỉa/kéo thì chìm thật
    const showBobber = tech === 'float' && st !== 'fight' && st !== 'landing';
    bobber.visible = showBobber;
    const PH = G.physics;
    if (showBobber) {
      if (st === 'waiting' || st === 'bite') {
        let dip = 0; // m: lực kéo xuống quy đổi thành độ ngập thêm khi cân bằng
        let wobX = 0, wobZ = 0;
        if (wait && wait.nibble) dip += 0.035 * Math.abs(Math.sin(wait.nibble.t * 30));
        if (st === 'bite' && bite) {
          if (bite.phase === 'pre') dip += 0.03 * Math.abs(Math.sin(bite.t * 25));
          else {
            dip += 0.1 + 0.45 * bite.strength;
            const a = 0.04 + 0.15 * bite.strength;
            wobX = Math.sin(t * 31) * a; wobZ = Math.cos(t * 27) * a;
          }
        }
        if (F.hookDepth < 0.05 && st === 'waiting') dip -= 0.03; // phao nằm nghiêng khi mới rơi (chì chưa chìm)
        const wy = waterH(entry.x, entry.z);
        if (PH && PH.buoyancy && dt > 0) {
          if (bobberPrevState !== 'waiting' && bobberPrevState !== 'bite') {
            // vừa rơi xuống nước: đặt ở mặt nước với vận tốc rơi → chìm xuống rồi nảy lên
            PH.resetBuoyancy(bobber);
            bobber.position.set(entry.x, wy, entry.z);
            const bs = PH.buoyancy(bobber, (BOB_OPT.dt = 1e-4, BOB_OPT.extraForce = 0, BOB_OPT));
            if (bs) bs.vy = -1.4;
          }
          bobber.position.x = entry.x + wobX; bobber.position.z = entry.z + wobZ;
          BOB_OPT.dt = dt; BOB_OPT.extraForce = -9.81 * dip / BOB_OPT.draft; BOB_OPT.floor = wy - 0.75;
          PH.buoyancy(bobber, BOB_OPT);
        } else {
          bobber.position.set(entry.x + wobX, wy - dip + Math.sin(t * 2.2) * 0.015, entry.z + wobZ);
        }
        bobber.rotation.set(wobX * 3, 0, wobZ * 3);
      } else {
        bobber.position.copy(E);
        bobber.rotation.set(0, 0, 0);
      }
    }
    bobberPrevState = showBobber ? st : 'idle';
    // mồi / lưỡi
    const showLure = !showBobber && (st === 'idle' || st === 'charging' || st === 'casting' || ((st === 'waiting' || st === 'bite') && F.hookDepth < 1.5));
    lureMesh.visible = showLure;
    if (showLure) {
      lureMesh.position.copy(st === 'waiting' || st === 'bite' ? hook : E);
      lureMesh.rotation.y += dt * 3;
    }
    // Lưỡi dưới phao ở trạng thái idle với cần phao: hiện mồi nhỏ dưới phao
    if (showBobber && (st === 'idle' || st === 'charging' || st === 'casting')) {
      lureMesh.visible = true;
      lureMesh.position.copy(E).add(tmpA.set(0, -0.25, 0));
    }
  }

  // ================= Vòng lặp chính =================
  function update(dt, t) {
    if (!inited) return;
    // timers (pháo nổ ăn mừng)
    for (let i = timers.length - 1; i >= 0; i--) {
      timers[i].t -= dt;
      if (timers[i].t <= 0) { const fn = timers[i].fn; timers.splice(i, 1); try { fn(); } catch (e) { console.error(e); } }
    }
    updateDynamites(dt, t);
    perfectT = Math.max(0, perfectT - dt);
    if (F.tangled > 0) F.tangled = Math.max(0, F.tangled - dt);

    const mode = G.state.mode;
    const inp = !(G.input && G.input.blocked) && mode !== 'menu' && !G.paused;

    // Phím F: cầm / cất cần
    if (inp && KP('KeyF') && F.state !== 'bite' && F.state !== 'fight') {
      if (mode === 'fishing' && F.active) {
        if (lineOut() || F.state === 'charging') { cancelLine(); toast('Thu dây.', 'info'); }
        else if (F.state !== 'landing') {
          deactivate();
          setModeSelf(prevMode === 'boat' && G.state.onBoat ? 'boat' : 'explore');
          toast('Cất cần.', 'info');
        }
        return;
      } else if (mode === 'explore' || mode === 'boat') {
        if (activate()) { prevMode = mode; setModeSelf('fishing'); toast('Cầm ' + rodD().name + ' — giữ chuột trái để quăng.', 'info'); }
        return;
      } else if (mode === 'swim') { toast('Đang bơi thì câu kiểu gì!', 'warn'); return; }
    }
    if (!F.active) return;
    if (mode !== 'fishing' && mode !== 'fight' && mode !== 'menu') { deactivate(); return; }

    // đổi cần ngoài ý muốn (bị tịch thu / UI đổi)
    if (!owns('ownedRods', eq().rod) && F.state !== 'fight') {
      if (!ensureOwnedRod()) { deactivate(); setModeSelf('explore'); toast('Mất cần câu rồi!', 'bad'); return; }
    }
    if (rod.id !== eq().rod) { if (lineOut() && F.state !== 'fight') cancelLine(true); if (F.state !== 'fight') { buildRod(eq().rod); rod.root.visible = true; } }
    F.technique = rodD().technique;

    if (inp) {
      if (KP('KeyR')) { if (F.state === 'idle') cycleRod(); else if (F.state !== 'landing') toast('Thu dây trước đã rồi đổi cần!', 'warn'); }
      if (KP('KeyB')) {
        if (F.state === 'fight') { /* bỏ qua */ }
        else if (G.ui && G.ui.openPanel) G.ui.openPanel('bait');
        else cycleBait();
      }
      if (KP('Escape') && (F.state === 'waiting' || F.state === 'casting')) cancelLine();
    }

    switch (F.state) {
      case 'idle':
        if (inp) {
          const m = mouse();
          if (m.leftPressed) {
            if (F.tangled > 0) toast('Đang gỡ rối dây...', 'warn');
            else startCharging();
          }
          if (m.wheel) F.depth = clamp(F.depth + m.wheel * 0.25, 0.2, 60);
        }
        setAnim('idle');
        break;
      case 'charging': updateCharging(dt, t, inp); break;
      case 'casting': updateCasting(dt, t); break;
      case 'waiting': if (wait) updateWaiting(dt, t, inp); else F.state = 'idle'; break;
      case 'bite': if (bite) updateBite(dt, t, inp); else F.state = 'waiting'; break;
      case 'fight': if (fs) updateFight(dt, t, inp); else { F.state = 'idle'; setModeSelf('fishing'); } break;
      case 'landing': if (landing) updateLanding(dt, t, inp); else F.state = 'idle'; break;
    }
    if (!F.active || !rod.root) return;

    // reel sound khi chờ
    if (F.state === 'waiting' && inp && mouse().left) startReelSound(0.8 + (rodD().reelSpeed || 2) * 0.1);
    else if (F.state !== 'fight') stopReelSound();

    const E = currentEndPoint(t).clone();
    updateRod(dt, t, E);
    updateVisuals(dt, t);
    if (G.player) G.player.locked = F.state !== 'idle';
    if (F.state === 'fight' && fs && G.player) G.player.cameraFocus = fs.pos;
  }

  // ================= Sự kiện =================
  function onModeChanged(d) {
    if (selfMode || !d) return;
    const to = d.to, from = d.from;
    if (to === 'menu' || from === 'menu') return;
    if (to === 'fishing') {
      if (!F.active) { prevMode = from === 'boat' ? 'boat' : 'explore'; if (!activate()) setModeSelf(from || 'explore'); }
      return;
    }
    if (to === 'fight') return;
    if (F.active) deactivate();
  }
  function onEnvChanged() {
    timers.length = 0;
    for (const d of dynamites) { if (d.g.parent) d.g.parent.remove(d.g); }
    dynamites.length = 0;
    condCache.c = null;
    if (F.active) {
      cleanupLine(true);
      F.state = 'idle';
      if (G.player) G.player.locked = false;
    }
  }

  let inited = false;
  F.init = function () {
    if (inited) return;
    V3 = THREE.Vector3;
    UP = new V3(0, 1, 0);
    tipW = new V3(); handW = new V3(); aimV = new V3(0, 0, 1); rightV = new V3();
    entry = new V3(); hook = new V3(); lure = new V3();
    tmpA = new V3(); tmpB = new V3(); tmpC = new V3();
    invQ = new THREE.Quaternion(); axisV = new V3(1, 0, 0); bendTarget = new V3(); qTmp = new THREE.Quaternion();
    castFrom = new V3(); castTo = new V3();
    rod.bend = new V3(0, 0, 0);
    buildLineObjects();
    buildRod(eq().rod && item(eq().rod) ? eq().rod : 'rod_bamboo');
    refreshLineLook();
    F.technique = rodD().technique;
    if (G.bus) {
      G.bus.on('mode:changed', onModeChanged);
      G.bus.on('env:changed', onEnvChanged);
      G.bus.on('warden:caught', () => { if (F.active) { cleanupLine(true); } });
    }
    G.addUpdate(update, 40);
    inited = true;
  };

  // API phụ
  F.toggle = function () {
    const mode = G.state.mode;
    if (F.active) { if (lineOut()) cancelLine(); deactivate(); setModeSelf(prevMode === 'boat' && G.state.onBoat ? 'boat' : 'explore'); }
    else if (mode === 'explore' || mode === 'boat') { if (activate()) { prevMode = mode; setModeSelf('fishing'); } }
  };
  F.cancel = function () { cancelLine(); };
  F.cycleRod = cycleRod;
  F.cycleBait = cycleBait;
})();
