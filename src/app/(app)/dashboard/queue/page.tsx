import type { Metadata } from "next";
import Link from "next/link";
import { Check, Inbox, ShieldCheck, Zap } from "lucide-react";
import { IncidentTypeIcon } from "@/components/incident-type-icon";
import type { QueuedIncident } from "@/components/dashboard/moderation-card";
import { ModerationQueue } from "@/components/dashboard/moderation-queue";
import { NoVillage } from "@/components/no-village";
import { SeverityBadge } from "@/components/severity-badge";
import { requireCoordinator } from "@/lib/auth";
import { getVillageAutoApprove } from "@/lib/moderation";
import { prisma } from "@/lib/prisma";
import { getVillageChannel } from "@/lib/whatsapp-channel";
import {
  INCIDENT_TYPE_LABELS,
  MODERATION_QUEUE_SIZE,
  PUBLIC_INCIDENT_STATUSES,
  QUEUE_PUBLISHED_SIZE,
} from "@/lib/constants";
import { formatTimeAgo, initialsOf } from "@/lib/format";

export const metadata: Metadata = { title: "Review queue" };

/**
 * The review queue, on its own screen.
 *
 * This is where a coordinator spends their time, and until this redesign it was
 * eight sections down a nine-hundred-line dashboard, below four panels nobody
 * has to act on. See `docs/COORDINATOR_DASHBOARD_REDESIGN.md`.
 *
 * The queue renders `description` — the anonymised column. The reporter's
 * verbatim words are behind a button that writes an `AuditLog` row (domain rule
 * 1); see `ModerationCard`. Nothing on this page reads `rawDescription`.
 *
 * ## Two lists, and only the first has anything waiting on it
 *
 * Pending reports first, through `ModerationQueue` — which is a Client
 * Component for a reason that survives the move: `moderateIncidentAction`
 * revalidates this route, the approved report leaves `PENDING_REVIEW`, and the
 * WhatsApp alert approval produced has to outlive the card that produced it.
 *
 * Published reports below, collapsed. A plain `<details>` rather than a second
 * client component: it needs no state that survives anything and it works
 * before JavaScript loads, like every other progressive control on these
 * screens. It is there so "did I already publish that one?" is answerable
 * without leaving the tab.
 */
