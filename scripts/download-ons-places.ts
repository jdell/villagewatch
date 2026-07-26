/**
 * Downloads the ONS Index of Place Names (IPN) to `data/ons-places.csv`.
 *
 * Run it with `npm run download:ons`. The file it writes is the input to
 * `prisma/seed-villages.ts` and is gitignored — it is 47MB of Crown copyright
 * data that anyone can fetch in thirty seconds, so it does not belong in git.
 *
 * ## What the IPN is
 *
 * One row per place name in Great Britain — about 104,000 of them — each tagged
 * with the geographies it falls inside and a lat/long. It is published by the
 * Office for National Statistics on the Open Geography Portal under the Open
 * Government Licence v3.0, which permits commercial use with attribution:
 *
 *   Contains OS data © Crown copyright and database right 2024
 *   Contains Royal Mail data © Royal Mail copyright and database right 2024
 *   Source: Office for National Statistics licensed under the Open Government
 *   Licence v.3.0
 *
 * That attribution has to appear wherever the seeded villages are shown. See
 * `ONS_ATTRIBUTION` in `src/lib/constants.ts`.
 *
 * ## How the download URL is found
 *
 * The portal is an ArcGIS Hub site, so there is no stable file URL to hardcode —
 * the item id changes with every annual release. Two hops:
 *
 *   1. The portal's OGC-flavoured search endpoint,
 *      `/api/search/v1/collections/dataset/items?q=Index of Place Names`,
 *      returns the catalogue entries as GeoJSON features. The data releases are
 *      the ones whose `name` is `IPN_GB_<year>.zip`; the sibling
 *      `IPN_GB_<year>_User_Guide.zip` entries are documentation and are skipped.
 *   2. The item's payload is at
 *      `https://www.arcgis.com/sharing/rest/content/items/<id>/data`, which
 *      serves the zip. It contains the CSV and the user guide.
 *
 * The newest release wins, so this keeps working when ONS publishes the next
 * vintage. `prisma/seed-villages.ts` resolves the CSV's column names by pattern
 * for the same reason — the year is baked into them (`place23nm`, `par23cd`).
 *
 * ## If this script cannot reach the portal
 *
 * The portal occasionally rate limits, and some networks block arcgis.com.
 * Download it by hand instead — nothing here is required, the seed only ever
 * reads the file:
 *
 *   1. Open https://geoportal.statistics.gov.uk and search "Index of Place Names".
 *   2. Pick the newest "Index of Place Names (<month> <year>) in GB" — the
 *      dataset, not the User Guide.
 *   3. Download the zip and unzip it.
 *   4. Copy `IPN_GB_<year>.csv` to `data/ons-places.csv` in this repo.
 *
 * The seed sniffs the file's encoding, so it does not matter whether the copy
 * you drop in is the CSV as ONS ships it (Windows-1252) or one your editor has
 * re-saved as UTF-8.
 *
 * ## Flags
 *
 *   --force          Re-download even if data/ons-places.csv already exists.
 *   --out <path>     Write somewhere other than data/ons-places.csv.
 *   --url <url>      Skip discovery and fetch this zip (or .csv) directly.
 *   --keep-encoding  Write the CSV's bytes through unchanged instead of
 *                    transcoding to UTF-8.
 */

import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { inflateRawSync } from "node:zlib";

const PORTAL_SEARCH =
  "https://geoportal.statistics.gov.uk/api/search/v1/collections/dataset/items";
const ITEM_DATA = "https://www.arcgis.com/sharing/rest/content/items";

/** Matches `IPN_GB_2024.zip` but not `IPN_GB_2024_User_Guide.zip`. */
const RELEASE_NAME = /^IPN_GB_(\d{4})\.zip$/i;
/** The one file inside the zip worth keeping. */
const RELEASE_CSV = /^IPN_GB_\d{4}\.csv$/i;

const DEFAULT_OUT = "data/ons-places.csv";

/** The portal is slow on a cold cache; the zip is ~8MB. */
const SEARCH_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 300_000;

