"use client";

import { useSyncExternalStore } from "react";

/**
 * One route, two renderings by width — how `/incidents` and `/trends` are the
 * List and Trends *sheets over the map* on a phone,
 * and stay the pages they have always been from `lg` up, where there is no tab
 * bar and the sidebar is the navigation.
 *
 * The decision is the viewport's, which the server cannot know, so both
 * renderings arrive and each is shown at its own width. What the CSS alone
 * would not do is stop the hidden one *mounting*: a map hidden on a desktop
 * would still load Leaflet and the tiles. So the narrow rendering mounts only
 * once the browser says the screen is narrow — `useSyncExternalStore` over
 * `matchMedia`, with a `false` server snapshot — and the wide one is always in
 * the document, so a desktop paints it on the first frame with nothing to
 * swap.
 */

const NARROW = "(max-width: 1023.98px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function NarrowScreenSwitch({
  narrow,
  children,
}: {
  /** What a phone gets — the map with its sheet open. */
  narrow: React.ReactNode;
  /** What a desktop gets — the page as it always was. */
  children: React.ReactNode;
}) {
  const isNarrow = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );

  return (
    <>
      <div className="lg:hidden">{isNarrow ? narrow : null}</div>
      <div className="hidden lg:block">{children}</div>
    </>
  );
}
