/* Unit tests for the pure modules (no browser needed): `npm run test:unit`. */
import assert from 'node:assert/strict';
import { yin } from '../js/core/yin.js';
import { noteFromFreq, NOTE_NAMES } from '../js/core/notes.js';
import { createPitchTracker, median, rms } from '../js/core/pitch-tracker.js';
import { tempoName } from '../js/core/metronome.js';
import { makeCode, normalizeCode, cleanSong, songMeta, moveItem, LIMITS } from '../js/core/band.js';
import {
  PLAN_LIMITS, dayKey, fromKey, addDays, dayLabel, weekLabel, toMin, fmtMin, inputMin, pairs, cleanRanges,
  overlaps, best, suggest, cleanPoll, tally, toggleVote, leader,
} from '../js/core/plan.js';
import { THEMES, COLOR_KEYS, DECOS } from '../js/core/settings.js';
import { t, setLang, pickLang, ALL } from '../js/i18n/i18n.js';
import { html } from '../js/ui/html.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto; // older Node has it only under node:crypto

let failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

const SR = 48000;
function tone(f, { n = 4096, harmonics = [1, 0.4, 0.2], noise = 0 } = {}) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    harmonics.forEach((a, h) => { v += a * Math.sin(2 * Math.PI * f * (h + 1) * i / SR); });
    b[i] = 0.3 * v + noise * (Math.random() * 2 - 1);
  }
  return b;
}
const cents = (a, b) => 1200 * Math.log2(a / b);

console.log('yin');
for (const f of [41.2, 55, 82.41, 110, 196, 440, 880, 1318.5]) {
  test(`detects ${f} Hz within 2 cents`, () => {
    const r = yin(tone(f), SR);
    assert.ok(r, 'no pitch found');
    assert.ok(Math.abs(cents(r.freq, f)) < 2, `got ${r.freq.toFixed(2)} Hz`);
  });
}
test('detects 220 Hz with light noise within 5 cents', () => {
  const r = yin(tone(220, { noise: 0.02 }), SR);
  assert.ok(r && Math.abs(cents(r.freq, 220)) < 5, r && `got ${r.freq}`);
});
test('silence gives no pitch', () => assert.equal(yin(new Float32Array(4096), SR), null));
test('white noise gives no pitch', () => {
  const b = new Float32Array(4096).map(() => Math.random() * 2 - 1);
  assert.equal(yin(b, SR), null);
});

console.log('notes');
test('A4 = 440 is A, octave 4, 0 cents', () => {
  const n = noteFromFreq(440, 440);
  assert.equal(NOTE_NAMES.en[n.idx], 'A'); assert.equal(n.oct, 4); assert.ok(Math.abs(n.cents) < 1e-9);
});
test('middle C', () => {
  const n = noteFromFreq(261.63, 440);
  assert.equal(NOTE_NAMES.en[n.idx], 'C'); assert.equal(n.oct, 4); assert.ok(Math.abs(n.cents) < 0.1);
});
test('low E string, solfège names', () => {
  const n = noteFromFreq(82.41, 440);
  assert.equal(NOTE_NAMES.sol[n.idx], 'Mi'); assert.equal(n.oct, 2);
});
test('sharp and flat cents have the right sign', () => {
  assert.ok(noteFromFreq(445, 440).cents > 0);
  assert.ok(noteFromFreq(435, 440).cents < 0);
});
test('A4 reference changes the target', () => {
  const n = noteFromFreq(442, 442);
  assert.ok(Math.abs(n.target - 442) < 1e-9 && Math.abs(n.cents) < 1e-9);
});

console.log('pitch tracker');
test('median', () => { assert.equal(median([3, 1, 2]), 2); assert.equal(median([4, 1, 3, 2]), 2.5); });
test('rms of a full-scale square is 1', () => assert.equal(rms(new Float32Array(64).fill(1)), 1));
test('reports pitch, then lost only after the hold time', () => {
  const seen = []; let lost = 0;
  const t = createPitchTracker({ onPitch: (f) => seen.push(f), onLost: () => lost++, holdMs: 600 });
  t.push(tone(330), SR, 0);
  assert.equal(seen.length, 1); assert.ok(Math.abs(cents(seen[0], 330)) < 2);
  const quiet = new Float32Array(4096);
  t.push(quiet, SR, 500); assert.equal(lost, 0, 'lost too early');
  t.push(quiet, SR, 700); assert.equal(lost, 1);
  assert.equal(t.current, null);
});
test('ignores signal below the gate', () => {
  let n = 0;
  const t = createPitchTracker({ onPitch: () => n++, onLost: () => {} });
  t.push(tone(330).map((v) => v * 0.001), SR, 0);
  assert.equal(n, 0);
});

