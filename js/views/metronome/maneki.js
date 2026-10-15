/* Maneki Neko (lucky cat) drawn in SVG. setPose() is called every frame with
   the metronome's beat position: the raised paw beckons down on each beat,
   the body sways left/right, and the bell jingles on the first beat of the bar.
   Its expression (asleep / happy) comes from CSS via [data-run] on the view. */

const NS = 'http://www.w3.org/2000/svg';
const ELBOW = [80, 168], WRIST = [57, 104], BASE = [120, 242], BELL_TOP = [120, 143];

function el(name, attrs, parent) {
  const e = document.createElementNS(NS, name);
  Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
  parent.appendChild(e);
  return e;
}

export function createManeki(svg) {
  const body = el('g', { class: 'mk-body' }, svg);
  el('path', { class: 'mk-tail', d: 'M166 212C204 210 210 172 190 158' }, body);
  el('ellipse', { class: 'mk-fur', cx: 92, cy: 233, rx: 17, ry: 9 }, body);
  el('ellipse', { class: 'mk-fur', cx: 148, cy: 233, rx: 17, ry: 9 }, body);
  el('ellipse', { class: 'mk-fur', cx: 120, cy: 186, rx: 58, ry: 52 }, body);

  // koban coin, held by the lower paw
  const coin = el('g', {}, body);
  el('ellipse', { class: 'mk-gold', cx: 152, cy: 188, rx: 19, ry: 27 }, coin);
  el('ellipse', { class: 'mk-gold-line', cx: 152, cy: 188, rx: 14, ry: 21 }, coin);
  el('text', { class: 'mk-coin-text', x: 152, y: 189 }, coin).textContent = '福';
  el('ellipse', { class: 'mk-fur', cx: 138, cy: 207, rx: 14, ry: 11 }, body);
  const sparkle = el('text', { class: 'mk-sparkle', x: 178, y: 160 }, body);
  sparkle.textContent = '✦';

  // raised, beckoning arm (drawn before the head so the head overlaps it)
  const arm = el('g', {}, body);
  el('line', { class: 'mk-arm', x1: ELBOW[0], y1: ELBOW[1], x2: WRIST[0], y2: WRIST[1] }, arm);
  const paw = el('g', {}, arm);
  el('circle', { class: 'mk-fur', cx: 55, cy: 88, r: 18 }, paw);
  el('ellipse', { class: 'mk-pink', cx: 55, cy: 93, rx: 7, ry: 5.5 }, paw);
  [[45, 81], [55, 77], [65, 81]].forEach(([cx, cy]) => el('circle', { class: 'mk-pink', cx, cy, r: 3.4 }, paw));

  // head
  el('path', { class: 'mk-fur', d: 'M74 80L71 38L105 60Z' }, body);
  el('path', { class: 'mk-fur', d: 'M166 80L169 38L135 60Z' }, body);
  el('path', { class: 'mk-pink', d: 'M79 70L77.5 48L97 61Z' }, body);
  el('path', { class: 'mk-pink', d: 'M161 70L162.5 48L143 61Z' }, body);
  [[110, 106, 48, 101], [116, 114, 50, 120]].forEach(([y0, y1, x, y]) => {
    el('line', { class: 'mk-whisker', x1: 72, y1: y0, x2: x, y2: y }, body);
    el('line', { class: 'mk-whisker', x1: 168, y1: y0, x2: 240 - x, y2: y }, body);
  });
  el('ellipse', { class: 'mk-fur', cx: 120, cy: 100, rx: 56, ry: 46 }, body);

  const happy = el('g', { class: 'mk-eyes-happy' }, body);
  el('path', { class: 'mk-line', d: 'M89 103Q98 92 107 103' }, happy);
  el('path', { class: 'mk-line', d: 'M133 103Q142 92 151 103' }, happy);
  const sleep = el('g', { class: 'mk-eyes-sleep' }, body);
  el('path', { class: 'mk-line', d: 'M89 99Q98 107 107 99' }, sleep);
  el('path', { class: 'mk-line', d: 'M133 99Q142 107 151 99' }, sleep);
  el('ellipse', { class: 'mk-blush', cx: 84, cy: 115, rx: 8, ry: 4.5 }, body);
  el('ellipse', { class: 'mk-blush', cx: 156, cy: 115, rx: 8, ry: 4.5 }, body);
  el('path', { class: 'mk-pink', d: 'M115.5 111L124.5 111L120 115.5Z' }, body);
  el('path', { class: 'mk-line', d: 'M111 119Q115.5 124.5 120 119Q124.5 124.5 129 119' }, body);

  // collar and bell
  el('path', { class: 'mk-collar', d: 'M80 137Q120 157 160 137' }, body);
  const bell = el('g', {}, body);
  el('circle', { class: 'mk-gold', cx: 120, cy: 153, r: 9 }, bell);
  el('path', { class: 'mk-gold-line', d: 'M120 155.5V161M113 152H127' }, bell);

  el('text', { class: 'mk-zzz', x: 172, y: 52, 'font-size': 18 }, svg).textContent = 'z';
  el('text', { class: 'mk-zzz', x: 186, y: 34, 'font-size': 13 }, svg).textContent = 'z';

  let accentAt = -1e9;
  const rot = (deg, [x, y]) => 'rotate(' + deg.toFixed(2) + ' ' + x + ' ' + y + ')';

  return {
    /** Mark beat 1 so the bell jingles and the coin sparkles. */
    accent() { accentAt = performance.now(); },

    /** pos: continuous beat position from the metronome, or null when stopped. */
    setPose(pos) {
      const p = pos === null ? 0.5 : pos;
      const k = pos === null ? 0 : 1 - Math.abs(Math.sin(Math.PI * p)); // 1 = paw down, sharp on the beat
      const sway = pos === null ? 0 : 2.5 * Math.cos(Math.PI * p);
      body.setAttribute('transform', rot(sway, BASE));
      arm.setAttribute('transform', rot(9 * k, ELBOW));
      // fold the paw forward at the wrist: tilt it and foreshorten it
      paw.setAttribute('transform', 'translate(' + WRIST[0] + ' ' + WRIST[1] + ') rotate(' + (24 * k).toFixed(2) + ') scale(1 ' + (1 - 0.3 * k).toFixed(3) + ') translate(' + -WRIST[0] + ' ' + -WRIST[1] + ')');

      const t = (performance.now() - accentAt) / 1000;
      const ring = t < 1 ? 22 * Math.exp(-t / 0.18) * Math.sin(t * 45) : 0;
      bell.setAttribute('transform', rot(ring, BELL_TOP));
      sparkle.style.opacity = t < 1 ? Math.exp(-t / 0.25).toFixed(3) : 0;
    },
  };
}
