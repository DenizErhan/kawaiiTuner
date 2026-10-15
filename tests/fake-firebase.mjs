/* Stand-ins for the three Firebase SDK files, served to headless Chrome in
   place of the real ones (www.gstatic.com/firebasejs/…), so the browser test
   can go through the whole band flow offline without touching the real
   database. Only the calls js/band-store.js makes are covered. The data lives
   in localStorage, so it survives a reload, and the test can add a band
   "from another phone" by writing there. Security rules are not checked
   here. */

export const FAKE_STORE_KEY = '__fakeFirestore';

const app = `
export function initializeApp(options) { return { options }; }
`;

const auth = `
const KEY = '__fakeUid';
const saved = localStorage.getItem(KEY);
const auth = { currentUser: saved ? { uid: saved } : null, authStateReady: async () => {} };
export function getAuth() { return auth; }
export async function signInAnonymously(a) {
  const uid = 'u' + Math.random().toString(36).slice(2, 10);
  localStorage.setItem(KEY, uid);
  a.currentUser = { uid };
  return { user: a.currentUser };
}
`;

const firestore = `
const KEY = ${JSON.stringify(FAKE_STORE_KEY)};
const read = () => JSON.parse(localStorage.getItem(KEY) || '{}');
const listeners = new Set();
const TS = { serverTimestamp: true };
let n = 0;

export const initializeFirestore = () => ({ db: true });
export const persistentLocalCache = (o) => o;
export const persistentMultipleTabManager = () => ({});
export const serverTimestamp = () => TS;

export function collection(db, ...path) { return { col: true, path: path.join('/') }; }
export function doc(parent, ...path) {
  if (parent.col) {
    const id = path.length ? path[0] : 'id' + Date.now().toString(36) + (n++);
    return { path: parent.path + '/' + id, id };
  }
  return { path: path.join('/'), id: path[path.length - 1] };
}

const copy = (d) => JSON.parse(JSON.stringify(d));
const resolve = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === TS ? Date.now() : v]));
function docSnap(ref, store) {
  const d = store[ref.path];
  return { id: ref.id, exists: () => !!d, data: () => d && copy(d) };
}
function colSnap(ref, store) {
  const pre = ref.path + '/';
  const docs = Object.keys(store)
    .filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes('/'))
    .map((k) => ({ id: k.slice(pre.length), data: () => copy(store[k]) }));
  return { docs };
}

export async function getDoc(ref) { return docSnap(ref, read()); }
export function onSnapshot(ref, next) {
  const fire = () => { const s = read(); next(ref.col ? colSnap(ref, s) : docSnap(ref, s)); };
  listeners.add(fire);
  setTimeout(fire, 0);
  return () => listeners.delete(fire);
}

const ops = {
  set: (s, ref, d) => { s[ref.path] = resolve(d); },
  update: (s, ref, d) => {
    if (!s[ref.path]) throw Object.assign(new Error('No document to update'), { code: 'not-found' });
    Object.entries(resolve(d)).forEach(([k, v]) => { // "votes.uid" sets a field inside a map
      const keys = k.split('.');
      let o = s[ref.path];
      keys.slice(0, -1).forEach((p) => { o = o[p] = o[p] || {}; });
      o[keys[keys.length - 1]] = v;
    });
  },
  delete: (s, ref) => { delete s[ref.path]; },
};
function apply(steps) {
  const s = read();
  steps.forEach(([op, ref, d]) => ops[op](s, ref, d));
  localStorage.setItem(KEY, JSON.stringify(s));
  listeners.forEach((l) => l());
}
export async function setDoc(ref, d) { apply([['set', ref, d]]); }
export async function updateDoc(ref, d) { apply([['update', ref, d]]); }
export async function deleteDoc(ref) { apply([['delete', ref]]); }
export function writeBatch() {
  const steps = [];
  const b = {
    set: (r, d) => { steps.push(['set', r, d]); return b; },
    update: (r, d) => { steps.push(['update', r, d]); return b; },
    delete: (r) => { steps.push(['delete', r]); return b; },
    commit: async () => apply(steps),
  };
  return b;
}
`;

/** file name (firebase-app.js, …) -> module source */
export const FAKE_SDK = { 'firebase-app.js': app, 'firebase-auth.js': auth, 'firebase-firestore.js': firestore };
