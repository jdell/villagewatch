import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { cronUnauthorised, isCronAuthorised } from "@/lib/cron";
import {
  generateWeeklyDigest,
  peakSeverity,
  type DigestIncident,
} from "@/lib/ai/weekly-digest";
import { notifyCoordinatorsOfDigest } from "@/lib/notifications";
import { logDigestAlert } from "@/lib/whatsapp-channel";
import {
  DIGEST_MAX_INCIDENTS,
  DIGEST_WINDOW_DAYS,
  PUBLIC_INCIDENT_STATUSES,
} from "@/lib/constants";

/**
 * POST|GET /api/digest — the weekly sweep, run by Vercel Cron on Sunday 09:00 UTC.
 *
 * For every active village: read the week's published incidents, have Claude
 * summarise them, write a `PatternAlert`, and push the summary to that
 * village's coordinators. This is the job CLAUDE.md listed as Day 5 — the thing
 * that finally creates `PatternAlert` rows, which until now were only ever a
 * schema.
 *
 * Notes on the shape of it:
 *
 * - **`CRON_SECRET` is required, and compared in constant time.** Vercel Cron
 *   sends it as `Authorization: Bearer …`. An unauthenticated caller could
 *   otherwise run up an Anthropic bill and push to every coordinator in every
 *   village.
 * - **Published incidents only** (domain rule 6). A digest is shown to
 *   residents through the coordinator, so feeding it the review queue would
 *   describe reports nobody has cleared.
 * - **One village's failure does not stop the sweep.** Villages are processed
 *   in sequence and each is caught individually; the response reports what
 *   happened to each so a failure is visible in the cron log rather than
 *   silently skipped.
 * - **The digest survives the AI being unavailable.** With no key or after a
 *   rate limit it writes a plain counted summary instead, because the useful
 *   half of this job — "here is your week, in one place" — is arithmetic.
 */

export const dynamic = "force-dynamic";

/**
 * 60s is what every Vercel plan allows, and the sweep is sequential — one
 * Claude call per village, each a few seconds. Raise it once a deployment has
 * enough villages to need longer; setting it above the plan's ceiling fails the
 * deploy rather than the request, which is a worse way to find out.
 */
export const maxDuration = 60;

type VillageOutcome = {
  village: string;
  incidents: number;
  status: "written" | "skipped" | "failed";
  detail?: string;
  patternAlertId?: string;
  notified?: number;
  /**
   * Whether the summary was also written out as a WhatsApp Channel alert for
   * this village. Nothing is posted — there is no relay; see
   * `src/lib/whatsapp-channel.ts`.
   */
  channel?: string;
};

async function runDigest(request: NextRequest) {
  // Shared with `/api/cron/retention` — see `src/lib/cron.ts`. No secret
  // configured means no scheduled route at all: this endpoint spends money and
  // pushes to people's phones, so failing closed is the only safe default.
  if (!isCronAuthorised(request)) return cronUnauthorised();

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "The database is not configured on this deployment." },
      { status: 503 },
    );
  }

  const now = new Date();
  const windowMs = DIGEST_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const windowStart = new Date(now.getTime() - windowMs);
  const previousStart = new Date(now.getTime() - 2 * windowMs);

  const villages = await prisma.village.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const outcomes: VillageOutcome[] = [];

  for (const village of villages) {
    try {
      outcomes.push(
        await digestVillage({ village, now, windowStart, previousStart }),
      );
    } catch (cause) {
      console.error("Weekly digest failed for village %s", village.id, cause);
      outcomes.push({
        village: village.name,
        incidents: 0,
        status: "failed",
        detail: cause instanceof Error ? cause.message : "Unknown failure",
      });
    }
  }

  return NextResponse.json({
    ranAt: now.toISOString(),
    windowStart: windowStart.toISOString(),
    villages: outcomes,
  });
}

