import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth";

/**
 * `setResidentRole` — a coordinator verifying a resident, or withdrawing it.
 *
 * This is the third place in the codebase that writes `User.role` and the first
 * that is not platform-admin only, which is the whole reason it has a test
 * file. The other two raise somebody into `COORDINATOR`; this one deliberately
 * cannot, and its refusals are the entire safety argument for putting the
 * control on a coordinator's screen at all.
 *
 * What is asserted is the pair of roles it can write, both directions of the
 * `verifiedAt`/`verifiedById` pair, and each of the five refusals. What is
 * deliberately *not* asserted is the wording of any message — those are copy
 * under revision, for the reason `compliance-documents.test.ts` gives at
 * length.
 *
 * Prisma is mocked at its module boundary, so this needs no database and no
 * secret — the property that lets CI run the suite on every push with no
 * environment at all.
 */

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.findFirst, update: mocks.update },
    auditLog: { create: mocks.auditCreate },
  },
}));

// `auditContext()` reads `next/headers`, which has no request behind it here.
// The real one never throws and falls back to nulls; this is that, without the
// framework.
vi.mock("@/lib/audit-context", () => ({
  auditContext: async () => ({ ipAddress: null, userAgent: null }),
}));

const COORDINATOR = "coordinator-1";
const VILLAGE = "village-1";

function session(role: string = "COORDINATOR"): Session {
  return {
    user: { id: COORDINATOR, email: "coordinator@example.test" },
    profile: { role, villageId: VILLAGE },
  } as unknown as Session;
}

/** A resident row as `setResidentRole`'s own `findFirst` selects it. */
function resident(overrides: Record<string, unknown> = {}) {
  return {
    id: "resident-1",
    fullName: "Pat Resident",
    role: "RESIDENT",
    verifiedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

async function load() {
  vi.resetModules();
  return import("@/lib/villages");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test";
  mocks.update.mockResolvedValue({});
  mocks.auditCreate.mockResolvedValue({});
});

describe("the roles it can write", () => {
  it("offers exactly two, and neither of them is a coordinator role", async () => {
    const { RESIDENT_MANAGED_ROLES } = await load();

    expect([...RESIDENT_MANAGED_ROLES]).toEqual([
      "RESIDENT",
      "VERIFIED_RESIDENT",
    ]);
    expect(RESIDENT_MANAGED_ROLES).not.toContain("COORDINATOR");
    expect(RESIDENT_MANAGED_ROLES).not.toContain("MODERATOR");
    expect(RESIDENT_MANAGED_ROLES).not.toContain("ADMIN");
  });

  it("recognises only those two as changeable", async () => {
    const { isManagedResidentRole } = await load();

    expect(isManagedResidentRole("RESIDENT")).toBe(true);
    expect(isManagedResidentRole("VERIFIED_RESIDENT")).toBe(true);
    expect(isManagedResidentRole("COORDINATOR")).toBe(false);
    expect(isManagedResidentRole("MODERATOR")).toBe(false);
    expect(isManagedResidentRole("ADMIN")).toBe(false);
    // A profile that has not loaded is not a resident to be verified.
    expect(isManagedResidentRole(null)).toBe(false);
    expect(isManagedResidentRole(undefined)).toBe(false);
  });
});

describe("verifying", () => {
  it("writes VERIFIED_RESIDENT and stamps who did it", async () => {
    const { setResidentRole } = await load();
    mocks.findFirst.mockResolvedValue(resident());

    const result = await setResidentRole({
      session: session(),
      villageId: VILLAGE,
      residentId: "resident-1",
      verified: true,
    });

    expect(result.ok).toBe(true);

    const data = mocks.update.mock.calls[0][0].data;
    expect(data.role).toBe("VERIFIED_RESIDENT");
    expect(data.verifiedAt).toBeInstanceOf(Date);
    expect(data.verifiedById).toBe(COORDINATOR);
  });

  it("keeps an existing verification date rather than moving it to today", async () => {
    const { setResidentRole } = await load();
    const original = new Date("2026-01-04T09:00:00.000Z");
    // Somebody whose role was written back to RESIDENT while the column kept
    // its original stamp — the state `appointCoordinator` also has to survive.
    mocks.findFirst.mockResolvedValue(resident({ verifiedAt: original }));

    await setResidentRole({
      session: session(),
      villageId: VILLAGE,
      residentId: "resident-1",
      verified: true,
    });

    expect(mocks.update.mock.calls[0][0].data.verifiedAt).toBe(original);
  });

  it("scopes the lookup to the caller's village", async () => {
    const { setResidentRole } = await load();
    mocks.findFirst.mockResolvedValue(resident());

    await setResidentRole({
      session: session(),
      villageId: VILLAGE,
      residentId: "resident-1",
      verified: true,
    });

    // Domain rule 4, and in the predicate rather than checked afterwards: a
    // resident of another village must be indistinguishable from one that does
    // not exist.
    expect(mocks.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "resident-1",
      villageId: VILLAGE,
    });
  });

  it("audits the change with both roles and neither name", async () => {
    const { setResidentRole } = await load();
    mocks.findFirst.mockResolvedValue(resident());

    await setResidentRole({
      session: session(),
      villageId: VILLAGE,
      residentId: "resident-1",
      verified: true,
    });

    const row = mocks.auditCreate.mock.calls[0][0].data;
    expect(row.action).toBe("village.resident_role_changed");
    expect(row.entityType).toBe("User");
    expect(row.entityId).toBe("resident-1");
    expect(row.villageId).toBe(VILLAGE);
    expect(row.before).toEqual({ role: "RESIDENT" });
    expect(row.after).toEqual({ role: "VERIFIED_RESIDENT" });

    // The trail is readable by every coordinator in the village for as long as
    // the village exists. `entityId` resolves to the row; the name and address
    // do not need to be copied into it.
    expect(JSON.stringify(row)).not.toContain("Pat Resident");
  });
});

