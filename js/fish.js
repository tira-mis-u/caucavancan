// fish.js — loài cá, model 3D procedural, rollCatch, biteChance, cá ambient
(function () {
  const G = (window.G = window.G || {});
  const clamp = G.util.clamp;
  const rand = G.util.rand;
  const randInt = G.util.randInt;
  const pick = G.util.pick;
  const wpick = (arr) => {
    let s = 0; for (const a of arr) s += a.w;
    let r = Math.random() * s;
    for (const a of arr) { r -= a.w; if (r <= 0) return a; }
    return arr[arr.length - 1];
  };

  // =====================================================================
  // 1. LOÀI CÁ
  // =====================================================================
  // Preset hình dáng (model) theo họ cá. Đơn vị: chiều dài = 1.
  const P = {
    carp: { r: 0.15, peak: 0.55, blunt: 0.6, w: 0.55, tail: 'fork', dorsal: 'long', dR: [0.5, 0.8], scales: true },
    perch: { r: 0.16, peak: 0.55, blunt: 0.55, w: 0.5, tail: 'round', dorsal: 'spiky', dR: [0.48, 0.85] },
    minnow: { r: 0.09, peak: 0.6, blunt: 0.6, w: 0.45, tail: 'fork', dorsal: 'tri', dR: [0.5, 0.68] },
    goby: { r: 0.08, peak: 0.75, blunt: 0.45, w: 0.85, tail: 'round', dorsal: 'tri', dR: [0.5, 0.7], eyeS: 0.03 },
    tilapia: { r: 0.2, peak: 0.55, blunt: 0.5, w: 0.4, tail: 'round', dorsal: 'spiky', dR: [0.47, 0.85], stripes: 6 },
    snakehead: { r: 0.075, peak: 0.7, blunt: 0.5, ped: 0.3, w: 0.8, tail: 'round', dorsal: 'long', dR: [0.62, 0.92], segs: 4 },
    mackerel: { r: 0.1, peak: 0.5, blunt: 0.65, w: 0.6, tail: 'lunate', dorsal: 'tri', dR: [0.55, 0.72], stripes: 12, metal: 0.45 },
    catfish: { r: 0.09, peak: 0.75, blunt: 0.4, ped: 0.25, w: 0.95, tail: 'round', dorsal: 'tri', dR: [0.68, 0.82], whisk: 0.25, segs: 3 },
    tuna: { r: 0.15, peak: 0.5, blunt: 0.6, w: 0.7, tail: 'lunate', dorsal: 'tri', dR: [0.5, 0.68], metal: 0.45, rough: 0.35 },
    grouper: { r: 0.17, peak: 0.55, blunt: 0.42, w: 0.65, tail: 'round', dorsal: 'spiky', dR: [0.47, 0.82], spots: true },
    eel: { r: 0.045, peak: 0.6, blunt: 0.5, ped: 0.5, w: 0.8, tail: 'eel', dorsal: 'long', dR: [0.8, 0.95], segs: 6, anal: false },
    shark: { type: 'shark', r: 0.1, peak: 0.42, blunt: 0.55, ped: 0.15, w: 0.8, tail: 'shark', dorsal: 'tall', dR: [0.47, 0.62], dH: 0.16, pS: 0.2, eyeS: 0.016, eyeBlack: true, anal: false },
  };
  const mk = (preset, o) => Object.assign({}, P[preset] || {}, o);

  const SPECIES = [
    // ---------------- CÁ BÉ ----------------
    { id: 'ca_ro', name: 'Cá rô đồng', category: 'be', minW: 0.05, maxW: 0.4, behavior: 'normal', baits: ['bait_worm', 'bait_bread', 'bait_pate'], envs: ['forest', 'plains', 'city'], waterBodies: ['pond', 'river'], depth: [0, 3], temp: [18, 34], time: 'any', tide: 'any', price: 60000, rarity: 4,
      desc: 'Cá rô đồng béo ngậy, vảy cứng, nấu canh rau cải thì hết sẩy.', technique: 'Câu phao gần bờ, mồi giun. Thấy phao nhấp là giật ngay.', model: mk('perch', { c: 0x5a5a2a, b: 0xd8d090, finC: 0x6b5a30 }) },
    { id: 'ca_muong', name: 'Cá mương', category: 'be', minW: 0.02, maxW: 0.15, behavior: 'normal', speed: 6, baits: ['bait_bread', 'bait_worm', 'bait_corn'], envs: ['forest', 'plains', 'mountain'], waterBodies: ['river', 'lake', 'pond'], depth: [0, 2], temp: [12, 32], time: 'day', tide: 'any', price: 40000, rarity: 3,
      desc: 'Cá mương bạc lấp lánh, bơi thành đàn sát mặt nước.', technique: 'Câu phao nổi, thả mồi nông 0,5m. Cá ăn nhanh, giật sớm.', model: mk('minnow', { c: 0x8090a0, b: 0xf0f4f8, metal: 0.45, finC: 0xa0a8b0 }) },
    { id: 'ca_bong', name: 'Cá bống', category: 'be', minW: 0.02, maxW: 0.2, behavior: 'normal', speed: 3, baits: ['bait_worm', 'bait_pate'], envs: ['forest', 'plains', 'city'], waterBodies: ['pond', 'river'], depth: [0.5, 4], temp: [16, 34], time: 'any', tide: 'any', price: 120000, rarity: 5,
      desc: 'Cá bống nằm đáy, kho tiêu ăn với cơm trắng.', technique: 'Thả mồi sát đáy, chờ kiên nhẫn. Cá bống cắn rất nhẹ.', model: mk('goby', { c: 0x7a6040, b: 0xd8c8a0, spots: true, spotC: 0x4a3420, finC: 0x8a7050 }) },
    { id: 'ca_com', name: 'Cá cơm', category: 'be', minW: 0.005, maxW: 0.03, behavior: 'normal', speed: 7, baits: ['bait_shrimp', 'bait_bread', 'bait_worm'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [0, 15], temp: [20, 32], time: 'any', tide: 'any', price: 50000, rarity: 10,
      desc: 'Bé tí nhưng làm nước mắm ngon nhất quả đất.', technique: 'Câu nhiều lưỡi, mồi vụn. Đừng mong cá to.', lenK: 0.5, model: mk('minnow', { r: 0.07, c: 0x7aa0b8, b: 0xf0f8ff, metal: 0.5, stripes: 0 }) },
    { id: 'ca_trich', name: 'Cá trích', category: 'be', minW: 0.05, maxW: 0.3, behavior: 'runner', speed: 7, baits: ['bait_shrimp', 'bait_lure', 'bait_jig'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [0, 30], temp: [16, 30], time: 'any', tide: 'any', price: 45000, rarity: 6,
      desc: 'Cá trích bơi thành đàn khổng lồ, mồi của cá to.', technique: 'Cần máy quăng xa, cuộn mồi thìa nhanh qua đàn cá.', model: mk('minnow', { c: 0x3a5a8a, b: 0xeef4ff, metal: 0.55, finC: 0x7088a8 }) },
    { id: 'ca_diec', name: 'Cá diếc', category: 'be', minW: 0.05, maxW: 0.5, behavior: 'normal', baits: ['bait_bread', 'bait_corn', 'bait_worm'], envs: ['forest', 'plains', 'mountain', 'city'], waterBodies: ['pond', 'lake', 'river'], depth: [0.3, 4], temp: [10, 32], time: 'any', tide: 'any', price: 50000, rarity: 3,
      desc: 'Cá diếc dẹt, nhiều xương nhưng ngọt thịt.', technique: 'Phao nhạy, mồi bánh mì vê nhỏ.', model: mk('carp', { r: 0.19, c: 0x8a8a5a, b: 0xe8e0b0, metal: 0.3, finC: 0x9a8a60 }) },
    { id: 'ca_bay_mau', name: 'Cá bảy màu', category: 'be', minW: 0.003, maxW: 0.02, behavior: 'normal', speed: 5, baits: ['bait_bread', 'bait_worm', 'bait_pate'], envs: ['city', 'forest'], waterBodies: ['river', 'pond'], depth: [0, 1.5], temp: [20, 34], time: 'day', tide: 'any', price: 300000, rarity: 8,
      desc: 'Bé xíu, đuôi bảy sắc cầu vồng. Dân chơi cá cảnh trả giá cao.', technique: 'Lưỡi siêu nhỏ, mồi vụn, câu sát mặt nước kênh.', lenK: 0.55, model: mk('minnow', { c: 0xff7a30, b: 0xfff0c0, finC: 0x30a0ff, tail: 'round', tailS: 0.4, dorsal: 'sail', dR: [0.45, 0.7], dH: 0.16 }) },
    { id: 'ca_chach', name: 'Cá chạch suối', category: 'be', minW: 0.03, maxW: 0.3, behavior: 'normal', baits: ['bait_worm', 'bait_pate'], envs: ['forest', 'mountain'], waterBodies: ['pond', 'lake', 'river'], depth: [0.2, 3], temp: [8, 28], time: 'night', tide: 'any', price: 150000, rarity: 6,
      desc: 'Trơn tuột như lươn, đặc sản suối rừng.', technique: 'Câu đêm, mồi giun nằm đáy. Cầm chắc tay kẻo tuột!', lenK: 0.75, model: mk('eel', { c: 0x6a5030, b: 0xd0b080, spots: true, spotC: 0x3a2a18, segs: 5 }) },

    // ---------------- CÁ BÌNH THƯỜNG ----------------
    { id: 'ca_chep', name: 'Cá chép', category: 'thuong', minW: 0.5, maxW: 8, behavior: 'normal', baits: ['bait_corn', 'bait_bread', 'bait_worm', 'bait_beer'], envs: ['forest', 'plains', 'mountain', 'city'], waterBodies: ['pond', 'lake', 'river'], depth: [0.5, 6], temp: [10, 30], time: 'any', tide: 'any', price: 70000, rarity: 8,
      desc: 'Cá chép vàng óng, khéo thì hóa rồng.', technique: 'Câu phao hoặc câu lục, mồi ngô. Cá chép cắn từ từ, chờ phao chìm hẳn mới giật.', model: mk('carp', { c: 0xb08030, b: 0xf0d890, finC: 0xc06030, whisk: 0.07, metal: 0.25 }) },
    { id: 'ca_ro_phi', name: 'Cá rô phi', category: 'thuong', minW: 0.2, maxW: 2.5, behavior: 'normal', baits: ['bait_worm', 'bait_bread', 'bait_pate'], envs: ['forest', 'plains', 'city'], waterBodies: ['pond', 'river'], depth: [0.3, 4], temp: [20, 36], time: 'any', tide: 'any', price: 45000, rarity: 6,
      desc: 'Rô phi dễ tính, ăn gì cũng được, sống đâu cũng được.', technique: 'Câu phao mồi giun, độ sâu 1–2m.', model: mk('tilapia', { c: 0x4a5560, b: 0xc8ccd0, finC: 0x704050 }) },
    { id: 'ca_tram_co', name: 'Cá trắm cỏ', category: 'thuong', minW: 1, maxW: 15, behavior: 'normal', baits: ['bait_corn', 'bait_bread', 'bait_beer'], envs: ['forest', 'plains', 'mountain'], waterBodies: ['pond', 'lake', 'river'], depth: [0.5, 6], temp: [12, 30], time: 'day', tide: 'any', price: 65000, rarity: 12,
      desc: 'Trắm cỏ ăn cỏ, khỏe như trâu.', technique: 'Mồi ngô hoặc bánh mì, câu lục. Cá chạy dài, nhả dây từ từ.', model: mk('carp', { r: 0.12, c: 0x6a6a50, b: 0xe0dcc0, finC: 0x707050 }) },
    { id: 'ca_loc', name: 'Cá lóc', category: 'thuong', minW: 0.4, maxW: 5, behavior: 'diver', speed: 6, baits: ['bait_frog', 'bait_lure', 'bait_worm'], envs: ['forest', 'plains', 'city'], waterBodies: ['pond', 'river'], depth: [0, 3], temp: [20, 35], time: 'any', tide: 'any', price: 90000, rarity: 10,
      desc: 'Cá lóc đồng hung dữ, đớp mồi như sấm sét. Nướng trui thì tuyệt.', technique: 'Cần máy + nhái hơi, kéo mồi lướt mặt nước sát bụi cỏ. Cá đớp là giật mạnh!', lenK: 0.55, model: mk('snakehead', { c: 0x3a3a2a, b: 0xc8c0a0, spots: true, spotC: 0x1a1a10, finC: 0x3a3a2a }) },
    { id: 'ca_thu', name: 'Cá thu', category: 'thuong', minW: 2, maxW: 12, behavior: 'runner', speed: 8, baits: ['bait_lure', 'bait_jig', 'bait_shrimp'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [2, 40], temp: [22, 30], time: 'day', tide: 'any', price: 180000, rarity: 14,
      desc: 'Cá thu thịt chắc, chiên mắm thì ngon tuyệt.', technique: 'Cần máy, mồi thìa cuộn nhanh. Cá chạy rất nhanh, đừng siết phanh quá chặt.', lenK: 0.55, model: mk('mackerel', { c: 0x2a4a6a, b: 0xe8eef4, finC: 0x3a5a7a }) },
    { id: 'ca_hong', name: 'Cá hồng', category: 'thuong', minW: 0.5, maxW: 6, behavior: 'diver', baits: ['bait_shrimp', 'bait_jig'], envs: ['island'], waterBodies: ['sea'], depth: [5, 60], temp: [20, 30], time: 'any', tide: 'any', price: 160000, rarity: 12,
      desc: 'Cá hồng đỏ rực, mâm cỗ nào cũng muốn có.', technique: 'Câu dọc gần rạn, mồi tôm. Cá lao xuống đáy ngay khi dính.', model: mk('perch', { r: 0.17, c: 0xd03030, b: 0xffb0a0, finC: 0xe04040, metal: 0.2 }) },
    { id: 'ca_tre', name: 'Cá trê', category: 'thuong', minW: 0.3, maxW: 3, behavior: 'normal', baits: ['bait_worm', 'bait_pate', 'bait_beer'], envs: ['forest', 'plains', 'city'], waterBodies: ['pond', 'river'], depth: [0.5, 4], temp: [20, 34], time: 'night', tide: 'any', price: 60000, rarity: 7,
      desc: 'Cá trê da trơn, râu dài, thích bùn.', technique: 'Câu đêm, mồi pate nằm đáy bùn.', lenK: 0.55, model: mk('catfish', { c: 0x4a4030, b: 0xb0a080, finC: 0x40382a }) },
    { id: 'ca_hoi', name: 'Cá hồi suối lạnh', category: 'thuong', minW: 1, maxW: 10, behavior: 'jumper', speed: 7, baits: ['bait_lure', 'bait_worm', 'bait_shrimp'], envs: ['mountain'], waterBodies: ['lake', 'river'], depth: [0.5, 12], temp: [3, 16], time: 'any', tide: 'any', price: 300000, rarity: 14,
      desc: 'Cá hồi vân hồng, sống ở nước lạnh trên núi.', technique: 'Cần máy, mồi thìa. Cá hay nhảy khỏi mặt nước — nhấn S hạ cần khi cá nhảy!', model: mk('tuna', { r: 0.12, c: 0x5a7080, b: 0xf0d0c0, spots: true, spotC: 0x30383c, finC: 0x6a7a80, stripes: 0, tail: 'fork', metal: 0.3 }) },
    { id: 'ca_lang', name: 'Cá lăng', category: 'thuong', minW: 1, maxW: 12, behavior: 'puller', baits: ['bait_worm', 'bait_shrimp', 'bait_chicken'], envs: ['plains', 'mountain'], waterBodies: ['river', 'lake'], depth: [2, 15], temp: [12, 30], time: 'night', tide: 'any', price: 250000, rarity: 16,
      desc: 'Cá lăng sông thịt trắng ngần, đặc sản đắt đỏ.', technique: 'Câu lục đêm, mồi tôm hoặc gà. Cá ghì đáy rất mạnh.', lenK: 0.55, model: mk('catfish', { c: 0x6a7078, b: 0xe0e4e8, whisk: 0.35, tail: 'fork', finC: 0x60686e }) },
    { id: 'ca_tai_tuong', name: 'Cá tai tượng', category: 'thuong', minW: 0.5, maxW: 6, behavior: 'normal', baits: ['bait_bread', 'bait_corn'], envs: ['plains', 'city'], waterBodies: ['river', 'pond'], depth: [0.5, 4], temp: [22, 34], time: 'day', tide: 'any', price: 85000, rarity: 10,
      desc: 'Thân tròn như cái quạt, chiên xù dựng đứng ăn với bánh tráng.', technique: 'Câu phao, mồi bánh mì nổi lơ lửng.', model: mk('tilapia', { r: 0.24, c: 0x7a7060, b: 0xe8e0d0, finC: 0x7a6a50, stripes: 0 }) },
    { id: 'ca_chinh', name: 'Cá chình', category: 'thuong', minW: 0.5, maxW: 5, behavior: 'diver', baits: ['bait_worm', 'bait_shrimp', 'bait_chicken'], envs: ['forest', 'mountain', 'plains'], waterBodies: ['river', 'lake', 'pond'], depth: [1, 10], temp: [10, 30], time: 'night', tide: 'any', price: 400000, rarity: 18,
      desc: 'Cá chình dài như rắn, quấn chặt vào đá.', technique: 'Câu đêm sát đáy đá. Dính là kéo ngay, để nó chui hang là mất.', lenK: 0.8, model: mk('eel', { c: 0x4a4a30, b: 0xc0b890 }) },

    // ---------------- CÁ TO TO ----------------
    { id: 'ca_tram_den', name: 'Cá trắm đen', category: 'to', minW: 5, maxW: 40, behavior: 'puller', baits: ['bait_shrimp', 'bait_worm', 'bait_corn'], envs: ['mountain', 'plains'], waterBodies: ['lake', 'river'], depth: [2, 15], temp: [8, 28], time: 'any', tide: 'any', price: 150000, rarity: 30,
      desc: 'Trắm đen 40 cân, vua của hồ nước ngọt.', technique: 'Câu lục, mồi ốc/tôm sát đáy. Cần Carbon và dây dù mới giữ nổi.', model: mk('carp', { r: 0.13, c: 0x252525, b: 0x707070, finC: 0x202020 }) },
    { id: 'ca_ngu', name: 'Cá ngừ đại dương', category: 'to', minW: 10, maxW: 80, behavior: 'runner', speed: 9, baits: ['bait_jig', 'bait_lure', 'bait_shrimp'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [5, 150], temp: [18, 30], time: 'day', tide: 'any', price: 250000, rarity: 28,
      desc: 'Ngư lôi sống của đại dương.', technique: 'Câu dọc jig hoặc cần máy. Cá chạy cực xa — nhả dây, nghiêng cần đúng hướng.', model: mk('tuna', { c: 0x1a2a50, b: 0xe0e8f0, finC: 0xe0c020 }) },
    { id: 'ca_chem', name: 'Cá chẽm', category: 'to', minW: 2, maxW: 30, behavior: 'jumper', speed: 7, baits: ['bait_lure', 'bait_frog', 'bait_shrimp'], envs: ['island', 'plains', 'city'], waterBodies: ['sea', 'river'], depth: [0.5, 15], temp: [22, 34], time: 'any', tide: 'high', price: 220000, rarity: 22,
      desc: 'Cá chẽm mắt đỏ, hay quẫy nhảy khỏi mặt nước khi dính câu.', technique: 'Cần máy, mồi giả lúc triều lên. Khi cá nhảy phải hạ cần (S) để khỏi văng lưỡi.', model: mk('perch', { r: 0.14, peak: 0.5, c: 0x6a7a70, b: 0xf0f0e8, metal: 0.4, finC: 0x5a6a60, eyeC: 0xff3020 }) },
    { id: 'ca_tra_khong_lo', name: 'Cá tra khổng lồ', category: 'to', minW: 30, maxW: 150, behavior: 'puller', speed: 5, baits: ['bait_pate', 'bait_worm', 'bait_chicken', 'bait_beer'], envs: ['plains', 'city'], waterBodies: ['river'], depth: [3, 20], temp: [22, 34], time: 'night', tide: 'any', price: 120000, rarity: 38,
      desc: 'Cá tra dầu sông Mê Kông, to như con bò.', technique: 'Câu lục đêm mồi pate, dây dù trở lên. Cá ghì đáy cả tiếng đồng hồ.', lenK: 0.52, model: mk('catfish', { r: 0.1, c: 0x5a5a60, b: 0xd0d0d0, whisk: 0.1, tail: 'fork', finC: 0x50505a }) },
    { id: 'ca_kiem', name: 'Cá kiếm', category: 'to', minW: 30, maxW: 200, behavior: 'jumper', speed: 9, baits: ['bait_jig', 'bait_lure', 'bait_shrimp'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [10, 300], temp: [18, 30], time: 'day', tide: 'any', price: 300000, rarity: 40,
      desc: 'Mũi kiếm dài đâm thủng cả thuyền gỗ.', technique: 'Câu dọc từ thuyền/máy bay. Cá nhảy liên tục — hạ cần (S) mỗi lần cá bay lên.', lenK: 0.62, model: mk('tuna', { r: 0.11, c: 0x203050, b: 0xd8e0e8, bill: 0.32, dorsal: 'sail', dR: [0.5, 0.82], dH: 0.18, finC: 0x304878 }) },
    { id: 'ca_mu', name: 'Cá mú', category: 'to', minW: 3, maxW: 50, behavior: 'diver', speed: 5, baits: ['bait_shrimp', 'bait_jig', 'bait_chicken'], envs: ['island'], waterBodies: ['sea'], depth: [5, 80], temp: [20, 30], time: 'any', tide: 'any', price: 350000, rarity: 25,
      desc: 'Cá mú đá lốm đốm, sống trong hang rạn san hô.', technique: 'Câu dọc sát rạn. Dính là phải cẩu lên ngay, để nó lặn vào hang là đứt dây.', model: mk('grouper', { c: 0x6a5030, b: 0xc8a878, spotC: 0x3a2a1a, finC: 0x5a4028 }) },
    { id: 'ca_nhong', name: 'Cá nhồng', category: 'to', minW: 2, maxW: 25, behavior: 'runner', speed: 9, baits: ['bait_lure', 'bait_jig'], envs: ['island'], waterBodies: ['sea'], depth: [1, 40], temp: [22, 32], time: 'day', tide: 'any', price: 120000, rarity: 20,
      desc: 'Barracuda răng nhọn hoắt, tốc độ chớp nhoáng.', technique: 'Cần máy cuộn mồi thìa thật nhanh.', lenK: 0.6, model: mk('snakehead', { r: 0.065, c: 0x607080, b: 0xe8ecf0, metal: 0.5, tail: 'fork', dorsal: 'tri', dR: [0.62, 0.74], segs: 3, stripes: 14, finC: 0x50606e }) },
    { id: 'ca_bop', name: 'Cá bớp', category: 'to', minW: 5, maxW: 60, behavior: 'puller', speed: 6, baits: ['bait_shrimp', 'bait_jig', 'bait_chicken'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [3, 60], temp: [20, 30], time: 'any', tide: 'low', price: 200000, rarity: 26,
      desc: 'Cá bớp to khỏe, thịt béo, nấu lẩu măng chua bá cháy.', technique: 'Câu dọc lúc triều xuống, mồi tôm sống.', lenK: 0.55, model: mk('snakehead', { r: 0.09, c: 0x3a3028, b: 0xe0d8c8, tail: 'lunate', dorsal: 'tri', dR: [0.6, 0.75], segs: 2, stripes: 0, finC: 0x2a2420 }) },

    // ---------------- CÁ KHỔNG LỒ ----------------
    { id: 'ca_ho', name: 'Cá hô', category: 'khong_lo', minW: 50, maxW: 300, behavior: 'puller', baits: ['bait_corn', 'bait_beer', 'bait_meat'], envs: ['plains', 'city'], waterBodies: ['river'], depth: [4, 25], temp: [22, 34], time: 'any', tide: 'any', price: 500000, rarity: 55,
      desc: 'Cá chép khổng lồ của sông Mê Kông, quý hiếm vô cùng.', technique: 'Câu lục mồi ngô ủ rượu, cần thép. Cá kéo như xe tải.', model: mk('carp', { r: 0.15, c: 0x8a9098, b: 0xe8e8e0, metal: 0.35, finC: 0x8a6060 }) },
    { id: 'ca_duoi', name: 'Cá đuối khổng lồ', category: 'khong_lo', minW: 40, maxW: 600, behavior: 'puller', speed: 5, baits: ['bait_shrimp', 'bait_chicken', 'bait_meat'], envs: ['island', 'plains'], waterBodies: ['sea', 'river'], depth: [3, 60], temp: [18, 32], time: 'any', tide: 'any', price: 150000, rarity: 50,
      desc: 'Cá đuối nước ngọt to như tấm phản, đuôi có gai độc.', technique: 'Mồi nằm đáy, cần thép. Cá đuối hút chặt xuống đáy như giác hút — bơm cần (W) liên tục.', lenK: 0.5, model: { type: 'ray', c: 0x5a4a3a, b: 0xf0e8e0 } },
    { id: 'ca_mu_khong_lo', name: 'Cá mú khổng lồ', category: 'khong_lo', minW: 80, maxW: 400, behavior: 'diver', speed: 4, baits: ['bait_chicken', 'bait_meat', 'bait_shrimp'], envs: ['island'], waterBodies: ['sea'], depth: [10, 100], temp: [20, 30], time: 'any', tide: 'any', price: 400000, rarity: 55,
      desc: 'Mú nghệ to bằng chiếc xe máy, nuốt chửng cả cá mập con.', technique: 'Câu dọc, tảng thịt bò. Phải cẩu thật nhanh trước khi nó chui vào hang.', model: mk('grouper', { r: 0.19, c: 0x4a4a3a, b: 0xb8b090, spotC: 0xd8d0b0, finC: 0xc0a020 }) },
    { id: 'ca_ngu_vay_xanh', name: 'Cá ngừ vây xanh', category: 'khong_lo', minW: 100, maxW: 500, behavior: 'runner', speed: 10, baits: ['bait_jig', 'bait_meat', 'bait_shrimp'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [20, 500], temp: [8, 26], time: 'any', tide: 'any', price: 1000000, rarity: 62,
      desc: 'Báu vật đại dương 500kg, một con bằng cả căn nhà.', technique: 'Câu dọc từ thuyền/máy bay, cần thép + dây cáp. Cá chạy hàng trăm mét.', model: mk('tuna', { c: 0x10204a, b: 0xe8eef8, metal: 0.5, finC: 0x203a80 }) },
    { id: 'ca_voi_map', name: 'Cá voi mập (vạn cân)', category: 'khong_lo', minW: 5000, maxW: 15000, behavior: 'puller', speed: 3, stamina: 100, difficulty: 9, baits: ['bait_meat', 'bait_glow', 'bait_shrimp'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [10, 800], temp: [20, 32], time: 'any', tide: 'any', price: 80000, rarity: 82,
      desc: 'Cá lớn nhất đại dương. Vạn cân thật sự — cần Titan mới mong lay chuyển.', technique: 'Cần Vạn Cân Titan + cáp tàu sân bay. Uống rượu rắn trước khi vật, không thì bị lôi xuống biển.', lenK: 0.5, model: mk('shark', { r: 0.11, w: 1.1, blunt: 0.35, c: 0x34485e, b: 0xe8eef2, spots: true, spotC: 0xe8eef2, dH: 0.12, eyeS: 0.012, wideMouth: true }) },
    { id: 'ca_tam', name: 'Cá tầm', category: 'khong_lo', minW: 50, maxW: 800, behavior: 'puller', speed: 4, baits: ['bait_worm', 'bait_shrimp', 'bait_meat'], envs: ['mountain'], waterBodies: ['lake'], depth: [10, 80], temp: [3, 18], time: 'any', tide: 'any', price: 600000, rarity: 60,
      desc: 'Hóa thạch sống, trứng làm trứng cá muối triệu đô.', technique: 'Câu lục mồi nằm đáy hồ sâu, cần thép.', lenK: 0.6, model: mk('shark', { type: 'fish', r: 0.08, c: 0x5a5a50, b: 0xd8d0c0, whisk: 0.06, bill: 0.08, scutes: true, finC: 0x4a4a40, dR: [0.5, 0.6], dH: 0.08 }) },
    { id: 'ca_map', name: 'Cá mập', category: 'khong_lo', minW: 60, maxW: 700, behavior: 'fighter', speed: 8, baits: ['bait_chicken', 'bait_meat', 'bait_shrimp'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [3, 200], temp: [16, 32], time: 'any', tide: 'any', price: 120000, rarity: 45,
      desc: 'Hàm răng 300 chiếc. Kéo lên bờ là nó cắn lại đấy!', technique: 'Đùi gà rán, câu dọc. Khi kéo vào bờ cá sẽ nhảy lên đánh nhau — chuột trái đấm, Shift né.', lenK: 0.55, model: mk('shark', { c: 0x5a6e80, b: 0xf0f0f0, teeth: true }) },
    { id: 'ca_sau', name: 'Cá sấu', category: 'khong_lo', minW: 30, maxW: 500, behavior: 'fighter', speed: 6, baits: ['bait_frog', 'bait_chicken', 'bait_meat'], envs: ['plains', 'forest', 'island'], waterBodies: ['river', 'pond', 'sea'], depth: [0.5, 10], temp: [22, 36], time: 'any', tide: 'any', price: 150000, rarity: 40,
      desc: 'Không phải cá nhưng vẫn cắn câu. Lên bờ là đòi đánh nhau.', technique: 'Mồi nhái hoặc gà rán. Kéo vào bờ rồi chuẩn bị tinh thần ăn đòn.', lenK: 0.62, model: { type: 'croc', c: 0x4a5a2a, b: 0xd8cf8a } },

    // ---------------- QUÁI VẬT ----------------
    { id: 'quai_vat_ho_nui', name: 'Quái vật hồ núi', category: 'quai_vat', minW: 2000, maxW: 8000, behavior: 'puller', speed: 6, baits: ['bait_glow', 'bait_meat', 'bait_nuke'], envs: ['mountain'], waterBodies: ['lake'], depth: [15, 200], temp: [0, 30], time: 'night', tide: 'any', price: 200000, rarity: 92,
      desc: 'Cổ dài, mắt đỏ, sống dưới đáy hồ từ thời khủng long. Dân làng đồn mãi mà chẳng ai tin.', technique: 'Đêm tối, mồi phát quang, cần Titan. Nó kéo người xuống hồ như chơi.', lenK: 0.6, model: { type: 'lakemonster', c: 0x2f4f3f, b: 0x8fa58a } },
    { id: 'muc_khong_lo', name: 'Mực khổng lồ', category: 'quai_vat', minW: 300, maxW: 1500, behavior: 'puller', speed: 6, baits: ['bait_glow', 'bait_meat', 'bait_jig'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [50, 1000], temp: [2, 28], time: 'night', tide: 'any', price: 300000, rarity: 85,
      desc: 'Kraken! Xúc tu dài hơn cả thuyền đánh cá.', technique: 'Câu dọc đêm, mồi phát quang thả thật sâu. Đừng để xúc tu quấn vào thuyền.', lenK: 0.85, model: { type: 'squid', c: 0xb83228, b: 0xf0b0a0 } },
    { id: 'ca_van_can', name: 'Cá Vạn Cân huyền thoại', category: 'quai_vat', minW: 15000, maxW: 20000, behavior: 'puller', speed: 7, stamina: 100, difficulty: 10, baits: ['bait_meat', 'bait_glow', 'bait_nuke'], envs: ['island', 'airplane', 'mountain'], waterBodies: ['sea', 'lake'], depth: [30, 2000], temp: [0, 35], time: 'night', tide: 'high', price: 15000, rarity: 99,
      desc: 'Truyền thuyết kể rằng ai câu được nó sẽ thành Vua Câu Cá. Nặng hai vạn cân, vảy vàng phát sáng.', technique: 'Chỉ Cần Vạn Cân Titan + cáp tàu sân bay. Đêm trăng triều cường, mồi uranium hoặc thịt bò.', model: { type: 'legend', r: 0.15, peak: 0.55, blunt: 0.6, w: 0.6, tail: 'flow', tailS: 0.3, dorsal: 'sail', dR: [0.38, 0.86], dH: 0.24, pS: 0.24, scales: true, whisk: 0.5, c: 0xd4a017, b: 0xfff0a0, finC: 0xe03020, metal: 0.7, rough: 0.25, glow: 0xffaa00, ei: 0.35, crown: true, halo: 0xffcc44, spikes: 0xc01a00, horns: 0x3aa070 } },

    // ---- Biển sâu: khổng lồ & quái vật (đảo / dưới máy bay) ----
    { id: 'ca_mai_cheo', name: 'Cá mái chèo khổng lồ', category: 'khong_lo', minW: 150, maxW: 600, behavior: 'diver', speed: 5, baits: ['bait_glow', 'bait_shrimp', 'bait_jig'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [40, 1000], temp: [4, 28], time: 'night', tide: 'any', price: 500000, rarity: 80,
      desc: 'Dải bạc dài 10 mét với bờm đỏ rực, người xưa tưởng là rắn biển. Hiện lên là điềm báo bão.', technique: 'Câu dọc đêm, mồi phát quang thả thật sâu. Cá lặn sâu liên tục — ghì cần và bơm cần (W).', lenK: 1.25,
      model: mk('eel', { r: 0.03, c: 0xc8d0dc, b: 0xf2f6fa, finC: 0xe02030, dorsal: 'long', dR: [0.08, 0.99], dH: 0.06, segs: 7, tail: 'eel', metal: 0.4 }) },
    { id: 'ca_mat_trang', name: 'Cá mặt trăng', category: 'khong_lo', minW: 500, maxW: 2300, behavior: 'puller', speed: 2, stamina: 90, baits: ['bait_jig', 'bait_shrimp', 'bait_glow'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [10, 600], temp: [10, 28], time: 'day', tide: 'any', price: 60000, rarity: 74,
      desc: 'Cái đĩa bay 2 tấn biết bơi: thân tròn dẹt, vây lưng và vây bụng cao như hai cánh buồm, gần như không có đuôi.', technique: 'Cá chậm nhưng nặng như xe tải — nhả dây đều, đừng ghì quá tay kẻo đứt.', lenK: 0.32,
      model: mk('tilapia', { r: 0.34, peak: 0.42, blunt: 0.25, ped: 0.7, w: 0.28, tail: 'round', tailS: 0.16, dorsal: 'tall', dR: [0.18, 0.34], dH: 0.36, aR: [0.18, 0.34], aH: 0.36, aStyle: 'tall', eyeS: 0.025, stripes: 0 }) },
    { id: 'ca_nham_phoi_nang', name: 'Cá nhám phơi nắng', category: 'khong_lo', minW: 2000, maxW: 7000, behavior: 'puller', speed: 3, stamina: 100, baits: ['bait_shrimp', 'bait_meat', 'bait_glow'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [5, 900], temp: [8, 24], time: 'any', tide: 'high', price: 50000, rarity: 84,
      desc: 'Há cái miệng to như cửa garage để lọc tôm tép. Hiền khô nhưng nặng 7 tấn.', technique: 'Cần Titan, dây cáp. Cá không cắn mạnh mà cứ thế bơi đi — kéo bền bỉ, đừng để thuyền bị lật.', lenK: 0.5,
      model: mk('shark', { r: 0.12, w: 1.0, blunt: 0.4, c: 0x5a5a58, b: 0xcfcac0, wideMouth: true, eyeS: 0.01, dH: 0.14 }) },
    { id: 'ca_cau_vuc_tham', name: 'Cá cần câu vực thẳm', category: 'quai_vat', minW: 3000, maxW: 10000, behavior: 'puller', speed: 5, baits: ['bait_glow', 'bait_meat', 'bait_nuke'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [200, 3000], temp: [0, 20], time: 'night', tide: 'any', price: 40000, rarity: 93,
      desc: 'Ngọn đèn xanh lơ lửng giữa vực sâu... rồi một cái hàm đầy răng to bằng căn phòng há ra.', technique: 'Thả mồi phát quang sâu hết cỡ lúc nửa đêm. Thấy đèn xanh dưới nước thì chuẩn bị tinh thần.', lenK: 0.36,
      model: mk('grouper', { r: 0.25, peak: 0.62, blunt: 0.28, w: 0.95, c: 0x1e1418, b: 0x3a2c30, fangs: true, eyeS: 0.018, tail: 'round', dorsal: 'spiky', dR: [0.3, 0.6], dH: 0.1, lure: 0x60ffd8, eyeC: 0x60ffd8 }) },
    { id: 'megalodon', name: 'Cá mập Megalodon', category: 'quai_vat', minW: 12000, maxW: 20000, behavior: 'puller', speed: 9, stamina: 100, difficulty: 10, baits: ['bait_meat', 'bait_chicken', 'bait_nuke'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [50, 2000], temp: [4, 30], time: 'any', tide: 'any', price: 25000, rarity: 97,
      desc: 'Tổ tiên cá mập, tưởng tuyệt chủng 3 triệu năm. Mỗi cái răng to bằng bàn tay, đầy sẹo chiến trận.', technique: 'Cần Titan + cáp tàu sân bay, tảng thịt bò. Nó lao như tàu ngầm — dùng Q giữ thăng bằng, E phá chiêu.', lenK: 0.6,
      model: mk('shark', { r: 0.13, w: 0.95, blunt: 0.38, c: 0x28323e, b: 0xd8d8d0, teeth: true, wideMouth: true, eyeC: 0xff2a10, dH: 0.15 }) },
    { id: 'hai_long_vuc_tham', name: 'Hải Long Vực Thẳm', category: 'quai_vat', minW: 18000, maxW: 25000, behavior: 'puller', speed: 8, stamina: 100, difficulty: 10, baits: ['bait_glow', 'bait_nuke', 'bait_meat'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [300, 3000], temp: [0, 30], time: 'night', tide: 'high', price: 20000, rarity: 99,
      desc: 'Rồng biển dài hơn tàu chở dầu, vảy xanh phát sáng như sao trời. Ngư dân gọi là chúa tể vực thẳm.', technique: 'Chỉ Cần Titan, cáp tàu sân bay, đêm triều cường, mồi uranium thả sâu nhất. Giữ Nộ cho Vạn Cân Bạt Hải (R).', lenK: 0.9,
      model: { type: 'dragon', r: 0.06, peak: 0.72, blunt: 0.5, ped: 0.35, w: 0.95, segs: 8, tail: 'flow', dorsal: 'none', anal: false, scales: true, c: 0x0e5a7a, b: 0x9ff0f0, finC: 0x20d0c0, metal: 0.5, rough: 0.3, glow: 0x30e0ff, ei: 0.3, halo: 0x40d0ff, eyeC: 0x80ffff, spikes: 0x20d0c0, horns: 0xe0f0ff } },

    // ---------------- CÁ ĐỘT BIẾN ----------------
    { id: 'ca_ba_mat', name: 'Cá ba mắt', category: 'dot_bien', minW: 1, maxW: 10, behavior: 'normal', baits: ['bait_pate', 'bait_nuke', 'bait_beer'], envs: ['city', 'plains'], waterBodies: ['river', 'pond'], depth: [0.5, 8], temp: [18, 38], time: 'any', tide: 'any', price: 400000, rarity: 45,
      desc: 'Sống gần cống xả nhà máy. Con mắt thứ ba nhìn thấu tâm can người câu.', technique: 'Mồi pate hoặc mồi uranium ở kênh thành phố.', model: mk('carp', { c: 0x6a8a4a, b: 0xd0e0a0, finC: 0x5a7a3a, eyes: 3, glow: 0x55ff55, ei: 0.12 }) },
    { id: 'ca_phat_sang', name: 'Cá phát sáng', category: 'dot_bien', minW: 0.5, maxW: 8, behavior: 'jumper', speed: 7, baits: ['bait_glow', 'bait_nuke'], envs: ['mountain', 'city', 'island'], waterBodies: ['lake', 'river', 'sea'], depth: [1, 50], temp: [4, 34], time: 'night', tide: 'any', price: 500000, rarity: 48,
      desc: 'Phát sáng xanh lam trong đêm như đèn LED.', technique: 'Chỉ xuất hiện ban đêm. Mồi phát quang, nhảy rất nhiều.', model: mk('minnow', { r: 0.12, c: 0x20d0ff, b: 0xc0ffff, finC: 0x40ffee, glow: 0x00ffee, ei: 0.9, halo: 0x40ffff, tail: 'flow' }) },
    { id: 'ca_thep', name: 'Cá thép', category: 'dot_bien', minW: 20, maxW: 150, behavior: 'diver', speed: 5, baits: ['bait_pate', 'bait_nuke', 'bait_meat'], envs: ['city', 'plains'], waterBodies: ['river'], depth: [2, 20], temp: [10, 40], time: 'any', tide: 'any', price: 200000, rarity: 60,
      desc: 'Vảy bằng thép tấm, đinh tán trên lưng. Ăn sắt vụn mà lớn.', technique: 'Cần thép mới chịu nổi. Thỉnh thoảng rụng ra tấm thép dùng để chế tạo.', model: mk('tuna', { c: 0x8a929c, b: 0xc0c8d0, metal: 0.95, rough: 0.25, rivets: true, finC: 0x707880, tail: 'fork' }) },
    { id: 'ca_hai_dau', name: 'Cá hai đầu', category: 'dot_bien', minW: 2, maxW: 20, behavior: 'normal', baits: ['bait_nuke', 'bait_pate'], envs: ['city', 'forest'], waterBodies: ['pond', 'river'], depth: [0.5, 6], temp: [15, 36], time: 'any', tide: 'any', price: 450000, rarity: 55,
      desc: 'Hai cái đầu cãi nhau suốt ngày không biết bơi về hướng nào.', technique: 'Cá lúng túng nên dễ vật, nhưng rất hiếm.', model: mk('carp', { c: 0x9a6a8a, b: 0xe8c8d8, finC: 0x8a5a7a, twohead: true, tail: 'none', peak: 0.5, ped: 0, dR: [0.5, 0.62], anal: false }) },
    { id: 'ca_rang_nguoi', name: 'Cá răng người', category: 'dot_bien', minW: 1, maxW: 12, behavior: 'normal', baits: ['bait_pate', 'bait_corn', 'bait_nuke'], envs: ['city', 'plains'], waterBodies: ['river'], depth: [0.5, 8], temp: [20, 36], time: 'any', tide: 'any', price: 350000, rarity: 50,
      desc: 'Hàm răng trắng đều như người. Cười một cái là ám ảnh cả đời.', technique: 'Mồi ngô hoặc pate. Cẩn thận khi gỡ lưỡi.', model: mk('tilapia', { r: 0.2, blunt: 0.35, c: 0x505868, b: 0xd06050, finC: 0x404858, teeth: true, stripes: 0 }) },

    // ---------------- MEME ----------------
    { id: 'ca_ca', name: 'Cá Cá', category: 'meme', minW: 5, maxW: 30, behavior: 'runner', speed: 6, baits: ['bait_bread', 'bait_pate', 'bait_beer'], envs: ['forest', 'plains', 'mountain', 'city', 'island'], waterBodies: ['pond', 'lake', 'river', 'sea'], depth: [0, 20], temp: [0, 40], time: 'any', tide: 'any', price: 90000, rarity: 70,
      desc: 'Một con cá được ghép từ... rất nhiều con cá. Đừng hỏi tại sao.', technique: 'Mồi bánh mì. Khi vật cá, đàn cá nhỏ tản ra rồi tụ lại — cứ kéo đều tay.', lenK: 0.5, model: { type: 'cluster', c: 0x8090a0, b: 0xf0f4f8 } },
    { id: 'ca_di_giay', name: 'Cá đi giày', category: 'meme', minW: 3, maxW: 25, behavior: 'fighter', speed: 6, baits: ['bait_worm', 'bait_pate', 'bait_beer'], envs: ['forest', 'plains', 'city'], waterBodies: ['pond', 'river'], depth: [0, 4], temp: [15, 36], time: 'day', tide: 'any', price: 150000, rarity: 65,
      desc: 'Đi đôi sneaker hàng hiệu, tự leo lên bờ đi dạo. Lên bờ là đòi đá nhau.', technique: 'Câu sát bờ. Cá sẽ chạy lên bờ — đấm (chuột trái) và né (Shift). Có khi rơi lại đôi giày.', model: mk('carp', { type: 'shoe', c: 0x7a8a3a, b: 0xe8e8b0, finC: 0x6a7a30, shoeC: 0xe02030 }) },
    { id: 'ca_map_3_chan', name: 'Cá mập 3 chân', category: 'meme', minW: 200, maxW: 1200, behavior: 'fighter', speed: 8, baits: ['bait_chicken', 'bait_meat', 'bait_beer'], envs: ['island', 'airplane'], waterBodies: ['sea'], depth: [3, 300], temp: [16, 34], time: 'any', tide: 'any', price: 180000, rarity: 80,
      desc: 'Cá mập xanh dương mọc 3 cái chân người đi giày thể thao 3 sọc. Tra-la-le-rô tra-la-la! Chạy trên bờ nhanh hơn bạn.', technique: 'Cần thép, mồi gà rán. Kéo lên bờ là nó chạy tới đá bạn bằng 3 chân.', lenK: 0.55, model: mk('shark', { type: 'shark3', c: 0x2a78d8, b: 0xf4f8ff, teeth: true }) },
    { id: 'ca_rong', name: 'Cá rồng', category: 'meme', minW: 50, maxW: 800, behavior: 'fighter', speed: 8, stamina: 90, difficulty: 9, baits: ['bait_glow', 'bait_meat', 'bait_nuke'], envs: ['mountain', 'island'], waterBodies: ['lake', 'sea'], depth: [8, 300], temp: [4, 30], time: 'night', tide: 'any', price: 300000, rarity: 88,
      desc: 'Cá chép vượt vũ môn hóa rồng. Vảy rồng rơi ra quý hơn vàng.', technique: 'Đêm, mồi phát quang, cần thép trở lên. Rồng sẽ lên bờ thử thách bạn.', lenK: 0.7, model: { type: 'dragon', r: 0.055, peak: 0.75, blunt: 0.5, ped: 0.35, w: 0.9, segs: 7, tail: 'flow', dorsal: 'none', anal: false, scales: true, c: 0xd4a017, b: 0xfff1a0, finC: 0xd62020, metal: 0.6, rough: 0.3, glow: 0xff9900, ei: 0.25, halo: 0xffbb33, eyeC: 0xff2020 } },
    { id: 'ca_sau_bay', name: 'Cá sấu bay', category: 'meme', minW: 50, maxW: 400, behavior: 'flying', speed: 8, baits: ['bait_chicken', 'bait_meat', 'bait_jig'], envs: ['airplane'], waterBodies: ['sky'], depth: [0, 2000], temp: [-10, 40], time: 'any', tide: 'any', price: 200000, rarity: 30,
      desc: 'Cá sấu có cánh dơi, săn mồi quanh máy bay ở độ cao 120m.', technique: 'Thả mồi gà rán lơ lửng giữa không trung. Cá bay vòng vòng — nghiêng cần theo hướng nó bay.', lenK: 0.6, model: { type: 'flycroc', c: 0x3e5a2e, b: 0xd8cf8a, wingC: 0x4a2a4a } },
    { id: 'ca_ga', name: 'Cá gà', category: 'meme', minW: 1, maxW: 8, behavior: 'fighter', speed: 5, baits: ['bait_corn', 'bait_chicken', 'bait_bread'], envs: ['forest', 'plains', 'city'], waterBodies: ['pond', 'river'], depth: [0, 3], temp: [15, 36], time: 'day', tide: 'any', price: 120000, rarity: 50,
      desc: 'Nửa cá nửa gà. Sáng nào cũng gáy ò ó o dưới ao.', technique: 'Mồi ngô! Lên bờ là nó mổ bạn túi bụi.', lenK: 0.42, model: mk('carp', { type: 'chicken', r: 0.16, ped: 0.55, c: 0xb5541c, b: 0xf2e6d0, finC: 0x8a3a10, tail: 'feather', dorsal: 'none', anal: false }) },
  ];

  const CAT_DEF = {
    be: { speed: 4, stamina: 12, difficulty: 1 }, thuong: { speed: 5, stamina: 30, difficulty: 3 },
    to: { speed: 7, stamina: 55, difficulty: 5 }, khong_lo: { speed: 6, stamina: 80, difficulty: 7 },
    quai_vat: { speed: 7, stamina: 95, difficulty: 9 }, dot_bien: { speed: 6, stamina: 50, difficulty: 6 },
    meme: { speed: 6, stamina: 55, difficulty: 6 },
  };
  const BY_ID = {};
  SPECIES.forEach((s) => {
    const d = CAT_DEF[s.category] || CAT_DEF.thuong;
    for (const k in d) if (s[k] == null) s[k] = d[k];
    if (s.strength == null) s.strength = clamp(Math.round(6 + 20 * Math.log10(1 + s.maxW) + (s.category === 'quai_vat' ? 6 : 0)), 1, 100);
    if (s.behavior === 'fighter' || s.behavior === 'jumper') s.difficulty = Math.min(10, s.difficulty + 1);
    s.time = s.time || 'any'; s.tide = s.tide || 'any';
    s.depth = s.depth || [0, 10]; s.temp = s.temp || [0, 40];
    s.color = s.model.c;
    if (!s.lenK) s.lenK = 0.46;
    if (s.model.type == null) s.model.type = 'fish';
    BY_ID[s.id] = s;
  });

  function get(id) { return BY_ID[id] || null; }
  function lengthFromWeight(sp, kg) {
    if (typeof sp === 'string') sp = get(sp);
    const k = (sp && sp.lenK) || 0.46;
    return k * Math.cbrt(Math.max(0.001, kg || 0.001));
  }
  function weightFromLength(sp, len) { const k = (sp && sp.lenK) || 0.46; return Math.pow(len / k, 3); }

  // =====================================================================
  // 2. HELPERS 3D
  // =====================================================================
  const CACHE = {};
  const cache = (key, fn) => CACHE[key] || (CACHE[key] = fn());
  const MATS = {};
  const UP = () => new THREE.Vector3(0, 1, 0);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  function M(color, o) {
    o = o || {};
    const key = color + '|' + JSON.stringify(o);
    if (MATS[key]) return MATS[key];
    let m;
    if (o.basic) {
      m = new THREE.MeshBasicMaterial({ color, transparent: o.op != null, opacity: o.op != null ? o.op : 1, depthWrite: !(o.op != null), side: o.ds ? THREE.DoubleSide : THREE.FrontSide, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending });
    } else {
      const p = { color: o.vc ? 0xffffff : color, roughness: o.rough != null ? o.rough : 0.55, metalness: o.metal != null ? o.metal : 0.05 };
      if (o.vc) p.vertexColors = true;
      if (o.em != null) { p.emissive = new THREE.Color(o.em); p.emissiveIntensity = o.ei != null ? o.ei : 1; }
      if (o.ds) p.side = THREE.DoubleSide;
      if (o.op != null) { p.transparent = true; p.opacity = o.op; }
      if (o.flat) p.flatShading = true;
      m = new THREE.MeshStandardMaterial(p);
    }
    return (MATS[key] = m);
  }
  const gSph = () => cache('g_sph', () => new THREE.SphereGeometry(1, 16, 12));
  const gSphLo = () => cache('g_sphlo', () => new THREE.SphereGeometry(1, 8, 6));
  const gBox = () => cache('g_box', () => new THREE.BoxGeometry(1, 1, 1));
  const gCyl = () => cache('g_cyl', () => new THREE.CylinderGeometry(1, 1, 1, 10));
  const gCylT = () => cache('g_cylt', () => new THREE.CylinderGeometry(0.6, 1, 1, 8)); // thon dần
  const gCone = () => cache('g_cone', () => new THREE.ConeGeometry(1, 1, 8));
  const gTorus = () => cache('g_torus', () => new THREE.TorusGeometry(1, 0.3, 8, 20));

  function mesh(parent, g, mat, px, py, pz, sx, sy, sz) {
    const m = new THREE.Mesh(g, mat);
    m.position.set(px || 0, py || 0, pz || 0);
    if (sx != null) m.scale.set(sx, sy != null ? sy : sx, sz != null ? sz : sx);
    if (parent) parent.add(m);
    return m;
  }
  function stick(parent, a, b, r, mat, g) {
    const d = b.clone().sub(a); const len = d.length() || 0.0001;
    const m = new THREE.Mesh(g || gCyl(), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.scale.set(r, len, r);
    m.quaternion.setFromUnitVectors(UP(), d.normalize());
    parent.add(m);
    return m;
  }
  let haloTex = null;
  function haloSprite(color, size) {
    if (!haloTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d');
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      haloTex = new THREE.CanvasTexture(c);
    }
    const key = 'halo' + color;
    const mat = MATS[key] || (MATS[key] = new THREE.SpriteMaterial({ map: haloTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
    const s = new THREE.Sprite(mat); s.scale.set(size, size, 1);
    return s;
  }
  function darker(hex, f) { const c = new THREE.Color(hex); c.multiplyScalar(f || 0.7); return c.getHex(); }

  // =====================================================================
  // DA CÁ: vẽ canvas theo từng loài (hoa văn thật: sọc, chấm, vảy, ánh cầu vồng...) thay vì pha 2 màu.
  // Canvas: trục x = thân từ đuôi (trái) → đầu (phải); trục y = lưng (trên) → bụng (dưới), 2 bên giống nhau.
  // =====================================================================
  const SW = 256, SH = 128;
  const css = (h, a) => { const c = new THREE.Color(h); return a == null ? '#' + c.getHexString() : `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`; };
  // PRNG cố định theo loài → mỗi loài 1 bộ hoa văn ổn định
  function prng(seed) { let s = 0; for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0; return () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 8) & 0xffff) / 65536; }; }
  const PAT = {
    bars(g, p, r) { // sọc đứng (rô phi, cá thu, cá kiếm)
      const n = p.n || 6, u0 = p.u0 != null ? p.u0 : 0.12, u1 = p.u1 != null ? p.u1 : 0.85, v1 = p.v1 != null ? p.v1 : 0.62;
      const gr = g.createLinearGradient(0, 0, 0, SH * v1); gr.addColorStop(0, css(p.c, p.a || 0.55)); gr.addColorStop(1, css(p.c, 0));
      g.fillStyle = gr;
      for (let i = 0; i < n; i++) {
        const x = SW * (u0 + (u1 - u0) * (i + 0.5) / n), w = SW * (u1 - u0) / n * (p.w || 0.4);
        g.beginPath(); g.moveTo(x - w / 2, 0);
        for (let y = 0; y <= SH * v1; y += 8) g.lineTo(x - w / 2 + Math.sin(y * 0.08 + i) * (p.wave || 0) * SW * 0.02, y);
        g.lineTo(x + w / 2, SH * v1); g.lineTo(x + w / 2, 0); g.fill();
      }
      void r;
    },
    band(g, p) { // dải ngang (cá cơm, cá bớp, cá hồi)
      const v = p.v || 0.45, h = p.h || 0.08, u0 = p.u0 || 0, u1 = p.u1 != null ? p.u1 : 1;
      const gr = g.createLinearGradient(0, SH * (v - h), 0, SH * (v + h));
      gr.addColorStop(0, css(p.c, 0)); gr.addColorStop(0.5, css(p.c, p.a || 0.9)); gr.addColorStop(1, css(p.c, 0));
      g.fillStyle = gr; g.fillRect(SW * u0, SH * (v - h), SW * (u1 - u0), SH * h * 2);
    },
    spots(g, p, r) { // chấm tròn (cá hồi, cá mú, cá bống)
      const cols = [].concat(p.c), v0 = p.v0 || 0, v1 = p.v1 != null ? p.v1 : 0.6, u0 = p.u0 || 0, u1 = p.u1 != null ? p.u1 : 0.92;
      for (let i = 0; i < (p.n || 40); i++) {
        g.fillStyle = css(cols[i % cols.length], p.a || 0.9);
        const rad = SH * (p.r || 0.025) * (0.6 + r() * 0.8);
        g.beginPath(); g.ellipse(SW * (u0 + (u1 - u0) * r()), SH * (v0 + (v1 - v0) * r()), rad * (p.sx || 1), rad, 0, 0, 6.283); g.fill();
      }
    },
    whale(g, p) { // cá nhám voi: lưới chấm trắng + vạch sáng mảnh
      g.strokeStyle = css(p.c, 0.35); g.lineWidth = 1.2;
      for (let x = 10; x < SW * 0.92; x += 14) { g.beginPath(); g.moveTo(x, 4); g.lineTo(x + 3, SH * 0.6); g.stroke(); }
      for (let y = 8; y < SH * 0.6; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(SW * 0.95, y); g.stroke(); }
      g.fillStyle = css(p.c, 0.95);
      for (let x = 3; x < SW * 0.95; x += 7) for (let y = 3; y < SH * 0.62; y += 7) {
        if (((x * 7 + y * 13) % 5) === 0) continue;
        g.beginPath(); g.arc(x + (y % 14 ? 3.5 : 0), y, x > SW * 0.75 ? 1.3 : 2, 0, 6.283); g.fill();
      }
    },
    scales(g, p) { // vảy chồng: viền tối + ánh sáng (chép, trắm, cá hô, cá vạn cân)
      const s = p.s || 11;
      for (let row = 0, y = -s * 0.5; y < SH * (p.v1 || 0.85); row++, y += s * 0.62) for (let x = (row % 2) * s * 0.5; x < SW * 0.92; x += s) {
        g.strokeStyle = css(p.c, p.a || 0.45); g.lineWidth = p.lw || 1.6;
        g.beginPath(); g.arc(x, y, s * 0.55, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
        if (p.hi) { g.strokeStyle = css(p.hi, 0.35); g.lineWidth = 1; g.beginPath(); g.arc(x, y - 1.5, s * 0.4, 0.3 * Math.PI, 0.7 * Math.PI); g.stroke(); }
      }
    },
    mottle(g, p, r) { // mảng loang (cá mú, cá bống, cá sấu, cá lóc)
      const cols = [].concat(p.c);
      for (let i = 0; i < (p.n || 26); i++) {
        g.fillStyle = css(cols[i % cols.length], p.a || 0.5);
        const x = SW * r() * 0.95, y = SH * ((p.v0 || 0) + ((p.v1 || 0.7) - (p.v0 || 0)) * r()), rad = SH * (p.r || 0.09) * (0.5 + r());
        g.beginPath();
        for (let k = 0; k <= 9; k++) { const a = k / 9 * 6.283, q = rad * (0.6 + 0.5 * Math.sin(a * 3 + i)); g.lineTo(x + Math.cos(a) * q * 1.3, y + Math.sin(a) * q); }
        g.fill();
      }
    },
    chevron(g, p) { // vạch chữ V (cá lóc, cá nhồng)
      g.strokeStyle = css(p.c, p.a || 0.6); g.lineWidth = SW * (p.w || 0.025);
      const n = p.n || 8;
      for (let i = 0; i < n; i++) { const x = SW * (0.1 + 0.75 * (i + 0.5) / n); g.beginPath(); g.moveTo(x - 8, 0); g.lineTo(x + 6, SH * (p.v || 0.35)); g.lineTo(x - 6, SH * (p.v1 || 0.6)); g.stroke(); }
    },
    reticulate(g, p, r) { // vân lưới (cá chạch, cá chình, cá gà)
      g.strokeStyle = css(p.c, p.a || 0.6); g.lineWidth = p.lw || 2.2;
      for (let i = 0; i < (p.n || 40); i++) { let x = SW * r(), y = SH * r() * (p.v1 || 0.7); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 14; g.lineTo(x, y); } g.stroke(); }
    },
    iris(g, p) { // ánh cầu vồng (cá bảy màu, cá hồi vân)
      const cols = p.c, v = p.v || 0.45, h = p.h || 0.18;
      const gr = g.createLinearGradient(SW * 0.05, 0, SW * 0.95, 0);
      cols.forEach((c, i) => gr.addColorStop(i / (cols.length - 1), css(c, p.a || 0.75)));
      g.save(); g.globalCompositeOperation = 'source-over';
      const m = g.createLinearGradient(0, SH * (v - h), 0, SH * (v + h));
      g.fillStyle = gr; g.globalAlpha = 1;
      g.beginPath(); g.ellipse(SW * 0.5, SH * v, SW * 0.48, SH * h, 0, 0, 6.283); g.fill(); g.restore(); void m;
    },
    patches(g, p, r) { // mảng lớn kiểu koi (cá hai đầu, cá đi giày)
      const cols = [].concat(p.c);
      for (let i = 0; i < (p.n || 5); i++) {
        g.fillStyle = css(cols[i % cols.length], p.a || 0.95);
        const x = SW * (0.12 + 0.75 * r()), y = SH * (0.05 + 0.4 * r()), rad = SH * (0.14 + 0.12 * r());
        g.beginPath(); for (let k = 0; k <= 12; k++) { const a = k / 12 * 6.283, q = rad * (0.75 + 0.3 * Math.sin(a * 2 + i * 1.7)); g.lineTo(x + Math.cos(a) * q * 1.6, y + Math.sin(a) * q); } g.fill();
      }
    },
    plates(g, p) { // tấm thép + đinh tán (cá thép)
      g.strokeStyle = css(p.c, 0.8); g.lineWidth = 2;
      for (let x = 20; x < SW; x += 34) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, SH); g.stroke(); }
      for (let y = 22; y < SH; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(SW, y); g.stroke(); }
      g.fillStyle = css(p.hi || 0xffffff, 0.7);
      for (let x = 20; x < SW; x += 34) for (let y = 22; y < SH; y += 30) [-5, 5].forEach((d) => { g.beginPath(); g.arc(x + d, y + 4, 1.6, 0, 6.283); g.fill(); });
    },
    feathers(g, p) { // lông vũ chồng (cá gà)
      for (let row = 0, y = 0; y < SH * 0.8; row++, y += 9) for (let x = (row % 2) * 7; x < SW; x += 14) {
        g.fillStyle = css(row % 3 ? p.c : p.c2 || p.c, 0.5); g.beginPath(); g.ellipse(x, y + 5, 6, 8, 0, 0, Math.PI); g.fill();
        g.strokeStyle = css(p.edge || 0x000000, 0.35); g.lineWidth = 1; g.beginPath(); g.ellipse(x, y + 5, 6, 8, 0, 0, Math.PI); g.stroke();
      }
    },
    runes(g, p, r) { // vân phát sáng chạy dọc thân (cá vạn cân, cá ba mắt, cá phát sáng)
      g.strokeStyle = css(p.c, p.a || 1); g.lineWidth = p.lw || 2; g.lineCap = 'round';
      for (let i = 0; i < (p.n || 6); i++) {
        let x = SW * 0.04, y = SH * ((p.v0 != null ? p.v0 : 0.15) + ((p.v1 || 0.55) - (p.v0 != null ? p.v0 : 0.15)) * i / Math.max(1, (p.n || 6) - 1));
        g.beginPath(); g.moveTo(x, y);
        while (x < SW * 0.9) { x += 6 + r() * 10; y += (r() - 0.5) * (p.jag || 8); g.lineTo(x, y); }
        g.stroke();
      }
      if (p.dots) { g.fillStyle = css(p.c, 1); for (let i = 0; i < p.dots; i++) { g.beginPath(); g.arc(SW * (0.05 + 0.85 * r()), SH * (0.15 + 0.6 * r()), 1.5 + r() * 2, 0, 6.283); g.fill(); } }
    },
    shade(g, p) { // tối dần về phía đầu/đuôi
      const gr = g.createLinearGradient(0, 0, SW, 0);
      gr.addColorStop(0, css(p.c, p.tail || 0)); gr.addColorStop(0.5, css(p.c, 0)); gr.addColorStop(1, css(p.c, p.head || 0.3));
      g.fillStyle = gr; g.fillRect(0, 0, SW, SH);
    },
  };
  // Da từng loài (tham khảo màu & hoa văn loài thật). back/side/belly: màu lưng/hông/bụng; line: vị trí ranh lưng-bụng.
  // fin/tail: { c: gốc vây, tip: mép vây, rays, spots:[màu], rainbow:[màu] }; glow: hoa văn phát sáng (emissiveMap).
  const SKIN = {
    ca_ro: { back: 0x3e4a22, side: 0x8a8a3a, belly: 0xe2d68a, pat: [{ t: 'bars', c: 0x2a3014, n: 7, a: 0.35 }, { t: 'spots', c: 0x1a1a0a, n: 1, r: 0.09, u0: 0.12, u1: 0.13, v0: 0.42, v1: 0.43 }, { t: 'scales', c: 0x2a2a10, s: 9, a: 0.35 }], fin: { c: 0x6a5a2a, tip: 0xc8a050 } },
    ca_muong: { back: 0x2e4660, side: 0x8ea2b6, belly: 0xf6f8fa, line: 0.4, pat: [{ t: 'band', c: 0xe8f0ff, v: 0.42, h: 0.04 }], fin: { c: 0xb0bcc8, tip: 0xff9a4a } },
    ca_bong: { back: 0x6a5232, side: 0xb0905a, belly: 0xeadcb4, pat: [{ t: 'mottle', c: [0x3a2a14, 0x5a4020], n: 18, r: 0.1 }, { t: 'spots', c: 0x2a1a0a, n: 60, r: 0.015 }], fin: { c: 0x8a7050, tip: 0xd8c090, spots: [0x3a2a14] } },
    ca_com: { back: 0x3a6a84, side: 0x9ab8c8, belly: 0xffffff, line: 0.38, pat: [{ t: 'band', c: 0xf0ffff, v: 0.46, h: 0.07, a: 1 }], fin: { c: 0xd0e0e8, tip: 0xffffff } },
    ca_trich: { back: 0x123a5a, side: 0x6a8eac, belly: 0xf4f8ff, line: 0.36, pat: [{ t: 'spots', c: 0x0a2a40, n: 6, r: 0.03, v0: 0.3, v1: 0.34, u0: 0.55, u1: 0.8 }], fin: { c: 0x7090a8, tip: 0xd0e0f0 } },
    ca_diec: { back: 0x5a5226, side: 0xb8a050, belly: 0xf0e2a8, pat: [{ t: 'scales', c: 0x3a3010, s: 12, a: 0.5, hi: 0xfff0b0 }], fin: { c: 0x9a8a50, tip: 0xc8b070 } },
    ca_bay_mau: { back: 0x3e4e44, side: 0x7a8c88, belly: 0xe8e0d0, pat: [{ t: 'iris', c: [0xff4020, 0xffa020, 0x30c0ff, 0x9040ff], v: 0.5, h: 0.2, a: 0.75 }, { t: 'spots', c: [0x101010, 0xff6020, 0x2080ff], n: 9, r: 0.06, u0: 0.1, u1: 0.55, v0: 0.3, v1: 0.6 }],
      fin: { c: 0xff7020, tip: 0x30a0ff, rainbow: [0xff2040, 0xff9020, 0xffe030, 0x40e070, 0x20a0ff, 0x8040ff], spots: [0x101010] } },
    ca_chach: { back: 0x5a4a20, side: 0xc0a050, belly: 0xf0e0b0, pat: [{ t: 'reticulate', c: 0x2a1e08, n: 50 }, { t: 'band', c: 0x2a1e08, v: 0.45, h: 0.03, a: 0.7 }], fin: { c: 0x8a7040, tip: 0xc0a070, spots: [0x2a1e08] } },
    ca_chep: { back: 0x6a4a14, side: 0xc89a30, belly: 0xf2dc9a, pat: [{ t: 'scales', c: 0x4a2a06, s: 15, a: 0.6, lw: 2, hi: 0xffe8a0 }, { t: 'shade', c: 0x2a1a00, head: 0.25 }], fin: { c: 0xb05a28, tip: 0xe07a30 } },
    ca_ro_phi: { back: 0x2e3a42, side: 0x7a8890, belly: 0xd8dce0, pat: [{ t: 'bars', c: 0x1a2028, n: 8, a: 0.5, w: 0.35 }, { t: 'scales', c: 0x1a2028, s: 10, a: 0.3 }], fin: { c: 0x5a3a40, tip: 0xd04a40, spots: [0xf0e0e0, 0x2a1a20] } },
    ca_tram_co: { back: 0x3a3e22, side: 0xa8a070, belly: 0xece6c8, pat: [{ t: 'scales', c: 0x2a2a14, s: 13, a: 0.65, lw: 1.8 }], fin: { c: 0x6a6440, tip: 0x908860 } },
    ca_loc: { back: 0x22261a, side: 0x5a5a3a, belly: 0xe0d8b8, line: 0.55, pat: [{ t: 'chevron', c: 0x101208, n: 9, a: 0.7, v: 0.35, v1: 0.62 }, { t: 'mottle', c: 0x14160c, n: 14, r: 0.06 }], fin: { c: 0x2a2a1a, tip: 0x6a6040, spots: [0x101008] } },
    ca_thu: { back: 0x1a3a5e, side: 0xa8bccc, belly: 0xf6f8fa, line: 0.38, pat: [{ t: 'bars', c: 0x1a2a40, n: 14, w: 0.25, wave: 1, a: 0.55, v1: 0.5 }, { t: 'spots', c: 0x1a2a40, n: 26, r: 0.025, v0: 0.3, v1: 0.55 }], fin: { c: 0x2a4a6a, tip: 0x8aa0b4 } },
    ca_hong: { back: 0xb01a20, side: 0xe84a48, belly: 0xffc0b0, pat: [{ t: 'scales', c: 0x8a1018, s: 10, a: 0.35, hi: 0xffd0c8 }, { t: 'band', c: 0xffe070, v: 0.48, h: 0.03, a: 0.5 }], fin: { c: 0xd02830, tip: 0xff7060 } },
    ca_tre: { back: 0x2a241a, side: 0x5a4c38, belly: 0xb8a888, line: 0.6, pat: [{ t: 'spots', c: 0xd8d0b8, n: 30, r: 0.014, a: 0.5 }], fin: { c: 0x3a3022, tip: 0x5a4c38 } },
    ca_hoi: { back: 0x3e5a3a, side: 0xc0b8a8, belly: 0xf8f0f0, line: 0.42, pat: [{ t: 'band', c: 0xff5a7a, v: 0.47, h: 0.1, a: 0.8 }, { t: 'spots', c: 0x141a12, n: 80, r: 0.016, v0: 0, v1: 0.55 }], fin: { c: 0x6a7a68, tip: 0xc0a8a0, spots: [0x141a12] } },
    ca_lang: { back: 0x4a5258, side: 0x9aa2a8, belly: 0xf0f2f4, line: 0.5, pat: [{ t: 'band', c: 0xd8e0e8, v: 0.47, h: 0.02, a: 0.8 }], fin: { c: 0x8a5a50, tip: 0xc07a60 } },
    ca_tai_tuong: { back: 0x5a5048, side: 0xb8a898, belly: 0xf0e6dc, pat: [{ t: 'bars', c: 0x3a3028, n: 9, a: 0.3, w: 0.4 }, { t: 'scales', c: 0x3a3028, s: 11, a: 0.4 }], fin: { c: 0x8a7a68, tip: 0xc0aa90 } },
    ca_chinh: { back: 0x3a3a1a, side: 0x7a7a3a, belly: 0xf0d870, line: 0.55, pat: [{ t: 'mottle', c: 0x22220c, n: 30, r: 0.07 }], fin: { c: 0x5a5a2a, tip: 0x8a8a40 } },
    ca_tram_den: { back: 0x0e0e0e, side: 0x2a2a2a, belly: 0x5a5a5a, pat: [{ t: 'scales', c: 0x000000, s: 15, a: 0.8, lw: 2.2, hi: 0x6a6a6a }], fin: { c: 0x141414, tip: 0x2a2a2a } },
    ca_ngu: { back: 0x0a1a46, side: 0x5a6a88, belly: 0xeef2f8, line: 0.36, pat: [{ t: 'band', c: 0xe8c020, v: 0.4, h: 0.04, a: 0.7, u0: 0.1, u1: 0.8 }, { t: 'spots', c: 0xffffff, n: 30, r: 0.012, v0: 0.5, v1: 0.75, a: 0.6 }], fin: { c: 0x1a2a5a, tip: 0xf0c820 } },
    ca_chem: { back: 0x3a4a38, side: 0x98a698, belly: 0xf8f8f4, line: 0.38, pat: [{ t: 'scales', c: 0x3a4438, s: 11, a: 0.45, hi: 0xffffff }], fin: { c: 0x5a6858, tip: 0x8a9a88 } },
    ca_tra_khong_lo: { back: 0x3e4248, side: 0x8e9298, belly: 0xf4f4f4, line: 0.5, pat: [{ t: 'shade', c: 0x101418, head: 0.35 }], fin: { c: 0x4a4e56, tip: 0x7a7e86 } },
    ca_kiem: { back: 0x0c1c40, side: 0x4a6a9a, belly: 0xe8eef6, line: 0.42, pat: [{ t: 'bars', c: 0x8ad0ff, n: 13, w: 0.22, a: 0.75, v1: 0.55 }], fin: { c: 0x1a2a5a, tip: 0x3a7ad0 } },
    ca_mu: { back: 0x4a3418, side: 0x9a7848, belly: 0xd8c098, pat: [{ t: 'mottle', c: [0x2a1a08, 0xc8a878], n: 30, r: 0.08, a: 0.55 }, { t: 'spots', c: 0x2a1a08, n: 90, r: 0.016 }], fin: { c: 0x5a4020, tip: 0xc8a070, spots: [0x2a1a08] } },
    ca_nhong: { back: 0x2a3a48, side: 0x9eacb8, belly: 0xffffff, line: 0.38, pat: [{ t: 'chevron', c: 0x2a3440, n: 16, a: 0.5, w: 0.012, v: 0.25, v1: 0.42 }, { t: 'spots', c: 0x101418, n: 10, r: 0.02, u0: 0.05, u1: 0.3, v0: 0.4, v1: 0.6 }], fin: { c: 0x50606e, tip: 0xe0c040 } },
    ca_bop: { back: 0x2a2018, side: 0x6a5a48, belly: 0xece4d8, line: 0.6, pat: [{ t: 'band', c: 0xf0ece4, v: 0.3, h: 0.04, a: 0.85 }, { t: 'band', c: 0xf0ece4, v: 0.5, h: 0.035, a: 0.8 }], fin: { c: 0x1e1812, tip: 0x3a3028 } },
    ca_ho: { back: 0x4a5058, side: 0xc0c4c8, belly: 0xf0eee8, pat: [{ t: 'scales', c: 0x1a1e24, s: 20, a: 0.75, lw: 2.6, hi: 0xffffff }], fin: { c: 0x8a5a5a, tip: 0xd08080 } },
    ca_mu_khong_lo: { back: 0x2a2a20, side: 0x5a5a48, belly: 0xb8b090, pat: [{ t: 'mottle', c: [0xd8d0a0, 0x141410], n: 24, r: 0.1, a: 0.6 }, { t: 'spots', c: 0xe8e0b0, n: 50, r: 0.02, a: 0.8 }], fin: { c: 0x3a3a28, tip: 0xf0c020, spots: [0x141410] } },
    ca_ngu_vay_xanh: { back: 0x060e30, side: 0x3a4a78, belly: 0xf2f4fa, line: 0.4, pat: [{ t: 'bars', c: 0xd0dcf0, n: 18, w: 0.15, a: 0.45, v1: 0.75 }, { t: 'band', c: 0x6ab0ff, v: 0.36, h: 0.03, a: 0.8 }], fin: { c: 0x0a1440, tip: 0xffd020 } },
    ca_voi_map: { back: 0x283a50, side: 0x3c5268, belly: 0xf0f4f6, line: 0.62, soft: 0.04, pat: [{ t: 'whale', c: 0xf0f4f6 }], fin: { c: 0x283a50, tip: 0x405a74, spots: [0xf0f4f6] } },
    ca_tam: { back: 0x3a3a32, side: 0x7a786a, belly: 0xeae4d4, line: 0.55, pat: [{ t: 'band', c: 0xf0ead8, v: 0.18, h: 0.02, a: 0.8 }, { t: 'band', c: 0xf0ead8, v: 0.45, h: 0.02, a: 0.8 }, { t: 'spots', c: 0x22221c, n: 40, r: 0.012 }], fin: { c: 0x4a4a40, tip: 0x7a786a } },
    ca_map: { back: 0x405468, side: 0x6a7e92, belly: 0xf6f6f6, line: 0.52, soft: 0.03, pat: [{ t: 'shade', c: 0x1a2430, head: 0.15, tail: 0.2 }], fin: { c: 0x4a5e72, tip: 0x101418 } },
    ca_sau: { back: 0x2a3418, side: 0x5a6a2a, belly: 0xd8cf8a, line: 0.6, pat: [{ t: 'bars', c: 0x141a0a, n: 12, a: 0.55, w: 0.45, v1: 0.6 }, { t: 'scales', c: 0x101408, s: 9, a: 0.6, lw: 1.4 }], fin: { c: 0x3a4a1e, tip: 0x5a6a2a } },
    quai_vat_ho_nui: { back: 0x14281e, side: 0x2f4f3f, belly: 0x8fa58a, pat: [{ t: 'mottle', c: [0x0a140e, 0x4a6a3a], n: 30, r: 0.1, a: 0.7 }, { t: 'scales', c: 0x061008, s: 8, a: 0.6 }], glow: [{ t: 'runes', c: 0xff3010, n: 5, lw: 1.6, jag: 14, dots: 20 }], glowC: 0xff3010, glowI: 1.4 },
    ca_van_can: { back: 0x8a5200, side: 0xe0a818, belly: 0xfff0a0, line: 0.55, pat: [{ t: 'scales', c: 0x7a2a00, s: 16, a: 0.85, lw: 2.6, hi: 0xffffc0 }, { t: 'band', c: 0xff4a10, v: 0.44, h: 0.06, a: 0.6 }],
      glow: [{ t: 'scales', c: 0xffc040, s: 16, a: 1, lw: 1.4, v1: 0.6 }, { t: 'runes', c: 0xffe080, n: 3, lw: 2.4, v0: 0.3, v1: 0.5, jag: 6 }], glowC: 0xffaa00, glowI: 1.1,
      fin: { c: 0xd02010, tip: 0xffd040, rainbow: [0x900800, 0xff3010, 0xff9020, 0xffe060] } },
    ca_mai_cheo: { back: 0x8a94a4, side: 0xd0d8e4, belly: 0xf4f8fc, line: 0.55, pat: [{ t: 'spots', c: [0x2a3040, 0x4a5468], n: 60, r: 0.03, sx: 2.5, v0: 0.1, v1: 0.55, a: 0.7 }, { t: 'band', c: 0xffffff, v: 0.45, h: 0.04, a: 0.6 }], fin: { c: 0xe02030, tip: 0xff6060 } },
    ca_mat_trang: { back: 0x4a5560, side: 0x8a96a0, belly: 0xd8dde0, line: 0.6, pat: [{ t: 'mottle', c: [0xd0d6da, 0x3a444e], n: 26, r: 0.12, a: 0.45 }, { t: 'reticulate', c: 0x2a3038, n: 30, lw: 1, a: 0.3 }], fin: { c: 0x5a6670, tip: 0x8a96a0 } },
    ca_nham_phoi_nang: { back: 0x3a3a38, side: 0x6a6862, belly: 0xd8d2c8, line: 0.55, pat: [{ t: 'mottle', c: [0x2a2a28, 0x8a8880], n: 30, r: 0.08, a: 0.4 }, { t: 'bars', c: 0x1a1a18, n: 5, u0: 0.7, u1: 0.82, w: 0.25, a: 0.6, v1: 0.75 }], fin: { c: 0x3a3a38, tip: 0x5a5852 } },
    ca_cau_vuc_tham: { back: 0x0e0a0c, side: 0x2a1e22, belly: 0x4a383c, pat: [{ t: 'mottle', c: [0x050304, 0x3a2a2e], n: 30, r: 0.1, a: 0.6 }], glow: [{ t: 'runes', c: 0x60ffd8, n: 3, lw: 1, jag: 4, v0: 0.3, v1: 0.6, dots: 70 }], glowC: 0x60ffd8, glowI: 1.6, fin: { c: 0x1a1214, tip: 0x3a2a2e } },
    megalodon: { back: 0x1a222c, side: 0x3a4654, belly: 0xe0ded6, line: 0.55, soft: 0.03, pat: [{ t: 'reticulate', c: 0xc8c8c0, n: 22, lw: 1.6, a: 0.55, v1: 0.55 }, { t: 'shade', c: 0x05080c, head: 0.25, tail: 0.15 }], fin: { c: 0x1e2832, tip: 0x0a0e12 } },
    hai_long_vuc_tham: { back: 0x04304a, side: 0x0e6a8a, belly: 0xa8f4f0, line: 0.6, pat: [{ t: 'scales', c: 0x021a2a, s: 10, a: 0.85, lw: 1.8, hi: 0x9fffff }], glow: [{ t: 'scales', c: 0x40e0ff, s: 10, a: 0.9, lw: 1, v1: 0.55 }, { t: 'runes', c: 0xb0ffff, n: 2, v0: 0.45, v1: 0.5, lw: 1.6, jag: 3, dots: 30 }], glowC: 0x30e0ff, glowI: 1.2, fin: { c: 0x10a8b0, tip: 0x80fff0 } },
    ca_duoi: { back: 0x4a3a2a, side: 0x6a5440, belly: 0xf2ebe2, line: 0.42, soft: 0.04, lateral: false, pat: [{ t: 'spots', c: [0xd8c8a8, 0x2a2018], n: 120, r: 0.018, v1: 0.4, u1: 1 }, { t: 'mottle', c: 0x2a2018, n: 20, r: 0.07, v1: 0.4, a: 0.35 }], fin: { c: 0x5a4a3a, tip: 0x3a2e24, spots: [0xd8c8a8, 0x2a2018] } },
    muc_khong_lo: { back: 0x6a0e0a, side: 0xc03228, belly: 0xf2b4a4, line: 0.6, lateral: false, pat: [{ t: 'spots', c: [0x4a0806, 0x8a1a12, 0xe06a50], n: 160, r: 0.02, v1: 0.75 }, { t: 'mottle', c: 0x3a0604, n: 16, r: 0.08, a: 0.4 }], glowC: 0x300000, glowI: 0.4 },
    ca_ba_mat: { back: 0x2a4a14, side: 0x6a8a3a, belly: 0xd0e0a0, pat: [{ t: 'mottle', c: [0x9a3aa0, 0x1a2a0a], n: 14, r: 0.08, a: 0.55 }, { t: 'scales', c: 0x1a2a0a, s: 11, a: 0.4 }], glow: [{ t: 'runes', c: 0x60ff40, n: 7, lw: 1.5, jag: 16, dots: 14 }], glowC: 0x55ff55, glowI: 1.2, fin: { c: 0x4a6a2a, tip: 0x90ff60 } },
    ca_phat_sang: { back: 0x04122a, side: 0x0a2a50, belly: 0x5a8aa8, pat: [], glow: [{ t: 'runes', c: 0x40ffff, n: 2, lw: 1.2, v0: 0.4, v1: 0.6, jag: 2, dots: 60 }], glowC: 0x00ffee, glowI: 2.2, fin: { c: 0x0a3a6a, tip: 0x40ffee } },
    ca_thep: { back: 0x5a626c, side: 0x9aa2ac, belly: 0xc8d0d8, pat: [{ t: 'plates', c: 0x2a3038, hi: 0xe8eef4 }], fin: { c: 0x60686e, tip: 0x9aa2ac } },
    ca_hai_dau: { back: 0x5a2a5a, side: 0xb87ab0, belly: 0xf0d8e8, pat: [{ t: 'patches', c: [0xffffff, 0x2a0a2a, 0xff8a30], n: 6 }], fin: { c: 0x8a4a7a, tip: 0xe0a0d0 } },
    ca_rang_nguoi: { back: 0x3a4250, side: 0x8a94a4, belly: 0xe04030, line: 0.58, pat: [{ t: 'spots', c: 0xd8e0f0, n: 70, r: 0.012, a: 0.7, v1: 0.55 }], fin: { c: 0x2a3038, tip: 0xc03020 } },
    ca_di_giay: { back: 0x3a4a14, side: 0x7a8a3a, belly: 0xe8e8b0, pat: [{ t: 'patches', c: [0x2a3a0a, 0xb0a040, 0x5a3a14], n: 7, a: 0.8 }], fin: { c: 0x5a6a20, tip: 0xa0b050 } },
    ca_map_3_chan: { back: 0x0e3f8a, side: 0x2a78d8, belly: 0xf4f8ff, line: 0.55, soft: 0.03, pat: [{ t: 'shade', c: 0x061a40, head: 0.2 }], fin: { c: 0x1a5fc0, tip: 0x0a2a60 } },
    ca_rong: { back: 0x9a5a00, side: 0xe0b020, belly: 0xfff4b0, line: 0.6, pat: [{ t: 'scales', c: 0x8a1a00, s: 9, a: 0.85, lw: 1.8, hi: 0xfff0a0 }], glow: [{ t: 'runes', c: 0xffd060, n: 2, v0: 0.45, v1: 0.5, lw: 1.5, jag: 3 }], glowC: 0xff9900, glowI: 0.8, fin: { c: 0xd62020, tip: 0xffb020 } },
    ca_sau_bay: { back: 0x22321a, side: 0x4e6a34, belly: 0xd8cf8a, line: 0.6, pat: [{ t: 'bars', c: 0x101808, n: 10, a: 0.5, w: 0.45, v1: 0.55 }, { t: 'scales', c: 0x0c1206, s: 9, a: 0.55 }] },
    ca_ga: { back: 0x8a3a10, side: 0xc8682a, belly: 0xf2e6d0, pat: [{ t: 'feathers', c: 0xa04a14, c2: 0xe8a040, edge: 0x3a1004 }], fin: { c: 0x1a4a2a, tip: 0x40c070 } },
  };
  function skinSpec(key, m) {
    const s = SKIN[key];
    if (!s) return null;
    return Object.assign({ back: darker(m.c, 0.6), side: m.c, belly: m.b, line: 0.5, soft: 0.1, pat: [] }, s);
  }
  function paintBase(g, s) {
    const gr = g.createLinearGradient(0, 0, 0, SH), L = s.line, so = s.soft;
    // nhìn ngang thấy v≈0..1 → lưng chỉ ở mép trên, màu hông phủ phần lớn, bụng sáng ở dưới ranh L
    gr.addColorStop(0, css(s.back)); gr.addColorStop(Math.min(0.3, L * 0.55), css(s.side));
    gr.addColorStop(L, css(s.side)); gr.addColorStop(Math.min(0.99, L + so * 2), css(s.belly)); gr.addColorStop(1, css(s.belly));
    g.fillStyle = gr; g.fillRect(0, 0, SW, SH);
  }
  function canvasTexture(c) { const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t; }
  function skinTextures(key, m) {
    return cache('skintex:' + key, () => {
      const s = skinSpec(key, m); if (!s) return null;
      const r = prng(key);
      const c = document.createElement('canvas'); c.width = SW; c.height = SH;
      const g = c.getContext('2d');
      paintBase(g, s);
      s.pat.forEach((p) => PAT[p.t] && PAT[p.t](g, p, r));
      // đường bên (lateral line) cho cá có vảy thường
      if (s.lateral !== false) { g.strokeStyle = css(0xffffff, 0.18); g.lineWidth = 1; g.beginPath(); g.moveTo(SW * 0.08, SH * (s.line - 0.06)); g.quadraticCurveTo(SW * 0.6, SH * (s.line - 0.14), SW * 0.9, SH * (s.line - 0.2)); g.stroke(); }
      const out = { map: canvasTexture(c), emap: null, spec: s };
      if (s.glow) {
        const e = document.createElement('canvas'); e.width = SW; e.height = SH;
        const eg = e.getContext('2d'); eg.fillStyle = '#000'; eg.fillRect(0, 0, SW, SH);
        s.glow.forEach((p) => PAT[p.t] && PAT[p.t](eg, p, r));
        out.emap = canvasTexture(e);
      }
      return out;
    });
  }
  // Vây: gradient gốc → mép + tia vây; kind 'tail' (gốc bên phải, tia tỏa trái), 'up' (gốc dưới), 'down' (gốc trên)
  function finTexture(key, f, kind) {
    return cache('fintex:' + key + ':' + kind, () => {
      const W = 128, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'), r = prng(key + kind);
      const gr = kind === 'tail' ? g.createLinearGradient(W, 0, 0, 0) : kind === 'up' ? g.createLinearGradient(0, H, 0, 0) : g.createLinearGradient(0, 0, 0, H);
      if (f.rainbow) f.rainbow.forEach((col, i) => gr.addColorStop(i / (f.rainbow.length - 1), css(col)));
      else { gr.addColorStop(0, css(f.c)); gr.addColorStop(0.65, css(f.c)); gr.addColorStop(1, css(f.tip != null ? f.tip : f.c)); }
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.strokeStyle = css(0x000000, 0.22); g.lineWidth = 1.4;
      for (let i = 0; i <= 14; i++) {
        g.beginPath();
        if (kind === 'tail') { g.moveTo(W, H / 2); g.lineTo(0, H * i / 14); } else { const x = W * i / 14; g.moveTo(x, kind === 'up' ? H : 0); g.lineTo(x - W * 0.12, kind === 'up' ? 0 : H); }
        g.stroke();
      }
      if (f.spots) for (let i = 0; i < 26; i++) { g.fillStyle = css(f.spots[i % f.spots.length], 0.8); g.beginPath(); g.arc(W * (0.05 + 0.75 * r()), H * (0.1 + 0.8 * r()), 2 + r() * 3, 0, 6.283); g.fill(); }
      return canvasTexture(c);
    });
  }
  function skinMaterials(key, m) {
    return cache('skinmat:' + key, () => {
      const tx = skinTextures(key, m); if (!tx) return null;
      const s = tx.spec, glowC = s.glowC != null ? s.glowC : m.glow;
      const body = new THREE.MeshStandardMaterial({ map: tx.map, roughness: m.rough != null ? Math.min(0.6, m.rough) : 0.42, metalness: Math.min(0.25, m.metal != null ? m.metal : 0.1) });
      if (glowC != null) { body.emissive = new THREE.Color(glowC); body.emissiveIntensity = s.glowI != null ? s.glowI : (m.ei || 0.3); if (tx.emap) body.emissiveMap = tx.emap; }
      const f = s.fin || { c: m.finC != null ? m.finC : darker(s.side, 0.8), tip: s.side };
      const fin = (kind) => new THREE.MeshStandardMaterial({ map: finTexture(key, f, kind), side: THREE.DoubleSide, roughness: 0.55, emissive: glowC != null ? new THREE.Color(glowC) : new THREE.Color(0), emissiveIntensity: glowC != null ? 0.25 : 0 });
      return { body, tail: fin('tail'), up: fin('up'), down: fin('down') };
    });
  }
  // UV cho thân Lathe khớp canvas da: u = đuôi→đầu, v = lưng (1) → bụng (0), đối xứng 2 bên (không có đường nối)
  function skinUV(g, m, zref) {
    const pos = g.attributes.position, n = pos.count, uv = new Float32Array(n * 2), w = m.w || 0.6;
    const z0 = m.z0 != null ? m.z0 : -0.3, z1 = m.z1 != null ? m.z1 : 0.5;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i) / w, y = pos.getY(i), d = Math.hypot(x, y) || 1;
      uv[i * 2] = clamp((pos.getZ(i) + zref - z0) / (z1 - z0), 0, 1);
      uv[i * 2 + 1] = 1 - Math.acos(clamp(y / d, -1, 1)) / Math.PI;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  // UV của vây (ShapeGeometry để uv = tọa độ hình) → chuẩn hóa về 0..1 để texture vây phủ đúng
  function normUV(g) {
    const uv = g.attributes.uv; if (!uv) return g;
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (let i = 0; i < uv.count; i++) { a = Math.min(a, uv.getX(i)); b = Math.min(b, uv.getY(i)); c = Math.max(c, uv.getX(i)); d = Math.max(d, uv.getY(i)); }
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - a) / ((c - a) || 1), (uv.getY(i) - b) / ((d - b) || 1));
    return g;
  }

  // ---------- Thân cá dạng Lathe ----------
  const zt = (m, t) => (m.z0 != null ? m.z0 : -0.3) + t * ((m.z1 != null ? m.z1 : 0.5) - (m.z0 != null ? m.z0 : -0.3));
  function profile(m) {
    const R = m.r || 0.12, peak = m.peak || 0.55, bl = m.blunt || 0.65, ped = m.ped != null ? m.ped : 0.16;
    const p = Math.log(0.5) / Math.log(peak);
    return function (t) {
      t = clamp(t, 0, 1);
      const s = Math.sin(Math.PI * Math.pow(t, p));
      let r = R * Math.pow(Math.max(s, 0), bl);
      if (ped > 0) r = Math.max(r, R * ped * (1 - t) * (1 - t));
      return r;
    };
  }
  function colorize(g, m, rf, zref) {
    const pos = g.attributes.position; const n = pos.count;
    const col = new Float32Array(n * 3);
    const back = new THREE.Color(m.c), belly = new THREE.Color(m.b), spot = new THREE.Color(m.spotC != null ? m.spotC : darker(m.c, 0.5));
    const c = new THREE.Color();
    const z0 = m.z0 != null ? m.z0 : -0.3, z1 = m.z1 != null ? m.z1 : 0.5;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), gz = pos.getZ(i) + zref;
      const t = (gz - z0) / (z1 - z0);
      const rr = rf(t) + 1e-4;
      const k = G.util ? G.util.smoothstep(-0.35, 0.45, y / rr) : clamp(y / rr * 0.5 + 0.5, 0, 1);
      c.copy(belly).lerp(back, k);
      if (m.stripes && k > 0.35 && Math.sin(gz * m.stripes * Math.PI * 2) > 0.55) c.multiplyScalar(0.62);
      if (m.spots && k > 0.3) {
        const s = Math.sin(gz * 97 + x * 31) * Math.sin(y * 83 + gz * 41) * Math.sin(x * 57 - y * 23);
        if (s > 0.28) c.copy(spot);
      }
      if (m.scales) { const s = 0.92 + 0.08 * Math.sin(gz * 160 + Math.atan2(y, x) * 14); c.multiplyScalar(s); }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  function latheSeg(m, rf, ta, tb, zref) {
    const pts = [];
    const N = Math.max(4, Math.round((tb - ta) * 30));
    if (ta <= 0.0001) pts.push(new THREE.Vector2(0.0001, zt(m, 0) - zref));
    for (let i = 0; i <= N; i++) {
      const t = ta + (tb - ta) * (i / N);
      pts.push(new THREE.Vector2(Math.max(rf(t), 0.0005), zt(m, t) - zref));
    }
    if (tb >= 0.9999) pts.push(new THREE.Vector2(0.0001, zt(m, 1) - zref + 0.0001));
    const g = new THREE.LatheGeometry(pts, m.radial || 16);
    g.rotateX(Math.PI / 2);
    g.scale(m.w || 0.6, 1, 1);
    colorize(g, m, rf, zref);
    skinUV(g, m, zref);
    return g;
  }
  function shapeGeo(pts, horizontal) {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    const g = normUV(new THREE.ShapeGeometry(sh));
    if (horizontal) g.rotateX(-Math.PI / 2); else g.rotateY(-Math.PI / 2);
    return g;
  }
  function tailPts(type, s) {
    switch (type) {
      case 'round': {
        const p = [[0.03, s * 0.16]];
        for (let i = 0; i <= 10; i++) { const a = (75 - i * 15) * Math.PI / 180; p.push([-s * 0.25 - s * 0.7 * Math.cos(a), s * 0.85 * Math.sin(a)]); }
        p.push([0.03, -s * 0.16]); return p;
      }
      case 'lunate': return [[0.03, s * 0.08], [-s * 0.55, s * 1.25], [-s * 0.75, s * 1.3], [-s * 0.45, 0], [-s * 0.75, -s * 1.3], [-s * 0.55, -s * 1.25], [0.03, -s * 0.08]];
      case 'shark': return [[0.03, s * 0.12], [-s * 0.75, s * 1.35], [-s * 0.95, s * 1.3], [-s * 0.45, s * 0.05], [-s * 0.62, -s * 0.62], [-s * 0.45, -s * 0.62], [0.03, -s * 0.12]];
      case 'eel': return [[0.04, s * 0.3], [-s * 0.6, s * 0.15], [-s * 0.9, 0], [-s * 0.6, -s * 0.15], [0.04, -s * 0.3]];
      case 'flow': return [[0.03, s * 0.2], [-s * 0.7, s * 0.95], [-s * 1.6, s * 0.75], [-s * 1.05, s * 0.12], [-s * 1.7, -s * 0.5], [-s * 0.8, -s * 0.75], [0.03, -s * 0.2]];
      default: return [[0.03, s * 0.12], [-s * 1.0, s * 0.95], [-s * 0.55, 0], [-s * 1.0, -s * 0.95], [0.03, -s * 0.12]];
    }
  }
  function finAlong(m, rf, tb, tf, h, style, bottom) {
    const N = style === 'spiky' ? 14 : 12;
    const top = [], base = [];
    const sweep = style === 'tall' ? 0.6 : style === 'tri' ? 0.35 : 0.15;
    for (let i = 0; i <= N; i++) {
      const u = i / N; const t = tb + (tf - tb) * u; const z = zt(m, t);
      const by = rf(t) * 0.8 * (bottom ? -1 : 1);
      let f;
      if (style === 'tall') f = u < 0.3 ? u / 0.3 : (1 - u) / 0.7;
      else if (style === 'tri') f = u < 0.65 ? u / 0.65 : (1 - u) / 0.35;
      else if (style === 'sail') f = Math.min(1, (1 - u) * 6, u * 1.5 + 0.25);
      else if (style === 'spiky') f = (i % 2 === 0 ? 1 : 0.55) * Math.min(1, (1 - u) * 4 + 0.25, u * 3 + 0.3);
      else f = Math.min(1, u * 6, (1 - u) * 10) * 0.9;
      top.push([z - sweep * f * h, by + (bottom ? -1 : 1) * h * f]);
      base.push([z, by]);
    }
    const pts = top.concat(base.reverse());
    return shapeGeo(pts);
  }

  // Bộ geometry dùng chung cho 1 loài
  function fishKit(key, m) {
    return cache('kit:' + key, () => {
      const rf = profile(m);
      const segs = m.segs || 2;
      const fs = segs === 1 ? 0 : segs === 2 ? 0.45 : 1 - 1.4 / segs;
      const bounds = [[fs, 1]];
      for (let k = 1; k < segs; k++) bounds.push([fs * (segs - 1 - k) / (segs - 1), fs * (segs - k) / (segs - 1)]);
      const segGeos = bounds.map(([a, b], k) => {
        const zref = k === 0 ? 0 : zt(m, b);
        return { g: latheSeg(m, rf, a, k === 0 ? b : Math.min(1, b + 0.025), zref), zref, ta: a, tb: b };
      });
      const R = m.r || 0.12;
      const kit = { rf, segGeos, fs, R };
      if (m.tail && m.tail !== 'none' && m.tail !== 'feather') kit.tailG = shapeGeo(tailPts(m.tail, m.tailS || Math.max(0.13, R * 1.3)));
      if (m.dorsal && m.dorsal !== 'none') {
        const dR = m.dR || [0.5, 0.8];
        kit.dorsalG = finAlong(m, rf, Math.max(dR[0], fs), dR[1], m.dH || R * 0.75, m.dorsal, false);
      }
      if (m.anal !== false) kit.analG = m.aR ? finAlong(m, rf, m.aR[0], m.aR[1], m.aH || R * 0.45, m.aStyle || 'tri', true) // vây bụng riêng (cá mặt trăng)
        : finAlong(m, rf, Math.max(fs + 0.01, 0.47), Math.max(fs + 0.12, 0.6), R * 0.45, 'tri', true);
      const ps = m.pS || R * 0.9;
      kit.pectG = shapeGeo([[0.01, 0.02], [-ps * 0.5, ps * 0.22], [-ps, ps * 0.06], [-ps * 0.65, -ps * 0.14], [0.01, -0.03]]);
      return kit;
    });
  }

  // Lắp cá cơ bản → ctx {joints, tail, root, kit}
  function assembleFish(inner, key, m, ctx, lite) {
    const kit = fishKit(key, m);
    const rf = kit.rf, R = kit.R, w = m.w || 0.6;
    const bodyMat = M(0xffffff, { vc: 1, metal: m.metal != null ? m.metal : 0.15, rough: m.rough != null ? m.rough : 0.45, em: m.glow, ei: m.glow ? m.ei : undefined });
    const finMat = M(m.finC != null ? m.finC : darker(m.c, 0.8), { ds: 1, rough: 0.6, em: m.glow, ei: m.glow ? (m.ei || 0.3) * 0.8 : undefined });
    const sk = skinMaterials(key, m); // loài có da vẽ riêng → dùng thay vertex color
    const bodyM = sk ? sk.body : bodyMat, tailM = sk ? sk.tail : finMat, upM = sk ? sk.up : finMat, downM = sk ? sk.down : finMat;
    ctx.bodyMat = bodyM; ctx.finMat = finMat; ctx.skin = sk;
    let parent = inner, prevZ = 0;
    kit.segGeos.forEach((sg, k) => {
      const j = new THREE.Group();
      j.position.z = k === 0 ? 0 : sg.zref - prevZ;
      j.add(new THREE.Mesh(sg.g, bodyM));
      j.userData.seg = sg;
      parent.add(j); parent = j; prevZ = sg.zref; ctx.joints.push(j);
    });
    const root = ctx.joints[0], last = ctx.joints[ctx.joints.length - 1];
    ctx.root = root; ctx.kit = kit; ctx.last = last; ctx.lastZ = prevZ;
    if (kit.tailG || m.tail === 'feather') {
      const tp = new THREE.Group(); tp.position.z = zt(m, 0) - prevZ;
      if (kit.tailG) tp.add(new THREE.Mesh(kit.tailG, tailM));
      last.add(tp); ctx.tail = tp;
    }
    if (kit.dorsalG) root.add(new THREE.Mesh(kit.dorsalG, upM));
    if (lite) return ctx;
    if (kit.analG) root.add(new THREE.Mesh(kit.analG, downM));
    // vây ngực
    const tp = 0.74, zp = zt(m, tp), rp = rf(tp);
    [-1, 1].forEach((s) => {
      const f = new THREE.Mesh(kit.pectG, tailM);
      f.position.set(s * rp * w * 0.9, -rp * 0.4, zp);
      f.rotation.z = s * 1.15;
      root.add(f);
      ctx.pects = ctx.pects || []; ctx.pects.push(f);
    });
    // mắt
    const te = 0.88, ze = zt(m, te), re = rf(te);
    const es = m.eyeS || Math.max(0.02, R * 0.2);
    const eyeMat = M(m.eyeBlack ? 0x111111 : 0xf4f4f0, { rough: 0.2 });
    const pupMat = M(m.eyeC != null ? m.eyeC : 0x080808, { rough: 0.1, metal: 0.2, em: m.eyeC != null ? m.eyeC : undefined, ei: m.eyeC != null ? 0.6 : undefined });
    const addEyes = (par, z, r) => {
      [-1, 1].forEach((s) => {
        const x = s * (r * w * 0.82 + es * 0.15);
        mesh(par, gSph(), eyeMat, x, r * 0.28, z, es);
        if (!m.eyeBlack) mesh(par, gSph(), pupMat, x + s * es * 0.5, r * 0.28, z + es * 0.1, es * 0.6);
      });
    };
    addEyes(root, ze, re);
    if (m.twohead) {
      const z2 = zt(m, 1 - te) - prevZ;
      addEyes(last, z2, rf(1 - te));
    }
    if (m.eyes === 3) {
      const t3 = 0.78, r3 = rf(t3);
      mesh(root, gSph(), eyeMat, 0, r3 * 0.92, zt(m, t3), es * 1.25);
      mesh(root, gSph(), M(0xff2020, { em: 0xff0000, ei: 0.8 }), 0, r3 * 0.92 + es * 0.7, zt(m, t3) + es * 0.2, es * 0.7);
    }
    // râu
    if (m.whisk) {
      const wg = cache('whisk:' + key, () => {
        const L = m.whisk, r0 = rf(0.97);
        const curve = new THREE.CatmullRomCurve3([V3(r0 * w * 0.6, -r0 * 0.3, zt(m, 0.98)), V3(r0 * w + L * 0.35, -r0 * 0.5 - L * 0.1, zt(m, 0.98) - L * 0.2), V3(r0 * w + L * 0.6, -r0 - L * 0.35, zt(m, 0.98) - L * 0.6)]);
        return new THREE.TubeGeometry(curve, 10, Math.max(0.004, R * 0.03), 4, false);
      });
      const wm = M(darker(m.c, 0.6), { rough: 0.7 });
      [-1, 1].forEach((s) => { const mm = new THREE.Mesh(wg, wm); mm.scale.x = s; root.add(mm); ctx.whisk = ctx.whisk || []; ctx.whisk.push(mm); });
    }
    if (m.bill) {
      const bm = mesh(root, gCone(), M(darker(m.c, 0.8), { rough: 0.4, metal: 0.3 }), 0, rf(0.98) * 0.1, zt(m, 1) + m.bill / 2 - 0.02, R * 0.18, m.bill, R * 0.18);
      bm.rotation.x = Math.PI / 2;
    }
    if (m.teeth) {
      const tm = M(0xffffff, { rough: 0.3 });
      const zf = zt(m, 0.985), rr = rf(0.95);
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * rr * w * 0.28;
        mesh(root, gBox(), tm, x, rr * 0.14, zf, rr * w * 0.24, rr * 0.22, 0.012);
        mesh(root, gBox(), tm, x, -rr * 0.14, zf, rr * w * 0.24, rr * 0.22, 0.012);
      }
      mesh(root, gBox(), M(0x400010), 0, 0, zf - 0.004, rr * w * 1.4, rr * 0.06, 0.012);
    }
    if (m.rivets) {
      const rm = M(0x5a6068, { metal: 1, rough: 0.3 });
      for (let i = 0; i < 6; i++) {
        const t = 0.5 + i * 0.07, r = rf(t), z = zt(m, t);
        [-1, 1].forEach((s) => mesh(root, gSphLo(), rm, s * r * w * 0.95, r * 0.35, z, R * 0.07));
        mesh(root, gSphLo(), rm, 0, r * 0.98, z, R * 0.07);
      }
      // đường hàn
      mesh(root, gBox(), rm, 0, 0, zt(m, 0.62), R * w * 2.05, R * 2.02, 0.006);
    }
    if (m.scutes) {
      const sm = M(darker(m.c, 0.75), { rough: 0.5, flat: 1 });
      for (let i = 0; i < 6; i++) {
        const t = 0.5 + i * 0.08, r = rf(t), z = zt(m, t);
        mesh(root, gCone(), sm, 0, r * 0.98, z, R * 0.12, R * 0.3, R * 0.12);
        [-1, 1].forEach((s) => { const c = mesh(root, gCone(), sm, s * r * w * 0.95, r * 0.1, z, R * 0.1, R * 0.22, R * 0.1); c.rotation.z = -s * Math.PI / 2; });
      }
    }
    if (m.crown) {
      const gm = M(0xffd700, { metal: 0.9, rough: 0.2, em: 0xaa7700, ei: 0.4 });
      const t = 0.8, r = rf(t), z = zt(m, t);
      mesh(root, gCyl(), gm, 0, r + 0.025, z, R * 0.45, 0.04, R * 0.45);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        mesh(root, gCone(), gm, Math.cos(a) * R * 0.4, r + 0.065, z + Math.sin(a) * R * 0.4, R * 0.1, 0.05, R * 0.1);
      }
      mesh(root, gSphLo(), M(0xff1030, { em: 0xff0020, ei: 0.8 }), 0, r + 0.03, z + R * 0.46, R * 0.08);
    }
    if (m.fangs) { // răng nanh nhọn chĩa ra ở hai hàm (cá vực thẳm)
      const fm = M(0xf0f4ec, { rough: 0.3 }), zf = zt(m, 0.98), rr = rf(0.95);
      for (let i = 0; i < 7; i++) {
        const x = (i - 3) * rr * w * 0.26, up = i % 2 === 0;
        const c = mesh(root, gCone(), fm, x, up ? rr * 0.25 : -rr * 0.25, zf, R * 0.035, R * (up ? 0.3 : 0.22), R * 0.035);
        c.rotation.x = up ? Math.PI + 0.35 : -0.35;
      }
    }
    if (m.lure != null) { // cần câu phát sáng trên đầu (cá cần câu vực thẳm)
      const t0 = 0.86, r0 = rf(t0), base = V3(0, r0 * 0.9, zt(m, t0)), top = V3(0, r0 * 2.1, zt(m, t0) + R * 0.4), tip = V3(0, r0 * 1.7, zt(m, 1) + R * 0.5);
      const stM = M(darker(m.c, 0.8), { rough: 0.6 });
      stick(root, base, top, R * 0.035, stM); stick(root, top, tip, R * 0.03, stM);
      mesh(root, gSph(), M(m.lure, { em: m.lure, ei: 2.2, rough: 0.2 }), tip.x, tip.y, tip.z, R * 0.13);
      if (!lite) { const hs = haloSprite(m.lure, R * 2.2); hs.position.copy(tip); root.add(hs); }
    }
    if (m.spikes != null) { // hàng gai xương sống: nhìn là biết boss
      const spM = M(m.spikes, { rough: 0.35, metal: 0.3, em: m.spikes, ei: 0.25 });
      for (let i = 0; i < 9; i++) {
        const t = 0.42 + i * 0.055, r = rf(t), h = R * (0.9 - Math.abs(i - 3) * 0.12);
        const c = mesh(root, gCone(), spM, 0, r * 0.95 + h * 0.45, zt(m, t), R * 0.11, h, R * 0.2); c.rotation.x = -0.45;
      }
    }
    if (m.horns != null) { // sừng rồng cong về sau
      const hm = M(m.horns, { rough: 0.3, metal: 0.4 });
      const t = 0.9, r = rf(t), z = zt(m, t);
      [-1, 1].forEach((sd) => {
        const a = mesh(root, gCone(), hm, sd * r * w * 0.55, r * 0.95, z, R * 0.12, R * 0.9, R * 0.12); a.rotation.set(-1.0, 0, -sd * 0.35);
        const b = mesh(root, gCone(), hm, sd * r * w * 0.75, r * 1.45, z - R * 0.55, R * 0.07, R * 0.6, R * 0.07); b.rotation.set(-1.9, 0, -sd * 0.5);
      });
    }
    if (m.halo) {
      const h = haloSprite(m.halo, 1.6); root.add(h); ctx.halo = h;
    }
    return ctx;
  }

  // ---------- Các kiểu model ----------
  function legs(parent, ctx, list, skin, shoeC, lenL, stripes) {
    // list: [{x,y,z,phase}]
    const sk = M(skin, { rough: 0.7 });
    list.forEach((L) => {
      const p = new THREE.Group(); p.position.set(L.x, L.y, L.z);
      stick(p, V3(0, 0, 0), V3(0, -lenL * 0.5, 0.01), lenL * 0.12, sk);
      const knee = new THREE.Group(); knee.position.set(0, -lenL * 0.5, 0.01); p.add(knee);
      stick(knee, V3(0, 0, 0), V3(0, -lenL * 0.5, -0.01), lenL * 0.1, sk);
      const shoe = sneaker(shoeC, stripes); shoe.scale.setScalar(lenL * 0.55); shoe.position.set(0, -lenL * 0.52, lenL * 0.08); knee.add(shoe);
      parent.add(p);
      ctx.legs.push({ p, knee, phase: L.phase || 0 });
    });
  }
  function sneaker(color, stripes) {
    const g = new THREE.Group();
    const white = M(0xf8f8f8, { rough: 0.6 }), up = M(color != null ? color : 0xe02030, { rough: 0.55 });
    mesh(g, gBox(), white, 0, 0.06, 0, 0.4, 0.12, 1.0);
    mesh(g, gBox(), up, 0, 0.27, -0.12, 0.36, 0.32, 0.68);
    mesh(g, gBox(), up, 0, 0.19, 0.3, 0.36, 0.18, 0.36);
    mesh(g, gBox(), white, 0, 0.16, 0.46, 0.37, 0.14, 0.1);
    mesh(g, gBox(), M(0x222222), 0, 0.44, -0.3, 0.3, 0.04, 0.3);
    for (let i = 0; i < 3; i++) mesh(g, gBox(), white, 0, 0.36 - i * 0.04, 0.0 + i * 0.1, 0.3, 0.03, 0.04);
    if (stripes) { // 3 sọc chéo đen mỗi bên hông giày
      const blk = M(0x111111, { rough: 0.6 });
      [-1, 1].forEach((s) => { for (let k = 0; k < 3; k++) { const st = mesh(g, gBox(), blk, s * 0.185, 0.25, -0.2 + k * 0.11, 0.012, 0.3, 0.045); st.rotation.x = -0.55; } });
    } else [-1, 1].forEach((s) => { const st = mesh(g, gBox(), white, s * 0.185, 0.25, -0.1, 0.01, 0.05, 0.5); st.rotation.x = 0.35; });
    return g;
  }

  const BUILD = {};
  BUILD.fish = function (inner, sp, m, ctx, lite) { assembleFish(inner, sp.id, m, ctx, lite); };
  BUILD.legend = BUILD.fish;

  BUILD.shark = function (inner, sp, m, ctx, lite) {
    assembleFish(inner, sp.id, m, ctx, lite);
    if (lite) return;
    const rf = ctx.kit.rf, w = m.w || 0.8, root = ctx.root;
    const dk = M(0x202830, { rough: 0.8 });
    for (let i = 0; i < 5; i++) {
      const t = 0.72 + i * 0.022, r = rf(t), z = zt(m, t);
      [-1, 1].forEach((s) => { const gl = mesh(root, gBox(), dk, s * r * w * 0.97, 0, z, 0.003, r * 0.7, 0.006); gl.rotation.z = s * 0.15; });
    }
    const rm = rf(0.9), zm = zt(m, 0.9);
    const mw = m.wideMouth ? 1.3 : 0.8;
    mesh(root, gBox(), M(0x300a10), 0, -rm * 0.55, zm, rm * w * mw * 1.4, 0.008, 0.035);
    if (m.teeth) {
      const tm = M(0xffffff, { rough: 0.3 });
      for (let i = -3; i <= 3; i++) { const c = mesh(root, gCone(), tm, i * rm * w * mw * 0.18, -rm * 0.5, zm + 0.012, 0.006, 0.02, 0.006); c.rotation.x = Math.PI; }
    }
    // vây lưng thứ 2 nhỏ (trên đoạn sau)
    if (sp.id !== 'ca_tam') {
      const sm = mesh(ctx.last, gCone(), ctx.finMat, 0, rf(0.2) * 0.9 + 0.02, zt(m, 0.2) - ctx.lastZ, 0.006, 0.05, 0.02);
      sm.rotation.x = -0.4;
    }
  };
  BUILD.shark3 = function (inner, sp, m, ctx, lite) {
    BUILD.shark(inner, sp, m, ctx, lite);
    const rf = ctx.kit.rf;
    const L = 0.2;
    // 3 chân người, cả 3 đi giày thể thao trắng 3 sọc đen (meme cá mập xanh đi giày)
    legs(ctx.root, ctx, [
      { x: -0.055, y: -rf(0.55) * 0.75, z: zt(m, 0.55), phase: 0 },
      { x: 0.055, y: -rf(0.55) * 0.75, z: zt(m, 0.55), phase: Math.PI * 2 / 3 },
    ], 0xe2b48c, 0xffffff, L, true);
    legs(ctx.last, ctx, [{ x: 0, y: -rf(0.3) * 0.75, z: zt(m, 0.3) - ctx.lastZ, phase: Math.PI * 4 / 3 }], 0xe2b48c, 0xffffff, L * 0.95, true);
  };
  BUILD.shoe = function (inner, sp, m, ctx, lite) {
    assembleFish(inner, sp.id, m, ctx, lite);
    const rf = ctx.kit.rf, t = 0.6, r = rf(t);
    legs(ctx.root, ctx, [
      { x: -0.045, y: -r * 0.8, z: zt(m, t), phase: 0 },
      { x: 0.045, y: -r * 0.8, z: zt(m, t), phase: Math.PI },
    ], 0xd9b38c, m.shoeC, 0.2);
  };
  BUILD.chicken = function (inner, sp, m, ctx, lite) {
    assembleFish(inner, sp.id, m, ctx, lite);
    const rf = ctx.kit.rf, root = ctx.root;
    const white = M(0xf5f0e6, { rough: 0.8 }), red = M(0xe01818, { rough: 0.6 }), yel = M(0xf2b01e, { rough: 0.5 });
    const hz = zt(m, 0.96) + 0.02, hy = rf(0.85) * 0.5;
    mesh(root, gSph(), white, 0, hy, hz, 0.09, 0.1, 0.1);
    for (let i = 0; i < 3; i++) mesh(root, gSph(), red, 0, hy + 0.09 + (i === 1 ? 0.015 : 0), hz - 0.03 + i * 0.035, 0.012, 0.03, 0.022);
    const bk = mesh(root, gCone(), yel, 0, hy - 0.005, hz + 0.115, 0.025, 0.06, 0.02); bk.rotation.x = Math.PI / 2;
    mesh(root, gSph(), red, 0, hy - 0.06, hz + 0.06, 0.018, 0.035, 0.015);
    [-1, 1].forEach((s) => {
      mesh(root, gSph(), M(0x111111), s * 0.07, hy + 0.025, hz + 0.05, 0.016);
      if (lite) return;
      const wp = new THREE.Group(); wp.position.set(s * rf(0.6) * (m.w || 0.55), rf(0.6) * 0.2, zt(m, 0.62)); root.add(wp);
      const wm = mesh(wp, gSph(), M(0x8a3a10, { rough: 0.9 }), s * 0.02, 0, -0.04, 0.03, 0.08, 0.13);
      wm.rotation.x = 0.3;
      ctx.wings.push({ p: wp, s, amp: 0.5 });
    });
    if (ctx.tail) { // đuôi gà: lông xòe hình quạt từ CÙNG một gốc gắn vào mông (trước đây lơ lửng → như đứt đuôi)
      const cols = [0x111111, 0x1b5e20, 0x8a3a10, 0x111111, 0x1b5e20, 0x8a3a10];
      cols.forEach((c, i) => {
        const fp = new THREE.Group(); fp.rotation.x = -0.25 - i * 0.24; ctx.tail.add(fp);
        mesh(fp, gSph(), M(c, { rough: 0.5, metal: 0.2 }), 0, 0, -0.1, 0.014, 0.035, 0.12);
      });
    }
    ctx.chicken = true;
  };
  BUILD.dragon = function (inner, sp, m, ctx, lite) {
    assembleFish(inner, sp.id, m, ctx, lite);
    const rf = ctx.kit.rf, root = ctx.root, w = m.w || 0.9;
    const red = M(m.finC != null ? m.finC : 0xd62020, { rough: 0.5, em: darker(m.finC != null ? m.finC : 0xd62020, 0.3), ei: 0.5, ds: 1 });
    // bờm đỏ trên từng đốt
    ctx.joints.forEach((j) => {
      const sg = j.userData.seg;
      for (let i = 0; i < 3; i++) {
        const t = sg.ta + (sg.tb - sg.ta) * (i + 0.5) / 3;
        const c = mesh(j, gCone(), red, 0, rf(t) * 0.95 + 0.012, zt(m, t) - sg.zref, 0.012, 0.045, 0.02);
        c.rotation.x = -0.6;
      }
    });
    if (lite) return;
    const ivory = M(0xf4e8c8, { rough: 0.4 });
    const hz = zt(m, 0.9), hr = rf(0.9);
    [-1, 1].forEach((s) => {
      const a = V3(s * hr * 0.5, hr * 0.8, hz), b = V3(s * hr * 1.6, hr * 2.2, hz - 0.08);
      stick(root, a, b, 0.006, ivory);
      stick(root, a.clone().lerp(b, 0.5), V3(s * hr * 2.2, hr * 1.9, hz - 0.03), 0.004, ivory);
      // râu rồng dài
      const curve = new THREE.CatmullRomCurve3([V3(s * hr * 0.4, -hr * 0.2, zt(m, 0.99)), V3(s * 0.12, 0.0, zt(m, 0.99) + 0.05), V3(s * 0.22, -0.05, zt(m, 0.92)), V3(s * 0.3, -0.02, zt(m, 0.8))]);
      const tg = cache('dragonwhisk' + sp.id + s, () => new THREE.TubeGeometry(curve, 16, 0.004, 4, false));
      const wm = new THREE.Mesh(tg, M(0xffd060, { em: 0xaa6600, ei: 0.5 }));
      root.add(wm); ctx.whisk = ctx.whisk || []; ctx.whisk.push(wm);
    });
    for (let i = 0; i < 4; i++) {
      const c = mesh(root, gCone(), red, (i - 1.5) * 0.012, -hr * 0.9, hz + 0.02 - i * 0.008, 0.008, 0.05, 0.008);
      c.rotation.x = Math.PI - 0.4;
    }
  };
  function crocBody(inner, sp, m, ctx, lite, mm) {
    const bm = Object.assign({ r: 0.07, peak: 0.66, blunt: 0.45, ped: 0.12, w: 1.45, segs: 5, z0: -0.5, z1: 0.25, tail: 'none', dorsal: 'none', anal: false }, mm);
    assembleFish(inner, sp.id, bm, ctx, true);
    const rf = ctx.kit.rf, root = ctx.root;
    const skin = M(m.c, { rough: 0.8 }), dark = M(darker(m.c, 0.6), { rough: 0.9, flat: 1 });
    const belly = M(m.b, { rough: 0.8 });
    // scutes trên lưng
    ctx.joints.forEach((j) => {
      const sg = j.userData.seg;
      const n = j === root ? 5 : 2;
      for (let i = 0; i < n; i++) {
        const t = sg.ta + (sg.tb - sg.ta) * (i + 0.5) / n; const r = rf(t); const z = zt(bm, t) - sg.zref;
        mesh(j, gCone(), dark, 0, r * 0.95, z, r * 0.15, r * 0.35, r * 0.15);
        if (j === root || r > 0.03) [-1, 1].forEach((s) => mesh(j, gCone(), dark, s * r * 0.45, r * 0.85, z, r * 0.11, r * 0.25, r * 0.11));
      }
    });
    // đầu
    const head = new THREE.Group(); head.position.z = 0.22; root.add(head);
    mesh(head, gBox(), skin, 0, 0.005, 0.06, 0.12, 0.07, 0.12);
    mesh(head, gBox(), skin, 0, -0.005, 0.2, 0.08, 0.04, 0.18);
    mesh(head, gBox(), skin, 0, -0.002, 0.28, 0.09, 0.042, 0.04);
    const jaw = new THREE.Group(); jaw.position.set(0, -0.025, 0.03); head.add(jaw);
    mesh(jaw, gBox(), belly, 0, -0.008, 0.13, 0.075, 0.018, 0.24);
    const tm = M(0xfffff0, { rough: 0.3 });
    for (let i = 0; i < 6; i++) [-1, 1].forEach((s) => {
      const c = mesh(head, gCone(), tm, s * 0.037, -0.03, 0.12 + i * 0.03, 0.005, 0.016, 0.005); c.rotation.x = Math.PI;
    });
    const eyeM = M(0xd8c020, { em: 0x504000, ei: 0.5, rough: 0.2 });
    [-1, 1].forEach((s) => {
      mesh(head, gSph(), skin, s * 0.035, 0.04, 0.06, 0.022);
      mesh(head, gSph(), eyeM, s * 0.038, 0.05, 0.068, 0.014);
      mesh(head, gBox(), M(0x050505), s * 0.04, 0.05, 0.081, 0.003, 0.016, 0.002);
      mesh(head, gSphLo(), dark, s * 0.015, 0.017, 0.29, 0.008);
    });
    ctx.jaw = jaw;
    // chân
    const L = [];
    [[0.18, 0], [0.04, Math.PI]].forEach(([z, ph]) => [-1, 1].forEach((s) => L.push({ x: s * rf(0.85) * 1.3, y: -0.02, z, phase: ph + (s > 0 ? Math.PI : 0), s })));
    L.forEach((l) => {
      const p = new THREE.Group(); p.position.set(l.x, l.y, l.z); root.add(p);
      stick(p, V3(0, 0, 0), V3(l.s * 0.05, -0.03, 0), 0.016, skin);
      stick(p, V3(l.s * 0.05, -0.03, 0), V3(l.s * 0.06, -0.075, 0.012), 0.013, skin);
      mesh(p, gBox(), skin, l.s * 0.065, -0.08, 0.03, 0.035, 0.012, 0.05);
      ctx.legs.push({ p, phase: l.phase, croc: true });
    });
    return bm;
  }
  BUILD.croc = function (inner, sp, m, ctx, lite) { crocBody(inner, sp, m, ctx, lite, { c: m.c, b: m.b, scales: true }); };
  BUILD.flycroc = function (inner, sp, m, ctx, lite) {
    crocBody(inner, sp, m, ctx, lite, { c: m.c, b: m.b, scales: true });
    const wg = cache('batwing', () => shapeGeo([[0, -0.08], [0.22, -0.13], [0.5, -0.06], [0.58, 0.02], [0.47, 0.06], [0.4, 0.15], [0.3, 0.1], [0.2, 0.22], [0.1, 0.13], [0, 0.17]], true));
    const wm = M(m.wingC, { ds: 1, rough: 0.7 });
    const bone = M(0x2a1a2a, { rough: 0.6 });
    [-1, 1].forEach((s) => {
      const p = new THREE.Group(); p.position.set(s * 0.08, 0.05, 0.12); ctx.root.add(p);
      const wmesh = new THREE.Mesh(wg, wm); wmesh.scale.x = s; p.add(wmesh);
      stick(p, V3(0, 0.002, 0.08), V3(s * 0.58, 0.002, -0.02), 0.006, bone);
      stick(p, V3(s * 0.22, 0.002, 0.12), V3(s * 0.4, 0.002, -0.15), 0.004, bone);
      stick(p, V3(s * 0.15, 0.002, 0.1), V3(s * 0.2, 0.002, -0.22), 0.004, bone);
      ctx.wings.push({ p, s, amp: 0.75, bat: true });
    });
  };
  BUILD.ray = function (inner, sp, m, ctx, lite) {
    const g = cache('raybody:' + sp.id, () => {
      const geo = new THREE.SphereGeometry(1, 24, 12);
      const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
      const top = new THREE.Color(m.c), bot = new THREE.Color(m.b), c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i), x = pos.getX(i), z = pos.getZ(i);
        c.copy(bot).lerp(top, clamp(y * 3 + 0.5, 0, 1));
        if (y > 0 && Math.sin(x * 40) * Math.sin(z * 37) > 0.6) c.multiplyScalar(0.75);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return geo;
    });
    const skr = skinMaterials(sp.id, m); // da vẽ: lưng nâu lốm đốm, bụng trắng (UV cầu: đỉnh = lưng)
    const mat = skr ? skr.body : M(0xffffff, { vc: 1, rough: 0.7 });
    const root = new THREE.Group(); inner.add(root); ctx.root = root; ctx.joints.push(root);
    mesh(root, g, mat, 0, 0, 0.15, 0.2, 0.06, 0.3);
    const wg = cache('raywing', () => shapeGeo([[0, -0.25], [0.34, 0.02], [0.3, 0.06], [0, 0.18]], true));
    const wm = skr ? skr.tail : M(m.c, { ds: 1, rough: 0.7 });
    [-1, 1].forEach((s) => {
      const p = new THREE.Group(); p.position.set(s * 0.12, 0, 0.13); root.add(p);
      const w = new THREE.Mesh(wg, wm); w.scale.x = s; p.add(w);
      ctx.wings.push({ p, s, amp: 0.35, ray: true });
    });
    const tail = new THREE.Group(); tail.position.z = -0.13; root.add(tail); ctx.tail = tail;
    stick(tail, V3(0, 0, 0), V3(0, 0, -0.37), 0.012, M(darker(m.c, 0.7)), gCylT());
    const sting = mesh(tail, gCone(), M(0x222222), 0, 0.01, -0.15, 0.006, 0.05, 0.006); sting.rotation.x = -Math.PI / 2;
    if (!lite) [-1, 1].forEach((s) => {
      mesh(root, gSph(), M(0x222222), s * 0.05, 0.05, 0.3, 0.015);
      mesh(root, gSphLo(), M(0x3a2a20), s * 0.05, 0.045, 0.25, 0.01);
    });
  };
  BUILD.squid = function (inner, sp, m, ctx, lite) {
    const mm = { r: 0.09, peak: 0.25, blunt: 0.5, ped: 0, w: 1, z0: -0.05, z1: 0.5, c: m.c, b: m.b, spots: true, spotC: 0x7a1410, segs: 1, tail: 'none', dorsal: 'none', anal: false, eyeS: 0.001 };
    const kit = fishKit(sp.id, mm);
    const sks = skinMaterials(sp.id, mm); // da mực: đốm sắc tố đỏ sẫm
    const mat = sks ? sks.body : M(0xffffff, { vc: 1, rough: 0.4, em: 0x300000, ei: 0.4 });
    const root = new THREE.Group(); inner.add(root); ctx.root = root; ctx.joints.push(root);
    root.add(new THREE.Mesh(kit.segGeos[0].g, mat));
    // vây đầu mực
    const fg = cache('squidfin', () => shapeGeo([[0, -0.12], [0.14, 0.02], [0, 0.04]], true));
    const fm = M(m.c, { ds: 1, rough: 0.5 });
    [-1, 1].forEach((s) => { const f = new THREE.Mesh(fg, fm); f.scale.x = s; f.position.set(s * 0.02, 0, 0.42); root.add(f); });
    // đầu + mắt
    const skin = M(m.c, { rough: 0.45, em: 0x300000, ei: 0.4 });
    mesh(root, gSph(), skin, 0, 0, -0.09, 0.075, 0.07, 0.07);
    [-1, 1].forEach((s) => {
      mesh(root, gSph(), M(0xf8f0d0), s * 0.065, 0.01, -0.08, 0.035);
      mesh(root, gSph(), M(0x101010, { em: 0x002040, ei: 0.4 }), s * 0.085, 0.01, -0.075, 0.022);
    });
    // xúc tu
    const armM = M(darker(m.c, 0.9), { rough: 0.5 });
    const sucker = M(m.b, { rough: 0.5 });
    const n = lite ? 6 : 10;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2; const longT = !lite && (i === 2 || i === 7);
      const segs = longT ? 6 : 4, segL = longT ? 0.08 : 0.065;
      let par = new THREE.Group(); par.position.set(Math.cos(a) * 0.045, Math.sin(a) * 0.045, -0.14);
      par.rotation.set(Math.sin(a) * 0.25, -Math.cos(a) * 0.25, 0); root.add(par);
      const chain = [];
      for (let k = 0; k < segs; k++) {
        const r = 0.018 * (1 - k / (segs + 1)) * (longT ? 0.6 : 1);
        const cm = mesh(par, gCylT(), armM, 0, 0, -segL / 2, r, segL, r); cm.rotation.x = -Math.PI / 2;
        if (!lite && k % 2 === 0) mesh(par, gSphLo(), sucker, 0, -r * 0.8, -segL / 2, r * 0.5);
        chain.push(par);
        const nx = new THREE.Group(); nx.position.z = -segL; par.add(nx); par = nx;
      }
      if (longT) mesh(par, gSph(), armM, 0, 0, -0.02, 0.02, 0.012, 0.04);
      ctx.arms.push({ chain, phase: i * 0.8 });
    }
  };
  BUILD.lakemonster = function (inner, sp, m, ctx, lite) {
    const root = new THREE.Group(); inner.add(root); ctx.root = root; ctx.joints.push(root);
    const sk = skinMaterials(sp.id, m);
    const skin = sk ? sk.body : M(m.c, { rough: 0.75 }), belly = M(m.b, { rough: 0.8 }), dark = M(darker(m.c, 0.55), { rough: 0.9, flat: 1 });
    mesh(root, gSph(), skin, 0, 0, -0.05, 0.14, 0.11, 0.22);
    mesh(root, gSph(), belly, 0, -0.035, -0.05, 0.12, 0.08, 0.2);
    for (let i = 0; i < 6; i++) mesh(root, gCone(), dark, 0, 0.1 + Math.sin(i / 5 * Math.PI) * 0.01, 0.12 - i * 0.06, 0.02, 0.06, 0.02);
    // cổ
    let par = new THREE.Group(); par.position.set(0, 0.04, 0.14); par.rotation.x = -0.7; root.add(par);
    const neck = [];
    for (let i = 0; i < 5; i++) {
      const r = 0.05 - i * 0.005;
      const c = mesh(par, gCyl(), skin, 0, 0, 0.04, r, 0.09, r); c.rotation.x = Math.PI / 2;
      mesh(par, gCone(), dark, 0, r * 0.9, 0.04, 0.01, 0.03, 0.01);
      neck.push(par);
      const nx = new THREE.Group(); nx.position.z = 0.075; nx.rotation.x = 0.12; par.add(nx); par = nx;
    }
    // đầu
    mesh(par, gSph(), skin, 0, 0, 0.04, 0.04, 0.035, 0.07);
    mesh(par, gBox(), M(0x200808), 0, -0.012, 0.08, 0.04, 0.005, 0.04);
    const eyeG = M(0xff2000, { em: 0xff2000, ei: 1.2 });
    [-1, 1].forEach((s) => {
      mesh(par, gSph(), eyeG, s * 0.028, 0.015, 0.06, 0.01);
      const h = mesh(par, gCone(), M(0xd8d0b0), s * 0.02, 0.035, 0.02, 0.006, 0.04, 0.006); h.rotation.x = -0.6;
    });
    if (!lite) { const hs = haloSprite(0xff3010, 0.12); hs.position.set(0, 0.015, 0.07); par.add(hs); }
    ctx.neck = neck;
    // vây chèo
    [[0.06, 0], [-0.15, Math.PI]].forEach(([z, ph]) => [-1, 1].forEach((s) => {
      const p = new THREE.Group(); p.position.set(s * 0.12, -0.03, z); root.add(p);
      const f = mesh(p, gSph(), skin, s * 0.09, 0, -0.02, 0.1, 0.012, 0.04); f.rotation.y = s * 0.35;
      ctx.wings.push({ p, s, amp: 0.4, phase: ph });
    }));
    // đuôi
    let tp = new THREE.Group(); tp.position.z = -0.25; root.add(tp);
    const tail = [];
    for (let i = 0; i < 4; i++) {
      const r = 0.06 - i * 0.013;
      const c = mesh(tp, gCylT(), skin, 0, 0, -0.035, r, 0.075, r); c.rotation.x = -Math.PI / 2;
      tail.push(tp);
      const nx = new THREE.Group(); nx.position.z = -0.065; tp.add(nx); tp = nx;
    }
    ctx.tailChain = tail;
  };
  BUILD.cluster = function (inner, sp, m, ctx, lite) {
    const mini = cache('minifish', () => {
      const mm = { r: 0.15, peak: 0.55, blunt: 0.6, ped: 0.2, w: 0.5, z0: -0.3, z1: 0.5, c: 0x9098a8, b: 0xffffff, segs: 1, radial: 8 };
      const body = latheSeg(mm, profile(mm), 0, 1, 0);
      const tail = shapeGeo(tailPts('fork', 0.2)); tail.translate(0, 0, -0.3);
      return { body, tail };
    });
    const big = profile({ r: 0.2, peak: 0.55, blunt: 0.6, ped: 0.15 });
    const n = lite ? 18 : 46;
    const bodyIM = new THREE.InstancedMesh(mini.body, M(0xffffff, { vc: 1, metal: 0.3, rough: 0.4 }), n);
    const tailIM = new THREE.InstancedMesh(mini.tail, M(0xffffff, { ds: 1, rough: 0.6 }), n);
    const palette = [0xff8a30, 0xc0c8d0, 0x5080ff, 0xffd040, 0xa0a0a0, 0xff5060, 0x60c080];
    const items = [];
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      let x, y, z;
      if (i < n - 8) {
        const t = rand(0.08, 0.95); const r = big(t);
        z = -0.3 + t * 0.8; y = rand(-1, 1) * r * 0.8; x = rand(-1, 1) * r * 0.55;
      } else { const k = i - (n - 8); const sgn = k < 4 ? 1 : -1; const u = (k % 4 + 1) / 4; z = -0.3 - u * 0.17; y = sgn * u * 0.17; x = 0; }
      items.push({ x, y, z, s: rand(0.1, 0.16), yaw: rand(-0.4, 0.4), ph: rand(0, 6.28) });
      col.setHex(pick(palette)); bodyIM.setColorAt(i, col); tailIM.setColorAt(i, col);
    }
    const root = new THREE.Group(); inner.add(root); ctx.root = root; ctx.joints.push(root);
    root.add(bodyIM); root.add(tailIM);
    const dummy = new THREE.Object3D();
    const update = (t, k) => {
      for (let i = 0; i < n; i++) {
        const it = items[i];
        const sway = Math.sin(t * (3 + k * 4) + it.ph);
        dummy.position.set(it.x + sway * 0.01, it.y + Math.cos(t * 2 + it.ph) * 0.008, it.z + Math.sin(it.z * 6 - t * 5) * 0.02 * (0.3 + k));
        dummy.rotation.set(0, it.yaw + sway * 0.25 + Math.sin(t * 5 - it.z * 8) * 0.25 * k * (it.z < 0 ? 1 : 0.3), 0);
        dummy.scale.setScalar(it.s);
        dummy.updateMatrix();
        bodyIM.setMatrixAt(i, dummy.matrix); tailIM.setMatrixAt(i, dummy.matrix);
      }
      bodyIM.instanceMatrix.needsUpdate = true; tailIM.instanceMatrix.needsUpdate = true;
    };
    update(0, 0.3);
    ctx.anims.push(update);
    if (!lite) [-1, 1].forEach((s) => {
      mesh(root, gSph(), M(0xffffff), s * 0.06, 0.05, 0.36, 0.045);
      mesh(root, gSph(), M(0x080808), s * 0.085, 0.05, 0.38, 0.025);
    });
  };

  const MERGED = new Map(); // geometry gộp theo loài (xem G.util.mergeStatic) — dùng chung, không dispose
  function createModel(speciesId, lengthMeters, opts) {
    const sp = get(speciesId) || SPECIES[0];
    const m = sp.model; opts = opts || {};
    const lite = !!opts.lite;
    const len = lengthMeters || lengthFromWeight(sp, sp.minW + (sp.maxW - sp.minW) * 0.2);
    const outer = new THREE.Group(); outer.name = 'fish_' + sp.id;
    const inner = new THREE.Group(); inner.scale.setScalar(len); outer.add(inner);
    const ctx = { joints: [], tail: null, anims: [], legs: [], wings: [], arms: [], root: null };
    try { (BUILD[m.type] || BUILD.fish)(inner, sp, m, ctx, lite); } catch (e) { console.error('[fish model ' + sp.id + ']', e); }
    const freq = 4 + sp.speed * 0.6;
    const nJ = ctx.joints.length;
    outer.userData = {
      speciesId: sp.id, length: len, species: sp,
      animate(t, k) {
        k = k == null ? 0.35 : k;
        const f = freq * (0.7 + k * 1.3), a = 0.1 + 0.4 * Math.min(k, 1.5);
        for (let i = 1; i < nJ; i++) ctx.joints[i].rotation.y = Math.sin(t * f - i * 0.9) * a * (0.35 + 0.25 * i / nJ);
        if (ctx.root && nJ > 1) ctx.root.rotation.y = Math.sin(t * f + 0.6) * a * 0.12;
        if (ctx.tail) ctx.tail.rotation.y = Math.sin(t * f - nJ * 0.9) * a * 1.1;
        if (ctx.pects) ctx.pects.forEach((p, i) => { p.rotation.y = Math.sin(t * f * 0.7 + i * 3) * 0.3; });
        if (ctx.whisk) ctx.whisk.forEach((wm, i) => { wm.rotation.y = Math.sin(t * 2 + i) * 0.08; wm.rotation.x = Math.sin(t * 1.7 + i) * 0.06; });
        const walk = 6 + k * 6;
        ctx.legs.forEach((L) => {
          const s = Math.sin(t * walk + L.phase);
          L.p.rotation.x = s * (L.croc ? 0.5 : 0.7) * Math.min(1, 0.4 + k);
          if (L.knee) L.knee.rotation.x = Math.max(0, -Math.cos(t * walk + L.phase)) * 0.8;
        });
        ctx.wings.forEach((W) => {
          const sp2 = W.bat ? 7 : W.ray ? 2.5 : 10;
          W.p.rotation.z = W.s * Math.sin(t * sp2 * (0.8 + k * 0.5) + (W.phase || 0)) * W.amp;
        });
        ctx.arms.forEach((A) => A.chain.forEach((c, i) => {
          c.rotation.x = Math.sin(t * 2.5 - i * 0.7 + A.phase) * 0.18 * (1 + k);
          c.rotation.y = Math.cos(t * 2 - i * 0.6 + A.phase) * 0.15 * (1 + k);
        }));
        if (ctx.neck) ctx.neck.forEach((c, i) => { c.rotation.y = Math.sin(t * 1.3 - i * 0.5) * 0.12 * (1 + k); });
        if (ctx.tailChain) ctx.tailChain.forEach((c, i) => { c.rotation.y = Math.sin(t * 2.5 - i * 0.8) * 0.25 * (0.5 + k); });
        if (ctx.jaw) ctx.jaw.rotation.x = Math.max(0, Math.sin(t * 1.5)) * 0.25 * Math.min(1, k * 1.5);
        if (ctx.halo) { const s = 1.5 + Math.sin(t * 3) * 0.15; ctx.halo.scale.set(s, s, 1); }
        for (const fn of ctx.anims) fn(t, k);
      },
    };
    // gộp mesh tĩnh trong từng khớp cứng (vảy, răng, mắt, đầu...): cá sấu bay 84 → ~20 draw call.
    // Mọi bộ phận được animate ở trên (khớp, đuôi, vây ngực, râu, chân, cánh, hàm, cổ, xúc tu, hào quang) giữ nguyên.
    if (G.util && G.util.mergeStatic) {
      try {
        const moving = new Set();
        const add = (o) => { if (o) moving.add(o); };
        ctx.joints.forEach(add); add(ctx.tail); add(ctx.jaw); add(ctx.halo);
        (ctx.pects || []).forEach(add); (ctx.whisk || []).forEach(add); (ctx.neck || []).forEach(add); (ctx.tailChain || []).forEach(add);
        ctx.legs.forEach((L) => { add(L.p); add(L.knee); }); ctx.wings.forEach((W) => add(W.p)); ctx.arms.forEach((A) => (A.chain || []).forEach(add));
        const skip = [...moving], pre = sp.id + (lite ? ':L' : ':F');
        G.util.mergeStatic(inner, skip, { map: MERGED, key: pre + ':in' });
        skip.forEach((o, i) => { if (!o.isMesh) G.util.mergeStatic(o, skip, { map: MERGED, key: pre + ':' + i }); });
      } catch (e) { console.warn('[fish merge ' + sp.id + ']', e); }
    }
    if (!lite) outer.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    return outer;
  }

  // =====================================================================
  // 3. MODEL RÁC / NGUYÊN LIỆU
  // =====================================================================
  const J = {};
  J.junk_shoe = (g) => { const s = sneaker(0x2a6ae0); s.scale.setScalar(0.28); g.add(s); };
  J.junk_sandal = (g) => {
    mesh(g, gBox(), M(0x2a7ad8, { rough: 0.8 }), 0, 0.01, 0, 0.1, 0.02, 0.26);
    mesh(g, gBox(), M(0xf0f0f0, { rough: 0.8 }), 0, 0.023, 0, 0.09, 0.006, 0.24);
    const st = M(0x1a4a98);
    stick(g, V3(0, 0.025, 0.07), V3(-0.045, 0.03, -0.01), 0.006, st);
    stick(g, V3(0, 0.025, 0.07), V3(0.045, 0.03, -0.01), 0.006, st);
  };
  J.junk_boot = (g) => {
    const m = M(0x2a3a1a, { rough: 0.6 });
    mesh(g, gCyl(), m, 0, 0.2, -0.03, 0.06, 0.32, 0.06);
    mesh(g, gBox(), m, 0, 0.04, 0.04, 0.1, 0.08, 0.24);
    mesh(g, gBox(), M(0x111111), 0, 0.01, 0.04, 0.105, 0.02, 0.25);
  };
  function cloth(g, color, parts) { const m = M(color, { rough: 0.95, ds: 1 }); parts.forEach((p) => mesh(g, gBox(), m, p[0], p[1], p[2], p[3], p[4], p[5])); }
  J.junk_shirt = (g) => { cloth(g, 0x3a8a4a, [[0, 0.01, 0, 0.36, 0.015, 0.42], [-0.24, 0.01, 0.13, 0.14, 0.015, 0.14], [0.24, 0.01, 0.13, 0.14, 0.015, 0.14]]); mesh(g, gBox(), M(0xffffff), 0, 0.02, 0.0, 0.12, 0.005, 0.1); };
  J.junk_pants = (g) => { cloth(g, 0x2a4a8a, [[0, 0.01, 0.14, 0.34, 0.02, 0.1], [-0.09, 0.01, -0.12, 0.15, 0.02, 0.44], [0.09, 0.01, -0.12, 0.15, 0.02, 0.44]]); mesh(g, gBox(), M(0x9a7a30, { metal: 0.8 }), 0, 0.025, 0.16, 0.02, 0.01, 0.02); };
  J.junk_undies = (g) => { // sịp tam giác nằm phẳng: lưng rộng, hai cạnh khoét cong xuống đáy hẹp
    const m = M(0xff3080, { rough: 0.9, ds: 1 });
    const geo = cache('briefs', () => {
      const sh = new THREE.Shape();
      sh.moveTo(-0.14, 0.08); sh.lineTo(0.14, 0.08);
      sh.quadraticCurveTo(0.05, 0.0, 0.03, -0.1); sh.lineTo(-0.03, -0.1);
      sh.quadraticCurveTo(-0.05, 0.0, -0.14, 0.08);
      const e = new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: false, curveSegments: 6 });
      e.rotateX(-Math.PI / 2);
      return e;
    });
    mesh(g, geo, m, 0, 0.002, 0);
    mesh(g, gBox(), M(0xffffff, { rough: 0.9 }), 0, 0.012, -0.075, 0.285, 0.014, 0.02); // lưng thun
    const dots = [0xffe040, 0x40e0ff, 0xffffff];
    for (let i = 0; i < 7; i++) {
      const z = rand(-0.06, 0.06), half = 0.12 - (z + 0.06) * 0.7; // chấm hoa nằm trong hình tam giác
      mesh(g, gSphLo(), M(dots[i % 3]), rand(-half, half), 0.02, z, 0.012, 0.004, 0.012);
    }
  };
  J.junk_bra = (g) => {
    const m = M(0xff8ab0, { rough: 0.7, ds: 1 });
    [-1, 1].forEach((s) => mesh(g, cache('hemi', () => new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), m, s * 0.07, 0, 0, 0.065, 0.05, 0.065));
    stick(g, V3(-0.13, 0.005, 0), V3(0.13, 0.005, 0), 0.006, m);
    stick(g, V3(-0.07, 0.04, 0), V3(-0.07, 0.01, -0.15), 0.004, m);
    stick(g, V3(0.07, 0.04, 0), V3(0.07, 0.01, -0.15), 0.004, m);
  };
  J.junk_hat = (g) => {
    const m = M(0xe8d08a, { rough: 0.9, ds: 1 });
    mesh(g, gCone(), m, 0, 0.07, 0, 0.24, 0.14, 0.24);
    mesh(g, gTorus(), M(0xc8b06a), 0, 0.005, 0, 0.23, 0.23, 0.05).rotation.x = Math.PI / 2;
    mesh(g, gBox(), M(0x404040), 0.15, 0.02, 0, 0.1, 0.03, 0.08);
  };
  J.junk_tire = (g) => {
    const t = mesh(g, cache('tire', () => new THREE.TorusGeometry(0.22, 0.07, 10, 24)), M(0x151515, { rough: 0.9 })); t.rotation.x = Math.PI / 2; t.position.y = 0.07;
    mesh(g, gCyl(), M(0x888888, { metal: 0.8, rough: 0.3 }), 0, 0.07, 0, 0.15, 0.06, 0.15);
  };
  J.junk_can = (g) => {
    mesh(g, gCyl(), M(0xd02020, { metal: 0.6, rough: 0.3 }), 0, 0.06, 0, 0.033, 0.12, 0.033);
    mesh(g, gCyl(), M(0xcccccc, { metal: 0.9, rough: 0.2 }), 0, 0.122, 0, 0.03, 0.005, 0.03);
    mesh(g, gBox(), M(0xffffff), 0, 0.06, 0.033, 0.03, 0.03, 0.002);
  };
  J.junk_bike = (g) => {
    const rust = M(0x8a4a2a, { metal: 0.5, rough: 0.8 }), tire = M(0x1a1a1a, { rough: 0.9 });
    [-0.5, 0.5].forEach((z) => { const w = mesh(g, cache('bikew', () => new THREE.TorusGeometry(0.32, 0.025, 6, 24)), tire, 0, 0.34, z); w.rotation.y = Math.PI / 2; });
    stick(g, V3(0, 0.34, -0.5), V3(0, 0.6, -0.05), 0.02, rust);
    stick(g, V3(0, 0.6, -0.05), V3(0, 0.62, 0.38), 0.02, rust);
    stick(g, V3(0, 0.34, -0.5), V3(0, 0.34, -0.0), 0.018, rust);
    stick(g, V3(0, 0.34, 0.0), V3(0, 0.6, -0.05), 0.018, rust);
    stick(g, V3(0, 0.34, 0.0), V3(0, 0.62, 0.38), 0.02, rust);
    stick(g, V3(0, 0.34, 0.5), V3(0, 0.78, 0.42), 0.02, rust);
    stick(g, V3(-0.22, 0.8, 0.42), V3(0.22, 0.8, 0.42), 0.015, rust);
    mesh(g, gBox(), M(0x222222), 0, 0.68, -0.08, 0.1, 0.04, 0.2);
  };
  J.junk_phone = (g) => {
    mesh(g, gBox(), M(0x151515, { metal: 0.5, rough: 0.3 }), 0, 0.005, 0, 0.075, 0.01, 0.155);
    mesh(g, gBox(), M(0x2050a0, { em: 0x1030a0, ei: 0.6 }), 0, 0.011, 0, 0.068, 0.002, 0.14);
    mesh(g, gBox(), M(0x000000), 0.01, 0.0125, 0.02, 0.05, 0.001, 0.004).rotation.y = 0.8; // vết nứt
  };
  J.junk_chest = (g) => {
    const wood = M(0x6a3a1a, { rough: 0.8 }), gold = M(0xffcc33, { metal: 0.9, rough: 0.25, em: 0x664400, ei: 0.3 });
    mesh(g, gBox(), wood, 0, 0.17, 0, 0.6, 0.34, 0.4);
    const lid = mesh(g, cache('halfcyl', () => new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, 0, Math.PI)), wood, 0, 0.34, 0, 0.2, 0.6, 0.2);
    lid.rotation.z = Math.PI / 2; lid.rotation.y = Math.PI / 2;
    [-0.2, 0.2].forEach((x) => mesh(g, gBox(), gold, x, 0.2, 0, 0.04, 0.4, 0.42));
    mesh(g, gBox(), gold, 0, 0.3, 0.205, 0.08, 0.1, 0.02);
    for (let i = 0; i < 6; i++) mesh(g, gCyl(), gold, rand(-0.2, 0.2), 0.36 + rand(0, 0.05), rand(-0.1, 0.1), 0.03, 0.006, 0.03);
    const h = haloSprite(0xffdd66, 0.9); h.position.y = 0.4; g.add(h);
  };
  J.mat_wood = (g) => {
    const l = mesh(g, gCyl(), M(0x6a4a2a, { rough: 0.95 }), 0, 0.1, 0, 0.1, 0.7, 0.1); l.rotation.z = Math.PI / 2;
    [-0.351, 0.351].forEach((x) => { const e = mesh(g, gCyl(), M(0xc8a070), x, 0.1, 0, 0.09, 0.005, 0.09); e.rotation.z = Math.PI / 2; });
    stick(g, V3(0.1, 0.18, 0), V3(0.2, 0.28, 0.05), 0.015, M(0x5a3a1a));
  };
  J.mat_bamboo = (g) => {
    const gm = M(0x7aa040, { rough: 0.5 }), node = M(0x5a7a2a);
    for (let i = 0; i < 3; i++) {
      const c = mesh(g, gCyl(), gm, -0.3 + i * 0.3, 0.04, i * 0.03 - 0.03, 0.035, 0.28, 0.035); c.rotation.z = Math.PI / 2;
      const n = mesh(g, gCyl(), node, -0.15 + i * 0.3, 0.04, i * 0.03 - 0.03, 0.04, 0.02, 0.04); n.rotation.z = Math.PI / 2;
    }
  };
  J.mat_rubber = (g) => { mesh(g, cache('ico1', () => new THREE.IcosahedronGeometry(1, 1)), M(0x1a1a1a, { rough: 0.9, flat: 1 }), 0, 0.06, 0, 0.1, 0.06, 0.08); };
  J.mat_cloth = (g) => { const cs = [0xe04040, 0x40a0e0, 0xe0c040]; cs.forEach((c, i) => { const p = mesh(g, gBox(), M(c, { rough: 1 }), i * 0.04 - 0.04, 0.01 + i * 0.01, i * 0.03, 0.16, 0.01, 0.12); p.rotation.y = i * 0.6; }); };
  J.mat_rope = (g) => { const m = M(0xb08a50, { rough: 1 }); for (let i = 0; i < 4; i++) { const t = mesh(g, cache('rope', () => new THREE.TorusGeometry(0.14, 0.02, 6, 20)), m, 0, 0.02 + i * 0.035, 0); t.rotation.x = Math.PI / 2; t.scale.setScalar(1 - i * 0.05); } };
  J.mat_scrap = (g) => {
    const r = M(0x7a4a2a, { metal: 0.6, rough: 0.85 }), s = M(0x6a6a6a, { metal: 0.8, rough: 0.6 });
    for (let i = 0; i < 6; i++) { const b = mesh(g, i % 2 ? gBox() : gCyl(), i % 3 ? r : s, rand(-0.12, 0.12), 0.04 + rand(0, 0.06), rand(-0.12, 0.12), rand(0.03, 0.12), rand(0.02, 0.08), rand(0.03, 0.14)); b.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3)); }
  };
  J.mat_steel = (g) => { mesh(g, gBox(), M(0xb0b8c0, { metal: 0.95, rough: 0.25 }), 0, 0.01, 0, 0.5, 0.02, 0.35); mesh(g, gBox(), M(0x7a8088, { metal: 1, rough: 0.4 }), 0, 0.021, 0, 0.45, 0.002, 0.005); };
  J.mat_alloy = (g) => {
    const ig = cache('ingot', () => { const c = new THREE.CylinderGeometry(0.7, 1, 1, 4, 1); c.rotateY(Math.PI / 4); return c; });
    const m = M(0xffc830, { metal: 1, rough: 0.2, em: 0x553300, ei: 0.3 });
    mesh(g, ig, m, 0, 0.04, 0, 0.12, 0.08, 0.06);
    const h = haloSprite(0xffdd66, 0.4); h.position.y = 0.05; g.add(h);
  };
  J.mat_cable = (g) => { const m = M(0x8a929a, { metal: 0.95, rough: 0.35 }); for (let i = 0; i < 3; i++) { const t = mesh(g, cache('cable', () => new THREE.TorusGeometry(0.22, 0.035, 8, 24)), m, 0, 0.035 + i * 0.06, 0); t.rotation.x = Math.PI / 2; } };
  J.mat_engine = (g) => {
    const bm = M(0x4a4a4a, { metal: 0.7, rough: 0.6 }), rust = M(0x8a4a2a, { metal: 0.4, rough: 0.9 });
    mesh(g, gBox(), bm, 0, 0.15, 0, 0.4, 0.3, 0.3);
    for (let i = 0; i < 3; i++) mesh(g, gCyl(), rust, -0.12 + i * 0.12, 0.35, 0, 0.05, 0.12, 0.05);
    const fw = mesh(g, gCyl(), bm, 0.23, 0.15, 0, 0.12, 0.04, 0.12); fw.rotation.z = Math.PI / 2;
    stick(g, V3(-0.2, 0.25, 0.15), V3(-0.3, 0.1, 0.25), 0.02, rust);
  };
  J.mat_chip = (g) => {
    mesh(g, gBox(), M(0x1a6a2a, { rough: 0.5 }), 0, 0.005, 0, 0.12, 0.01, 0.09);
    mesh(g, gBox(), M(0x111111, { rough: 0.3 }), 0, 0.014, 0, 0.05, 0.008, 0.05);
    const gold = M(0xffcc33, { metal: 1, rough: 0.2 });
    for (let i = 0; i < 6; i++) [-1, 1].forEach((s) => mesh(g, gBox(), gold, s * 0.03, 0.012, -0.02 + i * 0.008, 0.012, 0.002, 0.003));
  };
  J.mat_uranium = (g) => {
    mesh(g, cache('ico0', () => new THREE.IcosahedronGeometry(1, 0)), M(0x40ff40, { em: 0x20ff20, ei: 1.4, rough: 0.4, flat: 1 }), 0, 0.06, 0, 0.07);
    const h = haloSprite(0x40ff40, 0.6); h.position.y = 0.06; g.add(h);
  };
  J.mat_scale = (g) => {
    const sg = cache('dscale', () => shapeGeo([[0, 0.12], [0.08, 0.06], [0.07, -0.06], [0, -0.1], [-0.07, -0.06], [-0.08, 0.06]], true));
    const s = mesh(g, sg, M(0xffb020, { metal: 0.9, rough: 0.2, em: 0xff6000, ei: 0.5, ds: 1 }), 0, 0.02, 0); s.rotation.z = 0.1;
    const h = haloSprite(0xffaa33, 0.5); h.position.y = 0.03; g.add(h);
  };
  J.mat_powder = (g) => {
    mesh(g, gCyl(), M(0xd0e0e0, { op: 0.55, rough: 0.1 }), 0, 0.08, 0, 0.05, 0.16, 0.05);
    mesh(g, gCyl(), M(0x303030), 0, 0.06, 0, 0.045, 0.11, 0.045);
    mesh(g, gCyl(), M(0x8a5a2a), 0, 0.17, 0, 0.052, 0.025, 0.052);
    mesh(g, gBox(), M(0xffe0a0), 0, 0.09, 0.051, 0.05, 0.05, 0.002);
  };
  function createJunkModel(itemId) {
    const g = new THREE.Group(); g.name = 'junk_' + itemId;
    try {
      if (J[itemId]) J[itemId](g);
      else mesh(g, gBox(), M(0x8a7a6a, { rough: 0.8 }), 0, 0.1, 0, 0.2, 0.2, 0.2);
    } catch (e) { console.error('[junk model ' + itemId + ']', e); }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.userData.itemId = itemId;
    g.userData.animate = function () {};
    return g;
  }

  // =====================================================================
  // 4. ROLL CATCH / BITE CHANCE
  // =====================================================================
  function envIdNow() { return (G.world && G.world.current && G.world.current.id) || (G.state && G.state.env) || 'forest'; }
  const ENV_BODIES = { forest: ['pond', 'river'], plains: ['river', 'pond'], mountain: ['lake', 'river'], city: ['river', 'pond', 'lake'], island: ['sea'], airplane: ['sky', 'sea'] };
  function safeDepth(x, z) { try { if (G.world && G.world.getDepth) return G.world.getDepth(x, z) || 0; } catch (e) { /* */ } return 0; }
  function safeIsWater(x, z) { try { if (G.world && G.world.isWater) return !!G.world.isWater(x, z); } catch (e) { /* */ } return false; }
  function safeWH(x, z) {
    try {
      if (G.world && G.world.getWaterHeight) { const v = G.world.getWaterHeight(x, z); if (isFinite(v)) return v; }
      if (G.world && G.world.getWaterLevel) return G.world.getWaterLevel();
    } catch (e) { /* */ }
    return 0;
  }
  function safeGround(x, z) { try { if (G.world && G.world.groundHeight) { const v = G.world.groundHeight(x, z); if (isFinite(v)) return v; } } catch (e) { /* */ } return safeWH(x, z) - 3; }
  function safeBounds() { try { const b = G.world && G.world.getBounds && G.world.getBounds(); if (b) return b; } catch (e) { /* */ } return { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }; }
  function safeCond(x, z) {
    let c = null;
    try { if (G.world && G.world.getConditions) c = G.world.getConditions(x || 0, z || 0); } catch (e) { /* */ }
    if (c) return c;
    const env = envIdNow(); const ed = (G.data && G.data.env && G.data.env(env)) || {};
    const time = (G.state && G.state.time) || 12;
    return { time, isNight: time < 5.5 || time > 18.5, light: 1, tide: 0, tideLabel: '', waterTemp: ed.baseTemp || 24, weather: 'clear', waveHeight: 0, env, waterBody: ed.waterBody || 'pond' };
  }
  const item = (id) => (id && G.data && G.data.item ? G.data.item(id) : null);
  function randomWeight(sp) {
    const u = Math.pow(Math.random(), 1.5); // 1.5: cá ra đủ to, không dồn hết về mức nhẹ nhất của loài
    let w = sp.minW + (sp.maxW - sp.minW) * u;
    if (Math.random() < 0.01) w = sp.maxW * rand(1.0, 1.12); // cá kỷ lục
    return w < 1 ? Math.round(w * 1000) / 1000 : Math.round(w * 10) / 10;
  }
  function makeFishInfo(sp, weight, extra) {
    if (typeof sp === 'string') sp = get(sp);
    if (!sp) return null;
    weight = weight != null ? weight : randomWeight(sp);
    const info = { kind: 'fish', id: sp.id, name: sp.name, weight, species: sp, value: Math.round(weight * sp.price), length: Math.round(lengthFromWeight(sp, weight) * 100) / 100 };
    const bonus = [];
    if (sp.id === 'ca_rong' && Math.random() < 0.4) bonus.push({ id: 'mat_scale', count: randInt(1, 2) });
    if (sp.id === 'ca_thep' && Math.random() < 0.5) bonus.push({ id: 'mat_steel', count: randInt(1, 2) });
    if (sp.id === 'ca_di_giay' && Math.random() < 0.6) bonus.push({ id: 'junk_shoe', count: 2 });
    if (sp.id === 'ca_ba_mat' && Math.random() < 0.15) bonus.push({ id: 'mat_chip', count: 1 });
    if (sp.id === 'ca_van_can') { bonus.push({ id: 'mat_alloy', count: 3 }); bonus.push({ id: 'mat_scale', count: 1 }); }
    if (sp.id === 'ca_voi_map' && Math.random() < 0.3) bonus.push({ id: 'mat_cable', count: 1 });
    if (sp.id === 'megalodon') bonus.push({ id: 'mat_alloy', count: 2 });
    if (sp.id === 'hai_long_vuc_tham') { bonus.push({ id: 'mat_scale', count: 2 }); bonus.push({ id: 'mat_alloy', count: 2 }); }
    if (bonus.length) info.bonusItems = bonus;
    if (extra) Object.assign(info, extra);
    return info;
  }
  function itemInfo(it, kind) {
    return { kind, id: it.id, name: it.name, weight: it.weight || 0.5, species: null, value: it.price || 0 };
  }
  function softRange(v, a, b, scale) {
    if (v >= a && v <= b) return 1;
    const d = v < a ? a - v : v - b;
    return Math.exp(-d / scale);
  }
  // "câu cá vạn cân": cá bé ít đi, cá to/khổng lồ/quái vật ra nhiều hơn (vẫn bị giới hạn theo sức cần)
  const CAT_BOOST = { be: 0.35, thuong: 1, to: 2.2, khong_lo: 3.5, quai_vat: 3.5, dot_bien: 1.5, meme: 1.5 };
  function fishWeights(p, env, cond, bait, rod) {
    const bodies = ENV_BODIES[env] || [cond.waterBody || 'pond'];
    let depth = p.depth;
    if (!(depth > 0)) depth = safeDepth(p.x || 0, p.z || 0);
    if (!(depth > 0)) depth = 3;
    const T = cond.waterTemp != null ? cond.waterTemp : 24;
    const tide = cond.tide || 0;
    const tech = rod ? rod.technique : 'float';
    const out = [];
    for (const sp of SPECIES) {
      if (sp.envs.indexOf(env) < 0) continue;
      if (!sp.waterBodies.some((b) => bodies.indexOf(b) >= 0)) continue;
      const skyOnly = sp.waterBodies.length === 1 && sp.waterBodies[0] === 'sky';
      if (p.inAir && !sp.waterBodies.includes('sky')) continue;
      let w = 100 * Math.exp(-sp.rarity / 18) * (CAT_BOOST[sp.category] || 1);
      if (skyOnly && !p.inAir) w *= 0.5;
      if (!skyOnly) w *= Math.max(depth < sp.depth[0] ? 0.06 : 0.1, softRange(depth, sp.depth[0], sp.depth[1], depth < sp.depth[0] ? 1 + sp.depth[0] * 0.25 : 1 + sp.depth[1] * 0.3));
      w *= Math.max(0.15, softRange(T, sp.temp[0], sp.temp[1], 4));
      if (sp.time === 'night') w *= cond.isNight ? 1.7 : 0.3;
      else if (sp.time === 'day') w *= cond.isNight ? 0.35 : 1.3;
      if (sp.tide === 'high') w *= tide > 0.2 ? 1.6 : tide < -0.2 ? 0.5 : 1;
      else if (sp.tide === 'low') w *= tide < -0.2 ? 1.6 : tide > 0.2 ? 0.5 : 1;
      const big = sp.category === 'khong_lo' || sp.category === 'quai_vat';
      if (cond.weather === 'storm' && big) w *= 1.5;
      if (cond.weather === 'rain') w *= 1.1;
      if (bait) {
        const liked = sp.baits.indexOf(bait.id) >= 0;
        w *= liked ? 3 : 0.4;
        if (liked && bait.forTech && bait.forTech.indexOf(tech) >= 0) w *= 1.4;
        if (bait.id === 'bait_nuke') w *= sp.category === 'dot_bien' ? 5 : 0.8;
        if (bait.id === 'bait_glow' && cond.isNight && (big || sp.category === 'dot_bien')) w *= 2;
        if (bait.id === 'bait_meat' && sp.category === 'be') w *= 0.15;
      } else w *= 0.5;
      if (rod) {
        if (sp.minW > rod.maxWeight * 20) w *= 0.3;
        else if (sp.minW > rod.maxWeight * 4) w *= 0.6;
        else if (big && rod.maxWeight >= sp.minW) w *= 1.3;
        if (rod.maxWeight >= 5000 && sp.category === 'be') w *= 0.6;
        if (rod.maxWeight >= 5000 && big) w *= 4; // đã có cần vạn cân → gặp cá hàng tấn thường xuyên
        if (sp.maxW >= 1000 && rod.maxWeight >= sp.minW) w *= 3;
      }
      if (w > 0) out.push({ w, sp });
    }
    return out;
  }
  function rollJunk(env) {
    const list = ((G.data && G.data.JUNK) || []).map((it) => {
      let w = 1 / Math.pow(it.rarity || 1, 1.3);
      if (env === 'city' && (it.id === 'junk_bike' || it.id === 'junk_phone' || it.id === 'junk_can')) w *= 1.8;
      if (env === 'island' && it.id === 'junk_chest') w *= 2;
      if (env === 'airplane' && it.id === 'junk_chest') w *= 1.5;
      return { w, it };
    });
    if (!list.length) return null;
    return itemInfo(wpick(list).it, 'junk');
  }
  function rollMaterial(env, cond, bait) {
    const heavy = ['mat_steel', 'mat_alloy', 'mat_cable', 'mat_engine', 'mat_chip', 'mat_scrap'];
    const list = [];
    ((G.data && G.data.MATERIALS) || []).forEach((it) => {
      let w = 1 / Math.pow(it.rarity || 1, 0.8); // 0.8: đồ hiếm vẫn hiếm nhưng không cày hàng nghìn lần
      if (heavy.indexOf(it.id) >= 0 && (env === 'city' || env === 'island' || env === 'airplane')) w *= 1.8;
      if ((it.id === 'mat_wood' || it.id === 'mat_bamboo') && (env === 'forest' || env === 'plains' || env === 'mountain')) w *= 1.8;
      if (it.id === 'mat_powder' && (env === 'city' || env === 'island')) w *= 1.5;
      if (it.id === 'mat_uranium') {
        const mutant = cond.isNight || (bait && (bait.id === 'bait_nuke' || bait.id === 'bait_pate'));
        if (!(env === 'city' && mutant)) w = 0; else w *= 3;
      }
      if (it.id === 'mat_scale') w = (env === 'mountain' || env === 'island') ? w * 0.5 : 0;
      if (w > 0) list.push({ w, it });
    });
    if (!list.length) return null;
    return itemInfo(wpick(list).it, 'material');
  }
  function rollCatch(p) {
    p = p || {};
    const cond = p.conditions || safeCond(p.x, p.z);
    const env = cond.env || envIdNow();
    const bait = item(p.baitId || (G.state && G.state.equipped && G.state.equipped.bait));
    const rod = item(p.rodId || (G.state && G.state.equipped && G.state.equipped.rod));
    const att = bait ? bait.attract || 1 : 0.8;
    const scale = 1 / (0.75 + 0.25 * att);
    let jp = env === 'city' ? 0.22 : env === 'island' ? 0.12 : env === 'airplane' ? 0.1 : env === 'forest' ? 0.13 : 0.15;
    let mp = (env === 'city' || env === 'island' || env === 'airplane') ? 0.1 : 0.07;
    if (p.inAir) { jp = 0; mp = 0; }
    jp *= scale; mp *= scale;
    const r = Math.random();
    if (r < jp) { const j = rollJunk(env); if (j) return j; }
    else if (r < jp + mp) { const m = rollMaterial(env, cond, bait); if (m) return m; }
    const list = fishWeights(p, env, cond, bait, rod);
    if (!list.length) return rollJunk(env) || makeFishInfo(SPECIES[0]);
    const sp = wpick(list).sp;
    return makeFishInfo(sp);
  }
  function biteChance(p) {
    p = p || {};
    const cond = p.conditions || safeCond(p.x, p.z);
    const bait = item(p.baitId || (G.state && G.state.equipped && G.state.equipped.bait));
    const rod = item(p.rodId || (G.state && G.state.equipped && G.state.equipped.rod));
    let c = 0.12;
    const h = cond.time != null ? cond.time : 12;
    if ((h >= 5 && h <= 7.5) || (h >= 17 && h <= 19.5)) c *= 1.6;
    else if (cond.isNight) c *= 0.9;
    else if (h >= 11 && h <= 14) c *= 0.8;
    if (cond.weather === 'rain') c *= 1.25;
    else if (cond.weather === 'storm') c *= 0.6;
    else if (cond.weather === 'fog') c *= 1.05;
    if (bait) {
      c *= 0.6 + 0.4 * (bait.attract || 1);
      if (rod && bait.forTech) c *= bait.forTech.indexOf(rod.technique) >= 0 ? 1.2 : 0.8;
      if (bait.id === 'bait_glow' && cond.isNight) c *= 1.3;
    } else c *= 0.4;
    if (rod) c *= 0.8 + 0.4 * (rod.sensitivity || 0.5);
    if (G.state && G.state.drunk > 0.3) c *= 1.1; // người say thì cá cũng say theo
    if (G.state && G.state.wearing && G.state.wearing.undies === 'junk_undies') c *= 1.1; // sịp hoa may mắn
    if (!p.inAir && p.x != null && G.world && G.world.isWater && !safeIsWater(p.x, p.z) && envIdNow() !== 'airplane') return 0;
    return clamp(c, 0.03, 0.38);
  }

  // =====================================================================
  // 5. CÁ AMBIENT
  // =====================================================================
  const amb = { group: null, list: [], shadows: [], target: 0, pool: [], flee: [], respawn: 0, env: null, crocT: 0 };
  function waterOK(x, z, minD) { return safeIsWater(x, z) && safeDepth(x, z) > (minD || 0.7); }
  function findWaterPoint(minD, near, rad) {
    const b = safeBounds();
    for (let i = 0; i < 80; i++) {
      let x, z;
      if (near) { const a = Math.random() * 6.283, r = Math.random() * (rad || 8); x = near.x + Math.cos(a) * r; z = near.z + Math.sin(a) * r; }
      else { x = rand(b.minX, b.maxX); z = rand(b.minZ, b.maxZ); }
      if (waterOK(x, z, minD)) return { x, z };
    }
    return null;
  }
  function clearAmbient() {
    if (amb.group && amb.group.parent) amb.group.parent.remove(amb.group);
    amb.group = null; amb.list.length = 0; amb.shadows.length = 0; amb.flee.length = 0;
  }
  function spawnFish(near, rad, stunned, forceSp) {
    if ((!amb.pool.length && !forceSp) || !amb.group) return null;
    const pt = findWaterPoint(forceSp ? 4 : near ? 0.4 : 0.9, near, rad);
    if (!pt) return null;
    const sp = forceSp || pick(amb.pool);
    let weight = randomWeight(sp);
    let len = lengthFromWeight(sp, weight);
    // cá thường bơi nền ≤1,3m cho gọn; cá khổng lồ/quái vật thì to hẳn (2,5–5m) nếu nước đủ sâu → nhìn là biết
    const giant = (sp.category === 'khong_lo' || sp.category === 'quai_vat') && safeDepth(pt.x, pt.z) > 3;
    const cap = giant ? rand(2.5, 5) : 1.3;
    if (len > cap) { len = giant ? cap : rand(0.7, 1.3); weight = weightFromLength(sp, len); }
    if (len < 0.18) { len = 0.18; }
    const obj = createModel(sp.id, len, { lite: true });
    const d = safeDepth(pt.x, pt.z);
    const e = {
      obj, speciesId: sp.id, alive: true, radius: Math.max(0.25, len * 0.4), kind: 'fish', state: 'swim',
      h: Math.random() * 6.283, v: rand(0.4, 1.2), baseV: 0, depthOff: giant ? Math.min(d - len * 0.2, rand(len * 0.3, len * 0.6)) : rand(0.3, Math.max(0.35, Math.min(d - 0.3, 2.5))),
      turn: 0, turnT: 0, len, weight, vy: 0, deadT: 0, phase: Math.random() * 10, catchInfo: null, checkT: 0, minD: giant ? 3 : 0,
    };
    e.baseV = e.v;
    obj.position.set(pt.x, safeWH(pt.x, pt.z) - e.depthOff, pt.z);
    obj.rotation.order = 'YXZ';
    amb.group.add(obj);
    amb.list.push(e);
    if (stunned) killEntry(e);
    return e;
  }
  function spawnShadow() {
    const pt = findWaterPoint(4);
    if (!pt) return;
    const gsh = cache('shadowGeo', () => {
      const s = new THREE.Shape();
      s.absellipse(0, 0, 0.18, 0.5, 0, Math.PI * 2, false, 0);
      const g1 = new THREE.ShapeGeometry(s, 16);
      const t = new THREE.Shape(); t.moveTo(0, -0.42); t.lineTo(-0.16, -0.68); t.lineTo(0, -0.6); t.lineTo(0.16, -0.68); t.lineTo(0, -0.42);
      const g2 = new THREE.ShapeGeometry(t);
      // gộp thủ công 2 shape
      const a = g1.attributes.position.array, b = g2.attributes.position.array;
      const pos = new Float32Array(a.length + b.length); pos.set(a); pos.set(b, a.length);
      const ia = g1.index ? Array.from(g1.index.array) : [...Array(a.length / 3).keys()];
      const ib = g2.index ? Array.from(g2.index.array) : [...Array(b.length / 3).keys()];
      const off = a.length / 3;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(ia.concat(ib.map((i) => i + off)));
      g.rotateX(-Math.PI / 2);
      return g;
    });
    const mat = cache('shadowMat', () => new THREE.MeshBasicMaterial({ color: 0x000810, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
    const m = new THREE.Mesh(gsh, mat);
    const size = rand(6, 16);
    m.scale.set(size, size, size);
    m.renderOrder = 1;
    m.position.set(pt.x, safeWH(pt.x, pt.z) - 0.6, pt.z);
    amb.group.add(m);
    amb.shadows.push({ mesh: m, h: Math.random() * 6.28, v: rand(0.6, 1.5), size, checkT: 0 });
  }
  function planeCenter() {
    const d = G.world && G.world.planeDeck;
    if (d && d.getWorldPosition) return d.getWorldPosition(new THREE.Vector3());
    return new THREE.Vector3(0, 120, 0);
  }
  function spawnCroc() {
    const sp = get('ca_sau_bay');
    const weight = randomWeight(sp);
    const len = Math.min(4.5, lengthFromWeight(sp, weight));
    const obj = createModel('ca_sau_bay', len);
    obj.rotation.order = 'YXZ';
    const e = { obj, speciesId: 'ca_sau_bay', alive: true, radius: len * 0.4, kind: 'flycroc', state: 'fly', ang: Math.random() * 6.28, R: rand(18, 45), hOff: rand(-12, 10), w: rand(0.15, 0.3) * (Math.random() < 0.5 ? -1 : 1), len, weight, phase: Math.random() * 10, vy: 0, deadT: 0, catchInfo: null };
    const c = planeCenter();
    obj.position.set(c.x + Math.cos(e.ang) * e.R, c.y + e.hOff, c.z + Math.sin(e.ang) * e.R);
    amb.group.add(obj); amb.list.push(e);
    return e;
  }
  function populate() {
    clearAmbient();
    if (!G.scene) return;
    const env = envIdNow(); amb.env = env;
    amb.group = new THREE.Group(); amb.group.name = 'fishAmbient';
    G.scene.add(amb.group);
    amb.pool = SPECIES.filter((s) => s.envs.indexOf(env) >= 0 && ['be', 'thuong', 'to'].indexOf(s.category) >= 0 && s.model.type === 'fish' && s.waterBodies.indexOf('sky') < 0);
    amb.target = env === 'airplane' ? 12 : randInt(20, 40);
    for (let i = 0; i < amb.target; i++) spawnFish();
    // 1–2 con khổng lồ/quái vật lượn ở vùng nước sâu (bóng to dưới nước làm người chơi muốn săn)
    const giants = SPECIES.filter((s) => s.envs.indexOf(env) >= 0 && (s.category === 'khong_lo' || s.category === 'quai_vat') && s.waterBodies.indexOf('sky') < 0 && ['fish', 'shark', 'legend', 'dragon'].indexOf(s.model.type) >= 0);
    for (let i = 0; i < Math.min(2, giants.length); i++) spawnFish(false, null, false, pick(giants));
    const nSh = env === 'island' || env === 'airplane' ? 4 : env === 'mountain' ? 3 : env === 'plains' ? 2 : env === 'city' ? 1 : 1;
    for (let i = 0; i < nSh; i++) spawnShadow();
    if (env === 'airplane') for (let i = 0; i < 4; i++) spawnCroc();
    amb.respawn = 0;
  }
  function killEntry(e) {
    if (!e || !e.alive) return null;
    e.alive = false; e.deadT = 0; e.vy = 0;
    e.state = e.kind === 'flycroc' ? 'fall' : 'dead';
    e.catchInfo = makeFishInfo(get(e.speciesId), e.weight, { stunned: true });
    return e.catchInfo;
  }
  function killAmbient(entry) {
    const info = killEntry(entry);
    if (info && G.fx && G.fx.splash && entry.kind === 'fish') { try { G.fx.splash(entry.obj.position.clone(), 0.5); } catch (e) { /* */ } }
    return info;
  }
  function removeEntry(e) {
    const i = amb.list.indexOf(e); if (i >= 0) amb.list.splice(i, 1);
    if (e.obj && e.obj.parent) e.obj.parent.remove(e.obj);
  }
  function collect(entry) {
    if (!entry || entry.alive) return null;
    const info = entry.catchInfo; removeEntry(entry); entry.collected = true;
    return info;
  }
  const angWrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  function nearCam(pos, d) { return G.camera && G.camera.position.distanceToSquared(pos) < d * d; }

  // ---- tách đàn: lưới băm 2m dùng lại mỗi frame (không cấp phát mảng mới) ----
  const DEAD_BUOY = { dt: 0, draft: 0.04, length: 0.5, width: 0.15, floor: null, damping: 0.4, angStiffness: 25 };
  const SEP_CELL = 2, sepGrid = new Map(), sepPool = [];
  function separation() {
    for (const arr of sepGrid.values()) { arr.length = 0; sepPool.push(arr); }
    sepGrid.clear();
    const L = amb.list;
    for (let i = 0; i < L.length; i++) {
      const e = L[i]; e.sepX = 0; e.sepZ = 0;
      if (!e.alive || e.kind !== 'fish' || e.state !== 'swim') continue;
      const p = e.obj.position, k = (Math.floor(p.x / SEP_CELL) + 4096) * 8192 + (Math.floor(p.z / SEP_CELL) + 4096);
      let arr = sepGrid.get(k); if (!arr) { arr = sepPool.pop() || []; sepGrid.set(k, arr); }
      arr.push(e);
    }
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (!e.alive || e.kind !== 'fish' || e.state !== 'swim') continue;
      const p = e.obj.position, cx = Math.floor(p.x / SEP_CELL), cz = Math.floor(p.z / SEP_CELL);
      for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const arr = sepGrid.get((ix + 4096) * 8192 + (iz + 4096)); if (!arr) continue;
        for (let j = 0; j < arr.length; j++) {
          const o = arr[j]; if (o === e) continue;
          const q = o.obj.position, dx = p.x - q.x, dz = p.z - q.z, dy = p.y - q.y;
          const R = e.radius + o.radius + 0.15, d2 = dx * dx + dz * dz + dy * dy * 0.5;
          if (d2 >= R * R || d2 < 1e-8) continue;
          const d = Math.sqrt(d2), f = (R - d) / R * 1.6; // m/s đẩy ra
          e.sepX += dx / d * f; e.sepZ += dz / d * f;
        }
      }
    }
  }
  function update(dt, t) {
    if (!amb.group || dt <= 0) return;
    separation();
    // dọn vùng hoảng sợ hết hạn
    for (let i = amb.flee.length - 1; i >= 0; i--) if (amb.flee[i].until < t) amb.flee.splice(i, 1);
    const pc = amb.env === 'airplane' ? planeCenter() : null;
    for (let i = amb.list.length - 1; i >= 0; i--) {
      const e = amb.list[i]; const o = e.obj; const p = o.position;
      if (e.kind === 'flycroc') { updateCroc(e, dt, t, pc); continue; }
      const wy = safeWH(p.x, p.z);
      if (e.state === 'dead') {
        e.deadT += dt;
        // cá chết/choáng nổi lên bằng lực nổi (bong bóng khí), bập bềnh theo sóng; sau 60s chìm dần
        const PH = G.physics;
        if (PH && PH.buoyancy && e.deadT <= 60) {
          const bo = DEAD_BUOY; bo.dt = dt; bo.draft = Math.max(0.02, e.len * 0.08); bo.length = e.len * 0.8; bo.width = e.len * 0.25;
          bo.floor = safeGround(p.x, p.z) + 0.05;
          const bs = PH.buoyancy(o, bo);
          o.rotation.x = bs ? bs.pitch : o.rotation.x * 0.95;
        } else {
          p.y += (wy + 0.04 - p.y) * Math.min(1, dt * 2);
          o.rotation.x *= 0.95;
        }
        o.rotation.z += (Math.PI - o.rotation.z) * Math.min(1, dt * 3);
        o.rotation.y += dt * 0.1;
        if (e.deadT > 60) { p.y -= dt * 0.5; if (e.deadT > 64) removeEntry(e); }
        continue;
      }
      if (e.state === 'jump') {
        e.vy -= 9.8 * dt;
        p.x += Math.sin(e.h) * e.v * dt; p.z += Math.cos(e.h) * e.v * dt; p.y += e.vy * dt;
        o.rotation.x = -Math.atan2(e.vy, e.v);
        if (e.vy < 0 && p.y < wy) {
          e.state = 'swim'; o.rotation.x = 0;
          if (G.fx && G.fx.splash && nearCam(p, 120)) { try { G.fx.splash(new THREE.Vector3(p.x, wy, p.z), 0.4 + e.len * 0.5); } catch (err) { /* */ } }
        }
        if (o.userData.animate && nearCam(p, 80)) o.userData.animate(t + e.phase, 1);
        continue;
      }
      // bơi
      let speed = e.baseV, fleeing = false;
      for (const f of amb.flee) {
        const dx = p.x - f.x, dz = p.z - f.z, d2 = dx * dx + dz * dz;
        if (d2 < f.r * f.r) { const th = Math.atan2(dx, dz); e.h += angWrap(th - e.h) * Math.min(1, dt * 5); speed = e.baseV * 3.5 + 1.5; fleeing = true; break; }
      }
      if (!fleeing) {
        e.turnT -= dt;
        if (e.turnT <= 0) { e.turnT = rand(1.5, 5); e.turn = rand(-0.8, 0.8); e.baseV = rand(0.3, 1.3); }
        e.h += e.turn * dt;
      }
      e.v += (speed - e.v) * Math.min(1, dt * 3);
      e.checkT -= dt;
      let nx = p.x + Math.sin(e.h) * e.v * dt, nz = p.z + Math.cos(e.h) * e.v * dt;
      // tách đàn: đẩy nhẹ khỏi cá khác quá gần (lưới băm, chỉ xét ô lân cận) + lái hướng tránh
      if (e.sepX || e.sepZ) {
        nx += e.sepX * dt; nz += e.sepZ * dt;
        const sh = Math.atan2(e.sepX, e.sepZ);
        e.h += angWrap(sh - e.h) * Math.min(1, dt * 1.5) * Math.min(1, Math.hypot(e.sepX, e.sepZ));
      }
      if (e.checkT <= 0) {
        e.checkT = 0.35;
        const look = Math.max(2.2, e.len), lx = p.x + Math.sin(e.h) * look, lz = p.z + Math.cos(e.h) * look;
        if (!waterOK(lx, lz, Math.max(0.5, e.minD || 0))) { e.h += Math.PI * rand(0.6, 1.4); e.turn = -e.turn; }
      }
      if (waterOK(nx, nz, Math.max(0.4, (e.minD || 0) * 0.8))) { p.x = nx; p.z = nz; } else e.h += Math.PI * 0.5 * dt * 10;
      const gy = safeGround(p.x, p.z);
      const ty = Math.max(gy + 0.2, wy - e.depthOff);
      p.y += (ty - p.y) * Math.min(1, dt * 2);
      o.rotation.y = e.h; o.rotation.x *= 0.9; o.rotation.z = Math.sin(t * 2 + e.phase) * 0.05;
      // thỉnh thoảng nhảy
      if (!fleeing && amb.env !== 'airplane' && Math.random() < dt * 0.012 && wy - gy > 1.0) {
        e.state = 'jump'; e.vy = rand(3, 5.5); e.v = rand(1.5, 3);
        p.y = wy - 0.05;
        if (G.fx && G.fx.splash && nearCam(p, 120)) { try { G.fx.splash(new THREE.Vector3(p.x, wy, p.z), 0.3 + e.len * 0.4); } catch (err) { /* */ } }
        if (G.audio && G.audio.play && nearCam(p, 25)) { try { G.audio.play('plop', { volume: 0.3 }); } catch (err) { /* */ } }
      }
      if (o.userData.animate && nearCam(p, 80)) o.userData.animate(t + e.phase, fleeing ? 1 : 0.3 + e.v * 0.2);
    }
    // bóng cá khổng lồ
    for (const s of amb.shadows) {
      const m = s.mesh, p = m.position;
      s.checkT -= dt;
      if (s.checkT <= 0) {
        s.checkT = 0.5;
        if (!waterOK(p.x + Math.sin(s.h) * s.size * 0.8, p.z + Math.cos(s.h) * s.size * 0.8, 3)) s.h += Math.PI * rand(0.5, 1.2);
        else s.h += rand(-0.2, 0.2);
      }
      p.x += Math.sin(s.h) * s.v * dt; p.z += Math.cos(s.h) * s.v * dt;
      p.y = safeWH(p.x, p.z) - 0.6;
      m.rotation.y = s.h + Math.sin(t * 0.8 + s.size) * 0.08;
    }
    // hồi sinh
    amb.respawn -= dt;
    if (amb.respawn <= 0) {
      amb.respawn = rand(3, 7);
      let alive = 0, crocs = 0;
      for (const e of amb.list) { if (e.alive && e.kind === 'fish') alive++; if (e.alive && e.kind === 'flycroc') crocs++; }
      if (alive < amb.target) spawnFish();
      if (amb.env === 'airplane' && crocs < 3) { amb.crocT += 5; if (amb.crocT > 20) { amb.crocT = 0; spawnCroc(); } }
    }
  }
  function updateCroc(e, dt, t, pc) {
    const o = e.obj, p = o.position;
    if (e.state === 'fall') {
      e.deadT += dt; e.vy -= 9.8 * dt;
      p.y += e.vy * dt; o.rotation.z += dt * 3; o.rotation.x += dt * 1.5;
      const wy = safeWH(p.x, p.z);
      if (p.y < wy || e.deadT > 12) {
        if (G.fx && G.fx.splash && p.y < wy + 2) { try { G.fx.splash(new THREE.Vector3(p.x, wy, p.z), 2); } catch (err) { /* */ } }
        removeEntry(e);
      }
      return;
    }
    e.ang += e.w * dt;
    const tx = pc.x + Math.cos(e.ang) * e.R, tz = pc.z + Math.sin(e.ang) * e.R, ty = pc.y + e.hOff + Math.sin(t * 0.7 + e.phase) * 4;
    const dx = tx - p.x, dz = tz - p.z;
    p.x += dx * Math.min(1, dt * 2); p.y += (ty - p.y) * Math.min(1, dt * 1.5); p.z += dz * Math.min(1, dt * 2);
    const vx = -Math.sin(e.ang) * e.w, vz = Math.cos(e.ang) * e.w;
    o.rotation.y = Math.atan2(vx, vz);
    o.rotation.z = (e.w > 0 ? -1 : 1) * 0.35;
    if (o.userData.animate) o.userData.animate(t + e.phase, 0.8);
  }
  function onExplosion(d) {
    if (!d || !amb.group) return;
    const pos = d.pos || d.position || d; if (pos.x == null) return;
    const size = d.size || 1; const R = 5 + 4 * size;
    const list = [];
    for (const e of amb.list.slice()) {
      if (!e.alive) continue;
      const p = e.obj.position; const dx = p.x - pos.x, dz = p.z - pos.z, dy = (p.y - (pos.y != null ? pos.y : p.y));
      if (dx * dx + dz * dz + dy * dy * 0.25 < R * R) { killEntry(e); list.push(e); }
    }
    // nổ trong nước → thêm vài con nổi lên
    if (waterOK(pos.x, pos.z, 0.3)) {
      const extra = Math.max(0, randInt(2, 4 + Math.round(size)) - list.length);
      for (let i = 0; i < extra; i++) { const e = spawnFish({ x: pos.x, z: pos.z }, R * 0.7, true); if (e) list.push(e); }
    }
    amb.flee.push({ x: pos.x, z: pos.z, r: R * 3, until: G.time + 6 });
    if (list.length) G.bus && G.bus.emit('fish:stunned', { list, pos });
  }

  // =====================================================================
  // 6. INIT
  // =====================================================================
  function init() {
    if (G.addUpdate) G.addUpdate(update, 20);
    if (G.bus) {
      G.bus.on('env:changed', () => { try { populate(); } catch (e) { console.error('[fish populate]', e); } });
      G.bus.on('explosion', onExplosion);
      G.bus.on('bobber:landed', (d) => { const p = d && d.pos; if (p) amb.flee.push({ x: p.x, z: p.z, r: 5, until: G.time + 2.5 }); });
      const cluck = (d) => {
        const ci = d && (d.catchInfo || (d.species ? { id: d.species.id || d.species } : null));
        if (ci && ci.id === 'ca_ga' && G.audio && G.audio.play) { try { G.audio.play('chicken'); } catch (e) { /* */ } }
      };
      G.bus.on('bite', cluck); G.bus.on('hooked', cluck); G.bus.on('fish:caught', cluck); G.bus.on('combat:start', cluck);
    }
  }

  // Ảnh chân dung loài cho sách cá / túi đồ: chụp chính mô hình 3D (khớp với cá trong game), cache dataURL.
  const PORTRAITS = {};
  let pScene = null, pCam = null, pRT = null;
  function portrait(id) {
    if (PORTRAITS[id] !== undefined) return PORTRAITS[id];
    const r = G.renderer, sp = get(id);
    if (!r || !sp) return null;
    const W = 256, H = 128;
    try {
      if (!pScene) {
        pScene = new THREE.Scene();
        const L = new THREE.DirectionalLight(0xffffff, 1.6); L.position.set(1, 3, 4); pScene.add(L);
        const L2 = new THREE.DirectionalLight(0x9fc8ff, 0.6); L2.position.set(-2, -1, -3); pScene.add(L2);
        pScene.add(new THREE.AmbientLight(0xffffff, 0.55));
        pCam = new THREE.PerspectiveCamera(30, W / H, 0.01, 50);
        pRT = new THREE.WebGLRenderTarget(W, H); pRT.texture.encoding = THREE.sRGBEncoding;
      }
      const m = createModel(id, 1);
      m.rotation.y = -Math.PI / 2 + 0.25; // nghiêng nhẹ cho thấy khối
      if (m.userData.animate) m.userData.animate(0.4, 0.25);
      pScene.add(m); m.updateMatrixWorld(true);
      const box = new THREE.Box3(); // chỉ tính khối mesh — bỏ quầng sáng (sprite) kẻo cá bị thu nhỏ
      m.traverse((o) => { if (o.isMesh) box.expandByObject(o); });
      if (box.isEmpty()) box.setFromObject(m);
      const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      const span = Math.max(sz.x / (W / H), sz.y) * 1.02, d = span / 2 / Math.tan(15 * Math.PI / 180);
      pCam.position.set(c.x, c.y + span * 0.08, c.z + d + sz.z / 2); pCam.lookAt(c);
      const prevRT = r.getRenderTarget(), prevCC = r.getClearColor(new THREE.Color()), prevCA = r.getClearAlpha();
      r.setRenderTarget(pRT); r.setClearColor(0x000000, 0); r.clear(); r.render(pScene, pCam);
      const px = new Uint8Array(W * H * 4); r.readRenderTargetPixels(pRT, 0, 0, W, H, px);
      r.setRenderTarget(prevRT); r.setClearColor(prevCC, prevCA);
      pScene.remove(m);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const img = cv.getContext('2d').createImageData(W, H);
      for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); // lật trục y
      cv.getContext('2d').putImageData(img, 0, 0);
      PORTRAITS[id] = cv.toDataURL('image/png');
    } catch (e) { console.warn('[fish portrait ' + id + ']', e); PORTRAITS[id] = null; }
    return PORTRAITS[id];
  }

  // chụp sẵn ảnh chân dung → mở sách cá không khựng. Mỗi ảnh ~25ms (lần đầu có loài tới 400ms vì biên dịch shader):
  // dồn hết vào lúc đang ở màn hình tiêu đề (mode 'menu'); vào chơi rồi thì chụp thưa (400ms/ảnh) cho đỡ giật.
  function prewarmPortraits() {
    const ids = SPECIES.map((s) => s.id).filter((id) => PORTRAITS[id] === undefined);
    (function next() {
      const id = ids.shift(); if (!id) return;
      if (G.paused && G.state.mode !== 'menu') ids.unshift(id); else portrait(id);
      setTimeout(next, G.state.mode === 'menu' ? 16 : 400);
    })();
  }
  if (G.bus) G.bus.on('game:ready', () => setTimeout(prewarmPortraits, 300));

  G.fish = {
    portrait,
    SPECIES, get, init, createModel, createJunkModel, rollCatch, biteChance, populate, lengthFromWeight, weightFromLength,
    getAmbient: () => amb.list, killAmbient, collect, makeCatchInfo: (id, w) => makeFishInfo(id, w), randomWeight: (id) => randomWeight(typeof id === 'string' ? get(id) : id),
    CATEGORY_NAMES: { be: 'Cá bé', thuong: 'Cá thường', to: 'Cá to', khong_lo: 'Cá khổng lồ', quai_vat: 'Quái vật', dot_bien: 'Cá đột biến', meme: 'Cá meme' },
  };
})();
