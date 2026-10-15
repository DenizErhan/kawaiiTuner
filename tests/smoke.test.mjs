/* Browser smoke test: serves the app locally, opens it in headless Chrome as an
   Android phone (touch, fake microphone) and checks that every screen is styled
   and every control does something. Firebase is faked (tests/fake-firebase.mjs). `npm run test:browser`.
   Screenshots land in tests/screenshots/ for a quick look.
   Uses your installed Chrome/Edge; set CHROME_PATH to pick another. */
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { serve } from '../scripts/serve.mjs';
import { FAKE_SDK, FAKE_STORE_KEY } from './fake-firebase.mjs';

const PORT = 8799;
const URL_ = `http://127.0.0.1:${PORT}/`;
const SHOTS = fileURLToPath(new URL('./screenshots/', import.meta.url));
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const PHONES = {
  pixel: { width: 412, height: 915 },
  small: { width: 360, height: 640 },
  tiny: { width: 320, height: 568 },
  landscape: { width: 915, height: 412 },
};

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error('Chrome not found; set CHROME_PATH');
  return found;
}

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await serve(PORT);
const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: 'new',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
mkdirSync(SHOTS, { recursive: true });

const problems = []; // console errors, page errors, failed requests
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
page.on('pageerror', (e) => problems.push('page error: ' + e.message));
page.on('requestfailed', (r) => problems.push('request failed: ' + r.url()));
page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });

async function phone(name) {
  const { width, height } = PHONES[name];
  await page.emulate({ userAgent: ANDROID_UA, viewport: { width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: width > height } });
  await sleep(300);
}
const shot = (name) => page.screenshot({ path: SHOTS + name + '.png' });
const tap = async (sel) => {
  const el = await page.$(sel);
  expect(el, 'missing element ' + sel);
  await el.evaluate((e) => { // scroll to it like a thumb would, if it's off screen
    const r = e.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) e.scrollIntoView({ block: 'center' });
  });
  const box = await el.boundingBox();
  expect(box && box.width > 0, sel + ' is not visible');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
};
const text = (sel) => page.$eval(sel, (e) => e.textContent.trim());
const style = (sel, prop) => page.$eval(sel, (e, p) => getComputedStyle(e)[p], prop);
const noOverflow = async () => {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  expect(sw <= iw, `page scrolls sideways (${sw}px content in ${iw}px screen)`);
};
const inView = async (sel) => {
  const r = await page.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: innerHeight }; });
  expect(r.top >= 0 && r.bottom <= r.h + 1, `${sel} is off screen (bottom ${Math.round(r.bottom)} of ${r.h})`);
};

