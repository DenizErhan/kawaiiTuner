/* The Band tab: start or join a band with a code, the shared song pool, and
   setlists. Tapping a song loads its tempo and beats into the metronome; a
   setlist also shows a bar there to step through its songs.
   All Firebase work goes through band-store.js. */
import { settings, setMe, setBand } from './settings.js';
import { LIMITS, normalizeCode, cleanText, cleanSong, songMeta, moveItem, byName } from './band.js';
import { connect, friendlyError } from './band-store.js';

const $ = (id) => document.getElementById(id);
const ICONS = {
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  remove: 'M6 6l12 12M18 6L6 18',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name]);
  svg.appendChild(p);
  return svg;
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function iconBtn(name, label, data) {
  const b = el('button', 'row-icon');
  b.setAttribute('aria-label', label);
  Object.assign(b.dataset, data);
  b.appendChild(icon(name));
  return b;
}

/** metronome: the metronome panel; openTab(mode): switches tabs. */
export function createBandPanel({ metronome, openTab }) {
  let api = null, code = null, unwatch = null, connecting = false;
  let band = null, members = [], songs = [], setlists = [];
  let pane = 'songs', openListId = null;
  let cue = null; // { ids, index, name } while the metronome is playing from the list
  let editingSong = null, naming = null; // dialog targets

  const songById = (id) => songs.find((s) => s.id === id);
  const listById = (id) => setlists.find((l) => l.id === id);
  const liveIds = (list) => list.songIds.filter(songById); // skips songs someone deleted

  function msg(text, isErr) {
    $('bandMsg').textContent = text || '';
    $('bandMsg').classList.toggle('err', !!isErr);
  }
  const failed = (e) => msg(friendlyError(e), true);
  const write = (p) => { p.catch(failed); }; // the screen updates from the local cache; only report problems

  // ---------- joining ----------

  async function enter(c) {
    if (connecting) return;
    connecting = true;
    msg('Connecting…');
    try { api = await connect(); }
    catch (e) { connecting = false; failed(e); showRetry(); render(); return; }
    connecting = false;
    code = c;
    band = null; members = []; songs = []; setlists = [];
    unwatch = api.watch(c, {
      band: (d) => { if (d) { band = d; msg(''); render(); } else lost('That band no longer exists.'); },
      members: (r) => { members = r; render(); },
      songs: (r) => { songs = r.sort(byName('title')); render(); renderCue(); renderPicker(); },
      setlists: (r) => { setlists = r.sort(byName('name')); render(); renderPicker(); },
      error: (e) => (e && e.code === 'permission-denied' ? lost("You're not in this band any more.") : failed(e)),
    });
  }

  function exit() {
    if (unwatch) unwatch();
    unwatch = null; code = null; band = null; cue = null;
    pane = 'songs'; openListId = null;
    setBand(null);
    renderCue();
    render();
  }
  function lost(text) { exit(); msg(text, true); }

  async function submitSetup(kind) {
    const me = cleanText($('meName').value, LIMITS.member);
    if (!me) { msg('Type your name first, so the band knows who you are.', true); $('meName').focus(); return; }
    let c = null, name = '';
    if (kind === 'join') {
      c = normalizeCode($('joinCode').value);
      if (!c) { msg('Band codes have 8 letters and numbers, like ABCD-2345.', true); $('joinCode').focus(); return; }
    } else {
      name = cleanText($('bandName').value, LIMITS.band);
      if (!name) { msg('Give your band a name.', true); $('bandName').focus(); return; }
    }
    setMe(me);
    document.querySelectorAll('.band-form button').forEach((b) => { b.disabled = true; });
    msg(kind === 'join' ? 'Joining…' : 'Starting your band…');
    try {
      api = await connect();
      if (kind === 'join') await api.joinBand(c, me);
      else c = await api.createBand(name, me);
      setBand(c);
      $('joinCode').value = ''; $('bandName').value = '';
      await enter(c);
    } catch (e) { failed(e); }
    document.querySelectorAll('.band-form button').forEach((b) => { b.disabled = false; });
  }

  async function share() {
    const link = location.origin + location.pathname + '?join=' + code;
    const text = 'Join ' + band.name + ' in the Tuner app with code ' + code;
    try {
      if (navigator.share) { await navigator.share({ title: band.name, text, url: link }); return; }
      await navigator.clipboard.writeText(text + ': ' + link);
      msg('Invite link copied. Paste it to your bandmates.');
    } catch (e) {
      if (e && e.name === 'AbortError') return; // closed the share sheet
      msg('Your band code is ' + code);
    }
  }

  // ---------- drawing ----------

  function render() {
    const inBand = !!settings.band;
    $('bandSetup').hidden = inBand;
    $('bandHome').hidden = !inBand || !band;
    $('setupTitle').textContent = settings.kawaii ? 'Jam together ♪' : 'Play together';
    if (!inBand) {
      if (!$('meName').value) $('meName').value = settings.me;
      return;
    }
    if (!band) return; // still loading: enter() shows progress, or the problem and a retry
    $('bandTitle').textContent = band.name;
    $('bandCode').textContent = code;
    const names = members.slice().sort(byName('name')).map((m) => (m.id === api.uid ? m.name + ' (you)' : m.name));
    $('bandMembers').textContent = names.length ? names.join(', ') : '';

    const list = pane === 'setlist' ? listById(openListId) : null;
    const shown = pane === 'setlist' && !list ? 'setlists' : pane; // e.g. deleted on another phone
    document.querySelectorAll('#bandTabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === (shown === 'songs' ? 'songs' : 'setlists'))));
    $('paneSongs').hidden = shown !== 'songs';
    $('paneSetlists').hidden = shown !== 'setlists';
    $('paneSetlist').hidden = shown !== 'setlist';
    if (shown === 'songs') renderSongs();
    if (shown === 'setlists') renderSetlists();
    if (shown === 'setlist') renderSetlist(list);
  }

  function showRetry() {
    const b = el('button', 'link-btn', ' Try again');
    b.addEventListener('click', () => enter(settings.band.code));
    $('bandMsg').appendChild(b);
  }

  function empty(ul, text) {
    ul.appendChild(el('li', 'empty', text + (settings.kawaii ? ' 🐾' : '')));
  }

  function renderSongs() {
    const ul = $('songList');
    ul.textContent = '';
    if (!songs.length) return empty(ul, 'No songs yet. Add the first one!');
    songs.forEach((s) => {
      const li = el('li', 'row');
      const main = el('button', 'row-main');
      main.dataset.play = s.id;
      main.append(el('strong', '', s.title), el('small', '', songMeta(s) || 'No tempo yet'));
      li.append(main, iconBtn('edit', 'Edit ' + s.title, { edit: s.id }));
      ul.appendChild(li);
    });
  }

  function renderSetlists() {
    const ul = $('setlistList');
    ul.textContent = '';
    if (!setlists.length) return empty(ul, 'No setlists yet. Make one for your next gig!');
    setlists.forEach((l) => {
      const li = el('li', 'row');
      const main = el('button', 'row-main');
      main.dataset.open = l.id;
      const n = liveIds(l).length;
      main.append(el('strong', '', l.name), el('small', '', n === 1 ? '1 song' : n + ' songs'));
      li.appendChild(main);
      ul.appendChild(li);
    });
  }

  function renderSetlist(list) {
    $('setlistTitle').textContent = list.name;
    const ids = liveIds(list);
    $('btnPlaySetlist').hidden = !ids.length;
    const ol = $('setlistSongs');
    ol.textContent = '';
    if (!ids.length) return empty(ol, 'Empty setlist. Add songs from your pool.');
    ids.forEach((id, i) => {
      const s = songById(id);
      const li = el('li', 'row');
      li.appendChild(el('span', 'row-num', String(i + 1)));
      const main = el('button', 'row-main');
      main.dataset.from = i;
      main.append(el('strong', '', s.title), el('small', '', songMeta(s) || 'No tempo yet'));
      const up = iconBtn('up', 'Move ' + s.title + ' up', { move: i, to: i - 1 });
      const down = iconBtn('down', 'Move ' + s.title + ' down', { move: i, to: i + 1 });
      up.disabled = i === 0; down.disabled = i === ids.length - 1;
      li.append(main, up, down, iconBtn('remove', 'Take ' + s.title + ' out of the setlist', { drop: i }));
      ol.appendChild(li);
    });
  }

  // ---------- playing in the metronome ----------

  function play(ids, index, name) {
    cue = { ids, index, name };
    loadCue();
    openTab('metro');
  }
  function loadCue() {
    const s = songById(cue.ids[cue.index]);
    if (s) metronome.load(s.bpm, s.beats);
    renderCue();
  }
  function renderCue() {
    if (cue) cue.ids = cue.ids.filter(songById);
    if (cue && !cue.ids.length) cue = null;
    $('cue').hidden = !cue;
    if (!cue) return;
    cue.index = Math.min(cue.index, cue.ids.length - 1);
    const s = songById(cue.ids[cue.index]);
    const many = cue.ids.length > 1;
    $('cuePos').textContent = many ? cue.name + ' · ' + (cue.index + 1) + '/' + cue.ids.length : 'Song';
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

  // ---------- dialogs ----------

  function openSongDialog(id) {
    editingSong = id;
    const s = id ? songById(id) : {};
    const f = $('songForm');
    ['title', 'artist', 'key', 'bpm', 'beats', 'notes'].forEach((k) => { f.elements[k].value = s[k] == null ? '' : s[k]; });
    $('songDialogTitle').textContent = id ? 'Edit song' : 'Add song';
    $('btnDeleteSong').hidden = !id;
    $('btnUseTempo').textContent = 'Use the metronome’s ' + settings.bpm + ' BPM, ' + settings.beats + ' beats';
    $('songDialog').showModal();
    if (!id) f.elements.title.focus();
  }

  function saveSong(e) {
    e.preventDefault();
    const f = $('songForm');
    const song = cleanSong(Object.fromEntries(new FormData(f)));
    if (!song) { f.elements.title.focus(); return; }
    write(api.saveSong(code, editingSong, song));
    $('songDialog').close();
  }

  function deleteSong() {
    const s = songById(editingSong);
    if (!s || !confirm('Delete “' + s.title + '” for the whole band? It also leaves every setlist.')) return;
    write(api.deleteSong(code, s.id, setlists));
    $('songDialog').close();
  }

  function openNameDialog(id) {
    naming = id;
    const f = $('nameForm');
    f.elements.name.value = id ? listById(id).name : '';
    $('nameDialogTitle').textContent = id ? 'Setlist' : 'New setlist';
    $('btnDeleteSetlist').hidden = !id;
    $('nameDialog').showModal();
    f.elements.name.focus();
  }

  function saveName(e) {
    e.preventDefault();
    const name = cleanText($('nameForm').elements.name.value, LIMITS.setlist);
    if (!name) return;
    if (naming) write(api.updateSetlist(code, naming, { name }));
    else {
      const { id, done } = api.newSetlist(code, name);
      write(done);
      pane = 'setlist'; openListId = id;
    }
    $('nameDialog').close();
    render();
  }

  function deleteSetlist() {
    const l = listById(naming);
    if (!l || !confirm('Delete the setlist “' + l.name + '”? The songs stay in your pool.')) return;
    write(api.deleteSetlist(code, l.id));
    $('nameDialog').close();
    pane = 'setlists';
    render();
  }

  function renderPicker() {
    if (!$('pickDialog').open) return;
    const list = listById(openListId);
    const ul = $('pickList');
    ul.textContent = '';
    if (!list) return;
    if (!songs.length) return empty(ul, 'Your song pool is empty. Add songs on the Songs tab first.');
    songs.forEach((s) => {
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
    const list = listById(openListId);
    if (!list) return;
    const ids = list.songIds.includes(id) ? list.songIds.filter((s) => s !== id) : liveIds(list).concat(id);
    if (ids.length > LIMITS.setlistSongs) { msg('A setlist can have up to ' + LIMITS.setlistSongs + ' songs.', true); return; }
    write(api.updateSetlist(code, list.id, { songIds: ids }));
  }

  // ---------- wiring ----------

  $('formJoin').addEventListener('submit', (e) => { e.preventDefault(); submitSetup('join'); });
  $('formCreate').addEventListener('submit', (e) => { e.preventDefault(); submitSetup('create'); });
  $('btnShare').addEventListener('click', share);
  $('btnLeave').addEventListener('click', () => {
    if (!confirm('Leave ' + band.name + '? You can join again later with the code ' + code + '.')) return;
    write(api.leaveBand(code));
    exit();
  });

  document.querySelectorAll('#bandTabs button').forEach((b) => b.addEventListener('click', () => { pane = b.dataset.v; render(); }));
  $('btnAddSong').addEventListener('click', () => openSongDialog(null));
  $('songList').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.edit) openSongDialog(b.dataset.edit);
    else if (b.dataset.play) play([b.dataset.play], 0, '');
  });

  $('btnAddSetlist').addEventListener('click', () => openNameDialog(null));
  $('setlistList').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-open]');
    if (b) { pane = 'setlist'; openListId = b.dataset.open; render(); }
  });
  $('btnBack').addEventListener('click', () => { pane = 'setlists'; render(); });
  $('btnSetlistMenu').addEventListener('click', () => openNameDialog(openListId));
  $('btnPlaySetlist').addEventListener('click', () => { const l = listById(openListId); play(liveIds(l), 0, l.name); });
  $('setlistSongs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    const l = listById(openListId);
    if (!b || !l) return;
    const ids = liveIds(l);
    if (b.dataset.from) play(ids, Number(b.dataset.from), l.name);
    else if (b.dataset.move) write(api.updateSetlist(code, l.id, { songIds: moveItem(ids, Number(b.dataset.move), Number(b.dataset.to)) }));
    else if (b.dataset.drop) write(api.updateSetlist(code, l.id, { songIds: ids.filter((_, i) => i !== Number(b.dataset.drop)) }));
  });
  $('btnPickSongs').addEventListener('click', () => { $('pickDialog').showModal(); renderPicker(); });
  $('pickList').addEventListener('click', (e) => { const b = e.target.closest('button[data-pick]'); if (b) togglePick(b.dataset.pick); });
  $('btnPickDone').addEventListener('click', () => $('pickDialog').close());

  $('songForm').addEventListener('submit', saveSong);
  $('btnCancelSong').addEventListener('click', () => $('songDialog').close());
  $('btnDeleteSong').addEventListener('click', deleteSong);
  $('btnUseTempo').addEventListener('click', () => {
    const f = $('songForm');
    f.elements.bpm.value = settings.bpm; f.elements.beats.value = settings.beats;
  });
  $('nameForm').addEventListener('submit', saveName);
  $('btnCancelName').addEventListener('click', () => $('nameDialog').close());
  $('btnDeleteSetlist').addEventListener('click', deleteSetlist);
  // tapping the dimmed area outside a dialog closes it
  document.querySelectorAll('dialog.pop').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

  $('cuePrev').addEventListener('click', () => step(-1));
  $('cueNext').addEventListener('click', () => step(1));
  $('cueClose').addEventListener('click', () => { cue = null; renderCue(); });

  // an invite link (…?join=ABCD-2345) fills in the code
  const invited = normalizeCode(new URLSearchParams(location.search).get('join'));
  if (invited) {
    history.replaceState(null, '', location.pathname);
    if (!settings.band) $('joinCode').value = invited;
  }

  return {
    invited: !!invited && !settings.band,
    /** Called when the Band tab opens. */
    show() {
      if (settings.band && !unwatch) enter(settings.band.code);
      render();
    },
    rerender() { render(); },
  };
}
