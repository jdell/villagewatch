/// <reference lib="webworker" />

import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";

/**
 * Speech to text, on the resident's own device. A Web Worker so that a few
 * seconds of inference on a phone do not freeze the wizard while it runs.
 *
 * The model is Whisper's English-only "tiny" variant, quantised — about forty
 * megabytes, downloaded once from Hugging Face and kept in the browser's cache
 * by transformers.js, so the second recording starts immediately and works
 * offline. The runtime is onnxruntime-web, whose WebAssembly binary comes from
 * jsdelivr, the same origin MediaPipe's face blur already loads from. This
 * chunk is served from `/_next/static`, outside the proxy, so no CSP governs
 * its fetches — see the `worker-src` note in `src/lib/csp.ts`.
 *
 * **Nothing here sends audio anywhere.** The only network requests this worker
 * makes are for the model and the runtime, and neither carries anything of the
 * resident's. The samples arrive as a transferred buffer, are read once, and
 * are not referenced after the reply is posted.
 */

/** The model. English-only, which is the product's language and Whisper's most accurate small variant for it. */
const MODEL = "onnx-community/whisper-tiny.en";

// Remote models only — there is nothing under /models on this origin, and a
// local lookup would be a 404 per file before every download.
env.allowLocalModels = false;

export type WorkerRequest =
  | { type: "transcribe"; samples: Float32Array }
  | { type: "warm" };

export type WorkerResponse =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready" }
  | { type: "result"; text: string }
  | { type: "error"; message: string };

declare const self: DedicatedWorkerGlobalScope;

let loading: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

/** Loaded once per worker; transformers.js caches the files across visits. */
function recogniser(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!loading) {
    loading = pipeline("automatic-speech-recognition", MODEL, {
      dtype: "q8",
      device: "wasm",
      // `progress_total` is transformers.js's own sum across the model's
      // files, so the figure covers the whole download rather than restarting
      // at zero for each file. Files served from the browser's cache report as
      // instantly complete.
      progress_callback: (event: unknown) => {
        const info = event as { status?: string; loaded?: number; total?: number };
        if (info.status !== "progress_total") return;
        post({ type: "progress", loaded: info.loaded ?? 0, total: info.total ?? 0 });
      },
    }) as Promise<AutomaticSpeechRecognitionPipeline>;

    // A failed load must not be cached as the answer for the rest of the
    // session — the next press should try again.
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

function post(message: WorkerResponse) {
  self.postMessage(message);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    if (request.type === "warm") {
      await recogniser();
      post({ type: "ready" });
      return;
    }

    const asr = await recogniser();
    post({ type: "ready" });

    // Whisper reads thirty seconds at a time; a ninety-second recording is
    // transcribed in overlapping windows and stitched.
    const output = await asr(request.samples, {
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const text = Array.isArray(output)
      ? output.map((part) => part.text).join(" ")
      : output.text;

    post({ type: "result", text });
  } catch (cause) {
    post({
      type: "error",
      message: cause instanceof Error ? cause.message : "Transcription failed",
    });
  }
};
