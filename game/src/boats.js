// boats.js — drivable boats on the bay. Four boats moored at the
// marina docks. E boards / disembarks near a boat; throttle + rudder
// steer on the water, and boats can never leave the sea area — they
// are clamped to the bay and the shore. Boats bob on the waves and
// leave a wake particle trail while moving.

import * as THREE from 'three';

// Sea area: the bay south of the beach, plus the water around the
// second island. Boats stay inside this box.
export const SEA_BOUNDS = { minX: -235, maxX: 235, minZ: 252, maxZ: 430 };
export const MARINA_POS = { x: -150, y: 0, z: 225 };

const BOAT_SPOTS = [
  { x: -168, z: 262 },
  { x: -156, z: 270 },
  { x: -144, z: 262 },
  { x: -132, z: 270 },
];
const BOAT_NAMES = ['Gull Runner', 'Salt Spray', 'Bay Drifter', 'Golden Wake'];
const BOAT_COLOURS = [0xf2f2f2, 0x7fb3c8, 0xe8b4a0, 0xf0c98a];

function makeWakePool(scene, count) {
  const geo = new THREE.SphereGeometry(0.35, 6, 5);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xdff2fa, transparent: true, opacity: 0.55,
  });
  const pool = [];
  for (let i = 0; i < count; i++) {
    const puff = new THREE.Mesh(geo, mat.clone());
    puff.visible = false;
    if (scene) scene.add(puff);
    pool.push({ mesh: puff, life: 0 });
  }
  return pool;
}

function buildBoatModel(scene, index, spot) {
  const group = new THREE.Group();
  const hullColour = BOAT_COLOURS[index % BOAT_COLOURS.length];
  const hullMat = new THREE.MeshStandardMaterial({ color: hullColour, roughness: 0.45 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x2e4a5a, roughness: 0.5 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x9a7b52, roughness: 0.85 });

  // Hull: a tapered box with a raised bow block.
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 7.2), hullMat);
  hull.position.y = 0.55;
  group.add(hull);
  const bow = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.6), hullMat);
  bow.position.set(0, 0.7, -3.8);
  bow.rotation.x = -0.18;
  group.add(bow);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.18, 7.25), trimMat);
  stripe.position.y = 0.95;
  group.add(stripe);

  // Cabin on the first two boats, open cockpit on the others.
  if (index < 2) {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 2.4), trimMat);
    cabin.position.set(0, 1.6, 0.6);
    group.add(cabin);
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x9fd4e8, roughness: 0.15, metalness: 0.4,
    });
    const windows = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.5, 1.6), windowMat);
    windows.position.set(0, 1.75, 0.6);
    group.add(windows);
    // Mast with a small sail furled on top.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.2, 6), woodMat);
    mast.position.set(0, 4.4, -0.8);
    group.add(mast);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 1.1),
      new THREE.MeshStandardMaterial({ color: 0xf2e3c9, roughness: 0.9 }));
    sail.position.set(0, 4.6, -0.8);
    group.add(sail);
  } else {
    // Outboard motor + open cockpit bench.
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.5), trimMat);
    motor.position.set(0, 0.8, 3.8);
    group.add(motor);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.25, 0.8), woodMat);
    bench.position.set(0, 1.05, 0.4);
    group.add(bench);
    const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.5), trimMat);
    consoleBox.position.set(0, 1.4, -1.2);
    group.add(consoleBox);
  }

  group.position.set(spot.x, 0, spot.z);
  group.rotation.y = (index % 2 === 0 ? 0.12 : -0.1) + (index * 0.03);
  if (scene) scene.add(group);
  return group;
}

