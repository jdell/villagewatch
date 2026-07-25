import type { Metadata } from "next";
import Link from "next/link";
import { Home, Map, MapPinOff } from "lucide-react";
import {
  StatusScreen,
  primaryActionClass,
  secondaryActionClass,
} from "@/components/status-screen";

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
