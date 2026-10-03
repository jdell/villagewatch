"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ClipboardCopy, Mail, MessageCircle, Share2 } from "lucide-react";
import { copyText } from "@/lib/clipboard";

/**
 * The row of share buttons: Copy, WhatsApp, Facebook and Email, over one text.
 *
 * Extracted from `CopyAlert` when the weekly summaries on `/reports` gained the
 * same buttons, so that "copy first, then open" is written once. Every button
 * that leaves the page puts the text on the clipboard first, quietly, because
 * none of the destinations is reliable about prefilled text — Facebook drops
 * `quote` more often than it honours it, a channel invite link carries no
 * message at all, and a long `mailto:` body is truncated by some clients. Worst
 * case the coordinator pastes.
 *
 * A destination whose URL is `null` or absent is not rendered: a hidden button
 * beats one that posts a dead link. Who may see the row is the caller's gate,
 * not this component's.
 */

type ShareButtonsProps = {
  /** What goes on the clipboard, and what each URL already carries. */
  text: string;
  whatsappUrl: string;
  facebookUrl?: string | null;
  emailUrl?: string | null;
  /** Omit to render no Copy button — the destinations still copy. */
  copyLabel?: string;
  whatsappLabel?: string;
  facebookLabel?: string;
};

/** How long the Copy button stays saying "Copied!" before going back. */
const COPIED_MS = 2_000;

const SECONDARY =
  "inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";

export function ShareButtons({
  text,
  whatsappUrl,
  facebookUrl,
  emailUrl,
  copyLabel,
  whatsappLabel = "Open WhatsApp",
  facebookLabel = "Share to Facebook",
}: ShareButtonsProps) {
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

  /**
   * Copy, then leave. Best effort and deliberately quiet: the navigation is the
   * thing the coordinator asked for, and a clipboard failure must not stand in
   * front of it — the text is still on screen to copy by hand.
   */
  async function openWith(url: string) {
    if (await copyText(text)) markCopied();

    window.open(url, "_blank", "noopener,noreferrer");
  }

  /**
   * A `mailto:` is handed to the mail client in this tab rather than opened in
   * a new one: `window.open` on a `mailto:` leaves an empty tab behind in most
   * browsers, and the page is not navigated away from.
   */
  async function openMail(url: string) {
    if (await copyText(text)) markCopied();

    window.location.href = url;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {copyLabel && (
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
          {copied ? (
            "Copied!"
          ) : (
            <>
              <span aria-hidden>📋 </span>
              {copyLabel}
            </>
          )}
        </button>
      )}

      <button type="button" onClick={() => openWith(whatsappUrl)} className={SECONDARY}>
        <MessageCircle className="size-4" aria-hidden />
        <span aria-hidden>💬 </span>
        {whatsappLabel}
        <span className="sr-only"> (opens in a new tab)</span>
      </button>

      {facebookUrl && (
        <button type="button" onClick={() => openWith(facebookUrl)} className={SECONDARY}>
          <Share2 className="size-4" aria-hidden />
          <span aria-hidden>📘 </span>
          {facebookLabel}
          <span className="sr-only"> (opens in a new tab)</span>
        </button>
      )}

      {emailUrl && (
        <button type="button" onClick={() => openMail(emailUrl)} className={SECONDARY}>
          <Mail className="size-4" aria-hidden />
          Email
          <span className="sr-only"> (opens your email app)</span>
        </button>
      )}
    </div>
  );
}
