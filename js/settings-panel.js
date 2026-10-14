/* The settings sheet: theme chips, pattern, color pickers, A4 stepper, note names, reset.
   onChange() is called after any change that affects the pitch readout. */
import {
  THEMES, COLOR_KEYS, DECOS, A4_DEFAULT, settings, currentTheme,
  setTheme, setCustomColor, setDeco, setA4, setNotation, reset,
} from './settings.js';
import { applyTheme } from './theme.js';

const $ = (id) => document.getElementById(id);

function buildChips() {
  const wrap = $('chips');
  wrap.textContent = '';
  const entries = Object.keys(THEMES).map((id) => [id, THEMES[id].label, THEMES[id]]);
  entries.push(['custom', 'Custom', settings.custom]);
  entries.forEach(([id, label, c]) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.setAttribute('aria-pressed', String(settings.theme === id));
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = 'linear-gradient(90deg,' + c.bg + ' 0 30%,' + c.surface + ' 30% 50%,' + c.cat + ' 50% 66%,' + c.accent + ' 66% 84%,' + c.good + ' 84%)';
    const t = document.createElement('span');
    t.textContent = label;
    b.append(sw, t);
    b.addEventListener('click', () => { setTheme(id); refreshTheme(); });
    wrap.appendChild(b);
  });
}

function buildDecos() {
  const wrap = $('decos');
  DECOS.forEach(([id, label]) => {
    const b = document.createElement('button');
    b.dataset.v = id;
    b.textContent = label;
    b.addEventListener('click', () => { setDeco(id); refreshTheme(); });
    wrap.appendChild(b);
  });
}

function buildColorInputs() {
  const wrap = $('colors');
  COLOR_KEYS.forEach(([k, label]) => {
    const l = document.createElement('label');
    const s = document.createElement('span');
    s.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.id = 'c-' + k;
    inp.setAttribute('aria-label', label + ' color');
    inp.addEventListener('input', () => { setCustomColor(k, inp.value); refreshTheme(); });
    l.append(s, inp);
    wrap.appendChild(l);
  });
}

function refreshTheme() {
  applyTheme();
  buildChips();
  const c = currentTheme();
  COLOR_KEYS.forEach(([k]) => { const inp = $('c-' + k); if (inp) inp.value = c[k]; });
  document.querySelectorAll('#decos button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === c.deco)));
}

function syncControls() {
  $('a4val').textContent = settings.a4 + ' Hz';
  document.querySelectorAll('#notation button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === settings.notation)));
}

function openSheet(open) {
  const sheet = $('sheet');
  sheet.classList.toggle('open', open);
  sheet.style.transform = '';
  $('backdrop').classList.toggle('open', open);
  sheet.setAttribute('aria-hidden', String(!open));
  $('btnSettings').setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('sheet-open', open);
  (open ? $('btnClose') : $('btnSettings')).focus({ preventScroll: true });
}

/** Drag the sheet's header down to dismiss it. */
function enableSwipeToClose() {
  const sheet = $('sheet'), handle = $('sheetDrag');
  let startY = null, dy = 0;
  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    startY = e.clientY; dy = 0;
    sheet.classList.add('dragging');
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = 'translateY(' + dy + 'px)';
  });
  const end = () => {
    if (startY === null) return;
    startY = null;
    sheet.classList.remove('dragging');
    if (dy > 80) openSheet(false);
    else sheet.style.transform = '';
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

/** Tap to step once; press and hold to keep stepping. */
function holdToRepeat(btn, fn) {
  let timer = 0;
  const stopRepeat = () => { clearTimeout(timer); timer = 0; };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    fn();
    const repeat = (delay) => { timer = setTimeout(() => { fn(); repeat(70); }, delay); };
    repeat(400);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stopRepeat));
  btn.addEventListener('click', (e) => { if (e.detail === 0) fn(); }); // keyboard activation
}

/** dblclick isn't reliable on touch screens, so time the taps ourselves. */
function onDoubleTap(el, fn) {
  let last = 0;
  el.addEventListener('pointerup', () => {
    const now = Date.now();
    if (now - last < 350) { last = 0; fn(); } else last = now;
  });
}

export function initSettingsPanel({ onChange }) {
  const changed = () => { syncControls(); onChange(); };

  $('btnSettings').addEventListener('click', () => openSheet(true));
  $('btnClose').addEventListener('click', () => openSheet(false));
  $('backdrop').addEventListener('click', () => openSheet(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openSheet(false); });
  enableSwipeToClose();

  holdToRepeat($('a4minus'), () => { setA4(settings.a4 - 1); changed(); });
  holdToRepeat($('a4plus'), () => { setA4(settings.a4 + 1); changed(); });
  onDoubleTap($('a4val'), () => { setA4(A4_DEFAULT); changed(); });

  document.querySelectorAll('#notation button').forEach((b) => b.addEventListener('click', () => {
    setNotation(b.dataset.v);
    changed();
  }));

  $('btnReset').addEventListener('click', () => { reset(); refreshTheme(); changed(); });

  buildDecos();
  buildColorInputs();
  refreshTheme();
  syncControls();
}
