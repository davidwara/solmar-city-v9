// Recovery K: witnessing touch — no functional change.
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

// Biscuit's rendered group is pets.group (measured at __shotReady), though
// the pets system may also expose it under several other names (dog /
// biscuit / a nested group). Place the first real three.js object found,
// starting with the rendered group itself, so the dog actually lands
// where staging puts it.
function placeDog(pets, x, z) {
  if (!pets) return;
  const tops = [pets.group, pets.dog, pets.biscuit, pets.dogGroup, pets.pet];
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
  // Car 0 is the ram car. It covers ~62 m in the 40 frames before the
  // picture (measured: r7 start (0,87,PI) landed at (0,25)). x MUST be 0:
  // the r7 sideways offset (4,95) flipped its steering south-east and it
  // ended up 110 m behind Mara. But z=95 overshoots the other way: it
  // would land at z~33, BEHIND the 9 m chase camera (z~28.5) — invisible
  // even from the east-offset camera (~82 deg off axis). z=88 lands it at
  // z~26, ~6 m behind Mara's bumper, fully in frame and — from the
  // east-offset chase camera — beside her instead of covering her. The
  // other two hold their flanking slots behind it (one visible ram car
  // satisfies the shot; their lateral offsets break their steering too,
  // so moving them cannot make them visible from here).
  callIf(ctx.police, 'place', 0, 0, 88, Math.PI);
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
  // Face south-east (0.4 rad): the cast follows Mara's facing, so the
  // bobber lands ~11 m east of the pier centreline in open water instead
  // of on the pier's east-edge post line (the old due-south cast put it
  // at (-150,263), exactly on a pier post in screen space). If the cast
  // is a fixed target the heading is harmless — Mara still faces the bay.
  ctx.player.heading = 0.4;
  callIf(ctx.fishing, 'cast');
  // Biscuit the stray dog at Mara's heel, a few metres north-west of her.
  // ABSOLUTE spot from the measured runtime facts (Mara (-155.5,0,235)):
  // the pier-tip variables did not evaluate to Mara's position at staging
  // time, so derive nothing from them here. The per-frame hook in
  // main.js re-applies this same spot every frame, because the pets
  // update repositions the rendered group (pets.group) each frame and a
  // staging-only placement never sticks.
  if (ctx.pets) {
    ctx.pets.markAdopted();
    placeDog(ctx.pets, -158, 0, 232);
  }
  // Fixed camera NORTH-WEST of Mara, looking south-east past her and the
  // bobber toward the bay/island. ABSOLUTE coordinates from the measured
  // runtime facts (Mara (-155.5,0,235), bobber (-150,0.3,263)). Round-8
  // defects fixed here: (1) the old camera put the bobber exactly on a
  // pier post in screen space — the new camera (further west, higher)
  // moves the bobber ~24 deg clear of the post; (2) the REAL lighthouse
  // is at (80,0,395), not (40,330) — from the old camera it projected
  // onto the island's building cluster. Round-9: the round-8 camera
  // (-185,10,215)->(-125,4,285) still left the tower behind the wide grey
  // block — measured tower (477,282-340), only a sliver at the block's
  // right edge. This camera goes FURTHER west (+65 m) and south (+10 m)
  // and higher (y=15), with the target shifted FURTHER east (+50 m), so
  // parallax moves the tower clear right of the block: the projection
  // math (calibrated — it reproduces the measured (477,340) exactly)
  // puts the tower at (682,304-350) with 7-38 px of clearance past the
  // block's right edge, while Mara stays lower-left (456,424), Biscuit at
  // her heel (437,428) and the bobber near centre (597,408).
  ctx.setCamera(-250, 15, 225, -75, 4, 300);
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
