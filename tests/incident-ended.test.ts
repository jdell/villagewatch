import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth";

/**
 * `markIncidentOver` — "It's over now". Who may press it (the reporter, or a
 * coordinator of the village), what it may be pressed on (published or queued,
 * inside the live window, not already ended), that every one of those is in
 * the write's own `where`, and that it is audited once and only when it wrote.
 *
 * Prisma is mocked at its module boundary — no database, no secret.
 */

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    incident: { findFirst: mocks.findFirst, updateMany: mocks.updateMany },
    auditLog: { create: mocks.auditCreate },
  },
}));

vi.mock("@/lib/audit-context", () => ({
  auditContext: async () => ({ ipAddress: null, userAgent: null }),
}));

const { markIncidentOver, readIncidentEndedAt } = await import(
  "@/lib/incident-ended"
);

const USER = "user-1";
const VILLAGE = "village-1";
const INCIDENT = "7b0f8a52-5c5e-4b8a-9d3e-2f1c6a4b9e10";
const NOW = new Date(Date.UTC(2026, 9, 3, 12, 0, 0));

function session(role = "RESIDENT", villageId: string | null = VILLAGE) {
  return {
    user: { id: USER, email: "resident@example.test" },
    profile: villageId ? { role, villageId } : null,
  } as unknown as Session;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirst.mockResolvedValue({
    endedAt: null,
    occurredAt: new Date(NOW.getTime() - 30 * 60 * 1000),
  });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.auditCreate.mockResolvedValue({});
});

describe("who may mark it over", () => {
  it("scopes a resident to their own report in their village", async () => {
    await markIncidentOver({ session: session(), incidentId: INCIDENT, now: NOW });

    expect(mocks.findFirst.mock.calls[0][0].where).toEqual({
      id: INCIDENT,
      villageId: VILLAGE,
      status: { in: ["PUBLISHED", "PENDING_REVIEW"] },
      reporterId: USER,
    });
  });

  it("drops the ownership clause for a coordinator, and nothing else", async () => {
    await markIncidentOver({
      session: session("COORDINATOR"),
      incidentId: INCIDENT,
      now: NOW,
    });

    const where = mocks.findFirst.mock.calls[0][0].where;
    expect(where).not.toHaveProperty("reporterId");
    expect(where.villageId).toBe(VILLAGE);
  });

  it("refuses somebody with no village before reading anything", async () => {
    const result = await markIncidentOver({
      session: session("RESIDENT", null),
      incidentId: INCIDENT,
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, code: "no_village" });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("answers a report it cannot see as not found, and writes nothing", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const result = await markIncidentOver({
      session: session(),
      incidentId: INCIDENT,
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});

describe("the write", () => {
  it("guards ownership, status, not-yet-ended and the window in its own where", async () => {
    await markIncidentOver({ session: session(), incidentId: INCIDENT, now: NOW });

    const { where, data } = mocks.updateMany.mock.calls[0][0];
    expect(where).toMatchObject({
      id: INCIDENT,
      villageId: VILLAGE,
      reporterId: USER,
      status: { in: ["PUBLISHED", "PENDING_REVIEW"] },
      endedAt: null,
    });
    expect(where.occurredAt.gt).toEqual(new Date(NOW.getTime() - 3 * 60 * 60 * 1000));
    expect(data).toEqual({ endedAt: NOW });
  });

  it("is a no-op on a report already over — no write, no audit row", async () => {
    mocks.findFirst.mockResolvedValue({ endedAt: NOW, occurredAt: NOW });

    const result = await markIncidentOver({
      session: session(),
      incidentId: INCIDENT,
      now: NOW,
    });

    expect(result).toEqual({ ok: true, changed: false });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("writes no audit row when the guarded write matched nothing", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const result = await markIncidentOver({
      session: session(),
      incidentId: INCIDENT,
      now: NOW,
    });

    expect(result).toEqual({ ok: true, changed: false });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("audits incident.ended with which hat was worn", async () => {
    await markIncidentOver({
      session: session("COORDINATOR"),
      incidentId: INCIDENT,
      now: NOW,
    });

    const { data } = mocks.auditCreate.mock.calls[0][0];
    expect(data).toMatchObject({
      action: "incident.ended",
      entityType: "Incident",
      entityId: INCIDENT,
      villageId: VILLAGE,
      before: { endedAt: null },
      after: { endedAt: NOW.toISOString(), byCoordinator: true },
    });
  });
});

describe("readIncidentEndedAt", () => {
  it("degrades to null when the column is not there yet", async () => {
    mocks.findFirst.mockRejectedValue(new Error('column "ended_at" does not exist'));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(readIncidentEndedAt(INCIDENT, VILLAGE)).resolves.toBeNull();
    warn.mockRestore();
  });

  it("is village-scoped", async () => {
    mocks.findFirst.mockResolvedValue({ endedAt: NOW });

    await expect(readIncidentEndedAt(INCIDENT, VILLAGE)).resolves.toEqual(NOW);
    expect(mocks.findFirst.mock.calls[0][0].where).toEqual({
      id: INCIDENT,
      villageId: VILLAGE,
    });
  });
});
