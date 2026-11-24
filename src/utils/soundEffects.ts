let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof globalThis === 'undefined') return null;
  const Ctx =
    globalThis.AudioContext ||
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  return sharedAudioCtx;
}

export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
}

/**
 * Synthesizes a subtle, crisp wooden chess-piece tap ("تكة") via Web Audio API
 * with zero external asset latency.
 */
export function playMoveTapSound(isCapture = false): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }

  const now = ctx.currentTime;

  // 1. Short damped woody thud (fundamental body resonance)
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(isCapture ? 240 : 195, now);
  osc.frequency.exponentialRampToValueAtTime(68, now + 0.045);

  oscGain.gain.setValueAtTime(0.001, now);
  oscGain.gain.linearRampToValueAtTime(isCapture ? 0.26 : 0.2, now + 0.004);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.06);

  // 2. Crisp surface contact transient (short filtered click)
  const bufferSize = Math.floor(ctx.sampleRate * 0.018);
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.28));
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(isCapture ? 1900 : 1450, now);
  filter.Q.setValueAtTime(2.2, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(isCapture ? 0.22 : 0.14, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
}
