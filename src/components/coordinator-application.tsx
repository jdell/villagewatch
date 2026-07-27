import Link from "next/link";
import { Clock, ShieldCheck, XCircle } from "lucide-react";
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

const CARD =
  "rounded-2xl border border-slate-200 bg-white p-4 sm:p-6";

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

  return (
    <section className={CARD}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <ShieldCheck className="size-4 text-brand-600" aria-hidden />
        Become a coordinator
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        Coordinators review every report their village files before anyone else
        sees it, and can read the reporter&rsquo;s original wording — which is
        recorded in the audit trail each time.
      </p>

      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        If you run the watch scheme, sit on the parish council, or lead
        something the village would recognise, apply and a platform
        administrator will review it.
      </p>

      <Link
        href="/coordinator-apply"
        className="mt-4 inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
      >
        Apply to be coordinator
      </Link>
    </section>
  );
}
