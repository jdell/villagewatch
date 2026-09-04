import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StructureIncidentInput } from "@/lib/ai/structure-incident";

/**
 * The AI pass is the one call in the report wizard that can fail in a dozen
 * ordinary ways — no key, a rate limit, a timeout, a refusal — and the contract
 * that matters is that **none of them throws and none of them blocks filing a
 * report**. Every failure is a typed `{ ok: false, code }` the wizard turns into
 * "we kept your own wording", so each code is asserted here rather than trusted
 * to a comment.
 *
 * Anthropic is mocked at `@/lib/ai/client`, which is the module holding the key.
 * Nothing here makes a network call or spends credit.
 */

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  isAiConfigured: true,
}));

vi.mock("@/lib/ai/client", () => ({
  get isAiConfigured() {
    return mocks.isAiConfigured;
  },
  AI_MODEL: "claude-sonnet-5",
  getAnthropic: () => ({ messages: { create: mocks.create } }),
}));

// `detect-patterns.ts` reaches the database; only its formatter is used here.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { structureIncident } = await import("@/lib/ai/structure-incident");

const NOW = new Date("2026-07-27T12:00:00.000Z");

/** A well-formed record of the shape `output_config.format` constrains. */
function modelRecord(overrides: Record<string, unknown> = {}) {
  return {
    type: "BURGLARY",
    severity: "HIGH",
    title: "Shed broken into overnight",
    description:
      "A garden shed was forced open overnight and tools were taken. A neighbour reported it the following morning.",
    people_count: 1,
    tags: ["shed", "overnight"],
    occurred_at: "2026-07-27T02:00:00.000Z",
    location_name: "the lane behind the village hall",
    recurring: false,
    pattern_note: null,
    confidence: 0.8,
    severity_rationale: "Forced entry to an occupied property overnight.",
    ...overrides,
  };
}

/** What the SDK hands back: text blocks carrying the JSON, plus usage. */
function modelResponse(
  record: unknown,
  overrides: Record<string, unknown> = {},
) {
  return {
    model: "claude-sonnet-5",
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(record) }],
    usage: { input_tokens: 900, output_tokens: 210 },
    ...overrides,
  };
}

