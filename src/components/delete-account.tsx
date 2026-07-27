"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2, TriangleAlert } from "lucide-react";
import {
  deleteAccountAction,
  type SettingsState,
} from "@/app/(app)/settings/actions";

/**
 * Closing your own account, from the bottom of `/settings`.
 *
 * Its own component and its own `<form>` rather than a section of
 * `SettingsForm`, for two reasons. HTML forbids nested forms, and this posts a
 * different action to a different end — but more to the point, the save button
 * on that form is something a resident presses without reading, and this must
 * never be reachable by the same reflex.
 *
 * Three gates before anything happens: the section is collapsed behind a button,
 * the confirmation asks for the account's own email address typed out, and the
 * action re-checks that email server-side. Nothing here is the authorisation —
 * `deleteAccountAction` decides — this is about making the intent unambiguous.
 */

const IDLE: SettingsState = { ok: true, message: "" };

function ConfirmButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Delete my account
    </button>
  );
}

export function DeleteAccount({ email }: { email: string }) {
  const [state, remove] = useActionState(deleteAccountAction, IDLE);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    // Success redirects to /account-closed, so only failures land here.
    if (state.message && !state.ok) toast.error(state.message);
  }, [state]);

  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  return (
    <section className="mt-4 rounded-2xl border border-red-200 bg-white p-4 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <TriangleAlert className="size-4 text-red-600" aria-hidden />
        Delete my account
      </h2>

      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        Every report you have filed is deleted and comes off the village map, and
        your photos are deleted from our storage. You are signed out and cannot
        sign in again.
      </p>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Your village&rsquo;s audit trail keeps a record that the reports existed
        and what your coordinator decided about them. That record is what makes
        moderation accountable and we cannot remove it, but it does not carry
        your reports&rsquo; contents or your photos.
      </p>

      {open ? (
        <form action={remove} className="mt-4">
          <label
            htmlFor="confirmEmail"
            className="block text-sm font-medium text-slate-700"
          >
            Are you sure? This cannot be undone. Type{" "}
            <span className="font-mono text-slate-900">{email}</span> to confirm.
          </label>

          <input
            id="confirmEmail"
            name="confirmEmail"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
          />

          {state.fieldErrors?.confirmEmail && (
            <p className="mt-1.5 text-sm text-red-600">
              {state.fieldErrors.confirmEmail}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <ConfirmButton disabled={!matches} />

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
              className="inline-flex h-11 items-center rounded-lg px-3 text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex h-11 items-center rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50"
        >
          Delete my account
        </button>
      )}
    </section>
  );
}
