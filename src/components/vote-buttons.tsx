"use client";

import { useRef, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { applyVote, type VoteInput, type VoteState } from "@/lib/votes";

/**
 * How serious does the village think this is?
 *
 * Two buttons and a number, on every published report a resident can see. The
 * severity on the card is the reporter's own assessment; this is everybody
 * else's, and it is advisory — see the header of `src/lib/votes.ts` for why it
 * deliberately moves nothing.
 *
 * ## Optimistic, and it puts the count back when it is wrong
 *
 * The tally updates on the press, before the request lands, because a control
 * this small that waits 300ms for a round trip reads as broken. What makes that
 * safe is the reconciliation: the previous state is held in a ref, the response
 * replaces the optimistic guess with the server's own count — which is the
 * village's rather than this browser's, and will differ the moment two
 * neighbours vote in the same minute — and any failure restores exactly what was
 * on screen before.
 *
 * The optimistic step is `applyVote` from `src/lib/votes.ts`, which is the same
 * function the route uses to decide what to write. Two implementations of the
 * toggle would disagree the first time somebody fixed one, and the symptom is a
 * number that flicks to the wrong value and then corrects itself — the kind of
 * bug that is only ever seen and never reproduced.
 *
 * ## The lock is a ref, not the disabled attribute
 *
 * `setPending(true)` schedules a render; two taps in the same frame both read
 * the old state and both fire. That is the second half of the bug
 * `useAuthSubmit` was written for, and here it is cheaper to hit — a double tap
 * on a phone is one gesture. The ref is read and set synchronously, so the
 * second handler is refused before React has rendered anything.
 *
 * A rate-limited response is not an error state worth shouting about: the route
 * returns its own sentence and it goes in a toast, the same as every other 429
 * in the app.
 *
 * ## Nobody's name appears here
 *
 * Not in the markup, not in the props, not in the response. `myVote` is the
 * reader's own and the counts are counts. There is no surface anywhere in the
 * app that says who voted which way — see `IncidentVote` in the schema.
 */

type VoteButtonsProps = {
  incidentId: string;
  /** The tally as the server rendered it, plus this reader's own vote. */
  initial: VoteState;
  /** Smaller, for a list row. */
  compact?: boolean;
  className?: string;
};

export function VoteButtons({
  incidentId,
  initial,
  compact = false,
  className = "",
}: VoteButtonsProps) {
  const [state, setState] = useState<VoteState>(initial);

  // Synchronous, unlike the state below it. See the header.
  const busy = useRef(false);
  const [pending, setPending] = useState(false);

  async function cast(pressed: VoteInput) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);

    // What to put back if this does not land.
    const previous = state;
    setState(applyVote(state, pressed));

    try {
      const response = await fetch(
        `/api/incidents/${encodeURIComponent(incidentId)}/vote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vote: pressed }),
        },
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setState(previous);
        toast.error(result.error ?? "Your vote could not be saved.");
        return;
      }

      // The server's count, not the optimistic one. Two residents voting on the
      // same report in the same minute each get the total as it stands.
      setState({
        up: result.up ?? previous.up,
        down: result.down ?? previous.down,
        score: result.score ?? previous.score,
        myVote: result.myVote ?? null,
      });
    } catch {
      setState(previous);
      toast.error("Network error — check your connection and try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const size = compact ? "h-8 px-2" : "h-9 px-2.5";
  const icon = compact ? "size-3.5" : "size-4";

  return (
    <div
      className={`inline-flex items-center gap-1 ${className}`}
      // Read as one control rather than as two buttons and a stray number.
      role="group"
      aria-label="How serious does your village think this is?"
    >
      <Button
        pressed={state.myVote === "up"}
        disabled={pending}
        onClick={() => cast("up")}
        label="More serious than it looks"
        count={state.up}
        size={size}
        tone="up"
      >
        <ThumbsUp className={icon} aria-hidden />
      </Button>

      <Button
        pressed={state.myVote === "down"}
        disabled={pending}
        onClick={() => cast("down")}
        label="Less serious than it looks"
        count={state.down}
        size={size}
        tone="down"
      >
        <ThumbsDown className={icon} aria-hidden />
      </Button>
    </div>
  );
}

function Button({
  pressed,
  disabled,
  onClick,
  label,
  count,
  size,
  tone,
  children,
}: {
  pressed: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  count: number;
  size: string;
  tone: "up" | "down";
  children: React.ReactNode;
}) {
  const active =
    tone === "up"
      ? "border-brand-200 bg-brand-50 text-brand-700"
      : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      /*
        `aria-pressed` rather than a label that changes: the button does not
        become a different control when it is on, it becomes a control in a
        different state, and a screen reader announces that better than
        "Unvote more serious" ever would.
      */
      aria-pressed={pressed}
      // The visible number needs the sentence beside it or it is a bare digit.
      aria-label={`${label} — ${count} ${count === 1 ? "vote" : "votes"}`}
      title={label}
      className={`inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium tabular-nums transition disabled:cursor-not-allowed disabled:opacity-60 ${size} ${
        pressed
          ? active
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
      }`}
    >
      {children}
      <span aria-hidden>{count}</span>
    </button>
  );
}
