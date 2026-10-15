/* The band area: start or join a band with a code, then its screens:
   home (#/band), songs, setlists, calendar and polls (#/band/<screen>).
   This file owns the connection and the live data and hands both to the
   screen modules next to it through `ctx`. Firebase work goes through
   services/band-store.js. */
import { settings, setMe, setBand } from '../../core/settings.js';
import { LIMITS, normalizeCode, cleanText, byName } from '../../core/band.js';
import { dayKey, addDays, best } from '../../core/plan.js';
import { connect, friendlyError } from '../../services/band-store.js';
import { t } from '../../i18n/i18n.js';
import { html, render } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { $, el, closeOnBackdrop } from '../../ui/dom.js';
import { go, path } from '../../app/router.js';
import { createSongs } from './songs.js';
import { createSetlists } from './setlists.js';
import { createPolls, needsVote } from './polls.js';
import { createCalendar, freeEntries } from './calendar.js';

const ME = 'me', BAND = 'band'; // name dialog targets besides setlists (setlist ids are 20 chars)
const CONNECT_DELAY_MS = 800;   // in a band: connect soon after start, so the menu can show new polls

const template = () => html`
  <section class="view view-band" id="viewBand" hidden>
    <p class="band-msg" id="bandMsg" role="status" aria-live="polite"></p>

    <div class="band-screen band-setup" id="bandSetup" hidden>
      <h2 class="band-title" id="setupTitle"></h2>
      <p class="band-lead">${t('band.lead')}</p>
      <label class="field"><span>${t('band.yourName')}</span><input id="meName" maxlength="${LIMITS.member}" autocomplete="nickname" enterkeyhint="next" placeholder="${t('band.yourNameHint')}"></label>
      <form class="card band-form" id="formJoin">
        <h3>${t('band.joinTitle')}</h3>
        <label class="field"><span>${t('band.code')}</span><input id="joinCode" maxlength="9" placeholder="ABCD-2345" autocapitalize="characters" autocomplete="off" spellcheck="false" enterkeyhint="go"></label>
        <button class="go go-sm">${t('band.join')}</button>
      </form>
      <form class="card band-form" id="formCreate">
        <h3>${t('band.startTitle')}</h3>
        <label class="field"><span>${t('band.bandName')}</span><input id="bandName" maxlength="${LIMITS.band}" autocomplete="off" enterkeyhint="go"></label>
        <button class="go go-sm">${t('band.start')}</button>
      </form>
    </div>

    <div class="band-screen" id="bandHome" hidden>
      <p class="band-members" id="bandMembers"></p>
      <a class="decided" id="homeDecided" href="${path('band', 'polls')}" hidden>
        ${icon('check')}<span><small>${t('band.home.decided')} · <span id="homeDecidedQ"></span></small><strong id="homeDecidedA"></strong></span>
      </a>
      <ul class="home-list">
        ${[['polls', 'polls'], ['calendar', 'calendar'], ['songs', 'songs'], ['setlists', 'setlists']].map(([sub, ico]) => html`
          <li><a class="home-card" href="${path('band', sub)}" id="home-${sub}">
            <span class="home-ico">${icon(ico)}</span>
            <span class="home-text"><strong>${t('band.home.' + sub)}</strong><small></small></span>
            <b class="count" hidden></b>${icon('next', 18)}
          </a></li>`)}
      </ul>
    </div>
  </section>`;

const dialogs = () => html`
  <dialog class="pop" id="bandMenu" aria-labelledby="bandMenuTitle">
    <h2 id="bandMenuTitle"></h2>
    <div class="invite">
      <span class="lbl">${t('band.menu.invite')}</span>
      <strong class="invite-code" id="bandCode"></strong>
      <p class="pop-hint">${t('band.menu.inviteHint')}</p>
      <button class="go go-sm" id="btnShare">${icon('share', 20)}<span>${t('band.menu.share')}</span></button>
    </div>
    <h3 class="pane-h">${t('band.menu.members')}</h3>
    <p class="menu-members" id="menuMembers"></p>
    <div class="menu-list">
      <button class="menu-item" id="btnRename">${icon('edit', 20)}<span>${t('band.menu.changeName')}</span></button>
      <button class="menu-item" id="btnRenameBand">${icon('band', 20)}<span>${t('band.menu.rename')}</span></button>
      <button class="menu-item danger" id="btnLeave">${icon('close', 20)}<span>${t('band.menu.leave')}</span></button>
    </div>
    <div class="pop-actions"><button class="ghost menu-done" id="btnMenuDone">${t('common.done')}</button></div>
  </dialog>

  <dialog class="pop" id="nameDialog" aria-labelledby="nameDialogTitle">
    <form method="dialog" id="nameForm">
      <h2 id="nameDialogTitle"></h2>
      <label class="field"><span>${t('band.setlists.name')}</span><input name="name" required autocomplete="off"></label>
      <div class="pop-actions">
        <button type="button" class="ghost danger" id="btnDeleteSetlist">${t('band.setlists.delete')}</button>
        <button type="button" class="ghost" id="btnCancelName">${t('common.cancel')}</button>
        <button class="go go-sm" value="save">${t('common.save')}</button>
      </div>
    </form>
  </dialog>`;

