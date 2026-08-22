import { describe, expect, it } from "vitest";
import type { CommunityReportData } from "@/lib/community-report";
import { formatCommunityReport } from "@/lib/community-report";
import { POLICE_ATTRIBUTION, POLICE_COMPARISON_NOTE } from "@/lib/constants";
import type { PoliceComparison } from "@/lib/police-report";

/**
 * The police comparison inside the community safety report.
 *
 * This asserts the plain-text document, which is what `Copy report` and the
 * share sheet produce. The screen and the PDF render the same
 * `PoliceComparison` through the same three helpers from `police-report.ts`, so
 * what is pinned here is the content and the rules rather than the markup:
 *
 *   * **A comparison never travels without its caveat.** Two counts side by
 *     side, measured over different areas on different definitions two months
 *     apart, are misleading on their own. `POLICE_COMPARISON_NOTE` is what makes
 *     them not be, and it is one constant precisely so this test can assert it
 *     in one place for four surfaces.
 *   * **Absence is stated, never rounded to zero.** A period whose months have
 *     not been published must say so. The failure it prevents is specific: "0
 *     recorded crimes" in a document addressed to a PCSO, about their own
 *     figures, produced by a `count(*)` that is individually correct.
 *   * **No section at all when nothing is held.** A heading over an empty
 *     figure reads, in a police document, as a section that failed.
 *   * **Attribution.** data.police.uk is Open Government Licence v3.0, which
 *     asks for the acknowledgement wherever the data is shown — a licence
 *     condition rather than a courtesy, the same one `ONS_ATTRIBUTION` carries.
 */

const APP_URL = "https://villagewatch.example";

const COMPARISON: PoliceComparison = {
  months: ["2026-05", "2026-06"],
  missingMonths: [],
  total: 14,
  byCategory: [
    { category: "vehicle-crime", label: "Vehicle crime", count: 6 },
    { category: "anti-social-behaviour", label: "Anti-social behaviour", count: 5 },
    { category: "burglary", label: "Burglary", count: 3 },
  ],
  villageReports: 4,
  force: "cambridgeshire",
  forceName: "Cambridgeshire",
  neighbourhood: "Histon and Impington",
  latestMonth: "2026-06",
  fetchedAt: "2026-08-01T02:00:00.000Z",
};

function report(police: PoliceComparison | null): CommunityReportData {
  return {
    villageName: "Histon",
    dataController: "Histon Neighbourhood Watch",
    from: new Date("2026-05-01T00:00:00Z"),
    to: new Date("2026-06-30T23:59:59Z"),
    generatedAt: new Date("2026-08-01T09:00:00Z"),
    total: 4,
    previousTotal: 3,
    byType: [{ key: "VEHICLE_CRIME", count: 4 }],
    bySeverity: [{ key: "MEDIUM", count: 4 }],
    hotspots: [{ location: "Mill Lane", count: 2 }],
    police,
    narrative: null,
    incidents: [],
    omitted: 0,
  };
}

describe("the police section of the period report", () => {
  it("prints both counts and names the months they cover", () => {
    const document = formatCommunityReport(report(COMPARISON), APP_URL);

    expect(document).toContain("POLICE RECORDED CRIME");
    expect(document).toContain("May 2026 and June 2026");
    expect(document).toMatch(/Police recorded crimes\s+14/);
    expect(document).toMatch(/VillageWatch reports\s+4/);
  });

  it("lists the police categories under their own heading", () => {
    const document = formatCommunityReport(report(COMPARISON), APP_URL);

    // "By police category", not "By category" — the section above it is the
    // village's own breakdown over the same page, and two identical headings
    // over two different series is the whole failure this feature is shaped to
    // avoid.
    expect(document).toContain("By police category");
    expect(document).toMatch(/Vehicle crime\s+6/);
  });

  it("never prints the two counts without saying what differs between them", () => {
    const document = formatCommunityReport(report(COMPARISON), APP_URL);

    expect(document).toContain(POLICE_COMPARISON_NOTE);
  });

  it("carries the Open Government Licence acknowledgement", () => {
    const document = formatCommunityReport(report(COMPARISON), APP_URL);

    expect(document).toContain(POLICE_ATTRIBUTION);
  });

  it("names the force and neighbourhood the figures came from", () => {
    const document = formatCommunityReport(report(COMPARISON), APP_URL);

    expect(document).toContain("Cambridgeshire — Histon and Impington");
  });

  it("says which months are missing rather than counting them as zero", () => {
    const document = formatCommunityReport(
      report({ ...COMPARISON, missingMonths: ["2026-07", "2026-08"] }),
      APP_URL,
    );

    expect(document).toContain("July 2026 and August 2026");
    expect(document).toContain("about two months");
    // And the figures it does have are still there, under the months it names.
    expect(document).toContain("May 2026 and June 2026");
  });

  it("renders the honest absence when no month has been published yet", () => {
    const document = formatCommunityReport(
      report({
        ...COMPARISON,
        months: [],
        missingMonths: ["2026-07", "2026-08"],
        total: 0,
        byCategory: [],
        villageReports: 0,
        latestMonth: null,
      }),
      APP_URL,
    );

    expect(document).toContain("POLICE RECORDED CRIME");
    expect(document).toContain("No official police figures are held");
    // The one thing that must not be here: a zero presented as a count of
    // recorded crime.
    expect(document).not.toMatch(/Police recorded crimes\s+0/);
    // The neighbourhood is still worth saying — it is what a coordinator would
    // use to chase the figures.
    expect(document).toContain("Cambridgeshire — Histon and Impington");
  });

  it("omits the section entirely when nothing is held for the village", () => {
    const document = formatCommunityReport(report(null), APP_URL);

    expect(document).not.toContain("POLICE RECORDED CRIME");
    expect(document).not.toContain(POLICE_COMPARISON_NOTE);
    // Everything else about the document is untouched: a deployment that never
    // runs the sync produces exactly the report it produced before.
    expect(document).toContain("COMMUNITY SAFETY REPORT");
    expect(document).toContain("HOTSPOTS");
    expect(document).toContain("PATTERN ANALYSIS");
  });

  it("puts the comparison between the village's own counts and the analysis", () => {
    const document = formatCommunityReport(report(COMPARISON), APP_URL);

    // The order is the order a recipient reads in, and it is the same order on
    // screen and in the PDF — the three are one document.
    expect(document.indexOf("HOTSPOTS")).toBeLessThan(
      document.indexOf("POLICE RECORDED CRIME"),
    );
    expect(document.indexOf("POLICE RECORDED CRIME")).toBeLessThan(
      document.indexOf("PATTERN ANALYSIS"),
    );
  });
});
