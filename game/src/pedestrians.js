// pedestrians.js — Solmar City residents on the sidewalks.
// They wander between sidewalk points, chat, wave at Mara, flee from fast
// cars and gunfire, and the first three are tourists who stop at the
// scenic spots to take photos.
import * as THREE from 'three';
import { CITY, randomSidewalkPoint } from './city.js';
import { createRng, rand, pick, clamp } from './utils.js';

export const SHIRT_COLOURS = [
  0x2e6fd8, 0xd23b3b, 0x3fae6a, 0xf2c14e, 0x8a5fc0,
  0xff7a2a, 0x7fb3c8, 0xe8e8e8, 0xc96f5a, 0x9db98a,
];
export const PANTS_COLOURS = [0x2e4a6b, 0x333333, 0x5a4a3a, 0x4a5a6b];
export const SKIN_TONES = [0xd9a986, 0x8a5a3b, 0xe8b89a, 0x6b4a2a];

export const IDLE_BARKS = [
  'Nice day!', 'Hey, Mara!', 'Traffic again…', 'Go Solmar!',
  'What a view!', 'Late for work!',
];
export const SCARED_BARKS = [
  'Help!', 'Watch it!', 'Are you crazy?!', 'Somebody call the law!', 'Hey!',
];
export const ANGRY_BARKS = [
  'Hey!', 'Watch where you’re going!', 'Rude!', 'My shoes!',
];
export const TOURIST_BARKS = [
  'Say cheese!', 'What a view!', 'Photo time!', 'For the album!',
];
export const TOURIST_SPOTS = [
  { x: -40, z: 214, line: 'The bay at sunset…' },
  { x: 40, z: 300, line: 'The causeway!' },
  { x: 120, z: 390, line: 'The lighthouse!' },
  { x: 0, z: 124, line: 'Downtown!' },
];

const BOUND = (CITY && CITY.bound) || 235;

function pointOf(pt) {
  if (!pt) return { x: 0, z: 0 };
  if (pt.pos) return { x: pt.pos.x || 0, z: pt.pos.z || 0 };
  return { x: pt.x || 0, z: pt.z || 0 };
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function buildFigure(shirt, pants, skin) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.38), shirtMat);
  torso.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skinMat);
  head.position.y = 1.78;
  const legGeo = new THREE.BoxGeometry(0.24, 0.72, 0.28);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.17, 0.36, 0);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.17, 0.36, 0);
  const armGeo = new THREE.BoxGeometry(0.18, 0.62, 0.22);
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.43, 1.12, 0);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.43, 1.12, 0);
  group.add(torso, head, legL, legR, armL, armR);
  return { group, parts: { legL, legR, armL, armR } };
}

