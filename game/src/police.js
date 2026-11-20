// police.js — the wanted system: stars, pursuit cars, busts and escapes.
// One patrol car per star chases Mara; at three stars in a car they run
// her down. Out of sight long enough and the heat cools off, star by star.
import * as THREE from 'three';
import { createCar, addLightBar } from './vehicles.js';
import { CITY, randomRoadPoint } from './city.js';
import { createRng, rand, clamp, angleDiff } from './utils.js';
import { resolveCollisions } from './player.js';

const MAX_WANTED = 5;
const BOUND = (CITY && CITY.bound) || 235;
const BUST_DIST = 3.2;
const BUST_TIME = 1.4;
const UNSEEN_DIST = 110;
const UNSEEN_TIME = 6;
const DECAY_TIME = 4;
const PAINT = 0x181c22;

function unitPos(unit) {
  const car = unit && unit.car;
  return (car && (car.pos || car.position)) || null;
}

function syncUnit(unit) {
  const p = unitPos(unit);
  if (!p || !unit.car.group) return;
  unit.car.group.position.set(p.x, 0, p.z);
  unit.car.group.rotation.y = unit.car.heading || 0;
}

function spinWheels(car, dt) {
  const wheels = (car && car.wheels) || [];
  const spin = (car.speed || 0) * dt * 2.2;
  for (const w of wheels) {
    if (w) w.rotation.x += spin;
  }
}

// Paint a fresh car near-black and fit it out as a patrol car.
function paintPatrol(car) {
  if (!car || !car.group) return;
  if (typeof car.setPaint === 'function') {
    try { car.setPaint(PAINT); } catch (e) { /* fall through to traverse */ }
  }
  car.group.traverse((child) => {
    if (!child || !child.isMesh || !child.material || !child.material.color) return;
    const name = (child.name || '').toLowerCase();
    if (name.indexOf('wheel') >= 0 || name.indexOf('tyre') >= 0 ||
        name.indexOf('tire') >= 0 || name.indexOf('glass') >= 0 ||
        name.indexOf('window') >= 0 || name.indexOf('light') >= 0) return;
    child.material = child.material.clone();
    child.material.color.setHex(PAINT);
  });
}

function makeDoorSlab() {
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(1.92, 0.3, 1.4),
    new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
  );
  slab.position.y = 0.62;
  return slab;
}

