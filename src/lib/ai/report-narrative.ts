import Anthropic from "@anthropic-ai/sdk";
import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { AI_MODEL, getAnthropic, isAiConfigured } from "@/lib/ai/client";
import {
  DEFAULT_VILLAGE_MODE,
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
  type VillageMode,
} from "@/lib/constants";
import { reportNarrativeSchema, type ReportNarrativeOutput } from "@/lib/validations";

/**
 * The pattern-analysis section of a community safety report.
 *
 * **Server only.** It reads across the whole village.
 *
 * Same contract as `structure-incident.ts` and `weekly-digest.ts`, and it is
 * the contract rather than the prompt that matters here: the model is
 * constrained by `output_config.format`, the result is re-validated by
 * `reportNarrativeSchema`, and **every failure is a returned value rather than
 * a throw**. A coordinator assembling a report for a meeting in ten minutes
 * must get the report — the counts, the hotspots and the log are all computed
 * from the database and stand on their own. What an outage costs is the prose.
 *
 * Everything it reads has already been published, which means it has already
 * been through the anonymisation pass and, unless the village runs
 * auto-approve, a coordinator. There is no un-anonymised text anywhere in this
 * prompt (domain rule 1).
 *
 * ## Why this is not `generateWeeklyDigest`
 *
 * The digest is addressed to residents and returns `advice` — practical things
 * to do about your own house. Told to a police officer that reads as a
 * neighbourhood watch group explaining policing to them, and it is the section
 * most likely to get the whole document skimmed. This one drops advice, keeps
 * the window open to any length rather than assuming seven days, and asks for
 * the thing a recipient actually cannot get from the table underneath:
 * what connects.
 */

export type NarrativeFailureCode =
  | "not_configured"
  | "no_incidents"
  | "rate_limited"
  | "timeout"
  | "network"
  | "refusal"
  | "truncated"
  | "invalid_output"
  | "upstream";

export type NarrativeResult =
  | { ok: true; data: ReportNarrativeOutput; model: string }
  | { ok: false; code: NarrativeFailureCode; message: string };

/** One published incident, as the narrative needs it. Never `rawDescription`. */
export type NarrativeIncident = {
  reference: string;
  type: IncidentType;
  severity: Severity;
  title: string;
  /** The anonymised public column. */
  description: string;
  locationText: string | null;
  occurredAt: Date;
};

export type NarrativeInput = {
  villageName: string;
  from: Date;
  to: Date;
  incidents: readonly NarrativeIncident[];
  /** Count over the same length of period immediately before this one. */
  previousPeriodCount: number;
  /**
   * Which compliance model the village runs. Decides who the prompt says is
   * reading, and nothing else — the document is identical either way.
   *
   * Defaults to `community`, matching `DEFAULT_VILLAGE_MODE`, so a caller that
   * cannot read the column describes the ordinary case rather than a council.
   */
  mode?: VillageMode;
};

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "patterns", "recommendation", "confidence"],
  properties: {
    summary: {
      type: "string",
      description:
        "Three to six sentences describing the period as a whole: what was reported, how it was distributed across the period, where it concentrated, and how the volume compares with the period before. Written for somebody reading it cold, who has seen none of these reports before.",
    },
    patterns: {
      type: "array",
      items: { type: "string" },
      description:
        "Up to five observations that hold across MORE THAN ONE report — a repeated location, a repeated time of day, a repeated method, an escalation. One sentence each, each naming the reports it rests on by count. Empty if the period shows no connections; an invented pattern in a document sent to the police is worse than a short section.",
    },
    recommendation: {
      type: ["string", "null"],
      description:
        "One sentence on where the coordinator suggests attention goes, if and only if these reports support one — e.g. a location and a time window worth a patrol. Null when they do not. Never generic advice about locking doors.",
    },
    confidence: {
      type: "number",
      description: "0 to 1. How well the narrative reflects the reports given.",
    },
  },
} as const;

