import type { IncidentStatus } from "@/generated/prisma/enums";

/**
 * "Happening now", and the one banner at the top of a report's page.
 *
 * Client-safe and pure — no Prisma, no clock read of its own — so the rules
 * behind the red pulse are tested rather than discovered on a resident's
 * screen. `tests/incident-live.test.ts`.
 *
 * ## What "happening now" means
 *
 * There is no column a reporter fills in to say "this is going on as I type",
 * and asking for one in the wizard would be a sixth question at the moment
 * somebody is least able to answer it. So it is **derived**: a published report
 * whose `occurredAt` is within `LIVE_WINDOW_HOURS` of now, and that nobody has
 * said is over. The reporter — or a coordinator — ends it early with "It's over
 * now", which writes `Incident.endedAt` and nothing else.
 *
 * Published only, and that is domain rule 6 rather than tidiness: a report in
 * the queue has not been seen by the village, so a red "happening now" on it
 * would tell its reporter something is live that nobody else can see. The
 * reporter can still mark a queued report over — the window is the same — so
 * it does not light up the moment a coordinator publishes it an hour later.
 *
 * Three hours is a judgement. Long enough for a van going door to door or a
 * loose horse to still be the thing a neighbour opening the report wants to
 * know about; short enough that a report read the next morning does not claim
 * it is still going on. The pin's own pulse is 24 hours and is a different
 * claim — "new", not "now".
 */

export const LIVE_WINDOW_HOURS = 3;

const HOUR_MS = 60 * 60 * 1000;

type LiveInput = {
  status: IncidentStatus;
  occurredAt: Date;
  endedAt: Date | null;
};

/** Whether the occurrence is recent enough to still be going on. */
function withinWindow(occurredAt: Date, now: number): boolean {
  const age = now - occurredAt.getTime();
  // A future `occurredAt` (a clock a few minutes fast) counts as now.
  return age < LIVE_WINDOW_HOURS * HOUR_MS;
}

/** A published report, inside the window, that nobody has said is over. */
export function isHappeningNow(incident: LiveInput, now: number): boolean {
  return (
    incident.status === "PUBLISHED" &&
    incident.endedAt === null &&
    withinWindow(incident.occurredAt, now)
  );
}

/**
 * Whether "It's over now" is offered. The same window, on a report the village
 * can or soon may see — not a rejected, archived or resolved one, which has
 * already been closed in a stronger sense than this.
 */
export function canMarkOver(incident: LiveInput, now: number): boolean {
  return (
    (incident.status === "PUBLISHED" || incident.status === "PENDING_REVIEW") &&
    incident.endedAt === null &&
    withinWindow(incident.occurredAt, now)
  );
}

export type ReportBannerKind =
  | "in_review"
  | "happening_now"
  | "published"
  | "resolved"
  | "rejected"
  | "archived";

/**
 * Which of the banners the page draws. One, always — the status is the first
 * thing somebody returning to a report is looking for, and two banners
 * disagreeing is worse than one. Happening now outranks published because it
 * is the more specific statement about the same report.
 */
export function reportBannerKind(
  incident: LiveInput,
  now: number,
): ReportBannerKind {
  switch (incident.status) {
    case "DRAFT":
    case "PENDING_REVIEW":
      return "in_review";
    case "RESOLVED":
      return "resolved";
    case "REJECTED":
      return "rejected";
    case "ARCHIVED":
    // A removed report never reaches the page — it is `notFound()` — so this
    // branch is for the type, and the archived wording is the honest one.
    case "REMOVED":
      return "archived";
    case "PUBLISHED":
      return isHappeningNow(incident, now) ? "happening_now" : "published";
  }
}
