# VillageWatch — go-to-market plan

**Written:** 25 August 2026 · **Repo version:** `v0.1.43` · **Live at:**
https://villagewatch.app

This is the plan for getting VillageWatch from a deployed application with no
users to a product a parish clerk pays for. It covers positioning, the
acquisition funnel, the channels, the content, the numbers to watch and the
pricing to test.

**Read `docs/LAUNCH_BLOCKERS.md` first.** Five things stand between the code and
the first real resident, and none of the marketing below matters until they are
cleared. Phase 0 is that list.

**Every claim made to a parish clerk is held to the same rule `/privacy` is
held to.** A grant application, a Facebook post and a landing page are all
statements about how the code behaves. `docs/FUNDING.md` carries the standing
list of claims that would be wrong if copied forward carelessly; check any new
copy against it before it goes out. The failure mode is not embarrassment — it
is a council handing over its residents' reports on the strength of something
that is not true.

**This document is read by people and rendered by nothing.** It needs **no**
`outputFileTracingIncludes` entry.

---

## 1. Positioning

**AI-powered community safety intelligence for UK villages.**

### The problem, stated properly

Every village already has a safety group, and it is a WhatsApp group. That is
not a gap in the market — it is the incumbent, it is free, and everybody is
already in it. The pitch cannot be "you need something"; it has to be "the thing
you have is structurally unfit for this, and here is the specific way it fails
you".

A WhatsApp group is unfit for safety reporting in five ways that are properties
of the medium rather than of how any particular group is run:

| What a village needs | What a WhatsApp group does |
|---|---|
| **A record** | A scrolling feed. Last month's reports are unreachable, so nobody can answer "has this happened before?" |
| **Anonymity** | Names, number plates and addresses are typed in verbatim and are permanent, forwardable and unrecallable |
| **A pattern** | Six break-ins over three weeks read as six separate messages. Nobody joins the dots by hand |
| **Something to hand the police** | A screenshot. There is no report a PCSO can act on and no format a council meeting can minute |
| **A lawful basis** | Reports about suspected crime are criminal offence data under Article 10. A group chat has no controller, no policy document and no retention |

The last one is the one nobody has thought about and the one that lands hardest
with a parish clerk, because a clerk is the person who gets asked.

### The one-line answer

> Residents report what they see. AI strips out the personal details and
> categorises it. The map, the alerts and the pattern detection do the rest —
> and at the end of the month there is a document you can hand to your PCSO.

### The four proof points, and the exact claim to make

Only claim what the code does. These four are true today and are worth leading
with, in this order:

1. **Faces are covered on your own device, before the photo leaves it.** There is no server-side fallback — a fallback would mean accepting an original with a face in it. This also strips the EXIF block and its GPS tag. It is the most concrete privacy claim the product has and the easiest to demonstrate in a room.
2. **The reporter reads and approves the anonymised rewrite before anything is saved.** Not a black box making a decision about somebody — a person, checking a rewrite. This is also the Article 22 position and it holds in both village models.
3. **Pattern detection is a radius query and a count, not a guess.** Reports within 200 metres over 30 days are flagged as recurring. Describe the clustering as automatic and the AI as the layer on top — that distinction is in `docs/FUNDING.md` for a reason.
4. **A UK GDPR pack, in the product.** A village cannot file a single report until its coordinator has read and accepted the agreement that authorises the processing. Every other tool leaves that as the clerk's problem.

### What not to say

- Not "GDPR compliant" — that is not available until L1 and L2 close.
- Not "trusted by N villages" until somebody can point at the list. `VILLAGES_LIVE` is null and the landing page renders no figure, which is the right way to be wrong.
- Not "£15 per month" anywhere public until there is something to charge with. See §8.
- Not "the Histon pilot is under way" until a village is activated. A grant draft claimed this and it was corrected.

---

## 2. Target audience

**The buyer, the user and the champion are three different people, and the
champion is the one to find first.**

