"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Check, Eye, Loader2, Pencil, Sparkles, X } from "lucide-react";
import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { IncidentTypeIcon } from "@/components/incident-type-icon";
import { SeverityBadge } from "@/components/severity-badge";
import { INCIDENT_TYPE_LABELS } from "@/lib/constants";
import { formatDateTime, formatTimeAgo } from "@/lib/format";
import {
  moderateIncidentAction,
  revealRawDescriptionAction,
  type ModerationState,
} from "@/app/(app)/dashboard/actions";

/**
 * One report awaiting review, with the two decisions a coordinator can make.
 *
 * What is *not* rendered by default is the reporter's verbatim words. The queue
 * shows the anonymised `description`; the original is behind "Show original
 * wording", which is a server action that writes an `AuditLog` row before it
 * returns the text (domain rule 1). That is the whole reason this component is
 * a Client Component — the reveal has to be an action the coordinator takes,
 * not a column on the page's query.
 *
 * Approving hands the WhatsApp alert **upwards** rather than rendering it here.
 * `moderateIncidentAction` revalidates `/dashboard/queue`, the report leaves
 * `PENDING_REVIEW`, and this card is unmounted with the queue it was in — so an
 * alert panel rendered inside it would appear and vanish in the same frame. It
 * goes to `ModerationQueue`, which survives the re-render.
 */

export type QueuedIncident = {
  id: string;
  reference: string;
  type: IncidentType;
  severity: Severity;
  title: string;
  /** The anonymised public text. Never `rawDescription`. */
  description: string;
  locationText: string | null;
  occurredAt: string;
  reportedAt: string;
  reporterName: string | null;
  /**
   * The reporter's initials, computed on the server by `initialsOf` in
   * `src/lib/format.ts`.
   *
   * Null for an anonymous report, where the chip renders a dash rather than the
   * initials of nothing. Passed in rather than derived here so one resident
   * cannot end up with two different sets of initials on two screens — the
   * resident list uses the same function.
   */
  reporterInitials: string | null;
  anonymized: boolean;
  tags: readonly string[];
  mediaCount: number;
};

const IDLE: ModerationState = { ok: true, message: "" };

