// Gatorback Delta — boot, loop, player, vehicles, combat, save and staging.
// The whole game runs from this file plus delta.js (the map), actors.js
// (traffic, pedestrians, police), missions.js (the story) and hud.js.

import { buildDelta, paintTerrain, drawBuildingsAndTrees, isWaterAt, isRoadAt, isMarshAt, isBridgeAt, clampToWorld, WORLD_W, WORLD_H } from './delta.js';
import { makeSeeded, clampNum, dist2, angleTo, easeToward } from './seeded.js';
import { spawnTraffic, spawnPedestrians, updateTraffic, updatePedestrians, updatePolice, updateBullets, drawVehicle, drawPerson } from './actors.js';
import { buildMissions, missionIntro, currentStep, missionHudText } from './missions.js';
import { makeDawnAudio } from './audio.js';
import { refreshHud, setObjectiveHtml, showToast, hideToastIfDue, showDialogue, hideDialogue, drawMinimap, setMenuVisibility, missionListHtml } from './hud.js';

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const SAVE_KEY = 'gatorback-delta-save-v1';

const G = {
  state: 'title', // title | play | pause | busted
  time: 0,
  cash: 40,
  wanted: 0,
  wantedTimer: 0,
  missionIndex: 0,
  missions: [],
  delta: null,
  terrain: null,
  player: null,
  vehicles: [],
  traffic: [],
  peds: [],
  police: [],
  bullets: [],
  armored: null,
  cam: { x: 0, y: 0, w: 1280, h: 720 },
  keys: {},
  mouse: { x: 640, y: 360, down: false },
  dialogueOpen: false,
  toastUntil: 0,
  flashRed: 0,
  shotsFired: 0,
  shootCooldown: 0,
  stealCooldown: 0,
  busted: false,
  fogBlobs: [],
  audio: makeDawnAudio(),
  shot: null,
};

G.addWanted = function (n) {
  const before = G.wanted;
  G.wanted = clampNum(G.wanted + n, 0, 5);
  if (G.wanted > before) {
    G.audio.wanted();
    if (G.wanted >= 3) showToast(G, '★'.repeat(G.wanted) + ' — every deputy in the parish is coming!', 3);
  }
};
G.toast = function (text, seconds) { showToast(G, text, seconds); };

function newPlayer(x, y) {
  return { x, y, angle: -Math.PI / 2, speed: 0, health: 100, vehicle: null, shirt: '#c96a3b' };
}

function freshWorld() {
  G.delta = buildDelta(7);
  G.terrain = paintTerrain(G.delta);
  G.missions = buildMissions(G.delta);
  G.missionIndex = 0;
  G.cash = 40;
  G.wanted = 0;
  G.wantedTimer = 0;
  G.time = 0;
  G.police = [];
  G.bullets = [];
  G.armored = null;
  G.busted = false;
  G.shotsFired = 0;
  G.player = newPlayer(G.delta.spawnFoot.x, G.delta.spawnFoot.y);
  G.vehicles = [];
  const carSpots = [
    [740, 860, 0.2], [860, 860, -0.3], [560, 990, 1.6], [940, 990, 0.1],
    [2900, 860, 0], [2900, 940, 0.4], [600, 1850, 1.57], [620, 1950, -1.57],
  ];
  const colors = ['#b8442e', '#3e6b9e', '#c9a13b', '#5a7d4a', '#7a4a8a', '#9e9a8a', '#2e4a5a', '#8a3a3a'];
  carSpots.forEach(([x, y, a], i) => {
    G.vehicles.push({ kind: 'sedan', x, y, angle: a, speed: 0, color: colors[i % colors.length] });
  });
  G.vehicles.push({ kind: 'airboat', x: G.delta.spawnAirboat.x, y: G.delta.spawnAirboat.y, angle: 0.6, speed: 0 });
  spawnTraffic(G, 10);
  spawnPedestrians(G, 16);
  const frnd = makeSeeded(41);
  G.fogBlobs = [];
  for (let i = 0; i < 26; i++) {
    G.fogBlobs.push({ x: frnd() * WORLD_W, y: frnd() * WORLD_H, r: 180 + frnd() * 260, drift: 0.1 + frnd() * 0.25, phase: frnd() * 6 });
  }
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  G.cam.w = canvas.width;
  G.cam.h = canvas.height;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function worldFromScreen(sx, sy) {
  return { x: G.cam.x + sx, y: G.cam.y + sy };
}

function blockedByBuilding(x, y, pad) {
  for (const b of G.delta.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(y - b.y) < b.h / 2 + pad) return true;
  }
  return false;
}

