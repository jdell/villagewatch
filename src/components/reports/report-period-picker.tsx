"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import {
  REPORT_MAX_RANGE_DAYS,
  REPORT_RANGES,
  type ReportRangePreset,
} from "@/lib/constants";
import {
  WEEKDAYS,
  addMonths,
  formatRangeChip,
  isSameDay,
  monthGrid,
  monthLabel,
  parseDateValue,
  startOfMonth,
  toDateValue,
} from "@/lib/calendar";

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

const DAY_MS = 24 * 60 * 60 * 1000;

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
    The half-made selection: the day that was clicked first, while the second
    click decides which end of the range it turns out to be. Null means the next
    click starts a new range rather than closing one.
  */
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [hovered, setHovered] = useState<Date | null>(null);

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
    setAnchor(null);
    setOpen(false);
  }

  const custom = selected === "custom";

  const fromDate = parseDateValue(fromValue);
  const toDate = parseDateValue(toValue);

  // Midnight today, and the two bounds the grid will not let anybody past. The
  // fallback is unreachable — the page formats this with `dateInputValue` — and
  // is here so a malformed prop degrades to today rather than to `Invalid Date`,
  // which would disable every cell in the grid.
  const today = parseDateValue(todayValue) ?? startOfToday();
  const earliest = new Date(today.getTime() - REPORT_MAX_RANGE_DAYS * DAY_MS);

  const [view, setView] = useState<Date>(() =>
    // The left-hand month is the one *before* the month the range ends in, so
    // the two panels show the range rather than the range and a month of future.
    addMonths(startOfMonth(parseDateValue(to) ?? today), -1),
  );



  const popover = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);

  /*
    Escape and a click outside, both of which a person expects of a popover and
    neither of which a `<div>` does on its own. Bound only while it is open, so
    the page carries no listeners for a control nobody has touched.
  */
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      chip.current?.focus();
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (popover.current?.contains(target) || chip.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function choosePreset(value: ReportRangePreset) {
    setSelected(value);

    // Selecting "Custom range" is the request to pick the dates, so the picker
    // opens on it. Any other preset closes it — the dates it holds are no longer
    // what the report will cover.
    if (value === "custom") {
      setAnchor(null);
      setView(addMonths(startOfMonth(toDate ?? today), -1));
      setOpen(true);
    } else {
      setOpen(false);
    }
  }

  function pickDay(day: Date) {
    if (!anchor) {
      // First click is a one-day range rather than a half-set one. There is
      // always a valid period in the hidden inputs that way, whatever happens
      // next — including the popover being closed without a second click.
      setAnchor(day);
      setFromValue(toDateValue(day));
      setToValue(toDateValue(day));
      return;
    }

    const [start, end] = anchor <= day ? [anchor, day] : [day, anchor];

    setFromValue(toDateValue(start));
    setToValue(toDateValue(end));
    setAnchor(null);
    setHovered(null);
    setOpen(false);
    chip.current?.focus();
  }

  const label =
    fromDate && toDate ? formatRangeChip(fromDate, toDate, today) : "Pick dates";

  return (
    <form method="get" className="mt-6" data-print-hide>
      {/*
        `relative` on the row rather than on the chip, which is what the popover
        below is anchored to. Anchored to the chip it starts wherever the chip
        happens to sit — on a phone that is a third of the way across, and a
        34rem panel from there runs off the right of the screen. From the row it
        can only be as wide as the content already is.
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
          <button
            ref={chip}
            type="button"
            onClick={() => {
              // Re-centred on the range it describes rather than reopening
              // wherever the last visit was left. Two months is a small window
              // and a picker that opens somewhere else reads as broken.
              if (!open) setView(addMonths(startOfMonth(toDate ?? today), -1));
              setOpen((value) => !value);
            }}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={`inline-flex h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium shadow-sm transition ${
              open
                ? "border-brand-500 bg-white text-slate-900 ring-2 ring-brand-500/20"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <CalendarRange className="size-4 text-slate-400" aria-hidden />
            {label}
          </button>
        )}

        <button
          type="submit"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <FileText className="size-4" aria-hidden />
          Build report
        </button>

        {/*
          Last in the row and positioned against it, not against the chip. Full
          width where that is all there is — a phone, where the two months stack
          — and a fixed 34rem where both fit side by side.
        */}
        {custom && open && (
          <div
            ref={popover}
            role="dialog"
            aria-label="Choose a date range"
            className="absolute left-0 top-full z-30 mt-2 max-h-[70vh] w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:w-[34rem]"
          >
            <div className="flex items-center justify-between">
              <NavButton
                label="Previous month"
                onClick={() => setView(addMonths(view, -1))}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </NavButton>

              {/*
                Both month names, and only where both months are side by side.
                Stacked on a phone each panel carries its own caption, and a
                header naming them again reads as a third month.
              */}
              <p className="hidden text-sm font-semibold text-slate-900 sm:block">
                {monthLabel(view)}
                <span className="text-slate-400"> · </span>
                {monthLabel(addMonths(view, 1))}
              </p>

              <NavButton
                label="Next month"
                // The right-hand panel is already the current month, so there
                // is nothing but future to move into.
                disabled={
                  addMonths(view, 1).getTime() >= startOfMonth(today).getTime()
                }
                onClick={() => setView(addMonths(view, 1))}
              >
                <ChevronRight className="size-4" aria-hidden />
              </NavButton>
            </div>

            <div className="mt-3 grid gap-5 sm:grid-cols-2">
              {[0, 1].map((offset) => (
                <Month
                  key={offset}
                  month={addMonths(view, offset)}
                  from={fromDate}
                  to={toDate}
                  anchor={anchor}
                  hovered={hovered}
                  earliest={earliest}
                  latest={today}
                  onPick={pickDay}
                  onHover={setHovered}
                />
              ))}
            </div>

            <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {anchor
                ? "Now pick the other end of the range."
                : `Pick a start and an end date. Up to ${REPORT_MAX_RANGE_DAYS} days, ending today or earlier.`}
            </p>
          </div>
        )}
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

function NavButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

const CELL_LABEL = new Intl.DateTimeFormat("en-GB", { dateStyle: "long" });

/**
 * One month's grid.
 *
 * A `<table>` rather than divs with grid roles on them: the weekday headings are
 * genuinely column headers, and a real table gets that relationship right with
 * no roving tabindex to maintain.
 */
function Month({
  month,
  from,
  to,
  anchor,
  hovered,
  earliest,
  latest,
  onPick,
  onHover,
}: {
  month: Date;
  from: Date | null;
  to: Date | null;
  anchor: Date | null;
  hovered: Date | null;
  earliest: Date;
  latest: Date;
  onPick: (day: Date) => void;
  onHover: (day: Date | null) => void;
}) {
  /*
    While one end is being picked, the highlight follows the pointer rather than
    the stored range — otherwise the first click collapses the whole selection to
    a single day and the second one appears to widen it out of nowhere.
  */
  const preview =
    anchor && hovered
      ? anchor <= hovered
        ? { start: anchor, end: hovered }
        : { start: hovered, end: anchor }
      : null;

  const start = preview?.start ?? from;
  const end = preview?.end ?? to;

  return (
    <div>
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500 sm:hidden">
        {monthLabel(month)}
      </p>

      <table className="mt-1 w-full table-fixed border-collapse sm:mt-0">
        <caption className="sr-only">{monthLabel(month)}</caption>
        <thead>
          <tr>
            {WEEKDAYS.map((day) => (
              <th
                key={day.long}
                scope="col"
                abbr={day.long}
                className="pb-1 text-center text-[0.65rem] font-medium uppercase text-slate-400"
              >
                {day.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(month).map((week, index) => (
            <tr key={index}>
              {week.map((day, cell) => {
                if (!day) return <td key={cell} />;

                const disabled =
                  day.getTime() > latest.getTime() ||
                  day.getTime() < earliest.getTime();

                const isStart = Boolean(start && isSameDay(day, start));
                const isEnd = Boolean(end && isSameDay(day, end));
                const within = Boolean(
                  start &&
                    end &&
                    day.getTime() > start.getTime() &&
                    day.getTime() < end.getTime(),
                );

                return (
                  <td key={cell} className="p-0">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onPick(day)}
                      onMouseEnter={() => onHover(day)}
                      onMouseLeave={() => onHover(null)}
                      aria-label={CELL_LABEL.format(day)}
                      aria-pressed={isStart || isEnd}
                      className={`h-9 w-full text-sm tabular-nums transition disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent ${
                        isStart || isEnd
                          ? "bg-brand-600 font-semibold text-white"
                          : within
                            ? "bg-brand-50 text-brand-900"
                            : "text-slate-700 hover:bg-slate-100"
                      } ${isStart ? "rounded-l-lg" : ""} ${
                        isEnd ? "rounded-r-lg" : ""
                      }`}
                    >
                      {day.getDate()}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
