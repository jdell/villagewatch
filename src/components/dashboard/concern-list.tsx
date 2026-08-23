import Link from "next/link";
import { ThumbsDown, ThumbsUp, Users } from "lucide-react";
import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { IncidentTypeIcon } from "@/components/incident-type-icon";
import { SeverityBadge } from "@/components/severity-badge";
import {
  CONCERN_SORTS,
  INCIDENT_TYPE_LABELS,
  type ConcernSort,
} from "@/lib/constants";
import { formatTimeAgo } from "@/lib/format";
import type { VoteTally } from "@/lib/votes";

/**
 * What the village made of its own reports, ordered.
 *
 * The dashboard's other panels count what was *filed*; this one counts what the
 * village thought of it. It is the only signal on the page that does not come
 * from the reporter or from a coordinator, which is the whole reason it earns a
 * panel rather than a column on an existing one.
 *
 * ## It lists only reports somebody voted on
 *
 * A report with no votes is not "least concerning", it is unrated, and padding
 * the list out with them would turn an ordering into a ranking of things
 * nobody ranked. That is also why there is no "recent" sort here — ordering
 * voted reports by date makes this a worse copy of `/incidents`.
 *
 * ## The sort is its own GET form
 *
 * Rather than another field on the period form above it, for two reasons: the
 * control belongs beside the thing it orders, and the period form is already
 * `TimeRangeFields` plus its own submit button. The period rides along as
 * hidden inputs so changing the sort does not silently drop a coordinator back
 * to the default month — the same trick `TimeRangeFields` uses to carry a
 * custom range through a preset change.
 *
 * It works with no JavaScript: a real `<select name="sort">` and a real submit
 * button, which is the property every filter on these screens keeps.
 *
 * ## Nobody's name is here
 *
 * Two counts per row and nothing else. A coordinator can read the underlying
 * rows through the database if they have the anon key and the standing — see
 * `incident_votes` in `rls_policies.sql` — but no screen in the app puts a
 * neighbour's name against an opinion of another neighbour's report.
 */

export type ConcernRow = {
  id: string;
  reference: string;
  type: IncidentType;
  severity: Severity;
  title: string;
  locationText: string | null;
  occurredAt: Date | string;
  votes: VoteTally;
};

export function ConcernList({
  rows,
  sort,
  period,
  periodLabel,
}: {
  rows: readonly ConcernRow[];
  sort: ConcernSort;
  /** The current period, carried through the sort form as hidden inputs. */
  period: { range: string; from: string; to: string };
  periodLabel: string;
}) {
  const meta = CONCERN_SORTS.find((option) => option.value === sort);

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Users className="size-4 text-slate-400" aria-hidden />
            What your village thinks
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {meta?.description ?? "Reports your village has voted on"} (
            {periodLabel.toLowerCase()}).
          </p>
        </div>

        <form method="get" className="flex items-end gap-2">
          {/*
            The period, so changing the sort does not drop the coordinator back
            to the default month. Rendered whatever is selected — two parameters
            the resolver ignores for every preset but `custom`.
          */}
          <input type="hidden" name="range" value={period.range} />
          <input type="hidden" name="from" value={period.from} />
          <input type="hidden" name="to" value={period.to} />

          <div>
            <label htmlFor="concern-sort" className="sr-only">
              Order these reports by
            </label>
            <select
              id="concern-sort"
              name="sort"
              defaultValue={sort}
              className="block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              {CONCERN_SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Sort
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          Nobody has voted on a report in this period yet. Residents see a thumbs
          up and a thumbs down on every published report — this is where the
          totals land.
        </p>
      ) : (
        <ol className="mt-4 space-y-2.5">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/incidents/${row.id}`}
                className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-slate-200 transition hover:bg-white hover:ring-slate-300"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200">
                  <IncidentTypeIcon type={row.type} className="size-4" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium text-slate-900">
                      {row.title}
                    </span>
                    <SeverityBadge severity={row.severity} size="sm" />
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {INCIDENT_TYPE_LABELS[row.type]}
                    {row.locationText ? ` · ${row.locationText}` : ""} ·{" "}
                    <time
                      dateTime={new Date(row.occurredAt).toISOString()}
                      suppressHydrationWarning
                    >
                      {formatTimeAgo(row.occurredAt)}
                    </time>
                  </span>
                </span>

                {/*
                  Both counts, never the net score on its own. "+3" hides
                  whether the village agreed or argued, and the difference
                  between 3–0 and 7–4 is the whole reason a coordinator is
                  looking at this list.
                */}
                <span className="flex shrink-0 items-center gap-2.5 text-xs tabular-nums text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <ThumbsUp className="size-3.5 text-brand-600" aria-hidden />
                    <span className="sr-only">rated more serious by</span>
                    {row.votes.up}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ThumbsDown
                      className="size-3.5 text-amber-600"
                      aria-hidden
                    />
                    <span className="sr-only">rated less serious by</span>
                    {row.votes.down}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
