# VillageWatch — Funding Strategy & Grant Tracker

Last updated: 21 August 2026

> **Every pot, grant size and date below is a third party's figure, recorded
> when it was read and not re-checked since.** Re-verify before an application
> is written against any of them — see "External figures" at the foot of this
> file. Nothing here is a claim about VillageWatch.

## Funding Opportunities

### Priority 1: National Lottery Community Fund — AI Programme
- Pot: £3 million UK-wide
- Grant size: TBC (likely £10k-£50k based on 50 organisations)
- Status: Applications expected autumn 2026
- Fit: Perfect — "community-led AI tools rooted in local needs"
- Apply via: UK Community Foundations + Centre for the Acceleration of Social Technology (CAST)
- URL: https://www.tnlcommunityfund.org.uk/news/3m-to-help-communities-shape-the-future-of-ai-and-confront-the-wisdom-gap
- Action: Prepare application now, submit when window opens
- Draft: `docs/GRANT_APPLICATION_NL_AI.md`

### Priority 2: Police & Crime Commissioner Community Safety Fund
- Pot: £3.35m through 2028/29
- Grant size: £500-£35,000
- Status: Rolling applications (check Cambridgeshire PCC website)
- Fit: Strong — directly supports Police and Crime Plan
- Eligible: Parish councils, community organisations, CICs
- URL: Check cambridgeshire-pcc.gov.uk
- Action: Contact PCC office for current round dates

### Priority 3: Neighbourhood Watch Community Grants
- Pot: £15,000/year (expanding)
- Grant size: £100-£300
- Status: Annual rounds (last closed Dec 2025)
- Fit: Natural — VillageWatch extends NW's mission digitally
- URL: https://www.ourwatch.org.uk/communitygrants
- Action: Apply in next round (likely autumn 2026)

### Priority 4: National Lottery Awards for All
- Grant size: Up to £10,000
- Status: Rolling applications
- Fit: Good — community technology project
- URL: https://www.tnlcommunityfund.org.uk
- Action: Can apply anytime

### Priority 5: Innovate UK Smart Grants
- Grant size: £25,000-£500,000
- Status: Rolling competitions
- Fit: Strong if framed as AI + privacy innovation
- URL: https://apply-for-innovation-funding.service.gov.uk
- Action: Monitor current competitions

## Application Status

| Grant | Status | Submitted | Amount | Outcome |
|-------|--------|-----------|--------|---------|
| NL AI Programme | Drafting | — | TBC | — |
| PCC Safety Fund | Not started | — | — | — |
| NW Community | Not started | — | — | — |
| NL Awards for All | Not started | — | — | — |
| Innovate UK | Not started | — | — | — |

## Key Messages for All Applications

- Origin: 200-person village WhatsApp group in Histon, Cambridgeshire — messages buried, privacy concerns, no structure
- Solution: AI-powered community safety platform with automatic face blurring, incident structuring, and clustering that flags recurring concerns
- Privacy by design: client-side face detection (never leaves device), anonymised descriptions, coordinate fuzzing, per-village redaction levels, DPIA drafted, built to UK GDPR requirements
- **No parish council needed to start**: the community model makes the coordinator the data controller and asks for one agreement; a council village accepts the three documents a council separately holds. Most watch groups have no council, and the council-shaped compliance pack is why they stay in WhatsApp
- Community-driven: built from real resident needs, not top-down
- Open to all villages: 270 Cambridgeshire parishes seeded from ONS open data; the same pipeline covers all 10,670 English parishes
- Cost-efficient: **infrastructure ~£52/month (£624/yr)**; year one including developer time is £3,524. Two different figures — do not divide the second by twelve
- Data **stored** in the UK (Supabase London, Vercel `lhr1`); Anthropic, OneSignal and Slack are outside it, under SCCs with the UK IDTA — two of the three still marked `[verify]` in the DPIA
- Impact: replaces unsafe WhatsApp groups with structured, privacy-respecting, police-shareable incident reporting

## Before any application is submitted

Grant applications are statements to a funder, and several of the claims above
are statements about how the code behaves — the same rule `/privacy` is held to.
These are the ones to re-check on the day, because each is currently true only
with a qualification:

