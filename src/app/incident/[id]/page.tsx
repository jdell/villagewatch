import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Camera,
  Lock,
  MapPin,
  MessageSquarePlus,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { IncidentTypeIcon } from "@/components/incident-type-icon";
import { Logo } from "@/components/logo";
import { SeverityBadge } from "@/components/severity-badge";
import { SiteFooter } from "@/components/site-footer";
import {
  getCommunityStats,
  getPublicIncidentPreview,
  type CommunityStats,
} from "@/lib/public-incident";
import { publicIncidentPath } from "@/lib/format-alert";
import { APP_NAME, INCIDENT_TYPE_LABELS } from "@/lib/constants";
import { formatDate, formatTimeAgo } from "@/lib/format";

/**
 * The public teaser for one published report — the page a link pasted into a
 * village WhatsApp group lands on.
 *
 * ## Why it is `/incident/[id]` and not `/incidents/[id]`
 *
 * The plural is the authenticated detail page, it is in `PROTECTED_ROUTES`, and
 * two pages cannot serve one path — a route group like `(app)` does not change
 * the URL. Making the existing page public was never the alternative either: it
 * renders the full description, the landmark, the map pin, the media and the
 * vote buttons, which is everything this page exists to withhold.
 *
 * The singular is public for free rather than by exception. `isProtected` in
 * `src/proxy.ts` tests a path against `PROTECTED_ROUTES` by exact match or by
 * the route plus a trailing slash, and `/incident/…` satisfies neither against
 * `/incidents` — so **no proxy change was needed**, and adding one would have
 * meant an exception carved into a denylist that is otherwise a straight prefix
 * match. The same is true of `robots.ts`, whose `/incidents` disallow does not
 * cover this path either.
 *
 * ## What is on it
 *
 * The category, how serious it was, roughly when, which village, and the first
 * line of the anonymised description. Not the title, the landmark, the
 * coordinates, the reference or the pattern note — `src/lib/public-incident.ts`
 * is where the reasoning for each omission lives, and where the decision to
 * include a description extract is argued.
 *
 * Everything held back is doing two jobs at once and they happen to agree: it
 * is what keeps a report from identifying somebody to the open internet, and it
 * is also the conversion argument. The extract says what kind of thing
 * happened; an account says where, to whom, and what else has happened nearby.
 *
 * ## `noindex`, and why the metadata is still worth writing
 *
 * A UUID is unguessable, so in practice this page is *unlisted* — public to
 * whoever was handed the link, which is a modest extension of the coordinator
 * sharing an alert that `/privacy` §6 already describes. Indexing it would be a
 * different thing entirely: every published report in every village becomes a
 * discoverable, searchable record, automatically, with no coordinator deciding
 * each time. So `robots` says no and the Open Graph tags are complete, which is
 * the combination that serves the actual use case — a card in WhatsApp — without
 * putting "Burglary reported near <village>" into a search index that outlives
 * the twelve-month archive.
 *
 * It is deliberately **not** added to `robots.txt` beside `/join/` and
 * `/invite/`. A disallow there asks the link-preview crawlers not to fetch the
 * page at all, and a card that never renders is the one failure this page
 * cannot afford. `follow: true` for the same reason the tags are written: the
 * links out of here point at `/register`.
 */

type PageProps = { params: Promise<{ id: string }> };

/**
 * `force-dynamic` for the reason the six pages in the CSP note carry it: a page
 * built before the request has no nonce to stamp on Next's own bootstrap
 * script, and `'strict-dynamic'` blocks it — HTML arrives, React never
 * hydrates, and nothing in a server log says so. The counters are per-request
 * anyway, so there was nothing to cache.
 */
export const dynamic = "force-dynamic";

/**
 * One lookup per request, shared by `generateMetadata` and the page.
 *
 * Both need the same row, and without this they each run the query — two
 * identical round trips for every visit, on the one page in the app most likely
 * to be opened by four hundred people in the minute after a link is pasted.
 * `cache` from React dedupes for the life of a single request and nothing
 * longer, which is what this wants: the counters beside it are per-request too.
 */
