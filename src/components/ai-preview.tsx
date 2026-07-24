"use client";

import { useState } from "react";
import {
  Check,
  Loader2,
  Pencil,
  Send,
  Sparkles,
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
 * From Day 3 the card shows Claude's structured, anonymised rewrite. Today it
 * shows the reporter's own words in exactly the same card — deliberately, not
 * as a stopgap. The layout, the edit affordances and the publish action are
 * what need settling before an AI pass is dropped in behind them, and the card
 * is the very same `IncidentCard` the map and list render, so what the reporter
 * approves is literally what their neighbours get.
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
};

type AiPreviewProps = {
  mode: "review" | "publish";
  fields: AiPreviewFields;
  onFieldsChange: (fields: AiPreviewFields) => void;
  occurredAt: Date;
  media?: IncidentCardMedia | null;
  tags?: readonly string[];
  /** Required in `publish` mode. */
  onPublish?: () => void;
  publishing?: boolean;
  /**
   * False until the Claude pass exists. Drives the notice above the card — a
   * reporter must never be led to believe their words have been anonymised
   * when they have not.
   */
  aiProcessed?: boolean;
  /** Wizard navigation, rendered below everything else. */
  footer?: React.ReactNode;
};

const inputClass =
  "mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

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

export function AiPreview({
  mode,
  fields,
  onFieldsChange,
  occurredAt,
  media,
  tags,
  onPublish,
  publishing = false,
  aiProcessed = false,
  footer,
}: AiPreviewProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fields);
  const [acknowledged, setAcknowledged] = useState(false);

  function startEditing() {
    setDraft(fields);
    setEditing(true);
  }

  function saveEdits() {
    onFieldsChange({
      ...draft,
      title: draft.title.trim(),
      description: draft.description.trim(),
      locationText: draft.locationText.trim(),
    });
    setEditing(false);
  }

  return (
    <div className="space-y-4">
      {aiProcessed ? (
        <div className="flex gap-3 rounded-xl bg-brand-50 p-3.5 ring-1 ring-brand-100">
          <Sparkles className="size-5 shrink-0 text-brand-600" aria-hidden />
          <p className="text-sm leading-relaxed text-brand-900">
            This is the anonymised version of your report. Check it reads
            correctly, then publish.
          </p>
        </div>
      ) : (
        <div className="flex gap-3 rounded-xl bg-amber-50 p-3.5 ring-1 ring-amber-200">
          <TriangleAlert className="size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm leading-relaxed text-amber-900">
            <p className="font-medium">Not yet anonymised</p>
            <p className="mt-1 text-amber-800">
              Automatic anonymisation is not switched on yet, so this is your own
              wording. Your report goes to your coordinator for review before
              anyone else can see it — read it through now and take out anything
              that identifies a person.
            </p>
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
          tags,
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
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Pencil className="size-4" aria-hidden />
              Edit
            </button>

            <button
              type="button"
              // Wired up on Day 3, when there is a Claude call to re-run. Left
              // visible and disabled rather than hidden, so the reporter can
              // see where the control will be.
              disabled
              title="Rewriting with AI arrives with the anonymisation pass"
              className="inline-flex h-11 cursor-not-allowed items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-400"
            >
              <Sparkles className="size-4" aria-hidden />
              Reprocess
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
