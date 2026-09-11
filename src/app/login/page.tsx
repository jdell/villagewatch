import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { LoginForm } from "@/components/auth/login-form";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { isGoogleAuthEnabled, isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to VillageWatch to see your village's incident map, file a report or review the moderation queue.",
  alternates: { canonical: "/login" },
  openGraph: { url: "/login", title: "Sign in" },
};

/** Next.js 16: `searchParams` is a Promise and must be awaited. */
type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
    error?: string;
    /** "1" when `/register` has just sent somebody here to confirm. */
    registered?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, error, registered } = await searchParams;

  // Only accept relative paths — an absolute URL here would be an open redirect.
  const redirectTo =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/map";

  return (
    <div className="flex flex-1 flex-col bg-slate-50">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 self-start text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to home
        </Link>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <Link href="/" className="text-slate-900">
            <Logo />
          </Link>

          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Sign in to see what&apos;s happening in your village.
          </p>

          {!isSupabaseConfigured && (
            <p className="mt-5 rounded-lg bg-amber-50 px-3.5 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              Supabase is not configured yet. Set{" "}
              <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
              and{" "}
              <code className="font-mono text-xs">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>{" "}
              in <code className="font-mono text-xs">.env.local</code> before
              signing in.
            </p>
          )}

          {/*
            Set by the register form after a sign-up that needs confirming.

            **The flag decides whether to render; the sentence is written here.**
            The `error` panel below echoes its parameter because the callback has
            things to say that this page cannot enumerate; this one has exactly
            one thing to say, so taking the wording from the query string would
            hand a stranger a sentence on VillageWatch's sign-in page for the
            price of a link — which is how a link in a forwarded message comes to
            say "your account is locked, ring this number".

            It is a panel rather than the toast this used to be because it has to
            survive the errand it describes: somebody reads it, leaves for their
            email, and comes back to this tab.
          */}
          {registered === "1" && (
            <div
              role="status"
              className="mt-5 flex items-start gap-3 rounded-lg bg-brand-50 px-3.5 py-3 ring-1 ring-brand-100"
            >
              <MailCheck
                className="mt-0.5 size-5 shrink-0 text-brand-600"
                aria-hidden
              />
              <div className="text-sm text-slate-700">
                <p className="font-medium text-slate-900">
                  Your account has been created
                </p>
                <p className="mt-1 leading-relaxed">
                  Check your email to verify your account before logging in. The
                  link is in a message from VillageWatch — if it is not there,
                  look in your spam folder.
                </p>
              </div>
            </div>
          )}

          {/*
            Set by /api/auth/callback when a provider round trip fails — a
            cancelled consent screen, or a provider that is not switched on.
            Rendered as text, never as markup: it arrives in a query string.
          */}
          {error && (
            <p
              role="alert"
              className="mt-5 rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-800 ring-1 ring-red-200"
            >
              {error}
            </p>
          )}

          {isGoogleAuthEnabled && (
            <div className="mt-6 space-y-5">
              <GoogleButton next={redirectTo} label="Sign in with Google" />
              <AuthDivider />
            </div>
          )}

          <div className="mt-6">
            <LoginForm next={redirectTo} />
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-slate-600">
          New here?{" "}
          <Link
            href="/register"
            className="font-semibold text-brand-600 hover:text-brand-700"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
