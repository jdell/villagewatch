import type { Metadata } from "next";
import Link from "next/link";
import { Home, UserRoundX } from "lucide-react";
import {
  StatusScreen,
  primaryActionClass,
  secondaryActionClass,
} from "@/components/status-screen";

/**
 * Rendered per request, so the Content-Security-Policy nonce reaches this
 * page's scripts.
 *
 * `src/proxy.ts` mints a fresh nonce for every request and Next stamps it onto
 * the script tags it renders — but only while it is rendering. Prerendered at
 * build time there is no request to take one from, the scripts go out bare, and
 * `'strict-dynamic'` in `src/lib/csp.ts` then blocks every one of them: the
 * server HTML arrives, React never hydrates, and nothing in a server log says
 * so.
 *
 * Measured rather than assumed — without this line the page serves 0 nonced
 * scripts under `npm run start`, with it, all of them. The cost is a render per
 * request instead of a file from the edge, which at a parish's traffic is not a
 * cost; the alternative is a policy covering only the pages behind a login,
 * which are the pages least in need of one.
 *
 * `export const dynamic` rather than `await connection()`, which Next's CSP
 * guide reaches for first. Both work. This one leaves the component
 * **synchronous**, and `tests/legal-placeholders.test.tsx` renders two of these
 * pages with `react-dom/server`'s synchronous API — an async Server Component
 * suspends there and the suite fails on a page nobody changed.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account closed",
  robots: { index: false, follow: false },
};

/**
 * Where a closed account lands — UK GDPR Article 17.
 *
 * Three routes send someone here and all three are gates rather than links:
 * `POST /api/auth/login` and `/api/auth/callback` refuse the sign-in and
 * redirect, and `(app)/layout.tsx` catches a session that was already open when
 * the account was closed. It sits **outside** the `(app)` group deliberately —
 * that layout is what redirects here, so a page inside it would loop.
 *
 * It is also outside `AUTH_ROUTES` in `src/proxy.ts`, which bounces a signed-in
 * browser off `/login` and `/register`. The tab that closed the account still
 * holds cookies for a second or two, and being bounced to `/map` on the way to
 * an explanation would be the one moment the app looked like it had ignored the
 * request.
 *
 * The sign-out form is a real POST to the logout route rather than a link,
 * because the cookies have to be cleared by a Route Handler — the same reason
 * the button on `/settings` works that way.
 */
export default function AccountClosedPage() {
  return (
    <StatusScreen
      icon={<UserRoundX className="size-7" aria-hidden />}
      code="Closed"
      title="This account is closed"
      actions={
        <>
          <button type="submit" form="sign-out" className={primaryActionClass}>
            Finish signing out
          </button>
          <Link href="/" className={secondaryActionClass}>
            <Home className="size-4" aria-hidden />
            Back to home
          </Link>
        </>
      }
    >
      <p>
        Every report filed from this account has been deleted, along with any
        photos attached to them. Nothing you reported is on the village map any
        more.
      </p>
      <p className="mt-3">
        The record of what a coordinator decided, and when, is kept — that trail
        cannot be deleted on request, and it no longer holds anything you wrote.
        If you want to take part again, register with your village as a new
        resident.
      </p>

      {/*
        Outside the actions above because the buttons sit in a flex row and a
        <form> wrapper there would break the layout. The button targets it by id,
        exactly as the settings screen does.
      */}
      <form id="sign-out" action="/api/auth/logout" method="post" />
    </StatusScreen>
  );
}
