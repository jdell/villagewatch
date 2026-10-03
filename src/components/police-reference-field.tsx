"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2, Pencil, Plus } from "lucide-react";
import {
  setPoliceReferenceAction,
  type IncidentActionState,
} from "@/app/(app)/incidents/[id]/actions";
import { POLICE_REFERENCE_MAX_CHARS } from "@/lib/validations";

/**
 * The police reference row in an incident's "Report details", for a viewer who
 * may change it — the reporter, or a coordinator of the village. Everybody else
 * gets the read-only row the page has always rendered.
 *
 * Whether this renders is the page's decision from the session, and
 * `setPoliceReferenceAction` re-checks it; nothing here is an authorisation
 * check. Inline rather than a modal, the pattern the Resolve panel uses.
 */

const IDLE: IncidentActionState = { ok: true, message: "" };

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Save
    </button>
  );
}

export function PoliceReferenceField({
  incidentId,
  policeReference,
  reportedToPolice,
}: {
  incidentId: string;
  policeReference: string | null;
  reportedToPolice: boolean;
}) {
  const [editing, setEditing] = useState(false);
  // The panel closes from the action rather than from the effect below — the
  // page revalidates with the new value, so there is nothing left to edit.
  const [state, save] = useActionState(
    async (previous: IncidentActionState, formData: FormData) => {
      const result = await setPoliceReferenceAction(previous, formData);
      if (result.ok) setEditing(false);
      return result;
    },
    IDLE,
  );

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else if (!state.fieldErrors?.policeReference) {
      toast.error(state.message);
    }
  }, [state]);

  const error = state.fieldErrors?.policeReference;

  return (
    <div className="sm:col-span-2">
      <dt className="text-slate-500">Police reference</dt>

      {editing ? (
        <dd className="mt-1.5">
          <form action={save}>
            <input type="hidden" name="incidentId" value={incidentId} />
            <label htmlFor="police-reference" className="sr-only">
              Police reference
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="police-reference"
                name="policeReference"
                type="text"
                defaultValue={policeReference ?? ""}
                maxLength={POLICE_REFERENCE_MAX_CHARS}
                autoComplete="off"
                autoFocus
                placeholder="e.g. CC-20261003-0412"
                aria-invalid={Boolean(error)}
                aria-describedby={
                  error
                    ? "police-reference-error police-reference-hint"
                    : "police-reference-hint"
                }
                className="block h-9 w-full max-w-xs rounded-lg border border-slate-300 px-3 font-mono text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 aria-invalid:border-red-400"
              />
              <SaveButton />
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:text-slate-900"
              >
                Cancel
              </button>
            </div>
            {error && (
              <p
                id="police-reference-error"
                className="mt-1.5 text-sm text-red-600"
              >
                {error}
              </p>
            )}
            <p
              id="police-reference-hint"
              className="mt-1.5 text-xs leading-relaxed text-slate-500"
            >
              The reference the police gave you, as they wrote it. Your
              neighbours see it on this report, and it is printed in the
              village&rsquo;s report to the police. Leave it blank and save to
              remove it.
            </p>
          </form>
        </dd>
      ) : policeReference ? (
        <dd className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-slate-900">{policeReference}</span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition hover:text-brand-800"
          >
            <Pencil className="size-3.5" aria-hidden />
            Change
          </button>
        </dd>
      ) : (
        <dd className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-slate-900">
            {reportedToPolice ? "Reported, no reference yet" : "None"}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition hover:text-brand-800"
          >
            <Plus className="size-3.5" aria-hidden />
            Add crime reference
          </button>
        </dd>
      )}
    </div>
  );
}