| | Who | What they care about | Where they are |
|---|---|---|---|
| **Champion** | The person who already runs the village's safety group — a WhatsApp admin, a Neighbourhood Watch lead, an active resident | Being taken seriously; not doing it all by hand; not being the one who gets it wrong | The group they already run |
| **Buyer** | Parish council clerk or chair | Liability, minutes, the ICO, the precept | Monthly meetings, a public email address |
| **User** | 20–200 residents | Knowing what happened on their street; not being spammed | Wherever the champion tells them |

**Geography.** Cambridgeshire first, and specifically Histon & Impington and its
neighbours. 270 Cambridgeshire parishes are already seeded in the database as
`PENDING`, which means activating a neighbour is a button rather than a data
import. England's other 10,400 are seeded nowhere and want a server-side search
endpoint before they are activated wholesale.

**Why coordinator-first.** A village has one person who already does this job
unpaid. Find them and they bring the residents, because they are already the
person the residents listen to. Marketing to residents directly means asking
somebody to join a safety network their neighbours are not in, which is a cold
start per household instead of per village.

---

## 3. Launch phases

### Phase 0 — clear the blockers (now)

Nothing below starts until these are done. Full detail, with action items, is in
`docs/LAUNCH_BLOCKERS.md`.

| | Blocker | The short version |
|---|---|---|
| L1 | DPIA / compliance pack | Gate is live and enforcing; nothing accepted anywhere. **Run the pilot in `community` mode** and it is one document, not three |
| L2 | `DATA_CONTROLLER` placeholders | Still `[Data controller name]` in source. ICO registration is the long-lead item — start it today |
| L3 | Village activation | Code done since July, **never run**. No village has ever been activated |
| L4 | OneSignal push | Credentials missing in Vercel. Every failure mode here is silent |
| L5 | Coordinator flow | Never exercised as a chain against a database |

Plus **L7** — the seed village `your-village`, with five invented incidents and
the join code `VILLAGE1`, is the only `ACTIVE` village in the database. Clear it
in the same sitting as L3.

**Exit criterion:** one real report filed by a real resident in Histon, reviewed
by the coordinator, published, and a push notification received on a phone.

### Phase 1 — the Histon pilot (month 1–2)

**Target: 1 village, 10 residents, 5+ real incidents.**

Deliberately small. The point of this phase is not growth — it is evidence, and
evidence needs a village where somebody can knock on the door when something
looks wrong.

- Activate Histon; appoint the coordinator; walk them through `/dashboard/compliance` in person and watch reporting open.
- Recruit 5–10 households through the coordinator's existing group. Face to face or in the group they already read; no advertising.
- Ship the **resident quick start guide** (§5) — one side of A4, printed, handed over.
- Watch the first of everything, because everything degrades quietly rather than failing: the first AI pass, the first face blur, the first push, the first pasted alert, the first police-data sync, the first retention run.
- At week 4 and week 8, sit with the coordinator for half an hour and write down what they actually did, in their words. That is the case-study material and it cannot be reconstructed later.

**What Phase 1 produces:** a testimonial, a screenshot of a real map, a
first-month incident count, and one named coordinator willing to speak to
another village. That last one is the actual product of this phase.

### Phase 2 — the neighbours (month 3–4)

**Target: 3–5 more villages, 50 residents total.**

- Approach Impington, Cottenham, Milton, Waterbeach, Oakington — parishes that share a road, a school catchment and a police neighbourhood team with Histon. Shared geography is the whole argument: a pattern that crosses a parish boundary is invisible to two separate WhatsApp groups.
- **The Histon coordinator makes the introduction**, not us. A volunteer telling another volunteer it was worth the evening is the only channel that works at this scale.
- Approach the Cambridgeshire PCC Community Safety Fund (P2 in `docs/FUNDING.md`) with a real pilot behind it rather than a proposal.
- Present at one Histon parish council meeting and ask for a minute recording it. A minuted line in one council's papers is a citable fact for the next five.

**Exit criterion:** a village that we did not personally recruit asks to join.

### Phase 3 — SaaS launch (month 6+)

**Target: 25+ villages, first paying council.**

