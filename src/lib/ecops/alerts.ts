import {
  ECOPS_MAX_ITEMS_PER_SYNC,
  ECOPS_PANEL_SIZE,
  ECOPS_RETENTION_DAYS,
} from "@/lib/constants";
import { fetchEcopsAlerts, type EcopsAlertItem } from "@/lib/ecops/fetch-alerts";
import { prisma } from "@/lib/prisma";

/**
 * The Prisma half of the eCops integration. **Server only.**
 *
 * `fetch-alerts.ts` reads somebody else's feed; this stores it, reads it back
 * and records what happened. The split is `police-api.ts` / `police-data.ts`
 * exactly, and for the same reason: the client is testable against a stubbed
 * `fetch` with no database, and the storage rules are testable with Prisma
 * mocked at its boundary.
 *
 * ## Two honesty rules, both inherited
 *
 * **A failed refresh keeps what is held.** A panel vanishing because a feed
 * timed out is worse than a stale one that says when it was last read. Only a
 * successful fetch writes alerts; a failure writes the sync row and nothing
 * else.
 *
 * **`empty` is a recorded outcome, not an absence of one.** This matters more
 * here than it does for the police figures, because the feed gives us less to
 * work with: a mistyped `SiteId`, a site that has published nothing this month,
 * and a site nobody has ever fetched all answer `200` with a well-formed empty
 * channel. Without `EcopsSiteSync` a coordinator who typed the wrong number
 * would see an empty panel that looks exactly like a quiet week, for ever.
 *
 * ## Every read degrades
 *
 * `20260905140000_ecops_alerts` may not be applied, and the panel it feeds sits
 * on the coordinator's Overview beside four other panels. An exception here
 * would take out the whole dashboard for an optional feature — so a missing
 * table or a missing column reads as "no alerts", which is what a village that
 * has never configured a site sees anyway.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Tolerating an unapplied migration
// ---------------------------------------------------------------------------

/**
 * The tables or the `villages.ecops_site_id` column not being there yet.
 *
 * Broader than `isMissingPoliceTable` by exactly one case, and it needs to be:
 * this feature adds a **column to an existing table** as well as two new
 * tables, so a database part-way through the migration can fail either way.
 * `P2021`/`42P01` is the missing table, `P2022`/`42703` the missing column.
 *
 * Still matched narrowly. A broad catch would swallow an unreachable database
 * and render a dashboard quietly claiming a village has no police alerts when
 * what it has is no connection.
 */
function isMissingEcopsSchema(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;

  const code = (cause as { code?: unknown }).code;

  if (
    code === "P2021" ||
    code === "42P01" ||
    code === "P2022" ||
    code === "42703"
  ) {
    return true;
  }

  const message = (cause as { message?: unknown }).message;

  return (
    typeof message === "string" &&
    (message.includes("ecops_") || message.includes("ecops_site_id"))
  );
}

