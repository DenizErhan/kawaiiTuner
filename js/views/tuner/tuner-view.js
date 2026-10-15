/* The tuner screen: mic -> pitch tracker -> gauge + readout. */
import { settings } from '../../core/settings.js';
import { NOTE_NAMES, noteFromFreq } from '../../core/notes.js';
import { findTuning, nearestString, centsFrom, freqOf, noteName } from '../../core/tunings.js';
import { createPitchTracker } from '../../core/pitch-tracker.js';
import { openMic } from '../../services/mic.js';
import { requestWakeLock, releaseWakeLock } from '../../services/wake-lock.js';
import { t } from '../../i18n/i18n.js';
import { html, render } from '../../ui/html.js';
import { PAW, icon } from '../../ui/icons.js';
import { $ } from '../../ui/dom.js';
import { createGauge } from './gauge.js';
import * as display from './display.js';
import { createTuningPicker, tuningLabel } from './tuning-picker.js';

const DETECT_MS = 33; // run detection at ~30 Hz

const MIC_ERRORS = { insecure: 'tuner.micInsecure', denied: 'tuner.micDenied', failed: 'tuner.micFailed' };

const template = () => html`
  <section class="view view-tuner" id="viewTuner" hidden>
    <div class="level" aria-hidden="true"><i id="level"></i></div>
    <div class="tuning">
      <button class="tuning-chip" id="btnTuning" aria-haspopup="dialog"><span id="tuningName"></span>${icon('down', 16)}</button>
      <div class="strings" id="strings" role="group" aria-label="${t('tuner.stringsLabel')}"></div>
    </div>
    <div class="note">
      <span class="acc" id="accFlat">${t('tuner.flat')}</span>
      <span class="name-wrap"><span class="name" id="noteName">—</span><sup class="oct" id="noteOct"></sup></span>
      <span class="acc" id="accSharp">${t('tuner.sharp')}</span>
    </div>
    <svg class="gauge" id="gauge" viewBox="0 0 300 196" role="img" aria-label="${t('tuner.gauge')}"></svg>
    <div class="readouts">
      <div class="card"><span class="lbl">${t('tuner.cents')}</span><span class="val" id="centsVal">—</span></div>
      <div class="card"><span class="lbl">${t('tuner.frequency')}</span><span class="val" id="hzVal">—</span><span class="sub" id="targetVal"></span></div>
    </div>
    <p class="status" id="status" role="status" aria-live="polite"></p>
    <div class="spacer"></div>
    <button class="go" id="btnGo">${PAW}<span id="btnGoLabel">${t('common.start')}</span></button>
  </section>`;

/** Mounts the tuner screen into parent. */
export function createTunerView(parent) {
  const view = render(template());
  parent.appendChild(view);
  const gauge = createGauge(view.querySelector('#gauge'));
  const tracker = createPitchTracker({ onPitch: showPitch, onLost: showIdle });
  const picker = createTuningPicker({ onChange: () => { locked = null; tuned.clear(); renderStrings(); } });
  let mic = null, starting = false, raf = 0, lastDetect = 0, level = 0;
  let locked = null;       // string index you tapped, or null to follow the nearest string
  const tuned = new Set(); // strings that were in tune since Start (or the last tuning change)
  let playing = null;      // string index being heard now

  const tuning = () => findTuning(settings.tuning, settings.customTunings); // null: chromatic

  function showPitch(freq) {
    const tn = tuning();
    if (!tn) {
      const note = noteFromFreq(freq, settings.a4);
      display.showPitch(freq, { ...note, name: NOTE_NAMES[settings.notation][note.idx] });
      gauge.setCents(note.cents);
      return;
    }
    // tune toward a string: the one you tapped, else the closest one
    const pick = locked != null
      ? { index: locked, cents: centsFrom(freq, tn.strings[locked], settings.a4) }
      : nearestString(freq, tn.strings, settings.a4);
    const m = tn.strings[pick.index];
    const n = noteName(m, settings.notation, tn.flats);
    const inTune = display.showPitch(freq, { name: n.name, oct: n.oct, cents: pick.cents, target: freqOf(m, settings.a4) });
    gauge.setCents(pick.cents);
    if (inTune) tuned.add(pick.index);
    playing = pick.index;
    markStrings();
  }
  function showIdle() {
    display.showIdle(!!mic);
    gauge.setCents(0);
    playing = null;
    markStrings();
  }

  // ---------- tuning and strings ----------

  function renderStrings() {
    const tn = tuning();
    $('tuningName').textContent = tuningLabel(tn);
    view.classList.toggle('has-strings', !!tn);
    const box = $('strings');
    box.textContent = '';
    box.hidden = !tn;
    if (!tn) return;
    tn.strings.forEach((m, i) => {
      const n = noteName(m, settings.notation, tn.flats);
      const b = render(html`<button class="string" data-i="${i}" aria-label="${t('tuner.string', { n: tn.strings.length - i, note: n.name + n.oct })}"><b>${n.name}</b><small>${n.oct}</small></button>`);
      box.appendChild(b);
    });
    markStrings();
  }
  /** Lit: the string being heard; pressed: the one you locked; ✓: tuned. */
  function markStrings() {
    $('strings').querySelectorAll('.string').forEach((b) => {
      const i = Number(b.dataset.i);
      b.classList.toggle('on', i === playing);
      b.classList.toggle('done', tuned.has(i));
      b.setAttribute('aria-pressed', String(i === locked));
    });
  }

  $('btnTuning').addEventListener('click', () => picker.open());
  $('strings').addEventListener('click', (e) => {
    const b = e.target.closest('.string');
    if (!b) return;
    const i = Number(b.dataset.i);
    locked = locked === i ? null : i; // tap again to go back to following
    markStrings();
  });

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (ts - lastDetect < DETECT_MS) return;
    lastDetect = ts;
    const rms = tracker.push(mic.read(), mic.sampleRate, ts);
    level = Math.max(Math.min(1, rms * 6), level * 0.8);
    display.setLevel(level);
  }

  async function start() {
    if (mic || starting) return; // a second tap while the permission prompt is up
    starting = true;
    if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; // iOS 17+
    try {
      mic = await openMic({ onEnded: micLost });
    } catch (e) {
      display.setStatus(t(MIC_ERRORS[e.reason] || MIC_ERRORS.failed), true);
      return;
    } finally {
      starting = false;
    }
    tracker.reset();
    tuned.clear();
    lastDetect = 0;
    display.setRunning(true);
    showIdle();
    requestWakeLock();
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(raf);
    if (mic) mic.close();
    mic = null;
    releaseWakeLock();
    display.setRunning(false);
    display.setLevel(0);
    level = 0;
    showIdle();
  }

  function micLost() {
    if (!mic) return;
    stop();
    display.setStatus(t('tuner.micLost'), true);
  }

  document.addEventListener('visibilitychange', () => {
    if (!mic) return;
    if (document.hidden) { cancelAnimationFrame(raf); mic.suspend(); }
    else { mic.resume(); requestWakeLock(); raf = requestAnimationFrame(loop); }
  });

  view.querySelector('#btnGo').addEventListener('click', () => (mic ? stop() : start()));
  renderStrings();
  showIdle();

  return {
    id: 'tuner',
    el: view,
    head: () => ({ title: t('nav.tuner'), modes: true }),
    show() {},
    hide: stop, // only one mode runs at a time: the mic would hear the metronome
    get running() { return !!mic; },
    /** Redraw the held note, e.g. after A4 or note names changed. */
    /** Redraw after settings changed (A4, note names, style). */
    rerender() { renderStrings(); if (mic && tracker.current) showPitch(tracker.current); },
  };
}
