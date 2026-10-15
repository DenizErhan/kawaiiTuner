/* The Plan pane of a band: polls, and everyone's free time a week at a time.
   band-panel.js hands it the live data; writes go through band-store.js.
   Who is shown counts only people still in the band. */
import { $, el, iconBtn, empty } from './dom.js';
import {
  PLAN_LIMITS, DAY, dayKey, fromKey, addDays, dayLabel, weekLabel, toMin, inputMin, fmtRange,
  pairs, cleanRanges, overlaps, best, suggest, cleanPoll, tally, toggleVote, leader,
} from './plan.js';

const AXIS = [6 * 60, DAY]; // the day bars show 06:00–24:00
const MAX_WEEKS = 26;

/** band(): { api, code, members } of the open band; write(promise): shows it if it fails. */
export function createPlanPanel({ band, write }) {
  let free = [], polls = [];
  let week = 0, editingDay = null, closing = null, cleaned = false;

  const today = () => dayKey(new Date());
  const memberIds = () => band().members.map((m) => m.id);
  const nameOf = (uid) => { const m = band().members.find((x) => x.id === uid); return m ? m.name : 'Someone'; };
  const byPerson = (a, b) => nameOf(a.uid).localeCompare(nameOf(b.uid), undefined, { sensitivity: 'base' });
  const rangesText = (times) => pairs(times).map(([s, e]) => fmtRange(s, e)).join(', ');
  const planMsg = (text) => { $('planMsg').textContent = text || ''; };

  /** Free times of people in the band on one day, sorted by name. */
  function entries(key) {
    const ids = memberIds();
    return free
      .filter((f) => f.date === key && ids.includes(f.uid))
      .map((f) => ({ uid: f.uid, times: cleanRanges(pairs(f.times)) }))
      .filter((e) => e.times.length)
      .sort(byPerson);
  }
  function weekDays() {
    const first = addDays(fromKey(today()), week * 7);
    return [...Array(7)].map((_, i) => dayKey(addDays(first, i)));
  }

  // ---------- polls ----------

  const created = (p) => (p.createdAt && p.createdAt.toMillis ? p.createdAt.toMillis() : typeof p.createdAt === 'number' ? p.createdAt : Infinity); // Infinity: not on the server yet
  const myPicks = (p) => (p.votes && Array.isArray(p.votes[band().api.uid]) ? p.votes[band().api.uid] : []);

  function renderPolls() {
    const ul = $('pollList');
    ul.textContent = '';
    // open polls first, newest on top
    const list = polls.slice().sort((a, b) => (a.closed - b.closed) || (created(b) > created(a)) - (created(b) < created(a)));
    if (!list.length) return empty(ul, 'No polls yet. Ask the band something!');
    list.forEach((p) => ul.appendChild(pollCard(p)));
  }

  function pollCard(p) {
    const me = band().api.uid;
    const t = tally(p, memberIds());
    const voters = new Set(t.flatMap((x) => x.uids)).size;
    const mine = myPicks(p);
    const isClosing = closing === p.id;
    const li = el('li', 'poll' + (p.closed ? ' closed' : ''));
    li.dataset.poll = p.id;
    li.appendChild(el('strong', 'poll-q', p.question));
    const how = p.closed ? 'decided' : p.multi ? 'pick any' : 'pick one';
    li.appendChild(el('small', 'poll-meta', [nameOf(p.createdBy) + ' asked', how, voters === 1 ? '1 voted' : voters + ' voted'].join(' · ')));
    if (isClosing) li.appendChild(el('p', 'poll-hint', 'Tap the option you decided on. Most votes: ' + p.options[leader(t)]));

    const opts = el('div', 'poll-opts');
    const n = Math.max(1, band().members.length);
    p.options.forEach((o, i) => {
      const won = p.closed && p.winner === i;
      const b = el('button', 'opt' + (won ? ' win' : ''));
      b.dataset.opt = i;
      b.disabled = p.closed;
      b.setAttribute('aria-pressed', String(mine.includes(i)));
      b.style.setProperty('--p', Math.round(100 * t[i].count / n) + '%');
      const line = el('span', 'opt-line');
      line.append(el('span', 'opt-label', (won ? '✓ ' : '') + o), el('span', 'opt-n', String(t[i].count)));
      b.append(line, el('small', 'opt-who', t[i].uids.map(nameOf).sort().join(', ')));
      opts.appendChild(b);
    });
    li.appendChild(opts);

    if (p.createdBy === me) {
      const foot = el('div', 'poll-foot');
      const link = (text, act) => { const b = el('button', 'link-btn', text); b.dataset.act = act; foot.appendChild(b); };
      if (!p.closed) link(isClosing ? 'Cancel' : 'Close poll', isClosing ? 'keep' : 'close');
      else link('Delete poll', 'delete');
      li.appendChild(foot);
    }
    return li;
  }

  function tapPoll(e) {
    const b = e.target.closest('button');
    const li = e.target.closest('li[data-poll]');
    const p = li && polls.find((x) => x.id === li.dataset.poll);
    if (!b || !p) return;
    const { api, code } = band();
    if (b.dataset.act === 'close') closing = p.id;
    else if (b.dataset.act === 'keep') closing = null;
    else if (b.dataset.act === 'delete') {
      if (!confirm('Delete the poll “' + p.question + '”?')) return;
      write(api.deletePoll(code, p.id));
    } else if (b.dataset.opt != null && !p.closed) {
      const i = Number(b.dataset.opt);
      if (closing === p.id) { closing = null; write(api.closePoll(code, p.id, i)); }
      else write(api.vote(code, p.id, toggleVote(myPicks(p), i, p.multi)));
    }
    renderPolls();
  }

  // ---------- poll dialog ----------

  function openPoll(question, options, multi) {
    const f = $('pollForm');
    f.elements.question.value = question;
    f.elements.multi.checked = multi;
    $('optInputs').textContent = '';
    (options.length >= 2 ? options : options.concat('', '').slice(0, 2)).forEach(addOption);
    $('pollErr').textContent = '';
    $('pollDialog').showModal();
    if (!question) f.elements.question.focus();
  }

  function addOption(value) {
    const ul = $('optInputs');
    if (ul.children.length >= PLAN_LIMITS.options) return null;
    const input = el('input');
    input.maxLength = PLAN_LIMITS.option;
    input.autocomplete = 'off';
    input.value = value || '';
    input.placeholder = 'Option ' + (ul.children.length + 1);
    input.setAttribute('aria-label', input.placeholder);
    const li = el('li', 'opt-input');
    li.append(input, iconBtn('remove', 'Remove this option', { rm: '' }));
    ul.appendChild(li);
    syncOptions();
    return input;
  }
  function syncOptions() {
    const items = [...$('optInputs').children];
    items.forEach((li) => { li.querySelector('[data-rm]').hidden = items.length <= 2; });
    $('btnAddOption').hidden = items.length >= PLAN_LIMITS.options;
  }

  function savePoll(e) {
    e.preventDefault();
    const f = $('pollForm');
    const poll = cleanPoll({
      question: f.elements.question.value,
      options: [...$('optInputs').querySelectorAll('input')].map((i) => i.value),
      multi: f.elements.multi.checked,
    });
    if (!poll) { $('pollErr').textContent = 'Write a question and at least 2 different options.'; return; }
    const { api, code } = band();
    write(api.newPoll(code, poll));
    $('pollDialog').close();
  }

  // ---------- free time ----------

  function renderWeek() {
    const days = weekDays();
    $('weekLabel').textContent = week === 0 ? 'Next 7 days' : weekLabel(fromKey(days[0]));
    $('weekPrev').disabled = week === 0;
    $('weekNext').disabled = week >= MAX_WEEKS;
    const n = band().members.length;
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
      when.append(el('strong', '', key === today() ? 'Today' : wd), el('small', '', date.join(' ')));
      const body = el('span', 'day-body');
      body.append(dayBar(es, n), el('span', 'day-sum' + (es.length ? '' : ' none'), summary(es, w, n)));
      if (es.length) body.appendChild(el('small', 'day-who', es.map((x) => nameOf(x.uid) + ' ' + rangesText(x.times)).join(' · ')));
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
    if (!es.length) return 'Tap to add when you’re free';
    if (w && n > 1 && w.uids.length === n) return 'Everyone free ' + fmtRange(w.start, w.end);
    if (w && w.uids.length >= 2) return w.uids.length + ' of ' + n + ' free ' + fmtRange(w.start, w.end);
    return n > 1 ? 'No overlap yet' : 'Free';
  }

  /** Drops your own free times on days that have passed, once per band visit. */
  function cleanUp() {
    const { api, code } = band();
    const old = free.filter((f) => f.uid === api.uid && f.date < today()).map((f) => f.date);
    if (!old.length || cleaned) return;
    cleaned = true;
    write(api.dropFree(code, old));
  }

  // ---------- day dialog ----------

  function openDay(key) {
    editingDay = key;
    const me = band().api.uid;
    const es = entries(key);
    const mine = es.find((x) => x.uid === me);
    $('dayDialogTitle').textContent = dayLabel(key);
    $('rangeList').textContent = '';
    pairs(mine ? mine.times : []).forEach(([s, e]) => addRange(s, e));
    $('btnClearDay').hidden = !mine;
    $('dayErr').textContent = '';
    const others = es.filter((x) => x.uid !== me);
    $('dayOthers').textContent = others.length ? 'Others: ' + others.map((x) => nameOf(x.uid) + ' ' + rangesText(x.times)).join(' · ') : '';
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
    const from = timeInput('From', s);
    li.append(from, el('span', 'range-dash', '–'), timeInput('Until', e), iconBtn('remove', 'Remove this time', { rm: '' }));
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
    const { api, code } = band();
    const had = free.some((f) => f.date === editingDay && f.uid === api.uid);
    if (times.length || had) write(api.setFree(code, editingDay, times));
    $('dayDialog').close();
  }

  // ---------- wiring ----------

  $('btnAddPoll').addEventListener('click', () => openPoll('', [], true));
  $('pollList').addEventListener('click', tapPoll);
  $('btnAddOption').addEventListener('click', () => { const i = addOption(''); if (i) i.focus(); });
  $('optInputs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-rm]');
    if (b) { b.parentElement.remove(); syncOptions(); }
  });
  $('pollForm').addEventListener('submit', savePoll);
  $('btnCancelPoll').addEventListener('click', () => $('pollDialog').close());

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
    if (!times) { $('dayErr').textContent = 'Each time needs a start, and an end after it.'; return; }
    saveDay(times);
  });
  $('btnClearDay').addEventListener('click', () => saveDay([]));
  $('btnCancelDay').addEventListener('click', () => $('dayDialog').close());

  $('btnDayPoll').addEventListener('click', () => {
    const n = band().members.length;
    const options = suggest(weekDays().map((key) => ({ key, entries: entries(key) })), Math.min(2, n));
    if (!options.length) {
      planMsg(n > 1 ? 'Nobody’s free times overlap in these 7 days yet. Add yours, or try another week.' : 'Add your free times first.');
      return;
    }
    planMsg('');
    openPoll('When do we practise?', options, true);
  });

  return {
    setFree(rows) { free = rows; cleanUp(); },
    setPolls(rows) {
      polls = rows;
      if (closing && !rows.some((p) => p.id === closing && !p.closed)) closing = null;
    },
    render() { renderPolls(); renderWeek(); },
    /** A different band was opened. */
    reset() { free = []; polls = []; week = 0; closing = null; cleaned = false; planMsg(''); },
  };
}
