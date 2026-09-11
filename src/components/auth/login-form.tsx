"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, LogIn, MailCheck } from "lucide-react";
import { fieldErrors as toFieldErrors, loginSchema } from "@/lib/validations";
import { requestErrorMessage } from "@/lib/auth-errors";
import { cooldownLabel, useAuthSubmit } from "@/components/auth/use-auth-submit";

type LoginFormProps = {
  /** Where to send the user after a successful sign-in. */
  next: string;
};

export function LoginForm({ next }: LoginFormProps) {
  const router = useRouter();
  const submit = useAuthSubmit();
  const [errors, setErrors] = useState<Record<string, string>>({});
  /**
   * The one failure that gets a panel rather than a toast.
   *
   * Everything else this form can say is either about a field, or is a thing
   * that has already passed by the time it is read — a wrong password, a rate
   * limit that counts itself down on the button. "Go and read your email" is
   * different: acting on it means leaving this tab, coming back, and needing
   * the sentence to still be there. A toast is four seconds long, which is
   * roughly the worst possible lifetime for an instruction whose whole point
   * is that it survives a trip to somebody's inbox.
   *
   * Held as the sentence rather than a flag so the server owns the wording —
   * `EMAIL_NOT_CONFIRMED_MESSAGE` in `src/lib/auth-errors.ts` is where it is
   * written, and a copy here would be a second one to keep in step.
   */
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setVerifyNotice(null);

    const formData = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      next,
    });

    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }

    if (!submit.begin()) return;

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: submit.signal(),
      });
      const result = await response.json();

      if (!response.ok) {
        setErrors(result.fieldErrors ?? {});

        /*
          Matched on the code rather than on the sentence. The wording is a
          constant on the server and is the sort of thing somebody improves;
          a form that recognised it by string comparison would silently fall
          back to a red toast the day a full stop moved.
        */
        if (result.code === "email_not_confirmed") {
          setVerifyNotice(result.error ?? "Please verify your email address first.");
          return;
        }

        toast.error(result.error ?? "Could not sign you in");

        // Only ever set by a 429. A cooldown on a mistyped password would be
        // this form punishing somebody for a typo.
        if (response.status === 429 && typeof result.retryAfter === "number") {
          submit.hold(result.retryAfter);
        }
        return;
      }

      router.replace(result.redirectTo ?? next);
      router.refresh();
    } catch (cause) {
      toast.error(requestErrorMessage(cause));
    } finally {
      submit.end();
    }
  }

  const waiting = cooldownLabel(submit.cooldown);

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/*
        `role="status"` rather than `role="alert"`: nothing has gone wrong and
        nothing was lost — the account exists and the password was right. Alert
        interrupts a screen reader mid-sentence, which is the register the red
        panel above the Google button uses for a failed provider round trip.
      */}
      {verifyNotice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg bg-brand-50 px-3.5 py-3 ring-1 ring-brand-100"
        >
          <MailCheck
            className="mt-0.5 size-5 shrink-0 text-brand-600"
            aria-hidden
          />
          <div className="text-sm text-slate-700">
            <p className="font-medium text-slate-900">
              Your account is not verified yet
            </p>
            <p className="mt-1 leading-relaxed">{verifyNotice}</p>
          </div>
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-slate-700"
        >
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
          className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 aria-invalid:border-red-400"
          placeholder="you@example.com"
        />
        {errors.email && (
          <p id="email-error" className="mt-1.5 text-sm text-red-600">
            {errors.email}
          </p>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-700"
          >
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Forgot?
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "password-error" : undefined}
          className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 aria-invalid:border-red-400"
        />
        {errors.password && (
          <p id="password-error" className="mt-1.5 text-sm text-red-600">
            {errors.password}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={submit.disabled}
        aria-busy={submit.pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submit.pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <LogIn className="size-4" aria-hidden />
        )}
        {submit.pending ? "Signing in…" : (waiting ?? "Sign in")}
      </button>
    </form>
  );
}
