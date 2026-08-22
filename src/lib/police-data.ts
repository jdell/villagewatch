import type { Prisma } from "@/generated/prisma/client";
import {
  POLICE_CATEGORY_LIMIT,
  POLICE_MAX_CRIMES_PER_MONTH,
  POLICE_REFRESH_DAYS,
  PUBLIC_INCIDENT_STATUSES,
  isPoliceMonth,
  policeCategoryLabel,
  policeMonthsBetween,
} from "@/lib/constants";
import type {
  PoliceComparison,
  PoliceTeam,
  PoliceTeamMember,
} from "@/lib/police-report";
import {
  fetchNeighbourhood,
  fetchNeighbourhoodTeam,
  fetchStreetLevelCrimes,
  locateNeighbourhood,
} from "@/lib/police-api";
import { prisma } from "@/lib/prisma";

/**
 * Where the police figures are kept, and how they get there. **Server only.**
 *
 * `src/lib/police-api.ts` is the half that talks to the Home Office;
 * `src/lib/police-report.ts` is the half a browser can import. This is the
 * middle: it writes what comes back into Postgres and reads it out again for the
 * dashboard and for `/reports`.
 *
 * ## The cache is the database
 *
 * There is no in-memory layer and there should not be. The data is published
 * once a calendar month, a village needs six months of it, and the whole point
 * of storing it is that a page render never waits on a third party. What makes
 * it a cache rather than an archive is `PoliceDataSync`: one row per
 * village-month saying when it was last fetched and how it went.
 *
 * Two decisions rest on that row, and the second is the one worth reading twice:
 *
 * 1. **A month fetched inside `POLICE_REFRESH_DAYS` is not fetched again.** The
 *    source is monthly, so anything more often buys nothing — except that
 *    *outcomes* are revised after publication as investigations close, so it is
 *    not "never" either.
 * 2. **A month with no row has never been asked for; a month with a row and a
 *    count of zero is a month the police published with nothing in it.** A
 *    `count(*)` over `police_crimes` cannot tell those apart, and it returns
 *    zero for both. Printing "0 recorded crimes" for a month nobody ever
 *    fetched, in a document addressed to the police, is a false statement made
 *    by arithmetic that is individually correct — which is exactly the class of
 *    error this file exists to avoid. Every read below carries the months it
 *    actually holds and the months it does not.
 *
 * ## A month is replaced, never merged
 *
 * `syncVillageMonth` deletes the village-month and re-inserts it in one
 * transaction. Merging would leave behind any record the Home Office has since
 * withdrawn — they do withdraw records — and the resulting month would be a
 * count no published figure agrees with, drifting further from the source on
 * every refresh.
 *
 * ## Every read degrades rather than throws
 *
 * The three tables arrive with `20260822120000_police_crime_data`, which a
 * deployment may not have applied — the same state `getVillageParishCouncil`
 * and `getVillagePrivacyLevel` handle for their columns, and handled the same
 * way here. A dashboard and a police report must not fail because an optional
 * enrichment has no table behind it; they render without the section, which is
 * what a village that has never synced sees anyway.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Tolerating an unapplied migration
// ---------------------------------------------------------------------------

/**
 * Postgres `42P01` — undefined table — however Prisma happens to surface it.
 *
 * The sibling of `isMissingComplianceColumn` and `isMissingParishCouncilColumn`,
 * one level up: those ask whether a column exists, this asks whether the table
 * does. `P2021` is Prisma's own typed code for it, the driver adapter can pass
 * the raw SQLSTATE straight through, and the message is the last resort.
 *
 * Matched narrowly on purpose. A broad catch here would swallow a genuinely
 * unreachable database and render a dashboard that quietly says a village has
 * no police data when what it has is no connection.
 */
function isMissingPoliceTable(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;

  const code = (cause as { code?: unknown }).code;
  if (code === "P2021" || code === "42P01") return true;

  const message = (cause as { message?: unknown }).message;
  return typeof message === "string" && message.includes("police_");
}

/**
 * Runs a read, and answers `fallback` if the tables are not there yet.
 *
 * Anything else is rethrown — an unreachable database is not the same problem
 * as an unapplied migration, and the page above knows what to do with the first
 * and can do nothing about the second.
 */