- Open registration properly: a server-side village search endpoint (the browser-side filter is fine at 270 and is not fine at 10,670), then activate beyond Cambridgeshire.
- Sell to parish councils directly, on the compliance pack rather than on the map. The clerk's problem is liability, and the gate is the answer to it.
- Blog and SEO compound from here (§7) — start it in Phase 1 so it has six months of age by the time it matters.

---

## 4. The acquisition funnel

**Coordinator-first. One coordinator per village; they bring the residents.**

```
1:1 outreach ─→ 20-min call ─→ coordinator activates ─→ residents join ─→ first report
   (us)          (us + them)      (them, guided)         (them)          (the village)
```

The only step we own end to end is the first. Everything after it is the
coordinator's, which is why the materials in §5 matter more than the channels do.

### Where the coordinators are, in priority order

1. **WhatsApp group admins.** Every village has one and they are findable by asking one resident. Highest intent, hardest to reach cold — you need an introduction or a doorstep.
2. **Neighbourhood Watch coordinators.** A published network with a national body behind it. Already sold on the mission; the pitch is "digitally, and with the paperwork done".
3. **Parish council clerks.** A public email address on every parish website. Lowest intent per message and the only route that reaches the *buyer* directly. Volume channel — expect a low response rate and use it for reach rather than conversion.
4. **PCSOs and the police neighbourhood team.** They see the same patterns and cannot act on a screenshot. One PCSO who finds the PDF report useful is worth ten cold emails.

### The qualifying question

Ask exactly one thing on a first call:

> **"How does your village currently keep track of what's been reported?"**

The answer is always the WhatsApp group, and they always describe one of the
five failures in §1 without being prompted. Let them name it; then answer the
one they named. A coordinator who cannot name a failure is not ready and should
not be pushed.

### Conversion targets

| Stage | Expect | Why |
|---|---|---|
| Outreach → reply | 10–20% | Warm intros far higher; cold clerk email far lower |
| Reply → call | 50% | Self-selected by then |
| Call → activation | 30% | The drop-off is "I need to ask the council", which is real and slow |
| Activation → 5 residents | 70% | If the coordinator is genuine, residents follow |
| Activation → first report in 14 days | 50% | The single number to watch. A silent village is a failed activation, whatever the signup count says |

---

## 5. Materials

| Material | State | Note |
|---|---|---|
| **Coordinator guide** | **Exists — 24 pages** | `docs/COORDINATOR_GUIDE.md`, rendered at `/dashboard/guide` and as `docs/VillageWatch-Coordinator-Guide.pdf`. Nine sections from Welcome to Getting help. Verified 24 pages |
| **Pitch message** | **Not in the repo** | Referred to as existing; there is no file. Write it down and commit it — an uncommitted pitch is a pitch that drifts per send and cannot be checked against `docs/FUNDING.md` |
| **Resident quick start** | **Does not exist** | One side of A4. The Phase 1 blocker of the three |
| **Printable invite sheet** | Exists | `/invite/[slug]` — public, `noindex`, needs no account. Print one before printing a hundred |
| **QR invite** | Exists | `InviteShare` on `/dashboard`. Link, code, copy, WhatsApp, QR |
| **PDF period report** | Exists | The leave-behind for a council meeting or a PCSO. Never built from a real village's reports |

### Resident quick start — the one page

Six steps and nothing else. It is handed over on a doorstep, so it fits on one
side and assumes nothing:

1. Scan the QR code, or go to the link.
2. Check it says **Histon**. Enter the join code from this sheet.
3. Set a password. Optionally drop a pin on your home so alerts can be filtered by distance — you can skip this.
4. **Allow notifications** when asked. This is the one prompt worth getting right: denying it cannot be undone from the same website.
5. To report: tap **Report**, describe it in your own words, and check the rewritten version before you send. Your original wording is never published.
6. Photos are fine. Faces are covered on your phone before the photo is uploaded — the original never leaves the device.

Plus one boxed line at the foot: **In an emergency call 999. This is not a
police reporting service.** That line is not optional and belongs on every
resident-facing material.

### Pitch message — commit it

Short, names the failure rather than the product, asks for twenty minutes.
Something in this shape, adapted per recipient:

