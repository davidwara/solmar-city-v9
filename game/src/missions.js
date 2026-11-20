// missions.js — Mara's twelve story jobs for Solmar City.
// The job table is the contract: ids, titles, kinds, briefings, targets,
// radii, rewards, limits, heat, night flags, fares, photo spots and gang
// all come straight from the design spec. The factory below builds the
// golden beacon marker, the bodyguard client figure and the smuggler
// roadblocks, then drives every job's state machine frame by frame.
import * as THREE from 'three';
import { CITY } from './city.js';
import { clamp } from './utils.js';

// ---------------------------------------------------------------------------
// The twelve jobs, in story order.
// ---------------------------------------------------------------------------

export const MISSIONS = [
  {
    id: 'first-job',
    title: 'First Job',
    kind: 'drive',
    briefing: 'Rico left a package at the marina pier. Go get it.',
    target: new THREE.Vector3(-150, 0, 225),
    radius: 9,
    reward: 250,
    timeLimit: 0,
  },
  {
    id: 'hot-delivery',
    title: 'Hot Delivery',
    kind: 'drive',
    briefing:
      'The package is marked — the law is on you. Deliver it to the downtown drop, fast.',
    target: new THREE.Vector3(62, 0, -62),
    radius: 9,
    reward: 500,
    timeLimit: 0,
    heatOnStart: 2,
  },
  {
    id: 'the-getaway',
    title: 'The Getaway',
    kind: 'drive',
    briefing:
      'One last run: reach the beachfront safehouse before the clock runs out.',
    target: new THREE.Vector3(124, 0, 200),
    radius: 9,
    reward: 750,
    timeLimit: 90,
  },
  {
    id: 'night-run',
    title: 'Night Run',
    kind: 'drive',
    briefing:
      'A midnight pickup on the north edge — the streets are dark and the law is out. 2 minutes.',
    target: new THREE.Vector3(-186, 0, 124),
    radius: 9,
    reward: 900,
    timeLimit: 120,
    heatOnStart: 1,
    night: true,
  },
  {
    id: 'bodyguard',
    title: 'Bodyguard',
    kind: 'bodyguard',
    briefing:
      'Walk Rico’s client across downtown. Stay close — he only moves when you are near.',
    target: new THREE.Vector3(62, 0, 62),
    clientStart: new THREE.Vector3(-62, 0, 62),
    radius: 6,
    reward: 1000,
    timeLimit: 150,
  },
  {
    id: 'taxi-king',
    title: 'Taxi King',
    kind: 'taxi',
    briefing:
      'Three fares, one shift. Pick up each rider before their patience runs out.',
    target: new THREE.Vector3(0, 0, 124),
    fares: [
      new THREE.Vector3(0, 0, 124),
      new THREE.Vector3(-124, 0, -62),
      new THREE.Vector3(124, 0, 200),
    ],
    fareTime: 60,
    fareReward: 150,
    radius: 9,
    reward: 400,
    timeLimit: 0,
  },
  {
    id: 'smugglers-run',
    title: "Smuggler's Run",
    kind: 'smuggler',
    briefing:
      'Grab the crate at the marina pier, then run it to the east docks — roadblocks go up the moment you lift it.',
    pickup: new THREE.Vector3(-150, 0, 225),
    target: new THREE.Vector3(186, 0, -62),
    radius: 9,
    reward: 1200,
    timeLimit: 150,
    heatOnPickup: 1,
  },
  {
    id: 'getaway-driver',
    title: 'Getaway Driver',
    kind: 'getaway',
    briefing:
      'Three stars, the whole city behind you — stay free for 100 seconds and the heat dies.',
    target: new THREE.Vector3(0, 0, 0),
    radius: 0,
    reward: 1500,
    timeLimit: 100,
    heatOnStart: 3,
  },
  {
    id: 'shutterbug',
    title: 'Shutterbug',
    kind: 'shutterbug',
    briefing:
      'Three scenic spots — beach, downtown, marina. Get close and snap each one with C. $300 a photo, $500 bonus for the set.',
    spots: [
      new THREE.Vector3(0, 0, 215),
      new THREE.Vector3(62, 0, -62),
      new THREE.Vector3(-150, 0, 225),
    ],
    spotNames: ['the beachfront', 'downtown plaza', 'the marina'],
    photoReward: 300,
    radius: 15,
    reward: 500,
    timeLimit: 0,
  },
  {
    id: 'island-hopper',
    title: 'Island Hopper',
    kind: 'boat',
    briefing:
      'Take a boat from the marina and run the drop across the bay to the island jetty — the delivery only counts if you arrive by boat.',
    target: new THREE.Vector3(40, 0, 312),
    radius: 12,
    reward: 1400,
    timeLimit: 240,
  },
  {
    id: 'lighthouse-keeper',
    title: 'Lighthouse Keeper',
    kind: 'lighthouse',
    briefing:
      'After dark, climb to the island lighthouse and light it — the beam guides the smugglers home. Reach the tower after 21:00.',
    target: new THREE.Vector3(120, 0, 398),
    radius: 10,
    reward: 1600,
    timeLimit: 300,
    night: true,
  },
  {
    id: 'turf-war',
    title: 'Turf War',
    kind: 'turf',
    briefing:
      'The Sharks jumped one of ours. Clear every Shark out of their turf on the north streets — get in close and lay them out with your fists.',
    target: new THREE.Vector3(-62, 0, -124),
    radius: 34,
    reward: 1800,
    timeLimit: 0,
    gang: 'sharks',
  },
];