console.log('metronome');
test('tempo names', () => {
  assert.equal(tempoName(40), 'Largo'); assert.equal(tempoName(100), 'Andante');
  assert.equal(tempoName(120), 'Allegro'); assert.equal(tempoName(250), 'Prestissimo');
});

console.log('band');
test('band codes look like ABCD-2345 and avoid look-alike characters', () => {
  for (let i = 0; i < 200; i++) {
    const c = makeCode();
    assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.ok(!/[01OIL]/.test(c), c);
  }
  assert.equal(makeCode(() => 0), 'AAAA-AAAA');
});
test('typed codes are tidied up, wrong lengths rejected', () => {
  assert.equal(normalizeCode(' abcd 2345 '), 'ABCD-2345');
  assert.equal(normalizeCode('abcd-2345'), 'ABCD-2345');
  assert.equal(normalizeCode('ABCD234'), null);
  assert.equal(normalizeCode(null), null);
});
test('songs are cleaned to what the security rules accept', () => {
  assert.equal(cleanSong({ title: '   ' }), null);
  assert.deepEqual(cleanSong({ title: '  Wonder   wall ', artist: 'Oasis', key: 'F#m', bpm: '87.4', beats: '', notes: ' capo 2 ' }),
    { title: 'Wonder wall', artist: 'Oasis', key: 'F#m', bpm: 87, beats: null, notes: 'capo 2' });
  const s = cleanSong({ title: 'x'.repeat(200), bpm: '999', beats: '0' });
  assert.equal(s.title.length, LIMITS.title);
  assert.equal(s.bpm, 250); assert.equal(s.beats, 1);
  assert.equal(cleanSong({ title: 'a', bpm: 'fast' }).bpm, null);
  assert.ok(Number.isInteger(cleanSong({ title: 'a', bpm: '120' }).bpm), 'bpm must be an integer for the rules');
});
test('song details line', () => {
  assert.equal(songMeta({ artist: 'Oasis', key: 'Am', bpm: 120, beats: 4 }), 'Oasis · Am · 120 BPM');
  assert.equal(songMeta({ artist: '', key: '', bpm: null, beats: 3 }), '3/4');
  assert.equal(songMeta({ artist: '', key: '', bpm: null, beats: null }), '');
});
test('moving setlist songs', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 1), ['a', 'c', 'b']);
  assert.deepEqual(moveItem(['a', 'b'], 0, -1), ['a', 'b'], 'out of range is a no-op');
});
test('band code rule in firestore.rules matches the codes we make', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const m = rules.match(/b\.matches\('([^']+)'\)/);
  assert.ok(m, 'code pattern not found in rules');
  assert.match(makeCode(), new RegExp(m[1]));
  // each limit in js/band.js appears in the rules
  for (const [field, max] of [['title', LIMITS.title], ['artist', LIMITS.artist], ['key', LIMITS.key], ['notes', LIMITS.notes]]) {
    assert.ok(rules.includes(`text(d.${field}, ${field === 'title' ? 1 : 0}, ${max})`), field + ' limit differs from the rules');
  }
});

