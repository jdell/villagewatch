# VillageWatch — launch blockers

**Audited:** 25 August 2026 against `main` at `v0.1.43`.
**Re-audited:** 27 August 2026 against `main` at `v0.1.46`, on
`fix/launch-blockers`.
**Scope:** the five items standing between the code as it is today and a real
resident filing a real report in a real village.

This is the operational companion to `BACKLOG.md`'s "Launch Blockers" table.
That table tracks the *items*; this file records what was actually verified on
25 August, what each blocker costs to clear, and in what order. Where the two
disagree, check the code before believing either — several entries in
`BACKLOG.md` were true when written and stopped being true without being
corrected, which is the failure this audit exists to catch.

**This document is read by people and rendered by nothing.** Unlike the five
documents in `docs/` that the app renders from disk, it needs **no**
`outputFileTracingIncludes` entry in `next.config.ts`.

---

## Summary

| # | Blocker | Code | Operationally | Blocks the pilot? |
|---|---------|------|---------------|-------------------|
| **L1** | DPIA and the compliance pack | Complete — gate is live and enforcing. **A10 written 27 Aug**; A4 found already written | Nothing accepted, nowhere | **Yes** — but see the community-mode finding below |
| **L2** | `DATA_CONTROLLER` placeholders | **Resident-facing half closed 27 Aug** — no placeholder reaches `/privacy` or `/terms`, asserted by a test | Controller still unnamed; ICO registration not started | **Yes**, and the ICO registration is the long lead |
| **L3** | Village activation from cold | Complete and audited since 27 Jul; join-code enforcement fixed 13 Aug. **CLI added 27 Aug** | **Never run.** No village has ever been activated | **Yes** |
| **L4** | OneSignal push | Complete; three env vars blank | Credentials missing in Vercel; no push ever delivered | **Yes** for the alert leg |
| **L5** | Coordinator flow end-to-end | **Named test-suite gap closed 27 Aug** — the queue is asserted. The chain is still untested | Never exercised against a database | **Yes** |

### What the 27 August pass changed

Five things, and the boundary between them and the rest is the point: everything
below is code or a document, and **not one of them activates a village, accepts
an agreement, registers with the ICO or delivers a push.** Those five remain
manual and are listed under each blocker.

| Change | Blocker | Where |
|---|---|---|
| `POST /api/incidents` route test — 23 assertions, including that auto-approve **off** files `PENDING_REVIEW` and that a failed read of the setting fails closed to the queue | L5 | `tests/incident-create-route.test.ts` |
| No placeholder reaches a resident: `/privacy` and `/terms` branch on whether the fallback is filled in, and name the operator as a working contact where it is not | L2 | `src/lib/constants.ts`, both legal pages, `tests/legal-placeholders.test.tsx` |
| Personal data breach procedure — DPIA action **A10**, the only blocker action with no document at all | L1 | `docs/BREACH_PROCEDURE.md` |
| Village activation from a terminal, dry-run by default, reusing the audited functions rather than reimplementing them | L3 | `scripts/activate-village.ts` |
| DPIA action statuses corrected — **A4 was recorded as "Not started" and was substantially written** | L1 | `docs/DPIA.md` §9.1 |

