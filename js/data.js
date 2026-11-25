// data.js — dữ liệu vật phẩm, môi trường, công thức. Loài cá nằm trong fish.js (G.fish.SPECIES)
(function () {
  const G = window.G;
  const D = (G.data = {});

  // ---------- Môi trường ----------
  // waterBody: loại nước chính; baseTemp: nhiệt độ nước trung bình °C; tideAmp: biên độ thủy triều (m)
  // waveAmp: độ cao sóng cơ bản; managedZones: số khu vực bị quản lý; ticket: giá vé để đến (0 = miễn phí)
  D.ENVS = [
    { id: 'forest', name: 'Rừng Già', icon: '🌲', waterBody: 'pond', desc: 'Ao rừng yên tĩnh và con suối nhỏ. Hợp cho người mới.', baseTemp: 24, tideAmp: 0, waveAmp: 0.03, managedZones: 0, ticket: 0, fog: 0.004, sky: 0x88bbdd },
    { id: 'plains', name: 'Đồng Bằng', icon: '🌾', waterBody: 'river', desc: 'Sông lớn uốn quanh cánh đồng lúa. Có khu nuôi cá của hợp tác xã — cấm câu!', baseTemp: 27, tideAmp: 0.3, waveAmp: 0.08, managedZones: 1, ticket: 20000, fog: 0.002, sky: 0x9ccfff },
    { id: 'mountain', name: 'Núi Cao', icon: '🏔️', waterBody: 'lake', desc: 'Hồ trên núi, nước lạnh và sâu thẳm. Đồn rằng có quái vật hồ.', baseTemp: 12, tideAmp: 0, waveAmp: 0.12, managedZones: 1, ticket: 50000, fog: 0.003, sky: 0xa9c8e8 },
    { id: 'city', name: 'Thành Phố', icon: '🏙️', waterBody: 'river', desc: 'Kênh và hồ giữa lòng thành phố. Quản lý đô thị đi tuần liên tục!', baseTemp: 29, tideAmp: 0.2, waveAmp: 0.05, managedZones: 3, ticket: 30000, fog: 0.003, sky: 0xb0b8c8 },
    { id: 'island', name: 'Biển Đảo', icon: '🏝️', waterBody: 'sea', desc: 'Đảo nhiệt đới, biển sâu, thủy triều mạnh. Cá mập và cá khổng lồ.', baseTemp: 26, tideAmp: 1.6, waveAmp: 0.6, managedZones: 1, ticket: 150000, fog: 0.0015, sky: 0x66c4ff },
    { id: 'airplane', name: 'Trên Máy Bay', icon: '✈️', waterBody: 'sky', desc: 'Câu cá từ cửa máy bay ở độ cao 120m. Cá sấu bay sinh sống ở đây.', baseTemp: 20, tideAmp: 1.2, waveAmp: 1.0, managedZones: 1, ticket: 500000, fog: 0.001, sky: 0x7fb8ff },
  ];

  // ---------- Cần câu ----------
  // technique: 'float' (câu phao, chờ), 'spin' (cần máy, cuộn mồi giả), 'vertical' (cần dọc, thả thẳng nhấp), 'horizontal' (cần ngang/câu lục, quăng xa đáy)
  // power: sức kéo (1..1000) | maxWeight kg an toàn | castRange m | sensitivity 0..1 (thấy cá cắn dễ hơn) | reelSpeed m/s
  D.RODS = [
    { id: 'rod_bamboo', name: 'Cần trúc tre', technique: 'float', power: 8, maxWeight: 8, castRange: 18, sensitivity: 0.5, reelSpeed: 2.0, price: 0, color: 0xc8a165, desc: 'Cần tre của ông nội. Câu phao, cá nhỏ.' },
    { id: 'rod_spin', name: 'Cần máy Spin 2m4', technique: 'spin', power: 25, maxWeight: 30, castRange: 45, sensitivity: 0.7, reelSpeed: 4.0, price: 350000, color: 0x223344, desc: 'Cần spinning, quăng xa, cuộn mồi giả. Hợp cá săn mồi.' },
    { id: 'rod_vertical', name: 'Cần dọc Jigging', technique: 'vertical', power: 60, maxWeight: 120, castRange: 10, sensitivity: 0.85, reelSpeed: 3.0, price: 900000, color: 0x8b1a1a, desc: 'Cần dọc thả thẳng đứng từ thuyền/máy bay. Nhấp W/S cho mồi nhảy.' },
    { id: 'rod_horizontal', name: 'Cần ngang câu lục', technique: 'horizontal', power: 45, maxWeight: 80, castRange: 70, sensitivity: 0.6, reelSpeed: 3.5, price: 700000, color: 0x335522, desc: 'Cần ngang quăng siêu xa, mồi nằm đáy. Hợp cá đáy, cá to.' },
    { id: 'rod_carbon', name: 'Cần Carbon Pro', technique: 'spin', power: 120, maxWeight: 400, castRange: 60, sensitivity: 0.9, reelSpeed: 5.0, price: 3500000, color: 0x111111, desc: 'Cần carbon cao cấp cho cá to to.' },
    { id: 'rod_steel', name: 'Cần thép hợp kim', technique: 'horizontal', power: 600, maxWeight: 5000, castRange: 80, sensitivity: 0.7, reelSpeed: 4.0, price: 0, craftOnly: true, color: 0x9aa4b0, desc: 'Rèn từ thép hợp kim. Kéo được cá khổng lồ.' },
    { id: 'rod_titan', name: 'Cần Vạn Cân Titan', technique: 'vertical', power: 2000, maxWeight: 20000, castRange: 100, sensitivity: 1.0, reelSpeed: 6.0, price: 0, craftOnly: true, color: 0xffcc33, desc: 'Huyền thoại. Câu được cá vạn cân, quái vật, đột biến.' },
  ];

  // ---------- Dây câu ----------
  // strength: lực tối đa (cùng thang với power cần) trước khi đứt
  D.LINES = [
    { id: 'line_basic', name: 'Dây cước 0.2', strength: 10, price: 0, desc: 'Dây mỏng, dễ đứt.' },
    { id: 'line_nylon', name: 'Dây nylon 0.5', strength: 35, price: 120000, desc: 'Dây khá chắc.' },
    { id: 'line_braid', name: 'Dây dù PE 8 lõi', strength: 150, price: 600000, desc: 'Dây dù siêu bền.' },
    { id: 'line_steel', name: 'Dây cáp thép', strength: 800, price: 0, craftOnly: true, desc: 'Cáp thép bện tay.' },
    { id: 'line_carrier', name: 'Cáp tàu sân bay', strength: 5000, price: 0, craftOnly: true, desc: 'Cáp hãm tàu sân bay. Không gì đứt nổi.' },
  ];

  // ---------- Mồi ----------
  // forTech: kỹ thuật phù hợp nhất; attract: hệ số hút cá chung
  D.BAITS = [
    { id: 'bait_worm', name: 'Giun đất', icon: '🪱', price: 1000, forTech: ['float', 'horizontal'], attract: 1.0, desc: 'Mồi quốc dân, cá gì cũng ăn.' },
    { id: 'bait_bread', name: 'Bánh mì vụn', icon: '🍞', price: 500, forTech: ['float'], attract: 0.8, desc: 'Cá nhỏ, cá chép thích.' },
    { id: 'bait_corn', name: 'Ngô ngọt', icon: '🌽', price: 800, forTech: ['float', 'horizontal'], attract: 0.9, desc: 'Cá chép, cá trắm mê.' },
    { id: 'bait_shrimp', name: 'Tôm tươi', icon: '🦐', price: 3000, forTech: ['float', 'vertical', 'horizontal'], attract: 1.2, desc: 'Cá biển, cá săn mồi.' },
    { id: 'bait_lure', name: 'Mồi giả thìa', icon: '🥄', price: 15000, reusable: true, forTech: ['spin'], attract: 1.1, desc: 'Mồi giả, dùng mãi. Phải cuộn đều.' },
    { id: 'bait_jig', name: 'Mồi Jig chì', icon: '🎣', price: 25000, reusable: true, forTech: ['vertical'], attract: 1.2, desc: 'Mồi jig cho câu dọc.' },
    { id: 'bait_frog', name: 'Nhái hơi', icon: '🐸', price: 20000, reusable: true, forTech: ['spin'], attract: 1.3, desc: 'Cá lóc, cá sấu khoái.' },
    { id: 'bait_chicken', name: 'Đùi gà rán', icon: '🍗', price: 30000, forTech: ['horizontal', 'vertical'], attract: 1.5, desc: 'Cá mập, cá sấu, cá gà(?) đều thích.' },
    { id: 'bait_pate', name: 'Pate gan', icon: '🥫', price: 8000, forTech: ['float', 'horizontal'], attract: 1.3, desc: 'Lấy từ bánh mì pate. Cá đột biến thích.' },
    { id: 'bait_beer', name: 'Mồi ngâm rượu', icon: '🍺', price: 12000, forTech: ['float', 'horizontal', 'vertical'], attract: 1.4, desc: 'Cá say, cắn liền.' },
    { id: 'bait_glow', name: 'Mồi phát quang', icon: '✨', price: 50000, forTech: ['vertical', 'horizontal'], attract: 1.6, desc: 'Ban đêm cực hiệu quả, hút cá quái vật.' },
    { id: 'bait_meat', name: 'Tảng thịt bò 5kg', icon: '🥩', price: 200000, forTech: ['vertical', 'horizontal'], attract: 2.0, desc: 'Cho cá khổng lồ và quái vật.' },
    { id: 'bait_nuke', name: 'Mồi uranium', icon: '☢️', price: 0, craftOnly: true, forTech: ['vertical', 'horizontal', 'float', 'spin'], attract: 3.0, desc: 'Chế tạo. Hút cá đột biến. Đừng hỏi.' },
  ];

  // ---------- Đồ ăn uống / tiêu hao ----------
  // effect: { hunger, hp, stamina, drunk, wantedReduce }
  D.CONSUMABLES = [
    { id: 'food_banhmi', name: 'Bánh mì pate', icon: '🥖', price: 15000, effect: { hunger: 45, hp: 15, stamina: 20 }, desc: 'Bánh mì pate 15k. Ngon nhất quả đất.' },
    { id: 'food_xoi', name: 'Xôi xéo', icon: '🍚', price: 20000, effect: { hunger: 60, hp: 10, stamina: 25 }, desc: 'No lâu.' },
    { id: 'food_grilledfish', name: 'Cá nướng', icon: '🐟', price: 0, effect: { hunger: 50, hp: 25, stamina: 15 }, desc: 'Tự nướng từ cá câu được.' },
    { id: 'drink_tea', name: 'Trà đá', icon: '🧊', price: 5000, effect: { stamina: 30, drunk: -0.3 }, desc: 'Giải rượu, tỉnh táo.' },
    { id: 'drink_beer', name: 'Bia hơi', icon: '🍺', price: 15000, effect: { stamina: 40, drunk: 0.18 }, desc: 'Thể lực tăng, hơi lâng lâng.' },
    { id: 'drink_ruou', name: 'Rượu đế', icon: '🍶', price: 30000, effect: { stamina: 80, hp: 5, drunk: 0.4 }, desc: 'Mạnh. Thể lực +80, say nặng.' },
    { id: 'drink_ruou_ran', name: 'Rượu rắn ngâm', icon: '🐍', price: 120000, effect: { stamina: 100, hp: 30, drunk: 0.6, strengthBuff: 60 }, desc: 'Tăng sức kéo 60 giây. Say bí tỉ.' },
    { id: 'item_dynamite', name: 'Thuốc nổ (cấm!)', icon: '🧨', price: 0, craftOnly: true, effect: { explode: true }, desc: 'Ném xuống nước: BÙM! Cá nổi lên. Bị quản lý bắt là toi.' },
    { id: 'item_disguise', name: 'Mũ cối ngụy trang', icon: '🪖', price: 80000, effect: { wantedReduce: 1 }, desc: 'Xóa sạch mức truy nã.' },
    { id: 'item_ticket_plane', name: 'Vé máy bay câu cá', icon: '🎫', price: 500000, desc: 'Vé lên máy bay câu cá.' },
  ];

  // ---------- Thuyền ----------
  D.BOATS = [
    { id: 'boat_raft', name: 'Bè chuối', speed: 4, size: 2.5, stability: 0.3, price: 0, craftOnly: true, color: 0xc8b16a, desc: 'Bè ghép từ thân chuối và gỗ.' },
    { id: 'boat_wood', name: 'Thuyền gỗ', speed: 7, size: 4, stability: 0.6, price: 1200000, color: 0x8b5a2b, desc: 'Thuyền gỗ chèo tay.' },
    { id: 'boat_basket', name: 'Thuyền thúng', speed: 3, size: 2, stability: 0.4, price: 300000, color: 0x6b4a2b, desc: 'Thúng chai miền Trung, xoay vòng vòng.' },
    { id: 'boat_motor', name: 'Cano máy', speed: 16, size: 5, stability: 0.8, price: 0, craftOnly: true, color: 0xeeeeee, desc: 'Cano gắn động cơ cũ câu được.' },
    { id: 'boat_ship', name: 'Tàu đánh cá thép', speed: 12, size: 12, stability: 1.0, price: 0, craftOnly: true, color: 0x2255aa, desc: 'Tàu thép lớn. Không sợ cá kéo.' },
  ];

  // ---------- Đồ câu được (rác) ----------
  D.JUNK = [
    { id: 'junk_shoe', name: 'Giày thể thao cũ', icon: '👟', price: 2000, weight: 0.6, rarity: 1, material: 'mat_rubber' },
    { id: 'junk_sandal', name: 'Dép tổ ong', icon: '🩴', price: 1000, weight: 0.2, rarity: 1, material: 'mat_rubber' },
    { id: 'junk_boot', name: 'Ủng cao su', icon: '🥾', price: 3000, weight: 1.2, rarity: 2, material: 'mat_rubber' },
    { id: 'junk_shirt', name: 'Áo phông ướt', icon: '👕', price: 2000, weight: 0.4, rarity: 1, material: 'mat_cloth' },
    { id: 'junk_pants', name: 'Quần bò rách', icon: '👖', price: 3000, weight: 0.9, rarity: 2, material: 'mat_cloth' },
    { id: 'junk_undies', name: 'Quần sịp hoa', icon: '🩲', price: 500, weight: 0.1, rarity: 2, material: 'mat_cloth', desc: 'Của ai đây...' },
    { id: 'junk_bra', name: 'Áo lót bị trôi', icon: '👙', price: 500, weight: 0.1, rarity: 3, material: 'mat_cloth' },
    { id: 'junk_hat', name: 'Nón lá thủng', icon: '👒', price: 1000, weight: 0.3, rarity: 2, material: 'mat_bamboo' },
    { id: 'junk_tire', name: 'Lốp xe máy', icon: '🛞', price: 5000, weight: 4, rarity: 3, material: 'mat_rubber' },
    { id: 'junk_can', name: 'Lon bia', icon: '🥫', price: 200, weight: 0.05, rarity: 1, material: 'mat_scrap' },
    { id: 'junk_bike', name: 'Xe đạp gỉ', icon: '🚲', price: 20000, weight: 15, rarity: 6, material: 'mat_scrap' },
    { id: 'junk_phone', name: 'Điện thoại ngấm nước', icon: '📱', price: 50000, weight: 0.2, rarity: 7, material: 'mat_chip' },
    { id: 'junk_chest', name: 'Rương kho báu', icon: '💰', price: 2000000, weight: 30, rarity: 25 },
  ];

  // ---------- Nguyên liệu chế tạo ----------
  D.MATERIALS = [
    { id: 'mat_wood', name: 'Gỗ trôi', icon: '🪵', price: 3000, weight: 3, rarity: 2 },
    { id: 'mat_bamboo', name: 'Tre', icon: '🎋', price: 2000, weight: 1, rarity: 2 },
    { id: 'mat_rubber', name: 'Cao su', icon: '⚫', price: 2000, weight: 0.5, rarity: 2 },
    { id: 'mat_cloth', name: 'Vải vụn', icon: '🧵', price: 1000, weight: 0.3, rarity: 1 },
    { id: 'mat_rope', name: 'Dây thừng', icon: '🪢', price: 4000, weight: 1, rarity: 3 },
    { id: 'mat_scrap', name: 'Sắt vụn', icon: '🔩', price: 5000, weight: 2, rarity: 3 },
    { id: 'mat_steel', name: 'Tấm thép', icon: '⬜', price: 25000, weight: 8, rarity: 8 },
    { id: 'mat_alloy', name: 'Thỏi hợp kim', icon: '🟨', price: 120000, weight: 5, rarity: 18 },
    { id: 'mat_cable', name: 'Sợi cáp tàu sân bay', icon: '➰', price: 300000, weight: 10, rarity: 30 },
    { id: 'mat_engine', name: 'Động cơ cũ', icon: '⚙️', price: 200000, weight: 40, rarity: 20 },
    { id: 'mat_chip', name: 'Chip điện tử', icon: '💾', price: 40000, weight: 0.1, rarity: 10 },
    { id: 'mat_uranium', name: 'Cục phát sáng xanh', icon: '☢️', price: 500000, weight: 1, rarity: 45 },
    { id: 'mat_scale', name: 'Vảy rồng', icon: '🐉', price: 800000, weight: 0.5, rarity: 60 },
    { id: 'mat_powder', name: 'Thuốc súng ẩm', icon: '🧪', price: 15000, weight: 0.5, rarity: 8 },
  ];

  // ---------- Công thức chế tạo ----------
  // result: id item; kind: 'rod'|'line'|'boat'|'bait'|'consumable'; needs: { itemId: count }; money: phí thợ
  D.RECIPES = [
    { id: 'r_raft', result: 'boat_raft', kind: 'boat', needs: { mat_wood: 6, mat_bamboo: 6, mat_rope: 2 }, money: 0 },
    { id: 'r_motor', result: 'boat_motor', kind: 'boat', needs: { mat_engine: 1, mat_scrap: 10, mat_wood: 8, mat_rubber: 4 }, money: 200000 },
    { id: 'r_ship', result: 'boat_ship', kind: 'boat', needs: { mat_steel: 12, mat_engine: 2, mat_chip: 2, mat_rope: 6 }, money: 1000000 },
    { id: 'r_steel_line', result: 'line_steel', kind: 'line', needs: { mat_scrap: 8, mat_rope: 2 }, money: 50000 },
    { id: 'r_carrier_line', result: 'line_carrier', kind: 'line', needs: { mat_cable: 3, mat_steel: 4 }, money: 500000 },
    { id: 'r_steel_rod', result: 'rod_steel', kind: 'rod', needs: { mat_steel: 4, mat_alloy: 2, mat_rubber: 2 }, money: 300000 },
    { id: 'r_titan_rod', result: 'rod_titan', kind: 'rod', needs: { mat_alloy: 8, mat_scale: 2, mat_chip: 3, mat_cable: 1 }, money: 3000000 },
    { id: 'r_dynamite', result: 'item_dynamite', kind: 'consumable', needs: { mat_powder: 2, mat_cloth: 1 }, money: 0 },
    { id: 'r_nuke_bait', result: 'bait_nuke', kind: 'bait', needs: { mat_uranium: 1, mat_cloth: 2 }, money: 0 },
    { id: 'r_bait_glow', result: 'bait_glow', kind: 'bait', needs: { mat_chip: 1, mat_rubber: 1 }, money: 0, count: 5 },
  ];

  // ---------- Cửa hàng theo NPC ----------
  D.SHOP = {
    shop: ['rod_spin', 'rod_vertical', 'rod_horizontal', 'rod_carbon', 'line_nylon', 'line_braid',
      'bait_worm', 'bait_bread', 'bait_corn', 'bait_shrimp', 'bait_lure', 'bait_jig', 'bait_frog', 'bait_chicken', 'bait_glow', 'bait_meat', 'item_disguise', 'item_ticket_plane'],
    bar: ['drink_tea', 'drink_beer', 'drink_ruou', 'drink_ruou_ran', 'bait_beer'],
    banhmi: ['food_banhmi', 'food_xoi', 'bait_pate'],
    boat: ['boat_basket', 'boat_wood'],
    // thợ rèn: chế tạo theo RECIPES + bán nguyên liệu (cách tiêu tiền cuối game).
    // Vảy rồng và uranium không bán — phải tự câu.
    craft: ['mat_rope', 'mat_scrap', 'mat_rubber', 'mat_steel', 'mat_alloy', 'mat_cable', 'mat_engine', 'mat_chip', 'mat_powder'],
  };

  // ---------- Tra cứu ----------
  const all = {};
  const tag = (arr, type) => arr.forEach((it) => { it.type = type; all[it.id] = it; });
  tag(D.RODS, 'rod'); tag(D.LINES, 'line'); tag(D.BAITS, 'bait'); tag(D.CONSUMABLES, 'consumable');
  tag(D.BOATS, 'boat'); tag(D.JUNK, 'junk'); tag(D.MATERIALS, 'material');
  D.item = (id) => all[id] || null;
  D.env = (id) => D.ENVS.find((e) => e.id === id) || D.ENVS[0];
})();
