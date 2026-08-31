# VillageWatch — go-to-market plan

**Written:** 25 August 2026 against `v0.1.43`. **Revised:** 31 August 2026
against `main` at `v0.1.49`. **Live at:** https://villagewatch.app

This is the plan for getting VillageWatch from a deployed application with no
users to a product a parish clerk pays for. It covers positioning, the
acquisition funnel, the channels, the content, the numbers to watch and the
pricing to test.

**Read `docs/LAUNCH_BLOCKERS.md` first.** It listed five things standing
between the code and the first real resident. **Three of them remain** — L1, L2
and L3 — plus L5, which is the verification pass proving the other three landed.
None of the marketing below matters until they are cleared. Phase 0 is that
list, and §0 below is what has moved under it since this plan was written.

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

## 0. What changed since 25 August

**Six days of releases and no operational movement whatever.** That is the
finding this revision exists to record, and it is the only thing on this page
that decides whether any of the rest of it happens. The plan was written on
25 August against a pilot that had not started. It is 31 August and the pilot
has not started:

- **No village has ever been activated.** L3's code has been complete since
  27 July — **thirty-five days** — and has never been run. All 270 seeded
  Cambridgeshire parishes are `PENDING` and there is no `ACTIVE` village at all.
- **No compliance acceptance of any kind has ever been recorded**, in either
  model. The gate is live and enforcing, so every village in the directory is
  refusing reports right now with a 403 before the request body is parsed.
- **The chain in L5 has never been walked.**

None of that is a code problem, and none of it can be fixed by writing more
code. Every remaining item is an act somebody has to perform once.

### What closed

| | What | Where |
|---|---|---|
| **L4** | **Push works.** OneSignal delivers to a real device — 31 August. Nothing in the application changed and nothing could have: every condition was a Vercel variable, a redeploy or a field in the OneSignal dashboard, which is why it sat open for a month against correct code. **This removes one of L5's two dependencies** | `BACKLOG.md` B3/L4 |
| **L7** | **The seed village was never there.** "Clear the placeholder village before activating Histon" was an inference from the seed script existing, repeated across three documents for a month. `prisma/seed.ts` has only ever been run against local scratch databases. The first activation therefore lands in an empty directory with nothing to clear out of its way | `BACKLOG.md` L7 |
| **L2, in part** | `DATA_CONTROLLER` is filled in — Yakasista Ltd, an address, an email and the ICO application reference — published as the **operator's** contact route in a box saying in bold that it is not the controller. `/privacy` now answers Article 13. It still names no controller, because that is per village | PR #22, 30 Aug |
| — | **A security audit of the whole tree**, 29 August: 34 findings, **none Critical**, four High. Six were closed the next day in PR #22 — the four High plus VW-15 and VW-16 | `docs/SECURITY_AUDIT_2026-08-29.md` |
| — | **The resident quick start is written**, with a printable PDF beside it. Both are **uncommitted on the working tree** as at 31 August — see §5 | `docs/RESIDENT_QUICK_START.md` |
| — | **The first cron in the project's life fired** — the police-data sync, 22 August. It came back 429 for every village, cost two bug fixes, and the outbound pace is now 1/s rather than the documented 15/s. **No village holds a month of police figures yet** | `PROJECT_STATE.md` |
| — | Two product surfaces landed after this plan was written and both are resident-facing: the **coordinator's five tabs** (PR #16) and **incident voting** (N19) — the latter is on every published report and the resident quick start describes it | `BACKLOG.md` N20, N19 |

### What did not

**L1** — nothing accepted, anywhere. **L2's remainder** — the ICO registration
(application **C2018564**, pending, and the longest lead item on the whole list),
the pilot village's named controller, and a review of the notice by somebody with
UK data-protection standing. **L3** — never run. **L5** — never walked. The
**pitch message** is still not in the repository (§5). There is still **no
analytics** (§8) and **no blog** (§7).

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

### A fifth claim, available since 30 August, and the exact words for it

The whole tree was reviewed for security on 29 August — 34 findings, **none
rated Critical** — and six were closed the next day, including all four rated
High. That is a fair thing to tell a clerk and a fair thing to hand over:
`docs/SECURITY_AUDIT_2026-08-29.md` is written to be read.

**Say "an internal source-level review".** That is what it was: manual review of
the source, plus `npm audit`. No dynamic testing, no authenticated scanning, no
third-party penetration test and no access to the Supabase, Vercel, OneSignal or
Resend dashboards. A clerk who hears "audited" and later finds out it was
written in-house has been misled by a sentence that was true, which is the exact
failure mode §11's rules exist to prevent.

