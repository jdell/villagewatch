import { appBaseUrl } from "@/lib/format-alert";
import { normalizeJoinCode } from "@/lib/validations";

/**
 * The village invite: the one URL a resident can be handed, and the QR code a
 * coordinator prints it as.
 *
 * **Client-safe.** Same import budget as `format-alert.ts` and for the same
 * reason: the coordinator's dashboard, the printable invite page and the QR
 * component all build the same link, and a link that is assembled in three
 * places is a link that will one day point three different ways.
 * `appBaseUrl()` is borrowed from `format-alert.ts` rather than copied — it is
 * the same question (what is this deployment's origin) with the same answer.
 *
 * ## The join code travels in the URL, and that is the whole design
 *
 * `checkVillageJoin` demands the code whenever the village has one, so an
 * invite without it is an invite that cannot be accepted. Carrying it in the
 * link is what makes a scanned QR land on a form the resident can actually
 * finish, and it is the same disclosure a printed newsletter makes when it
 * prints the code next to the village hall's address.
 *
 * What follows from that is the rule the two public pages keep: **the code is
 * only ever read out of the request, never out of the database.** A public page
 * that looked the code up by slug would hand a village's credential to anybody
 * who could guess a parish name — and the slugs are `name-county`, so they are
 * guessable by design. Someone opening `/invite/<slug>` with no `?code=` gets
 * the village's name and an explanation, not a working invite.
 *
 * The code is not a secret worth much either way (see `JOIN_CODE_ALPHABET` for
 * what it is and is not), but it is the difference between a resident and a
 * `VERIFIED_RESIDENT`, and it is rotatable — `regenerateJoinCode()` is the
 * answer to a flyer that ended up somewhere it should not have.
 */

/** Rendered size of the QR on screen, in CSS pixels. */
export const INVITE_QR_DISPLAY_PX = 256;

/**
 * Size of the copy the Download button saves.
 *
 * 1024px is ~87mm at 300 DPI — a QR that fills a third of an A5 flyer and still
 * scans from across a village hall. `qrcode.react` multiplies this by the
 * device pixel ratio, so the saved file is this or better, never worse.
 */
export const INVITE_QR_PRINT_PX = 1024;

/**
 * What a resident does with the invite, in order.
 *
 * Shared by the printed sheet and the public invite page so the instructions on
 * a flyer and the instructions on screen cannot drift.
 */
export const INVITE_STEPS = [
  "Scan the code with your phone camera.",
  "Create an account — your village and join code are filled in for you.",
  "Report what you see. Personal details are stripped out before anyone else reads it.",
] as const;

type InviteTarget = {
  /** `Village.slug` — the ONS-derived `name-county` identifier. */
  slug: string;
  /** `Village.joinCode`, or null for a village that has never been activated. */
  joinCode?: string | null;
  /** Overridable for a test; defaults to this deployment's origin. */
  baseUrl?: string;
};

/**
 * Absolute link to one village's join page — what the QR code encodes.
 *
 * Falls back to the relative path on a malformed base rather than throwing, the
 * same call `incidentUrl` makes: this runs inside a render, and a broken
 * `NEXT_PUBLIC_APP_URL` should cost a shorter link on a screen rather than a
 * blank one.
 */
export function buildJoinUrl({
  slug,
  joinCode,
  baseUrl = appBaseUrl(),
}: InviteTarget): string {
  return buildInvitePath(`/join/${encodeURIComponent(slug)}`, joinCode, baseUrl);
}

/**
 * Absolute link to the printable invite page.
 *
 * The page a coordinator sends to somebody else — a parish clerk, whoever runs
 * the noticeboard — so that they can print the QR without needing an account.
 * It carries the code for the reason above: the page will not read it from the
 * database, so the link is where it has to come from.
 */
export function buildInviteUrl({
  slug,
  joinCode,
  baseUrl = appBaseUrl(),
}: InviteTarget): string {
  return buildInvitePath(
    `/invite/${encodeURIComponent(slug)}`,
    joinCode,
    baseUrl,
  );
}

function buildInvitePath(
  path: string,
  joinCode: string | null | undefined,
  baseUrl: string,
): string {
  // Normalised on the way in, so a code typed into psql as `oak 7x2` produces
  // the same link as one minted by `generateJoinCode`.
  const code = joinCode ? normalizeJoinCode(joinCode) : "";
  const relative = code ? `${path}?code=${encodeURIComponent(code)}` : path;

  try {
    return new URL(relative, baseUrl).toString();
  } catch {
    return relative;
  }
}

/**
 * The join code out of a query string, or null.
 *
 * Both public pages take `?code=` from Next's `searchParams`, which types a
 * repeated parameter as an array — `?code=A&code=B` is a hand-crafted URL, and
 * the first value is as good an answer as any. Anything that does not look like
 * a code at all comes back null, so a page cannot render `[object Object]` into
 * a QR that somebody then prints a hundred of.
 */
export function readJoinCodeParam(
  value: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;

  const code = normalizeJoinCode(raw);
  return /^[A-Z0-9]{4,16}$/.test(code) ? code : null;
}
