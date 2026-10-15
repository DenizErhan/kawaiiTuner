/* Entry point: sets up the three tabs (tuner, metronome, band) and the settings sheet. */
import { settings, setMode } from './settings.js';
import { createTuner } from './tuner.js';
import { createMetronomePanel } from './metronome-panel.js';
import { createBandPanel } from './band-panel.js';
import { initSettingsPanel } from './settings-panel.js';
import { VERSION } from './version.js';

const tuner = createTuner();
const metronome = createMetronomePanel();
const band = createBandPanel({ metronome, openTab });
const app = document.getElementById('app');
const MODES = ['tuner', 'metro', 'band'];
const TABS = { tuner: 'tabTuner', metro: 'tabMetro', band: 'tabBand' };
const VIEWS = { tuner: 'viewTuner', metro: 'viewMetro', band: 'viewBand' };

function showMode(mode) {
  // only one runs at a time: the tuner's mic would hear the clicks
  if (mode !== 'metro') metronome.stop();
  if (mode !== 'tuner') tuner.stop();
  app.dataset.mode = mode;
  MODES.forEach((m) => {
    const tab = document.getElementById(TABS[m]);
    tab.setAttribute('aria-selected', String(m === mode));
    tab.tabIndex = m === mode ? 0 : -1;
    document.getElementById(VIEWS[m]).hidden = m !== mode;
  });
  if (mode === 'band') band.show();
}
function openTab(m) { setMode(m); showMode(m); }

MODES.forEach((m, i) => {
  const tab = document.getElementById(TABS[m]);
  tab.addEventListener('click', () => openTab(m));
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = MODES[(i + (e.key === 'ArrowRight' ? 1 : MODES.length - 1)) % MODES.length];
    openTab(next);
    document.getElementById(TABS[next]).focus();
  });
});

initSettingsPanel({ onChange: () => { tuner.rerender(); band.rerender(); } });
if (band.invited) setMode('band'); // opened from an invite link
showMode(settings.mode);
document.getElementById('version').textContent = 'Version ' + VERSION;

// network-first service worker: fresh files after each deploy, works offline
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