### What not to say

- Not "GDPR compliant" — that is not available until L1 and L2 close.
- Not "trusted by N villages" until somebody can point at the list. `VILLAGES_LIVE` is null and the landing page renders no figure, which is the right way to be wrong.
- Not "£15 per month" anywhere public until there is something to charge with. See §9.
- Not "the Histon pilot is under way" until a village is activated. A grant draft claimed this and it was corrected. **It is still true on 31 August**, and it is the claim most likely to be made carelessly now that the plan itself has been written down.
- Not "penetration tested", "independently audited" or "third-party verified". See above.
- Not "here is what the police figures say about your village" until a sync has actually completed for it. The cron has fired once, came back 429 for every village, and no village holds a month of data.

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

| | Blocker | State on 31 August | The short version |
|---|---|---|---|
| **L1** | Compliance acceptance | **Open** | Gate is live and enforcing; **nothing accepted anywhere, in either model**. Run the pilot in `community` mode and it is one document, one volunteer, in force the moment it is accepted — not three documents waiting on a council meeting |
| **L2** | Controller and ICO | **Narrowed** | The constant was filled in on 30 August as the **operator's** contact route, so no placeholder reaches a resident. What is left is not code: the ICO registration (**C2018564, pending**), naming the pilot village's controller, setting `Village.parishCouncil`, and a review by somebody with UK data-protection standing |
| **L3** | Village activation | **Open — thirty-five days** | Code complete since 27 July and never run. `npm run db:activate-village -- --slug histon-cambridgeshire --admin <email>` is dry-run by default and needs no browser, no session and no redeploy |
| ~~L4~~ | ~~OneSignal push~~ | **Closed 31 Aug** | A push reaches a real device |
| **L5** | Coordinator flow | **Open** | Never walked against a database. **L1 and L3 are now the only things in front of it** |

~~Plus **L7**~~ — **closed 31 August as a wrong premise.** There is no sample
seed village in the live database and there never was; `prisma/seed.ts` has only
ever run against local scratch databases. So nothing has to be cleared before
Histon is activated, and there is no `ACTIVE` village at all rather than a
fictional one.

**Exit criterion:** unchanged — one real report filed by a real resident in
Histon, reviewed by the coordinator, published, and a push notification received
on a phone. Three of those four legs have never run; the fourth now has a
working transport under it.

**The whole of Phase 0 is one afternoon's work by one person**, and it has not
happened for five weeks. That is worth stating plainly rather than leaving in
the shape of a table: activation is a dry run and a `--confirm`, the compliance
acceptance is a coordinator reading one agreement and ticking one box, and L5 is
filing a report and approving it. What is genuinely slow is the ICO registration,
which is with somebody else and does not block any of the other three.

**The months below run from activation day, not from the calendar.** Written on
25 August, "month 1" meant September; the pilot has not started, so restating a
date that has already passed would be the second time this plan carried one.
**D0 is the day Histon is activated and its coordinator has accepted the
agreement.** Every date in the rest of this section is relative to it, and a
target that slides every time it is missed has stopped being a target.

### Phase 1 — the Histon pilot (D0 → D0 + 8 weeks)

**Target: 1 village, 10 residents, 5+ real incidents.**

Deliberately small. The point of this phase is not growth — it is evidence, and
evidence needs a village where somebody can knock on the door when something
looks wrong.

- Activate Histon — `npm run db:activate-village -- --slug histon-cambridgeshire`, dry run first — and appoint the coordinator in the same pass. **Record the minted join code somewhere that is not a screenshot**: it is a credential, it is not in the audit trail, and the run that prints it is the only place it appears.
- Walk the coordinator through `/dashboard/compliance` in person and watch reporting open. In `community` mode that is one agreement and the coordinator is the controller, which is what they already are in fact — `ControllerDuties` puts the three duties with a deadline on the same screen, and being shown them is not the same as having a procedure. Give them `docs/BREACH_PROCEDURE.md` on the day.
- Recruit 5–10 households through the coordinator's existing group. Face to face or in the group they already read; no advertising.
- Ship the **resident quick start guide** (§5) — written on 28 August, **not yet committed**, and one sentence short of what it needs. Commit it, add the notifications line, print it, hand it over.
- Watch the first of everything, because everything degrades quietly rather than failing: the first AI pass, the first face blur, the first push (the transport works; the deep link opening the right report on the device does not follow from that), the first pasted alert, the first police-data sync, the first retention run, and the first vote.
- **Watch the first signed-in session under the enforcing Content-Security-Policy.** It landed on 30 August and the three surfaces most likely to violate it cannot be reached without a signed-in resident of a live village — the Leaflet tile layer, the MediaPipe WASM face blur and whatever the OneSignal SDK loads after its bootstrap. A blocked script there is a resident who cannot attach a photograph, with nothing in a server log to say so. The audit asks for a fortnight of `CSP_REPORT_ONLY=true` first; Phase 1 is the fortnight it was asking for.
- At week 4 and week 8, sit with the coordinator for half an hour and write down what they actually did, in their words. That is the case-study material and it cannot be reconstructed later.

