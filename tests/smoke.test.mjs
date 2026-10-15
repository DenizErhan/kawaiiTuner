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

const hidden = (sel) => page.$eval(sel, (e) => e.hidden || getComputedStyle(e).display === 'none');
const visible = (sel) => page.$eval(sel, (e) => getComputedStyle(e).display !== 'none');
const isOpen = (sel) => page.$eval(sel, (d) => d.open);
const hash = () => page.evaluate(() => location.hash);
/** Opens the ☰ menu and taps an entry, e.g. 'metronome' or 'band/polls'. */
async function nav(route) {
  await tap('#btnMenu'); await sleep(350);
  await tap(`#drawer a[data-route="${route}"]`); await sleep(300);
}
async function openSettings() {
  await tap('#btnMenu'); await sleep(350);
  await tap('#navSettings'); await sleep(450);
}
async function closeSettings() {
  await tap('#btnClose'); await sleep(300);
}

try {
  await phone('pixel');
  await page.goto(URL_, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });

  console.log('page');
  await test('loads without errors', () => expect(problems.length === 0, problems.join('\n       ')));
  await test('stylesheets are applied', async () => {
    expect((await style('.go', 'borderRadius')) !== '0px', '.go has no border radius: CSS missing?');
    expect((await style('.top', 'display')) === 'flex', 'top bar unstyled');
  });
  await test('opens on the tuner, with its address', async () => {
    expect((await hash()) === '#/tuner', 'hash: ' + await hash());
    expect((await text('#topTitle')) === 'Tuner', 'title: ' + await text('#topTitle'));
  });
  await test('version label is shown', async () => expect(/Version \d/.test(await text('#version')), 'no version text'));
  await test('service worker takes control', async () => {
    const ok = await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload({ waitUntil: 'networkidle0' });
    const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
    expect(ok && controlled, 'page is not controlled by sw.js');
    expect((await style('.go', 'borderRadius')) !== '0px', 'styles missing after reload through the service worker');
  });

  console.log('menu');
  await test('☰ opens the menu with the current screen marked', async () => {
    await tap('#btnMenu'); await sleep(350);
    expect(await isOpen('#drawer'), 'menu not open');
    expect((await page.$eval('#drawer [aria-current="page"]', (a) => a.dataset.route)) === 'tuner', 'tuner not marked');
    expect(await hidden('#navBandItems'), 'band sections shown without a band');
    expect((await text('#navBandHome')) === 'Join or start a band', 'band entry: ' + await text('#navBandHome'));
    await noOverflow();
    await shot('menu');
  });
  await test('Esc (and the phone\'s back button) closes the menu', async () => {
    await page.keyboard.press('Escape'); await sleep(200);
    expect(!(await isOpen('#drawer')), 'menu still open');
  });
  await test('tapping outside the menu closes it', async () => {
    await tap('#btnMenu'); await sleep(350);
    await page.touchscreen.tap(400, 450); await sleep(200);
    expect(!(await isOpen('#drawer')), 'menu still open');
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
  await test('the menu opens the metronome', async () => {
    await nav('metronome');
    expect(await page.$eval('#viewMetro', (e) => !e.hidden), 'metronome view hidden');
    expect(await page.$eval('#viewTuner', (e) => e.hidden), 'tuner view still visible');
    expect((await hash()) === '#/metronome' && (await text('#topTitle')) === 'Metronome', 'address or title wrong');
    await shot('metronome-idle');
  });
  await test('the back button goes back to the tuner', async () => {
    await page.goBack(); await sleep(250);
    expect(await page.$eval('#viewTuner', (e) => !e.hidden), 'tuner not shown');
    await page.goForward(); await sleep(250);
    expect(await page.$eval('#viewMetro', (e) => !e.hidden), 'forward did not reopen the metronome');
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
    await nav('tuner');
    expect(await page.$eval('#viewMetro', (e) => e.dataset.run === 'off'), 'metronome still running');
    await nav('metronome');
  });
  await test('screen and tempo are remembered after reload', async () => {
    await page.reload({ waitUntil: 'networkidle0' });
    expect(await page.$eval('#viewMetro', (e) => !e.hidden), 'did not reopen on the metronome');
    const bpm = Number(await text('#bpmVal'));
    expect(Math.abs(bpm - 120) <= 6, 'tempo not saved, got ' + bpm);
  });
  await test('opening the app without an address goes to the last screen used', async () => {
    await page.goto(URL_, { waitUntil: 'networkidle0' });
    expect((await hash()) === '#/metronome', 'hash: ' + await hash());
  });

  console.log('settings');
  await test('Settings opens from the menu, theme changes colors, sheet closes', async () => {
    await openSettings();
    expect(await isOpen('#sheet'), 'sheet not open');
    expect(!(await isOpen('#drawer')), 'menu still open behind it');
    await shot('settings');
    const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg'));
    await tap('#chips .chip:nth-child(2)');
    const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg'));
    expect(before !== after, 'theme did not change --bg');
    await closeSettings();
    expect(!(await isOpen('#sheet')), 'sheet did not close');
  });
  await test('Esc closes the settings sheet', async () => {
    await openSettings();
    await page.keyboard.press('Escape'); await sleep(200);
    expect(!(await isOpen('#sheet')), 'sheet still open');
  });

  console.log('classic style');
  await test('Kawaii-fy switch turns classic style on', async () => {
    await openSettings();
    expect((await page.$eval('#kawaiiSwitch', (e) => e.getAttribute('aria-checked'))) === 'true', 'kawaii should be on by default');
    await tap('#kawaiiSwitch');
    expect(await page.evaluate(() => document.documentElement.dataset.style) === 'classic', 'style not classic');
    expect((await page.$eval('#kawaiiSwitch', (e) => e.getAttribute('aria-checked'))) === 'false', 'switch still on');
    expect(!(await visible('.kawaii-only')), 'pattern picker still shown');
    expect((await text('#chips .chip:nth-child(1) span:last-child')) === 'Midnight', 'theme names not classic');
    await shot('classic-settings');
    await closeSettings();
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
    await nav('tuner');
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
    await openSettings();
    await tap('#kawaiiSwitch');
    expect(await page.evaluate(() => document.documentElement.dataset.style) === 'kawaii', 'did not switch back');
    expect((await text('#chips .chip:nth-child(1) span:last-child')) === 'Midnight Neko', 'kawaii names not back');
    await closeSettings();
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
  /** Opens the band menu (⋯) and taps one of its buttons. */
  async function bandMenu(id) {
    await tap('#btnBandMenu'); await sleep(350);
    if (id) { await tap('#' + id); await sleep(300); }
  }

  await test('Band shows join and start forms', async () => {
    await nav('band');
    expect(await page.$eval('#viewBand', (e) => !e.hidden), 'band view hidden');
    expect(!(await hidden('#bandSetup')) && await hidden('#bandHome'), 'expected the setup screen');
    expect((await hash()) === '#/band', 'hash: ' + await hash());
    await noOverflow();
    await shot('band-setup');
  });
  await test('band sections redirect to setup when not in a band', async () => {
    await page.evaluate(() => { location.hash = '#/band/songs'; }); await sleep(250);
    expect((await hash()) === '#/band' && !(await hidden('#bandSetup')), 'hash: ' + await hash());
  });
  await test('asks for your name first', async () => {
    await typeInto('#bandName', 'The Purrs');
    await tap('#formCreate .go'); await sleep(150);
    expect(/your name/i.test(await text('#bandMsg')), 'no hint, got: ' + await text('#bandMsg'));
  });
  await test('Start band opens its home, you as member', async () => {
    await typeInto('#meName', 'Deniz');
    await tap('#formCreate .go');
    await waitHome();
    expect((await text('#topTitle')) === 'The Purrs', 'title: ' + await text('#topTitle'));
    expect((await text('#bandMembers')) === 'Deniz (you)', 'members: ' + await text('#bandMembers'));
    const cards = await rows('.home-list');
    expect(cards.length === 4 && cards[0].startsWith('Polls') && cards[2].includes('0 songs'), 'cards: ' + cards.join(' | '));
    expect(problems.length === 0, problems.join('\n       '));
    await noOverflow();
  });
  await test('the menu now lists the band\'s sections under its name', async () => {
    await tap('#btnMenu'); await sleep(350);
    expect(!(await hidden('#navBandItems')), 'band sections hidden');
    expect((await text('#navBandName')) === 'The Purrs', 'label: ' + await text('#navBandName'));
    expect((await text('#navBandHome')) === 'Band home', 'entry: ' + await text('#navBandHome'));
    await shot('menu-band');
    await page.keyboard.press('Escape'); await sleep(200);
  });
  await test('band menu shows the invite code and members', async () => {
    await bandMenu();
    expect(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(await text('#bandCode')), 'code: ' + await text('#bandCode'));
    expect((await text('#menuMembers')) === 'Deniz (you)', 'members: ' + await text('#menuMembers'));
    await noOverflow();
    await shot('band-menu');
    await tap('#btnMenuDone'); await sleep(200);
    expect(!(await isOpen('#bandMenu')), 'menu did not close');
  });
  await test('add songs to the pool (sorted by title)', async () => {
    await tap('#home-songs'); await sleep(250);
    expect((await hash()) === '#/band/songs' && (await text('#topTitle')) === 'Songs', 'not on songs');
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
    expect(!(await isOpen('#songDialog')), 'dialog still open');
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
    await nav('band/setlists');
    await tap('#btnAddSetlist'); await sleep(300);
    await typeInto('#nameForm [name="name"]', 'Friday');
    await tap('#nameForm .go'); await sleep(300);
    expect(!(await hidden('#paneSetlist')) && (await text('#topTitle')) === 'Friday', 'setlist not opened');
    expect(/^#\/band\/setlists\/\w+$/.test(await hash()), 'hash: ' + await hash());
    expect(!(await hidden('#btnUp')) && await hidden('#btnMenu'), 'no back arrow on a setlist');
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
  await test('the back arrow goes back to the setlists', async () => {
    await tap('#btnUp'); await sleep(300);
    expect((await hash()) === '#/band/setlists' && !(await hidden('#paneSetlists')), 'hash: ' + await hash());
    expect((await rows('#setlistList'))[0].includes('2 songs'), 'list: ' + (await rows('#setlistList'))[0]);
    await tap('#setlistList li:nth-child(1) a'); await sleep(300);
    expect((await text('#topTitle')) === 'Friday', 'did not reopen the setlist');
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
    await nav('band/songs');
    await tap('#songList li:nth-child(1) .row-icon'); await sleep(300); // Seven Nation Army
    await typeInto('#songForm [name="bpm"]', '120');
    await tap('#songForm .go'); await sleep(200);
    expect((await rows('#songList'))[0].includes('120 BPM'), 'edit not shown');
    await tap('#songList li:nth-child(1) .row-icon'); await sleep(300);
    await tap('#btnDeleteSong'); await sleep(200);
    expect((await rows('#songList')).length === 1, 'song not deleted');
    await nav('band/setlists');
    const r = await rows('#setlistList');
    expect(r[0].includes('1 song'), 'setlist still counts it: ' + r[0]);
    expect((await text('#cueTitle')) === 'Wonderwall', 'metronome bar lost the remaining song');
  });
  await test('band and screen are remembered after reload', async () => {
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => !document.getElementById('paneSetlists').hidden, { timeout: 4000 });
    expect((await hash()) === '#/band/setlists', 'hash: ' + await hash());
    await nav('band');
    await waitHome();
    expect((await text('#topTitle')) === 'The Purrs', 'band not reopened');
    expect((await rows('.home-list'))[3].includes('1 setlist'), 'cards: ' + (await rows('.home-list')).join(' | '));
  });
  await test('Change your name renames you in the band', async () => {
    await bandMenu('btnRename');
    expect((await text('#nameDialogTitle')) === 'Change your name', 'title: ' + await text('#nameDialogTitle'));
    expect((await page.$eval('#nameForm [name="name"]', (e) => e.value)) === 'Deniz', 'current name not filled in');
    expect(await hidden('#btnDeleteSetlist'), 'delete button shown');
    await shot('band-rename');
    await typeInto('#nameForm [name="name"]', 'Denny');
    await tap('#nameForm .go'); await sleep(250);
    expect((await text('#bandMembers')) === 'Denny (you)', 'members: ' + await text('#bandMembers'));
    await bandMenu('btnRename'); // and back, for the tests below
    await typeInto('#nameForm [name="name"]', 'Deniz');
    await tap('#nameForm .go'); await sleep(250);
    expect((await text('#bandMembers')) === 'Deniz (you)', 'members: ' + await text('#bandMembers'));
  });
  await test('Rename band changes the title and the menu', async () => {
    await bandMenu('btnRenameBand');
    expect((await page.$eval('#nameForm [name="name"]', (e) => e.value)) === 'The Purrs', 'band name not filled in');
    await typeInto('#nameForm [name="name"]', 'The Meows');
    await tap('#nameForm .go'); await sleep(250);
    expect((await text('#topTitle')) === 'The Meows', 'title: ' + await text('#topTitle'));
    expect((await text('#navBandName')) === 'The Meows', 'menu: ' + await text('#navBandName'));
    await bandMenu('btnRenameBand');
    await typeInto('#nameForm [name="name"]', 'The Purrs');
    await tap('#nameForm .go'); await sleep(250);
  });

  const setTimes = (from, until) => page.evaluate((a, b) => { // <input type="time"> is fiddly to type into
    const [i, j] = document.querySelectorAll('#rangeList li:last-child input');
    i.value = a; j.value = b;
  }, from, until);
  await test('a bandmate\'s free time and poll show up; ☰ gets a dot for the vote', async () => {
    await bandMenu();
    const code = await text('#bandCode');
    await tap('#btnMenuDone'); await sleep(200);
    await page.evaluate((key, code) => { // Ali joins, adds times and asks something, on their phone
      const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
      const s = JSON.parse(localStorage.getItem(key));
      const me = localStorage.getItem('__fakeUid');
      s[`bands/${code}/members/other`] = { name: 'Ali', joinedAt: 1 };
      s[`bands/${code}/free/${day(0)}_other`] = { uid: 'other', date: day(0), times: [1080, 1320] };
      s[`bands/${code}/free/${day(1)}_other`] = { uid: 'other', date: day(1), times: [1140, 1260] };
      s[`bands/${code}/free/${day(-3)}_${me}`] = { uid: me, date: day(-3), times: [600, 700] };
      s[`bands/${code}/polls/aliq`] = { question: 'Pizza after?', options: ['Yes', 'No'], multi: false, createdBy: 'other', createdAt: 1, closed: false, winner: null, votes: { other: [0] } };
      localStorage.setItem(key, JSON.stringify(s));
    }, FAKE_STORE_KEY, code);
    await page.reload({ waitUntil: 'networkidle0' });
    await waitHome();
    await page.waitForFunction(() => !document.getElementById('menuDot').hidden, { timeout: 4000 });
    const cards = await rows('.home-list');
    expect(cards[0].includes('1 poll needs your vote'), 'polls card: ' + cards[0]);
    expect((await text('#bandMembers')) === 'Ali, Deniz (you)', 'members: ' + await text('#bandMembers'));
    await shot('band-home');
    const old = await page.evaluate((key) => Object.keys(JSON.parse(localStorage.getItem(key))).filter((k) => k.includes('/free/')).length, FAKE_STORE_KEY);
    expect(old === 2, 'your free time from 3 days ago was not cleaned up');
  });
  await test('voting clears the dot', async () => {
    await tap('#home-polls'); await sleep(250);
    expect((await text('#pollList li:nth-child(1) .poll-q')) === 'Pizza after?', 'poll missing');
    await tap('#pollList li:nth-child(1) .opt[data-opt="0"]'); await sleep(250);
    expect(await hidden('#menuDot'), 'dot still shown');
    expect((await text('#pollList li:nth-child(1) .opt[data-opt="0"] .opt-who')) === 'Ali, Deniz', 'voters: ' + await text('#pollList li:nth-child(1) .opt[data-opt="0"] .opt-who'));
    expect((await page.$$('#pollList [data-act]')).length === 0, 'you can close someone else\'s poll');
  });
  await test('Calendar: a bandmate\'s free time shows in the next 7 days', async () => {
    await nav('band/calendar');
    expect(!(await hidden('#paneCalendar')) && (await text('#topTitle')) === 'Calendar', 'calendar not shown');
    expect((await text('#weekLabel')) === 'Next 7 days', 'week: ' + await text('#weekLabel'));
    const r = await rows('#dayList');
    expect(r.length === 7, r.length + ' days');
    expect(r[0].startsWith('Today') && r[0].includes('No overlap yet') && r[0].includes('Ali 18:00–22:00'), 'today: ' + r[0]);
    expect(r[2].includes('Tap to add'), 'day 3: ' + r[2]);
    await noOverflow();
    await shot('band-calendar-empty');
  });
  await test('Calendar: adding your free time shows when everyone is free', async () => {
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
  await test('the band home sums up the week', async () => {
    await nav('band');
    expect((await rows('.home-list'))[1].includes('Everyone is free on 2 days this week'), 'calendar card: ' + (await rows('.home-list'))[1]);
  });
  await test('a day poll from the calendar\'s best times; vote, then close it', async () => {
    await nav('band/calendar');
    await tap('#btnDayPoll'); await sleep(350);
    expect((await hash()) === '#/band/polls', 'did not go to polls: ' + await hash());
    expect((await page.$eval('#pollForm [name="question"]', (e) => e.value)) === 'When do we practise?', 'question not filled in');
    const opts = await page.$$eval('#optInputs input', (is) => is.map((i) => i.value));
    expect(opts.length === 2 && opts[0].endsWith('18:00–22:00') && opts[1].endsWith('19:00–20:30'), 'options: ' + opts.join(' | '));
    await tap('#pollForm .go'); await sleep(250);
    const first = '#pollList li:nth-child(1)';
    expect((await text(first + ' .poll-q')) === 'When do we practise?', 'poll not listed first');
    expect(!(await hidden('#menuDot')), 'no dot for the new poll');
    await tap(first + ' .opt[data-opt="0"]'); await sleep(200);
    await tap(first + ' .opt[data-opt="1"]'); await sleep(200);
    expect((await page.$$eval(first + ' .opt[aria-pressed="true"]', (b) => b.length)) === 2, 'multi-choice did not keep both');
    expect((await text(first + ' .opt[data-opt="0"] .opt-who')) === 'Deniz', 'voter not shown');
    await shot('band-poll');
    await tap(first + ' [data-act="close"]'); await sleep(150);
    expect((await text(first + ' .poll-hint')).includes('Tap the option'), 'no hint when closing');
    await tap(first + ' .opt[data-opt="1"]'); await sleep(250);
    const closed = '#pollList li.closed';
    expect((await text(closed + ' .opt.win .opt-label')).startsWith('✓') && (await text(closed + ' .opt.win')).includes('19:00–20:30'), 'wrong winner');
    expect((await text(closed + ' .poll-meta')).includes('decided'), 'meta: ' + await text(closed + ' .poll-meta'));
  });
  await test('the decision shows on the band home', async () => {
    await nav('band');
    expect(!(await hidden('#homeDecided')) && (await text('#homeDecidedA')).includes('19:00–20:30'), 'decision: ' + await text('#homeDecided'));
  });
  await test('a pick-one poll with your own options', async () => {
    await nav('band/polls');
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
    await shot('band-polls');
    await page.evaluate(() => window.scrollTo(0, 0));
  });
  await test('Leave band goes back to the setup screen', async () => {
    await bandMenu('btnLeave'); await sleep(250);
    expect(!(await hidden('#bandSetup')), 'setup not shown');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tuner.settings.v1')).band) === null, 'band not forgotten');
    expect(await hidden('#navBandItems'), 'menu still lists band sections');
  });
  await test('a wrong code is refused', async () => {
    await typeInto('#joinCode', 'zzzz-zzzz');
    await tap('#formJoin .go');
    await page.waitForFunction(() => /no band/i.test(document.getElementById('bandMsg').textContent), { timeout: 3000 });
  });
  await test('an invite link opens the Band screen with the code filled in, and joins', async () => {
    await page.evaluate((key) => { // a band someone else started on their phone
      const s = JSON.parse(localStorage.getItem(key) || '{}');
      s['bands/TEST-2345'] = { name: 'Neko Noise', createdBy: 'other', createdAt: 1 };
      s['bands/TEST-2345/members/other'] = { name: 'Ali', joinedAt: 1 };
      s['bands/TEST-2345/songs/s1'] = { title: 'Purr Blues', artist: '', key: 'E', bpm: 72, beats: 3, notes: '', addedBy: 'other', createdAt: 1 };
      localStorage.setItem(key, JSON.stringify(s));
    }, FAKE_STORE_KEY);
    await editSettings({ mode: 'tuner' });
    await page.goto(URL_ + '?join=test2345', { waitUntil: 'networkidle0' });
    expect(await page.$eval('#viewBand', (e) => !e.hidden), 'band screen not opened');
    expect((await page.$eval('#joinCode', (e) => e.value)) === 'TEST-2345', 'code not filled in');
    expect(!(await page.evaluate(() => location.search)), 'invite left in the address bar');
    expect((await page.$eval('#meName', (e) => e.value)) === 'Deniz', 'name not remembered');
    await tap('#formJoin .go');
    await waitHome();
    expect((await text('#bandMembers')) === 'Ali, Deniz (you)', 'members: ' + await text('#bandMembers'));
    await tap('#home-songs'); await sleep(250);
    expect((await rows('#songList'))[0].includes('E · 72 BPM · 3/4'), 'their song missing');
  });
  await test('classic style band screens', async () => {
    await editSettings({ kawaii: false });
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => !document.getElementById('paneSongs').hidden, { timeout: 4000 });
    expect((await style('.row', 'borderTopWidth')) === '1px', 'rows not flat in classic');
    await shot('classic-band');
    await nav('band');
    await waitHome();
    expect((await style('.home-card', 'borderTopWidth')) === '1px', 'home cards not flat in classic');
    await shot('classic-band-home');
    await editSettings({ kawaii: true });
    await page.reload({ waitUntil: 'networkidle0' });
  });

  console.log('layouts');
  for (const name of ['small', 'tiny', 'landscape']) {
    await test(`${name} (${PHONES[name].width}x${PHONES[name].height}) fits, all screens`, async () => {
      await phone(name);
      await nav('band');
      await noOverflow();
      await shot(`band-${name}`);
      await tap('#btnMenu'); await sleep(350);
      await noOverflow();
      await shot(`menu-${name}`);
      await page.keyboard.press('Escape'); await sleep(200);
      await nav('metronome');
      await noOverflow(); await inView('#btnMetro');
      await shot(`metronome-${name}`);
      await nav('tuner');
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
