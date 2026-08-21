"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import {
  acceptComplianceAction,
  type ComplianceState,
} from "@/app/(app)/dashboard/compliance/actions";
import { SUPPORT_EMAIL } from "@/lib/constants";
import type { AcceptedDocument } from "@/components/dashboard/compliance-form";

/**
 * The community model's acceptance — one checkbox, and the person ticking it is
 * the data controller.
 *
 * The council form beside this one is not reused with a prop, and the reason is
 * the copy rather than the layout. Every sentence there is about accepting on
 * somebody else's behalf: "on behalf of [council]", "the council's acceptance of
 * the terms", "not in force until Yakasista Ltd has signed". Here there is no
 * council, one signature forms the contract, and the duties land on the person
 * reading the screen. A single component with a mode flag would be two sets of
 * copy interleaved with a boolean, which is how the wrong one ends up in front
 * of somebody.
 *
 * **There is no way to un-tick it**, exactly as in the council form. Once
 * accepted it renders as a recorded fact with the date and the person on it. A
 * controller who took on these duties on a date did take them on on that date,
 * and a record that could be rewritten would be worth nothing to whoever
 * eventually asks to see it.
 */

const IDLE: ComplianceState = { ok: true, message: "" };

function AcceptButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || !ready}
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Accept and open the village
    </button>
  );
}

export function CommunityComplianceForm({
  /** The coordinator's own name — they are the controller here. */
  coordinator,
  village,
  accepted,
  /** False when the migration adding the columns has not been applied. */
  available,
}: {
  coordinator: string;
  village: string;
  accepted: AcceptedDocument | null;
  available: boolean;
}) {
  const [state, accept] = useActionState(acceptComplianceAction, IDLE);
  const [ticked, setTicked] = useState(false);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  if (accepted) {
    return (
      <section className="rounded-2xl border border-safe-200 bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CheckCircle2 className="size-4 text-safe-600" aria-hidden />
          Agreement accepted
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {village} can accept incident reports. The agreement is due for review
          one year from the date below.
        </p>

        <div className="mt-4 flex gap-3 rounded-xl bg-safe-50 p-3.5 ring-1 ring-inset ring-safe-600/20">
          <CheckCircle2 className="size-5 shrink-0 text-safe-600" aria-hidden />
          <div className="min-w-0 text-sm leading-relaxed text-safe-900">
            <p className="font-medium">Community Coordinator Agreement</p>
            <p className="mt-0.5 text-safe-800">
              {accepted.acceptedAt}
              {accepted.acceptedBy ? ` · ${accepted.acceptedBy}` : ""}
            </p>
          </div>
        </div>

        {/*
          The council form's closing note says the agreement is not in force
          until a second party signs. This one deliberately says the opposite,
          because it is: the terms are offered on a standing basis and accepting
          them forms the contract. A coordinator who has just seen a green panel
          is entitled to know which of those two situations they are in.
        */}
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          This agreement takes one signature and it is in force now — Yakasista
          Ltd offers these terms to every community village and does not
          countersign them one at a time. Keep a copy with your own records, and
          write to {SUPPORT_EMAIL} about anything in it.
        </p>
      </section>
    );
  }

  if (!available) {
    /*
      The columns do not exist, so nothing can be recorded. "Try again" would be
      a lie a coordinator could act on for a long time — this is not their
      problem and there is no button that fixes it. Same shape as the council
      form and the parish council field.
    */
    return (
      <section className="rounded-2xl border border-amber-200 bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShieldAlert className="size-4 text-amber-600" aria-hidden />
          Acceptance cannot be recorded yet
        </h2>
        <div className="mt-3 rounded-xl bg-amber-50 p-3.5 text-sm leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-600/20">
          <p>
            This deployment&rsquo;s database does not have the compliance
            columns yet, so there is nowhere to record your acceptance.
          </p>
          <p className="mt-2">
            An administrator needs to apply{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">
              20260820120000_village_community_mode
            </code>
            . Reporting is not blocked in the meantime — the gate cannot be
            enforced until the columns exist, and taking every village offline
            over a missing migration would be worse than the gap it leaves.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <ShieldAlert className="size-4 text-amber-600" aria-hidden />
        Accept as {village}&rsquo;s data controller
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Read the agreement above first. Your name and the date are recorded
        against the village and written to the audit trail, and an acceptance
        cannot be undone from this screen.
      </p>

      <form action={accept} className="mt-4 space-y-4">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200">
          <input
            name="community"
            type="checkbox"
            checked={ticked}
            onChange={(event) => setTicked(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/20"
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">
              I have read and accept the Community Coordinator Agreement
            </span>
            <span className="mt-0.5 block text-sm text-slate-600">
              {/*
                `{" "}` rather than a plain space after the expression: the JSX
                transform drops the leading space of a text chunk that follows an
                expression at the end of a line, which is how the council form
                once built as "…Parish Counciland Yakasista Ltd".
              */}
              I am {coordinator}, I am the data controller for community safety
              reports in {village}, and I understand the three duties set out
              above.
            </span>
            <span className="mt-1.5 block text-sm text-slate-600">
              This is one signature and not half of one. The terms are offered by
              Yakasista Ltd on the same basis to every community village, so
              accepting here is what forms the agreement — there is no paper copy
              waiting on a countersignature.
            </span>
          </span>
        </label>

        <AcceptButton ready={ticked} />
      </form>
    </section>
  );
}
