import { EMERGENCY_DISCLAIMER } from "@/lib/digest/format-social-post";
import { appBaseUrl, facebookShareUrl, whatsappShareUrl } from "@/lib/format-alert";
import { formatDate } from "@/lib/format";

/**
 * One weekly summary, as a coordinator shares it — to Facebook, WhatsApp or
 * email, from the share buttons under each card on `/reports`.
 *
 * Client-safe and pure, `format-social-post.ts`'s import budget, so the text on
 * the clipboard, in the WhatsApp link and in the email body is one string built
 * once, and it is testable without a browser.
 *
 * ## What goes out, and why that is acceptable
 *
 * The summary paragraph the digest wrote, with the village and the week in
 * front of it and the 999 disclaimer behind it. It was written to be read by
 * residents — `logDigestAlert` formats the same paragraph as the village
 * channel's line, though nothing posts that — and the digest prompt forbids
 * names, house numbers and registrations. Nothing else from the `PatternAlert`
 * row is included — not the hotspots, not the suggestions, and no link to a
 * report. **This is the first route by which that paragraph leaves the app**,
 * and `/privacy` §6 has its own entry for it.
 *
 * What the model was handed was each report's anonymised `description`, which
 * is the reporter's own wording wherever the AI pass did not run. So the
 * paragraph is model prose over text that is *usually* anonymised. The card
 * shows the text being shared, and the panel says a Facebook post is public,
 * which is the same judgement `CopyAlert` leaves with the coordinator.
 *
 * The disclaimer is there for `formatSocialPost`'s reason: a public post about
 * a village's week reads, to somebody who has never met the service, as a way
 * of telling the police.
 */

export type SummaryShareInput = {
  villageName: string;
  /** ISO strings or dates — the window the digest covered. */
  windowStart: string | Date;
  windowEnd: string | Date;
  /** The digest's paragraph. `PatternAlert.summary`. */
  summary: string;
};

/** "22 September 2026 – 28 September 2026" — the same dates the card prints. */
export function summaryPeriod(input: Pick<SummaryShareInput, "windowStart" | "windowEnd">): string {
  return `${formatDate(input.windowStart)} – ${formatDate(input.windowEnd)}`;
}

/** "VillageWatch weekly summary — Histon — 22 September 2026 – 28 September 2026" */
export function summaryShareSubject(input: SummaryShareInput): string {
  return `VillageWatch weekly summary — ${input.villageName.trim()} — ${summaryPeriod(input)}`;
}

/** The text every destination gets. */
export function formatSummaryShare(input: SummaryShareInput): string {
  return [
    `📋 ${summaryShareSubject(input)}`,
    "",
    input.summary.trim(),
    "",
    ...EMERGENCY_DISCLAIMER,
  ].join("\n");
}

/**
 * A `mailto:` with the subject and body filled in and **no recipient** — the
 * coordinator chooses who it goes to, in their own mail client.
 *
 * `encodeURIComponent` rather than `URLSearchParams`, which writes a space as
 * `+`: RFC 6068 has no such rule and several mail clients put the plus signs
 * into the subject line literally.
 */
export function mailtoUrl(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * The three destinations for one summary.
 *
 * Facebook needs a page to build its card from, and a summary has none — there
 * is no public page for a week. The card is the deployment's own origin, and the
 * summary rides in `quote`, which Facebook often drops; that is why every
 * button copies the text first. `null` when the origin is not an absolute
 * `http(s)` URL, and the button is hidden, `facebookShareUrl`'s rule.
 */
export function summaryShareLinks(
  input: SummaryShareInput,
  appUrl: string = appBaseUrl(),
): { text: string; whatsapp: string; facebook: string | null; email: string } {
  const text = formatSummaryShare(input);

  return {
    text,
    whatsapp: whatsappShareUrl(text),
    facebook: facebookShareUrl(appUrl, text),
    email: mailtoUrl(summaryShareSubject(input), text),
  };
}
