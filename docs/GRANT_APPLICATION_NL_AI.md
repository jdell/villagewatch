# VillageWatch — National Lottery Community Fund AI Programme Application

> **Status: draft, not submitted.** Every claim below has been checked against
> the codebase — see §Evidence at the end for what is verified, what is built
> but unexercised, and the one external figure that still needs a citation.
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
card, and pattern detection to surface recurring concerns. The platform includes
a live incident map, push notifications, coordinator moderation and one-click
police report generation. Built over seven days using the Lexit rapid
development playbook, it is live at villagewatch.app and seeded with 270
Cambridgeshire parishes from ONS open data, with its first village pilot
starting in Histon. VillageWatch shows how community-led AI can solve an
everyday problem — keeping villages safe while respecting everyone's privacy.

## The problem (300 words)
Across England, thousands of villages use WhatsApp groups for community safety reporting. In Histon alone, over 200 residents joined a Village Watch WhatsApp group after incidents of antisocial behaviour involving children. The intention was good, but the execution creates serious problems:

**Privacy failures:** Every member's phone number is visible to all 200+ people. Photos and videos are shared without face blurring — including footage of minors. Under UK GDPR and the Children's Code, this creates real legal liability for the group administrators, who are often unpaid volunteers with no data protection training.

**Information loss:** Important incident reports are buried within minutes by casual conversation. There is no way to search past incidents, identify patterns ("this is the 4th incident at the park this month"), or generate structured reports for the police.

**No accountability:** Anyone can post anything to 200 people instantly. Speculation, naming individuals, and defamatory statements are common. The group rules say "think before posting" but there is no mechanism to enforce this.

**Police engagement gap:** When coordinators meet their PCSO, they scroll through hundreds of WhatsApp messages and screenshot relevant ones. There is no structured data, no map, no trend analysis — just anecdotes.

These are not problems unique to Histon. The Neighbourhood Watch Network reaches
an estimated 1.4 million households, and WhatsApp is the dominant communication
channel for community safety across the UK. The problems are structural:
WhatsApp was designed for social messaging, not community safety reporting.

## Our solution (500 words)
VillageWatch is a web application (no app store download needed) that provides AI-powered community safety reporting designed specifically for villages. It addresses every problem identified above:

**Privacy by design:** When a resident uploads a photo or video, AI face detection runs entirely on their device using MediaPipe WASM. Faces are obscured before the image ever leaves their phone — the original unblurred footage is never transmitted or stored, and there is deliberately no server-side fallback, so an original with a face in it cannot be uploaded even if the on-device pass fails. The privacy level (light blur to full redaction) is configurable per village by the coordinator, based on police guidance.

**AI-powered structuring:** When a resident types "some kids were throwing stones at cars near the park around 3pm," Claude AI transforms this into a structured incident card: type (antisocial behaviour), severity (moderate), location (Park area, Oak Lane), time, and an anonymised description that strips any personal names. The reporter reviews the AI output before publishing — they are the human in the loop, satisfying UK GDPR's automated decision-making requirements.

**Pattern detection:** The AI cross-references each new report against incidents from the past 30 days within 200 metres. It flags patterns automatically: "4th incident in this area this month." This is intelligence that no WhatsApp group can produce.

**Live map:** All published incidents appear as colour-coded pins on a Leaflet map of the village (green/amber/red/purple by severity). A heatmap overlay shows incident density. Residents see at a glance where problems cluster. Reported locations are shifted by up to 100 metres before they are stored, so the map shows a neighbourhood rather than a doorstep.

**Coordinator dashboard:** Village coordinators (typically the NW coordinator or a parish councillor) can moderate reports before publication, set auto-approve for trusted communities, generate weekly AI-powered safety digests, and export structured CSV data for police meetings.

**One-click police sharing:** Coordinators tap "Share with police" on any incident for a formatted summary, or generate a full weekly report with statistics, hotspots, and AI-generated pattern analysis — ready for the PCSO meeting.

**Compliance gate:** Before a village can process data, its coordinator must read and accept a Data Protection Impact Assessment, an Appropriate Policy Document, and an Article 28(3) Data Processing Agreement — all rendered in full in the app, and each acceptance recorded in an append-only audit trail. Until all three are accepted the village accepts no report at all. This is the level of data governance that WhatsApp groups have never had.

