/* The tuning list (chromatic, every instrument's tunings, your own) and the
   editor for your own tunings, which are saved on this phone. */
import { settings, setTuning, saveCustomTuning, deleteCustomTuning } from '../../core/settings.js';
import { TUNINGS, INSTRUMENTS, CHROMATIC, CUSTOM_LIMITS, findTuning, noteName } from '../../core/tunings.js';
import { cleanText } from '../../core/band.js';
import { t } from '../../i18n/i18n.js';
import { html, render } from '../../ui/html.js';
import { $, el, iconBtn, closeOnBackdrop } from '../../ui/dom.js';

const picker = () => html`
  <dialog class="pop" id="tuningDialog" aria-labelledby="tuningDialogTitle">
    <h2 id="tuningDialogTitle">${t('tuner.chooseTuning')}</h2>
    <div id="tuningList"></div>
    <div class="pop-actions"><button class="ghost menu-done" id="btnTuningDone">${t('common.done')}</button></div>
  </dialog>`;

const editor = () => html`
  <dialog class="pop" id="customDialog" aria-labelledby="customDialogTitle">
    <form method="dialog" id="customForm" novalidate>
      <h2 id="customDialogTitle"></h2>
      <label class="field"><span>${t('tuner.custom.name')}</span><input name="name" maxlength="${CUSTOM_LIMITS.name}" autocomplete="off" placeholder="${t('tuner.custom.nameHint')}"></label>
      <div class="field"><span>${t('tuner.custom.strings')}</span><ol class="string-edit" id="customStrings"></ol></div>
      <div class="string-count">
        <button type="button" class="link-btn" id="btnAddString">${t('tuner.custom.addString')}</button>
        <button type="button" class="link-btn" id="btnDropString">${t('tuner.custom.removeString')}</button>
      </div>
      <p class="pop-hint err" id="customErr"></p>
      <div class="pop-actions">
        <button type="button" class="ghost danger" id="btnDeleteTuning">${t('common.delete')}</button>
        <button type="button" class="ghost" id="btnCancelTuning">${t('common.cancel')}</button>
        <button class="go go-sm" value="save">${t('common.save')}</button>
      </div>
    </form>
  </dialog>`;

/** "Guitar · Drop D", or a custom tuning's own name. */
export function tuningLabel(tuning) {
  if (!tuning) return t('tuner.chromatic');
  if (tuning.instrument === 'custom') return tuning.name;
  return t('tuner.instruments.' + tuning.instrument) + ' · ' + t('tuner.tunings.' + tuning.id);
}
/** "D A D G B E" */
export const notesText = (tuning) => tuning.strings.map((m) => noteName(m, settings.notation, tuning.flats).name).join(' ');

