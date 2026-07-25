import type { IncidentType, Severity } from "@/generated/prisma/enums";
import {
  INCIDENT_TYPE_LABELS,
  SEVERITY_META,
} from "@/lib/constants";
import { formatDateTime, formatTimeAgo } from "@/lib/format";
import {
  appUrl,
  button,
  note,
  panel,
  paragraph,
  renderEmail,
  textFooter,
  type EmailMessage,
} from "@/lib/email/layout";

/**
 * The email a resident gets when push could not reach them.
 *
 * Push is the primary channel and always will be — an alert about a break-in
 * two streets away is worth something in the ten minutes after it is published
 * and very little the next morning. But push needs a browser permission, a
 * service worker and a device that has been opened recently, and a good number
 * of residents will have none of those. This is the fallback for them.
 *
 * ## The input type is the point
 *
 * It is the same fields `notifyIncidentPublished` puts in a push payload, and
 * for the same reason: an inbox is barely more private than a lock screen.
 * `rawDescription` is not on it and cannot be — the reporter's verbatim words
 * are restricted to coordinators (domain rule 1) and an email is the one place
 * a leak is permanent, forwarded and unrecallable.
 *
 * `description` — the anonymised rewrite — is included, unlike in the push
 * payload, because an email has room for it and a resident deciding whether to
 * go and check their shed needs more than a title.
 *
 * Nothing calls this yet. Email delivery is unimplemented (see "Not built yet"
 * in CLAUDE.md); `User.notifyEmail` is settable in the schema, absent from the
 * settings screen, and honoured by no dispatch.
 */

export type IncidentEmailInput = {
  villageName: string;
  incidentId: string;
  reference: string;
  type: IncidentType;
  severity: Severity;
  title: string;
  /** The anonymised public column. Never `rawDescription`. */
  description: string;
  locationText: string | null;
  occurredAt: Date;
  /** Set when the report matched others nearby — public, derived from published rows. */
  patternNote?: string | null;
};

export function incidentNotificationEmail(
  input: IncidentEmailInput,
): EmailMessage {
  const severity = SEVERITY_META[input.severity];
  const typeLabel = INCIDENT_TYPE_LABELS[input.type];
  const url = appUrl(`/incidents/${input.incidentId}`);

  const rows = [
    { label: "Type", value: typeLabel },
    { label: "Severity", value: `${severity.emoji} ${severity.label}` },
    ...(input.locationText
      ? [{ label: "Where", value: input.locationText }]
      : []),
    { label: "When", value: formatDateTime(input.occurredAt) },
    { label: "Reference", value: input.reference },
  ];

  const body = [
    panel(rows),
    paragraph(input.description),
    ...(input.patternNote ? [note(input.patternNote)] : []),
    button("See it on the map", url),
    note(
      "The location shown is approximate — reported positions are blurred by " +
        "about a hundred metres before they are stored.",
    ),
  ];

  const text = [
    `${severity.label} alert — ${input.villageName}`,
    "",
    input.title,
    "",
    input.description,
    ...(input.patternNote ? ["", input.patternNote] : []),
    "",
    `Type:      ${typeLabel}`,
    `Severity:  ${severity.label}`,
    ...(input.locationText ? [`Where:     ${input.locationText}`] : []),
    `When:      ${formatDateTime(input.occurredAt)} (${formatTimeAgo(input.occurredAt)})`,
    `Reference: ${input.reference}`,
    "",
    `See it on the map: ${url}`,
    "",
    "The location shown is approximate — reported positions are blurred by",
    "about a hundred metres before they are stored.",
    "",
    textFooter(),
  ].join("\n");

  return {
    // Severity leads, then what and where. A subject line is read in a list of
    // forty others, and those three things are what decide whether it is opened
    // now or after tea.
    subject: `${severity.emoji} ${typeLabel} in ${input.villageName}${input.locationText ? ` — ${input.locationText}` : ""}`,
    text,
    html: renderEmail({
      title: input.title,
      preheader: `${severity.label} · ${typeLabel}${input.locationText ? ` · ${input.locationText}` : ""}`,
      body: body.join("\n"),
      footer:
        `You are receiving this because you asked to hear about ` +
        `${severity.label.toLowerCase()} incidents in ${input.villageName}. ` +
        `Change what you hear about, or how close, in your settings.`,
    }),
  };
}
