// casino.js — the Golden Gull casino: 3-reel slots and a
// higher/lower card game. Money never moves here: every method returns
// a delta and main.js applies it to the wallet. The casino block sits
// at (155, 155); its door faces south, so Mara walks in from the
// street on the south side.

import * as THREE from 'three';

export const CASINO_POS = { x: 155, z: 155 };
export const SLOT_BETS = [50, 100, 250];
export const SLOT_JACKPOT = 2500;

const REEL_SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
// Payout multipliers for three of a kind, keyed by symbol index.
const TRIPLE_PAY = [4, 5, 6, 8, 12, 50];
// Any two matching end symbols pay a small consolation.
const PAIR_PAY = 1;

function rollReel() {
  return Math.floor(Math.random() * REEL_SYMBOLS.length);
}

function reelText(reels) {
  return reels.map((r) => REEL_SYMBOLS[r]).join(' ');
}

export function createCasino(scene, audio) {
  const doorPos = new THREE.Vector3(CASINO_POS.x, 0, CASINO_POS.z + 12);
  const tablePos = new THREE.Vector3(CASINO_POS.x, 0, CASINO_POS.z - 2);
  const felt = new THREE.MeshStandardMaterial({ color: 0x1d5c33, roughness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xd9a441, roughness: 0.35, metalness: 0.6,
  });

  // Felt card table inside the casino, with a gold rim.
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.25, 20), felt);
  top.position.y = 1.0;
  table.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.09, 8, 28), gold);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.12;
  table.add(rim);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.0, 10),
    new THREE.MeshStandardMaterial({ color: 0x3a2b4a, roughness: 0.8 }));
  leg.position.y = 0.5;
  table.add(leg);
  table.position.copy(tablePos);
  if (scene) scene.add(table);

  // A row of three slot machines along the north wall.
  const slots = [];
  const machineMat = new THREE.MeshStandardMaterial({ color: 0x8a1f2d, roughness: 0.5 });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x111111, emissive: 0x224422, emissiveIntensity: 0.7,
  });
  for (let i = -1; i <= 1; i++) {
    const machine = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.8), machineMat);
    body.position.y = 0.95;
    machine.add(body);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.06), screenMat);
    screen.position.set(0, 1.45, 0.42);
    machine.add(screen);
    const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), gold);
    lever.position.set(0.62, 1.5, 0.2);
    lever.rotation.z = -0.5;
    machine.add(lever);
    machine.position.set(CASINO_POS.x + i * 2.4, 0, CASINO_POS.z - 8.5);
    if (scene) scene.add(machine);
    slots.push({ group: machine, screen, spin: 0, reels: [0, 0, 0] });
  }

  // Warm hanging lamps over the table.
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffe9a8, emissive: 0xffc860, emissiveIntensity: 0.9,
  });
  for (let i = -1; i <= 1; i++) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lampMat);
    lamp.position.set(tablePos.x + i * 2.2, 3.4, tablePos.z);
    if (scene) scene.add(lamp);
  }

  const casino = {
    doorPos,
    tablePos,
    slots,
    table,
    inside: false,
    balance: 0,
    // Higher/lower state.
    card: 0,
    round: 0,
    pot: 0,
    playing: false,
    won: 0,
    lost: 0,
    spins: 0,

    isNearDoor(pos) {
      if (!pos) return false;
      const dx = pos.x - doorPos.x;
      const dz = pos.z - doorPos.z;
      return dx * dx + dz * dz < 4.5 * 4.5;
    },

    doorCheck(pos) {
      return casino.isNearDoor(pos);
    },

    isNearTable(pos) {
      if (!pos) return false;
      const dx = pos.x - tablePos.x;
      const dz = pos.z - tablePos.z;
      return dx * dx + dz * dz < 3.5 * 3.5;
    },

    tableCheck(pos) {
      return casino.isNearTable(pos);
    },

    // One slots pull. Returns { delta, text, reels } — delta is the
    // net money change (negative when the bet is lost).
    pullSlots(bet) {
      const stake = SLOT_BETS.includes(bet) ? bet : 50;
      const reels = [rollReel(), rollReel(), rollReel()];
      casino.spins += 1;
      for (const slot of slots) {
        slot.reels = reels.slice();
        slot.spin = 0.9;
      }
      let delta = -stake;
      let text = `🎰 ${reelText(reels)} — no luck, -$${stake}.`;
      if (reels[0] === reels[1] && reels[1] === reels[2]) {
        const sym = reels[0];
        const win = sym === 5 ? SLOT_JACKPOT : stake * TRIPLE_PAY[sym];
        delta = win - stake;
        text = sym === 5
          ? `🎰 ${reelText(reels)} — JACKPOT! Wins $${win.toLocaleString('en-US')}!`
          : `🎰 ${reelText(reels)} — three ${REEL_SYMBOLS[sym]}! Wins $${win}.`;
        casino.won += win;
      } else if (reels[0] === reels[1] || reels[1] === reels[2]) {
        const refund = stake * PAIR_PAY;
        delta = refund - stake; // 0: the stake comes back
        text = `🎰 ${reelText(reels)} — a pair, bet back ($${refund}).`;
      } else {
        casino.lost += stake;
      }
      if (audio) {
        if (delta > 0) audio.jingle();
        else audio.thud();
      }
      return { delta, text, reels };
    },

    pull(bet) {
      return casino.pullSlots(bet);
    },

    // Sit at the card table: buy in with a stake, first card is dealt.
    sitDown(stake) {
      const buyIn = typeof stake === 'number' && stake > 0 ? Math.floor(stake) : 50;
      casino.card = 2 + Math.floor(Math.random() * 13);
      casino.round = 0;
      casino.pot = buyIn;
      casino.playing = true;
      if (audio) audio.chime();
      return {
        ok: true,
        text: `🃏 Bought in for $${buyIn}. First card: ${casino.cardName()}. Higher or lower?`,
      };
    },

    cardName() {
      const names = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
      return names[casino.card] || String(casino.card);
    },

    // Guess the next card. Returns { delta, done, text }: delta is
    // only non-zero when the game ends (cash-out or bust).
    guess(choice) {
      if (!casino.playing) {
        return { delta: 0, done: true, text: 'Sit down at the table first.' };
      }
      const next = 2 + Math.floor(Math.random() * 13);
      const higher = choice === 'higher' || choice === 'high' || choice === 'up';
      const correct = next === casino.card
        ? false
        : higher ? next > casino.card : next < casino.card;
      const oldName = casino.cardName();
      casino.card = next;
      if (!correct) {
        casino.playing = false;
        casino.lost += casino.pot;
        const lost = casino.pot;
        casino.pot = 0;
        if (audio) audio.thud();
        return {
          delta: -lost,
          done: true,
          text: `🃏 ${oldName} → ${casino.cardName()}: wrong. Lost $${lost}.`,
        };
      }
      casino.round += 1;
      casino.pot *= 2;
      if (audio) audio.chime();
      if (casino.round >= 3) {
        casino.playing = false;
        const win = casino.pot;
        casino.won += win;
        casino.pot = 0;
        return {
          delta: win,
          done: true,
          text: `🃏 ${oldName} → ${casino.cardName()}: right, 3 rounds! Doubled to $${win}!`,
        };
      }
      return {
        delta: 0,
        done: false,
        text: `🃏 ${oldName} → ${casino.cardName()}: right! Pot is now $${casino.pot}. Again, or cash out?`,
      };
    },

    higherLower(choice) {
      return casino.guess(choice);
    },

    // Walk away from the table with whatever is in the pot.
    cashOut() {
      if (!casino.playing || casino.pot <= 0) {
        return { delta: 0, text: 'Nothing to cash out.' };
      }
      const win = casino.pot;
      casino.playing = false;
      casino.pot = 0;
      casino.won += win;
      if (audio) audio.jingle();
      return { delta: win, text: `💵 Cashed out $${win}.` };
    },

    statusText() {
      if (casino.playing) {
        return `🃏 Card ${casino.cardName()} · pot $${casino.pot} · round ${casino.round}/3`;
      }
      return `🎰 Golden Gull — slots $50/$100/$250 · jackpot $${SLOT_JACKPOT.toLocaleString('en-US')} · won $${casino.won} / lost $${casino.lost}`;
    },

    markers() {
      return [{ x: CASINO_POS.x, z: CASINO_POS.z, kind: 'casino', label: 'Casino' }];
    },

    update(dt) {
      const step = dt || 0;
      for (const slot of slots) {
        if (slot.spin > 0) {
          slot.spin = Math.max(0, slot.spin - step);
          slot.screen.rotation.z = Math.sin(slot.spin * 30) * 0.08;
        }
      }
    },

    saveData() {
      return { won: casino.won, lost: casino.lost, spins: casino.spins };
    },

    getSaveData() {
      return casino.saveData();
    },

    loadData(data) {
      const d = data || {};
      casino.won = d.won || 0;
      casino.lost = d.lost || 0;
      casino.spins = d.spins || 0;
    },

    loadSaveData(data) {
      casino.loadData(data);
    },
  };
  return casino;
}