async function tolerant<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (cause) {
    if (isMissingPoliceTable(cause)) {
      console.warn(
        "Police data tables are missing — has 20260822120000_police_crime_data " +
          "been applied? Rendering without the official figures.",
      );
      return fallback;
    }

    throw cause;
  }
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type PoliceSyncStatus =
  /** Fetched, and stored — whatever the count. */
  | "ok"
  /** The service has not published this month yet. The ordinary recent state. */
  | "empty"
  /** More recorded crime in the area than the API will return in one request. */
  | "unavailable"
  /** A timeout, a network error, or a body that would not parse. */
  | "failed"
  /** Not fetched: the stored copy is younger than `POLICE_REFRESH_DAYS`. */
  | "cached";

export type PoliceMonthOutcome = {
  month: string;
  status: PoliceSyncStatus;
  crimes: number;
  detail?: string;
};

/** The village fields a sync needs. Nothing here is personal data. */
export type SyncableVillage = {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
};

/**
 * Whether this village-month is due a fetch.
 *
 * `failed` and `empty` are retried on the next run rather than held for
 * `POLICE_REFRESH_DAYS` — the first because a timeout says nothing about the
 * data, and the second because "not published yet" is a statement about the
 * calendar that stops being true. `ok` is the only status that earns the full
 * cache window.
 */
function isFresh(
  sync: { status: string; fetchedAt: Date } | undefined,
  now: Date,
): boolean {
  if (!sync) return false;
  if (sync.status !== "ok") return false;

  return now.getTime() - sync.fetchedAt.getTime() < POLICE_REFRESH_DAYS * DAY_MS;
}

/**
 * Fetches and stores one village-month.
 *
 * Returns rather than throws, on the contract every caller here depends on: a
 * sync walks villages and months in sequence and one bad month must not end the
 * run. The outcome is written to `PoliceDataSync` in the same transaction as the
 * crimes, so the bookkeeping and the rows it describes cannot disagree.
 */
export async function syncVillageMonth(input: {
  village: SyncableVillage;
  month: string;
  now?: Date;
}): Promise<PoliceMonthOutcome> {
  const { village, month } = input;
  const now = input.now ?? new Date();

  if (!isPoliceMonth(month)) {
    return { month, status: "failed", crimes: 0, detail: "Not a YYYY-MM month" };
  }

  const result = await fetchStreetLevelCrimes({
    lat: village.centerLat,
    lng: village.centerLng,
    month,
  });

  if (!result.ok) {
    /*
      A 404 is the service saying it has not published this month, which is the
      ordinary state of the two most recent months and is not a failure. It is
      recorded as `empty` with a count of zero — and the distinction from a
      village-month with no row at all is the whole reason this table exists:
      one is "the police published nothing", the other is "we never asked", and
      only the first may be rendered as a figure.
    */
    const status: PoliceSyncStatus =
      result.code === "no_data"
        ? "empty"
        : result.code === "too_many_crimes"
          ? "unavailable"
          : "failed";

    await recordSync({
      villageId: village.id,
      month,
      status,
      crimeCount: 0,
      detail: result.message,
      fetchedAt: now,
      // A failure must not overwrite a month that was fetched successfully
      // before it. The figures already stored are the last known good ones, and
      // replacing them with nothing because a request timed out would take a
      // section out of a report for no reason at all.
      keepExistingCrimes: true,
    });

    return { month, status, crimes: 0, detail: result.message };
  }

  const { crimes, dropped, truncated } = result.data;

  const notes: string[] = [];
  if (dropped > 0) notes.push(`${dropped} record(s) did not parse`);
  if (truncated) {
    notes.push(
      `capped at ${POLICE_MAX_CRIMES_PER_MONTH} — the area returned more`,
    );
  }

  await prisma.$transaction([
    // Replace, never merge. See the header: the Home Office withdraws records,
    // and a merged month is a count no published figure agrees with.
    prisma.policeCrime.deleteMany({ where: { villageId: village.id, month } }),
    prisma.policeCrime.createMany({
      data: crimes.map((crime) => ({
        villageId: village.id,
        crimeId: crime.crimeId,
        persistentId: crime.persistentId,
        month,
        category: crime.category,
        lat: crime.lat,
        lng: crime.lng,
        streetId: crime.streetId,
        streetName: crime.streetName,
        locationType: crime.locationType,
        locationSubtype: crime.locationSubtype,
        context: crime.context,
        outcomeCategory: crime.outcomeCategory,
        outcomeDate: crime.outcomeDate,
        fetchedAt: now,
      })),
      // The unique key is a backstop against two runs racing, not the
      // mechanism — the delete above is. Skipping duplicates rather than
      // failing means a race costs a partial month rather than a thrown
      // transaction and no month at all.
      skipDuplicates: true,
    }),
    syncUpsert({
      villageId: village.id,
      month,
      status: "ok",
      crimeCount: crimes.length,
      detail: notes.length > 0 ? notes.join("; ") : null,
      fetchedAt: now,
    }),
  ]);

  return {
    month,
    status: "ok",
    crimes: crimes.length,
    detail: notes.length > 0 ? notes.join("; ") : undefined,
  };
}

