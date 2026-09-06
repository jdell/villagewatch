import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert, SlidersHorizontal } from "lucide-react";
import {
  EcopsAlertList,
  EcopsEmptyState,
} from "@/components/dashboard/ecops-alert-list";
import { NoVillage } from "@/components/no-village";
import { requireCoordinator } from "@/lib/auth";
import { getVillageEcopsAlerts } from "@/lib/ecops/alerts";
import {
  ECOPS_AREA_NOTE,
  ECOPS_ATTRIBUTION,
  ECOPS_NO_LOCATION_NOTE,
  ECOPS_PAGE_SIZE,
} from "@/lib/constants";
import { formatTimeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Police alerts" };

/**
 * The force's own bulletins, on a screen of their own.
 *
 * `PoliceAlertsPanel` puts the most recent `ECOPS_PANEL_SIZE` on Overview,
 * where they sit under the recorded-crime figures and answer the other half of
 * the same question — those are what was *recorded* two months ago, these are
 * what a force is *telling people* right now. This page is for the coordinator
 * who wants to read them rather than notice them, and it renders
 * `ECOPS_PAGE_SIZE` of the same cards through the same `EcopsAlertList`.
 *
 * ## It reads and writes nothing
 *
 * Like Overview, and for the same reason — it is a page somebody leaves open.
 * Everything on it came from Postgres via `src/lib/ecops/alerts.ts`; the fetch
 * from Neighbourhood Alert is `GET|POST /api/cron/ecops`, on a schedule. A page
 * render that reached the feed would put somebody else's uptime in front of a
 * coordinator's screen, and would re-fetch a county's bulletins on every
 * refresh and back button.
 *
 * There is deliberately **no refresh button**, on the recorded-crime figures'
 * reasoning: the bulletins are the same for every village on the site and the
 * feed is read daily, so a button is a way for twenty coordinators to spend
 * twenty requests on a portal that has not moved.
 *
 * ## The unconfigured state is the point of the nav entry
 *
 * The panel on Overview renders **nothing at all** when no site is set — a
 * permanently blank card on every village that never wants one would be
 * clutter. A destination is different from a card: this page is how a
 * coordinator finds out the feature exists, so it explains what it is and links
 * to the field that turns it on rather than rendering an empty list. That is
 * why the sidebar entry is not conditional on `ecopsSiteId`.
 *
 * ## The caveats travel, exactly as they do on the panel
 *
 * `ECOPS_AREA_NOTE` above the list rather than below it — the obvious
 * misreading of a burglary warning on a village screen is "this happened here",
 * and a caveat somebody reaches after forming an impression has already failed.
 * `ECOPS_NO_LOCATION_NOTE` and `ECOPS_ATTRIBUTION` at the foot; the second is a
 * licence condition rather than a credit, since the feed carries a copyright
 * line and no open licence.
 */
export default async function PoliceAlertsPage() {
  const session = await requireCoordinator("/dashboard/police-alerts");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return <NoVillage />;
  }

  const data = await getVillageEcopsAlerts(villageId, ECOPS_PAGE_SIZE);

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"
          aria-hidden
        >
          <ShieldAlert className="size-6" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Police alerts
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Bulletins published by your police force and local Neighbourhood
            Watch schemes. They are not reports filed by your residents.
          </p>
        </div>
      </header>

      {data.siteId === null ? (
        <NotConfigured />
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="rounded-lg bg-indigo-50/70 px-3 py-2 text-xs leading-relaxed text-indigo-900">
              {ECOPS_AREA_NOTE}
            </p>

            {data.lastSuccessAt && (
              <p className="shrink-0 text-xs text-slate-400">
                Read {formatTimeAgo(data.lastSuccessAt)}
              </p>
            )}
          </div>

          {data.alerts.length === 0 ? (
            <EcopsEmptyState status={data.status} siteId={data.siteId} />
          ) : (
            <EcopsAlertList alerts={data.alerts} />
          )}

          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
            {ECOPS_NO_LOCATION_NOTE} {ECOPS_ATTRIBUTION}
          </p>
        </section>
      )}
    </div>
  );
}

/**
 * No site set, which is every village until a coordinator sets one.
 *
 * It says what the feature is and where the switch is. The site number is not
 * something the app can look up — it is in the address of the force's own alert
 * website — so the one thing this screen must not do is imply that pressing
 * something here will find it.
 */
function NotConfigured() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">
        No alert site set for your village
      </h2>

      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        Most UK forces and Neighbourhood Watch schemes publish their public
        bulletins through Neighbourhood Alert — scam warnings, appeals for
        information, PCSO drop-ins. Once your village points at the right site,
        the most recent ones appear here and on your dashboard.
      </p>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
        You will need your force&rsquo;s site number, which is in the address of
        its own alert website. Nothing here can look it up for you.
      </p>

      <Link
        href="/dashboard/settings"
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-800"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Set it in Village settings
      </Link>
    </section>
  );
}