export function createBoats(scene) {
  const wakePool = makeWakePool(scene, 48);
  let wakeCursor = 0;

  const boats = BOAT_SPOTS.map((spot, i) => {
    const group = buildBoatModel(scene, i, spot);
    return {
      name: BOAT_NAMES[i],
      group,
      position: group.position,
      heading: group.rotation.y,
      speed: 0,
      throttle: 0,
      moored: true,
      homeX: spot.x,
      homeZ: spot.z,
      bobPhase: i * 1.7,
      wakeAcc: 0,
    };
  });

  function spawnWake(boat) {
    const slot = wakePool[wakeCursor];
    wakeCursor = (wakeCursor + 1) % wakePool.length;
    // The bow points along local -z, so forward motion is
    // (-sin heading, -cos heading); the stern (wake) is +z local.
    const back = boat.heading;
    slot.mesh.position.set(
      boat.position.x + Math.sin(back) * 3.4 + (Math.random() - 0.5) * 1.2,
      0.15,
      boat.position.z + Math.cos(back) * 3.4 + (Math.random() - 0.5) * 1.2,
    );
    slot.mesh.scale.setScalar(0.6 + Math.random() * 0.7);
    slot.mesh.visible = true;
    slot.life = 1.4;
  }

  function stepWake(dt) {
    for (const slot of wakePool) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.mesh.visible = false;
        continue;
      }
      slot.mesh.scale.multiplyScalar(1 + dt * 0.8);
      slot.mesh.material.opacity = 0.55 * (slot.life / 1.4);
    }
  }

  const system = {
    boats,
    wakePool,

    nearestBoat(pos, maxDist) {
      if (!pos) return null;
      const limit = typeof maxDist === 'number' ? maxDist : 6;
      let best = null;
      let bestD = limit * limit;
      for (const boat of boats) {
        const dx = boat.position.x - pos.x;
        const dz = boat.position.z - pos.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = boat;
        }
      }
      return best;
    },

    nearest(pos, maxDist) {
      return system.nearestBoat(pos, maxDist);
    },

    boatSpeed(boat) {
      if (!boat) return 0;
      return Math.abs(boat.speed || 0);
    },

    // Nearest dry point for stepping ashore: the beach at z = 246,
    // just north of the water line, clamped to the playable bound.
    nearestShorePoint(pos) {
      if (!pos) return { x: 0, y: 0, z: 246 };
      const x = Math.max(-230, Math.min(230, pos.x));
      return { x, y: 0, z: 246 };
    },

    shorePoint(pos) {
      return system.nearestShorePoint(pos);
    },

    update(dt, input, driven, audio) {
      const step = Math.min(dt || 0.016, 0.05);
      const keys = input || {};
      const forward = !!(keys.forward || keys.up || keys.w || keys.throttle);
      const back = !!(keys.back || keys.down || keys.s || keys.reverse);
      const left = !!(keys.left || keys.a || keys.port);
      const right = !!(keys.right || keys.d || keys.starboard);
      const now = performance.now() / 1000;

      for (const boat of boats) {
        boat.bobPhase += step * 1.4;
        const isDriven = driven === boat;
        if (isDriven) {
          // Throttle: accelerate forward, reverse slowly.
          if (forward) boat.throttle = Math.min(1, boat.throttle + step * 0.7);
          else if (back) boat.throttle = Math.max(-0.35, boat.throttle - step * 0.7);
          else boat.throttle *= Math.max(0, 1 - step * 0.9);
          const targetSpeed = boat.throttle * 22;
          boat.speed += (targetSpeed - boat.speed) * Math.min(1, step * 1.6);
          // Rudder: steering scales with speed, weaker in reverse.
          const steer = (left ? 1 : 0) - (right ? 1 : 0);
          const steerRate = 0.9 * Math.min(1, Math.abs(boat.speed) / 8);
          boat.heading += steer * steerRate * step * (boat.speed < 0 ? -1 : 1);
          boat.moored = false;
        } else {
          // Idle: ease to a stop and drift back toward the mooring.
          boat.throttle *= Math.max(0, 1 - step * 1.2);
          boat.speed *= Math.max(0, 1 - step * 1.5);
        }

        // Move along the heading (bow points along local -z).
        boat.position.x += -Math.sin(boat.heading) * boat.speed * step;
        boat.position.z += -Math.cos(boat.heading) * boat.speed * step;
        if (boat.position.x < SEA_BOUNDS.minX) {
          boat.position.x = SEA_BOUNDS.minX;
          boat.speed *= 0.4;
        } else if (boat.position.x > SEA_BOUNDS.maxX) {
          boat.position.x = SEA_BOUNDS.maxX;
          boat.speed *= 0.4;
        }
        if (boat.position.z < SEA_BOUNDS.minZ) {
          boat.position.z = SEA_BOUNDS.minZ;
          boat.speed *= 0.4;
        } else if (boat.position.z > SEA_BOUNDS.maxZ) {
          boat.position.z = SEA_BOUNDS.maxZ;
          boat.speed *= 0.4;
        }

        // Bob on the waves: gentle pitch and roll plus vertical lift.
        const wave = Math.sin(now * 1.1 + boat.bobPhase) * 0.14;
        boat.position.y = 0.1 + wave;
        boat.group.rotation.y = boat.heading;
        boat.group.rotation.z = Math.sin(now * 0.9 + boat.bobPhase) * 0.045;
        boat.group.rotation.x = Math.cos(now * 0.7 + boat.bobPhase * 1.3) * 0.03;

        // Wake trail while moving.
        if (Math.abs(boat.speed) > 3) {
          boat.wakeAcc += step;
          if (boat.wakeAcc > 0.09) {
            boat.wakeAcc = 0;
            spawnWake(boat);
          }
        }
      }

      stepWake(step);
      if (audio && typeof audio.setBoatEngine === 'function') {
        const drivenSpeed = driven ? Math.abs(driven.speed || 0) / 22 : 0;
        audio.setBoatEngine(driven ? Math.max(0, Math.min(1, drivenSpeed)) : 0);
      }
      return driven || null;
    },
  };
  return system;
}