function SubmitButton({
  action,
  children,
  className,
}: {
  action: "PUBLISH" | "REJECT";
  children: React.ReactNode;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="action"
      value={action}
      disabled={pending}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-60 ${className}`}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : action === "PUBLISH" ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <X className="size-4" aria-hidden />
      )}
      {children}
    </button>
  );
}

/** What an approval hands to the queue above it. */
export type PublishedAlert = {
  incidentId: string;
  reference: string;
  /** WhatsApp-ready text, built by `formatIncidentAlert` on the server. */
  text: string;
  /** False when the description is the reporter's own wording. */
  anonymized: boolean;
};

export function ModerationCard({
  incident,
  onPublished,
}: {
  incident: QueuedIncident;
  /** Called once, with the alert, when this report is approved. */
  onPublished?: (alert: PublishedAlert) => void;
}) {
  const [state, moderate] = useActionState(moderateIncidentAction, IDLE);
  const [raw, reveal, revealing] = useActionState(revealRawDescriptionAction, {
    text: null,
    error: null,
  });
  const [showNote, setShowNote] = useState(false);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  useEffect(() => {
    if (!state.ok || !state.alert) return;

    onPublished?.({
      incidentId: incident.id,
      reference: state.reference ?? incident.reference,
      text: state.alert,
      // Read off the row this card was rendered from rather than round-tripped
      // through the action: it is the same column either way, and the queue
      // already had it.
      anonymized: incident.anonymized,
    });
    // `onPublished` is deliberately not a dependency. The parent recreates the
    // callback on every render, and this effect must fire once per approval —
    // not again each time the page revalidates underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, incident.id, incident.reference, incident.anonymized]);

  useEffect(() => {
    if (raw.error) toast.error(raw.error);
  }, [raw.error]);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
          <IncidentTypeIcon type={incident.type} className="size-3.5" />
          {INCIDENT_TYPE_LABELS[incident.type]}
        </span>

        <SeverityBadge severity={incident.severity} size="sm" />

        <span className="font-mono text-xs text-slate-500">
          {incident.reference}
        </span>

        <span
          className="ml-auto text-xs text-slate-500"
          title={formatDateTime(incident.reportedAt)}
        >
          Filed <time suppressHydrationWarning>{formatTimeAgo(incident.reportedAt)}</time>
        </span>
      </div>

      <h3 className="mt-2.5 text-base font-semibold text-slate-900">
        <Link
          href={`/incidents/${incident.id}`}
          className="hover:underline focus-visible:underline"
        >
          {incident.title}
        </Link>
      </h3>

      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
        {incident.description}
      </p>

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <div className="inline-flex gap-1.5">
          <dt>Happened</dt>
          <dd
            className="text-slate-700"
            title={formatDateTime(incident.occurredAt)}
          >
            <time suppressHydrationWarning>
              {formatTimeAgo(incident.occurredAt)}
            </time>
          </dd>
        </div>

        {incident.locationText && (
          <div className="inline-flex gap-1.5">
            <dt>Where</dt>
            <dd className="text-slate-700">{incident.locationText}</dd>
          </div>
        )}

        <div className="inline-flex items-center gap-1.5">
          <dt>Reporter</dt>
          <dd className="inline-flex items-center gap-1.5 text-slate-700">
            <span
              className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[0.625rem] font-semibold text-brand-700"
              aria-hidden
            >
              {incident.reporterInitials ?? "–"}
            </span>
            {incident.reporterName ?? "Anonymous"}
          </dd>
        </div>

        {incident.mediaCount > 0 && (
          <div className="inline-flex gap-1.5">
            <dt>Media</dt>
            <dd className="text-slate-700">
              {incident.mediaCount} blurred attachment
              {incident.mediaCount === 1 ? "" : "s"}
            </dd>
          </div>
        )}
      </dl>

      {incident.tags.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {incident.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 inline-flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {incident.anonymized
          ? "Rewritten to remove personal details before you see it, and checked by the reporter."
          : "Not processed by the AI — this is the reporter's own wording."}
      </p>

      {/* The verbatim text. Fetching it writes an audit row (domain rule 1). */}
      {raw.text === null ? (
        <form action={reveal} className="mt-3">
          <input type="hidden" name="incidentId" value={incident.id} />
          <button
            type="submit"
            disabled={revealing}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 underline underline-offset-2 transition hover:text-slate-700 disabled:opacity-60"
          >
            {revealing ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Eye className="size-3.5" aria-hidden />
            )}
            Show the reporter&rsquo;s original wording
          </button>
          <span className="ml-2 text-xs text-slate-400">
            Recorded in the audit log
          </span>
        </form>
      ) : (
        <div className="mt-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Original wording — not published
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {raw.text}
          </p>
        </div>
      )}

      <form action={moderate} className="mt-4 border-t border-slate-100 pt-4">
        <input type="hidden" name="incidentId" value={incident.id} />

        {showNote && (
          <div className="mb-3">
            <label
              htmlFor={`note-${incident.id}`}
              className="block text-sm font-medium text-slate-700"
            >
              Note for the reporter
            </label>
            <textarea
              id={`note-${incident.id}`}
              name="note"
              rows={2}
              maxLength={500}
              placeholder="Why was this not published?"
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton
            action="PUBLISH"
            className="bg-safe-600 text-white hover:bg-safe-700"
          >
            Approve &amp; alert
          </SubmitButton>

          {/*
            An anchor rather than a third `SubmitButton`, and inside the form
            because that is where the other two decisions are — a coordinator
            reading a report decides between the three in one place.

            Editing a queued report is a coordinator capability as of this
            redesign; it used to be the reporter's alone. The widening is in
            `editIncidentAction`, and it is still bounded by the two constraints
            that matter: queue statuses only, and the coordinator's own village.
          */}
          <Link
            href={`/incidents/${incident.id}/edit`}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Pencil className="size-4" aria-hidden />
            Edit
          </Link>

          <SubmitButton
            action="REJECT"
            className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          >
            Reject
          </SubmitButton>

          {!showNote && (
            <button
              type="button"
              onClick={() => setShowNote(true)}
              className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              Add a note
            </button>
          )}
        </div>
      </form>
    </article>
  );
}