> Hello — I build VillageWatch, a community safety reporting tool for villages.
> I'm looking for one or two Cambridgeshire villages to run it with while it's
> still free and still being shaped.
>
> The problem I keep hearing is that the village WhatsApp group is where safety
> gets discussed and it's a bad place to keep a record — last month's reports
> are unreachable, people type in names and number plates that then can't be
> taken back, and there's nothing you can hand a PCSO.
>
> VillageWatch takes the report, strips the personal details out automatically,
> and gives you a map, repeat-incident flags, and a PDF you can put in front of
> the council. Photos have faces covered on the reporter's own phone before
> they upload. It comes with the UK GDPR paperwork already written.
>
> Would twenty minutes be useful? Happy to just show you and leave it there.

---

## 6. Facebook Page strategy

Local Facebook groups are where a village of 200 actually talks. The Page exists
to be a credible thing to link *to* from those groups — a Page with three posts
and no photo reads as a scam, and the whole point is being trusted enough to be
allowed to post.

### Setup

- Create the **VillageWatch** Page. Profile image is the shield from `src/components/logo.tsx`; cover is a real map screenshot once Histon has pins on it (not before — a fake map is exactly the kind of claim this document exists to prevent).
- About: the one-liner from §1, `https://villagewatch.app`, and Cambridgeshire as the location.
- **Meta Business Suite for scheduling.** Write a week ahead in one sitting, schedule, and never post ad hoc. Two or three posts a week that arrive is far better than five that stop after a fortnight.

### Cadence and mix

**2–3 posts a week**, rotating six types so the Page is not one long advert:

| Type | Frequency | Notes |
|---|---|---|
| Community safety tip | Weekly | Genuinely useful and product-free. This is what gets shared |
| "Did you know" from data.police.uk | Fortnightly | Real Home Office figures for a named area. Cite the Open Government Licence v3.0 — it is a licence condition, not a courtesy |
| Feature explainer | Fortnightly | One feature, plain English, one screenshot |
| Pilot village story | Monthly | Only once there is one. Coordinator quoted by name with permission |
| Pattern insight, anonymised | Monthly | **Never before Phase 2.** See the rule below |
| Coordinator spotlight | Monthly | A volunteer, named, with permission |

### The rule on posting about incidents

**Never post anything derived from a live report, in any form, at any stage.**

Not paraphrased, not "a village in Cambridgeshire", not with the details
changed. A village has 200 people in it; "a break-in on a lane near the school
last Tuesday" is identifying to everyone who lives there, and the reporter chose
to tell their village, not Facebook. Domain rule 1 does not stop at the village
boundary.

What may be posted: aggregate counts across **five or more** villages, once
there are five; and figures from data.police.uk, which are already published by
the Home Office. Anything else needs the coordinator's and the reporter's
explicit permission and is not worth the post.

### Distribution into local groups

The Page is not the reach — the local groups are.

- Histon & Impington community groups first, then each neighbouring parish as Phase 2 opens it.
- **Ask the admin before posting.** Every one of these groups is run by exactly the sort of person we want as a coordinator, so treat the ask as the first line of the pitch rather than as a hurdle.
- Share the *useful* posts, not the product ones. A safety tip earns a second post later; an advert earns a removal and a ban.
- Never post into a village's group before that village is activatable. Sending residents to a village they cannot join is one impression spent for nothing.

### Paid

**£5–10/day, and not until Phase 2.** Boosting to residents of a village that
cannot be joined wastes the budget and the impression.

- Boost the posts that already earned organic engagement. Never boost an advert.
- Target: Cambridgeshire, 35+, interests around Neighbourhood Watch, community safety, parish councils, local news.
- Budget cap **£150/month**, reviewed monthly against activations rather than clicks. Paid social is a poor fit for a coordinator-first funnel and this line is a test, not a channel. Cut it if it produces no calls in two months.

### First two weeks — the calendar

**Week 1**

