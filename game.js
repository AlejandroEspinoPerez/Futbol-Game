import * as THREE from 'three';

/* =========================================================
   GOLAZO PARK — fútbol arcade 3D en arena con paredes
   Mismo motor visual que Remate Park, Jonrón Park y Derrape Park:
   materiales toon con contorno, jugadores chibi y estadios hechos
   con primitivas. Controlas a UN jugador (tercera persona); tus
   compañeros y los porteros los maneja la PC (o tus amigos en línea).
   ========================================================= */

// ---------- utilidades ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const angDamp = (a, b, k, dt) => a + wrapA(b - a) * (1 - Math.exp(-k * dt));
const SM = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
const hyp = Math.hypot;
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || /[?&]touch=1/.test(location.search);
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const fmtClock = (t) => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

// ---------- reglas y física ----------
const STEP = 1 / 60;
const G = 17;                 // gravedad del balón (arcade)
const BR = 0.24;              // radio del balón
const PR = 0.42;              // radio de un jugador
const GW = 6.2, GH = 2.4, GD = 1.7;   // portería: ancho, alto y fondo
const CR = 3.2;               // las esquinas de la arena están recortadas en diagonal
const WALL_H = 1.1;           // altura de las vallas (encima hay cristal invisible)
const CEIL = 16;              // techo invisible: el balón nunca sale
const RUN = 6.4, SPRINT = 8.9, CARRY = 0.92;   // velocidades (el que lleva el balón va un poco más lento)
const SIZES = { 1: { L: 30, W: 19 }, 2: { L: 36, W: 23 }, 3: { L: 42, W: 27 }, 4: { L: 48, W: 30 } };
const MAX_HUMANS = 8;
const DIFF = [
  { name: 'Fácil', spd: 0.85, react: 0.42, aim: 0.5, press: 0.55, gk: 0.72, tackle: 0.45, think: 0.45 },
  { name: 'Normal', spd: 0.95, react: 0.27, aim: 0.75, press: 0.8, gk: 0.9, tackle: 0.75, think: 0.3 },
  { name: 'Difícil', spd: 1.02, react: 0.16, aim: 0.92, press: 1, gk: 1.03, tackle: 1.05, think: 0.18 },
];
const TIMES = [2, 3, 5];

// ---------- clubes (colores de camiseta) ----------
const CLUBS = [
  { id: 'halcones', name: 'Halcones', emoji: '🦅', c1: '#3a7bff', c2: '#ffffff', r: 3 },
  { id: 'volcanes', name: 'Volcanes', emoji: '🌋', c1: '#ff4f4f', c2: '#2b2f45', r: 4 },
  { id: 'tiburones', name: 'Tiburones', emoji: '🦈', c1: '#18b6a5', c2: '#ffffff', r: 3 },
  { id: 'abejas', name: 'Abejas', emoji: '🐝', c1: '#ffc93a', c2: '#2b2f45', r: 2 },
  { id: 'pumas', name: 'Pumas', emoji: '🐆', c1: '#ff7a2f', c2: '#ffffff', r: 3 },
  { id: 'cometas', name: 'Cometas', emoji: '☄️', c1: '#7e57c2', c2: '#ffe14d', r: 4 },
  { id: 'cactus', name: 'Cactus', emoji: '🌵', c1: '#2fd27a', c2: '#1d2340', r: 2 },
  { id: 'pinguinos', name: 'Pingüinos', emoji: '🐧', c1: '#2b2f45', c2: '#ffffff', r: 5 },
];
const CLUB_BY_ID = Object.fromEntries(CLUBS.map((c) => [c.id, c]));
const clubOf = (id) => CLUB_BY_ID[id] || CLUBS[0];
function hexDist(a, b) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const A = p(a), B = p(b);
  return hyp(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}
// equipación de cada equipo; el visitante usa la segunda si los colores se parecen
function kitsFor(c0, c1) {
  const A = clubOf(c0), B = clubOf(c1);
  const k0 = { shirt: A.c1, shorts: A.c2, club: A.id };
  let k1 = { shirt: B.c1, shorts: B.c2, club: B.id };
  if (hexDist(A.c1, B.c1) < 120) k1 = { shirt: B.c2, shorts: B.c1, club: B.id };
  if (hexDist(k0.shirt, k1.shirt) < 90) k1 = { shirt: '#f1f3f8', shorts: B.c1, club: B.id };
  return [k0, k1];
}

// ---------- estilo de juego (pequeñas ventajas) ----------
const STYLES = {
  todo: { n: 'Todoterreno', d: 'Un poco de todo', shot: 1, pass: 1, tackle: 1, stam: 1, spd: 1 },
  delantero: { n: 'Delantero', d: 'Tiros más fuertes y precisos', shot: 1.12, pass: 0.95, tackle: 0.9, stam: 0.95, spd: 1.02 },
  medio: { n: 'Mediocampista', d: 'Pases perfectos y más aguante', shot: 0.97, pass: 1.15, tackle: 1, stam: 1.2, spd: 1 },
  defensa: { n: 'Defensa', d: 'Barridas largas y robos seguros', shot: 0.93, pass: 1, tackle: 1.25, stam: 1.05, spd: 0.98 },
  veloz: { n: 'Extremo veloz', d: 'Corre más, pero tira más flojo', shot: 0.92, pass: 1, tackle: 0.9, stam: 0.95, spd: 1.07 },
};

// ---------- personalización (se desbloquea por nivel) ----------
const OPTS = {
  skin: ['#ffdcc0', '#f3c48e', '#d8a06b', '#b47a4c', '#8b5a36', '#5f3b23'].map((v) => ({ v, lv: 1 })),
  hair: [['short', 'Corto', 1], ['long', 'Melena', 1], ['buns', 'Moño', 1], ['curly', 'Rizos', 1], ['spiky', 'Pinchos', 2], ['mohawk', 'Cresta', 4], ['bald', 'Rapado', 3], ['afro', 'Afro', 6]].map(([v, n, lv]) => ({ v, n, lv })),
  hairColor: [['#2b1d14', 1], ['#6b3e1f', 1], ['#e8c25a', 1], ['#d9502f', 2], ['#f2f2f2', 3], ['#7a4cff', 5], ['#25b8ff', 7], ['#ff5fb0', 9]].map(([v, lv]) => ({ v, lv })),
  boots: [['#1d2340', 1], ['#ffffff', 1], ['#ff4f4f', 2], ['#ffc93a', 3], ['#2fd27a', 4], ['#25b8ff', 6], ['#ff4f9a', 8], ['#ff8a1a', 10]].map(([v, lv]) => ({ v, lv })),
  acc: [['none', 'Nada', 1], ['band', 'Cinta', 1], ['shades', 'Gafas', 2], ['mustache', 'Bigote', 3], ['wrist', 'Muñequeras', 4], ['chain', 'Cadena', 6], ['crown', 'Corona', 12]].map(([v, n, lv]) => ({ v, n, lv })),
  cel: [['punos', 'Puños arriba', 1], ['aplauso', 'Aplauso', 1], ['salto', 'Salto', 2], ['avion', 'Avioncito', 3], ['baile', 'Bailecito', 5], ['campeon', 'Brazos cruzados', 7], ['voltereta', 'Voltereta', 9]].map(([v, n, lv]) => ({ v, n, lv })),
  style: Object.keys(STYLES).map((v, i) => ({ v, n: STYLES[v].n, lv: [1, 1, 1, 2, 4][i] })),
  trail: [['none', 'Nada', 1], ['#ffe14d', 'Chispas', 2], ['#25b8ff', 'Rayo azul', 4], ['#ff4f4f', 'Fuego', 6], ['#c06bff', 'Galaxia', 8], ['rainbow', 'Arcoíris', 11]].map(([v, n, lv]) => ({ v, n, lv })),
};
const OPT_LABEL = { skin: 'Piel', hair: 'Pelo', hairColor: 'Color de pelo', boots: 'Botines', acc: 'Accesorio', cel: 'Celebración de gol', style: 'Estilo de juego', trail: 'Estela del tiro' };
const DEFAULT_LOOK = { skin: '#f3c48e', hair: 'short', hairColor: '#2b1d14', boots: '#1d2340', acc: 'none', cel: 'punos', style: 'todo', trail: 'none', num: 10 };
function sanitizeLook(l) {
  const out = {};
  for (const k of Object.keys(OPTS)) out[k] = l && OPTS[k].some((o) => o.v === l[k]) ? l[k] : DEFAULT_LOOK[k];
  out.num = clamp((l && l.num) | 0, 1, 99) || 10;
  return out;
}
const CPU_NAMES = ['Lucía', 'Mateo', 'Vale', 'Nico', 'Sofi', 'Tomás', 'Cami', 'Bruno', 'Pau', 'Leo', 'Martina', 'Gael',
  'Abril', 'Iker', 'Noa', 'Thiago', 'Emma', 'Dante', 'Mía', 'Santi', 'Lola', 'Hugo', 'Zoe', 'Rocco', 'Maite', 'Joaco',
  'Yadier', 'Liván', 'Yuli', 'Orestes', 'Dayana', 'Alexei', 'Yasmany', 'Osmani', 'Leidy', 'Frank'];
function randomLook(rng = Math.random) {
  const pk = (a) => a[Math.floor(rng() * a.length)];
  return {
    skin: pk(OPTS.skin).v, hair: pk(OPTS.hair).v, hairColor: pk(OPTS.hairColor.slice(0, 5)).v, boots: pk(OPTS.boots).v,
    acc: rng() < 0.65 ? 'none' : pk(['band', 'shades', 'mustache', 'wrist']), cel: pk(OPTS.cel.slice(0, 6)).v,
    style: pk(Object.keys(STYLES)), trail: 'none', num: 2 + Math.floor(rng() * 28),
  };
}

// ---------- guardado ----------
const SAVE_KEY = 'golazopark_v1';
function defaultSave() {
  return {
    name: 'Crack' + randi(10, 99), look: Object.assign({}, DEFAULT_LOOK), club: 'halcones', rival: 'volcanes',
    xp: 0, level: 1, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, matches: 0, streak: 0, cups: 0,
    size: 3, time: 3, diff: 1, venue: 'estadio', golden: 1, muted: false, quality: 'auto', tags: 'auto', vib: true,
    seenHelp: false, cam: 0, music: true, voice: true, replay: 1, daily: null, achs: {}, cup: null, tutDone: false, sprintToggle: 0,
  };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.look) { const o = Object.assign(defaultSave(), s); o.look = sanitizeLook(Object.assign({}, DEFAULT_LOOK, s.look)); o.achs = s.achs || {}; return o; }
  } catch (e) { /* sin almacenamiento */ }
  return defaultSave();
}
const SAVE = loadSave();
function storeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* ignorar */ } }
const xpNeed = (lv) => 250 + lv * 150;

// ---------- sonido (sintetizado, sin archivos) ----------
const SFX = (() => {
  let ctx = null, master = null, noiseBuf = null, muted = false, crowdL = null, mg = null;
  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // murmullo del público: ruido filtrado que sube cuando hay peligro
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 850; f.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(f).connect(g).connect(master); s.start();
      crowdL = { f, g };
      mg = ctx.createGain(); mg.gain.value = 0.26; mg.connect(master);
    } catch (e) { ctx = null; }
  }
  function env(g, t0, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
  }
  function tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null, delay = 0, vib = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 32; lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
    env(g, t, 0.005, vol, dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, type = 'lowpass', freq = 1000, q = 1, delay = 0, attack = 0.003, slide = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + attack + dur);
    const g = ctx.createGain(); env(g, t, attack, vol, dur);
    s.connect(f).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur + attack + 0.05);
  }
  // música: ritmo de estadio (bombo, palmas, bajo y arpegio)
  let musOn = false, musNext = 0, musStep = 0;
  const PROG = [[43, 0, 4, 7], [48, 0, 4, 7], [45, 0, 3, 7], [41, 0, 4, 7]];
  const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function mnote(f, dur, type, vol, when, slide) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, when);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, when + dur);
    env(g, when, 0.005, vol, dur); o.connect(g).connect(mg); o.start(when); o.stop(when + dur + 0.05);
  }
  function mnoise(dur, vol, freq, when) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
    const g = ctx.createGain(); env(g, when, 0.002, vol, dur);
    s.connect(f).connect(g).connect(mg); s.start(when, Math.random()); s.stop(when + dur + 0.05);
  }
  setInterval(() => {
    if (!ctx || !musOn) return;
    if (musNext < ctx.currentTime) musNext = ctx.currentTime + 0.02;
    while (musNext < ctx.currentTime + 0.18) {
      const ch = PROG[Math.floor(musStep / 16) % 4], st = musStep % 16, root = ch[0];
      if (!muted) {
        if (st % 4 === 0) mnote(140, 0.16, 'sine', 0.5, musNext, 45);
        if (st === 4 || st === 12) mnoise(0.1, 0.18, 1400, musNext);
        if (st % 2 === 1) mnoise(0.03, 0.06, 7500, musNext);
        if ([0, 3, 6, 10, 12].includes(st)) mnote(mf(root), 0.13, 'triangle', 0.32, musNext);
        if (st % 2 === 0) mnote(mf(root + 24 + ch[1 + ((st / 2) % 3)]), 0.08, 'square', 0.04, musNext);
      }
      musNext += 0.13; musStep++;
    }
  }, 40);
  return {
    resume() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    get muted() { return muted; },
    set muted(v) { muted = v; },
    crowd(level) { if (!ctx || !crowdL) return; const t = ctx.currentTime; crowdL.g.gain.setTargetAtTime(muted ? 0 : 0.03 + level * 0.12, t, 0.3); crowdL.f.frequency.setTargetAtTime(700 + level * 500, t, 0.3); },
    whistle(long) { tone(2900, long ? 0.75 : 0.32, 'sine', 0.13, null, 0, 140); tone(3150, long ? 0.75 : 0.32, 'square', 0.025, null, 0, 140); if (long === 2) { tone(2900, 0.3, 'sine', 0.13, null, 0.45, 140); tone(2900, 0.9, 'sine', 0.13, null, 0.9, 140); } },
    kick(p = 0.5) { noise(0.07, 0.35 + p * 0.4, 'lowpass', 900 + p * 1500, 1); tone(95 + p * 60, 0.09, 'sine', 0.4 + p * 0.3, 55); },
    touch() { noise(0.04, 0.16, 'lowpass', 700); },
    bounce(v = 1) { tone(75, 0.1, 'sine', 0.25 * v, 45); noise(0.05, 0.12 * v, 'lowpass', 500); },
    wall(v = 1) { noise(0.16, 0.35 * v, 'lowpass', 420, 1.4); tone(70, 0.16, 'square', 0.07 * v, 40); },
    post() { [1046, 1318, 1568].forEach((f, i) => tone(f, 0.6 - i * 0.12, 'triangle', 0.16, f * 0.98)); noise(0.1, 0.3, 'bandpass', 3000, 2); },
    net() { noise(0.45, 0.32, 'bandpass', 1800, 0.8, 0, 0.01, 600); },
    tackle() { noise(0.25, 0.35, 'lowpass', 600, 0.8, 0, 0.01); tone(120, 0.15, 'sine', 0.25, 60); },
    skill() { noise(0.18, 0.18, 'bandpass', 2400, 1.4, 0, 0.02, 900); },
    catch() { tone(140, 0.1, 'sine', 0.4, 80); noise(0.08, 0.25, 'lowpass', 900); },
    trip() { tone(300, 0.25, 'triangle', 0.1, 120); noise(0.2, 0.3, 'lowpass', 400); },
    call() { tone(880, 0.07, 'square', 0.06); tone(1175, 0.09, 'square', 0.06, null, 0.08); },
    roar() { noise(3.2, 0.55, 'bandpass', 900, 0.5, 0, 0.12); noise(2.6, 0.3, 'bandpass', 2200, 0.7, 0.1, 0.2); noise(2.2, 0.25, 'lowpass', 300, 0.8, 0.05, 0.1); },
    ooh() { noise(1.1, 0.28, 'bandpass', 520, 3, 0, 0.18, 330); noise(1.0, 0.16, 'bandpass', 900, 2.5, 0.02, 0.2, 560); },
    cheer(v = 1) { noise(1.4, 0.22 * v, 'bandpass', 1100, 0.6, 0, 0.25); noise(1.1, 0.12 * v, 'bandpass', 2500, 0.8, 0.1, 0.2); },
    goalHorn() { [392, 392, 523].forEach((f, i) => tone(f, i === 2 ? 0.9 : 0.2, 'sawtooth', 0.07, null, i * 0.24)); },
    beep(hi) { tone(hi ? 880 : 440, hi ? 0.45 : 0.18, 'square', 0.1); },
    ui() { tone(700, 0.06, 'triangle', 0.14, 950); },
    charge(k) { tone(300 + k * 700, 0.05, 'triangle', 0.05); },
    levelUp() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, 'square', 0.07, null, i * 0.08)); },
    win() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, i === 6 ? 0.5 : 0.14, 'square', 0.07, null, i * 0.12)); },
    lose() { [523, 494, 440, 392].forEach((f, i) => tone(f, 0.2, 'triangle', 0.12, null, i * 0.14)); },
    star() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.14, 'triangle', 0.13, null, i * 0.07)); },
    music(on) { if (!ctx) return; if (on && !musOn) { musOn = true; musNext = ctx.currentTime + 0.05; musStep = 0; } else if (!on) musOn = false; },
  };
})();
SFX.muted = !!SAVE.muted;

// ---------- narrador (voz del navegador en español) ----------
const VOICE = { ok: typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined', v: null, last: 0 };
function pickVoice() {
  if (!VOICE.ok) return;
  const vs = speechSynthesis.getVoices() || [];
  VOICE.v = vs.find((v) => /^es[-_](419|MX|US|CO|AR|CU|VE|CL|PE)/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null;
}
if (VOICE.ok) { pickVoice(); try { speechSynthesis.onvoiceschanged = pickVoice; } catch (e) { /* sin evento */ } }
// prio 0: solo si está callado · 1: normal · 2: corta lo que esté diciendo
function say(lines, prio = 1) {
  if (!VOICE.ok || SAVE.voice === false || SFX.muted) return;
  const now = performance.now();
  try {
    if (prio < 2 && (speechSynthesis.speaking || now - VOICE.last < (prio ? 900 : 2500))) return;
    if (prio >= 2) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(Array.isArray(lines) ? pick(lines) : lines);
    u.lang = VOICE.v ? VOICE.v.lang : 'es-ES';
    if (VOICE.v) u.voice = VOICE.v;
    u.rate = 1.15; u.pitch = 1.05; u.volume = 0.95;
    speechSynthesis.speak(u);
    VOICE.last = now;
  } catch (e) { /* sin voz */ }
}

// =========================================================
//  RENDER Y MUNDO
// =========================================================
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.2, 900);
camera.position.set(0, 30, 40);
// vestuario: escena aparte para personalizar al jugador
const garage = new THREE.Scene();
const garageCam = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
function onResize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  garageCam.aspect = w / h; garageCam.updateProjectionMatrix();
}
addEventListener('resize', onResize);
onResize();

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const hemi = new THREE.HemisphereLight(0xe8f6ff, 0x4f9a3f, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff6e5, 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 160 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);
const SUN_OFF = new THREE.Vector3(22, 52, 30);

// materiales toon
const toonGrad = (() => {
  const d = new Uint8Array([105, 105, 105, 255, 185, 185, 185, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const matCache = new Map();
function toon(color, opts) {
  const key = color + (opts ? JSON.stringify(opts) : '');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: toonGrad }, opts || {})));
  return matCache.get(key);
}
const basicCache = new Map();
function basic(color, opts) {
  const key = color + (opts ? JSON.stringify(opts) : '');
  if (!basicCache.has(key)) basicCache.set(key, new THREE.MeshBasicMaterial(Object.assign({ color }, opts || {})));
  return basicCache.get(key);
}
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1d2340, side: THREE.BackSide });
function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  return m;
}
let OUTLINES = true;
function outline(m, s = 1.08) {
  const o = new THREE.Mesh(m.geometry, outlineMat);
  o.userData.ol = true; o.visible = OUTLINES;
  if (typeof s === 'number') o.scale.setScalar(s); else o.scale.set(s[0], s[1], s[2]);
  m.add(o);
  return m;
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _col = new THREE.Color(), _p3 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const blobGeo = new THREE.IcosahedronGeometry(1, 1);
const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);
function inst(geo, mat, list, shadow = false) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  im.count = list.length;
  list.forEach((it, i) => {
    _m4.compose(_p3.set(it.x, it.y || 0, it.z), _q.setFromEuler(_e.set(it.rx || 0, it.ry || 0, it.rz || 0)), _s3.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1));
    im.setMatrixAt(i, _m4);
    if (it.c !== undefined) im.setColorAt(i, _col.set(it.c));
  });
  im.castShadow = shadow;
  return im;
}
const speckle = (g, w, h, n, cols, sz = 2) => { for (let i = 0; i < n; i++) { g.fillStyle = pick(cols); g.fillRect(Math.random() * w, Math.random() * h, sz, sz); } };
const radialTex = canvasTex(64, 64, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const BLOB_MAT = new THREE.MeshBasicMaterial({ color: 0x1d2340, transparent: true, opacity: 0.3, depthWrite: false });

// cielo: esfera con degradado (no le afecta la niebla)
const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 14), skyMat);
sky.renderOrder = -1;
scene.add(sky);
function setSky(cols) {
  if (skyMat.map) skyMat.map.dispose();
  skyMat.map = canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, cols[0]); gr.addColorStop(0.32, cols[1]); gr.addColorStop(0.5, cols[2]); gr.addColorStop(1, cols[2]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  skyMat.needsUpdate = true;
}
const STARS = (() => {
  const n = 500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), e = rand(0.08, 1.4), r = 560;
    pos[i * 3] = Math.cos(a) * Math.cos(e) * r; pos[i * 3 + 1] = Math.sin(e) * r; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
  p.visible = false;
  scene.add(p);
  return p;
})();

// ---------- partículas (instancias que se encogen y desaparecen) ----------
let PART_SCALE = 1;
class Pool {
  constructor(n, mat, geo = BOX_GEO) {
    this.n = n; this.k = 0;
    this.im = new THREE.InstancedMesh(geo, mat, n);
    this.im.frustumCulled = false;
    this.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.items = [];
    _m4.makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) { this.items.push({ life: 0 }); this.im.setMatrixAt(i, _m4); this.im.setColorAt(i, _col.set(0xffffff)); }
    scene.add(this.im);
  }
  spawn(x, y, z, vx, vy, vz, life, size, color, o = {}) {
    const i = this.k; this.k = (this.k + 1) % this.n;
    const it = this.items[i];
    it.x = x; it.y = y; it.z = z; it.vx = vx; it.vy = vy; it.vz = vz; it.life = it.max = life; it.size = size;
    it.grav = o.grav ?? 0; it.drag = o.drag ?? 0; it.grow = o.grow ?? 0; it.spin = o.spin ?? 0; it.r = rand(0, 6); it.floor = o.floor ?? -99;
    this.im.setColorAt(i, _col.set(color));
    this.im.instanceColor.needsUpdate = true;
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      const it = this.items[i];
      if (it.life <= 0) { if (it.dead === false) { it.dead = true; _m4.makeScale(0, 0, 0); this.im.setMatrixAt(i, _m4); any = true; } continue; }
      it.dead = false;
      it.life -= dt;
      it.vy -= it.grav * dt;
      const dr = Math.exp(-it.drag * dt);
      it.vx *= dr; it.vy *= dr; it.vz *= dr;
      it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
      if (it.y < it.floor) { it.y = it.floor; it.vy *= -0.4; it.vx *= 0.7; it.vz *= 0.7; }
      it.r += it.spin * dt;
      const k = clamp(it.life / it.max, 0, 1);
      const s = it.size * (it.grow ? 1 + (1 - k) * it.grow : 1) * (it.grow ? Math.min(1, k * 2.2) : k);
      _m4.compose(_p3.set(it.x, it.y, it.z), _q.setFromEuler(_e.set(it.r, it.r * 0.7, 0)), _s3.set(s, s, s));
      this.im.setMatrixAt(i, _m4);
      any = true;
    }
    if (any) this.im.instanceMatrix.needsUpdate = true;
  }
}
const SPARKS = new Pool(500, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
const SMOKE = new Pool(380, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }), blobGeo);
const CONF = new Pool(320, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), new THREE.PlaneGeometry(1, 0.6));
function confetti(x, y, z, n = 120, spread = 6) {
  const cols = ['#ff4f4f', '#ffc93a', '#2fd27a', '#3a7bff', '#ff4f9a', '#7a4cff', '#ffffff'];
  for (let i = 0; i < n * PART_SCALE; i++) CONF.spawn(x + rand(-spread, spread), y + rand(0, 3), z + rand(-spread, spread), rand(-3, 3), rand(5, 13), rand(-3, 3), rand(2, 3.6), rand(0.22, 0.34), pick(cols), { grav: 7, drag: 1.4, spin: rand(4, 9) });
}
function sparkBurst(x, y, z, n, color, sp = 6) {
  for (let i = 0; i < n * PART_SCALE; i++) SPARKS.spawn(x, y, z, rand(-sp, sp), rand(1, sp), rand(-sp, sp), rand(0.25, 0.55), rand(0.08, 0.16), color, { grav: 14, drag: 2 });
}
function dustBurst(x, y, z, n, color, sp = 3) {
  for (let i = 0; i < n * PART_SCALE; i++) SMOKE.spawn(x + rand(-1, 1), y + 0.3, z + rand(-1, 1), rand(-sp, sp), rand(0.5, 2), rand(-sp, sp), rand(0.6, 1.1), rand(0.5, 0.9), color, { drag: 2.5, grow: 1.4 });
}


// =========================================================
//  ESTADIOS: cancha, paredes, porterías, gradas y paisaje
//  La cancha va a lo largo del eje x. El equipo 0 defiende la
//  portería de x = -HL y ataca hacia +x; el equipo 1 al revés.
// =========================================================
let F = null;
function setField(size) {
  const s = SIZES[size] || SIZES[3];
  F = { size, L: s.L, W: s.W, HL: s.L / 2, HW: s.W / 2, BOXD: size <= 1 ? 5 : 6.2, BOXW: size <= 1 ? 5.4 : 6.6 };
  return F;
}
setField(SAVE.size);
const VENUES = {
  estadio: { name: 'Estadio Central', emoji: '🏟️', col: '#2fd27a', desc: 'Pasto de día, grada llena', sky: ['#3f9dff', '#9fd4ff', '#e6f6ff'], fog: 0xcfeaff, grass: ['#4cb84a', '#45ab44'], line: '#ffffff', out: '#3d8f3b', hemi: [0xe8f6ff, 0x4f9a3f, 1.15], sun: [0xfff6e5, 1.7], fric: 1, bounce: 0.56, slip: 1 },
  playa: { name: 'Playa Sol', emoji: '🏖️', col: '#ffc93a', desc: 'Arena al atardecer: el balón frena más', sky: ['#ff8a5a', '#ffc98a', '#ffe8c4'], fog: 0xffdcb8, grass: ['#f2d38b', '#ebcb84'], line: '#ffffff', out: '#f0cf86', hemi: [0xfff0dd, 0xc99a5a, 1.2], sun: [0xffd9a8, 1.6], fric: 1.7, bounce: 0.42, slip: 0.95, sand: true },
  neon: { name: 'Arena Neón', emoji: '🌃', col: '#7a4cff', desc: 'De noche en la ciudad', sky: ['#05061a', '#1a1450', '#3a2a7a'], fog: 0x1c1844, grass: ['#2f4a7a', '#2a4370'], line: '#5ff3ff', out: '#1a2240', hemi: [0x9ab4ff, 0x30285a, 1.25], sun: [0xdfe8ff, 1.25], fric: 0.85, bounce: 0.6, slip: 1, night: true },
  nieve: { name: 'Valle Nevado', emoji: '❄️', col: '#25b8ff', desc: 'Nieve: los jugadores resbalan', sky: ['#7fb0e8', '#c8dcf4', '#eef4ff'], fog: 0xe4eef9, grass: ['#f4f8ff', '#e6eefb'], line: '#3a7bff', out: '#eef3fa', hemi: [0xf0f6ff, 0x9fb4d0, 1.2], sun: [0xffffff, 1.5], fric: 1.1, bounce: 0.5, slip: 0.72, snow: true },
};
const venueOf = (id) => VENUES[id] || VENUES.estadio;
const WORLD = { g: null, id: '', size: 0, fans: null, nets: [], snow: null, jumbo: null, glow: [], excite: 0, flags: [] };
const FAN_COLS = ['#ff4f9a', '#2fd27a', '#ffd23a', '#ffffff', '#3a7bff', '#ff7a2f', '#a24bff', '#18b6a5'];

