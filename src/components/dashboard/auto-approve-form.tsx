"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  saveAutoApproveAction,
  type AutoApproveState,
} from "@/app/(app)/dashboard/actions";

/**
 * Whether the village moderates at all.
 *
 * One checkbox, and the most consequential one on the dashboard. Every other
 * setting here decides what happens to a report *after* somebody has read it;
 * this decides whether anybody reads it. With it on there is no human between a
 * resident pressing publish and the village map — and, if the WhatsApp Channel
 * is also on, between a resident and the open internet.
 *
 * The warning appears only when the box is ticked and before the save, which is
 * the one moment it can still change a mind. A permanent red panel under a
 * setting that is off is furniture; the same sentence surfacing the instant
 * somebody reaches for the switch is a question.
 *
 * Separate form and separate action from `WhatsAppChannelForm`, deliberately.
 * They are two decisions with two audit rows, and a coordinator fixing a typo in
 * an invite link should not have to re-confirm that their village does not
 * moderate.
 */

const IDLE: AutoApproveState = { ok: true, message: "" };

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Save review setting
    </button>
  );
}

export function AutoApproveForm({ value }: { value: boolean }) {
  const [state, save] = useActionState(saveAutoApproveAction, IDLE);
  const [enabled, setEnabled] = useState(value);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  // Both derived from the `value` prop rather than from a second piece of
  // state. The action revalidates `/dashboard`, so a successful save
  // re-renders this component with the stored value updated — which is the
  // only thing that should decide whether there is anything left to save, and
  // whether ticking the box is still a change worth warning about.
  const dirty = enabled !== value;
  const turningOn = enabled && !value;

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <ShieldCheck className="size-4 text-slate-400" aria-hidden />
        Coordinator review
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Whether reports filed in your village wait for one of you before anyone
        else can see them.
      </p>

      <form action={save} className="mt-4 space-y-4">
        <div className="rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              name="autoApprove"
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="mt-0.5 size-5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/20"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">
                Auto-approve incidents
              </span>
              <span className="mt-0.5 block text-sm text-slate-600">
                When enabled, incidents go live immediately without coordinator
                review. When disabled, incidents require coordinator approval
                before they are visible to the community.
              </span>
            </span>
          </label>
        </div>

        {turningOn && (
          <div
            role="status"
            className="flex gap-3 rounded-xl bg-red-50 p-3.5 ring-1 ring-inset ring-red-600/20"
          >
            <TriangleAlert
              className="size-5 shrink-0 text-red-600"
              aria-hidden
            />
            <div className="text-sm leading-relaxed text-red-900">
              <p className="font-medium">
                Enabling auto-approve means incidents will be visible
                immediately.
              </p>
              <p className="mt-1">
                Consider this carefully — inappropriate reports will be public
                until a coordinator removes them.
              </p>
              {/*
                Not in the brief, and the one thing a coordinator most needs to
                know before ticking this. The anonymisation pass is best-effort:
                when it does not run, `description` is the reporter's own
                wording, and the queue is what has always caught that.
              */}
              <p className="mt-1">
                A report filed when the AI rewrite is unavailable is published in
                the reporter&rsquo;s own words, names and registrations included.
              </p>
            </div>
          </div>
        )}

        {value && !enabled && (
          <p className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
            Reports already filed are not affected either way. Anything still in
            the queue stays there until a coordinator reviews it.
          </p>
        )}

        <SaveButton dirty={dirty} />
      </form>
    </section>
  );
}
