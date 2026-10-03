import type { IncidentType, Severity } from "@/generated/prisma/enums";

/**
 * The report sheet's draft, and the body it sends.
 *
 * The sheet is a different screen over the same two routes the wizard uses —
 * `POST /api/incidents/process` for the AI draft and `POST /api/incidents` to
 * file — and this module is what keeps the second request byte-for-byte the
 * wizard's: the same two description columns, the same provenance block, the
 * same defaults. Pure and client-safe, so those rules are tested rather than
 * trusted.
 */

/** "When", as the sheet offers it — chips for the common answers. */
export const WHEN_OPTIONS = [
  { value: "now", label: "Just now", minutesAgo: 0 },
  { value: "earlier", label: "Earlier today", minutesAgo: 120 },
  { value: "yesterday", label: "Yesterday", minutesAgo: 24 * 60 },
  { value: "custom", label: "Pick a time", minutesAgo: null },
] as const;

export type WhenChoice = (typeof WHEN_OPTIONS)[number]["value"];

/**
 * When it happened, as an ISO string. A chip is an approximation and says so
 * on screen — "earlier today" is two hours back, "yesterday" a day — and
 * `custom` is the `datetime-local` value the resident picked, read in their
 * own zone. A custom value that does not parse falls back to now rather than
 * sending an invalid date the server would refuse.
 */
export function occurredAtFor(
  choice: WhenChoice,
  custom: string,
  now: number,
): string {
  if (choice === "custom") {
    const picked = new Date(custom);
    return Number.isNaN(picked.getTime())
      ? new Date(now).toISOString()
      : picked.toISOString();
  }

  const option = WHEN_OPTIONS.find((o) => o.value === choice);
  return new Date(now - (option?.minutesAgo ?? 0) * 60_000).toISOString();
}

/** What the AI pass returned, kept as provenance — see `incidentAiMetaSchema`. */
export type DraftAiMeta = {
  model: string;
  confidence?: number;
  peopleCount?: number;
  recurring: boolean;
  patternNote?: string;
  severityRationale?: string;
  /** What the reporter chose before the draft — never, in this flow. */
  reporterSeverity?: Severity;
};

/** The subset of an attached file the server is sent. */
export type DraftMedia = {
  storagePath: string;
  thumbnailPath: string;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  durationSeconds?: number;
  facesDetected: number;
};

export type ReportDraft = {
  /** The reporter's own words — typed, spoken, or both. */
  description: string;
  /** The AI's anonymised rewrite, as the reporter left it. Empty if none. */
  publicDescription: string;
  title: string;
  type: IncidentType;
  /**
   * Always set: the server requires one. The AI's suggestion when there was a
   * draft, LOW when there was not — the fallback the wizard documents, and the
   * coordinator's queue is the backstop either way.
   */
  severity: Severity;
  occurredAt: string;
  lat: number;
  lng: number;
  locationText: string;
  /** The AI's keywords, lowercased by the server. */
  tags: readonly string[];
  media: readonly DraftMedia[];
  ai: DraftAiMeta | null;
};

/**
 * The body for `POST /api/incidents`, exactly as the wizard builds it.
 *
 * - **Two description columns.** With a rewrite, `description` is the rewrite
 *   (what the map shows) and `rawDescription` the reporter's words, read only
 *   by the reporter and a coordinator (domain rule 1). With no rewrite there is
 *   one text and the server writes it to both.
 * - **Anonymous by default**, as the wizard's checkbox starts ticked — the
 *   sheet has no byline to switch on, so it never asks.
 * - **Not reported to the police** — the reference can be added on the
 *   report's page afterwards, which is when most people have one.
 * - **`ai` is provenance, not authorisation**, and only sent when the draft
 *   came from a model.
 * - Empty optional strings are omitted rather than sent as `""`.
 */
export function buildReportPayload(draft: ReportDraft) {
  const rewritten = draft.publicDescription.trim().length > 0;

  return {
    type: draft.type,
    severity: draft.severity,
    title: draft.title.trim(),
    description: rewritten ? draft.publicDescription : draft.description,
    ...(rewritten ? { rawDescription: draft.description } : {}),
    occurredAt: draft.occurredAt,
    lat: draft.lat,
    lng: draft.lng,
    ...(draft.locationText.trim()
      ? { locationText: draft.locationText.trim() }
      : {}),
    isAnonymous: true,
    reportedToPolice: false,
    media: draft.media,
    tags: draft.tags,
    ...(draft.ai ? { ai: draft.ai } : {}),
  };
}

/** The AI pass needs at least this much text — `incidentProcessSchema`'s floor. */
export const DRAFT_MIN_CHARS = 20;

/** A title the server will accept, from the reporter's words, if the AI gave none. */
export function fallbackTitle(description: string): string {
  const words = description.trim().replace(/\s+/g, " ");
  if (words.length <= 60) return words;
  const cut = words.slice(0, 59);
  const space = cut.lastIndexOf(" ");
  return `${(space > 30 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
