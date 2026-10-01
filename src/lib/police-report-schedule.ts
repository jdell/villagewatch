import type { Session } from "@/lib/auth";
import { formatCommunityReport } from "@/lib/community-report";
import {
  POLICE_REPORT_DUE_GRACE_HOURS,
  POLICE_REPORT_SCHEDULES,
  type PoliceReportSchedule,
} from "@/lib/constants";
import { sendEmail } from "@/lib/email/send";
import { policeReportEmail } from "@/lib/email/police-report";
import { prisma } from "@/lib/prisma";
import {
  RATE_LIMITS,
  policeReportSubject,
  rateLimit,
} from "@/lib/rate-limit";
import {
  collectVillageReport,
  countedNarrative,
  resolveReportRange,
} from "@/lib/reports";
import { getVillageController } from "@/lib/villages";

/**
 * Scheduled police reports. **Server only.**
 *
 * A coordinator names the village's police contact and a schedule on Village
 * settings, and the community safety report goes to that address by email —
 * from `GET|POST /api/cron/police-report` once a day when one is due, or from
 * "Send now". The document is the one a coordinator already sends by hand:
 * `collectVillageReport` over the schedule's period, formatted by
 * `formatCommunityReport`.
 *
 * - **Counted, never written by AI.** The narrative is `countedNarrative`, so
 *   an automated send spends no Anthropic credit and the document says on its
 *   face which kind of summary it carries (`source: "counted"`) — the footer's
 *   AI claim is conditional on that.
 * - **Published reports only, and nothing a resident has not already seen.**
 *   `ReportIncident` has no field for `rawDescription` or coordinates; this
 *   module adds no data to the document, only a recipient and a timer.
 * - **Audited before it is sent**, as `incident.report_generated` with
 *   `format: "email"` — the PDF route's reasoning: a village's reports
 *   assembled for the police with no trail behind them is worse than a send
 *   that did not happen. The row says which trigger and which address.
 * - **Rate limited per village**: one scheduled send a day, three "Send now".
 * - **Nothing here throws to its caller.** A cron loop over villages must not
 *   stop at the first one with a bad address, and a settings button must not
 *   become an error page.
 */

// ---------------------------------------------------------------------------
// The schedule
// ---------------------------------------------------------------------------

export type PoliceReportScheduleMeta = (typeof POLICE_REPORT_SCHEDULES)[number];

/**
 * A stored schedule, narrowed. The column is free text, so anything that is not
 * one of the three — including a value from a future version — reads as off
 * rather than as a guess at an interval.
 */
export function resolvePoliceReportSchedule(
  value: string | null | undefined,
): PoliceReportScheduleMeta | null {
  return POLICE_REPORT_SCHEDULES.find((schedule) => schedule.value === value) ?? null;
}

/**
 * Whether a village's report is due.
 *
 * Never sent is due. Otherwise due once the schedule's interval has passed
 * since the last send, less `POLICE_REPORT_DUE_GRACE_HOURS` — see that
 * constant for why a daily cron needs the slack.
 */
