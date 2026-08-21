import { describe, expect, it } from "vitest";
import {
  WEEKDAYS,
  addMonths,
  formatRangeChip,
  isSameDay,
  monthGrid,
  parseDateValue,
  startOfMonth,
  toDateValue,
} from "@/lib/calendar";

/**
 * The arithmetic behind `/reports`' date range picker.
 *
 * It is a separate module from the component for exactly this: a month grid is
 * four lines of index arithmetic with three classic off-by-ones in it — the
 * Sunday that shifts a month left by a cell, the 31st that skips February, and
 * the `yyyy-mm-dd` that is shaped like a date and is not one. None of the three
 * throws. Each of them silently draws the wrong month, which is a bug a
 * coordinator discovers by producing a report about the wrong fortnight.
 *
 * Everything here is the host zone on purpose — see the module header. The
 * fixtures are built with `new Date(y, m, d)` rather than from ISO strings so
 * they mean the same day wherever the suite runs.
 */

describe("parseDateValue", () => {
  it("reads a date input's own format back", () => {
    const date = parseDateValue("2026-08-21");

    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(7);
    expect(date!.getDate()).toBe(21);
    // Local midnight, which is what makes it comparable to the grid's cells.
    expect(date!.getHours()).toBe(0);
  });

  it("refuses a date that is shaped right and does not exist", () => {
    // `new Date(2026, 1, 30)` rolls forward to 2 March rather than failing, so
    // without the read-back check the picker would open on the wrong month and
    // look like it had ignored the URL.
    expect(parseDateValue("2026-02-30")).toBeNull();
    expect(parseDateValue("2026-13-01")).toBeNull();
  });

  it("refuses anything that is not the format at all", () => {
    for (const value of ["", "21/08/2026", "2026-8-21", "today", null, undefined]) {
      expect(parseDateValue(value)).toBeNull();
    }
  });

  it("round-trips through the value the form submits", () => {
    // The pairing the whole module rests on: `toDateValue` is the inverse of
    // this, and `resolveReportRange` parses the same string on the server.
    const value = "2026-03-29";

    expect(toDateValue(parseDateValue(value)!)).toBe(value);
  });
});

describe("monthGrid", () => {
  it("starts the week on Monday", () => {
    expect(WEEKDAYS[0].long).toBe("Monday");

    // 1 August 2026 is a Saturday, so the first row is five blanks and then it.
    const [firstWeek] = monthGrid(new Date(2026, 7, 1));

    expect(firstWeek.slice(0, 5).every((cell) => cell === null)).toBe(true);
    expect(firstWeek[5]?.getDate()).toBe(1);
  });

  it("does not shift a month that starts on a Sunday", () => {
    // `getDay()` is 0 for Sunday, so the obvious `weekday - 1` gives -1 leading
    // cells and slides the whole month a column to the left.
    const [firstWeek] = monthGrid(new Date(2026, 2, 1)); // 1 March 2026, a Sunday

    expect(firstWeek.slice(0, 6).every((cell) => cell === null)).toBe(true);
    expect(firstWeek[6]?.getDate()).toBe(1);
  });

  it("holds every day of the month, once, in order", () => {
    for (const month of [
      new Date(2026, 1, 1), // February, 28 days
      new Date(2028, 1, 1), // February in a leap year, 29
      new Date(2026, 3, 1), // April, 30
      new Date(2026, 6, 1), // July, 31
    ]) {
      const days = monthGrid(month)
        .flat()
        .filter((cell): cell is Date => cell !== null);

      const expected = new Date(
        month.getFullYear(),
        month.getMonth() + 1,
        0,
      ).getDate();

      expect(days).toHaveLength(expected);
      expect(days.map((day) => day.getDate())).toEqual(
        Array.from({ length: expected }, (_, index) => index + 1),
      );
      // Every cell belongs to the month it was asked for — no bleed either side.
      expect(days.every((day) => day.getMonth() === month.getMonth())).toBe(true);
    }
  });

  it("returns whole weeks, and only the weeks the month occupies", () => {
    for (const month of [new Date(2026, 1, 1), new Date(2026, 7, 1)]) {
      const weeks = monthGrid(month);

      expect(weeks.every((week) => week.length === 7)).toBe(true);
      expect(weeks.length).toBeGreaterThanOrEqual(4);
      expect(weeks.length).toBeLessThanOrEqual(6);
      // A trailing row of nothing would make the two panels different heights.
      expect(weeks.at(-1)!.some((cell) => cell !== null)).toBe(true);
    }
  });
});

describe("addMonths", () => {
  it("steps by month, not by 30 days", () => {
    expect(addMonths(new Date(2026, 0, 1), 1).getMonth()).toBe(1);
    expect(addMonths(new Date(2026, 0, 1), -1).getFullYear()).toBe(2025);
    expect(addMonths(new Date(2026, 0, 1), -1).getMonth()).toBe(11);
  });

  it("does not skip February from the 31st", () => {
    // The trap: `new Date(2026, 0, 31)` plus a month is 3 March, because the
    // 31st does not exist in the month it lands in. Anchoring to the first is
    // what stops the picker's Next button jumping over a whole month.
    const stepped = addMonths(new Date(2026, 0, 31), 1);

    expect(stepped.getMonth()).toBe(1);
    expect(stepped.getDate()).toBe(1);
  });

  it("is what startOfMonth returns for zero", () => {
    const date = new Date(2026, 7, 21);

    expect(addMonths(date, 0)).toEqual(startOfMonth(date));
  });
});

describe("isSameDay", () => {
  it("compares the day and not the instant", () => {
    expect(isSameDay(new Date(2026, 7, 21, 0), new Date(2026, 7, 21, 23))).toBe(
      true,
    );
    expect(isSameDay(new Date(2026, 7, 21), new Date(2026, 8, 21))).toBe(false);
    expect(isSameDay(new Date(2026, 7, 21), new Date(2025, 7, 21))).toBe(false);
  });
});

describe("formatRangeChip", () => {
  const NOW = new Date(2026, 7, 21);

  it("leaves the year off a range inside the current year", () => {
    expect(
      formatRangeChip(new Date(2026, 6, 22), new Date(2026, 7, 21), NOW),
    ).toBe("22 Jul – 21 Aug");
  });

  it("names the year once for a range wholly inside another one", () => {
    expect(
      formatRangeChip(new Date(2025, 6, 22), new Date(2025, 7, 21), NOW),
    ).toBe("22 Jul – 21 Aug 2025");
  });

  it("names both years for a range that straddles New Year", () => {
    // "22 Dec – 21 Jan" is two different reports and the chip would not say
    // which — the one case where the year is load-bearing rather than noise.
    expect(
      formatRangeChip(new Date(2025, 11, 22), new Date(2026, 0, 21), NOW),
    ).toBe("22 Dec 2025 – 21 Jan 2026");
  });

  it("renders a single day once", () => {
    const day = new Date(2026, 7, 21);

    expect(formatRangeChip(day, day, NOW)).toBe("21 Aug");
  });
});
