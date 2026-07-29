/**
 * The Twitter card image.
 *
 * The same picture as `opengraph-image.tsx`, re-exported rather than redrawn.
 * Next fills `og:image` from that convention and `twitter:image` from this one,
 * and with no file here a `summary_large_image` card — which the root layout
 * declares — falls back to a bare text card.
 */
export { alt, size, contentType, default } from "./opengraph-image";
