/* Microphone capture. openMic() resolves to a small handle for reading
   time-domain buffers; it throws MicError with a reason on failure.
   Call it straight from a tap handler: the AudioContext is created before the
   first await, because iOS Safari only lets audio start inside a user gesture. */

const FFT = 4096;

export class MicError extends Error {
  constructor(reason) { super(reason); this.reason = reason; } // 'insecure' | 'denied' | 'failed'
}

const closeCtx = (ctx) => { try { ctx.close().catch(() => {}); } catch (e) { /* ignore */ } };

export async function openMic({ onEnded } = {}) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new MicError('insecure');
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const resumed = ctx.resume().catch(() => {});

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    closeCtx(ctx);
    const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
    throw new MicError(denied ? 'denied' : 'failed');
  }
  await resumed;
  if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) { /* ignore */ } }

  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT;
  analyser.smoothingTimeConstant = 0;
  src.connect(analyser); // deliberately not connected to the speakers (no feedback)
  const buf = new Float32Array(analyser.fftSize);

  // e.g. a phone call takes the mic, or permission is revoked
  if (onEnded) stream.getAudioTracks().forEach((t) => t.addEventListener('ended', onEnded));

  return {
    sampleRate: ctx.sampleRate,
    read() { analyser.getFloatTimeDomainData(buf); return buf; },
    suspend() { ctx.suspend().catch(() => {}); },
    resume() { ctx.resume().catch(() => {}); }, // also recovers iOS's 'interrupted' state
    close() {
      stream.getTracks().forEach((t) => t.stop());
      closeCtx(ctx);
    },
  };
}