function tryEnterVehicle() {
  const p = G.player;
  if (p.vehicle) {
    const v = p.vehicle;
    v.x = p.x + Math.cos(p.angle + Math.PI / 2) * 30;
    v.y = p.y + Math.sin(p.angle + Math.PI / 2) * 30;
    v.speed = 0;
    p.vehicle = null;
    p.x = v.x; p.y = v.y;
    G.audio.setEngine(0, false);
    return;
  }
  let best = null, bestD = 90;
  for (const v of G.vehicles) {
    const d = dist2(p.x, p.y, v.x, v.y);
    if (d < bestD) { best = v; bestD = d; }
  }
  if (best) {
    p.vehicle = best;
    p.x = best.x; p.y = best.y; p.angle = best.angle;
    if (best.kind === 'sedan') { G.addWanted(1); showToast(G, 'Car stolen — the parish noticed', 2.5); }
    if (best.kind === 'airboat') showToast(G, 'Borrowed airboat — fan her up', 2.5);
    return;
  }
  // Maybe a traffic car is close enough to steal.
  for (const car of G.traffic) {
    if (dist2(p.x, p.y, car.x, car.y) < 70) {
      G.traffic = G.traffic.filter((c) => c !== car);
      const v = { kind: car.kind === 'pickup' ? 'pickup' : 'sedan', x: car.x, y: car.y, angle: car.angle, speed: 0, color: car.color };
      G.vehicles.push(v);
      p.vehicle = v;
      p.x = v.x; p.y = v.y; p.angle = v.angle;
      G.addWanted(1);
      showToast(G, 'Carjacked on the causeway — deputies alerted', 2.5);
      return;
    }
  }
}

function tryInteract() {
  const p = G.player;
  const m = G.missions[G.missionIndex];
  if (G.dialogueOpen) { hideDialogue(G); return; }
  // Start a mission by talking to its giver.
  if (m && !m.started) {
    const giver = G.missionIndex <= 1 ? G.delta.deliaSpot : G.delta.silasSpot;
    if (dist2(p.x, p.y, giver.x, giver.y) < 130) {
      m.started = true;
      m.stepIndex = 0;
      const [speaker, line] = missionIntro(G.missionIndex);
      showDialogue(G, speaker, line);
      if (G.missionIndex === 2) G.addWanted(0);
      return;
    }
  }
  // Steal the armored truck (mission 4 step).
  if (m && m.started) {
    const step = currentStep(m);
    if (step && step.kind === 'steal' && G.armored && dist2(p.x, p.y, G.armored.x, G.armored.y) < 110) {
      G.vehicles.push(G.armored);
      p.vehicle = G.armored;
      p.x = G.armored.x; p.y = G.armored.y; p.angle = G.armored.angle;
      G.addWanted(2);
      showToast(G, 'Armored truck is yours — RUN!', 3);
      return;
    }
  }
  tryEnterVehicle();
}

function shootAt(sx, sy) {
  const p = G.player;
  if (p.vehicle || G.shootCooldown > 0 || G.state !== 'play') return;
  G.shootCooldown = 0.28;
  const w = worldFromScreen(sx, sy);
  const a = angleTo(p.x, p.y, w.x, w.y);
  p.angle = a;
  G.bullets.push({ x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22, angle: a, life: 1.4 });
  G.shotsFired++;
  G.audio.shoot();
  if (G.wanted < 2) G.addWanted(1);
}

