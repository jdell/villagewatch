import type { Metadata } from "next";
import Link from "next/link";
import { Home, MapPinOff, UserPlus } from "lucide-react";
import {
  StatusScreen,
  primaryActionClass,
  secondaryActionClass,
} from "@/components/status-screen";

/**
 * The 404 for a shared incident link.
 *
 * The root `not-found.tsx` already renders a branded 404, and this one exists
 * because its **actions are wrong for this visitor**. That page offers "Go to
 * the map" first, which is in `PROTECTED_ROUTES` — so somebody who followed a
 * WhatsApp link to a report that has gone would be bounced to `/login`, asked
 * to sign in to an account they have never had, having arrived from a message
 * that promised them something to look at. A nested `not-found.tsx` is scoped
 * to this segment, so it takes over for `notFound()` thrown by `page.tsx` and
 * leaves every other 404 in the app alone.
 *
 * The copy is deliberately vague about *why*, and that is the same reasoning
 * the root page carries: a report that was withdrawn, one turned down at
 * review, one still in the queue and one that never existed all land here with
 * the same words. Saying which would confirm that a report exists to somebody
 * holding a link they should not have (domain rule 6), and out here there is
 * not even a session to have narrowed that down.
 */

/**
 * Rendered per request, so the CSP nonce reaches this page's scripts — the same
 * reason the root `not-found.tsx` carries this line. Prerendered, the scripts
 * go out bare and `'strict-dynamic'` blocks every one of them: the HTML
 * arrives, React never hydrates, and nothing in a server log says so.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Report not found",
  robots: { index: false, follow: false },
};

export default function IncidentNotFound() {
  return (
    <StatusScreen
      icon={<MapPinOff className="size-7" aria-hidden />}
      code="404"
      title="That report is not available"
      actions={
        <>
          <Link href="/register" className={primaryActionClass}>
            <UserPlus className="size-4" aria-hidden />
            Register your village
          </Link>
          <Link href="/" className={secondaryActionClass}>
            <Home className="size-4" aria-hidden />
            What is VillageWatch?
          </Link>
        </>
      }
    >
      <p>
        The link you followed does not lead to a report we can show you. It may
        have been withdrawn by the person who filed it, or it may never have
        been published.
      </p>
      <p className="mt-3">
        VillageWatch is a neighbourhood watch your village runs itself. If yours
        is on it, your coordinator can give you the join code.
      </p>
    </StatusScreen>
  );
}
