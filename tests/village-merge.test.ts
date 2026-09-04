import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth";

/**
 * Merging one village into another.
 *
 * Prisma is mocked at its module boundary, as everywhere else in this suite, so
 * this runs on a fresh clone with no `.env.local`. What it asserts is the set of
 * rules that decide whether a merge leaves a village usable:
 *
 *   * **The guards refuse before anything is written.** A target that is not
 *     `ACTIVE`, or has not accepted the documents its mode calls for, closes
 *     reporting for the residents of *both* villages the moment it commits.
 *     Each is a sentence rather than a throw, because the caller is a route
 *     handler that owes the browser an explanation.
 *   * **The renumbering continues from the target's highest, per year.** This
 *     is the step `incidents_village_year_number_key` makes non-optional, and
 *     an off-by-one here is a unique-constraint violation that rolls the whole
 *     merge back — or, worse, two reports sharing a reference on a police
 *     summary.
 *   * **The reference code follows the rename.** Step 4 renames before step 6
 *     builds the strings; reverse them and every rebuilt reference carries the
 *     old village's letters.
 *   * **The audit row carries id lists, not counts.** It is the only thing that
 *     makes a reversal possible once `village_id` has been rewritten.
 *   * **The origin is archived, never deleted**, and its join code is cleared
 *     and never recorded.
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  villageFindUnique: vi.fn(),
  villageUpdate: vi.fn(),
  villageFindMany: vi.fn(),
  incidentCount: vi.fn(),
  incidentGroupBy: vi.fn(),
  userGroupBy: vi.fn(),
  incidentFindMany: vi.fn(),
  incidentUpdate: vi.fn(),
  incidentUpdateMany: vi.fn(),
  userFindMany: vi.fn(),
  userUpdateMany: vi.fn(),
  patternFindMany: vi.fn(),
  patternUpdateMany: vi.fn(),
  requestFindMany: vi.fn(),
  requestUpdateMany: vi.fn(),
  policeCrimeDeleteMany: vi.fn(),
  policeSyncDeleteMany: vi.fn(),
  policeNeighbourhoodDeleteMany: vi.fn(),
  auditCreate: vi.fn(),
}));

/** The shape both `prisma` and the `tx` handed to the callback present. */
const client = {
  village: {
    findUnique: mocks.villageFindUnique,
    update: mocks.villageUpdate,
    findMany: mocks.villageFindMany,
  },
  incident: {
    count: mocks.incidentCount,
    groupBy: mocks.incidentGroupBy,
    findMany: mocks.incidentFindMany,
    update: mocks.incidentUpdate,
    updateMany: mocks.incidentUpdateMany,
  },
  user: {
    findMany: mocks.userFindMany,
    updateMany: mocks.userUpdateMany,
    groupBy: mocks.userGroupBy,
  },
  patternAlert: {
    findMany: mocks.patternFindMany,
    updateMany: mocks.patternUpdateMany,
  },
  coordinatorRequest: {
    findMany: mocks.requestFindMany,
    updateMany: mocks.requestUpdateMany,
  },
  policeCrime: { deleteMany: mocks.policeCrimeDeleteMany },
  policeDataSync: { deleteMany: mocks.policeSyncDeleteMany },
  policeNeighbourhood: { deleteMany: mocks.policeNeighbourhoodDeleteMany },
  auditLog: { create: mocks.auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: { ...client, $transaction: mocks.transaction },
}));

const ORIGIN = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";

function session(email: string): Session {
  return {
    user: { id: "actor-1", email } as Session["user"],
    profile: null,
  };
}

/** An ACTIVE, community-mode, compliant target — the happy path. */
const TARGET_ROW = {
  id: TARGET,
  name: "Histon",
  slug: "histon-cambridgeshire",
  status: "ACTIVE",
  villageCode: null,
  mode: "community",
  communityDpaAcceptedAt: new Date("2026-08-01"),
  dpiaAcceptedAt: null,
  apdAcceptedAt: null,
  dpaAcceptedAt: null,
};

