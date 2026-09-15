/* Dynamite Lake - pontoon battleship vs. an AI opponent.
   One rod, one stick of dynamite, seven anchor spots and a cooler full of defense. */

const DISTANCES = [25, 50, 100, 150, 200, 250, 300];
const MAX_FT = 330;
const SWEEP_MS = 5200;      // one full left-to-right pass of the cast meter
const HULL_HP = 5;

const BOATS = [
  { id: 'skiff',  name: 'Minnow Junior', hullFt: 14, tol: 9,  cans: 3, blurb: 'Two guys, one cooler, zero shade.' },
  { id: 'cruise', name: 'Lake Loafer',    hullFt: 20, tol: 14, cans: 5, blurb: 'Bimini top, radio stuck on classic rock.' },
  { id: 'barge',  name: 'Beer Barge', hullFt: 28, tol: 20, cans: 8, blurb: 'Grill on deck, two coolers, handles like a dock.' },
];

const FOE_TAUNTS = [
  'Gary cracks another one open.',
  'Dale says your cast looked "like a kid throwing a cat".',
  'They turn the radio up.',
  'Somebody on that boat is laughing at you.',
  'Gary reels in a sandwich instead of a fish.',
];

const canvas = document.getElementById('lake');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const WATER_Y = 300;
const CASTER_X = 78;

const el = {
  setup: document.getElementById('setup'),
  game: document.getElementById('game'),
  picker: document.getElementById('boat-picker'),
  start: document.getElementById('start-btn'),
  controls: document.getElementById('controls'),
  log: document.getElementById('log'),
  round: document.getElementById('round-num'),
  phase: document.getElementById('phase-label'),
  youName: document.getElementById('you-name'),
  foeName: document.getElementById('foe-name'),
  youHull: document.getElementById('you-hull'),
  foeHull: document.getElementById('foe-hull'),
  youCans: document.getElementById('you-cans'),
  foeCans: document.getElementById('foe-cans'),
};

let S = null;          // game state
let view = null;       // what the canvas is currently showing
let pickedBoat = null;

/* ---------------- state ---------------- */

function newState(playerBoat) {
  const foeBoat = BOATS[1];
  return {
    round: 1,
    over: false,
    you: { boat: playerBoat, hp: HULL_HP, cans: playerBoat.cans, pos: null, crew: 'you' },
    foe: { boat: foeBoat, hp: HULL_HP, cans: foeBoat.cans, pos: null, crew: 'Gary & Dale' },
    playerHistory: [],   // where the player has anchored, so the AI can read habits
    lastFoeCast: null,
  };
}

function freshView(casterSide) {
  return {
    caster: casterSide,
    showTarget: false,
    targetDist: null,
    aim: null,
    marker: null,
    flight: null,
    beer: null,
    splash: null,
    boom: null,
    strikeZone: null,
  };
}

/* ---------------- setup screen ---------------- */

function buildPicker() {
  el.picker.innerHTML = '';
  BOATS.forEach(b => {
    const card = document.createElement('button');
    card.className = 'boat-card';
    card.innerHTML =
      `<div class="name">${b.name}</div>` +
      `<div class="cap">${b.blurb}</div>` +
      `<div class="stat"><span>Hull length</span><b>${b.hullFt} ft</b></div>` +
      `<div class="stat"><span>Hit window</span><b>&plusmn;${b.tol} ft</b></div>` +
      `<div class="stat"><span>Beers aboard</span><b>${b.cans}</b></div>`;
    card.onclick = () => {
      pickedBoat = b;
      [...el.picker.children].forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      el.start.disabled = false;
    };
    el.picker.appendChild(card);
  });
}

el.start.onclick = () => {
  S = newState(pickedBoat);
  el.setup.classList.add('hidden');
  el.game.classList.remove('hidden');
  el.log.innerHTML = '';
  el.youName.textContent = `You — ${S.you.boat.name}`;
  el.foeName.textContent = `${S.foe.crew} — ${S.foe.boat.name}`;
  log(`You shove off in the ${S.you.boat.name}. Across the water, ${S.foe.crew} idle in the ${S.foe.boat.name}.`, 'big-news');
  syncHud();
  startRound();
};

