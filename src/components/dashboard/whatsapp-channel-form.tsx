"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, MessageCircle } from "lucide-react";
import type { Severity } from "@/generated/prisma/enums";
import { SEVERITIES, WHATSAPP_CHANNELS_HELP_URL } from "@/lib/constants";
import { extractChannelCode } from "@/lib/validations";
import {
  saveChannelSettingsAction,
  type ChannelSettingsState,
} from "@/app/(app)/dashboard/actions";

/**
 * Where a coordinator points their village's WhatsApp Channel.
 *
 * **One field does the work of two.** The channel code a relay posts to is the
 * last segment of the invite link, so this screen asks only for the link and
 * derives the code from it — see `extractChannelCode`. The old separate "Channel
 * id" box asked a coordinator to find the same string twice, described it as a
 * credential, and let the two disagree: alerts could go to one channel while
 * residents followed another, with nothing on screen to show it.
 *
 * These values are per-village columns on `Village`, not environment variables —
 * one deployment serves many villages and each runs its own channel. The only
 * platform-level part is the relay account the server posts through, which is
 * not on this screen and never will be.
 *
 * On the dashboard rather than in `/settings` because it is a village setting,
 * not a personal one: `/settings` is where a resident decides what *they* hear,
 * and every field on it writes to their own `User` row.
 *
 * The warning is the point of the layout. Every other surface in the app is
 * behind a sign-in and scoped to one village; this switch is the one that hands
 * an alert to anyone holding a link, and a coordinator flipping it should read
 * that sentence before they find out from a neighbouring parish.
 */

export type ChannelSettingsValues = {
  /**
   * The stored value, unfiltered — a bad link has to be visible in the field to
   * be correctable. It is rendered into an input here and never into an `href`;
   * the follow link on `/settings` goes through `safeChannelUrl` first.
   */
  url: string | null;
  /**
   * No `id`. The stored `whatsappChannelId` is not a field on this form and not
   * a prop: it is read out of the link above by `extractChannelCode`, shown back
   * as a preview, and written by the server on save.
   */
  enabled: boolean;
  minSeverity: Severity;
};

const IDLE: ChannelSettingsState = { ok: true, message: "" };

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
      Save channel settings
    </button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-sm text-red-600">{message}</p>;
}

export function WhatsAppChannelForm({
  values,
  relayConfigured,
}: {
  values: ChannelSettingsValues;
  /**
   * Whether the deployment has a relay wired up. Computed on the server —
   * `WHATSAPP_CHANNEL_API_URL` has no `NEXT_PUBLIC_` prefix, and the endpoint
   * and its token are not a coordinator's business either way.
   */
  relayConfigured: boolean;
}) {
  const [state, save] = useActionState(saveChannelSettingsAction, IDLE);
  const [enabled, setEnabled] = useState(values.enabled);
  const [url, setUrl] = useState(values.url ?? "");
  const urlId = useId();

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const errors = state.fieldErrors ?? {};
  // The same function the server derives the stored column with, so the preview
  // cannot promise a code the save would not produce.
  const trimmedUrl = url.trim();
  const code = trimmedUrl === "" ? null : extractChannelCode(trimmedUrl);

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <MessageCircle className="size-4 text-slate-400" aria-hidden />
        WhatsApp Channel
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Your village&rsquo;s own channel. Residents who are not in the app can
        follow it to see the serious alerts.{" "}
        <a
          href={WHATSAPP_CHANNELS_HELP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
        >
          How channels work
          <ExternalLink className="ml-0.5 inline size-3" aria-hidden />
        </a>
      </p>

      <form action={save} className="mt-4 space-y-4">
        <div>
          <label
            htmlFor={urlId}
            className="block text-sm font-medium text-slate-700"
          >
            Paste your WhatsApp Channel invite link
          </label>
          <input
            id={urlId}
            name="whatsappChannelUrl"
            type="url"
            inputMode="url"
            maxLength={500}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://whatsapp.com/channel/0029Va…"
            autoComplete="off"
            spellCheck={false}
            className={FIELD_CLASS}
          />

          {/*
            The one piece of feedback this screen owes a coordinator. The code
            inside the link is what a relay posts to, and it is now derived
            rather than typed — so it has to be visible, or enabling posting is
            a switch with nothing legible behind it.
          */}
          {code && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
              <Check className="size-3.5 shrink-0" aria-hidden />
              <span>
                Channel code:{" "}
                <code className="rounded bg-emerald-50 px-1 py-0.5 font-medium">
                  {code}
                </code>{" "}
                extracted
              </span>
            </p>
          )}
          {trimmedUrl !== "" && !code && (
            <p className="mt-2 text-xs text-amber-700">
              No channel code in that link — it should look like{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5">
                https://whatsapp.com/channel/0029Va…
              </code>
            </p>
          )}

          <p className="mt-1.5 text-xs text-slate-500">
            The public link WhatsApp gives you under &ldquo;Copy link&rdquo;.
            Every resident sees a &ldquo;Follow on WhatsApp&rdquo; button on
            their settings page once this is set, and the channel code alerts are
            posted to is read out of the link — there is nothing else to fill in.
          </p>
          <FieldError message={errors.whatsappChannelUrl} />
        </div>

        <div className="rounded-xl bg-amber-50 p-3.5 ring-1 ring-inset ring-amber-600/20">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              name="whatsappEnabled"
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="mt-0.5 size-5 shrink-0 rounded border-amber-300 text-brand-600 focus:ring-2 focus:ring-brand-500/20"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">
                Post published alerts to the channel
              </span>
              <span className="mt-0.5 block text-sm text-amber-900">
                A channel is public. Anyone with the link can read it, including
                people outside the village. A post carries a headline, the area
                and a link back — never a reporter&rsquo;s name, their original
                wording, or the exact spot.
              </span>
            </span>
          </label>
        </div>

        <div>
          <label
            htmlFor="whatsappMinSeverity"
            className="block text-sm font-medium text-slate-700"
          >
            Post anything at or above
          </label>
          <select
            id="whatsappMinSeverity"
            name="whatsappMinSeverity"
            defaultValue={values.minSeverity}
            className={FIELD_CLASS}
          >
            {SEVERITIES.map((severity) => (
              <option key={severity.value} value={severity.value}>
                {severity.label} and above — {severity.description}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-500">
            Higher than your push threshold by default. The weekly digest is
            posted whatever this says — a quiet week is worth saying out loud.
          </p>
          <FieldError message={errors.whatsappMinSeverity} />
        </div>

        {/*
          Shown only once the coordinator has asked for posting, because until
          then it is answering a question they have not asked. It is not an
          error: the follow link is the half most villages will use, and it
          works with no relay at all.
        */}
        {enabled && !relayConfigured && (
          <p className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
            No posting relay is set up on this deployment yet, so alerts will be
            recorded in the server log instead of sent. Your invite link still
            works — residents can follow the channel and you can post to it
            yourself from WhatsApp in the meantime.
          </p>
        )}

        <SaveButton />
      </form>
    </section>
  );
}
