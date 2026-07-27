"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  Plus,
  Settings,
  Shield,
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
const ADMIN_ITEM = {
  href: "/admin/coordinators",
  label: "Admin",
  icon: Shield,
} as const;

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

  function linkClass(href: string) {
    return `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
      isActive(href)
        ? "bg-white/15 text-white"
        : "text-brand-100 hover:bg-white/10 hover:text-white"
    }`;
  }

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
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
          className="rounded-lg p-2 text-brand-200 transition hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Close navigation"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <Link
        href="/incidents/new"
        data-tour="report"
        onClick={() => setMobileOpen(false)}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-safe-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-safe-400"
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
        Its own <nav> below a rule, rather than a fifth item in the list above.
        The separation is the point: everything in that list is this resident's
        village, and this one link is the whole platform.
      */}
      {user.isAdmin && (
        <nav aria-label="Administration" className="border-t border-white/10 pt-4">
          <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-brand-300">
            Platform
          </p>
          <Link
            href={ADMIN_ITEM.href}
            onClick={() => setMobileOpen(false)}
            aria-current={isActive(ADMIN_ITEM.href) ? "page" : undefined}
            className={linkClass(ADMIN_ITEM.href)}
          >
            <ADMIN_ITEM.icon className="size-5 shrink-0" aria-hidden />
            {ADMIN_ITEM.label}
          </Link>
        </nav>
      )}

      <div className="border-t border-white/10 pt-4">
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
        <div className="sticky top-0 h-screen">{sidebar}</div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-brand-950 shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
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
