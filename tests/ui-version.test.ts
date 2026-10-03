import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth";
import {
  DEFAULT_UI_VERSION,
  UI_VERSION_COOKIE,
  otherUiVersion,
  parseUiVersion,
  resolveUiVersion,
} from "@/lib/ui-version";
import {
  uiVersionOverrideSchema,
  villageUiVersionFormSchema,
} from "@/lib/validations";

/**
 * The UI version flag — `Village.uiVersion`, and a resident's session override.
 *
 * Asserted: the resolution order (override, then village, then classic) and
 * that a free-text value it does not recognise — `toString` included — is never
 * guessed at; the two schemas refusing anything but the two values; the
 * coordinator's write being village-scoped off the session and audited only on
 * a real change; and the override being a **session** cookie that is cleared,
 * not set, when it would match the village.
 *
 * Prisma, the session and `next/headers` are mocked at their boundaries, so
 * this needs no database and no secret.
 */

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  auditCreate: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  cookieGet: vi.fn(),
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
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

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mocks.cookieGet,
    set: mocks.cookieSet,
    delete: mocks.cookieDelete,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/lib/auth", () => ({
  requireSession: mocks.requireSession,
  getSession: async () => null,
}));

const { setVillageUiVersion } = await import("@/lib/ui-version-server");
const { setUiVersionOverrideAction } = await import(
  "@/app/(app)/ui-version-actions"
);

const VILLAGE = "village-1";

function session(role = "COORDINATOR", villageId: string | null = VILLAGE) {
  return {
    user: { id: "user-1", email: "coordinator@example.test" },
    profile: villageId ? { role, villageId } : null,
  } as unknown as Session;
}

function form(uiVersion: string) {
  const data = new FormData();
  data.set("uiVersion", uiVersion);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test";
  mocks.findUnique.mockResolvedValue({ uiVersion: "classic" });
  mocks.update.mockResolvedValue({});
  mocks.auditCreate.mockResolvedValue({});
  mocks.requireSession.mockResolvedValue(session("RESIDENT"));
});

describe("resolveUiVersion", () => {
  it("prefers the override, then the village, then classic", () => {
    expect(resolveUiVersion({ village: "classic", override: "modern" })).toBe("modern");
    expect(resolveUiVersion({ village: "modern" })).toBe("modern");
    expect(resolveUiVersion({ village: null })).toBe(DEFAULT_UI_VERSION);
    expect(DEFAULT_UI_VERSION).toBe("classic");
  });

  it("ignores what it does not recognise rather than guessing", () => {
    expect(resolveUiVersion({ village: "modern", override: "beta" })).toBe("modern");
    expect(resolveUiVersion({ village: "Modern" })).toBe("classic");
    for (const value of ["toString", "constructor", "__proto__", "", 1, {}]) {
      expect(parseUiVersion(value)).toBeNull();
    }
  });

  it("offers the other one", () => {
    expect(otherUiVersion("classic")).toBe("modern");
    expect(otherUiVersion("modern")).toBe("classic");
  });
});

describe("the schemas", () => {
  it("accept the two values and nothing else", () => {
    for (const schema of [villageUiVersionFormSchema, uiVersionOverrideSchema]) {
      expect(schema.safeParse({ uiVersion: "classic" }).success).toBe(true);
      expect(schema.safeParse({ uiVersion: "modern" }).success).toBe(true);
      expect(schema.safeParse({ uiVersion: "beta" }).success).toBe(false);
      expect(schema.safeParse({ uiVersion: null }).success).toBe(false);
    }
  });
});

describe("setVillageUiVersion", () => {
  it("writes the caller's own village and audits the change", async () => {
    const result = await setVillageUiVersion({
      session: session(),
      uiVersion: "modern",
    });

    expect(result).toEqual({ ok: true, changed: true, value: "modern" });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: VILLAGE },
      data: { uiVersion: "modern" },
    });
    expect(mocks.auditCreate.mock.calls[0][0].data).toMatchObject({
      villageId: VILLAGE,
      action: "village.ui_version_changed",
      entityType: "village",
      entityId: VILLAGE,
      before: { uiVersion: "classic" },
      after: { uiVersion: "modern" },
    });
  });

  it("writes nothing and audits nothing when the value has not changed", async () => {
    const result = await setVillageUiVersion({
      session: session(),
      uiVersion: "classic",
    });

    expect(result).toEqual({ ok: true, changed: false, value: "classic" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("puts a valid value back over one it does not recognise", async () => {
    mocks.findUnique.mockResolvedValue({ uiVersion: "garbage" });

    await setVillageUiVersion({ session: session(), uiVersion: "classic" });

    expect(mocks.update).toHaveBeenCalled();
  });

  it.each(["RESIDENT", "VERIFIED_RESIDENT"])("refuses a %s", async (role) => {
    const result = await setVillageUiVersion({
      session: session(role),
      uiVersion: "modern",
    });

    expect(result.ok).toBe(false);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("keeps the saved value when the audit write fails", async () => {
    mocks.auditCreate.mockRejectedValue(new Error("audit down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await setVillageUiVersion({
      session: session(),
      uiVersion: "modern",
    });

    expect(result.ok).toBe(true);
  });
});

describe("setUiVersionOverrideAction", () => {
  it("sets a session cookie — no maxAge, no expiry — when it differs from the village", async () => {
    await setUiVersionOverrideAction(form("modern"));

    expect(mocks.cookieSet).toHaveBeenCalledTimes(1);
    const [name, value, options] = mocks.cookieSet.mock.calls[0];
    expect(name).toBe(UI_VERSION_COOKIE);
    expect(value).toBe("modern");
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(options).not.toHaveProperty("maxAge");
    expect(options).not.toHaveProperty("expires");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("clears the cookie rather than setting it to the village's own value", async () => {
    await setUiVersionOverrideAction(form("classic"));

    expect(mocks.cookieDelete).toHaveBeenCalledWith(UI_VERSION_COOKIE);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("does nothing with a value it does not recognise", async () => {
    await setUiVersionOverrideAction(form("beta"));

    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.cookieDelete).not.toHaveBeenCalled();
  });

  it("writes no column and no audit row", async () => {
    await setUiVersionOverrideAction(form("modern"));

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
