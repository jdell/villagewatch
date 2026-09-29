import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { AI_MODEL, getAnthropic, isAiConfigured } from "@/lib/ai/client";
import {
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
  type VillageMode,
} from "@/lib/constants";
import type { MpInfo } from "@/lib/parliament";

/**
 * Draft a formal letter to a Member of Parliament from a village's safety data.
 *
 * **Server only.** Same contract as `report-narrative.ts`: every failure is a
 * returned value, never a throw.
 *
 * ## How it differs from the report narrative
 *
 * The narrative summarises for a coordinator. This letter makes a case to an MP
 * that something is happening and resources or attention are needed. It
 * emphasises:
 *
 * - **Concrete patterns with specifics** — "two individuals observed at the
 *   Co-op on Mill Road on consecutive Fridays between 2–4pm" rather than
 *   "several shoplifting reports"
 * - **Named locations** — supermarket names, street names, landmarks
 * - **Temporal patterns** — day of week, time windows, recurring schedules
 * - **Trends** — whether things are getting worse, and by how much
 * - **What the village is asking for** — more patrols, CCTV, a meeting
 *
 * Everything in the prompt comes from published, anonymised reports — no
 * `rawDescription`, no coordinates (domain rules 1 and 2).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type LetterFailureCode =
  | "not_configured"
  | "no_incidents"
  | "rate_limited"
  | "timeout"
  | "network"
  | "refusal"
  | "upstream";

export type LetterResult =
  | { ok: true; letter: string; model: string }
  | { ok: false; code: LetterFailureCode; message: string };

export type LetterIncident = {
  reference: string;
  type: IncidentType;
  severity: Severity;
  title: string;
  description: string;
  locationText: string | null;
  occurredAt: Date;
  recurring: boolean;
  patternNote: string | null;
};

export type LetterInput = {
  villageName: string;
  constituency: string;
  from: Date;
  to: Date;
  total: number;
  previousTotal: number;
  incidents: readonly LetterIncident[];
  mp: MpInfo;
  mode: VillageMode;
  coordinatorName: string;
  byType: readonly { type: string; count: number }[];
  bySeverity: readonly { severity: string; count: number }[];
  hotspots: readonly { location: string; count: number }[];
};

// ── Public API ───────────────────────────────────────────────────────────────

export async function generateMpLetter(
  input: LetterInput,
): Promise<LetterResult> {
  if (!isAiConfigured) {
    return {
      ok: false,
      code: "not_configured",
      message: "AI is not configured. The letter cannot be generated.",
    };
  }

  if (input.incidents.length === 0) {
    return {
      ok: false,
      code: "no_incidents",
      message: "No reports were published in this period.",
    };
  }

  const anthropic = getAnthropic();
  const systemPrompt = buildSystemPrompt(input);
  const userPrompt = buildUserPrompt(input);

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      thinking: { type: "disabled" as const },
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return {
        ok: false,
        code: "upstream",
        message: "No text in the AI response.",
      };
    }

    return {
      ok: true,
      letter: textBlock.text.trim(),
      model: response.model,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("rate_limit")) {
        return {
          ok: false,
          code: "rate_limited",
          message: "Rate limited by the AI provider. Try again in a minute.",
        };
      }
      if (
        error.name === "TimeoutError" ||
        error.message.includes("timed out")
      ) {
        return { ok: false, code: "timeout", message: "The AI call timed out." };
      }
    }
    console.error("MP letter generation failed:", error);
    return {
      ok: false,
      code: "upstream",
      message: "Could not generate the letter. Try again.",
    };
  }
}

// ── Prompt construction ──────────────────────────────────────────────────────

function buildSystemPrompt(input: LetterInput): string {
  const role =
    input.mode === "council"
      ? "a community safety coordinator writing on behalf of their parish council"
      : "a volunteer community safety coordinator";

  return `You are a professional letter writer helping ${role} in ${input.villageName} draft a formal letter to their Member of Parliament.

The letter is STRATEGIC, not operational. The MP needs to understand the big picture — what is happening, whether it is getting worse, and what resources or attention are needed. The operational detail (specific times, specific people, specific days of the week) belongs in the police report, not here.

The letter must:
- Be formal but accessible — written for a constituency MP, not a civil servant
- Open by introducing the village, the community safety scheme, and the coordinator's role
- Present the SCALE and TREND of the problem:
  * Total reports in the period and how that compares to the previous period
  * Which categories of incident are most common (e.g. "shoplifting accounts for X of Y reports")
  * Which areas of the village are most affected (by area name, not street address)
  * Whether the situation is improving or deteriorating
- Explain the IMPACT on the community — residents feeling unsafe, local businesses affected, quality of life
- State clearly what the village is asking the MP to help with:
  * More visible police presence or patrols
  * Review of local policing resources
  * CCTV or lighting improvements
  * A meeting with the local policing team
  * Raising the issue in Parliament or with the Home Office
- Close formally with an invitation to visit the village or attend a parish/community meeting
- Be between 400–700 words
- Use British English throughout

The letter must NOT:
- Include specific times of day, days of the week, or operational patterns (that detail goes to the police, not the MP)
- Include any names of individuals (reporters or suspects)
- Include exact coordinates, precise addresses or detailed descriptions of incidents
- Make accusations — stick to "reports indicate" and "residents have raised concerns about"
- Invent details not present in the data
- Include the village's internal reference numbers

Format the letter as plain text with proper paragraphs. Include placeholders for:
- [YOUR NAME] for the coordinator's signature
- [YOUR ADDRESS] for the return address
- [DATE] for the date
- Today's date should be used where the period is mentioned.`;
}

function buildUserPrompt(input: LetterInput): string {
  const from = input.from.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const to = input.to.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const trendDirection =
    input.total > input.previousTotal
      ? `an INCREASE from ${input.previousTotal} to ${input.total}`
      : input.total < input.previousTotal
        ? `a decrease from ${input.previousTotal} to ${input.total}`
        : `unchanged at ${input.total}`;

  const typeBreakdown = input.byType
    .filter((t) => t.count > 0)
    .map(
      (t) =>
        `- ${INCIDENT_TYPE_LABELS[t.type as IncidentType] ?? t.type}: ${t.count}`,
    )
    .join("\n");

  const severityBreakdown = input.bySeverity
    .filter((s) => s.count > 0)
    .map(
      (s) =>
        `- ${SEVERITY_LABELS[s.severity as Severity] ?? s.severity}: ${s.count}`,
    )
    .join("\n");

  const hotspotList = input.hotspots
    .slice(0, 10)
    .map((h) => `- ${h.location}: ${h.count} reports`)
    .join("\n");

  // For the MP letter, we only need pattern notes (not individual descriptions)
  const recurringPatterns = input.incidents
    .filter((inc) => inc.recurring && inc.patternNote)
    .map((inc) => `- ${INCIDENT_TYPE_LABELS[inc.type] ?? inc.type}: ${inc.patternNote}`)
    .filter((line, i, arr) => arr.indexOf(line) === i) // dedupe
    .join("\n");

  return `Draft a letter to ${input.mp.fullTitle}, MP for ${input.constituency}.

RECIPIENT:
${input.mp.fullTitle}
${input.mp.officeAddress ?? "House of Commons, London SW1A 0AA"}

VILLAGE: ${input.villageName}
PERIOD: ${from} to ${to}
TOTAL REPORTS: ${input.total}
TREND: ${trendDirection} compared to the previous equivalent period

BREAKDOWN BY TYPE:
${typeBreakdown || "No data"}

BREAKDOWN BY SEVERITY:
${severityBreakdown || "No data"}

TOP AFFECTED AREAS:
${hotspotList || "No hotspot data"}

${recurringPatterns ? `DETECTED PATTERNS:\n${recurringPatterns}` : ""}

Please draft the letter now. Focus on the strategic picture — the scale of the problem, the trend, which areas are worst affected, and what resources or attention the village needs. Do NOT include operational details like specific times or days — those go to the police, not the MP.`;
}
