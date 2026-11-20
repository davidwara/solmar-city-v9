import * as THREE from 'three';

// Biscuit — the stray dog of the beach promenade. He adopts Mara when she
// walks within 7m of him after 15s of play, then follows her everywhere,
// barks at gang members, and can sniff out the nearest hidden package.

export const SNACK_PRICE = 10;
export const SNACK_COST = 10;
export const ADOPT_RANGE = 7;
export const ADOPT_AFTER_SECONDS = 15;

const SPAWN = [-20, 0, 190];
const FOLLOW_SPEED = 5.5;
const POINT_SPEED = 6.5;

function flatDist(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// A small dog: brown body, head with floppy ears, a snout, four legs and
// a tail that wags faster the happier he is.
function buildDog() {
  const group = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
  const furDark = new THREE.MeshLambertMaterial({ color: 0x5f3d1c });
  const cream = new THREE.MeshLambertMaterial({ color: 0xe8d3a8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.36, 0.32), fur);
  body.position.y = 0.42;
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.3), fur);
  head.position.set(0.48, 0.62, 0);
  group.add(head);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.16), cream);
  snout.position.set(0.68, 0.56, 0);
  group.add(snout);

  const earL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.14), furDark);
  earL.position.set(0.44, 0.76, 0.14);
  group.add(earL);
  const earR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.14), furDark);
  earR.position.set(0.44, 0.76, -0.14);
  group.add(earR);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.07), furDark);
  tail.position.set(-0.48, 0.55, 0);
  group.add(tail);

  const legs = [];
  const legSpots = [
    [0.24, 0.11],
    [0.24, -0.11],
    [-0.24, 0.11],
    [-0.24, -0.11],
  ];
  for (const [lx, lz] of legSpots) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.1), furDark);
    leg.position.set(lx, 0.13, lz);
    group.add(leg);
    legs.push(leg);
  }

  return { group, tail, legs };
}

