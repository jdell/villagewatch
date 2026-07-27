import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The compliance gate decides whether a village may lawfully accept a report at
 * all, so what is worth asserting here is not that a boolean is stored but the
 * four properties that make it a gate:
 *
 *   * not accepted **blocks**, and both documents are required, not either;
 *   * an unapplied migration **allows**, loudly — the opposite direction, and
 *     the one that stops a missing column taking every village's reporting
 *     offline;
 *   * any other database failure **blocks**, because not knowing what a council
 *     decided is not a reason to process criminal offence data;
 *   * acceptance is **one-way** and never moves an existing timestamp onto
 *     today or replaces the person who actually read the document.
 *
 * Prisma is mocked at the module boundary, as everywhere else in this suite. The
 * error shapes are the real ones Prisma raises for a missing column — `P2022`,
 * the raw SQLSTATE `42703`, and the message-only case — because the narrow match
 * on those three is the whole reason the allow branch is safe.
 */

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  createMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    village: { findUnique: mocks.findUnique, update: mocks.update },
    auditLog: { createMany: mocks.createMany },
  },
}));

const {
  acceptCompliance,
  canVillageAcceptIncidents,
  getVillageCompliance,
} = await import("@/lib/compliance");

const VILLAGE = "village-1";

const SESSION = {
  user: { id: "user-1", email: "coordinator@example.uk" },
  profile: { role: "COORDINATOR", villageId: VILLAGE },
} as unknown as Parameters<typeof acceptCompliance>[0]["session"];

const ACCEPTOR = {
  id: "user-1",
  fullName: "A Coordinator",
  email: "coordinator@example.uk",
};

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  mocks.update.mockResolvedValue({});
  mocks.createMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.unstubAllEnvs();
  mocks.findUnique.mockReset();
  mocks.update.mockReset();
  mocks.createMany.mockReset();
});

/** A missing column, however Prisma happens to surface it. */
function missingColumn(shape: "code" | "sqlstate" | "message"): Error {
  const error = new Error(
    shape === "message"
      ? "The column `villages.dpia_accepted_at` does not exist"
      : "boom",
  );

  if (shape === "code") Object.assign(error, { code: "P2022" });
  if (shape === "sqlstate") Object.assign(error, { code: "42703" });

  return error;
}

describe("getVillageCompliance", () => {
  it("blocks a village that has accepted neither document", async () => {
    mocks.findUnique.mockResolvedValue({
      dpiaAcceptedAt: null,
      apdAcceptedAt: null,
      dpiaAcceptedBy: null,
      apdAcceptedBy: null,
    });

    const status = await getVillageCompliance(VILLAGE);

    expect(status.available).toBe(true);
    expect(status.complete).toBe(false);
    expect(await canVillageAcceptIncidents(VILLAGE)).toBe(false);
  });

  it("requires both documents, not either", async () => {
    // The DPIA alone. Article 35 is satisfied and Schedule 1 paragraph 5 is not,
    // which is the half that makes the processing lawful in the first place.
    mocks.findUnique.mockResolvedValue({
      dpiaAcceptedAt: new Date("2026-07-01T09:00:00Z"),
      apdAcceptedAt: null,
      dpiaAcceptedBy: ACCEPTOR,
      apdAcceptedBy: null,
    });

    const status = await getVillageCompliance(VILLAGE);

    expect(status.dpia).not.toBeNull();
    expect(status.apd).toBeNull();
    expect(status.complete).toBe(false);
  });

  it("opens the village once both are accepted, and says who and when", async () => {
    const acceptedAt = new Date("2026-07-01T09:00:00Z");

    mocks.findUnique.mockResolvedValue({
      dpiaAcceptedAt: acceptedAt,
      apdAcceptedAt: acceptedAt,
      dpiaAcceptedBy: ACCEPTOR,
      apdAcceptedBy: ACCEPTOR,
    });

    const status = await getVillageCompliance(VILLAGE);

    expect(status.complete).toBe(true);
    expect(status.dpia?.acceptedAt).toEqual(acceptedAt);
    expect(status.dpia?.acceptedBy?.fullName).toBe("A Coordinator");
  });

  it("still reports the acceptance when the accepting account has been closed", async () => {
    // `ON DELETE SET NULL` on the foreign key. The acceptance is a fact about a
    // date and must survive the coordinator closing their account.
    mocks.findUnique.mockResolvedValue({
      dpiaAcceptedAt: new Date("2026-07-01T09:00:00Z"),
      apdAcceptedAt: new Date("2026-07-01T09:00:00Z"),
      dpiaAcceptedBy: null,
      apdAcceptedBy: null,
    });

    const status = await getVillageCompliance(VILLAGE);

    expect(status.complete).toBe(true);
    expect(status.dpia?.acceptedBy).toBeNull();
  });

  it.each(["code", "sqlstate", "message"] as const)(
    "allows reporting when the migration has not run (%s)",
    async (shape) => {
      mocks.findUnique.mockRejectedValue(missingColumn(shape));

      const status = await getVillageCompliance(VILLAGE);

      // The load-bearing pair. `available: false` is what the dashboard renders
      // the "migration missing" note from; `complete: true` is what stops an
      // unapplied migration taking every village offline.
      expect(status.available).toBe(false);
      expect(status.complete).toBe(true);
      expect(await canVillageAcceptIncidents(VILLAGE)).toBe(true);
    },
  );

  it("blocks reporting on any other database failure", async () => {
    mocks.findUnique.mockRejectedValue(new Error("connection refused"));

    const status = await getVillageCompliance(VILLAGE);

    expect(status.available).toBe(true);
    expect(status.complete).toBe(false);
  });

  it("does not read a village that does not exist as accepted", async () => {
    mocks.findUnique.mockResolvedValue(null);

    expect((await getVillageCompliance(VILLAGE)).complete).toBe(false);
  });
});

