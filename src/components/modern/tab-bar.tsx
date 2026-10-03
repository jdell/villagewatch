"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, List, Map, Plus, Settings } from "lucide-react";

/**
 * The bottom tab bar — phones and tablets only.
 *
 * Rendered by `AppShell` on every authenticated page and hidden from `lg`
 * (1024px) up, where the sidebar stays: a tab bar is a thumb control, and on a
 * desktop it would be five links a mouse has to travel to the bottom of a tall
 * window for. See "The redesign" in CLAUDE.md.
 *
 * ## The numbers, from the design handoff
 *
 * 82px tall, `rgba(255,255,255,.96)` behind a 12px backdrop blur so the map
 * shows faintly through it, and a 1px `#e2e8f0` rule along the top. The 82px
 * includes the home-indicator band: the row of tabs is the top 54px and the
 * rest is padding that an iPhone's indicator sits in. On a device with a taller
 * safe area the bar grows by the difference rather than letting the indicator
 * cover a label — `max()` against the inset, never a fixed sum.
 *
 * Report is the raised centre button, in `#0284c7`, because it is the one
 * action the app exists for. It links to `/incidents/new` — the same wizard the
 * classic sidebar's button opens — so it works from every tab and with
 * JavaScript off.
 *
 * ## Active state
 *
 * The longest matching prefix, the rule `AppShell` uses for the sidebar, so
 * `/incidents/<id>` lights List and nothing else. Report is never "current": it
 * is an action, and a raised button that also changed colour on its own page
 * would read as pressed.
 */

const TABS = [
  { href: "/map", label: "Map", icon: Map, tour: "map" },
  { href: "/incidents", label: "List", icon: List },
  { href: "/incidents/new", label: "Report", icon: Plus, raised: true, tour: "report" },
  { href: "/trends", label: "Trends", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings, tour: "settings" },
] as const;

/** The tab bar's height without the safe area, in px. `globals.css` repeats it. */
export const TAB_BAR_HEIGHT = 82;

export function TabBar() {
  const pathname = usePathname();

  const activeHref = TABS.filter((tab) => !("raised" in tab))
    .map((tab) => tab.href as string)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  // `/incidents/new` starts with `/incidents/`, so the report wizard would
  // otherwise light the List tab while the raised button is the thing in use.
  const current = pathname.startsWith("/incidents/new") ? null : activeHref;

  return (
    <nav
      aria-label="Main"
      data-print-hide
      className="vw-tab-bar fixed inset-x-0 bottom-0 z-[1050] border-t border-[#e2e8f0] bg-[rgba(255,255,255,.96)] backdrop-blur-[12px] lg:hidden"
      style={{
        height: `max(${TAB_BAR_HEIGHT}px, calc(54px + env(safe-area-inset-bottom)))`,
      }}
    >
      <ul className="mx-auto flex h-[54px] max-w-xl items-stretch px-[max(0.5rem,env(safe-area-inset-left))]">
        {TABS.map((tab) => {
          const Icon = tab.icon;

          if ("raised" in tab) {
            return (
              <li key={tab.href} className="flex flex-1 justify-center">
                <Link
                  href={tab.href}
                  data-tour={tab.tour}
                  className="group -mt-[18px] flex flex-col items-center gap-1 outline-none"
                >
                  <span className="grid size-14 place-items-center rounded-full bg-[#0284c7] text-white shadow-[0_8px_20px_rgba(2,132,199,.4)] ring-4 ring-white transition group-hover:bg-[#0369a1] group-active:bg-[#0369a1] group-focus-visible:ring-[#0369a1]/40">
                    <Icon className="size-[26px]" strokeWidth={2.5} aria-hidden />
                  </span>
                  <span className="text-[11px] font-semibold leading-none text-[#0369a1]">
                    {tab.label}
                  </span>
                </Link>
              </li>
            );
          }

          const active = current === tab.href;

          return (
            <li key={tab.href} className="flex flex-1">
              <Link
                href={tab.href}
                data-tour={"tour" in tab ? tab.tour : undefined}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium leading-none outline-none transition focus-visible:bg-slate-100 ${
                  active ? "text-[#0284c7]" : "text-[#64748b] hover:text-[#0f172a]"
                }`}
              >
                <Icon
                  className="size-6"
                  strokeWidth={active ? 2.25 : 2}
                  aria-hidden
                />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
