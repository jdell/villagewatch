import { BadgeAlert, ExternalLink, Users } from "lucide-react";
import { ECOPS_SENDER_LABELS, isPoliceSender } from "@/lib/constants";
import type { VillageEcopsAlert } from "@/lib/ecops/alerts";
import { formatDate } from "@/lib/format";

/**
 * One rendering of a police bulletin, shared by the two surfaces that show one.
 *
 * `PoliceAlertsPanel` puts five of these on `/dashboard`; the page at
 * `/dashboard/police-alerts` puts `ECOPS_PAGE_SIZE` of them on a screen of
 * their own. The list lives here rather than in either of them for the reason
 * `formatIncidentAlert` is one function and `date-range-chip.tsx` is one
 * component: two copies of a card diverge on the day somebody fixes one, and
 * the divergence that would matter here is the sender badge — a scheme's
 * message rendered with a force's authority on one screen and not the other.
 *
 * Everything it renders was read from Postgres. Nothing here reaches
 * Neighbourhood Alert, and nothing here renders markup: the bodies arrive as
 * HTML and `toPlainText` in `src/lib/ecops/fetch-alerts.ts` strips them before
 * they are ever stored, which is where third-party HTML is stopped in this
 * codebase.
 */
export function EcopsAlertList({ alerts }: { alerts: VillageEcopsAlert[] }) {
  return (
    <ul className="mt-4 divide-y divide-slate-100">
      {alerts.map((alert) => (
        <li key={alert.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            {/*
              The sender is named on every card, because "Police" and
              "Neighbourhood Watch" carry different authority and the feed
              distinguishes them. `isPoliceSender` errs towards *not* claiming
              police authorship — labelling a scheme's message as a force's is
              the error that matters.
            */}
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
              `fetch-alerts.ts` — the same guard `police-api.ts` puts in front
              of a force's CMS URL, and needed here for a sharper reason: two
              dozen different portals publish into this one feed, so there is no
              single host to check against.
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
export function EcopsEmptyState({
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
