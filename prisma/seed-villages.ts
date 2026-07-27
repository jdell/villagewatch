import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { parse } from "csv-parse";
import { PrismaClient } from "../src/generated/prisma/client";
import { ONS_ATTRIBUTION } from "../src/lib/constants";
import { osgbToWgs84 } from "../scripts/convert-grid-refs";

/**
 * Seeds the village directory from the ONS Index of Place Names.
 *
 *   npm run db:seed:villages       # Cambridgeshire, 270 parishes
 *   npm run db:seed:villages:all   # every parish in England, ~10,700
 *
 * This is not `prisma/seed.ts`. That one builds a single village with sample
 * incidents so every screen has something in it; this one builds the empty
 * directory a real resident picks their village out of. They do not overlap and
 * either can run without the other.
 *
 * Run `npm run download:ons` first — that writes `data/ons-places.csv`, which
 * is gitignored. Without it this script says so and exits.
 *
 * ## What "a village" means here
 *
 * The IPN is an index of place *names*, about 104,000 of them, and only some of
 * them are places a watch scheme could cover. The `descnm` column says which
 * layer each row belongs to, as a code rather than a word — there is no
 * "Village" or "Hamlet" value to filter on, and has not been since the 2021
 * release. The layers that matter:
 *
 *   PAR  Civil parish — England and Scotland. ~10,700 in England.
 *   COM  Community — the Welsh equivalent of a civil parish. 878 of them.
 *   LOC  Locality — every named settlement, down to single farms. ~61,000.
 *
 * The default is the parish layer, PAR + COM, and that is deliberate. A civil
 * parish is the unit a village watch scheme actually organises around: it has a
 * parish council, a clerk, a noticeboard and a boundary everyone agrees on.
 * The locality layer is four times bigger and most of it is hamlets, farmsteads
 * and field names that no one would join. `--include-localities` adds it for
 * anyone who wants the long tail.
 *
 * The administrative layers — wards, districts, unitary authorities, built-up
 * areas, counties, regions — are excluded outright. Those are the "cities,
 * towns and metropolitan areas" that have no business in a village directory.
 *
 * ## Deduplication
 *
 * A place that straddles a boundary appears once per geography it intersects,
 * flagged `splitind = 1`. Left alone, the 298 parishes tagged Cambridgeshire
 * arrive as 358 rows and the directory lists Abbotsley twice.
 *
 * 747 English parishes have rows in more than one lieutenancy county, which is
 * why the county filter runs after the collapse rather than before it — see
 * `buildVillages`. Cambridgeshire ends up with 270 of its 298, the other 28
 * going to the neighbouring county their centre actually falls in.
 *
 * The natural key is the ONS code for the thing itself — `par23cd` for a parish
 * or community, `placeid` for a locality — never the name, which repeats freely
 * (45 name/county pairs collide in England alone). Members of a split are
 * collapsed to their medoid: the member point closest to all the others. The
 * medoid rather than the mean because the mean of a parish split across 80km
 * lands in a field in neither half, and a village centre that is not in the
 * village is worse than one that is 2km off-centre.
 *
 * ## What it writes, and what it will not overwrite
 *
 * Every village lands as `PENDING` with no join code. `PENDING` is already the
 * schema default and already means "exists, not yet live" — there is no
 * separate `PENDING_APPROVAL`, and adding one would leave two dormant statuses
 * with nothing to tell them apart. A directory entry becomes real when a
 * coordinator claims it, which is a `status` change and a `joinCode`, and
 * neither happens here.
 *
 * Re-running is safe and it does not clobber. New slugs are inserted; a village
 * still sitting at `PENDING` has its ONS-derived fields refreshed if the next
 * release moved or renamed it; **anything no longer `PENDING` is left entirely
 * alone**. A coordinator who has nudged their map centre to the church rather
 * than the parish centroid keeps that through the next annual refresh. This is
 * the same rule `prisma/seed.ts` follows and the reason neither uses a blind
 * upsert.
 *
 * ## Licence
 *
 * The IPN is Open Government Licence v3.0 — free to use commercially, with
 * attribution. `ONS_ATTRIBUTION` in `src/lib/constants.ts` carries the wording
 * and it has to appear wherever the seeded villages are shown.
 *
 * ## Flags
 *
 *   --county <name>        One lieutenancy county, e.g. "Cambridgeshire".
 *   --all                  Every parish in --country.
 *   --country <name>       England (default), Wales or Scotland.
 *   --include-localities   Add the LOC layer to the parish layer.
 *   --file <path>          Read this CSV or JSON snapshot instead of the default.
 *   --json <path>          Write the selection to a JSON snapshot, seed nothing.
 *   --dry-run              Parse, filter and slug, print the result, write nothing.
 *   --limit <n>            Stop after n villages. For trying it out.
 */

