import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { LOCATION_FUZZ_METERS } from "@/lib/constants";
import { getVillageEventsEnabled } from "@/lib/events";
import { fuzzCoordinates } from "@/lib/geo";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  communityEventSchema,
  eventWindowError,
  fieldErrors,
} from "@/lib/validations";
import { getVillageServiceState } from "@/lib/villages";

/**
 * Posts a community event.
 *
 * Any resident of a village that has events turned on. **`src/proxy.ts`
 * passes `/api/` straight through**, so everything that gates this is in this
 * handler, and in this order:
 *
 * 1. **A session, and a village off its profile.** Never off the body
 *    (domain rule 4) — anything the body calls `villageId` is ignored, because
 *    the schema has no such field.
 * 2. **The village has events on, and is in service.** Both before the body is
 *    parsed and before a rate-limit slot is spent, the order the report route
 *    keeps: a resident whose village cannot take events should not pay one of
 *    their ten for finding out.
 * 3. **The body, then the date window, then the quota.** A malformed request
 *    costs a parse and nothing else.
 * 4. **Fuzz, then write.** The point the resident tapped never reaches the
 *    database (domain rule 2). An event at somebody's house should not pinpoint
 *    the house, and its poster's name is on it.
 *
 * Not audited: posting is not a decision anybody is accountable for, and the
 * row itself records who posted it and when. Deleting one is audited — see
 * `deleteCommunityEvent`.
 */
export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "The database is not configured on this deployment." },
      { status: 503 },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to post an event" }, { status: 401 });
  }

  const villageId = session.profile?.villageId;
  if (!villageId || session.profile?.deletedAt) {
    return NextResponse.json(
      { error: "Join a village to post an event" },
      { status: 403 },
    );
  }

  const [enabled, service] = await Promise.all([
    getVillageEventsEnabled(villageId),
    getVillageServiceState(villageId),
  ]);

  if (!service.inService) {
    return NextResponse.json({ error: service.message }, { status: 403 });
  }

  if (!enabled) {
    return NextResponse.json(
      { error: "Your village has not turned community events on." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = communityEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields", fieldErrors: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }

  const event = parsed.data;
  const windowError = eventWindowError(event.startsAt, new Date());
  if (windowError) {
    return NextResponse.json(
      { error: windowError, fieldErrors: { startsAt: windowError } },
      { status: 422 },
    );
  }

  const quota = await rateLimit(RATE_LIMITS.eventCreate, session.user.id);
  if (!quota.ok) {
    return tooManyRequests(quota, "You have posted a lot of events today.");
  }

  const point =
    event.lat !== undefined && event.lng !== undefined
      ? fuzzCoordinates(event.lat, event.lng, LOCATION_FUZZ_METERS)
      : null;

  try {
    const created = await prisma.communityEvent.create({
      data: {
        villageId,
        createdById: session.user.id,
        title: event.title,
        description: event.description ?? null,
        category: event.category,
        locationText: event.locationText ?? null,
        lat: point?.lat ?? null,
        lng: point?.lng ?? null,
        startsAt: event.startsAt,
        endsAt: event.endsAt ?? null,
      },
      select: { id: true },
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (cause) {
    console.error("Could not create an event in village %s", villageId, cause);
    return NextResponse.json(
      { error: "Could not post that event. Try again." },
      { status: 500 },
    );
  }
}
