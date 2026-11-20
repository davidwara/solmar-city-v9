import * as THREE from 'three';
import { createRng, pick, rand } from './utils.js';

// Second island district across the bay, south of the beach (z 300-420).
// Reached on foot / by car over the narrow causeway at x near 40, or by
// boat from the marina. Home of the lighthouse Mara lights in the
// Lighthouse Keeper job.
export const ISLAND_BOUNDS = { minX: -60, maxX: 140, minZ: 300, maxZ: 420 };

export const ISLAND_DOCK_POS = { x: 40, y: 0, z: 306 };

// Alias for main.js (imports ISLAND_DOCK).
export const ISLAND_DOCK = ISLAND_DOCK_POS;

export const LIGHTHOUSE_POS = { x: 80, y: 0, z: 395 };

const ISLE_PALETTE = [0xf2e3c9, 0xe8b4a0, 0x7fb3c8, 0x9db98a, 0xe6d7b8, 0xd98a7a];

function islePalm(rng) {
  const palm = new THREE.Group();
  const height = 5 + rng() * 2.5;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.24, height, 6),
    new THREE.MeshStandardMaterial({ color: 0x8a6b46, roughness: 1 }),
  );
  trunk.position.y = height / 2;
  trunk.rotation.z = (rng() - 0.5) * 0.3;
  palm.add(trunk);
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x46a355, roughness: 0.9 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.2, 4), frondMat);
    frond.position.set(Math.cos(a) * 1.05, height + 0.3, Math.sin(a) * 1.05);
    frond.rotation.z = Math.cos(a) * 1.1;
    frond.rotation.x = -Math.sin(a) * 1.1;
    palm.add(frond);
  }
  const nut = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 }),
  );
  nut.position.y = height + 0.1;
  palm.add(nut);
  return palm;
}

function grove(scene, rng, cx, cz, count, spread) {
  for (let i = 0; i < count; i++) {
    const palm = islePalm(rng);
    palm.position.set(cx + rand(rng, -spread, spread), 0, cz + rand(rng, -spread, spread));
    scene.add(palm);
  }
}

function clusterHouses(scene, rng, colliders) {
  const spots = [
    { x: 10, z: 340 }, { x: 38, z: 332 }, { x: 66, z: 348 },
    { x: 20, z: 368 }, { x: 52, z: 372 }, { x: 96, z: 352 },
    { x: 118, z: 372 }, { x: 0, z: 396 },
  ];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xc96f5a, roughness: 0.9 });
  for (const spot of spots) {
    const w = rand(rng, 9, 14);
    const d = rand(rng, 9, 13);
    const h = rand(rng, 5, 11);
    const colour = pick(rng, ISLE_PALETTE);
    const house = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9 }),
    );
    house.position.set(spot.x + rand(rng, -2, 2), h / 2, spot.z + rand(rng, -2, 2));
    scene.add(house);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 2.6, 4), roofMat);
    roof.position.set(house.position.x, h + 1.3, house.position.z);
    roof.rotation.y = Math.PI / 4;
    scene.add(roof);
    colliders.push({
      minX: house.position.x - w / 2, maxX: house.position.x + w / 2,
      minZ: house.position.z - d / 2, maxZ: house.position.z + d / 2,
    });
  }
  // One taller island inn so the cluster reads from the mainland.
  const inn = new THREE.Mesh(
    new THREE.BoxGeometry(16, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xf0c98a, roughness: 0.85 }),
  );
  inn.position.set(40, 10, 355);
  scene.add(inn);
  const innRoof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.8, 13), roofMat);
  innRoof.position.set(40, 20.4, 355);
  scene.add(innRoof);
  colliders.push({ minX: 32, maxX: 48, minZ: 348, maxZ: 362 });
}

function buildLighthouse(scene) {
  const group = new THREE.Group();
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.8 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 18, 12), towerMat);
  tower.position.y = 9;
  group.add(tower);
  for (const y of [5, 11]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.85, 2.2, 12), bandMat);
    band.position.y = y;
    group.add(band);
  }
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff2b0, emissive: 0xffe27a, emissiveIntensity: 0.25, roughness: 0.3,
  });
  const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 2.4, 10), lampMat);
  lampRoom.position.y = 19;
  group.add(lampRoom);
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 1.8, 10),
    new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7 }),
  );
  cap.position.y = 21.1;
  group.add(cap);
  // Rotating beam: a long translucent cone, hidden until lit at night.
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff6c0, transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(3.2, 34, 12, 1, true), beamMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.x = 17;
  const beamPivot = new THREE.Group();
  beamPivot.position.y = 19;
  beamPivot.add(beam);
  group.add(beamPivot);
  const spot = new THREE.SpotLight(0xfff2b0, 0, 120, 0.32, 0.5, 1);
  spot.position.set(0, 19, 0);
  beamPivot.add(spot);
  group.position.set(LIGHTHOUSE_POS.x, 0, LIGHTHOUSE_POS.z);
  scene.add(group);
  return { group, beamPivot, beam, spot, lampMat };
}

