import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin, ShieldAlert, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { readJoinCodeParam } from "@/lib/invite";
import { findVillageBySlug } from "@/lib/village";
import { APP_NAME, VILLAGE_STATUS_LABELS } from "@/lib/constants";

/**
 * Where a scanned invite QR lands. Public, no account needed.
 *
 * One screen between the camera and the registration form, and it exists for
 * two reasons. A resident who has just pointed their phone at a poster is
 * entitled to see which village they are about to join before they are asked for
 * a password — a QR code is not readable by a human, so this is the first chance
 * anybody has had to check. And a village that is not `ACTIVE` has to be able to
 * say so here, rather than after four filled-in fields.
 *
 * From here the CTA hands `/register` the village and the code as query
 * parameters, which is all the prefill is: the form fills those two fields in and
 * the resident does the rest. **Nothing about standing is decided by them** —
 * `POST /api/auth/register` re-checks the code against the database through
 * `checkVillageJoin`, so a hand-edited URL buys exactly nothing (domain rule 5).
 *
 * The code is read out of the request and never out of the village row; see
 * `findVillageBySlug`. `noindex` for the reason `/invite/[slug]` carries it: the
 * URL holds a credential.
 */

type JoinPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ code?: string | string[] }>;
};

export async function generateMetadata({
  params,
}: JoinPageProps): Promise<Metadata> {
  const { slug } = await params;
  const village = await findVillageBySlug(slug);

  return {
    title: village ? `Join ${village.name}` : "Join your village",
    robots: { index: false, follow: false },
  };
}

export default async function JoinPage({ params, searchParams }: JoinPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  const village = await findVillageBySlug(slug);
  if (!village) notFound();

  const joinCode = readJoinCodeParam(query.code);
  const live = village.status === "ACTIVE";

  const registerHref = `/register?village=${encodeURIComponent(village.id)}${
    joinCode ? `&code=${encodeURIComponent(joinCode)}` : ""
  }`;

  return (
    <div className="flex flex-1 flex-col bg-slate-50">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <Link href="/" className="inline-block text-slate-900">
            <Logo />
          </Link>

          <p className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-100">
            <MapPin className="size-3.5" aria-hidden />
            Village invite
          </p>

          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            Join {village.name}
          </h1>
          {village.region && (
            <p className="mt-1 text-sm text-slate-500">{village.region}</p>
          )}

          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            You have been invited to {village.name} on {APP_NAME}. Reports you
            file stay inside the village, and personal details are stripped out
            before anyone else reads them.
          </p>

          {!live && (
            <div className="mt-5 flex gap-3 rounded-xl bg-amber-50 p-3.5 ring-1 ring-inset ring-amber-600/20">
              <ShieldAlert
                className="size-5 shrink-0 text-amber-600"
                aria-hidden
              />
              <div className="text-sm leading-relaxed text-amber-900">
                <p className="font-medium">
                  This village is not accepting residents yet
                </p>
                <p className="mt-1">
                  {village.name} is{" "}
                  {VILLAGE_STATUS_LABELS[village.status].toLowerCase()} on{" "}
                  {APP_NAME}. Your parish council can ask for it to be activated
                  — until then there is nothing to sign up to.
                </p>
              </div>
            </div>
          )}

          {live && joinCode && (
            <div className="mt-5 flex gap-3 rounded-xl bg-safe-50 p-3.5 ring-1 ring-inset ring-safe-600/20">
              <ShieldCheck
                className="size-5 shrink-0 text-safe-600"
                aria-hidden
              />
              <div className="text-sm leading-relaxed text-safe-900">
                <p className="font-medium">
                  Your join code is{" "}
                  <span className="font-mono tracking-widest">{joinCode}</span>
                </p>
                <p className="mt-1">
                  It is filled in for you on the next screen. A correct code is
                  what marks you as a verified resident of {village.name}.
                </p>
              </div>
            </div>
          )}

          {live && !joinCode && (
            <p className="mt-5 rounded-xl bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-600 ring-1 ring-inset ring-slate-200">
              This link came without a join code. You can still create an
              account, but you will need the code from your coordinator to
              finish — it is on the invite they printed or sent.
            </p>
          )}

          {live && (
            <Link
              href={registerHref}
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              Create your account
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
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

      <SiteFooter />
    </div>
  );
}
