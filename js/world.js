// world.js — Thế giới: địa hình, nước (shader sóng), bầu trời, ngày/đêm, thời tiết, 6 môi trường
(function () {
  'use strict';
  const G = window.G;
  const TAU = Math.PI * 2;
  const lerp = G.util.lerp;
  const clamp = G.util.clamp;
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  const W = (G.world = {
    current: null, zones: [], planeDeck: null, weather: 'clear', spawnFacing: 0,
    spawnLook: null, sunDir: null, ready: false,
  });

  // =====================================================================
  // Noise / RNG
  // =====================================================================
  let nSeed = 1;
  function hash2(ix, iz) {
    let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(nSeed, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  }
  function fbm(x, z, oct) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < (oct || 4); i++) { s += a * vnoise(x * f + i * 17.3, z * f - i * 9.1); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  }
  function ridged(x, z, oct) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < (oct || 4); i++) { const v = 1 - Math.abs(vnoise(x * f + i * 7.7, z * f + i * 3.3) * 2 - 1); s += a * v * v; n += a; a *= 0.5; f *= 2.1; }
    return s / n;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rng = Math.random;
  const rr = (a, b) => a + rng() * (b - a);

  // =====================================================================
  // Geometry helpers
  // =====================================================================
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

  // Biến đổi + tô màu đỉnh 1 geometry, trả geometry không index (để merge)
  function P(geo, color, pos, rot, scl) {
    let g = geo;
    if (geo.index) { g = geo.toNonIndexed(); geo.dispose(); }
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, (rot && rot[3]) || 'XYZ');
    _q.setFromEuler(_e);
    if (scl == null) _s.set(1, 1, 1);
    else if (typeof scl === 'number') _s.set(scl, scl, scl);
    else _s.set(scl[0], scl[1], scl[2]);
    _v.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
    _m4.compose(_v, _q, _s);
    g.applyMatrix4(_m4);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    _c.set(color === undefined ? 0xffffff : color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  }
  function merge(list) {
    let total = 0;
    for (const g of list) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let o = 0;
    for (const g of list) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      col.set(g.attributes.color.array, o * 3);
      uv.set(g.attributes.uv.array, o * 2);
      o += n;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    return out;
  }
  function vcMat(o) {
    // mức Thấp: Lambert (tính sáng theo đỉnh) rẻ hơn nhiều so với PBR theo pixel; áp dụng khi dựng map
    if (G.gfx && G.gfx.quality === 'low') {
      const p = Object.assign({}, o); delete p.roughness; delete p.metalness; delete p.flatShading; delete p.envMapIntensity;
      return new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true }, p));
    }
    return new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.85, metalness: 0 }, o || {}));
  }
  function meshOf(parts, mat, cast, recv) {
    const m = new THREE.Mesh(merge(parts), mat || vcMat());
    m.castShadow = cast !== false; m.receiveShadow = recv !== false;
    return m;
  }

  // Lắc lư theo gió cho thảm thực vật (inject vào shader chuẩn)
  const windT = { value: 0 }, windAmp = { value: 1 }, windDir = { value: new THREE.Vector2(1, 0.6) };
  function swayMat(mat, amt) {
    const amtU = { value: amt };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uWindT = windT; sh.uniforms.uSwayAmt = amtU; sh.uniforms.uWindAmp = windAmp; sh.uniforms.uWindDir = windDir;
      sh.vertexShader = 'uniform float uWindT;\nuniform float uSwayAmt;\nuniform float uWindAmp;\nuniform vec2 uWindDir;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 ipw = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        #else
          vec2 ipw = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        #endif
        float swh = max(position.y, 0.0);
        // cơn gió lướt qua theo không gian (sóng gió dài) + rung nhỏ riêng từng cây
        float gust = 0.55 + 0.45 * sin(dot(ipw, uWindDir) * 0.045 - uWindT * 1.3);
        float sw = (gust * (0.7 + 0.3 * sin(uWindT * 1.9 + ipw.x * 0.31 + ipw.y * 0.23)) + 0.3 * sin(uWindT * 3.7 + ipw.x * 0.7 + position.y)) * uSwayAmt * uWindAmp * swh * swh;
        transformed.x += sw * uWindDir.x; transformed.z += sw * uWindDir.y;`);
    };
    mat.customProgramCacheKey = () => 'sway_v2';
    return mat;
  }

  // =====================================================================
  // Đèn điểm qua ngân sách của G.gfx (đèn ảo → pool đèn thật gần camera); fallback: PointLight thật
  // =====================================================================
  let fallbackLights = 0;
  function addLight(parent, x, y, z, color, intensity, dist) {
    if (G.gfx && G.gfx.addLight) {
      const mk = new THREE.Object3D(); mk.position.set(x, y, z); parent.add(mk);
      return G.gfx.addLight({ obj: mk, color, intensity, distance: dist, tag: 'env' });
    }
    if (fallbackLights++ >= 3) return { intensity: 0 };   // không có gfx: giới hạn đèn thật
    const L = new THREE.PointLight(color, intensity, dist, 2); L.position.set(x, y, z); parent.add(L);
    return L;
  }
  // Mật độ thảm thực vật theo chất lượng đồ họa
  function dens(n) { const d = G.gfx && G.gfx.density ? clamp(G.gfx.density, 0.25, 1.6) : 1; return Math.max(1, Math.round(n * d)); }
  // Collider cho module vật lý (song song): an toàn nếu chưa có
  function colC(x, z, r, yMin, yMax) { if (G.physics && G.physics.addCircle) G.physics.addCircle({ x, z, r, tag: 'env', yMin, yMax }); }
  function colB(x, z, hw, hd, rot, yMin, yMax) { if (G.physics && G.physics.addBox) G.physics.addBox({ x, z, hw, hd, rot: rot || 0, tag: 'env', yMin, yMax }); }
  // Collider hộp cho vật thể con trong group đã xoay (lx,lz cục bộ)
  function colBLocal(gx, gz, grot, sc, lx, lz, hw, hd, yMin, yMax) {
    const c = Math.cos(grot), s = Math.sin(grot);
    colB(gx + (lx * c + lz * s) * sc, gz + (-lx * s + lz * c) * sc, hw * sc, hd * sc, grot, yMin, yMax);
  }

  // =====================================================================
  // Billboard gộp: nhiều quad quay mặt về camera trong 1 draw call (mây, sương, quầng đèn)
  // items: [{x,y,z,w,h,u0,v0,u1,v1}] — cập nhật vị trí bằng setPos(i,x,y,z)
  // =====================================================================
  const BB_VS = `
    attribute vec3 aCenter; attribute vec2 aCorner; attribute vec2 aSize;
    varying vec2 vUv;
    #include <fog_pars_vertex>
    void main() {
      vUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4(aCenter, 1.0);
      mvPosition.xy += aCorner * aSize;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;
  const BB_FS = `
    uniform sampler2D map; uniform vec3 color; uniform float opacity;
    varying vec2 vUv;
    #include <fog_pars_fragment>
    void main() {
      vec4 t = texture2D(map, vUv);
      t.rgb = t.rgb * (t.rgb * (t.rgb * 0.305306011 + 0.682171111) + 0.012522878); // sRGB → tuyến tính
      gl_FragColor = vec4(color * t.rgb, t.a * opacity);
      #include <encodings_fragment>
      #include <fog_fragment>
    }`;
  function billboards(tex, items, o) {
    o = o || {};
    const n = items.length;
    const cen = new Float32Array(n * 12), cor = new Float32Array(n * 8), siz = new Float32Array(n * 8), uv = new Float32Array(n * 8);
    const idx = [];
    const CX = [-0.5, 0.5, 0.5, -0.5], CY = [-0.5, -0.5, 0.5, 0.5];
    items.forEach((it, i) => {
      const u0 = it.u0 || 0, v0 = it.v0 || 0, u1 = it.u1 === undefined ? 1 : it.u1, v1 = it.v1 === undefined ? 1 : it.v1;
      for (let k = 0; k < 4; k++) {
        const j = i * 4 + k;
        cen[j * 3] = it.x; cen[j * 3 + 1] = it.y; cen[j * 3 + 2] = it.z;
        cor[j * 2] = CX[k]; cor[j * 2 + 1] = CY[k];
        siz[j * 2] = it.w; siz[j * 2 + 1] = it.h;
        uv[j * 2] = CX[k] < 0 ? u0 : u1; uv[j * 2 + 1] = CY[k] < 0 ? v0 : v1;
      }
      const a = i * 4; idx.push(a, a + 1, a + 2, a, a + 2, a + 3);
    });
    const geo = new THREE.BufferGeometry();
    const cA = new THREE.BufferAttribute(cen, 3); if (o.dynamic) cA.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', cA); // dùng cho bounding sphere
    geo.setAttribute('aCenter', cA);
    geo.setAttribute('aCorner', new THREE.BufferAttribute(cor, 2));
    geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 2));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const uni = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
      map: { value: tex }, color: { value: new THREE.Color(o.color !== undefined ? o.color : 0xffffff) }, opacity: { value: o.opacity !== undefined ? o.opacity : 1 },
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: uni, vertexShader: BB_VS, fragmentShader: BB_FS, transparent: true, depthWrite: false,
      fog: !!o.fog, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = o.renderOrder || 0;
    m.userData.setPos = (i, x, y, z) => { for (let k = 0; k < 4; k++) { const j = (i * 4 + k) * 3; cen[j] = x; cen[j + 1] = y; cen[j + 2] = z; } };
    m.userData.commit = () => { cA.needsUpdate = true; };
    m.userData.setOpacity = (v) => { uni.opacity.value = v; };
    m.userData.color = uni.color.value;
    if (o.toneMapped === false) mat.toneMapped = false;
    return m;
  }

  // =====================================================================
  // Canvas textures
  // =====================================================================
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function texOf(c) { const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; t.needsUpdate = true; return t; }
  function glowTex() {
    const c = makeCanvas(64, 64); const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.75)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return texOf(c);
  }
  function cloudTex(seed) {
    const r = mulberry32(seed);
    const c = makeCanvas(256, 128); const x = c.getContext('2d');
    for (let i = 0; i < 22; i++) {
      const cx = 40 + r() * 176, cy = 50 + r() * 40 - Math.abs(cx - 128) * 0.12, rad = 18 + r() * 34;
      const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const sh = Math.floor(225 + r() * 30);
      gr.addColorStop(0, `rgba(${sh},${sh},${sh},0.55)`); gr.addColorStop(0.6, `rgba(${sh},${sh},${sh},0.25)`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, rad, 0, TAU); x.fill();
    }
    return texOf(c);
  }
  function signTex(lines, bg, fg, w, h) {
    const c = makeCanvas(w, h); const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.strokeStyle = fg; x.lineWidth = Math.max(6, h * 0.05); x.strokeRect(10, 10, w - 20, h - 20);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((ln, i) => {
      let size = i === 0 ? Math.floor(h * (n > 1 ? 0.36 : 0.52)) : Math.floor(h * 0.19);
      const set = () => { x.font = G.util.font(i === 0 ? 800 : 600, size, i === 0); };
      set();
      while (x.measureText(ln).width > w * 0.88 && size > 10) { size -= 2; set(); }
      const y = n > 1 ? (i === 0 ? h * 0.4 : h * 0.76) : h * 0.53;
      x.fillText(ln, w / 2, y);
    });
    return texOf(c);
  }
  // Biển hiệu: gốc tại mặt đất, mặt chữ hướng +Z
  function makeSign(lines, o) {
    o = o || {};
    const w = o.w || 2, h = o.h || 0.7, post = o.post === undefined ? 1.2 : o.post;
    const tex = signTex(lines, o.bg || '#fff3d6', o.fg || '#8a1c12', 512, Math.max(96, Math.round(512 * h / w)));
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.22, roughness: 0.8 });
    const grp = new THREE.Group();
    const geo = new THREE.PlaneGeometry(w, h);
    const yc = post + h / 2;
    const f = new THREE.Mesh(geo, mat); f.position.set(0, yc, 0.035);
    const b = new THREE.Mesh(geo, mat); b.position.set(0, yc, -0.035); b.rotation.y = Math.PI;
    const parts = [P(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.06), 0x4a3020, [0, yc, 0])];
    if (post > 0) for (const sx of [-w * 0.42, w * 0.42]) parts.push(P(new THREE.CylinderGeometry(0.05, 0.06, post + h, 6), 0x4a3020, [sx, (post + h) / 2, -0.06]));
    grp.add(meshOf(parts), f, b);
    return grp;
  }

  // =====================================================================
  // Env state
  // =====================================================================
  const GN = 161, GS = 2.5, GMIN = -200;     // lưới độ cao CPU (khớp đỉnh lưới mesh trong ±200)
  let envId = null, spec = null, envRoot = null;
  let grid = null, hFn = (x, z) => -50, mods = [];
  let depthBytes = null, depthTex = null, gRange = [-10, 4];
  let platforms = [];
  const spawn = new THREE.Vector3(), spawnLook = new THREE.Vector3(), campPos = new THREE.Vector3();
  let idir = { x: 0, z: 1 };                 // hướng từ nước vào đất ở chỗ spawn
  let spots = [], exclusions = [];
  let bounds = { minX: -190, maxX: 190, minZ: -190, maxZ: 190 };
  let envUpd = [], floaters = [], nightMats = [], nightLights = [], nightSprites = [], dayObjs = [], glowMeshes = [];
  let waterMesh = null, waterU = null;
  let waveDirs = [[1, 0, 20, 1], [0, 1, 12, 0.6], [0.7, 0.7, 8, 0.35], [-0.6, 0.8, 5, 0.2]];
  let waveAmp = 0.05, waveT = 0, offX = 0, offZ = 0;
  let plane = null;
  let shoreThr = 0.6;
  let windA = 0.6, windBase = 2;

  // ---- weather / sky state ----
  let sky = null, skyU = null, sun = null, hemi = null;
  const wb = { rain: 0, storm: 0, fog: 0 };
  let weatherTarget = 'clear', nextWeatherAt = 0;
  let flash = 0, lightningT = 6, thunderT = -1;
  let lastNight = null;
  let dayK = 1, nightK = 0, lightLevel = 1, cloudK = 0;
  const sunDir = new THREE.Vector3(0, 1, 0), moonDir = new THREE.Vector3(0, -1, 0);
  W.sunDir = sunDir;

  // =====================================================================
  // Terrain sampling (CPU)
  // =====================================================================
  function hFinal(x, z) {
    let h = hFn(x, z);
    for (let i = 0; i < mods.length; i++) h = mods[i](x, z, h);
    return h;
  }
  function terrainH(x, z) {
    if (!grid) return -50;
    const fx = (x - GMIN) / GS, fz = (z - GMIN) / GS;
    if (fx < 0 || fz < 0 || fx > GN - 1 || fz > GN - 1) return hFinal(x, z);
    const ix = Math.min(Math.floor(fx), GN - 2), iz = Math.min(Math.floor(fz), GN - 2);
    const tx = fx - ix, tz = fz - iz;
    const i0 = iz * GN + ix;
    const a = grid[i0], b = grid[i0 + 1], c = grid[i0 + GN], d = grid[i0 + GN + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
  function normalY(x, z) {
    const e = 1.5;
    const gx = (terrainH(x + e, z) - terrainH(x - e, z)) / (2 * e);
    const gz = (terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e);
    return 1 / Math.sqrt(1 + gx * gx + gz * gz);
  }
  // Mẫu "đáy" đã lượng tử hóa giống hệt texture GPU (để sóng CPU khớp shader)
  function texGround(x, z) {
    if (!depthBytes) return -50;
    let fx = (x - GMIN) / GS, fz = (z - GMIN) / GS;
    fx = clamp(fx, 0, GN - 1); fz = clamp(fz, 0, GN - 1);
    const ix = Math.min(Math.floor(fx), GN - 2), iz = Math.min(Math.floor(fz), GN - 2);
    const tx = fx - ix, tz = fz - iz;
    const i0 = (iz * GN + ix) * 4;
    const a = depthBytes[i0], b = depthBytes[i0 + 4], c = depthBytes[i0 + GN * 4], d = depthBytes[i0 + GN * 4 + 4];
    const v = ((a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz) / 255;
    return lerp(gRange[0], gRange[1], v);
  }
  function onPlatform(x, z) {
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      const dx = x - p.x, dz = z - p.z;
      const lz = dx * p.s + dz * p.c, lx = dx * p.c - dz * p.s;
      if (Math.abs(lx) <= p.hw && Math.abs(lz) <= p.hl) return p;
    }
    return null;
  }
  function addPlatform(x, z, rot, hw, hl, y) { platforms.push({ x, z, s: Math.sin(rot), c: Math.cos(rot), hw, hl, y }); }
  function onDeck(x, z) { return !!plane && Math.abs(x) <= 3.0 && z >= -14 && z <= 18.3; }
  function deckY() { return plane ? plane.position.y - 2.0 : 118; }

  // =====================================================================
  // Waves (CPU = GPU)
  // =====================================================================
  function wv(w, px, pz) {
    const k = TAU / w[2];
    const om = Math.sqrt(9.8 * k);
    const th = k * (w[0] * px + w[1] * pz) - om * waveT;
    const s = Math.max((Math.sin(th) + 1) * 0.5, 0);
    return w[3] * (2 * Math.pow(s, 1.6) - 1);
  }
  function wavesAt(x, z) {
    const px = x + offX, pz = z + offZ;
    return waveAmp * (wv(waveDirs[0], px, pz) + wv(waveDirs[1], px, pz) + wv(waveDirs[2], px, pz) + wv(waveDirs[3], px, pz));
  }
  function totalHours() { return ((G.state.day || 1) - 1) * 24 + (G.state.time || 0); }
  function tideVal() { return Math.sin(TAU * totalHours() / 12.4); }
  function waterLevel() { return (W.current ? W.current.tideAmp : 0) * tideVal(); }

  // =====================================================================
  // Public API
  // =====================================================================
  W.groundHeight = function (x, z) {
    if (plane && onDeck(x, z)) return deckY();
    const h = terrainH(x, z);
    if (platforms.length) { const p = onPlatform(x, z); if (p && p.y > h) return p.y; }
    return h;
  };
  W.getWaterLevel = waterLevel;
  W.getWaterHeight = function (x, z) {
    const at = 0.35 + 0.65 * ss(0, 4, -texGround(x, z));
    return waterLevel() + wavesAt(x, z) * at;
  };
  W.isWater = function (x, z) {
    if (plane) return !onDeck(x, z);
    if (platforms.length && onPlatform(x, z)) return false;
    return terrainH(x, z) < waterLevel();
  };
  W.getDepth = function (x, z) {
    if (plane && onDeck(x, z)) return 0;
    if (platforms.length && onPlatform(x, z)) return 0;
    return Math.max(0, waterLevel() - terrainH(x, z));
  };
  W.getSpawn = function () { const v = spawn.clone(); v.y = W.groundHeight(v.x, v.z); return v; };
  W.getNPCSpots = function () {
    return spots.map((s) => {
      const pos = s.pos.clone(); pos.y = W.groundHeight(pos.x, pos.z);
      return { pos, role: s.role, lookAt: s.lookAt.clone(), facing: s.facing };
    });
  };
  W.isManagedZone = function (x, z) {
    for (const zn of W.zones) { const dx = x - zn.x, dz = z - zn.z; if (dx * dx + dz * dz <= zn.r * zn.r) return zn; }
    return null;
  };
  W.getBounds = function () { return Object.assign({}, bounds); };
  W.isNight = function () { return sunDir.y < 0; };
  function windInto(out) {
    const sp = windBase * (1 + 0.6 * wb.rain + 2.2 * wb.storm) * (0.8 + 0.2 * Math.sin(waveT * 0.05));
    const a = windA + 0.35 * Math.sin(waveT * 0.013);
    out.x = Math.cos(a) * sp; out.z = Math.sin(a) * sp; out.speed = sp;
    return out;
  }
  W.getWind = function () { return windInto({ x: 0, z: 0, speed: 0 }); };
  W.getConditions = function (x, z) {
    const env = W.current || G.data.ENVS[0];
    const T = totalHours();
    const tide = Math.sin(TAU * T / 12.4), dtide = Math.cos(TAU * T / 12.4);
    const tideLabel = tide > 0.75 ? 'Nước lớn' : tide < -0.75 ? 'Nước ròng' : dtide > 0 ? 'Triều lên' : 'Triều xuống';
    const hasPt = typeof x === 'number' && typeof z === 'number';
    const depth = hasPt ? W.getDepth(x, z) : 0;
    const time = G.state.time;
    let temp = env.baseTemp + 1.6 * Math.sin(TAU * (time - 9) / 24);
    temp -= Math.min(depth, 60) * (env.id === 'mountain' ? 0.14 : 0.07);
    temp -= 0.8 * wb.rain + 1.8 * wb.storm + 0.4 * wb.fog;
    const wind = W.getWind();
    return {
      time, day: G.state.day, isNight: sunDir.y < 0, light: lightLevel,
      tide, tideLabel, waterTemp: Math.round(temp * 10) / 10,
      weather: W.weather, waveHeight: Math.round(waveAmp * 3.2 * 100) / 100,
      env: env.id, waterBody: env.waterBody, wind: { x: wind.x, z: wind.z }, windSpeed: wind.speed,
      depth, waterLevel: waterLevel(),
    };
  };
  const WEATHER_NAMES = { clear: 'Nắng đẹp', rain: 'Mưa', storm: 'Bão giông', fog: 'Sương mù' };
  W.setWeather = function (w) {
    if (!WEATHER_NAMES[w]) return;
    weatherTarget = w; W.weather = w;
    nextWeatherAt = totalHours() + 3 + Math.random() * 4;
    G.bus.emit('weather:changed', { weather: w, name: WEATHER_NAMES[w] });
  };
  const WX = {
    forest: { clear: 5, rain: 3, storm: 1, fog: 2 }, plains: { clear: 6, rain: 3, storm: 1.2, fog: 1 },
    mountain: { clear: 4, rain: 2, storm: 1, fog: 3 }, city: { clear: 6, rain: 3, storm: 1, fog: 1.5 },
    island: { clear: 6, rain: 2, storm: 2, fog: 0.7 }, airplane: { clear: 6, rain: 2, storm: 1.5, fog: 1 },
  };
  function randomWeather() {
    const t = WX[envId] || WX.forest;
    return G.util.weightedPick(Object.keys(t).map((k) => ({ w: t[k], k }))).k;
  }

  // =====================================================================
  // Sky dome
  // =====================================================================
  const SKY_VS = `
    varying vec3 vDir;
    void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const SKY_FS = `
    uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uBot; uniform vec3 uSunDir; uniform vec3 uMoonDir;
    uniform vec3 uSunCol; uniform vec3 uGlow;
    uniform float uStars; uniform float uTime; uniform float uSunVis; uniform float uMoonVis; uniform float uSunset;
    uniform float uFlash; uniform float uCloud;
    varying vec3 vDir;
    float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    void main() {
      vec3 d = normalize(vDir);
      float y = d.y;
      // hoàng hôn: dải ấm ôm sát chân trời, đậm hơn phía mặt trời; đỉnh trời giữ xanh/tím
      float sAz = 0.5 + 0.5 * dot(normalize(d.xz + 1e-4), normalize(uSunDir.xz + 1e-4));
      vec3 hor = mix(uHor, mix(uTop, uHor, 0.55 + 0.45 * sAz), uSunset * 0.6);
      vec3 col = mix(hor, uTop, pow(smoothstep(0.0, 1.0, max(y, 0.0)), mix(0.55, 0.38, uSunset)));
      col = mix(col, uBot, smoothstep(0.0, -0.22, y));
      float sd = max(dot(d, uSunDir), 0.0);
      col += uGlow * pow(sd, 5.0) * uSunset * (1.0 - smoothstep(-0.1, 0.55, y));
      // khí quyển: chân trời phía mặt trời sáng/ấm hơn một chút (tán xạ Mie giả)
      col += uSunCol * pow(sd, 6.0) * 0.12 * uSunVis * (1.0 - smoothstep(0.0, 0.6, y)) * (1.0 - uCloud);
      col += uSunCol * pow(sd, 48.0) * 0.4 * uSunVis;
      col += uSunCol * smoothstep(0.99935, 0.99965, sd) * 9.0 * uSunVis * (1.0 - uCloud * 0.92);
      float md = max(dot(d, uMoonDir), 0.0);
      float disc = smoothstep(0.99935, 0.99955, md);
      vec3 mc = vec3(0.86, 0.9, 1.0) * (0.75 + 0.25 * fract(sin(dot(floor(d.xz * 900.0), vec2(12.9898, 78.233))) * 43758.5453));
      col += mc * disc * 1.3 * uMoonVis * (1.0 - uCloud * 0.9);
      col += vec3(0.45, 0.55, 0.8) * pow(md, 220.0) * 0.3 * uMoonVis;
      if (uStars > 0.01 && y > 0.0) {
        vec3 sp = d * 230.0;
        vec3 cell = floor(sp);
        float r = h3(cell);
        if (r > 0.982) {
          vec3 f = fract(sp) - 0.5;
          float s = 1.0 - smoothstep(0.0, 0.1 + 0.16 * fract(r * 37.0), length(f));
          float tw = 0.55 + 0.45 * sin(uTime * (1.5 + r * 5.0) + r * 100.0);
          vec3 sc = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), fract(r * 91.0));
          col += sc * s * tw * uStars * smoothstep(0.0, 0.2, y) * (1.0 - uCloud);
        }
      }
      // dải ngân hà rất nhẹ
      if (uStars > 0.01 && y > 0.0) {
        float mw = exp(-pow(dot(d, normalize(vec3(0.35, 0.25, 0.9))) * 5.0, 2.0));
        float mn = h3(floor(d * 90.0)) * 0.5 + h3(floor(d * 37.0)) * 0.5;
        col += vec3(0.55, 0.6, 0.8) * mw * (0.4 + 0.6 * mn) * 0.035 * uStars * (1.0 - uCloud) * smoothstep(0.05, 0.4, y);
      }
      col += uFlash * vec3(0.75, 0.8, 1.0);
      // dither chống banding của gradient trời
      col *= 1.0 + (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.012;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
      #include <encodings_fragment>
    }`;
  function initSky() {
    skyU = {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBot: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uSunCol: { value: new THREE.Color(1, 0.9, 0.7) }, uGlow: { value: new THREE.Color(1, 0.4, 0.1) },
      uStars: { value: 0 }, uTime: { value: 0 }, uSunVis: { value: 1 }, uMoonVis: { value: 0 },
      uSunset: { value: 0 }, uFlash: { value: 0 }, uCloud: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false });
    mat.toneMapped = false;
    sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 40, 20), mat);
    // vẽ SAU vật đục + depth test: chỉ tô pixel trời thật sự nhìn thấy (trước đây tô cả màn hình rồi bị đè)
    sky.renderOrder = 1e6; sky.frustumCulled = false;
    sky.onBeforeRender = (r, s, cam) => { sky.position.copy(cam.position); sky.updateMatrixWorld(); };
    G.scene.add(sky);
  }

  // =====================================================================
  // Water shader
  // =====================================================================
  const WATER_VS = `
    uniform float uTime; uniform float uAmp; uniform float uLevel; uniform vec2 uOffset;
    uniform vec4 uW0; uniform vec4 uW1; uniform vec4 uW2; uniform vec4 uW3;
    uniform sampler2D uDepthTex; uniform vec3 uGrid; uniform vec2 uGRange;
    varying vec3 vWorld; varying vec3 vNrm; varying float vCrest; varying float vGround;
    #include <fog_pars_vertex>
    float wv(vec4 w, vec2 p) {
      float k = 6.2831853 / w.z;
      float om = sqrt(9.8 * k);
      float th = k * dot(w.xy, p) - om * uTime;
      float s = max((sin(th) + 1.0) * 0.5, 0.0);
      return w.w * (2.0 * pow(s, 1.6) - 1.0);
    }
    float waves(vec2 p) { p += uOffset; return uAmp * (wv(uW0, p) + wv(uW1, p) + wv(uW2, p) + wv(uW3, p)); }
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vec2 tuv = (wp.xz - uGrid.xy) / uGrid.z;
      float g = mix(uGRange.x, uGRange.y, texture2D(uDepthTex, tuv).r);
      float at = 0.35 + 0.65 * smoothstep(0.0, 4.0, -g);
      float h = waves(wp.xz) * at;
      float e = 0.5;
      float hx = waves(wp.xz + vec2(e, 0.0)) * at;
      float hz = waves(wp.xz + vec2(0.0, e)) * at;
      wp.y = uLevel + h;
      vNrm = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));
      vCrest = h / max(uAmp * 1.6, 0.0001);
      vGround = g;
      vWorld = wp.xyz;
      vec4 mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;
  // Hoa văn ánh nắng khúc xạ (caustic) — dùng chung cho đáy nước (terrain) và mặt nước nông
  const CAUSTIC_GLSL = `
    float causticAt(vec2 w, float t) {
      vec2 p = mod(w * 0.55, 6.2831853) - 250.0;
      vec2 i = p; float c = 1.0;
      for (int n = 0; n < 3; n++) {
        float tt = t * (1.0 - (3.5 / float(n + 1)));
        i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
        c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
      }
      c /= 3.0;
      c = 1.17 - pow(c, 1.4);
      return clamp(pow(abs(c), 8.0), 0.0, 1.0);
    }`;
  const WATER_FS = `
    uniform float uTime; uniform float uAmp; uniform vec2 uOffset;
    uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uSkyTop; uniform vec3 uSkyHor;
    uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunInt;
    uniform vec3 uMoonDir; uniform float uMoonInt; uniform vec3 uGlow; uniform float uSunset;
    uniform float uClarity; uniform float uLight; uniform float uDetail; uniform float uFlash; uniform float uFoamAmt;
    varying vec3 vWorld; varying vec3 vNrm; varying float vCrest; varying float vGround;
    #include <fog_pars_fragment>
    float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), u.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    ${CAUSTIC_GLSL}
    vec2 ripples(vec2 p, float t) {
      vec2 g = vec2(0.0);
      for (int i = 0; i < 7; i++) {
        float fi = float(i);
        float a = fi * 2.39996 + 0.4;
        vec2 d = vec2(cos(a), sin(a));
        float k = 0.9 + fi * 0.85;
        float w = sqrt(9.8 * k);
        float A = 0.05 / (1.0 + fi * 0.6);
        float th = k * dot(d, p) - w * t + fi * 1.7;
        g += d * (A * k * cos(th));
      }
      vec2 q = p * 1.7 + vec2(t * 0.4);
      float n1 = vn(q); float n2 = vn(q + vec2(0.37, 0.0)); float n3 = vn(q + vec2(0.0, 0.37));
      g += vec2(n2 - n1, n3 - n1) * 0.35;
      return g;
    }
    void main() {
      vec3 toCam = cameraPosition - vWorld;
      float dist = length(toCam);
      vec3 V = toCam / max(dist, 0.001);
      vec2 p = vWorld.xz + uOffset;
      float farK = smoothstep(30.0, 400.0, dist);
      vec2 rg = ripples(p, uTime) * uDetail * (1.0 - farK * 0.85);
      vec3 N = normalize(vNrm + vec3(-rg.x, 0.0, -rg.y));
      float depth = max(vWorld.y - vGround, 0.0);
      float ndv = clamp(dot(N, V), 0.0, 1.0);
      float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
      vec3 R = reflect(-V, N);
      R.y = abs(R.y);
      // phản chiếu trời: gradient + quầng hoàng hôn phía mặt trời (khớp shader bầu trời)
      vec3 skyc = mix(uSkyHor, uSkyTop, pow(clamp(R.y, 0.0, 1.0), 0.6));
      float rs = max(dot(R, uSunDir), 0.0);
      skyc += uGlow * pow(rs, 5.0) * uSunset * (1.0 - smoothstep(-0.1, 0.55, R.y));
      // màu thân nước theo độ sâu + tán xạ dưới mặt sóng khi nhìn ngược nắng
      float dd = 1.0 - exp(-depth * uClarity);
      vec3 body = mix(uShallow, uDeep, dd) * uLight;
      body += uShallow * 0.2 * max(vCrest, 0.0) * uLight;
      float sss = pow(max(dot(V, -vec3(uSunDir.x, 0.0, uSunDir.z)), 0.0), 3.0) * max(vCrest + 0.3, 0.0);
      body += uShallow * sss * 0.45 * uSunInt * uLight * (1.0 - dd * 0.6);
      // lấp lánh caustic ở chỗ nông, gần người xem
      float cm = (1.0 - smoothstep(0.15, 2.6, depth)) * (1.0 - smoothstep(15.0, 70.0, dist));
      if (cm > 0.01) body += uSunCol * causticAt(p + rg * 0.6, uTime * 0.55) * cm * 0.35 * uSunInt;
      vec3 col = mix(body, skyc, clamp(fres, 0.0, 1.0));
      float rm = max(dot(R, uMoonDir), 0.0);
      col += vec3(0.75, 0.82, 1.0) * (pow(rm, 500.0) * 3.0 + pow(rm, 30.0) * 0.08) * uMoonInt;
      col += uSunCol * pow(rs, 40.0) * 0.25 * uSunInt;
      // bọt: mép bờ (dải sóng vỗ) + đỉnh sóng
      float fn = vn(p * 0.8 + vec2(uTime * 0.13, uTime * 0.09)) * 0.6 + vn(p * 2.9 - vec2(uTime * 0.2)) * 0.4;
      float shore = 1.0 - smoothstep(0.0, 0.35 + uAmp * 1.8, depth);
      float band = 0.5 + 0.5 * sin(depth * 9.0 - uTime * 1.6 + fn * 3.0);
      float shoreFoam = shore * smoothstep(0.45, 0.75, fn * 0.7 + band * 0.45 + shore * 0.25);
      float crest = smoothstep(0.55, 1.05, vCrest) * smoothstep(0.35, 0.75, fn) * uFoamAmt;
      float foam = clamp(max(shoreFoam, crest), 0.0, 1.0);
      col = mix(col, vec3(0.92, 0.95, 0.97) * (0.12 + 0.88 * uLight), foam * 0.85);
      col += vec3(0.6, 0.65, 0.8) * uFlash * 0.4;
      // ánh mặt trời: mũi nhọn gần, loe rộng ở xa (bớt răng cưa); cộng SAU tone-map → HDR cho bloom
      float sp = pow(rs, mix(700.0, 140.0, farK));
      vec3 spec = uSunCol * sp * mix(9.0, 3.5, farK) * uSunInt * (1.0 - foam);
      float alpha = mix(0.42, 0.95, smoothstep(0.0, 2.2, depth));
      alpha = max(alpha, max(foam * 0.9, fres));
      alpha = max(alpha, clamp(sp * uSunInt * 2.0, 0.0, 1.0));
      gl_FragColor = vec4(col, alpha);
      #include <tonemapping_fragment>
      gl_FragColor.rgb += spec;
      #include <encodings_fragment>
      #include <fog_fragment>
    }`;
  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();

  function buildWater(wc, ext) {
    // Lưới không đều: dày quanh tâm (2.7m), thưa dần ra chân trời
    const S = 220, N1 = S + 1;
    const K = (ext - 300) / 0.04;
    const mapW = (u) => { const a = Math.abs(u); if (a <= 0.8) return 300 * u; const b = a - 0.8; return Math.sign(u) * (240 + 300 * b + K * b * b); };
    const pos = new Float32Array(N1 * N1 * 3);
    for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) {
      const k = (j * N1 + i) * 3;
      pos[k] = mapW(-1 + 2 * i / S); pos[k + 1] = 0; pos[k + 2] = mapW(-1 + 2 * j / S);
    }
    const idx = [];
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const a = j * N1 + i, b = a + 1, c = a + N1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), ext * 1.5);

    // texture đáy (8-bit)
    depthBytes = new Uint8Array(GN * GN * 4);
    for (let i = 0; i < GN * GN; i++) {
      const g = grid[i];
      const v = Math.round(clamp((g - gRange[0]) / (gRange[1] - gRange[0]), 0, 1) * 255);
      depthBytes[i * 4] = v; depthBytes[i * 4 + 1] = v; depthBytes[i * 4 + 2] = v; depthBytes[i * 4 + 3] = 255;
    }
    depthTex = new THREE.DataTexture(depthBytes, GN, GN, THREE.RGBAFormat);
    depthTex.magFilter = THREE.LinearFilter; depthTex.minFilter = THREE.LinearFilter;
    depthTex.generateMipmaps = false; depthTex.wrapS = depthTex.wrapT = THREE.ClampToEdgeWrapping;
    depthTex.needsUpdate = true;

    const wd = waveDirs;
    waterU = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
      uTime: { value: 0 }, uAmp: { value: waveAmp }, uLevel: { value: 0 }, uOffset: { value: new THREE.Vector2() },
      uW0: { value: new THREE.Vector4().fromArray(wd[0]) }, uW1: { value: new THREE.Vector4().fromArray(wd[1]) },
      uW2: { value: new THREE.Vector4().fromArray(wd[2]) }, uW3: { value: new THREE.Vector4().fromArray(wd[3]) },
      uDepthTex: { value: depthTex }, uGrid: { value: new THREE.Vector3(GMIN - GS / 2, GMIN - GS / 2, GN * GS) },
      uGRange: { value: new THREE.Vector2(gRange[0], gRange[1]) },
      uShallow: { value: lin(wc.shallow) }, uDeep: { value: lin(wc.deep) },
      uSkyTop: { value: new THREE.Color() }, uSkyHor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uSunInt: { value: 1 },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) }, uMoonInt: { value: 0 }, uGlow: { value: new THREE.Color() }, uSunset: { value: 0 },
      uClarity: { value: wc.clarity }, uLight: { value: 1 }, uDetail: { value: 0.8 }, uFlash: { value: 0 }, uFoamAmt: { value: 0 },
    });
    const mat = new THREE.ShaderMaterial({ uniforms: waterU, vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, fog: true, depthWrite: true });
    waterMesh = new THREE.Mesh(geo, mat);
    waterMesh.frustumCulled = false;
    waterMesh.renderOrder = 1;
    waterMesh.name = 'water';
    envRoot.add(waterMesh);
  }

  // =====================================================================
  // Terrain mesh
  // =====================================================================
  function hx(hex) { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }
  function mixIn(out, c, t) { if (t <= 0) return; out[0] += (c[0] - out[0]) * t; out[1] += (c[1] - out[1]) * t; out[2] += (c[2] - out[2]) * t; }
  function makePal(o) {
    const p = {};
    for (const k in o) p[k] = typeof o[k] === 'number' && o[k] > 255 ? hx(o[k]) : o[k];
    p.g0 = hx(o.grass[0]); p.g1 = hx(o.grass[1]);
    return p;
  }
  function terrainColor(x, z, h, ny, pal, out) {
    const n1 = vnoise(x * 0.06 + 11, z * 0.06 - 7), n2 = vnoise(x * 0.4, z * 0.4);
    out[0] = pal.g0[0]; out[1] = pal.g0[1]; out[2] = pal.g0[2];
    mixIn(out, pal.g1, n1);
    mixIn(out, pal.dirt, ss(0.6, 0.82, vnoise(x * 0.03 + 50, z * 0.03)) * 0.65);
    mixIn(out, pal.sand, 1 - ss(pal.sandTop - 0.4, pal.sandTop + 0.6, h + (n2 - 0.5) * 0.6));
    mixIn(out, pal.under, ss(-0.4, -2.8, h));
    mixIn(out, pal.rock, ss(0.86, 0.66, ny));
    if (pal.snowH) mixIn(out, pal.snow, ss(pal.snowH - 3, pal.snowH + 3, h + (n1 - 0.5) * 12) * ss(0.45, 0.7, ny));
    if (pal.extra) pal.extra(x, z, h, ny, out);
    const b = 0.86 + 0.28 * n2;
    out[0] *= b; out[1] *= b; out[2] *= b;
  }
  function mapT(u) { const a = Math.abs(u); if (a <= 0.8) return 250 * u; const b = a - 0.8; return Math.sign(u) * (200 + 250 * b + 43750 * b * b); }
  // Vật liệu địa hình: vân chi tiết gần camera, dải cát ướt sẫm + bóng ở mép nước (theo thủy triều),
  // caustic lung linh trên đáy nông.
  const terrU = { uLevel: { value: 0 }, uTime: { value: 0 }, uCaus: { value: 0 } };
  function terrainMat() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, terrU);
      sh.vertexShader = `varying vec3 vTWorld;
` + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vTWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      sh.fragmentShader = `uniform float uLevel;
uniform float uTime;
uniform float uCaus;
varying vec3 vTWorld;
` + CAUSTIC_GLSL + `
        float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
      ` + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float tDist = length(vTWorld - cameraPosition);
          float tNear = 1.0 - smoothstep(30.0, 110.0, tDist);
          float tn = tNoise(vTWorld.xz * 0.45) * 0.55 + tNoise(vTWorld.xz * 2.1) * 0.45;
          diffuseColor.rgb *= mix(1.0, 0.84 + 0.32 * tn, tNear);
          float tAbove = vTWorld.y - uLevel;
          float tWet = (1.0 - smoothstep(0.05, 0.75, tAbove)) * smoothstep(-0.9, -0.1, tAbove);
          diffuseColor.rgb *= 1.0 - 0.38 * tWet;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.32, tWet);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          if (uCaus > 0.001 && tAbove < -0.05) {
            float cd = -tAbove;
            float ck = smoothstep(0.05, 0.5, cd) * (1.0 - smoothstep(1.5, 7.0, cd)) * (1.0 - smoothstep(20.0, 80.0, tDist));
            if (ck > 0.001) totalEmissiveRadiance += diffuseColor.rgb * causticAt(vTWorld.xz, uTime * 0.55) * ck * uCaus;
          }`);
    };
    mat.customProgramCacheKey = () => 'terrain_v1';
    return mat;
  }
  function buildTerrainMesh(pal) {
    const S = 200, N1 = S + 1;
    const pos = new Float32Array(N1 * N1 * 3);
    for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) {
      const x = mapT(-1 + 2 * i / S), z = mapT(-1 + 2 * j / S);
      const k = (j * N1 + i) * 3;
      pos[k] = x; pos[k + 1] = terrainH(x, z); pos[k + 2] = z;
    }
    const idx = [];
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const a = j * N1 + i, b = a + 1, c = a + N1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const nor = geo.attributes.normal.array;
    const col = new Float32Array(N1 * N1 * 3); const out = [0, 0, 0];
    for (let v = 0; v < N1 * N1; v++) {
      terrainColor(pos[v * 3], pos[v * 3 + 2], pos[v * 3 + 1], nor[v * 3 + 1], pal, out);
      col[v * 3] = out[0]; col[v * 3 + 1] = out[1]; col[v * 3 + 2] = out[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, terrainMat());
    m.receiveShadow = true; m.name = 'terrain';
    envRoot.add(m);
    return m;
  }

  // Khoét lòng hồ/sông: union (min) với địa hình hiện tại
  function carve(h, d, R, depth, bank) {
    if (d > R + bank) return h;
    const t = Math.min(d / R, 1);
    const bottom = -0.35 - (depth - 0.35) * Math.pow(Math.max(1 - t * t, 0), 0.75);
    const k = ss(R * 0.82, R + bank, d);
    return Math.min(h, lerp(bottom, Math.max(h, 0.8), k));
  }

  // =====================================================================
  // Vegetation / props geometry (vertex-colored, merged → InstancedMesh)
  // =====================================================================
  function geoBroadleaf(tint) {
    const g = tint || [0x2f6a25, 0x3a7a2c, 0x2a5e22];
    return merge([
      P(new THREE.CylinderGeometry(0.16, 0.3, 3.4, 6), 0x5a3d26, [0, 1.7, 0]),
      P(new THREE.CylinderGeometry(0.06, 0.1, 1.6, 4), 0x5a3d26, [0.5, 3.2, 0.2], [0, 0, -0.7]),
      P(new THREE.IcosahedronGeometry(2.0, 0), g[0], [0, 4.6, 0], null, [1, 0.85, 1]),
      P(new THREE.IcosahedronGeometry(1.5, 0), g[1], [1.0, 4.0, 0.5]),
      P(new THREE.IcosahedronGeometry(1.4, 0), g[2], [-0.9, 4.1, -0.6]),
      P(new THREE.IcosahedronGeometry(1.25, 0), g[1], [0.1, 5.8, 0.2]),
    ]);
  }
  function geoPine(snow) {
    const parts = [P(new THREE.CylinderGeometry(0.14, 0.26, 3, 6), 0x4a3222, [0, 1.5, 0])];
    const L = [[2.3, 3.4, 3.0], [1.8, 3.0, 4.7], [1.25, 2.6, 6.3], [0.7, 1.8, 7.6]];
    L.forEach((l, i) => {
      parts.push(P(new THREE.ConeGeometry(l[0], l[1], 8), i % 2 ? 0x1f4a2a : 0x245432, [0, l[2], 0]));
      if (snow) parts.push(P(new THREE.ConeGeometry(l[0] * 0.75, l[1] * 0.45, 8), 0xeef4fa, [0, l[2] + l[1] * 0.3, 0]));
    });
    return merge(parts);
  }
  function geoPalm() {
    const parts = [];
    let x = 0, y = 0, lean = 0;
    for (let i = 0; i < 8; i++) {
      const len = 1.1;
      lean += 0.045 + i * 0.012;
      const cx = x + Math.sin(lean) * len / 2, cy = y + Math.cos(lean) * len / 2;
      parts.push(P(new THREE.CylinderGeometry(0.17 - i * 0.006, 0.2 - i * 0.006, len + 0.05, 7), i % 2 ? 0x8a6a45 : 0x76583a, [cx, cy, 0], [0, 0, -lean]));
      x += Math.sin(lean) * len; y += Math.cos(lean) * len;
    }
    for (let k = 0; k < 9; k++) {
      const yaw = k * TAU / 9 + 0.2;
      let px = x, py = y, pz = 0;
      const pitches = [-0.35, 0.15, 0.6];
      pitches.forEach((pt, j) => {
        const len = 1.6 - j * 0.15, wdt = 0.95 - j * 0.2;
        const dx = Math.sin(yaw) * Math.cos(pt), dy = -Math.sin(pt), dz = Math.cos(yaw) * Math.cos(pt);
        parts.push(P(new THREE.BoxGeometry(wdt, 0.05, len), j === 2 ? 0x5a9a32 : 0x3f8a2a, [px + dx * len / 2, py + dy * len / 2, pz + dz * len / 2], [pt, yaw, 0, 'YXZ']));
        px += dx * len; py += dy * len; pz += dz * len;
      });
    }
    for (let k = 0; k < 4; k++) parts.push(P(new THREE.SphereGeometry(0.2, 6, 5), 0x5a3a1a, [x + Math.cos(k * 1.6) * 0.3, y - 0.3, Math.sin(k * 1.6) * 0.3]));
    return merge(parts);
  }
  function geoBamboo(seed) {
    const r = mulberry32(seed); const parts = [];
    for (let i = 0; i < 7; i++) {
      const a = r() * TAU, d = r() * 0.6, L = 6 + r() * 4, lx = (r() - 0.5) * 0.25, lz = (r() - 0.5) * 0.25;
      const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
      parts.push(P(new THREE.CylinderGeometry(0.055, 0.08, L, 5), i % 2 ? 0x6a9a3a : 0x7aa845, [bx + lx * L / 2, L / 2, bz + lz * L / 2], [lz, 0, -lx]));
      for (let k = 0; k < 3; k++) parts.push(P(new THREE.IcosahedronGeometry(0.7, 0), 0x4a8a2a, [bx + lx * L + (r() - 0.5) * 1.2, L - k * 1.1, bz + lz * L + (r() - 0.5) * 1.2], null, [0.9, 0.35, 1.5]));
    }
    return merge(parts);
  }
  function geoBush() {
    return merge([
      P(new THREE.IcosahedronGeometry(0.8, 0), 0x2f6224, [0, 0.55, 0]),
      P(new THREE.IcosahedronGeometry(0.6, 0), 0x3a7030, [0.6, 0.45, 0.2]),
      P(new THREE.IcosahedronGeometry(0.55, 0), 0x2a5a22, [-0.5, 0.4, -0.3]),
    ]);
  }
  function geoRock(seed) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    const save = nSeed; nSeed = seed;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 0.75 + 0.5 * vnoise(x * 1.7 + 5, z * 1.7 + y * 1.3);
      p.setXYZ(i, x * n, y * n * 0.7, z * n);
    }
    nSeed = save;
    g.computeVertexNormals();
    return merge([P(g, 0x7a776f, [0, 0.25, 0])]);
  }
  function geoTuft(blades, hMin, hMax, wid, cBase, cTip, seed) {
    const r = mulberry32(seed);
    const pos = [], col = [], nor = [];
    const cb = new THREE.Color(cBase), ct = new THREE.Color(cTip);
    for (let i = 0; i < blades; i++) {
      const a = r() * TAU, h = hMin + r() * (hMax - hMin), lean = 0.1 + r() * 0.35;
      const ox = (r() - 0.5) * 0.3, oz = (r() - 0.5) * 0.3;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(ox - sa * wid, 0, oz + ca * wid, ox + sa * wid, 0, oz - ca * wid, ox + ca * lean * h, h, oz + sa * lean * h);
      col.push(cb.r, cb.g, cb.b, cb.r, cb.g, cb.b, ct.r, ct.g, ct.b);
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  }

  // Rải instance ngẫu nhiên (theo rng của env)
  function isExcluded(x, z, pad) {
    for (let i = 0; i < exclusions.length; i++) {
      const e = exclusions[i]; const dx = x - e.x, dz = z - e.z, r = e.r + pad;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
  // Chia InstancedMesh thành ô 100m để Three.js bỏ qua ô ngoài khung hình (và ngoài vùng bóng đổ).
  // r128 cull theo geometry.boundingSphere → mỗi ô có geometry riêng nhưng DÙNG CHUNG attribute (chung buffer GPU).
  const CHUNK = 100;
  const _cm = new THREE.Matrix4(), _cp = new THREE.Vector3(), _cc = new THREE.Color();
  function addChunked(im) {
    const n = im.count;
    if (n < 60) { envRoot.add(im); return im; }
    const geo = im.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    // ô tối thiểu 100m, tự giãn để tối đa 4×4 ô (mỗi ô = 1 lệnh vẽ)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) { im.getMatrixAt(i, _cm); _cp.setFromMatrixPosition(_cm); x0 = Math.min(x0, _cp.x); x1 = Math.max(x1, _cp.x); z0 = Math.min(z0, _cp.z); z1 = Math.max(z1, _cp.z); }
    const cell = Math.max(CHUNK, (x1 - x0) / 4 + 0.01, (z1 - z0) / 4 + 0.01);
    const cells = new Map();
    for (let i = 0; i < n; i++) {
      im.getMatrixAt(i, _cm); _cp.setFromMatrixPosition(_cm);
      const key = Math.floor((_cp.x - x0) / cell) + ',' + Math.floor((_cp.z - z0) / cell);
      let c = cells.get(key); if (!c) cells.set(key, (c = []));
      c.push(i);
    }
    if (cells.size < 2) { envRoot.add(im); return im; }
    cells.forEach((ids) => {
      const g = new THREE.BufferGeometry();
      if (geo.index) g.setIndex(geo.index);
      for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
      const part = new THREE.InstancedMesh(g, im.material, ids.length);
      let maxScale = 1;
      const box = new THREE.Box3();
      ids.forEach((id, j) => {
        im.getMatrixAt(id, _cm); part.setMatrixAt(j, _cm);
        box.expandByPoint(_cp.setFromMatrixPosition(_cm));
        maxScale = Math.max(maxScale, _cm.getMaxScaleOnAxis());
        if (im.instanceColor) { im.getColorAt(id, _cc); part.setColorAt(j, _cc); }
      });
      const sph = box.getBoundingSphere(new THREE.Sphere());
      sph.radius += (geo.boundingSphere.radius + geo.boundingSphere.center.length()) * maxScale;
      g.boundingSphere = sph;
      part.instanceMatrix.needsUpdate = true;
      if (part.instanceColor) part.instanceColor.needsUpdate = true;
      part.castShadow = im.castShadow; part.receiveShadow = im.receiveShadow;
      part.frustumCulled = true;
      envRoot.add(part);
    });
    im.dispose && im.dispose();
    return im;
  }

  function scatter(geo, mat, count, o) {
    count = Math.max(1, count | 0);
    const im = new THREE.InstancedMesh(geo, mat, count);
    let n = 0;
    for (let tries = 0; n < count && tries < count * 12; tries++) {
      let x, z;
      if (o.circle) { const a = rng() * TAU, r = o.circle.r * Math.sqrt(rng()); x = o.circle.x + Math.cos(a) * r; z = o.circle.z + Math.sin(a) * r; }
      else { const A = o.area || [-195, 195, -195, 195]; x = rr(A[0], A[1]); z = rr(A[2], A[3]); }
      const h = terrainH(x, z);
      if (o.hMin !== undefined && h < o.hMin) continue;
      if (o.hMax !== undefined && h > o.hMax) continue;
      if (o.nyMin && normalY(x, z) < o.nyMin) continue;
      if (!o.noEx && isExcluded(x, z, o.pad || 0)) continue;
      if (platforms.length && onPlatform(x, z)) continue;
      if (o.test && !o.test(x, z, h)) continue;
      const s = rr(o.sMin || 1, o.sMax || 1);
      const tl = o.tilt || 0;
      _e.set(rr(-tl, tl), rng() * TAU, rr(-tl, tl));
      _q.setFromEuler(_e);
      _s.set(s, s * (o.syJit ? rr(1 - o.syJit, 1 + o.syJit) : 1), s);
      _v.set(x, (o.y !== undefined ? o.y : h) - (o.sink || 0) * s, z);
      _m4.compose(_v, _q, _s);
      im.setMatrixAt(n, _m4);
      if (o.collide && s >= (o.colMinS || 0) && Math.abs(x) < 200 && Math.abs(z) < 200) colC(x, z, o.collide * s, undefined, o.colTop !== undefined ? h + o.colTop * s : undefined);
      if (o.colors) {
        _c.setHex(o.colors[Math.floor(rng() * o.colors.length)]);
        if (o.cJit) _c.multiplyScalar(1 + rr(-o.cJit, o.cJit));
        im.setColorAt(n, _c);
      }
      n++;
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = !!o.cast; im.receiveShadow = o.recv !== false;
    return addChunked(im);
  }
  // instance theo danh sách vị trí cố định
  function instanceList(geo, mat, list, cast) {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    list.forEach((it, i) => {
      _e.set(it.rx || 0, it.ry || 0, it.rz || 0); _q.setFromEuler(_e);
      const s = it.s || 1; _s.set(it.sx || s, it.sy || s, it.sz || s);
      _v.set(it.x, it.y, it.z); _m4.compose(_v, _q, _s); im.setMatrixAt(i, _m4);
      if (it.color !== undefined) { _c.setHex(it.color); im.setColorAt(i, _c); }
    });
    im.count = list.length;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = !!cast; im.receiveShadow = true;
    return addChunked(im);
  }

  const treeMat = () => swayMat(vcMat({ roughness: 0.9, flatShading: true }), 0.0025);
  const grassMat = () => swayMat(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0.11);

  function addCommonVeg(o) {
    // o: { broadleaf, pine, snowPine, bush, grass, grassCircle, flowers, rocks, reeds, hMin, hMax, palms, bamboo, far }
    const thr = shoreThr;
    // số lượng nhân G.gfx.density (cây gần người chơi có collider)
    if (o.broadleaf) scatter(geoBroadleaf(o.leafTint), treeMat(), dens(o.broadleaf), { hMin: thr + 0.6, hMax: o.treeMax || 40, nyMin: 0.8, pad: 3, sMin: 0.75, sMax: 1.5, cast: true, syJit: 0.15, colors: [0xffffff, 0xe8f0d0, 0xd8e8c0, 0xfff0d8], area: o.area, collide: 0.32 });
    if (o.pine) scatter(geoPine(false), treeMat(), dens(o.pine), { hMin: thr + 0.8, hMax: o.pineMax || 60, nyMin: 0.72, pad: 3, sMin: 0.8, sMax: 1.7, cast: true, syJit: 0.2, colors: [0xffffff, 0xd8e8d8, 0xc8dcc8], area: o.area, collide: 0.3 });
    if (o.snowPine) scatter(geoPine(true), treeMat(), dens(o.snowPine), { hMin: o.snowPineMin || 18, hMax: 70, nyMin: 0.7, pad: 3, sMin: 0.8, sMax: 1.5, cast: true, area: o.area, collide: 0.3 });
    if (o.palms) scatter(geoPalm(), treeMat(), dens(o.palms), { hMin: o.palmMin || thr + 0.4, hMax: o.palmMax || 7, nyMin: 0.85, pad: 3, sMin: 0.85, sMax: 1.35, cast: true, colors: [0xffffff, 0xe8f0d0], area: o.area, collide: 0.24 });
    if (o.bamboo) scatter(geoBamboo(77), treeMat(), dens(o.bamboo), { hMin: thr + 0.4, hMax: 12, nyMin: 0.85, pad: 2, sMin: 0.8, sMax: 1.2, cast: true, area: o.area, test: o.bambooTest, collide: 0.55 });
    if (o.bush) scatter(geoBush(), treeMat(), dens(o.bush), { hMin: thr + 0.3, hMax: o.treeMax || 40, nyMin: 0.75, pad: 1, sMin: 0.6, sMax: 1.4, cast: true, colors: [0xffffff, 0xd8e8b0, 0xc0d8a0], area: o.area });
    if (o.rocks) scatter(geoRock(3), vcMat({ flatShading: true, roughness: 0.95 }), dens(o.rocks), { hMin: -2, nyMin: 0.5, pad: 0.5, sMin: 0.4, sMax: 2.2, tilt: 0.4, cast: true, sink: 0.25, colors: o.rockColors || [0xffffff, 0xd0ccc4, 0xb8b0a4, 0xe0e4e8], area: o.area, collide: 0.8, colMinS: 0.85, colTop: 0.55 });
    if (o.grass) scatter(geoTuft(5, 0.35, 0.8, 0.06, o.grassBase || 0x2a4a18, o.grassTip || 0x7aa040, 5), grassMat(), dens(o.grass), { hMin: thr + 0.25, hMax: o.grassMax || 30, nyMin: 0.78, pad: 0, sMin: 0.7, sMax: 1.4, circle: o.grassCircle || { x: spawn.x, z: spawn.z, r: 120 }, noEx: false });
    if (o.reeds) scatter(geoTuft(9, 1.0, 2.2, 0.04, 0x3a5a22, 0x9aa85a, 9), grassMat(), dens(o.reeds), { hMin: -0.5, hMax: thr + 0.5, sMin: 0.7, sMax: 1.3, pad: 0, test: (x, z, h) => h > -0.6 });
    if (o.flowers) scatter(new THREE.IcosahedronGeometry(0.09, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), dens(o.flowers), { hMin: thr + 0.4, hMax: 25, nyMin: 0.85, y: undefined, sMin: 0.8, sMax: 1.4, colors: [0xffffff, 0xffe14a, 0xff6aa0, 0xb07aff, 0xff8a3a], circle: { x: spawn.x, z: spawn.z, r: 110 }, sink: -0.35 });
  }

  // =====================================================================
  // Ambient: clouds, birds, fireflies, mist
  // =====================================================================
  let cloudMats = [];
  function addClouds(n, o) {
    o = o || {};
    // 3 mẫu mây gộp vào 1 atlas dọc → toàn bộ mây = 1 draw call
    const atlas = makeCanvas(256, 384), ax = atlas.getContext('2d');
    [11, 23, 37].forEach((sd, k) => { const t = cloudTex(sd); if (t.image) ax.drawImage(t.image, 0, k * 128); t.dispose(); });
    const tex = texOf(atlas);
    const list = [], items = [];
    for (let i = 0; i < n; i++) {
      let x, y, z;
      if (o.plane) { x = rr(-500, 500); y = rr(20, 260); z = rr(-1600, 400); if (Math.abs(x) < 40 && y > 90 && y < 150) x += Math.sign(x || 1) * 40; }
      else { const a = rng() * TAU, r = rr(250, 1500); x = Math.cos(a) * r; z = Math.sin(a) * r; y = rr(180, 380); }
      const w = o.plane ? rr(60, 200) : rr(160, 380);
      const k = i % 3;
      items.push({ x, y, z, w, h: w * rr(0.35, 0.5), u0: 0, u1: 1, v0: 1 - (k + 1) / 3, v1: 1 - k / 3 });
      list.push({ x, y, z });
    }
    const bb = billboards(tex, items, { dynamic: true, opacity: 0.85, renderOrder: -10 });
    envRoot.add(bb); cloudMats.push(bb);
    const wnd = { x: 0, z: 0, speed: 0 };
    envUpd.push((dt) => {
      windInto(wnd);
      for (let i = 0; i < list.length; i++) {
        const sp = list[i];
        if (o.plane) {
          sp.z += (40 + wnd.z * 0.3) * dt; sp.x += wnd.x * 0.3 * dt;
          if (sp.z > 450) { sp.z -= 2000; sp.x = rr(-500, 500); }
        } else {
          sp.x += wnd.x * 0.6 * dt; sp.z += wnd.z * 0.6 * dt;
          if (sp.x * sp.x + sp.z * sp.z > 1600 * 1600) { sp.x *= -0.95; sp.z *= -0.95; }
        }
        bb.userData.setPos(i, sp.x, sp.y, sp.z);
      }
      bb.userData.commit();
    });
  }
  // Chim: 1 InstancedMesh / đàn; vỗ cánh trong vertex shader (aWing: -1 trái, 0 thân, 1 phải)
  const birdT = { value: 0 };
  function birdGeo() {
    const body = new THREE.SphereGeometry(0.16, 6, 4); body.scale(1, 0.8, 2.4);
    const b = body.toNonIndexed(); body.dispose();
    const bp = b.attributes.position.array;
    const wingR = [0, 0, -0.18, 0, 0, 0.22, 0.95, 0, 0.0], wingL = [0, 0, 0.22, 0, 0, -0.18, -0.95, 0, 0.0];
    const nB = bp.length / 3;
    const pos = new Float32Array(bp.length + 18), wing = new Float32Array(nB + 6);
    pos.set(bp, 0); pos.set(wingR, bp.length); pos.set(wingL, bp.length + 9);
    for (let i = 0; i < 3; i++) { wing[nB + i] = 1; wing[nB + 3 + i] = -1; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aWing', new THREE.BufferAttribute(wing, 1));
    g.computeVertexNormals();
    b.dispose();
    return g;
  }
  function addBirds(n, color, size, cx, cz, rMin, rMax, hMin, hMax) {
    const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uBirdT = birdT;
      sh.vertexShader = `uniform float uBirdT;
