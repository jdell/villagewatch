import Link from 'next/link';
import {
  ArrowRight,
  BellRing,
  Check,
  ChevronRight,
  EyeOff,
  Landmark,
  Map,
  MessageCircle,
  MessageSquarePlus,
  Radar,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { Logo } from '@/components/logo';
import { SiteFooter } from '@/components/site-footer';
import {
  APP_NAME,
  PRICING,
  RETENTION,
  SEVERITIES,
  VILLAGES_LIVE,
} from '@/lib/constants';

const STEPS = [
  {
    icon: MessageSquarePlus,
    title: 'Report',
    lede: 'Under a minute, from the pavement',
    body: 'Pick what happened, drop a pin, add a photo if you have one. Say it in your own words — no forms to decode, no jargon to learn.',
  },
  {
    icon: Sparkles,
    title: 'AI processes',
    lede: 'Personal details never make it public',
    body: 'Names, number plates and faces are stripped out. The report is categorised, given a severity, and placed on the map with your location blurred.',
  },
  {
    icon: BellRing,
    title: 'Community alerted',
    lede: 'The right people, straight away',
    body: 'Neighbours nearby get a push notification. Your coordinator sees the full context in their queue and can escalate to the police.',
  },
] as const;

const FEATURES = [
  {
    icon: Map,
    title: 'Live incident map',
    body: 'Every published report, colour-coded by severity, filterable by type and date. See at a glance whether the trouble is on your street or three villages over.',
  },
  {
    icon: EyeOff,
    title: 'AI anonymisation',
    body: 'The original text is kept under lock and key for coordinators. What neighbours read is a rewritten version with identifying details removed, and photos with every face blacked out.',
  },
  {
    icon: Radar,
    title: 'Pattern detection',
    body: 'Six vehicle break-ins within 400 metres over four nights is a pattern, not a coincidence. VillageWatch spots the cluster and names it before anyone has to join the dots by hand.',
  },
  {
    icon: BellRing,
    title: 'Push alerts that respect you',
    body: 'Choose the minimum severity worth waking you. Critical incidents reach everyone; a missing cat reaches the people who asked to hear about missing cats.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp Channel',
    body: 'Approve a report and it is formatted ready for your village’s WhatsApp Channel — copy, paste, done — so neighbours who never install anything still see the serious ones. It is a one-way feed: a headline, an area, a short extract and a link, with no phone numbers shared in either direction.',
  },
] as const;

/**
 * Decorative pins over the hero's abstract street grid. Kept to the right of
 * 74% and to `lg` and up, so they never land on the headline or the CTAs —
 * below that breakpoint the copy fills the width and the pins are hidden.
 */
const HERO_PINS = [
  { top: '16%', left: '78%', severity: 'LOW' },
  { top: '30%', left: '90%', severity: 'MEDIUM' },
  { top: '47%', left: '74%', severity: 'HIGH' },
  { top: '64%', left: '86%', severity: 'CRITICAL' },
  { top: '80%', left: '76%', severity: 'MEDIUM' },
] as const;

const PIN_COLOR = Object.fromEntries(SEVERITIES.map((s) => [s.value, s.pin]));

/**
 * The four questions a parish clerk actually asks, in the order they ask them.
 *
 * Every answer here is a statement about how the code behaves, not a
 * reassurance — which means each one is a claim that has to stay true. If
 * on-device blurring, coordinate jitter or the Anthropic round trip ever
 * changes, this list changes in the same commit, alongside `/privacy`.
 */
const FAQS = [
  {
    question: 'Is my data safe?',
    answer: `Reports are held in a UK-region database and the app is served from London. Your exact location is never stored — coordinates are moved by about a hundred metres before they are written down, so the pin lands on the right street and not on your door. Faces in a photograph are covered on your own phone before it is uploaded — a black box, or a mosaic and a blur, depending on what your village has chosen, and you can always ask for the black box — which also strips the GPS tag cameras write into every picture. Reports are archived after ${RETENTION.incidentArchiveMonths} months and photographs are deleted after ${RETENTION.mediaDeleteMonths}.`,
  },
  {
    question: 'Who can see what I report?',
    answer:
      'Your neighbours see a rewritten version with names, registrations and house numbers taken out. Your village coordinator can see your original wording, and every time they do it is written to an audit trail with their name against it. Nobody outside your village sees any of it — not another village, not us. The one exception is a WhatsApp Channel, which is public and which your coordinator has to switch on: nothing is posted automatically, but a coordinator can copy a serious report to it as a headline, an area, a short extract and a link, and nothing else.',
  },
  {
    question: 'How does the AI work?',
    answer:
      'When you submit a report, the text goes to Claude, which rewrites it without the identifying details, sorts it into a category and suggests how serious it is. You see the result and can edit it before anything is saved. If the AI is unavailable your report still files in your own words, and the screen says so. Reports wait for a coordinator to approve them unless your village has turned that review off, which is a setting its coordinators control and which the app tells you about before you file.',
  },
  {
    question: 'How do I become a coordinator?',
    answer:
      'Register as a resident, then apply from Settings. You are asked how you are involved in the village — Neighbourhood Watch, the parish council, something else — and why you want the access. A platform administrator reviews the application by hand and you hear back either way. It is not self-service on purpose: a coordinator can read the original wording of every report their village files, so somebody has to decide that rather than a form.',
  },
  {
    question: 'Is it free?',
    answer:
      'Free for one village, for residents and coordinators alike, with no card and no trial period. A paid tier for groups of parishes is planned and does not exist yet — nothing on this site can charge anybody anything today.',
  },
] as const;

export default function LandingPage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-brand-950/80 backdrop-blur-md">
        <nav
          aria-label="Main"
          className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6"
        >
          <Link href="/" className="text-white">
            <Logo />
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#how-it-works"
              className="text-sm font-medium text-brand-100 transition hover:text-white"
            >
              How it works
            </a>
            <a
              href="#features"
              className="text-sm font-medium text-brand-100 transition hover:text-white"
            >
              Features
            </a>
            <a
              href="#coordinators"
              className="text-sm font-medium text-brand-100 transition hover:text-white"
            >
              For coordinators
            </a>
            <a
              href="#parish-councils"
              className="text-sm font-medium text-brand-100 transition hover:text-white"
            >
              Pricing
            </a>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-brand-100 transition hover:bg-white/10 hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-brand-900 shadow-sm transition hover:bg-brand-50 sm:px-4"
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        {/* ---------------------------------------------------------------- */}
        {/* Hero                                                              */}
        {/* ---------------------------------------------------------------- */}
        <section className="relative isolate overflow-hidden bg-brand-950">
          {/* Abstract map background */}
          <div aria-hidden="true" className="absolute inset-0 -z-10">
            <div className="hero-streets absolute inset-0 opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-b from-brand-950/40 via-brand-950/70 to-brand-950" />
            <div className="absolute -top-32 left-1/2 size-[42rem] -translate-x-1/2 rounded-full bg-brand-600/25 blur-3xl" />
            <div className="absolute bottom-0 right-0 size-96 rounded-full bg-safe-500/10 blur-3xl" />

            {HERO_PINS.map((pin) => (
              <span
                key={`${pin.top}-${pin.left}`}
                className="absolute hidden lg:block"
                style={{ top: pin.top, left: pin.left }}
              >
                <span
                  className="absolute inset-0 rounded-full animate-pin-pulse"
                  style={{ backgroundColor: PIN_COLOR[pin.severity] }}
                />
                <span
                  className="relative block size-3 rounded-full ring-2 ring-white/60"
                  style={{ backgroundColor: PIN_COLOR[pin.severity] }}
                />
              </span>
            ))}
          </div>

          <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24 lg:pb-32 lg:pt-28">
            <div className="max-w-2xl animate-rise">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-brand-100 sm:text-sm">
                <ShieldCheck className="size-4 text-safe-400" aria-hidden />
                Neighbourhood Watch
              </span>

              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Keep your village safe
              </h1>

              <p className="mt-5 text-lg leading-relaxed text-brand-100 sm:text-xl">
                Report what you see in seconds. {APP_NAME} strips out personal
                details, plots it on a live map, and alerts your neighbours the
                moment a pattern emerges.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/register"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-safe-500 px-6 text-base font-semibold text-white shadow-lg shadow-safe-900/30 transition hover:bg-safe-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Join your village
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 text-base font-medium text-white transition hover:bg-white/10"
                >
                  See how it works
                </a>
              </div>

              <p className="mt-6 text-sm text-brand-200">
                Free for residents · Your exact location is never shared ·
                Reports are anonymised before anyone sees them
              </p>
            </div>

            {/* Severity legend — doubles as a map key and a product tell */}
            <dl className="mt-14 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-5 sm:mt-20 sm:grid-cols-4">
              {SEVERITIES.map((severity) => (
                <div key={severity.value} className="flex items-start gap-2.5">
                  <span
                    className="mt-1.5 size-2.5 shrink-0 rounded-full ring-2 ring-white/25"
                    style={{ backgroundColor: severity.pin }}
                    aria-hidden
                  />
                  <div>
                    <dt className="text-sm font-semibold text-white">
                      {severity.label}
                    </dt>
                    <dd className="mt-0.5 text-xs leading-snug text-brand-200">
                      {severity.description}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Trust strip                                                       */}
        {/* ---------------------------------------------------------------- */}
        {/*
          The "trusted by N villages" line, which renders a number only when
          `VILLAGES_LIVE` is one. It is null, so what shows is the honest
          version — see the constant for why a placeholder figure is not an
          acceptable stand-in on a page a parish clerk reads before handing over
          their residents' incident reports.
        */}
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
            <p className="text-center text-sm text-slate-500">
              {VILLAGES_LIVE !== null ? (
                <>
                  <span className="font-semibold text-slate-900">
                    Trusted by {VILLAGES_LIVE.toLocaleString('en-GB')} villages
                  </span>{' '}
                  across England · Open source · UK data, London region · Built
                  for parish councils
                </>
              ) : (
                <>
                  Built for parish councils and neighbourhood watch schemes in
                  England · Open source · UK data, hosted in London · Free for
                  one village
                </>
              )}
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* How it works                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section
          id="how-it-works"
          className="scroll-mt-16 border-b border-slate-200 bg-white py-20 sm:py-28"
        >
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <span className="text-sm font-semibold uppercase tracking-wider text-brand-600">
                How it works
              </span>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Three steps, and the street knows
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                The gap between spotting something and everyone knowing about it
                is usually days. {APP_NAME} closes it to minutes, without anyone
                having to chase a coordinator for an update.
              </p>
            </div>

            <ol className="mt-14 grid gap-6 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="relative flex flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-6 transition hover:border-brand-200 hover:bg-white hover:shadow-lg hover:shadow-brand-900/5"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-xl bg-brand-600 text-white shadow-sm">
                      <step.icon className="size-5" aria-hidden />
                    </span>
                    <span className="font-mono text-sm font-medium text-slate-400">
                      Step {index + 1}
                    </span>
                  </div>

                  <h3 className="mt-5 text-xl font-semibold text-slate-900">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-brand-700">
                    {step.lede}
                  </p>
                  <p className="mt-3 text-base leading-relaxed text-slate-600">
                    {step.body}
                  </p>

                  {index < STEPS.length - 1 && (
                    <ChevronRight
                      aria-hidden
                      className="absolute -right-3 top-1/2 hidden size-6 -translate-y-1/2 text-slate-300 md:block"
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Features                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section
          id="features"
          className="scroll-mt-16 bg-slate-50 py-20 sm:py-28"
        >
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <span className="text-sm font-semibold uppercase tracking-wider text-brand-600">
                Features
              </span>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Built for a village, not a police force
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                Everything here exists because a coordinator was doing it by
                hand: retyping reports, blurring photos, and noticing on the
                fourth break-in that there had been three others.
              </p>
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-900/5"
                >
                  <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                    <feature.icon className="size-6" aria-hidden />
                  </span>
                  <h3 className="mt-5 text-xl font-semibold text-slate-900">
                    {feature.title}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-slate-600">
                    {feature.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Coordinators                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section
          id="coordinators"
          className="scroll-mt-16 border-y border-slate-200 bg-white py-20 sm:py-24"
        >
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-safe-50 px-3 py-1 text-sm font-medium text-safe-700 ring-1 ring-safe-200">
                <Users className="size-4" aria-hidden />
                For coordinators
              </span>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                A moderation queue, not an inbox
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                Every report arrives with the original wording, the anonymised
                version, the photos, and the map pin side by side. Publish,
                resolve or reject in one click — and every action is logged, so
                the trail holds up if the police ever ask for it.
              </p>

              <ul className="mt-7 space-y-3">
                {[
                  'Full audit trail on every publish, edit and rejection',
                  'Original report text stays restricted to your team',
                  'Pattern alerts flag clusters before you notice them',
                  'Verify residents so only real neighbours can post',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <ShieldCheck
                      className="mt-0.5 size-5 shrink-0 text-safe-600"
                      aria-hidden
                    />
                    <span className="text-base text-slate-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Static preview of the moderation queue */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">
                  Awaiting review
                </p>
                <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                  3
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {[
                  {
                    ref: 'VW-2026-0184',
                    title: 'Van circling Mill Lane after dark',
                    severity: 'MEDIUM' as const,
                    when: '12 minutes ago',
                  },
                  {
                    ref: 'VW-2026-0183',
                    title: 'Shed forced open on Church Row',
                    severity: 'HIGH' as const,
                    when: '1 hour ago',
                  },
                  {
                    ref: 'VW-2026-0182',
                    title: 'Fly-tipping at the recreation ground',
                    severity: 'LOW' as const,
                    when: 'Yesterday',
                  },
                ].map((row) => (
                  <div
                    key={row.ref}
                    className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5"
                  >
                    <span
                      className="mt-1.5 size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: PIN_COLOR[row.severity] }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {row.title}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">
                        {row.ref} · {row.when}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-xs text-slate-500">
                Illustrative preview. Sign in to see your village&apos;s queue.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* For parish councils — pricing preview                             */}
        {/* ---------------------------------------------------------------- */}
        <section
          id="parish-councils"
          className="scroll-mt-16 bg-slate-50 py-20 sm:py-28"
        >
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 ring-1 ring-brand-100">
                <Landmark className="size-4" aria-hidden />
                For parish councils
              </span>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Free for your village. Properly free.
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                One parish, every resident, every feature — no card, no trial
                window, no resident cap. {APP_NAME} is open source, so a council
                that would rather run it themselves can.
              </p>
            </div>

            <div className="mt-14 grid gap-6 lg:grid-cols-2">
              {PRICING.map((tier) => (
                <div
                  key={tier.name}
                  className={`flex flex-col rounded-2xl border p-7 sm:p-8 ${
                    tier.featured
                      ? 'border-brand-200 bg-white shadow-lg shadow-brand-900/5 ring-1 ring-brand-100'
                      : 'border-slate-200 bg-white/60'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {tier.name}
                    </h3>
                    {tier.featured ? (
                      <span className="rounded-full bg-safe-50 px-2.5 py-0.5 text-xs font-semibold text-safe-700 ring-1 ring-safe-200">
                        Available now
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                        Planned
                      </span>
                    )}
                  </div>

                  <p className="mt-5 flex items-baseline gap-2">
                    <span className="text-4xl font-semibold tracking-tight text-slate-900">
                      {tier.price}
                    </span>
                    <span className="text-sm text-slate-500">
                      {tier.cadence}
                    </span>
                  </p>

                  <p className="mt-4 text-base leading-relaxed text-slate-600">
                    {tier.lede}
                  </p>

                  <ul className="mt-7 flex-1 space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check
                          className={`mt-0.5 size-5 shrink-0 ${
                            tier.featured ? 'text-safe-600' : 'text-slate-400'
                          }`}
                          aria-hidden
                        />
                        <span className="text-sm leading-relaxed text-slate-700">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={tier.cta.href}
                    className={`mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold transition ${
                      tier.featured
                        ? 'bg-brand-600 text-white shadow-sm hover:bg-brand-700'
                        : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {tier.cta.label}
                    {tier.featured && (
                      <ArrowRight className="size-4" aria-hidden />
                    )}
                  </Link>
                </div>
              ))}
            </div>

            {/*
              Said plainly rather than in a footnote. There is no billing
              integration anywhere in this codebase — see PRICING in
              src/lib/constants.ts. A price list that reads as live on a site
              that cannot take payment is what a council builds a budget line
              against.
            */}
            <p className="mt-8 text-sm leading-relaxed text-slate-500">
              Pro is a preview of what is planned, not something you can buy
              today — nothing on this site takes payment. If it would suit your
              group of parishes, create a free village and say so; that is how
              the order gets decided.
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* FAQ                                                               */}
        {/* ---------------------------------------------------------------- */}
        <section
          id="faq"
          className="scroll-mt-16 border-y border-slate-200 bg-white py-20 sm:py-24"
        >
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-16">
            <div>
              <span className="text-sm font-semibold uppercase tracking-wider text-brand-600">
                Questions
              </span>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                The four everyone asks
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                If yours is not here, the{' '}
                <Link
                  href="/privacy"
                  className="font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800"
                >
                  privacy notice
                </Link>{' '}
                goes into considerably more detail.
              </p>
            </div>

            {/*
              <details> rather than a JS accordion: it is keyboard accessible
              and findable with the browser's own in-page search for free, and
              this is a marketing page that should not need a client component.
            */}
            <div className="divide-y divide-slate-200 border-t border-slate-200">
              {FAQS.map((faq) => (
                <details key={faq.question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-medium text-slate-900 marker:content-none">
                    {faq.question}
                    <ChevronRight
                      className="size-5 shrink-0 text-slate-400 transition group-open:rotate-90"
                      aria-hidden
                    />
                  </summary>
                  <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* CTA                                                               */}
        {/* ---------------------------------------------------------------- */}
        <section className="relative isolate overflow-hidden bg-brand-900 py-20 sm:py-24">
          <div
            aria-hidden="true"
            className="hero-streets absolute inset-0 -z-10 opacity-40"
          />
          <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Your village is already watching. Give it somewhere to look.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-brand-100">
              Set up takes a few minutes. Bring your coordinator, bring your
              street, bring the group chat that never quite worked.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-base font-semibold text-brand-900 shadow-lg transition hover:bg-brand-50"
              >
                Create your account
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/25 px-6 text-base font-medium text-white transition hover:bg-white/10"
              >
                I already have one
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter showProductLinks />
    </>
  );
}