**The finding worth carrying forward: A4 was not started, it was unrecorded.**
`docs/COORDINATOR_GUIDE.md` covers every ground A4 names — what to reject, a
report about a child, the "house with the blue door" identification, and the
consequences of misusing access — and has since it was written. The DPIA said
*Not started* for a month. That is the second time in this project a status line
outlived its own truth (the first was L3's join-code enforcement), and it is why
this document opens by telling the reader to check the code before believing
either file.

**The one finding that changes the critical path:** `Village.mode` defaults to
`community`, and a community village accepts **one** document rather than three.
Most of L1's weight — the council's Appropriate Policy Document, the
countersigned Article 28(3) agreement, the council's own review of an Article 35
assessment — is the *council* model's, and Histon does not have to launch as one.
See L1 below. This is the difference between a pilot gated on a parish council
meeting and a pilot gated on one volunteer reading one agreement.

**Clearing order.** L2 → L1 → L3 → L4 → L5. L2 first because it is an hour of
work and both L1 and L3 print its output; L5 last because it is the verification
pass that proves the other four landed.

---

## L1 — DPIA and the compliance pack

**Status:** code complete and *enforcing*; paperwork drafted and unsigned.

### What is done

`docs/DPIA.md` exists and is substantial — 12 assessed privacy risks, nine
medium and three low, **none rated high after mitigation**, with the conclusion
that the processing may proceed with the mitigations in place and that prior
consultation with the ICO is therefore not required.

The compliance gate that sits on top of it is fully built and **live**:

- `src/lib/compliance.ts` resolves three states — not accepted (blocks),
  accepted (allows), and columns-not-present (allows, loudly, because an
  unapplied migration is a deployment fault rather than a council's decision).
- `/dashboard/compliance` renders whichever documents `Village.mode` calls for,
  in full and expanded, through `src/lib/markdown.ts`.
- `POST /api/incidents` and `POST /api/incidents/process` both 403 before
  parsing a body when the gate is closed.
- `tests/compliance.test.ts` and `tests/compliance-documents.test.ts` assert the
  three states, the one-way write, all three council documents being required,
  the community model's single agreement, and that **both** agreements carry all
  eight Article 28(3) obligations.

All four documents are written and load and parse: `DPIA.md`, `APD_TEMPLATE.md`,
`DATA_PROCESSING_AGREEMENT.md`, `COMMUNITY_DPA.md`. All four are named in
`outputFileTracingIncludes`.

### What is needed

**The document header still reads `DRAFT TEMPLATE — not yet reviewed or signed
off`, version 0.1, prepared 27 July 2026, "Reviewed by: *(pending)*", "Signed
off by: *(pending)*".** That is accurate and is the blocker.

Its §9 carries five actions marked **Blocker / Before launch**:

| Action | What it is | Status as at 25 Aug |
|---|---|---|
| **A1** | Adopt an Appropriate Policy Document under DPA 2018 Sch 1 Pt 4 for criminal offence data | Template drafted, not adopted |
| **A2** | Execute a written Article 28(3) processing agreement with Yakasista Ltd | Template drafted, in the gate, **unsigned by either party** |
| **A4** | Coordinator terms and review guidance — what to reject, reports about a child, misuse consequences | **Not started** |
| **A5** | Replace the placeholder controller details and ICO registration number | Placeholders in place — this is L2 |
| **A10** | Personal data breach procedure — detection, 72-hour ICO notification, who decides | **Not started** |

And four more rated **High / Before launch**: A9 (verify Anthropic's transfer
mechanism, training exclusion and retention, and record the date checked), A11
(verify the OneSignal DPA and its transfer mechanism), A12 (consult residents),
A6 (run a deletion and an overnight housekeeping pass against real data and
confirm the photographs are genuinely gone), A7 (decide what happens to the
Supabase `auth.users` sign-in record on account closure), A8 (either enforce the
audit-trail and dormant-account retention periods or amend the notice), A14
(remove the sample demonstration data — this is L7). A13 (Article 30 record of
processing) is Medium/before launch; A3 (Slack) is Medium/before a *second*
parish; A15 is post-launch.

### The finding that shortens this

**Run Histon in `community` mode and A1, A2 and the council's review of the DPIA
come off the pilot's critical path.**

`Village.mode` defaults to `community`. In that model the *coordinator* is the
data controller — which is what they already are in fact — and the gate asks for
one document, `docs/COMMUNITY_DPA.md`, which folds the Article 28(3) processing
terms and the Schedule 1 paragraph 5 policy document into a single agreement
written for a volunteer. It is in force on acceptance, with no paper
countersignature to wait on. The Schedule 1 paragraph 5 condition is **not**
skipped — it attaches to the processing rather than to the kind of body doing
it, and dropping it would leave the village with no lawful basis at all.

What community mode genuinely does without is the Article 35 assessment, and
`DPIA.md`'s own header note explains why that is a judgement rather than an
omission: §8 rates no risk high after mitigation, and a community village runs
the same software with the same safeguards.

**What this does not remove.** A4 (coordinator review guidance), A10 (breach
procedure) and A5/L2 (real controller details) apply in both models — in
community mode they apply to the *coordinator*, who is now the controller and
personally owes them. `ControllerDuties` already renders the three duties with a
deadline on the community compliance screen and on `/admin/villages`, so the
volunteer is told; being told is not the same as having a procedure.

### Action items

- [ ] **Decide the pilot's mode.** Recommend `community` for Histon. Record the decision here with the date.
- [x] ~~Write **A4** — coordinator review guidance.~~ **Found already written, 27 Aug.** `docs/COORDINATOR_GUIDE.md` §"Rejecting" is the decision list, and it names all four grounds A4 asks for including a report about a child; §"Privacy responsibilities" covers misuse. The DPIA's status line was stale rather than the work being missing. **Still outstanding:** the controller adopting it as its own coordinator terms, and a stated consequence for a coordinator who misuses access — the guide says what not to do and not what happens if you do.
- [x] ~~Write **A10** — breach procedure.~~ **Written 27 Aug**, `docs/BREACH_PROCEDURE.md`. Both models, the three clocks (24h processor → controller, 72h controller → ICO, without-undue-delay → residents), containment a coordinator can do themselves, the risk test, the Article 33(5) record template, and five named gaps. **Still outstanding:** §2 needs a named decision-maker and a deputy — *[Controller to complete]* — and it has never been rehearsed.
- [ ] Close **A9** and **A11** — read Anthropic's and OneSignal's current terms, record the transfer mechanism and the date checked. Both are marked `[verify]` inside `DATA_PROCESSING_AGREEMENT.md` today.
- [ ] Have the coordinator accept `COMMUNITY_DPA.md` on `/dashboard/compliance` and **confirm reporting opens** — this has never been done in either model.
- [ ] Only if the pilot runs as `council`: get A1 adopted and A2 countersigned, and put the DPIA in front of the council.

---

## L2 — the `DATA_CONTROLLER` placeholder

**Status, 27 August 2026: the constant is still placeholders and no placeholder
reaches a resident.** Those are two different statements and the distinction is
the whole of what changed.

**30 August 2026 — considered again under VW-19, and deliberately left as it
is.** The obvious move, and the one asked for, was to fill the constant in with
Yakasista Ltd's details. It was not taken, because
`HAS_FALLBACK_CONTROLLER_DETAILS` tests `DATA_CONTROLLER.name`: filling it flips
the flag, and `/privacy` and `/terms` then assert that **Yakasista Ltd is the
data controller**. It is the *processor* in both models — that is what
`docs/DATA_PROCESSING_AGREEMENT.md` and `docs/COMMUNITY_DPA.md` are — and the
community agreement makes the coordinator personally answerable. A notice
contradicting the agreement a volunteer has signed is a worse defect than the gap
it would close, and it is the specific mistake CLAUDE.md's legal-pages section
warns about by name.

Two mechanical consequences, worth writing down for whoever tries it next:

- **The address and the phone would have to be real.** Neither is in the
  repository, and both print on a privacy notice. There is no acceptable
  placeholder for them once the flag is true.
- **The ICO field would print a bracket to the public.** `/privacy` renders
  `ICO registration: {DATA_CONTROLLER.icoRegistration}` inside the same branch,
  and `tests/legal-placeholders.test.tsx`'s "renders no bracketed placeholder at
  all" catches it. Fill the ICO number *with* the rest, or give that line its own
  conditional first.

So what remains under L2 is unchanged and is not a code change: **register with
the ICO**, and **name the controller for the first pilot village** — under
`community` mode that is the coordinator personally, which `COMMUNITY_DPA.md`
already says, so the answer exists and only needs writing down. The source now
says which of the six fields is the one with a lead time behind it.

`src/lib/constants.ts:1872`:

```ts
export const DATA_CONTROLLER = {
  name: "[Data controller name]",
  addressLines: [
    "[Data controller address line 1]",
    "[Town]",
    "[Postcode]",
  ],
  email: "[contact@example.uk]",
  phone: "[01234 567890]",
  /** Registration number from the ICO's public register. */
  icoRegistration: "[ICO registration number]",
} as const;
```

### What has changed since it was raised

Two things, and neither closes it.

**The placeholders are mode-neutral now.** `name` read `[Parish Council name]`
until the community model landed. That was a real bug rather than a wording
preference: most villages have no council, so the fallback was asking the
majority for a body that does not exist — which is precisely how the field stays
empty and the placeholder ships. It names the *role* both models agree on now.
Still visibly a placeholder; it just no longer describes the wrong kind of
village.

**`Village.parishCouncil` narrows the blast radius.** A coordinator can name
their own controller on `/dashboard`, and `reportController` in
`src/lib/community-report.ts` prefers it on a truthiness check. That fills the
footer of every police and council document — the period report, the PDF and the
single-incident summary. `/reports` shows an amber warning when the footer would
print the placeholder.

### What was fixed on 27 August

`/privacy` and `/terms` printed the placeholders **verbatim, to the public**. A
resident looking for where to send a subject access request was given
`[contact@example.uk]`; `/terms` told them "neither VillageWatch nor
[Data controller name] is liable". That is a broken right-of-access route on a
live page, and bracket text is the worst shape for it to take — most people read
it as a rendering fault rather than as a gap somebody has to fill, so nobody
reports it.

It survived eight weeks because "fill in the constant" was never the whole fix.
**The controller genuinely differs per village** — a parish council in one model,
the coordinator in the other — and these two pages are public and sessionless, so
they cannot read a village to find out which. There is no single true name to put
there.

So both pages branch instead, on `HAS_FALLBACK_CONTROLLER_DETAILS`:

- filled in, they print the details exactly as before;
- unfilled, they say the controller is per village, tell the reader to ask their
  coordinator, and give **Yakasista Ltd at info@yakasista.com** as a route that
  always works — clearly labelled the *processor*, which it is;
- `CONTROLLER_LABEL` carries the six sentences on `/terms` that name the
  controller, saying "your village's data controller" until there is a name.

`tests/legal-placeholders.test.tsx` renders both pages to a string and asserts no
bracketed placeholder survives, that there is always a working `mailto:`, and
that `DATA_CONTROLLER` is filled in **for every field or none** — a half-filled
object being the state that would slip a placeholder past the name check.

**Yakasista Ltd is named as the processor and deliberately not as the
controller.** It is not the controller in either model, `COMMUNITY_DPA.md` makes
the coordinator personally answerable, and a privacy notice asserting otherwise
would contradict the agreement the coordinator signs.

### Where it still leaks

- **Nobody has decided who the controller is.** That is the actual blocker and no code change reaches it.
- **No ICO registration.** A separate act with a fee, not a string to type, and the longest lead item on this page.
- Any village that has not filled in `Village.parishCouncil` still prints `[Data controller name]` on documents addressed to a PCSO. Left as-is deliberately: `/reports` already shows an amber warning, and a police report is read by somebody who can act on a visibly unfinished field, unlike a resident.

This is **DPIA action A5**, now recorded there as partly closed and still a
Blocker.

### Action items

- [ ] Decide who the controller is for the pilot. In `community` mode this is the Histon coordinator personally, at an address they are willing to publish.
- [ ] **Register with the ICO** if not already registered, and obtain the registration number. This is the long-lead item — do it first.
- [ ] Fill in all six fields in `DATA_CONTROLLER`. **All of them or none** — the test asserts it, because a real name above an address reading `[Town]` is the state that puts a placeholder back on the page.
- [ ] Set `Village.parishCouncil` for Histon on `/dashboard` so the report footers name it too.
- [ ] Re-read `/privacy` §1 and `/terms` §1 end to end with the real values in place, and have whoever is now the controller review them. `/privacy` makes nine claims about how the code behaves; the controller is the person answerable for them.

---

## L3 — village activation from cold

**Status: code complete since 27 July, enforcement fixed 13 August, and it has
never been run.**

### What is done

`src/lib/villages.ts` is the one village module and does the whole lifecycle:

- `activateVillage` — mints a join code, flips `PENDING` → `ACTIVE`, optionally appoints the first coordinator by email. Guarded on `isPlatformAdmin` and on the status just read; audited.
- `regenerateJoinCode` — rotates a code that has ended up somewhere it should not.
- `appointCoordinator` — the promotion the application flow structurally cannot perform, because an application comes *from* a resident and a cold village has none.
- `checkVillageJoin` — the join test.

`/admin/villages` (`page.tsx` + `actions.ts`) is the screen. `InviteShare` on
`/dashboard` is where the coordinator gets the link, the code and the QR;
`/join/[slug]` and `/invite/[slug]` are where a scan lands.

**The enforcement half was broken for seventeen days and is now fixed.** "The
registration routes require the code whenever a village has one" was written in
`BACKLOG.md` on 27 July and was not true until 13 August — `checkVillageJoin`
was never called, and both auth routes accepted a blank join code.
`tests/village-join.test.ts` now asserts the blank code, the empty string,
normalisation, the legacy null, and status refusing before the code is looked
at. There was also a second, dead copy of the module at `src/lib/village.ts`
until 13 August; there is one module now.

### What is needed

Nothing in the code. Everything in the operation:

- **270 Cambridgeshire parishes are seeded and all are `PENDING`.** They cannot be joined and do not appear in the village picker, which queries `status: "ACTIVE"` on both `/register` and `/welcome`.
- **The only `ACTIVE` village is `prisma/seed.ts`'s placeholder**, named "your-village", with five invented incidents and the hardcoded join code `VILLAGE1`. That is the village a real resident would land in today. This is **L7**, and it is entangled with L3 rather than separate from it: activating Histon without dealing with the placeholder leaves two villages live, one of them fictional.
- **No village has ever been activated through the screen.** `PROJECT_STATE.md` records that a grant draft claimed the Histon pilot was under way and that this was corrected — no village has ever been activated.

### What was added on 27 August

`scripts/activate-village.ts`, run as
`npm run db:activate-village -- --slug histon-cambridgeshire --admin <email>`.
**Dry run by default**, like `clean-village.ts`; `--confirm` writes.

It exists because of the bootstrap, and it is the same bootstrap `ADMIN_EMAILS`
exists for. Activating the *first* village through the screen needs a browser, a
session, `ADMIN_EMAILS` set on the deployment **and a redeploy for it to take
effect** — of which the last turns a five-minute operational step into a deploy
cycle. That is a fair part of why 270 parishes have been `PENDING` since 27 July
with complete, audited code to activate them sitting unused.

Three things about it are worth knowing before it is run:

- **It is the same act, not a second implementation.** It calls `activateVillage`
  and `appointCoordinator` unchanged. It does not reimplement minting, the status
  guard or the audit rows — a divergent second copy of a privileged write is how
  you get a village with a status and no code, which `checkVillageJoin` lets
  anybody into.
- **It is the same gate.** `--admin` must be in `ADMIN_EMAILS` and must have a
  `User` row (`AuditLog.actorId` is a foreign key, so a trail entry naming
  nobody cannot be written). With `ADMIN_EMAILS` unset it refuses everyone,
  exactly as the screen does. Both refusals were tested against an unreachable
  database, so they are known to happen before anything is read.
- **It reports the compliance gate and cannot open it.** Activating a village
  does *not* let it accept reports; a script that ticked the boxes would record
  an acceptance nobody made. It prints where the gate stands, in bold, because an
  activated village that then refuses every report is the surprise worth heading
  off.

It deliberately has no `--regenerate`: rotating a code from a terminal with no
confirmation of who is holding it is not an improvement on the screen's button.

### Action items

- [ ] Confirm `ADMIN_EMAILS` reaches **Vercel**, not only a local file. It is read at module load and fails closed: unset, nobody is an administrator and `/admin/villages` refuses everyone. The CLI needs it in `.env.local` only, which is the point of the CLI.
- [ ] **Dry-run the activation first:** `npm run db:activate-village -- --slug histon-cambridgeshire --admin <your ADMIN_EMAILS address>`. Read the report — it prints the village's status, resident count, compliance model and gate state before it offers to change anything.
- [ ] Then re-run with `--confirm`, and `--coordinator <email>` to appoint the first coordinator in the same pass. **Record the minted join code somewhere that is not a screenshot** — it is a credential, it is not in the audit trail, and the run that prints it is the only place it appears.
- [ ] Appoint the Histon coordinator by email in the same action.
- [ ] Deal with the seed village (**L7**): `npm run db:clean-village -- --slug your-village` (dry run first), or delete it outright. It must not be reachable when the first real resident registers.
- [ ] Have the coordinator open `/dashboard`, and check the join code, link and QR render.
- [ ] **Print the QR sheet once before printing a hundred.** The print rules force black on transparent inside `[data-print-region]`, which an SVG `fill` is untouched by in theory and a browser could still surprise us over.
- [ ] Watch one scan end to end — camera → `/join/histon-cambridgeshire` → `/register` prefilled → a `VERIFIED_RESIDENT` row. Nothing in the test suite can assert the last step.

---

## L4 — OneSignal push

**Status: code complete, credentials absent, no push has ever reached a device.**

### What was verified

The three environment variables are **blank in `.env.example`** and there is no
`.env.local` on this machine:

```
NEXT_PUBLIC_ONESIGNAL_APP_ID=""
ONESIGNAL_APP_ID=""
ONESIGNAL_REST_API_KEY=""
```

This is consistent with the report that the credentials are missing in Vercel.
The OneSignal app itself exists, so a `skipped: "not_configured"` in a log now
means a missing key rather than a deployment that never had one.

### Why this fails quietly

Every failure mode in this path is silent, which is why it has survived:

- **With no keys the app still works.** The audience is still resolved, the `Notification` rows are still written, the payload is logged, and the caller gets `skipped: "not_configured"`. Publishing a report must never fail because a push did — so nothing anywhere goes red.
- **`NEXT_PUBLIC_ONESIGNAL_APP_ID` is inlined at build time.** Setting it in Vercel needs a **redeploy**; setting it in `.env.local` needs the dev server restarted. Setting it and not redeploying looks exactly like setting it.
- **The two app id variables are the same value** and are split only because the browser SDK can only read a `NEXT_PUBLIC_` one. Setting one and not the other means the browser subscribes to one app while the server pushes to the other. The boot warning is the only thing that says so.
- **The OneSignal dashboard's service worker path must be `/onesignal/`.** `public/sw.js` already owns the root scope, and a scope can have exactly one controlling registration — left at their defaults, whichever registered second silently evicts the other. A 404 on the dashboard path reports a perfectly healthy init that never delivers a notification.

### What depends on it

Four dispatches, and one of them is new and load-bearing for L5:

- the village broadcast on publish (`applyModeration`, and `announce()` under auto-approve);
- **`notifyCoordinatorsOfPendingReport`** — fires on every report filed into a queue. The moderation queue only works if somebody knows it filled up, and this is the only thing that tells them;
- the weekly digest to coordinators;
- `notifyAdminsOfCoordinatorRequest` and the decision back to the applicant.

### Action items

- [ ] Set all three variables in **Vercel**, for Production. `ONESIGNAL_REST_API_KEY` is server-only — never prefix it with `NEXT_PUBLIC_`.
- [ ] **Redeploy**, because the public one is inlined at build time.
- [ ] Set the OneSignal dashboard's service worker fields to match `push-registration.tsx` **exactly**. Settings → Web Configuration → Advanced → Service Workers, "Customize service worker file paths and scope":

  | Dashboard field | Value | Comes from |
  |---|---|---|
  | Path to service worker files | `/onesignal/` | `SERVICE_WORKER.scope` |
  | Main service worker filename | `OneSignalSDKWorker.js` | `public/onesignal/OneSignalSDKWorker.js` |
  | **Updater** service worker filename | `OneSignalSDKWorker.js` | the same file — v16 collapsed the two, and leaving the v15 default `OneSignalSDKUpdaterWorker.js` here points at a file this repo does not have |
  | Service worker registration scope | `/onesignal/` | `SERVICE_WORKER.scope` |

  The updater row is the one that catches people: it is a separate field, it
  defaults to a filename that does not exist here, and a 404 on it reports a
  perfectly healthy init that never delivers. Confirm with
  `curl -I https://villagewatch.app/onesignal/OneSignalSDKWorker.js` — a 200 is
  the only acceptable answer, and it is worth checking before believing the
  dashboard.
- [ ] Set the OneSignal site URL to `https://villagewatch.app` — one of the three places outside the repo that name the canonical host and all of which fail quietly if they disagree.
- [ ] Subscribe on a real phone and **deliver one push**. Watch the `[push:client]` and `[push:*]` console breadcrumbs; SETUP.md §8 is the checklist.
- [ ] Confirm the deep link opens the right report on the device, not just that the notification arrives.

---

## L5 — the coordinator flow, end to end

**Status: every part is built, no part of the chain has been exercised against a
database, and the suite now covers the one step it was said not to be able to.**

### The chain to verify

Resident files → `PENDING_REVIEW` → coordinator is pushed → coordinator reviews
→ approve → `PUBLISHED` → village broadcast → the report is on the map and in
the list.

### What is unverified, in the order it is likely to surprise

1. **That the compliance gate opens.** No acceptance has ever been recorded in either model. Until one is, a village refuses every report with a 403 before the body is parsed — so step one of the chain does not run at all. This is the L1 dependency and it is first for a reason.
2. ~~**That a village with `autoApprove` off actually queues.**~~ **Closed in code, 27 Aug** — `tests/incident-create-route.test.ts`, 23 assertions. It turned out not to need a database at all: mocking Prisma, the session, the compliance gate and the two notification dispatches at their boundaries leaves the route's own decisions exercisable, which is what `retention.test.ts` and `incident-vote-route.test.ts` already do. The suite still runs with no secret and no environment.

   Two decisions in it are worth knowing. `getVillageAutoApprove` is left **real**, with its `SELECT` mocked, so "a database error means the queue" is exercised through the route rather than asserted against a stub told to return false. And the test was **mutation-checked**: replacing `autoApprove ? "PUBLISHED" : "PENDING_REVIEW"` with a bare `"PUBLISHED"` fails four of its assertions, so it is known not to pass vacuously.

   What a unit test still cannot tell you is whether the *row in Postgres* comes back `PENDING_REVIEW`, which is item 2 of the by-hand list below.
3. **That the coordinator is told.** `notifyCoordinatorsOfPendingReport` is the newest dispatch and depends entirely on L4. Without it the queue fills silently and the flow stalls at step two with nothing on any screen to say so.
4. **That approval publishes and fans out.** `applyModeration` owes four things at once — the village push, the WhatsApp Channel log line, the staff Slack line and an `incident.publish` audit row. `announce()` in `POST /api/incidents` is where the same set lives for the auto-approve path; the two have to stay in step and nothing tests that they do.
5. **The AI pass against a real report.** Every failure is a 200 with `ok: false` and the wizard falls back to the reporter's own wording — so a broken key looks like a working wizard producing unanonymised text. Watch `anonymized` on the first report.
6. **On-device face blur against a real photograph.** There is no server-side fallback by design, so this either works in that reporter's browser or the upload does not happen. Nobody has uploaded a photograph with a face in it at a level somebody chose.
7. **The alert a coordinator pastes.** The copy button is the one surface an unauthenticated stranger can read. Watch a report where the AI pass did not run: `anonymized` is false, the description is the reporter's own wording, and the red warning on the panel is the only thing between it and a public feed.

### Action items

- [ ] Clear L1 (accept the agreement) and L4 (push) first — L5 cannot run without them.
- [ ] File a report as a real resident on a real phone. Attach a photograph with a face in it. Check the blur before submitting.
- [ ] Confirm the status is `PENDING_REVIEW` and that the coordinator's phone rings.
- [ ] Approve it. Confirm `PUBLISHED`, the village broadcast, the map pin, the list entry, and the `incident.publish` row in `/dashboard/audit`.
- [ ] Read the reporter's original wording once through the queue's reveal button, and confirm an `incident.raw_viewed` row appears against it.
- [ ] Paste one alert into a **test** channel and read what actually lands.
- [ ] Then, and only then, turn auto-approve on in a second test and confirm the other path files as `PUBLISHED` with `autoApproved: true` and no `before` on the audit row.
- [x] ~~Write the route test for item 2 above.~~ Done 27 Aug, and it did not need the database it was assumed to need. What is left for the by-hand pass is confirming the **stored row** matches what the route decided — the test asserts what was handed to `incident.create`, not what Postgres did with it.

---

## Adjacent items that are not on this list

They are not blockers and are recorded here so they are not mistaken for some.

- **L6 — migrations.** Done. Thirteen of fourteen applied; `20260823120000_incident_votes` lands with the voting branch. `rls_policies.sql` **must** be re-run with it — a new table arrives with RLS off, and here that means the anon key could read who thought which of their neighbours' reports was overblown. `PROJECT_STATE.md` also records that re-running `rls_policies.sql` after the police-data merge is still to be confirmed. Confirm both with `npx prisma migrate status` rather than believing any file.
- **L7 — the sample seed village.** Open, and folded into L3's action list above because activating Histon without clearing it leaves a fictional village live beside a real one.
- **L8 — the Article 28(3) agreement.** Template drafted, in the gate, unsigned by either party. It is DPIA action A2 and is a council-model blocker; in community mode `COMMUNITY_DPA.md` replaces it and needs one signature.
- **No cron has ever fired** — not the weekly digest, not the nightly retention sweep, not the police-data sync. The retention job deletes files and takes reports off the map, and DPIA action A6 asks for exactly one supervised run against real data before it is trusted.
- **No email has been delivered to a real inbox**, and Supabase's own auth emails are still on the built-in mailer, whose hourly quota is low and shared across every flow. `docs/SUPABASE_EMAIL_SETUP.md` is the procedure. A village onboarding a dozen households in one evening will exhaust it.
