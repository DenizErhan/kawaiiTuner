/* The metronome screen: tempo controls, beat dots, tap tempo, and the figure that
   keeps the beat (lucky cat in kawaii style, pendulum in classic; CSS shows one).
   The bar on top (#cue) belongs to the band's setlists, which fill it in. */
import { settings, setBpm, setBeats, BPM_MIN, BPM_MAX, BPM_DEFAULT, BEATS_MIN, BEATS_MAX } from '../../core/settings.js';
import { createMetronome, tempoName } from '../../core/metronome.js';
import { requestWakeLock, releaseWakeLock } from '../../services/wake-lock.js';
import { holdToRepeat, onDoubleTap } from '../../ui/controls.js';
import { t } from '../../i18n/i18n.js';
import { html, render } from '../../ui/html.js';
import { PAW, icon } from '../../ui/icons.js';
import { $ } from '../../ui/dom.js';
import { createManeki } from './maneki.js';
import { createPendulum } from './pendulum.js';

const TAP_RESET_MS = 2000; // a pause this long starts a new tap-tempo measurement

const template = () => html`
  <section class="view view-metro" id="viewMetro" data-run="off" hidden>
    <div class="cue" id="cue" hidden>
      <button class="cue-btn" id="cuePrev" aria-label="${t('metronome.prevSong')}">${icon('back')}</button>
      <div class="cue-info"><small id="cuePos"></small><strong id="cueTitle"></strong></div>
      <button class="cue-btn" id="cueNext" aria-label="${t('metronome.nextSong')}">${icon('next')}</button>
      <button class="cue-btn cue-x" id="cueClose" aria-label="${t('metronome.closeSong')}">${icon('close', 20)}</button>
    </div>
    <div class="beat-dots" id="beatDots" aria-hidden="true"></div>
    <svg class="figure maneki" id="maneki" viewBox="0 0 240 250" role="img" aria-label="${t('metronome.cat')}"></svg>
    <svg class="figure pendulum" id="pendulum" viewBox="0 0 240 250" role="img" aria-label="${t('metronome.pendulum')}"></svg>

    <div class="tempo">
      <button class="round-btn" id="bpmMinus" aria-label="${t('metronome.slower')}">&minus;</button>
      <div class="bpm">
        <output id="bpmVal" aria-live="polite"></output>
        <span class="bpm-unit">${t('metronome.bpm')} · <span id="tempoName"></span></span>
      </div>
      <button class="round-btn" id="bpmPlus" aria-label="${t('metronome.faster')}">+</button>
    </div>
    <input type="range" class="slider" id="bpmSlider" step="1" aria-label="${t('metronome.slider')}">

    <div class="metro-row">
      <div class="mini-stepper">
        <span class="lbl">${t('metronome.beats')}</span>
        <button id="beatsMinus" aria-label="${t('metronome.fewerBeats')}">&minus;</button>
        <output id="beatsVal"></output>
        <button id="beatsPlus" aria-label="${t('metronome.moreBeats')}">+</button>
      </div>
      <button class="tap" id="btnTap"><span class="tap-short">${t('metronome.tap')}</span><span class="tap-long">${t('metronome.tapTempo')}</span></button>
    </div>

    <div class="spacer"></div>
    <button class="go" id="btnMetro">${PAW}<span id="btnMetroLabel">${t('common.start')}</span></button>
  </section>`;

/** Mounts the metronome screen into parent. */
export function createMetronomeView(parent) {
  const view = render(template());
  parent.appendChild(view);
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
    $('btnMetroLabel').textContent = t('common.stop');
    requestWakeLock();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    if (!metro.running) return;
    metro.stop();
    cancelAnimationFrame(raf);
    view.dataset.run = 'off';
    $('btnMetroLabel').textContent = t('common.start');
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

  /** Set tempo and/or beats from outside (a song from the band's list); null leaves it as is. */
  function load(bpm, beats) {
    if (bpm) changeBpm(bpm);
    if (beats) changeBeats(beats);
  }

  return {
    id: 'metronome',
    el: view,
    head: () => ({ title: t('nav.metronome'), modes: true }),
    show() {},
    hide: stop,
    load,
    get running() { return metro.running; },
  };
}
