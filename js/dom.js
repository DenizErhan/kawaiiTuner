/* Small DOM helpers shared by the band panels. */
import { settings } from './settings.js';

export const $ = (id) => document.getElementById(id);

const ICONS = {
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  remove: 'M6 6l12 12M18 6L6 18',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name]);
  svg.appendChild(p);
  return svg;
}
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
export function iconBtn(name, label, data) {
  const b = el('button', 'row-icon');
  b.type = 'button';
  b.setAttribute('aria-label', label);
  Object.assign(b.dataset, data);
  b.appendChild(icon(name));
  return b;
}
/** The "nothing here yet" line of a list. */
export function empty(ul, text) {
  ul.appendChild(el('li', 'empty', text + (settings.kawaii ? ' 🐾' : '')));
}
