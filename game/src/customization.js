import * as THREE from 'three';

// Garage shop — paint, engine and armour for Mara's car, bought at the
// garage lot. The shop renders into the garage overlay DOM ids and talks
// to main.js through the callbacks object.

export const ARMOUR_BONUS = 50;
export const ARMOR_BONUS = 50;
export const ARMOUR_PRICE = 400;
export const GARAGE_POS = new THREE.Vector3(-186, 0, 124);

export const PAINTS = [
  { name: 'Sunset Red', color: 0xd8362a, css: '#d8362a', price: 200 },
  { name: 'Ocean Blue', color: 0x2f6fe0, css: '#2f6fe0', price: 200 },
  { name: 'Lime Rush', color: 0x63c74d, css: '#63c74d', price: 200 },
  { name: 'Solar Yellow', color: 0xf2c230, css: '#f2c230', price: 200 },
  { name: 'Royal Purple', color: 0x8a4fd0, css: '#8a4fd0', price: 200 },
  { name: 'Pearl White', color: 0xececec, css: '#ececec', price: 200 },
];

export const ENGINES = [
  { level: 1, name: 'Engine Mk II', price: 500, topSpeed: 6 },
  { level: 2, name: 'Engine Mk III', price: 1000, topSpeed: 12 },
];

function fmt(n) {
  return '$' + Math.floor(n || 0).toLocaleString('en-US');
}

function el(id) {
  if (typeof document === 'undefined') return null;
  return document.getElementById(id);
}

// The garage lot: an open-front workshop with a floor pad, a workbench
// and a glowing marker ring where the car parks for its tune-up.
function buildGarage(scene) {
  const group = new THREE.Group();
  group.position.copy(GARAGE_POS);

  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.2, 10),
    new THREE.MeshLambertMaterial({ color: 0x4a4a52 }),
  );
  pad.position.y = 0.1;
  group.add(pad);

  const wallMat = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(14, 4.5, 0.4), wallMat);
  back.position.set(0, 2.25, -4.8);
  group.add(back);
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.5, 10), wallMat);
  sideL.position.set(-6.8, 2.25, 0);
  group.add(sideL);
  const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.5, 10), wallMat);
  sideR.position.set(6.8, 2.25, 0);
  group.add(sideR);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 10), wallMat);
  roof.position.y = 4.7;
  group.add(roof);

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(6, 1.1, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xffb020 }),
  );
  sign.position.set(0, 5.4, 0.4);
  group.add(sign);

  const bench = new THREE.Mesh(
    new THREE.BoxGeometry(3, 1.0, 0.8),
    new THREE.MeshLambertMaterial({ color: 0x5a3a22 }),
  );
  bench.position.set(-4.5, 0.6, -3.8);
  group.add(bench);

  const markerRing = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.1, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffb020,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    }),
  );
  markerRing.rotation.x = -Math.PI / 2;
  markerRing.position.y = 0.24;
  group.add(markerRing);

  scene.add(group);
  return group;
}

// Find the car's main body mesh so a paint job has something to recolour:
// prefer a mesh flagged as the body, otherwise the biggest box in the car.
function findBodyMesh(group) {
  if (!group) return null;
  let best = null;
  let bestVolume = 0;
  group.traverse((child) => {
    if (!child.isMesh) return;
    if (child.userData && child.userData.body) {
      best = child;
      bestVolume = Infinity;
      return;
    }
    if (bestVolume === Infinity) return;
    const geo = child.geometry;
    if (geo && geo.parameters && typeof geo.parameters.width === 'number') {
      const vol =
        geo.parameters.width *
        geo.parameters.height *
        geo.parameters.depth;
      if (vol > bestVolume) {
        bestVolume = vol;
        best = child;
      }
    }
  });
  return best;
}

