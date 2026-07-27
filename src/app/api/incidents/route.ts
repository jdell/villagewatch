import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fuzzCoordinates } from "@/lib/geo";
import { isAiConfigured } from "@/lib/ai/client";
import {
  COMPLIANCE_BLOCKED_MESSAGE,
  canVillageAcceptIncidents,
} from "@/lib/compliance";
import { getVillageAutoApprove } from "@/lib/moderation";
import {
  notifyCoordinatorsOfPendingReport,
  notifyIncidentPublished,
} from "@/lib/notifications";
import { notifySlack } from "@/lib/slack";
import { formatIncidentAlert } from "@/lib/format-alert";
import {
  LOCATION_FUZZ_METERS,
  SEVERITY_META,
  isCoordinatorRole,
} from "@/lib/constants";
import { RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { fieldErrors, incidentReportSchema } from "@/lib/validations";

/**
 * POST /api/incidents — file a report from the wizard.
 *
 * Three things here look like shortcuts and are not:
 *
 * 1. **The report lands in `PENDING_REVIEW` unless the village has said
 *    otherwise.** Claude's rewrite is good, and it is not a moderation queue —
 *    publishing straight from here would breach domain rule 1 the first time
 *    the model left a name in, which is why this was unconditional for as long
 *    as the route has existed. `Village.autoApprove` is a coordinator's
 *    deliberate decision to accept that risk for their own village: it is off
 *    by default, changing it is audited, and the switch says on screen what it
 *    costs. What it does **not** change is domain rule 6 — residents still see
 *    `PUBLIC_INCIDENT_STATUSES` and nothing else. The setting decides which
 *    status a report is filed in, never which statuses are public.
 *
 *    The setting is read here, from the village row, and never from the body.
 *    A client-supplied "publish me" flag would be exactly the escalation the
 *    queue exists to prevent.
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
 *
 * In front of all three sits the compliance gate: a village whose coordinator
 * has not accepted the DPIA and the Appropriate Policy Document accepts no
 * report at all. See `src/lib/compliance.ts` — that is a lawfulness question
 * rather than a configuration one, which is why it is checked before the body is
 * even read.
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

/**
 * Everything that happens because a report was filed, once it has been.
 *
 * Split out because the two branches are not variations on a theme. A report in
 * the queue is work for a coordinator and nobody else hears about it; an
 * auto-approved report is already on the map, so it owes the village the same
 * broadcast, the same public channel post and the same staff line that a
 * coordinator's Approve click owes — see `applyModeration`, which is where that
 * set is defined and where this one has to stay in step with it.
 *
 * **It cannot throw.** It is called inside the create loop's `try`, where an
 * exception would be read as a reference clash and retried — filing the report a
 * second time. Every failure in here is a log and nothing else: the row is
 * written, the reporter has their reference, and a push that did not go out is
 * not a reason to tell them their report did not file.
 */
async function announce(input: {
  incidentId: string;
  reference: string;
  villageId: string;
  autoApprove: boolean;
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  report: z.output<typeof incidentReportSchema>;
  fuzzed: { lat: number; lng: number };
  /** The provenance block, when the AI pass genuinely ran. */
  ai?: z.output<typeof incidentReportSchema>["ai"];
}): Promise<void> {
  const { incidentId, reference, villageId, autoApprove, session, report } =
    input;

  try {
    if (!autoApprove) {
      await notifyCoordinatorsOfPendingReport({
        villageId,
        incidentId,
        reference,
        title: report.title,
        severity: report.severity,
        reporterId: session.user.id,
      });
      return;
    }

    // Published on arrival: the village hears about it now, because there is no
    // later. `notifyIncidentPublished` carries the WhatsApp Channel post with
    // it, which is the surface worth pausing on — a village running both
    // auto-approve and channel posting has put an unreviewed report in front of
    // the open internet. Both switches are off by default and both are audited,
    // and that combination is spelled out on the dashboard.
    await notifyIncidentPublished({
      id: incidentId,
      villageId,
      title: report.title,
      severity: report.severity,
      description: report.description,
      recurring: input.ai?.recurring ?? false,
      patternNote: input.ai?.patternNote ?? null,
      locationText: report.locationText ?? null,
      lat: input.fuzzed.lat,
      lng: input.fuzzed.lng,
      occurredAt: report.occurredAt,
    });

    // The second audit row, and the reason it is worth writing: without it the
    // trail's "Published" filter is empty in an auto-approving village, and a
    // coordinator asking what went live this week gets nothing. The actor is the
    // reporter because they are whose action published it; `autoApproved` is
    // what distinguishes this from somebody's decision.
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorEmail: session.user.email,
        actorRole: session.profile?.role,
        villageId,
        action: "incident.publish",
        entityType: "Incident",
        entityId: incidentId,
        // No `before`. Every other `incident.publish` row moved a report out of
        // the queue and says so; this one had no prior state to record, and
        // writing PENDING_REVIEW here would put a review in the trail that
        // never happened.
        after: { status: "PUBLISHED", autoApproved: true },
      },
    });

    // The same line `applyModeration` sends, with the same rule about what may
    // be in it: the anonymised title, the severity and the landmark. Never the
    // reporter's wording, never the coordinates.
    const village = await prisma.village.findUnique({
      where: { id: villageId },
      select: { name: true },
    });

    await notifySlack(
      `🚨 New incident in ${village?.name ?? "a village"} (auto-approved): ${SEVERITY_META[report.severity].label} — ${report.title}${
        report.locationText ? ` — ${report.locationText}` : ""
      }`,
    );
  } catch (cause) {
    console.error(
      "Could not announce incident %s in village %s",
      reference,
      villageId,
      cause,
    );
  }
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

  // The legal gate, and it is checked here — before the body is parsed and well
  // before a rate-limit slot is spent — because it is a fact about the village
  // rather than about this request. A report filed into a village with no
  // Appropriate Policy Document in place is processing of criminal offence data
  // with no lawful authorisation behind it (DPA 2018 Schedule 1 paragraph 5),
  // and the row must not be written at all.
  //
  // 403 rather than 503: nothing is broken and retrying will not help. The
  // message names the person who can fix it, because the resident cannot.
  if (!(await canVillageAcceptIncidents(villageId))) {
    return NextResponse.json(
      { error: COMPLIANCE_BLOCKED_MESSAGE, code: "compliance_incomplete" },
      { status: 403 },
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

  // Counted here rather than at the top of the handler so that only requests
  // that would actually have written a row consume a slot — a rejected payload
  // costs a Zod parse, and the thing worth limiting is what lands in the
  // coordinator's queue.
  const quota = await rateLimit(RATE_LIMITS.incidentCreate, session.user.id);

  if (!quota.ok) {
    return tooManyRequests(
      quota,
      `You have filed ${quota.limit} reports today, which is the daily limit. If this is an emergency, call 999.`,
    );
  }

  // The exact point the reporter tapped is never persisted.
  const fuzzed = fuzzCoordinates(report.lat, report.lng, LOCATION_FUZZ_METERS);

  const year = new Date().getUTCFullYear();

  // Present only when the wizard actually got a record back from
  // `POST /api/incidents/process`. `isAiConfigured` is the server's own say-so:
  // a deployment with no key cannot have produced one, whatever the body claims.
  const ai = isAiConfigured ? report.ai : undefined;

  // The village's own decision, read from its row. Fails closed to the queue —
  // see `getVillageAutoApprove`.
  const autoApprove = await getVillageAutoApprove(villageId);
  const status = autoApprove ? "PUBLISHED" : "PENDING_REVIEW";

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
          // reason it is usually PENDING_REVIEW is not obvious from the schema.
          // `moderatedById` and `moderatedAt` stay null even when this is
          // PUBLISHED: nobody moderated it, and filling them with the reporter
          // would put a resident's name against a review that never happened.
          status,
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
            autoApproved: autoApprove,
            mediaCount: report.media.length,
            anonymized: Boolean(ai),
            aiModel: ai?.model ?? null,
            recurring: ai?.recurring ?? false,
          },
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        },
      });

      // Everything from here on is fan-out, and none of it may turn a filed
      // report into an error. The row is written and the reference is spoken
      // for; a push that failed is a push that failed.
      await announce({
        incidentId: incident.id,
        reference: incident.reference,
        villageId,
        autoApprove,
        session,
        report,
        fuzzed,
        ai,
      });

      return NextResponse.json(
        {
          id: incident.id,
          reference: incident.reference,
          status: incident.status,
          // The wizard says something different depending on whether a
          // coordinator is about to read this or the village already has.
          autoApproved: autoApprove,
          // The WhatsApp text, for the success screen — but only for a report
          // that is actually live, and only to somebody who moderates this
          // village. A channel is public: a resident is not offered a button
          // that republishes a report outside the village, and no report still
          // waiting in the queue gets one at all (domain rule 6).
          alert:
            autoApprove && isCoordinatorRole(session.profile?.role)
              ? formatIncidentAlert({
                  id: incident.id,
                  title: report.title,
                  severity: report.severity,
                  description: report.description,
                  locationText: report.locationText ?? null,
                  occurredAt: report.occurredAt,
                  recurring: ai?.recurring ?? false,
                  patternNote: ai?.patternNote ?? null,
                })
              : undefined,
          // Whether that text is the rewrite or the reporter's own wording.
          anonymized: Boolean(ai),
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
