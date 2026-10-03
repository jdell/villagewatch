import Link from "next/link";
import { ChevronRight, Clock, ShieldCheck, XCircle } from "lucide-react";
import type { CoordinatorRequestStatus } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/format";
import { COORDINATOR_APPLICANT_ROLE_LABELS } from "@/lib/constants";

/**
 * "Become a coordinator" on the settings screen.
 *
 * Rendered only for a resident who could still apply — `canApplyForCoordinator`
 * decides that, in `/settings` — so there is no approved state here: an approved
 * application makes somebody a coordinator, and a coordinator sees the
 * dashboard in the sidebar instead of this.
 *
 * A Server Component. Everything on it is a link or a sentence; the submission
 * itself is a form on its own page, because an application is not a setting.
 */

export type CoordinatorApplicationState = {
  status: CoordinatorRequestStatus;
  role: string;
  reviewNote: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
} | null;

// The redesign's card — 18px, a soft shadow, 16px in. "You" is the only screen
// that renders this component.
const CARD =
  "rounded-[18px] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.06),0_2px_8px_rgba(15,23,42,.05)]";

export function CoordinatorApplication({
  request,
}: {
  request: CoordinatorApplicationState;
}) {
  if (request?.status === "PENDING") {
    return (
      <section className={CARD}>
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Clock className="size-4 text-amber-600" aria-hidden />
          Coordinator application
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Application pending — submitted{" "}
          <time dateTime={request.createdAt.toISOString()}>
            {formatDateTime(request.createdAt)}
          </time>
          .
        </p>

        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          A platform administrator reviews applications by hand. You will get a
          notification either way, and nothing about your account changes in the
          meantime — carry on reporting as you were.
        </p>

        <p className="mt-3 text-xs text-slate-500">
          You applied as{" "}
          {COORDINATOR_APPLICANT_ROLE_LABELS[request.role] ?? request.role}.
        </p>
      </section>
    );
  }

  if (request?.status === "REJECTED") {
    return (
      <section className={CARD}>
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <XCircle className="size-4 text-slate-400" aria-hidden />
          Coordinator application
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Application declined
          {request.reviewedAt ? (
            <>
              {" "}
              on{" "}
              <time dateTime={request.reviewedAt.toISOString()}>
                {formatDateTime(request.reviewedAt)}
              </time>
            </>
          ) : null}
          .
        </p>

        {request.reviewNote && (
          <blockquote className="mt-3 border-l-2 border-slate-200 pl-3 text-sm leading-relaxed text-slate-700">
            {request.reviewNote}
          </blockquote>
        )}

        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          You can reapply. If the note above asks you something, answering it is
          the thing most likely to change the outcome.
        </p>

        <Link
          href="/coordinator-apply"
          className="mt-4 inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Apply again
        </Link>
      </section>
    );
  }

  /*
    The invitation, as the design's dark card: the one thing on "You" that is
    an offer rather than a setting, so it does not look like a setting. The
    whole card is the link.
  */
  return (
    <Link
      href="/coordinator-apply"
      className="flex items-center gap-3.5 rounded-[18px] bg-[#0f172a] p-4 text-white shadow-[0_1px_2px_rgba(15,23,42,.08),0_6px_20px_rgba(15,23,42,.14)] transition hover:bg-[#1e293b]"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10">
        <ShieldCheck className="size-[22px]" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">Become a coordinator</span>
        <span className="text-[12.5px] leading-snug text-white/70">
          Run the watch scheme or sit on the parish council? Coordinators review
          reports before the village sees them. Apply and we will review it.
        </span>
      </span>
      <ChevronRight className="size-[18px] shrink-0 text-white/60" aria-hidden />
    </Link>
  );
}
