"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck, Repeat, X } from "lucide-react";
import type { Severity } from "@/generated/prisma/enums";
import type { MapIncident } from "@/components/incident-map";
import { BottomSheet } from "@/components/modern/bottom-sheet";
import { PinPreview } from "@/components/modern/pin-preview";
import { INCIDENT_TYPE_LABELS, SEVERITY_LABELS } from "@/lib/constants";
import { formatDateTime, formatTimeAgo } from "@/lib/format";
import { PIN_HEAT, PIN_SOFT } from "@/lib/map/glyph-pin";

/**
 * One incident, in a sheet over the map — what tapping a pin opens, in place
 * of Leaflet's popup.
 *
 * The handoff's `mDetail`: the pin itself at 44px, then the type, severity and
 * status as badges, the title, the description, when · where · reference, a
 * pattern panel with a Show button, a resolution panel, and "View full report".
 * Non-modal on purpose: the map stays live behind it, so tapping another pin
 * swaps the sheet rather than needing it closed first.
 *
 * Everything on it is a public column (`PUBLIC_INCIDENT_SELECT` via
 * `toMapIncident`) — the same text the old popup showed, with the pattern
 * note and the resolution note added. `rawDescription` is not on a
 * `MapIncident` and so cannot be here (domain rule 1). The full report — votes,
 * media, the share and moderation panels — is one tap away and unchanged.
 */

type IncidentSheetProps = {
  incident: MapIncident | null;
  now: number;
  onClose: () => void;
  /** Frame the pattern's reports on the map. Absent when there is no pattern. */
  onShowPattern?: () => void;
  /** How many reports the Show button would frame, the selected one included. */
  patternSize: number;
};

export function IncidentSheet({
  incident,
  now,
  onClose,
  onShowPattern,
  patternSize,
}: IncidentSheetProps) {
  if (!incident) return null;

  const occurred = new Date(incident.occurredAt);
  const severity = incident.severity as Severity;
  const resolved = incident.status === "RESOLVED";
  const status = incident.pending
    ? { label: "In review", className: "bg-[#e0f2fe] text-[#0369a1]" }
    : resolved
      ? { label: "Resolved", className: "bg-[#f1f5f9] text-[#475569]" }
      : null;
  const pattern = incident.recurring && !resolved;

  return (
    <BottomSheet
      open
      onClose={onClose}
      labelledBy="incident-sheet-title"
      maxHeightClass="max-h-[70dvh]"
    >
      <div className="flex flex-col gap-3 px-[18px] pt-3 pb-7">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center">
            <PinPreview pin={incident} now={now} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex h-6 items-center rounded-xl bg-[#f1f5f9] px-[9px] text-xs font-[550] text-[#334155]">
                {INCIDENT_TYPE_LABELS[incident.type]}
              </span>
              <span
                className="inline-flex h-6 items-center gap-1.5 rounded-xl px-[9px] text-xs font-semibold"
                style={{
                  backgroundColor: PIN_SOFT[severity].bg,
                  color: PIN_SOFT[severity].text,
                }}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: PIN_HEAT[severity] }}
                  aria-hidden
                />
                {SEVERITY_LABELS[severity]}
              </span>
              {status && (
                <span
                  className={`inline-flex h-6 items-center rounded-xl px-[9px] text-xs font-semibold ${status.className}`}
                >
                  {status.label}
                </span>
              )}
            </div>
            <h2
              id="incident-sheet-title"
              className="text-lg leading-tight font-[650] text-pretty text-[#0f172a]"
            >
              {incident.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f1f5f9] text-[#334155]"
          >
            <X className="size-[18px]" aria-hidden />
          </button>
        </div>

        <p className="text-[14.5px] leading-normal text-pretty text-[#475569]">
          {incident.description}
        </p>

        <p className="flex flex-wrap gap-1.5 text-[13px] text-[#64748b]">
          <time dateTime={incident.occurredAt} title={formatDateTime(occurred)}>
            {formatTimeAgo(occurred)}
          </time>
          {incident.locationText && (
            <>
              <span aria-hidden>·</span>
              <span>{incident.locationText}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span className="font-mono">{incident.reference}</span>
        </p>

        {pattern && (
          <div className="flex items-center gap-3 rounded-[14px] bg-[#f1f5f9] p-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#0f172a]">
              <Repeat className="size-4 text-white" strokeWidth={2.25} aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13.5px] font-[650] text-[#0f172a]">
                Part of a pattern
              </span>
              <span className="text-[12.5px] text-[#475569]">
                {incident.patternNote ??
                  "Similar reports close by in the last few weeks."}
              </span>
            </span>
            {onShowPattern && patternSize > 1 && (
              <button
                type="button"
                onClick={onShowPattern}
                aria-label={`Show the ${patternSize} reports in this pattern on the map`}
                className="h-10 shrink-0 rounded-xl bg-[#0f172a] px-3.5 text-[13.5px] font-semibold text-white"
              >
                Show
              </button>
            )}
          </div>
        )}

        {resolved && (
          <div className="flex items-start gap-2.5 rounded-[14px] border border-[#e2e8f0] bg-[#f8fafc] p-3 text-[13px] text-[#334155]">
            <CircleCheck className="mt-px size-[18px] shrink-0 text-[#475569]" aria-hidden />
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold">Resolved by your coordinator</span>
              <span className="whitespace-pre-line text-[#475569]">
                {incident.resolutionNote ?? "Kept on the map for context."}
              </span>
            </span>
          </div>
        )}

        <Link
          href={`/incidents/${incident.id}`}
          className="flex h-12 items-center justify-center gap-2 rounded-[14px] border border-[#e2e8f0] bg-white text-[15px] font-semibold text-[#0f172a] transition hover:bg-[#f8fafc]"
        >
          View full report
          <ArrowRight className="size-4 text-[#334155]" aria-hidden />
        </Link>
      </div>
    </BottomSheet>
  );
}
