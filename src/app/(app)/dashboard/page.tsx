import type { Metadata } from "next";
import Link from "next/link";
import { FileText, MapPin, ScrollText, ShieldAlert } from "lucide-react";
import type {
  IncidentStatus,
  IncidentType,
  Severity,
} from "@/generated/prisma/enums";
import {
  ActivityFeed,
  type ActivityRow,
} from "@/components/dashboard/activity-feed";
import {
  BreakdownBar,
  type BreakdownRow,
} from "@/components/dashboard/breakdown-bar";
import {
  ConcernList,
  type ConcernRow,
} from "@/components/dashboard/concern-list";
import { ExportCsvButton } from "@/components/dashboard/export-csv-button";
import { PoliceCrimePanel } from "@/components/dashboard/police-crime-panel";
import { StatCard } from "@/components/dashboard/stat-card";
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
import {
  getVillagePoliceComparison,
  getVillagePoliceTeam,
} from "@/lib/police-data";
import { prisma } from "@/lib/prisma";
import {
  ACTIVITY_FEED_SIZE,
  CONCERN_LIST_SIZE,
  DASHBOARD_RANGE_VALUES,
  HOTSPOT_COUNT,
  INCIDENT_TYPE_LABELS,
  MAP_DEFAULTS,
  PUBLIC_INCIDENT_STATUSES,
  SEVERITIES,
  SEVERITY_META,
  resolveConcernSort,
} from "@/lib/constants";
import {
  MAX_MAP_INCIDENTS,
  PUBLIC_INCIDENT_SELECT,
  toMapIncident,
} from "@/lib/incidents";
import { summariseVotes, tallyFor, type VoteTally } from "@/lib/votes";

export const metadata: Metadata = { title: "Overview" };

