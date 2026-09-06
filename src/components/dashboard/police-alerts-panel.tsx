import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import {
  EcopsAlertList,
  EcopsEmptyState,
} from "@/components/dashboard/ecops-alert-list";
import {
  ECOPS_AREA_NOTE,
  ECOPS_ATTRIBUTION,
  ECOPS_NO_LOCATION_NOTE,
} from "@/lib/constants";
import type { VillageEcopsAlerts } from "@/lib/ecops/alerts";
import { formatTimeAgo } from "@/lib/format";

/**
 * Bulletins published by the village's police force or watch scheme.
 *
 * A Server Component with no state and no client bundle, like every other panel
 * on `/dashboard`. Everything it renders was read from Postgres by
 * `src/lib/ecops/alerts.ts`; nothing here reaches Neighbourhood Alert, because a
 * page render that waited on a third party would put somebody else's uptime in
 * front of a coordinator's queue.
 *
 * The cards themselves are `EcopsAlertList`, shared with
 * `/dashboard/police-alerts` — this file is the framing on Overview (the mark,
 * the caveat, the last-read line and the way through), and that one is the
 * bulletin. Two copies of a card would diverge on the day somebody fixed one,
 * and the divergence that would matter is the sender badge.
 *
 * ## It is visibly not a village report, and that is the whole design
 *
 * Every other card on this dashboard is something a resident of this village
 * filed. These are not: they are notices a force published to a whole county,
 * and a coordinator skimming the page must never take one for the other. Three
 * things keep them apart, and none of them is decoration:
 *
 * - **A different mark and a different colour.** A police badge in indigo,
 *   against the brand blue and the severity scale the village's own reports
 *   use. A resident who has learned that amber means a moderate incident should
 *   not have to relearn it here.
 * - **The sender is named on every card.** "Police" and "Neighbourhood Watch"
 *   carry different authority, and the feed distinguishes them, so this does
 *   too — `isPoliceSender` errs towards *not* claiming police authorship,
 *   because labelling a scheme's message as a force's is the error that
 *   matters.
 * - **`ECOPS_AREA_NOTE` is on the panel, not in a tooltip.** The obvious
 *   misreading of a burglary warning on a village dashboard is "this happened
 *   here", and the feed cannot support that — the narrowest filter it honours
 *   is the whole portal. Same discipline `POLICE_COMPARISON_NOTE` gets.
 *
 * ## Why there are no pins for these on the map
 *
 * Asked and answered on the panel itself, via `ECOPS_NO_LOCATION_NOTE`, because
 * "put them on the map" is the obvious next request. The feed publishes no
 * location of any kind — no coordinate, no postcode, not even a place name —
 * so the only honest options are the village centre, which would state a
 * location the source does not have on the one screen residents read as a map
 * of what happened near them, or nothing. It is nothing. The recorded-crime
 * figures are off the map for the same reason and render as two counts.
 *
 * ## Absence is rendered, never rounded to nothing
 *
 * Four states, and three of them are not "no alerts". A village with no site
 * configured renders **nothing at all** — the feature is off and an empty card
 * would look broken. A site configured and never fetched, a site that answered
 * empty, and a site whose last fetch failed each get their own sentence,
 * because the coordinator's next move differs in each case and only one of them
 * is "wait". That distinction is the entire reason `EcopsSiteSync` exists: the
 * feed answers a quiet site and a mistyped number identically.
 */
export function PoliceAlertsPanel({ data }: { data: VillageEcopsAlerts }) {
  // The feature is off for this village. Rendering an empty panel would put a
  // permanently blank card on the dashboard of every village that never wants
  // one.
  if (data.siteId === null) return null;

  const { alerts, status, lastSuccessAt } = data;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700"
            aria-hidden
          >
            <ShieldAlert className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Police alerts
            </h2>
            <p className="text-xs text-slate-500">
              Published by your force and local watch schemes
            </p>
          </div>
        </div>

        {lastSuccessAt && (
          <p className="text-xs text-slate-400">
            Read {formatTimeAgo(lastSuccessAt)}
          </p>
        )}
      </div>

      {/*
        Above the alerts rather than below them. It is the sentence that decides
        how everything under it should be read, and a caveat somebody reaches
        after forming an impression has already failed.
      */}
      <p className="mt-4 rounded-lg bg-indigo-50/70 px-3 py-2 text-xs leading-relaxed text-indigo-900">
        {ECOPS_AREA_NOTE}
      </p>

      {alerts.length === 0 ? (
        <EcopsEmptyState status={status} siteId={data.siteId} />
      ) : (
        <EcopsAlertList alerts={alerts} />
      )}

      {/*
        The way through to the rest. The panel shows `ECOPS_PANEL_SIZE` because
        Overview is skimmed, and a coordinator who wants to actually read the
        force's bulletins wants a screen that is not competing with their own
        village's figures — see `/dashboard/police-alerts`. Rendered only where
        there is something to go and read, so a village whose feed has never
        returned anything is not offered a fuller view of nothing.
      */}
      {alerts.length > 0 && (
        <Link
          href="/dashboard/police-alerts"
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          View all police alerts
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}

      <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
        {ECOPS_NO_LOCATION_NOTE} {ECOPS_ATTRIBUTION}
      </p>
    </section>
  );
}
