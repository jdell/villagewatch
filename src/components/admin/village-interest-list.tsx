import { MapPinPlus, Star } from "lucide-react";
import type { VillageInterestGroup } from "@/lib/village-interest";
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
}: {
  groups: readonly VillageInterestGroup[];
}) {
  const people = groups.reduce((sum, group) => sum + group.total, 0);
  const candidates = groups.reduce(
    (sum, group) => sum + group.coordinatorCandidates,
    0,
  );

  return (
    <section className="mt-10">
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

      {groups.length === 0 ? (
        /*
          The empty state says what would fill it rather than just that it is
          empty. This section is invisible until somebody uses a form most
          administrators will never see, so "none yet" alone reads as broken.
        */
        <p className="mt-4 rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          Nobody has registered interest yet. Registrations arrive when somebody
          chooses &ldquo;My village isn&rsquo;t listed&rdquo; on the sign-up
          screen.
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
