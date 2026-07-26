import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/logo";
import {
  RegisterForm,
  type VillageOption,
} from "@/components/auth/register-form";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { isGoogleAuthEnabled, isSupabaseConfigured } from "@/lib/supabase/env";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Create an account",
  description:
    "Join your village on VillageWatch and start reporting what you see.",
};

/**
 * Village list is read at request time so a newly approved village shows up
 * without a redeploy.
 */
export const dynamic = "force-dynamic";

async function getVillages(): Promise<VillageOption[]> {
  // Day 1: the database may not be configured yet. Render the form regardless.
  if (!process.env.DATABASE_URL) return [];

  // The map centre comes down with each village so the home-location picker
  // can open on the right place the moment one is chosen, without a second
  // round trip.
  return prisma.village.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      region: true,
      centerLat: true,
      centerLng: true,
      defaultZoom: true,
    },
    orderBy: { name: "asc" },
  });
}

export default async function RegisterPage() {
  const villages = await getVillages();

  return (
    <div className="flex flex-1 flex-col bg-slate-50">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-12 sm:px-6">
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
            Join your village
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Your reports stay inside your village, and personal details are
            stripped out before anyone else sees them.
          </p>

          {!isSupabaseConfigured && (
            <p className="mt-5 rounded-lg bg-amber-50 px-3.5 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              Supabase is not configured yet. Fill in the values from{" "}
              <code className="font-mono text-xs">.env.example</code> before
              creating accounts.
            </p>
          )}

          {/*
            Google first, and the same button as the sign-in screen: the
            provider cannot tell a new resident from a returning one, and nor
            should this screen pretend to. Whichever it turns out to be is
            decided in /api/auth/callback, against our own database.
          */}
          {isGoogleAuthEnabled && (
            <div className="mt-6 space-y-5">
              <GoogleButton label="Continue with Google" />
              <AuthDivider />
            </div>
          )}

          <div className="mt-6">
            <RegisterForm villages={villages} />
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-brand-600 hover:text-brand-700"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
