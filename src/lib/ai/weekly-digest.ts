import Anthropic from "@anthropic-ai/sdk";
import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { AI_MODEL, getAnthropic, isAiConfigured } from "@/lib/ai/client";
import {
  DEFAULT_VILLAGE_MODE,
  DIGEST_WINDOW_DAYS,
  INCIDENT_TYPE_LABELS,
  SEVERITIES,
  SEVERITY_LABELS,
  SEVERITY_META,
  type VillageMode,
} from "@/lib/constants";
import { weeklyDigestSchema, type WeeklyDigest } from "@/lib/validations";

/**
 * The weekly digest: one plain-English readout of what a village saw in the
 * last seven days.
 *
 * **Server only.** It reads across the whole village.
 *
 * Same contract as `structure-incident.ts` and for the same reasons: the model
 * is constrained by `output_config.format`, the result is re-validated by
 * `weeklyDigestSchema`, and every failure is a returned value rather than a
 * throw. The digest runs from a cron job with nobody watching, so a rate limit
 * at 09:00 on a Sunday has to degrade into "no digest this week", not a 500
 * that silently retries forever.
 *
 * Everything it reads has already been published, which means it has already
 * been through the anonymisation pass and a coordinator. There is no
 * un-anonymised text anywhere in this prompt (domain rule 1).
 */

export type DigestFailureCode =
  | "not_configured"
  | "no_incidents"
  | "rate_limited"
  | "timeout"
  | "network"
  | "refusal"
  | "truncated"
  | "invalid_output"
  | "upstream";

export type DigestResult =
  | { ok: true; data: WeeklyDigest; model: string }
  | { ok: false; code: DigestFailureCode; message: string };

/** One published incident, as the digest needs it. */
export type DigestIncident = {
  reference: string;
  type: IncidentType;
  severity: Severity;
  title: string;
  /** The anonymised public column. Never `rawDescription`. */
  description: string;
  locationText: string | null;
  occurredAt: Date;
};

export type WeeklyDigestInput = {
  villageName: string;
  incidents: readonly DigestIncident[];
  /** Count over the seven days before this one, for the trend sentence. */
  previousPeriodCount: number;
  /**
   * Which compliance model the village runs. Decides one sentence of the prompt
   * — where a coordinator takes this — and nothing else.
   *
   * Defaults to `community`, matching `DEFAULT_VILLAGE_MODE`: the digest runs
   * from a cron sweep across every active village, and one that cannot be read
   * should describe the ordinary case rather than a parish council meeting most
   * villages do not have.
   */
  mode?: VillageMode;
  /** Injected in tests; defaults to now. */
  now?: Date;
};

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "hotspots", "advice", "severity", "confidence"],
  properties: {
    title: {
      type: "string",
      description:
        'Under 60 characters, e.g. "Quiet week, two vehicle break-ins on Oak Lane".',
    },
    summary: {
      type: "string",
      description:
        "Two to four sentences describing the week: what was reported, where it clustered, and how it compares with the week before.",
    },
    hotspots: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["location", "note"],
        properties: {
          location: {
            type: "string",
            description:
              "The area, exactly as it appeared in the reports. Never a house number.",
          },
          note: {
            type: "string",
            description: "One sentence on what happened there this week.",
          },
        },
      },
      description:
        "Up to five areas that saw more than one report. Empty if nothing clustered — do not invent a hotspot from a single incident.",
    },
    advice: {
      type: "array",
      items: { type: "string" },
      description:
        "Up to three specific, practical suggestions that follow from THIS week's reports. Empty if the week gives no basis for any. Never generic filler.",
    },
    severity: {
      type: "string",
      enum: SEVERITIES.map((entry) => entry.value),
      description: "How much attention this week warrants overall.",
    },
    confidence: {
      type: "number",
      description: "0 to 1. How well the summary reflects the reports given.",
    },
  },
} as const;

/**
 * Where a coordinator takes the digest, by the village's model.
 *
 * The only sentence in this prompt that `Village.mode` moves, and it is worth
 * moving: told the readout ends up in front of a parish council, the model
 * writes towards a committee, and most villages have no council to write
 * towards. **Police liaison stays in both** — a village with no council can
 * still have a PCSO.
 */
const PURPOSE: Record<VillageMode, string> = {
  community:
    "Coordinators take this to police liaison meetings and keep it as the group's own record of the week; there is no parish council behind this village.",
  council:
    "Coordinators take this to parish council and police liaison meetings.",
};

function systemPrompt(mode: VillageMode): string {
  return `You are writing the weekly summary for VillageWatch, a neighbourhood watch service used by villages in the United Kingdom. You are given every incident published in one village over the last ${DIGEST_WINDOW_DAYS} days. Write the readout its coordinators and residents will see.

# What this is for

${PURPOSE[mode]} Residents read it to decide whether to change anything about their week. It has to be worth the two minutes it takes to read.

# Rules

- Report only what the incidents say. Never invent a detail, a trend or a cause. If the week was quiet, say the week was quiet — a thin week is a good outcome, not a failure to find something.
- Every incident you are given has already been anonymised. Keep it that way: no names, no house numbers, no registrations. Areas and landmarks only.
- \`hotspots\` needs a real cluster: two or more reports in the same area. One incident somewhere is not a hotspot, and calling it one teaches people to ignore the section.
- \`advice\` must follow from these specific reports — "check side gates are bolted, both break-ins came through back gardens" is useful; "stay vigilant" is not. If the week supports no advice, return an empty list.
- Set \`severity\` for the week as a whole, not for its worst single incident. A quiet week with one serious report is not a CRITICAL week.

# Writing

- British English: "antisocial behaviour", "neighbour", "vehicle", "999".
- Calm and factual. This is read by neighbours, some of whom are already worried. No sensationalism, no speculation about who is responsible.
- Plain sentences. No headings, no bullet markers, no markdown — the fields are already structured.`;
}

