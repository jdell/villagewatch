import { NextResponse } from "next/server";
import { getCommunityStats } from "@/lib/public-incident";

/**
 * GET /api/incidents/stats — the three community counters.
 *
 * Published reports, open accounts and live villages, deployment-wide. It backs
 * the "… incidents recorded by … residents across … villages" line on
 * `/incident/[id]` and is exposed as a route so the same figures can go on a
 * parish website or a coordinator's own page without anybody counting by hand.
 *
 * ## Aggregates only, and that is what makes it safe to publish
 *
 * Three integers. No village is named, no report is identified, and there is
 * nothing here to attribute to a person — which is a different kind of
 * disclosure from the route beside it and is why this one needs no id, no
 * status narrowing at the call site and no 404.
 *
 * ## Every figure is real
 *
 * `getCommunityStats` counts `ACTIVE` villages, and only those. The directory
 * holds 270 seeded Cambridgeshire parishes sitting at `PENDING` with nobody in
 * them, and counting those would turn this into the invented number
 * `VILLAGES_LIVE` exists to refuse — a false statement to the exact audience
 * least able to check it, which is a parish clerk deciding whether to put their
 * residents' reports into this. There is no floor, no rounding and no
 * "over 1,000": if the honest answer is one village, it says one village.
 *
 * ## Null, not zeroes
 *
 * A failed read returns 503 rather than `{ incidents: 0, … }`. Zeroes are a
 * sentence about a service nobody uses, and a caller rendering them would
 * publish that on the strength of a database blip. A caller that gets a 503 can
 * leave the line out, which is what the page does.
 */

/**
 * Five minutes of shared caching.
 *
 * Longer than the per-incident route, because these move slower than any
 * viewer would notice — a resident joining is not a figure anybody is watching
 * in real time — and because it is three `count(*)` queries over whole tables
 * rather than one indexed lookup. `stale-while-revalidate` keeps a burst on one
 * query.
 */
const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=900";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "The database is not configured on this deployment." },
      { status: 503 },
    );
  }

  const stats = await getCommunityStats();

  if (!stats) {
    return NextResponse.json(
      { error: "Those figures are not available right now." },
      { status: 503 },
    );
  }

  return NextResponse.json(stats, {
    headers: { "Cache-Control": CACHE_CONTROL },
  });
}
