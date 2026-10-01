import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth";

/**
 * Resolving a report, through `applyModeration` — the one path both the
 * detail page's Resolve panel and the older moderation action reach.
 *
 * Prisma, the audit context and the dispatches are mocked at their module
 * boundaries; what is left is the module's own decisions, and those are what
 * is asserted:
 *
 *   * **No note, no resolution.** The note is shown to the village and sent to
 *     the reporter and every voter; an empty one is refused before anything is
 *     read, whichever action delivered it.
 *   * **Published only, and only in the caller's village.** The read and the
 *     write both carry `villageId` (domain rule 4), and the write is
 *     conditional on the status just read, so a second press updates nothing.
 *   * **Its own column.** The note goes to `resolutionNote`, and the note the
 *     reporter was given at publication is left alone.
 *   * **Three audiences, and not the village.** The reporter's push and email,
 *     and the voters' push — never the publish broadcast.
 */

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  auditCreate: vi.fn(),
  notifyIncidentPublished: vi.fn(),
  emailIncidentPublished: vi.fn(),
  notifyReporterOfDecision: vi.fn(),
  notifyReporterOfResolution: vi.fn(),
  emailReporterOfResolution: vi.fn(),
  notifyVotersOfResolution: vi.fn(),
  notifySlack: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    incident: { findFirst: mocks.findFirst, updateMany: mocks.updateMany },
    auditLog: { create: mocks.auditCreate },
  },
}));

vi.mock("@/lib/audit-context", () => ({
  auditContext: async () => ({ ipAddress: "203.0.113.7", userAgent: "test" }),
}));

vi.mock("@/lib/notifications", () => ({
  notifyIncidentPublished: mocks.notifyIncidentPublished,
  emailIncidentPublished: mocks.emailIncidentPublished,
  notifyReporterOfDecision: mocks.notifyReporterOfDecision,
  notifyReporterOfResolution: mocks.notifyReporterOfResolution,
  emailReporterOfResolution: mocks.emailReporterOfResolution,
  notifyVotersOfResolution: mocks.notifyVotersOfResolution,
}));

vi.mock("@/lib/slack", () => ({ notifySlack: mocks.notifySlack }));

const { applyModeration } = await import("@/lib/moderation");

const VILLAGE = "11111111-1111-4111-8111-111111111111";
const INCIDENT = "22222222-2222-4222-8222-222222222222";
const COORDINATOR = "33333333-3333-4333-8333-333333333333";
const REPORTER = "44444444-4444-4444-8444-444444444444";

const session = {
  user: { id: COORDINATOR, email: "coordinator@example.test" },
  profile: { role: "COORDINATOR", villageId: VILLAGE },
} as unknown as Session;

function row(status: string) {
  return {
    id: INCIDENT,
    reference: "VW-HIS-2026-0007",
    status,
    severity: "MEDIUM",
    type: "VANDALISM",
    title: "Bus shelter glass smashed",
    description: "The glass in the shelter was broken overnight.",
    recurring: false,
    patternNote: null,
    locationText: "Station Road",
    lat: 52.25,
    lng: 0.1,
    occurredAt: new Date("2026-09-20T22:00:00Z"),
    reporterId: REPORTER,
    village: { name: "Histon" },
  };
}

const resolve = (note?: string) =>
  applyModeration({
    session,
    villageId: VILLAGE,
    incidentId: INCIDENT,
    action: "RESOLVE",
    note,
  });

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://test";
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.findFirst.mockResolvedValue(row("PUBLISHED"));
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.auditCreate.mockResolvedValue({});
  mocks.notifyReporterOfResolution.mockResolvedValue({ matched: 1, sent: 1 });
  mocks.emailReporterOfResolution.mockResolvedValue({ sent: true });
  mocks.notifyVotersOfResolution.mockResolvedValue({ matched: 4, sent: 3 });
});

describe("the note", () => {
  it.each([undefined, "", "   \n  "])(
    "refuses %j before reading anything",
    async (note) => {
      const result = await resolve(note);

      expect(result.ok).toBe(false);
      expect(mocks.findFirst).not.toHaveBeenCalled();
      expect(mocks.updateMany).not.toHaveBeenCalled();
      expect(mocks.auditCreate).not.toHaveBeenCalled();
    },
  );

  it("is written trimmed to its own column, leaving the publication note alone", async () => {
    await resolve("  Police attended and the glass was replaced.  ");

    const { data } = mocks.updateMany.mock.calls[0][0];
    expect(data.status).toBe("RESOLVED");
    expect(data.resolutionNote).toBe("Police attended and the glass was replaced.");
    expect(data.resolvedAt).toBeInstanceOf(Date);
    expect(data.moderatedById).toBe(COORDINATOR);
    // `undefined` is Prisma for "do not touch this column".
    expect(data.moderationNote).toBeUndefined();
  });

  it("is not written by any other action", async () => {
    mocks.findFirst.mockResolvedValue(row("PUBLISHED"));
    await applyModeration({
      session,
      villageId: VILLAGE,
      incidentId: INCIDENT,
      action: "ARCHIVE",
      note: "Duplicate",
    });

    const { data } = mocks.updateMany.mock.calls[0][0];
    expect(data.resolutionNote).toBeUndefined();
    expect(data.moderationNote).toBe("Duplicate");
  });
});

