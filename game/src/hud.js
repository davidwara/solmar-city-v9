// hud.js — health / money / wanted HUD plus the live 2D minimap.
// Pure DOM + canvas 2D: no three.js here. Every field main.js passes
// is optional — missing data falls back to a safe default instead of
// throwing, so the HUD never takes the game down with it.
import { clamp01, formatMoney } from './utils.js';

const WORLD_MIN = -240;
const WORLD_MAX = 440;
const MAP_SIZE = 190;
const STREETS = [-186, -124, -62, 0, 62, 124, 186];

function $(id) {
  if (typeof document === 'undefined') return null;
  return document.getElementById(id);
}

// Show one overlay screen (flex) and hide the other; null hides both.
export function showScreen(id) {
  const start = $('start-screen');
  const pause = $('pause-screen');
  if (start) start.style.display = id === 'start-screen' ? 'flex' : 'none';
  if (pause) pause.style.display = id === 'pause-screen' ? 'flex' : 'none';
}

export function createHud() {
  const els = {
    healthFill: $('health-fill'),
    healthText: $('health-text'),
    money: $('money'),
    wanted: $('wanted'),
    objective: $('objective'),
    speed: $('speed'),
    hint: $('hint'),
    sideLine: $('side-line'),
    missionList: $('mission-list'),
    toast: $('toast'),
    ammo: $('ammo'),
    clock: $('clock'),
    weather: $('weather'),
    packages: $('packages'),
    station: $('station'),
    turf: $('turf'),
    flash: $('flash'),
  };
  const canvas = $('minimap');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const scale = MAP_SIZE / (WORLD_MAX - WORLD_MIN);
  let toastTimer = null;
  let flashTimer = null;
  let listShowing = false;

  const mx = (x) => (x - WORLD_MIN) * scale;
  const mz = (z) => (z - WORLD_MIN) * scale;

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function drawDot(x, z, r, color) {
    if (!ctx) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx(x), mz(z), r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDiamond(x, z, r, color) {
    if (!ctx) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(mx(x), mz(z) - r);
    ctx.lineTo(mx(x) + r, mz(z));
    ctx.lineTo(mx(x), mz(z) + r);
    ctx.lineTo(mx(x) - r, mz(z));
    ctx.closePath();
    ctx.fill();
  }

  function drawSquare(x, z, half, color) {
    if (!ctx) return;
    ctx.fillStyle = color;
    ctx.fillRect(mx(x) - half, mz(z) - half, half * 2, half * 2);
  }

  // Read a position out of the many shapes other modules use:
  // {x, z}, {pos: {x, z}}, a Vector3, or a [x, z] pair.
  function readPos(p) {
    if (!p) return null;
    if (p.pos) return readPos(p.pos);
    // Traffic wrappers and police units carry the car under .car.
    if (p.car) return readPos(p.car);
    if (typeof p.x === 'number' && typeof p.z === 'number') return { x: p.x, z: p.z };
    if (Array.isArray(p) && p.length >= 2) return { x: p[0], z: p[1] };
    return null;
  }

  function drawMinimap(s) {
    if (!ctx || !canvas) return;
    const extras = s.extras || s;
    const now = Date.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(now * 4);

    // Dark sea chart background.
    ctx.fillStyle = '#0e2233';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Beach band (z 210..250) then open sea (z >= 250).
    ctx.fillStyle = '#d9c184';
    ctx.fillRect(0, mz(210), MAP_SIZE, mz(250) - mz(210));
    ctx.fillStyle = '#2e7fb8';
    ctx.fillRect(0, mz(250), MAP_SIZE, MAP_SIZE - mz(250));

    // Second island: sand slab with a green heart, lighthouse on the
    // south tip — pale gold when lit, red when dark.
    const island = extras.island || s.island || null;
    if (island) {
      const b = island.bounds || island;
      const ix0 = b.minX !== undefined ? b.minX : -20;
      const ix1 = b.maxX !== undefined ? b.maxX : 140;
      const iz0 = b.minZ !== undefined ? b.minZ : 300;
      const iz1 = b.maxZ !== undefined ? b.maxZ : 420;
      ctx.fillStyle = '#e8d29a';
      ctx.fillRect(mx(ix0), mz(iz0), mx(ix1) - mx(ix0), mz(iz1) - mz(iz0));
      ctx.fillStyle = '#5d8a4a';
      ctx.fillRect(mx(ix0 + 12), mz(iz0 + 12), mx(ix1) - mx(ix0) - 24, mz(iz1) - mz(iz0) - 24);
      const lp = readPos(extras.lighthousePos || s.lighthousePos) || { x: 60, z: iz1 - 6 };
      drawDot(lp.x, lp.z, 3, (extras.lighthouseLit || s.lighthouseLit) ? '#ffe9a8' : '#e04040');
    }

    // Gang turf zones: translucent disc, gold ring when Mara owns it,
    // white progress arc while a claim is running.
    const zones = extras.turfZones || s.turfZones || [];
    for (let i = 0; i < zones.length; i++) {
      const zn = zones[i];
      if (!zn) continue;
      const zx = zn.x !== undefined ? zn.x : (zn.center ? zn.center.x : 0);
      const zz = zn.z !== undefined ? zn.z : (zn.center ? zn.center.z : 0);
      const r = (zn.radius || 30) * scale;
      ctx.fillStyle = zn.color || '#888888';
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(mx(zx), mz(zz), r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (zn.owned) {
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx(zx), mz(zz), r, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (zn.progress > 0 && zn.progress < 1) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx(zx), mz(zz), r + 3, -Math.PI / 2, -Math.PI / 2 + zn.progress * Math.PI * 2);
        ctx.stroke();
      }
    }

    // Boats as white diamonds, garage as an orange square.
    const boats = extras.boats || s.boats || [];
    for (let i = 0; i < boats.length; i++) {
      const p = readPos(boats[i]);
      if (p) drawDiamond(p.x, p.z, 4, '#ffffff');
    }
    const garage = readPos(extras.garagePos || s.garagePos);
    if (garage) drawSquare(garage.x, garage.z, 5, '#ff8c1a');

    // Roads: grey lines on every street centreline, both directions.
    ctx.strokeStyle = '#6a7078';
    ctx.lineWidth = 2;
    for (let i = 0; i < STREETS.length; i++) {
      const c = STREETS[i];
      ctx.beginPath();
      ctx.moveTo(mx(c), mz(-220));
      ctx.lineTo(mx(c), mz(220));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx(-220), mz(c));
      ctx.lineTo(mx(220), mz(c));
      ctx.stroke();
    }

    // Mission marker: pulsing gold diamond.
    const obj = readPos(s.objectivePos || extras.objectivePos);
    if (obj) {
      drawDiamond(obj.x, obj.z, 5 + pulse * 3, '#ffd23f');
      ctx.strokeStyle = 'rgba(255, 210, 63, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx(obj.x), mz(obj.z), 8 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Traffic as grey dots.
    const traffic = extras.traffic || s.traffic || [];
    const tCars = Array.isArray(traffic) ? traffic : (traffic.cars || []);
    for (let i = 0; i < tCars.length; i++) {
      const p = readPos(tCars[i]);
      if (p) drawDot(p.x, p.z, 2.5, '#9aa0a6');
    }

    // Nearby pedestrians (within 90m): pale dots, red when knocked down.
    const peds = extras.peds || s.peds || [];
    const pp = s.playerPos || s.pos || null;
    for (let i = 0; i < peds.length; i++) {
      const p = readPos(peds[i]);
      if (!p) continue;
      if (pp && Math.hypot(p.x - pp.x, p.z - pp.z) > 90) continue;
      drawDot(p.x, p.z, 1.8, peds[i].down ? '#e04040' : '#dfe8ee');
    }

    // Parked cars as orange dots; the driven car is white and bigger.
    const cars = s.cars || extras.cars || [];
    const driven = s.car || s.drivenCar || null;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      const p = readPos(c);
      if (!p) continue;
      const isDriven = driven && c === driven;
      drawDot(p.x, p.z, isDriven ? 4 : 2.5, isDriven ? '#ffffff' : '#ff8c1a');
    }

    // Police as flashing blue/red dots.
    const police = extras.police || s.police || [];
    const pCars = Array.isArray(police) ? police : (police.cars || police.pursuit || []);
    const copColor = Math.floor(now * 3) % 2 === 0 ? '#2f7bff' : '#ff2f2f';
    for (let i = 0; i < pCars.length; i++) {
      const p = readPos(pCars[i]);
      if (p) drawDot(p.x, p.z, 3.5, copColor);
    }

    // Gun shop: green square.
    const shop = readPos(extras.shopPos || s.shopPos);
    if (shop) drawSquare(shop.x, shop.z, 4, '#2fd25a');

    // Bodyguard client: pulsing gold ring.
    const vip = readPos(extras.vipPos || s.vipPos);
    if (vip) {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx(vip.x), mz(vip.z), 5 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Nearby hidden packages: cyan dots.
    const pkgs = extras.packages || s.packages || [];
    if (Array.isArray(pkgs)) {
      for (let i = 0; i < pkgs.length; i++) {
        const p = readPos(pkgs[i]);
        if (p) drawDot(p.x, p.z, 2.5, '#22d3ee');
      }
    }

    // Phase 6 side-hustle markers, each in its own shape and colour.
    drawPhase6Markers(extras, s);

    // Player arrow last, on top: cyan in a vehicle, white on foot,
    // rotated to the heading.
    const playerPos = readPos(s.playerPos || s.pos || (s.player && s.player.pos));
    if (playerPos && ctx) {
      const heading = s.heading !== undefined ? s.heading : (s.player ? s.player.heading : 0);
      const inVehicle = !!(s.inCar || s.inBoat);
      ctx.save();
      ctx.translate(mx(playerPos.x), mz(playerPos.z));
      ctx.rotate(-heading + Math.PI);
      ctx.fillStyle = inVehicle ? '#22d3ee' : '#ffffff';
      ctx.strokeStyle = '#0e2233';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFlag(x, z, color) {
    if (!ctx) return;
    ctx.fillStyle = color;
    ctx.fillRect(mx(x) - 1, mz(z) - 6, 2, 8);
    ctx.beginPath();
    ctx.moveTo(mx(x) + 1, mz(z) - 6);
    ctx.lineTo(mx(x) + 7, mz(z) - 3);
    ctx.lineTo(mx(x) + 1, mz(z));
    ctx.closePath();
    ctx.fill();
  }

  function drawPhase6Markers(extras, s) {
    if (!ctx) return;
    const m = extras.markers || extras.phase6 || s.markers || null;
    if (Array.isArray(m)) {
      for (let i = 0; i < m.length; i++) {
        const mk = m[i];
        if (!mk) continue;
        const p = readPos(mk);
        if (!p) continue;
        const shape = mk.shape || 'dot';
        const color = mk.color || '#ffffff';
        if (shape === 'diamond') drawDiamond(p.x, p.z, 4, color);
        else if (shape === 'square') drawSquare(p.x, p.z, 4, color);
        else if (shape === 'flag') drawFlag(p.x, p.z, color);
        else drawDot(p.x, p.z, 3, color);
      }
      return;
    }
    // Named-field form: pier, race flag + next gate, safehouses,
    // casino, courier depots + drop, Biscuit.
    const pier = readPos(extras.pierPos || s.pierPos);
    if (pier) drawDiamond(pier.x, pier.z, 4, '#7fd4ff');
    const flag = readPos(extras.raceFlagPos || s.raceFlagPos);
    if (flag) drawFlag(flag.x, flag.z, '#ffffff');
    const gate = readPos(extras.raceGatePos || s.raceGatePos);
    if (gate) {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx(gate.x), mz(gate.z), 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    const houses = extras.houses || s.houses || [];
    for (let i = 0; i < houses.length; i++) {
      const p = readPos(houses[i]);
      if (p) drawSquare(p.x, p.z, 4, '#2fd25a');
    }
    const casino = readPos(extras.casinoPos || s.casinoPos);
    if (casino) drawDiamond(casino.x, casino.z, 5, '#b06fd6');
    const depots = extras.depots || s.depots || [];
    for (let i = 0; i < depots.length; i++) {
      const p = readPos(depots[i]);
      if (p) drawSquare(p.x, p.z, 3.5, '#c98a3d');
    }
    const drop = readPos(extras.dropPos || s.dropPos);
    if (drop) drawDot(drop.x, drop.z, 3.5, '#ffd23f');
    const dog = readPos(extras.dogPos || s.dogPos);
    if (dog) drawDot(dog.x, dog.z, 3, '#f5e6c8');
  }

  function pickHint(s) {
    if (s.hint) return s.hint;
    if (s.inCar) return 'WASD drive · E exit car · Shift boost · M missions · P pause';
    if (s.inBoat) return 'WASD sail · E step ashore · Shift speed · M missions · P pause';
    if (s.nearBoat) return 'E board the boat';
    if (s.nearGarage) return 'E open the garage';
    if (s.nearCar) return 'E take the car';
    if (s.nearShop) return 'E buy a pistol ($400) · F punch';
    return 'WASD move · Shift run · Space jump · E use · F punch · M missions · P pause';
  }

  function update(s) {
    const state = s || {};
    const health = Math.max(0, state.health || 0);
    const maxHealth = state.maxHealth || 100;
    if (els.healthFill) {
      els.healthFill.style.width = (clamp01(health / maxHealth) * 100) + '%';
      // The bar runs red when Mara is nearly down, so the danger reads
      // at a glance instead of needing the number.
      els.healthFill.style.background = health < 30 ? '#ff3b30' : (health < 60 ? '#ff9f1a' : '#2fd25a');
    }
    setText(els.healthText, String(Math.round(health)));
    setText(els.money, formatMoney(state.money || 0));

    // Wanted stars: up to 5 slots, red + pulsing while wanted.
    const wanted = Math.max(0, Math.min(5, state.wanted || 0));
    if (els.wanted) {
      els.wanted.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
      els.wanted.style.color = wanted > 0 ? '#ff3b30' : '#ffd23f';
      els.wanted.style.animation = wanted > 0 ? 'hudPulse 0.7s infinite' : 'none';
    }

    setText(els.ammo, state.ammoText || state.ammo || '');
    if (els.clock) {
      els.clock.textContent = state.clock || '';
      els.clock.style.color = state.isNight ? '#8fb8ff' : '#ffe9a8';
    }
    setText(els.weather, state.weather || '');
    const pkgText = state.packagesText
      || (typeof state.packages === 'number' ? 'Packages ' + state.packages + '/15' : '');
    setText(els.packages, pkgText);
    setText(els.station, state.inCar ? (state.station || '') : '');
    setText(els.turf, state.turfText || state.turf || '');
    setText(els.sideLine, state.sideLine || '');
    setText(els.objective, state.objective || '');

    if (els.speed) {
      if (state.inCar) {
        const kmh = Math.abs(state.speed || 0) * 3.6;
        els.speed.textContent = Math.round(kmh) + ' km/h';
      } else if (state.inBoat) {
        const kmh = Math.abs(state.speed || 0) * 3.6;
        els.speed.textContent = Math.round(kmh) + ' km/h · BOAT';
      } else {
        els.speed.textContent = '';
      }
    }
    setText(els.hint, pickHint(state));

    drawMinimap(state);
  }

  function showToast(text, ms) {
    if (!els.toast) return;
    els.toast.textContent = text || '';
    els.toast.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (els.toast) els.toast.style.display = 'none';
    }, ms === undefined ? 2600 : ms);
  }

  function showFlash() {
    if (!els.flash) return;
    els.flash.style.display = 'block';
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      if (els.flash) els.flash.style.display = 'none';
    }, 140);
  }

  function toggleMissionList(text) {
    if (!els.missionList) return false;
    listShowing = !listShowing;
    if (listShowing && text !== undefined) els.missionList.textContent = text;
    els.missionList.style.display = listShowing ? 'block' : 'none';
    return listShowing;
  }

  return { update, showToast, toggleMissionList, showFlash };
}
