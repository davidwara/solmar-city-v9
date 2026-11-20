import * as THREE from 'three';
import { createRng, chance, pick, rand, randInt } from './utils.js';

// Solmar City — procedural coastal city. Everything here is generated
// from a seed so the same seed always rebuilds the same streets,
// towers, palms and marina. Coordinates: x east, z south, y up.
export const CITY = {
  pitch: 62,
  roadHalf: 7,
  streets: [-186, -124, -62, 0, 62, 124, 186],
  beachZ: 210,
  seaZ: 250,
  bound: 235,
};

export const CASINO_POS = { x: 155, z: 155 };

const PALETTE = [
  0xf2e3c9, 0xe8b4a0, 0xd9a441, 0x7fb3c8, 0xc96f5a, 0x9db98a,
  0xe6d7b8, 0xb7c9d9, 0xf0c98a, 0xd98a7a, 0x8aa8b8, 0xe9e2d0,
];

const LANDMARKS = {
  downtown: { x: 0, y: 0, z: 0 },
  beach: { x: 0, y: 0, z: 235 },
  marina: { x: -150, y: 0, z: 225 },
  docks: { x: 150, y: 0, z: 186 },
  safehouse: { x: 124, y: 0, z: 200 },
  drop: { x: 62, y: 0, z: -62 },
};

const SKY_DAY = new THREE.Color(0x87bfe8);
const SKY_DUSK = new THREE.Color(0xff9a52);
const FOG_DAY = new THREE.Color(0x9fc6e8);
const FOG_DUSK = new THREE.Color(0xe8906a);

function flatPlane(w, d, colour, x, y, z, mat) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    mat || new THREE.MeshStandardMaterial({ color: colour, roughness: 0.95 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

function windowTexture(baseColour, floors, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const hex = '#' + baseColour.toString(16).padStart(6, '0');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 128, 256);
  const shade = ctx.createLinearGradient(0, 0, 0, 256);
  shade.addColorStop(0, 'rgba(255,255,255,0.18)');
  shade.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 128, 256);
  const rows = Math.max(3, Math.min(18, floors));
  const cellW = 128 / 5;
  const cellH = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 5; c++) {
      const lit = rng() < 0.28;
      ctx.fillStyle = lit ? '#ffe9a8' : '#2c3e50';
      ctx.fillRect(c * cellW + 4, r * cellH + 5, cellW - 8, cellH - 10);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildPalm(rng) {
  const palm = new THREE.Group();
  const height = 5 + rng() * 3;
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6b46, roughness: 1 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, height, 6), trunkMat);
  trunk.position.y = height / 2;
  trunk.rotation.z = (rng() - 0.5) * 0.24;
  palm.add(trunk);
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x3f9e4d, roughness: 0.9 });
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.4, 4), frondMat);
    frond.position.set(Math.cos(angle) * 1.1, height + 0.4, Math.sin(angle) * 1.1);
    frond.rotation.z = Math.cos(angle) * 1.05;
    frond.rotation.x = -Math.sin(angle) * 1.05;
    palm.add(frond);
  }
  const nut = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 }),
  );
  nut.position.y = height + 0.2;
  palm.add(nut);
  return palm;
}

function layRoads(scene, roadMat) {
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.8 });
  for (const c of CITY.streets) {
    const ns = flatPlane(14, 470, 0x3a3f46, c, 0.08, -10, roadMat);
    scene.add(ns);
    const ew = flatPlane(470, 14, 0x3a3f46, 0, 0.08, c, roadMat);
    scene.add(ew);
    const nsLine = flatPlane(0.5, 470, 0xf2c14e, c, 0.1, -10, lineMat);
    scene.add(nsLine);
    const ewLine = flatPlane(470, 0.5, 0xf2c14e, 0, 0.1, c, lineMat);
    scene.add(ewLine);
  }
}

