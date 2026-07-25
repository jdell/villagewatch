"use client";

import { useCallback, useEffect, useState } from "react";
import Script from "next/script";
import { toast } from "sonner";
import { Bell, X } from "lucide-react";

/**
 * Web push enrolment, and the prompt that asks for it.
 *
 * Three decisions worth knowing about:
 *
 * 1. **The browser prompt is never triggered on load.** Chrome and Firefox
 *    permanently block a site that asks on arrival, and a resident who dismisses
 *    it once can never be asked again from the same origin. So the SDK
 *    initialises silently, an in-app banner explains what the alerts are for,
 *    and `requestPermission()` runs only from that button's click handler —
 *    which is also the user gesture Safari requires.
 *
 * 2. **The identity is `OneSignal.login(userId)`, not a stored subscription.**
 *    The server targets residents by external id (see
 *    `src/lib/notifications.ts`), so a device that reinstalls or a resident
 *    adding a second phone needs no bookkeeping on our side. `User.pushSubscription`
 *    stays unused — it is the VAPID-era column and OneSignal does not need it.
 *
 * 3. **Nothing here blocks the app.** With no `NEXT_PUBLIC_ONESIGNAL_APP_ID`
 *    the component renders nothing at all, and a failed init is logged rather
 *    than surfaced. Push is the extra; the map is the product.
 */

const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ?? "";

/** Remembers a dismissal so the banner is not the first thing seen every visit. */
const DISMISSED_KEY = "villagewatch:push-prompt-dismissed";

type OneSignalApi = {
  init(options: Record<string, unknown>): Promise<void>;
  login(externalId: string): Promise<void>;
  Notifications: {
    permission: boolean;
    requestPermission(): Promise<void>;
  };
};

declare global {
  interface Window {
    // The SDK snippet replaces this array with the real object once loaded, so
    // pushing a callback works both before and after that swap.
    OneSignalDeferred?: Array<(oneSignal: OneSignalApi) => void | Promise<void>>;
  }
}

export function PushRegistration({
  userId,
  enabled,
}: {
  /** Supabase auth user id — becomes the OneSignal external id. */
  userId: string;
  /** The resident's `notifyPush` preference. False means do not even ask. */
  enabled: boolean;
}) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [busy, setBusy] = useState(false);

  const configured = APP_ID.length > 0;

  useEffect(() => {
    if (!configured || !enabled) return;

    window.OneSignalDeferred ??= [];

    window.OneSignalDeferred.push(async (oneSignal) => {
      try {
        await oneSignal.init({
          appId: APP_ID,
          // Without this the SDK refuses to run on http://localhost, which is
          // where the whole feature gets developed.
          allowLocalhostAsSecureOrigin: true,
          // Re-subscribes a device whose push subscription the browser rotated,
          // which otherwise looks like a resident silently going quiet.
          autoResubscribe: true,
          // No `promptOptions` on purpose: with none configured the v16 SDK
          // shows nothing of its own, which is what leaves the asking to our
          // banner and its click handler. If auto-prompting is ever switched
          // on in the OneSignal dashboard it will override this.
        });

        // Ties this browser to the resident, so the server can address them by
        // id rather than having to store a subscription.
        await oneSignal.login(userId);

        const alreadyDecided =
          oneSignal.Notifications.permission ||
          (typeof Notification !== "undefined" &&
            Notification.permission !== "default");

        const dismissed =
          window.localStorage.getItem(DISMISSED_KEY) === "1";

        setShowPrompt(!alreadyDecided && !dismissed);
      } catch (cause) {
        // A blocked third-party script, a browser with no service worker
        // support, an ad blocker. None of them are worth a message on screen.
        console.warn("Push notifications are unavailable", cause);
      }
    });
  }, [configured, enabled, userId]);

  const subscribe = useCallback(async () => {
    setBusy(true);

    window.OneSignalDeferred ??= [];
    window.OneSignalDeferred.push(async (oneSignal) => {
      try {
        await oneSignal.Notifications.requestPermission();

        if (oneSignal.Notifications.permission) {
          toast.success("You will be alerted when something is published nearby.");
        } else {
          toast.info(
            "Notifications stayed off. You can turn them on in your browser settings.",
          );
        }
      } catch (cause) {
        console.warn("Could not request notification permission", cause);
        toast.error("This browser would not let us enable notifications.");
      } finally {
        setBusy(false);
        setShowPrompt(false);
      }
    });
  }, []);

  const dismiss = useCallback(() => {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setShowPrompt(false);
  }, []);

  if (!configured || !enabled) return null;

  return (
    <>
      <Script
        src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
        strategy="afterInteractive"
      />

      {showPrompt && (
        <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-lg sm:inset-x-auto sm:right-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Bell className="size-5" aria-hidden />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                Get alerted when it happens near you
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                We will notify you when a coordinator publishes a report close to
                home. You choose how close in Settings.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={subscribe}
                  disabled={busy}
                  className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-3.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
                >
                  Turn on alerts
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-slate-500 transition hover:text-slate-700"
                >
                  Not now
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
