// gfx.js — render & hiệu năng: preset chất lượng, hậu kỳ (bloom/grade/FXAA), độ phân giải thích ứng,
// ngân sách đèn điểm (pool), bảng thống kê F3.
// Hậu kỳ dùng EffectComposer r128 (bản global). Nếu CDN không tải được → render thường.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const clamp = G.util.clamp;
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const LS_KEY = 'caucavancan_gfx_quality';

  // pr: dải pixel ratio cho độ phân giải thích ứng (luôn ≤ devicePixelRatio)
  const PRESETS = {
    low:    { label: 'Thấp',     prMin: 0.6,  prMax: 1.0,  shadow: 1024, soft: false, shadowR: 45, shadowEvery: 3, post: false, bloom: false, fxaa: false, density: 0.45, lights: 1 },
    medium: { label: 'Vừa',      prMin: 0.7,  prMax: 1.25, shadow: 1024, soft: true,  shadowR: 55, shadowEvery: 2, post: true,  bloom: true,  fxaa: true,  density: 0.7,  lights: 2 },
    high:   { label: 'Cao',      prMin: 0.8,  prMax: 1.5,  shadow: 2048, soft: true,  shadowR: 60, post: true,  bloom: true,  fxaa: true,  density: 1.0,  lights: 3 },
    ultra:  { label: 'Cực cao',  prMin: 1.0,  prMax: 2.0,  shadow: 4096, soft: true,  shadowR: 70, post: true,  bloom: true,  fxaa: true,  density: 1.3,  lights: 4 },
  };
  const ORDER = ['low', 'medium', 'high', 'ultra'];

  const gfx = (G.gfx = {
    quality: 'high', density: 1, maxLights: 3, presets: PRESETS, order: ORDER,
    stats: { fps: 0, ms: 0, calls: 0, tris: 0, pr: 1 },
    postActive: false, adaptive: true,
  });

  let renderer = null, composer = null, renderPass = null, bloomPass = null, gradePass = null, fxaaPass = null;
  let hdrTarget = false;
  let pr = 1, prMin = 0.6, prMax = 1;
  let statsEl = null, statsOn = false, statsT = 0;

  function devicePR() { return Math.max(1, window.devicePixelRatio || 1); }
  function detectDefault() {
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
    if (mobile) return 'low';
    // card tích hợp đời cũ / chạy bằng phần mềm → Thấp; Intel Iris → Vừa
    try {
      const gl = G.renderer && G.renderer.getContext();
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = String(gl && (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '');
      if (/SwiftShader|llvmpipe|Software|Basic Render|Mali|Adreno|PowerVR|Intel.*(HD|UHD) Graphics/i.test(gpu)) return 'low';
      if (/Intel.*Iris/i.test(gpu)) return 'medium';
    } catch (e) { /* không đọc được tên GPU → theo kích thước màn hình */ }
    const big = (window.innerWidth || 1280) * (window.innerHeight || 720) * devicePR() * devicePR();
    return big > 4.5e6 ? 'medium' : 'high';
  }

  // =====================================================================
  // Ngân sách đèn điểm: các module đăng ký "đèn ảo"; mỗi frame gán N đèn thật gần camera nhất.
  // Số PointLight trong scene cố định theo preset → không biên dịch lại shader khi đèn bật/tắt.
  // =====================================================================
  const vlights = [];
  let pool = [];
  const _wp = new THREE.Vector3();
  gfx.addLight = function (o) {
    o = o || {};
    const h = {
      obj: o.obj || null, pos: o.pos ? o.pos.clone() : new THREE.Vector3(),
      color: new THREE.Color(o.color !== undefined ? o.color : 0xffffff),
      intensity: o.intensity !== undefined ? o.intensity : 1, distance: o.distance || 20, decay: o.decay !== undefined ? o.decay : 2,
      priority: o.priority || 1, tag: o.tag || '', _score: 0,
    };
    vlights.push(h);
    return h;
  };
  gfx.removeLight = function (h) { const i = vlights.indexOf(h); if (i >= 0) vlights.splice(i, 1); };
  gfx.clearLights = function (tag) { for (let i = vlights.length - 1; i >= 0; i--) if (!tag || vlights[i].tag === tag) vlights.splice(i, 1); };
  function buildPool(n) {
    for (const L of pool) if (L.parent) L.parent.remove(L);
    pool = [];
    if (!G.scene) return;
    for (let i = 0; i < n; i++) {
      const L = new THREE.PointLight(0xffffff, 0, 10, 2);
      L.castShadow = false; L.name = 'gfxPoolLight' + i;
      G.scene.add(L); pool.push(L);
    }
  }
  function inScene(o) { while (o) { if (o === G.scene) return true; o = o.parent; } return false; }
  const _picked = [];
  function assignLights() {
    if (!pool.length) return;
    const cam = G.camera ? G.camera.position : _wp.set(0, 0, 0);
    _picked.length = 0;
    for (let i = 0; i < vlights.length; i++) {
      const h = vlights[i];
      h._score = 0;
      if (h.intensity <= 0.01) continue;
      if (h.obj) { if (!inScene(h.obj)) continue; h.obj.getWorldPosition(h.pos); }
      const d2 = h.pos.distanceToSquared(cam);
      const r = h.distance * 2.5;
      if (d2 > r * r) continue;
      h._score = h.intensity * h.priority / (1 + d2 / (h.distance * h.distance));
      _picked.push(h);
    }
    _picked.sort((a, b) => b._score - a._score);
    for (let i = 0; i < pool.length; i++) {
      const L = pool[i], h = _picked[i];
      if (L.parent !== G.scene) G.scene.add(L);
      if (!h) { L.intensity = 0; continue; }
      L.position.copy(h.pos); L.color.copy(h.color); L.distance = h.distance; L.decay = h.decay;
      // mờ dần đèn ở rìa ngân sách để không "bật/tắt" đột ngột
      const fadeR = h.distance * 2.5, d = Math.sqrt(h.pos.distanceToSquared(cam));
      L.intensity = h.intensity * (1 - ss(fadeR * 0.6, fadeR, d));
    }
  }

  // =====================================================================
  // Hậu kỳ
  // =====================================================================
  // Grade: nhận màu tuyến tính (đã tone-map theo vật liệu), chỉnh tương phản nhẹ, tách tông ấm/lạnh theo giờ,
  // vignette, rồi chuyển sang sRGB (thay GammaCorrectionShader) + dither chống banding.
  const GradeShader = {
    uniforms: {
      tDiffuse: { value: null },
      uContrast: { value: 0.1 }, uSat: { value: 1.0 }, uVig: { value: 0.22 },
      uShadowTint: { value: new THREE.Vector3(1, 1, 1) }, uHighTint: { value: new THREE.Vector3(1, 1, 1) },
      uSeed: { value: 0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float uContrast; uniform float uSat; uniform float uVig;',
      'uniform vec3 uShadowTint; uniform vec3 uHighTint; uniform float uSeed; varying vec2 vUv;',
      'vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, pow(c, vec3(0.41666)) * 1.055 - 0.055, step(0.0031308, c)); }',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }',
      'void main(){',
      '  vec3 c = toSRGB(texture2D(tDiffuse, vUv).rgb);',
      '  c = clamp(c, 0.0, 1.0);',
      '  c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);',            // S-curve nhẹ
      '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
      '  c *= mix(uShadowTint, uHighTint, smoothstep(0.15, 0.75, l));', // tách tông
      '  l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
      '  c = mix(vec3(l), c, uSat);',
      '  vec2 q = vUv - 0.5; float v = 1.0 - uVig * smoothstep(0.25, 0.95, dot(q, q) * 2.2);',
      '  c *= v;',
      '  c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;',
      '  gl_FragColor = vec4(c, 1.0);',
      '}',
    ].join('\n'),
  };

  function canPost() {
    return !!(THREE.EffectComposer && THREE.RenderPass && THREE.ShaderPass && THREE.CopyShader);
  }
  function disposeComposer() {
    if (!composer) return;
    try {
      composer.renderTarget1.dispose(); composer.renderTarget2.dispose();
      for (const p of composer.passes) {
        if (p.dispose) p.dispose();
        if (p.material && p.material.dispose) p.material.dispose();
      }
    } catch (e) { /* bỏ qua */ }
    composer = renderPass = bloomPass = gradePass = fxaaPass = null;
    gfx.postActive = false;
  }
  function buildComposer(P) {
    disposeComposer();
    if (!P.post || !canPost() || !renderer) return;
    try {
      const caps = renderer.capabilities || {};
      const ext = renderer.extensions;
      hdrTarget = !!(caps.isWebGL2 || (ext && ext.has && ext.has('OES_texture_half_float') && ext.has('EXT_color_buffer_half_float')));
      const w = window.innerWidth, h = window.innerHeight;
      const rt = new THREE.WebGLRenderTarget(Math.max(1, Math.round(w * pr)), Math.max(1, Math.round(h * pr)), {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
        type: hdrTarget ? THREE.HalfFloatType : THREE.UnsignedByteType, stencilBuffer: false,
      });
      rt.texture.name = 'gfx.rt';
      composer = new THREE.EffectComposer(renderer, rt);
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      renderPass = new THREE.RenderPass(G.scene, G.camera);
      composer.addPass(renderPass);
      if (P.bloom && THREE.UnrealBloomPass && THREE.LuminosityHighPassShader) {
        // Chỉ thứ vượt 1.0 (HDR: mặt trời, ánh mặt trời trên nước, đèn, lửa nổ) mới bloom; trời/tuyết không.
        bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.45, hdrTarget ? 1.0 : 0.93);
        composer.addPass(bloomPass);
      }
      gradePass = new THREE.ShaderPass(GradeShader);
      composer.addPass(gradePass);
      if (P.fxaa && THREE.FXAAShader) {
        fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
        composer.addPass(fxaaPass);
      }
      updateFxaa();
      gfx.postActive = true;
    } catch (e) {
      console.warn('[gfx] Không dựng được hậu kỳ, dùng render thường:', e);
      disposeComposer();
    }
  }
  function updateFxaa() {
    if (!fxaaPass) return;
    const w = Math.max(1, Math.round(window.innerWidth * pr)), h = Math.max(1, Math.round(window.innerHeight * pr));
    fxaaPass.material.uniforms.resolution.value.set(1 / w, 1 / h);
  }

  // =====================================================================
  // Chất lượng
  // =====================================================================
  function applyShadows(P) {
    if (!renderer) return;
    renderer.shadowMap.enabled = true;
    const type = P.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    const typeChanged = renderer.shadowMap.type !== type;
    if (typeChanged) { renderer.shadowMap.type = type; renderer.shadowMap.needsUpdate = true; }
    const sun = G.world && G.world.sun;
    if (sun && sun.shadow) {
      if (sun.shadow.mapSize.x !== P.shadow) {
        sun.shadow.mapSize.set(P.shadow, P.shadow);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
      const c = sun.shadow.camera;
      c.left = -P.shadowR; c.right = P.shadowR; c.top = P.shadowR; c.bottom = -P.shadowR;
      c.updateProjectionMatrix();
    }
    // vật liệu cần biên dịch lại khi đổi kiểu shadow map
    if (typeChanged && G.scene) G.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
  }
  function setPR(v, force) {
    v = clamp(Math.round(v * 20) / 20, prMin, prMax);
    if (!force && Math.abs(v - pr) < 0.01) return;
    pr = v;
    gfx.stats.pr = pr;
    if (!renderer) return;
    renderer.setPixelRatio(pr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) { composer.setPixelRatio(pr); composer.setSize(window.innerWidth, window.innerHeight); }
    updateFxaa();
  }
  gfx.setQuality = function (q) {
    if (!PRESETS[q]) return;
    const P = PRESETS[q];
    const first = !gfx._applied;
    gfx.quality = q; gfx.density = P.density; gfx.maxLights = P.lights; gfx._applied = true;
    try { localStorage.setItem(LS_KEY, q); } catch (e) { /* bỏ qua */ }
    const dpr = devicePR();
    prMax = Math.min(P.prMax, dpr);
    prMin = Math.min(P.prMin, prMax);
    // khởi đầu ở mức cao nhất của preset; thích ứng sẽ hạ nếu không giữ được 60fps
    pr = prMax; ad.ceiling = prMax; ad.cool = 2; ad.slowT = ad.fastT = 0;
    if (!renderer) return;
    setPR(pr, true);
    buildPool(P.lights);
    if (!first || G.world) applyShadows(P);
    buildComposer(P);
    G.bus && G.bus.emit('gfx:quality', { quality: q, label: P.label });
  };
  gfx.cycleQuality = function () { gfx.setQuality(ORDER[(ORDER.indexOf(gfx.quality) + 1) % ORDER.length]); return gfx.quality; };

  // =====================================================================
  // Độ phân giải thích ứng (giữ ~60fps, có trễ để không dao động)
  // =====================================================================
  const ad = { ema: 16.7, slowT: 0, fastT: 0, cool: 2, ceiling: 1, ceilT: 0, qCool: 0 };
  function adapt(frameMs, realDt) {
    if (frameMs > 250) return; // khựng do tải map/biên dịch shader/chuyển tab — không phải máy yếu
    // khung dài nhưng game gần như không làm gì → trình duyệt bóp nhịp (cửa sổ bị che/chạy nền), không phải máy yếu
    const work = G.frameWorkMs || 0;
    if (frameMs > 25 && work < 12 && work < frameMs * 0.35) frameMs = 16.7;
    ad.ema += (frameMs - ad.ema) * 0.05;
    if (!gfx.adaptive || G.paused || document.hidden) { ad.slowT = ad.fastT = 0; return; }
    ad.cool -= realDt; ad.qCool -= realDt;
    if (ad.ceilT > 0) { ad.ceilT -= realDt; if (ad.ceilT <= 0) ad.ceiling = prMax; }
    if (ad.ema > 19.5) { ad.slowT += realDt; ad.fastT = 0; }          // < ~51fps
    else if (ad.ema < 17.4) { ad.fastT += realDt; ad.slowT = 0; }     // giữ 60fps ổn định
    else { ad.slowT = Math.max(0, ad.slowT - realDt); ad.fastT = Math.max(0, ad.fastT - realDt); }
    if (ad.cool > 0) return;
    if (ad.slowT > 3 && pr <= prMin + 0.001 && ad.ema > 24 && gfx.quality !== 'low' && ad.qCool <= 0) {
      // đã ở độ phân giải thấp nhất của mức này mà vẫn <~42fps → hạ hẳn một mức chất lượng
      const q = ORDER[ORDER.indexOf(gfx.quality) - 1], keep = pr;
      gfx.setQuality(q);
      setPR(Math.max(prMin, Math.min(prMax, keep)), true); ad.ceiling = pr; // không nhảy độ phân giải lên lại
      ad.qCool = 60;
      if (G.ui && G.ui.toast) G.ui.toast('Máy hơi yếu — tự giảm đồ họa xuống mức ' + PRESETS[q].label + ' cho mượt (đổi lại trong menu Esc)', 'info');
      return;
    }
    if (ad.slowT > 1.2 && pr > prMin + 0.001) {
      // hạ; nhớ mức vừa thất bại làm trần trong 30s để không leo lại ngay
      ad.ceiling = Math.max(prMin, pr - 0.05); ad.ceilT = 0;
      setPR(pr - (ad.ema > 28 ? 0.2 : 0.1));
      ad.slowT = 0; ad.cool = 1.5; ad.ema = 16.7;
    } else if (ad.fastT > 20 && pr < Math.min(prMax, ad.ceiling) - 0.001) {
      setPR(Math.min(pr + 0.05, prMax, ad.ceiling));
      ad.fastT = 0; ad.cool = 3;
    }
  }

  // =====================================================================
  // Grade theo thời gian trong ngày
  // =====================================================================
  let condT = 0, cond = null;
  const tintS = new THREE.Vector3(), tintH = new THREE.Vector3();
  function updateGrade(dt) {
    if (!gradePass) return;
    condT -= dt;
    if (condT <= 0 || !cond) {
      condT = 0.5;
      try { cond = G.world && G.world.getConditions ? G.world.getConditions() : null; } catch (e) { cond = null; }
    }
    const u = gradePass.uniforms;
    let night = 0, golden = 0, overcast = 0;
    if (cond) {
      const h = cond.time || 12;
      night = cond.isNight ? 1 - ss(0.0, 0.4, cond.light || 0) * 0.3 : 0;
      golden = Math.max(1 - ss(0, 1.6, Math.abs(h - 6.6)), 1 - ss(0, 1.6, Math.abs(h - 17.6))) * (1 - night);
      overcast = cond.weather === 'storm' ? 1 : cond.weather === 'rain' ? 0.6 : cond.weather === 'fog' ? 0.5 : 0;
    }
    // ngày: bóng hơi lạnh, sáng hơi ấm · hoàng hôn: ấm rõ hơn · đêm: lạnh, giảm bão hòa
    tintS.set(0.985, 1.0, 1.03); tintH.set(1.025, 1.0, 0.975);
    tintS.lerp(_v3a.set(1.0, 0.97, 1.04), golden); tintH.lerp(_v3b.set(1.045, 1.0, 0.94), golden);
    tintS.lerp(_v3a.set(0.92, 0.97, 1.1), night); tintH.lerp(_v3b.set(0.95, 0.99, 1.06), night);
    u.uShadowTint.value.lerp(tintS, Math.min(1, dt * 2)); u.uHighTint.value.lerp(tintH, Math.min(1, dt * 2));
    u.uSat.value += ((1.02 - 0.14 * night - 0.12 * overcast - 0.03 * golden) - u.uSat.value) * Math.min(1, dt * 2);
    u.uContrast.value = 0.12 - 0.05 * overcast;
    u.uVig.value = 0.2 + 0.08 * night;
    u.uSeed.value = (u.uSeed.value + 0.618) % 10;
    if (bloomPass) bloomPass.strength = 0.5 + 0.25 * night;
  }
  const _v3a = new THREE.Vector3(), _v3b = new THREE.Vector3();

  // =====================================================================
  // Thống kê F3
  // =====================================================================
  function buildStats() {
    if (statsEl || typeof document === 'undefined' || !document.body) return;
    statsEl = document.createElement('div');
    statsEl.id = 'gfx-stats';
    statsEl.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:50;pointer-events:none;font:11px/1.35 ui-monospace,Consolas,monospace;' +
      'color:#d8e4ec;background:rgba(8,14,20,0.62);padding:5px 8px;border-radius:4px;white-space:pre;display:none;';
    document.body.appendChild(statsEl);
  }
  gfx.toggleStats = function (on) {
    buildStats();
    statsOn = on === undefined ? !statsOn : !!on;
    if (statsEl) statsEl.style.display = statsOn ? 'block' : 'none';
    return statsOn;
  };
  let fpsAcc = 0, fpsN = 0;
  function updateStats(realDt) {
    fpsAcc += realDt; fpsN++;
    statsT -= realDt;
    if (statsT > 0) return;
    statsT = 0.25;
    const s = gfx.stats;
    s.ms = fpsN ? (fpsAcc / fpsN) * 1000 : 0; s.fps = s.ms > 0 ? 1000 / s.ms : 0;
    fpsAcc = 0; fpsN = 0;
    if (renderer) { s.calls = renderer.info.render.calls; s.tris = renderer.info.render.triangles; }
    if (statsOn && statsEl) {
      const P = PRESETS[gfx.quality];
      let lit = 0; for (const L of pool) if (L.intensity > 0) lit++;
      statsEl.textContent =
        s.fps.toFixed(0).padStart(3) + ' fps  ' + s.ms.toFixed(1) + ' ms\n' +
        'draw ' + s.calls + '  tri ' + (s.tris / 1000).toFixed(0) + 'k\n' +
        'chất lượng ' + P.label + '  px ' + pr.toFixed(2) + (prMax > prMin ? ' [' + prMin.toFixed(2) + '–' + prMax.toFixed(2) + ']' : '') + '\n' +
        'đèn ' + lit + '/' + pool.length + ' (' + vlights.length + ' ảo)  ' + (composer ? (bloomPass ? 'bloom' : 'post') + (hdrTarget ? ' hdr' : '') : 'thường') + '\n' +
        'F3 ẩn · đổi chất lượng trong menu Esc';
    }
  }

  // =====================================================================
  // Render
  // =====================================================================
  let lastNow = 0, shadowFrame = 0;
  gfx.render = function (dt) {
    const r = renderer || G.renderer;
    if (!r) return;
    // cửa sổ thu nhỏ / khung ẩn → canvas 0×0: vẽ vào đó chỉ sinh lỗi WebGL "framebuffer incomplete"
    if (!window.innerWidth || !window.innerHeight) { lastNow = 0; return; }
    const now = performance.now();
    const realDt = lastNow ? Math.min((now - lastNow) / 1000, 0.5) : 1 / 60;
    lastNow = now;
    // đổi độ phân giải TRƯỚC khi vẽ: đổi kích thước canvas sẽ xóa nó, làm sau khi vẽ là màn hình nháy trắng/đen
    adapt(realDt * 1000, realDt);
    r.info.reset();
    // bóng đổ cập nhật thưa hơn ở mức Thấp/Vừa (mặt trời đi chậm; nhân vật/cá vẫn có bóng, chỉ trễ 1–2 khung)
    const se = PRESETS[gfx.quality].shadowEvery || 1;
    r.shadowMap.autoUpdate = se === 1;
    if (se > 1 && (++shadowFrame % se === 0)) r.shadowMap.needsUpdate = true;
    assignLights();
    updateGrade(dt || realDt);
    if (composer && gfx.postActive) {
      try { composer.render(dt || realDt); }
      catch (e) { console.error('[gfx] hậu kỳ lỗi, chuyển sang render thường', e); disposeComposer(); r.render(G.scene, G.camera); }
    } else r.render(G.scene, G.camera);
    updateStats(realDt);
  };

  gfx.init = function () {
    renderer = G.renderer;
    if (!renderer) return;
    renderer.info.autoReset = false;
    let q = null;
    try { q = localStorage.getItem(LS_KEY); } catch (e) { q = null; }
    if (!PRESETS[q]) q = detectDefault();
    gfx.setQuality(q);
    window.addEventListener('resize', () => {
      // core đã đặt renderer.setSize; giữ pixel ratio của gfx và cập nhật composer
      setPR(pr, true);
    });
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'F3') { e.preventDefault(); gfx.toggleStats(); }
    });
    // sau khi world tạo mặt trời → áp shadow map theo preset
    G.bus && G.bus.on('env:changed', () => {
      if (!gfx._shadowApplied) { gfx._shadowApplied = true; applyShadows(PRESETS[gfx.quality]); }
      ad.cool = Math.max(ad.cool, 3); ad.slowT = 0; ad.ema = 16.7; // vài khung sau khi dựng map không phản ánh sức máy
    });
  };
})();
