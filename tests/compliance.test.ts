import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The compliance gate decides whether a village may lawfully accept a report at
 * all, so what is worth asserting here is not that a boolean is stored but the
 * four properties that make it a gate:
 *
 *   * not accepted **blocks**, and all three documents are required, not any
 *     one or two of them;
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
 * on those three is the whole reason the allow branch is safe. The message-only
 * case is asserted for all three columns rather than one: `dpia_accepted_at` and
 * `dpa_accepted_at` differ by a letter and neither contains the other, so a
 * matcher that tested only the first would take a database with migration 7 and
 * not 8 offline.
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

/** A village row with nothing accepted. */
const NOTHING_ACCEPTED = {
  dpiaAcceptedAt: null,
  apdAcceptedAt: null,
  dpaAcceptedAt: null,
  dpiaAcceptedBy: null,
  apdAcceptedBy: null,
  dpaAcceptedBy: null,
};

/** Every box ticked, which is what the form posts. */
const ALL = { dpia: true, apd: true, dpa: true };

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
function missingColumn(
  shape: "code" | "sqlstate" | "dpia" | "apd" | "dpa",
): Error {
  const messages: Record<string, string> = {
    dpia: "The column `villages.dpia_accepted_at` does not exist",
    apd: "The column `villages.apd_accepted_at` does not exist",
    dpa: "The column `villages.dpa_accepted_at` does not exist",
  };

  const error = new Error(messages[shape] ?? "boom");

  if (shape === "code") Object.assign(error, { code: "P2022" });
  if (shape === "sqlstate") Object.assign(error, { code: "42703" });

  return error;
}