/** parent: where screens go; metronome: its view (songs play there); shell: the app frame. */
export function createBandView(parent, { metronome, shell }) {
  const view = render(template());
  parent.appendChild(view);
  const dlgs = document.createElement('div');
  dlgs.innerHTML = String(dialogs());
  document.body.append(...dlgs.children);
  ['bandMenu', 'nameDialog'].forEach((id) => closeOnBackdrop($(id)));

  const state = { api: null, code: null, band: null, members: [], songs: [], setlists: [], free: [], polls: [] };
  let unwatch = null, connecting = false, route = { sub: '', id: '' }, naming = null, cleaned = false;

  function msg(text, isErr) {
    $('bandMsg').textContent = text || '';
    $('bandMsg').classList.toggle('err', !!isErr);
  }
  const failed = (e) => msg(friendlyError(e), true);
  const write = (p) => { p.catch(failed); }; // the screen updates from the local cache; only report problems

  const ctx = {
    state, write, msg, metronome,
    me: () => state.api.uid,
    memberIds: () => state.members.map((m) => m.id),
    nameOf: (uid) => { const m = state.members.find((x) => x.id === uid); return m ? m.name : t('band.polls.someone'); },
    songById: (id) => state.songs.find((s) => s.id === id),
    listById: (id) => state.setlists.find((l) => l.id === id),
    liveIds: (list) => list.songIds.filter(ctx.songById), // skips songs someone deleted
    openName: (id) => openNameDialog(id),
    rerender: () => renderAll(),
  };
  const screens = {
    songs: createSongs(view, ctx),
    setlists: createSetlists(view, ctx),
    calendar: createCalendar(view, ctx),
    polls: createPolls(view, ctx),
  };
  ctx.openPoll = screens.polls.openPoll;
  ctx.play = screens.setlists.play;

  // ---------- joining ----------

  async function enter(code) {
    if (connecting || unwatch) return;
    connecting = true;
    msg(t('band.connecting'));
    try { state.api = await connect(); }
    catch (e) { connecting = false; failed(e); showRetry(); renderAll(); return; }
    connecting = false;
    Object.assign(state, { code, band: null, members: [], songs: [], setlists: [], free: [], polls: [] });
    cleaned = false;
    unwatch = state.api.watch(code, {
      band: (d) => { if (d) { state.band = d; msg(''); renderAll(); } else lost(t('band.gone')); },
      members: (r) => { state.members = r; renderAll(); },
      songs: (r) => { state.songs = r.sort(byName('title')); renderAll(); },
      setlists: (r) => { state.setlists = r.sort(byName('name')); renderAll(); },
      free: (r) => { state.free = r; cleanUpFree(); renderAll(); },
      polls: (r) => { state.polls = r; renderAll(); },
      // the member list is what tells you you've left; other refusals are just shown
      error: (e, what) => (e && e.code === 'permission-denied' && what === 'members' ? lost(t('band.notMember')) : failed(e)),
    });
  }

  function exit() {
    if (unwatch) unwatch();
    unwatch = null;
    Object.assign(state, { code: null, band: null });
    setBand(null);
    screens.setlists.stopCue();
    if (location.hash.startsWith('#/band/')) go(path('band'), { replace: true }); // not if you're on the tuner
    renderAll();
  }
  function lost(text) { exit(); msg(text, true); }

  /** Removes your own free times on days that have passed, once per visit. */
  function cleanUpFree() {
    const today = dayKey(new Date());
    const old = state.free.filter((f) => f.uid === state.api.uid && f.date < today).map((f) => f.date);
    if (!old.length || cleaned) return;
    cleaned = true;
    write(state.api.dropFree(state.code, old));
  }

  async function submitSetup(kind) {
    const me = cleanText($('meName').value, LIMITS.member);
    if (!me) { msg(t('band.needName'), true); $('meName').focus(); return; }
    let code = null, name = '';
    if (kind === 'join') {
      code = normalizeCode($('joinCode').value);
      if (!code) { msg(t('band.badCode'), true); $('joinCode').focus(); return; }
    } else {
      name = cleanText($('bandName').value, LIMITS.band);
      if (!name) { msg(t('band.needBandName'), true); $('bandName').focus(); return; }
    }
    setMe(me);
    const buttons = view.querySelectorAll('.band-form button');
    buttons.forEach((b) => { b.disabled = true; });
    msg(t(kind === 'join' ? 'band.joining' : 'band.starting'));
    try {
      state.api = await connect();
      if (kind === 'join') await state.api.joinBand(code, me);
      else code = await state.api.createBand(name, me);
      setBand(code);
      $('joinCode').value = ''; $('bandName').value = '';
      await enter(code);
    } catch (e) { failed(e); }
    buttons.forEach((b) => { b.disabled = false; });
  }

  function showRetry() {
    const b = el('button', 'link-btn', ' ' + t('common.tryAgain'));
    b.addEventListener('click', () => enter(settings.band.code));
    $('bandMsg').appendChild(b);
  }

  // ---------- band menu ----------

  async function share() {
    const { band, code } = state;
    const link = location.origin + location.pathname + '?join=' + code;
    const text = t('band.shareText', { band: band.name, code });
    try {
      if (navigator.share) { await navigator.share({ title: band.name, text, url: link }); return; }
      await navigator.clipboard.writeText(text + ': ' + link);
      msg(t('band.linkCopied'));
    } catch (e) {
      if (e && e.name === 'AbortError') return; // closed the share sheet
      msg(t('band.yourCode', { code }));
    }
  }

  const memberNames = () => state.members.slice().sort(byName('name'))
    .map((m) => (m.id === state.api.uid ? t('band.you', { name: m.name }) : m.name)).join(', ');

  function openMenu() {
    $('bandMenuTitle').textContent = state.band.name;
    $('bandCode').textContent = state.code;
    $('menuMembers').textContent = memberNames();
    $('bandMenu').showModal();
  }
  const menuBtn = render(html`<button class="icon-btn" id="btnBandMenu" aria-label="${t('band.menu.open')}" aria-haspopup="dialog">${icon('more')}</button>`);
  menuBtn.addEventListener('click', openMenu);

  // ---------- name dialog: your name, the band's, a setlist's ----------

  const NAMES = {
    [ME]: { title: 'band.menu.changeName', label: 'band.yourName', max: LIMITS.member, hint: 'band.yourNameHint', value: () => (state.members.find((m) => m.id === state.api.uid) || { name: settings.me }).name },
    [BAND]: { title: 'band.menu.rename', label: 'band.bandName', max: LIMITS.band, hint: '', value: () => state.band.name },
  };

  /** id: a setlist to rename, null for a new setlist, or ME / BAND. */
  function openNameDialog(id) {
    naming = id;
    const n = NAMES[id];
    const input = $('nameForm').elements.name;
    input.value = n ? n.value() : id ? ctx.listById(id).name : '';
    input.maxLength = n ? n.max : LIMITS.setlist;
    input.placeholder = n ? (n.hint && t(n.hint)) : t('band.setlists.nameHint');
    $('nameForm').querySelector('.field span').textContent = t(n ? n.label : 'band.setlists.name');
    $('nameDialogTitle').textContent = n ? t(n.title) : t(id ? 'band.setlists.dialogEdit' : 'band.setlists.dialogNew');
    $('btnDeleteSetlist').hidden = !id || !!n;
    $('nameDialog').showModal();
    input.focus();
  }

  function saveName(e) {
    e.preventDefault();
    const name = cleanText($('nameForm').elements.name.value, NAMES[naming] ? NAMES[naming].max : LIMITS.setlist);
    if (!name) return;
    const { api, code } = state;
    if (naming === ME) { setMe(name); write(api.renameMe(code, name)); }
    else if (naming === BAND) write(api.renameBand(code, name));
    else if (naming) write(api.updateSetlist(code, naming, { name }));
    else {
      const { id, done } = api.newSetlist(code, name);
      write(done);
      go(path('band', 'setlists', id));
    }
    $('nameDialog').close();
  }

  function deleteSetlist() {
    const l = ctx.listById(naming);
    if (!l || !confirm(t('band.setlists.deleteConfirm', { name: l.name }))) return;
    write(state.api.deleteSetlist(state.code, l.id));
    $('nameDialog').close();
    go(path('band', 'setlists'), { replace: true });
  }

  // ---------- drawing ----------

  /** The screen for the current address, or null while loading. */
  function currentScreen() {
    if (!settings.band) return 'setup';
    if (!state.band) return null; // enter() shows progress, or the problem and a retry
    return screens[route.sub] ? route.sub : 'home';
  }

  function renderAll() {
    const inBand = !!settings.band;
    const screen = currentScreen();
    $('bandSetup').hidden = screen !== 'setup';
    $('bandHome').hidden = screen !== 'home';
    Object.entries(screens).forEach(([k, s]) => { s.el.hidden = screen !== k; });
    if (screen === 'setup') renderSetup();
    else if (screen === 'home') renderHome();
    else if (screen) screens[screen].render(route);
    screens.setlists.renderCue(); // the metronome's setlist bar follows song edits

    const open = state.band ? state.polls.filter((p) => !p.closed) : [];
    shell.setBand({
      inBand,
      name: state.band ? state.band.name : '',
      needVote: state.band ? needsVote(state.polls, state.api.uid) : 0,
      open: open.length,
    });
    shell.refresh();
  }

  function renderSetup() {
    $('setupTitle').textContent = t(settings.kawaii ? 'band.titleKawaii' : 'band.title');
    if (!$('meName').value) $('meName').value = settings.me;
  }

  function homeCard(sub, text, count) {
    const a = $('home-' + sub);
    a.querySelector('small').textContent = text;
    const b = a.querySelector('.count');
    b.hidden = !count;
    b.textContent = count || '';
  }

  function renderHome() {
    const { polls, songs, setlists, members, api } = state;
    $('bandMembers').textContent = memberNames();

    const decided = polls.filter((p) => p.closed && p.options[p.winner] != null)
      .sort((a, b) => stamp(b) - stamp(a))[0];
    $('homeDecided').hidden = !decided;
    if (decided) {
      $('homeDecidedQ').textContent = decided.question;
      $('homeDecidedA').textContent = decided.options[decided.winner];
    }

    const open = polls.filter((p) => !p.closed).length;
    const need = needsVote(polls, api.uid);
    homeCard('polls', need ? t('nav.needsVote', { n: need }) : open ? t('band.home.pollsOpen', { n: open }) : t('band.home.pollsNone'), need);

    // the next 7 days: how many have everyone free, else the best day
    const n = members.length;
    const days = [...Array(7)].map((_, i) => dayKey(addDays(new Date(), i)));
    const bests = days.map((d) => ({ d, w: best(freeEntries(state, d)) })).filter((x) => x.w);
    const all = n > 1 ? bests.filter((x) => x.w.uids.length === n).length : 0;
    const top = bests.sort((a, b) => b.w.uids.length - a.w.uids.length)[0];
    homeCard('calendar', all ? t('band.home.everyoneDays', { n: all })
      : top && n > 1 && top.w.uids.length > 1 ? t('band.home.bestDay', { day: screens.calendar.dayName(top.d), n: top.w.uids.length, total: n })
        : t('band.home.addFree'));
    homeCard('songs', t('band.home.songCount', { n: songs.length }));
    homeCard('setlists', t('band.home.setlistCount', { n: setlists.length }));
  }

  // ---------- wiring ----------

  $('formJoin').addEventListener('submit', (e) => { e.preventDefault(); submitSetup('join'); });
  $('formCreate').addEventListener('submit', (e) => { e.preventDefault(); submitSetup('create'); });
  $('btnShare').addEventListener('click', share);
  $('btnMenuDone').addEventListener('click', () => $('bandMenu').close());
  $('btnRename').addEventListener('click', () => { $('bandMenu').close(); openNameDialog(ME); });
  $('btnRenameBand').addEventListener('click', () => { $('bandMenu').close(); openNameDialog(BAND); });
  $('btnLeave').addEventListener('click', () => {
    if (!confirm(t('band.menu.leaveConfirm', { band: state.band.name, code: state.code }))) return;
    $('bandMenu').close();
    write(state.api.leaveBand(state.code));
    exit();
  });
  $('nameForm').addEventListener('submit', saveName);
  $('btnCancelName').addEventListener('click', () => $('nameDialog').close());
  $('btnDeleteSetlist').addEventListener('click', deleteSetlist);

  // an invite link (…?join=ABCD-2345) fills in the code
  const invited = normalizeCode(new URLSearchParams(location.search).get('join'));
  if (invited) {
    history.replaceState(null, '', location.pathname + location.hash);
    if (!settings.band) $('joinCode').value = invited;
  }
  if (settings.band) setTimeout(() => enter(settings.band.code), CONNECT_DELAY_MS);
  renderAll();

  return {
    id: 'band',
    el: view,
    invited: !!invited && !settings.band,
    show(r) {
      route = r;
      if (settings.band) enter(settings.band.code);
      else if (r.sub) { go(path('band'), { replace: true }); return; }
      renderAll();
    },
    hide() {},
    head() {
      const screen = currentScreen();
      if (screen === 'setup' || !screen) return { title: t('nav.band') };
      if (screen === 'home') return { title: state.band.name, actions: [menuBtn] };
      const h = screens[screen].head ? screens[screen].head(route) : null;
      return h || { title: t('nav.' + screen), actions: [menuBtn] };
    },
    rerender: renderAll,
  };
}

const stamp = (p) => (p.createdAt && p.createdAt.toMillis ? p.createdAt.toMillis() : typeof p.createdAt === 'number' ? p.createdAt : Infinity);
