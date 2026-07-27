import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your VillageWatch account.",
  robots: { index: false, follow: false },
};

/**
 * Where a recovery link lands, after `/api/auth/callback` has exchanged the
 * code for a session.
 *
 * Outside the `(app)` group on purpose. The shell there renders a sidebar and a
 * village name, and this account may have no profile row at all — a Google
 * resident who later set a password, or one whose registration write failed. It
 * also should not be reached with the app chrome around it: this is still part
 * of getting back in, not something you do while signed in and browsing.
 *
 * A session is the whole authorisation. `requireSession()` is deliberately not
 * used, because its redirect to `/login` would tell somebody whose link has
 * expired only that they need to sign in — which is the thing they cannot do.
 */
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const session = await getSession();

  return (
    <div className="flex flex-1 flex-col bg-slate-50">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <Link href="/" className="text-slate-900">
            <Logo />
          </Link>

          {session ? (
            <>
              <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">
                Choose a new password
              </h1>
              <p className="mt-1.5 text-sm text-slate-600">
                You&apos;re signed in as{" "}
                <span className="font-medium text-slate-900">
                  {session.user.email}
                </span>
                . Pick something you have not used elsewhere.
              </p>

              <div className="mt-6">
                <ResetPasswordForm />
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">
                That link has expired
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                Reset links last an hour and can only be used once. Ask for a
                fresh one and it will work — nothing is wrong with your account.
              </p>

              <Link
                href="/forgot-password"
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
              >
                Send a new link
              </Link>

              <Link
                href="/login"
                className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
