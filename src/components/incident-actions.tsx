"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Archive, Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import type { IncidentStatus } from "@/generated/prisma/enums";
import {
  deleteIncidentAction,
  moderateFromDetailAction,
  type IncidentActionState,
} from "@/app/(app)/incidents/[id]/actions";

/**
 * The action bar on an incident's page.
 *
 * The props say what the *server* already decided this viewer may do — the page
 * works out `canEdit` / `canModerate` from the session, and every action
 * re-checks it anyway. Nothing here is an authorisation decision; it decides
 * which buttons exist, which is a different question.
 */

const IDLE: IncidentActionState = { ok: true, message: "" };

type IncidentActionsProps = {
  incidentId: string;
  status: IncidentStatus;
  /** Viewer is the reporter and the report has not been reviewed. */
  canEdit: boolean;
  /** Viewer is a coordinator, moderator or admin in this village. */
  canModerate: boolean;
};

function ActionButton({
  action,
  icon: Icon,
  label,
  className,
}: {
  action: string;
  icon: typeof Check;
  label: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="action"
      value={action}
      disabled={pending}
      className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-60 ${className}`}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Icon className="size-4" aria-hidden />
      )}
      {label}
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="size-4" aria-hidden />
      )}
      Withdraw report
    </button>
  );
}

export function IncidentActions({
  incidentId,
  status,
  canEdit,
  canModerate,
}: IncidentActionsProps) {
  const [moderation, moderate] = useActionState(moderateFromDetailAction, IDLE);
  const [removal, remove] = useActionState(deleteIncidentAction, IDLE);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!moderation.message) return;
    if (moderation.ok) toast.success(moderation.message);
    else toast.error(moderation.message);
  }, [moderation]);

  useEffect(() => {
    // A successful withdrawal redirects, so only the failure path lands here.
    if (removal.message && !removal.ok) toast.error(removal.message);
  }, [removal]);

  const inQueue = status === "DRAFT" || status === "PENDING_REVIEW";
  const archivable = status === "PUBLISHED" || status === "RESOLVED";

  if (!canEdit && !canModerate) return null;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-slate-900">Actions</h2>

      {canEdit && inQueue && (
        <div className="mt-3">
          <p className="text-xs text-slate-500">
            Your report is still with your coordinator, so you can still change
            it or take it back.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={`/incidents/${incidentId}/edit`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Pencil className="size-4" aria-hidden />
              Edit
            </Link>

            {confirming ? (
              <form action={remove} className="flex items-center gap-2">
                <input type="hidden" name="incidentId" value={incidentId} />
                <span className="text-sm text-slate-600">Delete for good?</span>
                <DeleteButton />
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-slate-500 transition hover:text-slate-700"
                >
                  Keep it
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Trash2 className="size-4" aria-hidden />
                Withdraw
              </button>
            )}
          </div>
        </div>
      )}

      {canModerate && (inQueue || archivable) && (
        <form
          action={moderate}
          className={`${canEdit && inQueue ? "mt-5 border-t border-slate-100 pt-5" : "mt-3"}`}
        >
          <input type="hidden" name="incidentId" value={incidentId} />

          <p className="text-xs text-slate-500">
            {inQueue
              ? "Approving publishes this to the village map and alerts the neighbours who asked to hear about it."
              : "Archiving takes this off the map. Nothing is deleted."}
          </p>

          {inQueue && (
            <div className="mt-3">
              <label
                htmlFor="moderation-note"
                className="block text-sm font-medium text-slate-700"
              >
                Note for the reporter{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                id="moderation-note"
                name="note"
                rows={2}
                maxLength={500}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {inQueue && (
              <>
                <ActionButton
                  action="PUBLISH"
                  icon={Check}
                  label="Approve & alert"
                  className="bg-safe-600 text-white hover:bg-safe-700"
                />
                <ActionButton
                  action="REJECT"
                  icon={X}
                  label="Reject"
                  className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                />
              </>
            )}

            {archivable && (
              <ActionButton
                action="ARCHIVE"
                icon={Archive}
                label="Archive"
                className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              />
            )}
          </div>
        </form>
      )}
    </section>
  );
}