// Spot names for the shutterbug job, kept beside the table for the HUD.
const PHOTO_SPOT_NAMES = ['the beachfront', 'downtown plaza', 'the marina'];

// How close Mara must stay for the bodyguard client to keep walking.
const VIP_FOLLOW_RANGE = 18;
// VIP walking speed in metres per second.
const VIP_WALK_SPEED = 2.4;

// ---------------------------------------------------------------------------
// Small helpers (local to this module).
// ---------------------------------------------------------------------------

function flatDist(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function wholeMetres(a, b) {
  return Math.round(flatDist(a, b));
}

function ceilSeconds(v) {
  return Math.max(0, Math.ceil(v));
}

function emptyEvents() {
  return {
    completed: null,
    reward: 0,
    failed: false,
    heat: 0,
    fareDone: false,
    fareReward: 0,
    pickup: false,
    photoDone: false,
    photoReward: 0,
  };
}

// ---------------------------------------------------------------------------
// Factory.
// ---------------------------------------------------------------------------

export function createMissions(scene) {
  // -- Marker: a floating golden gem over a tall light pillar. -----------
  const marker = new THREE.Group();
  const gemMat = new THREE.MeshBasicMaterial({ color: 0xffc93c });
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(2.1), gemMat);
  gem.position.y = 6;
  marker.add(gem);
  const pillarMat = new THREE.MeshBasicMaterial({
    color: 0xffc93c,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 1.2, 26, 10, 1, true),
    pillarMat,
  );
  pillar.position.y = 13;
  marker.add(pillar);
  marker.position.copy(MISSIONS[0].target);
  scene.add(marker);

  // -- Bodyguard client (VIP): gold jacket, dark legs, hidden at first. --
  const vip = new THREE.Group();
  const jacketMat = new THREE.MeshStandardMaterial({ color: 0xd8a020 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc98d64 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1e24 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), jacketMat);
  torso.position.y = 1.15;
  vip.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skinMat);
  head.position.y = 1.85;
  vip.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.3), darkMat);
  legs.position.y = 0.38;
  vip.add(legs);
  vip.position.copy(MISSIONS[4].clientStart);
  vip.visible = false;
  scene.add(vip);

  // -- Roadblocks for the smuggler job: striped orange barriers. ---------
  const roadblocks = [];
  const blockSpots = [
    { x: -62, z: 186, rot: 0 },
    { x: 62, z: 124, rot: Math.PI / 2 },
    { x: 124, z: 0, rot: 0 },
  ];
  for (const spot of blockSpots) {
    const block = new THREE.Group();
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xe86a1c });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(7, 1.1, 0.6), orangeMat);
    bar.position.y = 0.9;
    block.add(bar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(7, 0.35, 0.62), whiteMat);
    stripe.position.y = 1.05;
    block.add(stripe);
    for (const sx of [-3, 3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.5), whiteMat);
      leg.position.set(sx, 0.45, 0);
      block.add(leg);
    }
    block.position.set(spot.x, 0, spot.z);
    block.rotation.y = spot.rot;
    block.visible = false;
    scene.add(block);
    roadblocks.push(block);
  }

  // -- Hooks wired by main.js. -------------------------------------------
  let lighthouseHook = null;
  let turfHook = null;

  // -- Mutable state. ------------------------------------------------------
  const m = {
    index: 0,
    completed: 0,
    timer: 0,
    timeLeft: 0,
    markerPos: new THREE.Vector3().copy(MISSIONS[0].target),
    started: false,
    fareIndex: 0,
    fareTimeLeft: 0,
    vipPos: new THREE.Vector3().copy(MISSIONS[4].clientStart),
    vipWalking: false,
    smugglerStage: 0,
    photoIndex: 0,
    photosTaken: 0,

    current() {
      return m.index < MISSIONS.length ? MISSIONS[m.index] : null;
    },

    // Alias used by main.js: the current job object (or null).
    currentJob() {
      return m.current();
    },

    // Reset the moving parts of one job kind.
    resetJobState(job) {
      if (!job) return;
      if (job.kind === 'bodyguard') {
        m.vipPos.copy(job.clientStart);
        vip.position.copy(job.clientStart);
        m.vipWalking = false;
      } else if (job.kind === 'taxi') {
        m.fareIndex = 0;
        m.fareTimeLeft = job.fareTime || 60;
      } else if (job.kind === 'smuggler') {
        m.smugglerStage = 0;
        for (const b of roadblocks) b.visible = false;
      } else if (job.kind === 'shutterbug') {
        m.photoIndex = 0;
        m.photosTaken = 0;
      }
      m.timeLeft = job.timeLimit || 0;
    },

    // Put the beacon where the current job (or stage) needs it.
    placeMarker() {
      const job = m.current();
      if (!job) {
        marker.visible = false;
        vip.visible = false;
        m.markerPos.set(0, 0, 0);
        return;
      }
      marker.visible = job.kind !== 'getaway';
      if (job.kind === 'bodyguard') {
        vip.visible = true;
        m.markerPos.copy(m.vipPos);
        marker.position.copy(m.vipPos);
      } else if (job.kind === 'taxi') {
        vip.visible = false;
        const fare = job.fares[Math.min(m.fareIndex, job.fares.length - 1)];
        m.markerPos.copy(fare);
        marker.position.copy(fare);
      } else if (job.kind === 'smuggler') {
        vip.visible = false;
        const dest = m.smugglerStage === 0 ? job.pickup : job.target;
        m.markerPos.copy(dest);
        marker.position.copy(dest);
      } else if (job.kind === 'shutterbug') {
        vip.visible = false;
        const spot = job.spots[Math.min(m.photoIndex, job.spots.length - 1)];
        m.markerPos.copy(spot);
        marker.position.copy(spot);
      } else {
        vip.visible = false;
        m.markerPos.copy(job.target);
        marker.position.copy(job.target);
      }
    },

    // Alias used by main.js: start a job by index.
    start(index) {
      return m.startMission(index);
    },

    startMission(i) {
      const clamped = clamp(Math.floor(i) || 0, 0, MISSIONS.length);
      m.index = clamped;
      m.completed = clamped;
      m.timer = 0;
      m.started = true;
      const job = m.current();
      if (job) {
        m.resetJobState(job);
      } else {
        m.timeLeft = 0;
      }
      m.placeMarker();
      return job;
    },

    restartCurrent() {
      const job = m.current();
      m.timer = 0;
      if (job) m.resetJobState(job);
      m.placeMarker();
      return job;
    },

    // Shared finish path: advance the counter, arm the next job's heat.
    completeJob(events) {
      const job = m.current();
      if (!job) return events;
      for (const b of roadblocks) b.visible = false;
      events.completed = job;
      events.reward = job.reward;
      m.completed = m.index + 1;
      m.index += 1;
      const next = m.current();
      if (next) {
        m.timer = 0;
        m.resetJobState(next);
        if (next.heatOnStart) events.heat = next.heatOnStart;
      } else {
        m.timeLeft = 0;
      }
      m.placeMarker();
      return events;
    },

    // Shared timeout path: the job fails and resets in place.
    failJob(events) {
      const job = m.current();
      m.timer = 0;
      if (job) m.resetJobState(job);
      events.failed = true;
      m.placeMarker();
      return events;
    },

    objectiveText(playerPos) {
      const job = m.current();
      if (!job) {
        return 'All jobs done — Solmar City is yours. Free roam!';
      }
      const head = `JOB ${m.index + 1}/12 — ${job.title}: `;
      const timed = job.timeLimit ? ` — ${ceilSeconds(m.timeLeft)}s left` : '';
      if (job.kind === 'bodyguard') {
        const toSafe = wholeMetres(m.vipPos, job.target);
        const near = flatDist(playerPos, m.vipPos) < VIP_FOLLOW_RANGE;
        let line = `${head}${job.briefing} Client is ${toSafe}m from safety`;
        if (!near) line += ' — GET CLOSER, he stopped!';
        return line + timed;
      }
      if (job.kind === 'taxi') {
        const fare = job.fares[Math.min(m.fareIndex, job.fares.length - 1)];
        const d = wholeMetres(playerPos, fare);
        return `${head}Fare ${m.fareIndex + 1}/3 — pick up the rider (${d}m) — ${ceilSeconds(m.fareTimeLeft)}s left`;
      }
      if (job.kind === 'smuggler') {
        if (m.smugglerStage === 0) {
          const d = wholeMetres(playerPos, job.pickup);
          return `${head}Pick up the crate at the marina pier (${d}m)${timed}`;
        }
        const d = wholeMetres(playerPos, job.target);
        return `${head}Crate aboard — run it to the east docks (${d}m), roadblocks ahead!${timed}`;
      }
      if (job.kind === 'getaway') {
        return `${head}Stay free — ${ceilSeconds(m.timeLeft)}s until the heat dies. Lose the patrol cars!`;
      }
      if (job.kind === 'boat') {
        const d = wholeMetres(playerPos, job.target);
        return `${head}Boat delivery — sail to the island jetty (${d}m), arrive by boat${timed}`;
      }
      if (job.kind === 'lighthouse') {
        const d = wholeMetres(playerPos, job.target);
        return `${head}Light the lighthouse on the island (${d}m)${timed}`;
      }
      if (job.kind === 'turf') {
        const left = turfHook ? turfHook() : 0;
        return `${head}Clear the Sharks out of their turf — ${left} rival(s) left standing`;
      }
      if (job.kind === 'shutterbug') {
        const spot = job.spots[Math.min(m.photoIndex, job.spots.length - 1)];
        const name = PHOTO_SPOT_NAMES[Math.min(m.photoIndex, PHOTO_SPOT_NAMES.length - 1)];
        const d = wholeMetres(playerPos, spot);
        return `${head}Photo ${m.photoIndex + 1}/3 — ${name} (${d}m) — press C to snap it`;
      }
      const d = wholeMetres(playerPos, job.target);
      return `${head}${job.briefing} (${d}m)${timed}`;
    },

    listText() {
      const lines = [];
      for (let n = 0; n < MISSIONS.length; n += 1) {
        const job = MISSIONS[n];
        let state = 'LOCKED';
        if (n < m.completed) state = 'DONE';
        else if (n === m.index) state = 'ACTIVE';
        lines.push(`${n + 1}. ${job.title} — $${job.reward} — ${state}`);
      }
      return lines.join('\n');
    },

    sideJobsText(s) {
      const out = ['— Side hustles —'];
      const sys = s || {};
      if (sys.fishing) {
        const caught = sys.fishing.caught ?? sys.fishing.totalCaught ?? 0;
        const earned = sys.fishing.earned ?? sys.fishing.totalEarned ?? 0;
        out.push(`Fishing: ${caught} caught · $${earned} earned`);
      }
      if (sys.races) {
        const wins = sys.races.wins ?? 0;
        let bestCount = 0;
        if (Array.isArray(sys.races.bestTimes)) {
          bestCount = sys.races.bestTimes.filter((t) => t != null).length;
        } else if (sys.races.bestCount != null) {
          bestCount = sys.races.bestCount;
        } else if (sys.races.best) {
          bestCount = Object.values(sys.races.best).filter((t) => t != null).length;
        }
        out.push(`Races: ${wins} won · best ${bestCount}/3 routes`);
      }
      if (sys.delivery) {
        const done = sys.delivery.deliveries ?? sys.delivery.done ?? 0;
        const tips = sys.delivery.tipsEarned ?? sys.delivery.tips ?? 0;
        out.push(`Courier: ${done} delivered · $${tips} in tips`);
      }
      if (sys.casino) {
        const won = sys.casino.won ?? 0;
        const lost = sys.casino.lost ?? 0;
        out.push(`Casino: won $${won} · lost $${lost}`);
      }
      if (sys.housing) {
        const owned = Array.isArray(sys.housing.owned)
          ? sys.housing.owned.length
          : (sys.housing.ownedCount ?? 0);
        out.push(`Safehouses: ${owned}/3 owned`);
      }
      if (sys.pets) {
        const snacks = sys.pets.snacksFed ?? sys.pets.snacks ?? 0;
        const found = sys.pets.packagesFound ?? sys.pets.found ?? 0;
        out.push(`Biscuit: ${snacks} snacks · ${found} packages sniffed out`);
      }
      return out.join('\n');
    },

    armSmugglerDelivery() {
      const job = m.current();
      if (!job || job.kind !== 'smuggler') return;
      m.smugglerStage = 1;
      for (const b of roadblocks) b.visible = true;
      m.placeMarker();
    },

    snapPhoto(playerPos) {
      const events = {
        photoDone: false,
        photoReward: 0,
        tooFar: false,
        completed: null,
        reward: 0,
        heat: 0,
      };
      const job = m.current();
      if (!job || job.kind !== 'shutterbug') return events;
      const spot = job.spots[Math.min(m.photoIndex, job.spots.length - 1)];
      if (flatDist(playerPos, spot) > job.radius) {
        events.tooFar = true;
        return events;
      }
      m.photosTaken += 1;
      m.photoIndex += 1;
      events.photoDone = true;
      events.photoReward = job.photoReward;
      if (m.photoIndex >= job.spots.length) {
        const done = emptyEvents();
        done.photoDone = true;
        done.photoReward = job.photoReward;
        m.completeJob(done);
        events.completed = done.completed;
        events.reward = done.reward;
        events.heat = done.heat;
        return events;
      }
      m.placeMarker();
      return events;
    },

    setLighthouseHook(fn) {
      lighthouseHook = typeof fn === 'function' ? fn : null;
    },

    setTurfHook(fn) {
      turfHook = typeof fn === 'function' ? fn : null;
    },

    update(dt, playerPos, opts) {
      const events = emptyEvents();
      const job = m.current();
      // The beacon always bobs and spins, even between jobs.
      m.timer += dt;
      gem.position.y = 6 + Math.sin(m.timer * 2.2) * 0.7;
      gem.rotation.y += dt * 1.5;
      if (!job) return events;
      const options = opts || {};
      const inBoat = !!options.inBoat;

      // Timed jobs share one countdown; the per-kind blocks below use it.
      const tickTimer = () => {
        if (!job.timeLimit) return false;
        m.timeLeft -= dt;
        if (m.timeLeft <= 0) {
          m.timeLeft = 0;
          return true;
        }
        return false;
      };

      if (job.kind === 'boat') {
        if (tickTimer()) return m.failJob(events);
        if (inBoat && flatDist(playerPos, job.target) <= job.radius) {
          return m.completeJob(events);
        }
        return events;
      }

      if (job.kind === 'lighthouse') {
        if (tickTimer()) return m.failJob(events);
        if (flatDist(playerPos, job.target) <= job.radius) {
          if (lighthouseHook) lighthouseHook();
          return m.completeJob(events);
        }
        return events;
      }

      if (job.kind === 'turf') {
        if (turfHook && turfHook() === 0) {
          return m.completeJob(events);
        }
        return events;
      }

      if (job.kind === 'smuggler') {
        if (tickTimer()) {
          m.resetJobState(job);
          m.placeMarker();
          events.failed = true;
          return events;
        }
        if (m.smugglerStage === 0) {
          if (flatDist(playerPos, job.pickup) <= job.radius) {
            m.smugglerStage = 1;
            events.pickup = true;
            events.heat = job.heatOnPickup || 0;
            for (const b of roadblocks) b.visible = true;
            m.placeMarker();
          }
          return events;
        }
        if (flatDist(playerPos, job.target) <= job.radius) {
          return m.completeJob(events);
        }
        return events;
      }

      if (job.kind === 'getaway') {
        if (tickTimer()) {
          // Surviving the full countdown IS the win: the heat dies.
          m.timeLeft = 0;
          return m.completeJob(events);
        }
        return events;
      }

      if (job.kind === 'shutterbug') {
        return events;
      }

      if (job.kind === 'bodyguard') {
        if (tickTimer()) {
          m.resetJobState(job);
          m.placeMarker();
          events.failed = true;
          return events;
        }
        const near = flatDist(playerPos, m.vipPos) < VIP_FOLLOW_RANGE;
        m.vipWalking = near;
        if (near) {
          const dx = job.target.x - m.vipPos.x;
          const dz = job.target.z - m.vipPos.z;
          const len = Math.sqrt(dx * dx + dz * dz);
          if (len > 0.001) {
            const step = Math.min(VIP_WALK_SPEED * dt, len);
            m.vipPos.x += (dx / len) * step;
            m.vipPos.z += (dz / len) * step;
            vip.position.copy(m.vipPos);
          }
        }
        marker.position.copy(m.vipPos);
        m.markerPos.copy(m.vipPos);
        if (flatDist(m.vipPos, job.target) <= job.radius) {
          return m.completeJob(events);
        }
        return events;
      }

      if (job.kind === 'taxi') {
        m.fareTimeLeft -= dt;
        if (m.fareTimeLeft <= 0) {
          m.fareTimeLeft = 0;
          m.fareIndex = 0;
          m.fareTimeLeft = job.fareTime || 60;
          m.placeMarker();
          events.failed = true;
          return events;
        }
        const fare = job.fares[Math.min(m.fareIndex, job.fares.length - 1)];
        if (flatDist(playerPos, fare) <= job.radius) {
          events.fareDone = true;
          events.fareReward = job.fareReward;
          m.fareIndex += 1;
          m.fareTimeLeft = job.fareTime || 60;
          if (m.fareIndex >= job.fares.length) {
            return m.completeJob(events);
          }
          m.placeMarker();
        }
        return events;
      }

      // Plain drive jobs.
      if (tickTimer()) {
        return m.failJob(events);
      }
      if (flatDist(playerPos, job.target) <= job.radius) {
        return m.completeJob(events);
      }
      return events;
    },
  };

  // Keep the marker's shared position in sync with the beacon mesh.
  m.markerPos.copy(marker.position);
  return m;
}

// City bounds, re-exported for callers that stage jobs against the grid.
export const MISSION_CITY = CITY;