attribute float aWing;
attribute float aPh;
` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        if (aWing != 0.0) {
          float glide = step(0.3, sin(uBirdT * 0.5 + aPh));
          float f = mix(sin(uBirdT * 11.0 + aPh) * 0.75, 0.12, glide) * aWing;
          float c = cos(f), s = sin(f);
          transformed.xy = vec2(transformed.x * c - transformed.y * s, transformed.x * s + transformed.y * c);
        }`);
    };
    mat.customProgramCacheKey = () => 'bird_v1';
    const geo = birdGeo();
    const ph = new Float32Array(n);
    const birds = [];
    for (let i = 0; i < n; i++) {
      ph[i] = rng() * 10;
      birds.push({ s: size * rr(0.8, 1.2), a: rng() * TAU, r: rr(rMin, rMax), h: rr(hMin, hMax), sp: rr(5, 9) * (rng() < 0.5 ? 1 : -1), ph: ph[i], cx: cx + rr(-30, 30), cz: cz + rr(-30, 30) });
    }
    geo.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1));
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    envRoot.add(im);
    envUpd.push((dt, t) => {
      const vis = sunDir.y > 0.02 && wb.storm < 0.6;
      im.visible = vis;
      if (!vis) return;
      birdT.value = t;
      for (let i = 0; i < n; i++) {
        const b = birds[i];
        b.a += b.sp * dt / b.r;
        const sg = Math.sign(b.sp);
        const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r;
        const y = b.h + Math.sin(t * 0.3 + b.ph) * 3;
        const vx = -Math.sin(b.a) * sg, vz = Math.cos(b.a) * sg;
        _e.set(0, Math.atan2(vx, vz), -0.25 * sg, 'XYZ'); _q.setFromEuler(_e);
        _v.set(x, y, z); _s.set(b.s, b.s, b.s); _m4.compose(_v, _q, _s);
        im.setMatrixAt(i, _m4);
      }
      im.instanceMatrix.needsUpdate = true;
    });
  }
  function addFireflies(n, cx, cz, rMin, rMax) {
    const pos = new Float32Array(n * 3), base = [];
    for (let i = 0; i < n; i++) {
      let x = 0, z = 0, ok = false;
      for (let k = 0; k < 20 && !ok; k++) { const a = rng() * TAU, r = rr(rMin, rMax); x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r; ok = terrainH(x, z) > -0.5; }
      base.push({ x, z, y: Math.max(terrainH(x, z), 0) + rr(0.4, 2.8), p: rng() * 100 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 0, cz), rMax + 20);
    const mat = new THREE.PointsMaterial({ size: 0.45, map: glowTex(), color: 0xd8ff6a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    envRoot.add(pts);
    nightSprites.push({ mat, max: 1.0, rain: true });
    envUpd.push((dt, t) => {
      if (mat.opacity <= 0.01) return;
      for (let i = 0; i < n; i++) {
        const b = base[i];
        pos[i * 3] = b.x + Math.sin(t * 0.37 + b.p) * 1.5;
        pos[i * 3 + 1] = b.y + Math.sin(t * 0.81 + b.p * 2) * 0.5;
        pos[i * 3 + 2] = b.z + Math.cos(t * 0.29 + b.p) * 1.5;
      }
      geo.attributes.position.needsUpdate = true;
      mat.size = 0.3 + 0.2 * (0.5 + 0.5 * Math.sin(t * 3));
    });
  }
  function addMist(n, cx, cz, r, yMin, yMax) {
    const list = [], items = [];
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, d = r * Math.sqrt(rng());
      const y = rr(yMin, yMax), w = rr(50, 100);
      items.push({ x: cx + Math.cos(a) * d, y, z: cz + Math.sin(a) * d, w, h: w * 0.22 });
      list.push({ a, d, y, s: rr(0.003, 0.01) });
    }
    const bb = billboards(cloudTex(91), items, { dynamic: true, opacity: 0.25, fog: true });
    envRoot.add(bb);
    envUpd.push((dt) => {
      const h = G.state.time;
      const morning = 1 - ss(2, 4, Math.abs(h - 6.5));
      bb.userData.setOpacity(clamp(0.12 + 0.25 * morning + 0.25 * nightK + 0.3 * wb.fog, 0, 0.6));
      bb.userData.color.setScalar(0.25 + 0.75 * lightLevel);
      for (let i = 0; i < list.length; i++) { const m = list[i]; m.a += m.s * dt; bb.userData.setPos(i, cx + Math.cos(m.a) * m.d, m.y, cz + Math.sin(m.a) * m.d); }
      bb.userData.commit();
    });
  }
  function addFloater(obj, x, z, off, tiltAmt) { floaters.push({ obj, x, z, off: off || 0, tilt: tiltAmt === undefined ? 1 : tiltAmt }); }

  // =====================================================================
  // Props: stalls, boats, signs, zones
  // =====================================================================
  // Vật phát sáng (bóng đèn, lửa): không tone-map, >1.0 khi có hậu kỳ HDR → bloom chọn lọc
  function glowMesh(parts, color) {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    mat.toneMapped = false;
    const m = new THREE.Mesh(merge(parts), mat);
    m.userData.glowColor = color;
    glowMeshes.push(m);
    return m;
  }
  function makeRowBoat(color, len) {
    len = len || 3.4;
    const g = new THREE.Group();
    const hull = new THREE.SphereGeometry(1, 14, 8, 0, TAU, Math.PI / 2, Math.PI / 2);
    const parts = [
      P(hull, color || 0x7a4a2a, [0, 0.45, 0], null, [len * 0.22, 0.5, len * 0.5]),
      P(new THREE.BoxGeometry(len * 0.42, 0.06, 0.25), 0x8a6a45, [0, 0.42, 0.3]),
      P(new THREE.BoxGeometry(len * 0.42, 0.06, 0.25), 0x8a6a45, [0, 0.42, -0.6]),
      P(new THREE.BoxGeometry(0.06, 0.05, 2.2), 0xa07a50, [0.5, 0.55, 0], [0, 0.25, 0.3]),
    ];
    g.add(meshOf(parts));
    return g;
  }
  function buildStall(role, sc) {
    const g = new THREE.Group();
    const parts = [], glow = [];
    const WD = 0x8a5a32, DK = 0x4a3020;
    const box = (w, h, d, c, p, r) => parts.push(P(new THREE.BoxGeometry(w, h, d), c, p, r));
    const cyl = (r1, r2, h, c, p, r, seg) => parts.push(P(new THREE.CylinderGeometry(r1, r2, h, seg || 8), c, p, r));
    const z0 = -1.6;
    let sign = null, signY = 2.4, signW = 2.4, bg = '#fff3d6', fg = '#8a1c12';
    let fire = null;
    const poles = (w, d, h, c) => { for (const sx of [-w / 2, w / 2]) for (const sz of [-d / 2, d / 2]) cyl(0.05, 0.06, h, c || DK, [sx, h / 2, z0 + sz]); };
    if (role === 'shop') {
      box(2.6, 0.08, 1.0, WD, [0, 0.9, z0]);
      for (const sx of [-1.2, 1.2]) for (const sz of [-0.4, 0.4]) box(0.08, 0.9, 0.08, DK, [sx, 0.45, z0 + sz]);
      poles(2.8, 1.4, 2.5);
      for (let i = 0; i < 6; i++) box(0.49, 0.05, 1.8, i % 2 ? 0xf2f2f2 : 0x2a6ad0, [-1.22 + i * 0.49, 2.5, z0 + 0.1], [0.18, 0, 0]);
      box(0.45, 0.28, 0.32, 0xd04030, [-0.8, 1.08, z0]); box(0.35, 0.22, 0.3, 0x3070c0, [-0.3, 1.05, z0 + 0.1]); box(0.5, 0.16, 0.35, 0xe0b030, [0.45, 1.02, z0]);
      for (let i = 0; i < 5; i++) cyl(0.012, 0.03, 3.0, i % 2 ? 0x222222 : 0xc8a165, [1.55 + i * 0.09, 1.45, z0 - 0.55], [0, 0, -0.18], 5);
      sign = ['ĐỒ CÂU', 'Cần • Dây • Mồi • Vé máy bay']; bg = '#e8f2ff'; fg = '#0b3a8a'; signY = 2.75;
    } else if (role === 'bar') {
      poles(3.2, 2.6, 2.3);
      box(3.5, 0.06, 2.9, 0xc0302a, [0, 2.33, z0], [0.06, 0, 0]);
      box(1.0, 0.05, 0.65, 0x2a5ad0, [0, 0.5, z0 + 0.4]);
      for (const sx of [-0.4, 0.4]) for (const sz of [-0.25, 0.25]) box(0.04, 0.5, 0.04, 0x2a5ad0, [sx, 0.25, z0 + 0.4 + sz]);
      [[-0.85, 0.4], [0.85, 0.4], [0, -0.3], [0, 1.1]].forEach((s) => cyl(0.17, 0.14, 0.42, 0xd02a2a, [s[0], 0.21, z0 + s[1]]));
      box(0.5, 0.3, 0.36, 0xe8c020, [1.3, 0.15, z0 - 0.9]); box(0.5, 0.3, 0.36, 0xe8c020, [1.3, 0.46, z0 - 0.9]);
      cyl(0.25, 0.25, 0.7, 0x9a9a9a, [-1.25, 0.35, z0 - 0.9], null, 10);
      for (let i = 0; i < 7; i++) glow.push(P(new THREE.SphereGeometry(0.06, 6, 4), [0xffd860, 0xff6a6a, 0x6aff9a, 0x6ab0ff][i % 4], [-1.5 + i * 0.5, 2.18 - Math.sin(i / 6 * Math.PI) * 0.15, z0 + 1.3]));
      sign = ['BIA HƠI', 'Rượu đế • Trà đá']; bg = '#ffe24a'; fg = '#a3120a'; signY = 2.55;
    } else if (role === 'banhmi') {
      box(1.7, 0.8, 0.8, 0x2a7ad0, [0, 0.8, z0]); box(1.8, 0.05, 0.9, 0xeeeeee, [0, 1.22, z0]);
      for (let i = 0; i < 5; i++) cyl(0.055, 0.05, 0.5, 0xd8a050, [-0.5 + i * 0.25, 1.32, z0], [0, 0.3, Math.PI / 2], 6);
      for (const sx of [-0.55, 0.55]) cyl(0.33, 0.33, 0.08, 0x222222, [sx, 0.33, z0 + 0.45], [Math.PI / 2, 0, 0], 12);
      cyl(0.03, 0.03, 2.4, 0x888888, [0.7, 1.4, z0 - 0.2]);
      parts.push(P(new THREE.ConeGeometry(1.5, 0.5, 8), 0xe23a2a, [0.7, 2.6, z0 - 0.2]));
      sign = ['BÁNH MÌ PATE', '15K • Ngon nhất quả đất']; bg = '#ffd84a'; fg = '#b01010'; signY = 1.6; signW = 1.9;
    } else if (role === 'craft') {
      poles(3.0, 2.4, 2.5);
      box(3.3, 0.08, 2.7, 0x8a8e92, [0, 2.52, z0], [0.12, 0, 0]);
      box(1.2, 0.9, 1.0, 0x8a3a2a, [-0.8, 0.45, z0 - 0.4]);
      glow.push(P(new THREE.BoxGeometry(0.8, 0.08, 0.6), 0xff6a1a, [-0.8, 0.93, z0 - 0.4]));
      cyl(0.2, 0.26, 1.7, 0x555555, [-0.8, 1.75, z0 - 0.7]);
      box(0.3, 0.4, 0.3, 0x333333, [0.6, 0.2, z0]); box(0.75, 0.18, 0.3, 0x2a2a2a, [0.6, 0.49, z0]);
      cyl(0.3, 0.3, 0.8, 0x6a4a2a, [1.3, 0.4, z0 - 0.6], null, 10);
      box(0.05, 0.05, 0.9, 0x777777, [1.0, 0.95, z0 - 1.1], [0.6, 0, 0]);
      sign = ['LÒ RÈN', 'Chế tạo đồ nghề']; bg = '#3a2a20'; fg = '#ffcc66'; signY = 2.75;
      fire = { x: -0.8, y: 1.2, z: z0 - 0.4, color: 0xff7a2a, int: 0.8 };
    } else if (role === 'boat') {
      box(0.08, 0.04, 2.4, WD, [-1.1, 1.0, z0], [0.3, 0, 0.1]); box(0.08, 0.04, 2.4, WD, [-0.95, 1.0, z0], [0.3, 0, 0.1]);
      parts.push(P(new THREE.TorusGeometry(0.3, 0.07, 6, 14), 0xc8b080, [0.9, 0.07, z0 + 0.3], [Math.PI / 2, 0, 0]));
      parts.push(P(new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 2), 0x7a4a2a, [0.2, 0.42, z0 - 0.6], [Math.PI, 0.4, 0], [0.75, 0.45, 1.7]));
      sign = ['THUÊ THUYỀN', 'Đóng thuyền theo yêu cầu']; bg = '#dff3ff'; fg = '#0a4a8a'; signY = 1.5;
    } else if (role === 'elder') {
      box(1.6, 0.08, 0.42, WD, [0, 0.45, z0 + 0.8]);
      for (const sx of [-0.7, 0.7]) box(0.08, 0.45, 0.35, DK, [sx, 0.22, z0 + 0.8]);
      for (let i = 0; i < 4; i++) cyl(0.07, 0.07, 0.8, 0x4a2e1a, [1.5, 0.07, z0 + 1.6], [Math.PI / 2, i * 0.8, 0], 6);
      glow.push(P(new THREE.ConeGeometry(0.22, 0.6, 6), 0xff8a2a, [1.5, 0.4, z0 + 1.6]));
      glow.push(P(new THREE.ConeGeometry(0.12, 0.4, 5), 0xffd060, [1.45, 0.4, z0 + 1.65]));
      box(0.5, 0.35, 0.5, WD, [-1.2, 0.18, z0 + 0.9]);
      fire = { x: 1.5, y: 0.8, z: z0 + 1.6, color: 0xff8a3a, int: 1.4 };
    }
    if (parts.length) g.add(meshOf(parts));
    if (glow.length) { const gm = glowMesh(glow); g.add(gm); }
    if (sign) { const s = makeSign(sign, { w: signW, h: signW * 0.36, post: 0, bg, fg }); s.position.set(0, signY - 0.05, z0 - 0.9); g.add(s); if (role === 'banhmi') s.position.z = z0 + 0.42; }
    if (role === 'banhmi') {
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.2 }));
      glass.position.set(0, 1.5, z0); g.add(glass);
    }
    if (fire) {
      const L = addLight(g, fire.x, fire.y, fire.z, fire.color, fire.int, 9);
      const base = fire.int;
      envUpd.push((dt, t) => { L.intensity = base * (0.75 + 0.25 * Math.sin(t * 13 + fire.x) * Math.sin(t * 7.3)) * (0.4 + 0.6 * nightK); });
    }
    if (sc && sc !== 1) g.scale.setScalar(sc);
    return g;
  }

  // Collider cho quầy NPC (theo vị trí/hướng/tỉ lệ group). Không chắn chỗ NPC đứng (gốc group).
  const STALL_COL = {
    shop: [[0, -1.6, 1.4, 0.6]], bar: [[0, -1.4, 1.2, 0.75]], banhmi: [[0, -1.6, 0.9, 0.45]],
    craft: [[-0.8, -2.0, 0.65, 0.55], [0.6, -1.6, 0.25, 0.2], [1.3, -2.2, 0.32, 0.32]], boat: [[0.2, -2.2, 0.8, 1.3]], elder: [[1.5, 0.0, 0.45, 0.45]],
  };
  function stallColliders(role, gx, gz, grot, sc, yMin, yMax) {
    for (const b of STALL_COL[role] || []) colBLocal(gx, gz, grot, sc, b[0], b[1], b[2], b[3], yMin, yMax);
  }
  function polarGeo(r0, r1, nr, na, yFn) {
    const pos = [], idx = [];
    for (let j = 0; j <= nr; j++) {
      const r = lerp(r0, r1, j / nr);
      for (let i = 0; i <= na; i++) { const a = i / na * TAU; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
    }
    for (let j = 0; j < nr; j++) for (let i = 0; i < na; i++) {
      const a = j * (na + 1) + i, b = a + 1, c = a + na + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    if (yFn) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, yFn(p.getX(i), p.getZ(i))); }
    g.computeVertexNormals();
    return g;
  }
  function buildZoneVisual(zn, fixedY) {
    const grp = new THREE.Group();
    grp.position.set(zn.x, 0, zn.z);
    const topW = (W.current.tideAmp || 0) + 0.15;
    const yFn = (lx, lz) => fixedY !== undefined ? fixedY + 0.04 : Math.max(terrainH(zn.x + lx, zn.z + lz), topW) + 0.12;
    const disk = new THREE.Mesh(polarGeo(0.01, zn.r, 8, 64, yFn), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
    const ring = new THREE.Mesh(polarGeo(zn.r - 1.0, zn.r, 1, 96, (x, z) => yFn(x, z) + 0.02), new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    disk.renderOrder = 2; ring.renderOrder = 3;
    grp.add(disk, ring);
    // Hàng rào trên phần đất
    const parts = [];
    let signPos = null, bestD = 1e9;
    if (fixedY === undefined) {
      const nPost = Math.max(12, Math.round(TAU * zn.r / 3));
      let prev = null;
      for (let i = 0; i <= nPost; i++) {
        const a = i / nPost * TAU;
        const lx = Math.cos(a) * zn.r, lz = Math.sin(a) * zn.r;
        const h = terrainH(zn.x + lx, zn.z + lz);
        if (h > topW + 0.1) {
          parts.push(P(new THREE.CylinderGeometry(0.06, 0.07, 1.3, 6), 0xdddddd, [lx, h + 0.65, lz]));
          parts.push(P(new THREE.CylinderGeometry(0.065, 0.065, 0.2, 6), 0xd01818, [lx, h + 1.1, lz]));
          if (prev) {
            const dx = lx - prev.x, dz = lz - prev.z, L = Math.hypot(dx, dz), ry = -Math.atan2(dz, dx);
            for (const yy of [0.55, 1.05]) parts.push(P(new THREE.BoxGeometry(L, 0.04, 0.04), yy > 1 ? 0xd01818 : 0xf0f0f0, [(lx + prev.x) / 2, (h + prev.h) / 2 + yy, (lz + prev.z) / 2], [0, ry, 0]));
          }
          prev = { x: lx, z: lz, h };
          const d = Math.hypot(zn.x + lx - spawn.x, zn.z + lz - spawn.z);
          if (d < bestD) { bestD = d; signPos = { x: lx * 0.88, z: lz * 0.88 }; }
        } else prev = null;
      }
      if (parts.length) grp.add(meshOf(parts));
    } else signPos = { x: 0, z: -zn.r * 0.6 };
    if (!signPos) signPos = { x: 0, z: 0 };
    const sgn = makeSign(['KHU VỰC CẤM CÂU CÁ', zn.name], { w: 3.0, h: 1.2, post: fixedY !== undefined ? 0.6 : 1.3, bg: '#ffffff', fg: '#c0101a' });
    const sy = fixedY !== undefined ? fixedY : Math.max(terrainH(zn.x + signPos.x, zn.z + signPos.z), topW);
    sgn.position.set(signPos.x, sy, signPos.z);
    sgn.rotation.y = Math.atan2(spawn.x - (zn.x + signPos.x), spawn.z - (zn.z + signPos.z));
    if (fixedY !== undefined) sgn.scale.setScalar(0.7);
    grp.add(sgn);
    envRoot.add(grp);
  }

  // =====================================================================
  // Spawn / camp / spots / zones (generic for land envs)
  // =====================================================================
  function march(x, z, dx, dz, thr, maxD) {
    for (let d = 0; d < (maxD || 400); d += 0.5) {
      const px = x + dx * d, pz = z + dz * d;
      if (hFinal(px, pz) > thr) return { x: px, z: pz };
    }
    return { x, z };
  }
  function ensureLand(p, dir, thr) {
    for (let k = 0; k < 60 && terrainH(p.x, p.z) < thr; k++) { p.x += dir.x; p.z += dir.z; }
    p.x = clamp(p.x, -185, 185); p.z = clamp(p.z, -185, 185);
    return p;
  }
  function setupSpawnAndCamp(sf) {
    const L = Math.hypot(sf.dx, sf.dz); const dx = sf.dx / L, dz = sf.dz / L;
    idir = { x: dx, z: dz };
    const sh = march(sf.x, sf.z, dx, dz, shoreThr);
    spawn.set(sh.x + dx * 2.5, 0, sh.z + dz * 2.5);
    const cx = sh.x + dx * 15, cz = sh.z + dz * 15;
    const target = Math.max(hFinal(cx, cz), shoreThr + 0.5);
    const R = 13;
    mods.push((x, z, h) => { const d = Math.hypot(x - cx, z - cz); if (d >= R) return h; return lerp(target, h, ss(R * 0.55, R, d)); });
    campPos.set(cx, target, cz);
    spawnLook.set(spawn.x - dx * 10, 0, spawn.z - dz * 10);
  }
  function setupSpots() {
    const dx = idir.x, dz = idir.z, rx = dz, rz = -dx;
    const thr = shoreThr + 0.3;
    const C = campPos;
    const defs = [
      ['shop', C.x + rx * -9 - dx * 1, C.z + rz * -9 - dz * 1],
      ['bar', C.x + rx * -4 + dx * 4, C.z + rz * -4 + dz * 4],
      ['banhmi', C.x + rx * 3 + dx * 4.5, C.z + rz * 3 + dz * 4.5],
      ['craft', C.x + rx * 9, C.z + rz * 9],
      ['boat', spawn.x + rx * 13 + dx * 1.5, spawn.z + rz * 13 + dz * 1.5],
      ['elder', spawn.x - rx * 12 + dx * 2, spawn.z - rz * 12 + dz * 2],
    ];
    spots = defs.map(([role, x, z]) => {
      const p = ensureLand({ x, z }, idir, thr);
      const lookAt = new THREE.Vector3(spawn.x, 0, spawn.z);
      if (role === 'boat' || role === 'elder') lookAt.set(C.x, 0, C.z);
      const facing = Math.atan2(lookAt.x - p.x, lookAt.z - p.z);
      return { role, pos: new THREE.Vector3(p.x, terrainH(p.x, p.z), p.z), lookAt, facing };
    });
  }
  function setupZones(hints) {
    W.zones = [];
    (hints || []).forEach((hn) => {
      const L = Math.hypot(hn.dx, hn.dz);
      const p = march(hn.x, hn.z, hn.dx / L, hn.dz / L, shoreThr * 0.5 + 0.1);
      W.zones.push({ x: p.x, z: p.z, r: hn.r || 20, name: hn.name });
    });
  }
  function buildSpotDecor() {
    for (const s of spots) {
      const st = buildStall(s.role, 1);
      st.position.set(s.pos.x, terrainH(s.pos.x, s.pos.z), s.pos.z);
      stallColliders(s.role, s.pos.x, s.pos.z, s.facing, 1);
      st.rotation.y = s.facing;
      envRoot.add(st);
      if (s.role === 'boat') {
        // Thuyền nổi gần bờ
        const toW = { x: -idir.x, z: -idir.z };
        let bx = s.pos.x, bz = s.pos.z;
        for (let k = 0; k < 60 && terrainH(bx, bz) > -0.7; k++) { bx += toW.x; bz += toW.z; }
        bx += toW.x * 2; bz += toW.z * 2;
        const b = makeRowBoat(0x6a3a1e, 3.6);
        b.rotation.y = Math.atan2(idir.z, -idir.x);
        envRoot.add(b); addFloater(b, bx, bz, -0.25);
        // cọc buộc thuyền
        const pole = meshOf([P(new THREE.CylinderGeometry(0.08, 0.1, 3.5, 6), 0x5a3a22, [0, 0, 0])]);
        pole.position.set(bx + idir.x * 2.5 + idir.z * 1.2, -0.5, bz + idir.z * 2.5 - idir.x * 1.2);
        envRoot.add(pole);
        colC(pole.position.x, pole.position.z, 0.15);
      }
    }
  }
  function buildExclusions(extra) {
    exclusions = [{ x: spawn.x, z: spawn.z, r: 7 }, { x: campPos.x, z: campPos.z, r: 17 }];
    for (const s of spots) exclusions.push({ x: s.pos.x, z: s.pos.z, r: 4 });
    for (const z of W.zones) exclusions.push({ x: z.x, z: z.z, r: z.r + 2 });
    if (extra) exclusions = exclusions.concat(extra);
  }

  // =====================================================================
  // ENVIRONMENTS
  // =====================================================================
  const PAL = {
    forest: { grass: [0x3b6a26, 0x4f7c2c], dirt: 0x5e4a30, sand: 0x8f7f58, rock: 0x6a665e, under: 0x3a3326, snow: 0xf4f8ff, sandTop: 0.9 },
    plains: { grass: [0x5a8a2c, 0x709c34], dirt: 0x6a5435, sand: 0x9a8458, rock: 0x77705f, under: 0x4a3f2c, snow: 0xffffff, sandTop: 1.1 },
    mountain: { grass: [0x4a6a30, 0x5c7434], dirt: 0x5a4c3a, sand: 0x7a7462, rock: 0x5e5b57, under: 0x2f3236, snow: 0xf2f6fb, sandTop: 0.7, snowH: 32 },
    city: { grass: [0x47702c, 0x52782f], dirt: 0x5a5046, sand: 0x8a8478, rock: 0x6e6c68, under: 0x3a3a34, snow: 0xffffff, sandTop: 0.2 },
    island: { grass: [0x4f8a2a, 0x62a032], dirt: 0x7a6440, sand: 0xe6d3a0, rock: 0x6f645a, under: 0xcbb88a, snow: 0xffffff, sandTop: 3.0 },
  };

  // ---------------- FOREST ----------------
  function forestStreamZ(x) { return -35 + 22 * Math.sin((x - 30) * 0.017) + 7 * Math.sin(x * 0.045 + 1); }
  const ENV = {};
  ENV.forest = {
    seed: 101, water: { shallow: 0x4a8a6a, deep: 0x0c2f2a, clarity: 0.45 }, waveL: [14, 9.5, 6.6, 5.2], windBase: 1.5,
    gRange: [-8, 4], ext: 1800,
    h(x, z) {
      let h = 1.6 + 2.6 * fbm(x * 0.013 + 3, z * 0.013 - 5, 4) + 1.2 * fbm(x * 0.05, z * 0.05, 2);
      const e = Math.max(Math.abs(x), Math.abs(z));
      h += ss(120, 210, e) * (14 + 22 * fbm(x * 0.01, z * 0.01, 3));
      const dx = x, dz = z + 35, d = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
      const R = 40 + 6 * Math.sin(3 * a + 0.5) + 4 * Math.sin(5 * a + 2.1);
      h = carve(h, d, R, 6.5, 16);
      if (x > 18) {
        const ds = Math.abs(z - forestStreamZ(x));
        const hw = (3.2 + 0.8 * Math.sin(x * 0.05)) * ss(18, 30, x) + 0.01;
        h = carve(h, ds, hw, 1.5, 6);
      }
      return h;
    },
    spawnFrom: { x: 0, z: -35, dx: 0, dz: 1 },
    zones: [],
    decorate() {
      addCommonVeg({ broadleaf: 520, pine: 320, bush: 320, grass: 5200, flowers: 450, rocks: 130, reeds: 700, treeMax: 60, pineMax: 70 });
      // cây xa (ngoài vùng chơi)
      scatter(geoPine(false), treeMat(), dens(500), { area: [-480, 480, -480, 480], test: (x, z) => Math.max(Math.abs(x), Math.abs(z)) > 190, hMin: 2, sMin: 1.2, sMax: 2.2, cast: false, noEx: true });
      // bèo / lá súng trên ao
      scatter(new THREE.CylinderGeometry(0.55, 0.55, 0.03, 9), new THREE.MeshLambertMaterial({ color: 0xffffff }), 90, {
        circle: { x: 0, z: -35, r: 46 }, hMin: -2.5, hMax: -0.35, y: 0.02, sMin: 0.6, sMax: 1.4, colors: [0x3f7a2a, 0x4a8a30, 0x5a9a3a], noEx: true,
      });
      // khúc gỗ đổ
      const logs = [];
      for (let i = 0; i < 14; i++) {
        let x, z, h, k = 0;
        do { x = rr(-150, 150); z = rr(-150, 150); h = terrainH(x, z); k++; } while ((h < 1 || isExcluded(x, z, 3)) && k < 30);
        const ls = rr(0.8, 1.4), lry = rr(0, TAU);
        logs.push({ x, y: h + 0.25, z, ry: lry, rz: Math.PI / 2, s: ls });
        colB(x, z, 2 * ls, 0.36 * ls, lry, undefined, h + 0.6 * ls);
      }
      instanceList(merge([P(new THREE.CylinderGeometry(0.3, 0.35, 4, 8), 0x5a3d26), P(new THREE.CylinderGeometry(0.31, 0.31, 0.05, 8), 0xb08a5a, [0, 2.0, 0])]), vcMat(), logs.map((l) => Object.assign(l, { rx: 0 })), true);
      addFireflies(170, 0, -35, 36, 70);
      addFireflies(60, 80, forestStreamZ(80), 4, 20);
      addBirds(10, 0x3a3028, 1.2, 0, -30, 40, 90, 22, 45);
    },
  };

  // ---------------- PLAINS ----------------
  function riverZ(x) { return 28 + 16 * Math.sin(x * 0.011 + 0.6) + 5 * Math.sin(x * 0.033 + 2); }
  function riverHW(x) { return 30 + 5 * Math.sin(x * 0.021 + 1); }
  const PD = { x0: -170, z0: -150, pw: 18, pl: 14, nx: 11, nz: 6 };
  let paddyLv = null;
  function plainsBase(x, z) {
    let h = 1.7 + 1.3 * fbm(x * 0.012, z * 0.012, 3) + 0.4 * fbm(x * 0.06, z * 0.06, 2);
    h += ss(150, 240, Math.abs(z - 28)) * 12 * fbm(x * 0.01 + 7, z * 0.01, 3);
    return carve(h, Math.abs(z - riverZ(x)), riverHW(x), 7.5, 22);
  }
  function paddyCell(x, z) {
    const ix = Math.floor((x - PD.x0) / PD.pw), iz = Math.floor((z - PD.z0) / PD.pl);
    if (ix < 0 || iz < 0 || ix >= PD.nx || iz >= PD.nz) return -1;
    const i = iz * PD.nx + ix;
    return paddyLv && paddyLv[i] !== null ? i : -1;
  }
  ENV.plains = {
    seed: 202, water: { shallow: 0x8a8a5a, deep: 0x2f3a26, clarity: 0.35 }, waveL: [22, 14, 9, 6.5], windBase: 3,
    gRange: [-9, 4], ext: 2400,
    prepare() {
      paddyLv = [];
      for (let iz = 0; iz < PD.nz; iz++) for (let ix = 0; ix < PD.nx; ix++) {
        const cx = PD.x0 + (ix + 0.5) * PD.pw, cz = PD.z0 + (iz + 0.5) * PD.pl;
        const hb = plainsBase(cx, cz);
        paddyLv.push(hash2(ix * 3 + 1, iz * 5 + 2) > 0.12 && hb > 1.2 ? Math.round(hb * 3) / 3 + 0.15 : null);
      }
    },
    h(x, z) {
      const i = paddyCell(x, z);
      if (i >= 0) return paddyLv[i];
      return plainsBase(x, z);
    },
    spawnFrom: { x: 0, z: 40, dx: 0, dz: -1 },
    zones: [{ x: 95, z: 40, dx: 0, dz: -1, r: 24, name: 'Khu nuôi cá Hợp tác xã' }],
    extraEx() {
      const ex = [];
      for (let iz = 0; iz < PD.nz; iz++) for (let ix = 0; ix < PD.nx; ix++) {
        if (paddyLv[iz * PD.nx + ix] === null) continue;
        ex.push({ x: PD.x0 + (ix + 0.5) * PD.pw, z: PD.z0 + (iz + 0.5) * PD.pl, r: 10.5 });
      }
      return ex;
    },
    colorExtra(x, z, h, ny, out) {
      if (paddyCell(x, z) >= 0) { out[0] = 0.33; out[1] = 0.3; out[2] = 0.18; }
    },
    decorate() {
      // ruộng lúa: mặt nước ruộng, bờ ruộng, lúa
      const wParts = [], bParts = [], rice = [];
      for (let iz = 0; iz < PD.nz; iz++) for (let ix = 0; ix < PD.nx; ix++) {
        const L = paddyLv[iz * PD.nx + ix]; if (L === null) continue;
        const cx = PD.x0 + (ix + 0.5) * PD.pw, cz = PD.z0 + (iz + 0.5) * PD.pl;
        wParts.push(P(new THREE.PlaneGeometry(PD.pw - 1.0, PD.pl - 1.0), 0xffffff, [cx, L + 0.08, cz], [-Math.PI / 2, 0, 0]));
        bParts.push(P(new THREE.BoxGeometry(PD.pw, 0.32, 0.7), 0x6a6a34, [cx, L + 0.1, cz - PD.pl / 2 + 0.35]));
        bParts.push(P(new THREE.BoxGeometry(PD.pw, 0.32, 0.7), 0x6a6a34, [cx, L + 0.1, cz + PD.pl / 2 - 0.35]));
        bParts.push(P(new THREE.BoxGeometry(0.7, 0.32, PD.pl), 0x6a6a34, [cx - PD.pw / 2 + 0.35, L + 0.1, cz]));
        bParts.push(P(new THREE.BoxGeometry(0.7, 0.32, PD.pl), 0x6a6a34, [cx + PD.pw / 2 - 0.35, L + 0.1, cz]));
        const ripe = hash2(ix, iz + 40) > 0.65;
        for (let a = 0; a < 8; a++) for (let b = 0; b < 6; b++) {
          rice.push({ x: cx - PD.pw / 2 + 1.6 + a * (PD.pw - 3.2) / 7 + rr(-0.2, 0.2), y: L, z: cz - PD.pl / 2 + 1.6 + b * (PD.pl - 3.2) / 5 + rr(-0.2, 0.2), ry: rr(0, TAU), s: rr(0.85, 1.15), color: ripe ? 0xffe08a : 0xffffff });
        }
      }
      if (wParts.length) {
        const wm = new THREE.Mesh(merge(wParts), new THREE.MeshStandardMaterial({ color: 0x6a8a92, roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.8 }));
        wm.receiveShadow = true; envRoot.add(wm);
        envRoot.add(meshOf(bParts, vcMat(), false, true));
        instanceList(geoTuft(10, 0.6, 1.0, 0.035, 0x3a6a1a, 0x9acb4a, 31), grassMat(), rice, false);
      }
      addCommonVeg({ broadleaf: 160, bamboo: 140, palms: 70, palmMin: 1.0, bush: 200, grass: 4200, flowers: 300, rocks: 40, reeds: 900, treeMax: 30 });
      // Nhà làng
      const houses = [];
      for (let i = 0; i < 10; i++) {
        let x, z, h, k = 0;
        do { x = rr(-180, 180); z = rr(-190, -20); h = terrainH(x, z); k++; } while ((h < 1.2 || isExcluded(x, z, 6) || normalY(x, z) < 0.95 || paddyCell(x, z) >= 0 || paddyCell(x + 5, z + 5) >= 0 || paddyCell(x - 5, z - 5) >= 0) && k < 60);
        if (k >= 60) continue;
        const ry = rr(0, TAU);
        const parts = [
          P(new THREE.BoxGeometry(6, 3, 4.5), 0xe8dcc0, [0, 1.5, 0]),
          P(new THREE.CylinderGeometry(3.2, 3.2, 6.6, 3), 0xa84a2a, [0, 3.8, 0], [0, 0, Math.PI / 2], [1, 1, 0.85]),
          P(new THREE.BoxGeometry(1.0, 1.8, 0.1), 0x4a2a1a, [0, 0.9, 2.27]),
          P(new THREE.BoxGeometry(0.9, 0.7, 0.1), 0x2a3a4a, [-1.8, 1.7, 2.27]), P(new THREE.BoxGeometry(0.9, 0.7, 0.1), 0x2a3a4a, [1.8, 1.7, 2.27]),
        ];
        const m = meshOf(parts); m.position.set(x, h - 0.1, z); m.rotation.y = ry; envRoot.add(m);
        exclusions.push({ x, z, r: 6 });
        houses.push({ x, z });
        colB(x, z, 3.05, 2.3, ry);
      }
      // Lồng bè nuôi cá trong khu quản lý
      const zn = W.zones[0];
      if (zn) {
        for (let i = 0; i < 4; i++) {
          const cx = zn.x + (i % 2 ? 4 : -4), cz = zn.z + 12 + Math.floor(i / 2) * 9;
          const parts = [];
          for (const s of [-1, 1]) { parts.push(P(new THREE.CylinderGeometry(0.18, 0.18, 7, 6), 0x2a2a2a, [3.5 * s, 0.15, 0], [Math.PI / 2, 0, 0])); parts.push(P(new THREE.CylinderGeometry(0.18, 0.18, 7, 6), 0x2a2a2a, [0, 0.15, 3.5 * s], [0, 0, Math.PI / 2])); }
          parts.push(P(new THREE.BoxGeometry(7, 0.06, 0.5), 0x9a7a50, [0, 0.4, 3.3])); parts.push(P(new THREE.BoxGeometry(0.5, 0.06, 7), 0x9a7a50, [3.3, 0.4, 0]));
          for (let k = 0; k < 4; k++) parts.push(P(new THREE.BoxGeometry(0.45, 0.45, 0.45), 0x3a6ad0, [(k % 2 ? 3.5 : -3.5), 0.1, (k < 2 ? 3.5 : -3.5)]));
          const cage = meshOf(parts);
          const net = new THREE.Mesh(new THREE.BoxGeometry(6.8, 2.5, 6.8, 1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x223322, wireframe: true, transparent: true, opacity: 0.35 }));
          net.position.y = -1.1; cage.add(net);
          envRoot.add(cage); addFloater(cage, cx, cz, 0, 0.4);
        }
        // chòi canh
        const hx_ = zn.x - idir.x * 10, hz_ = zn.z - idir.z * 10;
        const gy = terrainH(hx_, hz_);
        const hut = meshOf([
          ...[[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].map((p) => P(new THREE.CylinderGeometry(0.1, 0.12, 3, 6), 0x5a3a22, [p[0], 1.5, p[1]])),
          P(new THREE.BoxGeometry(2.8, 0.15, 2.8), 0x8a6a40, [0, 1.6, 0]),
          P(new THREE.ConeGeometry(2.4, 1.6, 4), 0xc8b070, [0, 4.0, 0], [0, Math.PI / 4, 0]),
        ]);
        hut.position.set(hx_, gy, hz_); envRoot.add(hut);
        for (const p of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) colC(hx_ + p[0], hz_ + p[1], 0.15);
      }
      addFireflies(80, spawn.x, spawn.z - 20, 10, 60);
      addBirds(12, 0xf0f0f0, 1.3, 0, -60, 40, 110, 15, 35);
    },
  };

  // ---------------- MOUNTAIN ----------------
  ENV.mountain = {
    seed: 303, water: { shallow: 0x3f8f9a, deep: 0x031a30, clarity: 0.16 }, waveL: [26, 16, 10, 7], windBase: 4,
    gRange: [-48, 4], ext: 2000,
    h(x, z) {
      const dx = x, dz = z + 50, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
      const south = Math.max(0, dz / (r + 1e-3));
      const ringStart = 92 + 50 * south * south;
      let h = 2.5 + 2.5 * fbm(x * 0.02, z * 0.02, 3);
      const m = ss(ringStart, ringStart + 90, r);
      h += m * (25 + 75 * ridged(x * 0.008 + 5, z * 0.008 - 3, 5));
      h += ss(150, 300, Math.hypot(x, z)) * 40 * (0.5 + ridged(x * 0.004, z * 0.004, 3));
      const R = 72 + 9 * Math.sin(3 * a + 1) + 6 * Math.sin(7 * a + 2);
      return carve(h, r, R, 45, 18);
    },
    spawnFrom: { x: 0, z: -50, dx: 0, dz: 1 },
    zones: [{ x: -30, z: -50, dx: -1, dz: 0, r: 20, name: 'Khu bảo tồn cá hồi' }],
    decorate() {
      addCommonVeg({ pine: 900, snowPine: 350, snowPineMin: 24, bush: 120, grass: 3200, flowers: 220, rocks: 320, reeds: 160, pineMax: 26, treeMax: 22, rockColors: [0xffffff, 0xd0d4d8, 0xb8bcc0] });
      scatter(geoPine(true), treeMat(), dens(600), { area: [-600, 600, -600, 600], test: (x, z) => Math.max(Math.abs(x), Math.abs(z)) > 190, hMin: 10, hMax: 70, sMin: 1.4, sMax: 2.6, noEx: true });
      addMist(14, 0, -50, 70, 2.5, 9);
      // cabin gỗ
      const cx = campPos.x + idir.z * 22, cz = campPos.z - idir.x * 22;
      const gy = terrainH(cx, cz);
      const parts = [];
      for (let i = 0; i < 7; i++) {
        parts.push(P(new THREE.CylinderGeometry(0.22, 0.22, 6.4, 7), i % 2 ? 0x6a4a2e : 0x5a3e26, [0, 0.22 + i * 0.42, -2.2], [0, 0, Math.PI / 2]));
        parts.push(P(new THREE.CylinderGeometry(0.22, 0.22, 6.4, 7), i % 2 ? 0x6a4a2e : 0x5a3e26, [0, 0.22 + i * 0.42, 2.2], [0, 0, Math.PI / 2]));
        parts.push(P(new THREE.CylinderGeometry(0.22, 0.22, 4.8, 7), i % 2 ? 0x5a3e26 : 0x6a4a2e, [-3, 0.22 + i * 0.42, 0], [Math.PI / 2, 0, 0]));
        parts.push(P(new THREE.CylinderGeometry(0.22, 0.22, 4.8, 7), i % 2 ? 0x5a3e26 : 0x6a4a2e, [3, 0.22 + i * 0.42, 0], [Math.PI / 2, 0, 0]));
      }
      parts.push(P(new THREE.BoxGeometry(7.2, 0.2, 3.3), 0x3a2a22, [0, 3.85, -1.3], [0.62, 0, 0]));
      parts.push(P(new THREE.BoxGeometry(7.2, 0.2, 3.3), 0x3a2a22, [0, 3.85, 1.3], [-0.62, 0, 0]));
      parts.push(P(new THREE.BoxGeometry(7.0, 0.12, 2.9), 0xf0f4f8, [0, 4.0, -1.25], [0.62, 0, 0]));
      parts.push(P(new THREE.BoxGeometry(7.0, 0.12, 2.9), 0xf0f4f8, [0, 4.0, 1.25], [-0.62, 0, 0]));
      parts.push(P(new THREE.BoxGeometry(0.7, 2.5, 0.7), 0x6a6460, [2.2, 4.2, -0.8]));
      const cab = meshOf(parts); cab.position.set(cx, gy, cz); cab.rotation.y = Math.atan2(idir.x, idir.z) + Math.PI / 2; envRoot.add(cab);
      colB(cx, cz, 3.25, 2.45, cab.rotation.y);
      const win = glowMesh([P(new THREE.BoxGeometry(0.9, 0.7, 0.1), 0xffc870, [-1.2, 1.5, 2.45]), P(new THREE.BoxGeometry(0.9, 0.7, 0.1), 0xffc870, [1.2, 1.5, 2.45])]);
      win.position.copy(cab.position); win.rotation.copy(cab.rotation); envRoot.add(win);
      nightMats.push({ mesh: win });
      exclusions.push({ x: cx, z: cz, r: 6 });
      addBirds(4, 0x2a2018, 2.4, 0, -50, 60, 120, 50, 90);
    },
  };

  // ---------------- CITY ----------------
  const CANAL_Z = 40, CANAL_HW = 12.5;
  const LAKE = { x: -60, z: -70 };
  function cityRoad(x, z) {
    return Math.abs(z) < 5 || Math.abs(z - 85) < 5 || Math.abs(z + 140) < 5 || Math.abs(x - 60) < 5 || Math.abs(x + 115) < 5 || Math.abs(x - 150) < 5;
  }
  ENV.city = {
    seed: 404, water: { shallow: 0x4f7268, deep: 0x16302c, clarity: 0.4 }, waveL: [16, 10, 7, 5.5], windBase: 2.5,
    gRange: [-7, 4], ext: 2200,
    h(x, z) {
      let h = 1.2;
      const ds = Math.abs(z - CANAL_Z);
      if (ds < CANAL_HW - 0.1) h = -0.8 - 3.4 * (1 - Math.pow(ds / CANAL_HW, 6));
      const dx = x - LAKE.x, dz = z - LAKE.z, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
      const R = 46 + 5 * Math.sin(3 * a + 0.4);
      if (r < R + 8) h = Math.min(h, carve(1.2, r, R, 5.5, 6));
      return h;
    },
    spawnFrom: { x: 20, z: CANAL_Z, dx: 0, dz: -1 },
    zones: [
      { x: 125, z: CANAL_Z, dx: 0, dz: -1, r: 18, name: 'Bến thuyền rồng' },
      { x: -135, z: CANAL_Z, dx: 0, dz: 1, r: 18, name: 'Kênh cảnh quan' },
      { x: LAKE.x, z: LAKE.z, dx: 1, dz: 0.15, r: 18, name: 'Hồ điều hòa' },
    ],
    colorExtra(x, z, h, ny, out) {
      if (h < 0.9) { if (h > -1.5) { out[0] = 0.42; out[1] = 0.4; out[2] = 0.37; } return; }
      const lakeD = Math.hypot(x - LAKE.x, z - LAKE.z);
      const park = lakeD < 75 || vnoise(x * 0.02 + 9, z * 0.02) > 0.72;
      const ds = Math.abs(z - CANAL_Z);
      if (cityRoad(x, z)) { out[0] = 0.17; out[1] = 0.17; out[2] = 0.19; }
      else if (ds < 18) { const t = (Math.floor(x / 2.5) + Math.floor(z / 2.5)) & 1; out[0] = out[1] = out[2] = t ? 0.56 : 0.5; out[2] -= 0.03; }
      else if (!park) { out[0] = 0.48; out[1] = 0.47; out[2] = 0.45; }
    },
    decorate() {
      // Kè kênh
      const wall = [];
      for (const side of [-1, 1]) {
        const zz = CANAL_Z + side * (CANAL_HW - 0.15);
        wall.push(P(new THREE.BoxGeometry(2000, 5.6, 0.5), 0x7d7a72, [0, -1.55, zz]));
        wall.push(P(new THREE.BoxGeometry(2000, 0.25, 1.0), 0x9a968c, [0, 1.25, zz + side * 0.3]));
      }
      envRoot.add(meshOf(wall, vcMat({ roughness: 0.9 }), false, true));
      // Đường viền đá hồ
      const lakeRim = [];
      for (let i = 0; i < 64; i++) {
        const a = i / 64 * TAU, R = 46 + 5 * Math.sin(3 * a + 0.4) + 3.5;
        lakeRim.push(P(new THREE.BoxGeometry(5.0, 0.35, 0.8), 0x9a968c, [LAKE.x + Math.cos(a) * R, 1.3, LAKE.z + Math.sin(a) * R], [0, -a + Math.PI / 2, 0]));
      }
      envRoot.add(meshOf(lakeRim, vcMat(), false, true));
      // Cầu
      const bx = -40;
      addPlatform(bx, CANAL_Z, 0, 2.8, 16.5, 1.45);
      const br = [P(new THREE.BoxGeometry(6, 0.4, 33), 0x9a8a78, [bx, 1.25, CANAL_Z])];
      for (const s of [-1, 1]) {
        br.push(P(new THREE.BoxGeometry(0.25, 1.0, 33), 0xb8b0a0, [bx + s * 2.9, 1.95, CANAL_Z]));
        colB(bx + s * 2.9, CANAL_Z, 0.18, 16.5, 0, 1.2, 2.6);
        br.push(P(new THREE.TorusGeometry(12.2, 0.45, 8, 24, Math.PI), 0x8a7a68, [bx + s * 2.6, -10.9, CANAL_Z], [0, Math.PI / 2, 0]));
        for (let k = -3; k <= 3; k++) br.push(P(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 6), 0x7a6a58, [bx + s * 2.9, 1.95, CANAL_Z + k * 5]));
      }
      envRoot.add(meshOf(br));
      exclusions.push({ x: bx, z: CANAL_Z - 18, r: 6 }, { x: bx, z: CANAL_Z + 18, r: 6 });
      // Nhà cao tầng
      buildCityBuildings();
      // Đèn đường
      const poles = [], bulbs = [], glowPos = [];
      for (const side of [-1, 1]) {
        const zz = CANAL_Z + side * (CANAL_HW + 1.2);
        for (let x = -190; x <= 190; x += 16) {
          if (Math.abs(x - bx) < 5) continue;
          poles.push(P(new THREE.CylinderGeometry(0.07, 0.1, 5, 6), 0x2a2e33, [x, 1.2 + 2.5, zz]));
          colC(x, zz, 0.16);
          poles.push(P(new THREE.BoxGeometry(0.08, 0.08, 1.2), 0x2a2e33, [x, 1.2 + 5, zz - side * 0.5]));
          bulbs.push(P(new THREE.SphereGeometry(0.22, 8, 6), 0xffe0a0, [x, 1.2 + 4.85, zz - side * 1.05]));
          glowPos.push([x, 1.2 + 4.8, zz - side * 1.05]);
        }
      }
      envRoot.add(meshOf(poles));
      const bulbMesh = glowMesh(bulbs); envRoot.add(bulbMesh); nightMats.push({ mesh: bulbMesh });
      const glows = billboards(glowTex(), glowPos.map((p) => ({ x: p[0], y: p[1], z: p[2], w: 4, h: 4 })), { color: 0xffcf7a, additive: true, opacity: 0, toneMapped: false, renderOrder: 5 });
      envRoot.add(glows);
      nightSprites.push({ set: glows.userData.setOpacity, max: 0.9 });
      // mỗi cột đèn là 1 đèn ảo; G.gfx chỉ bật vài đèn thật gần camera nhất
      for (const p of glowPos) {
        const L = addLight(envRoot, p[0], p[1] - 0.4, p[2], 0xffc878, 0, 24);
        nightLights.push({ light: L, max: 1.2 });
      }
      // cây công viên + ghế
      addCommonVeg({ broadleaf: 160, bush: 140, grass: 1500, flowers: 150, treeMax: 3, leafTint: [0x2f7a2a, 0x3f8a32, 0x2a6a24], grassCircle: { x: LAKE.x, z: LAKE.z, r: 80 } });
      const benches = [];
      for (let x = -180; x <= 180; x += 24) for (const side of [-1, 1]) {
        if (Math.abs(x - bx) < 8 || Math.abs(x - spawn.x) < 4) continue;
        benches.push({ x: x + 8, y: 1.2, z: CANAL_Z + side * (CANAL_HW + 4.2), ry: side > 0 ? Math.PI : 0 });
        colB(x + 8, CANAL_Z + side * (CANAL_HW + 4.2), 0.92, 0.28, 0, undefined, 1.9);
      }
      instanceList(merge([
        P(new THREE.BoxGeometry(1.8, 0.08, 0.5), 0x8a5a32, [0, 0.45, 0]), P(new THREE.BoxGeometry(1.8, 0.4, 0.06), 0x8a5a32, [0, 0.7, -0.24]),
        P(new THREE.BoxGeometry(0.08, 0.45, 0.45), 0x2a2a2a, [-0.8, 0.22, 0]), P(new THREE.BoxGeometry(0.08, 0.45, 0.45), 0x2a2a2a, [0.8, 0.22, 0]),
      ]), vcMat(), benches, true);
      // thuyền rồng neo trong khu quản lý
      const zn = W.zones[0];
      if (zn) for (let i = 0; i < 2; i++) {
        const b = makeRowBoat(i ? 0xc8302a : 0xd8a020, 7); b.rotation.y = Math.PI / 2;
        envRoot.add(b); addFloater(b, zn.x - 6 + i * 12, CANAL_Z - 3 + i * 5, -0.3, 0.5);
      }
      addBirds(8, 0x555560, 0.9, 0, 20, 30, 80, 25, 50);
    },
  };
  function windowTex(seed, wallHex, litP) {
    const r = mulberry32(seed);
    const c = makeCanvas(256, 512), e = makeCanvas(256, 512);
    const x = c.getContext('2d'), y = e.getContext('2d');
    x.fillStyle = wallHex; x.fillRect(0, 0, 256, 512);
    y.fillStyle = '#000'; y.fillRect(0, 0, 256, 512);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) {
      const wx = col * 64 + 12, wy = row * 64 + 14;
      x.fillStyle = '#1e2a38'; x.fillRect(wx, wy, 40, 38);
      x.fillStyle = 'rgba(160,200,230,0.35)'; x.fillRect(wx, wy, 40, 10);
      if (r() < litP) { y.fillStyle = r() < 0.7 ? '#ffd890' : '#cfe6ff'; y.fillRect(wx + 2, wy + 2, 36, 34); }
    }
    x.fillStyle = 'rgba(0,0,0,0.12)'; for (let row = 0; row < 8; row++) x.fillRect(0, row * 64 + 58, 256, 4);
    const t1 = texOf(c), t2 = texOf(e);
    t1.wrapS = t1.wrapT = t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
    return [t1, t2];
  }
  function buildCityBuildings() {
    const variants = [['#d8d0c0', 0.4], ['#a8b4c0', 0.35], ['#c89a7a', 0.45], ['#8a9aa8', 0.3]];
    const mats = variants.map((v, i) => {
      const [m, e] = windowTex(500 + i, v[0], v[1]);
      const mat = new THREE.MeshStandardMaterial({ map: m, emissiveMap: e, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.75, metalness: 0.1 });
      nightMats.push({ mat, max: 1.3 });
      return mat;
    });
    const lists = [[], [], [], []];
    function addB(x, z, w, d, h, gy) {
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv;
      const off = Math.floor(rng() * 4) * 0.25, offV = Math.floor(rng() * 8) * 0.125;
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        if (f === 2 || f === 3) { uv.setXY(i, 0.02, 0.99); continue; }
        const fw = f < 2 ? d : w;
        uv.setXY(i, uv.getX(i) * fw / 16 + off, uv.getY(i) * h / 28 + offV);
      }
      const vi = Math.floor(rng() * 4);
      lists[vi].push(P(g, 0xffffff, [x, gy + h / 2, z]));
      lists[vi].push(P(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), 0xffffff, [x, gy + h + 0.25, z]));
    }
    for (let gx = -182; gx <= 182; gx += 26) for (let gz = -182; gz <= 182; gz += 26) {
      const x = gx + rr(-3, 3), z = gz + rr(-3, 3);
      const w = rr(11, 19), d = rr(11, 19);
      let bad = false;
      for (const c of [[0, 0], [w / 2 + 2, d / 2 + 2], [-w / 2 - 2, d / 2 + 2], [w / 2 + 2, -d / 2 - 2], [-w / 2 - 2, -d / 2 - 2]]) {
        const px = x + c[0], pz = z + c[1];
        if (terrainH(px, pz) < 1.0 || cityRoad(px, pz) || Math.abs(pz - CANAL_Z) < 20 || Math.hypot(px - LAKE.x, pz - LAKE.z) < 62 || isExcluded(px, pz, 6)) { bad = true; break; }
      }
      if (bad || rng() < 0.12) continue;
      const far = Math.hypot(x - spawn.x, z - spawn.z);
      addB(x, z, w, d, rr(9, 22) + ss(40, 180, far) * rr(10, 45), 1.2);
      exclusions.push({ x, z, r: Math.max(w, d) * 0.75 });
      colB(x, z, w / 2 + 0.2, d / 2 + 0.2, 0);
    }
    // skyline xa
    for (let i = 0; i < 70; i++) {
      const a = rng() * TAU, r = rr(240, 700);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(z - CANAL_Z) < 40) continue;
      addB(x, z, rr(20, 45), rr(20, 45), rr(40, 160), 1.2);
    }
    lists.forEach((l, i) => { if (l.length) { const m = new THREE.Mesh(merge(l), mats[i]); m.castShadow = true; m.receiveShadow = true; envRoot.add(m); } });
  }

  // ---------------- ISLAND ----------------
  function islandR(a) { return 100 + 14 * Math.sin(2 * a + 0.3) + 7 * Math.sin(5 * a + 1.1); }
  ENV.island = {
    seed: 505, water: { shallow: 0x2fd6c8, deep: 0x003a6e, clarity: 0.12 }, waveL: [34, 21, 13, 8.5], windBase: 6,
    gRange: [-40, 4], ext: 3000,
    h(x, z) {
      const r = Math.hypot(x, z), a = Math.atan2(z, x), R = islandR(a);
      let h;
      const din = R - r;
      if (din > 0) {
        h = din < 25 ? din * 0.13 : 3.25 + (din - 25) * 0.05;
        h += 16 * Math.exp(-((x + 15) * (x + 15) + (z + 20) * (z + 20)) / 1800) * (0.7 + 0.6 * fbm(x * 0.03, z * 0.03, 3));
        h += 1.5 * fbm(x * 0.04, z * 0.04, 3) * ss(0, 30, din);
      } else {
        h = din * 0.12 - 30 * ss(15, 110, -din) - 2 * fbm(x * 0.02, z * 0.02, 2);
      }
      h += 10 * Math.exp(-((x - 115) * (x - 115) + (z - 5) * (z - 5)) / 320);
      return h;
    },
    spawnFrom: { x: 0, z: 190, dx: 0, dz: -1 },
    zones: [{ x: -190, z: 10, dx: 1, dz: 0, r: 22, name: 'Khu bảo tồn san hô' }],
    prepareSpawn() {
      // cầu tàu gỗ cạnh spawn, đi ra biển
      const px = spawn.x + 6;
      let sz = spawn.z;
      for (let k = 0; k < 40 && hFinal(px, sz) < 3.3; k++) sz -= 1;
      const len = 64, cz = sz + len / 2 - 1;
      addPlatform(px, cz, 0, 1.6, len / 2, 3.525);
      this._pier = { x: px, z0: sz - 1, len, cz };
    },
    decorate() {
      const pr = this._pier;
      const parts = [P(new THREE.BoxGeometry(3.2, 0.25, pr.len), 0x9a7a52, [pr.x, 3.4, pr.cz])];
      for (let z = pr.z0 + 2; z < pr.z0 + pr.len; z += 4) for (const s of [-1, 1]) {
        parts.push(P(new THREE.CylinderGeometry(0.16, 0.18, 12, 7), 0x5a4030, [pr.x + s * 1.45, -2.5, z]));
        colC(pr.x + s * 1.45, z, 0.22, undefined, 3.25);   // cọc cầu tàu: chỉ chắn người bơi bên dưới
      }
      for (let k = 0; k < pr.len; k += 1) parts.push(P(new THREE.BoxGeometry(3.3, 0.04, 0.08), 0x6a5038, [pr.x, 3.53, pr.z0 + k]));
      parts.push(P(new THREE.CylinderGeometry(0.08, 0.1, 3.5, 6), 0x2a2a2a, [pr.x + 1.4, 5.2, pr.z0 + pr.len - 1]));
      envRoot.add(meshOf(parts));
      const lampG = glowMesh([P(new THREE.SphereGeometry(0.25, 8, 6), 0xffe0a0, [pr.x + 1.4, 7.0, pr.z0 + pr.len - 1])]);
      envRoot.add(lampG); nightMats.push({ mesh: lampG });
      const pl = addLight(envRoot, pr.x + 1.4, 6.8, pr.z0 + pr.len - 1.5, 0xffd090, 0, 22);
      nightLights.push({ light: pl, max: 1.5 });
      exclusions.push({ x: pr.x, z: pr.cz, r: 4 });
      // Hải đăng
      const lx = 116, lz = 5, ly = terrainH(lx, lz);
      const lh = [];
      for (let i = 0; i < 7; i++) lh.push(P(new THREE.CylinderGeometry(2.1 - (i + 1) * 0.12, 2.1 - i * 0.12, 2.5, 16), i % 2 ? 0xffffff : 0xd02020, [0, 1.25 + i * 2.5, 0]));
      lh.push(P(new THREE.CylinderGeometry(1.8, 1.8, 0.3, 16), 0x333333, [0, 17.65, 0]));
      lh.push(P(new THREE.ConeGeometry(1.3, 1.6, 16), 0xd02020, [0, 20.4, 0]));
      lh.push(P(new THREE.CylinderGeometry(2.6, 3.0, 1.2, 12), 0x8a8478, [0, 0.0, 0]));
      const lhm = meshOf(lh); lhm.position.set(lx, ly, lz); envRoot.add(lhm);
      colC(lx, lz, 2.7);
      colC(pr.x + 1.4, pr.z0 + pr.len - 1, 0.14);
      const lamp = glowMesh([P(new THREE.CylinderGeometry(1.0, 1.0, 1.6, 12), 0xfff0b0, [0, 18.8, 0])]);
      lamp.position.copy(lhm.position); envRoot.add(lamp); nightMats.push({ mesh: lamp });
      const beamG = new THREE.ConeGeometry(5, 80, 20, 1, true); beamG.translate(0, -40, 0); beamG.rotateX(-Math.PI / 2);
      const beamM = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const beam = new THREE.Group(); beam.position.set(lx, ly + 18.8, lz);
      const b1 = new THREE.Mesh(beamG, beamM), b2 = new THREE.Mesh(beamG, beamM); b2.rotation.y = Math.PI;
      beam.add(b1, b2); envRoot.add(beam);
      nightSprites.push({ mat: beamM, max: 0.16 });
      envUpd.push((dt) => { beam.rotation.y += dt * 0.7; });
      exclusions.push({ x: lx, z: lz, r: 5 });
      addCommonVeg({ palms: 260, palmMin: 2.0, palmMax: 9, broadleaf: 110, bush: 220, grass: 2600, flowers: 200, rocks: 160, treeMax: 40, grassBase: 0x3a6a1a, grassTip: 0x9ac850,
        grassCircle: { x: 0, z: 0, r: 95 }, rockColors: [0xffffff, 0xc8c0b0, 0x9a948a] });
      // dù bãi biển
      const um = [];
      for (let i = 0; i < 5; i++) {
        let x, z, h, k = 0;
        do { const a = rr(0.8, 2.4), r = islandR(a) - rr(14, 22); x = Math.cos(a) * r; z = Math.sin(a) * r; h = terrainH(x, z); k++; } while ((h < 2.2 || isExcluded(x, z, 2)) && k < 30);
        um.push(P(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 5), 0xdddddd, [x, h + 1.3, z]));
        colC(x, z, 0.1); colB(x + 1.2, z, 0.35, 0.9, 0, undefined, h + 0.45);
        um.push(P(new THREE.ConeGeometry(1.7, 0.6, 8), [0xff4a4a, 0x2a8aff, 0xffd02a, 0x2ac87a][i % 4], [x, h + 2.6, z]));
        um.push(P(new THREE.BoxGeometry(0.7, 0.1, 1.8), 0xffffff, [x + 1.2, h + 0.3, z]));
      }
      envRoot.add(meshOf(um));
      addBirds(14, 0xf4f4f4, 1.6, 0, 40, 70, 160, 12, 40);
    },
  };

  // ---------------- AIRPLANE ----------------
  ENV.airplane = {
    seed: 606, water: { shallow: 0x1a6a8a, deep: 0x02254a, clarity: 0.08 }, waveL: [40, 24, 15, 9.5], windBase: 10,
    gRange: [-100, 4], ext: 3000, custom: true,
    h() { return -100; },
    build() {
      const grp = new THREE.Group(); grp.position.set(0, 120, 0);
      const BODY = 0x6f7a66, DARK = 0x4a5446, METAL = 0x9aa0a6, FLOOR = 0x3a3c3e;
      const R = 3.6;
      const outer = [];
      const cyl = (rt, rb, len, ts, tl) => new THREE.CylinderGeometry(rt, rb, len, 28, 1, true, ts, tl);
      outer.push(P(cyl(R, R, 15), BODY, [0, 0, -7.5], [Math.PI / 2, 0, 0]));
      outer.push(P(cyl(R, R, 13, Math.PI / 2 + 0.5, Math.PI - 1.0), BODY, [0, 0, 6.5], [Math.PI / 2, 0, 0]));
      outer.push(P(cyl(R, R, 13, 1.5 * Math.PI + 0.5, Math.PI - 1.0), BODY, [0, 0, 6.5], [Math.PI / 2, 0, 0]));
      outer.push(P(cyl(1.4, R, 11, Math.PI / 2, Math.PI), BODY, [0, 0.4, 18.5], [Math.PI / 2, 0, 0]));
      outer.push(P(new THREE.SphereGeometry(R, 28, 10, 0, TAU, 0, Math.PI / 2), BODY, [0, 0, -15], [-Math.PI / 2, 0, 0], [1, 1.5, 1]));
      outer.push(P(new THREE.BoxGeometry(2.4, 0.7, 1.5), 0x1a2228, [0, 1.6, -19.2], [-0.5, 0, 0]));
      // ribs nội thất
      for (let z = -13; z <= 12; z += 2.5) outer.push(P(new THREE.TorusGeometry(R - 0.08, 0.07, 4, 28, Math.PI * 0.9), DARK, [0, 0, z], [0, 0, 0.05 * Math.PI]));
      // sàn + dốc sau
      outer.push(P(new THREE.BoxGeometry(6.0, 0.2, 27), FLOOR, [0, -2.1, -0.5]));
      for (let z = -13; z < 13; z += 1.0) outer.push(P(new THREE.BoxGeometry(5.6, 0.03, 0.12), 0x55585a, [0, -1.99, z]));
      outer.push(P(new THREE.BoxGeometry(5.6, 0.2, 5.4), 0x4a4c4e, [0, -2.1, 15.7]));
      outer.push(P(new THREE.BoxGeometry(5.6, 0.04, 0.3), 0xe8c020, [0, -1.98, 18.2]));
      for (const s of [-1, 1]) outer.push(P(new THREE.BoxGeometry(0.15, 0.6, 5.4), DARK, [s * 2.85, -1.75, 15.7]));
      // cánh + động cơ
      outer.push(P(new THREE.BoxGeometry(44, 0.5, 5.5), BODY, [0, 3.5, -3]));
      outer.push(P(new THREE.BoxGeometry(44, 0.1, 1.2), 0xc8c8c8, [0, 3.78, -5.4]));
      const props = [];
      for (const ex of [-13.5, -7, 7, 13.5]) {
        outer.push(P(new THREE.CylinderGeometry(0.95, 0.85, 5, 12), METAL, [ex, 2.6, -4.6], [Math.PI / 2, 0, 0]));
        outer.push(P(new THREE.ConeGeometry(0.6, 1.0, 12), 0x2a2a2a, [ex, 2.6, -7.5], [-Math.PI / 2, 0, 0]));
        const pg = new THREE.Group(); pg.position.set(ex, 2.6, -7.9);
        const bl = [];
        for (let k = 0; k < 4; k++) bl.push(P(new THREE.BoxGeometry(0.28, 3.4, 0.06), 0x1a1a1a, [0, 0, 0], [0, 0, k * Math.PI / 2], null));
        pg.add(meshOf(bl));
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1.75, 24), new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
        pg.add(disc);
        grp.add(pg); props.push(pg);
      }
      // đuôi
      outer.push(P(new THREE.BoxGeometry(0.4, 7.5, 5), BODY, [0, 5.0, 21.5], [-0.35, 0, 0]));
      outer.push(P(new THREE.BoxGeometry(15, 0.3, 3.6), BODY, [0, 2.2, 22]));
      outer.push(P(new THREE.BoxGeometry(0.42, 1.2, 1.2), 0xd02020, [0, 7.0, 23.0], [-0.35, 0, 0]));
      // hàng ghế, thùng hàng trong khoang
      for (const s of [-1, 1]) {
        outer.push(P(new THREE.BoxGeometry(0.5, 0.1, 9), 0x5a6a5a, [s * 2.7, -1.45, -7]));
        outer.push(P(new THREE.BoxGeometry(0.1, 0.8, 9), 0x5a6a5a, [s * 3.0, -1.0, -7]));
      }
      outer.push(P(new THREE.BoxGeometry(1.6, 1.4, 1.4), 0x7a5a32, [-1.6, -1.3, -12.6]));
      outer.push(P(new THREE.BoxGeometry(1.4, 1.0, 1.2), 0x6a4a2a, [-1.6, -0.1, -12.6]));
      outer.push(P(new THREE.BoxGeometry(1.6, 1.6, 1.5), 0x55603a, [1.5, -1.2, -12.6]));
      const hull = meshOf(outer, vcMat({ side: THREE.DoubleSide, roughness: 0.6, metalness: 0.25 }));
      grp.add(hull);
      // Collider khoang: vách thân, mũi, ghế dọc vách, thùng hàng. Dốc sau (z > 18.4) để mở → có thể rơi khỏi máy bay.
      const PY0 = 110, PY1 = 130;
      for (const sx of [-1, 1]) {
        colB(sx * 3.1, 2.0, 0.2, 16.5, 0, PY0, PY1);            // vách hông z -14.5 … 18.5
        colB(sx * 2.72, -7, 0.3, 4.5, 0, PY0, PY1);             // hàng ghế
      }
      colB(0, -14.4, 3.2, 0.3, 0, PY0, PY1);                    // vách mũi
      colB(-1.6, -12.6, 0.82, 0.72, 0, PY0, PY1);               // thùng gỗ
      colB(1.5, -12.6, 0.82, 0.77, 0, PY0, PY1);                // thùng quân dụng
      // đèn khoang
      const lights = glowMesh([
        P(new THREE.BoxGeometry(0.2, 0.06, 20), 0xfff0d0, [0, R - 0.15, -2]),
        P(new THREE.SphereGeometry(0.15, 8, 6), 0xff3030, [-1.5, 2.6, 12.6]), P(new THREE.SphereGeometry(0.15, 8, 6), 0x30ff60, [1.5, 2.6, 12.6]),
      ]);
      grp.add(lights);
      addLight(grp, 0, 2.6, -3, 0xfff0d8, 1.0, 30);
      addLight(grp, 0, 2.4, 11, 0xfff0d8, 0.6, 18);
      // biển hiệu
      const s1 = makeSign(['CỬA SAU MỞ', 'Thắt dây an toàn khi câu!'], { w: 2.4, h: 0.7, post: 0, bg: '#ffe24a', fg: '#222' });
      s1.position.set(0, 0.9, 12.6); s1.rotation.y = Math.PI; grp.add(s1);
      const deck = new THREE.Object3D(); deck.position.set(0, -2.0, 0); deck.name = 'planeDeck';
      grp.add(deck);
      envRoot.add(grp);
      plane = grp; W.planeDeck = deck;
      envUpd.push((dt, t) => {
        const st = wb.storm;
        grp.position.y = 120 + 0.22 * Math.sin(t * 0.6) + st * 0.35 * Math.sin(t * 2.3);
        grp.rotation.z = 0.02 * Math.sin(t * 0.37) + st * 0.03 * Math.sin(t * 1.7);
        grp.rotation.x = 0.006 * Math.sin(t * 0.5);
        for (const p of props) p.rotation.z += dt * 38;
        grp.updateMatrixWorld();
      });
      // spawn / spots / zone
      spawn.set(0, 0, 15.5);
      spawnLook.set(0, 0, 40);
      idir = { x: 0, z: -1 };
      campPos.set(0, 118, -4);
      const sp = [['shop', -1.7, -8.5], ['bar', 1.7, -8.5], ['banhmi', -1.7, -3.5], ['craft', 1.7, -3.5], ['boat', 1.7, 2.0], ['elder', -1.7, 2.0]];
      spots = sp.map(([role, x, z]) => {
        const lookAt = new THREE.Vector3(0, 0, z + 1.5);
        return { role, pos: new THREE.Vector3(x, 118, z), lookAt, facing: Math.atan2(lookAt.x - x, lookAt.z - z) };
      });
      for (const s of spots) {
        const st = buildStall(s.role, 0.5);
        st.position.set(s.pos.x, -2.0, s.pos.z); st.rotation.y = s.facing;
        grp.add(st);
      }
      W.zones = [{ x: 0, z: -11.8, r: 2.0, name: 'Khu vực tiếp viên' }];
      bounds = { minX: -2.6, maxX: 2.6, minZ: -13, maxZ: 22 };   // qua mép dốc 18.4 → bước ra là rơi
      // vùng cấm trên sàn (gắn vào máy bay)
      const zn = W.zones[0];
      const ring = new THREE.Mesh(polarGeo(zn.r - 0.25, zn.r, 1, 48, () => 0), new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
      ring.position.set(zn.x, -1.95, zn.z); grp.add(ring);
      const zs = makeSign(['KHU VỰC CẤM CÂU CÁ', zn.name], { w: 2.2, h: 0.85, post: 0, bg: '#ffffff', fg: '#c0101a' });
      zs.position.set(0, 0.4, -13.9); grp.add(zs);
      addClouds(55, { plane: true });
      addBirds(5, 0xf0f0f0, 1.6, 0, -200, 100, 300, 60, 100);
    },
  };

  // =====================================================================
  // Load environment
  // =====================================================================
  function resetEnvState() {
    if (envRoot) G.disposeObject(envRoot);
    envRoot = new THREE.Group(); envRoot.name = 'envRoot';
    G.scene.add(envRoot);
    mods = []; platforms = []; spots = []; exclusions = []; envUpd = []; floaters = [];
    nightMats = []; nightLights = []; nightSprites = []; cloudMats = []; glowMeshes = [];
    if (G.gfx && G.gfx.clearLights) G.gfx.clearLights('env');
    fallbackLights = 0;
    if (G.physics && G.physics.clear) G.physics.clear('env');
    plane = null; W.planeDeck = null; W.zones = [];
    waterMesh = null; waterU = null; grid = null; depthBytes = null;
    offX = 0; offZ = 0;
    bounds = { minX: -190, maxX: 190, minZ: -190, maxZ: 190 };
  }
  W.loadEnvironment = function (id) {
    const env = G.data.env(id);
    id = env.id;
    resetEnvState();
    envId = id; spec = ENV[id]; W.current = env;
    G.state.env = id;
    nSeed = spec.seed; rng = mulberry32(spec.seed * 7919);
    shoreThr = (env.tideAmp || 0) + 0.6;
    windBase = spec.windBase; windA = rr(0, TAU);
    gRange = spec.gRange;
    // sóng
    const wl = spec.waveL;
    waveDirs = wl.map((L, i) => {
      const a = windA + [0, 0.55, -0.7, 1.25][i];
      return [Math.cos(a), Math.sin(a), L, [1, 0.6, 0.35, 0.2][i]];
    });
    // địa hình
    if (spec.prepare) spec.prepare();
    hFn = spec.h;
    if (!spec.custom) setupSpawnAndCamp(spec.spawnFrom);
    grid = new Float32Array(GN * GN);
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) grid[j * GN + i] = hFinal(GMIN + i * GS, GMIN + j * GS);
    if (spec.custom) {
      spec.build();
    } else {
      if (spec.prepareSpawn) spec.prepareSpawn();
      const pal = makePal(PAL[id]);
      if (spec.colorExtra) pal.extra = spec.colorExtra;
      buildTerrainMesh(pal);
      setupZones(spec.zones);
      setupSpots();
      buildExclusions(spec.extraEx ? spec.extraEx() : null);
      buildSpotDecor();
      for (const zn of W.zones) buildZoneVisual(zn);
      spec.decorate();
      addClouds(26);
    }
    buildWater(spec.water, spec.ext);
    const look = new THREE.Vector3().subVectors(spawnLook, spawn);
    W.spawnFacing = Math.atan2(look.x, look.z);
    W.spawnLook = spawnLook.clone();
    // thời tiết
    W.setWeather(Math.random() < 0.7 ? 'clear' : randomWeather());
    for (const k in wb) wb[k] = weatherTarget === k ? 1 : 0;
    lastNight = null;
    W.ready = true;
    update(0, G.time || 0);
    lastNight = sunDir.y < 0;
    G.bus.emit('env:changed', { env });
    G.prewarm && G.prewarm(); // sau env:changed: NPC, cá, hiệu ứng đã vào scene
    return env;
  };

  // =====================================================================
  // Per-frame update: time, sky, lights, weather, water, ambient
  // =====================================================================
  const C = (h) => new THREE.Color(h);
  const SKYC = { nightTop: C(0x02040b), nightHor: C(0x0b1530), setTop: C(0x4a5f96), setHor: C(0xff8a4a), setGlow: C(0xff5a1a), gray: C(0x8c939c), storm: C(0x3e444c), fogC: C(0xbfc4c8), white: C(0xffffff) };
  const cTop = new THREE.Color(), cHor = new THREE.Color(), cBot = new THREE.Color(), cTmp = new THREE.Color(), cDayTop = new THREE.Color(), cDayHor = new THREE.Color();
  const sunCol = new THREE.Color(), keyCol = new THREE.Color();
  const SUN_HI = C(0xfff4e2), SUN_LO = C(0xffa060), MOON_C = C(0x9ab0ff);
  const HEMI_DAY = C(0xc4dcff), HEMI_NIGHT = C(0x3a4a7a), GND_DAY = C(0x5a5440), GND_NIGHT = C(0x141420);
  const _tp = new THREE.Vector3(), _lr = new THREE.Vector3(), _lu = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0);
  const _wnd = { x: 0, z: 0, speed: 0 };

  function update(dt, t) {
    if (!envId || !W.current) return;
    const env = W.current;
    // ---- thời gian ----
    if (dt > 0) {
      G.state.time += dt / 60;
      while (G.state.time >= 24) { G.state.time -= 24; G.state.day = (G.state.day || 1) + 1; G.bus.emit('day:new', { day: G.state.day }); }
    }
    waveT = t;
    windT.value += dt * (1 + wb.storm * 2.5 + wb.rain * 0.8);
    windInto(_wnd);
    windAmp.value = 0.8 + 0.6 * wb.rain + 1.4 * wb.storm;
    if (_wnd.speed > 0.01) windDir.value.set(_wnd.x / _wnd.speed, _wnd.z / _wnd.speed);
    const T = totalHours();
    if (nextWeatherAt - T > 14) nextWeatherAt = T + 3;
    if (T >= nextWeatherAt) W.setWeather(randomWeather());
    for (const k in wb) wb[k] = G.util.damp(wb[k], weatherTarget === k ? 1 : 0, 0.35, dt);
    cloudK = clamp(Math.max(wb.rain * 0.6, wb.storm * 0.95, wb.fog * 0.55), 0, 1);

    // ---- mặt trời / trăng ----
    const hr = G.state.time;
    const th = (hr - 6) / 12 * Math.PI;
    sunDir.set(Math.cos(th), Math.sin(th) * 0.95, -0.32).normalize();
    const tm = th + Math.PI;
    moonDir.set(Math.cos(tm) * 0.9, Math.sin(tm) * 0.9, 0.35).normalize();
    const sy = sunDir.y;
    dayK = ss(-0.06, 0.3, sy);
    nightK = 1 - ss(-0.2, 0.05, sy);
    const setK = Math.exp(-Math.pow((sy - 0.03) / 0.14, 2));
    const wDim = 1 - 0.3 * wb.rain - 0.55 * wb.storm - 0.25 * wb.fog;
    lightLevel = clamp(dayK * wDim + (1 - dayK) * 0.14, 0, 1);

    // ---- màu trời ----
    cDayTop.set(env.sky).multiplyScalar(0.72);
    cDayHor.set(env.sky).lerp(SKYC.white, 0.5);
    cTop.copy(SKYC.nightTop).lerp(cDayTop, dayK).lerp(SKYC.setTop, setK * 0.6);
    cHor.copy(SKYC.nightHor).lerp(cDayHor, dayK).lerp(SKYC.setHor, setK * 0.72 * (1 - cloudK));
    const grayB = 0.1 + 0.9 * dayK;
    cTmp.copy(SKYC.gray).lerp(SKYC.storm, wb.storm).multiplyScalar(grayB);
    cTop.lerp(cTmp, cloudK * 0.85); cHor.lerp(cTmp, cloudK * 0.8);
    cTmp.copy(SKYC.fogC).multiplyScalar(grayB);
    cHor.lerp(cTmp, wb.fog * 0.9); cTop.lerp(cTmp, wb.fog * 0.5);
    if (envId === 'airplane' || envId === 'island') cBot.set(spec.water.deep).lerp(cHor, 0.55);
    else cBot.copy(cHor).multiplyScalar(0.7);
    sunCol.copy(SUN_LO).lerp(SUN_HI, ss(0.0, 0.4, sy));

    if (skyU) {
      skyU.uTop.value.copy(cTop).convertSRGBToLinear();
      skyU.uHor.value.copy(cHor).convertSRGBToLinear();
      skyU.uBot.value.copy(cBot).convertSRGBToLinear();
      skyU.uSunDir.value.copy(sunDir); skyU.uMoonDir.value.copy(moonDir);
      skyU.uSunCol.value.copy(sunCol).convertSRGBToLinear();
      skyU.uGlow.value.copy(SKYC.setGlow).convertSRGBToLinear();
      skyU.uSunset.value = setK * (1 - cloudK);
      skyU.uSunVis.value = ss(-0.05, 0.02, sy) * (1 - cloudK * 0.9);
      skyU.uMoonVis.value = ss(-0.05, 0.05, moonDir.y) * (1 - dayK);
      skyU.uStars.value = nightK * (1 - cloudK);
      skyU.uTime.value = t; skyU.uCloud.value = cloudK;
    }
    // ---- sương mù ----
    if (G.scene.fog) {
      G.scene.fog.color.copy(cHor).convertSRGBToLinear();
      G.scene.fog.density = env.fog * (1 + 0.8 * wb.rain + 1.2 * wb.storm + 3.5 * wb.fog);
    }

    // ---- sét ----
    if (wb.storm > 0.5) {
      lightningT -= dt;
      if (lightningT <= 0) { flash = 1; thunderT = 0.4 + Math.random() * 2; lightningT = 5 + Math.random() * 10; }
    }
    if (thunderT > 0) { thunderT -= dt; if (thunderT <= 0) { G.audio && G.audio.play && G.audio.play('thunder'); } }
    if (flash > 0) {
      flash = Math.max(0, flash - dt * 5);
      if (flash > 0.55 && flash < 0.6 && Math.random() < 0.5) flash = 0.9;
    }
    const fl = flash * flash;
    if (skyU) skyU.uFlash.value = fl * 0.7;

    // ---- đèn ----
    if (sun) {
      const sunI = 2.1 * ss(-0.02, 0.22, sy) * wDim;
      const moonI = 0.45 * ss(-0.05, 0.2, moonDir.y) * (1 - dayK) * (1 - 0.6 * cloudK);
      const useSun = sunI >= moonI;
      const kd = useSun ? sunDir : moonDir;
      keyCol.copy(useSun ? sunCol : MOON_C);
      sun.color.copy(keyCol);
      sun.intensity = Math.max(sunI, moonI) + fl * 1.5;
      const tp = (G.player && G.player.pos) ? G.player.pos : spawn;
      _tp.copy(tp);
      if (plane && !(G.player && G.player.pos)) _tp.y = deckY();
      // Khung bóng bám người chơi, làm tròn theo texel trong hệ trục của đèn → bóng không "rung" khi di chuyển
      const half = sun.shadow.camera.right || 60, texel = (2 * half) / (sun.shadow.mapSize.x || 2048);
      _lr.crossVectors(_UP, kd); if (_lr.lengthSq() < 1e-6) _lr.set(1, 0, 0); _lr.normalize();
      _lu.crossVectors(kd, _lr);
      const ax = Math.round(_tp.dot(_lr) / texel) * texel, ay = Math.round(_tp.dot(_lu) / texel) * texel, az = _tp.dot(kd);
      _tp.copy(_lr).multiplyScalar(ax).addScaledVector(_lu, ay).addScaledVector(kd, az);
      sun.target.position.copy(_tp);
      sun.position.copy(_tp).addScaledVector(kd, 160);
      sun.target.updateMatrixWorld();
      hemi.intensity = (lerp(0.32, 0.78, dayK) * (0.75 + 0.25 * wDim)) + fl * 2.5;
      hemi.color.copy(HEMI_NIGHT).lerp(HEMI_DAY, dayK);
      hemi.groundColor.copy(GND_NIGHT).lerp(GND_DAY, dayK);
      if (G.renderer) G.renderer.toneMappingExposure = lerp(1.15, 1.0, dayK);
    }

    // ---- nước ----
    const waveMul = 1 + 0.4 * wb.rain + 1.1 * wb.storm - 0.25 * wb.fog;
    waveAmp = env.waveAmp * waveMul;
    if (plane) { offZ -= 40 * dt; }
    if (waterU) {
      waterU.uTime.value = t; waterU.uAmp.value = waveAmp; waterU.uLevel.value = waterLevel();
      waterU.uOffset.value.set(offX, offZ);
      waterU.uSkyTop.value.copy(skyU.uTop.value); waterU.uSkyHor.value.copy(skyU.uHor.value);
      waterU.uSunDir.value.copy(sunDir); waterU.uSunCol.value.copy(skyU.uSunCol.value);
      waterU.uSunInt.value = ss(-0.02, 0.1, sy) * (1 - cloudK * 0.85);
      waterU.uGlow.value.copy(skyU.uGlow.value); waterU.uSunset.value = skyU.uSunset.value;
      terrU.uLevel.value = waterU.uLevel.value; terrU.uTime.value = t;
      terrU.uCaus.value = 1.4 * waterU.uSunInt.value * clamp(1.0 - spec.water.clarity * 1.2, 0.3, 1);
      waterU.uMoonDir.value.copy(moonDir); waterU.uMoonInt.value = ss(0, 0.15, moonDir.y) * (1 - dayK) * (1 - cloudK * 0.8);
      waterU.uLight.value = 0.1 + 0.9 * lightLevel;
      waterU.uDetail.value = 0.7 + 0.5 * wb.rain + 0.8 * wb.storm;
      waterU.uFlash.value = fl;
      waterU.uFoamAmt.value = ss(0.1, 0.5, waveAmp);
    }

    // ---- vật nổi ----
    for (const f of floaters) {
      const y = W.getWaterHeight(f.x, f.z);
      f.obj.position.set(f.x, y + f.off, f.z);
      if (f.tilt) {
        const dx = W.getWaterHeight(f.x + 1.5, f.z) - y, dz = W.getWaterHeight(f.x, f.z + 1.5) - y;
        f.obj.rotation.x = Math.atan2(dz, 1.5) * 0.6 * f.tilt; f.obj.rotation.z = -Math.atan2(dx, 1.5) * 0.6 * f.tilt;
      }
    }

    // ---- ánh sáng đêm (cửa sổ, đèn) ----
    const nk = nightK;
    const hdr = G.gfx && G.gfx.postActive ? 1 : 0;
    for (let i = 0; i < glowMeshes.length; i++) glowMeshes[i].material.color.setScalar(1 + 0.8 * hdr);
    for (const n of nightMats) {
      if (n.mat) n.mat.emissiveIntensity = (n.max || 1) * nk;
      if (n.mesh) { const s = 0.35 + (0.65 + 1.5 * hdr) * nk; n.mesh.material.color.setRGB(s, s, s); }
    }
    for (const n of nightLights) n.light.intensity = n.max * nk;
    for (const n of nightSprites) {
      const v = n.max * nk * (n.rain ? (1 - wb.rain * 0.7 - wb.storm) : 1);
      if (n.set) n.set(v); else n.mat.opacity = v;
    }
    for (const m of cloudMats) {
      m.userData.color.copy(cHor).lerp(SKYC.white, dayK * 0.6 * (1 - wb.storm));
      // mây hắt nắng chiều ở phía mặt trời
      m.userData.color.lerp(SKYC.setHor, setK * 0.25 * (1 - cloudK));
      m.userData.setOpacity(clamp(0.75 + cloudK * 0.25, 0, 1) * 0.85);
    }

    for (let i = 0; i < envUpd.length; i++) envUpd[i](dt, t);

    // ---- ngày/đêm đổi → âm nền ----
    const isN = sy < 0;
    if (lastNight !== null && isN !== lastNight) {
      G.bus.emit('daynight:changed', { isNight: isN });
    }
    lastNight = isN;
  }

  // =====================================================================
  // Init
  // =====================================================================
  W.init = function () {
    initSky();
    sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 420;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    G.scene.add(sun); G.scene.add(sun.target);
    W.sun = sun;
    hemi = new THREE.HemisphereLight(0xc4dcff, 0x5a5440, 0.7);
    G.scene.add(hemi);
    G.scene.fog = new THREE.FogExp2(0x88bbdd, 0.004);
    G.addUpdate(update, 10);
  };
})();