| Day | Post |
|---|---|
| **Mon** | *Introducing VillageWatch.* What it is in three sentences, who it is for, link to the landing page. No feature list |
| **Wed** | *How pattern detection works.* Six reports within 200 metres over 30 days get flagged as connected — automatically, by measuring distance and counting, not by guessing. Simple diagram |
| **Fri** | *Safety tip:* the five-minute check — outbuildings, side gates, vehicle documents, a light on a timer, and knowing which neighbour is away this week |

**Week 2**

| Day | Post |
|---|---|
| **Mon** | *Your data stays in the UK.* Reports are stored in London (Supabase `eu-west-2`). Faces are covered on your own phone before upload. Locations are moved by a random distance before they are stored. Be precise: data is **stored** in the UK, and some processors are outside it — `docs/FUNDING.md` flags exactly this claim as one that has been got wrong before |
| **Wed** | *Feature spotlight: the coordinator dashboard.* The moderation queue, the map, and the report you hand your PCSO. One screenshot |
| **Fri** | *How to join VillageWatch.* Six steps for a resident, matching the quick start sheet. Ends with: ask your village's coordinator, or get in touch about starting one |

---

## 7. SEO

A slow channel that compounds, which is exactly why it starts in Phase 1 rather
than Phase 3 — six months of age is the asset.

### The blog does not exist yet

There is no `src/app/blog` route. This is a build item, not a content item.
Keep it small: MDX or a flat Markdown directory parsed by the existing
`src/lib/markdown.ts` — which already parses to a typed tree that
`MarkdownView` renders with no `dangerouslySetInnerHTML`, so there is nothing to
sanitise and no new dependency to justify. Constraints that already apply and
will bite otherwise:

- Any Markdown read from disk at run time needs a line in `outputFileTracingIncludes`, or it works in `npm run dev` and fails **only in production**.
- Keep the literal `docs`-style path segment in the `path.join` — a fully dynamic path makes Turbopack trace the whole project into the bundle.
- Add every post to `src/app/sitemap.ts`. It is a hand-written list of five pages today, and `lastModified` is deliberately absent rather than `new Date()`, which would claim every page changed on every build.
- Canonicals are per page and never on the root layout — a canonical of `/` on the layout tells a crawler that every other page is a duplicate of the home page.

### Keywords

| Keyword | Intent | Note |
|---|---|---|
| `village safety reporting` | Core | Low volume, exact fit, winnable |
| `community crime reporting UK` | Core | More volume, more competition |
| `neighbourhood watch app` | High | Highest volume here; the national body will outrank us — target the comparison, not the term |
| `parish council safety tool` | Buyer | The clerk's search. Lowest volume, highest value |
| `report suspicious activity village` | Long tail | Resident-intent, easy to rank |
| `is it illegal to post about crime on facebook uk` | Long tail | The clerk's actual worry. Genuinely useful and nobody serious has written it |

### Cadence

One post a week, rotating: how-to guides, safety tips, product updates, and
pilot case studies from Phase 2 onwards.

**First eight posts**, in order:

1. Why your village WhatsApp group is a bad safety record (and what to do about it)
2. What a parish council needs to know before collecting crime reports — the Article 10 problem, in plain English
3. How to start a Neighbourhood Watch scheme in 2026
4. What the police actually do with a community report
5. Reading your village's crime figures — a guide to data.police.uk
6. Anonymising a report: what "personal data" means when your neighbour is the subject
7. Case study: the first month in Histon *(Phase 2)*
8. What a parish clerk should ask any safety app before signing up *(a checklist we happen to pass — and where we do not, say so)*

### Local SEO

- **Google Business Profile** for Cambridgeshire. It is what makes the product appear as a local thing rather than a national one, which is the entire positioning.
- Get listed by the parish councils that adopt it. A link from a `.gov.uk` parish page is worth more than anything else on this list and costs one email to a clerk who already likes you.

---

## 8. Analytics

**There is no analytics of any kind in the project today** — no
`@vercel/analytics`, no PostHog, no Plausible in `package.json`. This is a build
item.

### What to add