export async function generateWeeklyDigest(
  input: WeeklyDigestInput,
): Promise<DigestResult> {
  if (!isAiConfigured) {
    return {
      ok: false,
      code: "not_configured",
      message: "AI summarising is not configured on this deployment.",
    };
  }

  if (input.incidents.length === 0) {
    // Not a failure. A village with nothing to report does not need a digest,
    // and a summary of an empty list is a paragraph saying nothing at length.
    return {
      ok: false,
      code: "no_incidents",
      message: "Nothing was published in this village during the window.",
    };
  }

  const now = input.now ?? new Date();

  let message: Anthropic.Message;

  try {
    message = await getAnthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 8_000,
      system: systemPrompt(input.mode ?? DEFAULT_VILLAGE_MODE),
      thinking: { type: "adaptive" },
      output_config: {
        // Higher than the per-report pass: this one runs weekly rather than
        // with a reporter waiting, and picking out what actually clustered
        // across sixty incidents is the judgement the whole feature rests on.
        effort: "medium",
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      messages: [{ role: "user", content: buildUserPrompt(input, now) }],
    });
  } catch (cause) {
    return classifyError(cause);
  }

  if (message.stop_reason === "refusal") {
    return {
      ok: false,
      code: "refusal",
      message: "The AI declined to summarise this week.",
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

  const parsed = weeklyDigestSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Weekly digest failed validation", parsed.error.issues);
    return {
      ok: false,
      code: "invalid_output",
      message: "The AI returned a summary that did not match the expected shape.",
    };
  }

  return { ok: true, data: parsed.data, model: message.model };
}

function buildUserPrompt(input: WeeklyDigestInput, now: Date): string {
  const windowStart = new Date(
    now.getTime() - DIGEST_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const byLocation = groupByLocation(input.incidents);

  const lines: string[] = [];

  for (const [location, incidents] of byLocation) {
    lines.push(`## ${location} (${incidents.length})`);

    for (const incident of incidents) {
      const day = incident.occurredAt.toLocaleDateString("en-GB", {
        weekday: "long",
        timeZone: "Europe/London",
      });

      lines.push(
        `- ${day} | ${INCIDENT_TYPE_LABELS[incident.type]} | ${SEVERITY_LABELS[incident.severity]} | ${incident.title}`,
        `  ${incident.description}`,
      );
    }

    lines.push("");
  }

  const change = input.incidents.length - input.previousPeriodCount;
  const trend =
    input.previousPeriodCount === 0
      ? "There is no comparable figure for the previous week."
      : change === 0
        ? `The previous ${DIGEST_WINDOW_DAYS} days saw the same number, ${input.previousPeriodCount}.`
        : `The previous ${DIGEST_WINDOW_DAYS} days saw ${input.previousPeriodCount} — ${Math.abs(change)} ${change > 0 ? "fewer" : "more"} than this week.`;

  return [
    `<week village="${input.villageName}" from="${windowStart.toISOString()}" to="${now.toISOString()}">`,
    `${input.incidents.length} incidents were published this week. ${trend}`,
    "",
    "Grouped by the location residents gave:",
    "",
    ...lines,
    "</week>",
    "",
    "Write the weekly summary.",
  ].join("\n");
}

/**
 * Buckets incidents by the landmark the reporter typed, largest group first.
 *
 * Grouping on free text is crude — "Oak Lane" and "the top of Oak Lane" are two
 * buckets — but it groups on what residents actually wrote, which is the
 * vocabulary the summary has to come back in. The model sees the raw grouping
 * and can merge what obviously belongs together.
 */
function groupByLocation(
  incidents: readonly DigestIncident[],
): Map<string, DigestIncident[]> {
  const groups = new Map<string, DigestIncident[]>();

  for (const incident of incidents) {
    const key = incident.locationText?.trim() || "No location given";
    const existing = groups.get(key);

    if (existing) existing.push(incident);
    else groups.set(key, [incident]);
  }

  return new Map(
    [...groups.entries()].sort((a, b) => b[1].length - a[1].length),
  );
}

/** Overall severity when the AI pass is unavailable — the week's worst report. */
export function peakSeverity(incidents: readonly DigestIncident[]): Severity {
  return incidents.reduce<Severity>((worst, incident) => {
    return SEVERITY_META[incident.severity].weight > SEVERITY_META[worst].weight
      ? incident.severity
      : worst;
  }, "LOW");
}

function classifyError(cause: unknown): DigestResult {
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
    return { ok: false, code: "network", message: "Could not reach the AI service." };
  }

  if (cause instanceof Anthropic.APIError) {
    console.error("Anthropic digest request failed", cause.status, cause.message);
    return { ok: false, code: "upstream", message: "The AI service returned an error." };
  }

  console.error("Unexpected failure generating the weekly digest", cause);
  return { ok: false, code: "upstream", message: "Something went wrong." };
}
