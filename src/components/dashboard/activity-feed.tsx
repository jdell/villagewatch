import Link from "next/link";
import { Activity, ArrowRight } from "lucide-react";
import {
  AUDIT_ACTION_META,
  auditActionLabel,
  type VillageMode,
} from "@/lib/constants";
import { formatDateTime, formatTimeAgo } from "@/lib/format";

/**
 * What has happened in the village lately, on the Overview tab.
 *
 * A window onto `/dashboard/audit` rather than a second copy of it. The viewer
 * is the screen that filters, paginates and shows the actor's address; this is
 * the eight most recent rows, so that "what have I missed" is answerable from
 * the page a coordinator lands on.
 *
 * **It writes nothing**, which is the audit viewer's own rule and is here for
 * the same reason: the trail records reads of personal data, none of which is
 * on this page — `before` and `after` hold statuses, references and counts,
 * never report text — and a row per glance would bury the rows that matter
 * under rows about looking at them.
 *
 * Rendered through `auditActionLabel`, so a community village reads its own
 * words for the one action whose label follows `Village.mode`. The stored
 * action never moves.
 *
 * A row whose action this build does not know renders its raw string rather
 * than being dropped: the trail is append-only (domain rule 7), so a row
 * written by an older build has to stay readable.
 */

const TONE_DOT = {
  neutral: "bg-slate-300",
  positive: "bg-safe-500",
  negative: "bg-red-500",
  sensitive: "bg-amber-500",
} as const;

export type ActivityRow = {
  id: string;
  action: string;
  /** Denormalised on the row, so it survives the account being closed. */
  actorName: string | null;
  actorEmail: string | null;
  /** ISO string — a `Date` does not cross into a Client Component intact, and
   * keeping the shape the same either way means this can move if it ever does. */
  createdAt: string;
};

export function ActivityFeed({
  rows,
  mode,
}: {
  rows: readonly ActivityRow[];
  mode: VillageMode;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Activity className="size-4 text-slate-400" aria-hidden />
          Recent activity
        </h2>
        <Link
          href="/dashboard/audit"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 transition hover:text-brand-800"
        >
          Full audit trail
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          Nothing has happened in your village yet.
        </p>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {rows.map((row) => {
            const meta = AUDIT_ACTION_META[row.action];

            return (
              <li key={row.id} className="flex items-start gap-3">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    TONE_DOT[meta?.tone ?? "neutral"]
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    {auditActionLabel(row.action, mode)}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {/*
                      The name where the account still exists, the denormalised
                      address where it does not, and "the system" for the rows
                      the cron jobs write — which have no actor at all and
                      would otherwise read as somebody anonymous.
                    */}
                    {row.actorName ?? row.actorEmail ?? "VillageWatch"}
                    {" · "}
                    <time
                      dateTime={row.createdAt}
                      title={formatDateTime(row.createdAt)}
                    >
                      {formatTimeAgo(row.createdAt)}
                    </time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