**What Phase 1 produces:** a testimonial, a screenshot of a real map, a
first-month incident count, and one named coordinator willing to speak to
another village. That last one is the actual product of this phase.

### Phase 2 — the neighbours (D0 + 2 to D0 + 4 months)

**Target: 3–5 more villages, 50 residents total.**

- Approach Impington, Cottenham, Milton, Waterbeach, Oakington — parishes that share a road, a school catchment and a police neighbourhood team with Histon. Shared geography is the whole argument: a pattern that crosses a parish boundary is invisible to two separate WhatsApp groups.
- **The Histon coordinator makes the introduction**, not us. A volunteer telling another volunteer it was worth the evening is the only channel that works at this scale.
- Approach the Cambridgeshire PCC Community Safety Fund (P2 in `docs/FUNDING.md`) with a real pilot behind it rather than a proposal.
- Present at one Histon parish council meeting and ask for a minute recording it. A minuted line in one council's papers is a citable fact for the next five.

**Exit criterion:** a village that we did not personally recruit asks to join.

### Phase 3 — SaaS launch (D0 + 6 months)

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
| **Coordinator guide** | **Exists — 24 pages** | `docs/COORDINATOR_GUIDE.md`, rendered at `/dashboard/guide` and as `docs/VillageWatch-Coordinator-Guide.pdf`. Nine sections from Welcome to Getting help. The PDF is a committed build artefact and goes stale silently — rebuild it in the same commit as the Markdown |
| **Resident quick start** | **Written 28 August — not committed** | `docs/RESIDENT_QUICK_START.md` and `docs/VillageWatch-Quick-Start-Guide.pdf`, both untracked on the working tree as at 31 August. It was one of the three Phase 1 materials and is now a `git add` and one missing sentence — see below |
| **Pitch message** | **Still not in the repo** | Referred to as existing; there is no file, six days after this plan said so. Write it down and commit it — an uncommitted pitch is a pitch that drifts per send and cannot be checked against `docs/FUNDING.md` |
| **Printable invite sheet** | Exists | `/invite/[slug]` — public, `noindex`, needs no account. Print one before printing a hundred |
| **QR invite** | Exists | `InviteShare` on `/dashboard` → Village settings. Link, code, copy, WhatsApp, QR. Never scanned end to end |
| **PDF period report** | Exists | The leave-behind for a council meeting or a PCSO. Never built from a real village's reports |
| **Compliance pack** | Exists — four documents | `DPIA.md`, `APD_TEMPLATE.md`, `DATA_PROCESSING_AGREEMENT.md` and `COMMUNITY_DPA.md`, rendered in full on `/dashboard/compliance`. The clerk-facing proof of §1's fourth point, and the thing to put in front of a council rather than describe |
| **Breach procedure** | Exists | `docs/BREACH_PROCEDURE.md`, written 27 August — DPIA action A10. Deliberately **not** in the compliance gate, because a fourth document there would re-close every village that had been through it. Hand it to the coordinator on the day they become a controller |
| **Security audit** | Exists | `docs/SECURITY_AUDIT_2026-08-29.md`. A leave-behind for a clerk who asks the question in §7's eighth blog post. Describe it as internal — see §1 |

### Resident quick start — written, and one sentence short

`docs/RESIDENT_QUICK_START.md` is the document and
`docs/VillageWatch-Quick-Start-Guide.pdf` is the printable version, generated by
`scripts/generate-quick-start-pdf.tsx` through the same Markdown parser
`/dashboard/guide` renders with. **Both are uncommitted as at 31 August.**
Commit them before either is handed to anybody: a sheet on a doorstep that is
not in the repository is a version nobody can find again, and the printed one is
the one a resident keeps.

