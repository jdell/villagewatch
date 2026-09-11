import { describe, expect, it } from "vitest";
import type { CommunityReportData } from "@/lib/community-report";
import type { SeriesBucket } from "@/lib/charts/series";
import {
  LOG_COLUMNS,
  PDF_CONTENT_TYPE,
  pdfFilename,
  type ReportChartData,
  renderReportPdf,
} from "@/lib/report-pdf";

const NARRATIVE: CommunityReportData["narrative"] = {
  summary:
    "1 report was published in this village over 31 days. The most common category was vehicle crime (1).",
  patterns: ["7 reports named The lay-by on Mill Road, as residents typed it."],
  recommendation: null,
  source: "counted",
  model: null,
};

/**
 * The community safety report as a PDF.
 *
 * What is worth asserting here is narrow and specific. The layout itself is a
 * judgement — whether 10% is enough for "Severity" is settled by looking at a
 * printed page, not by a test — but two things about it are not judgements at
 * all, and both fail *silently*:
 *
 * 1. **The column widths.** They are percentages of a fixed row, so a set that
 *    summed to more than 100 would not error. It would squeeze the description
 *    column on every page of every report this village ever sends, and the
 *    first person to notice would be a police officer reading a wrapped word
 *    per line.
 * 2. **That it renders at all.** `@react-pdf/renderer` is `serverExternalPackages`
 *    and carries a fork of PDFKit; the failure mode of getting that wrong is a
 *    route that builds cleanly and throws on the first request. A test that
 *    renders a document end to end and checks the magic bytes is the cheapest
 *    thing that catches it, and it needs no secret, no database and no browser
 *    — the property the whole suite rests on.
 *
 * The zero case and the wrapping case are here because they are the two a
 * village actually meets: a quiet week produces a report with nothing in the
 * log, and a busy one produces descriptions long enough to wrap several times
 * inside the description column.
 */

const FROM = new Date(Date.UTC(2026, 6, 1));
const TO = new Date(Date.UTC(2026, 6, 31, 23, 59, 59));

function incident(
  overrides: Partial<CommunityReportData["incidents"][number]> = {},
): CommunityReportData["incidents"][number] {
  return {
    id: "incident-1",
    reference: "VW-HIS-2026-0003",
    type: "VEHICLE_CRIME",
    severity: "HIGH",
    title: "Van window smashed on Mill Road",
    description:
      "A parked van had its passenger window smashed overnight and tools were taken from inside.",
    locationText: "The lay-by on Mill Road",
    occurredAt: new Date(Date.UTC(2026, 6, 21, 2, 30)).toISOString(),
    reportedAt: new Date(Date.UTC(2026, 6, 21, 7, 14)).toISOString(),
    recurring: false,
    patternNote: null,
    anonymized: true,
    ...overrides,
  };
}

function report(
  overrides: Partial<CommunityReportData> = {},
): CommunityReportData {
  return {
    villageName: "Histon",
    dataController: "Histon & Impington Parish Council",
    from: FROM.toISOString(),
    to: TO.toISOString(),
    generatedAt: new Date(Date.UTC(2026, 7, 1, 9, 0)).toISOString(),
    total: 1,
    previousTotal: 4,
    byType: [{ key: "VEHICLE_CRIME", count: 1 }],
    bySeverity: [{ key: "HIGH", count: 1 }],
    hotspots: [{ location: "The lay-by on Mill Road", count: 1 }],
    // Off by default, like `police` below. Every case that wants the
    // most-concerning section passes one through `overrides`.
    mostConcerning: [],
    // Off by default. The layout assertions below are about the log and the
    // column widths, and every case that wants the police section passes one
    // through `overrides`.
    police: null,
    incidents: [incident()],
    omitted: 0,
    narrative: NARRATIVE,
    ...overrides,
  };
}

function buckets(counts: readonly number[]): SeriesBucket[] {
  return counts.map((count, index) => ({
    key: `2026-07-${String(index + 1).padStart(2, "0")}`,
    label: `${index + 1} Jul`,
    count,
  }));
}

function charts(overrides: Partial<ReportChartData> = {}): ReportChartData {
  return {
    trend: buckets([3, 0, 5, 1, 0, 0, 2]),
    trendLabel: "by day",
    ...overrides,
  };
}