// perímetro de la arena (con las esquinas recortadas); los huecos son las bocas de gol
function perimeter() {
  const { HL, HW } = F, g = GW / 2;
  return [
    [[-HL + CR, -HW], [HL - CR, -HW]], [[HL - CR, -HW], [HL, -HW + CR]], [[HL, -HW + CR], [HL, -g]],
    [[HL, g], [HL, HW - CR]], [[HL, HW - CR], [HL - CR, HW]], [[HL - CR, HW], [-HL + CR, HW]],
    [[-HL + CR, HW], [-HL, HW - CR]], [[-HL, HW - CR], [-HL, g]], [[-HL, -g], [-HL, -HW + CR]], [[-HL, -HW + CR], [-HL + CR, -HW]],
  ];
}
function fieldTex(V) {
  const { L, W, HL, HW, BOXD, BOXW } = F;
  const ppm = Math.min(30, 1500 / L), pad = 2;
  const w = Math.round((L + pad * 2) * ppm), h = Math.round((W + pad * 2) * ppm);
  return canvasTex(w, h, (g) => {
    const X = (x) => (x + HL + pad) * ppm, Z = (z) => (z + HW + pad) * ppm;
    g.fillStyle = V.out; g.fillRect(0, 0, w, h);
    const n = Math.round(L / 3);
    for (let i = 0; i < n; i++) { g.fillStyle = V.grass[i % 2]; g.fillRect(X(-HL + (L / n) * i), Z(-HW), (L / n) * ppm + 1, W * ppm); }
    if (V.sand || V.snow) speckle(g, w, h, 5000, V.sand ? ['#e4c278', '#f7dc9c', '#d9b56c'] : ['#ffffff', '#dfe9f7', '#d4e2f4'], 2);
    else speckle(g, w, h, 2500, ['rgba(0,0,0,.05)', 'rgba(255,255,255,.05)'], 2);
    g.strokeStyle = V.line; g.lineWidth = Math.max(2, ppm * 0.12); g.lineJoin = 'round';
    if (V.night) { g.shadowColor = V.line; g.shadowBlur = ppm * 0.5; }
    const P = perimeter();
    g.beginPath();
    g.moveTo(X(P[0][0][0]), Z(P[0][0][1]));
    for (const [, b] of P) g.lineTo(X(b[0]), Z(b[1]));
    g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(X(0), Z(-HW)); g.lineTo(X(0), Z(HW)); g.stroke();
    g.beginPath(); g.arc(X(0), Z(0), 3.6 * ppm, 0, Math.PI * 2); g.stroke();
    g.fillStyle = V.line;
    g.beginPath(); g.arc(X(0), Z(0), 0.22 * ppm, 0, Math.PI * 2); g.fill();
    for (const s of [-1, 1]) {
      const x0 = s * HL;
      g.strokeRect(Math.min(X(x0), X(x0 - s * BOXD)), Z(-BOXW), BOXD * ppm, BOXW * 2 * ppm);
      g.strokeRect(Math.min(X(x0), X(x0 - s * 2.2)), Z(-GW / 2 - 1.2), 2.2 * ppm, (GW + 2.4) * ppm);
      g.beginPath(); g.arc(X(x0 - s * (BOXD - 1.6)), Z(0), 0.18 * ppm, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(X(x0 - s * (BOXD - 1.6)), Z(0), 2.6 * ppm, s > 0 ? Math.PI * 0.62 : -Math.PI * 0.38, s > 0 ? Math.PI * 1.38 : Math.PI * 0.38); g.stroke();
    }
    g.shadowBlur = 0;
    // logo en el centro
    g.globalAlpha = 0.16; g.fillStyle = '#ffffff'; g.font = `700 ${Math.round(ppm * 1.4)}px Fredoka, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('GOLAZO PARK', X(0), Z(-HW + 2.2)); g.fillText('GOLAZO PARK', X(0), Z(HW - 2.2));
    g.globalAlpha = 1;
  });
}
const NET_TEX = canvasTex(128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 3;
  for (let i = 0; i <= 8; i++) { const p = (i / 8) * w; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
});
NET_TEX.wrapS = NET_TEX.wrapT = THREE.RepeatWrapping;
function boardTex(V, i) {
  const ads = ['GOLAZO PARK', '¡A JUGAR!', 'BALÓN DE ORO', 'REMATE PARK', 'JONRÓN PARK', 'DERRAPE PARK', '⚽ 3 CONTRA 3'];
  const cols = V.night ? ['#14143a', '#2a1060', '#0d2a40'] : ['#3a7bff', '#ff4f4f', '#ffc93a', '#2fd27a', '#ff4f9a', '#7e57c2'];
  return canvasTex(512, 64, (g, w, h) => {
    const c = cols[i % cols.length];
    g.fillStyle = c; g.fillRect(0, 0, w, h);
    g.fillStyle = V.night ? pick(['#5ff3ff', '#ff5fd2', '#ffe14d']) : c === '#ffc93a' ? '#1d2340' : '#ffffff';
    if (V.night) { g.shadowColor = g.fillStyle; g.shadowBlur = 12; }
    g.font = '700 38px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ads[i % ads.length], w / 2, h / 2 + 2);
  });
}
// gradas escalonadas detrás de una pared, con público (cajitas que saltan)
function standsAlong(steps, fans, p1, p2, n, tiers, cols, fanP = 0.85, base = 0) {
  const dx = p2[0] - p1[0], dz = p2[1] - p1[1], len = hyp(dx, dz), ry = Math.atan2(-dz, dx);
  const ux = dx / len, uz = dz / len;
  for (let k = 0; k < tiers; k++) {
    const off = 1.6 + k * 1.15, hh = base + 0.4 + (k + 1) * 0.68;
    steps.push({ x: (p1[0] + p2[0]) / 2 + n[0] * off, y: hh / 2, z: (p1[1] + p2[1]) / 2 + n[1] * off, sx: len, sy: hh, sz: 1.15, ry, c: cols[k % cols.length] });
    const cnt = Math.floor(len / 0.8);
    for (let i = 0; i < cnt; i++) {
      if (Math.random() > fanP) continue;
      const s = 0.4 + i * 0.8;
      fans.push({ x: p1[0] + ux * s + n[0] * off, y: hh + 0.36, z: p1[1] + uz * s + n[1] * off, sx: 0.44, sy: 0.7, sz: 0.4, ry, c: pick(FAN_COLS), base: hh + 0.36, ph: rand(0, 6), amp: rand(0.6, 1.2) });
    }
  }
}
function buildGoal(g, s, V) {
  const x0 = s * F.HL, gw = GW / 2, post = toon('#ffffff'), back = x0 + s * GD;
  const cyl = new THREE.CylinderGeometry(0.09, 0.09, 1, 10);
  for (const z of [-gw, gw]) { const p = outline(mesh(cyl, post), 1.25); p.scale.y = GH; p.position.set(x0, GH / 2, z); g.add(p); }
  const bar = outline(mesh(cyl, post), 1.25); bar.scale.y = GW + 0.18; bar.rotation.x = Math.PI / 2; bar.position.set(x0, GH, 0); g.add(bar);
  const thin = new THREE.CylinderGeometry(0.04, 0.04, 1, 6), dark = toon('#d7dbe4');
  for (const z of [-gw, gw]) {
    const a = mesh(thin, dark, false); a.scale.y = GD; a.rotation.z = Math.PI / 2; a.position.set((x0 + back) / 2, GH, z); g.add(a);
    const b = mesh(thin, dark, false); b.scale.y = GH; b.position.set(back, GH / 2, z); g.add(b);
  }
  const top = mesh(thin, dark, false); top.scale.y = GW; top.rotation.x = Math.PI / 2; top.position.set(back, GH, 0); g.add(top);
  const nm = new THREE.MeshBasicMaterial({ map: NET_TEX, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.85 });
  const net = new THREE.Group(); g.add(net);
  const bk = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH, 6, 4), nm.clone()); bk.material.map = NET_TEX.clone(); bk.material.map.repeat.set(GW / 0.4, GH / 0.4); bk.material.map.needsUpdate = true;
  bk.rotation.y = Math.PI / 2; bk.position.set(back, GH / 2, 0); net.add(bk);
  for (const z of [-gw, gw]) {
    const sd = new THREE.Mesh(new THREE.PlaneGeometry(GD, GH), nm.clone()); sd.material.map = NET_TEX.clone(); sd.material.map.repeat.set(GD / 0.4, GH / 0.4); sd.material.map.needsUpdate = true;
    sd.position.set((x0 + back) / 2, GH / 2, z); net.add(sd);
  }
  const rf = new THREE.Mesh(new THREE.PlaneGeometry(GD, GW), nm.clone()); rf.material.map = NET_TEX.clone(); rf.material.map.repeat.set(GD / 0.4, GW / 0.4); rf.material.map.needsUpdate = true;
  rf.rotation.x = Math.PI / 2; rf.position.set((x0 + back) / 2, GH, 0); net.add(rf);
  // fondo oscuro para que el arco se lea bien desde lejos
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(GD, GW), basic('#1d2340', { transparent: true, opacity: 0.18, depthWrite: false })); shade.rotation.x = -Math.PI / 2; shade.position.set((x0 + back) / 2, 0.02, 0); g.add(shade);
  WORLD.nets.push({ s, back: bk, x: back, shake: 0, z: 0, y: 0 });
}
function buildWorld(id, size) {
  setField(size);
  if (WORLD.g && WORLD.id === id && WORLD.size === size) return;
  if (WORLD.g) {
    scene.remove(WORLD.g);
    WORLD.g.traverse((o) => {
      if (o.geometry && o.geometry !== BOX_GEO) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) if (m.map && m.map.isTexture && m.map !== NET_TEX && m.map !== radialTex) m.map.dispose();
    });
  }
  const V = venueOf(id), g = new THREE.Group();
  WORLD.g = g; WORLD.id = id; WORLD.size = size; WORLD.nets = []; WORLD.glow = []; WORLD.flags = [];
  scene.add(g);
  setSky(V.sky);
  scene.fog = new THREE.Fog(V.fog, 60, 260);
  hemi.color.set(V.hemi[0]); hemi.groundColor.set(V.hemi[1]); hemi.intensity = V.hemi[2];
  sun.color.set(V.sun[0]); sun.intensity = V.sun[1];
  STARS.visible = !!V.night;
  const { L, W, HL, HW } = F;
  // suelo exterior y cancha
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), toon(V.night ? '#141a33' : V.sand ? '#f3d58f' : V.snow ? '#f4f8ff' : '#5aa94f'));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; outer.receiveShadow = true; g.add(outer);
  const ft = new THREE.Mesh(new THREE.PlaneGeometry(L + 4, W + 4), new THREE.MeshLambertMaterial({ map: fieldTex(V) }));
  ft.rotation.x = -Math.PI / 2; ft.receiveShadow = true; g.add(ft);
  // vallas con publicidad, cristal encima y barandal
  const glass = new THREE.MeshBasicMaterial({ color: V.night ? 0x7fdcff : 0xd8f1ff, transparent: true, opacity: V.night ? 0.07 : 0.1, depthWrite: false, side: THREE.DoubleSide });
  const rail = toon(V.night ? '#5ff3ff' : '#e9edf7', V.night ? { emissive: 0x2a8fa0 } : undefined);
  perimeter().forEach(([a, b], i) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = hyp(dx, dz), ry = Math.atan2(-dz, dx);
    const nx = dz / len, nz = -dx / len; // normal hacia afuera
    const cx = (a[0] + b[0]) / 2 + nx * 0.14, cz = (a[1] + b[1]) / 2 + nz * 0.14;
    const bm = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, WALL_H, 0.26), [toon('#ffffff'), toon('#ffffff'), toon('#e9edf7'), toon('#e9edf7'), new THREE.MeshBasicMaterial({ map: boardTex(V, i) }), new THREE.MeshBasicMaterial({ map: boardTex(V, i) })]);
    bm.position.set(cx, WALL_H / 2, cz); bm.rotation.y = ry; bm.castShadow = true; bm.receiveShadow = true; g.add(bm);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.3), glass); gl.position.set(cx, WALL_H + 1.15, cz); gl.rotation.y = ry; g.add(gl);
    const rl = mesh(BOX_GEO, rail, false); rl.scale.set(len + 0.1, 0.08, 0.1); rl.position.set(cx, WALL_H + 2.3, cz); rl.rotation.y = ry; g.add(rl);
    if (V.night) WORLD.glow.push(rl);
  });
  // cristal sobre las porterías (encima del travesaño)
  for (const s of [-1, 1]) {
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(GW, WALL_H + 2.3 - GH), glass); gl.position.set(s * (HL + 0.14), GH + (WALL_H + 2.3 - GH) / 2, 0); gl.rotation.y = Math.PI / 2; g.add(gl);
    buildGoal(g, s, V);
  }
  // gradas en los cuatro lados
  const steps = [], fans = [];
  const tierCols = V.night ? ['#2b2f55', '#363a66'] : V.snow ? ['#cfd9ea', '#dfe7f4'] : ['#c3c9da', '#d7dbe4'];
  const tiers = V.sand ? 3 : 5;
  standsAlong(steps, fans, [-HL + 1, -HW], [HL - 1, -HW], [0, -1], tiers, tierCols);
  if (!V.sand) standsAlong(steps, fans, [HL - 1, HW], [-HL + 1, HW], [0, 1], tiers, tierCols);
  for (const s of [-1, 1]) standsAlong(steps, fans, [s * (HL + GD), s > 0 ? -HW + 1 : HW - 1], [s * (HL + GD), s > 0 ? HW - 1 : -HW + 1], [s, 0], 3, tierCols, 0.75);
  { const m = inst(BOX_GEO, new THREE.MeshLambertMaterial({ color: 0xffffff }), steps); m.receiveShadow = true; g.add(m); }
  const fm = inst(BOX_GEO, new THREE.MeshLambertMaterial({ color: 0xffffff }), fans);
  fm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fm.frustumCulled = false; g.add(fm);
  WORLD.fans = { mesh: fm, list: fans };
  // torres de luz en las esquinas
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (HL + 4), z = sz * (HW + 6.5);
    const pole = outline(mesh(new THREE.CylinderGeometry(0.22, 0.32, 16, 8), toon('#8a93b5'))); pole.position.set(x, 8, z); g.add(pole);
    const head = outline(mesh(BOX_GEO, toon('#2b2f45'))); head.scale.set(3, 1.6, 0.5); head.position.set(x, 16.4, z); head.lookAt(0, 0, 0); g.add(head);
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.2), basic(V.night ? '#fff8d0' : '#fffbe8')); lamp.position.copy(head.position); lamp.lookAt(0, 0, 0); lamp.translateZ(0.3); g.add(lamp);
    if (V.night) { const halo = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: radialTex, color: 0xfff1c0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); halo.position.copy(lamp.position); halo.lookAt(0, 0, 0); g.add(halo); }
  }
  // pantalla gigante con el marcador
  {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.8), new THREE.MeshBasicMaterial({ map: t }));
    const frame = outline(mesh(BOX_GEO, toon('#2b2f45'))); frame.scale.set(9.6, 3.4, 0.4);
    const grp = new THREE.Group(); grp.add(frame); scr.position.z = 0.22; grp.add(scr);
    grp.position.set(0, 9.5, -(HW + 9)); g.add(grp);
    const legs = outline(mesh(new THREE.CylinderGeometry(0.2, 0.2, 8, 8), toon('#8a93b5'))); legs.position.set(0, 4, -(HW + 9.2)); g.add(legs);
    WORLD.jumbo = { c, t };
  }
  // paisaje según el estadio
  if (V.sand) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 160), toon('#3ab4e8')); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.01, HW + 90); g.add(sea);
    for (let i = 0; i < 14; i++) palm(g, rand(-HL - 10, HL + 10), HW + rand(4, 16));
    for (let i = 0; i < 8; i++) palm(g, rand(-HL - 20, HL + 20), -HW - rand(18, 30));
  } else if (V.snow) {
    for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2, r = rand(70, 110); mountain(g, Math.cos(a) * r, Math.sin(a) * r, rand(14, 30)); }
    for (let i = 0; i < 30; i++) { const a = rand(0, Math.PI * 2), r = rand(HL + 14, HL + 40); pine(g, Math.cos(a) * r, Math.sin(a) * r * 0.8); }
  } else if (V.night) {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2, r = rand(75, 120), hgt = rand(14, 46);
      const b = mesh(BOX_GEO, toon(pick(['#1b1f45', '#241a52', '#14284a'])), false); b.scale.set(rand(8, 16), hgt, rand(8, 16)); b.position.set(Math.cos(a) * r, hgt / 2, Math.sin(a) * r); g.add(b);
      for (let k = 0; k < 6; k++) { const wdw = new THREE.Mesh(BOX_GEO, basic(pick(['#ffe14d', '#5ff3ff', '#ff5fd2', '#fff2b0']))); wdw.scale.set(1.2, 0.8, 0.2); wdw.position.set(Math.cos(a) * (r - b.scale.x / 2 - 0.2), rand(3, hgt - 2), Math.sin(a) * (r - b.scale.z / 2 - 0.2)); wdw.lookAt(0, wdw.position.y, 0); g.add(wdw); }
    }
  } else {
    for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2, r = rand(80, 120); const h = outline(mesh(new THREE.SphereGeometry(1, 14, 10), toon(pick(['#5fbf4f', '#4caf3f', '#6cc24a']))), 1.02); h.scale.set(rand(18, 30), rand(8, 16), rand(18, 30)); h.position.set(Math.cos(a) * r, -2, Math.sin(a) * r); g.add(h); }
    for (let i = 0; i < 9; i++) { const c = outline(mesh(new THREE.SphereGeometry(1, 12, 8), toon('#ffffff', { emissive: 0x9fb8cc }), false)); c.scale.set(rand(8, 14), rand(2, 3.5), rand(4, 7)); c.position.set(rand(-160, 160), rand(45, 70), rand(-160, 160)); g.add(c); }
    // banderines en las gradas
    for (let i = 0; i < 8; i++) { const fl = mesh(new THREE.PlaneGeometry(1.4, 0.9), toon(pick(FAN_COLS), { side: THREE.DoubleSide }), false); fl.position.set(-HL + 3 + (i * (L - 6)) / 7, 7.5, -HW - 7.5); g.add(fl); WORLD.flags.push(fl); }
  }
  WORLD.snow = null;
  if (V.snow) {
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = rand(-HL - 15, HL + 15); pos[i * 3 + 1] = rand(0, 25); pos[i * 3 + 2] = rand(-HW - 15, HW + 15); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    WORLD.snow = new THREE.Points(gg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.14, transparent: true, opacity: 0.9 }));
    g.add(WORLD.snow);
  }
  sun.target.position.set(0, 0, 0); sun.position.copy(SUN_OFF);
  drawJumbo();
}
function palm(g, x, z) {
  const h = rand(5, 8);
  const tr = outline(mesh(new THREE.CylinderGeometry(0.18, 0.3, h, 7), toon('#a9744a'))); tr.position.set(x, h / 2, z); tr.rotation.z = rand(-0.15, 0.15); g.add(tr);
  for (let i = 0; i < 6; i++) { const lf = outline(mesh(BOX_GEO, toon(pick(['#3f9e3a', '#4caf3f']))), 1.04); lf.scale.set(3, 0.1, 0.8); const a = (i / 6) * Math.PI * 2; lf.position.set(x + Math.cos(a) * 1.3, h + 0.1, z + Math.sin(a) * 1.3); lf.rotation.set(0, -a, -0.35); g.add(lf); }
}
function pine(g, x, z) {
  const s = rand(0.8, 1.5);
  const tr = mesh(new THREE.CylinderGeometry(0.2 * s, 0.25 * s, 1.4 * s, 6), toon('#7a5236')); tr.position.set(x, 0.7 * s, z); g.add(tr);
  for (let k = 0; k < 3; k++) { const c = outline(mesh(new THREE.ConeGeometry((1.6 - k * 0.4) * s, 1.8 * s, 8), toon(k === 2 ? '#ffffff' : '#2f7d4f')), 1.04); c.position.set(x, (1.6 + k * 1.1) * s, z); g.add(c); }
}
function mountain(g, x, z, h) {
  const m = outline(mesh(new THREE.ConeGeometry(h * 0.9, h, 7), toon('#9fb4d0')), 1.01); m.position.set(x, h / 2 - 1, z); g.add(m);
  const cap = mesh(new THREE.ConeGeometry(h * 0.36, h * 0.4, 7), toon('#ffffff'), false); cap.position.set(x, h - 1 - h * 0.2 + 0.01, z); g.add(cap);
}
function drawJumbo() {
  if (!WORLD.jumbo) return;
  const { c, t } = WORLD.jumbo, g = c.getContext('2d');
  g.fillStyle = '#10142c'; g.fillRect(0, 0, c.width, c.height);
  const sc = M && M.score ? M.score : [0, 0], k = M && M.kits ? M.kits : kitsFor(SAVE.club, SAVE.rival);
  g.font = '700 88px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = k[0].shirt; g.fillRect(28, 40, 70, 70); g.fillStyle = k[1].shirt; g.fillRect(c.width - 98, 40, 70, 70);
  g.fillStyle = '#ffffff'; g.fillText(sc[0] + ' - ' + sc[1], c.width / 2, 86);
  t.needsUpdate = true;
}
// cada cuadro: público que salta, redes que se mueven, nieve, neón
const _fm = new THREE.Matrix4(), _fq = new THREE.Quaternion(), _fe = new THREE.Euler(), _fp = new THREE.Vector3(), _fs = new THREE.Vector3();
let fanFrame = 0;
function updateWorld(dt, t) {
  WORLD.excite = Math.max(0, WORLD.excite - dt * 0.25);
  const fans = WORLD.fans;
  if (fans && (++fanFrame % (QL === 'baja' ? 3 : 1) === 0)) {
    const ex = WORLD.excite, amp = 0.05 + ex * 0.45, sp = 4 + ex * 6;
    fans.list.forEach((f, i) => {
      const y = f.base + Math.max(0, Math.sin(t * sp * f.amp + f.ph)) * amp * f.amp;
      _fm.compose(_fp.set(f.x, y, f.z), _fq.setFromEuler(_fe.set(0, f.ry, 0)), _fs.set(f.sx, f.sy, f.sz));
      fans.mesh.setMatrixAt(i, _fm);
    });
    fans.mesh.instanceMatrix.needsUpdate = true;
  }
  for (const n of WORLD.nets) {
    n.shake = Math.max(0, n.shake - dt * 1.6);
    const k = Math.sin(n.shake * 18) * n.shake * 0.5;
    n.back.position.x = n.x + n.s * Math.max(0, n.shake * 0.9 + k * 0.3);
    n.back.scale.set(1, 1 + n.shake * 0.05, 1);
  }
  for (const f of WORLD.flags) f.rotation.y = Math.sin(t * 3 + f.position.x) * 0.5;
  if (WORLD.snow) {
    const p = WORLD.snow.geometry.attributes.position, a = p.array;
    for (let i = 0; i < a.length; i += 3) { a[i + 1] -= dt * 1.6; a[i] += Math.sin(t + i) * dt * 0.3; if (a[i + 1] < 0) a[i + 1] = 25; }
    p.needsUpdate = true;
  }
  if (WORLD.glow.length) { const c = 0.5 + Math.sin(t * 2) * 0.2; for (const r of WORLD.glow) r.material.emissive.setRGB(0.1 * c, 0.6 * c, 0.7 * c); }
}

// =========================================================
//  PERSONAJES (chibi cartoon, hechos con primitivas)
// =========================================================
const GEO = {
  head: new THREE.SphereGeometry(0.4, 24, 18),
  cap: new THREE.SphereGeometry(0.425, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.46),
  bowl: new THREE.SphereGeometry(0.435, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
  ball: new THREE.SphereGeometry(1, 14, 10),
  cone: new THREE.ConeGeometry(0.11, 0.34, 7),
  torso: new THREE.CapsuleGeometry(0.25, 0.2, 6, 14),
  shorts: new THREE.CylinderGeometry(0.255, 0.275, 0.2, 14),
  limb: new THREE.CylinderGeometry(0.062, 0.058, 1, 8),
  sleeve: new THREE.CylinderGeometry(0.09, 0.08, 0.16, 10),
  sock: new THREE.CylinderGeometry(0.074, 0.068, 0.2, 8),
  torus: new THREE.TorusGeometry(0.4, 0.045, 8, 28),
  footRing: new THREE.RingGeometry(0.42, 0.52, 28),
  band: new THREE.CylinderGeometry(0.078, 0.078, 0.07, 10),
  chain: new THREE.TorusGeometry(0.2, 0.022, 6, 20),
  collar: new THREE.TorusGeometry(0.15, 0.035, 6, 18),
  box: BOX_GEO,
};
const BLACK = '#1d2340';
let DUST = 0xcfe8b0;
function puff(x, y, z, n = 8, color = 0xffffff, size = 0.5, spread = 2.2, up = 1.2) {
  n = Math.max(1, Math.round(n * PART_SCALE));
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(0.4, 1) * spread;
    SMOKE.spawn(x, y + 0.1, z, Math.cos(a) * sp, rand(0.3, 1) * up, Math.sin(a) * sp, rand(0.3, 0.5), size * rand(0.18, 0.32), color, { drag: 3, grow: 0.8 });
  }
}
const lum = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; };
// número de la espalda
const NUM_TEX = new Map();
function numTex(n, ink) {
  const key = n + ink;
  if (!NUM_TEX.has(key)) NUM_TEX.set(key, canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.font = '700 50px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = ink; g.fillText(String(n), w / 2, h / 2 + 3);
  }));
  return NUM_TEX.get(key);
}

function buildHair(head, look) {
  const hm = toon(look.hairColor);
  const add = (geo, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0, ol = true) => {
    const m = mesh(geo, hm);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz);
    if (ol) outline(m, 1.07);
    head.add(m);
    return m;
  };
  const style = look.hair;
  if (style === 'bald') return;
  if (style === 'mohawk') {
    for (let i = 0; i < 5; i++) add(GEO.box, 0, 0.36 - Math.max(0, i - 2) * 0.1, 0.18 - i * 0.12, 0.08, 0.18, 0.13, -0.2 - i * 0.28);
    return;
  }
  add(GEO.cap, 0, 0.02, -0.03, 1, 1, 1, -0.32);
  if (style === 'spiky') {
    for (const [x, y, z, rx, rz] of [[0, 0.42, 0.05, 0, 0], [0.18, 0.36, 0.06, 0.1, -0.5], [-0.18, 0.36, 0.06, 0.1, 0.5], [0, 0.34, -0.22, -0.7, 0], [0.24, 0.24, -0.16, -0.4, -0.9], [-0.24, 0.24, -0.16, -0.4, 0.9]])
      add(GEO.cone, x, y, z, 1, 1, 1, rx, 0, rz);
  } else if (style === 'buns') {
    add(GEO.ball, 0, 0.42, -0.12, 0.17, 0.17, 0.17);
  } else if (style === 'curly') {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, r = i % 2 ? 0.3 : 0.36;
      add(GEO.ball, Math.cos(a) * r, 0.2 + (i % 2) * 0.12, Math.sin(a) * r - 0.04, 0.13, 0.13, 0.13, 0, 0, 0, false);
    }
  } else if (style === 'afro') {
    add(GEO.ball, 0, 0.2, -0.06, 0.56, 0.5, 0.55);
  } else if (style === 'long') {
    add(GEO.ball, 0, -0.08, -0.2, 0.4, 0.42, 0.26);
  }
}

function buildAcc(c, look) {
  const h = look.acc, head = c.head;
  if (h === 'shades') {
    for (const s of [-1, 1]) { const g = mesh(GEO.box, toon(BLACK)); g.scale.set(0.2, 0.12, 0.04); g.position.set(s * 0.15, 0.05, 0.38); head.add(g); }
    const br = mesh(GEO.box, toon(BLACK)); br.scale.set(0.12, 0.03, 0.03); br.position.set(0, 0.08, 0.39); head.add(br);
  } else if (h === 'mustache') {
    const m = mesh(GEO.box, toon(look.hair === 'bald' ? '#3b2a20' : look.hairColor), false); m.scale.set(0.18, 0.04, 0.03); m.position.set(0, -0.1, 0.39); head.add(m);
  } else if (h === 'band') {
    const b = mesh(GEO.torus, toon('#ffffff'), false); b.rotation.x = Math.PI / 2 + 0.28; b.position.set(0, 0.2, -0.02); b.scale.set(0.93, 0.93, 1.6); head.add(b);
  } else if (h === 'wrist') {
    for (const el of c.elbows) { const b = mesh(GEO.band, toon('#ffffff'), false); b.position.y = -ARM + 0.08; el.add(b); }
  } else if (h === 'chain') {
    const ch = mesh(GEO.chain, toon('#ffcf3a'), false); ch.rotation.x = Math.PI / 2 - 0.35; ch.position.set(0, 0.6, 0.08); c.torso.add(ch);
  } else if (h === 'crown') {
    const cr = outline(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12, 1, true), toon('#ffcf3a', { side: THREE.DoubleSide })));
    cr.position.y = 0.5; head.add(cr);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const k = mesh(GEO.cone, toon('#ffcf3a')); k.scale.set(0.5, 0.4, 0.5); k.position.set(Math.cos(a) * 0.18, 0.61, Math.sin(a) * 0.18); head.add(k); }
  }
}

// Esqueleto: root → rig → pelvis → torso (brazos con codo, cabeza) + piernas con rodilla
const THIGH = 0.27, SHIN = 0.28;
const ARM = 0.26;
const legH = (h, k) => THIGH * Math.cos(h) + SHIN * Math.cos(h + k);
const BLOB_GEO = new THREE.CircleGeometry(0.45, 18);
const _lookV = new THREE.Vector3(), _ckV = new THREE.Vector3(), _ckA = new THREE.Vector3(), _yUp = new THREE.Vector3(0, 1, 0);
const _ik = { sx: 0, rz: 0, el: 0 };
// IK de dos huesos (brazo + antebrazo) en el marco del torso; hombro en (s·0,31, 0,5, 0)
function solveArm(px, py, pz, s, out) {
  let ux = px - s * 0.31, uy = py - 0.5, uz = pz;
  const d0 = Math.hypot(ux, uy, uz);
  if (d0 < 1e-4) return false;
  ux /= d0; uy /= d0; uz /= d0;
  const d = clamp(d0, 0.12, 2 * ARM * 0.99);
  const flex = Math.PI - Math.acos(clamp(1 - (d * d) / (2 * ARM * ARM), -1, 1));
  const ca = Math.cos(flex / 2), sa = Math.sin(flex / 2);
  out.rz = Math.asin(clamp(ux / ca, -1, 1));
  out.sx = Math.atan2(-uz, -uy) + Math.atan2(sa, ca * Math.cos(out.rz));
  out.el = -flex;
  return true;
}
const ARM_CH = ['sx', 'sin', 'el'], LEG_CH = ['hx', 'kn', 'hz'], BODY_CH = ['lean', 'twist', 'leanZ', 'headX', 'mouth', 'rigX'];
function keyPose(keys, t, T) {
  let a = keys[0], b = a;
  const last = keys[keys.length - 1];
  if (t >= last.t) a = b = last;
  else if (t > a.t) for (let i = 0; i < keys.length - 1; i++) if (t <= keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; }
  const k = a === b ? 0 : SM((t - a.t) / (b.t - a.t));
  for (const c in a) {
    if (c === 't') continue;
    const va = a[c], vb = c in b ? b[c] : va;
    T[c] = Array.isArray(va) ? [va[0] + (vb[0] - va[0]) * k, va[1] + (vb[1] - va[1]) * k] : va + (vb - va) * k;
  }
}
function copyPose(P) { return { ...P, sx: [P.sx[0], P.sx[1]], sin: [P.sin[0], P.sin[1]], el: [P.el[0], P.el[1]], hx: [P.hx[0], P.hx[1]], hz: [P.hz[0], P.hz[1]], kn: [P.kn[0], P.kn[1]] }; }
function mixPose(T, A, wA, wL) {
  for (const c of ARM_CH) for (let i = 0; i < 2; i++) T[c][i] += (A[c][i] - T[c][i]) * wA;
  for (const c of BODY_CH) T[c] += (A[c] - T[c]) * wA;
  for (const c of LEG_CH) for (let i = 0; i < 2; i++) T[c][i] += (A[c][i] - T[c][i]) * wL;
  T.bounce += (A.bounce - T.bounce) * wL;
}
// ---- claves de animación (índice 0 = lado derecho del personaje: pierna de pateo) ----
const K_KICK = [ // tiro con la derecha: pierna atrás, golpe y remate
  { t: 0, hx: [0.15, -0.2], kn: [0.6, 0.35], hz: [-0.05, 0.12], lean: -0.05, twist: 0.25, leanZ: 0.1, sx: [0.4, -0.5], sin: [-0.7, -0.7], el: [-0.4, -0.4], headX: -0.25, mouth: 0.03 },
  { t: 0.1, hx: [0.8, -0.25], kn: [1.5, 0.45], hz: [-0.1, 0.12], lean: -0.12, twist: 0.4, leanZ: 0.15, sx: [0.7, -0.9], sin: [-0.9, -0.8], el: [-0.3, -0.4], headX: -0.3 },
  { t: 0.17, hx: [-1.05, -0.25], kn: [0.12, 0.4], hz: [0.05, 0.1], lean: 0.05, twist: -0.25, leanZ: -0.05, sx: [-0.6, 0.5], sin: [-0.8, -0.9], el: [-0.4, -0.3], headX: -0.35, mouth: 0.07 },
  { t: 0.3, hx: [-1.5, -0.1], kn: [0.35, 0.25], hz: [0.1, 0.05], lean: 0.12, twist: -0.4, leanZ: -0.1, sx: [-0.8, 0.6], sin: [-0.7, -0.8], el: [-0.5, -0.3], headX: -0.25 },
  { t: 0.55, hx: [-0.3, -0.15], kn: [0.4, 0.3], hz: [0, 0], lean: 0.1, twist: 0, leanZ: 0, sx: [-0.2, -0.2], sin: [-0.3, -0.3], el: [-0.5, -0.5], headX: -0.1 },
];
const K_VOLLEY = [ // volea: el cuerpo se tumba de lado y la pierna sube
  { t: 0, hx: [0.3, -0.3], kn: [1.0, 0.5], hz: [-0.3, 0.15], lean: -0.15, twist: 0.5, leanZ: 0.35, sx: [0.3, -1.2], sin: [-1.1, -1.0], el: [-0.3, -0.3], headX: -0.1 },
  { t: 0.12, hx: [-1.7, -0.3], kn: [0.15, 0.5], hz: [-0.6, 0.15], lean: -0.2, twist: -0.4, leanZ: 0.5, sx: [-0.6, -1.3], sin: [-1.2, -1.2], el: [-0.3, -0.3], headX: -0.2, mouth: 0.07 },
  { t: 0.3, hx: [-1.1, -0.2], kn: [0.5, 0.4], hz: [-0.3, 0.1], lean: 0, twist: -0.4, leanZ: 0.25, sx: [-0.5, -0.8], sin: [-0.9, -0.9], el: [-0.4, -0.4], headX: -0.1 },
  { t: 0.5, hx: [-0.2, -0.15], kn: [0.35, 0.3], hz: [0, 0], lean: 0.05, twist: 0, leanZ: 0, sx: [-0.2, -0.2], sin: [-0.3, -0.3], el: [-0.5, -0.5], headX: 0 },
];
const K_PASS = [ // pase con el interior del pie
  { t: 0, hx: [0.45, -0.2], kn: [0.9, 0.35], hz: [-0.25, 0.12], lean: 0, twist: 0.3, leanZ: 0, sx: [0.3, -0.4], sin: [-0.5, -0.5], el: [-0.4, -0.4], headX: -0.3, mouth: 0.03 },
  { t: 0.12, hx: [-0.6, -0.2], kn: [0.2, 0.35], hz: [0.3, 0.1], lean: 0.05, twist: -0.2, sx: [-0.4, 0.3], sin: [-0.6, -0.6], el: [-0.4, -0.4], headX: -0.3 },
  { t: 0.35, hx: [-0.2, -0.1], kn: [0.3, 0.25], hz: [0, 0], lean: 0.05, twist: 0, sx: [-0.1, -0.1], sin: [-0.2, -0.2], el: [-0.5, -0.5], headX: -0.1 },
];
const K_HEADER = [
  { t: 0, hx: [-0.4, -0.1], kn: [1.0, 0.7], hz: [-0.1, 0.1], lean: -0.35, twist: 0, leanZ: 0, sx: [-1.2, -1.2], sin: [-0.7, -0.7], el: [-0.6, -0.6], headX: 0.35, mouth: 0.03 },
  { t: 0.16, hx: [-0.1, 0.2], kn: [0.6, 0.9], lean: 0.6, headX: -0.55, sx: [-0.4, -0.4], sin: [-0.9, -0.9], el: [-0.4, -0.4], mouth: 0.07 },
  { t: 0.42, hx: [-0.3, -0.2], kn: [0.5, 0.5], lean: 0.2, headX: -0.1, sx: [-0.4, -0.4], sin: [-0.5, -0.5], el: [-0.5, -0.5] },
];
const K_CHILENA = [ // chilena: el cuerpo se tumba hacia atrás en el aire y la pierna pasa por encima
  { t: 0, rigX: -0.4, hx: [-0.6, -0.9], kn: [1.0, 0.8], hz: [0, 0], sx: [-0.9, -0.9], sin: [-1.2, -1.2], el: [-0.3, -0.3], lean: -0.3, twist: 0, leanZ: 0, headX: 0.2, mouth: 0.03 },
  { t: 0.18, rigX: -1.5, hx: [-2.7, -0.3], kn: [0.2, 1.3], sx: [-0.6, -0.6], sin: [-1.4, -1.4], el: [-0.2, -0.2], lean: -0.2, headX: 0.4, mouth: 0.08 },
  { t: 0.45, rigX: -1.45, hx: [-1.2, -0.8], kn: [0.6, 0.9], sx: [-0.8, -0.8], sin: [-1.3, -1.3], el: [-0.3, -0.3], lean: -0.1, headX: 0.3 },
  { t: 0.8, rigX: -1.4, hx: [-0.5, -0.4], kn: [0.8, 0.8], sx: [-1.2, -1.2], sin: [-0.8, -0.8], el: [-0.4, -0.4], lean: 0, headX: 0.2 },
];
const K_SKILL = [ // amague / bicicleta: la pierna pasa por encima del balón y el cuerpo se mece
  { t: 0, hx: [-0.5, -0.2], kn: [0.9, 0.4], hz: [0.35, 0.15], lean: 0.15, twist: 0.35, leanZ: 0.22, sx: [-0.3, -0.3], sin: [-0.9, -0.5], el: [-0.5, -0.5], headX: -0.25, mouth: 0.05 },
  { t: 0.14, hx: [-0.4, -0.2], kn: [0.8, 0.4], hz: [-0.45, 0.15], lean: 0.15, twist: -0.25, leanZ: -0.22, sx: [-0.3, -0.3], sin: [-0.5, -0.9], el: [-0.5, -0.5] },
  { t: 0.28, hx: [-0.2, -0.5], kn: [0.4, 0.9], hz: [-0.15, -0.35], lean: 0.2, twist: 0.3, leanZ: 0.25, sx: [-0.3, -0.3], sin: [-0.9, -0.5], el: [-0.5, -0.5] },
  { t: 0.45, hx: [-0.15, -0.15], kn: [0.3, 0.3], hz: [-0.1, 0.1], lean: 0.15, twist: 0, leanZ: 0, sx: [-0.2, -0.2], sin: [-0.3, -0.3], el: [-0.6, -0.6] },
];
const K_TACKLE = [ // entrada de pie: estira la pierna para tocar el balón
  { t: 0, hx: [-0.2, 0.2], kn: [0.6, 0.6], hz: [0, 0], lean: 0.25, twist: 0.2, leanZ: 0, sx: [0.2, -0.5], sin: [-0.6, -0.6], el: [-0.5, -0.5], headX: -0.3, mouth: 0.04 },
  { t: 0.12, hx: [-1.1, 0.35], kn: [0.15, 0.7], hz: [0.15, 0], lean: 0.45, twist: -0.2, sx: [0.4, -0.8], sin: [-0.8, -0.8], el: [-0.4, -0.4], headX: -0.4 },
  { t: 0.4, hx: [-0.3, -0.1], kn: [0.4, 0.3], hz: [0, 0], lean: 0.15, twist: 0, sx: [-0.1, -0.1], sin: [-0.3, -0.3], el: [-0.5, -0.5], headX: -0.1 },
];
const K_CHEST = [{ t: 0, lean: -0.35, sx: [-0.6, -0.6], sin: [-0.8, -0.8], el: [-0.6, -0.6], headX: -0.45 }, { t: 0.2, lean: -0.1, sx: [-0.3, -0.3], sin: [-0.4, -0.4], el: [-0.5, -0.5], headX: -0.2 }];
const K_CATCH = [{ t: 0, sx: [-1.6, -1.6], sin: [0.35, 0.35], el: [-0.5, -0.5], lean: 0.2, headX: -0.25 }, { t: 0.25, sx: [-1.1, -1.1], sin: [0.5, 0.5], el: [-1.3, -1.3], lean: 0.25, headX: -0.15 }];
const K_HOLD = [{ t: 0, sx: [-0.9, -0.9], sin: [0.55, 0.55], el: [-1.5, -1.5], lean: 0.05, headX: -0.1 }];
const K_THROW = [
  { t: 0, hx: [0.2, -0.5], kn: [0.5, 0.5], hz: [-0.1, 0.1], lean: 0, twist: -0.6, leanZ: 0.1, sx: [-3.1, -1.4], sin: [-0.5, -0.1], el: [-1.7, -0.3], headX: -0.15 },
  { t: 0.12, hx: [0.25, -0.55], kn: [0.55, 0.5], hz: [-0.1, 0.1], lean: 0.05, twist: -0.65, leanZ: 0.1, sx: [-3.2, -1.5], sin: [-0.55, -0.1], el: [-1.7, -0.3], headX: -0.15 },
  { t: 0.22, hx: [0.45, -0.6], kn: [0.7, 0.45], hz: [-0.1, 0.1], lean: 0.4, twist: 0.45, leanZ: -0.15, sx: [-2.2, -0.6], sin: [-0.3, 0.3], el: [-0.2, -1.6], headX: -0.2, mouth: 0.06 },
  { t: 0.38, hx: [0.1, -0.5], kn: [0.7, 0.5], hz: [-0.1, 0.1], lean: 0.55, twist: 0.5, leanZ: -0.05, sx: [-0.4, -0.6], sin: [0.6, 0.2], el: [-0.5, -1.4], headX: -0.25 },
  { t: 0.55, hx: [-0.2, -0.2], kn: [0.4, 0.4], hz: [0, 0], lean: 0.2, twist: 0, leanZ: 0, sx: [-0.4, -0.5], sin: [0.1, 0.1], el: [-0.6, -0.8], headX: -0.1 },
];
const K_CALL = [{ t: 0, sx: [-2.9, -0.2], sin: [-0.35, -0.1], el: [-0.25, -0.4], headX: -0.2, mouth: 0.07 }, { t: 0.4, sx: [-2.7, -0.2], sin: [-0.5, -0.1], el: [-0.5, -0.4], mouth: 0.07 }];
const ACT = {
  kick: { keys: K_KICK, D: 0.55, bo: 0.15, legs: 'own' },
  volley: { keys: K_VOLLEY, D: 0.5, bo: 0.15, legs: 'own' },
  pass: { keys: K_PASS, D: 0.35, bo: 0.12, legs: 'own' },
  header: { keys: K_HEADER, D: 0.5, bo: 0.15, legs: 'own' },
  chilena: { keys: K_CHILENA, D: 0.95, legs: 'own' },
  skill: { keys: K_SKILL, D: 0.45, bo: 0.1, legs: 'own' },
  tackle: { keys: K_TACKLE, D: 0.4, bo: 0.12, legs: 'own' },
  chest: { keys: K_CHEST, D: 0.4, bo: 0.15, legs: 'pre' },
  catch: { keys: K_CATCH, D: 0.6, bo: 0.2, legs: 'pre' },
  hold: { keys: K_HOLD, D: 99, bi: 0.12, legs: 'pre' },
  throw: { keys: K_THROW, D: 0.55, bo: 0.15, legs: 'pre' },
  call: { keys: K_CALL, D: 0.8, bo: 0.2, legs: 'pre' },
};
const FAST_ANIM = { kick: 1, volley: 1, pass: 1, header: 1, chilena: 1, skill: 1, tackle: 1, throw: 1 };
const ANIMS = ['', 'kick', 'volley', 'pass', 'header', 'chilena', 'skill', 'tackle', 'chest', 'catch', 'hold', 'throw', 'call', 'dive', 'slide', 'lie', 'lieb', 'cheer', 'sad'];
const ANIM_I = Object.fromEntries(ANIMS.map((a, i) => [a, i]));

class Char {
  constructor(info) {
    this.id = info.id;
    this.team = info.team;
    this.gk = !!info.gk;
    this.variant = Math.abs(info.id * 7 + 3) % 3;
    const look = (this.look = info.look || randomLook());
    this.cel = look.cel || ['punos', 'salto', 'aplauso'][this.variant];
    const kit = info.kit || { shirt: '#3a7bff', shorts: '#ffffff' };
    const shirtC = this.gk ? (info.team === 0 ? '#ffe14d' : '#9be15d') : kit.shirt;
    const shortsC = this.gk ? '#2b2f45' : kit.shorts;
    const ink = lum(shirtC) > 0.62 ? BLACK : '#ffffff';
    this.root = new THREE.Group();
    this.foot = new THREE.Mesh(GEO.footRing, new THREE.MeshBasicMaterial({ color: new THREE.Color(kit.shirt), transparent: true, opacity: 0.75, depthWrite: false }));
    this.foot.rotation.x = -Math.PI / 2;
    this.root.add(this.foot);
    const rig = (this.rig = new THREE.Group());
    this.root.add(rig);
    const pelvis = (this.pelvis = new THREE.Group());
    pelvis.position.y = 0.55;
    rig.add(pelvis);
    const torso = (this.torso = new THREE.Group());
    pelvis.add(torso);
    const tm = outline(mesh(GEO.torso, toon(shirtC))); tm.position.y = 0.33; tm.scale.set(1, 1, 0.85); torso.add(tm);
    const collar = mesh(GEO.collar, toon(shortsC), false); collar.rotation.x = Math.PI / 2; collar.position.y = 0.62; torso.add(collar);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: numTex(look.num || 10, ink), transparent: true, depthWrite: false }));
    num.position.set(0, 0.38, -0.218); num.rotation.y = Math.PI; torso.add(num);
    const shorts = outline(mesh(GEO.shorts, toon(shortsC))); shorts.position.y = 0.04; pelvis.add(shorts);
    this.hips = []; this.knees = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.12, 0, 0); pelvis.add(hip);
      const leg = mesh(GEO.shorts, toon(shortsC)); leg.scale.set(0.42, 0.7, 0.42); leg.position.y = -0.06; hip.add(leg);
      const thigh = mesh(GEO.limb, toon(look.skin)); thigh.scale.set(1.3, THIGH, 1.3); thigh.position.y = -THIGH / 2; hip.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -THIGH; hip.add(knee);
      const shin = mesh(GEO.sock, toon(shirtC)); shin.position.y = -0.11; knee.add(shin);
      const top = mesh(GEO.band, toon(shortsC), false); top.position.y = -0.02; knee.add(top);
      const shoe = outline(mesh(GEO.ball, toon(look.boots))); shoe.scale.set(0.095, 0.065, 0.16); shoe.position.set(0, -SHIN + 0.03, 0.045); knee.add(shoe);
      hip.userData.s = s;
      this.hips.push(hip); this.knees.push(knee);
    }
    this.shoulders = []; this.elbows = [];
    const armC = this.gk ? shirtC : look.skin;
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.31, 0.5, 0); torso.add(sh);
      const sl = mesh(GEO.sleeve, toon(shirtC)); sl.position.y = -0.04; sh.add(sl);
      const up = mesh(GEO.limb, toon(armC)); up.scale.set(1, ARM - 0.01, 1); up.position.y = -(ARM - 0.01) / 2; sh.add(up);
      const el = new THREE.Group(); el.position.y = -ARM; sh.add(el);
      const fo = mesh(GEO.limb, toon(armC)); fo.scale.set(0.95, ARM - 0.03, 0.95); fo.position.y = -(ARM - 0.03) / 2; el.add(fo);
      const hand = outline(mesh(GEO.ball, toon(this.gk ? '#ffffff' : look.skin)), 1.12); hand.scale.setScalar(this.gk ? 0.12 : 0.09); hand.position.y = -ARM; el.add(hand);
      sh.userData.s = s;
      this.shoulders.push(sh); this.elbows.push(el);
    }
    const head = (this.head = new THREE.Group()); head.position.y = 0.97; torso.add(head);
    const skull = outline(mesh(GEO.head, toon(look.skin)), 1.05); skull.scale.set(1, 0.95, 0.95); head.add(skull);
    for (const s of [-1, 1]) { const ear = mesh(GEO.ball, toon(look.skin)); ear.scale.set(0.08, 0.1, 0.06); ear.position.set(s * 0.39, -0.02, 0); head.add(ear); }
    const nose = mesh(GEO.ball, toon(look.skin), false); nose.scale.set(0.05, 0.04, 0.04); nose.position.set(0, -0.06, 0.39); head.add(nose);
    this.eyes = []; this.pupils = [];
    for (const s of [-1, 1]) {
      const eye = mesh(GEO.ball, toon('#ffffff'), false); eye.scale.set(0.085, 0.115, 0.05); eye.position.set(s * 0.14, 0.04, 0.345); head.add(eye);
      const pup = mesh(GEO.ball, new THREE.MeshBasicMaterial({ color: 0x1d2340 }), false); pup.scale.set(0.045, 0.06, 0.03); pup.position.set(s * 0.14, 0.03, 0.385); head.add(pup);
      const hl = mesh(GEO.ball, new THREE.MeshBasicMaterial({ color: 0xffffff }), false); hl.scale.set(0.32, 0.26, 0.4); hl.position.set(0.35, 0.35, 0.8); pup.add(hl);
      const brow = mesh(GEO.box, new THREE.MeshBasicMaterial({ color: look.hair === 'bald' ? 0x6b3e1f : look.hairColor }), false); brow.scale.set(0.12, 0.025, 0.02); brow.position.set(s * 0.14, 0.2, 0.36); brow.rotation.z = s * -0.12; head.add(brow);
      this.eyes.push(eye); this.pupils.push(pup);
    }
    this.mouth = mesh(GEO.ball, new THREE.MeshBasicMaterial({ color: 0x7a2335 }), false);
    this.mouth.scale.set(0.06, 0.025, 0.02); this.mouth.position.set(0, -0.16, 0.365); head.add(this.mouth);
    buildHair(head, look);
    buildAcc(this, look);
    // solo las piezas grandes proyectan sombra
    this.root.traverse((o) => { o.castShadow = false; });
    tm.castShadow = true; skull.castShadow = true; shorts.castShadow = true;
    this.blob = new THREE.Mesh(BLOB_GEO, BLOB_MAT);
    this.blob.rotation.x = -Math.PI / 2;
    this.root.add(this.blob);
    scene.add(this.root);
    this.blinkT = rand(1, 4);
    this.ph = rand(0, 6);
    this.lastY = 0; this.squash = 0; this.prevSpeed = 0; this.dustT = 0;
    this.clock = 0; this.vLoc = 0; this.wLoc = 0; this.wL = 0; this.shufW = 0; this.legYaw = 0; this.gaitDir = 1;
    this.mvF = 1; this.mvL = 0; this.eF = 1; this.eL = 0; this.px = undefined; this.pz = 0; this.footSign = [1, 1]; this.twistD = 0; this.rigY = 0;
    this.snapYaw = false;
  }
  dispose() { scene.remove(this.root); }
  // el receptor se vuelve transparente cuando la cámara está detrás de él
  ghostify() {
    if (this.ghostMats) return;
    this.ghostMats = [];
    this.root.traverse((o) => {
      if (!o.isMesh || o === this.foot || o === this.blob) return;
      o.material = o.material.clone();
      this.ghostMats.push({ m: o.material, ol: !!o.userData.ol });
    });
  }
  setGhost(a) {
    if (!this.ghostMats || this.ghostA === a) return;
    this.ghostA = a;
    for (const g of this.ghostMats) { g.m.transparent = a < 1; g.m.opacity = g.ol ? (a < 1 ? 0 : 1) : a; g.m.depthWrite = a >= 1; g.m.needsUpdate = true; }
  }
  handPos(i, out) {
    this.root.updateMatrixWorld(true);
    return this.elbows[i].localToWorld(out.set(0, -ARM - 0.03, i === 1 ? 0.08 : 0.02));
  }

  // ---------- capa base: cuánto y hacia dónde se mueve de verdad ----------
  trackMotion(st, dt, dyaw) {
    let dist = 0;
    if (this.px !== undefined) {
      const dx = st.x - this.px, dz = st.z - this.pz;
      dist = Math.hypot(dx, dz);
      if (dist > 1.0) { dist = 0; dyaw = 0; }
      else if (dist > 1e-4) {
        const ry = this.root.rotation.y;
        this.mvF = (dx * Math.sin(ry) + dz * Math.cos(ry)) / dist;
        this.mvL = (dx * Math.cos(ry) - dz * Math.sin(ry)) / dist;
      }
    } else dyaw = 0;
    this.px = st.x; this.pz = st.z;
    const kE = 1 - Math.exp(-12 * dt);
    this.eF += (this.mvF - this.eF) * kE; this.eL += (this.mvL - this.eL) * kE;
    const idt = 1 / Math.max(dt, 1e-4);
    this.vLoc = damp(this.vLoc, Math.min(dist * idt, 9), 12, dt);
    const turnV = Math.min(dyaw * idt * 0.18, 2);
    this.wLoc = damp(this.wLoc, SM((Math.max(this.vLoc, turnV) - 0.15) / 0.75), 10, dt);
    const v = this.vLoc;
    const lateral = Math.abs(this.mvL) > Math.abs(this.mvF) * 1.1;
    const shuffle = lateral && v < 2.6;
    this.shufW = damp(this.shufW, shuffle ? 1 : 0, 10, dt);
    const mvAng = Math.atan2(this.mvL, this.mvF);
    let yawT = 0;
    if (!shuffle) yawT = (Math.abs(mvAng) <= Math.PI / 2 + 0.35 ? clamp(mvAng, -1.2, 1.2) : clamp(wrapA(mvAng + Math.PI), -1.0, 1.0)) * (lateral ? 1 : 0.6);
    this.legYaw = damp(this.legYaw, yawT * this.wLoc, 8, dt);
    this.gaitDir = Math.cos(mvAng - this.legYaw) >= -0.2 ? 1 : -1;
    const step = dist + dyaw * 0.18;
    const L = clamp(0.28 + 0.08 * v, 0.28, 0.78), Ls = clamp(0.36 + 0.1 * v, 0.4, 0.62);
    this.ph += lerp((step / L) * Math.PI, (step / Ls) * 2 * Math.PI, this.shufW);
  }
  gait(ready) {
    const v = this.vLoc, fast = SM(v / 5);
    const L = clamp(0.28 + 0.08 * v, 0.28, 0.78);
    const KS = 0.18, MX = THIGH + SHIN * Math.cos(KS), MY = SHIN * Math.sin(KS), ML = Math.hypot(MX, MY), DL = Math.atan2(MY, MX);
    const cy = Math.cos(this.legYaw), sy = Math.sin(this.legYaw);
    const ef = this.eF * cy + this.eL * sy, el = this.eL * cy - this.eF * sy;
    const Gp = {
      hx: [0, 0], kn: [0, 0], hz: [0, 0], sx: [0, 0], sin: [0.05, 0.05], el: [-1.1 - 0.3 * fast, -1.1 - 0.3 * fast],
      lean: 0.1 + 0.22 * fast * this.gaitDir, twist: 0, leanZ: 0, headX: -0.15, mouth: 0.03, rigX: 0, bounce: 0.04 * fast * Math.abs(Math.sin(this.ph)),
    };
    for (let i = 0; i < 2; i++) {
      const ph = this.ph + i * Math.PI;
      const u = ((ph % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const xf = u < Math.PI ? (L / 2) * (1 - 2 * u / Math.PI) : -(L / 2) * Math.cos(Math.PI * SM((u - Math.PI) / Math.PI));
      const hz = Math.asin(clamp(xf * el / ML, -0.6, 0.6));
      Gp.hz[i] = hz;
      Gp.hx[i] = -Math.asin(clamp(xf * ef / (ML * Math.cos(hz)), -0.9, 0.9)) - DL;
      Gp.kn[i] = KS + Math.max(0, -Math.sin(ph)) * (0.8 + 0.6 * fast);
      Gp.sx[i] = -0.25 - Gp.hx[i] * (0.7 + 0.3 * fast);
    }
    const sw = this.shufW;
    if (sw > 0.01) {
      const sg = this.mvL >= 0 ? 1 : -1, lead = sg > 0 ? 1 : 0;
      const u = (((this.ph / (Math.PI * 2)) % 1) + 1) % 1;
      const Ls = clamp(0.36 + 0.1 * v, 0.4, 0.62), w0 = 0.07 + Ls / 4;
      let offLead, offTrail, liftLead = 0, liftTrail = 0;
      if (u < 0.5) { const s = u / 0.5; offLead = Ls * (-0.25 + 0.5 * SM(s)); offTrail = Ls * (0.25 - 0.5 * s); liftLead = Math.sin(Math.PI * s); }
      else { const s = (u - 0.5) / 0.5; offLead = Ls * (0.25 - 0.5 * s); offTrail = Ls * (-0.25 + 0.5 * SM(s)); liftTrail = Math.sin(Math.PI * s); }
      const eN = Math.max(0.3, Math.hypot(this.eF, this.eL)), eLn = Math.abs(this.eL) / eN, eFn = this.eF / eN;
      for (let i = 0; i < 2; i++) {
        const isLead = i === lead, q = isLead ? offLead : offTrail;
        const footX = sg * ((isLead ? w0 : -w0) + q * eLn), footZ = q * eFn, hipX = i ? 0.12 : -0.12, lift = isLead ? liftLead : liftTrail;
        const hz = Math.asin(clamp((footX - hipX) / 0.5, -0.7, 0.7));
        Gp.hz[i] = lerp(Gp.hz[i], hz, sw);
        Gp.kn[i] = lerp(Gp.kn[i], 0.8 + lift * 0.55, sw);
        Gp.hx[i] = lerp(Gp.hx[i], -0.4 - lift * 0.25 - Math.asin(clamp(footZ / 0.5, -0.6, 0.6)), sw);
        Gp.sx[i] = lerp(Gp.sx[i], ready ? -0.55 : -0.2, sw);
        Gp.el[i] = lerp(Gp.el[i], ready ? -1.0 : -0.5, sw);
      }
      Gp.lean = lerp(Gp.lean, 0.28, sw);
      Gp.bounce = lerp(Gp.bounce, 0.03 * Math.abs(Math.sin(this.ph)), sw);
    }
    return Gp;
  }

  // ---------- pose objetivo: base + acción ----------
  pose(st, ctx) {
    const air = st.y > 0.04;
    const a = st.anim, t = st.animT || 0;
    const B = {
      lean: 0.05, leanZ: 0, twist: 0, rigX: 0, bounce: 0, headX: 0, mouth: 0.025,
      sx: [-0.05, -0.05], sin: [-0.12, -0.12], el: [-0.25, -0.25], hx: [0, 0], hz: [0, 0], kn: [0.05, 0.05],
    };
    const crouch = (P, c) => { P.hx = [-c, -c]; P.kn = [2 * c, 2 * c]; };
    if (air) {
      B.hx = [-0.35, 0.15]; B.kn = [0.9, 0.7];
      B.sx = [-1.3, -2.9]; B.el = [-0.5, -0.15]; B.sin = [-0.15, -0.15];
    } else {
      if (ctx.ready) { crouch(B, 0.36); B.lean = 0.42; B.headX = -0.2; B.sx = [-0.7, -0.95]; B.sin = [0.12, 0.12]; B.el = [-0.8, -0.55]; B.hz = [-0.16, 0.16]; }
      else crouch(B, 0.06);
      if (this.wLoc > 0.001) mixPose(B, this.gait(ctx.ready), this.wLoc, this.wLoc);
    }
    const T = copyPose(B);
    this.wL = 0;
    const def = ACT[a];
    if (def) {
      const keys = def.keys;
      const A = copyPose(B);
      keyPose(keys, t, A);
      const k0 = keys[0].t;
      let wA = k0 < 0 ? SM((t - k0) / 0.08) : def.bi ? SM(t / def.bi) : 1;
      const holdAir = air && def.legs === 'own';
      if (def.bo && !holdAir) wA *= 1 - SM((t - (def.D - def.bo)) / def.bo);
      if (t > def.D && !holdAir) wA = 0;
      const own = def.legs === 'own';
      let wL;
      if (air && !own) wL = 0;
      else if (own) wL = wA;
      else wL = wA * (1 - this.wLoc);
      mixPose(T, A, wA, wL);
      this.wL = wL;
    } else if (a === 'dive') {
      Object.assign(T, { rigX: 1.3, lean: 0, headX: -1.0, sx: [-2.95, -2.95], sin: [0.2, 0.2], el: [0, 0], hx: [0.2, 0.25], kn: [0.35, 0.2], hz: [0, 0], mouth: 0.05, bounce: 0 });
      this.wL = 1;
    } else if (a === 'lie' || a === 'lieb') {
      const k = SM((t - 0.12) / 0.38);
      crouch(T, lerp(0.2, 0.55, k));
      Object.assign(T, { rigX: lerp(a === 'lieb' ? -1.35 : 1.35, 0, k), lean: lerp(0, 0.5, k), headX: lerp(-1, -0.2, k), hz: [0, 0], bounce: 0 });
      T.sx = [lerp(-2.9, -0.7, k), lerp(-2.9, -0.7, k)]; T.el = [lerp(0, -0.6, k), lerp(0, -0.6, k)];
      this.wL = 1;
    } else if (a === 'slide') {
      Object.assign(T, { rigX: -1.15, lean: -0.25, headX: 0.55, sx: [-2.5, -2.4], sin: [-0.4, -0.4], el: [-0.4, -0.4], hx: [-1.35, -0.95], kn: [0.12, 1.05], hz: [0, 0], bounce: 0, mouth: 0.05 });
      this.wL = 1;
    } else if (a === 'cheer' || a === 'sad') {
      const A = copyPose(B);
      if (a === 'cheer') this.cheerPose(A, t); else this.sadPose(A);
      const wL = 1 - this.wLoc;
      mixPose(T, A, 1, wL);
      if (A.flip && this.wLoc < 0.1) T.flip = true;
      this.wL = wL;
    }
    return T;
  }
  cheerPose(A, t) {
    const w = Math.sin(t * 13);
    A.hx = [-0.12, -0.12]; A.kn = [0.24, 0.24];
    A.bounce = Math.abs(Math.sin(t * 6.5)) * 0.22;
    if (this.cel === 'salto') { A.bounce = Math.max(0, Math.sin(t * 5)) * 0.55; A.sx = [-2.9, -2.9]; A.sin = [-0.6, -0.6]; A.el = [-0.1, -0.1]; A.hx = [-0.5, -0.5]; A.kn = [1.0, 1.0]; }
    else if (this.cel === 'aplauso') { A.sx = [-1.35, -1.35]; A.el = [-0.7, -0.7]; A.sin = [0.25 + w * 0.2, 0.25 + w * 0.2]; A.bounce *= 0.4; }
    else if (this.cel === 'baile') {
      const s8 = Math.sin(t * 8);
      A.twist = s8 * 0.5; A.leanZ = s8 * 0.15; A.sx = [-2.4 + s8 * 0.9, -2.4 - s8 * 0.9]; A.el = [-0.7, -0.7]; A.sin = [-0.3, -0.3];
      A.hz = [-0.15, 0.15]; A.bounce = Math.abs(Math.cos(t * 8)) * 0.08;
    } else if (this.cel === 'avion') { const s3 = Math.sin(t * 3); A.sx = [-1.55, -1.55]; A.sin = [-1.45, -1.45]; A.el = [0, 0]; A.leanZ = s3 * 0.35; A.lean = 0.15; A.bounce = 0.02; }
    else if (this.cel === 'voltereta') { A.flip = true; A.sx = [-2.9, -2.9]; A.sin = [-0.5, -0.5]; A.el = [0, 0]; A.bounce = 0; }
    else if (this.cel === 'campeon') {
      const cross = (t % 3) < 1.6;
      A.sx = cross ? [-1.25, -1.25] : [-0.3, -3.05]; A.sin = cross ? [0.95, 0.95] : [-0.1, 0.05]; A.el = cross ? [-1.95, -1.95] : [-0.3, 0];
      A.lean = -0.12; A.bounce = 0.02;
    } else { A.sx = [-2.95, -2.95]; A.el = [-1.1 + w * 0.6, -1.1 - w * 0.6]; A.sin = [-0.35, -0.35]; }
    A.mouth = 0.075; A.headX = this.cel === 'campeon' ? -0.35 : -0.3;
  }
  sadPose(A) {
    if (this.variant === 1) { A.hx = [-0.08, -0.08]; A.kn = [0.16, 0.16]; A.sx = [-2.7, -2.7]; A.el = [-2.3, -2.3]; A.sin = [0.25, 0.25]; A.headX = 0.25; }
    else { A.hx = [-0.5, -0.5]; A.kn = [1.0, 1.0]; A.lean = 0.8; A.sx = [-0.75, -0.75]; A.el = [-0.15, -0.15]; A.sin = [0.02, 0.02]; A.headX = 0.1; }
    A.mouth = 0.015;
  }

  // el portero estira los dos brazos hacia el balón
  reachArms(R) {
    this.root.updateMatrixWorld(true);
    const P = this.torso.worldToLocal(_ckV.set(R.x, R.y, R.z));
    const w = clamp(R.w, 0, 1);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;
      if (!solveArm(P.x + s * 0.13, P.y, P.z, s, _ik)) continue;
      const sh = this.shoulders[i], el = this.elbows[i];
      sh.rotation.x += wrapA(_ik.sx - sh.rotation.x) * w;
      sh.rotation.z += wrapA(_ik.rz - sh.rotation.z) * w;
      el.rotation.x += (_ik.el - el.rotation.x) * w;
    }
  }

  update(dt, st, lookX, lookY, lookZ, ctx = {}) {
    const r = this.root;
    this.clock += dt;
    const gy = 0;
    r.position.set(st.x, st.y + gy, st.z);
    const prevYaw = r.rotation.y;
    if (this.snapYaw) { r.rotation.y = st.ry; this.snapYaw = false; this.px = undefined; }
    else r.rotation.y = angDamp(r.rotation.y, st.ry, 14, dt);
    this.trackMotion(st, dt, Math.abs(wrapA(r.rotation.y - prevYaw)));
    this.foot.position.y = -st.y + 0.025;
    this.blob.visible = !renderer.shadowMap.enabled;
    if (this.blob.visible) { this.blob.position.y = -st.y + 0.018; this.blob.scale.setScalar(Math.max(0.5, 1 - st.y * 0.25)); }
    this.foot.material.opacity = st.y > 0.05 ? 0.4 : ctx.me ? 0.95 : 0.7;
    const T = this.pose(st, ctx);
    const fast = !!FAST_ANIM[st.anim];
    const K = fast ? 34 : 20, KL = (fast ? 34 : 20) + 40 * this.wLoc * (1 - this.wL);
    for (let i = 0; i < 2; i++) {
      const hip = this.hips[i], kn = this.knees[i];
      hip.rotation.x = damp(hip.rotation.x, T.hx[i], KL, dt);
      hip.rotation.z = damp(hip.rotation.z, T.hz[i], KL, dt);
      kn.rotation.x = damp(kn.rotation.x, T.kn[i], KL, dt);
      const sh = this.shoulders[i], s = sh.userData.s;
      sh.rotation.x = damp(sh.rotation.x, T.sx[i], K, dt);
      sh.rotation.z = damp(sh.rotation.z, -s * T.sin[i], K, dt);
      this.elbows[i].rotation.x = damp(this.elbows[i].rotation.x, T.el[i], K, dt);
    }
    const air = st.y > 0.04;
    let support = 0.55;
    if (!air) {
      const hL = legH(this.hips[0].rotation.x, this.knees[0].rotation.x) * Math.cos(this.hips[0].rotation.z);
      const hR = legH(this.hips[1].rotation.x, this.knees[1].rotation.x) * Math.cos(this.hips[1].rotation.z);
      support = Math.max(hL, hR) + 0.02;
    }
    this.pelvis.position.y = damp(this.pelvis.position.y, support + T.bounce, 22 + 30 * this.wLoc, dt);
    this.pelvis.rotation.y = damp(this.pelvis.rotation.y, this.legYaw, 10, dt);
    const KT = fast ? 40 : 14;
    this.twistD = damp(this.twistD, T.twist, KT, dt);
    this.torso.rotation.y = this.twistD - this.pelvis.rotation.y;
    this.torso.rotation.x = damp(this.torso.rotation.x, T.lean, KT, dt);
    this.torso.rotation.z = damp(this.torso.rotation.z, T.leanZ, fast ? KT : 10, dt);
    this.rig.rotation.x = damp(this.rig.rotation.x, T.rigX, 12, dt);
    this.rigY = damp(this.rigY, Math.abs(T.rigX) > 0.5 ? -0.3 : 0, 12, dt);
    let rigZ = 0, rigY = this.rigY;
    if (T.flip && !air) {
      const cyc = (st.animT || 0) % 1.7;
      if (cyc < 0.85) {
        const k = cyc / 0.85, th = -k * Math.PI * 2;
        this.rig.rotation.x = th;
        rigY = Math.sin(k * Math.PI) * 1.0 + 0.7 * (1 - Math.cos(th));
        rigZ = -0.7 * Math.sin(th);
        this.knees.forEach((kk) => { kk.rotation.x = 1.6; }); this.hips.forEach((h) => { h.rotation.x = -1.2; });
      } else this.rig.rotation.x = 0;
    }
    this.rig.position.set(0, rigY, rigZ);
    if (ctx.reach) this.reachArms(ctx.reach);
    this.mouth.scale.y = damp(this.mouth.scale.y, T.mouth, 14, dt);
    const vy = (st.y - this.lastY) / Math.max(dt, 1e-3);
    if (this.lastY > 0.04 && st.y <= 0.04) this.squash = 0.12;
    this.lastY = st.y;
    this.squash = Math.max(0, this.squash - dt * 0.9);
    const stretch = air ? clamp(vy * 0.008, -0.03, 0.06) : 0;
    r.scale.set(1 + this.squash * 0.6, 1 - this.squash + stretch, 1 + this.squash * 0.6);
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 ? 0.15 : 1;
    if (this.blinkT < 0) this.blinkT = rand(2, 5);
    for (const e of this.eyes) e.scale.y = 0.115 * blink;
    if (lookX !== undefined) {
      const hm = ctx.headMax || 1.1;
      const d = wrapA(Math.atan2(lookX - st.x, lookZ - st.z) - r.rotation.y);
      this.head.rotation.y = damp(this.head.rotation.y, clamp(d, -hm, hm) * 0.8 - this.torso.rotation.y - this.pelvis.rotation.y, 10, dt);
      const up = Math.atan2(lookY - (st.y + 1.5), Math.hypot(lookX - st.x, lookZ - st.z));
      this.head.rotation.x = damp(this.head.rotation.x, clamp(T.headX - up * 0.5 - this.torso.rotation.x * 0.6, -1.2, 0.6), 10, dt);
      const v = _lookV.set(lookX, lookY, lookZ);
      this.root.updateMatrixWorld(true);
      this.head.worldToLocal(v);
      v.normalize();
      this.pupils.forEach((p, i) => {
        p.position.x = (i ? 0.14 : -0.14) + clamp(v.x, -1, 1) * 0.035;
        p.position.y = 0.03 + clamp(v.y, -1, 1) * 0.04;
        p.scale.y = 0.06 * blink;
      });
    }
    if (!air && ctx.dust !== false) {
      for (let i = 0; i < 2; i++) {
        const sg = Math.sin(this.ph + i * Math.PI) > 0 ? 1 : -1;
        if (sg > 0 && this.footSign[i] < 0 && this.vLoc > 3.2 && this.shufW < 0.5) {
          const fs = i ? 1 : -1;
          puff(st.x + Math.cos(r.rotation.y) * 0.12 * fs, 0, st.z - Math.sin(r.rotation.y) * 0.12 * fs, this.vLoc > 5.5 ? 3 : 2, DUST, 0.32 + this.vLoc * 0.03, 0.8, 0.5);
        }
        this.footSign[i] = sg;
      }
      this.skidT = (this.skidT || 0) - dt;
      if (this.skidT <= 0 && this.prevSpeed > 4 && this.vLoc < this.prevSpeed - 2.6) { puff(st.x, 0, st.z, 6, DUST, 0.45, 2.2, 0.6); this.skidT = 0.4; }
      this.dustT -= dt;
      if ((st.anim === 'dive' || st.anim === 'slide') && this.dustT <= 0) { this.dustT = 0.04; puff(st.x, 0, st.z, 2, DUST, 0.5, 1.4, 0.7); }
    }
    this.prevSpeed = damp(this.prevSpeed, this.vLoc, 8, dt);
  }
}

// etiquetas con nombre (DOM)
const tagLayer = $('#tags');
function makeTag(p, isMe) {
  const d = document.createElement('div');
  d.className = 'tag' + (isMe ? ' me' : '') + (p.human && !isMe ? ' hum' : '');
  const short = isMe ? p.name : String(p.name).split(' ')[0];
  d.innerHTML = `<span class="dot" style="background:${escapeHtml(M.kits[p.team].shirt)}"></span><span class="nm">${escapeHtml(short)}</span>`;
  tagLayer.appendChild(d);
  return d;
}
const _v3 = new THREE.Vector3();
function worldToScreen(x, y, z) {
  _v3.set(x, y, z).project(camera);
  return { x: (_v3.x * 0.5 + 0.5) * innerWidth, y: (-_v3.y * 0.5 + 0.5) * innerHeight, vis: _v3.z < 1 && Math.abs(_v3.x) < 1.2 && Math.abs(_v3.y) < 1.2, z: _v3.z };
}


// =========================================================
//  SIMULACIÓN DEL PARTIDO
//  En línea manda el anfitrión: simula el balón, la PC y las
//  reglas. Cada invitado mueve a SU jugador y manda sus acciones.
// =========================================================
const DRAG = 0.09;
const REPLAY_T = 4.6;
const M = {
  on: false, mode: 'menu', net: 'off', size: 3, diff: 1, venue: 'estadio', dur: 180, time: 180, golden: true, goldenOn: false,
  phase: 'off', phaseT: 0, score: [0, 0], players: [], kits: kitsFor(SAVE.club, SAVE.rival), clubs: [SAVE.club, SAVE.rival],
  me: -1, events: [], kickTeam: 0, ko: 0, koTouch: true, koT: 0, clock: 0, ended: false, demo: false, tut: null,
  roles: [{ chaser: -1 }, { chaser: -1 }], roleT: 0, lastGoal: null, results: null,
};
const B = { x: 0, y: BR, z: 0, vx: 0, vy: 0, vz: 0, owner: -1, held: false, lastTouch: -1, prevTouch: -1, kickBy: -1, kickT: 0, inGoal: 0, netHit: false, passBy: -1, passTo: -1, shot: null, pow: 0, trail: 0, lastKind: '', noGk: -1, postT: 0 };
const LOCAL = { mx: 0, mz: 0, sprint: false, shoot: false, pass: false, shootP: false, passP: false, skillP: false, callP: false };
const emit = (t, d) => { M.events.push(Object.assign({ t }, d || {})); };
const goalX = (team) => (team === 0 ? -F.HL : F.HL);   // portería que defiende
const atkX = (team) => (team === 0 ? F.HL : -F.HL);    // portería a la que ataca
const atkSign = (team) => (team === 0 ? 1 : -1);
const fwdOf = (p) => [Math.sin(p.ry), Math.cos(p.ry)];
const owner = () => (B.owner >= 0 ? M.players[B.owner] : null);
const owns = (p) => B.owner === p.id;
const busy = (p) => p.fallT > 0 || p.slideT > 0 || p.diveT > 0;
const aiCtl = (p) => !p.local && !p.remote;
const randn = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.75;
const VEN = () => venueOf(M.venue);
const inOwnBox = (p) => Math.abs(p.x - goalX(p.team)) < F.BOXD + 0.6 && Math.abs(p.z) < F.BOXW + 0.6;

function makePlayer(id, team, o) {
  const look = sanitizeLook(o.look);
  return {
    id, team, gk: !!o.gk, idx: o.idx | 0, name: String(o.name || 'Jugador').slice(0, 12), look, human: !!o.human, local: !!o.local, remote: !!o.remote, pid: o.pid || '', cid: o.cid || '',
    x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, ry: team === 0 ? Math.PI / 2 : -Math.PI / 2, anim: '', animT: 0,
    stam: 1, tired: false, want: { mx: 0, mz: 0, sprint: false }, face: null, drib: 0,
    slideT: 0, slideCD: 0, slideDx: 0, slideDz: 0, slideHit: false, tackleT: 0, tackleCD: 0, tackleDone: false,
    skillT: 0, skillCD: 0, skDx: 0, skDz: 0, elusive: 0, fallT: 0, kickCD: 0, noTakeT: 0, callT: 0,
    chargeT: -1, passHold: -1, buf: null, diveT: 0, dvx: 0, dvz: 0, react: 0, holdT: 0, holdMax: 1.2,
    ai: { t: rand(0, 0.3), tx: 0, tz: 0, sprint: false, face: null },
    st: { g: 0, a: 0, sh: 0, sv: 0, tk: 0, ps: 0 }, sk: STYLES[look.style] || STYLES.todo, K: null, ko: 0, rbuf: [],
  };
}
function setSkill(p) {
  const humanTeam = M.players.some((q) => q.team === p.team && q.human);
  const D = DIFF[humanTeam ? Math.max(1, M.diff) : M.diff];
  const rk = (clubOf(M.clubs[p.team]).r - 3) * 0.015, s = p.sk;
  const human = p.human;
  p.K = {
    spd: (human ? 1 : D.spd + rk) * s.spd, aim: human ? 0.86 : D.aim + rk * 2, pass: s.pass, shot: s.shot,
    tackle: (human ? 0.95 : D.tackle) * s.tackle, react: D.react, think: D.think, press: D.press, gk: D.gk + rk * 2, stam: s.stam,
  };
}
function cpuName(rng) { return CPU_NAMES[Math.floor(rng() * CPU_NAMES.length)]; }
function clearChars() { for (const p of M.players) if (p.ch) p.ch.dispose(); }

// o: { mode, net, size, dur, diff, venue, golden, clubs, roster:[{name, look, human, local, remote, pid, cid, team}], demo, tut, seed }
function newMatch(o) {
  clearChars();
  Object.assign(M, {
    on: true, mode: o.mode, net: o.net || 'off', size: clamp(o.size | 0, 1, 4), diff: clamp(o.diff | 0, 0, 2), venue: VENUES[o.venue] ? o.venue : 'estadio',
    dur: (o.dur || 3) * 60, golden: !!o.golden, goldenOn: false, score: [0, 0], events: [], ended: false, demo: !!o.demo, tut: o.tut || null,
    clubs: o.clubs || [SAVE.club, SAVE.rival], clock: 0, ko: 0, me: -1, lastGoal: null, results: null, roleT: 0,
  });
  M.time = M.dur;
  M.kits = kitsFor(M.clubs[0], M.clubs[1]);
  buildWorld(M.venue, M.size);
  const V = VEN();
  DUST = V.sand ? 0xe8cf8f : V.snow ? 0xffffff : V.night ? 0x8fa0c8 : 0xcfe8b0;
  M.players = [];
  let id = 0;
  if (o.plist) o.plist.forEach((q, i) => { const p = makePlayer(i, q.tm ? 1 : 0, { name: q.n, look: q.l, gk: !!q.gk, idx: q.ix | 0, human: !!q.hu, local: i === o.me }); M.players.push(p); if (i === o.me) M.me = i; });
  else for (const team of [0, 1]) {
    const hum = (o.roster || []).filter((r) => r.team === team).slice(0, M.size);
    const rng = mulberry32(hashStr(M.clubs[team] + ':' + (o.seed || 7)));
    for (let i = 0; i < M.size; i++) {
      const r = hum[i] || { name: cpuName(rng), look: randomLook(rng) };
      const p = makePlayer(id++, team, Object.assign({}, r, { idx: i }));
      M.players.push(p);
      if (r.local) M.me = p.id;
    }
    M.players.push(makePlayer(id++, team, { name: cpuName(rng), look: Object.assign(randomLook(rng), { num: 1 }), gk: true, idx: 9 }));
  }
  for (const p of M.players) setSkill(p);
  for (const p of M.players) p.ch = new Char({ id: p.id, team: p.team, gk: p.gk, look: p.look, kit: M.kits[p.team] });
  M.kickTeam = o.kick != null ? o.kick : M.me >= 0 ? M.players[M.me].team : Math.random() < 0.5 ? 0 : 1;
  startKickoff(!o.tut);
}
function resetBall(x = 0, z = 0) {
  Object.assign(B, { x, y: BR, z, vx: 0, vy: 0, vz: 0, owner: -1, held: false, lastTouch: -1, prevTouch: -1, kickBy: -1, kickT: 0, inGoal: 0, netHit: false, passBy: -1, passTo: -1, shot: null, pow: 0, trail: 0, noGk: -1 });
}
function placeP(p, x, z) {
  Object.assign(p, { x, z, y: 0, vx: 0, vz: 0, vy: 0, ry: p.team === 0 ? Math.PI / 2 : -Math.PI / 2, anim: '', animT: 0, slideT: 0, fallT: 0, diveT: 0, skillT: 0, tackleT: 0, elusive: 0, chargeT: -1, passHold: -1, buf: null, holdT: 0, callT: 0, face: null });
  p.want.mx = p.want.mz = 0;
  if (p.ch) { p.ch.snapYaw = true; p.ch.px = undefined; }
}
// posiciones del saque (en el marco del equipo 0, que defiende x < 0); la primera es para quien saca
const KO_SPOTS = {
  k: { 1: [[-0.75, 0]], 2: [[-0.75, 0], [-6, 5]], 3: [[-0.75, 0], [-5, -6.5], [-8, 5.5]], 4: [[-0.75, 0], [-4.5, -7.5], [-4.5, 7.5], [-11, 0]] },
  d: { 1: [[-5, 0]], 2: [[-5, -2.5], [-8, 4]], 3: [[-5, 0], [-9, -6], [-9, 6]], 4: [[-5, 0], [-7, -7.5], [-7, 7.5], [-13, 0]] },
};
function kickoffOrder(team) {
  return M.players.filter((p) => p.team === team && !p.gk).sort((a, b) => (b.local ? 2 : b.human ? 1 : 0) - (a.local ? 2 : a.human ? 1 : 0) || a.idx - b.idx);
}
function startKickoff(first) {
  M.ko++;
  M.phase = first ? 'intro' : 'kickoff'; M.phaseT = first ? 2.4 : M.goldenOn && !M.goldenShown ? 2.2 : 1.1;
  M.goldenShown = M.goldenOn;
  M.koTouch = false; M.koT = 0;
  resetBall();
  const sx = F.L / 42, sz = F.W / 27;
  for (const team of [0, 1]) {
    const kicking = team === M.kickTeam, s = team === 0 ? 1 : -1;
    const spots = KO_SPOTS[kicking ? 'k' : 'd'][M.size];
    kickoffOrder(team).forEach((p, i) => { const sp = spots[i] || [-6, 0]; placeP(p, s * sp[0] * (i === 0 && kicking ? 1 : sx), sp[1] * sz); });
    const gk = M.players.find((p) => p.team === team && p.gk);
    placeP(gk, s * (-F.HL + 1.1), 0);
  }
  emit('ko', { ko: M.ko, first: !!first, kick: M.kickTeam });
}

// ---------- paso de simulación (60 por segundo) ----------
function simStep(dt) {
  if (!M.on) return;
  M.clock += dt;
  const ph = M.phase;
  M.phaseT -= dt;
  if (ph === 'replay') { if (M.phaseT <= 0) afterGoal(); return; }
  if (ph === 'intro' || ph === 'kickoff') {
    for (const p of M.players) { p.want.mx = p.want.mz = 0; p.want.sprint = false; timers(p, dt); if (!p.remote) movePlayer(p, dt); }
    clearLocalEdges();
    if (M.phaseT <= 0) { M.phase = 'play'; emit('whistle', { k: 1 }); }
    return;
  }
  const sdt = ph === 'goal' && M.phaseT > 2.4 ? dt * 0.4 : dt;   // cámara lenta justo después del gol
  if (ph === 'play') {
    M.roleT -= dt;
    if (M.roleT <= 0) { M.roleT = 0.15; updateRoles(); }
    if (!M.koTouch) M.koT += dt;
  }
  for (const p of M.players) {
    if (p.remote) continue;
    if (ph === 'play') {
      if (p.local) humanControl(p, LOCAL, sdt);
      else if (p.gk) gkThink(p, sdt);
      else aiThink(p, sdt);
    } else { p.want.mx = p.want.mz = 0; p.want.sprint = false; p.face = null; }
  }
  if (ph !== 'play') clearLocalEdges();
  for (const p of M.players) { timers(p, sdt); if (!p.remote) movePlayer(p, sdt); }
  separate();
  if (ph === 'play') { slideHits(); tackleHits(); }
  ballStep(sdt);
  if (M.tut) tutTick(dt);
  if (ph === 'play') {
    if (!M.goldenOn && !M.demo && !M.tut) M.time -= dt;
    if (M.time <= 0 && !M.goldenOn && M.phase === 'play') timeUp();
  } else if (ph === 'goal') {
    if (M.phaseT <= 0) {
      if (SAVE.replay && !M.tut && !M.demo) { M.phase = 'replay'; M.phaseT = REPLAY_T; emit('replay'); }
      else afterGoal();
    }
  } else if (ph === 'end') {
    if (M.phaseT <= 0 && !M.ended) finishMatch();
  }
}
function clearLocalEdges() { LOCAL.shootP = LOCAL.passP = LOCAL.skillP = LOCAL.callP = false; }
function timers(p, dt) {
  p.animT += dt;
  p.slideCD -= dt; p.tackleCD -= dt; p.skillCD -= dt; p.kickCD -= dt; p.noTakeT -= dt; p.callT -= dt; p.elusive -= dt; p.skillT -= dt;
  if (p.tackleT > 0) p.tackleT -= dt;
  if (p.buf) { p.buf.t -= dt; if (p.buf.t <= 0) p.buf = null; }
  if (p.slideT > 0) { p.slideT -= dt; if (p.slideT <= 0) { p.fallT = 0.38; p.anim = 'lieb'; p.animT = 0.02; } }
  if (p.diveT > 0) { p.diveT -= dt; if (p.diveT <= 0) { p.fallT = 0.55; p.anim = 'lie'; p.animT = -0.12; } }
  if (p.anim === 'chilena' && p.animT > 0.9) { p.anim = 'lieb'; p.animT = -0.1; }
  if (p.fallT > 0) { p.fallT -= dt; if (p.fallT <= 0 && (p.anim === 'lie' || p.anim === 'lieb')) p.anim = ''; }
  const def = ACT[p.anim];
  if (def && p.animT > def.D) p.anim = '';
}
function movePlayer(p, dt) {
  const V = VEN();
  if (p.fallT > 0) { p.vx = damp(p.vx, 0, 6, dt); p.vz = damp(p.vz, 0, 6, dt); }
  else if (p.slideT > 0) {
    const k = clamp(p.slideT / 0.55, 0, 1), sp = 3 + 8.5 * k * Math.sqrt(p.sk.tackle);
    p.vx = p.slideDx * sp; p.vz = p.slideDz * sp;
  } else if (p.diveT > 0) {
    p.vx = p.dvx; p.vz = p.dvz; p.dvx *= Math.exp(-2.5 * dt); p.dvz *= Math.exp(-2.5 * dt);
  } else {
    let mx = p.want.mx, mz = p.want.mz;
    const m = hyp(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    const carry = owns(p);
    const spr = p.want.sprint && !p.tired && m > 0.3 && p.chargeT < 0;
    let sp = (spr ? SPRINT : RUN) * p.K.spd * (carry ? CARRY : 1) * (p.gk ? 1.08 : 1);
    if (p.chargeT >= 0) sp *= 0.55;
    if (p.tackleT > 0) sp *= 1.2;
    let tx = mx * sp, tz = mz * sp;
    if (p.skillT > 0) { tx = tx * 0.55 + p.skDx * 7.5; tz = tz * 0.55 + p.skDz * 7.5; }
    const acc = (carry ? 24 : 30) * V.slip * dt;
    let dx = tx - p.vx, dz = tz - p.vz;
    const dl = hyp(dx, dz);
    if (dl > acc) { dx *= acc / dl; dz *= acc / dl; }
    p.vx += dx; p.vz += dz;
    const spd = hyp(p.vx, p.vz);
    if (spr && spd > RUN * 0.85) { p.stam -= (dt * 0.2) / p.K.stam; if (p.stam <= 0) { p.stam = 0; p.tired = true; } }
    else p.stam = Math.min(1, p.stam + dt * (spd < 2 ? 0.2 : 0.1));
    if (p.tired && p.stam > 0.3) p.tired = false;
  }
  const spd = hyp(p.vx, p.vz);
  if (p.diveT <= 0 && p.fallT <= 0 && p.slideT <= 0) {
    if (p.face != null && spd < 1.6) p.ry = angDamp(p.ry, p.face, 9, dt);
    else if (spd > 0.6) p.ry = angDamp(p.ry, Math.atan2(p.vx, p.vz), owns(p) ? 10 : 15, dt);
  }
  if (p.y > 0 || p.vy > 0) { p.vy -= 22 * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; p.vy = 0; } }
  p.x += p.vx * dt; p.z += p.vz * dt;
  boundP(p);
  if (!M.koTouch && M.phase === 'play' && M.koT < 5 && p.team !== M.kickTeam) koKeepOut(p);
}
function boundP(p) {
  const { HL, HW } = F, r = PR;
  p.z = clamp(p.z, -HW + r, HW - r);
  const lim = p.gk ? HL - 0.25 : HL - r;
  p.x = clamp(p.x, -lim, lim);
  const cx = Math.abs(p.x) - (HL - CR), cz = Math.abs(p.z) - (HW - CR);
  if (cx > 0 && cz > 0) { const d = (cx + cz - CR) / Math.SQRT2 + r; if (d > 0) { p.x -= Math.sign(p.x) * d / Math.SQRT2; p.z -= Math.sign(p.z) * d / Math.SQRT2; } }
  if (p.gk) { const gx = goalX(p.team), s = atkSign(p.team); if ((p.x - gx) * s > F.BOXD + 1.5) p.x = gx + s * (F.BOXD + 1.5); }
}
// en el saque, el equipo que no saca espera fuera del círculo y en su campo
function koKeepOut(p) {
  const s = atkSign(p.team);
  if (p.x * s > -0.2) p.x = -s * 0.2;
  const d = hyp(p.x, p.z), R = 3.6 + PR;
  if (d < R) { const k = R / Math.max(d, 0.01); p.x *= k; p.z *= k; if (d < 0.01) p.x = -s * R; }
}
function separate() {
  const P = M.players, R = PR * 2;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const a = P[i], b = P[j];
    if (a.slideT > 0 || b.slideT > 0 || (a.remote && b.remote)) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = hyp(dx, dz);
    if (d >= R || d < 1e-4) continue;
    const push = R - d, nx = dx / d, nz = dz / d;
    const wa = a.remote ? 0 : b.remote ? 1 : 0.5, wb = 1 - wa;
    a.x -= nx * push * wa; a.z -= nz * push * wa;
    b.x += nx * push * wb; b.z += nz * push * wb;
  }
}

// ---------- controles de una persona ----------
function aimFrom(p, mx, mz) { const m = hyp(mx, mz); return m > 0.25 ? [mx / m, mz / m, true] : [...fwdOf(p), false]; }
function humanControl(p, I, dt) {
  p.want.mx = I.mx; p.want.mz = I.mz; p.want.sprint = I.sprint; p.face = null;
  const sP = I.shootP, pP = I.passP, kP = I.skillP, cP = I.callP;
  I.shootP = I.passP = I.skillP = I.callP = false;
  if (M.phase !== 'play' || busy(p)) { p.chargeT = -1; p.passHold = -1; return; }
  const has = owns(p), [ax, az, hasAim] = aimFrom(p, I.mx, I.mz);
  if (sP) { if (has) p.chargeT = 0; else act(p, 'shoot', { ax, az, pw: 0.6, aim: hasAim }); }
  if (p.chargeT >= 0) {
    if (!owns(p)) p.chargeT = -1;
    else {
      p.chargeT += dt;
      if (!I.shoot || p.chargeT >= 1.0) { act(p, 'shoot', { ax, az, pw: clamp((p.chargeT - 0.07) / 0.85, 0, 1), aim: hasAim }); p.chargeT = -1; }
    }
  }
  if (pP) {
    if (has) p.passHold = 0;
    else {
      const o = owner();
      if (o && o.team === p.team) act(p, 'call', {});
      else if (o && o.team !== p.team && hyp(o.x - p.x, o.z - p.z) < 2.6) act(p, 'tackle', {});
      else act(p, 'pass', { ax, az, aim: hasAim });
    }
  }
  if (p.passHold >= 0) {
    if (!owns(p)) p.passHold = -1;
    else {
      p.passHold += dt;
      if (!I.pass || p.passHold >= 0.3) { act(p, 'pass', { ax, az, loft: p.passHold >= 0.3, aim: hasAim }); p.passHold = -1; }
    }
  }
  if (kP) {
    const [fx, fz] = fwdOf(p), cr = fx * az - fz * ax;
    act(p, has ? 'skill' : 'slide', { ax, az, side: Math.abs(cr) > 0.2 ? Math.sign(cr) : Math.random() < 0.5 ? -1 : 1 });
  }
  if (cP && !has) act(p, 'call', {});
}
// en el invitado solo se anima y se avisa al anfitrión; en el anfitrión (o sin red) se ejecuta
function act(p, a, prm) {
  if (M.net === 'client') { actFx(p, a, prm, true); netSend({ t: 'act', a, ko: M.ko, ax: +(+prm.ax || 0).toFixed(3), az: +(+prm.az || 0).toFixed(3), pw: +(+prm.pw || 0).toFixed(3), loft: prm.loft ? 1 : 0, aim: prm.aim ? 1 : 0, side: prm.side | 0 }); return true; }
  return performAct(p, a, prm);
}
// efectos sobre el propio jugador (animación y movimiento): los aplica quien lo mueve
function actFx(p, a, prm, client) {
  const has = owns(p);
  switch (a) {
    case 'skill':
      if (!has || p.skillCD > 0) return false;
      { const [fx, fz] = fwdOf(p), side = prm.side || 1; p.skDx = -fz * side; p.skDz = fx * side; }
      p.skillT = 0.3; p.elusive = 0.55; p.skillCD = 1.1; p.anim = 'skill'; p.animT = 0; p.stam = Math.max(0, p.stam - 0.06);
      return true;
    case 'slide': {
      if (has || p.slideCD > 0) return false;
      const l = hyp(prm.ax, prm.az) || 1;
      p.slideDx = prm.ax / l; p.slideDz = prm.az / l; p.slideT = 0.55; p.slideCD = 1.5; p.slideHit = false;
      p.ry = Math.atan2(p.slideDx, p.slideDz); p.anim = 'slide'; p.animT = 0; p.chargeT = -1;
      return true;
    }
    case 'tackle':
      if (has || p.tackleCD > 0) return false;
      p.tackleT = 0.4; p.tackleDone = false; p.tackleCD = 0.9; p.anim = 'tackle'; p.animT = 0;
      return true;
    case 'call':
      if (has) return false;
      p.callT = 1.6; if (!ACT[p.anim] || p.anim === 'call') { p.anim = 'call'; p.animT = 0; }
      return true;
    case 'shoot': case 'pass':
      if (client) {
        if (has) { p.anim = a === 'shoot' ? 'kick' : 'pass'; p.animT = a === 'shoot' ? 0.08 : 0.05; }
        else if (strikeReach(p, 0.3)) { const h = B.y - p.y; p.anim = h > 1.45 ? 'header' : h > 0.55 ? 'volley' : 'kick'; p.animT = 0.06; if (h > 1.45 && p.y <= 0) p.vy = 5; }
      }
      return true;
  }
  return false;
}
function performAct(p, a, prm = {}) {
  if (M.phase !== 'play' || busy(p)) return false;
  const ex = p.remote ? 0.6 : 0;
  switch (a) {
    case 'shoot':
      if (owns(p)) { if (p.gk && B.held) { gkDistribute(p, null, true); return true; } doShoot(p, clamp(+prm.pw || 0, 0, 1), +prm.ax || 0, +prm.az || 0); return true; }
      if (strikeReach(p, ex)) { doStrike(p, 'shoot', prm); return true; }
      p.buf = { kind: 'shoot', t: 0.4, prm };
      return false;
    case 'pass':
      if (owns(p)) { if (p.gk && B.held) { gkDistribute(p, null); return true; } doPass(p, +prm.ax || 0, +prm.az || 0, !!prm.loft, !!prm.aim); return true; }
      if (strikeReach(p, ex)) { doStrike(p, 'pass', prm); return true; }
      p.buf = { kind: 'pass', t: 0.4, prm };
      return false;
    case 'skill': case 'slide': case 'tackle': case 'call': {
      if (a === 'skill' && p.remote) { if (!owns(p) || p.skillCD > 0) return false; p.elusive = 0.6; p.skillCD = 1.0; emit('skill', { id: p.id }); return true; }
      if (a === 'slide' && p.remote) { const l = hyp(prm.ax, prm.az) || 1; p.slideDx = prm.ax / l; p.slideDz = prm.az / l; p.slideT = 0.55; p.slideHit = false; emit('slide', { id: p.id }); return true; }
      if (a === 'tackle' && p.remote) { p.tackleT = 0.45; p.tackleDone = false; return true; }
      if (a === 'call' && p.remote) { p.callT = 1.6; emit('call', { id: p.id }); return true; }
      const ok = actFx(p, a, prm, false);
      if (ok && a !== 'tackle') emit(a, { id: p.id });
      return ok;
    }
  }
  return false;
}

// ---------- golpes al balón ----------
function touch(p) { if (B.lastTouch !== p.id) B.prevTouch = B.lastTouch; B.lastTouch = p.id; M.koTouch = true; }
function kickBall(p, vx, vy, vz, o = {}) {
  B.owner = -1; B.held = false; B.vx = vx; B.vy = vy; B.vz = vz;
  if (B.y < BR) B.y = BR;
  B.kickBy = p.id; B.kickT = o.kt ?? 0.28; B.noGk = -1; touch(p);
  B.shot = o.shot ? { by: p.id, team: p.team, pow: o.pow || 0.5 } : null;
  B.passBy = o.pass ? p.id : -1; B.passTo = o.to ?? -1;
  B.pow = o.pow || 0; B.trail = o.shot && (o.pow || 0) > 0.55 ? 1 : 0; B.lastKind = o.k || 'kick';
  p.chargeT = -1; p.passHold = -1; p.buf = null;
  emit('kick', { id: p.id, x: B.x, y: B.y, z: B.z, pow: o.pow || 0.35, k: B.lastKind, shot: o.shot ? 1 : 0 });
}
function ballistic(tx, ty, tz, vh) {
  const dx = tx - B.x, dz = tz - B.z, d = Math.max(0.1, hyp(dx, dz));
  let t = d / vh;
  const q = 1 - (DRAG * d) / vh;
  if (q > 0.05) t = -Math.log(q) / DRAG;
  return [(dx / d) * vh, (ty - B.y + 0.5 * G * t * t) / t, (dz / d) * vh, t];
}
function ballisticT(tx, ty, tz, t) {
  const dx = tx - B.x, dz = tz - B.z, d = hyp(dx, dz), vh = (d * DRAG) / (1 - Math.exp(-DRAG * t));
  return [d > 0.01 ? (dx / d) * vh : 0, (ty - B.y + 0.5 * G * t * t) / t, d > 0.01 ? (dz / d) * vh : 0];
}
// adonde apunta el tiro: donde el stick cruza la línea de gol, con un poco de ayuda lejos del portero
function shotTarget(p, ax, az) {
  const gx = atkX(p.team), s = atkSign(p.team);
  let tz = ax * s > 0.15 ? B.z + az * ((gx - B.x) / ax) : B.z * 0.4;
  if (!Number.isFinite(tz)) tz = 0;
  const gk = M.players.find((q) => q.gk && q.team !== p.team);
  const far = gk ? (gk.z > 0 ? -1 : 1) * (GW / 2 - 0.55) : 0;
  tz = lerp(clamp(tz, -GW / 2 + 0.35, GW / 2 - 0.35), far, p.local || p.remote ? 0.22 : 0.47);
  return { tx: gx + s * 0.5, tz: clamp(tz, -GW / 2 + 0.35, GW / 2 - 0.35) };
}
function doShoot(p, pw, ax, az) {
  const s = atkSign(p.team), gx = atkX(p.team);
  const al = hyp(ax, az) || 1; ax /= al; az /= al;
  const d = hyp(gx - B.x, B.z);
  let tx, ty, tz, vh, shot = false;
  if (ax * s > 0.2 || d < 12) {
    if (ax * s <= 0.2) { ax = (gx - B.x) / d; az = -B.z / d; }
    const T = shotTarget(p, ax, az), placed = pw < 0.12;
    const spread = (0.22 + d * 0.028 + pw * pw * 0.85) * (1.18 - p.K.aim) * (placed ? 0.6 : 1);
    tx = T.tx; tz = T.tz + randn() * spread;
    ty = (placed ? 0.45 : 0.35 + pw * 0.95) + Math.abs(randn()) * spread * 0.5 * (0.3 + pw);
    if (d < 5) ty = Math.min(ty, 1.1);
    vh = (placed ? 15.5 : 14 + pw * 19) * p.K.shot;
    shot = true; p.st.sh++;
  } else { tx = B.x + ax * 25; tz = B.z + az * 25; ty = 2.5; vh = 14 + pw * 14; }   // despeje
  const v = ballistic(tx, ty, tz, vh);
  kickBall(p, v[0], v[1], v[2], { shot, pow: pw, k: 'shot', kt: 0.3 });
  p.anim = 'kick'; p.animT = 0.08; p.kickCD = 0.35;
}
function openness(q) { let m = 8; for (const o of M.players) if (o.team !== q.team && !o.gk) m = Math.min(m, hyp(o.x - q.x, o.z - q.z)); return m / 8; }
function choosePassTarget(p, ax, az, hasAim) {
  let best = null, bs = -1e9;
  for (const q of M.players) {
    if (q.team !== p.team || q === p || q.fallT > 0) continue;
    const dx = q.x - p.x, dz = q.z - p.z, d = hyp(dx, dz);
    if (d < 1.5) continue;
    const cos = (dx * ax + dz * az) / d;
    if (hasAim && cos < 0.45) continue;
    const sc = (hasAim ? cos * 2.2 : 0) - d / 35 + openness(q) * 0.5 + (q.callT > 0 ? 0.8 : 0) + (q.gk ? -1.2 : 0) + ((q.x - p.x) * atkSign(p.team)) / 30 + (!aiCtl(q) ? 0.15 : 0);
    if (sc > bs) { bs = sc; best = q; }
  }
  return best;
}
function passToPoint(p, tx, tz, loft, to = -1) {
  const acc = clamp(p.K.pass, 0.6, 1.3), d = hyp(tx - B.x, tz - B.z), e = (1.25 - acc) * (0.25 + d * 0.035);
  tx = clamp(tx + randn() * e, -F.HL + 0.8, F.HL - 0.8); tz = clamp(tz + randn() * e, -F.HW + 0.8, F.HW - 0.8);
  let v;
  if (loft) v = ballisticT(tx, 0.9, tz, 0.55 + d * 0.042);
  else { const sp = clamp(8 + d * 0.75, 9, 22); v = ballistic(tx, BR, tz, sp); v[1] = 0; }
  kickBall(p, v[0], v[1], v[2], { pass: 1, to, k: loft ? 'loft' : 'pass', pow: loft ? 0.5 : 0.3, kt: 0.3 });
  p.anim = 'pass'; p.animT = 0.05; p.kickCD = 0.25;
}
function passBallTo(p, q, loft) {
  let tx = q.x, tz = q.z;
  const lead = aiCtl(q) ? 0.6 : 0.85;
  for (let i = 0; i < 3; i++) {
    const d = hyp(tx - B.x, tz - B.z), t = loft ? 0.55 + d * 0.042 : (d / clamp(8 + d * 0.75, 9, 22)) * 1.15;
    tx = q.x + q.vx * t * lead; tz = q.z + q.vz * t * lead;
  }
  passToPoint(p, tx, tz, loft, q.id);
}
function doPass(p, ax, az, loft, hasAim) {
  const al = hyp(ax, az) || 1; ax /= al; az /= al;
  const q = choosePassTarget(p, ax, az, hasAim);
  if (q) passBallTo(p, q, loft);
  else { const L = loft ? 14 : 10; passToPoint(p, B.x + ax * L, B.z + az * L, loft, -1); }
}
function strikeReach(p, extra = 0) {
  if (B.owner >= 0 || p.kickCD > 0 || (B.kickBy === p.id && B.kickT > 0)) return null;
  const dh = hyp(B.x - p.x, B.z - p.z), h = B.y - p.y;
  return dh < 1.45 + extra && h < 2.5 ? { dh, h } : null;
}
// remate de primera: de cabeza, de volea, de chilena o a ras de suelo
function doStrike(p, kind, prm = {}) {
  const h = B.y - p.y, gx = atkX(p.team);
  const toG = Math.atan2(gx - p.x, -p.z), away = Math.abs(wrapA(toG - p.ry)) > 1.9;
  const tech = h > 1.45 ? 'header' : h > 0.55 ? (away && h > 0.75 ? 'chilena' : 'volley') : 'kick';
  if (kind === 'pass') {
    const ax = Number.isFinite(+prm.ax) && prm.ax !== undefined ? +prm.ax : Math.sin(p.ry), az = Number.isFinite(+prm.az) && prm.az !== undefined ? +prm.az : Math.cos(p.ry);
    const q = choosePassTarget(p, ax, az, !!prm.aim);
    if (q) passBallTo(p, q, h > 0.6); else passToPoint(p, B.x + ax * 10, B.z + az * 10, h > 0.6);
    if (h > 1.45) { p.anim = 'header'; p.animT = 0.05; if (p.y <= 0) p.vy = 4.5; }
    return;
  }
  const useAim = prm.aim && (+prm.ax || 0) * atkSign(p.team) > 0.15;
  const T = shotTarget(p, useAim ? +prm.ax : gx - p.x, useAim ? +prm.az : -p.z);
  if (!useAim) { const gk = M.players.find((q) => q.gk && q.team !== p.team); if (gk) T.tz = lerp(T.tz, (gk.z > 0 ? -1 : 1) * (GW / 2 - 0.6), aiCtl(p) ? 0.4 : 0.7); }   // de primera sin apuntar: al palo lejos del portero
  const d = hyp(gx - B.x, B.z);
  const hard = tech === 'chilena' ? 1.5 : tech === 'volley' ? 1.15 : tech === 'header' ? 1.1 : 1;
  const spread = (0.3 + d * 0.035) * (1.2 - p.K.aim) * hard;
  const tz = T.tz + randn() * spread;
  const ty = tech === 'header' ? 0.5 + Math.abs(randn()) * spread : 0.6 + Math.abs(randn()) * spread * 0.8 + (tech === 'chilena' ? 0.3 : 0);
  const vh = (tech === 'header' ? 17 : tech === 'kick' ? 22 : tech === 'chilena' ? 23 : 25) * p.K.shot;
  const v = ballistic(T.tx, ty, tz, vh);
  kickBall(p, v[0], v[1], v[2], { shot: 1, pow: 0.8, k: tech, kt: 0.3 });
  p.st.sh++;
  p.anim = tech; p.animT = tech === 'kick' ? 0.08 : 0.05; p.kickCD = 0.4;
  if (tech === 'header' && p.y <= 0) p.vy = 5;
  if (tech === 'chilena') { p.vy = 5.5; p.fallT = 1.5; }
  emit('strike', { id: p.id, k: tech });
}

// ---------- barridas y entradas ----------
function trip(q) {
  if (q.fallT > 0 || q.gk) return;
  if (owns(q)) { B.owner = -1; B.vx = q.vx * 0.6 + rand(-1.5, 1.5); B.vz = q.vz * 0.6 + rand(-1.5, 1.5); B.vy = 1.5; }
  q.fallT = 0.85; q.anim = 'lie'; q.animT = -0.35; q.slideT = 0; q.chargeT = -1; q.passHold = -1; q.skillT = 0;
  emit('trip', { id: q.id });
}
function slideHits() {
  for (const p of M.players) {
    if (p.slideT <= 0.06) continue;
    const kx = p.x + p.slideDx * 0.75, kz = p.z + p.slideDz * 0.75, o = owner();
    if (!p.slideHit && B.y < 0.8 && hyp(B.x - kx, B.z - kz) < 0.95 + (p.remote ? 0.35 : 0) && !(o && (o.team === p.team || (o.gk && B.held)))) {
      if (o && o.elusive > 0) { p.slideHit = true; emit('dodge', { id: o.id }); }
      else {
        B.owner = -1; B.held = false; B.vx = p.slideDx * 8 + rand(-2, 2); B.vz = p.slideDz * 8 + rand(-2, 2); B.vy = rand(1, 2.5);
        touch(p); B.kickBy = p.id; B.kickT = 0.35; B.shot = null; B.passBy = -1; p.slideHit = true;
        if (o) { p.st.tk++; if (Math.random() < 0.65) trip(o); else o.noTakeT = 0.5; }
        emit('tackle', { id: p.id, v: o ? o.id : -1, ok: 1, slide: 1 });
      }
    }
    for (const q of M.players) if (q.team !== p.team && !q.gk && q.fallT <= 0 && q.elusive <= 0 && q.slideT <= 0 && hyp(q.x - kx, q.z - kz) < 0.75) trip(q);
  }
}
function tackleHits() {
  for (const p of M.players) {
    if (p.tackleT <= 0 || p.tackleDone || p.tackleT > 0.3) continue;
    const o = owner();
    if (!o || o.team === p.team || (o.gk && B.held)) continue;
    const [fx, fz] = fwdOf(p);
    if (hyp(B.x - (p.x + fx * 0.7), B.z - (p.z + fz * 0.7)) > 1.25 + (p.remote ? 0.45 : 0)) continue;
    p.tackleDone = true;
    if (o.elusive > 0) { emit('dodge', { id: o.id }); p.tackleCD = 1.1; continue; }
    const [ofx, ofz] = fwdOf(o), front = -(ofx * fx + ofz * fz);
    const pr = clamp(0.5 + 0.25 * front, 0.25, 0.85) * p.K.tackle;
    if (Math.random() < pr) {
      p.st.tk++; o.noTakeT = 0.6;
      if (Math.random() < 0.6 && !p.remote) take(p, false);
      else { B.owner = -1; B.vx = fx * 5 + rand(-1.5, 1.5); B.vz = fz * 5 + rand(-1.5, 1.5); B.vy = 0.6; touch(p); B.kickBy = -1; }
      emit('tackle', { id: p.id, v: o.id, ok: 1 });
    } else emit('tackle', { id: p.id, ok: 0 });
  }
}

// ---------- el balón ----------
function take(p, chest) {
  B.owner = p.id; B.held = false; touch(p); B.vy = 0;
  if (B.passBy >= 0 && B.passBy !== p.id) { const q = M.players[B.passBy]; if (q && q.team === p.team) q.st.ps++; }
  B.passBy = -1; B.passTo = -1; B.shot = null; B.trail = 0; B.noGk = -1;
  if (chest) { p.anim = 'chest'; p.animT = 0; }
  emit('touch', { id: p.id, chest: chest ? 1 : 0 });
}
function attachBall(o, dt) {
  const [fx, fz] = fwdOf(o);
  if (o.gk && B.held) { B.x = o.x + fx * 0.36; B.z = o.z + fz * 0.36; B.y = o.y + (o.diveT > 0 || o.fallT > 0 ? 0.45 : 1.02); B.vx = o.vx; B.vz = o.vz; B.vy = 0; return; }
  const sp = hyp(o.vx, o.vz);
  o.drib += sp * dt * 1.7;
  const off = 0.5 + clamp((sp - 4) * 0.08, 0, 0.42) + Math.max(0, Math.sin(o.drib)) * 0.16;
  B.x = o.x + fx * off; B.z = o.z + fz * off; B.y = BR; B.vx = o.vx; B.vz = o.vz; B.vy = 0;
  B.x = clamp(B.x, -F.HL + BR, F.HL - BR); B.z = clamp(B.z, -F.HW + BR, F.HW - BR);
}
function ballStep(dt) {
  B.kickT -= dt; B.postT -= dt;
  const o = owner();
  if (o) { if (o.fallT > 0 && !o.gk) { B.owner = -1; } else { attachBall(o, dt); return; } }
  const V = VEN();
  B.vy -= G * dt;
  const dr = Math.exp(-DRAG * dt);
  B.vx *= dr; B.vz *= dr; B.vy *= dr;
  B.x += B.vx * dt; B.y += B.vy * dt; B.z += B.vz * dt;
  if (B.y < BR) {
    B.y = BR;
    if (B.vy < -1.6) { const v = -B.vy; B.vy = v * V.bounce; B.vx *= 0.93; B.vz *= 0.93; if (v > 3.5) emit('bounce', { v, x: B.x, z: B.z }); }
    else B.vy = 0;
  }
  if (B.y <= BR + 0.001 && B.vy === 0) {
    const sp = hyp(B.vx, B.vz);
    if (sp > 0) { const ns = Math.max(0, sp - (1.6 * V.fric + sp * 0.12) * dt); B.vx *= ns / sp; B.vz *= ns / sp; }
  }
  ballWalls();
  ballFrame();
  if (M.phase === 'play') { tryPickup(); goalCheck(); }
}
function wallHit(nx, nz, pen) {
  B.x += nx * pen; B.z += nz * pen;
  const vn = B.vx * nx + B.vz * nz;
  if (vn < 0) {
    const e = B.y < WALL_H ? 0.7 : 0.55;
    B.vx -= (1 + e) * vn * nx; B.vz -= (1 + e) * vn * nz;
    B.vx *= 0.93; B.vz *= 0.93;
    if (-vn > 5) emit('wall', { v: -vn, x: B.x, y: B.y, z: B.z, glass: B.y > WALL_H ? 1 : 0 });
  }
}
function ballWalls() {
  const { HL, HW } = F, r = BR;
  if (B.inGoal) {
    const s = B.inGoal;
    let hit = 0;
    if (B.x * s > HL + GD - r) { B.x = s * (HL + GD - r); if (B.vx * s > 0) { hit = Math.abs(B.vx); B.vx = -B.vx * 0.15; B.vz *= 0.5; B.vy *= 0.6; } }
    if (Math.abs(B.z) > GW / 2 - r) { const sz = Math.sign(B.z); B.z = sz * (GW / 2 - r); if (B.vz * sz > 0) { hit = Math.max(hit, Math.abs(B.vz)); B.vz = -B.vz * 0.15; B.vx *= 0.6; } }
    if (B.y > GH - r) { B.y = GH - r; if (B.vy > 0) { hit = Math.max(hit, B.vy); B.vy = -B.vy * 0.1; } }
    if (B.x * s < HL - r) B.inGoal = 0;
    if (hit > 3 && !B.netHit) { B.netHit = true; emit('net', { s, v: hit, z: B.z, y: B.y }); }
    return;
  }
  if (B.z > HW - r) wallHit(0, -1, B.z - (HW - r)); else if (B.z < -HW + r) wallHit(0, 1, -HW + r - B.z);
  const ax = Math.abs(B.x), sx = B.x < 0 ? -1 : 1;
  if (ax > HL - r) {
    if (Math.abs(B.z) < GW / 2 && B.y < GH) { if (ax > HL + r) { B.inGoal = sx; B.netHit = false; } }
    else wallHit(-sx, 0, ax - (HL - r));
  }
  const cx = Math.abs(B.x) - (HL - CR), cz = Math.abs(B.z) - (HW - CR);
  if (cx > 0 && cz > 0) {
    const d = (cx + cz - CR) / Math.SQRT2 + r;
    if (d > 0) wallHit(-(B.x < 0 ? -1 : 1) / Math.SQRT2, -(B.z < 0 ? -1 : 1) / Math.SQRT2, d);
  }
  if (B.y > CEIL) { B.y = CEIL; B.vy = -Math.abs(B.vy) * 0.5; }
}
// postes y travesaño
function ballFrame() {
  const R = 0.09 + BR;
  for (const s of [-1, 1]) {
    const px = s * F.HL;
    if (Math.abs(B.x - px) > 0.8) continue;
    if (B.y < GH + BR) for (const pz of [-GW / 2, GW / 2]) {
      const dx = B.x - px, dz = B.z - pz, d = hyp(dx, dz);
      if (d < R && d > 1e-4) {
        const nx = dx / d, nz = dz / d;
        B.x = px + nx * R; B.z = pz + nz * R;
        const vn = B.vx * nx + B.vz * nz;
        if (vn < 0) { B.vx -= 1.75 * vn * nx; B.vz -= 1.75 * vn * nz; if (-vn > 4 && B.postT <= 0) { B.postT = 0.3; emit('post', { x: B.x, y: B.y, z: B.z, v: -vn }); } }
      }
    }
    if (Math.abs(B.z) < GW / 2 + 0.05) {
      const dx = B.x - px, dy = B.y - GH, d = hyp(dx, dy);
      if (d < R && d > 1e-4) {
        const nx = dx / d, ny = dy / d;
        B.x = px + nx * R; B.y = GH + ny * R;
        const vn = B.vx * nx + B.vy * ny;
        if (vn < 0) { B.vx -= 1.75 * vn * nx; B.vy -= 1.75 * vn * ny; if (-vn > 4 && B.postT <= 0) { B.postT = 0.3; emit('post', { x: B.x, y: B.y, z: B.z, v: -vn, bar: 1 }); } }
      }
    }
  }
}
function tryPickup() {
  let best = null, bd = 1e9, save = false;
  for (const p of M.players) {
    if (p.noTakeT > 0 || (B.kickBy === p.id && B.kickT > 0) || p.fallT > 0 || p.slideT > 0) continue;
    const h = B.y - p.y;
    // el portero en su área ataja con las manos (y estirándose llega más lejos)
    if (p.gk && inOwnBox(p) && B.noGk !== p.id) {
      let d;
      if (p.diveT > 0) {
        const [fx, fz] = fwdOf(p), ux = B.x - p.x, uz = B.z - p.z, t = clamp(ux * fx + uz * fz, 0, 1.15);
        d = hyp(ux - fx * t, uz - fz * t, B.y - (p.y + 0.5)) - 0.15;
      } else {
        const [fx, fz] = fwdOf(p);
        d = hyp(B.x - (p.x + fx * 0.25), B.z - (p.z + fz * 0.25)) - (h > 0 && h < 2.35 ? 0.2 : -9);
      }
      if (d < 0.6 && d < bd) { bd = d; best = p; save = true; }
      continue;
    }
    if (p.diveT > 0) continue;
    const [fx, fz] = fwdOf(p), d = hyp(B.x - (p.x + fx * 0.3), B.z - (p.z + fz * 0.3));
    if (d > 0.8 + (p.remote ? 0.35 : 0) || h > 1.95) continue;
    if (d < bd) { bd = d; best = p; save = false; }
  }
  if (!best) return;
  const p = best, rv = hyp(B.vx - p.vx, B.vy, B.vz - p.vz);
  if (p.buf && !save) { const b = p.buf; p.buf = null; doStrike(p, b.kind, b.prm); return; }
  if (save) { gkSave(p, rv); return; }
  if (rv > 17 || (B.y - p.y > 0.8 && rv > 13)) { block(p); return; }
  take(p, B.y - p.y > 0.8);
}
function block(p) {
  B.vx = -B.vx * 0.3 + p.vx * 0.4 + rand(-2, 2); B.vz = -B.vz * 0.3 + p.vz * 0.4 + rand(-2, 2); B.vy = Math.abs(B.vy) * 0.3 + rand(1, 3);
  touch(p); B.kickBy = p.id; B.kickT = 0.2; B.shot = null; B.passBy = -1;
  emit('block', { id: p.id, x: B.x, y: B.y, z: B.z });
}
function gkSave(p, rv) {
  const fromOpp = B.shot && B.shot.team !== p.team;
  // los tiros muy fuertes a veces se cuelan
  if (fromOpp && rv > 17 && Math.random() < ((rv - 17) / 22) * (1.3 - p.K.gk)) { B.noGk = p.id; return; }
  const catchable = rv < 13 + 9 * p.K.gk && B.y - p.y < 2.2 && (p.diveT <= 0 || rv < 12);
  if (catchable) {
    B.owner = p.id; B.held = true; p.holdT = 0; p.holdMax = rand(0.9, 1.7); touch(p);
    B.passBy = -1; B.passTo = -1; B.trail = 0;
    if (p.diveT <= 0) { p.anim = 'catch'; p.animT = 0; }
    if (fromOpp) { p.st.sv++; emit('save', { id: p.id, catch: 1, dive: p.diveT > 0 ? 1 : 0 }); }
    else emit('catch', { id: p.id });
  } else {
    const s = atkSign(p.team), sp = Math.max(6, rv * 0.42);
    B.vx = s * rand(0.35, 0.9) * sp; B.vz = (B.z >= p.z ? 1 : -1) * rand(0.5, 1) * sp; B.vy = rand(2.5, 6);
    touch(p); B.kickBy = p.id; B.kickT = 0.35; B.passBy = -1; B.trail = 0;
    if (fromOpp) { p.st.sv++; emit('save', { id: p.id, parry: 1, dive: p.diveT > 0 ? 1 : 0 }); }
  }
  B.shot = null;
}
function gkDistribute(p, caller, kick) {
  let q = caller || bestPassTarget(p, true);
  B.held = false;
  if (kick || !q) { const s = atkSign(p.team); const v = ballisticT(clamp(p.x + s * 22, -F.HL + 3, F.HL - 3), BR, rand(-F.HW * 0.4, F.HW * 0.4), 1.6); kickBall(p, v[0], v[1], v[2], { k: 'loft', pow: 0.6 }); p.anim = 'kick'; p.animT = 0.08; return; }
  const d = hyp(q.x - p.x, q.z - p.z);
  passBallTo(p, q, d > 15);
  p.anim = 'throw'; p.animT = 0.1;
}
function goalCheck() {
  if (Math.abs(B.x) > F.HL + BR && Math.abs(B.z) < GW / 2 && B.y < GH) scoreGoal(B.x > 0 ? 0 : 1);
}
function scoreGoal(team) {
  M.score[team]++;
  const sc = M.players[B.lastTouch], own = !!(sc && sc.team !== team);
  let as = null;
  if (!own && B.prevTouch >= 0) { const q = M.players[B.prevTouch]; if (q && q.team === team && q !== sc && !q.gk) as = q; }
  if (sc && !own) sc.st.g++;
  if (as) as.st.a++;
  M.phase = 'goal'; M.phaseT = 3.4;
  M.lastGoal = { team, by: sc ? sc.id : -1, as: as ? as.id : -1, own, kind: B.lastKind, pow: B.pow };
  M.kickTeam = 1 - team;
  for (const p of M.players) {
    p.chargeT = -1; p.passHold = -1; p.buf = null;
    if (p.fallT > 0 || p.slideT > 0 || p.diveT > 0) continue;
    p.anim = p.team === team ? 'cheer' : 'sad'; p.animT = rand(0, 0.3);
  }
  B.shot = null;
  emit('goal', { team, by: M.lastGoal.by, as: M.lastGoal.as, own: own ? 1 : 0, k: B.lastKind, sc: M.score.slice(), golden: M.goldenOn ? 1 : 0 });
}
function afterGoal() {
  if (M.tut) { tutAfterGoal(); return; }
  if (M.goldenOn || (M.tut && M.tut.done)) { endMatch(); return; }
  if (M.time <= 0 && !M.goldenOn) { timeUp(); return; }
  startKickoff(false);
}
function timeUp() {
  if (M.score[0] !== M.score[1] || !M.golden || M.demo) { endMatch(); return; }
  M.goldenOn = true; M.goldenShown = false; M.time = 0;
  M.kickTeam = Math.random() < 0.5 ? 0 : 1;
  emit('golden');
  startKickoff(false);
}
function endMatch() {
  M.phase = 'end'; M.phaseT = 3.2;
  const w = M.score[0] > M.score[1] ? 0 : M.score[1] > M.score[0] ? 1 : -1;
  for (const p of M.players) { p.chargeT = -1; p.anim = w < 0 ? '' : p.team === w ? 'cheer' : 'sad'; p.animT = rand(0, 0.3); }
  emit('end', { w, sc: M.score.slice() });
}
function finishMatch() {
  M.ended = true;
  M.results = M.players.map((p) => ({ id: p.id, team: p.team, name: p.name, gk: p.gk, human: p.human, local: p.local, st: Object.assign({}, p.st) }));
  if (typeof onMatchEnd === 'function') onMatchEnd();
}

// ---------- inteligencia de la PC ----------
const BP = { t: -1, pts: [] };
function ballPath() {
  if (BP.t === M.clock) return BP.pts;
  BP.t = M.clock;
  const pts = BP.pts; pts.length = 0;
  const o = owner();
  if (o) { for (let i = 0; i <= 25; i++) pts.push([o.x + o.vx * i * 0.1, BR, o.z + o.vz * i * 0.1]); return pts; }
  const V = VEN(), h = 0.05;
  let x = B.x, y = B.y, z = B.z, vx = B.vx, vy = B.vy, vz = B.vz;
  pts.push([x, y, z]);
  for (let i = 1; i <= 50; i++) {
    vy -= G * h; x += vx * h; y += vy * h; z += vz * h;
    if (y < BR) { y = BR; vy = vy < -1.6 ? -vy * V.bounce : 0; }
    if (y <= BR + 0.001 && vy === 0) { const sp = hyp(vx, vz); if (sp > 0) { const ns = Math.max(0, sp - (1.6 * V.fric + sp * 0.12) * h); vx *= ns / sp; vz *= ns / sp; } }
    if (Math.abs(z) > F.HW - BR) { z = Math.sign(z) * (F.HW - BR); vz = -vz * 0.7; }
    if (Math.abs(x) > F.HL - BR && !(Math.abs(z) < GW / 2)) { x = Math.sign(x) * (F.HL - BR); vx = -vx * 0.7; }
    if (i % 2 === 0) pts.push([x, y, z]);
  }
  return pts;
}
function intercept(p) {
  const pts = ballPath(), sp = RUN * 1.15 * p.K.spd;
  for (let i = 0; i < pts.length; i++) { const q = pts[i]; if (q[1] < 1.9 && hyp(q[0] - p.x, q[2] - p.z) - 0.6 <= sp * i * 0.1) return { x: q[0], z: q[2], t: i * 0.1 }; }
  const q = pts[pts.length - 1];
  return { x: q[0], z: q[2], t: 2.5 };
}
function updateRoles() {
  const o = owner();
  for (const team of [0, 1]) {
    let best = null, bd = 1e9, hd = 1e9;
    for (const q of M.players) {
      if (q.team !== team || q.gk || q.fallT > 0) continue;
      const tx = o && o.team !== team ? o.x : intercept(q).x, tz = o && o.team !== team ? o.z : intercept(q).z;
      const d = hyp(tx - q.x, tz - q.z) * (q.slideT > 0 || q.tackleCD > 0.4 ? 1.4 : 1);
      if (!aiCtl(q)) hd = Math.min(hd, d);
      else if (d < bd) { bd = d; best = q; }
    }
    let chaser = best ? best.id : -1;
    if (o && o.team === team) chaser = -1;
    else if (!o && hd < bd && bd > 3 && hd < 8) chaser = -1;   // la persona va por el balón suelto: la PC no se amontona
    M.roles[team] = { chaser };
  }
}
function bestPassTarget(p, gk) {
  let best = null, bs = -1e9;
  const s = atkSign(p.team), gx = atkX(p.team), myG = hyp(gx - p.x, p.z);
  for (const q of M.players) {
    if (q.team !== p.team || q === p || q.gk || q.fallT > 0) continue;
    const d = hyp(q.x - p.x, q.z - p.z);
    if (d < 3 || d > 30) continue;
    const prog = (myG - hyp(gx - q.x, q.z)) / F.L;
    const lane = laneOpen(p, q) ? 1 : 0.25;
    const sc = prog * 1.3 + openness(q) * 0.7 + lane * 0.45 + (!aiCtl(q) ? 0.2 : 0) + (q.callT > 0 ? 0.6 : 0) - (gk ? 0 : d > 22 ? 0.3 : 0);
    if (sc > bs) { bs = sc; best = q; }
  }
  if (best) best.passScore = bs;
  return best;
}
function laneOpen(p, q) {
  const dx = q.x - p.x, dz = q.z - p.z, L2 = dx * dx + dz * dz;
  for (const o of M.players) {
    if (o.team === p.team) continue;
    const t = clamp(((o.x - p.x) * dx + (o.z - p.z) * dz) / L2, 0, 1);
    if (hyp(p.x + dx * t - o.x, p.z + dz * t - o.z) < 1.2 && t > 0.08 && t < 0.95) return false;
  }
  return true;
}
function aiThink(p, dt) {
  if (p.tutCtl) { tutAI(p, dt); return; }
  const ai = p.ai;
  ai.t -= dt;
  if (busy(p)) return;
  if (ai.t <= 0) { ai.t = p.K.think * rand(0.6, 1.1); aiDecide(p); }
  if (owns(p)) aiSteerCarry(p);
  const dx = ai.tx - p.x, dz = ai.tz - p.z, d = hyp(dx, dz);
  const k = d < 0.35 ? 0 : clamp(d / 2.2, 0.25, 1);
  p.want.mx = d > 0.01 ? (dx / d) * k : 0; p.want.mz = d > 0.01 ? (dz / d) * k : 0;
  p.want.sprint = ai.sprint && d > 2.5 && p.stam > 0.3;
  p.face = ai.face;
  aiReact(p, dt);
}
function aiDecide(p) {
  const o = owner(), ai = p.ai;
  ai.face = null; ai.sprint = false;
  if (o === p) { aiCarry(p); return; }
  const mine = o && o.team === p.team, theirs = o && o.team !== p.team;
  if (M.roles[p.team].chaser === p.id) {
    if (theirs && o.gk && B.held) { const s = atkSign(p.team); ai.tx = o.x - s * 6; ai.tz = o.z * 0.5; }
    else if (theirs) {
      const gx = goalX(p.team), dx = gx - o.x, dz = -o.z, dl = hyp(dx, dz) || 1;
      ai.tx = o.x + (dx / dl) * 0.9 + o.vx * 0.25; ai.tz = o.z + (dz / dl) * 0.9 + o.vz * 0.25;
      ai.sprint = hyp(o.x - p.x, o.z - p.z) > 2.5 && Math.random() < p.K.press;
    } else { const ip = intercept(p); ai.tx = ip.x; ai.tz = ip.z; ai.sprint = true; }
    return;
  }
  if (B.passTo === p.id && B.owner < 0) { const ip = intercept(p); ai.tx = ip.x; ai.tz = ip.z; ai.sprint = true; return; }
  const sp = mine ? supportSpot(p, o) : defendSpot(p);
  ai.tx = sp[0]; ai.tz = sp[1];
  ai.sprint = hyp(sp[0] - p.x, sp[1] - p.z) > 6;
  ai.face = Math.atan2(B.x - p.x, B.z - p.z);
}
function aiSlot(p) {
  const mates = M.players.filter((q) => q.team === p.team && !q.gk && aiCtl(q) && q.id !== M.roles[p.team].chaser && !owns(q));
  return Math.max(0, mates.indexOf(p));
}
function supportSpot(p, o) {
  const s = atkSign(p.team), k = aiSlot(p), bz = o.z || 0.01, side = Math.sign(bz);
  const slots = [[o.x + s * 8, -side * F.HW * 0.45], [o.x - s * 5, bz * 0.3 - side * 4], [o.x + s * 3.5, side * F.HW * 0.7]];
  let [x, z] = slots[k % 3];
  x = clamp(x, -F.HL + 3, F.HL - 3); z = clamp(z, -F.HW + 1.5, F.HW - 1.5);
  for (const q of M.players) {
    if (q.team === p.team || q.gk) continue;
    const dx = x - q.x, dz = z - q.z, d = hyp(dx, dz);
    if (d < 3 && d > 0.01) { x += (dx / d) * (3 - d); z += (dz / d) * (3 - d); }
  }
  const dx = x - o.x, dz = z - o.z, d = hyp(dx, dz);
  if (d < 4.5 && d > 0.01) { x = o.x + (dx / d) * 4.5; z = o.z + (dz / d) * 4.5; }
  return [clamp(x, -F.HL + 2, F.HL - 2), clamp(z, -F.HW + 1.2, F.HW - 1.2)];
}
function defendSpot(p) {
  const gx = goalX(p.team), k = aiSlot(p);
  if (k === 0) return [lerp(gx, B.x, 0.45), B.z * 0.45];
  const o = owner();
  const opps = M.players.filter((q) => q.team !== p.team && !q.gk && q !== o).sort((a, b) => hyp(a.x - gx, a.z) - hyp(b.x - gx, b.z));
  const m = opps[k - 1];
  if (m) { const dx = gx - m.x, dz = -m.z, dl = hyp(dx, dz) || 1; return [m.x + (dx / dl) * 1.7, m.z + (dz / dl) * 1.7]; }
  return [lerp(gx, B.x, 0.7), -B.z * 0.5];
}
function aiCarry(p) {
  const ai = p.ai, s = atkSign(p.team), gx = atkX(p.team);
  const dG = hyp(gx - p.x, p.z);
  let pressD = 99;
  for (const q of M.players) if (q.team !== p.team && !q.gk) pressD = Math.min(pressD, hyp(q.x - p.x, q.z - p.z));
  const caller = M.players.find((q) => q.team === p.team && q !== p && q.callT > 0 && !aiCtl(q));
  if (caller && hyp(caller.x - p.x, caller.z - p.z) > 2.5) { passBallTo(p, caller, !laneOpen(p, caller)); return; }
  const angOK = Math.abs(p.z) < F.HW * 0.55 || dG < 9;
  if (angOK && dG < 8 + p.K.aim * 8 && (shotClear(p) || dG < 6) && Math.random() < 0.7) { doShoot(p, clamp(0.25 + dG / 20, 0.3, 0.95), (gx - p.x) / dG, -p.z / dG); return; }
  const best = bestPassTarget(p);
  const myScore = openness(p) * 0.7 - dG / F.L;
  if (best && ((pressD < 2.2 && Math.random() < 0.65) || (best.passScore > myScore + 0.55 && Math.random() < 0.4))) {
    passBallTo(p, best, !laneOpen(p, best) && hyp(best.x - p.x, best.z - p.z) > 7); return;
  }
  if (pressD < 1.9 && p.skillCD <= 0 && Math.random() < 0.18 + M.diff * 0.12) performAct(p, 'skill', { side: Math.random() < 0.5 ? -1 : 1 });
  ai.sprint = pressD > 3 && p.stam > 0.4;
}
function shotClear(p) {
  const gx = atkX(p.team);
  for (const q of M.players) {
    if (q.team === p.team || q.gk) continue;
    const dx = gx - p.x, dz = -p.z, L2 = dx * dx + dz * dz, t = ((q.x - p.x) * dx + (q.z - p.z) * dz) / L2;
    if (t > 0 && t < 1 && hyp(p.x + dx * t - q.x, p.z + dz * t - q.z) < 1) return false;
  }
  return true;
}
// conducir: hacia el arco, esquivando rivales
function aiSteerCarry(p) {
  const s = atkSign(p.team), gx = atkX(p.team);
  let dx = gx - s * 1.5 - p.x, dz = -p.z * 0.8;
  const dl = hyp(dx, dz) || 1; dx /= dl; dz /= dl;
  for (const q of M.players) {
    if (q.team === p.team) continue;
    const ox = q.x - p.x, oz = q.z - p.z, d = hyp(ox, oz);
    if (d > 5 || d < 0.01) continue;
    if ((ox * dx + oz * dz) / d < -0.2) continue;
    const w = (5 - d) / 5, lat = -dz * ox + dx * oz;
    const sg = lat > 0 ? -1 : 1;
    const px = -dz, pz = dx;
    dx += px * sg * w * 1.4; dz += pz * sg * w * 1.4;
  }
  if (Math.abs(p.z) > F.HW - 2.5) dz -= Math.sign(p.z) * 0.6;
  const l = hyp(dx, dz) || 1;
  p.ai.tx = p.x + (dx / l) * 5; p.ai.tz = p.z + (dz / l) * 5;
}
function aiReact(p, dt) {
  const o = owner();
  if (o && o.team !== p.team && !(o.gk && B.held)) {
    const d = hyp(o.x - p.x, o.z - p.z);
    if (d < 1.6 && p.tackleCD <= 0 && Math.random() < dt * 3 * p.K.tackle) performAct(p, 'tackle', {});
    else if (d > 1.8 && d < 3.3 && p.slideCD <= 0 && o.elusive <= 0 && Math.random() < dt * 0.8 * p.K.tackle) {
      const tx = B.x + B.vx * 0.3 - p.x, tz = B.z + B.vz * 0.3 - p.z, l = hyp(tx, tz) || 1;
      const [fx, fz] = fwdOf(p);
      if ((tx * fx + tz * fz) / l > 0.6) performAct(p, 'slide', { ax: tx / l, az: tz / l });
    }
  }
  if (B.owner < 0 && p.kickCD <= 0) {
    const r = strikeReach(p);
    if (r && B.y - p.y > 0.7 && hyp(B.vx, B.vz) > 3) {
      const dG = hyp(atkX(p.team) - p.x, p.z), dOwn = hyp(goalX(p.team) - p.x, p.z);
      const away = Math.abs(wrapA(Math.atan2(atkX(p.team) - p.x, -p.z) - p.ry)) > 1.9, hh = B.y - p.y;
      if (away && hh > 0.75 && hh < 1.45 && Math.random() < 0.75) { p.kickCD = 0.45; return; }   // la chilena de la PC es rara
      if (dG < 18 && Math.random() < 0.3 + p.K.aim * 0.35) doStrike(p, 'shoot');
      else if (dOwn < 12 || Math.random() < 0.4) doStrike(p, 'pass', { ax: atkSign(p.team), az: 0 });
      p.kickCD = Math.max(p.kickCD, 0.25);
    }
  }
}
function gkThink(p, dt) {
  if (p.tutCtl) { p.want.mx = p.want.mz = 0; p.face = Math.atan2(B.x - p.x, B.z - p.z); return; }
  const s = p.team === 0 ? -1 : 1, gx = s * F.HL;
  p.face = Math.atan2(B.x - p.x, B.z - p.z);
  p.want.sprint = false;
  if (busy(p)) return;
  if (owns(p)) {
    p.holdT += dt; p.want.mx = p.want.mz = 0;
    if (!ACT[p.anim] || p.anim === 'call') { p.anim = 'hold'; p.animT = 0.2; }
    const caller = M.players.find((q) => q.team === p.team && q.callT > 0 && !aiCtl(q));
    if ((caller && p.holdT > 0.45) || p.holdT > p.holdMax) gkDistribute(p, caller);
    return;
  }
  if (p.anim === 'hold') p.anim = '';
  const loose = B.owner < 0, vxIn = B.vx * s;
  if (loose && vxIn > 5) {
    const t = (p.x - B.x) / B.vx;
    if (t > 0 && t < 1.6) {
      const zp = B.z + B.vz * t, yp = Math.max(BR, B.y + B.vy * t - 0.5 * G * t * t);
      if (Math.abs(zp) < GW / 2 + 0.7 && yp < GH + 0.5) {
        p.react += dt;
        if (p.react >= p.K.react) {
          const lat = clamp(zp, -GW / 2 - 0.3, GW / 2 + 0.3) - p.z;
          if (Math.abs(lat) > 0.75 && t < 0.6) {
            const dv = clamp(lat / Math.max(0.25, t), -7.5, 7.5) * clamp(p.K.gk, 0.6, 1.1);
            p.diveT = 0.62; p.dvx = 0; p.dvz = dv; p.vy = clamp((yp - 0.7) * 3.2, 0, 6.5);
            p.ry = dv > 0 ? 0 : Math.PI; p.anim = 'dive'; p.animT = 0;
            emit('dive', { id: p.id });
            return;
          }
          p.want.mx = 0; p.want.mz = clamp(lat * 3, -1, 1); p.want.sprint = true;
          return;
        }
      }
    }
  } else p.react = 0;
  const bx = B.x, bz = B.z, dist = hyp(bx - gx, bz);
  if (loose && Math.abs(bx - gx) < F.BOXD && Math.abs(bz) < F.BOXW && B.y < 2 && hyp(B.vx, B.vz) < 14) {
    const myD = hyp(bx - p.x, bz - p.z);
    let closest = true;
    for (const q of M.players) if (q.team !== p.team && hyp(bx - q.x, bz - q.z) < myD * 0.8) closest = false;
    if (closest) { const ip = intercept(p); goTo(p, ip.x, ip.z, true); return; }
  }
  const o = owner();
  let k = clamp(0.9 + dist * 0.05, 0.9, 2.6);
  if (o && o.team !== p.team && dist < 9) k = clamp(dist * 0.35, 1.2, 3.6);
  const dx = bx - gx, dz = bz, dl = hyp(dx, dz) || 1;
  let tx = gx + (dx / dl) * k;
  const tz = clamp((dz / dl) * k * 1.4, -GW / 2 * 0.8, GW / 2 * 0.8);
  if ((tx - gx) * -s < 0.5) tx = gx - s * 0.5;
  goTo(p, tx, tz, false);
}
function goTo(p, tx, tz, spr) {
  const dx = tx - p.x, dz = tz - p.z, d = hyp(dx, dz), k = d < 0.25 ? 0 : clamp(d / 1.5, 0.2, 1);
  p.want.mx = d > 0.01 ? (dx / d) * k : 0; p.want.mz = d > 0.01 ? (dz / d) * k : 0; p.want.sprint = spr && d > 2;
}


// =========================================================
//  JUEGO: controles, cámara, dibujo, repeticiones, HUD y eventos
// =========================================================
const GAME = { mode: 'menu', screen: 'scrMenu', paused: false };
const KEYS = {};
const INPUT = { joyX: 0, joyY: 0, tShoot: false, tPass: false, tSkill: false, tSprint: false, sprintLatch: false, mL: false, mR: false, gpPrev: [] };
const inMatch = () => M.on && GAME.mode !== 'menu' && !GAME.paused && GAME.screen !== 'scrEnd';
function press(k) {
  if (M.phase === 'replay') { skipReplay(); return; }
  if (k === 'shoot') LOCAL.shootP = true; else if (k === 'pass') LOCAL.passP = true; else if (k === 'skill') LOCAL.skillP = true; else if (k === 'call') LOCAL.callP = true;
}
addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  SFX.resume();
  const c = e.code;
  if (!KEYS[c]) {
    if (inMatch()) {
      if (c === 'KeyJ' || c === 'KeyZ') press('shoot');
      if (c === 'KeyK' || c === 'KeyX') press('pass');
      if (c === 'KeyL' || c === 'Space') press('skill');
      if (c === 'KeyE' || c === 'KeyQ') press('call');
    }
    if ((c === 'Escape' || c === 'KeyP') && M.on && GAME.mode !== 'menu' && GAME.screen !== 'scrEnd') togglePause();
    if (c === 'KeyC' && M.on && GAME.mode !== 'menu') cycleCam();
    if (c === 'KeyF') toggleFullscreen();
    if (c === 'KeyM') toggleMute();
  }
  KEYS[c] = true;
  if (inMatch() && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) e.preventDefault();
});
addEventListener('keyup', (e) => { KEYS[e.code] = false; });
addEventListener('blur', () => { for (const k in KEYS) KEYS[k] = false; INPUT.mL = INPUT.mR = false; });
canvas.addEventListener('mousedown', (e) => {
  SFX.resume();
  if (!inMatch() || IS_TOUCH) return;
  if (e.button === 0) { INPUT.mL = true; press('shoot'); } else if (e.button === 2) { INPUT.mR = true; press('pass'); }
});
addEventListener('mouseup', (e) => { if (e.button === 0) INPUT.mL = false; else if (e.button === 2) INPUT.mR = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// táctil: joystick que aparece donde pones el dedo + 4 botones
const JOY = { id: null, cx: 0, cy: 0 };
{
  const jz = $('#joyZone'), jb = $('#joy'), jk = $('#joyKnob');
  const move = (e) => {
    let dx = e.clientX - JOY.cx, dy = e.clientY - JOY.cy;
    const R = 55, d = hyp(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    jk.style.transform = `translate(${dx}px,${dy}px)`;
    INPUT.joyX = dx / R; INPUT.joyY = -dy / R;
  };
  jz.addEventListener('pointerdown', (e) => {
    SFX.resume();
    if (M.phase === 'replay') { skipReplay(); return; }
    if (JOY.id !== null) return;
    JOY.id = e.pointerId; try { jz.setPointerCapture(e.pointerId); } catch (er) { /* ignorar */ }
    JOY.cx = e.clientX; JOY.cy = e.clientY;
    jb.style.left = e.clientX - 65 + 'px'; jb.style.top = e.clientY - 65 + 'px'; jb.style.bottom = 'auto';
    move(e);
  });
  jz.addEventListener('pointermove', (e) => { if (e.pointerId === JOY.id) move(e); });
  const end = (e) => { if (e.pointerId !== JOY.id) return; JOY.id = null; INPUT.joyX = INPUT.joyY = 0; jk.style.transform = ''; jb.style.left = jb.style.top = jb.style.bottom = ''; };
  jz.addEventListener('pointerup', end); jz.addEventListener('pointercancel', end);
  const tb = (sel, key, edge) => {
    const el = $(sel);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); SFX.resume();
      try { el.setPointerCapture(e.pointerId); } catch (er) { /* ignorar */ }
      el.classList.add('down');
      if (key === 'tSprint' && SAVE.sprintToggle) INPUT.sprintLatch = !INPUT.sprintLatch; else INPUT[key] = true;
      if (edge) press(edge);
      buzz(10);
    });
    const up = () => { el.classList.remove('down'); INPUT[key] = false; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  tb('#tbShoot', 'tShoot', 'shoot'); tb('#tbPass', 'tPass', 'pass'); tb('#tbSkill', 'tSkill', 'skill'); tb('#tbSprint', 'tSprint', null);
}
function buzz(p) { if (IS_TOUCH && SAVE.vib !== false && navigator.vibrate && !(navigator.userActivation && !navigator.userActivation.hasBeenActive)) try { navigator.vibrate(p); } catch (e) { /* sin vibración */ } }
const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
function readInput() {
  let ix = 0, iy = 0, gS = false, gSh = false, gPa = false;
  if (KEYS.KeyA || KEYS.ArrowLeft) ix -= 1;
  if (KEYS.KeyD || KEYS.ArrowRight) ix += 1;
  if (KEYS.KeyW || KEYS.ArrowUp) iy += 1;
  if (KEYS.KeyS || KEYS.ArrowDown) iy -= 1;
  ix += INPUT.joyX; iy += INPUT.joyY;
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of gps) {
    if (!gp || !gp.connected) continue;
    ix += dz(gp.axes[0] || 0); iy -= dz(gp.axes[1] || 0);
    const b = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4));
    const prev = INPUT.gpPrev, edge = (i) => b(i) && !prev[i];
    if (b(12)) iy += 1; if (b(13)) iy -= 1; if (b(14)) ix -= 1; if (b(15)) ix += 1;
    if (inMatch()) { if (edge(0)) press('pass'); if (edge(1)) press('shoot'); if (edge(2)) press('skill'); if (edge(4)) press('call'); }
    if (edge(3) && M.on && GAME.mode !== 'menu') cycleCam();
    if (edge(9) && M.on && GAME.mode !== 'menu' && GAME.screen !== 'scrEnd') togglePause();
    gS = b(5) || b(6) || b(7); gSh = b(1); gPa = b(0);
    INPUT.gpPrev = gp.buttons.map((x) => x.pressed || x.value > 0.4);
    break;
  }
  const m = hyp(ix, iy);
  if (m > 1) { ix /= m; iy /= m; }
  const [fx, fz] = CAM.fwd, rx = -fz, rz = fx;
  LOCAL.mx = rx * ix + fx * iy; LOCAL.mz = rz * ix + fz * iy;
  LOCAL.sprint = !!(KEYS.ShiftLeft || KEYS.ShiftRight || INPUT.tSprint || INPUT.sprintLatch || gS);
  LOCAL.shoot = !!(KEYS.KeyJ || KEYS.KeyZ || INPUT.mL || INPUT.tShoot || gSh);
  LOCAL.pass = !!(KEYS.KeyK || KEYS.KeyX || INPUT.mR || INPUT.tPass || gPa);
  if (m > 0.2 || LOCAL.shoot || LOCAL.pass) HUD.idleT = 0;
}

// ---------- balón dibujado (en el invitado viene interpolado del anfitrión) ----------
const RB = { x: 0, y: BR, z: 0, vx: 0, vy: 0, vz: 0, owner: -1, trail: 0 };
const BALL_TEX = canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1d2340';
  const pts = [[0.5, 0.5], [0, 0.5], [0.25, 0.18], [0.75, 0.18], [0.25, 0.82], [0.75, 0.82], [1, 0.5], [0.5, 0.02], [0.5, 0.98], [0.125, 0.5], [0.375, 0.5], [0.625, 0.5], [0.875, 0.5]];
  pts.forEach(([u, v], i) => {
    const r = i > 8 ? 9 : 15;
    g.beginPath();
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; g.lineTo(u * w + Math.cos(a) * r * (i > 6 && i < 9 ? 3 : 1.2), v * h + Math.sin(a) * r); }
    g.closePath(); g.fill();
  });
});
const ballMesh = outline(mesh(new THREE.SphereGeometry(BR, 20, 14), new THREE.MeshToonMaterial({ map: BALL_TEX, gradientMap: toonGrad })), 1.1);
scene.add(ballMesh);
const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(BR * 1.3, 18), new THREE.MeshBasicMaterial({ color: 0x1d2340, transparent: true, opacity: 0.4, depthWrite: false }));
ballShadow.rotation.x = -Math.PI / 2; scene.add(ballShadow);
const landRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 28), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.7, depthWrite: false }));
landRing.rotation.x = -Math.PI / 2; landRing.visible = false; scene.add(landRing);
const meArrow = outline(mesh(new THREE.ConeGeometry(0.2, 0.36, 4), toon('#ffe14d', { emissive: 0x6b5a00 }), false), 1.15);
meArrow.rotation.x = Math.PI; meArrow.visible = false; scene.add(meArrow);
const _ax = new THREE.Vector3(), _bq = new THREE.Quaternion();
let trailT = 0;
function syncRB() { RB.x = B.x; RB.y = B.y; RB.z = B.z; RB.vx = B.vx; RB.vy = B.vy; RB.vz = B.vz; RB.owner = B.owner; RB.trail = B.trail; }
function renderBall(dt) {
  let x = RB.x, y = RB.y, z = RB.z;
  if (RP.on) { x = RP.ball.x; y = RP.ball.y; z = RP.ball.z; }
  const px = ballMesh.position.x, pz = ballMesh.position.z;
  ballMesh.position.set(x, y, z);
  const mx = x - px, mz = z - pz, d = hyp(mx, mz);
  if (d > 1e-4 && d < 3) { _ax.set(mz / d, 0, -mx / d); _bq.setFromAxisAngle(_ax, d / BR); ballMesh.quaternion.premultiply(_bq); }
  ballShadow.position.set(x, 0.015, z);
  ballShadow.scale.setScalar(clamp(1.3 - y * 0.12, 0.5, 1.3));
  ballShadow.material.opacity = clamp(0.45 - y * 0.03, 0.12, 0.45);
  // dónde va a caer el balón alto
  landRing.visible = false;
  if (!RP.on && RB.owner < 0 && y > 1.6 && M.phase === 'play') {
    const vy = RB.vy, t = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * G * (y - BR)))) / G;
    if (t > 0.15 && t < 3) {
      const k = (1 - Math.exp(-DRAG * t)) / DRAG;
      landRing.position.set(clamp(x + RB.vx * k, -F.HL, F.HL), 0.03, clamp(z + RB.vz * k, -F.HW, F.HW));
      landRing.visible = true; landRing.scale.setScalar(0.8 + Math.sin(performance.now() / 120) * 0.08 + t * 0.15);
    }
  }
  // estela de los cañonazos
  const sp = hyp(RB.vx, RB.vy, RB.vz);
  if (RB.trail && sp > 14 && RB.owner < 0 && !RP.on) {
    trailT -= dt;
    if (trailT <= 0) {
      trailT = 0.016;
      const k = M.players[B.kickBy >= 0 ? B.kickBy : 0], tc = k && k.look.trail !== 'none' ? k.look.trail : null;
      if (tc) { const c = tc === 'rainbow' ? pick(['#ff4f4f', '#ffc93a', '#2fd27a', '#3a7bff', '#c06bff']) : tc; SPARKS.spawn(x, y, z, rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.35, 0.16, c, { drag: 3 }); }
      else SMOKE.spawn(x, y, z, 0, 0, 0, 0.28, 0.22, 0xffffff, { grow: 0.6 });
    }
  }
}

// ---------- repeticiones ----------
const RP = { buf: [], acc: 0, goalIdx: -1, on: false, t: 0, i0: 0, i1: 0, st: [], ball: { x: 0, y: 0, z: 0 }, ang: 0 };
function recordFrame(dt) {
  if (RP.on || !M.on || M.demo || M.tut) return;
  if (M.phase !== 'play' && M.phase !== 'goal') return;
  RP.acc += dt;
  if (RP.acc < 1 / 30) return;
  RP.acc = 0;
  RP.buf.push({ b: [RB.x, RB.y, RB.z], p: M.players.map((p) => [p.x, p.y, p.z, p.ry, ANIM_I[p.anim] || 0, p.animT]) });
  if (RP.buf.length > 260) { RP.buf.shift(); RP.goalIdx--; }
}
function startReplay() {
  if (RP.goalIdx < 10 || !RP.buf.length) { RP.on = false; return; }
  RP.on = true; RP.t = 0;
  RP.i0 = Math.max(0, RP.goalIdx - 100); RP.i1 = Math.min(RP.buf.length - 1, RP.goalIdx + 14);
  RP.ang = rand(-0.6, 0.6);
  for (const p of M.players) if (p.ch) { p.ch.snapYaw = true; p.ch.px = undefined; }
  $('#replayTag').style.display = 'block';
  $('#replaySkip').textContent = M.net === 'off' ? (IS_TOUCH ? 'Toca para saltar' : 'Pulsa cualquier botón para saltar') : '';
  document.body.classList.add('bars');
}
function endReplay() {
  RP.on = false; RP.buf.length = 0; RP.goalIdx = -1;
  for (const p of M.players) if (p.ch) { p.ch.snapYaw = true; p.ch.px = undefined; }
  $('#replayTag').style.display = 'none';
  document.body.classList.remove('bars');
}
function skipReplay() { if (M.phase === 'replay' && M.net === 'off') M.phaseT = 0; }
function replayFrame(dt) {
  RP.t += dt;
  const f = RP.i0 + clamp(RP.t / (REPLAY_T - 0.2), 0, 1) * (RP.i1 - RP.i0);
  const a = RP.buf[Math.floor(f)], b = RP.buf[Math.min(RP.buf.length - 1, Math.floor(f) + 1)], k = f - Math.floor(f);
  if (!a) return;
  RP.ball.x = lerp(a.b[0], b.b[0], k); RP.ball.y = lerp(a.b[1], b.b[1], k); RP.ball.z = lerp(a.b[2], b.b[2], k);
  M.players.forEach((p, i) => {
    const A = a.p[i], Bq = b.p[i];
    if (!A) return;
    RP.st[i] = { x: lerp(A[0], Bq[0], k), y: lerp(A[1], Bq[1], k), z: lerp(A[2], Bq[2], k), ry: A[3] + wrapA(Bq[3] - A[3]) * k, anim: ANIMS[A[4]] || '', animT: lerp(A[5], A[4] === Bq[4] ? Bq[5] : A[5], k) };
  });
}

// ---------- cámara ----------
const CAM_MODES = [{ n: 'Equipo' }, { n: 'Detrás' }, { n: 'TV' }];
const CAM = { pos: new THREE.Vector3(0, 20, 30), look: new THREE.Vector3(), mode: clamp(SAVE.cam | 0, 0, 2), shake: 0, fwd: [1, 0], yaw: 0, t: 0, snap: true };
function cycleCam() {
  CAM.mode = (CAM.mode + 1) % CAM_MODES.length;
  SAVE.cam = CAM.mode; storeSave(); syncPauseBtns(); SFX.ui();
  hint('🎥 Cámara: ' + CAM_MODES[CAM.mode].n, 1.5);
  CAM.snap = true;
}
const _cp = new THREE.Vector3(), _cl = new THREE.Vector3(), _cd = new THREE.Vector3();
function updateCamera(dt) {
  CAM.t += dt;
  const me = M.players[M.me];
  const bx = RP.on ? RP.ball.x : RB.x, by = RP.on ? RP.ball.y : RB.y, bz = RP.on ? RP.ball.z : RB.z;
  let k = 4.5;
  if (!M.on || !F) { _cp.set(0, 20, 30); _cl.set(0, 0, 0); }
  else if (GAME.mode === 'menu' || M.demo) {
    const a = CAM.t * 0.06;
    _cp.set(Math.sin(a) * (F.HL + 14), 13 + Math.sin(a * 0.7) * 2, Math.cos(a) * (F.HW + 16)); _cl.set(bx * 0.4, 0, bz * 0.4); k = 2;
  } else if (RP.on) {
    const gx = M.lastGoal ? atkX(M.lastGoal.team) : F.HL, s = Math.sign(gx) || 1;
    const a = RP.ang + RP.t * 0.12 * s;
    _cp.set(bx - s * 6 * Math.cos(a) + s * 1, 2.4 + by * 0.3, bz + 7 * Math.sin(a + 1.2)); _cl.set(bx, by * 0.6 + 0.4, bz); k = 6;
  } else if (M.phase === 'intro') {
    const t = clamp(1 - M.phaseT / 2.4, 0, 1), a = -1.2 + t * 1.4;
    _cp.set(Math.sin(a) * F.HL * 0.9, 9 - t * 3, Math.cos(a) * (F.HW + 10)); _cl.set(0, 0.5, 0); k = 3;
  } else if (!me || CAM.mode === 2 || M.phase === 'end') {
    const fx = me ? lerp(me.x, bx, 0.6) : bx;
    _cp.set(fx * 0.85, 14 + F.W * 0.18, F.HW + 12 + F.W * 0.2); _cl.set(fx * 0.85, 0, bz * 0.25); k = 3.5;
    if (M.phase === 'end' && me) { _cp.set(me.x + 4, 3.2, me.z + 6); _cl.set(me.x, 1, me.z); k = 2; }
  } else if (CAM.mode === 1) {
    // detrás del jugador, mirando al balón (o al arco si lo llevas)
    let ty;
    if (owns(me) || hyp(bx - me.x, bz - me.z) < 2.2) { const ag = Math.atan2(atkX(me.team) - me.x, -me.z * 0.3); ty = me.ry + wrapA(ag - me.ry) * 0.4; }
    else ty = Math.atan2(bx - me.x, bz - me.z);
    if (CAM.snap) CAM.yaw = ty;
    CAM.yaw = angDamp(CAM.yaw, ty, 3, dt);
    const fx = Math.sin(CAM.yaw), fz = Math.cos(CAM.yaw);
    _cp.set(me.x - fx * 6.5, 3.4, me.z - fz * 6.5); _cl.set(me.x + fx * 4, 1.1, me.z + fz * 4); k = 7;
  } else {
    // cámara de equipo: detrás de ti y del balón, mirando siempre hacia el arco rival
    const s = atkSign(me.team);
    const pu = me.x * s, pv = me.z * s, bu = bx * s, bv = bz * s;
    const rear = Math.min(pu, bu + 2), front = Math.max(pu, bu), spread = front - rear;
    const cu = rear - (8.5 + spread * 0.14), ch = 5.6 + spread * 0.24 + Math.abs(pv - bv) * 0.1 + by * 0.15;
    const cv = lerp(pv, bv, 0.3) * 0.75, lu = lerp(rear, front, 0.5) + 2.5, lv = lerp(pv, bv, 0.42);
    _cp.set(cu * s, ch, cv * s); _cl.set(lu * s, 0.6, lv * s); k = 5;
  }
  if (CAM.snap) { CAM.pos.copy(_cp); CAM.look.copy(_cl); CAM.snap = false; }
  else { const kk = 1 - Math.exp(-k * dt); CAM.pos.lerp(_cp, kk); CAM.look.lerp(_cl, kk); }
  camera.position.copy(CAM.pos);
  CAM.shake = Math.max(0, CAM.shake - dt);
  if (CAM.shake > 0) camera.position.add(_cd.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(CAM.shake * 0.5));
  camera.lookAt(CAM.look);
  camera.getWorldDirection(_cd);
  const l = hyp(_cd.x, _cd.z) || 1;
  CAM.fwd = [_cd.x / l, _cd.z / l];
  sun.position.set(CAM.look.x * 0.5 + SUN_OFF.x, SUN_OFF.y, CAM.look.z * 0.5 + SUN_OFF.z);
  sun.target.position.set(CAM.look.x * 0.5, 0, CAM.look.z * 0.5);
}

// ---------- jugadores dibujados ----------
const _hp = new THREE.Vector3();
function renderPlayers(dt) {
  const bx = RP.on ? RP.ball.x : RB.x, by = RP.on ? RP.ball.y : RB.y, bz = RP.on ? RP.ball.z : RB.z;
  for (const p of M.players) {
    const ch = p.ch;
    if (!ch) continue;
    const st = RP.on ? RP.st[p.id] || p : p;
    const me = p.id === M.me && !RP.on;
    const ctx = { me, headMax: 1.2 };
    if (p.gk && !RP.on) {
      const d = hyp(bx - p.x, bz - p.z);
      ctx.ready = RB.owner !== p.id && d < 16 && !p.anim;
      if (RB.owner === p.id) ctx.reach = { x: bx, y: by, z: bz, w: 1 };
      else if (RB.owner < 0 && d < 2.6 && by < 2.8) ctx.reach = { x: bx, y: by, z: bz, w: clamp(1.4 - d / 2, 0, 1) };
    }
    ch.update(dt, st, bx, by, bz, ctx);
    if (me) ch.foot.material.color.set(0xffe14d);
  }
  const me = M.players[M.me];
  meArrow.visible = !!(me && !RP.on && GAME.mode !== 'menu' && M.phase !== 'end');
  if (meArrow.visible) { meArrow.position.set(me.x, me.y + 2.15 + Math.sin(performance.now() / 180) * 0.08, me.z); meArrow.rotation.y += dt * 3; }
}

// ---------- HUD ----------
const HUD = { score: '', hintT: 0, ctrlT: 0, idleT: 0, tags: new Map(), miniF: 0, clockLow: false };
function setupHud() {
  for (const t of [0, 1]) {
    const el = $('#sT' + t), c = clubOf(M.clubs[t]);
    el.querySelector('i').style.background = M.kits[t].shirt;
    el.querySelector('b').textContent = c.emoji + ' ' + c.name;
  }
  HUD.score = ''; clearTags();
  $('#tutBox').style.display = M.tut ? 'block' : 'none';
  $('#sClock').style.display = M.tut ? 'none' : '';
  $('#ctrlCard').innerHTML = '<b>WASD</b>moverte · <b>Shift</b>sprint<br><b>J / clic</b>tirar (mantén) · <b>K / clic der.</b>pase<br><b>L / Espacio</b>regate o barrida · <b>E</b>¡pásala!';
  $('#ctrlCard').classList.remove('hide'); HUD.ctrlT = 9;
}
function clearTags() { for (const el of HUD.tags.values()) el.remove(); HUD.tags.clear(); }
function updateHud(dt) {
  const sc = M.score[0] + ' - ' + M.score[1];
  if (sc !== HUD.score) { const el = $('#sScore'); el.textContent = sc; if (HUD.score) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } HUD.score = sc; }
  const ck = $('#sClock');
  if (M.goldenOn) { ck.textContent = '⭐ GOL DE ORO'; ck.className = 'gold'; }
  else { ck.textContent = fmtClock(M.time); ck.className = M.time < 15 && M.phase === 'play' ? 'low' : ''; }
  const me = M.players[M.me];
  $('#stamBox').style.display = me ? '' : 'none';
  if (me) { $('#stamBar i').style.width = Math.round(me.stam * 100) + '%'; $('#stamBar').classList.toggle('tired', !!me.tired); }
  const pb = $('#powBar');
  if (me && me.chargeT >= 0) {
    const s = worldToScreen(me.x, me.y + 2.5, me.z);
    pb.style.display = 'block'; pb.style.left = s.x + 'px'; pb.style.top = s.y + 'px';
    pb.firstElementChild.style.width = Math.round(clamp((me.chargeT - 0.07) / 0.85, 0, 1) * 100) + '%';
  } else pb.style.display = 'none';
  if (IS_TOUCH && me) {
    const o = owner();
    $('#tbSkill').textContent = owns(me) ? 'REGATE' : 'BARRIDA';
    $('#tbPass').textContent = owns(me) ? 'PASE' : o && o.team === me.team ? '¡PÁSALA!' : o && hyp(o.x - me.x, o.z - me.z) < 2.6 ? 'ENTRADA' : 'PASE';
    $('#tbShoot').classList.toggle('charge', me.chargeT >= 0);
  }
  // flecha hacia el balón cuando no se ve
  const ba = $('#ballArrow'), s = worldToScreen(RB.x, RB.y, RB.z);
  const W = innerWidth, H = innerHeight, mg = 40;
  if (!RP.on && M.phase === 'play' && (!s.vis || s.x < mg || s.x > W - mg || s.y < mg || s.y > H - mg)) {
    let dx = s.x - W / 2, dy = s.y - H / 2;
    if (s.z > 1) { dx = -dx; dy = -dy; }
    const k = Math.min((W / 2 - mg) / Math.max(1, Math.abs(dx)), (H / 2 - mg) / Math.max(1, Math.abs(dy)));
    ba.style.display = 'block';
    ba.style.transform = `translate(${W / 2 + dx * k - 17}px,${H / 2 + dy * k - 17}px)`;
    ba.querySelector('b').style.transform = `rotate(${Math.atan2(dx, -dy)}rad)`;
    ba.querySelector('b').style.transformOrigin = '8px 29px';
  } else ba.style.display = 'none';
  if (++HUD.miniF % 2 === 0) drawMini();
  updateTags();
  if (HUD.hintT > 0) { HUD.hintT -= dt; if (HUD.hintT <= 0) $('#hint').classList.remove('on'); }
  if (HUD.ctrlT > 0) { HUD.ctrlT -= dt; if (HUD.ctrlT <= 0) $('#ctrlCard').classList.add('hide'); }
  if (M.net !== 'off') $('#netInfo').style.display = 'block';
}
function drawMini() {
  const c = $('#mini'), g = c.getContext('2d'), w = c.width, h = c.height, m = 12;
  const sx = (w - m * 2) / F.L, sz = (h - m * 2) / F.W, X = (x) => m + (x + F.HL) * sx, Z = (z) => m + (z + F.HW) * sz;
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2;
  g.strokeRect(m, m, w - m * 2, h - m * 2);
  g.beginPath(); g.moveTo(w / 2, m); g.lineTo(w / 2, h - m); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.8)';
  g.fillRect(m - 5, Z(-GW / 2), 5, GW * sz); g.fillRect(w - m, Z(-GW / 2), 5, GW * sz);
  for (const p of M.players) {
    g.fillStyle = M.kits[p.team].shirt;
    const me = p.id === M.me, r = me ? 7 : 5;
    g.beginPath(); g.arc(X(p.x), Z(p.z), r, 0, Math.PI * 2); g.fill();
    if (me || p.human) { g.strokeStyle = me ? '#ffe14d' : '#ffffff'; g.lineWidth = me ? 3 : 1.5; g.stroke(); }
  }
  g.fillStyle = '#ffffff'; g.strokeStyle = '#1d2340'; g.lineWidth = 2;
  g.beginPath(); g.arc(X(RB.x), Z(RB.z), 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
}
function updateTags() {
  const me = M.players[M.me], mode = SAVE.tags || 'auto';
  for (const p of M.players) {
    const calling = me && p.team === me.team && p !== me && p.callT > 0 && !aiCtl(p);
    const show = !RP.on && M.phase !== 'intro' && (calling || (mode === 'todos' && !p.gk) || (mode !== 'ninguno' && p.human && p !== me && M.net !== 'off'));
    let el = HUD.tags.get(p.id);
    if (!show) { if (el) el.style.display = 'none'; continue; }
    if (!el) { el = makeTag(p, false); HUD.tags.set(p.id, el); }
    el.classList.toggle('call', calling);
    const nm = el.querySelector('.nm');
    const txt = calling ? '¡Pásala! ' + p.name.split(' ')[0] : p.name.split(' ')[0];
    if (nm.textContent !== txt) nm.textContent = txt;
    const s = worldToScreen(p.x, p.y + 2.05, p.z);
    if (!s.vis) { el.style.display = 'none'; continue; }
    el.style.display = 'flex';
    el.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%)`;
  }
}
function pop(text, cls, x, y, z) {
  const el = document.createElement('div');
  el.className = 'pop ' + (cls || '');
  el.textContent = text;
  const s = x !== undefined ? worldToScreen(x, y, z) : { x: innerWidth / 2, y: innerHeight * 0.4, vis: true };
  if (!s.vis) return;
  el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
  $('#pops').appendChild(el);
  setTimeout(() => el.remove(), 1300);
}
function banner(text, sub = '', long = false) {
  const el = $('#banner');
  el.innerHTML = escapeHtml(text) + (sub ? `<small>${escapeHtml(sub)}</small>` : '');
  el.className = ''; void el.offsetWidth; el.className = 'show' + (long ? ' long' : '');
}
function hint(text, s = 4) { $('#hint').textContent = text; $('#hint').classList.add('on'); HUD.hintT = s; }
let toastT = null;
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms);
}