describe("withdrawing", () => {
  it("writes RESIDENT and clears both verification columns", async () => {
    const { setResidentRole } = await load();
    mocks.findFirst.mockResolvedValue(
      resident({ role: "VERIFIED_RESIDENT", verifiedAt: new Date() }),
    );

    const result = await setResidentRole({
      session: session(),
      villageId: VILLAGE,
      residentId: "resident-1",
      verified: false,
    });

    expect(result.ok).toBe(true);

    const data = mocks.update.mock.calls[0][0].data;
    expect(data.role).toBe("RESIDENT");
    // Cleared, unlike `appointCoordinator`, which never clears them. There
    // verification is a side effect of a different decision; here it is the
    // decision.
    expect(data.verifiedAt).toBeNull();
    expect(data.verifiedById).toBeNull();
  });
});

describe("what it refuses", () => {
  it("refuses a caller who is not a coordinator", async () => {
    const { setResidentRole } = await load();

    const result = await setResidentRole({
      session: session("VERIFIED_RESIDENT"),
      villageId: VILLAGE,
      residentId: "resident-1",
      verified: true,
    });

    expect(result.ok).toBe(false);
    // Refused before the resident is even looked up.
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuses the caller changing their own role", async () => {
    const { setResidentRole } = await load();

    const result = await setResidentRole({
      session: session(),
      villageId: VILLAGE,
      residentId: COORDINATOR,
      verified: false,
    });

    expect(result.ok).toBe(false);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuses somebody in another village, without saying they exist", async () => {
    const { setResidentRole } = await load();
    // The village is in the predicate, so a resident elsewhere simply is not
    // found.
    mocks.findFirst.mockResolvedValue(null);

    const result = await setResidentRole({
      session: session(),
      villageId: VILLAGE,
      residentId: "resident-elsewhere",
      verified: true,
    });

    expect(result.ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["COORDINATOR", "MODERATOR", "ADMIN"])(
    "refuses to touch a %s — that access is a platform administrator's to grant and remove",
    async (role) => {
      const { setResidentRole } = await load();
      mocks.findFirst.mockResolvedValue(resident({ role }));

      const result = await setResidentRole({
        session: session(),
        villageId: VILLAGE,
        residentId: "resident-1",
        verified: false,
      });

      expect(result.ok).toBe(false);
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.auditCreate).not.toHaveBeenCalled();
    },
  );

  it("refuses a closed account", async () => {
    const { setResidentRole } = await load();
    mocks.findFirst.mockResolvedValue(
      resident({ deletedAt: new Date("2026-08-01T00:00:00.000Z") }),
    );

    const result = await setResidentRole({
      session: session(),
      villageId: VILLAGE,
      residentId: "resident-1",
      verified: true,
    });

    expect(result.ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("writes nothing when the role is already what was asked for", async () => {
    const { setResidentRole } = await load();
    mocks.findFirst.mockResolvedValue(
      resident({ role: "VERIFIED_RESIDENT", verifiedAt: new Date() }),
    );

    const result = await setResidentRole({
      session: session(),
      villageId: VILLAGE,
      residentId: "resident-1",
      verified: true,
    });

    // Succeeds — pressing the button twice is not an error — but leaves no
    // update and no audit row describing a change that did not happen.
    expect(result.ok).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});

describe("the form schema in front of it", () => {
  it("has no role field at all", async () => {
    const { villageResidentRoleFormSchema } = await import("@/lib/validations");

    const parsed = villageResidentRoleFormSchema.parse({
      residentId: "3f1e0c8a-1f4d-4a7e-9c2b-0d5e6f7a8b9c",
      verified: "on",
      // Domain rule 5: a hand-edited payload cannot ask for a role, because
      // there is nothing in the schema to carry one.
      role: "COORDINATOR",
    });

    expect(parsed).toEqual({
      residentId: "3f1e0c8a-1f4d-4a7e-9c2b-0d5e6f7a8b9c",
      verified: true,
    });
    expect(parsed).not.toHaveProperty("role");
  });

  it("reads anything but an explicit tick as unverify", async () => {
    const { villageResidentRoleFormSchema } = await import("@/lib/validations");

    expect(
      villageResidentRoleFormSchema.parse({
        residentId: "3f1e0c8a-1f4d-4a7e-9c2b-0d5e6f7a8b9c",
        verified: "",
      }).verified,
    ).toBe(false);
  });

  it("rejects a resident id that is not one", async () => {
    const { villageResidentRoleFormSchema } = await import("@/lib/validations");

    expect(
      villageResidentRoleFormSchema.safeParse({
        residentId: "not-a-uuid",
        verified: "on",
      }).success,
    ).toBe(false);
  });
});
