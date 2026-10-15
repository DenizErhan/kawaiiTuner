/* Entry point: picks the language, applies the theme, builds the frame and
   the screens, and shows the screen for the address after the #. */
import { settings, setMode } from './core/settings.js';
import { setLang, pickLang, getLang, t } from './i18n/i18n.js';
import { applyTheme } from './ui/theme.js';
import { createShell } from './app/shell.js';
import { onRoute, start, go, path } from './app/router.js';
import { createTunerView } from './views/tuner/tuner-view.js';
import { createMetronomeView } from './views/metronome/metronome-view.js';
import { createBandView } from './views/band/band-view.js';
import { createSettingsSheet } from './views/settings/settings-sheet.js';

setLang(pickLang(settings.lang));
document.documentElement.lang = getLang();
document.title = t('app.name');
document.querySelector('meta[name="description"]').setAttribute('content', t('app.description'));
applyTheme();

const sheet = createSettingsSheet({ onChange: () => { tuner.rerender(); band.rerender(); } });
const shell = createShell(document.getElementById('app'), { openSettings: () => sheet.open() });
const tuner = createTunerView(shell.views);
const metronome = createMetronomeView(shell.views);
const band = createBandView(shell.views, { metronome, shell });
const views = { tuner, metronome, band };

onRoute((r) => {
  const view = views[r.view];
  if (!view) { go(path(settings.mode), { replace: true }); return; } // no or unknown address: the last screen used
  setMode(view.id);
  shell.show(view, r);
});
if (band.invited) history.replaceState(null, '', path('band')); // opened from an invite link
start();

// network-first service worker: fresh files after each deploy, works offline
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
