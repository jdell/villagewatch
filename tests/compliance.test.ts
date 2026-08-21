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
 * The two-tier model adds three more, and the last is the one that would be
 * quietly wrong:
 *
 *   * a **community** village is gated on its own single agreement and not on
 *     the council's three;
 *   * a tick for a document the village's model does not ask for is **dropped**,
 *     so a hand-made POST cannot record a volunteer adopting a council's DPIA;
 *   * a village **mid-upgrade** — council mode, three documents outstanding, a
 *     community acceptance already recorded — stays **open**. Its coordinator is
 *     still the controller until the council adopts, and closing it for the
 *     duration of somebody else's paperwork is the outcome that would make
 *     nobody ever press the button.
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
  create: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    village: { findUnique: mocks.findUnique, update: mocks.update },
    // `createMany` for the acceptances, `create` for the single mode-change row.
    auditLog: { createMany: mocks.createMany, create: mocks.create },
  },
}));

const {
  acceptCompliance,
  canVillageAcceptIncidents,
  getVillageCompliance,
  setVillageMode,
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

/**
 * A council village with nothing accepted.
 *
 * `mode: "council"` explicitly rather than by omission: the column defaults to
 * `community` for every village in the database, so a fixture that left it out
 * would silently be testing the wrong model — and would pass, because a
 * community village with nothing accepted is also blocked.
 */
const NOTHING_ACCEPTED = {
  mode: "council",
  dpiaAcceptedAt: null,
  apdAcceptedAt: null,
  dpaAcceptedAt: null,
  communityDpaAcceptedAt: null,
  dpiaAcceptedBy: null,
  apdAcceptedBy: null,
  dpaAcceptedBy: null,
  communityDpaAcceptedBy: null,
};

/** The same village on the community model. */
const COMMUNITY_NOTHING_ACCEPTED = { ...NOTHING_ACCEPTED, mode: "community" };

/** Every box ticked, which is what the council form posts. */
const ALL = { dpia: true, apd: true, dpa: true, community: false };

/** What the community form posts — one box. */
const COMMUNITY_ONLY = {
  dpia: false,
  apd: false,
  dpa: false,
  community: true,
};

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  mocks.update.mockResolvedValue({});
  mocks.createMany.mockResolvedValue({ count: 1 });
  mocks.create.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllEnvs();
  mocks.findUnique.mockReset();
  mocks.update.mockReset();
  mocks.createMany.mockReset();
  mocks.create.mockReset();
});

/** A missing column, however Prisma happens to surface it. */
function missingColumn(
  shape: "code" | "sqlstate" | "dpia" | "apd" | "dpa" | "community",
): Error {
  const messages: Record<string, string> = {
    dpia: "The column `villages.dpia_accepted_at` does not exist",
    apd: "The column `villages.apd_accepted_at` does not exist",
    dpa: "The column `villages.dpa_accepted_at` does not exist",
    community:
      "The column `villages.community_dpa_accepted_at` does not exist",
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
        ...NOTHING_ACCEPTED,
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
      ...NOTHING_ACCEPTED,
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
      ...NOTHING_ACCEPTED,
      dpiaAcceptedAt: acceptedAt,
      apdAcceptedAt: acceptedAt,
      dpaAcceptedAt: acceptedAt,
    });

    const status = await getVillageCompliance(VILLAGE);

    expect(status.complete).toBe(true);
    expect(status.dpia?.acceptedBy).toBeNull();
    expect(status.dpa?.acceptedBy).toBeNull();
  });

  it.each(["code", "sqlstate", "dpia", "apd", "dpa", "community"] as const)(
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
      ...NOTHING_ACCEPTED,
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
      accept: { ...ALL, dpa: false },
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
      accept: { dpia: false, apd: false, dpa: false, community: false },
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

describe("the community model", () => {
  it("blocks a village that has not accepted its agreement", async () => {
    mocks.findUnique.mockResolvedValue(COMMUNITY_NOTHING_ACCEPTED);

    const status = await getVillageCompliance(VILLAGE);

    expect(status.mode).toBe("community");
    expect(status.complete).toBe(false);
    expect(await canVillageAcceptIncidents(VILLAGE)).toBe(false);
  });

  it("opens the village on the one agreement, with no council documents at all", async () => {
    const acceptedAt = new Date("2026-08-20T09:00:00Z");

    mocks.findUnique.mockResolvedValue({
      ...COMMUNITY_NOTHING_ACCEPTED,
      communityDpaAcceptedAt: acceptedAt,
      communityDpaAcceptedBy: ACCEPTOR,
    });

    const status = await getVillageCompliance(VILLAGE);

    expect(status.complete).toBe(true);
    expect(status.communityDpa?.acceptedAt).toEqual(acceptedAt);
    expect(status.communityDpa?.acceptedBy?.fullName).toBe("A Coordinator");
    // The three a council would owe are untouched and irrelevant here.
    expect(status.dpia).toBeNull();
    expect(status.apd).toBeNull();
    expect(status.dpa).toBeNull();
  });

  it("records the agreement and one audit row, not the council's three", async () => {
    mocks.findUnique.mockResolvedValue(COMMUNITY_NOTHING_ACCEPTED);

    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: COMMUNITY_ONLY,
    });

    expect(result).toMatchObject({ ok: true, complete: true });

    const data = mocks.update.mock.calls[0]?.[0]?.data;
    expect(Object.keys(data).sort()).toEqual([
      "communityDpaAcceptedAt",
      "communityDpaAcceptedById",
    ]);
    expect(data.communityDpaAcceptedById).toBe("user-1");

    const rows = mocks.createMany.mock.calls[0]?.[0]?.data ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("compliance.community_dpa_accepted");
    // No `party` — unlike the council's agreement, this one takes one
    // signature and accepting it forms the contract.
    expect(rows[0].after).not.toHaveProperty("party");
    expect(rows[0].after.mode).toBe("community");
  });

  it("drops a tick for a document this model does not ask for", async () => {
    mocks.findUnique.mockResolvedValue(COMMUNITY_NOTHING_ACCEPTED);

    // The screen never renders a DPIA checkbox to a community village, so this
    // is a hand-made POST. Recording it would put a council's impact assessment
    // in the trail against a village that was never shown one.
    const result = await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: { dpia: true, apd: true, dpa: true, community: true },
    });

    expect(result).toMatchObject({ ok: true, complete: true });

    const data = mocks.update.mock.calls[0]?.[0]?.data;
    expect(Object.keys(data).sort()).toEqual([
      "communityDpaAcceptedAt",
      "communityDpaAcceptedById",
    ]);
  });

  it("drops a community tick posted at a council village", async () => {
    mocks.findUnique.mockResolvedValue(NOTHING_ACCEPTED);

    // The mirror image, and the worse direction of the two: it would record a
    // coordinator personally taking on duties their council holds.
    await acceptCompliance({
      session: SESSION,
      villageId: VILLAGE,
      accept: { dpia: true, apd: true, dpa: true, community: true },
    });

    const data = mocks.update.mock.calls[0]?.[0]?.data;
    expect(data).not.toHaveProperty("communityDpaAcceptedAt");

    const rows = mocks.createMany.mock.calls[0]?.[0]?.data ?? [];
    expect(rows.map((row: { action: string }) => row.action)).not.toContain(
      "compliance.community_dpa_accepted",
    );
  });
});

