// The delta itself: terrain, water, roads, town, shacks and cypress.
// Everything is derived from one seed, so the map is identical every run.
// Coordinates are world pixels; the world is 3600 x 2600.

import { makeSeeded, rangeOf, intOf, pickOf, clampNum } from './seeded.js';

export const WORLD_W = 3600;
export const WORLD_H = 2600;

function riverCenterX(y) {
  return 1750 + 260 * Math.sin(y / 700) + 120 * Math.sin(y / 263 + 1.7);
}

function inLake(x, y) {
  const dx = (x - 2920) / 540;
  const dy = (y - 2080) / 390;
  return dx * dx + dy * dy < 1;
}

function inCanal(x, y) {
  if (y > 1480 && y < 1560 && x > 260 && x < riverCenterX(y)) return true;
  if (y > 660 && y < 730 && x > 500 && x < riverCenterX(y) + 40) return true;
  return false;
}

export function isWaterAt(x, y) {
  if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return false;
  if (Math.abs(x - riverCenterX(y)) < 175) return true;
  if (inLake(x, y)) return true;
  if (inCanal(x, y)) return true;
  return false;
}

// Shallow marsh: slow on foot, passable by airboat, drawn mottled.
export function isMarshAt(x, y) {
  if (isWaterAt(x, y)) return false;
  const sx = Math.sin(x * 0.011 + 3.1) * Math.cos(y * 0.017 + 0.6);
  const sy = Math.cos(x * 0.007 - 1.2) * Math.sin(y * 0.013 + 2.2);
  const swampSouth = y > 1950 && x < 1500;
  const swampWest = x < 420 && y > 900;
  if ((swampSouth || swampWest) && sx + sy > 0.55) return true;
  if (Math.abs(x - riverCenterX(y)) < 330 && sx > 0.72) return true;
  return false;
}

const ROAD_H = [900, 1900];
const ROAD_V = [600, 2900];

export function isRoadAt(x, y) {
  for (const ry of ROAD_H) if (Math.abs(y - ry) < 26 && x > 80 && x < 3520) return true;
  for (const rx of ROAD_V) if (Math.abs(x - rx) < 26 && y > 80 && y < 2520) return true;
  return false;
}

export function isBridgeAt(x, y) {
  if (!isRoadAt(x, y)) return false;
  return isWaterAt(x, y);
}

export function buildDelta(seed) {
  const rnd = makeSeeded(seed);
  const buildings = [];
  const trees = [];
  const docks = [];
  const crates = [];

  function addBuilding(kind, x, y, w, h, rot, color, label) {
    buildings.push({ kind, x, y, w, h, rot, color, label });
  }

  // Gatorback Landing: the little town around the crossroads at (600, 900).
  addBuilding('baitshop', 520, 800, 150, 96, 0, '#7a5a34', "Delia's Bait & Tackle");
  addBuilding('gas', 700, 800, 170, 110, 0, '#8a6f3f', 'Mudcat Fuel');
  addBuilding('diner', 470, 990, 160, 100, 0, '#6f7d5a', 'Herons Diner');
  addBuilding('cabin', 820, 990, 110, 84, 0, '#5d6b4a', 'Rook Cabin');
  addBuilding('cabin', 380, 800, 100, 80, 0, '#6b5a44', 'Trapper Cabin');
  addBuilding('store', 700, 990, 130, 90, 0, '#74604a', 'General Store');
  // Silas Boggs yard, north bank.
  addBuilding('yard', 880, 260, 260, 170, 0, '#4e4a38', "Silas Boggs Yard");
  addBuilding('shed', 1180, 300, 130, 90, 0, '#5a4a34', 'Boggs Shed');
  // Toll shack on the causeway where the road crosses the river.
  const tx = riverCenterX(900);
  addBuilding('toll', tx - 130, 830, 90, 70, 0, '#7d6b4f', 'Causeway Toll');
  addBuilding('toll', tx + 60, 990, 90, 70, 0, '#7d6b4f', 'Causeway Toll');
  // Stilt shacks along the river and the lake shore.
  const shackSpots = [];
  for (let i = 0; i < 26; i++) {
    const y = 200 + rnd() * 2200;
    const side = rnd() < 0.5 ? -1 : 1;
    const x = riverCenterX(y) + side * (230 + rnd() * 160);
    shackSpots.push([x, y]);
  }
  for (let i = 0; i < 10; i++) {
    const a = rnd() * Math.PI * 2;
    shackSpots.push([2920 + Math.cos(a) * (560 + rnd() * 90), 2080 + Math.sin(a) * (400 + rnd() * 70)]);
  }
  for (const [x, y] of shackSpots) {
    if (x < 60 || y < 60 || x > WORLD_W - 60 || y > WORLD_H - 60) continue;
    if (isRoadAt(x, y)) continue;
    addBuilding('stilt', x, y, 84 + rnd() * 40, 66 + rnd() * 26, rangeOf(rnd, -0.4, 0.4),
      pickOf(rnd, ['#6e5138', '#5d6b4a', '#715f45', '#4f5d43']), 'Stilt Shack');
  }

  // Cypress trees: thick along the river, clusters in the swamp.
  for (let i = 0; i < 420; i++) {
    const x = 80 + rnd() * (WORLD_W - 160);
    const y = 80 + rnd() * (WORLD_H - 160);
    if (isRoadAt(x, y) || isWaterAt(x, y)) continue;
    const nearRiver = Math.abs(x - riverCenterX(y)) < 420;
    const inSwamp = isMarshAt(x, y);
    if (!nearRiver && !inSwamp && rnd() < 0.82) continue;
    trees.push({ x, y, r: 14 + rnd() * 16, kind: rnd() < 0.75 ? 'cypress' : 'oak' });
  }
  // Docks reaching into the river and the lake.
  for (const [x, y, ang] of [
    [riverCenterX(1200) - 190, 1200, 0], [riverCenterX(1500) + 190, 1500, Math.PI],
    [riverCenterX(600) - 190, 600, 0], [2920, 2080 - 400, -Math.PI / 2],
    [520, 1560, Math.PI / 2],
  ]) docks.push({ x, y, ang });

  // Loose crates and barrels for cover and pickups.
  for (let i = 0; i < 40; i++) {
    const x = 120 + rnd() * (WORLD_W - 240);
    const y = 120 + rnd() * (WORLD_H - 240);
    if (isWaterAt(x, y) || isRoadAt(x, y)) continue;
    crates.push({ x, y, kind: rnd() < 0.6 ? 'crate' : 'barrel' });
  }

  // Traffic loops: rectangles along the road grid.
  const loops = [
    { x0: 600, y0: 900, x1: 2900, y1: 1900 },
    { x0: 600, y0: 900, x1: 2900, y1: 900 },
    { x0: 600, y0: 1900, x1: 2900, y1: 1900 },
    { x0: 600, y0: 900, x1: 600, y1: 1900 },
  ];

  return {
    seed, buildings, trees, docks, crates, loops,
    spawnFoot: { x: 300, y: 900 },
    spawnAirboat: { x: riverCenterX(1200) - 60, y: 1200 },
    deliaSpot: { x: 520, y: 800 },
    silasSpot: { x: 880, y: 260 },
    tollSpot: { x: tx, y: 900 },
    lakeSpot: { x: 2920, y: 2080 },
  };
}

