// Synthesized sound for the delta: no audio files, everything is WebAudio
// oscillators and filtered noise, started only after the player presses Start.

export function makeDawnAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let fanNoise = null;
  let fanGain = null;
  let musicTimer = null;
  let birdTimer = null;
  let enabled = false;
  let musicStep = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
  }

  // A slow dawn melody: pentatonic plucks over a soft drone, one note a beat.
  const MELODY = [392, 440, 523, 587, 659, 587, 523, 440, 392, 330, 392, 440];
  function musicTick() {
    if (!ctx || !enabled) return;
    const note = MELODY[musicStep % MELODY.length];
    musicStep++;
    blip(note, 0.9, 'triangle', 0.10);
    if (musicStep % 4 === 1) blip(note / 2, 1.6, 'sine', 0.07);
  }

  function birdChirp() {
    if (!ctx || !enabled) return;
    const base = 2200 + Math.random() * 1400;
    blip(base, 0.12, 'sine', 0.05, base * 1.4);
    setTimeout(() => blip(base * 1.2, 0.1, 'sine', 0.04, base * 0.9), 140);
  }

  return {
    start() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      enabled = true;
      if (!musicTimer) musicTimer = setInterval(musicTick, 620);
      if (!birdTimer) birdTimer = setInterval(birdChirp, 5200);
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 55;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 320;
        engineOsc.connect(f);
        f.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
        const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        fanNoise = ctx.createBufferSource();
        fanNoise.buffer = buf;
        fanNoise.loop = true;
        const bf = ctx.createBiquadFilter();
        bf.type = 'bandpass';
        bf.frequency.value = 900;
        fanGain = ctx.createGain();
        fanGain.gain.value = 0;
        fanNoise.connect(bf);
        bf.connect(fanGain);
        fanGain.connect(master);
        fanNoise.start();
      }
    },
    setEngine(speed01, onBoat) {
      if (!ctx || !enabled) return;
      const t = ctx.currentTime;
      if (engineGain) {
        engineGain.gain.setTargetAtTime(onBoat ? 0 : 0.05 + speed01 * 0.07, t, 0.1);
        engineOsc.frequency.setTargetAtTime(50 + speed01 * 90, t, 0.1);
      }
      if (fanGain) fanGain.gain.setTargetAtTime(onBoat ? 0.04 + speed01 * 0.08 : 0, t, 0.1);
    },
    shoot() { noiseBurst(0.16, 0.5, 1800); blip(160, 0.12, 'square', 0.25, 60); },
    hit() { noiseBurst(0.1, 0.3, 900); },
    pickup() { blip(660, 0.14, 'sine', 0.16); setTimeout(() => blip(880, 0.2, 'sine', 0.16), 110); },
    cash() { blip(523, 0.12, 'triangle', 0.14); setTimeout(() => blip(784, 0.22, 'triangle', 0.14), 100); },
    wanted() { blip(220, 0.3, 'sawtooth', 0.16, 330); setTimeout(() => blip(330, 0.3, 'sawtooth', 0.16, 220), 280); },
    missionDone() {
      blip(523, 0.18, 'triangle', 0.16);
      setTimeout(() => blip(659, 0.18, 'triangle', 0.16), 160);
      setTimeout(() => blip(784, 0.3, 'triangle', 0.18), 320);
    },
    crash() { noiseBurst(0.35, 0.5, 500); },
    splash() { noiseBurst(0.4, 0.25, 700); },
    siren() { blip(700, 0.5, 'sine', 0.05, 950); },
    stop() {
      enabled = false;
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
      if (birdTimer) { clearInterval(birdTimer); birdTimer = null; }
      if (engineGain) engineGain.gain.value = 0;
      if (fanGain) fanGain.gain.value = 0;
    },
  };
}
