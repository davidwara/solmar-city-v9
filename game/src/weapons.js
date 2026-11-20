// weapons.js — Mara's pistol, the bat and boxes of spare rounds, all sold
// at the gun shop on the downtown corner. Every shot in public is a crime:
// firing near witnesses raises heat, and hitting a patrol car makes the
// law hunt her harder.
import * as THREE from 'three';

export const GUN_PRICE = 400;
export const MAG_SIZE = 12;
export const SHOT_RANGE = 46;
export const SHOP_POS = new THREE.Vector3(10.5, 0, 62);
export const BAT_PRICE = 50;
export const BAT_REACH = 3.6;
export const AMMO_BOX_PRICE = 60;
export const AMMO_BOX_ROUNDS = 24;

const RELOAD_TIME = 1.1;
const SHOT_COOLDOWN = 0.22;
const DRY_COOLDOWN = 0.3;

function objPos(obj) {
  if (!obj) return null;
  if (obj.pos) return obj.pos;
  if (obj.position) return obj.position;
  return null;
}

function makeSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#123524';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#2aff66';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 244, 116);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px Verdana';
  ctx.textAlign = 'center';
  ctx.fillText('GUN SHOP', 128, 58);
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 30px Verdana';
  ctx.fillText('PISTOL $400', 128, 102);
  return new THREE.CanvasTexture(canvas);
}

