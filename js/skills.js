// skills.js — skill người chơi (Q/E/R khi vật cá hoặc đánh nhau), năng lượng "Nộ", cấp "Ngư Công",
// và danh sách chiêu của cá. Hiệu ứng thật nằm ở fishing.js (dưới nước) và player.js (trên bờ):
// chúng nghe 'skill:cast' và hỏi G.skills.isActive(id) / G.skills.power(id).
(function () {
  const G = window.G;

  // power(lv) → độ mạnh theo cấp Ngư Công (1..10)
  const DEFS = {
    fight: [
      { id: 'thanluc', key: 'KeyQ', label: 'Q', icon: 'sk_thanluc', name: 'Thần Lực Ghì Cần', rage: 25, cd: 8, dur: (lv) => 4 + lv * 0.2, color: 0xffb020,
        desc: (lv) => `${(4 + lv * 0.2).toFixed(1)} giây: dây bớt căng ${35 + lv}%, cuộn nhanh gấp ${(1.5 + lv * 0.03).toFixed(2)}, không mất sức, không bị kéo xuống nước hay lật thuyền` },
      { id: 'loidien', key: 'KeyE', label: 'E', icon: 'sk_loidien', name: 'Lôi Điện Ngư Ông', rage: 35, cd: 14, dur: (lv) => 2.3 + lv * 0.1, color: 0x8fd8ff,
        desc: (lv) => `Sét đánh lan theo dây câu: cá choáng ${(2.3 + lv * 0.1).toFixed(1)} giây, mất ${11 + lv}% sức, phá chiêu cá đang vận` },
      { id: 'banhai', key: 'KeyR', label: 'R', icon: 'sk_banhai', name: 'Vạn Cân Bạt Hải', rage: 100, cd: 20, ult: true, dur: () => 1.5, color: 0x3fd0ff,
        desc: (lv) => `Tuyệt chiêu: rồng nước bốc lên, cá mất ${42 + lv * 3}% sức và bị kéo về ${30 + lv * 2}% khoảng cách` },
    ],
    combat: [
      { id: 'lienhoan', key: 'KeyQ', label: 'Q', icon: 'sk_lienhoan', name: 'Liên Hoàn Quyền', rage: 25, cd: 8, dur: (lv) => 3 + lv * 0.15, color: 0xff8a3d,
        desc: (lv) => `${(3 + lv * 0.15).toFixed(1)} giây: đấm nhanh gấp đôi, sát thương ×${(2 + lv * 0.05).toFixed(2)}` },
      { id: 'loidien', key: 'KeyE', label: 'E', icon: 'sk_loidien', name: 'Lôi Điện Ngư Ông', rage: 35, cd: 12, dur: (lv) => 1.8 + lv * 0.1, color: 0x8fd8ff,
        desc: (lv) => `Sét đánh: cá choáng ${(1.8 + lv * 0.1).toFixed(1)} giây, mất ${36 + lv * 6} máu, phá chiêu` },
      { id: 'chandia', key: 'KeyR', label: 'R', icon: 'sk_chandia', name: 'Long Quyền Chấn Địa', rage: 100, cd: 20, ult: true, dur: () => 3, color: 0xffd23f,
        desc: (lv) => `Tuyệt chiêu: dậm đất sóng xung kích, ${110 + lv * 15} sát thương, bất tử 3 giây` },
    ],
  };

  // ---- Chiêu của cá ----
  // Mỗi chiêu: vận chiêu (cast giây, có vòng cảnh báo) rồi tung. E (Lôi Điện) phá được khi đang vận.
  const FISH = {
    cuongphong: { id: 'cuongphong', name: 'Cuồng Phong Thủy Long', color: 0x4fc3ff, cast: 1.3 },
    batdiet: { id: 'batdiet', name: 'Hào Quang Bất Diệt', color: 0xffd040, cast: 1.5 },
    locxoay: { id: 'locxoay', name: 'Lốc Xoáy Đáy Sâu', color: 0x3a7bd5, cast: 1.1 },
    phongxa: { id: 'phongxa', name: 'Phóng Xạ Đột Biến', color: 0x66ff44, cast: 1.2 },
    thiendien: { id: 'thiendien', name: 'Thiên Lôi Giáng', color: 0xc9a0ff, cast: 1.4 },
    anthan: { id: 'anthan', name: 'Ẩn Thân Đáy Sâu', color: 0x6a7a90, cast: 1.0 },
    phunlua: { id: 'phunlua', name: 'Long Hỏa', color: 0xff6a20, cast: 1.2 },
  };
  const BY_CAT = {
    to: ['locxoay', 'cuongphong'],
    khong_lo: ['cuongphong', 'locxoay', 'thiendien'],
    quai_vat: ['cuongphong', 'batdiet', 'thiendien', 'anthan'],
    dot_bien: ['phongxa', 'anthan', 'batdiet'],
    meme: ['cuongphong', 'batdiet', 'locxoay'],
  };
  const BY_SPECIES = {
    ca_rong: ['phunlua', 'thiendien', 'batdiet'],
    ca_sau_bay: ['phunlua', 'locxoay'],
    ca_map: ['thiendien', 'locxoay', 'cuongphong'],
    ca_map_3_chan: ['thiendien', 'locxoay', 'cuongphong'],
    ca_sau: ['locxoay', 'cuongphong'],
    ca_van_can: ['cuongphong', 'thiendien', 'batdiet', 'anthan', 'locxoay'],
    muc_khong_lo: ['anthan', 'cuongphong', 'phongxa'],
    megalodon: ['locxoay', 'cuongphong', 'thiendien'],
    hai_long_vuc_tham: ['thiendien', 'cuongphong', 'batdiet', 'anthan', 'locxoay'],
    ca_cau_vuc_tham: ['anthan', 'locxoay', 'thiendien'],
  };
  const AURA = { to: 0x6fb8ff, khong_lo: 0x4fc3ff, quai_vat: 0xff4a3d, dot_bien: 0x66ff44, meme: 0xff66dd };

  const cd = {};      // 'ctx:id' → giây còn lại
  const active = {};  // id → giây còn lại
  let rage = 0;

  function ctxNow() { const m = G.state.mode; return m === 'fight' ? 'fight' : m === 'combat' ? 'combat' : null; }
  // Ngư Công: cấp 1..10 từ kinh nghiệm câu cá (G.state.skillXp)
  const XP_LV = [0, 60, 180, 400, 750, 1250, 2000, 3100, 4600, 6600];
  function level() { const xp = G.state.skillXp || 0; let lv = 1; while (lv < 10 && xp >= XP_LV[lv]) lv++; return lv; }
  function hexCss(c) { return '#' + c.toString(16).padStart(6, '0'); }

  const SK = (G.skills = {
    DEFS, FISH,
    fishSkillsFor(sp) { if (!sp) return []; return (BY_SPECIES[sp.id] || BY_CAT[sp.category] || []).map((k) => FISH[k]); },
    auraColor(sp) { return (sp && (AURA[sp.category] || (BY_SPECIES[sp.id] ? 0xff9a3d : null))) || null; },
    isBoss(sp, weight) { return !!sp && (sp.category === 'quai_vat' || sp.id === 'ca_van_can' || (sp.category === 'khong_lo' && weight >= 5000)); },
    isActive(id) { return (active[id] || 0) > 0; },
    level,
    xpInfo() { const lv = level(), xp = G.state.skillXp || 0, a = XP_LV[lv - 1], b = XP_LV[lv] || a; return { lv, xp, frac: lv >= 10 ? 1 : (xp - a) / (b - a) }; },
    get rage() { return rage; },
    addRage(n) { rage = Math.max(0, Math.min(100, rage + n)); },
    list(ctx) {
      const lv = level();
      return (DEFS[ctx] || []).map((d) => ({ id: d.id, key: d.key, label: d.label, icon: d.icon, name: d.name, ult: !!d.ult, rage: d.rage, cd: d.cd,
        color: d.color, desc: d.desc(lv), cdLeft: Math.max(0, cd[ctx + ':' + d.id] || 0), activeLeft: Math.max(0, active[d.id] || 0), ready: rage >= d.rage && !((cd[ctx + ':' + d.id] || 0) > 0) }));
    },
    cast(id) {
      const ctx = ctxNow(); if (!ctx) return false;
      const d = (DEFS[ctx] || []).find((x) => x.id === id); if (!d) return false;
      const k = ctx + ':' + id;
      if ((cd[k] || 0) > 0) return false;
      if (rage < d.rage) { G.ui && G.ui.toast && G.ui.toast((d.ult ? 'Tuyệt chiêu cần đầy Nộ' : 'Chưa đủ Nộ') + ' — ghì cần đúng hướng, đánh trúng, phá chiêu cá để tích Nộ', 'warn'); return false; }
      const lv = level();
      rage -= d.rage;
      cd[k] = d.cd; active[id] = d.dur(lv);
      const P = G.player;
      if (G.fx && P && P.obj) {
        if (G.fx.aura) G.fx.aura(P.obj, d.color, active[id], d.ult ? 2.2 : 1.4);
        if (G.fx.floatText) G.fx.floatText(P.obj.position.clone().add(new THREE.Vector3(0, 2.4 + DEFS[ctx].indexOf(d) * 0.55, 0)), d.name + '!', hexCss(d.color));
      }
      if (G.audio && G.audio.play) G.audio.play(id === 'loidien' ? 'thunder' : d.ult ? 'explosion' : 'fanfare', { volume: d.ult ? 0.7 : 0.5 });
      if (d.ult && G.slowMo) G.slowMo(0.3, 1.4);
      if (d.ult && G.ui && G.ui.bigMessage) G.ui.bigMessage(d.name + '!', 'Tuyệt chiêu Ngư Công cấp ' + lv, hexCss(d.color));
      G.bus.emit('skill:cast', { id, ctx, def: d, lv });
      return true;
    },
    reset() { for (const k in cd) delete cd[k]; for (const k in active) delete active[k]; rage = 0; },
  });

  // Kinh nghiệm Ngư Công: cá càng to càng nhiều; cá chưa gặp bao giờ thưởng thêm
  function onCaught(d) {
    const c = d && d.catchInfo; if (!c || c.kind !== 'fish') return;
    const before = level();
    const cat = c.species && c.species.category;
    const bonus = cat === 'quai_vat' ? 3 : cat === 'khong_lo' || cat === 'dot_bien' ? 2 : cat === 'meme' ? 1.5 : 1;
    G.state.skillXp = (G.state.skillXp || 0) + Math.round((4 + Math.sqrt(c.weight || 0) * 3) * bonus * (c.isNew ? 1.5 : 1));
    const after = level();
    if (after > before) {
      G.ui && G.ui.bigMessage && G.ui.bigMessage('Ngư Công lên cấp ' + after + '!', 'Skill Q/E/R mạnh hơn', '#f0b323');
      if (G.fx && G.fx.aura && G.player && G.player.obj) G.fx.aura(G.player.obj, 0xf0b323, 2.5, 1.8);
      G.audio && G.audio.play && G.audio.play('fanfare');
    }
  }

  function update(dt) {
    for (const k in cd) if (cd[k] > 0) cd[k] -= dt;
    for (const k in active) if (active[k] > 0) active[k] -= dt;
    const ctx = ctxNow(), inp = G.input;
    if (!ctx) { if (rage > 0) rage = Math.max(0, rage - dt * 4); return; } // Nộ nguội dần ngoài trận
    if (inp.blocked) return;
    for (const d of DEFS[ctx]) if (inp.pressed(d.key)) SK.cast(d.id);
  }

  SK.init = function () {
    G.addUpdate(update, 35); // sau player (30), trước fishing (40)
    G.bus.on('env:changed', SK.reset);
    G.bus.on('fish:caught', onCaught);
  };
})();
