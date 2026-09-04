import type { Severity } from "@/generated/prisma/enums";
import { formatTimeAgo } from "@/lib/format";
import {
  ALERT_DESCRIPTION_MAX_CHARS,
  APP_ORIGIN,
  SEVERITY_META,
  WHATSAPP_POST_MAX_CHARS,
} from "@/lib/constants";

/**
 * The published alert as a block of text a coordinator can paste into WhatsApp.
 *
 * There is no relay — see `src/lib/whatsapp-channel.ts` for why Meta offers no
 * endpoint that posts to a Channel — so the village's channel is fed by a person
 * with a clipboard. This module is the format that person copies, and it is the
 * same format the server writes to the log when a report is published, so what
 * lands in the channel and what the trail says went out cannot drift apart.
 *
 * **Safe to import from a Client Component.** It pulls in `constants.ts` (types
 * only from Prisma) and `format.ts` (Intl), and nothing else. No Prisma client,
 * no `node:crypto`, no environment secret.
 *
 * ## What may be in it
 *
 * A channel is public — anyone holding the invite link can read it, including
 * people outside the village — so `AlertIncident` is deliberately shaped like
 * the `IncidentEmailInput` beside it: there is **no field that could carry
 * `rawDescription`, `lat` or `lng`**. A leak here is not recallable;
 * a channel post is forwarded, screenshotted and indexed, and deleting it does
 * not un-send it.
 *
 * `description` is the anonymised public column and is the one field this format
 * carries that the old relay post did not. That is a real widening and worth
 * naming: the relay posted a headline and a link on the reasoning that anyone
 * entitled to the detail could sign in and read it. Here the coordinator is the
 * one pressing paste, on a report they have just approved, having read it — so
 * the judgement is theirs and it is made with the text in front of them. It is
 * still truncated: `ALERT_DESCRIPTION_MAX_CHARS` is a summary, and the link is
 * what carries the rest.
 *
 * Note what `description` is **not** guaranteed to be. When the AI pass did not
 * run — no key, a timeout, a reporter who declined the rewrite — it holds the
 * reporter's own wording, the same text as `rawDescription`. That is already the
 * public column the map and the incident list render, so nothing new is exposed
 * to the village; what is new is that a coordinator can now put it in front of
 * the open internet in one click. `anonymized` is the column that says which of
 * the two it is, and the surfaces that render this warn on it.
 */

export type AlertIncident = {
  id: string;
  title: string;
  severity: Severity;
  /** The anonymised public column. Never `rawDescription`. */
  description: string;
  locationText: string | null;
  occurredAt: Date | string | number;
  recurring?: boolean;
  patternNote?: string | null;
};

/**
 * The deployment's own origin.
 *
 * `NEXT_PUBLIC_APP_URL` is inlined at build time, so this reads the same value
 * in a Server Component, a route handler and the browser — which matters,
 * because the link in a pasted alert and the link in a push notification have to
 * point at the same place.
 *
 * Unset, it falls back to `APP_ORIGIN` rather than to `localhost`: this link is
 * pasted into a public channel by a coordinator who cannot see which of the two
 * they got.
 */
export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? APP_ORIGIN;
}

/**
 * The path a published report's **public preview** lives at.
 *
 * `/incident`, singular — deliberately not `/incidents/[id]`, which is the
 * authenticated detail page and is in `PROTECTED_ROUTES`. The two differ by one
 * letter and by everything else: the plural renders the full description, the
 * landmark, the map pin, the media and the vote buttons to a signed-in resident
 * of that village; the singular shows a category, a severity, a date, a village
 * and the first line of the anonymised description to anybody holding the link.
 *
 * ## Why it is defined here and not in `src/lib/public-incident.ts`
 *
 * That module owns everything else about the preview and would be the obvious
 * home. It cannot be: it imports Prisma, and this file is imported by
 * `copy-alert.tsx`, which is a Client Component. Pulling the server module in
 * would drag the Prisma client into a browser bundle and break the build — the
 * import budget in this file's header ("no Prisma client, no `node:crypto`, no
 * environment secret") is the constraint being honoured, not an accident of
 * layering. `public-incident.ts` already imports `truncateWords` from here for
 * the same reason, so the direction of the dependency is established.
 */
export function publicIncidentPath(id: string): string {
  return `/incident/${id}`;
}

/**
 * Absolute link to one report, for a coordinator to share.
 *
 * **It points at the public preview, not the authenticated detail page**, and
 * that is the entire purpose of this function rather than a detail of it. Every
 * caller is a coordinator putting a report in front of people who are not
 * signed in — the "View details" line of a pasted WhatsApp alert, and the
 * Facebook share button beside it. Aimed at `/incidents/[id]` those links were
 * a redirect to `/login`: a neighbour who has never had an account taps a link
 * from their village's WhatsApp group and is asked to sign in to something they
 * have never heard of, which is the point at which most of them stop.
 *
 * The pair of links a resident *should* follow into the app are built
 * elsewhere and are untouched by this: the push deep link in
 * `notifications.ts` and the email link in `email/layout.ts` both address
 * somebody who already has an account, so both still point at the full report.
 *
 * Falls back to the relative path rather than throwing on a malformed base. This
 * runs inside a render, and a broken `NEXT_PUBLIC_APP_URL` should cost a shorter
 * link in a clipboard, not a blank screen.
 *
 * Exported because the share buttons need the same address the alert text
 * carries. Two builders would be two links, and the day they disagreed a
 * coordinator would post a card pointing at one report with the text of another.
 */