/** Runs a read, answering `fallback` where the migration has not landed. */
async function tolerant<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (cause) {
    if (isMissingEcopsSchema(cause)) return fallback;
    throw cause;
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** One alert, as a screen renders it. */
export type VillageEcopsAlert = {
  id: string;
  title: string;
  summary: string;
  category: string | null;
  sentBy: string | null;
  senderName: string | null;
  link: string | null;
  publishedAt: Date;
};

/**
 * What a village has, and what it does not.
 *
 * `siteId` being null is the ordinary state: the feature is off until a
 * coordinator sets one. That is deliberately distinguishable from a site set
 * and never fetched (`status: null`) and from a site fetched and empty
 * (`status: "empty"`), because those three want three different sentences on
 * screen and only one of them is "nothing has gone wrong".
 */
export type VillageEcopsAlerts = {
  siteId: number | null;
  alerts: VillageEcopsAlert[];
  /** `ok` | `empty` | `failed`, or null where the site has never been read. */
  status: string | null;
  lastSuccessAt: Date | null;
  lastAttemptAt: Date | null;
};

/**
 * The alerts for one village, newest first.
 *
 * Two queries rather than a join: the village row answers *which* site, and the
 * alerts are shared by every village on that site, so there is no relation
 * between them to traverse. It is also what keeps the read degrading cleanly —
 * a database missing the column returns a null site and stops.
 */
export async function getVillageEcopsAlerts(
  villageId: string,
  limit: number = ECOPS_PANEL_SIZE,
): Promise<VillageEcopsAlerts> {
  const empty: VillageEcopsAlerts = {
    siteId: null,
    alerts: [],
    status: null,
    lastSuccessAt: null,
    lastAttemptAt: null,
  };

  if (!process.env.DATABASE_URL) return empty;

  return tolerant(async () => {
    const village = await prisma.village.findUnique({
      where: { id: villageId },
      select: { ecopsSiteId: true },
    });

    const siteId = village?.ecopsSiteId ?? null;

    if (siteId === null) return empty;

    const [alerts, sync] = await Promise.all([
      prisma.ecopsAlert.findMany({
        where: { siteId },
        orderBy: { publishedAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          summary: true,
          category: true,
          sentBy: true,
          senderName: true,
          link: true,
          publishedAt: true,
        },
      }),
      prisma.ecopsSiteSync.findUnique({ where: { siteId } }),
    ]);

    return {
      siteId,
      alerts,
      status: sync?.status ?? null,
      lastSuccessAt: sync?.lastSuccessAt ?? null,
      lastAttemptAt: sync?.lastAttemptAt ?? null,
    };
  }, empty);
}

/**
 * Just the site a village reads, for the settings form.
 *
 * Separate from `getVillageEcopsAlerts` because the form needs the number and
 * none of the alerts, and `/dashboard/settings` renders six other panels — a
 * read that threw on an unmigrated database would take all of them down for a
 * setting that is off by default.
 */
export async function getVillageEcopsSiteId(
  villageId: string,
): Promise<number | null> {
  if (!process.env.DATABASE_URL) return null;

  return tolerant(async () => {
    const village = await prisma.village.findUnique({
      where: { id: villageId },
      select: { ecopsSiteId: true },
    });

    return village?.ecopsSiteId ?? null;
  }, null);
}

/**
 * The distinct sites the deployment actually needs, for the cron.
 *
 * Distinct rather than one per village, which is the whole reason these rows
 * are site-scoped: a county's ten parishes share one fetch. `ACTIVE` only —
 * fetching for a seeded directory entry nobody has activated would spend a
 * request on a village with no residents to read it.
 */
export async function listConfiguredEcopsSites(): Promise<number[]> {
  if (!process.env.DATABASE_URL) return [];

  return tolerant(async () => {
    const rows = await prisma.village.findMany({
      where: { status: "ACTIVE", ecopsSiteId: { not: null } },
      select: { ecopsSiteId: true },
      distinct: ["ecopsSiteId"],
    });

    return rows
      .map((row) => row.ecopsSiteId)
      .filter((id): id is number => id !== null)
      .sort((a, b) => a - b);
  }, []);
}

// ---------------------------------------------------------------------------
// Syncing
// ---------------------------------------------------------------------------

export type EcopsSyncOutcome = {
  siteId: number;
  status: "ok" | "empty" | "failed";
  /** Rows written — new messages plus ones whose text upstream changed. */
  stored: number;
  /** Items the parser refused. See `EcopsFeed.dropped`. */
  dropped: number;
  /** Rows removed by the prune below. */
  pruned: number;
  truncated: boolean;
  error?: string;
};

/**
 * Reads one site's feed and stores what came back.
 *
 * **Upsert per item rather than a `createMany` that skips duplicates.** A force
 * edits a bulletin after publishing it more often than you would think —
 * correcting a date, adding an incident number — and skipping duplicates would
 * leave the first version on a coordinator's dashboard for ever. The unique key
 * is `(siteId, externalId)`, so a re-fetch of an unchanged message is an update
 * that writes the same values.
 *
 * Sequential rather than a transaction: this is a cache of public notices, so a
 * run interrupted halfway leaves a shorter list rather than a wrong one, and
 * the next run finishes it. A transaction around 200 upserts would hold one
 * connection through pgBouncer for the whole fetch to buy an atomicity nothing
 * here needs.
 */
export async function syncEcopsSite(siteId: number): Promise<EcopsSyncOutcome> {
  const attemptedAt = new Date();
  const result = await fetchEcopsAlerts({ siteId });

  if (!result.ok) {
    await recordSync({
      siteId,
      status: "failed",
      attemptedAt,
      itemCount: 0,
      // The feed's own message, which names a timeout or a status code and
      // never a bulletin's contents.
      error: result.message,
    });

    return {
      siteId,
      status: "failed",
      stored: 0,
      dropped: 0,
      pruned: 0,
      truncated: false,
      error: result.message,
    };
  }

  const { items, dropped, truncated } = result.data;

  if (items.length === 0) {
    // Not a failure, and not nothing either — see the header. A site with no
    // messages and a SiteId that does not exist are the same response, and this
    // row is the only place that distinction can later be reasoned about.
    await recordSync({ siteId, status: "empty", attemptedAt, itemCount: 0 });

    return {
      siteId,
      status: "empty",
      stored: 0,
      dropped,
      pruned: 0,
      truncated,
    };
  }

  let stored = 0;

  for (const item of items) {
    try {
      await storeAlert(siteId, item, attemptedAt);
      stored += 1;
    } catch (cause) {
      if (isMissingEcopsSchema(cause)) throw cause;

      // One unwritable row costs that row. Logged without the body — a bulletin
      // is not a resident's data, but a log line per item would fill the cron
      // log with somebody else's press releases.
      console.error(
        `[ecops] could not store message ${item.externalId} from site ${siteId}`,
      );
    }
  }

  const pruned = await pruneOldAlerts(siteId);

  await recordSync({ siteId, status: "ok", attemptedAt, itemCount: stored });

  return { siteId, status: "ok", stored, dropped, pruned, truncated };
}

async function storeAlert(
  siteId: number,
  item: EcopsAlertItem,
  fetchedAt: Date,
): Promise<void> {
  const row = {
    title: item.title,
    summary: item.summary,
    category: item.category,
    sentBy: item.sentBy,
    senderName: item.senderName,
    link: item.link,
    publishedAt: item.publishedAt,
    fetchedAt,
  };

  await prisma.ecopsAlert.upsert({
    where: {
      siteId_externalId: { siteId, externalId: item.externalId },
    },
    create: { siteId, externalId: item.externalId, ...row },
    update: row,
  });
}

/**
 * Drops alerts past `ECOPS_RETENTION_DAYS`.
 *
 * **This is housekeeping and deliberately not `/api/cron/retention`'s job.**
 * That route enforces the schedule `/privacy` states over residents' own data,
 * and every figure in it is a promise made to somebody. These rows are a cache
 * of public notices published by third parties; mixing the two would put a
 * cache eviction inside the one job whose counts a regulator might ask about.
 *
 * Keyed on `publishedAt` rather than `fetchedAt`: what matters is how old the
 * notice is, not when we happened to read it.
 */
async function pruneOldAlerts(siteId: number): Promise<number> {
  const cutoff = new Date(Date.now() - ECOPS_RETENTION_DAYS * DAY_MS);

  const { count } = await prisma.ecopsAlert.deleteMany({
    where: { siteId, publishedAt: { lt: cutoff } },
  });

  return count;
}

/**
 * Records the attempt, whatever it was.
 *
 * `lastSuccessAt` moves only on `ok`, which is what lets a screen say "read an
 * hour ago, nothing new since Tuesday" rather than conflating the two. An
 * `empty` result is a successful read of a quiet site, so it moves the success
 * timestamp too — the thing it does not do is claim items.
 */
async function recordSync(input: {
  siteId: number;
  status: "ok" | "empty" | "failed";
  attemptedAt: Date;
  itemCount: number;
  error?: string;
}): Promise<void> {
  const succeeded = input.status !== "failed";

  const row = {
    status: input.status,
    lastAttemptAt: input.attemptedAt,
    ...(succeeded ? { lastSuccessAt: input.attemptedAt } : {}),
    itemCount: input.itemCount,
    lastError: input.error ?? null,
  };

  try {
    await prisma.ecopsSiteSync.upsert({
      where: { siteId: input.siteId },
      create: { siteId: input.siteId, ...row },
      update: row,
    });
  } catch (cause) {
    if (isMissingEcopsSchema(cause)) return;

    // Bookkeeping failing must not fail a run that stored alerts.
    console.error(`[ecops] could not record the sync for site ${input.siteId}`);
    console.error(cause);
  }
}

/** How many items one run of a site will take. Exported for the route's copy. */
export const ECOPS_ITEMS_PER_SITE = ECOPS_MAX_ITEMS_PER_SYNC;
