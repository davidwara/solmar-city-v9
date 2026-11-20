// Solmar City — shots.js
// The five `?shot=` screenshot poses. Each pose stages the world — time of
// day, weather, Mara, her car, traffic, pedestrians, police and the job
// state — then hands control back to the normal frame loop, which keeps
// everything moving until frame 40, when the harness takes the picture.
//
// Poses: menu (start screen over a sunset vista), drive (Mara driving
// downtown at 10:00), chase (a 3-star police ram run in golden light),
// fish (pier fishing at golden hour with Biscuit and the island across
// the bay), night (a storm night on the beachfront).
//
// Everything here is staging only: no money moves, no save is written, and
// the loop's normal rules (police pursuit, traffic, weather) take over
// from the staged starting positions.

import { PIER_TIP } from './fishing.js';
import { LIGHTHOUSE_POS } from './island.js';

export const SHOT_NAMES = ['menu', 'drive', 'chase', 'fish', 'night'];

// Call a method only when the system actually provides it, so a pose can
// never crash staging when an optional hook is missing.
function callIf(obj, method, ...args) {
  if (obj && typeof obj[method] === 'function') return obj[method](...args);
  return undefined;
}

function placeAt(thing, x, y, z) {
  if (!thing) return;
  if (thing.position && typeof thing.position.set === 'function') {
    thing.position.set(x, y, z);
  } else if (thing.position) {
    thing.position.x = x;
    thing.position.y = y;
    thing.position.z = z;
  }
}

// Biscuit's rendered group may hang off the pets system under several
// names (dog / biscuit / a nested group), and placing the wrong handle
// leaves the dog at its spawn. Place the first real three.js object
// found, so the dog actually lands where staging puts it.
function placeDog(pets, x, z) {
  if (!pets) return;
  const tops = [pets.dog, pets.biscuit, pets.dogGroup, pets.pet];
  const nestedKeys = ['group', 'figure', 'mesh', 'object', 'model'];
  const isReal = (o) => !!(o && o.position && typeof o.position.set === 'function');
  for (const top of tops) {
    if (isReal(top)) { placeAt(top, x, 0, z); return; }
  }
  for (const top of tops) {
    if (!top) continue;
    for (const key of nestedKeys) {
      if (isReal(top[key])) { placeAt(top[key], x, 0, z); return; }
    }
  }
  for (const top of tops) {
    if (top && top.position) { placeAt(top, x, 0, z); return; }
  }
}