function layBuildings(scene, rng, colliders) {
  const cache = new Map();
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.9 });
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2020, emissiveIntensity: 1.4 });
  const mids = [];
  for (let i = 0; i < CITY.streets.length - 1; i++) {
    mids.push((CITY.streets[i] + CITY.streets[i + 1]) / 2);
  }
  for (const bx of mids) {
    for (const bz of mids) {
      if (Math.abs(bx - 155) < 1 && Math.abs(bz - 155) < 1) continue;
      if (Math.abs(bx - 93) < 1 && Math.abs(bz + 93) < 1) continue;
      const downtown = Math.abs(bx) <= 95 && Math.abs(bz) <= 95;
      const count = downtown ? randInt(rng, 1, 2) : randInt(rng, 2, 4);
      for (let k = 0; k < count; k++) {
        const w = downtown ? rand(rng, 18, 26) : rand(rng, 10, 18);
        const d = downtown ? rand(rng, 18, 26) : rand(rng, 10, 16);
        const h = downtown ? rand(rng, 30, 78) : rand(rng, 6, 22);
        const floors = Math.max(2, Math.round(h / 4));
        const colour = pick(rng, PALETTE);
        const jx = bx + rand(rng, -4, 4) + (count > 1 ? (k % 2 === 0 ? -11 : 11) : 0);
        const jz = bz + rand(rng, -4, 4) + (count > 2 ? (k < 2 ? -11 : 11) : 0);
        const key = colour + ':' + floors;
        let mat = cache.get(key);
        if (!mat) {
          mat = new THREE.MeshStandardMaterial({
            map: windowTexture(colour, floors, rng),
            roughness: 0.85,
          });
          cache.set(key, mat);
        }
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        tower.position.set(jx, h / 2, jz);
        scene.add(tower);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.8, d * 0.92), roofMat);
        roof.position.set(jx, h + 0.4, jz);
        scene.add(roof);
        if (downtown && h > 60) {
          const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), beaconMat);
          beacon.position.set(jx, h + 1.6, jz);
          scene.add(beacon);
        }
        colliders.push({ minX: jx - w / 2, maxX: jx + w / 2, minZ: jz - d / 2, maxZ: jz + d / 2 });
      }
    }
  }
}

function layPalmsAndLamps(scene, rng, lampMat) {
  for (let x = -220; x <= 220; x += 22) {
    const palm = buildPalm(rng);
    palm.position.set(x + rand(rng, -4, 4), 0, 208 + rand(rng, -3, 3));
    scene.add(palm);
  }
  for (const street of CITY.streets) {
    for (const end of [-186, 186]) {
      if (chance(rng, 0.6)) {
        const palm = buildPalm(rng);
        palm.position.set(street + 10, 0, end + 10);
        scene.add(palm);
      }
    }
  }
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.6, metalness: 0.4 });
  for (const avenue of [-124, 0, 124]) {
    for (let z = -180; z <= 180; z += 62) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6), poleMat);
      pole.position.set(avenue + 8.5, 3, z);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), lampMat);
      bulb.position.set(avenue + 8.5, 6.2, z);
      scene.add(bulb);
    }
  }
}

function layMarina(scene, rng, colliders) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a7b52, roughness: 1 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 42), wood);
  pier.position.set(-150, 0.6, 232);
  scene.add(pier);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6b5233, roughness: 1 });
  for (let i = 0; i < 5; i++) {
    const z = 214 + i * 9;
    for (const x of [-154.5, -145.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 8), postMat);
      post.position.set(x, 1.2, z);
      scene.add(post);
    }
  }
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.5 });
  for (let i = 0; i < 4; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 8), hullMat);
    hull.position.y = 0.6;
    boat.add(hull);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }),
    );
    mast.position.y = 3.6;
    boat.add(mast);
    boat.position.set(-168 + i * 12, 0, 262 + (i % 2) * 8);
    boat.rotation.y = (rng() - 0.5) * 0.3;
    scene.add(boat);
  }
  colliders.push({ minX: -155, maxX: -145, minZ: 211, maxZ: 253 });
}

function layBeachDressing(scene, rng) {
  // Lifeguard tower at the middle of the beach plus a scatter of
  // umbrellas, so the sand reads as a beach and not an empty strip.
  const white = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.8 });
  const tower = new THREE.Group();
  for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 6), white);
    leg.position.set(lx, 1.7, lz);
    tower.add(leg);
  }
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.2), white);
  cabin.position.y = 4.2;
  tower.add(cabin);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 1.2, 4),
    new THREE.MeshStandardMaterial({ color: 0xd94f3d, roughness: 0.8 }),
  );
  roof.position.y = 5.6;
  roof.rotation.y = Math.PI / 4;
  tower.add(roof);
  tower.position.set(-30, 0, 222);
  scene.add(tower);
  const umbrellaCols = [0xe85d3d, 0x2e7fb8, 0xf2c14e, 0x3f9e4d];
  for (let i = 0; i < 6; i++) {
    const ux = -180 + i * 68 + rand(rng, -8, 8);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6),
      new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.9 }),
    );
    pole.position.set(ux, 1.2, 220 + rand(rng, -3, 3));
    scene.add(pole);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(1.9, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: umbrellaCols[i % umbrellaCols.length], roughness: 0.9 }),
    );
    shade.position.set(ux, 2.7, pole.position.z);
    scene.add(shade);
  }
}