| Claim | Position on 21 Aug 2026 | Needed before submission |
|-------|-------------------------|--------------------------|
| "DPIA completed" | `docs/DPIA.md` is marked **DRAFT TEMPLATE — not yet reviewed or signed off**. `docs/COMMUNITY_DPA.md` was written from the code and read by no lawyer | Controller review and signature, or say "drafted" |
| "GDPR compliant" | ~~`DATA_CONTROLLER` is placeholders, no ICO registration~~ — **both closed since**: the constant was filled in on 30 Aug and Yakasista Ltd is registered as **`ZC233685`** (2 Sep), published on `/privacy` §1. Still true as at 2 Sep: processing agreement unsigned, two transfer mechanisms marked `[verify]` (DPIA A9, A11), and **no village's own controller named** | L1/L2/L8 in `BACKLOG.md`, or claim "built to UK GDPR requirements". The registration is the processor's and may be cited as such — it is **not** a claim that any village's controller is registered |
| "All data held in the UK" | Data is **stored** in the UK — Supabase `eu-west-2`, Vercel `lhr1`. Anthropic, OneSignal and Slack are in the United States, under SCCs with the UK IDTA | Say "stored in the UK", name the three processors outside it, and do not describe A9/A11 as confirmed |
| "Cambridgeshire seeded" | 270 of 298 parishes, all `PENDING`; the register picker filters to `ACTIVE`, so none is joinable yet | Activate the pilot villages, or state "seeded, none activated yet" |
| "Compliance gate protects every village" | **All twelve migrations are applied**, so the gate is live and blocking on the deployed database. **No village has been through it** — no acceptance exists in either model | Say the gate is live and enforced in code, and that no village has completed it yet |
| "Histon pilot" | **Not started.** No village has ever been activated; the only `ACTIVE` village is the seed script's placeholder | State it as the intended first pilot, in the future tense |
| "Push notifications" | Code path complete; no push has ever been delivered to a real device (B3 / L4) | One verified delivery |
| "Weekly digests" | The cron is wired in `vercel.json` and **has never fired**. It is the only thing that creates `PatternAlert` rows, and nothing renders those | Say a coordinator "receives an automatic weekly digest"; do not offer pattern alerts as a metric |
| "Pattern detection" | The clustering is deterministic code — a 200m/30d radius query and a count in `src/lib/ai/detect-patterns.ts`, which does not call Claude. Claude is given the same history afterwards and may add to it | Describe the clustering as automatic, and the AI as the layer on top |
| "Share any incident with police" | Coordinators only, published reports only. A resident has no such button | Say "any published incident, coordinators only" |
| "Built in seven days" | The first seven days produced the scaffold and the core reporting flow. The compliance gate, the two models, PDF reports, QR invites, the heatmap and the test suite all landed in the month after | "An initial seven-day build, developed since" |
| "1.4 million households" (Neighbourhood Watch) | Third-party figure, not verified here | Cite the Neighbourhood Watch Network source |

`docs/GRANT_APPLICATION_NL_AI.md` is written against the right-hand column, not
the left. If a claim is strengthened there, strengthen it here too.

## External figures

Everything in "Funding Opportunities" above is somebody else's number, read once
and not re-checked. A pot that has closed, a grant ceiling that has moved or a
delivery partner that has changed are all ordinary, and an application written
against a stale figure reads as one nobody checked.

| Figure | Where | Recorded | Re-verify against |
|---|---|---|---|
| £3m pot, ~50 organisations, autumn 2026 window, UKCF + CAST | P1 | 29 Jul 2026 | The TNLCF announcement linked in P1 |
| £3.35m to 2028/29, £500–£35,000, rolling | P2 | 29 Jul 2026 | Cambridgeshire PCC office — the URL is a guess, not a link that was opened |
| £15,000/year, £100–£300, annual rounds | P3 | 29 Jul 2026 | ourwatch.org.uk/communitygrants |
| Up to £10,000, rolling | P4 | 29 Jul 2026 | tnlcommunityfund.org.uk — the England ceiling has moved before |
| £25,000–£500,000, rolling competitions | P5 | 29 Jul 2026 | The live competition on the Innovate UK service |
| 1.4 million households | Key messages, and the grant draft | 29 Jul 2026 | The Neighbourhood Watch Network's own published source, with the year it refers to |
| £240 Supabase Pro, £192 Vercel Pro | The grant draft's budget | 29 Jul 2026 | Both suppliers' current list prices |

The one figure in that draft that is **ours** and still a projection is the £180
Anthropic line: it covers three call sites, no cron has fired and no coordinator
has generated a report, so nothing has been billed against a real village.