| Tool | Why | Note |
|---|---|---|
| **Vercel Analytics** | Already hosting there; one dependency, no cookie banner | Traffic, not behaviour |
| **PostHog or Plausible** | Product funnel | **Plausible if the choice is close.** It is EU-hosted, cookieless and needs no consent banner. PostHog gives funnels and session data — more useful, and a new processor in a privacy notice that names every one of them |

### Whichever is chosen, it is a processor

Adding one is a change to `/privacy` §6 in the same commit, and to the
sub-processor list in **both** processing agreements. `docs/DPIA.md` §5 has a
processor table that would need a row. That is not overhead to route around — it
is the product's entire pitch, and a village finding an untracked analytics
script in a tool that sells privacy is the worst possible way to be found out.

**If in doubt, ship Plausible only.** Cookieless and EU-hosted is a much shorter
paragraph to write and a much easier one to defend at a council meeting.

### What to track

| Metric | Definition | Why it is the one that matters |
|---|---|---|
| **Village activation rate** | Villages activated ÷ coordinator calls held | The top of the real funnel |
| **Time to first report** | Activation → first report filed | **The health metric.** A village that signs up 20 residents and files nothing has failed, and every other number will hide it |
| Residents per village | Registered ÷ activated villages | 10+ is a working village |
| Reports per village per month | | 3+ means the habit took |
| **Coordinator retention at 30/60/90 days** | Coordinators still moderating | The product is a volunteer's unpaid evening. This is the churn number |
| Moderation latency | Filed → published | Over 24 hours means push is broken or the coordinator has stopped |
| Report completion rate | Wizard started → filed | Where the five-step wizard loses people |
| Push opt-in rate | | A denied permission cannot be undone from the same origin. Watch it against the onboarding tour |

**Note the audit trail is already a source.** `AuditLog` records publishes,
moderation, exports, report generation and compliance acceptance, per village,
append-only. Several of the metrics above are queries against data already
being written — no instrumentation needed, and no third party involved.

---

## 9. Pricing validation

### Where it stands

`PRICING` in `src/lib/constants.ts` renders two tiers. **Village** is Free,
always, for one village, with a nine-line feature list where every line is a
screen or route that exists. **Pro** is marked *Planned*, its `price` and
`cadence` are `undefined`, and the landing page renders its features under a
"Planned — none of this is built yet" heading with a dashed marker.

**Pro carried "£15 per month, per village" until 22 August 2026 and it was
deliberately removed**, because it was the one number a reader took away from a
section whose own footnote says the plan cannot be bought. There is no billing
provider, no plan column and no enforcement: a Pro village and a free one are
the same rows in the same tables.

### The constraint on putting £15 back

`tests/pricing.test.ts` asserts three structural promises: a tier badged
*Planned* states no price and no cadence, a cadence never appears without a
price, and the JSON-LD `Offer` never describes a tier nobody can buy. **Putting
£15 on the landing page today fails CI** — correctly.

### How to validate the price anyway

Off-platform, which is where price validation belongs before billing exists:

- **Test £15/month with the first three parish councils who express interest** — in the conversation, on a quote, on an invoice. Not on the website.
- **Offer the first six months free to pilot councils in exchange for a testimonial and a minuted line in the council's papers.** At Phase 2 volumes the testimonial is worth more than the revenue, and a council that has minuted its adoption is a reference that survives a change of clerk.
- Free tier stays free for community-mode villages, permanently. It is the acquisition channel and it is what makes the coordinator-first funnel work at all.
- The signal to watch is not "yes" — it is **who asks what it costs, unprompted**. A clerk asking the price has already decided it is worth budgeting for.

### When the number goes back on the site

When there is something to charge with. That means, in order: a billing
provider, a plan column, enforcement, and then `price`/`cadence` set and
`featured` flipped — at which point the JSON-LD `Offer` in
`src/lib/structured-data.ts` becomes appropriate and the tests pass on their own
terms. Until then the honest card is the feature list and the "Register
interest" button, and honesty here is cheap: no council has ever bought
anything on the strength of a price on a card.

---

## 10. Growth targets

