import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  WeeklySummaryHistory,
  type WeeklySummary,
} from "@/components/reports/weekly-summary-history";
import { EMERGENCY_DISCLAIMER } from "@/lib/digest/format-social-post";
import {
  formatSummaryShare,
  mailtoUrl,
  summaryShareLinks,
  summaryShareSubject,
} from "@/lib/digest/format-summary-share";

/**
 * Sharing a weekly summary from `/reports` — Facebook, WhatsApp and Email.
 *
 * The text and the links are pure and asserted directly: the village and the
 * week in front of the digest's paragraph, the 999 lines last, a `mailto:` with
 * no recipient and spaces as `%20` rather than `+`, and a Facebook button that
 * disappears rather than posting a relative link. The card is rendered to a
 * string, the `period-control.test.tsx` way, to pin the gate: no share buttons
 * unless the caller says the viewer may share.
 *
 * Wording is deliberately not asserted beyond the parts that carry meaning.
 */

const input = {
  villageName: "Histon",
  windowStart: "2026-09-21T23:00:00.000Z",
  windowEnd: "2026-09-28T22:59:59.000Z",
  summary: "  A quiet week: two reports of cars being tried on Station Road.  ",
};

const summary: WeeklySummary = {
  id: "s-1",
  title: "Weekly summary",
  summary: input.summary.trim(),
  type: "VEHICLE_CRIME",
  severity: "LOW",
  incidentCount: 2,
  windowStart: input.windowStart,
  windowEnd: input.windowEnd,
  detector: "claude-weekly",
  createdAt: "2026-09-28T09:00:00.000Z",
};

describe("formatSummaryShare", () => {
  it("puts the village and the week first, the paragraph, then the 999 lines last", () => {
    const text = formatSummaryShare(input);
    const lines = text.split("\n");

    expect(lines[0]).toContain("Histon");
    expect(lines[0]).toContain("22 September 2026"); // London midnight, not 21st UTC
    expect(lines[0]).toContain("28 September 2026");
    expect(text).toContain(
      "A quiet week: two reports of cars being tried on Station Road.",
    );
    expect(lines.slice(-EMERGENCY_DISCLAIMER.length)).toEqual([
      ...EMERGENCY_DISCLAIMER,
    ]);
  });

  it("names the village and the week in the email subject", () => {
    expect(summaryShareSubject(input)).toBe(
      "VillageWatch weekly summary — Histon — 22 September 2026 – 28 September 2026",
    );
  });
});

describe("the links", () => {
  it("builds a mailto with no recipient and spaces as %20, never +", () => {
    const url = mailtoUrl("A subject", "Line one\nLine two & more");

    expect(url.startsWith("mailto:?subject=")).toBe(true);
    expect(url).toContain("A%20subject");
    expect(url).toContain("Line%20one%0ALine%20two%20%26%20more");
    expect(url).not.toContain("+");
  });

  it("carries the same text to every destination", () => {
    const links = summaryShareLinks(input, "https://villagewatch.example");
    const encoded = encodeURIComponent(links.text);

    expect(links.whatsapp).toBe(`https://wa.me/?text=${encoded}`);
    expect(links.email).toContain(`&body=${encoded}`);
    expect(
      new URL(links.facebook!).searchParams.get("quote"),
    ).toBe(links.text);
    expect(new URL(links.facebook!).searchParams.get("u")).toBe(
      "https://villagewatch.example",
    );
  });

  it("drops Facebook rather than share a relative link", () => {
    expect(summaryShareLinks(input, "/").facebook).toBeNull();
  });
});

describe("WeeklySummaryHistory", () => {
  it("renders the three share buttons for a coordinator", () => {
    const html = renderToStaticMarkup(
      <WeeklySummaryHistory
        summaries={[summary]}
        villageName="Histon"
        canShare
      />,
    );

    expect(html).toContain("WhatsApp");
    expect(html).toContain("Facebook");
    expect(html).toContain("Email");
    // Three destinations, and no separate Copy button.
    expect(html).not.toContain("Copy alert");
  });

  it("renders no share buttons when the viewer may not share", () => {
    const html = renderToStaticMarkup(
      <WeeklySummaryHistory
        summaries={[summary]}
        villageName="Histon"
        canShare={false}
      />,
    );

    expect(html).not.toContain("WhatsApp");
    expect(html).not.toContain(">Email");
  });
});
