import {
  POLICE_API_BASE_URL,
  POLICE_API_MAX_REQUESTS_PER_SECOND,
  POLICE_API_TIMEOUT_MS,
  POLICE_API_USER_AGENT,
  POLICE_MAX_CRIMES_PER_MONTH,
  POLICE_TEAM_MAX_MEMBERS,
} from "@/lib/constants";
import {
  policeAvailabilitySchema,
  policeCategorySchema,
  policeCrimeSchema,
  policeLocateSchema,
  policeNeighbourhoodSchema,
  policeOfficerSchema,
} from "@/lib/validations";

/**
 * The client for `data.police.uk`. **Server only.**
 *
 * The Home Office publishes every crime recorded by every Home Office force in
 * England, Wales and Northern Ireland, one calendar month at a time, under the
 * Open Government Licence. There is no key, no account and no quota — which
 * makes this the easiest integration in the codebase to write and the easiest
 * one to write badly, because nothing upstream will tell you that you are
 * misbehaving until you are blocked.
 *
 * Server only for one reason and it is not secrecy: there is nothing secret
 * here. It is the pacer below. A limiter that lives in one process bounds that
 * process, and a browser-side copy of this module would be one pacer per tab
 * against a service that sees them all as us.
 *
 * ## The contract
 *
 * The same one `src/lib/ai/structure-incident.ts` and its two siblings keep:
 * **every failure is a returned value, never a throw.** A 404, a timeout, a
 * body that will not parse and a service returning 503 because the area is too
 * busy are all ordinary states of an open dataset published by somebody else,
 * and every caller here is either a cron with no user in front of it or a page
 * render that must not become an error page because a third party is down.
 *
 * The one place that discipline is load-bearing rather than tidy is
 * `/reports`. A coordinator assembling a document for a meeting in ten minutes
 * gets the document; what an outage upstream costs is one section of it, and
 * that section says which months it is missing rather than printing a zero.
 *
 * ## Rate limiting, and why it is a module variable
 *
 * `POLICE_API_MAX_REQUESTS_PER_SECOND` is what the service asks callers to stay
 * under. `reserve()` below holds every outbound call to that pace by chaining
 * them through one promise.
 *
 * **This is exactly the shape `src/lib/rate-limit.ts` says is wrong**, and the
 * difference is worth being explicit about, because a later reader who has
 * absorbed that file's argument will read this as the bug it warns against.
 * That module counts in Postgres because it is a *security* limit on an
 * *inbound* request: per-instance counters on Vercel meant a caller who could
 * trigger scale-out got a multiple of the stated quota, and the caller worth
 * limiting is precisely the one who wakes an idle deployment up.
 *
 * This is a *politeness* pace on an *outbound* call, and the two properties
 * that make the table necessary there do not apply here:
 *
 * - There is no adversary. Nobody is trying to make us exceed 15 requests a
 *   second; the only thing that would is our own loop.
 * - The work is already serialised. `syncVillagePoliceData` walks villages and
 *   months in sequence inside one scheduled function, so in practice there is
 *   one instance making these calls at all.
 *
 * What this does **not** promise is a global 15/s across a fleet — two
 * concurrent lambdas would each pace themselves and together exceed it. That is
 * a real limitation and it is bounded by `POLICE_SYNC_MAX_REQUESTS` and by the
 * cache: a run that finds every month fresh makes no calls at all. A shared
 * counter would cost a round trip to Postgres in front of every outbound
 * request to buy a guarantee against a caller that does not exist.
 */

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

export type PoliceApiFailureCode =
  /** 404 — the service has no data for that point and month. Not an error. */
  | "no_data"
  /** 503 — more than 10,000 crimes in the area that month. Their limit. */
  | "too_many_crimes"
  /** 429 — we were asked to slow down. */
  | "rate_limited"
  | "timeout"
  | "network"
  /** A 200 whose body was not what the schema says it is. */
  | "invalid_output"
  /** Any other non-2xx. */
  | "upstream";

export type PoliceApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: PoliceApiFailureCode; message: string };