| | Villages | Residents | Reports | Revenue | The thing that actually has to be true |
|---|---|---|---|---|---|
| **Month 1** | 1 | 10 | 5+ | £0 | Histon files a real report and the coordinator does not need help to publish it |
| **Month 3** | 5 | 50 | 30+ | £0 | One village joined because another village recommended it |
| **Month 6** | 15 | 200 | 100+ | first paying council | A clerk asked what it costs before we said |
| **Month 12** | 50 | 1,000 | 500+ | ~£750 MRR | 50 coordinators still moderating, which is the real ceiling |

**£750 MRR at month 12 is 50 villages × £15.** That is every village paying, and
it will not be — the free community tier is the acquisition channel and most
villages have no council and no budget. Treat £750 as the ceiling and plan
against something nearer a third of it. The number that matters at month 12 is
coordinator retention, not MRR: the product is 50 volunteers' unpaid evenings,
and if they stop, everything else stops with them.

**The counter-metric.** Watch **villages activated with zero reports after 30
days**. It is the number that will look like growth and is not, and it is the
one a grant report should carry beside the headline count.

---

## 11. Grants as marketing

Each grant validates the product independently, funds the runway, and produces
case-study material with somebody else's name on the credibility. `docs/FUNDING.md`
is the tracker; this is what each is worth as *marketing*.

| Pipeline | Status | Marketing value |
|---|---|---|
| **UKDI** | Reported as **submitted, awaiting Stage 1 review** | Not tracked in `docs/FUNDING.md` — **add it as P6 with the submission date and what was claimed**, so the claims are checkable against the code like every other application |
| **PCC Prevention / Community Safety Fund** | Application drafted, needs a sponsor | The one that matters most in Phase 2. A PCC-funded scheme is a fact a parish clerk trusts immediately. £500–£35,000, rolling — the sponsor is the blocker, and a pilot village's PCSO is the obvious one |
| **NL Community Fund — AI programme** | Window expected autumn 2026. Draft written: `docs/GRANT_APPLICATION_NL_AI.md` | £3m pot UK-wide. Prepare now; the draft has already been rewritten against sixteen findings and is checked against the codebase |
| Neighbourhood Watch Community Grants | Not started | £100–£300. Small money, and the *relationship* with the national body is the point |
| NL Awards for All | Not started | Up to £10,000, rolling, applicable any time |
| Innovate UK Smart Grants | Not started | £25k–£500k. Phase 3 at the earliest |

**Three rules for anything written into an application:**

1. **A grant application is a statement about how the code behaves.** Change the behaviour, change the document — the same rule `/privacy` is held to.
2. **Check every claim against `docs/FUNDING.md`'s claims table**, which exists because a previous draft claimed data was all held in the UK (it is *stored* in the UK; three processors are not), that pattern detection was AI (it is a radius query and a count), that a coordinator can share any incident (published only, coordinators only), and that the Histon pilot was under way (no village had been activated).
3. **Every third-party figure has a date it was read.** Re-verify before reuse; the "External figures" table at the foot of `docs/FUNDING.md` lists all seven and what to check each against.

---

## 12. What to do this week

In order. Each unblocks the next.

1. **Start the ICO registration.** Longest lead time and L2 cannot close without it.
2. **Decide the pilot's mode.** Recommend `community` — it takes A1, A2 and a council's review of the DPIA off the critical path and replaces them with one agreement one volunteer can accept.
3. **Set the three OneSignal variables in Vercel and redeploy.** The public one is inlined at build time, so setting it without a redeploy changes nothing.
4. **Set the OneSignal dashboard's service worker path to `/onesignal/`.** A 404 there reports a healthy init that never delivers.
5. **Clear the seed village** (`your-village`, join code `VILLAGE1`) and **activate Histon** in the same sitting.
6. **Commit the pitch message** and **write the resident quick start**. One page, six steps, 999 line at the foot.
7. **Walk the coordinator through the compliance screen** and confirm reporting actually opens. Nobody has ever done this.
8. **File one report end to end and receive one push.** That is Phase 0's exit criterion and everything in this document waits behind it.

Then, and only then, create the Facebook Page.