function layCasino(scene, colliders) {
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(22, 12, 22),
    new THREE.MeshStandardMaterial({ color: 0x3a2b4a, roughness: 0.7 }),
  );
  body.position.set(CASINO_POS.x, 6, CASINO_POS.z);
  scene.add(body);
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(23, 1.6, 23),
    new THREE.MeshBasicMaterial({ color: 0xffd23f }),
  );
  trim.position.set(CASINO_POS.x, 11.4, CASINO_POS.z);
  scene.add(trim);
  // A lit CASINO sign on the two street-facing sides, so the building
  // reads as a casino from the plaza instead of a dark box.
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#2a1a3a';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 6;
  g.strokeRect(6, 6, 500, 116);
  g.fillStyle = '#ffd23f';
  g.font = 'bold 64px Verdana';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('★ CASINO ★', 256, 66);
  const signTex = new THREE.CanvasTexture(canvas);
  const signMat = new THREE.MeshBasicMaterial({ map: signTex });
  const signGeo = new THREE.PlaneGeometry(12, 3);
  const signWest = new THREE.Mesh(signGeo, signMat);
  signWest.position.set(CASINO_POS.x - 11.1, 8, CASINO_POS.z);
  signWest.rotation.y = -Math.PI / 2;
  scene.add(signWest);
  const signNorth = new THREE.Mesh(signGeo, signMat);
  signNorth.position.set(CASINO_POS.x, 8, CASINO_POS.z - 11.1);
  signNorth.rotation.y = Math.PI;
  scene.add(signNorth);
  colliders.push({
    minX: CASINO_POS.x - 11, maxX: CASINO_POS.x + 11,
    minZ: CASINO_POS.z - 11, maxZ: CASINO_POS.z + 11,
  });
}

export function buildCity(scene, seed = 1) {
  const rng = createRng(seed);
  const colliders = [];
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6b0, 2.1);
  sun.position.set(120, 180, 60);
  sun.target.position.set(0, 0, 40);
  scene.add(sun);
  scene.add(sun.target);
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc6e8, 260, 700);
  scene.add(flatPlane(560, 560, 0xb8b0a0, 0, 0, 10));
  scene.add(flatPlane(560, 46, 0xe8d29a, 0, 0.05, 233));
  scene.add(flatPlane(560, 220, 0x2e7fb8, 0, 0.02, 366));
  scene.add(flatPlane(560, 4, 0x9fd4e8, 0, 0.06, 254));
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.9 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffe9a8, emissive: 0xffc46b, emissiveIntensity: 0.35, roughness: 0.4,
  });
  layRoads(scene, roadMat);
  layBuildings(scene, rng, colliders);
  layPalmsAndLamps(scene, rng, lampMat);
  layBeachDressing(scene, rng);
  layMarina(scene, rng, colliders);
  layCasino(scene, colliders);
  const city = {
    colliders, landmarks: LANDMARKS, sun, hemi, lampMat, roadMat,
    streets: CITY.streets, pitch: CITY.pitch, roadHalf: CITY.roadHalf,
    beachZ: CITY.beachZ, seaZ: CITY.seaZ, bound: CITY.bound, seed,
  };
  return city;
}

export function setTimeOfDay(scene, city, t) {
  const tt = Math.max(0, Math.min(1, t || 0));
  const sky = SKY_DAY.clone().lerp(SKY_DUSK, tt);
  const fog = FOG_DAY.clone().lerp(FOG_DUSK, tt);
  if (scene.background && scene.background.isColor) scene.background.copy(sky);
  else scene.background = sky;
  if (scene.fog) scene.fog.color.copy(fog);
  const angle = Math.PI * (0.28 + 0.22 * tt);
  city.sun.position.set(Math.cos(angle) * 200, Math.sin(angle) * 200, 60 + 120 * tt);
  city.sun.target.position.set(0, 0, 40 + 60 * tt);
  city.sun.color.setHex(tt > 0.6 ? 0xffb36b : 0xffe6b0);
  city.sun.intensity = 2.1 - 0.7 * tt;
  city.hemi.intensity = 0.95 - 0.35 * tt;
}

export function isOnCauseway(x, z) {
  return Math.abs(x - 40) <= 5.5 && z >= 247 && z <= 305;
}

function pickStreet(rng) {
  return CITY.streets[Math.floor(rng() * CITY.streets.length)];
}

export function randomRoadPoint(rng) {
  const street = pickStreet(rng);
  const along = -180 + rng() * 360;
  const dir = rng() < 0.5 ? -1 : 1;
  if (rng() < 0.5) return { x: street, z: along, axis: 'ns', dir };
  return { x: along, z: street, axis: 'ew', dir };
}

export function randomSidewalkPoint(rng) {
  const street = pickStreet(rng);
  const along = -185 + rng() * 370;
  const side = rng() < 0.5 ? -10.5 : 10.5;
  if (rng() < 0.5) return { x: street + side, z: along, axis: 'ns', dir: rng() < 0.5 ? -1 : 1 };
  return { x: along, z: street + side, axis: 'ew', dir: rng() < 0.5 ? -1 : 1 };
}

export function nearestStreet(v) {
  let best = CITY.streets[0];
  for (const s of CITY.streets) {
    if (Math.abs(s - v) < Math.abs(best - v)) best = s;
  }
  return best;
}
