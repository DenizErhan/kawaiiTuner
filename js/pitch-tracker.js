/* Turns raw audio buffers into a steady pitch: noise gate, YIN, median
   smoothing, and a short hold so the note doesn't vanish between frames. */
import { yin } from './yin.js';

export function rms(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

export function median(a) {
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function createPitchTracker({
  onPitch,               // (freq) called with the smoothed frequency on every detection
  onLost,                // () called once when the signal has been gone for holdMs
  gate = 0.006,          // minimum signal level (RMS) before we try to detect
  holdMs = 600,          // keep showing the last note this long after the signal drops
  historySize = 5,
  minHz = 25,
  maxHz = 2200,
}) {
  let hist = [];
  let lastPitchAt = 0;

  return {
    /** Feed one buffer; returns its RMS level. */
    push(buf, sampleRate, ts) {
      const level = rms(buf);
      const res = level >= gate ? yin(buf, sampleRate) : null;
      if (res && res.freq > minHz && res.freq < maxHz) {
        hist.push(res.freq);
        if (hist.length > historySize) hist.shift();
        lastPitchAt = ts;
        onPitch(median(hist));
      } else if (lastPitchAt && ts - lastPitchAt > holdMs) {
        hist = [];
        lastPitchAt = 0;
        onLost();
      }
      return level;
    },
    /** The current smoothed frequency, or null if no note is held. */
    get current() { return hist.length ? median(hist) : null; },
    reset() { hist = []; lastPitchAt = 0; },
  };
}
