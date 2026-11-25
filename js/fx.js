// fx.js — hiệu ứng: hạt (particle) dùng chung, nước bắn, gợn sóng, cháy nổ bùm bùm, rung camera, chữ bay, mưa, pháo hoa, lớp phủ màn hình
(function () {
  const G = (window.G = window.G || {});
  const R = (a, b) => a + Math.random() * (b - a);
  const clamp = G.util.clamp;

  function V(p) {
    if (!p) return new THREE.Vector3();
    if (p.isVector3) return p.clone();
    return new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0);
  }
  function waterY(x, z) {
    const w = G.world;
    if (w && w.getWaterHeight) { try { const y = w.getWaterHeight(x, z); if (isFinite(y)) return y; } catch (e) {} }
    if (w && w.getWaterLevel) { try { return w.getWaterLevel(); } catch (e) {} }
    return 0;
  }
  function isWater(x, z) { const w = G.world; try { return !!(w && w.isWater && w.isWater(x, z)); } catch (e) { return false; } }
  function groundY(x, z) { const w = G.world; try { if (w && w.groundHeight) { const y = w.groundHeight(x, z); if (isFinite(y)) return y; } } catch (e) {} return 0; }
  function surfaceY(x, z) { return isWater(x, z) ? Math.max(waterY(x, z), groundY(x, z)) : groundY(x, z); }
  function sfx(name, opts) { if (G.audio && G.audio.play) G.audio.play(name, opts); }

  // ---------- Hệ thống hạt chung ----------
  const VERT = [
    'attribute float psize; attribute float palpha; attribute vec3 pcolor;',
    'uniform float uScale; varying vec3 vColor; varying float vAlpha;',
    'void main(){ vColor = pcolor; vAlpha = palpha;',
    '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
    '  gl_PointSize = clamp(psize * uScale / max(-mv.z, 0.1), 0.0, 256.0);',
    '  gl_Position = projectionMatrix * mv; }',
  ].join('\n');
  const FRAG = [
    'varying vec3 vColor; varying float vAlpha; uniform float uSoft;',
    'void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);',
    '  if (d > 0.5) discard;',
    '  float a = (1.0 - smoothstep(uSoft, 0.5, d)) * vAlpha;',
    '  gl_FragColor = vec4(vColor, a);',
    '  #include <encodings_fragment>',
    '}',
  ].join('\n');

  function makePool(max, additive, soft) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('palpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, max);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uSoft: { value: soft } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = additive ? 12 : 10;
    const P = {
      max, pts, geo, mat, pos, col, size, alpha, cursor: 0, alive: 0, hi: -1, uploaded: 0,
      vel: new Float32Array(max * 3), life: new Float32Array(max), maxLife: new Float32Array(max),
      s0: new Float32Array(max), s1: new Float32Array(max), a0: new Float32Array(max),
      c0: new Float32Array(max * 3), c1: new Float32Array(max * 3),
      grav: new Float32Array(max), drag: new Float32Array(max), wob: new Float32Array(max), floor: new Float32Array(max),
    };
    return P;
  }
  let pools = null; // {add, norm}

  // emit một hạt. o: {pos, vel, life, size, sizeEnd, color, colorEnd, alpha, gravity, drag, wobble, floor}
  const _c0 = new THREE.Color(), _c1 = new THREE.Color();
  function emit(P, o) {
    let i = P.cursor, tries = 0;
    while (P.life[i] > 0 && tries < 64) { i = (i + 1) % P.max; tries++; }
    P.cursor = (i + 1) % P.max;
    const i3 = i * 3;
    P.pos[i3] = o.x; P.pos[i3 + 1] = o.y; P.pos[i3 + 2] = o.z;
    P.vel[i3] = o.vx || 0; P.vel[i3 + 1] = o.vy || 0; P.vel[i3 + 2] = o.vz || 0;
    P.life[i] = P.maxLife[i] = o.life || 1;
    P.s0[i] = o.size || 0.3; P.s1[i] = o.sizeEnd != null ? o.sizeEnd : P.s0[i];
    P.a0[i] = o.alpha != null ? o.alpha : 1;
    // màu tuyến tính (shader tự mã hóa ra sRGB / để tuyến tính cho hậu kỳ); intensity > 1 → HDR, bloom bắt
    _c0.set(o.color != null ? o.color : 0xffffff).convertSRGBToLinear(); _c1.set(o.colorEnd != null ? o.colorEnd : (o.color != null ? o.color : 0xffffff)).convertSRGBToLinear();
    if (o.intensity) { _c0.multiplyScalar(o.intensity); _c1.multiplyScalar(o.intensityEnd != null ? o.intensityEnd : o.intensity); }
    if (i > P.hi) P.hi = i;
    P.c0[i3] = _c0.r; P.c0[i3 + 1] = _c0.g; P.c0[i3 + 2] = _c0.b;
    P.c1[i3] = _c1.r; P.c1[i3 + 1] = _c1.g; P.c1[i3 + 2] = _c1.b;
    P.grav[i] = o.gravity || 0; P.drag[i] = o.drag || 0; P.wob[i] = o.wobble || 0;
    P.floor[i] = o.floor != null ? o.floor : -1e9;
  }
  function markRange(at, n) { at.updateRange.offset = 0; at.updateRange.count = n * at.itemSize; at.needsUpdate = true; }
  function updatePool(P, dt, t) {
    // chỉ duyệt/tải lên GPU đoạn [0, hi] còn hạt sống
    const end = P.hi + 1;
    let hi = -1;
    if (end <= 0 && P.uploaded <= 0) { P.geo.drawRange.count = 0; return; }
    for (let i = 0; i < end; i++) {
      const i3 = i * 3;
      if (P.life[i] <= 0) { if (P.alpha[i] !== 0) { P.alpha[i] = 0; P.size[i] = 0; } continue; }
      P.life[i] -= dt;
      if (P.life[i] <= 0) { P.alpha[i] = 0; P.size[i] = 0; continue; }
      const k = 1 - P.life[i] / P.maxLife[i]; // 0 → 1
      const dr = Math.max(0, 1 - P.drag[i] * dt);
      P.vel[i3] *= dr; P.vel[i3 + 1] = P.vel[i3 + 1] * dr - P.grav[i] * dt; P.vel[i3 + 2] *= dr;
      if (P.wob[i]) { P.vel[i3] += Math.sin(t * 7 + i) * P.wob[i] * dt; P.vel[i3 + 2] += Math.cos(t * 6 + i * 1.3) * P.wob[i] * dt; }
      P.pos[i3] += P.vel[i3] * dt; P.pos[i3 + 1] += P.vel[i3 + 1] * dt; P.pos[i3 + 2] += P.vel[i3 + 2] * dt;
      if (P.pos[i3 + 1] < P.floor[i]) { P.life[i] = Math.min(P.life[i], 0.05); P.pos[i3 + 1] = P.floor[i]; }
      P.size[i] = P.s0[i] + (P.s1[i] - P.s0[i]) * k;
      // mờ dần cuối đời, hiện nhanh đầu đời
      const fade = k < 0.08 ? k / 0.08 : 1 - Math.pow(Math.max(0, (k - 0.3) / 0.7), 1.5);
      P.alpha[i] = P.a0[i] * clamp(fade, 0, 1);
      hi = i;
      P.col[i3] = P.c0[i3] + (P.c1[i3] - P.c0[i3]) * k;
      P.col[i3 + 1] = P.c0[i3 + 1] + (P.c1[i3 + 1] - P.c0[i3 + 1]) * k;
      P.col[i3 + 2] = P.c0[i3 + 2] + (P.c1[i3 + 2] - P.c0[i3 + 2]) * k;
    }
    // tải lên phạm vi đã đổi (gồm cả phần vừa chết ở frame này để ẩn chúng)
    const n = Math.max(end, P.uploaded);
    P.hi = hi; P.uploaded = hi + 1;
    P.geo.setDrawRange(0, n);
    const a = P.geo.attributes;
    markRange(a.position, n); markRange(a.pcolor, n); markRange(a.psize, n); markRange(a.palpha, n);
  }

  // ---------- Hẹn giờ (theo thời gian game, dừng khi pause) ----------
  const timers = [];
  function later(delay, fn) { timers.push({ t: delay, fn }); }

  // ---------- Vòng gợn sóng / sóng xung kích ----------
  // Vòng: pool cố định (tái dùng mesh + vật liệu, không tạo/hủy mỗi lần)
  const RING_MAX = 28;
  const rings = [], ringFree = [];
  let ringGeo = null;
  function ring(pos, opts) {
    if (!G.scene) return;
    if (!ringGeo) ringGeo = new THREE.RingGeometry(0.85, 1, 48, 1);
    let r = ringFree.pop();
    if (!r) {
      if (rings.length >= RING_MAX) { r = rings.shift(); }
      else {
        const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
        const m = new THREE.Mesh(ringGeo, mat);
        m.rotation.x = -Math.PI / 2; m.renderOrder = 9;
        r = { m };
      }
    }
    const mat = r.m.material;
    mat.color.set(opts.color || 0xffffff);
    const bl = opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (mat.blending !== bl) { mat.blending = bl; mat.needsUpdate = true; }
    mat.opacity = opts.opacity || 0.6;
    r.m.position.set(pos.x, pos.y, pos.z);
    r.m.scale.setScalar(opts.r0 || 0.2);
    if (r.m.parent !== G.scene) G.scene.add(r.m);
    r.life = r.max = opts.life || 1.5; r.r0 = opts.r0 || 0.2; r.r1 = opts.r1 || 2; r.op = opts.opacity || 0.6;
    rings.push(r);
  }
  function freeRing(r) { if (r.m.parent) r.m.parent.remove(r.m); ringFree.push(r); }

  // ---------- Mảnh vỡ ----------
  // Mảnh vỡ: 1 InstancedMesh (≤ DEBRIS_MAX), mỗi mảnh là object nhẹ {m: {position, rotation, scale}}
  const DEBRIS_MAX = 56;
  const debris = [];
  let debrisMesh = null;
  const DEBRIS_COLS = [0x3a2a1a, 0x555555, 0x2a2a2a, 0x6b4a2b];
  function makeDebrisMesh() {
    if (debrisMesh) return;
    debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), DEBRIS_MAX);
    debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    debrisMesh.frustumCulled = false; debrisMesh.count = 0;
    for (let i = 0; i < DEBRIS_MAX; i++) debrisMesh.setColorAt(i, _c0.set(DEBRIS_COLS[i % 4]));
  }
  function spawnDebris(p, n, size) {
    if (!G.scene) return;
    makeDebrisMesh();
    if (debrisMesh.parent !== G.scene) G.scene.add(debrisMesh);
    for (let i = 0; i < n; i++) {
      if (debris.length >= DEBRIS_MAX) debris.shift();
      const s = R(0.12, 0.4) * size;
      const m = { position: new THREE.Vector3().copy(p), rotation: new THREE.Euler(), scale: new THREE.Vector3(s * R(0.6, 1.4), s * R(0.6, 1.4), s * R(0.6, 1.4)) };
      const sp = R(6, 16) * Math.sqrt(size);
      const th = R(0, Math.PI * 2), up = R(0.4, 1);
      debris.push({ m, vx: Math.cos(th) * sp * (1 - up * 0.5), vy: sp * up * 1.3, vz: Math.sin(th) * sp * (1 - up * 0.5), rx: R(-10, 10), ry: R(-10, 10), life: R(2, 3.5), smoke: Math.random() < 0.5 });
    }
  }
  const _dq = new THREE.Quaternion(), _dm = new THREE.Matrix4();
  function syncDebris() {
    if (!debrisMesh) return;
    for (let i = 0; i < debris.length; i++) {
      const m = debris[i].m;
      _dq.setFromEuler(m.rotation); _dm.compose(m.position, _dq, m.scale);
      debrisMesh.setMatrixAt(i, _dm);
    }
    debrisMesh.count = debris.length;
    debrisMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- Chữ bay ----------
  const texts = [];
  function floatText(pos, text, color) {
    if (!G.scene) return;
    const p = V(pos);
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    const font = G.util.font(800, 56, true);
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(String(text)).width) + 40;
    cv.width = Math.min(2048, w); cv.height = 104; // đủ chỗ cho dấu chồng (Ấ, Ỗ, Ự)
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineJoin = 'round';
    ctx.strokeText(String(text), cv.width / 2, 56);
    let col = color;
    if (typeof col === 'number') col = '#' + col.toString(16).padStart(6, '0');
    ctx.fillStyle = col || '#ffffff';
    ctx.fillText(String(text), cv.width / 2, 56);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    tex.encoding = THREE.sRGBEncoding;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false });
    mat.toneMapped = false;
    const sp = new THREE.Sprite(mat);
    const h = 0.7;
    sp.scale.set(h * cv.width / cv.height, h, 1);
    sp.position.copy(p);
    sp.renderOrder = 999;
    G.scene.add(sp);
    texts.push({ sp, life: 1.8, max: 1.8, h, vx: R(-0.3, 0.3) });
    if (texts.length > 25) { const t = texts.shift(); disposeSprite(t.sp); }
  }
  function disposeSprite(sp) { if (sp.parent) sp.parent.remove(sp); sp.material.map.dispose(); sp.material.dispose(); }

  // ---------- Đèn chớp ----------
  let flashLight = null, flashI = 0;

  // ---------- Rung camera ----------
  let shakeAmt = 0, shakeDur = 0, shakeT = 0;
  const shakeOff = new THREE.Vector3();
  let shakeRoll = 0, shakeApplied = false;
  function shake(amount, duration) {
    amount = amount == null ? 0.3 : amount;
    duration = duration == null ? 0.4 : duration;
    if (amount >= shakeAmt * Math.max(0, shakeT / Math.max(shakeDur, 0.001))) { shakeAmt = amount; shakeDur = duration; shakeT = duration; }
    else shakeT = Math.max(shakeT, duration * 0.5);
  }

  // ---------- Hiệu ứng cấp cao ----------
  function splash(pos, size) {
    if (!pools) return;
    size = size || 1;
    const p = V(pos);
    const wy = waterY(p.x, p.z);
    if (isWater(p.x, p.z)) p.y = wy;
    const n = Math.min(80, Math.floor(18 * size + 6));
    for (let i = 0; i < n; i++) {
      const th = R(0, Math.PI * 2), sp = R(0.5, 2.5) * Math.sqrt(size);
      emit(pools.norm, { x: p.x + Math.cos(th) * 0.2 * size, y: p.y + 0.05, z: p.z + Math.sin(th) * 0.2 * size, vx: Math.cos(th) * sp, vy: R(2.5, 5.5) * Math.sqrt(size), vz: Math.sin(th) * sp, life: R(0.6, 1.1), size: R(0.08, 0.18) * Math.sqrt(size), sizeEnd: 0.05, color: 0xeaf6ff, colorEnd: 0xbfe0ff, alpha: 0.9, gravity: 11, floor: p.y - 0.1 });
    }
    // vương miện nước
    const cn = Math.min(48, Math.floor(16 * size + 8));
    for (let i = 0; i < cn; i++) {
      const th = (i / cn) * Math.PI * 2;
      const r = 0.35 * size;
      emit(pools.norm, { x: p.x + Math.cos(th) * r, y: p.y, z: p.z + Math.sin(th) * r, vx: Math.cos(th) * 1.6 * Math.sqrt(size), vy: R(1.8, 2.8) * Math.sqrt(size), vz: Math.sin(th) * 1.6 * Math.sqrt(size), life: 0.55, size: 0.22 * Math.sqrt(size), sizeEnd: 0.1, color: 0xffffff, alpha: 0.75, gravity: 9, floor: p.y - 0.1 });
    }
    // bọt
    for (let i = 0; i < 8 * size && i < 30; i++) emit(pools.norm, { x: p.x + R(-0.5, 0.5) * size, y: p.y + 0.05, z: p.z + R(-0.5, 0.5) * size, life: R(1, 2), size: R(0.3, 0.6) * size, sizeEnd: R(0.6, 1) * size, color: 0xffffff, alpha: 0.35 });
    ripple(p, size);
  }
  function ripple(pos, size) {
    size = size || 1;
    const p = V(pos);
    p.y = waterY(p.x, p.z) + 0.04;
    ring(p, { r0: 0.2 * size, r1: 2.5 * size, life: 1.6, opacity: 0.55, color: 0xe8f6ff });
    later(0.25, () => ring(p, { r0: 0.15 * size, r1: 1.8 * size, life: 1.4, opacity: 0.4, color: 0xe8f6ff }));
  }
  function sparkle(pos, color) {
    if (!pools) return;
    const p = V(pos);
    for (let i = 0; i < 18; i++) {
      emit(pools.add, { x: p.x + R(-0.4, 0.4), y: p.y + R(-0.3, 0.5), z: p.z + R(-0.4, 0.4), vx: R(-0.6, 0.6), vy: R(0.3, 1.6), vz: R(-0.6, 0.6), life: R(0.5, 1.1), size: R(0.1, 0.25), sizeEnd: 0.02, color: color || 0xfff3a0, alpha: 1, drag: 1.5, intensity: 1.8, intensityEnd: 0.8 });
    }
  }
  function bubbles(pos, n) {
    if (!pools) return;
    const p = V(pos);
    const top = waterY(p.x, p.z);
    for (let i = 0; i < (n || 10); i++) {
      emit(pools.norm, { x: p.x + R(-0.3, 0.3), y: p.y + R(-0.2, 0.2), z: p.z + R(-0.3, 0.3), vy: R(0.8, 1.8), life: R(1, 2.2), size: R(0.05, 0.14), sizeEnd: 0.18, color: 0xd8f4ff, alpha: 0.75, gravity: -0.5, wobble: 1.5, drag: 0.5 });
    }
    if (Math.abs(top - p.y) < 0.5) ripple(p, 0.4);
  }

  const _d = new THREE.Vector3();
  function explosion(pos, size) {
    if (!pools) return;
    size = clamp(size || 1, 0.2, 8);
    const p = V(pos);
    const onWater = isWater(p.x, p.z) && p.y <= waterY(p.x, p.z) + 2;
    const sy = surfaceY(p.x, p.z);
    if (p.y < sy) p.y = sy;
    const s = size, ss = Math.sqrt(size);
    // chớp lõi (HDR → bloom) + lõi nóng âm ỉ
    emit(pools.add, { x: p.x, y: p.y + 0.5 * s, z: p.z, life: 0.18, size: 6 * s, sizeEnd: 9 * s, color: 0xffeeaa, colorEnd: 0xff8822, alpha: 0.7, intensity: 4, intensityEnd: 1.5 });
    for (let i = 0; i < 3; i++) emit(pools.add, { x: p.x + R(-0.3, 0.3) * s, y: p.y + R(0.3, 0.9) * s, z: p.z + R(-0.3, 0.3) * s, vy: R(0.5, 1.5), life: R(0.45, 0.7), size: R(2.2, 3.2) * s, sizeEnd: R(3.5, 4.5) * s, color: 0xffd27a, colorEnd: 0xff4a10, alpha: 0.55, intensity: 3, intensityEnd: 0.8, drag: 2 });
    // cầu lửa
    for (let i = 0; i < 40 * ss; i++) {
      const d = _d.set(R(-1, 1), R(-0.2, 1), R(-1, 1)).normalize().multiplyScalar(R(2, 7) * ss);
      emit(pools.add, { x: p.x + R(-0.3, 0.3) * s, y: p.y + R(0, 0.6) * s, z: p.z + R(-0.3, 0.3) * s, vx: d.x, vy: d.y + 1.5, vz: d.z, life: R(0.5, 1.1), size: R(0.9, 1.8) * s, sizeEnd: R(2, 3.2) * s, color: 0xffc040, colorEnd: 0xc02000, alpha: 0.42, drag: 2.5, gravity: -2, intensity: 2.2, intensityEnd: 0.6 });
    }
    // tia lửa
    for (let i = 0; i < 70 * ss; i++) {
      const d = _d.set(R(-1, 1), R(0, 1.3), R(-1, 1)).normalize().multiplyScalar(R(8, 22) * ss);
      emit(pools.add, { x: p.x, y: p.y + 0.4 * s, z: p.z, vx: d.x, vy: d.y, vz: d.z, life: R(0.6, 1.6), size: R(0.12, 0.3) * ss, sizeEnd: 0.05, color: 0xffee88, colorEnd: 0xff5500, alpha: 1, gravity: 14, drag: 0.8, floor: sy - 0.2, intensity: 3, intensityEnd: 1.2 });
    }
    // cột khói (phát dần)
    const smokeCol = onWater ? 0x9aa0a6 : 0x3b3632;
    for (let k = 0; k < 8; k++) {
      later(k * 0.09, () => {
        for (let i = 0; i < 7 * ss; i++) {
          emit(pools.norm, { x: p.x + R(-0.8, 0.8) * s, y: p.y + R(0.3, 1.5) * s, z: p.z + R(-0.8, 0.8) * s, vx: R(-0.8, 0.8), vy: R(2.5, 5) * ss, vz: R(-0.8, 0.8), life: R(2.5, 4.5), size: R(1.5, 2.5) * s, sizeEnd: R(5, 8) * s, color: k < 2 ? 0x664433 : smokeCol, colorEnd: 0x77777a, alpha: 0.55, drag: 0.6, wobble: 0.6 });
        }
      });
    }
    // mảnh vụn
    spawnDebris(p.clone().add(new THREE.Vector3(0, 0.5, 0)), Math.floor(clamp(8 * ss, 4, 18)), ss);
    // cột nước
    if (onWater) {
      const wy = waterY(p.x, p.z);
      for (let i = 0; i < 110 * ss; i++) {
        const th = R(0, Math.PI * 2), r = R(0, 1.2) * s;
        emit(pools.norm, { x: p.x + Math.cos(th) * r, y: wy, z: p.z + Math.sin(th) * r, vx: Math.cos(th) * R(0.5, 3) * ss, vy: R(8, 20) * ss, vz: Math.sin(th) * R(0.5, 3) * ss, life: R(1.2, 2.4), size: R(0.25, 0.6) * ss, sizeEnd: R(0.6, 1.2) * ss, color: 0xffffff, colorEnd: 0xcfe8ff, alpha: 0.85, gravity: 12, drag: 0.3, floor: wy - 0.2 });
      }
      later(0.9, () => splash(new THREE.Vector3(p.x, wy, p.z), 3 * ss));
      ring(new THREE.Vector3(p.x, wy + 0.06, p.z), { r0: 0.5, r1: 22 * ss, life: 1.4, opacity: 0.85, color: 0xffffff });
      later(0.2, () => ring(new THREE.Vector3(p.x, wy + 0.05, p.z), { r0: 0.5, r1: 14 * ss, life: 1.8, opacity: 0.6, color: 0xdff2ff }));
    } else {
      ring(new THREE.Vector3(p.x, sy + 0.08, p.z), { r0: 0.5, r1: 16 * ss, life: 0.8, opacity: 0.7, color: 0xffcc88, additive: true });
      for (let i = 0; i < 30 * ss; i++) { // bụi đất
        const th = R(0, Math.PI * 2);
        emit(pools.norm, { x: p.x, y: sy + 0.2, z: p.z, vx: Math.cos(th) * R(4, 9) * ss, vy: R(0.2, 1.5), vz: Math.sin(th) * R(4, 9) * ss, life: R(1, 2), size: R(0.8, 1.5) * ss, sizeEnd: 3 * ss, color: 0x8a7a60, alpha: 0.5, drag: 2 });
      }
    }
    // ánh sáng chớp
    if (flashLight) {
      flashLight.position.set(p.x, p.y + 2 * s, p.z);
      flashLight.distance = 60 * ss + 20;
      flashI = Math.max(flashI, 3 * ss);
    }
    // rung + âm thanh + chớp màn hình theo khoảng cách
    let dist = 30;
    if (G.camera) dist = G.camera.position.distanceTo(p);
    const near = clamp(1 - dist / (80 * ss + 20), 0, 1);
    shake((0.25 + 0.9 * near) * Math.min(2, ss), 0.6 + 0.4 * ss);
    screenFlash(0.25 + 0.55 * near, '#fff4d0');
    sfx('explosion', { volume: 0.5 + 0.5 * near });
    if (onWater) later(0.6, () => sfx('bigsplash', { volume: 0.7 * (0.4 + near) }));
  }

  function fireworks(pos) {
    if (!pools) return;
    const base = V(pos);
    const rockets = 5;
    const palette = [0xff3355, 0xffd23f, 0x3fa9ff, 0x7dff6a, 0xff7bf0, 0xff8c1a, 0xffffff];
    for (let r = 0; r < rockets; r++) {
      later(r * R(0.25, 0.45), () => {
        const o = base.clone().add(new THREE.Vector3(R(-6, 6), 0, R(-6, 6)));
        const h = R(14, 24);
        const col = palette[Math.floor(Math.random() * palette.length)];
        const col2 = palette[Math.floor(Math.random() * palette.length)];
        sfx('firework', { volume: 0.6 });
        // đuôi tên lửa
        const steps = 12;
        for (let k = 0; k < steps; k++) {
          later(k * 0.06, () => {
            emit(pools.add, { x: o.x + R(-0.1, 0.1), y: o.y + (h * k) / steps, z: o.z + R(-0.1, 0.1), vy: -1, life: 0.5, size: 0.35, sizeEnd: 0.05, color: 0xffcc88, colorEnd: 0xff5500, alpha: 1, intensity: 2.2, intensityEnd: 0.8 });
          });
        }
        later(steps * 0.06, () => {
          const c = new THREE.Vector3(o.x, o.y + h, o.z);
          emit(pools.add, { x: c.x, y: c.y, z: c.z, life: 0.2, size: 8, sizeEnd: 10, color: 0xffffff, alpha: 1, intensity: 4, intensityEnd: 1 });
          for (let i = 0; i < 90; i++) {
            const d = _d.set(R(-1, 1), R(-1, 1), R(-1, 1)).normalize().multiplyScalar(R(7, 10));
            emit(pools.add, { x: c.x, y: c.y, z: c.z, vx: d.x, vy: d.y, vz: d.z, life: R(1.2, 2), size: R(0.3, 0.5), sizeEnd: 0.08, color: i % 3 ? col : col2, colorEnd: 0x331100, alpha: 1, gravity: 4, drag: 1.6, intensity: 2.6, intensityEnd: 0.6 });
          }
          if (flashLight) { flashLight.position.copy(c); flashLight.distance = 80; flashI = Math.max(flashI, 1.2); flashLight.color.setHex(col); later(0.4, () => flashLight && flashLight.color.setHex(0xffaa55)); }
        });
      });
    }
  }

  function confetti(pos) {
    if (!pools) return;
    const p = V(pos);
    const cols = [0xff4d6d, 0xffd60a, 0x4cc9f0, 0x80ed99, 0xc77dff, 0xff9f1c];
    for (let i = 0; i < 80; i++) {
      const th = R(0, Math.PI * 2), sp = R(1, 4);
      emit(pools.norm, { x: p.x, y: p.y, z: p.z, vx: Math.cos(th) * sp, vy: R(4, 9), vz: Math.sin(th) * sp, life: R(1.8, 3), size: R(0.1, 0.18), color: cols[i % cols.length], alpha: 1, gravity: 5, drag: 2.2, wobble: 4 });
    }
    sparkle(p.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xfff3a0);
  }


  // ---------- Mưa ----------
  let rainOn = false, rainManual = false, rainMesh = null, rainPos = null, rainVel = null, rainIntensity = 0;
  const RAIN_N = 900, RAIN_BOX = 36, RAIN_H = 26;
  function buildRain() {
    const geo = new THREE.BufferGeometry();
    rainPos = new Float32Array(RAIN_N * 6);
    rainVel = new Float32Array(RAIN_N);
    for (let i = 0; i < RAIN_N; i++) {
      const x = R(-RAIN_BOX, RAIN_BOX), y = R(-RAIN_H * 0.4, RAIN_H), z = R(-RAIN_BOX, RAIN_BOX);
      rainPos[i * 6] = x; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = z;
      rainPos[i * 6 + 3] = x; rainPos[i * 6 + 4] = y + 0.7; rainPos[i * 6 + 5] = z;
      rainVel[i] = R(22, 30);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.LineBasicMaterial({ color: 0xaac4dd, transparent: true, opacity: 0.0, depthWrite: false });
    rainMesh = new THREE.LineSegments(geo, mat);
    rainMesh.frustumCulled = false;
    rainMesh.renderOrder = 11;
  }
  function rain(on) { rainManual = true; rainOn = !!on; }

  // ---------- Lớp phủ màn hình (DOM) ----------
  let ov = null, flashEl = null, vigEl = null, waterEl = null, drunkEl = null, flashA = 0;
  function buildOverlays() {
    if (ov) return;
    ov = document.createElement('div');
    ov.id = 'fx-overlay';
    ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;overflow:hidden;';
    const mk = (css) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;' + css; ov.appendChild(d); return d; };
    waterEl = mk('background:radial-gradient(ellipse at 50% 20%, rgba(40,140,170,0.35), rgba(5,40,70,0.75));mix-blend-mode:normal;transition:opacity .25s;');
    drunkEl = mk('background:radial-gradient(circle at 50% 50%, rgba(255,120,200,0) 40%, rgba(170,60,255,0.28) 100%);');
    vigEl = mk('background:radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(200,0,0,0.65) 100%);');
    flashEl = mk('background:#fff;');
    const ui = document.getElementById('ui');
    if (ui && ui.parentNode) ui.parentNode.insertBefore(ov, ui); else document.body.appendChild(ov);
  }
  function screenFlash(intensity, color) {
    if (!flashEl) return;
    flashEl.style.background = color || '#ffffff';
    flashA = Math.max(flashA, clamp(intensity == null ? 0.8 : intensity, 0, 1));
  }
  let canvasFilterKey = '';
  function updateOverlays(dt, t) {
    if (!ov) return;
    const st = G.state || {};
    // chớp
    if (flashA > 0) { flashA = Math.max(0, flashA - dt * 2.2 - (dt === 0 ? 0.03 : 0)); }
    flashEl.style.opacity = flashA.toFixed(3);
    // máu thấp
    const hp = st.hp != null ? st.hp : 100;
    if (hp < 30 && st.mode !== 'menu') {
      const k = (30 - hp) / 30;
      vigEl.style.opacity = (0.35 + 0.45 * k + Math.sin(t * (4 + k * 4)) * 0.15 * (0.5 + k)).toFixed(3);
    } else vigEl.style.opacity = '0';
    // dưới nước
    let under = false;
    if (G.camera && G.world && G.world.getWaterHeight) {
      const c = G.camera.position;
      try { under = isWater(c.x, c.z) && c.y < waterY(c.x, c.z) - 0.05; } catch (e) {}
    }
    waterEl.style.opacity = under ? '1' : '0';
    // say
    const canvas = G.renderer && G.renderer.domElement;
    const drunk = st.drunk || 0;
    let key = '';
    if (canvas) {
      let filter = '', transform = '';
      if (drunk > 0.1) {
        const k = clamp((drunk - 0.1) / 0.9, 0, 1);
        const blur = (0.4 + 2.2 * k) * (0.6 + 0.4 * Math.sin(t * 1.7));
        const hue = Math.sin(t * 0.6) * 35 * k;
        filter = 'blur(' + blur.toFixed(2) + 'px) hue-rotate(' + hue.toFixed(1) + 'deg) saturate(' + (1 + 0.6 * k).toFixed(2) + ')';
        const rot = Math.sin(t * 0.9) * 2.2 * k, sx = 1.04 + 0.03 * k + Math.sin(t * 1.3) * 0.015 * k;
        transform = 'rotate(' + rot.toFixed(2) + 'deg) scale(' + sx.toFixed(3) + ',' + (1.04 + 0.03 * k + Math.cos(t * 1.1) * 0.015 * k).toFixed(3) + ') translate(' + (Math.sin(t * 0.7) * 10 * k).toFixed(1) + 'px,' + (Math.cos(t * 0.8) * 6 * k).toFixed(1) + 'px)';
        drunkEl.style.opacity = (0.4 + 0.6 * k).toFixed(2);
        // nhìn đôi: bóng mờ lệch trên lớp phủ
        drunkEl.style.backdropFilter = '';
        key = 'd';
      } else drunkEl.style.opacity = '0';
      if (under) { filter = (filter ? filter + ' ' : '') + 'saturate(0.8) brightness(0.9)'; key += 'u'; }
      if (key) { canvas.style.filter = filter; canvas.style.transform = transform; canvasFilterKey = key; }
      else if (canvasFilterKey) { canvas.style.filter = ''; canvas.style.transform = ''; canvasFilterKey = ''; }
    }
  }

  // ---------- Cập nhật mỗi frame ----------
  function ensureInScene() {
    if (!G.scene || !pools) return;
    if (pools.norm.pts.parent !== G.scene) G.scene.add(pools.norm.pts);
    if (pools.add.pts.parent !== G.scene) G.scene.add(pools.add.pts);
    makeDebrisMesh(); // có sẵn trong scene (count=0) để G.prewarm biên dịch shader → vụ nổ đầu tiên không khựng
    if (debrisMesh.parent !== G.scene) G.scene.add(debrisMesh);
    if (flashLight && flashLight.isObject3D && flashLight.parent !== G.scene) G.scene.add(flashLight);
  }

  function restoreCamera() {
    if (shakeApplied && G.camera) {
      G.camera.position.sub(shakeOff);
      G.camera.rotation.z -= shakeRoll;
      shakeApplied = false;
    }
  }

  let autoWeatherT = 0, lightningT = R(6, 14), lastCatchFx = 0;
  function update(dt, t) {
    if (!pools) return;
    ensureInScene();
    // timers
    for (let i = timers.length - 1; i >= 0; i--) {
      const tm = timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { timers.splice(i, 1); try { tm.fn(); } catch (e) { console.error('[fx timer]', e); } }
    }
    // kích thước hạt theo màn hình
    if (G.camera && G.renderer) {
      const h = G.renderer.domElement.height || window.innerHeight;
      const sc = h / (2 * Math.tan((G.camera.fov * Math.PI) / 360));
      pools.norm.mat.uniforms.uScale.value = sc;
      pools.add.mat.uniforms.uScale.value = sc;
    }
    updatePool(pools.norm, dt, t);
    updatePool(pools.add, dt, t);

    // vòng
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt;
      const k = 1 - r.life / r.max;
      if (r.life <= 0) { rings.splice(i, 1); freeRing(r); continue; }
      const e = 1 - Math.pow(1 - k, 2.2);
      r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * e);
      r.m.material.opacity = r.op * (1 - k);
    }
    // mảnh vụn
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.life -= dt;
      d.vy -= 18 * dt;
      d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
      d.m.rotation.x += d.rx * dt; d.m.rotation.y += d.ry * dt;
      const px = d.m.position.x, pz = d.m.position.z;
      if (d.smoke && Math.random() < 0.5) emit(pools.norm, { x: px, y: d.m.position.y, z: pz, vy: 0.5, life: 0.8, size: 0.4, sizeEnd: 1.2, color: 0x444444, alpha: 0.4 });
      if (d.vy < 0 && Math.random() < 0.3) {
        const sy = surfaceY(px, pz);
        if (d.m.position.y <= sy) {
          if (isWater(px, pz)) { splash(new THREE.Vector3(px, sy, pz), 0.4); d.life = 0; }
          else { d.m.position.y = sy; d.vy *= -0.3; d.vx *= 0.5; d.vz *= 0.5; d.rx *= 0.5; d.ry *= 0.5; d.smoke = false; }
        }
      }
      if (d.life <= 0) debris.splice(i, 1);
      else if (d.life < 0.5) d.m.scale.multiplyScalar(Math.max(0, 1 - dt * 3));
    }
    syncDebris();
    // chữ bay
    for (let i = texts.length - 1; i >= 0; i--) {
      const tx = texts[i];
      tx.life -= dt;
      const k = 1 - tx.life / tx.max;
      tx.sp.position.y += dt * 1.1;
      tx.sp.position.x += tx.vx * dt;
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.55 : k < 0.2 ? 1.15 - ((k - 0.12) / 0.08) * 0.15 : 1;
      tx.sp.scale.set(tx.h * pop * (tx.sp.material.map.image.width / tx.sp.material.map.image.height), tx.h * pop, 1);
      tx.sp.material.opacity = k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
      if (tx.life <= 0) { disposeSprite(tx.sp); texts.splice(i, 1); }
    }
    // ánh sáng chớp
    if (flashLight) {
      flashI = Math.max(0, flashI - dt * flashI * 6 - dt * 0.5);
      flashLight.intensity = flashI;
    }
    // mưa: tự bật theo thời tiết nếu không ai gọi rain()
    autoWeatherT -= dt;
    let storm = false;
    if (autoWeatherT <= 0) {
      autoWeatherT = 1;
      if (!rainManual && G.world && G.world.getConditions) {
        try { const c = G.world.getConditions(); const w = c && c.weather; rainOn = w === 'rain' || w === 'storm'; } catch (e) {}
      }
    }
    if (!rainManual && G.world && G.world.getConditions && rainOn) {
      try { storm = G.world.getConditions().weather === 'storm'; } catch (e) {}
    }
    updateRain(dt, storm);
    // sét khi bão (chỉ khi tự động theo thời tiết)
    if (storm && G.state && G.state.env !== 'airplane') {
      lightningT -= dt;
      if (lightningT <= 0) {
        lightningT = R(7, 18);
        screenFlash(0.55, '#e8f0ff');
        later(0.12, () => screenFlash(0.35, '#e8f0ff'));
        later(R(0.4, 1.5), () => sfx('thunder', { volume: R(0.6, 1) }));
      }
    }
    // rung camera — áp offset sau khi player đã đặt camera; được gỡ ở đầu frame sau
    if (G.camera) {
      if (shakeT > 0 && dt > 0) {
        shakeT -= dt;
        const k = clamp(shakeT / Math.max(shakeDur, 0.001), 0, 1);
        const a = shakeAmt * k * k;
        shakeOff.set(R(-1, 1) * a, R(-1, 1) * a * 0.8, R(-1, 1) * a);
        shakeRoll = R(-1, 1) * a * 0.03;
        G.camera.position.add(shakeOff);
        G.camera.rotation.z += shakeRoll;
        shakeApplied = true;
      } else if (shakeT <= 0) shakeAmt = 0;
    }
    updateOverlays(dt, t);
  }

  const _cam = new THREE.Vector3();
  function updateRain(dt, storm) {
    if (!rainMesh) return;
    const target = rainOn ? (storm ? 1 : 0.65) : 0;
    rainIntensity += (target - rainIntensity) * Math.min(1, dt * 1.5);
    if (rainIntensity < 0.01) { if (rainMesh.parent) rainMesh.parent.remove(rainMesh); return; }
    if (rainMesh.parent !== G.scene) G.scene.add(rainMesh);
    rainMesh.material.opacity = 0.45 * rainIntensity;
    _cam.copy(G.camera.position);
    rainMesh.position.set(_cam.x, _cam.y, _cam.z);
    const slant = storm ? 0.25 : 0.08;
    const activeN = Math.floor(RAIN_N * rainIntensity);
    rainMesh.geometry.setDrawRange(0, activeN * 2);
    for (let i = 0; i < activeN; i++) {
      const j = i * 6;
      const v = rainVel[i] * (storm ? 1.25 : 1) * dt;
      rainPos[j + 1] -= v; rainPos[j] += v * slant;
      if (rainPos[j + 1] < -RAIN_H * 0.4) {
        rainPos[j] = R(-RAIN_BOX, RAIN_BOX); rainPos[j + 1] = RAIN_H; rainPos[j + 2] = R(-RAIN_BOX, RAIN_BOX);
      }
      rainPos[j + 3] = rainPos[j] - slant * 0.7; rainPos[j + 4] = rainPos[j + 1] + 0.7; rainPos[j + 5] = rainPos[j + 2];
    }
    rainMesh.geometry.attributes.position.needsUpdate = true;
    // chấm bắn nước/đất quanh người chơi
    const center = (G.player && G.player.pos) || _cam;
    const n = Math.floor(14 * rainIntensity * (dt * 60));
    for (let i = 0; i < n; i++) {
      const x = center.x + R(-14, 14), z = center.z + R(-14, 14);
      const y = surfaceY(x, z);
      emit(pools.norm, { x, y: y + 0.03, z, vy: R(0.8, 1.6), life: 0.25, size: 0.07, sizeEnd: 0.02, color: 0xdbe8f5, alpha: 0.7, gravity: 8 });
    }
  }

  // ---------- Phản ứng sự kiện ----------
  const BIG_CATS = { khong_lo: 1, quai_vat: 1, dot_bien: 1 };
  function playerPos() {
    const p = G.player && (G.player.pos || (G.player.obj && G.player.obj.position));
    return p ? V(p) : (G.camera ? G.camera.position.clone() : new THREE.Vector3());
  }
  function onFishCaught(d) {
    const now = performance.now();
    if (now - lastCatchFx < 300) return;
    lastCatchFx = now;
    const ci = (d && d.catchInfo) || {};
    const pp = playerPos();
    confetti(pp.clone().add(new THREE.Vector3(0, 2, 0)));
    const sp = ci.species || (G.fish && G.fish.get && ci.id && G.fish.get(ci.id));
    const cat = sp && sp.category;
    if (ci.kind === 'fish' && cat && BIG_CATS[cat]) {
      // pháo hoa + nổ "bùm bùm" quanh
      const facing = (G.player && G.player.facing) || 0;
      fireworks(pp.clone().add(new THREE.Vector3(Math.sin(facing) * 12, 0, Math.cos(facing) * 12)));
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        later(0.5 + i * R(0.35, 0.6), () => {
          let best = null;
          for (let tries = 0; tries < 8; tries++) {
            const a = R(0, Math.PI * 2), r = R(10, 22);
            const x = pp.x + Math.cos(a) * r, z = pp.z + Math.sin(a) * r;
            const c = new THREE.Vector3(x, surfaceY(x, z), z);
            best = c;
            if (isWater(x, z)) break;
          }
          G.bus.emit('explosion', { pos: best, size: R(1.2, 2.2) });
        });
      }
      sfx('fanfare');
    } else if (ci.weight && ci.weight > 20) {
      fireworks(pp.clone().add(new THREE.Vector3(0, 0, 0)));
    }
  }

  G.fx = {
    init() {
      pools = { norm: makePool(2400, false, 0.15), add: makePool(1800, true, 0.0) };
      if (G.scene) {
        G.scene.add(pools.norm.pts); G.scene.add(pools.add.pts);
        // ánh chớp nổ: dùng ngân sách đèn của G.gfx (ưu tiên cao), không thêm PointLight cố định vào scene
        if (G.gfx && G.gfx.addLight) {
          flashLight = G.gfx.addLight({ color: 0xffaa55, intensity: 0, distance: 60, priority: 50, tag: 'fx' });
          flashLight.position = flashLight.pos;
        } else {
          flashLight = new THREE.PointLight(0xffaa55, 0, 60, 2);
          G.scene.add(flashLight);
        }
      }
      buildRain();
      buildOverlays();
      G.addUpdate(restoreCamera, -100);
      G.addUpdate(update, 60);
      if (G.bus) {
        G.bus.on('explosion', (d) => {
          d = d || {};
          if (G.state && G.state.stats) G.state.stats.explosions = (G.state.stats.explosions || 0) + 1;
          explosion(d.pos || playerPos(), d.size || 1);
        });
        G.bus.on('fish:caught', onFishCaught);
        G.bus.on('fight:end', (d) => {
          if (!d) return;
          if (d.result === 'line_broke') { shake(0.35, 0.35); screenFlash(0.25, '#ff4040'); }
        });
        G.bus.on('warden:caught', () => { shake(0.25, 0.3); screenFlash(0.3, '#ff3030'); });
        G.bus.on('env:changed', () => {
          // dọn hiệu ứng cũ khi đổi môi trường
          for (const P of [pools.norm, pools.add]) P.life.fill(0);
          rings.splice(0).forEach(freeRing);
          debris.length = 0; if (debrisMesh) debrisMesh.count = 0;
          ensureInScene();
        });
      }
    },
    splash, ripple, explosion, shake, sparkle, floatText, bubbles, rain, fireworks, confetti,
    flash: screenFlash, emit(o, additive) { if (pools) emit(additive ? pools.add : pools.norm, o); },
  };
})();