// The parked car closest to a point on the map — the one Mara drives in
// the driving poses.
function nearestParkedCar(cars, x, z) {
  let best = null;
  let bestDist = Infinity;
  for (const car of cars || []) {
    const dx = (car.position ? car.position.x : 0) - x;
    const dz = (car.position ? car.position.z : 0) - z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

// Stage traffic cars: [index, x, z, axis, direction, speed].
function stageTraffic(traffic, spots) {
  for (const [index, x, z, axis, direction, speed] of spots) {
    callIf(traffic, 'place', index, x, z, axis, direction, speed);
  }
}

// Stage pedestrians: [index, x, z].
function stagePeds(peds, spots) {
  for (const [index, x, z] of spots) {
    callIf(peds, 'place', index, x, z);
  }
}

// Park a car downtown, point it north, and put Mara behind the wheel.
function stageDrivenCar(ctx, x, z, heading) {
  const car = nearestParkedCar(ctx.cars, 0, 0);
  if (!car) return null;
  placeAt(car, x, 0, z);
  car.heading = heading;
  if (typeof car.speed === 'number') car.speed = 0;
  ctx.enterCar(car);
  return car;
}

// ---------------------------------------------------------------------------
// menu — the start screen over a sunset vista, fixed camera.
// ---------------------------------------------------------------------------
function stageMenu(ctx) {
  callIf(ctx.daynight, 'setHour', 18);
  ctx.setCamera(60, 34, 90, 0, 14, 0);
  ctx.setState('menu');
}

// ---------------------------------------------------------------------------
// drive — Mara driving downtown at 10:00, towers ahead, traffic on the
// avenue, pedestrians on the sidewalk, HUD and job tracker live.
// ---------------------------------------------------------------------------
function stageDrive(ctx) {
  callIf(ctx.daynight, 'setHour', 10);
  callIf(ctx.missions, 'start', 0);
  stageDrivenCar(ctx, 0, 62, Math.PI);
  stageTraffic(ctx.traffic, [
    [0, 0, 10, 'z', -1, 8],
    [1, 0, -30, 'z', 1, 7],
    [2, 0, 70, 'z', -1, 9],
    [3, 0, -80, 'z', 1, 8],
    [4, 62, 0, 'x', 1, 8],
    [5, -62, 40, 'x', -1, 7],
  ]);
  stagePeds(ctx.peds, [
    [0, 10.5, 30],
    [1, -10.5, -10],
    [2, 10.5, 90],
    [3, -10.5, 60],
    [4, 10.5, -50],
    [5, -10.5, 120],
  ]);
  ctx.setState('playing');
}

// ---------------------------------------------------------------------------
// chase — a three-star police ram run in golden late-afternoon light
// during the Hot Delivery job: three patrol cars going straight for
// Mara's bumper, traffic ahead, RAM RUN warning on the HUD.
// ---------------------------------------------------------------------------
function stageChase(ctx) {
  callIf(ctx.daynight, 'setHour', 17);
  stageDrivenCar(ctx, 0, 20, Math.PI);
  // The Hot Delivery job (job index 1), so the HUD objective matches
  // the shot — previously the pose left job 0 (First Job) active.
  callIf(ctx.missions, 'start', 1);
  callIf(ctx.missions, 'armSmugglerDelivery');
  callIf(ctx.police, 'setWanted', 3);
  // Car 0 is the ram car: it covers ~62 m in the 40 frames before the
  // picture (measured: (0,42) -> (3,-20)), so starting it at z=87 puts
  // it right on Mara's rear bumper, ramming, at frame 40. The other two
  // hold their flanking slots behind it.
  callIf(ctx.police, 'place', 0, 0, 87, Math.PI);
  callIf(ctx.police, 'place', 1, -7, 52, Math.PI);
  callIf(ctx.police, 'place', 2, 7, 58, Math.PI);
  stageTraffic(ctx.traffic, [
    [0, 0, -40, 'z', 1, 9],
    [1, 0, -90, 'z', -1, 8],
    [2, 62, -62, 'x', -1, 8],
    [3, -62, -20, 'x', 1, 7],
  ]);
  stagePeds(ctx.peds, [
    [0, 10.5, -10],
    [1, -10.5, 50],
    [2, 10.5, 100],
  ]);
  ctx.setState('playing');
}

// ---------------------------------------------------------------------------
// fish — fishing off the east pier at golden hour 17:30: Mara's line cast,
// the bobber on the bay off the pier tip, Biscuit at her heel, the second
// island and its lighthouse across the water.
// ---------------------------------------------------------------------------
function stageFish(ctx) {
  callIf(ctx.daynight, 'setHour', 17.5);
  const tip = PIER_TIP || { x: 0, z: 0 };
  const px = tip.x ?? 0;
  const pz = tip.z ?? 0;
  placeAt(ctx.player, px, 0, pz);
  ctx.player.heading = 0; // face south, out across the bay
  callIf(ctx.fishing, 'cast');
  // Biscuit the stray dog at Mara's heel, a few metres north-west of her.
  if (ctx.pets) {
    ctx.pets.markAdopted();
    placeDog(ctx.pets, px - 2.5, 0, pz - 3);
  }
  // Fixed camera north-west of Mara, looking south-east past her and the
  // bobber toward the island: the old camera sat south of Mara and aimed
  // straight at the lighthouse, leaving Mara behind it and the bobber
  // ~84 deg off axis. The bobber lands ~29 m south of Mara, slightly
  // east, so aim at the Mara/bobber midpoint, nudged a touch toward the
  // lighthouse to keep it in frame as well.
  const bx = px + 5.5;
  const bz = pz + 28.8;
  const beacon = LIGHTHOUSE_POS || { x: 40, z: 330 };
  const midX = (px + bx) / 2;
  const midZ = (pz + bz) / 2;
  const targetX = midX + ((beacon.x ?? 40) - midX) * 0.05;
  const targetZ = midZ + ((beacon.z ?? 330) - midZ) * 0.05;
  ctx.setCamera(px - 10, 4.5, pz - 9, targetX, 1, targetZ);
  ctx.setState('playing');
}

// ---------------------------------------------------------------------------
// night — a storm night at 22:00 on the beachfront: lamps glowing, moon
// up, lightning strobing the sky, rain falling, Mara's car at the
// intersection with downtown towers behind and traffic cruising with
// headlights.
// ---------------------------------------------------------------------------
function stageNight(ctx) {
  callIf(ctx.daynight, 'setHour', 22);
  if (ctx.weather) {
    if (typeof ctx.weather.setWeather === 'function') ctx.weather.setWeather('storm');
    else if (typeof ctx.weather.setStorm === 'function') ctx.weather.setStorm();
    else ctx.weather.raining = true;
  }
  stageDrivenCar(ctx, 0, 186, Math.PI);
  stageTraffic(ctx.traffic, [
    [0, 0, 150, 'z', -1, 9],
    [1, 0, 120, 'z', 1, 8],
    [2, 62, 186, 'x', 1, 9],
    [3, -62, 186, 'x', -1, 8],
    [4, 0, 60, 'z', -1, 10],
  ]);
  stagePeds(ctx.peds, [
    [0, 10.5, 200],
    [1, -10.5, 175],
    [2, 10.5, 150],
  ]);
  // No fixed camera here: the old fixed camera at (0,7,208) sat behind
  // the beachfront building, so the car was occluded. Use the chase
  // camera like the drive pose — it rides 9 m behind Mara's car on the
  // street, looking north past it toward the towers.
  ctx.setState('playing');
}

// ---------------------------------------------------------------------------
// Entry point: stage one pose by name.
// ---------------------------------------------------------------------------
export function stageShot(ctx, pose) {
  switch (pose) {
    case 'menu': return stageMenu(ctx);
    case 'drive': return stageDrive(ctx);
    case 'chase': return stageChase(ctx);
    case 'fish': return stageFish(ctx);
    case 'night': return stageNight(ctx);
    default: return;
  }
}