function missionTick(dt) {
  const m = G.missions[G.missionIndex];
  if (!m || !m.started || m.done) return;
  const step = currentStep(m);
  if (!step) return;
  const p = G.player;
  if (step.kind === 'steal' && !G.armored) {
    G.armored = { kind: 'armored', x: G.delta.tollSpot.x + 40, y: G.delta.tollSpot.y - 60, angle: Math.PI / 2, speed: 0, hp: 120 };
    showToast(G, 'Armored truck crossing the causeway — now!', 3);
  }
  const d = dist2(p.x, p.y, step.x, step.y);
  let advance = false;
  if ((step.kind === 'goto' || step.kind === 'collect') && d < step.r) advance = true;
  if (step.kind === 'escape' && G.wanted === 0 && d < step.r) advance = true;
  if (step.kind === 'steal' && p.vehicle && p.vehicle.kind === 'armored') advance = true;
  if (step.kind === 'deliver' && p.vehicle && p.vehicle.kind === 'armored' && d < step.r) advance = true;
  if (!advance) return;
  m.stepIndex = (m.stepIndex || 0) + 1;
  if (step.say) showToast(G, step.say, 3.5);
  G.audio.pickup();
  if (step.kind === 'collect' && m.name === 'Toll Trouble') G.addWanted(2);
  if (m.stepIndex >= m.steps.length) {
    m.done = true;
    G.cash += m.reward;
    G.audio.missionDone();
    showToast(G, `JOB DONE — ${m.name} — +$${m.reward}`, 4);
    G.missionIndex++;
    const next = G.missions[G.missionIndex];
    if (next) showToast(G, `Next job: ${next.name} — find ${G.missionIndex <= 1 ? 'Delia' : 'Silas'}`, 4);
    else showToast(G, 'ALL JOBS DONE — the debt is dead. Free roam, Rook!', 5);
  }
}