document.getElementById('reset-btn').onclick = () => location.reload();
document.getElementById('rules-btn').onclick = () => document.getElementById('rules').classList.remove('hidden');
document.getElementById('rules-close').onclick = () => document.getElementById('rules').classList.add('hidden');

/* ---------------- hud + log ---------------- */

function syncHud() {
  el.round.textContent = S.round;
  el.youHull.textContent = hullBar(S.you.hp);
  el.foeHull.textContent = hullBar(S.foe.hp);
  el.youCans.textContent = `${'🍺'.repeat(S.you.cans) || '—'} (${S.you.cans} beers)`;
  el.foeCans.textContent = `(${S.foe.cans} beers) ${'🍺'.repeat(S.foe.cans) || '—'}`;
}

function hullBar(hp) {
  return '▰'.repeat(hp) + '▱'.repeat(HULL_HP - hp);
}

function log(text, cls) {
  const p = document.createElement('p');
  if (cls) p.className = cls;
  p.innerHTML = text;
  el.log.appendChild(p);
  el.log.scrollTop = el.log.scrollHeight;
}

function setPhase(t) { el.phase.textContent = t; }

function controlsHtml(title, inner) {
  el.controls.innerHTML = `<h3>${title}</h3>${inner}`;
}

function controlsTitle(title) {
  const h = el.controls.querySelector('h3');
  if (h) h.innerHTML = title;
}

/* ---------------- round flow ---------------- */

function startRound() {
  if (S.over) return;
  setPhase('Positioning');
  syncHud();
  view = freshView('you');
  view.showTarget = false;
  draw();

  S.foe.pos = foePicksAnchor();

  const row = DISTANCES.map(d =>
    `<button class="dist-btn" data-d="${d}">${d} ft</button>`).join('');
  controlsHtml('Where do you drop anchor this round? (they cannot see you move)',
    `<div class="dist-row">${row}</div>`);
  el.controls.querySelectorAll('.dist-btn').forEach(b => {
    b.onclick = () => {
      S.you.pos = +b.dataset.d;
      S.playerHistory.push(S.you.pos);
      log(`Round ${S.round}: you motor out to <b>${S.you.pos} ft</b> and cut the engine.`);
      playerCastPhase();
    };
  });
}

/* The whole skill of the game: a marker walks the distance scale, you stop it on them. */
function playerCastPhase() {
  setPhase('Your cast');
  view = freshView('you');
  view.marker = { ft: 0, armed: false };
  draw();

  controlsHtml('Wind up and let it fly — then stop the cast on the distance you think they are sitting at.',
    `<div class="dist-row"><button class="dist-btn stop-btn" id="stop">CAST (space)</button></div>`);

  const btn = document.getElementById('stop');
  let t0 = null;
  let running = false;

  // slow, steady left-to-right sweep; it loops back to the dock if you never pull the trigger
  const ftAt = now => ((now - t0) / SWEEP_MS % 1) * MAX_FT;

  function tick(now) {
    if (!running) return;
    view.marker = { ft: ftAt(now), armed: true };
    draw();
    requestAnimationFrame(tick);
  }

  function startSweep() {
    running = true;
    t0 = performance.now();
    btn.textContent = 'STOP THE CAST (space)';
    controlsTitle('Stop the marker on their range — wherever it stops is exactly where the dynamite lands.');
    setHotkey(stop);
    requestAnimationFrame(tick);
  }

  function stop() {
    if (!running) return;
    running = false;
    setHotkey(null);
    // read the sweep at the exact instant of the press, not at the last painted frame
    const landing = clamp(Math.round(ftAt(performance.now())), 0, MAX_FT);
    view.marker = { ft: landing, armed: true, frozen: true };
    draw();
    el.controls.innerHTML = '<h3>Casting…</h3>';
    resolvePlayerCast(landing);
  }

  btn.onclick = () => (running ? stop() : startSweep());
  setHotkey(startSweep);
}