export function createWeapons(scene) {
  // --- The gun shop, built at SHOP_POS. ---
  const shop = new THREE.Group();
  shop.position.copy(SHOP_POS);

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 3.2),
    new THREE.MeshBasicMaterial({ map: makeSignTexture() }),
  );
  sign.position.y = 4.4;
  shop.add(sign);

  const postMat = new THREE.MeshLambertMaterial({ color: 0x2e3438 });
  const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 4.6, 6);
  const postL = new THREE.Mesh(postGeo, postMat);
  postL.position.set(-3, 2.3, 0);
  const postR = new THREE.Mesh(postGeo, postMat);
  postR.position.set(3, 2.3, 0);
  shop.add(postL, postR);

  // Spinning pistol on display: grip, barrel and a gold sight.
  const pistol = new THREE.Group();
  const darkMetal = new THREE.MeshLambertMaterial({ color: 0x1c1f24 });
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.24), darkMetal);
  grip.rotation.z = 0.35;
  grip.position.set(-0.12, -0.1, 0);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.2), darkMetal);
  barrel.position.set(0.2, 0.16, 0);
  const sight = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.08),
    new THREE.MeshLambertMaterial({ color: 0xffd23f }),
  );
  sight.position.set(0.45, 0.28, 0);
  pistol.add(grip, barrel, sight);
  pistol.position.y = 2.6;
  pistol.scale.setScalar(1.6);
  shop.add(pistol);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 1.4, 18, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x7dff8a, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
    }),
  );
  beam.position.y = 9;
  shop.add(beam);

  const bat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, 1.5, 8),
    new THREE.MeshLambertMaterial({ color: 0x8a6a45 }),
  );
  bat.position.set(3.4, 1.4, 0.6);
  bat.rotation.z = 0.35;
  shop.add(bat);

  // Tracer line (two points) and the muzzle flash plane.
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracerMat = new THREE.LineBasicMaterial({
    color: 0xffe9a8, transparent: true, opacity: 0,
  });
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  tracer.frustumCulled = false;
  scene.add(tracer);

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd23f, transparent: true, opacity: 0, side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), flashMat);
  flash.visible = false;
  scene.add(flash);

  scene.add(shop);

  const weapons = {
    owned: false,
    bat: false,
    mag: 0,
    reserve: 0,
    cooldown: 0,
    reloadTimer: 0,
    flashTimer: 0,
    tracerTimer: 0,
    spinTimer: 0,
    lastShotPos: null,
    shotsFired: 0,
    shopPos: SHOP_POS,
    nearShop,
    buy,
    buyBat,
    buyAmmo,
    meleeReach,
    ammoText,
    shoot,
    reload,
    stageOwned,
    stageFlash,
    update,
  };

  function nearShop(pos, maxDist = 5) {
    if (!pos) return false;
    const dx = pos.x - SHOP_POS.x;
    const dz = pos.z - SHOP_POS.z;
    return Math.hypot(dx, dz) <= maxDist;
  }

  function buy(money) {
    if (weapons.owned) return 'owned';
    if ((money || 0) < GUN_PRICE) return 'broke';
    weapons.owned = true;
    weapons.mag = MAG_SIZE;
    weapons.reserve = 36;
    return 'ok';
  }

  function buyBat(money) {
    if (weapons.bat) return 'owned';
    if ((money || 0) < BAT_PRICE) return 'broke';
    weapons.bat = true;
    return 'ok';
  }

  function buyAmmo(money) {
    if (!weapons.owned) return 'no-gun';
    if ((money || 0) < AMMO_BOX_PRICE) return 'broke';
    weapons.reserve += AMMO_BOX_ROUNDS;
    return 'ok';
  }

  function meleeReach() {
    return weapons.bat ? BAT_REACH : 2.4;
  }

  function ammoText() {
    if (!weapons.owned) return 'NO GUN — visit the GUN SHOP ($400)';
    if (weapons.mag <= 0 && weapons.reserve <= 0) return 'OUT OF AMMO — G at the shop, $60 a box';
    if (weapons.reloadTimer > 0) return `RELOADING… ${weapons.mag} / ${weapons.reserve}`;
    return `PISTOL ${weapons.mag} / ${weapons.reserve}`;
  }

  // Score one candidate against the shot ray. Returns the along-ray
  // distance when it sits inside the cone, else Infinity.
  function coneHit(px, pz, mx, mz, fx, fz, radius) {
    const dx = px - mx;
    const dz = pz - mz;
    const along = dx * fx + dz * fz;
    if (along < 0.5 || along > SHOT_RANGE) return Infinity;
    const perp = Math.abs(dx * fz - dz * fx);
    if (perp >= radius) return Infinity;
    return along;
  }

  function drawShot(muzzle, endX, endZ, endY) {
    const attr = tracerGeo.getAttribute('position');
    attr.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
    attr.setXYZ(1, endX, endY, endZ);
    attr.needsUpdate = true;
    tracerMat.opacity = 0.95;
    weapons.tracerTimer = 0.09;
    flash.position.copy(muzzle);
    flash.visible = true;
    flashMat.opacity = 1;
    weapons.flashTimer = 0.06;
    weapons.lastShotPos = muzzle.clone();
  }

  function knockPedDown(ped) {
    if (!ped) return;
    ped.down = true;
    ped.downTimer = 2.8;
    if (ped.group) {
      ped.group.rotation.x = -Math.PI / 2 + 0.15;
      ped.group.position.y = 0.35;
    }
  }

  function shoot(origin, yaw, targets) {
    if (!weapons.owned) return null;
    if (weapons.cooldown > 0) return null;
    if (weapons.reloadTimer > 0) return null;
    if (weapons.mag <= 0) {
      weapons.cooldown = DRY_COOLDOWN;
      return { kind: 'dry' };
    }
    weapons.cooldown = SHOT_COOLDOWN;
    weapons.mag -= 1;
    weapons.shotsFired += 1;

    const fx = Math.sin(yaw || 0);
    const fz = Math.cos(yaw || 0);
    const muzzle = new THREE.Vector3(
      (origin ? origin.x : 0) + fx * 1.1,
      1.45,
      (origin ? origin.z : 0) + fz * 1.1,
    );

    const list = targets || {};
    let bestKind = 'none';
    let bestAlong = Infinity;
    let bestCar = null;
    let bestUnit = null;
    let bestPed = null;

    for (const ped of list.peds || []) {
      if (!ped || ped.down) continue;
      const p = objPos(ped);
      if (!p) continue;
      const d = coneHit(p.x, p.z, muzzle.x, muzzle.z, fx, fz, 1.4);
      if (d < bestAlong) { bestAlong = d; bestKind = 'ped'; bestPed = ped; bestCar = null; bestUnit = null; }
    }
    for (const car of list.traffic || []) {
      const p = objPos(car);
      if (!p) continue;
      const d = coneHit(p.x, p.z, muzzle.x, muzzle.z, fx, fz, 2.4);
      if (d < bestAlong) { bestAlong = d; bestKind = 'traffic'; bestCar = car; bestUnit = null; bestPed = null; }
    }
    for (const unit of list.police || []) {
      const car = unit && unit.car ? unit.car : unit;
      const p = objPos(car);
      if (!p) continue;
      const d = coneHit(p.x, p.z, muzzle.x, muzzle.z, fx, fz, 2.4);
      if (d < bestAlong) { bestAlong = d; bestKind = 'police'; bestCar = car; bestUnit = unit; bestPed = null; }
    }

    // The ray length used: the hit distance, or the full range on a miss
    // (a target sitting exactly at the range edge still counts as a hit).
    const dist = bestKind === 'none' ? SHOT_RANGE : bestAlong;
    const endX = muzzle.x + fx * dist;
    const endZ = muzzle.z + fz * dist;
    drawShot(muzzle, endX, endZ, 1.45);

    if (bestKind === 'ped') {
      knockPedDown(bestPed);
      return { kind: 'ped', dist };
    }
    if (bestKind === 'traffic') return { kind: 'traffic', car: bestCar, dist };
    if (bestKind === 'police') return { kind: 'police', car: bestCar, unit: bestUnit, dist };
    return { kind: 'none', dist };
  }

  function reload() {
    if (!weapons.owned) return false;
    if (weapons.reloadTimer > 0) return false;
    if (weapons.mag >= MAG_SIZE) return false;
    if (weapons.reserve <= 0) return false;
    weapons.reloadTimer = RELOAD_TIME;
    return true;
  }

  function stageOwned(mag = MAG_SIZE, reserve = 36) {
    weapons.owned = true;
    weapons.mag = mag;
    weapons.reserve = reserve;
  }

  // Staging helper for the shootout screenshot: re-light the muzzle
  // flash and tracer from the last real shot, so the flash is still on
  // screen at the capture frame instead of dying 0.06 s after the shot.
  // No-ops until at least one real shot has been fired.
  function stageFlash() {
    if (!weapons.lastShotPos) return;
    flash.position.copy(weapons.lastShotPos);
    // A little larger than stock: at screenshot distance the 1.1 m
    // flash is a sliver, but 2x reads as a yellow box over Mara.
    flash.scale.setScalar(1.3);
    flash.visible = true;
    flashMat.opacity = 1;
    weapons.flashTimer = 0.12;
    tracerMat.opacity = 0.9;
    weapons.tracerTimer = 0.12;
  }

  function update(dt) {
    weapons.spinTimer += dt;
    pistol.rotation.y = weapons.spinTimer * 1.4;
    pistol.position.y = 2.6 + Math.sin(weapons.spinTimer * 2) * 0.25;
    if (weapons.cooldown > 0) weapons.cooldown -= dt;
    if (weapons.reloadTimer > 0) {
      weapons.reloadTimer -= dt;
      if (weapons.reloadTimer <= 0) {
        weapons.reloadTimer = 0;
        const need = MAG_SIZE - weapons.mag;
        const moved = Math.min(need, weapons.reserve);
        weapons.mag += moved;
        weapons.reserve -= moved;
      }
    }
    if (weapons.tracerTimer > 0) {
      weapons.tracerTimer -= dt;
      if (weapons.tracerTimer <= 0) tracerMat.opacity = 0;
    }
    if (weapons.flashTimer > 0) {
      weapons.flashTimer -= dt;
      flashMat.opacity = Math.max(0, weapons.flashTimer / 0.06);
      flash.rotation.z += dt * 20;
      if (weapons.flashTimer <= 0) flash.visible = false;
    }
  }

  return weapons;
}
