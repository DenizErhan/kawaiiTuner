/* Tunings: which note each string should be, and which string you're playing.
   Strings are MIDI note numbers (E2 = 40, A4 = 69), lowest string first, the
   way they're drawn on screen. Pure, no DOM. Names shown to the user live in
   the language files (tuner.tunings.<id>). */

const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "E2" -> 40, "F#3" -> 54, "Bb3" -> 58. */
export function midi(note) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) throw new Error('bad note ' + note);
  return LETTERS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (Number(m[3]) + 1);
}
const strings = (s) => s.split(' ').map(midi);

/** id -> { instrument, strings, flats? } (flats: name the notes E♭, not D♯). */
export const TUNINGS = {
  'guitar.standard': { instrument: 'guitar', strings: strings('E2 A2 D3 G3 B3 E4') },
  'guitar.dropD':    { instrument: 'guitar', strings: strings('D2 A2 D3 G3 B3 E4') },
  'guitar.halfDown': { instrument: 'guitar', strings: strings('Eb2 Ab2 Db3 Gb3 Bb3 Eb4'), flats: true },
  'guitar.fullDown': { instrument: 'guitar', strings: strings('D2 G2 C3 F3 A3 D4') },
  'guitar.dropC':    { instrument: 'guitar', strings: strings('C2 G2 C3 F3 A3 D4') },
  'guitar.openG':    { instrument: 'guitar', strings: strings('D2 G2 D3 G3 B3 D4') },
  'guitar.openD':    { instrument: 'guitar', strings: strings('D2 A2 D3 F#3 A3 D4') },
  'guitar.dadgad':   { instrument: 'guitar', strings: strings('D2 A2 D3 G3 A3 D4') },
  'bass.standard':   { instrument: 'bass', strings: strings('E1 A1 D2 G2') },
  'bass.dropD':      { instrument: 'bass', strings: strings('D1 A1 D2 G2') },
  'bass.five':       { instrument: 'bass', strings: strings('B0 E1 A1 D2 G2') },
  'ukulele.standard': { instrument: 'ukulele', strings: strings('G4 C4 E4 A4') },
  'ukulele.lowG':    { instrument: 'ukulele', strings: strings('G3 C4 E4 A4') },
  'violin.standard': { instrument: 'violin', strings: strings('G3 D4 A4 E5') },
  'mandolin.standard': { instrument: 'mandolin', strings: strings('G3 D4 A4 E5') },
  'banjo.openG':     { instrument: 'banjo', strings: strings('G4 D3 G3 B3 D4') },
};
export const INSTRUMENTS = ['guitar', 'bass', 'ukulele', 'violin', 'mandolin', 'banjo'];
export const CHROMATIC = 'chromatic';
export const CUSTOM_LIMITS = { name: 30, minStrings: 1, maxStrings: 8, low: midi('A0'), high: midi('C7') };

const SHARP = { en: ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'], sol: ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'] };
const FLAT = { en: ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'], sol: ['Do', 'Re♭', 'Re', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'] };

/** 40 -> { name: "E", oct: 2 } in C D E or Do Re Mi, sharps or flats. */
export function noteName(m, notation = 'en', flats = false) {
  return { name: (flats ? FLAT : SHARP)[notation][((m % 12) + 12) % 12], oct: Math.floor(m / 12) - 1 };
}

/** The frequency of a MIDI note at the given A4. */
export const freqOf = (m, a4) => a4 * Math.pow(2, (m - 69) / 12);

/** How far freq is from note m, in cents (negative = flat). */
export const centsFrom = (freq, m, a4) => 1200 * Math.log2(freq / freqOf(m, a4));

/** The string you're most likely playing: the one closest in pitch.
    Returns { index, cents } (cents from that string's note). */
export function nearestString(freq, list, a4) {
  let best = null;
  list.forEach((m, index) => {
    const cents = centsFrom(freq, m, a4);
    if (!best || Math.abs(cents) < Math.abs(best.cents)) best = { index, cents };
  });
  return best;
}

/** A tuning by id, including the phone's own ("custom.<id>"); null for chromatic or unknown. */
export function findTuning(id, custom = []) {
  if (TUNINGS[id]) return { id, ...TUNINGS[id] };
  const c = id && id.startsWith('custom.') && custom.find((x) => 'custom.' + x.id === id);
  return c ? { id, instrument: 'custom', name: c.name, strings: c.strings } : null;
}

/** Saved custom tunings, with anything broken dropped (they come from localStorage). */
export function cleanCustom(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((c) => c && typeof c.id === 'string' && /^\w{1,20}$/.test(c.id)
    && typeof c.name === 'string' && c.name.trim()
    && Array.isArray(c.strings) && c.strings.length >= CUSTOM_LIMITS.minStrings && c.strings.length <= CUSTOM_LIMITS.maxStrings
    && c.strings.every((m) => Number.isInteger(m) && m >= CUSTOM_LIMITS.low && m <= CUSTOM_LIMITS.high))
    .map((c) => ({ id: c.id, name: c.name.trim().slice(0, CUSTOM_LIMITS.name), strings: c.strings.slice() }))
    .slice(0, 20);
}
