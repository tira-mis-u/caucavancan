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
      desc: 'Bé xíu, đuôi bảy sắc cầu vồng. Dân chơi cá cảnh trả giá cao.', technique: 'Lưỡi siêu nhỏ, mồi vụn, câu sát mặt nước kênh.', lenK: 0.55, model: mk('minnow', { c: 0xff7a30, b: 0xfff0c0, finC: 0x30a0ff, tail: 'round', tailS: 0.4, dorsal: 'tri', dH: 0.12 }) },
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
      desc: 'Truyền thuyết kể rằng ai câu được nó sẽ thành Vua Câu Cá. Nặng hai vạn cân, vảy vàng phát sáng.', technique: 'Chỉ Cần Vạn Cân Titan + cáp tàu sân bay. Đêm trăng triều cường, mồi uranium hoặc thịt bò.', model: { type: 'legend', r: 0.15, peak: 0.55, blunt: 0.6, w: 0.6, tail: 'flow', dorsal: 'long', dR: [0.5, 0.82], scales: true, whisk: 0.3, c: 0xd4a017, b: 0xfff0a0, finC: 0xe03020, metal: 0.7, rough: 0.25, glow: 0xffaa00, ei: 0.35, crown: true, halo: 0xffcc44 } },

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
      desc: 'Cá mập tiến hóa mọc ra 3 cái chân người. Chạy trên bờ nhanh hơn bạn.', technique: 'Cần thép, mồi gà rán. Kéo lên bờ là nó chạy tới đá bạn bằng 3 chân.', lenK: 0.55, model: mk('shark', { type: 'shark3', c: 0x607488, b: 0xf0f0f0, teeth: true }) },
    { id: 'ca_rong', name: 'Cá rồng', category: 'meme', minW: 50, maxW: 800, behavior: 'fighter', speed: 8, stamina: 90, difficulty: 9, baits: ['bait_glow', 'bait_meat', 'bait_nuke'], envs: ['mountain', 'island'], waterBodies: ['lake', 'sea'], depth: [8, 300], temp: [4, 30], time: 'night', tide: 'any', price: 300000, rarity: 88,
      desc: 'Cá chép vượt vũ môn hóa rồng. Vảy rồng rơi ra quý hơn vàng.', technique: 'Đêm, mồi phát quang, cần thép trở lên. Rồng sẽ lên bờ thử thách bạn.', lenK: 0.7, model: { type: 'dragon', r: 0.055, peak: 0.75, blunt: 0.5, ped: 0.35, w: 0.9, segs: 7, tail: 'flow', dorsal: 'none', anal: false, scales: true, c: 0xd4a017, b: 0xfff1a0, finC: 0xd62020, metal: 0.6, rough: 0.3, glow: 0xff9900, ei: 0.25, halo: 0xffbb33, eyeC: 0xff2020 } },
    { id: 'ca_sau_bay', name: 'Cá sấu bay', category: 'meme', minW: 50, maxW: 400, behavior: 'flying', speed: 8, baits: ['bait_chicken', 'bait_meat', 'bait_jig'], envs: ['airplane'], waterBodies: ['sky'], depth: [0, 2000], temp: [-10, 40], time: 'any', tide: 'any', price: 200000, rarity: 30,
      desc: 'Cá sấu có cánh dơi, săn mồi quanh máy bay ở độ cao 120m.', technique: 'Thả mồi gà rán lơ lửng giữa không trung. Cá bay vòng vòng — nghiêng cần theo hướng nó bay.', lenK: 0.6, model: { type: 'flycroc', c: 0x3e5a2e, b: 0xd8cf8a, wingC: 0x4a2a4a } },
    { id: 'ca_ga', name: 'Cá gà', category: 'meme', minW: 1, maxW: 8, behavior: 'fighter', speed: 5, baits: ['bait_corn', 'bait_chicken', 'bait_bread'], envs: ['forest', 'plains', 'city'], waterBodies: ['pond', 'river'], depth: [0, 3], temp: [15, 36], time: 'day', tide: 'any', price: 120000, rarity: 50,
      desc: 'Nửa cá nửa gà. Sáng nào cũng gáy ò ó o dưới ao.', technique: 'Mồi ngô! Lên bờ là nó mổ bạn túi bụi.', lenK: 0.42, model: mk('carp', { type: 'chicken', r: 0.16, c: 0xb5541c, b: 0xf2e6d0, finC: 0x8a3a10, tail: 'feather', dorsal: 'none', anal: false }) },
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
    return g;
  }
  function shapeGeo(pts, horizontal) {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    const g = new THREE.ShapeGeometry(sh);
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
      if (m.anal !== false) kit.analG = finAlong(m, rf, Math.max(fs + 0.01, 0.47), Math.max(fs + 0.12, 0.6), R * 0.45, 'tri', true);
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
    ctx.bodyMat = bodyMat; ctx.finMat = finMat;
    let parent = inner, prevZ = 0;
    kit.segGeos.forEach((sg, k) => {
      const j = new THREE.Group();
      j.position.z = k === 0 ? 0 : sg.zref - prevZ;
      j.add(new THREE.Mesh(sg.g, bodyMat));
      j.userData.seg = sg;
      parent.add(j); parent = j; prevZ = sg.zref; ctx.joints.push(j);
    });
    const root = ctx.joints[0], last = ctx.joints[ctx.joints.length - 1];
    ctx.root = root; ctx.kit = kit; ctx.last = last; ctx.lastZ = prevZ;
    if (kit.tailG || m.tail === 'feather') {
      const tp = new THREE.Group(); tp.position.z = zt(m, 0) - prevZ;
      if (kit.tailG) tp.add(new THREE.Mesh(kit.tailG, finMat));
      last.add(tp); ctx.tail = tp;
    }
    if (kit.dorsalG) root.add(new THREE.Mesh(kit.dorsalG, finMat));
    if (lite) return ctx;
    if (kit.analG) root.add(new THREE.Mesh(kit.analG, finMat));
    // vây ngực
    const tp = 0.74, zp = zt(m, tp), rp = rf(tp);
    [-1, 1].forEach((s) => {
      const f = new THREE.Mesh(kit.pectG, finMat);
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
    if (m.halo) {
      const h = haloSprite(m.halo, 1.6); root.add(h); ctx.halo = h;
    }
    return ctx;
  }

  // ---------- Các kiểu model ----------
  function legs(parent, ctx, list, skin, shoeC, lenL) {
    // list: [{x,y,z,phase}]
    const sk = M(skin, { rough: 0.7 });
    list.forEach((L) => {
      const p = new THREE.Group(); p.position.set(L.x, L.y, L.z);
      stick(p, V3(0, 0, 0), V3(0, -lenL * 0.5, 0.01), lenL * 0.12, sk);
      const knee = new THREE.Group(); knee.position.set(0, -lenL * 0.5, 0.01); p.add(knee);
      stick(knee, V3(0, 0, 0), V3(0, -lenL * 0.5, -0.01), lenL * 0.1, sk);
      const shoe = sneaker(shoeC); shoe.scale.setScalar(lenL * 0.55); shoe.position.set(0, -lenL * 0.52, lenL * 0.08); knee.add(shoe);
      parent.add(p);
      ctx.legs.push({ p, knee, phase: L.phase || 0 });
    });
  }
  function sneaker(color) {
    const g = new THREE.Group();
    const white = M(0xf8f8f8, { rough: 0.6 }), up = M(color != null ? color : 0xe02030, { rough: 0.55 });
    mesh(g, gBox(), white, 0, 0.06, 0, 0.4, 0.12, 1.0);
    mesh(g, gBox(), up, 0, 0.27, -0.12, 0.36, 0.32, 0.68);
    mesh(g, gBox(), up, 0, 0.19, 0.3, 0.36, 0.18, 0.36);
    mesh(g, gBox(), white, 0, 0.16, 0.46, 0.37, 0.14, 0.1);
    mesh(g, gBox(), M(0x222222), 0, 0.44, -0.3, 0.3, 0.04, 0.3);
    for (let i = 0; i < 3; i++) mesh(g, gBox(), white, 0, 0.36 - i * 0.04, 0.0 + i * 0.1, 0.3, 0.03, 0.04);
    [-1, 1].forEach((s) => { const st = mesh(g, gBox(), white, s * 0.185, 0.25, -0.1, 0.01, 0.05, 0.5); st.rotation.x = 0.35; });
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
    legs(ctx.root, ctx, [
      { x: -0.055, y: -rf(0.55) * 0.75, z: zt(m, 0.55), phase: 0 },
      { x: 0.055, y: -rf(0.55) * 0.75, z: zt(m, 0.55), phase: Math.PI * 2 / 3 },
    ], 0xe2b48c, 0xffffff, L);
    legs(ctx.last, ctx, [{ x: 0, y: -rf(0.3) * 0.75, z: zt(m, 0.3) - ctx.lastZ, phase: Math.PI * 4 / 3 }], 0xe2b48c, 0x2050e0, L * 0.95);
    // quần đùi cho lịch sự
    mesh(ctx.root, gBox(), M(0xff3070, { rough: 0.8 }), 0, -rf(0.55) * 0.7, zt(m, 0.55), 0.16, 0.05, 0.1);
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
    if (ctx.tail) {
      const cols = [0x111111, 0x1b5e20, 0x8a3a10, 0x111111, 0x1b5e20];
      cols.forEach((c, i) => {
        const a = -0.6 + i * 0.3;
        const f = mesh(ctx.tail, gSph(), M(c, { rough: 0.5, metal: 0.2 }), 0, Math.sin(a + 0.5) * 0.09 + 0.05, -0.08 - Math.cos(a) * 0.04, 0.012, 0.03, 0.12);
        f.rotation.x = -0.9 + i * 0.35;
      });
    }
    ctx.chicken = true;
  };
  BUILD.dragon = function (inner, sp, m, ctx, lite) {
    assembleFish(inner, sp.id, m, ctx, lite);
    const rf = ctx.kit.rf, root = ctx.root, w = m.w || 0.9;
    const red = M(0xd62020, { rough: 0.5, em: 0x600000, ei: 0.5, ds: 1 });
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
      const tg = cache('dragonwhisk' + s, () => new THREE.TubeGeometry(curve, 16, 0.004, 4, false));
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
    const mat = M(0xffffff, { vc: 1, rough: 0.7 });
    const root = new THREE.Group(); inner.add(root); ctx.root = root; ctx.joints.push(root);
    mesh(root, g, mat, 0, 0, 0.15, 0.2, 0.06, 0.3);
    const wg = cache('raywing', () => shapeGeo([[0, -0.25], [0.34, 0.02], [0.3, 0.06], [0, 0.18]], true));
    const wm = M(m.c, { ds: 1, rough: 0.7 });
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
    const mat = M(0xffffff, { vc: 1, rough: 0.4, em: 0x300000, ei: 0.4 });
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
    const skin = M(m.c, { rough: 0.75 }), belly = M(m.b, { rough: 0.8 }), dark = M(darker(m.c, 0.55), { rough: 0.9, flat: 1 });
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
  J.junk_undies = (g) => {
    const m = M(0xff3080, { rough: 0.9, ds: 1 });
    const sh = mesh(g, gBox(), m, 0, 0.01, 0.04, 0.26, 0.02, 0.1);
    [-1, 1].forEach((s) => { const l = mesh(g, gBox(), m, s * 0.07, 0.01, -0.04, 0.1, 0.02, 0.12); l.rotation.y = s * 0.5; });
    const dots = [0xffe040, 0x40e0ff, 0xffffff];
    for (let i = 0; i < 8; i++) mesh(g, gSphLo(), M(dots[i % 3]), rand(-0.11, 0.11), 0.022, rand(-0.06, 0.07), 0.012, 0.004, 0.012);
    void sh;
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
    const u = Math.pow(Math.random(), 2.6);
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
      let w = 100 * Math.exp(-sp.rarity / 18);
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
  function spawnFish(near, rad, stunned) {
    if (!amb.pool.length || !amb.group) return null;
    const pt = findWaterPoint(near ? 0.4 : 0.9, near, rad);
    if (!pt) return null;
    const sp = pick(amb.pool);
    let weight = randomWeight(sp);
    let len = lengthFromWeight(sp, weight);
    if (len > 1.3) { len = rand(0.7, 1.3); weight = weightFromLength(sp, len); }
    if (len < 0.18) { len = 0.18; }
    const obj = createModel(sp.id, len, { lite: true });
    const d = safeDepth(pt.x, pt.z);
    const e = {
      obj, speciesId: sp.id, alive: true, radius: Math.max(0.25, len * 0.4), kind: 'fish', state: 'swim',
      h: Math.random() * 6.283, v: rand(0.4, 1.2), baseV: 0, depthOff: rand(0.3, Math.max(0.35, Math.min(d - 0.3, 2.5))),
      turn: 0, turnT: 0, len, weight, vy: 0, deadT: 0, phase: Math.random() * 10, catchInfo: null, checkT: 0,
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
        const lx = p.x + Math.sin(e.h) * 2.2, lz = p.z + Math.cos(e.h) * 2.2;
        if (!waterOK(lx, lz, 0.5)) { e.h += Math.PI * rand(0.6, 1.4); e.turn = -e.turn; }
      }
      if (waterOK(nx, nz, 0.4)) { p.x = nx; p.z = nz; } else e.h += Math.PI * 0.5 * dt * 10;
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

  G.fish = {
    SPECIES, get, init, createModel, createJunkModel, rollCatch, biteChance, populate, lengthFromWeight, weightFromLength,
    getAmbient: () => amb.list, killAmbient, collect, makeCatchInfo: (id, w) => makeFishInfo(id, w), randomWeight: (id) => randomWeight(typeof id === 'string' ? get(id) : id),
    CATEGORY_NAMES: { be: 'Cá bé', thuong: 'Cá thường', to: 'Cá to', khong_lo: 'Cá khổng lồ', quai_vat: 'Quái vật', dot_bien: 'Cá đột biến', meme: 'Cá meme' },
  };
})();
