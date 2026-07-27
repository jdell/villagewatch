"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import {
  COORDINATOR_APPLICANT_ROLES,
  COORDINATOR_REASON_MIN_CHARS,
} from "@/lib/constants";
import {
  applyForCoordinatorAction,
  type CoordinatorApplyState,
} from "@/app/(app)/coordinator-apply/actions";

/**
 * The coordinator application.
 *
 * A Client Component for one reason: "Something else" reveals a follow-up
 * field, and that is a piece of state. Everything else is a plain form posting
 * to a server action, the same shape as `settings-form.tsx` — no react-hook-form
 * here, because there are three fields and no cross-field arithmetic.
 *
 * The village is rendered read-only from the session profile. There is no
 * village input, hidden or otherwise: a village id in this payload would be a
 * way to apply to coordinate somebody else's village, so the server reads it
 * from the profile and ignores anything sent (domain rule 4).
 */

export type CoordinatorApplyFormProps = {
  villageName: string;
  applicantName: string;
};

const IDLE: CoordinatorApplyState = { ok: true, message: "" };

const FIELD_CLASS =
  "mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Send application
    </button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-sm text-red-600">{message}</p>;
}

export function CoordinatorApplyForm({
  villageName,
  applicantName,
}: CoordinatorApplyFormProps) {
  const [state, apply] = useActionState(applyForCoordinatorAction, IDLE);
  const [role, setRole] = useState<string>(COORDINATOR_APPLICANT_ROLES[0].value);

  useEffect(() => {
    if (!state.message || state.ok) return;
    toast.error(state.message);
  }, [state]);

  const errors = state.fieldErrors ?? {};
  const needsDetail = COORDINATOR_APPLICANT_ROLES.some(
    (option) => option.value === role && option.needsDetail,
  );

  return (
    <form action={apply} className="mt-6 space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">
          How you are involved
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          This is context for the administrator reading your application. It does
          not grant anything on its own.
        </p>

        <fieldset className="mt-4">
          <legend className="sr-only">Your role in the village</legend>

          <div className="space-y-2">
            {COORDINATOR_APPLICANT_ROLES.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
                  role === option.value
                    ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/20"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={option.value}
                  checked={role === option.value}
                  onChange={() => setRole(option.value)}
                  className="mt-0.5 size-4 shrink-0 border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/20"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-sm text-slate-500">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <FieldError message={errors.role} />
        </fieldset>

        {/*
          Rendered rather than merely hidden when another option is chosen: an
          input that is display:none still posts its value, and a stale
          "Something else" answer sitting under "Parish councillor" would be
          read by the reviewer as if the applicant had written it there.
        */}
        {needsDetail && (
          <div className="mt-4">
            <label
              htmlFor="roleDetail"
              className="block text-sm font-medium text-slate-700"
            >
              Tell us how
            </label>
            <input
              id="roleDetail"
              name="roleDetail"
              type="text"
              maxLength={200}
              placeholder="e.g. I chair the village hall committee"
              className={FIELD_CLASS}
            />
            <FieldError message={errors.roleDetail} />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <label
          htmlFor="reason"
          className="block text-base font-semibold text-slate-900"
        >
          Why do you want coordinator access?
        </label>
        <p className="mt-1 text-sm text-slate-500">
          A few sentences is plenty. Say what you would do with it and how the
          village knows you.
        </p>

        <textarea
          id="reason"
          name="reason"
          rows={6}
          required
          minLength={COORDINATOR_REASON_MIN_CHARS}
          maxLength={2000}
          className={FIELD_CLASS}
        />
        <FieldError message={errors.reason} />
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <ShieldAlert className="size-4" aria-hidden />
          What you are asking for
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-900/90">
          Coordinators can view raw incident descriptions and approve or reject
          reports. Your application will be reviewed by a platform administrator.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-amber-900/90">
          The raw description is what the reporter actually typed, before the
          personal details were taken out — names, registrations, house numbers.
          Every time a coordinator reads one it is written to the audit trail
          with their name and the time against it.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />
        <Link
          href="/settings"
          className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Cancel
        </Link>
      </div>

      <p className="text-xs text-slate-500">
        Applying as {applicantName} for {villageName}.
      </p>
    </form>
  );
}
