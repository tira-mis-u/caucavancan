// physics.js — va chạm tĩnh (circle + box xoay) có lưới băm không gian, dây verlet, lực nổi, bước cố định
// Nhẹ, xác định (deterministic), không thư viện ngoài. Không cấp phát mỗi frame trên đường nóng.
(function () {
  const G = (window.G = window.G || {});
  const clamp = G.util.clamp;
  const GRAV = 9.81;

  // ======================================================================
  // 1. Registry collider tĩnh + spatial hash
  // ======================================================================
  // Quy ước: rot = rotation.y của mesh (three.js): trục X cục bộ = (cos, -sin), trục Z cục bộ = (sin, cos).
  // hw/hd = nửa kích thước theo X/Z cục bộ. yMin/yMax (tuỳ chọn): khoảng cao collider chắn.
  const CELL = 4, INV = 1 / CELL, OFF = 8192, SPAN = 16384;
  const grid = new Map();          // key số → mảng collider
  const byId = new Map();
  let nextId = 1, queryStamp = 1;
  const cellKey = (ix, iz) => (ix + OFF) * SPAN + (iz + OFF);

  function insert(c) {
    const r = c.br;
    const x0 = Math.floor((c.x - r) * INV), x1 = Math.floor((c.x + r) * INV);
    const z0 = Math.floor((c.z - r) * INV), z1 = Math.floor((c.z + r) * INV);
    c.cells = [];
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = cellKey(ix, iz);
      let arr = grid.get(k);
      if (!arr) { arr = []; grid.set(k, arr); }
      arr.push(c); c.cells.push(k);
    }
  }
  function unlink(c) {
    for (const k of c.cells) {
      const arr = grid.get(k); if (!arr) continue;
      const i = arr.indexOf(c); if (i >= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); }
      if (!arr.length) grid.delete(k);
    }
    c.cells = null;
  }
  function finish(c, o) {
    c.tag = o.tag || 'env';
    c.yMin = o.yMin != null && isFinite(o.yMin) ? o.yMin : -Infinity;
    c.yMax = o.yMax != null && isFinite(o.yMax) ? o.yMax : Infinity;
    c.id = nextId++; c.q = 0; c.data = o.data || null;
    byId.set(c.id, c); insert(c);
    return c.id;
  }
  function addCircle(o) {
    if (!o || !isFinite(o.x) || !isFinite(o.z)) return 0;
    const r = Math.max(0.01, +o.r || 0.5);
    return finish({ type: 0, x: +o.x, z: +o.z, r, br: r }, o);
  }
  function addBox(o) {
    if (!o || !isFinite(o.x) || !isFinite(o.z)) return 0;
    const hw = Math.max(0.01, +o.hw || 0.5), hd = Math.max(0.01, +o.hd || 0.5), rot = +o.rot || 0;
    return finish({ type: 1, x: +o.x, z: +o.z, hw, hd, rot, c: Math.cos(rot), s: Math.sin(rot), br: Math.hypot(hw, hd) }, o);
  }
  function remove(id) {
    const c = byId.get(id); if (!c) return false;
    unlink(c); byId.delete(id); return true;
  }
  // di chuyển collider (vd NPC / quản lý). Chỉ băm lại khi đổi ô.
  function move(id, x, z, rot) {
    const c = byId.get(id); if (!c) return false;
    const oldCells0 = Math.floor((c.x - c.br) * INV), oldCells1 = Math.floor((c.z - c.br) * INV);
    const oldCells2 = Math.floor((c.x + c.br) * INV), oldCells3 = Math.floor((c.z + c.br) * INV);
    c.x = x; c.z = z;
    if (c.type === 1 && rot != null && rot !== c.rot) { c.rot = rot; c.c = Math.cos(rot); c.s = Math.sin(rot); }
    if (Math.floor((x - c.br) * INV) !== oldCells0 || Math.floor((z - c.br) * INV) !== oldCells1 ||
      Math.floor((x + c.br) * INV) !== oldCells2 || Math.floor((z + c.br) * INV) !== oldCells3) { unlink(c); insert(c); }
    return true;
  }
  function clear(tag) {
    if (tag == null) { grid.clear(); byId.clear(); return; }
    for (const [id, c] of byId) if (c.tag === tag) { unlink(c); byId.delete(id); }
  }

  // Thu thập collider trong AABB vào mảng dùng lại (không cấp phát)
  const found = [];
  function gather(minX, minZ, maxX, maxZ) {
    found.length = 0;
    if (!byId.size) return found;
    const st = ++queryStamp;
    const x0 = Math.floor(minX * INV), x1 = Math.floor(maxX * INV), z0 = Math.floor(minZ * INV), z1 = Math.floor(maxZ * INV);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4096) { // truy vấn khổng lồ: duyệt thẳng
      for (const c of byId.values()) { c.q = st; found.push(c); }
      return found;
    }
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const arr = grid.get(cellKey(ix, iz)); if (!arr) continue;
      for (let i = 0; i < arr.length; i++) { const c = arr[i]; if (c.q !== st) { c.q = st; found.push(c); } }
    }
    return found;
  }
  const yOK = (c, y, h) => y == null || !(y >= c.yMax || y + h <= c.yMin);
  // skip: tag (string) hoặc mảng tag cần bỏ qua
  const skipT = (c, skip) => !!skip && (typeof skip === 'string' ? c.tag === skip : skip.indexOf(c.tag) >= 0);

  // Điểm gần nhất / pháp tuyến đẩy ra cho một vòng tròn vs collider. Ghi vào hit, trả về độ lún (>0 nếu chạm).
  const hit = { nx: 0, nz: 0, depth: 0, id: 0 };
  function penetrate(c, px, pz, r) {
    if (c.type === 0) {
      const dx = px - c.x, dz = pz - c.z, R = r + c.r, d2 = dx * dx + dz * dz;
      if (d2 >= R * R) return 0;
      const d = Math.sqrt(d2);
      if (d < 1e-6) { hit.nx = 1; hit.nz = 0; } else { hit.nx = dx / d; hit.nz = dz / d; }
      return R - d;
    }
    const dx = px - c.x, dz = pz - c.z;
    const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
    const qx = clamp(lx, -c.hw, c.hw), qz = clamp(lz, -c.hd, c.hd);
    let nlx, nlz, depth;
    if (qx === lx && qz === lz) { // tâm nằm trong hộp → đẩy theo trục gần mép nhất
      const ex = c.hw - Math.abs(lx), ez = c.hd - Math.abs(lz);
      if (ex < ez) { nlx = lx >= 0 ? 1 : -1; nlz = 0; depth = ex + r; } else { nlx = 0; nlz = lz >= 0 ? 1 : -1; depth = ez + r; }
    } else {
      const ox = lx - qx, oz = lz - qz, d2 = ox * ox + oz * oz;
      if (d2 >= r * r) return 0;
      const d = Math.sqrt(d2);
      nlx = ox / d; nlz = oz / d; depth = r - d;
    }
    hit.nx = nlx * c.c + nlz * c.s; hit.nz = -nlx * c.s + nlz * c.c;
    return depth;
  }

  // Đẩy pos (Vector3/obj {x,z}) ra khỏi mọi collider. y = cao độ chân (bỏ qua collider thấp hơn / cao hơn).
  // height = chiều cao vật (mặc định 1.8). skipTag: bỏ qua tag (vd chính nó). Trả về true nếu có va chạm.
  const lastNormal = { x: 0, z: 0, depth: 0 };
  function resolveCircle(pos, radius, y, height, skipTag, skipId) {
    if (!pos || !byId.size) return false;
    const r = radius || 0.35, h = height == null ? 1.8 : height;
    let any = false, sx = 0, sz = 0, total = 0;
    for (let it = 0; it < 4; it++) {
      const list = gather(pos.x - r, pos.z - r, pos.x + r, pos.z + r);
      let moved = false;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (skipT(c, skipTag) || (skipId && c.id === skipId) || !yOK(c, y, h)) continue;
        const d = penetrate(c, pos.x, pos.z, r);
        if (d > 1e-5) {
          pos.x += hit.nx * (d + 1e-4); pos.z += hit.nz * (d + 1e-4);
          sx += hit.nx * d; sz += hit.nz * d; total += d; moved = true; any = true;
        }
      }
      if (!moved) break;
    }
    if (any) {
      const l = Math.hypot(sx, sz) || 1;
      lastNormal.x = sx / l; lastNormal.z = sz / l; lastNormal.depth = total;
    }
    return any;
  }

  // Mặt trên cao nhất (yMax hữu hạn) dưới điểm (x,z) mà vật đang ở cao độ y có thể bước lên (≤ y + step)
  function floorAt(x, z, y, step) {
    const list = gather(x - 0.01, z - 0.01, x + 0.01, z + 0.01);
    let best = -Infinity; const lim = y + (step == null ? 0.4 : step);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!isFinite(c.yMax) || c.yMax > lim || c.yMax <= best) continue;
      if (penetrate(c, x, z, 0.001) > 0) best = c.yMax;
    }
    return best;
  }

  // Tia trên mặt phẳng XZ (quét vòng tròn bán kính radius). y (tuỳ chọn) lọc theo cao độ.
  // Trả về THREE.Vector3 điểm chạm (có .t ∈ [0,1], .nx, .nz, .id) hoặc null.
  function raycastXZ(from, to, radius, y, opts) {
    if (!from || !to || !byId.size) return null;
    const r = radius || 0;
    const ox = from.x, oz = from.z, dx = to.x - ox, dz = to.z - oz;
    const list = gather(Math.min(ox, to.x) - r, Math.min(oz, to.z) - r, Math.max(ox, to.x) + r, Math.max(oz, to.z) + r);
    const skip = opts && opts.skipTag;
    let bestT = Infinity, bnx = 0, bnz = 0, bid = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (skipT(c, skip) || (y != null && (y > c.yMax || y < c.yMin))) continue;
      if (c.type === 0) {
        const R = c.r + r, fx = ox - c.x, fz = oz - c.z;
        const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), cc = fx * fx + fz * fz - R * R;
        if (cc <= 0) { if (0 < bestT) { bestT = 0; const l = Math.hypot(fx, fz) || 1; bnx = fx / l; bnz = fz / l; bid = c.id; } continue; }
        if (a < 1e-12) continue;
        const disc = b * b - 4 * a * cc; if (disc < 0) continue;
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t >= 0 && t <= 1 && t < bestT) { bestT = t; const hx = fx + dx * t, hz = fz + dz * t, l = Math.hypot(hx, hz) || 1; bnx = hx / l; bnz = hz / l; bid = c.id; }
      } else {
        // slab test trong hệ cục bộ, hộp nới thêm r
        const lx = (ox - c.x) * c.c - (oz - c.z) * c.s, lz = (ox - c.x) * c.s + (oz - c.z) * c.c;
        const ldx = dx * c.c - dz * c.s, ldz = dx * c.s + dz * c.c;
        const hw = c.hw + r, hd = c.hd + r;
        let t0 = 0, t1 = 1, nlx = 0, nlz = 0;
        if (Math.abs(ldx) < 1e-12) { if (lx < -hw || lx > hw) continue; }
        else {
          let ta = (-hw - lx) / ldx, tb = (hw - lx) / ldx, s = -1;
          if (ta > tb) { const tt = ta; ta = tb; tb = tt; s = 1; }
          if (ta > t0) { t0 = ta; nlx = s; nlz = 0; }
          if (tb < t1) t1 = tb;
          if (t0 > t1) continue;
        }
        if (Math.abs(ldz) < 1e-12) { if (lz < -hd || lz > hd) continue; }
        else {
          let ta = (-hd - lz) / ldz, tb = (hd - lz) / ldz, s = -1;
          if (ta > tb) { const tt = ta; ta = tb; tb = tt; s = 1; }
          if (ta > t0) { t0 = ta; nlx = 0; nlz = s; }
          if (tb < t1) t1 = tb;
          if (t0 > t1) continue;
        }
        if (t0 < bestT) { bestT = t0; bnx = nlx * c.c + nlz * c.s; bnz = -nlx * c.s + nlz * c.c; bid = c.id; }
      }
    }
    if (bestT === Infinity) return null;
    const fy = from.y || 0, ty = to.y == null ? fy : to.y;
    const out = (opts && opts.out) || (typeof THREE !== 'undefined' ? new THREE.Vector3() : { x: 0, y: 0, z: 0 });
    out.x = ox + dx * bestT; out.z = oz + dz * bestT; out.y = fy + (ty - fy) * bestT;
    out.t = bestT; out.nx = bnx; out.nz = bnz; out.id = bid;
    return out;
  }

  // ======================================================================
  // 2. Bước cố định + nội suy
  // ======================================================================
  const STEP = 1 / 60;
  // stepper.advance(dt) → số bước cần chạy (≤ maxSteps); stepper.alpha ∈ [0,1) để nội suy hiển thị
  function makeStepper(step, maxSteps) {
    step = step || STEP; maxSteps = maxSteps || 5;
    return {
      step, acc: 0, alpha: 0,
      advance(dt) {
        if (!(dt > 0)) { this.alpha = this.acc / step; return 0; }
        this.acc += Math.min(dt, step * maxSteps);
        let n = 0;
        while (this.acc >= step - 1e-7 && n < maxSteps) { this.acc -= step; n++; }
        if (this.acc < 0) this.acc = 0;
        if (n >= maxSteps && this.acc > step) this.acc = 0; // chống "vòng xoáy chết"
        this.alpha = clamp(this.acc / step, 0, 1);
        return n;
      },
      reset() { this.acc = 0; this.alpha = 0; },
    };
  }

  // ======================================================================
  // 3. Truy vấn nước an toàn
  // ======================================================================
  function waterH(x, z) {
    const w = G.world;
    try { if (w && w.getWaterHeight) { const h = w.getWaterHeight(x, z); if (isFinite(h)) return h; } } catch (e) { /* */ }
    return -1e6;
  }
  function isWater(x, z) { const w = G.world; try { return !!(w && w.isWater && w.isWater(x, z)); } catch (e) { return false; } }
  function groundH(x, z) { const w = G.world; try { if (w && w.groundHeight) { const h = w.groundHeight(x, z); if (isFinite(h)) return h; } } catch (e) { /* */ } return -1e6; }

  // ======================================================================
  // 4. Dây verlet
  // ======================================================================
  // new Rope(segments, length). update(dt, start, end, opts):
  //  opts.length   chiều dài tổng (mặc định = khoảng cách * (1 + slack) + extra)
  //  opts.slack    tỉ lệ chùng (0 = căng thẳng)   opts.extra chiều dài dư tuyệt đối (m)
  //  opts.wind {x,z} m/s, opts.gravity, opts.airDrag, opts.waterDrag, opts.iterations
  //  opts.floatOnWater (dây nổi trên mặt nước), opts.collideGround, opts.waterGravity (tỉ lệ trọng lực trong nước)
  function Rope(segments, length) {
    const n = Math.max(2, segments | 0);
    this.n = n; this.length = length || 1; this.points = []; this.prev = [];
    for (let i = 0; i <= n; i++) {
      this.points.push(typeof THREE !== 'undefined' ? new THREE.Vector3() : { x: 0, y: 0, z: 0 });
      this.prev.push({ x: 0, y: 0, z: 0 });
    }
    this.inited = false; this.tension = 0; this.lastDt = STEP; this.restLen = this.length;
  }
  Rope.prototype.reset = function (a, b, sag) {
    const n = this.n; sag = sag || 0;
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = this.points[i], q = this.prev[i];
      p.x = a.x + (b.x - a.x) * u; p.y = a.y + (b.y - a.y) * u - sag * 4 * u * (1 - u); p.z = a.z + (b.z - a.z) * u;
      q.x = p.x; q.y = p.y; q.z = p.z;
    }
    this.inited = true; this.lastDt = STEP;
  };
  Rope.prototype.update = function (dt, a, b, o) {
    o = o || EMPTY;
    const n = this.n, P = this.points, Q = this.prev;
    const dist = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y) + (b.z - a.z) * (b.z - a.z));
    const rest = o.length != null ? Math.max(0.05, o.length) : dist * (1 + (o.slack || 0)) + (o.extra || 0);
    this.restLen = rest;
    const seg = rest / n;
    // đầu dây nhảy quá xa (dây mới / dịch chuyển) → dựng lại
    const jx = P[0].x - a.x, jy = P[0].y - a.y, jz = P[0].z - a.z;
    if (!this.inited || jx * jx + jy * jy + jz * jz > 400) this.reset(a, b, 0);
    if (!(dt > 0)) dt = STEP;
    dt = Math.min(dt, 1 / 30);
    const ratio = dt / (this.lastDt || dt); this.lastDt = dt;
    const g = o.gravity != null ? o.gravity : GRAV;
    const airK = o.airDrag != null ? o.airDrag : 0.6, waterK = o.waterDrag != null ? o.waterDrag : 8;
    const wg = o.waterGravity != null ? o.waterGravity : 0.12;
    const wx = (o.wind && o.wind.x) || 0, wz = (o.wind && o.wind.z) || 0;
    const floatW = o.floatOnWater !== false, ground = o.collideGround !== false;
    const dt2 = dt * dt, airDamp = Math.exp(-airK * dt), wDamp = Math.exp(-waterK * dt);
    // tích phân verlet (điểm giữa)
    for (let i = 1; i < n; i++) {
      const p = P[i], q = Q[i];
      let vx = (p.x - q.x) * ratio, vy = (p.y - q.y) * ratio, vz = (p.z - q.z) * ratio;
      q.x = p.x; q.y = p.y; q.z = p.z;
      const wh = waterH(p.x, p.z);
      if (p.y < wh) { vx *= wDamp; vy *= wDamp; vz *= wDamp; p.y -= g * wg * dt2; }
      else {
        vx = vx * airDamp + wx * (1 - airDamp) * dt; vz = vz * airDamp + wz * (1 - airDamp) * dt; vy *= airDamp;
        p.y -= g * dt2;
      }
      p.x += vx; p.y += vy; p.z += vz;
    }
    // ràng buộc khoảng cách
    const iters = o.iterations || 12;
    for (let k = 0; k < iters; k++) {
      P[0].x = a.x; P[0].y = a.y; P[0].z = a.z;
      P[n].x = b.x; P[n].y = b.y; P[n].z = b.z;
      for (let i = 0; i < n; i++) {
        const p = P[i], q = P[i + 1];
        const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-9) continue;
        const diff = (d - seg) / d;
        const wa = i === 0 ? 0 : 0.5, wb = i + 1 === n ? 0 : 0.5;
        const sum = wa + wb; if (!sum) continue;
        const ka = diff * wa / sum, kb = diff * wb / sum;
        p.x += dx * ka; p.y += dy * ka; p.z += dz * ka;
        q.x -= dx * kb; q.y -= dy * kb; q.z -= dz * kb;
      }
    }
    // Gauss-Seidel hội tụ chậm với dây dài → khi gần căng (dist/rest → 1) kéo dây về đường thẳng
    // (dây thật căng thì thẳng). Dịch cả prev để không bơm thêm vận tốc.
    const rr = rest > 1e-6 ? dist / rest : 1;
    const sK = rr <= 0.99 ? 0 : Math.min(1, (rr - 0.99) / 0.01);
    if (sK > 0) {
      const s = sK * sK * 0.85;
      for (let i = 1; i < n; i++) {
        const u = i / n, p = P[i], q = Q[i];
        const lx = a.x + (b.x - a.x) * u, ly = a.y + (b.y - a.y) * u, lz = a.z + (b.z - a.z) * u;
        const ddx = (lx - p.x) * s, ddy = (ly - p.y) * s, ddz = (lz - p.z) * s;
        p.x += ddx; p.y += ddy; p.z += ddz; q.x += ddx; q.y += ddy; q.z += ddz;
      }
    }
    // va chạm mặt nước / đất (chỉ kiểm điểm thấp để tiết kiệm)
    if (floatW || ground) {
      const minEnd = Math.min(a.y, b.y) + 0.8;
      for (let i = 1; i < n; i++) {
        const p = P[i];
        if (p.y > minEnd) continue;
        if (floatW) { const wh = waterH(p.x, p.z); if (p.y < wh + 0.004 && isWater(p.x, p.z)) { p.y = wh + 0.004; continue; } }
        if (ground) { const gh = groundH(p.x, p.z); if (p.y < gh + 0.02) p.y = gh + 0.02; }
      }
    }
    P[0].x = a.x; P[0].y = a.y; P[0].z = a.z;
    P[n].x = b.x; P[n].y = b.y; P[n].z = b.z;
    // ước lượng độ căng: 1 khi dây thẳng, 0 khi chùng nhiều
    const r = rest > 1e-6 ? dist / rest : 1;
    this.tension = clamp((r - 0.9) / 0.1, 0, 1);
    return this;
  };
  // ghi các điểm vào Float32Array (cho BufferGeometry), trả về số điểm
  Rope.prototype.writeTo = function (arr) {
    const P = this.points, n = Math.min(P.length, (arr.length / 3) | 0);
    for (let i = 0; i < n; i++) { arr[i * 3] = P[i].x; arr[i * 3 + 1] = P[i].y; arr[i * 3 + 2] = P[i].z; }
    return n;
  };
  const EMPTY = {};

  // ======================================================================
  // 5. Lực nổi (lò xo - giảm chấn theo độ ngập tại nhiều điểm)
  // ======================================================================
  // buoyancy(obj, opts) — obj: Object3D (hoặc {position}). Trạng thái lưu ở obj.userData.buoy.
  // opts: dt, draft (độ ngập cân bằng, m), length/width (để lấy mẫu 4 điểm → pitch/roll), heading (mặc định rotation.y),
  //  maxSubmerge (độ ngập tối đa tính lực, mặc định 2*draft), extraForce (gia tốc thêm theo phương đứng, âm = kéo xuống),
  //  pitchBias/rollBias (rad, lệch cân bằng), angStiffness, damping (0..1 tỉ lệ tắt dần), applyRotation (true: ghi rotation.x/z),
  //  floor (y đáy, không chìm qua), gravity
  // Trả về state {vy, pitch, roll, pv, rv, submerged (0..1), inWater}
  function buoyancy(obj, o) {
    if (!obj) return null;
    o = o || EMPTY;
    const pos = obj.position || obj;
    const ud = obj.userData || obj;
    let st = ud.buoy;
    if (!st) st = ud.buoy = { vy: 0, pitch: 0, roll: 0, pv: 0, rv: 0, submerged: 0, inWater: false };
    let dt = o.dt; if (!(dt > 0)) return st;
    dt = Math.min(dt, 0.1);
    const g = o.gravity != null ? o.gravity : GRAV;
    const draft = Math.max(0.005, o.draft || 0.1);
    const maxSub = o.maxSubmerge || draft * 2;
    const L = (o.length || 0) * 0.5, W = (o.width || 0) * 0.5;
    const hd = o.heading != null ? o.heading : (obj.rotation ? obj.rotation.y : 0);
    const fx = Math.sin(hd), fz = Math.cos(hd), rx = Math.cos(hd), rz = -Math.sin(hd);
    const angK = o.angStiffness || 30;
    const zeta = o.damping != null ? o.damping : 0.45;
    const k = g / draft, wn = Math.sqrt(k), cLin = 2 * zeta * wn, cAng = 2 * zeta * Math.sqrt(angK);
    const extra = o.extraForce || 0;
    // các điểm lấy mẫu: tâm, hoặc mũi/đuôi/trái/phải
    const nS = (L > 0 || W > 0) ? 4 : 1;
    // bước con để ổn định với lò xo cứng
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      let sumD = 0, tp = 0, tr = 0;
      for (let i = 0; i < nS; i++) {
        let a = 0, b = 0;
        if (nS === 4) { if (i === 0) a = L; else if (i === 1) a = -L; else if (i === 2) b = W; else b = -W; }
        const sx = pos.x + fx * a + rx * b, sz = pos.z + fz * a + rz * b;
        const yi = pos.y - a * Math.sin(st.pitch) + b * Math.sin(st.roll);
        const wi = waterH(sx, sz);
        const d = clamp(wi - yi + draft, 0, maxSub);
        sumD += d;
        if (nS === 4) {
          if (a) tp += a * (d - draft) / (L * L * 2);
          if (b) tr += b * (d - draft) / (W * W * 2);
        }
      }
      const avgD = sumD / nS;
      const subFrac = clamp(avgD / maxSub, 0, 1);
      st.submerged = subFrac; st.inWater = avgD > 0;
      let ay = k * avgD - g + extra;
      // giảm chấn chỉ khi trong nước; ngoài không khí chỉ có cản nhẹ
      ay -= (avgD > 0 ? cLin * Math.min(1, avgD / draft) + 0.1 : 0.05) * st.vy;
      st.vy += ay * h;
      pos.y += st.vy * h;
      if (o.floor != null && pos.y < o.floor) { pos.y = o.floor; if (st.vy < 0) st.vy = 0; }
      if (nS === 4) {
        const inW = avgD > 0 ? 1 : 0.05;
        // tp ≈ pitch, tr ≈ -roll khi mặt nước phẳng → cân bằng tại pitch = pitchBias, roll = rollBias
        const kb = inW + 0.08;
        const pa = -angK * (inW * tp + 0.08 * st.pitch - (o.pitchBias || 0) * kb) - cAng * st.pv * Math.max(inW, 0.3);
        const ra = angK * (inW * tr - 0.08 * st.roll + (o.rollBias || 0) * kb) - cAng * st.rv * Math.max(inW, 0.3);
        st.pv += pa * h; st.rv += ra * h;
        st.pitch = clamp(st.pitch + st.pv * h, -0.6, 0.6);
        st.roll = clamp(st.roll + st.rv * h, -0.6, 0.6);
      }
    }
    if (o.applyRotation && obj.rotation) { obj.rotation.x = st.pitch; obj.rotation.z = st.roll; }
    return st;
  }
  function resetBuoyancy(obj) { const ud = obj && (obj.userData || obj); if (ud) ud.buoy = null; }

  // ======================================================================
  // 6. Tích phân đạn đạo có cản không khí + gió (dùng chung cho mồi, thuốc nổ)
  // ======================================================================
  // state {x,y,z,vx,vy,vz}; drag k (1/m, cản bậc hai theo vận tốc tương đối với gió)
  function ballisticStep(s, h, k, wind, g) {
    const wx = (wind && wind.x) || 0, wz = (wind && wind.z) || 0;
    const rx = s.vx - wx, ry = s.vy, rz = s.vz - wz;
    const sp = Math.sqrt(rx * rx + ry * ry + rz * rz);
    s.vx -= k * sp * rx * h; s.vy -= (k * sp * ry + (g == null ? GRAV : g)) * h; s.vz -= k * sp * rz * h;
    s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h;
  }
  // Giải vận tốc ban đầu để bay từ from tới to trong thời gian T (có cản + gió), bằng phương pháp bắn lặp.
  function solveLaunch(from, to, T, k, wind, h, out) {
    h = h || 1 / 120;
    const g = GRAV, steps = Math.max(1, Math.round(T / h));
    T = steps * h;
    out = out || {};
    let vx = (to.x - from.x) / T, vy = (to.y - from.y) / T + 0.5 * g * T, vz = (to.z - from.z) / T;
    const s = {};
    for (let it = 0; it < 6; it++) {
      s.x = from.x; s.y = from.y; s.z = from.z; s.vx = vx; s.vy = vy; s.vz = vz;
      for (let i = 0; i < steps; i++) ballisticStep(s, h, k, wind, g);
      const ex = to.x - s.x, ey = to.y - s.y, ez = to.z - s.z;
      if (ex * ex + ey * ey + ez * ez < 1e-4) break;
      vx += ex / T; vy += ey / T; vz += ez / T;
    }
    out.vx = vx; out.vy = vy; out.vz = vz; out.steps = steps; out.h = h; out.T = T;
    return out;
  }

  G.physics = {
    STEP, GRAVITY: GRAV,
    addCircle, addBox, remove, move, clear, resolveCircle, floorAt, raycastXZ, lastNormal,
    Rope, buoyancy, resetBuoyancy, makeStepper, ballisticStep, solveLaunch,
    count: () => byId.size,
    get: (id) => byId.get(id) || null,
    query: (x, z, r) => gather(x - r, z - r, x + r, z + r).slice(),
  };
})();
