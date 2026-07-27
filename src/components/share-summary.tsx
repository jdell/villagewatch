"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ClipboardCopy, Share2, ShieldAlert } from "lucide-react";
import { copyText, shareText } from "@/lib/clipboard";

/**
 * One report, formatted for a PCSO or a parish clerk, and a button that opens
 * whatever the device shares with.
 *
 * The text arrives as a prop, already built by `formatIncidentSummary` on the
 * server. That is not a style choice: `navigator.share()` has to be called
 * inside the user gesture that triggered it, so anything fetched on click would
 * spend the gesture and be refused by iOS Safari — the platform this button is
 * most useful on. See `src/lib/clipboard.ts`.
 *
 * **Coordinator surfaces only.** A resident is not given a button that sends
 * their neighbour's report to a third party, however anonymised. The gate is on
 * the server, on the page that renders this.
 *
 * The summary carries only what is already on the village map — the anonymised
 * description, the category, the severity, the time and the landmark. No
 * coordinates and no verbatim text; `ReportIncident` has nowhere to put either.
 */

type ShareSummaryProps = {
  /** The formatted summary. Built by `formatIncidentSummary` on the server. */
  text: string;
  /** Goes in the share sheet's own title field, not into the text. */
  shareTitle: string;
  /**
   * Whether the description in the summary is the AI rewrite. False means it is
   * the reporter's own wording, which is worth saying out loud above a button
   * that hands it to a share sheet.
   */
  anonymized?: boolean;
};

/** How long the button stays saying "Copied!" before going back. */
const COPIED_MS = 2_000;

export function ShareSummary({
  text,
  shareTitle,
  anonymized = true,
}: ShareSummaryProps) {
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

  async function handleShare() {
    const outcome = await shareText({ title: shareTitle, text });

    if (outcome === "copied") {
      markCopied();
      toast.success("No share sheet here — the summary is on your clipboard.");
      return;
    }

    // "shared" needs no toast: the sheet the coordinator just used is the
    // feedback. "cancelled" needs none either — they closed it on purpose, and
    // telling somebody their own decision failed is worse than saying nothing.
    if (outcome === "failed") {
      toast.error("Could not share — select the text below and copy it.");
    }
  }

  async function handleCopy() {
    if (await copyText(text)) {
      markCopied();
      toast.success("Copied!");
      return;
    }

    toast.error("Could not reach the clipboard — select the text and copy it.");
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Share2 className="size-4 text-slate-400" aria-hidden />
        Share with police or the council
      </h3>

      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        A written summary of this report for your PCSO or parish council. It
        carries the anonymised description, the category, the severity, when it
        happened and the landmark the reporter named — never their original
        wording, their name or the map coordinates.
      </p>

      {!anonymized && (
        <p className="mt-2 flex gap-2 rounded-lg bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-600/20">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            This report was never rewritten, so the description below is the
            reporter&rsquo;s own wording. Read it through for names,
            registrations and addresses before you send it anywhere.
          </span>
        </p>
      )}

      {/*
        `<pre>` rather than a read-only textarea: it is the summary as it will
        arrive, line breaks and all, and it stays selectable for the case where
        neither the share sheet nor the clipboard is available.
      */}
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white p-3.5 font-sans text-sm leading-relaxed text-slate-800 ring-1 ring-slate-200">
        {text}
      </pre>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <Share2 className="size-4" aria-hidden />
          Share with police
        </button>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          {copied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <ClipboardCopy className="size-4" aria-hidden />
          )}
          {copied ? "Copied!" : "Copy summary"}
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        Opens your device&rsquo;s share sheet — email, messages, or anything else
        you have. On a desktop browser with no share sheet it copies instead.
      </p>
    </div>
  );
}