function buildJetty(scene, colliders) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a7b52, roughness: 1 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 30), wood);
  deck.position.set(ISLAND_DOCK_POS.x, 0.6, ISLAND_DOCK_POS.z - 12);
  scene.add(deck);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6b5233, roughness: 1 });
  for (let i = 0; i < 4; i++) {
    for (const x of [ISLAND_DOCK_POS.x - 3.5, ISLAND_DOCK_POS.x + 3.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.2, 8), postMat);
      post.position.set(x, 1.1, 282 + i * 8);
      scene.add(post);
    }
  }
  colliders.push({ minX: 36, maxX: 44, minZ: 279, maxZ: 309 });
}

export function buildIsland(scene, seed = 1) {
  const rng = createRng(seed + 101);
  const colliders = [];
  const b = ISLAND_BOUNDS;
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(b.maxX - b.minX + 40, b.maxZ - b.minZ + 24),
    new THREE.MeshStandardMaterial({ color: 0xe8d29a, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set((b.minX + b.maxX) / 2, 0.04, (b.minZ + b.maxZ) / 2);
  scene.add(sand);
  const green = new THREE.Mesh(
    new THREE.PlaneGeometry(b.maxX - b.minX - 24, b.maxZ - b.minZ - 30),
    new THREE.MeshStandardMaterial({ color: 0x6fae62, roughness: 1 }),
  );
  green.rotation.x = -Math.PI / 2;
  green.position.set(40, 0.07, 360);
  scene.add(green);
  // Causeway deck from the beach (z 247) to the island north shore.
  const causeway = new THREE.Mesh(
    new THREE.BoxGeometry(11, 0.8, 58),
    new THREE.MeshStandardMaterial({ color: 0x9a938a, roughness: 0.9 }),
  );
  causeway.position.set(40, 0.4, 276);
  scene.add(causeway);
  const railMat = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.6, metalness: 0.5 });
  for (const x of [34.2, 45.8]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 58), railMat);
    rail.position.set(x, 1.2, 276);
    scene.add(rail);
  }
  clusterHouses(scene, rng, colliders);
  grove(scene, rng, -28, 330, 9, 16);
  grove(scene, rng, 108, 330, 8, 14);
  grove(scene, rng, 8, 405, 7, 12);
  grove(scene, rng, 122, 402, 6, 10);
  // Beach palms along the island's south shore.
  for (let x = -40; x <= 120; x += 24) {
    const palm = islePalm(rng);
    palm.position.set(x + rand(rng, -4, 4), 0, 412 + rand(rng, -3, 2));
    scene.add(palm);
  }
  buildJetty(scene, colliders);
  const light = buildLighthouse(scene);
  light.beam.visible = false;
  light.spot.intensity = 0;
  colliders.push({
    minX: LIGHTHOUSE_POS.x - 3.2, maxX: LIGHTHOUSE_POS.x + 3.2,
    minZ: LIGHTHOUSE_POS.z - 3.2, maxZ: LIGHTHOUSE_POS.z + 3.2,
  });
  // A couple of island street lamps along the main drag.
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffe9a8, emissive: 0xffc46b, emissiveIntensity: 0.3, roughness: 0.4,
  });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.6 });
  for (const z of [330, 355, 380]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.5, 6), poleMat);
    pole.position.set(58, 2.75, z);
    scene.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), lampMat);
    bulb.position.set(58, 5.6, z);
    scene.add(bulb);
  }
  const island = {
    colliders,
    bounds: ISLAND_BOUNDS,
    centre: { x: 40, y: 0, z: 360 },
    dockPos: ISLAND_DOCK_POS,
    lighthousePos: LIGHTHOUSE_POS,
    lit: false,
    beamAngle: 0,
    contains(x, z) {
      return x >= ISLAND_BOUNDS.minX && x <= ISLAND_BOUNDS.maxX
        && z >= ISLAND_BOUNDS.minZ && z <= ISLAND_BOUNDS.maxZ;
    },
    lightOn() {
      island.lit = true;
      light.lampMat.emissiveIntensity = 2.4;
      light.beam.visible = true;
      light.spot.intensity = 60;
    },
    update(hour) {
      const night = hour >= 18.5 || hour < 5.5;
      const on = island.lit && night;
      if (on) {
        island.beamAngle += 0.016;
        light.beamPivot.rotation.y = island.beamAngle;
      }
      light.beam.visible = on;
      light.spot.intensity = on ? 60 : 0;
      light.lampMat.emissiveIntensity = island.lit ? (night ? 2.4 : 0.8) : 0.25;
      lampMat.emissiveIntensity = night ? 2.0 : 0.3;
      return on;
    },
  };
  return island;
}
