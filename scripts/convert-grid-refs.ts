/**
 * Ordnance Survey grid references to WGS84 latitude / longitude.
 *
 * ## Why this exists when the IPN already has lat/long
 *
 * It does, and `prisma/seed-villages.ts` uses those columns — this is not on
 * the normal path. Two reasons it is here anyway:
 *
 *   1. **Older and other vintages.** The IPN gained `lat`/`long` partway
 *      through its life; releases before that carried only `gridgb1e` /
 *      `gridgb1n`, and several sibling ONS products still do. The seed falls
 *      back to `osgbToWgs84()` for any row whose lat/long is blank, so a place
 *      is dropped for having no location at all rather than for the file being
 *      the wrong shape.
 *   2. **A check on the data.** Converting `gridgb1e`/`gridgb1n` and comparing
 *      against the published `lat`/`long` agrees to about three metres across
 *      the file, which is what you would expect if both were derived from the
 *      same survey point. `--verify` runs that comparison.
 *
 * ## Why `geodesy` rather than the arithmetic
 *
 * Going from an OSGB36 grid reference to WGS84 is a Transverse Mercator inverse
 * projection onto the Airy 1830 ellipsoid followed by a seven-parameter Helmert
 * datum shift. Every step is publicly specified and every step is easy to get
 * subtly wrong in a way that puts a village a few hundred metres into the next
 * parish without anything looking broken. `geodesy` is Chris Veness's reference
 * implementation, MIT, no dependencies of its own, and used here only by these
 * scripts — it is a devDependency and nothing in `src/` imports it.
 *
 * ## Use
 *
 *   // As a library, which is how the seed reaches it:
 *   import { osgbToWgs84 } from "../scripts/convert-grid-refs";
 *   const point = osgbToWgs84(542100, 258900);   // -> { lat, lng } | null
 *
 *   // As a CLI, to add lat/long to a CSV that has none:
 *   npx tsx scripts/convert-grid-refs.ts --in data/ons-places.csv
 *   npx tsx scripts/convert-grid-refs.ts --in data/places.csv --out data/places-latlng.csv
 *   npx tsx scripts/convert-grid-refs.ts --in data/ons-places.csv --verify
 */

import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { parse } from "csv-parse";
import { stringify } from "csv-stringify/sync";
import OsGridRef from "geodesy/osgridref.js";

export type Point = { lat: number; lng: number };

/**
 * The National Grid's extent, in metres from its false origin south-west of the
 * Scilly Isles. Anything outside is not a British grid reference — most often a
 * blank cell that parsed as 0, which would otherwise convert cleanly to a point
 * in the sea off Land's End and look like a real village.
 */
const EASTING_MAX = 700_000;
const NORTHING_MAX = 1_300_000;

/**
 * Converts an OSGB36 easting/northing to WGS84.
 *
 * Returns null rather than throwing for anything unusable — a bad grid
 * reference in one row of a hundred thousand should cost that row, not the run.
 */
export function osgbToWgs84(
  easting: number | string,
  northing: number | string,
): Point | null {
  const e = typeof easting === "string" ? Number(easting.trim()) : easting;
  const n = typeof northing === "string" ? Number(northing.trim()) : northing;

  if (!Number.isFinite(e) || !Number.isFinite(n)) return null;
  if (e <= 0 || n <= 0) return null;
  if (e > EASTING_MAX || n > NORTHING_MAX) return null;

  try {
    const point = new OsGridRef(e, n).toLatLon();
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;
    return { lat: point.lat, lng: point.lon };
  } catch {
    return null;
  }
}

/**
 * Converts an alphanumeric grid reference — `TL 4210 6480`, `NG2705` — to
 * WGS84. The IPN's `grid1km` column is in this form.
 */
