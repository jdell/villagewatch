import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/logo";
import { QrInvite } from "@/components/qr-invite";
import { SiteFooter } from "@/components/site-footer";
import { readJoinCodeParam } from "@/lib/invite";
import { findVillageBySlug } from "@/lib/village";
import { APP_NAME, VILLAGE_STATUS_LABELS } from "@/lib/constants";

/**
 * The printable invite for one village. Public, no account needed.
 *
 * This is the page a coordinator sends to somebody else — the parish clerk, whoever
 * runs the noticeboard, the person with the good printer. They print it, pin it
 * up, and residents scan the code on it. The dashboard has the same QR on it;
 * this exists so that using it does not require being a coordinator.
 *
 * ## Where the join code comes from
 *
 * The query string, and only the query string. `findVillageBySlug` does not
 * select the column, so there is nothing here that could leak it: someone who
 * opens `/invite/bourn-cambridgeshire` with no `?code=` learns the village is on
 * VillageWatch and nothing else. The link a coordinator shares carries the code,
 * which is the same disclosure a printed newsletter makes — and it is why the
 * dashboard says to treat that link the way you would treat the code.
 *
 * `robots: noindex` follows from that. The page is meant to be handed to
 * someone, not found by searching, and a search engine that crawled a shared
 * link would put the code in an index nobody can rotate.
 */

type InvitePageProps = {
  // Next 16: both are Promises.
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ code?: string | string[] }>;
};

export async function generateMetadata({
  params,
}: InvitePageProps): Promise<Metadata> {
  const { slug } = await params;
  const village = await findVillageBySlug(slug);

  return {
    title: village ? `Join ${village.name}` : "Village invite",
    description: village
      ? `Scan the code to join ${village.name} on ${APP_NAME}.`
      : undefined,
    // The URL carries a credential. Do not let it into an index.
    robots: { index: false, follow: false },
  };
}

export default async function InvitePage({
  params,
  searchParams,
}: InvitePageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  const village = await findVillageBySlug(slug);
  if (!village) notFound();

  const joinCode = readJoinCodeParam(query.code);

  return (
    <div className="flex flex-1 flex-col bg-slate-50">
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
        <Link href="/" className="inline-block text-slate-900" data-print-hide>
          <Logo />
        </Link>

        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-slate-900">
          Scan to join {APP_NAME} for {village.name}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          {village.region ? `${village.region}. ` : ""}
          Residents report what they see, personal details are stripped out
          before anyone else reads it, and the map and the alerts do the rest.
        </p>

        {village.status !== "ACTIVE" && (
          <div className="mt-6 flex gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-600/20">
            <ShieldAlert className="size-5 shrink-0 text-amber-600" aria-hidden />
            <div className="text-sm leading-relaxed text-amber-900">
              <p className="font-medium">
                {village.name} is not accepting residents yet
              </p>
              <p className="mt-1">
                Its status is{" "}
                {VILLAGE_STATUS_LABELS[village.status].toLowerCase()}. The code
                below will not work until the village is live — print it once
                your parish council has been told it is.
              </p>
            </div>
          </div>
        )}

        {!joinCode && (
          <div className="mt-6 flex gap-3 rounded-2xl bg-slate-100 p-4 ring-1 ring-inset ring-slate-300">
            <ShieldAlert className="size-5 shrink-0 text-slate-400" aria-hidden />
            <div className="text-sm leading-relaxed text-slate-700">
              <p className="font-medium">This link is missing the join code</p>
              <p className="mt-1">
                The code is part of the invite link your coordinator sends, and
                it is not stored on this page — so the code below will take a
                resident to the right village but they will have to type the code
                in themselves. Ask your coordinator for the full link from their
                dashboard.
              </p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <QrInvite
            slug={village.slug}
            villageName={village.name}
            region={village.region}
            joinCode={joinCode}
            title={`Invite for ${village.name}`}
            hint="Print this sheet for a noticeboard, or download the code to drop into a newsletter."
          />
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" data-print-hide>
          <h2 className="text-sm font-semibold text-slate-900">
            No phone camera to hand?
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            The link works on its own. Open it, create an account, and start
            reporting.
          </p>
          <Link
            href={`/join/${encodeURIComponent(village.slug)}${
              joinCode ? `?code=${encodeURIComponent(joinCode)}` : ""
            }`}
            className="mt-3 inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            Join {village.name}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>

      <div data-print-hide>
        <SiteFooter />
      </div>
    </div>
  );
}