export function createPolice(scene, seed) {
  const rng = createRng(seed * 15485863 + 99);

  const police = {
    wanted: 0,
    cars: [],
    roadblocks: [],
    unseenTimer: 0,
    decayTimer: 0,
    ramCooldown: 0,
    roadblockCooldown: 0,
    flash: 0,
    ramming: false,
    addHeat,
    setWanted,
    place,
    placeRoadblock,
    deployRoadblock,
    clearRoadblocks,
    update,
    get pursuitCars() { return police.cars; },
  };

  function buildUnit() {
    const car = createCar(scene);
    paintPatrol(car);
    let lights = null;
    try { lights = addLightBar(car); } catch (e) { lights = null; }
    if (car.group) car.group.add(makeDoorSlab());
    const unit = { car, lights, speed: 0, bustTimer: 0 };
    if (car.group) car.group.visible = true;
    return unit;
  }

  // Normalise a city road point to plain x/z.
  function roadPoint() {
    const pt = randomRoadPoint(rng);
    if (!pt) return { x: 0, z: 0 };
    if (pt.pos) return { x: pt.pos.x || 0, z: pt.pos.z || 0 };
    return { x: pt.x || 0, z: pt.z || 0 };
  }

  function spawnNear(playerPos) {
    const unit = buildUnit();
    const spot = roadPoint();
    let x = spot.x;
    let z = spot.z;
    const px = (playerPos && playerPos.x) || 0;
    const pz = (playerPos && playerPos.z) || 0;
    const dx = x - px;
    const dz = z - pz;
    const dist = Math.hypot(dx, dz);
    if (dist < 35) {
      const bearing = dist > 0.01 ? Math.atan2(dx, dz) : rng() * Math.PI * 2;
      x = px + Math.sin(bearing) * 45;
      z = pz + Math.cos(bearing) * 45;
      x = clamp(x, -200, 200);
      z = clamp(z, -200, 200);
    }
    const p = unitPos(unit);
    if (p) { p.x = x; p.y = 0; p.z = z; }
    // Head toward the player.
    unit.car.heading = Math.atan2(px - x, pz - z);
    unit.car.speed = 0;
    unit.speed = 0;
    syncUnit(unit);
    police.cars.push(unit);
    return unit;
  }

  function trimFleet(target, playerPos) {
    while (police.cars.length < target) spawnNear(playerPos);
    while (police.cars.length > target) {
      const extra = police.cars.pop();
      if (extra && extra.car && extra.car.group) extra.car.group.visible = false;
    }
  }

  function addHeat(n, playerPos) {
    if (!n || n <= 0) return;
    police.wanted = clamp(police.wanted + n, 0, MAX_WANTED);
    police.unseenTimer = 0;
    trimFleet(police.wanted, playerPos);
  }

  function setWanted(n, playerPos) {
    police.wanted = clamp(n || 0, 0, MAX_WANTED);
    police.unseenTimer = 0;
    trimFleet(police.wanted, playerPos);
  }

  function place(i, x, z, heading) {
    while (police.cars.length <= i) {
      const unit = buildUnit();
      const p = unitPos(unit);
      if (p) { p.x = 0; p.y = 0; p.z = 0; }
      police.cars.push(unit);
    }
    const unit = police.cars[i];
    const p = unitPos(unit);
    if (p) { p.x = x; p.y = 0; p.z = z; }
    unit.car.heading = heading || 0;
    unit.speed = 14;
    unit.car.speed = 14;
    if (unit.car.group) unit.car.group.visible = true;
    syncUnit(unit);
    return unit;
  }

  // -------------------------------------------------------------------------
  // Roadblocks: at three stars and up the law parks patrol cars across
  // the road ahead of Mara. placeRoadblock stages one by hand (the
  // screenshot poses use it); deployRoadblock drops one ~70 m ahead of
  // the player's heading during a live pursuit, at most once every 25 s.
  // Each block is three patrol cars parked side by side, nose across the
  // road, light bars flashing. They are parked units, not pursuit cars:
  // they never chase, and they clear themselves when the heat drops.
  // -------------------------------------------------------------------------
  function placeRoadblock(x, z, heading) {
    const along = heading || 0;
    // Across the road = perpendicular to the road direction.
    const px = Math.cos(along);
    const pz = -Math.sin(along);
    const acrossHeading = along + Math.PI / 2;
    const block = { cars: [], x, z };
    for (const offset of [-4.6, 0, 4.6]) {
      const unit = buildUnit();
      const p = unitPos(unit);
      if (p) { p.x = x + px * offset; p.y = 0; p.z = z + pz * offset; }
      unit.car.heading = acrossHeading;
      unit.speed = 0;
      unit.car.speed = 0;
      if (unit.car.group) unit.car.group.visible = true;
      syncUnit(unit);
      block.cars.push(unit);
    }
    police.roadblocks.push(block);
    return block;
  }

  function deployRoadblock(playerPos, playerHeading) {
    if (!playerPos) return null;
    const ahead = 70;
    const fx = Math.sin(playerHeading || 0);
    const fz = Math.cos(playerHeading || 0);
    const x = clamp(playerPos.x + fx * ahead, -200, 200);
    const z = clamp(playerPos.z + fz * ahead, -200, 200);
    police.roadblockCooldown = 25;
    return placeRoadblock(x, z, playerHeading || 0);
  }

  function clearRoadblocks() {
    for (const block of police.roadblocks) {
      for (const unit of block.cars) {
        if (unit.car && unit.car.group) unit.car.group.visible = false;
      }
    }
    police.roadblocks.length = 0;
  }

  function flashBar(unit) {
    const bar = unit && unit.lights;
    if (!bar) return;
    const on = Math.floor(police.flash) % 2 === 0;
    const lamps = [];
    if (typeof bar.traverse === 'function') {
      bar.traverse((child) => {
        if (child && child.isMesh && child.material && child.material.color) lamps.push(child);
      });
    } else if (bar.children) {
      for (const child of bar.children) {
        if (child && child.isMesh && child.material && child.material.color) lamps.push(child);
      }
    } else if (bar.material && bar.material.color) {
      lamps.push(bar);
    }
    lamps.forEach((lamp, idx) => {
      if (idx % 2 === 0) lamp.material.color.setHex(on ? 0xff2222 : 0x551111);
      else lamp.material.color.setHex(on ? 0x111155 : 0x2244ff);
    });
  }

  function update(dt, player, playerCar, inCar, colliders) {
    const events = { rammed: false, busted: false };
    police.flash += dt * 7;
    if (police.ramCooldown > 0) police.ramCooldown -= dt;
    const list = colliders || [];

    if (police.wanted <= 0) {
      police.ramming = false;
      for (const unit of police.cars) {
        if (unit.car && unit.car.group) unit.car.group.visible = false;
      }
      police.cars.length = 0;
      clearRoadblocks();
      return events;
    }

    const targetPos = (inCar && playerCar)
      ? (playerCar.pos || playerCar.position || (player && player.pos))
      : (player && player.pos);
    if (!targetPos) return events;
    trimFleet(police.wanted, targetPos);

    // Roadblocks: at three stars and up, in a car, the law seals the
    // road ahead of Mara. One live block at a time, re-deployed at most
    // every 25 s while the pursuit runs.
    if (police.roadblockCooldown > 0) police.roadblockCooldown -= dt;
    if (police.wanted >= 3 && inCar && playerCar
      && police.roadblocks.length === 0 && police.roadblockCooldown <= 0) {
      deployRoadblock(targetPos, playerCar.heading || 0);
    }
    if (police.wanted < 3) clearRoadblocks();
    for (const block of police.roadblocks) {
      for (const unit of block.cars) flashBar(unit);
    }

    const ramRun = police.wanted >= 3 && inCar;
    police.ramming = ramRun;
    const topSpeed = 24 + 2.5 * police.wanted + (ramRun ? 6 : 0);
    const turnRate = ramRun ? 2.8 : 1.9;

    let nearestDist = Infinity;
    for (const unit of police.cars) {
      const p = unitPos(unit);
      if (!p) continue;
      const d = Math.hypot(targetPos.x - p.x, targetPos.z - p.z);
      if (d < nearestDist) nearestDist = d;
    }

    for (const unit of police.cars) {
      flashBar(unit);
      const p = unitPos(unit);
      if (!p) continue;
      const hp = unit.car && unit.car.hp;
      if (typeof hp === 'number' && hp <= 0) {
        // Disabled patrol car: shot out, it stops chasing.
        unit.speed = 0;
        unit.car.speed = 0;
        continue;
      }

      const dx = targetPos.x - p.x;
      const dz = targetPos.z - p.z;
      const dist = Math.hypot(dx, dz);

      // Steer toward the target with a capped turn rate.
      // angleDiff(a, b) is the turn FROM a TO b, so the turn the car
      // needs is angleDiff(heading, wantHeading): the old order
      // (wantHeading, heading) turned the car AWAY from Mara, and the
      // cars ended up driving off to the south-east stuck in a limit
      // cycle at the +/-PI wrap instead of converging on her.
      const wantHeading = Math.atan2(dx, dz);
      const turn = clamp(angleDiff(unit.car.heading || 0, wantHeading), -turnRate * dt, turnRate * dt);
      unit.car.heading = (unit.car.heading || 0) + turn;

      // Speed profile: flat out from afar, creep when close — unless
      // this is a 3-star ram run, which holds top speed all the way in.
      let target = topSpeed;
      if (!ramRun) {
        if (dist < 14) target = Math.max(3.5, topSpeed * (dist / 30));
        else if (dist <= 90) target = topSpeed * 0.92;
      }
      // Ease the unit speed toward the target (rate ~1.4/s).
      unit.speed += (target - unit.speed) * Math.min(1, 1.4 * dt);
      unit.speed = clamp(unit.speed, 0, topSpeed + 6);
      unit.car.speed = unit.speed;

      p.x += Math.sin(unit.car.heading) * unit.speed * dt;
      p.z += Math.cos(unit.car.heading) * unit.speed * dt;
      p.x = clamp(p.x, -BOUND, BOUND);
      p.z = clamp(p.z, -BOUND, BOUND + 40);
      try { resolveCollisions(p, 2.0, list); } catch (e) { /* colliders optional */ }
      syncUnit(unit);
      spinWheels(unit.car, dt);

      // Ram: only while Mara is in a car.
      if (inCar && playerCar && dist < 4.2 && police.ramCooldown <= 0) {
        const pp = playerCar.pos || playerCar.position;
        if (pp) {
          const sx = pp.x - p.x;
          const sz = pp.z - p.z;
          playerCar.speed = (playerCar.speed || 0) * (ramRun ? 0.68 : 0.82);
          // Shove the player's car away from the patrol car: 6% of the
          // separation normally, 14% on a ram run.
          const shove = ramRun ? 0.14 : 0.06;
          pp.x += sx * shove;
          pp.z += sz * shove;
        }
        if (dist < 3.4) {
          events.rammed = true;
          police.ramCooldown = 0.8;
        }
        unit.bustTimer = 0;
      }

      // Bust: only on foot, a patrol car parked on Mara for 1.4s.
      if (!inCar) {
        if (dist < BUST_DIST) {
          unit.bustTimer += dt;
          if (unit.bustTimer >= BUST_TIME) events.busted = true;
        } else {
          unit.bustTimer = 0;
        }
      } else {
        unit.bustTimer = 0;
      }
    }

    // Cooling off: unseen for a while, then lose a star every 4s.
    if (nearestDist > UNSEEN_DIST) {
      police.unseenTimer += dt;
      if (police.unseenTimer > UNSEEN_TIME) {
        police.decayTimer += dt;
        if (police.decayTimer >= DECAY_TIME) {
          police.decayTimer = 0;
          police.wanted = Math.max(0, police.wanted - 1);
          trimFleet(police.wanted, targetPos);
          if (police.wanted <= 0) police.ramming = false;
        }
      }
    } else {
      police.unseenTimer = 0;
      police.decayTimer = 0;
    }

    return events;
  }

  return police;
}
