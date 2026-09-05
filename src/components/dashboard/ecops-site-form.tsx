"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import {
  saveEcopsSiteAction,
  type EcopsSiteState,
} from "@/app/(app)/dashboard/actions";
import { ECOPS_AREA_NOTE } from "@/lib/constants";

/**
 * Which Neighbourhood Alert site this village's police alerts come from.
 *
 * The fifth village setting, and the only one whose subject is a third party:
 * the other four decide how this village's own reports are handled, and this
 * one decides **whose bulletins appear on the dashboard under a police badge**.
 *
 * ## The copy carries three things the field cannot
 *
 * **Where the number comes from.** It is not a value anybody has memorised. It
 * is in the address bar of the force's own alert website, and a coordinator
 * who does not know that has no way to fill this in — so the hint says it
 * rather than leaving them to guess.
 *
 * **That it cannot be checked here.** The feed answers an unknown `SiteId` with
 * a well-formed, empty channel rather than an error, so a wrong number saves
 * successfully and produces silence. Saying so up front is the difference
 * between a coordinator who checks the panel in a couple of days and one who
 * assumes it is broken.
 *
 * **That a site is a force area.** `ECOPS_AREA_NOTE`, the same sentence the
 * panel carries, because somebody setting this up is exactly the person who
 * needs to know these are not reports about their village.
 *
 * ## Empty is a real value and the form says so
 *
 * Clearing the field turns the feature off, which is the default and wants to
 * stay one press away. There is no separate switch — a switch plus a number is
 * two controls for one decision, and the state where the switch is on and the
 * number is empty means nothing.
 */

const IDLE: EcopsSiteState = { ok: true, message: "" };

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Save alert feed
    </button>
  );
}

export function EcopsSiteForm({ value }: { value: number | null }) {
  const [state, save] = useActionState(saveEcopsSiteAction, IDLE);
  const [siteId, setSiteId] = useState(value === null ? "" : String(value));

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  // Derived from the prop rather than held as a second piece of state: the
  // action revalidates this route, so a successful save re-renders with the
  // stored value updated, which is the only thing that should decide whether
  // there is anything left to save. `ParishCouncilForm`'s reasoning.
  const dirty = siteId.trim() !== (value === null ? "" : String(value));
  const error = state.fieldErrors?.ecopsSiteId;

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <ShieldAlert className="size-4 text-slate-400" aria-hidden />
        Police alerts
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Show bulletins from your police force and local watch schemes on the
        dashboard. {ECOPS_AREA_NOTE}
      </p>

      <form action={save} className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="ecopsSiteId"
            className="block text-sm font-medium text-slate-700"
          >
            Neighbourhood Alert site number
          </label>
          <input
            id="ecopsSiteId"
            name="ecopsSiteId"
            type="text"
            inputMode="numeric"
            value={siteId}
            onChange={(event) => setSiteId(event.target.value)}
            maxLength={7}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "ecopsSiteId-error" : "ecopsSiteId-hint"}
            className="mt-1.5 block w-full max-w-40 rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 aria-invalid:border-red-400"
            placeholder="e.g. 2"
          />
          {error ? (
            <p id="ecopsSiteId-error" className="mt-1.5 text-sm text-red-600">
              {error}
            </p>
          ) : (
            <p id="ecopsSiteId-hint" className="mt-1.5 text-xs text-slate-500">
              Your force runs its own Neighbourhood Alert site — Warwickshire
              Connected, Hampshire Alert, and so on. The number is the{" "}
              <span className="font-medium text-slate-600">SiteId</span> in that
              site&rsquo;s own web address. Leave it empty to turn police alerts
              off.
            </p>
          )}
        </div>

        <p className="text-xs leading-relaxed text-slate-500">
          The number cannot be checked when you save it: an unrecognised site
          answers with an empty feed rather than an error. If nothing appears on
          the dashboard within a few days, the number is probably wrong.
        </p>

        <SaveButton dirty={dirty} />
      </form>
    </section>
  );
}
