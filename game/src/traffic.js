// traffic.js — AI traffic cars on the Solmar City road grid.
// Cars cruise the avenues, stop at red lights, queue at intersections,
// overtake parked cars and honk when they get stuck behind someone.
import * as THREE from 'three';
import { createCar } from './vehicles.js';
import { CITY, randomRoadPoint, nearestStreet } from './city.js';
import { createRng, rand, pick, clamp } from './utils.js';

const STREETS = (CITY && CITY.streets) || [-186, -124, -62, 0, 62, 124, 186];
const BOUND = (CITY && CITY.bound) || 235;
const CYCLE = 19;
const NS_GREEN_END = 8;
const NS_AMBER_END = 9.5;
const EW_GREEN_END = 17.5;

// Heading (radians) for a given axis/direction. Forward is
// (sin(heading), cos(heading)) in the x/z plane.
function headingFor(axis, dir) {
  if (axis === 'ns') return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

function carPos(car) {
  return (car && (car.pos || car.position)) || null;
}

function syncMesh(wrapper) {
  const p = carPos(wrapper.car);
  if (!p || !wrapper.car.group) return;
  wrapper.car.group.position.set(p.x, 0, p.z);
  wrapper.car.group.rotation.y = wrapper.car.heading || 0;
}

function spinWheels(car, dt) {
  const wheels = (car && car.wheels) || [];
  const spin = (car.speed || 0) * dt * 2.2;
  for (const w of wheels) {
    if (w) w.rotation.x += spin;
  }
}

// A road point from the city helper, normalised to {x, z, axis, dir}.
function normaliseRoadPoint(pt, rng) {
  let x = 0;
  let z = 0;
  let axis = 'ns';
  let dir = 1;
  if (pt) {
    if (pt.pos) { x = pt.pos.x || 0; z = pt.pos.z || 0; }
    else { x = pt.x || 0; z = pt.z || 0; }
    if (pt.axis) axis = pt.axis;
    if (pt.dir) dir = pt.dir > 0 ? 1 : -1;
  }
  if (!pt || (!pt.axis && !pt.pos && pt.x === undefined)) {
    // Fallback: pick a street ourselves.
    axis = rng() < 0.5 ? 'ns' : 'ew';
    dir = rng() < 0.5 ? 1 : -1;
    const street = pick(rng, STREETS);
    const along = rand(rng, -186, 186);
    if (axis === 'ns') { x = street; z = along; }
    else { x = along; z = street; }
  } else if (!pt.axis) {
    // The helper gave us a bare point: infer the street it sits on.
    const distToNs = Math.abs(x - nearestStreet(x));
    const distToEw = Math.abs(z - nearestStreet(z));
    axis = distToNs <= distToEw ? 'ns' : 'ew';
    dir = rng() < 0.5 ? 1 : -1;
  }
  return { x, z, axis, dir };
}

// How far a point sits ahead of a car, and how far sideways from its lane.
function aheadOf(wrapper, x, z) {
  const p = carPos(wrapper.car);
  if (!p) return { ahead: -999, side: 999 };
  const h = wrapper.car.heading || 0;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const dx = x - p.x;
  const dz = z - p.z;
  return { ahead: dx * fx + dz * fz, side: Math.abs(fx * dz - fz * dx) };
}

function makeLight(scene, rng, lx, lz) {
  const group = new THREE.Group();
  group.position.set(lx + 9, 0, lz + 9);
  const dark = new THREE.MeshLambertMaterial({ color: 0x22262b });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7, 8), dark);
  pole.position.y = 3.5;
  group.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.1, 0.7), dark);
  head.position.y = 7.2;
  group.add(head);
  const lampGeo = new THREE.SphereGeometry(0.26, 10, 8);
  const redMat = new THREE.MeshBasicMaterial({ color: 0x3a0d0d });
  const amberMat = new THREE.MeshBasicMaterial({ color: 0x3a2a08 });
  const greenMat = new THREE.MeshBasicMaterial({ color: 0x0d2a18 });
  const red = new THREE.Mesh(lampGeo, redMat);
  red.position.set(0, 7.9, 0.36);
  const amber = new THREE.Mesh(lampGeo, amberMat);
  amber.position.set(0, 7.2, 0.36);
  const green = new THREE.Mesh(lampGeo, greenMat);
  green.position.set(0, 6.5, 0.36);
  group.add(red, amber, green);
  scene.add(group);
  return {
    x: lx, z: lz, group,
    timer: rand(rng, 0, 8),
    nsGreen: true,
    redMat, amberMat, greenMat,
  };
}

