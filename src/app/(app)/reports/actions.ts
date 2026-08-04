"use server";

import { requireCoordinator } from "@/lib/auth";
import { generateReportNarrative } from "@/lib/ai/report-narrative";
import type { ReportNarrative } from "@/lib/community-report";
import { prisma } from "@/lib/prisma";
import { getVillageController } from "@/lib/village";
import { RATE_LIMITS, formatRetryAfter, rateLimit } from "@/lib/rate-limit";
import {
  collectVillageReport,
  countedNarrative,
  resolveReportRange,
} from "@/lib/reports";

/**
 * The server action behind "Write the analysis" on `/reports`.
 *
 * `requireCoordinator()` at the top, as every action in this codebase does. A
 * server action is a POST endpoint with a generated URL — reachable without
 * ever rendering the page — so "the button is only on a coordinator page" is
 * not an authorisation check. The village comes from the session profile and
 * never from the form (domain rule 4).
 *
 * ## Why the narrative is a button and not part of the render
 *
 * Every other section of the report is counted from the database and costs a
 * query. This one costs an Anthropic call over a month of a village's reports,
 * and a page that spent it on every render would spend it again on every change
 * of the date range, every back button and every refresh. Behind a button, one
 * call is one coordinator deciding they want the prose.
 *
 * That is also what makes the audit row meaningful. `incident.report_generated`
 * is written here rather than on the page render, for the same reason
 * `incident.raw_viewed` is written by the reveal action and not by the queue:
 * a row per page view is a trail nobody can read. Viewing the figures is the
 * dashboard's data in a different arrangement; producing the document is the
 * act worth recording.
 *
 * ## What it does when the AI is unavailable
 *
 * It returns the counted narrative and says so. A missing key, a rate limit and
 * a refusal are all ordinary states, and the document is complete without the
 * prose — inventing some to fill the gap would make an outage look like a
 * working report to a police officer who has no way to tell the difference.
 */

export type NarrativeState = {
  narrative: ReportNarrative | null;
  /** Shown under the button. Empty on a clean AI success. */
  message: string;
  ok: boolean;
};

export async function generateNarrativeAction(
  _previous: NarrativeState,
  formData: FormData,
): Promise<NarrativeState> {
  const session = await requireCoordinator("/reports");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return {
      narrative: null,
      ok: false,
      message: "You are not attached to a village.",
    };
  }

  // The range is re-resolved from the submitted values rather than trusted as a
  // pair of instants: `resolveReportRange` is the one place the ceiling and the
  // ordering are enforced, and a hand-posted `from` of 1970 would otherwise put
  // a decade of the village's reports into a prompt.
  const range = resolveReportRange({
    range: String(formData.get("range") ?? ""),
    from: String(formData.get("from") ?? ""),
    to: String(formData.get("to") ?? ""),
  });

  const village = await getVillageController(villageId);

  if (!village) {
    return {
      narrative: null,
      ok: false,
      message: "That village could not be found.",
    };
  }

  const report = await collectVillageReport({
    villageId,
    villageName: village.name,
    parishCouncil: village.parishCouncil,
    range,
  });

  const fallback = countedNarrative({ ...report, days: range.days });

  /*
    Counted against the coordinator after the range has resolved — a malformed
    submission should not spend a slot — and, importantly, **before the audit
    row**. `AuditLog` is append-only, including to the table's owner (domain
    rule 7), so a row written on every press with no ceiling in front of it is
    a held button filling a table nothing can clear. The limiter is the ceiling;
    it fails open, like every other check through that module.

    A refused press writes no row, and that is the right reading of it: the page
    render already put the figures on screen without one, so what the row
    records is the deliberate act of producing the document, and this press did
    not produce anything.
  */
  const limit = await rateLimit(RATE_LIMITS.reportNarrative, session.user.id);

  if (!limit.ok) {
    return {
      narrative: fallback,
      ok: true,
      message: `You have generated a lot of analyses in the last hour. Try again ${formatRetryAfter(limit.retryAfterSeconds)} — the report below is complete without it.`,
    };
  }

  // Written before the Anthropic call, so a timeout leaves the row rather than
  // losing it. The coordinator has the document either way, and that — not
  // whether a model answered — is what the row is about.
  await auditReport({
    session,
    villageId,
    range: { from: range.from, to: range.to, days: range.days },
    total: report.total,
  });

  const result = await generateReportNarrative({
    villageName: village.name,
    from: range.from,
    to: range.to,
    previousPeriodCount: report.previousTotal,
    incidents: report.incidents.map((incident) => ({
      reference: incident.reference,
      type: incident.type,
      severity: incident.severity,
      title: incident.title,
      description: incident.description,
      locationText: incident.locationText,
      occurredAt: new Date(incident.occurredAt),
    })),
  });

  if (!result.ok) {
    return {
      narrative: fallback,
      // Not an error state on the screen. The document is finished and usable;
      // what is missing is the prose, and the message says which.
      ok: true,
      message:
        result.code === "no_incidents"
          ? "Nothing was published in this period, so there is nothing to analyse."
          : `${result.message} The report below is complete without the written analysis.`,
    };
  }

  return {
    ok: true,
    message: "",
    narrative: {
      summary: result.data.summary,
      patterns: result.data.patterns,
      recommendation: result.data.recommendation,
      source: "ai",
      model: result.model,
    },
  };
}

/**
 * One `incident.report_generated` row.
 *
 * Never throws. A trail write that failed is worth a log and is not worth
 * telling a coordinator that their report did not generate — the same call
 * `saveAutoApproveAction` and `saveChannelSettingsAction` make.
 */
async function auditReport(input: {
  session: Awaited<ReturnType<typeof requireCoordinator>>;
  villageId: string;
  range: { from: Date; to: Date; days: number };
  total: number;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.session.user.id,
        actorEmail: input.session.user.email ?? null,
        actorRole: input.session.profile?.role ?? null,
        villageId: input.villageId,
        action: "incident.report_generated",
        entityType: "village",
        entityId: input.villageId,
        after: {
          from: input.range.from.toISOString(),
          to: input.range.to.toISOString(),
          days: input.range.days,
          incidents: input.total,
        },
      },
    });
  } catch (cause) {
    console.error(
      "Could not audit the community report for village %s",
      input.villageId,
      cause,
    );
  }
}
