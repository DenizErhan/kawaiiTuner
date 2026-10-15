/* The tuner screen: mic -> pitch tracker -> gauge + readout. */
import { settings } from '../../core/settings.js';
import { NOTE_NAMES, noteFromFreq } from '../../core/notes.js';
import { createPitchTracker } from '../../core/pitch-tracker.js';
import { openMic } from '../../services/mic.js';
import { requestWakeLock, releaseWakeLock } from '../../services/wake-lock.js';
import { t } from '../../i18n/i18n.js';
import { html, render } from '../../ui/html.js';
import { PAW } from '../../ui/icons.js';
import { createGauge } from './gauge.js';
import * as display from './display.js';

const DETECT_MS = 33; // run detection at ~30 Hz

const MIC_ERRORS = { insecure: 'tuner.micInsecure', denied: 'tuner.micDenied', failed: 'tuner.micFailed' };

const template = () => html`
  <section class="view view-tuner" id="viewTuner" hidden>
    <div class="level" aria-hidden="true"><i id="level"></i></div>
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
  const el = render(template());
  parent.appendChild(el);
  const gauge = createGauge(el.querySelector('#gauge'));
  const tracker = createPitchTracker({ onPitch: showPitch, onLost: showIdle });
  let mic = null, starting = false, raf = 0, lastDetect = 0, level = 0;

  function showPitch(freq) {
    const note = noteFromFreq(freq, settings.a4);
    display.showPitch(freq, note, NOTE_NAMES[settings.notation]);
    gauge.setCents(note.cents);
  }
  function showIdle() {
    display.showIdle(!!mic);
    gauge.setCents(0);
  }

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

  el.querySelector('#btnGo').addEventListener('click', () => (mic ? stop() : start()));
  showIdle();

  return {
    id: 'tuner',
    el,
    head: () => ({ title: t('nav.tuner') }),
    show() {},
    hide: stop, // only one mode runs at a time: the mic would hear the metronome
    get running() { return !!mic; },
    /** Redraw the held note, e.g. after A4 or note names changed. */
    rerender() { if (mic && tracker.current) showPitch(tracker.current); },
  };
}
