import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth";
import type { VillageServiceState } from "@/lib/villages";

/**
 * Taking a village out of service, and putting it back.
 *
 * `activateVillage` was the only thing in the application that had ever written
 * `Village.status`, so until now a village could be brought into service and
 * never taken out of it except by an `UPDATE` typed into psql. What is asserted
 * here is the set of rules that decide whether that pair of buttons is safe to
 * hand somebody:
 *
 *   * **Both admin lists are required**, and the narrower one is checked *in
 *     addition to* the wider rather than instead of it — the same property
 *     `village-merge.test.ts` pins, because an address removed from
 *     `ADMIN_EMAILS` has to lose this too.
 *   * **Each transition runs from exactly one status.** Suspending a `PENDING`
 *     village would put it in a state the reactivate button offers to open, and
 *     reactivating an `ARCHIVED` one would resurrect a village a *merge* moved
 *     the residents and reports out of. Both are refused with their own
 *     sentence.
 *   * **The write is guarded on the status just read**, so the second of two
 *     concurrent presses changes nothing and writes no second audit row.
 *   * **Reactivating mints a join code where one is missing, before the status.**
 *     `checkVillageJoin` reads "no code set" as "no code required", so an
 *     `ACTIVE` village with a null code is one anybody in the picker can walk
 *     into. The ordering is what makes the half-completed state the safe one.
 *   * **Nothing is deleted.** Neither function touches a row other than the
 *     village's own status, which is the whole promise the confirm panel makes.
 *
 * And the read behind the resident's banner and the two report gates:
 *
 *   * a non-`ACTIVE` village **blocks** and gets the message for its own status;
 *   * a failed read **blocks** and gets the "could not read" message rather than
 *     claiming a village is suspended, which would send a resident to a
 *     coordinator with nothing to fix.
 *
 * Prisma and `auditContext` are mocked at their module boundaries, so this runs
 * on a fresh clone with no `.env.local` and no database.
 */

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    village: {
      findUnique: mocks.findUnique,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
    auditLog: { create: mocks.auditCreate },
  },
}));

vi.mock("@/lib/audit-context", () => ({
  auditContext: () => Promise.resolve({ ipAddress: null, userAgent: null }),
}));

const VILLAGE = "village-1";

function session(email: string): Session {
  return {
    user: { id: "actor-1", email } as Session["user"],
    profile: null,
  };
}

const BOSS = "boss@example.test";

/** An in-service village with a code — what suspension runs from. */
const ACTIVE_ROW = {
  id: VILLAGE,
  name: "Histon",
  status: "ACTIVE",
  joinCode: "OAK7X2",
};

