/* Band helpers with no DOM or Firebase: join codes, input cleanup, list moves.
   Pure, so the unit tests import them straight into Node. The limits match
   the Firestore security rules in firestore.rules. */
import { BPM_MIN, BPM_MAX, BEATS_MIN, BEATS_MAX } from './settings.js';

// no 0/O, 1/I/L: codes get read out loud and typed on phones
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LIMITS = { band: 40, member: 30, title: 80, artist: 80, key: 12, notes: 300, setlist: 60, setlistSongs: 200 };

function cryptoRandom(n) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}

/** A fresh band code like "K7MP-Q3XA" (31^8, about 850 billion possibilities). */
export function makeCode(rand = cryptoRandom) {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[rand(CODE_ALPHABET.length)];
  return s.slice(0, 4) + '-' + s.slice(4);
}

/** What the user typed (any case, spaces, with or without the dash) -> "ABCD-2345", or null. */
export function normalizeCode(input) {
  const s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4) : null;
}

/** Trim, squeeze inner spaces, cut to max length. */
export function cleanText(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

function optInt(v, lo, hi) {
  if (v === '' || v == null) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
}

/** Form values -> a song the rules accept, or null when there's no title. */
export function cleanSong(f) {
  const title = cleanText(f.title, LIMITS.title);
  if (!title) return null;
  return {
    title,
    artist: cleanText(f.artist, LIMITS.artist),
    key: cleanText(f.key, LIMITS.key),
    bpm: optInt(f.bpm, BPM_MIN, BPM_MAX),
    beats: optInt(f.beats, BEATS_MIN, BEATS_MAX),
    notes: String(f.notes == null ? '' : f.notes).trim().slice(0, LIMITS.notes),
  };
}

/** "Artist · Key · 120 BPM" with the empty parts left out. */
export function songMeta(s) {
  return [s.artist, s.key, s.bpm ? s.bpm + ' BPM' : '', s.beats && s.beats !== 4 ? s.beats + '/4' : ''].filter(Boolean).join(' · ');
}

/** A copy of list with item `from` moved to index `to`. */
export function moveItem(list, from, to) {
  const out = list.slice();
  if (to < 0 || to >= out.length || from === to) return out;
  out.splice(to, 0, out.splice(from, 1)[0]);
  return out;
}

export const byName = (key) => (a, b) => a[key].localeCompare(b[key], undefined, { sensitivity: 'base' });
