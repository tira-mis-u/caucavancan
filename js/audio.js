// audio.js — toàn bộ âm thanh tổng hợp bằng WebAudio: hiệu ứng, âm nền môi trường, nhạc ngũ cung
(function () {
  const G = (window.G = window.G || {});

  let ctx = null, master = null, sfxBus = null, ambBus = null, musicBus = null, comp = null;
  let noiseBuf = null, brownBuf = null;
  let masterVol = 0.8, muted = false;
  let musicOn = true;
  const lastPlay = {};
  let wantAmb = null; // {envId, isNight}
  let curAmbKey = '';
  let amb = null; // {nodes:[], timers:[], gain}
  let rainLayer = null;
  let musicTimer = null;

  // ---------- Khởi tạo khi có thao tác người dùng ----------
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch (e) { ctx = null; return; }
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
      comp.attack.value = 0.004; comp.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : masterVol;
      comp.connect(master); master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(comp);
      ambBus = ctx.createGain(); ambBus.gain.value = 0.55; ambBus.connect(comp);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.16; musicBus.connect(comp);
      // bộ đệm nhiễu trắng & nhiễu nâu dùng chung
      const len = ctx.sampleRate * 2;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const b = brownBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
      if (wantAmb) applyAmbience(wantAmb.envId, wantAmb.isNight, true);
      if (musicOn) startMusic();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  ['pointerdown', 'mousedown', 'keydown', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, unlock, { passive: true }));

  const ready = () => ctx && ctx.state === 'running';
  const R = (a, b) => a + Math.random() * (b - a);

  // ---------- Khối dựng cơ bản ----------
  function gainEnv(t, a, d, peak, dest, curve) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + Math.max(a, 0.001));
    if (curve === 'lin') g.gain.linearRampToValueAtTime(0.0001, t + a + d);
    else g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(dest);
    return g;
  }
  function tone(type, f0, f1, t, a, d, vol, dest, opts) {
    opts = opts || {};
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + (opts.sweep || a + d));
    if (opts.detune) o.detune.value = opts.detune;
    let out = gainEnv(t, a, d, vol, dest);
    if (opts.lp) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; f.Q.value = opts.q || 0.7;
      f.connect(out); o.connect(f);
    } else o.connect(out);
    if (opts.vib) {
      const l = ctx.createOscillator(); const lg = ctx.createGain();
      l.frequency.value = opts.vib[0]; lg.gain.value = opts.vib[1];
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + a + d + 0.05);
    }
    o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }
  function noise(t, a, d, vol, dest, ftype, f0, f1, q, buf) {
    const s = ctx.createBufferSource();
    s.buffer = buf || noiseBuf;
    s.loop = true;
    s.playbackRate.value = R(0.9, 1.1);
    const f = ctx.createBiquadFilter();
    f.type = ftype || 'lowpass';
    f.frequency.setValueAtTime(f0 || 2000, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(f1, 10), t + a + d);
    f.Q.value = q || 0.8;
    const g = gainEnv(t, a, d, vol, dest);
    s.connect(f); f.connect(g);
    s.start(t, Math.random() * 1.5); s.stop(t + a + d + 0.05);
    return s;
  }

  // ---------- Thư viện âm thanh ----------
  const S = {
    cast(t, o) { noise(t, 0.05, 0.35, 0.5 * o.v, o.d, 'bandpass', 500, 3500, 1.5); tone('sine', 900, 300, t + 0.1, 0.01, 0.3, 0.05 * o.v, o.d); },
    whoosh(t, o) { noise(t, 0.08, 0.3, 0.45 * o.v, o.d, 'bandpass', 300, 2500, 1.2); },
    splash(t, o) {
      noise(t, 0.005, 0.45, 0.7 * o.v, o.d, 'lowpass', 4000, 400, 0.6);
      for (let i = 0; i < 4; i++) tone('sine', R(500, 900), R(1200, 2000), t + R(0.05, 0.3), 0.003, 0.06, 0.08 * o.v, o.d);
    },
    bigsplash(t, o) {
      noise(t, 0.01, 1.2, 1.0 * o.v, o.d, 'lowpass', 2500, 200, 0.5);
      noise(t + 0.05, 0.05, 1.5, 0.5 * o.v, o.d, 'highpass', 2000, 1200, 0.5);
      tone('sine', 120, 40, t, 0.01, 0.5, 0.5 * o.v, o.d);
      for (let i = 0; i < 8; i++) tone('sine', R(400, 900), R(1000, 2200), t + R(0.2, 1.0), 0.003, 0.08, 0.07 * o.v, o.d);
    },
    plop(t, o) { tone('sine', 700, 180, t, 0.003, 0.12, 0.45 * o.v, o.d); noise(t, 0.002, 0.08, 0.15 * o.v, o.d, 'lowpass', 2000); },
    reel(t, o) { // một cú "tạch" của bánh cóc
      noise(t, 0.001, 0.025, 0.4 * o.v, o.d, 'bandpass', R(3000, 4200), 0, 4);
      tone('square', R(1800, 2200), 0, t, 0.001, 0.015, 0.05 * o.v, o.d);
    },
    bite(t, o) {
      S.plop(t, o); S.plop(t + 0.14, { v: o.v * 0.7, d: o.d });
      tone('sine', 1760, 0, t, 0.005, 0.5, 0.12 * o.v, o.d); tone('sine', 2637, 0, t + 0.05, 0.005, 0.4, 0.07 * o.v, o.d);
    },
    strike(t, o) { S.whoosh(t, o); tone('sine', 160, 50, t + 0.08, 0.005, 0.2, 0.6 * o.v, o.d); noise(t + 0.08, 0.002, 0.1, 0.4 * o.v, o.d, 'lowpass', 1200); },
    line_snap(t, o) {
      tone('sawtooth', 1600, 70, t, 0.001, 0.35, 0.3 * o.v, o.d, { lp: 4000 });
      noise(t, 0.001, 0.06, 0.7 * o.v, o.d, 'highpass', 2500);
      tone('triangle', 330, 320, t + 0.02, 0.005, 0.8, 0.12 * o.v, o.d, { vib: [9, 14] });
    },
    catch(t, o) { [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, 0, t + i * 0.07, 0.005, 0.35, 0.22 * o.v, o.d)); },
    fanfare(t, o) {
      const seq = [523, 659, 784, 1047, 784, 1047, 1319];
      seq.forEach((f, i) => {
        tone('square', f, 0, t + i * 0.11, 0.01, 0.22, 0.08 * o.v, o.d, { lp: 3000 });
        tone('triangle', f, 0, t + i * 0.11, 0.01, 0.25, 0.15 * o.v, o.d);
      });
      const end = t + seq.length * 0.11;
      [523, 659, 784, 1047].forEach((f) => {
        tone('sawtooth', f, 0, end, 0.02, 1.2, 0.05 * o.v, o.d, { lp: 2500, vib: [5.5, 6] });
        tone('triangle', f, 0, end, 0.02, 1.4, 0.12 * o.v, o.d);
      });
      noise(end, 0.005, 0.6, 0.15 * o.v, o.d, 'highpass', 6000);
    },
    fail(t, o) {
      [392, 370, 349, 294].forEach((f, i) => tone('sawtooth', f, i === 3 ? f * 0.9 : 0, t + i * 0.28, 0.02, i === 3 ? 0.8 : 0.26, 0.15 * o.v, o.d, { lp: 1200, vib: i === 3 ? [6, 10] : null }));
    },
    explosion(t, o) {
      const v = o.v;
      tone('sine', 90, 22, t, 0.005, 1.6, 1.0 * v, o.d);
      tone('triangle', 55, 25, t, 0.01, 1.2, 0.6 * v, o.d);
      noise(t, 0.003, 2.2, 1.1 * v, o.d, 'lowpass', 2200, 60, 0.4);
      noise(t, 0.001, 0.25, 0.8 * v, o.d, 'highpass', 1500, 800, 0.5);
      noise(t + 0.05, 0.3, 3.0, 0.6 * v, o.d, 'lowpass', 400, 80, 0.6, brownBuf);
      for (let i = 0; i < 26; i++) {
        const tt = t + 0.08 + Math.pow(Math.random(), 1.6) * 1.8;
        noise(tt, 0.001, R(0.01, 0.05), R(0.1, 0.35) * v, o.d, 'bandpass', R(1500, 6000), 0, 2);
      }
    },
    firework(t, o) {
      tone('sine', 600, 2400, t, 0.05, 0.7, 0.06 * o.v, o.d);
      const b = t + 0.75;
      tone('sine', 120, 40, b, 0.003, 0.5, 0.5 * o.v, o.d);
      noise(b, 0.002, 0.5, 0.6 * o.v, o.d, 'lowpass', 3000, 300);
      for (let i = 0; i < 20; i++) noise(b + R(0.1, 1.2), 0.001, 0.02, R(0.08, 0.22) * o.v, o.d, 'bandpass', R(3000, 8000), 0, 3);
    },
    drink(t, o) { for (let i = 0; i < 3; i++) { tone('sine', 300, 140, t + i * 0.28, 0.01, 0.14, 0.35 * o.v, o.d, { lp: 900 }); noise(t + i * 0.28, 0.01, 0.12, 0.1 * o.v, o.d, 'bandpass', 600, 300, 3); } },
    eat(t, o) { for (let i = 0; i < 4; i++) noise(t + i * 0.16 + R(0, 0.04), 0.002, R(0.05, 0.09), 0.35 * o.v, o.d, 'bandpass', R(1500, 3500), 0, 1.5); },
    burp(t, o) {
      const d = R(0.45, 0.8);
      const os = ctx.createOscillator(); os.type = 'sawtooth';
      os.frequency.setValueAtTime(R(85, 110), t); os.frequency.linearRampToValueAtTime(R(60, 75), t + d);
      const lfo = ctx.createOscillator(); lfo.frequency.value = R(18, 28);
      const lg = ctx.createGain(); lg.gain.value = 25; lfo.connect(lg); lg.connect(os.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 450; f.Q.value = 1.5;
      const am = ctx.createGain(); am.gain.value = 0.6; const al = ctx.createOscillator(); al.frequency.value = 23; const ag = ctx.createGain(); ag.gain.value = 0.4; al.connect(ag); ag.connect(am.gain);
      const g = gainEnv(t, 0.03, d, 0.8 * o.v, o.d, 'lin');
      os.connect(f); f.connect(am); am.connect(g);
      [os, lfo, al].forEach((n) => { n.start(t); n.stop(t + d + 0.1); });
    },
    alarm(t, o) {
      const os = ctx.createOscillator(); os.type = 'sawtooth';
      os.frequency.setValueAtTime(650, t);
      for (let i = 0; i < 4; i++) { os.frequency.linearRampToValueAtTime(950, t + i * 0.5 + 0.25); os.frequency.linearRampToValueAtTime(650, t + i * 0.5 + 0.5); }
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18 * o.v, t + 0.05);
      g.gain.setValueAtTime(0.18 * o.v, t + 1.9); g.gain.linearRampToValueAtTime(0.0001, t + 2.0);
      os.connect(f); f.connect(g); g.connect(o.d); os.start(t); os.stop(t + 2.05);
    },
    whistle(t, o) {
      tone('sine', 2900, 0, t, 0.01, 0.25, 0.25 * o.v, o.d, { vib: [38, 120] });
      tone('sine', 2900, 0, t + 0.35, 0.01, 0.6, 0.25 * o.v, o.d, { vib: [38, 120] });
      noise(t, 0.01, 0.9, 0.04 * o.v, o.d, 'bandpass', 2900, 0, 3);
    },
    footstep(t, o) { noise(t, 0.002, 0.07, 0.25 * o.v, o.d, 'lowpass', R(500, 900)); tone('sine', 90, 50, t, 0.002, 0.06, 0.15 * o.v, o.d); },
    swim(t, o) { noise(t, 0.08, 0.35, 0.35 * o.v, o.d, 'lowpass', 1400, 400); noise(t + 0.1, 0.05, 0.2, 0.1 * o.v, o.d, 'bandpass', 2500, 0, 2); },
    coin(t, o) { tone('square', 988, 0, t, 0.002, 0.08, 0.12 * o.v, o.d, { lp: 5000 }); tone('square', 1319, 0, t + 0.08, 0.002, 0.35, 0.12 * o.v, o.d, { lp: 5000 }); },
    click(t, o) { tone('sine', 1500, 900, t, 0.001, 0.04, 0.15 * o.v, o.d); },
    hit(t, o) { noise(t, 0.001, 0.12, 0.5 * o.v, o.d, 'lowpass', 1800, 300); tone('sine', 140, 60, t, 0.002, 0.15, 0.5 * o.v, o.d); },
    punch(t, o) { noise(t, 0.001, 0.09, 0.7 * o.v, o.d, 'bandpass', 1200, 400, 0.8); tone('sine', 170, 45, t, 0.002, 0.2, 0.7 * o.v, o.d); },
    roar(t, o) {
      const d = 1.3;
      tone('sawtooth', 95, 60, t, 0.15, d, 0.4 * o.v, o.d, { lp: 700, vib: [11, 18] });
      tone('sawtooth', 142, 85, t, 0.15, d, 0.2 * o.v, o.d, { lp: 900, vib: [7, 12] });
      noise(t, 0.15, d, 0.35 * o.v, o.d, 'bandpass', 600, 250, 1.2);
    },
    gunshot(t, o) {
      noise(t, 0.0005, 0.18, 1.0 * o.v, o.d, 'lowpass', 7000, 800, 0.5);
      noise(t, 0.0005, 0.04, 0.6 * o.v, o.d, 'highpass', 3000);
      tone('sine', 150, 40, t, 0.001, 0.2, 0.8 * o.v, o.d);
      noise(t + 0.05, 0.05, 0.6, 0.15 * o.v, o.d, 'lowpass', 900, 200, 0.5, brownBuf);
    },
    chicken(t, o) { // "cục ta cục tác"
      const n = 3 + Math.floor(Math.random() * 3);
      let tt = t;
      for (let i = 0; i < n; i++) {
        const last = i === n - 1;
        const f0 = last ? 900 : R(520, 640), d = last ? 0.32 : 0.07;
        tone('square', f0, last ? 600 : f0 * 0.8, tt, 0.005, d, 0.12 * o.v, o.d, { lp: 1800, q: 4 });
        tone('sawtooth', f0 * 1.5, 0, tt, 0.005, d * 0.8, 0.04 * o.v, o.d, { lp: 2500 });
        tt += last ? 0.4 : R(0.1, 0.16);
      }
    },
    thunder(t, o) {
      noise(t, 0.02, 0.4, 0.6 * o.v, o.d, 'lowpass', 3000, 500);
      noise(t + 0.1, 0.4, 3.5, 0.9 * o.v, o.d, 'lowpass', 300, 60, 0.6, brownBuf);
      for (let i = 0; i < 6; i++) noise(t + R(0.2, 2.5), 0.1, R(0.4, 1), R(0.2, 0.5) * o.v, o.d, 'lowpass', R(150, 400), 60, 0.5, brownBuf);
    },
    engine(t, o) {
      tone('sawtooth', 55, 70, t, 0.15, 0.9, 0.3 * o.v, o.d, { lp: 500, vib: [28, 6] });
      noise(t, 0.1, 0.9, 0.2 * o.v, o.d, 'lowpass', 400, 0, 1, brownBuf);
    },
    // thêm: tiếng "ting" khi mở bảng, tiếng kéo dây khi vật
    pop(t, o) { tone('sine', 400, 900, t, 0.002, 0.08, 0.2 * o.v, o.d); },
    warn(t, o) { tone('square', 440, 0, t, 0.005, 0.12, 0.1 * o.v, o.d, { lp: 2000 }); tone('square', 440, 0, t + 0.18, 0.005, 0.12, 0.1 * o.v, o.d, { lp: 2000 }); },
  };
  const THROTTLE = { footstep: 0.12, reel: 0.02, swim: 0.3, click: 0.03, coin: 0.05, alarm: 1.8, thunder: 1.0, explosion: 0.06 };

  function play(name, opts) {
    if (!ready()) return;
    const fn = S[name];
    if (!fn) return;
    const now = ctx.currentTime;
    const th = THROTTLE[name] != null ? THROTTLE[name] : 0.05;
    if (lastPlay[name] && now - lastPlay[name] < th) return;
    lastPlay[name] = now;
    opts = opts || {};
    let v = opts.volume != null ? opts.volume : 1;
    // âm lượng theo khoảng cách (nếu có pos)
    if (opts.pos && G.camera) {
      const p = opts.pos, c = G.camera.position;
      const dist = Math.hypot(p.x - c.x, (p.y || 0) - c.y, p.z - c.z);
      v *= Math.max(0.08, Math.min(1, 30 / (dist + 8)));
    }
    let dest = sfxBus;
    if (opts.rate || opts.pan) {
      // pan đơn giản
      if (opts.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opts.pan)); p.connect(sfxBus); dest = p; }
    }
    try { fn(now + 0.005, { v, d: dest, rate: opts.rate || 1 }); } catch (e) { /* bỏ qua */ }
  }

  // ---------- Vòng lặp (cuộn dây, động cơ, ...) ----------
  function loop(name, opts) {
    const h = { _stopped: false, rate: 1, vol: (opts && opts.volume) || 1, stop() {}, setRate(r) { this.rate = r; }, setVolume(v) { this.vol = v; } };
    if (!ready()) {
      // vẫn trả handle hợp lệ; thử khởi động lại khi audio sẵn sàng
      let iv = setInterval(() => { if (h._stopped) { clearInterval(iv); return; } if (ready()) { clearInterval(iv); const real = loop(name, { volume: h.vol }); real.setRate(h.rate); h.stop = () => { h._stopped = true; real.stop(); }; h.setRate = (r) => { h.rate = r; real.setRate(r); }; h.setVolume = (v) => { h.vol = v; real.setVolume(v); }; } }, 300);
      h.stop = () => { h._stopped = true; clearInterval(iv); };
      return h;
    }
    const out = ctx.createGain(); out.gain.value = h.vol; out.connect(sfxBus);
    if (name === 'engine') {
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 50;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 25;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      const g2 = ctx.createGain(); g2.gain.value = 0.15;
      const lf = ctx.createOscillator(); lf.frequency.value = 22; const lg = ctx.createGain(); lg.gain.value = 0.08;
      const am = ctx.createGain(); am.gain.value = 0.22; lf.connect(lg); lg.connect(am.gain);
      o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(am); am.connect(out);
      [o1, o2, lf].forEach((n) => n.start());
      h.setRate = (r) => { h.rate = r; const tt = ctx.currentTime; o1.frequency.setTargetAtTime(50 * r, tt, 0.1); o2.frequency.setTargetAtTime(25 * r, tt, 0.1); lf.frequency.setTargetAtTime(22 * r, tt, 0.1); f.frequency.setTargetAtTime(300 + 300 * r, tt, 0.1); };
      h.setVolume = (v) => { h.vol = v; out.gain.setTargetAtTime(v, ctx.currentTime, 0.05); };
      h.stop = () => { if (h._stopped) return; h._stopped = true; out.gain.setTargetAtTime(0, ctx.currentTime, 0.08); setTimeout(() => { [o1, o2, lf].forEach((n) => { try { n.stop(); } catch (e) {} }); out.disconnect(); }, 500); };
      return h;
    }
    // vòng lặp nhịp: lặp lại một âm (mặc định reel = tạch tạch bánh cóc)
    const fn = S[name] || S.reel;
    const baseInterval = name === 'reel' ? 0.055 : name === 'footstep' ? 0.4 : 0.6;
    let next = ctx.currentTime + 0.02;
    const iv = setInterval(() => {
      if (h._stopped || !ctx) return;
      const ahead = ctx.currentTime + 0.12;
      let guard = 0;
      while (next < ahead && guard++ < 20) {
        if (h.rate > 0.01) { try { fn(Math.max(next, ctx.currentTime), { v: 1, d: out }); } catch (e) {} }
        next += baseInterval / Math.max(0.15, h.rate || 0.15);
      }
      if (next < ctx.currentTime) next = ctx.currentTime;
    }, 40);
    h.setVolume = (v) => { h.vol = v; out.gain.setTargetAtTime(v, ctx.currentTime, 0.03); };
    h.stop = () => { if (h._stopped) return; h._stopped = true; clearInterval(iv); setTimeout(() => out.disconnect(), 400); };
    return h;
  }

  // ---------- Âm nền môi trường ----------
  function noiseSource(buf, ftype, freq, q, vol, dest) {
    const s = ctx.createBufferSource(); s.buffer = buf || noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q || 0.7;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(dest); s.start(0, Math.random() * 1.9);
    return { s, f, g };
  }
  function lfoTo(param, freq, depth, dest) {
    const l = ctx.createOscillator(); l.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = depth;
    l.connect(g); g.connect(param); l.start();
    return l;
  }
  function stopAmb(a) {
    if (!a) return;
    a.timers.forEach((t) => clearInterval(t));
    try { a.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.6); } catch (e) {}
    setTimeout(() => { a.nodes.forEach((n) => { try { n.stop(); } catch (e) {} }); try { a.gain.disconnect(); } catch (e) {} }, 3000);
  }
  function chirp(dest, vol) { // tiếng chim
    const t = ctx.currentTime + 0.02;
    const n = 2 + Math.floor(Math.random() * 5);
    const base = R(2200, 4200);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    let d = dest; if (pan) { pan.pan.value = R(-0.9, 0.9); pan.connect(dest); d = pan; }
    for (let i = 0; i < n; i++) {
      const tt = t + i * R(0.08, 0.14);
      tone('sine', base * R(0.9, 1.2), base * R(1.2, 1.6), tt, 0.005, R(0.04, 0.09), vol * R(0.5, 1), d);
    }
  }
  function cricket(dest, vol) {
    const t = ctx.currentTime + 0.02;
    const f = R(4200, 5200);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    let d = dest; if (pan) { pan.pan.value = R(-1, 1); pan.connect(dest); d = pan; }
    const pulses = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < pulses; i++) tone('sine', f, 0, t + i * 0.055, 0.004, 0.035, vol, d);
  }
  function horn(dest, vol) {
    const t = ctx.currentTime + 0.02;
    const d = R(0.25, 0.6);
    const f = R(350, 480);
    tone('square', f, 0, t, 0.02, d, vol, dest, { lp: 1500 });
    tone('square', f * 1.26, 0, t, 0.02, d, vol * 0.8, dest, { lp: 1500 });
    if (Math.random() < 0.4) { tone('square', f, 0, t + d + 0.12, 0.02, 0.2, vol, dest, { lp: 1500 }); }
  }
  function frog(dest, vol) {
    const t = ctx.currentTime + 0.02;
    for (let i = 0; i < 2; i++) tone('square', R(180, 260), R(120, 160), t + i * 0.18, 0.01, 0.1, vol, dest, { lp: 900, q: 6 });
  }

  function applyAmbience(envId, isNight, force) {
    const key = envId + '|' + (isNight ? 'n' : 'd');
    if (!force && key === curAmbKey) return;
    curAmbKey = key;
    stopAmb(amb);
    const g = ctx.createGain(); g.gain.value = 0; g.connect(ambBus);
    g.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
    const a = { nodes: [], timers: [], gain: g };
    const add = (o) => { a.nodes.push(o.s || o); return o; };
    // gió (mọi nơi), mạnh hơn trên núi / máy bay
    const windVol = envId === 'mountain' ? 0.22 : envId === 'airplane' ? 0.25 : envId === 'city' ? 0.04 : 0.08;
    const w = add(noiseSource(brownBuf, 'lowpass', 500, 0.5, windVol, g));
    a.nodes.push(lfoTo(w.g.gain, 0.07, windVol * 0.6));
    a.nodes.push(lfoTo(w.f.frequency, 0.05, 250));
    // nước
    if (envId === 'island' || envId === 'airplane') {
      const wv = add(noiseSource(noiseBuf, 'lowpass', 700, 0.5, envId === 'airplane' ? 0.03 : 0.16, g));
      a.nodes.push(lfoTo(wv.g.gain, 0.11, envId === 'airplane' ? 0.02 : 0.14));
      a.nodes.push(lfoTo(wv.f.frequency, 0.11, 400));
    } else if (envId === 'forest' || envId === 'mountain') {
      add(noiseSource(noiseBuf, 'bandpass', 1800, 0.6, 0.025, g)); // suối róc rách
    } else if (envId === 'plains' || envId === 'city') {
      const rv = add(noiseSource(noiseBuf, 'lowpass', 500, 0.5, 0.05, g));
      a.nodes.push(lfoTo(rv.g.gain, 0.2, 0.02));
    }
    // thành phố: tiếng xe cộ ù ù + còi
    if (envId === 'city') {
      add(noiseSource(brownBuf, 'lowpass', 220, 0.5, 0.25, g));
      const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 48;
      const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 160;
      const hg = ctx.createGain(); hg.gain.value = 0.03; hum.connect(hf); hf.connect(hg); hg.connect(g); hum.start(); a.nodes.push(hum);
      a.timers.push(setInterval(() => { if (Math.random() < (isNight ? 0.08 : 0.18)) horn(g, 0.035); }, 1000));
    }
    // máy bay: động cơ ù ù
    if (envId === 'airplane') {
      [88, 90.5, 176].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 280;
        const og = ctx.createGain(); og.gain.value = i === 2 ? 0.015 : 0.04;
        o.connect(fl); fl.connect(og); og.connect(g); o.start(); a.nodes.push(o);
      });
      add(noiseSource(brownBuf, 'lowpass', 900, 0.5, 0.3, g));
    }
    // chim ban ngày / dế & ếch ban đêm
    if (envId !== 'airplane') {
      if (!isNight) {
        const rate = envId === 'city' ? 0.08 : envId === 'forest' ? 0.45 : 0.3;
        a.timers.push(setInterval(() => { if (Math.random() < rate) chirp(g, 0.035); }, 700));
        if (envId === 'island') a.timers.push(setInterval(() => { if (Math.random() < 0.12) { const t = ctx.currentTime; tone('sine', 1400, 1100, t, 0.02, 0.25, 0.02, g); tone('sine', 1500, 1150, t + 0.3, 0.02, 0.3, 0.02, g); } }, 1500)); // hải âu
      } else {
        const cr = envId === 'city' ? 0.15 : 0.85;
        a.timers.push(setInterval(() => { if (Math.random() < cr) cricket(g, 0.02); }, 260));
        if (envId === 'forest' || envId === 'plains') a.timers.push(setInterval(() => { if (Math.random() < 0.25) frog(g, 0.05); }, 900));
      }
    }
    amb = a;
  }

  function setAmbience(envId, isNight) {
    wantAmb = { envId: envId || 'forest', isNight: !!isNight };
    if (ctx) applyAmbience(wantAmb.envId, wantAmb.isNight);
  }

  // lớp mưa + sấm tự động theo thời tiết
  function setRainLayer(level) { // 0 tắt, 1 mưa, 2 bão
    if (!ctx) return;
    if (!rainLayer && level > 0) {
      const r = noiseSource(noiseBuf, 'highpass', 1200, 0.5, 0, ambBus);
      const r2 = noiseSource(brownBuf, 'lowpass', 600, 0.5, 0, ambBus);
      rainLayer = { r, r2, level: 0 };
    }
    if (!rainLayer) return;
    rainLayer.level = level;
    const t = ctx.currentTime;
    rainLayer.r.g.gain.setTargetAtTime(level === 0 ? 0 : level === 1 ? 0.08 : 0.16, t, 1);
    rainLayer.r2.g.gain.setTargetAtTime(level === 0 ? 0 : level === 1 ? 0.12 : 0.3, t, 1);
  }

  // ---------- Nhạc nền ngũ cung (chill, kiểu đàn tranh/guitar) ----------
  // thang ngũ cung Việt (điệu Bắc): Rê Fa Sol La Đô
  const SCALE = [0, 3, 5, 7, 10];
  const ROOT = 146.83; // D3
  const PROG = [0, 0, 3, 3, 2, 2, 0, 4]; // bậc hợp âm theo ô nhịp (chỉ số trong SCALE)
  function noteFreq(deg, oct) {
    const n = SCALE.length;
    const o = Math.floor(deg / n) + (oct || 0);
    const s = SCALE[((deg % n) + n) % n];
    return ROOT * Math.pow(2, o + s / 12);
  }
  function pluck(t, f, vol, dur, bend) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f, t);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(f * 2, t);
    if (bend) { // nhấn nhá kiểu đàn bầu
      o.frequency.setValueAtTime(f, t + dur * 0.35);
      o.frequency.linearRampToValueAtTime(f * Math.pow(2, bend / 12), t + dur * 0.6);
      o2.frequency.setValueAtTime(f * 2, t + dur * 0.35);
      o2.frequency.linearRampToValueAtTime(f * 2 * Math.pow(2, bend / 12), t + dur * 0.6);
    }
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass';
    fl.frequency.setValueAtTime(3200, t); fl.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    o.connect(fl); o2.connect(g2); g2.connect(fl); fl.connect(g); g.connect(musicBus);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  let mNext = 0, mStep = 0, mDeg = 7, mRest = 0;
  function startMusic() {
    if (!ctx || musicTimer) return;
    const beat = 60 / 78 / 2; // nốt móc đơn, 78 bpm
    mNext = ctx.currentTime + 0.3; mStep = 0;
    musicTimer = setInterval(() => {
      if (!ctx || ctx.state !== 'running') return;
      while (mNext < ctx.currentTime + 0.35) {
        const t = Math.max(mNext, ctx.currentTime + 0.01);
        const bar = Math.floor(mStep / 8) % PROG.length;
        const pos = mStep % 8;
        const chord = PROG[bar];
        // bass + chạy hợp âm (arpeggio) kiểu guitar
        if (pos === 0) pluck(t, noteFreq(chord, -1), 0.22, 2.2);
        if (pos === 0 || pos === 3 || pos === 6) pluck(t, noteFreq(chord + 2, 0), 0.07, 1.4);
        if (pos === 2 || pos === 5) pluck(t, noteFreq(chord + 4, 0), 0.06, 1.2);
        // giai điệu: bước ngẫu nhiên trên thang ngũ cung
        if (mRest > 0) mRest--;
        else if (Math.random() < 0.55) {
          const step = [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)];
          mDeg = Math.max(4, Math.min(12, mDeg + step));
          const long = Math.random() < 0.25;
          pluck(t, noteFreq(mDeg, 0), 0.1, long ? 1.8 : 0.9, long && Math.random() < 0.5 ? (Math.random() < 0.5 ? 2 : -1) : 0);
          if (long) mRest = 2;
        }
        mStep++;
        if (mStep % 64 === 0 && Math.random() < 0.3) mRest = 8; // nghỉ một chút
        mNext += beat;
      }
    }, 90);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

  function setMusic(on) {
    musicOn = !!on;
    if (!ctx) return;
    if (musicOn) startMusic(); else stopMusic();
  }

  function setMasterVolume(v) {
    masterVol = Math.max(0, Math.min(1, v));
    if (master) master.gain.setTargetAtTime(muted ? 0 : masterVol, ctx.currentTime, 0.05);
  }
  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : masterVol, ctx.currentTime, 0.05);
  }
  function toggleMute() {
    setMuted(!muted);
    if (G.ui && G.ui.toast) G.ui.toast(muted ? '🔇 Đã tắt tiếng (N)' : '🔊 Đã bật tiếng (N)', 'info');
    return muted;
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyN' && !e.repeat && !(e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'))) toggleMute();
  });

  // Tự cập nhật âm nền theo môi trường / ngày đêm / thời tiết
  function autoAmbience() {
    try {
      const envId = (G.state && G.state.env) || 'forest';
      let isNight = false, weather = 'clear';
      if (G.world && G.world.getConditions) {
        const c = G.world.getConditions();
        if (c) { isNight = !!c.isNight; weather = c.weather || 'clear'; }
      } else if (G.state) { const h = G.state.time; isNight = h < 5.5 || h > 18.5; }
      setAmbience(envId, isNight);
      setRainLayer(weather === 'storm' ? 2 : weather === 'rain' ? 1 : 0);
    } catch (e) {}
  }

  G.audio = {
    init() {
      if (G.bus) {
        G.bus.on('env:changed', () => setTimeout(autoAmbience, 50));
      }
      setInterval(autoAmbience, 2000);
    },
    play, loop, setAmbience, setMusic, setMasterVolume, setMuted, toggleMute,
    resume: unlock,
    get muted() { return muted; },
    get volume() { return masterVol; },
    get musicOn() { return musicOn; },
    get ready() { return ready(); },
    names: Object.keys(S),
  };
})();
