import { NextResponse, type NextRequest } from "next/server";
import { cronUnauthorised, isCronAuthorised } from "@/lib/cron";
import { fetchAvailableMonths } from "@/lib/police-api";
import {
  refreshVillageNeighbourhood,
  syncVillagePoliceData,
  type PoliceMonthOutcome,
} from "@/lib/police-data";
import { prisma } from "@/lib/prisma";
import {
  POLICE_SYNC_MAX_REQUESTS,
  POLICE_SYNC_MONTHS,
  isPoliceMonth,
  policeMonthOf,
} from "@/lib/constants";

/**
 * GET|POST /api/cron/police-data — the official crime figures, fetched.
 *
 * For every active village: work out which calendar months data.police.uk has
 * published, fetch the ones this deployment does not already hold, and store
 * them against the village. Also resolves the policing neighbourhood the
 * village sits in and the team covering it, which is the answer to "who is our
 * PCSO" that nothing in VillageWatch could give a coordinator before.
 *
 * ## What it is, and what it is not
 *
 * It is **not** dangerous in the way `/api/cron/retention` is. Nothing here
 * deletes a resident's data, takes a report off the map or changes what anybody
 * can see. The worst outcome of a bad run is a stale figure in an optional
 * section of a report, and every surface that renders those figures names the
 * months it actually holds.
 *
 * It does spend somebody else's bandwidth, though, and it does write rows that
 * end up in a document sent to the police — which is why it is behind
 * `CRON_SECRET` like the other two scheduled routes. An open endpoint here
 * would let anybody run up requests against the Home Office under our user
 * agent, which is the fastest way to be blocked from an API that has no key to
 * revoke.
 *
 * ## The publication lag is asked about, not assumed
 *
 * `GET /crimes-street-dates` says which months the service actually holds. One
 * call at the top of the run, and it saves a call per village per month that
 * has not been published yet — which, at a lag of about two months, is most of
 * what a naive "last six months" loop would ask for. It also turns "the API
 * returned nothing for July" from a question into a fact.
 *
 * If that call fails the run carries on against the plain window. Months that
 * have not landed answer 404, which is recorded as `empty` and retried next
 * time; the cost of guessing is a wasted request, not a wrong figure.
 *
 * ## No silent caps
 *
 * `POLICE_SYNC_MAX_REQUESTS` bounds the outbound calls one run makes, and a
 * village-month left unfetched because the budget ran out says so in the
 * response. A run that quietly stopped covering the most recent months would
 * look exactly like a village with no recent crime, which is the one way this
 * feature could mislead somebody without anything appearing to be wrong.
 *
 * ## Running it by hand
 *
 * Three query parameters, all optional, all for an operator with the secret:
 *
 *   `?months=3`      how far back to look. Clamped to `POLICE_SYNC_MONTHS`.
 *   `?village=<id|slug>`  one village rather than all of them.
 *   `?force=1`       re-fetch even months inside the cache window.
 *
 * This is the "on-demand" half. It is deliberately not a coordinator-facing
 * button: the figures are the same for everybody in a village, the data changes
 * once a month, and a refresh button on a dashboard is a way for twenty
 * coordinators to spend twenty requests on a month that has not moved.
 */

export const dynamic = "force-dynamic";

/** Same ceiling as the digest and the retention sweep — 60s on every plan. */
export const maxDuration = 60;

type VillageOutcome = {
  village: string;
  /** What happened to each month asked about. */
  months: PoliceMonthOutcome[];
  /** Crimes stored this run, across every month fetched. */
  stored: number;
  /** What the neighbourhood lookup did, in a line. */
  neighbourhood: string;
  /** Outbound calls this village cost. */
  requests: number;
};

