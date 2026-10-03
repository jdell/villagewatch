import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth";
import { incidentPoliceReferenceSchema } from "@/lib/validations";

/**
 * `setIncidentPoliceReference` — the one column on a published report that can
 * still change after the village has been alerted to it.
 *
 * What is asserted is who may write it (the reporter, or a coordinator of the
 * village, and nobody else), what it may be written on (published and resolved
 * reports in the caller's own village — domain rules 4 and 6), that the guard
 * sits in the write's own `where` and not only in the read before it, and the
 * audit row. The wording of messages is deliberately not asserted, for the
 * reason `compliance-documents.test.ts` gives.
 *
 * Prisma is mocked at its module boundary, so this needs no database and no
 * secret.
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

const { setIncidentPoliceReference } = await import("@/lib/police-reference");

const USER = "user-1";
const VILLAGE = "village-1";
const INCIDENT = "7b0f8a52-5c5e-4b8a-9d3e-2f1c6a4b9e10";

function session(role = "RESIDENT", villageId: string | null = VILLAGE) {
  return {
    user: { id: USER, email: "resident@example.test" },
    profile: villageId ? { role, villageId } : null,
  } as unknown as Session;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirst.mockResolvedValue({
    policeReference: null,
    reportedToPolice: false,
  });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.auditCreate.mockResolvedValue({});
});

describe("who may set it", () => {
  it("scopes a resident to their own report, in their village, on the map", async () => {
    await setIncidentPoliceReference({
      session: session("RESIDENT"),
      incidentId: INCIDENT,
      policeReference: "CC-1",
    });

    const where = mocks.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({
      id: INCIDENT,
      villageId: VILLAGE,
      status: { in: ["PUBLISHED", "RESOLVED"] },
      reporterId: USER,
    });
  });

  it("lets a coordinator set it on anybody's report in their village", async () => {
    await setIncidentPoliceReference({
      session: session("COORDINATOR"),
      incidentId: INCIDENT,
      policeReference: "CC-1",
    });

    const where = mocks.findFirst.mock.calls[0][0].where;
    expect(where).not.toHaveProperty("reporterId");
    expect(where.villageId).toBe(VILLAGE);
    expect(where.status).toEqual({ in: ["PUBLISHED", "RESOLVED"] });
  });

  it("puts the same guard on the write, not only on the read", async () => {
    await setIncidentPoliceReference({
      session: session("RESIDENT"),
      incidentId: INCIDENT,
      policeReference: "CC-1",
    });

    expect(mocks.updateMany.mock.calls[0][0].where).toEqual(
      mocks.findFirst.mock.calls[0][0].where,
    );
  });

  it("refuses with no village, before reading anything", async () => {
    const result = await setIncidentPoliceReference({
      session: session("COORDINATOR", null),
      incidentId: INCIDENT,
      policeReference: "CC-1",
    });

    expect(result).toMatchObject({ ok: false, code: "no_village" });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("answers not_found for a report the predicate does not match, and writes nothing", async () => {
    // Somebody else's report, another village's, or one still in the queue —
    // the predicate excludes all three and they share one answer.
    mocks.findFirst.mockResolvedValue(null);

    const result = await setIncidentPoliceReference({
      session: session("RESIDENT"),
      incidentId: INCIDENT,
      policeReference: "CC-1",
    });

    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("answers not_found when the report moved between the read and the write", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const result = await setIncidentPoliceReference({
      session: session("RESIDENT"),
      incidentId: INCIDENT,
      policeReference: "CC-1",
    });

    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});

describe("what it writes", () => {
  it("sets reportedToPolice with a reference", async () => {
    await setIncidentPoliceReference({
      session: session("RESIDENT"),
      incidentId: INCIDENT,
      policeReference: "CC-1",
    });

    expect(mocks.updateMany.mock.calls[0][0].data).toEqual({
      policeReference: "CC-1",
      reportedToPolice: true,
    });
  });

  it("removes a reference without claiming the police were never told", async () => {
    mocks.findFirst.mockResolvedValue({
      policeReference: "CC-1",
      reportedToPolice: true,
    });

    await setIncidentPoliceReference({
      session: session("RESIDENT"),
      incidentId: INCIDENT,
      policeReference: null,
    });

    expect(mocks.updateMany.mock.calls[0][0].data).toEqual({
      policeReference: null,
    });
  });

  it("writes nothing and audits nothing when the value has not changed", async () => {
    mocks.findFirst.mockResolvedValue({
      policeReference: "CC-1",
      reportedToPolice: true,
    });

    const result = await setIncidentPoliceReference({
      session: session("RESIDENT"),
      incidentId: INCIDENT,
      policeReference: "CC-1",
    });

    expect(result).toEqual({ ok: true, changed: false, policeReference: "CC-1" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("audits the change with both values and which hat was worn", async () => {
    mocks.findFirst.mockResolvedValue({
      policeReference: "CC-OLD",
      reportedToPolice: true,
    });

    await setIncidentPoliceReference({
      session: session("COORDINATOR"),
      incidentId: INCIDENT,
      policeReference: "CC-NEW",
    });

    const data = mocks.auditCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      actorId: USER,
      villageId: VILLAGE,
      action: "incident.crime_reference_updated",
      entityType: "Incident",
      entityId: INCIDENT,
      before: { policeReference: "CC-OLD" },
      after: { policeReference: "CC-NEW", byCoordinator: true },
    });
  });
});

describe("incidentPoliceReferenceSchema", () => {
  it("trims, and turns blank into null rather than an empty string", () => {
    expect(
      incidentPoliceReferenceSchema.parse({
        incidentId: INCIDENT,
        policeReference: "  CC-1  ",
      }).policeReference,
    ).toBe("CC-1");
    expect(
      incidentPoliceReferenceSchema.parse({
        incidentId: INCIDENT,
        policeReference: "   ",
      }).policeReference,
    ).toBeNull();
  });

  it("holds the wizard's 60-character ceiling and refuses a malformed id", () => {
    expect(
      incidentPoliceReferenceSchema.safeParse({
        incidentId: INCIDENT,
        policeReference: "x".repeat(61),
      }).success,
    ).toBe(false);
    expect(
      incidentPoliceReferenceSchema.safeParse({
        incidentId: "default-icon",
        policeReference: "CC-1",
      }).success,
    ).toBe(false);
  });
});
