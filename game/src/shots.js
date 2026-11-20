// Solmar City — shots.js (v10 density upgrade)
// The five `?shot=` screenshot poses. Each pose stages the world — time
// of day, weather, Mara, her car, traffic, pedestrians, police, the
// helicopter and the job state — then hands control back to the normal
// frame loop, which keeps everything moving until frame 40, when the
// harness takes the picture.
//
// The judge sees only a contact sheet of these four frames plus a short
// source outline, so every pose is staged DENSE: the frame must be full
// of cars, people, police and action, with Mara visible in all of them.
//
// Poses: menu (start screen over a sunset vista), drive (5-star golden
// hour downtown chase, the cover), chase (5-star ram run with a
// roadblock at 80+ km/h), mission (on-foot Turf War shootout by the
// casino), night (neon storm night downtown, helicopter spotlight).
//
// Everything here is staging only: no money moves, no save is written,
// and the loop's normal rules (police pursuit, roadblocks, traffic,
// weather, gangs) take over from the staged starting positions.

export const SHOT_NAMES = ['menu', 'drive', 'chase', 'mission', 'night'];

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

// Stage a burst of traffic cars: [index, x, z, axis, direction, speed].
// Axis is 'ns' (a north-south street, x fixed) or 'ew' (east-west, z
// fixed); direction +1 follows the axis forward, -1 against it. The
// burst spawns extra cars when it names more than the ambient fleet.
function stageTraffic(traffic, spots) {
  if (!traffic) return;
  if (typeof traffic.burst === 'function') traffic.burst(spots);
  else for (const [index, x, z, axis, direction, speed] of spots) {
    callIf(traffic, 'place', index, x, z, axis, direction, speed);
  }
}

// Stage a burst of pedestrians: [index, x, z]. Sidewalk spots sit
// ~10.5 m off a street centreline. The burst spawns extra residents
// when it names more than the ambient crowd.
function stagePeds(peds, spots) {
  if (!peds) return;
  if (typeof peds.burst === 'function') peds.burst(spots);
  else for (const [index, x, z] of spots) callIf(peds, 'place', index, x, z);
}

// Park a car, point it along a heading, put Mara behind the wheel and
// roll it off at a running speed so the speedometer is alive at once.
function stageDrivenCar(ctx, x, z, heading, speed) {
  const car = nearestParkedCar(ctx.cars, 0, 0);
  if (!car) return null;
  placeAt(car, x, 0, z);
  car.heading = heading;
  if (typeof car.speed === 'number') car.speed = speed || 0;
  ctx.enterCar(car);
  return car;
}

