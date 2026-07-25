"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { INCIDENT_TYPES, SEVERITIES } from "@/lib/constants";
import {
  editIncidentAction,
  type IncidentActionState,
} from "@/app/(app)/incidents/[id]/actions";

/**
 * Correcting a report that is still in the queue.
 *
 * Not the five-step wizard. A reporter coming back to fix a typo or a wrong
 * category does not want to walk through location, media and the AI preview
 * again — and re-running the anonymisation pass here would replace text they
 * have already read and approved. So this edits the five fields that carry the
 * meaning and leaves media, tags, coordinates and the AI provenance alone.
 *
 * The description edited here is the **public** one. The reporter's original
 * submission stays on file for the coordinator reviewing the change.
 */

const IDLE: IncidentActionState = { ok: true, message: "" };

const FIELD_CLASS =
  "mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

export type IncidentEditValues = {
  id: string;
  title: string;
  description: string;
  type: IncidentType;
  severity: Severity;
  locationText: string;
};

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Save changes
    </button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-sm text-red-600">{message}</p>;
}

export function IncidentEditForm({ values }: { values: IncidentEditValues }) {
  const [state, save] = useActionState(editIncidentAction, IDLE);

  useEffect(() => {
    if (state.message && !state.ok) toast.error(state.message);
  }, [state]);

  const errors = state.fieldErrors ?? {};

  return (
    <form action={save} className="mt-6 space-y-4">
      <input type="hidden" name="incidentId" value={values.id} />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="space-y-4">
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-slate-700"
            >
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              maxLength={120}
              defaultValue={values.title}
              className={FIELD_CLASS}
            />
            <FieldError message={errors.title} />
          </div>

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-slate-700"
            >
              What neighbours will read
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={6}
              maxLength={4000}
              defaultValue={values.description}
              className={FIELD_CLASS}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Keep names, house numbers and registrations out of this — it is the
              version everyone in the village sees.
            </p>
            <FieldError message={errors.description} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="type"
                className="block text-sm font-medium text-slate-700"
              >
                What happened
              </label>
              <select
                id="type"
                name="type"
                defaultValue={values.type}
                className={FIELD_CLASS}
              >
                {INCIDENT_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError message={errors.type} />
            </div>

            <div>
              <label
                htmlFor="severity"
                className="block text-sm font-medium text-slate-700"
              >
                How serious
              </label>
              <select
                id="severity"
                name="severity"
                defaultValue={values.severity}
                className={FIELD_CLASS}
              >
                {SEVERITIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} — {option.description}
                  </option>
                ))}
              </select>
              <FieldError message={errors.severity} />
            </div>
          </div>

          <div>
            <label
              htmlFor="locationText"
              className="block text-sm font-medium text-slate-700"
            >
              Landmark{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="locationText"
              name="locationText"
              type="text"
              maxLength={200}
              defaultValue={values.locationText}
              placeholder="e.g. the lane behind the village hall"
              className={FIELD_CLASS}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              The map pin itself cannot be moved here — file a new report if the
              location was wrong.
            </p>
            <FieldError message={errors.locationText} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SaveButton />
        <Link
          href={`/incidents/${values.id}`}
          className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium text-slate-500 transition hover:text-slate-700"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