const ORIGIN_ROW = {
  id: ORIGIN,
  name: "Impington",
  slug: "impington-cambridgeshire",
  status: "ACTIVE",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.DATABASE_URL = "postgres://test";
  process.env.ADMIN_EMAILS = "boss@example.test";
  process.env.SUPER_ADMIN_EMAILS = "boss@example.test";

  // The transaction is a pass-through: the callback gets the same mocked client.
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(client),
  );

  mocks.villageFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(where.id === ORIGIN ? ORIGIN_ROW : TARGET_ROW),
  );
  mocks.incidentCount.mockResolvedValue(0);
  mocks.incidentGroupBy.mockResolvedValue([]);
  mocks.userGroupBy.mockResolvedValue([]);
  mocks.villageFindMany.mockResolvedValue([]);
  mocks.incidentFindMany.mockResolvedValue([]);
  mocks.incidentUpdateMany.mockResolvedValue({ count: 0 });
  mocks.userFindMany.mockResolvedValue([]);
  mocks.userUpdateMany.mockResolvedValue({ count: 0 });
  mocks.patternFindMany.mockResolvedValue([]);
  mocks.patternUpdateMany.mockResolvedValue({ count: 0 });
  mocks.requestFindMany.mockResolvedValue([]);
  mocks.requestUpdateMany.mockResolvedValue({ count: 0 });
  mocks.policeCrimeDeleteMany.mockResolvedValue({ count: 0 });
  mocks.policeSyncDeleteMany.mockResolvedValue({ count: 0 });
  mocks.policeNeighbourhoodDeleteMany.mockResolvedValue({ count: 0 });
  mocks.villageUpdate.mockResolvedValue({});
  mocks.auditCreate.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function load() {
  return import("@/lib/village-merge");
}