export function paintTerrain(delta) {
  const scale = 0.5;
  const cv = document.createElement('canvas');
  cv.width = Math.floor(WORLD_W * scale);
  cv.height = Math.floor(WORLD_H * scale);
  const c = cv.getContext('2d');
  const rnd = makeSeeded(delta.seed + 99);
  c.fillStyle = '#5c6b3f';
  c.fillRect(0, 0, cv.width, cv.height);
  // Mottled ground: dry grass, mud, reeds.
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * cv.width;
    const y = rnd() * cv.height;
    const r = 4 + rnd() * 22;
    c.fillStyle = pickOf(rnd, ['#66743f', '#55663a', '#6d7046', '#4f6038', '#7a7448']);
    c.globalAlpha = 0.25 + rnd() * 0.3;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
  // Marsh patches.
  for (let y = 0; y < WORLD_H; y += 14) {
    for (let x = 0; x < WORLD_W; x += 14) {
      if (isMarshAt(x, y)) {
        c.fillStyle = 'rgba(74, 96, 58, 0.5)';
        c.fillRect(x * scale, y * scale, 8, 8);
      }
    }
  }
  // Water: deep teal river, lake and canals with a dawn sheen.
  c.fillStyle = '#2e5d5a';
  const waterPath = () => {
    c.beginPath();
    for (let y = 0; y <= WORLD_H; y += 40) {
      const cx = riverCenterX(y);
      c.moveTo((cx - 175) * scale, y * scale);
      c.lineTo((cx + 175) * scale, y * scale);
    }
  };
  // Draw water as a filled ribbon.
  c.beginPath();
  for (let y = 0; y <= WORLD_H; y += 30) c.lineTo((riverCenterX(y) - 175) * scale, y * scale);
  for (let y = WORLD_H; y >= 0; y -= 30) c.lineTo((riverCenterX(y) + 175) * scale, y * scale);
  c.closePath();
  c.fill();
  c.beginPath();
  c.ellipse(2920 * scale, 2080 * scale, 540 * scale, 390 * scale, 0, 0, Math.PI * 2);
  c.fill();
  c.fillRect(260 * scale, 1480 * scale, (riverCenterX(1520) - 260) * scale, 80 * scale);
  c.fillRect(500 * scale, 660 * scale, (riverCenterX(695) - 460) * scale, 70 * scale);
  // Water shimmer streaks.
  c.strokeStyle = 'rgba(214, 226, 190, 0.20)';
  c.lineWidth = 2;
  for (let i = 0; i < 260; i++) {
    const y = rnd() * WORLD_H;
    const cx = riverCenterX(y);
    const x = cx + (rnd() - 0.5) * 300;
    if (!isWaterAt(x, y)) continue;
    c.beginPath();
    c.moveTo(x * scale, y * scale);
    c.lineTo((x + 30 + rnd() * 60) * scale, y * scale);
    c.stroke();
  }
  // Roads: pale dirt with darker wheel ruts.
  for (const ry of ROAD_H) {
    c.fillStyle = '#8a7a56';
    c.fillRect(80 * scale, (ry - 26) * scale, (3520 - 80) * scale, 52 * scale);
    c.fillStyle = '#7a6a48';
    c.fillRect(80 * scale, (ry - 8) * scale, (3520 - 80) * scale, 6 * scale);
    c.fillRect(80 * scale, (ry + 2) * scale, (3520 - 80) * scale, 6 * scale);
  }
  for (const rx of ROAD_V) {
    c.fillStyle = '#8a7a56';
    c.fillRect((rx - 26) * scale, 80 * scale, 52 * scale, (2520 - 80) * scale);
    c.fillStyle = '#7a6a48';
    c.fillRect((rx - 8) * scale, 80 * scale, 6 * scale, (2520 - 80) * scale);
    c.fillRect((rx + 2) * scale, 80 * scale, 6 * scale, (2520 - 80) * scale);
  }
  // Causeway bridges: plank decks over the river crossings.
  for (const ry of ROAD_H) {
    const cx = riverCenterX(ry);
    c.fillStyle = '#6b5136';
    c.fillRect((cx - 200) * scale, (ry - 30) * scale, 400 * scale, 60 * scale);
    c.strokeStyle = 'rgba(40, 28, 16, 0.6)';
    c.lineWidth = 2;
    for (let x = cx - 200; x < cx + 200; x += 24) {
      c.beginPath();
      c.moveTo(x * scale, (ry - 30) * scale);
      c.lineTo(x * scale, (ry + 30) * scale);
      c.stroke();
    }
  }
  // Docks.
  for (const d of delta.docks) {
    c.save();
    c.translate(d.x * scale, d.y * scale);
    c.rotate(d.ang);
    c.fillStyle = '#6b5136';
    c.fillRect(-14, -90, 28, 180);
    c.restore();
  }
  return { canvas: cv, scale };
}

