"use client";

import { useState } from "react";
import {
  Check,
  Loader2,
  Pencil,
  Send,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  X,
} from "lucide-react";
import type { IncidentType, Severity } from "@/generated/prisma/enums";
import {
  IncidentCard,
  type IncidentCardMedia,
} from "@/components/incident-card";
import { INCIDENT_TYPES, SEVERITIES } from "@/lib/constants";

/**
 * The report as everyone else will see it.
 *
 * The card is the very same `IncidentCard` the map and list render, so what the
 * reporter approves here is literally what their neighbours get. From the AI
 * pass onwards it shows Claude's structured, anonymised rewrite; when that pass
 * is unavailable it shows the reporter's own words instead, under a warning
 * that says so. The reporter is never led to believe their wording has been
 * anonymised when it has not — that is what `aiProcessed` is for, and it is
 * why it defaults to false.
 *
 * Two modes, used by consecutive steps of the wizard:
 *   `review`  — read it, edit it, reprocess it.
 *   `publish` — confirm and file it.
 */

export type AiPreviewFields = {
  type: IncidentType;
  severity: Severity;
  title: string;
  description: string;
  locationText: string;
  tags: string[];
};

type AiPreviewProps = {
  mode: "review" | "publish";
  fields: AiPreviewFields;
  onFieldsChange: (fields: AiPreviewFields) => void;
  occurredAt: Date;
  media?: IncidentCardMedia | null;
  /** Required in `publish` mode. */
  onPublish?: () => void;
  publishing?: boolean;
  /**
   * True once Claude has returned a record. Drives the notice above the card —
   * a reporter must never be led to believe their words have been anonymised
   * when they have not.
   */
  aiProcessed?: boolean;
  /** Re-runs the AI pass. Omit to render the control disabled. */
  onReprocess?: () => void;
  processing?: boolean;
  /** Why the last AI pass did not produce a record, in words a resident reads. */
  aiError?: string | null;
  /** Cross-referencing result, when there is one worth showing. */
  patternNote?: string | null;
  /** Wizard navigation, rendered below everything else. */
  footer?: React.ReactNode;
};

const inputClass =
  "mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/** Comma-separated text → clean tag list. Shared by the input and the save. */
function parseTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length >= 2 && tag.length <= 32),
    ),
  ].slice(0, 5);
}

function Disclaimer() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold leading-relaxed text-slate-800">
        You are responsible for the accuracy of what you publish. Do not include
        names or identifying details.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        If a crime is in progress or anyone is in danger, call 999. VillageWatch
        is not monitored by the police.
      </p>
    </div>
  );
}

