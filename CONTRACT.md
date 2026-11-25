# CÂU CÁ VẠN CÂN 3D — Hợp đồng kiến trúc (BẮT BUỘC tuân theo)

Game chạy trong trình duyệt, mở trực tiếp `index.html` (file://) hoặc qua `python -m http.server`.

## Quy tắc kỹ thuật
- **Three.js r128** nạp global từ CDN (`window.THREE`). KHÔNG dùng ES modules, KHÔNG `import`, KHÔNG addons (không OrbitControls, không GLTFLoader...).
- r128: KHÔNG có `CapsuleGeometry` (dùng Cylinder + 2 Sphere), KHÔNG có `THREE.Geometry` cũ — chỉ BufferGeometry. Có: Box/Sphere/Cylinder/Cone/Torus/Plane/Circle/Ring/Lathe/Tube/Extrude/Shape/Icosahedron/Dodecahedron/Octahedron/Tetrahedron, ShaderMaterial, Points, InstancedMesh, Sprite, CanvasTexture.
- Mỗi file là classic script, bọc trong IIFE: `(function(){ ... })();` và gắn API vào `window.G.<tên>`.
- Mỗi module chỉ sửa file của mình. Không ghi đè API của module khác.
- Mọi text hiển thị cho người chơi bằng **tiếng Việt có dấu**.
- Đồ họa: procedural (không file ảnh/model ngoài). Âm thanh: WebAudio tổng hợp.
- Hiệu năng: mục tiêu 60fps trên laptop thường. Dùng InstancedMesh cho cây/cỏ/đá số lượng lớn, giới hạn particle, dispose khi đổi môi trường.
- Luôn defensive: gọi module khác qua `G.x && G.x.fn && G.x.fn(...)` nếu có khả năng chưa tồn tại.

## Thứ tự nạp script (index.html)
`core.js → data.js → audio.js → fx.js → world.js → fish.js → player.js → fishing.js → systems.js → ui.js → main.js`

`main.js` gọi `init()` của mỗi module theo thứ tự: audio, fx, world, fish, player, fishing, systems, ui; rồi `G.world.loadEnvironment('forest')`; rồi chạy vòng lặp.

## Core (core.js — đã có sẵn)
- `G.scene`, `G.camera` (PerspectiveCamera), `G.renderer`, `G.clock`
- `G.bus.on(evt, fn)`, `G.bus.off(evt, fn)`, `G.bus.emit(evt, data)`
- `G.addUpdate(fn(dt, t), order)` — order nhỏ chạy trước. Quy ước: input 0, world 10, fish 20, player 30, fishing 40, systems 50, fx 60, ui 70. Render sau cùng (core lo).
- `G.input`: `keys[code]` (true khi giữ, theo `KeyboardEvent.code` vd 'KeyW','Space','ShiftLeft'), `pressed(code)` (true đúng 1 frame), `mouse = {x,y,nx,ny, left, right, leftPressed, leftReleased, rightPressed, wheel, dx, dy}` (nx,ny ∈ [-1,1] NDC). `wheel` và `dx,dy` reset mỗi frame. Nếu `G.state.mode === 'menu'` hoặc UI đang mở panel thì `G.input.blocked = true` — các module gameplay phải bỏ qua input khi `G.input.blocked`.
- `G.util`: `rand(a,b)`, `randInt(a,b)`, `pick(arr)`, `clamp(v,a,b)`, `lerp(a,b,t)`, `damp(a,b,lambda,dt)`, `smoothstep`, `fmtMoney(vnd) → "15.000₫"`, `fmtWeight(kg) → "1,2 kg" / "3,4 tấn"`, `weightedPick([{w,...}])`, `v3(x,y,z)`.
- `G.state` (trạng thái game, save được):
  ```
  money: 50000 (VND), inventory: { itemId: count }, fishBag: [ {speciesId, weight, name} ],
  equipped: { rod:'rod_bamboo', line:'line_basic', bait:'bait_worm' },
  env: 'forest', time: 6.5 (giờ 0..24), day: 1,
  mode: 'explore' | 'fishing' | 'fight' | 'combat' | 'shoot' | 'swim' | 'boat' | 'menu' | 'dead',
  drunk: 0..1, hunger: 0..100 (100 = no), stamina: 0..100, hp: 100,
  wanted: 0..1 (độ bị quản lý chú ý), onBoat: null | boatId, ownedBoats: [],
  stats: { caught:0, biggest:0, junk:0, explosions:0 }, discovered: { speciesId: true }
  ```
- `G.setMode(m)` — đổi mode và emit `'mode:changed' {from,to}`.

## Data (data.js — đã có sẵn)
`G.data.ENVS, RODS, LINES, BAITS, CONSUMABLES, BOATS, JUNK, MATERIALS, RECIPES, SHOP`, `G.data.item(id)` tra mọi item theo id. Xem file để biết field.

## Sự kiện chuẩn (bus)
| event | data | ai phát |
|---|---|---|
| `env:changed` | `{env}` | world |
| `mode:changed` | `{from,to}` | core |
| `cast` | `{pos, power, accuracy}` | fishing |
| `bobber:landed` | `{pos, depth}` | fishing |
| `bite` | `{species}` | fishing |
| `hooked` | `{catchInfo}` | fishing |
| `fight:end` | `{result:'caught'|'escaped'|'line_broke'|'dragged', catchInfo}` | fishing |
| `fish:caught` | `{catchInfo}` | fishing (khi kéo được lên bờ) |
| `player:dragged` | `{catchInfo}` | fishing → player xử lý rơi xuống nước |
| `combat:start` | `{catchInfo, fishObj}` | fishing (cá behavior 'fighter' nhảy lên bờ đánh) |
| `combat:end` | `{win:bool, catchInfo}` | player |
| `warden:spotted`, `warden:chase`, `warden:escaped`, `warden:caught` | `{}` | systems |
| `item:used` | `{id}` | systems |
| `explosion` | `{pos, size}` | ai cũng được (fx lắng nghe) |

`catchInfo = { kind:'fish'|'junk'|'material', id, name, weight (kg), species (object nếu là cá), value (VND) }`

## API từng module

### G.world (world.js)
- `init()`, `loadEnvironment(envId)` (xóa env cũ, dựng env mới, emit `env:changed`)
- `current` → object ENV đang dùng (từ G.data.ENVS)
- `groundHeight(x,z)` → y mặt đất (dưới nước là đáy)
- `getWaterLevel()` → mực nước trung bình hiện tại (đã tính thủy triều)
- `getWaterHeight(x,z)` → y mặt nước tại điểm (sóng + triều) — PHẢI khớp shader
- `isWater(x,z)` → true nếu điểm đó là mặt nước (đáy < mực nước)
- `getDepth(x,z)` → mét (0 nếu là đất)
- `getConditions(x,z)` → `{ time, isNight, light (0..1), tide (-1..1), tideLabel, waterTemp (°C), weather:'clear'|'rain'|'storm'|'fog', waveHeight, env, waterBody }`
- `getSpawn()` → `THREE.Vector3` vị trí bờ để người chơi đứng
- `getNPCSpots()` → `[{pos:Vector3, role:'shop'|'bar'|'banhmi'|'craft'|'boat'}]`
- `zones` → `[{x,z,r,name}]` khu vực bị quản lý; `isManagedZone(x,z)` → zone|null
- `getBounds()` → `{minX,maxX,minZ,maxZ}`; world không để người chơi ra ngoài.
- Thời gian: world tăng `G.state.time` (1 giờ game = 60 giây thật), cập nhật mặt trời/trăng/sao/ánh sáng.
- Môi trường 'airplane': máy bay bay trên biển; `getSpawn()` trên sàn máy bay (cao ~120m); `G.world.planeDeck` = Object3D người chơi đứng; nước ở dưới rất xa.

### G.fish (fish.js)
- `SPECIES` mảng loài (xem field bên dưới); `get(id)`
- `createModel(speciesId, lengthMeters)` → `THREE.Group` có `userData.animate(t, intensity)` (vẫy đuôi, v.v.), hướng đầu về **+Z**.
- `createJunkModel(itemId)` → Group (giày, dép, quần áo, quần sịp, lốp, sắt vụn...)
- `rollCatch({x,z,depth, baitId, rodId, conditions})` → `catchInfo` (có thể junk/material).
- `biteChance({...cùng tham số})` → xác suất cắn mỗi giây (0..1) để fishing dùng.
- `populate()` tự gọi khi `env:changed`: cá bơi lượn trong nước (ambient), bóng cá, cá nhảy khỏi mặt nước.
- `lengthFromWeight(species, kg)` → mét.
- SPECIES field: `{ id, name, category: 'be'|'thuong'|'to'|'khong_lo'|'quai_vat'|'dot_bien'|'meme', minW, maxW (kg), strength (1..100), speed (1..10), stamina (1..100), difficulty (1..10), behavior: 'normal'|'runner'|'diver'|'jumper'|'fighter'|'flying'|'puller', baits:[baitIds], envs:[envIds], waterBodies:['pond','lake','river','sea','sky'], depth:[min,max], temp:[min,max], time:'day'|'night'|'any', tide: 'high'|'low'|'any', price (VND/kg), rarity (1..100, cao = hiếm), desc, technique (gợi ý kỹ thuật, tiếng Việt), color }`

### G.player (player.js)
- `obj` (THREE.Group nhân vật), `pos` (= obj.position), `facing` (rad), `rodTip()` → Vector3 vị trí đầu cần (fishing gắn cần vào `G.player.hand` Object3D)
- `hand` Object3D tay phải để gắn cần
- `setAnim(name)`: 'idle','walk','run','swim','cast','reel','pull','fall','drink','eat','attack','hit','shoot','sit'
- Di chuyển WASD (theo hướng camera), Shift chạy, Space nhảy/bơi lên; bơi khi vào nước sâu; camera góc 3 người: giữ chuột phải kéo để xoay, lăn chuột zoom (khi không fishing/fight).
- Thuyền: `boardBoat(boatId)`, `leaveBoat()`; khi `G.state.onBoat` WASD lái thuyền trên mặt nước; dựng model thuyền theo `G.data.BOATS`.
- Bị kéo xuống nước: nghe `player:dragged` → animation bay xuống nước, mode 'swim', bơi vào bờ.
- Đánh nhau với cá: nghe `combat:start` → mode 'combat', cá lên bờ có HP, chuột trái đánh, Shift né, cá tấn công; thắng → emit `fish:caught`; thua → mất HP, cá chạy mất.
- Chế độ bắn cá: phím G → mode 'shoot', crosshair, chuột trái bắn đạn vào cá ambient (G.fish.getAmbient()), trúng → cá nổi + nhận tiền nhỏ / vật phẩm, có hiệu ứng nổ.
- Say rượu (`G.state.drunk`): camera lắc, điều khiển lệch.
- Bị quản lý đuổi: chạy (Shift) nhanh hơn khi mode 'explore'.
- `teleport(vec3)`.

### G.fishing (fishing.js)
- Phím F: cầm/cất cần (mode 'fishing'). Cần gắn vào `G.player.hand`, model theo loại cần (spin/vertical/horizontal/pole/...).
- Quăng: giữ chuột trái → thanh lực dao động (càng mạnh càng khó trúng, lệch hướng), nhả → quăng. Hướng = hướng camera. Có gió/độ say làm lệch. Dây (line) vẽ bằng curve/catenary, phao (bobber) nổi theo `getWaterHeight`.
- Mồi: phím B mở chọn mồi (UI gọi `G.fishing.setBait(id)`), phím R đổi cần (`G.fishing.setRod(id)`), chỉnh độ sâu thả mồi bằng lăn chuột khi phao đã xuống (`G.fishing.depth`).
- Kỹ thuật: 'spin' (cuộn đều, giật nhẹ — giữ chuột trái cuộn mồi giả về), 'vertical' (thả thẳng, nhấp nhấp — W/S), 'float' (phao chờ cá cắn). Mỗi loài thích kỹ thuật khác nhau (dùng `species.behavior` & `baits`).
- Cá cắn: phao chìm/rung + âm thanh; người chơi phải nhấn Space đúng cửa sổ thời gian (cá khó → cửa sổ ngắn) để giật câu.
- Vật cá (mode 'fight'): `tension` 0..1 (quá 1 đứt dây theo `line.strength`), `fishStamina`, `distance`. Chuột trái = cuộn, A/D = nghiêng cần ngược hướng cá chạy (đúng thì giảm tension, tăng sát thương), W = giật cần (pump). Cá behavior khác nhau: runner chạy xa, diver lặn sâu, jumper nhảy khỏi nước (nhấn S hạ cần khi cá nhảy), puller lôi mạnh; nếu `strength` cá vượt quá sức người (tension cực đại lâu + stamina người cạn) → emit `player:dragged`. Cá behavior 'fighter' khi gần bờ → emit `combat:start`.
- `G.fishing.fight` = `{tension, fishStamina, distance, catchInfo, fishDir}` cho UI đọc; null khi không vật.
- Câu trên máy bay: dây cực dài, phao rơi xuống biển; cá 'sky' (cá sấu bay) có thể cắn giữa không.
- Khi kéo lên: hiện cá 3D trên tay người chơi vài giây, emit `fish:caught`.

### G.systems (systems.js)
- Túi đồ, tiền, bán cá (`sellAll()`), mua đồ (`buy(id)`), chế tạo (`craft(recipeId)` theo `G.data.RECIPES`), dùng đồ (`use(id)`: rượu → tăng drunk, hồi stamina, bánh mì pate 15k → hồi hunger/hp).
- NPC 3D tại `G.world.getNPCSpots()` (dựng lại khi `env:changed`): người bán đồ câu, quán rượu, cô bán bánh mì pate, thợ rèn/chế tạo, người cho thuê/đóng thuyền, ông lão kể chuyện (gợi ý cá). Nhấn E khi đứng gần → `G.ui.dialog(...)`.
- Quản lý (warden): NPC tuần tra trong `G.world.zones`. Nếu người chơi câu (mode fishing/fight) trong zone và trong tầm nhìn → `wanted` tăng → emit `warden:spotted` rồi `warden:chase` (warden chạy đuổi). Người chơi chạy ra khỏi tầm > 40m vài giây → `warden:escaped`. Bị bắt → `warden:caught`: tịch thu cần đang dùng + cá trong túi + một phần tiền, đưa về spawn.
- Luật "không được nhét cá vào quần": phím P (hoặc nút UI "Nhét cá vào quần") → luôn bị từ chối với thông báo hài hước khác nhau; nếu cố lặp lại 3 lần → warden xuất hiện phạt tiền.
- Năng lượng: hunger giảm dần, stamina giảm khi chạy/vật cá, hồi khi nghỉ. Hunger 0 → mất HP dần. HP 0 → ngất, mất ít tiền, hồi sinh tại spawn.
- Lưu/tải `localStorage` (try/catch), tự lưu mỗi 30s.
- `G.systems.nearestNPC` cho UI hiển thị gợi ý "[E] Nói chuyện".

### G.fx (fx.js)
- `splash(pos, size)`, `ripple(pos, size)`, `explosion(pos, size)` (lửa, khói, mảnh vụn, ánh sáng chớp, sóng xung kích trên nước, rung camera), `shake(amount, duration)`, `sparkle(pos, color)`, `floatText(pos, text, color)` (chữ bay 3D bằng sprite), `bubbles(pos)`, `rain(on)`, `fireworks(pos)`, `confetti(pos)`.
- Nghe `explosion` event → `explosion(...)`; nghe `fish:caught` → confetti/fireworks tùy độ lớn (cá khổng lồ/quái vật → pháo hoa + nổ "bùm bùm").
- Hiệu ứng màn hình: flash trắng, vignette khi HP thấp, mờ/lắc khi say (CSS filter trên canvas hoặc overlay).

### G.audio (audio.js)
- `play(name, opts)` với name: 'cast','whoosh','splash','bigsplash','plop','reel','bite','strike','line_snap','catch','fanfare','fail','explosion','drink','eat','burp','alarm','whistle','footstep','swim','coin','click','hit','punch','roar','gunshot','chicken','thunder','engine'
- `setAmbience(envId, isNight)` âm nền (gió, sóng, chim, dế, xe cộ thành phố, động cơ máy bay), `setMusic(on)`, `setMasterVolume(v)`, `loop(name)` trả handle `{stop(), setRate(r), setVolume(v)}` (cho tiếng cuộn dây). Khởi tạo AudioContext ở lần click đầu tiên.

### G.ui (ui.js)
- Toàn bộ DOM overlay trong `#ui` (CSS tự inject). Font đẹp (Google Fonts 'Be Vietnam Pro').
- Màn hình tiêu đề "CÂU CÁ VẠN CÂN 3D" + nút Chơi, Hướng dẫn.
- HUD: tiền, giờ/ngày, nhiệt độ nước, thủy triều, thời tiết, môi trường, độ sâu tại phao, cần/dây/mồi đang dùng, HP/đói/thể lực/say, mức bị truy nã.
- `toast(msg, type)` type: 'info'|'good'|'bad'|'warn'|'epic'; `bigMessage(text, sub, color)`; `dialog(npcName, text, options:[{label, action:fn}])`; `openPanel(name)` 'inventory'|'shop'|'craft'|'map'|'bait'|'rod'|'help'|'fishdex'|'pause'; `closePanel()`; `isOpen()`.
- Thanh lực quăng: `setCastMeter(v|null, sweetSpot)`; cửa sổ giật câu: `setStrikePrompt(on, progress)`; bảng vật cá đọc `G.fishing.fight` mỗi frame (thanh tension, thể lực cá, khoảng cách, mũi tên hướng cá chạy, gợi ý phím).
- Bản đồ (M): chọn môi trường → `G.world.loadEnvironment(id)` (máy bay cần vé — xem data).
- Panel cửa hàng/chế tạo/túi đồ gọi `G.systems.buy/craft/use/sellAll`.
- Fishdex (phím K): danh sách loài, ẩn tên nếu chưa bắt.
- Crosshair cho mode 'shoot'; HP bar cá cho mode 'combat' (đọc `G.player.combat` = `{fishHp, fishMaxHp, name}`).
- Phím: I túi đồ, C chế tạo, M bản đồ, K fishdex, H/F1 trợ giúp, Esc tạm dừng/đóng panel. Khi panel mở → `G.input.blocked = true`, `G.setMode` không đổi.
- Tooltip "[E] ..." khi `G.systems.nearestNPC`.

## Bảng phím tổng
WASD di chuyển · Shift chạy/né · Space nhảy / giật câu · Chuột phải kéo: xoay camera · Lăn chuột: zoom / độ sâu mồi · F cầm cần · Chuột trái giữ: quăng / cuộn · A/D nghiêng cần khi vật · W giật cần · S hạ cần · R đổi cần · B đổi mồi · E tương tác · G chế độ bắn cá · I túi · C chế tạo · M bản đồ · K sách cá · P nhét cá vào quần (bị cấm) · 1-5 dùng nhanh đồ ăn/uống · H trợ giúp · Esc.

## Bổ sung quan trọng
- Sở hữu đồ: cần câu trong `G.state.ownedRods` (mảng id), dây trong `G.state.ownedLines`, thuyền trong `G.state.ownedBoats`. Mồi/đồ ăn/nguyên liệu/rác trong `G.state.inventory {id: count}`. Mồi `reusable` không bị trừ khi dùng; mồi thường bị trừ 1 mỗi lần cá cắn câu (hooked).
- Cá câu được bỏ vào `G.state.fishBag` (systems lắng nghe `fish:caught` để thêm vào bag / inventory, cập nhật stats, discovered, toast). fishing KHÔNG tự thêm vào túi.
- `G.player.locked = true` → player.js không xử lý WASD (fishing đặt khi dây đã quăng ra / đang vật cá). Player vẫn cập nhật camera.
- Camera: player.js sở hữu camera ở mọi mode. Khi fight, fishing có thể đặt `G.player.cameraFocus = Vector3` (điểm cá) để camera hướng về giữa người và cá; null để trở lại bình thường.
- `G.state.mode` 'menu' được UI dùng khi màn hình tiêu đề/tạm dừng; G.paused = true khi tạm dừng.
- Gió: `G.world.getConditions().wind = {x,z}` (m/s) — fishing dùng để lệch quăng.
- Tham số env đầy đủ trong `G.data.ENVS` (fog, sky, tideAmp, waveAmp, managedZones, ticket).
- Đi máy bay cần vé `item_ticket_plane` trong inventory (UI kiểm tra, systems trừ vé). Đi môi trường khác trả `ticket` tiền (UI gọi `G.systems.travel(envId)` → systems trừ tiền rồi gọi `G.world.loadEnvironment`).

## Nâng cấp v2 (đồ họa, vật lý, UI) — thêm vào hợp đồng
Skill dùng trong project nằm ở `.claude/skills/` (xem SOURCES.md). Giữ **three.js r128 global** — KHÔNG chuyển sang ES modules/`three/addons` (game phải mở được bằng file://).

### Font
- Font nhúng sẵn `fonts/fonts.css`: `"Be Vietnam Pro"` (400/600/800) và `"Baloo 2"` (600/800). Chỉ dùng các weight này (không dùng 700/900 — sẽ bị giả lập).
- Chữ vẽ lên canvas: luôn dùng `G.util.font(weight, sizePx, display)`; `G.FONT_UI`, `G.FONT_DISPLAY`. Canvas chữ phải cao ≥ 1.8× cỡ chữ để không cắt dấu chồng (Ấ, Ỗ, Ự). main.js đã chờ `G.loadFonts()` trước khi dựng thế giới.

### G.gfx (js/gfx.js) — render & hiệu năng
- `init()`, `render(dt)` (core gọi thay cho renderer.render), `setQuality('low'|'medium'|'high'|'ultra')`, `quality`, `stats = {fps, ms, calls, tris}`, `toggleStats()` (phím F3), adaptive resolution tự động.
- Thư viện hậu kỳ nạp ở chỗ `<!--GFX_LIBS-->` trong index.html từ `cdn.jsdelivr.net/npm/three@0.128.0/examples/js/...` (bản global). gfx.js phải chạy được (render thường) nếu các file đó không tải được.

### G.physics (js/physics.js) — va chạm & vật lý
- `addCircle({x, z, r, tag, yMin, yMax})`, `addBox({x, z, hw, hd, rot, tag, yMin, yMax})` → id; `remove(id)`; `clear(tag)` (tag `'env'` bị xóa khi `env:changed` trước khi world dựng lại — world gọi `G.physics.clear('env')` đầu `loadEnvironment`).
- `resolveCircle(pos /*Vector3, sửa tại chỗ*/, radius, y)` → true nếu có va chạm (đẩy ra khỏi collider).
- `raycastXZ(from, to, radius)` → điểm chạm hoặc null.
- `Rope` (dây verlet): `new G.physics.Rope(segments, length)`, `.update(dt, startVec3, endVec3, opts)`, `.points`.
- `buoyancy(obj, opts)` helper cho vật nổi (phao, thuyền, cá nổi).
- Bước vật lý cố định 1/60s có nội suy cho chuyển động người chơi/thuyền.
- Đã triển khai thêm (ngoài danh sách trên): `G.physics.move/floorAt/overlaps/makeStepper/solveLaunch/lastNormal`; `G.gfx.addLight/clearLights` (pool đèn điểm giới hạn theo chất lượng), `G.world.sun`; phím F3 = bảng hiệu năng, F4 = đổi mức chất lượng.
- Vật cá: sau 90s vật nhau cá mất sức nhanh dần (trận nào cũng có hồi kết); đứng trên thuyền giảm dây bị rút theo độ vững thuyền; tàu thép không bao giờ bị kéo xuống nước.
