import * as THREE from 'three';

// WASTED — health hits zero, the screen fades in, and after a short
// countdown Mara wakes up at the hospital, 10% of her cash lighter.
// The bill is itemised: a bed charge plus treatment, totalling 10%.

export const HOSPITAL_POS = new THREE.Vector3(0, 0, -20);
export const HOSPITAL_POSITION = HOSPITAL_POS;

const COUNTDOWN_SECONDS = 3;

export function createWasted() {
  let showing = false;
  let timer = 0;
  let done = null;

  // Itemised hospital bill: bed + treatment, totalling 10% of the cash
  // Mara was carrying when she went down.
  function bill(money) {
    const total = Math.max(0, Math.floor((money || 0) * 0.1));
    const bed = Math.floor(total * 0.4);
    const treatment = total - bed;
    return { bed, treatment, total };
  }

  // One-line itemised bill for the WASTED screen, e.g.
  // "Hospital bill — Bed $40 + Treatment $60 = $100".
  function billText(money) {
    const { bed, treatment, total } = bill(money);
    return (
      'Hospital bill — Bed $' +
      bed +
      ' + Treatment $' +
      treatment +
      ' = $' +
      total
    );
  }

  function show(callback) {
    showing = true;
    timer = COUNTDOWN_SECONDS;
    done = typeof callback === 'function' ? callback : null;
    if (typeof document !== 'undefined') {
      const screen = document.getElementById('wasted-screen');
      if (screen) screen.style.display = 'flex';
    }
  }

  function hide() {
    showing = false;
    done = null;
    if (typeof document !== 'undefined') {
      const screen = document.getElementById('wasted-screen');
      if (screen) screen.style.display = 'none';
    }
  }

  // Count the WASTED screen down, then hand control back to the caller.
  function update(dt) {
    if (!showing) return;
    timer -= dt || 0;
    if (timer <= 0) {
      const callback = done;
      hide();
      if (callback) callback();
    }
  }

  return {
    bill,
    billText,
    show,
    hide,
    update,
    get showing() {
      return showing;
    },
    get timeLeft() {
      return Math.max(0, timer);
    },
  };
}
