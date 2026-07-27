import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/logo";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Get a link to choose a new VillageWatch password.",
  // A recovery screen has no business in a search index.
  robots: { index: false, follow: false },
};

/**
 * Requesting a password reset link.
 *
 * Outside the `(app)` group, like `/login` and `/welcome`: somebody who cannot
 * remember their password has no session, and the authenticated shell has
 * nothing to render for them.
 *
 * `/login` has linked here since the sign-in form was written; until now the
 * route did not exist and the link was a 404, which is a locked-out resident
 * with nowhere to go.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-1 flex-col bg-slate-50">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 self-start text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to sign in
        </Link>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <Link href="/" className="text-slate-900">
            <Logo />
          </Link>

          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">
            Forgotten your password?
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Put in the address you signed up with and we&apos;ll email you a link
            to choose a new one.
          </p>

          {!isSupabaseConfigured ? (
            <p className="mt-5 rounded-lg bg-amber-50 px-3.5 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              Authentication is not configured on this deployment, so no email
              can be sent. Set{" "}
              <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
              and{" "}
              <code className="font-mono text-xs">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>{" "}
              in <code className="font-mono text-xs">.env.local</code>.
            </p>
          ) : (
            <div className="mt-6">
              <ForgotPasswordForm />
            </div>
          )}
        </div>

        {/*
          Only password accounts have a password to reset. Somebody who signed up
          with Google and lands here would otherwise wait for an email that
          resets a credential they never had.
        */}
        <p className="mt-6 text-center text-sm text-slate-600">
          Signed up with Google? Nothing to reset —{" "}
          <Link
            href="/login"
            className="font-semibold text-brand-600 hover:text-brand-700"
          >
            use the Google button
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
