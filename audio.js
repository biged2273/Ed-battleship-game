/* Boat radio, splashes, booms and two old guys running their mouths.
   Music and voice lines are files; the sound effects are synthesized. */

const Sound = (() => {
  let ctx = null;
  let master = null;
  let musicOn = true, running = false;
  let whistle = null;          // gain of the in-flight bomb whistle, cut short on impact

  /* Kevin MacLeod, incompetech.com - Creative Commons BY 3.0 */
  const TRACKS = [
    { file: 'music/bama-country.mp3', name: 'Bama Country' },
    { file: 'music/hillbilly-swing.mp3', name: 'Hillbilly Swing' },
    { file: 'music/corncob.mp3', name: 'Corncob' },
    { file: 'music/still-pickin.mp3', name: 'Still Pickin\u2019' },
  ];
  const MUSIC_VOL = 0.4;
  const DUCK_VOL = 0.12;       // radio drops while somebody is talking
  let trackIdx = 0;
  let radio = null;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
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

  /* ---------- the boat radio ---------- */

  function startMusic() {
    init();
    if (ctx.state === 'suspended') ctx.resume();
    if (!musicOn) return;
    if (!radio) {
      radio = new Audio(TRACKS[trackIdx].file);
      radio.loop = true;
      radio.volume = MUSIC_VOL;
    }
    running = true;
    radio.play().catch(() => { running = false; });
  }

  function stopMusic() {
    running = false;
    if (radio) radio.pause();
  }

  /* Flip to the next song on the radio; returns the new track name. */
  function nextTrack() {
    trackIdx = (trackIdx + 1) % TRACKS.length;
    if (radio) {
      radio.src = TRACKS[trackIdx].file;
      radio.volume = MUSIC_VOL;
      if (musicOn) { running = true; radio.play().catch(() => { running = false; }); }
    }
    return TRACKS[trackIdx].name;
  }

  /* ---------- game sfx ---------- */

  const sfx = {
    cast(t, dur) {   // rod whip, then the falling-bomb whistle all the way down
      const s = noise(0.25), g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.setValueAtTime(600, t);
      f.frequency.exponentialRampToValueAtTime(3600, t + 0.22); f.Q.value = 3;
      env(g, t, 0.01, 0.22, 0.35);
      s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 0.3);
      sfx.incoming(t + 0.14, dur);
    },
    incoming(t, dur = 1.5) {   // the classic dropping-bomb whistle
      const o = ctx.createOscillator(), g = ctx.createGain();
      whistle = g;
      const vib = ctx.createOscillator(), vg = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(1500, t);
      o.frequency.exponentialRampToValueAtTime(190, t + dur);
      vib.type = 'sine'; vib.frequency.value = 5.5; vg.gain.value = 26;
      vib.connect(vg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.12);
      g.gain.setValueAtTime(0.3, t + dur - 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(master);
      o.start(t); vib.start(t); o.stop(t + dur); vib.stop(t + dur);
    },
    explode(t) {   // dynamite going off: crack, body, and a rolling tail
      sfx.boom(t);
      const c = noise(0.2), cg = ctx.createGain(), cf = ctx.createBiquadFilter();
      cf.type = 'highpass'; cf.frequency.value = 1200;
      env(cg, t, 0.001, 0.18, 0.8);
      c.connect(cf).connect(cg).connect(master); c.start(t); c.stop(t + 0.25);
      const r = noise(1.8), rg = ctx.createGain(), rf = ctx.createBiquadFilter();
      rf.type = 'lowpass'; rf.frequency.setValueAtTime(700, t);
      rf.frequency.exponentialRampToValueAtTime(90, t + 1.6);
      env(rg, t + 0.05, 0.05, 1.6, 0.5);
      r.connect(rf).connect(rg).connect(master); r.start(t); r.stop(t + 1.9);
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(22, t + 0.9);
      env(og, t, 0.002, 0.9, 0.8);
      o.connect(og).connect(master); o.start(t); o.stop(t + 1);
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

  /* Kill the whistle the moment the dynamite stops existing. */
  function cutWhistle() {
    if (!whistle || !ctx) return;
    const t = ctx.currentTime;
    whistle.gain.cancelScheduledValues(t);
    whistle.gain.setValueAtTime(Math.max(0.0001, whistle.gain.value), t);
    whistle.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    whistle = null;
  }

  function play(name, ...args) {
    if (!musicOn || !ctx) return;
    const f = sfx[name];
    if (f) f(ctx.currentTime, ...args);
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
      'Get that outta here!',
      'Not today, Gary! Have a cold one!',
      'Beer can defense, baby!',
    ],
    foeDefend: [
      'Gary says: get that outta here!',
      'Dale says: nice try, we got a whole cooler!',
      'Gary says: knocked it right out of the sky!',
    ],
  };

  /* Pre-generated ElevenLabs clips (tools/generate_voices.py). Falls back to
     the browser's robot voice when the manifest or a clip is unavailable. */
  const VOICE_DIR = 'voice/';
  let clips = null;
  let playing = null;

  fetch(VOICE_DIR + 'lines.json')
    .then(r => (r.ok ? r.json() : null))
    .then(j => { clips = j; })
    .catch(() => { clips = null; });

  function playClip(file) {
    const a = new Audio(VOICE_DIR + file);
    if (playing) { playing.pause(); }
    playing = a;
    if (radio) radio.volume = DUCK_VOL;
    const restore = () => { if (radio && playing === a) radio.volume = MUSIC_VOL; };
    a.onended = restore;
    a.onerror = restore;
    return a.play().then(() => true).catch(() => { restore(); return false; });
  }

  let voices = [];
  if ('speechSynthesis' in window) {
    const load = () => { voices = speechSynthesis.getVoices(); };
    load();
    speechSynthesis.onvoiceschanged = load;
  }

  const MALE = /david|mark|guy|fred|alex|daniel|george|james|aaron|arthur|tom|rishi|male|man/i;
  const FEMALE = /zira|samantha|victoria|karen|moira|tessa|fiona|susan|hazel|linda|catherine|eva|amelie|female|woman|girl|allison|ava|nicky|serena|kathy|princess/i;

  /* Pick the two deepest-sounding male English voices we can find. */
  function pickVoices() {
    const en = voices.filter(v => /^en/i.test(v.lang) && !FEMALE.test(v.name));
    const pool = en.length ? en : voices.filter(v => !FEMALE.test(v.name));
    const men = pool.filter(v => MALE.test(v.name));
    const list = men.length ? men : pool;
    // an en-US voice drawls better than en-GB
    list.sort((a, b) => (/en[-_]US/i.test(b.lang) ? 1 : 0) - (/en[-_]US/i.test(a.lang) ? 1 : 0));
    return list;
  }

  /* Beat the flat robot delivery into something closer to a lake-county drawl. */
  function drawl(text) {
    return text
      .replace(/\bgoing to\b/gi, 'fixin\u2019 ta')
      .replace(/\bI am\b/g, 'I\u2019m')
      .replace(/\byou all\b/gi, 'y\u2019all')
      .replace(/\byou\b/gi, 'yew')
      .replace(/\byour\b/gi, 'yer')
      .replace(/\bmy\b/gi, 'mah')
      .replace(/\bthat\b/gi, 'thayut')
      .replace(/\bI\b/g, 'Ah')
      .replace(/\bthe\b/gi, 'th\u2019')
      .replace(/\bjust\b/gi, 'jus\u2019')
      .replace(/\bwas\b/gi, 'wuz')
      .replace(/\bboy\b/gi, 'bawh')
      .replace(/\bright\b/gi, 'rahght')
      .replace(/\bnice\b/gi, 'nahce')
      .replace(/\bmy lake\b/gi, 'mah layke')
      .replace(/ing\b/g, 'in\u2019')
      .replace(/!+/g, () => Math.random() < 0.4 ? ', buddy!' : '!');
  }

  /* who: 'you' | 'foe' - two different grizzled southern voices */
  function say(text, who) {
    if (!musicOn || !('speechSynthesis' in window)) return;
    const line = drawl(text.replace(/^(Gary|Dale) says: /, ''));
    const u = new SpeechSynthesisUtterance(line);
    u.rate = who === 'foe' ? 0.78 : 0.84;      // slow enough to sound unhurried
    u.pitch = who === 'foe' ? 0.35 : 0.5;      // gravel, not chipmunk
    u.volume = 1;
    const list = pickVoices();
    if (list.length) u.voice = list[who === 'foe' ? Math.min(1, list.length - 1) : 0];
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  function smack(kind) {
    const who = kind.startsWith('foe') ? 'foe' : 'you';
    const bank = clips && clips[kind];
    if (bank && bank.length) {
      const c = bank[Math.floor(Math.random() * bank.length)];
      if (musicOn) playClip(c.clip).then(ok => { if (!ok) say(c.text, who); });
      return c.text;
    }
    const list = LINES[kind];
    if (!list) return null;
    const line = list[Math.floor(Math.random() * list.length)];
    say(line, who);
    return line;
  }

  function toggle() {
    musicOn = !musicOn;
    if (musicOn) { startMusic(); }
    else {
      stopMusic();
      if (playing) { playing.pause(); playing = null; }
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      if (radio) radio.volume = MUSIC_VOL;
    }
    return musicOn;
  }

  return {
    init, startMusic, stopMusic, nextTrack, play, cutWhistle, smack, toggle,
    get on() { return musicOn; },
    get track() { return TRACKS[trackIdx].name; },
  };
})();
