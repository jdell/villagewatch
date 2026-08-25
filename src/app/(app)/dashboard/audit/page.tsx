import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Filter, ScrollText, ShieldAlert } from "lucide-react";
import { NoVillage } from "@/components/no-village";
import { requireCoordinator } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_META,
  auditActionLabel,
  AUDIT_LOG_PAGE_SIZE,
  USER_ROLE_LABELS,
} from "@/lib/constants";
import { formatDateTime, formatTimeAgo } from "@/lib/format";
import { getVillageMode } from "@/lib/villages";
import type { UserRole } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Audit trail" };

/**
 * The audit trail, for the coordinators it holds to account.
 *
 * Domain rule 7 says `AuditLog` is append-only; this is the screen that makes
 * that worth something. A trail nobody can read is a trail nobody checks, and
 * the row that matters most — "coordinator X opened the reporter's verbatim
 * words at 23:14" — is exactly the one that only means anything if a second
 * pair of eyes can see it.
 *
 * Three things it deliberately does not do:
 *
 * - **It writes nothing.** Not even a "coordinator viewed the audit trail" row.
 *   The trail records reads of personal data, and none is on this page:
 *   `before` and `after` hold statuses, references and counts, never report
 *   text. Auditing the audit viewer would bury the rows that matter under
 *   rows about looking at them.
 * - **It is village-scoped**, like every other query (domain rule 4). A
 *   coordinator sees their own village's trail and no other.
 * - **It shows the actor's email even after the account is gone.** `actorEmail`
 *   and `actorRole` are denormalised onto the row for exactly this — a trail
 *   that forgets who did something when they delete their account is not a
 *   trail.
 */

const TONE_CLASS = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-300",
  positive: "bg-safe-50 text-safe-700 ring-safe-200",
  negative: "bg-red-50 text-red-700 ring-red-600/20",
  sensitive: "bg-amber-50 text-amber-800 ring-amber-600/20",
} as const;

/**
 * Pulls the human-facing reference out of the JSON blob, when there is one.
 * `before` and `after` are free-form, so everything here is a guess that has to
 * survive being wrong.
 */
