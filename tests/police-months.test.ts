import { describe, expect, it } from "vitest";
import {
  POLICE_CATEGORY_LABELS,
  formatPoliceMonth,
  isPoliceMonth,
  policeCategoryLabel,
  policeMonthOf,
  policeMonthsBetween,
} from "@/lib/constants";
import {
  policeMissingMonthsNote,
  policeMonthsLabel,
  policeSourceLabel,
} from "@/lib/police-report";

/**
 * The calendar arithmetic behind the police figures, and the words around them.
 *
 * Every one of these is a place where being off by one is invisible on screen
 * and wrong in a document sent to the police:
 *
 *   * **A period's months.** A report covering 28 July to 2 August overlaps two
 *     calendar months, and the published data has no finer grain than that — so
 *     a resolver that returned one month would print half a period's official
 *     figures under a whole period's VillageWatch reports and say nothing about
 *     the difference.
 *   * **UTC, not `Europe/London`.** The published data is labelled by calendar
 *     month with no zone attached, so a boundary moved by an hour would change
 *     which month a report at midnight on the 1st was counted in without making
 *     any figure more true. The same call `resolveReportRange` documents for its
 *     own boundaries.
 *   * **A category label that is not in the offline copy.** The Home Office has
 *     changed this list before. A category added next year has to render as a
 *     category and never as "Unknown" or as nothing.
 */

describe("isPoliceMonth", () => {
  it("takes YYYY-MM and nothing else", () => {
    expect(isPoliceMonth("2026-05")).toBe(true);
    expect(isPoliceMonth("2026-01")).toBe(true);
    expect(isPoliceMonth("2026-12")).toBe(true);
  });

  it("refuses a month that is not a month", () => {
    expect(isPoliceMonth("2026-00")).toBe(false);
    expect(isPoliceMonth("2026-13")).toBe(false);
    expect(isPoliceMonth("2026-5")).toBe(false);
    expect(isPoliceMonth("2026-05-01")).toBe(false);
    expect(isPoliceMonth("")).toBe(false);
    // The month reaches the database from a query string on the sync route, and
    // a stored month that is not this shape sorts wrongly against every other
    // row for good.
    expect(isPoliceMonth("'; DROP TABLE police_crimes; --")).toBe(false);
  });

  it("refuses a year outside the range the service covers", () => {
    expect(isPoliceMonth("1999-05")).toBe(false);
    expect(isPoliceMonth("2200-05")).toBe(false);
  });
});

