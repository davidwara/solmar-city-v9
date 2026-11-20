// fishing.js — pier fishing on the marina pier. F casts near the
// water, the bobber floats and bobs, a bite dips it with a splash,
// and a well-timed reel lands the fish. The bucket can be sold at
// the marina. Money never moves here: sell() returns the total and
// main.js adds it to the wallet.

import * as THREE from 'three';

export const PIER_TIP = { x: -150, y: 0, z: 253 };
export const PIER_POS = { x: -150, y: 0, z: 232 };
export const MARINA_POS = { x: -150, y: 0, z: 225 };
export const FISH_PRICES = { Minnow: 15, Bass: 40, 'Golden Koi': 200 };
export const FISH_TABLE = FISH_PRICES;

const FISH_KINDS = [
  { name: 'Minnow', price: 15, weight: 0.55, colour: 0xc0c8d0 },
  { name: 'Bass', price: 40, weight: 0.35, colour: 0x4a7a4a },
  { name: 'Golden Koi', price: 200, weight: 0.1, colour: 0xffc860, rare: true },
];

function pickFish() {
  const roll = Math.random();
  let acc = 0;
  for (const kind of FISH_KINDS) {
    acc += kind.weight;
    if (roll < acc) return kind;
  }
  return FISH_KINDS[0];
}

