import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyAlert } from "@/components/copy-alert";
import { NoVillage } from "@/components/no-village";
import { ReportPage } from "@/components/report/report-page";
import { ShareSummary } from "@/components/share-summary";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getVillageController, getVillageMode } from "@/lib/villages";
import {
  formatIncidentSummary,
  reportController,
} from "@/lib/community-report";
import {
  INCIDENT_ACTION_PARAM,
  INCIDENT_APPROVE_ACTION,
  PUBLIC_INCIDENT_STATUSES,
  isCoordinatorRole,
} from "@/lib/constants";
import { canReporterErase } from "@/lib/erasure";
import { formatIncidentAlert, reportShareUrl } from "@/lib/format-alert";
import { readIncidentEndedAt } from "@/lib/incident-ended";
import {
  canMarkOver,
  isHappeningNow,
  reportBannerKind,
} from "@/lib/incident-live";
import { readVoteStates } from "@/lib/incident-votes";
import { PUBLIC_INCIDENT_SELECT, toMapIncident } from "@/lib/incidents";
import { relatedIncidents } from "@/lib/related-incidents";
import { isUuid } from "@/lib/validations";
import { signedMediaUrls } from "@/lib/media/storage";
import { getVillageChannel } from "@/lib/whatsapp-channel";
import { formatDateTime, formatTimeAgo } from "@/lib/format";

/**
 * One incident in full.
 *
 * `params` is a Promise in Next.js 16 — awaited, never destructured in the
 * signature.
 *
 * What is deliberately *not* on this page is `rawDescription`. The reporter and
 * their coordinator are entitled to read it, but every read of it owes an
 * `AuditLog` row (domain rule 1), and a page that writes an audit entry every
 * time anyone glances at it is the wrong shape for that. It belongs in the
 * moderation queue, where reading it is a deliberate act. This page selects the
 * public columns only, so there is nothing here to leak.
 */

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  // Before anything reads the database — see `isUuid`. The page below answers
  // the same id with `notFound()`.
  if (!isUuid(id)) return { title: "Incident" };

  const session = await requireSession(`/incidents/${id}`);
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) return { title: "Incident" };

  const isCoordinator = isCoordinatorRole(session.profile?.role);

  const incident = await prisma.incident.findFirst({
    // Scoped, because a title is still information — an unscoped lookup would
    // confirm the existence of another village's report. Kept in step with the
    // page's own predicate so a coordinator does not get a page they can read
    // under a browser tab labelled "Incident".
    where: {
      id,
      villageId,
      status: { not: "REMOVED" },
      OR: [
        { status: { in: [...PUBLIC_INCIDENT_STATUSES] } },
        { reporterId: session.user.id },
        ...(isCoordinator ? [{}] : []),
      ],
    },
    select: { title: true, reference: true },
  });

  return {
    title: incident ? `${incident.title} · ${incident.reference}` : "Incident",
  };
}

