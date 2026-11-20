import * as THREE from 'three';

// Gangs of Solmar City — turf zones, rival members, passive turf income.
// Mara's crew can claim a rival zone by standing inside it for 20 seconds.
// Every turf Mara owns pays $50 per minute while the game runs.

export const CLAIM_SECONDS = 20;
export const TURF_INCOME_PER_MINUTE = 50;
export const MEMBERS_PER_TURF = 3;
export const AGGRO_RANGE = 34;
export const ATTACK_RANGE = 2.3;

const GANG_DEFS = [
  { name: 'Vipers', color: 0x2fae4e, css: '#2fae4e', centre: [124, 0, -124], radius: 38 },
  { name: 'Sharks', color: 0x2f7fe0, css: '#2f7fe0', centre: [-124, 0, 124], radius: 38 },
  { name: 'Crows', color: 0x9a4fd0, css: '#9a4fd0', centre: [124, 0, 124], radius: 38 },
];

const SKIN_TONES = [0xd9a066, 0xb97f4e, 0xe8b98a, 0x8a5a33];

// Tiny deterministic RNG so member spawn spots are stable per seed.
function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function flatDist(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// A coloured ground disc + ring + a small flag pole marking one turf zone.
function buildZoneVisuals(scene, def) {
  const group = new THREE.Group();
  group.position.set(def.centre[0], 0, def.centre[2]);

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(def.radius, 36),
    new THREE.MeshBasicMaterial({
      color: def.color,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.06;
  group.add(disc);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(def.radius - 1.4, def.radius, 48),
    new THREE.MeshBasicMaterial({
      color: def.color,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.07;
  group.add(ring);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 5.2, 8),
    new THREE.MeshLambertMaterial({ color: 0x3a3a3a }),
  );
  pole.position.y = 2.6;
  group.add(pole);

  const flag = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 1.0, 0.06),
    new THREE.MeshLambertMaterial({ color: def.color }),
  );
  flag.position.set(0.9, 4.6, 0);
  group.add(flag);

  scene.add(group);
  return { group, disc, ring, flag };
}

// A simple gang member figure: torso + head + limbs in the gang colour.
function buildMemberFigure(color, rng) {
  const group = new THREE.Group();
  const cloth = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const skin = new THREE.MeshLambertMaterial({
    color: SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)],
  });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.24), dark);
  legL.position.set(-0.15, 0.28, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.24), dark);
  legR.position.set(0.15, 0.28, 0);
  group.add(legR);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.78, 0.36), cloth);
  torso.position.y = 0.95;
  group.add(torso);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.2), cloth);
  armL.position.set(-0.42, 1.05, 0);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.2), cloth);
  armR.position.set(0.42, 1.05, 0);
  group.add(armR);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.58;
  group.add(head);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), cloth);
  cap.position.y = 1.8;
  group.add(cap);

  return { group, armL, armR, legL, legR, head };
}

