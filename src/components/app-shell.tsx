"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Map,
  MapPinned,
  Menu,
  Plus,
  Settings,
  Shield,
  ShieldCheck,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { OnboardingTour } from "@/components/onboarding-tour";
import { PushRegistration } from "@/components/push-registration";
import type { UserRole } from "@/generated/prisma/enums";
import { COORDINATOR_ROLES, USER_ROLE_LABELS } from "@/lib/constants";

/**
 * `tour` marks an item the onboarding tour points at. The highlight itself is a
 * CSS attribute selector in `globals.css` keyed off `body[data-tour-step]` —
 * see `src/components/onboarding-tour.tsx` for why it works that way.
 *
 * `requires` hides an item from roles that cannot use it. Hiding is all it is:
 * every route behind these links calls `requireCoordinator()` or
 * `requireAdmin()` on the server, and an absent link has never been an
 * authorisation check.
 */
const NAV_ITEMS = [
  { href: "/map", label: "Map", icon: Map, tour: "map" },
  { href: "/incidents", label: "Incidents", icon: ClipboardList },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    requires: "coordinator",
  },
  /*
    Below the dashboard, because that is the order they are used in: a
    coordinator reviews the queue, and then once a week or once a month turns
    what cleared it into a document for somebody outside the village.

    `requires: "coordinator"` covers the platform administrator who also holds
    `UserRole.ADMIN` — that role is in `COORDINATOR_ROLES`. An administrator by
    email alone does not get this link, and should not: a report is one
    village's data (domain rule 4), and somebody in `ADMIN_EMAILS` with no
    village has nothing to report on. `requireCoordinator()` on the route says
    the same thing, and it is the half that enforces it.
  */
  {
    href: "/reports",
    label: "Reports",
    icon: FileText,
    requires: "coordinator",
  },
  /*
    Last of the coordinator items, and the first one that matters: until this is
    done the village accepts no reports at all, so there is nothing for the three
    above it to show. It sits at the bottom rather than the top because it is a
    once-per-village act — the dashboard's amber banner is what puts it in front
    of somebody who has not done it, and a permanent top-of-list entry for a
    thing you do once would push the daily work down forever.
  */
  {
    href: "/dashboard/compliance",
    label: "Compliance",
    icon: ShieldCheck,
    requires: "coordinator",
  },
  { href: "/settings", label: "Settings", icon: Settings, tour: "settings" },
] as const;

/**
 * The platform administrator's way in, kept out of `NAV_ITEMS` deliberately.
 *
 * Everything above it is one village's data (domain rule 4). `/admin` is the
 * only authenticated surface in the app that is not — it lists applications
 * from every village, because a village-scoped reviewer could only ever be
 * somebody who already holds the access being applied for. Sitting it below the
 * divider says that on the screen rather than only in the docs.
 *
 * It is also decided by something else entirely: coordinator comes from
 * `User.role`, platform administrator from the signed-in email against
 * `ADMIN_EMAILS`. Neither is a superset of the other, and an administrator who
 * is not a coordinator sees this and not the dashboard — which is right. They
 * decide who moderates; they do not moderate.
 */
const ADMIN_ITEMS = [
  { href: "/admin/villages", label: "Villages", icon: MapPinned },
  { href: "/admin/coordinators", label: "Coordinators", icon: Shield },
] as const;

export type AppShellUser = {
  name: string;
  email: string;
  role: UserRole | null;
  villageName: string | null;
  /** Supabase auth user id — the OneSignal external id. */
  id: string;
  /** The resident's `notifyPush` preference. */
  notifyPush: boolean;
  /**
   * Whether to show the admin section. Computed on the server and passed in,
   * because it is decided by `ADMIN_EMAILS` — a server-only variable with no
   * `NEXT_PUBLIC_` prefix, which this Client Component therefore cannot read.
   * Shipping the list of administrators to every browser to decide whether to
   * draw one link would be the wrong trade twice over.
   */
  isAdmin: boolean;
};

