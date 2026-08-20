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
 * The council model's acceptance — three checkboxes and the button that opens
 * the village.
 *
 * The community model has its own form beside this one
 * (`community-compliance-form.tsx`) rather than a flag on this one. Every
 * sentence here is about accepting on somebody else's behalf, and there the
 * person ticking the box *is* the controller — one component with a mode
 * boolean would be two sets of copy interleaved, which is how the wrong one
 * ends up on screen.
 *
 * **There is no way to un-tick this.** Once a document is accepted the checkbox
 * renders as a recorded fact with the date and the person on it, not as a
 * control. A council that adopted an Appropriate Policy Document on a date did
 * adopt it on that date, and a screen that could rewrite that would make the
 * record worthless to the only audience it has. `acceptCompliance` enforces the
 * same thing server-side; this is the half that stops it looking like a setting.
 *
 * The button is disabled until all three boxes are ticked. The action checks
 * again and names the box that is missing, because a disabled button is a
 * courtesy and not a constraint.
 *
 * The third one carries a sentence the other two do not need: the processing
 * agreement is a **contract**, so ticking it is the council's half and the
 * document is not in force until Yakasista Ltd has signed the paper copy too.
 * Leaving that out would let a coordinator finish this screen believing an
 * agreement exists when one does not.
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
  dpaAccepted,
  /** False when the migration adding the columns has not been applied. */
  available,
  runningOnCommunityAgreement = null,
}: {
  /** The council the coordinator is accepting on behalf of. */
  parishCouncil: string;
  dpiaAccepted: AcceptedDocument | null;
  apdAccepted: AcceptedDocument | null;
  dpaAccepted: AcceptedDocument | null;
  available: boolean;
  /**
   * Set on a village that upgraded from the community model and has not
   * finished the council's three yet. Its reporting is open on the
   * coordinator's own agreement — see `isComplete` in `src/lib/compliance.ts` —
   * and without this the screen is three unticked boxes under a banner about
   * being unable to accept reports, which is the opposite of what is happening.
   */
  runningOnCommunityAgreement?: AcceptedDocument | null;
}) {
  const [state, accept] = useActionState(acceptComplianceAction, IDLE);
  const [dpia, setDpia] = useState(false);
  const [apd, setApd] = useState(false);
  const [dpa, setDpa] = useState(false);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const complete =
    dpiaAccepted !== null && apdAccepted !== null && dpaAccepted !== null;

  if (complete) {
    return (
      <section className="rounded-2xl border border-safe-200 bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CheckCircle2 className="size-4 text-safe-600" aria-hidden />
          Compliance complete
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Your village can accept incident reports. All three documents are due
          for review one year from the date they were accepted.
        </p>

        <div className="mt-4 space-y-3">
          <Recorded label="Data Protection Impact Assessment" accepted={dpiaAccepted} />
          <Recorded label="Appropriate Policy Document" accepted={apdAccepted} />
          <Recorded label="Data Processing Agreement" accepted={dpaAccepted} />
        </div>

        {/*
          The one thing this screen cannot record. The other two documents the
          council adopts on its own; this one is a contract and takes two
          signatures, and a coordinator who has just seen three green panels
          would otherwise reasonably conclude the agreement is in force.
        */}
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          The Data Processing Agreement is a contract and takes two signatures.
          What is recorded above is the council&rsquo;s acceptance of the terms —
          it is not in force until Yakasista Ltd has signed the document as well.
          Send the signed copy to info@yakasista.com and keep the countersigned
          version with the council&rsquo;s records.
        </p>
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
            An administrator needs to apply the migrations{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">
              20260728090000_village_compliance_gate
            </code>{" "}
            and{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">
              20260728150000_village_dpa_gate
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
        Read all three documents above first. Your name and the date are recorded
        against your village and written to the audit trail, and an acceptance
        cannot be undone from this screen.
      </p>

      {runningOnCommunityAgreement && (
        <div className="mt-3 rounded-xl bg-safe-50 p-3.5 text-sm leading-relaxed text-safe-900 ring-1 ring-inset ring-safe-600/20">
          <p className="font-medium">
            Your village is still open while the council works through these.
          </p>
          <p className="mt-1 text-safe-800">
            The Community Coordinator Agreement accepted on{" "}
            {runningOnCommunityAgreement.acceptedAt} is what authorises the
            processing until the council has adopted all three documents below.
            The coordinator who accepted it is the data controller until then.
          </p>
        </div>
      )}

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

        {dpaAccepted ? (
          <Recorded label="Data Processing Agreement" accepted={dpaAccepted} />
        ) : (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200">
            <input
              name="dpa"
              type="checkbox"
              checked={dpa}
              onChange={(event) => setDpa(event.target.checked)}
              className="mt-0.5 size-5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/20"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">
                I have read and accept the Data Processing Agreement
              </span>
              <span className="mt-0.5 block text-sm text-slate-600">
                {/*
                  The space after the council's name is `{" "}` rather than a
                  plain one: the JSX transform drops the leading space of a text
                  chunk that follows an expression at the end of a line, and the
                  built output read "…Parish Counciland Yakasista Ltd".
                */}
                UK GDPR Article 28(3). The contract between {parishCouncil}{" "}
                and Yakasista Ltd, who runs the service on the council&rsquo;s
                behalf. A controller may only use a processor under a written
                agreement.
              </span>
              <span className="mt-1.5 block text-sm text-slate-600">
                This one takes two signatures. Ticking it records the
                council&rsquo;s acceptance of the terms; the agreement is in
                force once Yakasista Ltd has signed the document too.
              </span>
            </span>
          </label>
        )}

        <AcceptButton
          ready={
            (dpia || dpiaAccepted !== null) &&
            (apd || apdAccepted !== null) &&
            (dpa || dpaAccepted !== null)
          }
        />
      </form>
    </section>
  );
}
