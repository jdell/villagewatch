import { NextResponse, type NextRequest } from "next/server";
import { cronUnauthorised, isCronAuthorised } from "@/lib/cron";
import {
  listDuePoliceReports,
  sendVillagePoliceReport,
  type PoliceReportSendResult,
} from "@/lib/police-report-schedule";
import { notifyCronOutcome } from "@/lib/slack";

/**
 * GET|POST /api/cron/police-report — the scheduled community safety reports,
 * daily at 07:00 UTC.
 *
 * Finds every village whose report is due (`listDuePoliceReports`) and sends
 * each one through `sendVillagePoliceReport`, which builds the counted report,
 * writes the audit row, emails it and moves `policeReportLastSentAt`. Daily
 * rather than weekly so a fortnightly or monthly schedule is sent on the day it
 * falls due rather than up to six days late.
 *
 * `CRON_SECRET`, constant time, failing closed — the same gate as every other
 * cron here, because this one sends a village's reports to an address outside
 * it. One village failing — a bad address, a refused send — costs that village
 * and not the ones after it, since the send returns its failures as values.
 *
 * It is the fifth cron in `vercel.json`. See the note on Hobby's limit in
 * CLAUDE.md: the route works on demand with the secret either way.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Outcome = { villageId: string } & PoliceReportSendResult;

async function run(request: NextRequest) {
  if (!isCronAuthorised(request)) return cronUnauthorised();

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, error: "No database configured" },
      { status: 503 },
    );
  }

  const now = new Date();
  const due = await listDuePoliceReports(now);
  const results: Outcome[] = [];

  for (const villageId of due) {
    results.push({
      villageId,
      ...(await sendVillagePoliceReport({ villageId, trigger: "schedule", now })),
    });
  }

  const sent = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok);

  // Counts and failure codes only — never an address. The staff channel is a
  // third party, and a PCSO's email is not ours to put in it.
  await notifyCronOutcome({
    job: "/api/cron/police-report",
    ok: failed.length === 0,
    summary:
      `${due.length} due, ${sent} sent, ${failed.length} not sent` +
      (failed.length > 0
        ? ` (${failed.map((result) => (result.ok ? "" : result.code)).join(", ")})`
        : ""),
  });

  return NextResponse.json({
    ok: true,
    due: due.length,
    sent,
    // The village and the reason, not the recipient.
    results: results.map((result) =>
      result.ok
        ? { villageId: result.villageId, ok: true, incidents: result.incidents }
        : { villageId: result.villageId, ok: false, code: result.code },
    ),
  });
}

export const GET = run;
export const POST = run;
