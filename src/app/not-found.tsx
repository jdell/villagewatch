import type { Metadata } from "next";
import Link from "next/link";
import { Home, Map, MapPinOff } from "lucide-react";
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
  title: "Page not found",
  robots: { index: false, follow: false },
};

/**
 * The 404, and the place a resident lands when a report has gone.
 *
 * That second case is the common one and the copy is written for it: a
 * withdrawn report, a rejected one, or one from another village all end up here
 * rather than at a page saying "forbidden", because telling someone a report
 * exists but is not theirs to read is itself a disclosure.
 */
export default function NotFound() {
  return (
    <StatusScreen
      icon={<MapPinOff className="size-7" aria-hidden />}
      code="404"
      title="We cannot find that"
      actions={
        <>
          <Link href="/map" className={primaryActionClass}>
            <Map className="size-4" aria-hidden />
            Go to the map
          </Link>
          <Link href="/" className={secondaryActionClass}>
            <Home className="size-4" aria-hidden />
            Back to home
          </Link>
        </>
      }
    >
      <p>
        The page you were after does not exist. If you followed a link to a
        report, it may have been withdrawn by the person who filed it, turned
        down at review, or it belongs to a different village.
      </p>
    </StatusScreen>
  );
}