const loadPreview = cache(getPublicIncidentPreview);

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const preview = await loadPreview(id);

  /**
   * Raised here as well as in the page body, and what it buys is the *title*
   * rather than the status.
   *
   * **This route answers a missing report with `200`, not `404`, and that is
   * documented Next behaviour rather than a bug here.** A streamed response has
   * already sent its headers by the time `notFound()` is reached, so the status
   * cannot be taken back; Next's own `not-found` reference says it returns "200
   * for streamed responses, and 404 for non-streamed", and injects
   * `<meta name="robots" content="noindex">` into the streamed HTML so the URL
   * is not indexed anyway. Measured across all four combinations —
   * with and without `loading.tsx`, with and without this call — every one
   * returns 200, because the page suspends on the database read whatever else
   * is present. Removing the skeleton does not change it.
   *
   * The one way to a real 404 is to know the id is dead *before* the body
   * streams, which means a database lookup inside `src/proxy.ts` on every
   * request to this path — and that file is an optimistic redirect layer that
   * runs on nearly every navigation, which is exactly what Next's own guidance
   * ("keep proxy checks fast, and avoid fetching full content there") warns
   * against. Not worth it for a page that is already `noindex`; revisit only if
   * a compliance or analytics requirement ever needs the status itself.
   *
   * What raising it here *does* fix: `generateMetadata` is awaited before the
   * head is flushed, so throwing now lets `not-found.tsx` supply its own
   * `metadata`. Without it the dead link renders the branded 404 under the
   * fallback title "Incident" instead of "Report not found".
   */
  if (!preview) notFound();

  const typeLabel = INCIDENT_TYPE_LABELS[preview.type];
  const { name } = preview.village;

  /**
   * The card people actually see. The title names the category and the village
   * and nothing else — the two facts that make somebody in that village stop
   * scrolling, and neither of which identifies anyone.
   *
   * The description carries the same extract the page renders. It is already
   * public to whoever holds the link, so withholding it from the card would buy
   * nothing and cost the card the only line that says what happened.
   */
  const title = `Incident reported near ${name} — ${typeLabel}`;
  const description = `${preview.descriptionExtract} Register on ${APP_NAME} to see the full report, where it happened, and what else has been reported near you.`;

  return {
    title: `${typeLabel} reported near ${name}`,
    description,
    alternates: { canonical: publicIncidentPath(preview.id) },
    openGraph: {
      type: "article",
      siteName: APP_NAME,
      url: publicIncidentPath(preview.id),
      locale: "en_GB",
      title: `${title} | ${APP_NAME}`,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${APP_NAME}`,
      description,
    },
    // See the module header. Unlisted, not indexed — and `follow` so the links
    // out of here still count.
    robots: { index: false, follow: true },
  };
}

/**
 * "1,284 incidents recorded by 340 residents across 12 villages."
 *
 * Every figure is a real count, so each one has to survive being 1 — a village
 * three days old is exactly the audience this line is aimed at, and "1 villages"
 * is how a reader decides the number is generated and stops believing it.
 * `en-GB` grouping for the same reason the rest of the app formats dates that
 * way.
 */
function communityLine(stats: CommunityStats): string {
  const n = (value: number) => value.toLocaleString("en-GB");
  const plural = (value: number, one: string, many: string) =>
    `${n(value)} ${value === 1 ? one : many}`;

  return `${plural(stats.incidents, "incident", "incidents")} recorded by ${plural(
    stats.residents,
    "resident",
    "residents",
  )} across ${plural(stats.villages, "village", "villages")}`;
}

/**
 * What an account actually buys, in the order somebody would want it.
 *
 * Typed rather than left to `as const`, so `item.icon` is one component type at
 * the render below instead of a union of five — which is the shape that starts
 * producing "union type too complex" the moment a sixth is added.
 */
const LOCKED: readonly {
  icon: LucideIcon;
  title: string;
  body: string;
}[] = [
  {
    icon: MessageSquarePlus,
    title: "The rest of the report",
    body: "The full account of what was seen — anonymised before anyone reads it.",
  },
  {
    icon: MapPin,
    title: "Where it happened",
    body: "The landmark the reporter named, and the location on your village map.",
  },
  {
    icon: Camera,
    title: "Any photos",
    body: "Faces are covered on the reporter's own device before an image is ever uploaded.",
  },
  {
    icon: TrendingUp,
    title: "Pattern analysis",
    body: "Whether this is one of several nearby in the last month, and what they have in common.",
  },
  {
    icon: ShieldCheck,
    title: "Report what you see",
    body: "File in seconds. Personal details are stripped out automatically.",
  },
];

export default async function PublicIncidentPage({ params }: PageProps) {
  const { id } = await params;

  // One round trip rather than two in series — the stats do not depend on the
  // incident, and this page is the first thing somebody sees of VillageWatch.
  const [preview, stats] = await Promise.all([
    loadPreview(id),
    getCommunityStats(),
  ]);

  /**
   * Every reason collapses to the same 404 — see `getPublicIncidentPreview`.
   * In practice `generateMetadata` has already raised this and set the status;
   * what this line does is narrow the type for everything below.
   */
  if (!preview) notFound();

  // Read once, so the relative age and the date on the page agree with each
  // other and neither moves underneath the render.
  const now = new Date();

  const { village } = preview;
  const typeLabel = INCIDENT_TYPE_LABELS[preview.type];

  /**
   * The village is prefilled the way `/join/[slug]` does it — and, like that
   * page, it decides nothing: `/register` honours the id only if it is one of
   * the villages already on that screen, and the join code is never read from
   * the database (domain rule 5). There is no code here to pass; a resident
   * finishes with the one their coordinator gave them.
   */
  const registerHref = `/register?village=${encodeURIComponent(village.id)}`;
  const signInHref = `/login?next=${encodeURIComponent(`/incidents/${preview.id}`)}`;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="text-slate-900">
            <Logo />
          </Link>
          <Link
            href={signInHref}
            className="text-sm font-semibold text-brand-600 transition hover:text-brand-700"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          {/* ---------------------------------------------------------------
              The teaser. Everything here is safe to show a stranger.
              --------------------------------------------------------------- */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                <MapPin className="size-3.5" aria-hidden />
                Reported near {village.name}
              </span>
              <SeverityBadge severity={preview.severity} size="sm" />
            </div>

            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              An incident was reported near {village.name}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                <IncidentTypeIcon type={preview.type} className="size-4" />
                {typeLabel}
              </span>
              <span>
                <time dateTime={preview.occurredAt.toISOString()}>
                  {formatTimeAgo(preview.occurredAt, now)}
                </time>
                {" · "}
                {formatDate(preview.occurredAt)}
              </span>
            </div>

            {village.region && (
              <p className="mt-2 text-sm text-slate-500">{village.region}</p>
            )}

            {/*
              The first line of the anonymised description, cut on a word
              boundary by `getPublicIncidentPreview` — the whole column never
              reaches this component, so there is no longer string on the page
              for a crawler or a "view source" to pick up.
            */}
            <p className="mt-5 text-base leading-relaxed text-slate-700">
              {preview.descriptionExtract}
            </p>

            {preview.recurring && (
              <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-amber-50 p-3.5 text-sm leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-600/20">
                <TrendingUp className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  This report is part of a pattern nearby. Residents can see how
                  many others there have been and where.
                </span>
              </p>
            )}
          </section>

          {/* ---------------------------------------------------------------
              The wall.

              These bars are *placeholders* — decorative divs, not the rest of
              the report under a blur filter. That distinction is the whole
              security of this section: CSS blur is a paint effect, so real text
              behind one is still in the HTML, still in "view source", still
              read out by a screen reader and still handed to every link-preview
              crawler that fetches the page. Nothing withheld by
              `getPublicIncidentPreview` is fetched here, so there is nothing on
              the page to reveal.
              --------------------------------------------------------------- */}
          <section className="relative mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div aria-hidden className="select-none p-6 blur-[5px] sm:p-8">
              <div className="h-5 w-3/4 rounded bg-slate-300" />
              <div className="mt-4 space-y-2.5">
                <div className="h-3.5 w-full rounded bg-slate-200" />
                <div className="h-3.5 w-full rounded bg-slate-200" />
                <div className="h-3.5 w-5/6 rounded bg-slate-200" />
                <div className="h-3.5 w-2/3 rounded bg-slate-200" />
              </div>
              <div className="mt-6 h-36 rounded-xl bg-slate-200" />
              <div className="mt-4 flex gap-3">
                <div className="h-16 w-24 rounded-lg bg-slate-200" />
                <div className="h-16 w-24 rounded-lg bg-slate-200" />
              </div>
            </div>

            <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/85 to-white" />

            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <Lock className="size-5" aria-hidden />
              </span>
              <p className="mt-3 text-base font-semibold text-slate-900">
                The full report is for residents
              </p>
              <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-600">
                Reports stay inside the village they were filed in. Register to
                read this one.
              </p>
              <Link
                href={registerHref}
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
              >
                Register to see full details
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </section>

          {/* ---------------------------------------------------------------
              What an account is for, and the counters.
              --------------------------------------------------------------- */}
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              What residents of {village.name} can see
            </h2>

            <ul className="mt-5 space-y-4">
              {LOCKED.map((item) => (
                <li key={item.title} className="flex gap-3.5">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                    <item.icon className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 overflow-hidden rounded-2xl bg-brand-950 p-6 text-center shadow-sm sm:p-10">
            {/*
              Rendered only when the counts came back. `getCommunityStats`
              returns null rather than zeroes on a failure, because "0 incidents
              recorded by 0 residents" is a sentence about a service nobody uses
              and a database blip should not put it on a public page.
            */}
            {stats && (
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-brand-100">
                <Users className="size-3.5 text-safe-400" aria-hidden />
                {communityLine(stats)}
              </p>
            )}

            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Stay informed. Keep your village safe.
            </h2>

            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-brand-100">
              Get alerted when something is reported near your home, see what
              your neighbours have logged, and report what you see in seconds.
              Free for residents.
            </p>

            <Link
              href={registerHref}
              className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-white px-6 text-sm font-semibold text-brand-900 shadow-sm transition hover:bg-brand-50 sm:w-auto"
            >
              Register to {APP_NAME}
              <ArrowRight className="size-4" aria-hidden />
            </Link>

            <p className="mt-4 text-xs leading-relaxed text-brand-200">
              You will need the join code from your village coordinator to be
              confirmed as a resident.
            </p>
          </section>

          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link
              href={signInHref}
              className="font-semibold text-brand-600 hover:text-brand-700"
            >
              Sign in to see the full report
            </Link>
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
