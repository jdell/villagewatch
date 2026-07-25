/*
 * VillageWatch service worker.
 *
 * Its entire job is to answer a navigation that the network could not, with
 * `/offline.html`. That is the whole feature. It exists so that an installed
 * VillageWatch on a phone in a lane with no signal opens something that explains
 * itself instead of the browser's dinosaur.
 *
 * ## What it deliberately does not cache
 *
 * **No HTML, ever.** Every page behind `/(app)` is one village's data rendered
 * for one signed-in resident: the map, the incident list, a report's detail
 * page. Caching those would leave a village's reports on the device after sign
 * out, readable by the next person to open the browser — on a shared family
 * tablet that is a data breach with a service worker's name on it.
 *
 * **Nothing under `/api`.** `next.config.ts` already sends `no-store` on every
 * API response, and the CSV export in particular is one village's reports.
 *
 * **No Supabase Storage responses.** Media is served through signed URLs that
 * expire in an hour; a cached copy would outlive the signature it was granted
 * under, which is the one property a signed URL exists to have.
 *
 * So the cache holds exactly two things: the offline page, and the icon files
 * the manifest points at. Both are public, static and identical for everyone.
 *
 * ## Coexisting with OneSignal
 *
 * OneSignal's worker is registered separately, at `/onesignal/` scope, by
 * `src/components/push-registration.tsx`. A scope can have only one controlling
 * registration, so if both were at `/` the second to register would silently
 * replace the first — which, depending on the order, is either no offline page
 * or no push notifications, with nothing on screen to say which. Push does not
 * need to control the page to receive a push event, so OneSignal is the one that
 * moved.
 *
 * Bump `CACHE_VERSION` whenever `offline.html` changes. `activate` deletes every
 * cache that is not the current one.
 */

const CACHE_VERSION = "villagewatch-v1";
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);

      // Individually rather than `addAll`, which rejects the whole install if
      // any single request fails. A missing icon should not cost the offline
      // page — that is the one entry that actually matters.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));

      // Take over straight away rather than waiting for every tab to close.
      // There is no old worker whose behaviour we could break: this one only
      // ever answers requests the network already refused.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();

      await Promise.all(
        names
          .filter((name) => name.startsWith("villagewatch-") && name !== CACHE_VERSION)
          .map((name) => caches.delete(name)),
      );

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Navigations only. Every other request — RSC payloads, JSON, map tiles,
  // signed media URLs — goes straight to the network untouched, which is what
  // keeps this worker out of the way of the actual application.
  if (request.mode !== "navigate") return;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cross-origin navigations are not ours to answer.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        // Network first, always. The response is used and thrown away — see
        // the note above about never caching a signed-in page.
        return await fetch(request);
      } catch {
        const cached = await caches.match(OFFLINE_URL);

        return (
          cached ??
          new Response(
            "You are offline, and the offline page was not available.",
            {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            },
          )
        );
      }
    })(),
  );
});