/**
 * Who the document is going to, by the village's model.
 *
 * `Village.mode` is the only thing that differs between the two prompts, and it
 * matters more here than it looks: the audience shapes the register. Told the
 * reader is a parish clerk, the model writes for a committee paper; told it is
 * the coordinator's own record, it writes for the person who filed half the
 * reports. Most villages have no council at all, so `community` is the default
 * and describing a clerk to them is describing somebody else's village.
 *
 * **The police are in both.** A village having no parish council says nothing
 * about whether it has a PCSO — the same split `ShareSummary` makes on screen.
 */
const AUDIENCE: Record<VillageMode, { sends: string; reads: string }> = {
  community: {
    sends:
      "A village coordinator sends this report to their local police officer (usually a PCSO) and keeps a copy for the group's own records. There is no parish council behind this village; the coordinator is the data controller.",
    reads:
      "A police officer who has not seen any of these reports before and has no more than a couple of minutes, and the volunteer coordinator who will keep the copy.",
  },
  council: {
    sends:
      "A village coordinator sends this report to their local police officer (usually a PCSO) and to the parish council that runs the village.",
    reads:
      "A police officer or a parish clerk, neither of whom has seen any of these reports before, and neither of whom has more than a couple of minutes.",
  },
};

function systemPrompt(mode: VillageMode): string {
  const audience = AUDIENCE[mode];

  return `You are writing the pattern-analysis section of a Community Safety Report for VillageWatch, a neighbourhood watch service used by villages in the United Kingdom. ${audience.sends}

# Who reads this

${audience.reads} The counts, the breakdowns, the hotspot list and the full incident log are already in the document, laid out around what you write. Do not restate them. Your section is for the thing a table cannot say: what connects.

# Rules

- Report only what the incidents say. Never invent a detail, a trend, a cause or a suspect. If the period shows nothing connected, return an empty \`patterns\` list and say plainly in the summary that the reports appear unrelated.
- Every incident you are given has already been anonymised for publication. Keep it that way: no names, no house numbers, no vehicle registrations. Areas and landmarks only.
- A pattern needs at least two reports behind it. Say how many. "Three of the four vehicle reports were overnight on the same stretch of road" is a pattern; "vehicle crime is a concern" is not.
- These are residents' accounts of what they believe they saw. They are not verified crime records, and the officer reading this knows it. Do not write as though they are — "four residents reported", not "there were four burglaries".
- \`recommendation\` is where the coordinator would point attention, not instructions to the police. If the reports do not support one, return null. A suggestion invented to fill the field is the section that costs the document its credibility.
- Never suggest who is responsible, and never repeat a description of a person even where one survived anonymisation.

# Writing

- British English: "antisocial behaviour", "neighbour", "vehicle", "999".
- Factual and unexcited. This is a working document, not an appeal.
- Plain sentences. No headings, no bullet markers, no markdown — the fields are already structured, and the document formats them.`;
}

export async function generateReportNarrative(
  input: NarrativeInput,
): Promise<NarrativeResult> {
  if (!isAiConfigured) {
    return {
      ok: false,
      code: "not_configured",
      message: "AI summarising is not configured on this deployment.",
    };
  }

  if (input.incidents.length === 0) {
    // Not a failure, and not something to ask a model about. A period with
    // nothing published needs a sentence saying so, which the caller already
    // has — see `countedNarrative` in `src/lib/reports.ts`.
    return {
      ok: false,
      code: "no_incidents",
      message: "Nothing was published in this village during the period.",
    };
  }

  let message: Anthropic.Message;

  try {
    message = await getAnthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 8_000,
      system: systemPrompt(input.mode ?? DEFAULT_VILLAGE_MODE),
      thinking: { type: "adaptive" },
      output_config: {
        // Same tier as the weekly digest. Nobody is standing outdoors waiting
        // for this, and picking out what actually connects across a month of
        // reports is the judgement the whole section rests on.
        effort: "medium",
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    });
  } catch (cause) {
    return classifyError(cause);
  }

  if (message.stop_reason === "refusal") {
    return {
      ok: false,
      code: "refusal",
      message: "The AI declined to summarise this period.",
    };
  }

  if (message.stop_reason === "max_tokens") {
    return {
      ok: false,
      code: "truncated",
      message: "The AI response was cut short.",
    };
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      code: "invalid_output",
      message: "The AI returned something that was not valid JSON.",
    };
  }

  const parsed = reportNarrativeSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Report narrative failed validation", parsed.error.issues);
    return {
      ok: false,
      code: "invalid_output",
      message: "The AI returned a summary that did not match the expected shape.",
    };
  }

  return { ok: true, data: parsed.data, model: message.model };
}

