# Tuner

A cute tuner and metronome for musicians that runs in the browser. Plain HTML/JS, no build step, no dependencies.

## Run it

The microphone only works on HTTPS or localhost, so don't double-click a file path in some browsers; serve it:

- VS Code: install the **Live Server** extension, right-click `index.html`, **Open with Live Server**.
- Or: `npx serve .` in this folder, then open the localhost address.

Allow the microphone, press Start, play or sing a note.

## What's in it

- Pitch detection with the YIN algorithm (`js/yin.js`), about 30 Hz to 2 kHz.
- Note name, octave, cents sharp/flat, frequency, target frequency.
- Needle gauge with a cat on the pivot: asleep when stopped, eyes follow the needle, hops and blushes when you're in tune (within about 5 cents).
- Kawaii themes: Midnight Neko, Strawberry Milk, Matcha Mochi, Sakura Night, Boba Tea, Sea Kitty, plus a Custom theme (edit any color, the kitty included, and pick a background pattern: paws, hearts, stars, petals, bubbles, fish).
- Made for phones: portrait and landscape layouts, safe areas (notch), no double-tap zoom, swipe the settings sheet down to close, hold +/- to step quickly, screen stays on while tuning, add to home screen (web manifest + icons).
- Reference pitch A4 (400-480 Hz; double-tap the value to reset to 440).
- Note names: C D E or Do Re Mi.
- Metronome (second tab): 30-250 BPM with tempo names, slider and hold-to-repeat +/-, 1-12 beats per bar with an accented first beat, tap tempo. Clicks are scheduled on the Web Audio clock, so timing stays exact. A Maneki Neko beckons on every beat, sways, and jingles its bell on beat 1.
- Only one mode runs at a time, so the tuner never hears the clicks.
- Settings saved in the browser (localStorage), including the open tab and the tempo.

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
2. PWA: offline support (service worker). Manifest and icons are done.
3. Vocalist mode: scrolling real-time pitch line while singing.
4. Band tools: members, setlists, per-song tempos for the metronome.
5. Later: wrap for the app stores if it takes off (Google Play about $25 one-time, Apple about $99/year).

## Notes for working on it with Claude

Plain ES modules, loaded by `<script type="module">` (another reason it has to be served, not opened as a file).

```
index.html            markup only
css/styles.css        all styles, background patterns, cat expressions, phone layouts
manifest.webmanifest  home-screen app info
icons/                app icons (icon.svg is the source design)
js/main.js            entry point: tabs, sets up both modes and settings
js/tuner.js           tuner mode: mic -> pitch tracker -> gauge + readout
js/metronome.js       metronome engine: look-ahead click scheduling (pure Web Audio)
js/metronome-panel.js metronome mode UI: tempo, beats, tap tempo
js/maneki.js          the lucky cat SVG and its beat-synced pose
js/ui.js              shared touch helpers (hold-to-repeat, double-tap)
js/yin.js             YIN pitch detector (pure function)
js/notes.js           frequency -> note, octave, cents (pure)
js/pitch-tracker.js   noise gate + YIN + median smoothing + hold
js/mic.js             microphone / Web Audio capture (iOS-safe start)
js/gauge.js           SVG gauge, needle animation, the cat
js/display.js         note, cents, frequency, status, level meter
js/settings.js        themes + settings, localStorage
js/theme.js           applies theme colors + pattern, mixes derived colors
js/settings-panel.js  the settings sheet UI
js/wake-lock.js       keeps the screen on while tuning
```

- `yin.js`, `notes.js` and `pitch-tracker.js` have no DOM dependencies and can be imported straight into Node (`package.json` only sets `"type": "module"`).
- Keep it dependency-free until there is a reason not to.
