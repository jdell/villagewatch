import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST /api/incidents/[id]/vote` — the second route handler in this suite, and
 * it earns the exception the way `retention.test.ts` does: it needs no secret
 * once Prisma and the session are mocked at their boundaries, and what it
 * enforces is invisible from every screen in the app.
 *
 * Four of the assertions here are the domain rules, which is the whole reason
 * this file exists rather than `votes.test.ts` covering the arithmetic alone:
 *
 *   * **the village is the tenant boundary** (domain rule 4) and comes off the
 *     session, never off the request — a report in another village is a 404 and
 *     not a 403, because a 403 confirms that a report with that id exists;
 *   * **only what residents can already see** (domain rule 6) — a report in the
 *     moderation queue cannot be voted on, so nobody pushes something up a
 *     coordinator's ordering before the coordinator has decided it should
 *     exist;
 *   * **the toggle writes what `nextVote` says** — create, update or delete —
 *     and the delete path is a `deleteMany`, so a row that vanished between the
 *     read and the write is the outcome asked for rather than a P2025;
 *   * **the response is the server's count**, re-read from the database, which
 *     is what stops one browser's optimistic guess being confirmed back to it
 *     while a neighbour is voting on the same report.
 *
 * The rate limiter is left real and its Postgres counter is mocked, the way
 * `rate-limit.test.ts` does it, so "one change per report per ten seconds"
 * is exercised against the key the SQL actually uses — and so is the thing that
 * makes the rule usable at all: the window is per *incident*, so voting on the
 * second report in a list is not refused because you voted on the first.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  groupBy: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    incident: { findFirst: mocks.findFirst },
    incidentVote: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
      deleteMany: mocks.deleteMany,
      groupBy: mocks.groupBy,
    },
    $queryRaw: mocks.queryRaw,
  },
}));

const { NextRequest } = await import("next/server");
const { POST } = await import("@/app/api/incidents/[id]/vote/route");

const INCIDENT_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";
const VILLAGE_ID = "33333333-3333-3333-3333-333333333333";

/** `(userId, action, windowStart)` → count, which is what the index is. */
const counters = new Map<string, number>();

function session(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: USER_ID, email: "sam@example.test" },
    profile: { villageId: VILLAGE_ID, role: "RESIDENT" },
    ...overrides,
  };
}

function post(vote: unknown, id = INCIDENT_ID) {
  const request = new NextRequest(
    `http://localhost/api/incidents/${id}/vote`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vote }),
    },
  );

  return POST(request, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  counters.clear();
  vi.stubEnv("DATABASE_URL", "postgres://test");

  for (const mock of Object.values(mocks)) mock.mockReset();

  mocks.getSession.mockResolvedValue(session());
  mocks.findFirst.mockResolvedValue({ id: INCIDENT_ID });
  mocks.findUnique.mockResolvedValue(null);
  mocks.upsert.mockResolvedValue({});
  mocks.deleteMany.mockResolvedValue({ count: 1 });
  mocks.groupBy.mockResolvedValue([
    { incidentId: INCIDENT_ID, vote: "UP", _count: { _all: 1 } },
  ]);

  mocks.queryRaw.mockImplementation(
    (
      _strings: TemplateStringsArray,
      subject: string,
      action: string,
      windowStart: Date,
    ) => {
      const key = `${subject}|${action}|${windowStart.getTime()}`;
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return Promise.resolve([{ count }]);
    },
  );
});