const SUSPENDED_ROW = { ...ACTIVE_ROW, status: "SUSPENDED" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.DATABASE_URL = "postgres://test";
  process.env.ADMIN_EMAILS = BOSS;
  process.env.SUPER_ADMIN_EMAILS = BOSS;

  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.update.mockResolvedValue({});
  mocks.auditCreate.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function load() {
  return import("@/lib/villages");
}

describe("the gate", () => {
  it("refuses a platform admin who is not a super admin", async () => {
    process.env.SUPER_ADMIN_EMAILS = "";
    const { suspendVillage } = await load();
    mocks.findUnique.mockResolvedValue(ACTIVE_ROW);

    const result = await suspendVillage({
      session: session(BOSS),
      villageId: VILLAGE,
    });

    expect(result.ok).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a super admin who is not also a platform admin", async () => {
    // The narrower list is checked in addition to the wider one, never instead
    // of it — removing somebody from ADMIN_EMAILS has to remove this too.
    process.env.ADMIN_EMAILS = "";
    const { suspendVillage } = await load();
    mocks.findUnique.mockResolvedValue(ACTIVE_ROW);

    const result = await suspendVillage({
      session: session(BOSS),
      villageId: VILLAGE,
    });

    expect(result.ok).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("guards reactivation with the same pair", async () => {
    process.env.SUPER_ADMIN_EMAILS = "";
    const { reactivateVillage } = await load();
    mocks.findUnique.mockResolvedValue(SUSPENDED_ROW);

    const result = await reactivateVillage({
      session: session(BOSS),
      villageId: VILLAGE,
    });

    expect(result.ok).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("refuses an ordinary resident outright", async () => {
    const { suspendVillage } = await load();
    mocks.findUnique.mockResolvedValue(ACTIVE_ROW);

    const result = await suspendVillage({
      session: session("resident@example.test"),
      villageId: VILLAGE,
    });

    expect(result.ok).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});

describe("suspendVillage", () => {
  it("takes an active village out of service and audits it", async () => {
    const { suspendVillage } = await load();
    mocks.findUnique.mockResolvedValue(ACTIVE_ROW);

    const result = await suspendVillage({
      session: session(BOSS),
      villageId: VILLAGE,
    });

    expect(result.ok).toBe(true);

    // Guarded on the status just read, so a concurrent press updates nothing.
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: VILLAGE, status: "ACTIVE" },
      data: { status: "SUSPENDED" },
    });

    const audit = mocks.auditCreate.mock.calls[0]?.[0]?.data;
    expect(audit.action).toBe("village.suspended");
    expect(audit.before).toEqual({ status: "ACTIVE" });
    expect(audit.after).toEqual({ status: "SUSPENDED" });
    // The authority is membership of two environment variables, and an
    // administrator's profile may say RESIDENT or may not exist at all.
    expect(audit.actorRole).toBe("PLATFORM_ADMIN");
  });

  it.each(["PENDING", "ARCHIVED", "SUSPENDED"] as const)(
    "refuses to suspend a %s village",
    async (status) => {
      const { suspendVillage } = await load();
      mocks.findUnique.mockResolvedValue({ ...ACTIVE_ROW, status });

      const result = await suspendVillage({
        session: session(BOSS),
        villageId: VILLAGE,
      });

      expect(result.ok).toBe(false);
      expect(mocks.updateMany).not.toHaveBeenCalled();
      expect(mocks.auditCreate).not.toHaveBeenCalled();
    },
  );

  it("loses a concurrent race without writing an audit row", async () => {
    const { suspendVillage } = await load();
    mocks.findUnique.mockResolvedValue(ACTIVE_ROW);
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const result = await suspendVillage({
      session: session(BOSS),
      villageId: VILLAGE,
    });

    expect(result.ok).toBe(false);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("says so rather than throwing when the village is gone", async () => {
    const { suspendVillage } = await load();
    mocks.findUnique.mockResolvedValue(null);

    const result = await suspendVillage({
      session: session(BOSS),
      villageId: VILLAGE,
    });

    expect(result).toEqual({
      ok: false,
      error: "That village no longer exists.",
    });
  });
});

describe("reactivateVillage", () => {
  it("puts a suspended village back and leaves its join code alone", async () => {
    const { reactivateVillage } = await load();
    mocks.findUnique.mockResolvedValue(SUSPENDED_ROW);

    const result = await reactivateVillage({
      session: session(BOSS),
      villageId: VILLAGE,
    });

    expect(result.ok).toBe(true);
    expect(result.joinCode).toBeUndefined();

    // A code already on a poster must survive being put back in service —
    // rotation is `regenerateJoinCode` and is a different decision.
    expect(mocks.update).not.toHaveBeenCalled();

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: VILLAGE, status: "SUSPENDED" },
      data: { status: "ACTIVE" },
    });

    const audit = mocks.auditCreate.mock.calls[0]?.[0]?.data;
    expect(audit.action).toBe("village.reactivated");
    expect(audit.after).toMatchObject({
      status: "ACTIVE",
      joinCodeMinted: false,
    });
  });

  it("mints a code before the status when the village has none", async () => {
    /*
      The load-bearing one. `checkVillageJoin` reads "no code set" as "no code
      required", so an ACTIVE village with a null code is one anybody in the
      picker can walk into — and the write order is what makes the
      half-completed state a village holding an unused code rather than an open
      one.
    */
    const { reactivateVillage } = await load();
    mocks.findUnique.mockResolvedValue({ ...SUSPENDED_ROW, joinCode: null });

    const order: string[] = [];
    mocks.update.mockImplementation(() => {
      order.push("code");
      return Promise.resolve({});
    });
    mocks.updateMany.mockImplementation(() => {
      order.push("status");
      return Promise.resolve({ count: 1 });
    });

    const result = await reactivateVillage({
      session: session(BOSS),
      villageId: VILLAGE,
    });

    expect(result.ok).toBe(true);
    expect(order).toEqual(["code", "status"]);

    const minted = mocks.update.mock.calls[0]?.[0]?.data?.joinCode;
    expect(minted).toMatch(/^[A-Z0-9]{6,}$/);

    // Handed back once so the card can render it, and never written to the
    // trail — the trail is append-only and every coordinator can read it.
    expect(result.joinCode).toBe(minted);
    const audit = mocks.auditCreate.mock.calls[0]?.[0]?.data;
    expect(JSON.stringify(audit)).not.toContain(minted);
    expect(audit.after).toMatchObject({ joinCodeMinted: true });
  });

  it.each(["ACTIVE", "PENDING", "ARCHIVED"] as const)(
    "refuses to reactivate a %s village",
    async (status) => {
      const { reactivateVillage } = await load();
      mocks.findUnique.mockResolvedValue({ ...SUSPENDED_ROW, status });

      const result = await reactivateVillage({
        session: session(BOSS),
        villageId: VILLAGE,
      });

      expect(result.ok).toBe(false);
      expect(mocks.updateMany).not.toHaveBeenCalled();
    },
  );
});

/**
 * Narrows the union, and is itself the assertion.
 *
 * `expect(state.inService).toBe(false)` does not narrow a discriminated union
 * for TypeScript, so reading `.message` after one is a compile error. A throw
 * here fails the test with a sentence rather than a type error, and the
 * narrowed value is what the rest of the case reads.
 */
function blocked(state: VillageServiceState) {
  if (state.inService) {
    throw new Error("expected the village to be out of service");
  }

  return state;
}

describe("getVillageServiceState", () => {
  it("reports an active village as in service", async () => {
    const { getVillageServiceState } = await load();
    mocks.findUnique.mockResolvedValue({ status: "ACTIVE" });

    expect(await getVillageServiceState(VILLAGE)).toEqual({
      inService: true,
      status: "ACTIVE",
    });
  });

  it.each(["SUSPENDED", "PENDING", "ARCHIVED"] as const)(
    "blocks a %s village and says what still works",
    async (status) => {
      const { getVillageServiceState } = await load();
      const { VILLAGE_SERVICE_MESSAGES } = await import("@/lib/constants");
      mocks.findUnique.mockResolvedValue({ status });

      const state = blocked(await getVillageServiceState(VILLAGE));

      expect(state.status).toBe(status);
      expect(state.message).toBe(VILLAGE_SERVICE_MESSAGES[status]);
      // Every one of them has to say the data is still there. A resident whose
      // village went quiet needs that before they need the reason.
      expect(state.message).toContain("Nothing");
    },
  );

  it("blocks on a failed read without claiming the village is suspended", async () => {
    const { getVillageServiceState } = await load();
    const { VILLAGE_SERVICE_UNKNOWN_MESSAGE } = await import("@/lib/constants");
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findUnique.mockRejectedValue(new Error("connection refused"));

    const state = blocked(await getVillageServiceState(VILLAGE));

    expect(state.status).toBeNull();
    expect(state.message).toBe(VILLAGE_SERVICE_UNKNOWN_MESSAGE);
    expect(state.message).not.toContain("suspended");
  });

  it("does not read a village that is gone as in service", async () => {
    const { getVillageServiceState } = await load();
    mocks.findUnique.mockResolvedValue(null);

    expect((await getVillageServiceState(VILLAGE)).inService).toBe(false);
  });
});