// ---------- eventos → sonido, partículas, textos y narrador ----------
const pName = (id) => (M.players[id] ? M.players[id].name : '');
const isMe = (id) => id === M.me && id >= 0;
const myTeam = () => (M.me >= 0 ? M.players[M.me].team : 0);
function handleEvent(e) {
  if (M.tut) tutEvent(e);
  if (e.t === 'net') { const n = WORLD.nets.find((q) => q.s === e.s); if (n) n.shake = 1; }
  if (e.t === 'goal') { RP.goalIdx = RP.buf.length - 1; drawJumbo(); }
  if (M.demo) return;
  const P = (id) => M.players[id];
  switch (e.t) {
    case 'kick': {
      SFX.kick(e.pow);
      if (e.pow > 0.7) { CAM.shake = Math.max(CAM.shake, 0.12); sparkBurst(e.x, e.y, e.z, 10, '#ffffff', 4); }
      if (isMe(e.id) && e.shot) goalEv('shot');
      if (isMe(e.id)) buzz(e.pow > 0.6 ? 25 : 12);
      break;
    }
    case 'touch': SFX.touch(); break;
    case 'bounce': SFX.bounce(clamp(e.v / 10, 0.2, 1)); if (e.v > 7) puff(e.x, 0, e.z, 3, DUST, 0.4, 1.2, 0.6); break;
    case 'wall': SFX.wall(clamp(e.v / 14, 0.3, 1)); if (e.v > 10) { CAM.shake = Math.max(CAM.shake, 0.08); sparkBurst(e.x, e.y, e.z, 6, '#ffffff', 3); } break;
    case 'block': SFX.bounce(0.8); break;
    case 'post':
      SFX.post(); SFX.ooh(); CAM.shake = Math.max(CAM.shake, 0.25); WORLD.excite = Math.max(WORLD.excite, 0.6);
      pop(e.bar ? '¡AL LARGUERO!' : '¡AL PALO!', 'gold', e.x, e.y + 1, e.z);
      say(e.bar ? ['¡Al travesaño!', '¡Larguero!', '¡Se salvaron!'] : ['¡Al palo!', '¡Uy, el palo!', '¡Se salvaron!'], 2);
      break;
    case 'net': SFX.net(); break;
    case 'goal': {
      const sc = P(e.by), mine = e.team === myTeam() && M.me >= 0;
      SFX.roar(); SFX.goalHorn(); SFX.whistle();
      WORLD.excite = 1; CAM.shake = 0.35;
      const gx = atkX(e.team);
      confetti(gx, 3, 0, 160, 4);
      const kind = { header: 'de cabeza', volley: 'de volea', chilena: '¡DE CHILENA!', kick: 'de primera' }[e.k] || '';
      const who = e.own ? 'Autogol de ' + (sc ? sc.name : '') : (sc ? sc.name : '') + (kind ? ' · ' + kind : '');
      banner(e.golden ? '⭐ ¡GOL DE ORO!' : '¡GOOOL!', who, true);
      const club = clubOf(M.clubs[e.team]).name;
      if (e.k === 'chilena') say(['¡Golazo de chilena! ¡Increíble!', '¡De chilena! ¡Qué golazo!'], 2);
      else say([`¡Goooool de ${club}!`, `¡Gol, gol, gol! ¡${sc ? sc.name : club}!`, `¡Golazo de ${sc ? sc.name : club}!`, `¡Adentro! ¡Gol de ${club}!`], 2);
      if (M.me >= 0) buzz(mine ? [60, 40, 120] : 30);
      if (isMe(e.by) && !e.own) { goalEv('goal'); if (e.k === 'header' || e.k === 'volley' || e.k === 'chilena') goalEv('header'); if (e.k === 'chilena') ach('chilena'); if (e.k === 'header') ach('cabeza'); if (e.golden) ach('oro'); ach('primer'); }
      if (isMe(e.as)) goalEv('assist');
      break;
    }
    case 'save': {
      const p = P(e.id);
      SFX.catch(); SFX.ooh();
      if (e.dive) { pop('¡PARADÓN!', 'blue', p.x, 2.2, p.z); say(['¡Qué paradón!', '¡La sacó el portero!', '¡Atajadón!'], 1); CAM.shake = Math.max(CAM.shake, 0.15); }
      else if (e.parry) pop('¡La despeja!', 'blue', p.x, 2.2, p.z);
      break;
    }
    case 'catch': SFX.catch(); break;
    case 'dive': SFX.skill(); break;
    case 'tackle': {
      if (!e.ok) { SFX.skill(); break; }
      SFX.tackle();
      const p = P(e.id);
      if (e.slide) puff(p.x, 0, p.z, 6, DUST, 0.5, 2, 0.7);
      if (isMe(e.id) && e.v >= 0) { pop('¡ROBO!', 'good', p.x, 2.2, p.z); goalEv('tackle'); }
      else if (isMe(e.v)) pop('¡Te la quitaron!', 'bad', p.x, 2.2, p.z);
      if (e.slide && e.v >= 0 && Math.random() < 0.4) say(['¡Qué barrida!', '¡Barrida limpia!', '¡Se la quitó!'], 0);
      break;
    }
    case 'trip': SFX.trip(); { const p = P(e.id); puff(p.x, 0, p.z, 5, DUST, 0.45, 1.6, 0.6); } break;
    case 'dodge': { SFX.skill(); const p = P(e.id); pop('¡OLÉ!', 'gold', p.x, 2.2, p.z); if (isMe(e.id)) { goalEv('skill'); buzz(20); } if (Math.random() < 0.5) say(['¡Olé!', '¡Qué regate!', '¡Lo dejó sentado!'], 0); break; }
    case 'skill': SFX.skill(); if (isMe(e.id)) goalEv('skill'); break;
    case 'slide': SFX.skill(); break;
    case 'strike': {
      const p = P(e.id);
      if (e.k === 'chilena') { pop('¡CHILENA!', 'gold', p.x, 2.4, p.z); CAM.shake = 0.2; }
      else if (e.k === 'header') pop('¡Cabezazo!', 'blue', p.x, 2.4, p.z);
      else if (e.k === 'volley') pop('¡Volea!', 'blue', p.x, 2.4, p.z);
      break;
    }
    case 'call': SFX.call(); break;
    case 'whistle': SFX.whistle(); if (M.goldenOn) banner('⭐ GOL DE ORO', 'El próximo gol gana'); break;
    case 'ko':
      if (e.first) { const a = clubOf(M.clubs[0]), b = clubOf(M.clubs[1]); banner(`${a.emoji} vs ${b.emoji}`, `${a.name} contra ${b.name}`); SFX.cheer(0.8); say([`¡Bienvenidos! ${a.name} contra ${b.name}.`, `¡Arranca el partido entre ${a.name} y ${b.name}!`], 2); }
      CAM.snap = true;
      break;
    case 'golden': SFX.whistle(2); say('¡Se va al gol de oro! El próximo gol gana.', 2); break;
    case 'end': {
      SFX.whistle(2);
      const mt = myTeam(), w = e.w;
      banner(w < 0 ? '¡EMPATE!' : M.me < 0 ? '¡FINAL!' : w === mt ? '¡VICTORIA!' : 'DERROTA', `${e.sc[0]} - ${e.sc[1]}`, true);
      if (M.me >= 0) { if (w === mt) SFX.win(); else if (w >= 0) SFX.lose(); }
      say(w < 0 ? '¡Final del partido! Empate.' : `¡Final del partido! Gana ${clubOf(M.clubs[w]).name}.`, 2);
      WORLD.excite = 0.8;
      break;
    }
  }
}


