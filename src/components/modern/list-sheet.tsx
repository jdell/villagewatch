"use client";

import { SlidersHorizontal, X } from "lucide-react";
import type { MapIncident } from "@/components/incident-map";
import { BottomSheet } from "@/components/modern/bottom-sheet";
import { PinPreview } from "@/components/modern/pin-preview";
import { INCIDENT_TYPE_LABELS, SEVERITY_VALUES } from "@/lib/constants";
import { formatTimeAgo } from "@/lib/format";
import { daysAgo } from "@/lib/map/trends";

/**
 * The List tab, as a sheet over the map — design option 1f's expanded list.
 *
 * Every report the map is drawing, newest first, each row the pin itself at
 * 42px, the title and one line of meta. "It explains every pin in words, so
 * it works as the legend", in the handoff's phrase — and it is the map's text
 * alternative, which the old map provided with a "See these as a list"
 * link to another page.
 *
 * The rows are exactly what the map draws (the same filtered array), so the
 * count in the header and the pins cannot disagree. Tapping a row closes the
 * list and opens that report's sheet, with the map moved to it. Non-modal: the
 * map above stays usable. The filter button in the header opens the one filter
 * sheet, over this one.
 */

type ListSheetProps = {
  open: boolean;
  onClose: () => void;
  incidents: readonly MapIncident[];
  now: number;
  /** "last 30 days" — said beside the count. */
  periodPhrase: string;
  filterCount: number;
  onOpenFilters: () => void;
  onSelect: (incident: MapIncident) => void;
};

function meta(incident: MapIncident): string {
  const state = incident.pending
    ? "In review · "
    : incident.status === "RESOLVED"
      ? "Resolved · "
      : "";
  const where = incident.locationText ? ` · ${incident.locationText}` : "";
  return `${state}${INCIDENT_TYPE_LABELS[incident.type]} · ${formatTimeAgo(
    new Date(incident.occurredAt),
  )}${where}`;
}

export function ListSheet({
  open,
  onClose,
  incidents,
  now,
  periodPhrase,
  filterCount,
  onOpenFilters,
  onSelect,
}: ListSheetProps) {
  // Newest day first, the more serious first within a day, then newest — the
  // handoff's sort, on a whole-day key so the comparison stays consistent.
  const rows = [...incidents].sort(
    (a, b) =>
      (daysAgo(a.occurredAt, now) ?? Infinity) -
        (daysAgo(b.occurredAt, now) ?? Infinity) ||
      SEVERITY_VALUES.indexOf(b.severity) - SEVERITY_VALUES.indexOf(a.severity) ||
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
  const inPatterns = incidents.filter(
    (incident) => incident.recurring && incident.status !== "RESOLVED",
  ).length;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledBy="list-sheet-title"
      maxHeightClass="h-[55dvh]"
      aboveTabBar
    >
      <div className="flex flex-col px-4 pb-4">
        <span className="flex h-[22px] items-center justify-center" aria-hidden>
          <span className="h-[5px] w-[38px] rounded-[3px] bg-[#cbd5e1]" />
        </span>

        <div className="flex items-center justify-between gap-3 pb-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="list-sheet-title" className="text-[17px] font-[650] text-[#0f172a]">
              {rows.length} {rows.length === 1 ? "report" : "reports"}
            </h2>
            <span className="text-[13px] text-[#64748b]">
              {inPatterns > 0 ? `${inPatterns} in a pattern · ` : ""}
              {periodPhrase}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onOpenFilters}
              aria-haspopup="dialog"
              className="flex h-11 items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3.5 text-sm font-[550] text-[#0f172a]"
            >
              <SlidersHorizontal className="size-[17px] text-[#334155]" aria-hidden />
              Filters
              {filterCount > 0 && (
                <span className="h-[18px] min-w-[18px] rounded-[9px] bg-[#0284c7] px-[5px] text-center text-[11px] leading-[18px] font-bold text-white">
                  {filterCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the list"
              className="grid size-10 place-items-center rounded-full bg-[#f1f5f9] text-[#334155]"
            >
              <X className="size-[18px]" aria-hidden />
            </button>
          </div>
        </div>

        <ul className="-mx-1.5 flex flex-col border-t border-[#f1f5f9]">
          {rows.map((incident) => (
            <li key={incident.id}>
              <button
                type="button"
                onClick={() => onSelect(incident)}
                className="flex min-h-[60px] w-full items-center gap-3 border-b border-[#f1f5f9] px-1.5 py-2 text-left hover:bg-[#f8fafc]"
              >
                <span className="grid size-[42px] shrink-0 place-items-center">
                  <PinPreview pin={incident} now={now} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[14.5px] font-semibold text-[#0f172a]">
                    {incident.title}
                  </span>
                  <span className="truncate text-[12.5px] text-[#64748b]">
                    {meta(incident)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {rows.length === 0 && (
          <p className="px-1.5 py-6 text-sm text-[#64748b]">
            No reports match. Try a longer period or clear filters.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