/** onChange(): the tuning was switched (or the current one edited). */
export function createTuningPicker({ onChange }) {
  document.body.appendChild(render(picker()));
  document.body.appendChild(render(editor()));
  closeOnBackdrop($('tuningDialog'));
  closeOnBackdrop($('customDialog'));
  let editing = null, strings = [];

  function row(id, title, sub, extra) {
    const li = el('li', 'row');
    const b = el('button', 'row-main pick');
    b.dataset.tuning = id;
    b.setAttribute('aria-pressed', String(settings.tuning === id || (id === CHROMATIC && !findTuning(settings.tuning, settings.customTunings))));
    b.append(el('strong', '', title), el('small', '', sub));
    li.appendChild(b);
    if (extra) li.appendChild(extra);
    return li;
  }
  function group(title, items) {
    const wrap = el('section', 'tuning-group');
    wrap.append(el('h3', 'pane-h', title));
    const ul = el('ul', 'list pick-list');
    ul.append(...items);
    wrap.appendChild(ul);
    return wrap;
  }

  function renderList() {
    const box = $('tuningList');
    box.textContent = '';
    box.appendChild(group(t('tuner.chromatic'), [row(CHROMATIC, t('tuner.chromatic'), t('tuner.chromaticSub'))]));
    INSTRUMENTS.forEach((ins) => {
      const ids = Object.keys(TUNINGS).filter((id) => TUNINGS[id].instrument === ins);
      box.appendChild(group(t('tuner.instruments.' + ins), ids.map((id) => {
        const tn = findTuning(id);
        return row(id, t('tuner.tunings.' + id), notesText(tn));
      })));
    });
    const mine = settings.customTunings.map((c) => {
      const tn = findTuning('custom.' + c.id, settings.customTunings);
      return row(tn.id, c.name, notesText(tn), iconBtn('edit', t('tuner.custom.edit', { name: c.name }), { edit: c.id }));
    });
    const add = el('button', 'add-btn', t('tuner.custom.add'));
    add.id = 'btnNewTuning';
    const g = group(t('tuner.instruments.custom'), mine);
    g.appendChild(add);
    box.appendChild(g);
  }

  // ---------- your own tunings ----------

  function openEditor(id) {
    const c = id && settings.customTunings.find((x) => x.id === id);
    editing = c ? c.id : null;
    const start = findTuning(settings.tuning, settings.customTunings) || findTuning('guitar.standard');
    strings = (c ? c.strings : start.strings).slice();
    $('customForm').elements.name.value = c ? c.name : '';
    $('customDialogTitle').textContent = t(c ? 'tuner.custom.editTitle' : 'tuner.custom.newTitle');
    $('btnDeleteTuning').hidden = !c;
    $('customErr').textContent = '';
    renderStrings();
    $('customDialog').showModal();
    if (!c) $('customForm').elements.name.focus();
  }

  function renderStrings() {
    const ol = $('customStrings');
    ol.textContent = '';
    strings.forEach((m, i) => {
      const n = noteName(m, settings.notation);
      const li = el('li', 'string-row');
      const no = strings.length - i; // guitar numbering: the lowest string is the highest number
      li.append(
        el('span', 'string-no', t('tuner.custom.stringN', { n: no })),
        iconBtn('down', t('tuner.custom.lower', { n: no }), { i, d: -1 }),
        el('output', 'string-note', n.name + n.oct),
        iconBtn('up', t('tuner.custom.higher', { n: no }), { i, d: 1 }),
      );
      ol.appendChild(li);
    });
    $('btnAddString').hidden = strings.length >= CUSTOM_LIMITS.maxStrings;
    $('btnDropString').hidden = strings.length <= CUSTOM_LIMITS.minStrings;
  }

  function saveEditor(e) {
    e.preventDefault();
    const name = cleanText($('customForm').elements.name.value, CUSTOM_LIMITS.name);
    if (!name) { $('customErr').textContent = t('tuner.custom.needName'); return; }
    const id = editing || Date.now().toString(36);
    saveCustomTuning({ id, name, strings: strings.slice() });
    setTuning('custom.' + id);
    $('customDialog').close();
    renderList();
    onChange();
  }

  // ---------- wiring ----------

  $('tuningList').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'btnNewTuning') openEditor(null);
    else if (b.dataset.edit) openEditor(b.dataset.edit);
    else if (b.dataset.tuning) {
      setTuning(b.dataset.tuning);
      onChange();
      $('tuningDialog').close();
    }
  });
  $('btnTuningDone').addEventListener('click', () => $('tuningDialog').close());
  $('customStrings').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-d]');
    if (!b) return;
    const i = Number(b.dataset.i);
    strings[i] = Math.min(CUSTOM_LIMITS.high, Math.max(CUSTOM_LIMITS.low, strings[i] + Number(b.dataset.d)));
    renderStrings();
  });
  $('btnAddString').addEventListener('click', () => { // a fourth up, like most strings
    strings.push(Math.min(CUSTOM_LIMITS.high, strings[strings.length - 1] + 5));
    renderStrings();
  });
  $('btnDropString').addEventListener('click', () => { strings.pop(); renderStrings(); });
  $('customForm').addEventListener('submit', saveEditor);
  $('customForm').elements.name.addEventListener('input', () => { $('customErr').textContent = ''; });
  $('btnCancelTuning').addEventListener('click', () => $('customDialog').close());
  $('btnDeleteTuning').addEventListener('click', () => {
    const c = settings.customTunings.find((x) => x.id === editing);
    if (!c || !confirm(t('tuner.custom.deleteConfirm', { name: c.name }))) return;
    deleteCustomTuning(c.id);
    $('customDialog').close();
    renderList();
    onChange();
  });

  return {
    open() { renderList(); $('tuningDialog').showModal(); },
  };
}