function updateLight(light, dt) {
  light.timer = (light.timer + dt) % CYCLE;
  const t = light.timer;
  const nsLit = t < NS_GREEN_END;
  const nsAmber = t >= NS_GREEN_END && t < NS_AMBER_END;
  light.nsGreen = t < NS_AMBER_END;
  light.greenMat.color.setHex(nsLit ? 0x2aff66 : 0x0d2a18);
  light.amberMat.color.setHex(nsAmber ? 0xffb020 : 0x3a2a08);
  light.redMat.color.setHex(!nsLit && !nsAmber ? 0xff2a2a : 0x3a0d0d);
}

function lightPhase(light) {
  const t = light.timer % CYCLE;
  return { nsLit: t < NS_GREEN_END, ewLit: t >= NS_AMBER_END && t < EW_GREEN_END };
}

// Is the light at this intersection red for a car on this axis?
function lightIsRed(light, wrapper) {
  const p = carPos(wrapper.car);
  if (!p) return false;
  const phase = lightPhase(light);
  if (wrapper.axis === 'ns') {
    if (Math.abs(light.x - p.x) > 9) return false;
    const ahead = (light.z - p.z) * wrapper.dir;
    if (ahead < 0 || ahead > 16) return false;
    return !phase.nsLit;
  }
  if (Math.abs(light.z - p.z) > 9) return false;
  const ahead = (light.x - p.x) * wrapper.dir;
  if (ahead < 0 || ahead > 16) return false;
  return !phase.ewLit;
}

