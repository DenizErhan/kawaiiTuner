/* Small DOM helpers shared by the views. */
import { settings } from '../core/settings.js';
import { icon } from './icons.js';
import { html, render } from './html.js';

export const $ = (id) => document.getElementById(id);

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** A small icon-only button for list rows; data goes into data-* attributes. */
export function iconBtn(name, label, data) {
  const b = render(html`<button type="button" class="row-icon" aria-label="${label}">${icon(name, 18)}</button>`);
  Object.assign(b.dataset, data);
  return b;
}

/** The "nothing here yet" line of a list. */
export function empty(ul, text) {
  ul.appendChild(el('li', 'empty', text + (settings.kawaii ? ' 🐾' : '')));
}

/** Tapping the dimmed area around a modal <dialog> closes it. */
export function closeOnBackdrop(dialog) {
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
}
