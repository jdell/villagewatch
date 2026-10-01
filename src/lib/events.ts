import type { Session } from "@/lib/auth";
import { auditContext } from "@/lib/audit-context";
import { isCoordinatorRole, EVENT_PAST_LIST_SIZE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

/**
 * Community events. **Server only.**
 *
 * Things happening in a village that are not problems — a litter pick, a
 * parish meeting, a police drop-in. Any resident of a village that has turned
 * them on can post one, and none of the incident machinery applies: no AI pass,
 * no queue, no severity, no `rawDescription`, no votes, no push. See the model's
 * own comment in `prisma/schema.prisma` for that list and why.
 *
 * Two of the domain rules do apply, and this module and `POST /api/events` are
 * where:
 *
 * - **Rule 4 — the village is the tenant boundary.** Every read and every write
 *   here takes a `villageId` the caller resolved from the session, and carries
 *   it in the `where`. An event id from another village reads as not found.
 * - **Rule 2 — coordinates are fuzzed before they are stored.** That happens in
 *   the route, on the way in, so nothing in this file ever holds an exact point.
 *
 * The poster is **not** anonymous. Their name is shown on the event, which is
 * the difference between "a meeting at the hall" and a meeting somebody is
 * answerable for; `/privacy` §2 says so.
 */

// ---------------------------------------------------------------------------
// The village setting
// ---------------------------------------------------------------------------

/**
 * Whether the village has events on, and whether the column exists to say.
 *
 * Two parts for the reason `getVillageParishCouncil` gives: a plain `false`
 * cannot tell "this village has not turned events on" apart from "the
 * migration has not run", and the settings form wants to say which. Every
 * error reads as `available: false` — this is read by the app shell on every
 * authenticated render, and a throw there would take every page down over an
 * optional feature.
 */
export async function readVillageEventsSetting(
  villageId: string,
): Promise<{ available: boolean; enabled: boolean }> {
  if (!process.env.DATABASE_URL) return { available: false, enabled: false };

  try {
    const village = await prisma.village.findUnique({
      where: { id: villageId },
      select: { eventsEnabled: true },
    });
    return { available: true, enabled: village?.eventsEnabled ?? false };
  } catch (cause) {
    console.error(
      "Could not read the events setting for village %s",
      villageId,
      cause,
    );
    return { available: false, enabled: false };
  }
}

/** The boolean alone, for callers that only need to know whether to show events. */
export async function getVillageEventsEnabled(villageId: string): Promise<boolean> {
  return (await readVillageEventsSetting(villageId)).enabled;
}

/**
 * Writes the setting. Takes a `villageId` from the caller's session and never
 * from a form (rule 4). **Throws** on a database error, as
 * `setVillageAutoApprove` does: a save that failed silently would leave a
 * coordinator looking at a switch that reads as on.
 */
export async function setVillageEventsEnabled(
  villageId: string,
  eventsEnabled: boolean,
): Promise<void> {
  await prisma.village.update({
    where: { id: villageId },
    data: { eventsEnabled },
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Every column an event page may show. The poster's id rides along for the
 * delete button's decision; their name is the one public field about them.
 */
const EVENT_SELECT = {
  id: true,
  title: true,
  description: true,
  category: true,
  locationText: true,
  lat: true,
  lng: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  createdById: true,
  createdBy: { select: { fullName: true } },
} as const;

/** One event, flat, with dates as ISO strings so it crosses into a Client Component. */
export type EventView = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  locationText: string | null;
  lat: number | null;
  lng: number | null;
  startsAt: string;
  endsAt: string | null;
  createdById: string;
  /** Shown on the event — events are not anonymous. */
  postedBy: string;
};

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  locationText: string | null;
  lat: number | null;
  lng: number | null;
  startsAt: Date;
  endsAt: Date | null;
  createdById: string;
  createdBy: { fullName: string };
};

function toEventView(row: EventRow): EventView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    locationText: row.locationText,
    lat: row.lat,
    lng: row.lng,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    createdById: row.createdById,
    postedBy: row.createdBy.fullName.trim() || "A resident",
  };
}

/**
 * The predicate for "not over yet": it ends, or — with no end given — starts,
 * at or after `since`. An event with no end time is treated as lasting until
 * the end of the day it starts, which is what "since the start of today" gives.
 */
function notOverSince(since: Date) {
  return {
    OR: [
      { endsAt: { gte: since } },
      { endsAt: null, startsAt: { gte: since } },
    ],
  };
}