/* spacebar mirrors whatever timing button is live */
let hotkey = null;
function setHotkey(fn) { hotkey = fn; }
window.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.repeat || !hotkey) return;
  e.preventDefault();
  hotkey();
});

async function resolvePlayerCast(landing) {
  const target = S.foe;
  S.lastPlayerLanding = landing;
  const wouldHit = Math.abs(landing - target.pos) <= target.boat.tol;

  // The AI only bothers with a beer can when the lure is coming in close.
  const nearMiss = Math.abs(landing - target.pos) <= target.boat.tol + 22;
  const defends = target.cans > 0 && nearMiss && Math.random() < (wouldHit ? 0.32 : 0.12);

  view.showTarget = true;
  view.targetDist = target.pos;
  await flyCast({
    fromX: CASTER_X, toFt: landing,
    intercept: defends ? 0.62 : null,
    defenderFt: target.pos,
  });

  if (defends) {
    target.cans--;
    syncHud();
    log(`🍺 <b>${target.crew}</b> pegged your dynamite mid-air with a cold one — it blew up over open water. ${target.cans} beers left on their deck.`, 'def');
  } else if (wouldHit) {
    target.hp--;
    log(`💥 <b>DIRECT HIT</b> at ${landing} ft — you blew a pontoon tube off the ${target.boat.name}. ${target.hp} hits left.`, 'hit');
  } else {
    const d = landing - target.pos;
    log(`Splash at ${landing} ft — <b>${Math.abs(d)} ft ${d > 0 ? 'long' : 'short'}</b>. They were sitting at ${target.pos} ft. ${pick(FOE_TAUNTS)}`, 'miss');
  }
  syncHud();

  if (target.hp <= 0) return endGame(true);
  await pause(600);
  foeTurn();
}

/* ---------------- AI turn ---------------- */

function foePicksAnchor() {
  // Move somewhere new, and lean away from wherever the player last shelled.
  const avoid = S.lastPlayerLanding;
  const opts = DISTANCES.filter(d => d !== S.foe.pos);
  const weights = opts.map(d => (avoid != null && Math.abs(d - avoid) <= 25) ? 0.35 : 1);
  return weightedPick(opts, weights);
}

function foeAim() {
  // Reads the player's anchoring habits: recent spots are weighted heaviest.
  const weights = DISTANCES.map(d => {
    let w = 1;
    S.playerHistory.forEach((h, i) => {
      const recency = 1 + i / Math.max(1, S.playerHistory.length);
      if (h === d) w += 1.6 * recency;
      else if (Math.abs(h - d) <= 50) w += 0.5 * recency;
    });
    return w;
  });
  return weightedPick(DISTANCES, weights);
}

