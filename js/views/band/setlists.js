/* Setlists (#/band/setlists), one setlist (#/band/setlists/<id>), the song
   picker, and the bar on the metronome screen that steps through a setlist. */
import { LIMITS, moveItem, songMeta } from '../../core/band.js';
import { t } from '../../i18n/i18n.js';
import { html, render } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { $, el, iconBtn, empty, closeOnBackdrop } from '../../ui/dom.js';
import { go, path } from '../../app/router.js';
import { songLine } from './songs.js';

const template = () => html`
  <div class="band-screen" id="paneSetlists" hidden>
    <button class="add-btn" id="btnAddSetlist">${t('band.setlists.add')}</button>
    <ul class="list" id="setlistList"></ul>
  </div>`;

const detail = () => html`
  <div class="band-screen" id="paneSetlist" hidden>
    <button class="go go-sm" id="btnPlaySetlist">${t('band.setlists.play')}</button>
    <ol class="list" id="setlistSongs"></ol>
    <button class="add-btn" id="btnPickSongs">${t('band.setlists.addSongs')}</button>
  </div>`;

const picker = () => html`
  <dialog class="pop" id="pickDialog" aria-labelledby="pickDialogTitle">
    <h2 id="pickDialogTitle">${t('band.setlists.pickTitle')}</h2>
    <p class="pop-hint">${t('band.setlists.pickHint')}</p>
    <ul class="list pick-list" id="pickList"></ul>
    <div class="pop-actions"><button class="go go-sm" id="btnPickDone">${t('common.done')}</button></div>
  </dialog>`;