/** Local midnight today — the line between upcoming and past. */
function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Upcoming events soonest first, and the most recent past ones newest first.
 * Both lists degrade to empty on a database error — the page says there is
 * nothing on rather than failing.
 */
export async function listVillageEvents(
  villageId: string,
  now: Date,
): Promise<{ upcoming: EventView[]; past: EventView[] }> {
  if (!process.env.DATABASE_URL) return { upcoming: [], past: [] };

  const since = startOfToday(now);

  try {
    const [upcoming, past] = await Promise.all([
      prisma.communityEvent.findMany({
        where: { villageId, ...notOverSince(since) },
        select: EVENT_SELECT,
        orderBy: { startsAt: "asc" },
      }),
      prisma.communityEvent.findMany({
        where: { villageId, NOT: notOverSince(since) },
        select: EVENT_SELECT,
        orderBy: { startsAt: "desc" },
        take: EVENT_PAST_LIST_SIZE,
      }),
    ]);

    return { upcoming: upcoming.map(toEventView), past: past.map(toEventView) };
  } catch (cause) {
    console.error("Could not list events for village %s", villageId, cause);
    return { upcoming: [], past: [] };
  }
}

/** Upcoming events with a pin, for the map. Empty on any failure. */
export async function listMapEvents(
  villageId: string,
  now: Date,
): Promise<EventView[]> {
  if (!process.env.DATABASE_URL) return [];

  try {
    const rows = await prisma.communityEvent.findMany({
      where: {
        villageId,
        lat: { not: null },
        lng: { not: null },
        ...notOverSince(startOfToday(now)),
      },
      select: EVENT_SELECT,
      orderBy: { startsAt: "asc" },
      take: 200,
    });
    return rows.map(toEventView);
  } catch (cause) {
    console.error("Could not list map events for village %s", villageId, cause);
    return [];
  }
}

/** One event in the caller's village, or null — another village's is not found. */
export async function getVillageEvent(
  villageId: string,
  eventId: string,
): Promise<EventView | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    const row = await prisma.communityEvent.findFirst({
      where: { id: eventId, villageId },
      select: EVENT_SELECT,
    });
    return row ? toEventView(row) : null;
  } catch (cause) {
    console.error("Could not read event %s", eventId, cause);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Deleting
// ---------------------------------------------------------------------------

/** Who may take an event down: the poster, or a coordinator of its village. */
export function canDeleteEvent(
  session: Pick<Session, "user" | "profile">,
  event: Pick<EventView, "createdById">,
): boolean {
  return (
    event.createdById === session.user.id ||
    isCoordinatorRole(session.profile?.role)
  );
}

export type DeleteEventResult = { ok: true } | { ok: false; error: string };

/**
 * Deletes an event, and records who did.
 *
 * A hard delete, unlike a report's tombstone: nothing in the audit trail names
 * an event except the row this writes, which carries its title — so there is
 * no dangling reference to protect, and keeping the row would be keeping a
 * resident's post after they asked for it to go.
 *
 * The permission and the village are in the `where` as well as checked first,
 * so a race between the read and the write cannot widen either.
 */
export async function deleteCommunityEvent(input: {
  session: Session;
  villageId: string;
  eventId: string;
}): Promise<DeleteEventResult> {
  const { session, villageId, eventId } = input;

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "The database is not configured." };
  }

  const event = await getVillageEvent(villageId, eventId);

  if (!event) return { ok: false, error: "That event could not be found." };

  const coordinator = isCoordinatorRole(session.profile?.role);

  if (!canDeleteEvent(session, event)) {
    return {
      ok: false,
      error: "Only the person who posted this, or a coordinator, can delete it.",
    };
  }

  const { count } = await prisma.communityEvent.deleteMany({
    where: {
      id: eventId,
      villageId,
      ...(coordinator ? {} : { createdById: session.user.id }),
    },
  });

  if (count === 0) return { ok: false, error: "That event has already gone." };

  try {
    const context = await auditContext();
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorEmail: session.user.email,
        actorRole: session.profile?.role,
        villageId,
        action: "event.deleted",
        entityType: "CommunityEvent",
        entityId: eventId,
        before: { title: event.title, startsAt: event.startsAt },
        // Which hat was worn — a coordinator deleting their own event satisfies
        // both, and the trail should say whether this was moderation.
        after: { byPoster: event.createdById === session.user.id },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  } catch (cause) {
    // The event is gone either way, which is what was asked for.
    console.error("Could not audit the deletion of event %s", eventId, cause);
  }

  return { ok: true };
}