describe("the guard", () => {
  it.each(["PENDING_REVIEW", "DRAFT", "REJECTED", "RESOLVED", "ARCHIVED"])(
    "refuses a %s report without writing anything",
    async (status) => {
      mocks.findFirst.mockResolvedValue(row(status));

      const result = await resolve("Police attended.");

      expect(result.ok).toBe(false);
      expect(mocks.updateMany).not.toHaveBeenCalled();
      expect(mocks.auditCreate).not.toHaveBeenCalled();
      expect(mocks.notifyVotersOfResolution).not.toHaveBeenCalled();
    },
  );

  it("scopes the read and the write to the caller's village", async () => {
    await resolve("Police attended.");

    expect(mocks.findFirst.mock.calls[0][0].where).toMatchObject({
      id: INCIDENT,
      villageId: VILLAGE,
    });
    expect(mocks.updateMany.mock.calls[0][0].where).toEqual({
      id: INCIDENT,
      villageId: VILLAGE,
      status: "PUBLISHED",
    });
  });

  it("refuses a report from another village as not found", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const result = await resolve("Police attended.");

    expect(result).toEqual({
      ok: false,
      error: "That report is not in your village.",
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("tells nobody when a second press finds it already resolved", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const result = await resolve("Police attended.");

    expect(result.ok).toBe(false);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.notifyReporterOfResolution).not.toHaveBeenCalled();
    expect(mocks.emailReporterOfResolution).not.toHaveBeenCalled();
    expect(mocks.notifyVotersOfResolution).not.toHaveBeenCalled();
  });
});

describe("the trail and the audiences", () => {
  it("writes incident.resolve with the note, before telling anybody", async () => {
    const order: string[] = [];
    mocks.auditCreate.mockImplementation(async () => order.push("audit"));
    mocks.notifyReporterOfResolution.mockImplementation(async () => {
      order.push("push");
      return { matched: 1, sent: 1 };
    });

    await resolve("Police attended.");

    const { data } = mocks.auditCreate.mock.calls[0][0];
    expect(data.action).toBe("incident.resolve");
    expect(data.villageId).toBe(VILLAGE);
    expect(data.entityId).toBe(INCIDENT);
    expect(data.before).toEqual({ status: "PUBLISHED" });
    expect(data.after).toEqual({ status: "RESOLVED", note: "Police attended." });
    expect(order).toEqual(["audit", "push"]);
  });

  it("tells the reporter twice and the voters once, and not the village", async () => {
    const result = await resolve("Police attended.");

    const expected = expect.objectContaining({
      villageId: VILLAGE,
      incidentId: INCIDENT,
      reference: "VW-HIS-2026-0007",
      reporterId: REPORTER,
      note: "Police attended.",
    });

    expect(mocks.notifyReporterOfResolution).toHaveBeenCalledWith(expected);
    expect(mocks.emailReporterOfResolution).toHaveBeenCalledWith(expected);
    expect(mocks.notifyVotersOfResolution).toHaveBeenCalledWith(
      expect.objectContaining({ exclude: [REPORTER, COORDINATOR] }),
    );

    expect(mocks.notifyIncidentPublished).not.toHaveBeenCalled();
    expect(mocks.emailIncidentPublished).not.toHaveBeenCalled();
    expect(mocks.notifyReporterOfDecision).not.toHaveBeenCalled();

    // What the coordinator is told is the voters reached.
    expect(result).toMatchObject({ ok: true, status: "RESOLVED", notified: 3 });
  });
});

describe("the documents that leave the village", () => {
  const incident = {
    id: INCIDENT,
    reference: "VW-HIS-2026-0007",
    type: "VANDALISM" as const,
    severity: "MEDIUM" as const,
    title: "Bus shelter glass smashed",
    description: "The glass in the shelter was broken overnight.",
    locationText: "Station Road",
    occurredAt: new Date("2026-09-20T22:00:00Z"),
    reportedAt: new Date("2026-09-21T07:00:00Z"),
    recurring: false,
    patternNote: null,
    anonymized: true,
  };

  const period = (resolutionNote: string | null) => ({
    villageName: "Histon",
    dataController: "Histon Neighbourhood Watch",
    from: new Date("2026-09-01T00:00:00Z"),
    to: new Date("2026-09-30T23:59:59Z"),
    generatedAt: new Date("2026-10-01T09:00:00Z"),
    total: 1,
    previousTotal: 0,
    byType: [{ key: "VANDALISM" as const, count: 1 }],
    bySeverity: [{ key: "MEDIUM" as const, count: 1 }],
    hotspots: [],
    mostConcerning: [],
    police: null,
    narrative: null,
    incidents: [{ ...incident, resolutionNote }],
    omitted: 0,
  });

  it("prints the note in the period log of a resolved report, and nothing otherwise", async () => {
    const { formatCommunityReport } = await import("@/lib/community-report");

    expect(
      formatCommunityReport(period("Police attended."), "https://villagewatch.example"),
    ).toContain("  Resolved: Police attended.");
    expect(
      formatCommunityReport(period(null), "https://villagewatch.example"),
    ).not.toContain("Resolved:");
  });

  it("gives the single-incident summary a RESOLVED section", async () => {
    const { formatIncidentSummary } = await import("@/lib/community-report");

    const summary = formatIncidentSummary(
      {
        incident: { ...incident, resolutionNote: "Police attended." },
        villageName: "Histon",
        dataController: "Histon Neighbourhood Watch",
      },
      "https://villagewatch.example",
    );

    expect(summary).toContain("RESOLVED\nPolice attended.");
  });
});