**Multi-village from day one:** The platform is seeded with 270 Cambridgeshire parishes from ONS open data, and the same pipeline covers all 10,670 parishes in England. Villages activate one at a time, each with its own join code, coordinator and settings.

The platform is live at villagewatch.app, built on Next.js 16, Supabase (London region), and Leaflet with OpenStreetMap. All resident data is held in the UK. Monthly running cost is approximately £52.

## How this relates to AI and communities
VillageWatch is a working example of community-led AI that:
- Uses AI to protect privacy (face blurring) rather than erode it
- Puts the human in the loop (reporter reviews AI output before publishing)
- Makes AI-generated intelligence accessible to non-technical users (coordinators, parish councillors, PCSOs)
- Demonstrates responsible AI: DPIA drafted and awaiting council sign-off, privacy by design, compliance gate, append-only audit trail
- Degrades honestly: when the AI is unavailable, the report is filed in the resident's own words and the weekly digest falls back to counted figures rather than inventing prose

## Budget
| Item | Annual cost |
|------|------------|
| Supabase Pro (database, London) | £240 |
| Vercel Pro (hosting, London) | £192 |
| Anthropic API (AI structuring, ~200 reports/month) | £180 |
| OneSignal (push notifications) | Free |
| Domain (villagewatch.app) | £12 |
| Developer time (maintenance, 4hrs/month) | £2,400 |
| Community engagement (materials, events) | £500 |
| **Total year 1** | **£3,524** |

## Impact measurement
- Number of villages activated
- Number of incidents reported (vs WhatsApp baseline)
- Coordinator satisfaction survey (quarterly)
- Police feedback on report quality
- Data subject requests received (GDPR compliance metric)
- Pattern alerts generated (AI effectiveness)

## Timeline
- Jul 2026: Built and deployed (complete)
- Aug 2026: Histon pilot (5-10 residents)
- Sep 2026: Expand to neighbouring villages (Impington, Cottenham)
- Dec 2026: 10 villages across Cambridgeshire
- Mar 2027: 25 villages, first police force partnership conversation
- Jun 2027: Open to all Cambridgeshire parishes

---

## Evidence

Checked against the repository on 29 July 2026. A funder can ask for any of
this, so the distinction between "built" and "proven in service" is kept here
rather than blurred in the prose above.

**Verified against the running service or the code**

| Claim | Evidence |
|-------|----------|
| Live at villagewatch.app | HTTP 200 from Vercel `lhr1`, serving the landing page |
| On-device face blurring, no server-side fallback | `src/lib/media/face-blur.ts`; `POST /api/incidents/media` accepts only the redacted canvas output |
| Locations shifted before storage | `fuzzCoordinates`, `LOCATION_FUZZ_METERS` (100m) |
| Reporter reviews the AI rewrite before saving | The wizard's preview step; the AI route writes nothing |
| Raw wording never public, and every read audited | `PUBLIC_INCIDENT_SELECT`, `readRawDescription` |
| Compliance gate blocks reporting until three documents are accepted | `src/lib/compliance.ts`; both report routes 403 before parsing a body |
| 270 Cambridgeshire parishes seeded from ONS data | `prisma/seed-villages.ts`, re-run reported `unchanged 270` |
| UK data residency | Supabase eu-west-2, Vercel `lhr1` |
| Running cost ≈ £52/month | The budget table above, ÷ 12 |

**Built but not yet exercised in service** — say "built" rather than "proven"

- The compliance gate's two migrations are not applied on the live database, and
  the missing-column state deliberately allows reporting rather than taking
  villages offline over a deployment fault. Nothing has been blocked by it yet.
- No push notification has been delivered to a real device (`BACKLOG.md` B3/L4).
- The seeded parishes are all `PENDING` and the registration picker filters to
  `ACTIVE`, so none is joinable until it is activated for the pilot.
- The retention job, erasure, and the WhatsApp Channel alert have never run
  against real data.

**Not ours to assert**

- The DPIA is a **draft template, not signed** (`docs/DPIA.md`, §9 lists five
  actions that belong to the council). The Article 28(3) processing agreement is
  drafted and signed by neither party. Do not write "DPIA completed" or "GDPR
  compliant" until L1, L2 and L8 in `BACKLOG.md` are closed.
- `DATA_CONTROLLER` in `src/lib/constants.ts` is still placeholders and there is
  no ICO registration yet.
- The 1.4 million households figure is the Neighbourhood Watch Network's own;
  cite their source rather than this document.