function referenceOf(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;

  const reference = (value as Record<string, unknown>).reference;
  return typeof reference === "string" ? reference : null;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string }>;
}) {
  const session = await requireCoordinator("/dashboard/audit");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return <NoVillage />;
  }

  const params = await searchParams;

  // An unknown action is dropped rather than rejected — a hand-edited query
  // string should show the unfiltered trail, not an error page.
  const action = AUDIT_ACTION_META[params.action ?? ""]
    ? params.action
    : undefined;

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const skip = (page - 1) * AUDIT_LOG_PAGE_SIZE;

  const where = { villageId, action };

  /*
    The village's model, for one word on this screen: `village.parish_council_changed`
    is filed as "Parish council changed" in a council village and "Data
    controller changed" in a community one, matching the dashboard field that
    writes it. The stored action never moves — see `auditActionLabel`.
  */
  const [mode, rows, total] = await Promise.all([
    getVillageMode(villageId),
    prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        actorEmail: true,
        actorRole: true,
        actor: { select: { fullName: true } },
        before: true,
        after: true,
        ipAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: AUDIT_LOG_PAGE_SIZE,
      skip,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const lastPage = Math.max(1, Math.ceil(total / AUDIT_LOG_PAGE_SIZE));

  function pageHref(target: number) {
    const query = new URLSearchParams();
    if (action) query.set("action", action);
    if (target > 1) query.set("page", String(target));

    const search = query.toString();
    return search ? `/dashboard/audit?${search}` : "/dashboard/audit";
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to overview
      </Link>

      <div className="mt-4">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-slate-900">
          <ScrollText className="size-6 text-slate-400" aria-hidden />
          Audit trail
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
          Every privileged action taken in your village, newest first. Nothing
          here can be edited or deleted, by anyone — including whoever it
          records.
        </p>
      </div>

      <form
        method="get"
        className="mt-6 rounded-2xl border border-slate-200 bg-white p-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label
              htmlFor="filter-action"
              className="block text-sm font-medium text-slate-700"
            >
              What happened
            </label>
            <select
              id="filter-action"
              name="action"
              defaultValue={action ?? ""}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">Every action</option>
              {AUDIT_ACTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {auditActionLabel(option.value, mode)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Filter className="size-4" aria-hidden />
              Apply
            </button>

            {action && (
              <Link
                href="/dashboard/audit"
                className="inline-flex h-11 items-center rounded-lg px-3 text-sm font-medium text-slate-500 transition hover:text-slate-700"
              >
                Clear
              </Link>
            )}
          </div>
        </div>

        {action && AUDIT_ACTION_META[action] && (
          <p className="mt-3 text-xs text-slate-500">
            {AUDIT_ACTION_META[action]!.description}.
          </p>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-slate-100 text-slate-400">
            <ShieldAlert className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">
            {action ? "Nothing matches that filter" : "Nothing recorded yet"}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            {action
              ? "Try a different action, or clear the filter to see everything."
              : "Entries appear as soon as anyone files, publishes or reviews a report."}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {/* One table, two layouts. The header is hidden below `sm` and each
              row becomes a stacked card, so a coordinator on a phone gets the
              same trail rather than a horizontally scrolling one. */}
          <table className="w-full text-sm">
            <thead className="hidden bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 sm:table-header-group">
              <tr>
                <th scope="col" className="px-4 py-3">
                  When
                </th>
                <th scope="col" className="px-4 py-3">
                  Who
                </th>
                <th scope="col" className="px-4 py-3">
                  Action
                </th>
                <th scope="col" className="px-4 py-3">
                  Target
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {rows.map((row) => {
                const meta = AUDIT_ACTION_META[row.action];
                const reference =
                  referenceOf(row.after) ?? referenceOf(row.before);

                return (
                  <tr
                    key={row.id}
                    className="block px-4 py-4 sm:table-row sm:px-0 sm:py-0"
                  >
                    <td className="block sm:table-cell sm:px-4 sm:py-3 sm:align-top">
                      <time
                        dateTime={row.createdAt.toISOString()}
                        title={formatDateTime(row.createdAt)}
                        suppressHydrationWarning
                        className="text-slate-900"
                      >
                        {formatTimeAgo(row.createdAt)}
                      </time>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDateTime(row.createdAt)}
                      </p>
                    </td>

                    <td className="mt-2 block sm:mt-0 sm:table-cell sm:px-4 sm:py-3 sm:align-top">
                      <p className="font-medium text-slate-900">
                        {row.actor?.fullName ??
                          row.actorEmail ??
                          "Deleted account"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {row.actorRole
                          ? (USER_ROLE_LABELS[row.actorRole as UserRole] ??
                            row.actorRole)
                          : "Unknown role"}
                        {row.ipAddress ? ` · ${row.ipAddress}` : ""}
                      </p>
                    </td>

                    <td className="mt-2 block sm:mt-0 sm:table-cell sm:px-4 sm:py-3 sm:align-top">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                          TONE_CLASS[meta?.tone ?? "neutral"]
                        }`}
                      >
                        {/* An action from an older build has no metadata. The
                            raw string is still the truth of what happened. */}
                        {auditActionLabel(row.action, mode)}
                      </span>
                    </td>

                    <td className="mt-2 block sm:mt-0 sm:table-cell sm:px-4 sm:py-3 sm:align-top">
                      {row.entityType === "Incident" && row.entityId ? (
                        <Link
                          href={`/incidents/${row.entityId}`}
                          className="font-mono text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
                        >
                          {reference ?? row.entityId.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-slate-500">
                          {reference ??
                            `${row.entityType}${row.entityId ? ` ${row.entityId.slice(0, 8)}` : ""}`}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > AUDIT_LOG_PAGE_SIZE && (
        <nav
          aria-label="Audit trail pages"
          className="mt-4 flex items-center justify-between gap-3"
        >
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Newer
            </Link>
          ) : (
            <span />
          )}

          <p className="text-sm text-slate-500">
            Page {page} of {lastPage} · {total} entr
            {total === 1 ? "y" : "ies"}
          </p>

          {page < lastPage ? (
            <Link
              href={pageHref(page + 1)}
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
