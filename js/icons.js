// icons.js — bộ icon SVG tự vẽ (khung 24×24, nét, cùng kiểu với icon HUD trong ui.js).
// Thay cho emoji của hệ điều hành: G.ICONS[id] là phần ruột SVG; G.iconFor(item|env) chọn icon phù hợp.
(function () {
  const G = window.G;
  const I = {
    // ---- skill ----
    sk_thanluc: '<path d="M3 21C8 16 13 10 19 4"/><path d="M19 4v7"/><path d="M14 4l1.5 2.5M21 9l-2.5.5M10 9l1 2"/><circle cx="19" cy="13" r="1.6"/>',
    sk_loidien: '<path d="M13 2L7 11h5l-2 6"/><path d="M4 19.5c2.5-2.6 6-3.4 9.5-2l3.5-2v7l-3.5-2c-3.5 1.4-7 .6-9.5-1z"/>',
    sk_banhai: '<path d="M4 20c0-6 6-6 6-11a4 4 0 018 0"/><path d="M18 9c0 3-3 3-3 6s3 3 6 3"/><path d="M2 21h20"/><circle cx="16.5" cy="7" r=".6"/>',
    sk_lienhoan: '<path d="M8 10V7.5a1.5 1.5 0 013 0V10M11 9.5V7a1.5 1.5 0 013 0v3M14 9.5V8a1.5 1.5 0 013 0v5.5a5.5 5.5 0 01-5.5 5.5h-1A4.5 4.5 0 016 14.5V12a1.5 1.5 0 013 0"/><path d="M2 7h3M1.5 11h3M2 15h3"/>',
    sk_chandia: '<path d="M12 3v7M9 7l3 3 3-3"/><path d="M5 14l3 2 4-3 4 3 3-2"/><path d="M2 20c3-2 6-2 10-2s7 0 10 2"/>',
    // ---- môi trường ----
    env_forest: '<path d="M7 3l-4 7h2.5L3 15h8l-2.5-5H11z"/><path d="M7 15v5M16 6l-4 7h2.5L12 18h8l-2.5-5H20z"/><path d="M16 18v3"/>',
    env_plains: '<path d="M2 20h20M5 20v-6M5 14c-1.5-1-1.5-3 0-4 1.5 1 1.5 3 0 4zM11 20v-8M11 12c-1.5-1-1.5-3 0-4 1.5 1 1.5 3 0 4zM17 20v-6M17 14c-1.5-1-1.5-3 0-4 1.5 1 1.5 3 0 4z"/>',
    env_mountain: '<path d="M2 20l7-12 4 6 3-4 6 10z"/><path d="M7.4 10.7L9 12.5l1.6-1.8"/>',
    env_city: '<path d="M3 21V9h5v12M8 21V4h7v17M15 21V11h6v10M2 21h20"/><path d="M10.5 7h2M10.5 10h2M10.5 13h2M5 12h1M17 14h2M17 17h2"/>',
    env_island: '<path d="M2 20c4-2 16-2 20 0"/><path d="M12 19c0-5 1-9 3-12"/><path d="M15 7c-3-1-6 0-7 2M15 7c2-2 5-2 6 0M15 7c0-2 2-4 4-4M15 7c-1-2-4-3-6-2"/>',
    env_airplane: '<path d="M12 2c1 0 1.5 1 1.5 2.5V9l8 4.5v2l-8-2.5v5l2.5 2v1.5L12 20.5 8.5 21.5V20l2.5-2v-5l-8 2.5v-2l8-4.5V4.5C10.5 3 11 2 12 2z"/>',
    // ---- mồi ----
    bait_worm: '<path d="M4 15c1.5-3 4-3 5 0s3.5 3 5 0 3.5-3 5 0"/><circle cx="19.5" cy="14.5" r=".5"/>',
    bait_bread: '<path d="M5 20V11a4 4 0 01-1-2.6C4 5.9 7.6 4 12 4s8 1.9 8 4.4c0 1-.4 1.9-1 2.6v9z"/><path d="M9 12v.1M14 14v.1M11 17v.1"/>',
    bait_corn: '<path d="M12 21c-3-3-4-7-4-11a4 4 0 018 0c0 4-1 8-4 11z"/><path d="M8.5 10h7M8.5 14h7M12 6v13"/><path d="M8 13C5 12 4 9 4 6M16 13c3-1 4-4 4-7"/>',
    bait_shrimp: '<path d="M18 6a8 8 0 00-11 9c1 3 4 4 6 3l-2-3 3 1-1-3 3 1-1-3 3 1c1-2 1-4 0-6z"/><path d="M18 6l3-2M17 5l1-3"/>',
    bait_lure: '<path d="M10 3c3 0 5 3 5 7s-2 7-5 7-4-3-4-7 1-7 4-7z"/><path d="M10 17v2a2 2 0 004 0M10 3V2"/>',
    bait_jig: '<circle cx="9" cy="8" r="4"/><path d="M12 10l3 5v3a2 2 0 01-4 0"/><path d="M13 7c3 0 6 2 8 5"/>',
    bait_frog: '<path d="M4 15c0-4 3.6-7 8-7s8 3 8 7-3.6 4-8 4-8 0-8-4z"/><circle cx="8.5" cy="8" r="2"/><circle cx="15.5" cy="8" r="2"/><path d="M8 15c2 1.5 6 1.5 8 0M3 19l3-2M21 19l-3-2"/>',
    bait_chicken: '<path d="M14 4a6 6 0 016 6c0 4-4 7-8 6l-4 4"/><path d="M14 4C10 4 7 7 8 11l2 3"/><circle cx="6.5" cy="18.5" r="1.5"/><circle cx="4.5" cy="20.5" r="1.2"/>',
    bait_pate: '<path d="M4 8h16v10a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><path d="M4 8c0-2 3.6-3 8-3s8 1 8 3M4 12h16M9 4l6 0"/>',
    bait_beer: '<path d="M5 7h10v12a2 2 0 01-2 2H7a2 2 0 01-2-2z"/><path d="M15 10h2a2 2 0 012 2v3a2 2 0 01-2 2h-2M5 7c0-2 1.5-3 3-3 1 0 1.5.5 2 1 .5-1 2-1.5 3-1 1.5.5 2 1.5 2 3"/>',
    bait_glow: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.5 1.5M17 17l1.5 1.5M5.6 18.4L7 17M17 7l1.5-1.5"/>',
    bait_meat: '<path d="M14.5 4.5c3 1 5 4 4.5 7.5-.6 4.4-5 8-9.5 7.5S3 15 4 11c.8-3.2 4-5.2 6.5-5.2 1.4 0 2.6-.8 4-1.3z"/><circle cx="12" cy="12.5" r="2.2"/>',
    bait_nuke: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.6"/><path d="M12 10.4L9 5.4a7 7 0 016 0zM10.6 12.8l-5.7.3a7 7 0 013 5.2zM13.4 12.8l5.7.3a7 7 0 01-3 5.2z"/>',
    // ---- ăn uống, đồ dùng ----
    food_xoi: '<path d="M3 11h18a9 9 0 01-18 0z"/><path d="M5 11c0-3 3-5 7-5s7 2 7 5M9 8.5v.1M13 7.5v.1M15.5 9v.1"/>',
    food_grilledfish: '<path d="M3 21L21 3"/><path d="M6 14c2-4 6-6 10-4l2-3v8l-2-1c-4 2-8 1-10 0z"/><path d="M9 11l1 2M12 10l1 2"/>',
    drink_tea: '<path d="M6 4h12l-1.5 16a1 1 0 01-1 1h-7a1 1 0 01-1-1z"/><path d="M9 9h3v3H9zM13 12h2.5v2.5H13zM10 15h2v2h-2"/>',
    drink_beer: '<path d="M5 7h10v12a2 2 0 01-2 2H7a2 2 0 01-2-2z"/><path d="M15 10h2a2 2 0 012 2v3a2 2 0 01-2 2h-2M5 7c0-2 1.5-3 3-3 1 0 1.5.5 2 1 .5-1 2-1.5 3-1 1.5.5 2 1.5 2 3M8.5 11v6M11.5 11v6"/>',
    drink_ruou: '<path d="M9 3h6v3l3 4v9a2 2 0 01-2 2H8a2 2 0 01-2-2v-9l3-4z"/><path d="M6 13h12"/>',
    drink_ruou_ran: '<path d="M9 3h6v3l3 4v9a2 2 0 01-2 2H8a2 2 0 01-2-2v-9l3-4z"/><path d="M9 18c0-2 6-1 6-3.5S9 13 9 11c0-1 1-2 2.5-2"/><circle cx="12" cy="9" r=".5"/>',
    item_dynamite: '<path d="M6 9h10v11H6z"/><path d="M9.5 9v11M12.5 9v11M11 9c0-3 2-5 5-5"/><path d="M17.5 2.5l1 1.5M19.5 4.5l1.5.5M18 6l1 1"/>',
    item_disguise: '<path d="M3 15c0-5 4-9 9-9s9 4 9 9"/><path d="M2 15h20M12 6v-2M7 10l1 1M17 10l-1 1"/>',
    item_ticket_plane: '<path d="M3 8a2 2 0 002-2h14a2 2 0 002 2v8a2 2 0 00-2 2H5a2 2 0 00-2-2z"/><path d="M14 6v12" stroke-dasharray="2 2"/><path d="M6 12h5M8.5 9.5l2.5 2.5-2.5 2.5"/>',
    // ---- thuyền ----
    boat_raft: '<path d="M3 14h18M3 17h18M5 11v9M10 11v9M14 11v9M19 11v9"/>',
    boat_basket: '<ellipse cx="12" cy="14" rx="9" ry="4"/><path d="M3 14c0 3 4 6 9 6s9-3 9-6M7 11l1 6M12 10v7M17 11l-1 6"/>',
    // ---- rác câu được ----
    junk_shoe: '<path d="M3 17V9h4l2 3 6 1c3 .5 6 2 6 4v1H3z"/><path d="M3 15h18M10 12l1-2M13 12.5l1-2"/>',
    junk_sandal: '<path d="M8 3c4 0 6 3 6 8s-2 10-6 10-5-4-5-9 1-9 5-9z"/><path d="M5.5 9L8 12l3-3"/>',
    junk_boot: '<path d="M7 3h7v10l4 2c2 1 3 2 3 4v2H7z"/><path d="M7 17h14M7 7h7"/>',
    junk_shirt: '<path d="M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z"/>',
    junk_pants: '<path d="M6 3h12l1.5 18h-5L12 10l-2.5 11h-5z"/><path d="M6 6h12M8 13l1-3"/>',
    junk_undies: '<path d="M3 7h18l-1 4c-3 0-5 2-6 6h-4c-1-4-3-6-6-6z"/><path d="M3 9h18"/><circle cx="8" cy="12" r=".6"/><circle cx="15" cy="12" r=".6"/>',
    junk_bra: '<path d="M3 8c1 4 3 6 5.5 6S12 11 12 9c0 2 1 5 3.5 5S20 12 21 8"/><path d="M3 8h18M12 9V8M3 8v8M21 8v8"/>',
    junk_hat: '<path d="M2 17L12 4l10 13z"/><path d="M5 17c4 2 10 2 14 0M10 12l1 .5M14 14l1 .5"/>',
    junk_tire: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1"/>',
    junk_can: '<path d="M7 5h10v14a2 2 0 01-2 2H9a2 2 0 01-2-2z"/><path d="M7 5c0-1 2-2 5-2s5 1 5 2M7 9h10M7 15h10"/>',
    junk_bike: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16l4-7h6l2 7M10 9l3 7h-7M14 6h3"/>',
    junk_phone: '<path d="M7 2h10a1 1 0 011 1v18a1 1 0 01-1 1H7a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M11 18h2M9 7l6 6M15 7l-6 6"/>',
    junk_chest: '<path d="M3 10a4 4 0 014-4h10a4 4 0 014 4v10H3z"/><path d="M3 12h18M10 12v3h4v-3"/>',
    // ---- nguyên liệu ----
    mat_wood: '<path d="M4 9h13a3 3 0 010 6H4"/><ellipse cx="4" cy="12" rx="2" ry="3"/><path d="M8 9v6M13 9v6"/>',
    mat_bamboo: '<path d="M9 2v20M15 2v20M9 7h6M9 13h6M9 19h6"/><path d="M15 7c2-1 4-1 5 0M9 13c-2-1-4-1-5 0"/>',
    mat_rubber: '<circle cx="12" cy="12" r="7"/><path d="M8 9c1.5 1 1.5 5 0 6M16 9c-1.5 1-1.5 5 0 6"/>',
    mat_cloth: '<path d="M4 5h12a3 3 0 013 3v11H7a3 3 0 01-3-3z"/><path d="M16 5a3 3 0 00-3 3v11M8 9l3 3M7 14l3 3"/>',
    mat_rope: '<ellipse cx="12" cy="9" rx="8" ry="4"/><path d="M4 9v4c0 2.2 3.6 4 8 4s8-1.8 8-4V9M12 17v4"/><ellipse cx="12" cy="9" rx="4" ry="1.8"/>',
    mat_scrap: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><circle cx="12" cy="12" r="3"/>',
    mat_steel: '<path d="M3 8l9-4 9 4-9 4z"/><path d="M3 8v8l9 4 9-4V8M12 12v8"/>',
    mat_alloy: '<path d="M4 16l3-7h10l3 7z"/><path d="M4 16h16v3H4zM9 12h6"/>',
    mat_cable: '<circle cx="9" cy="12" r="6"/><circle cx="9" cy="12" r="2.5"/><path d="M15 12h4v-2h2v4h-2v-2"/>',
    mat_engine: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/><circle cx="12" cy="12" r="7"/>',
    mat_chip: '<path d="M7 7h10v10H7z"/><path d="M10 10h4v4h-4zM9 4v3M12 4v3M15 4v3M9 17v3M12 17v3M15 17v3M4 9h3M4 12h3M4 15h3M17 9h3M17 12h3M17 15h3"/>',
    mat_uranium: '<path d="M12 2l3 5 5 1-3 4 1 6-6-3-6 3 1-6-3-4 5-1z"/><circle cx="12" cy="11" r="2"/>',
    mat_scale: '<path d="M12 3c5 0 8 4 8 9-3 0-5 2-8 9-3-7-5-9-8-9 0-5 3-9 8-9z"/><path d="M12 7c2.5 0 4 2 4 4.5M8 11.5C8 9 9.5 7 12 7"/>',
    mat_powder: '<path d="M10 3h4v5l5 9a2 2 0 01-1.8 3H6.8A2 2 0 015 17l5-9z"/><path d="M7.5 14h9M10 3h4"/>',
  };
  G.ICONS = I;
  // chọn icon theo id; đồ không có icon riêng thì theo loại
  const BY_TYPE = { rod: 'rod', line: 'spool', boat: 'boat', bait: 'bait', consumable: 'bag', junk: 'bag', material: 'mat_scrap' };
  G.iconKey = function (x) {
    if (!x) return 'bag';
    if (I[x.id]) return x.id;
    if (x.waterBody && I['env_' + x.id]) return 'env_' + x.id;
    if (x.id === 'food_banhmi') return 'banhmi';
    return BY_TYPE[x.type] || 'bag';
  };
})();
