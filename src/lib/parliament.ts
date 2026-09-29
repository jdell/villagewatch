/**
 * UK Parliament Members API client. **Server only.**
 *
 * Looks up the current MP for a postcode via
 * `members-api.parliament.uk/api/Location/Constituency/Search`. Free, keyless,
 * no account required — Open Parliament Licence.
 *
 * ## The contract
 *
 * Same as `police-api.ts`: **every failure is a returned value, never a throw.**
 * A missing postcode, a timeout, a body that will not parse and an API returning
 * 500 are all ordinary states. The caller is a coordinator pressing a button on
 * `/reports`, and the button must never become an error page because Parliament's
 * API is down.
 *
 * ## What is returned
 *
 * The MP's name, party, constituency, parliamentary email and office address.
 * `bio` is deliberately excluded (force-authored HTML, same reasoning as
 * `police-api.ts`). The thumbnail URL is included so the letter preview can
 * show who the coordinator is writing to.
 */

const PARLIAMENT_API_BASE = "https://members-api.parliament.uk/api";
const PARLIAMENT_TIMEOUT_MS = 10_000;

// ── Result types ─────────────────────────────────────────────────────────────

export interface MpInfo {
  /** Full display name, e.g. "Daniel Zeichner" */
  name: string;
  /** Full title, e.g. "Daniel Zeichner MP" */
  fullTitle: string;
  /** How to address them, e.g. "Daniel Zeichner" */
  addressAs: string;
  /** Party name, e.g. "Labour" */
  party: string;
  /** Constituency name, e.g. "Cambridge" */
  constituency: string;
  /** Parliamentary email, or null if not published */
  email: string | null;
  /** Parliamentary office address lines */
  officeAddress: string | null;
  /** Thumbnail URL from Parliament */
  thumbnailUrl: string | null;
  /** Member ID on the Parliament API */
  memberId: number;
}

export type MpLookupResult =
  | { ok: true; mp: MpInfo }
  | { ok: false; code: MpLookupErrorCode; message: string };

export type MpLookupErrorCode =
  | "no_postcode"
  | "not_found"
  | "no_mp"
  | "timeout"
  | "api_error"
  | "parse_error";

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Look up the current MP for a UK postcode.
 *
 * The postcode is sent to Parliament's API as a constituency search term —
 * the API recognises full postcodes and returns the constituency with its
 * current representative. A second call fetches the MP's contact details
 * (email and parliamentary office address).
 *
 * Never throws. Every failure is a typed result.
 */
export async function lookupMpByPostcode(
  postcode: string | null | undefined,
): Promise<MpLookupResult> {
  if (!postcode?.trim()) {
    return {
      ok: false,
      code: "no_postcode",
      message:
        "This village has no postcode set. Add one in the village directory to look up your MP.",
    };
  }

  const cleaned = postcode.trim().toUpperCase();

  // Step 1: postcode → constituency + current MP
  const constituencyResult = await fetchConstituency(cleaned);
  if (!constituencyResult.ok) return constituencyResult;

  const { mp: basicMp } = constituencyResult;

  // Step 2: fetch contact details
  const contact = await fetchMpContact(basicMp.memberId);

  return {
    ok: true,
    mp: {
      ...basicMp,
      email: contact?.email ?? null,
      officeAddress: contact?.officeAddress ?? null,
    },
  };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Narrows an unknown JSON value to an object, or undefined for anything else. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

async function fetchConstituency(
  postcode: string,
): Promise<MpLookupResult> {
  const url = `${PARLIAMENT_API_BASE}/Location/Constituency/Search?searchText=${encodeURIComponent(postcode)}&skip=0&take=1`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(PARLIAMENT_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { ok: false, code: "timeout", message: "Parliament API timed out." };
    }
    return {
      ok: false,
      code: "api_error",
      message: "Could not reach the Parliament API.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: "api_error",
      message: `Parliament API returned ${response.status}.`,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, code: "parse_error", message: "Unexpected response from Parliament API." };
  }

  // Navigate the response shape
  const items = (body as Record<string, unknown>)?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return {
      ok: false,
      code: "not_found",
      message: `No constituency found for postcode "${postcode}".`,
    };
  }

  const constituency = items[0]?.value;
  if (!constituency) {
    return { ok: false, code: "not_found", message: "No constituency data returned." };
  }

  const rep = asRecord(asRecord(constituency)?.currentRepresentation);
  const member = asRecord(asRecord(rep?.member)?.value);

  if (!member) {
    return {
      ok: false,
      code: "no_mp",
      message: `The constituency "${(constituency as Record<string, unknown>)?.name ?? "unknown"}" has no current MP.`,
    };
  }

  const m = member;
  const party = m.latestParty as Record<string, unknown> | undefined;

  return {
    ok: true,
    mp: {
      name: String(m.nameDisplayAs ?? ""),
      fullTitle: String(m.nameFullTitle ?? ""),
      addressAs: String(m.nameAddressAs ?? m.nameDisplayAs ?? ""),
      party: String(party?.name ?? ""),
      constituency: String((constituency as Record<string, unknown>).name ?? ""),
      email: null, // Filled by the contact call
      officeAddress: null,
      thumbnailUrl: typeof m.thumbnailUrl === "string" ? m.thumbnailUrl : null,
      memberId: Number(m.id ?? 0),
    },
  };
}

async function fetchMpContact(
  memberId: number,
): Promise<{ email: string | null; officeAddress: string | null } | null> {
  const url = `${PARLIAMENT_API_BASE}/Members/${memberId}/Contact`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(PARLIAMENT_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
  } catch {
    return null; // Contact is optional — degrade rather than fail
  }

  if (!response.ok) return null;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  const contacts = (body as Record<string, unknown>)?.value;
  if (!Array.isArray(contacts)) return null;

  // Find the parliamentary office contact
  const office = contacts.find(
    (c: Record<string, unknown>) =>
      String(c.type ?? "").toLowerCase().includes("parliamentary"),
  ) as Record<string, unknown> | undefined;

  const email =
    typeof office?.email === "string" && office.email.includes("@")
      ? office.email
      : null;

  const addressLines = [office?.line1, office?.line2, office?.line3, office?.line4, office?.line5, office?.postcode]
    .filter((line): line is string => typeof line === "string" && line.trim() !== "")
    .join(", ");

  return {
    email,
    officeAddress: addressLines || null,
  };
}
