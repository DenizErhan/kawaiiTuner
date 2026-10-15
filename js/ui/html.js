/* Markup from template strings. html`<p>${text}</p>` escapes everything put
   into it, so band names, song titles and translations can't break the page;
   only other html`` results (and icon()) go in as markup. */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

class Markup {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
/** Markup we wrote ourselves (icons), passed through unescaped. */
export const trusted = (s) => new Markup(s);

function value(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(value).join('');
  if (v instanceof Markup) return v.s;
  return String(v).replace(/[&<>"']/g, (c) => ESC[c]);
}

export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += value(v) + strings[i + 1]; });
  return new Markup(out);
}

/** html`` -> its first element, ready to insert. */
export function render(markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(markup).trim();
  return tpl.content.firstElementChild;
}