async function digestVillage(input: {
  village: { id: string; name: string };
  now: Date;
  windowStart: Date;
  previousStart: Date;
}): Promise<VillageOutcome> {
  const { village, now, windowStart, previousStart } = input;

  const [rows, previousPeriodCount] = await Promise.all([
    prisma.incident.findMany({
      where: {
        villageId: village.id,
        status: { in: [...PUBLIC_INCIDENT_STATUSES] },
        occurredAt: { gte: windowStart, lte: now },
      },
      select: {
        id: true,
        reference: true,
        type: true,
        severity: true,
        title: true,
        // The anonymised public column. `rawDescription` is never read here.
        description: true,
        locationText: true,
        occurredAt: true,
        lat: true,
        lng: true,
      },
      orderBy: { occurredAt: "desc" },
      take: DIGEST_MAX_INCIDENTS,
    }),
    prisma.incident.count({
      where: {
        villageId: village.id,
        status: { in: [...PUBLIC_INCIDENT_STATUSES] },
        occurredAt: { gte: previousStart, lt: windowStart },
      },
    }),
  ]);

  if (rows.length === 0) {
    return { village: village.name, incidents: 0, status: "skipped", detail: "Nothing published this week" };
  }

  const incidents: DigestIncident[] = rows.map((row) => ({
    reference: row.reference,
    type: row.type,
    severity: row.severity,
    title: row.title,
    description: row.description,
    locationText: row.locationText,
    occurredAt: row.occurredAt,
  }));

  const result = await generateWeeklyDigest({
    villageName: village.name,
    incidents,
    previousPeriodCount,
    now,
  });

  const digest = result.ok ? result.data : fallbackDigest(incidents, previousPeriodCount);

  if (!result.ok) {
    console.warn(
      "Weekly digest for %s fell back to a counted summary: %s",
      village.name,
      result.code,
    );
  }

  const centroid = averageCoordinates(rows);

  const alert = await prisma.patternAlert.create({
    data: {
      villageId: village.id,
      title: digest.title,
      summary: buildSummaryText(digest),
      type: dominantType(rows),
      severity: digest.severity,
      incidentCount: incidents.length,
      windowStart,
      windowEnd: now,
      centroidLat: centroid?.lat,
      centroidLng: centroid?.lng,
      confidence: result.ok ? digest.confidence : 0,
      detector: result.ok ? "claude-weekly-digest" : "weekly-count",
      notifiedAt: now,
      // Links the cluster back to the reports behind it, so a coordinator
      // opening the alert can see exactly what it summarised.
      incidents: { connect: rows.map((row) => ({ id: row.id })) },
    },
    select: { id: true },
  });

  const push = await notifyCoordinatorsOfDigest({
    villageId: village.id,
    patternAlertId: alert.id,
    title: digest.title,
    summary: digest.summary,
  });

  // The public half of the week's roundup, for villages that run a channel.
  // `digest.summary` only — the hotspots and advice folded into the
  // `PatternAlert` above are a working document for coordinators, and the
  // hotspot lines in particular name the areas a village is worried about,
  // which is not something to put in front of an unauthenticated audience.
  const channel = await logDigestAlert({
    villageId: village.id,
    title: digest.title,
    summary: digest.summary,
  });

  return {
    village: village.name,
    incidents: incidents.length,
    status: "written",
    patternAlertId: alert.id,
    notified: push.sent,
    channel: channel.logged ? "logged" : channel.skipped,
    detail: result.ok ? `Summarised by ${result.model}` : `AI unavailable (${result.code})`,
  };
}

/**
 * The summary, hotspots and advice flattened into the one `summary` column.
 *
 * `PatternAlert.summary` is plain text and the dashboard renders it as
 * paragraphs, so the structure the model produced is folded down here rather
 * than a JSON blob being stashed in a text field.
 */
function buildSummaryText(digest: {
  summary: string;
  hotspots: readonly { location: string; note: string }[];
  advice: readonly string[];
}): string {
  const parts = [digest.summary];

  for (const hotspot of digest.hotspots) {
    parts.push(`${hotspot.location}: ${hotspot.note}`);
  }

  for (const line of digest.advice) {
    parts.push(line);
  }

  return parts.join("\n\n");
}

/**
 * What the digest says when Claude is unavailable.
 *
 * Deliberately bare. A week's counts and the busiest area are still worth
 * pushing to a coordinator, and inventing prose to fill the gap would make an
 * outage indistinguishable from a working summary.
 */
function fallbackDigest(
  incidents: readonly DigestIncident[],
  previousPeriodCount: number,
) {
  const change = incidents.length - previousPeriodCount;
  const direction =
    previousPeriodCount === 0
      ? ""
      : change === 0
        ? " That is the same as the week before."
        : ` That is ${Math.abs(change)} ${change > 0 ? "more" : "fewer"} than the week before.`;

  const busiest = [...countBy(incidents, (i) => i.locationText?.trim() || "No location given")]
    .sort((a, b) => b[1] - a[1])[0];

  return {
    title: `${incidents.length} report${incidents.length === 1 ? "" : "s"} this week`,
    summary:
      `${incidents.length} incident${incidents.length === 1 ? " was" : "s were"} published in the last ${DIGEST_WINDOW_DAYS} days.${direction}` +
      (busiest && busiest[1] > 1 ? ` The most reported area was ${busiest[0]} with ${busiest[1]}.` : ""),
    hotspots: [] as { location: string; note: string }[],
    advice: [] as string[],
    severity: peakSeverity(incidents),
    confidence: 0,
  };
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

function dominantType(rows: readonly { type: DigestIncident["type"] }[]) {
  const counts = countBy(rows, (row) => row.type);
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  // Only call it a dominant type when it actually dominates. A week of six
  // different things has no type, and labelling the alert with whichever
  // happened to sort first would be worse than leaving it null.
  if (!top || top[1] * 2 <= rows.length) return undefined;

  return top[0] as DigestIncident["type"];
}

/**
 * Rough centre of the week's reports, for the alert's map pin.
 *
 * A plain mean rather than a real centroid: the points are already fuzzed by
 * `LOCATION_FUZZ_METERS` (domain rule 2), and a village spans a few hundred
 * metres, so the extra precision would be noise on top of noise.
 */
function averageCoordinates(
  rows: readonly { lat: number | null; lng: number | null }[],
): { lat: number; lng: number } | null {
  const located = rows.filter(
    (row): row is { lat: number; lng: number } =>
      row.lat !== null && row.lng !== null,
  );

  if (located.length === 0) return null;

  return {
    lat: located.reduce((sum, row) => sum + row.lat, 0) / located.length,
    lng: located.reduce((sum, row) => sum + row.lng, 0) / located.length,
  };
}

export const POST = runDigest;

/**
 * Vercel Cron issues a `GET`. Same handler, same secret — there is nothing here
 * that a GET should be allowed to do and a POST should not.
 */
export const GET = runDigest;