/** The upsert both write paths share, as a statement rather than a call. */
function syncUpsert(data: {
  villageId: string;
  month: string;
  status: PoliceSyncStatus;
  crimeCount: number;
  detail: string | null;
  fetchedAt: Date;
}) {
  return prisma.policeDataSync.upsert({
    where: {
      villageId_month: { villageId: data.villageId, month: data.month },
    },
    create: data,
    update: {
      status: data.status,
      crimeCount: data.crimeCount,
      detail: data.detail,
      fetchedAt: data.fetchedAt,
    },
  });
}

/**
 * Records an outcome that stored no crimes.
 *
 * `keepExistingCrimes` is always true today and is a parameter rather than an
 * assumption, because the alternative is the kind of thing a later change makes
 * by accident: clearing a village's stored figures because one refresh timed
 * out would silently shorten a report, and nothing on the page would say why.
 * The count written is the count *this run* stored, which is zero; the figures
 * a reader sees still come from `police_crimes`.
 */
async function recordSync({
  keepExistingCrimes,
  ...data
}: {
  villageId: string;
  month: string;
  status: PoliceSyncStatus;
  crimeCount: number;
  detail: string | null;
  fetchedAt: Date;
  keepExistingCrimes: boolean;
}): Promise<void> {
  if (!keepExistingCrimes) {
    await prisma.policeCrime.deleteMany({
      where: { villageId: data.villageId, month: data.month },
    });
  }

  /*
    Destructured rather than passed whole, and that is the fix for a bug that
    took a whole run down. `keepExistingCrimes` is application logic — it decides
    whether the stored month is cleared above — and there is no such column on
    `PoliceDataSync`, so handing the argument object straight to `syncUpsert`
    put an unknown field in the `create` block and Prisma rejected the write.

    TypeScript could not catch it: excess-property checking applies to object
    literals, not to a variable that happens to carry more properties than the
    parameter type names. The separation has to be made here, in code.
  */
  await syncUpsert(data);
}

/**
 * Brings a village's stored police figures up to date.
 *
 * Newest month first, so a run that hits its budget has fetched the months
 * anybody is actually looking at. `budget` is the number of outbound calls this
 * village may spend; the caller holds the run-wide ceiling and hands out what
 * is left, which is what stops a deployment with forty parishes timing out
 * halfway through with no record of where it got to.
 */
export async function syncVillagePoliceData(input: {
  village: SyncableVillage;
  /** `YYYY-MM`, newest first. */
  months: readonly string[];
  budget: number;
  now?: Date;
  /** Re-fetch even a month inside the cache window. */
  force?: boolean;
}): Promise<{ outcomes: PoliceMonthOutcome[]; spent: number }> {
  const now = input.now ?? new Date();

  const existing = await prisma.policeDataSync.findMany({
    where: { villageId: input.village.id, month: { in: [...input.months] } },
    select: { month: true, status: true, fetchedAt: true },
  });

  const bySync = new Map(existing.map((row) => [row.month, row]));

  const outcomes: PoliceMonthOutcome[] = [];
  let spent = 0;

  for (const month of input.months) {
    const cached = bySync.get(month);

    if (!input.force && isFresh(cached, now)) {
      outcomes.push({
        month,
        status: "cached",
        crimes: 0,
        detail: "Already held and still fresh",
      });
      continue;
    }

    if (spent >= input.budget) {
      // Reported rather than skipped silently. A run that quietly stopped
      // covering the last two months would look exactly like a village with no
      // recent crime — see "No silent caps" in the sync route.
      outcomes.push({
        month,
        status: "cached",
        crimes: 0,
        detail: "Not fetched this run — the request budget was spent",
      });
      continue;
    }

    spent += 1;
    outcomes.push(await syncVillageMonth({ village: input.village, month, now }));
  }

  return { outcomes, spent };
}

/**
 * Resolves and stores the policing neighbourhood a village sits in.
 *
 * Three calls: which neighbourhood, then its page, then its team. Worth the
 * three because the answer changes about as often as a force reorganises, so
 * this runs when the row is missing or `POLICE_REFRESH_DAYS` old and not
 * otherwise.
 *
 * Returns the number of outbound calls spent so the caller's budget stays
 * honest, and null for a village the service has no neighbourhood for — which
 * is a real answer for a point outside England, Wales and Northern Ireland
 * rather than a fault.
 */