function updatePlayer(dt) {
  const p = G.player;
  const k = G.keys;
  const up = k['KeyW'] || k['ArrowUp'];
  const down = k['KeyS'] || k['ArrowDown'];
  const left = k['KeyA'] || k['ArrowLeft'];
  const right = k['KeyD'] || k['ArrowRight'];
  const sprint = k['ShiftLeft'] || k['ShiftRight'];
  if (G.shootCooldown > 0) G.shootCooldown -= dt;
  if (G.stealCooldown > 0) G.stealCooldown -= dt;
  if (p.vehicle) {
    const v = p.vehicle;
    const onWater = isWaterAt(v.x, v.y);
    const onMarsh = isMarshAt(v.x, v.y);
    let maxSpeed = 330;
    let accel = 300;
    if (v.kind === 'airboat') { maxSpeed = onWater || onMarsh ? 310 : 95; accel = 340; }
    if (v.kind === 'armored') { maxSpeed = 250; accel = 200; }
    if (v.kind === 'boat') { maxSpeed = onWater ? 280 : 40; }
    if (v.kind === 'sedan' || v.kind === 'pickup') {
      if (onWater) { maxSpeed = 40; accel = 60; }
      else if (onMarsh) { maxSpeed = 130; accel = 140; }
    }
    if (up) v.speed += accel * dt;
    if (down) v.speed -= accel * 1.2 * dt;
    if (k['Space']) v.speed = easeToward(v.speed, 0, 6, dt);
    else v.speed = easeToward(v.speed, 0, v.speed > 0 ? 0.25 : 0.6, dt);
    v.speed = clampNum(v.speed, -100, maxSpeed);
    const steer = (left ? -1 : 0) + (right ? 1 : 0);
    const dir = v.speed >= 0 ? 1 : -1;
    v.angle += steer * 1.9 * dt * dir * clampNum(Math.abs(v.speed) / 120, 0.25, 1);
    const nx = v.x + Math.cos(v.angle) * v.speed * dt;
    const ny = v.y + Math.sin(v.angle) * v.speed * dt;
    if (!blockedByBuilding(nx, ny, 24)) { v.x = nx; v.y = ny; }
    else if (!blockedByBuilding(nx, v.y, 24)) { v.x = nx; }
    else if (!blockedByBuilding(v.x, ny, 24)) { v.y = ny; }
    else { v.speed *= -0.25; G.audio.crash(); }
    const c = clampToWorld(v.x, v.y);
    v.x = c.x; v.y = c.y;
    p.x = v.x; p.y = v.y; p.angle = v.angle; p.speed = v.speed;
    if (v.kind === 'airboat' && !onWater && !onMarsh && Math.abs(v.speed) > 60) G.audio.splash();
    G.audio.setEngine(Math.abs(v.speed) / 330, v.kind === 'airboat' || v.kind === 'boat');
  } else {
    let mx = (right ? 1 : 0) - (left ? 1 : 0);
    let my = (down ? 1 : 0) - (up ? 1 : 0);
    const len = Math.hypot(mx, my);
    const inWater = isWaterAt(p.x, p.y);
    const inMarsh = isMarshAt(p.x, p.y);
    let top = sprint ? 265 : 175;
    if (inWater) top = 62;
    else if (inMarsh) top = 105;
    if (len > 0) {
      mx /= len; my /= len;
      p.angle = Math.atan2(my, mx);
      p.speed = easeToward(p.speed, top, 8, dt);
    } else {
      p.speed = easeToward(p.speed, 0, 10, dt);
    }
    const nx = p.x + Math.cos(p.angle) * p.speed * dt * (len > 0 ? 1 : 0);
    const ny = p.y + Math.sin(p.angle) * p.speed * dt * (len > 0 ? 1 : 0);
    if (len > 0) {
      if (!blockedByBuilding(nx, ny, 12)) { p.x = nx; p.y = ny; }
      else if (!blockedByBuilding(nx, p.y, 12)) { p.x = nx; }
      else if (!blockedByBuilding(p.x, ny, 12)) { p.y = ny; }
    }
    const c = clampToWorld(p.x, p.y);
    p.x = c.x; p.y = c.y;
    G.audio.setEngine(0, false);
  }
}

function updateCamera(dt) {
  const p = G.player;
  const tx = clampNum(p.x - G.cam.w / 2, 0, WORLD_W - G.cam.w);
  const ty = clampNum(p.y - G.cam.h / 2, 0, WORLD_H - G.cam.h);
  G.cam.x = easeToward(G.cam.x, tx, 5, dt);
  G.cam.y = easeToward(G.cam.y, ty, 5, dt);
}

function update(dt) {
  if (G.state !== 'play') return;
  G.time += dt;
  updatePlayer(dt);
  updateTraffic(G, dt);
  updatePedestrians(G, dt);
  updatePolice(G, dt);
  updateBullets(G, dt);
  missionTick(dt);
  updateCamera(dt);
  if (G.player.health <= 0 && !G.busted) {
    G.busted = true;
    G.state = 'busted';
    G.cash = Math.max(0, G.cash - 100);
    showToast(G, 'BUSTED — the deputies took $100 and dumped you at the cabin', 4);
    setTimeout(() => {
      G.player.health = 100;
      G.player.vehicle = null;
      G.player.x = G.delta.spawnFoot.x;
      G.player.y = G.delta.spawnFoot.y;
      G.wanted = 0;
      G.police = [];
      G.busted = false;
      G.state = 'play';
    }, 2200);
  }
  if (G.flashRed > 0) G.flashRed -= dt;
  refreshHud(G);
  setObjectiveHtml(missionHudText(G));
  hideToastIfDue(G);
  drawMinimap(G);
}

