"use client";

import Link from "next/link";
import { ArrowLeft, Share } from "lucide-react";
import { toast } from "sonner";
import { shareText } from "@/lib/clipboard";

/**
 * The bar across the top of a report's page: back to the map, the reference in
 * the middle, and share on the right.
 *
 * What Share sends depends on who is pressing it, because "The public share
 * buttons" in CLAUDE.md is a rule rather than a style: **a resident never gets
 * a button that puts a neighbour's report in front of people outside the
 * village.**
 *
 * - **A coordinator**, on a published or resolved report, shares the public
 *   preview — `/incident/[id]`, singular — exactly what the WhatsApp and
 *   Facebook buttons already send.
 * - **A resident** shares this page — `/incidents/[id]`, plural — which needs a
 *   signed-in resident of the same village to open. It is "look at this" to a
 *   neighbour, and to anybody else it is a sign-in screen that says nothing.
 * - **A report still in the queue** has no share at all (domain rule 6), and
 *   the right-hand slot stays empty so the reference stays centred.
 *
 * The URL is built on the server and handed down, because `navigator.share()`
 * must be called inside the tap — see `src/lib/clipboard.ts`.
 */

type ReportNavProps = {
  reference: string;
  shareUrl: string | null;
  shareTitle: string;
};

export function ReportNav({ reference, shareUrl, shareTitle }: ReportNavProps) {
  async function share() {
    if (!shareUrl) return;
    const outcome = await shareText({
      title: shareTitle,
      text: `${shareTitle}\n${shareUrl}`,
    });
    if (outcome === "copied") toast.success("Link copied");
    else if (outcome === "failed") toast.error("Could not share this report.");
  }

  return (
    <nav
      aria-label="Report"
      className="sticky top-0 z-[900] grid h-[calc(3.5rem+env(safe-area-inset-top))] grid-cols-[1fr_auto_1fr] items-center border-b border-[#e2e8f0] bg-white/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur lg:static lg:h-14 lg:rounded-t-[18px] lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none"
      data-print-hide
    >
      <Link
        href="/map"
        className="inline-flex h-10 items-center gap-1.5 justify-self-start rounded-xl px-2.5 text-[15px] font-semibold text-[#0284c7] transition hover:bg-[#f0f9ff]"
      >
        <ArrowLeft className="size-[18px]" aria-hidden />
        Map
      </Link>

      <span className="font-mono text-[13px] font-semibold text-[#334155]">
        {reference}
      </span>

      {shareUrl ? (
        <button
          type="button"
          onClick={share}
          aria-label="Share this report"
          className="grid size-10 place-items-center justify-self-end rounded-xl text-[#0284c7] transition hover:bg-[#f0f9ff]"
        >
          <Share className="size-[19px]" aria-hidden />
        </button>
      ) : (
        <span aria-hidden />
      )}
    </nav>
  );
}
