import * as THREE from 'three';
import { setTimeOfDay } from './city.js';

// Day/night cycle for Solmar City. One full day lasts eight minutes
// of play (20 seconds per game hour). The sun arcs across the sky,
// dusk turns the light gold, night drops the lamps on, and the HUD
// reads `clockText`. Drives the city's setTimeOfDay internally.
const DAY_SECONDS = 480;
const NIGHT_SKY = new THREE.Color(0x0b1026);
const NIGHT_FOG = new THREE.Color(0x0d1526);

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatClock(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return pad2(h) + ':' + pad2(m);
}

function makeStars(scene) {
  const count = 420;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = 0.12 + Math.random() * 1.35;
    const r = 520;
    positions[i * 3] = Math.cos(a) * Math.cos(e) * r;
    positions[i * 3 + 1] = Math.sin(e) * r;
    positions[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xdfeaff, size: 1.6, transparent: true, opacity: 0, sizeAttenuation: false,
  });
  const stars = new THREE.Points(geo, mat);
  stars.frustumCulled = false;
  scene.add(stars);
  return stars;
}

function makeMoon(scene) {
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(9, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xf2f0dc, transparent: true, opacity: 0 }),
  );
  scene.add(moon);
  const glow = new THREE.PointLight(0xcdd8ff, 0, 500, 0.5);
  moon.add(glow);
  return { moon, glow };
}

function phaseOf(hour) {
  if (hour >= 5.5 && hour < 7.5) return 'dawn';
  if (hour >= 7.5 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'dusk';
  return 'night';
}

export function createDayNight(scene, city) {
  const stars = makeStars(scene);
  const moonPair = makeMoon(scene);
  const clock = {
    hour: 10,
    isNight: false,
    clockText: '10:00',
    goldenHour: false,
    phase: 'day',
    isDawn: false,
    isDusk: false,
    timeScale: 1,
    dayFraction: 10 / 24,
    sunPosition() {
      // A copy of the sun's current position, for anything that
      // wants to aim a shadow or a lens flare at it.
      return city.sun ? city.sun.position.clone() : new THREE.Vector3(120, 180, 60);
    },
    setHour(h) {
      const v = Number(h);
      clock.hour = Number.isFinite(v) ? ((v % 24) + 24) % 24 : 10;
      clock.apply();
    },
    advance(hours) {
      clock.setHour(clock.hour + (Number(hours) || 0));
    },
    apply() {
      const hour = clock.hour;
      clock.isNight = hour >= 19 || hour < 6;
      clock.goldenHour = hour >= 17 && hour < 18.5;
      clock.phase = phaseOf(hour);
      clock.isDawn = clock.phase === 'dawn';
      clock.isDusk = clock.phase === 'dusk';
      clock.dayFraction = hour / 24;
      clock.clockText = formatClock(hour);
      // Afternoon sun slides toward golden sunset; mornings stay bright.
      const t = hour >= 12 ? Math.max(0, Math.min(1, (hour - 12) / 6)) : 0;
      setTimeOfDay(scene, city, t);
      // Night / dawn / dusk blend on top of the sunset lerp.
      let night = 0;
      if (hour >= 19 || hour < 5) night = 1;
      else if (hour >= 18 && hour < 19) night = hour - 18;
      else if (hour >= 5 && hour < 6) night = 1 - (hour - 5);
      if (night > 0) {
        const sun = city.sun;
        const hemi = city.hemi;
        sun.intensity *= 1 - 0.92 * night;
        hemi.intensity = Math.max(0.08, hemi.intensity * (1 - 0.75 * night));
        if (scene.background && scene.background.isColor) {
          scene.background.lerp(NIGHT_SKY, night * 0.9);
        }
        if (scene.fog) scene.fog.color.lerp(NIGHT_FOG, night * 0.9);
      }
      if (city.lampMat) {
        city.lampMat.emissiveIntensity = clock.isNight ? 2.4 : night > 0 ? 1.2 : 0.35;
      }
      // Moon opposite the sun: rises as the sun sets, sets at dawn.
      const moonAngle = Math.PI * ((hour - 19 + 24) % 24) / 10;
      const moonUp = hour >= 19 || hour < 5;
      moonPair.moon.material.opacity = night * 0.95;
      moonPair.moon.position.set(
        Math.cos(moonAngle) * 380,
        Math.max(20, Math.sin(moonAngle) * 300),
        -180,
      );
      moonPair.glow.intensity = moonUp ? 40 * night : 0;
      stars.material.opacity = night * 0.9;
    },
    update(dt) {
      // Screenshot runs stage a fixed hour; never advance the clock there.
      if (typeof window !== 'undefined' && window.location && /[?&]shot=/.test(window.location.search)) {
        return;
      }
      const step = Math.max(0, Math.min(dt || 0, 0.05));
      if (step <= 0) return;
      clock.hour = (clock.hour + (step * clock.timeScale / DAY_SECONDS) * 24) % 24;
      clock.apply();
    },
  };
  clock.apply();
  return clock;
}