/** `%PDF-` at the front and `%%EOF` at the back is what a reader looks for. */
function expectPdf(bytes: Buffer) {
  expect(bytes.byteLength).toBeGreaterThan(1_000);
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(bytes.subarray(-1024).toString("latin1")).toContain("%%EOF");
}

describe("LOG_COLUMNS", () => {
  it("totals 100% across the six columns", () => {
    const total = LOG_COLUMNS.reduce(
      (sum, column) => sum + Number.parseFloat(column.width),
      0,
    );

    expect(total).toBe(100);
  });

  it("gives the free-text column the most room", () => {
    // Five of the six carry a timestamp, a code or an enum label and none of
    // those grows. The sixth carries the title, the description and the
    // pattern note, so it should be the widest by some distance — if a future
    // edit takes room off it, that is the assertion that should have to change
    // deliberately rather than a document that quietly got harder to read.
    const widths = LOG_COLUMNS.map((column) => Number.parseFloat(column.width));
    const report = widths[LOG_COLUMNS.findIndex((c) => c.key === "report")];

    expect(report).toBe(Math.max(...widths));
    expect(report).toBeGreaterThanOrEqual(2 * Math.max(...widths.slice(0, 5)));
  });
});

describe("pdfFilename", () => {
  it("names the village and both ends of the period", () => {
    expect(pdfFilename(report())).toBe(
      "villagewatch-report-histon-2026-07-01-to-2026-07-31.pdf",
    );
  });

  it("survives a village name that is not a slug", () => {
    const name = pdfFilename({
      villageName: "St Ives (Cambs.)",
      from: FROM,
      to: TO,
    });

    // No spaces, no brackets, no full stops, and one extension.
    expect(name).toBe("villagewatch-report-st-ives-cambs-2026-07-01-to-2026-07-31.pdf");
    expect(name).toMatch(/^[a-z0-9-]+\.pdf$/);
  });
});

