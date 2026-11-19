// Everyone who moves in the delta: the player, traffic, pedestrians,
// parish deputies and their boats, bullets, and the armored truck.
// All motion is plain math on the shared game state G.

import { clampNum, dist2, angleTo, easeToward } from './seeded.js';
import { isWaterAt, isRoadAt, isMarshAt, clampToWorld, WORLD_W, WORLD_H } from './delta.js';

const CAR_COLORS = ['#b8442e', '#3e6b9e', '#c9a13b', '#5a7d4a', '#7a4a8a', '#9e9a8a', '#2e4a5a'];
const PED_SHIRTS = ['#c96a3b', '#4a7d9e', '#9e9a5a', '#7d4a6b', '#3b7d5a'];

export function spawnTraffic(G, n) {
  G.traffic = [];
  for (let i = 0; i < n; i++) {
    const loop = G.delta.loops[i % G.delta.loops.length];
    const edge = i % 4;
    let x = loop.x0, y = loop.y0;
    if (edge === 0) { x = loop.x0 + ((i * 397) % (loop.x1 - loop.x0)); y = loop.y0; }
    if (edge === 1) { x = loop.x1; y = loop.y0 + ((i * 311) % (loop.y1 - loop.y0)); }
    if (edge === 2) { x = loop.x0 + ((i * 521) % (loop.x1 - loop.x0)); y = loop.y1; }
    if (edge === 3) { x = loop.x0; y = loop.y0 + ((i * 433) % (loop.y1 - loop.y0)); }
    G.traffic.push({
      x, y, angle: 0, speed: 60 + (i % 5) * 14, loop, edge,
      color: CAR_COLORS[i % CAR_COLORS.length], kind: i % 6 === 0 ? 'pickup' : 'sedan',
      honk: 0,
    });
  }
}

export function spawnPedestrians(G, n) {
  G.peds = [];
  for (let i = 0; i < n; i++) {
    const x = 300 + ((i * 617) % 3000);
    const y = 500 + ((i * 389) % 1800);
    if (isWaterAt(x, y) || isRoadAt(x, y)) continue;
    G.peds.push({
      x, y, angle: (i * 1.7) % (Math.PI * 2), speed: 22 + (i % 4) * 6,
      shirt: PED_SHIRTS[i % PED_SHIRTS.length], panic: 0, wander: 2 + (i % 5),
    });
  }
}

export function spawnPolice(G, count) {
  while (G.police.length < count) {
    const p = G.player;
    const a = (G.police.length * 2.1 + 0.7) % (Math.PI * 2);
    const d = 520 + G.police.length * 90;
    const x = clampNum(p.x + Math.cos(a) * d, 80, WORLD_W - 80);
    const y = clampNum(p.y + Math.sin(a) * d, 80, WORLD_H - 80);
    const onWater = isWaterAt(p.x, p.y) || isWaterAt(x, y);
    G.police.push({
      x, y, angle: angleTo(x, y, p.x, p.y), speed: 0,
      kind: onWater ? 'boat' : 'cruiser', hp: 60, ram: 0,
    });
  }
}

export function updateTraffic(G, dt) {
  for (const car of G.traffic) {
    const { x0, y0, x1, y1 } = car.loop;
    let tx = x1, ty = y1;
    if (car.edge === 0) { tx = x1; ty = y0; }
    if (car.edge === 1) { tx = x1; ty = y1; }
    if (car.edge === 2) { tx = x0; ty = y1; }
    if (car.edge === 3) { tx = x0; ty = y0; }
    const d = dist2(car.x, car.y, tx, ty);
    if (d < 30) {
      car.edge = (car.edge + 1) % 4;
      continue;
    }
    const want = angleTo(car.x, car.y, tx, ty);
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += clampNum(diff, -1.6 * dt, 1.6 * dt);
    const nearPlayer = G.player.vehicle && dist2(car.x, car.y, G.player.x, G.player.y) < 120;
    const sp = nearPlayer ? car.speed * 0.3 : car.speed;
    car.x += Math.cos(car.angle) * sp * dt;
    car.y += Math.sin(car.angle) * sp * dt;
    if (G.player.vehicle && dist2(car.x, car.y, G.player.x, G.player.y) < 34) {
      const push = angleTo(car.x, car.y, G.player.x, G.player.y);
      G.player.x += Math.cos(push) * 40 * dt;
      G.player.y += Math.sin(push) * 40 * dt;
      if (G.time - car.honk > 3) { car.honk = G.time; G.audio.shoot && G.audio.hit(); }
    }
  }
}

