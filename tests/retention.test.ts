import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The retention sweep is the one route that deletes a resident's data on a
 * schedule with nobody watching, and until now its archive step was a status
 * flip: the report left the map and the reporter's verbatim words stayed in
 * `raw_description` indefinitely, while `/privacy` §7 said they were deleted at
 * twelve months. What is asserted here is the half that closes that gap, plus
 * the three properties that stop the fix being worse than the bug:
 *
 *   * archiving **clears `rawDescription` in the same statement** that sets the
 *     status. Two `updateMany` calls would be a second pass a timeout could
 *     leave un-run, giving a report off the map with its wording intact — the
 *     exact state this exists to end, and the one nobody would notice;
 *   * the **anonymised `description` is not touched**. It is the report as far
 *     as every other surface is concerned, and archiving is explicitly a
 *     retention step rather than an erasure — `src/lib/erasure.ts` is the one
 *     that empties a row;
 *   * the sweep is still **scoped to `PUBLIC_INCIDENT_STATUSES` past the
 *     cutoff**, so nothing in the moderation queue loses its wording early: a
 *     `PENDING_REVIEW` report a coordinator has not read yet would be
 *     unreviewable, and a `REJECTED` one is the report most likely to be full
 *     of a resident's unedited words *and* the one a complaint is most likely
 *     to be about;
 *   * a report a coordinator **archived by hand** is caught up at the same age.
 *     That one is the hole the obvious fix leaves: such a report left the public
 *     statuses on the day it was archived, so the pass above never sees it
 *     again, and its wording would sit there for good.
 *
 * Everything the route reaches is mocked at its module boundary, as everywhere
 * else in this suite: Prisma, the cron secret, Supabase Storage and the rate
 * limit sweep. Storage reports itself unconfigured, which is the branch that
 * deletes no objects and no media rows — this file is about the archive half,
 * and the media half already refuses to run without a service-role key.
 */

const mocks = vi.hoisted(() => ({
  groupBy: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  createMany: vi.fn(),
  isCronAuthorised: vi.fn(),
  deleteExpiredRateLimits: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    incident: { groupBy: mocks.groupBy, updateMany: mocks.updateMany },
    incidentMedia: { findMany: mocks.findMany, deleteMany: mocks.deleteMany },
    auditLog: { createMany: mocks.createMany },
  },
}));

