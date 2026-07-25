"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Loader2,
  MapPin,
  PenLine,
  Camera as CameraIcon,
  Sparkles,
} from "lucide-react";
import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { AiPreview, type AiPreviewFields } from "@/components/ai-preview";
import { IncidentTypeIcon } from "@/components/incident-type-icon";
import { MediaUploader, type AttachedMedia } from "@/components/media-uploader";
import { SeverityBadge } from "@/components/severity-badge";
import { INCIDENT_TYPES, SEVERITIES } from "@/lib/constants";
import { toDateTimeLocalValue } from "@/lib/format";
import {
  incidentFormSchema,
  type IncidentFormValues,
  type StructuredIncident,
} from "@/lib/validations";

/**
 * The report wizard: media → words → place → preview → publish.
 *
 * The target is under a minute, one-handed, outdoors, so each step asks for one
 * thing and the navigation is a fixed pair of buttons in the same place every
 * time. Everything is one react-hook-form instance; the steps only decide which
 * fields are on screen and which get validated before moving on.
 *
 * Media is uploaded as it is attached rather than at publish, because blurring
 * a clip runs at playback speed — doing it at the end would mean a thirty
 * second wait on the button the reporter most wants to be instant. The cost is
 * that abandoning the wizard can leave an orphaned object in storage; removing
 * an attachment deletes it, and a sweep for the rest belongs with the retention
 * job.
 *
 * The AI pass runs on the way into the preview step, not at publish, for the
 * same reason: it is the one moment the reporter is already waiting to read
 * something, and the result is the thing they are about to read. It also means
 * a failure is recoverable in place — the wizard falls back to their own
 * wording, says so, and offers the button again.
 *
 * `description` and `publicDescription` are separate fields throughout.
 * `description` stays the reporter's own words from step 2 and is never
 * overwritten, so stepping back shows what they wrote rather than the rewrite
 * of it; `publicDescription` is what gets published. Everything else Claude
 * returns — category, severity, title, landmark, tags — does write back over
 * the reporter's answer, because categorising is the job it was given and the
 * preview screen is where that gets checked.
 */

// Leaflet dereferences `window` on import, so the picker can never be part of
// the server render. `ssr: false` is only legal from a Client Component — which
// is what this file is.
const LocationPicker = dynamic(
  () => import("@/components/location-picker").then((m) => m.LocationPicker),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 w-full animate-pulse rounded-2xl bg-slate-100 sm:h-96" />
    ),
  },
);

export type IncidentFormVillage = {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  defaultZoom: number;
};

type IncidentFormProps = {
  village: IncidentFormVillage;
};

const STEPS = [
  { title: "Media", hint: "Photo, video or text only", icon: CameraIcon },
  { title: "What happened", hint: "In your own words", icon: PenLine },
  { title: "Where", hint: "Drop a pin", icon: MapPin },
  { title: "Preview", hint: "Check it reads right", icon: Sparkles },
  { title: "Publish", hint: "Confirm and file", icon: Check },
] as const;

/** Fields validated before each step will let you past it. */
const STEP_FIELDS: readonly (readonly (keyof IncidentFormValues)[])[] = [
  [],
  ["type", "severity", "title", "description", "occurredAt"],
  ["lat", "lng", "locationText"],
  [],
  [],
];

/** Index of the step that shows — and therefore triggers — the AI rewrite. */
const PREVIEW_STEP = 3;

/** Cross-referencing result from `POST /api/incidents/process`. */
type PatternResponse = {
  radiusMeters: number;
  windowDays: number;
  nearbyCount: number;
  recurring: boolean;
  patternNote: string | null;
};

/**
 * Response from `POST /api/incidents/process`.
 *
 * `ok: false` is a normal 200 — the AI being unavailable is not an error in the
 * request, and the pattern findings still come back with it.
 */
type ProcessResponse = {
  ok?: boolean;
  code?: string;
  error?: string;
  model?: string;
  incident?: StructuredIncident;
  pattern?: PatternResponse;
};

const inputClass =
  "mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 aria-invalid:border-red-400";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-sm text-red-600">{message}</p>;
}

