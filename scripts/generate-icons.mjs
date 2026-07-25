import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Renders the VillageWatch app icons from the brand mark.
 *
 * Run it with `node scripts/generate-icons.mjs`. The PNGs it writes are
 * committed, so this is an authoring tool rather than a build step — nothing in
 * `npm run build` calls it, and a clone with no `sharp` still builds.
 *
 * `sharp` is not a dependency of this project. It arrives with Next.js, which
 * uses it for image optimisation, and it is borrowed here because it is already
 * installed and can rasterise SVG. If Next ever drops it, this script stops
 * working and the committed icons carry on being fine — which is the right way
 * round for a tool that runs roughly once a year.
 *
 * The mark itself is the shield-around-a-house from `src/components/logo.tsx`.
 * Keep the two in step: an app icon that does not match the header is how a
 * resident ends up unsure they installed the right thing.
 */

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../public/icons");

/** brand-500 → brand-700, the same gradient the header mark sits on. */
const GRADIENT_FROM = "#3b82f6";
const GRADIENT_TO = "#1d4ed8";

/** The two paths from the Logo component, in a 24×24 viewBox. */
const SHIELD =
  "M12 2.5 4.5 5.6v6.2c0 4.6 3.1 8.8 7.5 10 4.4-1.2 7.5-5.4 7.5-10V5.6L12 2.5Z";
const HOUSE = "M8.4 12.4 12 9.3l3.6 3.1v3.9H8.4v-3.9Z";

/**
 * @param {object} options
 * @param {number} options.size            Canvas edge in pixels.
 * @param {number} options.markFraction    How much of the edge the mark spans.
 * @param {number} options.cornerFraction  Corner radius as a fraction of the edge.
 */
function markup({ size, markFraction, cornerFraction }) {
  const mark = size * markFraction;
  const scale = mark / 24;
  const offset = (size - mark) / 2;
  const radius = size * cornerFraction;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GRADIENT_FROM}"/>
      <stop offset="1" stop-color="${GRADIENT_TO}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#bg)"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round">
    <path d="${SHIELD}"/>
    <path d="${HOUSE}" fill="#ffffff" stroke="none"/>
  </g>
</svg>`;
}

/**
 * The set a PWA actually needs.
 *
 * - `any` icons are drawn as the launcher receives them, so they carry their own
 *   rounded corners.
 * - `maskable` icons are cropped by the launcher to whatever shape the device
 *   prefers — a circle on most Android skins. They are square to the edge and
 *   the mark is smaller, so nothing important sits outside the safe zone.
 * - The Apple touch icon is square and opaque because iOS applies its own mask
 *   and renders transparency as black.
 */
const ICONS = [
  { file: "icon-192.png", size: 192, markFraction: 0.58, cornerFraction: 0.22 },
  { file: "icon-512.png", size: 512, markFraction: 0.58, cornerFraction: 0.22 },
  { file: "icon-maskable-192.png", size: 192, markFraction: 0.46, cornerFraction: 0 },
  { file: "icon-maskable-512.png", size: 512, markFraction: 0.46, cornerFraction: 0 },
  { file: "apple-touch-icon.png", size: 180, markFraction: 0.56, cornerFraction: 0 },
];

await mkdir(OUT_DIR, { recursive: true });

for (const icon of ICONS) {
  const svg = markup(icon);
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();

  await writeFile(join(OUT_DIR, icon.file), png);
  console.log(`  ${icon.file}  ${icon.size}×${icon.size}  ${png.length} bytes`);
}

console.log(`\nWrote ${ICONS.length} icons to public/icons/.`);
