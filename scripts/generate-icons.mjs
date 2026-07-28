import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Renders the VillageWatch favicons and app icons from the brand mark.
 *
 * Run it with `node scripts/generate-icons.mjs`. The files it writes are
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
 * resident ends up unsure they installed the right thing. That constraint is
 * also why there is one generator rather than one per surface — a browser tab,
 * an Android launcher and an iOS home screen all show the same shield, and the
 * only thing that varies between them is how much of it survives the size.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = join(ROOT, "public");
const ICONS_DIR = join(PUBLIC_DIR, "icons");

/** brand-500 → brand-700, the same gradient the header mark sits on. */
const GRADIENT_FROM = "#3b82f6";
const GRADIENT_TO = "#1d4ed8";

/** The two paths from the Logo component, in a 24×24 viewBox. */
const SHIELD =
  "M12 2.5 4.5 5.6v6.2c0 4.6 3.1 8.8 7.5 10 4.4-1.2 7.5-5.4 7.5-10V5.6L12 2.5Z";
const HOUSE = "M8.4 12.4 12 9.3l3.6 3.1v3.9H8.4v-3.9Z";

/**
 * Three weights of the same mark, one per size band.
 *
 * `outline` is the header treatment: a 1.6px-stroked shield with a solid house
 * inside it. It is what every icon above 48px uses, so the launcher icon and the
 * sidebar logo are the same drawing.
 *
 * `solid` exists because that stroke does not survive a favicon. At 32px the
 * mark spans about 27 pixels, so a 1.6/24 stroke lands near one — it renders as
 * a grey suggestion of a shield rather than a line. The solid variant fills the
 * shield white instead and knocks the house out of it: the same silhouette, the
 * same idea, drawn with the only two tones that size has room for.
 *
 * The knocked-out house is painted with the background gradient rather than a
 * flat blue, which is why the gradient is `userSpaceOnUse` — it is measured
 * across the whole canvas, so the house matches the pixels either side of it
 * exactly instead of compressing a second gradient into a 7px shape.
 *
 * `silhouette` drops the house altogether, and only 16px uses it. At that size
 * the house is about four pixels across and the walls either side of it are one,
 * so the cut-out stops reading as a house and starts eating the shield: what
 * renders is a white ring with a blue dot in it, which at a glance is a keyhole.
 * Removing it is what puts the shield's tapered point back. Losing the house on
 * the smallest icon in the set costs nothing that size could have conveyed
 * anyway, and every surface with the room to show it still does.
 *
 * @param {object} options
 * @param {number} options.size            Canvas edge in pixels.
 * @param {number} options.markFraction    How much of the edge the mark spans.
 * @param {number} options.cornerFraction  Corner radius as a fraction of the edge.
 * @param {"outline" | "solid" | "silhouette"} options.variant
 */
