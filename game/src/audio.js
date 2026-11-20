// audio.js — fully procedural WebAudio sound for Solmar City.
// No audio files, no network: every sound is synthesized live with
// oscillators and filtered noise. If the browser cannot create an
// AudioContext (headless screenshot runs), every call is a safe no-op
// and the game keeps running silently.

const STATIONS = [
  null,
  {
    name: 'SOLMAR FM — Bassline',
    bpm: 126,
    bass: [55, 0, 65.41, 0, 49, 0, 58.27, 73.42],
    pad: null,
  },
  {
    name: 'NIGHT TIDE — Synth',
    bpm: 84,
    bass: [110, 0, 0, 0, 87.31, 0, 0, 0],
    pad: [220, 261.63, 329.63],
  },
];

// Eighth-note length in seconds for a station tempo.
function stepLength(station) {
  return 60 / station.bpm / 2;
}

function clamp01(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function createAudio() {
  // Alternates the footstep pitch so walking does not sound mechanical.
  let stepFlip = false;
  const audio = {
    muted: false,
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    boatEngineOsc: null,
    boatEngineGain: null,
    boatNoiseGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenLfo: null,
    stepTimer: 0,
    radioStation: 0,
    radioStep: 0,
    radioTimer: 0,

    // Build the context lazily on first use. Wires the master gain and
    // the three persistent voices (car engine, boat engine + spray,
    // police siren), all silent until the game drives them.
    ensure() {
      if (audio.ctx) {
        if (audio.ctx.state === 'suspended') {
          audio.ctx.resume().catch(() => {});
        }
        return true;
      }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        const ctx = new AC();
        audio.ctx = ctx;
        const master = ctx.createGain();
        master.gain.value = audio.muted ? 0 : 0.5;
        master.connect(ctx.destination);
        audio.master = master;

        // Car engine: sawtooth through a low-pass, own gain.
        const engFilter = ctx.createBiquadFilter();
        engFilter.type = 'lowpass';
        engFilter.frequency.value = 420;
        const engGain = ctx.createGain();
        engGain.gain.value = 0;
        const engOsc = ctx.createOscillator();
        engOsc.type = 'sawtooth';
        engOsc.frequency.value = 55;
        engOsc.connect(engFilter);
        engFilter.connect(engGain);
        engGain.connect(master);
        engOsc.start();
        audio.engineOsc = engOsc;
        audio.engineGain = engGain;

        // Boat engine: triangle at 42 Hz plus looped white noise
        // through a band-pass for the spray / wake hiss.
        const boatGain = ctx.createGain();
        boatGain.gain.value = 0;
        const boatOsc = ctx.createOscillator();
        boatOsc.type = 'triangle';
        boatOsc.frequency.value = 42;
        boatOsc.connect(boatGain);
        boatGain.connect(master);
        boatOsc.start();
        audio.boatEngineOsc = boatOsc;
        audio.boatEngineGain = boatGain;

        const noiseLen = ctx.sampleRate * 2;
        const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
        const noiseData = noiseBuf.getChannelData(0);
        for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = noiseBuf;
        noiseSrc.loop = true;
        const sprayFilter = ctx.createBiquadFilter();
        sprayFilter.type = 'bandpass';
        sprayFilter.frequency.value = 320;
        sprayFilter.Q.value = 0.8;
        const sprayGain = ctx.createGain();
        sprayGain.gain.value = 0;
        noiseSrc.connect(sprayFilter);
        sprayFilter.connect(sprayGain);
        sprayGain.connect(master);
        noiseSrc.start();
        audio.boatNoiseGain = sprayGain;

        // Police siren: sine wobbled by a slow square LFO.
        const sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        const sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'sine';
        sirenOsc.frequency.value = 750;
        const lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 1.6;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 220;
        lfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        lfo.start();
        audio.sirenOsc = sirenOsc;
        audio.sirenGain = sirenGain;
        audio.sirenLfo = lfo;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        return true;
      } catch (err) {
        audio.ctx = null;
        audio.master = null;
        return false;
      }
    },

    // One-shot note: oscillator + gain envelope decaying to silence.
    blip(freq, dur, type, vol, when) {
      if (!audio.ctx || !audio.master) return;
      try {
        const t0 = audio.ctx.currentTime + (when || 0);
        const osc = audio.ctx.createOscillator();
        const gain = audio.ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        gain.gain.setValueAtTime(vol == null ? 0.2 : vol, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        osc.connect(gain);
        gain.connect(audio.master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
      } catch (err) { /* sound is garnish; never break the game */ }
    },

    // A short burst of filtered noise (used by gunshot / thunder).
    burst(dur, filterFreq, vol, type) {
      if (!audio.ctx || !audio.master) return;
      try {
        const ctx = audio.ctx;
        const t0 = ctx.currentTime;
        const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = type || 'lowpass';
        filter.frequency.value = filterFreq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(audio.master);
        src.start(t0);
      } catch (err) { /* no-op */ }
    },

    unlock() {
      audio.ensure();
    },

    toggleMute() {
      audio.muted = !audio.muted;
      if (audio.master && audio.ctx) {
        try {
          audio.master.gain.setTargetAtTime(
            audio.muted ? 0 : 0.5, audio.ctx.currentTime, 0.05,
          );
        } catch (err) { /* no-op */ }
      }
      return audio.muted;
    },

    chime() {
      if (!audio.ensure()) return;
      audio.blip(660, 0.22, 'sine', 0.22, 0);
      audio.blip(990, 0.34, 'sine', 0.2, 0.12);
    },

    jingle() {
      if (!audio.ensure()) return;
      const notes = [523, 659, 784, 1047];
      for (let i = 0; i < notes.length; i++) {
        audio.blip(notes[i], 0.24, 'triangle', 0.2, i * 0.11);
      }
    },

    thud() {
      if (!audio.ensure()) return;
      audio.blip(90, 0.18, 'sine', 0.35, 0);
      audio.blip(60, 0.24, 'sine', 0.3, 0.03);
    },

    gunshot() {
      if (!audio.ensure()) return;
      audio.blip(180, 0.09, 'square', 0.3, 0);
      audio.blip(90, 0.16, 'sawtooth', 0.28, 0);
      audio.burst(0.12, 900, 0.25, 'highpass');
    },

    dryClick() {
      if (!audio.ensure()) return;
      audio.blip(1200, 0.05, 'square', 0.16, 0);
    },

    reloadClick() {
      if (!audio.ensure()) return;
      audio.blip(900, 0.06, 'square', 0.18, 0);
      audio.blip(700, 0.07, 'square', 0.18, 0.09);
    },

    horn() {
      if (!audio.ensure()) return;
      audio.blip(370, 0.28, 'square', 0.16, 0);
      audio.blip(466, 0.28, 'square', 0.16, 0);
    },

    setBoatEngine(speed01) {
      const s = clamp01(speed01);
      if (!audio.ctx) return;
      try {
        const t = audio.ctx.currentTime;
        const moving = s > 0.02;
        const engTarget = moving ? 0.03 + 0.05 * s : 0;
        const sprayTarget = moving ? 0.025 * s : 0;
        if (audio.boatEngineGain) {
          audio.boatEngineGain.gain.setTargetAtTime(engTarget, t, 0.15);
        }
        if (audio.boatEngineOsc) {
          audio.boatEngineOsc.frequency.setTargetAtTime(42 + 55 * s, t, 0.2);
        }
        if (audio.boatNoiseGain) {
          audio.boatNoiseGain.gain.setTargetAtTime(sprayTarget, t, 0.15);
        }
      } catch (err) { /* no-op */ }
    },

    thunder() {
      if (!audio.ensure()) return;
      audio.blip(48, 1.4, 'sine', 0.4, 0);
      audio.blip(62, 1.1, 'sine', 0.3, 0.08);
      audio.blip(38, 1.7, 'sine', 0.32, 0.15);
      audio.burst(1.2, 140, 0.22, 'lowpass');
    },

    shutter() {
      if (!audio.ensure()) return;
      audio.blip(2200, 0.04, 'square', 0.14, 0);
      audio.blip(1300, 0.05, 'square', 0.14, 0.07);
    },

    splash() {
      if (!audio.ensure()) return;
      audio.blip(320, 0.16, 'sine', 0.22, 0);
      audio.blip(180, 0.2, 'sine', 0.2, 0.06);
      audio.blip(520, 0.12, 'sine', 0.14, 0.12);
    },

    dogBark() {
      if (!audio.ensure()) return;
      audio.blip(740, 0.08, 'square', 0.2, 0);
      audio.blip(660, 0.09, 'square', 0.2, 0.13);
    },

    toggleStation() {
      audio.radioStation = (audio.radioStation + 1) % 3;
      audio.radioStep = 0;
      audio.radioTimer = 0;
      return audio.stationName();
    },

    stationName() {
      const st = STATIONS[audio.radioStation];
      return st ? st.name : '';
    },

    // Play one eighth-note step of the current station.
    radioStep() {
      if (!audio.ctx || audio.radioStation === 0) return;
      const st = STATIONS[audio.radioStation];
      if (!st) return;
      const idx = audio.radioStep % st.bass.length;
      const note = st.bass[idx];
      if (note) audio.blip(note, 0.22, 'triangle', 0.22, 0);
      if (audio.radioStation === 1 && idx % 2 === 1) {
        audio.blip(5200, 0.03, 'square', 0.05, 0);
      }
      if (audio.radioStation === 2 && idx === 0 && st.pad) {
        for (let i = 0; i < st.pad.length; i++) {
          audio.blip(st.pad[i], 1.6, 'sine', 0.05, 0);
        }
      }
      audio.radioStep += 1;
    },

    update(dt, s) {
      if (!audio.ctx || audio.muted) return;
      const state = s || {};
      try {
        const t = audio.ctx.currentTime;
        const speed = Math.abs(state.speed || 0);
        // Car engine follows speed only while driving.
        if (audio.engineGain && audio.engineOsc) {
          const target = state.inCar ? 0.05 + Math.min(0.12, speed * 0.006) : 0;
          audio.engineGain.gain.setTargetAtTime(target, t, 0.08);
          audio.engineOsc.frequency.setTargetAtTime(55 + 5 * speed, t, 0.08);
        }
        // Siren while wanted.
        if (audio.sirenGain) {
          const target = (state.wanted || 0) > 0 ? 0.05 : 0;
          audio.sirenGain.gain.setTargetAtTime(target, t, 0.2);
        }
        // Footsteps while moving on foot.
        if (state.moving && !state.inCar) {
          audio.stepTimer -= dt;
          if (audio.stepTimer <= 0) {
            audio.stepTimer = state.running ? 0.32 : 0.45;
            stepFlip = !stepFlip;
            audio.blip(stepFlip ? 130 : 155, 0.05, 'sine', 0.07, 0);
          }
        } else {
          audio.stepTimer = 0;
        }
        // Radio only while driving, stepped on eighth notes.
        if (state.inCar && audio.radioStation !== 0) {
          const st = STATIONS[audio.radioStation];
          audio.radioTimer -= dt;
          if (audio.radioTimer <= 0) {
            audio.radioTimer = stepLength(st);
            audio.radioStep();
          }
        } else {
          audio.radioTimer = 0;
        }
      } catch (err) { /* no-op */ }
    },
  };
  return audio;
}

export const RADIO_STATIONS = STATIONS;
