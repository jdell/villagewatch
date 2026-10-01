"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { CalendarDays, Loader2 } from "lucide-react";
import {
  saveEventsEnabledAction,
  type EventsSettingState,
} from "@/app/(app)/dashboard/actions";

/**
 * Whether residents can post community events.
 *
 * Auto-approve's form, without its warning: this switch publishes nothing a
 * resident wrote about somebody else. What it does say, before the save, is the
 * one thing a coordinator should know when turning it on — every event is
 * visible to the whole village with the poster's name on it, and none waits for
 * review. A coordinator can delete any of them.
 */

const IDLE: EventsSettingState = { ok: true, message: "" };

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Save events setting
    </button>
  );
}

export function EventsForm({
  value,
  available,
}: {
  value: boolean;
  /** False when the column does not exist yet — the migration has not run. */
  available: boolean;
}) {
  const [state, save] = useActionState(saveEventsEnabledAction, IDLE);
  const [enabled, setEnabled] = useState(value);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  // Derived from the stored value, as in `AutoApproveForm` — the action
  // revalidates, and the stored value is what decides whether anything is left
  // to save.
  const dirty = enabled !== value;

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <CalendarDays className="size-4 text-slate-400" aria-hidden />
        Community events
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Litter picks, meetings, police drop-ins — things on in the village that
        are not problems.
      </p>

      {!available ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-3.5 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
          Not ready on this deployment yet. The database needs updating before
          events can be turned on — whoever runs VillageWatch for you can do
          that.
        </p>
      ) : (
        <form action={save} className="mt-4 space-y-4">
          <div className="rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                name="eventsEnabled"
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="mt-0.5 size-5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/20"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">
                  Let residents post events
                </span>
                <span className="mt-0.5 block text-sm text-slate-600">
                  Adds an Events page and shows upcoming events on the map.
                </span>
              </span>
            </label>
          </div>

          {enabled && !value && (
            <p
              role="status"
              className="rounded-xl bg-brand-50 p-3.5 text-sm leading-relaxed text-brand-900 ring-1 ring-inset ring-brand-200"
            >
              Events go up the moment they are posted, with the poster&rsquo;s
              name on them, and do not wait for review. You can delete any event
              from its page.
            </p>
          )}

          {value && !enabled && (
            <p className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
              Turning events off hides them and stops new ones. Nothing is
              deleted, and they come back if you turn events on again.
            </p>
          )}

          <SaveButton dirty={dirty} />
        </form>
      )}
    </section>
  );
}
