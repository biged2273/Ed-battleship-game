/* Honky-tonk techno, splashes, booms and two old guys running their mouths.
   Everything is synthesized in the browser - no audio files to load. */

const Sound = (() => {
  let ctx = null;
  let master = null, musicGain = null;
  let musicOn = true, running = false;
  let timer = null, step = 0, nextTime = 0;

  const BPM = 124;
  const STEP = 60 / BPM / 4;          // sixteenth note
  const LOOKAHEAD = 0.1;

  // G mixolydian-ish honky tonk: G - C - D - C, two bars each
  const ROOTS = [98.0, 130.81, 146.83, 130.81];   // G2 C3 D3 C3
  const TWANG = [
    [0, 7, 12, 7, 16, 12, 7, 0],
    [0, 4, 7, 12, 7, 4, 0, 4],
    [0, 7, 11, 14, 11, 7, 0, 7],
    [0, 4, 7, 12, 7, 4, 7, 4],
  ];

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.32;
    musicGain.connect(master);
  }

  /* ---------- one-shot voices ---------- */

  function noise(dur) {
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  function env(gain, t, a, d, peak) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function kick(t, out) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    env(g, t, 0.002, 0.22, 1.0);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.3);
  }

  function hat(t, out, open) {
    const s = noise(open ? 0.14 : 0.04), g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 7000;
    env(g, t, 0.001, open ? 0.13 : 0.035, open ? 0.16 : 0.12);
    s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + 0.2);
  }

  function clap(t, out) {
    const s = noise(0.18), g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 1.1;
    env(g, t, 0.003, 0.16, 0.5);
    s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + 0.25);
  }

  function bass(t, freq, out) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(220, t + 0.18);
    env(g, t, 0.005, 0.2, 0.45);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 0.3);
  }

  /* plucked, slightly detuned - the "banjo on a drum machine" sound */
  function twang(t, freq, out) {
    [0, 6].forEach((cents, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = i ? 'triangle' : 'square';
      o.frequency.value = freq * Math.pow(2, cents / 1200);
      f.type = 'bandpass'; f.frequency.value = freq * 2.4; f.Q.value = 2.5;
      env(g, t, 0.004, 0.22, i ? 0.14 : 0.1);
      o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 0.35);
    });
  }

  /* ---------- sequencer ---------- */

  function scheduleStep(s, t) {
    const bar = Math.floor(s / 16) % 4;
    const i = s % 16;
    const root = ROOTS[bar];

    if (i % 4 === 0) kick(t, musicGain);
    if (i === 4 || i === 12) clap(t, musicGain);
    if (i % 2 === 1) hat(t, musicGain, i === 7 || i === 15);
    if (i % 2 === 0) bass(t, root * (i === 6 || i === 14 ? 1.5 : 1), musicGain);
    if (i % 2 === 0) twang(t, root * 4 * Math.pow(2, TWANG[bar][(i / 2) % 8] / 12), musicGain);
  }

  function pump() {
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(step, nextTime);
      step = (step + 1) % 64;
      nextTime += STEP;
    }
  }

  function startMusic() {
    init();
    if (ctx.state === 'suspended') ctx.resume();
    if (running || !musicOn) return;
    running = true;
    step = 0;
    nextTime = ctx.currentTime + 0.06;
    timer = setInterval(pump, 25);
  }

  function stopMusic() {
    running = false;
    clearInterval(timer);
  }

  /* ---------- game sfx ---------- */

  const sfx = {
    cast(t) {   // rod whip
      const s = noise(0.25), g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.setValueAtTime(600, t);
      f.frequency.exponentialRampToValueAtTime(3600, t + 0.22); f.Q.value = 3;
      env(g, t, 0.01, 0.22, 0.35);
      s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 0.3);
    },
    boom(t) {
      const s = noise(1.0), g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t);
      f.frequency.exponentialRampToValueAtTime(120, t + 0.8);
      env(g, t, 0.004, 0.85, 0.95);
      s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 1.1);
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
      env(og, t, 0.004, 0.5, 0.7);
      o.connect(og).connect(master); o.start(t); o.stop(t + 0.7);
    },
    splash(t) {
      const s = noise(0.5), g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.setValueAtTime(2400, t);
      f.frequency.exponentialRampToValueAtTime(500, t + 0.4); f.Q.value = 0.8;
      env(g, t, 0.005, 0.42, 0.5);
      s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 0.6);
    },
    can(t) {    // aluminium clank of a thrown beer
      [880, 1320, 2100].forEach((fr, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = fr;
        env(g, t, 0.002, 0.12 - i * 0.03, 0.18);
        o.connect(g).connect(master); o.start(t); o.stop(t + 0.2);
      });
    },
    sink(t) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(48, t + 1.6);
      env(g, t, 0.02, 1.6, 0.35);
      o.connect(g).connect(master); o.start(t); o.stop(t + 1.8);
    },
    cheer(t) {  // little fanfare under HELL YEAH BROTHER
      [0, 4, 7, 12].forEach((semi, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = 392 * Math.pow(2, semi / 12);
        env(g, t + i * 0.07, 0.005, 0.22, 0.22);
        o.connect(g).connect(master); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.3);
      });
    },
  };

  function play(name) {
    if (!musicOn || !ctx) return;
    const f = sfx[name];
    if (f) f(ctx.currentTime);
  }

  /* ---------- smack talk ---------- */

  const LINES = {
    youHit: [
      'Hell yeah brother!!',
      'Get off my lake, Gary!',
      'That one had your name on it, Dale!',
      'Boom goes the bait shop!',
    ],
    youMiss: [
      'Aw, come on, that was the wind.',
      'Dang it. Hand me another beer.',
      'I meant to do that. Warning shot.',
      'Rod slipped. Not my fault.',
    ],
    foeHit: [
      'Gary says: sit down, son!',
      'Dale says: that is how you cast!',
      'Gary says: tell your wife I said hi!',
      'Dale says: we are just getting warmed up!',
    ],
    foeMiss: [
      'Gary says: alright, alright, I was reeling.',
      'Dale says: that one was a practice throw.',
      'Gary says: sun was in my eyes.',
      'Dale says: lucky the lake is big.',
    ],
    youDefend: [
      'Not today, Gary! Have a cold one!',
      'Beer can defense, baby!',
    ],
    foeDefend: [
      'Gary says: nice try, we got a whole cooler!',
      'Dale says: knocked it right out of the sky!',
    ],
  };

  let voices = [];
  if ('speechSynthesis' in window) {
    const load = () => { voices = speechSynthesis.getVoices(); };
    load();
    speechSynthesis.onvoiceschanged = load;
  }

  /* who: 'you' | 'foe' - two different grizzled voices */
  function say(text, who) {
    if (!musicOn || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text.replace(/^(Gary|Dale) says: /, ''));
    u.rate = 0.95;
    u.pitch = who === 'foe' ? 0.6 : 0.8;
    u.volume = 1;
    if (voices.length) {
      const male = voices.filter(v => /en/i.test(v.lang));
      if (male.length) u.voice = male[who === 'foe' ? male.length - 1 : 0];
    }
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  function smack(kind) {
    const list = LINES[kind];
    if (!list) return null;
    const line = list[Math.floor(Math.random() * list.length)];
    say(line, kind.startsWith('foe') ? 'foe' : 'you');
    return line;
  }

  function toggle() {
    musicOn = !musicOn;
    if (musicOn) { startMusic(); }
    else {
      stopMusic();
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    }
    return musicOn;
  }

  return { init, startMusic, stopMusic, play, smack, toggle, get on() { return musicOn; } };
})();
