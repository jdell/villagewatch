import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  ChevronRight,
  EyeOff,
  Map,
  MessageSquarePlus,
  Radar,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { APP_NAME, SEVERITIES } from "@/lib/constants";

const STEPS = [
  {
    icon: MessageSquarePlus,
    title: "Report",
    lede: "Under a minute, from the pavement",
    body: "Pick what happened, drop a pin, add a photo if you have one. Say it in your own words — no forms to decode, no jargon to learn.",
  },
  {
    icon: Sparkles,
    title: "AI processes",
    lede: "Personal details never make it public",
    body: "Names, number plates and faces are stripped out. The report is categorised, given a severity, and placed on the map with your location blurred.",
  },
  {
    icon: BellRing,
    title: "Community alerted",
    lede: "The right people, straight away",
    body: "Neighbours nearby get a push notification. Your coordinator sees the full context in their queue and can escalate to the police.",
  },
] as const;

const FEATURES = [
  {
    icon: Map,
    title: "Live incident map",
    body: "Every published report, colour-coded by severity, filterable by type and date. See at a glance whether the trouble is on your street or three villages over.",
  },
  {
    icon: EyeOff,
    title: "AI anonymisation",
    body: "The original text is kept under lock and key for coordinators. What neighbours read is a rewritten version with identifying details removed, and photos with faces and plates blurred.",
  },
  {
    icon: Radar,
    title: "Pattern detection",
    body: "Six vehicle break-ins within 400 metres over four nights is a pattern, not a coincidence. VillageWatch spots the cluster and names it before anyone has to join the dots by hand.",
  },
  {
    icon: BellRing,
    title: "Push alerts that respect you",
    body: "Choose the minimum severity worth waking you. Critical incidents reach everyone; a missing cat reaches the people who asked to hear about missing cats.",
  },
] as const;

/**
 * Decorative pins over the hero's abstract street grid. Kept to the right of
 * 74% and to `lg` and up, so they never land on the headline or the CTAs —
 * below that breakpoint the copy fills the width and the pins are hidden.
 */
const HERO_PINS = [
  { top: "16%", left: "78%", severity: "LOW" },
  { top: "30%", left: "90%", severity: "MEDIUM" },
  { top: "47%", left: "74%", severity: "HIGH" },
  { top: "64%", left: "86%", severity: "CRITICAL" },
  { top: "80%", left: "76%", severity: "MEDIUM" },
] as const;

const PIN_COLOR = Object.fromEntries(SEVERITIES.map((s) => [s.value, s.pin]));

export default function LandingPage() {
  const year = new Date().getFullYear();

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
                Neighbourhood Watch, without the WhatsApp group
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
                  "Full audit trail on every publish, edit and rejection",
                  "Original report text stays restricted to your team",
                  "Pattern alerts flag clusters before you notice them",
                  "Verify residents so only real neighbours can post",
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
                    ref: "VW-2026-0184",
                    title: "Van circling Mill Lane after dark",
                    severity: "MEDIUM" as const,
                    when: "12 minutes ago",
                  },
                  {
                    ref: "VW-2026-0183",
                    title: "Shed forced open on Church Row",
                    severity: "HIGH" as const,
                    when: "1 hour ago",
                  },
                  {
                    ref: "VW-2026-0182",
                    title: "Fly-tipping at the recreation ground",
                    severity: "LOW" as const,
                    when: "Yesterday",
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

      {/* ------------------------------------------------------------------ */}
      {/* Footer                                                              */}
      {/* ------------------------------------------------------------------ */}
      <footer className="bg-brand-950 text-brand-200">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <span className="text-white">
                <Logo />
              </span>
              <p className="mt-4 max-w-sm text-sm leading-relaxed">
                Community safety reporting for villages and neighbourhoods.
                Report in seconds, anonymised by default, mapped for everyone.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white">Product</h3>
              <ul className="mt-4 space-y-3 text-sm">
                <li>
                  <a href="#how-it-works" className="transition hover:text-white">
                    How it works
                  </a>
                </li>
                <li>
                  <a href="#features" className="transition hover:text-white">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#coordinators" className="transition hover:text-white">
                    For coordinators
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white">Account</h3>
              <ul className="mt-4 space-y-3 text-sm">
                <li>
                  <Link href="/login" className="transition hover:text-white">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="transition hover:text-white">
                    Create an account
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-8 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {year} {APP_NAME}. All rights reserved.
            </p>
            <p className="text-brand-300">
              In an emergency, always call the emergency services first.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
