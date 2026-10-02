/**
 * The arithmetic and text handling behind voice input, kept out of the
 * component so it can be tested without a microphone. **Client-safe** — nothing
 * here touches the network, Prisma or a secret.
 *
 * ## Where speech becomes text, and why there
 *
 * On the resident's own device, by a Whisper model running in a Web Worker
 * (`transcribe.worker.ts`). **The recording is never uploaded** — not to us,
 * not to Anthropic, not to anybody — which is domain rule 3's reasoning applied
 * to sound: a voice identifies a person as surely as a face does, and the only
 * way to guarantee a recording cannot leak from a server is never to send it
 * to one. What leaves the device is the transcript, as text, through the same
 * `POST /api/incidents/process` call a typed description takes.
 *
 * The Claude Messages API does not accept audio at all, which settled the
 * question of a server-side "transcribe and structure in one pass" before
 * privacy had to.
 */

/** The longest recording the wizard will take, in seconds. */
export const VOICE_MAX_SECONDS = 90;

/** Whisper's input rate. Decoding at this rate is what resamples the audio. */
export const VOICE_SAMPLE_RATE = 16_000;

/**
 * Roughly what the speech model downloads the first time it is used, for the
 * sentence that warns a resident on mobile data. Rounded up, never down.
 */
export const VOICE_MODEL_DOWNLOAD_MB = 45;

/**
 * Average a recording's channels into one. Whisper takes mono; most phones
 * record mono already, and this is the identity for one channel.
 */
export function downmixToMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];

  const length = Math.min(...channels.map((channel) => channel.length));
  const mono = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    for (const channel of channels) sum += channel[i];
    mono[i] = sum / channels.length;
  }

  return mono;
}

/**
 * Whisper's own annotations for things that are not speech — `[BLANK_AUDIO]`,
 * `[Music]`, `(wind blowing)`, `[inaudible]` — in square or round brackets.
 * They would otherwise be pasted into a report as if the resident had said
 * them.
 */
const NON_SPEECH = /\[[^\]]{1,40}\]|\((?:[a-z]+\s?){1,4}\)/gi;

/**
 * The transcript as it should land in the description box: annotations
 * removed, whitespace collapsed, trimmed. Empty means nothing was said — the
 * component says so rather than filling the box with nothing.
 */
export function cleanTranscript(raw: string): string {
  return raw.replace(NON_SPEECH, " ").replace(/\s+/g, " ").trim();
}

/** "1:05" for the countdown. */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * Root-mean-square level of a block of samples, scaled to 0..1 for the meter.
 * Speech sits far below full scale, so the raw RMS is multiplied up; the meter
 * is a sign of life, not a measurement.
 */
export function levelOf(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

/** The browser features voice input needs. Without any one, the button is not shown. */
export type VoiceSupportProbe = {
  mediaDevices?: { getUserMedia?: unknown } | undefined;
  MediaRecorder?: unknown;
  Worker?: unknown;
  WebAssembly?: unknown;
  AudioContext?: unknown;
};

/**
 * Whether this browser can record and transcribe. Taken as an argument rather
 * than reading globals so it is testable; the component passes the real ones.
 */
export function isVoiceSupported(probe: VoiceSupportProbe): boolean {
  return Boolean(
    probe.mediaDevices?.getUserMedia &&
      probe.MediaRecorder &&
      probe.Worker &&
      probe.WebAssembly &&
      probe.AudioContext,
  );
}
