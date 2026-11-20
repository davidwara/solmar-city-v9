// utils.js — seeded RNG, math and money helpers for Solmar City.
// Every other module leans on these: the city, traffic and pedestrians
// all draw from the same seeded stream so a seed rebuilds the same map.

// --- seeded RNG ----------------------------------------------------------
// xorshift32: cheap, deterministic, and good enough for placement rolls.
// The same seed always yields the same sequence. A string seed is
// hashed first, so callers can pass a name as well as a number.
export function createRng(seed = 1) {
  let s;
  if (typeof seed === 'string') {
    s = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      s ^= seed.charCodeAt(i);
      s = Math.imul(s, 16777619);
    }
    s >>>= 0;
  } else {
    s = seed >>> 0;
  }
  if (!s) s = 1;
  return function next() {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// Friendly alias — same factory, same behaviour.
export const seededRng = createRng;

// --- random draws --------------------------------------------------------
export function rand(rng, min, max) {
  return min + rng() * (max - min);
}

export function randInt(rng, min, max) {
  return Math.floor(min + rng() * (max - min + 1));
}

export function pick(rng, arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

// True with probability p (0..1). Handy for "60% chance of a palm".
export function chance(rng, p) {
  return rng() < p;
}

// --- math ----------------------------------------------------------------
export function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function clamp01(v) {
  return clamp(v, 0, 1);
}

export function lerp(a, b, t) {
  return a + (b - a) * clamp01(t);
}

// Distance on the ground plane (ignores y).
export function distXZ(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

// Wrap any angle into the -PI..PI range.
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Smallest signed turn from angle a to angle b, in -PI..PI.
export function angleDiff(a, b) {
  return wrapAngle(b - a);
}

// --- money ---------------------------------------------------------------
// "$1,250" — dollars with a thousands separator, no decimals.
export function formatMoney(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? '-' : '';
  const digits = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + '$' + digits;
}
