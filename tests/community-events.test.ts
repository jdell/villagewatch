import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { LOCATION_FUZZ_METERS } from "@/lib/constants";
import { distanceMeters } from "@/lib/geo";

/**
 * Community events — `POST /api/events`, and the pure rules beside it.
 *
 * The route is the sixth handler in the suite, and it is here for the same
 * reason the others are: `src/proxy.ts` passes `/api/` straight through, so the
 * handler is the whole gate. Prisma, the session, the two village reads and the
 * limiter are mocked at their boundaries; the geo module is left **real**, so
 * "the pin is fuzzed" is asserted against a real displacement rather than a
 * stub told to return a different number.
 *
 * What is pinned, in the order it would hurt:
 *
 *   * **The village and the poster come off the session** (domain rules 4 and
 *     5), whatever the body says.
 *   * **The point stored is not the point tapped** (domain rule 2), and is
 *     within the fuzz radius of it.
 *   * **The two village gates refuse before the body is parsed and before a
 *     rate-limit slot is spent.**
 */

const VILLAGE = "11111111-1111-4111-8111-111111111111";
const OTHER_VILLAGE = "99999999-9999-4999-8999-999999999999";
const RESIDENT = "44444444-4444-4444-8444-444444444444";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  eventsEnabled: vi.fn(),
  serviceState: vi.fn(),
  create: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/events", () => ({ getVillageEventsEnabled: mocks.eventsEnabled }));
vi.mock("@/lib/villages", () => ({ getVillageServiceState: mocks.serviceState }));
vi.mock("@/lib/prisma", () => ({
  prisma: { communityEvent: { create: mocks.create } },
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, rateLimit: mocks.rateLimit };
});

const { POST } = await import("@/app/api/events/route");

const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

function request(body: unknown): NextRequest {
  return new Request("https://villagewatch.example/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

/** `valid()` without the named fields — a payload missing them entirely. */
function without(...keys: string[]): Record<string, unknown> {
  const body: Record<string, unknown> = valid();
  for (const key of keys) delete body[key];
  return body;
}

const valid = () => ({
  title: "Litter pick on the rec",
  category: "Community clean-up",
  description: "Bags and gloves provided.",
  locationText: "The recreation ground",
  lat: 52.2534,
  lng: 0.0997,
  startsAt: inAnHour(),
});

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://test";
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getSession.mockResolvedValue({
    user: { id: RESIDENT, email: "resident@example.test" },
    profile: { villageId: VILLAGE, role: "RESIDENT", deletedAt: null },
  });
  mocks.eventsEnabled.mockResolvedValue(true);
  mocks.serviceState.mockResolvedValue({ inService: true, status: "ACTIVE" });
  mocks.rateLimit.mockResolvedValue({ ok: true, remaining: 9 });
  mocks.create.mockResolvedValue({ id: "event-1" });
});

describe("POST /api/events — who may post", () => {
  it("refuses a signed-out caller", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(request(valid()))).status).toBe(401);
  });

  it("refuses an account with no village", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: RESIDENT },
      profile: { villageId: null, role: "RESIDENT", deletedAt: null },
    });
    expect((await POST(request(valid()))).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses when the village has events off — before the body or the quota", async () => {
    mocks.eventsEnabled.mockResolvedValue(false);

    const response = await POST(request("not even json"));

    expect(response.status).toBe(403);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses a suspended village with its own sentence", async () => {
    mocks.serviceState.mockResolvedValue({
      inService: false,
      status: "SUSPENDED",
      message: "This village has been suspended.",
    });

    const response = await POST(request(valid()));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("This village has been suspended.");
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
});