function fail<T>(
  code: PoliceApiFailureCode,
  message: string,
): PoliceApiResult<T> {
  return { ok: false, code, message };
}

// ---------------------------------------------------------------------------
// Pacing
// ---------------------------------------------------------------------------

const MIN_INTERVAL_MS = 1000 / POLICE_API_MAX_REQUESTS_PER_SECOND;

/**
 * When the next call may go out. Module state, deliberately — see the header.
 */
let nextSlotAt = 0;

/**
 * The tail of the queue.
 *
 * Every reservation chains off the last one, which is what makes concurrent
 * callers take slots in order instead of all reading the same `nextSlotAt` and
 * all deciding they may go now. The `.catch()` is what stops one rejected
 * waiter poisoning the chain for everything behind it — nothing in `reserve`
 * can reject today, and a chain that could break silently is not a thing to
 * leave standing on that.
 */
let queue: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits until this caller's slot comes round.
 *
 * Cheap when the pace is not being pushed: an idle client computes a slot in
 * the past, waits zero milliseconds and goes.
 */
function reserve(): Promise<void> {
  const slot = queue.then(async () => {
    const now = Date.now();
    const at = Math.max(now, nextSlotAt);

    nextSlotAt = at + MIN_INTERVAL_MS;

    if (at > now) await sleep(at - now);
  });

  queue = slot.catch(() => undefined);

  return slot;
}

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

/**
 * One GET against the service, paced, bounded and never throwing.
 *
 * `AbortSignal.timeout` rather than a hand-rolled race: it aborts the socket
 * as well as the promise, which on a cron looping over villages is the
 * difference between a slow month and a function that spends its whole 60
 * seconds on one.
 *
 * The 404 deserves its own code because it is not a failure. The street-level
 * endpoint answers 404 for a month it has not published yet, which is the
 * ordinary state of the two most recent months — treated as an error it would
 * fill the cron log with alarm about the service working exactly as documented.
 */
async function get(path: string): Promise<PoliceApiResult<unknown>> {
  const url = `${POLICE_API_BASE_URL}${path}`;

  await reserve();

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        // An open API with no key has no other way to tell one caller from
        // another, and a service that cannot identify who is misbehaving blocks
        // by address range. See `POLICE_API_USER_AGENT`.
        "User-Agent": POLICE_API_USER_AGENT,
      },
      signal: AbortSignal.timeout(POLICE_API_TIMEOUT_MS),
      // Never cached by Next's fetch cache. These responses are large, they are
      // already cached in Postgres by the sync, and a build-time cache entry for
      // a month's crime figures is a stale document nobody can invalidate.
      cache: "no-store",
    });
  } catch (cause) {
    const timedOut =
      cause instanceof DOMException && cause.name === "TimeoutError";

    return fail(
      timedOut ? "timeout" : "network",
      timedOut
        ? `data.police.uk did not answer within ${Math.round(POLICE_API_TIMEOUT_MS / 1000)}s`
        : `Could not reach data.police.uk: ${
            cause instanceof Error ? cause.message : "unknown error"
          }`,
    );
  }

  if (response.status === 404) {
    return fail("no_data", "data.police.uk has no data for that request");
  }

  if (response.status === 429) {
    return fail("rate_limited", "data.police.uk asked us to slow down");
  }

  if (response.status === 503) {
    // Documented: the street-level endpoint refuses any point with more than
    // 10,000 crimes in the month rather than returning a body that size.
    return fail(
      "too_many_crimes",
      "That area has more recorded crime than data.police.uk will return in one request",
    );
  }

  if (!response.ok) {
    return fail("upstream", `data.police.uk returned ${response.status}`);
  }

  try {
    return { ok: true, data: await response.json() };
  } catch {
    return fail("invalid_output", "data.police.uk returned a body that is not JSON");
  }
}

// ---------------------------------------------------------------------------
// Street-level crime
// ---------------------------------------------------------------------------

