import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `PATCH /api/admin/village-interest/[id]/archive`.
 *
 * The fifth route handler in the suite, and it is here for its **gate** rather
 * than its arithmetic — the write itself is covered against a mocked Prisma in
 * `village-interest.test.ts`.
 *
 * `src/proxy.ts` passes `/api/` straight through, so nothing above this handler
 * has looked at who is calling. That is the same thing the merge route's header
 * says and the reason that one checks three times; here the check is in one
 * place, which makes it exactly the line worth pinning. An unauthenticated
 * PATCH that archived rows would be invisible from every screen in the app —
 * the row simply leaves the working list, which is what archiving looks like
 * when it is working.
 *
 * The other thing asserted is the pair of shapes the body can take. Restore is
 * `{ restore: true }` and archive is a reason, and they share a URL; a refactor
 * that let a reason-less body through would archive rows with no account of
 * why, which is the one state the column exists to prevent.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isPlatformAdmin: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSession: mocks.getSession,
  isPlatformAdmin: mocks.isPlatformAdmin,
}));

vi.mock("@/lib/village-interest", () => ({
  archiveVillageInterest: mocks.archive,
  restoreVillageInterest: mocks.restore,
}));

const { NextRequest } = await import("next/server");
const { PATCH } = await import(
  "@/app/api/admin/village-interest/[id]/archive/route"
);

/**
 * A real v4 uuid, and that is not incidental.
 *
 * `z.uuid()` in Zod 4 checks the version and variant nibbles, not just the
 * shape — so `1111…-1111-…` is refused with a 400 and every assertion below
 * about the body would pass for the wrong reason. Prisma's `@default(uuid())`
 * and the migration's `gen_random_uuid()` both produce v4, so this is what a
 * real row's id looks like.
 */
const ID = "5421b5f0-1d6a-42c2-9af2-48d54d4fcd80";

function patch(body: unknown) {
  return new NextRequest(
    `http://localhost/api/admin/village-interest/${ID}/archive`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

/** Next 16 hands a dynamic segment's params as a Promise. */
function params(id = ID) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  mocks.getSession.mockResolvedValue({ user: { id: "admin-1" } });
  mocks.isPlatformAdmin.mockReturnValue(true);
  mocks.archive.mockResolvedValue({ ok: true, villageName: "Cottenham" });
  mocks.restore.mockResolvedValue({ ok: true, villageName: "Cottenham" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("the gate", () => {
  it("refuses a caller with no session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await PATCH(patch({ reason: "duplicate" }), params());

    expect(response.status).toBe(401);
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it("refuses a signed-in caller who is not a platform administrator", async () => {
    // A coordinator is signed in and has a village; this list is every village
    // and the people in it are nobody's residents. `ADMIN_EMAILS` is the gate.
    mocks.isPlatformAdmin.mockReturnValue(false);

    const response = await PATCH(patch({ reason: "duplicate" }), params());

    expect(response.status).toBe(403);
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it("checks the session before it looks at the body", async () => {
    mocks.getSession.mockResolvedValue(null);

    // A malformed body from an unauthenticated caller must still be a 401: a
    // 422 describing the reason field would confirm the route exists and say
    // what it takes.
    const response = await PATCH(patch({ nonsense: true }), params());

    expect(response.status).toBe(401);
  });
});

describe("archiving", () => {
  it("passes the resolved reason through", async () => {
    const response = await PATCH(patch({ reason: "village-launched" }), params());

    expect(response.status).toBe(200);
    expect(mocks.archive).toHaveBeenCalledWith({
      id: ID,
      reason: "village-launched",
    });
  });

  it("stores the sentence for 'other' rather than the word", async () => {
    await PATCH(
      patch({ reason: "other", detail: "Moved away." }),
      params(),
    );

    expect(mocks.archive).toHaveBeenCalledWith({
      id: ID,
      reason: "Moved away.",
    });
  });

  it("refuses a body with no reason", async () => {
    const response = await PATCH(patch({}), params());

    // The one state the column exists to prevent.
    expect(response.status).toBe(422);
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it("refuses 'other' with nothing typed", async () => {
    const response = await PATCH(patch({ reason: "other" }), params());

    expect(response.status).toBe(422);
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it("turns a refusal into a 409 rather than a 500", async () => {
    mocks.archive.mockResolvedValue({
      ok: false,
      error: "That one is already archived.",
    });

    const response = await PATCH(patch({ reason: "duplicate" }), params());

    // Already archived is a stale tab, not a fault. A 500 would say the server
    // broke when it did exactly what it should.
    expect(response.status).toBe(409);
  });

  it("refuses an id that is not a uuid before it reaches a query", async () => {
    // Prisma answers a malformed uuid with a `P2023` that reaches the caller as
    // a 500 — a validation failure wearing a server error.
    const response = await PATCH(patch({ reason: "duplicate" }), params("nope"));

    expect(response.status).toBe(400);
    expect(mocks.archive).not.toHaveBeenCalled();
  });
});

describe("restoring", () => {
  it("takes the restore branch and asks for no reason", async () => {
    const response = await PATCH(patch({ restore: true }), params());

    expect(response.status).toBe(200);
    expect(mocks.restore).toHaveBeenCalledWith(ID);
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it("is still behind the same gate", async () => {
    mocks.isPlatformAdmin.mockReturnValue(false);

    const response = await PATCH(patch({ restore: true }), params());

    expect(response.status).toBe(403);
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it("does not read `restore: false` as a restore", async () => {
    // The literal matters: `{ restore: false }` is not a restore *and* is not a
    // valid archive, so it should be refused rather than quietly taking either
    // branch.
    const response = await PATCH(patch({ restore: false }), params());

    expect(response.status).toBe(422);
    expect(mocks.restore).not.toHaveBeenCalled();
    expect(mocks.archive).not.toHaveBeenCalled();
  });
});
