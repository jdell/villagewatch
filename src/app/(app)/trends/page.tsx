import type { Metadata } from "next";
import { NoVillage } from "@/components/no-village";
import { TimeRangeFields } from "@/components/time-range-fields";
import {
  SUMMARY_TREND_LABELS,
  VillageSummary,
} from "@/components/village-summary";
import { requireSession } from "@/lib/auth";
import { getIncidentTrend } from "@/lib/charts/incident-series";
import {
  BROWSE_RANGE_VALUES,
  INCIDENT_TYPE_LABELS,
  PUBLIC_INCIDENT_STATUSES,
} from "@/lib/constants";
import type { IncidentType } from "@/generated/prisma/enums";
import {
  dateInputValue,
  resolveTimeRange,
  timeRangeFilter,
} from "@/lib/date-range";
import { prisma } from "@/lib/prisma";
import { MapScreen } from "@/components/modern/map-screen";
import { NarrowScreenSwitch } from "@/components/modern/narrow-screen-switch";
import { loadMapExtras, loadVillageMap } from "@/lib/map/load-map";

export const metadata: Metadata = { title: "Trends" };

/**
 * Trends — what has been reported in the village over a period, counted.
 *
 * The tab bar's fourth tab. It is the resident summary `/incidents`
 * already renders above its list — when reports came in, and what they were —
 * on a screen of its own, with the period control in front of it. The same
 * two reads, the same `VillageSummary`, and so the same guarantee: counts and
 * category labels, with no field that could carry a reporter, a description,
 * a coordinate or even an incident id.
 *
 * Only the tab bar links to it. On a phone it is the Trends sheet over the
 * map instead; this page is what `lg` and up get, reachable there by URL.
 *
 * Scoped by the session's village (domain rule 4) and narrowed to
 * `PUBLIC_INCIDENT_STATUSES` (domain rule 6), exactly as `/incidents` is.
 */
export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession("/trends");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return <NoVillage />;
  }

  const range = resolveTimeRange(await searchParams, {
    allowed: BROWSE_RANGE_VALUES,
  });

  // Both degrade rather than throw, as on `/incidents`: an empty axis from
  // `getIncidentTrend`, an empty breakdown from the caught `groupBy`.
  const [byTypeRows, trend] = await Promise.all([
    prisma.incident
      .groupBy({
        by: ["type"],
        where: {
          villageId,
          status: { in: [...PUBLIC_INCIDENT_STATUSES] },
          ...timeRangeFilter(range),
        },
        _count: { _all: true },
      })
      .catch((cause: unknown) => {
        console.warn("Could not count incidents by type for /trends.", cause);
        return [];
      }),
    getIncidentTrend({ villageId, range }),
  ]);

  const byType = byTypeRows
    .map((row) => ({
      label: INCIDENT_TYPE_LABELS[row.type as IncidentType],
      value: row._count._all,
    }))
    .sort((a, b) => b.value - a.value);

  const page = (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Trends
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        What your village has reported over time. Published reports only,
        counted — no names and no addresses.
      </p>

      <form
        method="get"
        className="mt-6 rounded-2xl border border-slate-200 bg-white p-4"
      >
        <TimeRangeFields
          range={range}
          presets={BROWSE_RANGE_VALUES}
          today={dateInputValue(new Date())}
          submitLabel="Show"
        />
      </form>

      {byType.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
          Nothing was published {range.label.toLowerCase()}. Try a longer
          period.
        </p>
      ) : (
        <VillageSummary
          trend={trend.buckets}
          trendLabel={SUMMARY_TREND_LABELS[trend.granularity]}
          byType={byType}
          periodLabel={range.label}
        />
      )}
    </div>
  );

  /*
    The Trends tab is a sheet over the map on a phone —
    the timeline replays the period on the map behind it — and this page from
    `lg` up. Both renderings arrive; `NarrowScreenSwitch` mounts the map only
    on a narrow screen.
  */
  const map = await loadVillageMap(villageId);
  if (!map) return page;
  const { ownPending, ...extras } = await loadMapExtras(
    session,
    villageId,
    map.villageName,
  );

  return (
    <NarrowScreenSwitch
      narrow={
        <MapScreen
          {...map}
          {...extras}
          incidents={[...ownPending, ...map.incidents]}
          initialSheet="trends"
        />
      }
    >
      {page}
    </NarrowScreenSwitch>
  );
}