describe("policeMonthOf", () => {
  it("reads the month in UTC", () => {
    expect(policeMonthOf(new Date("2026-05-17T12:00:00Z"))).toBe("2026-05");
  });

  it("keeps an instant just before a UTC month boundary in the month it is in", () => {
    // 23:30 on 31 July is July, and would be August in any zone ahead of UTC.
    // The published data carries no zone, so the host's is the only defensible
    // answer and it is stated rather than left to `toLocaleDateString`.
    expect(policeMonthOf(new Date("2026-07-31T23:30:00Z"))).toBe("2026-07");
    expect(policeMonthOf(new Date("2026-08-01T00:30:00Z"))).toBe("2026-08");
  });

  it("pads a single-digit month", () => {
    expect(policeMonthOf(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01");
  });
});

describe("policeMonthsBetween", () => {
  it("covers both months a period straddles", () => {
    expect(
      policeMonthsBetween(
        new Date("2026-07-28T00:00:00Z"),
        new Date("2026-08-02T23:59:59Z"),
      ),
    ).toEqual(["2026-07", "2026-08"]);
  });

  it("returns the one month a period sits inside", () => {
    expect(
      policeMonthsBetween(
        new Date("2026-07-02T00:00:00Z"),
        new Date("2026-07-29T00:00:00Z"),
      ),
    ).toEqual(["2026-07"]);
  });

  it("crosses a year boundary", () => {
    expect(
      policeMonthsBetween(
        new Date("2025-11-20T00:00:00Z"),
        new Date("2026-02-04T00:00:00Z"),
      ),
    ).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("is bounded, so a hand-edited range cannot ask for a thousand months", () => {
    const months = policeMonthsBetween(
      new Date("1990-01-01T00:00:00Z"),
      new Date("2026-08-01T00:00:00Z"),
    );

    expect(months).toHaveLength(24);
  });

  it("returns nothing for a period that runs backwards", () => {
    expect(
      policeMonthsBetween(
        new Date("2026-08-01T00:00:00Z"),
        new Date("2026-05-01T00:00:00Z"),
      ),
    ).toEqual([]);
  });
});

describe("formatPoliceMonth", () => {
  it("reads a stored month as a person would say it", () => {
    expect(formatPoliceMonth("2026-05")).toBe("May 2026");
    expect(formatPoliceMonth("2026-12")).toBe("December 2026");
  });

  it("returns anything unparseable unchanged rather than inventing a date", () => {
    expect(formatPoliceMonth("nonsense")).toBe("nonsense");
  });
});

describe("policeCategoryLabel", () => {
  it("uses the published label for a category it knows", () => {
    expect(policeCategoryLabel("vehicle-crime")).toBe("Vehicle crime");
    expect(policeCategoryLabel("violent-crime")).toBe(
      POLICE_CATEGORY_LABELS["violent-crime"],
    );
  });

  it("title-cases a category added after this constant was written", () => {
    // The Home Office has changed this list before. Rendering "Unknown" for a
    // real category would be worse than a slightly awkward label.
    expect(policeCategoryLabel("wildlife-crime")).toBe("Wildlife crime");
  });

  it("uses Object.hasOwn, so a prototype key is not a category", () => {
    // `POLICE_CATEGORY_LABELS` is a plain object and `in` answers true for
    // `toString` and `constructor`. This reads a free-text column, which is
    // exactly where one of those could arrive — the same trap
    // `resolvePrivacyLevel` is written against.
    expect(policeCategoryLabel("toString")).toBe("ToString");
    expect(policeCategoryLabel("constructor")).toBe("Constructor");
  });
});

describe("policeMonthsLabel", () => {
  it("names one month, pairs two, and spans three or more", () => {
    expect(policeMonthsLabel(["2026-05"])).toBe("May 2026");
    expect(policeMonthsLabel(["2026-05", "2026-06"])).toBe("May 2026 and June 2026");
    // A report covering a year would otherwise print twelve month names in a
    // sentence nobody finishes.
    expect(policeMonthsLabel(["2026-01", "2026-02", "2026-03"])).toBe(
      "January 2026 to March 2026",
    );
  });
});

describe("policeMissingMonthsNote", () => {
  it("says nothing when the period is fully covered", () => {
    expect(policeMissingMonthsNote({ missingMonths: [] })).toBeNull();
  });

  it("names the months that are not there and why they usually are not", () => {
    const note = policeMissingMonthsNote({ missingMonths: ["2026-08"] });

    expect(note).toContain("August 2026");
    // The sentence that stops the figures being read as a complete picture of
    // the period.
    expect(note).toContain("two months");
  });
});

describe("policeSourceLabel", () => {
  it("names the force and the neighbourhood together", () => {
    expect(
      policeSourceLabel({
        forceName: "Cambridgeshire",
        force: "cambridgeshire",
        neighbourhood: "Histon and Impington",
      }),
    ).toBe("Cambridgeshire — Histon and Impington");
  });

  it("falls back to the slug when the display name is missing", () => {
    expect(
      policeSourceLabel({
        forceName: null,
        force: "cambridgeshire",
        neighbourhood: null,
      }),
    ).toBe("cambridgeshire");
  });

  it("returns null rather than a source line naming nobody", () => {
    // This is the one section of the report whose figures are somebody else's,
    // and a reader is entitled to know exactly whose. A line saying "—" would
    // be worse than no line.
    expect(
      policeSourceLabel({ forceName: null, force: null, neighbourhood: null }),
    ).toBeNull();
  });
});