async function foeTurn() {
  setPhase('Incoming!');
  view = freshView('foe');
  view.showTarget = true;
  view.targetDist = S.you.pos;
  draw();

  const aim = foeAim();
  const noise = gauss(0, 11);
  const landing = clamp(Math.round(aim + noise), 5, MAX_FT);
  S.lastFoeCast = landing;
  const wouldHit = Math.abs(landing - S.you.pos) <= S.you.boat.tol;

  log(`${S.foe.crew} stand up, wind up the rod… <i>here it comes</i>.`);

  let thrownAt = null;
  const canThrow = S.you.cans > 0;
  controlsHtml(canThrow
      ? 'CHUCK A BEER CAN while the dynamite is inside the red strike zone!'
      : 'Cooler’s empty. Nothing to do but duck.',
    canThrow
      ? `<div class="dist-row"><button class="dist-btn defend-btn" id="defend">🍺 THROW BEER CAN</button></div>`
      : `<div class="dist-row"><button class="dist-btn" disabled>No beers left</button></div>`);

  if (canThrow) {
    const btn = document.getElementById('defend');
    const throwCan = () => {
      if (thrownAt != null || S.you.cans <= 0) return;
      thrownAt = view.flight ? view.flight.t : -1;   // -1 = thrown before the cast even left the rod
      S.you.cans--;                                  // the can leaves the cooler the instant you throw it
      syncHud();
      btn.disabled = true;
      setHotkey(null);
    };
    btn.onclick = throwCan;
    setHotkey(throwCan);
  }

  view.strikeZone = [0.3, 0.72];
  await windUp(4);

  await flyCast({
    duration: 2400,
    fromX: CASTER_X, toFt: landing,
    defenderFt: S.you.pos,
    watchThrow: () => thrownAt,
    strikeZone: view.strikeZone,
    beerFromX: xFor(S.you.pos),
  });

  setHotkey(null);
  const intercepted = thrownAt != null && thrownAt >= view.strikeZone[0] && thrownAt <= view.strikeZone[1];

  if (intercepted) {
    log(`🍺 <b>You smoked it out of the air.</b> The dynamite went off over the water and rained bluegill everywhere. ${S.you.cans} beers left in your cooler.`, 'def');
  } else if (thrownAt != null && !wouldHit) {
    log(`You panic-threw a beer (${thrownAt < view.strikeZone[0] ? 'too early' : 'too late'}) — but their cast splashed wide at ${landing} ft anyway. ${S.you.cans} beers left.`, 'miss');
  } else if (thrownAt != null) {
    S.you.hp--;
    log(`💥 Your beer sailed ${thrownAt < view.strikeZone[0] ? 'under' : 'behind'} it. The dynamite hit your deck — ${S.you.hp} hits left, ${S.you.cans} beers left.`, 'hit');
  } else if (wouldHit) {
    S.you.hp--;
    log(`💥 <b>They hit you</b> at ${landing} ft. Your ${S.you.boat.name} is taking water — ${S.you.hp} hits left.`, 'hit');
  } else {
    const d = landing - S.you.pos;
    log(`Their dynamite splashes at ${landing} ft, <b>${Math.abs(d)} ft ${d > 0 ? 'past' : 'short of'}</b> you. Beers all around.`, 'miss');
  }
  syncHud();

  if (S.you.hp <= 0) return endGame(false);
  await pause(700);
  S.round++;
  startRound();
}

/* ---------------- animation ---------------- */

function pause(ms) { return new Promise(r => setTimeout(r, ms)); }

function animate(duration, step) {
  return new Promise(res => {
    const t0 = performance.now();
    (function f(now) {
      const t = Math.min(1, (now - t0) / duration);
      step(t);
      if (t < 1) requestAnimationFrame(f); else res();
    })(performance.now());
  });
}

/* Four seconds of them standing up, spilling a beer and winding up the rod. */
async function windUp(seconds) {
  const t0 = performance.now();
  while (true) {
    const left = seconds - (performance.now() - t0) / 1000;
    if (left <= 0) break;
    view.windUp = left;
    draw();
    await new Promise(r => requestAnimationFrame(r));
  }
  view.windUp = null;
}

async function flyCast(opts) {
  const toX = xFor(opts.toFt);
  const rodTip = { x: CASTER_X + 40, y: WATER_Y - 86 };
  let boomAt = null;

  await animate(opts.duration ?? 1500, t => {
    const x = rodTip.x + (toX - rodTip.x) * t;
    const arc = 150 * Math.sin(Math.PI * t);
    const y = rodTip.y + (WATER_Y - rodTip.y) * t - arc;
    view.flight = { x, y, t, rodTip };

    // AI beer-can interception at a fixed point in the flight
    if (opts.intercept != null && t >= opts.intercept && !boomAt) {
      boomAt = { x, y };
      view.boom = { x, y, t0: performance.now(), beer: true };
    }
    if (opts.watchThrow) {
      const th = opts.watchThrow();
      if (th != null && !view.beer) {
        view.beer = { t0: t, fromX: opts.beerFromX, fromY: WATER_Y - 70 };
      }
      if (view.beer) {
        const bt = clamp((t - view.beer.t0) / 0.18, 0, 1);
        view.beer.x = view.beer.fromX + (x - view.beer.fromX) * bt;
        view.beer.y = view.beer.fromY + (y - view.beer.fromY) * bt - 40 * Math.sin(Math.PI * bt);
        view.beer.done = bt >= 1;
        const inZone = th >= opts.strikeZone[0] && th <= opts.strikeZone[1];
        if (view.beer.done && inZone && !boomAt) {
          boomAt = { x, y };
          view.boom = { x, y, t0: performance.now(), beer: true };
        }
      }
    }
    draw();
    if (boomAt) view.flight = null;
  });

  if (boomAt) { await burst(boomAt.x, boomAt.y); return; }

  const hitBoat = Math.abs(opts.toFt - opts.defenderFt) <= tolOf(opts);
  view.flight = null;
  if (hitBoat) await burst(toX, WATER_Y - 22);
  else await splash(toX);
}

