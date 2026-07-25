"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Severity } from "@/generated/prisma/enums";
import { NOTIFICATION_RADII, SEVERITIES } from "@/lib/constants";
import { saveSettingsAction, type SettingsState } from "@/app/(app)/settings/actions";

/**
 * Profile and notification preferences.
 *
 * One form, one server action, one save. Splitting profile from notifications
 * would mean two buttons on a screen with five fields, and someone changing
 * their name and their radius in the same visit would have to press both.
 *
 * The email field is rendered from the auth user and is `readOnly` — changing
 * it is a Supabase Auth flow with a confirmation email, not a column update.
 */

export type SettingsFormValues = {
  fullName: string;
  email: string;
  addressLine: string;
  notifyPush: boolean;
  notifyMinSeverity: Severity;
  notifyRadiusMeters: number | null;
};

const IDLE: SettingsState = { ok: true, message: "" };

const FIELD_CLASS =
  "mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Save settings
    </button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-sm text-red-600">{message}</p>;
}

export function SettingsForm({ values }: { values: SettingsFormValues }) {
  const [state, save] = useActionState(saveSettingsAction, IDLE);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const errors = state.fieldErrors ?? {};

  return (
    <form action={save} className="mt-6 space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Profile</h2>
        <p className="mt-1 text-sm text-slate-500">
          Your name is shown to your coordinator on reports you file, unless you
          file them anonymously.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="fullName"
              className="block text-sm font-medium text-slate-700"
            >
              Display name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              maxLength={80}
              defaultValue={values.fullName}
              autoComplete="name"
              className={FIELD_CLASS}
            />
            <FieldError message={errors.fullName} />
          </div>

          <div>
            <label
              htmlFor="addressLine"
              className="block text-sm font-medium text-slate-700"
            >
              Street or area
            </label>
            <input
              id="addressLine"
              name="addressLine"
              type="text"
              maxLength={160}
              defaultValue={values.addressLine}
              placeholder="e.g. the top end of Oak Lane"
              className={FIELD_CLASS}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Only your coordinator sees this, and only to verify you live in the
              village. It is never shown to other residents or attached to a
              report.
            </p>
            <FieldError message={errors.addressLine} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Notifications</h2>
        <p className="mt-1 text-sm text-slate-500">
          Alerts are sent when a coordinator publishes a report — never when one
          is filed.
        </p>

        <div className="mt-4 space-y-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              name="notifyPush"
              type="checkbox"
              defaultChecked={values.notifyPush}
              className="mt-0.5 size-5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/20"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">
                Push notifications
              </span>
              <span className="mt-0.5 block text-sm text-slate-500">
                A notification on this device when something is published nearby.
              </span>
            </span>
          </label>

          <div>
            <label
              htmlFor="notifyMinSeverity"
              className="block text-sm font-medium text-slate-700"
            >
              Tell me about
            </label>
            <select
              id="notifyMinSeverity"
              name="notifyMinSeverity"
              defaultValue={values.notifyMinSeverity}
              className={FIELD_CLASS}
            >
              {SEVERITIES.map((severity) => (
                <option key={severity.value} value={severity.value}>
                  {severity.label} and above — {severity.description}
                </option>
              ))}
            </select>
            <FieldError message={errors.notifyMinSeverity} />
          </div>

          <div>
            <label
              htmlFor="notifyRadiusMeters"
              className="block text-sm font-medium text-slate-700"
            >
              How close
            </label>
            <select
              id="notifyRadiusMeters"
              name="notifyRadiusMeters"
              defaultValue={values.notifyRadiusMeters?.toString() ?? ""}
              className={FIELD_CLASS}
            >
              {NOTIFICATION_RADII.map((radius) => (
                <option key={radius.label} value={radius.value?.toString() ?? ""}>
                  {radius.label} — {radius.description}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              Measured from the approximate home location your coordinator holds.
              Without one we send you everything in the village, because there is
              nothing to measure from.
            </p>
            <FieldError message={errors.notifyRadiusMeters} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Account</h2>

        <div className="mt-4">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-700"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={values.email}
            readOnly
            className={`${FIELD_CLASS} cursor-not-allowed bg-slate-50 text-slate-500`}
          />
          <p className="mt-1.5 text-xs text-slate-500">
            This is your sign-in address. Ask your coordinator if it needs to
            change.
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <SaveButton />

        {/*
          A plain POST rather than a button inside this form: the logout route
          clears the Supabase session cookies and redirects, which a nested
          <form> is not allowed to do and a server action should not.
        */}
        <span className="text-sm text-slate-400">or</span>

        <button
          type="submit"
          form="sign-out"
          className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>
    </form>
  );
}