export function incidentUrl(id: string, appUrl: string = appBaseUrl()): string {
  const path = publicIncidentPath(id);

  try {
    return new URL(path, appUrl).toString();
  } catch {
    return path;
  }
}

/**
 * WhatsApp's own share link, with the alert prefilled.
 *
 * `https://wa.me/?text=` rather than a `whatsapp://` scheme URL. The two behave
 * identically on a phone; on a desktop `whatsapp://` opens the desktop app if it
 * happens to be installed and otherwise fails silently with nothing on screen,
 * where `wa.me` falls through to WhatsApp Web.
 */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Facebook's share dialog for one report.
 *
 * `u` is the report's own page and is the half that does the work: Facebook
 * builds the card from that URL, and it is what a reader clicks. `quote` is the
 * alert text, offered as the post's opening message.
 *
 * **Facebook honours `quote` inconsistently and often drops it entirely.**
 * Prefilled text was deprecated as a platform policy — a share the user did not
 * write is a share they did not mean — so the dialog may open with an empty
 * composer whatever is sent here. That is why the surface that renders this
 * copies the alert to the clipboard first: the coordinator can paste it into the
 * composer, and the button is never worse than a link with nothing to say about
 * it.
 *
 * Returns `null` for anything that is not an absolute `http(s)` URL. Sharing a
 * relative path would post `facebook.com/incidents/<id>` to a public feed — a
 * dead link that reads as a working one, which is the outcome
 * `incidentUrl`'s own fallback is one step away from producing on a deployment
 * with a malformed `NEXT_PUBLIC_APP_URL`. The button is hidden instead.
 */
export function facebookShareUrl(url: string, text: string): string | null {
  if (!/^https?:\/\//i.test(url)) return null;

  const params = new URLSearchParams({ u: url, quote: text });

  return `https://www.facebook.com/sharer/sharer.php?${params.toString()}`;
}

/**
 * Trims to `max` characters on a word boundary, with an ellipsis.
 *
 * Falls back to a hard cut when the last space is early enough that respecting
 * it would throw away most of the budget — a single 400-character "word" is a
 * URL somebody pasted into a description, and losing all of it is worse than
 * cutting it.
 */
export function truncateWords(value: string, max: number): string {
  if (value.length <= max) return value;

  const cut = value.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");

  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * One published incident as a WhatsApp-ready alert.
 *
 * ```
 * 🔴 HIGH — Shed broken into overnight
 * 📍 The lane behind the village hall · 2 hours ago
 *
 * A garden shed was forced open overnight and tools were taken.
 *
 * ⚠️ Pattern: fourth report in this area this month
 *
 * View details: https://villagewatch.app/incidents/abc123
 * ```
 *
 * **The link is never sacrificed to the length limit.** The header, the place,
 * the pattern note and the link are built first and the description is given
 * whatever of `WHATSAPP_POST_MAX_CHARS` is left over — so a very long report
 * loses its summary rather than the address of the full one, which is the half a
 * reader can do something with.
 *
 * No `*bold*` markup. It renders in WhatsApp and nowhere else, and this text is
 * as likely to be pasted into a village mailing list or a parish newsletter as
 * into a channel.
 */
export function formatIncidentAlert(
  incident: AlertIncident,
  appUrl: string = appBaseUrl(),
): string {
  const meta = SEVERITY_META[incident.severity];
  const when = formatTimeAgo(incident.occurredAt);

  const head = [
    // Upper case for the severity, which is the one word that has to survive
    // being read at arm's length on a phone.
    `${meta.emoji} ${meta.label.toUpperCase()} — ${incident.title.trim()}`,
    incident.locationText?.trim()
      ? `📍 ${incident.locationText.trim()} · ${when}`
      : `🕒 ${when}`,
  ];

  const tail: string[] = [];

  if (incident.recurring && incident.patternNote?.trim()) {
    tail.push("", `⚠️ Pattern: ${incident.patternNote.trim()}`);
  }

  tail.push("", `View details: ${incidentUrl(incident.id, appUrl)}`);

  const description = incident.description.trim();

  if (description.length === 0) {
    return [...head, ...tail].join("\n");
  }

  // Two blank-line separators plus everything already committed to. What is left
  // is the description's budget, capped at the summary length either way.
  const spent = [...head, ...tail].join("\n").length + 2;
  const budget = Math.min(
    ALERT_DESCRIPTION_MAX_CHARS,
    WHATSAPP_POST_MAX_CHARS - spent,
  );

  // Below roughly a sentence there is nothing useful left to say, and half a
  // clause reads worse than no clause.
  if (budget < 40) return [...head, ...tail].join("\n");

  return [...head, "", truncateWords(description, budget), ...tail].join("\n");
}