// =========================================================
//  PANTALLAS, MODOS Y PROGRESO
// =========================================================
function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
  const prev = GAME.screen;
  GAME.screen = id;
  if (prev === 'scrCustom' && id !== 'scrCustom') closeCustom();
  if (id === 'scrMenu') refreshMenu();
  if (id === 'scrCustom') openCustom();
  if (id === 'scrHelp' && !SAVE.seenHelp) { SAVE.seenHelp = true; storeSave(); }
  if (id === 'scrAchs') renderAchs();
  if (id === 'scrCup') renderCup();
  if (id === 'scrSetup') renderSetup();
}
$$('[data-go]').forEach((b) => b.addEventListener('click', () => { SFX.resume(); SFX.ui(); showScreen(b.dataset.go); }));
function refreshMenu() {
  dailyInit();
  $('#mLvl').textContent = SAVE.level;
  $('#mName').textContent = SAVE.name;
  $('#mXp').style.width = Math.round((SAVE.xp / xpNeed(SAVE.level)) * 100) + '%';
  $('#mXpTxt').textContent = `Nivel ${SAVE.level} · ${SAVE.xp} / ${xpNeed(SAVE.level)} XP`;
  $('#mStats').textContent = `⚽ ${SAVE.matches} partidos · ${SAVE.wins} ganados · ${SAVE.goals} goles · 🏆 ${SAVE.cups}`;
  $('#tutBadge').style.display = SAVE.tutDone ? 'none' : '';
  $('#bMute').textContent = SFX.muted ? '🔇' : '🔊';
  renderGoals();
}
function clubCards(box, sel, onPick, exclude) {
  box.innerHTML = CLUBS.map((c) => `<button class="ccard${c.id === sel ? ' sel' : ''}" data-id="${c.id}"${c.id === exclude ? ' style="opacity:.35"' : ''}><span class="cb" style="background:${c.c1};--c2:${c.c2}">${c.emoji}</span><b>${c.name}</b><small>${'★'.repeat(c.r)}</small></button>`).join('');
  box.onclick = (e) => { const b = e.target.closest('.ccard'); if (b && onPick && b.dataset.id !== exclude) { SFX.ui(); onPick(b.dataset.id); } };
}
function venueCards(box, sel, onPick) {
  box.innerHTML = Object.entries(VENUES).map(([id, v]) => `<button class="tcard${id === sel ? ' sel' : ''}" data-id="${id}" style="--tc:${v.col}"><span class="tb2">${v.emoji}</span><b>${v.name}</b><small>${v.desc}</small></button>`).join('');
  box.onclick = (e) => { const b = e.target.closest('.tcard'); if (b && onPick) { SFX.ui(); onPick(b.dataset.id); } };
}
function renderSetup() {
  if (SAVE.rival === SAVE.club) SAVE.rival = CLUBS.find((c) => c.id !== SAVE.club).id;
  clubCards($('#sClub'), SAVE.club, (id) => { SAVE.club = id; if (SAVE.rival === id) SAVE.rival = CLUBS.find((c) => c.id !== id).id; storeSave(); renderSetup(); });
  clubCards($('#sRival'), SAVE.rival, (id) => { SAVE.rival = id; storeSave(); renderSetup(); }, SAVE.club);
  venueCards($('#sVenues'), SAVE.venue, (id) => { SAVE.venue = id; storeSave(); renderSetup(); startDemo(); });
  syncChips();
}
function syncChips() {
  $$('[data-opt]').forEach((row) => { const k = row.dataset.opt; row.querySelectorAll('.chip').forEach((c) => c.classList.toggle('sel', c.dataset.v === String(+SAVE[k]))); });
}
$$('[data-opt]').forEach((row) => row.addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  SAVE[row.dataset.opt] = +c.dataset.v; storeSave(); SFX.ui(); syncChips();
}));

