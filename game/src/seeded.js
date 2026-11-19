// Seeded random helpers for Gatorback Delta: one small deterministic generator
// plus the range / pick / shuffle helpers the world builder uses. No Math.random
// anywhere in the game, so the delta is the same every dawn.

export function makeSeeded(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rangeOf(rnd, lo, hi) {
  return lo + rnd() * (hi - lo);
}

export function intOf(rnd, lo, hi) {
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

export function pickOf(rnd, list) {
  return list[Math.floor(rnd() * list.length)];
}

export function shuffleOf(rnd, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function clampNum(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerpNum(a, b, t) {
  return a + (b - a) * t;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

// Smooth a value toward a target without overshoot; used for camera and speed.
export function easeToward(current, target, rate, dt) {
  const k = 1 - Math.exp(-rate * dt);
  return current + (target - current) * k;
}
