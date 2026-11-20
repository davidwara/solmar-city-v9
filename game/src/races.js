// races.js — checkpoint street races for Solmar City.
// Three routes start at the chequered flag by the garage. Press T at
// the flag to pick a route: a 3-2-1-GO countdown, then a timer runs
// while Mara threads the checkpoint gates in order. Finish all the
// gates to bank the prize — $300, $500 or $800 — and the best time per
// route is saved, so every route has a record to beat.
import * as THREE from 'three';

// The three routes: names, gate positions in order, cash prizes.
export const ROUTES = [
  {
    id: 'harbour-sprint',
    name: 'Harbour Sprint',
    prize: 300,
    gates: [
      new THREE.Vector3(-124, 0, 186),
      new THREE.Vector3(-124, 0, 0),
      new THREE.Vector3(-62, 0, -124),
      new THREE.Vector3(62, 0, -124),
      new THREE.Vector3(124, 0, 0),
    ],
  },
  {
    id: 'downtown-loop',
    name: 'Downtown Loop',
    prize: 500,
    gates: [
      new THREE.Vector3(62, 0, 124),
      new THREE.Vector3(186, 0, 124),
      new THREE.Vector3(186, 0, -62),
      new THREE.Vector3(0, 0, -186),
      new THREE.Vector3(-186, 0, -62),
      new THREE.Vector3(-186, 0, 124),
      new THREE.Vector3(0, 0, 124),
    ],
  },
  {
    id: 'coast-grand-tour',
    name: 'Coast Grand Tour',
    prize: 800,
    gates: [
      new THREE.Vector3(124, 0, 186),
      new THREE.Vector3(0, 0, 186),
      new THREE.Vector3(-186, 0, 186),
      new THREE.Vector3(-186, 0, -186),
      new THREE.Vector3(0, 0, -186),
      new THREE.Vector3(186, 0, -186),
      new THREE.Vector3(186, 0, 62),
      new THREE.Vector3(62, 0, 62),
    ],
  },
];

// Chequered start flag by the garage lot.
export const RACE_FLAG_POS = new THREE.Vector3(124, 0, 124);

const GATE_RADIUS = 12;
const FLAG_RANGE = 7;
const COUNTDOWN_START = 3.0;

