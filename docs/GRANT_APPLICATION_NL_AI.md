# VillageWatch — National Lottery Community Fund AI Programme Application

> **Status: draft, not submitted.** Every claim below has been checked against
> the codebase — see §Evidence at the end for what is verified, what is built
> but unexercised, and which external figures still need a citation.
> Applications are expected to open autumn 2026; see `docs/FUNDING.md`.

## Project title
VillageWatch: AI-Powered Community Safety Intelligence for Rural Villages

## Applicant
Yakasista Ltd
Contact: Joel Castro Reynoso, info@yakasista.com
Location: Histon, Cambridgeshire

## Summary (150 words)
VillageWatch replaces the WhatsApp groups village communities use for safety
reporting with a platform that protects privacy while keeping residents
informed. It began with a 200-person WhatsApp group in Histon, Cambridgeshire,
where incident reports were buried in chat noise and photos of children were
shared without blurring. VillageWatch uses on-device AI to obscure faces before
a photo is uploaded, Claude to structure each report into an anonymised incident
card, and clustering to surface recurring concerns. It has a live incident map,
push notifications, coordinator moderation and one-click police reports. It runs
in two models — a neighbourhood group can start alone, or a parish council can
take a village on — so a village with no council is not shut out. Live at
villagewatch.app, seeded with 270 Cambridgeshire parishes from ONS open data.
VillageWatch shows how community-led AI can solve an everyday problem: keeping
villages safe while respecting everyone's privacy.

## The problem (300 words)
Across England, thousands of villages use WhatsApp groups for community safety reporting. In Histon alone, over 200 residents joined a Village Watch WhatsApp group after incidents of antisocial behaviour involving children. The intention was good, but the execution creates serious problems:

**Privacy failures:** Every member's phone number is visible to all 200+ people. Photos and videos are shared without face blurring — including footage of minors. Under UK GDPR and the Children's Code, this creates real legal liability for the group administrators, who are often unpaid volunteers with no data protection training.

**Information loss:** Important incident reports are buried within minutes by casual conversation. There is no way to search past incidents, identify patterns ("this is the 4th incident at the park this month"), or generate structured reports for the police.

**No accountability:** Anyone can post anything to 200 people instantly. Speculation, naming individuals, and defamatory statements are common. The group rules say "think before posting" but there is no mechanism to enforce this.

**Police engagement gap:** When coordinators meet their PCSO, they scroll through hundreds of WhatsApp messages and screenshot relevant ones. There is no structured data, no map, no trend analysis — just anecdotes.

**No route to doing it properly:** the compliance tooling that exists assumes a
parish council with a clerk. Most watch groups have neither. Asking six
neighbours to produce a council's impact assessment is asking them not to start,
so they carry on in WhatsApp.

These are not problems unique to Histon. The Neighbourhood Watch Network reports
that it reaches around 1.4 million households, and WhatsApp is the dominant
communication channel for community safety across the UK. The problems are
structural: WhatsApp was designed for social messaging, not community safety
reporting.

## Our solution (500 words)
VillageWatch is a web application — no app store download — providing AI-powered community safety reporting designed for villages. It addresses every problem above:

**Privacy by design:** When a resident uploads a photo or video, AI face detection runs entirely on their device using MediaPipe WASM. Faces are obscured before the image ever leaves their phone — the original is never transmitted or stored, and there is deliberately no server-side fallback, so an original with a face in it cannot be uploaded even if the on-device pass fails. How strongly faces are covered is set per village by its coordinator.

**AI-powered structuring:** When a resident types "some kids were throwing stones at cars near the park around 3pm," Claude turns it into a structured incident card: type, severity, location, time, and an anonymised description that strips personal names. The reporter reads the result and accepts it before anything is saved — they are the human in the loop, and we take the position that Article 22 of the UK GDPR does not engage, because the model makes no decision about anybody.

**Pattern detection:** Each new report is cross-referenced against published incidents from the past 30 days within 200 metres. The clustering is ordinary deterministic code — a radius query and a count — so it works whether or not the AI is reachable, and it produces the note the reporter sees: "4th incident here this month." Claude then gets the same history and can add what counting cannot.

