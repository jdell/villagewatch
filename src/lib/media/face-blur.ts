/**
 * Client-side face redaction.
 *
 * The privacy claim this module has to hold up: **the original file never
 * leaves the device**. Detection runs in the browser through MediaPipe's WASM
 * build, the cover is painted onto a canvas, and only the re-encoded canvas
 * output is ever handed to the uploader. Nothing here touches the network
 * except the one-off fetch of the WASM runtime and the ~2MB detector model,
 * both of which are static assets and carry no user data.
 *
 * There are two ways to cover a face — see `FaceRedactionMode`. The default is
 * a solid black box; pixelation is the option, not the baseline. The functions
 * are still named `blurFaces*` because that is what every caller and every
 * screen calls the step, and renaming them would churn more than it explains.
 *
 * Which of the two runs, and how wide the Gaussian is when it is the second, is
 * a **village** setting: `Village.privacyLevel`, mapped by `PRIVACY_LEVELS` in
 * `src/lib/constants.ts` and passed in as `mode` and `blurRadius`. Nothing in
 * here reads that column — this module takes numbers. What it does guarantee is
 * that the scale cannot reach a weak result: `MOSAIC_CELLS` is off the scale
 * entirely, so the softest level still resamples a face to six blocks before a
 * single pixel is drawn back.
 *
 * Re-encoding through a canvas has a second benefit that domain rule 3 depends
 * on: it drops every EXIF block, GPS tags included. There is no separate
 * EXIF-stripping step because there is nothing left to strip.
 *
 * Everything in here is browser-only — `document`, `canvas` and
 * `MediaRecorder` are all assumed. Import it from Client Components, and
 * ideally through `await import()` so the MediaPipe bundle stays out of the
 * initial chunk.
 */

import type { FaceDetector } from "@mediapipe/tasks-vision";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Where the MediaPipe WASM runtime is served from. The default is the public
 * CDN copy of the exact version in `package.json` — the files are ~11MB, which
 * is more than belongs in git. To keep every request first-party (some parish
 * councils will ask), copy `node_modules/@mediapipe/tasks-vision/wasm` into
 * `public/mediapipe/wasm` and set this to `/mediapipe/wasm`.
 */
const WASM_BASE_PATH =
  process.env.NEXT_PUBLIC_MEDIAPIPE_WASM_PATH ??
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

/** BlazeFace short-range — the small, fast detector, tuned for phone-camera distances. */
const FACE_MODEL_URL =
  process.env.NEXT_PUBLIC_FACE_MODEL_URL ??
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

/**
 * Deliberately below MediaPipe's 0.5 default. A false positive costs a blurred
 * patch of hedge; a false negative costs someone's face. Bias towards blurring.
 */
const MIN_DETECTION_CONFIDENCE = 0.3;

/** Fraction of the box's longest edge added on every side before blurring. */
const FACE_PADDING = 0.35;

/** Longest edge of the exported still, in pixels. */
const MAX_IMAGE_EDGE = 1600;

/** Longest edge of the exported video, in pixels. */
const MAX_VIDEO_EDGE = 720;

/** Longest edge of the thumbnail used in map popups and list rows. */
const THUMBNAIL_EDGE = 320;

const IMAGE_QUALITY = 0.85;
const THUMBNAIL_QUALITY = 0.7;

/**
 * Video longer than this is truncated. Processing runs at playback speed, and
 * a resident holding a phone in the rain will not wait two minutes.
 */
export const MAX_VIDEO_SECONDS = 30;

/** Frames per second written to the output video. */
const OUTPUT_FPS = 24;

/**
 * How often detection actually runs, in frames per second of video time.
 * Between detections the previous boxes are reused, grown by
 * `MOTION_MARGIN` so a face that moves inside the gap stays covered.
 */
const DETECT_FPS = 6;

/** Extra padding on cached boxes, as a fraction of the box's longest edge. */
const MOTION_MARGIN = 0.25;

/**
 * Cells across the longest edge of a covered region, in `blur` mode.
 *
 * A *count*, not a pixel size. The old constant was a 12px cell, which meant the
 * destruction scaled with the photo: a face 400px across survived as a 33-cell
 * mosaic — enough structure that a jawline, a hairline and a pair of eye sockets
 * are still there to be read. Pinning the count instead means every face is
 * reduced to the same handful of blocks whatever its size on the sensor.
 *
 * Six is deliberately brutal. There is no amount of a person's face worth
 * keeping in a report about their neighbour's shed.
 */
