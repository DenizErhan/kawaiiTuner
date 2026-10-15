/* Everyone's free time (#/band/calendar), 7 days at a time from today, and
   the dialog for your own times on one day. Each day shows who overlaps and
   the best window; one tap turns the week's best times into a day poll. */
import {
  DAY, dayKey, fromKey, addDays, dayLabel, weekLabel, toMin, inputMin, fmtRange,
  pairs, cleanRanges, overlaps, best, suggest,
} from '../../core/plan.js';
import { t } from '../../i18n/i18n.js';
import { html, render } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { $, el, iconBtn, closeOnBackdrop } from '../../ui/dom.js';
import { go, path } from '../../app/router.js';

const AXIS = [6 * 60, DAY]; // the day bars show 06:00–24:00
const MAX_WEEKS = 26;

const template = () => html`
  <div class="band-screen" id="paneCalendar" hidden>
    <div class="week-nav">
      <button class="icon-btn" id="weekPrev" aria-label="${t('band.calendar.earlier')}">${icon('back')}</button>
      <strong id="weekLabel"></strong>
      <button class="icon-btn" id="weekNext" aria-label="${t('band.calendar.later')}">${icon('next')}</button>
    </div>
    <ul class="list" id="dayList"></ul>
    <button class="add-btn" id="btnDayPoll">${t('band.calendar.makePoll')}</button>
    <p class="plan-msg" id="planMsg" role="status" aria-live="polite"></p>
  </div>`;

const dialog = () => html`
  <dialog class="pop" id="dayDialog" aria-labelledby="dayDialogTitle">
    <form method="dialog" id="dayForm" novalidate>
      <h2 id="dayDialogTitle"></h2>
      <p class="pop-hint">${t('band.calendar.dayHint')}</p>
      <ul class="ranges" id="rangeList"></ul>
      <div class="quick" id="quickTimes">
        <button type="button" data-s="10:00" data-e="18:00">${t('band.calendar.daytime')}</button>
        <button type="button" data-s="18:00" data-e="00:00">${t('band.calendar.evening')}</button>
        <button type="button" data-s="00:00" data-e="00:00">${t('band.calendar.allDay')}</button>
        <button type="button" data-s="18:00" data-e="21:00">${t('band.calendar.other')}</button>
      </div>
      <p class="pop-hint err" id="dayErr"></p>
      <p class="pop-hint" id="dayOthers"></p>
      <div class="pop-actions">
        <button type="button" class="ghost danger" id="btnClearDay">${t('band.calendar.notFree')}</button>
        <button type="button" class="ghost" id="btnCancelDay">${t('common.cancel')}</button>
        <button class="go go-sm" value="save">${t('common.save')}</button>
      </div>
    </form>
  </dialog>`;

/** Free times of people in the band on one day ("2026-10-18"), sorted by name. */
export function freeEntries(state, key) {
  const ids = state.members.map((m) => m.id);
  const name = (uid) => (state.members.find((m) => m.id === uid) || { name: '' }).name;
  return state.free
    .filter((f) => f.date === key && ids.includes(f.uid))
    .map((f) => ({ uid: f.uid, times: cleanRanges(pairs(f.times)) }))
    .filter((e) => e.times.length)
    .sort((a, b) => name(a.uid).localeCompare(name(b.uid), undefined, { sensitivity: 'base' }));
}

const rangesText = (times) => pairs(times).map(([s, e]) => fmtRange(s, e)).join(', ');
const today = () => dayKey(new Date());