/** One crime, as this codebase holds it. Flat, and already narrowed. */
export type PoliceStreetCrime = {
  crimeId: string;
  persistentId: string | null;
  category: string;
  month: string;
  lat: number | null;
  lng: number | null;
  streetId: number | null;
  streetName: string | null;
  locationType: string | null;
  locationSubtype: string | null;
  context: string | null;
  outcomeCategory: string | null;
  outcomeDate: string | null;
};

export type PoliceStreetCrimes = {
  crimes: PoliceStreetCrime[];
  /**
   * Records the schema refused.
   *
   * Surfaced rather than swallowed. One unparseable record in an open dataset
   * is not worth losing a month over, but a *rising* number of them is the
   * shape of an upstream change, and a count in the cron log is the only place
   * anybody would notice.
   */
  dropped: number;
  /** True when `POLICE_MAX_CRIMES_PER_MONTH` cut the list short. */
  truncated: boolean;
};

/**
 * Every crime recorded within a mile of a point in one month.
 *
 * The radius is the service's, not ours: the endpoint takes a `lat`/`lng` and
 * applies about a mile around it. It does not follow a parish boundary and
 * cannot be narrowed, which is the single most important fact about these
 * figures and is why `POLICE_COMPARISON_NOTE` travels with every rendering of
 * them.
 *
 * `all-crime` rather than a category, because the breakdown is computed here
 * from what comes back — one call for the month beats fourteen, one per
 * category, for the same figures.
 *
 * **Records are parsed one at a time.** A month is thousands of objects
 * published by somebody else; one of them arriving with a coordinate the schema
 * will not take should cost that record, not the month and not the report
 * section it feeds.
 */
export async function fetchStreetLevelCrimes(input: {
  lat: number;
  lng: number;
  /** `YYYY-MM`. */
  month: string;
}): Promise<PoliceApiResult<PoliceStreetCrimes>> {
  const query = new URLSearchParams({
    lat: String(input.lat),
    lng: String(input.lng),
    date: input.month,
  });

  const result = await get(`/crimes-street/all-crime?${query.toString()}`);

  if (!result.ok) return result;

  if (!Array.isArray(result.data)) {
    return fail(
      "invalid_output",
      "data.police.uk returned something other than a list of crimes",
    );
  }

  const crimes: PoliceStreetCrime[] = [];
  let dropped = 0;
  let truncated = false;

  for (const row of result.data) {
    if (crimes.length >= POLICE_MAX_CRIMES_PER_MONTH) {
      truncated = true;
      break;
    }

    const parsed = policeCrimeSchema.safeParse(row);

    if (!parsed.success) {
      dropped += 1;
      continue;
    }

    const record = parsed.data;

    crimes.push({
      crimeId: record.id,
      // The empty string is what "no persistent id" looks like upstream, and it
      // is far and away the common case. Stored as null so a later reader is
      // not left deciding whether `""` means absent or means something.
      persistentId: record.persistent_id?.trim() || null,
      category: record.category,
      // The requested month wins over the record's own. They agree in practice;
      // where they would not, the month this row is filed under has to be the
      // one the cache key was computed from, or a re-fetch would leave a
      // duplicate behind under the other label.
      month: input.month,
      lat: record.location?.latitude ?? null,
      lng: record.location?.longitude ?? null,
      streetId: record.location?.street?.id ?? null,
      streetName: record.location?.street?.name?.trim() || null,
      locationType: record.location_type?.trim() || null,
      locationSubtype: record.location_subtype?.trim() || null,
      context: record.context?.trim() || null,
      outcomeCategory: record.outcome_status?.category?.trim() || null,
      outcomeDate: record.outcome_status?.date?.trim() || null,
    });
  }

  return { ok: true, data: { crimes, dropped, truncated } };
}

// ---------------------------------------------------------------------------
// Neighbourhood policing
// ---------------------------------------------------------------------------

export type PoliceNeighbourhoodRef = {
  force: string;
  neighbourhood: string;
};