console.log('plan');
const h = (t) => toMin(t, true); // end times
test('day keys round-trip, across month ends', () => {
  assert.equal(dayKey(new Date(2026, 9, 5)), '2026-10-05');
  assert.equal(dayKey(fromKey('2026-10-18')), '2026-10-18');
  assert.equal(dayKey(addDays(fromKey('2026-10-29'), 7)), '2026-11-05');
});
test('day and week labels', () => {
  assert.equal(dayLabel('2026-10-17'), 'Sat 17 Oct');
  assert.equal(weekLabel(fromKey('2026-10-12')), '12–18 Oct');
  assert.equal(weekLabel(fromKey('2026-10-29')), '29 Oct – 4 Nov');
});
test('times: parsing, midnight as an end, formatting', () => {
  assert.equal(toMin('18:30'), 1110);
  assert.equal(toMin('00:00'), 0);
  assert.equal(h('00:00'), 1440);
  assert.equal(toMin(''), null);
  assert.equal(toMin('25:00'), null);
  assert.equal(fmtMin(1440), '24:00');
  assert.equal(inputMin(1440), '00:00');
});
test('ranges are sorted, merged, and bad ones dropped', () => {
  assert.deepEqual(cleanRanges([[1200, 1320], [600, 720], [700, 800], [900, 900], [1000, 950]]), [600, 800, 1200, 1320]);
  assert.deepEqual(pairs([1, 2, 3, 4]), [[1, 2], [3, 4]]);
  const many = Array.from({ length: 20 }, (_, i) => [i * 60, i * 60 + 30]);
  assert.equal(cleanRanges(many).length, PLAN_LIMITS.ranges * 2, 'capped to what the rules allow');
});
const deniz = { uid: 'd', times: [840, 1320] }; // 14:00–22:00
const ali = { uid: 'a', times: [1110, 1260] }; // 18:30–21:00
const ece = { uid: 'e', times: [600, 720, 1200, 1440] }; // 10–12, 20:00–24:00
test('overlaps: who is free when', () => {
  assert.deepEqual(overlaps([deniz, ali]), [
    { start: 840, end: 1110, uids: ['d'] },
    { start: 1110, end: 1260, uids: ['d', 'a'] },
    { start: 1260, end: 1320, uids: ['d'] },
  ]);
  assert.deepEqual(overlaps([]), []);
});
test('best: most people first, then the longest stretch', () => {
  assert.deepEqual(best([deniz, ali, ece]), { start: 1200, end: 1260, uids: ['d', 'a', 'e'] });
  assert.deepEqual(best([deniz, ali]), { start: 1110, end: 1260, uids: ['d', 'a'] });
  assert.equal(best([{ uid: 'x', times: [600, 620] }]), null, 'under 30 minutes does not count');
});
test('day-poll suggestions: days where enough people overlap, by date', () => {
  const days = [
    { key: '2026-10-19', entries: [deniz, ali, ece] },
    { key: '2026-10-17', entries: [deniz, ali] },
    { key: '2026-10-18', entries: [deniz] },
  ];
  assert.deepEqual(suggest(days, 2), ['Sat 17 Oct · 18:30–21:00', 'Mon 19 Oct · 20:00–21:00']);
  assert.equal(suggest(days, 1).length, 3);
});
test('polls are cleaned: question, 2+ different options', () => {
  assert.deepEqual(cleanPoll({ question: '  Next  cover? ', options: ['Creep', ' creep ', '', 'Wonderwall'], multi: 1 }),
    { question: 'Next cover?', options: ['Creep', 'Wonderwall'], multi: true });
  assert.equal(cleanPoll({ question: 'x', options: ['a', 'A'] }), null);
  assert.equal(cleanPoll({ question: '', options: ['a', 'b'] }), null);
  assert.equal(cleanPoll({ question: 'x', options: Array.from({ length: 15 }, (_, i) => 'o' + i) }).options.length, PLAN_LIMITS.options);
});
test('votes: tally counts members only; toggling picks', () => {
  const poll = { options: ['a', 'b', 'c'], votes: { d: [0, 2], a: [2], gone: [1], e: [] } };
  const t = tally(poll, ['d', 'a', 'e']);
  assert.deepEqual(t.map((x) => x.count), [1, 0, 2]);
  assert.deepEqual(t[2].uids, ['d', 'a']);
  assert.equal(leader(t), 2);
  assert.equal(leader(tally({ options: ['a', 'b'], votes: {} }, [])), 0, 'no votes: the first one');
  assert.deepEqual(toggleVote([2], 0, true), [0, 2]);
  assert.deepEqual(toggleVote([2], 0, false), [0]);
  assert.deepEqual(toggleVote([0, 2], 2, true), [0]);
});
test('plan limits match firestore.rules', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.ok(rules.includes(`text(d.question, 1, ${PLAN_LIMITS.question})`), 'question limit');
  assert.ok(rules.includes(`d.options.size() <= ${PLAN_LIMITS.options}`), 'option count');
  assert.ok(rules.includes(`times.size() <= ${PLAN_LIMITS.ranges * 2}`), 'range count');
  assert.ok(rules.includes(`text(request.resource.data.name, 1, ${LIMITS.band})`), 'band name');
});

