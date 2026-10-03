import { describe, expect, it } from "vitest";
import {
  DRAFT_MIN_CHARS,
  buildReportPayload,
  fallbackTitle,
  occurredAtFor,
  type ReportDraft,
} from "@/lib/map/report-draft";
import { incidentProcessSchema, incidentReportSchema } from "@/lib/validations";

/**
 * The modern report sheet's draft and the body it files.
 *
 * The sheet is a new screen over the wizard's two routes, so the property that
 * matters is that what it sends is what `POST /api/incidents` accepts — which
 * is asserted by parsing the built body with the route's own schema rather
 * than by comparing it to a copy of the wizard's.
 */

const NOW = Date.UTC(2026, 9, 3, 12);

function draft(over: Partial<ReportDraft> = {}): ReportDraft {
  return {
    description: "Two people trying car door handles along the High Street.",
    publicDescription: "",
    title: "People trying car doors",
    type: "SUSPICIOUS_ACTIVITY",
    severity: "MEDIUM",
    occurredAt: new Date(NOW).toISOString(),
    lat: 52.2541,
    lng: 0.106,
    locationText: "",
    tags: [],
    media: [],
    ai: null,
    ...over,
  };
}

describe("buildReportPayload", () => {
  it("builds a body the route's own schema accepts", () => {
    const parsed = incidentReportSchema.safeParse(buildReportPayload(draft()));
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("accepts a drafted report with media, tags and provenance too", () => {
    const parsed = incidentReportSchema.safeParse(
      buildReportPayload(
        draft({
          publicDescription: "Two people were seen trying car door handles.",
          tags: ["car", "night"],
          locationText: "High Street",
          media: [
            {
              storagePath: "v/u/a.jpg",
              thumbnailPath: "v/u/a-thumb.jpg",
              mimeType: "image/jpeg",
              fileSize: 1000,
              width: 800,
              height: 600,
              facesDetected: 1,
            },
          ],
          ai: { model: "claude-sonnet-5", recurring: false, confidence: 0.8 },
        }),
      ),
    );
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("sends the rewrite as the public text and the reporter's words as the raw text", () => {
    const body = buildReportPayload(
      draft({ publicDescription: "The anonymised version." }),
    );
    expect(body.description).toBe("The anonymised version.");
    expect(body.rawDescription).toBe(draft().description);
  });

  it("sends one text, and no raw column, when there was no rewrite", () => {
    const body = buildReportPayload(draft());
    expect(body.description).toBe(draft().description);
    expect(body).not.toHaveProperty("rawDescription");
  });

  it("is anonymous, not reported to the police, and always carries a severity", () => {
    const body = buildReportPayload(draft({ severity: "LOW" }));
    expect(body.isAnonymous).toBe(true);
    expect(body.reportedToPolice).toBe(false);
    expect(body.severity).toBe("LOW");
  });

  it("omits an empty landmark and the AI block when there was no draft", () => {
    const body = buildReportPayload(draft({ locationText: "   " }));
    expect(body).not.toHaveProperty("locationText");
    expect(body).not.toHaveProperty("ai");
  });
});

describe("occurredAtFor", () => {
  it("turns each chip into a time before now", () => {
    expect(occurredAtFor("now", "", NOW)).toBe(new Date(NOW).toISOString());
    expect(new Date(occurredAtFor("earlier", "", NOW)).getTime()).toBe(NOW - 2 * 3600_000);
    expect(new Date(occurredAtFor("yesterday", "", NOW)).getTime()).toBe(NOW - 24 * 3600_000);
  });

  it("uses a picked time, and falls back to now for one that does not parse", () => {
    expect(occurredAtFor("custom", "2026-10-02T21:30", NOW)).toBe(
      new Date("2026-10-02T21:30").toISOString(),
    );
    expect(occurredAtFor("custom", "", NOW)).toBe(new Date(NOW).toISOString());
  });
});

describe("the draft's floor and its fallback title", () => {
  it("asks for exactly what the AI route accepts", () => {
    const base = { lat: 52.25, lng: 0.1 };
    expect(
      incidentProcessSchema.safeParse({ ...base, description: "x".repeat(DRAFT_MIN_CHARS) }).success,
    ).toBe(true);
    expect(
      incidentProcessSchema.safeParse({ ...base, description: "x".repeat(DRAFT_MIN_CHARS - 1) }).success,
    ).toBe(false);
  });

  it("makes a title the server accepts from the reporter's first words", () => {
    const short = fallbackTitle("  Bin set alight by the shop  ");
    expect(short).toBe("Bin set alight by the shop");
    const long = fallbackTitle(
      "A long description of everything that happened outside the village hall on Tuesday evening",
    );
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeGreaterThanOrEqual(5);
  });
});
