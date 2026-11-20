// player.js — Mara Voss on foot: third-person controller, jump, and the
// shared box-collision resolver (the police module imports it too).
import * as THREE from 'three';

const WALK_SPEED = 6;
const RUN_SPEED = 10.5;
const JUMP_SPEED = 8.5;
const GRAVITY = 24;

// The player this module created via createPlayer. The §4 contract calls
// the exported updatePlayer dt-first — updatePlayer(dt, input, yaw,
// colliders, bound) — so that path routes to this instance.
let currentPlayer = null;

// Push a ground-plane position out of every collider box it overlaps.
// pos is a Vector3-like {x, z}; radius is Mara's (or a car's) half-width.
// Each box is {minX, maxX, minZ, maxZ}. The push goes along the axis
// with the smallest penetration, so sliding along a wall feels natural.
export function resolveCollisions(pos, radius, colliders) {
  const list = colliders || [];
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b) continue;
    const minX = b.minX - radius;
    const maxX = b.maxX + radius;
    const minZ = b.minZ - radius;
    const maxZ = b.maxZ + radius;
    if (pos.x <= minX || pos.x >= maxX || pos.z <= minZ || pos.z >= maxZ) {
      continue;
    }
    const pushL = pos.x - minX;
    const pushR = maxX - pos.x;
    const pushT = pos.z - minZ;
    const pushB = maxZ - pos.z;
    const smallest = Math.min(pushL, pushR, pushT, pushB);
    if (smallest === pushL) pos.x = minX;
    else if (smallest === pushR) pos.x = maxX;
    else if (smallest === pushT) pos.z = minZ;
    else pos.z = maxZ;
  }
  return pos;
}

// Single-box alias for callers that only have one collider.
export const resolveCollision = resolveCollisions;

// Turn the player to face a target position (used by cutscenes, the
// bodyguard job and anything that needs Mara looking at something).
export function faceToward(player, target) {
  if (!player || !target) return;
  const p = player.pos || player.position;
  if (!p) return;
  const tx = target.x !== undefined ? target.x : target[0];
  const tz = target.z !== undefined ? target.z : target[2];
  player.heading = Math.atan2(tx - p.x, tz - p.z);
  const fig = player.figure || player.mesh;
  if (fig) fig.rotation.y = player.heading;
}

// Build Mara's visible figure: jacket, dark trousers, cap, simple limbs
// that swing while she walks. The figure faces +z at heading 0.
function buildFigure() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2e6f8e });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2a2d34 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1c1410 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), jacket);
  torso.position.y = 1.12;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), skin);
  head.position.y = 1.72;
  g.add(head);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.38), hair);
  cap.position.y = 1.94;
  g.add(cap);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.24), pants);
  legL.position.set(-0.16, 0.36, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), jacket);
  armL.position.set(-0.42, 1.14, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.42;
  g.add(armR);

  g.userData.limbs = { legL, legR, armL, armR };
  return g;
}

// Factory: build the player and drop the figure into the scene.
export function createPlayer(scene) {
  const figure = buildFigure();
  figure.position.set(0, 0, 0);
  if (scene) scene.add(figure);

  const pos = new THREE.Vector3(0, 0, 0);
  const player = {
    pos,
    position: pos, // same vector, both spellings
    heading: 0,
    figure,
    mesh: figure, // same group, both spellings
    moving: false,
    aiming: false,
    speed: 0,
    vy: 0,
    grounded: true,
    walkPhase: 0,
  };
  // Bound method form, so main.js can call player.update(dt, ...) too.
  player.update = (dt, input, camYaw, colliders, bound) =>
    updatePlayer(player, dt, input, camYaw, colliders, bound);
  // Remember the created player so the dt-first contract call
  // updatePlayer(dt, input, yaw, colliders, bound) routes to it.
  currentPlayer = player;
  return player;
}