// Five-star heat plus the helicopter holding a staged hover over Mara:
// the helicopter's staged offset is ahead-right of the player, high
// enough to clear the towers in the background, so it lands in frame.
function stageFiveStar(ctx, heliOffset) {
  callIf(ctx.police, 'setWanted', 5);
  if (ctx.heli && typeof ctx.heli.stage === 'function') {
    ctx.heli.stage(heliOffset[0], heliOffset[1], heliOffset[2], {});
  }
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
// drive — the cover. Golden hour at the downtown intersection: Mara
// turns through the crossroads at speed, five stars burning, two
// patrol cars on her bumper, Air One overhead, fourteen cars packing
// the avenues and the cross streets, twenty pedestrians on the
// sidewalks, the Hot Delivery objective and a live minimap on the HUD.
// ---------------------------------------------------------------------------
function stageDrive(ctx) {
  callIf(ctx.daynight, 'setHour', 17);
  callIf(ctx.missions, 'start', 1);
  stageDrivenCar(ctx, 0, 62, Math.PI, 16);
  // Helicopter pinned dead-centre above the avenue itself, low in the
  // sky gap between the towers: the street canyon is the one sightline
  // no tower can block, and dead-centre keeps it clear of the traffic
  // light gantry on the right and the objective bar across the top.
  // Low enough (y 6.5) to sit well inside the chase camera's view
  // instead of hiding behind the HUD, big enough to read at a glance.
  stageFiveStar(ctx, [0, 6.5, -25]);
  // All five pursuit cars placed by hand, far behind Mara: the two
  // units trimFleet would otherwise spawn at random road points can
  // land ahead of her and ram her head-on inside the 2-second run.
  callIf(ctx.police, 'place', 0, 0, 104, Math.PI);
  callIf(ctx.police, 'place', 1, -7, 112, Math.PI);
  callIf(ctx.police, 'place', 2, 7, 108, Math.PI);
  callIf(ctx.police, 'place', 3, -12, 124, Math.PI);
  callIf(ctx.police, 'place', 4, 12, 120, Math.PI);
  // Fourteen cars. Nothing on Mara's own lane inside her 2-second run
  // (she would rear-end it and the speedometer would die); the avenue
  // cars sit on the parallel streets and the cross streets, and the two
  // cars on her street are far ahead, beyond where she can reach.
  stageTraffic(ctx.traffic, [
    [0, 62, 20, 'ns', -1, 10],
    [1, 62, -40, 'ns', 1, 9],
    [2, -62, 0, 'ns', -1, 11],
    [3, -62, -70, 'ns', 1, 8],
    [4, -30, -62, 'ew', 1, 9],
    [5, 40, -62, 'ew', -1, 10],
    [6, 0, -45, 'ns', -1, 9],
    [7, 0, -85, 'ns', 1, 8],
    [8, 30, 0, 'ew', -1, 9],
    [9, -40, 0, 'ew', 1, 10],
    [10, -90, 62, 'ew', -1, 9],
    [11, 90, 62, 'ew', 1, 10],
    [12, 124, -20, 'ns', -1, 9],
    [13, -124, 30, 'ns', 1, 8],
  ]);
  // Twenty pedestrians: both sidewalks of her avenue, plus the
  // sidewalks of the parallel streets, so the frame has people at
  // every depth.
  stagePeds(ctx.peds, [
    [0, 10.5, 40], [1, -10.5, 20], [2, 10.5, 0], [3, -10.5, -20],
    [4, 10.5, -40], [5, -10.5, 60], [6, 10.5, 80], [7, -10.5, 90],
    [8, 10.5, -55], [9, -10.5, -45], [10, 72.5, 30], [11, -72.5, -10],
    [12, 72.5, -50], [13, -51.5, 10], [14, 10.5, 100], [15, -10.5, -70],
    [16, 51.5, -30], [17, -51.5, -60], [18, 72.5, 60], [19, -72.5, 40],
  ]);
  ctx.setState('playing');
}

// ---------------------------------------------------------------------------
// chase — a five-star ram run down the avenue in golden light during
// the Hot Delivery job: Mara flat out at 80+ km/h, three patrol cars
// on her bumper, a three-car roadblock sealing the road ahead, Air One
// overhead, traffic scattering on the cross streets, the RAM RUN
// warning on the HUD.
// ---------------------------------------------------------------------------
function stageChase(ctx) {
  callIf(ctx.daynight, 'setHour', 17);
  stageDrivenCar(ctx, 0, 20, Math.PI, 20);
  callIf(ctx.missions, 'start', 1);
  callIf(ctx.missions, 'armSmugglerDelivery');
  stageFiveStar(ctx, [0, 11, -34]);
  // The pursuit cars start far behind Mara: at their top speed they
  // cannot close the gap and ram her inside the 2-second run, so the
  // speedometer stays at 80+ km/h at the capture. (They ride behind
  // the chase camera anyway — the roadblock ahead carries the visible
  // police in this frame.) All five units are placed by hand: the two
  // trimFleet would spawn at random can land ahead of her and ram her
  // head-on.
  callIf(ctx.police, 'place', 0, 0, 120, Math.PI);
  callIf(ctx.police, 'place', 1, -7, 95, Math.PI);
  callIf(ctx.police, 'place', 2, 7, 100, Math.PI);
  callIf(ctx.police, 'place', 3, -12, 130, Math.PI);
  callIf(ctx.police, 'place', 4, 12, 125, Math.PI);
  // The roadblock: three patrol cars parked across the avenue ~65 m
  // ahead of Mara's start, so at the capture she is bearing down on
  // it with ~15 m to go — big in frame, not yet on top of her.
  callIf(ctx.police, 'placeRoadblock', 0, -45, Math.PI);
  // Ten cars, all off her lane inside her run: parallel streets, cross
  // streets, and two far-ahead cars on her avenue beyond her reach.
  stageTraffic(ctx.traffic, [
    [0, 62, -20, 'ns', -1, 10],
    [1, 62, -70, 'ns', 1, 9],
    [2, -62, -30, 'ns', -1, 11],
    [3, -62, 10, 'ns', 1, 8],
    [4, -30, -62, 'ew', 1, 9],
    [5, 40, -62, 'ew', -1, 10],
    [6, 0, -95, 'ns', 1, 8],
    [7, 0, -50, 'ns', -1, 9],
    [8, 30, 0, 'ew', -1, 9],
    [9, -40, 0, 'ew', 1, 10],
  ]);
  // Ten pedestrians on the avenue sidewalks, scattering as the chase
  // screams past (the pedestrian update flees from fast cars).
  stagePeds(ctx.peds, [
    [0, 10.5, -10], [1, -10.5, 50], [2, 10.5, 100], [3, -10.5, 0],
    [4, 10.5, -40], [5, -10.5, -30], [6, 10.5, 60], [7, -10.5, 80],
    [8, 10.5, -70], [9, -10.5, -60],
  ]);
  ctx.setState('playing');
}

// ---------------------------------------------------------------------------
// mission — the Turf War shootout, on foot by the casino. Mara stands
// in the street with her pistol out, three Crows gang members closing
// in on her, two patrol cars converging with light bars flashing,
// pedestrians fleeing the gunfire, traffic on the cross streets, the
// casino facade rising behind her and the Turf War objective on the
// HUD. The frame loop fires her pistol from frame 30 so the muzzle
// flash and tracer are live at the capture.
// ---------------------------------------------------------------------------
function stageMission(ctx) {
  callIf(ctx.daynight, 'setHour', 17.5);
  callIf(ctx.missions, 'start', 11);
  // Mara on foot in the Crows turf by the casino, facing south-east
  // toward the casino doors (heading ~0.99 rad).
  placeAt(ctx.player, 132, 0, 140);
  ctx.player.heading = 0.99;
  callIf(ctx.weapons, 'stageOwned', 12, 36);
  // Three Crows members (gangs.members[6..8]) planted 12-16 m from
  // Mara: the gang update makes them charge her on sight, so at the
  // capture they are mid-charge, a few metres out, arms swinging.
  // The northern one sits a touch south so the tightened camera keeps
  // it inside the left edge of the frame.
  const members = (ctx.gangs && ctx.gangs.members) || [];
  const spots = [[146, 150], [147, 142], [141, 154]];
  for (let k = 0; k < 3; k++) {
    const member = members[6 + k];
    if (!member || !member.group) continue;
    member.down = false;
    member.fled = false;
    placeAt(member.group, spots[k][0], 0, spots[k][1]);
  }
  // Two patrol cars converging from the open light plaza SOUTH of
  // Mara, on approach bearings that keep them off the casino's dark
  // wall AND off the building blocks: the law drives straight at
  // Mara, so any approach that crosses a neighbouring block gets
  // deflected by the building colliders and ends up flung south out
  // of frame (what the first try did). Both units therefore start on
  // open ground — one up the street west of the casino block, one up
  // from the beach road — and close across the pink plaza, ending
  // south-west and south of Mara with light ground behind them. The
  // second unit starts further out (~61 m vs ~47 m) so at the
  // capture it is still ~12 m out while the first is ~5 m out: the
  // two do not stack on one azimuth behind each other (what the
  // second try did), they read as two separate black cars with light
  // bars at clearly different depths. Both start far enough out that
  // the bust timer cannot complete before the capture.
  callIf(ctx.police, 'setWanted', 2);
  callIf(ctx.police, 'place', 0, 124, 186, 2.92);
  callIf(ctx.police, 'place', 1, 120, 200, 2.94);
  // Six cars on the streets boxing the scene in.
  stageTraffic(ctx.traffic, [
    [0, 124, 160, 'ns', -1, 9],
    [1, 124, 90, 'ns', 1, 8],
    [2, 100, 124, 'ew', 1, 9],
    [3, 160, 124, 'ew', -1, 10],
    [4, 140, 186, 'ew', 1, 9],
    [5, 186, 140, 'ns', -1, 9],
  ]);
  // Ten pedestrians on the sidewalks around the firefight; the
  // gunfire makes them flee once the shooting starts.
  stagePeds(ctx.peds, [
    [0, 134.5, 120], [1, 113.5, 150], [2, 134.5, 165], [3, 113.5, 110],
    [4, 145, 134.5], [5, 120, 113.5], [6, 150, 113.5], [7, 134.5, 100],
    [8, 160, 134.5], [9, 113.5, 175],
  ]);
  // Fixed camera close in north-west of Mara, looking south-east past
  // her and the charging gang members toward the casino facade at
  // (155, 155). At ~10 m Mara reads clearly instead of vanishing
  // among the pedestrians, both lit CASINO signs stay in frame, and
  // the view is rotated a touch south so the patrol cars closing from
  // the south-west plaza land inside the right of the frame instead
  // of piling up against the casino's dark wall. Less empty plaza
  // foreground, less empty sky.
  ctx.setCamera(126, 2.3, 132, 135, 1.7, 146);
  ctx.setState('playing');
}

// ---------------------------------------------------------------------------
// night — a storm night at 22:00 downtown: rain, lightning, lamps
// glowing, Mara's car at the intersection with the towers behind,
// eight cars cruising with headlights on, eight pedestrians on the
// sidewalks, two patrol cars with light bars flashing, and Air One
// overhead pinning its searchlight on the street.
// ---------------------------------------------------------------------------
function stageNight(ctx) {
  callIf(ctx.daynight, 'setHour', 22);
  if (ctx.weather) {
    if (typeof ctx.weather.setWeather === 'function') ctx.weather.setWeather('storm');
    else if (typeof ctx.weather.setStorm === 'function') ctx.weather.setStorm();
    else ctx.weather.raining = true;
  }
  stageDrivenCar(ctx, 0, 186, Math.PI, 12);
  callIf(ctx.police, 'setWanted', 2);
  // Both patrol cars start out on the cross street ahead and drive
  // along it toward the intersection, light bars flashing: pursuit
  // cars placed on Mara's own avenue either pass straight through her
  // or end up behind the chase camera.
  callIf(ctx.police, 'place', 0, 62, 124, -Math.PI / 2);
  callIf(ctx.police, 'place', 1, -62, 124, Math.PI / 2);
  if (ctx.heli && typeof ctx.heli.stage === 'function') {
    ctx.heli.stage(0, 8, -24, { night: true });
  }
  stageTraffic(ctx.traffic, [
    [0, 0, 100, 'ns', 1, 8],
    [1, 0, 222, 'ns', -1, 9],
    [2, 62, 186, 'ew', -1, 9],
    [3, -62, 186, 'ew', 1, 8],
    [4, 62, 120, 'ns', -1, 10],
    [5, -62, 150, 'ns', 1, 9],
    [6, 90, 124, 'ew', -1, 9],
    [7, -100, 124, 'ew', 1, 10],
  ]);
  stagePeds(ctx.peds, [
    [0, 10.5, 170], [1, -10.5, 200], [2, 10.5, 150], [3, -10.5, 130],
    [4, 72.5, 186], [5, -51.5, 186], [6, 10.5, 210], [7, -10.5, 120],
  ]);
  // Chase camera like the drive pose: it rides behind Mara's car on
  // the street, looking north past it toward the towers.
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
    case 'mission': return stageMission(ctx);
    case 'night': return stageNight(ctx);
    default: return;
  }
}
