"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";
import {
  setVillageModeAction,
  type ModeState,
} from "@/app/(app)/dashboard/compliance/actions";
import { VILLAGE_MODE_META } from "@/lib/constants";

/**
 * Handing the village to a parish council.
 *
 * One direction only, and the button says so rather than the server being the
 * first place anybody finds out. A council that has resolved to take a village
 * on becomes the data controller; a screen that could hand it back would be
 * deciding, on a coordinator's click, that a council is no longer answerable for
 * reports it has been answerable for. `setVillageMode` refuses the other
 * direction too — this is the half that stops it looking possible.
 *
 * **It does not close the village**, and the copy leads with that. The council
 * now owes three documents, which realistically means waiting for a meeting;
 * until it adopts them the coordinator is still the controller and their own
 * agreement is still what authorises the processing. A control that took a
 * running village offline for the duration of somebody else's paperwork is a
 * control nobody would press, and the villages that most need a council behind
 * them are the ones that would never get one.
 *
 * The confirmation checkbox is not ceremony. Every other setting on the
 * dashboard can be set back afterwards; this one cannot, and it changes who
 * answers a subject access request.
 */

const IDLE: ModeState = { ok: true, message: "" };

function UpgradeButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || !ready}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Building2 className="size-4" aria-hidden />
      )}
      Move to the parish council model
    </button>
  );
}

export function VillageModeForm({ village }: { village: string }) {
  const [state, upgrade] = useActionState(setVillageModeAction, IDLE);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Building2 className="size-4 text-slate-400" aria-hidden />
        Has a parish council taken this village on?
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        Most villages never need this. If a parish or town council has resolved
        to run {village}, it becomes the data controller instead of you, and it
        adopts the three documents a council is separately obliged to hold:{" "}
        {VILLAGE_MODE_META.council.documents.toLowerCase()}.
      </p>

      <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-slate-600">
        <li>
          <strong className="font-medium text-slate-900">
            Your village stays open.
          </strong>{" "}
          Reporting carries on under the agreement you accepted until the council
          has adopted its own — you are still the controller until it does, and
          nobody has to wait for a parish meeting to file a report.
        </li>
        <li>
          <strong className="font-medium text-slate-900">
            Your acceptance is not deleted.
          </strong>{" "}
          You were the controller for that period, and the record of it is what
          shows the handover was orderly.
        </li>
        <li>
          <strong className="font-medium text-slate-900">
            It cannot be undone here.
          </strong>{" "}
          If a council later steps back, contact us rather than switching it
          back — the dates it adopted its documents on have to mean something.
        </li>
      </ul>

      <form action={upgrade} className="mt-4 space-y-3">
        <input type="hidden" name="mode" value="council" />
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/20"
          />
          <span className="text-sm text-slate-700">
            A parish or town council has agreed to take on {village}, and it will
            adopt the three documents.
          </span>
        </label>

        <UpgradeButton ready={confirmed} />
      </form>
    </section>
  );
}
