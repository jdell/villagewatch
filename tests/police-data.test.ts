import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The layer between data.police.uk and Postgres.
 *
 * Prisma and the API client are mocked at their module boundaries, as
 * everywhere else in this suite, so this runs on a fresh clone with no
 * `.env.local`. What it asserts is the handful of rules that decide whether a
 * figure in a document sent to the police is true:
 *
 *   * **"Published and empty" is not "never fetched".** A `count(*)` over
 *     `police_crimes` returns zero for both, and a report that printed that
 *     zero would be making a statement about a police force's own figures on
 *     the strength of a request nobody ever sent. The month list a comparison
 *     carries is what separates them, and a month whose fetch *failed* counts as
 *     missing rather than as empty — we do not know what it holds.
 *   * **A month is replaced, never merged.** The Home Office withdraws records;
 *     a merged month drifts further from the published figure on every refresh.
 *   * **A failed refresh does not destroy what is already held.** The last known
 *     good month stays, because a section vanishing from a report over a
 *     timeout is a worse outcome than a stale figure that says when it was read.
 *   * **A fresh month costs no request.** The cache window is what stops a
 *     scheduled job asking the Home Office for the same unchanged month every
 *     night.
 */

const mocks = vi.hoisted(() => ({
  crimeDeleteMany: vi.fn(),
  crimeCreateMany: vi.fn(),
  crimeGroupBy: vi.fn(),
  syncFindMany: vi.fn(),
  syncUpsert: vi.fn(),
  neighbourhoodFindUnique: vi.fn(),
  incidentCount: vi.fn(),
  transaction: vi.fn(),
  fetchStreetLevelCrimes: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    policeCrime: {
      deleteMany: mocks.crimeDeleteMany,
      createMany: mocks.crimeCreateMany,
      groupBy: mocks.crimeGroupBy,
    },
    policeDataSync: {
      findMany: mocks.syncFindMany,
      upsert: mocks.syncUpsert,
    },
    policeNeighbourhood: { findUnique: mocks.neighbourhoodFindUnique },
    incident: { count: mocks.incidentCount },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/police-api", () => ({
  fetchStreetLevelCrimes: mocks.fetchStreetLevelCrimes,
  fetchNeighbourhood: vi.fn(),
  fetchNeighbourhoodTeam: vi.fn(),
  locateNeighbourhood: vi.fn(),
}));

const {
  getVillagePoliceComparison,
  syncVillageMonth,
  syncVillagePoliceData,
} = await import("@/lib/police-data");
const { POLICE_REFRESH_DAYS } = await import("@/lib/constants");

const VILLAGE = {
  id: "village-1",
  name: "Histon",
  centerLat: 52.2534,
  centerLng: 0.0997,
};

const NOW = new Date("2026-08-22T02:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();

  mocks.transaction.mockResolvedValue([]);
  mocks.syncUpsert.mockReturnValue({ __statement: "upsert" });
  mocks.crimeDeleteMany.mockReturnValue({ __statement: "delete" });
  mocks.crimeCreateMany.mockReturnValue({ __statement: "create" });
  mocks.syncFindMany.mockResolvedValue([]);
  mocks.crimeGroupBy.mockResolvedValue([]);
  mocks.neighbourhoodFindUnique.mockResolvedValue(null);
  mocks.incidentCount.mockResolvedValue(0);
});

