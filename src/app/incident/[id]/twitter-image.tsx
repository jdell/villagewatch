/**
 * The Twitter card for a shared incident.
 *
 * The same picture as `opengraph-image.tsx` beside it, re-exported rather than
 * redrawn — the root pair does exactly this and for the same reason. Next fills
 * `og:image` from that convention and `twitter:image` from this one, and with
 * no file here the `summary_large_image` card the page declares falls back to a
 * bare text card.
 *
 * `dynamic` is declared here rather than re-exported with the rest. Next reads
 * route segment config by static analysis, and a re-exported binding is not
 * reliably seen — which would leave this route statically optimised and every
 * incident sharing one build-time image, while the Open Graph route beside it
 * rendered correctly. The two have to agree, so it is written out.
 */
export const dynamic = "force-dynamic";

export { alt, size, contentType, default } from "./opengraph-image";
