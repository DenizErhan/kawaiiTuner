# Tuner

A cute tuner, metronome and band organiser for musicians that runs in the browser. Plain HTML/JS, no build step, no dependencies to install (the band screens load Firebase from Google's CDN).

## Run it

The microphone only works on HTTPS or localhost, so serve the folder instead of opening the file:

```
npm run serve          # http://localhost:8080/  (no caching, so reloads show your edits)
```

Allow the microphone, press Start, play or sing a note.

## Test before every deploy

```
npm install            # once: installs puppeteer-core (dev only, nothing ships with the app)
npm test               # unit tests + browser tests, must say "all ... passed"
```

- `npm run test:unit`: pitch detection, note maths, pitch tracker, tempo names, band and calendar logic, and that every text the code asks for exists in every language file (plain Node).
- `npm run test:browser`: opens the app in your installed Chrome as an Android phone (touch, fake microphone that plays a tone), checks every screen is styled, every control works, the metronome keeps time (one beat per 500 ms at 120 BPM), and nothing is cut off at 412x915, 360x640, 320x568 or landscape. Screenshots go to `tests/screenshots/`.

### On your Android phone, before deploying

1. Phone: Settings > About phone > tap Build number 7 times, then Developer options > USB debugging on. Plug it into the PC.
2. PC: `npm run serve`, then in Chrome open `chrome://inspect/#devices`, click **Port forwarding**, add `8080` -> `localhost:8080`, tick **Enable port forwarding**.
3. Phone: open Chrome at `http://localhost:8080/`. It counts as localhost, so the microphone works.

### Deploy

Bump `VERSION` in `js/version.js`, commit, `git push`. GitHub Pages updates in a minute or two; the version at the bottom of Settings shows which build a phone is running.

## What's in it

- A ☰ menu (slides in from the left) leads to every screen: Tuner, Metronome, the band's sections, Settings. Each screen has its own address (`#/tuner`, `#/band/polls`, …), so the phone's back button, reloads and links land in the right place. A dot on ☰ means a poll is waiting for your vote.
- Pitch detection with the YIN algorithm (`js/core/yin.js`), about 30 Hz to 2 kHz.
- Note name, octave, cents sharp/flat, frequency, target frequency.
- Needle gauge with a cat on the pivot: asleep when stopped, eyes follow the needle, hops and blushes when you're in tune (within about 5 cents).
- Two styles, switched with **Kawaii-fy ✨** at the top of Settings (on by default). Classic: plain font, no patterns, plain needle, and a pendulum metronome whose weight slides with the tempo. Kawaii: everything below.
- Six color themes that work in both styles (classic / kawaii names): Midnight / Midnight Neko, Rose / Strawberry Milk, Sage / Matcha Mochi, Plum / Sakura Night, Sand / Boba Tea, Ocean / Sea Kitty, plus a Custom theme (edit any color, the kitty included, and pick a background pattern: paws, hearts, stars, petals, bubbles, fish).
- Made for phones: portrait and landscape layouts, safe areas (notch), no double-tap zoom, swipe the settings sheet down to close, hold +/- to step quickly, screen stays on while tuning, add to home screen (web manifest + icons).
- Reference pitch A4 (400-480 Hz; double-tap the value to reset to 440).
- Note names: C D E or Do Re Mi.
- English and Turkish (Settings > Language; starts in Turkish on a phone set to Turkish).
- Metronome: 30-250 BPM with tempo names, slider and hold-to-repeat +/-, 1-12 beats per bar with an accented first beat, tap tempo. Clicks are scheduled on the Web Audio clock, so timing stays exact. A Maneki Neko beckons on every beat, sways, and jingles its bell on beat 1.
- Only one mode runs at a time, so the tuner never hears the clicks.
- Settings saved in the browser (localStorage), including the last screen and the tempo.

### Band

- One person starts a band and gets a code like `K7MP-Q3XA`; the others type it in (or open the invite link from the Share button). No accounts or passwords: each phone signs in anonymously.
- Shared song pool: title, artist, key, BPM, beats, notes. Changes show up on everyone's phone live.
- Setlists: pick songs from the pool, put them in order.
- Tap a song: the metronome takes its tempo and beats. Play a setlist: a bar in the metronome steps through it (‹ ›).
- Band home: the latest decision, polls waiting for your vote, this week's overlap, and the song and setlist counts; each card opens its screen.
- Band menu (⋯ at the top right): the invite code and Share button, members, change your name, rename the band, leave.
- Plan: everyone adds when they're free (exact times, a week at a time from today); each day shows who overlaps and the best window. One tap turns the week's best times into a "When do we practise?" poll.
- Polls: any question with your own options, pick one or pick any, results live with names. Whoever asked closes it by tapping the winner.
- Works offline once it has loaded: songs, setlists, polls and free times are cached on the phone, and edits are sent when it's back online.

## Try it on your phone

The mic needs HTTPS, so the page has to be hosted. Any static host works; all paths are relative, so a subfolder like `/tuner/` is fine.

- **Quickest (no setup):** go to <https://app.netlify.com/drop> and drag this whole folder onto the page. You get an `https://….netlify.app` link in seconds; open it on your phone. Make a free account to keep it (otherwise it expires).
- **GitHub Pages (permanent, free):** create a repo on github.com, upload these files (Add file > Upload files, or `git push`), then Settings > Pages > Deploy from a branch > `main` / root. The site appears at `https://<user>.github.io/<repo>/` after a minute.
- **Straight from this PC:** `npx serve .` then a tunnel, e.g. `cloudflared tunnel --url http://localhost:3000` (install with `winget install Cloudflare.cloudflared`). It prints an HTTPS link that works while your PC is on.

On the phone: open the link, tap Start, allow the microphone. To get an app icon: iPhone Safari > Share > Add to Home Screen; Android Chrome > menu > Add to Home screen / Install app.

## Known limits

- Very low bass notes (below about 55 Hz) with background noise can wobble by 4-7 cents.
- Tested on synthetic tones and a simulated microphone only; needs checking with a real guitar and voice.
- iPhone: the metronome plays through the silent switch on iOS 17+; on older iOS, flip the switch off to hear it.
- The metronome stops when the phone locks or you leave the browser (the screen stays on while it runs).

## Roadmap

1. Host on HTTPS (GitHub Pages or Cloudflare Pages) so it works on a phone.
2. PWA: done (manifest, icons, network-first service worker that also works offline).
3. Vocalist mode: scrolling real-time pitch line while singing.
4. Band tools: done (bands with join codes, song pool, setlists that drive the metronome, free-time calendar, polls).
5. Later: wrap for the app stores if it takes off (Google Play about $25 one-time, Apple about $99/year).

## Firebase (band screens)

Project `kawaii-tuner` (console.firebase.google.com). The web config in `js/band-store.js` is public by design; `firestore.rules` is what keeps bands private.

- **Sign-in:** Security > Authentication > Sign-in method > Anonymous must be enabled.
- **Rules:** after changing `firestore.rules`, paste the whole file into Databases & Storage > Firestore > Rules and click Publish (or `firebase deploy --only firestore:rules` with the Firebase CLI).
- **Check it live:** `npm run check:firebase` tests the published rules (members allowed, outsiders refused) and runs the app with two phones against the real database. Each run leaves one small "Rules check" band behind.
- `npm test` never touches the real database: the browser test swaps in `tests/fake-firebase.mjs`.

## Notes for working on it with Claude

Plain ES modules, loaded by `<script type="module">` (another reason it has to be served, not opened as a file).

```
index.html            the page shell only; every screen builds its own markup
css/                  base.css (tokens, shared controls), shell.css (top bar, ☰ menu), one file per
                      screen (tuner, metronome, settings, band, plan), layout.css (small/sideways
                      phones), classic.css (the Kawaii-fy-off style)
manifest.webmanifest  home-screen app info
sw.js                 service worker: network first (fresh files after a deploy), offline fallback
js/main.js            entry point: language, theme, shell, screens, routing
js/version.js         build label shown in Settings; bump per deploy
js/app/               router.js (#/addresses, back button), shell.js (top bar + ☰ menu)
js/i18n/              i18n.js (t(), language choice) and one file per language (en.js, tr.js)
js/core/              pure logic, unit-tested in Node: yin, notes, pitch-tracker, metronome
                      engine, band (codes, input cleanup), plan (dates, overlaps, votes), settings
js/services/          the outside world: band-store (Firebase), mic, wake-lock
js/ui/                shared view helpers: html`` templates (escaped), icons, dom, controls, theme
js/views/tuner/       tuner screen, gauge with its cat, readout
js/views/metronome/   metronome screen, lucky cat, pendulum
js/views/band/        band-view (connection, setup, home, band menu) + one module per section:
                      songs, setlists (with the metronome's setlist bar), polls, calendar
js/views/settings/    the settings sheet
firestore.rules       who can read/write what; publish it in the Firebase console
scripts/              serve.mjs (local server), check-firebase.mjs (live check of rules + app)
tests/                unit.test.mjs (Node), smoke.test.mjs (headless Chrome), fake-firebase.mjs
icons/                app icons (icon.svg is the source design)
```

### How things fit together

- **A screen** is a module in `js/views/` that renders its markup with `html```, adds it to the page, and returns `{ id, el, head(route), show(route), hide() }`. `head()` gives the top bar its title, an optional back-arrow target and buttons. Register it in `js/main.js`, add a menu entry in `js/app/shell.js`, and it gets an address `#/<id>`.
- **Texts** never go in the code: write `t('area.key')` and add the key to `js/i18n/en.js` (and the other language files). The unit tests fail if a key is missing.
- **A language** is one more file in `js/i18n/` with the same keys (missing ones fall back to English), listed in `LANGS` in `js/i18n/i18n.js`. It then shows up under Settings > Language.
- **Pop-ups** (menu, settings, band dialogs) are native `<dialog>`s: Esc and the phone's back button close them, and focus stays inside.
- **Templates** escape everything put into them, so band names and song titles can't inject markup.

- Everything in `js/core/` and `js/i18n/` has no DOM dependencies, so the unit tests import it straight into Node.
- The app itself stays dependency-free; `puppeteer-core` is only for the tests.
- Why the service worker: GitHub Pages lets browsers reuse files for 10 minutes, so right after a deploy a phone could load new HTML with old CSS/JS (unstyled, dead buttons). `sw.js` always asks the server first.
