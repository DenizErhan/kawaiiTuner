/* The main readout: note name, cents, frequency, status line, level meter. */

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
  $('btnGoLabel').textContent = on ? 'Stop' : 'Start';
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
  setStatus(running ? 'Listening…' : 'Tap Start, then play a note');
}

/** note: result of noteFromFreq(); names: the 12 note names to display. */
export function showPitch(freq, note, names) {
  const c = note.cents;
  inTune = inTune ? Math.abs(c) <= IN_EXIT : Math.abs(c) <= IN_ENTER;
  app.dataset.pitch = 'on';
  app.classList.toggle('intune', inTune);
  const name = names[note.idx];
  const nameEl = $('noteName');
  nameEl.textContent = name;
  nameEl.classList.toggle('long', name.length > 2);
  $('noteOct').textContent = String(note.oct);
  const r = Math.round(c);
  $('centsVal').textContent = (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r);
  $('hzVal').textContent = freq.toFixed(1);
  $('targetVal').textContent = 'target ' + note.target.toFixed(1) + ' Hz';
  $('accFlat').classList.toggle('on', !inTune && c < 0);
  $('accSharp').classList.toggle('on', !inTune && c > 0);
  const kawaii = document.documentElement.dataset.style !== 'classic';
  setStatus(inTune ? (kawaii ? 'Purrfect! In tune' : 'In tune') : c < 0 ? 'Flat — tune up' : 'Sharp — tune down');
}
