import Anthropic from "@anthropic-ai/sdk";
import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { AI_MODEL, getAnthropic, isAiConfigured } from "@/lib/ai/client";
import {
  PATTERN_RADIUS_METERS,
  PATTERN_WINDOW_DAYS,
  formatHistoryForPrompt,
  type NearbyIncident,
} from "@/lib/ai/detect-patterns";
import {
  BASELINE_MONTHS,
  TREND_RECENT_DAYS,
  formatSeverityContextForPrompt,
  type SeverityContext,
} from "@/lib/ai/severity-context";
import {
  INCIDENT_TYPES,
  INCIDENT_TYPE_LABELS,
  SEVERITIES,
  SEVERITY_LABELS,
} from "@/lib/constants";
import {
  structuredIncidentSchema,
  type StructuredIncident,
} from "@/lib/validations";

/**
 * Turn a resident's report into a structured, anonymised incident record.
 *
 * **Server only.** It holds the API key and it reads village-wide history.
 *
 * The output shape is enforced twice over. `output_config.format` constrains
 * the model to the JSON schema below, so there is no prose to strip and no
 * markdown fence to unwrap; `structuredIncidentSchema` then re-checks the
 * result, because a response can satisfy the schema and still be unusable — a
 * 5000-character description, or an `occurred_at` next Tuesday.
 *
 * Nothing here throws for an expected failure. A missing key, a rate limit and
 * a timeout are all ordinary states for this call, and the wizard has a real
 * answer for each of them: publish the reporter's own words into
 * `PENDING_REVIEW` and let a coordinator do what the model would have. Callers
 * get a discriminated union so they cannot forget to handle that.
 */

export type StructureFailureCode =
  | "not_configured"
  | "rate_limited"
  | "timeout"
  | "network"
  | "refusal"
  | "truncated"
  | "invalid_output"
  | "upstream";

export type StructureResult =
  | {
      ok: true;
      data: StructuredIncident;
      model: string;
      usage: { inputTokens: number; outputTokens: number };
    }
  | { ok: false; code: StructureFailureCode; message: string };

export type StructureIncidentInput = {
  /** The reporter's verbatim words. Never leaves the server un-rewritten. */
  description: string;
  /** What the reporter picked in the wizard. A hint, not a decision. */
  reportedType?: IncidentType;
  reportedSeverity?: Severity;
  /** When the reporter said it happened. */
  occurredAt?: Date;
  /** The landmark the reporter typed, if any. */
  locationText?: string;
  villageName: string;
  /** One already-blurred still, base64 encoded. Never an original. */
  image?: { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string };
  /** Published incidents within 200m in the last 30 days. */
  history: readonly NearbyIncident[];
  /**
   * How busy this area normally is and whether the category is rising.
   * Null or omitted where the village is too young to say — see
   * `severity-context.ts`, which returns the block or nothing rather than a
   * baseline of zero the model would read as "nothing ever happens here".
   */
  severityContext?: SeverityContext | null;
  /** Injected in tests; defaults to now. */
  now?: Date;
};