export function drawBuildingsAndTrees(c, delta, cam) {
  const x0 = cam.x - 40, y0 = cam.y - 40, x1 = cam.x + cam.w + 40, y1 = cam.y + cam.h + 40;
  for (const b of delta.buildings) {
    if (b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) continue;
    c.save();
    c.translate(b.x, b.y);
    c.rotate(b.rot);
    if (b.kind === 'stilt') {
      c.strokeStyle = '#4a3826';
      c.lineWidth = 5;
      for (const [sx, sy] of [[-30, 22], [30, 22], [-30, -22], [30, -22]]) {
        c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx, sy + 26); c.stroke();
      }
    }
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(-b.w / 2 + 6, -b.h / 2 + 8, b.w, b.h);
    c.fillStyle = b.color;
    c.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(-b.w / 2, -b.h / 2, b.w, 12);
    c.strokeStyle = '#2e2418';
    c.lineWidth = 3;
    c.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
    c.fillStyle = '#e8c96a';
    c.fillRect(-8, -6, 16, 12);
    if (b.label) {
      c.fillStyle = 'rgba(243,234,210,0.92)';
      c.font = 'bold 13px Georgia, serif';
      c.textAlign = 'center';
      c.fillText(b.label, 0, -b.h / 2 - 10);
    }
    c.restore();
  }
  for (const t of delta.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath(); c.ellipse(t.x + 5, t.y + 6, t.r, t.r * 0.6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = t.kind === 'cypress' ? '#3d5a34' : '#4a6b3a';
    c.beginPath(); c.arc(t.x, t.y, t.r, 0, Math.PI * 2); c.fill();
    c.fillStyle = t.kind === 'cypress' ? '#527a44' : '#5d8448';
    c.beginPath(); c.arc(t.x - t.r * 0.25, t.y - t.r * 0.3, t.r * 0.6, 0, Math.PI * 2); c.fill();
    if (t.kind === 'cypress') {
      c.strokeStyle = '#2c4226';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(t.x, t.y + t.r); c.lineTo(t.x, t.y + t.r + 10); c.stroke();
    }
  }
  for (const k of delta.crates) {
    if (k.x < x0 || k.x > x1 || k.y < y0 || k.y > y1) continue;
    if (k.kind === 'crate') {
      c.fillStyle = '#8a6a3c';
      c.fillRect(k.x - 11, k.y - 11, 22, 22);
      c.strokeStyle = '#4a3826'; c.lineWidth = 2;
      c.strokeRect(k.x - 11, k.y - 11, 22, 22);
      c.beginPath(); c.moveTo(k.x - 11, k.y - 11); c.lineTo(k.x + 11, k.y + 11); c.stroke();
    } else {
      c.fillStyle = '#5a6b7a';
      c.beginPath(); c.arc(k.x, k.y, 11, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#7a8b9a';
      c.beginPath(); c.arc(k.x, k.y, 7, 0, Math.PI * 2); c.fill();
    }
  }
}

export function clampToWorld(x, y) {
  return { x: clampNum(x, 40, WORLD_W - 40), y: clampNum(y, 40, WORLD_H - 40) };
}