export function spawnPedestrians(scene, seed, count = 26) {
  const rng = createRng(seed * 104729 + 7);
  const peds = [];

  for (let i = 0; i < count; i++) {
    const spot = pointOf(randomSidewalkPoint(rng));
    const figure = buildFigure(
      pick(rng, SHIRT_COLOURS),
      pick(rng, PANTS_COLOURS),
      pick(rng, SKIN_TONES),
    );
    const scale = rand(rng, 0.92, 1.08);
    figure.group.scale.setScalar(scale);
    const ped = {
      group: figure.group,
      parts: figure.parts,
      pos: new THREE.Vector3(spot.x, 0, spot.z),
      target: new THREE.Vector3(0, 0, 0),
      heading: rand(rng, 0, Math.PI * 2),
      walkSpeed: rand(rng, 1.1, 2.1),
      walkPhase: rand(rng, 0, 6),
      fleeTimer: 0,
      downTimer: 0,
      down: false,
      barkTimer: rand(rng, 6, 20),
      barkSprite: null,
      barkLife: 0,
      tourist: i < 3,
      photoTimer: rand(rng, 4, 12),
      photoPause: 0,
      waveTimer: 0,
    };
    const next = pointOf(randomSidewalkPoint(rng));
    ped.target.set(next.x, 0, next.z);
    ped.group.position.copy(ped.pos);
    ped.group.rotation.y = ped.heading;
    scene.add(ped.group);
    peds.push(ped);
  }

  function disposeBubble(ped) {
    const sprite = ped.barkSprite;
    if (!sprite) return;
    if (sprite.parent) sprite.parent.remove(sprite);
    if (sprite.material) {
      if (sprite.material.map) sprite.material.map.dispose();
      sprite.material.dispose();
    }
    ped.barkSprite = null;
    ped.barkLife = 0;
  }

  function bark(p, text, life = 1.8) {
    if (!p || p.down) return;
    disposeBubble(p);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 72;
    const ctx = canvas.getContext('2d');
    const r = 14;
    ctx.fillStyle = '#fdfdf8';
    ctx.beginPath();
    ctx.moveTo(r, 2);
    ctx.lineTo(256 - r, 2);
    ctx.quadraticCurveTo(254, 2, 254, r);
    ctx.lineTo(254, 70 - r);
    ctx.quadraticCurveTo(254, 70, 256 - r, 70);
    ctx.lineTo(r, 70);
    ctx.quadraticCurveTo(2, 70, 2, 70 - r);
    ctx.lineTo(2, r);
    ctx.quadraticCurveTo(2, 2, r, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1c1c22';
    ctx.font = 'bold 26px Verdana';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 38);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(4.4, 1.24, 1);
    sprite.position.set(0, 2.7, 0);
    sprite.userData.maxLife = life;
    p.group.add(sprite);
    p.barkSprite = sprite;
    p.barkLife = life;
    p.barkTimer = rand(rng, 8, 22);
  }

  function say(p, lines) {
    bark(p, pick(rng, lines));
  }

  function newSidewalkTarget(ped) {
    // Prefer a nearby point so residents stay in their neighbourhood.
    let best = null;
    let bestDist = Infinity;
    for (let k = 0; k < 3; k++) {
      const cand = pointOf(randomSidewalkPoint(rng));
      const d = Math.hypot(cand.x - ped.pos.x, cand.z - ped.pos.z);
      if (d < bestDist) { bestDist = d; best = cand; }
    }
    if (best) ped.target.set(best.x, 0, best.z);
  }

  function fleeFrom(ped, fromX, fromZ, seconds, reach) {
    const dx = ped.pos.x - fromX;
    const dz = ped.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    const tx = ped.pos.x + (dx / d) * reach;
    const tz = ped.pos.z + (dz / d) * reach;
    ped.target.set(clamp(tx, -BOUND, BOUND), 0, clamp(tz, -BOUND, BOUND + 30));
    ped.fleeTimer = seconds;
  }

  function update(dt, threats) {
    threats = threats || {};
    const playerPos = threats.playerPos || null;
    const raining = !!threats.raining;
    const cars = [];
    if (threats.playerCar && threats.playerInCar) {
      const pp = threats.playerCar.pos || threats.playerCar.position;
      if (pp) cars.push({ x: pp.x, z: pp.z, speed: Math.abs(threats.playerCar.speed || 0) });
    }
    for (const tc of threats.trafficCars || []) {
      const car = tc && tc.car ? tc.car : tc;
      const pp = car && (car.pos || car.position);
      if (pp) cars.push({ x: pp.x, z: pp.z, speed: Math.abs((tc && tc.speed) || (car && car.speed) || 0) });
    }
    for (const unit of threats.policeCars || []) {
      const car = unit && unit.car ? unit.car : unit;
      const pp = car && (car.pos || car.position);
      if (pp) cars.push({ x: pp.x, z: pp.z, speed: Math.abs((unit && unit.speed) || (car && car.speed) || 0) });
    }

    for (const ped of peds) {
      // 1. Speech bubble lifetime.
      if (ped.barkSprite) {
        ped.barkLife -= dt;
        const max = (ped.barkSprite.userData && ped.barkSprite.userData.maxLife) || 1.8;
        ped.barkSprite.material.opacity = clamp(ped.barkLife / max, 0, 1);
        if (ped.barkLife <= 0) disposeBubble(ped);
      }

      // 2. Down: count down, then get up, flee and complain.
      if (ped.down) {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.down = false;
          ped.group.rotation.x = 0;
          ped.group.position.y = 0;
          // Limbs back to neutral before the flee swing takes over.
          ped.parts.legL.rotation.x = 0;
          ped.parts.legR.rotation.x = 0;
          ped.parts.armL.rotation.x = 0;
          ped.parts.armR.rotation.x = 0;
          ped.fleeTimer = 2.5;
          say(ped, ANGRY_BARKS);
        }
        continue;
      }

      const fleeing = ped.fleeTimer > 0;

      // 3. Gunfire panic.
      if (threats.gunshotPos && !fleeing) {
        const gx = threats.gunshotPos.x;
        const gz = threats.gunshotPos.z;
        if (Math.hypot(ped.pos.x - gx, ped.pos.z - gz) < 26) {
          fleeFrom(ped, gx, gz, 2.8, 30);
          say(ped, SCARED_BARKS);
        }
      }

      const calm = ped.fleeTimer <= 0;

      // 4. Idle chatter.
      if (calm) {
        ped.barkTimer -= dt;
        if (ped.barkTimer <= 0) say(ped, IDLE_BARKS);
      }

      // 5. Wave at Mara when she strolls past on foot.
      if (calm && playerPos && !threats.playerInCar) {
        const d = Math.hypot(ped.pos.x - playerPos.x, ped.pos.z - playerPos.z);
        if (d < 3 && ped.barkTimer > 5) {
          ped.waveTimer = 1.2;
          bark(ped, 'Hey, Mara!');
        }
      }

      // 6. Flee from fast cars.
      if (calm) {
        for (const car of cars) {
          const d = Math.hypot(ped.pos.x - car.x, ped.pos.z - car.z);
          if (car.speed > 6 && d < 7) {
            fleeFrom(ped, car.x, car.z, 1.6, 25);
            if (rng() < 0.5) say(ped, SCARED_BARKS);
            break;
          }
        }
      }

      // 7. Count the flee timer down.
      if (ped.fleeTimer > 0) ped.fleeTimer -= dt;

      // 8. Tourists stop at scenic spots to take photos.
      let posing = false;
      if (ped.tourist && ped.fleeTimer <= 0) {
        ped.photoTimer -= dt;
        if (ped.photoPause > 0) {
          ped.photoPause -= dt;
          posing = true;
          ped.parts.armR.rotation.x = -2.4;
        } else if (ped.photoTimer <= 0) {
          let nearSpot = null;
          for (const spot of TOURIST_SPOTS) {
            if (Math.hypot(ped.pos.x - spot.x, ped.pos.z - spot.z) < 12) { nearSpot = spot; break; }
          }
          if (nearSpot) {
            ped.photoPause = 3;
            ped.photoTimer = rand(rng, 10, 20);
            bark(ped, pick(rng, TOURIST_BARKS));
            posing = true;
          } else {
            const spot = pick(rng, TOURIST_SPOTS);
            ped.target.set(spot.x + rand(rng, -3, 3), 0, spot.z + rand(rng, -3, 3));
            ped.photoTimer = rand(rng, 8, 16);
          }
        }
      }

      // 9. Walk.
      const toTarget = Math.hypot(ped.target.x - ped.pos.x, ped.target.z - ped.pos.z);
      if (toTarget < 1.2) {
        newSidewalkTarget(ped);
        continue;
      }
      if (posing) continue;
      const isFleeing = ped.fleeTimer > 0;
      let speed = isFleeing ? 5.2 : ped.walkSpeed;
      if (raining) speed *= 0.75;
      const wantHeading = Math.atan2(ped.target.x - ped.pos.x, ped.target.z - ped.pos.z);
      const turn = clamp(wrapAngle(wantHeading - ped.heading), -dt * 8, dt * 8);
      ped.heading += turn;
      ped.pos.x += Math.sin(ped.heading) * speed * dt;
      ped.pos.z += Math.cos(ped.heading) * speed * dt;
      ped.pos.x = clamp(ped.pos.x, -BOUND, BOUND);
      ped.pos.z = clamp(ped.pos.z, -BOUND, BOUND + 30);
      ped.walkPhase += dt * (isFleeing ? 14 : 8);
      ped.group.position.copy(ped.pos);
      ped.group.rotation.y = ped.heading;
      const swing = Math.sin(ped.walkPhase) * 0.5;
      ped.parts.legL.rotation.x = swing;
      ped.parts.legR.rotation.x = -swing;
      ped.parts.armL.rotation.x = -swing * 0.8;
      if (ped.waveTimer > 0) {
        ped.waveTimer -= dt;
        ped.parts.armR.rotation.x = -2.6;
      } else {
        ped.parts.armR.rotation.x = swing * 0.8;
      }
    }
  }

  function nearest(pos, maxDist) {
    if (!pos) return null;
    let best = null;
    let bestDist = maxDist === undefined || maxDist === null ? Infinity : maxDist;
    for (const ped of peds) {
      if (ped.down) continue;
      const d = Math.hypot(ped.pos.x - pos.x, ped.pos.z - pos.z);
      if (d < bestDist) { bestDist = d; best = ped; }
    }
    return best;
  }

  function knockDown(p) {
    if (!p || p.down) return;
    p.down = true;
    p.downTimer = 2.8;
    disposeBubble(p);
    p.group.rotation.x = -Math.PI / 2 + 0.15;
    p.group.position.y = 0.35;
  }

  function place(i, x, z) {
    const ped = peds[((i % peds.length) + peds.length) % peds.length];
    ped.pos.set(x, 0, z);
    ped.target.set(x + 8, 0, z + 4);
    ped.down = false;
    ped.downTimer = 0;
    ped.fleeTimer = 0;
    ped.group.rotation.x = 0;
    ped.group.position.copy(ped.pos);
    ped.group.rotation.y = ped.heading;
    return ped;
  }

  // Crowd density: spawn extra residents on the sidewalks around a
  // centre point, so a posed downtown scene can pack the pavements.
  function spawnExtra(count, cx, cz) {
    const made = [];
    for (let k = 0; k < (count || 0); k++) {
      const figure = buildFigure(
        pick(rng, SHIRT_COLOURS),
        pick(rng, PANTS_COLOURS),
        pick(rng, SKIN_TONES),
      );
      const scale = rand(rng, 0.92, 1.08);
      figure.group.scale.setScalar(scale);
      const street = (cx || 0) + pick(rng, [-10.5, 10.5]);
      const ped = {
        group: figure.group,
        parts: figure.parts,
        pos: new THREE.Vector3(street, 0, (cz || 0) + rand(rng, -55, 55)),
        target: new THREE.Vector3(0, 0, 0),
        heading: rand(rng, 0, Math.PI * 2),
        walkSpeed: rand(rng, 1.1, 2.1),
        walkPhase: rand(rng, 0, 6),
        fleeTimer: 0,
        downTimer: 0,
        down: false,
        barkTimer: rand(rng, 6, 20),
        barkSprite: null,
        barkLife: 0,
        tourist: false,
        photoTimer: rand(rng, 4, 12),
        photoPause: 0,
        waveTimer: 0,
      };
      const next = pointOf(randomSidewalkPoint(rng));
      ped.target.set(next.x, 0, next.z);
      ped.group.position.copy(ped.pos);
      ped.group.rotation.y = ped.heading;
      scene.add(ped.group);
      peds.push(ped);
      made.push(ped);
    }
    return made;
  }

  // Stage a whole burst of pedestrians at once: [index, x, z].
  // Spawns extra residents first when the burst names more than the
  // crowd has.
  function burst(spots) {
    const list = spots || [];
    if (list.length > peds.length) spawnExtra(list.length - peds.length, list[0][1], list[0][2]);
    for (const [index, x, z] of list) place(index, x, z);
  }

  return { peds, update, nearest, knockDown, place, burst, spawnExtra, bark };
}
