"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Check, ChevronRight, Loader2, MapPin, X } from "lucide-react";
import type { CoordinatorRequestStatus } from "@/generated/prisma/enums";
import { formatDateTime, formatTimeAgo } from "@/lib/format";
import {
  COORDINATOR_APPLICANT_ROLE_LABELS,
  COORDINATOR_REQUEST_STATUS_LABELS,
} from "@/lib/constants";
import {
  decideCoordinatorRequestAction,
  type CoordinatorDecisionState,
} from "@/app/(app)/admin/coordinators/actions";

/**
 * One coordinator application, with the two decisions an administrator can
 * make.
 *
 * Rejecting reveals a textarea and will not submit without it. That is not a
 * courtesy: the applicant's rejection notification quotes the note back to them
 * (`notifyApplicantOfCoordinatorDecision`), so a rejection with nothing in it
 * would tell somebody who volunteered to run their village's watch scheme
 * "no", full stop, with no way to know whether to ask again.
 *
 * Approving is deliberately the plainer path — one click, no note — because the
 * approval carries its own explanation in the notification, and the audit row
 * carries who did it.
 */

export type ReviewableRequest = {
  id: string;
  role: string;
  roleDetail: string | null;
  reason: string;
  status: CoordinatorRequestStatus;
  reviewNote: string | null;
  /** ISO strings — a Server Component cannot hand a Date to a client one. */
  createdAt: string;
  reviewedAt: string | null;
  applicantName: string;
  applicantEmail: string;
  applicantRoleLabel: string;
  villageName: string;
  villageRegion: string | null;
  reviewedByName: string | null;
};

const IDLE: CoordinatorDecisionState = { ok: true, message: "" };

const STATUS_CLASS = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-600/20",
  APPROVED: "bg-green-50 text-green-700 ring-green-600/20",
  REJECTED: "bg-slate-100 text-slate-600 ring-slate-500/20",
} satisfies Record<CoordinatorRequestStatus, string>;

function DecideButton({
  decision,
  children,
  className,
}: {
  decision: "APPROVE" | "REJECT";
  children: React.ReactNode;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="decision"
      value={decision}
      disabled={pending}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-60 ${className}`}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : decision === "APPROVE" ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <X className="size-4" aria-hidden />
      )}
      {children}
    </button>
  );
}

/** The identity block, shared by the queue and the history tab. */
function Header({ request }: { request: ReviewableRequest }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_CLASS[request.status]}`}
        >
          {COORDINATOR_REQUEST_STATUS_LABELS[request.status]}
        </span>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
          {COORDINATOR_APPLICANT_ROLE_LABELS[request.role] ?? request.role}
        </span>

        <span
          className="ml-auto text-xs text-slate-500"
          title={formatDateTime(request.createdAt)}
        >
          Applied{" "}
          <time suppressHydrationWarning>
            {formatTimeAgo(request.createdAt)}
          </time>
        </span>
      </div>

      <h3 className="mt-2.5 text-base font-semibold text-slate-900">
        {request.applicantName}
      </h3>

      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden />
          {request.villageName}
          {request.villageRegion ? `, ${request.villageRegion}` : ""}
        </span>
        <span aria-hidden>·</span>
        <span>{request.applicantRoleLabel}</span>
      </p>
    </>
  );
}

/** The application itself, behind a disclosure so the queue stays scannable. */
function Application({ request }: { request: ReviewableRequest }) {
  return (
    <details className="group mt-3 rounded-xl bg-slate-50 ring-1 ring-slate-200">
      {/*
        `list-none` plus `marker:content-none`, matching the landing page's FAQ:
        one hides the disclosure triangle in Chrome and Firefox, the other in
        Safari, and neither does both.
      */}
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-sm font-medium text-slate-700 transition marker:content-none hover:text-slate-900">
        <span>
          Full application
          <span className="ml-1.5 text-xs font-normal text-slate-400 group-open:hidden">
            — why they want it, and how to reach them
          </span>
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-slate-400 transition group-open:rotate-90"
          aria-hidden
        />
      </summary>

      <div className="border-t border-slate-200 px-3.5 py-3">
        {request.roleDetail && (
          <p className="text-sm leading-relaxed text-slate-700">
            <span className="font-medium">In their words: </span>
            {request.roleDetail}
          </p>
        )}

        <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Why they want coordinator access
        </p>
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
          {request.reason}
        </p>

        <p className="mt-3 text-xs text-slate-500">
          Contact: {request.applicantEmail}
        </p>
      </div>
    </details>
  );
}

export function CoordinatorRequestCard({
  request,
}: {
  request: ReviewableRequest;
}) {
  const [state, decide] = useActionState(
    decideCoordinatorRequestAction,
    IDLE,
  );
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const decided = request.status !== "PENDING";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <Header request={request} />
      <Application request={request} />

      {decided ? (
        <div className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
          <p>
            {request.status === "APPROVED" ? "Approved" : "Declined"}
            {request.reviewedByName ? ` by ${request.reviewedByName}` : ""}
            {request.reviewedAt ? (
              <>
                {" "}
                <time
                  suppressHydrationWarning
                  title={formatDateTime(request.reviewedAt)}
                >
                  {formatTimeAgo(request.reviewedAt)}
                </time>
              </>
            ) : null}
            .
          </p>
          {request.reviewNote && (
            <blockquote className="mt-2 border-l-2 border-slate-200 pl-3 leading-relaxed text-slate-700">
              {request.reviewNote}
            </blockquote>
          )}
        </div>
      ) : (
        <form action={decide} className="mt-4 border-t border-slate-100 pt-4">
          <input type="hidden" name="requestId" value={request.id} />

          {rejecting && (
            <div className="mb-3">
              <label
                htmlFor={`note-${request.id}`}
                className="block text-sm font-medium text-slate-700"
              >
                Why not? The applicant is sent this.
              </label>
              <textarea
                id={`note-${request.id}`}
                name="note"
                rows={3}
                required
                maxLength={1000}
                placeholder="e.g. The parish council has already nominated someone. Do come back if that changes."
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {rejecting ? (
              <>
                <DecideButton
                  decision="REJECT"
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  Confirm rejection
                </DecideButton>

                <button
                  type="button"
                  onClick={() => setRejecting(false)}
                  className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <DecideButton
                  decision="APPROVE"
                  className="bg-safe-600 text-white hover:bg-safe-700"
                >
                  Approve
                </DecideButton>

                <button
                  type="button"
                  onClick={() => setRejecting(true)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <X className="size-4" aria-hidden />
                  Reject
                </button>
              </>
            )}
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Approving promotes {request.applicantName} to coordinator of{" "}
            {request.villageName}: they will be able to read the original
            wording of every report filed there, and decide what the village
            sees. It is written to the audit trail with your name against it.
          </p>
        </form>
      )}
    </article>
  );
}
