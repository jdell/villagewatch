"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  EyeOff,
  ImagePlus,
  Loader2,
  RotateCcw,
  ScanFace,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import type {
  BlurStage,
  BlurredMedia,
  FaceRedactionMode,
} from "@/lib/media/face-blur";
import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  DEFAULT_REDACTION_MODE,
  MAX_VIDEO_SECONDS,
} from "@/lib/media/face-blur";
import { formatDuration, formatFileSize } from "@/lib/format";

/**
 * Attach photos and video to a report.
 *
 * The order of operations is the whole point of this component: **blur, then
 * upload**. The `File` the reporter picked is decoded, blurred and re-encoded
 * entirely in the browser, and only the re-encoded blob is ever handed to
 * `fetch`. There is no code path here that sends the original — if blurring
 * fails, the attachment fails with it.
 *
 * The face count is shown back to the reporter for a reason beyond reassurance:
 * "0 faces detected" is genuine information. It tells them the blur ran and
 * found nothing, so if they know there was a face in shot, they know to check
 * the preview before publishing.
 */

export type AttachedMedia = {
  /** Client-side id, used as the React key and for removal. */
  id: string;
  kind: "image" | "video";
  mimeType: string;
  /** Object URL for the blurred blob. Preview only, revoked on removal. */
  previewUrl: string;
  /** Object URL for the blurred thumbnail. */
  thumbnailUrl: string;
  width: number;
  height: number;
  durationSeconds?: number;
  facesDetected: number;
  fileSize: number;
  truncated: boolean;
  /**
   * How this file's faces were covered. Per file, not per uploader: the control
   * can be changed after a file has been processed, and the file cannot.
   */
  mode: FaceRedactionMode;
  /** Supabase Storage path of the blurred file. */
  storagePath: string;
  thumbnailPath: string;
};

type PendingItem = {
  id: string;
  name: string;
  stage: BlurStage | "uploading" | "failed";
  ratio: number;
  facesDetected?: number;
  error?: string;
};

type MediaUploaderProps = {
  value: readonly AttachedMedia[];
  onChange: (media: AttachedMedia[]) => void;
  maxFiles?: number;
  disabled?: boolean;
};

const ACCEPT = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES].join(",");

const STAGE_LABELS: Record<PendingItem["stage"], string> = {
  "loading-detector": "Starting face detection…",
  decoding: "Opening the file…",
  detecting: "Finding and covering faces…",
  encoding: "Saving the redacted copy…",
  done: "Done",
  uploading: "Uploading the redacted copy…",
  failed: "Failed",
};

/**
 * The two ways to cover a face, as the reporter chooses between them.
 *
 * `redact` is recommended in the label rather than merely defaulted, because a
 * reporter who reads the options is being asked to make a privacy decision
 * about somebody who is not in the room and did not choose to be photographed.
 */
const MODE_OPTIONS: {
  value: FaceRedactionMode;
  label: string;
  detail: string;
}[] = [
  {
    value: "redact",
    label: "Redact faces (recommended)",
    detail: "A solid black box. Nothing of the face survives in the upload.",
  },
  {
    value: "blur",
    label: "Blur faces",
    detail:
      "Heavy pixelation. Keeps how many people were there and where they stood.",
  },
];

/** Past tense for one file, for the count shown back to the reporter. */
const MODE_VERB: Record<FaceRedactionMode, string> = {
  redact: "redacted",
  blur: "blurred",
};

let nextId = 0;

async function uploadBlurred(media: BlurredMedia): Promise<{
  storagePath: string;
  thumbnailPath: string;
}> {
  const form = new FormData();

  // The server derives the real extension from the blob's MIME type; this
  // filename only ever shows up in logs.
  const extension = media.mimeType.includes("mp4")
    ? "mp4"
    : media.kind === "image"
      ? "jpg"
      : "webm";

  form.append("file", media.blob, `blurred.${extension}`);
  form.append("thumbnail", media.thumbnail, "thumbnail.jpg");
  form.append("kind", media.kind);
  form.append("width", String(media.width));
  form.append("height", String(media.height));
  form.append("facesDetected", String(media.facesDetected));
  if (media.durationSeconds !== undefined) {
    form.append("durationSeconds", String(media.durationSeconds));
  }

  const response = await fetch("/api/incidents/media", {
    method: "POST",
    body: form,
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error ?? "The upload failed. Try again.");
  }

  return { storagePath: result.storagePath, thumbnailPath: result.thumbnailPath };
}

