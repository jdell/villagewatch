"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { LayoutTemplate, Loader2 } from "lucide-react";
import {
  saveVillageUiVersionAction,
  type UiVersionState,
} from "@/app/(app)/dashboard/actions";
import {
  UI_VERSIONS,
  UI_VERSION_META,
  parseUiVersion,
  type UiVersion,
} from "@/lib/ui-version";

/**
 * Which interface the village gets — Classic, or Modern (beta).
 *
 * A switch for trying the redesign one village at a time. The copy says
 * plainly that the modern interface is not built yet: a coordinator choosing
 * "Modern" today changes nothing on screen, and a form that implied otherwise
 * would send them looking for a difference that is not there. Residents can
 * still flip their own view for a session from the sidebar.
 *
 * `available` is false on a database behind on the migration, and the form
 * says so rather than offering a Save that can only fail — the
 * `ParishCouncilForm` pattern.
 */

const IDLE: UiVersionState = { ok: true, message: "" };

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Save interface
    </button>
  );
}

export function UiVersionForm({
  value,
  available,
}: {
  value: UiVersion;
  available: boolean;
}) {
  const [state, save] = useActionState(saveVillageUiVersionAction, IDLE);
  const [selected, setSelected] = useState<UiVersion>(value);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const error = state.fieldErrors?.uiVersion;

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <LayoutTemplate className="size-4 text-slate-400" aria-hidden />
        Interface
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Which version of the app your residents see. Each resident can still
        switch their own view for a browser session from the sidebar.
      </p>

      {available ? (
        <form action={save} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="uiVersion"
              className="block text-sm font-medium text-slate-700"
            >
              Version
            </label>
            <select
              id="uiVersion"
              name="uiVersion"
              value={selected}
              onChange={(event) =>
                setSelected(parseUiVersion(event.target.value) ?? value)
              }
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "uiVersion-error" : "uiVersion-hint"}
              className="mt-1.5 block w-full max-w-60 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 aria-invalid:border-red-400"
            >
              {UI_VERSIONS.map((version) => (
                <option key={version} value={version}>
                  {UI_VERSION_META[version].label}
                </option>
              ))}
            </select>
            {error ? (
              <p id="uiVersion-error" className="mt-1.5 text-sm text-red-600">
                {error}
              </p>
            ) : (
              <p id="uiVersion-hint" className="mt-1.5 text-xs text-slate-500">
                {UI_VERSION_META[selected].description}
              </p>
            )}
          </div>

          <SaveButton dirty={selected !== value} />
        </form>
      ) : (
        <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-500 ring-1 ring-inset ring-slate-200">
          This setting is not ready yet: the village&rsquo;s database has not
          been updated for it. Ask an administrator to apply the pending
          migration.
        </p>
      )}
    </section>
  );
}
