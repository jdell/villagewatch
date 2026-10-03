"use client";

import { ChevronRight, Compass } from "lucide-react";
import { restartTour } from "@/components/onboarding-tour";

/**
 * "How VillageWatch works" — the four-step first-run tour, again. The tour
 * points at the map, the Report button and this tab, so it runs over whatever
 * page is open; nothing navigates.
 */
export function ReplayTourRow() {
  return (
    <button
      type="button"
      onClick={restartTour}
      className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[#f8fafc]"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f0f9ff] text-[#0284c7]">
        <Compass className="size-4" aria-hidden />
      </span>
      <span className="flex-1 text-[15px] font-[550] text-[#0f172a]">
        How VillageWatch works
      </span>
      <ChevronRight className="size-[18px] text-[#94a3b8]" aria-hidden />
    </button>
  );
}
