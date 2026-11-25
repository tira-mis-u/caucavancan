// ui.js — giao diện: màn hình tiêu đề, HUD, thanh quăng, bảng vật cá, toast, hội thoại, các bảng (túi đồ, cửa hàng, chế tạo, bản đồ, mồi, cần, sách cá, trợ giúp, tạm dừng)
// Phong cách "bến câu": bảng HUD màu nước sông (mực), bảng menu là tờ sổ giấy dó, biển hiệu sắt tráng men đỏ–kem cho tiêu đề.
// Font: chỉ "Be Vietnam Pro" 400/600/800 và "Baloo 2" 600/800 (fonts/fonts.css).
(function () {
  const G = (window.G = window.G || {});

  // ---------- Tiện ích ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (v) => (G.util && G.util.fmtMoney ? G.util.fmtMoney(v || 0) : Math.round(v || 0) + '₫');
  const wfmt = (kg) => (G.util && G.util.fmtWeight ? G.util.fmtWeight(kg || 0) : (kg || 0).toFixed(1) + ' kg');
  const clamp = G.util.clamp;
  const item = (id) => (G.data && G.data.item ? G.data.item(id) : null);
  const sfx = (n, o) => { if (G.audio && G.audio.play) G.audio.play(n, o); };
  const S = () => G.systems || {};
  const hexCss = (n) => (typeof n === 'number' ? '#' + n.toString(16).padStart(6, '0') : n || '#4fb3bf');
  const num1 = (v) => (+v).toFixed(1).replace('.', ',');
  function call(obj, fn) { const args = Array.prototype.slice.call(arguments, 2); try { if (obj && typeof obj[fn] === 'function') return obj[fn].apply(obj, args); } catch (e) { console.error('[ui→' + fn + ']', e); } return undefined; }
  function has(obj, fn) { return !!(obj && typeof obj[fn] === 'function'); }
  function invCount(id) {
    const s = S();
    if (has(s, 'count')) { const c = call(s, 'count', id); if (typeof c === 'number') return c; }
    const inv = (G.state && G.state.inventory) || {};
    return inv[id] || 0;
  }
  function envOf(id) { return (G.data && G.data.env ? G.data.env(id) : null) || { id: id, name: id || '?', desc: '', icon: '' }; }
  const FUI = (G.FONT_UI || '"Be Vietnam Pro", system-ui, sans-serif');
  const FDISP = (G.FONT_DISPLAY || '"Baloo 2", "Be Vietnam Pro", sans-serif');

  // ---------- Biểu tượng SVG (nét 1.9, đầu tròn, cùng một kiểu) ----------
  const P = {
    coin: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    moon: '<path d="M19.5 14.5A8 8 0 019.5 4.5a8 8 0 1010 10z"/>',
    pin: '<path d="M12 21s-6-5.6-6-11a6 6 0 0112 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
    thermo: '<path d="M10 13.5V5a2 2 0 014 0v8.5a4 4 0 11-4 0z"/><path d="M12 9v7"/>',
    tide: '<path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
    wind: '<path d="M3 8h10a3 3 0 10-3-3M3 12h15a3 3 0 11-3 3M3 16h7"/>',
    wave: '<path d="M2 15c3 0 3-5 6-5s3 5 6 5 3-5 6-5M2 20h20"/>',
    rain: '<path d="M7 15h10a4 4 0 00.4-8 6 6 0 00-11.3 1.6A3.3 3.3 0 007 15z"/><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5"/>',
    storm: '<path d="M7 14h10a4 4 0 00.4-8 6 6 0 00-11.3 1.6A3.3 3.3 0 007 14z"/><path d="M12.5 14l-2 3.5h3l-2 3.5"/>',
    fog: '<path d="M4 8h16M3 12h18M5 16h14M8 20h8"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0112 7.3a4.2 4.2 0 017.5 2.5C19.5 15.4 12 20 12 20z"/>',
    banhmi: '<path d="M3.5 15.5c0-4.4 6.4-8.5 12.8-8.5 2.6 0 4.2 1.3 4.2 3 0 4.4-6.4 8.5-12.8 8.5-2.6 0-4.2-1.3-4.2-3z"/><path d="M8.5 11.5l1.6 2.2M12 9.8l1.6 2.2M15.5 8.6l1.4 2"/>',
    bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    bottle: '<path d="M10 3h4v4l2 3v10a1 1 0 01-1 1H9a1 1 0 01-1-1V10l2-3z"/><path d="M8 13.5h8"/>',
    badge: '<path d="M12 3l7 3v5c0 5-3.4 8.2-7 10-3.6-1.8-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    whistle: '<circle cx="9" cy="14" r="5"/><path d="M13 11h8v4h-4M9 14h.01M6 7l-1-2M9.5 7.5V5"/>',
    bag: '<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6.5a3 3 0 016 0V8"/>',
    hammer: '<path d="M14 4.5l5.5 5.5-2.5 2.5-5.5-5.5zM12.8 8.2l-8.3 8.3a1.8 1.8 0 002.5 2.5l8.3-8.3"/>',
    map: '<path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z"/><path d="M4 20.5V5.5M8 7.5h8"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 114.6 1.4c-.6 1-2.2 1.5-2.2 3M12 17.2v.1"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    rod: '<path d="M3 21L18.5 4M18.5 4v10.5"/><path d="M18.5 14.5v2.2a1.8 1.8 0 01-3.6 0"/>',
    spool: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.2"/><path d="M12 4.5V2"/>',
    bait: '<path d="M4 16c2 0 2-3.5 4-3.5s2 3.5 4 3.5 2-3.5 4-3.5 2 3.5 4 3.5"/><circle cx="20.5" cy="15.8" r=".4"/>',
    depth: '<path d="M12 3v13M7.5 11.5L12 16l4.5-4.5M4 21h16"/>',
    fish: '<path d="M2.5 12c3-4.2 8.5-6 13.5-3.6L21 5v14l-5-3.4C11 18 5.5 16.2 2.5 12z"/><path d="M7.5 11.2v.1"/>',
    boat: '<path d="M3 15h18l-3 5H6z"/><path d="M12 15V4l6 9h-6"/>',
    pants: '<path d="M6 4h12l1.2 16h-5L12 11l-2.2 9h-5z"/>',
    slash: '<path d="M3.5 3.5l17 17"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    arrow: '<path d="M12 20V5M6 11l6-6 6 6"/>',
    ticket: '<path d="M3 8a2 2 0 002-2h14a2 2 0 002 2v8a2 2 0 00-2 2H5a2 2 0 00-2-2z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
  };
  const ic = (n, cls) => `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
  // hình cá cho thẻ sách cá / bảng vật cá — tô màu theo loài
  const fishFig = (color, unknown) => `<svg class="fig" viewBox="0 0 64 32" aria-hidden="true"><path d="M4 16C13 5 32 2 45 12l14-8-4 12 4 12-14-8C32 30 13 27 4 16z" fill="${unknown ? 'rgba(21,41,44,.22)' : color}" stroke="#15292c" stroke-width="1.6" stroke-linejoin="round"/>${unknown ? '<text x="25" y="22" font-size="15" font-weight="800" fill="#15292c" text-anchor="middle" font-family="Be Vietnam Pro, sans-serif">?</text>' : '<circle cx="12.5" cy="14" r="1.7" fill="#15292c"/><path d="M20 9c2 4 2 10 0 14" fill="none" stroke="#15292c" stroke-width="1.2" opacity=".55"/>'}</svg>`;

  const CAT = {
    be: { label: 'Cá bé', color: '#8cc7d9' },
    thuong: { label: 'Cá thường', color: '#7fb069' },
    to: { label: 'Cá to', color: '#f0b323' },
    khong_lo: { label: 'Khổng lồ', color: '#e07b39' },
    quai_vat: { label: 'Quái vật', color: '#c8352a' },
    dot_bien: { label: 'Đột biến', color: '#9a6fc0' },
    meme: { label: 'Meme', color: '#d96aa7' },
  };
  const TECH = { float: 'Câu phao', spin: 'Câu lure (spin)', vertical: 'Câu dọc (jig)', horizontal: 'Câu ngang/lục' };
  const WATER = { pond: 'Ao', river: 'Sông', lake: 'Hồ', sea: 'Biển', sky: 'Biển (từ trên trời)' };
  const WEATHER = { clear: ['sun', 'Quang đãng'], rain: ['rain', 'Mưa'], storm: ['storm', 'Bão'], fog: ['fog', 'Sương mù'] };
  const QUAL = [['low', 'Thấp'], ['medium', 'Vừa'], ['high', 'Cao'], ['ultra', 'Siêu']];
  const ROLE_NAMES = { shop: 'Chú bán đồ câu', bar: 'Chủ quán rượu', banhmi: 'Cô bán bánh mì', craft: 'Bác thợ rèn', boat: 'Ông lái đò', story: 'Ông lão kể chuyện', elder: 'Ông lão kể chuyện' };
  const SHOP_TITLES = { shop: 'Tiệm đồ câu', bar: 'Quán rượu', banhmi: 'Xe bánh mì pate', boat: 'Bến thuyền', craft: 'Lò rèn' };
  const FSTATE = { idle: 'Sẵn sàng quăng', ready: 'Sẵn sàng quăng', charging: 'Đang lấy đà…', aiming: 'Đang lấy đà…', casting: 'Đang quăng…', flying: 'Mồi đang bay…', waiting: 'Chờ cá cắn…', wait: 'Chờ cá cắn…', nibble: 'Cá đang rỉa mồi…', bite: 'Cá cắn!', strike: 'Cá cắn!', hooked: 'Dính cá!', fight: 'Đang vật cá', reeling: 'Đang cuộn…', retrieve: 'Đang thu dây…', landing: 'Kéo cá lên!' };

  const HINTS = {
    explore: [['WASD', 'đi'], ['Shift', 'chạy'], ['Space', 'nhảy'], ['F', 'cầm cần'], ['E', 'nói chuyện'], ['G', 'bắn cá'], ['H', 'trợ giúp']],
    fishing: [['Giữ chuột trái', 'lấy đà, nhả để quăng'], ['Lăn chuột', 'độ sâu mồi'], ['Space', 'giật câu'], ['B', 'mồi'], ['R', 'đổi cần'], ['F', 'cất cần']],
    fight: [['Giữ chuột trái', 'cuộn dây'], ['A / D', 'ghì ngược hướng cá'], ['W', 'giật cần'], ['S', 'hạ cần khi cá nhảy']],
    combat: [['Chuột trái', 'đánh'], ['Shift', 'né'], ['WASD', 'di chuyển']],
    shoot: [['Chuột trái', 'bắn'], ['Chuột phải kéo', 'xoay'], ['G', 'thoát']],
    boat: [['WASD', 'lái thuyền'], ['F', 'câu cá'], ['E', 'rời thuyền']],
    swim: [['WASD', 'bơi'], ['Space', 'ngoi lên'], ['', 'bơi vào bờ!']],
  };

  // ---------- CSS ----------
  // Token: mực sông #15292c · giấy dó #efe4c6 · sơn đỏ #c8352a · vàng nón #f0b323 · lá tre #5fa142 · nước #4fb3bf
  const CSS = `
#ui{--ink:#15292c;--ink2:#213b3e;--paper:#efe4c6;--paper2:#f8f1dc;--son:#c8352a;--vang:#f0b323;--la:#5fa142;--la2:#8fcf63;--nuoc:#4fb3bf;--rule:rgba(21,41,44,.2);
--fs:clamp(12px,calc(.42vw + 7.5px),17px);--m:clamp(10px,1.3vw,22px);--fu:${FUI};--fd:${FDISP};
z-index:2;color:var(--paper);font-family:var(--fu);font-size:var(--fs);line-height:1.4;font-weight:400;font-variant-numeric:tabular-nums;user-select:none;-webkit-user-select:none}
#ui *{box-sizing:border-box}
#ui b,#ui strong,#ui h2,#ui h3,#ui dt{font-weight:800}
#ui .ui-interactive{pointer-events:auto}
#ui .hide{display:none!important}
#ui .i{width:1.15em;height:1.15em;flex:none;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.22em}
#ui .plate{background:rgba(21,41,44,.88);border:1px solid rgba(239,228,198,.16);border-radius:6px;box-shadow:0 2px 0 rgba(0,0,0,.35)}
/* nút */
#ui .btn{font-family:var(--fu);font-weight:600;font-size:1em;line-height:1.35;color:var(--paper);background:var(--ink2);border:1px solid rgba(239,228,198,.28);border-bottom:3px solid rgba(0,0,0,.45);padding:.42em .95em;border-radius:5px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:.45em}
#ui .btn:hover{border-color:rgba(239,228,198,.6);border-bottom-color:rgba(0,0,0,.45)}
#ui .btn:active{transform:translateY(2px);border-bottom-width:1px;margin-bottom:2px}
#ui .btn:focus-visible,#ui .seg button:focus-visible,#ui input:focus-visible{outline:3px solid var(--vang);outline-offset:2px}
#ui .btn[disabled]{opacity:.45;cursor:not-allowed;transform:none}
#ui .btn.pri{background:var(--vang);color:var(--ink);border-color:#f7cd5e;border-bottom-color:#8f6505;font-weight:800}
#ui .btn.go{background:var(--la);color:#fff;border-color:#86c06a;border-bottom-color:#2f5c1c}
#ui .btn.red{background:var(--son);color:#fff;border-color:#e0675d;border-bottom-color:#73180f}
#ui .btn.sm{font-size:.88em;padding:.28em .7em}
#ui .kb{display:inline-block;min-width:1.75em;padding:0 .4em;border-radius:4px;background:var(--paper);color:var(--ink);border-bottom:2px solid #b5a273;font-family:var(--fu);font-weight:800;font-size:.78em;line-height:1.55;text-align:center;white-space:nowrap}
#ui .tag{display:inline-block;padding:0 .45em;border:1px solid rgba(21,41,44,.35);border-radius:3px;font-size:.8em;font-weight:600;margin:.12em .3em .12em 0;line-height:1.55;white-space:nowrap}
#ui .tag.ok{border-color:#3f7a2a;color:#2b6118;background:rgba(95,161,66,.13)}
#ui .tag.no{border-color:#a8291f;color:#a8291f;background:rgba(200,53,42,.08)}
#ui .plate .tag{border-color:rgba(239,228,198,.35);color:var(--paper);background:none}
#ui .trk{position:relative;height:.5em;background:rgba(0,0,0,.45);border-radius:2px;overflow:hidden}
#ui .trk .fill{position:absolute;inset:0;transform-origin:0 50%;transform:scaleX(0);transition:transform .25s}
/* HUD */
#hud{position:absolute;inset:0;transition:opacity .35s}
#hud.dim{opacity:0}
#hud.dim *{pointer-events:none!important}
#col-tl{position:absolute;left:var(--m);top:var(--m);width:15.5em;display:flex;flex-direction:column;gap:.45em}
#hud-tl{padding:.6em .85em .75em}
#hud-tl .money{display:flex;align-items:center;gap:.35em;font-size:1.6em;font-weight:800;color:var(--vang);line-height:1.3}
#hud-tl .money .i{width:.8em;height:.8em;stroke-width:2.4}
#hud-tl .money.up{animation:mUp .6s ease-out}#hud-tl .money.down{animation:mDn .6s ease-out}
@keyframes mUp{from{color:var(--la2)}}@keyframes mDn{from{color:#ff8a7e}}
#hud-tl .ln{display:flex;align-items:center;gap:.45em;font-size:.92em;line-height:1.5;color:rgba(239,228,198,.82)}
#hud-tl .ln b{color:var(--paper);font-weight:800}
#hud-tl .meters{margin-top:.55em;display:grid;gap:.4em}
.mt{display:grid;grid-template-columns:1.15em 1fr;align-items:center;gap:.55em}
.mt .i{width:1.05em;height:1.05em}
.mt[data-b=hp]{color:#ef7468}.mt[data-b=hp] .fill{background:#ef7468}
.mt[data-b=hunger]{color:#e7a94b}.mt[data-b=hunger] .fill{background:#e7a94b}
.mt[data-b=stamina]{color:var(--la2)}.mt[data-b=stamina] .fill{background:var(--la2)}
.mt[data-b=drunk]{color:#d98f4e}.mt[data-b=drunk] .fill{background:#d98f4e}
.mt.low .i{animation:lowB 1s steps(2) infinite}
@keyframes lowB{50%{opacity:.2}}
#wanted{padding:.5em .8em .6em}
#wanted .wt{display:flex;align-items:center;gap:.45em;font-weight:800;font-size:.92em;line-height:1.45;color:#ff9b90;margin-bottom:.35em}
#wanted .fill{background:var(--son)}
#wanted.chased{background:var(--son);border-color:#ffd2cc;animation:alarm .5s steps(2) infinite}
#wanted.chased .wt{color:#fff}#wanted.chased .fill{background:#fff}
@keyframes alarm{50%{background-color:#8e1f17}}
#col-tr{position:absolute;right:var(--m);top:var(--m);width:13.5em}
#cond{padding:.4em .75em}
#cond .r{display:grid;grid-template-columns:1.25em 1fr auto;align-items:center;gap:.4em;font-size:.9em;line-height:1.8}
#cond .r .k{color:rgba(239,228,198,.68)}
#cond .r .v{font-weight:600;text-align:right;white-space:nowrap}
#cond .wa{display:inline-block;vertical-align:-.2em;transition:transform .3s}
#hud-menu{position:absolute;left:50%;top:var(--m);transform:translateX(-50%);display:flex;gap:.1em;padding:.2em}
#hud-menu .btn{padding:.3em .5em;gap:.3em;background:transparent;border-color:transparent;border-bottom-width:1px;border-radius:4px}
#hud-menu .btn:hover{background:rgba(239,228,198,.1);border-color:transparent}
#hud-menu .btn:active{margin-bottom:0;transform:translateY(1px)}
#hud-menu .btn .i{width:1.3em;height:1.3em}
#hud-menu .btn small{font-size:.72em;font-weight:800;color:rgba(239,228,198,.55)}
#banner{position:absolute;left:50%;top:calc(var(--m) + 3.3em);transform:translateX(-50%);display:flex;align-items:center;gap:.5em;padding:.35em 1.2em;background:var(--son);color:#fff;border:2px solid #fff;outline:2px solid var(--son);border-radius:4px;font-family:var(--fd);font-weight:800;font-size:1.3em;line-height:1.4;white-space:nowrap;box-shadow:0 3px 0 rgba(0,0,0,.4);z-index:44}
#banner.alarm{animation:alarm .5s steps(2) infinite}
#banner.blue{background:#1f5f8a;outline-color:#1f5f8a}
#hotbar{position:absolute;left:50%;bottom:var(--m);transform:translateX(-50%);display:flex;gap:.3em;padding:.3em}
#hotbar .slot{position:relative;width:3.4em;height:3.4em;border-radius:4px;background:rgba(0,0,0,.3);border:1px solid rgba(239,228,198,.14);display:flex;align-items:center;justify-content:center;cursor:pointer}
#hotbar .slot .em{font-size:1.6em;line-height:1.2}
#hotbar .slot:hover{border-color:var(--vang)}
#hotbar .slot.empty{cursor:default;opacity:.4;border-style:dashed}
#hotbar .slot.empty:hover{border-color:rgba(239,228,198,.14)}
#hotbar .slot .k{position:absolute;left:.3em;top:.05em;font-size:.72em;font-weight:800;color:rgba(239,228,198,.6)}
#hotbar .slot .c{position:absolute;right:.3em;bottom:.05em;font-size:.78em;font-weight:800;text-shadow:0 1px 0 #000}
#equip{position:absolute;left:var(--m);bottom:var(--m);width:16.5em;padding:.5em .8em;font-size:.92em}
#equip .er{display:grid;grid-template-columns:1.25em minmax(0,1fr) auto;gap:.45em;align-items:center;line-height:1.6}
#equip .er .i{color:rgba(239,228,198,.7)}
#equip .nm{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#equip .ct{font-weight:800;color:rgba(239,228,198,.8)}
#equip .fs{margin-top:.35em;padding-top:.35em;border-top:1px solid rgba(239,228,198,.14)}
#equip .fs .st{font-weight:800}
#equip .depth{color:var(--nuoc);font-weight:800}
#equip .mut{color:rgba(239,228,198,.55);font-size:.9em}
#col-br{position:absolute;right:var(--m);bottom:var(--m);display:flex;flex-direction:column;align-items:flex-end;gap:.5em;max-width:24em}
#hints{padding:.3em .7em;font-size:.86em;line-height:2.05;text-align:right}
#hints .hk{display:inline-block;margin-left:.75em;white-space:nowrap;color:rgba(239,228,198,.88)}
#hints .kb{margin-right:.35em}
#ui #pants{background:var(--paper);color:var(--ink);border:2px solid var(--son);border-bottom-width:4px;font-weight:800;font-size:.9em;padding:.3em .75em}
#ui #pants:hover{background:#fff}
#pants .pi{position:relative;width:1.3em;height:1.3em;color:var(--ink)}
#pants .pi .i{position:absolute;inset:0;width:100%;height:100%}
#pants .pi .i.x{color:var(--son);stroke-width:2.6}
#pants .kb{background:var(--ink);color:var(--paper);border-bottom-color:#000}
#npc{position:absolute;left:50%;top:62%;transform:translateX(-50%);display:flex;align-items:center;gap:.5em;padding:.4em .9em;font-weight:600;line-height:1.45}
/* toast */
#toasts{position:absolute;right:var(--m);top:var(--toast-top,13em);width:19em;display:flex;flex-direction:column;gap:.35em;align-items:flex-end;z-index:70}
.toast{padding:.45em .8em .45em .7em;font-size:.95em;font-weight:600;line-height:1.45;max-width:100%;background:rgba(21,41,44,.95);color:var(--paper);border-radius:4px;border-left:4px solid var(--nuoc);box-shadow:0 2px 0 rgba(0,0,0,.35);animation:tIn .22s ease-out;transition:opacity .35s,transform .35s}
.toast.good{border-left-color:var(--la2)}.toast.bad{border-left-color:#ef5a4c}.toast.warn{border-left-color:var(--vang)}
.toast.epic{background:var(--paper);color:var(--ink);border-left:6px solid var(--son);font-weight:800}
.toast.out{opacity:0;transform:translateX(1em)}
@keyframes tIn{from{opacity:0;transform:translateX(1.2em)}}
/* thông báo lớn */
#big{position:absolute;left:0;right:0;top:21%;text-align:center;pointer-events:none;z-index:45;padding:0 1em}
#big .t{font-family:var(--fd);font-weight:800;font-size:clamp(2.2em,4.4vw,4.4em);line-height:1.3;padding-top:.08em;text-shadow:0 .05em 0 rgba(0,0,0,.7),0 0 .45em rgba(0,0,0,.45)}
#big .s{display:inline-block;margin-top:.25em;padding:.3em .9em;background:rgba(21,41,44,.88);border-radius:4px;font-weight:600;font-size:1.12em;line-height:1.5;max-width:40em}
#big .s:empty{display:none}
#big.show{animation:bigIn .25s ease-out}
#big.fade{opacity:0;transition:opacity .5s}
@keyframes bigIn{from{opacity:0;transform:translateY(-.5em)}}
/* giữa màn hình */
#crosshair{position:absolute;left:50%;top:50%;width:2.4em;height:2.4em;transform:translate(-50%,-50%)}
#crosshair:before,#crosshair:after{content:'';position:absolute;background:var(--paper);box-shadow:0 0 0 1px rgba(0,0,0,.6)}
#crosshair:before{left:calc(50% - 1px);top:0;width:2px;height:100%}
#crosshair:after{top:calc(50% - 1px);left:0;height:2px;width:100%}
#crosshair i{position:absolute;inset:22%;border:2px solid var(--son);border-radius:50%}
#aimdot{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:var(--paper);box-shadow:0 0 0 1.5px var(--ink)}
#cast{position:absolute;left:calc(50% + 5em);top:50%;transform:translateY(-50%);width:2.5em;height:14em;padding:.3em .35em .45em;display:flex;flex-direction:column;align-items:center}
#cast .lbl{font-weight:800;font-size:.8em;line-height:1.5}
#cast .track{position:relative;flex:1;width:100%;background:rgba(0,0,0,.5) repeating-linear-gradient(to top,rgba(239,228,198,.28) 0 1px,transparent 1px 10%);border-radius:2px}
#cast .sweet{position:absolute;left:0;right:0;background:rgba(95,161,66,.5);border-top:2px solid var(--la2);border-bottom:2px solid var(--la2)}
#cast .fill{position:absolute;left:32%;right:32%;bottom:0;background:var(--vang)}
#cast .needle{position:absolute;left:-.4em;right:-.4em;height:3px;background:var(--paper);box-shadow:0 0 0 1px var(--ink)}
#cast.in{border-color:var(--la2)}#cast.in .needle{background:var(--la2)}
#strike{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:13em;height:13em;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.25em;z-index:30}
#strike .ring{position:absolute;inset:0;border-radius:50%;border:.35em solid var(--vang);box-shadow:0 0 0 .22em rgba(21,41,44,.55),inset 0 0 0 .22em rgba(21,41,44,.35)}
#strike .kcap{position:relative;font-weight:800;font-size:1.9em;line-height:1.35;padding:0 .7em;background:var(--paper);color:var(--ink);border-radius:6px;border-bottom:.2em solid #b5a273;animation:kp .3s ease-in-out infinite alternate}
#strike .sw{position:relative;font-family:var(--fd);font-weight:800;font-size:2em;line-height:1.3;color:#fff;text-shadow:0 .06em 0 rgba(0,0,0,.75)}
@keyframes kp{to{transform:translateY(.08em) scale(1.07)}}
/* vật cá */
#fight{position:absolute;left:50%;bottom:calc(var(--m) + 4.8em);transform:translateX(-50%);width:min(30em,94vw);padding:.55em .95em .7em}
#fight .f-top{display:flex;align-items:center;gap:.55em}
#fight .f-name{flex:1;min-width:0;display:flex;align-items:center;gap:.45em;font-family:var(--fd);font-weight:600;font-size:1.2em;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#fight .f-name .fig{width:2.1em;height:1.05em;flex:none}
#fight .f-name .tag{font-family:var(--fu);font-size:.66em}
#fight .f-dist{font-weight:800;color:var(--nuoc);font-size:1.05em;white-space:nowrap}
#fight .f-line{position:relative;height:3px;background:rgba(239,228,198,.14);margin:.3em 0 .5em}
#fight .f-line i{position:absolute;inset:0;background:var(--nuoc);transform-origin:0 50%;transform:scaleX(0)}
.f-row{display:grid;grid-template-columns:5.7em 1fr 2.9em;align-items:center;gap:.6em;margin:.3em 0;font-size:.9em}
.f-row .l{font-weight:600;color:rgba(239,228,198,.8);line-height:1.45}
.f-row .p{text-align:right;font-weight:800}
.f-row .trk{height:.8em}
#fight .tens .trk{background:rgba(0,0,0,.45) linear-gradient(90deg,transparent 60%,rgba(240,179,35,.22) 60% 85%,rgba(200,53,42,.38) 85%)}
#fight .tens .fill{background:var(--la2)}#fight .tens.z2 .fill{background:var(--vang)}#fight .tens.z3 .fill{background:#ef5a4c}
#fight .tens.z3 .p{color:#ff8a7e}
#fight .tens.danger .trk{animation:shk .09s linear infinite}
@keyframes shk{50%{transform:translateX(2px)}}
#fight .stam .fill,#combat .fish .fill{background:var(--nuoc)}
#combat .fish .fill{background:#ef7468}#combat .me .fill{background:var(--la2)}
#fight .f-dir{display:flex;align-items:center;justify-content:center;gap:.8em;margin-top:.45em}
#fight .f-dir .kb{font-size:1.1em;min-width:2.1em;opacity:.3}
#fight .f-dir .kb.on{opacity:1;background:var(--vang)}
#fight .f-dir .kb.ok{opacity:1;background:var(--la2)}
#fight .f-arrow{display:inline-flex;transition:transform .15s}
#fight .f-arrow .i{width:2em;height:2em;stroke-width:2.4}
#fight .f-arrow.idle{opacity:.35}
#fight .f-jump{margin-top:.45em;padding:.25em .6em;background:var(--son);color:#fff;font-weight:800;text-align:center;border-radius:3px;line-height:1.45;animation:alarm .4s steps(2) infinite}
#fight .f-hint{margin-top:.4em;text-align:center;font-size:.88em;line-height:1.45;color:rgba(239,228,198,.85)}
#combat{position:absolute;left:50%;top:calc(var(--m) + 3.3em);transform:translateX(-50%);width:min(26em,90vw);padding:.5em .9em .6em}
#combat .c-n{font-family:var(--fd);font-weight:600;font-size:1.2em;line-height:1.45;text-align:center}
/* hội thoại */
#dialog{position:absolute;left:50%;bottom:var(--m);transform:translateX(-50%);width:min(48em,94vw);padding:1.3em 1.2em .9em;z-index:40;background:rgba(21,41,44,.96)}
#dialog .who{position:absolute;left:1em;top:0;transform:translateY(-55%);padding:.1em .8em;background:var(--paper);color:var(--ink);font-family:var(--fd);font-weight:800;font-size:1.1em;line-height:1.45;border-radius:3px;box-shadow:0 2px 0 rgba(0,0,0,.35)}
#dialog .txt{font-size:1.08em;line-height:1.6;min-height:3.3em;white-space:pre-wrap;cursor:pointer}
#dialog .opts{display:flex;flex-wrap:wrap;gap:.5em;margin-top:.8em;justify-content:flex-end}
#dialog .esc{position:absolute;right:1em;top:.4em;font-size:.78em;color:rgba(239,228,198,.55)}
/* bảng (tờ sổ) */
#panelWrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:var(--m);background:rgba(8,18,20,.55);z-index:60}
#panel{width:min(56em,96vw);max-height:90vh;display:flex;flex-direction:column;background:var(--paper);color:var(--ink);border-radius:3px;box-shadow:0 .45em 0 rgba(0,0,0,.35);animation:pIn .18s ease-out}
@keyframes pIn{from{opacity:0;transform:translateY(.6em)}}
#panel .ph{display:flex;align-items:flex-end;justify-content:space-between;gap:1em;padding:.75em 1.2em .55em;border-bottom:3px double rgba(21,41,44,.5)}
#panel .ph h2{margin:0;font-family:var(--fd);font-weight:800;font-size:1.75em;line-height:1.35;padding-top:.08em}
#panel .ph .sub{font-size:.9em;font-weight:600;color:rgba(21,41,44,.7)}
#panel .ph .btn{flex:none}
#panel .pb{padding:.75em 1.2em 1.2em;overflow-y:auto;line-height:1.45}
#panel .pb::-webkit-scrollbar{width:8px}#panel .pb::-webkit-scrollbar-thumb{background:rgba(21,41,44,.3);border-radius:4px}
#panel h3{margin:1.1em 0 .3em;padding-bottom:.1em;font-family:var(--fd);font-weight:600;font-size:1.2em;line-height:1.4;border-bottom:1px solid rgba(21,41,44,.45)}
#panel h3:first-child{margin-top:0}
#panel .btn:not(.pri):not(.go):not(.red){background:transparent;color:var(--ink);border-color:rgba(21,41,44,.45);border-bottom-color:rgba(21,41,44,.65)}
#panel .btn:not(.pri):not(.go):not(.red):hover{background:rgba(21,41,44,.06)}
#panel .btn:focus-visible,#panel .seg button:focus-visible,#panel input:focus-visible{outline-color:var(--son)}
#panel .kb{background:var(--ink);color:var(--paper);border-bottom-color:#000}
#panel .mut{color:rgba(21,41,44,.6)}
.lr{display:grid;grid-template-columns:2.4em minmax(0,1fr) auto;gap:.2em .8em;align-items:center;padding:.5em .4em;border-bottom:1px dashed var(--rule)}
.lr-ic{font-size:1.55em;line-height:1.2;text-align:center}
.lr-ic .i{width:1em;height:1em}
.lr-ic .fig{width:1.5em;height:.75em}
.lr-nm{font-weight:800;line-height:1.4}
.lr-ds{font-size:.88em;color:rgba(21,41,44,.72)}
.lr-tags{margin-top:.15em}
.lr-side{display:flex;align-items:center;gap:.6em;justify-content:flex-end;flex-wrap:wrap}
.lr.cur{box-shadow:inset 4px 0 0 var(--la);background:rgba(95,161,66,.11)}
.lr.off .lr-nm,.lr.off .lr-ic,.lr.off .lr-ds{opacity:.55}
.lr .w{font-weight:800;min-width:5em;text-align:right}
.pr{font-weight:800;white-space:nowrap}
.sell{display:flex;align-items:center;justify-content:space-between;gap:1em;flex-wrap:wrap;padding:.5em .8em;margin:.2em 0 .5em;background:rgba(240,179,35,.22);border:1px solid rgba(143,101,5,.5);border-radius:3px;font-weight:600}
.tally{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:1px solid rgba(21,41,44,.35);border-radius:3px;margin-bottom:.4em}
.tally div{padding:.3em .6em;border-right:1px solid var(--rule)}
.tally div:last-child{border-right:0}
.tally small{display:block;font-size:.78em;font-weight:600;color:rgba(21,41,44,.65)}
.tally b{font-size:1.15em}
.empty{padding:.6em 0;color:rgba(21,41,44,.65)}
.dex{display:grid;grid-template-columns:repeat(auto-fill,minmax(16.5em,1fr));gap:.8em}
.idc{position:relative;background:var(--paper2);border:1px solid rgba(21,41,44,.55);border-radius:2px;padding:.5em .75em .65em;box-shadow:2px 2px 0 rgba(21,41,44,.2)}
.idc-h{display:flex;justify-content:space-between;align-items:center;gap:.5em;font-size:.78em;font-weight:800;line-height:1.5;border-bottom:1px solid rgba(21,41,44,.35);padding-bottom:.15em;margin-bottom:.4em;color:rgba(21,41,44,.72)}
.idc-h .cat{display:inline-flex;align-items:center;gap:.35em}
.dot{display:inline-block;width:.75em;height:.75em;border-radius:50%;border:1px solid rgba(21,41,44,.6)}
.idc-fig{display:flex;align-items:center;justify-content:center;height:4.2em;margin-bottom:.4em;border:1px solid rgba(21,41,44,.15);background:repeating-linear-gradient(0deg,transparent 0 .85em,rgba(79,179,191,.22) .85em calc(.85em + 1px))}
.idc-fig .fig{width:6.4em;height:3.2em}
.idc-nm{font-family:var(--fd);font-weight:600;font-size:1.25em;line-height:1.4}
.idc.unk .idc-nm{color:rgba(21,41,44,.45)}
.idc dl{display:grid;grid-template-columns:auto 1fr;gap:.05em .7em;margin:.3em 0 0;font-size:.86em}
.idc dt{color:rgba(21,41,44,.6);font-weight:600}
.idc dd{margin:0}
.idc .tech{margin-top:.4em;padding-top:.3em;border-top:1px dashed var(--rule);font-size:.85em}
.idc .ds{font-size:.86em;color:rgba(21,41,44,.75);margin-top:.2em}
.stamp{position:absolute;right:.7em;top:2.3em;transform:rotate(-11deg);border:2px solid var(--son);color:var(--son);padding:0 .45em;font-weight:800;font-size:.8em;line-height:1.5;border-radius:3px;opacity:.85;background:rgba(248,241,220,.6)}
.keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(17em,1fr));gap:0 1.4em}
.keys div{display:grid;grid-template-columns:7em 1fr;align-items:center;gap:.5em;border-bottom:1px dashed var(--rule);padding:.25em 0}
.keys .kb{justify-self:start;font-size:.85em}
.tips{margin:.3em 0 0;padding-left:1.2em}.tips li{margin:.35em 0}
.rule{margin-top:1em;padding:.45em 1em;background:var(--son);color:#fff;font-family:var(--fd);font-weight:800;font-size:1.25em;line-height:1.4;text-align:center;border:2px solid #fff;outline:2px solid var(--son);border-radius:3px}
.pz{display:grid;gap:.55em;max-width:24em;margin:0 auto}
.pz .btn{font-size:1.05em;padding:.5em}
.pz .fld{display:grid;gap:.35em;padding:.55em 0 .2em;border-top:1px dashed var(--rule)}
.pz .fld>span{font-weight:600}
.vol{display:flex;align-items:center;gap:.7em}
.vol input{flex:1;accent-color:var(--son)}
.seg{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid rgba(21,41,44,.5);border-radius:4px;overflow:hidden}
.seg button{font-family:var(--fu);font-weight:600;font-size:.95em;line-height:1.4;background:transparent;color:var(--ink);border:0;border-right:1px solid rgba(21,41,44,.3);padding:.4em 0;cursor:pointer}
.seg button:last-child{border-right:0}
.seg button[aria-pressed=true]{background:var(--ink);color:var(--paper);font-weight:800}
.seg button[disabled]{opacity:.45;cursor:not-allowed}
/* màn hình tiêu đề: biển hiệu sắt tráng men treo trên sào tre */
#title{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:50;padding:var(--m);background:linear-gradient(180deg,rgba(8,18,20,.05) 25%,rgba(8,18,20,.82))}
#title .t-wrap{display:flex;flex-direction:column;align-items:center;gap:1.3em;max-width:46em;text-align:center}
#title .hang{position:relative;display:flex;flex-direction:column;align-items:center}
#title .pole{width:calc(100% + 5em);height:.8em;border-radius:.4em;background:#a88a44 repeating-linear-gradient(90deg,#c2a35a 0 5em,#6f5627 5em calc(5em + 3px),#b39550 calc(5em + 3px) calc(5em + 7px));box-shadow:0 2px 0 rgba(0,0,0,.45)}
#title .sign{position:relative;margin-top:2em;padding:.7em 2.4em .8em;background:var(--paper);color:var(--ink);border:.4em solid var(--son);border-radius:.55em;box-shadow:inset 0 0 0 .3em var(--paper),inset 0 0 0 .45em var(--ink),0 .5em 0 rgba(0,0,0,.45);transform:rotate(-1.6deg);transform-origin:50% -2em;animation:swingIn .9s cubic-bezier(.3,1.6,.5,1) both}
#title .sign:before,#title .sign:after{content:'';position:absolute;top:-2.45em;width:2px;height:2.1em;background:rgba(239,228,198,.75)}
#title .sign:before{left:16%}#title .sign:after{right:16%}
@keyframes swingIn{from{opacity:0;transform:rotate(-9deg) translateY(-.6em)}}
#title .rv{position:absolute;width:.6em;height:.6em;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fffbe8,#8a7a55 65%)}
#title .rv.a{left:.75em;top:.75em}#title .rv.b{right:.75em;top:.75em}#title .rv.c{left:.75em;bottom:.75em}#title .rv.d{right:.75em;bottom:.75em}
#title .chip{position:absolute;background:#6b3a1f;opacity:.55;border-radius:40% 60% 55% 45%}
#title .chip.a{left:-.2em;top:38%;width:.9em;height:.6em}#title .chip.b{right:22%;bottom:-.25em;width:1.3em;height:.5em}
#title .s-top{font-family:var(--fd);font-weight:800;font-size:clamp(1.9em,4vw,3.2em);line-height:1.3;padding-top:.15em}
#title .s-main{font-family:var(--fd);font-weight:800;font-size:clamp(3.4em,8.2vw,6.8em);line-height:1.3;margin:-.2em 0 -.12em;color:var(--son)}
#title .s-foot{margin-top:.15em;padding-top:.35em;border-top:2px solid var(--ink);font-weight:600;font-size:clamp(.85em,1.35vw,1.1em);line-height:1.5}
#title .s-3d{position:absolute;right:-1.3em;top:-1.2em;width:3.3em;height:3.3em;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--vang);color:var(--ink);border:.14em solid var(--ink);font-family:var(--fd);font-weight:800;font-size:1.35em;line-height:1.3;transform:rotate(12deg);box-shadow:0 .12em 0 rgba(0,0,0,.35)}
#title .t-sub{margin:0;font-size:1.08em;font-weight:600;line-height:1.55;max-width:34em;text-shadow:0 1px 2px rgba(0,0,0,.9)}
#title .t-btns{display:flex;gap:.7em;flex-wrap:wrap;justify-content:center}
#title .t-btns .btn{font-size:1.2em;padding:.5em 1.4em}
#title .t-foot{position:absolute;bottom:var(--m);left:0;right:0;font-size:.85em;color:rgba(239,228,198,.75);text-shadow:0 1px 2px #000}
@media (max-width:760px){#hints{display:none}#equip{width:13em}#col-tl{width:13em}#col-tr{width:11.5em}#hud-menu{top:auto;bottom:calc(var(--m) + 4.3em)}}
@media (prefers-reduced-motion:reduce){#ui *,#ui *:before,#ui *:after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}}
`;

  // ---------- DOM ----------
  let root = null;
  const E = {};
  let built = false;
  function mk(parent, tag, id, cls, html) {
    const el = document.createElement(tag);
    if (id) el.id = id;
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    parent.appendChild(el);
    return el;
  }
  // setter có cache — chỉ chạm DOM khi giá trị đổi
  function setTxt(el, v) { if (el && el._t !== v) { el._t = v; el.textContent = v; } }
  function setHTML(el, v) { if (el && el._h !== v) { el._h = v; el.innerHTML = v; } }
  function setScale(el, f) { if (!el) return; const s = clamp(f, 0, 1).toFixed(3); if (el._s !== s) { el._s = s; el.style.transform = 'scaleX(' + s + ')'; } }
  function tog(el, cls, on) { if (!el) return; on = !!on; const k = '_c_' + cls; if (el[k] !== on) { el[k] = on; el.classList.toggle(cls, on); } }

  function build() {
    if (built) return;
    root = document.getElementById('ui');
    if (!root) { root = document.createElement('div'); root.id = 'ui'; document.body.appendChild(root); }
    const st = document.createElement('style'); st.id = 'ui-css'; st.textContent = CSS; document.head.appendChild(st);
    built = true;

    E.hud = mk(root, 'div', 'hud');
    const hud = E.hud;
    E.colTL = mk(hud, 'div', 'col-tl');
    E.tl = mk(E.colTL, 'div', 'hud-tl', 'plate', `
      <div class="money">${ic('coin')}<span>0₫</span></div>
      <div class="ln"><span class="dn">${ic('sun')}</span><b class="ck">06:30</b><span class="dy">Ngày 1</span></div>
      <div class="ln">${ic('pin')}<span class="ev">…</span></div>
      <div class="meters">
        <div class="mt" data-b="hp" title="Máu">${ic('heart')}<div class="trk"><div class="fill"></div></div></div>
        <div class="mt" data-b="hunger" title="No">${ic('banhmi')}<div class="trk"><div class="fill"></div></div></div>
        <div class="mt" data-b="stamina" title="Thể lực">${ic('bolt')}<div class="trk"><div class="fill"></div></div></div>
        <div class="mt hide" data-b="drunk" title="Say">${ic('bottle')}<div class="trk"><div class="fill"></div></div></div>
      </div>`);
    E.money = E.tl.querySelector('.money'); E.moneyT = E.money.querySelector('span');
    E.dn = E.tl.querySelector('.dn'); E.ck = E.tl.querySelector('.ck'); E.dy = E.tl.querySelector('.dy'); E.ev = E.tl.querySelector('.ev');
    E.bars = {};
    E.tl.querySelectorAll('.mt').forEach((b) => { E.bars[b.dataset.b] = { el: b, fill: b.querySelector('.fill') }; });
    E.wanted = mk(E.colTL, 'div', 'wanted', 'plate hide', `<div class="wt">${ic('whistle')}<span>Quản lý đang để ý</span></div><div class="trk"><div class="fill"></div></div>`);
    E.wantedFill = E.wanted.querySelector('.fill'); E.wantedT = E.wanted.querySelector('.wt span');

    E.colTR = mk(hud, 'div', 'col-tr');
    E.cond = mk(E.colTR, 'div', 'cond', 'plate', `
      <div class="r" data-r="temp">${ic('thermo')}<span class="k">Nước</span><span class="v">…</span></div>
      <div class="r" data-r="tide">${ic('tide')}<span class="k">Thủy triều</span><span class="v">…</span></div>
      <div class="r" data-r="wx"><span class="wi">${ic('sun')}</span><span class="k">Thời tiết</span><span class="v">…</span></div>
      <div class="r" data-r="wind">${ic('wind')}<span class="k">Gió</span><span class="v"><span class="wv">0</span> <span class="wa">${ic('arrow')}</span></span></div>
      <div class="r hide" data-r="wave">${ic('wave')}<span class="k">Sóng</span><span class="v">…</span></div>
      <div class="r hide" data-r="depth">${ic('depth')}<span class="k">Đáy tại phao</span><span class="v">…</span></div>`);
    E.cr = {};
    E.cond.querySelectorAll('.r').forEach((r) => { E.cr[r.dataset.r] = { el: r, v: r.querySelector('.v') }; });
    E.wxIcon = E.cond.querySelector('.wi'); E.windV = E.cond.querySelector('.wv'); E.windA = E.cond.querySelector('.wa');

    E.menu = mk(hud, 'div', 'hud-menu', 'plate ui-interactive', `
      <button class="btn" data-act="open" data-id="inventory" title="Túi đồ (I)" aria-label="Túi đồ">${ic('bag')}<small>I</small></button>
      <button class="btn" data-act="open" data-id="craft" title="Chế tạo (C)" aria-label="Chế tạo">${ic('hammer')}<small>C</small></button>
      <button class="btn" data-act="open" data-id="map" title="Bản đồ (M)" aria-label="Bản đồ">${ic('map')}<small>M</small></button>
      <button class="btn" data-act="open" data-id="fishdex" title="Sách cá (K)" aria-label="Sách cá">${ic('book')}<small>K</small></button>
      <button class="btn" data-act="open" data-id="help" title="Trợ giúp (H)" aria-label="Trợ giúp">${ic('help')}<small>H</small></button>
      <button class="btn" data-act="open" data-id="pause" title="Tạm dừng (Esc)" aria-label="Tạm dừng">${ic('pause')}<small>Esc</small></button>`);
    E.hotbar = mk(hud, 'div', 'hotbar', 'plate ui-interactive');
    E.equip = mk(hud, 'div', 'equip', 'plate', `
      <div class="er">${ic('rod')}<span class="nm rodn">—</span><span class="tag rodt"></span></div>
      <div class="er">${ic('spool')}<span class="nm linen">—</span><span></span></div>
      <div class="er">${ic('bait')}<span class="nm baitn">—</span><span class="ct baitc"></span></div>
      <div class="fs hide"><div class="st"></div><div class="dp hide">Độ sâu mồi <span class="depth">0 m</span> <span class="mut">(lăn chuột)</span></div></div>`);
    E.eRod = E.equip.querySelector('.rodn'); E.eRodT = E.equip.querySelector('.rodt'); E.eLine = E.equip.querySelector('.linen');
    E.eBait = E.equip.querySelector('.baitn'); E.eBaitC = E.equip.querySelector('.baitc');
    E.eFs = E.equip.querySelector('.fs'); E.eSt = E.equip.querySelector('.st'); E.eDp = E.equip.querySelector('.dp'); E.eDepth = E.equip.querySelector('.depth');
    E.colBR = mk(hud, 'div', 'col-br');
    E.pants = mk(E.colBR, 'button', 'pants', 'btn ui-interactive', `<span class="pi">${ic('pants')}${ic('slash', 'x')}</span>Nhét cá vào quần<span class="kb">P</span>`);
    E.pants.dataset.act = 'pants';
    E.pants.title = 'Luật cấm, nhưng cứ thử xem';
    E.hints = mk(E.colBR, 'div', 'hints', 'plate');
    E.npc = mk(hud, 'div', 'npc', 'plate hide');

    E.banner = mk(root, 'div', 'banner', 'hide');
    E.crosshair = mk(root, 'div', 'crosshair', 'hide', '<i></i>');
    E.aimdot = mk(root, 'div', 'aimdot', 'hide');
    E.cast = mk(root, 'div', 'cast', 'plate hide', '<div class="lbl">Lực</div><div class="track"><div class="sweet"></div><div class="fill"></div><div class="needle"></div></div>');
    E.castFill = E.cast.querySelector('.fill'); E.castSweet = E.cast.querySelector('.sweet'); E.castNeedle = E.cast.querySelector('.needle');
    E.strike = mk(root, 'div', 'strike', 'hide', '<div class="ring"></div><div class="kcap">Space</div><div class="sw">Giật!</div>');
    E.strikeRing = E.strike.querySelector('.ring');
    E.fight = mk(root, 'div', 'fight', 'plate hide', `
      <div class="f-top"><div class="f-name">—</div><div class="f-dist">0 m</div></div>
      <div class="f-line" title="Dây đã ra"><i></i></div>
      <div class="f-row tens"><span class="l">Độ căng dây</span><div class="trk"><div class="fill"></div></div><span class="p">0%</span></div>
      <div class="f-row stam"><span class="l">Sức cá</span><div class="trk"><div class="fill"></div></div><span class="p">100%</span></div>
      <div class="f-dir"><span class="kb ka">A</span><span class="f-arrow idle">${ic('arrow')}</span><span class="kb kd">D</span></div>
      <div class="f-jump hide">Cá nhảy! Nhấn S hạ cần</div>
      <div class="f-hint"></div>`);
    E.fName = E.fight.querySelector('.f-name'); E.fDist = E.fight.querySelector('.f-dist'); E.fLine = E.fight.querySelector('.f-line i');
    E.fTension = E.fight.querySelector('.tens'); E.fTensionFill = E.fTension.querySelector('.fill'); E.fTensionP = E.fTension.querySelector('.p');
    E.fStamFill = E.fight.querySelector('.stam .fill'); E.fStamP = E.fight.querySelector('.stam .p');
    E.fArrow = E.fight.querySelector('.f-arrow'); E.fKA = E.fight.querySelector('.ka'); E.fKD = E.fight.querySelector('.kd');
    E.fJump = E.fight.querySelector('.f-jump'); E.fHint = E.fight.querySelector('.f-hint');
    E.combat = mk(root, 'div', 'combat', 'plate hide', `
      <div class="c-n">—</div>
      <div class="f-row fish"><span class="l">Cá</span><div class="trk"><div class="fill"></div></div><span class="p"></span></div>
      <div class="f-row me"><span class="l">Bạn</span><div class="trk"><div class="fill"></div></div><span class="p"></span></div>`);
    E.cName = E.combat.querySelector('.c-n'); E.cFish = E.combat.querySelector('.fish .fill'); E.cMe = E.combat.querySelector('.me .fill');
    E.cFishP = E.combat.querySelector('.fish .p'); E.cMeP = E.combat.querySelector('.me .p');
    E.toasts = mk(root, 'div', 'toasts');
    E.big = mk(root, 'div', 'big', 'hide', '<div class="t"></div><div class="s"></div>');
    E.dialog = mk(root, 'div', 'dialog', 'plate ui-interactive hide', '<div class="who"></div><div class="esc">Esc để đóng</div><div class="txt"></div><div class="opts"></div>');
    E.dWho = E.dialog.querySelector('.who'); E.dTxt = E.dialog.querySelector('.txt'); E.dOpts = E.dialog.querySelector('.opts');
    E.panelWrap = mk(root, 'div', 'panelWrap', 'ui-interactive hide', `<div id="panel" role="dialog" aria-modal="true"><div class="ph"><div><h2></h2><div class="sub"></div></div><button class="btn sm" data-act="close">${ic('close')}Đóng <span class="kb">Esc</span></button></div><div class="pb"></div></div>`);
    E.panel = E.panelWrap.querySelector('#panel'); E.pTitle = E.panel.querySelector('h2'); E.pSub = E.panel.querySelector('.sub'); E.pBody = E.panel.querySelector('.pb');
    E.pClose = E.panel.querySelector('[data-act="close"]');
    E.title = mk(root, 'div', 'title', 'ui-interactive hide', `
      <div class="t-wrap">
        <div class="hang">
          <div class="pole"></div>
          <div class="sign" role="img" aria-label="Câu Cá Vạn Cân 3D">
            <span class="rv a"></span><span class="rv b"></span><span class="rv c"></span><span class="rv d"></span>
            <span class="chip a"></span><span class="chip b"></span>
            <div class="s-top">CÂU CÁ</div>
            <div class="s-main">VẠN CÂN</div>
            <div class="s-foot">Đồ câu – Mồi sống – Bánh mì pate 15k</div>
            <div class="s-3d">3D</div>
          </div>
        </div>
        <p class="t-sub">Câu từ con rô bé xíu tới quái vật vạn cân, ở ao, sông, núi, biển và cả trên máy bay. Nhớ luật: không được nhét cá vào quần.</p>
        <div class="t-btns">
          <button class="btn pri" data-act="play">Chơi</button>
          <button class="btn" data-act="newgame">Chơi mới</button>
          <button class="btn" data-act="open" data-id="help">Hướng dẫn</button>
        </div>
      </div>
      <div class="t-foot"><span class="kb">N</span> bật/tắt âm thanh</div>`);

    // sự kiện click chung
    root.addEventListener('click', onClick);
    E.panelWrap.addEventListener('mousedown', (e) => { if (e.target === E.panelWrap) closePanel(); });
    E.dTxt.addEventListener('click', () => { if (typing) finishTyping(); });
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t && t.dataset && t.dataset.vol != null) { if (G.audio && G.audio.setMasterVolume) G.audio.setMasterVolume(t.value / 100); const l = root.querySelector('#volval'); if (l) l.textContent = t.value + '%'; }
    });
    window.addEventListener('keydown', onNavKey);
    window.addEventListener('resize', () => { toastTopKey = null; });
  }

  // ---------- Điều hướng bàn phím trong menu (core chặn Tab mặc định) ----------
  function topScope() { if (panelName) return E.panel; if (dialogOpen) return E.dialog; if (titleOpen) return E.title; return null; }
  function focusables(sc) { return Array.prototype.filter.call(sc.querySelectorAll('button:not([disabled]),input'), (el) => el.offsetParent !== null); }
  function focusEl(el) { if (!el) return; try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } if (el.scrollIntoView && E.pBody && E.pBody.contains(el)) el.scrollIntoView({ block: 'nearest' }); }
  function dropFocus() { const a = document.activeElement; if (a && root && root.contains(a) && a.blur) a.blur(); }
  function onNavKey(e) {
    if (!built) return;
    const sc = topScope(); if (!sc) return;
    const inInput = e.target && e.target.tagName === 'INPUT';
    const isTab = e.code === 'Tab';
    const isArrow = e.code === 'ArrowDown' || e.code === 'ArrowUp' || e.code === 'ArrowLeft' || e.code === 'ArrowRight';
    if (!isTab && !(isArrow && !inInput)) return;
    const list = focusables(sc); if (!list.length) return;
    let i = list.indexOf(document.activeElement);
    const back = (isTab && e.shiftKey) || e.code === 'ArrowUp' || e.code === 'ArrowLeft';
    i = i < 0 ? (back ? list.length - 1 : 0) : (i + (back ? -1 : 1) + list.length) % list.length;
    focusEl(list[i]);
    e.preventDefault();
  }

  // ---------- Toast ----------
  function toast(msg, type) {
    build();
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.textContent = String(msg);
    el.setAttribute('role', 'status');
    E.toasts.appendChild(el);
    while (E.toasts.children.length > 5) E.toasts.removeChild(E.toasts.firstChild);
    const life = type === 'epic' ? 5200 : type === 'bad' || type === 'warn' ? 4000 : 3300;
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, life);
  }

  // ---------- Big message ----------
  let bigTimer = null, bigTimer2 = null;
  function bigMessage(text, sub, color) {
    build();
    const t = E.big.querySelector('.t'), s = E.big.querySelector('.s');
    t.textContent = text || ''; s.textContent = sub || '';
    t.style.color = color || '#f0b323';
    E.big.classList.remove('hide', 'show', 'fade');
    void E.big.offsetWidth;
    E.big.classList.add('show');
    clearTimeout(bigTimer); clearTimeout(bigTimer2);
    bigTimer = setTimeout(() => { E.big.classList.add('fade'); bigTimer2 = setTimeout(() => E.big.classList.add('hide'), 550); }, 2600);
  }

  // ---------- Banner (quản lý) ----------
  let bannerTimer = null;
  function banner(text, ms, blue) {
    build();
    E.banner.innerHTML = ic(blue ? 'badge' : 'whistle') + '<span>' + esc(text) + '</span>';
    E.banner.classList.toggle('blue', !!blue);
    E.banner.classList.toggle('alarm', !ms && !blue); // chỉ nháy khi đang bị đuổi (cảnh báo liên tục)
    E.banner.classList.remove('hide');
    clearTimeout(bannerTimer);
    if (ms) bannerTimer = setTimeout(() => E.banner.classList.add('hide'), ms);
  }
  function hideBanner() { clearTimeout(bannerTimer); if (E.banner) E.banner.classList.add('hide'); }

  // ---------- Hội thoại ----------
  let dialogOpen = false, typing = false, typeFull = '', typeIdx = 0, typeTimer = null, dialogOpts = [];
  function dialog(npcName, text, options) {
    build();
    dialogOpen = true;
    E.dWho.textContent = npcName || '…';
    typeFull = String(text || ''); typeIdx = 0; typing = true;
    E.dTxt.textContent = '';
    clearInterval(typeTimer);
    typeTimer = setInterval(() => {
      typeIdx += 2;
      if (typeIdx >= typeFull.length) { finishTyping(); return; }
      E.dTxt.textContent = typeFull.slice(0, typeIdx);
      if (typeIdx % 6 === 0) sfx('click', { volume: 0.25 });
    }, 28);
    dialogOpts = (options && options.length ? options : [{ label: 'Tạm biệt' }]).map((o) => (typeof o === 'string' ? { label: o } : o));
    E.dOpts.innerHTML = dialogOpts.map((o, i) => `<button class="btn ${i === 0 ? 'pri' : ''}" data-act="dopt" data-id="${i}">${esc(o.label)}</button>`).join('');
    E.dialog.classList.remove('hide');
    openFrame = frame;
    syncBlocked();
  }
  function finishTyping() { typing = false; clearInterval(typeTimer); E.dTxt.textContent = typeFull; }
  function closeDialog() {
    if (!dialogOpen) return;
    dialogOpen = false; typing = false; clearInterval(typeTimer);
    E.dialog.classList.add('hide');
    dropFocus();
    syncBlocked();
  }

  // ---------- Panel ----------
  let panelName = null, panelOpts = null, frame = 0, openFrame = -1;
  function openPanel(name, opts) {
    build();
    if (panelName === 'pause' && name !== 'pause' && name !== 'help') G.paused = false;
    const same = panelName === name;
    panelName = name; panelOpts = opts || {};
    if (name === 'pause') G.paused = true;
    E.panelWrap.classList.remove('hide');
    if (!same) { E.panel.style.animation = 'none'; void E.panel.offsetWidth; E.panel.style.animation = ''; }
    renderPanel(true);
    E.pBody.scrollTop = 0;
    focusEl(name === 'pause' ? E.pBody.querySelector('[data-act="resume"]') : E.pClose);
    openFrame = frame;
    sfx('pop', { volume: 0.5 });
    syncBlocked();
  }
  function closePanel() {
    if (!panelName) return;
    if (panelName === 'help' && panelOpts && panelOpts.back === 'pause') { openPanel('pause'); return; }
    if (panelName === 'pause' || G.paused) G.paused = false;
    panelName = null; panelOpts = null;
    E.panelWrap.classList.add('hide');
    dropFocus();
    if (titleOpen) focusEl(E.title.querySelector('[data-act="play"]'));
    syncBlocked();
  }
  function isOpen() { return !!panelName || dialogOpen || titleOpen; }
  function syncBlocked() { if (G.input) G.input.blocked = isOpen(); }
  let rerenderT = null;
  function rerenderSoon() { clearTimeout(rerenderT); rerenderT = setTimeout(() => { if (panelName) renderPanel(); }, 80); }

  // ----- nội dung từng panel -----
  function fishValue(f) {
    if (!f) return 0;
    if (has(S(), 'fishValue')) { const v = call(S(), 'fishValue', f); if (typeof v === 'number') return v; }
    if (f.value) return f.value;
    const sp = G.fish && G.fish.get ? G.fish.get(f.speciesId || f.id) : null;
    return sp ? Math.round((sp.price || 0) * (f.weight || 0)) : 0;
  }
  function fishBagTotal() {
    if (has(S(), 'bagValue')) { const v = call(S(), 'bagValue'); if (typeof v === 'number') return v; }
    return ((G.state && G.state.fishBag) || []).reduce((s, f) => s + fishValue(f), 0);
  }
  // icon vật phẩm: emoji trong dữ liệu là nội dung; không có thì dùng SVG theo loại
  function itemIcon(it) {
    if (!it) return ic('bag');
    if (it.icon) return esc(it.icon);
    return ic({ rod: 'rod', line: 'spool', boat: 'boat', bait: 'bait' }[it.type] || 'bag');
  }
  function curRod() { return item((G.state.equipped || {}).rod) || {}; }
  function sellBox() {
    const bag = G.state.fishBag || [];
    return `<div class="sell"><span>Giỏ cá: <b>${bag.length}</b> con, ước tính <b>${money(fishBagTotal())}</b></span>
      <button class="btn pri sm" data-act="sellAll" ${bag.length ? '' : 'disabled'}>Bán hết cá</button></div>`;
  }
  function lrow(o) {
    return `<div class="lr ${o.cls || ''}"><div class="lr-ic">${o.ic || ''}</div><div class="lr-main"><div class="lr-nm">${o.name}</div>${o.desc ? `<div class="lr-ds">${o.desc}</div>` : ''}${o.tags ? `<div class="lr-tags">${o.tags}</div>` : ''}</div><div class="lr-side">${o.side || ''}</div></div>`;
  }
  function owns(it, id) {
    const st = G.state;
    return !!it && ((it.type === 'rod' && (st.ownedRods || []).includes(id)) || (it.type === 'line' && (st.ownedLines || []).includes(id)) || (it.type === 'boat' && (st.ownedBoats || []).includes(id)));
  }

  const PANELS = {
    inventory() {
      const st = G.state;
      const bag = st.fishBag || [];
      const s = st.stats || {};
      let h = `<div class="tally"><div><small>Đã câu</small><b>${s.caught || 0}</b></div><div><small>Con lớn nhất</small><b>${wfmt(s.biggest || 0)}</b></div><div><small>Rác vớt được</small><b>${s.junk || 0}</b></div><div><small>Vụ nổ</small><b>${s.explosions || 0}</b></div><div><small>Loài đã gặp</small><b>${Object.keys(st.discovered || {}).length}</b></div></div>`;
      h += `<h3>Giỏ cá (${bag.length})</h3>`;
      if (bag.length) {
        h += sellBox();
        h += bag.map((f, i) => {
          const sp = G.fish && G.fish.get ? G.fish.get(f.speciesId) : null;
          const c = CAT[sp && sp.category] || CAT.thuong;
          return lrow({
            ic: fishFig(hexCss(sp && sp.color) || c.color),
            name: esc(f.name || (sp && sp.name) || 'Cá'),
            tags: `<span class="tag"><span class="dot" style="background:${c.color}"></span> ${c.label}</span>`,
            side: `<span class="w">${wfmt(f.weight)}</span><span class="pr">${money(fishValue(f))}</span>${has(S(), 'sell') ? `<button class="btn sm pri" data-act="sellFish" data-id="${i}">Bán</button>` : ''}${has(S(), 'cook') ? `<button class="btn sm" data-act="cook" data-id="${i}">Nướng</button>` : ''}`,
          });
        }).join('');
      } else h += '<div class="empty">Giỏ trống trơn. Nhấn F cầm cần rồi ra bờ nước thôi.</div>';
      const inv = st.inventory || {};
      const ids = Object.keys(inv).filter((id) => inv[id] > 0);
      h += `<h3>Đồ đạc (${ids.length})</h3>`;
      if (ids.length) {
        h += ids.map((id) => {
          const it = item(id) || { name: id };
          let btn = '';
          if (it.type === 'consumable' && it.effect) btn = `<button class="btn sm go" data-act="use" data-id="${esc(id)}">Dùng</button>`;
          else if (it.type === 'bait') btn = st.equipped.bait === id ? '<span class="tag ok">Đang gắn</span>' : `<button class="btn sm" data-act="setBait" data-id="${esc(id)}">Gắn mồi</button>`;
          return lrow({ ic: itemIcon(it), name: esc(it.name), desc: esc(it.desc || (it.type === 'junk' ? 'Rác câu được. Bán hoặc đem tới thợ rèn.' : it.type === 'material' ? 'Nguyên liệu chế tạo.' : '')), side: `<b>×${inv[id]}</b>${btn}` });
        }).join('');
      } else h += '<div class="empty">Chưa có gì. Ghé tiệm đồ câu mua mồi nhé.</div>';
      h += rodLineHtml(true);
      const boats = st.ownedBoats || [];
      if (boats.length) {
        h += '<h3>Thuyền</h3>' + boats.map((id) => {
          const b = item(id) || { name: id };
          const on = st.onBoat === id;
          return lrow({ cls: on ? 'cur' : '', ic: itemIcon(b), name: esc(b.name), desc: esc(b.desc || ''), tags: `<span class="tag">Tốc độ ${b.speed || '?'}</span>`, side: on ? `<button class="btn sm" data-act="leaveBoat">Rời thuyền</button>` : `<button class="btn sm pri" data-act="board" data-id="${esc(id)}">Lên thuyền</button>` });
        }).join('');
      }
      return { title: 'Túi đồ', sub: 'Ví: ' + money(st.money), html: h };
    },
    shop(opts) {
      const role = (opts && opts.role) || 'shop';
      const st = G.state;
      const list = (G.data.SHOP && G.data.SHOP[role]) || [];
      let h = '';
      if (role === 'shop' || (st.fishBag || []).length) h += sellBox();
      h += list.map((id) => {
        const it = item(id); if (!it) return '';
        const owned = owns(it, id);
        const cnt = invCount(id);
        const afford = (st.money || 0) >= (it.price || 0);
        let tags = '';
        if (it.type === 'rod') tags = `<span class="tag">${TECH[it.technique] || it.technique}</span><span class="tag">Sức kéo ${it.power}</span><span class="tag">Tối đa ${wfmt(it.maxWeight)}</span><span class="tag">Quăng ${it.castRange} m</span>`;
        else if (it.type === 'line') tags = `<span class="tag">Độ bền ${it.strength}</span>`;
        else if (it.type === 'bait') tags = (it.forTech || []).map((t) => `<span class="tag ${t === curRod().technique ? 'ok' : ''}">${TECH[t] || t}</span>`).join('') + (it.reusable ? '<span class="tag ok">Dùng mãi</span>' : '');
        else if (it.type === 'boat') tags = `<span class="tag">Tốc độ ${it.speed}</span><span class="tag">Ổn định ${Math.round((it.stability || 0) * 100)}%</span>`;
        else if (it.effect) tags = Object.keys(it.effect).map((k) => { const v = it.effect[k]; const L = { hunger: 'No', hp: 'Máu', stamina: 'Thể lực', drunk: 'Say', wantedReduce: 'Xóa truy nã', strengthBuff: 'Sức kéo' }[k]; if (!L || v === true) return ''; return `<span class="tag ${k === 'drunk' && v > 0 ? 'no' : 'ok'}">${L} ${typeof v === 'number' && k !== 'wantedReduce' ? (v > 0 ? '+' : '') + (k === 'drunk' ? Math.round(v * 100) + '%' : v) : ''}</span>`; }).join('');
        return lrow({
          cls: owned ? 'off' : '', ic: itemIcon(it), name: esc(it.name), desc: esc(it.desc || ''), tags: tags,
          side: `${cnt && !owned ? `<span class="mut">Có ${cnt}</span>` : ''}<span class="pr">${money(it.price)}</span>${owned ? '<span class="tag ok">Đã có</span>' : `<button class="btn sm ${afford ? 'pri' : ''}" data-act="buy" data-id="${esc(id)}" ${afford ? '' : 'disabled'}>Mua</button>`}`,
        });
      }).join('');
      if (!list.length) h += '<div class="empty">Quầy này không bán gì.</div>';
      return { title: SHOP_TITLES[role] || 'Cửa hàng', sub: 'Ví: ' + money(st.money), html: h };
    },
    craft() {
      const st = G.state;
      const h = (G.data.RECIPES || []).map((r) => {
        const it = item(r.result) || { name: r.result };
        let ok = true;
        const needs = Object.keys(r.needs || {}).map((id) => {
          const m = item(id) || { name: id };
          const have = invCount(id), need = r.needs[id];
          if (have < need) ok = false;
          return `<span class="tag ${have >= need ? 'ok' : 'no'}">${esc(m.name)} ${have}/${need}</span>`;
        }).join('');
        if ((r.money || 0) > (st.money || 0)) ok = false;
        if (has(S(), 'canCraft')) { const c = call(S(), 'canCraft', r.id); if (typeof c === 'boolean') ok = c; }
        const owned = owns(it, it.id);
        return lrow({
          cls: owned ? 'off' : '', ic: itemIcon(it), name: esc(it.name) + (r.count ? ' ×' + r.count : ''), desc: esc(it.desc || ''), tags: needs,
          side: `<span class="pr">${r.money ? 'Công thợ ' + money(r.money) : 'Không lấy công'}</span>${owned ? '<span class="tag ok">Đã có</span>' : `<button class="btn sm ${ok ? 'go' : ''}" data-act="craft" data-id="${esc(r.id)}" ${ok ? '' : 'disabled'}>Chế tạo</button>`}`,
        });
      }).join('');
      return { title: 'Lò rèn', sub: 'Gom rác và nguyên liệu câu được để rèn đồ xịn. Ví: ' + money(st.money), html: h || '<div class="empty">Chưa có công thức nào.</div>' };
    },
    map() {
      const st = G.state;
      const tickets = invCount('item_ticket_plane');
      const h = (G.data.ENVS || []).map((e) => {
        const cur = st.env === e.id;
        let cost, can = true;
        if (e.id === 'airplane') { cost = `Cần vé máy bay (có ${tickets})`; can = tickets > 0; }
        else if (!e.ticket) cost = 'Miễn phí';
        else { cost = money(e.ticket); can = (st.money || 0) >= e.ticket; }
        return lrow({
          cls: cur ? 'cur' : '', ic: esc(e.icon || ''), name: esc(e.name), desc: esc(e.desc),
          tags: `<span class="tag">${WATER[e.waterBody] || e.waterBody}</span><span class="tag">Nước ~${e.baseTemp}°C</span>${e.managedZones ? `<span class="tag no">${e.managedZones} khu cấm câu</span>` : '<span class="tag ok">Không có quản lý</span>'}`,
          side: `<span class="pr" style="${can ? '' : 'color:#a8291f'}">${cost}</span>${cur ? '<span class="tag ok">Đang ở đây</span>' : `<button class="btn sm ${can ? 'pri' : ''}" data-act="travel" data-id="${esc(e.id)}" ${can ? '' : 'disabled'}>Đi</button>`}`,
        });
      }).join('');
      return { title: 'Bản đồ', sub: 'Chọn nơi câu. Ví: ' + money(st.money), html: h };
    },
    bait() {
      const st = G.state;
      const tech = curRod().technique;
      const list = (G.data.BAITS || []).slice().sort((a, b) => (invCount(b.id) > 0) - (invCount(a.id) > 0));
      const h = `<p style="margin:0 0 .5em">Cần đang dùng: <b>${esc(curRod().name || '?')}</b>, kiểu <span class="tag ok">${TECH[tech] || tech || '?'}</span></p>` + list.map((b) => {
        const cnt = invCount(b.id);
        const cur = st.equipped.bait === b.id;
        const fit = (b.forTech || []).includes(tech);
        return lrow({
          cls: (cur ? 'cur ' : '') + (cnt > 0 ? '' : 'off'), ic: itemIcon(b), name: esc(b.name), desc: esc(b.desc),
          tags: `<span class="tag ${fit ? 'ok' : 'no'}">${fit ? 'Hợp cần này' : 'Không hợp kiểu câu'}</span>${b.reusable ? '<span class="tag ok">Dùng mãi</span>' : ''}<span class="tag">Hút cá ×${b.attract}</span>`,
          side: `<span class="${cnt > 0 ? '' : 'mut'}">${cnt > 0 ? 'Có ' + cnt : 'Hết, mua ở tiệm'}</span>${cur ? '<span class="tag ok">Đang gắn</span>' : `<button class="btn sm pri" data-act="setBait" data-id="${esc(b.id)}" ${cnt > 0 ? '' : 'disabled'}>Gắn</button>`}`,
        });
      }).join('');
      return { title: 'Chọn mồi', sub: 'Mỗi loài thích một loại mồi và kiểu câu riêng', html: h };
    },
    rod() { return { title: 'Cần và dây', sub: 'Cần khỏe, dây bền mới kéo được cá to', html: rodLineHtml(false) }; },
    fishdex() {
      const sp = (G.fish && G.fish.SPECIES) || [];
      const disc = G.state.discovered || {};
      const n = sp.filter((s) => disc[s.id]).length;
      const envName = (id) => envOf(id).name;
      const timeTxt = (s) => (s.time === 'night' ? 'Ban đêm' : s.time === 'day' ? 'Ban ngày' : 'Cả ngày');
      const h = '<div class="dex">' + sp.map((s, i) => {
        const c = CAT[s.category] || CAT.thuong;
        const no = 'Số ' + String(i + 1).padStart(2, '0');
        const head = `<div class="idc-h"><span class="cat"><span class="dot" style="background:${c.color}"></span>${c.label}</span><span>${no}</span></div>`;
        if (!disc[s.id]) {
          return `<div class="idc unk">${head}<div class="idc-fig">${fishFig('', true)}</div><div class="idc-nm">Chưa rõ tên</div>
            <dl><dt>Gặp ở</dt><dd>${(s.envs || []).slice(0, 2).map(envName).join(', ') || '?'}</dd><dt>Giờ ăn</dt><dd>${timeTxt(s)}${s.difficulty >= 7 ? ', rất khó câu' : ''}</dd></dl></div>`;
        }
        const baits = (s.baits || []).map((b) => { const it = item(b); return it ? esc(it.name) : ''; }).filter(Boolean).join(', ');
        return `<div class="idc">${head}<span class="stamp">Đã câu</span><div class="idc-fig">${fishFig(hexCss(s.color))}</div><div class="idc-nm">${esc(s.name)}</div>
          ${s.desc ? `<div class="ds">${esc(s.desc)}</div>` : ''}
          <dl><dt>Cân nặng</dt><dd>${wfmt(s.minW)} – ${wfmt(s.maxW)}</dd><dt>Giá</dt><dd>${money(s.price)}/kg</dd>
          <dt>Nơi ở</dt><dd>${(s.envs || []).map(envName).join(', ')} (${(s.waterBodies || []).map((w) => WATER[w] || w).join(', ')})</dd>
          <dt>Mồi</dt><dd>${baits || '?'}</dd><dt>Giờ ăn</dt><dd>${timeTxt(s)}</dd>${s.depth ? `<dt>Độ sâu</dt><dd>${s.depth[0]}–${s.depth[1]} m</dd>` : ''}</dl>
          ${s.technique ? `<div class="tech">${esc(s.technique)}</div>` : ''}</div>`;
      }).join('') + '</div>';
      return { title: 'Sách cá', sub: `Đã ghi danh ${n}/${sp.length} loài`, html: sp.length ? h : '<div class="empty">Chưa có dữ liệu cá.</div>' };
    },
    help() {
      const keys = [['WASD', 'Di chuyển'], ['Shift', 'Chạy, né'], ['Space', 'Nhảy, bơi lên, giật câu'], ['Chuột phải kéo', 'Xoay camera'], ['Lăn chuột', 'Zoom, chỉnh độ sâu mồi'], ['F', 'Cầm hoặc cất cần'], ['Giữ chuột trái', 'Lấy đà quăng, cuộn dây'], ['A / D', 'Ghì cần khi vật cá'], ['W', 'Giật cần (pump)'], ['S', 'Hạ cần khi cá nhảy'], ['R', 'Đổi cần'], ['B', 'Đổi mồi'], ['E', 'Nói chuyện, lên/xuống thuyền'], ['G', 'Chế độ bắn cá'], ['I', 'Túi đồ'], ['C', 'Chế tạo'], ['M', 'Bản đồ'], ['K', 'Sách cá'], ['P', 'Nhét cá vào quần (cấm)'], ['1 – 5', 'Ăn uống nhanh'], ['H / F1', 'Trợ giúp'], ['N', 'Bật/tắt âm thanh'], ['Esc', 'Tạm dừng, đóng bảng'], ['Tab / mũi tên', 'Chọn nút trong bảng']];
      let h = '<h3>Điều khiển</h3><div class="keys">' + keys.map((k) => `<div><span class="kb">${k[0]}</span><span>${k[1]}</span></div>`).join('') + '</div>';
      h += `<h3>Mẹo câu</h3><ul class="tips">
        <li>Giữ chuột trái để lấy đà, nhả khi kim nằm trong <b>vùng xanh</b> thì quăng chuẩn. Lực càng mạnh càng khó trúng.</li>
        <li>Phao chìm và hiện <b>Space – Giật!</b> thì bấm Space ngay. Cá càng khó, vòng thu càng nhanh.</li>
        <li>Khi vật cá: cá chạy bên nào thì ghì cần bên ngược lại (A/D). Thanh căng chạm vạch đỏ thì nhả chuột.</li>
        <li>Để ý nhiệt độ nước, thủy triều, ngày đêm và độ sâu mồi. Mỗi loài thích một kiểu.</li>
        <li>Mồi phải hợp kiểu câu của cần (phao, lure, dọc, ngang). Xem bảng mồi (B).</li>
        <li>Rượu hồi thể lực nhưng say thì quăng lệch. Trà đá giải rượu. Bánh mì pate 15k hồi máu và no.</li>
        <li>Khu có quản lý: câu trộm sẽ bị đuổi. Chạy xa hơn 40 m để cắt đuôi, hoặc đội mũ cối ngụy trang.</li>
        <li>Câu được rác thì giữ lại. Thợ rèn đổi được cần thép, dây cáp, ca nô, thậm chí thuốc nổ.</li>
        <li>Cá vạn cân cần cần Titan và cáp tàu sân bay. Có con khỏe tới mức lôi bạn xuống nước.</li></ul>`;
      h += '<div class="rule">Luật vàng: không được nhét cá vào quần!</div>';
      return { title: 'Hướng dẫn', sub: 'Câu Cá Vạn Cân 3D', html: h };
    },
    pause() {
      const vol = Math.round(((G.audio && G.audio.volume) != null ? G.audio.volume : 0.8) * 100);
      const muted = G.audio && G.audio.muted;
      const mus = !G.audio || G.audio.musicOn !== false;
      const gfx = G.gfx && has(G.gfx, 'setQuality');
      const q = (G.gfx && G.gfx.quality) || '';
      const h = `<div class="pz">
        <button class="btn pri" data-act="resume">Tiếp tục</button>
        <button class="btn" data-act="save">Lưu game</button>
        <button class="btn" data-act="helpFromPause">Hướng dẫn</button>
        <div class="fld"><span>Âm lượng</span><div class="vol"><input class="ui-interactive" type="range" min="0" max="100" value="${vol}" data-vol="1" aria-label="Âm lượng"><b id="volval">${vol}%</b></div>
          <button class="btn" data-act="mute">${muted ? 'Đang tắt tiếng, bật lại' : 'Tắt tiếng (N)'}</button>
          <button class="btn" data-act="music">${mus ? 'Nhạc nền: bật' : 'Nhạc nền: tắt'}</button></div>
        <div class="fld"><span>Chất lượng đồ họa</span><div class="seg" role="group" aria-label="Chất lượng đồ họa">${QUAL.map((x) => `<button data-act="quality" data-id="${x[0]}" aria-pressed="${q === x[0]}" ${gfx ? '' : 'disabled'}>${x[1]}</button>`).join('')}</div>
          ${gfx ? '<span class="mut" style="font-size:.85em">Máy chậm thì chọn Thấp hoặc Vừa. Bấm F3 xem FPS.</span>' : '<span class="mut" style="font-size:.85em">Bộ đồ họa chưa sẵn sàng.</span>'}</div>
        <div class="fld"><button class="btn red" data-act="toTitle">Về màn hình chính</button></div></div>`;
      return { title: 'Tạm dừng', sub: 'Trò chơi đang dừng', html: h };
    },
  };
  function rodLineHtml(ownedOnly) {
    const st = G.state;
    const rods = (G.data.RODS || []).filter((r) => !ownedOnly || (st.ownedRods || []).includes(r.id));
    const lines = (G.data.LINES || []).filter((l) => !ownedOnly || (st.ownedLines || []).includes(l.id));
    let h = '<h3>Cần câu</h3>' + rods.map((r) => {
      const own = (st.ownedRods || []).includes(r.id), cur = st.equipped.rod === r.id;
      return lrow({
        cls: (cur ? 'cur ' : '') + (own ? '' : 'off'), ic: ic('rod'), name: esc(r.name), desc: esc(r.desc),
        tags: `<span class="tag ok">${TECH[r.technique] || r.technique}</span><span class="tag">Sức kéo ${r.power}</span><span class="tag">Tối đa ${wfmt(r.maxWeight)}</span><span class="tag">Quăng ${r.castRange} m</span>`,
        side: `${own ? '' : `<span class="pr">${r.craftOnly ? 'Chỉ chế tạo' : money(r.price)}</span>`}${cur ? '<span class="tag ok">Đang dùng</span>' : own ? `<button class="btn sm pri" data-act="setRod" data-id="${esc(r.id)}">Dùng cần này</button>` : '<span class="tag no">Chưa có</span>'}`,
      });
    }).join('');
    h += '<h3>Dây câu</h3>' + lines.map((l) => {
      const own = (st.ownedLines || []).includes(l.id), cur = st.equipped.line === l.id;
      return lrow({
        cls: (cur ? 'cur ' : '') + (own ? '' : 'off'), ic: ic('spool'), name: esc(l.name), desc: esc(l.desc), tags: `<span class="tag">Độ bền ${l.strength}</span>`,
        side: `${own ? '' : `<span class="pr">${l.craftOnly ? 'Chỉ chế tạo' : money(l.price)}</span>`}${cur ? '<span class="tag ok">Đang dùng</span>' : own ? `<button class="btn sm pri" data-act="setLine" data-id="${esc(l.id)}">Thay dây</button>` : '<span class="tag no">Chưa có</span>'}`,
      });
    }).join('');
    return h;
  }
  function renderPanel(fresh) {
    if (!panelName) return;
    const fn = PANELS[panelName];
    let r;
    try { r = fn ? fn(panelOpts) : { title: panelName, sub: '', html: '' }; } catch (e) { console.error('[ui panel ' + panelName + ']', e); r = { title: panelName, sub: '', html: '<div class="empty">Không hiển thị được bảng này.</div>' }; }
    // nhớ nút đang focus để giữ lại sau khi vẽ lại
    const a = document.activeElement;
    const fk = !fresh && a && E.pBody.contains(a) && a.dataset && a.dataset.act ? [a.dataset.act, a.dataset.id] : null;
    const st = E.pBody.scrollTop;
    E.pTitle.textContent = r.title; E.pSub.textContent = r.sub || '';
    E.pBody.innerHTML = r.html;
    E.pBody.scrollTop = st;
    if (fk) {
      const sel = '[data-act="' + fk[0] + '"]' + (fk[1] != null ? '[data-id="' + String(fk[1]).replace(/"/g, '') + '"]' : '');
      let el = null; try { el = E.pBody.querySelector(sel); } catch (e) { el = null; }
      if (el && !el.disabled) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } } else focusEl(E.pClose);
    }
  }

  // ---------- Hành động (click) ----------
  function equipRod(id) {
    if (G.fishing && has(G.fishing, 'setRod')) call(G.fishing, 'setRod', id);
    else { G.state.equipped.rod = id; toast('Đã dùng ' + ((item(id) || {}).name || id), 'good'); }
  }
  function equipLine(id) {
    if (G.fishing && has(G.fishing, 'setLine')) call(G.fishing, 'setLine', id);
    else { G.state.equipped.line = id; toast('Đã thay ' + ((item(id) || {}).name || id), 'good'); }
  }
  function equipBait(id) {
    if (G.fishing && has(G.fishing, 'setBait')) call(G.fishing, 'setBait', id);
    else { G.state.equipped.bait = id; toast('Đã gắn ' + ((item(id) || {}).name || id), 'good'); }
  }
  let newGameArmed = 0;
  const ACTIONS = {
    open(id) { if (panelName === id) closePanel(); else openPanel(id, titleOpen && id === 'help' ? {} : undefined); },
    close() { closePanel(); },
    dopt(i) { const o = dialogOpts[+i]; closeDialog(); if (o && typeof o.action === 'function') { try { o.action(); } catch (e) { console.error('[dialog action]', e); } } },
    sellAll() { call(S(), 'sellAll'); },
    sellFish(i) { call(S(), 'sell', +i); },
    cook(i) { call(S(), 'cook', +i); },
    use(id) { call(S(), 'use', id); },
    buy(id) { call(S(), 'buy', id); },
    craft(id) { call(S(), 'craft', id); },
    setBait(id) { equipBait(id); if (panelName === 'bait') closePanel(); },
    setRod(id) { equipRod(id); },
    setLine(id) { equipLine(id); },
    board(id) { closePanel(); if (G.player && has(G.player, 'boardBoat')) call(G.player, 'boardBoat', id); },
    leaveBoat() { closePanel(); if (G.player && has(G.player, 'leaveBoat')) call(G.player, 'leaveBoat'); },
    travel(id) {
      closePanel();
      if (has(S(), 'travel')) call(S(), 'travel', id);
      else if (G.world && G.world.loadEnvironment) { G.state.env = id; G.world.loadEnvironment(id); }
    },
    resume() { closePanel(); },
    save() { if (has(S(), 'save')) { call(S(), 'save'); toast('Đã lưu game', 'good'); } else toast('Chưa lưu được lúc này', 'warn'); },
    helpFromPause() { openPanel('help', { back: 'pause' }); G.paused = true; },
    mute() { if (G.audio) { if (G.audio.toggleMute) G.audio.toggleMute(); else if (G.audio.setMuted) G.audio.setMuted(!G.audio.muted); } },
    music() { if (G.audio && G.audio.setMusic) G.audio.setMusic(!G.audio.musicOn); },
    quality(q) {
      if (!(G.gfx && has(G.gfx, 'setQuality'))) return;
      call(G.gfx, 'setQuality', q);
      const l = QUAL.find((x) => x[0] === q);
      toast('Đồ họa: ' + (l ? l[1] : q), 'info');
    },
    toTitle() { panelName = null; E.panelWrap.classList.add('hide'); G.paused = false; if (has(S(), 'save')) call(S(), 'save'); showTitle(); },
    pants() { if (has(S(), 'tryPantsFish')) call(S(), 'tryPantsFish'); else toast('Không được nhét cá vào quần!', 'bad'); },
    play() { startGame(); },
    newgame(id, btn) {
      const now = performance.now();
      const saved = !!(G.systems && G.systems.hasSave && G.systems.hasSave());
      if (saved && now - newGameArmed > 3000) { newGameArmed = now; btn.textContent = 'Xóa bản lưu? Bấm lần nữa'; setTimeout(() => { if (btn) btn.textContent = 'Chơi mới'; }, 3000); return; }
      newGameArmed = 0;
      if (has(S(), 'reset')) call(S(), 'reset');
      else { G.state = G.defaultState(); }
      startGame(true);
    },
    hot(id) { if (id) call(S(), 'use', id); },
  };
  function onClick(e) {
    const b = e.target.closest && e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = ACTIONS[b.dataset.act];
    if (!act) return;
    sfx('click');
    act(b.dataset.id, b);
    if (panelName) rerenderSoon();
    // nút HUD không giữ focus — tránh Enter trong lúc chơi bấm lại nút
    if (!isOpen()) dropFocus();
  }

  // ---------- Màn hình tiêu đề ----------
  let titleOpen = false, orbitA = 0;
  function showTitle() {
    build();
    titleOpen = true;
    if (G.setMode) G.setMode('menu');
    E.title.classList.remove('hide');
    E.hud.classList.add('dim');
    const hasSave = !!(G.systems && G.systems.hasSave && G.systems.hasSave());
    const pb = E.title.querySelector('[data-act="play"]');
    if (pb) pb.textContent = hasSave ? 'Chơi tiếp' : 'Chơi';
    focusEl(pb);
    syncBlocked();
  }
  function hideTitle() {
    titleOpen = false;
    E.title.classList.add('hide');
    E.hud.classList.remove('dim');
    dropFocus();
    syncBlocked();
  }
  function startGame(fresh) {
    if (G.audio && G.audio.resume) G.audio.resume();
    hideTitle();
    if (panelName) closePanel();
    if (G.state.mode === 'menu' || fresh) { G.state.mode = 'menu'; G.setMode('explore'); }
    sfx('fanfare', { volume: 0.5 });
    const e = envOf(G.state.env);
    if (fresh && G.world && G.world.loadEnvironment && G.state.env !== ((G.world.current && G.world.current.id) || '')) {
      try { G.world.loadEnvironment(G.state.env); } catch (err) { console.error(err); }
    } else bigMessage(e.name, e.desc, '#f0b323');
    setTimeout(() => toast('Nhấn F để cầm cần, H để xem hướng dẫn', 'info'), 1200);
    hudT = 0; lastMoney = null;
  }

  // ---------- Cập nhật HUD (10 lần/giây, chỉ ghi khi giá trị đổi) ----------
  let hudT = 0, lastMoney = null, hotKey = '', chased = false, castShown = false, strikeShown = false, hintKey = '', toastTopKey = null;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function setBar(b, v) { if (b) setScale(b.fill, clamp(v, 0, 100) / 100); }
  function conditions() {
    if (!G.world || !G.world.getConditions) return null;
    try {
      const p = G.player && G.player.pos;
      return p ? G.world.getConditions(p.x, p.z) : G.world.getConditions();
    } catch (e) { return null; }
  }
  const _dir = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  function camYaw() {
    if (!G.camera || !_dir) return 0;
    G.camera.getWorldDirection(_dir);
    return Math.atan2(_dir.x, _dir.z);
  }
  function getHotbar() {
    let hb = S().hotbar;
    if (typeof hb === 'function') { try { hb = hb.call(S()); } catch (e) { hb = null; } }
    if (Array.isArray(hb)) { const o = hb.slice(0, 5).map((x) => (x == null ? null : typeof x === 'string' ? x : x.id || null)); while (o.length < 5) o.push(null); return o; }
    const inv = G.state.inventory || {};
    const out = (G.data.CONSUMABLES || []).filter((c) => c.effect && inv[c.id] > 0).slice(0, 5).map((c) => c.id);
    while (out.length < 5) out.push(null);
    return out;
  }
  function equippedInfo() {
    let eq = null;
    if (G.fishing && has(G.fishing, 'equipped')) eq = call(G.fishing, 'equipped');
    const se = G.state.equipped || {};
    const pickObj = (v, id) => (v && typeof v === 'object' ? v : item(v || id));
    return { rod: pickObj(eq && eq.rod, se.rod) || {}, line: pickObj(eq && eq.line, se.line) || {}, bait: pickObj(eq && eq.bait, se.bait) || {} };
  }
  function updateMoney() {
    const st = G.state;
    if (lastMoney === st.money) return;
    if (lastMoney != null) { E.money.classList.remove('up', 'down'); void E.money.offsetWidth; E.money.classList.add(st.money > lastMoney ? 'up' : 'down'); }
    lastMoney = st.money; setTxt(E.moneyT, money(st.money));
  }
  function updateHUD() {
    const st = G.state;
    updateMoney();
    const c = conditions();
    const time = c && c.time != null ? c.time : st.time || 0;
    const night = c ? c.isNight : time < 5.5 || time > 18.5;
    const hh = Math.floor(time) % 24, mm = Math.floor((time % 1) * 60);
    setHTML(E.dn, ic(night ? 'moon' : 'sun'));
    setTxt(E.ck, pad(hh) + ':' + pad(mm));
    setTxt(E.dy, 'Ngày ' + (st.day || 1));
    setTxt(E.ev, envOf(st.env).name + (st.onBoat ? ', trên thuyền' : ''));
    setBar(E.bars.hp, st.hp); setBar(E.bars.hunger, st.hunger); setBar(E.bars.stamina, st.stamina); setBar(E.bars.drunk, (st.drunk || 0) * 100);
    tog(E.bars.drunk.el, 'hide', !((st.drunk || 0) > 0.01));
    tog(E.bars.hp.el, 'low', st.hp < 30);
    tog(E.bars.hunger.el, 'low', st.hunger < 20);
    tog(E.bars.stamina.el, 'low', st.stamina < 15);
    // điều kiện
    let rowsKey = '';
    if (c) {
      const w = c.wind || { x: 0, z: 0 };
      const ws = Math.hypot(w.x || 0, w.z || 0);
      const rel = Math.atan2(w.x || 0, w.z || 0) - camYaw();
      setTxt(E.cr.temp.v, c.waterTemp != null ? num1(c.waterTemp) + '°C' : '?');
      setTxt(E.cr.tide.v, c.tideLabel || '—');
      const wx = WEATHER[c.weather] || ['sun', c.weather || '—'];
      setHTML(E.wxIcon, ic(c.weather === 'clear' || !WEATHER[c.weather] ? (night ? 'moon' : 'sun') : wx[0]));
      setTxt(E.cr.wx.v, wx[1]);
      setTxt(E.windV, num1(ws) + ' m/s');
      const deg = Math.round(-rel * 180 / Math.PI / 5) * 5;
      if (E.windA._d !== deg) { E.windA._d = deg; E.windA.style.transform = 'rotate(' + deg + 'deg)'; }
      const showWave = c.waveHeight != null && c.waveHeight > 0.15;
      tog(E.cr.wave.el, 'hide', !showWave);
      if (showWave) setTxt(E.cr.wave.v, num1(c.waveHeight) + ' m');
      rowsKey += showWave ? 'w' : '';
    }
    const bp = G.fishing && G.fishing.bobberPos;
    let d = 0;
    if (bp && G.world && G.world.getDepth && (st.mode === 'fishing' || st.mode === 'fight')) { try { d = G.world.getDepth(bp.x, bp.z); } catch (e) { d = 0; } }
    tog(E.cr.depth.el, 'hide', !(d > 0));
    if (d > 0) setTxt(E.cr.depth.v, num1(d) + ' m');
    rowsKey += d > 0 ? 'd' : '';
    if (rowsKey !== toastTopKey) { toastTopKey = rowsKey; E.toasts.style.setProperty('--toast-top', (E.colTR.offsetTop + E.colTR.offsetHeight + 8) + 'px'); }
    // truy nã
    const wanted = st.wanted || 0;
    const showW = wanted > 0.02 || chased;
    tog(E.wanted, 'hide', !showW);
    if (showW) {
      setScale(E.wantedFill, chased ? Math.max(wanted, 0.15) : wanted);
      tog(E.wanted, 'chased', chased);
      setTxt(E.wantedT, chased ? 'Quản lý đang đuổi! Chạy xa hơn 40 m' : 'Quản lý đang để ý');
    }
    // hotbar
    const hb = getHotbar();
    const key = hb.map((id) => (id ? id + ':' + invCount(id) : '-')).join('|');
    if (key !== hotKey) {
      hotKey = key;
      E.hotbar.innerHTML = hb.map((id, i) => {
        const it = id && item(id);
        const n = id ? invCount(id) : 0;
        return it ? `<div class="slot ${n > 0 ? '' : 'empty'}" data-act="hot" data-id="${esc(id)}" title="${esc(it.name)} (${i + 1})"><span class="k">${i + 1}</span><span class="em">${itemIcon(it)}</span><span class="c">${n}</span></div>`
          : `<div class="slot empty"><span class="k">${i + 1}</span></div>`;
      }).join('');
    }
    // trang bị
    const eq = equippedInfo();
    setTxt(E.eRod, eq.rod.name || '—');
    setTxt(E.eRodT, TECH[eq.rod.technique] || eq.rod.technique || '');
    setTxt(E.eLine, eq.line.name || '—');
    setTxt(E.eBait, eq.bait.name || 'Chưa gắn mồi');
    setTxt(E.eBaitC, eq.bait.id ? (eq.bait.reusable ? 'dùng mãi' : '×' + invCount(eq.bait.id)) : '');
    const fishingMode = (st.mode === 'fishing' || st.mode === 'fight') && G.fishing;
    tog(E.eFs, 'hide', !fishingMode);
    if (fishingMode) {
      const fsRaw = G.fishing.state;
      setTxt(E.eSt, typeof fsRaw === 'string' ? (FSTATE[fsRaw] || fsRaw) : '');
      const dep = G.fishing.depth;
      tog(E.eDp, 'hide', typeof dep !== 'number');
      if (typeof dep === 'number') setTxt(E.eDepth, num1(dep) + ' m');
    }
    // gợi ý phím — chỉ dựng lại khi đổi chế độ
    const mode = st.onBoat && st.mode === 'explore' ? 'boat' : st.mode;
    if (mode !== hintKey) {
      hintKey = mode;
      const hl = HINTS[mode] || [];
      E.hints.innerHTML = hl.map((k) => `<span class="hk">${k[0] ? `<span class="kb">${k[0]}</span>` : ''}${k[1]}</span>`).join('');
      tog(E.hints, 'hide', !hl.length);
    }
    // NPC
    let npc = S().nearestNPC;
    if (typeof npc === 'function') { try { npc = npc.call(S()); } catch (e) { npc = null; } }
    const canTalk = npc && !isOpen() && st.mode === 'explore';
    tog(E.npc, 'hide', !canTalk);
    if (canTalk) {
      const nm = (typeof npc === 'string' ? npc : npc.name || npc.label || ROLE_NAMES[npc.role] || 'người lạ');
      setHTML(E.npc, `<span class="kb">E</span><span>Nói chuyện với ${esc(nm)}</span>`);
    }
  }

  // bảng vật cá — mỗi frame, ghi DOM có cache
  const _v = _dir ? new THREE.Vector3() : null, _right = _dir ? new THREE.Vector3() : null;
  function fishSide(fd) {
    if (fd == null) return 0;
    if (typeof fd === 'number') {
      if (Math.abs(fd) <= 1.0001) return fd; // -1 trái .. +1 phải
      if (!_v) return 0;
      _v.set(Math.sin(fd), 0, Math.cos(fd));
    } else if (typeof fd === 'object' && _v) {
      _v.set(fd.x || 0, 0, fd.z || 0);
    } else return 0;
    if (_v.lengthSq() < 1e-6 || !G.camera) return 0;
    _v.normalize();
    _right.setFromMatrixColumn(G.camera.matrixWorld, 0); _right.y = 0; _right.normalize();
    return _v.dot(_right);
  }
  function updateFight() {
    const f = G.fishing && G.fishing.fight;
    const show = !!f && !isOpen();
    tog(E.fight, 'hide', !show);
    if (!show) return;
    const ci = f.catchInfo || {};
    const disc = ci.kind !== 'fish' || (G.state.discovered || {})[ci.id];
    const sp = ci.species;
    const cat = CAT[sp && sp.category];
    const col = disc && sp ? hexCss(sp.color) : (cat ? cat.color : '#8cc7d9');
    setHTML(E.fName, `${ci.kind === 'fish' || !ci.kind ? fishFig(col, !disc) : ''}<span>${disc ? esc(ci.name || '???') : 'Cá lạ'}</span>${cat && disc ? `<span class="tag">${cat.label}</span>` : ''}`);
    setTxt(E.fDist, (f.distance != null ? num1(f.distance) : '?') + ' m');
    setScale(E.fLine, f.maxDistance ? (f.distance || 0) / f.maxDistance : 0);
    const t = clamp(f.tension || 0, 0, 1);
    setScale(E.fTensionFill, t);
    setTxt(E.fTensionP, Math.round(t * 100) + '%');
    tog(E.fTension, 'z2', t >= 0.6 && t < 0.85);
    tog(E.fTension, 'z3', t >= 0.85);
    tog(E.fTension, 'danger', t > 0.9);
    let stam = f.fishStamina != null ? f.fishStamina : 1;
    if (stam > 1.0001) stam /= 100;
    setScale(E.fStamFill, stam);
    setTxt(E.fStamP, Math.round(clamp(stam, 0, 1) * 100) + '%');
    const side = fishSide(f.fishDir);
    const dir = side < -0.25 ? -1 : side > 0.25 ? 1 : 0; // cá chạy trái/phải
    const rot = dir < 0 ? -90 : dir > 0 ? 90 : 0;
    if (E.fArrow._r !== rot) { E.fArrow._r = rot; E.fArrow.style.transform = 'rotate(' + rot + 'deg)'; }
    tog(E.fArrow, 'idle', dir === 0);
    // cá chạy phải → ghì A; chạy trái → ghì D
    const ok = !!f.correct;
    tog(E.fKA, 'on', dir > 0 && !ok); tog(E.fKA, 'ok', dir > 0 && ok);
    tog(E.fKD, 'on', dir < 0 && !ok); tog(E.fKD, 'ok', dir < 0 && ok);
    const jumping = !!(f.jumping || f.fishJumping || f.jump);
    tog(E.fJump, 'hide', !jumping);
    const hint = f.hint || (t > 0.85 ? 'Dây quá căng! Nhả chuột, ghì cần ngược hướng cá' : stam < 0.2 ? 'Cá đuối sức rồi, cuộn mạnh lên' : 'Cá chạy bên nào, ghì cần bên ngược lại');
    setTxt(E.fHint, hint);
  }
  function updateCombat() {
    const cb = G.player && G.player.combat;
    const show = G.state.mode === 'combat' && cb && !isOpen();
    tog(E.combat, 'hide', !show);
    if (!show) return;
    setTxt(E.cName, cb.name || 'Cá hung dữ');
    const fr = clamp((cb.fishHp || 0) / (cb.fishMaxHp || 1), 0, 1);
    setScale(E.cFish, fr); setTxt(E.cFishP, Math.round(fr * 100) + '%');
    setScale(E.cMe, clamp(G.state.hp, 0, 100) / 100); setTxt(E.cMeP, Math.round(clamp(G.state.hp, 0, 100)) + '%');
  }

  // ---------- Thanh lực quăng & giật câu ----------
  function setCastMeter(v, sweet) {
    build();
    if (v == null || v === false) { if (castShown) { E.cast.classList.add('hide'); castShown = false; } return; }
    if (!castShown) { castShown = true; E.cast.classList.remove('hide'); }
    v = clamp(+v || 0, 0, 1);
    let a = null, b = null;
    if (Array.isArray(sweet)) { a = sweet[0]; b = sweet[1]; }
    else if (sweet && typeof sweet === 'object') { a = sweet.min != null ? sweet.min : sweet.from; b = sweet.max != null ? sweet.max : sweet.to; }
    else if (typeof sweet === 'number') { a = sweet - 0.08; b = sweet + 0.08; }
    if (a != null && b != null) {
      a = clamp(a, 0, 1); b = clamp(b, 0, 1);
      E.castSweet.style.display = '';
      E.castSweet.style.bottom = (a * 100) + '%'; E.castSweet.style.height = ((b - a) * 100) + '%';
      tog(E.cast, 'in', v >= a && v <= b);
    } else { E.castSweet.style.display = 'none'; tog(E.cast, 'in', false); }
    E.castFill.style.height = (v * 100) + '%';
    E.castNeedle.style.bottom = `calc(${(v * 100).toFixed(1)}% - 1.5px)`;
  }
  function setStrikePrompt(on, progress) {
    build();
    if (!on) { if (strikeShown) { E.strike.classList.add('hide'); strikeShown = false; } return; }
    if (!strikeShown) { strikeShown = true; E.strike.classList.remove('hide'); }
    const p = clamp(progress == null ? 1 : progress, 0, 1); // 1 → 0: thời gian còn lại
    // vòng thu nhỏ dần khi thời gian cạn; chuyển đỏ ở phần ba cuối
    E.strikeRing.style.transform = `scale(${(0.35 + p * 0.65).toFixed(3)})`;
    E.strikeRing.style.borderColor = p < 0.34 ? '#ef5a4c' : '#f0b323';
  }

  // ---------- Phím ----------
  const KEY_PANELS = { KeyI: 'inventory', KeyC: 'craft', KeyM: 'map', KeyK: 'fishdex', KeyH: 'help', F1: 'help', KeyB: 'bait' };
  function handleKeys() {
    const inp = G.input; if (!inp || !inp.pressed) return;
    if (frame === openFrame) return;
    if (inp.pressed('Escape')) {
      if (dialogOpen) closeDialog();
      else if (panelName) closePanel();
      else if (!titleOpen && G.state.mode !== 'dead') {
        // Esc đã được gameplay dùng (thoát chế độ bắn / thu dây đang chờ) → không mở menu cùng lúc
        const fs = G.fishing && G.fishing.state;
        if (G.state.mode === 'shoot' || fs === 'waiting' || fs === 'casting' || fs === 'charging') return;
        openPanel('pause');
      }
      return;
    }
    if (dialogOpen) {
      if (inp.pressed('Space') || inp.pressed('Enter')) { if (typing) finishTyping(); }
      return;
    }
    for (const code in KEY_PANELS) {
      if (!inp.pressed(code)) continue;
      const name = KEY_PANELS[code];
      if (panelName === name) { closePanel(); return; }
      if (titleOpen && name !== 'help') return;
      if (panelName === 'pause') return;
      const m = G.state.mode;
      if (m === 'fight' || m === 'combat' || m === 'dead') { if (name !== 'help') return; }
      openPanel(name);
      return;
    }
  }

  // ---------- Vòng cập nhật ----------
  function update(dt) {
    if (!built) return;
    handleKeys();
    if (isOpen() && G.input && !G.input.blocked) G.input.blocked = true;
    // camera xoay chậm ở màn hình tiêu đề
    if (titleOpen && G.camera && typeof THREE !== 'undefined') {
      orbitA += (dt || 0.016) * 0.07;
      const c = (G.player && G.player.pos) || new THREE.Vector3();
      G.camera.position.set(c.x + Math.cos(orbitA) * 30, c.y + 11 + Math.sin(orbitA * 0.7) * 2, c.z + Math.sin(orbitA) * 30);
      G.camera.lookAt(c.x, c.y + 2, c.z);
    }
    hudT -= Math.max(dt || 0, 0.016);
    if (hudT <= 0) { hudT = 0.1; try { updateHUD(); } catch (e) { if (!update._e) { console.error('[ui hud]', e); update._e = true; } } }
    const mode = G.state.mode;
    tog(E.crosshair, 'hide', mode !== 'shoot' || isOpen());
    tog(E.aimdot, 'hide', mode !== 'fishing' || isOpen() || castShown);
    updateFight();
    updateCombat();
    if (mode !== 'fishing' && mode !== 'fight' && castShown) setCastMeter(null);
    if (mode !== 'fishing' && strikeShown) setStrikePrompt(false);
    frame++;
  }

  // ---------- Sự kiện ----------
  function bindEvents() {
    const on = (e, f) => G.bus && G.bus.on(e, f);
    on('env:changed', (d) => {
      if (titleOpen) return;
      const id = d && (typeof d.env === 'string' ? d.env : d.env && d.env.id);
      const e = envOf(id || G.state.env);
      bigMessage(e.name, e.desc, '#f0b323');
      hotKey = '';
    });
    on('money:changed', () => { if (built) updateMoney(); if (panelName) rerenderSoon(); });
    on('inventory:changed', () => { hotKey = ''; hudT = 0; if (panelName) rerenderSoon(); });
    on('warden:chase', () => { chased = true; hudT = 0; banner('Bị đuổi! Giữ Shift chạy xa hơn 45 m', 0); });
    on('warden:escaped', () => { chased = false; hudT = 0; hideBanner(); toast('Cắt đuôi được quản lý rồi!', 'good'); });
    on('warden:caught', () => { chased = false; hudT = 0; hideBanner(); bigMessage('Bị bắt!', 'Tịch thu cần câu, cá trong giỏ và nộp phạt…', '#ef5a4c'); });
    on('fight:end', (d) => {
      if (!d) return;
      if (d.result === 'line_broke') bigMessage('Đứt dây!', 'Dây căng quá. Ghì cần A/D và ngừng cuộn khi thanh căng chạm vạch đỏ', '#ef5a4c');
      else if (d.result === 'dragged') bigMessage('Bị cá kéo xuống nước!', 'Con này khỏe quá… bơi vào bờ đi!', '#4fb3bf');
    });
    on('fish:caught', (d) => {
      const ci = (d && d.catchInfo) || {};
      const sp = ci.species;
      const cat = sp && CAT[sp.category];
      // Thông báo lớn duy nhất cho mọi nguồn (cần câu, bắn, đánh nhau, vớt cá nổi)
      if (ci.kind === 'fish' && sp && ['khong_lo', 'quai_vat', 'dot_bien'].includes(sp.category)) {
        bigMessage(cat.label + '!', `${ci.name}, ${wfmt(ci.weight)}. Bùm bùm!`, cat.color);
      } else if (ci.kind === 'fish' && ci.isNew) {
        bigMessage('Loài mới!', `${ci.name}, ${wfmt(ci.weight)}`, '#4fb3bf');
      } else if (ci.kind === 'fish' && ci.weight >= 50) {
        bigMessage('Cá to!', `${ci.name}, ${wfmt(ci.weight)}`, '#f0b323');
      } else if (ci.id === 'junk_chest') {
        bigMessage('Rương kho báu!', 'Đem bán được bộn tiền', '#f0b323');
      }
    });
    on('hooked', () => { setStrikePrompt(false); });
    on('combat:start', (d) => { const n = d && d.catchInfo && d.catchInfo.name; bigMessage('Cá lên bờ đánh nhau!', (n ? n + '. ' : '') + 'Chuột trái đánh, Shift né', '#e07b39'); });
    on('combat:end', (d) => { if (d && !d.win) toast('Thua cá rồi… nó chạy mất!', 'bad'); });
    on('mode:changed', (d) => {
      if (d && d.to === 'dead') bigMessage('Ngất xỉu!', 'Bạn được đưa về bờ, mất một ít tiền…', '#ef5a4c');
      if (d && d.to === 'shoot') toast('Chế độ bắn cá. Nhấn G để thoát', 'info');
      hudT = 0;
    });
  }

  G.ui = {
    init() {
      build();
      bindEvents();
      G.addUpdate(update, 70);
      showTitle();
    },
    toast, bigMessage, dialog, closeDialog, openPanel, closePanel, isOpen,
    setCastMeter, setStrikePrompt, banner, hideBanner,
    showTitle, hideTitle, refresh() { hotKey = ''; hintKey = ''; hudT = 0; if (panelName) renderPanel(); },
    get panel() { return panelName; },
    get dialogOpen() { return dialogOpen; },
  };
})();
