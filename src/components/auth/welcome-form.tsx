"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import {
  completeProfileSchema,
  fieldErrors as toFieldErrors,
} from "@/lib/validations";
import type { LocationValue } from "@/components/location-picker";
import type { VillageOption } from "@/components/auth/register-form";
import { HomeLocationField } from "@/components/auth/home-location-field";
import {
  VillageAttribution,
  VillagePicker,
} from "@/components/auth/village-picker";

type WelcomeFormProps = {
  villages: VillageOption[];
  /** From the Google profile, editable — it is often not the neighbourly name. */
  defaultFullName: string;
  /** Verified by the provider and shown read-only; the server uses the session. */
  email: string;
  next: string;
};

const inputClass =
  "mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 aria-invalid:border-red-400";

/** Module scope, not nested — see the note in register-form.tsx. */
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

export function WelcomeForm({
  villages,
  defaultFullName,
  email,
  next,
}: WelcomeFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [villageId, setVillageId] = useState("");
  const [home, setHome] = useState<LocationValue | null>(null);

  const noVillages = villages.length === 0;
  const village = villages.find((option) => option.id === villageId) ?? null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const formData = new FormData(event.currentTarget);
    const parsed = completeProfileSchema.safeParse({
      fullName: formData.get("fullName"),
      villageId: formData.get("villageId"),
      joinCode: formData.get("joinCode") || undefined,
      addressLine: formData.get("addressLine") || undefined,
      phone: formData.get("phone") || undefined,
      // The exact point tapped. The server jitters it before it is stored.
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
      const response = await fetch("/api/auth/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();

      if (!response.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error ?? "Could not finish setting up your account");
        return;
      }

      toast.success("Welcome to your village");
      router.replace(next || result.redirectTo || "/map");
      router.refresh();
    } catch {
      toast.error("Network error — check your connection and try again");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <Field
        name="fullName"
        label="Full name"
        error={errors.fullName}
        hint="How your coordinator will know you. Change it if Google has the wrong one."
      >
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          defaultValue={defaultFullName}
          aria-invalid={Boolean(errors.fullName)}
          className={inputClass}
          placeholder="Jane Fletcher"
        />
      </Field>

      <div>
        <span className="block text-sm font-medium text-slate-700">
          Email address
        </span>
        <p className="mt-1.5 rounded-lg bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600 ring-1 ring-slate-200">
          {email}
        </p>
        <p className="mt-1.5 text-xs text-slate-500">
          Verified by Google. Signing in again always uses this address.
        </p>
      </div>

      <Field
        name="villageId"
        label="Your village"
        error={errors.villageId}
        hint={
          noVillages
            ? "No villages are set up yet — ask your coordinator to add one."
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
        hint="Optional. A code from your coordinator verifies you straight away."
      >
        <input
          id="joinCode"
          name="joinCode"
          type="text"
          autoComplete="off"
          aria-invalid={Boolean(errors.joinCode)}
          className={`${inputClass} font-mono uppercase`}
          placeholder="ABCD-1234"
        />
      </Field>

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

      {/* Shared with /register — see the note on the component. */}
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
        {pending ? "Joining…" : "Join your village"}
      </button>
    </form>
  );
}