export function createCalendar(parent, ctx) {
  const screen = render(template());
  parent.appendChild(screen);
  document.body.appendChild(render(dialog()));
  closeOnBackdrop($('dayDialog'));
  const { state } = ctx;
  let week = 0, editingDay = null;

  const entries = (key) => freeEntries(state, key);
  const planMsg = (text) => { $('planMsg').textContent = text || ''; };
  const whoText = (es) => es.map((x) => ctx.nameOf(x.uid) + ' ' + rangesText(x.times)).join(' · ');
  function weekDays() {
    const first = addDays(fromKey(today()), week * 7);
    return [...Array(7)].map((_, i) => dayKey(addDays(first, i)));
  }

  function renderWeek() {
    const days = weekDays();
    $('weekLabel').textContent = week === 0 ? t('band.calendar.next7') : weekLabel(fromKey(days[0]));
    $('weekPrev').disabled = week === 0;
    $('weekNext').disabled = week >= MAX_WEEKS;
    const n = state.members.length;
    const ul = $('dayList');
    ul.textContent = '';
    days.forEach((key) => {
      const es = entries(key);
      const w = best(es);
      const everyone = n > 1 && w && w.uids.length === n;
      const b = el('button', 'day' + (everyone ? ' all' : ''));
      b.dataset.day = key;
      const [wd, ...date] = dayLabel(key).split(' ');
      const when = el('span', 'day-date');
      when.append(el('strong', '', key === today() ? t('band.calendar.today') : wd), el('small', '', date.join(' ')));
      const body = el('span', 'day-body');
      body.append(dayBar(es, n), el('span', 'day-sum' + (es.length ? '' : ' none'), summary(es, w, n)));
      if (es.length) body.appendChild(el('small', 'day-who', whoText(es)));
      b.append(when, body);
      const li = el('li');
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function dayBar(es, n) {
    const bar = el('span', 'day-bar');
    const [a0, a1] = AXIS;
    overlaps(es).forEach((o) => {
      const s = Math.max(o.start, a0), e = Math.min(o.end, a1);
      if (e <= s) return;
      const i = el('i', n > 1 && o.uids.length === n ? 'all' : '');
      i.style.left = (100 * (s - a0) / (a1 - a0)) + '%';
      i.style.width = (100 * (e - s) / (a1 - a0)) + '%';
      i.style.opacity = String(0.3 + 0.7 * o.uids.length / Math.max(1, n));
      bar.appendChild(i);
    });
    return bar;
  }

  function summary(es, w, n) {
    if (!es.length) return t('band.calendar.tapToAdd');
    if (w && n > 1 && w.uids.length === n) return t('band.calendar.everyone', { range: fmtRange(w.start, w.end) });
    if (w && w.uids.length >= 2) return t('band.calendar.some', { n: w.uids.length, total: n, range: fmtRange(w.start, w.end) });
    return t(n > 1 ? 'band.calendar.noOverlap' : 'band.calendar.free');
  }

  // ---------- day dialog ----------

  function openDay(key) {
    editingDay = key;
    const me = ctx.me();
    const es = entries(key);
    const mine = es.find((x) => x.uid === me);
    $('dayDialogTitle').textContent = dayLabel(key);
    $('rangeList').textContent = '';
    pairs(mine ? mine.times : []).forEach(([s, e]) => addRange(s, e));
    $('btnClearDay').hidden = !mine;
    $('dayErr').textContent = '';
    const others = es.filter((x) => x.uid !== me);
    $('dayOthers').textContent = others.length ? t('band.calendar.others', { list: whoText(others) }) : '';
    $('dayDialog').showModal();
  }

  function timeInput(label, v) {
    const i = el('input');
    i.type = 'time';
    i.step = 300;
    i.value = inputMin(v);
    i.setAttribute('aria-label', label);
    return i;
  }
  function addRange(s, e) {
    const li = el('li', 'range');
    const from = timeInput(t('band.calendar.from'), s);
    li.append(from, el('span', 'range-dash', '–'), timeInput(t('band.calendar.until'), e), iconBtn('remove', t('band.calendar.removeTime'), { rm: '' }));
    $('rangeList').appendChild(li);
    return from;
  }

  /** The times in the dialog, or null when one doesn't make sense. */
  function readRanges() {
    const list = [...$('rangeList').children].map((li) => {
      const [a, b] = li.querySelectorAll('input');
      return [toMin(a.value), toMin(b.value, true)];
    });
    return list.some(([s, e]) => s == null || e == null || e <= s) ? null : cleanRanges(list);
  }

  function saveDay(times) {
    const { api, code } = state;
    const had = state.free.some((f) => f.date === editingDay && f.uid === api.uid);
    if (times.length || had) ctx.write(api.setFree(code, editingDay, times));
    $('dayDialog').close();
  }

  // ---------- wiring ----------

  $('weekPrev').addEventListener('click', () => { week = Math.max(0, week - 1); planMsg(''); renderWeek(); });
  $('weekNext').addEventListener('click', () => { week = Math.min(MAX_WEEKS, week + 1); planMsg(''); renderWeek(); });
  $('dayList').addEventListener('click', (e) => { const b = e.target.closest('button[data-day]'); if (b) openDay(b.dataset.day); });
  $('quickTimes').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-s]');
    if (b) addRange(toMin(b.dataset.s), toMin(b.dataset.e, true)).focus();
  });
  $('rangeList').addEventListener('click', (e) => { const b = e.target.closest('button[data-rm]'); if (b) b.parentElement.remove(); });
  $('dayForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const times = readRanges();
    if (!times) { $('dayErr').textContent = t('band.calendar.badTime'); return; }
    saveDay(times);
  });
  $('btnClearDay').addEventListener('click', () => saveDay([]));
  $('btnCancelDay').addEventListener('click', () => $('dayDialog').close());

  $('btnDayPoll').addEventListener('click', () => {
    const n = state.members.length;
    const options = suggest(weekDays().map((key) => ({ key, entries: entries(key) })), Math.min(2, n));
    if (!options.length) { planMsg(t(n > 1 ? 'band.calendar.noOverlapWeek' : 'band.calendar.addFirst')); return; }
    planMsg('');
    go(path('band', 'polls')); // the new poll shows up there
    ctx.openPoll(t('band.polls.practice'), options, true);
  });

  return {
    el: screen,
    render: renderWeek,
    /** "Sat 18" for the band home. */
    dayName: (key) => (key === today() ? t('band.calendar.today') : dayLabel(key)),
  };
}
