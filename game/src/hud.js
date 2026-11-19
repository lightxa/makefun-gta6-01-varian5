// HUD, minimap and on-screen text for the delta.
// The DOM panels live in index.html; this module keeps them in sync with G
// and paints the live minimap every frame.

import { isWaterAt, isRoadAt } from './delta.js';
import { currentStep } from './missions.js';

const $ = (id) => document.getElementById(id);

export function refreshHud(G) {
  const cash = $('cashBox');
  cash.firstChild.textContent = '$' + G.cash.toLocaleString('en-US');
  const stars = $('stars');
  let s = '';
  for (let i = 0; i < 5; i++) s += i < G.wanted ? '★' : '<span class="dim">★</span>';
  stars.innerHTML = s;
  const mins = 5 * 60 + 48 + Math.floor(G.time / 60);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  $('clockBox').firstChild.textContent =
    String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ' AM';
  const health = Math.max(0, Math.min(100, G.player.health));
  $('healthFill').style.width = health + '%';
  $('healthFill').style.background = health > 50 ? '#7fc96a' : health > 25 ? '#e8b64c' : '#c24a2e';
  const speed = G.player.vehicle ? Math.round(Math.abs(G.player.speed) * 0.12) : Math.round(G.player.speed * 0.12);
  $('speedBox').querySelector('b').textContent = String(speed);
  $('vehicleName').textContent = G.player.vehicle
    ? (G.player.vehicle.kind === 'airboat' ? 'AIRBOAT — MUDCAT FAN' : G.player.vehicle.kind === 'armored' ? 'ARMORED TRUCK' : G.player.vehicle.kind === 'boat' ? 'PATROL BOAT' : 'STOLEN CAR')
    : 'ON FOOT';
}

export function setObjectiveHtml(html) {
  $('objective').innerHTML = html;
}

export function showToast(G, text, seconds) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  G.toastUntil = G.time + (seconds || 3.2);
}

export function hideToastIfDue(G) {
  if (G.time > G.toastUntil) $('toast').classList.add('hidden');
}

export function showDialogue(G, speaker, text) {
  const el = $('dialogue');
  el.innerHTML = '<b>' + speaker + ':</b> ' + text + '<br><span class="cont">Press E to continue</span>';
  el.classList.remove('hidden');
  G.dialogueOpen = true;
}

export function hideDialogue(G) {
  $('dialogue').classList.add('hidden');
  G.dialogueOpen = false;
}

export function drawMinimap(G) {
  const mm = $('minimap');
  const c = mm.getContext('2d');
  const W = mm.width, H = mm.height;
  const sx = W / 3600, sy = H / 2600;
  c.clearRect(0, 0, W, H);
  c.fillStyle = '#223d2c';
  c.fillRect(0, 0, W, H);
  // Water ribbon, sampled.
  c.fillStyle = '#2e5d5a';
  for (let y = 0; y < 2600; y += 26) {
    for (let x = 0; x < 3600; x += 26) {
      if (isWaterAt(x, y)) c.fillRect(x * sx, y * sy, 3, 3);
    }
  }
  c.strokeStyle = '#8a7a56';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(80 * sx, 900 * sy); c.lineTo(3520 * sx, 900 * sy);
  c.moveTo(80 * sx, 1900 * sy); c.lineTo(3520 * sx, 1900 * sy);
  c.moveTo(600 * sx, 80 * sy); c.lineTo(600 * sx, 2520 * sy);
  c.moveTo(2900 * sx, 80 * sy); c.lineTo(2900 * sx, 2520 * sy);
  c.stroke();
  // Mission marker.
  const step = G.missions[G.missionIndex] ? currentStep(G.missions[G.missionIndex]) : null;
  const target = step ? { x: step.x, y: step.y } : null;
  if (target && G.missions[G.missionIndex].started) {
    const pulse = 3 + Math.sin(G.time * 4) * 1.5;
    c.fillStyle = '#ffd75e';
    c.beginPath(); c.arc(target.x * sx, target.y * sy, pulse + 2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#12241c'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(target.x * sx, target.y * sy, pulse + 2, 0, Math.PI * 2); c.stroke();
  }
  // Police blips.
  c.fillStyle = '#5a8fd8';
  for (const cop of G.police) {
    c.beginPath(); c.arc(cop.x * sx, cop.y * sy, 3, 0, Math.PI * 2); c.fill();
  }
  // Traffic dots.
  c.fillStyle = 'rgba(240,230,200,0.75)';
  for (const car of G.traffic) c.fillRect(car.x * sx - 1, car.y * sy - 1, 2, 2);
  // Player arrow.
  const p = G.player;
  c.save();
  c.translate(p.x * sx, p.y * sy);
  c.rotate(p.angle);
  c.fillStyle = '#ffffff';
  c.beginPath(); c.moveTo(7, 0); c.lineTo(-5, -4); c.lineTo(-5, 4); c.closePath(); c.fill();
  c.strokeStyle = '#12241c'; c.lineWidth = 1;
  c.stroke();
  c.restore();
  // Viewport rectangle.
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.lineWidth = 1;
  c.strokeRect(G.cam.x * sx, G.cam.y * sy, G.cam.w * sx, G.cam.h * sy);
}

export function setMenuVisibility(mode) {
  // mode: 'title' | 'play' | 'pause'
  $('menu').classList.toggle('hidden', mode !== 'title');
  $('pauseCard').style.display = mode === 'pause' ? 'flex' : 'none';
  const showHud = mode === 'play' || mode === 'pause';
  for (const id of ['hudTop', 'objective', 'healthWrap', 'speedBox', 'hint']) {
    $(id).classList.toggle('hidden', !showHud);
  }
  $('minimap').classList.toggle('hidden', !showHud);
}

export function missionListHtml(G) {
  let html = '<b>ROOK\'S JOB LIST</b><br>';
  G.missions.forEach((m, i) => {
    const state = m.done ? 'DONE ✓' : i === G.missionIndex ? 'ACTIVE' : 'LOCKED';
    html += `${i + 1}. ${m.name} — $${m.reward} — ${state}<br>`;
  });
  html += '<span style="opacity:.8">Debt to Silas Boggs: $' + (1120 - G.cash) + ' to go. Finish all five jobs to clear it.</span>';
  return html;
}
