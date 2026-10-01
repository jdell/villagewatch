"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2, Mail, Send } from "lucide-react";
import {
  savePoliceReportAction,
  sendPoliceReportNowAction,
  type PoliceReportState,
} from "@/app/(app)/dashboard/actions";
import { POLICE_REPORT_SCHEDULES, type PoliceReportSchedule } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";

/**
 * The scheduled report to the village's police contact.
 *
 * Two forms, because they are two acts: saving the address and the schedule
 * (audited as a setting change), and sending the report now (audited as a
 * report produced). "Send now" uses the **saved** address only — it is
 * disabled while the field holds an unsaved change, so a coordinator cannot
 * send to an address that was never recorded anywhere.
 *
 * What the copy has to say before anything is saved: the report is the same
 * document a coordinator already sends by hand, counted rather than written by
 * AI, and it goes without anybody pressing a button each time.
 */

const IDLE: PoliceReportState = { ok: true, message: "" };

const inputClass =
  "mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 aria-invalid:border-red-400";

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Save report schedule
    </button>
  );
}

function SendNowButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Send className="size-4" aria-hidden />
      )}
      Send now
    </button>
  );
}

export function PoliceReportForm({
  available,
  schedule,
  email,
  lastSentAt,
}: {
  /** False when the columns do not exist yet — the migration has not run. */
  available: boolean;
  schedule: PoliceReportSchedule | null;
  email: string | null;
  lastSentAt: string | null;
}) {
  const [saved, save] = useActionState(savePoliceReportAction, IDLE);
  const [sent, sendNow] = useActionState(sendPoliceReportNowAction, IDLE);

  const [scheduleValue, setScheduleValue] = useState<string>(schedule ?? "off");
  const [emailValue, setEmailValue] = useState(email ?? "");

  useEffect(() => {
    if (!saved.message || saved.fieldErrors) return;
    if (saved.ok) toast.success(saved.message);
    else toast.error(saved.message);
  }, [saved]);

  useEffect(() => {
    if (!sent.message) return;
    if (sent.ok) toast.success(sent.message);
    else toast.error(sent.message);
  }, [sent]);

  const dirty =
    scheduleValue !== (schedule ?? "off") ||
    emailValue.trim().toLowerCase() !== (email ?? "");

  const emailError = saved.fieldErrors?.email;

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Mail className="size-4 text-slate-400" aria-hidden />
        Report to your police contact
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Email the community safety report to your PCSO on a schedule — the same
        report you can send by hand from Reports.
      </p>

      {!available ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-3.5 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
          Not ready on this deployment yet. The database needs updating before
          scheduled reports can be set up — whoever runs VillageWatch for you can
          do that.
        </p>
      ) : (
        <>
          <form action={save} className="mt-4 space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="police-report-email"
                  className="block text-sm font-medium text-slate-700"
                >
                  Police contact&rsquo;s email
                </label>
                <input
                  id="police-report-email"
                  name="email"
                  type="email"
                  autoComplete="off"
                  value={emailValue}
                  onChange={(event) => setEmailValue(event.target.value)}
                  placeholder="pcso.name@police.uk"
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={
                    emailError ? "police-report-email-error" : "police-report-email-hint"
                  }
                  className={inputClass}
                />
                {emailError ? (
                  <p
                    id="police-report-email-error"
                    role="alert"
                    className="mt-1.5 text-sm text-red-600"
                  >
                    {emailError}
                  </p>
                ) : (
                  <p
                    id="police-report-email-hint"
                    className="mt-1.5 text-xs text-slate-500"
                  >
                    Usually your PCSO&rsquo;s police.uk address.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="police-report-schedule"
                  className="block text-sm font-medium text-slate-700"
                >
                  How often
                </label>
                <select
                  id="police-report-schedule"
                  name="schedule"
                  value={scheduleValue}
                  onChange={(event) => setScheduleValue(event.target.value)}
                  className={inputClass}
                >
                  <option value="off">Off</option>
                  {POLICE_REPORT_SCHEDULES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} — the last {option.days} days
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="rounded-xl bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600 ring-1 ring-inset ring-slate-200">
              The report holds only what your neighbours can already see on the
              map — published reports, anonymised — and its summary is counted
              from the figures, not written by AI. Once a schedule is set it goes
              without anyone pressing a button, so check the address.
            </p>

            <SaveButton dirty={dirty} />
          </form>

          <form
            action={sendNow}
            className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4"
          >
            <SendNowButton disabled={!email || dirty} />
            <p className="text-xs text-slate-500" aria-live="polite">
              {!email
                ? "Save an address first."
                : dirty
                  ? "Save your changes first — Send now uses the saved address."
                  : lastSentAt
                    ? `Last sent ${formatDateTime(lastSentAt)}, to ${email}.`
                    : `Not sent yet. Goes to ${email}.`}
            </p>
          </form>
        </>
      )}
    </section>
  );
}
