/* SVG needle gauge, -50..+50 cents, with a cat sitting on the pivot (kawaii style)
   or a plain hub (classic style; CSS shows one or the other).
   Owns its own needle animation: call setCents() and the needle glides there.
   The cat's expression is driven by CSS from the .app state (sleeping, awake, in tune). */

const CX = 150, CY = 170, R = 130;
const MAX_CENTS = 50;
const DEG_PER_CENT = 1.2; // +-50 cents = +-60 degrees
const SMOOTH_MS = 70;     // needle easing time constant
const NS = 'http://www.w3.org/2000/svg';
const pt = (deg, r) => [CX + r * Math.sin(deg * Math.PI / 180), CY - r * Math.cos(deg * Math.PI / 180)];
const HEART = 'M0 4C-7-1-6-8-2.5-8-1-8 0-7 0-6 0-7 1-8 2.5-8 6-8 7-1 0 4z';

function svgEl(name, attrs, parent) {
  const e = document.createElementNS(NS, name);
  Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
  parent.appendChild(e);
  return e;
}
function arcPath(a0, a1, r) {
  const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
  return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A' + r + ' ' + r + ' 0 0 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
}

/** Draws the cat centred on (0,0); returns the pupils group so the eyes can follow the needle. */
function buildCat(parent) {
  const body = svgEl('g', { class: 'cat-body' }, parent);
  svgEl('path', { class: 'cat-fur', d: 'M-19 -6L-15 -27L-3 -17Z' }, body);
  svgEl('path', { class: 'cat-fur', d: 'M19 -6L15 -27L3 -17Z' }, body);
  svgEl('path', { class: 'cat-pink', d: 'M-15.5 -10L-13.5 -21.5L-7 -15.5Z' }, body);
  svgEl('path', { class: 'cat-pink', d: 'M15.5 -10L13.5 -21.5L7 -15.5Z' }, body);
  [[2, 0], [5.5, 6]].forEach(([y0, y1]) => {
    svgEl('line', { class: 'whisker', x1: -16, y1: y0, x2: -29, y2: y1 - 1 }, body);
    svgEl('line', { class: 'whisker', x1: 16, y1: y0, x2: 29, y2: y1 - 1 }, body);
  });
  svgEl('ellipse', { class: 'cat-fur', cx: 0, cy: 0, rx: 22, ry: 17.5 }, body);

  const open = svgEl('g', { class: 'eyes-open' }, body);
  const pupils = svgEl('g', {}, open);
  [-8, 8].forEach((x) => {
    svgEl('circle', { class: 'cat-ink', cx: x, cy: -2, r: 3.4 }, pupils);
    svgEl('circle', { class: 'cat-shine', cx: x + 1.1, cy: -3.2, r: 1.1 }, pupils);
  });
  const sleep = svgEl('g', { class: 'eyes-sleep' }, body);
  svgEl('path', { class: 'cat-line', d: 'M-11.5 -2Q-8 1.5 -4.5 -2' }, sleep);
  svgEl('path', { class: 'cat-line', d: 'M4.5 -2Q8 1.5 11.5 -2' }, sleep);
  const happy = svgEl('g', { class: 'eyes-happy' }, body);
  svgEl('path', { class: 'cat-line', d: 'M-11.5 0Q-8 -5 -4.5 0' }, happy);
  svgEl('path', { class: 'cat-line', d: 'M4.5 0Q8 -5 11.5 0' }, happy);

  svgEl('ellipse', { class: 'blush', cx: -14, cy: 5, rx: 3.6, ry: 2.1 }, body);
  svgEl('ellipse', { class: 'blush', cx: 14, cy: 5, rx: 3.6, ry: 2.1 }, body);
  svgEl('path', { class: 'cat-pink', d: 'M-2 3L2 3L0 5.2Z' }, body);
  svgEl('path', { class: 'cat-line', d: 'M-4.5 6.2Q-2.2 9 0 6.2Q2.2 9 4.5 6.2' }, body);

  svgEl('text', { class: 'zzz', x: 24, y: -24, 'font-size': 11 }, parent).textContent = 'z';
  svgEl('text', { class: 'zzz', x: 32, y: -35, 'font-size': 8 }, parent).textContent = 'z';
  return pupils;
}

export function createGauge(svg, { zoneCents = 5 } = {}) {
  const half = MAX_CENTS * DEG_PER_CENT;
  svgEl('path', { class: 'arc', d: arcPath(-half, half, R) }, svg);
  svgEl('path', { class: 'zone', d: arcPath(-zoneCents * DEG_PER_CENT, zoneCents * DEG_PER_CENT, R - 4) }, svg);
  for (let c = -MAX_CENTS; c <= MAX_CENTS; c += 5) {
    const major = c % 10 === 0;
    const len = c === 0 ? 24 : major ? 15 : 8;
    const [x0, y0] = pt(c * DEG_PER_CENT, R - 14);
    const [x1, y1] = pt(c * DEG_PER_CENT, R - 14 - len);
    svgEl('line', { class: 'tick' + (c === 0 ? ' zero' : ''), x1: x0, y1: y0, x2: x1, y2: y1 }, svg);
  }
  [-50, -25, 0, 25, 50].forEach((c) => {
    const [x, y] = pt(c * DEG_PER_CENT, R + 17);
    const t = svgEl('text', { x, y }, svg);
    t.textContent = c > 0 ? '+' + c : String(c);
  });
  const needle = svgEl('g', { id: 'needle' }, svg);
  svgEl('line', { class: 'needle-line', x1: CX, y1: CY, x2: CX, y2: CY - 112 }, needle);
  svgEl('path', { class: 'needle-tip', d: HEART, transform: 'translate(' + CX + ' ' + (CY - 115) + ') scale(1.5)' }, needle);
  svgEl('circle', { class: 'hub', cx: CX, cy: CY, r: 9 }, needle); // classic style; the cat covers it in kawaii
  const pupils = buildCat(svgEl('g', { class: 'cat', transform: 'translate(' + CX + ' ' + CY + ')' }, svg));

  let deg = 0, target = 0, raf = 0, lastFrame = 0;
  function draw() {
    needle.setAttribute('transform', 'rotate(' + deg.toFixed(2) + ' ' + CX + ' ' + CY + ')');
    pupils.setAttribute('transform', 'translate(' + (deg / half * 2.4).toFixed(2) + ' 0)'); // eyes follow the needle
  }

  function frame(ts) {
    const dt = Math.min(100, ts - (lastFrame || ts));
    lastFrame = ts;
    deg += (target - deg) * (1 - Math.exp(-dt / SMOOTH_MS));
    if (Math.abs(target - deg) < 0.01) { deg = target; raf = 0; lastFrame = 0; }
    else raf = requestAnimationFrame(frame);
    draw();
  }

  draw();
  return {
    setCents(c) {
      target = Math.max(-MAX_CENTS, Math.min(MAX_CENTS, c)) * DEG_PER_CENT;
      if (!raf) raf = requestAnimationFrame(frame);
    },
  };
}
