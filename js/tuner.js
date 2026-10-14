/* The tuner mode: mic -> pitch tracker -> gauge + readout. */
import { settings } from './settings.js';
import { NOTE_NAMES, noteFromFreq } from './notes.js';
import { createPitchTracker } from './pitch-tracker.js';
import { createGauge } from './gauge.js';
import { openMic } from './mic.js';
import { requestWakeLock, releaseWakeLock } from './wake-lock.js';
import * as display from './display.js';

const DETECT_MS = 33; // run detection at ~30 Hz

const MIC_ERRORS = {
  insecure: 'Microphone access needs HTTPS (or localhost). Host this page on HTTPS, e.g. GitHub Pages.',
  denied: 'Microphone blocked. Allow it in your browser settings and try again.',
  failed: 'Could not open the microphone.',
};

export function createTuner() {
  const gauge = createGauge(document.getElementById('gauge'));
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
      display.setStatus(MIC_ERRORS[e.reason] || MIC_ERRORS.failed, true);
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
    display.setStatus('The microphone was turned off. Tap Start to try again.', true);
  }

  document.addEventListener('visibilitychange', () => {
    if (!mic) return;
    if (document.hidden) { cancelAnimationFrame(raf); mic.suspend(); }
    else { mic.resume(); requestWakeLock(); raf = requestAnimationFrame(loop); }
  });

  document.getElementById('btnGo').addEventListener('click', () => (mic ? stop() : start()));
  showIdle();

  return {
    stop,
    get running() { return !!mic; },
    /** Redraw the held note, e.g. after A4 or note names changed. */
    rerender() { if (mic && tracker.current) showPitch(tracker.current); },
  };
}
