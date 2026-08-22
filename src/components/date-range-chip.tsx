"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
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
 * The chip that reads "22 Jul – 21 Aug", and the two-month grid behind it.
 *
 * Built for `/reports` and now shared with `/dashboard` and `/incidents`, which
 * is the whole reason it is its own file. It was ~200 lines inside
 * `report-period-picker.tsx` and the second screen to want a date range would
 * otherwise have copied them — two calendars with the same off-by-ones in them,
 * diverging on the day somebody fixes one. The three screens differ in the
 * ceiling they enforce (`REPORT_MAX_RANGE_DAYS` against
 * `MAX_CUSTOM_RANGE_DAYS`) and in nothing else, so that is the prop.
 *
 * ## It renders a fragment, not a wrapper
 *
 * The chip is a flex item in the caller's row and the popover is positioned
 * against that row — `absolute left-0 top-full`, so the caller needs `relative`
 * on it. A wrapping `<div>` here would anchor the panel to the chip instead,
 * which on a phone starts a third of the way across and runs a 34rem panel off
 * the right of the screen.
 *
 * ## Open is the caller's state
 *
 * Because two things open it and only one of them is in here: the chip itself,
 * and picking "Custom range" from the select beside it — which is a request to
 * choose the dates, not just to reveal a button that chooses them. Everything
 * *inside* the popover is local, and it re-centres on the range it describes
 * every time it opens rather than reopening wherever it was last left.
 *
 * ## "Today" arrives as a prop
 *
 * A Client Component renders twice — once on the server for the HTML, once in
 * the browser to hydrate it — and `new Date()` is a different answer in each. On
 * Vercel the server is UTC and the reader is in London, so for one hour of every
 * British summer night the two disagree about what day it is, and React reports
 * that as a hydration mismatch. Passing the day in settles it, and settles it in
 * the right direction as a bonus: the bound this grid enforces is then the same
 * clock the resolver clamps against.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

type DateRangeChipProps = {
  /** `yyyy-mm-dd`, from the resolved range. */
  from: string;
  to: string;
  /** Midnight today, in the host zone — the clock the resolver clamps to. */
  today: Date;
  /** Days back the grid will let somebody reach. The resolver clamps too. */
  maxRangeDays: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Both ends at once — a half-set range is never submitted. */
  onChange: (from: string, to: string) => void;
};

export function DateRangeChip({
  from,
  to,
  today,
  maxRangeDays,
  open,
  onOpenChange,
  onChange,
}: DateRangeChipProps) {
  const fromDate = parseDateValue(from);
  const toDate = parseDateValue(to);

  /*
    The half-made selection: the day that was clicked first, while the second
    click decides which end of the range it turns out to be. Null means the next
    click starts a new range rather than closing one.
  */
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [hovered, setHovered] = useState<Date | null>(null);

  const [view, setView] = useState<Date>(() =>
    // The left-hand month is the one *before* the month the range ends in, so
    // the two panels show the range rather than the range and a month of future.
    addMonths(startOfMonth(toDate ?? today), -1),
  );

  /*
    Re-centre on the range being described whenever the popover opens. Adjusted
    during render rather than in an effect, because an effect would paint the
    months from the last visit for a frame first — and two months is a small
    window, so a picker that opens somewhere else reads as broken.
  */
  const [wasOpen, setWasOpen] = useState(open);

  if (wasOpen !== open) {
    setWasOpen(open);

    if (open) {
      setView(addMonths(startOfMonth(toDate ?? today), -1));
      setAnchor(null);
      setHovered(null);
    }
  }

  const earliest = new Date(today.getTime() - maxRangeDays * DAY_MS);

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
      onOpenChange(false);
      chip.current?.focus();
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (popover.current?.contains(target) || chip.current?.contains(target)) {
        return;
      }
      onOpenChange(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onOpenChange]);

  function pickDay(day: Date) {
    if (!anchor) {
      // First click is a one-day range rather than a half-set one. There is
      // always a valid period in the caller's inputs that way, whatever happens
      // next — including the popover being closed without a second click.
      setAnchor(day);
      onChange(toDateValue(day), toDateValue(day));
      return;
    }

    const [start, end] = anchor <= day ? [anchor, day] : [day, anchor];

    onChange(toDateValue(start), toDateValue(end));
    setAnchor(null);
    setHovered(null);
    onOpenChange(false);
    chip.current?.focus();
  }

  const label =
    fromDate && toDate ? formatRangeChip(fromDate, toDate, today) : "Pick dates";

  return (
    <>
      <button
        ref={chip}
        type="button"
        onClick={() => onOpenChange(!open)}
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

      {/*
        Positioned against the caller's row, not against the chip. Full width
        where that is all there is — a phone, where the two months stack — and a
        fixed 34rem where both fit side by side.
      */}
      {open && (
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
              // The right-hand panel is already the current month, so there is
              // nothing but future to move into.
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
              : `Pick a start and an end date. Up to ${maxRangeDays} days, ending today or earlier.`}
          </p>
        </div>
      )}
    </>
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
