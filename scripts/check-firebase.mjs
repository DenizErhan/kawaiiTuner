/* Live check against the real Firebase project (needs internet; not part of
   `npm test`): `npm run check:firebase`.
   1. Security rules: two anonymous users, one in a band and one outside it,
      try things that must work and things that must be refused.
   2. The real app in headless Chrome: phone A starts a band and adds a song,
      phone B joins with the code and sees it.
   Each run leaves one small test band ("Rules check …") behind, since the
   rules don't let anyone delete bands. */
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';

const PORT = 8798;
const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));

const server = await serve(PORT);
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new' });
let failed = 0;
const report = (ok, name, extra) => { if (!ok) failed++; console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra ? '\n       ' + extra : '')); };

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0' });

  console.log('security rules');
  const results = await page.evaluate(async () => {
    const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
    const { initializeApp } = await import(SDK + 'firebase-app.js');
    const A = await import(SDK + 'firebase-auth.js');
    const F = await import(SDK + 'firebase-firestore.js');
    const cfg = { apiKey: 'AIzaSyAi5wGrYsaiNZQz_AgHp_HbU8Ba6n1jQtI', authDomain: 'kawaii-tuner.firebaseapp.com', projectId: 'kawaii-tuner', appId: '1:465726393732:web:434da10b01d877507621d1' };
    const user = async (name) => {
      const app = initializeApp(cfg, name);
      const auth = A.initializeAuth(app, { persistence: A.inMemoryPersistence });
      await A.signInAnonymously(auth);
      return { db: F.getFirestore(app), uid: auth.currentUser.uid };
    };
    const out = [];
    const expect = async (name, allowed, fn) => {
      try { await fn(); out.push([name, allowed, allowed ? '' : 'was allowed']); }
      catch (e) { out.push([name, !allowed, allowed ? (e.code || e.message) : '']); }
    };
    let a, b;
    try { a = await user('a'); b = await user('b'); }
    catch (e) { return [['anonymous sign-in', false, e.code || e.message]]; }
    const code = 'CHEK-' + String(Date.now()).slice(-4);
    const band = (u, c = code) => F.doc(u.db, 'bands', c);
    const member = (u, uid, c = code) => F.doc(u.db, 'bands', c, 'members', uid);
    const songs = (u) => F.collection(u.db, 'bands', code, 'songs');
    const song = (extra = {}) => ({ title: 'Check', artist: '', key: '', bpm: 100, beats: 4, notes: '', ...extra });
    const ts = F.serverTimestamp;

    await expect('start a band (band + yourself in one batch)', true, () => {
      const w = F.writeBatch(a.db);
      w.set(band(a), { name: 'Rules check ' + new Date().toISOString().slice(0, 10), createdBy: a.uid, createdAt: ts() });
      w.set(member(a, a.uid), { name: 'Checker A', joinedAt: ts() });
      return w.commit();
    });
    await expect('a band code must look like ABCD-2345', false, () =>
      F.setDoc(band(a, 'bad'), { name: 'x', createdBy: a.uid, createdAt: ts() }));
    await expect('outsider can look up the band by code', true, () => F.getDoc(band(b)));
    await expect('outsider cannot list all bands', false, () => F.getDocs(F.collection(b.db, 'bands')));
    await expect('outsider cannot read songs', false, () => F.getDocs(songs(b)));
    await expect('outsider cannot add a song', false, () => F.setDoc(F.doc(songs(b)), { ...song(), addedBy: b.uid, createdAt: ts() }));
    await expect('outsider cannot add someone else as member', false, () => F.setDoc(member(b, a.uid), { name: 'Hijack', joinedAt: ts() }));
    await expect('outsider cannot rename the band', false, () => F.updateDoc(band(b), { name: 'Hacked' }));
    let songId;
    await expect('member adds a song', true, async () => { const r = F.doc(songs(a)); songId = r.id; await F.setDoc(r, { ...song(), addedBy: a.uid, createdAt: ts() }); });
    await expect('BPM over 250 is refused', false, () => F.setDoc(F.doc(songs(a)), { ...song({ bpm: 999 }), addedBy: a.uid, createdAt: ts() }));
    await expect('unknown fields are refused', false, () => F.setDoc(F.doc(songs(a)), { ...song({ evil: 1 }), addedBy: a.uid, createdAt: ts() }));
    await expect('a song without a title is refused', false, () => F.setDoc(F.doc(songs(a)), { ...song({ title: '' }), addedBy: a.uid, createdAt: ts() }));
    await expect('joining with the code works', true, () => F.setDoc(member(b, b.uid), { name: 'Checker B', joinedAt: ts() }));
    await expect('new member reads songs', true, async () => { if ((await F.getDocs(songs(b))).size !== 1) throw new Error('expected 1 song'); });
    await expect('member edits a song', true, () => F.updateDoc(F.doc(songs(b), songId), { bpm: 120 }));
    await expect('member cannot change who added a song', false, () => F.updateDoc(F.doc(songs(b), songId), { addedBy: b.uid }));
    await expect('member makes a setlist', true, () => F.setDoc(F.doc(F.collection(b.db, 'bands', code, 'setlists')), { name: 'Gig', songIds: [songId], createdAt: ts() }));
    await expect('member renames the band', true, () => F.updateDoc(band(b), { name: 'Rules check (renamed) ' + new Date().toISOString().slice(0, 10) }));

    const today = new Date().toISOString().slice(0, 10);
    const free = (u, uid = u.uid) => F.doc(u.db, 'bands', code, 'free', today + '_' + uid);
    await expect('member adds free time', true, () => F.setDoc(free(b), { uid: b.uid, date: today, times: [1080, 1260] }));
    await expect('member cannot add free time for someone else', false, () => F.setDoc(free(b, a.uid), { uid: a.uid, date: today, times: [1080, 1260] }));
    await expect('free times must come in pairs', false, () => F.setDoc(free(b), { uid: b.uid, date: today, times: [1080] }));
    await expect('outsider cannot read free times', false, async () => {
      const c = await user('c');
      await F.getDocs(F.collection(c.db, 'bands', code, 'free'));
    });
    await expect("member cannot remove someone else's free time", false, () => F.deleteDoc(free(a, b.uid)));
    await expect('member removes their free time', true, () => F.deleteDoc(free(b)));

    let pollId;
    const poll = (u) => F.doc(u.db, 'bands', code, 'polls', pollId);
    await expect('member asks a poll', true, async () => {
      const r = F.doc(F.collection(a.db, 'bands', code, 'polls'));
      pollId = r.id;
      await F.setDoc(r, { question: 'Check?', options: ['Yes', 'No'], multi: false, createdBy: a.uid, createdAt: ts(), closed: false, winner: null, votes: {} });
    });
    await expect('a poll needs 2 options', false, () => F.setDoc(F.doc(F.collection(a.db, 'bands', code, 'polls')),
      { question: 'Check?', options: ['Yes'], multi: false, createdBy: a.uid, createdAt: ts(), closed: false, winner: null, votes: {} }));
    await expect('member votes', true, () => F.updateDoc(poll(b), { ['votes.' + b.uid]: [0] }));
    await expect('two picks on a pick-one poll are refused', false, () => F.updateDoc(poll(b), { ['votes.' + b.uid]: [0, 1] }));
    await expect('member cannot vote for someone else', false, () => F.updateDoc(poll(b), { ['votes.' + a.uid]: [1] }));
    await expect('only whoever asked can close a poll', false, () => F.updateDoc(poll(b), { closed: true, winner: 0 }));
    await expect('whoever asked closes the poll', true, () => F.updateDoc(poll(a), { closed: true, winner: 0 }));
    await expect('no voting on a closed poll', false, () => F.updateDoc(poll(b), { ['votes.' + b.uid]: [1] }));
    await expect('only whoever asked can delete a poll', false, () => F.deleteDoc(poll(b)));
    await expect('whoever asked deletes the poll', true, () => F.deleteDoc(poll(a)));
    await expect('member cannot remove another member', false, () => F.deleteDoc(member(b, a.uid)));
    await expect('leaving the band works', true, () => F.deleteDoc(member(b, b.uid)));
    await expect('after leaving, songs are private again', false, () => F.getDocs(songs(b)));
    await expect('clean up', true, async () => { await F.deleteDoc(F.doc(songs(a), songId)); });
    return out;
  });
  results.forEach(([name, ok, why]) => report(ok, name, why));

  console.log('the app, two phones');
  const problems = [];
  const phone = async () => {
    const ctx = await browser.createIncognitoBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: false });
    p.on('pageerror', (e) => problems.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
    await p.goto(`http://127.0.0.1:${PORT}/#/band`, { waitUntil: 'networkidle0' });
    return p;
  };
  const home = (p) => p.waitForFunction(() => !document.getElementById('bandHome').hidden, { timeout: 15000 });
  const open = (p, hash) => p.evaluate((h) => { location.hash = h; }, hash);
  let step = '';
  const click = async (p, sel) => { step = sel; await p.waitForSelector(sel, { visible: true, timeout: 15000 }); await p.click(sel); };
  try {
    const pa = await phone();
    await pa.type('#meName', 'Phone A');
    await pa.type('#bandName', 'Rules check (app)');
    await click(pa, '#formCreate .go');
    await home(pa);
    await click(pa, '#btnBandMenu');
    const code = await pa.$eval('#bandCode', (e) => e.textContent);
    await pa.keyboard.press('Escape'); // closes the menu (Done is tapped in the phone tests)
    await open(pa, '#/band/songs');
    await click(pa, '#btnAddSong');
    await pa.type('#songForm [name="title"]', 'Live check song');
    await pa.type('#songForm [name="bpm"]', '99');
    await click(pa, '#songForm .go');
    await pa.waitForFunction(() => document.getElementById('songList').textContent.includes('Live check song'));
    report(true, 'phone A starts a band (' + code + ') and adds a song');

    const pb = await phone();
    await pb.type('#meName', 'Phone B');
    await pb.type('#joinCode', code);
    await click(pb, '#formJoin .go');
    await home(pb);
    await open(pb, '#/band/songs');
    await pb.waitForFunction(() => document.getElementById('songList').textContent.includes('Live check song'), { timeout: 15000 });
    report(true, 'phone B joins with the code and sees the song');
    await open(pa, '#/band');
    await pa.waitForFunction(() => document.getElementById('bandMembers').textContent.includes('Phone B'), { timeout: 15000 });
    report(true, 'phone A sees phone B join, live');
  } catch (e) {
    report(false, 'app flow', step + ': ' + e.message);
  }
  report(problems.length === 0, 'no errors in the app', problems.join('\n       '));
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nFirebase is set up correctly');
