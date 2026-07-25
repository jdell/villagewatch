import type { Severity } from "@/generated/prisma/enums";
import { APP_NAME, DIGEST_WINDOW_DAYS, SEVERITY_META } from "@/lib/constants";
import {
  appUrl,
  button,
  heading,
  list,
  note,
  panel,
  paragraph,
  renderEmail,
  textFooter,
  type EmailMessage,
} from "@/lib/email/layout";

/**
 * The weekly digest as an email.
 *
 * `GET /api/digest` already writes a `PatternAlert` and pushes a summary to
 * coordinators' phones. A push body is truncated by the operating system at
 * roughly a sentence, which is fine for "something happened, come and look" and
 * useless for the thing a coordinator actually takes to a parish council
 * meeting. This is that same digest at full length.
 *
 * The input is deliberately the shape `WeeklyDigest` already has, so the digest
 * route can hand its result straight over with no reshaping and no second call
 * to Claude.
 *
 * **Everything here is already public.** The digest is built from published
 * incidents (domain rule 6), which have been through anonymisation and a
 * coordinator. There is no `rawDescription` anywhere in this file and no way to
 * get one into it — the input type has no field that could carry one.
 */

export type WeeklyDigestEmailInput = {
  villageName: string;
  /** As written by the model, or the counted fallback. Under 60 characters. */
  title: string;
  summary: string;
  hotspots: readonly { location: string; note: string }[];
  advice: readonly string[];
  severity: Severity;
  incidentCount: number;
  /** The seven days before this one, for the trend line. */
  previousPeriodCount: number;
  windowStart: Date;
  windowEnd: Date;
  /**
   * True when Claude was unavailable and the summary is arithmetic. The email
   * says so rather than passing off a count as a summary — an outage that looks
   * like a working digest is how a coordinator stops trusting the digest.
   */
  fallback?: boolean;
};

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/London",
});

export function weeklyDigestEmail(input: WeeklyDigestEmailInput): EmailMessage {
  const window = `${DATE.format(input.windowStart)} – ${DATE.format(input.windowEnd)}`;
  const trend = trendLine(input.incidentCount, input.previousPeriodCount);
  const severity = SEVERITY_META[input.severity];

  const reports = `${input.incidentCount} report${input.incidentCount === 1 ? "" : "s"}`;

  // ---- HTML ---------------------------------------------------------------

  const body: string[] = [
    panel([
      { label: "Village", value: input.villageName },
      { label: "Week", value: window },
      { label: "Published", value: reports },
      { label: "Overall", value: `${severity.emoji} ${severity.label}` },
    ]),
    paragraph(input.summary),
  ];

  if (trend) body.push(note(trend));

  if (input.hotspots.length > 0) {
    body.push(heading("Where it clustered"));
    body.push(
      list(input.hotspots.map((spot) => `${spot.location} — ${spot.note}`)),
    );
  }

  if (input.advice.length > 0) {
    body.push(heading("Worth doing this week"));
    body.push(list([...input.advice]));
  }

  body.push(button("Open the dashboard", appUrl("/dashboard")));

  if (input.fallback) {
    body.push(
      note(
        "This week's summary was counted rather than written: the AI service " +
          "was unavailable when the digest ran. The figures are correct.",
      ),
    );
  }

  body.push(
    note(
      "Every report in this summary has been published, which means it has " +
        "already been anonymised and reviewed. It is safe to read out at a " +
        "meeting.",
    ),
  );

  // ---- Text ---------------------------------------------------------------

  const text = [
    `${input.villageName} — the week of ${window}`,
    "",
    input.title,
    "",
    input.summary,
    ...(trend ? ["", trend] : []),
    "",
    `Published this week: ${reports}`,
    `Overall: ${severity.label}`,
    ...section("WHERE IT CLUSTERED", input.hotspots.map((s) => `${s.location} — ${s.note}`)),
    ...section("WORTH DOING THIS WEEK", input.advice),
    "",
    `Dashboard: ${appUrl("/dashboard")}`,
    ...(input.fallback
      ? [
          "",
          "Note: this week's summary was counted rather than written — the AI",
          "service was unavailable when the digest ran. The figures are correct.",
        ]
      : []),
    "",
    textFooter(),
  ].join("\n");

  return {
    subject: `${input.villageName}: ${input.title}`,
    text,
    html: renderEmail({
      title: input.title,
      preheader: `${reports} in the last ${DIGEST_WINDOW_DAYS} days. ${input.summary}`,
      body: body.join("\n"),
      footer:
        `You are receiving this because you are a coordinator for ` +
        `${input.villageName} on ${APP_NAME}.`,
    }),
  };
}

/**
 * "Three more than the week before."
 *
 * Empty when there is no previous figure to compare against, rather than
 * "0% change" — a village in its first week has no trend, and printing one
 * would invent a baseline out of an empty table.
 */
function trendLine(current: number, previous: number): string {
  if (previous === 0) return "";

  const change = current - previous;

  if (change === 0) {
    return `That is the same as the week before (${previous}).`;
  }

  return (
    `That is ${Math.abs(change)} ${change > 0 ? "more" : "fewer"} than the ` +
    `week before (${previous}).`
  );
}

function section(title: string, items: readonly string[]): string[] {
  if (items.length === 0) return [];
  return ["", title, ...items.map((item) => `  - ${item}`)];
}
