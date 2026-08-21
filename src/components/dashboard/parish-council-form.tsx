"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Landmark, Loader2, TriangleAlert } from "lucide-react";
import {
  saveParishCouncilAction,
  type ParishCouncilState,
} from "@/app/(app)/dashboard/actions";
import { DATA_CONTROLLER, type VillageMode } from "@/lib/constants";

/**
 * The body named as data controller for this village.
 *
 * One text field, and the least dangerous setting on this screen — it widens no
 * audience and removes no reviewer. What it does is decide the name printed at
 * the foot of every document `/reports` produces: the period report a
 * coordinator sends to a PCSO, and the single-incident summary that leaves
 * through the share sheet. A resident reading "data controller: X" there is
 * being told who to take a UK GDPR complaint to, so a wrong name sends it to a
 * body with no authority to answer.
 *
 * ## It is only called "the parish council" in a village that has one
 *
 * The column is `Village.parishCouncil` and it always will be, but the label on
 * it is a question of fact about the village reading it. In the community model
 * — the default, and most villages — there is no council: the coordinator is the
 * controller, and what belongs in this box is the group's own name. Labelling it
 * "Parish council" there asks a volunteer for something that does not exist,
 * which is how the field ends up empty and every report they send names
 * `DATA_CONTROLLER`, which is placeholder text. That was N15.
 *
 * One component with the mode passed in rather than two, unlike the two
 * compliance forms: this is one field and one sentence changing, not two sets of
 * copy about who is accepting what on whose behalf.
 *
 * Left empty, `reportController` falls back to `DATA_CONTROLLER` in
 * `constants.ts`, which is still placeholder text — which is why the empty state
 * says so rather than looking like a blank optional field. `/reports` renders
 * its own amber warning about the same thing.
 *
 * ## The unmigrated case
 *
 * `villages.parish_council` arrives with a migration that has never been
 * applied, so on the deployed database this column does not exist and a write
 * to it fails. The form is disabled outright in that state rather than
 * accepting text and failing on Save: a coordinator typing their council's name
 * into a box that then refuses it learns nothing about why, and would
 * reasonably try again. See `getVillageParishCouncil`.
 */

const IDLE: ParishCouncilState = { ok: true, message: "" };

/** Everything on this card that depends on whether the village has a council. */
const COPY = {
  council: {
    heading: "Parish council",
    description:
      "The council answerable for your village’s data. It is printed at the foot of every report you send to the police or the parish council.",
    label: "Parish council name",
    placeholder: "Bourn Parish Council",
    hint: "Its legal name, as the council itself writes it.",
    save: "Save council name",
  },
  community: {
    heading: "Data controller",
    description:
      "Who is answerable for your village’s data. It is printed at the foot of every report you send outside the village. This village runs the community model, so unless a council has taken it on, that is you.",
    label: "Name to print on reports",
    placeholder: "Bourn Neighbourhood Watch",
    hint: "Your group’s name, or your own — whoever a resident should come to about their data.",
    save: "Save name",
  },
} as const satisfies Record<VillageMode, Record<string, string>>;

function SaveButton({ dirty, label }: { dirty: boolean; label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {label}
    </button>
  );
}

type ParishCouncilFormProps = {
  value: string | null;
  /** False when the column is missing from this database. */
  available: boolean;
  /** Which model the village runs. Decides the labels, never the column. */
  mode: VillageMode;
};

export function ParishCouncilForm({
  value,
  available,
  mode,
}: ParishCouncilFormProps) {
  const copy = COPY[mode];

  const [state, save] = useActionState(saveParishCouncilAction, IDLE);
  const [name, setName] = useState(value ?? "");

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  // Derived from the `value` prop rather than a second piece of state. The
  // action revalidates `/dashboard`, so a successful save re-renders this with
  // the stored value updated — which is the only thing that should decide
  // whether there is anything left to save.
  const dirty = name.trim() !== (value ?? "");
  const error = state.fieldErrors?.parishCouncil;

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Landmark className="size-4 text-slate-400" aria-hidden />
        {copy.heading}
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">{copy.description}</p>

      {available ? (
        <form action={save} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="parishCouncil"
              className="block text-sm font-medium text-slate-700"
            >
              {copy.label}
            </label>
            <input
              id="parishCouncil"
              name="parishCouncil"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              autoComplete="organization"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "parishCouncil-error" : undefined}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 aria-invalid:border-red-400"
              placeholder={copy.placeholder}
            />
            {error ? (
              <p id="parishCouncil-error" className="mt-1.5 text-sm text-red-600">
                {error}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-slate-500">
                {copy.hint} Leave this empty and reports fall back to{" "}
                <span className="font-medium text-slate-600">
                  {DATA_CONTROLLER.name}
                </span>
                , which is placeholder text rather than a real body.
              </p>
            )}
          </div>

          <SaveButton dirty={dirty} label={copy.save} />
        </form>
      ) : (
        <div className="mt-4 flex gap-3 rounded-xl bg-amber-50 p-3.5 ring-1 ring-inset ring-amber-600/20">
          <TriangleAlert
            className="size-5 shrink-0 text-amber-600"
            aria-hidden
          />
          <div className="text-sm leading-relaxed text-amber-900">
            <p className="font-medium">This setting is not ready yet</p>
            <p className="mt-1">
              Your database is missing the column this is stored in, so saving
              would fail. Ask whoever administers this deployment to apply the
              pending migration — nothing else on this page is affected.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
