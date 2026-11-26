// main.js — khởi động game
(function () {
  const G = window.G;
  function safeInit(name) {
    const m = G[name];
    if (m && typeof m.init === 'function') {
      try { m.init(); } catch (e) { console.error('[init ' + name + ']', e); }
    } else if (!m) console.warn('Module thiếu:', name); // module không cần init (vd physics) thì bỏ qua
  }
  window.addEventListener('load', async () => {
    const T = (G.bootTimes = { start: performance.now() }); // đo thời gian khởi động (xem trong DevTools)
    await G.loadFonts();
    T.fonts = performance.now();
    if (!window.THREE) {
      document.body.innerHTML = '<h2 style="color:#fff;font-family:system-ui,sans-serif;padding:40px">Không tải được Three.js — thiếu file vendor/three/three.min.js. Hãy giải nén lại đầy đủ thư mục game.</h2>';
      return;
    }
    G.initCore();
    ['physics', 'gfx', 'audio', 'fx', 'world', 'fish', 'player', 'fishing', 'skills', 'systems', 'ui'].forEach(safeInit);
    T.init = performance.now();
    try { G.world.loadEnvironment(G.state.env || 'forest'); } catch (e) { console.error('[loadEnvironment]', e); }
    T.world = performance.now();
    G.bus.emit('game:ready', {});
    G.startLoop();
    const ld = document.getElementById('loading');
    if (ld) ld.remove();
    G.readyAt = performance.now(); // ms từ lúc mở trang tới lúc chơi được
  });
})();