function StatusNotice({
  processing,
  aiProcessed,
  aiError,
}: {
  processing: boolean;
  aiProcessed: boolean;
  aiError?: string | null;
}) {
  if (processing) {
    return (
      <div className="flex gap-3 rounded-xl bg-brand-50 p-3.5 ring-1 ring-brand-100">
        <Loader2
          className="size-5 shrink-0 animate-spin text-brand-600"
          aria-hidden
        />
        <p className="text-sm leading-relaxed text-brand-900" role="status">
          Rewriting your report without the personal details…
        </p>
      </div>
    );
  }

  if (aiProcessed) {
    return (
      <div className="flex gap-3 rounded-xl bg-brand-50 p-3.5 ring-1 ring-brand-100">
        <Sparkles className="size-5 shrink-0 text-brand-600" aria-hidden />
        <div className="text-sm leading-relaxed text-brand-900">
          <p className="font-medium">This is the anonymised version</p>
          <p className="mt-1 text-brand-800">
            Your own wording is kept for your coordinator. Check this reads
            correctly — you can edit it or rewrite it again before publishing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 rounded-xl bg-amber-50 p-3.5 ring-1 ring-amber-200">
      <TriangleAlert className="size-5 shrink-0 text-amber-600" aria-hidden />
      <div className="text-sm leading-relaxed text-amber-900">
        <p className="font-medium">Not anonymised</p>
        <p className="mt-1 text-amber-800">
          {aiError
            ? `${aiError} This is your own wording.`
            : "Automatic anonymisation did not run, so this is your own wording."}{" "}
          Your report goes to your coordinator for review before anyone else can
          see it — read it through now and take out anything that identifies a
          person.
        </p>
      </div>
    </div>
  );
}

export function AiPreview({
  mode,
  fields,
  onFieldsChange,
  occurredAt,
  media,
  onPublish,
  publishing = false,
  aiProcessed = false,
  onReprocess,
  processing = false,
  aiError,
  patternNote,
  footer,
}: AiPreviewProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fields);
  // Held as raw text rather than parsed on every keystroke, so typing the comma
  // in "white van, evening" does not delete the space you just typed after it.
  const [tagsText, setTagsText] = useState(fields.tags.join(", "));
  const [acknowledged, setAcknowledged] = useState(false);

  function startEditing() {
    setDraft(fields);
    setTagsText(fields.tags.join(", "));
    setEditing(true);
  }

  function saveEdits() {
    onFieldsChange({
      ...draft,
      title: draft.title.trim(),
      description: draft.description.trim(),
      locationText: draft.locationText.trim(),
      tags: parseTags(tagsText),
    });
    setEditing(false);
  }

  return (
    <div className="space-y-4">
      <StatusNotice
        processing={processing}
        aiProcessed={aiProcessed}
        aiError={aiError}
      />

      {patternNote && (
        <div className="flex gap-3 rounded-xl bg-amber-50 p-3.5 ring-1 ring-amber-200">
          <TrendingUp className="size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm leading-relaxed text-amber-900">
            <p className="font-medium">This looks like part of a pattern</p>
            <p className="mt-1 text-amber-800">{patternNote}</p>
          </div>
        </div>
      )}

      <IncidentCard
        incident={{
          type: fields.type,
          severity: fields.severity,
          title: fields.title || "Untitled report",
          description: fields.description,
          occurredAt,
          locationText: fields.locationText || null,
          media,
          tags: fields.tags,
        }}
      />

      {mode === "review" &&
        (editing ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-slate-900">
              Edit before publishing
            </h3>

            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="preview-type"
                    className="block text-sm font-medium text-slate-700"
                  >
                    What happened
                  </label>
                  <select
                    id="preview-type"
                    value={draft.type}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        type: event.target.value as IncidentType,
                      })
                    }
                    className={inputClass}
                  >
                    {INCIDENT_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="preview-severity"
                    className="block text-sm font-medium text-slate-700"
                  >
                    How serious
                  </label>
                  <select
                    id="preview-severity"
                    value={draft.severity}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        severity: event.target.value as Severity,
                      })
                    }
                    className={inputClass}
                  >
                    {SEVERITIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} — {option.description}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="preview-title"
                  className="block text-sm font-medium text-slate-700"
                >
                  Title
                </label>
                <input
                  id="preview-title"
                  type="text"
                  value={draft.title}
                  maxLength={120}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="preview-description"
                  className="block text-sm font-medium text-slate-700"
                >
                  Description
                </label>
                <textarea
                  id="preview-description"
                  rows={5}
                  value={draft.description}
                  maxLength={4000}
                  onChange={(event) =>
                    setDraft({ ...draft, description: event.target.value })
                  }
                  className={`${inputClass} resize-y`}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  This is the text your neighbours will read.
                </p>
              </div>

              <div>
                <label
                  htmlFor="preview-location"
                  className="block text-sm font-medium text-slate-700"
                >
                  Landmark
                </label>
                <input
                  id="preview-location"
                  type="text"
                  value={draft.locationText}
                  maxLength={200}
                  placeholder="The lane behind the village hall"
                  onChange={(event) =>
                    setDraft({ ...draft, locationText: event.target.value })
                  }
                  className={inputClass}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Describe the area, not an address. No house numbers.
                </p>
              </div>

              <div>
                <label
                  htmlFor="preview-tags"
                  className="block text-sm font-medium text-slate-700"
                >
                  Tags
                </label>
                <input
                  id="preview-tags"
                  type="text"
                  value={tagsText}
                  onChange={(event) => setTagsText(event.target.value)}
                  placeholder="white van, evening, back gardens"
                  className={inputClass}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Up to five, separated by commas. These are what link your
                  report to similar ones nearby.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveEdits}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <Check className="size-4" aria-hidden />
                Save changes
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <X className="size-4" aria-hidden />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startEditing}
              disabled={processing}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pencil className="size-4" aria-hidden />
              Edit
            </button>

            <button
              type="button"
              onClick={onReprocess}
              disabled={!onReprocess || processing}
              title={
                onReprocess
                  ? "Send your original wording to be rewritten again"
                  : "Automatic anonymisation is not switched on for this village"
              }
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )}
              {processing ? "Rewriting…" : "Reprocess"}
            </button>
          </div>
        ))}

      <Disclaimer />

      {mode === "publish" && (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-slate-900">
              What happens when you publish
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {[
                "Your report goes to your village coordinator for review.",
                "Once approved it appears on the village map, with the pin shifted slightly from where you placed it.",
                "Any photo or video was already blurred on your device — the original was never uploaded.",
                "Your original wording is kept for the coordinator, but is never shown to other residents.",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-safe-600"
                    aria-hidden
                  />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-slate-600">
              I have checked this report and it contains no names, vehicle
              registrations or other details that identify someone.
            </span>
          </label>

          <button
            type="button"
            onClick={onPublish}
            disabled={publishing || !acknowledged}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-base font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {publishing ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <Send className="size-5" aria-hidden />
            )}
            {publishing ? "Publishing…" : "Publish report"}
          </button>
        </>
      )}

      {footer}
    </div>
  );
}
