"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { EyeOff, Loader2, TriangleAlert } from "lucide-react";
import {
  savePrivacyLevelAction,
  type PrivacyLevelState,
} from "@/app/(app)/dashboard/actions";
import {
  PRIVACY_LEVELS,
  PRIVACY_LEVEL_META,
  type PrivacyLevel,
} from "@/lib/constants";

/**
 * How this village covers faces in the photos and video its residents upload.
 *
 * Four levels, one radio group, and a preview beside each so the choice is made
 * by looking rather than by reading a pixel count. It is the fourth village
 * setting and the only one whose subject is a person who is not using the app:
 * whoever happened to be in shot when a neighbour took the photo.
 *
 * ## What the scale actually moves
 *
 * The Gaussian, and nothing else. Every `blur` level resamples the padded face
 * box down to six cells across before anything is drawn back — see
 * `MOSAIC_CELLS` in `src/lib/media/face-blur.ts` — and that resample is what
 * destroys the identity, because the original pixels stop existing anywhere in
 * the output. It is deliberately not on this scale.
 *
 * So the honest framing for a coordinator, and the one this screen uses, is
 * that the level decides how much of the *scene* around a face survives.
 * Nothing here reaches a setting where somebody is recognisable, and there is
 * no option that uploads an original: domain rule 3 is structural, and
 * `POST /api/incidents/media` has no server-side fallback to fall back to.
 *
 * ## The preview
 *
 * A six-by-six grid of flat colours under a CSS blur — which is the pipeline
 * itself, mosaic first and Gaussian over it, at a scale that fits in a settings
 * row. It is an illustration and says so: the real radius applies to a face
 * region a few hundred pixels across, and `PREVIEW_SCALE` is what maps one onto
 * the other. No asset, no photograph of anybody, nothing to fetch.
 */

const IDLE: PrivacyLevelState = { ok: true, message: "" };

/**
 * A face at the resolution the mosaic leaves it — six cells across, which is
 * genuinely all that survives the first pass.
 *
 * Hand-written rather than generated: it needs to read as a head and shoulders
 * at 72px, and a procedural blob does not.
 */
const PREVIEW_MOSAIC = [
  "hhhhhh",
  "hssssh",
  "hseseh",
  "bssssb",
  "bsmmsb",
  "bccccb",
] as const;

const PREVIEW_COLOURS: Record<string, string> = {
  h: "#3f3a35", // hair
  s: "#d8a882", // skin
  e: "#2f2a26", // eye
  m: "#a9603f", // mouth
  b: "#e2e8f0", // background
  c: "#64748b", // collar
};

/**
 * Maps a real blur radius onto the 72px preview tile.
 *
 * A face box in an uploaded photo is a few hundred pixels across; the tile is
 * 72. Roughly a quarter keeps the four levels visibly different from each other
 * without the heaviest one going completely flat, which is what a coordinator
 * is here to compare.
 */
const PREVIEW_SCALE = 0.24;

function LevelPreview({ level }: { level: PrivacyLevel }) {
  const meta = PRIVACY_LEVEL_META[level];

  return (
    <span
      aria-hidden
      className="grid size-[72px] shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-200"
      style={{ background: PREVIEW_COLOURS.b }}
    >
      {meta.mode === "redact" ? (
        // No source pixels are read in `redact` mode, so there is nothing to
        // illustrate but the rectangle itself.
        <span className="size-full bg-black" />
      ) : (
        <span
          className="grid size-full grid-cols-6 grid-rows-6"
          style={{ filter: `blur(${meta.radius * PREVIEW_SCALE}px)` }}
        >
          {PREVIEW_MOSAIC.flatMap((row, y) =>
            [...row].map((cell, x) => (
              <span
                key={`${y}-${x}`}
                style={{ background: PREVIEW_COLOURS[cell] }}
              />
            )),
          )}
        </span>
      )}
    </span>
  );
}

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Save privacy level
    </button>
  );
}

type PrivacyLevelFormProps = {
  value: PrivacyLevel;
  /** False when the column is missing from this database. */
  available: boolean;
};

export function PrivacyLevelForm({ value, available }: PrivacyLevelFormProps) {
  const [state, save] = useActionState(savePrivacyLevelAction, IDLE);
  const [level, setLevel] = useState<PrivacyLevel>(value);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  // Derived from the `value` prop rather than a second piece of state. The
  // action revalidates `/dashboard`, so a successful save re-renders this with
  // the stored value updated — which is the only thing that should decide
  // whether there is anything left to save, and whether the caution below is
  // still about a change somebody is making rather than one they made.
  const dirty = level !== value;
  const weakening =
    dirty && PRIVACY_LEVEL_META[level].mode === "blur" && level === "light";

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <EyeOff className="size-4 text-slate-400" aria-hidden />
        Privacy level
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Controls how faces are obscured in uploaded media. Standard (22px) is the
        recommended setting and the one your privacy notice describes. Light blur
        keeps the most of the scene around a face — use it only if agreed with
        police.
      </p>

      {available ? (
        <form action={save} className="mt-4 space-y-4">
          <fieldset>
            <legend className="sr-only">Face redaction level</legend>

            <div className="space-y-2">
              {PRIVACY_LEVELS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-3.5 rounded-xl border p-3 transition ${
                    level === option.value
                      ? "border-brand-400 bg-brand-50/60"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="privacyLevel"
                    value={option.value}
                    checked={level === option.value}
                    onChange={() => setLevel(option.value)}
                    className="size-4 shrink-0 border-slate-300 text-brand-600 focus:ring-brand-500"
                  />

                  <LevelPreview level={option.value} />

                  <span className="min-w-0 text-sm">
                    <span className="block font-medium text-slate-900">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block leading-relaxed text-slate-500">
                      {option.detail}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <p className="rounded-xl bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600 ring-1 ring-inset ring-slate-200">
            The previews are illustrations of the blur strength, not real
            output. Whichever level you pick, every face is first reduced to six
            blocks on the resident&rsquo;s own device — that is the step that
            makes it unrecognisable, and it is the same at all four levels. The
            level decides how much of the scene around a face survives. A
            reporter can always choose full redaction for their own photo.
          </p>

          {weakening && (
            <div
              role="status"
              className="flex gap-3 rounded-xl bg-amber-50 p-3.5 ring-1 ring-inset ring-amber-600/20"
            >
              <TriangleAlert
                className="size-5 shrink-0 text-amber-600"
                aria-hidden
              />
              <div className="text-sm leading-relaxed text-amber-900">
                <p className="font-medium">
                  Light is the weakest level on the scale.
                </p>
                <p className="mt-1">
                  It applies to media uploaded from now on, across the whole
                  village. Anything already published keeps the level it was
                  processed with — this cannot go back and re-cover a photo
                  somebody has already seen.
                </p>
              </div>
            </div>
          )}

          <SaveButton dirty={dirty} />
        </form>
      ) : (
        <div className="mt-4 flex gap-3 rounded-xl bg-amber-50 p-3.5 ring-1 ring-inset ring-amber-600/20">
          <TriangleAlert
            className="size-5 shrink-0 text-amber-600"
            aria-hidden
          />
          <div className="text-sm leading-relaxed text-amber-900">
            <p className="font-medium">This setting is not ready yet</p>
            <p className="mt-1">
              Your database is missing the column this is stored in, so saving
              would fail. Ask whoever administers this deployment to apply the
              pending migration. Until then every village uses{" "}
              <span className="font-medium">
                {PRIVACY_LEVEL_META[value].label.toLowerCase()}
              </span>
              , and faces are still covered on the reporter&rsquo;s device
              either way.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
