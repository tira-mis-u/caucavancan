// core.js — nền tảng chung: scene, renderer, bus, input, util, state, vòng lặp
(function () {
  const G = (window.G = window.G || {});

  // ---------- Event bus ----------
  const listeners = {};
  G.bus = {
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); },
    off(evt, fn) { const l = listeners[evt]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } },
    emit(evt, data) {
      const l = listeners[evt]; if (!l) return;
      for (const fn of l.slice()) { try { fn(data); } catch (e) { console.error('[bus ' + evt + ']', e); } }
    },
  };

  // ---------- Util ----------
  const U = (G.util = {
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    damp: (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt)),
    // hiệu hai góc, gói về [-π, π]
    angleDiff: (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2; return d; },
    dampAngle: (a, b, lambda, dt) => a + U.angleDiff(a, b) * (1 - Math.exp(-lambda * dt)),
    smoothstep: (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); },
    fmtMoney: (v) => Math.round(v).toLocaleString('vi-VN') + '₫',
    fmtWeight: (kg) => kg >= 1000 ? (kg / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tấn'
      : kg >= 1 ? kg.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' kg'
      : Math.round(kg * 1000) + ' g',
    weightedPick(arr) {
      let s = 0; for (const a of arr) s += a.w;
      let r = Math.random() * s;
      for (const a of arr) { r -= a.w; if (r <= 0) return a; }
      return arr[arr.length - 1];
    },
    v3: (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0),
    // Font chuẩn cho chữ vẽ lên canvas (biển hiệu, tên NPC, chữ bay). display=true → font tiêu đề.
    font: (weight, sizePx, display) => (weight || 600) + ' ' + Math.round(sizePx) + 'px ' + (display ? G.FONT_DISPLAY : G.FONT_UI),
  });
  // Font nhúng sẵn trong fonts/fonts.css (hỗ trợ đầy đủ dấu tiếng Việt)
  G.FONT_UI = '"Be Vietnam Pro", system-ui, sans-serif';       // nội dung, số liệu: 400/600/800
  G.FONT_DISPLAY = '"Baloo 2", "Be Vietnam Pro", sans-serif';  // tiêu đề, biển hiệu, chữ bay: 600/800
  // Chờ font tải xong (tối đa 3s) trước khi dựng thế giới, để chữ vẽ lên canvas không rơi về font dự phòng
  G.loadFonts = function () {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const sample = 'Câu cá Vạn Cân ẮẰẲẴẶ ỨỪỬỮỰ đĐ 0123';
    const jobs = ['400', '600', '800'].map((w) => document.fonts.load(w + ' 20px "Be Vietnam Pro"', sample))
      .concat(['600', '800'].map((w) => document.fonts.load(w + ' 20px "Baloo 2"', sample)));
    return Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 3000))]).catch(() => {});
  };

  // ---------- State ----------
  G.defaultState = () => ({
    money: 50000,
    inventory: { bait_worm: 20, bait_bread: 10, food_banhmi: 2, drink_beer: 1 },
    fishBag: [],
    equipped: { rod: 'rod_bamboo', line: 'line_basic', bait: 'bait_worm' },
    env: 'forest', time: 6.5, day: 1,
    mode: 'explore',
    drunk: 0, hunger: 100, stamina: 100, hp: 100,
    wanted: 0, onBoat: null, ownedBoats: [],
    ownedRods: ['rod_bamboo'], ownedLines: ['line_basic'],
    stats: { caught: 0, biggest: 0, junk: 0, explosions: 0, pantsAttempts: 0 },
    discovered: {},
  });
  G.state = G.defaultState();

  G.setMode = function (m) {
    const from = G.state.mode;
    if (from === m) return;
    G.state.mode = m;
    G.bus.emit('mode:changed', { from, to: m });
  };

  // ---------- Input ----------
  const input = (G.input = {
    keys: {}, _pressed: {}, blocked: false,
    mouse: { x: 0, y: 0, nx: 0, ny: 0, left: false, right: false, leftPressed: false, leftReleased: false, rightPressed: false, wheel: 0, dx: 0, dy: 0 },
    pressed(code) { return !!this._pressed[code]; },
  });
  const isTyping = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    if (!input.keys[e.code]) input._pressed[e.code] = true;
    input.keys[e.code] = true;
    if (['Space', 'Tab', 'F1', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { input.keys[e.code] = false; });
  window.addEventListener('blur', () => { input.keys = {}; input.mouse.left = input.mouse.right = false; });
  window.addEventListener('mousemove', (e) => {
    const m = input.mouse;
    m.dx += e.movementX || 0; m.dy += e.movementY || 0;
    m.x = e.clientX; m.y = e.clientY;
    m.nx = (e.clientX / window.innerWidth) * 2 - 1;
    m.ny = -(e.clientY / window.innerHeight) * 2 + 1;
  });
  window.addEventListener('mousedown', (e) => {
    if (e.target && e.target.closest && e.target.closest('.ui-interactive')) return;
    if (e.button === 0) { input.mouse.left = true; input.mouse.leftPressed = true; }
    if (e.button === 2) { input.mouse.right = true; input.mouse.rightPressed = true; }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) { if (input.mouse.left) input.mouse.leftReleased = true; input.mouse.left = false; }
    if (e.button === 2) input.mouse.right = false;
  });
  window.addEventListener('wheel', (e) => { input.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  function endFrameInput() {
    input._pressed = {};
    const m = input.mouse;
    m.leftPressed = m.leftReleased = m.rightPressed = false;
    m.wheel = 0; m.dx = 0; m.dy = 0;
  }

  // ---------- Update registry ----------
  const updates = (G._updates = []); // lộ ra để đo hiệu năng từng module (DevTools)
  G.addUpdate = function (fn, order) {
    updates.push({ fn, order: order || 0 });
    updates.sort((a, b) => a.order - b.order);
  };

  // ---------- Three setup ----------
  G.initCore = function () {
    const canvas = document.getElementById('game');
    // antialias tắt: hậu kỳ vẽ vào render target riêng rồi FXAA — MSAA ở canvas chính chỉ tốn băng thông
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    G.renderer = renderer;
    G.scene = new THREE.Scene();
    G.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 6000);
    G.camera.position.set(0, 10, 20);
    G.clock = new THREE.Clock();
    window.addEventListener('resize', () => {
      G.camera.aspect = window.innerWidth / window.innerHeight;
      G.camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  };

  // Debug: chạy mô phỏng n frame không render (dùng để test cân bằng)
  G._simulate = function (frames, dt, beforeFrame) {
    dt = dt || 1 / 60;
    for (let i = 0; i < frames; i++) {
      if (beforeFrame && beforeFrame(i) === false) break;
      G.time += dt;
      for (const u of updates) { try { u.fn(dt, G.time); } catch (e) { console.error('[sim]', e); } }
      endFrameInput();
    }
  };

  G.paused = false;
  G.time = 0;
  G.startLoop = function () {
    function frame() {
      requestAnimationFrame(frame);
      // Khung chậm được chia thành nhiều bước ≤0.05s thay vì bị cắt → game không "slow motion".
      // Tối đa 0.25s/khung để khi chuyển tab về không tua nhanh cả chục giây.
      let frameDt = Math.min(G.clock.getDelta(), 0.25);
      if (G.paused) frameDt = 0;
      const steps = Math.max(1, Math.ceil(frameDt / 0.05));
      const dt = frameDt / steps;
      for (let s = 0; s < steps; s++) {
        G.time += dt;
        for (const u of updates) {
          try { u.fn(dt, G.time); } catch (e) { if (!u._err) { console.error('[update]', e); u._err = true; } }
        }
        if (s === 0 && steps > 1) endFrameInput(); // phím bấm 1 lần chỉ xử lý ở bước đầu
      }
      if (G.gfx && G.gfx.render) {
        try { G.gfx.render(frameDt); } catch (e) { if (!G._gfxErr) { console.error('[gfx]', e); G._gfxErr = true; } G.renderer.render(G.scene, G.camera); }
      } else G.renderer.render(G.scene, G.camera);
      endFrameInput();
    }
    frame();
  };

  // Biên dịch sẵn mọi shader + đẩy texture lên GPU cho cả scene (kể cả vật ngoài khung hình).
  // Không làm thì mỗi vật lần đầu lọt vào màn hình sẽ làm game khựng ~150ms giữa lúc chơi.
  // Làm theo từng lô (mỗi lô = 1 vật liệu → tối đa 1 shader), ≤12ms mỗi lần rồi nhường trình duyệt vẽ:
  // trang không đứng hình, màn hình tiêu đề vẫn bấm được trong lúc biên dịch nền. Trả về Promise.
  let prewarmToken = 0;
  const PREWARM_LAYER = 31;
  G.prewarm = function () {
    const r = G.renderer, cam = G.camera, scene = G.scene;
    const token = ++prewarmToken; // đổi map giữa chừng → lô cũ tự dừng
    if (!r || !r.setRenderTarget || !scene || !cam) return Promise.resolve();
    const groups = new Map(), lights = [];
    scene.traverseVisible((o) => {
      if (o.isLight) lights.push(o);
      else if (o.material && (o.isMesh || o.isPoints || o.isLine || o.isSprite)) {
        const k = [].concat(o.material)[0].uuid;
        let g = groups.get(k); if (!g) groups.set(k, (g = [])); g.push(o);
      }
    });
    const list = [...groups.values()];
    const rt = new THREE.WebGLRenderTarget(1, 1);
    let i = 0;
    return new Promise((resolve) => {
      function step() {
        if (token !== prewarmToken || i >= list.length) { rt.dispose(); resolve(); return; }
        const t0 = performance.now(), mask = cam.layers.mask, shadowAuto = r.shadowMap.autoUpdate;
        r.shadowMap.autoUpdate = false; // không vẽ lại bóng đổ cho từng lô
        lights.forEach((l) => l.layers.enable(PREWARM_LAYER)); // đèn phải có mặt, nếu không shader biên dịch sai số đèn
        cam.layers.set(PREWARM_LAYER);
        try {
          while (i < list.length && performance.now() - t0 < 12) {
            const objs = list[i++];
            for (const o of objs) { o.layers.enable(PREWARM_LAYER); o._fc = o.frustumCulled; o.frustumCulled = false; }
            r.setRenderTarget(rt);
            r.render(scene, cam); // biên dịch shader + đẩy texture + đẩy hình khối của lô này
            for (const o of objs) { o.layers.disable(PREWARM_LAYER); o.frustumCulled = o._fc; }
          }
        } catch (e) { console.warn('[prewarm]', e); i = list.length; }
        r.setRenderTarget(null);
        cam.layers.mask = mask;
        lights.forEach((l) => l.layers.disable(PREWARM_LAYER));
        r.shadowMap.autoUpdate = shadowAuto;
        setTimeout(step, 0);
      }
      step();
    });
  };

  // Lớp phủ "đang tải" trong lúc làm việc nặng (đổi map): hiện → chờ trình duyệt vẽ nó → làm → làm nóng shader → ẩn.
  G.withLoading = function (text, fn) {
    let el = null;
    try {
      el = document.createElement('div');
      el.className = 'g-loading';
      el.textContent = text;
      el.style.cssText = 'position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(11,26,42,.82);color:#efe4c6;font:600 22px ' + G.FONT_DISPLAY + ';pointer-events:auto';
      document.body.appendChild(el);
    } catch (e) { el = null; }
    const wasPaused = G.paused;
    G.paused = true;
    return new Promise((resolve) => {
      setTimeout(() => {
        let out;
        try { out = fn(); } catch (e) { console.error('[withLoading]', e); }
        Promise.resolve(G.prewarm()).then(() => {
          if (el && el.remove) el.remove();
          G.paused = wasPaused;
          resolve(out);
        });
      }, 40); // đủ để trình duyệt vẽ lớp phủ trước khi bắt đầu dựng map
    });
  };

  // Giải phóng bộ nhớ của một object tree
  G.disposeObject = function (obj) {
    if (!obj) return;
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); });
      }
    });
    if (obj.parent) obj.parent.remove(obj);
  };
})();