export async function refreshVillageNeighbourhood(input: {
  village: SyncableVillage;
  now?: Date;
  force?: boolean;
}): Promise<{ spent: number; detail: string }> {
  const now = input.now ?? new Date();

  const existing = await prisma.policeNeighbourhood.findUnique({
    where: { villageId: input.village.id },
    select: { fetchedAt: true },
  });

  if (
    !input.force &&
    existing &&
    now.getTime() - existing.fetchedAt.getTime() < POLICE_REFRESH_DAYS * DAY_MS
  ) {
    return { spent: 0, detail: "Already held and still fresh" };
  }

  const located = await locateNeighbourhood({
    lat: input.village.centerLat,
    lng: input.village.centerLng,
  });

  if (!located.ok) {
    return {
      spent: 1,
      detail:
        located.code === "no_data"
          ? "data.police.uk covers no neighbourhood at this point"
          : located.message,
    };
  }

  const { force, neighbourhood } = located.data;

  const detail = await fetchNeighbourhood(force, neighbourhood);

  if (!detail.ok) {
    return { spent: 2, detail: detail.message };
  }

  const team = await fetchNeighbourhoodTeam(force, neighbourhood);

  const members: PoliceTeamMember[] = team.ok ? team.data : [];

  const data = {
    forceId: force,
    // The API has no endpoint that names a force from its slug in the shape
    // this needs, and `/forces` would be a fourth call for a string a reader
    // can already see. Title-cased from the slug — "cambridgeshire" reads as
    // "Cambridgeshire", which is what a force is called.
    forceName: forceDisplayName(force),
    neighbourhoodId: detail.data.neighbourhoodId,
    name: detail.data.name,
    description: detail.data.description,
    urlForce: detail.data.urlForce,
    centreLat: detail.data.centreLat,
    centreLng: detail.data.centreLng,
    email: detail.data.email,
    telephone: detail.data.telephone,
    facebook: detail.data.facebook,
    twitter: detail.data.twitter,
    team: members as unknown as Prisma.InputJsonValue,
    fetchedAt: now,
  };

  await prisma.policeNeighbourhood.upsert({
    where: { villageId: input.village.id },
    create: { villageId: input.village.id, ...data },
    update: data,
  });

  return {
    spent: 3,
    detail: `${detail.data.name} (${force}), ${members.length} officer(s)`,
  };
}

