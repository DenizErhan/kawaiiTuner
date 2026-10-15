/* Everything that talks to Firebase. The SDK loads from Google's CDN the first
   time the Band tab opens, so the tuner and metronome never wait for it.
   Sign-in is anonymous: each phone gets its own hidden account, and being
   listed in a band's members is what lets it read and write that band
   (see firestore.rules). The local cache keeps songs and setlists readable
   offline, and changes made offline are sent when the phone is back online. */
import { makeCode } from './band.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
// Public by design: the security rules decide who can read or change what.
const CONFIG = {
  apiKey: 'AIzaSyAi5wGrYsaiNZQz_AgHp_HbU8Ba6n1jQtI',
  authDomain: 'kawaii-tuner.firebaseapp.com',
  projectId: 'kawaii-tuner',
  storageBucket: 'kawaii-tuner.firebasestorage.app',
  messagingSenderId: '465726393732',
  appId: '1:465726393732:web:434da10b01d877507621d1',
};

/** A message that's fine to show the user as is. */
export class BandError extends Error {}

/** Turns Firebase error codes into something a bandmate can act on. */
export function friendlyError(e) {
  if (e instanceof BandError) return e.message;
  const code = (e && e.code) || '';
  if (/unavailable|offline|network/.test(code + (e && e.message))) return "Can't reach the band server. Check your internet and try again.";
  if (/permission-denied/.test(code)) return "That wasn't allowed. Are you still in this band?";
  if (/admin-restricted|operation-not-allowed/.test(code)) return 'Band sign-in is switched off in Firebase (Authentication > Anonymous).';
  return 'Something went wrong' + (code ? ' (' + code + ')' : '') + '. Try again.';
}

let ready = null;
/** Loads the SDK and signs in once; later calls get the same api. */
export function connect() {
  if (!ready) ready = open().catch((e) => { ready = null; throw e; });
  return ready;
}

async function open() {
  const [{ initializeApp }, A, F] = await Promise.all(
    ['app', 'auth', 'firestore'].map((m) => import(SDK + 'firebase-' + m + '.js')),
  );
  const app = initializeApp(CONFIG);
  const auth = A.getAuth(app);
  await auth.authStateReady(); // the same phone keeps the same account
  if (!auth.currentUser) await A.signInAnonymously(auth);
  const db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  return createApi(F, db, auth.currentUser.uid);
}

function createApi(F, db, uid) {
  const bandRef = (code) => F.doc(db, 'bands', code);
  const col = (code, name) => F.collection(db, 'bands', code, name);
  const memberRef = (code) => F.doc(db, 'bands', code, 'members', uid);
  const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return {
    uid,

    /** Makes a band with a free code, with you as its first member. Resolves to the code. */
    async createBand(name, me) {
      for (let i = 0; i < 5; i++) {
        const code = makeCode();
        if ((await F.getDoc(bandRef(code))).exists()) continue;
        const b = F.writeBatch(db);
        b.set(bandRef(code), { name, createdBy: uid, createdAt: F.serverTimestamp() });
        b.set(memberRef(code), { name: me, joinedAt: F.serverTimestamp() });
        await b.commit();
        return code;
      }
      throw new BandError("Couldn't find a free band code. Try again.");
    },

    async joinBand(code, me) {
      if (!(await F.getDoc(bandRef(code))).exists()) throw new BandError('No band has that code. Check it with your bandmate.');
      await F.setDoc(memberRef(code), { name: me, joinedAt: F.serverTimestamp() });
    },

    leaveBand: (code) => F.deleteDoc(memberRef(code)),
    /** Changes how you're listed in this band. */
    renameMe: (code, name) => F.updateDoc(memberRef(code), { name }),
    renameBand: (code, name) => F.updateDoc(bandRef(code), { name }),

    /** Live updates of one band. on: { band(data|null), members(rows), songs(rows), setlists(rows),
        free(rows), polls(rows), error(e, what) } where what is 'band' or the collection.
        Returns a function that stops listening. */
    watch(code, on) {
      const offs = [
        F.onSnapshot(bandRef(code), (s) => on.band(s.exists() ? s.data() : null), (e) => on.error(e, 'band')),
        ...['members', 'songs', 'setlists', 'free', 'polls'].map((name) => F.onSnapshot(col(code, name), (s) => on[name](rows(s)), (e) => on.error(e, name))),
      ];
      return () => offs.forEach((off) => off());
    },

    // Writes below resolve when the server has them; the local cache (and so
    // the screen) updates right away, even offline.
    saveSong(code, id, song) {
      if (id) return F.updateDoc(F.doc(col(code, 'songs'), id), song);
      return F.setDoc(F.doc(col(code, 'songs')), { ...song, addedBy: uid, createdAt: F.serverTimestamp() });
    },
    /** Deletes the song and takes it out of every setlist that has it. */
    deleteSong(code, id, setlists) {
      const b = F.writeBatch(db);
      b.delete(F.doc(col(code, 'songs'), id));
      setlists.filter((l) => l.songIds.includes(id)).forEach((l) => {
        b.update(F.doc(col(code, 'setlists'), l.id), { songIds: l.songIds.filter((s) => s !== id) });
      });
      return b.commit();
    },
    /** Creates an empty setlist; its id is known right away, before the server answers. */
    newSetlist(code, name) {
      const ref = F.doc(col(code, 'setlists'));
      return { id: ref.id, done: F.setDoc(ref, { name, songIds: [], createdAt: F.serverTimestamp() }) };
    },
    updateSetlist: (code, id, fields) => F.updateDoc(F.doc(col(code, 'setlists'), id), fields),
    deleteSetlist: (code, id) => F.deleteDoc(F.doc(col(code, 'setlists'), id)),

    /** Your free times on one day (date "2026-10-18", times [start, end, …] in
        minutes). Empty times removes the day; only do that if you had one. */
    setFree(code, date, times) {
      const ref = F.doc(col(code, 'free'), date + '_' + uid);
      return times.length ? F.setDoc(ref, { uid, date, times }) : F.deleteDoc(ref);
    },
    /** Removes your free times on days that have passed. */
    dropFree(code, dates) {
      const b = F.writeBatch(db);
      dates.forEach((d) => b.delete(F.doc(col(code, 'free'), d + '_' + uid)));
      return b.commit();
    },
    newPoll: (code, poll) => F.setDoc(F.doc(col(code, 'polls')),
      { ...poll, createdBy: uid, createdAt: F.serverTimestamp(), closed: false, winner: null, votes: {} }),
    /** picks: option indexes; [] takes your vote back. */
    vote: (code, id, picks) => F.updateDoc(F.doc(col(code, 'polls'), id), { ['votes.' + uid]: picks }),
    closePoll: (code, id, winner) => F.updateDoc(F.doc(col(code, 'polls'), id), { closed: true, winner }),
    deletePoll: (code, id) => F.deleteDoc(F.doc(col(code, 'polls'), id)),
  };
}