export function createCustomization(scene, callbacks) {
  const cb = callbacks || {};
  buildGarage(scene);

  let paintIndex = 0;
  let engineLevel = 0;
  let armour = false;
  let isOpen = false;

  function money() {
    return typeof cb.getMoney === 'function' ? cb.getMoney() : 0;
  }

  function refreshMoneyLabel() {
    const label = el('garage-money');
    if (label) label.textContent = fmt(money());
  }

  function paintColor() {
    return PAINTS[paintIndex].color;
  }

  function buyPaint(index) {
    const paint = PAINTS[index];
    if (!paint || index === paintIndex) return;
    if (typeof cb.spend === 'function' && !cb.spend(paint.price)) {
      if (typeof cb.onBought === 'function') cb.onBought('Not enough cash for ' + paint.name);
      return;
    }
    paintIndex = index;
    if (typeof cb.onBought === 'function') cb.onBought('Paint fitted: ' + paint.name);
    refreshMoneyLabel();
    render();
  }

  function buyEngine(level) {
    const engine = ENGINES.find((e) => e.level === level);
    if (!engine || level <= engineLevel) return;
    if (typeof cb.spend === 'function' && !cb.spend(engine.price)) {
      if (typeof cb.onBought === 'function') cb.onBought('Not enough cash for ' + engine.name);
      return;
    }
    engineLevel = level;
    if (typeof cb.onBought === 'function') cb.onBought(engine.name + ' fitted (+' + engine.topSpeed + ' top speed)');
    refreshMoneyLabel();
    render();
  }

  function buyArmour() {
    if (armour) return;
    if (typeof cb.spend === 'function' && !cb.spend(ARMOUR_PRICE)) {
      if (typeof cb.onBought === 'function') cb.onBought('Not enough cash for armour');
      return;
    }
    armour = true;
    if (typeof cb.onBought === 'function') cb.onBought('Armour fitted (+' + ARMOUR_BONUS + ' max health)');
    refreshMoneyLabel();
    render();
  }

  function row(label, detail, action, disabled) {
    const div = document.createElement('div');
    div.className = 'garage-row';
    const name = document.createElement('span');
    name.className = 'garage-name';
    name.textContent = label;
    const info = document.createElement('span');
    info.className = 'garage-detail';
    info.textContent = detail;
    const button = document.createElement('button');
    button.className = 'garage-buy';
    button.textContent = action;
    button.disabled = !!disabled;
    div.appendChild(name);
    div.appendChild(info);
    div.appendChild(button);
    return { div, button };
  }

  // Build the shop list from the paint / engine / armour options.
  function render() {
    const list = el('garage-list');
    if (!list) return;
    list.innerHTML = '';
    refreshMoneyLabel();

    const paintHead = document.createElement('div');
    paintHead.className = 'garage-section';
    paintHead.textContent = 'Paint — $200';
    list.appendChild(paintHead);
    PAINTS.forEach((paint, index) => {
      const { div, button } = row(paint.name, fmt(paint.price), index === paintIndex ? 'Fitted' : 'Buy', index === paintIndex);
      const swatch = document.createElement('span');
      swatch.className = 'garage-swatch';
      swatch.style.background = paint.css;
      div.insertBefore(swatch, div.firstChild);
      button.addEventListener('click', () => buyPaint(index));
      list.appendChild(div);
    });

    const engineHead = document.createElement('div');
    engineHead.className = 'garage-section';
    engineHead.textContent = 'Engine';
    list.appendChild(engineHead);
    ENGINES.forEach((engine) => {
      const fitted = engine.level <= engineLevel;
      const { div, button } = row(
        engine.name,
        '+' + engine.topSpeed + ' top speed — ' + fmt(engine.price),
        fitted ? 'Fitted' : 'Buy',
        fitted,
      );
      button.addEventListener('click', () => buyEngine(engine.level));
      list.appendChild(div);
    });

    const armourHead = document.createElement('div');
    armourHead.className = 'garage-section';
    armourHead.textContent = 'Armour';
    list.appendChild(armourHead);
    const armourRow = row(
      'Armour Plating',
      '+' + ARMOUR_BONUS + ' max health — ' + fmt(ARMOUR_PRICE),
      armour ? 'Fitted' : 'Buy',
      armour,
    );
    armourRow.button.addEventListener('click', buyArmour);
    list.appendChild(armourRow.div);
  }

  function open() {
    isOpen = true;
    const overlay = el('garage-overlay');
    if (overlay) overlay.style.display = 'block';
    const closeBtn = el('garage-close');
    if (closeBtn && !closeBtn.dataset.wired) {
      closeBtn.dataset.wired = '1';
      closeBtn.addEventListener('click', () => close());
    }
    render();
  }

  function close() {
    isOpen = false;
    const overlay = el('garage-overlay');
    if (overlay) overlay.style.display = 'none';
    if (typeof cb.onClosed === 'function') cb.onClosed();
  }

  // Apply the saved choices to a car: paint, engine top speed, armour.
  function applyToCar(car) {
    if (!car) return;
    car.paintIndex = paintIndex;
    car.paintColor = paintColor();
    const body = findBodyMesh(car.group);
    if (body && body.material && body.material.color) {
      if (body.material.clone) body.material = body.material.clone();
      body.material.color.setHex(paintColor());
    }
    const engine = ENGINES.find((e) => e.level === engineLevel);
    const bonus = engine ? engine.topSpeed : 0;
    car.engineLevel = engineLevel;
    car.topSpeedBonus = bonus;
    if (typeof car.topSpeed === 'number') {
      if (typeof car.baseTopSpeed !== 'number') car.baseTopSpeed = car.topSpeed;
      car.topSpeed = car.baseTopSpeed + bonus;
    }
    car.armour = armour;
  }

  function nearGarage(pos, maxDist) {
    if (!pos) return false;
    const limit = typeof maxDist === 'number' ? maxDist : 8;
    const dx = pos.x - GARAGE_POS.x;
    const dz = pos.z - GARAGE_POS.z;
    return Math.sqrt(dx * dx + dz * dz) < limit;
  }

  function save() {
    return { paintIndex, engineLevel, armour };
  }

  function load(data) {
    if (!data) return;
    if (typeof data.paintIndex === 'number' && PAINTS[data.paintIndex]) {
      paintIndex = data.paintIndex;
    }
    if (typeof data.engineLevel === 'number' && data.engineLevel >= 0 && data.engineLevel <= 2) {
      engineLevel = data.engineLevel;
    }
    armour = !!data.armour;
  }

  return {
    mode: 'garage',
    open,
    close,
    render,
    applyToCar,
    nearGarage,
    paintColor,
    save,
    load,
    paints: PAINTS,
    engines: ENGINES,
    armourPrice: ARMOUR_PRICE,
    garagePos: GARAGE_POS,
    get isOpen() {
      return isOpen;
    },
    get paintIndex() {
      return paintIndex;
    },
    get engineLevel() {
      return engineLevel;
    },
    get armour() {
      return armour;
    },
  };
}
