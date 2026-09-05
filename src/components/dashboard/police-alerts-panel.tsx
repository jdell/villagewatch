import { BadgeAlert, ExternalLink, ShieldAlert, Users } from "lucide-react";
import {
  ECOPS_AREA_NOTE,
  ECOPS_ATTRIBUTION,
  ECOPS_NO_LOCATION_NOTE,
  ECOPS_SENDER_LABELS,
  isPoliceSender,
} from "@/lib/constants";
import type { VillageEcopsAlerts } from "@/lib/ecops/alerts";
import { formatDate, formatTimeAgo } from "@/lib/format";

/**
 * Bulletins published by the village's police force or watch scheme.
 *
 * A Server Component with no state and no client bundle, like every other panel
 * on `/dashboard`. Everything it renders was read from Postgres by
 * `src/lib/ecops/alerts.ts`; nothing here reaches Neighbourhood Alert, because a
 * page render that waited on a third party would put somebody else's uptime in
 * front of a coordinator's queue.
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
        <EmptyState status={status} siteId={data.siteId} />
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {alerts.map((alert) => (
            <li key={alert.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                    isPoliceSender(alert.sentBy)
                      ? "bg-indigo-50 text-indigo-800 ring-indigo-600/20"
                      : "bg-slate-100 text-slate-700 ring-slate-500/20"
                  }`}
                >
                  {isPoliceSender(alert.sentBy) ? (
                    <BadgeAlert className="size-3" aria-hidden />
                  ) : (
                    <Users className="size-3" aria-hidden />
                  )}
                  {senderLabel(alert.sentBy)}
                </span>

                {alert.category && (
                  <span className="text-[11px] text-slate-500">
                    {alert.category}
                  </span>
                )}

                <span className="text-[11px] text-slate-400">
                  {formatDate(alert.publishedAt)}
                </span>
              </div>

              <h3 className="mt-1.5 text-sm font-semibold text-slate-900">
                {alert.title}
              </h3>

              {alert.summary && (
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {alert.summary}
                </p>
              )}

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {alert.senderName && (
                  <span className="text-slate-500">{alert.senderName}</span>
                )}

                {/*
                  `link` has already been through the `http(s)`-only check in
                  `fetch-alerts.ts` — the same guard `police-api.ts` puts in
                  front of a force's CMS URL, and needed here for a sharper
                  reason: two dozen different portals publish into this one
                  feed, so there is no single host to check against.
                */}
                {alert.link && (
                  <a
                    href={alert.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-brand-700 hover:text-brand-800"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    Read the full alert
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
        {ECOPS_NO_LOCATION_NOTE} {ECOPS_ATTRIBUTION}
      </p>
    </section>
  );
}

function senderLabel(sentBy: string | null): string {
  const value = (sentBy ?? "").trim();

  if (!value) return "Alert";

  // Known senders get the short label; anything else — and the feed carries
  // scheme names beyond the two common ones — falls through as itself rather
  // than being flattened into "Police", which would be a claim.
  return ECOPS_SENDER_LABELS[value] ?? value;
}

/**
 * The three states that are not "no alerts", and they want three sentences.
 *
 * A site nobody has fetched, a site that answered empty and a site whose fetch
 * failed all show zero alerts, and the coordinator's next move is different for
 * each. Collapsing them into "No alerts yet" would leave somebody who mistyped
 * their site number waiting indefinitely for a feed that is answering perfectly
 * well — with nothing.
 */
function EmptyState({
  status,
  siteId,
}: {
  status: string | null;
  siteId: number;
}) {
  if (status === "failed") {
    return (
      <p className="mt-4 text-sm text-slate-500">
        The alert feed could not be reached at the last attempt. Anything
        already fetched is still shown above; the next scheduled run will try
        again.
      </p>
    );
  }

  if (status === "empty") {
    return (
      <p className="mt-4 text-sm text-slate-500">
        Site {siteId} returned no messages. That is either a quiet week or a site
        number that does not exist — the feed answers both the same way, so check
        the number against your force&rsquo;s own alert website if nothing
        appears here within a few days.
      </p>
    );
  }

  return (
    <p className="mt-4 text-sm text-slate-500">
      Nothing fetched yet. The scheduled job runs daily and will fill this panel
      on its next run.
    </p>
  );
}