describe("acceptCompliance", () => {
  it("records both documents with the coordinator who accepted", async () => {
    mocks.findUnique.mockResolvedValue({
      dpiaAcceptedAt: null,
      apdAcceptedAt: null,
      dpiaAcceptedBy: null,
      apdAcceptedBy: null,
    });

    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: { dpia: true, apd: true },
    });

    expect(result).toMatchObject({ ok: true, complete: true });

    const data = mocks.update.mock.calls[0]?.[0]?.data;
    expect(data.dpiaAcceptedById).toBe("user-1");
    expect(data.apdAcceptedById).toBe("user-1");
    expect(data.dpiaAcceptedAt).toBeInstanceOf(Date);
  });

  it("writes one audit row per document accepted", async () => {
    mocks.findUnique.mockResolvedValue({
      dpiaAcceptedAt: null,
      apdAcceptedAt: null,
      dpiaAcceptedBy: null,
      apdAcceptedBy: null,
    });

    await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: { dpia: true, apd: true },
    });

    const rows = mocks.createMany.mock.calls[0]?.[0]?.data ?? [];
    expect(rows.map((row: { action: string }) => row.action)).toEqual([
      "compliance.dpia_accepted",
      "compliance.apd_accepted",
    ]);
  });

  it("never moves an acceptance that is already recorded", async () => {
    const original = new Date("2026-01-04T11:30:00Z");

    mocks.findUnique.mockResolvedValue({
      dpiaAcceptedAt: original,
      apdAcceptedAt: null,
      dpiaAcceptedBy: { id: "someone-else", fullName: "Prior Clerk", email: "x@y.uk" },
      apdAcceptedBy: null,
    });

    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: { dpia: true, apd: true },
    });

    expect(result).toMatchObject({ ok: true, complete: true });

    // Only the APD is written. Re-accepting the DPIA must not stamp today's date
    // over the date the council actually adopted it, nor replace the name of the
    // person who read it.
    const data = mocks.update.mock.calls[0]?.[0]?.data;
    expect(data).not.toHaveProperty("dpiaAcceptedAt");
    expect(data).not.toHaveProperty("dpiaAcceptedById");
    expect(data.apdAcceptedAt).toBeInstanceOf(Date);

    const rows = mocks.createMany.mock.calls[0]?.[0]?.data ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("compliance.apd_accepted");
  });

  it("writes nothing at all when both are already accepted", async () => {
    const original = new Date("2026-01-04T11:30:00Z");

    mocks.findUnique.mockResolvedValue({
      dpiaAcceptedAt: original,
      apdAcceptedAt: original,
      dpiaAcceptedBy: ACCEPTOR,
      apdAcceptedBy: ACCEPTOR,
    });

    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: { dpia: true, apd: true },
    });

    expect(result).toMatchObject({ ok: true, complete: true });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("refuses when neither box was ticked", async () => {
    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: { dpia: false, apd: false },
    });

    expect(result).toMatchObject({ ok: false, reason: "nothing_selected" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reports an unapplied migration as unmigrated rather than try again", async () => {
    mocks.findUnique.mockRejectedValue(missingColumn("code"));

    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: { dpia: true, apd: true },
    });

    // "Try again" would be a lie the coordinator could act on indefinitely.
    expect(result).toMatchObject({ ok: false, reason: "unmigrated" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("still reports success when the audit write fails", async () => {
    mocks.findUnique.mockResolvedValue({
      dpiaAcceptedAt: null,
      apdAcceptedAt: null,
      dpiaAcceptedBy: null,
      apdAcceptedBy: null,
    });
    mocks.createMany.mockRejectedValue(new Error("trail unavailable"));

    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: { dpia: true, apd: true },
    });

    // The acceptance is on the village row with a timestamp and a person, so the
    // trail row is the second copy rather than the only one. Telling a
    // coordinator their acceptance failed when it is recorded would be false.
    expect(result).toMatchObject({ ok: true, complete: true });
  });

  it("reports a failed write rather than claiming the village is open", async () => {
    mocks.findUnique.mockResolvedValue({
      dpiaAcceptedAt: null,
      apdAcceptedAt: null,
      dpiaAcceptedBy: null,
      apdAcceptedBy: null,
    });
    mocks.update.mockRejectedValue(new Error("connection refused"));

    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: { dpia: true, apd: true },
    });

    expect(result).toMatchObject({ ok: false, reason: "failed" });
  });
});