const MOSAIC_CELLS = 6;

/**
 * Gaussian radius laid over the mosaic, as a fraction of the region's longest
 * edge.
 *
 * Was 0.12, which the comment below described as cosmetic and which was — a
 * smudge over a mosaic that was doing all the work. At 0.45 the pass is no
 * longer cosmetic: it spreads each of the six cells across most of the region,
 * so even the block boundaries stop carrying shape.
 */
const BLUR_RADIUS_RATIO = 0.45;

/**
 * Floor for a radius handed in through `BlurOptions.blurRadius`.
 *
 * The village's privacy level is a number chosen on a settings screen, and the
 * one value that would make `blur` mode meaningless is a small one. Four
 * pixels is the same floor the ratio-derived radius has always had, applied to
 * the configured path so a level cannot be dialled down to nothing.
 *
 * There is no ceiling, because a radius larger than the region is not a
 * failure — it is a wider smear, drawn overscanned like every other, and the
 * clip keeps it inside the box.
 */
const MIN_BLUR_RADIUS_PX = 4;

/**
 * How a detected face is taken out of the frame.
 *
 * - `redact` — a solid black rectangle. Nothing survives, nothing can be
 *   argued about, and it is obvious to everyone who sees the photo that a
 *   person was removed on purpose. The default.
 * - `blur` — heavy pixelation plus a heavy Gaussian. Keeps the composition
 *   readable (how many people, roughly where they stood, which way they faced),
 *   which is occasionally what makes a report legible to a PCSO.
 *
 * `redact` is the default because the failure modes are not symmetrical. A
 * redaction that was not needed costs a black rectangle in a photo of a hedge;
 * a blur that was not heavy enough costs a resident their anonymity, in a file
 * that has already been published to the village and cannot be recalled.
 * Pixelation has a long history of being undone — the search space for a face
 * behind a known mosaic is small enough to brute-force.
 */
export type FaceRedactionMode = "redact" | "blur";

export const DEFAULT_REDACTION_MODE: FaceRedactionMode = "redact";

const VIDEO_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

/** Rejected before decoding — a 200MB upload should fail fast, not after a decode. */
export const MAX_SOURCE_BYTES = 120 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BlurStage =
  | "loading-detector"
  | "decoding"
  | "detecting"
  | "encoding"
  | "done";

export type BlurProgress = {
  stage: BlurStage;
  /** 0–1 within the current stage. `detecting` is the only one that moves smoothly. */
  ratio: number;
};

export type BlurOptions = {
  onProgress?: (progress: BlurProgress) => void;
  signal?: AbortSignal;
  /** How faces are covered. Defaults to `DEFAULT_REDACTION_MODE`. */
  mode?: FaceRedactionMode;
  /**
   * Gaussian radius in pixels, for `blur` mode only.
   *
   * Comes from the village's privacy level (`PRIVACY_LEVELS` in
   * `src/lib/constants.ts`). Omitted, the radius scales with the region as it
   * always has — `BLUR_RADIUS_RATIO` of its longest edge — which is what every
   * caller that does not know about a village still gets.
   *
   * It does **not** reach the mosaic. `MOSAIC_CELLS` is fixed, so the smallest
   * radius on the scale still lands on a face that has already been resampled
   * to six cells across. A settings screen can make the cover look softer; it
   * cannot put a recognisable face back into an upload.
   */
  blurRadius?: number;
};

export type BlurredMedia = {
  kind: "image" | "video";
  /** The only bytes that may be uploaded. */
  blob: Blob;
  mimeType: string;
  /** Blurred still for map popups and list rows, always JPEG. */
  thumbnail: Blob;
  width: number;
  height: number;
  durationSeconds?: number;
  /**
   * Peak number of faces covered in any single frame — the number to show the
   * reporter. A total across frames would count the same person repeatedly.
   */
  facesDetected: number;
  framesScanned: number;
  /** True when the clip was cut at `MAX_VIDEO_SECONDS`. */
  truncated: boolean;
  /**
   * How the faces were covered. Recorded per file rather than read back off the
   * control, because the control can be changed after a file is processed and
   * this output cannot — telling a reporter their photo was redacted when it was
   * blurred is the one label here that would matter.
   */
  mode: FaceRedactionMode;
};

type Box = { x: number; y: number; w: number; h: number };

export class FaceBlurError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FaceBlurError";
  }
}

