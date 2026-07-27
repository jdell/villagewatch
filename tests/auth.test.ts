import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth";

/**
 * `(app)/layout.tsx` calls `requireSession()` and that is the real authorisation
 * boundary — `src/proxy.ts` above it is an optimistic redirect layer, not a
 * gate. `requireAdmin()` is the narrower one in front of `/admin`, and it is
 * the only thing standing between a signed-in resident and the screen that
 * promotes people to coordinator.
 *
 * Both are tested here through their redirects, because a redirect *is* the
 * refusal: `next/navigation`'s `redirect()` throws, so a guard that failed to
 * redirect would return a session to the caller and the page would render.
 *
 * `ADMIN_EMAILS` is read once at module load in `src/lib/admin.ts` — process
 * configuration, not per-request state — so each test resets the module
 * registry and imports again with the environment it wants.
 */

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findUnique: vi.fn(),
}));

/** Stands in for the NEXT_REDIRECT error `redirect()` throws in a real render. */
class RedirectError extends Error {
  constructor(readonly target: string) {
    super(`NEXT_REDIRECT: ${target}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    throw new RedirectError(target);
  },
}));

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: true }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));

/** Re-imports the guards with whatever `ADMIN_EMAILS` is currently stubbed to. */
async function loadAuth() {
  vi.resetModules();
  return import("@/lib/auth");
}

function signedInAs(email: string, profile: Record<string, unknown> | null = null) {
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "auth-user-1", email } },
    error: null,
  });
  mocks.findUnique.mockResolvedValue(profile);
}

function signedOut() {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
}

/** The redirect target a guard refused with, or null if it let the caller past. */
async function refusalTarget(run: () => Promise<Session>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof RedirectError) return error.target;
    throw error;
  }
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  vi.stubEnv("ADMIN_EMAILS", "clerk@parish.example, Chair@Parish.example");
  mocks.findUnique.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("requireSession", () => {
  it("refuses an unauthenticated caller", async () => {
    signedOut();
    const { requireSession } = await loadAuth();

    expect(await refusalTarget(() => requireSession())).toBe("/login");
  });

  it("preserves where the caller was headed", async () => {
    signedOut();
    const { requireSession } = await loadAuth();

    expect(await refusalTarget(() => requireSession("/dashboard/audit"))).toBe(
      "/login?next=%2Fdashboard%2Faudit",
    );
  });

  it("refuses when the JWT is rejected, not only when it is absent", async () => {
    // `getUser()` revalidates against Supabase — a tampered or revoked cookie
    // comes back as an error rather than as a null user.
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT" },
    });
    const { requireSession } = await loadAuth();

    expect(await refusalTarget(() => requireSession())).toBe("/login");
  });

  it("returns the session and profile when signed in", async () => {
    signedInAs("resident@parish.example", { id: "auth-user-1", villageId: "v1" });
    const { requireSession } = await loadAuth();

    const session = await requireSession();

    expect(session.user.id).toBe("auth-user-1");
    expect(session.profile?.villageId).toBe("v1");
  });

  it("returns a session with no profile rather than refusing", async () => {
    // Routine since Google sign-in: an auth user exists and the profile row is
    // written later at /welcome. The layout routes that state, not this guard.
    signedInAs("newcomer@parish.example", null);
    const { requireSession } = await loadAuth();

    const session = await requireSession();

    expect(session.profile).toBeNull();
  });
});

describe("requireAdmin", () => {
  it("refuses a signed-in resident by sending them to the map", async () => {
    // Not /login: they are signed in and just not allowed, and bouncing them to
    // the sign-in page would invite them to try another account.
    signedInAs("resident@parish.example", { id: "auth-user-1", role: "RESIDENT" });
    const { requireAdmin } = await loadAuth();

    expect(await refusalTarget(() => requireAdmin())).toBe("/map");
  });

  it("refuses a coordinator — this is not a superset of requireCoordinator", async () => {
    signedInAs("coordinator@parish.example", {
      id: "auth-user-1",
      role: "COORDINATOR",
    });
    const { requireAdmin } = await loadAuth();

    expect(await refusalTarget(() => requireAdmin())).toBe("/map");
  });

  it("refuses an unauthenticated caller at /login", async () => {
    signedOut();
    const { requireAdmin } = await loadAuth();

    expect(await refusalTarget(() => requireAdmin())).toBe("/login");
  });

  it("admits an address on the allow-list", async () => {
    signedInAs("clerk@parish.example", { id: "auth-user-1", role: "RESIDENT" });
    const { requireAdmin } = await loadAuth();

    const session = await requireAdmin();

    expect(session.user.email).toBe("clerk@parish.example");
  });

  it("admits an administrator who has no profile row", async () => {
    // Somebody in ADMIN_EMAILS who never joined a village can still open the
    // queue — the gate is the verified email, not a `User` row.
    signedInAs("clerk@parish.example", null);
    const { requireAdmin } = await loadAuth();

    await expect(requireAdmin()).resolves.toBeTruthy();
  });

  it("fails closed with ADMIN_EMAILS unset", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    signedInAs("clerk@parish.example", { id: "auth-user-1", role: "ADMIN" });
    const { requireAdmin } = await loadAuth();

    // An empty allow-list is an empty allow-list, not a disabled check — and
    // note that `role: "ADMIN"` does not open this door either.
    expect(await refusalTarget(() => requireAdmin())).toBe("/map");
  });
});

describe("isPlatformAdmin", () => {
  const session = (email: string | undefined): Session =>
    ({ user: { email }, profile: null }) as unknown as Session;

  it("matches ADMIN_EMAILS case-insensitively", async () => {
    const { isPlatformAdmin } = await loadAuth();

    // Listed lower case, typed upper case.
    expect(isPlatformAdmin(session("CLERK@PARISH.EXAMPLE"))).toBe(true);
    // Listed mixed case, typed lower case — an administrator who capitalised
    // their address in Vercel should not silently lose the queue.
    expect(isPlatformAdmin(session("chair@parish.example"))).toBe(true);
    expect(isPlatformAdmin(session("Chair@Parish.example"))).toBe(true);
  });

  it("ignores surrounding whitespace on either side", async () => {
    const { isPlatformAdmin } = await loadAuth();

    // The list is split on commas and trimmed; so is the address under test.
    expect(isPlatformAdmin(session("  clerk@parish.example  "))).toBe(true);
  });

  it("rejects an address that is not on the list", async () => {
    const { isPlatformAdmin } = await loadAuth();

    expect(isPlatformAdmin(session("resident@parish.example"))).toBe(false);
    // Not a prefix or substring match.
    expect(isPlatformAdmin(session("clerk@parish.example.evil.test"))).toBe(false);
  });

  it("rejects a null session and a session with no email", async () => {
    const { isPlatformAdmin } = await loadAuth();

    expect(isPlatformAdmin(null)).toBe(false);
    expect(isPlatformAdmin(session(undefined))).toBe(false);
  });

  it("says nobody is an administrator when the variable is unset", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    const { isPlatformAdmin } = await loadAuth();

    expect(isPlatformAdmin(session("clerk@parish.example"))).toBe(false);
  });
});
