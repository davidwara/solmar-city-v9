import * as THREE from 'three';

// Buyable safehouses — three properties, each with a door, a small
// furnished interior room, and a respawn point once Mara has slept there.

export const HOUSE_DEFS = [
  {
    name: 'Beach Hut',
    price: 1500,
    door: [62, 0, 198],
    inward: [0, 0, -1],
    wall: 0xd8c49a,
    roof: 0x8a5a2b,
  },
  {
    name: 'Downtown Loft',
    price: 4000,
    door: [-58, 0, -124],
    inward: [-1, 0, 0],
    wall: 0x9aa5b1,
    roof: 0x2e3440,
  },
  {
    name: 'Island Villa',
    price: 8000,
    door: [40, 0, 340],
    inward: [0, 0, 1],
    wall: 0xf2e3c6,
    roof: 0xb0483e,
  },
];

const DOOR_RANGE = 4;

function fmt(n) {
  return '$' + Math.floor(n || 0).toLocaleString('en-US');
}

function flatDist(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// One house shell: floor, three full walls, a front wall with a door gap,
// a pitched roof, and furniture (bed, table, lamp, rug) inside.
function buildHouse(scene, def) {
  const group = new THREE.Group();
  group.position.set(def.door[0], 0, def.door[2]);
  // Face the door outward: rotate so local +z points out of the door.
  const yaw = Math.atan2(-def.inward[0], -def.inward[2]);
  group.rotation.y = yaw;

  const wallMat = new THREE.MeshLambertMaterial({ color: def.wall });
  const roofMat = new THREE.MeshLambertMaterial({ color: def.roof });
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x6b4f2a });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x3a2c1c });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(7, 0.25, 6), floorMat);
  floor.position.y = 0.12;
  group.add(floor);

  const back = new THREE.Mesh(new THREE.BoxGeometry(7, 3.1, 0.3), wallMat);
  back.position.set(0, 1.55, -2.85);
  group.add(back);

  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.1, 6), wallMat);
  sideL.position.set(-3.35, 1.55, 0);
  group.add(sideL);

  const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.1, 6), wallMat);
  sideR.position.set(3.35, 1.55, 0);
  group.add(sideR);

  // Front wall in two segments, leaving a 1.4m door gap in the middle.
  const frontL = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.1, 0.3), wallMat);
  frontL.position.set(-2.1, 1.55, 2.85);
  group.add(frontL);
  const frontR = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.1, 0.3), wallMat);
  frontR.position.set(2.1, 1.55, 2.85);
  group.add(frontR);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.3), wallMat);
  lintel.position.set(0, 2.65, 2.85);
  group.add(lintel);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.4, 2.0, 4), roofMat);
  roof.position.y = 4.1;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);

  // Glowing door marker so the entrance reads at night.
  const doorGlow = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 2.3, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.35 }),
  );
  doorGlow.position.set(0, 1.15, 3.02);
  group.add(doorGlow);

  // Furniture: bed against the back wall, table + lamp, rug in the middle.
  const bedMat = new THREE.MeshLambertMaterial({ color: 0x4d7ea8 });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 2.4), bedMat);
  bed.position.set(-1.9, 0.48, -1.5);
  group.add(bed);
  const pillow = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.18, 0.5),
    new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
  );
  pillow.position.set(-1.9, 0.78, -2.4);
  group.add(pillow);

  const table = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.12, 0.9),
    new THREE.MeshLambertMaterial({ color: 0x7a5230 }),
  );
  table.position.set(1.8, 0.85, -1.2);
  group.add(table);
  const tableLeg = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.75, 0.16),
    trimMat,
  );
  tableLeg.position.set(1.8, 0.45, -1.2);
  group.add(tableLeg);

  const lampPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.09, 0.7, 8),
    trimMat,
  );
  lampPost.position.set(1.8, 1.25, -1.2);
  group.add(lampPost);
  const lampBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
  );
  lampBulb.position.set(1.8, 1.68, -1.2);
  group.add(lampBulb);

  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.06, 3.2),
    new THREE.MeshLambertMaterial({ color: 0x8a3b4d }),
  );
  rug.position.set(0, 0.28, 0.4);
  group.add(rug);

  scene.add(group);
  return group;
}