/**
 * The JSON schema the model is constrained to.
 *
 * Structured outputs support a subset of JSON Schema: every object needs
 * `additionalProperties: false` and a complete `required` list, and nullability
 * has to be spelled out with `anyOf` rather than a type array. Numeric and
 * string length constraints are not enforced — that is what the Zod pass is
 * for.
 */
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "type",
    "severity",
    "title",
    "description",
    "people_count",
    "tags",
    "occurred_at",
    "location_name",
    "recurring",
    "pattern_note",
    "confidence",
    "severity_rationale",
  ],
  properties: {
    type: {
      type: "string",
      enum: INCIDENT_TYPES.map((entry) => entry.value),
      description: "The incident category that best fits what was described.",
    },
    severity: {
      type: "string",
      enum: SEVERITIES.map((entry) => entry.value),
      description: "How serious this is for neighbours who read it.",
    },
    title: {
      type: "string",
      description:
        "Under 60 characters. Factual, no sensationalism, no names.",
    },
    description: {
      type: "string",
      description:
        "Two or three sentences. Anonymised, factual, British English.",
    },
    people_count: {
      anyOf: [{ type: "integer" }, { type: "null" }],
      description:
        "How many individuals were involved, or null if the report does not say. A count only — never any detail that identifies someone.",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description:
        "Up to five lowercase keywords for clustering, e.g. \"white van\", \"evening\", \"back gardens\". No names or registrations.",
    },
    occurred_at: {
      anyOf: [
        { type: "string", format: "date-time" },
        { type: "null" },
      ],
      description:
        "ISO 8601 timestamp of when it happened, or null if the report gives nothing to go on.",
    },
    location_name: {
      type: "string",
      description:
        "Area-level only, e.g. \"near the park on Oak Lane\". Never a house number or a specific driveway.",
    },
    recurring: {
      type: "boolean",
      description:
        "True only if the recent nearby incidents provided show a genuine pattern this report belongs to.",
    },
    pattern_note: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description:
        "One sentence naming the pattern, or null if there is not one. Never mention a specific past report's details beyond what is needed.",
    },
    confidence: {
      type: "number",
      description:
        "0 to 1. How confident you are that this record faithfully represents the report.",
    },
    severity_rationale: {
      type: "string",
      description:
        "One short sentence, under 140 characters, saying why that severity and not one either side of it. Name the thing that decided it — what was described, and the area figures where they are what tipped it. Area-level only: a count and an area, never a landmark, a street, a reference or a past report's details. The reporter reads this.",
    },
  },
} as const;

/** Built from the enum metadata so adding a type to the schema updates the prompt. */
const TYPE_GUIDE = INCIDENT_TYPES.map(
  (entry) => `- ${entry.value}: ${entry.label} — ${entry.description}`,
).join("\n");

const SEVERITY_GUIDE = SEVERITIES.map(
  (entry) => `- ${entry.value}: ${entry.label} — ${entry.description}`,
).join("\n");

const SYSTEM_PROMPT = `You are a community safety incident analyst for VillageWatch, a neighbourhood watch service used by villages in the United Kingdom. A resident has described something they saw. Turn it into a structured, anonymised incident record that their neighbours can safely be shown.

# Anonymisation — these are requirements, not preferences

- NEVER include personal names, house numbers, street addresses, vehicle registration numbers, phone numbers, email addresses or social media handles.
- If the reporter names someone, replace them with "a resident", "a neighbour" or "an individual" — whichever reads naturally.
- Describe people generically: "a group of young individuals", "an adult male", "two people on bicycles". Never by name, and never by a single distinguishing feature that would identify one person in a village of a few hundred.
- \`location_name\` is area-level only: "near the park", "the Oak Lane area", "the lane behind the village hall". Never a house number, never one specific driveway.
- A vehicle may be described by colour and rough type ("a white van"). Never by its registration.
- If an image is attached, faces in it were already blurred on the reporter's device. Use it only to confirm what was described. Do not attempt to identify anyone or anything in it, and do not describe individuals from it.

# Writing

- British English throughout: "antisocial behaviour", "neighbour", "vehicle", "999".
- Factual and calm. This is read by neighbours, some of whom will already be frightened. No sensationalism, no speculation about motive or guilt.
- Report only what the reporter said. Do not add detail they did not give you. If the report is vague, the record should be vague and \`confidence\` should be low.

# Categories

Pick the single \`type\` that fits best:
${TYPE_GUIDE}

Pick the \`severity\` a neighbour reading this needs:
${SEVERITY_GUIDE}

The reporter's own choices are given to you as a hint. Follow them unless the description clearly says otherwise — they were there and you were not. Overriding a MEDIUM to a CRITICAL because the wording is dramatic is exactly the sensationalism to avoid.

# Cross-referencing

You are given the published incidents reported within ${PATTERN_RADIUS_METERS}m in the last ${PATTERN_WINDOW_DAYS} days.

- Set \`recurring\` true only when this report genuinely belongs with them — a similar kind of incident, in the same area, close enough in time to be worth telling neighbours about. Two unrelated things happening near each other is not a pattern.
- \`pattern_note\` is one plain sentence, e.g. "4th report of vehicle crime within 200m this month". If \`recurring\` is false, \`pattern_note\` must be null.
- If no nearby incidents are listed, \`recurring\` is false.

# How busy this area normally is

Where an \`<area_context>\` block is given, it tells you the normal rate of reports within ${PATTERN_RADIUS_METERS}m averaged over ${BASELINE_MONTHS} months, how many there have been in the last ${TREND_RECENT_DAYS} days, and whether this category is rising across the village.

- Use it to judge whether what happened is unusual **here**. Three break-ins in a month on a street that normally has one report a quarter is a different thing from three on a street that has four a month, and the severity a neighbour needs is not the same in both.
- It is a reason to move severity by one step at most, and only where the description leaves room. It is never a reason to overrule what the reporter described: a lost cat on a busy street is still a lost cat.
- **If no \`<area_context>\` block is given, say nothing about how quiet or busy the area is.** The village may be too new to have a baseline. Inventing one, or implying it from the nearby incidents list, is the single worst thing you can do with this section.

# Explaining the severity

\`severity_rationale\` is one sentence, under 140 characters, and the reporter reads it on the screen where they can disagree with you.

- Name what decided it. "Forced entry to an occupied property overnight" is a reason; "this seems serious" is not.
- Where the area figures are what tipped it, say so plainly: "Third report within 200m this month, on a street that averages under one."
- Area-level only, exactly like \`location_name\`: a count and an area. Never a landmark, never a street, never a reference number, never a detail from a specific past report.
- If you followed the reporter's own choice, say that: "Matches the level the reporter chose."`;

