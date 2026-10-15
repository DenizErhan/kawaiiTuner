/* Line icons on a 24px grid, drawn with the text color. */
import { trusted } from './html.js';

const PATHS = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6L6 18',
  tuner: 'M4 17a8 8 0 0 1 16 0M12 17l4.5-5.5M12 17h.01',
  metronome: 'M7.5 21h9L14 4h-4zM12 15l5.5-7',
  band: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.5-3.3 3.2-5.5 6.5-5.5s6 2.2 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.7.8 2.8 2.5 3 5.2',
  home: 'M4 11l8-7 8 7M6 9.5V20h12V9.5',
  songs: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  setlists: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  calendar: 'M4 6h16v14H4zM4 10.5h16M8.5 3v5M15.5 3v5',
  polls: 'M5 20v-8M12 20V5M19 20v-5',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM9 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v6h14v-6',
  check: 'M5 12.5l4.5 4.5L19 7',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  remove: 'M6 6l12 12M18 6L6 18',
};

/** An inline <svg> for html`` templates. */
export function icon(name, size = 22) {
  return trusted(`<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`);
}

/** The cat paw on the Start buttons (filled, not a line icon). */
export const PAW = trusted('<svg class="paw" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
  + '<ellipse cx="6" cy="10" rx="2.2" ry="2.8"/><ellipse cx="10" cy="6" rx="2.2" ry="2.8"/><ellipse cx="14" cy="6" rx="2.2" ry="2.8"/><ellipse cx="18" cy="10" rx="2.2" ry="2.8"/>'
  + '<path d="M12 11c-3.3 0-6 3.2-6 5.6 0 1.8 1.4 2.6 2.9 2.2 1.1-.3 2-.8 3.1-.8s2 .5 3.1.8c1.5.4 2.9-.4 2.9-2.2 0-2.4-2.7-5.6-6-5.6z"/></svg>');
