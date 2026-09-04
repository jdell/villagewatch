# AI severity proposal — evaluation and plan

**Status:** proposal. Nothing here is built. Written 4 September 2026.

---

## 1. What the flow actually does today

The brief for this work said "the user manually selects severity before
submitting". That is half true and the half that is wrong changes the shape of
the work, so it is worth setting down first.

**Severity is asked for twice, and the second answer silently overwrites the
first.**

- **Step 2 of the wizard** (`src/components/incident-form.tsx`, `step === 1`)
  renders a four-button toggle group over `SEVERITIES` — Low, Medium, High,
  Critical — as `SeverityBadge` pills with `aria-pressed`. The form defaults to
  `LOW`. This is before the reporter has seen anything from the model.
- **The preview step** runs `runAiPass()`, and on success does
  `setValue("severity", incident.severity)` — the model's answer replaces the
  reporter's, with no notice that it changed. The file's own header says so:
  *"Everything else Claude returns — category, severity, title, landmark, tags —
  does write back over the reporter's answer."*
- **`ai-preview.tsx` already has an override.** "Edit" reveals a
  `<select id="preview-severity">`, so the reporter can put it back.

So the AI already proposes a severity and the reporter can already override it.
What is missing is not the mechanism — it is the *reasoning*, the *disclosure*
that a change was made, and two of the four contextual factors.

**Two of the four factors already reach the model.** `detect-patterns.ts` runs
`findNearbyIncidents` at `PATTERN_RADIUS_METERS` (200m) over
`PATTERN_WINDOW_DAYS` (30 days), and `formatHistoryForPrompt` puts up to
`MAX_HISTORY` (12) of them into the prompt. That is *pattern matching* and
*recency clustering*, done, village-scoped and narrowed to
`PUBLIC_INCIDENT_STATUSES` (domain rule 6).

| Factor asked for | State today |
| --- | --- |
| Pattern matching — similar incidents nearby recently | **Built.** `findNearbyIncidents`, in the prompt |
| Recency clustering — several nearby in a short window | **Built.** Same query; `detectPatternHeuristic` is the deterministic backstop |
| Historical baseline — is this area normally quiet? | **Missing.** No query computes a baseline |
| Category trends — rising crime types in the area | **Missing.** Nothing compares this month against previous ones |

## 2. The actual problems

1. **The proposal is invisible.** The badge changes between step 2 and the
   preview and nothing says it changed, why, or that the reporter may disagree.
   A silent overwrite of a resident's own judgement is the part to fix first.
2. **No rationale.** The structured output carries `confidence`, `recurring` and
   `pattern_note`, but nothing that explains the *severity* specifically. A
   number between 0 and 1 is not an explanation.
3. **Asking twice anchors the reporter.** They commit to a level before the
   model has read a word, and are then silently corrected.
4. **Two factors are genuinely absent** — baseline and trend, per the table.

## 3. Proposed design

**Keep the model's proposal where it is** — at the preview step, on the one
screen the reporter is already reading. Do not add a round trip.

**Demote step 2's severity control to optional.** Label it "Your view of how
serious this is (optional)" and default to unset rather than `LOW`. The
reporter's own answer becomes an *input to the prompt* rather than a value the
model silently overwrites, and disagreement between the two becomes information
a coordinator can see rather than a fact nobody records.

**Show the proposal as a proposal.** On the preview:

> **Suggested: High** — *You said Medium.*
> Two vehicle break-ins within 200m in the last nine days, on a street that
> averages under one report a month.
> `[ Accept ]  [ Change ]`

**Record both.** Persist the reporter's original alongside the published value,
so a coordinator reviewing the queue can see where the model and the resident
disagreed. This is the change with the most operational value and the least
cleverness in it.

## 4. Technical changes

### 4.1 New: baseline and trend

**`src/lib/ai/severity-context.ts`** — new module, server only, beside
`detect-patterns.ts` and following its rules (village-scoped from the session,
`PUBLIC_INCIDENT_STATUSES` only).

```ts
export type SeverityContext = {
  /** Reports within PATTERN_RADIUS_METERS over the last 12 months, per 30 days. */
  areaBaselinePerMonth: number;
  /** Same radius, last 30 days. Compared against the baseline. */
  areaLast30Days: number;
  /** This type, village-wide: last 30 days against the preceding 90, as a ratio. */
  categoryTrend: { type: IncidentType; recent: number; priorRate: number } | null;
  /** True where there are too few months of history to claim a baseline. */
  insufficientHistory: boolean;
};
```

Two queries, both already indexed (`@@index([villageId, status, occurredAt])`
and `@@index([lat, lng])`); the radius filter is the same JavaScript
`distanceMeters` pass `findNearbyIncidents` already does, so no PostGIS is
needed and `$queryRaw` is not required.

