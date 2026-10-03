"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { ChevronRight, CircleStop, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  deleteIncidentAction,
  markOverAction,
  type IncidentActionState,
} from "@/app/(app)/incidents/[id]/actions";

/**
 * What the reporter can do to their own report, as rows in one card: Edit,
 * "It's over now" and Delete.
 *
 * The props are what the server already decided this viewer may do; every
 * action re-checks it (`editIncidentAction`'s window, `markIncidentOver`,
 * `removeIncident`). Nothing here is an authorisation decision.
 *
 * Delete confirms inline rather than in a dialog — the pattern the old action
 * bar and the village card's suspend panel already use — and the sentence that
 * says what goes and what stays is the same one, because it is a promise
 * `/privacy` makes about erasure.
 */

const IDLE: IncidentActionState = { ok: true, message: "" };

const ROW =
  "flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] font-[550] text-[#0f172a] transition hover:bg-[#f8fafc] disabled:opacity-60";

type ReporterActionsProps = {
  incidentId: string;
  /** "Your report" for the reporter, "This report" for a coordinator. */
  heading: string;
  canEdit: boolean;
  canMarkOver: boolean;
  canDelete: boolean;
};

function OverButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={ROW}>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#fef2f2]">
        {pending ? (
          <Loader2 className="size-4 animate-spin text-[#b91c1c]" aria-hidden />
        ) : (
          <CircleStop className="size-4 text-[#b91c1c]" aria-hidden />
        )}
      </span>
      <span className="flex flex-1 flex-col">
        It&rsquo;s over now
        <span className="text-[12.5px] font-normal text-[#64748b]">
          Stops this showing as happening now. Nothing else changes.
        </span>
      </span>
    </button>
  );
}

function ConfirmDelete() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#dc2626] px-4 text-sm font-semibold text-white transition hover:bg-[#b91c1c] disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="size-4" aria-hidden />
      )}
      Yes, delete it
    </button>
  );
}

export function ReporterActions({
  incidentId,
  heading,
  canEdit,
  canMarkOver,
  canDelete,
}: ReporterActionsProps) {
  const [over, markOver] = useActionState(markOverAction, IDLE);
  const [removal, remove] = useActionState(deleteIncidentAction, IDLE);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!over.message) return;
    if (over.ok) toast.success(over.message);
    else toast.error(over.message);
  }, [over]);

  useEffect(() => {
    // Success redirects and toasts from the list; only failure lands here.
    if (removal.message && !removal.ok) toast.error(removal.message);
  }, [removal]);

  if (!canEdit && !canMarkOver && !canDelete) return null;

  return (
    <section aria-labelledby="reporter-actions-title">
      <h2
        id="reporter-actions-title"
        className="px-1 pb-2 text-[13px] font-semibold tracking-wide text-[#64748b] uppercase"
      >
        {heading}
      </h2>
      <div className="divide-y divide-[#f1f5f9] overflow-hidden rounded-[18px] bg-white shadow-[0_1px_2px_rgba(15,23,42,.06),0_2px_8px_rgba(15,23,42,.05)]">
        {canEdit && (
          <Link href={`/incidents/${incidentId}/edit`} className={ROW}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f1f5f9]">
              <Pencil className="size-4 text-[#334155]" aria-hidden />
            </span>
            <span className="flex flex-1 flex-col">
              Edit
              <span className="text-[12.5px] font-normal text-[#64748b]">
                Still with your coordinator, so you can change it.
              </span>
            </span>
            <ChevronRight className="size-[18px] text-[#94a3b8]" aria-hidden />
          </Link>
        )}

        {canMarkOver && (
          <form action={markOver}>
            <input type="hidden" name="incidentId" value={incidentId} />
            <OverButton />
          </form>
        )}

        {canDelete &&
          (confirming ? (
            <form action={remove} className="flex flex-col gap-3 p-4">
              <input type="hidden" name="incidentId" value={incidentId} />
              <p className="text-sm font-semibold text-[#0f172a]">
                Delete this report? This cannot be undone.
              </p>
              <p className="text-[13px] leading-relaxed text-[#475569]">
                What you wrote and any photos are deleted, and the report comes
                off the map. The record that a coordinator reviewed it stays in
                the village&rsquo;s audit trail.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <ConfirmDelete />
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-[#475569] transition hover:text-[#0f172a]"
                >
                  Keep it
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className={`${ROW} text-[#b91c1c]`}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#fef2f2]">
                <Trash2 className="size-4 text-[#b91c1c]" aria-hidden />
              </span>
              <span className="flex flex-1 flex-col text-[#b91c1c]">
                Delete report
                <span className="text-[12.5px] font-normal text-[#64748b]">
                  Your right to erasure — at any time, whatever its status.
                </span>
              </span>
            </button>
          ))}
      </div>
    </section>
  );
}