// ---------------------------------------------------------------------------
// Detector lifecycle
// ---------------------------------------------------------------------------

type RunningMode = "IMAGE" | "VIDEO";

let detectorPromise: Promise<FaceDetector> | null = null;
let currentMode: RunningMode | null = null;

/**
 * True when this browser can run the whole pipeline. Where it is false the
 * uploader must refuse the file outright rather than quietly uploading an
 * unblurred original — that would be the one failure mode residents cannot
 * recover from.
 */
export function isFaceBlurSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof WebAssembly === "undefined") return false;

  const canvas = document.createElement("canvas");
  return typeof canvas.getContext === "function" && Boolean(canvas.getContext("2d"));
}

export function isVideoBlurSupported(): boolean {
  return (
    isFaceBlurSupported() &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    VIDEO_MIME_CANDIDATES.some((type) => MediaRecorder.isTypeSupported(type))
  );
}

async function loadDetector(mode: RunningMode): Promise<FaceDetector> {
  // Imported lazily so the MediaPipe bundle is a separate chunk, fetched when
  // the reporter actually attaches something.
  detectorPromise ??= (async () => {
    const { FaceDetector: Detector, FilesetResolver } = await import(
      "@mediapipe/tasks-vision"
    );

    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);

    return Detector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "GPU" },
      runningMode: mode,
      minDetectionConfidence: MIN_DETECTION_CONFIDENCE,
    });
  })().catch((cause) => {
    // Leave nothing cached, or every later attempt replays the same failure.
    detectorPromise = null;
    currentMode = null;
    throw new FaceBlurError(
      "Could not start face detection. Check your connection and try again.",
      { cause },
    );
  });

  const detector = await detectorPromise;

  if (currentMode !== mode) {
    await detector.setOptions({ runningMode: mode });
    currentMode = mode;
  }

  return detector;
}

/**
 * Kicks off the WASM + model download without processing anything. Call it as
 * soon as the wizard opens so the first attachment does not stall on a cold
 * 2MB fetch. Failures are swallowed — the real attempt will report them.
 */
export function prewarmFaceDetector(): void {
  if (!isFaceBlurSupported()) return;
  void loadDetector("IMAGE").catch(() => {});
}

/** Frees the WASM instance. Worth doing when the wizard unmounts. */
export function releaseFaceDetector(): void {
  const pending = detectorPromise;
  detectorPromise = null;
  currentMode = null;
  void pending?.then((detector) => detector.close()).catch(() => {});
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

function fitWithin(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };

  const scale = maxEdge / longest;
  // Even dimensions — some H.264 encoders reject odd ones outright.
  return {
    width: Math.max(2, Math.round((width * scale) / 2) * 2),
    height: Math.max(2, Math.round((height * scale) / 2) * 2),
  };
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new FaceBlurError("This browser cannot render to a canvas.");
  return ctx;
}

function toBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new FaceBlurError("Could not encode the blurred image.")),
      mimeType,
      quality,
    );
  });
}

