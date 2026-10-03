import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth";
import {
  normalizeUkPostcode,
  villagePostcodeFormSchema,
} from "@/lib/validations";

/**
 * The village postcode — what "Write to your MP" sends to Parliament's Members
 * API, and which no village had, because the ONS directory carries none.
 *
 * Asserted: the loose format check and the one normal form every spelling
 * becomes; blank clearing to `null` rather than `""`, which
 * `lookupMpByPostcode` would otherwise send as a search for nothing; and
 * `setVillagePostcode`'s rules — coordinator only, the village off the
 * session, no write and no audit row for a save that changed nothing. The
 * wording of messages is deliberately not asserted.
 *
 * Prisma is mocked at its module boundary, so this needs no database and no
 * secret.
 */

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    village: { findUnique: mocks.findUnique, update: mocks.update },
    auditLog: { create: mocks.auditCreate },
  },
}));

vi.mock("@/lib/audit-context", () => ({
  auditContext: async () => ({ ipAddress: null, userAgent: null }),
}));

const { setVillagePostcode } = await import("@/lib/villages");

const VILLAGE = "village-1";

function session(role = "COORDINATOR", villageId: string | null = VILLAGE) {
  return {
    user: { id: "user-1", email: "coordinator@example.test" },
    profile: villageId ? { role, villageId } : null,
  } as unknown as Session;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test";
  mocks.findUnique.mockResolvedValue({ postcode: null });
  mocks.update.mockResolvedValue({});
  mocks.auditCreate.mockResolvedValue({});
});

describe("normalizeUkPostcode", () => {
  it.each([
    ["cb24 9ab", "CB24 9AB"],
    ["CB249AB", "CB24 9AB"],
    ["  Cb24   9aB ", "CB24 9AB"],
    ["m1 1aa", "M1 1AA"],
    ["SW1A1AA", "SW1A 1AA"],
    ["ec1a 1bb", "EC1A 1BB"],
    ["W1A 0AX", "W1A 0AX"],
  ])("%j becomes %j", (input, expected) => {
    expect(normalizeUkPostcode(input)).toBe(expected);
  });

  it.each(["", "CB24", "9AB", "CB24 9A", "CB24 99B", "12345", "CB24-9AB", "Histon"])(
    "refuses %j",
    (input) => {
      expect(normalizeUkPostcode(input)).toBeNull();
    },
  );
});

describe("villagePostcodeFormSchema", () => {
  it("normalises a valid postcode", () => {
    expect(villagePostcodeFormSchema.parse({ postcode: "cb249ab" })).toEqual({
      postcode: "CB24 9AB",
    });
  });

  it("turns blank into null rather than an empty string", () => {
    expect(villagePostcodeFormSchema.parse({ postcode: "   " }).postcode).toBeNull();
  });

  it("refuses something that is not a postcode, and something too long", () => {
    expect(villagePostcodeFormSchema.safeParse({ postcode: "Histon" }).success).toBe(false);
    expect(
      villagePostcodeFormSchema.safeParse({ postcode: "CB24 9AB EXTRA" }).success,
    ).toBe(false);
  });
});

describe("setVillagePostcode", () => {
  it("writes the caller's own village and audits the change", async () => {
    const result = await setVillagePostcode({
      session: session(),
      postcode: "CB24 9AB",
    });

    expect(result.ok).toBe(true);
    expect(mocks.findUnique.mock.calls[0][0].where).toEqual({ id: VILLAGE });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: VILLAGE },
      data: { postcode: "CB24 9AB" },
    });
    expect(mocks.auditCreate.mock.calls[0][0].data).toMatchObject({
      villageId: VILLAGE,
      action: "village.postcode_changed",
      entityType: "village",
      entityId: VILLAGE,
      before: { postcode: null },
      after: { postcode: "CB24 9AB" },
    });
  });

  it("clears it with null", async () => {
    mocks.findUnique.mockResolvedValue({ postcode: "CB24 9AB" });

    await setVillagePostcode({ session: session(), postcode: null });

    expect(mocks.update.mock.calls[0][0].data).toEqual({ postcode: null });
    expect(mocks.auditCreate.mock.calls[0][0].data.after).toEqual({
      postcode: null,
    });
  });

  it("writes nothing and audits nothing when the value has not changed", async () => {
    mocks.findUnique.mockResolvedValue({ postcode: "CB24 9AB" });

    const result = await setVillagePostcode({
      session: session(),
      postcode: "CB24 9AB",
    });

    expect(result.ok).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it.each(["RESIDENT", "VERIFIED_RESIDENT"])(
    "refuses a %s before reading anything",
    async (role) => {
      const result = await setVillagePostcode({
        session: session(role),
        postcode: "CB24 9AB",
      });

      expect(result.ok).toBe(false);
      expect(mocks.findUnique).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );

  it("refuses a coordinator with no village", async () => {
    const result = await setVillagePostcode({
      session: session("COORDINATOR", null),
      postcode: "CB24 9AB",
    });

    expect(result.ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps the saved postcode when the audit write fails", async () => {
    mocks.auditCreate.mockRejectedValue(new Error("audit down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await setVillagePostcode({
      session: session(),
      postcode: "CB24 9AB",
    });

    expect(result.ok).toBe(true);
    expect(mocks.update).toHaveBeenCalled();
  });
});
