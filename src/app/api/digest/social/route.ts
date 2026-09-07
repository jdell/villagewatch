import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatSocialPost, type SocialIncident } from "@/lib/digest/format-social-post";
import {
  DIGEST_WINDOW_DAYS,
  PUBLIC_INCIDENT_STATUSES,
  isCoordinatorRole,
} from "@/lib/constants";

/**
 * GET /api/digest/social — the village's week as a Facebook-ready post.
 *
 * ## It is a sibling of `/api/digest` and the two gates are opposites
 *
 * Worth reading before touching either. `/api/digest` is the Sunday cron: it
 * spends Anthropic credit and pushes to every coordinator in every village, so
 * it is gated on `CRON_SECRET` and **fails closed with no secret set**. This
 * route reads one village's own published reports, formats them, and writes
 * nothing — so it is gated on a coordinator session and would be useless to a
 * cron, which has no session to scope a village from.
 *
 * A route nested under a `CRON_SECRET`-guarded path and *not* guarded by it is
 * the shape of mistake worth naming rather than leaving somebody to notice.
 * Nothing is inherited between route handlers in Next — there is no shared
 * middleware on this segment, and `src/proxy.ts` passes `/api/` straight
 * through — so the check below is the whole gate and has to be.
 *
 * ## Why the text is built here rather than in the browser
 *
 * `formatSocialPost` is client-safe and the button could call it. The village's
 * incidents cannot be: the audience is that village's published reports, which
 * is a database read scoped by `villageId` off the session (domain rule 4). A
 * shape a browser could assemble would be a shape a browser could ask for on
 * behalf of another village.
 *
 * ## Why every exit is JSON
 *
 * The CSV export's reasoning, and the button is the same shape as
 * `ExportCsvButton`: it checks the status and raises the route's own `error`
 * string. The `try/catch` is what guarantees there is one to raise rather than
 * Next's HTML error page — a coordinator whose clipboard filled with a stack
 * trace would paste it into Facebook.
 *
 * ## No audit row, deliberately
 *
 * The trail records decisions somebody is accountable for. This returns the
 * anonymised type and landmark of reports already on the village's public map,
 * to the coordinator who moderated them — strictly less than
 * `GET /api/dashboard/export`, which *is* audited because it is a bulk read of
 * every column including the rejected reports. Producing text is not the act;
 * pasting it into Facebook is, and nothing in a browser can witness that. The
 * WhatsApp alert panel is audited on exactly the same reasoning, which is to
 * say not at all.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const villageId = session.profile?.villageId;
  const role = session.profile?.role;

  // Coordinators only, and worded identically to the 403 a resident of another
  // village would get. A post that names the week's burglaries is one a
  // resident should not be handed a button to publish outside the village —
  // the same gate `CopyAlert` carries, for the same reason.
  if (!villageId || !role || !isCoordinatorRole(role)) {
    return NextResponse.json(
      { error: "Only village coordinators can build the weekly post" },
      { status: 403 },
    );
  }

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

  try {
    const village = await prisma.village.findUnique({
      where: { id: villageId },
      // `joinCode` is read here and it is the one credential on this row. It is
      // in the post by design — `checkVillageJoin` demands the code whenever
      // the village has one, so a join link without it is a link that cannot be
      // accepted, and a coordinator publishing an invite to Facebook is making
      // the same disclosure a parish newsletter makes when it prints the code.
      // See `src/lib/invite.ts`. `regenerateJoinCode()` is the answer if the
      // post ends up somewhere it should not.
      select: { name: true, slug: true, joinCode: true },
    });

    if (!village) {
      return NextResponse.json(
        { error: "That village could not be found." },
        { status: 404 },
      );
    }

    const [rows, previousCount] = await Promise.all([
      prisma.incident.findMany({
        where: {
          villageId,
          // Domain rule 6. A post is the widest surface in the app; the review
          // queue must not reach it, and neither must an erased report —
          // `PUBLIC_INCIDENT_STATUSES` excludes `REMOVED` for free.
          status: { in: [...PUBLIC_INCIDENT_STATUSES] },
          occurredAt: { gte: windowStart, lte: now },
        },
        // Three columns, and the select is the enforcement rather than the
        // type. `title`, `description`, `rawDescription`, `lat` and `lng` are
        // all absent: `SocialIncident` has no field for any of them, so a
        // column added here would not compile — which is the direction that
        // guard is meant to fail in.
        select: { type: true, severity: true, locationText: true },
        orderBy: { occurredAt: "desc" },
      }),
      prisma.incident.count({
        where: {
          villageId,
          status: { in: [...PUBLIC_INCIDENT_STATUSES] },
          occurredAt: { gte: previousStart, lt: windowStart },
        },
      }),
    ]);

    const incidents: SocialIncident[] = rows;

    const text = formatSocialPost({
      villageName: village.name,
      villageSlug: village.slug,
      joinCode: village.joinCode,
      incidents,
      windowStart,
      windowEnd: now,
      previousCount,
    });

    return NextResponse.json({
      text,
      // The count is the honest one — every published report in the window —
      // and is not `SOCIAL_POST_MAX_INCIDENTS`-capped. The button shows it
      // beside the text so a coordinator can see the post is complete before
      // they publish it.
      incidents: incidents.length,
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
    });
  } catch (cause) {
    // Logged with the village on it, because the two ways this realistically
    // fails — an unreachable database and a migration that has not run — need
    // the server log to tell them apart, and neither should reach a
    // coordinator's clipboard.
    console.error("Social digest failed for village %s", villageId, cause);

    return NextResponse.json(
      { error: "The post could not be built. Try again in a moment." },
      { status: 500 },
    );
  }
}
