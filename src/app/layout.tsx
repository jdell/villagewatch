import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_ORIGIN,
  APP_TAGLINE,
} from "@/lib/constants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

/**
 * The origin every relative URL in this metadata resolves against.
 *
 * A preview deployment should describe itself, not production, so
 * `NEXT_PUBLIC_APP_URL` wins where it is set; `APP_ORIGIN` is the fallback.
 * Without a base at all, Next resolves Open Graph and canonical URLs against
 * `localhost` in development and warns in the build — so a shared link would
 * carry a host nobody else can reach.
 */
const metadataBase = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? APP_ORIGIN);
  } catch {
    return new URL(APP_ORIGIN);
  }
})();

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: [
    "neighbourhood watch",
    "community safety",
    "incident reporting",
    "village",
    "crime map",
  ],
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    url: "/",
    locale: "en_GB",
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description: APP_DESCRIPTION,
  },
  robots: { index: true, follow: true },

  /**
   * Installable on a phone without an app store. `public/manifest.json` carries
   * the icons, the standalone display mode and the two shortcuts; this is the
   * `<link rel="manifest">` that points at it.
   *
   * The start URL is `/map` rather than `/`, so a resident who has installed
   * VillageWatch lands on their village instead of the marketing page. Signed
   * out, `src/proxy.ts` bounces them to `/login` — which is the right first
   * screen for someone opening an app they installed but have not joined with.
   */
  manifest: "/manifest.json",

  /**
   * Rendered by `scripts/generate-icons.mjs` from the same shield the header
   * mark uses. `sizes: "any"` on the `.ico` is what stops a browser preferring
   * it over the PNGs — without it, Chrome treats an unsized `.ico` as a better
   * match than a declared 32×32 and shows the lower-fidelity one.
   *
   * There is deliberately no `src/app/favicon.ico`. Next's file convention would
   * serve that at the same path and conflict with the one in `public/`, and the
   * file that was there was Create Next App's own — the actual bug this set
   * replaces.
   */
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/android-chrome-192x192.png", type: "image/png", sizes: "192x192" },
      { url: "/android-chrome-512x512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },

  /**
   * iOS ignores the manifest's `display` and reads these instead. Without them
   * an icon added to the home screen opens in Safari with its chrome intact,
   * which is not what someone who installed an app expects.
   *
   * `black-translucent` lets the brand header run under the status bar, which
   * is why `viewport.viewportFit` is `cover` below.
   */
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black-translucent",
  },

  /** Phone numbers in report text are not the reporter's; do not linkify them. */
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0f2557",
  width: "device-width",
  initialScale: 1,
  /**
   * Fills the notch area on an installed iOS app. Pages then have to respect
   * `env(safe-area-inset-*)` themselves — and this comment asserted they did
   * for a good deal longer than it was true. With `black-translucent` above,
   * the web view spans the whole screen and the status bar is composited over
   * the top of it, so anything at `top-0` is drawn under the clock rather than
   * below it. In portrait that inset is 59px on a Dynamic Island phone and 47px
   * on a notch; in landscape it is 0, the notch becoming a left/right inset
   * instead — which is why the navigation button was reachable only sideways.
   *
   * Padded now: the app shell's top bar and drawer, and the toaster below.
   * Safari reports 0 here in portrait, so none of it moves in a browser — which
   * also means none of it can be verified in one. Use an installed app.
   */
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-white text-slate-900">
        {children}
        {/*
          `mobileOffset` keeps the toast clear of the iOS status bar in an
          installed app. Sonner's own default is 16px from the top, which puts
          a top-centre toast's close button under the clock — the same bug the
          app shell's top bar had, on the control the app reports its errors
          through. Only `top` is passed: sonner falls back to its default for
          every key left undefined, so the other three edges are untouched.
        */}
        <Toaster
          position="top-center"
          richColors
          closeButton
          mobileOffset={{ top: "max(16px, env(safe-area-inset-top))" }}
        />
        {/* Renders nothing; registers the offline worker in production only. */}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