async function runPoliceSync(request: NextRequest) {
  if (!isCronAuthorised(request)) return cronUnauthorised();

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "The database is not configured on this deployment." },
      { status: 503 },
    );
  }

  const now = new Date();
  const params = request.nextUrl.searchParams;

  const requested = Number(params.get("months"));
  const monthsBack =
    Number.isInteger(requested) && requested > 0
      ? Math.min(requested, POLICE_SYNC_MONTHS)
      : POLICE_SYNC_MONTHS;

  const force = params.get("force") === "1";
  const only = params.get("village")?.trim() || null;

  const villages = await prisma.village.findMany({
    where: {
      status: "ACTIVE",
      ...(only
        ? // Either form, because an operator running this by hand has a slug in
          // front of them and a script has an id. `id` is a uuid column, so a
          // slug in it would be a Postgres cast error rather than a miss —
          // hence the shape test before it is used as one.
          isUuid(only)
          ? { id: only }
          : { slug: only }
        : {}),
    },
    select: { id: true, name: true, centerLat: true, centerLng: true },
    orderBy: { name: "asc" },
  });

  /*
    Which months the service actually holds, newest first, intersected with the
    window we care about. One call for the whole run.
  */
  const window = recentMonths(now, monthsBack);
  const availability = await fetchAvailableMonths();

  const months = availability.ok
    ? window.filter((month) => availability.data.includes(month))
    : window;

  let budget = POLICE_SYNC_MAX_REQUESTS - 1; // the availability call above
  const outcomes: VillageOutcome[] = [];

  for (const village of villages) {
    // A directory entry with no map centre has no point to search around. It
    // cannot happen through `activateVillage` — the columns are not nullable —
    // and it is checked because the alternative is asking data.police.uk about
    // latitude zero, which is in the Atlantic.
    if (!Number.isFinite(village.centerLat) || !Number.isFinite(village.centerLng)) {
      outcomes.push({
        village: village.name,
        months: [],
        stored: 0,
        neighbourhood: "No map centre on this village",
        requests: 0,
      });
      continue;
    }

    try {
      outcomes.push(
        await syncOne({ village, months, now, force, budget: Math.max(0, budget) }),
      );
    } catch (cause) {
      // One village's failure does not end the sweep, the same shape the weekly
      // digest takes: the response reports what happened to each, so a failure
      // is visible in the cron log rather than silently skipped.
      console.error("Police sync failed for village %s", village.id, cause);
      outcomes.push({
        village: village.name,
        months: [],
        stored: 0,
        neighbourhood:
          cause instanceof Error ? cause.message : "Unknown failure",
        requests: 0,
      });
    }

    budget -= outcomes[outcomes.length - 1].requests;
  }

  return NextResponse.json({
    ranAt: now.toISOString(),
    months,
    /*
      Named rather than left to be inferred. A run that found the availability
      list unreachable asked for months it may not get, and the difference
      between "the API says July is the newest month" and "we guessed July" is
      the difference between an empty section and a broken one.
    */
    availability: availability.ok ? "published" : `assumed (${availability.code})`,
    requestBudget: POLICE_SYNC_MAX_REQUESTS,
    requestsRemaining: Math.max(0, budget),
    villages: outcomes,
  });
}

async function syncOne(input: {
  village: { id: string; name: string; centerLat: number; centerLng: number };
  months: readonly string[];
  now: Date;
  force: boolean;
  budget: number;
}): Promise<VillageOutcome> {
  const { village, now, force } = input;

  /*
    The neighbourhood first, and it is worth the ordering. It costs at most
    three calls and only when the stored copy is stale, and it is the half of
    this feature a coordinator notices — a village with a PCSO's name on its
    dashboard and last month's figures missing is in a better state than the
    reverse.
  */
  const neighbourhood =
    input.budget > 0
      ? await refreshVillageNeighbourhood({ village, now, force })
      : { spent: 0, detail: "Not refreshed this run — the request budget was spent" };

  const { outcomes, spent } = await syncVillagePoliceData({
    village,
    months: input.months,
    budget: Math.max(0, input.budget - neighbourhood.spent),
    now,
    force,
  });

  const stored = outcomes
    .filter((outcome) => outcome.status === "ok")
    .reduce((sum, outcome) => sum + outcome.crimes, 0);

  await recordSync({
    villageId: village.id,
    outcomes,
    stored,
    neighbourhood: neighbourhood.detail,
    now,
  });

  return {
    village: village.name,
    months: outcomes,
    stored,
    neighbourhood: neighbourhood.detail,
    requests: spent + neighbourhood.spent,
  };
}

/**
 * One `AuditLog` row per village per run, written only when something changed.
 *
 * Per village rather than per month, the same shape `retention.sweep` takes and
 * for the same reason: a row per month would bury every human action in the
 * trail. Written only when a month was actually fetched — a nightly run that
 * finds everything fresh should leave no trace at all, or a village with six
 * cached months would accumulate a row a night describing nothing.
 *
 * It is in the trail because these figures end up in a document sent to the
 * police, and "where did this number come from, and when was it read" is a
 * question that document invites. `actorId` is null because nobody did it.
 */
async function recordSync(input: {
  villageId: string;
  outcomes: readonly PoliceMonthOutcome[];
  stored: number;
  neighbourhood: string;
  now: Date;
}): Promise<void> {
  const fetched = input.outcomes.filter(
    (outcome) => outcome.status !== "cached",
  );

  if (fetched.length === 0) return;

  try {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorRole: "system",
        villageId: input.villageId,
        action: "police.sync",
        entityType: "village",
        entityId: input.villageId,
        after: {
          source: "data.police.uk",
          months: fetched.map((outcome) => ({
            month: outcome.month,
            status: outcome.status,
            crimes: outcome.crimes,
          })),
          crimesStored: input.stored,
          neighbourhood: input.neighbourhood,
        },
      },
    });
  } catch (cause) {
    // The rows are already written. Losing the trail entry is bad; throwing
    // here would make a completed sync look failed and invite a retry that
    // spends the requests again — the same call `retention.sweep` makes.
    console.error("Police sync: could not write the audit trail", cause);
  }
}

/** The last `count` calendar months including the current one, newest first. */
function recentMonths(now: Date, count: number): string[] {
  const months: string[] = [];
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  for (let index = 0; index < count; index += 1) {
    const month = policeMonthOf(cursor);
    if (isPoliceMonth(month)) months.push(month);
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }

  return months;
}

/** Whether a `?village=` value is an id rather than a slug. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export const POST = runPoliceSync;

/** Vercel Cron issues a `GET`. Same handler, same secret — as with the other two. */
export const GET = runPoliceSync;