export function spawnTraffic(scene, seed, count = 10) {
  const rng = createRng(seed * 7919 + 13);
  const cars = [];
  for (let i = 0; i < count; i++) {
    const car = createCar(scene);
    const spot = normaliseRoadPoint(randomRoadPoint(rng), rng);
    const lane = spot.dir > 0 ? 2.4 : -2.4;
    const wrapper = {
      car,
      axis: spot.axis,
      dir: spot.dir,
      lane,
      cruise: rand(rng, 8, 13),
      speed: rand(rng, 6, 12),
      turnCooldown: rand(rng, 2, 8),
      overtakeTimer: 0,
      overtaking: false,
      hornTimer: 0,
      queueDelay: 0,
      wasRed: false,
    };
    const p = carPos(car);
    if (p) { p.x = spot.x; p.y = 0; p.z = spot.z; }
    car.heading = headingFor(spot.axis, spot.dir);
    car.speed = wrapper.speed;
    syncMesh(wrapper);
    cars.push(wrapper);
  }

  const lightSpots = [[0, 0], [62, 62], [-62, -62], [0, 124]];
  const lights = lightSpots.map(([x, z]) => makeLight(scene, rng, x, z));

  const traffic = { cars, update, place, burst, spawnExtra, lights, horn: false, hornCooldown: 0 };

  // Rush-hour density: spawn extra traffic cars around a centre point
  // (a posed intersection), so a screenshot or a hot pursuit can pack
  // the streets instead of running on the ten ambient cars alone.
  function spawnExtra(count, cx, cz) {
    const made = [];
    for (let k = 0; k < (count || 0); k++) {
      const car = createCar(scene);
      const axis = rng() < 0.5 ? 'ns' : 'ew';
      const street = pick(rng, STREETS);
      const along = (axis === 'ns' ? (cz || 0) : (cx || 0)) + rand(rng, -55, 55);
      const dir = rng() < 0.5 ? 1 : -1;
      const wrapper = {
        car,
        axis,
        dir,
        lane: dir > 0 ? 2.4 : -2.4,
        cruise: rand(rng, 8, 13),
        speed: rand(rng, 6, 12),
        turnCooldown: rand(rng, 2, 8),
        overtakeTimer: 0,
        overtaking: false,
        hornTimer: 0,
        queueDelay: 0,
        wasRed: false,
      };
      const p = carPos(car);
      if (p) {
        p.x = axis === 'ns' ? street : along;
        p.y = 0;
        p.z = axis === 'ns' ? along : street;
      }
      car.heading = headingFor(axis, dir);
      car.speed = wrapper.speed;
      syncMesh(wrapper);
      cars.push(wrapper);
      made.push(wrapper);
    }
    return made;
  }

  // Stage a whole burst of cars at once: [index, x, z, axis, dir, speed].
  // Spawns extra cars first when the burst names more than the fleet has.
  function burst(spots) {
    const list = spots || [];
    if (list.length > cars.length) {
      const cx = list.length ? list[0][1] : 0;
      const cz = list.length ? list[0][2] : 0;
      spawnExtra(list.length - cars.length, cx, cz);
    }
    for (const [index, x, z, axis, dir, speed] of list) place(index, x, z, axis, dir, speed);
  }

  function update(dt, ctx) {
    ctx = ctx || {};
    const parked = ctx.parkedCars || [];
    const grip = ctx.grip === undefined || ctx.grip === null ? 1 : ctx.grip;
    for (const light of lights) updateLight(light, dt);
    if (traffic.hornCooldown > 0) traffic.hornCooldown -= dt;

    // Obstacles: every traffic car, the player's car, every parked car.
    const obstacles = [];
    for (const w of cars) {
      const p = carPos(w.car);
      if (p) obstacles.push({ x: p.x, z: p.z, speed: w.speed || 0, parked: false, self: w });
    }
    if (ctx.playerCar && ctx.playerInCar) {
      const pp = carPos(ctx.playerCar);
      if (pp) obstacles.push({ x: pp.x, z: pp.z, speed: Math.abs(ctx.playerCar.speed || 0), parked: false, self: null });
    }
    for (const parkedCar of parked) {
      const pp = carPos(parkedCar);
      if (pp) obstacles.push({ x: pp.x, z: pp.z, speed: 0, parked: true, self: null });
    }

    for (const w of cars) {
      const p = carPos(w.car);
      if (!p) continue;
      if (w.turnCooldown > 0) w.turnCooldown -= dt;
      if (w.queueDelay > 0) w.queueDelay -= dt;

      // Vehicle ahead in the forward cone.
      let blocker = null;
      let blockerDist = 99;
      for (const ob of obstacles) {
        if (ob.self === w) continue;
        const rel = aheadOf(w, ob.x, ob.z);
        if (rel.ahead > 0 && rel.ahead < 11 && rel.side < 3.2 && rel.ahead < blockerDist) {
          blocker = ob;
          blockerDist = rel.ahead;
        }
      }
      const parkedAhead = blocker && blocker.parked;
      const movingBlocker = blocker && !blocker.parked;

      // Overtaking a parked car: wait ~0.6s, then swing to the other lane.
      if (parkedAhead) {
        w.overtakeTimer += dt;
        if (w.overtakeTimer > 0.6) w.overtaking = true;
      } else {
        w.overtakeTimer = Math.max(0, w.overtakeTimer - dt);
        if (w.overtakeTimer <= 0) w.overtaking = false;
      }

      // Lane target: nearest centreline plus the lane offset (flipped
      // while overtaking), eased toward at ~3/s.
      const laneOff = w.overtaking ? -w.lane : w.lane;
      if (w.axis === 'ns') {
        const targetX = nearestStreet(p.x) + laneOff;
        p.x += (targetX - p.x) * Math.min(1, 3 * dt);
      } else {
        const targetZ = nearestStreet(p.z) + laneOff;
        p.z += (targetZ - p.z) * Math.min(1, 3 * dt);
      }

      // Target speed.
      let target = w.cruise * grip;
      if (w.overtaking) target = w.cruise * 0.7 * grip;
      if (movingBlocker) target = 0;
      if (parkedAhead && !w.overtaking) target = 0;

      // Red light ahead.
      let redAhead = false;
      for (const light of lights) {
        if (lightIsRed(light, w)) { redAhead = true; break; }
      }
      if (redAhead) {
        target = 0;
        w.wasRed = true;
      } else if (w.wasRed) {
        // The light just turned green: if we are queued behind stopped
        // cars, wait our turn instead of surging with the whole line.
        w.wasRed = false;
        let queued = 0;
        for (const other of cars) {
          if (other === w) continue;
          const op = carPos(other.car);
          if (!op || other.axis !== w.axis) continue;
          const rel = aheadOf(w, op.x, op.z);
          if (rel.ahead > 0 && rel.ahead < 30 && rel.side < 8 && (other.speed || 0) < 0.5) queued++;
        }
        if (queued > 0) w.queueDelay = (queued + 1) * 0.7;
      }

      // Intersection queue: stopped behind a stopped car — hold until
      // our staggered delay has drained.
      if (movingBlocker && blockerDist < 12 && (blocker.speed || 0) < 0.5 && w.speed < 0.5) {
        if (w.queueDelay <= 0) w.queueDelay = 0.7;
      }
      if (w.queueDelay > 0) target = 0;

      // Horn: stuck behind a moving car at under 0.5 m/s for > 2.5s.
      if (movingBlocker && w.speed < 0.5) {
        w.hornTimer += dt;
        if (w.hornTimer > 2.5 && traffic.hornCooldown <= 0) {
          traffic.horn = true;
          traffic.hornCooldown = 4;
          w.hornTimer = 0;
        }
      } else {
        w.hornTimer = 0;
      }

      // Ease speed toward the target (rate ~2.5/s) and keep the car
      // object in sync (other systems read it for queue checks).
      w.speed += (target - w.speed) * Math.min(1, 2.5 * dt);
      w.speed = clamp(w.speed, 0, 30);
      w.car.speed = w.speed;

      // Heading eases toward the axis direction, then drive forward.
      const wantHeading = headingFor(w.axis, w.dir);
      let dh = wantHeading - (w.car.heading || 0);
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      w.car.heading = (w.car.heading || 0) + clamp(dh, -4 * dt, 4 * dt);
      const h = w.car.heading;
      p.x += Math.sin(h) * w.speed * dt;
      p.z += Math.cos(h) * w.speed * dt;

      // Turns at intersections.
      const along = w.axis === 'ns' ? p.z : p.x;
      const nearest = nearestStreet(along);
      if (Math.abs(along - nearest) < 3 && w.turnCooldown <= 0 && rng() < 0.9 * dt) {
        const newAxis = w.axis === 'ns' ? 'ew' : 'ns';
        const newDir = rng() < 0.5 ? 1 : -1;
        w.axis = newAxis;
        w.dir = newDir;
        w.lane = newDir > 0 ? 2.4 : -2.4;
        w.car.heading = headingFor(newAxis, newDir);
        w.turnCooldown = rand(rng, 4, 10);
      }

      // Map edge: U-turn.
      const edge = w.axis === 'ns' ? p.z : p.x;
      if (Math.abs(edge) > 198) {
        w.dir = -w.dir;
        w.lane = -w.lane;
        w.car.heading = headingFor(w.axis, w.dir);
        if (w.axis === 'ns') p.z = clamp(p.z, -198, 198);
        else p.x = clamp(p.x, -198, 198);
        w.turnCooldown = 4;
      }

      p.x = clamp(p.x, -210, 210);
      p.z = clamp(p.z, -210, 210);
      syncMesh(w);
      spinWheels(w.car, dt);
    }
  }

  function place(i, x, z, axis, dir, speed = 10) {
    const w = cars[((i % cars.length) + cars.length) % cars.length];
    const p = carPos(w.car);
    w.axis = axis;
    w.dir = dir > 0 ? 1 : -1;
    w.lane = w.dir > 0 ? 2.4 : -2.4;
    w.cruise = speed;
    w.speed = speed;
    w.car.speed = speed;
    if (p) { p.x = x; p.y = 0; p.z = z; }
    w.car.heading = headingFor(axis, w.dir);
    w.turnCooldown = 4;
    w.overtaking = false;
    w.overtakeTimer = 0;
    syncMesh(w);
    return w;
  }

  return traffic;
}

export function trafficCrash(traffic, playerCar, cooldown) {
  if (!traffic || !playerCar || !cooldown) return false;
  if (Math.abs(playerCar.speed || 0) < 3) return false;
  if ((cooldown.value || 0) > 0) return false;
  const pp = carPos(playerCar);
  if (!pp) return false;
  for (const w of traffic.cars || []) {
    const p = carPos(w.car);
    if (!p) continue;
    const dx = p.x - pp.x;
    const dz = p.z - pp.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 3.6 && dist > 0.001) {
      cooldown.value = 2;
      // Shove the traffic car sideways away from the player, 40% of
      // the separation, and slow the player's car to 45%.
      p.x += dx * 0.4;
      p.z += dz * 0.4;
      playerCar.speed = (playerCar.speed || 0) * 0.45;
      syncMesh(w);
      return true;
    }
    if (dist <= 0.001) {
      cooldown.value = 2;
      playerCar.speed = (playerCar.speed || 0) * 0.45;
      return true;
    }
  }
  return false;
}
