import { TIME_RANGES, type TimeRangePreset } from "@/lib/constants";
import type { TimeRange } from "@/lib/date-range";

/**
 * The period control on `/incidents` and `/dashboard`.
 *
 * Rendered **inside the caller's own `<form method="get">`**, not wrapping one.
 * That is what lets the incident list carry its type and severity selects
 * through a change of period in the same submission — a control that owned its
 * form would drop them, and the two filters would fight.
 *
 * ## Why submit buttons rather than a `<select>`
 *
 * Because the map's control is a row of pills, and this is the same choice on a
 * different screen. A submit button carries its own `name`/`value`, so the row
 * needs no JavaScript to work and every period stays a shareable URL — the
 * property the list's filters were built for in the first place.
 *
 * ## Both date inputs are always rendered
 *
 * Same reasoning as `/reports`: hiding them behind the "Custom range" pill would
 * need JavaScript to reveal, and the form works without it. They are seeded from
 * the resolved range, so the pill applies a sensible window rather than two
 * empty fields — pressing "Custom range" *is* the apply button for whatever is
 * in them.
 */

type TimeRangeFieldsProps = {
  range: TimeRange;
  /** The presets this screen offers — `BROWSE_RANGE_VALUES` or the dashboard's. */
  presets: readonly TimeRangePreset[];
  /** Distinguishes the input ids when two of these ever share a page. */
  idPrefix?: string;
};

export function TimeRangeFields({
  range,
  presets,
  idPrefix = "range",
}: TimeRangeFieldsProps) {
  const options = TIME_RANGES.filter((option) =>
    presets.includes(option.value),
  );

  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      {/*
        First submit button in tree order, which is what a browser presses on
        Enter. Hidden, and deliberately the custom one: somebody typing in a date
        field and hitting Enter means "use these dates", and without this they
        would get whichever preset happened to be leftmost.
      */}
      <button type="submit" name="range" value="custom" hidden aria-hidden />

      <div className="w-full sm:w-auto">
        <span className="block text-sm font-medium text-slate-700">When</span>
        <div
          className="mt-1.5 inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1"
          role="group"
          aria-label="Time period"
        >
          {options.map((option) => {
            const active = range.preset === option.value;

            return (
              <button
                key={option.value}
                type="submit"
                name="range"
                value={option.value}
                aria-pressed={active}
                className={`h-9 rounded-lg px-3 text-xs font-medium transition ${
                  active
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label
            htmlFor={`${idPrefix}-from`}
            className="block text-xs font-medium text-slate-500"
          >
            From
          </label>
          <input
            id={`${idPrefix}-from`}
            name="from"
            type="date"
            defaultValue={range.fromValue}
            max={range.toValue}
            className="mt-1 block h-9 rounded-lg border border-slate-300 px-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div>
          <label
            htmlFor={`${idPrefix}-to`}
            className="block text-xs font-medium text-slate-500"
          >
            To
          </label>
          <input
            id={`${idPrefix}-to`}
            name="to"
            type="date"
            defaultValue={range.toValue}
            className="mt-1 block h-9 rounded-lg border border-slate-300 px-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      </div>

      {/*
        The adjustment, admitted rather than applied quietly — swapped dates, a
        future end date, or a span past the ceiling. `role="status"` because it
        appears after a submission the user made.
      */}
      {range.notice && (
        <p
          role="status"
          className="w-full text-xs text-amber-700"
        >
          {range.notice}
        </p>
      )}
    </div>
  );
}
