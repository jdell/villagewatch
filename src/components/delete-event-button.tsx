"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import {
  deleteEventAction,
  type DeleteEventState,
} from "@/app/(app)/events/actions";

/**
 * Delete, behind an inline "are you sure?" — the report's delete button's
 * pattern. Rendered only for the poster or a coordinator, which is a decision
 * about which button exists; `deleteCommunityEvent` makes the real one.
 */

const IDLE: DeleteEventState = { ok: false, message: "" };

function ConfirmButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="size-4" aria-hidden />
      )}
      Yes, delete it
    </button>
  );
}

export function DeleteEventButton({
  eventId,
  asCoordinator,
}: {
  eventId: string;
  /** Viewer is a coordinator deleting somebody else's event. Changes the copy. */
  asCoordinator: boolean;
}) {
  const router = useRouter();
  const [state, action] = useActionState(deleteEventAction, IDLE);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!state.message) return;
    if (!state.ok) {
      toast.error(state.message);
      return;
    }
    // Navigation is a side effect outside React, not state — which is what
    // makes doing it here acceptable to the lint rules.
    toast.success(state.message);
    router.push("/events");
  }, [state, router]);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <Trash2 className="size-4" aria-hidden />
        Delete event
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <span className="text-sm font-medium text-slate-700">
        {asCoordinator
          ? "Take this down for everyone? It is recorded in the audit trail."
          : "Delete your event? This cannot be undone."}
      </span>
      <ConfirmButton />
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-slate-500 transition hover:text-slate-700"
      >
        Keep it
      </button>
    </form>
  );
}