describe("POST /api/events — the body", () => {
  it("rejects malformed JSON as a 400", async () => {
    expect((await POST(request("{"))).status).toBe(400);
  });

  it("rejects an invalid event without spending a slot", async () => {
    const response = await POST(request({ ...valid(), title: "" }));

    expect(response.status).toBe(422);
    expect((await response.json()).fieldErrors.title).toBeTruthy();
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });

  it("rejects half a coordinate pair", async () => {
    expect((await POST(request(without("lng")))).status).toBe(422);
  });

  it("rejects an end before the start", async () => {
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const response = await POST(
      request({
        ...valid(),
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() - 60_000).toISOString(),
      }),
    );
    expect(response.status).toBe(422);
  });

  it("rejects a start well in the past", async () => {
    const response = await POST(
      request({
        ...valid(),
        startsAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    );

    expect(response.status).toBe(422);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });

  it("answers 429 when the quota is spent, and writes nothing", async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 600 });

    const response = await POST(request(valid()));

    expect(response.status).toBe(429);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/events — what is written", () => {
  it("takes the village and the poster from the session, never the body", async () => {
    const response = await POST(
      request({ ...valid(), villageId: OTHER_VILLAGE, createdById: "someone-else" }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "event-1" });

    const { data } = mocks.create.mock.calls[0][0];
    expect(data.villageId).toBe(VILLAGE);
    expect(data.createdById).toBe(RESIDENT);
  });

  it("stores a fuzzed point, within the fuzz radius of the one tapped", async () => {
    await POST(request(valid()));

    const { data } = mocks.create.mock.calls[0][0];
    const moved = distanceMeters(
      { lat: 52.2534, lng: 0.0997 },
      { lat: data.lat, lng: data.lng },
    );

    expect(data.lat === 52.2534 && data.lng === 0.0997).toBe(false);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(LOCATION_FUZZ_METERS + 1);
  });

  it("stores no point at all when none was given", async () => {
    await POST(request(without("lat", "lng")));

    const { data } = mocks.create.mock.calls[0][0];
    expect(data.lat).toBeNull();
    expect(data.lng).toBeNull();
  });

  it("stores blank optional text as null rather than an empty string", async () => {
    await POST(request({ ...valid(), description: "   ", locationText: "" }));

    const { data } = mocks.create.mock.calls[0][0];
    expect(data.description).toBeNull();
    expect(data.locationText).toBeNull();
  });

  it("answers a failed write with a 500 and a sentence", async () => {
    mocks.create.mockRejectedValue(new Error("connection reset"));

    const response = await POST(request(valid()));

    expect(response.status).toBe(500);
    expect((await response.json()).error).not.toContain("connection reset");
  });
});

describe("eventWindowError", () => {
  it("allows a day of grace behind and a year ahead, and nothing beyond", async () => {
    const { eventWindowError } = await import("@/lib/validations");
    const now = new Date("2026-10-01T12:00:00Z");
    const hours = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);

    expect(eventWindowError(hours(-1), now)).toBeNull();
    expect(eventWindowError(hours(-23), now)).toBeNull();
    expect(eventWindowError(hours(-25), now)).not.toBeNull();
    expect(eventWindowError(hours(24 * 365), now)).toBeNull();
    expect(eventWindowError(hours(24 * 400), now)).not.toBeNull();
  });
});

describe("canDeleteEvent", () => {
  it("lets the poster and a coordinator delete, and nobody else", async () => {
    vi.doMock("@/lib/audit-context", () => ({ auditContext: vi.fn() }));
    const { canDeleteEvent } = await vi.importActual<typeof import("@/lib/events")>(
      "@/lib/events",
    );
    const event = { createdById: RESIDENT };
    const as = (id: string, role: string) =>
      ({ user: { id }, profile: { role } }) as unknown as Parameters<
        typeof canDeleteEvent
      >[0];

    expect(canDeleteEvent(as(RESIDENT, "RESIDENT"), event)).toBe(true);
    expect(canDeleteEvent(as("neighbour", "COORDINATOR"), event)).toBe(true);
    expect(canDeleteEvent(as("neighbour", "VERIFIED_RESIDENT"), event)).toBe(false);
  });
});

describe("formatEventWhen", () => {
  it("names the day once for a same-day event, in London time", async () => {
    const { formatEventWhen } = await import("@/lib/format");

    // 09:00–11:00 UTC in October is 10:00–12:00 British Summer Time.
    expect(
      formatEventWhen("2026-10-03T09:00:00Z", "2026-10-03T11:00:00Z"),
    ).toBe("Sat, 3 Oct 2026, 10:00–12:00");
  });

  it("names both days for an event that runs past midnight", async () => {
    const { formatEventWhen } = await import("@/lib/format");

    expect(
      formatEventWhen("2026-10-03T18:00:00Z", "2026-10-04T08:00:00Z"),
    ).toBe("Sat, 3 Oct 2026, 19:00 – Sun, 4 Oct 2026, 09:00");
  });

  it("gives the start alone when there is no end", async () => {
    const { formatEventWhen } = await import("@/lib/format");

    expect(formatEventWhen("2026-10-03T09:00:00Z")).toBe("Sat, 3 Oct 2026, 10:00");
  });
});