/**
 * The coordinator's Overview: what has been reported, where it clusters, what
 * the village made of it, and what somebody else's figures say about the same
 * place.
 *
 * ## It is read-only, and that is a property rather than an accident
 *
 * Nothing on this page writes anything. The moderation queue moved to
 * `/dashboard/queue` and the village settings to `/dashboard/settings`, which
 * is the whole of this redesign — see `docs/COORDINATOR_DASHBOARD_REDESIGN.md`.
 * What that buys is a page that is safe to leave open and safe to revalidate
 * under somebody, and a coordinator who came to publish one report no longer
 * pays for the police comparison, the heat points and the vote tally on the way
 * to the button.
 *
 * Everything counted here is drawn from **published** incidents only. The
 * statistics are shown to the person who decides what gets published, so
 * counting the queue into them would make the trend move every time someone
 * files a report rather than every time one is cleared. The one exception is
 * the "waiting for review" card, which is the queue by definition — and it is
 * deliberately not bounded by the period, for the reason `StatCard` gives.
 *
 * `searchParams` is a Promise in Next.js 16 — awaited, never destructured in
 * the signature.
 */
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
   * The period everything below the cards is counted over.
   *
   * Every figure used to be a hardcoded window. They now read one selection,
   * which is the only way a dropdown can be honest: a period control that moved
   * the cards and left "Last 30 days" printed over the breakdowns beneath them
   * would be worse than no control.
   *
   * `all` is deliberately not offered here — see the note on `TIME_RANGES`. A
   * trend against the period preceding all time is a comparison with nothing.
   */
  const params = await searchParams;

  const range = resolveDashboardRange(params);
  const rangeFilter = timeRangeFilter(range);
  const preceding = previousPeriod(range);

  /**
   * How the concern panel is ordered.
   *
   * Narrowed rather than rejected, the same forgiveness every other filter on
   * these screens applies — a hand-edited or stale `?sort=` should render the
   * panel in its default order, not an error page.
   */
  const concernSort = resolveConcernSort(
    Array.isArray(params.sort) ? params.sort[0] : params.sort,
  );

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
    pendingCount,
    patternCount,
    residentCount,
    byType,
    bySeverity,
    hotspotRows,
    hotspotPins,
    village,
    compliance,
    policeComparison,
    policeTeam,
    voteRows,
    activityRows,
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
    /*
      Deliberately not bounded by the period. A report filed in March that
      nobody has reviewed is still waiting today, and a pending figure that fell
      to zero because a coordinator selected "Last 7 days" would be the one
      number on this page that could quietly say the work is done when it is
      not. The card's own label says "all time" so the exception is visible.
    */
    prisma.incident.count({ where: { villageId, status: "PENDING_REVIEW" } }),
    /*
      The first thing in the app ever to read `PatternAlert`. The weekly digest
      has been writing these since Day 6 and nothing has rendered one — the
      card counts them and `/reports` lists them.

      Counted on `createdAt` rather than on the window the alert covers: this is
      "how many times did the detector flag something during the period", which
      is a question about the detector's output. An alert's own window can
      straddle the period boundary and belongs to the run that wrote it.
    */
    prisma.patternAlert.count({
      where: {
        villageId,
        ...(range.from && range.to
          ? { createdAt: { gte: range.from, lte: range.to } }
          : {}),
      },
    }),
    /*
      Accounts that have not been closed. "Active" here means open rather than
      recently used — `User.lastActiveAt` exists and nothing writes it, so a
      figure built on that column would read as engagement and be zero for every
      village. Unbounded by the period for the same reason as the queue count:
      an account is a state, not a rate.
    */
    prisma.user.count({ where: { villageId, deletedAt: null } }),
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
    // Where that thumbnail opens. The join code is deliberately **not**
    // selected here any more — it moved to the Settings tab with `InviteShare`,
    // and a credential that is not read is a credential that cannot leak into
    // a page's payload.
    prisma.village.findUnique({
      where: { id: villageId },
      select: {
        name: true,
        centerLat: true,
        centerLng: true,
        defaultZoom: true,
      },
    }),
    // The banner is shown for "not accepted" and suppressed for "no columns to
    // accept into", which is somebody else's problem entirely. `mode` comes off
    // the same read, for the activity feed's labels.
    getVillageCompliance(villageId),
    /*
      The official figures for the calendar months this period overlaps, and the
      neighbourhood team covering the village. Both read stored rows and neither
      reaches data.police.uk — the fetching is
      `GET|POST /api/cron/police-data`'s job, because a page render that waited
      on a third party would put somebody else's uptime in front of a
      coordinator's dashboard.

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
    /*
      Every vote cast on a published report in this period, two rows per report
      at most.

      Counted from the votes rather than from the incidents on purpose: this
      panel lists only reports somebody actually voted on, so starting from
      `incident_votes` bounds the query by how many reports have an opinion on
      them rather than by how many exist. A busy month with three voted reports
      in it costs three rows here; the alternative — read every published
      incident in the period and sort it — reads the whole period to show five
      of it.

      `where` filters through the relation, which is what keeps the tenant
      boundary and the public-status rule on this query too (domain rules 4 and
      6): `inRange` is the same predicate every other figure on this page is
      counted over.

      Wrapped, because `incident_votes` arrives with
      `20260823120000_incident_votes` and a dashboard must not fail over an
      unapplied migration — the same tolerance `getVillagePoliceComparison` has,
      here inline because it is one query rather than a module of them.
    */
    prisma.incidentVote
      .groupBy({
        by: ["incidentId", "vote"],
        where: { incident: inRange },
        _count: { _all: true },
      })
      .catch((cause: unknown) => {
        console.warn(
          "Could not read incident votes for the dashboard; rendering " +
            "without them. Has 20260823120000_incident_votes been applied?",
          cause,
        );
        return [];
      }),
    /*
      The activity feed. Village-scoped like every other query (domain rule 4),
      and **unbounded by the period** on purpose: this answers "what has
      happened since I last looked", which is a question about the trail rather
      than about the selected window. A feed that emptied when somebody chose
      seven days would look like a village where nothing happens.

      Reading it writes nothing — see `ActivityFeed`, and the audit viewer,
      which makes the same argument at length.
    */
    prisma.auditLog.findMany({
      where: { villageId },
      select: {
        id: true,
        action: true,
        actorEmail: true,
        actor: { select: { fullName: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: ACTIVITY_FEED_SIZE,
    }),
  ]);

  /**
   * What the trend on the published card is measured against.
   *
   * Named from the resolved period rather than hardcoded, because the period is
   * the coordinator's choice — "vs the week before" printed under a ninety-day
   * count would be a wrong statement about a real number.
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

  const activity: ActivityRow[] = activityRows.map((row) => ({
    id: row.id,
    action: row.action,
    actorName: row.actor?.fullName ?? null,
    actorEmail: row.actorEmail,
    createdAt: row.createdAt.toISOString(),
  }));

  /*
    The concern panel.

    Two steps rather than one query, because the ordering is arithmetic Postgres
    would have to be asked for in raw SQL — `up - down` over a pivot of an enum
    — and the set it runs over is already small: one row per voted report, which
    is what the `groupBy` above returned.

    The sort is applied *before* the incidents are fetched, so the second query
    reads exactly the reports that end up on screen. The result then comes back
    in whatever order Postgres liked, so it is put back into the sorted order by
    id — a `findMany` with an `in` list makes no promise about ordering, and a
    panel headed "Most concerning" listing them in insertion order would be
    wrong in a way nobody would spot.
  */
  const tallies = summariseVotes(voteRows);

  const rank = (id: string): VoteTally => tallyFor(tallies, id);

  const concernIds = [...tallies.keys()]
    .sort((a, b) => {
      const left = rank(a);
      const right = rank(b);

      switch (concernSort) {
        case "discussed":
          // Both directions count. A report six neighbours argued over is the
          // one worth reading, whichever way it came out.
          return (
            right.up + right.down - (left.up + left.down) ||
            right.score - left.score
          );
        case "overstated":
          // Ascending, so the reports the village rated *down* come first.
          return left.score - right.score || right.down - left.down;
        default:
          return right.score - left.score || right.up - left.up;
      }
    })
    .slice(0, CONCERN_LIST_SIZE);

  const concernIncidents =
    concernIds.length === 0
      ? []
      : await prisma.incident.findMany({
          // `inRange` again rather than the ids alone: the votes were read
          // through the relation, but re-stating the predicate is what keeps
          // this query independently scoped to the village (domain rule 4)
          // rather than trusting a list of ids assembled a few lines up.
          where: { ...inRange, id: { in: concernIds } },
          select: {
            id: true,
            reference: true,
            type: true,
            severity: true,
            title: true,
            locationText: true,
            occurredAt: true,
          },
        });

  const byId = new Map(concernIncidents.map((row) => [row.id, row]));

  const concernRows: ConcernRow[] = concernIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [{ ...row, votes: rank(id) }] : [];
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Overview
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            What your village has reported, and what the figures say about it.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/*
            The only one of the three that is a document rather than a data
            dump: this is what a coordinator actually takes to a police liaison
            call. `range=7` because the weekly meeting is the common case; the
            Reports tab itself offers thirty days and a custom range.
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

        Two of the four cards below sit outside it, and say so on their own
        labels. See `StatCard`.
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

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/*
          First, because it is the only one of the four with work behind it. It
          links to the tab that work is on — a count of things waiting with no
          way through to them is furniture.
        */}
        <StatCard
          label="Waiting for review"
          value={pendingCount}
          hint={
            pendingCount === 0
              ? "Nothing is waiting on you."
              : "All time, whatever period is selected."
          }
          href="/dashboard/queue"
          hrefLabel={pendingCount === 0 ? "Open the queue" : "Review them"}
        />

        <StatCard
          label={`Published · ${range.label}`}
          value={total}
          previous={previousTotal}
          comparison={comparison}
        />

        <StatCard
          label={`Patterns detected · ${range.label}`}
          value={patternCount}
          hint={
            patternCount === 0
              ? "The Sunday digest has flagged nothing."
              : "Raised by the weekly digest."
          }
        />

        <StatCard
          label="Active residents"
          value={residentCount}
          hint="Accounts in your village that are still open."
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
        What the village made of its own reports, between its own counts and the
        independent series below.

        Placed here on purpose: the two panels above it count what was *filed*,
        this one counts what the village thought of it, and the police figures
        below are somebody else's count of the same place. Three answers to
        "what is going on here", in order of who is doing the counting.
      */}
      <ConcernList
        rows={concernRows}
        sort={concernSort}
        period={{
          range: range.preset,
          from: range.fromValue,
          to: range.toValue,
        }}
        periodLabel={range.label}
      />

      {/*
        The independent series, under the village's own figures. It answers the
        question the figures above it raise — "is this getting worse, or are we
        just reporting more of it?"

        Renders nothing at all until a sync has run. See `PoliceCrimePanel`.
      */}
      <PoliceCrimePanel
        comparison={policeComparison}
        team={policeTeam}
        periodLabel={range.label}
      />

      {/*
        Last, because it is the only thing on the page that is not about the
        village's reports at all — it is about the people running it. A
        coordinator coming back after a week reads it to find out what the
        others did.
      */}
      <ActivityFeed rows={activity} mode={compliance.mode} />
    </div>
  );
}