function flatDist(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

// mm:ss.t — the race clock format used by the HUD and the finish toast.
export function formatRaceTime(seconds) {
  const total = Math.max(0, seconds);
  const mins = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  const tenths = Math.floor((total * 10) % 10);
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return `${mm}:${ss}.${tenths}`;
}

function resolveRoute(route) {
  if (!route) return null;
  if (typeof route === 'number') return ROUTES[route] || null;
  if (typeof route === 'string') {
    return ROUTES.find((r) => r.id === route) || null;
  }
  if (route.gates) return route;
  return null;
}

export function createRaces(scene) {
  // -- Start flag: a pole with a little chequered banner. -----------------
  const flagGroup = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.4, 8), poleMat);
  pole.position.y = 2.7;
  flagGroup.add(pole);
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const square = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.55, 0.06),
        (row + col) % 2 === 0 ? darkMat : lightMat,
      );
      square.position.set(0.35 + col * 0.55, 4.4 - row * 0.55, 0);
      flagGroup.add(square);
    }
  }
  flagGroup.position.copy(RACE_FLAG_POS);
  scene.add(flagGroup);

  // -- Gate markers: one glowing ring per gate of the active route. -----
  // Built once per route so the meshes can be shown/hidden per gate.
  const gateGroups = [];
  for (const route of ROUTES) {
    const perRoute = [];
    for (const gate of route.gates) {
      const g = new THREE.Group();
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffb020,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.45, 8, 28), ringMat);
      ring.rotation.y = Math.PI / 2;
      ring.position.y = 2.4;
      g.add(ring);
      const postMat = new THREE.MeshStandardMaterial({ color: 0xffb020 });
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 4.8, 8), postMat);
        post.position.set(0, 2.4, side * 4.5);
        g.add(post);
      }
      g.position.copy(gate);
      g.visible = false;
      scene.add(g);
      perRoute.push({ group: g, ring, ringMat });
    }
    gateGroups.push(perRoute);
  }

  const r = {
    bestTimes: [null, null, null],
    wins: 0,
    route: null,
    routeIndex: -1,
    gateIndex: 0,
    raceTime: 0,
    countdown: 0,
    countingDown: false,
    racing: false,
    lastCount: -1,
    spinPhase: 0,

    // True when a position is close enough to the flag to start a race.
    nearFlag(pos, range) {
      if (!pos) return false;
      return flatDist(pos, RACE_FLAG_POS) <= (range || FLAG_RANGE);
    },

    // Start a route. Accepts a route object, an id string or an index.
    // Called by the T key at the flag. Returns true when the countdown
    // actually started.
    start(route) {
      const resolved = resolveRoute(route);
      if (!resolved || r.racing || r.countingDown) return false;
      const idx = ROUTES.indexOf(resolved);
      r.route = resolved;
      r.routeIndex = idx;
      r.gateIndex = 0;
      r.raceTime = 0;
      r.countdown = COUNTDOWN_START;
      r.countingDown = true;
      r.racing = false;
      r.lastCount = -1;
      r.showGates();
      return true;
    },

    // Show the current route's gates; the next gate glows brighter.
    showGates() {
      for (let i = 0; i < gateGroups.length; i += 1) {
        const active = i === r.routeIndex;
        for (let g = 0; g < gateGroups[i].length; g += 1) {
          const entry = gateGroups[i][g];
          entry.group.visible = active;
          entry.ringMat.opacity = g === r.gateIndex ? 0.95 : 0.45;
          entry.ringMat.color.setHex(g === r.gateIndex ? 0xffb020 : 0x9a7a30);
        }
      }
    },

    hideGates() {
      for (const perRoute of gateGroups) {
        for (const entry of perRoute) entry.group.visible = false;
      }
    },

    // Per-frame tick. carPos is the driven car's position (or null when
    // Mara is on foot); inCar says whether she is driving. Returns race
    // events for the main loop to toast and bank. dt is optional — the
    // contract calls update with just the car position and the in-car
    // flag, so a 60fps step is assumed when it is missing.
    update(carPos, inCar, dt) {
      const step = dt && dt > 0 ? Math.min(dt, 0.05) : 0.016;
      const events = {
        countdown: null,
        gate: false,
        gateIndex: 0,
        gatesLeft: 0,
        finished: false,
        prize: 0,
        time: 0,
        best: false,
        failed: false,
      };
      r.spinPhase += step;
      if (r.route && (r.countingDown || r.racing)) {
        const entry = gateGroups[r.routeIndex][r.gateIndex];
        if (entry) entry.ring.rotation.z += step * 1.2;
      }
      if (!r.route) return events;

      if (r.countingDown) {
        r.countdown -= step;
        const whole = Math.min(3, Math.ceil(r.countdown));
        if (whole !== r.lastCount && whole > 0) {
          r.lastCount = whole;
          events.countdown = whole;
        }
        if (r.countdown <= 0) {
          r.countingDown = false;
          r.racing = true;
          r.raceTime = 0;
          events.countdown = 'GO';
        }
        return events;
      }

      if (!r.racing) return events;
      r.raceTime += step;
      if (!carPos || !inCar) return events;
      const gate = r.route.gates[r.gateIndex];
      if (!gate) return events;
      if (flatDist(carPos, gate) <= GATE_RADIUS) {
        r.gateIndex += 1;
        events.gate = true;
        events.gateIndex = r.gateIndex;
        events.gatesLeft = r.route.gates.length - r.gateIndex;
        if (r.gateIndex >= r.route.gates.length) {
          const prize = r.route.prize;
          const time = r.raceTime;
          const prev = r.bestTimes[r.routeIndex];
          const isBest = prev == null || time < prev;
          if (isBest) r.bestTimes[r.routeIndex] = time;
          r.wins += 1;
          events.finished = true;
          events.prize = prize;
          events.time = time;
          events.best = isBest;
          r.route = null;
          r.routeIndex = -1;
          r.gateIndex = 0;
          r.racing = false;
          r.hideGates();
        } else {
          r.showGates();
        }
      }
      return events;
    },

    // One-line status for the HUD side panel.
    statusText() {
      if (r.countingDown) {
        const n = Math.max(1, Math.ceil(r.countdown));
        return `${r.route.name}: ${n}…`;
      }
      if (r.racing && r.route) {
        return `${r.route.name}: gate ${r.gateIndex + 1}/${r.route.gates.length} — ${formatRaceTime(r.raceTime)}`;
      }
      const bests = r.bestTimes
        .map((t, i) => `${ROUTES[i].name.split(' ')[0]} ${t == null ? '—' : formatRaceTime(t)}`)
        .join(' · ');
      return `Races: ${r.wins} won · ${bests} — press T at the flag by the garage`;
    },

    // Minimap markers: the flag, plus the next gate while racing.
    markers() {
      const out = [{ x: RACE_FLAG_POS.x, z: RACE_FLAG_POS.z, kind: 'race-flag', label: 'Race flag' }];
      if (r.route && r.racing) {
        const gate = r.route.gates[r.gateIndex];
        if (gate) {
          out.push({ x: gate.x, z: gate.z, kind: 'race-gate', label: 'Next gate' });
        }
      }
      return out;
    },

    saveData() {
      return { bestTimes: r.bestTimes.slice(), wins: r.wins };
    },

    loadData(data) {
      const saved = data || {};
      if (Array.isArray(saved.bestTimes)) {
        for (let i = 0; i < 3; i += 1) {
          r.bestTimes[i] = saved.bestTimes[i] == null ? null : Number(saved.bestTimes[i]);
        }
      }
      r.wins = saved.wins || 0;
      r.route = null;
      r.routeIndex = -1;
      r.gateIndex = 0;
      r.racing = false;
      r.countingDown = false;
      r.hideGates();
    },
  };

  return r;
}
