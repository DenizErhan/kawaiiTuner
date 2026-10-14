/* Unit tests for the pure modules (no browser needed): `npm run test:unit`. */
import assert from 'node:assert/strict';
import { yin } from '../js/yin.js';
import { noteFromFreq, NOTE_NAMES } from '../js/notes.js';
import { createPitchTracker, median, rms } from '../js/pitch-tracker.js';
import { tempoName } from '../js/metronome.js';

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

if (failed) { console.log(`\n${failed} unit test(s) failed`); process.exit(1); }
console.log('\nall unit tests passed');
