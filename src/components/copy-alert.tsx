"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ClipboardCopy, MessageCircle } from "lucide-react";

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
 * ## The two buttons
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
 *
 * `https://wa.me/?text=` rather than a `whatsapp://` scheme URL. The two behave
 * identically on a phone; on a desktop `whatsapp://` opens the desktop app if it
 * happens to be installed and otherwise fails silently with nothing on screen,
 * where `wa.me` falls through to WhatsApp Web. Silent failure is the one
 * outcome worth engineering away here.
 */

type CopyAlertProps = {
  /** The formatted alert. Built by `formatIncidentAlert` on the server. */
  text: string;
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

/** WhatsApp's own share link. Mobile opens the app, desktop opens Web. */
function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Copies through the async clipboard API, falling back to a hidden textarea.
 *
 * The fallback is what makes this work on `http://` — `navigator.clipboard` is
 * gated on a secure context, and a coordinator on a LAN deployment or a preview
 * over plain HTTP would otherwise get a button that does nothing.
 */
async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Denied permission, or an insecure origin. Fall through.
  }

  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}

export function CopyAlert({
  text,
  channelUrl,
  anonymized = true,
  title = "Post this to WhatsApp",
  hint,
}: CopyAlertProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  async function handleOpen() {
    // Best effort and deliberately quiet. The navigation below is the thing the
    // coordinator asked for, and a clipboard failure must not stand in front of
    // it — the text is still on screen to copy by hand.
    if (await copyText(text)) markCopied();

    window.open(
      channelUrl ?? whatsappShareUrl(text),
      "_blank",
      "noopener,noreferrer",
    );
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
          onClick={handleOpen}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <MessageCircle className="size-4" aria-hidden />
          💬 Open WhatsApp
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        {channelUrl
          ? "Opens your village's channel, with the alert already on your clipboard."
          : "Opens WhatsApp with the alert ready to send. Add your channel's invite link on the dashboard to jump straight to it."}
      </p>
    </div>
  );
}