/**
 * Which force and neighbourhood a point falls in.
 *
 * A `no_data` here is a real answer rather than a fault: the service covers
 * England, Wales and Northern Ireland, so a point at sea, in Scotland or
 * outside the coverage simply has no neighbourhood. The caller treats it as
 * "we do not know yours" and renders nothing, which is the honest outcome.
 */
export async function locateNeighbourhood(input: {
  lat: number;
  lng: number;
}): Promise<PoliceApiResult<PoliceNeighbourhoodRef>> {
  const query = new URLSearchParams({ q: `${input.lat},${input.lng}` });

  const result = await get(`/locate-neighbourhood?${query.toString()}`);

  if (!result.ok) return result;

  const parsed = policeLocateSchema.safeParse(result.data);

  if (!parsed.success) {
    return fail(
      "invalid_output",
      "data.police.uk did not return a force and neighbourhood",
    );
  }

  return { ok: true, data: parsed.data };
}

export type PoliceTeamMember = {
  name: string;
  rank: string | null;
  email: string | null;
};

export type PoliceNeighbourhoodDetail = {
  neighbourhoodId: string;
  name: string;
  description: string | null;
  urlForce: string | null;
  centreLat: number | null;
  centreLng: number | null;
  email: string | null;
  telephone: string | null;
  facebook: string | null;
  twitter: string | null;
  population: number | null;
};

/**
 * The neighbourhood's own page, as data.
 *
 * `description` is the one field here a force writes freehand, and it arrives
 * with HTML tags in it more often than not. It is stripped rather than
 * rendered — see `stripTags` — because nothing in this codebase renders
 * third-party HTML and a description is worth having as a sentence.
 */
export async function fetchNeighbourhood(
  force: string,
  neighbourhood: string,
): Promise<PoliceApiResult<PoliceNeighbourhoodDetail>> {
  const result = await get(
    `/${encodeURIComponent(force)}/${encodeURIComponent(neighbourhood)}`,
  );

  if (!result.ok) return result;

  const parsed = policeNeighbourhoodSchema.safeParse(result.data);

  if (!parsed.success) {
    return fail(
      "invalid_output",
      "data.police.uk returned an unreadable neighbourhood",
    );
  }

  const detail = parsed.data;
  const contact = detail.contact_details;

  // `"0"` is a force that has not filled the field in, not a neighbourhood with
  // nobody living in it. Dropped rather than stored, because a zero on a screen
  // is a claim and an absent figure is not.
  const population = Number(detail.population ?? "");

  return {
    ok: true,
    data: {
      neighbourhoodId: detail.id,
      name: detail.name,
      description: stripTags(detail.description) || null,
      urlForce: safeHttpUrl(detail.url_force),
      centreLat: detail.centre?.latitude ?? null,
      centreLng: detail.centre?.longitude ?? null,
      email: contact?.email?.trim() || null,
      telephone: contact?.telephone?.trim() || null,
      facebook: safeHttpUrl(contact?.facebook),
      twitter: safeHttpUrl(contact?.twitter),
      population: Number.isFinite(population) && population > 0 ? population : null,
    },
  };
}

/**
 * The officers and PCSOs covering a neighbourhood.
 *
 * Capped at `POLICE_TEAM_MAX_MEMBERS`. A city-centre team can run to dozens and
 * this is a panel on a dashboard, not a directory — a coordinator wants the
 * name to ask for, and the force's own page is one link away for the rest.
 *
 * **`bio` never leaves this function**, because it never enters it:
 * `policeOfficerSchema` does not describe the field, so it is stripped at the
 * parse. It is force-authored HTML, and the place to stop HTML is before it is
 * stored rather than at whichever component eventually renders it.
 */