/** Blurred still, scaled down for map popups and list rows. */
async function makeThumbnail(source: HTMLCanvasElement): Promise<Blob> {
  const { width, height } = fitWithin(
    source.width,
    source.height,
    THUMBNAIL_EDGE,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = context2d(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);

  return toBlob(canvas, "image/jpeg", THUMBNAIL_QUALITY);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new FaceBlurError("Blurring was cancelled.");
}

// ---------------------------------------------------------------------------
// The blur itself
// ---------------------------------------------------------------------------

/** Scratch canvas for the mosaic downsample, reused across every box. */
let mosaicCanvas: HTMLCanvasElement | null = null;

function padBox(box: Box, padding: number, width: number, height: number): Box {
  const inset = Math.max(box.w, box.h) * padding;

  const x = Math.max(0, box.x - inset);
  const y = Math.max(0, box.y - inset);

  return {
    x,
    y,
    w: Math.min(width - x, box.w + inset * 2),
    h: Math.min(height - y, box.h + inset * 2),
  };
}

/**
 * Takes one region of `ctx` out of the picture.
 *
 * ## `redact`
 *
 * A solid black rectangle, and nothing else. No source pixels are read, so
 * there is no filter to be unsupported, no browser on which this degrades, and
 * nothing left in the output to reconstruct from. Square corners on purpose:
 * rounded ones read as styling, and the corners of the padded box are exactly
 * where a jaw and an ear sit.
 *
 * ## `blur`
 *
 * Two passes. The mosaic is the one that destroys the identity — the region is
 * resampled down to `MOSAIC_CELLS` across, so the original pixels no longer
 * exist anywhere in the output and the Gaussian has nothing to sharpen back up.
 * That ordering also means the result is still safe on a browser where
 * `ctx.filter` is unsupported and silently ignored: the worst case is a visible
 * six-cell mosaic rather than a recognisable face.
 *
 * `blurRadius`, when the village's privacy level supplies one, replaces the
 * region-scaled Gaussian and nothing else. The mosaic above it is fixed, which
 * is what makes the level a presentation choice rather than a privacy one.
 */
function obscureRegion(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  region: Box,
  mode: FaceRedactionMode,
  blurRadius?: number,
) {
  const x = Math.floor(region.x);
  const y = Math.floor(region.y);
  const w = Math.ceil(region.w);
  const h = Math.ceil(region.h);

  if (w < 2 || h < 2) return;

  if (mode === "redact") {
    ctx.save();
    // Reset anything a previous pass left on the context. A stale `filter`
    // would soften the edges of the box and leave a readable gradient at them.
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }

  // Cells are derived from the region's aspect so a wide box does not end up
  // with square-ish blocks stretched across it, but neither axis is ever
  // allowed more than `MOSAIC_CELLS`.
  const longest = Math.max(w, h);
  const cellsX = Math.max(2, Math.round((w / longest) * MOSAIC_CELLS));
  const cellsY = Math.max(2, Math.round((h / longest) * MOSAIC_CELLS));

  mosaicCanvas ??= document.createElement("canvas");
  mosaicCanvas.width = cellsX;
  mosaicCanvas.height = cellsY;

  const mosaicCtx = context2d(mosaicCanvas);
  mosaicCtx.clearRect(0, 0, cellsX, cellsY);
  mosaicCtx.drawImage(canvas, x, y, w, h, 0, 0, cellsX, cellsY);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // One radius for the filter and the overscan below. They have to agree: the
  // bleed exists to keep the Gaussian from sampling transparent pixels beyond
  // the region, and a bleed narrower than the blur leaves the translucent
  // border back.
  const radius =
    blurRadius === undefined
      ? Math.max(MIN_BLUR_RADIUS_PX, Math.round(longest * BLUR_RADIUS_RATIO))
      : Math.max(MIN_BLUR_RADIUS_PX, Math.round(blurRadius));

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.filter = `blur(${radius}px)`;

  // Drawn overscanned. A Gaussian this wide samples transparent pixels from
  // beyond the region's edge and drags them inwards, which would leave a
  // translucent border showing the unblurred frame through it. Bleeding the
  // source out by a blur radius on every side and clipping back to the region
  // means every sampled pixel is real.
  const bleed = radius;
  ctx.drawImage(
    mosaicCanvas,
    0,
    0,
    cellsX,
    cellsY,
    x - bleed,
    y - bleed,
    w + bleed * 2,
    h + bleed * 2,
  );

  ctx.restore();
}

function boxesFrom(
  detections: { boundingBox?: { originX: number; originY: number; width: number; height: number } }[],
): Box[] {
  const boxes: Box[] = [];

  for (const detection of detections) {
    const box = detection.boundingBox;
    if (!box) continue;
    boxes.push({ x: box.originX, y: box.originY, w: box.width, h: box.height });
  }

  return boxes;
}

function blurBoxes(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  boxes: readonly Box[],
  padding: number,
  mode: FaceRedactionMode,
  blurRadius?: number,
) {
  for (const box of boxes) {
    obscureRegion(
      ctx,
      canvas,
      padBox(box, padding, canvas.width, canvas.height),
      mode,
      blurRadius,
    );
  }
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export async function blurFacesInImage(
  file: File,
  {
    onProgress,
    signal,
    mode = DEFAULT_REDACTION_MODE,
    blurRadius,
  }: BlurOptions = {},
): Promise<BlurredMedia> {
  onProgress?.({ stage: "loading-detector", ratio: 0 });
  const detector = await loadDetector("IMAGE");
  throwIfAborted(signal);

  onProgress?.({ stage: "decoding", ratio: 0 });

  let bitmap: ImageBitmap;
  try {
    // `from-image` applies the EXIF orientation tag, so a photo taken sideways
    // is not blurred against a rotated frame.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (cause) {
    throw new FaceBlurError(
      "That image could not be opened. Try a JPEG or PNG.",
      { cause },
    );
  }

  try {
    throwIfAborted(signal);

    const { width, height } = fitWithin(
      bitmap.width,
      bitmap.height,
      MAX_IMAGE_EDGE,
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = context2d(canvas);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    onProgress?.({ stage: "detecting", ratio: 0 });

    // Detection runs against the resized canvas, so box coordinates are already
    // in output space — no rescaling, no chance of a half-pixel miss.
    const boxes = boxesFrom(detector.detect(canvas).detections);
    blurBoxes(ctx, canvas, boxes, FACE_PADDING, mode, blurRadius);

    onProgress?.({ stage: "encoding", ratio: 0 });
    throwIfAborted(signal);

    const [blob, thumbnail] = await Promise.all([
      toBlob(canvas, "image/jpeg", IMAGE_QUALITY),
      makeThumbnail(canvas),
    ]);

    onProgress?.({ stage: "done", ratio: 1 });

    return {
      kind: "image",
      blob,
      mimeType: "image/jpeg",
      thumbnail,
      width,
      height,
      facesDetected: boxes.length,
      framesScanned: 1,
      truncated: false,
      mode,
    };
  } finally {
    bitmap.close();
  }
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

function pickVideoMimeType(): string {
  const supported = VIDEO_MIME_CANDIDATES.find((type) =>
    MediaRecorder.isTypeSupported(type),
  );

  if (!supported) {
    throw new FaceBlurError(
      "This browser cannot re-encode video. Attach a photo instead.",
    );
  }

  return supported;
}

function onceEvent(target: EventTarget, event: string, errorEvent = "error") {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(event, done);
      target.removeEventListener(errorEvent, fail);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new FaceBlurError("That video could not be opened."));
    };

    target.addEventListener(event, done, { once: true });
    target.addEventListener(errorEvent, fail, { once: true });
  });
}

