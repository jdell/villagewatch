"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MapPinPlus, UserPlus } from "lucide-react";
import type { LocationValue } from "@/components/location-picker";
import { HomeLocationField } from "@/components/auth/home-location-field";
import {
  VillageAttribution,
  UNLISTED_VILLAGE_ID,
  VillagePicker,
} from "@/components/auth/village-picker";
import {
  fieldErrors as toFieldErrors,
  registerSchema,
  villageInterestSchema,
  type VillageInterestRoleValue,
} from "@/lib/validations";
import { requestErrorMessage } from "@/lib/auth-errors";
import { cooldownLabel, useAuthSubmit } from "@/components/auth/use-auth-submit";
import { VillageInterestConfirmation } from "@/components/auth/village-interest-confirmation";
import { VillageInterestFields } from "@/components/auth/village-interest-fields";

export type VillageOption = {
  id: string;
  name: string;
  region: string | null;
  /** Where the home-location map opens once this village is chosen. */
  centerLat: number;
  centerLng: number;
  defaultZoom: number;
};

type RegisterFormProps = {
  villages: VillageOption[];
  /**
   * Village and code from an invite link — see `readPrefill` in
   * `src/app/register/page.tsx`. Both are conveniences and neither is trusted:
   * the register route re-checks the code against the database, so a resident
   * who edits them gets the same answer as one who typed them in.
   */
  initialVillageId?: string;
  initialJoinCode?: string;
};

const inputClass =
  "mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 aria-invalid:border-red-400";

/**
 * Defined at module scope, not inside the form. A component declared inside
 * another component is a new type on every render, so React unmounts and
 * remounts it — which loses focus on the input as you type.
 */
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

