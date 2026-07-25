/*
 * OneSignal service worker.
 *
 * The filename matters: the OneSignal web SDK looks for this exact path at the
 * site root unless it is told otherwise, and a 404 here fails silently — the
 * page reports a healthy init and no push ever arrives.
 *
 * It is one importScripts line on purpose. Everything push-related lives in
 * OneSignal's worker; adding our own handlers here would mean owning the
 * notificationclick and push events, which is a good way to break delivery
 * during an SDK upgrade.
 */
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
