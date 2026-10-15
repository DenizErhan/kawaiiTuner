/* Small touch-friendly control helpers shared by the panels. */

/** Tap to step once; press and hold to keep stepping. */
export function holdToRepeat(btn, fn) {
  let timer = 0;
  const stopRepeat = () => { clearTimeout(timer); timer = 0; };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    fn();
    const repeat = (delay) => { timer = setTimeout(() => { fn(); repeat(70); }, delay); };
    repeat(400);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stopRepeat));
  btn.addEventListener('click', (e) => { if (e.detail === 0) fn(); }); // keyboard activation
}

/** dblclick isn't reliable on touch screens, so time the taps ourselves. */
export function onDoubleTap(el, fn) {
  let last = 0;
  el.addEventListener('pointerup', () => {
    const now = Date.now();
    if (now - last < 350) { last = 0; fn(); } else last = now;
  });
}
