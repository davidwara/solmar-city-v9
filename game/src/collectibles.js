import * as THREE from 'three';

// 15 hidden packages scattered around Solmar City — rooftops, alleys,
// the beach, the marina, the docks and the second island. Walk or drive
// through one to collect it. Each package is +$100; all 15 pay +$1,000.

export const PACKAGE_COUNT = 15;
export const PACKAGE_VALUE = 100;
export const PACKAGE_BONUS = 1000;
export const PICKUP_RANGE = 3;

const PACKAGE_SPOTS = [
  // Alleys and street corners (ground level).
  [-180, 1.0, -180],
  [180, 1.0, -180],
  [-180, 1.0, 180],
  [180, 1.0, 180],
  [-62, 1.0, 62],
  [124, 1.0, -62],
  // Beach, marina and docks.
  [0, 1.0, 205],
  [-150, 1.0, 225],
  [150, 1.0, 186],
  // The second island.
  [40, 1.0, 380],
  // Low rooftops and awnings around the city.
  [62, 2.6, -124],
  [-124, 2.6, 0],
  [0, 2.6, 124],
  [186, 2.6, 62],
  [-62, 2.6, 186],
];

function flatDist(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// A small glowing parcel: gold box, ribbon band, and a soft halo that
// brightens after dark so the packages can be hunted at night.
function buildPackageMesh() {
  const group = new THREE.Group();

  const parcel = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.45, 0.55),
    new THREE.MeshLambertMaterial({
      color: 0xd8a13c,
      emissive: 0x8a5f10,
    }),
  );
  parcel.position.y = 0.25;
  group.add(parcel);

  const ribbon = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.1, 0.58),
    new THREE.MeshLambertMaterial({ color: 0xb03030 }),
  );
  ribbon.position.y = 0.32;
  group.add(ribbon);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 12, 10),
    new THREE.MeshBasicMaterial({
      color: 0xffc94d,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.position.y = 0.3;
  group.add(glow);

  return { group, glow };
}

export function createCollectibles(scene, seed) {
  void seed;
  const packages = PACKAGE_SPOTS.map((spot, index) => {
    const mesh = buildPackageMesh();
    mesh.group.position.set(spot[0], spot[1], spot[2]);
    scene.add(mesh.group);
    return {
      index,
      pos: new THREE.Vector3(spot[0], spot[1], spot[2]),
      collected: false,
      mesh: mesh.group,
      glow: mesh.glow,
    };
  });

  let isNight = false;
  let pulse = 0;

  function collectedCount() {
    let n = 0;
    for (const pack of packages) if (pack.collected) n++;
    return n;
  }

  function setNight(night) {
    isNight = !!night;
  }

  // Spin the parcels and breathe the glow; the glow is stronger at night.
  function update(dt) {
    pulse += dt || 0;
    const base = isNight ? 0.5 : 0.2;
    for (const pack of packages) {
      if (pack.collected) continue;
      pack.mesh.rotation.y += (dt || 0) * 1.4;
      const breathe = 1 + Math.sin(pulse * 3 + pack.index) * 0.14;
      pack.glow.scale.setScalar(breathe);
      pack.glow.material.opacity = base + Math.sin(pulse * 3 + pack.index) * 0.06;
    }
  }

  // Walk or drive through a package to collect it. Returns it, or null.
  function pickup(pos) {
    if (!pos) return null;
    for (const pack of packages) {
      if (pack.collected) continue;
      const dx = pos.x - pack.pos.x;
      const dy = (pos.y || 0) - pack.pos.y;
      const dz = pos.z - pack.pos.z;
      if (dx * dx + dy * dy + dz * dz < PICKUP_RANGE * PICKUP_RANGE) {
        pack.collected = true;
        pack.mesh.visible = false;
        return pack;
      }
    }
    return null;
  }

  // Alias: main.js calls collectibles.pickupCheck(position).
  function pickupCheck(pos) {
    return pickup(pos);
  }

  function packagesText() {
    return 'Packages ' + collectedCount() + '/' + PACKAGE_COUNT;
  }

  // True once every package is found — main.js pays the +$1,000 bonus.
  function allCollected() {
    return collectedCount() >= PACKAGE_COUNT;
  }

  // Uncollected packages near a position, for the minimap dots.
  function nearbyDots(pos, radius) {
    const range = typeof radius === 'number' ? radius : 60;
    const dots = [];
    if (!pos) return dots;
    for (const pack of packages) {
      if (pack.collected) continue;
      if (flatDist(pos.x, pos.z, pack.pos.x, pack.pos.z) < range) {
        dots.push({ x: pack.pos.x, z: pack.pos.z });
      }
    }
    return dots;
  }

  function save() {
    return {
      collected: packages.filter((p) => p.collected).map((p) => p.index),
    };
  }

  function load(data) {
    const done = (data && data.collected) || [];
    for (const pack of packages) {
      if (done.indexOf(pack.index) !== -1) {
        pack.collected = true;
        pack.mesh.visible = false;
      }
    }
  }

  return {
    packages,
    update,
    setNight,
    pickup,
    pickupCheck,
    packagesText,
    allCollected,
    nearbyDots,
    save,
    load,
    get collectedCount() {
      return collectedCount();
    },
  };
}
