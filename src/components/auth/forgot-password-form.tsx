"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Clock, Loader2, MailCheck, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  fieldErrors as toFieldErrors,
  forgotPasswordSchema,
} from "@/lib/validations";
import {
  isEmailQuotaError,
  rateLimitMessage,
  requestErrorMessage,
  retryAfterSeconds,
  AUTH_RETRY_FALLBACK_SECONDS,
} from "@/lib/auth-errors";
import { cooldownLabel, useAuthSubmit } from "@/components/auth/use-auth-submit";

/**
 * "Send me a reset link."
 *
 * `resetPasswordForEmail` is called from the browser client for the same reason
 * `signInWithOAuth` is: it starts the PKCE flow and stores a code verifier that
 * `/api/auth/callback` has to read back when the link is followed. Run from the
 * server, the verifier would be written on the wrong machine and the exchange
 * would fail with nothing on screen to explain it.
 *
 * The link returns through `/api/auth/callback`, which already exchanges a code
 * for a session and already validates `next` as a relative path. Reusing it
 * means the recovery leg gets that hardening for free rather than growing a
 * second, less careful copy of it.
 */

const inputClass =
  "mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 aria-invalid:border-red-400";

export function ForgotPasswordForm() {
  const submit = useAuthSubmit();
  const [sent, setSent] = useState(false);
  // The sentence, not a flag: it is composed once from whatever the provider
  // said and then left alone. Recomposing it from `submit.cooldown` would have
  // the panel rewrite itself every second, which `role="alert"` re-announces.
  const [quotaNotice, setQuotaNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const formData = new FormData(event.currentTarget);
    const parsed = forgotPasswordSchema.safeParse({
      email: formData.get("email"),
    });

    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }

    if (!submit.begin()) return;

    try {
      const supabase = createClient();
      const callback = new URL("/api/auth/callback", window.location.origin);
      callback.searchParams.set("next", "/reset-password");

      const { error } = await supabase.auth.resetPasswordForEmail(
        parsed.data.email,
        { redirectTo: callback.toString() },
      );

      /*
        Almost nothing here is surfaced to the resident, and the exception is
        chosen narrowly.

        Whether an address has an account is exactly the fact this screen must
        not disclose: a form that says "no account with that email" is an
        account-enumeration oracle, and on a village safety app the membership
        list is itself sensitive — it says who reports on their neighbours.
        Supabase already returns success for an unknown address, so a per-address
        limit — "you can only request this after 47 seconds", which can only be
        reached by an address mail was actually sent to — stays swallowed. It is
        logged, because an operator still needs to know the mail is not going
        out.

        The deployment's hourly email quota is the one thing that is different.
        `isEmailQuotaError` matches only that, and it is a fact about the whole
        deployment rather than about any address on it — the same answer comes
        back for an address that has never been registered, so it discloses
        nothing. Swallowing it is what would be wrong: the resident is told the
        mail is on its way, and it is not, so they wait, then ask again, and
        every attempt goes to the same exhausted quota.
      */
      if (error && isEmailQuotaError(error)) {
        console.error("resetPasswordForEmail hit the email quota", error);
        const seconds = retryAfterSeconds(error);
        submit.hold(seconds ?? AUTH_RETRY_FALLBACK_SECONDS);
        setQuotaNotice(rateLimitMessage("reset-request", seconds));
        return;
      }

      if (error) {
        console.error("resetPasswordForEmail failed", error);
      }

      setSent(true);
    } catch (cause) {
      // A thrown fetch is a genuine network failure rather than a fact about the
      // account, so this one is safe to report.
      toast.error(requestErrorMessage(cause));
    } finally {
      submit.end();
    }
  }

  const waiting = cooldownLabel(submit.cooldown);

  /*
    Shown instead of "check your email", because the email is not coming. It
    names no address and says nothing about whether one has an account — see the
    reasoning in the handler.
  */
  if (quotaNotice) {
    return (
      <div className="space-y-5">
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg bg-amber-50 px-3.5 py-3 ring-1 ring-amber-200"
        >
          <Clock className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm text-amber-900">
            <p className="font-medium">No email was sent</p>
            <p className="mt-1 leading-relaxed">
              {quotaNotice} This is a limit on how many emails VillageWatch can
              send in an hour, not anything to do with your account.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setQuotaNotice(null)}
          disabled={submit.disabled}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {waiting ?? "Try again"}
        </button>

        <Link
          href="/login"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg bg-brand-50 px-3.5 py-3 ring-1 ring-brand-100">
          <MailCheck
            className="mt-0.5 size-5 shrink-0 text-brand-600"
            aria-hidden
          />
          <div className="text-sm text-slate-700">
            <p className="font-medium text-slate-900">Check your email</p>
            <p className="mt-1 leading-relaxed">
              If that address has a VillageWatch account, a link to choose a new
              password is on its way. It expires in an hour, and using it signs
              you in.
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-600">
          Nothing arrived? Check the spam folder, then{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700"
          >
            try a different address
          </button>
          .
        </p>

        <Link
          href="/login"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
          autoFocus
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
          className={inputClass}
          placeholder="you@example.com"
        />
        {errors.email && (
          <p id="email-error" className="mt-1.5 text-sm text-red-600">
            {errors.email}
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
          <Send className="size-4" aria-hidden />
        )}
        {submit.pending ? "Sending…" : (waiting ?? "Send reset link")}
      </button>
    </form>
  );
}