/**
 * Blurs a clip by playing it back into a canvas and recording the canvas.
 *
 * Playback speed is the cost of doing this without ffmpeg: a 15 second clip
 * takes roughly 15 seconds. In exchange the pipeline is about forty lines and
 * uses nothing beyond `MediaRecorder`.
 *
 * The output has **no audio track**, deliberately. A recognisable voice
 * re-identifies someone just as effectively as a face, and blurring solves only
 * one of those.
 */
export async function blurFacesInVideo(
  file: File,
  {
    onProgress,
    signal,
    mode = DEFAULT_REDACTION_MODE,
    blurRadius,
  }: BlurOptions = {},
): Promise<BlurredMedia> {
  if (!isVideoBlurSupported()) {
    throw new FaceBlurError(
      "This browser cannot blur video. Attach a photo instead.",
    );
  }

  onProgress?.({ stage: "loading-detector", ratio: 0 });
  const detector = await loadDetector("VIDEO");
  throwIfAborted(signal);

  onProgress?.({ stage: "decoding", ratio: 0 });

  const objectUrl = URL.createObjectURL(file);

  // Hoisted so the cleanup below can stop a recorder that is still running
  // because playback or detection threw part-way through.
  let recorder: MediaRecorder | null = null;

  const video = document.createElement("video");
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await onceEvent(video, "loadedmetadata");
    throwIfAborted(signal);

    // Some WebM containers report `Infinity` until the file is fully buffered.
    // Falling back to 0 would end the loop before the first frame was drawn, so
    // an unknown duration is treated as "run until the clip ends or the cap".
    const knownDuration =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : null;

    const cappedDuration = Math.min(
      knownDuration ?? MAX_VIDEO_SECONDS,
      MAX_VIDEO_SECONDS,
    );
    const truncated = knownDuration !== null && knownDuration > MAX_VIDEO_SECONDS;

    const { width, height } = fitWithin(
      video.videoWidth,
      video.videoHeight,
      MAX_VIDEO_EDGE,
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = context2d(canvas);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const mimeType = pickVideoMimeType();
    const stream = canvas.captureStream(OUTPUT_FPS);
    const rec = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2_500_000,
    });
    recorder = rec;

    const chunks: Blob[] = [];
    rec.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const recordingStopped = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });

    // Thumbnail is grabbed a beat in — the very first frame of a phone
    // recording is usually a black or motion-blurred mess.
    const thumbnailAt = Math.min(1, cappedDuration / 2);
    let thumbnailCanvas: HTMLCanvasElement | null = null;

    let peakFaces = 0;
    let framesScanned = 0;
    let cachedBoxes: Box[] = [];
    let lastDetectAt = -Infinity;
    let lastTimestamp = -1;

    const detectInterval = 1000 / DETECT_FPS;

    onProgress?.({ stage: "detecting", ratio: 0 });

    rec.start();

    try {
      await video.play();
    } catch (cause) {
      throw new FaceBlurError("That video could not be played back.", { cause });
    }

    await new Promise<void>((resolve, reject) => {
      let frameHandle = 0;

      const finish = () => {
        cancelAnimationFrame(frameHandle);
        resolve();
      };

      const step = () => {
        try {
          if (signal?.aborted) {
            cancelAnimationFrame(frameHandle);
            reject(new FaceBlurError("Blurring was cancelled."));
            return;
          }

          const timestamp = video.currentTime * 1000;

          ctx.drawImage(video, 0, 0, width, height);

          // `detectForVideo` requires strictly increasing timestamps, and rAF
          // happily fires twice on the same decoded frame.
          if (timestamp > lastTimestamp) {
            lastTimestamp = timestamp;

            if (timestamp - lastDetectAt >= detectInterval) {
              lastDetectAt = timestamp;
              cachedBoxes = boxesFrom(
                detector.detectForVideo(video, timestamp).detections,
              );
              framesScanned += 1;
              peakFaces = Math.max(peakFaces, cachedBoxes.length);
            }
          }

          // Between detections the last known boxes are grown, so a face that
          // moves during the gap stays inside the covered area.
          blurBoxes(
            ctx,
            canvas,
            cachedBoxes,
            FACE_PADDING + MOTION_MARGIN,
            mode,
            blurRadius,
          );

          if (!thumbnailCanvas && video.currentTime >= thumbnailAt) {
            thumbnailCanvas = document.createElement("canvas");
            thumbnailCanvas.width = width;
            thumbnailCanvas.height = height;
            context2d(thumbnailCanvas).drawImage(canvas, 0, 0);
          }

          if (cappedDuration > 0) {
            onProgress?.({
              stage: "detecting",
              ratio: Math.min(1, video.currentTime / cappedDuration),
            });
          }

          if (video.ended || video.currentTime >= cappedDuration) {
            finish();
            return;
          }

          frameHandle = requestAnimationFrame(step);
        } catch (cause) {
          cancelAnimationFrame(frameHandle);
          reject(
            cause instanceof FaceBlurError
              ? cause
              : new FaceBlurError("Blurring the video failed.", { cause }),
          );
        }
      };

      video.addEventListener("ended", finish, { once: true });
      frameHandle = requestAnimationFrame(step);
    });

    video.pause();

    onProgress?.({ stage: "encoding", ratio: 0 });

    rec.stop();
    await recordingStopped;

    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size === 0) {
      throw new FaceBlurError("The blurred video came back empty. Try again.");
    }

    const thumbnail = await makeThumbnail(thumbnailCanvas ?? canvas);

    onProgress?.({ stage: "done", ratio: 1 });

    return {
      kind: "video",
      blob,
      mimeType,
      thumbnail,
      width,
      height,
      durationSeconds: Math.round(cappedDuration),
      facesDetected: peakFaces,
      framesScanned,
      truncated,
      mode,
    };
  } finally {
    // On the error paths the recorder is still running and still holding the
    // canvas stream open.
    if (recorder && recorder.state !== "inactive") recorder.stop();

    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

/**
 * Blurs whatever was attached. This is the only function the uploader needs:
 * pass it a `File`, upload `result.blob`, and throw the `File` away.
 */
export async function blurFaces(
  file: File,
  options: BlurOptions = {},
): Promise<BlurredMedia> {
  if (!isFaceBlurSupported()) {
    throw new FaceBlurError(
      "This browser cannot blur faces, so media cannot be attached here. " +
        "Try a recent Chrome, Safari or Firefox.",
    );
  }

  if (file.size > MAX_SOURCE_BYTES) {
    throw new FaceBlurError(
      `That file is larger than ${Math.round(MAX_SOURCE_BYTES / 1024 / 1024)}MB.`,
    );
  }

  if (isVideoFile(file)) return blurFacesInVideo(file, options);

  if (!file.type.startsWith("image/")) {
    throw new FaceBlurError("Attach a photo or a video.");
  }

  return blurFacesInImage(file, options);
}
