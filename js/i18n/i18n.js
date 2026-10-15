/* Translations. Every text the user sees comes from a language file in this
   folder through t('area.key'), so adding a language is adding a file.
   No DOM here, so the Node unit tests use it too. */
import en from './en.js';
import tr from './tr.js';

const LANGS = { en, tr };
let lang = 'en';

/** [{ code, name }] for the language picker, each name in its own language. */
export const LANGUAGES = Object.entries(LANGS).map(([code, d]) => ({ code, name: d.langName }));

/** The saved choice if there is one, else the phone's language if we have it, else English. */
export function pickLang(saved, wanted = (typeof navigator !== 'undefined' && navigator.languages) || []) {
  if (LANGS[saved]) return saved;
  return [].concat(wanted).map((l) => String(l).slice(0, 2).toLowerCase()).find((l) => LANGS[l]) || 'en';
}
export function setLang(code) { lang = LANGS[code] ? code : 'en'; }
export const getLang = () => lang;

const find = (dict, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);

/** t('band.songs') -> the text. {name} placeholders are filled from params;
    entries that are functions get params (for plurals); arrays come back as is. */
export function t(key, params = {}) {
  let v = find(LANGS[lang], key);
  if (v === undefined) v = find(en, key); // a missing translation shows English, not a key
  if (v === undefined) return key;
  if (typeof v === 'function') return v(params);
  if (typeof v !== 'string') return v;
  return v.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
}

/** For the unit tests: every language file, by code. */
export const ALL = LANGS;