export function RegisterForm({
  villages,
  initialVillageId = "",
  initialJoinCode = "",
}: RegisterFormProps) {
  const router = useRouter();
  const submit = useAuthSubmit();
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Controlled so the home-location map knows which village to open on. The
  // `<select>` still carries the value into FormData like every other field.
  const [villageId, setVillageId] = useState(initialVillageId);
  const [home, setHome] = useState<LocationValue | null>(null);

  /*
    The interest fork.

    `unlisted` is not a village id and cannot be — `UNLISTED_VILLAGE_ID` is not
    a uuid, so `registerSchema` would refuse it and `checkVillageJoin` would
    never see it. What it does is switch this form between two submissions, and
    everything below keys off it: which fields render, what the button says, and
    which endpoint is called.

    `interestRole` starts null on purpose. Neither path is preselected, because
    this is the field somebody gets rung up about — see the note in
    `village-interest-fields.tsx`.
  */
  const wantsInterest = villageId === UNLISTED_VILLAGE_ID;
  const [interestRole, setInterestRole] =
    useState<VillageInterestRoleValue | null>(null);
  const [registered, setRegistered] = useState<{
    villageName: string;
    isCoordinatorCandidate: boolean;
  } | null>(null);

  const noVillages = villages.length === 0;
  const village = villages.find((option) => option.id === villageId) ?? null;

  /**
   * The unlisted branch: one row, no account.
   *
   * It shares `useAuthSubmit` with the registration path rather than taking its
   * own lock, and that is deliberate — the guard is against a second click in
   * the same frame, which is a property of the *button*, not of the endpoint
   * behind it. Two locks on one button is two ways for it to be half-held.
   *
   * What it does not share is the cooldown's reasoning. A 429 here is not an
   * exhausted email quota, it is somebody having registered five villages in an
   * hour, so the button counts down the same way and the message says something
   * milder.
   */
  async function submitInterest(formData: FormData) {
    const parsed = villageInterestSchema.safeParse({
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      villageName: formData.get("villageName"),
      county: formData.get("county"),
      // From state rather than FormData: the radio group is controlled, and an
      // unanswered group posts no entry at all, which reads as absent rather
      // than as "not chosen yet".
      role: interestRole ?? undefined,
      motivation: formData.get("motivation") || undefined,
    });

    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }

    if (!submit.begin()) return;

    try {
      const response = await fetch("/api/village-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: submit.signal(),
      });
      const result = await response.json();

      if (!response.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error ?? "Could not register your interest");

        if (response.status === 429 && typeof result.retryAfter === "number") {
          submit.hold(result.retryAfter);
        }
        return;
      }

      /*
        The confirmation replaces the form in place rather than redirecting.
        The village name comes back from the server, so the screen says what was
        actually stored after trimming rather than what this browser had.
      */
      setRegistered({
        villageName: result.villageName,
        isCoordinatorCandidate: Boolean(result.isCoordinatorCandidate),
      });
    } catch (cause) {
      toast.error(requestErrorMessage(cause));
    } finally {
      submit.end();
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const formData = new FormData(event.currentTarget);

    if (wantsInterest) {
      await submitInterest(formData);
      return;
    }

    const parsed = registerSchema.safeParse({
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
      villageId: formData.get("villageId"),
      joinCode: formData.get("joinCode") || undefined,
      addressLine: formData.get("addressLine") || undefined,
      phone: formData.get("phone") || undefined,
      // Not a form field — the picker holds it in state. Sent as the exact
      // point tapped; the server jitters it before it is stored.
      homeLat: home?.lat,
      homeLng: home?.lng,
      acceptTerms: formData.get("acceptTerms") === "on",
    });

    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }

    // The lock is taken here rather than by the disabled attribute, which a
    // second click in the same frame gets past. Every press that does get past
    // it on this form is a sign-up email out of the deployment's hourly quota.
    if (!submit.begin()) return;

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: submit.signal(),
      });
      const result = await response.json();

      if (!response.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error ?? "Could not create your account");

        /*
          A 429 holds the button for as long as the server asked. The toast is
          gone in a few seconds and the wait is measured in minutes, so the
          countdown on the button is the part that is still on screen when
          somebody comes back to try again — and pressing through it would
          spend a slot of a quota that is already exhausted.
        */
        if (response.status === 429 && typeof result.retryAfter === "number") {
          submit.hold(result.retryAfter);
        }
        return;
      }

      /*
        The account exists but cannot sign in until the link in Supabase's
        confirmation email is clicked, so what happens next is entirely in
        somebody's inbox — and this is the moment they are least likely to know
        that.

        The message travels in the URL rather than as a toast, and that is the
        fix rather than a refactor. A toast is a few seconds long and this one
        was fired immediately before a redirect, so it was read on the way past
        a page change or not at all; what was left on screen afterwards was an
        ordinary sign-in form, and filling it in produces "Email or password is
        incorrect" — which is what sent people to reset a password that was
        never wrong. `/login` renders the sentence as a panel that is still
        there when they come back from their email.

        `registered=1` is a flag and never the wording: the page prints its own
        copy, so nothing a caller puts in the query string can reach the screen.
      */
      if (result.needsEmailConfirmation) {
        router.replace("/login?registered=1");
        return;
      }

      toast.success("Welcome to your village");
      router.replace(result.redirectTo ?? "/map");
      router.refresh();
    } catch (cause) {
      toast.error(requestErrorMessage(cause));
    } finally {
      submit.end();
    }
  }

  const waiting = cooldownLabel(submit.cooldown);

  if (registered) {
    return (
      <VillageInterestConfirmation
        villageName={registered.villageName}
        isCoordinatorCandidate={registered.isCoordinatorCandidate}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <Field name="fullName" label="Full name" error={errors.fullName}>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          aria-invalid={Boolean(errors.fullName)}
          className={inputClass}
          placeholder="Jane Fletcher"
        />
      </Field>

      <Field name="email" label="Email address" error={errors.email}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(errors.email)}
          className={inputClass}
          placeholder="you@example.com"
        />
      </Field>

      <Field
        name="villageId"
        label="Your village"
        error={errors.villageId}
        hint={
          wantsInterest
            ? "We'll record your interest and email you — no account is created."
            : noVillages
              ? "No villages are set up yet — choose the last option to register interest."
              : "Reports you file are only visible inside this village."
        }
      >
        <VillagePicker
          villages={villages}
          value={villageId}
          onChange={(id) => {
            setVillageId(id);
            // A pin dropped on one village's map means nothing on another's.
            setHome(null);
          }}
          invalid={Boolean(errors.villageId)}
        />
        <VillageAttribution />
      </Field>

      {/*
        Everything from here to the terms checkbox is the *account* half of this
        form, and none of it means anything for a village that does not exist:
        no code to be given, no password for an account nobody is creating, no
        map to drop a pin on, and no terms to accept about reports that cannot
        be filed. It is unmounted rather than hidden, so a stale password or a
        home location cannot ride along in a submission that has stopped asking
        for them.
      */}
      {wantsInterest ? (
        <VillageInterestFields
          role={interestRole}
          onRoleChange={setInterestRole}
          errors={errors}
        />
      ) : (
      <>
      <Field
        name="joinCode"
        label="Join code"
        error={errors.joinCode}
        hint={
          initialJoinCode
            ? "Filled in from your invite link. Check it matches the code you were given."
            : // Not "optional" any more, and the change is the point: a village
              // that has a code requires it. Left un-starred rather than marked
              // required because the handful of villages set up before codes
              // existed have none to give, and this form cannot tell which is
              // which — the server can, and says so in this field.
              "Ask your coordinator, or use the link they sent you. Your village needs it to let you in."
        }
      >
        <input
          id="joinCode"
          name="joinCode"
          type="text"
          autoComplete="off"
          // Uncontrolled with a default: the invite fills it in and the resident
          // is free to correct it, which is the whole point of showing it rather
          // than posting it invisibly.
          defaultValue={initialJoinCode}
          aria-invalid={Boolean(errors.joinCode)}
          className={`${inputClass} font-mono uppercase`}
          placeholder="ABCD-1234"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          name="password"
          label="Password"
          error={errors.password}
          hint="At least 10 characters"
        >
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(errors.password)}
            className={inputClass}
          />
        </Field>

        <Field
          name="confirmPassword"
          label="Confirm password"
          error={errors.confirmPassword}
        >
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(errors.confirmPassword)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        name="addressLine"
        label="Street or address"
        error={errors.addressLine}
        hint="Optional. Helps your coordinator verify you actually live here — never shown to other residents."
      >
        <input
          id="addressLine"
          name="addressLine"
          type="text"
          autoComplete="street-address"
          aria-invalid={Boolean(errors.addressLine)}
          className={inputClass}
          placeholder="14 Mill Lane"
        />
      </Field>

      {/*
        Optional, and worth the space it takes: without a home location every
        resident falls into the village-wide audience, so the notification
        radius Day 4 built has nothing to measure from. Shared with /welcome —
        both screens write the same two columns and must make the same promise
        about them.
      */}
      <HomeLocationField
        village={village}
        value={home}
        onChange={setHome}
        error={errors.homeLat}
      />

      <div>
        <label className="flex items-start gap-3">
          <input
            id="acceptTerms"
            name="acceptTerms"
            type="checkbox"
            className="mt-0.5 size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-slate-600">
            I agree to the{" "}
            <Link
              href="/terms"
              target="_blank"
              className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700"
            >
              terms of use
            </Link>{" "}
            and the{" "}
            <Link
              href="/privacy"
              target="_blank"
              className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700"
            >
              privacy policy
            </Link>
            , and understand that my reports are shared with my village and its
            coordinators.
          </span>
        </label>
        {errors.acceptTerms && (
          <p className="mt-1.5 text-sm text-red-600">{errors.acceptTerms}</p>
        )}
      </div>
      </>
      )}

      <button
        type="submit"
        disabled={submit.disabled}
        aria-busy={submit.pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submit.pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : wantsInterest ? (
          <MapPinPlus className="size-4" aria-hidden />
        ) : (
          <UserPlus className="size-4" aria-hidden />
        )}
        {/*
          The label is the promise. A button reading "Create account" that
          creates no account is something somebody finds out about from their
          inbox — see the wireframe, which makes the change of wording the
          visible signal that the form has changed what it does.
        */}
        {submit.pending
          ? wantsInterest
            ? "Registering…"
            : "Creating account…"
          : (waiting ?? (wantsInterest ? "Register interest" : "Create account"))}
      </button>
    </form>
  );
}