// ---------- empezar y terminar partidos ----------
function myEntry(team = 0) { return { name: SAVE.name, look: SAVE.look, human: true, local: true, team }; }
function enterMatchUI() {
  $$('.screen').forEach((s) => s.classList.remove('on'));
  GAME.screen = ''; GAME.paused = false;
  $('#hud').classList.add('on');
  $('#touchUI').classList.toggle('on', IS_TOUCH && M.me >= 0);
  $('#netInfo').style.display = M.net !== 'off' ? 'block' : 'none';
  endReplay();
  setupHud();
  CAM.snap = true;
  SFX.music(false);
  INPUT.sprintLatch = false;
}
function startQuick() {
  if (NET.role !== 'off') netReset();
  GAME.mode = 'quick';
  if (SAVE.rival === SAVE.club) SAVE.rival = CLUBS.find((c) => c.id !== SAVE.club).id;
  newMatch({ mode: 'quick', size: SAVE.size, dur: SAVE.time, diff: SAVE.diff, venue: SAVE.venue, golden: !!SAVE.golden, clubs: [SAVE.club, SAVE.rival], roster: [myEntry(0)] });
  enterMatchUI();
}
function startDemo() {
  const others = CLUBS.filter((c) => c.id !== SAVE.club);
  newMatch({ mode: 'demo', demo: true, size: 3, dur: 99, diff: 1, venue: SAVE.venue, golden: false, clubs: [SAVE.club, pick(others).id], roster: [] });
  M.phase = 'play'; M.phaseT = 0;
  GAME.mode = 'menu';
  CAM.snap = true;
}
function leaveToMenu() {
  if (NET.role !== 'off') netReset();
  GAME.mode = 'menu'; GAME.paused = false;
  $('#hud').classList.remove('on'); $('#touchUI').classList.remove('on');
  endReplay(); clearTags();
  try { speechSynthesis.cancel(); } catch (e) { /* sin voz */ }
  startDemo();
  showScreen('scrMenu');
  SFX.music(SAVE.music);
}
function togglePause() {
  if (GAME.screen === 'scrEnd' || GAME.mode === 'menu') return;
  GAME.paused = !GAME.paused;
  if (GAME.paused) { showScreen('scrPause'); syncPauseBtns(); $('#bRestart').style.display = M.net === 'off' ? '' : 'none'; }
  else { $$('.screen').forEach((s) => s.classList.remove('on')); GAME.screen = ''; }
  SFX.ui();
}
function toggleMute() { SFX.muted = !SFX.muted; SAVE.muted = SFX.muted; storeSave(); $('#bMute').textContent = SFX.muted ? '🔇' : '🔊'; if (SFX.muted) try { speechSynthesis.cancel(); } catch (e) { /* sin voz */ } }
function toggleFullscreen() {
  const d = document;
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { const el = d.documentElement; const r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); if (r && r.then) r.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* sin bloqueo */ } }).catch(() => {}); }
  } catch (e) { toast('Tu navegador no permite pantalla completa aquí'); }
}
const TAG_MODES = { auto: 'Auto', todos: 'Todos', ninguno: 'Ninguno' };
function syncPauseBtns() {
  $('#bCam').textContent = '🎥 Cámara: ' + CAM_MODES[CAM.mode].n;
  $('#bTags').textContent = '🏷️ Nombres: ' + TAG_MODES[SAVE.tags || 'auto'];
  $('#bReplay').textContent = '⏪ Repeticiones: ' + (SAVE.replay ? 'Sí' : 'No');
  $('#bMusic').textContent = '🎵 Música del menú: ' + (SAVE.music ? 'Sí' : 'No');
  $('#bVoice').textContent = '🎙️ Narrador: ' + (SAVE.voice !== false ? 'Sí' : 'No') + (VOICE.ok ? '' : ' (no disponible)');
  $('#bSprintMode').textContent = '🏃 Sprint: ' + (SAVE.sprintToggle ? 'Tocar para activar' : 'Mantener');
  $('#bVib').textContent = '📳 Vibración: ' + (SAVE.vib !== false ? 'Sí' : 'No');
}
$('#bResume').onclick = () => togglePause();
$('#pauseBtn').onclick = () => togglePause();
$('#camBtn').onclick = () => cycleCam();
$('#fsBtn').onclick = () => toggleFullscreen();
$('#bFs').onclick = () => toggleFullscreen();
$('#bMute').onclick = () => { SFX.resume(); toggleMute(); };
$('#bCam').onclick = () => cycleCam();
$('#bTags').onclick = () => { const k = Object.keys(TAG_MODES); SAVE.tags = k[(k.indexOf(SAVE.tags || 'auto') + 1) % k.length]; storeSave(); syncPauseBtns(); SFX.ui(); };
$('#bReplay').onclick = () => { SAVE.replay = SAVE.replay ? 0 : 1; storeSave(); syncPauseBtns(); SFX.ui(); };
$('#bMusic').onclick = () => { SAVE.music = !SAVE.music; storeSave(); syncPauseBtns(); SFX.ui(); };
$('#bVoice').onclick = () => { SAVE.voice = SAVE.voice === false; storeSave(); syncPauseBtns(); SFX.ui(); if (SAVE.voice) say('¡Hola! Soy el narrador.', 2); };
$('#bSprintMode').onclick = () => { SAVE.sprintToggle = SAVE.sprintToggle ? 0 : 1; INPUT.sprintLatch = false; storeSave(); syncPauseBtns(); SFX.ui(); };
$('#bVib').onclick = () => { SAVE.vib = SAVE.vib === false; storeSave(); syncPauseBtns(); buzz(30); };
$('#bRestart').onclick = () => { SFX.ui(); GAME.paused = false; if (GAME.mode === 'cup') startCupMatch(); else if (GAME.mode === 'tut') startTut(); else startQuick(); };
$('#bQuit').onclick = () => { SFX.ui(); leaveToMenu(); };
$('#bQuick').onclick = () => { SFX.resume(); SFX.ui(); $('#sTitle').textContent = 'Partido contra la PC'; showScreen('scrSetup'); };
$('#bPlay').onclick = () => { SFX.resume(); SFX.ui(); startQuick(); };
$('#bTut').onclick = () => { SFX.resume(); SFX.ui(); startTut(); };
$('#bAchs').onclick = () => { SFX.ui(); showScreen('scrAchs'); };
$('#bCup').onclick = () => { SFX.resume(); SFX.ui(); showScreen('scrCup'); };

