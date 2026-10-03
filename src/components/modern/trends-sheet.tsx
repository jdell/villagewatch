"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, X } from "lucide-react";
import { BottomSheet } from "@/components/modern/bottom-sheet";
import {
  MODERN_MAP_PERIODS,
  type ModernMapPeriod,
} from "@/lib/map/filters";
import {
  bucketShown,
  dayLabel,
  playStep,
  trendBuckets,
} from "@/lib/map/trends";

/**
 * The Trends tab, as a sheet over the map — the handoff's timeline (1f's peek
 * sheet, with 1e's idea that the histogram *is* the period).
 *
 * - **The period**, as the segmented control the filter sheet uses; it is the
 *   same setting, so changing it here changes the pill.
 * - **A bar chart** of reports over the period, one bar a day up to a month.
 *   Bars still on the map are sky; bars the timeline has hidden go grey.
 * - **The timeline slider** and a **play button**. Dragging the slider back
 *   stops the map at that day; dragging it forward replays the period on the
 *   map in the order things were reported. Play does the dragging: it starts
 *   at the beginning of the period and steps to today. The map holds its
 *   framing throughout, so a pattern moving from one street to the next is
 *   visible against a map that stays put.
 *
 * Non-modal and short, so the map is in view while it replays. While the
 * timeline is back from today the map shows its dark chip ("Up to 14 Sept"),
 * which survives closing this sheet and clears it.
 *
 * Counts only — the bars are numbers of reports the map already shows, and
 * carry nothing about anybody.
 */

type TrendsSheetProps = {
  open: boolean;
  onClose: () => void;
  /** The filtered reports before the timeline — the bars' data. */
  incidents: readonly { occurredAt: string }[];
  period: ModernMapPeriod;
  periodDays: number;
  onPeriodChange: (period: ModernMapPeriod) => void;
  /** Days back from today the map stops at; 0 is today. */
  scrub: number;
  onScrubChange: (scrub: number) => void;
  now: number;
};

/** One tick of the play button. Slow enough to see a pin arrive. */
const PLAY_TICK_MS = 140;

export function TrendsSheet({
  open,
  onClose,
  incidents,
  period,
  periodDays,
  onPeriodChange,
  scrub,
  onScrubChange,
  now,
}: TrendsSheetProps) {
  const [playing, setPlaying] = useState(false);
  // The latest scrub, read by the timer without restarting it on every step.
  const scrubRef = useRef(scrub);
  useEffect(() => {
    scrubRef.current = scrub;
  }, [scrub]);

  useEffect(() => {
    if (!playing) return;
    const step = playStep(periodDays);
    const timer = window.setInterval(() => {
      const next = scrubRef.current - step;
      if (next <= 0) {
        onScrubChange(0);
        setPlaying(false);
      } else {
        onScrubChange(next);
      }
    }, PLAY_TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, periodDays, onScrubChange]);

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    // From the start of the period, so play replays it all.
    onScrubChange(periodDays);
    setPlaying(true);
  }

  const buckets = trendBuckets(incidents, periodDays, now);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const phrase = MODERN_MAP_PERIODS.find((p) => p.value === period)?.phrase ?? "";

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        setPlaying(false);
        onClose();
      }}
      labelledBy="trends-sheet-title"
      aboveTabBar
    >
      <div className="flex flex-col gap-3.5 px-4 pb-6">
        <span className="flex h-[22px] items-center justify-center" aria-hidden>
          <span className="h-[5px] w-[38px] rounded-[3px] bg-[#cbd5e1]" />
        </span>

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="trends-sheet-title" className="text-[17px] font-[650] text-[#0f172a]">
              Trends
            </h2>
            <span className="text-[13px] text-[#64748b]">
              {total} {total === 1 ? "report" : "reports"} · {phrase}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              onClose();
            }}
            aria-label="Close trends"
            className="grid size-10 place-items-center rounded-full bg-[#f1f5f9] text-[#334155]"
          >
            <X className="size-[18px]" aria-hidden />
          </button>
        </div>

        <div className="flex gap-0.5 rounded-xl bg-[#f1f5f9] p-[3px]" role="group" aria-label="Period">
          {MODERN_MAP_PERIODS.map((option) => {
            const on = option.value === period;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={on}
                aria-label={option.phrase}
                onClick={() => {
                  setPlaying(false);
                  onPeriodChange(option.value);
                }}
                className={`h-10 flex-1 rounded-[9px] text-sm font-semibold transition ${
                  on
                    ? "bg-white text-[#0f172a] shadow-[0_1px_2px_rgba(15,23,42,.15)]"
                    : "text-[#64748b]"
                }`}
              >
                {option.short}
              </button>
            );
          })}
        </div>

        <div className="flex items-start gap-2.5">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause the replay" : "Replay the period on the map"}
            aria-pressed={playing}
            className="grid size-10 shrink-0 place-items-center rounded-full border border-[#e2e8f0] bg-white"
          >
            {playing ? (
              <Pause className="size-4 text-[#0f172a]" aria-hidden />
            ) : (
              <Play className="size-4 text-[#0f172a]" aria-hidden />
            )}
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {/* The chart is decoration over the slider; the count above and
                the slider's own value are what is announced. */}
            <div className="flex h-7 items-end gap-0.5" aria-hidden>
              {buckets.map((bucket, index) => {
                const shown = bucketShown(bucket, scrub);
                return (
                  <span
                    key={index}
                    className="flex-1 rounded-[2px]"
                    style={{
                      height: bucket.count
                        ? Math.round(5 + (bucket.count / max) * 23)
                        : 2,
                      backgroundColor: shown
                        ? bucket.count
                          ? "#0284c7"
                          : "#bae6fd"
                        : bucket.count
                          ? "#cbd5e1"
                          : "#e2e8f0",
                    }}
                  />
                );
              })}
            </div>
            <input
              type="range"
              min={0}
              max={periodDays}
              value={periodDays - scrub}
              onChange={(event) => {
                setPlaying(false);
                onScrubChange(periodDays - Number(event.target.value));
              }}
              aria-label="Timeline"
              aria-valuetext={scrub === 0 ? "Up to today" : `Up to ${dayLabel(scrub, now)}`}
              className="h-5 w-full accent-[#0284c7]"
            />
            <div className="flex justify-between font-mono text-[11px] font-medium text-[#64748b]">
              <span>{dayLabel(periodDays, now)}</span>
              <span className="font-semibold text-[#0369a1]">
                {scrub === 0 ? "Up to today" : `Up to ${dayLabel(scrub, now)}`}
              </span>
              <span>Today</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-[#64748b]">
          Drag the timeline back, or press play, to replay the period on the
          map.
        </p>
      </div>
    </BottomSheet>
  );
}