Six sections — join your village, find your way around, report what you saw, say
how serious it is, browse the map, stay informed — and it opens with the 999 line
rather than boxing it at the foot, which is at least as prominent and is fine. It
is better than the sketch that stood here, because it describes the vote, which
shipped on 23 August after this plan was written.

**One thing the original six steps asked for is missing, and it is the one that
cannot be repaired afterwards.** Step 4 read: *allow notifications when asked —
this is the one prompt worth getting right, because denying it cannot be undone
from the same website.* The written "Stay informed" section says to turn
notifications on in Settings and does not say what a dismissed browser prompt
costs. A resident who denies it has removed themselves from every alert the
village sends, permanently, from that browser, and neither they nor the
coordinator will ever know. **Add the sentence before it is printed.**

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

- Create the **VillageWatch** Page. Profile image is the shield from `src/components/logo.tsx`; cover is a real map screenshot once Histon has pins on it (not before — a fake map is exactly the kind of claim this document exists to prevent). **There are no pins anywhere yet**, so the cover waits on Phase 0 like everything else.
- About: the one-liner from §1, `https://villagewatch.app`, and Cambridgeshire as the location.
- **Meta Business Suite for scheduling.** Write a week ahead in one sitting, schedule, and never post ad hoc. Two or three posts a week that arrive is far better than five that stop after a fortnight.

### Cadence and mix

**2–3 posts a week**, rotating six types so the Page is not one long advert:

| Type | Frequency | Notes |
|---|---|---|
| Community safety tip | Weekly | Genuinely useful and product-free. This is what gets shared |
| "Did you know" from data.police.uk | Fortnightly | Real Home Office figures for a named area. Cite the Open Government Licence v3.0 — it is a licence condition, not a courtesy. **No village holds a month of these yet**: the cron has fired once and came back 429 for every village, so until a sync completes these figures come from the service's own website by hand rather than from the product |
| Feature explainer | Fortnightly | One feature, plain English, one screenshot |
| Pilot village story | Monthly | Only once there is one. Coordinator quoted by name with permission |
| Pattern insight, anonymised | Monthly | **Never before Phase 2.** See the rule below |
| Coordinator spotlight | Monthly | A volunteer, named, with permission |

### Two Facebook Pages, and conflating them is the mistake

`docs/AUTO_POST_CHANNELS_PLAN.md` was written on 24 August and expanded on the
25th. **Nothing in it is built.** It plans posting a published report to **a
village's own** WhatsApp, Telegram or Facebook Page automatically, replacing the
coordinator's copy-and-paste. This section is about the **VillageWatch** brand
Page, which is a marketing surface and nothing else.

The rule below governs this Page. It does **not** govern a village's own, where
a report is published to the village's own audience, by the village's own
coordinator, under the village's own settings — which is a decision that plan
takes seriously and treats as the sharpest privacy question in it.

Keep them separate in every sense: separate Pages, separate audiences, separate
decisions, and never a marketing post drawn from a village's feed on the grounds
that it is "already public over there". A village of 200 publishing to its own
neighbours has not consented to be a case study.

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

There is no `src/app/blog` route — still true at `v0.1.49`, checked on 31 August. This is a build item, not a content item.
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
`@vercel/analytics`, no PostHog, no Plausible in `package.json`. Re-checked at
`v0.1.49` on 31 August and still true. This is a build item.

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

### The Content-Security-Policy is now a hard constraint on adding one

`src/lib/csp.ts` did not exist when this section was written; it landed on
30 August closing VW-02, and `src/proxy.ts` applies it to every response with a
per-request nonce. It is **enforced** unless `CSP_REPORT_ONLY` says otherwise.
Two consequences for whoever adds the first analytics script:

- **A script whose origin is not in `src/lib/csp.ts` is blocked in production**, and it fails in the worst possible register: the vendor's "waiting for your first data" screen is indistinguishable from a site nobody visited. Add the origin to `script-src` *and* `connect-src` in the same commit — the beacon and the tag are two different directives, which is the mistake the MediaPipe loader already cost this codebase once.
- **`'strict-dynamic'` means a conforming browser ignores host expressions in `script-src` entirely.** Trust propagates from a nonced script to what it loads, which is how the OneSignal SDK gets in through `next/script`. Load an analytics tag the same way rather than pasting a vendor snippet into the layout, or it will work in a CSP2-only browser and nowhere else.

