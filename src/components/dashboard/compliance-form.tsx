"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import {
  acceptComplianceAction,
  type ComplianceState,
} from "@/app/(app)/dashboard/compliance/actions";

/**
 * The acceptance itself — two checkboxes and the button that opens the village.
 *
 * **There is no way to un-tick this.** Once a document is accepted the checkbox
 * renders as a recorded fact with the date and the person on it, not as a
 * control. A council that adopted an Appropriate Policy Document on a date did
 * adopt it on that date, and a screen that could rewrite that would make the
 * record worthless to the only audience it has. `acceptCompliance` enforces the
 * same thing server-side; this is the half that stops it looking like a setting.
 *
 * The button is disabled until both boxes are ticked. The action checks again
 * and names the box that is missing, because a disabled button is a courtesy and
 * not a constraint.
 */

const IDLE: ComplianceState = { ok: true, message: "" };

export type AcceptedDocument = {
  acceptedAt: string;
  acceptedBy: string | null;
};

function AcceptButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || !ready}
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Accept and enable village
    </button>
  );
}

/** A document already accepted — a record, not a control. */
function Recorded({
  label,
  accepted,
}: {
  label: string;
  accepted: AcceptedDocument;
}) {
  return (
    <div className="flex gap-3 rounded-xl bg-safe-50 p-3.5 ring-1 ring-inset ring-safe-600/20">
      <CheckCircle2 className="size-5 shrink-0 text-safe-600" aria-hidden />
      <div className="min-w-0 text-sm leading-relaxed text-safe-900">
        <p className="font-medium">{label} accepted</p>
        <p className="mt-0.5 text-safe-800">
          {accepted.acceptedAt}
          {accepted.acceptedBy ? ` · ${accepted.acceptedBy}` : ""}
        </p>
      </div>
    </div>
  );
}

export function ComplianceForm({
  parishCouncil,
  dpiaAccepted,
  apdAccepted,
  /** False when the migration adding the columns has not been applied. */
  available,
}: {
  /** The council the coordinator is accepting on behalf of. */
  parishCouncil: string;
  dpiaAccepted: AcceptedDocument | null;
  apdAccepted: AcceptedDocument | null;
  available: boolean;
}) {
  const [state, accept] = useActionState(acceptComplianceAction, IDLE);
  const [dpia, setDpia] = useState(false);
  const [apd, setApd] = useState(false);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const complete = dpiaAccepted !== null && apdAccepted !== null;

  if (complete) {
    return (
      <section className="rounded-2xl border border-safe-200 bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CheckCircle2 className="size-4 text-safe-600" aria-hidden />
          Compliance complete
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Your village can accept incident reports. Both documents are due for
          review one year from the date they were accepted.
        </p>

        <div className="mt-4 space-y-3">
          <Recorded label="Data Protection Impact Assessment" accepted={dpiaAccepted} />
          <Recorded label="Appropriate Policy Document" accepted={apdAccepted} />
        </div>
      </section>
    );
  }

  if (!available) {
    /*
      The columns do not exist, so nothing can be recorded. Saying "try again"
      here would be a lie a coordinator could act on for a long time — this is
      not their problem and there is no button that fixes it. Same reasoning as
      the parish council field, and the same shape.
    */
    return (
      <section className="rounded-2xl border border-amber-200 bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShieldAlert className="size-4 text-amber-600" aria-hidden />
          Acceptance cannot be recorded yet
        </h2>
        <div className="mt-3 rounded-xl bg-amber-50 p-3.5 text-sm leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-600/20">
          <p>
            This deployment&rsquo;s database does not have the compliance columns
            yet, so there is nowhere to record your acceptance.
          </p>
          <p className="mt-2">
            An administrator needs to apply the migration{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">
              20260728090000_village_compliance_gate
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
        Accept on behalf of {parishCouncil}
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Read both documents above first. Your name and the date are recorded
        against your village and written to the audit trail, and an acceptance
        cannot be undone from this screen.
      </p>

      <form action={accept} className="mt-4 space-y-4">
        {dpiaAccepted ? (
          <Recorded
            label="Data Protection Impact Assessment"
            accepted={dpiaAccepted}
          />
        ) : (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200">
            <input
              name="dpia"
              type="checkbox"
              checked={dpia}
              onChange={(event) => setDpia(event.target.checked)}
              className="mt-0.5 size-5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/20"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">
                I have read and accept the DPIA on behalf of {parishCouncil}
              </span>
              <span className="mt-0.5 block text-sm text-slate-600">
                UK GDPR Article 35. The assessment of what this processing risks
                and what reduces it.
              </span>
            </span>
          </label>
        )}

        {apdAccepted ? (
          <Recorded label="Appropriate Policy Document" accepted={apdAccepted} />
        ) : (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200">
            <input
              name="apd"
              type="checkbox"
              checked={apd}
              onChange={(event) => setApd(event.target.checked)}
              className="mt-0.5 size-5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/20"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">
                I have read and accept the Appropriate Policy Document
              </span>
              <span className="mt-0.5 block text-sm text-slate-600">
                Data Protection Act 2018, Schedule 1, paragraph 5. Without it
                there is no lawful authorisation to process the criminal offence
                data these reports contain.
              </span>
            </span>
          </label>
        )}

        <AcceptButton
          ready={(dpia || dpiaAccepted !== null) && (apd || apdAccepted !== null)}
        />
      </form>
    </section>
  );
}