**`insufficientHistory` is the load-bearing field.** A village three weeks old
has no baseline, and "this area is normally quiet" computed over eleven reports
is a claim the data does not support. When it is true the factor is omitted from
the prompt entirely rather than sent as a small number — the same rule
`police-data.ts` follows for a month nobody fetched.

### 4.2 Prompt and schema

**`src/lib/ai/structure-incident.ts`**

- `StructureIncidentInput` gains `severityContext` and `reporterSeverity`.
- The system prompt gains a short block: the baseline, the 30-day count, the
  category trend, and the reporter's own view where they gave one.
- `INCIDENT_SCHEMA` gains **`severity_rationale`**: a string, capped at ~140
  characters, required. One sentence naming the factor that decided it.
- `structuredIncidentSchema` in `validations.ts` gains the same field with a
  `.max()`, since the schema is enforced twice over.

**The rationale is public-safe text and has to be treated as such.** It is
generated from nearby reports, so it must name a count and an area and never a
landmark, a reference or a street — the same constraint the existing
`pattern_note` carries. Add it to the system prompt's forbidden list explicitly.

### 4.3 Schema and persistence

One migration, two nullable columns on `Incident`:

```prisma
/// The severity the reporter chose before the AI pass, where they chose one.
reporterSeverity  Severity? @map("reporter_severity")
/// One sentence saying why the model proposed the severity it did. Public-safe.
severityRationale String?   @map("severity_rationale")
```

Nullable, no default, no backfill — every existing row predates the field and
null means "not recorded", which is true.

**`prisma/sql/rls_policies.sql` must be re-run**, because the `incidents` SELECT
grant is enumerated per column: a new column is invisible through PostgREST
until it is named there. `postgis.sql` does not need re-running — no geography
column. Neither column goes into `PUBLIC_INCIDENT_SELECT` by default;
`severityRationale` is safe to publish and `reporterSeverity` is a resident's
own judgement about their neighbours, so it belongs on the moderation queue and
nowhere else.

### 4.4 UI

| File | Change |
| --- | --- |
| `src/components/incident-form.tsx` | Step 2 severity becomes optional, default unset; send `reporterSeverity` to the AI route; stop the silent `setValue` — route it through the accept/change control below |
| `src/components/ai-preview.tsx` | Render the suggestion, the rationale, and "you said X" when the two differ. The existing Edit `<select>` is the override and needs no change |
| `src/app/api/incidents/process/route.ts` | Pass `reporterSeverity` through; call `severity-context.ts` alongside `findNearbyIncidents` |
| `src/app/api/incidents/route.ts` | Persist the two new columns |
| `src/components/dashboard/moderation-card.tsx` | Show the disagreement where there is one — this is the payoff |

### 4.5 Failure behaviour — unchanged, and that is the point

Every failure of the AI pass is already a 200 with `ok: false`, and the wizard
falls back to the reporter's own wording. That contract must hold: with no key,
a rate limit or a timeout, **the reporter's own severity is what files**, which
is exactly why step 2's control stays on screen rather than being removed. If
they gave none and the model could not answer, the existing `LOW` default
applies and the queue is the backstop — being rate limited must never block
filing a report.

`severity-context.ts` gets the same treatment: it returns nulls on a failed
query rather than throwing, and the prompt omits the block.

## 5. Tests

`tests/severity-context.test.ts`, Prisma mocked at its boundary, in the shape
`police-data.test.ts` uses:

- A village with three weeks of history reports `insufficientHistory: true` and
  no baseline — the assertion that stops the feature claiming an area is quiet
  on the strength of nothing.
- Reads narrow to `PUBLIC_INCIDENT_STATUSES` and to the village.
- A failed query degrades to nulls rather than throwing.
- `structure-incident.test.ts` gains a case: `severity_rationale` over the cap
  is `invalid_output`, not a truncated sentence on screen.

## 6. What this is not

- **Not a change to who decides.** The reporter accepts or overrides, and a
  coordinator still reviews unless the village has auto-approve on. Severity
  drives the push audience (`notifyMinSeverity`) and the WhatsApp Channel floor
  (`whatsappMinSeverity`), so a model that could raise it unchallenged would be
  deciding who gets woken up. It proposes; it does not set.
- **Not a second Claude call.** It rides on the existing one. A separate call
  would double the cost of the most-used AI path in the app and spend a
  reporter's `aiProcess` quota twice per report.
- **Not `PatternAlert`.** That is the weekly digest's, written by a cron, and
  unrelated.

## 7. Open questions

1. **Does the rationale reach the published report, or only the wizard?**
   Publishing it means a public sentence about how many reports an area has had.
   Recommendation: wizard and moderation queue only, at least to begin with.
2. **Baseline window.** Twelve months is proposed; a village younger than that
   reports `insufficientHistory`. Six would cover more villages and describe
   each one worse.
3. **Does a disagreement do anything?** The proposal only records it. Making it
   route a report differently — into the queue when the model and the reporter
   disagree, say — is a separate decision with its own reasoning, and probably
   the right follow-up once there is data on how often it happens.