`tests/csp.test.ts` pins the load-bearing directives, so a change that reached
for `'unsafe-inline'` to make a snippet work fails CI rather than shipping.

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

**Counted from activation day (D0), not from the calendar**, for the reason
given in §3. Written on 25 August as calendar months, these were already wrong
six days later: no village has been activated, so month 1 has not begun.
Re-anchoring rather than sliding the dates is deliberate.

| | Villages | Residents | Reports | Revenue | The thing that actually has to be true |
|---|---|---|---|---|---|
| **D0 + 1 month** | 1 | 10 | 5+ | £0 | Histon files a real report and the coordinator does not need help to publish it |
| **D0 + 3 months** | 5 | 50 | 30+ | £0 | One village joined because another village recommended it |
| **D0 + 6 months** | 15 | 200 | 100+ | first paying council | A clerk asked what it costs before we said |
| **D0 + 12 months** | 50 | 1,000 | 500+ | ~£750 MRR | 50 coordinators still moderating, which is the real ceiling |

**£750 MRR at month 12 is 50 villages × £15.** That is every village paying, and
it will not be — the free community tier is the acquisition channel and most
villages have no council and no budget. Treat £750 as the ceiling and plan
against something nearer a third of it. The number that matters at month 12 is
coordinator retention, not MRR: the product is 50 volunteers' unpaid evenings,
and if they stop, everything else stops with them.

**The counter-metric.** Watch **villages activated with zero reports after 30
days**. It is the number that will look like growth and is not, and it is the
one a grant report should carry beside the headline count.

**And the counter-metric for this document.** Watch **days since the last
operational step**. Between 25 and 31 August it was six days against a plan whose
first phase is an afternoon's work, and the six days went into code — a dashboard
redesign, a security audit and its fixes — all of which was worth doing and none
of which moved the pilot one day closer. The failure mode this plan is most
exposed to is not a bad channel or a wrong price. It is a well-maintained
codebase with no users in it.

---

## 11. Grants as marketing

Each grant validates the product independently, funds the runway, and produces
case-study material with somebody else's name on the credibility. `docs/FUNDING.md`
is the tracker; this is what each is worth as *marketing*.

| Pipeline | Status | Marketing value |
|---|---|---|
| **UKDI** | Reported as **submitted, awaiting Stage 1 review** | **Still not tracked in `docs/FUNDING.md`** — re-checked 31 August; that file was last updated on 21 August and still lists five priorities. **Add it as P6 with the submission date and what was claimed**, so its claims are checkable against the code like every other application's. This is the second time of asking, and an application whose claims nobody can check is the one that will be wrong |
| **PCC Prevention / Community Safety Fund** | Application drafted, needs a sponsor | The one that matters most in Phase 2. A PCC-funded scheme is a fact a parish clerk trusts immediately. £500–£35,000, rolling — the sponsor is the blocker, and a pilot village's PCSO is the obvious one |
| **NL Community Fund — AI programme** | Window expected autumn 2026. Draft written: `docs/GRANT_APPLICATION_NL_AI.md` | £3m pot UK-wide. Prepare now; the draft has already been rewritten against sixteen findings and is checked against the codebase |
| Neighbourhood Watch Community Grants | Not started | £100–£300. Small money, and the *relationship* with the national body is the point |
| NL Awards for All | Not started | Up to £10,000, rolling, applicable any time |
| Innovate UK Smart Grants | Not started | £25k–£500k. Phase 3 at the earliest |

**Three rules for anything written into an application:**

1. **A grant application is a statement about how the code behaves.** Change the behaviour, change the document — the same rule `/privacy` is held to.
2. **Check every claim against `docs/FUNDING.md`'s claims table**, which exists because a previous draft claimed data was all held in the UK (it is *stored* in the UK; three processors are not), that pattern detection was AI (it is a radius query and a count), that a coordinator can share any incident (published only, coordinators only), and that the Histon pilot was under way (no village had been activated).
3. **Every third-party figure has a date it was read.** Re-verify before reuse; the "External figures" table at the foot of `docs/FUNDING.md` lists all seven and what to check each against. Every one of them was read in August, and the NL AI window is expected in the autumn — re-verify the pot, the grant size and the route in before that draft is submitted, not after.

