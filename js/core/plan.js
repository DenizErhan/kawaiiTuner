/* The Plan tab's pure parts: dates, free-time ranges, overlaps, poll votes.
   No DOM or Firebase, so the unit tests import it straight into Node.
   Limits match firestore.rules. Times are minutes since midnight; 1440 is
   midnight at the end of the day. */
import { cleanText } from './band.js';
import { t } from '../i18n/i18n.js';

export const PLAN_LIMITS = { ranges: 8, question: 100, option: 60, options: 10 };
export const DAY = 1440;
export const MIN_WINDOW = 30; // shorter overlaps aren't worth a practice

const pad = (n) => String(n).padStart(2, '0');

/** Local date -> "2026-10-18". */
export const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
/** "2026-10-18" -> that day's local midnight. */
export function fromKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// names from the language file rather than toLocaleDateString, whose punctuation differs between phones
const month = (d) => t('date.months')[d.getMonth()];
/** "Sat 18 Oct" */
export function dayLabel(k) {
  const d = fromKey(k);
  return t('date.days')[d.getDay()] + ' ' + d.getDate() + ' ' + month(d);
}
/** The 7 days starting at `first`: "15–21 Oct", or "29 Oct – 4 Nov". */
export function weekLabel(first) {
  const last = addDays(first, 6);
  return first.getMonth() === last.getMonth()
    ? first.getDate() + '–' + last.getDate() + ' ' + month(last)
    : first.getDate() + ' ' + month(first) + ' – ' + last.getDate() + ' ' + month(last);
}

/** "18:30" -> 1110, or null. An end time of "00:00" means midnight, 1440. */
export function toMin(s, isEnd) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  if (v > DAY) return null;
  return isEnd && v === 0 ? DAY : v;
}
/** 1110 -> "18:30" (and 1440 -> "24:00"). */
export const fmtMin = (v) => pad(Math.floor(v / 60)) + ':' + pad(v % 60);
/** The value for an <input type="time">, which has no 24:00. */
export const inputMin = (v) => fmtMin(v % DAY);
export const fmtRange = (s, e) => fmtMin(s) + '–' + fmtMin(e);

/** Flat [s1, e1, s2, e2, …] -> [[s1, e1], …]. */
export function pairs(flat) {
  const out = [];
  for (let i = 0; i + 1 < (flat || []).length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

/** [[start, end], …] -> sorted, overlaps merged, bad ones dropped, flat: what gets saved. */
export function cleanRanges(list) {
  const ok = list
    .filter(([s, e]) => Number.isInteger(s) && Number.isInteger(e) && s >= 0 && e <= DAY && e > s)
    .map(([s, e]) => [s, e])
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  ok.forEach(([s, e]) => {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  });
  return out.slice(0, PLAN_LIMITS.ranges).flat();
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** entries: [{ uid, times }] for one day -> [{ start, end, uids }] for every
    stretch when someone is free; neighbours with the same people are joined. */
export function overlaps(entries) {
  const pts = [...new Set(entries.flatMap((e) => e.times))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const s = pts[i], e = pts[i + 1];
    const uids = entries.filter((x) => pairs(x.times).some(([a, b]) => a <= s && b >= e)).map((x) => x.uid);
    if (!uids.length) continue;
    const last = out[out.length - 1];
    if (last && last.end === s && same(last.uids, uids)) last.end = e;
    else out.push({ start: s, end: e, uids });
  }
  return out;
}

/** The longest stretch (MIN_WINDOW or more) when the most people are free, or null. */
export function best(entries) {
  let top = null;
  overlaps(entries).forEach((o) => {
    const len = o.end - o.start;
    if (len < MIN_WINDOW) return;
    if (!top || o.uids.length > top.uids.length || (o.uids.length === top.uids.length && len > top.end - top.start)) top = o;
  });
  return top;
}

/** days: [{ key, entries }] -> day-poll options: each day's best time when at
    least `need` people are free. The days with the most people win; shown by date. */
export function suggest(days, need) {
  return days
    .map((d) => ({ key: d.key, w: best(d.entries) }))
    .filter((x) => x.w && x.w.uids.length >= need)
    .sort((a, b) => b.w.uids.length - a.w.uids.length || (a.key < b.key ? -1 : 1))
    .slice(0, PLAN_LIMITS.options)
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((x) => dayLabel(x.key) + ' · ' + fmtRange(x.w.start, x.w.end));
}

/** Form values -> a poll the rules accept, or null (needs a question and 2 different options). */
export function cleanPoll(f) {
  const question = cleanText(f.question, PLAN_LIMITS.question);
  const seen = new Set();
  const options = (f.options || []).map((o) => cleanText(o, PLAN_LIMITS.option)).filter((o) => {
    const k = o.toLowerCase();
    if (!o || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, PLAN_LIMITS.options);
  if (!question || options.length < 2) return null;
  return { question, options, multi: !!f.multi };
}

/** Votes of current members -> [{ count, uids }] per option. */
export function tally(poll, memberIds) {
  const out = poll.options.map(() => ({ count: 0, uids: [] }));
  Object.entries(poll.votes || {}).forEach(([uid, picks]) => {
    if (!memberIds.includes(uid) || !Array.isArray(picks)) return;
    picks.forEach((i) => { if (out[i]) { out[i].count++; out[i].uids.push(uid); } });
  });
  return out;
}

/** Your picks after tapping option i. */
export function toggleVote(picks, i, multi) {
  if (picks.includes(i)) return picks.filter((p) => p !== i);
  return multi ? picks.concat(i).sort((a, b) => a - b) : [i];
}

/** Index of the option with the most votes (the first one on a tie). */
export const leader = (t) => t.reduce((top, x, i) => (x.count > t[top].count ? i : top), 0);