async function main() {
  const { values } = parseArgs({
    options: {
      force: { type: "boolean", default: false },
      out: { type: "string" },
      url: { type: "string" },
      "keep-encoding": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  const out = resolve(process.cwd(), values.out ?? DEFAULT_OUT);

  if (!values.force && (await exists(out))) {
    const { size } = await stat(out);
    console.log(
      `${rel(out)} already exists (${mb(size)}). Nothing to do — pass --force to re-download.`,
    );
    return;
  }

  const source = values.url
    ? { url: values.url, label: values.url }
    : await findLatestRelease();

  console.log(`Downloading ${source.label}`);

  const payload = await download(source.url);
  console.log(`  ${mb(payload.byteLength)} downloaded`);

  const csv = source.url.toLowerCase().endsWith(".csv")
    ? payload
    : extractCsv(payload);

  await mkdir(dirname(out), { recursive: true });
  await writeFile(
    out,
    values["keep-encoding"] ? csv : Buffer.from(toUtf8(csv), "utf8"),
  );

  const { size } = await stat(out);
  console.log(`Wrote ${rel(out)} (${mb(size)})`);
  console.log("");
  console.log("Next: npm run db:seed:villages");
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

type Release = { url: string; label: string };

/**
 * Asks the portal for every "Index of Place Names" catalogue entry and returns
 * the newest data release.
 *
 * Sorted by the year in the filename rather than the `modified` timestamp: the
 * portal touches old items when it re-generates thumbnails or metadata, so
 * `modified` regularly says a 2019 release is the most recently changed thing
 * in the catalogue. The year in `IPN_GB_2024.zip` is the vintage, and the
 * vintage is what we actually want.
 */
async function findLatestRelease(): Promise<Release> {
  const url = `${PORTAL_SEARCH}?q=${encodeURIComponent("Index of Place Names")}&limit=50`;

  const response = await fetchWithTimeout(url, SEARCH_TIMEOUT_MS);

  if (!response.ok) {
    throw new PortalError(
      `The Open Geography Portal search returned ${response.status} ${response.statusText}.`,
    );
  }

  const body: unknown = await response.json();
  const releases = parseSearchResults(body);

  if (releases.length === 0) {
    throw new PortalError(
      "The Open Geography Portal search returned no IPN_GB_<year>.zip release.",
    );
  }

  releases.sort((a, b) => b.year - a.year);
  const latest = releases[0]!;

  return {
    url: `${ITEM_DATA}/${latest.id}/data`,
    label: `${latest.title} (${latest.name})`,
  };
}

type SearchHit = { id: string; name: string; title: string; year: number };

function parseSearchResults(body: unknown): SearchHit[] {
  if (!isRecord(body) || !Array.isArray(body.features)) return [];

  const hits: SearchHit[] = [];

  for (const feature of body.features) {
    if (!isRecord(feature)) continue;
    const properties = feature.properties;
    if (!isRecord(properties)) continue;

    const { id, name, title } = properties;
    if (typeof id !== "string" || typeof name !== "string") continue;

    const match = RELEASE_NAME.exec(name);
    if (!match) continue;

    hits.push({
      id,
      name,
      title: typeof title === "string" ? title : name,
      year: Number(match[1]),
    });
  }

  return hits;
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

async function download(url: string): Promise<Buffer> {
  const response = await fetchWithTimeout(url, DOWNLOAD_TIMEOUT_MS);

  if (!response.ok) {
    throw new PortalError(
      `Download failed: ${response.status} ${response.statusText} for ${url}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  try {
    return await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "*/*" },
    });
  } catch (cause) {
    const reason =
      cause instanceof Error && cause.name === "TimeoutError"
        ? `timed out after ${Math.round(timeoutMs / 1000)}s`
        : cause instanceof Error
          ? cause.message
          : String(cause);

    throw new PortalError(`Could not reach ${url} — ${reason}.`, { cause });
  }
}

// ---------------------------------------------------------------------------
// Zip
// ---------------------------------------------------------------------------

/**
 * Pulls the one CSV out of the release zip.
 *
 * Hand-rolled rather than pulling in a zip library, because the whole job is
 * "find one entry by name and inflate it" against an archive whose shape ONS
 * has not changed in five releases. It handles stored and deflated entries,
 * which is all a zip can contain in practice; anything else fails loudly and
 * the header of this file explains how to unzip by hand.
 *
 * No zip64 handling. The release is 8MB compressed and 47MB expanded, three
 * orders of magnitude below the point where zip64 applies — if that ever
 * changes, this throws rather than reading a truncated file.
 */
function extractCsv(zip: Buffer): Buffer {
  const eocd = findEndOfCentralDirectory(zip);

  const entryCount = zip.readUInt16LE(eocd + 10);
  let cursor = zip.readUInt32LE(eocd + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) {
      throw new ZipError("Central directory entry has the wrong signature.");
    }

    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    if (RELEASE_CSV.test(name)) {
      return inflateEntry(zip, { name, method, compressedSize, localOffset });
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  throw new ZipError(
    "The release zip contains no IPN_GB_<year>.csv. Unzip it by hand and copy " +
      "the CSV to data/ons-places.csv — see the header of this script.",
  );
}

function inflateEntry(
  zip: Buffer,
  entry: {
    name: string;
    method: number;
    compressedSize: number;
    localOffset: number;
  },
): Buffer {
  if (zip.readUInt32LE(entry.localOffset) !== 0x04034b50) {
    throw new ZipError(`Local header for ${entry.name} has the wrong signature.`);
  }

  // The local header repeats the name and extra fields, and its extra field is
  // routinely a different length to the central directory's — so the data
  // offset has to be computed from the local header, not the central one.
  const nameLength = zip.readUInt16LE(entry.localOffset + 26);
  const extraLength = zip.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const body = zip.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return Buffer.from(body);
  if (entry.method === 8) return inflateRawSync(body);

  throw new ZipError(
    `${entry.name} uses compression method ${entry.method}, which this script ` +
      "cannot read. Unzip it by hand — see the header of this script.",
  );
}

function findEndOfCentralDirectory(zip: Buffer): number {
  // The record is 22 bytes plus a comment of up to 65535, and it is the last
  // thing in the file — so it starts no earlier than 65557 bytes from the end.
  const floor = Math.max(0, zip.byteLength - 65_557);

  for (let offset = zip.byteLength - 22; offset >= floor; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) return offset;
  }

  throw new ZipError(
    "That download is not a zip — the portal may have returned an error page.",
  );
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

/**
 * Transcodes the CSV to UTF-8.
 *
 * ONS ships it as Windows-1252, which is fine until a Welsh or Gaelic place
 * name goes through a UTF-8 reader and comes out as `A' Chr�on L�raich`.
 * Storing a mangled name would be worse than storing none — a resident looking
 * for their village would not find it. The seed sniffs the encoding anyway, so
 * this is belt and braces for anything else that opens the file.
 */
function toUtf8(csv: Buffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: true });

  try {
    return utf8.decode(csv);
  } catch {
    return new TextDecoder("windows-1252").decode(csv);
  }
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

class PortalError extends Error {}
class ZipError extends Error {}

const USAGE = `
Downloads the ONS Index of Place Names to data/ons-places.csv.

  npm run download:ons
  npx tsx scripts/download-ons-places.ts [flags]

Flags
  --force          Re-download even if the file already exists
  --out <path>     Write somewhere other than data/ons-places.csv
  --url <url>      Skip portal discovery and fetch this zip or csv
  --keep-encoding  Do not transcode the CSV to UTF-8
`.trim();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function rel(path: string) {
  return path.startsWith(process.cwd())
    ? path.slice(process.cwd().length + 1)
    : path;
}

function mb(bytes: number) {
  return `${(bytes / 1_000_000).toFixed(1)}MB`;
}

main().catch((error: unknown) => {
  if (error instanceof PortalError || error instanceof ZipError) {
    console.error(`\n${error.message}\n`);
    console.error(
      "Download it by hand instead — the seed only reads the file, it does not\n" +
        "care how it got there. Instructions are in the header of\n" +
        "scripts/download-ons-places.ts.",
    );
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});