// Read the movement keys out of whatever input shape main.js hands us:
// either {forward, back, left, right, run, jump} or raw {w, a, s, d}.
function readInput(input) {
  const k = input || {};
  return {
    f: !!(k.forward || k.w || k.up),
    b: !!(k.back || k.s || k.down),
    l: !!(k.left || k.a),
    r: !!(k.right || k.d),
    run: !!(k.run || k.shift),
    jump: !!(k.jump || k.space),
  };
}

// On-foot update. dt is seconds (clamped by the caller). camYaw is the
// camera's orbit yaw; WASD moves relative to it. Shift runs, Space
// jumps. Collisions resolve against the collider boxes and the bound
// keeps Mara inside the playable area.
//
// Two call forms: the §4 contract form updatePlayer(dt, input, yaw,
// colliders, bound) — dt first, routed to the player created by
// createPlayer — and the player-first form updatePlayer(player, dt,
// input, yaw, colliders, bound). A numeric first argument selects the
// dt-first form.
export function updatePlayer(player, dt, input, camYaw, colliders, bound) {
  if (typeof player === 'number') {
    // dt-first: (dt, input, yaw, colliders, bound) — the remaining
    // arguments shift one slot over from the player-first form.
    if (!currentPlayer) return null;
    return updatePlayer(currentPlayer, player, dt, input, camYaw, colliders);
  }
  if (!player) return null;
  const keys = readInput(input);
  const yaw = camYaw || 0;

  // Camera-relative axes: forward is where the camera looks, right is 90
  // degrees clockwise from it.
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);

  let mx = fx * (keys.f ? 1 : 0) + fx * (keys.b ? -1 : 0) + rx * (keys.r ? 1 : 0) + rx * (keys.l ? -1 : 0);
  let mz = fz * (keys.f ? 1 : 0) + fz * (keys.b ? -1 : 0) + rz * (keys.r ? 1 : 0) + rz * (keys.l ? -1 : 0);
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx /= len;
    mz /= len;
  }

  // Ease toward the target speed instead of snapping to it.
  const targetSpeed = len > 0 ? (keys.run ? RUN_SPEED : WALK_SPEED) : 0;
  player.speed += (targetSpeed - player.speed) * Math.min(1, 10 * dt);
  if (Math.abs(player.speed) < 0.05 && targetSpeed === 0) player.speed = 0;

  player.moving = len > 0;
  if (player.moving) {
    const want = Math.atan2(mx, mz);
    let diff = want - player.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    player.heading += diff * Math.min(1, 14 * dt);
    player.walkPhase += dt * player.speed * 1.6;
  }

  player.pos.x += mx * player.speed * dt;
  player.pos.z += mz * player.speed * dt;

  // Jump + gravity, landing back on the street.
  if (keys.jump && player.grounded) {
    player.vy = JUMP_SPEED;
    player.grounded = false;
  }
  if (!player.grounded) {
    player.vy -= GRAVITY * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y <= 0) {
      player.pos.y = 0;
      player.vy = 0;
      player.grounded = true;
    }
  }

  // Stay inside the playable area, then out of the buildings.
  const limit = bound !== undefined && bound !== null ? bound : 235;
  player.pos.x = Math.max(-limit, Math.min(limit, player.pos.x));
  player.pos.z = Math.max(-limit, Math.min(limit, player.pos.z));
  resolveCollisions(player.pos, 0.5, colliders);

  // Sync the visible figure and swing the limbs.
  const fig = player.figure || player.mesh;
  if (fig) {
    fig.position.copy(player.pos);
    fig.rotation.y = player.heading;
    const swing = player.moving ? Math.sin(player.walkPhase) * 0.55 : 0;
    const limbs = fig.userData.limbs;
    if (limbs) {
      limbs.legL.rotation.x = swing;
      limbs.legR.rotation.x = -swing;
      limbs.armL.rotation.x = -swing * 0.8;
      limbs.armR.rotation.x = swing * 0.8;
    }
  }
  return player;
}