export async function structureIncident(
  input: StructureIncidentInput,
): Promise<StructureResult> {
  if (!isAiConfigured) {
    return {
      ok: false,
      code: "not_configured",
      message: "AI structuring is not configured on this deployment.",
    };
  }

  const now = input.now ?? new Date();

  const content: Anthropic.ContentBlockParam[] = [];

  // Image before text: the model reads the picture in the context of the
  // instructions that follow it, which is the documented ordering for vision.
  if (input.image) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: input.image.mediaType,
        data: input.image.data,
      },
    });
  }

  content.push({ type: "text", text: buildUserPrompt(input, now) });

  let message: Anthropic.Message;

  try {
    message = await getAnthropic().messages.create({
      model: AI_MODEL,
      // Generous, because adaptive thinking and the response share this
      // budget and a truncated response is an unparseable one. The actual
      // record is a few hundred tokens.
      max_tokens: 8_000,
      system: SYSTEM_PROMPT,
      // Extraction and rewriting against a fixed schema — this does not need
      // deep reasoning, and a reporter is stood outdoors waiting for it. Low
      // effort with adaptive thinking is the cheap, fast end that still gets
      // the judgement calls (severity, pattern) right.
      thinking: { type: "adaptive" },
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      messages: [{ role: "user", content }],
    });
  } catch (cause) {
    return classifyError(cause);
  }

  if (message.stop_reason === "refusal") {
    // The report described something the safety classifiers declined. The
    // reporter still gets to file it — a coordinator reads it instead.
    return {
      ok: false,
      code: "refusal",
      message: "The AI declined to process this report.",
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

  const parsed = structuredIncidentSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("AI output failed validation", parsed.error.issues);
    return {
      ok: false,
      code: "invalid_output",
      message: "The AI returned a record that did not match the expected shape.",
    };
  }

  return {
    ok: true,
    data: normalise(parsed.data, input, now),
    model: message.model,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}

function buildUserPrompt(input: StructureIncidentInput, now: Date): string {
  const lines = [
    `Village: ${input.villageName}`,
    `Current time: ${now.toISOString()}`,
  ];

  if (input.reportedType) {
    lines.push(
      `Reporter chose category: ${input.reportedType} (${INCIDENT_TYPE_LABELS[input.reportedType]})`,
    );
  }

  if (input.reportedSeverity) {
    lines.push(
      `Reporter chose severity: ${input.reportedSeverity} (${SEVERITY_LABELS[input.reportedSeverity]})`,
    );
  }

  if (input.occurredAt) {
    lines.push(`Reporter says it happened at: ${input.occurredAt.toISOString()}`);
  }

  if (input.locationText) {
    lines.push(`Landmark given by the reporter: ${input.locationText}`);
  }

  lines.push(
    input.image
      ? "An image is attached. Faces in it were blurred on the reporter's device before upload."
      : "No image was attached.",
  );

  const areaContext = formatSeverityContextForPrompt(
    input.severityContext ?? null,
  );

  return [
    "<report>",
    ...lines,
    "",
    "The reporter wrote:",
    input.description,
    "</report>",
    "",
    `<recent_nearby_incidents radius_m="${PATTERN_RADIUS_METERS}" days="${PATTERN_WINDOW_DAYS}">`,
    formatHistoryForPrompt(input.history, now),
    "</recent_nearby_incidents>",
    /**
     * Spread rather than pushed as a possibly-empty string, because the blank
     * lines either side of it are deliberate separators and a blanket
     * `filter(Boolean)` would take those too. The prompt's own instruction is
     * that **no** block means say nothing about how busy the area is, so an
     * empty one has to be absent rather than present and blank.
     */
    ...(areaContext ? ["", areaContext] : []),
    "",
    "Produce the structured incident record.",
  ].join("\n");
}

/**
 * Tidy up the three things the model gets right in substance and wrong in
 * detail often enough to be worth handling here rather than in the prompt.
 */
function normalise(
  data: StructuredIncident,
  input: StructureIncidentInput,
  now: Date,
): StructuredIncident {
  // A pattern note without a pattern reads as a warning. Enforced rather than
  // asked for, because the two fields have to agree and only one of them is
  // rendered.
  const recurring = data.recurring && input.history.length > 0;

  // A timestamp in the future is always wrong, and a wildly old one usually is.
  // Falling back to the reporter's own answer beats showing either.
  const occurredAt = (() => {
    if (!data.occurred_at) return input.occurredAt?.toISOString() ?? null;

    const parsed = Date.parse(data.occurred_at);
    if (Number.isNaN(parsed) || parsed > now.getTime() + 60_000) {
      return input.occurredAt?.toISOString() ?? null;
    }

    return new Date(parsed).toISOString();
  })();

  return {
    ...data,
    recurring,
    pattern_note: recurring ? data.pattern_note : null,
    occurred_at: occurredAt,
    // Deduplicate: the model occasionally emits "van" and "white van" together.
    tags: [...new Set(data.tags)].slice(0, 5),
  };
}

function classifyError(cause: unknown): StructureResult {
  // Most specific first. `APIConnectionTimeoutError` extends
  // `APIConnectionError`, which extends `APIError` — the order matters.
  if (cause instanceof Anthropic.APIConnectionTimeoutError) {
    return {
      ok: false,
      code: "timeout",
      message: "The AI took too long to respond.",
    };
  }

  if (cause instanceof Anthropic.RateLimitError) {
    return {
      ok: false,
      code: "rate_limited",
      message: "The AI is busy right now. Try again in a moment.",
    };
  }

  if (cause instanceof Anthropic.AuthenticationError) {
    console.error("Anthropic rejected the API key", cause);
    return {
      ok: false,
      code: "not_configured",
      message: "AI structuring is not configured correctly on this deployment.",
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
    console.error("Anthropic request failed", cause.status, cause.message);
    return {
      ok: false,
      code: "upstream",
      message: "The AI service returned an error.",
    };
  }

  console.error("Unexpected failure calling Anthropic", cause);
  return {
    ok: false,
    code: "upstream",
    message: "Something went wrong while processing your report.",
  };
}
