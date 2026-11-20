// delivery.js — courier side-jobs for Solmar City.
// Three depots around town hand out parcels. Pick one up with E, then
// run it to the drop point before the parcel timer runs out — on foot
// or by car. Fast deliveries earn a tip on top of the base pay: $25 to
// $100 depending on how much time is left on the clock when the parcel
// lands. Deliveries and tips are saved with the game.
import * as THREE from 'three';

// Three depots, spread across the city so no two runs feel the same.
export const DEPOTS = [
  { id: 'north', name: 'North Depot', pos: new THREE.Vector3(-124, 0, -62) },
  { id: 'market', name: 'Market Depot', pos: new THREE.Vector3(62, 0, 124) },
  { id: 'docks', name: 'Docks Depot', pos: new THREE.Vector3(186, 0, 62) },
];

// Drop points: doorsteps, kiosks and corners all over Solmar.
const DROP_POINTS = [
  new THREE.Vector3(-62, 0, -186),
  new THREE.Vector3(124, 0, -124),
  new THREE.Vector3(-186, 0, 62),
  new THREE.Vector3(0, 0, -124),
  new THREE.Vector3(186, 0, 186),
  new THREE.Vector3(-124, 0, 186),
  new THREE.Vector3(62, 0, -186),
  new THREE.Vector3(-186, 0, -124),
];

const PICKUP_RANGE = 6;
const DROP_RANGE = 8;
const PARCEL_TIME = 90;
const BASE_PAY = 120;
const TIP_MIN = 25;
const TIP_MAX = 100;

function flatDist(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function clamp01(v) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

// Tip scales with the time left when the parcel lands: a full clock is
// worth the whole $100, a photo finish is worth the $25 floor.
function tipFor(timeLeft, limit) {
  const frac = clamp01(timeLeft / Math.max(1, limit));
  return TIP_MIN + Math.round((TIP_MAX - TIP_MIN) * frac);
}

export function createDelivery(scene) {
  // -- Depot visuals: a crate stack, a sign pole and a floating box. ---
  const depotGroups = [];
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6b3f });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47 });
  const parcelMat = new THREE.MeshStandardMaterial({ color: 0xe8b13c });
  for (const depot of DEPOTS) {
    const g = new THREE.Group();
    const stack = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 2.2), crateMat);
    stack.position.y = 0.7;
    g.add(stack);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 1.5), crateMat);
    top.position.set(0.3, 1.9, -0.2);
    g.add(top);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.2, 8), poleMat);
    pole.position.set(1.6, 2.1, 1.2);
    g.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), parcelMat);
    flag.position.set(1.6, 4.4, 1.2);
    g.add(flag);
    g.position.copy(depot.pos);
    scene.add(g);
    depotGroups.push(g);
  }

  // -- Drop-point beacon: a small pulsing parcel marker. -----------------
  const dropBeacon = new THREE.Group();
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0x7dd8ff });
  const beaconBox = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), beaconMat);
  beaconBox.position.y = 2.2;
  dropBeacon.add(beaconBox);
  const beaconRing = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.2, 24),
    new THREE.MeshBasicMaterial({
      color: 0x7dd8ff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    }),
  );
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.y = 0.15;
  dropBeacon.add(beaconRing);
  dropBeacon.visible = false;
  scene.add(dropBeacon);

  const d = {
    deliveries: 0,
    tipsEarned: 0,
    parcel: null,
    dropIndex: 0,
    bobPhase: 0,

    // The depot nearest to a position, or null when none is in range.
    // main.js calls this for the E key.
    nearDepot(pos) {
      if (!pos) return null;
      let best = null;
      let bestDist = PICKUP_RANGE;
      for (const depot of DEPOTS) {
        const dist = flatDist(pos, depot.pos);
        if (dist <= bestDist) {
          best = depot;
          bestDist = dist;
        }
      }
      return best;
    },

    // Start a parcel at a depot. Returns the parcel, or null when there
    // is already one in hand or no depot is close enough.
    pickUp(pos) {
      if (d.parcel) return null;
      const depot = d.nearDepot(pos);
      if (!depot) return null;
      const drop = DROP_POINTS[d.dropIndex % DROP_POINTS.length];
      d.dropIndex += 1;
      d.parcel = {
        depotId: depot.id,
        depotName: depot.name,
        dropPos: drop.clone(),
        timeLeft: PARCEL_TIME,
        limit: PARCEL_TIME,
      };
      dropBeacon.position.copy(drop);
      dropBeacon.visible = true;
      return d.parcel;
    },

    // Per-frame tick. The focus position is Mara on foot or her car.
    // Returns delivery events for the main loop to bank. The dt argument
    // is optional (the contract calls update with just the position);
    // when it is missing a single 60fps step is assumed.
    update(focusPos, dt) {
      const step = dt && dt > 0 ? Math.min(dt, 0.05) : 0.016;
      const events = { delivered: false, pay: 0, tip: 0, failed: false };
      d.bobPhase += step;
      if (dropBeacon.visible) {
        beaconBox.position.y = 2.2 + Math.sin(d.bobPhase * 3) * 0.35;
        beaconBox.rotation.y += step * 1.2;
      }
      if (!d.parcel || !focusPos) return events;
      d.parcel.timeLeft -= step;
      if (d.parcel.timeLeft <= 0) {
        d.parcel = null;
        dropBeacon.visible = false;
        events.failed = true;
        return events;
      }
      if (flatDist(focusPos, d.parcel.dropPos) <= DROP_RANGE) {
        const tip = tipFor(d.parcel.timeLeft, d.parcel.limit);
        const pay = BASE_PAY + tip;
        d.deliveries += 1;
        d.tipsEarned += tip;
        d.parcel = null;
        dropBeacon.visible = false;
        events.delivered = true;
        events.pay = pay;
        events.tip = tip;
      }
      return events;
    },

    // One-line status for the HUD side panel.
    statusText() {
      if (d.parcel) {
        const secs = Math.max(0, Math.ceil(d.parcel.timeLeft));
        return `Courier: parcel to drop — ${secs}s left · ${d.deliveries} delivered · $${d.tipsEarned} in tips`;
      }
      return `Courier: ${d.deliveries} delivered · $${d.tipsEarned} in tips — grab a parcel at a depot (E)`;
    },

    // Minimap markers: the three depots, plus the live drop point.
    markers() {
      const out = DEPOTS.map((depot) => ({
        x: depot.pos.x,
        z: depot.pos.z,
        kind: 'depot',
        label: depot.name,
      }));
      if (d.parcel) {
        out.push({
          x: d.parcel.dropPos.x,
          z: d.parcel.dropPos.z,
          kind: 'delivery-drop',
          label: 'Parcel drop',
        });
      }
      return out;
    },

    saveData() {
      return { deliveries: d.deliveries, tipsEarned: d.tipsEarned };
    },

    loadData(data) {
      const saved = data || {};
      d.deliveries = saved.deliveries || 0;
      d.tipsEarned = saved.tipsEarned || saved.tips || 0;
      d.parcel = null;
      dropBeacon.visible = false;
    },
  };

  return d;
}
