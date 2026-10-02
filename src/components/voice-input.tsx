"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import {
  VOICE_MAX_SECONDS,
  VOICE_MODEL_DOWNLOAD_MB,
  VOICE_SAMPLE_RATE,
  cleanTranscript,
  downmixToMono,
  formatCountdown,
  isVoiceSupported,
  levelOf,
} from "@/lib/voice/audio";
import type { WorkerRequest, WorkerResponse } from "@/lib/voice/transcribe.worker";

/**
 * Speak instead of typing, on step 1 of the report wizard.
 *
 * An **alternative** to the description box, never a replacement: the text
 * area stays where it is, and the transcript lands in it for the resident to
 * read and correct before anything else happens.
 *
 * **The recording never leaves the device.** It is captured with
 * `MediaRecorder`, decoded at 16 kHz in the browser, and transcribed by a
 * Whisper model running in a Web Worker (`src/lib/voice/transcribe.worker.ts`).
 * What the wizard receives is text. The recorded chunks, the blob and the
 * decoded buffer are dropped as soon as they have been used, and the
 * microphone is released the moment recording stops — the browser's
 * recording indicator goes out with it. See `src/lib/voice/audio.ts` for why
 * on the device rather than anywhere else.
 *
 * Absent entirely, not disabled, in a browser that cannot do this — no
 * microphone API, no `MediaRecorder`, no WebAssembly or workers. Typing is
 * unchanged there, which is the fallback.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "recording"; startedAt: number }
  | { kind: "loading"; percent: number | null }
  | { kind: "transcribing" }
  | { kind: "error"; message: string };

const subscribeNever = () => () => {};

function useVoiceSupported(): boolean {
  // `false` on the server and on the first client render, so nothing about
  // the button can mismatch during hydration.
  return useSyncExternalStore(
    subscribeNever,
    () =>
      isVoiceSupported({
        mediaDevices: navigator.mediaDevices,
        MediaRecorder: window.MediaRecorder,
        Worker: window.Worker,
        WebAssembly: window.WebAssembly,
        AudioContext: window.AudioContext,
      }),
    () => false,
  );
}

export function VoiceInput({
  onTranscript,
  onBusyChange,
  disabled = false,
}: {
  /** The cleaned transcript. Never called with an empty string. */
  onTranscript: (text: string) => void;
  /** True while recording, loading the model or transcribing. */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const supported = useVoiceSupported();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const meterRef = useRef<{ context: AudioContext; frame: number } | null>(null);
  const timerRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const busy =
    phase.kind === "requesting" ||
    phase.kind === "recording" ||
    phase.kind === "loading" ||
    phase.kind === "transcribing";

  /*
    The wizard holds Continue while there is a recording to lose — recording,
    loading the model, transcribing — the same gate the AI pass uses.
    **Not** while the browser is asking for the microphone: nothing has been
    recorded yet, and a permission prompt the resident ignores never resolves,
    so counting it would leave them unable to continue even by typing.
  */
  const holdsContinue =
    phase.kind === "recording" ||
    phase.kind === "loading" ||
    phase.kind === "transcribing";

  useEffect(() => {
    onBusyChange?.(holdsContinue);
  }, [holdsContinue, onBusyChange]);

  // Release everything if the step unmounts mid-recording.
  useEffect(() => () => release(), []);

  function release() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (meterRef.current) {
      cancelAnimationFrame(meterRef.current.frame);
      void meterRef.current.context.close();
      meterRef.current = null;
    }
    // Stopping the tracks is what turns the browser's microphone indicator off.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }

  function worker(): Worker {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL("../lib/voice/transcribe.worker.ts", import.meta.url),
        { type: "module" },
      );
    }
    return workerRef.current;
  }

  async function start() {
    if (busy || disabled) return;
    setPhase({ kind: "requesting" });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPhase({
        kind: "error",
        message:
          "The microphone was not available. Allow it in your browser settings, or type instead.",
      });
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => void transcribe();

    // The level meter: a sign the microphone is hearing something, read off an
    // analyser on the live stream. Nothing from it is kept.
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      setLevel(levelOf(samples));
      if (meterRef.current) meterRef.current.frame = requestAnimationFrame(tick);
    };
    meterRef.current = { context, frame: requestAnimationFrame(tick) };

    const startedAt = Date.now();
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      const seconds = (Date.now() - startedAt) / 1000;
      setElapsed(seconds);
      if (seconds >= VOICE_MAX_SECONDS) stop();
    }, 250);

    recorder.start();
    setPhase({ kind: "recording", startedAt });

    // Fetch the model while the resident is still talking, so the wait after
    // they stop is the transcription and not the download too.
    worker().postMessage({ type: "warm" } satisfies WorkerRequest);
  }

  function stop() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    // `onstop` runs the transcription; the stream and meter go now, so the
    // microphone indicator goes out the moment the resident presses stop.
    const stream = streamRef.current;
    streamRef.current = null;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (meterRef.current) {
      cancelAnimationFrame(meterRef.current.frame);
      void meterRef.current.context.close();
      meterRef.current = null;
    }
    stream?.getTracks().forEach((track) => track.stop());
    setLevel(0);
  }

  async function transcribe() {
    // Take the chunks and drop the only reference to them at once.
    let blob: Blob | null = new Blob(chunksRef.current, {
      type: recorderRef.current?.mimeType || "audio/webm",
    });
    chunksRef.current = [];
    recorderRef.current = null;

    setPhase({ kind: "transcribing" });

    let samples: Float32Array;
    try {
      // Decoding into a 16 kHz context is what resamples to Whisper's rate.
      const context = new AudioContext({ sampleRate: VOICE_SAMPLE_RATE });
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      blob = null;
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
        decoded.getChannelData(i),
      );
      samples = downmixToMono(channels).slice();
      void context.close();
    } catch {
      blob = null;
      setPhase({
        kind: "error",
        message: "That recording could not be read. Try again, or type instead.",
      });
      return;
    }

    const instance = worker();

    const text = await new Promise<string | null>((resolve) => {
      instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const reply = event.data;
        if (reply.type === "progress") {
          setPhase({
            kind: "loading",
            percent:
              reply.total > 0 ? Math.round((reply.loaded / reply.total) * 100) : null,
          });
        } else if (reply.type === "ready") {
          setPhase({ kind: "transcribing" });
        } else if (reply.type === "result") {
          resolve(reply.text);
        } else if (reply.type === "error") {
          resolve(null);
        }
      };
      // Transferred, not copied: after this line the page holds no audio.
      instance.postMessage(
        { type: "transcribe", samples } satisfies WorkerRequest,
        [samples.buffer],
      );
    });

    if (text === null) {
      setPhase({
        kind: "error",
        message:
          "Speech recognition could not run on this device. You can type your report instead.",
      });
      return;
    }

    const cleaned = cleanTranscript(text);
    if (!cleaned) {
      setPhase({
        kind: "error",
        message: "No speech was picked up. Try again a little closer to the phone, or type instead.",
      });
      return;
    }

    setPhase({ kind: "idle" });
    onTranscript(cleaned);
  }

  if (!supported) return null;

  const recording = phase.kind === "recording";
  const remaining = VOICE_MAX_SECONDS - elapsed;

  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={recording ? stop : () => void start()}
          disabled={disabled || (busy && !recording)}
          aria-pressed={recording}
          className={`inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-60 ${
            recording
              ? "bg-red-600 text-white hover:bg-red-700"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {recording ? (
            <Square className="size-4 fill-current" aria-hidden />
          ) : busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Mic className="size-4" aria-hidden />
          )}
          {recording ? "Stop recording" : "Speak instead"}
        </button>

        {recording && (
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-3" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex size-3 rounded-full bg-red-600" />
            </span>
            {/* The level meter — width follows the microphone's loudness. */}
            <span
              className="h-2 w-24 overflow-hidden rounded-full bg-slate-200"
              aria-hidden
            >
              <span
                className="block h-full rounded-full bg-red-500 transition-[width] duration-75"
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </span>
            <span className="font-mono text-sm tabular-nums text-slate-700">
              {formatCountdown(remaining)}
            </span>
          </div>
        )}
      </div>

      {/* One live region for every state the resident cannot see change. */}
      <p className="mt-2 text-xs leading-relaxed text-slate-600" aria-live="polite">
        {phase.kind === "idle" &&
          `Up to ${VOICE_MAX_SECONDS} seconds. Your voice is turned into text on this phone and the recording is never sent anywhere. The first time, the phone downloads a speech model of about ${VOICE_MODEL_DOWNLOAD_MB} MB.`}
        {phase.kind === "requesting" && "Waiting for the microphone…"}
        {recording &&
          `Recording. It stops on its own after ${formatCountdown(VOICE_MAX_SECONDS)}.`}
        {phase.kind === "loading" &&
          (phase.percent === null
            ? "Downloading the speech model…"
            : `Downloading the speech model — ${phase.percent}%.`)}
        {phase.kind === "transcribing" && "Turning your recording into text…"}
        {phase.kind === "error" && (
          <span className="text-amber-800">{phase.message}</span>
        )}
      </p>
    </div>
  );
}
