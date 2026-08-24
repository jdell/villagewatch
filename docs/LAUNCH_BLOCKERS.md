# VillageWatch — launch blockers

**Audited:** 25 August 2026 against `main` at `v0.1.43`.
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
| **L1** | DPIA and the compliance pack | Complete — gate is live and enforcing | Nothing accepted, nowhere | **Yes** — but see the community-mode finding below |
| **L2** | `DATA_CONTROLLER` placeholders | Still placeholders, verified in source | `/privacy` reads them today | **Yes** |
| **L3** | Village activation from cold | Complete and audited since 27 Jul; join-code enforcement fixed 13 Aug | **Never run.** No village has ever been activated | **Yes** |
| **L4** | OneSignal push | Complete; three env vars blank | Credentials missing in Vercel; no push ever delivered | **Yes** for the alert leg |
| **L5** | Coordinator flow end-to-end | Complete; untested as a chain | Never exercised against a database | **Yes** |

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
- [ ] Write **A4** — coordinator review guidance. Much of it already exists in prose in `docs/COORDINATOR_GUIDE.md` §"Managing incidents" and §"Privacy responsibilities"; what is missing is the decision list a coordinator can act from and the consequences of misuse.
- [ ] Write **A10** — breach procedure. One page: how a breach is noticed, who is told within 72 hours, who decides, and what a resident is told.
- [ ] Close **A9** and **A11** — read Anthropic's and OneSignal's current terms, record the transfer mechanism and the date checked. Both are marked `[verify]` inside `DATA_PROCESSING_AGREEMENT.md` today.
- [ ] Have the coordinator accept `COMMUNITY_DPA.md` on `/dashboard/compliance` and **confirm reporting opens** — this has never been done in either model.
- [ ] Only if the pilot runs as `council`: get A1 adopted and A2 countersigned, and put the DPIA in front of the council.

---

## L2 — the `DATA_CONTROLLER` placeholder

**Status: still there.** Verified in source on 25 August 2026.

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

### Where it still leaks

- **`/privacy` reads the constant.** It is public, sessionless and cannot read a village, so there is no per-village value for it to prefer. A privacy notice that does not name a controller does not satisfy Article 13.
- **`/terms` §1** describes both models and points at `/privacy` §1.
- Any village that has not filled in `Village.parishCouncil` prints `[Data controller name]` on documents addressed to a PCSO.

This is **DPIA action A5** and it is a Blocker there too. It also carries the
ICO registration requirement, which is a separate act with a fee, not a string
to type.

### Action items

- [ ] Decide who the controller is for the pilot. In `community` mode this is the Histon coordinator personally, at an address they are willing to publish.
- [ ] **Register with the ICO** if not already registered, and obtain the registration number. This is the long-lead item — do it first.
- [ ] Fill in all six fields in `DATA_CONTROLLER`.
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

### Action items

- [ ] Confirm `ADMIN_EMAILS` reaches **Vercel**, not only a local file. It is read at module load and fails closed: unset, nobody is an administrator and `/admin/villages` refuses everyone.
- [ ] Find Histon in `/admin/villages` and **activate it**. Record the minted join code somewhere that is not a screenshot.
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
- [ ] Set the OneSignal dashboard's service worker path and scope to `/onesignal/`, matching `serviceWorkerPath` and `serviceWorkerParam` in `push-registration.tsx`.
- [ ] Set the OneSignal site URL to `https://villagewatch.app` — one of the three places outside the repo that name the canonical host and all of which fail quietly if they disagree.
- [ ] Subscribe on a real phone and **deliver one push**. Watch the `[push:client]` and `[push:*]` console breadcrumbs; SETUP.md §8 is the checklist.
- [ ] Confirm the deep link opens the right report on the device, not just that the notification arrives.

---

## L5 — the coordinator flow, end to end

**Status: every part is built, no part of the chain has been exercised against a
database, and the suite cannot cover it.**

### The chain to verify

Resident files → `PENDING_REVIEW` → coordinator is pushed → coordinator reviews
→ approve → `PUBLISHED` → village broadcast → the report is on the map and in
the list.

### What is unverified, in the order it is likely to surprise

1. **That the compliance gate opens.** No acceptance has ever been recorded in either model. Until one is, a village refuses every report with a 403 before the body is parsed — so step one of the chain does not run at all. This is the L1 dependency and it is first for a reason.
2. **That a village with `autoApprove` off actually queues.** This is the single named gap in the test suite: nothing anywhere asserts it. It needs a route test with a database behind it, which is the test this suite deliberately does not take.
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
- [ ] Write the route test for item 2 above once the flow is proven by hand. It is the regression worth having a database-backed test for.

---

## Adjacent items that are not on this list

They are not blockers and are recorded here so they are not mistaken for some.

- **L6 — migrations.** Done. Thirteen of fourteen applied; `20260823120000_incident_votes` lands with the voting branch. `rls_policies.sql` **must** be re-run with it — a new table arrives with RLS off, and here that means the anon key could read who thought which of their neighbours' reports was overblown. `PROJECT_STATE.md` also records that re-running `rls_policies.sql` after the police-data merge is still to be confirmed. Confirm both with `npx prisma migrate status` rather than believing any file.
- **L7 — the sample seed village.** Open, and folded into L3's action list above because activating Histon without clearing it leaves a fictional village live beside a real one.
- **L8 — the Article 28(3) agreement.** Template drafted, in the gate, unsigned by either party. It is DPIA action A2 and is a council-model blocker; in community mode `COMMUNITY_DPA.md` replaces it and needs one signature.
- **No cron has ever fired** — not the weekly digest, not the nightly retention sweep, not the police-data sync. The retention job deletes files and takes reports off the map, and DPIA action A6 asks for exactly one supervised run against real data before it is trusted.
- **No email has been delivered to a real inbox**, and Supabase's own auth emails are still on the built-in mailer, whose hourly quota is low and shared across every flow. `docs/SUPABASE_EMAIL_SETUP.md` is the procedure. A village onboarding a dozen households in one evening will exhaust it.
