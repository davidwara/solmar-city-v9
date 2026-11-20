// vehicles.js — procedural cars, arcade driving, parked cars.
// Every car is built from boxes and cylinders: no model files, no
// network, just a body, a cabin, four wheels and lights. Colours vary
// so traffic and parked rows never look cloned.
import * as THREE from 'three';
import { createRng, rand, randInt, pick } from './utils.js';
import { resolveCollisions } from './player.js';

const STREETS = [-186, -124, -62, 0, 62, 124, 186];
const BODY_COLORS = [
  0xc0392b, 0x2471a3, 0x1e8449, 0xd4ac0d, 0x7d3c98, 0xe67e22,
  0x2c3e50, 0xbdc3c7, 0x922b21, 0x148f77, 0x6c3483, 0xa93226,
];
const CABIN_COLOR = 0x1a2733;
const TYRE = 0x14161a;
const HUB = 0x9aa0a6;

// Every car ever built, so nearestCar can search without a list.
const registry = [];

// Build one car. Signature is flexible: createCar(scene, x, z, colour)
// or createCar(scene, {x, z, color, heading}).
export function createCar(scene, x, z, colorIndex) {
  let opts = {};
  if (typeof x === 'object' && x !== null) opts = x;
  else opts = { x: x || 0, z: z || 0, colorIndex: colorIndex || 0 };

  const px = opts.x || 0;
  const pz = opts.z || 0;
  const paint = opts.color !== undefined
    ? opts.color
    : BODY_COLORS[(opts.colorIndex || 0) % BODY_COLORS.length];
  const bodyMat = new THREE.MeshStandardMaterial({ color: paint, metalness: 0.35, roughness: 0.45 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: CABIN_COLOR, metalness: 0.2, roughness: 0.25 });

  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.3), bodyMat);
  body.position.y = 0.62;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.55, 2.1), cabinMat);
  cabin.position.set(0, 1.18, -0.25);
  group.add(cabin);

  const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.22, 4.34), new THREE.MeshStandardMaterial({ color: 0x22252a }));
  skirt.position.y = 0.32;
  group.add(skirt);

  // Headlights (front, +z) and tail lights (rear, -z).
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffedb0, emissiveIntensity: 0.7 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, emissive: 0x7b1a12, emissiveIntensity: 0.8 });
  for (const side of [-0.62, 0.62]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lampMat);
    head.position.set(side, 0.72, 2.16);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), tailMat);
    tail.position.set(side, 0.72, -2.16);
    group.add(tail);
  }

  // Four wheels: dark tyre + pale hub, spun by the driving update.
  const wheels = [];
  const tyreGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14);
  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.3, 10);
  for (const [wx, wz] of [[-0.92, 1.4], [0.92, 1.4], [-0.92, -1.4], [0.92, -1.4]]) {
    const wheel = new THREE.Group();
    const tyre = new THREE.Mesh(tyreGeo, new THREE.MeshStandardMaterial({ color: TYRE, roughness: 0.9 }));
    tyre.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(hubGeo, new THREE.MeshStandardMaterial({ color: HUB, metalness: 0.6, roughness: 0.35 }));
    hub.rotation.z = Math.PI / 2;
    wheel.add(tyre);
    wheel.add(hub);
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }

  const pos = new THREE.Vector3(px, 0, pz);
  group.position.copy(pos);
  group.rotation.y = opts.heading || 0;
  if (scene) scene.add(group);

  const car = {
    pos,
    position: pos,
    heading: opts.heading || 0,
    group,
    mesh: group,
    speed: 0,
    wheels,
    hp: 3,
    maxHp: 3,
    topSpeed: 26,
    color: paint,
    steer: 0,
    parked: false,
  };
  registry.push(car);
  return car;
}

// Scatter parked cars along the roadsides. Same seed, same rows.
export function spawnParkedCars(scene, seed) {
  const rng = createRng(seed === undefined ? 1 : seed);
  const parked = [];
  const count = 16;
  for (let i = 0; i < count; i++) {
    const street = pick(rng, STREETS);
    const along = rand(rng, -180, 180);
    const ns = rng() < 0.5;
    const side = rng() < 0.5 ? -1 : 1;
    const x = ns ? street + side * 10.2 : along;
    const z = ns ? along : street + side * 10.2;
    const heading = ns ? (side > 0 ? Math.PI : 0) + rand(rng, -0.05, 0.05) : (side > 0 ? Math.PI / 2 : -Math.PI / 2) + rand(rng, -0.05, 0.05);
    const car = createCar(scene, x, z, randInt(rng, 0, BODY_COLORS.length - 1));
    car.heading = heading;
    car.group.rotation.y = heading;
    car.parked = true;
    parked.push(car);
  }
  return parked;
}

