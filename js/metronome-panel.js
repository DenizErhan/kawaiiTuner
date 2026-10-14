/* The metronome mode: tempo controls, beat dots, tap tempo, and the figure that
   keeps the beat (lucky cat in kawaii style, pendulum in classic; CSS shows one). */
import { settings, setBpm, setBeats, BPM_MIN, BPM_MAX, BPM_DEFAULT, BEATS_MIN, BEATS_MAX } from './settings.js';
import { createMetronome, tempoName } from './metronome.js';
import { createManeki } from './maneki.js';
import { createPendulum } from './pendulum.js';
import { requestWakeLock, releaseWakeLock } from './wake-lock.js';
import { holdToRepeat, onDoubleTap } from './ui.js';

const $ = (id) => document.getElementById(id);
const TAP_RESET_MS = 2000; // a pause this long starts a new tap-tempo measurement

export function createMetronomePanel() {
  const view = $('viewMetro');
  const figures = [createManeki($('maneki')), createPendulum($('pendulum'), { minBpm: BPM_MIN, maxBpm: BPM_MAX })];
  const pose = (pos) => figures.forEach((f) => f.setPose(pos, settings.bpm));
  const metro = createMetronome({ bpm: settings.bpm, beats: settings.beats, onBeat });
  let raf = 0;

  function onBeat(beat) {
    $('beatDots').querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === beat));
    if (beat === 0 && settings.beats > 1) figures.forEach((f) => f.accent());
  }

  function buildDots() {
    const wrap = $('beatDots');
    wrap.textContent = '';
    for (let i = 0; i < settings.beats; i++) {
      const d = document.createElement('i');
      if (i === 0 && settings.beats > 1) d.className = 'accent';
      wrap.appendChild(d);
    }
  }

  function sync() {
    $('bpmVal').textContent = settings.bpm;
    $('tempoName').textContent = tempoName(settings.bpm);
    $('bpmSlider').value = settings.bpm;
    $('beatsVal').textContent = settings.beats;
  }

  function changeBpm(v) { setBpm(v); metro.setBpm(settings.bpm); sync(); if (!metro.running) pose(null); } // moves the pendulum weight
  function changeBeats(v) {
    if (v === settings.beats || v < BEATS_MIN || v > BEATS_MAX) return;
    setBeats(v); metro.setBeats(settings.beats); buildDots(); sync();
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    pose(metro.frame());
  }

  function start() {
    metro.start();
    view.dataset.run = 'on';
    $('btnMetroLabel').textContent = 'Stop';
    requestWakeLock();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    if (!metro.running) return;
    metro.stop();
    cancelAnimationFrame(raf);
    view.dataset.run = 'off';
    $('btnMetroLabel').textContent = 'Start';
    $('beatDots').querySelectorAll('i').forEach((d) => d.classList.remove('on'));
    releaseWakeLock();
    pose(null);
  }

  // tap tempo: average the gaps between the last few taps
  let taps = [];
  $('btnTap').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > TAP_RESET_MS) taps = [];
    taps.push(now);
    if (taps.length > 5) taps.shift();
    if (taps.length >= 2) changeBpm(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
    const b = $('btnTap');
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  });

  holdToRepeat($('bpmMinus'), () => changeBpm(settings.bpm - 1));
  holdToRepeat($('bpmPlus'), () => changeBpm(settings.bpm + 1));
  onDoubleTap($('bpmVal'), () => changeBpm(BPM_DEFAULT));
  const slider = $('bpmSlider');
  slider.min = BPM_MIN; slider.max = BPM_MAX;
  slider.addEventListener('input', () => changeBpm(Number(slider.value)));
  holdToRepeat($('beatsMinus'), () => changeBeats(settings.beats - 1));
  holdToRepeat($('beatsPlus'), () => changeBeats(settings.beats + 1));
  $('btnMetro').addEventListener('click', () => (metro.running ? stop() : start()));

  document.addEventListener('visibilitychange', () => {
    if (!metro.running) return;
    if (document.hidden) cancelAnimationFrame(raf); // keeps ticking; only the drawing pauses
    else { metro.resume(); requestWakeLock(); raf = requestAnimationFrame(loop); }
  });

  buildDots();
  sync();
  pose(null);

  return { stop, get running() { return metro.running; } };
}
