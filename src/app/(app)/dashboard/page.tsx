import type { Metadata } from "next";
import Link from "next/link";
import {
  FileText,
  Inbox,
  MapPin,
  ScrollText,
  ShieldAlert,
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
import { InviteShare } from "@/components/dashboard/invite-share";
import { ParishCouncilForm } from "@/components/dashboard/parish-council-form";
import { PoliceCrimePanel } from "@/components/dashboard/police-crime-panel";
import { PrivacyLevelForm } from "@/components/dashboard/privacy-level-form";
import { StatCard } from "@/components/dashboard/stat-card";
import { WhatsAppChannelForm } from "@/components/dashboard/whatsapp-channel-form";
import { HotspotHeatmap } from "@/components/map/hotspot-heatmap";
import { NoVillage } from "@/components/no-village";
import { TimeRangeFields } from "@/components/time-range-fields";
import { requireCoordinator } from "@/lib/auth";
import { getVillageCompliance } from "@/lib/compliance";
import {
  dateInputValue,
  previousPeriod,
  resolveDashboardRange,
  timeRangeFilter,
} from "@/lib/date-range";
import { getVillageAutoApprove } from "@/lib/moderation";
import {
  getVillagePoliceComparison,
  getVillagePoliceTeam,
} from "@/lib/police-data";
import {
  getVillageParishCouncil,
  getVillagePrivacyLevel,
} from "@/lib/villages";
import { prisma } from "@/lib/prisma";
import {
  getVillageChannel,
  getVillageChannelSettings,
} from "@/lib/whatsapp-channel";
import {
  DASHBOARD_RANGE_VALUES,
  HOTSPOT_COUNT,
  INCIDENT_TYPE_LABELS,
  MAP_DEFAULTS,
  MODERATION_QUEUE_SIZE,
  PUBLIC_INCIDENT_STATUSES,
  SEVERITIES,
  SEVERITY_META,
} from "@/lib/constants";
import {
  MAX_MAP_INCIDENTS,
  PUBLIC_INCIDENT_SELECT,
  toMapIncident,
} from "@/lib/incidents";

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
 *
 * `searchParams` is a Promise in Next.js 16 — awaited, never destructured in
 * the signature.
 */

/**
 * What the second stat card counts.
 *
 * The levels a coordinator would ring somebody about. Deliberately a constant
 * rather than a `gte` on the enum: Prisma orders enum members by their position
 * in the schema, so a comparison here would silently change meaning the day
 * somebody inserted a level in the middle of `Severity`.
 */
const SERIOUS_SEVERITIES: Severity[] = ["HIGH", "CRITICAL"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Coordinators, moderators and admins only — residents are sent to the map.
  const session = await requireCoordinator("/dashboard");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return <NoVillage />;
  }

  /**
   * The period everything below the queue is counted over.
   *
   * Every figure on this page used to be a hardcoded window — two stat cards on
   * seven and thirty days, and the breakdowns and hotspots on thirty. They now
   * read one selection, which is the only way a dropdown can be honest: a
   * period control that moved the cards and left "Last 30 days" printed over
   * the breakdowns beneath them would be worse than no control.
   *
   * `all` is deliberately not offered here — see the note on `TIME_RANGES`. A
   * trend against the period preceding all time is a comparison with nothing.
   */
  const range = resolveDashboardRange(await searchParams);
  const rangeFilter = timeRangeFilter(range);
  const preceding = previousPeriod(range);

  // Spread rather than `as const`: Prisma's generated `in` filter wants a
  // mutable array, and a readonly tuple will not satisfy it.
  const published = {
    villageId,
    status: { in: [...PUBLIC_INCIDENT_STATUSES] },
  } satisfies { villageId: string; status: { in: IncidentStatus[] } };

  const inRange = { ...published, ...rangeFilter };

  const [
    total,
    previousTotal,
    serious,
    previousSerious,
    byType,
    bySeverity,
    hotspotRows,
    hotspotPins,
    village,
    queue,
    pendingCount,
    channel,
    followLink,
    autoApprove,
    parishCouncil,
    privacyLevel,
    compliance,
    policeComparison,
    policeTeam,
  ] = await Promise.all([
    prisma.incident.count({ where: inRange }),
    // `preceding` is null only for an unbounded range, which this page does not
    // offer. Counting zero rather than skipping the query keeps the card's
    // shape the same either way — `StatCard` already renders a count instead of
    // a percentage when the baseline is zero.
    preceding
      ? prisma.incident.count({
          where: { ...published, occurredAt: preceding },
        })
      : Promise.resolve(0),
    prisma.incident.count({
      where: { ...inRange, severity: { in: SERIOUS_SEVERITIES } },
    }),
    preceding
      ? prisma.incident.count({
          where: {
            ...published,
            occurredAt: preceding,
            severity: { in: SERIOUS_SEVERITIES },
          },
        })
      : Promise.resolve(0),
    prisma.incident.groupBy({
      by: ["type"],
      where: inRange,
      _count: { _all: true },
    }),
    prisma.incident.groupBy({
      by: ["severity"],
      where: inRange,
      _count: { _all: true },
    }),
    prisma.incident.groupBy({
      by: ["locationText"],
      where: {
        ...inRange,
        // A report filed without a landmark has no hotspot to belong to, and
        // bucketing every one of them together under "no location" would
        // reliably produce a phantom top spot.
        locationText: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { locationText: "desc" } },
      take: HOTSPOT_COUNT,
    }),
    // The same period again, read off the coordinates rather than the landmark
    // text, for the density thumbnail beside the list. `PUBLIC_INCIDENT_SELECT`
    // rather than a hand-written select, so this cannot pick up
    // `rawDescription` (domain rule 1) — and it is the same select the map uses,
    // so `toMapIncident` takes the rows as they are.
    prisma.incident.findMany({
      where: {
        ...inRange,
        lat: { not: null },
        lng: { not: null },
      },
      select: PUBLIC_INCIDENT_SELECT,
      orderBy: { occurredAt: "desc" },
      take: MAX_MAP_INCIDENTS,
    }),
    // Where that thumbnail opens, and the village's own invite details. The
    // join code is a credential and this is the one screen that hands it out on
    // purpose — see `InviteShare` for why that is not the same decision
    // `/admin/villages` made.
    prisma.village.findUnique({
      where: { id: villageId },
      select: {
        name: true,
        slug: true,
        region: true,
        joinCode: true,
        centerLat: true,
        centerLng: true,
        defaultZoom: true,
      },
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
    // Reports whether the column exists as well as what is in it — the form
    // renders a different thing for each, because "no council named" is the
    // coordinator's to fix and "no column to name one in" is not.
    getVillageParishCouncil(villageId),
    // Same two-part answer again, and the same reason — except that the value
    // is never null here: it ends up as a redaction mode, and there is no state
    // in which the right answer is to cover nothing.
    getVillagePrivacyLevel(villageId),
    // Same shape and the same reason: the banner is shown for "not accepted"
    // and suppressed for "no columns to accept into", which is somebody else's
    // problem entirely.
    getVillageCompliance(villageId),
    /*
      The official figures for the calendar months this period overlaps, and the
      neighbourhood team covering the village. Both read stored rows and neither
      reaches data.police.uk — the fetching is
      `GET|POST /api/cron/police-data`'s job, because a page render that waited
      on a third party would put somebody else's uptime in front of a
      coordinator's moderation queue.

      Both return null on a database without
      `20260822120000_police_crime_data` applied, and the panel renders nothing
      for that — the same state a village that has never synced is in, which is
      also true.

      `range.from`/`range.to` are non-null for every period this page offers
      (`all` is deliberately absent from `DASHBOARD_RANGE_VALUES`), but the type
      allows null and a query for an unbounded period would ask for every month
      since 2010.
    */
    range.from && range.to
      ? getVillagePoliceComparison({
          villageId,
          from: range.from,
          to: range.to,
        })
      : Promise.resolve(null),
    getVillagePoliceTeam(villageId),
  ]);

  /**
   * What the trend on both cards is measured against.
   *
   * Named from the resolved period rather than hardcoded, because the period is
   * now the coordinator's choice — "vs the week before" printed under a
   * ninety-day count would be a wrong statement about a real number.
   */
  const comparison =
    range.days === null
      ? "vs the preceding period"
      : `vs the preceding ${range.days} days`;

  /** Both breakdowns say the same thing when the period is empty. */
  const emptyPeriod = `Nothing has been published in this period (${range.label.toLowerCase()}).`;

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

  // Rows with no coordinates are already filtered out by the query; the mapper
  // returns null for them anyway, and narrowing here is what keeps the component
  // free of a nullable point.
  const heatIncidents = hotspotPins
    .map(toMapIncident)
    .filter((incident): incident is NonNullable<typeof incident> =>
      Boolean(incident),
    );

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

      {/*
        Above the figures, because it is the only thing on this page that stops
        the village working. Not dismissible: a village with no policy document
        has no lawful authorisation to process the criminal offence data its
        reports contain (DPA 2018 Schedule 1 paragraph 5), so this is a state to
        leave rather than a notice to acknowledge. Which document supplies it
        depends on `Village.mode` — a community village's single agreement
        carries the policy-document content, a council's is separate — so the
        sentence names what the coordinator will actually be asked for.

        `compliance.available` gates it because an unapplied migration means the
        gate is not being enforced either — telling a coordinator to go and fix
        something that has no effect, on a page they cannot complete, would send
        them looking for a problem that is not theirs.
      */}
      {compliance.available && !compliance.complete && (
        <div
          role="status"
          className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-600/20"
        >
          <ShieldAlert className="size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="min-w-0 flex-1 text-sm leading-relaxed text-amber-900">
            <p className="font-medium">
              Complete compliance setup to enable incident reporting
            </p>
            <p className="mt-1">
              {compliance.mode === "community"
                ? "Your village cannot accept reports until you have read and accepted the Community Coordinator Agreement. It takes about ten minutes and there is one document."
                : "Your village cannot accept reports until the Data Protection Impact Assessment, the Appropriate Policy Document and the Data Processing Agreement have been accepted."}{" "}
              Residents who open the report form are being told to contact you.
            </p>
          </div>
          <Link
            href="/dashboard/compliance"
            className="inline-flex h-10 shrink-0 items-center rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
          >
            Review and accept
          </Link>
        </div>
      )}

      {/*
        The period control, above every figure it governs. A GET form for the
        same reasons the incident list's filters are one: it works before
        JavaScript loads, and every period is a URL a coordinator can bookmark
        or paste into a parish council email.

        This form holds the control and nothing else, so the control renders the
        submit button — on `/incidents` the caller already has one.
      */}
      <form
        method="get"
        className="mt-6 rounded-2xl border border-slate-200 bg-white p-4"
      >
        <TimeRangeFields
          range={range}
          presets={DASHBOARD_RANGE_VALUES}
          today={dateInputValue(new Date())}
          submitLabel="Apply"
        />
      </form>

      <section className="mt-4 grid gap-3 sm:grid-cols-2">
        <StatCard
          label={`Published · ${range.label}`}
          value={total}
          previous={previousTotal}
          comparison={comparison}
        />
        {/*
          Not a second window on the same number — the dropdown above is what
          changes the window now. This is the figure a coordinator is actually
          scanning for: how much of the period was serious enough to act on.
        */}
        <StatCard
          label={`High or critical · ${range.label}`}
          value={serious}
          previous={previousSerious}
          comparison={comparison}
        />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            What was reported
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{range.label}</p>
          <div className="mt-4">
            <BreakdownBar rows={typeRows} emptyMessage={emptyPeriod} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">How serious</h2>
          <p className="mt-0.5 text-xs text-slate-500">{range.label}</p>
          <div className="mt-4">
            <BreakdownBar rows={severityRows} emptyMessage={emptyPeriod} />
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <MapPin className="size-4 text-slate-400" aria-hidden />
          Where it keeps happening
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          The {HOTSPOT_COUNT} most reported places in the selected period (
          {range.label.toLowerCase()}), grouped by the landmark residents typed,
          and the same period as density.
        </p>

        {/*
          Above the list rather than below it: the map answers "where" in one
          look, and the list is what a coordinator then reads for the detail.
          Only rendered when the village has a viewport to open on — every
          seeded village does, but `Village` is fetched here rather than
          assumed.
        */}
        {village && (
          <HotspotHeatmap
            incidents={heatIncidents}
            center={{ lat: village.centerLat, lng: village.centerLng }}
            zoom={village.defaultZoom || MAP_DEFAULTS.zoom}
          />
        )}

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

      {/*
        The independent series, under the village's own figures and above the
        queue. Placed here because it answers the question the figures above it
        raise — "is this getting worse, or are we just reporting more of it?" —
        and because the queue is the thing actually waiting on a coordinator and
        should not be pushed further down by a panel nobody has to act on.

        Renders nothing at all until a sync has run. See `PoliceCrimePanel`.
      */}
      <PoliceCrimePanel
        comparison={policeComparison}
        team={policeTeam}
        periodLabel={range.label}
      />

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
      <section id="village-settings" className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">
          Village settings
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          These apply to everyone in your village, not just to you.
        </p>

        {/*
          The controller first, because it is the one setting here that changes
          nothing about how reports flow — it is a name on a document. Putting
          it above the other two also keeps them adjacent, which is the point
          of the ordering below.

          `compliance.mode` decides what this card calls itself: a community
          village has no parish council to name, and its coordinator is the
          controller. Taken off the compliance read this page already does
          rather than a second query — and it is defined on both halves of
          `ComplianceStatus`, including the one where the column is missing.
        */}
        <ParishCouncilForm
          value={parishCouncil.value}
          available={parishCouncil.available}
          mode={compliance.mode}
        />

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

        {/*
          Last, and deliberately not between the two above — those are adjacent
          on purpose, and a village running both has put unreviewed reports in
          front of the open internet, which is the pairing worth seeing in one
          glance.

          This one is the other axis: not who reads a report, but what is left
          of a bystander in the photo attached to it. It is the only setting
          here whose subject never used the app and never agreed to anything.
        */}
        <PrivacyLevelForm
          value={privacyLevel.value}
          available={privacyLevel.available}
        />

        {/*
          Last, and the only block in here that is not a setting at all — nothing
          about a report changes because of it. It sits below the four decisions
          on purpose: a coordinator inviting the village in should have just read
          who reviews a report, who can read it afterwards and what happens to a
          face in a photo.
        */}
        {village && (
          <InviteShare
            villageName={village.name}
            slug={village.slug}
            region={village.region}
            joinCode={village.joinCode}
          />
        )}
      </section>
    </div>
  );
}