// Match Next.js precedence, as `prisma.config.ts` does: .env.local wins.
config({ path: [".env.local", ".env"], quiet: true });

const DEFAULT_CSV = "data/ons-places.csv";
const FALLBACK_JSON = "data/cambridgeshire-villages.json";

/** Map zoom a village opens at. Tight enough to read street names. */
const DEFAULT_ZOOM = 15;

/**
 * `Village.country` is `Char(2)` — an ISO 3166-1 alpha-2 code, not a name. All
 * three IPN countries are parts of the United Kingdom, so they are all `GB`;
 * which one a village is in survives in `description` and in `region`.
 */
const COUNTRY_CODE = "GB";

/** Rows per `createMany`, and slugs per existence lookup. */
const WRITE_BATCH = 500;
const LOOKUP_BATCH = 1_000;

/**
 * IPN `descnm` codes, and what each one is.
 *
 * The parish layer is the default. The locality layer is opt-in. Everything
 * absent from this map is an administrative geography and never seeded.
 */
const PLACE_LAYERS = {
  PAR: { noun: "Civil parish", parish: true },
  COM: { noun: "Community", parish: true },
  LOC: { noun: "Locality", parish: false },
} as const;

type LayerCode = keyof typeof PLACE_LAYERS;

const ONS_COUNTRIES = ["England", "Wales", "Scotland"] as const;
type OnsCountry = (typeof ONS_COUNTRIES)[number];

/**
 * The IPN bakes its vintage into every column name — `place23nm` in the 2024
 * release, `place21nm` in the 2021 one. Match the shape, not the year, so the
 * next release does not need a code change.
 */