function tolOf(opts) {
  const side = view.caster === 'you' ? S.foe : S.you;
  return side.boat.tol;
}

async function burst(x, y) {
  view.boom = { x, y, r: 0 };
  await animate(700, t => { view.boom.r = 12 + t * 70; view.boom.fade = 1 - t; draw(); });
  view.boom = null;
  draw();
}

async function splash(x) {
  view.splash = { x, r: 0 };
  await animate(600, t => { view.splash.r = t * 34; view.splash.fade = 1 - t; draw(); });
  view.splash = null;
  draw();
}

/* ---------------- drawing ---------------- */

function xFor(ft) { return 110 + (ft / MAX_FT) * (W - 170); }

function draw() {
  drawSky();
  drawRuler();

  const casterSide = view.caster === 'you' ? S.you : S.foe;
  const targetSide = view.caster === 'you' ? S.foe : S.you;

  drawWater();

  if (view.showTarget && view.targetDist != null) {
    drawBoat(xFor(view.targetDist), targetSide.boat, -1, targetSide === S.you);
    label(xFor(view.targetDist), WATER_Y - 108, `${view.targetDist} ft`);
  } else {
    drawFog();
  }

  drawBoat(CASTER_X, casterSide.boat, 1, casterSide === S.you, true);
  label(CASTER_X, WATER_Y - 112, view.caster === 'you' ? 'YOU' : `${S.foe.crew}`);

  if (view.flight) drawFlight(view.flight);
  if (view.beer && !view.beer.consumed) drawBeer(view.beer);
  if (view.splash) drawSplash(view.splash);
  if (view.boom) drawBoom(view.boom);
  if (view.marker) drawMeter(view.marker);
  if (view.strikeZone && (view.flight || view.windUp != null)) drawZone(view.flight ? view.flight.t : 0, view.strikeZone);
  if (view.windUp != null) drawWindUp(view.windUp);
}

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, WATER_Y);
  g.addColorStop(0, '#f7b267');
  g.addColorStop(.45, '#e9825a');
  g.addColorStop(1, '#5d4a6b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, WATER_Y);

  ctx.fillStyle = '#ffe28a';
  ctx.beginPath(); ctx.arc(W - 150, 80, 34, 0, 7); ctx.fill();

  // tree line
  ctx.fillStyle = '#20313a';
  ctx.beginPath();
  ctx.moveTo(0, WATER_Y);
  for (let x = 0; x <= W; x += 22) {
    const h = 26 + Math.sin(x * 0.07) * 9 + Math.sin(x * 0.021) * 14;
    ctx.lineTo(x, WATER_Y - h);
  }
  ctx.lineTo(W, WATER_Y);
  ctx.closePath(); ctx.fill();
}

function drawWater() {
  const g = ctx.createLinearGradient(0, WATER_Y, 0, H);
  g.addColorStop(0, '#2a6d8c');
  g.addColorStop(1, '#0c2634');
  ctx.fillStyle = g;
  ctx.fillRect(0, WATER_Y, W, H - WATER_Y);

  ctx.strokeStyle = 'rgba(231,242,245,.16)';
  ctx.lineWidth = 2;
  const off = (performance.now() / 900) % 40;
  for (let i = 0; i < 7; i++) {
    const y = WATER_Y + 12 + i * 15;
    ctx.beginPath();
    for (let x = -40; x < W + 40; x += 40) {
      ctx.moveTo(x + off + (i % 2) * 20, y);
      ctx.lineTo(x + off + 18 + (i % 2) * 20, y);
    }
    ctx.stroke();
  }
}

