import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/constants";
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

export const metadata: Metadata = {
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

  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
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
   * `env(safe-area-inset-*)` themselves — the app shell's sticky header and the
   * push prompt already sit inside padded containers.
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
        <Toaster position="top-center" richColors closeButton />
        {/* Renders nothing; registers the offline worker in production only. */}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