**Live map:** Published incidents appear as colour-coded pins on a Leaflet map, with a heatmap overlay weighted by severity and recency. Locations are shifted by up to 100 metres before storage, so the map shows a neighbourhood rather than a doorstep.

**Coordinator dashboard:** Coordinators moderate reports before publication, set auto-approve for trusted communities, receive an automatic weekly digest, and export CSV for police meetings.

**One-click police sharing:** Coordinators tap "Share with police" on any *published* incident, or produce a period report — statistics, hotspots, an incident log and an optional AI-written analysis — on screen, on the clipboard or as a PDF. Residents have no such button: publication is the decision that says a report is fit to leave the village.

**Compliance gate, in two sizes:** a village accepts no report until its coordinator has accepted the documents its model calls for, rendered in full, each acceptance written to an append-only audit trail. A **community** village — the default — accepts one agreement and its coordinator is the data controller. A **council** village accepts three, because a council holds duties a volunteer does not. Governance a group of neighbours can actually finish.

**Multi-village from day one:** seeded with 270 Cambridgeshire parishes from ONS open data; the same pipeline covers all 10,670 in England. Villages activate one at a time, each with its own join code, QR invite sheet and settings.

Live at villagewatch.app, on Next.js 16, Supabase (London) and Leaflet. Resident data is stored in the UK; three processors sit outside it. Infrastructure costs about £52 a month.

## Where data goes
Stated separately because "all data held in the UK" would be too strong, and a
funder is entitled to the accurate version.

- **Stored in the UK.** The database, file storage and authentication are
  Supabase in `eu-west-2` (London). Hosting is Vercel's `lhr1` (London) region.
  That is where every report, photograph and account actually lives.
- **Three processors are outside the UK**, and each receives a narrow slice:
  **Anthropic** (United States) receives report text for the anonymisation
  rewrite and nothing is stored there; **OneSignal** (United States) delivers
  push notifications; **Slack** (Salesforce, United States) carries our own
  internal staff notifications. Each transfer relies on Standard Contractual
  Clauses with the UK International Data Transfer Addendum.
- **Two of those mechanisms are marked for verification before launch**, not
  assumed — DPIA actions A9 (Anthropic) and A11 (OneSignal). Slack is a
  disclosure covered by the privacy notice rather than a processor under our own
  written agreement, and DPIA action A3 is to close that.

## How this relates to AI and communities
VillageWatch is a working example of community-led AI that:
- Uses AI to protect privacy (face blurring) rather than erode it
- Puts the human in the loop (reporter reads and accepts the AI output before publishing)
- Makes AI-generated intelligence accessible to non-technical users (coordinators, parish councillors, PCSOs)
- Demonstrates responsible AI: DPIA drafted and awaiting sign-off, privacy by design, a compliance gate that blocks rather than reminds, append-only audit trail
- Meets volunteers where they are: the community model exists because the council-shaped compliance pack is impossible for a group with no council, and a governance regime nobody can complete is a governance regime nobody uses
- Degrades honestly: when the AI is unavailable, the report is filed in the resident's own words, and the weekly digest and the period report fall back to figures counted from the database and say on the document which of the two a reader is holding

## Budget

**Infrastructure — £624 a year, ≈ £52 a month**

| Item | Annual cost |
|------|------------|
| Supabase Pro (database, storage, auth — London) | £240 |
| Vercel Pro (hosting, `lhr1`) | £192 |
| Anthropic API — all three call sites (see below) | £180 |
| OneSignal (push notifications) | Free tier |
| Domain (villagewatch.app) | £12 |
| **Infrastructure subtotal** | **£624** |

**Everything else**

| Item | Annual cost |
|------|------------|
| Developer time (maintenance, 4hrs/month) | £2,400 |
| Community engagement (materials, events) | £500 |
| **Total year 1, including developer time** | **£3,524** |

The two figures answer different questions and have been confused before: **the
running cost of the service is £52 a month**; **the cost of the first year,
including paying somebody to look after it, is £3,524**. £3,524 ÷ 12 is £294 and
is not a hosting bill.

**The three Anthropic call sites the £180 covers**, because "AI structuring" named
only the first and the other two are the larger ones:

| Call site | When it runs | Prompt size | Frequency at pilot scale |
|---|---|---|---|
| `structure-incident.ts` — the per-report rewrite | A resident files a report | One report | ~200/month across all villages, rate limited to 5/hour per resident |
| `weekly-digest.ts` — the Sunday digest | Cron, once a week per active village | Up to 60 published incidents | 52 × the number of active villages |
| `report-narrative.ts` — the period analysis | A coordinator presses "Write the analysis", or downloads a PDF with `?analysis=ai` | A whole period of a village's reports — the largest single prompt in the product | Rate limited to 12/hour per coordinator; unmeasured in practice |

The third is the one that would move the number if villages produce monthly
reports at scale, and it is deliberately opt-in for that reason: a PDF download
uses a counted summary unless the coordinator has already asked for an AI one on
screen. **£180 is a projection, not an observed bill** — no cron has fired and
no coordinator has generated a report against a real village.

## Impact measurement
- Number of villages activated
- Number of incidents reported (vs WhatsApp baseline)
- Number of villages completing the compliance gate, split by model — the
  community/council split is itself a finding about who this reaches
- Coordinator satisfaction survey (quarterly)
- Police feedback on report quality
- Data subject requests received (GDPR compliance metric)
- Reports carrying a pattern note — the per-report clustering that runs on every
  submission, which is what a resident actually sees

The last one is deliberately not "pattern alerts generated". `PatternAlert` rows
are created by the weekly digest, **nothing in the app renders them yet**, and
the cron has never fired — so it is not a metric anybody could report against
today. The per-report pattern note is the measurable version of the same thing.

## Timeline
- Jul 2026: initial seven-day build, deployed (complete)
- Jul–Aug 2026: developed since — the compliance gate, the two models, PDF
  reports, QR invites, the heatmap, per-village references, per-village privacy
  levels and the period controls all landed after the first week
- Sep 2026: first village activated and piloted in Histon (5–10 residents)
- Oct 2026: expand to neighbouring villages (Impington, Cottenham)
- Jan 2027: 10 villages across Cambridgeshire
- Apr 2027: 25 villages, first police force partnership conversation
- Jul 2027: open to all Cambridgeshire parishes

## What has shipped since the first week
Named because "built over seven days" undersold the work and misdescribed it —
the first seven days produced the scaffold and the core reporting flow, and the
month after it produced most of what a council would ask about.

- **Two compliance models** — `Village.mode`, the community model and its single
  agreement, and the one-way upgrade to the council model that does **not** take
  a running village offline while the council reads three documents.
- **Server-rendered PDF reports** — the same community safety report as a file
  that comes out identical whoever downloads it, rather than a browser print
  dialogue whose page size, margins and headers are the recipient's own settings.
- **QR code village invites** — a printable invite sheet and a join link that
  carries the code, landing on a public page that says which village it is before
  anybody fills in a form.
- **Map heatmap** — severity × recency density over the same date-filtered set
  the pins read, on the map and as a thumbnail on the dashboard.
- **Google sign-in** — alongside email and password, with password recovery.
- **WhatsApp and Facebook sharing** — a coordinator copies a published report's
  alert and posts it themselves. Nothing posts automatically: neither platform
  offers an app a supported way to write on somebody's behalf, and the relay that
  was going to do it was removed rather than shipped against WhatsApp's terms.
- **Per-village incident references** — `VW-HIS-2026-0003`, numbered by the
  village rather than by how busy the whole platform has been.
- **Per-village privacy levels** — four settings for how strongly faces are
  covered, with the mosaic that destroys the identity fixed at every level.
- **Period controls** — one date-range resolver behind the map, the incident
  list, the dashboard and the reports screen.
- **A test suite** — Vitest, 22 files, 360 tests, run by CI on every push, needing
  no database and no secret.

---

## Evidence

Checked against the repository on 21 August 2026. A funder can ask for any of
this, so the distinction between "built" and "proven in service" is kept here
rather than blurred in the prose above.

**Verified against the running service or the code**