function drawRuler() {
  ctx.save();
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  DISTANCES.forEach(d => {
    const x = xFor(d);
    ctx.strokeStyle = 'rgba(231,242,245,.28)';
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(x, WATER_Y - 4); ctx.lineTo(x, H - 18); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(231,242,245,.55)';
    ctx.fillText(`${d}`, x, H - 5);
  });
  ctx.restore();
}

function drawFog() {
  ctx.save();
  ctx.fillStyle = 'rgba(160,190,205,.13)';
  ctx.fillRect(xFor(15), WATER_Y - 120, xFor(MAX_FT) - xFor(15), 120);
  ctx.fillStyle = 'rgba(231,242,245,.42)';
  ctx.font = 'italic 14px "Trebuchet MS"';
  ctx.textAlign = 'center';
  ctx.fillText('…somewhere out there in the haze…', (xFor(15) + xFor(MAX_FT)) / 2, WATER_Y - 96);
  ctx.restore();
}

function label(x, y, text) {
  ctx.save();
  ctx.font = 'bold 12px "Trebuchet MS"';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(8,20,28,.65)';
  const w = ctx.measureText(text).width + 12;
  ctx.fillRect(x - w / 2, y - 14, w, 18);
  ctx.fillStyle = '#ffd25a';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/* A pontoon boat, side-on, crewed by two gentlemen of a certain age. */
function drawBoat(x, boat, facing, isPlayer, withRod) {
  const s = boat.hullFt / 20;          // visual scale from hull length
  const bw = 96 * s, bh = 26 * s;
  const y = WATER_Y - 10;
  const bob = Math.sin(performance.now() / 700 + x) * 2;

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(facing, 1);

  // pontoon tubes
  ctx.fillStyle = '#b9c4c9';
  roundRect(-bw / 2, -6, bw, 13, 7); ctx.fill();
  ctx.fillStyle = '#8d999e';
  roundRect(-bw / 2 + 6, -1, bw - 12, 8, 4); ctx.fill();

  // deck
  ctx.fillStyle = isPlayer ? '#3f7f52' : '#7c4a3a';
  roundRect(-bw / 2 - 3, -18, bw + 6, 13, 3); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  for (let i = -bw / 2; i < bw / 2; i += 9) ctx.fillRect(i, -18, 1.5, 13);

  // rail
  ctx.strokeStyle = '#d8e3e7'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-bw / 2, -18); ctx.lineTo(-bw / 2, -30);
  ctx.lineTo(bw / 2, -30); ctx.lineTo(bw / 2, -18);
  ctx.stroke();

  // bimini top on the bigger rigs
  if (boat.hullFt >= 20) {
    ctx.fillStyle = isPlayer ? '#2f5f9c' : '#9c2f2f';
    roundRect(-bw / 4, -62, bw / 2 + 10, 7, 3); ctx.fill();
    ctx.strokeStyle = '#95a3a8'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-bw / 4 + 3, -55); ctx.lineTo(-bw / 4 + 3, -30);
    ctx.moveTo(bw / 4 + 7, -55); ctx.lineTo(bw / 4 + 7, -30);
    ctx.stroke();
  }

  // cooler
  ctx.fillStyle = '#e4e9ea'; ctx.fillRect(-bw / 2 + 6, -29, 16, 11);
  ctx.fillStyle = '#2f6fa8'; ctx.fillRect(-bw / 2 + 6, -31, 16, 3);

  // two 50-something captains
  drawGuy(-8, -30, '#e8d9b0', '#c0392b');
  drawGuy(bw / 2 - 22, -30, '#cfd6d8', '#2f6fa8');

  if (withRod) drawRod(bw / 2 - 18, -40);

  ctx.restore();

  // reflection
  ctx.save();
  ctx.globalAlpha = .18;
  ctx.translate(x, WATER_Y + 12);
  ctx.scale(facing, -0.5);
  ctx.fillStyle = '#e7f2f5';
  roundRect(-bw / 2, -18, bw, 20, 6); ctx.fill();
  ctx.restore();
}