console.log('i18n');
const jsFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = join(dir, d.name);
  return d.isDirectory() ? jsFiles(p) : p.endsWith('.js') ? [p] : [];
});
const JS = fileURLToPath(new URL('../js/', import.meta.url));
const find = (dict, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
test('every t(\'…\') key in the code exists in every language', () => {
  const keys = new Set();
  for (const f of jsFiles(JS).filter((f) => !f.includes('i18n'))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
  }
  assert.ok(keys.size > 100, 'found only ' + keys.size + ' keys: is the scan broken?');
  for (const [code, dict] of Object.entries(ALL)) {
    const missing = [...keys].filter((k) => find(dict, k) === undefined && !k.endsWith('.')); // 'x.' + id: next test
    assert.ok(!missing.length, code + ' is missing ' + missing.join(', '));
  }
});
test('keys built at runtime (themes, colors, patterns) exist too', () => {
  for (const [code, dict] of Object.entries(ALL)) {
    for (const id of Object.keys(THEMES)) {
      assert.ok(find(dict, 'settings.themes.' + id) && find(dict, 'settings.themesKawaii.' + id), code + ' theme ' + id);
    }
    COLOR_KEYS.forEach((k) => assert.ok(find(dict, 'settings.colorNames.' + k), code + ' color ' + k));
    DECOS.forEach((k) => assert.ok(find(dict, 'settings.decos.' + k), code + ' pattern ' + k));
    for (const sub of ['polls', 'calendar', 'songs', 'setlists']) assert.ok(find(dict, 'band.home.' + sub) && find(dict, 'nav.' + sub), code + ' ' + sub);
  }
});
test('every language has every English text, with the same {placeholders}', () => {
  const leaves = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? leaves(v, pre + k + '.') : [[pre + k, v]]));
  const holes = (v) => (typeof v === 'string' ? [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join() : null);
  for (const [code, dict] of Object.entries(ALL)) {
    for (const [key, v] of leaves(ALL.en)) {
      const mine = find(dict, key);
      assert.ok(mine !== undefined, code + ' has no ' + key);
      if (typeof v === 'string' && typeof mine === 'string') assert.equal(holes(mine), holes(v), code + ' ' + key + ' placeholders');
      if (Array.isArray(v)) assert.equal(mine.length, v.length, code + ' ' + key + ' length');
    }
  }
});
test('Turkish: plurals, dates, and the phone language picks it', () => {
  setLang('tr');
  assert.equal(t('band.home.songCount', { n: 3 }), '3 şarkı');
  assert.equal(t('nav.needsVote', { n: 2 }), '2 anket oyunu bekliyor');
  assert.equal(dayLabel('2026-10-17'), 'Cmt 17 Eki');
  setLang('en');
  assert.equal(pickLang(null, ['tr-TR', 'en-US']), 'tr');
  assert.equal(pickLang('en', ['tr-TR']), 'en', 'a saved choice wins');
});
test('t() fills in values and plurals, and falls back to English', () => {
  setLang('en');
  assert.equal(t('band.you', { name: 'Ali' }), 'Ali (you)');
  assert.equal(t('band.home.songCount', { n: 1 }), '1 song');
  assert.equal(t('band.home.songCount', { n: 3 }), '3 songs');
  assert.equal(t('no.such.key'), 'no.such.key');
  assert.equal(pickLang(null, ['xx-YY', 'en-GB']), 'en');
  assert.equal(pickLang('en', []), 'en');
});

console.log('html');
test('templates escape what goes into them, but not nested templates', () => {
  const name = '<b onclick="x">Tom & "Jerry"</b>';
  assert.equal(String(html`<p title="${name}">${name}</p>`),
    '<p title="&lt;b onclick=&quot;x&quot;&gt;Tom &amp; &quot;Jerry&quot;&lt;/b&gt;">&lt;b onclick=&quot;x&quot;&gt;Tom &amp; &quot;Jerry&quot;&lt;/b&gt;</p>');
  assert.equal(String(html`<ul>${['a', 'b'].map((x) => html`<li>${x}</li>`)}</ul>`), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(String(html`<i>${null}${false}${0}</i>`), '<i>0</i>');
});

if (failed) { console.log(`\n${failed} unit test(s) failed`); process.exit(1); }
console.log('\nall unit tests passed');
