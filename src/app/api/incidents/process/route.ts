import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAiConfigured } from "@/lib/ai/client";
import {
  PATTERN_RADIUS_METERS,
  PATTERN_WINDOW_DAYS,
  detectPatternHeuristic,
  findNearbyIncidents,
} from "@/lib/ai/detect-patterns";
import { structureIncident } from "@/lib/ai/structure-incident";
import { inlineImageFromStorage } from "@/lib/media/storage";
import { fieldErrors, incidentProcessSchema } from "@/lib/validations";

/**
 * POST /api/incidents/process — run a draft report through Claude.
 *
 * This route reads and returns; it writes nothing. The reporter sees what comes
 * back, edits it if they disagree, and only then posts to `POST /api/incidents`
 * — so nothing here is a commitment, and re-running it (the "Reprocess" button)
 * costs an API call and nothing else.
 *
 * Three things are worth spelling out:
 *
 * 1. **The exact pin arrives here and is never written.** The 200m pattern
 *    lookup has to run against the real point or it would be matching against
 *    the jitter. The publish route fuzzes independently before anything is
 *    stored, so the precise position still never reaches the database (domain
 *    rule 2).
 * 2. **The village comes from the session.** It scopes the history lookup, and
 *    a village id in the body would let a caller read another village's
 *    incidents through the pattern note (domain rule 4).
 * 3. **A failed AI call is a 200, not a 500.** The response says what went
 *    wrong and the wizard falls back to the reporter's own wording, which is
 *    exactly what Day 2 did. Only an unauthenticated or malformed request is an
 *    error status.
 */

/** Node, not Edge: the Anthropic SDK and the Supabase download both want it. */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to file a report" },
      { status: 401 },
    );
  }

  const villageId = session.profile?.villageId;
  if (!villageId) {
    return NextResponse.json(
      { error: "Join a village before filing a report" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = incidentProcessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check the highlighted fields",
        fieldErrors: fieldErrors(parsed.error),
      },
      { status: 422 },
    );
  }

  const input = parsed.data;

  // Gathered whether or not the model is reachable — the deterministic pattern
  // finding below is built from the same rows, so a report filed with the AI
  // switched off still gets told it is the fourth one this month.
  const history = await findNearbyIncidents({
    villageId,
    lat: input.lat,
    lng: input.lng,
  });

  const heuristic = detectPatternHeuristic(
    history,
    input.type ?? "OTHER",
    PATTERN_RADIUS_METERS,
  );

  const pattern = {
    radiusMeters: PATTERN_RADIUS_METERS,
    windowDays: PATTERN_WINDOW_DAYS,
    nearbyCount: history.length,
    ...heuristic,
  };

  if (!isAiConfigured) {
    return NextResponse.json({
      ok: false,
      code: "not_configured",
      error:
        "Automatic anonymisation is not switched on for this village yet.",
      pattern,
    });
  }

  const village = process.env.DATABASE_URL
    ? await prisma.village.findUnique({
        where: { id: villageId },
        select: { name: true },
      })
    : null;

  // A path is not proof of ownership. The upload route keys objects by
  // `{villageId}/{userId}/`, so the prefix check is the whole authorisation —
  // without it, any path could be pulled out of the bucket by the service-role
  // client and read back through the model's description of it.
  const image = input.mediaPath?.startsWith(`${villageId}/${session.user.id}/`)
    ? await inlineImageFromStorage(input.mediaPath)
    : null;

  const result = await structureIncident({
    description: input.description,
    reportedType: input.type,
    reportedSeverity: input.severity,
    occurredAt: input.occurredAt,
    locationText: input.locationText,
    villageName: village?.name ?? "this village",
    image: image ?? undefined,
    history,
  });

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      code: result.code,
      error: result.message,
      pattern,
    });
  }

  return NextResponse.json({
    ok: true,
    model: result.model,
    incident: result.data,
    // Both readings travel together on purpose. The model's `recurring` is the
    // judgement call ("same white van"); the heuristic is the count. A
    // coordinator looking at a disagreement between them is looking at
    // something worth a second read.
    pattern,
    usage: result.usage,
  });
}
