// helicopter.js — "Air One", the Solmar City police helicopter.
// A procedural mesh (body, tail boom, spinning main + tail rotors, skids,
// blinking beacon) that circles Mara once the heat reaches three stars,
// and pins a visible searchlight cone on her at night. It is a real
// gameplay system: it only flies while wanted, it tracks the player, and
// its spotlight follows her — the screenshot poses stage it with
// stage() so it holds a fixed, in-frame hover instead of orbiting.

import * as THREE from 'three';
import { clamp } from './utils.js';

const ROTOR_SPEED = 26;
const TAIL_ROTOR_SPEED = 34;
const ORBIT_RADIUS = 21;
const ORBIT_HEIGHT = 25;
const ORBIT_RATE = 0.22;

export function createHelicopter(scene, seed) {
  const darkBlue = new THREE.MeshLambertMaterial({ color: 0x1d2f4d });
  const white = new THREE.MeshLambertMaterial({ color: 0xe8ecf0 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd8e8 });
  const darkMetal = new THREE.MeshLambertMaterial({ color: 0x22262b });
  const rotorMat = new THREE.MeshLambertMaterial({ color: 0x14161a });

  const group = new THREE.Group();
  group.visible = false;

  // Body: a rounded cabin with a white cheatline and a glass nose.
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.5, 1.9), darkBlue);
  body.position.y = 0;
  group.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.34, 1.95), white);
  stripe.position.y = -0.28;
  group.add(stripe);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 1.7), glass);
  nose.position.set(1.9, 0.1, 0);
  group.add(nose);

  // Tail boom, end fin and tail rotor (spins around the boom axis).
  const boom = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.5, 0.5), darkBlue);
  boom.position.set(-3.6, 0.35, 0);
  group.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.9), darkBlue);
  fin.position.set(-5.7, 0.9, 0);
  group.add(fin);
  const tailRotor = new THREE.Group();
  tailRotor.position.set(-5.85, 0.5, 0);
  const tailBladeGeo = new THREE.BoxGeometry(0.12, 1.7, 0.28);
  const tailBladeA = new THREE.Mesh(tailBladeGeo, rotorMat);
  const tailBladeB = new THREE.Mesh(tailBladeGeo, rotorMat);
  tailBladeB.rotation.x = Math.PI / 2;
  tailRotor.add(tailBladeA, tailBladeB);
  group.add(tailRotor);

  // Main rotor mast + two crossing blades (spin around Y).
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 8), darkMetal);
  mast.position.y = 1.05;
  group.add(mast);
  const mainRotor = new THREE.Group();
  mainRotor.position.y = 1.45;
  const bladeGeo = new THREE.BoxGeometry(7.6, 0.09, 0.55);
  const bladeA = new THREE.Mesh(bladeGeo, rotorMat);
  const bladeB = new THREE.Mesh(bladeGeo, rotorMat);
  bladeB.rotation.y = Math.PI / 2;
  mainRotor.add(bladeA, bladeB);
  group.add(mainRotor);

  // Skids.
  for (const z of [-0.85, 0.85]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.14), darkMetal);
    skid.position.set(0.2, -1.05, z);
    group.add(skid);
  }

  // Blinking red beacon on the belly.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), beaconMat);
  beacon.position.set(-0.6, -0.95, 0);
  group.add(beacon);

  // Searchlight: a translucent cone hung under the nose, aimed at Mara.
  // The cone's apex sits at the helicopter; the wide end lands on the
  // street, so at night the beam reads as a spotlight pool on the road.
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff6c8, transparent: true, opacity: 0.1,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const coneGeo = new THREE.ConeGeometry(2.6, 18, 18, 1, true);
  const searchlight = new THREE.Mesh(coneGeo, coneMat);
  searchlight.visible = false;
  scene.add(searchlight);
  // A bright pool disc where the beam lands, so the spotlight reads even
  // when the cone itself is edge-on to the camera.
  const poolMat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0.22, depthWrite: false,
  });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.6, 20), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.06;
  pool.visible = false;
  scene.add(pool);

  scene.add(group);

  const heli = {
    group,
    airborne: false,
    staged: false,
    stagedNight: false,
    orbitAngle: (typeof seed === 'number' ? seed : 1) * 1.7,
    rotorAngle: 0,
    stage,
    clearStage,
    place,
    update,
  };

  // Pin the helicopter to a fixed hover offset from the player (used by
  // the screenshot poses): it still spins its rotors and tracks Mara
  // with the searchlight, it just stops orbiting so it stays in frame.
  function stage(offsetX, offsetY, offsetZ, opts) {
    heli.staged = true;
    heli.stagedOffset = { x: offsetX || 0, y: offsetY || ORBIT_HEIGHT, z: offsetZ || 0 };
    heli.stagedNight = !!(opts && opts.night);
    group.visible = true;
    heli.airborne = true;
  }

  function clearStage() {
    heli.staged = false;
    heli.stagedNight = false;
  }

  function place(x, y, z) {
    group.position.set(x, y || ORBIT_HEIGHT, z);
    group.visible = true;
    heli.airborne = true;
  }

  function update(dt, opts) {
    const o = opts || {};
    const target = o.playerPos || null;
    const wanted = o.wanted || 0;
    const isNight = !!o.isNight;
    const flying = heli.staged || wanted >= 3;
    if (!flying || !target) {
      group.visible = false;
      searchlight.visible = false;
      pool.visible = false;
      heli.airborne = false;
      return;
    }
    group.visible = true;
    heli.airborne = true;

    // Rotors never stop while airborne; the beacon blinks twice a second.
    heli.rotorAngle += dt * ROTOR_SPEED;
    mainRotor.rotation.y = heli.rotorAngle;
    tailRotor.rotation.x = heli.rotorAngle * (TAIL_ROTOR_SPEED / ROTOR_SPEED);
    beacon.visible = Math.floor(performance.now() / 500) % 2 === 0;

    // Position: a slow orbit around Mara, or the staged hover offset.
    if (heli.staged && heli.stagedOffset) {
      const want = {
        x: target.x + heli.stagedOffset.x,
        y: heli.stagedOffset.y,
        z: target.z + heli.stagedOffset.z,
      };
      const ease = 1 - Math.exp(-3 * dt);
      group.position.x += (want.x - group.position.x) * ease;
      group.position.y += (want.y - group.position.y) * ease;
      group.position.z += (want.z - group.position.z) * ease;
    } else {
      heli.orbitAngle += dt * ORBIT_RATE;
      group.position.set(
        target.x + Math.sin(heli.orbitAngle) * ORBIT_RADIUS,
        ORBIT_HEIGHT,
        target.z + Math.cos(heli.orbitAngle) * ORBIT_RADIUS,
      );
    }
    // Nose follows the direction of travel around the orbit.
    group.rotation.y = Math.atan2(
      target.x - group.position.x,
      target.z - group.position.z,
    );

    // Searchlight: on at night (or whenever a night pose stages it),
    // aimed from the belly at Mara's feet.
    const beamOn = isNight || heli.stagedNight;
    searchlight.visible = beamOn;
    pool.visible = beamOn;
    if (beamOn) {
      const top = group.position;
      const ground = { x: target.x, y: 0, z: target.z };
      const mid = {
        x: (top.x + ground.x) / 2,
        y: (top.y + ground.y) / 2,
        z: (top.z + ground.z) / 2,
      };
      // ConeGeometry's apex is its +Y end: point +Y from the street
      // toward the helicopter so the apex sits at the belly and the
      // wide end lands on the road.
      const dir = new THREE.Vector3(top.x - ground.x, top.y - ground.y, top.z - ground.z);
      const beamLen = dir.length() || 1;
      dir.normalize();
      searchlight.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      searchlight.position.set(mid.x, mid.y, mid.z);
      searchlight.scale.set(1, clamp(beamLen / 18, 0.6, 1.6), 1);
      pool.position.set(ground.x, 0.06, ground.z);
    }
  }

  return heli;
}
