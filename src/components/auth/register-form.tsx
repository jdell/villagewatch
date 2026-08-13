"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import type { LocationValue } from "@/components/location-picker";
import { HomeLocationField } from "@/components/auth/home-location-field";
import {
  VillageAttribution,
  VillagePicker,
} from "@/components/auth/village-picker";
import { fieldErrors as toFieldErrors, registerSchema } from "@/lib/validations";

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
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Controlled so the home-location map knows which village to open on. The
  // `<select>` still carries the value into FormData like every other field.
  const [villageId, setVillageId] = useState(initialVillageId);
  const [home, setHome] = useState<LocationValue | null>(null);

  const noVillages = villages.length === 0;
  const village = villages.find((option) => option.id === villageId) ?? null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const formData = new FormData(event.currentTarget);
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

    setPending(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();

      if (!response.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error ?? "Could not create your account");
        return;
      }

      if (result.needsEmailConfirmation) {
        toast.success("Check your email to confirm your account");
        router.replace("/login");
        return;
      }

      toast.success("Welcome to your village");
      router.replace(result.redirectTo ?? "/map");
      router.refresh();
    } catch {
      toast.error("Network error — check your connection and try again");
    } finally {
      setPending(false);
    }
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
          noVillages
            ? "No villages are set up yet — seed the database to populate this list."
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

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <UserPlus className="size-4" aria-hidden />
        )}
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
