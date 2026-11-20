// save.js — localStorage save/load for Solmar City.
// One key, one JSON blob. Never throws: when storage is missing or
// blocked (headless runs, private mode) every call fails soft so the
// game keeps running with a fresh state instead of crashing.

const SAVE_KEY = 'solmar-city-save-v1';

// The full shape a save carries. main.js fills it in from live state;
// loadSave hands back whatever was stored, even if an older build wrote
// fewer fields — callers must treat every field as optional.
export function defaultSave() {
  return {
    money: 1250,
    missionsCompleted: 0,
    bestWanted: 0,
    health: 100,
    timesWasted: 0,
    timesBusted: 0,
    shotsFired: 0,
    packagesCollected: 0,
    photosTaken: 0,
    turfOwned: 0,
    paintIndex: 0,
    engineLevel: 0,
    armour: false,
    fishing: null,
    races: null,
    housing: null,
    casino: null,
    delivery: null,
    pets: null,
  };
}

function storageAvailable() {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch (e) {
    return false;
  }
}

// Read the saved object, or null when there is none / it is unreadable.
export function loadSave() {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (e) {
    return null;
  }
}

// Write the plain save object. Returns true when it stuck.
export function saveGame(data) {
  if (!storageAvailable()) return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data || {}));
    return true;
  } catch (e) {
    return false;
  }
}

// True when a readable save exists.
export function hasSave() {
  return loadSave() !== null;
}

// Wipe the save. Returns true when the key is gone afterwards.
export function clearSave() {
  if (!storageAvailable()) return false;
  try {
    localStorage.removeItem(SAVE_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

// Read the save with any missing fields filled from the defaults, so
// an older save (fewer fields) still loads cleanly into the current
// game. loadSave itself stays exact — this is the forgiving variant.
export function loadSaveWithDefaults() {
  const saved = loadSave();
  if (!saved) return null;
  return Object.assign(defaultSave(), saved);
}

// Short aliases — same four operations, same behaviour.
export const load = loadSave;
export const save = saveGame;
export const has = hasSave;
export const clear = clearSave;