function drawGuy(x, y, shirt, hat) {
  ctx.save();
  ctx.translate(x, y);
  // belly
  ctx.fillStyle = shirt;
  roundRect(-7, -16, 15, 18, 6); ctx.fill();
  // head
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath(); ctx.arc(0, -22, 6, 0, 7); ctx.fill();
  // beard / mustache
  ctx.fillStyle = '#b9b9b9';
  ctx.beginPath(); ctx.arc(0, -19, 5, 0, Math.PI); ctx.fill();
  // ball cap
  ctx.fillStyle = hat;
  ctx.beginPath(); ctx.arc(0, -25, 6, Math.PI, 0); ctx.fill();
  ctx.fillRect(0, -26, 11, 2.5);
  // beer in hand
  ctx.fillStyle = '#e8a021'; ctx.fillRect(8, -12, 4, 7);
  ctx.restore();
}

function drawRod(x, y) {
  ctx.save();
  ctx.strokeStyle = '#2b2b2b';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, y + 12);
  ctx.quadraticCurveTo(x + 22, y - 18, x + 40, y - 46);
  ctx.stroke();
  ctx.restore();
}

function drawFlight(f) {
  // fishing line back to the rod tip
  ctx.save();
  ctx.strokeStyle = 'rgba(231,242,245,.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(f.rodTip.x, f.rodTip.y);
  ctx.quadraticCurveTo((f.rodTip.x + f.x) / 2, Math.min(f.y, f.rodTip.y) - 20, f.x, f.y);
  ctx.stroke();

  // dynamite on the lure
  ctx.translate(f.x, f.y);
  ctx.rotate(f.t * 8);
  ctx.fillStyle = '#c8452d';
  roundRect(-4, -9, 8, 18, 2); ctx.fill();
  ctx.fillStyle = '#f7e8c8'; ctx.fillRect(-4, -2, 8, 3);
  // fuse spark
  ctx.fillStyle = '#ffd25a';
  ctx.beginPath(); ctx.arc(0, -13, 2.5 + Math.random() * 2, 0, 7); ctx.fill();
  ctx.restore();
}

function drawBeer(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(performance.now() / 60);
  ctx.fillStyle = '#e8a021';
  roundRect(-4, -6, 8, 12, 2); ctx.fill();
  ctx.fillStyle = '#c0c8cb'; ctx.fillRect(-4, -6, 8, 2);
  ctx.restore();
}