describe("syncVillageMonth", () => {
  it("replaces the month rather than merging into it", async () => {
    mocks.fetchStreetLevelCrimes.mockResolvedValue({
      ok: true,
      data: {
        crimes: [
          {
            crimeId: "1",
            persistentId: null,
            category: "burglary",
            month: "2026-05",
            lat: 52.25,
            lng: 0.1,
            streetId: 1,
            streetName: "On or near Mill Road",
            locationType: "Force",
            locationSubtype: null,
            context: null,
            outcomeCategory: null,
            outcomeDate: null,
          },
        ],
        dropped: 0,
        truncated: false,
      },
    });

    const outcome = await syncVillageMonth({
      village: VILLAGE,
      month: "2026-05",
      now: NOW,
    });

    expect(outcome).toMatchObject({ month: "2026-05", status: "ok", crimes: 1 });

    // Delete then insert then record, and all three inside one transaction —
    // a half-applied month is a count no published figure agrees with.
    expect(mocks.crimeDeleteMany).toHaveBeenCalledWith({
      where: { villageId: VILLAGE.id, month: "2026-05" },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.mock.calls[0][0]).toHaveLength(3);
  });

  it("records a 404 as a month the police have not published, and keeps what is held", async () => {
    mocks.fetchStreetLevelCrimes.mockResolvedValue({
      ok: false,
      code: "no_data",
      message: "data.police.uk has no data for that request",
    });

    const outcome = await syncVillageMonth({
      village: VILLAGE,
      month: "2026-08",
      now: NOW,
    });

    expect(outcome).toMatchObject({ month: "2026-08", status: "empty", crimes: 0 });

    // `empty` and not `failed`: the service answering "not published yet" is
    // the ordinary state of the two most recent months, and it is what lets a
    // report say "no figures for August" rather than "0 crimes in August".
    expect(mocks.syncUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.syncUpsert.mock.calls[0][0].create).toMatchObject({
      status: "empty",
      crimeCount: 0,
    });

    // Nothing was deleted. A month that failed to refresh keeps its last known
    // good figures rather than emptying a section of the report.
    expect(mocks.crimeDeleteMany).not.toHaveBeenCalled();
  });

  it("records a timeout as failed without touching the stored figures", async () => {
    mocks.fetchStreetLevelCrimes.mockResolvedValue({
      ok: false,
      code: "timeout",
      message: "data.police.uk did not answer within 20s",
    });

    const outcome = await syncVillageMonth({
      village: VILLAGE,
      month: "2026-05",
      now: NOW,
    });

    expect(outcome.status).toBe("failed");
    expect(mocks.crimeDeleteMany).not.toHaveBeenCalled();
  });

  it("refuses a month that is not a month, without spending a request", async () => {
    const outcome = await syncVillageMonth({
      village: VILLAGE,
      month: "2026-13",
      now: NOW,
    });

    expect(outcome.status).toBe("failed");
    expect(mocks.fetchStreetLevelCrimes).not.toHaveBeenCalled();
  });
});

describe("syncVillagePoliceData", () => {
  it("does not re-fetch a month it already holds", async () => {
    mocks.syncFindMany.mockResolvedValue([
      {
        month: "2026-05",
        status: "ok",
        fetchedAt: new Date(NOW.getTime() - 2 * DAY_MS),
      },
    ]);

    const { outcomes, spent } = await syncVillagePoliceData({
      village: VILLAGE,
      months: ["2026-05"],
      budget: 10,
      now: NOW,
    });

    expect(spent).toBe(0);
    expect(outcomes[0].status).toBe("cached");
    expect(mocks.fetchStreetLevelCrimes).not.toHaveBeenCalled();
  });

  it("re-fetches a month once the cache window has passed", async () => {
    mocks.syncFindMany.mockResolvedValue([
      {
        month: "2026-05",
        status: "ok",
        fetchedAt: new Date(NOW.getTime() - (POLICE_REFRESH_DAYS + 1) * DAY_MS),
      },
    ]);
    mocks.fetchStreetLevelCrimes.mockResolvedValue({
      ok: true,
      data: { crimes: [], dropped: 0, truncated: false },
    });

    const { spent } = await syncVillagePoliceData({
      village: VILLAGE,
      months: ["2026-05"],
      budget: 10,
      now: NOW,
    });

    // Outcomes are revised upstream after publication as investigations close,
    // so the window is a window rather than "never again".
    expect(spent).toBe(1);
  });

  it("retries a month that came back empty rather than caching the absence", async () => {
    mocks.syncFindMany.mockResolvedValue([
      { month: "2026-08", status: "empty", fetchedAt: new Date(NOW.getTime() - 1000) },
    ]);
    mocks.fetchStreetLevelCrimes.mockResolvedValue({
      ok: false,
      code: "no_data",
      message: "no data",
    });

    const { spent } = await syncVillagePoliceData({
      village: VILLAGE,
      months: ["2026-08"],
      budget: 10,
      now: NOW,
    });

    // "Not published yet" is a statement about the calendar and it stops being
    // true. Only `ok` earns the full cache window.
    expect(spent).toBe(1);
  });

  it("says which months it did not fetch when the budget runs out", async () => {
    mocks.fetchStreetLevelCrimes.mockResolvedValue({
      ok: true,
      data: { crimes: [], dropped: 0, truncated: false },
    });

    const { outcomes, spent } = await syncVillagePoliceData({
      village: VILLAGE,
      months: ["2026-06", "2026-05", "2026-04"],
      budget: 1,
      now: NOW,
    });

    expect(spent).toBe(1);
    // Reported, never silent. A run that quietly stopped covering the older
    // months would look exactly like a village with no history.
    expect(outcomes[1]).toMatchObject({ status: "cached" });
    expect(outcomes[1].detail).toContain("budget");
    expect(outcomes[2].detail).toContain("budget");
  });
});

describe("getVillagePoliceComparison", () => {
  it("counts a published month with no crimes in it as held", async () => {
    mocks.syncFindMany.mockResolvedValue([
      { month: "2026-05", status: "ok", crimeCount: 0, fetchedAt: NOW },
    ]);
    mocks.incidentCount.mockResolvedValue(2);

    const comparison = await getVillagePoliceComparison({
      villageId: VILLAGE.id,
      from: new Date("2026-05-01T00:00:00Z"),
      to: new Date("2026-05-31T00:00:00Z"),
    });

    // This is the case that has to say "0 recorded crimes" and mean it: the
    // police published the month and there was nothing in it.
    expect(comparison).toMatchObject({
      months: ["2026-05"],
      missingMonths: [],
      total: 0,
      villageReports: 2,
    });
  });

  it("reports a month whose fetch failed as missing, not as zero", async () => {
    mocks.syncFindMany.mockResolvedValue([
      { month: "2026-05", status: "ok", crimeCount: 3, fetchedAt: NOW },
      { month: "2026-06", status: "failed", crimeCount: 0, fetchedAt: NOW },
    ]);
    mocks.crimeGroupBy.mockResolvedValue([
      { category: "burglary", _count: { _all: 3 } },
    ]);

    const comparison = await getVillagePoliceComparison({
      villageId: VILLAGE.id,
      from: new Date("2026-05-01T00:00:00Z"),
      to: new Date("2026-06-30T00:00:00Z"),
    });

    // We do not know what June holds. Counting it as a month with no crime
    // would put a figure in a police document that nothing supports.
    expect(comparison?.months).toEqual(["2026-05"]);
    expect(comparison?.missingMonths).toEqual(["2026-06"]);
  });

  it("reports a month nobody ever fetched as missing", async () => {
    mocks.syncFindMany.mockResolvedValue([
      { month: "2026-05", status: "ok", crimeCount: 1, fetchedAt: NOW },
    ]);

    const comparison = await getVillagePoliceComparison({
      villageId: VILLAGE.id,
      from: new Date("2026-05-01T00:00:00Z"),
      to: new Date("2026-07-31T00:00:00Z"),
    });

    expect(comparison?.missingMonths).toEqual(["2026-06", "2026-07"]);
  });

  it("returns null when the village has never been synced", async () => {
    const comparison = await getVillagePoliceComparison({
      villageId: VILLAGE.id,
      from: new Date("2026-05-01T00:00:00Z"),
      to: new Date("2026-05-31T00:00:00Z"),
    });

    // Null omits the whole section. A heading over an empty figure, in a
    // document addressed to a PCSO, reads as a section that failed.
    expect(comparison).toBeNull();
  });

  it("orders the categories by count and caps the list", async () => {
    mocks.syncFindMany.mockResolvedValue([
      { month: "2026-05", status: "ok", crimeCount: 9, fetchedAt: NOW },
    ]);
    mocks.crimeGroupBy.mockResolvedValue([
      { category: "burglary", _count: { _all: 2 } },
      { category: "vehicle-crime", _count: { _all: 6 } },
      { category: "anti-social-behaviour", _count: { _all: 1 } },
    ]);

    const comparison = await getVillagePoliceComparison({
      villageId: VILLAGE.id,
      from: new Date("2026-05-01T00:00:00Z"),
      to: new Date("2026-05-31T00:00:00Z"),
    });

    expect(comparison?.byCategory.map((row) => row.label)).toEqual([
      "Vehicle crime",
      "Burglary",
      "Anti-social behaviour",
    ]);
    expect(comparison?.total).toBe(9);
  });

  it("renders nothing rather than throwing when the tables are not there yet", async () => {
    // `20260822120000_police_crime_data` may not have been applied. The same
    // state `getVillageParishCouncil` handles for its column, one level up.
    mocks.syncFindMany.mockRejectedValue(
      Object.assign(new Error('relation "police_data_syncs" does not exist'), {
        code: "P2021",
      }),
    );

    const comparison = await getVillagePoliceComparison({
      villageId: VILLAGE.id,
      from: new Date("2026-05-01T00:00:00Z"),
      to: new Date("2026-05-31T00:00:00Z"),
    });

    expect(comparison).toBeNull();
  });

  it("rethrows a database failure that is not a missing table", async () => {
    // An unreachable database is not the same problem as an unapplied
    // migration, and rendering "no police data" for it would hide an outage.
    mocks.syncFindMany.mockRejectedValue(
      Object.assign(new Error("connection refused"), { code: "P1001" }),
    );

    await expect(
      getVillagePoliceComparison({
        villageId: VILLAGE.id,
        from: new Date("2026-05-01T00:00:00Z"),
        to: new Date("2026-05-31T00:00:00Z"),
      }),
    ).rejects.toThrow("connection refused");
  });
});