function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Report progress">
      {STEPS.map((step, index) => {
        const state =
          index < current ? "done" : index === current ? "current" : "todo";

        return (
          <li key={step.title} className="flex-1">
            <span
              className={`block h-1.5 rounded-full transition-colors ${
                state === "todo" ? "bg-slate-200" : "bg-brand-500"
              }`}
              aria-current={state === "current" ? "step" : undefined}
            />
            <span className="sr-only">
              {`Step ${index + 1} of ${STEPS.length}: ${step.title}`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * What the AI pass produced, held outside the form because none of it is
 * something the reporter types. The editable parts were written into the form
 * when the record came back; this is the provenance that rides along at publish.
 */
type AiState = {
  status: "idle" | "processing" | "done" | "failed";
  model: string | null;
  confidence: number | null;
  peopleCount: number | null;
  recurring: boolean;
  patternNote: string | null;
  error: string | null;
  /**
   * The inputs the current record was produced from. Editing any of them on an
   * earlier step means the record on screen is stale, so the pass runs again on
   * the way back in rather than showing a rewrite of something else.
   */
  signature: string | null;
};

const IDLE_AI: AiState = {
  status: "idle",
  model: null,
  confidence: null,
  peopleCount: null,
  recurring: false,
  patternNote: null,
  error: null,
  signature: null,
};

export function IncidentForm({ village }: IncidentFormProps) {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [textOnly, setTextOnly] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [ai, setAi] = useState<AiState>(IDLE_AI);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const form = useForm<IncidentFormValues>({
    resolver: zodResolver(incidentFormSchema),
    mode: "onTouched",
    defaultValues: {
      type: "SUSPICIOUS_ACTIVITY",
      severity: "LOW",
      title: "",
      description: "",
      publicDescription: "",
      tags: [],
      occurredAt: toDateTimeLocalValue(new Date()),
      // The pin starts at the village centre, as specified — the reporter drags
      // it or taps "use my location" on step 3.
      lat: village.centerLat,
      lng: village.centerLng,
      locationText: "",
      isAnonymous: false,
      reportedToPolice: false,
      policeReference: "",
      media: [],
    },
  });

  const {
    control,
    formState: { errors },
    getValues,
    register,
    setValue,
    trigger,
  } = form;

  // `useWatch` rather than `form.watch()`: the latter hands back a function
  // React Compiler refuses to memoise, which quietly opts the whole wizard out
  // of compilation. Watched by name so each value keeps its exact type.
  const media = useWatch({ control, name: "media" });
  const reportedToPolice = useWatch({ control, name: "reportedToPolice" });
  const selectedType = useWatch({ control, name: "type" });
  const selectedSeverity = useWatch({ control, name: "severity" });
  const title = useWatch({ control, name: "title" });
  const description = useWatch({ control, name: "description" });
  const publicDescription = useWatch({ control, name: "publicDescription" });
  const tags = useWatch({ control, name: "tags" });
  const locationText = useWatch({ control, name: "locationText" });
  const occurredAt = useWatch({ control, name: "occurredAt" });

  // The uploader owns the object URLs and the file metadata; the form only
  // needs the parts that get posted. They are keyed the same, so the two stay
  // in step without the uploader having to know about react-hook-form.
  const [attachments, setAttachments] = useState<AttachedMedia[]>([]);

  const previewMedia = useMemo(() => {
    const first = attachments[0];
    if (!first) return null;

    return {
      thumbnailUrl: first.thumbnailUrl,
      kind: first.kind,
      facesBlurred: first.facesDetected,
      additionalCount: attachments.length - 1,
    };
  }, [attachments]);

  function handleAttachmentsChange(next: AttachedMedia[]) {
    setAttachments(next);
    setValue(
      "media",
      next.map((item) => ({
        storagePath: item.storagePath,
        thumbnailPath: item.thumbnailPath,
        mimeType: item.mimeType,
        fileSize: item.fileSize,
        width: item.width,
        height: item.height,
        durationSeconds: item.durationSeconds,
        facesDetected: item.facesDetected,
      })),
      { shouldValidate: false },
    );
  }

  function goTo(next: number) {
    setStep(next);
    // Move focus to the new step's heading so a screen reader announces the
    // change — swapping the panel alone leaves focus on a button that no
    // longer exists.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  /**
   * What the current record was produced from.
   *
   * Only fields Claude does not write back are in here. Category, severity,
   * title, landmark and tags all get overwritten by a successful pass, so
   * including them would make every record instantly look stale and the wizard
   * would reprocess forever on the way in and out of the preview step.
   */
  function aiSignature(values: IncidentFormValues): string {
    return [
      values.description,
      values.lat.toFixed(6),
      values.lng.toFixed(6),
      values.occurredAt,
      values.media[0]?.storagePath ?? "",
    ].join("|");
  }

  /**
   * Send the report to Claude and write the result back into the form.
   *
   * Never throws and never blocks publishing. Every failure — no API key, a
   * timeout, a rate limit, a refusal — ends with the reporter's own wording in
   * `publicDescription` and a plain explanation on screen, which is exactly
   * where the wizard stood before this existed.
   */
  async function runAiPass(force = false) {
    const values = getValues();
    const signature = aiSignature(values);

    if (ai.status === "processing") return;
    if (!force && ai.status !== "idle" && ai.signature === signature) return;

    setAi({ ...IDLE_AI, status: "processing", signature });

    // Whatever is sent has to be a still. For a photo that is the blurred
    // upload itself, which has more for the model to read than its own
    // thumbnail; for a clip it is the blurred JPEG the browser made from the
    // first frame, because an MP4 is not something the model can look at.
    const first = values.media[0];
    const mediaPath = first?.mimeType.startsWith("image/")
      ? first.storagePath
      : first?.thumbnailPath;

    const failWith = (message: string, pattern?: PatternResponse) => {
      setAi({
        ...IDLE_AI,
        status: "failed",
        error: message,
        signature,
        recurring: pattern?.recurring ?? false,
        patternNote: pattern?.patternNote ?? null,
      });
      // Something has to be publishable. The preview says, in as many words,
      // that this is the reporter's own text and has not been anonymised.
      setValue("publicDescription", values.description, {
        shouldValidate: true,
      });
    };

    try {
      const response = await fetch("/api/incidents/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: values.description,
          type: values.type,
          severity: values.severity,
          occurredAt: new Date(values.occurredAt).toISOString(),
          lat: values.lat,
          lng: values.lng,
          locationText: values.locationText || undefined,
          mediaPath,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as ProcessResponse;

      if (!response.ok || !result.ok || !result.incident) {
        failWith(
          result.error ?? "The rewrite could not be produced.",
          result.pattern,
        );
        return;
      }

      const incident = result.incident;

      setValue("type", incident.type, { shouldValidate: true });
      setValue("severity", incident.severity, { shouldValidate: true });
      setValue("title", incident.title, { shouldValidate: true });
      setValue("publicDescription", incident.description, {
        shouldValidate: true,
      });
      setValue("tags", incident.tags, { shouldValidate: true });
      if (incident.location_name) {
        setValue("locationText", incident.location_name, {
          shouldValidate: true,
        });
      }

      setAi({
        status: "done",
        model: result.model ?? null,
        confidence: incident.confidence,
        peopleCount: incident.people_count,
        // The model's judgement first, the count as a backstop: Claude can see
        // "same white van" where counting cannot, and counting still catches a
        // cluster Claude decided was a coincidence.
        recurring: incident.recurring || (result.pattern?.recurring ?? false),
        patternNote: incident.pattern_note ?? result.pattern?.patternNote ?? null,
        error: null,
        signature,
      });
    } catch {
      failWith("Could not reach the rewriting service.");
    }
  }

  async function goNext() {
    const fields = STEP_FIELDS[step];
    if (fields.length > 0) {
      const valid = await trigger(fields, { shouldFocus: true });
      if (!valid) return;
    }

    const next = Math.min(step + 1, STEPS.length - 1);
    goTo(next);

    // The preview is the first screen that shows the rewrite, so this is where
    // it gets made. Not awaited on purpose: the step change should be instant,
    // and the preview renders its own progress state.
    if (next === PREVIEW_STEP) void runAiPass();
  }

  function applyPreviewFields(next: AiPreviewFields) {
    setValue("type", next.type, { shouldValidate: true });
    setValue("severity", next.severity, { shouldValidate: true });
    setValue("title", next.title, { shouldValidate: true });
    setValue("publicDescription", next.description, { shouldValidate: true });
    setValue("locationText", next.locationText, { shouldValidate: true });
    setValue("tags", next.tags, { shouldValidate: true });
  }

  async function publish() {
    const valid = await trigger();
    if (!valid) {
      toast.error("Something is missing — check the earlier steps.");
      return;
    }

    setPublishing(true);

    const values = getValues();
    const rewritten = values.publicDescription.trim().length > 0;

    try {
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          // The two description columns. `description` is what the map will
          // show; `rawDescription` is the reporter's verbatim words, sent only
          // when they are genuinely different text — with no rewrite there is
          // one description and the server writes it to both.
          description: rewritten ? values.publicDescription : values.description,
          rawDescription: rewritten ? values.description : undefined,
          // The server schema coerces, but sending an ISO string keeps the
          // reporter's own timezone out of the wire format.
          occurredAt: new Date(values.occurredAt).toISOString(),
          locationText: values.locationText || undefined,
          policeReference: values.policeReference || undefined,
          ai:
            ai.status === "done" && ai.model
              ? {
                  model: ai.model,
                  confidence: ai.confidence ?? undefined,
                  peopleCount: ai.peopleCount ?? undefined,
                  recurring: ai.recurring,
                  patternNote: ai.patternNote ?? undefined,
                }
              : undefined,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(result.error ?? "Could not file your report");
        return;
      }

      toast.success(
        `Report ${result.reference} filed — your coordinator will review it.`,
      );
      router.replace(result.redirectTo ?? "/incidents");
      router.refresh();
    } catch {
      toast.error("Network error — check your connection and try again.");
    } finally {
      setPublishing(false);
    }
  }

  const currentStep = STEPS[step]!;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <StepIndicator current={step} />

      <div className="mt-5 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
          <currentStep.icon className="size-5" aria-hidden />
        </span>
        <div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-semibold tracking-tight text-slate-900 outline-none sm:text-2xl"
          >
            {currentStep.title}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Step {step + 1} of {STEPS.length} · {currentStep.hint}
          </p>
        </div>
      </div>

      {/*
        No `onSubmit` — publishing is an explicit button on the last step, and a
        stray Enter key on step 2 must not file a report the reporter has not
        seen previewed yet.
      */}
      <form className="mt-6" onSubmit={(event) => event.preventDefault()}>
        {step === 0 && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={textOnly}
                  onChange={(event) => setTextOnly(event.target.checked)}
                  disabled={attachments.length > 0}
                  className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                />
                <span className="text-sm">
                  <span className="flex items-center gap-2 font-medium text-slate-800">
                    <FileText className="size-4 text-slate-400" aria-hidden />
                    Report this in words only
                  </span>
                  <span className="mt-0.5 block text-slate-500">
                    {attachments.length > 0
                      ? "Remove the attached media first."
                      : "Skip the camera — most reports do not need a photo."}
                  </span>
                </span>
              </label>
            </div>

            {!textOnly && (
              <MediaUploader
                value={attachments}
                onChange={handleAttachmentsChange}
                disabled={publishing}
              />
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">
                What happened
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {INCIDENT_TYPES.map((option) => {
                  const active = selectedType === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setValue("type", option.value as IncidentType, {
                          shouldValidate: true,
                        })
                      }
                      aria-pressed={active}
                      title={option.description}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        active
                          ? "border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <IncidentTypeIcon
                        type={option.value as IncidentType}
                        className="size-4 shrink-0"
                      />
                      <span className="min-w-0 truncate">{option.label}</span>
                    </button>
                  );
                })}
              </div>
              <FieldError message={errors.type?.message} />
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium text-slate-700">
                How serious is it
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {SEVERITIES.map((option) => {
                  const active = selectedSeverity === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setValue("severity", option.value as Severity, {
                          shouldValidate: true,
                        })
                      }
                      aria-pressed={active}
                      title={option.description}
                      className={`rounded-xl border px-2 py-1.5 transition ${
                        active
                          ? "border-brand-500 ring-1 ring-brand-500"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <SeverityBadge
                        severity={option.value as Severity}
                        size="sm"
                      />
                    </button>
                  );
                })}
              </div>
              <FieldError message={errors.severity?.message} />
            </fieldset>

            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium text-slate-700"
              >
                Give it a short title
              </label>
              <input
                id="title"
                type="text"
                maxLength={120}
                aria-invalid={Boolean(errors.title)}
                className={inputClass}
                placeholder="Shed broken into overnight"
                {...register("title")}
              />
              <FieldError message={errors.title?.message} />
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-slate-700"
              >
                What did you see?
              </label>
              <textarea
                id="description"
                rows={5}
                maxLength={4000}
                aria-invalid={Boolean(errors.description)}
                className={`${inputClass} resize-y`}
                placeholder="Write it however it comes out — three or four sentences is plenty."
                {...register("description")}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Your own wording is kept for your coordinator and is never shown
                to other residents. Even so, leave out names and registrations.
              </p>
              <FieldError message={errors.description?.message} />
            </div>

            <div>
              <label
                htmlFor="occurredAt"
                className="block text-sm font-medium text-slate-700"
              >
                When did it happen?
              </label>
              <input
                id="occurredAt"
                type="datetime-local"
                aria-invalid={Boolean(errors.occurredAt)}
                className={inputClass}
                {...register("occurredAt")}
              />
              <FieldError message={errors.occurredAt?.message} />
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  {...register("isAnonymous")}
                />
                <span className="text-sm text-slate-600">
                  Hide my name from other residents. Your coordinator can still
                  see who filed it.
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  {...register("reportedToPolice")}
                />
                <span className="text-sm text-slate-600">
                  I have already reported this to the police.
                </span>
              </label>

              {reportedToPolice && (
                <div>
                  <label
                    htmlFor="policeReference"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Police reference
                  </label>
                  <input
                    id="policeReference"
                    type="text"
                    maxLength={60}
                    aria-invalid={Boolean(errors.policeReference)}
                    className={`${inputClass} font-mono`}
                    placeholder="CR/12345/26"
                    {...register("policeReference")}
                  />
                  <FieldError message={errors.policeReference?.message} />
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <Controller
              control={control}
              name="lat"
              render={({ field: latField }) => (
                <Controller
                  control={control}
                  name="lng"
                  render={({ field: lngField }) => (
                    <LocationPicker
                      value={{ lat: latField.value, lng: lngField.value }}
                      onChange={({ lat, lng }) => {
                        latField.onChange(lat);
                        lngField.onChange(lng);
                      }}
                      center={{
                        lat: village.centerLat,
                        lng: village.centerLng,
                      }}
                      zoom={village.defaultZoom}
                    />
                  )}
                />
              )}
            />

            <div>
              <label
                htmlFor="locationText"
                className="block text-sm font-medium text-slate-700"
              >
                Landmark <span className="text-slate-400">(optional)</span>
              </label>
              <input
                id="locationText"
                type="text"
                maxLength={200}
                aria-invalid={Boolean(errors.locationText)}
                className={inputClass}
                placeholder="The lane behind the village hall"
                {...register("locationText")}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Describe the area, not an address. No house numbers.
              </p>
              <FieldError message={errors.locationText?.message} />
            </div>
          </div>
        )}

        {(step === PREVIEW_STEP || step === PREVIEW_STEP + 1) && (
          <AiPreview
            mode={step === PREVIEW_STEP ? "review" : "publish"}
            fields={{
              type: selectedType,
              severity: selectedSeverity,
              title,
              // Falls back to the reporter's own words for the moment between
              // arriving at this step and the rewrite coming back.
              description: publicDescription || description,
              locationText,
              tags,
            }}
            onFieldsChange={applyPreviewFields}
            occurredAt={new Date(occurredAt)}
            media={previewMedia}
            onPublish={publish}
            publishing={publishing}
            aiProcessed={ai.status === "done"}
            processing={ai.status === "processing"}
            aiError={ai.status === "failed" ? ai.error : null}
            patternNote={ai.patternNote}
            onReprocess={() => void runAiPass(true)}
          />
        )}

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-200 pt-5">
          <button
            type="button"
            onClick={() => goTo(Math.max(step - 1, 0))}
            disabled={step === 0 || publishing}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              {step === 0 && media.length === 0 && !textOnly
                ? "Skip for now"
                : "Continue"}
              <ArrowRight className="size-4" aria-hidden />
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm text-slate-500">
              {publishing && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
              Filing to {village.name}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