export function updatePedestrians(G, dt) {
  for (const p of G.peds) {
    p.wander -= dt;
    const threat = dist2(p.x, p.y, G.player.x, G.player.y);
    if (threat < 130 && (G.player.speed > 60 || G.shotsFired > 0)) p.panic = 2.5;
    if (p.panic > 0) {
      p.panic -= dt;
      const away = angleTo(G.player.x, G.player.y, p.x, p.y);
      p.angle = away;
      p.x += Math.cos(p.angle) * 95 * dt;
      p.y += Math.sin(p.angle) * 95 * dt;
    } else {
      if (p.wander <= 0) {
        p.wander = 2 + ((p.x + p.y) % 4);
        p.angle = ((p.x * 0.013 + p.y * 0.007) % (Math.PI * 2));
      }
      p.x += Math.cos(p.angle) * p.speed * dt;
      p.y += Math.sin(p.angle) * p.speed * dt;
    }
    const c = clampToWorld(p.x, p.y);
    p.x = c.x; p.y = c.y;
    if (isWaterAt(p.x, p.y)) {
      p.angle += Math.PI;
      p.x += Math.cos(p.angle) * 60 * dt;
      p.y += Math.sin(p.angle) * 60 * dt;
    }
  }
}

export function updatePolice(G, dt) {
  const p = G.player;
  const want = Math.min(5, Math.max(0, G.wanted));
  const need = want === 0 ? 0 : want === 1 ? 1 : want === 2 ? 2 : want >= 4 ? 5 : 3;
  if (want > 0) spawnPolice(G, need);
  if (want === 0 && G.police.length > 0) {
    // Deputies give up and drive off once the heat is gone.
    G.police = G.police.filter((c) => dist2(c.x, c.y, p.x, p.y) < 900);
    if (G.police.length === 0) return;
  }
  for (const cop of G.police) {
    const d = dist2(cop.x, cop.y, p.x, p.y);
    const chaseSpeed = cop.kind === 'boat' ? 240 : 235;
    const wantAngle = angleTo(cop.x, cop.y, p.x, p.y);
    let diff = wantAngle - cop.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.angle += clampNum(diff, -2.2 * dt, 2.2 * dt);
    cop.speed = easeToward(cop.speed, d > 60 ? chaseSpeed : chaseSpeed * 0.5, 1.4, dt);
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    const c = clampToWorld(cop.x, cop.y);
    cop.x = c.x; cop.y = c.y;
    if (cop.kind === 'cruiser' && isWaterAt(cop.x, cop.y)) {
      cop.angle += Math.PI * 0.5;
      cop.x += Math.cos(cop.angle) * 120 * dt;
      cop.y += Math.sin(cop.angle) * 120 * dt;
    }
    if (d < 46) {
      cop.ram += dt;
      if (cop.ram > 0.55) {
        cop.ram = 0;
        p.health -= 6;
        const push = angleTo(cop.x, cop.y, p.x, p.y);
        if (p.vehicle) { p.vehicle.x += Math.cos(push) * 26; p.vehicle.y += Math.sin(push) * 26; }
        p.x += Math.cos(push) * 26;
        p.y += Math.sin(push) * 26;
        G.audio.crash();
        G.flashRed = 0.35;
        if (p.health <= 0) G.busted = true;
      }
    }
  }
  // Wanted decays when no deputy can see the player.
  if (want > 0) {
    const nearest = G.police.reduce((m, c) => Math.min(m, dist2(c.x, c.y, p.x, p.y)), 9999);
    if (nearest > 700) {
      G.wantedTimer += dt;
      if (G.wantedTimer > 14) { G.wanted = Math.max(0, G.wanted - 1); G.wantedTimer = 0; G.toast('The heat is cooling off…'); }
    } else {
      G.wantedTimer = 0;
    }
  }
}

