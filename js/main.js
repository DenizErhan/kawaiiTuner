/* Entry point: sets up both modes, the tab switch and the settings sheet. */
import { settings, setMode } from './settings.js';
import { createTuner } from './tuner.js';
import { createMetronomePanel } from './metronome-panel.js';
import { initSettingsPanel } from './settings-panel.js';

const tuner = createTuner();
const metronome = createMetronomePanel();
const app = document.getElementById('app');
const TABS = { tuner: 'tabTuner', metro: 'tabMetro' };
const VIEWS = { tuner: 'viewTuner', metro: 'viewMetro' };

function showMode(mode) {
  // only one runs at a time: the tuner's mic would hear the clicks
  if (mode === 'tuner') metronome.stop(); else tuner.stop();
  app.dataset.mode = mode;
  Object.keys(TABS).forEach((m) => {
    const tab = document.getElementById(TABS[m]);
    tab.setAttribute('aria-selected', String(m === mode));
    tab.tabIndex = m === mode ? 0 : -1;
    document.getElementById(VIEWS[m]).hidden = m !== mode;
  });
}

Object.keys(TABS).forEach((m) => {
  const tab = document.getElementById(TABS[m]);
  tab.addEventListener('click', () => { setMode(m); showMode(m); });
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = m === 'tuner' ? 'metro' : 'tuner';
    setMode(next); showMode(next);
    document.getElementById(TABS[next]).focus();
  });
});

initSettingsPanel({ onChange: tuner.rerender });
showMode(settings.mode);