/** "cambridgeshire" → "Cambridgeshire", "avon-and-somerset" → "Avon and Somerset". */
function forceDisplayName(force: string): string {
  const small = new Set(["and", "of", "the"]);

  return force
    .split("-")
    .filter(Boolean)
    .map((word, index) =>
      index > 0 && small.has(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * The official figures for the calendar months a period overlaps, beside this
 * village's own published count for exactly those months.
 *
 * ## Why the comparison is over whole months and not the period
 *
 * Because the published data has no finer grain. A report covering 12 July to
 * 5 August overlaps two months and the police series can offer both in full or
 * neither — so the honest comparison counts VillageWatch's own reports over the
 * *same whole months*, and every surface says which months those are. Counting
 * VillageWatch over the exact period and the police over whole months would put
 * two numbers side by side that were measured over different spans, which is
 * the failure this whole section is shaped to avoid.
 *
 * ## Null means "nothing to show", not "nothing happened"
 *
 * Returned when the village has never been synced and has no neighbourhood on
 * file. The section is then omitted entirely rather than rendered empty: a
 * heading reading "Police recorded crime" over a zero, in a document sent to a
 * PCSO, is a claim about their own figures that this deployment is in no
 * position to make.
 */
export async function getVillagePoliceComparison(input: {
  villageId: string;
  from: Date;
  to: Date;
}): Promise<PoliceComparison | null> {
  const wanted = policeMonthsBetween(input.from, input.to);

  if (wanted.length === 0) return null;

  return tolerant(async () => {
    const [syncs, grouped, neighbourhood] = await Promise.all([
      prisma.policeDataSync.findMany({
        where: { villageId: input.villageId, month: { in: wanted } },
        select: { month: true, status: true, crimeCount: true, fetchedAt: true },
      }),
      prisma.policeCrime.groupBy({
        by: ["category"],
        where: { villageId: input.villageId, month: { in: wanted } },
        _count: { _all: true },
      }),
      prisma.policeNeighbourhood.findUnique({
        where: { villageId: input.villageId },
        select: { forceId: true, forceName: true, name: true },
      }),
    ]);

    // `ok` and `empty` are both months the service answered for: one with
    // figures, one with a documented absence. `failed` and `unavailable` are
    // not — we do not know what those months hold, and a month we do not know
    // about is reported as missing rather than as zero.
    const held = syncs
      .filter((row) => row.status === "ok" || row.status === "empty")
      .map((row) => row.month)
      .sort();

    const heldSet = new Set(held);
    const missing = wanted.filter((month) => !heldSet.has(month));

    if (held.length === 0 && !neighbourhood) return null;

    const total = grouped.reduce((sum, row) => sum + row._count._all, 0);

    const byCategory = grouped
      .map((row) => ({
        category: row.category,
        label: policeCategoryLabel(row.category),
        count: row._count._all,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, POLICE_CATEGORY_LIMIT);

    const villageReports =
      held.length === 0
        ? 0
        : await prisma.incident.count({
            where: {
              villageId: input.villageId,
              status: { in: [...PUBLIC_INCIDENT_STATUSES] },
              // One range per held month rather than first-to-last. The months
              // are contiguous in every real case; an OR is exactly right in
              // every case, and the difference costs nothing at 24 months.
              OR: held.map((month) => ({ occurredAt: monthRange(month) })),
            },
          });

    const fetchedAt = syncs.reduce<Date | null>(
      (latest, row) =>
        !latest || row.fetchedAt > latest ? row.fetchedAt : latest,
      null,
    );

    return {
      months: held,
      missingMonths: missing,
      total,
      byCategory,
      villageReports,
      force: neighbourhood?.forceId ?? null,
      forceName: neighbourhood?.forceName ?? null,
      neighbourhood: neighbourhood?.name ?? null,
      latestMonth: held.length > 0 ? held[held.length - 1] : null,
      fetchedAt: fetchedAt?.toISOString() ?? null,
    } satisfies PoliceComparison;
  }, null);
}

/** `occurredAt` bounds for one `YYYY-MM`, UTC, end-exclusive. */
function monthRange(month: string): { gte: Date; lt: Date } {
  const [year, index] = month.split("-").map(Number);

  return {
    gte: new Date(Date.UTC(year, index - 1, 1)),
    lt: new Date(Date.UTC(year, index, 1)),
  };
}

/**
 * The village's policing neighbourhood and the officers covering it.
 *
 * The answer to "who is our PCSO", which nothing in VillageWatch could give a
 * coordinator before. Null until a sync has run, and null on a database without
 * the tables — both render as the same absence, because both are.
 */
export async function getVillagePoliceTeam(
  villageId: string,
): Promise<PoliceTeam | null> {
  return tolerant(async () => {
    const row = await prisma.policeNeighbourhood.findUnique({
      where: { villageId },
      select: {
        forceId: true,
        forceName: true,
        neighbourhoodId: true,
        name: true,
        description: true,
        urlForce: true,
        email: true,
        telephone: true,
        twitter: true,
        facebook: true,
        team: true,
        fetchedAt: true,
      },
    });

    if (!row) return null;

    return {
      force: row.forceId,
      forceName: row.forceName,
      neighbourhoodId: row.neighbourhoodId,
      name: row.name,
      description: row.description,
      url: row.urlForce,
      email: row.email,
      telephone: row.telephone,
      twitter: row.twitter,
      facebook: row.facebook,
      members: narrowTeam(row.team),
      fetchedAt: row.fetchedAt.toISOString(),
    } satisfies PoliceTeam;
  }, null);
}

/**
 * Narrows the stored `team` JSON back to a list of officers.
 *
 * A `Json` column is `unknown` on the way out and this one was written by an
 * earlier build of this same file — which is precisely why it is narrowed
 * rather than cast. A row written before a field was added, or by hand in
 * Prisma Studio, must render as a shorter list and never as a component
 * reading `.name` off a number.
 */
function narrowTeam(value: unknown): PoliceTeamMember[] {
  if (!Array.isArray(value)) return [];

  const members: PoliceTeamMember[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;

    const record = entry as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";

    if (!name) continue;

    members.push({
      name,
      rank: typeof record.rank === "string" && record.rank.trim() ? record.rank.trim() : null,
      email:
        typeof record.email === "string" && record.email.trim()
          ? record.email.trim()
          : null,
    });
  }

  return members;
}
