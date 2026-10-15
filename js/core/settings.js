/* Themes and user settings, persisted in localStorage. Names shown to the
   user (themes, colors, patterns) are in the language files under js/i18n. */
import { cleanCustom } from './tunings.js';

export const THEMES = {
  midnight:   { deco: 'stars',   bg: '#141128', surface: '#211c3d', text: '#f6f0ff', accent: '#ff8fc8', good: '#7cf5c4', cat: '#f6f0ff' },
  strawberry: { deco: 'hearts',  bg: '#ffeef4', surface: '#ffffff', text: '#4a2b3a', accent: '#ff5c9a', good: '#22a866', cat: '#4a2b3a' },
  matcha:     { deco: 'paws',    bg: '#eef3e0', surface: '#fbfdf4', text: '#2f3b24', accent: '#e9779c', good: '#3f9e3a', cat: '#7a5a43' },
  sakura:     { deco: 'petals',  bg: '#1d1420', surface: '#2c1e30', text: '#ffeef5', accent: '#ffb3cf', good: '#9ff0b5', cat: '#ffd9e7' },
  boba:       { deco: 'bubbles', bg: '#f6e7d4', surface: '#fff8ee', text: '#4b3426', accent: '#c06a2b', good: '#2f9e62', cat: '#4b3426' },
  sea:        { deco: 'fish',    bg: '#0d1f2b', surface: '#15303f', text: '#e8fbff', accent: '#7fd6ff', good: '#8ff0c0', cat: '#e8fbff' },
};
export const COLOR_KEYS = ['bg', 'surface', 'text', 'accent', 'good', 'cat'];
export const DECOS = ['paws', 'hearts', 'stars', 'petals', 'bubbles', 'fish'];
export const A4_MIN = 400, A4_MAX = 480, A4_DEFAULT = 440;
export const BPM_MIN = 30, BPM_MAX = 250, BPM_DEFAULT = 100;
export const BEATS_MIN = 1, BEATS_MAX = 12;
const DEFAULT_THEME = 'midnight';
export const MODES = ['tuner', 'metronome', 'band'];

const KEY = 'tuner.settings.v1';
const HEX = /^#[0-9a-f]{6}$/i;

function pickTheme(t) { const o = { deco: t.deco }; COLOR_KEYS.forEach((k) => { o[k] = t[k]; }); return o; }
function defaults() {
  return { theme: DEFAULT_THEME, custom: pickTheme(THEMES[DEFAULT_THEME]), a4: A4_DEFAULT, notation: 'en', mode: 'tuner', bpm: BPM_DEFAULT, beats: 4, kawaii: true, me: '', band: null, lang: null, tuning: 'chromatic', customTunings: [] };
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clampA4 = (v) => clamp(v, A4_MIN, A4_MAX);
const isDeco = (v) => DECOS.includes(v);

function load() {
  const s = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      if (raw.theme === 'custom' || THEMES[raw.theme]) s.theme = raw.theme;
      if (raw.custom) {
        COLOR_KEYS.forEach((k) => { if (HEX.test(raw.custom[k])) s.custom[k] = raw.custom[k]; });
        if (isDeco(raw.custom.deco)) s.custom.deco = raw.custom.deco;
      }
      if (Number.isFinite(raw.a4)) s.a4 = clampA4(Math.round(raw.a4));
      if (raw.notation === 'en' || raw.notation === 'sol') s.notation = raw.notation;
      if (raw.mode === 'metro') s.mode = 'metronome'; // saved before the menu redesign
      else if (MODES.includes(raw.mode)) s.mode = raw.mode;
      if (typeof raw.kawaii === 'boolean') s.kawaii = raw.kawaii;
      if (Number.isFinite(raw.bpm)) s.bpm = clamp(Math.round(raw.bpm), BPM_MIN, BPM_MAX);
      if (Number.isFinite(raw.beats)) s.beats = clamp(Math.round(raw.beats), BEATS_MIN, BEATS_MAX);
      if (typeof raw.me === 'string') s.me = raw.me;
      if (raw.band && typeof raw.band.code === 'string') s.band = { code: raw.band.code };
      if (typeof raw.lang === 'string') s.lang = raw.lang;
      if (typeof raw.tuning === 'string' && /^[\w.]{1,40}$/.test(raw.tuning)) s.tuning = raw.tuning;
      s.customTunings = cleanCustom(raw.customTunings);
    }
  } catch (e) { /* storage unavailable or corrupt: use defaults */ }
  return s;
}

/** The live settings object. Mutate through the helpers below so changes get saved. */
export const settings = load();

export function save() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } }
// Reset the look and tuner settings; keep the open screen, the metronome tempo, the band, the language and tunings.
export function reset() {
  const { mode, bpm, beats, me, band, lang, tuning, customTunings } = settings;
  Object.assign(settings, defaults(), { mode, bpm, beats, me, band, lang, tuning, customTunings });
  save();
}

/** Colors + pattern of the active theme. */
export function currentTheme() { return settings.theme === 'custom' ? settings.custom : THEMES[settings.theme]; }

export function setTheme(id) { settings.theme = id; save(); }

// Editing a color or pattern switches to Custom, starting from the theme being edited.
function editCustom() {
  if (settings.theme !== 'custom') {
    settings.custom = pickTheme(currentTheme());
    settings.theme = 'custom';
  }
}
export function setCustomColor(key, value) { editCustom(); settings.custom[key] = value; save(); }
export function setDeco(id) { editCustom(); settings.custom.deco = id; save(); }

export function setA4(v) { settings.a4 = clampA4(v); save(); }
export function setNotation(v) { settings.notation = v; save(); }
export function setMode(v) { settings.mode = v; save(); }
export function setKawaii(on) { settings.kawaii = !!on; save(); }
export function setBpm(v) { settings.bpm = clamp(Math.round(v), BPM_MIN, BPM_MAX); save(); }
export function setBeats(v) { settings.beats = clamp(v, BEATS_MIN, BEATS_MAX); save(); }
/** Your display name in bands, and the band this phone is in ({ code } or null). */
export function setMe(v) { settings.me = v; save(); }
export function setBand(code) { settings.band = code ? { code } : null; save(); }
export function setLangSetting(code) { settings.lang = code; save(); }
export function setTuning(id) { settings.tuning = id; save(); }
/** Adds or replaces one of your own tunings ({ id, name, strings }). */
export function saveCustomTuning(t) {
  const i = settings.customTunings.findIndex((x) => x.id === t.id);
  if (i >= 0) settings.customTunings[i] = t; else settings.customTunings.push(t);
  save();
}
export function deleteCustomTuning(id) {
  settings.customTunings = settings.customTunings.filter((x) => x.id !== id);
  if (settings.tuning === 'custom.' + id) settings.tuning = 'chromatic';
  save();
}
