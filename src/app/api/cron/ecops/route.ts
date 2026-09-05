import { NextResponse, type NextRequest } from "next/server";
import { cronUnauthorised, isCronAuthorised } from "@/lib/cron";
import {
  listConfiguredEcopsSites,
  syncEcopsSite,
  type EcopsSyncOutcome,
} from "@/lib/ecops/alerts";

/**
 * GET|POST /api/cron/ecops — police and Neighbourhood Watch bulletins, fetched.
 *
 * For every Neighbourhood Alert site an active village has configured: read the
 * feed, store what came back, prune what has aged out, and record what
 * happened. **One fetch per site, not per village** — a county's ten parishes
 * share a portal and therefore share a request, which is the whole reason these
 * rows are site-scoped.
 *
 * ## What it is, and what it is not
 *
 * Nothing here touches a resident's data. It deletes nothing of anybody's,
 * publishes nothing, sends nothing and changes no report's status. The worst
 * outcome of a bad run is a stale panel on a dashboard, and that panel says
 * when it was last read.
 *
 * It is behind `CRON_SECRET` anyway, for `/api/cron/police-data`'s reason: an
 * open endpoint lets anybody run up requests against somebody else's service
 * under our user agent, and a feed with no key has nothing to revoke but an
 * address range.
 *
 * ## No village-scoped work, and therefore no audit row
 *
 * The police sync writes one `police.sync` row per village because its figures
 * are fetched *for* a village and end up in a document sent to the police.
 * Neither is true here: a bulletin is a county's, not a parish's, and it is
 * rendered on a dashboard rather than quoted in a report. `EcopsSiteSync`
 * already records every attempt with its outcome and its error, which is the
 * operational record this needs — and a row per site per night in the audit
 * trail would bury the decisions the trail exists for. `village.ecops_site_changed`
 * is audited, because that one is somebody's decision.
 *
 * ## Sites are walked in sequence
 *
 * There is no pacer here, unlike `police-api.ts`, and none is needed: a run
 * makes one request per configured site and a deployment has a handful, so the
 * "pace" is already one request every several seconds. Sequential rather than
 * `Promise.all` so that a slow feed delays the run rather than the run opening
 * every connection at once — a courtesy to a service with no quota to tell us
 * we have gone too far.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type EcopsRunSummary = {
  ok: true;
  sites: number;
  stored: number;
  failed: number;
  /** Sites that answered with an empty channel — see below. */
  empty: number;
  results: EcopsSyncOutcome[];
};

async function run(request: NextRequest) {
  if (!isCronAuthorised(request)) return cronUnauthorised();

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, error: "No database configured" },
      { status: 503 },
    );
  }

  /**
   * `?site=<id>` runs one site on demand, whether or not a village has it set.
   *
   * The same hatch `/api/cron/police-data` gives itself, and here it is how a
   * coordinator's number gets checked before they are told it is wrong: run the
   * site, read `status`, and an `empty` answer on a site that ought to be busy
   * is the evidence that the id is not a real one.
   */
  const requested = request.nextUrl.searchParams.get("site");
  const override = requested === null ? null : Number.parseInt(requested, 10);

  if (override !== null && !Number.isSafeInteger(override)) {
    return NextResponse.json(
      { ok: false, error: "site must be a whole number" },
      { status: 400 },
    );
  }

  const sites = override !== null ? [override] : await listConfiguredEcopsSites();

  const results: EcopsSyncOutcome[] = [];

  for (const siteId of sites) {
    // `syncEcopsSite` returns its failures rather than throwing, so one
    // unreachable feed costs that site and not the sites after it.
    results.push(await syncEcopsSite(siteId));
  }

  const summary: EcopsRunSummary = {
    ok: true,
    sites: sites.length,
    stored: results.reduce((total, result) => total + result.stored, 0),
    failed: results.filter((result) => result.status === "failed").length,
    // Reported rather than folded into a success count. An empty channel is a
    // quiet site *or* a mistyped `SiteId`, and the feed answers both the same
    // way — so this figure being non-zero is the one thing in the response
    // worth looking at twice.
    empty: results.filter((result) => result.status === "empty").length,
    results,
  };

  return NextResponse.json(summary);
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
