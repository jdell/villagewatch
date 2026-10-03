import { NOTIFICATION_RADII } from "@/lib/constants";

/**
 * The small arithmetic behind "You" — the avatar's initials, the days on the
 * profile card, and the radius slider's stops. Client-safe and pure, so it is
 * tested (`tests/you.test.ts`) rather than eyeballed on a phone.
 */

/**
 * Up to two letters for the avatar: the first of the first word and the first
 * of the last. "?" for a name with no letters in it — an avatar with nothing on
 * it reads as a failed image, which is worse than a mark that says "unknown".
 *
 * `Array.from` rather than indexing, so a name starting with a character
 * outside the BMP is one letter rather than half a surrogate pair.
 */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word));
  if (words.length === 0) return "?";

  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : "";
  return (first + last).toLocaleUpperCase("en-GB");
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days since `since`, counting the day itself as day one — somebody who
 * joined this morning has been a member for one day, not zero, and a profile
 * card reading "0 days" looks broken. Never negative.
 */
export function daysSince(since: Date, now: Date): number {
  return Math.max(1, Math.floor((now.getTime() - since.getTime()) / DAY_MS) + 1);
}

/**
 * The radius slider runs over `NOTIFICATION_RADII` by position, not by metres:
 * the stops are 100, 200, 500 and 1,000 and "the whole village", which is not a
 * distance at all. The last stop is the village; the slider moves outwards.
 */
export const RADIUS_STOPS = [
  ...NOTIFICATION_RADII.filter((option) => option.value !== null),
  ...NOTIFICATION_RADII.filter((option) => option.value === null),
];

/** The slider position for a stored radius. Unknown values read as the village. */
export function radiusStop(value: number | null): number {
  const index = RADIUS_STOPS.findIndex((option) => option.value === value);
  return index === -1 ? RADIUS_STOPS.length - 1 : index;
}