/**
 * The reports, grouped by the landmark residents typed.
 *
 * Grouping on free text is crude — "Mill Road" and "the top of Mill Road" are
 * two buckets — but it groups on the vocabulary the summary has to come back
 * in, and the model can merge what obviously belongs together. Same reasoning
 * as `weekly-digest.ts`, which does it for the same reason.
 *
 * The weekday and the hour are both in the line, because two of the patterns
 * this section exists to find — a night, and a time of day — are invisible
 * without them.
 */
function buildUserPrompt(input: NarrativeInput): string {
  const groups = new Map<string, NarrativeIncident[]>();

  for (const incident of input.incidents) {
    const key = incident.locationText?.trim() || "No location given";
    const existing = groups.get(key);

    if (existing) existing.push(incident);
    else groups.set(key, [incident]);
  }

  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  const lines: string[] = [];

  for (const [location, incidents] of ordered) {
    lines.push(`## ${location} (${incidents.length})`);

    for (const incident of incidents) {
      const when = incident.occurredAt.toLocaleString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/London",
      });

      lines.push(
        `- ${when} | ${INCIDENT_TYPE_LABELS[incident.type]} | ${SEVERITY_LABELS[incident.severity]} | ${incident.title}`,
        `  ${incident.description}`,
      );
    }

    lines.push("");
  }

  const change = input.incidents.length - input.previousPeriodCount;
  const trend =
    input.previousPeriodCount === 0
      ? "There is no comparable figure for the period before this one."
      : change === 0
        ? `The period immediately before saw the same number, ${input.previousPeriodCount}.`
        : `The period immediately before saw ${input.previousPeriodCount} — ${Math.abs(change)} ${change > 0 ? "fewer" : "more"} than this one.`;

  return [
    `<period village="${input.villageName}" from="${input.from.toISOString()}" to="${input.to.toISOString()}">`,
    `${input.incidents.length} reports were published in this village during the period. ${trend}`,
    "",
    "Grouped by the location residents gave:",
    "",
    ...lines,
    "</period>",
    "",
    "Write the pattern-analysis section.",
  ].join("\n");
}

function classifyError(cause: unknown): NarrativeResult {
  // Most specific first — `APIConnectionTimeoutError` extends
  // `APIConnectionError`, which extends `APIError`.
  if (cause instanceof Anthropic.APIConnectionTimeoutError) {
    return { ok: false, code: "timeout", message: "The AI took too long." };
  }

  if (cause instanceof Anthropic.RateLimitError) {
    return { ok: false, code: "rate_limited", message: "The AI is busy." };
  }

  if (cause instanceof Anthropic.AuthenticationError) {
    console.error("Anthropic rejected the API key", cause);
    return {
      ok: false,
      code: "not_configured",
      message: "AI summarising is not configured correctly on this deployment.",
    };
  }

  if (cause instanceof Anthropic.APIConnectionError) {
    return {
      ok: false,
      code: "network",
      message: "Could not reach the AI service.",
    };
  }

  if (cause instanceof Anthropic.APIError) {
    console.error("Anthropic narrative request failed", cause.status, cause.message);
    return {
      ok: false,
      code: "upstream",
      message: "The AI service returned an error.",
    };
  }

  console.error("Unexpected failure generating the report narrative", cause);
  return { ok: false, code: "upstream", message: "Something went wrong." };
}