function drawSplash(s) {
  ctx.save();
  ctx.globalAlpha = s.fade ?? 1;
  ctx.strokeStyle = '#e7f2f5';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(s.x, WATER_Y + 6, s.r, s.r / 3, 0, 0, 7); ctx.stroke();
  ctx.fillStyle = '#e7f2f5';
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i / 6) * Math.PI;
    ctx.beginPath();
    ctx.arc(s.x + Math.cos(a) * s.r, WATER_Y + Math.sin(a) * s.r * 0.9, 2.5, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

function drawBoom(b) {
  ctx.save();
  ctx.globalAlpha = b.fade ?? 1;
  const r = b.r ?? 20;
  const g = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, r);
  g.addColorStop(0, '#fff3c4');
  g.addColorStop(.4, '#ffb03a');
  g.addColorStop(1, 'rgba(200,69,45,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 7); ctx.fill();
  ctx.restore();
}

/* Cast meter: a marker sweeping the same distance scale the lake is drawn on. */
function drawMeter(m) {
  const y = H - 46;
  const x0 = xFor(0), x1 = xFor(MAX_FT);
  ctx.save();

  ctx.fillStyle = 'rgba(6,17,26,.82)';
  roundRect(x0 - 26, y - 30, x1 - x0 + 52, 62, 8); ctx.fill();

  ctx.fillStyle = 'rgba(231,242,245,.18)';
  ctx.fillRect(x0, y - 5, x1 - x0, 10);

  ctx.textAlign = 'center';
  ctx.font = 'bold 11px "Trebuchet MS"';
  DISTANCES.forEach(d => {
    const x = xFor(d);
    ctx.fillStyle = '#e7f2f5';
    ctx.fillRect(x - 1.5, y - 12, 3, 24);
    ctx.fillStyle = '#9fc0cd';
    ctx.fillText(`${d}`, x, y + 26);
  });

  const px = xFor(m.ft);
  if (m.armed) {
    ctx.fillStyle = m.frozen ? '#ffd25a' : '#c8452d';
    ctx.beginPath();
    ctx.moveTo(px, y - 14); ctx.lineTo(px + 8, y - 26); ctx.lineTo(px - 8, y - 26);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(px - 2, y - 14, 4, 28);
  }

  ctx.font = 'bold 13px "Trebuchet MS"';
  ctx.fillStyle = m.frozen ? '#ffd25a' : '#e7f2f5';
  ctx.textAlign = 'left';
  ctx.fillText(m.armed ? `${Math.round(m.ft)} ft` : 'press CAST to start the sweep', x0 - 20, y - 18);
  ctx.restore();
}

function drawWindUp(left) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(6,17,26,.78)';
  roundRect(W / 2 - 190, 24, 380, 62, 10); ctx.fill();
  ctx.fillStyle = '#ffd25a';
  ctx.font = 'bold 20px "Trebuchet MS"';
  ctx.fillText(`THEY ARE WINDING UP… ${Math.ceil(left)}`, W / 2, 50);
  ctx.font = '14px "Trebuchet MS"';
  ctx.fillStyle = '#9fc0cd';
  ctx.fillText('get a beer in your hand — space or the button throws it', W / 2, 74);
  ctx.restore();
}

function drawZone(t, zone) {
  const y = H - 34;
  const x0 = 200, x1 = W - 200;
  ctx.save();
  ctx.fillStyle = 'rgba(6,17,26,.7)';
  roundRect(x0 - 10, y - 14, x1 - x0 + 20, 26, 6); ctx.fill();
  ctx.fillStyle = 'rgba(231,242,245,.2)';
  ctx.fillRect(x0, y - 5, x1 - x0, 10);
  ctx.fillStyle = 'rgba(200,69,45,.85)';
  ctx.fillRect(x0 + (x1 - x0) * zone[0], y - 8, (x1 - x0) * (zone[1] - zone[0]), 16);
  ctx.fillStyle = '#ffd25a';
  ctx.fillRect(x0 + (x1 - x0) * t - 2, y - 12, 4, 24);
  ctx.font = 'bold 11px "Trebuchet MS"';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9fc0cd';
  ctx.fillText('BEER-CAN STRIKE ZONE', x0 - 8, y - 20);
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------------- end ---------------- */

function endGame(playerWon) {
  S.over = true;
  setPhase(playerWon ? 'You win' : 'You sank');
  if (playerWon) {
    log(`🎆 <b>The ${S.foe.boat.name} is going down.</b> ${S.foe.crew} are treading water, beers held high. You win Dynamite Lake.`, 'big-news');
  } else {
    log(`🌊 <b>Your ${S.you.boat.name} is on the bottom.</b> Gary salutes you with a warm can of light beer.`, 'big-news');
  }
  controlsHtml('Game over', `<div class="dist-row"><button class="dist-btn stop-btn" onclick="location.reload()">Rematch</button></div>`);
}

/* ---------------- utils ---------------- */

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function gauss(mu, sd) {
  const u = 1 - Math.random(), v = Math.random();
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function weightedPick(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

/* idle water animation so the lake never looks frozen */
(function idle() {
  const sweeping = view && view.marker && view.marker.armed && !view.marker.frozen;
  if (view && !view.flight && !sweeping && view.windUp == null) draw();
  requestAnimationFrame(idle);
})();

buildPicker();