export function createGangs(scene, seed) {
  const rng = mulberry32(typeof seed === 'number' ? seed : 1);

  const zones = GANG_DEFS.map((def) => {
    const visuals = buildZoneVisuals(scene, def);
    return {
      name: def.name,
      color: def.color,
      css: def.css,
      centre: new THREE.Vector3(def.centre[0], 0, def.centre[2]),
      radius: def.radius,
      owner: def.name,
      claim: 0,
      visuals,
    };
  });

  // One marker object per zone for the minimap; main.js reads these live.
  const markers = zones.map((zone) => ({
    x: zone.centre.x,
    z: zone.centre.z,
    radius: zone.radius,
    color: zone.css,
    owner: zone.owner,
    name: zone.name,
    kind: 'turf',
  }));

  const members = [];
  zones.forEach((zone, zoneIndex) => {
    for (let i = 0; i < MEMBERS_PER_TURF; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = 4 + rng() * (zone.radius - 10);
      const hx = zone.centre.x + Math.cos(angle) * dist;
      const hz = zone.centre.z + Math.sin(angle) * dist;
      const figure = buildMemberFigure(zone.color, rng);
      figure.group.position.set(hx, 0, hz);
      scene.add(figure.group);
      members.push({
        gang: zone.name,
        zoneIndex,
        group: figure.group,
        armL: figure.armL,
        armR: figure.armR,
        legL: figure.legL,
        legR: figure.legR,
        home: new THREE.Vector3(hx, 0, hz),
        heading: rng() * Math.PI * 2,
        state: 'guard',
        down: false,
        downTimer: 0,
        swingTimer: 0,
        attackCooldown: 0,
        wanderTimer: 1 + rng() * 3,
        wanderTarget: null,
        walkPhase: rng() * Math.PI * 2,
        fled: false,
      });
    }
  });

  let incomePool = 0;

  function zoneOf(member) {
    return zones[member.zoneIndex];
  }

  function ownedCount() {
    let n = 0;
    for (const zone of zones) if (zone.owner === 'Mara') n++;
    return n;
  }

  function claimZone(zone) {
    zone.owner = 'Mara';
    zone.claim = 0;
    zone.visuals.disc.material.color.setHex(0xe8b13c);
    zone.visuals.ring.material.color.setHex(0xe8b13c);
    zone.visuals.flag.material.color.setHex(0xe8b13c);
    const marker = markers.find((m) => m.name === zone.name);
    if (marker) {
      marker.owner = 'Mara';
      marker.color = '#e8b13c';
    }
    // The old crew clears out of a lost turf.
    const zonePos = zones.indexOf(zone);
    for (const member of members) {
      if (member.zoneIndex === zonePos) {
        member.fled = true;
        member.group.visible = false;
      }
    }
  }

  function moveMember(member, dt, tx, tz, speed) {
    const p = member.group.position;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.05) return 0;
    const step = Math.min(dist, speed * dt);
    p.x += (dx / dist) * step;
    p.z += (dz / dist) * step;
    member.heading = Math.atan2(dx, dz);
    member.group.rotation.y = member.heading;
    member.walkPhase += dt * speed * 3.2;
    const swing = Math.sin(member.walkPhase) * 0.55;
    member.legL.rotation.x = swing;
    member.legR.rotation.x = -swing;
    member.armL.rotation.x = -swing * 0.8;
    member.armR.rotation.x = swing * 0.8;
    return dist;
  }

  function update(dt, focusPos, inCar, inBoat) {
    const events = { claimed: null, income: 0, hits: 0 };
    if (!focusPos) return events;
    const fx = focusPos.x || 0;
    const fz = focusPos.z || 0;

    // Turf claiming: stand inside a rival zone for 20s to take it.
    for (const zone of zones) {
      if (zone.owner === 'Mara') continue;
      const inside = flatDist(fx, fz, zone.centre.x, zone.centre.z) < zone.radius;
      if (inside && !inCar && !inBoat) {
        zone.claim += dt;
        const pulse = 0.14 + (zone.claim / CLAIM_SECONDS) * 0.22;
        zone.visuals.disc.material.opacity = pulse;
        if (zone.claim >= CLAIM_SECONDS) {
          claimZone(zone);
          events.claimed = zone.name;
        }
      } else {
        zone.claim = Math.max(0, zone.claim - dt * 2);
        zone.visuals.disc.material.opacity = 0.14;
      }
    }

    // Passive income: $50 per minute for every turf Mara owns.
    const owned = ownedCount();
    if (owned > 0) {
      incomePool += (owned * TURF_INCOME_PER_MINUTE * dt) / 60;
      if (incomePool >= 1) {
        const whole = Math.floor(incomePool);
        incomePool -= whole;
        events.income = whole;
      }
    }

    // Rival members: guard their turf, chase Mara on sight, swing melee.
    for (const member of members) {
      if (member.fled) continue;
      const p = member.group.position;

      if (member.down) {
        member.downTimer -= dt;
        if (member.downTimer <= 0) {
          member.down = false;
          member.group.rotation.x = 0;
          member.group.position.y = 0;
        }
        continue;
      }

      const zone = zoneOf(member);
      const distToMara = flatDist(p.x, p.z, fx, fz);
      const hostile = zone.owner !== 'Mara' && !inCar && !inBoat && distToMara < AGGRO_RANGE;

      if (hostile) {
        member.state = 'chase';
        if (member.swingTimer > 0) member.swingTimer -= dt;
        if (member.attackCooldown > 0) member.attackCooldown -= dt;
        if (distToMara > ATTACK_RANGE) {
          moveMember(member, dt, fx, fz, 4.3);
        } else {
          // Planted in range: stop the walk cycle and throw the punch.
          member.legL.rotation.x = 0;
          member.legR.rotation.x = 0;
          member.armL.rotation.x = 0;
          member.group.rotation.y = Math.atan2(fx - p.x, fz - p.z);
          if (member.attackCooldown <= 0) {
            member.swingTimer = 0.45;
            member.attackCooldown = 1.3;
            events.hits += 1;
          }
        }
        // Melee swing: right arm sweeps forward, then drops back.
        if (member.swingTimer > 0) {
          member.armR.rotation.x = -2.1 * (member.swingTimer / 0.45);
        } else {
          member.armR.rotation.x = 0;
        }
      } else {
        member.state = 'guard';
        member.swingTimer = 0;
        member.armR.rotation.x = 0;
        member.wanderTimer -= dt;
        if (!member.wanderTarget || member.wanderTimer <= 0) {
          const angle = rng() * Math.PI * 2;
          const dist = 3 + rng() * (zone.radius - 8);
          member.wanderTarget = {
            x: zone.centre.x + Math.cos(angle) * dist,
            z: zone.centre.z + Math.sin(angle) * dist,
          };
          member.wanderTimer = 4 + rng() * 5;
        }
        const left = moveMember(
          member,
          dt,
          member.wanderTarget.x,
          member.wanderTarget.z,
          1.5,
        );
        if (left === 0) member.wanderTimer = 0;
      }
    }

    return events;
  }

  function nearestRival(pos, maxDist) {
    if (!pos) return null;
    const limit = typeof maxDist === 'number' ? maxDist : 12;
    let best = null;
    let bestDist = limit;
    for (const member of members) {
      if (member.down || member.fled) continue;
      const d = flatDist(pos.x, pos.z, member.group.position.x, member.group.position.z);
      if (d < bestDist) {
        bestDist = d;
        best = member;
      }
    }
    return best;
  }

  function knockDown(member) {
    if (!member || member.down) return;
    member.down = true;
    member.downTimer = 3.5;
    member.swingTimer = 0;
    member.state = 'down';
    member.group.rotation.x = -Math.PI / 2 + 0.15;
    member.group.position.y = 0.35;
    member.armL.rotation.x = 0;
    member.armR.rotation.x = 0;
    member.legL.rotation.x = 0;
    member.legR.rotation.x = 0;
  }

  function rivalsInTurf() {
    let n = 0;
    for (const member of members) {
      if (member.down || member.fled) continue;
      if (zones[member.zoneIndex].owner !== 'Mara') n++;
    }
    return n;
  }

  function turfText() {
    return 'Turf ' + ownedCount() + '/3';
  }

  function save() {
    return { owned: zones.filter((z) => z.owner === 'Mara').map((z) => z.name) };
  }

  function load(data) {
    const owned = (data && data.owned) || [];
    for (const zone of zones) {
      if (owned.indexOf(zone.name) !== -1 && zone.owner !== 'Mara') {
        claimZone(zone);
      }
    }
  }

  return {
    zones,
    members,
    markers,
    update,
    nearestRival,
    knockDown,
    rivalsInTurf,
    turfText,
    save,
    load,
  };
}
