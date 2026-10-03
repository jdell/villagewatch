"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type L from "leaflet";
import { toast } from "sonner";
import {
  Camera,
  Check,
  ChevronLeft,
  Loader2,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { IncidentTypeIcon } from "@/components/incident-type-icon";
import { MediaUploader, type AttachedMedia } from "@/components/media-uploader";
import { BottomSheet } from "@/components/modern/bottom-sheet";
import { VoiceInput } from "@/components/voice-input";
import { INCIDENT_TYPES, SEVERITIES, type PrivacyLevel } from "@/lib/constants";
import { PIN_HEAT } from "@/lib/map/glyph-pin";
import { PRIMARY_MAP_TYPES } from "@/lib/map/filters";
import {
  DRAFT_MIN_CHARS,
  WHEN_OPTIONS,
  buildReportPayload,
  fallbackTitle,
  occurredAtFor,
  type DraftAiMeta,
  type WhenChoice,
} from "@/lib/map/report-draft";

/**
 * The report flow on the map — "describe and draft", in two steps over the map.
 *
 * 1. **What happened?** The reporter describes it in their own words, typed or
 *    spoken into the same box (`VoiceInput`'s inline mic — transcribed on the
 *    device, the recording never sent), and may add a photo, which is blurred
 *    on the device before it is uploaded (domain rule 3). "Draft my report"
 *    sends the words to `POST /api/incidents/process` — the same AI pass, the
 *    same quota and the same anonymisation the wizard uses.
 * 2. **Check and send.** The draft comes back as a category, a title, the
 *    rewrite neighbours will read and a suggested severity, every one of them
 *    editable, while the map stays live above the sheet: the reporter drags it
 *    until the dashed crosshair sits where it happened. "Send report" files it
 *    through `POST /api/incidents` with the wizard's exact body
 *    (`buildReportPayload`).
 *
 * Then a confirmation with the reference and "View on map", which shows the new
 * pin — dashed, "yours, in review", until a coordinator publishes it.
 *
 * ## What it never does
 *
 * - **It never blocks on the AI.** A failed or rate-limited draft moves on to
 *   step 2 with the reporter's own words, a category to choose and a title made
 *   from their first line — the wizard's rule that being limited never stops
 *   anybody filing.
 * - **It never sends the pin's exact point as anything but the report's
 *   location**, and the server fuzzes that before storing it (domain rule 2).
 *   The device position is used to start the pin and nothing else.
 * - **It never opens past a gate.** A village that is suspended or has not
 *   accepted its compliance documents gets the refusal, as the wizard's page
 *   renders it — `POST /api/incidents` would refuse anyway.
 *
 * It is the mobile flow. The five-step wizard at `/incidents/new` is unchanged
 * and is still what the desktop sidebar opens.
 */

export type ReportGate =
  | { ok: true }
  | { ok: false; title: string; message: string; fix?: { href: string; label: string } };

type Step = "describe" | "confirm" | "sent";

type ProcessResponse = {
  ok?: boolean;
  error?: string;
  model?: string;
  incident?: {
    type: IncidentType;
    severity: Severity;
    title: string;
    description: string;
    tags: string[];
    location_name: string;
    people_count: number | null;
    recurring: boolean;
    pattern_note: string | null;
    confidence: number;
    severity_rationale: string;
  };
  pattern?: { recurring: boolean; patternNote: string | null };
};

type FiledReport = {
  id: string;
  reference: string;
  autoApproved: boolean;
  lat: number;
  lng: number;
};

type ReportFlowProps = {
  open: boolean;
  onClose: () => void;
  /** The live map — read for the starting point and the crosshair's position. */
  getMap: () => L.Map | null;
  gate: ReportGate;
  privacyLevel: PrivacyLevel;
  /** Whether the reporter moderates this village — the success sheet's extra link. */
  canPostAlert: boolean;
  /** Called with the filed report, so the map can show it. */
  onViewOnMap: (report: FiledReport) => void;
};

const inputClass =
  "block w-full rounded-xl border border-[#cbd5e1] bg-white px-3 py-2.5 text-[15px] leading-[1.4] text-[#0f172a] outline-none transition placeholder:text-[#94a3b8] focus:border-[#0284c7] focus:ring-2 focus:ring-[#0284c7]/20";

function labelOf(type: IncidentType) {
  return INCIDENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function ReportFlow({
  open,
  onClose,
  getMap,
  gate,
  privacyLevel,
  canPostAlert,
  onViewOnMap,
}: ReportFlowProps) {
  const router = useRouter();

  const [step, setStep] = useState<Step>("describe");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<AttachedMedia[]>([]);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);

  // The draft — every field the AI fills and the reporter can change.
  const [type, setType] = useState<IncidentType | null>(null);
  const [severity, setSeverity] = useState<Severity>("LOW");
  const [title, setTitle] = useState("");
  const [publicDescription, setPublicDescription] = useState("");
  const [locationText, setLocationText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [ai, setAi] = useState<DraftAiMeta | null>(null);
  const [aiFailed, setAiFailed] = useState<string | null>(null);
  const [chooseType, setChooseType] = useState(false);
  const [moreTypes, setMoreTypes] = useState(false);
  const [when, setWhen] = useState<WhenChoice>("now");
  const [customWhen, setCustomWhen] = useState("");

  const [filed, setFiled] = useState<FiledReport | null>(null);

  /** Where the pin starts: the device, if it will say, else the map's centre. */
  const startRef = useRef<{ lat: number; lng: number } | null>(null);
  const crosshairRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    setStep("describe");
    setDescription("");
    setAttachments([]);
    setPhotoOpen(false);
    setType(null);
    setSeverity("LOW");
    setTitle("");
    setPublicDescription("");
    setLocationText("");
    setTags([]);
    setAi(null);
    setAiFailed(null);
    setChooseType(false);
    setMoreTypes(false);
    setWhen("now");
    setCustomWhen("");
    setFiled(null);
    startRef.current = null;
  }, []);

  // On opening: start the pin where the reporter is, because most reports are
  // made where somebody is standing — design option 1i. Asked once, quietly;
  // a refusal leaves the map's centre, which the reporter then drags.
  useEffect(() => {
    if (!open || !gate.ok) return;
    const centre = getMap()?.getCenter();
    if (centre) startRef.current = { lat: centre.lat, lng: centre.lng };
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        startRef.current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 },
    );
  }, [open, gate.ok, getMap]);

  /** The point under the dashed crosshair, in the map's own coordinates. */
  function crosshairPoint(map: L.Map): [number, number] | null {
    const mark = crosshairRef.current?.getBoundingClientRect();
    const box = map.getContainer().getBoundingClientRect();
    if (!mark) return null;
    return [
      mark.left + mark.width / 2 - box.left,
      mark.top + mark.height / 2 - box.top,
    ];
  }

  // Into step 2: bring the starting point under the crosshair, so the pin is
  // already right for anybody reporting where they stand.
  useEffect(() => {
    if (step !== "confirm") return;
    const frame = requestAnimationFrame(() => {
      const map = getMap();
      const start = startRef.current;
      const point = map ? crosshairPoint(map) : null;
      if (!map || !start || !point) return;
      const at = map.latLngToContainerPoint([start.lat, start.lng]);
      map.panBy([at.x - point[0], at.y - point[1]], { animate: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [step, getMap]);

  function close() {
    onClose();
    reset();
  }

  const trimmed = description.trim();
  const canDraft = trimmed.length >= DRAFT_MIN_CHARS && !voiceBusy && !drafting;

  async function draft() {
    if (!canDraft) return;
    setDrafting(true);

    const start = startRef.current ?? getMap()?.getCenter() ?? null;
    const first = attachments[0];
    const mediaPath = first
      ? first.mimeType.startsWith("image/")
        ? first.storagePath
        : first.thumbnailPath
      : undefined;

    const fallBack = (message: string) => {
      setAi(null);
      setAiFailed(message);
      setType(null);
      setChooseType(true);
      setSeverity("LOW");
      setTitle(fallbackTitle(trimmed));
      setPublicDescription("");
      setTags([]);
      setStep("confirm");
    };

    try {
      const response = await fetch("/api/incidents/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: trimmed,
          occurredAt: occurredAtFor(when, customWhen, Date.now()),
          lat: start?.lat,
          lng: start?.lng,
          mediaPath,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as ProcessResponse;

      if (!response.ok || !result.ok || !result.incident) {
        fallBack(result.error ?? "The draft could not be written this time.");
        return;
      }

      const incident = result.incident;
      setType(incident.type);
      setSeverity(incident.severity);
      setTitle(incident.title);
      setPublicDescription(incident.description);
      setLocationText(incident.location_name ?? "");
      setTags(incident.tags ?? []);
      setAiFailed(null);
      setChooseType(false);
      setAi(
        result.model
          ? {
              model: result.model,
              confidence: incident.confidence,
              peopleCount: incident.people_count ?? undefined,
              recurring: incident.recurring || (result.pattern?.recurring ?? false),
              patternNote:
                incident.pattern_note ?? result.pattern?.patternNote ?? undefined,
              severityRationale: incident.severity_rationale,
            }
          : null,
      );
      setStep("confirm");
    } catch {
      fallBack("Could not reach the drafting service.");
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    const map = getMap();
    const point = map ? crosshairPoint(map) : null;
    if (!map || !point) {
      toast.error("The map is not ready yet — try again in a moment.");
      return;
    }
    if (!type) {
      setChooseType(true);
      toast.error("Choose what happened first.");
      return;
    }
    if (title.trim().length < 5) {
      toast.error("Give the report a short title.");
      return;
    }

    const at = map.containerPointToLatLng(point);
    setSending(true);

    try {
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildReportPayload({
            description: trimmed,
            publicDescription,
            title,
            type,
            severity,
            occurredAt: occurredAtFor(when, customWhen, Date.now()),
            lat: at.lat,
            lng: at.lng,
            locationText,
            tags,
            media: attachments.map((item) => ({
              storagePath: item.storagePath,
              thumbnailPath: item.thumbnailPath,
              mimeType: item.mimeType,
              fileSize: item.fileSize,
              width: item.width,
              height: item.height,
              durationSeconds: item.durationSeconds,
              facesDetected: item.facesDetected,
            })),
            ai,
          }),
        ),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(result.error ?? "Could not file your report");
        return;
      }

      setFiled({
        id: result.id,
        reference: result.reference,
        autoApproved: Boolean(result.autoApproved),
        lat: at.lat,
        lng: at.lng,
      });
      setStep("sent");
      // The new pin — the reporter's own, dashed while it waits — comes from
      // the server, so the map's data is fetched again rather than faked here.
      router.refresh();
    } catch {
      toast.error("Network error — check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  if (!gate.ok) {
    return (
      <BottomSheet open onClose={close} modal labelledBy="report-blocked-title">
        <div className="flex flex-col items-center gap-2.5 px-5 pt-6 pb-7 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-amber-50 text-amber-600">
            <ShieldAlert className="size-7" aria-hidden />
          </span>
          <h2 id="report-blocked-title" className="text-xl font-[650] text-[#0f172a]">
            {gate.title}
          </h2>
          <p className="max-w-xs text-sm leading-relaxed text-[#475569]">{gate.message}</p>
          <div className="mt-2 flex w-full gap-2">
            <button
              type="button"
              onClick={close}
              className="h-12 flex-1 rounded-[14px] border border-[#e2e8f0] bg-white text-[15px] font-semibold"
            >
              Close
            </button>
            {gate.fix && (
              <Link
                href={gate.fix.href}
                className="grid h-12 flex-1 place-items-center rounded-[14px] bg-[#0284c7] text-[15px] font-semibold text-white"
              >
                {gate.fix.label}
              </Link>
            )}
          </div>
          <p className="mt-2 text-xs text-[#64748b]">
            In an emergency call 999. For non-urgent police matters call 101.
          </p>
        </div>
      </BottomSheet>
    );
  }

  const shownTypes: IncidentType[] = moreTypes
    ? INCIDENT_TYPES.map((t) => t.value)
    : [...PRIMARY_MAP_TYPES];

  return (
    <>
      {/* Step 2's placement chrome, drawn on the map itself — not portalled. */}
      {step === "confirm" && (
        <>
          <div className="pointer-events-auto absolute top-[calc(12px+env(safe-area-inset-top))] right-3 left-3 flex h-14 items-center gap-2.5 rounded-2xl bg-[#0f172a] pr-2 pl-4 text-white shadow-[0_6px_20px_rgba(15,23,42,.25)]">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[14.5px] font-semibold">
                Drag the map to place the pin
              </span>
              <span className="truncate text-[12.5px] text-[#cbd5e1]">
                {locationText ? `Near ${locationText}` : "Where it happened, not where you are"}
              </span>
            </span>
            <button
              type="button"
              onClick={close}
              className="h-10 rounded-xl bg-white/15 px-3.5 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
          <div
            ref={crosshairRef}
            className="pointer-events-none absolute top-[calc(21dvh+env(safe-area-inset-top)/2)] left-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center"
            aria-hidden
          >
            <span className="absolute inset-0 rounded-full border-[1.5px] border-[rgba(2,132,199,.5)] bg-[rgba(2,132,199,.18)]" />
            <span className="relative grid size-9 place-items-center rounded-full border-[2.5px] border-dashed border-[#0284c7] bg-white shadow-[0_4px_10px_rgba(15,23,42,.3)]">
              {type ? (
                <IncidentTypeIcon type={type} className="size-[17px] text-[#0284c7]" />
              ) : (
                <span className="text-lg leading-none font-semibold text-[#0284c7]">+</span>
              )}
            </span>
          </div>
        </>
      )}

      <BottomSheet
        open={step === "describe"}
        onClose={close}
        modal
        labelledBy="report-step-1"
        maxHeightClass="max-h-[88dvh]"
        footer={
          <button
            type="button"
            onClick={() => void draft()}
            disabled={!canDraft}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#0284c7] text-base font-[650] text-white transition hover:bg-[#0369a1] active:bg-[#0369a1] disabled:bg-[#94a3b8]"
          >
            {drafting ? (
              <>
                <Loader2 className="size-5 animate-spin" aria-hidden />
                Drafting your report…
              </>
            ) : (
              <>
                <Sparkles className="size-5" aria-hidden />
                Draft my report
              </>
            )}
          </button>
        }
      >
        <div className="flex flex-col gap-3.5 px-4 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex flex-1 flex-col gap-[3px]">
              <span className="font-mono text-[11px] font-semibold tracking-[.04em] text-[#64748b]">
                STEP 1 OF 2
              </span>
              <h2 id="report-step-1" className="text-xl font-[650] text-[#0f172a]">
                What happened?
              </h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Cancel report"
              className="grid size-10 place-items-center rounded-full bg-[#f1f5f9] text-[#334155]"
            >
              <X className="size-[18px]" aria-hidden />
            </button>
          </div>

          <div className="flex flex-col">
            <div className="relative">
              <label htmlFor="report-description" className="sr-only">
                What did you see?
              </label>
              <textarea
                id="report-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                maxLength={4000}
                placeholder="Type, or tap the mic and say what you saw"
                className={`${inputClass} resize-none pr-14`}
              />
              <VoiceInput
                variant="inline"
                onTranscript={(text) =>
                  setDescription((current) =>
                    current.trim() ? `${current.trim()} ${text}` : text,
                  )
                }
                onBusyChange={setVoiceBusy}
                disabled={drafting}
              />
            </div>
            <p className="mt-1 text-xs text-[#64748b]">
              {trimmed.length < DRAFT_MIN_CHARS
                ? `A sentence or two is enough — at least ${DRAFT_MIN_CHARS} characters.`
                : "Names, plates and house numbers are taken out of the version your neighbours read."}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPhotoOpen((value) => !value)}
              aria-expanded={photoOpen}
              aria-label={attachments.length ? "Photos attached" : "Add photo"}
              className={`flex size-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] border-dashed ${
                attachments.length
                  ? "border-[#0284c7] bg-[repeating-linear-gradient(135deg,#e0f2fe_0_6px,#f0f9ff_6px_12px)]"
                  : "border-[#94a3b8] bg-white"
              }`}
            >
              {attachments.length ? (
                <Check className="size-5 text-[#0369a1]" aria-hidden />
              ) : (
                <Camera className="size-5 text-[#475569]" aria-hidden />
              )}
              <span className="font-mono text-[10px] font-medium text-[#475569]">
                {attachments.length ? `${attachments.length} added` : "Add"}
              </span>
            </button>
            <span className="text-[13px] leading-[1.4] text-[#475569]">
              Photo (optional). Faces are covered on your phone before anything
              is uploaded.
            </span>
          </div>

          {photoOpen && (
            <MediaUploader
              value={attachments}
              onChange={setAttachments}
              privacyLevel={privacyLevel}
              disabled={drafting}
            />
          )}

          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-[#334155]">When</legend>
            <WhenChips when={when} onChange={setWhen} />
            {when === "custom" && (
              <input
                type="datetime-local"
                aria-label="When it happened"
                value={customWhen}
                onChange={(event) => setCustomWhen(event.target.value)}
                className={`${inputClass} mt-2 h-11`}
              />
            )}
          </fieldset>
        </div>
      </BottomSheet>

      <BottomSheet
        open={step === "confirm"}
        onClose={close}
        labelledBy="report-step-2"
        maxHeightClass="h-[58dvh]"
        footer={
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#0284c7] text-base font-[650] text-white transition hover:bg-[#0369a1] active:bg-[#0369a1] disabled:opacity-70"
          >
            {sending && <Loader2 className="size-5 animate-spin" aria-hidden />}
            {sending ? "Sending…" : "Send report"}
          </button>
        }
      >
        <div className="flex flex-col gap-4 px-4 pt-3.5 pb-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setStep("describe")}
              aria-label="Back to your description"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f1f5f9] text-[#334155]"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <span className="flex flex-col gap-0.5">
              <span className="font-mono text-[11px] font-semibold tracking-[.04em] text-[#64748b]">
                STEP 2 OF 2
              </span>
              <h2 id="report-step-2" className="text-lg font-[650] text-[#0f172a]">
                Check it and place the pin
              </h2>
            </span>
          </div>

          {ai ? (
            <p className="flex items-start gap-2 rounded-xl bg-[#f0f9ff] px-3 py-2.5 text-[13px] leading-snug text-[#075985]">
              <Sparkles className="mt-px size-4 shrink-0" aria-hidden />
              Drafted from your words. Check every part reads right — you can
              change any of it.
            </p>
          ) : (
            aiFailed && (
              <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-[13px] leading-snug text-amber-900">
                <p className="font-medium">No draft this time: {aiFailed}</p>
                <p className="mt-1">
                  Choose what happened and check the title. Your own words will
                  be sent, and your coordinator reviews every report.
                </p>
              </div>
            )
          )}

          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-[#334155]">What happened</span>
            {type && !chooseType ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex h-10 items-center gap-2 rounded-[20px] bg-[#0f172a] pr-3.5 pl-3 text-[13.5px] font-[550] text-white">
                  <IncidentTypeIcon type={type} className="size-[15px]" />
                  {labelOf(type)}
                </span>
                <button
                  type="button"
                  onClick={() => setChooseType(true)}
                  className="h-10 px-2 text-sm font-semibold text-[#0369a1]"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {shownTypes.map((option) => {
                    const on = type === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          setType(option);
                          setChooseType(false);
                        }}
                        className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-[14px] border px-1 py-2 hover:bg-[#f0f9ff] ${
                          on ? "border-[#0284c7] bg-[#f0f9ff]" : "border-[#e2e8f0] bg-white"
                        }`}
                      >
                        <span className="grid size-[34px] place-items-center rounded-full bg-[#f1f5f9]">
                          <IncidentTypeIcon
                            type={option}
                            className={`size-5 ${on ? "text-[#0369a1]" : "text-[#0f172a]"}`}
                          />
                        </span>
                        <span className="text-center text-[11.5px] leading-tight font-[550] text-[#1e293b]">
                          {labelOf(option)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!moreTypes && (
                  <button
                    type="button"
                    onClick={() => setMoreTypes(true)}
                    className="h-11 rounded-xl border border-[#e2e8f0] bg-white text-sm font-[550]"
                  >
                    More categories ({INCIDENT_TYPES.length - PRIMARY_MAP_TYPES.length})
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="report-title" className="text-[13px] font-semibold text-[#334155]">
              Title
            </label>
            <input
              id="report-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              className={`${inputClass} h-11`}
            />
          </div>

          {publicDescription && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="report-public"
                className="text-[13px] font-semibold text-[#334155]"
              >
                What your neighbours will read
              </label>
              <textarea
                id="report-public"
                value={publicDescription}
                onChange={(event) => setPublicDescription(event.target.value)}
                rows={3}
                maxLength={4000}
                className={`${inputClass} resize-none text-[14.5px]`}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-[#334155]">
              How serious?{" "}
              <span className="font-medium text-[#64748b]">
                · {ai ? "suggested by AI" : "your choice"}
              </span>
            </span>
            <div className="flex gap-1.5" role="radiogroup" aria-label="How serious">
              {SEVERITIES.map((option) => {
                const value = option.value as Severity;
                const on = severity === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setSeverity(value)}
                    className={`flex h-10 flex-1 items-center justify-center gap-[5px] rounded-xl border-[1.5px] text-[13px] font-semibold ${
                      on ? "bg-[#f8fafc] text-[#0f172a]" : "border-[#e2e8f0] bg-white text-[#334155]"
                    }`}
                    style={on ? { borderColor: PIN_HEAT[value] } : undefined}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: PIN_HEAT[value] }}
                      aria-hidden
                    />
                    {option.label}
                  </button>
                );
              })}
            </div>
            {ai?.severityRationale && (
              <p className="text-xs text-[#64748b]">{ai.severityRationale}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="report-landmark" className="text-[13px] font-semibold text-[#334155]">
              Landmark <span className="font-medium text-[#64748b]">(optional)</span>
            </label>
            <input
              id="report-landmark"
              value={locationText}
              onChange={(event) => setLocationText(event.target.value)}
              maxLength={200}
              placeholder="e.g. the bus stop on Station Road"
              className={`${inputClass} h-11`}
            />
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={step === "sent"} onClose={close} labelledBy="report-sent">
        {filed && (
          <div className="flex flex-col items-center gap-2.5 px-[18px] pt-6 pb-7 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-[#e0f2fe]">
              <Check className="size-7 text-[#0369a1]" strokeWidth={2.5} aria-hidden />
            </span>
            <h2 id="report-sent" className="text-xl font-[650] text-[#0f172a]">
              {filed.autoApproved ? "Report published" : "Report sent"}
            </h2>
            <span className="font-mono text-[13px] font-semibold text-[#0369a1]">
              {filed.reference}
            </span>
            <p className="max-w-[300px] text-sm leading-relaxed text-[#475569]">
              {filed.autoApproved
                ? "It is on the map now, and neighbours who asked to hear about it have been alerted."
                : "Your coordinator will review it. Until then it shows on the map with a dashed outline, and only to you."}
            </p>
            {canPostAlert && filed.autoApproved && (
              <Link
                href={`/incidents/${filed.id}`}
                className="text-sm font-semibold text-[#0369a1] underline underline-offset-2"
              >
                Post it to your WhatsApp Channel
              </Link>
            )}
            <div className="mt-2 flex w-full gap-2">
              <button
                type="button"
                onClick={close}
                className="h-12 flex-1 rounded-[14px] border border-[#e2e8f0] bg-white text-[15px] font-semibold"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => {
                  const report = filed;
                  close();
                  onViewOnMap(report);
                }}
                className="h-12 flex-1 rounded-[14px] bg-[#0284c7] text-[15px] font-semibold text-white"
              >
                View on map
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </>
  );
}

function WhenChips({
  when,
  onChange,
}: {
  when: WhenChoice;
  onChange: (value: WhenChoice) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {WHEN_OPTIONS.map((option) => {
        const on = when === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={`h-10 rounded-[20px] border px-[13px] text-[13.5px] font-[550] ${
              on
                ? "border-[#0f172a] bg-[#0f172a] text-white"
                : "border-[#e2e8f0] bg-white text-[#334155]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