export default async function QueuePage() {
  const session = await requireCoordinator("/dashboard/queue");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return <NoVillage />;
  }

  const [queue, pendingCount, recentlyPublished, autoApprove, followLink] =
    await Promise.all([
      prisma.incident.findMany({
        where: { villageId, status: "PENDING_REVIEW" },
        select: {
          id: true,
          reference: true,
          type: true,
          severity: true,
          title: true,
          // The anonymised column. `rawDescription` is fetched only by the
          // reveal action, which audits the read.
          description: true,
          locationText: true,
          occurredAt: true,
          reportedAt: true,
          anonymized: true,
          // The two halves of the severity proposal. Read here rather than on
          // the detail page because the queue is where a coordinator decides
          // whether the level is right, and a disagreement between the reporter
          // and the model is the signal that it might not be.
          reporterSeverity: true,
          severityRationale: true,
          isAnonymous: true,
          reporter: { select: { fullName: true } },
          tags: { select: { label: true }, orderBy: { label: "asc" } },
          _count: { select: { media: true } },
        },
        // Oldest first: the queue is worked from the end somebody has been
        // waiting longest at.
        orderBy: { reportedAt: "asc" },
        take: MODERATION_QUEUE_SIZE,
      }),
      prisma.incident.count({ where: { villageId, status: "PENDING_REVIEW" } }),
      /*
        What has already gone out, for the collapsed list. Ordered by when it
        was *published* as far as this query can tell — `moderatedAt` is null
        for anything auto-approved (nobody moderated it, and filling that column
        with the reporter would put a name against a review that did not
        happen), so `reportedAt` is the one column that is filled either way and
        orders both kinds of report the same.
      */
      prisma.incident.findMany({
        where: { villageId, status: { in: [...PUBLIC_INCIDENT_STATUSES] } },
        select: {
          id: true,
          reference: true,
          type: true,
          severity: true,
          title: true,
          locationText: true,
          reportedAt: true,
          moderatedAt: true,
        },
        orderBy: { reportedAt: "desc" },
        take: QUEUE_PUBLISHED_SIZE,
      }),
      getVillageAutoApprove(villageId),
      // The filtered view, for the "Open WhatsApp" button on a freshly approved
      // report. That one is an `href`, so it takes the `https:`-checked value
      // and never the raw column.
      getVillageChannel(villageId),
    ]);

  const queued: QueuedIncident[] = queue.map((row) => ({
    id: row.id,
    reference: row.reference,
    type: row.type,
    severity: row.severity,
    title: row.title,
    description: row.description,
    locationText: row.locationText,
    occurredAt: row.occurredAt.toISOString(),
    reportedAt: row.reportedAt.toISOString(),
    // A report filed anonymously stays anonymous in the queue too. The link is
    // still in the database for a police request; it is not on this screen.
    reporterName: row.isAnonymous ? null : (row.reporter?.fullName ?? null),
    // Computed on the server so the card does not have to hold the full name to
    // derive them, and shared with the resident list so one resident does not
    // get two different sets of initials on two screens.
    reporterInitials: row.isAnonymous
      ? null
      : initialsOf(row.reporter?.fullName),
    anonymized: row.anonymized,
    reporterSeverity: row.reporterSeverity,
    severityRationale: row.severityRationale,
    tags: row.tags.map((tag) => tag.label),
    mediaCount: row._count.media,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
            <Inbox className="size-6 text-slate-400" aria-hidden />
            Review queue
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Nothing here is on the map yet. Approving a report publishes it and
            alerts the neighbours who asked to hear about it.
          </p>
        </div>

        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
            {pendingCount} waiting
          </span>
        )}
      </div>

      {/*
        The notice moved here with the queue it explains. It takes the place of
        the empty state while auto-approve is on — there is no queue to work,
        and "the queue is empty" would read as a quiet village rather than a
        village that does not moderate.

        What it does not do is hide reports that are actually waiting. Reports
        filed before the switch was flipped are still PENDING_REVIEW, and only
        `PUBLIC_INCIDENT_STATUSES` reach residents (domain rule 6) — so a notice
        rendered *instead* of a non-empty queue would leave somebody's report
        invisible to the village and to the only people who could publish it.
        When there is something there, both are shown.
      */}
      {autoApprove && (
        <div className="mt-6 flex gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-600/20">
          <Zap className="size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm leading-relaxed text-amber-900">
            <p className="font-medium">
              Auto-approve is enabled. Incidents go live immediately.
            </p>
            <p className="mt-1">
              Reports filed in your village are published the moment they are
              submitted, and the neighbours who asked to hear about them are
              alerted straight away. Nothing is queued for you to read first. You
              can still edit, resolve, archive or remove anything on the map, and
              you can turn review back on in{" "}
              <Link
                href="/dashboard/settings"
                className="font-medium underline underline-offset-2"
              >
                village settings
              </Link>
              .
            </p>
            {pendingCount > 0 && (
              <p className="mt-2 font-medium">
                {pendingCount} report{pendingCount === 1 ? "" : "s"} filed before
                this was switched on {pendingCount === 1 ? "is" : "are"} still
                waiting below. Until you review{" "}
                {pendingCount === 1 ? "it" : "them"}, no one in the village can
                see {pendingCount === 1 ? "it" : "them"}.
              </p>
            )}
          </div>
        </div>
      )}

      {/*
        The queue and the alerts for what has just left it, in one client
        component. Approving revalidates this page and takes the report out of
        `queued`, so the alert cannot live in the card that produced it — see
        `ModerationQueue`.
      */}
      <ModerationQueue
        incidents={queued}
        channelUrl={followLink?.url ?? null}
        empty={
          autoApprove ? null : (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-xl bg-safe-50 text-safe-600">
                <ShieldCheck className="size-6" aria-hidden />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">
                The queue is empty
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                Every report your village has filed has been reviewed.
              </p>
            </div>
          )
        }
      />

      {pendingCount > queued.length && (
        <p className="mt-4 text-center text-sm text-slate-500">
          Showing the {queued.length} oldest of {pendingCount}. Clear these to
          see the rest.
        </p>
      )}

      {/*
        Collapsed by default. A coordinator opening this tab came to work the
        queue above; this is here for the one question the queue cannot answer,
        which is whether something has already been through it.
      */}
      <details className="group mt-8 rounded-2xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Check className="size-4 text-safe-600" aria-hidden />
            Already published
          </span>
          <span className="text-xs font-medium text-slate-500 group-open:hidden">
            Show
          </span>
          <span className="hidden text-xs font-medium text-slate-500 group-open:inline">
            Hide
          </span>
        </summary>

        <div className="border-t border-slate-100 p-4 sm:p-5">
          {recentlyPublished.length === 0 ? (
            <p className="text-sm text-slate-500">
              Your village has not published anything yet.
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {recentlyPublished.map((incident) => (
                  <li key={incident.id}>
                    <Link
                      href={`/incidents/${incident.id}`}
                      className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-slate-200 transition hover:bg-white hover:ring-slate-300"
                    >
                      <IncidentTypeIcon
                        type={incident.type}
                        className="size-4 shrink-0 text-slate-400"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {incident.title}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {incident.reference} ·{" "}
                          {INCIDENT_TYPE_LABELS[incident.type]}
                          {incident.locationText && (
                            <> · {incident.locationText}</>
                          )}{" "}
                          · {formatTimeAgo(incident.reportedAt)}
                          {/*
                            Auto-approved reports have no moderator, which is
                            not the same as nobody having decided — the village
                            decided, once, in its settings. Saying so here is
                            cheaper than a coordinator wondering who published
                            something they do not remember reading.
                          */}
                          {incident.moderatedAt === null && " · auto-approved"}
                        </span>
                      </span>
                      <SeverityBadge severity={incident.severity} size="sm" />
                    </Link>
                  </li>
                ))}
              </ul>

              <p className="mt-3 text-xs text-slate-500">
                The {recentlyPublished.length} most recent.{" "}
                <Link
                  href="/incidents"
                  className="font-medium text-brand-700 underline underline-offset-2"
                >
                  See all published reports
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