export function MediaUploader({
  value,
  onChange,
  maxFiles = 4,
  disabled = false,
}: MediaUploaderProps) {
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [mode, setMode] = useState<FaceRedactionMode>(DEFAULT_REDACTION_MODE);
  const inputRef = useRef<HTMLInputElement>(null);

  // Read inside the async processing loop, for the same reason `value` is: the
  // loop must not close over the mode as it was when `processFile` was created.
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // `value` is read inside the async processing loop; a ref keeps that loop
  // from closing over a stale array when several files land at once. Synced in
  // an effect rather than during render — the loop only ever reads it in
  // response to a user action, which is always after the commit.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    let cancelled = false;

    // Capability check and model prefetch both need the browser, so they wait
    // for mount. The 2MB model starts downloading now rather than when the
    // reporter picks a file, which is the moment they are least patient.
    void import("@/lib/media/face-blur").then((mod) => {
      if (cancelled) return;
      const ok = mod.isFaceBlurSupported();
      setSupported(ok);
      if (ok) mod.prewarmFaceDetector();
    });

    return () => {
      cancelled = true;
      void import("@/lib/media/face-blur").then((mod) =>
        mod.releaseFaceDetector(),
      );
    };
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      const id = `media-${nextId++}`;

      setPending((items) => [
        ...items,
        { id, name: file.name, stage: "loading-detector", ratio: 0 },
      ]);

      const patch = (changes: Partial<PendingItem>) =>
        setPending((items) =>
          items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
        );

      try {
        const { blurFaces } = await import("@/lib/media/face-blur");

        const blurred = await blurFaces(file, {
          mode: modeRef.current,
          onProgress: ({ stage, ratio }) => patch({ stage, ratio }),
        });

        patch({ stage: "uploading", ratio: 0, facesDetected: blurred.facesDetected });

        const { storagePath, thumbnailPath } = await uploadBlurred(blurred);

        const attached: AttachedMedia = {
          id,
          kind: blurred.kind,
          mimeType: blurred.mimeType,
          previewUrl: URL.createObjectURL(blurred.blob),
          thumbnailUrl: URL.createObjectURL(blurred.thumbnail),
          width: blurred.width,
          height: blurred.height,
          durationSeconds: blurred.durationSeconds,
          facesDetected: blurred.facesDetected,
          fileSize: blurred.blob.size,
          truncated: blurred.truncated,
          mode: blurred.mode,
          storagePath,
          thumbnailPath,
        };

        setPending((items) => items.filter((item) => item.id !== id));
        onChange([...valueRef.current, attached]);

        if (blurred.truncated) {
          toast.info(`Video trimmed to the first ${MAX_VIDEO_SECONDS} seconds.`);
        }
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : "Something went wrong preparing that file.";

        patch({ stage: "failed", ratio: 0, error: message });
        toast.error(message);
      }
    },
    [onChange],
  );

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const room = maxFiles - valueRef.current.length - pending.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${maxFiles} files.`);
      return;
    }

    const chosen = Array.from(files).slice(0, room);
    if (chosen.length < files.length) {
      toast.info(`Only the first ${room} of those files were added.`);
    }

    // Sequential, not parallel: each file monopolises the WASM detector, and a
    // video is processed at playback speed. Running two at once just makes both
    // slower and the progress bars meaningless.
    for (const file of chosen) {
      await processFile(file);
    }
  }

  function removeAttachment(id: string) {
    const target = valueRef.current.find((item) => item.id === id);
    if (!target) return;

    URL.revokeObjectURL(target.previewUrl);
    URL.revokeObjectURL(target.thumbnailUrl);
    onChange(valueRef.current.filter((item) => item.id !== id));

    // Best-effort tidy-up so an abandoned attachment does not linger in
    // storage. The report has not been created yet, so there is nothing to
    // detach it from and nothing to roll back if this fails.
    void fetch(
      `/api/incidents/media?path=${encodeURIComponent(target.storagePath)}`,
      { method: "DELETE" },
    ).catch(() => {});
  }

  const atCapacity = value.length + pending.length >= maxFiles;
  const busy = pending.some((item) => item.stage !== "failed");

  if (supported === false) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex gap-3">
          <TriangleAlert className="size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Photos and video cannot be attached here</p>
            <p className="mt-1 text-amber-800">
              This browser cannot cover faces on-device, and VillageWatch never
              uploads media with faces still in it. File the report as text
              only, or try again from a recent Chrome, Safari or Firefox.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-brand-50 p-3.5 ring-1 ring-brand-100">
        <div className="flex gap-3">
          <ShieldCheck className="size-5 shrink-0 text-brand-600" aria-hidden />
          <p className="text-sm leading-relaxed text-brand-900">
            Faces are found and covered <strong>on your device</strong>. Only the
            covered copy is uploaded — the original photo or video never leaves
            your phone, and its location tag is stripped along the way.
          </p>
        </div>
      </div>

      <fieldset className="rounded-2xl border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-medium text-slate-700">
          How to cover faces
        </legend>

        <div className="mt-1 space-y-2">
          {MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                mode === option.value
                  ? "border-brand-400 bg-brand-50/60"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="redaction-mode"
                value={option.value}
                checked={mode === option.value}
                disabled={disabled || busy}
                onChange={() => setMode(option.value)}
                className="mt-0.5 size-4 shrink-0 border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
              />
              <span className="text-sm">
                <span className="block font-medium text-slate-800">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-slate-500">
                  {option.detail}
                </span>
              </span>
            </label>
          ))}
        </div>

        {value.length > 0 && (
          <p className="mt-2.5 text-xs text-slate-500">
            This applies to files you add from now on. Anything already attached
            keeps the setting it was processed with, shown on each one below.
          </p>
        )}
      </fieldset>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        disabled={disabled || atCapacity}
        onChange={(event) => {
          void handleFiles(event.target.files);
          // Reset so picking the same file twice still fires a change event.
          event.target.value = "";
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={disabled || atCapacity || busy}
          onClick={() => inputRef.current?.click()}
          className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white text-slate-600 transition hover:border-brand-400 hover:bg-brand-50/50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ImagePlus className="size-6" aria-hidden />
          <span className="text-sm font-medium">Choose a photo or video</span>
          <span className="text-xs text-slate-500">
            Up to {maxFiles} files, video trimmed to {MAX_VIDEO_SECONDS}s
          </span>
        </button>

        <button
          type="button"
          disabled={disabled || atCapacity || busy}
          onClick={() => {
            // `capture` asks a phone to open the camera rather than the gallery.
            // Desktop browsers ignore it and show the normal picker.
            inputRef.current?.setAttribute("capture", "environment");
            inputRef.current?.click();
            inputRef.current?.removeAttribute("capture");
          }}
          className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white text-slate-600 transition hover:border-brand-400 hover:bg-brand-50/50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50 sm:hidden"
        >
          <Camera className="size-6" aria-hidden />
          <span className="text-sm font-medium">Take a photo now</span>
        </button>
      </div>

      {pending.length > 0 && (
        <ul className="space-y-2">
          {pending.map((item) => (
            <li
              key={item.id}
              className={`rounded-xl border p-3 ${
                item.stage === "failed"
                  ? "border-red-200 bg-red-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-3">
                {item.stage === "failed" ? (
                  <TriangleAlert className="size-4 shrink-0 text-red-600" aria-hidden />
                ) : (
                  <Loader2
                    className="size-4 shrink-0 animate-spin text-brand-600"
                    aria-hidden
                  />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {item.name}
                  </p>
                  <p
                    className={`text-xs ${
                      item.stage === "failed" ? "text-red-700" : "text-slate-500"
                    }`}
                  >
                    {item.error ?? STAGE_LABELS[item.stage]}
                  </p>
                </div>

                {item.stage === "failed" && (
                  <button
                    type="button"
                    onClick={() =>
                      setPending((items) =>
                        items.filter((entry) => entry.id !== item.id),
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    Dismiss
                  </button>
                )}
              </div>

              {item.stage !== "failed" && (
                <div
                  className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(item.ratio * 100)}
                  aria-label={STAGE_LABELS[item.stage]}
                >
                  <div
                    className="h-full rounded-full bg-brand-500 transition-[width] duration-200"
                    style={{
                      width:
                        item.stage === "detecting"
                          ? `${Math.max(4, item.ratio * 100)}%`
                          : "100%",
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {value.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {value.map((media) => (
            <li
              key={media.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
            >
              <div className="relative aspect-video bg-slate-100">
                {media.kind === "video" ? (
                  <video
                    src={media.previewUrl}
                    controls
                    playsInline
                    muted
                    className="size-full object-contain"
                  />
                ) : (
                  // Object URL for a blob held in memory — next/image cannot
                  // optimise it and has nothing to optimise.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={media.previewUrl}
                    alt="Redacted copy of the media you attached"
                    className="size-full object-contain"
                  />
                )}
              </div>

              <div className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p
                    className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                      media.facesDetected > 0 ? "text-safe-700" : "text-slate-600"
                    }`}
                  >
                    {media.facesDetected > 0 ? (
                      <EyeOff className="size-4" aria-hidden />
                    ) : (
                      <ScanFace className="size-4" aria-hidden />
                    )}
                    {media.facesDetected > 0
                      ? `${media.facesDetected} ${
                          media.facesDetected === 1 ? "face" : "faces"
                        } ${MODE_VERB[media.mode]}`
                      : "No faces detected"}
                  </p>

                  <p className="mt-0.5 text-xs text-slate-500">
                    {media.kind === "video" ? "Video" : "Photo"}
                    {" · "}
                    {media.width}×{media.height}
                    {media.durationSeconds !== undefined &&
                      ` · ${formatDuration(media.durationSeconds)}`}
                    {" · "}
                    {formatFileSize(media.fileSize)}
                  </p>

                  {media.facesDetected === 0 && (
                    <p className="mt-1.5 text-xs text-amber-700">
                      Check the preview — if someone is recognisable, remove this
                      file.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => removeAttachment(media.id)}
                  disabled={disabled}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {supported === null && (
        <p className="text-xs text-slate-500">Checking this device…</p>
      )}
    </div>
  );
}
