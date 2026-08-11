"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ClipboardCopy, MessageCircle, Share2 } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import {
  facebookShareUrl,
  incidentUrl,
  whatsappShareUrl,
} from "@/lib/format-alert";

/**
 * The published alert, ready to paste into WhatsApp.
 *
 * **This is the whole delivery mechanism for the channel.** There is no relay
 * that can post to a WhatsApp Channel (see `src/lib/whatsapp-channel.ts`), so
 * the alert reaches the village's followers when a coordinator copies it here
 * and pastes it there. The text is built server-side by `formatIncidentAlert`
 * and arrives as a prop, so what is on screen is exactly what goes on the
 * clipboard and exactly what the server wrote to its log.
 *
 * Coordinator surfaces only. A channel is public and a resident deciding to
 * republish their neighbour's report outside the village is not a decision the
 * app should be handing out with a button — the three places this renders
 * (`/dashboard` after an approval, the incident page, and the wizard's success
 * screen) all gate it on the viewer moderating this village.
 *
 * ## The three buttons
 *
 * - **Copy alert** puts the text on the clipboard. `navigator.clipboard` is
 *   unavailable on a non-secure origin, so there is a `<textarea>` +
 *   `execCommand` fallback behind it; if both fail the text is still on screen
 *   and selectable, and the toast says to copy it by hand rather than claiming
 *   a copy that did not happen.
 * - **Open WhatsApp** copies first, silently, then opens WhatsApp. Copying is
 *   not a nicety there: a channel invite link opens the channel and nothing
 *   else — it cannot carry a prefilled message — so a coordinator who pressed
 *   only that button would arrive at the channel with an empty clipboard.
 * - **Share to Facebook** does the same and for a sharper version of the same
 *   reason. Facebook's sharer takes the report's URL and builds the card from
 *   it; the alert text goes in `quote`, which **Facebook honours inconsistently
 *   and frequently drops** — prefilled text is deprecated as a platform policy.
 *   So the clipboard copy is what makes the button reliable rather than a nicety
 *   on top of it: worst case the composer opens empty and the coordinator
 *   pastes.
 *
 * Every destination here is the same text, and the same decision: a person who
 * has read the report choosing to put it somewhere public. Nothing on this panel
 * posts anything — see `src/lib/whatsapp-channel.ts`, and `/privacy` §6, which
 * names both destinations because both are readable by anyone.
 *
 * The share links are built by `format-alert.ts` from the same `incidentUrl` the
 * alert text carries, so the card and the "View details" line in the post cannot
 * point at different reports.
 */

type CopyAlertProps = {
  /** The formatted alert. Built by `formatIncidentAlert` on the server. */
  text: string;
  /**
   * The report this alert is about. Only ever used to rebuild its public URL —
   * the address Facebook builds its card from, and the same one already inside
   * `text`.
   */
  incidentId: string;
  /**
   * The village's channel invite link, when it has one. Already through
   * `safeChannelUrl` — this renders it into an `href`.
   */
  channelUrl?: string | null;
  /**
   * Whether the description in the alert is the AI rewrite. False means it is
   * the reporter's own wording, which is worth saying out loud on a screen whose
   * button puts it in front of the open internet.
   */
  anonymized?: boolean;
  /** Heading, so the three call sites can say why the panel is there. */
  title?: string;
  hint?: string;
};

/** How long the button stays saying "Copied!" before going back. */
const COPIED_MS = 2_000;

export function CopyAlert({
  text,
  incidentId,
  channelUrl,
  anonymized = true,
  title = "Post this to WhatsApp",
  hint,
}: CopyAlertProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Null on a deployment whose base URL will not resolve, where the report's
  // address comes out relative — see `facebookShareUrl`. The button goes rather
  // than posting a dead link to a public feed.
  const facebookUrl = facebookShareUrl(incidentUrl(incidentId), text);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function markCopied() {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  async function handleCopy() {
    if (await copyText(text)) {
      markCopied();
      toast.success("Copied!");
      return;
    }

    toast.error("Could not reach the clipboard — select the text and copy it.");
  }

  /**
   * Copy, then leave. Best effort and deliberately quiet: the navigation is the
   * thing the coordinator asked for, and a clipboard failure must not stand in
   * front of it — the text is still on screen to copy by hand.
   */
  async function openWith(url: string) {
    if (await copyText(text)) markCopied();

    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <MessageCircle className="size-4 text-slate-400" aria-hidden />
        {title}
      </h3>

      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {hint ??
          "Copy this and paste it into your village's WhatsApp Channel. Nothing is posted automatically."}
      </p>

      {!anonymized && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-600/20">
          This report was never rewritten, so the text below is the
          reporter&rsquo;s own wording. A channel is public — read it through for
          names, registrations and addresses before you post it anywhere.
        </p>
      )}

      {/*
        `<pre>` rather than a read-only textarea: it is the alert as it will
        arrive, line breaks and all, and it stays selectable for the case where
        both clipboard paths are unavailable.
      */}
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-white p-3.5 font-sans text-sm leading-relaxed text-slate-800 ring-1 ring-slate-200">
        {text}
      </pre>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {copied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <ClipboardCopy className="size-4" aria-hidden />
          )}
          {copied ? "Copied!" : "📋 Copy alert"}
        </button>

        <button
          type="button"
          onClick={() => openWith(channelUrl ?? whatsappShareUrl(text))}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <MessageCircle className="size-4" aria-hidden />
          💬 Open WhatsApp
        </button>

        {facebookUrl && (
          <button
            type="button"
            onClick={() => openWith(facebookUrl)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Share2 className="size-4" aria-hidden />
            📘 Share to Facebook
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-slate-400">
        {channelUrl
          ? "Opens your village's channel, with the alert already on your clipboard."
          : "Opens WhatsApp with the alert ready to send. Add your channel's invite link on the dashboard to jump straight to it."}
      </p>

      {facebookUrl && (
        <p className="mt-1 text-xs text-slate-400">
          Facebook opens a post with a link to the report. It often ignores
          prefilled wording, so the alert goes on your clipboard as well — paste
          it in if the box comes up empty. A Facebook post is public.
        </p>
      )}
    </div>
  );
}
