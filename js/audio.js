/* =========================================================================
   Arknight Card Battle — Sound
   All audio is synthesized with the Web Audio API (no external files).
   Provides one-shot SFX and an optional ambient drone for music.
   ========================================================================= */
(function (global) {
  'use strict';

  let ctx = null, master = null, drone = null;
  const S = { enabled: true, volume: 0.7, music: false };

  function ensure() {
    if (ctx) return true;
    try {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = S.volume;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }
  function resume() { if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} } }

  function tone(freq, dur, type, vol, delay) {
    if (!S.enabled || !ensure()) return;
    resume();
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function noise(dur, vol, freqQ) {
    if (!S.enabled || !ensure()) return;
    resume();
    const t = ctx.currentTime;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = vol;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freqQ || 1100; f.Q.value = 0.8;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  const SFX = {
    click()  { tone(560, 0.05, 'triangle', 0.12); },
    draw()   { tone(680, 0.06, 'triangle', 0.10); tone(920, 0.07, 'triangle', 0.08, 0.05); },
    deploy() { tone(320, 0.10, 'square', 0.11); tone(480, 0.12, 'square', 0.09, 0.06); },
    play()   { tone(587, 0.09, 'triangle', 0.14); tone(784, 0.12, 'triangle', 0.11, 0.07); },
    attack() { noise(0.11, 0.20, 1400); tone(220, 0.12, 'sawtooth', 0.11); },
    hit()    { noise(0.18, 0.26, 900); tone(150, 0.16, 'square', 0.13); },
    destroy(){ noise(0.26, 0.28, 700); tone(110, 0.30, 'sawtooth', 0.12); tone(165, 0.24, 'sawtooth', 0.09, 0.05); },
    heal()   { tone(660, 0.12, 'sine', 0.13); tone(880, 0.16, 'sine', 0.11, 0.08); tone(1100, 0.20, 'sine', 0.09, 0.16); },
    error()  { tone(180, 0.12, 'square', 0.11); tone(140, 0.14, 'square', 0.09, 0.08); },
    turn()   { tone(440, 0.08, 'triangle', 0.09); tone(554, 0.09, 'triangle', 0.08, 0.07); },
    win()    { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.38, 'triangle', 0.15, i * 0.12)); },
    lose()   { [440, 392, 330, 262].forEach((f, i) => tone(f, 0.42, 'sine', 0.14, i * 0.15)); }
  };

  function buildDrone() {
    const g = ctx.createGain(); g.gain.value = 0.045;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 620; f.Q.value = 3;
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 110;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 164.8;
    const o3 = ctx.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 220;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 220;
    lfo.connect(lg); lg.connect(f.frequency);
    o1.connect(f); o2.connect(f); o3.connect(f); f.connect(g); g.connect(master);
    o1.start(); o2.start(); o3.start(); lfo.start();
    return { g, o1, o2, o3, lfo };
  }
  function musicOn() {
    if (!S.enabled || !S.music || !ensure()) return;
    resume();
    if (drone) return;
    drone = buildDrone();
  }
  function musicOff() {
    if (!drone) return;
    try { ['o1', 'o2', 'o3', 'lfo'].forEach(k => drone[k].stop()); } catch (e) {}
    drone = null;
  }

  function setVolume(v) { S.volume = Math.max(0, Math.min(1, v)); if (master) master.gain.value = S.volume; }

  function apply(settings) {
    settings = settings || {};
    S.enabled = settings.sound !== false;
    if (settings.volume != null) S.volume = settings.volume;
    S.music = !!settings.music;
    if (master) master.gain.value = S.volume;
    if (S.enabled && S.music) musicOn(); else musicOff();
  }

  global.Sfx = {
    SFX, setVolume, apply, musicOn, musicOff,
    get enabled() { return S.enabled; }
  };
})(window);
