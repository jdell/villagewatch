import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Filter, Plus } from "lucide-react";
import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { FlashToast } from "@/components/flash-toast";
import { IncidentCard } from "@/components/incident-card";
import { NoVillage } from "@/components/no-village";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  INCIDENT_TYPES,
  INCIDENT_TYPE_VALUES,
  PUBLIC_INCIDENT_STATUSES,
  SEVERITIES,
  SEVERITY_VALUES,
} from "@/lib/constants";
import { INCIDENT_PAGE_SIZE, PUBLIC_INCIDENT_SELECT } from "@/lib/incidents";
import { signedMediaUrls } from "@/lib/media/storage";

export const metadata: Metadata = { title: "Incidents" };

/**
 * Everything published in the village, newest first.
 *
 * Filtering is a plain `GET` form rather than a Client Component. It costs a
 * round trip that client-side filtering would not, and buys three things worth
 * more than that: it works before JavaScript loads, every filtered view is a
 * shareable URL, and the filter is applied by the same query that enforces the
 * village and status scoping rather than after it.
 *
 * `searchParams` is a Promise in Next.js 16 — it is awaited, not destructured.
 */
export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; severity?: string; deleted?: string }>;
}) {
  const session = await requireSession("/incidents");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return <NoVillage />;
  }

  const params = await searchParams;

  // Anything that is not a real enum value is dropped rather than rejected — a
  // hand-edited query string should show the unfiltered list, not an error page.
  const type = (INCIDENT_TYPE_VALUES as readonly string[]).includes(
    params.type ?? "",
  )
    ? (params.type as IncidentType)
    : undefined;

  const severity = (SEVERITY_VALUES as readonly string[]).includes(
    params.severity ?? "",
  )
    ? (params.severity as Severity)
    : undefined;

  const rows = await prisma.incident.findMany({
    where: {
      villageId,
      status: { in: [...PUBLIC_INCIDENT_STATUSES] },
      type,
      severity,
    },
    select: {
      ...PUBLIC_INCIDENT_SELECT,
      tags: { select: { label: true }, orderBy: { label: "asc" } },
      media: {
        // The blurred variant, and only ever the one that has been through the
        // redaction pipeline — `redactedAt` being set is what marks it as safe
        // to serve (domain rule 3).
        where: { redactedAt: { not: null } },
        select: { redactedPath: true, mimeType: true },
        orderBy: { position: "asc" },
        take: 1,
      },
      _count: { select: { media: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: INCIDENT_PAGE_SIZE,
  });

  // One round trip for every thumbnail on the page rather than one per card.
  const urls = await signedMediaUrls(
    rows.flatMap((row) => row.media[0]?.redactedPath ?? []),
  );

  const filtered = Boolean(type || severity);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Set by the redirect at the end of `deleteIncidentAction`. */}
      {params.deleted === "1" && <FlashToast message="Report deleted" />}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Incidents
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            What has been reported in your village, newest first.
          </p>
        </div>

        <Link
          href="/incidents/new"
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <Plus className="size-4" aria-hidden />
          Report an incident
        </Link>
      </div>

      <form
        method="get"
        className="mt-6 rounded-2xl border border-slate-200 bg-white p-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-44 flex-1">
            <label
              htmlFor="filter-type"
              className="block text-sm font-medium text-slate-700"
            >
              What happened
            </label>
            <select
              id="filter-type"
              name="type"
              defaultValue={type ?? ""}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">Any type</option>
              {INCIDENT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-40 flex-1">
            <label
              htmlFor="filter-severity"
              className="block text-sm font-medium text-slate-700"
            >
              How serious
            </label>
            <select
              id="filter-severity"
              name="severity"
              defaultValue={severity ?? ""}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">Any severity</option>
              {SEVERITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
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

            {filtered && (
              <Link
                href="/incidents"
                className="inline-flex h-11 items-center rounded-lg px-3 text-sm font-medium text-slate-500 transition hover:text-slate-700"
              >
                Clear
              </Link>
            )}
          </div>
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-slate-100 text-slate-400">
            <ClipboardList className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">
            {filtered ? "Nothing matches those filters" : "Nothing reported yet"}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            {filtered
              ? "Try widening the search — reports only appear here once a coordinator has reviewed them."
              : "Reports appear here once a coordinator has reviewed them. Yours would be the first."}
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((row) => {
            const path = row.media[0]?.redactedPath;
            const thumbnailUrl = path ? urls.get(path) : undefined;

            return (
              <li key={row.id}>
                <IncidentCard
                  compact
                  href={`/incidents/${row.id}`}
                  incident={{
                    id: row.id,
                    reference: row.reference,
                    type: row.type,
                    severity: row.severity,
                    status: row.status,
                    title: row.title,
                    description: row.description,
                    occurredAt: row.occurredAt,
                    locationText: row.locationText,
                    tags: row.tags.map((tag) => tag.label),
                    media: thumbnailUrl
                      ? {
                          thumbnailUrl,
                          kind: row.media[0]!.mimeType.startsWith("video/")
                            ? "video"
                            : "image",
                          additionalCount: Math.max(0, row._count.media - 1),
                        }
                      : null,
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}

      {rows.length === INCIDENT_PAGE_SIZE && (
        <p className="mt-4 text-center text-sm text-slate-500">
          Showing the {INCIDENT_PAGE_SIZE} most recent. Narrow the filters to see
          further back.
        </p>
      )}
    </div>
  );
}