export function updateBullets(G, dt) {
  for (const b of G.bullets) {
    b.x += Math.cos(b.angle) * 620 * dt;
    b.y += Math.sin(b.angle) * 620 * dt;
    b.life -= dt;
    for (const cop of G.police) {
      if (dist2(b.x, b.y, cop.x, cop.y) < 30) {
        cop.hp -= 25;
        b.life = 0;
        G.audio.hit();
        if (cop.hp <= 0) {
          G.police = G.police.filter((c) => c !== cop);
          G.cash += 25;
          G.toast('Deputy down — $25 lifted from the wreck');
          G.addWanted(1);
        }
      }
    }
    if (G.armored && dist2(b.x, b.y, G.armored.x, G.armored.y) < 34) {
      G.armored.hp -= 20;
      b.life = 0;
      G.audio.hit();
    }
  }
  G.bullets = G.bullets.filter((b) => b.life > 0 && b.x > 0 && b.y > 0 && b.x < WORLD_W && b.y < WORLD_H);
}

export function drawVehicle(c, v, isPlayer) {
  c.save();
  c.translate(v.x, v.y);
  c.rotate(v.angle);
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(-26, -12, 52, 28);
  if (v.kind === 'airboat' || v.kind === 'boat') {
    c.fillStyle = v.kind === 'airboat' ? '#7a5a2e' : '#2e4a6b';
    c.beginPath();
    c.ellipse(0, 0, 30, 15, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#c9b078';
    c.fillRect(-26, -9, 14, 18);
    c.fillStyle = '#3a3a3a';
    c.beginPath(); c.arc(-24, 0, 11, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#d8d0b8'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-24, -11); c.lineTo(-24, 11); c.stroke();
    c.beginPath(); c.moveTo(-35, 0); c.lineTo(-13, 0); c.stroke();
  } else if (v.kind === 'armored') {
    c.fillStyle = '#4a4f55';
    c.fillRect(-30, -15, 60, 30);
    c.fillStyle = '#6a7076';
    c.fillRect(-30, -15, 18, 30);
    c.fillStyle = '#d8c96a';
    c.fillRect(-4, -15, 8, 30);
    c.fillStyle = '#22262a';
    c.fillRect(18, -13, 10, 6); c.fillRect(18, 7, 10, 6);
  } else {
    c.fillStyle = v.color || '#b8442e';
    c.fillRect(-28, -13, 56, 26);
    c.fillStyle = '#22262a';
    c.fillRect(-20, -13, 14, 26);
    c.fillRect(8, -13, 12, 26);
    c.fillStyle = '#b8d8e8';
    c.fillRect(-6, -11, 12, 22);
    c.fillStyle = '#1a1a1a';
    c.beginPath();
    c.arc(-18, -13, 5, 0, Math.PI * 2); c.arc(18, -13, 5, 0, Math.PI * 2);
    c.arc(-18, 13, 5, 0, Math.PI * 2); c.arc(18, 13, 5, 0, Math.PI * 2);
    c.fill();
  }
  if (v.kind === 'cruiser') {
    c.fillStyle = '#e8e8e8';
    c.fillRect(-10, -13, 20, 26);
    c.fillStyle = '#c22e2e';
    c.fillRect(-2, -13, 4, 26);
    c.fillStyle = '#2e6bc2';
    c.beginPath(); c.arc(-14, 0, 4, 0, Math.PI * 2); c.fill();
  }
  if (isPlayer) {
    c.strokeStyle = '#ffd75e';
    c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, 38, 0, Math.PI * 2); c.stroke();
  }
  c.restore();
}

export function drawPerson(c, x, y, angle, shirt, isPlayer, aiming) {
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath(); c.ellipse(2, 3, 12, 8, 0, 0, Math.PI * 2); c.fill();
  c.rotate(angle);
  c.fillStyle = shirt;
  c.beginPath(); c.arc(0, 0, 11, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d8b48a';
  c.beginPath(); c.arc(4, 0, 6, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#2e2a22';
  c.fillRect(-2, -5, 8, 10);
  if (aiming !== undefined && aiming !== null) {
    c.rotate(aiming - angle);
    c.strokeStyle = '#3a2e1e';
    c.lineWidth = 4;
    c.beginPath(); c.moveTo(8, 0); c.lineTo(24, 0); c.stroke();
  }
  if (isPlayer) {
    c.rotate(-angle);
    c.strokeStyle = '#ffd75e';
    c.lineWidth = 2.5;
    c.beginPath(); c.arc(0, 0, 17, 0, Math.PI * 2); c.stroke();
  }
  c.restore();
}
