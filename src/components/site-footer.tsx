import Link from "next/link";
import { Logo } from "@/components/logo";
import { APP_NAME, GITHUB_URL, VERSION_LABEL } from "@/lib/constants";

/**
 * The public footer, shared by the landing page and the legal pages.
 *
 * Extracted from `src/app/page.tsx` on Day 5 rather than copied: the privacy
 * policy and terms have to be reachable from every public page, and a footer
 * that exists in two places is a footer where one copy loses a link.
 *
 * `showProductLinks` is off by default because the product links are anchors
 * into the landing page's own sections — rendering them on `/privacy` would
 * give a resident three links that scroll nowhere.
 */
export function SiteFooter({
  showProductLinks = false,
}: {
  showProductLinks?: boolean;
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-brand-950 text-brand-200">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Link href="/" className="text-white">
              <Logo />
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed">
              Community safety reporting for villages and neighbourhoods.
              Report in seconds, anonymised by default, mapped for everyone.
            </p>
          </div>

          {showProductLinks && (
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
                <li>
                  <a href="#parish-councils" className="transition hover:text-white">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#faq" className="transition hover:text-white">
                    Questions
                  </a>
                </li>
              </ul>
            </div>
          )}

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

          <div>
            <h3 className="text-sm font-semibold text-white">Legal</h3>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <Link href="/privacy" className="transition hover:text-white">
                  Privacy policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="transition hover:text-white">
                  Terms of use
                </Link>
              </li>
              <li>
                {/*
                  Leaves the site, so it is an <a> rather than a <Link>.
                  `noopener` is belt and braces — `Cross-Origin-Opener-Policy`
                  in next.config.ts already severs `window.opener` — and
                  `noreferrer` keeps the path of whichever page it was clicked
                  from out of GitHub's referrer log.
                */}
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-white"
                >
                  Source on GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-8 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {APP_NAME}. All rights reserved.
            {/*
              The build, on the public footer as well as inside the app. A
              parish clerk reporting something odd on the landing page has no
              other way to say which deployment they were looking at, and this
              is the page somebody lands on before they have an account at all.
            */}
            {VERSION_LABEL && (
              <span className="ml-2 text-brand-400">{VERSION_LABEL}</span>
            )}
          </p>
          <p className="text-brand-300">
            In an emergency, always call the emergency services first.
          </p>
        </div>
      </div>
    </footer>
  );
}