export function createSetlists(parent, ctx) {
  // two screens in one wrapper, so band-view can show or hide "setlists" as a whole
  const screen = el('div', 'band-screens');
  screen.append(render(template()), render(detail()));
  parent.appendChild(screen);
  document.body.appendChild(render(picker()));
  closeOnBackdrop($('pickDialog'));
  let openId = null;
  let cue = null; // { ids, index, name } while the metronome plays from a list

  const { state } = ctx;
  const current = () => (openId ? ctx.listById(openId) : null);

  function renderAll(route) {
    openId = route.id || null;
    if (openId && !current()) { // deleted on another phone
      go(path('band', 'setlists'), { replace: true });
      return;
    }
    $('paneSetlists').hidden = !!openId;
    $('paneSetlist').hidden = !openId;
    if (openId) renderList(current());
    else renderLists();
    renderPicker();
  }

  function renderLists() {
    const ul = $('setlistList');
    ul.textContent = '';
    if (!state.setlists.length) return empty(ul, t('band.setlists.empty'));
    state.setlists.forEach((l) => {
      const a = el('a', 'row-main');
      a.href = path('band', 'setlists', l.id);
      a.append(el('strong', '', l.name), el('small', '', t('band.setlists.songCount', { n: ctx.liveIds(l).length })));
      const li = el('li', 'row');
      li.append(a, render(html`<span class="row-go">${icon('next', 18)}</span>`));
      ul.appendChild(li);
    });
  }

  function renderList(list) {
    const ids = ctx.liveIds(list);
    $('btnPlaySetlist').hidden = !ids.length;
    const ol = $('setlistSongs');
    ol.textContent = '';
    if (!ids.length) return empty(ol, t('band.setlists.emptyList'));
    ids.forEach((id, i) => {
      const s = ctx.songById(id);
      const li = el('li', 'row');
      li.appendChild(el('span', 'row-num', String(i + 1)));
      const main = el('button', 'row-main');
      main.dataset.from = i;
      main.append(el('strong', '', s.title), el('small', '', songLine(s)));
      const up = iconBtn('up', t('band.setlists.moveUp', { title: s.title }), { move: i, to: i - 1 });
      const down = iconBtn('down', t('band.setlists.moveDown', { title: s.title }), { move: i, to: i + 1 });
      up.disabled = i === 0; down.disabled = i === ids.length - 1;
      li.append(main, up, down, iconBtn('remove', t('band.setlists.drop', { title: s.title }), { drop: i }));
      ol.appendChild(li);
    });
  }

  function renderPicker() {
    if (!$('pickDialog').open) return;
    const list = current();
    const ul = $('pickList');
    ul.textContent = '';
    if (!list) return;
    if (!state.songs.length) return empty(ul, t('band.setlists.pickEmpty'));
    state.songs.forEach((s) => {
      const li = el('li', 'row');
      const b = el('button', 'row-main pick');
      b.dataset.pick = s.id;
      b.setAttribute('aria-pressed', String(list.songIds.includes(s.id)));
      b.append(el('strong', '', s.title), el('small', '', songMeta(s)));
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function togglePick(id) {
    const list = current();
    if (!list) return;
    const ids = list.songIds.includes(id) ? list.songIds.filter((s) => s !== id) : ctx.liveIds(list).concat(id);
    if (ids.length > LIMITS.setlistSongs) { ctx.msg(t('band.setlists.full', { n: LIMITS.setlistSongs }), true); return; }
    ctx.write(state.api.updateSetlist(state.code, list.id, { songIds: ids }));
  }

  // ---------- playing in the metronome ----------

  function play(ids, index, name) {
    cue = { ids, index, name };
    loadCue();
    go(path('metronome'));
  }
  function loadCue() {
    const s = ctx.songById(cue.ids[cue.index]);
    if (s) ctx.metronome.load(s.bpm, s.beats);
    renderCue();
  }
  function renderCue() {
    if (cue) cue.ids = cue.ids.filter(ctx.songById);
    if (cue && !cue.ids.length) cue = null;
    $('cue').hidden = !cue;
    if (!cue) return;
    cue.index = Math.min(cue.index, cue.ids.length - 1);
    const s = ctx.songById(cue.ids[cue.index]);
    const many = cue.ids.length > 1;
    $('cuePos').textContent = many ? t('metronome.cuePos', { name: cue.name, i: cue.index + 1, n: cue.ids.length }) : t('metronome.song');
    $('cueTitle').textContent = s.title;
    $('cuePrev').hidden = $('cueNext').hidden = !many;
    $('cuePrev').disabled = cue.index === 0;
    $('cueNext').disabled = cue.index === cue.ids.length - 1;
  }
  function step(d) {
    const i = cue.index + d;
    if (i < 0 || i >= cue.ids.length) return;
    cue.index = i;
    loadCue();
  }

  // ---------- wiring ----------

  const editBtn = render(html`<button class="icon-btn" id="btnSetlistMenu" aria-label="${t('band.setlists.menu')}" aria-haspopup="dialog">${icon('edit', 20)}</button>`);
  editBtn.addEventListener('click', () => ctx.openName(openId));

  $('btnAddSetlist').addEventListener('click', () => ctx.openName(null));
  $('btnPlaySetlist').addEventListener('click', () => { const l = current(); play(ctx.liveIds(l), 0, l.name); });
  $('setlistSongs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    const l = current();
    if (!b || !l) return;
    const ids = ctx.liveIds(l);
    if (b.dataset.from) play(ids, Number(b.dataset.from), l.name);
    else if (b.dataset.move) ctx.write(state.api.updateSetlist(state.code, l.id, { songIds: moveItem(ids, Number(b.dataset.move), Number(b.dataset.to)) }));
    else if (b.dataset.drop) ctx.write(state.api.updateSetlist(state.code, l.id, { songIds: ids.filter((_, i) => i !== Number(b.dataset.drop)) }));
  });
  $('btnPickSongs').addEventListener('click', () => { $('pickDialog').showModal(); renderPicker(); });
  $('pickList').addEventListener('click', (e) => { const b = e.target.closest('button[data-pick]'); if (b) togglePick(b.dataset.pick); });
  $('btnPickDone').addEventListener('click', () => $('pickDialog').close());
  $('cuePrev').addEventListener('click', () => step(-1));
  $('cueNext').addEventListener('click', () => step(1));
  $('cueClose').addEventListener('click', () => { cue = null; renderCue(); });

  return {
    el: screen,
    render: renderAll,
    /** The header on one setlist: its name, a back arrow, and rename / delete. */
    head(route) {
      const l = route.id && ctx.listById(route.id);
      return l ? { title: l.name, up: path('band', 'setlists'), actions: [editBtn] } : null;
    },
    play,
    renderCue,
    stopCue() { cue = null; renderCue(); },
  };
}