describe("getVillageCompliance", () => {
  it("blocks a village that has accepted nothing", async () => {
    mocks.findUnique.mockResolvedValue(NOTHING_ACCEPTED);

    const status = await getVillageCompliance(VILLAGE);

    expect(status.available).toBe(true);
    expect(status.complete).toBe(false);
    expect(await canVillageAcceptIncidents(VILLAGE)).toBe(false);
  });

  it("requires all three documents, not any two of them", async () => {
    const acceptedAt = new Date("2026-07-01T09:00:00Z");

    // Each case leaves exactly one document unaccepted. Every one of the three
    // is a separate legal instrument — Article 35, Schedule 1 paragraph 5 and
    // Article 28(3) — so no two of them substitute for the third.
    const combinations = [
      { missing: "dpia", dpia: null, apd: acceptedAt, dpa: acceptedAt },
      { missing: "apd", dpia: acceptedAt, apd: null, dpa: acceptedAt },
      { missing: "dpa", dpia: acceptedAt, apd: acceptedAt, dpa: null },
    ] as const;

    for (const combination of combinations) {
      mocks.findUnique.mockResolvedValue({
        dpiaAcceptedAt: combination.dpia,
        apdAcceptedAt: combination.apd,
        dpaAcceptedAt: combination.dpa,
        dpiaAcceptedBy: combination.dpia ? ACCEPTOR : null,
        apdAcceptedBy: combination.apd ? ACCEPTOR : null,
        dpaAcceptedBy: combination.dpa ? ACCEPTOR : null,
      });

      const status = await getVillageCompliance(VILLAGE);

      expect(status.complete, `missing ${combination.missing}`).toBe(false);
      expect(status[combination.missing]).toBeNull();
      expect(await canVillageAcceptIncidents(VILLAGE)).toBe(false);
    }
  });

  it("opens the village once all three are accepted, and says who and when", async () => {
    const acceptedAt = new Date("2026-07-01T09:00:00Z");

    mocks.findUnique.mockResolvedValue({
      dpiaAcceptedAt: acceptedAt,
      apdAcceptedAt: acceptedAt,
      dpaAcceptedAt: acceptedAt,
      dpiaAcceptedBy: ACCEPTOR,
      apdAcceptedBy: ACCEPTOR,
      dpaAcceptedBy: ACCEPTOR,
    });

    const status = await getVillageCompliance(VILLAGE);

    expect(status.complete).toBe(true);
    expect(status.dpia?.acceptedAt).toEqual(acceptedAt);
    expect(status.dpa?.acceptedAt).toEqual(acceptedAt);
    expect(status.dpia?.acceptedBy?.fullName).toBe("A Coordinator");
  });

  it("still reports the acceptance when the accepting account has been closed", async () => {
    // `ON DELETE SET NULL` on the foreign key. The acceptance is a fact about a
    // date and must survive the coordinator closing their account.
    const acceptedAt = new Date("2026-07-01T09:00:00Z");

    mocks.findUnique.mockResolvedValue({
      dpiaAcceptedAt: acceptedAt,
      apdAcceptedAt: acceptedAt,
      dpaAcceptedAt: acceptedAt,
      dpiaAcceptedBy: null,
      apdAcceptedBy: null,
      dpaAcceptedBy: null,
    });

    const status = await getVillageCompliance(VILLAGE);

    expect(status.complete).toBe(true);
    expect(status.dpia?.acceptedBy).toBeNull();
    expect(status.dpa?.acceptedBy).toBeNull();
  });

  it.each(["code", "sqlstate", "dpia", "apd", "dpa"] as const)(
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
  it("records all three documents with the coordinator who accepted", async () => {
    mocks.findUnique.mockResolvedValue(NOTHING_ACCEPTED);

    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: ALL,
    });

    expect(result).toMatchObject({ ok: true, complete: true });

    const data = mocks.update.mock.calls[0]?.[0]?.data;
    expect(data.dpiaAcceptedById).toBe("user-1");
    expect(data.apdAcceptedById).toBe("user-1");
    expect(data.dpaAcceptedById).toBe("user-1");
    expect(data.dpiaAcceptedAt).toBeInstanceOf(Date);
    expect(data.dpaAcceptedAt).toBeInstanceOf(Date);
  });

  it("writes one audit row per document accepted", async () => {
    mocks.findUnique.mockResolvedValue(NOTHING_ACCEPTED);

    await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: ALL,
    });

    const rows = mocks.createMany.mock.calls[0]?.[0]?.data ?? [];
    expect(rows.map((row: { action: string }) => row.action)).toEqual([
      "compliance.dpia_accepted",
      "compliance.apd_accepted",
      "compliance.dpa_accepted",
    ]);
  });

  it("records the processing agreement as the controller's half only", async () => {
    mocks.findUnique.mockResolvedValue(NOTHING_ACCEPTED);

    await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: ALL,
    });

    const rows = mocks.createMany.mock.calls[0]?.[0]?.data ?? [];
    const dpa = rows.find(
      (row: { action: string }) => row.action === "compliance.dpa_accepted",
    );

    // The agreement is a contract and is not in force until Yakasista Ltd has
    // signed the paper copy too. Nothing on this screen can evidence that, so
    // the trail row says which party it stands for rather than implying both.
    expect(dpa.after.party).toBe("controller");
    expect(dpa.after.document).toBe("Data Processing Agreement");
  });

  it("never moves an acceptance that is already recorded", async () => {
    const original = new Date("2026-01-04T11:30:00Z");

    mocks.findUnique.mockResolvedValue({
      ...NOTHING_ACCEPTED,
      dpiaAcceptedAt: original,
      dpiaAcceptedBy: { id: "someone-else", fullName: "Prior Clerk", email: "x@y.uk" },
    });

    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: ALL,
    });

    expect(result).toMatchObject({ ok: true, complete: true });

    // Only the APD and the agreement are written. Re-accepting the DPIA must not
    // stamp today's date over the date the council actually adopted it, nor
    // replace the name of the person who read it.
    const data = mocks.update.mock.calls[0]?.[0]?.data;
    expect(data).not.toHaveProperty("dpiaAcceptedAt");
    expect(data).not.toHaveProperty("dpiaAcceptedById");
    expect(data.apdAcceptedAt).toBeInstanceOf(Date);
    expect(data.dpaAcceptedAt).toBeInstanceOf(Date);

    const rows = mocks.createMany.mock.calls[0]?.[0]?.data ?? [];
    expect(rows.map((row: { action: string }) => row.action)).toEqual([
      "compliance.apd_accepted",
      "compliance.dpa_accepted",
    ]);
  });

  it("records only the agreement for a village that predates it", async () => {
    // The state every already-compliant village lands in when
    // `20260728150000_village_dpa_gate` is applied: two documents accepted on a
    // date that must not move, and a third that has never been seen.
    const original = new Date("2026-01-04T11:30:00Z");

    mocks.findUnique.mockResolvedValue({
      ...NOTHING_ACCEPTED,
      dpiaAcceptedAt: original,
      apdAcceptedAt: original,
      dpiaAcceptedBy: ACCEPTOR,
      apdAcceptedBy: ACCEPTOR,
    });

    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: ALL,
    });

    expect(result).toMatchObject({ ok: true, complete: true });

    const data = mocks.update.mock.calls[0]?.[0]?.data;
    expect(Object.keys(data).sort()).toEqual([
      "dpaAcceptedAt",
      "dpaAcceptedById",
    ]);

    const rows = mocks.createMany.mock.calls[0]?.[0]?.data ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("compliance.dpa_accepted");
  });

  it("writes nothing at all when all three are already accepted", async () => {
    const original = new Date("2026-01-04T11:30:00Z");

    mocks.findUnique.mockResolvedValue({
      dpiaAcceptedAt: original,
      apdAcceptedAt: original,
      dpaAcceptedAt: original,
      dpiaAcceptedBy: ACCEPTOR,
      apdAcceptedBy: ACCEPTOR,
      dpaAcceptedBy: ACCEPTOR,
    });

    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: ALL,
    });

    expect(result).toMatchObject({ ok: true, complete: true });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("does not report the village open when a document is left unticked", async () => {
    mocks.findUnique.mockResolvedValue(NOTHING_ACCEPTED);

    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: { dpia: true, apd: true, dpa: false },
    });

    // Partial acceptance is recorded — the two that were read were read — but
    // the gate stays shut, and the screen's success message reads from this.
    expect(result).toMatchObject({ ok: true, complete: false });

    const data = mocks.update.mock.calls[0]?.[0]?.data;
    expect(data).not.toHaveProperty("dpaAcceptedAt");
  });

  it("refuses when no box was ticked", async () => {
    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: { dpia: false, apd: false, dpa: false },
    });

    expect(result).toMatchObject({ ok: false, reason: "nothing_selected" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reports an unapplied migration as unmigrated rather than try again", async () => {
    mocks.findUnique.mockRejectedValue(missingColumn("code"));

    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: ALL,
    });

    // "Try again" would be a lie the coordinator could act on indefinitely.
    expect(result).toMatchObject({ ok: false, reason: "unmigrated" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("still reports success when the audit write fails", async () => {
    mocks.findUnique.mockResolvedValue(NOTHING_ACCEPTED);
    mocks.createMany.mockRejectedValue(new Error("trail unavailable"));

    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: ALL,
    });

    // The acceptance is on the village row with a timestamp and a person, so the
    // trail row is the second copy rather than the only one. Telling a
    // coordinator their acceptance failed when it is recorded would be false.
    expect(result).toMatchObject({ ok: true, complete: true });
  });

  it("reports a failed write rather than claiming the village is open", async () => {
    mocks.findUnique.mockResolvedValue(NOTHING_ACCEPTED);
    mocks.update.mockRejectedValue(new Error("connection refused"));

    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: ALL,
    });

    expect(result).toMatchObject({ ok: false, reason: "failed" });
  });
});