export async function fetchNeighbourhoodTeam(
  force: string,
  neighbourhood: string,
): Promise<PoliceApiResult<PoliceTeamMember[]>> {
  const result = await get(
    `/${encodeURIComponent(force)}/${encodeURIComponent(neighbourhood)}/people`,
  );

  if (!result.ok) return result;

  if (!Array.isArray(result.data)) {
    return fail("invalid_output", "data.police.uk returned an unreadable team");
  }

  const team: PoliceTeamMember[] = [];

  for (const row of result.data) {
    if (team.length >= POLICE_TEAM_MAX_MEMBERS) break;

    const parsed = policeOfficerSchema.safeParse(row);

    if (!parsed.success) continue;

    team.push({
      name: parsed.data.name,
      rank: parsed.data.rank?.trim() || null,
      email: parsed.data.contact_details?.email?.trim() || null,
    });
  }

  return { ok: true, data: team };
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/**
 * The category slugs and labels in force for a month.
 *
 * `POLICE_CATEGORY_LABELS` in `src/lib/constants.ts` is the offline copy this
 * exists to check rather than to replace: a dashboard rendering a stored row
 * must not make a network call to find out what to call `bicycle-theft`. This
 * is for the day somebody wants to know whether the list has moved, and it is
 * why `policeCategoryLabel` falls back to title-casing rather than to "Unknown".
 */
export async function fetchCrimeCategories(
  month: string,
): Promise<PoliceApiResult<{ slug: string; label: string }[]>> {
  const query = new URLSearchParams({ date: month });

  const result = await get(`/crime-categories?${query.toString()}`);

  if (!result.ok) return result;

  if (!Array.isArray(result.data)) {
    return fail("invalid_output", "data.police.uk returned an unreadable category list");
  }

  const categories: { slug: string; label: string }[] = [];

  for (const row of result.data) {
    const parsed = policeCategorySchema.safeParse(row);
    if (parsed.success) {
      categories.push({ slug: parsed.data.url, label: parsed.data.name });
    }
  }

  return { ok: true, data: categories };
}

/**
 * The months the service actually holds, newest first.
 *
 * The sync asks this once a run rather than assuming the publication lag, and
 * the difference matters on exactly the day it usually does not: the lag is
 * about two months and is not a rule, so a sync that assumed it would either
 * miss a month that had just landed or spend a call on one that had not. It
 * also turns "the API returned nothing for July" from a question into a fact.
 *
 * Falls back to an empty list rather than a failure the caller has to branch
 * on — a sync that cannot read the availability list still works, it just asks
 * for months it may not get.
 */
export async function fetchAvailableMonths(): Promise<
  PoliceApiResult<string[]>
> {
  const result = await get("/crimes-street-dates");

  if (!result.ok) return result;

  if (!Array.isArray(result.data)) {
    return fail("invalid_output", "data.police.uk returned an unreadable date list");
  }

  const months: string[] = [];

  for (const row of result.data) {
    const parsed = policeAvailabilitySchema.safeParse(row);
    if (parsed.success) months.push(parsed.data.date);
  }

  // Newest first, which is the order every caller wants and the order the
  // service happens to use — sorted rather than trusted, because "happens to"
  // is not a contract.
  months.sort((a, b) => b.localeCompare(a));

  return { ok: true, data: months };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A force's freehand description, as text.
 *
 * Forces write these in a CMS and the API hands them back with the markup in
 * place — `<p>`, `<br />`, the occasional `<a>`. Rendering that would mean
 * `dangerouslySetInnerHTML` against a third party, which this codebase does
 * exactly once and only over a string it built itself (the landing page's
 * JSON-LD). Stripping is the cheap correct answer: what is wanted is the
 * sentence.
 *
 * Deliberately not a sanitiser. It removes tags rather than deciding which are
 * safe, so there is no allow-list to get wrong and nothing downstream that
 * treats the output as markup.
 */
function stripTags(value: string | null | undefined): string {
  if (!value) return "";

  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A URL from the API, or null.
 *
 * These end up in an `href` on a coordinator's dashboard, and the same
 * reasoning `getVillageChannel` applies to a stored channel link applies to a
 * link somebody else's CMS produced: `http(s)` only, so a `javascript:` URL
 * cannot be one click away from a coordinator's session. Forces also publish
 * bare handles in the Twitter field often enough that a parse failure has to be
 * "render nothing" rather than "render a broken link".
 */
function safeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
