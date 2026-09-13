"use client";

import { MapPinPlus } from "lucide-react";
import type { VillageInterestRoleValue } from "@/lib/validations";

/**
 * The panel that replaces the account half of `/register` when somebody's
 * village is not in the directory.
 *
 * **Nothing here creates an account**, which is the whole reason it is a panel
 * rather than three more fields. When it is on screen the join code, the two
 * passwords, the address, the home-location map and the terms checkbox are all
 * gone — a person who cannot join a village has nothing to accept terms about,
 * no code to be given and no map to drop a pin on. The submit button says
 * "Register interest" for the same reason: a button labelled "Create account"
 * that creates no account is the kind of thing somebody finds out about from
 * their inbox.
 *
 * ## The fork is the point of the whole feature
 *
 * Residents registering interest are *demand* — useful for telling a parish
 * council that eleven people in their village are waiting. A coordinator
 * candidate is the thing that actually unblocks a launch, because
 * `activateVillage` needs a person to appoint. So the two paths are one radio
 * group rather than a checkbox: it is a question with two answers, and the
 * default is deliberately **neither**.
 *
 * Nothing is preselected. A default of "notify me" would collect a quieter
 * answer than the person meant from anybody who did not read the group, and a
 * default of "I'll coordinate" would collect a louder one — and this is the
 * field an administrator rings somebody up about.
 *
 * ## `Field` is local, and that is the existing pattern rather than a new one
 *
 * `register-form.tsx` and `welcome-form.tsx` already carry a copy each. A third
 * is not an improvement; extracting all three is a refactor of two working
 * forms and does not belong inside a feature branch.
 */

const inputClass =
  "mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 aria-invalid:border-red-400";

function Field({
  name,
  label,
  error,
  hint,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** One path of the fork. */
function RoleChoice({
  value,
  checked,
  onSelect,
  title,
  detail,
}: {
  value: VillageInterestRoleValue;
  checked: boolean;
  onSelect: (value: VillageInterestRoleValue) => void;
  title: string;
  detail: string;
}) {
  return (
    /*
      The whole card is the label, so the description is part of the hit target
      rather than text beside a radio somebody has to aim at. On a phone that is
      the difference between a control that works and one that mostly does.
    */
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-white px-3.5 py-3 transition ${
        checked
          ? "border-brand-500 ring-2 ring-brand-500/20"
          : "border-slate-300 hover:border-slate-400"
      }`}
    >
      <input
        type="radio"
        name="interestRole"
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="mt-0.5 size-4 shrink-0 border-slate-300 text-brand-600 focus:ring-brand-500"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>
      </span>
    </label>
  );
}

export function VillageInterestFields({
  role,
  onRoleChange,
  errors,
}: {
  role: VillageInterestRoleValue | null;
  onRoleChange: (role: VillageInterestRoleValue) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-5 rounded-xl border border-brand-200 bg-brand-50/60 p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        <MapPinPlus className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold text-brand-900">
            We&rsquo;re expanding — tell us where
          </h2>
          <p className="mt-1 text-xs text-brand-800/80">
            We&rsquo;ll record your interest and email you. No account is created
            and nothing is reported until your village is set up.
          </p>
        </div>
      </div>

      <Field
        name="villageName"
        label="Village or town name"
        error={errors.villageName}
      >
        <input
          id="villageName"
          name="villageName"
          type="text"
          autoComplete="address-level2"
          required
          aria-invalid={Boolean(errors.villageName)}
          className={inputClass}
          placeholder="Cottenham"
        />
      </Field>

      <Field name="county" label="County" error={errors.county}>
        <input
          id="county"
          name="county"
          type="text"
          autoComplete="address-level1"
          required
          aria-invalid={Boolean(errors.county)}
          className={inputClass}
          placeholder="Cambridgeshire"
        />
      </Field>

      {/*
        A fieldset rather than a div with a heading: the two cards are one
        question, and a screen reader should say so when it reaches the first of
        them rather than reading two unrelated options.
      */}
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">
          How would you like to help?
        </legend>

        <div className="mt-2 space-y-2">
          <RoleChoice
            value="resident"
            checked={role === "resident"}
            onSelect={onRoleChange}
            title="Notify me when it's available"
            detail="We'll email you when your village goes live"
          />
          <RoleChoice
            value="coordinator-candidate"
            checked={role === "coordinator-candidate"}
            onSelect={onRoleChange}
            title="I want to coordinate my village"
            detail="Lead safety reporting in your community"
          />
        </div>

        {errors.role && (
          <p className="mt-1.5 text-sm text-red-600">{errors.role}</p>
        )}
      </fieldset>

      {/*
        Only on the coordinator path, and optional there.

        It is rendered conditionally rather than hidden with CSS so that the
        value cannot survive a change of mind — a resident who typed a sentence,
        switched back and submitted would otherwise be storing something the
        form had stopped showing them. `villageInterestSchema` drops it on the
        resident path as well, because a component is the wrong place for that
        to be the only guarantee.
      */}
      {role === "coordinator-candidate" && (
        <Field
          name="motivation"
          label="Why are you interested? (optional)"
          error={errors.motivation}
          hint="A sentence is plenty. It helps us know what your village needs."
        >
          <textarea
            id="motivation"
            name="motivation"
            rows={3}
            aria-invalid={Boolean(errors.motivation)}
            className={`${inputClass} resize-y`}
            placeholder="We've had a few break-ins recently and I'd like to get organised."
          />
        </Field>
      )}
    </div>
  );
}
