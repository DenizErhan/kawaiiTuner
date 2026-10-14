/* Pushes the current theme into CSS custom properties. Derived colors are
   mixed here rather than with CSS color-mix(), which older iOS lacks. */
import { COLOR_KEYS, currentTheme, settings } from './settings.js';

function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
/** a weighted by t, b by 1 - t */
function mix(a, b, t) {
  const x = rgb(a), y = rgb(b);
  return '#' + x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
}

export function applyTheme() {
  const c = currentTheme();
  const root = document.documentElement;
  COLOR_KEYS.forEach(([k]) => root.style.setProperty('--' + k, c[k]));
  root.style.setProperty('--muted', mix(c.text, c.bg, 0.52));
  root.style.setProperty('--line', mix(c.text, c.bg, 0.14));
  root.style.setProperty('--surface2', mix(c.text, c.surface, 0.08));
  root.style.setProperty('--accent-deep', mix(c.accent, '#000000', 0.75));
  root.style.setProperty('--glow', c.good + '8c'); // ~55% alpha
  root.dataset.deco = c.deco;
  root.dataset.style = settings.kawaii ? 'kawaii' : 'classic'; // CSS hangs the cats, patterns etc. off this
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', c.bg);
}
