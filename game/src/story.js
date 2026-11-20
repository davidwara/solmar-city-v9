// story.js — mission intro cutscenes for Solmar City.
// Before missions 1, 4, 7 and 10 (job indices 0, 3, 6, 9) a short
// dialogue plays in the typewriter overlay: Mara, Dex and Rosa talk the
// job over, and any key advances the lines or skips the scene. Jobs
// without a cutscene return false from show() so the caller just runs
// the job straight away.

// Jobs (0-based) that open with a cutscene: missions 1, 4, 7 and 10.
export const CUTSCENE_JOBS = [0, 3, 6, 9];

// Dialogue scripts, written for this build. Each line carries its
// speaker so the overlay can show who is talking.
const SCRIPTS = {
  0: [
    { who: 'Dex', text: 'Mara. You made it. Rico left a package down at the marina pier — small box, no questions.' },
    { who: 'Mara', text: 'First day back in Solmar and I am already running errands for Rico. Some things never change.' },
    { who: 'Dex', text: 'It is one pickup, one drop. Easy money, and nobody in this town works for free — not even you.' },
    { who: 'Rosa', text: 'Take the coast road, Mara. The pier is quiet this morning. And Mara? Welcome home.' },
    { who: 'Mara', text: 'Home. Right. Let me go get your box before I start believing that.' },
  ],
  3: [
    { who: 'Rosa', text: 'Midnight run, Mara. North edge of the city. The package is waiting and the streets are dark.' },
    { who: 'Mara', text: 'Dark suits me. What is the catch, Rosa? There is always a catch with you two.' },
    { who: 'Dex', text: 'The catch is the law. Patrols are thick up north after midnight — two minutes, no dawdling.' },
    { who: 'Rosa', text: 'Keep your lights low and your speed high. If a cruiser turns your way, do not stop to chat.' },
    { who: 'Mara', text: 'Two minutes. Fine. Tell the buyer his package is already halfway there.' },
  ],
  6: [
    { who: 'Dex', text: 'This one is bigger, Mara. A crate at the marina pier. The moment you lift it, the whole city knows.' },
    { who: 'Mara', text: 'Roadblocks, I am guessing. You always save the fun part for last, Dex.' },
    { who: 'Rosa', text: 'They go up the second the crate moves. East docks, fast lanes, no sightseeing on the way.' },
    { who: 'Dex', text: 'Twelve hundred if it lands. And Mara — if they box you in, ditch the crate and run. Crates can be replaced.' },
    { who: 'Mara', text: 'I am not ditching anything. Start the clock when I touch that crate.' },
  ],
  9: [
    { who: 'Rosa', text: 'Time to get your feet wet, Mara. The drop is across the bay, on the island jetty.' },
    { who: 'Mara', text: 'A boat job. I have not sailed since I was sixteen and my uncle still trusted me with his skiff.' },
    { who: 'Dex', text: 'Grab a boat at the marina. The delivery only counts if you arrive by water — no shortcuts over the causeway.' },
    { who: 'Rosa', text: 'Mind the tide and mind the dark water past the marina. Four minutes, then the buyer walks.' },
    { who: 'Mara', text: 'Four minutes on the water. I will be waving at the jetty before the buyer finishes his coffee.' },
  ],
};

// Typewriter speed: characters revealed per second.
const TYPE_SPEED = 42;

// DOM ids for the story overlay (index.html provides all of these).
const IDS = {
  overlay: 'story-overlay',
  box: 'story-box',
  who: 'story-who',
  text: 'story-text',
  hint: 'story-hint',
};

function grab(id) {
  if (typeof document === 'undefined') return null;
  return document.getElementById(id);
}

export function createStory() {
  const el = {
    overlay: grab(IDS.overlay),
    box: grab(IDS.box),
    who: grab(IDS.who),
    text: grab(IDS.text),
    hint: grab(IDS.hint),
  };

  const s = {
    active: false,
    jobIndex: -1,
    lines: [],
    lineIndex: 0,
    shown: 0,
    charClock: 0,
    onDone: null,

    // Show the cutscene for a job when one exists. Returns true when a
    // cutscene was shown; false when there is none (the caller then just
    // runs its callback itself).
    show(jobIndex, onDone) {
      const script = SCRIPTS[jobIndex];
      if (!script || !script.length) return false;
      s.active = true;
      s.jobIndex = jobIndex;
      s.lines = script;
      s.lineIndex = 0;
      s.shown = 0;
      s.charClock = 0;
      s.onDone = typeof onDone === 'function' ? onDone : null;
      s.renderLine();
      if (el.overlay) el.overlay.style.display = 'flex';
      if (el.hint) el.hint.textContent = 'Any key to continue';
      return true;
    },

    // Paint the current line's speaker and the typed-so-far text.
    renderLine() {
      const line = s.lines[s.lineIndex];
      if (!line) return;
      if (el.who) el.who.textContent = line.who;
      if (el.text) el.text.textContent = line.text.slice(0, Math.floor(s.shown));
      if (el.box) el.box.setAttribute('data-speaker', line.who.toLowerCase());
    },

    // Finish the current line instantly (used by advance when typing).
    finishLine() {
      const line = s.lines[s.lineIndex];
      if (!line) return;
      s.shown = line.text.length;
      s.renderLine();
    },

    // Any key: while a line is still typing, complete it; otherwise
    // step to the next line, or close the scene at the end.
    advance() {
      if (!s.active) return;
      const line = s.lines[s.lineIndex];
      if (!line) {
        s.close();
        return;
      }
      if (s.shown < line.text.length) {
        s.finishLine();
        return;
      }
      s.lineIndex += 1;
      if (s.lineIndex >= s.lines.length) {
        s.close();
        return;
      }
      s.shown = 0;
      s.charClock = 0;
      s.renderLine();
    },

    // Skip the whole scene at once (used by a dedicated skip key).
    skip() {
      if (!s.active) return;
      s.close();
    },

    // Hide the overlay and hand control back to the job.
    close() {
      s.active = false;
      if (el.overlay) el.overlay.style.display = 'none';
      if (el.text) el.text.textContent = '';
      if (el.who) el.who.textContent = '';
      const done = s.onDone;
      s.onDone = null;
      if (done) done();
    },

    // Per-frame tick: reveal the typewriter characters over time.
    update(dt) {
      if (!s.active) return;
      const line = s.lines[s.lineIndex];
      if (!line) return;
      if (s.shown >= line.text.length) return;
      s.charClock += dt;
      const target = Math.min(line.text.length, Math.floor(s.charClock * TYPE_SPEED));
      if (target !== Math.floor(s.shown)) {
        s.shown = target;
        s.renderLine();
      }
    },

    // True while a cutscene is on screen (handy for the main loop).
    isPlaying() {
      return s.active;
    },
  };

  return s;
}