const COLUMNS = {
  name: /^place\d*nm$/i,
  layer: /^descnm$/i,
  county: /^ctyltnm$/i,
  district: /^lad\d*nm$/i,
  country: /^ctry\d*nm$/i,
  parishCode: /^par\d*cd$/i,
  placeId: /^placeid$/i,
  placeCode: /^place\d*cd$/i,
  lat: /^lat$/i,
  lng: /^long$|^lng$/i,
  easting: /^gridgb1e$/i,
  northing: /^gridgb1n$/i,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One IPN row, projected down to what a village needs. */
type Place = {
  /** ONS code for the place itself. Members of a split share it. */
  key: string;
  name: string;
  county: string;
  district: string;
  country: OnsCountry;
  layer: LayerCode;
  lat: number;
  lng: number;
};

type VillageRecord = {
  name: string;
  slug: string;
  description: string;
  region: string;
  centerLat: number;
  centerLng: number;
};

type Rejections = {
  noName: number;
  noCounty: number;
  noLocation: number;
};

/** Which rows are in scope. Threaded into the row projection. */
type Filter = {
  county: string | undefined;
  country: OnsCountry;
  includeLocalities: boolean;
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const options = readOptions();

  const source = await resolveSource(options.file);
  console.log(`Reading ${source.path}`);

  let villages: VillageRecord[];

  if (source.kind === "json") {
    villages = await readSnapshot(source.path, options);
    console.log(`  ${villages.length.toLocaleString("en-GB")} villages in scope`);
  } else {
    const places = await readCsv(source.path, options.filter);
    console.log(
      `  ${places.rows.length.toLocaleString("en-GB")} places in ` +
        `${options.filter.country}`,
    );
    villages = buildVillages(places.rows, options.filter, options.limit);
    reportRejections(places.rejected);
  }

  if (villages.length === 0) {
    console.error("");
    console.error(
      options.filter.county
        ? `No villages matched --county "${options.filter.county}". Check the ` +
            `spelling against the ONS lieutenancy county names — it is ` +
            `"Cambridgeshire", not "Cambs".`
        : "No villages matched. Check --country and --include-localities.",
    );
    process.exit(1);
  }

  if (options.json) {
    await writeSnapshot(options.json, villages, options);
    return;
  }

  if (options.dryRun) {
    printDryRun(villages, options.label);
    return;
  }

  await write(villages, options.label);
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

type Options = {
  filter: Filter;
  file: string | undefined;
  /** Write the selection to this path as a snapshot instead of seeding it. */
  json: string | undefined;
  dryRun: boolean;
  limit: number | undefined;
  /** What the headline line calls this selection. */
  label: string;
};

/**
 * `--county` and `--country` differ by one letter, so `strict: true` and an
 * explicit check on every value: a typo has to be an error, never a run that
 * quietly seeds the wrong thing.
 */
function readOptions(): Options {
  const { values } = parseCliArgs();

  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (!values.county && !values.all) {
    console.error("Pass --county <name> or --all.\n");
    console.error(USAGE);
    process.exit(1);
  }

  if (values.county && values.all) {
    console.error("Pass one of --county or --all, not both.");
    process.exit(1);
  }

  const country = resolveCountry(values.country);

  let limit: number | undefined;
  if (values.limit !== undefined) {
    limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit <= 0) {
      console.error(`--limit must be a positive whole number, got "${values.limit}".`);
      process.exit(1);
    }
  }

  const county = values.county?.trim() || undefined;

  return {
    filter: {
      county,
      country,
      includeLocalities: values["include-localities"],
    },
    file: values.file,
    json: values.json,
    dryRun: values["dry-run"],
    limit,
    label: county ?? country,
  };
}

function parseCliArgs() {
  try {
    return parseArgs({
      options: {
        county: { type: "string" },
        all: { type: "boolean", default: false },
        country: { type: "string" },
        "include-localities": { type: "boolean", default: false },
        file: { type: "string" },
        json: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        limit: { type: "string" },
        help: { type: "boolean", default: false },
      },
      strict: true,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`\n${USAGE}`);
    process.exit(1);
  }
}

function resolveCountry(value: string | undefined): OnsCountry {
  if (value === undefined) return "England";

  const match = ONS_COUNTRIES.find(
    (country) => country.toLowerCase() === value.trim().toLowerCase(),
  );

  if (!match) {
    console.error(
      `--country must be one of ${ONS_COUNTRIES.join(", ")}, got "${value}". ` +
        `Northern Ireland is not in the IPN — it is an index of Great Britain.`,
    );
    process.exit(1);
  }

  return match;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

type Source = { path: string; kind: "csv" | "json" };

async function resolveSource(file: string | undefined): Promise<Source> {
  if (file) {
    const path = resolve(process.cwd(), file);
    if (!(await exists(path))) {
      console.error(`${file} does not exist.`);
      process.exit(1);
    }
    return { path, kind: file.toLowerCase().endsWith(".json") ? "json" : "csv" };
  }

  const csv = resolve(process.cwd(), DEFAULT_CSV);
  if (await exists(csv)) return { path: csv, kind: "csv" };

  console.error(`${DEFAULT_CSV} does not exist.\n`);
  console.error("Download it first:\n");
  console.error("  npm run download:ons\n");

  if (await exists(resolve(process.cwd(), FALLBACK_JSON))) {
    console.error(
      "Or seed from the committed Cambridgeshire snapshot, which needs no\n" +
        "network and no download:\n",
    );
    console.error(`  npx tsx prisma/seed-villages.ts --file ${FALLBACK_JSON}\n`);
  }

  process.exit(1);
}

type ReadResult = { rows: Place[]; rejected: Rejections };

/**
 * Streams the IPN CSV, keeping only rows in scope.
 *
 * Streamed rather than read whole because the file is 47MB and 104,000 rows —
 * parsing it into an array of full row objects costs several hundred megabytes
 * to throw almost all of it away. Each row is projected to a `Place` and the
 * rest is dropped before the next one arrives.
 */
async function readCsv(path: string, filter: Filter): Promise<ReadResult> {
  const encoding = await detectEncoding(path);

  if (encoding !== "utf-8") {
    console.log(`  decoding as ${encoding} — ONS ships the CSV as Windows-1252`);
  }

  const parser = parse({ columns: true, bom: true, relaxColumnCount: true });
  Readable.from(decode(createReadStream(path), encoding), {
    objectMode: false,
  }).pipe(parser);

  const rows: Place[] = [];
  const rejected: Rejections = { noName: 0, noCounty: 0, noLocation: 0 };
  let columns: Columns | undefined;

  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    columns ??= resolveColumns(Object.keys(row));

    const place = toPlace(row, columns, filter, rejected);
    if (place) rows.push(place);
  }

  if (!columns) {
    console.error(`${path} has no rows.`);
    process.exit(1);
  }

  return { rows, rejected };
}

type Columns = { [K in keyof typeof COLUMNS]: string | undefined };

function resolveColumns(header: readonly string[]): Columns {
  const find = (pattern: RegExp) => header.find((name) => pattern.test(name));

  const columns = {
    name: find(COLUMNS.name),
    layer: find(COLUMNS.layer),
    county: find(COLUMNS.county),
    district: find(COLUMNS.district),
    country: find(COLUMNS.country),
    parishCode: find(COLUMNS.parishCode),
    placeId: find(COLUMNS.placeId),
    placeCode: find(COLUMNS.placeCode),
    lat: find(COLUMNS.lat),
    lng: find(COLUMNS.lng),
    easting: find(COLUMNS.easting),
    northing: find(COLUMNS.northing),
  };

  const required = ["name", "layer", "county", "country"] as const;
  const missing = required.filter((key) => !columns[key]);

  if (missing.length > 0) {
    console.error(
      `That CSV is not an Index of Place Names extract — no ${missing.join(", ")} ` +
        `column. Expected the file written by \`npm run download:ons\`.`,
    );
    process.exit(1);
  }

  return columns;
}

/** Projects one CSV row to a `Place`, or null if it is out of scope or unusable. */
function toPlace(
  row: Record<string, string>,
  columns: Columns,
  filter: Filter,
  rejected: Rejections,
): Place | null {
  const layer = row[columns.layer!]?.trim().toUpperCase();
  if (!layer || !(layer in PLACE_LAYERS)) return null;

  const code = layer as LayerCode;
  if (!PLACE_LAYERS[code].parish && !filter.includeLocalities) return null;

  const country = row[columns.country!]?.trim();
  if (country !== filter.country) return null;

  // `--county` is deliberately NOT applied here — see `buildVillages`. A parish
  // straddling a county boundary has rows in both, and which county it ends up
  // in is a property of the collapsed place, not of any one of its rows.

  // Past this point the row is in scope, so anything that stops it becoming a
  // village is worth counting and reporting rather than dropping in silence.

  const county = row[columns.county!]?.trim() ?? "";
  const name = row[columns.name!]?.trim() ?? "";
  if (!name) {
    rejected.noName += 1;
    return null;
  }

  if (!county) {
    rejected.noCounty += 1;
    return null;
  }

  const point = readPoint(row, columns);
  if (!point) {
    rejected.noLocation += 1;
    return null;
  }

  return {
    key: naturalKey(row, columns, code),
    name,
    county,
    district: row[columns.district!]?.trim() ?? "",
    // Equal to `country` by the check above, but this is the narrowed type.
    country: filter.country,
    layer: code,
    lat: point.lat,
    lng: point.lng,
  };
}

/**
 * The published lat/long, falling back to converting the grid reference.
 *
 * Every row of the 2024 release has both and they agree to a median of 1.7m, so
 * the fallback never fires on current data — it is there for the vintages that
 * predate the lat/long columns. See `scripts/convert-grid-refs.ts`.
 */
function readPoint(
  row: Record<string, string>,
  columns: Columns,
): { lat: number; lng: number } | null {
  const lat = Number(columns.lat ? row[columns.lat] : NaN);
  const lng = Number(columns.lng ? row[columns.lng] : NaN);

  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    return { lat, lng };
  }

  if (!columns.easting || !columns.northing) return null;

  return osgbToWgs84(row[columns.easting] ?? "", row[columns.northing] ?? "");
}

/**
 * The ONS code for the place itself, which is what splits share.
 *
 * Layer-dependent, and it has to be: a locality row also carries the `par23cd`
 * of the parish it sits inside, so keying localities on it would collapse every
 * hamlet in a parish into one village.
 */
function naturalKey(
  row: Record<string, string>,
  columns: Columns,
  layer: LayerCode,
): string {
  const parish = columns.parishCode ? row[columns.parishCode]?.trim() : "";
  const placeId = columns.placeId ? row[columns.placeId]?.trim() : "";
  const placeCode = columns.placeCode ? row[columns.placeCode]?.trim() : "";

  if (PLACE_LAYERS[layer].parish && parish) return `par:${parish}`;
  if (placeId) return `place:${placeId}`;
  if (placeCode) return `code:${placeCode}`;

  // No code at all: fall back to the name and county, which at worst merges two
  // genuinely distinct places that share both. Better than seeding duplicates.
  return `name:${row[columns.name!]}|${row[columns.county!]}`;
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

/**
 * A snapshot is the pipeline's own output, written back out as JSON.
 *
 * `data/cambridgeshire-villages.json` is one, and it is committed — it is the
 * offline path for anyone who cannot reach the Open Geography Portal, and the
 * only way to seed a directory with no network at all. Regenerate it with:
 *
 *   npx tsx prisma/seed-villages.ts --county Cambridgeshire \
 *     --json data/cambridgeshire-villages.json
 *
 * It holds finished village records rather than raw IPN rows, so seeding from
 * one is exactly seeding from the CSV it was cut from — no second slug
 * implementation to drift out of step with the first.
 */
type Snapshot = {
  source: string;
  licence: string;
  attribution: string;
  generated: string;
  selection: { county: string | null; country: OnsCountry; localities: boolean };
  count: number;
  villages: VillageRecord[];
};

async function readSnapshot(
  path: string,
  options: Options,
): Promise<VillageRecord[]> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));

  const entries =
    isRecord(parsed) && Array.isArray(parsed.villages) ? parsed.villages : null;

  if (!entries) {
    console.error(`${path} is not a village snapshot — no "villages" array.`);
    process.exit(1);
  }

  const villages: VillageRecord[] = [];
  let malformed = 0;

  for (const entry of entries) {
    if (options.limit !== undefined && villages.length >= options.limit) break;

    const village = toVillageRecord(entry);

    if (!village) {
      malformed += 1;
      continue;
    }

    // A snapshot is already one selection, so --county only narrows it further
    // — it can never widen it back to something the file does not contain.
    if (
      options.filter.county &&
      village.region.toLowerCase() !== options.filter.county.toLowerCase()
    ) {
      continue;
    }

    villages.push(village);
  }

  if (malformed > 0) {
    console.log(`  ${malformed} entries skipped — missing name, slug or centre`);
  }

  return villages;
}

