import * as THREE from 'three';

// Dynamic weather for Solmar City: clear / rain / storm on a slow
// cycle. Rain falls around the focus (usually Mara), the road goes
// dark and glossy when wet, lightning strobes the sky and calls the
// audio thunder hook, and wet roads cut car grip. The HUD reads
// `icon`; fishing reads `seaBreeze`.
const KIND_CLEAR = 'clear';
const KIND_RAIN = 'rain';
const KIND_STORM = 'storm';

const ICONS = { clear: '☀️', rain: '🌧️', storm: '⛈️' };
const BREEZE = { clear: 0.25, rain: 0.6, storm: 0.9 };

const DROP_COUNT = 900;
const DROP_AREA = 46;
const DROP_TOP = 26;

function makeRain(scene) {
  const positions = new Float32Array(DROP_COUNT * 3);
  const speeds = new Float32Array(DROP_COUNT);
  for (let i = 0; i < DROP_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * DROP_AREA * 2;
    positions[i * 3 + 1] = Math.random() * DROP_TOP;
    positions[i * 3 + 2] = (Math.random() - 0.5) * DROP_AREA * 2;
    speeds[i] = 22 + Math.random() * 10;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xbcd8f0, size: 0.22, transparent: true, opacity: 0.75, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.visible = false;
  points.frustumCulled = false;
  scene.add(points);
  return { points, positions, speeds, geo };
}

function nextKind(current, rngValue) {
  if (current === KIND_CLEAR) return rngValue < 0.55 ? KIND_RAIN : KIND_STORM;
  if (current === KIND_RAIN) return rngValue < 0.5 ? KIND_CLEAR : KIND_STORM;
  return rngValue < 0.6 ? KIND_RAIN : KIND_CLEAR;
}

function nextDuration(kind) {
  if (kind === KIND_CLEAR) return 45 + Math.random() * 45;
  if (kind === KIND_RAIN) return 30 + Math.random() * 30;
  return 20 + Math.random() * 20;
}

function makeClouds(scene) {
  // A dozen flat dark puffs drifting high overhead; they gather when
  // the weather turns and thin out again when it clears.
  const group = new THREE.Group();
  const puffs = [];
  const mat = new THREE.MeshBasicMaterial({
    color: 0x5a6672, transparent: true, opacity: 0, depthWrite: false,
  });
  for (let i = 0; i < 12; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(14 + Math.random() * 12, 8, 6), mat);
    puff.scale.y = 0.32;
    puff.position.set((Math.random() - 0.5) * 420, 95 + Math.random() * 25, (Math.random() - 0.5) * 420);
    puff.userData.speed = 1.5 + Math.random() * 2;
    group.add(puff);
    puffs.push(puff);
  }
  scene.add(group);
  return { group, puffs, mat };
}

