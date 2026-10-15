/* Frequency -> note name, octave and cents. Pure, no DOM. */

export const NOTE_NAMES = {
  en:  ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'],
  sol: ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'],
};

export function noteFromFreq(f, a4) {
  const midiF = 69 + 12 * Math.log2(f / a4);
  const m = Math.round(midiF);
  return {
    cents: (midiF - m) * 100,
    idx: ((m % 12) + 12) % 12,
    oct: Math.floor(m / 12) - 1,
    target: a4 * Math.pow(2, (m - 69) / 12),
  };
}