function drawWorld() {
  const cam = G.cam;
  ctx.fillStyle = '#101a16';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(G.terrain.canvas, -cam.x, -cam.y, WORLD_W, WORLD_H);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawBuildingsAndTrees(ctx, G.delta, cam);
  // Mission beacon: a golden column over the current objective.
  const m = G.missions[G.missionIndex];
  const step = m && m.started ? currentStep(m) : null;
  if (step) {
    const pulse = 0.5 + Math.sin(G.time * 3) * 0.2;
    const grad = ctx.createLinearGradient(step.x, step.y - 260, step.x, step.y);
    grad.addColorStop(0, 'rgba(255, 215, 94, 0)');
    grad.addColorStop(1, `rgba(255, 215, 94, ${0.55 * pulse})`);
    ctx.fillStyle = grad;
    ctx.fillRect(step.x - 14, step.y - 260, 28, 260);
    ctx.strokeStyle = '#ffd75e';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(step.x, step.y, 26 + Math.sin(G.time * 3) * 6, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath(); ctx.arc(step.x, step.y, 6, 0, Math.PI * 2); ctx.fill();
    // NPC markers for the job givers.
    const giver = G.missionIndex <= 1 ? G.delta.deliaSpot : G.delta.silasSpot;
    if (m && !m.started) {
      ctx.fillStyle = '#7fc96a';
      ctx.font = 'bold 22px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', giver.x, giver.y - 46);
    }
  }
  // Parked vehicles.
  for (const v of G.vehicles) drawVehicle(ctx, v, v === G.player.vehicle);
  if (G.armored && !G.vehicles.includes(G.armored)) drawVehicle(ctx, G.armored, false);
  for (const car of G.traffic) drawVehicle(ctx, car, false);
  for (const cop of G.police) {
    drawVehicle(ctx, cop, false);
    if (G.time % 1 < 0.5) {
      ctx.fillStyle = '#c22e2e';
      ctx.beginPath(); ctx.arc(cop.x - 14, cop.y - 8, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#2e6bc2';
      ctx.beginPath(); ctx.arc(cop.x - 14, cop.y - 8, 5, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (const p of G.peds) drawPerson(ctx, p.x, p.y, p.angle, p.shirt, false, null);
  // The job givers, standing where the player can find them.
  drawPerson(ctx, G.delta.deliaSpot.x, G.delta.deliaSpot.y, 1.2, '#c96a8a', false, null);
  drawPerson(ctx, G.delta.silasSpot.x, G.delta.silasSpot.y, -0.6, '#3a3a3a', false, null);
  // The player.
  const pl = G.player;
  if (!pl.vehicle) {
    const w = worldFromScreen(G.mouse.x, G.mouse.y);
    const aim = Math.atan2(w.y - pl.y, w.x - pl.x);
    drawPerson(ctx, pl.x, pl.y, pl.angle, pl.shirt, true, aim);
  }
  // Bullets.
  ctx.fillStyle = '#ffd75e';
  for (const b of G.bullets) {
    ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  drawFog();
  if (G.flashRed > 0) {
    ctx.fillStyle = `rgba(194, 46, 46, ${G.flashRed * 0.5})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (G.state === 'busted') {
    ctx.fillStyle = 'rgba(10, 10, 10, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f3ead2';
    ctx.font = 'bold 64px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED', canvas.width / 2, canvas.height / 2);
  }
}

function drawFog() {
  const p = G.player;
  const cx = p.x - G.cam.x, cy = p.y - G.cam.y;
  // Dawn haze: thick at the edges, thin around the player.
  const g = ctx.createRadialGradient(cx, cy, 120, cx, cy, Math.max(canvas.width, canvas.height) * 0.62);
  g.addColorStop(0, 'rgba(214, 222, 196, 0)');
  g.addColorStop(0.6, 'rgba(214, 222, 196, 0.10)');
  g.addColorStop(1, 'rgba(214, 222, 196, 0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Drifting fog banks.
  ctx.fillStyle = 'rgba(222, 230, 205, 0.10)';
  for (const b of G.fogBlobs) {
    const bx = b.x + Math.sin(G.time * b.drift + b.phase) * 90 - G.cam.x;
    const by = b.y + Math.cos(G.time * b.drift * 0.7 + b.phase) * 60 - G.cam.y;
    if (bx < -b.r || by < -b.r || bx > canvas.width + b.r || by > canvas.height + b.r) continue;
    ctx.beginPath();
    ctx.ellipse(bx, by, b.r, b.r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Warm dawn wash from the east.
  const dawn = ctx.createLinearGradient(0, 0, canvas.width, 0);
  dawn.addColorStop(0, 'rgba(255, 190, 110, 0.02)');
  dawn.addColorStop(1, 'rgba(255, 190, 110, 0.10)');
  ctx.fillStyle = dawn;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawTitleBackdrop(dt) {
  G.time += dt;
  // Slow dawn pan across the river for the title screen.
  const t = G.time * 12;
  G.cam.x = clampNum(1200 + Math.sin(t * 0.05) * 500, 0, WORLD_W - G.cam.w);
  G.cam.y = clampNum(700 + Math.cos(t * 0.04) * 300, 0, WORLD_H - G.cam.h);
  drawWorld();
}

function loop(ts) {
  requestAnimationFrame(loop);
  const now = ts / 1000;
  const dt = Math.min(0.05, now - (loop.last || now));
  loop.last = now;
  if (G.state === 'title') drawTitleBackdrop(dt);
  else drawWorld();
  if (G.state === 'play') update(dt);
}
requestAnimationFrame(loop);

function saveGame() {
  try {
    const data = {
      x: G.player.x, y: G.player.y, cash: G.cash, health: G.player.health,
      missionIndex: G.missionIndex, time: G.time,
      missions: G.missions.map((m) => ({ started: m.started, done: m.done, stepIndex: m.stepIndex || 0 })),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    showToast(G, 'Game saved — the delta remembers', 2.5);
  } catch { /* storage unavailable: play on without saving */ }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function applySave(data) {
  G.player.x = data.x; G.player.y = data.y;
  G.cash = data.cash; G.player.health = data.health || 100;
  G.missionIndex = data.missionIndex || 0;
  G.time = data.time || 0;
  data.missions.forEach((s, i) => {
    if (G.missions[i]) {
      G.missions[i].started = s.started;
      G.missions[i].done = s.done;
      G.missions[i].stepIndex = s.stepIndex;
    }
  });
  G.cam.x = clampNum(G.player.x - G.cam.w / 2, 0, WORLD_W - G.cam.w);
  G.cam.y = clampNum(G.player.y - G.cam.h / 2, 0, WORLD_H - G.cam.h);
}

function startGame(useSave) {
  freshWorld();
  if (useSave) {
    const data = loadSave();
    if (data) applySave(data);
  }
  G.state = 'play';
  setMenuVisibility('play');
  G.audio.start();
  refreshHud(G);
  setObjectiveHtml(missionHudText(G));
  drawMinimap(G);
}

document.getElementById('playBtn').addEventListener('click', () => startGame(false));
document.getElementById('continueBtn').addEventListener('click', () => startGame(true));
document.getElementById('resumeBtn').addEventListener('click', () => {
  G.state = 'play';
  setMenuVisibility('play');
});
document.getElementById('saveBtn').addEventListener('click', saveGame);
document.getElementById('quitBtn').addEventListener('click', () => {
  G.state = 'title';
  setMenuVisibility('title');
});
if (loadSave()) document.getElementById('continueBtn').classList.remove('hidden');

window.addEventListener('keydown', (e) => {
  G.keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyE' && G.state === 'play') tryInteract();
  if (e.code === 'KeyP' && (G.state === 'play' || G.state === 'pause')) {
    if (G.state === 'play') {
      G.state = 'pause';
      setMenuVisibility('pause');
      document.getElementById('pauseStats').textContent =
        `Cash $${G.cash} · Jobs done ${G.missions.filter((m) => m.done).length}/5 · Wanted ${'★'.repeat(G.wanted) || 'clean'}`;
    } else {
      G.state = 'play';
      setMenuVisibility('play');
    }
  }
  if (e.code === 'KeyF' && G.state === 'play') saveGame();
  if (e.code === 'KeyM' && G.state === 'play') showDialogue(G, 'Rook Calloway', missionListHtml(G));
});
window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  G.mouse.x = e.clientX - r.left;
  G.mouse.y = e.clientY - r.top;
});
canvas.addEventListener('mousedown', (e) => {
  const r = canvas.getBoundingClientRect();
  shootAt(e.clientX - r.left, e.clientY - r.top);
});
window.addEventListener('blur', () => { G.keys = {}; });

// ---- Screenshot staging (?shot=...) ---------------------------------------
// Deterministic scenes for the entry's screenshots: each one starts a real
// game and poses it so several systems show in a single frame.
function stageShot(shot) {
  G.shot = shot;
  freshWorld();
  G.state = 'play';
  setMenuVisibility('play');
  const p = G.player;
  if (shot === 'chase') {
    // Causeway chase: Rook in a stolen car, wanted 3, deputies ramming.
    const v = G.vehicles[0];
    v.x = 1560; v.y = 900; v.angle = 0;
    p.vehicle = v; p.x = v.x; p.y = v.y; p.angle = 0;
    G.missions[3].started = true; G.missions[3].stepIndex = 1;
    G.missionIndex = 3;
    G.wanted = 3;
    G.cash = 640;
    G.cam.x = clampNum(p.x - G.cam.w / 2, 0, WORLD_W - G.cam.w);
    G.cam.y = clampNum(p.y - G.cam.h / 2, 0, WORLD_H - G.cam.h);
    updatePolice(G, 0.5);
    updatePolice(G, 0.5);
  } else if (shot === 'mission') {
    // Dawn crate run on the airboat, fog thick on the river.
    const boat = G.vehicles.find((v) => v.kind === 'airboat');
    p.vehicle = boat; p.x = boat.x; p.y = boat.y; p.angle = -1.2;
    boat.angle = -1.2;
    boat.speed = 0;
    G.missions[0].started = true; G.missions[0].stepIndex = 1;
    G.missionIndex = 0;
    G.cash = 160;
    G.cam.x = clampNum(p.x - G.cam.w / 2, 0, WORLD_W - G.cam.w);
    G.cam.y = clampNum(p.y - G.cam.h / 2, 0, WORLD_H - G.cam.h);
  } else if (shot === 'swamp') {
    // On foot among the stilt shacks, deputies on the way, job 2 active.
    p.x = 1150; p.y = 1450; p.angle = 0.4;
    G.missions[1].started = true; G.missions[1].stepIndex = 0;
    G.missionIndex = 1;
    G.wanted = 1;
    G.cash = 310;
    G.cam.x = clampNum(p.x - G.cam.w / 2, 0, WORLD_W - G.cam.w);
    G.cam.y = clampNum(p.y - G.cam.h / 2, 0, WORLD_H - G.cam.h);
    updatePolice(G, 0.5);
  }
  refreshHud(G);
  setObjectiveHtml(missionHudText(G));
  drawMinimap(G);
  window.__gatorbackReady = true;
}

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot === 'start') {
  freshWorld();
  G.state = 'title';
  setMenuVisibility('title');
  window.__gatorbackReady = true;
} else if (shot === 'chase' || shot === 'mission' || shot === 'swamp') {
  stageShot(shot);
} else {
  freshWorld();
  window.__gatorbackReady = true;
}

window.__gatorback = G;
window.__gatorbackSave = saveGame;
window.__gatorbackStart = () => startGame(false);