export function createWeather(scene, city, daynight) {
  const rain = makeRain(scene);
  const clouds = makeClouds(scene);
  const flash = new THREE.PointLight(0xdfeaff, 0, 400, 0.6);
  flash.position.set(0, 90, 0);
  scene.add(flash);
  let flashTimer = 0;
  let flashGap = 4 + Math.random() * 6;
  let thunderDelay = -1;
  let breezePhase = Math.random() * Math.PI * 2;
  const weather = {
    kind: KIND_CLEAR,
    raining: false,
    grip: 1,
    icon: ICONS.clear,
    seaBreeze: 0.25,
    wetness: 0,
    timer: nextDuration(KIND_CLEAR),
    intensity: 0,
    setKind(kind) {
      weather.kind = kind;
      weather.raining = kind !== KIND_CLEAR;
      weather.icon = ICONS[kind];
      weather.intensity = kind === KIND_CLEAR ? 0 : kind === KIND_RAIN ? 0.65 : 1;
      rain.points.visible = weather.raining;
      flashTimer = 0;
      flashGap = 3 + Math.random() * 7;
      thunderDelay = -1;
    },
    applyWetness() {
      // Roads dry out slowly and soak gradually: grip and sheen
      // follow wetness, not the instant the kind flips.
      const target = weather.raining ? 1 : 0;
      weather.wetness += (target - weather.wetness) * 0.02;
      if (Math.abs(target - weather.wetness) < 0.005) weather.wetness = target;
      const w = weather.wetness;
      weather.grip = 1 - w * (weather.kind === KIND_STORM ? 0.28 : 0.18);
      if (city && city.roadMat) {
        city.roadMat.color.setHex(0x3a3f46).lerp(new THREE.Color(0x23262c), w);
        city.roadMat.roughness = 0.9 - 0.62 * w;
        city.roadMat.metalness = 0.35 * w;
      }
    },
    forecast() {
      // What the sky is doing now and how long until it changes —
      // the HUD / radio chatter can quote this without peeking at
      // the internal timer directly.
      const label = weather.kind === KIND_CLEAR ? 'Clear skies'
        : weather.kind === KIND_RAIN ? 'Rain' : 'Storm';
      return { kind: weather.kind, label, icon: weather.icon, secondsLeft: Math.max(0, Math.ceil(weather.timer)) };
    },
    stormWarning() {
      return weather.kind === KIND_STORM || weather.wetness > 0.6;
    },
    update(dt, focusPos, audio) {
      const step = Math.max(0, Math.min(dt || 0, 0.05));
      weather.timer -= step;
      if (weather.timer <= 0) {
        const next = nextKind(weather.kind, Math.random());
        weather.timer = nextDuration(next);
        weather.setKind(next);
      }
      weather.applyWetness();
      breezePhase += step * 0.35;
      const sway = 0.5 + 0.5 * Math.sin(breezePhase);
      weather.seaBreeze = Math.max(0, Math.min(1, BREEZE[weather.kind] * (0.7 + 0.5 * sway)));
      // Clouds gather with the rain and drift with the breeze.
      const cloudTarget = weather.kind === KIND_CLEAR ? 0 : weather.kind === KIND_RAIN ? 0.5 : 0.75;
      clouds.mat.opacity += (cloudTarget - clouds.mat.opacity) * step * 0.5;
      for (const puff of clouds.puffs) {
        puff.position.x += puff.userData.speed * step * (weather.kind === KIND_STORM ? 2.2 : 1);
        if (puff.position.x > 240) puff.position.x = -240;
      }
      if (!weather.raining) {
        flash.intensity = 0;
        return;
      }
      const fx = focusPos ? (focusPos.x || 0) : 0;
      const fz = focusPos ? (focusPos.z || 0) : 0;
      const drift = weather.kind === KIND_STORM ? 9 * step : 3 * step;
      const pos = rain.positions;
      for (let i = 0; i < DROP_COUNT; i++) {
        pos[i * 3 + 1] -= rain.speeds[i] * step * (weather.kind === KIND_STORM ? 1.3 : 1);
        pos[i * 3] += drift;
        if (pos[i * 3 + 1] <= 0) {
          pos[i * 3 + 1] = DROP_TOP;
          pos[i * 3] = fx + (Math.random() - 0.5) * DROP_AREA * 2;
          pos[i * 3 + 2] = fz + (Math.random() - 0.5) * DROP_AREA * 2;
        }
        // Keep the curtain centred on the focus as Mara moves.
        if (Math.abs(pos[i * 3] - fx) > DROP_AREA) pos[i * 3] = fx + (Math.random() - 0.5) * DROP_AREA * 2;
        if (Math.abs(pos[i * 3 + 2] - fz) > DROP_AREA) pos[i * 3 + 2] = fz + (Math.random() - 0.5) * DROP_AREA * 2;
      }
      rain.geo.attributes.position.needsUpdate = true;
      rain.points.position.set(0, 0, 0);
      // Lightning only in storms: a flash now, thunder a beat later
      // (sound travels slower than light), then the sky goes dark again.
      if (weather.kind === KIND_STORM) {
        flash.position.set(fx + (Math.random() - 0.5) * 120, 90, fz + (Math.random() - 0.5) * 120);
        if (thunderDelay > 0) {
          thunderDelay -= step;
          if (thunderDelay <= 0 && audio && typeof audio.thunder === 'function') {
            try { audio.thunder(); } catch (e) { /* sound is garnish */ }
          }
        }
        flashTimer -= step;
        if (flashTimer <= 0) {
          flash.intensity = 900 + Math.random() * 700;
          flashTimer = flashGap;
          flashGap = 3 + Math.random() * 8;
          thunderDelay = 0.4 + Math.random() * 0.9;
        } else {
          flash.intensity = Math.max(0, flash.intensity - step * 2600);
        }
      } else {
        flash.intensity = 0;
      }
    },
  };
  weather.setKind(KIND_CLEAR);
  return weather;
}