export function createHousing(scene) {
  const houses = HOUSE_DEFS.map((def) => {
    const group = buildHouse(scene, def);
    const door = new THREE.Vector3(def.door[0], 0, def.door[2]);
    const inward = new THREE.Vector3(def.inward[0], 0, def.inward[2]);
    const insidePos = door.clone().addScaledVector(inward, 1.5);
    const streetPos = door.clone().addScaledVector(inward, -2.6);
    return {
      name: def.name,
      price: def.price,
      door,
      inward,
      insidePos,
      streetPos,
      owned: false,
      slept: false,
      group,
    };
  });

  // One marker per house for the minimap.
  const markers = houses.map((house) => ({
    x: house.door.x,
    z: house.door.z,
    name: house.name,
    owned: house.owned,
    kind: 'house',
  }));

  let inside = false;
  let currentHouse = null;
  let sleptIn = null;
  let respawnPos = null;

  function nearDoor(pos) {
    if (!pos) return null;
    for (const house of houses) {
      if (flatDist(pos.x, pos.z, house.door.x, house.door.z) < DOOR_RANGE) {
        return house;
      }
    }
    return null;
  }

  function doorPrompt(house) {
    if (!house) return '';
    if (house.owned) return house.name + ' — press E to step inside';
    return house.name + ' — ' + fmt(house.price) + ' — press E to buy';
  }

  function buy(house, money) {
    if (!house) return 'owned';
    if (house.owned) return 'owned';
    if (typeof money === 'number' && money < house.price) return 'broke';
    house.owned = true;
    const marker = markers.find((m) => m.name === house.name);
    if (marker) marker.owned = true;
    return 'ok';
  }

  // Step inside the furnished room. The house becomes the respawn point.
  function enter(house) {
    if (!house || !house.owned) return null;
    inside = true;
    currentHouse = house;
    house.slept = true;
    sleptIn = house;
    respawnPos = house.door.clone();
    return house.insidePos.clone();
  }

  // Step back out to the street in front of the door.
  function exit() {
    if (!currentHouse) return null;
    const out = currentHouse.streetPos.clone();
    inside = false;
    currentHouse = null;
    return out;
  }

  function statusText() {
    const owned = houses.filter((h) => h.owned).length;
    let text = 'Homes ' + owned + '/3';
    if (sleptIn) text += ' — Home: ' + sleptIn.name;
    return text;
  }

  function save() {
    return {
      owned: houses.filter((h) => h.owned).map((h) => h.name),
      sleptIn: sleptIn ? sleptIn.name : null,
    };
  }

  function load(data) {
    const owned = (data && data.owned) || [];
    for (const house of houses) {
      house.owned = owned.indexOf(house.name) !== -1;
    }
    for (const marker of markers) {
      const house = houses.find((h) => h.name === marker.name);
      marker.owned = house ? house.owned : false;
    }
    const sleptName = data && data.sleptIn;
    const sleptHouse = sleptName
      ? houses.find((h) => h.name === sleptName && h.owned)
      : null;
    if (sleptHouse) {
      sleptIn = sleptHouse;
      sleptHouse.slept = true;
      respawnPos = sleptHouse.door.clone();
    }
  }

  // Alias matching the main.js side-hustle save contract.
  function getSaveData() {
    return save();
  }

  function loadSaveData(data) {
    load(data);
  }

  return {
    houses,
    markers,
    nearDoor,
    doorPrompt,
    buy,
    enter,
    exit,
    statusText,
    save,
    load,
    getSaveData,
    loadSaveData,
    get inside() {
      return inside;
    },
    get sleptIn() {
      return sleptIn;
    },
    get respawnPos() {
      return respawnPos;
    },
  };
}
