import Link from "next/link";
import { MapPinPlus, Star } from "lucide-react";
import { ArchiveInterest } from "@/components/admin/archive-interest";
import { archiveReasonLabel, type VillageInterestGroup } from "@/lib/village-interest";
import { formatDate } from "@/lib/format";

/**
 * The expansion pipeline: who has asked for a village that is not in service.
 *
 * A Server Component with no interactivity at all, which is the point —
 * everything an administrator can *do* about a village on this page is on the
 * list above. This is the reading half: which places have people waiting, and
 * which of those have somebody willing to run it.
 *
 * ## Coordinator candidates are the highlighted thing because they are the
 * ## bottleneck
 *
 * `listVillageInterest` already orders a village with a candidate above one
 * without, whatever the counts, and this renders that ordering visibly: a
 * starred badge on the group and a ring on the person. Forty residents waiting
 * and nobody to coordinate is a village that **cannot** be activated —
 * `activateVillage` appoints a named person — so a list sorted by popularity
 * would put the un-actionable thing at the top.
 *
 * ## Every address is on screen, and that is a deliberate difference from the
 * ## resident list
 *
 * `dashboard/resident-list.tsx` masks addresses and reveals them one at a time,
 * because it is a village's membership list read on a coordinator's screen at a
 * parish meeting and a screenshot of it is a disclosure. This is a handful of
 * people who asked to be contacted, read by a platform administrator whose next
 * action is to contact them — masking here would be a button to press before
 * every single one of the things this page exists for, protecting a list whose
 * entire purpose is that somebody writes to it.
 *
 * The **motivation** is shown here and deliberately never sent to Slack: it is
 * free text a stranger typed, and the two sentences it usually holds are what
 * has been happening in their village and who they think is doing it. Behind a
 * session, read once, acted on — rather than sitting in a channel indefinitely.
 */
