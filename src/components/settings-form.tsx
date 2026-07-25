"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { ExternalLink, Loader2, MessageCircle } from "lucide-react";
import type { Severity } from "@/generated/prisma/enums";
import {
  NOTIFICATION_RADII,
  SEVERITIES,
  WHATSAPP_CHANNELS_HELP_URL,
} from "@/lib/constants";
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

/**
 * The village's WhatsApp Channel, if it runs one.
 *
 * Not a form value — there is nothing to save. Following a channel happens in
 * WhatsApp, not here, so this is a link and a warning and no state at all.
 */
export type SettingsChannel = {
  /** Public invite link. Already checked to be `https:` server-side. */
  url: string | null;
  /** Whether to show the "set one up" prompt — coordinators only. */
  canSetUp: boolean;
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

/**
 * The village's WhatsApp Channel, and what it costs to follow one.
 *
 * The warning is not boilerplate. Everything else on this screen governs a
 * surface only signed-in residents of one village can see; a channel is public
 * to anyone with the link, and a resident deciding whether to follow it should
 * know that before they tap, not after they have forwarded it to a group chat.
 */
function ChannelSection({ channel }: { channel: SettingsChannel }) {
  if (!channel.url && !channel.canSetUp) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <MessageCircle className="size-4 text-brand-600" aria-hidden />
        WhatsApp Channel
      </h2>

      {channel.url ? (
        <>
          <p className="mt-1 text-sm text-slate-500">
            Your village posts its more serious alerts to a WhatsApp Channel, so
            you can follow along without opening the app. It is a one-way feed —
            following it does not share your phone number with anyone, and you
            cannot post to it.
          </p>

          <a
            href={channel.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Follow on WhatsApp
            <ExternalLink className="size-4" aria-hidden />
          </a>

          <p className="mt-3 text-xs text-slate-500">
            The channel is public: anyone with the link can read it, including
            people outside the village. Posts carry a headline, an area and a
            link — never your name, your wording, or the exact spot.
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-slate-500">
          Your village does not run one yet. A channel gives residents who are
          not in the app a way to see the serious alerts.{" "}
          <a
            href={WHATSAPP_CHANNELS_HELP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
          >
            How channels work
          </a>
          .
        </p>
      )}
    </section>
  );
}

export function SettingsForm({
  values,
  channel,
}: {
  values: SettingsFormValues;
  channel: SettingsChannel;
}) {
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

      <ChannelSection channel={channel} />

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
