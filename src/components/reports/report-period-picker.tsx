"use client";

import { useId, useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { DateRangeChip } from "@/components/date-range-chip";
import {
  REPORT_MAX_RANGE_DAYS,
  REPORT_RANGES,
  type ReportRangePreset,
} from "@/lib/constants";
import { parseDateValue } from "@/lib/calendar";

/**
 * The period control on `/reports` — one row, and the dates only when they are
 * being used.
 *
 * ## Why the dates collapsed
 *
 * Both date inputs used to be on screen at all times, greyed by nothing and
 * ignored by the resolver unless the preset was `custom`. That is four controls
 * and three labels for a screen whose answer is "last month" nine times in ten,
 * and the two that did nothing were the two a coordinator read first. The
 * presets are the control now; the dates appear only when "Custom range" is what
 * is selected.
 *
 * `/dashboard` and `/incidents` had the same two fields and the same complaint,
 * and `TimeRangeFields` now works the way this does — the calendar itself is
 * shared, in `src/components/date-range-chip.tsx`.
 *
 * ## It is still a GET form, and it still works without JavaScript
 *
 * The reasoning on the page it renders on is unchanged: a period is a URL that
 * can be bookmarked and sent to whoever asks for the same report every month.
 * So the preset is a real `<select name="range">` and "Build report" is a real
 * submit button — with no JavaScript, every preset here still works. What needs
 * JavaScript is the custom range, which was the one option that already needed a
 * person to understand that two fields elsewhere on the form governed it.
 *
 * `from` and `to` are always submitted, as hidden inputs, whatever is selected.
 * They cost two query parameters `resolveReportRange` ignores for every preset
 * bar `custom`, and they buy a custom range that survives a trip through "Last 7
 * days" and back.
 *
 * ## What the picker refuses rather than letting the server fix
 *
 * Days in the future and days past `REPORT_MAX_RANGE_DAYS` are disabled in the
 * grid. The resolver clamps both anyway and says so in `notice` — that guarantee
 * is what makes a hand-edited URL safe and it is not going anywhere — but a
 * notice explaining that the dates somebody just clicked have been moved is a
 * worse experience than not being able to click them.
 *
 * ## "Today" arrives as a prop, and is not read off the clock here
 *
 * A Client Component renders twice — once on the server for the HTML, once in
 * the browser to hydrate it — and `new Date()` is a different answer in each. On
 * Vercel the server is UTC and the reader is in London, so for one hour of every
 * British summer night the two disagree about what day it is, and React reports
 * that as a hydration mismatch. Passing the day in settles it, and settles it in
 * the right direction as a bonus: the bound the grid enforces is then the same
 * clock `resolveReportRange` clamps against.
 */

type ReportPeriodPickerProps = {
  preset: ReportRangePreset;
  /** `yyyy-mm-dd`, from the resolved range. */
  from: string;
  to: string;
  /** `yyyy-mm-dd` on the server, which is the clock the resolver clamps to. */
  today: string;
  /** Set when the submitted range was adjusted. Rendered under the row. */
  notice: string | null;
};

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function ReportPeriodPicker({
  preset,
  from,
  to,
  today: todayValue,
  notice,
}: ReportPeriodPickerProps) {
  const selectId = useId();

  const [selected, setSelected] = useState<ReportRangePreset>(preset);
  const [fromValue, setFromValue] = useState(from);
  const [toValue, setToValue] = useState(to);
  const [open, setOpen] = useState(false);

  /*
    Re-seed from the props when the server sends a new period, which is what a
    submission is. Adjusting state during render rather than in an effect: this
    component is re-rendered with the resolved range after every navigation, and
    an effect would paint the old dates for a frame first.
  */
  const [committed, setCommitted] = useState({ preset, from, to });

  if (
    committed.preset !== preset ||
    committed.from !== from ||
    committed.to !== to
  ) {
    setCommitted({ preset, from, to });
    setSelected(preset);
    setFromValue(from);
    setToValue(to);
    setOpen(false);
  }

  const custom = selected === "custom";

  // Midnight today, and the bound the grid will not let anybody past. The
  // fallback is unreachable — the page formats this with `dateInputValue` — and
  // is here so a malformed prop degrades to today rather than to `Invalid Date`,
  // which would disable every cell in the grid.
  const today = parseDateValue(todayValue) ?? startOfToday();

  function choosePreset(value: ReportRangePreset) {
    setSelected(value);

    // Selecting "Custom range" is the request to pick the dates, so the picker
    // opens on it. Any other preset closes it — the dates it holds are no longer
    // what the report will cover.
    setOpen(value === "custom");
  }

  return (
    <form method="get" className="mt-6" data-print-hide>
      {/*
        `relative` on the row rather than on the chip, which is what the popover
        inside `DateRangeChip` is anchored to. Anchored to the chip it starts
        wherever the chip happens to sit — on a phone that is a third of the way
        across, and a 34rem panel from there runs off the right of the screen.
      */}
      <div className="relative flex flex-wrap items-center gap-2">
        <label htmlFor={selectId} className="sr-only">
          Report period
        </label>

        {/*
          A real `<select>` under the styling, not a listbox rebuilt out of
          divs. It is a native control on a phone, it is one tab stop, and it is
          the half of this form that has to keep working with no JavaScript.
        */}
        <div className="relative">
          <select
            id={selectId}
            name="range"
            value={selected}
            onChange={(event) =>
              choosePreset(event.target.value as ReportRangePreset)
            }
            className="h-11 appearance-none rounded-xl border border-slate-300 bg-white pl-3.5 pr-10 text-sm font-medium text-slate-900 shadow-sm outline-none transition hover:bg-slate-50 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          >
            {REPORT_RANGES.map((option) => (
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

        {custom && (
          <DateRangeChip
            from={fromValue}
            to={toValue}
            today={today}
            maxRangeDays={REPORT_MAX_RANGE_DAYS}
            open={open}
            onOpenChange={setOpen}
            onChange={(nextFrom, nextTo) => {
              setFromValue(nextFrom);
              setToValue(nextTo);
            }}
          />
        )}

        <button
          type="submit"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <FileText className="size-4" aria-hidden />
          Build report
        </button>
      </div>

      {/*
        Carried whatever is selected. Two query parameters the resolver ignores
        for every preset bar `custom`, and a custom range that survives being
        looked away from.
      */}
      <input type="hidden" name="from" value={fromValue} />
      <input type="hidden" name="to" value={toValue} />

      <p className="mt-2 text-xs text-slate-500">
        Published and resolved reports only — nothing still waiting for review,
        and nothing you turned down.
      </p>

      {notice && (
        <p role="status" className="mt-1.5 text-xs font-medium text-amber-700">
          {notice}
        </p>
      )}
    </form>
  );
}
