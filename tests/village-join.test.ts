import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VillageStatus } from "@/generated/prisma/enums";

/**
 * `checkVillageJoin` — the one place a join code is checked, and the reason the
 * two auth routes no longer have a copy each.
 *
 * ## Why this file exists
 *
 * The function was written, documented and exported, and **nothing ever called
 * it**. `POST /api/auth/register` and `POST /api/auth/complete-profile` each
 * carried their own comparison instead, and both were guarded the same way:
 *
 * ```ts
 * if (joinCode && !codeMatches) return 422;
 * ```
 *
 * A *wrong* code was refused. A *blank* one fell straight through the guard, and
 * the resident was created in the village as a plain `RESIDENT` — inside the
 * tenant boundary every incident query is scoped by (domain rule 4), on the map,
 * and in the audience for the village's push alerts. Anybody who could see a
 * village in the picker could join it by leaving the field empty.
 *
 * The blank-code case below is therefore the test this file is for. The rest are
 * here so it cannot be "fixed" by making the check strict enough to lock out the
 * rows that legitimately have no code.
 *
 * Prisma is mocked at its module boundary, so the suite still needs no database
 * and no secret — the property CI depends on.
 */

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { village: { findUnique: mocks.findUnique } },
}));

const { checkVillageJoin } = await import("@/lib/villages");

/** One row as `checkVillageJoin` selects it. */
function village(overrides: {
  status?: VillageStatus;
  joinCode?: string | null;
}) {
  mocks.findUnique.mockResolvedValue({
    id: "village-1",
    name: "Histon",
    status: overrides.status ?? "ACTIVE",
    joinCode: overrides.joinCode === undefined ? "OAK7X2QM" : overrides.joinCode,
  });
}

beforeEach(() => {
  mocks.findUnique.mockReset();
});

describe("checkVillageJoin", () => {
  it("refuses a blank join code when the village has one", async () => {
    village({});

    const result = await checkVillageJoin({ villageId: "village-1" });

    // The whole point of the file. Not `ok: true, verified: false` — that was
    // the old behaviour and it is what put a stranger in the village.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe("joinCode");
  });

  it("refuses an empty string as firmly as a missing one", async () => {
    village({});

    // A `<form>` posts `""` for an untouched field, and `registerSchema` marks
    // the field optional — so this is the shape the blank case actually arrives
    // in, not the `undefined` above.
    const result = await checkVillageJoin({ villageId: "village-1", joinCode: "" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe("joinCode");
  });

  it("refuses a whitespace-only code rather than reading it as absent", async () => {
    village({});

    const result = await checkVillageJoin({
      villageId: "village-1",
      joinCode: "   ",
    });

    expect(result.ok).toBe(false);
  });

  it("verifies a correct code", async () => {
    village({});

    const result = await checkVillageJoin({
      villageId: "village-1",
      joinCode: "OAK7X2QM",
    });

    expect(result).toMatchObject({
      ok: true,
      verified: true,
      village: { id: "village-1", name: "Histon" },
    });
  });

  it("accepts the code as it is written down, not as it is stored", async () => {
    village({});

    // Lower case, spaced and hyphenated: a code read off a newsletter, out of a
    // WhatsApp message, or down the phone. `normalizeJoinCode` is applied to
    // both sides, which is the only reason a QR link and a typed code agree.
    for (const typed of ["oak7x2qm", "OAK7-X2QM", " oak 7x2 qm "]) {
      const result = await checkVillageJoin({
        villageId: "village-1",
        joinCode: typed,
      });

      expect(result, `"${typed}" should be accepted`).toMatchObject({
        ok: true,
        verified: true,
      });
    }
  });

  it("refuses a wrong code against the join code field", async () => {
    village({});

    const result = await checkVillageJoin({
      villageId: "village-1",
      joinCode: "NOTTHEONE",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe("joinCode");
  });

  it("lets a village with no code set through, unverified", async () => {
    village({ joinCode: null });

    // The escape hatch, and the reason the fix is not simply "always demand a
    // code": rows created before activation existed have none to demand, and
    // locking their residents out would be an upgrade that closed a village.
    // `activateVillage` mints the code *before* it flips the status so nothing
    // new can land in this state.
    const result = await checkVillageJoin({ villageId: "village-1" });

    expect(result).toMatchObject({ ok: true, verified: false });
  });

  it("refuses on status before it ever looks at the code", async () => {
    const closed: VillageStatus[] = ["PENDING", "SUSPENDED", "ARCHIVED"];

    for (const status of closed) {
      village({ status });

      // With the *correct* code, so the refusal can only be the status. A
      // seeded parish is `PENDING` and its slug is guessable by design.
      const result = await checkVillageJoin({
        villageId: "village-1",
        joinCode: "OAK7X2QM",
      });

      expect(result.ok, `${status} should refuse`).toBe(false);
      if (result.ok) return;
      expect(result.field).toBe("villageId");
      // Something a resident can act on, rather than an empty string.
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("refuses a village id that matches nothing", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const result = await checkVillageJoin({
      villageId: "00000000-0000-0000-0000-000000000000",
      joinCode: "OAK7X2QM",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe("villageId");
  });

  it("never selects a column the caller could leak", async () => {
    village({});

    await checkVillageJoin({ villageId: "village-1", joinCode: "OAK7X2QM" });

    // The `ok: true` shape carries the id and the name and nothing else — the
    // code it just compared does not come back out. Both callers spread this
    // into a profile write and one of them announces the village on Slack.
    const [call] = mocks.findUnique.mock.calls;
    expect(call?.[0]?.select).toMatchObject({ joinCode: true });

    const result = await checkVillageJoin({
      villageId: "village-1",
      joinCode: "OAK7X2QM",
    });

    expect(result.ok && Object.keys(result.village)).toEqual(["id", "name"]);
  });
});
