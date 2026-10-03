"use client";

import { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { BottomSheet } from "@/components/modern/bottom-sheet";

/**
 * The coordinator's tools for one report, behind a "Moderate" button and in a
 * sheet of their own — approve, reject, resolve and archive (`IncidentActions`),
 * the written summary for a PCSO (`ShareSummary`) and the WhatsApp alert
 * (`CopyAlert`), all unchanged and passed in as `children` from the server.
 *
 * Out of the page on purpose. The page is what the village reads; a resident
 * and a coordinator should see the same report, and a coordinator's tools
 * stacked under it made the coordinator's copy of the page twice as long and
 * put "Reject" a thumb's width from the vote buttons.
 *
 * `openInitially` is the Approve button on a pending-report push
 * (`?action=approve`): the sheet opens on arrival with the approve
 * confirmation already showing inside it — `IncidentActions`' `openApprove`.
 * The report is still on the page behind it, and the sheet's first line says
 * to read it.
 */

type CoordinatorToolsProps = {
  /** "Approve", "Resolve", "Archive" — what the button promises, briefly. */
  summary: string;
  openInitially?: boolean;
  children: React.ReactNode;
};

export function CoordinatorTools({
  summary,
  openInitially = false,
  children,
}: CoordinatorToolsProps) {
  const [open, setOpen] = useState(openInitially);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex min-h-14 w-full items-center gap-3 rounded-[18px] bg-[#0f172a] px-4 text-left text-white shadow-[0_1px_2px_rgba(15,23,42,.08),0_6px_20px_rgba(15,23,42,.14)] transition hover:bg-[#1e293b]"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10">
          <ShieldCheck className="size-[18px]" aria-hidden />
        </span>
        <span className="flex flex-1 flex-col">
          <span className="text-[15px] font-semibold">Moderate</span>
          <span className="text-[12.5px] text-white/70">{summary}</span>
        </span>
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        labelledBy="coordinator-tools-title"
        modal
        maxHeightClass="max-h-[88dvh]"
      >
        <div className="flex flex-col gap-1 px-[18px] pt-3 pb-8">
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h2
                id="coordinator-tools-title"
                className="text-lg font-[650] text-[#0f172a]"
              >
                Coordinator tools
              </h2>
              <p className="text-[13px] text-[#64748b]">
                Read the report first — it is behind this sheet.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f1f5f9] text-[#334155]"
            >
              <X className="size-[18px]" aria-hidden />
            </button>
          </div>
          {children}
        </div>
      </BottomSheet>
    </>
  );
}
