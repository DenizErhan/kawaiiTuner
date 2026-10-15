/* Metronome engine. Clicks are scheduled slightly ahead on the Web Audio clock
   ("A Tale of Two Clocks"), so timing stays exact even when the main thread is
   busy. The scheduler ticks from a Worker, whose timers aren't throttled like
   the page's when the tab is in the background. */

const LOOKAHEAD_S = 0.12;  // schedule this far ahead
const TICK_MS = 25;        // how often the scheduler wakes up

function createTicker(fn) {
  try {
    const src = 'let t=0;onmessage=(e)=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data);};';
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = fn;
    return { start: () => w.postMessage(TICK_MS), stop: () => w.postMessage(0) };
  } catch (e) {
    let t = 0; // no Worker support: fall back to the page's own timer
    return { start: () => { clearInterval(t); t = setInterval(fn, TICK_MS); }, stop: () => clearInterval(t) };
  }
}

/** A short, round "pop"; the accent is higher with a little bell overtone. */
function playClick(ctx, out, time, accent) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  const f = accent ? 1568 : 1046.5; // G6 / C6
  o.type = 'sine';
  o.frequency.setValueAtTime(f * 1.5, time);
  o.frequency.exponentialRampToValueAtTime(f, time + 0.012);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(1, time + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, time + (accent ? 0.14 : 0.07));
  o.connect(g).connect(out);
  o.start(time);
  o.stop(time + 0.16);
  if (accent) {
    const b = ctx.createOscillator(), bg = ctx.createGain();
    b.type = 'triangle';
    b.frequency.setValueAtTime(f * 2.01, time);
    bg.gain.setValueAtTime(0.0001, time);
    bg.gain.exponentialRampToValueAtTime(0.35, time + 0.003);
    bg.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
    b.connect(bg).connect(out);
    b.start(time);
    b.stop(time + 0.26);
  }
}

export function createMetronome({ bpm = 100, beats = 4, onBeat = () => {} } = {}) {
  let ctx = null, out = null;
  let running = false;
  let nextTime = 0, nextBeat = 0, count = 0;
  let queue = [];   // scheduled beats not yet shown: { time, beat, n }
  let shown = null; // the last beat that has been heard
  const ticker = createTicker(schedule);

  const secPerBeat = () => 60 / bpm;
  // what the listener hears now (output latency matters on Bluetooth headphones)
  const heardTime = () => ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);

  function schedule() {
    if (!running) return;
    while (nextTime < ctx.currentTime + LOOKAHEAD_S) {
      playClick(ctx, out, nextTime, beats > 1 && nextBeat === 0);
      queue.push({ time: nextTime, beat: nextBeat, n: count++ });
      nextTime += secPerBeat();
      nextBeat = (nextBeat + 1) % beats;
    }
  }

  return {
    get running() { return running; },
    get bpm() { return bpm; },

    /** Must be called from a tap, so iOS lets the audio start. */
    start() {
      if (running) return;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        out = ctx.createGain();
        out.gain.value = 0.8;
        out.connect(ctx.destination);
      }
      // play through the iOS silent switch (Safari 17+)
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
      ctx.resume().catch(() => {});
      running = true;
      nextTime = ctx.currentTime + 0.06;
      nextBeat = 0; count = 0; queue = []; shown = null;
      schedule();
      ticker.start();
    },

    stop() {
      if (!running) return;
      running = false;
      ticker.stop();
      queue = []; shown = null;
      // let the last click ring out, then let the audio hardware sleep
      const c = ctx;
      setTimeout(() => { if (!running) c.suspend().catch(() => {}); }, 300);
    },

    /** Recover after the page comes back (e.g. iOS 'interrupted' state). */
    resume() { if (running && ctx) ctx.resume().catch(() => {}); },

    setBpm(v) { bpm = v; },
    setBeats(v) { beats = v; if (nextBeat >= beats) nextBeat = 0; },

    /**
     * Call once per animation frame. Fires onBeat for beats that are now
     * audible and returns the continuous beat position (2.5 = halfway between
     * the 3rd and 4th beat), or null when stopped.
     */
    frame() {
      if (!running) return null;
      const now = heardTime();
      while (queue.length && queue[0].time <= now) {
        shown = queue.shift();
        onBeat(shown.beat);
      }
      if (!shown) return 0;
      return shown.n + Math.min(1, (now - shown.time) / secPerBeat());
    },
  };
}

/** Classic Italian tempo markings, for the label under the BPM. */
export function tempoName(bpm) {
  const names = [[60, 'Largo'], [66, 'Larghetto'], [76, 'Adagio'], [108, 'Andante'], [120, 'Moderato'], [168, 'Allegro'], [200, 'Presto']];
  for (const [max, name] of names) if (bpm < max) return name;
  return 'Prestissimo';
}