describe("renderReportPdf", () => {
  it("renders a valid PDF", async () => {
    expectPdf(await renderReportPdf(report()));
  });

  it("renders a period with nothing in it", async () => {
    // The quiet week. Every section has an empty branch and none of them may
    // be the one that throws — a village with no reports is the village most
    // likely to be sending this to a parish council to say so.
    expectPdf(
      await renderReportPdf(
        report({
          total: 0,
          previousTotal: 0,
          byType: [],
          bySeverity: [],
          hotspots: [],
          incidents: [],
        }),
      ),
    );
  });

  it("renders a full log across several pages", async () => {
    // `REPORT_MAX_INCIDENTS` rows of wrapping text, each with a pattern note.
    // This is the case that pages, repeats the column headings and puts the
    // disclaimer on every sheet; it is also the slowest thing the route does,
    // which is worth knowing costs a test rather than a timeout in production.
    const rows = Array.from({ length: 200 }, (_, index) =>
      incident({
        id: `incident-${index}`,
        reference: `VW-HIS-2026-${String(index).padStart(4, "0")}`,
        recurring: true,
        patternNote: "Fourth report in this area this month",
        description:
          "A resident described a repeated disturbance late at night involving a group gathering by the bus shelter, shouting, and litter left behind afterwards. ".repeat(
            3,
          ),
      }),
    );

    expectPdf(
      await renderReportPdf(report({ total: 240, incidents: rows, omitted: 40 })),
    );
    /*
      An explicit timeout, and the only one in the suite.

      Two hundred rows through PDFKit is around 1.4s on a developer's machine
      and comfortably over 5s on a shared CI runner — roughly 3.5x, which is an
      ordinary gap between an M-series laptop and a GitHub runner under load.
      Vitest's default is 5000ms, so this test sat just inside the limit locally
      and just outside it there: green on every machine anybody checked it on,
      red often enough in CI to teach people to press re-run.

      Raising it is the right fix rather than a workaround. The slowness is the
      point of the test — it is the case that pages, and the reason it exists is
      that the broken shape only appears past about eight pages — so there is no
      version of it that is quick. 30s is far enough above the real figure that
      load cannot reach it, and far enough below a hang that an infinite loop in
      the renderer still fails the run rather than sitting there for the job's
      whole budget.
    */
  }, 30_000);

  it("renders a location with no space in it to wrap at", async () => {
    // `locationText` is free text a resident typed. A run longer than the
    // column has nothing to wrap at, and without the hyphenation callback in
    // `report-pdf.tsx` it prints straight across the description beside it —
    // which is not an error, just a page nobody can read.
    expectPdf(
      await renderReportPdf(
        report({
          incidents: [
            incident({
              locationText: "behindtheoldpumpinghouseonthefarsideofthegreen",
              reference: "VW-LONGVILLAGE-2026-00042",
            }),
          ],
        }),
      ),
    );
  });

  /*
    The charts.

    None of these can assert what the blocks *look like* — that was settled by
    rendering one and reading it, the way the column widths were — and the first
    version of them was badly wrong in a way a magic-bytes check would have
    passed: every block carried `flex: 1`, which is right for a child of a row
    and makes each block in a *column* claim the whole height, so the trend, the
    categories and the severity key drew on top of each other. What these do
    cover is the arithmetic behind the widths, which is where a shape nobody
    anticipated stops the download: a division with no denominator, and a
    period the chart query could not count.
  */
  it("renders a report with its charts", async () => {
    expectPdf(
      await renderReportPdf(
        report({
          total: 11,
          byType: [
            { key: "ANTISOCIAL_BEHAVIOUR", count: 6 },
            { key: "VEHICLE_CRIME", count: 4 },
            // The 2% floor. Against a maximum of six this is 16%, but a single
            // report in a busy month is the row that would otherwise be a
            // label, a count and an empty track.
            { key: "THEFT", count: 1 },
          ],
          bySeverity: [
            { key: "LOW", count: 7 },
            { key: "MEDIUM", count: 3 },
            { key: "CRITICAL", count: 1 },
          ],
        }),
        charts(),
      ),
    );
  });

  it("renders the same document as before when no charts are passed", async () => {
    // The second argument is optional so the clipboard's and the share sheet's
    // caller — neither of which has a series — still get a document. A route
    // whose trend query degraded to nothing lands here too.
    expectPdf(await renderReportPdf(report()));
  });

  it("draws no trend strip for a period the query could not count", async () => {
    // `getIncidentTrend` degrades to an empty axis rather than throwing, and a
    // quiet period counts every bucket as zero. Both reach `TrendBars` and
    // both have to leave the rest of the document standing — the second is the
    // one that divides by the maximum.
    expectPdf(await renderReportPdf(report(), charts({ trend: [] })));
    expectPdf(
      await renderReportPdf(report(), charts({ trend: buckets([0, 0, 0]) })),
    );
  });

  it("renders a breakdown whose rows all count zero", async () => {
    /*
      `collectVillageReport` drops empty levels, so this is not a shape the
      route can produce today. It is a shape the *type* allows, and it takes the
      whole document with it rather than one bar: `0 / 0` is `NaN`, `Math.max`
      propagates it, and @react-pdf throws `Invalid value NaN% for setWidth`
      rather than drawing nothing. So this renders, which without the guard in
      `BarBreakdown` it would not.
    */
    expectPdf(
      await renderReportPdf(
        report({
          total: 0,
          byType: [
            { key: "VEHICLE_CRIME", count: 0 },
            { key: "THEFT", count: 0 },
          ],
          bySeverity: [{ key: "LOW", count: 0 }],
          incidents: [],
        }),
        charts(),
      ),
    );
  });

  it("renders a report with no location and an un-rewritten description", async () => {
    // `locationText` is nullable and `anonymized` is false wherever the AI pass
    // did not run. Neither is exotic and both reach this layout.
    expectPdf(
      await renderReportPdf(
        report({
          hotspots: [],
          incidents: [
            incident({
              locationText: null,
              anonymized: false,
              description: "Someone was hanging around the green. — “again”.",
            }),
          ],
        }),
      ),
    );
  });
});

describe("PDF_CONTENT_TYPE", () => {
  it("is what a browser needs to open the file rather than save it blind", () => {
    expect(PDF_CONTENT_TYPE).toBe("application/pdf");
  });
});
