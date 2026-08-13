import { ImageResponse } from "next/og";
import {
  APP_DESCRIPTION,
  APP_HOST,
  APP_NAME,
  APP_TAGLINE,
} from "@/lib/constants";

/**
 * The card that renders when a link to VillageWatch is pasted anywhere.
 *
 * A file convention rather than a committed PNG, and rendered from the same
 * constants and the same shield as the rest of the app — so a change to the
 * tagline cannot leave a stale image behind saying the old one. It applies to
 * every route that does not export its own, which is all of them.
 *
 * `twitter-image.tsx` beside this file re-exports it. Next fills `og:image` from
 * this convention and `twitter:image` from that one; without the second file a
 * Twitter card falls back to `summary` with no picture at all.
 *
 * ## Two constraints worth knowing before editing
 *
 * Satori — what `next/og` renders with — supports a **subset** of CSS. Flexbox
 * and absolute positioning work; grid, floats and most shorthands do not, and
 * every element with more than one child needs an explicit `display: "flex"`.
 * It also has no access to Tailwind's custom properties, so the brand colours
 * are written out as hex here. They are `--color-brand-*` in `globals.css`, and
 * the two are only checked by eye.
 *
 * No `fonts` array is passed, so this uses the bundled default. That is
 * deliberate: fetching a font at build time would put a network call on the
 * critical path of `npm run build`, and a CI runner without egress would fail
 * the build over a picture.
 */

export const alt = `${APP_NAME} — ${APP_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          // `--color-brand-950` and `--color-brand-800`.
          backgroundColor: "#0f2557",
          backgroundImage:
            "linear-gradient(135deg, #0f2557 0%, #1e40af 60%, #2563eb 100%)",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 88,
              height: 88,
              borderRadius: 24,
              backgroundColor: "#ffffff",
            }}
          >
            {/* The mark from `src/components/logo.tsx`, at 56px. */}
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2.5 4.5 5.6v6.2c0 4.6 3.1 8.8 7.5 10 4.4-1.2 7.5-5.4 7.5-10V5.6L12 2.5Z"
                stroke="#2563eb"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path d="M8.4 12.4 12 9.3l3.6 3.1v3.9H8.4v-3.9Z" fill="#2563eb" />
            </svg>
          </div>

          <div style={{ display: "flex", fontSize: 56, fontWeight: 700, color: "#ffffff" }}>
            {APP_NAME}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              fontSize: 68,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            {APP_TAGLINE}
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "#bfdbfe",
              lineHeight: 1.4,
              maxWidth: 900,
            }}
          >
            {APP_DESCRIPTION}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: "#93c5fd",
            letterSpacing: "0.04em",
          }}
        >
          {APP_HOST}
        </div>
      </div>
    ),
    size,
  );
}
