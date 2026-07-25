"use client";

import { useEffect } from "react";

/**
 * Registers `public/sw.js`, which is what makes VillageWatch installable and
 * gives it an offline page.
 *
 * Three decisions worth knowing about:
 *
 * 1. **Production only.** A service worker in `npm run dev` intercepts
 *    navigations and outlives the dev server, which turns "my change did not
 *    appear" into a twenty-minute detour through DevTools → Application. There
 *    is nothing to test locally anyway: the worker's whole behaviour is what
 *    happens when `fetch` throws.
 *
 * 2. **Root scope, and it is the only thing at root scope.** OneSignal's worker
 *    was moved to `/onesignal/` for exactly this reason — see the header of
 *    `public/sw.js`.
 *
 * 3. **A failure is a warning, not an error.** Private browsing, an enterprise
 *    policy and an ad blocker all refuse registration, and none of them stop
 *    the app working. The offline page is the extra; the map is the product.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // After load, so registration never competes with the first render for
    // bandwidth on the connection this is meant to help.
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((cause) => {
        console.warn("Service worker registration failed", cause);
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
