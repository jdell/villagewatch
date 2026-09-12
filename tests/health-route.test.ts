import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /api/health`, the endpoint an uptime monitor polls.
 *
 * This is the fourth route handler in the suite and it earns the exception the
 * way the other three do: it needs no secret and no database once Prisma is
 * mocked at its boundary, and the regression it catches is invisible from every
 * screen in the app — by construction, since nothing in the app renders it.
 *
 * What it pins is the one property the endpoint exists for: **the status code
 * follows the database.** A health check that answers 200 while Postgres is
 * unreachable is worse than no health check, because a monitor is built on it
 * and somebody stops watching. The body's `"status": "degraded"` is not enough
 * on its own — most monitors are configured on the code alone, which is exactly
 * the silent-failure shape this codebase keeps finding.
 *
 * The second property is that a failure says nothing about *why* beyond a
 * constant. This route is unauthenticated, and a Prisma connection error's
 * message can carry the connection string.
 */

const queryRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: queryRaw },
}));

const { GET } = await import("@/app/api/health/route");

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.2.0");
  queryRaw.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("answers 200 with the version when the database replies", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.database).toBe("ok");
    expect(body.version).toBe("1.2.0");
  });

  it("answers 503 when the database does not", async () => {
    // The assertion the endpoint exists for. A 200 here is the failure mode:
    // a green dashboard over an application that cannot serve a page.
    queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.database).toBe("failed");
  });

  it("says nothing about why the database failed", async () => {
    // Unauthenticated endpoint, and a Prisma connection error can quote the
    // connection string. The cause goes to the log; the caller gets a sentence.
    queryRaw.mockRejectedValue(
      new Error("Can't reach database server at postgres://user:hunter2@db:5432"),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const body = await (await GET()).json();
    const serialised = JSON.stringify(body);

    expect(serialised).not.toContain("hunter2");
    expect(serialised).not.toContain("postgres://");
    // ...and the operator still gets the whole thing.
    expect(log).toHaveBeenCalled();
  });

  it("tells an unconfigured deployment apart from a broken one", async () => {
    // A fresh clone with no `DATABASE_URL` is a supported state — it is what
    // lets the suite, the lint and the build run with no environment at all —
    // and reporting it as an outage would page somebody over a laptop.
    vi.stubEnv("DATABASE_URL", "");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checks.database).toBe("not_configured");
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("says the version is unknown rather than inventing one", async () => {
    // `next.config.ts` fills this from `package.json` and falls back to an
    // empty string. "0.0.0" in that slot is a plausible-looking lie — a
    // deployment reporting a real-looking version it is not running is worse
    // than one admitting it does not know.
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "");
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const body = await (await GET()).json();

    expect(body.version).toBe("unknown");
  });
});