function input(overrides: Partial<StructureIncidentInput> = {}): StructureIncidentInput {
  return {
    description:
      "Someone forced the lock on my shed last night and took the mower.",
    villageName: "Barnack",
    history: [],
    now: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.isAiConfigured = true;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("a successful pass", () => {
  it("returns the structured record, the model and the usage", async () => {
    mocks.create.mockResolvedValue(modelResponse(modelRecord()));

    const result = await structureIncident(input());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.type).toBe("BURGLARY");
    expect(result.data.severity).toBe("HIGH");
    expect(result.data.title).toBe("Shed broken into overnight");
    expect(result.data.confidence).toBeCloseTo(0.8);
    expect(result.model).toBe("claude-sonnet-5");
    expect(result.usage).toEqual({ inputTokens: 900, outputTokens: 210 });
  });

  it("puts the area context in the prompt when there is a baseline", async () => {
    mocks.create.mockResolvedValue(modelResponse(modelRecord()));

    await structureIncident(
      input({
        severityContext: {
          areaBaselinePerMonth: 0.4,
          areaLast30Days: 3,
          categoryTrend: { type: "VEHICLE_CRIME", recent: 3, priorRate: 0.7 },
          insufficientHistory: false,
        },
      }),
    );

    const body = JSON.stringify(mocks.create.mock.calls[0][0].messages);

    expect(body).toContain("area_context");
    expect(body).toContain("0.4");
  });

  it("omits the area block entirely for a village with no baseline", async () => {
    mocks.create.mockResolvedValue(modelResponse(modelRecord()));

    await structureIncident(
      input({
        severityContext: {
          areaBaselinePerMonth: 0,
          areaLast30Days: 0,
          categoryTrend: null,
          insufficientHistory: true,
        },
      }),
    );

    const request = mocks.create.mock.calls[0][0];

    /**
     * Absent, not present-and-empty. The system prompt tells the model to say
     * nothing about how quiet an area is when no block is given, and a block
     * of zeroes would read as "nothing has ever happened here" — which is the
     * opposite of "we do not know yet".
     */
    expect(JSON.stringify(request.messages)).not.toContain("area_context");
    expect(request.system).toMatch(/If no .*area_context.* block is given/);
  });

  it("sends the reporter's words under a system prompt that forbids names", async () => {
    mocks.create.mockResolvedValue(modelResponse(modelRecord()));

    await structureIncident(
      input({
        description: "Dave Wilkins at 14 Oak Lane drove off in DA57 KLM.",
        reportedType: "VEHICLE_CRIME",
        locationText: "Oak Lane",
      }),
    );

    const request = mocks.create.mock.calls[0][0];

    // Anonymisation is the model's job, and this is the instruction it is
    // given. Asserted because the privacy notice makes a claim about it.
    expect(request.system).toMatch(/NEVER include personal names/);
    expect(request.system).toMatch(/registration numbers/);
    // The verbatim words do go to Anthropic — /privacy §6 says so — and they go
    // in the user turn, never in the record that comes back.
    expect(JSON.stringify(request.messages)).toContain("Dave Wilkins");
    expect(request.output_config.format.type).toBe("json_schema");
  });

  it("keeps no field a name could come back in", async () => {
    // The rewrite is what gets published, so what is asserted is that the
    // returned record is the model's anonymised text and carries none of the
    // reporter's identifying detail through.
    mocks.create.mockResolvedValue(
      modelResponse(
        modelRecord({
          description:
            "A resident reported that a vehicle was driven away from the Oak Lane area.",
          location_name: "the Oak Lane area",
          tags: ["vehicle", "evening"],
        }),
      ),
    );

    const result = await structureIncident(
      input({ description: "Dave Wilkins at 14 Oak Lane drove off in DA57 KLM." }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const published = JSON.stringify(result.data);
    expect(published).not.toContain("Dave Wilkins");
    expect(published).not.toContain("DA57 KLM");
    expect(published).not.toContain("14 Oak Lane");
    // And there is no field on the result that could carry the raw text back.
    expect(Object.keys(result.data)).not.toContain("rawDescription");
  });
});

describe("normalising what the model got right in substance and wrong in detail", () => {
  it("drops a pattern claim when there is no history behind it", async () => {
    mocks.create.mockResolvedValue(
      modelResponse(
        modelRecord({
          recurring: true,
          pattern_note: "4th report of vehicle crime within 200m this month",
        }),
      ),
    );

    const result = await structureIncident(input({ history: [] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // A pattern note without a pattern reads as a warning to a resident.
    expect(result.data.recurring).toBe(false);
    expect(result.data.pattern_note).toBeNull();
  });

  it("falls back to the reporter's timestamp when the model invents a future one", async () => {
    const reported = new Date("2026-07-26T21:30:00.000Z");
    mocks.create.mockResolvedValue(
      modelResponse(modelRecord({ occurred_at: "2026-08-04T09:00:00.000Z" })),
    );

    const result = await structureIncident(input({ occurredAt: reported }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.occurred_at).toBe(reported.toISOString());
  });

  it("deduplicates the tags", async () => {
    mocks.create.mockResolvedValue(
      modelResponse(modelRecord({ tags: ["van", "White Van", "white van", "van"] })),
    );

    const result = await structureIncident(input());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Lowercased by the tag schema, then deduplicated here.
    expect(result.data.tags).toEqual(["van", "white van"]);
  });
});

describe("when Claude is unavailable", () => {
  it("reports not_configured rather than throwing on a missing key", async () => {
    mocks.isAiConfigured = false;

    const result = await structureIncident(input());

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.code).toBe("not_configured");
    expect(result.message).toBeTruthy();
    // The wizard falls back to the reporter's own wording; nothing was called.
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("classifies a timeout, a rate limit and a connection failure", async () => {
    mocks.create.mockRejectedValueOnce(
      new Anthropic.APIConnectionTimeoutError({ message: "timed out" }),
    );
    expect(await structureIncident(input())).toMatchObject({
      ok: false,
      code: "timeout",
    });

    mocks.create.mockRejectedValueOnce(
      new Anthropic.RateLimitError(429, undefined, "slow down", new Headers()),
    );
    expect(await structureIncident(input())).toMatchObject({
      ok: false,
      code: "rate_limited",
    });

    mocks.create.mockRejectedValueOnce(
      new Anthropic.APIConnectionError({ message: "socket hang up" }),
    );
    expect(await structureIncident(input())).toMatchObject({
      ok: false,
      code: "network",
    });
  });

  it("treats a rejected API key as a deployment that is not configured", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.create.mockRejectedValue(
      new Anthropic.AuthenticationError(401, undefined, "bad key", new Headers()),
    );

    expect(await structureIncident(input())).toMatchObject({
      ok: false,
      code: "not_configured",
    });

    logged.mockRestore();
  });

  it("swallows an error that is not the SDK's at all", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.create.mockRejectedValue(new TypeError("undefined is not a function"));

    // Never throws — the caller is a route the reporter is waiting on.
    expect(await structureIncident(input())).toMatchObject({
      ok: false,
      code: "upstream",
    });

    logged.mockRestore();
  });
});

describe("when the response is unusable", () => {
  it("reports a refusal without losing the report", async () => {
    mocks.create.mockResolvedValue(
      modelResponse(modelRecord(), { stop_reason: "refusal", content: [] }),
    );

    expect(await structureIncident(input())).toMatchObject({
      ok: false,
      code: "refusal",
    });
  });

  it("reports a truncated response", async () => {
    mocks.create.mockResolvedValue(
      modelResponse(modelRecord(), { stop_reason: "max_tokens" }),
    );

    expect(await structureIncident(input())).toMatchObject({
      ok: false,
      code: "truncated",
    });
  });

  it("reports invalid JSON", async () => {
    mocks.create.mockResolvedValue(
      modelResponse(null, { content: [{ type: "text", text: "{ not json" }] }),
    );

    expect(await structureIncident(input())).toMatchObject({
      ok: false,
      code: "invalid_output",
    });
  });

  it("rejects a severity rationale over the cap rather than truncating it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    // The rationale is rendered inline under a badge on the preview. Over the
    // cap the whole response is invalid and the wizard falls back to the
    // reporter's own wording — a truncated half-sentence explaining a severity
    // is worse than no sentence, because the reporter reads it as the reason.
    mocks.create.mockResolvedValue(
      modelResponse(modelRecord({ severity_rationale: "x".repeat(141) })),
    );

    expect(await structureIncident(input())).toMatchObject({
      ok: false,
      code: "invalid_output",
    });

    logged.mockRestore();
  });

  it("rejects a record with no severity rationale at all", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    mocks.create.mockResolvedValue(
      modelResponse(modelRecord({ severity_rationale: "  " })),
    );

    expect(await structureIncident(input())).toMatchObject({
      ok: false,
      code: "invalid_output",
    });

    logged.mockRestore();
  });

  it("rejects a record that is well-formed and still wrong", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // Structured outputs guarantee the shape, not the values: this satisfies
    // the JSON schema and fails `structuredIncidentSchema`.
    mocks.create.mockResolvedValue(
      modelResponse(
        modelRecord({ confidence: 4, description: "x".repeat(4_001) }),
      ),
    );

    expect(await structureIncident(input())).toMatchObject({
      ok: false,
      code: "invalid_output",
    });

    logged.mockRestore();
  });
});