export function createFishing(scene, audio) {
  // Pier visuals: a wooden walkway already exists in the city, so
  // here we add the fishing-spot dressing — a bait bucket, a tackle
  // box and a couple of gulls' favourite perches at the pier tip.
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a7b52, roughness: 0.9 });
  const bucketMat = new THREE.MeshStandardMaterial({ color: 0x7a8a9a, roughness: 0.7 });
  const tip = new THREE.Group();
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.5, 10), bucketMat);
  bucket.position.set(PIER_TIP.x + 1.2, 1.1, PIER_TIP.z - 1.5);
  tip.add(bucket);
  const tackle = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.45), wood);
  tackle.position.set(PIER_TIP.x - 1.4, 1.0, PIER_TIP.z - 1.2);
  tip.add(tackle);
  const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), wood);
  signPost.position.set(PIER_TIP.x + 1.6, 1.6, PIER_TIP.z - 3.5);
  tip.add(signPost);
  if (scene) scene.add(tip);

  // The bobber: a small red-and-white float, hidden until cast.
  const bobberMat = new THREE.MeshStandardMaterial({ color: 0xd9382b, roughness: 0.5 });
  const bobber = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), bobberMat);
  bobber.visible = false;
  if (scene) scene.add(bobber);

  // The line: a thin line from the pier tip to the bobber, drawn
  // only while a cast is out.
  const lineGeo = new THREE.BufferGeometry();
  const linePos = new Float32Array(6);
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xe8e8e8 }));
  line.visible = false;
  line.frustumCulled = false;
  if (scene) scene.add(line);

  const fishing = {
    bobber,
    line,
    bucket: [],
    caught: 0,
    earned: 0,
    state: 'idle', // idle | waiting | bite
    castPos: null,
    waitTimer: 0,
    biteTimer: 0,
    bobPhase: 0,
    lastCatch: null,

    isNearPier(pos) {
      if (!pos) return false;
      const dx = pos.x - PIER_POS.x;
      const dz = pos.z - PIER_POS.z;
      return dx * dx + dz * dz < 26 * 26;
    },

    nearPier(pos) {
      return fishing.isNearPier(pos);
    },

    isNearMarina(pos) {
      if (!pos) return false;
      const dx = pos.x - MARINA_POS.x;
      const dz = pos.z - MARINA_POS.z;
      return dx * dx + dz * dz < 12 * 12;
    },

    // Cast the line off the pier tip. Needs the player near the pier.
    cast(playerPos) {
      if (fishing.state !== 'idle') return { ok: false, text: 'Line is already out.' };
      if (playerPos && !fishing.isNearPier(playerPos)) {
        return { ok: false, text: 'Get closer to the pier to fish.' };
      }
      const dir = playerPos
        ? Math.atan2(PIER_TIP.z - playerPos.z, PIER_TIP.x - playerPos.x)
        : Math.PI / 2;
      const dist = 6 + Math.random() * 5;
      fishing.castPos = new THREE.Vector3(
        PIER_TIP.x + Math.cos(dir) * dist,
        0.25,
        PIER_TIP.z + Math.sin(dir) * dist,
      );
      // Keep the bobber on the water, south of the pier.
      if (fishing.castPos.z < PIER_TIP.z + 2) fishing.castPos.z = PIER_TIP.z + 2 + Math.random() * 4;
      fishing.state = 'waiting';
      fishing.waitTimer = 2.5 + Math.random() * 4;
      fishing.biteTimer = 0;
      bobber.position.copy(fishing.castPos);
      bobber.visible = true;
      line.visible = true;
      if (audio) audio.splash();
      return { ok: true, text: '🎣 Line cast — wait for a bite…' };
    },

    // Reel in. Timing matters: reel during the bite window to catch,
    // too early and the fish spooks, too late and it swims off.
    // A Golden Koi is rare (10%) — the bucket keeps the fish so the
    // HUD catch log can show the lucky catch.
    reel() {
      if (fishing.state === 'bite') {
        const kind = pickFish();
        const fish = { name: kind.name, price: kind.price, rare: !!kind.rare };
        fishing.bucket.push(fish);
        fishing.caught += 1;
        fishing.lastCatch = fish;
        fishing.state = 'idle';
        bobber.visible = false;
        line.visible = false;
        if (audio) audio.jingle();
        const rare = kind.rare ? ' ✨ RARE!' : '';
        return {
          caught: true,
          bite: false,
          fish,
          text: `🐟 Caught a ${kind.name} — $${kind.price}!${rare}`,
        };
      }
      if (fishing.state === 'waiting') {
        fishing.state = 'idle';
        bobber.visible = false;
        line.visible = false;
        if (audio) audio.thud();
        return { caught: false, bite: false, text: 'Reeled in too early — the fish spooked.' };
      }
      return { caught: false, bite: false, text: 'Nothing on the line.' };
    },

    bucketValue() {
      let total = 0;
      for (const fish of fishing.bucket) total += fish.price || 0;
      return total;
    },

    bucketTotal() {
      return fishing.bucketValue();
    },

    // Sell the whole bucket at the marina. Returns the total paid.
    sell() {
      const total = fishing.bucketValue();
      if (total <= 0) return { total: 0, text: 'Bucket is empty — nothing to sell.' };
      fishing.bucket = [];
      fishing.earned += total;
      if (audio) audio.jingle();
      return { total, text: `💵 Sold the catch for $${total}.` };
    },

    statusText() {
      if (fishing.state === 'bite') return '🎣 BITE! Reel in NOW!';
      if (fishing.state === 'waiting') return '🎣 Waiting for a bite…';
      const total = fishing.bucketValue();
      if (fishing.bucket.length > 0) {
        return `🎣 Bucket: ${fishing.bucket.length} fish ($${total}) — sell at the marina`;
      }
      return '🎣 Pier fishing — F to cast · Minnow $15 · Bass $40 · Golden Koi $200';
    },

    markers() {
      return [
        { x: PIER_TIP.x, z: PIER_TIP.z, kind: 'pier', label: 'Fishing pier' },
        { x: MARINA_POS.x, z: MARINA_POS.z, kind: 'marina', label: 'Marina' },
      ];
    },

    update(playerPos, goldenHour, seaBreeze, dt) {
      const step = (typeof dt === 'number' && dt > 0) ? Math.min(dt, 0.05) : 0.016;
      const breeze = typeof seaBreeze === 'number' ? seaBreeze : 0.3;
      fishing.bobPhase += step;
      if (fishing.state === 'waiting') {
        fishing.waitTimer -= step;
        // Golden hour and a good breeze bring the fish in faster.
        if (goldenHour) fishing.waitTimer -= step * 0.5;
        if (breeze > 0.6) fishing.waitTimer -= step * 0.4;
        if (fishing.waitTimer <= 0) {
          fishing.state = 'bite';
          fishing.biteTimer = 1.6;
          if (audio) audio.splash();
        }
      } else if (fishing.state === 'bite') {
        fishing.biteTimer -= step;
        if (fishing.biteTimer <= 0) {
          fishing.state = 'idle';
          bobber.visible = false;
          line.visible = false;
        }
      }
      if (bobber.visible && fishing.castPos) {
        const dip = fishing.state === 'bite' ? -0.22 : 0;
        const bob = Math.sin(fishing.bobPhase * 2.2) * 0.07 * (0.5 + breeze);
        bobber.position.set(
          fishing.castPos.x,
          0.25 + bob + dip,
          fishing.castPos.z,
        );
        if (fishing.state === 'bite') {
          bobber.position.y += Math.sin(fishing.bobPhase * 18) * 0.06;
        }
        const positions = lineGeo.attributes.position.array;
        positions[0] = PIER_TIP.x;
        positions[1] = 1.4;
        positions[2] = PIER_TIP.z;
        positions[3] = bobber.position.x;
        positions[4] = bobber.position.y;
        positions[5] = bobber.position.z;
        lineGeo.attributes.position.needsUpdate = true;
      }
    },

    saveData() {
      return {
        caught: fishing.caught,
        earned: fishing.earned,
        bucket: fishing.bucket.map((f) => ({ name: f.name, price: f.price })),
      };
    },

    getSaveData() {
      return fishing.saveData();
    },

    loadData(data) {
      const d = data || {};
      fishing.caught = d.caught || 0;
      fishing.earned = d.earned || 0;
      fishing.bucket = Array.isArray(d.bucket) ? d.bucket.slice() : [];
      fishing.state = 'idle';
      bobber.visible = false;
      line.visible = false;
    },

    loadSaveData(data) {
      fishing.loadData(data);
    },
  };
  return fishing;
}