// Find the closest car to a position within maxDist. Pass a list to
// search only that list; otherwise search every car built so far.
export function nearestCar(pos, maxDist, list) {
  const pool = list || registry;
  const px = pos.x !== undefined ? pos.x : pos[0];
  const pz = pos.z !== undefined ? pos.z : pos[2];
  let best = null;
  let bestD = maxDist === undefined ? 6 : maxDist;
  for (let i = 0; i < pool.length; i++) {
    const c = pool[i];
    if (!c || !c.pos) continue;
    const dx = c.pos.x - px;
    const dz = c.pos.z - pz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// Bolt a red/blue light bar onto a car's roof — the police module uses
// this to turn an ordinary car into a patrol car.
export function addLightBar(car) {
  if (!car || !car.group) return null;
  if (car.lightBar) return car.lightBar;
  const bar = new THREE.Group();
  const red = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.16, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xd21f1f, emissive: 0x8a0000, emissiveIntensity: 0.9 })
  );
  red.position.x = -0.32;
  const blue = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.16, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1f5fd2, emissive: 0x001e8a, emissiveIntensity: 0.9 })
  );
  blue.position.x = 0.32;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.08, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x111214 })
  );
  bar.add(base, red, blue);
  bar.position.set(0, 1.55, -0.25);
  bar.userData.red = red;
  bar.userData.blue = blue;
  car.group.add(bar);
  car.lightBar = bar;
  return bar;
}

// Arcade driving: W/S accelerate and brake/reverse, A/D steer — the
// steering bite grows with speed but never snaps at a standstill.
// grip is the road-grip factor (1 dry, lower when wet).
export function updateDriving(car, dt, input, colliders, bound, grip) {
  if (!car) return car;
  const k = input || {};
  const fwd = !!(k.forward || k.w || k.up);
  const back = !!(k.back || k.s || k.down);
  const left = !!(k.left || k.a);
  const right = !!(k.right || k.d);
  const handbrake = !!(k.handbrake || k.space);
  const g = grip === undefined || grip === null ? 1 : grip;

  const accel = 15 * g;
  const brake = 26;
  const reverseTop = 9;
  const top = (car.topSpeed || 26) * (0.75 + 0.25 * g);

  if (fwd) car.speed += accel * dt;
  if (back) {
    if (car.speed > 0.5) car.speed -= brake * dt;
    else car.speed -= accel * 0.55 * dt;
  }
  if (!fwd && !back) {
    // Coast down with rolling drag.
    car.speed -= car.speed * 1.4 * dt;
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
  }
  if (handbrake) car.speed -= car.speed * 4 * dt;
  car.speed = Math.max(-reverseTop, Math.min(top, car.speed));

  // Steering scales with speed: no turn parked, full bite at cruise.
  const speedFactor = Math.min(1, Math.abs(car.speed) / 9);
  const steerDir = (left ? 1 : 0) - (right ? 1 : 0);
  const turnRate = 1.9 * speedFactor * g;
  car.heading += steerDir * turnRate * dt * (car.speed >= 0 ? 1 : -1);
  car.steer = steerDir * speedFactor;

  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  car.pos.x += fx * car.speed * dt;
  car.pos.z += fz * car.speed * dt;

  const limit = bound !== undefined && bound !== null ? bound : 235;
  car.pos.x = Math.max(-limit, Math.min(limit, car.pos.x));
  car.pos.z = Math.max(-limit, Math.min(limit, car.pos.z));
  // A hard hit against a building scrubs speed off — without this the
  // car would grind along the wall at full throttle forever.
  const beforeX = car.pos.x;
  const beforeZ = car.pos.z;
  resolveCollisions(car.pos, 1.6, colliders);
  const shoved = Math.hypot(car.pos.x - beforeX, car.pos.z - beforeZ);
  if (shoved > 0.01 && Math.abs(car.speed) > 2) car.speed *= 0.55;

  car.group.position.copy(car.pos);
  car.group.rotation.y = car.heading;
  // Spin the wheels and lean the front pair into the turn.
  const spin = (car.speed * dt) / 0.36;
  for (let i = 0; i < car.wheels.length; i++) {
    const w = car.wheels[i];
    w.rotation.x += spin;
    if (i < 2) w.rotation.y = steerDir * 0.32 * speedFactor;
  }
  return car;
}

// Short aliases for the driving updater and the nearest-car search.
export const updateCar = updateDriving;
export const findNearestCar = nearestCar;
