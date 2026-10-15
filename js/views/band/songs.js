/* The band's song pool (#/band/songs) and the add / edit song dialog.
   Tapping a song loads its tempo and beats into the metronome. */
import { settings, BPM_MIN, BPM_MAX, BEATS_MIN, BEATS_MAX } from '../../core/settings.js';
import { LIMITS, cleanSong, songMeta } from '../../core/band.js';
import { t } from '../../i18n/i18n.js';
import { html, render } from '../../ui/html.js';
import { $, el, iconBtn, empty, closeOnBackdrop } from '../../ui/dom.js';

const template = () => html`
  <div class="band-screen" id="paneSongs" hidden>
    <button class="add-btn" id="btnAddSong">${t('band.songs.add')}</button>
    <ul class="list" id="songList"></ul>
  </div>`;

const dialog = () => html`
  <dialog class="pop" id="songDialog" aria-labelledby="songDialogTitle">
    <form method="dialog" id="songForm">
      <h2 id="songDialogTitle"></h2>
      <label class="field"><span>${t('band.songs.title')}</span><input name="title" maxlength="${LIMITS.title}" required autocomplete="off"></label>
      <label class="field"><span>${t('band.songs.artist')}</span><input name="artist" maxlength="${LIMITS.artist}" autocomplete="off"></label>
      <div class="field-row">
        <label class="field"><span>${t('band.songs.key')}</span><input name="key" maxlength="${LIMITS.key}" placeholder="Am" autocomplete="off"></label>
        <label class="field"><span>${t('band.songs.bpm')}</span><input name="bpm" type="number" inputmode="numeric" min="${BPM_MIN}" max="${BPM_MAX}" placeholder="120"></label>
        <label class="field"><span>${t('band.songs.beats')}</span><input name="beats" type="number" inputmode="numeric" min="${BEATS_MIN}" max="${BEATS_MAX}" placeholder="4"></label>
      </div>
      <button type="button" class="link-btn" id="btnUseTempo"></button>
      <label class="field"><span>${t('band.songs.notes')}</span><textarea name="notes" maxlength="${LIMITS.notes}" rows="2" placeholder="${t('band.songs.notesHint')}"></textarea></label>
      <div class="pop-actions">
        <button type="button" class="ghost danger" id="btnDeleteSong">${t('common.delete')}</button>
        <button type="button" class="ghost" id="btnCancelSong">${t('common.cancel')}</button>
        <button class="go go-sm" value="save">${t('common.save')}</button>
      </div>
    </form>
  </dialog>`;

/** A song's second line in lists. */
export const songLine = (s) => songMeta(s) || t('band.songs.noTempo');

export function createSongs(parent, ctx) {
  const screen = render(template());
  parent.appendChild(screen);
  document.body.appendChild(render(dialog()));
  closeOnBackdrop($('songDialog'));
  let editing = null;

  function renderList() {
    const ul = $('songList');
    ul.textContent = '';
    if (!ctx.state.songs.length) return empty(ul, t('band.songs.empty'));
    ctx.state.songs.forEach((s) => {
      const li = el('li', 'row');
      const main = el('button', 'row-main');
      main.dataset.play = s.id;
      main.append(el('strong', '', s.title), el('small', '', songLine(s)));
      li.append(main, iconBtn('edit', t('band.songs.edit', { title: s.title }), { edit: s.id }));
      ul.appendChild(li);
    });
  }

  function open(id) {
    editing = id;
    const s = id ? ctx.songById(id) : {};
    const f = $('songForm');
    ['title', 'artist', 'key', 'bpm', 'beats', 'notes'].forEach((k) => { f.elements[k].value = s[k] == null ? '' : s[k]; });
    $('songDialogTitle').textContent = t(id ? 'band.songs.dialogEdit' : 'band.songs.dialogAdd');
    $('btnDeleteSong').hidden = !id;
    $('btnUseTempo').textContent = t('band.songs.useTempo', { bpm: settings.bpm, beats: settings.beats });
    $('songDialog').showModal();
    if (!id) f.elements.title.focus();
  }

  function save(e) {
    e.preventDefault();
    const f = $('songForm');
    const song = cleanSong(Object.fromEntries(new FormData(f)));
    if (!song) { f.elements.title.focus(); return; }
    ctx.write(ctx.state.api.saveSong(ctx.state.code, editing, song));
    $('songDialog').close();
  }

  function remove() {
    const s = ctx.songById(editing);
    if (!s || !confirm(t('band.songs.deleteConfirm', { title: s.title }))) return;
    ctx.write(ctx.state.api.deleteSong(ctx.state.code, s.id, ctx.state.setlists));
    $('songDialog').close();
  }

  $('btnAddSong').addEventListener('click', () => open(null));
  $('songList').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.edit) open(b.dataset.edit);
    else if (b.dataset.play) ctx.play([b.dataset.play], 0, '');
  });
  $('songForm').addEventListener('submit', save);
  $('btnCancelSong').addEventListener('click', () => $('songDialog').close());
  $('btnDeleteSong').addEventListener('click', remove);
  $('btnUseTempo').addEventListener('click', () => {
    const f = $('songForm');
    f.elements.bpm.value = settings.bpm; f.elements.beats.value = settings.beats;
  });

  return { el: screen, render: renderList };
}