export function createPets(scene, audio, collectibles, gangs) {
  const dog = buildDog();
  dog.group.position.set(SPAWN[0], 0, SPAWN[2]);
  scene.add(dog.group);

  const marker = { x: SPAWN[0], z: SPAWN[2], kind: 'dog' };

  let adopted = false;
  let adoptReady = false;
  let playTime = 0;
  let happiness = 0.6;
  let snacksFed = 0;
  let packagesFound = 0;
  let pointing = null;
  let pointTimer = 0;
  let barkCooldown = 0;
  let wagPhase = 0;
  let walkPhase = 0;
  let lastNow = null;
  let idleTimer = 0;
  let idleTarget = null;

  function followDistance() {
    // A happy Biscuit trots right at Mara's heel; a hungry one hangs back.
    return 4.5 - happiness * 2.8;
  }

  function bark() {
    if (barkCooldown > 0) return;
    barkCooldown = 1.6;
    if (audio && typeof audio.dogBark === 'function') audio.dogBark();
  }

  function moveToward(tx, tz, speed, dt) {
    const p = dog.group.position;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.05) return 0;
    const step = Math.min(dist, speed * dt);
    p.x += (dx / dist) * step;
    p.z += (dz / dist) * step;
    dog.group.rotation.y = Math.atan2(dx, dz);
    walkPhase += dt * speed * 2.4;
    const trot = Math.sin(walkPhase) * 0.5;
    dog.legs[0].rotation.x = trot;
    dog.legs[3].rotation.x = trot;
    dog.legs[1].rotation.x = -trot;
    dog.legs[2].rotation.x = -trot;
    return dist;
  }

  function update(playerPos, moving, dtArg) {
    let dt = dtArg;
    if (typeof dt !== 'number') {
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      dt = lastNow === null ? 0.016 : Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
      lastNow = now;
    }
    if (dt <= 0) return;
    playTime += dt;
    if (barkCooldown > 0) barkCooldown -= dt;
    happiness = Math.max(0, happiness - dt * 0.002);

    const p = dog.group.position;
    marker.x = p.x;
    marker.z = p.z;

    // Tail wag: faster when Biscuit is happy or running.
    wagPhase += dt * (4 + happiness * 8 + (moving ? 3 : 0));
    dog.tail.rotation.y = Math.sin(wagPhase) * 0.55;

    if (!playerPos) return;

    if (!adopted) {
      // Adoption: Mara walks within 7m after 15s of play. main.js polls
      // adoptReady and plays the adoption cutscene, then calls
      // markAdopted() — Biscuit stays put until then.
      if (playTime >= ADOPT_AFTER_SECONDS) {
        if (flatDist(playerPos.x, playerPos.z, p.x, p.z) < ADOPT_RANGE) {
          adoptReady = true;
        }
      }
      // Idle sniffing around his spot while he waits.
      idleTimer -= dt;
      if (!idleTarget || idleTimer <= 0) {
        idleTarget = {
          x: SPAWN[0] + (Math.random() - 0.5) * 6,
          z: SPAWN[2] + (Math.random() - 0.5) * 6,
        };
        idleTimer = 3 + Math.random() * 3;
      }
      moveToward(idleTarget.x, idleTarget.z, 1.2, dt);
      return;
    }

    // Bark at any gang member who gets close to the pair.
    if (gangs && typeof gangs.nearestRival === 'function') {
      const rival = gangs.nearestRival(p, 10);
      if (rival) {
        const rp = rival.group.position;
        dog.group.rotation.y = Math.atan2(rp.x - p.x, rp.z - p.z);
        bark();
      }
    }

    // Pointing: run toward the nearest hidden package and bark at it.
    // If Mara collects it first, Biscuit gives up and trots back.
    if (pointing) {
      if (pointing.pack.collected) {
        pointing = null;
      } else {
        pointTimer -= dt;
        moveToward(pointing.pos.x, pointing.pos.z, POINT_SPEED, dt);
        const left = flatDist(p.x, p.z, pointing.pos.x, pointing.pos.z);
        if (left < 2.5) {
          bark();
          packagesFound++;
          pointing = null;
        } else if (pointTimer <= 0) {
          pointing = null;
        }
      }
      if (pointing) return;
    }

    // Follow Mara, keeping a happiness-sized gap.
    const dist = flatDist(playerPos.x, playerPos.z, p.x, p.z);
    if (dist > followDistance()) {
      moveToward(playerPos.x, playerPos.z, FOLLOW_SPEED, dt);
    } else {
      for (const leg of dog.legs) leg.rotation.x = 0;
    }
  }

  // A $10 snack. Money moves in main.js; this just applies the effect.
  function feed(money) {
    if (typeof money === 'number' && money < SNACK_PRICE) return 'broke';
    snacksFed++;
    happiness = Math.min(1, happiness + 0.35);
    bark();
    return 'ok';
  }

  // Run toward the nearest uncollected package and bark. Returns its
  // position, or null when there is nothing left to sniff out.
  function point() {
    if (!adopted) return null;
    if (!collectibles || !collectibles.packages) return null;
    let best = null;
    let bestDist = Infinity;
    const p = dog.group.position;
    for (const pack of collectibles.packages) {
      if (pack.collected) continue;
      const d = flatDist(p.x, p.z, pack.pos.x, pack.pos.z);
      if (d < bestDist) {
        bestDist = d;
        best = pack;
      }
    }
    if (!best) return null;
    pointing = { pos: best.pos.clone(), pack: best };
    pointTimer = 25;
    bark();
    return best.pos.clone();
  }

  function markAdopted() {
    adopted = true;
    adoptReady = false;
    bark();
  }

  function statusText() {
    if (!adopted) return 'A stray dog watches from the beach';
    const mood = happiness > 0.66 ? 'happy' : happiness > 0.33 ? 'content' : 'hungry';
    return 'Biscuit — ' + mood + ' — snacks ' + snacksFed;
  }

  function save() {
    return { adopted, snacksFed, packagesFound, happiness };
  }

  function load(data) {
    if (!data) return;
    if (data.adopted) {
      adopted = true;
      adoptReady = false;
    }
    if (typeof data.snacksFed === 'number') snacksFed = data.snacksFed;
    if (typeof data.packagesFound === 'number') packagesFound = data.packagesFound;
    if (typeof data.happiness === 'number') happiness = data.happiness;
  }

  return {
    group: dog.group,
    markers: [marker],
    update,
    feed,
    point,
    markAdopted,
    statusText,
    save,
    load,
    get adopted() {
      return adopted;
    },
    get adoptReady() {
      return adoptReady;
    },
    get happiness() {
      return happiness;
    },
    get snacksFed() {
      return snacksFed;
    },
    get packagesFound() {
      return packagesFound;
    },
  };
}
