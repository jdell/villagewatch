"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { IncidentTypeIcon } from "@/components/incident-type-icon";
import { BottomSheet } from "@/components/modern/bottom-sheet";
import { INCIDENT_TYPES, SEVERITIES } from "@/lib/constants";
import { PIN_HEAT } from "@/lib/map/glyph-pin";
import {
  DEFAULT_MAP_FILTERS,
  MODERN_MAP_PERIODS,
  PRIMARY_MAP_TYPES,
  toggleValue,
  type MapFilters,
} from "@/lib/map/filters";

/**
 * The one filter sheet — design option 1d, "summary pill + one filter sheet".
 *
 * Everything the old map spread across five floating controls lives here:
 * the period, the categories, the severities, two switches, and the map key,
 * which the design moves off the map entirely. The sheet edits a draft and the
 * map follows it live — the footer button says how many reports the current
 * choice leaves and closes the sheet, which is what "Show 18 reports" means.
 *
 * Sizes, radii and colours are the handoff's mobile prototype, unchanged: 40px
 * chips with a 20px radius, a selected chip in `#0f172a`, a segmented period
 * control on `#f1f5f9`, 44×26 switches in `#0284c7`.
 */

type FilterSheetProps = {
  open: boolean;
  onClose: () => void;
  filters: MapFilters;
  onChange: (filters: MapFilters) => void;
  /** How many reports the current filters leave — the footer button's number. */
  resultCount: number;
  /** The "How to read the map" key. Passed in so the pin system owns its own key. */
  legend: React.ReactNode;
};

function chipClass(on: boolean) {
  return on
    ? "border-[#0f172a] bg-[#0f172a] text-white"
    : "border-[#e2e8f0] bg-white text-[#334155] hover:bg-[#f8fafc]";
}

function Switch({
  on,
  label,
  sub,
  onToggle,
}: {
  on: boolean;
  label: string;
  sub: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex min-h-[52px] w-full items-center gap-3 border-b border-[#f1f5f9] text-left"
    >
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-[14.5px] font-[550] text-[#0f172a]">{label}</span>
        <span className="text-[12.5px] text-[#64748b]">{sub}</span>
      </span>
      <span
        className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${
          on ? "bg-[#0284c7]" : "bg-[#cbd5e1]"
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-[3px] size-5 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,.3)] transition-[left] ${
            on ? "left-[21px]" : "left-[3px]"
          }`}
        />
      </span>
    </button>
  );
}

export function FilterSheet({
  open,
  onClose,
  filters,
  onChange,
  resultCount,
  legend,
}: FilterSheetProps) {
  const [moreTypes, setMoreTypes] = useState(false);

  // The selected ones always show, even when "+9 more" is folded, so a filter
  // somebody set is never hidden behind the fold that set it.
  const shownTypes: IncidentType[] = moreTypes
    ? INCIDENT_TYPES.map((type) => type.value)
    : [
        ...PRIMARY_MAP_TYPES,
        ...filters.types.filter(
          (type) => !(PRIMARY_MAP_TYPES as readonly IncidentType[]).includes(type),
        ),
      ];
  const hiddenCount = INCIDENT_TYPES.length - PRIMARY_MAP_TYPES.length;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      modal
      labelledBy="map-filters-title"
      maxHeightClass="max-h-[min(700px,90dvh)]"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="h-[52px] w-full rounded-2xl bg-[#0f172a] text-base font-[650] text-white transition hover:bg-[#1e293b]"
        >
          Show {resultCount} {resultCount === 1 ? "report" : "reports"}
        </button>
      }
    >
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
        <h2 id="map-filters-title" className="flex-1 text-xl font-[650] text-[#0f172a]">
          Filters
        </h2>
        <button
          type="button"
          onClick={() =>
            onChange({ ...DEFAULT_MAP_FILTERS, period: filters.period })
          }
          className="h-10 px-2.5 text-sm font-semibold text-[#0369a1]"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close filters"
          className="grid size-10 place-items-center rounded-full bg-[#f1f5f9] text-[#334155]"
        >
          <X className="size-[18px]" aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-5 px-4 pt-1 pb-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-semibold text-[#334155]">
            Period
          </legend>
          <div className="flex gap-0.5 rounded-xl bg-[#f1f5f9] p-[3px]">
            {MODERN_MAP_PERIODS.map((period) => {
              const on = filters.period === period.value;
              return (
                <button
                  key={period.value}
                  type="button"
                  aria-pressed={on}
                  aria-label={period.phrase}
                  onClick={() => onChange({ ...filters, period: period.value })}
                  className={`h-10 flex-1 rounded-[9px] text-sm font-semibold transition ${
                    on
                      ? "bg-white text-[#0f172a] shadow-[0_1px_2px_rgba(15,23,42,.15)]"
                      : "text-[#64748b]"
                  }`}
                >
                  {period.short}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-semibold text-[#334155]">
            Category
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {shownTypes.map((type) => {
              const on = filters.types.includes(type);
              const meta = INCIDENT_TYPES.find((t) => t.value === type);
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onChange({ ...filters, types: toggleValue(filters.types, type) })
                  }
                  className={`inline-flex h-10 items-center gap-1.5 rounded-[20px] border pr-3 pl-2.5 text-[13.5px] font-[550] transition ${chipClass(on)}`}
                >
                  <IncidentTypeIcon
                    type={type}
                    className={`size-[15px] ${on ? "text-white" : "text-[#475569]"}`}
                  />
                  {meta?.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setMoreTypes((value) => !value)}
              aria-expanded={moreTypes}
              className="h-10 rounded-[20px] border border-dashed border-[#94a3b8] bg-white px-3 text-[13.5px] font-[550] text-[#334155]"
            >
              {moreTypes ? "Fewer" : `+${hiddenCount} more`}
            </button>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-semibold text-[#334155]">
            Severity
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {SEVERITIES.map((severity) => {
              const on = filters.severities.includes(severity.value as Severity);
              return (
                <button
                  key={severity.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onChange({
                      ...filters,
                      severities: toggleValue(
                        filters.severities,
                        severity.value as Severity,
                      ),
                    })
                  }
                  className={`inline-flex h-10 items-center gap-[7px] rounded-[20px] border pr-3.5 pl-3 text-[13.5px] font-[550] transition ${chipClass(on)}`}
                >
                  <span
                    className="size-[9px] rounded-full shadow-[0_0_0_1.5px_#fff]"
                    style={{ backgroundColor: PIN_HEAT[severity.value as Severity] }}
                    aria-hidden
                  />
                  {severity.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col">
          <Switch
            on={filters.showResolved}
            label="Show resolved reports"
            sub="Greyed out, with a tick"
            onToggle={() =>
              onChange({ ...filters, showResolved: !filters.showResolved })
            }
          />
          <Switch
            on={filters.patternsOnly}
            label="Patterns only"
            sub="Repeated incidents close together"
            onToggle={() =>
              onChange({ ...filters, patternsOnly: !filters.patternsOnly })
            }
          />
        </div>

        <section className="flex flex-col gap-2.5" aria-labelledby="map-key-title">
          <h3 id="map-key-title" className="text-[13px] font-semibold text-[#334155]">
            How to read the map
          </h3>
          {legend}
        </section>
      </div>
    </BottomSheet>
  );
}