| Claim | Evidence |
|-------|----------|
| Live at villagewatch.app | HTTP 200 from Vercel `lhr1`, serving the landing page |
| On-device face blurring, no server-side fallback | `src/lib/media/face-blur.ts`; `POST /api/incidents/media` accepts only the redacted canvas output |
| Locations shifted before storage | `fuzzCoordinates`, `LOCATION_FUZZ_METERS` (100m) |
| Reporter reads the AI rewrite before saving | The wizard's preview step; the AI route writes nothing |
| Raw wording never public, and every read audited | `PUBLIC_INCIDENT_SELECT`, `readRawDescription` |
| Compliance gate blocks reporting until the model's documents are accepted | `src/lib/compliance.ts`; both report routes 403 before parsing a body. **All twelve migrations are applied**, so the gate is live on the deployed database |
| Two models, one document or three | `documentsForMode`; `tests/compliance.test.ts` and `tests/compliance-documents.test.ts` assert both sets, and that **both** agreements carry all eight Article 28(3) obligations |
| Pattern clustering is deterministic code, not a model | `src/lib/ai/detect-patterns.ts` — a 200m/30d radius query and a count. It does not talk to Claude; `structure-incident.ts` hands Claude the same history afterwards |
| 270 Cambridgeshire parishes seeded from ONS data | `prisma/seed-villages.ts`, re-run reported `unchanged 270` |
| Data stored in the UK | Supabase `eu-west-2`, Vercel `lhr1` |
| Infrastructure ≈ £52/month | The infrastructure subtotal above, £624 ÷ 12 |
| 360 unit tests, run by CI on every push | `.github/workflows/ci.yml`, between the typecheck and the build; no database, no secret |

**Built but not yet exercised in service** — say "built" rather than "proven"

- **No village has been activated.** The 270 seeded parishes are all `PENDING`
  and the registration picker filters to `ACTIVE`, so the only joinable village
  is the seed script's placeholder. Histon is the intended first pilot and has
  not started. Nothing in the timeline above should be read as under way.
- **No compliance acceptance has ever been recorded**, in either model. The gate
  is live and blocking, and no coordinator has yet been through the screen.
- **Neither cron has ever fired** — not the Sunday digest, not the nightly
  retention sweep. The digest is the only thing that creates `PatternAlert` rows,
  and nothing in the app renders those.
- **No push notification has been delivered to a real device** (`BACKLOG.md`
  B3/L4).
- The retention job, erasure, the WhatsApp alert, the Facebook share, the QR
  invite, the heatmap, auto-approve and the PDF's `?analysis=ai` path have all
  been built and unit tested where there is logic to test, and none has run
  against a real village's data.

**Not ours to assert**

- The DPIA is a **draft template, not signed** (`docs/DPIA.md`, §9 lists the
  actions that belong to the controller). The Article 28(3) processing agreement
  is drafted and signed by neither party, and `docs/COMMUNITY_DPA.md` has been
  written from the code and read by no lawyer. Do not write "DPIA completed" or
  "GDPR compliant" until L1, L2 and L8 in `BACKLOG.md` are closed.
- `DATA_CONTROLLER` in `src/lib/constants.ts` is placeholders and there is no ICO
  registration yet.
- The transfer mechanisms for Anthropic and OneSignal are marked `[verify]` in
  the DPIA (A9, A11). Do not describe them as confirmed.

**External figures — re-verify on the day, none of these is ours**

| Figure | Where it is used | What to do |
|---|---|---|
| 1.4 million households (Neighbourhood Watch Network reach) | §The problem | Cite the Network's own published source and the year it refers to |
| £3 million UK-wide pot, ~50 organisations | `docs/FUNDING.md` P1 | Re-read the TNLCF announcement; the figures and the delivery partners may have moved |
| £3.35m through 2028/29, £500–£35,000 grants (Cambridgeshire PCC) | `docs/FUNDING.md` P2 | Confirm with the PCC office; rolling rounds change |
| £15,000/year, £100–£300 grants (Neighbourhood Watch community grants) | `docs/FUNDING.md` P3 | Confirm the current round on ourwatch.org.uk |
| Up to £10,000 (Awards for All) | `docs/FUNDING.md` P4 | Confirm the current England ceiling |
| £25,000–£500,000 (Innovate UK Smart Grants) | `docs/FUNDING.md` P5 | Confirm against the live competition |
| £240 / £192 supplier list prices | §Budget | Re-check Supabase and Vercel pricing; both have changed plans before |