export function gridRefToWgs84(gridRef: string): Point | null {
  const trimmed = gridRef.trim();
  if (!trimmed) return null;

  try {
    const point = OsGridRef.parse(trimmed).toLatLon();
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;
    return { lat: point.lat, lng: point.lon };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** Column names differ by vintage; match the shape rather than the year. */
const COLUMNS = {
  easting: /^(gridgb1e|easting|oseast1m|x)$/i,
  northing: /^(gridgb1n|northing|osnrth1m|y)$/i,
  lat: /^(lat|latitude)$/i,
  lng: /^(long|lng|longitude)$/i,
} as const;

/** Metres of disagreement above which `--verify` calls a row out. */
const VERIFY_TOLERANCE_M = 50;

async function main() {
  const { values } = parseArgs({
    options: {
      in: { type: "string" },
      out: { type: "string" },
      verify: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values.help || !values.in) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 1);
  }

  const input = resolve(process.cwd(), values.in);
  const rows = await readCsv(input);

  if (rows.length === 0) {
    console.error(`${values.in} has no rows.`);
    process.exit(1);
  }

  const header = Object.keys(rows[0]!);
  const columns = resolveColumns(header);

  if (!columns.easting || !columns.northing) {
    console.error(
      `${values.in} has no easting/northing columns — looked for ` +
        `${COLUMNS.easting.source} and ${COLUMNS.northing.source}.`,
    );
    process.exit(1);
  }

  if (values.verify) {
    verify(rows, columns);
    return;
  }

  const output = resolve(process.cwd(), values.out ?? values.in);
  const filled = fill(rows, columns);

  await writeFile(output, stringify(rows, { header: true }), "utf8");

  console.log(
    `Filled ${filled.toLocaleString("en-GB")} of ${rows.length.toLocaleString("en-GB")} rows`,
  );
  console.log(`Wrote ${values.out ?? values.in}`);
}

type Row = Record<string, string>;
type Columns = { [K in keyof typeof COLUMNS]: string | undefined };

function resolveColumns(header: readonly string[]): Columns {
  const find = (pattern: RegExp) => header.find((name) => pattern.test(name));

  return {
    easting: find(COLUMNS.easting),
    northing: find(COLUMNS.northing),
    lat: find(COLUMNS.lat),
    lng: find(COLUMNS.lng),
  };
}

/** Writes lat/lng into every row that has none. Mutates `rows` in place. */
function fill(rows: Row[], columns: Columns): number {
  const latKey = columns.lat ?? "lat";
  const lngKey = columns.lng ?? "long";
  let filled = 0;

  for (const row of rows) {
    if (row[latKey] && row[lngKey]) continue;

    const point = osgbToWgs84(
      row[columns.easting!] ?? "",
      row[columns.northing!] ?? "",
    );

    // A row with neither a usable grid reference nor a lat/long keeps its empty
    // cells. The seed drops it and says how many it dropped.
    row[latKey] = point ? point.lat.toFixed(6) : (row[latKey] ?? "");
    row[lngKey] = point ? point.lng.toFixed(6) : (row[lngKey] ?? "");

    if (point) filled += 1;
  }

  return filled;
}

/**
 * Re-derives lat/long from the grid reference and reports how far the result
 * sits from the published value.
 */
function verify(rows: readonly Row[], columns: Columns) {
  if (!columns.lat || !columns.lng) {
    console.error("Nothing to verify against — the file has no lat/long.");
    process.exit(1);
  }

  const distances: number[] = [];
  let unconvertible = 0;
  let beyondTolerance = 0;

  for (const row of rows) {
    const published = {
      lat: Number(row[columns.lat]),
      lng: Number(row[columns.lng]),
    };

    if (!Number.isFinite(published.lat) || !Number.isFinite(published.lng)) {
      continue;
    }

    const derived = osgbToWgs84(
      row[columns.easting!] ?? "",
      row[columns.northing!] ?? "",
    );

    if (!derived) {
      unconvertible += 1;
      continue;
    }

    const metres = distanceMetres(published, derived);
    distances.push(metres);
    if (metres > VERIFY_TOLERANCE_M) beyondTolerance += 1;
  }

  distances.sort((a, b) => a - b);

  const at = (q: number) =>
    distances.length === 0
      ? 0
      : distances[Math.min(distances.length - 1, Math.floor(distances.length * q))]!;

  console.log(`Compared ${distances.length.toLocaleString("en-GB")} rows`);
  console.log(`  median   ${at(0.5).toFixed(1)}m`);
  console.log(`  p99      ${at(0.99).toFixed(1)}m`);
  console.log(`  worst    ${at(1).toFixed(1)}m`);
  console.log(
    `  over ${VERIFY_TOLERANCE_M}m  ${beyondTolerance.toLocaleString("en-GB")}`,
  );
  console.log(
    `  no grid reference  ${unconvertible.toLocaleString("en-GB")}`,
  );
}

/** Flat-earth approximation. Fine for the tens of metres this compares. */
function distanceMetres(a: Point, b: Point): number {
  const metresPerDegreeLat = 111_320;
  const metresPerDegreeLng =
    metresPerDegreeLat * Math.cos((a.lat * Math.PI) / 180);

  return Math.hypot(
    (a.lat - b.lat) * metresPerDegreeLat,
    (a.lng - b.lng) * metresPerDegreeLng,
  );
}

function readCsv(path: string): Promise<Row[]> {
  return new Promise((fulfil, reject) => {
    const rows: Row[] = [];

    createReadStream(path)
      .pipe(parse({ columns: true, bom: true, relaxColumnCount: true }))
      .on("data", (row: Row) => rows.push(row))
      .on("error", reject)
      .on("end", () => fulfil(rows));
  });
}

const USAGE = `
Converts OS grid references to WGS84 latitude / longitude.

  npx tsx scripts/convert-grid-refs.ts --in <csv> [--out <csv>] [--verify]

Flags
  --in <path>   CSV to read. Required.
  --out <path>  Where to write. Defaults to overwriting --in.
  --verify      Compare derived lat/long against the file's own, and report
                the disagreement rather than writing anything.

The IPN already carries lat/long, so the seed does not need this — see the
header of this file for when it does.
`.trim();

// Only run the CLI when invoked directly. The seed imports `osgbToWgs84` from
// here, and importing a module must never parse argv or exit the process.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