export default async function IncidentDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  // A malformed id is a 404, not a Prisma error: Postgres rejects it rather
  // than finding no row. Before the session, since it reveals nothing.
  if (!isUuid(id)) notFound();

  /*
    `?action=approve` is where the Approve button on a coordinator's
    pending-report push lands (`pendingReportMessage`). Compared against the one
    value it can have rather than passed through, and carried through the
    sign-in redirect so a coordinator whose session had lapsed still arrives at
    the open sheet.
  */
  const requestedAction = (await searchParams)[INCIDENT_ACTION_PARAM];
  const approveRequested = requestedAction === INCIDENT_APPROVE_ACTION;

  const session = await requireSession(
    approveRequested
      ? `/incidents/${id}?${INCIDENT_ACTION_PARAM}=${INCIDENT_APPROVE_ACTION}`
      : `/incidents/${id}`,
  );
  const villageId = session.profile?.villageId;
  const role = session.profile?.role;

  if (!villageId || !process.env.DATABASE_URL) {
    return <NoVillage />;
  }

  const isCoordinator = isCoordinatorRole(role);

  const incident = await prisma.incident.findFirst({
    where: {
      // Village first: the tenant boundary applies before anything else
      // (domain rule 4).
      id,
      villageId,
      // An erased report is gone for everyone, including the reporter who
      // erased it and the coordinator who could otherwise see every status in
      // their village. It falls through to `notFound()` below.
      status: { not: "REMOVED" },
      OR: [
        // Published and resolved reports are the public surface (domain rule 6).
        { status: { in: [...PUBLIC_INCIDENT_STATUSES] } },
        // A reporter can always see their own report while it waits for review
        // — being unable to check on it is the most common reason somebody
        // files the same thing twice.
        { reporterId: session.user.id },
        // A coordinator sees every status in their own village: the queue links
        // here. Widening the *read* is safe because this page still selects the
        // public columns only — the verbatim text stays behind the audited
        // reveal in the queue.
        ...(isCoordinator ? [{}] : []),
      ],
    },
    select: {
      ...PUBLIC_INCIDENT_SELECT,
      reporterId: true,
      reportedToPolice: true,
      policeReference: true,
      // The model's one sentence for the severity — public-safe by
      // construction, and in the `incidents` column grant.
      severityRationale: true,
      // What the reporter was told at review. Read only for the reporter and
      // a coordinator, and only on a rejected report, below.
      moderationNote: true,
      moderatedAt: true,
      tags: { select: { label: true }, orderBy: { label: "asc" } },
      media: {
        // Only media that has been through redaction is ever served
        // (domain rule 3).
        where: { redactedAt: { not: null } },
        select: {
          id: true,
          redactedPath: true,
          mimeType: true,
          createdAt: true,
        },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!incident) notFound();

  const now = new Date();
  const nowMs = now.getTime();

  const pin = toMapIncident(incident);
  const isPublic = (PUBLIC_INCIDENT_STATUSES as readonly string[]).includes(
    incident.status,
  );
  const isReporter = incident.reporterId === session.user.id;
  const inQueue =
    incident.status === "DRAFT" || incident.status === "PENDING_REVIEW";
  const deletable = canReporterErase(incident.status);
  const openApprove = approveRequested && isCoordinator && inQueue;
  /*
    The link from a push outlives the decision it was about: a second
    coordinator may have got there first. Saying so beats a page with no
    Approve button on it and no explanation of why.
  */
  const alreadyReviewed = approveRequested && isCoordinator && !inQueue;
  const canSetPoliceReference = isPublic && (isReporter || isCoordinator);

  /*
    Everything that is not the report row, in one round. Each read degrades on
    its own rather than taking the page down:

    - `endedAt` — read separately, see `readIncidentEndedAt`.
    - The media URLs, signed for the redacted copies only.
    - The pattern's other reports, for the pattern card.
    - The vote tally, on a public report only — the vote route refuses a
      report in the queue (domain rule 6), so a button here would mislead.
    - The village's controller and mode, behind the coordinator-and-public
      gate the summary and the alert sit behind, so a resident's page makes
      neither read.
  */
  const [endedAt, urls, related, voteStates, controller, mode] =
    await Promise.all([
      readIncidentEndedAt(incident.id, villageId),
      signedMediaUrls(incident.media.flatMap((item) => item.redactedPath ?? [])),
      pin && incident.recurring && isPublic
        ? relatedIncidents(pin, villageId)
        : Promise.resolve([]),
      isPublic
        ? readVoteStates({ incidentIds: [incident.id], userId: session.user.id })
        : Promise.resolve(null),
      isCoordinator && isPublic
        ? getVillageController(villageId)
        : Promise.resolve(null),
      isCoordinator && isPublic ? getVillageMode(villageId) : Promise.resolve(null),
    ]);

  const votes = voteStates?.get(incident.id) ?? null;
  const live = { status: incident.status, occurredAt: incident.occurredAt, endedAt };
  const banner = reportBannerKind(live, nowMs);
  const happening = isHappeningNow(live, nowMs);
  const markOverAllowed =
    (isReporter || isCoordinator) && canMarkOver(live, nowMs);

  /*
    The WhatsApp alert and the written summary for a PCSO — coordinators and
    published reports only, for the reasons "The public share buttons" and
    "Sharing with police and the parish council" give. Both built from the
    public columns already on the page.
  */
  const alert =
    isCoordinator && isPublic
      ? formatIncidentAlert({
          id: incident.id,
          title: incident.title,
          severity: incident.severity,
          description: incident.description,
          locationText: incident.locationText,
          occurredAt: incident.occurredAt,
          recurring: incident.recurring,
          patternNote: incident.patternNote,
        })
      : null;
  const channel = alert ? await getVillageChannel(villageId) : null;

  const summary = controller
    ? formatIncidentSummary({
        villageName: controller.name,
        dataController: reportController(controller.parishCouncil),
        incident: {
          id: incident.id,
          reference: incident.reference,
          type: incident.type,
          severity: incident.severity,
          title: incident.title,
          description: incident.description,
          locationText: incident.locationText,
          occurredAt: incident.occurredAt,
          reportedAt: incident.reportedAt,
          recurring: incident.recurring,
          patternNote: incident.patternNote,
          anonymized: incident.anonymized,
          reportedToPolice: incident.reportedToPolice,
          policeReference: incident.policeReference,
          resolutionNote: incident.resolutionNote,
        },
      })
    : null;

  const shareUrl = reportShareUrl({
    id: incident.id,
    isPublic,
    isCoordinator,
  });

  const bannerCopy = (() => {
    switch (banner) {
      case "in_review":
        return {
          when: null,
          text: isReporter
            ? "Only you and your coordinator can see this. It goes on the village map once they have read it."
            : "Not on the village map yet. You can see it because you moderate this village.",
          action: isCoordinator
            ? { href: "#moderate", label: "Review it" }
            : isReporter && inQueue
              ? { href: "#reporter-actions", label: "Edit or withdraw it" }
              : null,
        };
      case "happening_now":
        return {
          when: `reported ${formatTimeAgo(incident.occurredAt)}`,
          text: "This is recent enough that it may still be going on. If you are nearby, take care — and call 999 if anybody is in danger.",
          action: markOverAllowed
            ? { href: "#reporter-actions", label: "It's over now" }
            : null,
        };
      case "published":
        return {
          when: incident.moderatedAt ? formatDateTime(incident.moderatedAt) : null,
          text: "On the village map. Neighbours who asked to hear about reports like this were alerted.",
          action: null,
        };
      case "resolved":
        return {
          when: incident.resolvedAt ? formatDateTime(incident.resolvedAt) : null,
          text:
            incident.resolutionNote ??
            "Your coordinator marked this as dealt with.",
          action: null,
        };
      case "rejected":
        return {
          when: null,
          text:
            (isReporter || isCoordinator) && incident.moderationNote
              ? `Your coordinator decided not to publish this: “${incident.moderationNote}”`
              : "Your coordinator decided not to publish this. It is not on the map.",
          action: null,
        };
      case "archived":
        return {
          when: null,
          text: "Taken off the village map. Nothing in it was deleted.",
          action: null,
        };
    }
  })();

  return (
    <ReportPage
      incident={incident}
      pin={pin}
      urls={urls}
      banner={banner}
      bannerCopy={bannerCopy}
      happening={happening}
      endedAt={endedAt}
      votes={votes}
      related={related}
      shareUrl={shareUrl}
      isReporter={isReporter}
      isCoordinator={isCoordinator}
      isPublic={isPublic}
      inQueue={inQueue}
      deletable={deletable}
      markOverAllowed={markOverAllowed}
      canSetPoliceReference={canSetPoliceReference}
      openApprove={openApprove}
      alreadyReviewed={alreadyReviewed}
      coordinatorExtras={
        <>
                {summary && mode && (
                  <div className="mt-5">
                    <ShareSummary
                      text={summary}
                      shareTitle={`${incident.reference} — ${incident.title}`}
                      anonymized={incident.anonymized}
                      mode={mode}
                    />
                  </div>
                )}
                {alert && (
                  <div className="mt-5">
                    <CopyAlert
                      text={alert}
                      incidentId={incident.id}
                      channelUrl={channel?.url ?? null}
                      anonymized={incident.anonymized}
                      title="Post this to WhatsApp"
                      hint="Your neighbours were alerted in the app when this was published — this is the text for your village's WhatsApp Channel, which nothing posts to automatically."
                    />
                  </div>
                )}
        </>
      }
    />
  );
}