export function isPoliceReportDue(
  schedule: PoliceReportScheduleMeta,
  lastSentAt: Date | null,
  now: Date,
): boolean {
  if (!lastSentAt) return true;

  const intervalMs = schedule.days * 24 * 60 * 60 * 1000;
  const graceMs = POLICE_REPORT_DUE_GRACE_HOURS * 60 * 60 * 1000;

  return now.getTime() - lastSentAt.getTime() >= intervalMs - graceMs;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type VillagePoliceReportSettings = {
  /** False when the columns do not exist yet — the migration has not run. */
  available: boolean;
  schedule: PoliceReportSchedule | null;
  email: string | null;
  lastSentAt: Date | null;
};

/** The village's settings. Degrades to "off, unavailable" on any error. */
export async function readVillagePoliceReport(
  villageId: string,
): Promise<VillagePoliceReportSettings> {
  const off = { available: false, schedule: null, email: null, lastSentAt: null };
  if (!process.env.DATABASE_URL) return off;

  try {
    const village = await prisma.village.findUnique({
      where: { id: villageId },
      select: {
        policeReportSchedule: true,
        policeReportEmail: true,
        policeReportLastSentAt: true,
      },
    });

    return {
      available: true,
      schedule: resolvePoliceReportSchedule(village?.policeReportSchedule)?.value ?? null,
      email: village?.policeReportEmail ?? null,
      lastSentAt: village?.policeReportLastSentAt ?? null,
    };
  } catch (cause) {
    console.error(
      "Could not read the police report settings for village %s",
      villageId,
      cause,
    );
    return off;
  }
}

/**
 * Writes the settings. **Throws**, as every settings write in this codebase
 * does: a save that failed silently would leave a coordinator believing their
 * PCSO will hear from them every week.
 */
export async function saveVillagePoliceReport(
  villageId: string,
  settings: { schedule: PoliceReportSchedule | null; email: string | null },
): Promise<void> {
  await prisma.village.update({
    where: { id: villageId },
    data: {
      policeReportSchedule: settings.schedule,
      policeReportEmail: settings.email,
    },
  });
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type PoliceReportTrigger = "schedule" | "manual";

export type PoliceReportSendResult =
  | { ok: true; to: string; incidents: number; days: number }
  | {
      ok: false;
      code:
        | "no_village"
        | "no_address"
        | "rate_limited"
        | "not_configured"
        | "failed";
      message: string;
    };

/** The period a send covers: the schedule's interval, or a week for a one-off. */
const ONE_OFF_DAYS = 7;

/**
 * Builds the village's report and emails it to the police contact.
 *
 * `actor` is the coordinator for "Send now" and absent for the cron, whose
 * audit row is written as `system` the way the retention sweep's is.
 * `policeReportLastSentAt` moves only when the email was actually accepted —
 * a send skipped for a missing Resend key or refused by the provider leaves
 * the schedule where it was, so the next run tries again.
 */
export async function sendVillagePoliceReport(input: {
  villageId: string;
  trigger: PoliceReportTrigger;
  actor?: Session;
  now?: Date;
}): Promise<PoliceReportSendResult> {
  const { villageId, trigger, actor } = input;
  const now = input.now ?? new Date();

  try {
    const [village, settings] = await Promise.all([
      getVillageController(villageId),
      readVillagePoliceReport(villageId),
    ]);

    if (!village) {
      return { ok: false, code: "no_village", message: "That village could not be found." };
    }

    if (!settings.email) {
      return {
        ok: false,
        code: "no_address",
        message: "Add your police contact's email address first.",
      };
    }

    const quota = await rateLimit(
      trigger === "schedule"
        ? RATE_LIMITS.policeReportScheduled
        : RATE_LIMITS.policeReportSendNow,
      policeReportSubject(villageId),
    );

    if (!quota.ok) {
      return {
        ok: false,
        code: "rate_limited",
        message:
          trigger === "schedule"
            ? "A report already went to this village's police contact today."
            : "You have sent this report several times today. Try again tomorrow.",
      };
    }

    const days = resolvePoliceReportSchedule(settings.schedule)?.days ?? ONE_OFF_DAYS;
    const range = resolveReportRange({ days: String(days) }, now);

    const { range: _range, ...collected } = await collectVillageReport({
      villageId,
      villageName: village.name,
      parishCouncil: village.parishCouncil,
      range,
      now,
    });
    void _range;

    const narrative = countedNarrative({ ...collected, days: range.days });
    const reportText = formatCommunityReport({ ...collected, narrative });

    // Before the send — see the header. A failure here stops the send.
    await prisma.auditLog.create({
      data: {
        actorId: actor?.user.id ?? null,
        actorEmail: actor?.user.email ?? null,
        actorRole: actor?.profile?.role ?? "system",
        villageId,
        action: "incident.report_generated",
        entityType: "village",
        entityId: villageId,
        after: {
          format: "email",
          trigger,
          recipient: settings.email,
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          days: range.days,
          incidents: collected.total,
        },
      },
    });

    const result = await sendEmail({
      to: settings.email,
      message: policeReportEmail({
        villageName: village.name,
        reportText,
        from: range.from,
        to: range.to,
        days: range.days,
        schedule: trigger === "schedule" ? settings.schedule : null,
      }),
    });

    if (!result.sent) {
      return {
        ok: false,
        code: result.skipped === "not_configured" ? "not_configured" : "failed",
        message:
          result.skipped === "not_configured"
            ? "Email is not set up on this deployment, so nothing was sent."
            : "The email could not be sent. Check the address and try again.",
      };
    }

    await prisma.village.update({
      where: { id: villageId },
      data: { policeReportLastSentAt: now },
    });

    return { ok: true, to: settings.email, incidents: collected.total, days: range.days };
  } catch (cause) {
    console.error(
      "Could not send the police report for village %s",
      villageId,
      cause,
    );
    return {
      ok: false,
      code: "failed",
      message: "The report could not be sent. Try again later.",
    };
  }
}

/**
 * The villages whose report is due now: in service, with a schedule and an
 * address, and past their interval. Suspended villages are skipped like the
 * digest skips them. Empty on any failure — the cron reports a run with
 * nothing due rather than a crash.
 */
export async function listDuePoliceReports(now: Date): Promise<string[]> {
  if (!process.env.DATABASE_URL) return [];

  try {
    const villages = await prisma.village.findMany({
      where: {
        status: "ACTIVE",
        policeReportSchedule: { not: null },
        policeReportEmail: { not: null },
      },
      select: {
        id: true,
        policeReportSchedule: true,
        policeReportLastSentAt: true,
      },
    });

    return villages
      .filter((village) => {
        const schedule = resolvePoliceReportSchedule(village.policeReportSchedule);
        return schedule
          ? isPoliceReportDue(schedule, village.policeReportLastSentAt, now)
          : false;
      })
      .map((village) => village.id);
  } catch (cause) {
    console.error("Could not list villages with a police report due", cause);
    return [];
  }
}