describe("who may vote", () => {
  it("refuses a signed-out caller", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await post("up");

    expect(response.status).toBe(401);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("refuses a session with no village, and does not say why", async () => {
    // A profile-less session is a Google sign-up part-way through `/welcome`.
    // The answer is the same 404 a report in somebody else's village gets —
    // there is nothing this account can see either way.
    mocks.getSession.mockResolvedValue(session({ profile: null }));

    const response = await post("up");

    expect(response.status).toBe(404);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});

describe("what may be voted on", () => {
  it("scopes the lookup to the session's village and the public statuses", async () => {
    await post("up");

    const where = mocks.findFirst.mock.calls[0]?.[0].where;

    // Domain rule 4: off the session, never off the request.
    expect(where.villageId).toBe(VILLAGE_ID);
    // Domain rule 6: the queue is not votable.
    expect(where.status.in).toEqual(["PUBLISHED", "RESOLVED"]);
    expect(where.id).toBe(INCIDENT_ID);
  });

  it("answers 404 — not 403 — for a report it cannot see", async () => {
    // Covers another village's report, a queued one and an erased one alike:
    // the predicate above excludes all three, and a 403 would confirm that a
    // report with that id exists somewhere.
    mocks.findFirst.mockResolvedValue(null);

    const response = await post("up");

    expect(response.status).toBe(404);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("spends no quota on a report the caller cannot see", async () => {
    // A stale page must not cost somebody their ten-second window on the
    // reports they *can* vote on.
    mocks.findFirst.mockResolvedValue(null);
    await post("up");

    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
});

describe("the body", () => {
  it("refuses a vote that is not one of the two values", async () => {
    for (const junk of ["UP", "sideways", "", 1, null]) {
      const response = await post(junk);
      expect(response.status).toBe(422);
    }

    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON at all", async () => {
    const request = new NextRequest(
      `http://localhost/api/incidents/${INCIDENT_ID}/vote`,
      { method: "POST", body: "not json" },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: INCIDENT_ID }),
    });

    expect(response.status).toBe(400);
  });

  it("spends no quota on a malformed body", async () => {
    // Counted after the body validates, everywhere in this codebase: a
    // client-side bug must not be able to spend a resident's window without a
    // single row being written.
    await post("sideways");

    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
});

describe("the toggle", () => {
  it("creates a vote where the resident had none", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const response = await post("up");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0]?.[0].create).toMatchObject({
      incidentId: INCIDENT_ID,
      userId: USER_ID,
      vote: "UP",
    });
    expect(body.myVote).toBe("up");
  });

  it("moves a vote across rather than adding a second", async () => {
    mocks.findUnique.mockResolvedValue({ vote: "UP" });

    await post("down");

    // One statement, against the unique key — a read-then-write pair could
    // leave a resident holding two opinions.
    expect(mocks.upsert.mock.calls[0]?.[0].where).toEqual({
      incidentId_userId: { incidentId: INCIDENT_ID, userId: USER_ID },
    });
    expect(mocks.upsert.mock.calls[0]?.[0].update).toEqual({ vote: "DOWN" });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("removes the vote when the same button is pressed again", async () => {
    mocks.findUnique.mockResolvedValue({ vote: "DOWN" });
    mocks.groupBy.mockResolvedValue([]);

    const response = await post("down");
    const body = await response.json();

    expect(mocks.upsert).not.toHaveBeenCalled();
    // `deleteMany`, so a row that has gone between the read and the write is
    // the outcome asked for rather than a P2025.
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { incidentId: INCIDENT_ID, userId: USER_ID },
    });
    expect(body.myVote).toBeNull();
  });
});

describe("what comes back", () => {
  it("is the village's count, re-read, rather than the caller's guess", async () => {
    mocks.groupBy.mockResolvedValue([
      { incidentId: INCIDENT_ID, vote: "UP", _count: { _all: 7 } },
      { incidentId: INCIDENT_ID, vote: "DOWN", _count: { _all: 2 } },
    ]);

    const body = await (await post("up")).json();

    expect(body).toMatchObject({ ok: true, up: 7, down: 2, score: 5 });
  });

  it("names nobody", async () => {
    const body = await (await post("up")).json();

    // `myVote` is the reader's own. There is no field here — and no query
    // anywhere in the app — that answers "who voted on this".
    expect(Object.keys(body).sort()).toEqual([
      "down",
      "myVote",
      "ok",
      "score",
      "up",
    ]);
  });

  it("reports a write failure rather than throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.upsert.mockRejectedValue(new Error("connection reset"));

    const response = await post("up");

    expect(response.status).toBe(503);
    error.mockRestore();
  });
});

describe("the rate limit", () => {
  it("refuses a second change on the same report inside the window", async () => {
    expect((await post("up")).status).toBe(200);

    const second = await post("down");
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
  });

  it("is scoped to one report, not to the resident", async () => {
    // The reason the rule name carries the incident id. A per-resident window
    // would refuse a vote on the second report in a list because you had just
    // voted on the first, which is how somebody reads a page of them.
    const other = "44444444-4444-4444-4444-444444444444";
    mocks.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id }),
    );

    expect((await post("up")).status).toBe(200);
    expect((await post("up", other)).status).toBe(200);
  });
});
