import type { Metadata } from "next";
import Link from "next/link";
import {
  FileText,
  Inbox,
  MapPin,
  ScrollText,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type {
  IncidentStatus,
  IncidentType,
  Severity,
} from "@/generated/prisma/enums";
import {
  BreakdownBar,
  type BreakdownRow,
} from "@/components/dashboard/breakdown-bar";
import type { QueuedIncident } from "@/components/dashboard/moderation-card";
import { ModerationQueue } from "@/components/dashboard/moderation-queue";
import { AutoApproveForm } from "@/components/dashboard/auto-approve-form";
import { ExportCsvButton } from "@/components/dashboard/export-csv-button";
import { StatCard } from "@/components/dashboard/stat-card";
import { WhatsAppChannelForm } from "@/components/dashboard/whatsapp-channel-form";
import { NoVillage } from "@/components/no-village";
import { requireCoordinator } from "@/lib/auth";
import { getVillageAutoApprove } from "@/lib/moderation";
import { prisma } from "@/lib/prisma";
import {
  getVillageChannel,
  getVillageChannelSettings,
} from "@/lib/whatsapp-channel";
import {
  HOTSPOT_COUNT,
  INCIDENT_TYPE_LABELS,
  MODERATION_QUEUE_SIZE,
  PUBLIC_INCIDENT_STATUSES,
  SEVERITIES,
  SEVERITY_META,
} from "@/lib/constants";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The coordinator's view of the village: what has been reported, where it
 * clusters, and what is still waiting on them.
 *
 * Everything below the moderation queue is drawn from **published** incidents
 * only. The statistics are shown to the person who decides what gets published,
 * so counting the queue into them would make the trend line move every time
 * someone files a report, rather than every time one is cleared.
 *
 * The queue itself is the exception, and it renders `description` — the
 * anonymised column. The reporter's verbatim words are behind a button that
 * writes an `AuditLog` row (domain rule 1); see `ModerationCard`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function DashboardPage() {
  // Coordinators, moderators and admins only — residents are sent to the map.
  const session = await requireCoordinator("/dashboard");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return <NoVillage />;
  }

  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * DAY_MS);
  const previousWeekStart = new Date(now.getTime() - 14 * DAY_MS);
  const monthStart = new Date(now.getTime() - 30 * DAY_MS);
  const previousMonthStart = new Date(now.getTime() - 60 * DAY_MS);

  // Spread rather than `as const`: Prisma's generated `in` filter wants a
  // mutable array, and a readonly tuple will not satisfy it.
  const published = {
    villageId,
    status: { in: [...PUBLIC_INCIDENT_STATUSES] },
  } satisfies { villageId: string; status: { in: IncidentStatus[] } };

  const [
    thisWeek,
    lastWeek,
    thisMonth,
    lastMonth,
    byType,
    bySeverity,
    hotspotRows,
    queue,
    pendingCount,
    channel,
    followLink,
    autoApprove,
  ] = await Promise.all([
    prisma.incident.count({
      where: { ...published, occurredAt: { gte: weekStart } },
    }),
    prisma.incident.count({
      where: { ...published, occurredAt: { gte: previousWeekStart, lt: weekStart } },
    }),
    prisma.incident.count({
      where: { ...published, occurredAt: { gte: monthStart } },
    }),
    prisma.incident.count({
      where: {
        ...published,
        occurredAt: { gte: previousMonthStart, lt: monthStart },
      },
    }),
    prisma.incident.groupBy({
      by: ["type"],
      where: { ...published, occurredAt: { gte: monthStart } },
      _count: { _all: true },
    }),
    prisma.incident.groupBy({
      by: ["severity"],
      where: { ...published, occurredAt: { gte: monthStart } },
      _count: { _all: true },
    }),
    prisma.incident.groupBy({
      by: ["locationText"],
      where: {
        ...published,
        occurredAt: { gte: monthStart },
        // A report filed without a landmark has no hotspot to belong to, and
        // bucketing every one of them together under "no location" would
        // reliably produce a phantom top spot.
        locationText: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { locationText: "desc" } },
      take: HOTSPOT_COUNT,
    }),
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
        isAnonymous: true,
        reporter: { select: { fullName: true } },
        tags: { select: { label: true }, orderBy: { label: "asc" } },
        _count: { select: { media: true } },
      },
      orderBy: { reportedAt: "asc" },
      take: MODERATION_QUEUE_SIZE,
    }),
    prisma.incident.count({ where: { villageId, status: "PENDING_REVIEW" } }),
    // The raw column values rather than `getVillageChannel`'s filtered view —
    // this is the screen that edits them, so a stored link that failed the
    // `https:` check has to appear in the field to be correctable.
    getVillageChannelSettings(villageId),
    // And the filtered view, for the "Open WhatsApp" button on a freshly
    // approved report. That one is an `href`, so it takes the `https:`-checked
    // value and never the raw column.
    getVillageChannel(villageId),
    getVillageAutoApprove(villageId),
  ]);

  const typeRows: BreakdownRow[] = byType
    .map((row) => ({
      key: row.type,
      label: INCIDENT_TYPE_LABELS[row.type as IncidentType],
      count: row._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  // Built from `SEVERITIES` rather than from the query result, so the levels
  // always read low → critical. Levels with nothing in them are dropped: four
  // empty bars on a quiet month is noise, not information.
  const severityCounts = new Map(
    bySeverity.map((row) => [row.severity as Severity, row._count._all]),
  );

  const severityRows: BreakdownRow[] = SEVERITIES.filter(
    (meta) => (severityCounts.get(meta.value) ?? 0) > 0,
  ).map((meta) => ({
    key: meta.value,
    label: meta.label,
    count: severityCounts.get(meta.value) ?? 0,
    colour: SEVERITY_META[meta.value].pin,
  }));

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
    anonymized: row.anonymized,
    tags: row.tags.map((tag) => tag.label),
    mediaCount: row._count.media,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            What your village has reported, and what is waiting on you.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/*
            First of the three, and the only one that is a document rather than
            a data dump: this is what a coordinator actually takes to a police
            liaison call. `range=7` because the weekly meeting is the common
            case; the page itself offers thirty days and a custom range.
          */}
          <Link
            href="/reports?range=7"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            <FileText className="size-4" aria-hidden />
            Generate weekly report
          </Link>

          <Link
            href="/dashboard/audit"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ScrollText className="size-4" aria-hidden />
            Audit trail
          </Link>

          <ExportCsvButton />
        </div>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Published this week"
          value={thisWeek}
          previous={lastWeek}
          comparison="vs the week before"
        />
        <StatCard
          label="Published this month"
          value={thisMonth}
          previous={lastMonth}
          comparison="vs the month before"
        />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            What was reported
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">Last 30 days</p>
          <div className="mt-4">
            <BreakdownBar
              rows={typeRows}
              emptyMessage="Nothing has been published in the last 30 days."
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">How serious</h2>
          <p className="mt-0.5 text-xs text-slate-500">Last 30 days</p>
          <div className="mt-4">
            <BreakdownBar
              rows={severityRows}
              emptyMessage="Nothing has been published in the last 30 days."
            />
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <MapPin className="size-4 text-slate-400" aria-hidden />
          Where it keeps happening
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          The {HOTSPOT_COUNT} most reported places in the last 30 days, grouped
          by the landmark residents typed.
        </p>

        {hotspotRows.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No location has been named more than once yet.
          </p>
        ) : (
          <ol className="mt-4 space-y-2.5">
            {hotspotRows.map((row, index) => (
              <li
                key={row.locationText ?? index}
                className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-slate-200"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-sm font-semibold text-slate-500 ring-1 ring-slate-200">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                  {row.locationText}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-slate-600">
                  {row._count._all} report{row._count._all === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Inbox className="size-5 text-slate-400" aria-hidden />
            Waiting for review
          </h2>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
              {pendingCount} report{pendingCount === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {/*
          The notice takes the place of the queue while auto-approve is on —
          there is no queue to work, and "the queue is empty" would read as a
          quiet village rather than a village that does not moderate.

          What it does not do is hide reports that are actually waiting. Reports
          filed before the switch was flipped are still PENDING_REVIEW, and only
          `PUBLIC_INCIDENT_STATUSES` reach residents (domain rule 6) — so a
          notice rendered *instead* of a non-empty queue would leave somebody's
          report invisible to the village and to the only people who could
          publish it. When there is something there, both are shown.
        */}
        {autoApprove ? (
          <div className="mt-3 flex gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-600/20">
            <Zap className="size-5 shrink-0 text-amber-600" aria-hidden />
            <div className="text-sm leading-relaxed text-amber-900">
              <p className="font-medium">
                Auto-approve is enabled. Incidents go live immediately.
              </p>
              <p className="mt-1">
                Reports filed in your village are published the moment they are
                submitted, and the neighbours who asked to hear about them are
                alerted straight away. Nothing is queued for you to read first.
                You can still edit, resolve, archive or remove anything on the
                map, and you can turn review back on in Village settings below.
              </p>
              {pendingCount > 0 && (
                <p className="mt-2 font-medium">
                  {pendingCount} report{pendingCount === 1 ? "" : "s"} filed
                  before this was switched on {pendingCount === 1 ? "is" : "are"}{" "}
                  still waiting below. Until you review{" "}
                  {pendingCount === 1 ? "it" : "them"}, no one in the village can
                  see {pendingCount === 1 ? "it" : "them"}.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm text-slate-500">
            Nothing here is on the map yet. Approving a report publishes it and
            alerts the neighbours who asked to hear about it.
          </p>
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
                <h3 className="mt-4 text-lg font-semibold text-slate-900">
                  The queue is empty
                </h3>
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
      </section>

      {/*
        Below the queue on purpose: this is configuration, and the queue is the
        thing that is actually waiting on a coordinator. Rendered even when the
        village has never had a channel — an empty form is how the first one
        gets set up, and there is nowhere else in the app to do it.
      */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">
          Village settings
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          These apply to everyone in your village, not just to you.
        </p>

        {/*
          Review first, the channel second, in the order of how much they
          change. One decides whether anybody reads a report before the village
          does; the other decides who can read it afterwards. A village with
          both on has put unreviewed reports in front of the open internet,
          which is worth being able to see in one glance.
        */}
        <AutoApproveForm value={autoApprove} />

        <WhatsAppChannelForm
          values={{
            url: channel?.url ?? null,
            enabled: channel?.enabled ?? false,
            // The column default, and deliberately higher than the push
            // default — a public feed is not the place for a missing cat.
            minSeverity: channel?.minSeverity ?? "HIGH",
          }}
        />
      </section>
    </div>
  );
}
