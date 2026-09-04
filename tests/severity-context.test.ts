import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two contextual factors the AI severity proposal added.
 *
 * Prisma is mocked at its module boundary, as everywhere else in this suite, so
 * this runs on a fresh clone with no `.env.local`. What it asserts is the set of
 * rules that decide whether the figure handed to Claude means anything:
 *
 *   * **A young village reports `insufficientHistory` and no baseline.** This
 *     is the assertion worth having. "This street is normally quiet" computed
 *     over three weeks would be true of every street in every village on its
 *     first month, and the model is explicitly told to say nothing about how
 *     busy an area is when the block is absent — so the block has to be absent.
 *   * **Reads are village-scoped and narrowed to `PUBLIC_INCIDENT_STATUSES`.**
 *     A baseline over the moderation queue would let a rationale a resident
 *     reads describe reports the queue has not cleared (domain rules 4 and 6).
 *   * **A rise from nothing is not a trend.** With no prior reports of a
 *     category there is no rate to compare against, and "up 300%" about the
 *     first one is arithmetic standing in for meaning.
 *   * **Nothing throws.** This runs inside `POST /api/incidents/process`, whose
 *     whole contract is that a reporter can always still file.
 */

const mocks = vi.hoisted(() => ({
  villageFindUnique: vi.fn(),
  incidentFindMany: vi.fn(),
  incidentCount: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    village: { findUnique: mocks.villageFindUnique },
    incident: { findMany: mocks.incidentFindMany, count: mocks.incidentCount },
  },
}));

import {
  MIN_VILLAGE_AGE_DAYS,
  formatSeverityContextForPrompt,
  getSeverityContext,
} from "@/lib/ai/severity-context";

const VILLAGE = "village-1";
const NOW = new Date("2026-09-05T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

/** The report's own pin. Everything below is positioned relative to it. */
const HERE = { lat: 52.2583, lng: 0.1049 };

/** ~90m north — inside the 200m radius. */
const NEAR = { lat: 52.2591, lng: 0.1049 };

/** ~1.1km north — outside it. */
const FAR = { lat: 52.2683, lng: 0.1049 };

function aged(days: number) {
  return { createdAt: new Date(NOW.getTime() - days * DAY) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test";
  mocks.villageFindUnique.mockResolvedValue(aged(400));
  mocks.incidentFindMany.mockResolvedValue([]);
  mocks.incidentCount.mockResolvedValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getSeverityContext — the history guard", () => {
  it("refuses to claim a baseline for a village younger than the threshold", async () => {
    mocks.villageFindUnique.mockResolvedValue(aged(MIN_VILLAGE_AGE_DAYS - 1));

    const context = await getSeverityContext({
      villageId: VILLAGE,
      ...HERE,
      type: "VEHICLE_CRIME",
      now: NOW,
    });

    expect(context?.insufficientHistory).toBe(true);
    expect(context?.areaBaselinePerMonth).toBe(0);

    // And it does not spend the queries working out a figure it will not use.
    expect(mocks.incidentFindMany).not.toHaveBeenCalled();
    expect(mocks.incidentCount).not.toHaveBeenCalled();
  });

  it("computes a baseline once the village is old enough", async () => {
    mocks.villageFindUnique.mockResolvedValue(aged(MIN_VILLAGE_AGE_DAYS + 1));

    const context = await getSeverityContext({
      villageId: VILLAGE,
      ...HERE,
      now: NOW,
    });

    expect(context?.insufficientHistory).toBe(false);
    expect(mocks.incidentFindMany).toHaveBeenCalled();
  });

  /**
   * The prompt's own instruction is that no block means say nothing about how
   * busy the area is. A block that was present but full of zeroes would be read
   * as "nothing has ever happened here", which is the opposite of what an
   * unknown baseline means — so this asserts the *absence*, not the contents.
   */
  it("renders no prompt block at all for a young village", () => {
    expect(
      formatSeverityContextForPrompt({
        areaBaselinePerMonth: 0,
        areaLast30Days: 0,
        categoryTrend: null,
        insufficientHistory: true,
      }),
    ).toBe("");

    expect(formatSeverityContextForPrompt(null)).toBe("");
  });
});

describe("getSeverityContext — the area figures", () => {
  it("counts only reports inside the radius", async () => {
    mocks.incidentFindMany.mockResolvedValue([
      { ...NEAR, occurredAt: new Date(NOW.getTime() - 5 * DAY) },
      { ...NEAR, occurredAt: new Date(NOW.getTime() - 200 * DAY) },
      { ...FAR, occurredAt: new Date(NOW.getTime() - 5 * DAY) },
    ]);

    const context = await getSeverityContext({
      villageId: VILLAGE,
      ...HERE,
      now: NOW,
    });

    // Two of the three are within 200m; over 12 months that is 0.2 per 30 days.
    expect(context?.areaBaselinePerMonth).toBeCloseTo(0.2, 5);
    // One of those two is inside the last 30 days.
    expect(context?.areaLast30Days).toBe(1);
  });

  it("narrows to the village and to publishable statuses", async () => {
    await getSeverityContext({ villageId: VILLAGE, ...HERE, now: NOW });

    const [{ where, select }] = mocks.incidentFindMany.mock.calls[0];

    expect(where.villageId).toBe(VILLAGE);
    expect(where.status).toEqual({ in: ["PUBLISHED", "RESOLVED"] });

    // Coordinates and a date, and nothing else. A baseline query has no reason
    // to pull a resident's words across.
    expect(Object.keys(select).sort()).toEqual(["lat", "lng", "occurredAt"]);
  });

  it("returns zeroes rather than guessing when the report has no pin", async () => {
    const context = await getSeverityContext({
      villageId: VILLAGE,
      lat: null,
      lng: null,
      now: NOW,
    });

    expect(context?.areaBaselinePerMonth).toBe(0);
    expect(context?.areaLast30Days).toBe(0);
    expect(mocks.incidentFindMany).not.toHaveBeenCalled();
  });
});

describe("getSeverityContext — the category trend", () => {
  it("compares the last 30 days against the 90 before it, at the same rate", async () => {
    // 4 recent, 9 prior over 90 days → 3 per 30 days.
    mocks.incidentCount.mockResolvedValueOnce(4).mockResolvedValueOnce(9);

    const context = await getSeverityContext({
      villageId: VILLAGE,
      ...HERE,
      type: "VEHICLE_CRIME",
      now: NOW,
    });

    expect(context?.categoryTrend).toEqual({
      type: "VEHICLE_CRIME",
      recent: 4,
      priorRate: 3,
    });
  });

  it("reports no trend where the category has no history", async () => {
    // A rise from nothing is the first report of its kind, not a trend.
    mocks.incidentCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0);

    const context = await getSeverityContext({
      villageId: VILLAGE,
      ...HERE,
      type: "BURGLARY",
      now: NOW,
    });

    expect(context?.categoryTrend).toBeNull();
  });

  it("asks for no trend at all when the report has no category yet", async () => {
    await getSeverityContext({ villageId: VILLAGE, ...HERE, now: NOW });

    expect(mocks.incidentCount).not.toHaveBeenCalled();
  });
});

