import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectedReport } from "@/lib/reports";

/**
 * Scheduled police reports — the schedule arithmetic, the settings schema, and
 * the send.
 *
 * Prisma, the village read, the limiter's counter and the email transport are
 * mocked at their boundaries; the range resolver, the counted narrative and the
 * report formatter are left **real**, so "the report is counted, not written by
 * AI" is asserted against the document actually produced.
 *
 * The properties, in the order they would hurt:
 *
 *   * **It is audited before it is sent**, with the address it went to.
 *   * **A send that did not happen does not move the schedule**, so a missing
 *     key or a refused message is retried rather than silently skipped.
 *   * **No address, no quota spent and nothing written.**
 *   * **A daily cron does not make a weekly report slip a day** every week.
 */

const mocks = vi.hoisted(() => ({
  villageFindUnique: vi.fn(),
  villageFindMany: vi.fn(),
  villageUpdate: vi.fn(),
  auditCreate: vi.fn(),
  getVillageController: vi.fn(),
  collectVillageReport: vi.fn(),
  sendEmail: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    village: {
      findUnique: mocks.villageFindUnique,
      findMany: mocks.villageFindMany,
      update: mocks.villageUpdate,
    },
    auditLog: { create: mocks.auditCreate },
  },
}));
vi.mock("@/lib/villages", () => ({
  getVillageController: mocks.getVillageController,
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, rateLimit: mocks.rateLimit };
});
vi.mock("@/lib/reports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports")>();
  return { ...actual, collectVillageReport: mocks.collectVillageReport };
});

const {
  isPoliceReportDue,
  listDuePoliceReports,
  resolvePoliceReportSchedule,
  sendVillagePoliceReport,
} = await import("@/lib/police-report-schedule");
const { villagePoliceReportFormSchema } = await import("@/lib/validations");

const VILLAGE = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-08T07:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const weekly = resolvePoliceReportSchedule("weekly")!;

function collected(): Omit<CollectedReport, "range"> & { range: unknown } {
  return {
    range: {},
    villageName: "Histon",
    dataController: "Histon Neighbourhood Watch",
    from: new Date(NOW.getTime() - 7 * DAY),
    to: NOW,
    generatedAt: NOW,
    total: 3,
    previousTotal: 1,
    byType: [{ key: "THEFT", count: 3 }],
    bySeverity: [{ key: "MEDIUM", count: 3 }],
    hotspots: [{ location: "Mill Lane", count: 2 }],
    mostConcerning: [],
    police: null,
    incidents: [],
    omitted: 0,
  } as unknown as Omit<CollectedReport, "range"> & { range: unknown };
}

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://test";
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getVillageController.mockResolvedValue({
    name: "Histon",
    parishCouncil: "Histon Neighbourhood Watch",
  });
  mocks.villageFindUnique.mockResolvedValue({
    policeReportSchedule: "weekly",
    policeReportEmail: "pcso.name@police.uk",
    policeReportLastSentAt: null,
  });
  mocks.collectVillageReport.mockResolvedValue(collected());
  mocks.rateLimit.mockResolvedValue({ ok: true, remaining: 0 });
  mocks.sendEmail.mockResolvedValue({ sent: true, id: "msg-1" });
  mocks.auditCreate.mockResolvedValue({});
  mocks.villageUpdate.mockResolvedValue({});
});

describe("the schedule", () => {
  it("narrows a stored value, and reads anything else as off", () => {
    expect(resolvePoliceReportSchedule("weekly")?.days).toBe(7);
    expect(resolvePoliceReportSchedule("fortnightly")?.days).toBe(14);
    expect(resolvePoliceReportSchedule("monthly")?.days).toBe(30);
    expect(resolvePoliceReportSchedule("daily")).toBeNull();
    expect(resolvePoliceReportSchedule(null)).toBeNull();
  });

  it("is due when it has never been sent", () => {
    expect(isPoliceReportDue(weekly, null, NOW)).toBe(true);
  });

  it("is not due inside the interval", () => {
    expect(isPoliceReportDue(weekly, new Date(NOW.getTime() - 3 * DAY), NOW)).toBe(false);
  });

  it("does not slip a day when last week's send finished a few seconds late", () => {
    const lastWeekPlusFourSeconds = new Date(NOW.getTime() - 7 * DAY + 4_000);
    expect(isPoliceReportDue(weekly, lastWeekPlusFourSeconds, NOW)).toBe(true);
  });

  it("never sends twice in one interval, grace or not", () => {
    // Yesterday's send, checked again this morning.
    expect(isPoliceReportDue(weekly, new Date(NOW.getTime() - DAY), NOW)).toBe(false);
  });
});

