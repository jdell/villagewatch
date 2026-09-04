import { NextResponse } from "next/server";
import { getPublicIncidentPreview } from "@/lib/public-incident";
import { INCIDENT_TYPE_LABELS, SEVERITY_LABELS } from "@/lib/constants";

/**
 * GET /api/incidents/[id]/public — one published report, safe for anybody.
 *
 * The only route handler in this codebase that answers without a session, and
 * the one place a reader should check before assuming any other route is
 * similar. Everything it returns is what `/incident/[id]` already renders to
 * whoever holds the link; the route exists so that the same four facts can be
 * embedded elsewhere — a parish website, a coordinator's own page — without
 * anybody having to re-derive which columns are safe.
 *
 * ## It shares one read with the page, deliberately
 *
 * `getPublicIncidentPreview` is the whole of the access decision — the status
 * narrowing (domain rule 6), the `ACTIVE` village requirement, the UUID shape
 * check and the description truncation all live there, and both callers get
 * them by construction. A second `select` written here to shape a JSON response
 * is exactly how the two would drift, and the drift would be silent: the page
 * would look right while the endpoint returned a column nobody meant to
 * publish.
 *
 * What it must never grow is a field the page does not show. `rawDescription`,
 * the reporter, the landmark, the coordinates and the full description are all
 * absent from the type it returns, so they cannot be spread into a response by
 * accident.
 *
 * ## Two things it deliberately does not do
 *
 * **No rate limit.** `src/lib/rate-limit.ts` keys on a Supabase auth user id
 * and there is no user here. The obvious substitute is the caller's IP, and
 * that is the one key this codebase has already ruled out: a village shares a
 * broadband line often enough that an IP quota silences a household. What
 * bounds this instead is that a UUID is unguessable, so there is no id to
 * enumerate — a scraper needs the links first, and anybody holding a link can
 * read the page anyway. A limiter belongs here the day ids become guessable,
 * and not before.
 *
 * **No 404/403 distinction.** A report that does not exist, one still in the
 * queue, one that was rejected and one in a village that is not live all return
 * the same 404. Telling them apart would confirm that an id exists to somebody
 * holding a link they should not have.
 *
 * `params` is a Promise in Next.js 16 — awaited, never destructured in the
 * signature.
 */

/**
 * A minute of shared caching.
 *
 * The response changes only when a coordinator moderates the report, and the
 * expensive case is the one this is for: a link dropped into a WhatsApp group
 * that four hundred people open inside a minute. `s-maxage` is the CDN's copy
 * and `stale-while-revalidate` lets it serve the old body while it fetches a
 * new one, so a burst costs one query rather than four hundred. Deliberately
 * **not** `private`: there is nothing here specific to a caller, which is the
 * whole premise of the route.
 */
const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "The database is not configured on this deployment." },
      { status: 503 },
    );
  }

  const preview = await getPublicIncidentPreview(id);

  if (!preview) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      id: preview.id,
      type: preview.type,
      /**
       * The label as well as the enum. A consumer rendering this has no access
       * to `INCIDENT_TYPE_LABELS`, and left to invent its own wording it would
       * eventually disagree with the map about what a category is called.
       */
      typeLabel: INCIDENT_TYPE_LABELS[preview.type],
      severity: preview.severity,
      severityLabel: SEVERITY_LABELS[preview.severity],
      /** ISO 8601, so it crosses as a string rather than a serialised Date. */
      occurredAt: preview.occurredAt.toISOString(),
      /** The first line only — the full column never leaves the data module. */
      description: preview.descriptionExtract,
      /**
       * Whether the AI pass rewrote that text. A consumer republishing an
       * extract is entitled to know whether it was anonymised or is the
       * reporter's own wording, which is the same thing `CopyAlert` warns a
       * coordinator about in red before they paste it.
       */
      anonymized: preview.anonymized,
      /** The fact of a pattern. Never `patternNote`, which names a radius. */
      recurring: preview.recurring,
      village: {
        name: preview.village.name,
        region: preview.village.region,
      },
      url: `/incident/${preview.id}`,
    },
    { headers: { "Cache-Control": CACHE_CONTROL } },
  );
}