describe("moving to the council model", () => {
  const ACCEPTED_COMMUNITY = {
    ...COMMUNITY_NOTHING_ACCEPTED,
    communityDpaAcceptedAt: new Date("2026-08-20T09:00:00Z"),
    communityDpaAcceptedBy: ACCEPTOR,
  };

  it("writes the mode and audits the handover", async () => {
    mocks.findUnique.mockResolvedValue(ACCEPTED_COMMUNITY);

    const result = await setVillageMode({
      session: SESSION,
      villageId: VILLAGE,
      mode: "council",
    });

    expect(result).toMatchObject({ ok: true, mode: "council" });
    expect(mocks.update.mock.calls[0]?.[0]?.data).toEqual({ mode: "council" });

    // The village row holds the new mode and not the date it changed, so this
    // row is the only record of when the council took over.
    const row = mocks.create.mock.calls[0]?.[0]?.data;
    expect(row.action).toBe("village.mode_changed");
    expect(row.before.mode).toBe("community");
    expect(row.after.mode).toBe("council");
    expect(row.after.documentsRequired).toEqual(["dpia", "apd", "dpa"]);
    expect(row.after.communityAgreementStillInForce).toBe(true);
  });

  it("leaves the village open while the council works through its documents", async () => {
    // Council mode, nothing of the three accepted, the coordinator's agreement
    // still recorded. Blocking here would take a running village offline for
    // the duration of a parish meeting, which is the surest way to make nobody
    // ever upgrade.
    mocks.findUnique.mockResolvedValue({
      ...ACCEPTED_COMMUNITY,
      mode: "council",
    });

    const status = await getVillageCompliance(VILLAGE);

    expect(status.mode).toBe("council");
    expect(status.complete).toBe(true);
    expect(status.dpia).toBeNull();
    expect(await canVillageAcceptIncidents(VILLAGE)).toBe(true);
  });

  it("still blocks a council village that never had a community agreement", async () => {
    // A village activated straight into the council model. There is no earlier
    // controller to fall back on, so the three documents are the whole gate —
    // which is what this module has always done.
    mocks.findUnique.mockResolvedValue(NOTHING_ACCEPTED);

    expect((await getVillageCompliance(VILLAGE)).complete).toBe(false);
  });

  it("never clears the community acceptance", async () => {
    mocks.findUnique.mockResolvedValue(ACCEPTED_COMMUNITY);

    await setVillageMode({
      session: SESSION,
      villageId: VILLAGE,
      mode: "council",
    });

    // The coordinator *was* the controller for that period. It is also what
    // keeps the village open above.
    const data = mocks.update.mock.calls[0]?.[0]?.data;
    expect(data).not.toHaveProperty("communityDpaAcceptedAt");
    expect(data).not.toHaveProperty("communityDpaAcceptedById");
  });

  it("refuses to move back, and says why rather than rejecting the input", async () => {
    mocks.findUnique.mockResolvedValue({
      ...ACCEPTED_COMMUNITY,
      mode: "council",
    });

    const result = await setVillageMode({
      session: SESSION,
      villageId: VILLAGE,
      mode: "community",
    });

    expect(result).toMatchObject({ ok: false, reason: "not_an_upgrade" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("treats a village already on the council model as a no-op success", async () => {
    mocks.findUnique.mockResolvedValue({ ...NOTHING_ACCEPTED });

    const result = await setVillageMode({
      session: SESSION,
      villageId: VILLAGE,
      mode: "council",
    });

    // Nothing is wrong from the coordinator's side, and a second audit row
    // would put a handover in the trail that did not happen.
    expect(result).toMatchObject({ ok: true, mode: "council" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("reports an unapplied migration as unmigrated rather than try again", async () => {
    mocks.findUnique.mockRejectedValue(missingColumn("community"));

    const result = await setVillageMode({
      session: SESSION,
      villageId: VILLAGE,
      mode: "council",
    });

    expect(result).toMatchObject({ ok: false, reason: "unmigrated" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
