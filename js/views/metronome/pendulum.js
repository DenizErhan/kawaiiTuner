/* Classic-style metronome figure: a wooden pyramid metronome whose arm swings
   to the beat (reaching each side exactly on a click, like the real thing).
   Its sliding weight sits higher for slow tempos and lower for fast ones. */

const NS = 'http://www.w3.org/2000/svg';
const PIVOT = [120, 206];
const SWING_DEG = 24;
const WEIGHT_TOP = 62, WEIGHT_BOTTOM = 150; // weight y at 30 and 250 BPM

function el(name, attrs, parent) {
  const e = document.createElementNS(NS, name);
  Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
  parent.appendChild(e);
  return e;
}

export function createPendulum(svg, { minBpm = 30, maxBpm = 250 } = {}) {
  el('path', { class: 'pd-case', d: 'M66 236L98 20H142L174 236Z' }, svg);
  el('path', { class: 'pd-face', d: 'M90 196L106 34H134L150 196Z' }, svg);
  for (let i = 0; i <= 12; i++) {
    const y = 44 + i * 12, half = 6 + (i % 2 ? 0 : 4);
    el('line', { class: 'pd-tick', x1: 120 - half, y1: y, x2: 120 + half, y2: y }, svg);
  }
  el('rect', { class: 'pd-base', x: 56, y: 230, width: 128, height: 14, rx: 4 }, svg);
  const lamp = el('circle', { class: 'pd-lamp', cx: 120, cy: 12, r: 6 }, svg);

  const arm = el('g', {}, svg);
  el('line', { class: 'pd-arm', x1: PIVOT[0], y1: PIVOT[1], x2: PIVOT[0], y2: 30 }, arm);
  const weight = el('path', { class: 'pd-weight', d: '' }, arm);
  el('circle', { class: 'pd-pivot', cx: PIVOT[0], cy: PIVOT[1], r: 7 }, svg);

  let accentAt = -1e9;

  return {
    accent() { accentAt = performance.now(); },

    /** pos: continuous beat position from the metronome, or null when stopped. */
    setPose(pos, bpm) {
      const angle = pos === null ? 0 : SWING_DEG * Math.cos(Math.PI * pos);
      arm.setAttribute('transform', 'rotate(' + angle.toFixed(2) + ' ' + PIVOT[0] + ' ' + PIVOT[1] + ')');
      const t = Math.min(1, Math.max(0, (bpm - minBpm) / (maxBpm - minBpm)));
      const y = WEIGHT_TOP + (WEIGHT_BOTTOM - WEIGHT_TOP) * t;
      weight.setAttribute('d', 'M108 ' + y + 'H132L128 ' + (y + 18) + 'H112Z');
      const since = (performance.now() - accentAt) / 1000;
      lamp.style.opacity = since < 1 ? (0.25 + 0.75 * Math.exp(-since / 0.2)).toFixed(3) : 0.25;
    },
  };
}
