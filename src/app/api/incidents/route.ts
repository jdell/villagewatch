import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fuzzCoordinates } from "@/lib/geo";
import { isAiConfigured } from "@/lib/ai/client";
import { LOCATION_FUZZ_METERS } from "@/lib/constants";
import { fieldErrors, incidentReportSchema } from "@/lib/validations";

/**
 * POST /api/incidents — file a report from the wizard.
 *
 * Three things here look like shortcuts and are not:
 *
 * 1. **The report lands in `PENDING_REVIEW`, never `PUBLISHED`.** Claude's
 *    rewrite is good, and it is not a moderation queue. Only
 *    `PUBLIC_INCIDENT_STATUSES` (`PUBLISHED`, `RESOLVED`) reach residents, so
 *    a coordinator sees every report before any neighbour does. Publishing
 *    straight from here would breach domain rule 1 the first time the model
 *    left a name in.
 *
 * 2. **`rawDescription` and `description` are different columns and now hold
 *    different text.** `rawDescription` is the reporter's verbatim words, kept
 *    for the reporter, coordinators and moderators; `description` is the
 *    anonymised rewrite the map and list render. When a report is filed without
 *    the AI pass — no API key, a timeout, the reporter declining it — the
 *    wizard omits `rawDescription` and both columns get the reporter's own
 *    wording, which is safe precisely because of point 1.
 *
 * 3. **The `ai` block is provenance, not authorisation.** It arrives from the
 *    browser and a crafted request could claim a report was anonymised when it
 *    was not. That is survivable because it decides nothing: it tells the
 *    coordinator what to expect in the queue, and the queue is the gate.
 *
 * The village, the reporter and the status all come from the session. Nothing
 * in the request body can influence them.
 */

/** Sequence room per year before references start colliding. */
const REFERENCE_ATTEMPTS = 5;

async function nextReference(year: number): Promise<string> {
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const count = await prisma.incident.count({
    where: { createdAt: { gte: startOfYear } },
  });

  return `VW-${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to file a report" },
      { status: 401 },
    );
  }

  // Tenant boundary. Never read a village id out of the request body.
  const villageId = session.profile?.villageId;
  if (!villageId) {
    return NextResponse.json(
      { error: "Join a village before filing a report" },
      { status: 403 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "The database is not configured on this deployment." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = incidentReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check the highlighted fields",
        fieldErrors: fieldErrors(parsed.error),
      },
      { status: 422 },
    );
  }

  const report = parsed.data;

  // A storage path is not proof of ownership — anyone could post someone else's
  // path and attach their media to a report. The upload route keys objects by
  // `{villageId}/{userId}/`, so re-checking the prefix here is the whole check.
  const ownPrefix = `${villageId}/${session.user.id}/`;
  const foreign = report.media.find(
    (item) =>
      !item.storagePath.startsWith(ownPrefix) ||
      !item.thumbnailPath.startsWith(ownPrefix),
  );

  if (foreign) {
    return NextResponse.json(
      { error: "That attachment does not belong to this report" },
      { status: 403 },
    );
  }

  // The exact point the reporter tapped is never persisted.
  const fuzzed = fuzzCoordinates(report.lat, report.lng, LOCATION_FUZZ_METERS);

  const year = new Date().getUTCFullYear();

  // Present only when the wizard actually got a record back from
  // `POST /api/incidents/process`. `isAiConfigured` is the server's own say-so:
  // a deployment with no key cannot have produced one, whatever the body claims.
  const ai = isAiConfigured ? report.ai : undefined;

  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt += 1) {
    try {
      const incident = await prisma.incident.create({
        data: {
          reference: await nextReference(year),
          villageId,
          reporterId: session.user.id,
          type: report.type,
          severity: report.severity,
          // Set explicitly rather than left to the schema default, because the
          // reason it must not be PUBLISHED is not obvious from the schema.
          status: "PENDING_REVIEW",
          source: "WEB",
          title: report.title,
          // The reporter's own words when the AI pass ran, a duplicate of the
          // public text when it did not. Never served publicly either way.
          rawDescription: report.rawDescription ?? report.description,
          description: report.description,
          anonymized: Boolean(ai),
          aiModel: ai?.model,
          aiProcessedAt: ai ? new Date() : undefined,
          aiConfidence: ai?.confidence,
          peopleCount: ai?.peopleCount,
          recurring: ai?.recurring ?? false,
          patternNote: ai?.patternNote,
          isAnonymous: report.isAnonymous,
          occurredAt: report.occurredAt,
          locationText: report.locationText,
          lat: fuzzed.lat,
          lng: fuzzed.lng,
          locationFuzzMeters: LOCATION_FUZZ_METERS,
          reportedToPolice: report.reportedToPolice,
          policeReference: report.policeReference,
          media: {
            create: report.media.map((item, position) => ({
              storagePath: item.storagePath,
              mimeType: item.mimeType,
              fileSize: item.fileSize,
              width: item.width,
              height: item.height,
              durationSeconds: item.durationSeconds,
              // The uploaded file IS the redacted variant — blurring happened
              // on-device before it was sent, and re-encoding through a canvas
              // dropped the EXIF block with it.
              redactedPath: item.storagePath,
              redactedAt: new Date(),
              exifStripped: true,
              position,
            })),
          },
          tags: {
            // `IncidentTag` is unique on (incidentId, label) and the tags were
            // deduplicated by the AI pass, but a reporter editing them by hand
            // could reintroduce a duplicate and take the whole create down with
            // a P2002 that would be read here as a reference clash.
            create: [...new Set(report.tags)].map((label) => ({
              label,
              source: ai ? "ai" : "user",
              confidence: ai?.confidence,
            })),
          },
        },
        select: { id: true, reference: true, status: true },
      });

      await prisma.auditLog.create({
        data: {
          actorId: session.user.id,
          actorEmail: session.user.email,
          actorRole: session.profile?.role,
          villageId,
          action: "incident.create",
          entityType: "Incident",
          entityId: incident.id,
          after: {
            reference: incident.reference,
            type: report.type,
            severity: report.severity,
            status: incident.status,
            mediaCount: report.media.length,
            anonymized: Boolean(ai),
            aiModel: ai?.model ?? null,
            recurring: ai?.recurring ?? false,
          },
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        },
      });

      return NextResponse.json(
        {
          id: incident.id,
          reference: incident.reference,
          status: incident.status,
          redirectTo: "/incidents",
        },
        { status: 201 },
      );
    } catch (cause) {
      // Two reports filed in the same second race for the same reference.
      // Anything else is a real failure.
      const isReferenceClash =
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        (cause as { code?: string }).code === "P2002";

      if (!isReferenceClash || attempt === REFERENCE_ATTEMPTS - 1) {
        console.error("Failed to create incident in village %s", villageId, cause);
        return NextResponse.json(
          { error: "Could not file your report. Try again." },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json(
    { error: "Could not file your report. Try again." },
    { status: 500 },
  );
}