// ---------- retos diarios (3 por día, iguales para todos ese día) ----------
const GOALS = [
  { id: 'win', t: (n) => `Gana ${n} partido${n > 1 ? 's' : ''}`, ns: [1, 2], xp: 120 },
  { id: 'goal', t: (n) => `Marca ${n} goles`, ns: [3, 5], xp: 100 },
  { id: 'assist', t: (n) => `Da ${n} asistencias`, ns: [2, 3], xp: 100 },
  { id: 'tackle', t: (n) => `Roba ${n} balones`, ns: [4, 7], xp: 90 },
  { id: 'header', t: () => 'Marca de cabeza, de volea o de chilena', ns: [1], xp: 130 },
  { id: 'skill', t: (n) => `Haz ${n} regates`, ns: [5, 8], xp: 80 },
  { id: 'shot', t: (n) => `Tira ${n} veces a portería`, ns: [6, 10], xp: 80 },
  { id: 'clean', t: () => 'Gana sin que te metan gol', ns: [1], xp: 150 },
  { id: 'online', t: () => 'Juega un partido en línea', ns: [1], xp: 120 },
  { id: 'pass', t: (n) => `Completa ${n} pases`, ns: [10, 18], xp: 80 },
];
const GOAL_BY_ID = Object.fromEntries(GOALS.map((g) => [g.id, g]));
const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
function dailyInit() {
  const k = todayKey();
  if (SAVE.daily && SAVE.daily.k === k && Array.isArray(SAVE.daily.list)) return;
  const rng = mulberry32(hashStr(k + 'golazo')), pool = GOALS.slice(), list = [];
  while (list.length < 3) { const g = pool.splice(Math.floor(rng() * pool.length), 1)[0]; list.push({ id: g.id, n: g.ns[Math.floor(rng() * g.ns.length)], p: 0, done: false }); }
  SAVE.daily = { k, list }; storeSave();
}
function addXp(xp) { SAVE.xp += xp; while (SAVE.xp >= xpNeed(SAVE.level)) { SAVE.xp -= xpNeed(SAVE.level); SAVE.level++; toast('⭐ ¡Subiste al nivel ' + SAVE.level + '!'); SFX.levelUp(); } storeSave(); }
function goalEv(id, n = 1) {
  if (M.demo || M.tut) return;
  dailyInit();
  for (const g of SAVE.daily.list) {
    if (g.id !== id || g.done) continue;
    g.p = Math.min(g.n, g.p + n);
    if (g.p >= g.n) { g.done = true; const G = GOAL_BY_ID[id]; toast(`✅ Reto cumplido: ${G.t(g.n)} (+${G.xp} XP)`, 3000); SFX.star(); addXp(G.xp); }
  }
  storeSave();
}
function renderGoals() {
  const L = SAVE.daily ? SAVE.daily.list : [];
  $('#mGoals').innerHTML = '<b>Retos de hoy</b>' + L.map((g) => { const G = GOAL_BY_ID[g.id]; return `<div class="goal${g.done ? ' done' : ''}"><span>${g.done ? '✅' : '⬜'}</span><span class="gt">${G.t(g.n)}</span><small>${g.done ? '' : g.p + '/' + g.n + ' · '}+${G.xp}</small></div>`; }).join('');
}