**One claim in the pipeline is now available and was not on 25 August**, and it
is the strongest thing on this page for a funder: `docs/DPIA.md` assesses twelve
privacy risks and rates **none high after mitigation**, the compliance pack is
four written documents rendered in the product, and a source-level security
review found nothing Critical. State it exactly as §1 says to — internal review,
DPIA *drafted* rather than signed off, and no "GDPR compliant" until L1 and L2
close.

---

## 12. What to do this week

**Revised 31 August.** Three of the original eight are done and half of a
fourth was never real. What is left is short, and it has been short for five
weeks — which is the argument for doing it in one sitting rather than one item
a week.

### The afternoon that unblocks everything

In order. Each is a precondition of the next, and the whole sequence is one
person at one desk.

1. **Dry-run the activation.** `npm run db:activate-village -- --slug histon-cambridgeshire --admin <your ADMIN_EMAILS address>`. It prints the village's status, resident count, compliance model and gate state before it offers to change anything.
2. **Re-run with `--confirm` and `--coordinator <email>`.** One pass activates Histon and appoints its first coordinator. **Write the minted join code down somewhere that is not a screenshot** — it is a credential, it is not in the audit trail, and that run is the only place it appears.
3. **Sit with the coordinator and accept `COMMUNITY_DPA.md`** on `/dashboard/compliance`. Watch reporting actually open; until this, the village 403s every report before the body is parsed. Give them `docs/BREACH_PROCEDURE.md` and name the decision-maker its §2 asks for — in community mode that is them.
4. **Walk L5's chain once.** File a report from a real phone with a face in the photo, confirm `PENDING_REVIEW`, confirm the coordinator's phone rings, approve it, confirm the map pin, the list entry and the `incident.publish` audit row. That is Phase 0's exit criterion and everything in this document waits behind it.

### In parallel, because none of it blocks the four above

5. **Record the pilot's mode decision** in `docs/LAUNCH_BLOCKERS.md` §L1, with the date. The recommendation is unchanged and step 3 above already assumes it: `community`, which takes the council's Appropriate Policy Document, the countersigned Article 28(3) agreement and a council's review of an Article 35 assessment off the critical path and replaces them with one agreement one volunteer can accept. It has been the recommendation since 25 August and has never been written down as a decision.
6. **Chase the ICO registration** (application **C2018564**) and replace the pending reference when it lands. Longest lead item on the list and it is with somebody else.
7. **Name the pilot village's controller** and set `Village.parishCouncil` on `/dashboard/settings`, so the police and council documents stop falling back to the operator's name in their footer. `/reports` shows an amber warning until this is done, and it is now the *wrong body* rather than a visibly empty field — which is the worse failure of the two.
8. **Commit the resident quick start**, with the notifications sentence added (§5). Print one QR sheet before printing a hundred.
9. **Write and commit the pitch message** (§5). It has been "not in the repo" for six days of it being written down as a gap.
10. **Apply `20260823120000_incident_votes` and re-run `prisma/sql/rls_policies.sql`.** The votes table arrives with RLS off, which would let the anon key read who in a village thought which of their neighbours' reports was overblown. Confirm the same file was re-run after the police-data merge while you are there — `PROJECT_STATE.md` still lists that as unconfirmed.
11. **Re-run the police-data sync by hand** for Histon once it is active — `?village=histon-cambridgeshire` with the secret — and read the response. The first scheduled run came back 429 for every village; the pace is 1/s now and nothing has confirmed that is enough.

### Then, and only then

12. **Create the Facebook Page** (§6), with a cover image taken from a map that has real pins on it.
13. **Start the blog** (§7) and **ship Plausible** (§8), remembering that the analytics origin needs a line in `src/lib/csp.ts` or it reports nothing, silently.
14. **Add UKDI to `docs/FUNDING.md` as P6** (§11).

### What has come off the original list

- ~~Set the three OneSignal variables in Vercel and redeploy.~~ **Done.** Push reaches a real device (31 August).
- ~~Set the OneSignal dashboard's service worker path to `/onesignal/`.~~ **Done**, all four fields including the updater filename, which is the one that catches people. `curl -I https://villagewatch.app/onesignal/OneSignalSDKWorker.js` is the standing check, worth re-running after any dashboard change.
- ~~Clear the seed village.~~ **Never necessary** — there was no seed village in the live database and there never was. That was half of the original item 5; the activation half is item 1 above.
- ~~Start the ICO registration.~~ **Submitted** — C2018564, pending. Item 6 above is the chase, not the start.

Everything else on the original list is still on it, six days later.
