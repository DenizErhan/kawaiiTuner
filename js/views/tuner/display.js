/* The main readout: note name, cents, frequency, status line, level meter. */
import { t } from '../../i18n/i18n.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const IN_ENTER = 5, IN_EXIT = 8; // cents (hysteresis so the "in tune" state doesn't flicker)
let inTune = false;

export function setStatus(msg, isErr) {
  const s = $('status');
  s.textContent = msg;
  s.classList.toggle('err', !!isErr);
}

export function setLevel(x) { $('level').style.width = (x * 100).toFixed(0) + '%'; }

export function setRunning(on) {
  app.dataset.run = on ? 'on' : 'off';
  $('btnGoLabel').textContent = t(on ? 'common.stop' : 'common.start');
}

export function showIdle(running) {
  app.dataset.pitch = 'none';
  app.classList.remove('intune');
  inTune = false;
  $('noteName').textContent = '—';
  $('noteName').classList.remove('long');
  $('noteOct').textContent = '';
  $('centsVal').textContent = '—';
  $('hzVal').textContent = '—';
  $('targetVal').textContent = '';
  $('accFlat').classList.remove('on');
  $('accSharp').classList.remove('on');
  setStatus(t(running ? 'tuner.listening' : 'tuner.idle'));
}

/** note: { name, oct, cents, target } — the nearest note, or the string being tuned.
    Returns whether it counts as in tune. */
export function showPitch(freq, note) {
  const c = note.cents;
  inTune = inTune ? Math.abs(c) <= IN_EXIT : Math.abs(c) <= IN_ENTER;
  app.dataset.pitch = 'on';
  app.classList.toggle('intune', inTune);
  const nameEl = $('noteName');
  nameEl.textContent = note.name;
  nameEl.classList.toggle('long', note.name.length > 2);
  $('noteOct').textContent = String(note.oct);
  const r = Math.round(c);
  $('centsVal').textContent = (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r);
  $('hzVal').textContent = freq.toFixed(1);
  $('targetVal').textContent = t('tuner.target', { hz: note.target.toFixed(1) });
  $('accFlat').classList.toggle('on', !inTune && c < 0);
  $('accSharp').classList.toggle('on', !inTune && c > 0);
  const kawaii = document.documentElement.dataset.style !== 'classic';
  const semis = Math.abs(c) >= 75 ? Math.round(Math.abs(c) / 100) : 0; // a string a long way off: say by how much
  setStatus(inTune ? t(kawaii ? 'tuner.inTuneKawaii' : 'tuner.inTune')
    : semis >= 1 ? t(c < 0 ? 'tuner.farFlat' : 'tuner.farSharp', { n: semis })
      : t(c < 0 ? 'tuner.tuneUp' : 'tuner.tuneDown'));
  return inTune;
}