// ---------- logros ----------
const ACHS = [
  { id: 'primer', e: '⚽', n: 'Primer gol', d: 'Marca tu primer gol' },
  { id: 'cabeza', e: '🗣️', n: 'Cabecita de oro', d: 'Marca un gol de cabeza' },
  { id: 'chilena', e: '🤸', n: '¡Chilena!', d: 'Marca un gol de chilena' },
  { id: 'hat', e: '🎩', n: 'Hat-trick', d: 'Marca 3 goles en un partido' },
  { id: 'oro', e: '⭐', n: 'Gol de oro', d: 'Marca el gol de oro' },
  { id: 'paliza', e: '💥', n: 'Paliza', d: 'Gana por 5 goles o más' },
  { id: 'muro', e: '🧱', n: 'Valla invicta', d: 'Gana sin recibir goles' },
  { id: 'robos', e: '🦵', n: 'Muralla', d: 'Roba 5 balones en un partido' },
  { id: 'dificil', e: '🔥', n: 'Sin miedo', d: 'Gana en dificultad Difícil' },
  { id: 'copa', e: '🏆', n: 'Campeón', d: 'Gana la Copa Golazo' },
  { id: 'online', e: '🌐', n: 'Con amigos', d: 'Gana un partido en línea' },
  { id: 'diez', e: '🔟', n: 'Diez victorias', d: 'Gana 10 partidos' },
  { id: 'cincuenta', e: '🥅', n: 'Goleador', d: 'Marca 50 goles en total' },
  { id: 'tut', e: '🎓', n: 'Buen alumno', d: 'Completa el entrenamiento' },
];
const ACH_BY_ID = Object.fromEntries(ACHS.map((a) => [a.id, a]));
function ach(id) {
  if (M.demo || SAVE.achs[id] || !ACH_BY_ID[id]) return;
  SAVE.achs[id] = Date.now(); storeSave();
  const a = ACH_BY_ID[id];
  setTimeout(() => { toast(`🏅 Logro: ${a.e} ${a.n} (+100 XP)`, 3200); SFX.star(); }, 900);
  addXp(100);
}
function renderAchs() {
  $('#achList').innerHTML = ACHS.map((a) => `<div class="ach${SAVE.achs[a.id] ? '' : ' off'}"><span>${a.e}</span><div><b>${a.n}</b>${a.d}</div></div>`).join('');
}

// ---------- final del partido ----------
function onMatchEnd() {
  if (M.demo) { startDemo(); return; }
  if (M.tut) { tutFinish(); return; }
  if (M.net === 'host') netSendEnd();
  showEndScreen();
}
function rating(p) { return p.st.g * 3 + p.st.a * 2 + p.st.sv * 1.5 + p.st.tk * 0.8 + p.st.ps * 0.25 + p.st.sh * 0.3; }
function showEndScreen() {
  GAME.paused = false;
  $('#hud').classList.remove('on'); $('#touchUI').classList.remove('on'); clearTags();
  showScreen('scrEnd');
  const me = M.players[M.me], mt = me ? me.team : 0, w = M.score[0] > M.score[1] ? 0 : M.score[1] > M.score[0] ? 1 : -1;
  const won = me && w === mt, lost = me && w >= 0 && w !== mt;
  $('#eTitle').textContent = !me ? 'Final' : won ? '¡Victoria! 🎉' : lost ? 'Derrota' : '¡Empate!';
  const c0 = clubOf(M.clubs[0]), c1 = clubOf(M.clubs[1]);
  $('#eScore').textContent = `${c0.emoji} ${M.score[0]} - ${M.score[1]} ${c1.emoji}`;
  $('#eSub').textContent = `${c0.name} contra ${c1.name} · ${M.size} vs ${M.size} · ${venueOf(M.venue).name}${M.goldenOn ? ' · gol de oro' : ''}`;
  const rows = M.players.slice().sort((a, b) => a.team - b.team || (a.gk ? 1 : 0) - (b.gk ? 1 : 0) || rating(b) - rating(a));
  $('#eTable').innerHTML = '<tr><th>Jugador</th><th>G</th><th>A</th><th>Tiros</th><th>Robos</th><th>Pases</th><th>Paradas</th></tr>' + rows.map((p) =>
    `<tr class="${p.id === M.me ? 'me' : ''}"><td><i style="background:${M.kits[p.team].shirt}"></i>${escapeHtml(p.name)}${p.gk ? ' 🧤' : p.human ? '' : ' 🤖'}</td><td>${p.st.g}</td><td>${p.st.a}</td><td>${p.st.sh}</td><td>${p.st.tk}</td><td>${p.st.ps}</td><td>${p.gk ? p.st.sv : '-'}</td></tr>`).join('');
  const mvp = M.players.slice().sort((a, b) => rating(b) - rating(a))[0];
  $('#eMvp').textContent = mvp ? `⭐ Mejor jugador: ${mvp.name} (${clubOf(M.clubs[mvp.team]).name})` : '';
  $('#eUnlocks').innerHTML = '';
  let xp = 0;
  if (me) {
    const oldLv = SAVE.level;
    SAVE.matches++;
    if (won) { SAVE.wins++; SAVE.streak++; } else if (lost) { SAVE.losses++; SAVE.streak = 0; } else SAVE.draws++;
    SAVE.goals += me.st.g; SAVE.assists += me.st.a;
    xp = Math.round((won ? 120 : lost ? 35 : 60) * (0.8 + 0.2 * M.diff) + me.st.g * 30 + me.st.a * 20 + me.st.tk * 5 + me.st.ps * 2 + (mvp === me ? 40 : 0));
    if (won) goalEv('win');
    if (won && M.score[1 - mt] === 0) { goalEv('clean'); ach('muro'); }
    if (me.st.ps) goalEv('pass', me.st.ps);
    if (M.net !== 'off') { goalEv('online'); if (won) ach('online'); }
    if (me.st.g >= 3) ach('hat');
    if (me.st.tk >= 5) ach('robos');
    if (won && M.score[mt] - M.score[1 - mt] >= 5) ach('paliza');
    if (won && M.diff >= 2) ach('dificil');
    if (SAVE.wins >= 10) ach('diez');
    if (SAVE.goals >= 50) ach('cincuenta');
    if (GAME.mode === 'cup') cupResult(won);
    addXp(xp);
    $('#eLvl').textContent = SAVE.level;
    $('#eXpGain').textContent = `+${xp} XP${mvp === me ? ' · ¡MVP!' : ''}`;
    $('#eXpTxt').textContent = `Nivel ${SAVE.level} · ${SAVE.xp} / ${xpNeed(SAVE.level)} XP`;
    $('#eXp').style.width = '0%';
    setTimeout(() => { $('#eXp').style.width = Math.round((SAVE.xp / xpNeed(SAVE.level)) * 100) + '%'; }, 80);
    if (SAVE.level > oldLv) {
      const un = [];
      for (const k of Object.keys(OPTS)) for (const o of OPTS[k]) if (o.lv > oldLv && o.lv <= SAVE.level) un.push(`${OPT_LABEL[k]}: ${o.n || '🎨 color nuevo'}`);
      $('#eUnlocks').innerHTML = `<div class="unlock">⭐ ¡Nivel ${SAVE.level}!${un.length ? ' Desbloqueaste: ' + escapeHtml(un.slice(0, 6).join(' · ')) : ''}</div>`;
    }
    if (won) confetti(camera.position.x, 2, camera.position.z, 80, 4);
  }
  storeSave();
  const online = M.net !== 'off';
  $('#bAgain').style.display = online && M.net !== 'host' ? 'none' : '';
  $('#bAgain').textContent = GAME.mode === 'cup' ? (SAVE.cup && !SAVE.cup.over ? '🏆 Seguir en la copa' : '🏆 Ver la copa') : online ? '¡Revancha! (misma sala)' : '¡Revancha!';
  $('#bToLobby').style.display = online ? '' : 'none';
}
$('#bAgain').onclick = () => {
  SFX.ui();
  if (GAME.mode === 'cup') { $('#hud').classList.remove('on'); GAME.mode = 'menu'; startDemo(); showScreen('scrCup'); }
  else if (M.net === 'host') hostStart();
  else startQuick();
};
$('#bEndMenu').onclick = () => { SFX.ui(); leaveToMenu(); };
$('#bToLobby').onclick = () => { SFX.ui(); if (M.net === 'host') netSendAll({ t: 'tolobby' }); backToLobby(); };

// ---------- copa: cuartos, semifinal y final ----------
const CUP_RN = ['Cuartos de final', 'Semifinal', 'Final'];
function newCup() {
  const opps = CLUBS.filter((c) => c.id !== SAVE.club).sort((a, b) => a.r - b.r + rand(-1.2, 1.2)).slice(0, 3).sort((a, b) => a.r - b.r).map((c) => c.id);
  SAVE.cup = { club: SAVE.club, opps, res: [], round: 0, over: false, won: false };
  storeSave();
}
function renderCup() {
  if (!SAVE.cup) newCup();
  const C = SAVE.cup, me = clubOf(C.club);
  $('#cupInfo').textContent = `Juegas con ${me.emoji} ${me.name} · ${SAVE.size} vs ${SAVE.size} · ${SAVE.time} min · si empatan, gol de oro`;
  $('#cupBracket').innerHTML = C.opps.map((id, i) => {
    const o = clubOf(id), r = C.res[i];
    const cls = r ? (r.w ? 'win' : 'lose') : i === C.round && !C.over ? 'now' : '';
    return `<div class="rnd ${cls}"><span class="rn">${CUP_RN[i]}</span>${me.emoji} vs ${o.emoji} ${o.name}<span class="res">${r ? r.s + (r.w ? ' ✅' : ' ❌') : i === C.round && !C.over ? '▶' : '—'}</span></div>`;
  }).join('') + (C.won ? '<div class="mvp">🏆 ¡Campeones de la Copa Golazo!</div>' : C.over ? '<div class="mvp">Quedaste fuera. ¡Inténtalo otra vez!</div>' : '');
  $('#bCupPlay').style.display = C.over ? 'none' : '';
  $('#bCupPlay').textContent = '⚽ Jugar ' + (C.round === 2 ? 'la FINAL' : C.round === 1 ? 'la semifinal' : 'cuartos de final');
}
function startCupMatch() {
  if (!SAVE.cup || SAVE.cup.over) newCup();
  const C = SAVE.cup;
  if (NET.role !== 'off') netReset();
  GAME.mode = 'cup';
  newMatch({ mode: 'cup', size: SAVE.size, dur: SAVE.time, diff: clamp(SAVE.diff + (C.round === 2 ? 1 : 0), 0, 2), venue: ['estadio', 'neon', 'estadio'][C.round] === 'neon' ? 'neon' : SAVE.venue, golden: true, clubs: [C.club, C.opps[C.round]], roster: [myEntry(0)] });
  enterMatchUI();
}
function cupResult(won) {
  const C = SAVE.cup;
  if (!C || C.over) return;
  C.res[C.round] = { w: won, s: M.score[0] + '-' + M.score[1] };
  if (!won) C.over = true;
  else if (++C.round >= 3) { C.over = true; C.won = true; SAVE.cups++; ach('copa'); setTimeout(() => { banner('🏆 ¡CAMPEONES!', 'Copa Golazo', true); SFX.roar(); }, 400); }
  storeSave();
}
$('#bCupPlay').onclick = () => { SFX.resume(); SFX.ui(); startCupMatch(); };
$('#bCupNew').onclick = () => { SFX.ui(); newCup(); renderCup(); };

// =========================================================
//  ENTRENAMIENTO: 6 lecciones cortas que se completan jugando
// =========================================================
const TUT_L = [
  { t: '1 · Muévete y esprinta', d: () => (IS_TOUCH ? 'Usa el joystick y mantén SPRINT para pasar por los 3 aros amarillos' : 'Muévete con WASD o las flechas y mantén Shift para pasar por los 3 aros amarillos') },
  { t: '2 · Pásale a tu compañero', d: () => (IS_TOUCH ? 'Apunta hacia tu compañero con el joystick y toca PASE' : 'Apunta hacia tu compañero y pulsa K (o clic derecho) para pasar') },
  { t: '3 · Tira a portería', d: () => (IS_TOUCH ? 'Mantén TIRAR para cargar y suelta. Apunta a una esquina con el joystick. ¡Mete gol!' : 'Mantén J (o clic) para cargar y suelta. Apunta a una esquina con las flechas. ¡Mete gol!') },
  { t: '4 · Regatea al defensa', d: () => (IS_TOUCH ? 'Cuando el defensa vaya a quitártela, toca REGATE para esquivarlo' : 'Cuando el defensa vaya a quitártela, pulsa L o Espacio para esquivarlo') },
  { t: '5 · Roba el balón', d: () => (IS_TOUCH ? 'Sin balón, toca BARRIDA cuando el rival esté cerca (o ENTRADA al lado)' : 'Sin balón, pulsa L o Espacio para barrer cuando el rival esté cerca (o K para una entrada)') },
  { t: '6 · Remata de primera', d: () => (IS_TOUCH ? 'Tu compañero va a centrar: toca TIRAR justo antes de que llegue el balón' : 'Tu compañero va a centrar: pulsa J justo antes de que llegue el balón') },
];
const TUT_RINGS = [];
for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 28), basic('#ffe14d')); r.rotation.x = -Math.PI / 2; r.visible = false; scene.add(r); TUT_RINGS.push(r); }
function startTut() {
  if (NET.role !== 'off') netReset();
  GAME.mode = 'tut';
  newMatch({ mode: 'tut', tut: { i: 0 }, size: 2, dur: 99, diff: 0, venue: 'estadio', golden: false, clubs: [SAVE.club, SAVE.club === 'volcanes' ? 'tiburones' : 'volcanes'], roster: [myEntry(0)], kick: 0 });
  enterMatchUI();
  tutSetup(0);
}
const tutP = () => {
  const me = M.players[M.me];
  return { me, mate: M.players.find((p) => p.team === 0 && !p.gk && p !== me), opp: M.players.find((p) => p.team === 1 && !p.gk && p.idx === 0), opp2: M.players.find((p) => p.team === 1 && !p.gk && p.idx === 1), gk0: M.players.find((p) => p.team === 0 && p.gk), gk1: M.players.find((p) => p.team === 1 && p.gk) };
};
function tutSetup(i) {
  const T = M.tut;
  Object.assign(T, { i, ok: false, okT: 0, k: 0, t: 0, deadT: 0, crossed: false });
  const { me, mate, opp, opp2, gk0, gk1 } = tutP(), H = F.HL, W = F.HW;
  resetBall();
  for (const p of M.players) { if (p !== me) p.tutCtl = true; p.tutRole = 'stand'; }
  placeP(me, -6, 0); placeP(mate, -H + 6, W - 3); placeP(opp, H - 5, -W + 2); placeP(opp2, H - 5, W - 2);
  placeP(gk0, -H + 1.1, 0); placeP(gk1, H - 1.1, 0);
  for (const r of TUT_RINGS) r.visible = false;
  if (i === 0) {
    T.marks = [[-1, -6], [6, 5], [12, -3]];
    T.marks.forEach((m, k) => { TUT_RINGS[k].position.set(m[0], 0.06, m[1]); TUT_RINGS[k].visible = true; });
    B.owner = gk0.id; B.held = true;
  } else if (i === 1) {
    placeP(mate, 3, 5); B.owner = me.id;
  } else if (i === 2) {
    placeP(me, H - 15, 3); B.owner = me.id; gk1.tutCtl = false; gk1.K.gk = 0.55; gk1.K.react = 0.45;
  } else if (i === 3) {
    placeP(opp, 3, 0); opp.tutRole = 'press'; opp.ry = -Math.PI / 2; B.owner = me.id;
  } else if (i === 4) {
    placeP(me, -4, 0); placeP(opp, 9, 2); opp.tutRole = 'dribble'; opp.ry = -Math.PI / 2; B.owner = opp.id;
  } else if (i === 5) {
    placeP(me, H - 8.5, -1); placeP(mate, H - 11, W - 2.5); mate.tutRole = 'cross'; B.owner = mate.id; gk1.tutCtl = false; gk1.K.gk = 0.5; gk1.K.react = 0.5;
  }
  if (B.owner >= 0) attachBall(M.players[B.owner], 0);
  M.phase = 'play'; M.koTouch = true;
  $('#tutBox').classList.remove('ok');
  $('#tutTitle').textContent = TUT_L[i].t; $('#tutText').textContent = TUT_L[i].d();
  CAM.snap = true;
}
function tutOk() {
  const T = M.tut;
  if (T.ok) return;
  T.ok = true; T.okT = 1.6;
  SFX.star(); $('#tutBox').classList.add('ok'); $('#tutText').textContent = '¡Muy bien! ✅';
}
function tutRetry(msg) { hint(msg, 2.5); SFX.ooh(); tutSetup(M.tut.i); }
function tutTick(dt) {
  const T = M.tut;
  if (!T || M.phase !== 'play') return;
  T.t += dt;
  const { me, mate, opp } = tutP();
  if (T.ok) { T.okT -= dt; if (T.okT <= 0) tutNext(); return; }
  const loose = B.owner < 0, slow = hyp(B.vx, B.vz) < 1.2;
  if (T.i === 0) {
    const m = T.marks[T.k];
    if (m && hyp(me.x - m[0], me.z - m[1]) < 1.6) { TUT_RINGS[T.k].visible = false; T.k++; SFX.charge(T.k / 3); if (T.k >= 3) tutOk(); }
  } else if (T.i === 1 || T.i === 2 || T.i === 3) {
    if (loose && slow && T.t > 1.5) { T.deadT += dt; if (T.deadT > 1.2) tutRetry(T.i === 2 ? '¡Casi! Otra vez' : 'Otra vez'); } else T.deadT = 0;
    if (T.i === 3 && owner() === opp) { T.deadT += dt; if (T.deadT > 1) tutRetry('Te la quitó: pulsa REGATE justo cuando llegue'); }
  } else if (T.i === 4) {
    if (opp.x < -F.HL + 7 || (owner() && owner() !== opp && owner() !== me) || (loose && slow && T.t > 3)) tutRetry('Otra vez: barre cuando esté cerca');
  } else if (T.i === 5) {
    if (!T.crossed && T.t > 1.3 && owns(mate)) { T.crossed = true; passBallTo(mate, me, true); }
    if (owns(me)) { T.deadT += dt; if (T.deadT > 0.3) tutRetry('¡De primera! Pulsa TIRAR antes de que llegue el balón'); }
    else if (T.crossed && loose && slow) { T.deadT += dt; if (T.deadT > 1.2) tutRetry('Otra vez'); }
  }
}
function tutAI(p, dt) {
  const me = M.players[M.me];
  p.want.mx = p.want.mz = 0; p.want.sprint = false; p.face = Math.atan2(B.x - p.x, B.z - p.z);
  if (p.tutRole === 'press' && me) {
    const dx = me.x - p.x, dz = me.z - p.z, d = hyp(dx, dz);
    if (d > 0.9) { p.want.mx = (dx / d) * 0.55; p.want.mz = (dz / d) * 0.55; }
    if (d < 1.5 && p.tackleCD <= 0 && M.tut.t > 1 && Math.random() < dt * 2.5) performAct(p, 'tackle', {});
  } else if (p.tutRole === 'dribble' && owns(p)) { p.want.mx = -0.55; p.want.mz = -p.z * 0.05; p.face = null; }
}
function tutEvent(e) {
  const T = M.tut;
  if (!T || T.ok) return;
  const { mate } = tutP();
  if (T.i === 1 && e.t === 'touch' && mate && e.id === mate.id && B.prevTouch === M.me) tutOk();
  if (T.i === 2 && e.t === 'goal' && e.by === M.me) tutOk();
  if (T.i === 3 && e.id === M.me && (e.t === 'dodge' || (e.t === 'skill' && tutP().opp && hyp(tutP().opp.x - tutP().me.x, tutP().opp.z - tutP().me.z) < 2.8))) tutOk();
  if (T.i === 4 && e.t === 'tackle' && e.ok && e.id === M.me && e.v >= 0) tutOk();
  if (T.i === 5 && e.t === 'goal' && e.by === M.me && e.k !== 'shot') tutOk();
  if (T.i === 5 && e.t === 'goal' && e.by === M.me && e.k === 'shot') hint('¡Gol! Pero tenía que ser de primera', 2.5);
}
function tutAfterGoal() { if (M.tut.ok) tutNext(); else tutSetup(M.tut.i); }
function tutNext() {
  const n = M.tut.i + 1;
  if (n >= TUT_L.length) { M.tut.done = true; tutFinish(); return; }
  tutSetup(n);
}
function tutFinish() {
  for (const r of TUT_RINGS) r.visible = false;
  const first = !SAVE.tutDone;
  SAVE.tutDone = true; storeSave();
  M.on = false;
  $('#hud').classList.remove('on'); $('#touchUI').classList.remove('on');
  showScreen('scrEnd');
  $('#eTitle').textContent = '🎓 ¡Entrenamiento completado!';
  $('#eScore').textContent = '';
  $('#eSub').textContent = 'Ya sabes moverte, pasar, tirar, regatear, robar y rematar de primera. ¡A jugar!';
  $('#eTable').innerHTML = ''; $('#eMvp').textContent = ''; $('#eUnlocks').innerHTML = '';
  if (first) { addXp(200); ach('tut'); }
  $('#eLvl').textContent = SAVE.level; $('#eXpGain').textContent = first ? '+200 XP' : '';
  $('#eXpTxt').textContent = `Nivel ${SAVE.level} · ${SAVE.xp} / ${xpNeed(SAVE.level)} XP`;
  $('#eXp').style.width = Math.round((SAVE.xp / xpNeed(SAVE.level)) * 100) + '%';
  $('#bAgain').style.display = ''; $('#bAgain').textContent = '⚽ Jugar un partido';
  $('#bToLobby').style.display = 'none';
  GAME.mode = 'quick';
  SFX.win();
}

// ---------- personalización (vestuario) ----------
let preview = null;
const GAR = (() => {
  const h = new THREE.HemisphereLight(0xffffff, 0x8fa0c8, 1.3); garage.add(h);
  const d = new THREE.DirectionalLight(0xffffff, 1.4); d.position.set(3, 6, 5); garage.add(d);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40), toon('#2fd27a')); floor.rotation.x = -Math.PI / 2; garage.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.45, 40), basic('#ffffff')); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; garage.add(ring);
  garage.background = new THREE.Color(0x8fd3ff);
  return { t: 0 };
})();
function openCustom() {
  GAME.custOpen = true;
  $('#cName').value = SAVE.name; $('#cNum').value = SAVE.look.num;
  clubCards($('#cClub'), SAVE.club, (id) => { SAVE.club = id; if (SAVE.rival === id) SAVE.rival = CLUBS.find((c) => c.id !== id).id; storeSave(); openCustomRefresh(); });
  renderCustRows(); rebuildPreview();
}
function openCustomRefresh() { clubCards($('#cClub'), SAVE.club, (id) => { SAVE.club = id; if (SAVE.rival === id) SAVE.rival = CLUBS.find((c) => c.id !== id).id; storeSave(); openCustomRefresh(); }); rebuildPreview(); }
function closeCustom() {
  GAME.custOpen = false;
  const n = $('#cName').value.trim().slice(0, 12);
  if (n) SAVE.name = n;
  SAVE.look.num = clamp(parseInt($('#cNum').value, 10) || SAVE.look.num, 1, 99);
  storeSave();
  if (preview) { garage.remove(preview.root); preview = null; }
  if (GAME.mode === 'menu') startDemo();
}
function rebuildPreview() {
  if (preview) garage.remove(preview.root);
  const c = clubOf(SAVE.club);
  preview = new Char({ id: 0, team: 0, look: SAVE.look, kit: { shirt: c.c1, shorts: c.c2 } });
  scene.remove(preview.root); garage.add(preview.root);
  preview.cel = SAVE.look.cel; GAR.t = 0;
}
function renderGarage(dt) {
  GAR.t += dt;
  if (preview) {
    const t = GAR.t % 6, cheer = t > 3.6;
    preview.cel = SAVE.look.cel;
    preview.update(dt, { x: 0, y: 0, z: 0, ry: Math.sin(GAR.t * 0.5) * 0.6, anim: cheer ? 'cheer' : '', animT: t - 3.6 }, 0, 1.2, 3, { dust: false });
  }
  const wide = innerWidth > 760;
  if (wide) { garageCam.position.set(1.3, 1.5, 6.6); garageCam.lookAt(-0.5, 0.85, 0); }
  else { garageCam.position.set(0, 1.5, 6.6); garageCam.lookAt(0, 0.35, 0); }
  renderer.render(garage, garageCam);
}
function renderCustRows() {
  const box = $('#custRows');
  box.innerHTML = Object.keys(OPTS).map((k) => {
    const named = OPTS[k][0].n !== undefined;
    const items = OPTS[k].map((o) => {
      const lock = o.lv > SAVE.level, sel = SAVE.look[k] === o.v;
      if (named) return `<button class="chip${sel ? ' sel' : ''}${lock ? ' lock' : ''}" data-k="${k}" data-v="${o.v}">${lock ? '🔒 ' : ''}${o.n}${lock ? `<small>nivel ${o.lv}</small>` : ''}</button>`;
      return `<span class="sw${sel ? ' sel' : ''}${lock ? ' lock' : ''}" data-k="${k}" data-v="${o.v}" title="${lock ? 'Nivel ' + o.lv : ''}" style="background:${o.v}"></span>`;
    }).join('');
    const extra = k === 'style' ? `<p class="optHint">${STYLES[SAVE.look.style].d}</p>` : '';
    return `<label class="t">${OPT_LABEL[k]}</label><div class="row">${items}</div>${extra}`;
  }).join('');
}
$('#custRows').addEventListener('click', (e) => {
  const el = e.target.closest('[data-k]');
  if (!el) return;
  const k = el.dataset.k, o = OPTS[k].find((x) => x.v === el.dataset.v);
  if (!o) return;
  if (o.lv > SAVE.level) { toast('🔒 Se desbloquea en el nivel ' + o.lv); return; }
  SAVE.look[k] = o.v; storeSave(); SFX.ui();
  renderCustRows(); rebuildPreview();
});
$('#cNum').addEventListener('change', () => { SAVE.look.num = clamp(parseInt($('#cNum').value, 10) || 10, 1, 99); $('#cNum').value = SAVE.look.num; storeSave(); rebuildPreview(); });
$('#cName').addEventListener('change', () => { const n = $('#cName').value.trim().slice(0, 12); if (n) { SAVE.name = n; storeSave(); } });


// =========================================================
//  EN LÍNEA (PeerJS / WebRTC, con relevo MQTT de respaldo)
//  Hasta 8 personas. El anfitrión simula el balón, la PC y las
//  reglas y reparte el estado ~20 veces por segundo. Cada invitado
//  mueve a SU jugador (respuesta inmediata) y manda sus acciones.
// =========================================================
const PEER_PREFIX = 'golazopark-v1-';
const PEER_OPTS = {
  debug: 1,
  config: {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
    ],
  },
};
const NET = {
  role: 'off', peer: null, conns: new Map(), hostConn: null, code: '', lobby: [], settings: { size: SAVE.size, time: SAVE.time, diff: SAVE.diff, golden: SAVE.golden, venue: SAVE.venue },
  started: false, mid: '', snapT: 0, pingT: 0, sendT: 0, relays: [], relayConns: new Map(), via: '', welcomed: false, lastHostMsg: 0, rtt: 0.1,
  reconnecting: false, lostSince: 0, ack: new Set(), startT: 0, anyRelay: false, clubs: [SAVE.club, SAVE.rival],
};
const CL = { mid: '', buf: [] };
const PH = ['off', 'intro', 'kickoff', 'play', 'goal', 'replay', 'end'];
const num = (v, a, b) => clamp(Number.isFinite(+v) ? +v : 0, a, b);
function genCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}
function netSendAll(msg) { for (const c of NET.conns.values()) if (c.conn.open) { try { c.conn.send(msg); } catch (e) { /* ignorar */ } } }
function netSend(msg) { if (NET.hostConn && NET.hostConn.open) { try { NET.hostConn.send(msg); } catch (e) { /* ignorar */ } } }
function netReset() {
  const peer = NET.peer;
  if (NET.role === 'host') netSendAll({ t: 'hostbye' });
  try { if (NET.hostConn && NET.hostConn.relay) NET.hostConn.close(); } catch (e) { /* ignorar */ }
  for (const cl of NET.relays) { try { cl.end(); } catch (e) { /* ignorar */ } }
  Object.assign(NET, { relays: [], welcomed: false, via: '', role: 'off', peer: null, hostConn: null, lobby: [], started: false, mid: '', reconnecting: false, lostSince: 0, anyRelay: false });
  NET.relayConns.clear(); NET.conns.clear(); NET.ack.clear();
  CL.mid = ''; CL.buf = [];
  try { if (peer) peer.destroy(); } catch (e) { /* ignorar */ }
  if (M.net !== 'off') M.net = 'off';
  $('#netInfo').style.display = 'none';
}
function linkFor(code) {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  u.searchParams.set('sala', code);
  return u.toString();
}
// estado compacto de un jugador (enteros): viaja bien hasta por el relevo
function pState(p) {
  const q = (v, k) => Math.round((+v || 0) * k);
  const fl = (p.fallT > 0 ? 1 : 0) | (p.slideT > 0 ? 2 : 0) | (p.diveT > 0 ? 4 : 0) | (p.tired ? 8 : 0) | (p.elusive > 0 ? 16 : 0) | (p.callT > 0 ? 32 : 0) | (p.chargeT >= 0 ? 64 : 0);
  return [q(p.x, 100), q(p.z, 100), q(p.y, 100), q(wrapA(p.ry), 1000), ANIM_I[p.anim] || 0, q(clamp(p.animT, -9, 99), 100), q(p.vx, 10), q(p.vz, 10), fl, q(p.stam, 100)];
}
const cleanState = (a) => (Array.isArray(a) && a.length >= 10 ? a.slice(0, 10).map((v) => num(v, -1e6, 1e6)) : null);
function applyState(p, a, full) {
  p.y = a[2] / 100; p.ry = a[3] / 1000; p.anim = ANIMS[a[4] | 0] || ''; p.animT = a[5] / 100;
  p.vx = a[6] / 10; p.vz = a[7] / 10;
  const fl = a[8] | 0;
  p.tired = !!(fl & 8); p.callT = fl & 32 ? 0.3 : 0;
  if (full) { p.x = a[0] / 100; p.z = a[1] / 100; p.stam = a[9] / 100; }
}

// ---------- anfitrión: jugadores de los invitados (los suaviza y extrapola un poquito) ----------
function hostRemotes(dt) {
  const now = performance.now() / 1000;
  for (const p of M.players) {
    if (!p.remote || !p.nt) continue;
    const el = Math.min(0.2, now - p.nt.t), tx = p.nt.x + p.nt.vx * el, tz = p.nt.z + p.nt.vz * el;
    if (hyp(tx - p.x, tz - p.z) > 4) { p.x = tx; p.z = tz; }
    else { p.x = damp(p.x, tx, 14, dt); p.z = damp(p.z, tz, 14, dt); }
  }
}

