// combat.js — Mara's fists: a short melee swing (F key) that can knock a
// resident down, shove a traffic car, or dent a patrol car. Every hit is
// a crime, so every hit also raises the heat.

const SWING_TIME = 0.45;
const FRONT_DOT = 0.5;

function targetPos(target) {
  if (!target) return null;
  if (target.pos) return target.pos;
  if (target.position) return target.position;
  if (target.car) return targetPos(target.car);
  return null;
}

// True when a point sits within `reach` of the origin and roughly in
// front of the facing (dot product of the facing and the offset).
function inFront(origin, heading, reach, p) {
  const dx = p.x - origin.x;
  const dz = p.z - origin.z;
  const dist = Math.hypot(dx, dz);
  if (dist > reach) return { hit: false, dist };
  if (dist < 0.001) return { hit: true, dist };
  const dot = (dx / dist) * Math.sin(heading || 0) + (dz / dist) * Math.cos(heading || 0);
  return { hit: dot >= FRONT_DOT, dist };
}

export function createCombat() {
  let swingTimer = 0;

  const combat = { update, punch, damage };

  function update(dt) {
    if (swingTimer > 0) swingTimer -= dt;
  }

  // Swing at the nearest resident within reach and roughly in front.
  // Returns the ped hit, or null (nothing in range, or still swinging).
  function punch(origin, heading, reach, candidates) {
    if (!origin || !candidates || swingTimer > 0) return null;
    swingTimer = SWING_TIME;
    const maxReach = reach === undefined || reach === null ? 2.4 : reach;
    let best = null;
    let bestDist = maxReach;
    for (const ped of candidates) {
      if (!ped || ped.down) continue;
      const p = targetPos(ped);
      if (!p) continue;
      const check = inFront(origin, heading, bestDist, p);
      if (!check.hit) continue;
      best = ped;
      bestDist = check.dist;
    }
    return best;
  }

  // Resolve a hit: apply the physical effect and return the heat it adds.
  function damage(kind, target) {
    if (kind === 'ped') {
      // The caller knocks the pedestrian down; the punch itself only
      // raises the heat.
      return 1;
    }
    if (kind === 'traffic') {
      const car = target && target.car ? target.car : target;
      if (car && typeof car.speed === 'number') car.speed *= 0.5;
      if (target && target !== car && typeof target.speed === 'number') target.speed *= 0.5;
      return 1;
    }
    if (kind === 'police') {
      const car = target && target.car ? target.car : target;
      if (car && typeof car.hp === 'number') car.hp -= 1;
      else if (target && typeof target.hp === 'number') target.hp -= 1;
      return 2;
    }
    return 0;
  }

  return combat;
}
