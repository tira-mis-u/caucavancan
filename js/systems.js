// systems.js — kinh tế, túi đồ, chế tạo, nhu cầu, NPC, quản lý (warden), luật nhét cá vào quần, lưu/tải
(function () {
  const G = window.G;
  const U = G.util;
  const S = (G.systems = {});

  const SAVE_KEY = 'cauca_save_v1';
  const BAG_CAP = 30;
  const EPIC_CATS = ['khong_lo', 'quai_vat', 'dot_bien'];
  const ILLEGAL_MODES = ['fishing', 'fight', 'shoot'];
  const WARDEN_SPEED = 5.8;       // nhanh hơn đi bộ, chậm hơn chạy
  const WARDEN_PATROL_SPEED = 1.5;

  // ---------- Tiện ích ----------
  const st = () => G.state;
  const D = () => G.data;
  const fmt = (v) => U.fmtMoney(v);
  const toast = (m, t) => { if (G.ui && G.ui.toast) G.ui.toast(m, t || 'info'); else console.log('[toast]', m); };
  const big = (a, b, c) => { if (G.ui && G.ui.bigMessage) G.ui.bigMessage(a, b, c); };
  const sfx = (n, o) => { try { if (G.audio && G.audio.play) G.audio.play(n, o); } catch (e) { /* */ } };
  const emit = (e, d) => G.bus.emit(e, d || {});
  const itemName = (id) => { const it = D().item(id); return it ? it.name : id; };
  const ppos = () => (G.player && G.player.pos) || null;
  const isAir = () => st().env === 'airplane';

  function dialog(name, text, options) {
    if (G.ui && G.ui.dialog) G.ui.dialog(name, text, options || [{ label: 'Tạm biệt', action: () => {} }]);
    else toast(name + ': ' + text);
  }
  // mở dialog lồng nhau sau khi dialog cũ đóng
  const later = (fn, ms) => setTimeout(fn, ms == null ? 60 : ms);

  // ======================================================================
  // 1. KINH TẾ & TÚI ĐỒ
  // ======================================================================
  function ensureState() {
    const s = st();
    s.inventory = s.inventory || {};
    s.fishBag = s.fishBag || [];
    s.ownedRods = s.ownedRods || ['rod_bamboo'];
    s.ownedLines = s.ownedLines || ['line_basic'];
    s.ownedBoats = s.ownedBoats || [];
    if (!s.ownedRods.includes('rod_bamboo')) s.ownedRods.unshift('rod_bamboo');
    if (!s.ownedLines.includes('line_basic')) s.ownedLines.unshift('line_basic');
    s.stats = Object.assign({ caught: 0, biggest: 0, junk: 0, explosions: 0, pantsAttempts: 0 }, s.stats || {});
    s.discovered = s.discovered || {};
    s.wearing = s.wearing || {};
    s.equipped = s.equipped || { rod: 'rod_bamboo', line: 'line_basic', bait: 'bait_worm' };
  }

  function listFor(type) {
    const s = st();
    return type === 'rod' ? s.ownedRods : type === 'line' ? s.ownedLines : type === 'boat' ? s.ownedBoats : null;
  }

  S.count = function (id) {
    const it = D().item(id);
    const list = it && listFor(it.type);
    if (list) return list.includes(id) ? 1 : 0;
    return st().inventory[id] || 0;
  };
  S.has = function (id, n) { return S.count(id) >= (n == null ? 1 : n); };
  S.addItem = function (id, n) {
    n = n == null ? 1 : n;
    if (n <= 0) return;
    const it = D().item(id);
    const list = it && listFor(it.type);
    if (list) { if (!list.includes(id)) list.push(id); }
    else st().inventory[id] = (st().inventory[id] || 0) + n;
    emit('inventory:changed', { id });
  };
  S.removeItem = function (id, n) {
    n = n == null ? 1 : n;
    const it = D().item(id);
    const list = it && listFor(it.type);
    if (list) {
      const i = list.indexOf(id);
      if (i < 0) return false;
      list.splice(i, 1);
    } else {
      const inv = st().inventory;
      if ((inv[id] || 0) < n) return false;
      inv[id] -= n;
      if (inv[id] <= 0) delete inv[id];
    }
    emit('inventory:changed', { id });
    return true;
  };

  S.buy = function (id, n) {
    n = Math.max(1, (n | 0) || 1);
    const it = D().item(id);
    if (!it) return false;
    if (it.craftOnly) { toast('Món này không bán, phải nhờ thợ rèn chế tạo!', 'warn'); return false; }
    const unique = it.type === 'rod' || it.type === 'line' || it.type === 'boat';
    if (unique) {
      n = 1;
      if (S.has(id)) { toast('Bạn đã có ' + it.name + ' rồi, mua nữa để làm cảnh à?', 'warn'); return false; }
    }
    const cost = (it.price || 0) * n;
    if (st().money < cost) {
      toast('Không đủ tiền! Cần ' + fmt(cost) + ' mà túi chỉ có ' + fmt(st().money) + '.', 'bad');
      sfx('fail');
      return false;
    }
    st().money -= cost;
    S.addItem(id, n);
    sfx('coin');
    toast('Đã mua ' + it.name + (n > 1 ? ' ×' + n : '') + ' (−' + fmt(cost) + ')', 'good');
    if (it.type === 'rod') toast('Mở túi đồ (Tab) để đổi sang ' + it.name + '.', 'info');
    if (it.type === 'boat') toast('Ra bờ nước rồi nói chuyện với anh cho thuê thuyền để lên ' + it.name + '.', 'info');
    emit('money:changed', {});
    return true;
  };

  // Trang bị cần/dây/mồi (UI có thể gọi)
  S.equip = function (id) {
    const it = D().item(id);
    if (!it || !S.has(id)) { toast('Bạn chưa có món này.', 'warn'); return false; }
    const s = st();
    if (it.type === 'rod') { if (G.fishing && G.fishing.setRod) G.fishing.setRod(id); else s.equipped.rod = id; }
    else if (it.type === 'line') s.equipped.line = id;
    else if (it.type === 'bait') { if (G.fishing && G.fishing.setBait) G.fishing.setBait(id); else s.equipped.bait = id; }
    else return false;
    toast('Đã trang bị ' + it.name + '.', 'info');
    return true;
  };

  function fishValue(f) {
    if (!f) return 0;
    if (f.value) return Math.round(f.value);
    const sp = G.fish && G.fish.get ? G.fish.get(f.speciesId) : null;
    return Math.round((f.weight || 0) * ((sp && sp.price) || 10000));
  }
  S.fishValue = fishValue;
  S.bagValue = function () { return st().fishBag.reduce((a, f) => a + fishValue(f), 0); };

  S.sell = function (index) {
    const bag = st().fishBag;
    const f = bag[index];
    if (!f) return 0;
    bag.splice(index, 1);
    const v = fishValue(f);
    st().money += v;
    sfx('coin');
    toast('Bán ' + f.name + ' (' + U.fmtWeight(f.weight || 0) + ') được ' + fmt(v), 'good');
    emit('money:changed', {}); emit('inventory:changed', {});
    return v;
  };
  S.sellAll = function () {
    const bag = st().fishBag;
    if (!bag.length) { toast('Túi không có con cá nào. Bán không khí à?', 'warn'); return 0; }
    const n = bag.length;
    const v = S.bagValue();
    bag.length = 0;
    st().money += v;
    sfx('coin');
    toast('Bán ' + n + ' con cá được ' + fmt(v) + '! Giàu rồi!', 'good');
    emit('money:changed', {}); emit('inventory:changed', {});
    return v;
  };
  // Bán 1 loại rác/nguyên liệu
  // Bán toàn bộ rác (và nguyên liệu nếu includeMaterials)
  S.sellJunk = function (includeMaterials) {
    const inv = st().inventory;
    let total = 0, n = 0;
    Object.keys(inv).forEach((id) => {
      const it = D().item(id);
      if (!it) return;
      if (it.type === 'junk' || (includeMaterials && it.type === 'material')) {
        total += (it.price || 0) * inv[id]; n += inv[id];
        delete inv[id];
      }
    });
    if (!n) { toast('Không có đồ nhặt được để bán.', 'warn'); return 0; }
    st().money += total;
    sfx('coin');
    toast('Bán ' + n + ' món đồ nhặt được: +' + fmt(total), 'good');
    emit('money:changed', {}); emit('inventory:changed', {});
    return total;
  };

  // ---------- Chế tạo ----------
  const recipe = (rid) => D().RECIPES.find((r) => r.id === rid) || null;
  S.craftMissing = function (rid) {
    const r = recipe(rid);
    if (!r) return [];
    const out = [];
    for (const k in r.needs) {
      const have = S.count(k);
      if (have < r.needs[k]) out.push({ id: k, name: itemName(k), have, need: r.needs[k] });
    }
    return out;
  };
  S.canCraft = function (rid) {
    const r = recipe(rid);
    if (!r) return false;
    const res = D().item(r.result);
    if (res && listFor(res.type) && S.has(r.result)) return false;
    if (S.craftMissing(rid).length) return false;
    return st().money >= (r.money || 0);
  };
  S.craft = function (rid) {
    const r = recipe(rid);
    if (!r) return false;
    const res = D().item(r.result);
    if (res && listFor(res.type) && S.has(r.result)) { toast('Bạn đã có ' + res.name + ' rồi!', 'warn'); return false; }
    const miss = S.craftMissing(rid);
    if (miss.length) {
      toast('Thiếu: ' + miss.map((m) => m.name + ' ' + m.have + '/' + m.need).join(', '), 'bad');
      sfx('fail');
      return false;
    }
    if (st().money < (r.money || 0)) { toast('Không đủ tiền công thợ (' + fmt(r.money) + ').', 'bad'); sfx('fail'); return false; }
    for (const k in r.needs) S.removeItem(k, r.needs[k]);
    st().money -= r.money || 0;
    const cnt = r.count || 1;
    S.addItem(r.result, cnt);
    sfx('hit'); later(() => sfx('coin'), 250);
    toast('Chế tạo thành công: ' + (res ? res.name : r.result) + (cnt > 1 ? ' ×' + cnt : '') + '! Keng keng!', 'epic');
    if (G.fx && G.fx.sparkle && ppos()) G.fx.sparkle(ppos().clone().add(new THREE.Vector3(0, 1.5, 0)), 0xffcc33);
    emit('item:crafted', { id: r.result });
    emit('money:changed', {});
    return true;
  };

  // ---------- Dùng đồ ----------
  const USE_MSG = {
    food_banhmi: ['Bánh mì pate 15k — giòn rụm, ngon hơn người yêu cũ!', 'Măm măm... pate béo ngậy!'],
    food_xoi: ['Xôi xéo dẻo thơm, no tới chiều.'],
    food_grilledfish: ['Cá nướng thơm lừng, thành quả lao động!'],
    drink_tea: ['Trà đá mát lạnh, tỉnh cả người.'],
    drink_beer: ['Dô dô dô! 1, 2, 3 dô!', 'Bia hơi mát lạnh, lâng lâng nhẹ.'],
    drink_ruou: ['Rượu đế cay xè! Mặt đỏ như gấc.'],
    drink_ruou_ran: ['Rượu rắn! Sức mạnh dâng trào (và cả cơn say)!'],
    item_disguise: ['Đội mũ cối vào... quản lý không nhận ra bạn nữa!'],
  };
  S.use = function (id) {
    const it = D().item(id);
    const s = st();
    if (!it || it.type !== 'consumable' || !it.effect) { toast('Món này không dùng được.', 'warn'); return false; }
    if (S.count(id) < 1) { toast('Hết ' + it.name + ' rồi!', 'warn'); return false; }
    if (s.mode === 'menu' || s.mode === 'dead') return false;
    const e = it.effect;
    if (e.explode) {
      if (!(G.fishing && G.fishing.throwDynamite)) { toast('Không ném được lúc này!', 'warn'); return false; }
      const r = G.fishing.throwDynamite();
      if (r === false) return false;
      S.removeItem(id, 1);
      s.stats.explosions = (s.stats.explosions || 0) + 1;
      emit('item:used', { id });
      return true;
    }
    S.removeItem(id, 1);
    if (e.hunger) s.hunger = U.clamp(s.hunger + e.hunger, 0, 100);
    if (e.hp) s.hp = U.clamp(s.hp + e.hp, 0, 100);
    if (e.stamina) s.stamina = U.clamp(s.stamina + e.stamina, 0, 100);
    if (e.drunk) s.drunk = U.clamp(s.drunk + e.drunk, 0, 1);
    if (e.strengthBuff) s.buffs = Object.assign(s.buffs || {}, { strength: e.strengthBuff, time: 60 });
    if (e.wantedReduce) {
      s.wanted = Math.max(0, s.wanted - e.wantedReduce);
      if (chase) endChase('disguise');
    }
    const drink = id.indexOf('drink_') === 0;
    const food = id.indexOf('food_') === 0;
    if (G.player && G.player.setAnim && (drink || food)) G.player.setAnim(drink ? 'drink' : 'eat', 1.5);
    if (drink) {
      sfx('drink');
      if (e.drunk > 0 || Math.random() < 0.3) later(() => sfx('burp'), 1300);
    } else if (food) {
      sfx('eat');
      if (Math.random() < 0.35) later(() => sfx('burp'), 1500);
    }
    const msgs = USE_MSG[id];
    toast(msgs ? U.pick(msgs) : 'Đã dùng ' + it.name + '.', 'good');
    if (s.drunk >= 0.95) toast('Bạn say bí tỉ... thế giới quay vòng vòng.', 'warn');
    emit('item:used', { id });
    return true;
  };

  S.cookFish = function (index) {
    const bag = st().fishBag;
    index = index == null ? 0 : index;
    const f = bag[index];
    if (!f) { toast('Không có cá để nướng.', 'warn'); return false; }
    bag.splice(index, 1);
    const n = U.clamp(Math.ceil((f.weight || 0.5) / 5), 1, 10);
    S.addItem('food_grilledfish', n);
    sfx('eat');
    toast('Nướng ' + f.name + ' → ' + n + ' phần cá nướng thơm phức!', 'good');
    emit('inventory:changed', {});
    return true;
  };
  S.cook = (i) => S.cookFish(i);

  // ---- Mặc đồ câu được (giày, dép, áo, quần, sịp, nón...) ----
  const SLOT_NAMES = { head: 'đầu', body: 'áo', legs: 'quần', feet: 'chân', undies: 'sịp', chest: 'ngực' };
  S.wear = function (id) {
    const it = D().item(id), s = st();
    if (!it || !it.wear) return false;
    if (!S.has(id)) { toast('Không có ' + it.name + ' để mặc.', 'warn'); return false; }
    const old = s.wearing[it.wear];
    if (old) S.addItem(old, 1);
    S.removeItem(id, 1);
    s.wearing[it.wear] = id;
    toast('Đã mặc ' + it.name + (it.wear === 'undies' ? ' — ra ngoài quần, chuẩn siêu nhân!' : '!'), 'good');
    emit('outfit:changed', {}); emit('inventory:changed', {});
    return true;
  };
  S.unwear = function (slot) {
    const s = st(), id = s.wearing[slot];
    if (!id) return false;
    delete s.wearing[slot];
    S.addItem(id, 1);
    toast('Đã cởi ' + itemName(id) + ' (' + (SLOT_NAMES[slot] || slot) + ').', 'info');
    emit('outfit:changed', {}); emit('inventory:changed', {});
    return true;
  };

  S.travel = function (envId) {
    const env = D().ENVS.find((e) => e.id === envId);
    const s = st();
    if (!env) return false;
    if (s.env === envId && G.world && G.world.current && G.world.current.id === envId) { toast('Bạn đang ở ' + env.name + ' rồi.', 'info'); return false; }
    if (chase) { toast('Đang bị quản lý đuổi, đi đâu mà đi! Cắt đuôi trước đã!', 'bad'); return false; }
    if (envId === 'airplane') {
      if (!S.has('item_ticket_plane')) { toast('Cần Vé máy bay câu cá! Mua ở chú bán đồ câu.', 'bad'); sfx('fail'); return false; }
      S.removeItem('item_ticket_plane', 1);
    } else if (env.ticket > 0) {
      if (s.money < env.ticket) { toast('Không đủ tiền vé (' + fmt(env.ticket) + ').', 'bad'); sfx('fail'); return false; }
      s.money -= env.ticket;
      sfx('coin');
    }
    if (s.onBoat && G.player && G.player.leaveBoat) G.player.leaveBoat();
    if (ILLEGAL_MODES.indexOf(s.mode) >= 0 || s.mode === 'combat' || s.mode === 'swim') G.setMode('explore');
    s.env = envId;
    const arrive = () => {
      toast('Đã đến ' + env.name + (env.ticket ? ' (vé ' + fmt(env.ticket) + ')' : '') + '!', 'good');
      S.save();
    };
    // có lớp phủ "Đang tới…" để lúc dựng map không trông như bị treo
    if (G.withLoading) G.withLoading('Đang tới ' + env.name + '…', () => G.world.loadEnvironment(envId)).then(arrive);
    else { G.world.loadEnvironment(envId); arrive(); }
    return true;
  };

  S.boardOwnedBoat = function (boatId) {
    if (!S.has(boatId)) { toast('Bạn chưa có ' + itemName(boatId) + '.', 'warn'); return false; }
    if (isAir()) { toast('Trên máy bay mà đòi chèo thuyền?', 'warn'); return false; }
    if (!(G.player && G.player.boardBoat)) return false;
    const r = G.player.boardBoat(boatId);
    if (r !== false) toast('Lên ' + itemName(boatId) + '! WASD để lái.', 'good');
    return r !== false;
  };

  // ======================================================================
  // 2. CÁ CÂU ĐƯỢC
  // ======================================================================
  function onCaught(data) {
    const c = data && data.catchInfo;
    if (!c) return;
    const s = st();
    ensureState();
    if (c.kind === 'fish') {
      const sp = c.species || (G.fish && G.fish.get ? G.fish.get(c.id) : null) || {};
      const cat = c.category || sp.category || '';
      const isNew = !s.discovered[c.id];
      c.isNew = isNew; // ui.js đọc để hiện thông báo lớn
      s.discovered[c.id] = true;
      s.stats.caught++;
      if ((c.weight || 0) > s.stats.biggest) s.stats.biggest = c.weight || 0;
      const value = c.value != null ? Math.round(c.value) : Math.round((c.weight || 0) * (sp.price || 10000));
      if (s.fishBag.length >= BAG_CAP) {
        toast('Túi đầy, đi bán cá đi! (' + c.name + ' đã được thả về)', 'warn');
      } else {
        s.fishBag.push({ speciesId: c.id, id: c.id, name: c.name, weight: c.weight || 0, value, category: cat });
        const epic = EPIC_CATS.indexOf(cat) >= 0;
        toast('Câu được ' + c.name + ' ' + U.fmtWeight(c.weight || 0) + ' (' + fmt(value) + ') → vào giỏ cá ' + s.fishBag.length + '/' + BAG_CAP + ' · phím Tab', epic ? 'epic' : 'good');
        if (s.fishBag.length >= BAG_CAP) toast('Túi đầy, đi bán cá đi!', 'warn');
      }
    } else if (c.kind === 'junk' || c.kind === 'material') {
      S.addItem(c.id, 1);
      if (c.kind === 'junk') s.stats.junk++;
      const it = D().item(c.id);
      const funny = c.kind === 'junk' ? U.pick(['Lại rác...', 'Ai vứt cái này xuống đây?', 'Câu cá ra ' + (it ? it.name.toLowerCase() : 'rác') + '. Tuyệt.', 'Bảo vệ môi trường +1!']) : 'Nguyên liệu chế tạo!';
      toast('Kéo lên: ' + (c.name || itemName(c.id)) + '. ' + funny + ' → cất vào túi đồ · phím Tab' + (it && it.wear ? ' (mặc được!)' : ''), c.id === 'junk_chest' ? 'epic' : 'info');
    }
    if (c.bonusItems && c.bonusItems.length) {
      c.bonusItems.forEach((b) => {
        const id = typeof b === 'string' ? b : b.id;
        const n = typeof b === 'string' ? 1 : (b.n || b.count || 1);
        if (!id) return;
        S.addItem(id, n);
        toast('Kèm theo: ' + itemName(id) + (n > 1 ? ' ×' + n : '') + '!', 'good');
      });
    }
    emit('inventory:changed', {});
  }

  // ======================================================================
  // 3. NHU CẦU
  // ======================================================================
  let faintTimer = 0;
  function updateNeeds(dt) {
    const s = st();
    if (s.mode === 'menu' || dt <= 0) return;
    if (faintTimer > 0) {
      faintTimer -= dt;
      if (faintTimer <= 0) respawnAfterFaint();
      return;
    }
    s.hunger = U.clamp(s.hunger - dt / 20, 0, 100);
    const k = G.input.keys;
    const moving = k.KeyW || k.KeyA || k.KeyS || k.KeyD;
    const running = (k.ShiftLeft || k.ShiftRight) && moving && !G.input.blocked;
    const resting = !running && ['fight', 'combat', 'swim', 'dead'].indexOf(s.mode) < 0;
    if (resting) s.stamina = U.clamp(s.stamina + (moving ? 5 : 9) * dt, 0, 100);
    s.drunk = U.clamp(s.drunk - 0.01 * dt, 0, 1);
    if (s.hunger <= 0) s.hp = U.clamp(s.hp - dt, 0, 100);
    else if (s.hunger > 60 && s.hp < 100) s.hp = U.clamp(s.hp + 0.15 * dt, 0, 100);
    if (s.buffs && s.buffs.time > 0) {
      s.buffs.time -= dt;
      if (s.buffs.time <= 0) { s.buffs = {}; toast('Hết tác dụng rượu rắn. Tay lại yếu như cọng bún.', 'info'); }
    }
    if (s.hp <= 0) faint();
  }
  function faint() {
    const s = st();
    faintTimer = 2.5;
    if (chase) endChase('silent');
    big('Bạn ngất xỉu!', s.hunger <= 0 ? 'Đói quá... lần sau nhớ ăn bánh mì pate!' : 'Tỉnh dậy ở bờ, ví nhẹ đi một chút...', '#ff5555');
    sfx('fail');
    if (G.player) G.player.locked = false;
    if (s.onBoat && G.player && G.player.leaveBoat) G.player.leaveBoat();
    G.setMode('dead');
  }
  function respawnAfterFaint() {
    const s = st();
    const lost = Math.round(s.money * 0.1);
    s.money -= lost;
    s.hp = 50;
    s.hunger = Math.max(s.hunger, 35);
    s.stamina = Math.max(s.stamina, 50);
    s.drunk = 0;
    toSpawn();
    G.setMode('explore');
    if (lost > 0) toast('Mất ' + fmt(lost) + ' tiền thuốc men. Có người tốt bụng... lấy hộ tiền.', 'bad');
  }
  function toSpawn() {
    if (!(G.world && G.world.getSpawn && G.player && G.player.teleport)) return;
    const sp = G.world.getSpawn();
    if (sp) G.player.teleport(sp.clone ? sp.clone() : sp);
  }

  // ======================================================================
  // ĐỒ HỌA NHÂN VẬT (low-poly)
  // ======================================================================
  const M = (color, o) => new THREE.MeshLambertMaterial(Object.assign({ color }, o || {}));
  function mesh(geo, mat, x, y, z, parent, shadow) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = shadow !== false;
    if (parent) parent.add(m);
    return m;
  }
  const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const Cyl = (a, b, h, s) => new THREE.CylinderGeometry(a, b, h, s || 8);
  const Sph = (r, w, h) => new THREE.SphereGeometry(r, w || 10, h || 8);

  function makePerson(o) {
    o = Object.assign({ skin: 0xe0b08a, shirt: 0x3366aa, pants: 0x333333, shoes: 0x222222, hair: 0x1a1a1a, hat: null, hatColor: 0x2d5a27, skirt: false, belly: 0, beard: false, bald: false, apron: null, sleeves: true, scarf: null }, o);
    const g = new THREE.Group();
    const skin = M(o.skin), shirt = M(o.shirt), pants = M(o.pants), shoes = M(o.shoes), hair = M(o.hair);
    // chân
    const legGeo = Cyl(0.085, 0.075, 0.78); legGeo.translate(0, -0.39, 0);
    const shoeGeo = Box(0.13, 0.08, 0.26);
    const mkLeg = (x) => {
      const p = new THREE.Group(); p.position.set(x, 0.86, 0); g.add(p);
      mesh(legGeo, pants, 0, 0, 0, p); mesh(shoeGeo, shoes, 0, -0.8, 0.05, p);
      return p;
    };
    const legL = mkLeg(0.1), legR = mkLeg(-0.1);
    mesh(Cyl(0.2, 0.21, 0.18, 10), pants, 0, 0.9, 0, g);
    const torso = mesh(Cyl(0.21, 0.2, 0.56, 10), shirt, 0, 1.25, 0, g);
    if (o.belly) mesh(Sph(0.18 + 0.06 * o.belly, 10, 8), shirt, 0, 1.12, 0.08 + 0.05 * o.belly, g);
    if (o.skirt) mesh(Cyl(0.21, 0.34, 0.5, 12), pants, 0, 0.72, 0, g);
    if (o.apron) mesh(Box(0.34, 0.62, 0.02), M(o.apron), 0, 1.02, 0.215 + (o.belly ? 0.08 : 0), g);
    if (o.scarf) { const sc = mesh(new THREE.TorusGeometry(0.085, 0.03, 6, 12), M(o.scarf), 0, 1.53, 0, g); sc.rotation.x = Math.PI / 2; }
    mesh(Cyl(0.06, 0.07, 0.1), skin, 0, 1.57, 0, g);
    // đầu
    const head = new THREE.Group(); head.position.set(0, 1.74, 0); g.add(head);
    mesh(Sph(0.15, 14, 12), skin, 0, 0, 0, head);
    const eyeM = M(0x111111);
    mesh(Sph(0.022, 6, 6), eyeM, 0.055, 0.02, 0.135, head, false);
    mesh(Sph(0.022, 6, 6), eyeM, -0.055, 0.02, 0.135, head, false);
    mesh(Box(0.035, 0.05, 0.04), skin, 0, -0.025, 0.15, head, false);
    mesh(Box(0.07, 0.012, 0.01), M(0x8a3b2b), 0, -0.075, 0.138, head, false);
    if (!o.bald) mesh(new THREE.SphereGeometry(0.158, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.012, -0.012, head);
    else { mesh(Sph(0.05, 6, 6), hair, 0.14, -0.01, -0.03, head); mesh(Sph(0.05, 6, 6), hair, -0.14, -0.01, -0.03, head); }
    if (o.beard) { const b = mesh(new THREE.ConeGeometry(0.08, 0.22, 8), M(0xeeeeee), 0, -0.17, 0.09, head); b.rotation.x = Math.PI + 0.25; }
    const hc = M(o.hatColor);
    if (o.hat === 'non_la') mesh(new THREE.ConeGeometry(0.38, 0.24, 18), hc, 0, 0.16, 0, head);
    else if (o.hat === 'cap') { mesh(Cyl(0.155, 0.16, 0.1, 12), hc, 0, 0.1, 0, head); mesh(Box(0.22, 0.015, 0.15), hc, 0, 0.06, 0.17, head); }
    else if (o.hat === 'warden') {
      mesh(Cyl(0.165, 0.16, 0.12, 12), hc, 0, 0.12, 0, head);
      mesh(Cyl(0.2, 0.17, 0.05, 12), hc, 0, 0.2, 0.01, head);
      mesh(Box(0.24, 0.015, 0.14), M(0x222222), 0, 0.07, 0.17, head);
      mesh(new THREE.CircleGeometry(0.035, 10), M(0xffcc33, { side: THREE.DoubleSide }), 0, 0.15, 0.168, head, false);
    } else if (o.hat === 'bun') mesh(Sph(0.075, 8, 8), hair, 0, 0.06, -0.15, head);
    else if (o.hat === 'attendant') {
      mesh(Sph(0.075, 8, 8), hair, 0, 0.04, -0.15, head);
      const h = mesh(Cyl(0.1, 0.11, 0.07, 12), hc, 0.03, 0.15, 0.02, head); h.rotation.z = -0.2;
    } else if (o.hat === 'bandana') mesh(Cyl(0.162, 0.162, 0.08, 12), hc, 0, 0.06, 0, head);
    // tay
    const upGeo = Cyl(0.07, 0.062, 0.32); upGeo.translate(0, -0.16, 0);
    const loGeo = Cyl(0.06, 0.052, 0.3); loGeo.translate(0, -0.47, 0);
    const handGeo = Sph(0.055, 8, 6);
    const mkArm = (x) => {
      const p = new THREE.Group(); p.position.set(x, 1.48, 0); g.add(p);
      mesh(upGeo, o.sleeves ? shirt : skin, 0, 0, 0, p);
      mesh(loGeo, o.sleeves === 'long' ? shirt : skin, 0, 0, 0, p);
      mesh(handGeo, skin, 0, -0.65, 0, p);
      const hand = new THREE.Group(); hand.position.set(0, -0.66, 0.02); p.add(hand);
      p.rotation.z = x > 0 ? 0.08 : -0.08;
      return { p, hand };
    };
    const aL = mkArm(0.27), aR = mkArm(-0.27);
    g.userData.parts = { legL, legR, armL: aL.p, armR: aR.p, handL: aL.hand, handR: aR.hand, head, torso };
    return g;
  }

  // gộp mesh tĩnh của từng bộ phận cứng (thân, đầu, mỗi tay/chân): ~35 → ~15 draw call mỗi người
  function mergePerson(p) {
    const P = p.userData.parts; if (!P || !U.mergeStatic) return;
    U.mergeStatic(p, [P.legL, P.legR, P.armL, P.armR, P.head, P.torso]);
    [P.legL, P.legR, P.armL, P.armR, P.head].forEach((g) => U.mergeStatic(g));
  }
  function animatePerson(p, t, phase, speed) {
    const P = p.userData.parts;
    if (!P) return;
    const moving = speed > 0.15;
    const amp = moving ? Math.min(0.75, 0.22 * speed + 0.15) : 0;
    const sw = Math.sin(t * (2.2 + speed * 1.3) + phase) * amp;
    P.legL.rotation.x = sw; P.legR.rotation.x = -sw;
    P.armL.rotation.x = -sw * 0.8; P.armR.rotation.x = sw * 0.8;
    P.torso.scale.y = 1 + Math.sin(t * 2 + phase) * 0.012;
    P.head.rotation.y = moving ? 0 : Math.sin(t * 0.5 + phase) * 0.25;
  }

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }
  function makeSign(text, w, h, bg, fg) {
    const pw = 512, ph = Math.round(512 * h / w);
    const tex = canvasTex(pw, ph, (x) => {
      x.fillStyle = bg || '#c0392b'; x.fillRect(0, 0, pw, ph);
      x.strokeStyle = '#ffffff'; x.lineWidth = 10; x.strokeRect(8, 8, pw - 16, ph - 16);
      let fs = Math.floor(ph * 0.55);
      x.font = G.util.font(800, fs, true);
      while (x.measureText(text).width > pw - 40 && fs > 10) { fs -= 2; x.font = G.util.font(800, fs, true); }
      x.fillStyle = fg || '#ffee55'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(text, pw / 2, ph / 2 + 2);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    return m;
  }
  function makeLabel(text, color) {
    const tex = canvasTex(512, 96, (x) => {
      x.font = G.util.font(800, 40, true);
      const tw = Math.min(500, x.measureText(text).width + 40);
      x.fillStyle = 'rgba(0,0,0,0.55)';
      const x0 = (512 - tw) / 2;
      if (x.roundRect) { x.beginPath(); x.roundRect(x0, 14, tw, 68, 20); x.fill(); } else x.fillRect(x0, 14, tw, 68);
      x.fillStyle = color || '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(text, 256, 50);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    sp.scale.set(2.6, 0.49, 1);
    sp.position.y = 2.3;
    sp.renderOrder = 5;
    return sp;
  }
  const tmpLbl = new THREE.Vector3();
  function makeMarker(ch, color) {
    const tex = canvasTex(128, 128, (x) => {
      x.font = G.util.font(800, 110, true); x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 10; x.strokeStyle = '#000'; x.strokeText(ch, 64, 70);
      x.fillStyle = color; x.fillText(ch, 64, 70);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(0.8, 0.8, 1);
    sp.position.y = 2.75;
    sp.visible = false;
    sp.renderOrder = 10;
    return sp;
  }

  // ---------- Đạo cụ ----------
  function legsTable(parent, x, y, z, w, d, color) {
    const m = M(color || 0x7a5230);
    mesh(Box(w, 0.06, d), m, x, y, z, parent);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => mesh(Box(0.06, y, 0.06), m, x + a * (w / 2 - 0.05), y / 2, z + b * (d / 2 - 0.05), parent));
  }
  function signOnPosts(parent, text, x, y, z, w, h, bg, fg) {
    const sg = makeSign(text, w, h, bg, fg); sg.position.set(x, y, z); parent.add(sg);
    const pm = M(0x5a3a20);
    mesh(Cyl(0.04, 0.04, y + h / 2), pm, x - w / 2 + 0.05, (y + h / 2) / 2, z - 0.03, parent);
    mesh(Cyl(0.04, 0.04, y + h / 2), pm, x + w / 2 - 0.05, (y + h / 2) / 2, z - 0.03, parent);
    return sg;
  }
  const PROPS = {
    shop(root, person) {
      const wood = M(0x6b4423);
      const rack = new THREE.Group(); rack.position.set(-0.2, 0, -1.2); root.add(rack);
      mesh(Box(0.08, 1.9, 0.08), wood, -0.85, 0.95, 0, rack); mesh(Box(0.08, 1.9, 0.08), wood, 0.85, 0.95, 0, rack);
      mesh(Box(1.8, 0.06, 0.1), wood, 0, 0.35, 0.05, rack); mesh(Box(1.8, 0.06, 0.1), wood, 0, 1.65, 0.05, rack);
      const cols = [0x223344, 0x8b1a1a, 0x335522, 0x111111, 0xc8a165, 0xffcc33, 0x5555aa];
      cols.forEach((c, i) => {
        const x = -0.7 + i * 0.23;
        const r = mesh(Cyl(0.01, 0.022, 2.3, 6), M(c), x, 1.15, 0.12, rack); r.rotation.z = (i % 2 ? 0.05 : -0.05);
        const reel = mesh(Cyl(0.05, 0.05, 0.05, 10), M(0x999999), x, 0.55, 0.18, rack); reel.rotation.z = Math.PI / 2;
      });
      legsTable(root, 1.4, 0.75, -0.3, 1.1, 0.6);
      [0xdd3333, 0x33aa55, 0x3366dd].forEach((c, i) => mesh(Box(0.25, 0.14, 0.18), M(c), 1.1 + i * 0.3, 0.85, -0.3, root));
      const sg = makeSign('ĐỒ CÂU CHÚ TƯ', 1.8, 0.4, '#1f5fa8', '#ffffff'); sg.position.set(-0.2, 2.15, -1.15); root.add(sg);
      // cầm cần câu
      const rod = mesh(Cyl(0.01, 0.02, 1.6, 6), M(0x223344), 0, 0.7, 0.1, person.userData.parts.handR); rod.rotation.x = 0.5;
    },
    bar(root, person) {
      legsTable(root, 0, 0.8, -0.9, 1.5, 0.7, 0x5a3a20);
      const glass = (c) => new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.6 });
      [[-0.5, 0xd4a017], [-0.1, 0xb8860b], [0.3, 0x8b4513], [0.6, 0xeeeedd]].forEach(([x, c], i) => {
        mesh(Cyl(0.13, 0.13, 0.42, 12), glass(c), x, 1.04, -0.9, root);
        mesh(Cyl(0.08, 0.08, 0.06, 10), M(0x8b0000), x, 1.28, -0.9, root);
        if (i === 1) { const sn = mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 14, Math.PI * 3), M(0x2e7d32), x, 1.02, -0.9, root); sn.rotation.x = 1.2; }
      });
      [[1.0, 0.7], [-1.1, 0.6], [1.3, -0.3]].forEach(([x, z]) => {
        mesh(Cyl(0.18, 0.14, 0.42, 10), M(0xd32f2f), x, 0.21, z, root);
      });
      signOnPosts(root, 'RƯỢU ĐẾ – BIA HƠI', 0, 1.9, -1.4, 1.8, 0.42, '#7b1f1f', '#ffe082');
      const cup = mesh(Cyl(0.04, 0.035, 0.08, 8), M(0xeeeeee), 0, 0.02, 0.04, person.userData.parts.handR); cup.rotation.x = 0.2;
    },
    banhmi(root) {
      const cart = new THREE.Group(); cart.position.set(0.5, 0, -0.5); root.add(cart);
      mesh(Box(1.6, 0.6, 0.75), M(0x1e88e5), 0, 0.75, 0, cart);
      mesh(Box(1.5, 0.5, 0.65), new THREE.MeshLambertMaterial({ color: 0xddeeff, transparent: true, opacity: 0.35 }), 0, 1.3, 0, cart, false);
      mesh(Box(1.55, 0.04, 0.7), M(0xeeeeee), 0, 1.57, 0, cart);
      const bread = M(0xd9a441);
      for (let i = 0; i < 4; i++) { const b = mesh(Cyl(0.05, 0.05, 0.5, 8), bread, -0.45 + i * 0.3, 1.13, (i % 2) * 0.12 - 0.06, cart); b.rotation.z = Math.PI / 2; b.rotation.y = 0.3; }
      mesh(Box(0.3, 0.15, 0.2), M(0x8d6e63), 0.55, 1.12, 0.15, cart);
      const wm = M(0x222222);
      [[-0.6, 0.4], [0.6, 0.4], [-0.6, -0.4], [0.6, -0.4]].forEach(([x, z]) => { const w = mesh(Cyl(0.22, 0.22, 0.06, 14), wm, x, 0.22, z, cart); w.rotation.x = Math.PI / 2; });
      mesh(Cyl(0.025, 0.025, 2.0), M(0x888888), -0.75, 2.0, 0, cart);
      const umb = mesh(new THREE.ConeGeometry(1.1, 0.4, 8), M(0xe53935), -0.75, 3.0, 0, cart); umb.rotation.y = 0.2;
      const sg = makeSign('BÁNH MÌ PATE 15K', 1.6, 0.42, '#ffd54f', '#c62828'); sg.position.set(0, 1.85, 0.36); cart.add(sg);
      const sg2 = makeSign('BÁNH MÌ PATE 15K', 1.6, 0.42, '#ffd54f', '#c62828'); sg2.position.set(0, 1.85, -0.36); sg2.rotation.y = Math.PI; cart.add(sg2);
      mesh(Box(0.04, 0.3, 0.04), M(0x888888), -0.7, 1.75, 0.36, cart); mesh(Box(0.04, 0.3, 0.04), M(0x888888), 0.7, 1.75, 0.36, cart);
    },
    craft(root, person) {
      const iron = M(0x37373d);
      const anv = new THREE.Group(); anv.position.set(0.7, 0, 0.6); root.add(anv);
      mesh(Box(0.32, 0.4, 0.3), M(0x4e342e), 0, 0.2, 0, anv);
      mesh(Box(0.24, 0.18, 0.2), iron, 0, 0.49, 0, anv);
      mesh(Box(0.6, 0.14, 0.26), iron, 0, 0.64, 0, anv);
      const horn = mesh(new THREE.ConeGeometry(0.1, 0.3, 8), iron, 0.44, 0.64, 0, anv); horn.rotation.z = -Math.PI / 2;
      const fur = new THREE.Group(); fur.position.set(-1.1, 0, -1.0); root.add(fur);
      mesh(Box(1.0, 1.1, 1.0), M(0x8d4b2b), 0, 0.55, 0, fur);
      mesh(new THREE.PlaneGeometry(0.5, 0.35), new THREE.MeshBasicMaterial({ color: 0xff7a1a }), 0, 0.5, 0.505, fur, false);
      mesh(Cyl(0.15, 0.18, 1.3), M(0x5d4037), 0, 1.75, -0.2, fur);
      const hammer = new THREE.Group(); person.userData.parts.handR.add(hammer);
      mesh(Cyl(0.02, 0.02, 0.45, 6), M(0x6d4c41), 0, 0, 0.1, hammer).rotation.x = Math.PI / 2;
      mesh(Box(0.16, 0.09, 0.09), iron, 0, 0, 0.32, hammer);
      signOnPosts(root, 'LÒ RÈN – CHẾ TẠO', 0.2, 1.95, -1.6, 1.8, 0.42, '#3e2723', '#ffab40');
    },
    boat(root, person) {
      const hull = new THREE.Group(); hull.position.set(1.5, 0, -0.8); hull.rotation.y = 0.5; root.add(hull);
      const hm = M(0x8b5a2b);
      mesh(Box(2.2, 0.08, 0.9), hm, 0, 0.12, 0, hull);
      mesh(Box(2.2, 0.35, 0.06), hm, 0, 0.3, 0.45, hull); mesh(Box(2.2, 0.35, 0.06), hm, 0, 0.3, -0.45, hull);
      const bow = mesh(new THREE.ConeGeometry(0.47, 0.6, 4), hm, 1.35, 0.3, 0, hull); bow.rotation.z = -Math.PI / 2; bow.rotation.x = Math.PI / 4;
      mesh(Cyl(0.04, 0.04, 1.6), M(0x6d4c41), -1.2, 0.8, 0.3, root);
      const ring = mesh(new THREE.TorusGeometry(0.28, 0.08, 8, 16), M(0xff6d00), -1.2, 1.25, 0.36, root);
      ring.rotation.y = 0.2;
      const oar = new THREE.Group(); person.userData.parts.handR.add(oar);
      mesh(Cyl(0.025, 0.025, 1.8, 6), M(0xa1887f), 0, 0.3, 0, oar);
      mesh(Box(0.16, 0.4, 0.03), M(0xa1887f), 0, -0.6, 0, oar);
      signOnPosts(root, 'THUYỀN – BÈ – CANO', -0.3, 1.95, -1.5, 1.8, 0.42, '#0d47a1', '#ffffff');
    },
    elder(root, person) {
      legsTable(root, -0.9, 0.42, -0.3, 1.2, 0.4, 0x6d4c41);
      mesh(Sph(0.12, 10, 8), M(0x6d4c41), -0.7, 0.55, -0.3, root);
      mesh(Cyl(0.035, 0.03, 0.06, 8), M(0xeeeeee), -1.05, 0.48, -0.25, root);
      const stick = mesh(Cyl(0.02, 0.025, 1.0, 6), M(0x5d4037), 0, -0.45, 0.05, person.userData.parts.handR);
      stick.rotation.x = 0.1;
    },
  };

  const NPC_DEFS = {
    shop: {
      name: 'Chú Tư Đồ Câu', outfit: { shirt: 0x2f6f9f, pants: 0x3b3b3b, hat: 'cap', hatColor: 0xd04020, belly: 1 },
      lines: ['Cần xịn, dây bền, mồi thơm! Mua đi cháu, cá không tự nhảy lên bờ đâu!',
        'Cần tre của ông nội à? Câu cá rô thì được, câu cá mập thì... cầu nguyện.',
        'Mua cần carbon đi, không câu được cá thì cũng có cái để khoe.',
        'Mồi giun chú đào sáng nay, tươi rói, còn đang quẫy!'],
    },
    bar: {
      name: 'Bà Sáu Rượu Đế', outfit: { shirt: 0x8a2b5a, pants: 0x222222, hair: 0x666666, hat: 'bun', apron: 0xf5f5f5, skirt: true },
      lines: ['Một chén cho ấm bụng, hai chén cho cá cắn, ba chén... thôi về nằm.',
        'Uống rượu rắn vào là kéo được cả cá voi! (Quán không chịu trách nhiệm.)',
        'Say thì quăng lệch, nhưng mà vui!',
        'Uống xong nhớ đừng lái thuyền nha cưng.'],
    },
    banhmi: {
      name: 'Cô Ba Bánh Mì', outfit: { shirt: 0xf2d24b, pants: 0x2a2a6a, hat: 'non_la', hatColor: 0xe8d9a0, apron: 0xffffff, skirt: true },
      lines: ['Bánh mì pate 15 nghìn đây! Giòn rụm, pate béo ngậy, ăn xong câu được cá vàng!',
        'Đói thì ăn bánh mì, buồn cũng ăn bánh mì. Bánh mì chữa bách bệnh!',
        'Cá đổi bánh mì hả? Thôi, cô nhận tiền mặt thôi con.',
        'Pate cô làm, cá đột biến cũng mê!'],
    },
    craft: {
      name: 'Bác Rèn Búa Tạ', outfit: { shirt: 0x5a3a22, pants: 0x2a2a2a, sleeves: false, apron: 0x3a2a1a, belly: 0.6, hat: 'bandana', hatColor: 0xb71c1c, beard: false },
      lines: ['Đưa nguyên liệu đây, ta rèn cho cái cần kéo được cả tàu ngầm!',
        'Sắt vụn của cháu là vàng của ta.',
        'Thuốc nổ à? Suỵt... đừng để quản lý biết là ta làm.',
        'Keng! Keng! Keng! ...Xin lỗi, ta nghiện gõ búa.'],
    },
    boat: {
      name: 'Anh Hải Thuyền', outfit: { shirt: 0x1f5fa8, pants: 0x2a4a6a, hat: 'cap', hatColor: 0xffffff, skin: 0xc68b59 },
      lines: ['Thuyền thúng xoay vòng vòng, say sóng miễn phí!',
        'Ra khơi mới có cá to, đứng bờ chỉ có cá rô.',
        'Thuyền gỗ chắc chắn lắm, chỉ hơi thủng... đùa thôi!',
        'Muốn cano thì kiếm động cơ cũ rồi nhờ bác thợ rèn.'],
    },
    elder: {
      name: 'Ông Lão Câu Cá', outfit: { shirt: 0x6b4a2b, pants: 0x2b2b2b, bald: true, beard: true, hair: 0xdddddd, sleeves: 'long' },
      lines: ['Hồi ông bằng tuổi cháu, ông câu được con cá to bằng cái nhà...',
        'Muốn nghe bí kíp à? Bia trước, chuyện sau.',
        'Câu cá là phải kiên nhẫn. Ông kiên nhẫn 60 năm rồi đấy.',
        'Cá khôn thì ăn mồi xịn, người khôn thì... mời ông bia.'],
    },
  };

  // ======================================================================
  // 4. NPC
  // ======================================================================
  let npcGroup = null;
  let npcs = [];
  S.npcs = npcs;
  S.nearestNPC = null;

  function groundAt(x, z, fb) {
    if (isAir()) return airY;
    const h = G.world && G.world.groundHeight ? G.world.groundHeight(x, z) : fb;
    return isFinite(h) ? h : (fb || 0);
  }
  function waterAt(x, z) {
    if (isAir()) return false;
    return !!(G.world && G.world.isWater && G.world.isWater(x, z));
  }

  // ---------- Va chạm (G.physics) ----------
  const PHY = () => G.physics || null;
  function clearNPCs() {
    const ph = PHY(); if (ph && ph.clear) ph.clear('npc');
    if (npcGroup) G.disposeObject(npcGroup);
    npcGroup = null;
    npcs.length = 0;
    S.nearestNPC = null;
  }

  function buildNPC(role, pos, faceTo) {
    const def = NPC_DEFS[role];
    if (!def) return;
    const root = new THREE.Group();
    root.position.copy(pos);
    if (faceTo) root.rotation.y = Math.atan2(faceTo.x - pos.x, faceTo.z - pos.z);
    const person = makePerson(def.outfit);
    if (role === 'banhmi') person.position.set(-1.0, 0, 0.2);
    root.add(person);
    if (PROPS[role]) { try { PROPS[role](root, person); } catch (e) { console.warn('[systems] props', role, e); } }
    mergePerson(person); U.mergeStatic(root, [person]); // quầy hàng + đạo cụ tĩnh → vài mesh (ít draw call, cả bóng đổ)
    const label = makeLabel(def.name, '#ffe082');
    label.position.set(person.position.x, 2.3, person.position.z);
    root.add(label);
    npcGroup.add(root);
    const n = { role, name: def.name, def, root, person, label, phase: Math.random() * 6, yaw: 0, colId: 0 };
    // NPC đứng yên → collider tròn tag 'npc' (người chơi không đi xuyên qua)
    const ph = PHY();
    if (ph && ph.addCircle) {
      root.updateMatrixWorld(true);
      const wp = person.getWorldPosition(new THREE.Vector3());
      n.colId = ph.addCircle({ x: wp.x, z: wp.z, r: 0.42, tag: 'npc', yMin: wp.y - 0.2, yMax: wp.y + 1.9 });
    }
    npcs.push(n);
  }

  function buildNPCs() {
    clearNPCs();
    if (!G.scene || !G.world) return;
    npcGroup = new THREE.Group();
    npcGroup.name = 'systems_npcs';
    G.scene.add(npcGroup);
    const spots = (G.world.getNPCSpots && G.world.getNPCSpots()) || [];
    const spawn = (G.world.getSpawn && G.world.getSpawn()) || new THREE.Vector3();
    spots.forEach((sp) => {
      if (!sp || !sp.pos) return;
      const p = sp.pos.clone();
      if (!p.y && !isAir()) p.y = groundAt(p.x, p.z, 0);
      buildNPC(sp.role, p, spawn);
    });
    // ông lão: nếu world không có chỗ riêng thì đặt cạnh NPC đầu tiên
    if (!spots.some((s) => s.role === 'elder')) {
      const base = spots.length ? spots[0].pos : spawn;
      const offs = [[3.5, 1], [-3.5, 1], [2.5, 3], [-2.5, 3], [4.5, -1], [0, 4]];
      let chosen = null;
      for (const [ox, oz] of offs) {
        const x = base.x + ox, z = base.z + oz;
        if (!waterAt(x, z)) { chosen = new THREE.Vector3(x, isAir() ? base.y : groundAt(x, z, base.y), z); break; }
      }
      if (chosen) buildNPC('elder', chosen, spawn);
    }
  }

  const angleDiff = G.util.angleDiff;

  function updateNPCs(dt, t) {
    const pp = ppos();
    let best = null, bestD = 3;
    const tmp = updateNPCs._v || (updateNPCs._v = new THREE.Vector3());
    for (const n of npcs) {
      animatePerson(n.person, t, n.phase, 0);
      const P = n.person.userData.parts;
      // động tác riêng
      if (n.role === 'craft') { P.armR.rotation.x = -1.2 + Math.max(0, Math.sin(t * 5 + n.phase)) * -0.9; }
      else if (n.role === 'banhmi') { P.armR.rotation.z = -0.3 - Math.max(0, Math.sin(t * 3)) * 1.6 * (Math.sin(t * 0.4) > 0.3 ? 1 : 0); }
      else if (n.role === 'bar') { P.armR.rotation.x = -0.9 + Math.sin(t * 1.5 + n.phase) * 0.15; }
      else if (n.role === 'elder') { n.person.rotation.z = Math.sin(t * 0.8) * 0.03; P.armR.rotation.x = -0.25; }
      else if (n.role === 'shop') { P.armR.rotation.x = -0.4 + Math.sin(t * 0.7) * 0.1; }
      else if (n.role === 'boat') { P.armR.rotation.x = -0.15; }
      if (!pp) continue;
      n.person.getWorldPosition(tmp);
      const dx = pp.x - tmp.x, dz = pp.z - tmp.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      let target = 0;
      if (d < 10) target = angleDiff(n.root.rotation.y, Math.atan2(dx, dz));
      n.yaw += angleDiff(n.yaw, target) * Math.min(1, dt * 4);
      n.person.rotation.y = n.yaw;
      n.label.visible = d < 28 && n.label.getWorldPosition(tmpLbl).distanceTo(G.camera.position) > 5;
      if (d < bestD) { bestD = d; best = n; }
    }
    S.nearestNPC = best ? { name: best.name, role: best.role } : null;
    S._nearestNPCObj = best;
  }

  // ---------- Hội thoại ----------
  function shopOpts(role) {
    return { label: 'Xem hàng', action: () => G.ui && G.ui.openPanel && G.ui.openPanel('shop', { role }) };
  }
  const bye = { label: 'Tạm biệt', action: () => {} };

  function talk(n) {
    const s = st();
    const line = U.pick(n.def.lines);
    sfx('click');
    const opts = [];
    switch (n.role) {
      case 'shop': {
        opts.push(shopOpts('shop'));
        if (s.fishBag.length) opts.push({ label: 'Bán hết cá (' + s.fishBag.length + ' con – ' + fmt(S.bagValue()) + ')', action: () => S.sellAll() });
        const junkN = Object.keys(s.inventory).filter((id) => { const it = D().item(id); return it && it.type === 'junk'; }).length;
        if (junkN) opts.push({ label: 'Bán đồ nhặt được (rác)', action: () => S.sellJunk(false) });
        break;
      }
      case 'bar':
        ['drink_beer', 'drink_ruou', 'drink_tea'].forEach((id) => {
          const it = D().item(id);
          opts.push({ label: 'Uống ' + it.name + ' (' + fmt(it.price) + ')', action: () => { if (S.buy(id)) S.use(id); } });
        });
        opts.push(shopOpts('bar'));
        break;
      case 'banhmi': {
        const it = D().item('food_banhmi');
        opts.push({ label: 'Ăn liền 1 ổ bánh mì pate (' + fmt(it.price) + ')', action: () => { if (S.buy('food_banhmi')) S.use('food_banhmi'); } });
        opts.push({ label: 'Mua 1 ổ mang đi (' + fmt(it.price) + ')', action: () => S.buy('food_banhmi') });
        opts.push(shopOpts('banhmi'));
        break;
      }
      case 'craft':
        opts.push({ label: 'Chế tạo', action: () => G.ui && G.ui.openPanel && G.ui.openPanel('craft') });
        opts.push({ label: 'Mua nguyên liệu', action: shopOpts('craft').action });
        if (s.fishBag.length) {
          opts.push({ label: 'Nhờ nướng con cá nhỏ nhất', action: () => {
            let mi = 0; s.fishBag.forEach((f, i) => { if (f.weight < s.fishBag[mi].weight) mi = i; });
            S.cookFish(mi);
          } });
        }
        break;
      case 'boat':
        (D().SHOP.boat || []).forEach((id) => {
          if (S.has(id)) return;
          const it = D().item(id);
          if (it) opts.push({ label: 'Mua ' + it.name + ' (' + fmt(it.price) + ')', action: () => S.buy(id) });
        });
        (s.ownedBoats || []).forEach((id) => opts.push({ label: 'Lên ' + itemName(id), action: () => S.boardOwnedBoat(id) }));
        if (s.onBoat && G.player && G.player.leaveBoat) opts.push({ label: 'Rời thuyền', action: () => G.player.leaveBoat() });
        break;
      case 'elder':
        opts.push({ label: S.has('drink_beer') ? 'Mời ông 1 cốc bia (nghe bí kíp)' : 'Mời ông bia (mua tại chỗ ' + fmt(15000) + ')', action: () => {
          if (S.has('drink_beer')) S.removeItem('drink_beer', 1);
          else if (s.money >= 15000) { s.money -= 15000; sfx('coin'); }
          else { later(() => dialog(n.name, 'Không có bia, không có tiền... thế thì ông kể chuyện cổ tích nhé? Thôi, đi kiếm tiền đi cháu.', [bye])); return; }
          sfx('drink'); later(() => sfx('burp'), 900);
          later(() => dialog(n.name, elderTip(), [bye]), 120);
        } });
        break;
    }
    opts.push(bye);
    dialog(n.name, line, opts);
  }

  function elderTip() {
    const sp = (G.fish && G.fish.SPECIES) || [];
    if (!sp.length) return 'Khà... ông quên hết rồi. Già rồi cháu ạ.';
    const und = sp.filter((f) => !st().discovered[f.id]);
    const pool = und.length ? und : sp;
    const f = U.pick(pool);
    const envs = (f.envs || []).map((e) => D().env(e).name).join(', ') || 'đâu đó';
    const time = f.time === 'day' ? 'ban ngày' : f.time === 'night' ? 'ban đêm' : 'lúc nào cũng được';
    const baits = (f.baits || []).map(itemName).join(', ') || 'mồi gì cũng được';
    const depth = f.depth ? ' ở độ sâu ' + f.depth[0] + '–' + f.depth[1] + 'm' : '';
    const temp = f.temp ? ', nước ' + f.temp[0] + '–' + f.temp[1] + '°C' : '';
    const tide = f.tide === 'high' ? ', đợi nước lên' : f.tide === 'low' ? ', đợi nước ròng' : '';
    const size = f.maxW ? ' Con to nhất nặng tới ' + U.fmtWeight(f.maxW) + '!' : '';
    const tech = f.technique ? ' Mẹo: ' + f.technique : '';
    const intro = und.length ? 'Khà khà, bia ngon! Cháu chưa câu được con ' : 'Cháu câu đủ cả rồi à? Giỏi! Nhắc lại con ';
    return intro + f.name + ' đâu nhỉ? Nó sống ở ' + envs + depth + temp + tide + '. Đi câu ' + time + ', mồi ' + baits + '.' + size + tech;
  }

  // ======================================================================
  // 5. QUẢN LÝ (WARDEN)
  // ======================================================================
  let wardenGroup = null;
  let wardens = [];
  let chase = null;          // { w, far, stuck, whistle }
  let detectCooldown = 0;
  let airY = 0;
  let deckBox = null;
  S.wardens = wardens;

  function wardenOutfit() {
    if (isAir()) return { shirt: 0x1d2c5e, pants: 0x1d2c5e, hat: 'attendant', hatColor: 0x1d2c5e, scarf: 0xd32f2f, skirt: true, hair: 0x2b1a10, sleeves: 'long' };
    return { shirt: 0x7d8a4a, pants: 0x4a5530, hat: 'warden', hatColor: 0x3d4a25, shoes: 0x1a1a1a, sleeves: 'long' };
  }
  const wardenTitle = () => (isAir() ? 'Tiếp viên trưởng' : 'Quản lý');

  function makeWarden(zone) {
    const p = makePerson(wardenOutfit());
    const P = p.userData.parts;
    // còi
    mesh(Cyl(0.02, 0.025, 0.07, 8), M(0xcccccc), 0.08, 1.42, 0.2, p, false).rotation.x = Math.PI / 2;
    // đèn pin + chùm sáng
    const fl = mesh(Cyl(0.03, 0.04, 0.2, 8), M(0x111111), 0, -0.02, 0.08, P.handL, false); fl.rotation.x = Math.PI / 2;
    const beamGeo = new THREE.ConeGeometry(1.4, 7, 14, 1, true); beamGeo.translate(0, -3.5, 0);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(0.25, 1.0, 0.25);
    beam.rotation.x = -Math.PI / 2 + 0.22;
    beam.visible = false;
    p.add(beam);
    const lens = mesh(new THREE.CircleGeometry(0.035, 10), new THREE.MeshBasicMaterial({ color: 0xffffcc }), 0, -0.02, 0.185, P.handL, false);
    lens.visible = false;
    const label = makeLabel(wardenTitle(), '#a5d6a7'); p.add(label);
    const mEx = makeMarker('!', '#ff3b30'); p.add(mEx);
    const mQ = makeMarker('?', '#ffd54f'); p.add(mQ);
    mergePerson(p); // đèn pin, chùm sáng đang ẩn → không bị gộp, vẫn bật/tắt được
    return { obj: p, zone, target: null, wait: U.rand(0, 2), speed: 0, phase: Math.random() * 6, beam, lens, label, mEx, mQ, suspicion: 0, home: null };
  }

  function clampDeck(v) {
    if (!isAir()) return v;
    if (deckBox) {
      v.x = U.clamp(v.x, deckBox.min.x + 0.6, deckBox.max.x - 0.6);
      v.z = U.clamp(v.z, deckBox.min.z + 0.6, deckBox.max.z - 0.6);
    } else if (G.world && G.world.getSpawn) {
      const sp = G.world.getSpawn();
      const dx = v.x - sp.x, dz = v.z - sp.z, d = Math.hypot(dx, dz);
      if (d > 5) { v.x = sp.x + dx / d * 5; v.z = sp.z + dz / d * 5; }
    }
    return v;
  }
  function clampBounds(v) {
    const b = G.world && G.world.getBounds && G.world.getBounds();
    if (b) { v.x = U.clamp(v.x, b.minX + 1, b.maxX - 1); v.z = U.clamp(v.z, b.minZ + 1, b.maxZ - 1); }
    return clampDeck(v);
  }

  function patrolPoint(zone) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = zone.r * U.rand(0.3, 1.0) + (i > 15 ? U.rand(2, 20) : U.rand(0, 8));
      const v = clampBounds(new THREE.Vector3(zone.x + Math.cos(a) * r, 0, zone.z + Math.sin(a) * r));
      if (!waterAt(v.x, v.z)) { v.y = groundAt(v.x, v.z, 0); return v; }
    }
    const sp = (G.world.getSpawn && G.world.getSpawn()) || new THREE.Vector3();
    return clampDeck(sp.clone());
  }

  function clearWardens() {
    const ph = PHY(); if (ph && ph.clear) ph.clear('warden');
    if (wardenGroup) G.disposeObject(wardenGroup);
    wardenGroup = null;
    wardens.length = 0;
    chase = null;
  }

  function buildWardens() {
    clearWardens();
    if (!G.scene || !G.world) return;
    const sp = (G.world.getSpawn && G.world.getSpawn()) || new THREE.Vector3();
    airY = sp.y;
    deckBox = null;
    if (isAir() && G.world.planeDeck) {
      try { deckBox = new THREE.Box3().setFromObject(G.world.planeDeck); if (deckBox.isEmpty()) deckBox = null; } catch (e) { deckBox = null; }
    }
    wardenGroup = new THREE.Group();
    wardenGroup.name = 'systems_wardens';
    G.scene.add(wardenGroup);
    const zones = G.world.zones || [];
    zones.forEach((z) => {
      const n = st().env === 'city' ? 2 : U.randInt(1, 2);
      for (let i = 0; i < n; i++) {
        const w = makeWarden(z);
        const p = patrolPoint(z);
        w.obj.position.copy(p);
        w.home = p.clone();
        w.obj.rotation.y = Math.random() * Math.PI * 2;
        const ph = PHY();
        if (ph && ph.addCircle) w.colId = ph.addCircle({ x: p.x, z: p.z, r: 0.38, tag: 'warden', yMin: p.y - 0.2, yMax: p.y + 1.9 });
        wardenGroup.add(w.obj);
        wardens.push(w);
      }
    });
  }

  function nearZone(x, z, margin) {
    const zones = (G.world && G.world.zones) || [];
    for (const zn of zones) {
      const dx = x - zn.x, dz = z - zn.z;
      if (dx * dx + dz * dz < (zn.r + margin) * (zn.r + margin)) return zn;
    }
    if (margin <= 0 && G.world && G.world.isManagedZone) return G.world.isManagedZone(x, z);
    return null;
  }

  function isNight() {
    const pp = ppos();
    try {
      if (G.world && G.world.getConditions) {
        const c = G.world.getConditions(pp ? pp.x : 0, pp ? pp.z : 0);
        if (c && typeof c.isNight === 'boolean') return c.isNight;
      }
    } catch (e) { /* */ }
    const h = st().time;
    return h < 5.5 || h >= 18.5;
  }

  const _v = new THREE.Vector3();
  function moveToward(w, tx, tz, speed, dt) {
    const p = w.obj.position;
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.05) { w.speed = 0; return { d, blocked: false }; }
    const step = Math.min(d, speed * dt);
    const nx = p.x + dx / d * step, nz = p.z + dz / d * step;
    const yaw = Math.atan2(dx, dz);
    w.obj.rotation.y += angleDiff(w.obj.rotation.y, yaw) * Math.min(1, dt * 8);
    if (waterAt(nx, nz)) { w.speed = 0; return { d, blocked: true }; }
    _v.set(nx, 0, nz);
    // không đi xuyên nhà/cây/NPC: đẩy ra khỏi collider (trượt dọc tường)
    const ph = PHY();
    let hitWall = false;
    if (ph && ph.resolveCircle) { try { hitWall = ph.resolveCircle(_v, 0.38, p.y + 0.4, 1.4, 'warden'); } catch (e) { hitWall = false; } }
    if (hitWall && waterAt(_v.x, _v.z)) { w.speed = 0; return { d, blocked: true }; }
    clampBounds(_v);
    const moved = Math.hypot(_v.x - p.x, _v.z - p.z);
    p.x = _v.x; p.z = _v.z;
    p.y = U.damp(p.y, groundAt(p.x, p.z, p.y), 12, dt);
    if (w.colId && ph && ph.move) ph.move(w.colId, p.x, p.z);
    w.speed = speed * (step > 1e-6 ? Math.min(1, moved / step) : 1);
    // kẹt ở góc tường: đi vòng theo tiếp tuyến một lúc
    w.wallT = hitWall && moved < step * 0.35 ? (w.wallT || 0) + dt : 0;
    return { d, blocked: false, wall: hitWall, stuckWall: w.wallT > 0.6 };
  }

  // tầm nhìn bị nhà/tường che (raycast trên mặt phẳng XZ ở độ cao mắt) → có thể trốn sau nhà
  const losFrom = new THREE.Vector3(), losTo = new THREE.Vector3(), losOut = new THREE.Vector3();
  const LOS_SKIP = ['npc', 'warden'];
  function hasLOS(w, pp) {
    const ph = PHY();
    if (!ph || !ph.raycastXZ) return true;
    const p = w.obj.position;
    losFrom.set(p.x, p.y + 1.6, p.z); losTo.set(pp.x, pp.y + 1.2, pp.z);
    try { return !ph.raycastXZ(losFrom, losTo, 0, Math.max(p.y, pp.y) + 1.4, { skipTag: LOS_SKIP, out: losOut }); } catch (e) { return true; }
  }
  function canSee(w, pp, night) {
    const p = w.obj.position;
    const dx = pp.x - p.x, dz = pp.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const range = night ? 18 : 35;
    if (d > range) return 0;
    if (d < 5) return 1; // nghe thấy tiếng quăng câu
    const fx = Math.sin(w.obj.rotation.y), fz = Math.cos(w.obj.rotation.y);
    const cos = (dx * fx + dz * fz) / d;
    if (cos < Math.cos(50 * Math.PI / 180)) return 0;
    if (!hasLOS(w, pp)) return 0;
    return 1 - d / range * 0.6;
  }

  function startChase(w, instant) {
    if (chase || !w) return;
    const s = st();
    s.wanted = 1;
    chase = { w, far: 0, stuck: 0, whistle: 0 };
    w.mQ.visible = false; w.mEx.visible = true;
    sfx('whistle'); later(() => sfx('alarm'), 300);
    const t = wardenTitle();
    big(instant ? 'Bùm! ' + t + ' nghe thấy rồi!' : t + ' phát hiện!', 'Giữ Shift chạy thật xa (hơn 45 m), trốn sau nhà hoặc lên thuyền!', '#ff3b30');
    emit('warden:spotted', {});
    if (ILLEGAL_MODES.indexOf(s.mode) >= 0) {
      if (G.fishing && G.fishing.cancel) { try { G.fishing.cancel(); } catch (e) { /* */ } }
      G.setMode('explore');
    }
    if (G.player) { G.player.locked = false; G.player.cameraFocus = null; }
    emit('warden:chase', {});
  }

  function endChase(reason) {
    if (!chase) return;
    const w = chase.w;
    w.mEx.visible = false;
    w.target = patrolPoint(w.zone);
    chase = null;
    const s = st();
    if (reason === 'escaped') {
      s.wanted = 0.6;
      sfx('fanfare');
      toast(U.pick(['Thoát rồi! ' + wardenTitle() + ' bỏ cuộc, thở hồng hộc.', 'Cắt đuôi thành công! Chân chạy nhanh hơn chân câu.', wardenTitle() + ' mất dấu bạn. Hú hồn!']), 'good');
      emit('warden:escaped', {});
    } else if (reason === 'disguise') {
      s.wanted = 0;
      toast(wardenTitle() + ': "Ơ... người vừa nãy đâu rồi nhỉ?"', 'good');
      emit('warden:escaped', {});
    } else if (reason === 'water') {
      s.wanted = 0.6;
      toast(wardenTitle() + ' không biết bơi! Đứng trên bờ thổi còi bất lực.', 'good');
      emit('warden:escaped', {});
    }
    detectCooldown = reason === 'caught' ? 8 : 3;
  }

  function caught() {
    const s = st();
    const w = chase && chase.w;
    endChase('caught');
    s.wanted = 0;
    const lost = [];
    const rod = s.equipped.rod || 'rod_bamboo';
    if (rod !== 'rod_bamboo') {
      const i = s.ownedRods.indexOf(rod);
      if (i >= 0) s.ownedRods.splice(i, 1);
      lost.push(itemName(rod));
    } else if (s.equipped.line && s.equipped.line !== 'line_basic') {
      const i = s.ownedLines.indexOf(s.equipped.line);
      if (i >= 0) s.ownedLines.splice(i, 1);
      lost.push(itemName(s.equipped.line));
      s.equipped.line = 'line_basic';
    }
    if (!s.ownedRods.includes('rod_bamboo')) s.ownedRods.unshift('rod_bamboo');
    s.equipped.rod = 'rod_bamboo';
    if (G.fishing && G.fishing.setRod) { try { G.fishing.setRod('rod_bamboo'); } catch (e) { /* */ } }
    if (s.fishBag.length) { lost.push(s.fishBag.length + ' con cá'); s.fishBag.length = 0; }
    const fine = Math.round(s.money * 0.3);
    s.money -= fine;
    if (fine > 0) lost.push(fmt(fine));
    sfx('alarm');
    big('Bị tịch thu đồ!', lost.length ? 'Mất: ' + lost.join(', ') : 'May mà chẳng có gì để mất.', '#ff3b30');
    toast(isAir() ? 'Tiếp viên: "Quý khách vui lòng KHÔNG câu cá qua cửa máy bay!"' : 'Quản lý: "Khu này cấm câu! Biển to thế không đọc à?"', 'bad');
    if (G.player) G.player.locked = false;
    if (s.onBoat && G.player && G.player.leaveBoat) G.player.leaveBoat();
    if (s.mode !== 'explore') G.setMode('explore');
    toSpawn();
    if (w) { w.obj.position.copy(w.home || w.obj.position); const ph = PHY(); if (w.colId && ph && ph.move) ph.move(w.colId, w.obj.position.x, w.obj.position.z); }
    emit('warden:caught', {});
    emit('inventory:changed', {}); emit('money:changed', {});
    S.save();
  }

  function onExplosion(data) {
    const pos = data && data.pos;
    if (!pos || !wardens.length) return;
    const zn = nearZone(pos.x, pos.z, 0);
    if (!zn) return;
    if (data.size != null && data.size < 1) { st().wanted = Math.min(1, st().wanted + 0.35); return; }
    st().wanted = 1;
    if (chase) return;
    let best = null, bd = Infinity;
    for (const w of wardens) {
      const d = w.obj.position.distanceToSquared(pos) * (w.zone === zn ? 0.25 : 1);
      if (d < bd) { bd = d; best = w; }
    }
    startChase(best, true);
  }

  function updateWardens(dt, t) {
    const s = st();
    const pp = ppos();
    if (detectCooldown > 0) detectCooldown -= dt;
    const night = isNight();
    const active = pp && ['menu', 'dead'].indexOf(s.mode) < 0 && dt > 0;
    const illegal = active && ILLEGAL_MODES.indexOf(s.mode) >= 0 && nearZone(pp.x, pp.z, 15);
    let seen = 0, seer = null;
    for (const w of wardens) {
      w.beam.visible = night; w.lens.visible = night;
      if (chase && chase.w === w) {
        // ----- đuổi -----
        // nhìn thấy → đuổi thẳng; khuất sau nhà → chạy tới chỗ thấy lần cuối, mất dấu nhanh hơn
        const dpx = pp.x - w.obj.position.x, dpz = pp.z - w.obj.position.z, dP = Math.sqrt(dpx * dpx + dpz * dpz);
        chase.losT = (chase.losT || 0) - dt;
        if (chase.losT <= 0) { chase.losT = 0.15; chase.vis = dP < 4 || hasLOS(w, pp); }
        if (chase.vis || chase.lastX == null) { chase.lastX = pp.x; chase.lastZ = pp.z; chase.lost = 0; }
        else chase.lost = (chase.lost || 0) + dt;
        let gx = chase.vis ? pp.x : chase.lastX, gz = chase.vis ? pp.z : chase.lastZ;
        if (chase.detour > 0) {
          chase.detour -= dt;
          gx = w.obj.position.x + chase.dx * 3; gz = w.obj.position.z + chase.dz * 3;
        }
        const r = moveToward(w, gx, gz, WARDEN_SPEED + (s.drunk > 0.5 ? 0.6 : 0), dt);
        if (r.stuckWall && !(chase.detour > 0) && G.physics) {
          // kẹt góc nhà: đi vòng theo tiếp tuyến tường về phía người chơi
          const n = G.physics.lastNormal, tx = -n.z, tz = n.x, sgn = (tx * dpx + tz * dpz) >= 0 ? 1 : -1;
          chase.dx = tx * sgn; chase.dz = tz * sgn; chase.detour = 0.8; w.wallT = 0;
        }
        if (!chase.vis && dP > 10) chase.far += dt * (chase.lost > 1.5 ? 1.0 : 0.5);
        const d = dP;
        chase.whistle -= dt;
        if (chase.whistle <= 0) { chase.whistle = 3; sfx('whistle'); }
        if (d < 1.5 && !s.onBoat) { caught(); break; }
        if (d > 45) chase.far += dt; else chase.far = Math.max(0, chase.far - dt * 0.5);
        if (s.onBoat && d > 25) chase.far += dt;
        if (r.blocked) chase.stuck += dt; else chase.stuck = Math.max(0, chase.stuck - dt);
        if (chase.far >= 4) endChase('escaped');
        else if (chase.stuck > 6 && d > 10) endChase('water');
        animatePerson(w.obj, t, w.phase, w.speed);
        continue;
      }
      // ----- tuần tra -----
      if (!w.target) w.target = patrolPoint(w.zone);
      if (w.wait > 0) {
        w.wait -= dt; w.speed = 0;
        w.obj.rotation.y += Math.sin(t * 0.7 + w.phase) * dt * 0.6; // nhìn quanh
      } else {
        const r = moveToward(w, w.target.x, w.target.z, WARDEN_PATROL_SPEED, dt);
        if (r.d < 0.6 || r.blocked || r.stuckWall) { w.target = patrolPoint(w.zone); w.wait = U.rand(1.5, 4); w.wallT = 0; }
      }
      animatePerson(w.obj, t, w.phase, w.speed);
      // ----- phát hiện -----
      let v = 0;
      if (illegal && !chase && detectCooldown <= 0) v = canSee(w, pp, night);
      if (v > 0) {
        if (v > seen) { seen = v; seer = w; }
        // quay về phía người chơi
        const yaw = Math.atan2(pp.x - w.obj.position.x, pp.z - w.obj.position.z);
        w.obj.rotation.y += angleDiff(w.obj.rotation.y, yaw) * Math.min(1, dt * 2);
        w.wait = Math.max(w.wait, 0.5);
      }
      w.mQ.visible = v > 0 && !chase;
      if (pp) w.label.visible = w.obj.position.distanceToSquared(pp) < 30 * 30 && w.label.getWorldPosition(tmpLbl).distanceTo(G.camera.position) > 5;
    }
    if (!active) return;
    if (seer && !chase) {
      const prev = s.wanted;
      s.wanted = Math.min(1, s.wanted + dt * (0.35 + 0.6 * seen));
      if (prev < 0.3 && s.wanted >= 0.3) { sfx('whistle'); toast(wardenTitle() + ' đang nhìn về phía bạn... cẩn thận!', 'warn'); }
      if (s.wanted >= 1) startChase(seer, false);
    } else if (!chase) {
      s.wanted = Math.max(0, s.wanted - dt * 0.04);
    }
  }

  // ======================================================================
  // 6. NHÉT CÁ VÀO QUẦN (bị cấm)
  // ======================================================================
  const PANTS_MSGS = [
    'Hệ thống: KHÔNG được nhét cá vào quần!',
    'Cá đã từ chối vào quần bạn.',
    'Điều 69 Luật Câu Cá: cấm nhét cá vào quần.',
    'Con cá nhìn bạn với ánh mắt khinh bỉ.',
    'Quần của bạn không phải là bể cá!',
    'Bạn định làm gì vậy?! Mọi người đang nhìn kìa.',
    'Lỗi 403: Quần không có quyền truy cập cá.',
    'Cá: "Thà chết chứ không vào đó!"',
    'Hành vi đã được ghi lại. Mẹ bạn sẽ được thông báo.',
    'Nhét cá vào quần không làm cá tươi lâu hơn đâu.',
  ];
  let pantsIdx = 0;
  let fineOfficer = null;
  S.tryPantsFish = function () {
    const s = st();
    if (!s.fishBag.length) {
      toast('Bạn không có cá để nhét... mà cũng không được nhét!', 'warn');
      return false;
    }
    s.stats.pantsAttempts = (s.stats.pantsAttempts || 0) + 1;
    toast(PANTS_MSGS[pantsIdx++ % PANTS_MSGS.length], 'bad');
    sfx('fail');
    if (s.stats.pantsAttempts % 3 === 0) later(pantsFine, 700);
    return false;
  };
  function pantsFine() {
    const s = st();
    const pp = ppos();
    const fine = 50000;
    s.money = Math.max(0, s.money - fine);
    if (pp && G.scene) {
      if (fineOfficer) G.disposeObject(fineOfficer.obj);
      const w = makeWarden(null);
      const f = (G.player && G.player.facing) || 0;
      w.obj.position.set(pp.x + Math.sin(f) * 2, pp.y, pp.z + Math.cos(f) * 2);
      w.obj.rotation.y = f + Math.PI;
      w.mEx.visible = true;
      G.scene.add(w.obj);
      fineOfficer = { obj: w.obj, w, life: 5 };
      if (G.fx && G.fx.sparkle) G.fx.sparkle(w.obj.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x88ff88);
    }
    sfx('whistle');
    big('Phạt ' + fmt(fine) + '!', 'Phạt hành chính vì hành vi nhét cá vào quần', '#ff9800');
    toast(wardenTitle() + ': "Phạt hành chính vì hành vi nhét cá vào quần! ' + fmt(fine) + '."', 'bad');
    emit('money:changed', {});
  }
  function updateFineOfficer(dt, t) {
    if (!fineOfficer) return;
    fineOfficer.life -= dt;
    const P = fineOfficer.obj.userData.parts;
    animatePerson(fineOfficer.obj, t, 0, 0);
    if (P) P.armR.rotation.x = -1.4 + Math.sin(t * 8) * 0.25; // chỉ tay mắng
    if (fineOfficer.life <= 0) { G.disposeObject(fineOfficer.obj); fineOfficer = null; }
  }

  // ======================================================================
  // 7. HOTBAR
  // ======================================================================
  S.hotbar = [];
  function updateHotbar() {
    const hb = [];
    for (const c of D().CONSUMABLES) {
      if (c.effect && S.count(c.id) > 0) { hb.push(c.id); if (hb.length >= 5) break; }
    }
    S.hotbar = hb;
  }

  // ======================================================================
  // 8. LƯU / TẢI
  // ======================================================================
  const SAVE_FIELDS = ['money', 'inventory', 'fishBag', 'equipped', 'env', 'time', 'day', 'drunk', 'hunger', 'stamina', 'hp', 'ownedBoats', 'ownedRods', 'ownedLines', 'stats', 'discovered', 'buffs', 'wearing', 'firstPerson', 'skillXp'];
  S.save = function () {
    try {
      const s = st();
      const o = { v: 2, savedAt: Date.now() };
      SAVE_FIELDS.forEach((k) => { if (s[k] !== undefined) o[k] = s[k]; });
      localStorage.setItem(SAVE_KEY, JSON.stringify(o));
      return true;
    } catch (e) { console.warn('[systems] save lỗi', e); return false; }
  };
  S.load = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return false;
      const def = G.defaultState();
      const s = G.state;
      Object.keys(s).forEach((k) => delete s[k]);
      Object.assign(s, def);
      // chỉ nhận giá trị đúng kiểu với mặc định (bản lưu hỏng / bị sửa tay không làm tiền thành NaN, túi đồ thành số...)
      const kind = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
      SAVE_FIELDS.forEach((k) => {
        const v = o[k]; if (v === undefined || v === null) return;
        const dk = def[k] === undefined ? null : kind(def[k]);
        if (dk && kind(v) !== dk) return;
        if (typeof v === 'number' && !Number.isFinite(v)) return;
        s[k] = v;
      });
      if (!Array.isArray(s.fishBag)) s.fishBag = [];
      s.fishBag = s.fishBag.filter((f) => f && typeof f === 'object' && Number.isFinite(f.weight));
      for (const id in s.inventory) { const n = s.inventory[id]; if (!Number.isFinite(n) || n <= 0) delete s.inventory[id]; }
      ['ownedRods', 'ownedLines', 'ownedBoats'].forEach((k) => { if (Array.isArray(s[k])) s[k] = s[k].filter((id) => typeof id === 'string' && D().item && D().item(id)); });
      s.money = Math.max(0, Math.round(s.money));
      s.hunger = U.clamp(s.hunger, 0, 100); s.stamina = U.clamp(s.stamina, 0, 100); s.hp = U.clamp(s.hp, 0, 100); s.drunk = U.clamp(s.drunk, 0, 1);
      s.time = ((s.time % 24) + 24) % 24;
      if (!(o.v >= 2)) s.firstPerson = true; // save cũ (mặc định cũ là góc thứ ba) → theo mặc định mới
      s.stats = Object.assign(def.stats, o.stats && typeof o.stats === 'object' ? o.stats : {});
      s.equipped = Object.assign(def.equipped, o.equipped && typeof o.equipped === 'object' ? o.equipped : {});
      s.mode = 'explore'; s.onBoat = null; s.wanted = 0;
      if (!(s.hp > 0)) s.hp = 50;
      if (!D().ENVS.some((e) => e.id === s.env)) s.env = 'forest';
      ensureState();
      if (!s.ownedRods.includes(s.equipped.rod)) s.equipped.rod = 'rod_bamboo';
      if (!s.ownedLines.includes(s.equipped.line)) s.equipped.line = 'line_basic';
      return true;
    } catch (e) { console.warn('[systems] load lỗi', e); return false; }
  };
  S.hasSave = function () { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } };
  S.reset = function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* */ }
    const s = G.state;
    if (chase) endChase('silent');
    if (s.onBoat && G.player && G.player.leaveBoat) G.player.leaveBoat();
    Object.keys(s).forEach((k) => delete s[k]);
    Object.assign(s, G.defaultState());
    ensureState();
    if (G.fishing && G.fishing.setRod) { try { G.fishing.setRod('rod_bamboo'); } catch (e) { /* */ } }
    if (G.world && G.world.loadEnvironment) G.world.loadEnvironment('forest');
    toSpawn();
    toast('Đã chơi lại từ đầu. Cần tre, 50 nghìn, và một giấc mơ.', 'info');
    emit('inventory:changed', {}); emit('money:changed', {}); emit('outfit:changed', {});
  };

  // ======================================================================
  // UPDATE & INIT
  // ======================================================================
  let autosave = 0;
  // ---------- Vớt cá nổi sau khi nổ thuốc ----------
  // Cá bị choáng nổi bụng ~60s (fish.js); lại gần (bơi, thuyền, đứng mép nước) để vớt.
  let scoopT = 0;
  function updateScoop(dt) {
    scoopT -= dt;
    if (scoopT > 0 || !G.fish || !G.fish.getAmbient || !G.fish.collect) return;
    scoopT = 0.2;
    const pp = ppos(); if (!pp) return;
    const reach = st().onBoat ? 6 : 3.5;
    const list = G.fish.getAmbient();
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.alive || e.collected || e.claimed || e.kind !== 'fish' || !e.obj) continue;
      const dx = e.obj.position.x - pp.x, dz = e.obj.position.z - pp.z;
      if (dx * dx + dz * dz > reach * reach) continue;
      const ci = G.fish.collect(e);
      if (ci) emit('fish:caught', { catchInfo: ci });
    }
  }
  function onStunned(d) {
    const n = d && d.list ? d.list.length : 0;
    if (n) toast(n + ' con cá nổi bụng! Bơi hoặc chèo thuyền lại gần để vớt (khoảng 1 phút).', 'good');
  }

  function update(dt, t) {
    const s = st();
    const inp = G.input;
    updateNeeds(dt);
    if (npcs.length) updateNPCs(dt, t); else S.nearestNPC = null;
    updateWardens(dt, t);
    updateFineOfficer(dt, t);
    updateHotbar();
    updateScoop(dt);

    if (!inp.blocked && s.mode !== 'menu' && s.mode !== 'dead') {
      // trên thuyền phím E là lên bờ (player.js) — chỉ nói chuyện khi đang đi bộ
      if (inp.pressed('KeyE') && s.mode === 'explore' && S._nearestNPCObj) talk(S._nearestNPCObj);
      for (let i = 0; i < 5; i++) {
        if (inp.pressed('Digit' + (i + 1)) && S.hotbar[i]) S.use(S.hotbar[i]);
      }
    }

    autosave += dt;
    if (autosave >= 30) { autosave = 0; if (s.mode !== 'dead') S.save(); }
  }

  S.init = function () {
    S.load();
    ensureState();
    G.bus.on('fish:caught', onCaught);
    G.bus.on('explosion', onExplosion);
    G.bus.on('fish:stunned', onStunned);
    G.bus.on('env:changed', () => {
      try { const sp = G.world && G.world.getSpawn && G.world.getSpawn(); airY = sp ? sp.y : 0; } catch (e) { /* */ }
      try { buildNPCs(); } catch (e) { console.error('[systems] NPC', e); }
      try { buildWardens(); } catch (e) { console.error('[systems] warden', e); }
      st().wanted = 0;
    });
    window.addEventListener('beforeunload', () => S.save());
    G.addUpdate(update, 50);
  };
})();