describe("getSeverityContext — degradation", () => {
  it("returns null rather than throwing when a query fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.incidentFindMany.mockRejectedValue(new Error("connection refused"));

    await expect(
      getSeverityContext({ villageId: VILLAGE, ...HERE, now: NOW }),
    ).resolves.toBeNull();
  });

  it("returns null for a village that no longer exists", async () => {
    mocks.villageFindUnique.mockResolvedValue(null);

    await expect(
      getSeverityContext({ villageId: VILLAGE, ...HERE, now: NOW }),
    ).resolves.toBeNull();
  });

  it("makes no query at all with no database configured", async () => {
    delete process.env.DATABASE_URL;

    await expect(
      getSeverityContext({ villageId: VILLAGE, ...HERE, now: NOW }),
    ).resolves.toBeNull();
    expect(mocks.villageFindUnique).not.toHaveBeenCalled();
  });
});

describe("formatSeverityContextForPrompt", () => {
  it("names both area figures and the trend where there is one", () => {
    const block = formatSeverityContextForPrompt({
      areaBaselinePerMonth: 0.8,
      areaLast30Days: 3,
      categoryTrend: { type: "VEHICLE_CRIME", recent: 3, priorRate: 0.7 },
      insufficientHistory: false,
    });

    expect(block).toContain("<area_context>");
    expect(block).toContain("0.8");
    expect(block).toContain("3");
    expect(block).toContain("0.7");
  });

  it("omits the trend line when there is no trend", () => {
    const block = formatSeverityContextForPrompt({
      areaBaselinePerMonth: 0.8,
      areaLast30Days: 3,
      categoryTrend: null,
      insufficientHistory: false,
    });

    expect(block).toContain("<area_context>");
    expect(block).not.toContain("category");
  });
});