export function AppShell({
  user,
  children,
}: {
  user: AppShellUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isCoordinator =
    user.role !== null &&
    (COORDINATOR_ROLES as readonly UserRole[]).includes(user.role);

  const visibleItems = NAV_ITEMS.filter(
    (item) => !("requires" in item) || isCoordinator,
  );

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  /*
    `py-2.5` stays, on the phone as well as the desktop column, and the drawer's
    compactness is bought from the space *between* sections instead — see the
    band below.

    Dropping to `py-2` was tried and reverted: it takes the row from 40px to
    36px, and 40px is already under the 44px touch target both Apple and the
    WCAG 2.5.5 guidance ask for. This is an app somebody opens one-handed to
    report something happening outside their window, in a village whose watch
    scheme skews older than the average phone user. Four pixels of whitespace is
    not worth a mis-tap there, and the reachability problem was the panel not
    scrolling, not the rows being tall.
  */
  function linkClass(href: string) {
    return `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
      isActive(href)
        ? "bg-white/15 text-white"
        : "text-brand-100 hover:bg-white/10 hover:text-white"
    }`;
  }

  /*
    Three bands, not one column: a fixed header, a scrolling middle, and a fixed
    footer. The whole thing used to be a single `gap-6` column with nothing
    scrollable, which was fine on a laptop and unusable on a phone — the panel
    runs to around 600px of content, so a landscape handset, a small screen, a
    long village name or the administrator's extra section put the village, the
    account and **Sign out** below the fold with no way to reach them.

    Pinning the header and footer rather than scrolling all of it is what keeps
    the close button and the sign-out button reachable from any scroll position;
    only the navigation in between moves. `min-h-0` on that middle band is what
    makes it scroll at all — a flex child's default `min-height: auto` refuses to
    shrink below its content, so without it the band grows to fit and the
    overflow moves back out to the panel, which cannot scroll.

    The bottom padding clears the iOS home indicator, which otherwise sits over
    the sign-out button in a standalone PWA window (see `manifest.json`).
  */
  const sidebar = (
    <div className="flex h-full flex-col p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex shrink-0 items-center justify-between">
        <Link
          href="/map"
          className="text-white"
          onClick={() => setMobileOpen(false)}
        >
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="-mr-2 rounded-lg p-2 text-brand-200 transition hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Close navigation"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      {/*
        `overscroll-contain` so a flick that reaches the end of this list does not
        chain into the page — or into the Leaflet map — behind the drawer.
      */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain lg:mt-6 lg:gap-6">
        <Link
          href="/incidents/new"
          data-tour="report"
          onClick={() => setMobileOpen(false)}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-safe-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-safe-400"
        >
          <Plus className="size-4" aria-hidden />
          Report an incident
        </Link>

        <nav aria-label="Sections" className="flex-1">
          <ul className="space-y-1">
            {visibleItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  data-tour={"tour" in item ? item.tour : undefined}
                  onClick={() => setMobileOpen(false)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={linkClass(item.href)}
                >
                  <item.icon className="size-5 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/*
          Its own <nav> below a rule, rather than more items in the list above.
          The separation is the point: everything in that list is this resident's
          village, and these links are the whole platform.

          Villages first, because it comes first in practice — a village has to be
          activated before anybody can join it, let alone apply to coordinate it.
        */}
        {user.isAdmin && (
          <nav
            aria-label="Administration"
            className="shrink-0 border-t border-white/10 pt-4"
          >
            <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-brand-300">
              Platform
            </p>
            <ul className="space-y-1">
              {ADMIN_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={linkClass(item.href)}
                  >
                    <item.icon className="size-5 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      <div className="mt-4 shrink-0 border-t border-white/10 pt-4">
        {user.villageName && (
          <p className="px-3 text-xs font-medium uppercase tracking-wider text-brand-300">
            {user.villageName}
          </p>
        )}
        <div className="mt-2 px-3">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="truncate text-xs text-brand-200">
            {user.role ? USER_ROLE_LABELS[user.role] : user.email}
          </p>
        </div>

        <form action="/api/auth/logout" method="post" className="mt-3">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-100 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-5 shrink-0" aria-hidden />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full flex-1 bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 bg-brand-950 lg:block">
        {/*
          `h-dvh`, not `h-screen`. `100vh` is the *large* viewport — the height the
          window would have with the browser chrome retracted — so in a short
          window the foot of the panel sits below what is on screen and the sticky
          column has no way to bring it back.
        */}
        <div className="sticky top-0 h-dvh">{sidebar}</div>
      </aside>

      {/*
        Mobile drawer.

        `z-[1100]` rather than `z-50`, and the number is chosen against Leaflet
        rather than against anything in this file. Map wrappers carry
        `map-surface`, which contains their 200-1000 scale (see globals.css), so
        this only has to beat the rest of the shell — but a map that ever escapes
        that containment tops out at 1000, and a navigation drawer buried under a
        tile layer is a dead end on a phone. It also puts the drawer over the
        onboarding tour and the push prompt, both fixed at `z-50` and both later
        in the DOM, which previously drew on top of an open drawer.

        The backdrop is a child of this wrapper, so it inherits the layer and
        cannot be separated from the panel it dims.

        `h-dvh` pins the wrapper to the *dynamic* viewport — what is actually on
        screen, with the address bar wherever it currently is. `inset-0` alone
        resolves against the large viewport in some mobile browsers, which puts the
        foot of the drawer behind the browser chrome; `height` wins over `bottom`
        when both are set, so the two together are a `top-0` anchor and a height
        that tracks the chrome. Everything inside is `h-full` off this.
      */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[1100] h-dvh lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 animate-[vw-backdrop-in_180ms_ease-out] bg-slate-900/60 backdrop-blur-sm motion-reduce:animate-none"
          />
          {/*
            The travel is what makes this read as a drawer over the map rather
            than a new page — see the keyframes in globals.css, which also say
            why the panel and the backdrop animate separately.
          */}
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-[vw-drawer-in_180ms_ease-out] bg-brand-950 shadow-xl motion-reduce:animate-none">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          Mobile top bar — the only way to open the drawer, so it has the same
          problem and sits one layer below it. `/map` renders full-bleed
          underneath this bar, and its zoom control used to cover the hamburger
          button outright.
        */}
        <header className="sticky top-0 z-[1000] flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
            aria-label="Open navigation"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <Link href="/map" className="text-slate-900">
            <Logo />
          </Link>
        </header>

        <main className="flex-1">{children}</main>
      </div>

      {/*
        Four steps on first arrival, then never again on this device. Renders
        nothing once localStorage says it has been seen.
      */}
      <OnboardingTour />

      {/*
        Renders nothing until the SDK is configured and the resident has not
        already answered — see PushRegistration. It lives in the shell rather
        than on one page so the prompt can appear after the first sign-in,
        whichever route that lands on.

        Both this and the tour occupy the bottom of the screen; the tour hides
        this one while it runs, through `body[data-tour-active]` in globals.css.
      */}
      <PushRegistration userId={user.id} enabled={user.notifyPush} />
    </div>
  );
}
