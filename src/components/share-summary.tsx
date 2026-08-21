"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ClipboardCopy, Share2, ShieldAlert } from "lucide-react";
import { copyText, shareText } from "@/lib/clipboard";
import type { VillageMode } from "@/lib/constants";

/**
 * One report, formatted to be sent outside the village, and a button that opens
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
 *
 * ## Who it is for depends on the village
 *
 * `Village.mode`, the same read `/reports` and the dashboard's controller field
 * make. A council village sends this to its PCSO or its parish council; a
 * community village — the default, and most of them — has no council to send it
 * to, so the second half of that sentence names the group's own records
 * instead. Telling a volunteer with six neighbours and a WhatsApp group that
 * this is for their parish council is describing somebody else's village to
 * them, which is what N15 fixed on the other two screens and missed here.
 *
 * The police are in both sets of copy, because a village having no council says
 * nothing about whether it has a PCSO. What changes is the body beside them.
 *
 * The *text* is unaffected — `formatIncidentSummary` names no recipient, so
 * both modes share one document and only the panel around it moves. One
 * component with the mode passed in rather than two, for the reason
 * `ParishCouncilForm` gives: this is a heading and a sentence changing, not two
 * sets of copy about who is answerable for what.
 */

/** Everything on this panel that depends on whether the village has a council. */
const COPY = {
  council: {
    heading: "Share with police or the council",
    description:
      "A written summary of this report for your PCSO or parish council.",
  },
  community: {
    heading: "Share with police or your records",
    description:
      "A written summary of this report for your PCSO, or for your group’s own records.",
  },
} as const satisfies Record<
  VillageMode,
  { heading: string; description: string }
>;

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
  /** Which model the village runs. Decides the copy, never the document. */
  mode: VillageMode;
};

/** How long the button stays saying "Copied!" before going back. */
const COPIED_MS = 2_000;

export function ShareSummary({
  text,
  shareTitle,
  anonymized = true,
  mode,
}: ShareSummaryProps) {
  const copy = COPY[mode];
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
        {copy.heading}
      </h3>

      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {copy.description} It carries the anonymised description, the category,
        the severity, when it happened and the landmark the reporter named —
        never their original wording, their name or the map coordinates.
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
