# VillageWatch — Funding Strategy & Grant Tracker

Last updated: 29 July 2026

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
- Solution: AI-powered community safety platform with automatic face blurring, incident structuring, and pattern detection
- Privacy by design: client-side face detection (never leaves device), anonymised descriptions, coordinate fuzzing, per-village redaction levels, DPIA drafted, built to UK GDPR requirements
- Community-driven: built from real resident needs, not top-down
- Open to all villages: 270 Cambridgeshire parishes seeded from ONS open data; the same pipeline covers all 10,670 English parishes
- Cost-efficient: ~£52/month to run, built on open-source stack
- Impact: replaces unsafe WhatsApp groups with structured, privacy-respecting, police-shareable incident reporting

## Before any application is submitted

Grant applications are statements to a funder, and several of the claims above
are statements about how the code behaves — the same rule `/privacy` is held to.
These are the ones to re-check on the day, because each is currently true only
with a qualification:

| Claim | Position on 29 Jul 2026 | Needed before submission |
|-------|-------------------------|--------------------------|
| "DPIA completed" | `docs/DPIA.md` is marked **DRAFT TEMPLATE — not yet reviewed or signed off** | Council review and signature, or say "drafted" |
| "GDPR compliant" | `DATA_CONTROLLER` is placeholders, no ICO registration, processing agreement unsigned | L1/L2/L8 in `BACKLOG.md`, or claim "built to UK GDPR requirements" |
| "Cambridgeshire seeded" | 270 of 298 parishes, all `PENDING`; the register picker filters to `ACTIVE`, so none is joinable yet | Activate the pilot villages, or state "seeded, activating from August" |
| "Compliance gate protects every village" | Built and unit tested; its two migrations are not applied on the live database, and the missing-column state deliberately allows reporting | Apply migrations 7 and 9 together (see `BACKLOG.md` L6) |
| "Push notifications" | Code path complete; no push has ever been delivered to a real device (B3 / L4) | One verified delivery |
| "1.4 million households" (Neighbourhood Watch) | Third-party figure, not verified here | Cite the Neighbourhood Watch Network source |

`docs/GRANT_APPLICATION_NL_AI.md` is written against the right-hand column, not
the left. If a claim is strengthened there, strengthen it here too.
