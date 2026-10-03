/**
 * Which interface a resident gets — `classic` or `modern`.
 *
 * The redesign is to be tried one village at a time, so the switch is
 * `Village.uiVersion`, set by a coordinator on Village settings. A resident can
 * override it for their own browser session from the link in the sidebar
 * footer, held in `UI_VERSION_COOKIE`. **Today both values render the same
 * shell**: this is the plumbing, so that the modern shell can be built behind a
 * flag that is already readable everywhere.
 *
 * Client-safe and pure — no Prisma, no `next/headers` — so the layout, a Client
 * Component reading the context, and the tests all resolve the same way. The
 * server half (the column, the cookie, the audited write) is
 * `src/lib/ui-version-server.ts`.
 */

export const UI_VERSIONS = ["classic", "modern"] as const;
export type UiVersion = (typeof UI_VERSIONS)[number];

/** What a village gets until a coordinator changes it — the column default. */
export const DEFAULT_UI_VERSION: UiVersion = "classic";

export const UI_VERSION_META: Record<
  UiVersion,
  { label: string; description: string }
> = {
  classic: {
    label: "Classic",
    description: "The interface every village has today.",
  },
  modern: {
    label: "Modern (beta)",
    description:
      "The redesign, while it is being built. Nothing on screen changes yet — choosing it now means your residents get the new look as soon as it ships.",
  },
};

/**
 * The resident's own override, for this browser session only.
 *
 * A session cookie — no `maxAge`, so it goes when the browser closes — because
 * the override is "let me see the other one for a bit", not a preference
 * anybody asked us to remember. `httpOnly`: the server renders the shell from
 * it and no script needs to read it.
 */
export const UI_VERSION_COOKIE = "vw-ui-version";

/**
 * Narrows a value from a free-text column or a cookie. Anything unrecognised is
 * `null`, never a guess.
 *
 * `includes` over a tuple rather than `in` over an object, which is the trap
 * `resolvePrivacyLevel` documents: `"toString" in {}` is true.
 */
export function parseUiVersion(value: unknown): UiVersion | null {
  return typeof value === "string" &&
    (UI_VERSIONS as readonly string[]).includes(value)
    ? (value as UiVersion)
    : null;
}

/**
 * The version a resident actually sees: their session override if they set a
 * valid one, otherwise their village's, otherwise classic.
 */
export function resolveUiVersion(input: {
  village: unknown;
  override?: unknown;
}): UiVersion {
  return (
    parseUiVersion(input.override) ??
    parseUiVersion(input.village) ??
    DEFAULT_UI_VERSION
  );
}

/** The other one — what the sidebar link offers to switch to. */
export function otherUiVersion(version: UiVersion): UiVersion {
  return version === "classic" ? "modern" : "classic";
}
