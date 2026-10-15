/* Pitch detection: YIN (de Cheveigne & Kawahara, 2002).
   Pure function, no DOM or audio APIs, so it can be tested on its own. */

export function yin(buf, sampleRate) {
  const N = buf.length;
  const W = N >> 1;
  const tauMin = Math.max(2, Math.floor(sampleRate / 2100)); // highest pitch ~2.1 kHz
  const tauMax = Math.min(W - 1, Math.floor(sampleRate / 30)); // lowest pitch ~30 Hz
  const d = new Float64Array(tauMax + 2);

  // 1) difference function, 2) cumulative mean normalised difference
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    running += s;
    d[tau] = running > 0 ? (s * tau) / running : 1;
  }

  // 3) absolute threshold: first dip below it, followed down to its local minimum
  const THRESH = 0.15;
  let tauEst = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (d[tau] < THRESH) {
      while (tau + 1 <= tauMax && d[tau + 1] < d[tau]) tau++;
      tauEst = tau;
      break;
    }
  }
  if (tauEst < 0) {
    // no dip below threshold: accept the deepest one only if it is still fairly clear
    let best = tauMin;
    for (let tau = tauMin + 1; tau <= tauMax; tau++) if (d[tau] < d[best]) best = tau;
    if (d[best] > 0.3) return null;
    tauEst = best;
  }

  // 4) parabolic interpolation for sub-sample accuracy
  let t = tauEst;
  if (tauEst > 1) {
    const a = d[tauEst - 1], b = d[tauEst], c = d[tauEst + 1];
    const den = a + c - 2 * b;
    if (den !== 0) t = tauEst + (a - c) / (2 * den);
  }
  return { freq: sampleRate / t, clarity: 1 - d[tauEst] };
}