function toVillageRecord(entry: unknown): VillageRecord | null {
  if (!isRecord(entry)) return null;

  const { name, slug, description, region, centerLat, centerLng } = entry;

  if (typeof name !== "string" || !name.trim()) return null;
  if (typeof slug !== "string" || !slug.trim()) return null;
  if (typeof centerLat !== "number" || !Number.isFinite(centerLat)) return null;
  if (typeof centerLng !== "number" || !Number.isFinite(centerLng)) return null;

  return {
    name: name.trim(),
    slug: slug.trim(),
    description: typeof description === "string" ? description : "",
    region: typeof region === "string" ? region : "",
    centerLat: round(centerLat),
    centerLng: round(centerLng),
  };
}

async function writeSnapshot(
  path: string,
  villages: readonly VillageRecord[],
  options: Options,
) {
  const snapshot: Snapshot = {
    source: "ONS Index of Place Names in Great Britain, via npm run download:ons",
    licence: "Open Government Licence v3.0",
    attribution: ONS_ATTRIBUTION,
    generated: new Date().toISOString().slice(0, 10),
    selection: {
      county: options.filter.county ?? null,
      country: options.filter.country,
      localities: options.filter.includeLocalities,
    },
    count: villages.length,
    villages: [...villages],
  };

  const out = resolve(process.cwd(), path);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  console.log("");
  console.log(
    `Wrote ${villages.length.toLocaleString("en-GB")} villages in ` +
      `${options.label} to ${path}`,
  );
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

type Encoding = "utf-8" | "windows-1252";

/**
 * UTF-8 if the whole file decodes as UTF-8, Windows-1252 otherwise.
 *
 * ONS ships the CSV as Windows-1252 and `npm run download:ons` transcodes it,
 * so both are in circulation — and a file hand-copied from an unzipped release
 * is the untranscoded one. Guessing wrong turns `A' Chrìon Làraich` into
 * mojibake and the village becomes unfindable by the people who live in it.
 *
 * Whole file rather than a sample: the first accented name in the IPN is 3,000
 * rows in, and plenty of counties have none at all until much later.
 */
async function detectEncoding(path: string): Promise<Encoding> {
  const decoder = new TextDecoder("utf-8", { fatal: true });

  try {
    for await (const part of createReadStream(path)) {
      decoder.decode(part as Uint8Array, { stream: true });
    }
    decoder.decode();
    return "utf-8";
  } catch {
    return "windows-1252";
  }
}

/**
 * Decodes a byte stream to strings for the CSV parser.
 *
 * `stream: true` holds back a trailing partial character rather than emitting a
 * replacement for it, which is what makes chunk boundaries safe in UTF-8.
 */
async function* decode(source: AsyncIterable<Buffer>, encoding: Encoding) {
  const decoder = new TextDecoder(encoding);

  for await (const part of source) {
    yield decoder.decode(part, { stream: true });
  }

  const tail = decoder.decode();
  if (tail) yield tail;
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/**
 * Collapses splits, resolves slugs, and returns what to write.
 *
 * **`--county` is applied here, after collapsing, and that ordering matters.**
 * A parish on a county boundary has rows in both counties, so filtering rows
 * first would hand it to whichever county you asked for and give it a different
 * slug each time: Barnack is `barnack-cambridgeshire` out of a Cambridgeshire
 * run and `barnack-lincolnshire` out of an England one. Seed both and the
 * directory lists it twice, in two counties, with no way to tell they are the
 * same parish.
 *
 * Collapsing first means the medoid decides — one county per parish, the same
 * one however you select it. It costs reading every row of the country even
 * when only one county is wanted, which is a stream over a file that is being
 * streamed anyway.
 */
function buildVillages(
  places: readonly Place[],
  filter: Filter,
  limit: number | undefined,
): VillageRecord[] {
  const groups = new Map<string, Place[]>();

  for (const place of places) {
    const members = groups.get(place.key);
    if (members) members.push(place);
    else groups.set(place.key, [place]);
  }

  const splits = [...groups.values()].filter((m) => m.length > 1).length;
  if (splits > 0) {
    console.log(
      `  ${splits.toLocaleString("en-GB")} split across boundaries, collapsed to one each`,
    );
  }

  // Sorted by name so the output, and the `--limit` subset, are stable between
  // runs rather than following the order rows happen to sit in the file.
  const collapsed = [...groups.values()]
    .map(collapse)
    .filter(
      (place) =>
        !filter.county ||
        place.county.toLowerCase() === filter.county.toLowerCase(),
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "en-GB") ||
        a.county.localeCompare(b.county, "en-GB"),
    );

  const taken = new Set<string>();
  const villages: VillageRecord[] = [];
  let unslugged = 0;

  for (const place of collapsed) {
    if (limit !== undefined && villages.length >= limit) break;

    const slug = uniqueSlug(place, taken);

    if (!slug) {
      unslugged += 1;
      continue;
    }

    taken.add(slug);
    villages.push({
      name: place.name,
      slug,
      description: describe(place),
      region: place.county,
      centerLat: round(place.lat),
      centerLng: round(place.lng),
    });
  }

  if (unslugged > 0) {
    console.log(`  ${unslugged} dropped — the name produces no usable slug`);
  }

  return villages;
}

/**
 * One place from the rows of a split, at the member point closest to all the
 * others.
 *
 * A real IPN point rather than a computed average, so the village centre is
 * always somewhere the survey actually put a place name. Ties break on the
 * lowest key so the choice is the same on every run.
 */
function collapse(members: Place[]): Place {
  if (members.length === 1) return members[0]!;

  let best = members[0]!;
  let bestCost = Infinity;

  for (const candidate of members) {
    let cost = 0;
    for (const other of members) cost += distanceMetres(candidate, other);

    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }

  return best;
}

/**
 * `oakington-cambridgeshire`, with the district added when the name and county
 * are not enough, and a counter when even that is not.
 *
 * 45 name/county pairs collide across England — two Aislabys in North
 * Yorkshire, two Ashtons in Northamptonshire. Reaching for the district first
 * keeps the slug something a person can read; the counter is the last resort
 * and it is rare.
 */
function uniqueSlug(place: Place, taken: ReadonlySet<string>): string | null {
  const name = slugify(place.name);
  if (!name) return null;

  const county = slugify(place.county);
  const base = county ? `${name}-${county}` : name;
  if (!taken.has(base)) return base;

  const district = slugify(place.district);
  if (district && district !== county) {
    const withDistrict = `${name}-${district}-${county}`;
    if (!taken.has(withDistrict)) return withDistrict;
  }

  for (let n = 2; n < 100; n += 1) {
    const numbered = `${base}-${n}`;
    if (!taken.has(numbered)) return numbered;
  }

  return null;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    // Strip the combining marks NFKD just split off: the w-circumflex in a
    // Welsh name becomes w, Chrìon becomes Chrion. Transliterating a name
    // beats dropping it — a resident searching for their village finds it
    // either way, and an empty slug is not a village.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Apostrophes close up rather than becoming separators — St Mary's is
    // st-marys, not st-mary-s.
    .replace(/['\u2018\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function describe(place: Place): string {
  return `${PLACE_LAYERS[place.layer].noun} in ${place.county}, ${place.country}.`;
}

/** Six decimal places is about 0.1m. Anything beyond it is false precision. */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function distanceMetres(a: Place, b: Place): number {
  const metresPerDegreeLat = 111_320;
  const metresPerDegreeLng =
    metresPerDegreeLat * Math.cos((a.lat * Math.PI) / 180);

  return Math.hypot(
    (a.lat - b.lat) * metresPerDegreeLat,
    (a.lng - b.lng) * metresPerDegreeLng,
  );
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

async function write(villages: readonly VillageRecord[], label: string) {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    console.error(
      "\nNo DIRECT_URL or DATABASE_URL. Copy .env.example to .env.local and " +
        "fill in\nthe Supabase connection strings first, or pass --dry-run to " +
        "check the\npipeline without a database.",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const existing = await loadExisting(prisma, villages);

    const toCreate: VillageRecord[] = [];
    const toRefresh: VillageRecord[] = [];
    let claimed = 0;
    let unchanged = 0;

    for (const village of villages) {
      const current = existing.get(village.slug);

      if (!current) {
        toCreate.push(village);
        continue;
      }

      // Someone has taken this one on. The directory's job is done and the
      // annual refresh has no business touching it.
      if (current.status !== "PENDING") {
        claimed += 1;
        continue;
      }

      if (drifted(current, village)) toRefresh.push(village);
      else unchanged += 1;
    }

    for (const batch of chunk(toCreate, WRITE_BATCH)) {
      await prisma.village.createMany({
        data: batch.map((village) => ({
          name: village.name,
          slug: village.slug,
          description: village.description,
          status: "PENDING" as const,
          centerLat: village.centerLat,
          centerLng: village.centerLng,
          defaultZoom: DEFAULT_ZOOM,
          region: village.region,
          country: COUNTRY_CODE,
        })),
        // Two runs racing, or a slug added by hand between the lookup and the
        // insert. Skipping is right either way — the refresh pass below owns
        // updates, and `createMany` cannot do a partial one.
        skipDuplicates: true,
      });
    }

    for (const village of toRefresh) {
      await prisma.village.update({
        where: { slug: village.slug },
        // Only the ONS-derived fields. Never `status`, `joinCode`,
        // `alertThreshold`, `radiusMeters` or anything WhatsApp — those belong
        // to whoever runs the village, not to the index.
        data: {
          name: village.name,
          description: village.description,
          region: village.region,
          centerLat: village.centerLat,
          centerLng: village.centerLng,
        },
      });
    }

    const total = toCreate.length + toRefresh.length + unchanged + claimed;

    console.log("");
    console.log(
      `Seeded ${total.toLocaleString("en-GB")} villages in ${label}`,
    );
    console.log(`  created    ${toCreate.length.toLocaleString("en-GB")}`);
    console.log(`  refreshed  ${toRefresh.length.toLocaleString("en-GB")}`);
    console.log(`  unchanged  ${unchanged.toLocaleString("en-GB")}`);
    console.log(
      `  claimed    ${claimed.toLocaleString("en-GB")}  (left alone — no longer PENDING)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

type ExistingVillage = {
  slug: string;
  status: string;
  name: string;
  description: string | null;
  region: string | null;
  centerLat: number;
  centerLng: number;
};

async function loadExisting(
  prisma: PrismaClient,
  villages: readonly VillageRecord[],
): Promise<Map<string, ExistingVillage>> {
  const found = new Map<string, ExistingVillage>();

  for (const batch of chunk(villages, LOOKUP_BATCH)) {
    const rows = await prisma.village.findMany({
      where: { slug: { in: batch.map((village) => village.slug) } },
      select: {
        slug: true,
        status: true,
        name: true,
        description: true,
        region: true,
        centerLat: true,
        centerLng: true,
      },
    });

    for (const row of rows) found.set(row.slug, row);
  }

  return found;
}

/** True when the next IPN release has moved or renamed this village. */
function drifted(current: ExistingVillage, next: VillageRecord): boolean {
  return (
    current.name !== next.name ||
    current.description !== next.description ||
    current.region !== next.region ||
    // Compared at the precision they were stored with, so floating point does
    // not make every village look moved on every run.
    round(current.centerLat) !== next.centerLat ||
    round(current.centerLng) !== next.centerLng
  );
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printDryRun(villages: readonly VillageRecord[], label: string) {
  const sample = villages.slice(0, 10);
  const width = Math.max(...sample.map((v) => v.slug.length));

  console.log("");
  for (const village of sample) {
    console.log(
      `  ${village.slug.padEnd(width)}  ${village.centerLat.toFixed(5)}, ` +
        `${village.centerLng.toFixed(5)}  ${village.name}`,
    );
  }

  if (villages.length > sample.length) {
    console.log(`  … and ${(villages.length - sample.length).toLocaleString("en-GB")} more`);
  }

  console.log("");
  console.log(
    `Would seed ${villages.length.toLocaleString("en-GB")} villages in ${label}. ` +
      `Nothing written — this was --dry-run.`,
  );
}

function reportRejections(rejected: Rejections) {
  const lines: string[] = [];

  if (rejected.noName > 0) lines.push(`${rejected.noName} with no name`);
  if (rejected.noCounty > 0) lines.push(`${rejected.noCounty} with no county`);
  if (rejected.noLocation > 0) {
    lines.push(`${rejected.noLocation} with no usable location`);
  }

  if (lines.length > 0) console.log(`  dropped: ${lines.join(", ")}`);
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

const USAGE = `
Seeds the village directory from the ONS Index of Place Names.

  npm run db:seed:villages           Cambridgeshire
  npm run db:seed:villages:all       every parish in England
  npx tsx prisma/seed-villages.ts --county Norfolk --dry-run

Flags
  --county <name>       One lieutenancy county, e.g. "Cambridgeshire"
  --all                 Every parish in --country
  --country <name>      England (default), Wales or Scotland
  --include-localities  Add hamlets and farmsteads to the parish layer
  --file <path>         Read this CSV or JSON snapshot instead of data/ons-places.csv
  --json <path>         Write the selection to a JSON snapshot, seed nothing
  --dry-run             Print what would be seeded, write nothing
  --limit <n>           Stop after n villages

Run \`npm run download:ons\` first — it writes data/ons-places.csv.
`.trim();

function* chunk<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let index = 0; index < items.length; index += size) {
    yield items.slice(index, index + size);
  }
}

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

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
