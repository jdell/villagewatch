"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Loader2, Undo2 } from "lucide-react";

import { ARCHIVE_REASONS, type ArchiveReasonValue } from "@/lib/constants";

/**
 * Archive one interest registration, or put one back.
 *
 * **An inline panel rather than a floating modal**, which is what the brief
 * asked for and is the same interaction without the machinery. `village-card.tsx`
 * already confirms a village suspension this way and it is the pattern worth
 * matching: a dialog wants a focus trap, a scroll lock, an escape handler and
 * somewhere to portal to, all to reproduce something that on a phone is a panel
 * anyway — and this list is read on a laptop by one person who is about to press
 * the thing underneath it.
 *
 * **The reason is chosen before anything is sent.** There is no "archive now,
 * say why later": a row archived with no account of why is one somebody has to
 * guess about afterwards, and the guess is usually "we must have contacted
 * them", which is exactly the fact the list is meant to hold. The panel opens
 * with nothing selected for the same reason the interest form's own fork does —
 * a default here would be recorded as a decision nobody took.
 *
 * `router.refresh()` rather than local state, so the row moves out of the list
 * the server rendered rather than being hidden in this one. The count on the
 * filter above it has to move at the same time, and that count is a `groupBy`
 * on the server; hiding the row here would leave "12 pending" over eleven rows.
 */
export function ArchiveInterest({
  id,
  name,
  archived,
}: {
  id: string;
  /** Whose row this is, so the confirm panel can say it. */
  name: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ArchiveReasonValue | null>(null);
  const [detail, setDetail] = useState("");
  const [pending, setPending] = useState(false);

  async function send(body: Record<string, unknown>, success: string) {
    setPending(true);

    try {
      const response = await fetch(
        `/api/admin/village-interest/${id}/archive`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error ?? "That did not work");
        return;
      }

      toast.success(success);
      setOpen(false);
      setReason(null);
      setDetail("");
      router.refresh();
    } catch {
      toast.error("Could not reach the server. Check your connection.");
    } finally {
      setPending(false);
    }
  }

  if (archived) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => send({ restore: true }, `${name} is back on the list`)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Undo2 className="size-3.5" aria-hidden />
        )}
        Restore
      </button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <Archive className="size-3.5" aria-hidden />
        Archive
      </button>
    );
  }

  const needsDetail = reason === "other";
  const ready = Boolean(reason) && (!needsDetail || detail.trim().length > 0);

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium text-slate-900">
        Why are you archiving {name}?
      </p>
      <p className="mt-0.5 text-xs text-slate-500">
        Nothing is deleted — the row stays, and comes off the working list.
      </p>

      {/*
        A fieldset because the options are one question, and a real radio group
        so a keyboard moves through them with the arrow keys rather than tabbing
        past four separate controls.
      */}
      <fieldset className="mt-2.5">
        <legend className="sr-only">Reason for archiving</legend>

        <div className="space-y-1">
          {ARCHIVE_REASONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-2.5 py-1.5 transition ${
                reason === option.value
                  ? "border-brand-500 bg-brand-50/60"
                  : "border-transparent hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name={`archive-reason-${id}`}
                value={option.value}
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
                className="mt-0.5 size-3.5 shrink-0 border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="min-w-0">
                <span className="block text-xs font-medium text-slate-900">
                  {option.label}
                </span>
                <span className="block text-xs text-slate-500">
                  {option.detail}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/*
        Rendered only on the "Other" branch and unmounted otherwise, so a
        sentence typed and then abandoned cannot be submitted under a reason
        that does not show it — the interest form's own rule about the
        motivation field, and `archiveVillageInterestSchema` drops it server-side
        regardless.
      */}
      {needsDetail && (
        <textarea
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          rows={2}
          maxLength={500}
          autoFocus
          placeholder="Moved away — their new village is already live."
          className="mt-2 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={!ready || pending}
          onClick={() =>
            send(
              { reason, detail: detail.trim() || undefined },
              `${name} archived`,
            )
          }
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Archive
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setReason(null);
            setDetail("");
          }}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