// ---------- anfitrión ----------
function hostCreate() {
  netReset();
  NET.role = 'host';
  NET.code = genCode();
  NET.settings = { size: SAVE.size, time: SAVE.time, diff: SAVE.diff, golden: SAVE.golden ? 1 : 0, venue: SAVE.venue };
  NET.clubs = [SAVE.club, SAVE.rival === SAVE.club ? CLUBS.find((c) => c.id !== SAVE.club).id : SAVE.rival];
  NET.lobby = [{ pid: 'h', name: SAVE.name, look: SAVE.look, cid: CID, team: 0 }];
  showScreen('scrLobby');
  setLobbyStatus('Creando sala…');
  renderLobby();
  hostRelayStart(NET.code);
  loadScript(LIB_QR).then(renderLobby).catch(() => { /* sin QR */ });
  if (!window.Peer) { setLobbyStatus('Sala lista (por relevo). Comparte el código, el link o el QR.'); return; }
  const peer = new Peer(PEER_PREFIX + NET.code, PEER_OPTS);
  NET.peer = peer;
  peer.on('open', () => { setLobbyStatus('Comparte el código, el link o el QR. Si no entra nadie, juegas contra la PC.'); renderLobby(); });
  peer.on('connection', (conn) => {
    conn.on('data', (d) => hostOnData(conn, d));
    conn.on('close', () => hostDrop(conn));
    conn.on('error', () => hostDrop(conn));
  });
  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') { hostCreate(); return; }
    if (NET.peer === peer) setLobbyStatus('La conexión directa no está disponible; tus amigos entrarán por relevo.');
  });
  peer.on('disconnected', () => { try { if (NET.peer === peer) peer.reconnect(); } catch (e) { /* ignorar */ } });
}
const teamCount = (t) => NET.lobby.filter((p) => p.team === t).length;
function hostOnData(conn, d) {
  if (!d || typeof d !== 'object') return;
  const c = NET.conns.get(conn.peer);
  if (c) c.lastT = performance.now();
  const pl = () => (M.net === 'host' ? M.players.find((x) => x.remote && x.pid === conn.peer) : null);
  switch (d.t) {
    case 'hello': {
      if (c) return;
      const cid = String(d.cid || '').slice(0, 24);
      let entry = cid ? NET.lobby.find((p) => p.cid === cid && p.pid !== 'h') : null;
      if (entry) {
        const old = NET.conns.get(entry.pid);
        if (old) { try { old.conn.close(); } catch (e) { /* ignorar */ } NET.conns.delete(entry.pid); }
        entry.pid = conn.peer;
      } else {
        if (NET.lobby.length >= MAX_HUMANS) { try { conn.send({ t: 'full' }); } catch (e) { /* ignorar */ } setTimeout(() => { try { conn.close(); } catch (e) { /* ignorar */ } }, 400); return; }
        entry = { pid: conn.peer, cid, team: teamCount(1) < teamCount(0) ? 1 : teamCount(0) < teamCount(1) ? 0 : 1 };
        NET.lobby.push(entry);
      }
      entry.name = String(d.name || 'Amigo').slice(0, 12);
      entry.look = sanitizeLook(d.look);
      NET.conns.set(conn.peer, { conn, rtt: 0.1, lastT: performance.now() });
      try { conn.send({ t: 'welcome', code: NET.code }); } catch (e) { /* ignorar */ }
      broadcastLobby();
      toast(entry.name + ' entró a la sala');
      SFX.ui();
      // partido en marcha y ya tenía jugador (se le cortó la conexión): vuelve a manejarlo
      if (M.net === 'host' && M.on && !M.ended && cid) {
        const p = M.players.find((x) => x.cid === cid);
        if (p) { Object.assign(p, { remote: true, pid: conn.peer, nt: null }); NET.ack.delete(conn.peer); sendStart(conn, p.id); toast(entry.name + ' vuelve al partido'); }
      }
      break;
    }
    case 'team': {
      const e = NET.lobby.find((p) => p.pid === conn.peer);
      if (e && !NET.started && teamCount(1 - e.team) < 4) { e.team = 1 - e.team; broadcastLobby(); }
      break;
    }
    case 'st': {
      const p = pl(), a = cleanState(d.p);
      if (!p || !a || (d.ko | 0) !== M.ko) return;
      applyState(p, a, false);
      p.stam = a[9] / 100;
      p.nt = { x: a[0] / 100, z: a[1] / 100, vx: a[6] / 10, vz: a[7] / 10, t: performance.now() / 1000 };
      if (!p.netSeen) { p.netSeen = true; p.x = p.nt.x; p.z = p.nt.z; }
      break;
    }
    case 'act': {
      const p = pl();
      if (!p || (d.ko | 0) !== M.ko) return;
      const a = String(d.a || '');
      if (['shoot', 'pass', 'skill', 'slide', 'tackle', 'call'].includes(a)) performAct(p, a, { ax: num(d.ax, -1, 1), az: num(d.az, -1, 1), pw: num(d.pw, 0, 1), loft: !!d.loft, aim: !!d.aim, side: d.side < 0 ? -1 : 1 });
      break;
    }
    case 'go': if (c && d.mid === NET.mid) NET.ack.add(conn.peer); break;
    case 'needstart': { const p = pl(); if (c && M.net === 'host' && M.on && !M.ended && p) sendStart(conn, p.id); break; }
    case 'pong': if (c) c.rtt = clamp((performance.now() - d.ts) / 1000, 0, 1); break;
    case 'cping': try { conn.send({ t: 'cpong', ts: d.ts }); } catch (e) { /* ignorar */ } break;
  }
}
function hostDrop(conn) {
  if (!NET.conns.has(conn.peer)) return;
  NET.conns.delete(conn.peer);
  const i = NET.lobby.findIndex((p) => p.pid === conn.peer);
  const e = i >= 0 ? NET.lobby.splice(i, 1)[0] : null;
  const p = M.net === 'host' ? M.players.find((x) => x.remote && x.pid === conn.peer) : null;
  if (p) { p.remote = false; p.nt = null; p.want.mx = p.want.mz = 0; }
  if (e) toast(e.name + ' salió' + (p && !M.ended ? ': la PC maneja a su jugador' : ''));
  broadcastLobby();
}
function broadcastLobby() {
  netSendAll({ t: 'lobby', players: NET.lobby.map((p) => ({ n: p.name, l: p.look, h: p.pid === 'h' ? 1 : 0, cid: p.cid, tm: p.team })), settings: NET.settings, clubs: NET.clubs, started: NET.started && M.on && !M.ended, mid: NET.mid });
  renderLobby();
}
function startMsg(id) {
  return {
    t: 'start', mid: NET.mid, size: M.size, dur: M.dur / 60, diff: M.diff, venue: M.venue, golden: M.golden ? 1 : 0, clubs: M.clubs, me: id, ko: M.ko,
    plist: M.players.map((p) => ({ n: p.name, l: p.look, tm: p.team, gk: p.gk ? 1 : 0, ix: p.idx, hu: p.human ? 1 : 0 })),
    sc: M.score, tm: M.time,
  };
}
function sendStart(conn, id) { try { conn.send(startMsg(id)); } catch (e) { /* ignorar */ } }
function hostStart() {
  const S = NET.settings;
  // equipos parejos: nadie se queda sin lugar
  const teams = [NET.lobby.filter((p) => p.team === 0), NET.lobby.filter((p) => p.team === 1)];
  while (teams[0].length > 4) teams[1].push(teams[0].pop());
  while (teams[1].length > 4) teams[0].push(teams[1].pop());
  const size = clamp(Math.max(+S.size || 3, teams[0].length, teams[1].length), 1, 4);
  const roster = [];
  teams.forEach((T, t) => T.forEach((p) => roster.push({ name: p.name, look: p.look, human: true, local: p.pid === 'h', remote: p.pid !== 'h', pid: p.pid, cid: p.cid, team: t })));
  NET.mid = genCode() + genCode(); NET.started = true; NET.ack = new Set(); NET.startT = 0; NET.snapT = 0;
  GAME.mode = 'online';
  newMatch({ mode: 'online', net: 'host', size, dur: +S.time || 3, diff: +S.diff || 0, venue: S.venue, golden: !!+S.golden, clubs: NET.clubs, roster, seed: hashStr(NET.mid) });
  enterMatchUI();
  for (const p of M.players) if (p.remote) { const cc = NET.conns.get(p.pid); if (cc) sendStart(cc.conn, p.id); }
  NET.startT = 1.2;
  broadcastLobby();
}
function connBusy(c) { const dc = c.conn && c.conn.dataChannel; return !!(dc && dc.bufferedAmount > 48000); }
function snapMsg() {
  const q = (v, k) => Math.round((+v || 0) * k);
  return {
    t: 's', mid: NET.mid, ph: PH.indexOf(M.phase), pt: q(M.phaseT, 100), ko: M.ko, tm: q(M.time, 10), go: M.goldenOn ? 1 : 0, kt: M.koTouch ? 1 : 0, sc: M.score,
    b: [q(B.x, 100), q(B.y, 100), q(B.z, 100), q(B.vx, 100), q(B.vy, 100), q(B.vz, 100)], bo: B.owner, bh: B.held ? 1 : 0, tr: B.trail, kb: B.kickBy,
    p: M.players.map(pState),
  };
}
function hostTick(dt) {
  NET.snapT += dt; NET.pingT += dt;
  NET.anyRelay = [...NET.conns.values()].some((c) => c.conn.relay);
  if (NET.snapT >= (NET.anyRelay ? 1 / 12 : 1 / 20)) {
    NET.snapT = 0;
    const s = snapMsg();
    for (const cc of NET.conns.values()) if (cc.conn.open && !connBusy(cc)) { try { cc.conn.send(s); } catch (e) { /* ignorar */ } }
  }
  if (NET.pingT >= 1) { NET.pingT = 0; netSendAll({ t: 'ping', ts: performance.now() }); }
  NET.startT -= dt;
  if (NET.startT <= 0 && !M.ended) {
    NET.startT = 1.2;
    for (const p of M.players) if (p.remote && !NET.ack.has(p.pid)) { const cc = NET.conns.get(p.pid); if (cc) sendStart(cc.conn, p.id); }
  }
  const humans = M.players.filter((p) => p.remote).length + 1;
  $('#netInfo').textContent = `🌐 Sala ${NET.code} · ${humans} persona${humans > 1 ? 's' : ''}`;
}
function netSendEnd() {
  netSendAll({ t: 'end', mid: NET.mid, sc: M.score, gold: M.goldenOn ? 1 : 0, st: M.players.map((p) => [p.st.g, p.st.a, p.st.sh, p.st.sv, p.st.tk, p.st.ps]) });
  NET.started = false;
  setTimeout(broadcastLobby, 200);
}

// ---------- invitado ----------
const CID = (() => { try { let v = localStorage.getItem('gp_cid'); if (!v) { v = Math.random().toString(36).slice(2, 14); localStorage.setItem('gp_cid', v); } return v; } catch (e) { return Math.random().toString(36).slice(2, 14); } })();
const helloMsg = () => ({ t: 'hello', name: SAVE.name, look: SAVE.look, cid: CID });
let askT = 0;
function askStart() { const now = performance.now(); if (now - askT < 1500) return; askT = now; netSend({ t: 'needstart' }); }
function clientJoin(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4) { setJoinStatus('Escribe el código de la sala'); return; }
  netReset();
  NET.role = 'client'; NET.code = code;
  setJoinStatus('Conectando…');
  let fellBack = false;
  const fallback = () => {
    if (fellBack || NET.role !== 'client' || NET.code !== code || NET.welcomed) return;
    fellBack = true;
    const peer = NET.peer;
    NET.peer = null;
    if (NET.hostConn && !NET.hostConn.relay) NET.hostConn = null;
    try { if (peer) peer.destroy(); } catch (e) { /* ignorar */ }
    clientRelayJoin(code);
  };
  if (!window.Peer || new URLSearchParams(location.search).has('relevo')) { fallback(); return; }
  const peer = new Peer(PEER_OPTS);
  NET.peer = peer;
  const to = setTimeout(fallback, 7000);
  peer.on('open', () => {
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
    NET.hostConn = conn; NET.via = 'directa';
    conn.on('open', () => { clearTimeout(to); conn.send(helloMsg()); setJoinStatus('¡Conectado!'); });
    conn.on('data', (d) => { NET.lastHostMsg = performance.now(); clientOnData(d); });
    conn.on('close', () => { if (NET.peer === peer && NET.hostConn === conn) { if (NET.welcomed) clientReconnect(); else fallback(); } });
    conn.on('error', fallback);
    setTimeout(() => {
      const pc = conn.peerConnection;
      if (pc) pc.addEventListener('iceconnectionstatechange', () => { if (pc.iceConnectionState === 'failed') fallback(); });
    }, 0);
  });
  peer.on('error', () => { clearTimeout(to); fallback(); });
}
function clientOnData(d) {
  if (!d || typeof d !== 'object') return;
  NET.lastHostMsg = performance.now();
  switch (d.t) {
    case 'welcome': NET.code = String(d.code || NET.code); NET.welcomed = true; if (GAME.mode === 'menu') showScreen('scrLobby'); renderLobby(); break;
    case 'hostbye': if (NET.role === 'client') { toast('El anfitrión cerró la sala'); leaveToMenu(); } break;
    case 'full': setJoinStatus('La sala ya está llena (8 personas)'); break;
    case 'lobby': {
      NET.lobby = (Array.isArray(d.players) ? d.players : []).slice(0, MAX_HUMANS).map((p) => ({ pid: p.h ? 'h' : 'g', name: String(p.n || 'Jugador').slice(0, 12), look: sanitizeLook(p.l), cid: String(p.cid || ''), team: p.tm ? 1 : 0 }));
      const s = d.settings || {};
      NET.settings = { size: clamp(s.size | 0, 1, 4) || 3, time: TIMES.includes(+s.time) ? +s.time : 3, diff: clamp(s.diff | 0, 0, 2), golden: s.golden ? 1 : 0, venue: VENUES[s.venue] ? s.venue : 'estadio' };
      if (Array.isArray(d.clubs)) NET.clubs = [clubOf(d.clubs[0]).id, clubOf(d.clubs[1]).id];
      NET.started = !!d.started;
      renderLobby();
      if (d.started && d.mid && !(M.net === 'client' && CL.mid === d.mid && M.on)) askStart();
      break;
    }
    case 'start': clientStart(d); break;
    case 's':
      if (M.net === 'client' && d.mid === CL.mid) clientSnap(d);
      else askStart();
      break;
    case 'ev': if (M.net === 'client' && d.mid === CL.mid && Array.isArray(d.e)) for (const e of d.e.slice(0, 40)) clientEvent(e); break;
    case 'end': if (M.net === 'client' && d.mid === CL.mid) clientEnd(d); break;
    case 'ping': netSend({ t: 'pong', ts: d.ts }); break;
    case 'cpong': NET.rtt = damp(NET.rtt, clamp((performance.now() - d.ts) / 1000, 0, 1), 3, 1); break;
    case 'tolobby': if (M.net === 'client') backToLobby(); break;
  }
}
function clientStart(d) {
  if (!Array.isArray(d.plist) || !d.plist.length || d.plist.length > 10) return;
  const me = clamp(d.me | 0, 0, d.plist.length - 1);
  if (!(M.net === 'client' && CL.mid === d.mid && M.on && !M.ended)) {
    GAME.mode = 'online';
    const plist = d.plist.map((q) => ({ n: String((q && q.n) || 'Jugador').slice(0, 12), l: sanitizeLook(q && q.l), tm: q && q.tm ? 1 : 0, gk: q && q.gk ? 1 : 0, ix: (q && q.ix) | 0, hu: q && q.hu ? 1 : 0 }));
    newMatch({ mode: 'online', net: 'client', size: clamp(d.size | 0, 1, 4), dur: num(d.dur, 1, 10), diff: clamp(d.diff | 0, 0, 2), venue: d.venue, golden: !!d.golden, clubs: Array.isArray(d.clubs) ? [clubOf(d.clubs[0]).id, clubOf(d.clubs[1]).id] : [SAVE.club, SAVE.rival], plist, me });
    if (Array.isArray(d.sc)) M.score = [d.sc[0] | 0, d.sc[1] | 0];
    M.ko = -1;
    CL.mid = d.mid; CL.buf = [];
    enterMatchUI();
  }
  netSend({ t: 'go', mid: d.mid });
}
function clientSnap(s) {
  if (!Array.isArray(s.p) || !Array.isArray(s.b)) return;
  const me = M.players[M.me];
  M.phase = PH[s.ph | 0] || 'play'; M.phaseT = num(s.pt, -99, 999) / 100;
  M.time = num(s.tm, -99, 9999) / 10; M.goldenOn = !!s.go; M.koTouch = !!s.kt;
  if (Array.isArray(s.sc)) { const n0 = s.sc[0] | 0, n1 = s.sc[1] | 0; if (n0 !== M.score[0] || n1 !== M.score[1]) { M.score = [n0, n1]; drawJumbo(); } }
  B.owner = clamp(s.bo | 0, -1, M.players.length - 1); B.held = !!s.bh; B.trail = s.tr ? 1 : 0; B.kickBy = s.kb | 0;
  // saque nuevo: me coloco donde dice el anfitrión
  if ((s.ko | 0) !== M.ko && me) {
    M.ko = s.ko | 0;
    const a = cleanState(s.p[M.me]);
    if (a) { placeP(me, a[0] / 100, a[1] / 100); me.ry = a[3] / 1000; }
    CAM.snap = true;
  }
  if (me) { const a = cleanState(s.p[M.me]); if (a) { const fl = a[8] | 0; if (fl & 1 && me.fallT <= 0) { /* el anfitrión dice que caí */ } } }
  CL.buf.push({ t: performance.now() / 1000, s });
  if (CL.buf.length > 40) CL.buf.shift();
  $('#netInfo').textContent = `🌐 Sala ${NET.code} · ${NET.via === 'relevo' ? 'por relevo' : 'conexión directa'}`;
}
// los demás jugadores y el balón se dibujan un poco en el pasado, interpolando
function clientInterp() {
  const B2 = CL.buf;
  if (!B2.length) return;
  const rt = performance.now() / 1000 - (NET.via === 'relevo' ? 0.17 : 0.1);
  let i0 = 0;
  for (let i = B2.length - 1; i >= 0; i--) if (B2[i].t <= rt) { i0 = i; break; }
  const s0 = B2[i0].s, s1 = B2[i0 + 1] ? B2[i0 + 1].s : null;
  const k = s1 ? clamp((rt - B2[i0].t) / Math.max(0.001, B2[i0 + 1].t - B2[i0].t), 0, 1) : 0;
  const L = (a, b, j, sc) => (b ? lerp(a[j], b[j], k) : a[j]) / sc;
  M.players.forEach((p, i) => {
    if (i === M.me) return;
    const a = cleanState(s0.p[i]), b = s1 ? cleanState(s1.p[i]) : null;
    if (!a) return;
    p.x = L(a, b, 0, 100); p.z = L(a, b, 1, 100); p.y = Math.max(0, L(a, b, 2, 100));
    p.ry = a[3] / 1000 + (b ? wrapA(b[3] / 1000 - a[3] / 1000) * k : 0);
    const src = b && k > 0.5 ? b : a;
    p.anim = ANIMS[src[4] | 0] || ''; p.animT = src[5] / 100 + (b && src === a ? 0 : 0);
    p.vx = L(a, b, 6, 10); p.vz = L(a, b, 7, 10);
    const fl = src[8] | 0;
    p.callT = fl & 32 ? 0.3 : 0; p.fallT = fl & 1 ? 0.1 : 0; p.slideT = fl & 2 ? 0.1 : 0; p.diveT = fl & 4 ? 0.1 : 0; p.chargeT = fl & 64 ? 0.2 : -1;
  });
  const me = M.players[M.me];
  if (me && B.owner === M.me) { attachBall(me, 1 / 60); }
  else {
    const a = s0.b, b = s1 ? s1.b : null;
    B.x = L(a, b, 0, 100); B.y = L(a, b, 1, 100); B.z = L(a, b, 2, 100); B.vx = L(a, b, 3, 100); B.vy = L(a, b, 4, 100); B.vz = L(a, b, 5, 100);
  }
  syncRB();
}
// mi jugador: lo muevo yo (respuesta inmediata) y choco con los demás
function clientLocalStep(dt) {
  const me = M.players[M.me];
  if (!me) return;
  if (M.phase === 'play') humanControl(me, LOCAL, dt);
  else { me.want.mx = me.want.mz = 0; me.want.sprint = false; me.chargeT = -1; me.passHold = -1; clearLocalEdges(); }
  timers(me, dt);
  movePlayer(me, dt);
  for (const q of M.players) {
    if (q === me || me.slideT > 0 || q.slideT > 0) continue;
    const dx = me.x - q.x, dz = me.z - q.z, d = hyp(dx, dz);
    if (d < PR * 2 && d > 1e-4) { me.x += (dx / d) * (PR * 2 - d); me.z += (dz / d) * (PR * 2 - d); }
  }
  boundP(me);
}
function clientEvent(e) {
  if (!e || typeof e.t !== 'string') return;
  const me = M.players[M.me];
  if (e.t === 'trip' && me && e.id === M.me) { me.fallT = 0.85; me.anim = 'lie'; me.animT = -0.35; me.slideT = 0; me.chargeT = -1; me.passHold = -1; me.skillT = 0; }
  if (e.t === 'kick' || e.t === 'touch' || e.t === 'tackle') { for (const p of M.players) if (p.id === e.id && p !== me) p.kickCD = 0.3; }
  if (e.t === 'goal' && Array.isArray(e.sc)) { M.score = [e.sc[0] | 0, e.sc[1] | 0]; M.lastGoal = { team: e.team | 0, by: e.by | 0, as: e.as | 0, own: !!e.own, kind: e.k }; }
  if (e.t === 'kick' && e.id === M.me && me) me.kickCD = 0.3;
  handleEvent(e);
}
function clientTick(dt) {
  const me = M.players[M.me];
  if (!me) return;
  NET.sendT += dt;
  if (NET.sendT >= (NET.via === 'relevo' ? 1 / 15 : 1 / 20)) { NET.sendT = 0; netSend({ t: 'st', ko: M.ko, p: pState(me) }); }
}
function clientEnd(d) {
  if (M.ended) return;
  if (Array.isArray(d.sc)) M.score = [d.sc[0] | 0, d.sc[1] | 0];
  M.goldenOn = !!d.gold;
  if (Array.isArray(d.st)) d.st.forEach((a, i) => { const p = M.players[i]; if (p && Array.isArray(a)) p.st = { g: a[0] | 0, a: a[1] | 0, sh: a[2] | 0, sv: a[3] | 0, tk: a[4] | 0, ps: a[5] | 0 }; });
  M.ended = true; M.phase = 'end';
  showEndScreen();
}
function backToLobby() {
  GAME.mode = 'menu'; GAME.paused = false;
  $('#hud').classList.remove('on'); $('#touchUI').classList.remove('on');
  endReplay(); clearTags();
  const role = NET.role;
  M.net = 'off';
  startDemo();
  if (role !== 'off') { showScreen('scrLobby'); renderLobby(); } else showScreen('scrMenu');
}

// ---------- sala ----------
function setLobbyStatus(s) { $('#lStatus').textContent = s; }
function setJoinStatus(s) { $('#jStatus').textContent = s; }
function renderLobby() {
  $('#lCode').textContent = NET.code || '-----';
  $('#lLink').value = NET.code ? linkFor(NET.code) : '';
  const qrBox = $('#lQr');
  if (NET.code && window.qrcode && qrBox.dataset.code !== NET.code) {
    try { const q = window.qrcode(0, 'M'); q.addData(linkFor(NET.code)); q.make(); qrBox.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); qrBox.dataset.code = NET.code; } catch (e) { /* sin QR */ }
  }
  const host = NET.role === 'host', S = NET.settings, kits = kitsFor(NET.clubs[0], NET.clubs[1]);
  $('#qrRow').style.display = NET.code && host ? '' : 'none';
  const size = clamp(Math.max(+S.size || 3, teamCount(0), teamCount(1)), 1, 4);
  $('#lTeams').innerHTML = [0, 1].map((t) => {
    const c = clubOf(NET.clubs[t]), P = NET.lobby.filter((p) => p.team === t);
    const rows = P.map((p) => { const me = host ? p.pid === 'h' : p.cid === CID; return `<div class="pl">${escapeHtml(p.name)}${me ? ' <em>(tú)</em>' : ''}${p.pid === 'h' ? ' <em>👑</em>' : ''}</div>`; }).join('');
    const cpu = Math.max(0, size - P.length);
    return `<div class="tcol"><h4><i style="background:${kits[t].shirt}"></i>${c.emoji} ${c.name}</h4>${rows}${cpu ? `<div class="pl cpu">🤖 PC ×${cpu}</div>` : ''}<div class="pl cpu">🧤 Portero PC</div></div>`;
  }).join('');
  venueCards($('#lVenues'), S.venue, host ? pickLobbyVenue : null);
  $('#lHostOpts').style.display = host ? '' : 'none';
  const V = venueOf(S.venue);
  $('#lGuestInfo').textContent = host ? '' : `${V.emoji} ${V.name} · ${size} vs ${size} · ${S.time} min${S.golden ? ' · gol de oro' : ''}`;
  $('#bStart').style.display = host ? '' : 'none';
  $('#bStart').textContent = NET.lobby.length > 1 ? `¡Empezar partido! (${NET.lobby.length} personas)` : 'Empezar contra la PC';
  $$('[data-lopt]').forEach((row) => { const k = row.dataset.lopt; row.querySelectorAll('.chip').forEach((c) => c.classList.toggle('sel', c.dataset.v === String(+S[k]))); });
  if (!host) setLobbyStatus(NET.started ? 'Partido en marcha: entrando…' : `Esperando a que el anfitrión empiece… · ${NET.via === 'relevo' ? 'conectado por relevo' : 'conexión directa'}`);
}
function pickLobbyVenue(id) {
  if (NET.role !== 'host') return;
  NET.settings.venue = id; SAVE.venue = id; storeSave();
  if (GAME.mode === 'menu') startDemo();
  broadcastLobby();
}
$('#bHost').onclick = () => { SFX.resume(); SFX.ui(); hostCreate(); };
$('#bJoin').onclick = () => { SFX.resume(); clientJoin($('#jCode').value); };
$('#jCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') clientJoin($('#jCode').value); });
$('#bStart').onclick = () => { SFX.resume(); if (NET.role === 'host') hostStart(); };
$('#bLeave').onclick = () => { SFX.ui(); leaveToMenu(); };
$('#bSwap').onclick = () => {
  SFX.ui();
  if (NET.role === 'host') { const e = NET.lobby[0]; if (teamCount(1 - e.team) < 4) { e.team = 1 - e.team; broadcastLobby(); } }
  else netSend({ t: 'team' });
};
$('#bCopy').onclick = () => {
  const v = $('#lLink').value;
  const ok = () => toast('Link copiado: pásaselo a tus amigos');
  if (navigator.clipboard) navigator.clipboard.writeText(v).then(ok).catch(() => { $('#lLink').select(); document.execCommand('copy'); ok(); });
  else { $('#lLink').select(); document.execCommand('copy'); ok(); }
};
$$('[data-lopt]').forEach((row) => row.addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c || NET.role !== 'host') return;
  const k = row.dataset.lopt, v = +c.dataset.v;
  NET.settings[k] = v;
  if (k in SAVE) SAVE[k] = v;
  storeSave(); SFX.ui();
  broadcastLobby();
}));

// ---------- relevo (plan B): si la conexión directa falla, los mensajes viajan por un servidor MQTT público ----------
const RELAY_BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
const LIB_MQTT = 'https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.min.js';
const LIB_QR = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
const scriptCache = {};
function loadScript(src) {
  if (!scriptCache[src]) {
    scriptCache[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = res;
      s.onerror = () => { delete scriptCache[src]; rej(new Error('no se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }
  return scriptCache[src];
}
const rTopic = (code, k) => `golazopark/v1/${code}/${k}`;
function relayConnectOne(i) {
  return loadScript(LIB_MQTT).then(() => new Promise((res, rej) => {
    let done = false;
    const cl = window.mqtt.connect(RELAY_BROKERS[i], { clientId: 'gp_' + Math.random().toString(36).slice(2, 12), clean: true, connectTimeout: 7000, reconnectPeriod: 2500, keepalive: 30 });
    cl.on('connect', () => {
      for (const tp of cl.dpTopics || []) cl.subscribe(tp);
      if (!done) { done = true; res(cl); }
    });
    cl.dpSub = (tp) => { cl.dpTopics = (cl.dpTopics || []).concat(tp); cl.subscribe(tp); };
    cl.on('error', () => { /* reintenta solo */ });
    setTimeout(() => { if (!done) { done = true; try { cl.end(true); } catch (e) { /* ignorar */ } rej(new Error('relay timeout')); } }, 8000);
  }));
}
const waitFor = (fn, ms) => new Promise((res) => {
  const t0 = performance.now();
  const iv = setInterval(() => { if (fn()) { clearInterval(iv); res(true); } else if (performance.now() - t0 > ms) { clearInterval(iv); res(false); } }, 100);
});
function hostRelayStart(code) {
  RELAY_BROKERS.forEach((_, i) => {
    relayConnectOne(i).then((cl) => {
      if (NET.role !== 'host' || NET.code !== code) { cl.end(true); return; }
      NET.relays.push(cl);
      cl.dpSub(rTopic(code, 'h'));
      cl.on('message', (tp, payload) => {
        let m;
        try { m = JSON.parse(payload.toString()); } catch (e) { return; }
        if (m && typeof m.f === 'string') hostRelayMsg(cl, m.f.slice(0, 16), m.d);
      });
    }).catch(() => { /* ese servidor no responde: queda el otro */ });
  });
}
function hostRelayMsg(cl, cid, d) {
  const key = 'relay:' + cid;
  let v = NET.relayConns.get(key);
  if (!v) {
    if (!d || d.t !== 'hello') return;
    v = { peer: key, open: true, relay: true, lastT: 0, send(msg) { if (this.open) cl.publish(rTopic(NET.code, 'c/' + cid), JSON.stringify(msg)); }, close() { this.open = false; } };
    NET.relayConns.set(key, v);
  }
  v.lastT = performance.now();
  if (d && d.t === 'bye') { v.open = false; NET.relayConns.delete(key); hostDrop(v); return; }
  hostOnData(v, d);
}
async function clientRelayJoin(code) {
  setJoinStatus('Probando conexión por servidor de relevo…');
  const cid = Math.random().toString(36).slice(2, 12);
  for (let i = 0; i < RELAY_BROKERS.length; i++) {
    let cl;
    try { cl = await relayConnectOne(i); } catch (e) { continue; }
    if (NET.role !== 'client' || NET.code !== code) { cl.end(true); return; }
    const conn = {
      open: true, relay: true,
      send(msg) { if (this.open) cl.publish(rTopic(code, 'h'), JSON.stringify({ f: cid, d: msg })); },
      close() { try { this.send({ t: 'bye' }); } catch (e) { /* ignorar */ } this.open = false; setTimeout(() => { try { cl.end(true); } catch (e) { /* ignorar */ } }, 200); },
    };
    cl.dpSub(rTopic(code, 'c/' + cid));
    cl.on('message', (tp, payload) => {
      if (NET.hostConn !== conn) return;
      let m;
      try { m = JSON.parse(payload.toString()); } catch (e) { return; }
      NET.lastHostMsg = performance.now();
      clientOnData(m);
    });
    NET.relays.push(cl);
    NET.hostConn = conn; NET.via = 'relevo'; NET.welcomed = false;
    NET.lastHostMsg = performance.now();
    conn.send(helloMsg());
    if (await waitFor(() => NET.welcomed, 6000)) { setJoinStatus('¡Conectado (por relevo)!'); return; }
    conn.close();
    if (NET.hostConn === conn) NET.hostConn = null;
  }
  if (NET.role === 'client' && NET.code === code) setJoinStatus('No se pudo conectar. Revisa el código, que la sala siga abierta en el otro dispositivo y tu internet.');
}
// latidos: el anfitrión detecta invitados caídos; el invitado detecta anfitrión caído
setInterval(() => {
  const now = performance.now();
  if (NET.role === 'host') {
    if (M.net !== 'host') netSendAll({ t: 'ping', ts: now });
    for (const [key, v] of NET.relayConns) if (now - v.lastT > 15000) { v.open = false; NET.relayConns.delete(key); hostDrop(v); }
    for (const c of NET.conns.values()) if (!c.conn.relay && c.lastT && now - c.lastT > 20000) { try { c.conn.close(); } catch (e) { /* ignorar */ } hostDrop(c.conn); }
  } else if (NET.role === 'client') {
    if (NET.hostConn && NET.hostConn.open) netSend({ t: 'cping', ts: now });
    if (NET.welcomed && now - NET.lastHostMsg > 6000) clientReconnect();
    if (NET.lostSince && now - NET.lostSince > 40000) { toast('Se perdió la conexión con el anfitrión'); leaveToMenu(); }
  }
}, 2000);
function clientReconnect() {
  if (NET.reconnecting || NET.role !== 'client') return;
  NET.reconnecting = true;
  NET.lostSince = NET.lostSince || performance.now();
  toast('Reconectando con el anfitrión…', 2500);
  const code = NET.code, old = NET.hostConn, peer = NET.peer;
  NET.welcomed = false; NET.hostConn = null; NET.peer = null;
  try { if (old) old.close(); } catch (e) { /* ignorar */ }
  try { if (peer) peer.destroy(); } catch (e) { /* ignorar */ }
  for (const cl of NET.relays) { try { cl.end(true); } catch (e) { /* ignorar */ } }
  NET.relays = [];
  clientRelayJoin(code).finally(() => {
    NET.reconnecting = false;
    if (NET.welcomed) { NET.lostSince = 0; toast('¡Conectado otra vez!', 1500); }
    else NET.lastHostMsg = performance.now() - 4000;
  });
}

// =========================================================
//  CALIDAD Y BUCLE PRINCIPAL
// =========================================================
const QUALITY = {
  alta: { name: 'Alta', pr: 2, sh: 2048, shadows: true, outlines: true, parts: 1 },
  media: { name: 'Media', pr: 1.25, sh: 1024, shadows: true, outlines: true, parts: 0.7 },
  baja: { name: 'Baja', pr: 1, sh: 512, shadows: false, outlines: false, parts: 0.45 },
};
const Q_ORDER = ['auto', 'alta', 'media', 'baja'];
let QL = '';
const qualityPref = () => SAVE.quality || 'auto';
function applyQuality(name) {
  const q = QUALITY[name];
  if (!q) return;
  QL = name;
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.pr));
  onResize();
  if (sun.shadow.mapSize.x !== q.sh) { sun.shadow.mapSize.set(q.sh, q.sh); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  if (renderer.shadowMap.enabled !== q.shadows) {
    renderer.shadowMap.enabled = q.shadows;
    for (const sc of [scene, garage]) sc.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
  }
  OUTLINES = q.outlines;
  for (const sc of [scene, garage]) sc.traverse((o) => { if (o.userData.ol) o.visible = OUTLINES; });
  PART_SCALE = q.parts;
  syncQualityBtn();
}
function startQuality() { const p = qualityPref(); applyQuality(p === 'auto' ? SAVE.autoQ || (IS_TOUCH ? 'media' : 'alta') : p); }
const FPSM = { t: 0, f: 0, low: 0 };
function autoQuality(rawDt) {
  if (qualityPref() !== 'auto' || GAME.mode === 'menu' || document.hidden || GAME.paused || rawDt > 0.4) { FPSM.t = 0; FPSM.f = 0; return; }
  FPSM.t += rawDt; FPSM.f++;
  if (FPSM.t < 2.5) return;
  const fps = FPSM.f / FPSM.t;
  FPSM.t = 0; FPSM.f = 0;
  if (fps >= 45) { FPSM.low = 0; return; }
  if (++FPSM.low < 2) return;
  FPSM.low = 0;
  const next = QL === 'alta' ? 'media' : QL === 'media' ? 'baja' : null;
  if (!next) return;
  SAVE.autoQ = next; storeSave();
  applyQuality(next);
  toast('⚙️ Calidad ajustada a ' + QUALITY[next].name + ' para que el juego vaya más fluido', 3000);
}
function syncQualityBtn() {
  const p = qualityPref();
  $('#bQuality').textContent = '⚙️ Calidad: ' + (p === 'auto' ? 'Automática (' + (QUALITY[QL] ? QUALITY[QL].name : '…') + ')' : QUALITY[p].name);
}
$('#bQuality').onclick = () => {
  const p = qualityPref();
  SAVE.quality = Q_ORDER[(Q_ORDER.indexOf(p) + 1) % Q_ORDER.length];
  if (SAVE.quality === 'auto') SAVE.autoQ = null;
  storeSave(); startQuality(); SFX.ui();
};


let last = performance.now(), acc = 0, lastRaf = 0, lastWk = 0;
function simAdvance(dt) {
  if (M.net === 'client') return;
  if (GAME.paused && M.net === 'off') { M.events.length = 0; return; }
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 6) { simStep(STEP); acc -= STEP; n++; }
  if (n >= 6) acc = 0;
  const evs = M.events.splice(0);
  for (const e of evs) handleEvent(e);
  if (M.net === 'host') {
    if (evs.length) netSendAll({ t: 'ev', mid: NET.mid, e: evs });
    hostTick(dt);
  }
}
// con la pestaña oculta el navegador frena requestAnimationFrame:
// un worker mantiene vivo el partido del anfitrión para sus amigos
try {
  const wk = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),16)'], { type: 'text/javascript' })));
  wk.onmessage = () => {
    const now = performance.now();
    if (now - lastRaf < 250) { lastWk = now; return; }
    const dt = Math.min(0.12, (now - lastWk) / 1000);
    lastWk = now;
    if (M.on && M.net === 'host') { hostRemotes(dt); simAdvance(dt); syncRB(); }
  };
} catch (e) { /* sin worker: solo funciona con la pestaña visible */ }
function crowdLevel() {
  if (!M.on || GAME.mode === 'menu') return 0.12;
  const d = Math.min(Math.abs(RB.x - F.HL), Math.abs(RB.x + F.HL));
  const k = M.phase === 'play' ? 1 - clamp(d / 14, 0, 1) : 0;
  return clamp(0.18 + k * 0.45 + WORLD.excite * 0.5, 0, 1);
}
function frame(now) { requestAnimationFrame(frame); frameBody(now); }
function frameBody(now) {
  lastRaf = performance.now();
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.05, Math.max(0, rawDt));
  last = now;
  autoQuality(rawDt);
  if (GAME.screen === 'scrCustom') { renderGarage(dt); return; }
  if (M.on) {
    if (inMatch()) readInput(); else { LOCAL.mx = LOCAL.mz = 0; LOCAL.sprint = LOCAL.shoot = LOCAL.pass = false; }
    if (M.net === 'host') hostRemotes(dt);
    if (M.net === 'client') { M.events.length = 0; clientInterp(); clientLocalStep(dt); clientTick(dt); }
    else { simAdvance(dt); syncRB(); }
    if (M.phase === 'replay' && !RP.on) startReplay();
    else if (M.phase !== 'replay' && RP.on) endReplay();
    if (RP.on) replayFrame(dt); else recordFrame(dt);
    renderPlayers(dt);
    renderBall(dt);
    if (GAME.mode !== 'menu' && GAME.screen !== 'scrEnd') updateHud(dt);
  }
  SFX.crowd(crowdLevel());
  updateCamera(dt);
  updateWorld(dt, now / 1000);
  SPARKS.update(dt); SMOKE.update(dt); CONF.update(dt);
  renderer.render(scene, camera);
}
// para probar: window.__GP.ff(segundos) adelanta la simulación; __GP.tick(n) avanza cuadros completos
window.__GP = {
  M, B, NET, LOCAL, SAVE, RP, get F() { return F; },
  ff(s) { for (let i = 0; i < s * 60; i++) simStep(STEP); for (const e of M.events.splice(0)) handleEvent(e); syncRB(); },
  step(n) { const ev = []; for (let i = 0; i < n; i++) { simStep(STEP); for (const e of M.events.splice(0)) ev.push(e); } syncRB(); return ev; },
  tick(n = 1) { for (let i = 0; i < n; i++) { last = performance.now() - 16.7; frameBody(performance.now()); } },
  give() { const me = M.players[M.me]; if (me) { B.owner = me.id; B.held = false; } },
  startQuick, startTut, startCupMatch, hostStart, performAct, doShoot, tutSetup,
};

// ---------- arranque ----------
if (IS_TOUCH) document.body.classList.add('touch');
startQuality();
syncPauseBtns();
dailyInit();
startDemo();
showScreen('scrMenu');
addEventListener('pointerdown', () => { SFX.resume(); if (GAME.mode === 'menu' && SAVE.music) SFX.music(true); }, { once: true });
{
  const sala = new URLSearchParams(location.search).get('sala');
  if (sala) { showScreen('scrJoin'); $('#jCode').value = sala.toUpperCase(); setTimeout(() => clientJoin(sala), 300); }
}
requestAnimationFrame(frame);