export function VillageInterestList({
  groups,
  showArchived,
  pending,
  archived,
  /** The page's other query parameters, so a filter link does not drop them. */
  keep,
}: {
  groups: readonly VillageInterestGroup[];
  showArchived: boolean;
  pending: number;
  archived: number;
  keep: { tab?: string; q?: string; metric?: string };
}) {
  /*
    The filter is two links rather than a control, so it is a URL somebody can
    bookmark and a back button that works — the property the period controls on
    `/reports` and `/incidents` are built around, and the reason those are GET
    forms rather than state. It carries the village list's own parameters
    through, because losing a search on the way to the archived pipeline would
    put an administrator back at the top of 10,670 parishes.
  */
  const href = (interest: "pending" | "archived") => {
    const query = new URLSearchParams();

    if (keep.tab) query.set("tab", keep.tab);
    if (keep.q) query.set("q", keep.q);
    if (keep.metric) query.set("metric", keep.metric);
    if (interest === "archived") query.set("interest", "archived");

    const suffix = query.toString();
    return `/admin/villages${suffix ? `?${suffix}` : ""}#interest`;
  };
  const people = groups.reduce((sum, group) => sum + group.total, 0);
  const candidates = groups.reduce(
    (sum, group) => sum + group.coordinatorCandidates,
    0,
  );

  return (
    <section id="interest" className="mt-10 scroll-mt-6">
      <div className="flex items-start gap-2.5">
        <MapPinPlus className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Interest registrations
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            People who asked for a village that is not in service yet. A village
            with a coordinator candidate is one that can be activated; the rest
            are demand, and are the figure worth quoting to a parish council.
          </p>
        </div>
      </div>

      {/*
        Both counts are on screen whichever list is showing, because the
        question the filter answers is "is there anything over there" — a link
        reading "Archived" with no number beside it is one nobody presses, and
        the archived count is how an administrator can see the pipeline is being
        worked at all.
      */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(
          [
            { key: "pending", label: "Pending", count: pending },
            { key: "archived", label: "Archived", count: archived },
          ] as const
        ).map((filter) => {
          const active = (filter.key === "archived") === showArchived;

          return (
            <Link
              key={filter.key}
              href={href(filter.key)}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              {filter.label}
              <span
                className={`ml-1.5 tabular-nums ${
                  active ? "text-white/70" : "text-slate-500"
                }`}
              >
                {filter.count}
              </span>
            </Link>
          );
        })}
      </div>

      {groups.length === 0 ? (
        /*
          The empty state says what would fill it rather than just that it is
          empty. This section is invisible until somebody uses a form most
          administrators will never see, so "none yet" alone reads as broken —
          and the archived side needs its own sentence, because "nobody has
          registered interest" under an Archived filter is simply false when
          there are twelve people on the other tab.
        */
        <p className="mt-4 rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          {showArchived ? (
            <>
              Nothing has been archived yet. Archiving takes a registration off
              the working list and deletes nothing.
            </>
          ) : (
            <>
              Nobody has registered interest yet. Registrations arrive when
              somebody chooses &ldquo;My village isn&rsquo;t listed&rdquo; on
              the sign-up screen.
            </>
          )}
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-slate-600">
            <strong className="font-semibold text-slate-900">
              {groups.length}
            </strong>{" "}
            {groups.length === 1 ? "village" : "villages"},{" "}
            <strong className="font-semibold text-slate-900">{people}</strong>{" "}
            {people === 1 ? "person" : "people"},{" "}
            <strong className="font-semibold text-slate-900">
              {candidates}
            </strong>{" "}
            willing to coordinate.
          </p>

          <ul className="mt-4 space-y-3">
            {groups.map((group) => (
              <li
                key={`${group.villageName}|${group.county}`}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {group.villageName}
                    <span className="ml-2 font-normal text-slate-500">
                      {group.county}
                    </span>
                  </h3>

                  <span className="text-xs text-slate-500">
                    {group.total} {group.total === 1 ? "person" : "people"}
                  </span>
                </div>

                {group.coordinatorCandidates > 0 && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                    <Star className="size-3.5 shrink-0" aria-hidden />
                    {group.coordinatorCandidates === 1
                      ? "1 coordinator candidate"
                      : `${group.coordinatorCandidates} coordinator candidates`}
                  </p>
                )}

                <ul className="mt-3 space-y-2">
                  {group.entries.map((entry) => {
                    const isCandidate = entry.role === "COORDINATOR_CANDIDATE";

                    return (
                      <li
                        key={entry.id}
                        className={`rounded-lg px-3 py-2 text-sm ${
                          isCandidate
                            ? "bg-amber-50/60 ring-1 ring-amber-200"
                            : "bg-slate-50"
                        }`}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-medium text-slate-900">
                            {entry.name}
                            {isCandidate && (
                              <span className="ml-2 text-xs font-normal text-amber-800">
                                would coordinate
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatDate(entry.createdAt)}
                          </span>
                        </div>

                        {/*
                          A real mailto. The one action this page supports is
                          writing to somebody, and making an administrator
                          select-and-copy an address forty times is how a
                          pipeline stops being worked.
                        */}
                        <a
                          href={`mailto:${entry.email}`}
                          className="mt-0.5 block truncate text-xs text-brand-600 underline underline-offset-2 hover:text-brand-700"
                        >
                          {entry.email}
                        </a>

                        {entry.motivation && (
                          <p className="mt-2 border-l-2 border-amber-300 pl-3 text-xs leading-relaxed text-slate-600">
                            {entry.motivation}
                          </p>
                        )}

                        {/*
                          What was decided about this row, on the row. An
                          archived list whose entries look identical to a
                          pending one is a list nobody can audit, which is the
                          whole reason the reason is recorded — and the date
                          beside it is what separates "we contacted them last
                          week" from "in March".
                        */}
                        {entry.status === "ARCHIVED" && (
                          <p className="mt-2 text-xs text-slate-500">
                            Archived
                            {entry.archivedAt
                              ? ` ${formatDate(entry.archivedAt)}`
                              : ""}
                            {archiveReasonLabel(entry.archivedReason) ? (
                              <>
                                {" — "}
                                <span className="text-slate-700">
                                  {archiveReasonLabel(entry.archivedReason)}
                                </span>
                              </>
                            ) : null}
                          </p>
                        )}

                        <div className="mt-1.5">
                          <ArchiveInterest
                            id={entry.id}
                            name={entry.name}
                            archived={entry.status === "ARCHIVED"}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
