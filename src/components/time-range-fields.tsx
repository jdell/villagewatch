"use client";

import { useId, useState } from "react";
import { ChevronDown, Filter } from "lucide-react";
import { DateRangeChip } from "@/components/date-range-chip";
import {
  MAX_CUSTOM_RANGE_DAYS,
  TIME_RANGES,
  type TimeRangePreset,
} from "@/lib/constants";
import { parseDateValue } from "@/lib/calendar";
import type { TimeRange } from "@/lib/date-range";

/**
 * The period control on `/incidents` and `/dashboard`.
 *
 * Rendered **inside the caller's own `<form method="get">`**, not wrapping one.
 * That is what lets the incident list carry its type and severity selects
 * through a change of period in the same submission — a control that owned its
 * form would drop them, and the two filters would fight.
 *
 * ## The dates are gone unless they are being used
 *
 * They used to sit on the row permanently — two inputs and two labels the
 * resolver ignores for every preset but `custom`, on a dashboard whose answer is
 * "last 30 days" nine times in ten. Worse than clutter: a coordinator would fill
 * them in under "Last 7 days" and wonder why none of the figures moved.
 * `/map` never had that problem — it reveals its pair only under Custom, and has
 * said why in a comment since the control was written — and `/reports` fixed it
 * in PR #7. This is the same fix on the two screens that were left, and the
 * calendar behind the chip is literally the same component:
 * `src/components/date-range-chip.tsx`.
 *
 * ## Why a `<select>` rather than the row of pills
 *
 * The pills were submit buttons, which is what made them work with no
 * JavaScript — each carried its own `name`/`value`. A `<select name="range">`
 * beside a real submit button has that property too, and it buys the thing the
 * pills could not: a preset can be *chosen* without the page navigating, which
 * is what "Custom range" needs if it is to reveal a picker rather than submit a
 * range nobody has typed yet. It also takes a five-option row down to one
 * control on a phone, which is where a dashboard is most often read.
 *
 * `from` and `to` are submitted as hidden inputs whatever is selected — two
 * query parameters `resolveTimeRange` ignores for every preset bar `custom`, and
 * a custom range that survives a trip through "Last 7 days" and back.
 *
 * ## The submit button is the caller's when the caller has one
 *
 * `/dashboard`'s form holds this control and nothing else, so it asks for one
 * with `submitLabel`. `/incidents` already has an Apply button next to its type
 * and severity selects, and a second one up here would be two buttons doing the
 * same thing to the same form. That Apply button used to carry
 * `name="range" value={range.preset}` by hand, because every period control in
 * the form was a submit button and a bare Apply would have sent no `range` at
 * all; the `<select>` carries it now, so the trick went with the pills.
 */

type TimeRangeFieldsProps = {
  range: TimeRange;
  /** The presets this screen offers — `BROWSE_RANGE_VALUES` or the dashboard's. */
  presets: readonly TimeRangePreset[];
  /** `yyyy-mm-dd` on the server, which is the clock the resolver clamps to. */
  today: string;
  /**
   * Renders a submit button with this label. Omitted where the caller's form
   * already has one — see above.
   */
  submitLabel?: string;
};

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function TimeRangeFields({
  range,
  presets,
  today: todayValue,
  submitLabel,
}: TimeRangeFieldsProps) {
  // `useId` rather than a caller-supplied prefix: it is unique per instance by
  // construction, so two of these on one page cannot collide however they are
  // rendered.
  const selectId = useId();

  const options = TIME_RANGES.filter((option) =>
    presets.includes(option.value),
  );

  const [selected, setSelected] = useState<TimeRangePreset>(range.preset);
  const [fromValue, setFromValue] = useState(range.fromValue);
  const [toValue, setToValue] = useState(range.toValue);
  const [open, setOpen] = useState(false);

  /*
    Re-seed from the props when the server sends a new period, which is what a
    submission is. Adjusted during render rather than in an effect, for the
    reason `ReportPeriodPicker` gives: this is re-rendered with the resolved
    range after every navigation, and an effect would paint the old dates for a
    frame first.
  */
  const [committed, setCommitted] = useState({
    preset: range.preset,
    from: range.fromValue,
    to: range.toValue,
  });

  if (
    committed.preset !== range.preset ||
    committed.from !== range.fromValue ||
    committed.to !== range.toValue
  ) {
    setCommitted({
      preset: range.preset,
      from: range.fromValue,
      to: range.toValue,
    });
    setSelected(range.preset);
    setFromValue(range.fromValue);
    setToValue(range.toValue);
    setOpen(false);
  }

  const custom = selected === "custom";

  // Midnight today, and the bound the grid will not let anybody past. The
  // fallback is unreachable — both pages format this with `dateInputValue` —
  // and is here so a malformed prop degrades to today rather than to
  // `Invalid Date`, which would disable every cell in the grid.
  const today = parseDateValue(todayValue) ?? startOfToday();

  function choosePreset(value: TimeRangePreset) {
    setSelected(value);

    // Choosing "Custom range" is the request to pick the dates, so the picker
    // opens on it. Any other preset closes it — the dates it holds are no longer
    // what the screen will cover.
    setOpen(value === "custom");
  }

  return (
    <div>
      {/*
        `relative` on the row, which is what `DateRangeChip`'s popover is
        anchored to. Anchored to the chip it would start wherever the chip
        happens to sit, and a 34rem panel from a third of the way across a phone
        runs off the right of the screen.
      */}
      <div className="relative flex flex-wrap items-end gap-2">
        <div>
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-slate-700"
          >
            When
          </label>

          {/*
            A real `<select>` under the styling, not a listbox rebuilt out of
            divs. It is a native control on a phone, it is one tab stop, and it
            is the half of this form that keeps working with no JavaScript.
          */}
          <div className="relative mt-1.5">
            <select
              id={selectId}
              name="range"
              value={selected}
              onChange={(event) =>
                choosePreset(event.target.value as TimeRangePreset)
              }
              className="h-11 appearance-none rounded-xl border border-slate-300 bg-white pl-3.5 pr-10 text-sm font-medium text-slate-900 shadow-sm outline-none transition hover:bg-slate-50 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
          </div>
        </div>

        {custom && (
          <DateRangeChip
            from={fromValue}
            to={toValue}
            today={today}
            maxRangeDays={MAX_CUSTOM_RANGE_DAYS}
            open={open}
            onOpenChange={setOpen}
            onChange={(nextFrom, nextTo) => {
              setFromValue(nextFrom);
              setToValue(nextTo);
            }}
          />
        )}

        {submitLabel && (
          <button
            type="submit"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            <Filter className="size-4" aria-hidden />
            {submitLabel}
          </button>
        )}
      </div>

      {/*
        Carried whatever is selected, so a custom range survives being looked
        away from.
      */}
      <input type="hidden" name="from" value={fromValue} />
      <input type="hidden" name="to" value={toValue} />

      {/*
        The adjustment, admitted rather than applied quietly — swapped dates, a
        future end date, or a span past the ceiling. `role="status"` because it
        appears after a submission the user made.
      */}
      {range.notice && (
        <p role="status" className="mt-2 text-xs font-medium text-amber-700">
          {range.notice}
        </p>
      )}
    </div>
  );
}
