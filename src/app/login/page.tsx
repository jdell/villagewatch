import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/logo";
import { LoginForm } from "@/components/auth/login-form";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { isGoogleAuthEnabled, isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your VillageWatch account.",
};

/** Next.js 16: `searchParams` is a Promise and must be awaited. */
type LoginPageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, error } = await searchParams;

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