try {
  await phone('pixel');
  await page.goto(URL_, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });

  console.log('page');
  await test('loads without errors', () => expect(problems.length === 0, problems.join('\n       ')));
  await test('stylesheet is applied', async () => {
    expect((await style('.go', 'borderRadius')) !== '0px', '.go has no border radius: CSS missing?');
  });
  await test('version label is shown', async () => expect(/Version \d/.test(await text('#version')), 'no version text'));
  await test('service worker takes control', async () => {
    const ok = await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload({ waitUntil: 'networkidle0' });
    const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
    expect(ok && controlled, 'page is not controlled by sw.js');
    expect((await style('.go', 'borderRadius')) !== '0px', 'styles missing after reload through the service worker');
  });

  console.log('tuner');
  await test('fits a phone screen', async () => { await noOverflow(); await inView('#btnGo'); });
  await test('Start listens and detects the test tone', async () => {
    await tap('#btnGo');
    await page.waitForFunction(() => /^\d+(\.\d)?$/.test(document.getElementById('hzVal').textContent), { timeout: 6000 });
    expect((await text('#btnGoLabel')) === 'Stop', 'button did not change to Stop');
    await shot('tuner-running');
  });
  await test('Stop goes back to idle', async () => {
    await tap('#btnGo');
    await sleep(200);
    expect((await text('#btnGoLabel')) === 'Start', 'still says Stop');
    expect((await text('#hzVal')) === '—', 'frequency not cleared');
  });

  console.log('metronome');
  await test('tab switch shows the metronome', async () => {
    await tap('#tabMetro');
    await sleep(200);
    expect(await page.$eval('#viewMetro', (e) => !e.hidden), 'metronome view hidden');
    expect(await page.$eval('#viewTuner', (e) => e.hidden), 'tuner view still visible');
    await shot('metronome-idle');
  });
  await test('controls are styled (not plain browser buttons)', async () => {
    expect((await style('.round-btn', 'borderRadius')) === '50%', '+/- buttons are not round');
    expect((await style('#btnTap', 'borderRadius')) !== '0px', 'tap button unstyled');
    expect((await page.$$('#beatDots i')).length === 4, 'beat dots missing');
    expect((await page.$$('#maneki *')).length > 20, 'lucky cat not drawn');
  });
  await test('fits a phone screen', async () => { await noOverflow(); await inView('#btnMetro'); });
  await test('+ and − change the tempo', async () => {
    const start = Number(await text('#bpmVal'));
    await tap('#bpmPlus'); await tap('#bpmPlus');
    await tap('#bpmMinus');
    expect(Number(await text('#bpmVal')) === start + 1, `expected ${start + 1}, got ${await text('#bpmVal')}`);
  });
  await test('slider sets the tempo and its name', async () => {
    await page.$eval('#bpmSlider', (s) => { s.value = 120; s.dispatchEvent(new Event('input', { bubbles: true })); });
    expect((await text('#bpmVal')) === '120', 'bpm not 120');
    expect((await text('#tempoName')) === 'Allegro', 'tempo name not updated');
  });
  await test('beats − and + change the beat dots', async () => {
    await tap('#beatsMinus');
    expect((await page.$$('#beatDots i')).length === 3, 'expected 3 dots');
    await tap('#beatsPlus');
    expect((await page.$$('#beatDots i')).length === 4, 'expected 4 dots');
  });
  await test('Start plays steady beats at 120 BPM (one every 500 ms)', async () => {
    await page.evaluate(() => {
      window.__beats = [];
      new MutationObserver(() => {
        const on = [...document.querySelectorAll('#beatDots i')].findIndex((d) => d.classList.contains('on'));
        const last = window.__beats[window.__beats.length - 1];
        if (on >= 0 && (!last || last.b !== on)) window.__beats.push({ b: on, t: performance.now() });
      }).observe(document.getElementById('beatDots'), { subtree: true, attributes: true });
    });
    await tap('#btnMetro');
    await sleep(1100);
    await shot('metronome-running');
    await sleep(1900);
    const beats = await page.evaluate(() => window.__beats);
    expect(beats.length >= 5, `only ${beats.length} beats in 3 s`);
    expect(beats.map((b) => b.b).join('').startsWith('0123'), 'beats out of order: ' + beats.map((b) => b.b).join(','));
    const gaps = beats.slice(1).map((b, i) => b.t - beats[i].t);
    expect(gaps.every((g) => Math.abs(g - 500) < 40), 'uneven gaps (ms): ' + gaps.map(Math.round).join(', '));
    expect((await text('#btnMetroLabel')) === 'Stop', 'button did not change to Stop');
    expect(await page.$eval('#viewMetro', (e) => e.dataset.run === 'on'), 'view not marked running');
  });
  await test('the cat moves with the beat', async () => {
    const poses = new Set();
    for (let i = 0; i < 6; i++) {
      poses.add(await page.$eval('#maneki .mk-body', (g) => g.getAttribute('transform')));
      await sleep(70);
    }
    expect(poses.size > 3, 'cat is not animating');
  });
  await test('Stop stops the beats', async () => {
    await tap('#btnMetro');
    await sleep(100);
    const n = await page.evaluate(() => window.__beats.length);
    await sleep(800);
    expect((await page.evaluate(() => window.__beats.length)) === n, 'beats kept coming after Stop');
    expect((await text('#btnMetroLabel')) === 'Start', 'still says Stop');
  });
  await test('tap tempo: 5 taps 0.5 s apart give about 120 BPM', async () => {
    await page.$eval('#bpmSlider', (s) => { s.value = 60; s.dispatchEvent(new Event('input', { bubbles: true })); });
    for (let i = 0; i < 5; i++) { await tap('#btnTap'); await sleep(500); }
    const bpm = Number(await text('#bpmVal'));
    expect(Math.abs(bpm - 120) <= 6, 'got ' + bpm);
  });
  await test('switching to the tuner stops the metronome', async () => {
    await tap('#btnMetro');
    await sleep(300);
    await tap('#tabTuner');
    await sleep(200);
    expect(await page.$eval('#viewMetro', (e) => e.dataset.run === 'off'), 'metronome still running');
    await tap('#tabMetro');
  });
  await test('tempo and tab are remembered after reload', async () => {
    await page.reload({ waitUntil: 'networkidle0' });
    expect(await page.$eval('#viewMetro', (e) => !e.hidden), 'did not reopen on the metronome tab');
    const bpm = Number(await text('#bpmVal'));
    expect(Math.abs(bpm - 120) <= 6, 'tempo not saved, got ' + bpm);
  });

  console.log('settings');
  await test('sheet opens, theme changes colors, sheet closes', async () => {
    await tap('#btnSettings');
    await sleep(450);
    await shot('settings');
    const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg'));
    await tap('#chips .chip:nth-child(2)');
    const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg'));
    expect(before !== after, 'theme did not change --bg');
    await tap('#btnClose');
    await sleep(450);
    expect(await page.$eval('#sheet', (e) => !e.classList.contains('open')), 'sheet did not close');
  });

  console.log('classic style');
  const visible = (sel) => page.$eval(sel, (e) => getComputedStyle(e).display !== 'none');
  await test('Kawaii-fy switch turns classic style on', async () => {
    await tap('#btnSettings'); await sleep(450);
    expect((await page.$eval('#kawaiiSwitch', (e) => e.getAttribute('aria-checked'))) === 'true', 'kawaii should be on by default');
    await tap('#kawaiiSwitch');
    expect(await page.evaluate(() => document.documentElement.dataset.style) === 'classic', 'style not classic');
    expect((await page.$eval('#kawaiiSwitch', (e) => e.getAttribute('aria-checked'))) === 'false', 'switch still on');
    expect(!(await visible('.kawaii-only')), 'pattern picker still shown');
    expect((await text('#chips .chip:nth-child(1) span:last-child')) === 'Midnight', 'theme names not classic');
    await shot('classic-settings');
    await tap('#btnClose'); await sleep(450);
  });
  await test('classic metronome shows a swinging pendulum, no cat', async () => {
    expect(!(await visible('#maneki')) && await visible('#pendulum'), 'wrong figure shown');
    await tap('#btnMetro'); await sleep(900);
    const swings = new Set();
    for (let i = 0; i < 5; i++) { swings.add(await page.$eval('#pendulum g', (g) => g.getAttribute('transform'))); await sleep(80); }
    await shot('classic-metronome');
    await tap('#btnMetro');
    expect(swings.size > 3, 'pendulum is not swinging');
    await noOverflow(); await inView('#btnMetro');
  });
  await test('classic tuner: plain hub, no cat, no pattern', async () => {
    await tap('#tabTuner'); await sleep(200);
    expect(!(await visible('#gauge .cat')) && await visible('#gauge .hub'), 'cat/hub wrong');
    expect((await page.evaluate(() => getComputedStyle(document.body, '::before').display)) === 'none', 'pattern still shown');
    await tap('#btnGo');
    await page.waitForFunction(() => /^\d/.test(document.getElementById('hzVal').textContent), { timeout: 6000 });
    await shot('classic-tuner');
    await tap('#btnGo');
    await noOverflow(); await inView('#btnGo');
  });
  await test('classic style is remembered, and switches back', async () => {
    await page.reload({ waitUntil: 'networkidle0' });
    expect(await page.evaluate(() => document.documentElement.dataset.style) === 'classic', 'not remembered');
    await tap('#btnSettings'); await sleep(450);
    await tap('#kawaiiSwitch');
    expect(await page.evaluate(() => document.documentElement.dataset.style) === 'kawaii', 'did not switch back');
    expect((await text('#chips .chip:nth-child(1) span:last-child')) === 'Midnight Neko', 'kawaii names not back');
    await tap('#btnClose'); await sleep(450);
  });

  console.log('band');
  // Firebase is replaced by tests/fake-firebase.mjs. Page-level interception
  // doesn't see requests a service worker makes, so skip the worker from here on.
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const m = r.url().match(/^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-\w+\.js)$/);
    if (m && FAKE_SDK[m[1]]) r.respond({ status: 200, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAKE_SDK[m[1]] });
    else r.continue();
  });
  page.on('dialog', (d) => d.accept()); // "Delete …?" / "Leave …?" confirms
  const typeInto = async (sel, value) => {
    await page.$eval(sel, (e) => { e.value = ''; });
    await page.type(sel, value);
  };
  const rows = (sel) => page.$$eval(sel + ' > li', (ls) => ls.map((l) => l.textContent.replace(/\s+/g, ' ').trim()));
  const hidden = (sel) => page.$eval(sel, (e) => e.hidden || getComputedStyle(e).display === 'none');
  const editSettings = (fields) => page.evaluate((f) => {
    const st = JSON.parse(localStorage.getItem('tuner.settings.v1'));
    localStorage.setItem('tuner.settings.v1', JSON.stringify(Object.assign(st, f)));
  }, fields);
  const addSong = async (f) => {
    await tap('#btnAddSong'); await sleep(300);
    for (const [k, v] of Object.entries(f)) await typeInto(`#songForm [name="${k}"]`, String(v));
    await tap('#songForm .go'); await sleep(250);
  };
  const waitHome = () => page.waitForFunction(() => !document.getElementById('bandHome').hidden, { timeout: 4000 });

  await test('Band tab shows join and start forms', async () => {
    await tap('#tabBand'); await sleep(250);
    expect(await page.$eval('#viewBand', (e) => !e.hidden), 'band view hidden');
    expect(!(await hidden('#bandSetup')) && await hidden('#bandHome'), 'expected the setup screen');
    await noOverflow();
    await shot('band-setup');
  });
  await test('asks for your name first', async () => {
    await typeInto('#bandName', 'The Purrs');
    await tap('#formCreate .go'); await sleep(150);
    expect(/your name/i.test(await text('#bandMsg')), 'no hint, got: ' + await text('#bandMsg'));
  });
  await test('Start band makes a band with a code, you as member', async () => {
    await typeInto('#meName', 'Deniz');
    await tap('#formCreate .go');
    await waitHome();
    expect((await text('#bandTitle')) === 'The Purrs', 'title: ' + await text('#bandTitle'));
    expect(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(await text('#bandCode')), 'code: ' + await text('#bandCode'));
    expect((await text('#bandMembers')) === 'Deniz (you)', 'members: ' + await text('#bandMembers'));
    expect(problems.length === 0, problems.join('\n       '));
  });
  await test('add songs to the pool (sorted by title)', async () => {
    await addSong({ title: 'Wonderwall', artist: 'Oasis', key: 'F#m', bpm: 87 });
    await addSong({ title: 'Seven Nation Army', bpm: 124 });
    const r = await rows('#songList');
    expect(r.length === 2, 'rows: ' + r.join(' | '));
    expect(r[0].startsWith('Seven Nation Army') && r[1].includes('Oasis · F#m · 87 BPM'), 'rows: ' + r.join(' | '));
    await shot('band-songs');
    await noOverflow();
  });
  await test('"Use the metronome tempo" fills BPM; Cancel adds nothing', async () => {
    await tap('#btnAddSong'); await sleep(300);
    await tap('#btnUseTempo');
    expect(Number(await page.$eval('#songForm [name="bpm"]', (e) => e.value)) > 0, 'bpm not filled');
    await shot('band-song-dialog');
    await tap('#btnCancelSong'); await sleep(200);
    expect(!(await page.$eval('#songDialog', (d) => d.open)), 'dialog still open');
    expect((await rows('#songList')).length === 2, 'cancel added a song');
  });
  await test('tapping a song loads its tempo into the metronome', async () => {
    await tap('#songList li:nth-child(2) .row-main');
    await sleep(250);
    expect(await page.$eval('#viewMetro', (e) => !e.hidden), 'did not switch to the metronome');
    expect((await text('#bpmVal')) === '87', 'bpm ' + await text('#bpmVal'));
    expect((await text('#cueTitle')) === 'Wonderwall', 'bar shows ' + await text('#cueTitle'));
    expect(await hidden('#cuePrev'), 'prev/next should be hidden for one song');
    await noOverflow(); await inView('#btnMetro');
    await tap('#cueClose');
    expect(await hidden('#cue'), 'bar did not close');
  });
  await test('make a setlist, add songs, reorder', async () => {
    await tap('#tabBand'); await sleep(200);
    await tap('#bandTabs button[data-v="setlists"]');
    await tap('#btnAddSetlist'); await sleep(300);
    await typeInto('#nameForm [name="name"]', 'Friday');
    await tap('#nameForm .go'); await sleep(250);
    expect(!(await hidden('#paneSetlist')) && (await text('#setlistTitle')) === 'Friday', 'setlist not opened');
    await tap('#btnPickSongs'); await sleep(300);
    await tap('#pickList li:nth-child(2) button'); await sleep(100); // Wonderwall
    await tap('#pickList li:nth-child(1) button'); await sleep(100); // Seven Nation Army
    await shot('band-pick');
    await tap('#btnPickDone'); await sleep(200);
    let r = await rows('#setlistSongs');
    expect(r[0].includes('Wonderwall') && r[1].includes('Seven Nation Army'), 'order: ' + r.join(' | '));
    await tap('#setlistSongs li:nth-child(1) [data-move]:not([disabled])'); // move Wonderwall down
    await sleep(150);
    r = await rows('#setlistSongs');
    expect(r[0].includes('Seven Nation Army') && r[1].includes('Wonderwall'), 'after move: ' + r.join(' | '));
    await shot('band-setlist');
    await noOverflow();
  });
  await test('play the setlist and step through it in the metronome', async () => {
    await tap('#btnPlaySetlist'); await sleep(250);
    expect((await text('#bpmVal')) === '124', 'bpm ' + await text('#bpmVal'));
    expect((await text('#cuePos')) === 'Friday · 1/2', 'pos ' + await text('#cuePos'));
    await tap('#cueNext'); await sleep(100);
    expect((await text('#bpmVal')) === '87' && (await text('#cueTitle')) === 'Wonderwall', 'next did not load song 2');
    expect(await page.$eval('#cueNext', (b) => b.disabled), 'next should be disabled at the end');
    await shot('metronome-setlist');
    await noOverflow(); await inView('#btnMetro');
  });
  await test('editing a song updates the list; deleting it leaves the setlist', async () => {
    await tap('#tabBand'); await sleep(200);
    await tap('#bandTabs button[data-v="songs"]');
    await tap('#songList li:nth-child(1) .row-icon'); await sleep(300); // Seven Nation Army
    await typeInto('#songForm [name="bpm"]', '120');
    await tap('#songForm .go'); await sleep(200);
    expect((await rows('#songList'))[0].includes('120 BPM'), 'edit not shown');
    await tap('#songList li:nth-child(1) .row-icon'); await sleep(300);
    await tap('#btnDeleteSong'); await sleep(200);
    expect((await rows('#songList')).length === 1, 'song not deleted');
    await tap('#bandTabs button[data-v="setlists"]');
    const r = await rows('#setlistList');
    expect(r[0].includes('1 song'), 'setlist still counts it: ' + r[0]);
    expect((await text('#cueTitle')) === 'Wonderwall', 'metronome bar lost the remaining song');
  });
  await test('band is remembered after reload', async () => {
    await page.reload({ waitUntil: 'networkidle0' });
    await waitHome();
    expect((await text('#bandTitle')) === 'The Purrs', 'band not reopened');
  });
  await test('Change your name renames you in the band', async () => {
    await tap('#btnRename'); await sleep(300);
    expect((await text('#nameDialogTitle')) === 'Your name', 'title: ' + await text('#nameDialogTitle'));
    expect((await page.$eval('#nameForm [name="name"]', (e) => e.value)) === 'Deniz', 'current name not filled in');
    expect(await hidden('#btnDeleteSetlist'), 'delete button shown');
    await shot('band-rename');
    await typeInto('#nameForm [name="name"]', 'Denny');
    await tap('#nameForm .go'); await sleep(250);
    expect((await text('#bandMembers')) === 'Denny (you)', 'members: ' + await text('#bandMembers'));
    await tap('#btnRename'); await sleep(300); // and back, for the tests below
    await typeInto('#nameForm [name="name"]', 'Deniz');
    await tap('#nameForm .go'); await sleep(250);
    expect((await text('#bandMembers')) === 'Deniz (you)', 'members: ' + await text('#bandMembers'));
  });
  await test('Rename band changes the title', async () => {
    await tap('#btnRenameBand'); await sleep(300);
    expect((await page.$eval('#nameForm [name="name"]', (e) => e.value)) === 'The Purrs', 'band name not filled in');
    await typeInto('#nameForm [name="name"]', 'The Meows');
    await tap('#nameForm .go'); await sleep(250);
    expect((await text('#bandTitle')) === 'The Meows', 'title: ' + await text('#bandTitle'));
    await tap('#btnRenameBand'); await sleep(300);
    await typeInto('#nameForm [name="name"]', 'The Purrs');
    await tap('#nameForm .go'); await sleep(250);
  });

  const setTimes = (from, until) => page.evaluate((a, b) => { // <input type="time"> is fiddly to type into
    const [i, j] = document.querySelectorAll('#rangeList li:last-child input');
    i.value = a; j.value = b;
  }, from, until);
  await test('Plan: a bandmate\'s free time shows in the next 7 days', async () => {
    const code = await text('#bandCode');
    await page.evaluate((key, code) => { // Ali joins and adds times on their phone
      const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
      const s = JSON.parse(localStorage.getItem(key));
      s[`bands/${code}/members/other`] = { name: 'Ali', joinedAt: 1 };
      s[`bands/${code}/free/${day(0)}_other`] = { uid: 'other', date: day(0), times: [1080, 1320] };
      s[`bands/${code}/free/${day(1)}_other`] = { uid: 'other', date: day(1), times: [1140, 1260] };
      s[`bands/${code}/free/${day(-3)}_${localStorage.getItem('__fakeUid')}`] = { uid: localStorage.getItem('__fakeUid'), date: day(-3), times: [600, 700] };
      localStorage.setItem(key, JSON.stringify(s));
    }, FAKE_STORE_KEY, code);
    await page.reload({ waitUntil: 'networkidle0' });
    await waitHome();
    await tap('#bandTabs button[data-v="plan"]'); await sleep(250);
    expect(!(await hidden('#panePlan')) && await hidden('#paneSongs'), 'plan pane not shown');
    expect((await text('#weekLabel')) === 'Next 7 days', 'week: ' + await text('#weekLabel'));
    const r = await rows('#dayList');
    expect(r.length === 7, r.length + ' days');
    expect(r[0].startsWith('Today') && r[0].includes('No overlap yet') && r[0].includes('Ali 18:00–22:00'), 'today: ' + r[0]);
    expect(r[2].includes('Tap to add'), 'day 3: ' + r[2]);
    const old = await page.evaluate((key) => Object.keys(JSON.parse(localStorage.getItem(key))).filter((k) => k.includes('/free/')).length, FAKE_STORE_KEY);
    expect(old === 2, 'your free time from 3 days ago was not cleaned up');
    await noOverflow();
    await shot('band-plan-empty');
  });
  await test('Plan: adding your free time shows when everyone is free', async () => {
    await tap('#dayList li:nth-child(1) .day'); await sleep(300);
    expect(await hidden('#btnClearDay'), '"Not free" shown with nothing to clear');
    expect((await text('#dayOthers')).includes('Ali 18:00–22:00'), 'others: ' + await text('#dayOthers'));
    await tap('#quickTimes button:nth-child(2)'); // Evening
    const v = await page.$$eval('#rangeList input', (is) => is.map((i) => i.value).join(' '));
    expect(v === '18:00 00:00', 'evening: ' + v);
    await shot('band-day');
    await tap('#dayForm .go'); await sleep(250);
    expect((await rows('#dayList'))[0].includes('Everyone free 18:00–22:00'), 'today: ' + (await rows('#dayList'))[0]);

    await tap('#dayList li:nth-child(2) .day'); await sleep(300);
    await tap('#quickTimes button:nth-child(4)'); // + Other time
    await setTimes('18:00', '17:00');
    await tap('#dayForm .go'); await sleep(150);
    expect(/end after/.test(await text('#dayErr')), 'end before start was accepted');
    await setTimes('18:00', '20:30');
    await tap('#dayForm .go'); await sleep(250);
    expect((await rows('#dayList'))[1].includes('Everyone free 19:00–20:30'), 'tomorrow: ' + (await rows('#dayList'))[1]);
  });
  await test('Plan: a day poll from the best times; vote, then close it', async () => {
    await tap('#btnDayPoll'); await sleep(300);
    expect((await page.$eval('#pollForm [name="question"]', (e) => e.value)) === 'When do we practise?', 'question not filled in');
    const opts = await page.$$eval('#optInputs input', (is) => is.map((i) => i.value));
    expect(opts.length === 2 && opts[0].endsWith('18:00–22:00') && opts[1].endsWith('19:00–20:30'), 'options: ' + opts.join(' | '));
    await tap('#pollForm .go'); await sleep(250);
    const first = '#pollList li:nth-child(1)';
    expect((await text(first + ' .poll-q')) === 'When do we practise?', 'poll not listed');
    await tap(first + ' .opt[data-opt="0"]'); await sleep(200);
    await tap(first + ' .opt[data-opt="1"]'); await sleep(200);
    expect((await page.$$eval(first + ' .opt[aria-pressed="true"]', (b) => b.length)) === 2, 'multi-choice did not keep both');
    expect((await text(first + ' .opt[data-opt="0"] .opt-who')) === 'Deniz', 'voter not shown');
    await shot('band-poll');
    await tap(first + ' [data-act="close"]'); await sleep(150);
    expect((await text(first + ' .poll-hint')).includes('Tap the option'), 'no hint when closing');
    await tap(first + ' .opt[data-opt="1"]'); await sleep(250);
    expect(await page.$eval(first, (e) => e.classList.contains('closed')), 'poll not closed');
    expect((await text(first + ' .opt.win .opt-label')).startsWith('✓') && (await text(first + ' .opt.win')).includes('19:00–20:30'), 'wrong winner');
    expect((await text(first + ' .poll-meta')).includes('decided'), 'meta: ' + await text(first + ' .poll-meta'));
  });
  await test('Plan: a pick-one poll with your own options', async () => {
    await tap('#btnAddPoll'); await sleep(300);
    await tap('#pollForm .go'); await sleep(150);
    expect(/question/.test(await text('#pollErr')), 'empty poll accepted');
    await typeInto('#pollForm [name="question"]', 'Next cover?');
    await typeInto('#optInputs li:nth-child(1) input', 'Creep');
    await typeInto('#optInputs li:nth-child(2) input', 'Wonderwall');
    await tap('#btnAddOption');
    await page.type('#optInputs li:nth-child(3) input', 'Zombie');
    await tap('#pollForm [name="multi"]');
    await tap('#pollForm .go'); await sleep(250);
    const first = '#pollList li:nth-child(1)';
    expect((await text(first + ' .poll-q')) === 'Next cover?', 'open poll not on top');
    expect((await text(first + ' .poll-meta')).includes('pick one'), 'meta: ' + await text(first + ' .poll-meta'));
    await tap(first + ' .opt[data-opt="1"]'); await sleep(200);
    await tap(first + ' .opt[data-opt="2"]'); await sleep(200);
    const picked = await page.$$eval(first + ' .opt[aria-pressed="true"]', (b) => b.map((x) => x.dataset.opt).join());
    expect(picked === '2', 'picked: ' + picked);
    await noOverflow();
    await shot('band-plan');
    await page.evaluate(() => window.scrollTo(0, 0));
  });
  await test('Leave band goes back to the setup screen', async () => {
    await tap('#btnLeave'); await sleep(250);
    expect(!(await hidden('#bandSetup')), 'setup not shown');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tuner.settings.v1')).band) === null, 'band not forgotten');
  });
  await test('a wrong code is refused', async () => {
    await typeInto('#joinCode', 'zzzz-zzzz');
    await tap('#formJoin .go');
    await page.waitForFunction(() => /no band/i.test(document.getElementById('bandMsg').textContent), { timeout: 3000 });
  });
  await test('an invite link opens the Band tab with the code filled in, and joins', async () => {
    await page.evaluate((key) => { // a band someone else started on their phone
      const s = JSON.parse(localStorage.getItem(key) || '{}');
      s['bands/TEST-2345'] = { name: 'Neko Noise', createdBy: 'other', createdAt: 1 };
      s['bands/TEST-2345/members/other'] = { name: 'Ali', joinedAt: 1 };
      s['bands/TEST-2345/songs/s1'] = { title: 'Purr Blues', artist: '', key: 'E', bpm: 72, beats: 3, notes: '', addedBy: 'other', createdAt: 1 };
      localStorage.setItem(key, JSON.stringify(s));
    }, FAKE_STORE_KEY);
    await editSettings({ mode: 'tuner' });
    await page.goto(URL_ + '?join=test2345', { waitUntil: 'networkidle0' });
    expect(await page.$eval('#viewBand', (e) => !e.hidden), 'band tab not opened');
    expect((await page.$eval('#joinCode', (e) => e.value)) === 'TEST-2345', 'code not filled in');
    expect(!(await page.evaluate(() => location.search)), 'invite left in the address bar');
    expect((await page.$eval('#meName', (e) => e.value)) === 'Deniz', 'name not remembered');
    await tap('#formJoin .go');
    await waitHome();
    expect((await text('#bandMembers')) === 'Ali, Deniz (you)', 'members: ' + await text('#bandMembers'));
    expect((await rows('#songList'))[0].includes('E · 72 BPM · 3/4'), 'their song missing');
  });
  await test('classic style band screen', async () => {
    await editSettings({ kawaii: false });
    await page.reload({ waitUntil: 'networkidle0' });
    await waitHome();
    expect((await style('.row', 'borderTopWidth')) === '1px', 'rows not flat in classic');
    await shot('classic-band');
    await editSettings({ kawaii: true });
    await page.reload({ waitUntil: 'networkidle0' });
  });

  console.log('layouts');
  for (const name of ['small', 'tiny', 'landscape']) {
    await test(`${name} (${PHONES[name].width}x${PHONES[name].height}) fits, all tabs`, async () => {
      await phone(name);
      await tap('#tabBand'); await sleep(150);
      await noOverflow();
      await shot(`band-${name}`);
      await tap('#tabMetro'); await sleep(150);
      await noOverflow(); await inView('#btnMetro');
      await shot(`metronome-${name}`);
      await tap('#tabTuner'); await sleep(150);
      await noOverflow(); await inView('#btnGo');
      await shot(`tuner-${name}`);
    });
  }

  await test('no errors during the whole run', () => expect(problems.length === 0, problems.join('\n       ')));
} finally {
  await page.evaluate(() => localStorage.clear()).catch(() => {});
  await browser.close();
  server.close();
}

if (failed) { console.log(`\n${failed} browser test(s) failed`); process.exit(1); }
console.log('\nall browser tests passed (screenshots in tests/screenshots/)');