describe("villagePoliceReportFormSchema", () => {
  const parse = (schedule: string, email: string) =>
    villagePoliceReportFormSchema.safeParse({ schedule, email });

  it("allows off with no address, and keeps an address while off", () => {
    expect(parse("off", "")).toMatchObject({ success: true, data: { email: null } });
    expect(parse("off", "pcso@police.uk").success).toBe(true);
  });

  it("requires an address for any schedule", () => {
    const result = parse("weekly", "  ");
    expect(result.success).toBe(false);
  });

  it("rejects an address that is not one, and an unknown schedule", () => {
    expect(parse("weekly", "not an address").success).toBe(false);
    expect(parse("daily", "pcso@police.uk").success).toBe(false);
  });

  it("stores the address trimmed and lower-cased", () => {
    expect(parse("weekly", "  PCSO.Name@Police.UK ")).toMatchObject({
      success: true,
      data: { email: "pcso.name@police.uk" },
    });
  });
});

describe("sendVillagePoliceReport", () => {
  it("audits before it sends, with the recipient and the trigger", async () => {
    const order: string[] = [];
    mocks.auditCreate.mockImplementation(async () => order.push("audit"));
    mocks.sendEmail.mockImplementation(async () => {
      order.push("send");
      return { sent: true };
    });

    const result = await sendVillagePoliceReport({
      villageId: VILLAGE,
      trigger: "schedule",
      now: NOW,
    });

    expect(result).toMatchObject({ ok: true, to: "pcso.name@police.uk", days: 7 });
    expect(order).toEqual(["audit", "send"]);

    const { data } = mocks.auditCreate.mock.calls[0][0];
    expect(data.action).toBe("incident.report_generated");
    expect(data.actorRole).toBe("system");
    expect(data.after).toMatchObject({
      format: "email",
      trigger: "schedule",
      recipient: "pcso.name@police.uk",
      days: 7,
      incidents: 3,
    });
  });

  it("sends the counted report, never an AI-written one", async () => {
    await sendVillagePoliceReport({ villageId: VILLAGE, trigger: "schedule", now: NOW });

    const { to, message } = mocks.sendEmail.mock.calls[0][0];
    expect(to).toBe("pcso.name@police.uk");
    expect(message.subject).toContain("Histon");
    // The footer's AI claim appears only over a model-written analysis.
    expect(message.text).not.toContain("written by AI");
    expect(message.text).toContain("Histon");
  });

  it("moves the schedule on only when the email was accepted", async () => {
    await sendVillagePoliceReport({ villageId: VILLAGE, trigger: "schedule", now: NOW });
    expect(mocks.villageUpdate).toHaveBeenCalledWith({
      where: { id: VILLAGE },
      data: { policeReportLastSentAt: NOW },
    });

    mocks.villageUpdate.mockClear();
    mocks.sendEmail.mockResolvedValue({ sent: false, skipped: "not_configured" });

    const skipped = await sendVillagePoliceReport({
      villageId: VILLAGE,
      trigger: "schedule",
      now: NOW,
    });

    expect(skipped).toMatchObject({ ok: false, code: "not_configured" });
    expect(mocks.villageUpdate).not.toHaveBeenCalled();
  });

  it("spends nothing and writes nothing without an address", async () => {
    mocks.villageFindUnique.mockResolvedValue({
      policeReportSchedule: "weekly",
      policeReportEmail: null,
      policeReportLastSentAt: null,
    });

    const result = await sendVillagePoliceReport({ villageId: VILLAGE, trigger: "manual" });

    expect(result).toMatchObject({ ok: false, code: "no_address" });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("is limited per village, on separate rules for the cron and Send now", async () => {
    await sendVillagePoliceReport({ villageId: VILLAGE, trigger: "schedule", now: NOW });
    await sendVillagePoliceReport({ villageId: VILLAGE, trigger: "manual", now: NOW });

    const [scheduled, manual] = mocks.rateLimit.mock.calls;
    expect(scheduled[0].name).toBe("police-report-scheduled");
    expect(manual[0].name).toBe("police-report-send-now");
    expect(scheduled[1]).toBe(`village:${VILLAGE}`);
  });

  it("refuses a rate-limited send before auditing or emailing", async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 3600 });

    const result = await sendVillagePoliceReport({
      villageId: VILLAGE,
      trigger: "schedule",
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, code: "rate_limited" });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("resolves to a value when anything underneath throws", async () => {
    mocks.collectVillageReport.mockRejectedValue(new Error("connection reset"));

    await expect(
      sendVillagePoliceReport({ villageId: VILLAGE, trigger: "schedule", now: NOW }),
    ).resolves.toMatchObject({ ok: false, code: "failed" });
  });
});

describe("listDuePoliceReports", () => {
  it("asks for active villages with a schedule and an address, and keeps the due ones", async () => {
    mocks.villageFindMany.mockResolvedValue([
      { id: "due", policeReportSchedule: "weekly", policeReportLastSentAt: null },
      {
        id: "not-yet",
        policeReportSchedule: "monthly",
        policeReportLastSentAt: new Date(NOW.getTime() - 10 * DAY),
      },
      { id: "nonsense", policeReportSchedule: "hourly", policeReportLastSentAt: null },
    ]);

    expect(await listDuePoliceReports(NOW)).toEqual(["due"]);
    expect(mocks.villageFindMany.mock.calls[0][0].where).toEqual({
      status: "ACTIVE",
      policeReportSchedule: { not: null },
      policeReportEmail: { not: null },
    });
  });
});
