/* The settings sheet: style switch, theme chips, pattern, color pickers, A4
   stepper, note names, language, reset. A modal <dialog>, so the phone's back
   button and Esc close it. onChange() runs after anything that changes how
   screens look (pitch readout, kawaii style). */
import {
  THEMES, COLOR_KEYS, DECOS, A4_DEFAULT, settings, currentTheme,
  setTheme, setCustomColor, setDeco, setA4, setNotation, setKawaii, setLangSetting, reset,
} from '../../core/settings.js';
import { t, LANGUAGES, getLang } from '../../i18n/i18n.js';
import { VERSION } from '../../version.js';
import { applyTheme } from '../../ui/theme.js';
import { holdToRepeat, onDoubleTap } from '../../ui/controls.js';
import { html, render } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { $, closeOnBackdrop } from '../../ui/dom.js';

const template = () => html`
  <dialog class="sheet" id="sheet" aria-labelledby="sheetTitle">
    <div class="sheet-drag" id="sheetDrag">
      <div class="grab"></div>
      <div class="sheet-head">
        <h2 id="sheetTitle">${t('settings.title')}</h2>
        <button class="icon-btn" id="btnClose" aria-label="${t('settings.close')}">${icon('close', 18)}</button>
      </div>
    </div>

    <div class="switch-row">
      <span class="switch-text" id="kawaiiLabel"><strong>${t('settings.kawaii')}</strong><small>${t('settings.kawaiiSub')}</small></span>
      <button class="switch" id="kawaiiSwitch" role="switch" aria-checked="true" aria-labelledby="kawaiiLabel"><i></i></button>
    </div>

    <h3>${t('settings.theme')}</h3>
    <div class="chips" id="chips"></div>

    <div class="kawaii-only">
      <h3>${t('settings.pattern')}</h3>
      <div class="seg seg-3" id="decos">
        ${DECOS.map((id) => html`<button data-v="${id}">${t('settings.decos.' + id)}</button>`)}
      </div>
    </div>

    <h3>${t('settings.colors')} <small>${t('settings.colorsHint')}</small></h3>
    <div class="colors" id="colors">
      ${COLOR_KEYS.map((k) => html`
        <label data-key="${k}"><span>${t('settings.colorNames.' + k)}</span>
          <input type="color" id="c-${k}" aria-label="${t('settings.colorAria', { name: t('settings.colorNames.' + k) })}"></label>`)}
    </div>

    <h3>${t('settings.a4')} <small>${t('settings.a4Hint')}</small></h3>
    <div class="stepper">
      <button id="a4minus" aria-label="${t('settings.lowerA4')}">&minus;</button>
      <output id="a4val"></output>
      <button id="a4plus" aria-label="${t('settings.raiseA4')}">+</button>
    </div>

    <h3>${t('settings.notation')}</h3>
    <div class="seg" id="notation">
      <button data-v="en">C D E</button>
      <button data-v="sol">Do Re Mi</button>
    </div>

    <div id="langSection" ${LANGUAGES.length < 2 ? 'hidden' : ''}>
      <h3>${t('settings.language')}</h3>
      <div class="seg" id="langs">
        ${LANGUAGES.map((l) => html`<button data-v="${l.code}" lang="${l.code}">${l.name}</button>`)}
      </div>
    </div>

    <button class="ghost" id="btnReset">${t('settings.reset')}</button>
    <p class="version" id="version">${t('settings.version', { v: VERSION })}</p>
  </dialog>`;

const themeName = (id) => (id === 'custom' ? t('settings.custom') : t((settings.kawaii ? 'settings.themesKawaii.' : 'settings.themes.') + id));

function buildChips() {
  const wrap = $('chips');
  wrap.textContent = '';
  const entries = Object.keys(THEMES).map((id) => [id, THEMES[id]]).concat([['custom', settings.custom]]);
  entries.forEach(([id, c]) => {
    const b = render(html`<button class="chip" aria-pressed="${String(settings.theme === id)}"><span class="swatch"></span><span>${themeName(id)}</span></button>`);
    b.firstChild.style.background = 'linear-gradient(90deg,' + c.bg + ' 0 30%,' + c.surface + ' 30% 50%,' + c.cat + ' 50% 66%,' + c.accent + ' 66% 84%,' + c.good + ' 84%)';
    b.addEventListener('click', () => { setTheme(id); refreshTheme(); });
    wrap.appendChild(b);
  });
}

function refreshTheme() {
  applyTheme();
  buildChips();
  $('kawaiiSwitch').setAttribute('aria-checked', String(settings.kawaii));
  const c = currentTheme();
  COLOR_KEYS.forEach((k) => { $('c-' + k).value = c[k]; });
  document.querySelectorAll('#decos button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === c.deco)));
}

function syncControls() {
  $('a4val').textContent = settings.a4 + ' Hz';
  document.querySelectorAll('#notation button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === settings.notation)));
  document.querySelectorAll('#langs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === getLang())));
}

/** Drag the sheet's header down to dismiss it. */
function enableSwipeToClose(sheet) {
  const handle = $('sheetDrag');
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
    sheet.style.transform = '';
    if (dy > 80) sheet.close();
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

/** Adds the sheet to the page; returns { open() }. */
export function createSettingsSheet({ onChange }) {
  const sheet = render(template());
  document.body.appendChild(sheet);
  const changed = () => { syncControls(); onChange(); };

  $('btnClose').addEventListener('click', () => sheet.close());
  closeOnBackdrop(sheet);
  enableSwipeToClose(sheet);

  holdToRepeat($('a4minus'), () => { setA4(settings.a4 - 1); changed(); });
  holdToRepeat($('a4plus'), () => { setA4(settings.a4 + 1); changed(); });
  onDoubleTap($('a4val'), () => { setA4(A4_DEFAULT); changed(); });
  document.querySelectorAll('#notation button').forEach((b) => b.addEventListener('click', () => { setNotation(b.dataset.v); changed(); }));
  document.querySelectorAll('#decos button').forEach((b) => b.addEventListener('click', () => { setDeco(b.dataset.v); refreshTheme(); }));
  COLOR_KEYS.forEach((k) => $('c-' + k).addEventListener('input', (e) => { setCustomColor(k, e.target.value); refreshTheme(); }));
  // every text is built in the chosen language, so switching reloads the page (quick: it's all cached)
  document.querySelectorAll('#langs button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.v === getLang()) return;
    setLangSetting(b.dataset.v);
    location.reload();
  }));

  $('kawaiiSwitch').addEventListener('click', () => { setKawaii(!settings.kawaii); refreshTheme(); changed(); });
  $('btnReset').addEventListener('click', () => { reset(); refreshTheme(); changed(); });

  refreshTheme();
  syncControls();
  return { open: () => sheet.showModal() };
}