describe("mergeVillages — the gate", () => {
  it("refuses somebody who is an admin but not a super admin", async () => {
    process.env.SUPER_ADMIN_EMAILS = "";
    const { mergeVillages } = await load();

    const result = await mergeVillages({
      session: session("boss@example.test"),
      originId: ORIGIN,
      targetId: TARGET,
    });

    expect(result).toEqual({
      ok: false,
      error: "Only a super administrator can merge villages.",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses a super admin who is not also a platform admin", async () => {
    // The narrower list is checked in addition to the wider one, never instead
    // of it — removing somebody from ADMIN_EMAILS has to remove this too.
    process.env.ADMIN_EMAILS = "";
    const { mergeVillages } = await load();

    const result = await mergeVillages({
      session: session("boss@example.test"),
      originId: ORIGIN,
      targetId: TARGET,
    });

    expect(result.ok).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses to merge a village into itself", async () => {
    const { mergeVillages } = await load();

    const result = await mergeVillages({
      session: session("boss@example.test"),
      originId: ORIGIN,
      targetId: ORIGIN,
    });

    expect(result.ok).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("mergeVillages — the guards inside the transaction", () => {
  it("refuses a target that is not active, and writes nothing", async () => {
    mocks.villageFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id === ORIGIN ? ORIGIN_ROW : { ...TARGET_ROW, status: "SUSPENDED" },
      ),
    );
    const { mergeVillages } = await load();

    const result = await mergeVillages({
      session: session("boss@example.test"),
      originId: ORIGIN,
      targetId: TARGET,
    });

    expect(result.ok).toBe(false);
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
    expect(mocks.policeCrimeDeleteMany).not.toHaveBeenCalled();
    expect(mocks.villageUpdate).not.toHaveBeenCalled();
  });

  it("refuses a target that has not accepted its compliance documents", async () => {
    mocks.villageFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id === ORIGIN
          ? ORIGIN_ROW
          : { ...TARGET_ROW, communityDpaAcceptedAt: null },
      ),
    );
    const { mergeVillages } = await load();

    const result = await mergeVillages({
      session: session("boss@example.test"),
      originId: ORIGIN,
      targetId: TARGET,
    });

    expect(result.ok).toBe(false);
    // The sentence has to name the fix, because the administrator reading it
    // cannot accept the documents themselves.
    expect(result.ok === false && result.error).toContain("has not accepted");
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a village holding more reports than one transaction will move", async () => {
    const { mergeVillages, MAX_MERGE_INCIDENTS } = await load();
    mocks.incidentCount.mockResolvedValue(MAX_MERGE_INCIDENTS + 1);

    const result = await mergeVillages({
      session: session("boss@example.test"),
      originId: ORIGIN,
      targetId: TARGET,
    });

    expect(result.ok).toBe(false);
    expect(mocks.policeCrimeDeleteMany).not.toHaveBeenCalled();
  });
});

describe("mergeVillages — the merge", () => {
  const numbered = [
    {
      id: "inc-1",
      reference: "VW-IMP-2026-0001",
      referenceYear: 2026,
      villageIncidentNumber: 1,
    },
    {
      id: "inc-2",
      reference: "VW-IMP-2026-0002",
      referenceYear: 2026,
      villageIncidentNumber: 2,
    },
  ];

  beforeEach(() => {
    mocks.incidentCount.mockResolvedValue(2);
    // The target's highest number for 2026 — the moved reports continue from it.
    mocks.incidentGroupBy.mockResolvedValue([
      { referenceYear: 2026, _max: { villageIncidentNumber: 7 } },
    ]);
    mocks.userFindMany.mockResolvedValue([{ id: "user-1" }, { id: "user-2" }]);
    mocks.incidentFindMany
      .mockResolvedValueOnce(numbered) // the numbered pass
      .mockResolvedValueOnce([{ id: "inc-legacy" }]); // whatever is left
    mocks.incidentUpdate.mockResolvedValue({});
  });

  it("continues the target's sequence rather than restarting it", async () => {
    const { mergeVillages } = await load();

    await mergeVillages({
      session: session("boss@example.test"),
      originId: ORIGIN,
      targetId: TARGET,
    });

    const numbers = mocks.incidentUpdate.mock.calls.map(
      ([args]) => args.data.villageIncidentNumber,
    );

    // 7 was taken, so the two moved reports are 8 and 9 — in filing order.
    expect(numbers).toEqual([8, 9]);
  });

  it("rebuilds each reference from the target's code and the new number", async () => {
    const { mergeVillages } = await load();

    const result = await mergeVillages({
      session: session("boss@example.test"),
      originId: ORIGIN,
      targetId: TARGET,
    });

    const references = mocks.incidentUpdate.mock.calls.map(
      ([args]) => args.data.reference,
    );

    expect(references).toEqual(["VW-HIS-2026-0008", "VW-HIS-2026-0009"]);
    expect(result.ok && result.summary.referenceMapping).toEqual([
      {
        incidentId: "inc-1",
        from: "VW-IMP-2026-0001",
        to: "VW-HIS-2026-0008",
        referenceYear: 2026,
      },
      {
        incidentId: "inc-2",
        from: "VW-IMP-2026-0002",
        to: "VW-HIS-2026-0009",
        referenceYear: 2026,
      },
    ]);
  });

  it("builds references from the NEW name when the target is renamed", async () => {
    // Step 4 renames before step 6 builds the strings. Reverse the two and
    // every rebuilt reference carries the old village's letters.
    const { mergeVillages } = await load();

    await mergeVillages({
      session: session("boss@example.test"),
      originId: ORIGIN,
      targetId: TARGET,
      renameTo: "Barton",
    });

    const references = mocks.incidentUpdate.mock.calls.map(
      ([args]) => args.data.reference,
    );

    expect(references).toEqual(["VW-BAR-2026-0008", "VW-BAR-2026-0009"]);
  });

  it("archives the origin and clears its join code, never deleting it", async () => {
    const { mergeVillages } = await load();

    await mergeVillages({
      session: session("boss@example.test"),
      originId: ORIGIN,
      targetId: TARGET,
    });

    expect(mocks.villageUpdate).toHaveBeenCalledWith({
      where: { id: ORIGIN },
      data: { status: "ARCHIVED", joinCode: null },
    });
  });

  it("writes one audit row against the target, carrying the id lists", async () => {
    const { mergeVillages } = await load();

    await mergeVillages({
      session: session("boss@example.test"),
      originId: ORIGIN,
      targetId: TARGET,
    });

    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
    const [{ data }] = mocks.auditCreate.mock.calls[0];

    expect(data.action).toBe("village.merged");
    // Against the survivor, so the coordinators who live with the result can
    // read it — the absorbed village's own trail is unreachable.
    expect(data.villageId).toBe(TARGET);
    expect(data.actorRole).toBe("PLATFORM_ADMIN");

    // Lists, not counts. This is the only thing a reversal can be built from.
    expect(data.before.movedUserIds).toEqual(["user-1", "user-2"]);
    expect(data.before.movedUnnumberedIncidentIds).toEqual(["inc-legacy"]);
    expect(data.before.referenceMapping).toHaveLength(2);

    // Never the join code: the trail is append-only, so a credential written
    // here could not be rotated out of it.
    expect(JSON.stringify(data)).not.toContain("joinCode");
  });

  it("reports the audit trail as not moved, because it cannot be", async () => {
    const { mergeVillages } = await load();

    const result = await mergeVillages({
      session: session("boss@example.test"),
      originId: ORIGIN,
      targetId: TARGET,
    });

    expect(result.ok && result.summary.auditTrailMoved).toBe(false);
  });

  it("resolves to an error rather than throwing when the transaction fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.transaction.mockRejectedValue(new Error("deadlock detected"));
    const { mergeVillages } = await load();

    const result = await mergeVillages({
      session: session("boss@example.test"),
      originId: ORIGIN,
      targetId: TARGET,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("nothing was changed");
  });
});


describe("listMergeableVillages", () => {
  const ACTIVE_EMPTY = {
    id: "v-active",
    name: "Barton",
    slug: "barton-cambridgeshire",
    status: "ACTIVE",
  };
  const PENDING_WITH_DATA = {
    id: "v-pending",
    name: "Impington",
    slug: "impington-cambridgeshire",
    status: "PENDING",
  };

  it("asks for ACTIVE villages OR the ones holding data, never the whole directory", async () => {
    mocks.userGroupBy.mockResolvedValue([
      { villageId: "v-pending", _count: { _all: 12 } },
    ]);
    mocks.incidentGroupBy.mockResolvedValue([
      { villageId: "v-pending", _count: { _all: 5 } },
    ]);
    mocks.villageFindMany.mockResolvedValue([ACTIVE_EMPTY, PENDING_WITH_DATA]);

    const { listMergeableVillages } = await load();
    await listMergeableVillages();

    const [{ where }] = mocks.villageFindMany.mock.calls[0];

    /**
     * The predicate that keeps 270 seeded parishes — 10,670 once England is
     * seeded — out of a `<select>`. A regression here is either an unusable
     * dropdown or a village somebody needs going missing.
     */
    expect(where.status).toEqual({ not: "ARCHIVED" });
    expect(where.OR).toEqual([
      { status: "ACTIVE" },
      { id: { in: ["v-pending"] } },
    ]);
  });

  it("counts residents excluding closed accounts, matching the preview", async () => {
    const { listMergeableVillages } = await load();
    await listMergeableVillages();

    // A selector saying twelve residents beside a preview saying nine is the
    // disagreement that stops somebody trusting either number.
    expect(mocks.userGroupBy).toHaveBeenCalledWith({
      by: ["villageId"],
      where: { villageId: { not: null }, deletedAt: null },
      _count: { _all: true },
    });
  });

  it("returns both counts and a hasData flag per village", async () => {
    mocks.userGroupBy.mockResolvedValue([
      { villageId: "v-pending", _count: { _all: 12 } },
    ]);
    mocks.incidentGroupBy.mockResolvedValue([
      { villageId: "v-pending", _count: { _all: 5 } },
    ]);
    mocks.villageFindMany.mockResolvedValue([ACTIVE_EMPTY, PENDING_WITH_DATA]);

    const { listMergeableVillages } = await load();
    const rows = await listMergeableVillages();

    expect(rows).toEqual([
      { ...ACTIVE_EMPTY, residents: 0, incidents: 0, hasData: false },
      { ...PENDING_WITH_DATA, residents: 12, incidents: 5, hasData: true },
    ]);
  });

  it("counts a village with reports but no residents as holding data", async () => {
    // A parish somebody filed into and then closed their account on still has
    // reports to move, and is exactly what the checkbox is for.
    mocks.userGroupBy.mockResolvedValue([]);
    mocks.incidentGroupBy.mockResolvedValue([
      { villageId: "v-pending", _count: { _all: 3 } },
    ]);
    mocks.villageFindMany.mockResolvedValue([PENDING_WITH_DATA]);

    const { listMergeableVillages } = await load();
    const rows = await listMergeableVillages();

    expect(rows[0]!.hasData).toBe(true);
    expect(rows[0]!.residents).toBe(0);
  });

  it("returns nothing at all with no database configured", async () => {
    delete process.env.DATABASE_URL;
    const { listMergeableVillages } = await load();

    await expect(listMergeableVillages()).resolves.toEqual([]);
    expect(mocks.villageFindMany).not.toHaveBeenCalled();
  });
});