function markup({ size, markFraction, cornerFraction, variant }) {
  const mark = size * markFraction;
  const scale = mark / 24;
  const offset = (size - mark) / 2;
  const radius = size * cornerFraction;

  const glyph = {
    silhouette: `<path d="${SHIELD}" fill="#ffffff"/>`,
    solid: `<path d="${SHIELD}" fill="#ffffff"/>
    <path d="${HOUSE}" fill="url(#bg)"/>`,
    outline: `<g fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round">
      <path d="${SHIELD}"/>
      <path d="${HOUSE}" fill="#ffffff" stroke="none"/>
    </g>`,
  }[variant];

  if (!glyph) throw new Error(`Unknown variant "${variant}".`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${size}" y2="${size}">
      <stop offset="0" stop-color="${GRADIENT_FROM}"/>
      <stop offset="1" stop-color="${GRADIENT_TO}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#bg)"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    ${glyph}
  </g>
</svg>`;
}

/**
 * The set a browser tab and a PWA actually need.
 *
 * - The two favicon PNGs are what a modern browser picks up. Both are drawn
 *   nearly edge to edge — a tab favicon is 16 physical pixels and every one
 *   spent on padding is one not spent on the shield.
 * - `any` icons are drawn as the launcher receives them, so they carry their own
 *   rounded corners.
 * - `maskable` icons are cropped by the launcher to whatever shape the device
 *   prefers — a circle on most Android skins. They are square to the edge and
 *   the mark is smaller, so nothing important sits outside the safe zone.
 * - The Apple touch icon is square and opaque because iOS applies its own mask
 *   and renders transparency as black.
 *
 * The file names are the conventional ones rather than this project's own,
 * because they are the names a browser, an Android launcher and every favicon
 * checker already expect to find at the site root.
 */
const ICONS = [
  { file: "favicon-16x16.png", dir: PUBLIC_DIR, size: 16, markFraction: 0.84, cornerFraction: 0.16, variant: "silhouette" },
  { file: "favicon-32x32.png", dir: PUBLIC_DIR, size: 32, markFraction: 0.84, cornerFraction: 0.18, variant: "solid" },
  { file: "apple-touch-icon.png", dir: PUBLIC_DIR, size: 180, markFraction: 0.56, cornerFraction: 0, variant: "outline" },
  { file: "android-chrome-192x192.png", dir: PUBLIC_DIR, size: 192, markFraction: 0.58, cornerFraction: 0.22, variant: "outline" },
  { file: "android-chrome-512x512.png", dir: PUBLIC_DIR, size: 512, markFraction: 0.58, cornerFraction: 0.22, variant: "outline" },
  { file: "icon-maskable-192.png", dir: ICONS_DIR, size: 192, markFraction: 0.46, cornerFraction: 0, variant: "outline" },
  { file: "icon-maskable-512.png", dir: ICONS_DIR, size: 512, markFraction: 0.46, cornerFraction: 0, variant: "outline" },
];

/** The sizes that go inside `favicon.ico`, smallest first. */
const ICO_SIZES = [16, 32];

/**
 * Packs PNGs into an ICO container.
 *
 * `.ico` is still worth shipping despite every current browser preferring the
 * PNG links: it is what a bookmark bar, a pinned tab and anything reading the
 * site root by convention reaches for, and it is the one icon request that
 * arrives with no HTML in front of it to say where else to look.
 *
 * The format is a 6-byte directory header, one 16-byte entry per image, then the
 * image data. Entries may hold PNG bytes verbatim — which is what every size
 * here does, so there is no BMP encoding to get wrong. A 256px image would be
 * written as 0 in the single width byte; nothing here is that big, and the
 * assertion below is what keeps a future edit from finding that out silently.
 *
 * @param {Array<{ size: number, png: Buffer }>} images
 */
function buildIco(images) {
  const HEADER = 6;
  const ENTRY = 16;

  const header = Buffer.alloc(HEADER);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = HEADER + ENTRY * images.length;

  const entries = images.map(({ size, png }) => {
    if (size < 1 || size > 255) {
      throw new Error(`ICO entries must be 1–255px; got ${size}.`);
    }

    const entry = Buffer.alloc(ENTRY);
    entry.writeUInt8(size, 0); // width
    entry.writeUInt8(size, 1); // height
    entry.writeUInt8(0, 2); // palette size — 0 for truecolour
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);

    offset += png.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

/** @param {(typeof ICONS)[number]} icon */
async function render(icon) {
  return sharp(Buffer.from(markup(icon))).png({ compressionLevel: 9 }).toBuffer();
}

await mkdir(PUBLIC_DIR, { recursive: true });
await mkdir(ICONS_DIR, { recursive: true });

/** @type {Map<number, Buffer>} */
const rendered = new Map();

for (const icon of ICONS) {
  const png = await render(icon);
  rendered.set(icon.size, png);

  await writeFile(join(icon.dir, icon.file), png);
  console.log(`  ${icon.file}  ${icon.size}×${icon.size}  ${png.length} bytes`);
}

const ico = buildIco(
  ICO_SIZES.map((size) => {
    const png = rendered.get(size);
    if (!png) throw new Error(`favicon.ico wants a ${size}px render and ICONS has none.`);
    return { size, png };
  }),
);

await writeFile(join(PUBLIC_DIR, "favicon.ico"), ico);
console.log(`  favicon.ico  ${ICO_SIZES.join(" + ")}  ${ico.length} bytes`);

console.log(`\nWrote ${ICONS.length + 1} files.`);