// The secret itself is `src/lib/cron.ts`'s business and is tested by being the
// only way in; here it is a door that opens, so the assertions are about what
// the job does rather than about who may ask it to.
vi.mock("@/lib/cron", async () => {
  const { NextResponse } = await import("next/server");

  return {
    isCronAuthorised: mocks.isCronAuthorised,
    cronUnauthorised: () =>
      NextResponse.json({ error: "Not authorised" }, { status: 401 }),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  STORAGE_BUCKET: "incident-media",
  isStorageConfigured: false,
  createAdminClient: () => {
    throw new Error("Storage is not configured in this test.");
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  deleteExpiredRateLimits: mocks.deleteExpiredRateLimits,
}));

const { NextRequest } = await import("next/server");
const { POST } = await import("@/app/api/cron/retention/route");
const { PUBLIC_INCIDENT_STATUSES, RETENTION } = await import("@/lib/constants");

const VILLAGE = "village-1";

type Where = {
  status?: unknown;
  villageId?: string;
  reportedAt?: { lt: Date };
  rawDescription?: unknown;
};

type UpdateArgs = { where: Where; data: Record<string, unknown> };

function request(): InstanceType<typeof NextRequest> {
  return new NextRequest("https://villagewatch.app/api/cron/retention", {
    method: "POST",
  });
}

/** How many reports each pass finds. `archived` is public rows past the cutoff;
 *  `alreadyArchived` is the hand-archived backlog the catch-up pass clears. */
function stubCounts(counts: { archived: number; alreadyArchived: number }) {
  const rows = (n: number) =>
    n > 0 ? [{ villageId: VILLAGE, _count: { _all: n } }] : [];

  // Both passes call `groupBy`, so the stub answers on the predicate rather
  // than on call order — an ordering assumption would silently pass if the two
  // were ever swapped.
  mocks.groupBy.mockImplementation((args: { where: Where }) =>
    Promise.resolve(
      args.where.status === "ARCHIVED"
        ? rows(counts.alreadyArchived)
        : rows(counts.archived),
    ),
  );

  mocks.updateMany.mockImplementation((args: UpdateArgs) =>
    Promise.resolve({
      count: args.where.status === "ARCHIVED" ? counts.alreadyArchived : counts.archived,
    }),
  );
}

/** The `updateMany` from the pass that archives, and the one that catches up. */
function updateCalls() {
  const calls = mocks.updateMany.mock.calls.map(([args]) => args as UpdateArgs);

  return {
    archive: calls.filter((call) => call.where.status !== "ARCHIVED"),
    catchUp: calls.filter((call) => call.where.status === "ARCHIVED"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://test");

  mocks.isCronAuthorised.mockReturnValue(true);
  // Nothing past the media cutoff, so the sweep goes straight to archiving.
  mocks.findMany.mockResolvedValue([]);
  mocks.createMany.mockResolvedValue({ count: 1 });
  mocks.deleteExpiredRateLimits.mockResolvedValue(0);

  stubCounts({ archived: 3, alreadyArchived: 0 });
});

describe("the nightly archive pass", () => {
  it("clears rawDescription in the same statement that archives the report", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);

    const { archive } = updateCalls();

    expect(archive).toHaveLength(1);
    expect(archive[0].data.status).toBe("ARCHIVED");
    // The line this whole file exists for. `null`, not a placeholder string: a
    // sentinel is a value a reporter could have typed.
    expect(archive[0].data.rawDescription).toBeNull();
  });

  it("leaves the anonymised description alone", async () => {
    await POST(request());

    const { data } = updateCalls().archive[0];

    // Archiving is a retention step, not an erasure. The published rewrite is
    // the pattern history the notice says archiving exists for; emptying it
    // here would make the twelve-month mark a silent deletion of the report.
    expect(Object.keys(data).sort()).toEqual(["rawDescription", "status"]);
  });

  it("only touches published reports past the cutoff, in one village", async () => {
    const before = new Date();
    await POST(request());
    const after = new Date();

    const { where } = updateCalls().archive[0];

    expect(where).toMatchObject({
      status: { in: [...PUBLIC_INCIDENT_STATUSES] },
      villageId: VILLAGE,
    });

    // Twelve months back from now, so a report in the queue — or one filed last
    // week — keeps its wording. `reportedAt`, never `occurredAt`: the period
    // runs from when the data was collected, not from whatever date the
    // reporter typed.
    expectCutoff(where.reportedAt!.lt, before, after);
  });

  it("records the deletion in the village's audit row", async () => {
    await POST(request());

    expect(mocks.createMany).toHaveBeenCalledTimes(1);

    const rows = mocks.createMany.mock.calls[0][0].data as Array<{
      action: string;
      villageId: string;
      after: Record<string, unknown>;
    }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("retention.sweep");
    expect(rows[0].villageId).toBe(VILLAGE);
    // The irreversible half, under its own name. A regulator reading the trail
    // should not have to infer a deletion from a status change.
    expect(rows[0].after.rawDescriptionsDeleted).toBe(3);
    expect(rows[0].after.archivedIncidents).toBe(3);
  });

  it("writes no audit row and no update when nothing is old enough", async () => {
    stubCounts({ archived: 0, alreadyArchived: 0 });

    const response = await POST(request());
    const body = (await response.json()) as {
      archive: { archived: number; rawWordingDeleted: number };
    };

    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(body.archive.archived).toBe(0);
    expect(body.archive.rawWordingDeleted).toBe(0);
  });

  it("refuses a caller without the cron secret before touching anything", async () => {
    mocks.isCronAuthorised.mockReturnValue(false);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.groupBy).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});

describe("reports a coordinator archived by hand", () => {
  it("has their wording deleted once they reach the retention age", async () => {
    const before = new Date();
    stubCounts({ archived: 0, alreadyArchived: 2 });

    await POST(request());
    const after = new Date();

    const { catchUp } = updateCalls();

    expect(catchUp).toHaveLength(1);
    expect(catchUp[0].data).toEqual({ rawDescription: null });
    // The status is not rewritten — they are archived already — and the same
    // cutoff applies, so archiving a duplicate by hand does not destroy the
    // reporter's words that afternoon.
    expect(catchUp[0].where.villageId).toBe(VILLAGE);
    expectCutoff(catchUp[0].where.reportedAt!.lt, before, after);
  });

  it("selects only rows that still have wording, so the pass runs once per row", async () => {
    stubCounts({ archived: 0, alreadyArchived: 2 });

    await POST(request());

    // Without this predicate a village with a long archive would match the same
    // rows every night and write a `retention.sweep` audit row for the rest of
    // time, describing a deletion that had already happened.
    expect(updateCalls().catchUp[0].where.rawDescription).toEqual({ not: null });
  });

  it("counts as a deletion but not as an archiving", async () => {
    stubCounts({ archived: 0, alreadyArchived: 2 });

    const response = await POST(request());
    const body = (await response.json()) as {
      archive: { archived: number; rawWordingDeleted: number };
    };

    expect(body.archive.archived).toBe(0);
    expect(body.archive.rawWordingDeleted).toBe(2);

    // The audit row is still written: nothing was archived, but something was
    // deleted, and a run that deletes a resident's words leaves a trail.
    const rows = mocks.createMany.mock.calls[0][0].data as Array<{
      after: Record<string, unknown>;
    }>;

    expect(rows[0].after.archivedIncidents).toBe(0);
    expect(rows[0].after.rawDescriptionsDeleted).toBe(2);
  });

  it("adds to the same village row as the reports archived tonight", async () => {
    stubCounts({ archived: 3, alreadyArchived: 2 });

    const response = await POST(request());
    const body = (await response.json()) as {
      villages: Array<{
        villageId: string;
        archived: number;
        rawWordingDeleted: number;
      }>;
    };

    expect(body.villages).toEqual([
      { villageId: VILLAGE, archived: 3, rawWordingDeleted: 5, mediaRowsDeleted: 0 },
    ]);
  });
});

/** The archive cutoff is `RETENTION.incidentArchiveMonths` back from "now". */
function expectCutoff(cutoff: Date, before: Date, after: Date): void {
  const earliest = new Date(before);
  earliest.setMonth(earliest.getMonth() - RETENTION.incidentArchiveMonths);
  const latest = new Date(after);
  latest.setMonth(latest.getMonth() - RETENTION.incidentArchiveMonths);

  expect(cutoff.getTime()).toBeGreaterThanOrEqual(earliest.getTime());
  expect(cutoff.getTime()).toBeLessThanOrEqual(latest.getTime());
}
