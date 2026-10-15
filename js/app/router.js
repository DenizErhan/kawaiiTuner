/* Every screen has an address after the #: #/tuner, #/band/setlists/<id>.
   So the phone's back button, reloads and shared links all land on the right
   screen. A route is { view, sub, id }. */

export function parse(hash = location.hash) {
  const [view = '', sub = '', id = ''] = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { view, sub, id };
}

/** ('band', 'setlists', 'abc') -> '#/band/setlists/abc' */
export const path = (...parts) => '#/' + parts.filter(Boolean).map(encodeURIComponent).join('/');

const listeners = [];
const visited = []; // addresses in this tab's history, as far as we can tell
export function onRoute(fn) { listeners.push(fn); }

function emit() {
  if (visited[visited.length - 2] === location.hash) visited.pop(); // went back
  else if (visited[visited.length - 1] !== location.hash) visited.push(location.hash);
  const r = parse();
  listeners.forEach((fn) => fn(r));
}
addEventListener('hashchange', emit);

/** Opens a screen. replace: swap the current history entry instead of adding
    one (for redirects, so back doesn't bounce into them again). */
export function go(to, { replace = false } = {}) {
  if (location.hash === to) return;
  if (replace) {
    history.replaceState(history.state, '', to);
    visited.pop();
    emit();
  } else location.hash = to;
}

/** The header's back arrow: a real "back" when we came from `parent`, so the
    history doesn't pile up; otherwise straight to `parent`. */
export function up(parent) {
  if (visited[visited.length - 2] === parent) history.back();
  else go(parent, { replace: true });
}

/** Runs the listeners for the current address (call once at start). */
export const start = emit;
