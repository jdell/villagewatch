import { ImageResponse } from "next/og";
import { getPublicIncidentPreview } from "@/lib/public-incident";
import {
  APP_HOST,
  APP_NAME,
  APP_TAGLINE,
  INCIDENT_TYPE_LABELS,
  SEVERITY_META,
} from "@/lib/constants";

/**
 * The card a shared incident link renders as — in WhatsApp, in a Facebook post,
 * in a Slack unfurl.
 *
 * The root `opengraph-image.tsx` already covers every route that does not
 * export its own, so this file exists only because a per-incident card is a
 * materially better one: "Vehicle crime reported near Histon & Impington" stops
 * somebody who lives there scrolling, and the generic tagline does not.
 *
 * It carries exactly what the page's own metadata carries — category, severity,
 * village — and for the same reasons. No title, no description, no landmark. An
 * image is the worst possible place to put anything sensitive: it is fetched by
 * crawlers, cached by third parties for as long as they like, and it survives
 * the report being archived or erased.
 *
 * ## The constraints, restated from the root card because they still bite
 *
 * Satori supports a subset of CSS. Flexbox and absolute positioning work; grid,
 * floats and most shorthands do not, and **every element with more than one
 * child needs an explicit `display: "flex"`**. There is no access to Tailwind's
 * custom properties, so the brand colours are hex here — they are
 * `--color-brand-*` in `globals.css` and the two are only checked by eye. The
 * severity colour is the one exception worth noting: it comes from
 * `SEVERITY_META[…].pin`, which is already hex precisely so Leaflet and this
 * kind of surface can share it with the badge.
 *
 * No `fonts` array, so this uses the bundled default — fetching one would put a
 * network call on the critical path of `npm run build`.
 */

export const alt = `An incident reported on ${APP_NAME}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The docs note that a generated image is statically optimised by default. This
 * one reads the database per incident and has to be rendered on demand.
 */
export const dynamic = "force-dynamic";

type ImageProps = { params: Promise<{ id: string }> };

export default async function IncidentOpenGraphImage({ params }: ImageProps) {
  const { id } = await params;
  const preview = await getPublicIncidentPreview(id);

  /**
   * A card is still owed even when the lookup comes back empty — the page will
   * 404, but a crawler may have the image URL from an earlier fetch, and a
   * broken image in a WhatsApp thread is worse than a plain branded one.
   */
  const headline = preview
    ? `Incident reported near ${preview.village.name}`
    : APP_TAGLINE;

  const typeLabel = preview ? INCIDENT_TYPE_LABELS[preview.type] : null;
  const severity = preview ? SEVERITY_META[preview.severity] : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          // `--color-brand-950` through `--color-brand-600`.
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

          <div
            style={{
              display: "flex",
              fontSize: 48,
              fontWeight: 700,
              color: "#ffffff",
            }}
          >
            {APP_NAME}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {typeLabel && severity && (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  backgroundColor: "rgba(255,255,255,0.12)",
                  borderRadius: 999,
                  padding: "12px 26px",
                  fontSize: 28,
                  fontWeight: 600,
                  color: "#ffffff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    backgroundColor: severity.pin,
                  }}
                />
                {typeLabel}
              </div>

              <div
                style={{
                  display: "flex",
                  fontSize: 26,
                  color: "#bfdbfe",
                }}
              >
                {severity.label} severity
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              maxWidth: 980,
            }}
          >
            {headline}
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
            {preview
              ? "Register to see the full report, the location and what else has been reported nearby."
              : "Community safety reporting for villages and neighbourhoods."}
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
