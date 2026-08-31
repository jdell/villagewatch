# VillageWatch — project state

**Last updated:** 31 August 2026 · **Repo version:** `v0.1.49` · **Branch:**
`main` · **Domain:** https://villagewatch.app

This is the running answer to "where is this project right now". It is a status
file, not a design document: what is live, what is in flight, what is blocked,
and what shipped recently. Anything explaining *why* the code is shaped the way
it is belongs in `CLAUDE.md`; anything tracking a numbered item of work belongs
in `BACKLOG.md`.

**Keep it current.** Updating this file is part of the Definition of Done in
`CLAUDE.md` — a stale status file is worse than none, because it is believed.

---

## Current status

| | |
| --- | --- |
| Live at | https://villagewatch.app (Vercel, `lhr1`) |
| Repo version | `v0.1.49` in `package.json` on `main` — `version.yml` released the map-corners fix as 0.1.43, the coordinator dashboard redesign (PR #16) as 0.1.44, the resident list's email masking (PR #18) as 0.1.45, the AI rewrite quota (PR #20) as 0.1.46, the launch-blocker audit (PR #21) as 0.1.47, the PDF test timeout (PR #19) as 0.1.48 and the four high-severity audit findings (PR #22) as 0.1.49 |
| Version on screen | expect **v0.1.41** — the release commit carries `[skip ci]`, so production is built from the commit before the bump and sits one patch behind `main` until the next real change deploys. This is designed behaviour, not a failed deploy (see "The version on screen" in `CLAUDE.md`) |
| Database | Supabase Postgres + PostGIS, `eu-west-2` (London) |
| Migrations in repo | 14, `20260726161847_init` → `20260823120000_incident_votes`. **13 are applied; the fourteenth is not.** `20260823120000_incident_votes` lands with this change — one table and one enum, no column added to any existing table, and every read on top of it degrades to "no votes yet", so nothing a resident can do changes when it applies. **`rls_policies.sql` must be re-run with it**: a new table arrives with RLS off, and here that means the anon key could read who in a village thought which of their neighbours' reports was overblown. `postgis.sql` need not be — no geography column, on purpose. `database.yml` applied 11 on the merge of PR #5 and 12 on the merge of PR #6, both on 21 August, each followed by `postgis.sql` and `rls_policies.sql`. The thirteenth landed with PR #10 on 22 August: three new tables, no change to any existing one. **It is applied, and the first cron run is the evidence** — `syncVillagePoliceData` reads `police_data_syncs` before it fetches anything, so a missing table would have failed the run with `P2021` before a single outbound request; instead the run reached data.police.uk and came back with 429s. Nothing here was ever schema drift: `keep_existing_crimes` appears in no migration and on no model, and the bug that stopped the run was code passing a field that has never existed. **Still to confirm: that `rls_policies.sql` was re-run on that merge** — a new table arrives with RLS off, and until it is re-run every police row is readable with the anon key. `postgis.sql` does not need re-running, because there is no geography column in it |
| Villages seeded | 270 Cambridgeshire parishes, all `PENDING`. **There is no `ACTIVE` village at all.** This row said the only one was `prisma/seed.ts`'s placeholder until 31 August; that was an inference from the script existing rather than from a query, and it was wrong — the seed has only ever been run against local scratch databases. See BACKLOG L7 |
| Test suite | Vitest, **39 files, 634 tests**, all passing (~3.6s; the pacer test spends 3s of that genuinely measuring the wait) — runs with no `.env.local` and no database. Unit only bar two component tests, both rendered to a string with no DOM: `period-control.test.tsx` and `legal-placeholders.test.tsx`. Three route handlers are now covered — retention, the vote, and **`POST /api/incidents`**, which closed the gap this file and two others named for a month |
| CI | `ci.yml` (lint → typecheck → test → build), `database.yml` (migrate + both SQL files), `version.yml` (standard-version bump, stepping past a tag that already exists) |

---

## Active branches

| Branch | State | Action |
| --- | --- | --- |
| `main` | The working branch. Auto-deploys to production. | — |
| `fix/security-audit-highs` | Merged as PR #22, 30 August. Released as `v0.1.49`. | Delete |
| `fix/pdf-test-timeout` | Merged as PR #19, 28 August. Released as `v0.1.48`. | Delete |
| `fix/launch-blockers` | Merged as PR #21, 27 August. Released as `v0.1.47`. | Delete |
| `fix/ai-rewrite-rate-limit` | Merged as PR #20, 25 August. Released as `v0.1.46`. | Delete |
| `feat/email-masking-resident-list` | Merged as PR #18, 25 August. Released as `v0.1.45`. | Delete |
| `feat/coordinator-dashboard-redesign` | Merged as PR #16, 25 August. Released as `v0.1.44`. | Delete |
| `fix/map-controls-overlap` | Merged as PR #15, 25 August. | Delete |
| `fix/iphone-safe-area` | Merged as PR #12, 24 August. Released as `v0.1.42`. | Delete |
| `fix/dashboard-period-picker` | Merged as PR #11, 22 August. | Delete |
| `feat/police-data` | Merged as PR #10, 22 August. Migration 13 landed with it. | Delete; confirm `rls_policies.sql` re-ran |
| `fix/share-summary-mode-aware` | Merged. | Delete |
| `fix/community-mode-copy-and-grant-docs` | Merged. | Delete |

`feat/reports-period-picker` (N15, PR #7), `feat/community-mode` (N17, PR #6)
and `fix/archive-clears-raw-description` (T10, PR #5) are all merged into `main`,
and `database.yml` applied migrations 11 and 12 on the last two — so the whole
stack this file described as "in review" is live. The local branches survive and
can be deleted.

`fix/audit-code-vs-docs` and `fix/database-workflow-environment-secret` are both
merged and deleted on the remote. No other branches. Work normally happens on
`main` — see the push rule under Known Pitfalls in `CLAUDE.md`; these two are
PRs because they were asked for as PRs.

---

## Open items

### The three unused email templates are wired up — 31 August 2026

`welcomeEmail` had been the only thing `src/lib/email/send.ts` ever sent. The
other three were written before there was a transport, kept pure on purpose, and
then left with no caller for long enough that two of their own headers were
describing a state of affairs that no longer applied. All four have a caller
now, and **not one line of any template changed to wire them in** — which was
the whole argument for having kept the rendering and the transport apart.

| Template | Caller | Audience |
| --- | --- | --- |
| `welcomeEmail` | both registration routes | the new resident |
| `incidentNotificationEmail` | `emailIncidentPublished`, from `applyModeration` and `announce()` | residents with `notifyEmail`, same severity floor and distance test as the push |
| `weeklyDigestEmail` | `emailCoordinatorsOfDigest`, from `/api/digest` | that village's coordinators |
| `coordinatorDecisionEmail` | `decideCoordinatorRequest` | the applicant |

**No migration.** Every column this reads has existed since the first one.

Five decisions in it are worth a reviewer's time, and the first two are the ones
that would have been easy to get wrong:

- **One message per recipient, never one message addressed to the village.**
  `sendEmail`'s `to` takes a list and a village-wide alert is exactly the shape
  that invites passing one — at which point every address is in the `To:` header
  of the copy every other resident receives. That is a neighbourhood watch
  scheme's membership list disclosed to everybody on it, forwarded and
  unrecallable, and it says who reports on their neighbours. `sendBulkEmail`
  fans out through Resend's batch endpoint (100 separate messages per call,
  capped at 500 recipients and logged when truncated), and
  `BulkEmailRecipient.to` is a single address so the wrong shape is not
  expressible. Asserted in `tests/email-send.test.ts` anyway.
- **The incident email is deliberately not inside `notifyIncidentPublished`.**
  That function has three callers and only two of them are a publish; the third
  is `POST /api/notifications`, a coordinator re-sending an alert OneSignal
  dropped. A push can be repeated and an email cannot be unsent, so a re-send
  that also mailed the village a second copy would turn a repair into a
  nuisance. The two genuine publish transitions call it themselves — the same
  pair that writes the `incident.publish` audit row.
- **`notifyEmail` went onto `/settings` in the same commit**, because a
  dispatch honouring a preference nobody can change is a village that cannot
  stop the email. The column had existed since the first migration with nothing
  reading it and no control in front of it.
- **`/privacy` §6 was saying something that had just become false.** It stated
  that a report's contents never appear in an email; the incident alert carries
  the anonymised `description` — the text already on the map. The paragraph was
  rewritten rather than left, a second one added on how to turn village email
  off, and `LEGAL_LAST_UPDATED` moved to 31 August 2026. `IncidentEmailInput`
  still has no field that could carry `rawDescription`, `lat` or `lng`.
- **The digest and the decision emails ignore `notifyEmail`**, mirroring their
  pushes. The digest is a working document for coordinators rather than village
  news; the decision is the outcome of something the recipient submitted and
  waited on.

**12 new tests** (622 → 634), all in `tests/email-send.test.ts` and
`tests/incident-create-route.test.ts`. **Nothing has been delivered to a real
inbox.** With no `RESEND_API_KEY` set every message is logged, which looks
exactly like a working deployment until somebody asks why they never got one —
and the two failure modes on a first real send are both quiet: an unverified
sending domain is refused into the server log, and `RESEND_FROM_EMAIL` may have
reached `.env.local` and not Vercel. The batch path in particular has never
spoken to Resend.

### The Supabase auth email correction — 31 August 2026

A documentation fix with no code behind it, and the kind worth recording because
the file was believed. `CLAUDE.md`, this file and
`docs/SUPABASE_EMAIL_SETUP.md` all said the project was still on Supabase's
built-in mailer sending stock grey templates. **It is not, and has not been.**
The project sends auth email over **Resend as the custom SMTP sender**, and the
four branded templates in `src/lib/email/supabase-templates/` are pasted into
Authentication → Emails → Templates — steps 2 and 3 of that document, confirmed
by the operator.

**Nothing in this repository can verify any of it**, which is why it was wrong
for a week and why the correction says so rather than reading as checked.
`tests/supabase-templates.test.ts` compares the committed `.html` against the
module that generates it; it cannot see a dashboard. A password reset and a look
at what arrives is the only check there is. Two consequences:

- **Editing the module is not editing what residents receive.** Re-run
  `npm run generate:supabase-templates` *and* paste the result back in, or the
  deployment keeps sending the previous version while the test passes.
- **Step 1 is still worth confirming** — the hourly limit under
  Auth → Rate Limits is a separate box from the SMTP one and stays wherever it
  was last set. It is no longer the binding constraint, but nobody has read the
  figure off the screen since the sender changed.

### Four tracked items closed, none of them by a code change — 31 August 2026

A documentation pass rather than a release. Nothing in `src/` moved, so there is
no version bump behind it; what moved is what the tracker claims is true.

- **B3 and L4 — push works.** OneSignal delivers to a real device. Both rows had
  been open for a month against code that was correct throughout: every
  condition on the list is a Vercel variable, a redeploy or a field in the
  OneSignal dashboard, which is exactly why nothing in this repository could
  ever have closed them. `NEXT_PUBLIC_ONESIGNAL_APP_ID` is inlined at build
  time, so setting it without redeploying looks identical to setting it, and the
  **updater filename** under Web Configuration → Advanced → Service Workers is a
  separate field defaulting to a v15 name this repo does not have. Every failure
  mode on the path reports a perfectly healthy init that never delivers, which is
  why the runbook stays in `docs/LAUNCH_BLOCKERS.md` §L4 rather than being
  deleted with the blocker. **This takes one of L5's two dependencies with it**;
  L1 is the other, and nothing here touches it.

- **L7 — the premise was wrong, and that is the finding.** There is no sample
  seed data in the live database and there never was: `prisma/seed.ts` has only
  ever been run against local scratch databases, and its invented village, five
  incidents and hardcoded `VILLAGE1` join code exist in that script and nowhere
  else. The row was written during the B5 stub sweep on 27 July as an inference
  from the script's existence, and this file, `BACKLOG.md` and
  `docs/LAUNCH_BLOCKERS.md` then repeated it for a month in the register of
  something somebody had checked. **The consequence is worth carrying rather than
  deleting**: there is no `ACTIVE` village *at all* rather than a placeholder
  one, so L3's first activation lands in a directory of 270 `PENDING` parishes
  with nothing to clear out of its way. Five statements in this file said
  otherwise and are corrected in place, each marked where it stood.

  It is the same shape of error as the join code `BACKLOG.md` recorded as done
  for seventeen days, and as the migration statuses reconciled on 13 August:
  a claim about the *deployment* written from the repository. The repository is
  the one thing that cannot answer those.

- **T11 — three Vercel crons, settled by the deployment.** `vercel.json` has
  carried three entries since 22 August, the deploy was accepted, and
  `/api/cron/police-data` then fired on its own schedule — the run that came back
  429 for every village and cost two bug fixes. A Hobby project would have
  rejected the deploy at the third entry before any of that. So this is not a
  Hobby project, all three crons are scheduled, and nothing changes. The route's
  `?village=`, `?months=` and `?force=1` parameters stay as the on-demand path
  rather than as a workaround for a plan limit.

- **The heatmap row in "Can launch without" caught up with N1**, which shipped it
  on 28 July. The reasoning in that row never stopped being true — pins already
  answer "where is this happening" — which is what makes it different from the
  time-range row beside it. It is still unexercised: no heatmap has been drawn
  over real reports.

**What none of this changes.** The critical path is L1, L2, L3 and L5 — a
compliance acceptance, the ICO registration and a named controller, the first
activation, and the chain walked end to end. No village is `ACTIVE`, no
acceptance of any kind has ever been recorded, and every village in the
directory is refusing reports right now.

### The coordinator dashboard, in five tabs — 25 August 2026

Merged as PR #16 and released as `v0.1.44`. `docs/COORDINATOR_DASHBOARD_REDESIGN.md`
is the design doc and was written before the code.

**The email masking on the resident list arrived one release later.** It was
written while #16 was in review and missed the merge, so it went in on its own
as PR #18 and released as `v0.1.45`. Addresses on `/dashboard/settings` are
masked to `j***@gmail.com` with a Show button per row, and the masking happens
in `listVillageResidents` rather than in the component — the page carries no
full addresses at all.

**One known flake, and `main` is green by luck rather than by design.**
`tests/report-pdf.test.ts > renders a full log across several pages` renders 200
rows through PDFKit: ~1.4s locally, over 5s on a shared GitHub runner, against
vitest's 5000ms default. It failed PR #18's first run and passed #18's merge
run, which is a flake behaving as flakes do. `fix/pdf-test-timeout` gives that
one test 30s. Until it lands, a red `checks` job on any PR is worth reading
before it is re-run.

`/dashboard` was one nine-hundred-line page doing four jobs — figures, the
review queue, five village settings forms and the invite panel — with the queue,
the only part with a decision waiting on a person, eight sections down. It is
now three routes and the sidebar has five coordinator tabs:

| Tab | Route | New? |
| --- | --- | --- |
| Overview | `/dashboard` | Rewritten, read-only |
| Queue | `/dashboard/queue` | New page, existing components |
| Map | `/map` | Untouched |
| Reports | `/reports` | Gains the weekly summary history |
| Village settings | `/dashboard/settings` | New page, existing forms |

**No migration**, which is what makes this cheap to land: every column it reads
already exists, and the only schema-adjacent change is a new `AUDIT_ACTIONS`
entry, which is a display list rather than a constraint.

Three things in it are more than a move, and are what a review should look at:

- **The Queue tab's Edit button** widens `/incidents/[id]/edit` and
  `editIncidentAction` from the reporter alone to *a coordinator of the same
  village, on a report still in the queue*. Both constraints that matter are
  unchanged — queue statuses only, so a published report is still not
  rewritable, and the coordinator's own village. `/terms` §7 has said
  "coordinators may edit … any report in their village" since it was written, so
  this makes the code match the notice rather than the other way round.
- **The resident list** on the Settings tab closes the standing "resident
  verification has no UI" gap. A coordinator can move somebody between
  `RESIDENT` and `VERIFIED_RESIDENT` and **nothing else** — not to
  `COORDINATOR`, not another coordinator, not themselves, not a closed account.
  `tests/resident-role.test.ts` is the new test file and asserts each refusal.
  Audited as `village.resident_role_changed`, toned `sensitive`.
  **Email addresses on it are masked server-side** — `j***@gmail.com`, with a
  Show button per row that fetches one address through
  `revealResidentEmailAction`. The page carries no full addresses, which is the
  half that matters: masking in the component would look identical and put all
  fifty in the payload. It is not an access control and the code says so — a
  coordinator is entitled to them — it answers incidental exposure, which is how
  a village contact list actually leaks. `tests/mask-email.test.ts` covers
  `maskEmail`, which fails closed.
- **`PatternAlert` is finally rendered.** Overview counts the alerts raised in
  the period and `/reports` lists the weekly summaries. Read-only — acknowledge
  and dismiss still have no UI, deliberately.

Also: the period control gains **Last 12 months** (`365` in `TIME_RANGES` and
`DASHBOARD_RANGE_VALUES`), the sidebar's Queue item carries a pending-count
badge computed in `(app)/layout.tsx`, and the sidebar's active-item rule now
takes the *longest* matching prefix — without which every nested `/dashboard/*`
tab lit up Overview as well as itself.

**What has not been done**: none of it has been exercised against a real
village, because no village has ever been activated. The five tabs build,
typecheck, lint and pass 543 tests. The three things to watch on the first real
coordinator are the badge count (it is one indexed `count` on every
authenticated render), the resident list on a village with more than
`RESIDENT_LIST_SIZE` accounts, and the weekly summary list — which cannot render
anything until a digest has run, and no cron has ever fired.

### Go-to-market and the launch blockers, in one place each — 25 August 2026

Two new documents, both read by people and rendered by nothing, so neither needs
an `outputFileTracingIncludes` line.

- **`docs/LAUNCH_BLOCKERS.md`** — the five blockers audited against `main` at
  `v0.1.43` rather than restated from `BACKLOG.md`, with what was actually
  verified on the day and an action list each. The summary: **L2 is still
  placeholders** (`DATA_CONTROLLER` in `src/lib/constants.ts:1872` reads
  `[Data controller name]`, mode-neutral since the community model but a
  placeholder still, and `/privacy` reads it because it is public and
  sessionless); **L3 is code-complete and has never been run** — no village has
  ever been activated, all 270 seeded parishes are `PENDING`, and the only
  `ACTIVE` village is the seed's placeholder with its hardcoded `VILLAGE1` code,
  which is why L7 is folded into L3's action list rather than tracked beside it;
  **L4's three OneSignal variables are blank** and the public one is inlined at
  build time, so setting it in Vercel without a redeploy changes nothing;
  **L5 cannot start until L1 and L4 land**, because the compliance gate is live
  and refusing reports and because `notifyCoordinatorsOfPendingReport` is what
  tells a coordinator the queue filled up.

  **Two of those four findings have since been overtaken — 31 August.** L4 is
  closed: the variables are set, the redeploy is done, the service-worker fields
  match and a push has reached a real device. And the L7 half of the L3 finding
  was never true — there is no seed placeholder in this database and there never
  was, so L3's first activation lands in an empty directory rather than beside
  something that has to be cleared out of the way first. The paragraph above is
  left as written on 25 August, because it is what that audit found; this note is
  the correction rather than a rewrite of it.

  **The one finding that moves the critical path is L1's.** `Village.mode`
  defaults to `community`, where the gate asks for one document rather than
  three — so running the Histon pilot as a community village takes A1 (the
  council's Appropriate Policy Document), A2 (the countersigned Article 28(3)
  agreement) and the council's review of an Article 35 assessment off the
  pilot's path and replaces them with `COMMUNITY_DPA.md`, in force on
  acceptance. What it does **not** remove is A4 (coordinator review guidance),
  A10 (breach procedure) or A5/L2 — in community mode those attach to the
  coordinator, who is the controller.

- **`docs/MARKETING_GTM_PLAN.md`** — **revised 31 August** against `v0.1.49`, and the revision's own finding is that six days of releases moved the pilot no closer: no village activated, no compliance acceptance anywhere, L5 unwalked. It gains a §0 recording what closed (L4, L7, L2's code half, the security audit, the written resident quick start, the first cron firing) and what did not; the launch phases are re-anchored to **activation day** rather than to calendar months that had already passed; §12 is rewritten as one afternoon's sequence with the OneSignal items struck off. Three new constraints are written down: the enforcing CSP means an analytics origin needs a line in `src/lib/csp.ts` or the channel reports nothing silently, the brand Facebook Page and a village's own Page in `docs/AUTO_POST_CHANNELS_PLAN.md` are different surfaces under different rules, and the written resident quick start is missing the one sentence about a denied notification prompt being unrecoverable. As first written it covered positioning, the coordinator-first funnel,
  the four launch phases, Facebook and SEO, analytics, pricing validation,
  growth targets and the grant pipeline as marketing. Three things in it are
  findings rather than plan: **there is no analytics of any kind in the project**
  (no `@vercel/analytics`, no PostHog, no Plausible in `package.json`), and
  adding one is a new processor — a change to `/privacy` §6, to both processing
  agreements' sub-processor lists and to `docs/DPIA.md` §5 in the same commit;
  **there is no `src/app/blog` route**, so the SEO plan carries a build item and
  the two traps that come with it (`outputFileTracingIncludes`, and keeping a
  literal path segment so Turbopack does not trace the project into the bundle);
  and **the pitch message is not in the repo** though it is referred to as
  existing, while the coordinator guide is (24 pages, verified) and the resident
  quick start is not.

  **The £15 council tier is validated off-platform and deliberately stays off
  the landing page.** `PRICING` carries no price for Pro since 22 August and
  `tests/pricing.test.ts` asserts that a planned tier states none — so putting
  the figure back today fails CI, correctly, there being no billing provider, no
  plan column and no enforcement behind it. The plan tests the number on a quote
  to the first three interested councils instead, and says what has to exist
  before it goes back on the site.

  **UKDI is reported as submitted and awaiting Stage 1 review, and is tracked in
  neither `docs/FUNDING.md` nor `BACKLOG.md`'s funding table.** The plan flags it
  as P6 to add, with the submission date and what was claimed, so its claims are
  checkable against the code like every other application's.

### Done — landed, not yet exercised against real data

- **The map's zoom buttons were drawn on top of the village's name** — 24 August
  2026, reported by a user, `fix/map-controls-overlap`. Leaflet puts its zoom
  control in the `topleft` corner by default, and that is the corner
  `map-view.tsx` puts the village card in: 10px of control margin against a card
  that starts 12px in. The control wins, and not by accident — Leaflet numbers
  its controls at 1000 and this app deliberately numbers its own map overlays at
  800 against that scale, so what a resident on an iPhone in portrait actually
  read was + and − over the village's name and its incident count.

  It is `bottomright` now, on every map in the codebase, with `zoomControl` set
  to `false` so Leaflet's own is never built. That corner is the one nothing
  else claims — village card top left, layer and period controls top right,
  legend along the bottom from the left — and Leaflet inserts a bottom control
  *before* whatever is already there, so the OpenStreetMap attribution stays
  flush with the edge and the buttons stack above it rather than over a licence
  condition.

  **Three things beside it were crowding the same phone**, none a logic change.
  The legend row now reserves the zoom control's column: it is centred until
  `sm`, so at 500px — wide enough for both legend cards on one line, too narrow
  to left-align them — the density card's right edge landed seven pixels inside
  the buttons. Both pill groups wrap inside their own card: the four periods
  want 367px against 366px of row on a 390px phone, and flexbox was paying for
  that by squeezing the pills until a label broke in half inside its own button
  ("Last 30" over "days"). And the same row now clears the OpenStreetMap
  attribution, which the density card had been covering the top few pixels of —
  older than this change and picked up with it, because that strip is a licence
  condition rather than a control.

  **Measured rather than eyeballed**, against the compiled stylesheet and real
  Leaflet at 375, 390, 500, 640, 720 and 1280 CSS pixels: no pair of the six
  overlays and controls intersects at any of them, and the document never
  scrolls sideways. That harness also killed a third fix before it shipped — a
  `shrink-0` on the village card, to stop the control groups squeezing it, which
  measured as a no-op at every width because flexbox breaks a line before it
  shrinks anything on it. The comment where it would have gone says so, since it
  is the obvious thing for the next person to reach for. What the harness cannot
  show is the map with a village's pins on it — the only `ACTIVE` village is the
  seed placeholder — so **look at `/map` on a phone once there is one**, in both
  `pins` and `both`, which is the mode that puts a second card on the bottom
  row.

- **The navigation button was untappable on an installed iPhone, in portrait
  only** — 24 August 2026, reported by a user, `fix/iphone-safe-area`. The app
  asks iOS for the whole screen — `viewportFit: "cover"` plus
  `black-translucent` in `app/layout.tsx` — and then nothing in the codebase
  respected `env(safe-area-inset-top)`. The status bar is composited over the
  top of the web view, so the app shell's `top-0` bar was drawn under the
  clock: a 36px button at y=10-46 inside a 59px inset on a Dynamic Island
  phone, with no part of it reachable. Rotating to landscape collapses that
  inset to 0, which is what the report described and what made it look like a
  layout bug rather than a safe-area one.

  **Three controls were affected, not one.** The hamburger; the drawer's own
  close button, 36px at y=16-52, which would have left anybody who got the
  drawer open unable to shut it by any means but the backdrop; and the toast
  close button, since sonner's mobile offset is 16px and `/` renders
  `closeButton` — the control the app reports its errors through. All three now
  carry the inset. The hamburger also went from 36px to 44px, the figure this
  same file already argues for in its comment on the sidebar rows.

  `map-view.tsx` subtracts the inset too, because its height is written against
  the bar's. The comment in `layout.tsx` claiming the header was already padded
  is corrected — it had been wrong for as long as it had been there.

  **The reason it shipped is worth keeping**: there is no
  `@media (display-mode: standalone)` rule anywhere in the project, and Safari
  reports a 0 top inset in portrait. The app therefore renders identically in
  every browser, on desktop, and in responsive-design mode. **This fix cannot
  be verified in any of them** — it needs an Add to Home Screen launch on a
  notched or Dynamic Island phone, or the Simulator with one.

  Not fixed here, and both are the same bug class on surfaces outside the
  approved scope: the public landing page's own `sticky top-0` header
  (`app/page.tsx:208`), reachable in standalone through `/login`'s "Back to
  home" link; and the drawer's left edge in landscape, where
  `safe-area-inset-left` is 47-59px on a notched phone and the panel is flush
  to it. Both want their own change.

- **The raw "email rate limit exceeded" popup is gone, and the dashboard half of
  it is not done** — 23 August 2026. Residents signing up were shown Supabase's
  own wording for an exhausted hourly mail quota, as a red toast on the
  registration form: `POST /api/auth/register` returned
  `error?.message ?? "Could not create your account"`, so the provider's message
  went straight through. `src/lib/auth-errors.ts` is the one mapper now and no
  provider message reaches a resident from any auth flow — sign-up, sign-in, the
  reset request, the password change and the OAuth return leg. A rate limit is a
  429 with `Retry-After`, `useAuthSubmit` gives every auth form a synchronous
  double-click guard (the disabled attribute never was one — two clicks in a
  frame both read the old state, and on `/register` each is an email), a
  watchdog that aborts its own request rather than racing it, and a cooldown the
  button counts down. `/forgot-password` surfaces the deployment-wide quota
  only, never the per-address limit, which would say whether an address has an
  account. 17 new tests.

  **The part that stops the limit being hit has been done, and this paragraph
  said otherwise until 31 August 2026.** The project sends its auth email over
  Resend as the custom SMTP sender, and the four branded templates from
  `src/lib/email/supabase-templates/` are pasted into Auth → Emails → Templates
  — steps 2 and 3 of `docs/SUPABASE_EMAIL_SETUP.md`, confirmed by the operator.
  Both are dashboard settings, so **nothing in this repository can verify
  either**; a password reset and a look at what arrives is the check. The one
  box still worth confirming is the hourly limit under Auth → Rate Limits, which
  is separate from the SMTP settings and stays wherever it was last set. **Resend is now used in the codebase as well**, through
  `src/lib/email/send.ts` — a separate thing entirely, sending the emails
  VillageWatch itself renders, with no effect on Supabase's quota; see the entry
  below. Until somebody does the two dashboard settings, a village onboarding a
  dozen households in one evening will exhaust the quota — the difference is that they are now told to wait rather than shown
  a quota they have no part in. **Nothing here has been watched against a real
  sign-up wave**, which is the one thing that would confirm the 429 path.

- **Residents can rate how serious a published report is** — 23 August 2026.
  Two buttons and two counts on every published report, in the incident list and
  on the detail page. It answers the question the dashboard's figures cannot —
  *which of these did the street actually care about* — and it is the only
  signal on that screen coming from neither the reporter nor a coordinator.

  It is deliberately **advisory**: no status moves, no severity moves, nothing
  is published and no alert is sent. Severity drives the push audience and the
  WhatsApp Channel's floor, so a control that moved it would let a handful of
  taps decide who gets woken up. What it produces is an ordering — a "what your
  village thinks" panel on `/dashboard` with three sortings, and a "most
  concerning" section in everything `/reports` produces, on screen, on the
  clipboard and in the PDF.

  Three states and no `NEUTRAL`: up, down, and the absence of a row, which is
  what pressing the same button again leaves behind. `nextVote` is that rule and
  both the browser and the route call it, so the optimistic count and the row
  written cannot disagree. `POST /api/incidents/[id]/vote` is rate limited **per
  incident** — one change per ten seconds — because a per-resident window would
  refuse a vote on the second report in a list.

  **Nobody's name is rendered anywhere**, and it is structural rather than
  remembered: no query in the app selects a voter. RLS gives a resident their
  own rows and a coordinator their village's, matching what a coordinator can
  already reach. Erasure takes votes in both directions, explicitly — neither
  foreign-key cascade ever fires, because `eraseAccount` keeps the `users` row
  and `removeIncident` keeps the `incidents` row. `/privacy` §§2, 6 and 7 and
  `/terms` §7 changed with it. 36 new tests across `votes.test.ts` and
  `incident-vote-route.test.ts`, the second route handler the suite has taken.

  **Migration 14 is not applied.** Until it is, the buttons render zeroes and
  every read degrades — which is the same thing a village where nobody has voted
  sees. **Re-run `rls_policies.sql` with it.**

- **Email sends, for the first time** — 23 August 2026. `src/lib/email/send.ts`
  is the transport the barrel's header has promised since the templates were
  written, over Resend, and **not one line of a template changed to wire it in**
  — which was the whole argument for keeping the two apart. `welcomeEmail` is
  its only caller and it fires on both registration paths, password and Google.

  Its contract is `notifications.ts`'s: **nothing throws and nothing waits
  long.** It is awaited *after* the auth user and the profile row exist, so a
  throw would tell somebody their sign-up failed when it succeeded; a missing
  key, a refused sender, a rate limit and a timeout all resolve to a value the
  caller logs and ignores. With no `RESEND_API_KEY` the message is logged
  instead, the state OneSignal and Slack already have.

  `/privacy` §6 names Resend as a processor and says what an email carries — a
  first name and a village name, never a report's contents. `.env.example` and
  SETUP step 7d document `RESEND_API_KEY` and `RESEND_FROM_EMAIL`; **both have
  to reach Vercel**, and with neither set the deployment looks healthy right up
  until somebody asks why they never got a welcome. **No email has been
  delivered to a real inbox.**

  The other three templates still have no caller: village news is push only.

- **The four Supabase auth emails have branded templates** — 23 August 2026, and
  they are the answer to a real gap rather than a polish pass. Confirmation,
  magic link, email change and password recovery are the most-read emails this
  service sends, they are minted by Supabase because only Supabase can mint the
  token, and they were its stock ones: grey, unbranded, signed by a company no
  resident has heard of. The first email a village ever received from
  VillageWatch was the one that looked least like it.

  `src/lib/email/supabase-templates/` holds four `.html` files to paste into
  Authentication → Emails → Templates, rendered through the same shell as every
  other email in the product. They are **generated** from the module beside them
  by `npm run generate:supabase-templates`, and a test fails if a committed file
  and the module drift — editing the HTML by hand reproduces the state the
  directory exists to prevent, which is wording that lives only in a form nobody
  can review.

  `{{ .ConfirmationURL }}` is in each one twice, behind the button and as
  visible text beneath it, and no other Supabase variable is used: one a project
  does not populate renders as an empty string, and a blank line where an
  address should be reads as broken. Both asserted.

  **Nothing has been pasted into the dashboard yet**, so residents are still
  getting Supabase's own. `docs/SUPABASE_EMAIL_SETUP.md` §3 is the procedure.

- **The pattern-detection card quotes the real detector** — 22 August 2026.
  The landing page's `FEATURES` card illustrated itself with "six vehicle
  break-ins within 400 metres over four nights" from the day it was written.
  `detectPatternHeuristic` searches `PATTERN_RADIUS_METERS` (200) over
  `PATTERN_WINDOW_DAYS` (30), so the example was a cluster the code would have
  looked straight past, offered as proof that it finds them. It quotes a real
  `patternNote` now — "4th report of antisocial behaviour within 200m in the
  last 30 days" — and stops short of `PatternAlert`, which the digest writes and
  nothing renders. Found while auditing the pricing lists below; the same stale
  example survives in `prisma/schema.prisma`'s `PatternAlert` doc comment, which
  is a comment rather than a public claim and was left alone because a push
  touching `prisma/**` runs `database.yml` against the production database.

- **Both pricing feature lists now describe what exists** — 22 August 2026, on
  top of the price removal below. The free tier's list had drifted from the
  codebase in both directions: it promised "pattern detection" for `PatternAlert`
  rows nothing renders, and it was silent about four of the strongest things the
  product actually does — on-device face blur, the PDF community safety report,
  the Home Office crime figures and the UK GDPR compliance pack. It is nine
  lines now and every one of them is a screen or a route somebody can reach.
  Pro's list keeps its six directions and loses SMS, which was one unused
  `notifySms` boolean and a word on a landing page; the card renders the rest
  under "Planned — none of this is built yet", with a dashed marker instead of
  the tick a delivered feature earns and greyed text, so nothing on it reads as
  available to somebody skimming. `tests/pricing.test.ts` is new and asserts the
  promise rather than the copy — a planned tier states no price or cadence, a
  cadence never appears without one, and the JSON-LD `Offer` never describes a
  tier nobody can buy.

  **Two lines on the free list are true and thin on real-world mileage**, and
  are the first thing to revisit if either turns out not to work: the Home
  Office figures degrade to no section at all until a police sync actually
  lands — the first scheduled run came back rate limited — and push alerts are
  wired end to end but have never been delivered to a real device.

- **The Pro tier states no price** — 22 August 2026. The landing page's pricing
  section printed "£15 / per month, per village" in the largest type on the Pro
  card, over a tier its own badge calls "Planned" and its own footnote says
  cannot be bought — so the single number a reader carried away from that
  section was the one thing on it nobody can honour. There is no payment
  provider, no plan column and no enforcement anywhere in the codebase. The card
  is now the feature list and the "Register interest" button; `PricingTier.price`
  and `.cadence` are optional and Pro's are written out as `undefined` (omitting
  them would drop the keys from the `as const` union member and break
  `tier.price` at both call sites). `structured-data.ts` carried no `Offer` for
  Pro before this and still does not. Nothing to exercise against real data —
  it removes a claim rather than adding a path.

- **The period control collapses its dates** — 22 August 2026. `/dashboard` and
  `/incidents` kept two date inputs on screen under every preset, ignored by
  `resolveTimeRange` for all of them but `custom` — so a coordinator filling
  them in under "Last 7 days" watched none of the figures move. They appear only
  under "Custom range" now, behind the same chip and two-month calendar
  `/reports` has had since PR #7. That calendar is one component rather than
  three copies: `src/components/date-range-chip.tsx`, parameterised by the
  ceiling each screen enforces. The row of preset pills became a `<select>` —
  which keeps the no-JavaScript property a submit button gave it and adds the
  one pills could not have, that a preset can be *chosen* without the page
  navigating, which is what "Custom range" needs to reveal a picker rather than
  submit a range nobody has typed. `/map` was never wrong and is untouched.
  `tests/period-control.test.tsx` is the suite's first component test and
  asserts the promise directly: no date input in the document under a preset.

- **Official police data** — 22 August 2026. VillageWatch now shows the Home
  Office's own recorded-crime figures beside a village's reports, from
  `data.police.uk`. Four modules — `police-api.ts` (the client, typed failures,
  a 1/s outbound pacer), `police-data.ts` (the Prisma half), `police-report.ts`
  (client-safe types and words) and `GET|POST /api/cron/police-data` (weekly, and
  the on-demand endpoint) — three Prisma models, a dashboard panel, and a
  comparison section in all three renderings of the community safety report:
  screen, clipboard and PDF. It also answers "who is our PCSO", which nothing in
  the app could do before: the neighbourhood team is resolved from the village's
  map centre and stored.

  **Two decisions worth knowing before reading the diff.** Nothing maps a police
  category onto `IncidentType`, deliberately — the two series count different
  things over different areas two months apart, so they render side by side with
  one shared caveat constant rather than in one chart that would look like a
  comparison and be an assertion. And `PoliceDataSync` exists so that "the police
  published nothing" is distinguishable from "we never asked": a `count(*)`
  returns zero for both, and printing that zero in a document addressed to a PCSO
  would be a false statement produced by arithmetic that is individually correct.
  Every surface names the months it holds and the months it does not.

  **Nothing had ever spoken to the service when this was written, and that
  changed on 22 August** — see the police-data cron entry further down. Migration
  13 is applied, the first scheduled run reached `data.police.uk`, and it came
  back 429 for every village. What is still true is that no village holds a month
  of figures. Four things to watch on the first *successful* run — the
  neighbourhood lookup (a village centre resolving to a
  neighbouring parish's team is wrong in a way only somebody local spots), the
  availability list the month-selection strategy rests on, a real month's volume
  against `POLICE_MAX_CRIMES_PER_MONTH`, and the two freehand fields whose markup
  is stripped. None can fail a page; all four degrade, which is why they want
  looking at.

  **It is a third Vercel cron and Hobby allows two — settled 31 August, and the
  deployment settled it rather than anybody deciding.** The three-entry
  `vercel.json` deployed without complaint, and the police-data cron then fired on
  its own schedule: that is the run which came back 429. A Hobby project would
  have rejected the deploy at the third entry, loudly, before either could
  happen. So this is not a Hobby project, all three crons are scheduled, and
  nothing in `vercel.json` changes. `?village=`, `?months=` and `?force=1` stay as
  the on-demand path — which is what made the 22 August debugging possible —
  rather than as a workaround for a plan limit. Worth re-reading if the project
  ever moves between Vercel plans. BACKLOG T11.

  `/privacy` §6 gained a paragraph in the same commit. It is the seventh claim
  that file makes about how the code behaves, and the only one describing an
  outbound request with nothing of a resident's in it: a village's ONS map centre
  and a calendar month is all that is sent.

- **Community Mode** — 20 August 2026, N17. `Village.mode` is `community` or
  `council`, defaulting to `community`. A community village's coordinator is the
  data controller and accepts one document — `docs/COMMUNITY_DPA.md`, which
  carries the Article 28(3) processing terms and the Schedule 1 paragraph 5
  policy document together — instead of the council's DPIA, APD and DPA. The
  paragraph 5 condition is folded in rather than dropped; what is genuinely left
  out is the Article 35 assessment, because `docs/DPIA.md` rates no risk high
  after mitigation for the same software. Upgrading to the council model is
  one-way, audited, and **does not close the village** — the coordinator is still
  the controller until the council adopts its three.

  **The migration is applied and nothing has run through it.**
  `database.yml` applied `20260820120000_village_community_mode` on 21 August
  when PR #6 merged, so every village now carries a real `mode` column reading
  `community` — but no village is on either model in anger, and no acceptance of
  any kind has ever been recorded. Three things to watch on the first village
  through: that the migration's backfill
  leaves it on `community` (nothing has been accepted anywhere, so it should —
  this named "the seeded village" until 31 August, and there is no seeded
  village), that accepting the one agreement actually opens reporting, and
  that an upgrade leaves the village open. `docs/COMMUNITY_DPA.md` has been
  written from the code and read by no lawyer.

- **The rest of the mode-aware copy, and the grant documents** — 21 August 2026.
  N15 moved three screens onto `Village.mode` and an audit found thirteen more
  places still describing a parish council to every village. The two that are
  more than wording:

  **The privacy notice's lawful basis was wrong, and it disagreed with our own
  DPIA.** §4 gave Article 6(1)(e), public task, as the basis for publishing
  reports — a basis a parish council has and a volunteer coordinator does not,
  and `docs/DPIA.md` §4.1 has said 6(1)(f), legitimate interests, with a
  documented balancing test, since it was written. Legitimate interests is now
  the stated basis, with the public task described beside it as what a council
  may rely on instead.

  **`DATA_CONTROLLER` no longer says "council".** It is still placeholders —
  that is L1 and it is not closed — but it read `[Parish Council name]`, which
  is the wrong question asked of most villages: it prints on the foot of a
  community village's own reports and under the dashboard field a volunteer is
  meant to fill in. Mode-neutral placeholders instead.

  The other eleven are copy: both AI prompts now take the village's mode (the
  audience shapes the register, and a model told it is writing for a parish
  clerk writes a committee paper), the compliance and guide headers, the
  controller-field toasts, the audit trail's label for
  `village.parish_council_changed` — "Data controller changed" in a community
  village, the stored action untouched — the join and invite pages' pre-activation
  text, the Coordinator Guide's pointer at the field, and the landing page, which
  now says a council is not needed to start.

  **"Generated by VillageWatch AI" was on every document either report format
  produces**, including the ones whose only prose is `countedNarrative` —
  arithmetic — and the single-incident summary, which has no analysis section at
  all. It is conditional on `narrative.source` now, across all three surfaces:
  the screen, the clipboard and the PDF. `tests/report-footer.test.ts` is the new
  file in the suite; `tests/village-mode.test.ts` gained the audit-label rules.

  **The grant documents were rewritten against sixteen findings.**
  `docs/GRANT_APPLICATION_NL_AI.md` claimed data was all held in the UK (it is
  *stored* in the UK; three processors are not), that the compliance migrations
  were unapplied (all twelve are applied and the gate is live), that pattern
  detection was AI (the clustering is a radius query and a count), that a
  coordinator can share any incident (published only, coordinators only), and
  that the Histon pilot was under way (**no village has ever been activated**).
  The Article 22 claim is stated as a position we take rather than a compliance
  fact, the cost arithmetic separates £52/month of infrastructure from £3,524 of
  year one, the Anthropic line now names all three call sites, and every
  third-party figure in `docs/FUNDING.md` is flagged with the date it was read.

  **Nothing here has been read off a real village either**, for the same reason
  everything else in this section has not: no village is activated, so the
  council half of every mode-conditional sentence is still unproven.

- **`/reports`' period control, and mode-aware copy** — 21 August 2026, N15.
  The filter is one row — a preset dropdown and "Build report" — and the dates
  are on screen only when the preset is "Custom range", where they are a single
  chip reading "22 Jul – 21 Aug" that opens a two-month calendar. Both date
  inputs used to sit there permanently doing nothing for every preset but one.
  The presets gained "Last 90 days" and "This year" with the space that freed up;
  `year` has its own branch in `resolveReportRange` because it is the one period
  that cannot be written as a number of days back from now. `ReportPeriodPicker`
  is a Client Component around the same `<form method="get">`, so every preset
  still works with no JavaScript, and `src/lib/calendar.ts` holds the month
  arithmetic so the off-by-ones are testable — `tests/calendar.test.ts` is the
  new file in the suite.

  The copy half is N15. `/reports` said a report was "for your PCSO or parish
  council" to every village, and the dashboard asked every coordinator for a
  parish council's legal name; in the community model — the default — there is
  no council and the coordinator is the data controller, so the field they need
  to fill in was asking for something that does not exist. Both follow
  `Village.mode` now, and `/reports`' amber warning links to the dashboard field
  instead of telling a coordinator to ask a platform administrator about a
  setting they own.

  **There was a third screen and the first pass missed it** — the share panel on
  `/incidents/[id]`, which offered "a written summary of this report for your
  PCSO or parish council" whatever the village. Flagged in review on PR #7 and
  closed on `fix/share-summary-mode-aware`: `ShareSummary` takes a `mode` and
  picks between two sets of copy, the police in both, because having no council
  says nothing about having no PCSO. The document is unchanged in either model,
  since `formatIncidentSummary` names no recipient.

  **Nothing has been read off a real village yet.** The migration landed on 21
  August, so `getVillageMode` is reading a column rather than falling back to
  it — but every village in the database is `community`, and no council village
  exists to prove the other half of any of the three screens. The picker itself
  was driven by hand in a browser — presets, the two-month grid, a range picked
  in reverse order, the hidden inputs it submits, Escape, and the mobile
  layout — but never against a village with reports in it.

- **`version.yml` no longer dies on a tag that already exists** — 21 August 2026.
  standard-version derives the next version from `package.json` and then tags it;
  where the two have drifted the run fails at `git tag`, after writing the
  changelog and the bump commit, and every later push to `main` computes the same
  taken version and fails the same way. They *have* drifted here: `v0.1.30` is on
  the remote and `package.json` on `main` reads `0.1.29`. The job now asks
  `--dry-run` what it would tag, checks that locally and on the remote, and
  passes `--release-as` the next free patch — so the next release off `main` will
  be `v0.1.31`. **Not yet run**, like everything in that workflow since the last
  release: the proof is the next releasable push to `main`.

- **Archiving deletes the reporter's original wording** — 20 August 2026, T10.
  `/privacy` §7 said it happened at twelve months and nothing did it; the
  archive step was a status flip. It is now one `updateMany` that sets
  `status: "ARCHIVED"` and `rawDescription: null` together, with a second pass
  that catches up reports a coordinator archived by hand once they reach the
  same age. `Incident.rawDescription` is nullable and null is the deletion —
  not a placeholder, which is a value a reporter could have typed.
  `20260820100000_archive_deletes_raw_description` drops the NOT NULL and
  clears the rows already sitting archived (none on this deployment). Applied by
  `database.yml` on 21 August, when PR #5 merged.

  **Never run.** No cron has ever fired here at all, so the first execution of
  this is also the first execution of the job. Read the response body: `archive.
  archived` and `archive.rawWordingDeleted` are separate numbers and the second
  is the one that cannot be undone. `/privacy`, `docs/DPIA.md` and
  `docs/APD_TEMPLATE.md` all changed in the same commit.

- **Per-village incident numbering** — `35b9508`, v0.1.25. `VW-HIS-2026-0003`
  is the village's own count for the year rather than a platform-wide sequence.
  `reference` is no longer `@unique`; the constraint is
  `@@unique([villageId, referenceYear, villageIncidentNumber])`.
  `20260803120000_incident_village_numbering` backfills the rows that already
  existed. This is the one migration `database.yml` has applied for real.
- **Server-side PDF of the community safety report** — `3797e6f` (v0.1.26) and
  `dbd85ee` (v0.1.27). `GET /api/reports/[villageId]/pdf` renders the same
  document the page shows, identical whoever presses the button. The print
  button is gone — two buttons producing two different PDFs is worse than one
  producing a predictable file. Never built from a real village's reports; the
  layout was settled against fixtures.
- **Facebook share beside the WhatsApp copy button** — 11 August 2026. A third
  button on `CopyAlert`, so the same three coordinator surfaces now offer the
  same alert to `facebook.com/sharer/sharer.php` as well as to WhatsApp. The
  share URLs moved into `src/lib/format-alert.ts` beside the format they carry,
  over the now-exported `incidentUrl`, so the Facebook card and the "View
  details" line in the text cannot point at different reports. No new gate, no
  new audit row, no environment variable — it is the same act as the WhatsApp
  paste and `/privacy` §6 covers both in one entry.

  **Two things to watch on the first real share.** Facebook honours the `quote`
  parameter inconsistently and usually drops it, which is why the button copies
  the alert to the clipboard before it navigates — check whether the composer
  actually arrives prefilled, and if it never does, the note under the buttons
  is what carries the feature. And `/incidents/[id]` is behind
  `requireSession()`, so Facebook's crawler scrapes the sign-in redirect: the
  card should fall back to the site's own OG image and tagline, which is the
  right outcome but has never been seen — the OG image has never been fetched by
  a real crawler at all.

### Pending — needs confirming against the deployed database

- **Compliance gate migrations** (`20260728090000_village_compliance_gate`,
  `20260728150000_village_dpa_gate`). The two documents that disagreed now
  agree: `docs/E2E_VERIFICATION.md`'s addendum was the older of the two and has
  been corrected to match the `database.yml` run that reported `Database schema
  is up to date!` on 3 August. **All ten migrations that existed then are
  applied**, so the gate is live and every village in the directory is refusing
  reports until somebody accepts all three documents on `/dashboard/compliance`.
  (This read "the seeded village" until 31 August; there is no seeded village —
  BACKLOG L7.) The eleventh, `20260820100000_archive_deletes_raw_description`,
  is new and is not applied yet.

  That reconciles the record; it does not *verify* it, and the difference
  matters because it is visible to residents. **Confirm with `npx prisma migrate
  status` against `DIRECT_URL` before planning around it** — no machine in this
  pass had database access, so what has been done is to make the documents stop
  contradicting each other on the strength of the workflow log, which is the
  better of the two sources rather than a first-hand check.

- **No acceptance has ever been recorded**, either way. Nothing has been blocked
  by the gate and no village has been through that screen.

### Still open (see `BACKLOG.md` for the numbered list)

- A directory village **can** be claimed from cold — `activateVillage` in
  `src/lib/villages.ts`, behind `/admin/villages`, mints the code and flips the
  status — but **nobody has ever run it**. All 270 seeded parishes are still
  `PENDING`, so the operational gap is real even though the code gap closed on
  27 July. Activating the first one is the next thing to do, and it now has to
  be done properly: the code it mints is actually demanded at registration.
- `DATA_CONTROLLER` in `src/lib/constants.ts` is still placeholders, so
  `/privacy` names no controller.
- ~~No push has been delivered to a real device~~ — **closed 31 August**, and it
  was never a code gap (B3/L4). The retention job has still never run; erasure
  has never touched a real bucket; no WhatsApp alert has been pasted into a real
  channel; no email has reached a real inbox; nobody has voted on a report.
- No staging environment — CI, unit tests and auto-versioning exist, but there
  is nowhere to run a migration before production sees it.
- **Auto-posting a published report to a village's channels is planned and not
  built** — `docs/AUTO_POST_CHANNELS_PLAN.md`, covering `BACKLOG.md` N7 and N8.
  Nothing in the codebase makes an outbound call to any social platform:
  WhatsApp is a log line plus a coordinator's clipboard, Facebook is a
  `sharer.php` link a human clicks, and there is no Telegram code at all. Four
  items, in the order the plan recommends — a shared dispatcher and a
  `ChannelPost` record first, changing no behaviour at all; then Telegram, which
  is free, official and needs no review; then a Facebook Page, whose two-to-six
  weeks of Meta App Review should be started while Telegram ships; and WhatsApp,
  which is scheduled for nothing, because Channels have no publishing API, the
  Cloud API is a different product that bills per message and needs residents'
  phone numbers, and the relays that offer it get the number behind them banned.
  Three findings are worth knowing before anybody starts. The hook belongs in
  `notifyIncidentPublished` and **not** on a publish route — there is no publish
  route, there are two publish paths, and the coordinator's Approve click is a
  server action, so a route hook would miss every report a coordinator approves.
  A report whose `anonymized` is false must never be auto-posted, because
  `CopyAlert`'s red warning is a human reading the reporter's own wording before
  pasting it and automation is what removes that person. And there is still no
  `ACTIVE` village to post for, which would make the first automated post the
  first post of any kind.

---

## Built, but never exercised against reality

**A code path is not a feature.** Every row here has a complete implementation,
passes its unit tests where it has any, and has never been run against a real
database, bucket, device or recipient. Nothing in this table should be described
as working — to anybody, and least of all in a grant application.

| Feature | What has never happened | What to watch on the first run |
| --- | --- | --- |
| ~~Push notifications~~ | **Delivered to a real device, 31 August** | Out of this table. Both failure modes were silent and both are now known-good: the `/onesignal/` worker path and the three keys reaching Vercel with a redeploy behind them. Re-check with `curl -I https://villagewatch.app/onesignal/OneSignalSDKWorker.js` after any OneSignal dashboard change |
| The retention job | Never run against data | It deletes files and takes reports off the map. Read the counts in the response before trusting the schedule |
| Erasure | `removeIncident` / `eraseAccount` have never touched a bucket | Confirm the object is gone, not just the row |
| The weekly digest | Cron has never fired | It is the only thing that creates `PatternAlert` rows — and nothing renders them |
| The compliance gate | No acceptance recorded, nobody refused | The 403 actually reaching a resident is the part no unit test can assert |
| Auto-approve | Nothing filed through the published-on-submit path | Status, push, audit rows, and — if channel posting is also on — what lands in the channel |
| The privacy level | No photo uploaded at a level somebody chose | Attach a face at `light` and again at `heavy` and compare the two files |
| The WhatsApp alert | Nothing pasted into a real channel | A report where the AI pass did **not** run: `anonymized` is false and the description is the reporter's own wording |
| The village invite | Never scanned | Camera → `/join/[slug]` → `/register` → a `VERIFIED_RESIDENT` row. Print one QR sheet before printing a hundred |
| The heatmap | Never drawn over real reports | `leaflet.heat` reads `L` off the global scope; the failure is a silent no-op layer, not an error |
| The PDF report | Never built from a real village's reports | Resident-written `locationText` and titles are where an unbreakable run comes from; `?analysis=ai` has never reached Anthropic from that route |
| The period controls | No database holds ninety days of reports | `/dashboard` — a stat card keyed to a different window from the breakdown beneath it is the failure that looks correct |
| Password recovery | No email has ever been sent through it | Supabase's redirect URL must be allow-listed or the link dead-ends |
| OG image, `robots.txt`, `sitemap.xml` | Never fetched by a crawler | — |
| The coordinator flow end to end | Never run | The **suite** now asserts that a village with auto-approve **off** files `PENDING_REVIEW` (`tests/incident-create-route.test.ts`, 27 Aug). What has never happened is the chain: no compliance acceptance exists, so step one 403s, and the coordinator's push depends on L4 |
| Incident votes | Nobody has voted; migration 14 is unapplied | The toggle across two devices, the concern panel's ordering, and a village with one vote producing **no** report section rather than one with a single line in it |
| Email from the app | No message has reached a real inbox | An unverified Resend sending domain is refused and the refusal is only in the server log; both env vars have to reach Vercel |
| The Supabase auth templates | Never pasted into the dashboard | Outlook's Word engine is the one that surprises people; the fallback link under the button is what a client that eats the button table leaves behind |

---

## Where the code and the documents disagreed

Found 5 August 2026 by reading the code against `CLAUDE.md`, widened to
nineteen items by a second pass, and **closed on 13 August** by
`fix/audit-code-vs-docs`. Kept here rather than deleted: the shape of these is
the useful part, and two of them were live security holes that read as features
in the documentation.

### Fixed in the code

1. **`checkVillageJoin` was never called, and both auth routes accepted a blank
   join code.** The check is `joinCode && !codeMatches`, so a *wrong* code was
   refused and an *empty* one short-circuited straight past — anybody who could
   see a village in the picker could join it by leaving the field blank, landing
   as a `RESIDENT` inside the tenant boundary every incident query is scoped by.
   The guarded logic that "requires the code whenever a village has one" was
   written, documented, exported and dead. Both routes now call it, and
   `tests/village-join.test.ts` covers the blank case first.

2. **Two village-lifecycle modules, and half of one was dead.**
   `src/lib/village.ts` had its own `activateVillage`, `suspendVillage`,
   `reactivateVillage`, `regenerateJoinCode` and `saveVillageAdminSettings`, and
   nothing outside the file called any of them — `/admin/villages` imports from
   the plural module. Its live half (the reads, and `checkVillageJoin`) moved
   into `villages.ts` and the file is gone. The dead `appointCoordinator` and
   `removeCoordinator` in `coordinator-requests.ts`, reachable only from it,
   went with it. `activateVillage` also now mints the join code **before** it
   flips the status: with the code enforced, an `ACTIVE` village holding a null
   one is a village anybody can join.

3. **Moderation's audit rows carried no address.** Every row written from a
   route handler filled `ipAddress` and `userAgent`; every row written from a
   server action did not, because a server action has no `request` — which left
   publish, reject, `raw_viewed` and edit, the four that matter most in the
   trail, as the four with nothing against them, while `/privacy` §2 told
   residents all of them were recorded. `src/lib/audit-context.ts` resolves it
   from `next/headers` inside the write, so no call site can forget.

### Fixed in the documents

4. **`coordinator-requests.ts` is not "the only place in the codebase that
   raises a role"** — `appointCoordinator` in `villages.ts` is the other, and it
   has to be: an application comes *from* a resident, so a cold village has
   nobody who can file one. This one was the sentence being wrong rather than
   the code; `CLAUDE.md` now names both and the rules they share.

5. **`/privacy` claimed a resident's original wording was deleted when a report
   was archived.** The retention job's archive step is `status: "ARCHIVED"` and
   touches no other column. A false sentence in a privacy notice is worse debt
   than a missing one, so the notice now says what actually happens — the wording
   stays with the report, restricted and audited on every read, and goes when the
   report or the account is erased, both of which are the resident's to trigger.

6. **The face-covering default was documented as the black box and is the
   standard blur.** Two constants: `DEFAULT_REDACTION_MODE` is `redact` and has
   no caller; `DEFAULT_PRIVACY_LEVEL` is `standard` and is what every upload
   actually gets. The second is the one to quote.

7. Plus twelve counting and pointer errors — the migration count (10), the test
   count, the model count (10), the "three claims" that were five, the "exactly
   twice" canonical origin that was written out six times (now centralised
   behind `APP_HOST`), the append-only trigger's NULL carve-out, the missing
   `reportNarrative` rate limit, `village activation` still listed as the
   blocker it stopped being on 27 July, and the structure block's missing
   modules, routes, components, tests and documents.

**The one that keeps happening** is worth naming: every item above except 5 and
6 is a sentence that was true when written. The rule that catches them is
already in the Definition of Done — the documentation making a claim about a
behaviour changes in the *same commit* as the behaviour, not in a later pass.

---

## Known blockers

- **`database.yml` and the `DIRECT_URL` secret.** The secret is an
  **environment** secret on `Production`, and an environment secret is invisible
  to a job that does not name one — the expression resolves to an empty string
  with no warning, so the workflow reported success and applied nothing on every
  run for as long as it existed. Fixed in `5b76757` by naming
  `environment: Production` on **both** jobs, and that fix is in `main`.

  What remains is the consequence rather than a bug: `preflight` has to enter
  the environment to read the secret, so if a required reviewer is ever added
  under Settings → Environments → Production, every run needs approving
  **twice**. Moving `DIRECT_URL` to Settings → Secrets and variables → Actions
  at the repository level buys that back and lets `preflight` drop the
  environment line. The full reasoning is in the header of
  `.github/workflows/database.yml`.

- **Docker pre-flight for deploys.** Reported as a blocker on the deploy path.
  Nothing in this repository references Docker — no Dockerfile, no compose file,
  no mention in any workflow — so this is a constraint on the machine doing the
  work rather than on the code, and it is not reproducible from a fresh clone.
  Whoever hit it: write down the exact command and the exact failure here, or it
  cannot be fixed by anybody else.

- **No staging Supabase project.** This is why `database.yml` is not in the
  Vercel build command: a build-command migration would run against whatever
  `DIRECT_URL` the environment held, and a PR preview would migrate production.
  It is also why a migration that DROPs or renames has to be run by hand, with
  the deploy landing first.

---

## Recent completions

**The four high-severity audit findings, closed — 30 August 2026.** `VW-14`,
`VW-01`, `VW-02` and `VW-19`, plus the two Mediums that travel with the first —
`VW-15` and `VW-16` — and half of `VW-20`.

- **`VW-14` — the audit trail can no longer be forged.** `INSERT` on
  `audit_logs` is revoked from `authenticated` and `audit_logs_insert_self` is
  dropped. `vw_audit_logs_append_only()` gained an INSERT arm refusing the role
  outright, so the constraint survives somebody re-granting later — a forged row
  in an undeletable table is the one mistake in that file with no correction
  afterwards. Nothing in the app noticed: every audit write is Prisma as the
  owner, and the only thing reached through the Supabase JS client is Storage.
- **`VW-15` and `VW-16` went with it.** `INSERT, UPDATE` on `villages` is
  revoked and both admin policies dropped — that grant was table-wide, carried
  no village predicate, and was gated on `users.role = 'ADMIN'`, which nothing in
  the app sets and which reached `join_code`, `auto_approve`, `privacy_level` and
  all four compliance timestamps. `email` joined the privilege-column trigger.
- **The two detection queries are the part still owed to a human.** Re-running
  `rls_policies.sql` closes all three going forward and says nothing about
  whether they were used. The Verify section at the foot of that file now carries
  a query for audit rows whose `actor_email` disagrees with the profile behind
  `actor_id`, and one for any `users` row still holding `role = 'ADMIN'`. Run
  both against the deployed database. Rows the first returns **cannot be
  deleted** — that is the trigger working — so the answer is a record, not a
  clean-up.
- **`VW-01` — the session cookie is `HttpOnly`, `Secure` in production, and
  lives seven days** instead of four hundred. One module,
  `src/lib/supabase/cookie-options.ts`, shared by both `createServerClient`
  calls, because the proxy rewrites these cookies on nearly every navigation and
  a flag set in one place only is a flag the next page load undoes. **The
  lifetime could not be passed through `cookieOptions`** — `@supabase/ssr`
  spreads the caller's options and then overwrites `maxAge` with its own default,
  in both write paths — so it is clamped in `setAll`, with `Math.min` so a
  sign-out's `maxAge: 0` is not raised to a week.
- **`VW-02` — there is a Content-Security-Policy.** `src/lib/csp.ts`, applied by
  the proxy on every response including both redirects, with a per-request nonce.
  Three things the audit's sketch did not have, each found by reading what the
  code actually loads: `'wasm-unsafe-eval'`, without which MediaPipe's face
  detector cannot run and a reporter cannot attach a photograph at all;
  `cdn.jsdelivr.net` in `script-src` as well as `connect-src`, because
  `FilesetResolver` loads the WASM glue with `createElement("script")`; and the
  two service workers served **without** the header, since `importScripts` has no
  nonce to inherit and would be refused.
- **Six prerendered pages became `force-dynamic`, and that was the discovery.**
  A page built before the request has no nonce to stamp on its scripts, so
  `'strict-dynamic'` blocked every script on `/`, `/privacy`, `/terms`,
  `/forgot-password`, `/account-closed` and the 404 — HTML arriving, React never
  hydrating, nothing in a server log to say so. Measured against `npm run start`
  and a real browser: 0 nonced scripts before, all of them after, and the
  landing page confirmed hydrating under the enforcing policy with no violations.
  `/forgot-password` was the worst of the six, its form being a Client Component.
- **`CSP_REPORT_ONLY=true` is the fortnight the audit asks for**, and it is worth
  taking before enforcing on the live deployment. The public pages are verified;
  the three surfaces most likely to violate — the Leaflet tile layer, the WASM
  blur, and whatever OneSignal loads after its bootstrap — need a signed-in
  resident of a live village, which does not exist yet.
- **`VW-19` — `DATA_CONTROLLER` is filled in, as a contact route rather than as
  a claim of control.** Yakasista Ltd, `Cambridge` / `United Kingdom`,
  `info@yakasista.com`, ICO `Registration pending (ref: C2018564)`. `/privacy` §1
  publishes them in one box headed **Operator (processor)** which says in bold
  that it is not the controller and to write there if your village has not named
  one; §13 points a subject access request at the same address with a working
  `mailto:`. §1 still explains both models — council or coordinator — before any
  of it. That closes the Article 13 gap the finding is actually about: a resident
  had nowhere to write, and now has somewhere.
- **Filling it in put a self-contradiction on `/privacy`, and only the rendered
  page showed it.** §1 draws a box for the fallback controller and, beneath it, a
  box for the operator declaring in bold that it is **not** the controller. With
  both naming Yakasista Ltd the page presented the same company as the controller
  and then denied it, in adjacent blocks. `FALLBACK_CONTROLLER_IS_OPERATOR`
  merges them; the two-box shape stays for a genuine third-party controller. The
  test guards on the two constants directly rather than on the flag — guarding on
  the flag would mean breaking the flag switched the assertion off, which was
  caught by mutation-checking it.
- **`CONTROLLER_LABEL` deliberately stopped following the constant.** Two of the
  six `/terms` sentences are written *about* the role — §1's "read it as
  whichever of the two runs your village" and §12's "in most villages that is
  your coordinator" — so a company name substituted in tells a reader to treat a
  named third party as their own coordinator. It is the role phrase
  unconditionally now, and `/terms` reads exactly as it did.
- **Three fields needed a judgement rather than a value.** No telephone is
  published (`null`, not a placeholder — Article 13(1)(a) asks for contact
  details, not a telephone, and an invented number is worse than an omitted one);
  the registered address is not in this repository, so it is the town and country
  rather than an invented street; and `HAS_DATA_PROTECTION_OFFICER` is `false`
  with the **correct** reason recorded — Article 37(1)(c) and scale, not the
  250-employee figure, which is Article 30(5) and about records of processing.
- **`LEGAL_LAST_UPDATED` moved to 30 August 2026**, for the first time since it
  was written, because §1, §13 and `/terms` §12 all changed substance. That is
  half of **VW-20**; the test that would make the rule mechanical is still open.
- **What is left of L2 is not a code change**: the ICO registration itself
  (C2018564, pending), naming the controller for the first pilot village, and a
  review by somebody with UK data-protection standing. Naming Yakasista Ltd as
  the *controller* would still be the wrong fix — it is the processor in both
  models and `COMMUNITY_DPA.md` makes the coordinator personally answerable — and
  the page is careful not to.

**Application security audit — 29 August 2026.** A source-level review of the
whole tree against six domains: Next.js and Vercel, Supabase Auth, row-level
security, UK GDPR, the four integrations, and the supply chain. Written up in
`docs/SECURITY_AUDIT_2026-08-29.md`, which is read by people and rendered by
nothing — so, like `LAUNCH_BLOCKERS.md`, it needs **no**
`outputFileTracingIncludes` entry.

**Thirty-four findings, none Critical, four High.** Nothing found is a remote
unauthenticated compromise. The audit itself changed no code — it is a report —
and the **first rung of its "Order of work" was cleared on 30 August 2026**; see
the entry above this one. What each finding said:

- **`VW-14`, the worst of them.** `audit_logs` grants INSERT to `authenticated`
  and the policy checks only `actor_id`, so any resident with the public anon key
  can write rows carrying somebody else's `actor_email`, `actor_role` and
  `village_id` — and `vw_audit_logs_append_only()` rejects DELETE from the owner
  too, so they cannot be removed without a DBA disabling the trigger. Nothing in
  the app writes audit rows through PostgREST, so the fix is to revoke the grant.
- **`VW-01`.** Neither `createServerClient` call passes `cookieOptions`, so the
  session cookies take the `@supabase/ssr` defaults — `httpOnly: false`, no
  `secure`, 400-day life. The browser client has only two call sites and neither
  reads a session, so the flag can be set.
- **`VW-15` and `VW-16`.** `villages` grants an unscoped INSERT/UPDATE to any
  row with `role = 'ADMIN'` — including the four compliance timestamps — and
  `users.email` is missing from the privilege-column trigger while the admin push
  audience is resolved by matching it.
- **`VW-19` and `VW-20`** are the two legal ones and one is already L2:
  `DATA_CONTROLLER` is still placeholders with no ICO registration started, and
  `LEGAL_LAST_UPDATED` has read 27 July through five substantive rewrites of
  `/privacy`.

The report's "Order of work" section sequences all thirty-four. The first rung —
two `REVOKE`s, two trigger clauses and one `cookieOptions` object — is done, and
so is the CSP that was rung two. **The audit document itself was not edited**:
CLAUDE.md's note on it says it is a record of one pass rather than a living
document, and that the next pass gets its own dated file.

**The five launch blockers, audited — 27 August 2026.** Every one of L1–L5 was
read against the code rather than against its own status line, which mattered:
two of the five were recorded as less finished than they were, and one was
recorded as more.

What changed in the repository, and the boundary is the point — **none of these
activates a village, accepts an agreement, registers with the ICO or delivers a
push**:

- **L5's named gap is closed**, and the rider that came with it was wrong.
  "Nothing asserts that a village with auto-approve off still queues" appeared in
  `BACKLOG.md`, in `CLAUDE.md` and in `docs/E2E_VERIFICATION.md`, each time
  saying it needed a database. `tests/incident-create-route.test.ts` is 23
  assertions and needs none: mocking Prisma, the session, the compliance gate and
  the two dispatches at their boundaries leaves the route's own decisions
  exercisable, which is what the retention and vote route tests already do.
  `getVillageAutoApprove` is left **real** with its `SELECT` mocked, so "a
  database error means the queue" is exercised through the route rather than
  against a stub told to answer false. It was mutation-checked — replacing
  `autoApprove ? "PUBLISHED" : "PENDING_REVIEW"` with a bare `"PUBLISHED"` fails
  four of its assertions — so it is known not to pass vacuously.
- **L2 stopped leaking.** `/privacy` §13 was telling residents to send their
  subject access request to `[contact@example.uk]`, and `/terms` said "neither
  VillageWatch nor [Data controller name] is liable". Both pages branch on
  `HAS_FALLBACK_CONTROLLER_DETAILS` now. **The constant is still placeholders and
  that is not the same statement**: the controller genuinely differs per village
  and these two pages cannot read one, so there was never a single true name to
  put there — which is why "fill in the constant" was never the whole fix and why
  this survived eight weeks.
- **L1's last unwritten document is written.** `docs/BREACH_PROCEDURE.md`, DPIA
  action A10, which had been *Blocker / Not started* since 27 July and was the
  only one of the five blocker actions with no document at all. It is
  deliberately **not** added to the compliance gate — a fourth document there
  would re-close every village that has been through it.
- **L3 gained a CLI.** `scripts/activate-village.ts`, dry run by default. It
  calls `activateVillage` and `appointCoordinator` unchanged rather than
  reimplementing them, and enforces the same `ADMIN_EMAILS` gate the screen does
  — both refusal paths verified against an unreachable database, so they are
  known to happen before anything is read. It exists because activating the first
  village through `/admin/villages` needs `ADMIN_EMAILS` in Vercel **and a
  redeploy for it to take effect**, which is a fair part of why 270 parishes have
  been `PENDING` since 27 July with complete, audited code to activate them.

**The finding worth carrying forward: DPIA action A4 was not "not started", it
was unrecorded.** `docs/COORDINATOR_GUIDE.md` §"Rejecting" names every ground A4
asks for — what to reject, a report about a child, the "house with the blue
door" identification — and §"Privacy responsibilities" covers misuse. The DPIA
said *Not started* for a month. That is the **second** time a status line in this
project outlived its own truth; the first was L3's join-code enforcement, which
`BACKLOG.md` recorded as done for seventeen days while both auth routes accepted
a blank code. Both were caught by reading the code rather than the file.

**What none of this closes**, and it is the whole remaining critical path:

| Blocker | The act nobody has performed |
|---|---|
| L1 | No compliance acceptance has ever been recorded, in either model. Every village is refusing reports right now |
| L2 | Nobody has decided who the controller is; nobody has registered with the ICO — the longest lead item |
| L3 | No village has ever been activated. There is no `ACTIVE` village at all — the seed placeholder this row named until 31 August was never in this database (L7), so the first activation lands in an empty directory |
| ~~L4~~ | **Done 31 August.** The three variables, the redeploy and the four dashboard fields are all in place, and a push has reached a real device |
| L5 | The chain has never been walked. **L4 no longer blocks it**; L1 still does — the compliance gate is live and no acceptance has ever been recorded, so step one 403s |

`docs/LAUNCH_BLOCKERS.md` carries the runbook for each, with the OneSignal
service-worker fields written out — including the **updater filename**, which is
a separate dashboard field defaulting to a v15 name this repo does not have, and
a 404 there reports a perfectly healthy init that never delivers.

---

**The AI rewrite limit was five an hour and residents were meeting it inside one
report — 25 August 2026.** Reported from the field: "You have used this hour's
automatic rewrites. Try again in 13 minutes" after a handful of uses.
`RATE_LIMITS.aiProcess` is **30/hour** now. Three things worth keeping:

- **Five was tighter than the filing limit it sits in front of.** Its comment
  called five "roughly two full reports with a reprocess each", which assumed a
  reporter who writes a description once and does not revise it. `aiSignature`
  in `incident-form.tsx` keys on the description, so every edit-and-preview is a
  fresh call and "Reprocess" forces one regardless — one report refined four
  times spent the hour. Against `incidentCreate`'s ten reports a day that was
  the wrong way round: the cheap call was rationed harder than the expensive act
  it precedes.
- **The route is spent by the report wizard and by nothing else.** The original
  report described a coordinator batch-reviewing incidents, and that flow does
  not touch this quota at all — `/dashboard/queue` and `/incidents/[id]/edit`
  never call `POST /api/incidents/process`, and the edit form runs no
  re-anonymisation pass. Whoever met this was *filing*, not reviewing. Worth
  knowing before the next report of it is read as a queue problem.
- **The clock-aligned window is why the wait reads as arbitrary.** "13 minutes"
  means they hit it at :47; the same limit spent at :05 is a fifty-five minute
  wait. That is inherent to the fixed window, which is what buys the
  single-statement atomic increment, so the answer taken was a limit ordinary
  use never meets rather than a sliding window. Noted in the module header.

Nothing else moved: same table, same key, same fail-open, same 429 shape, and
the wizard still falls back to the reporter's own wording when it is refused.
`tests/rate-limit.test.ts` had one assertion written out as `[4, 3, 2, 1, 0]`,
which is a test asserting a constant back to itself — it derives from
`rule.limit` now, so the next move of this number does not need it edited.

**The coordinator guide caught up with the code, and there is a printable copy
of it — 23 August 2026.** `docs/COORDINATOR_GUIDE.md` had not moved since the
community-mode work, so it described a version of the app that is several
features behind. What was missing was a whole section's worth: the period
control the Dashboard, the incident list and the map now share; the Dashboard's
figures, breakdowns and hotspot list; the map's pins/heatmap toggle; what a
pattern note on a report actually means and what its thresholds are; the weekly
summary, which the guide mentioned once in a tip and never explained; the Home
Office's recorded-crime panel and the neighbourhood policing team beside it —
the largest gap, and the one a coordinator is most likely to be asked about at a
parish meeting; the invite panel, QR code and printable sheet, which the guide
did not know existed; and the audit trail, which it referred to five times and
never described. All of it is in a new **Reading your village** section.

Four corrections to what was already there, one of which was a real fault:

- **"You are acting for the council" said every coordinator acts for a parish
  council**, which has been false for the majority of villages since community
  mode shipped — the community model makes the *coordinator* the data
  controller, with nobody above them. It is mode-aware now, like the rest of the
  guide already was. This is the sort of stale sentence the Definition of Done's
  documentation rule exists to prevent, and it survived the mode work because it
  sits in a section nobody was editing.
- **Reading a reporter's original wording** now says what happens after twelve
  months: the wording is deleted with the archive, the button says so rather
  than showing anything, and that press writes no audit row.
- **Getting started gained a sixth step** — inviting the village, which is what
  actually puts residents in it and was buried in "Managing your community".
- **How residents join** now covers the two emails a new resident gets, the
  welcome among them, and the hourly quota a village onboarding twenty
  households in one evening can reach.

**The vote buttons are in it too**, as "What the village makes of a report" —
the buttons themselves, the fact that a vote deliberately moves nothing, that
nobody is ever named, the Dashboard panel and its three orderings, and the
"Most concerning to residents" section of the period report with the caveat that
has to travel with it.

**`scripts/generate-guide-pdf.tsx` is the printable copy** — 24 A4 pages,
committed as `docs/VillageWatch-Coordinator-Guide.pdf`. It parses the guide with
`src/lib/markdown.ts`, the same parser `/dashboard/guide` renders through, so
the two cannot describe different software; see "The coordinator guide, on
paper" in `CLAUDE.md` for why that mattered more than reaching for a
markdown-to-PDF dependency. **It is a build artefact and goes stale silently —
rebuild it in the same commit as any change to the Markdown.**

Nothing in the application changed. `npm run build`, `npx tsc --noEmit`,
`npm run lint` and `npm run test` all pass.

**The police-data cron ran for the first time, and it took two bugs to do it —
22 August.** The first scheduled run of `/api/cron/police-data` failed for every
village. Both faults are fixed and both now have a test that fails without the
fix.

- **`keepExistingCrimes` reached Prisma.** `recordSync` passed its whole
  argument object to the `policeDataSync` upsert, and that object carries a flag
  that is application logic — it decides whether the stored month is cleared —
  and is on no model and in no migration. Prisma rejected the write as an
  unknown field. It is destructured out now. **This was never schema drift**,
  which is worth stating because it looked exactly like it: the column has never
  existed anywhere, and the migration is applied. Nor could the typechecker have
  caught it — excess-property checking applies to object literals, not to a
  variable carrying more properties than the parameter type names, so
  `npx tsc --noEmit` was clean throughout. `tests/police-data.test.ts` asserts
  the written columns instead.
- **It only fires on the failure path**, which is why it survived review and why
  it took a real run to find. `recordSync` is called only when a fetch has
  already failed, so the bug needed the second one to expose it.
- **The pace is 1 request a second now, down from the documented 15.** Every
  village came back 429, so data.police.uk is stricter in practice than its own
  documentation says and 15/s is not a pace to build on.
  `POLICE_SYNC_MAX_REQUESTS` came down with it, from 120 to 40, and that is the
  part worth remembering: at 15/s the route's 60 seconds were never the binding
  constraint, while at 1/s 120 calls is 120 seconds of pacing inside a function
  killed at `maxDuration` — the timed-out-halfway-through failure the budget
  exists to prevent, and the one that leaves no record, because the response
  saying where the run got to never gets sent. The three figures are now coupled;
  move one and check it against the other two.
- **The suite stayed fast.** The pacer is module state that outlives a test, so
  at 1/s every request in `police-api.test.ts` queued behind the last one and the
  file went from 1.8s to 23s. The tests wind a fake clock forward instead of
  sitting through a production politeness pace; the pacer keeps its real state,
  so the one test that measures the wait still fails when the pacer is removed —
  checked by removing it. 27 files, 436 tests, ~3.5s.

**What this run did not settle.** The sync has still never completed against
data.police.uk, so everything under "Built, but never exercised against reality"
about the police figures stands: the neighbourhood lookup, the availability
list, a real month's volume, and the two freehand fields. The next run is still
the first real one.


Newest first. Dates are the commit's, versions are the release the commit
landed in.

| Date | Version | Change |
| --- | --- | --- |
| 20 Aug 2026 | unreleased | Community Mode — a two-tier compliance model, one agreement for a village with no council, and the controller's duties in plain English (N17, `feat/community-mode`) |
| 20 Aug 2026 | unreleased | Archiving deletes the reporter's original wording, and catches up the reports a coordinator archived by hand (T10, `fix/archive-clears-raw-description`) |
| 13 Aug 2026 | v0.1.29 | The join code is enforced — both auth routes call `checkVillageJoin`, which had never been called; the two village modules became one; moderation's audit rows carry an address; nineteen code-versus-documentation contradictions reconciled (PR #4) |
| 11 Aug 2026 | v0.1.28 | Facebook share button beside the WhatsApp copy button (`2af3cb6`) |
| 4 Aug 2026 | v0.1.27 | Removed the print button from `/reports` — the server-rendered PDF replaces it (`dbd85ee`) |
| 4 Aug 2026 | v0.1.26 | Download the community safety report as a PDF, rendered server-side so the file is identical every time (`3797e6f`) |
| 3 Aug 2026 | v0.1.25 | Show the build version in the app sidebar, `/settings` and both footers (`fe89f41`) |
| 3 Aug 2026 | v0.1.25 | Incident references numbered per village and per year — `VW-HIS-2026-0003` (`35b9508`) |
| 3 Aug 2026 | v0.1.24 | Keep the printed report inside the page — `table-layout: fixed` and per-column print widths (`3dec689`) |
| 29 Jul 2026 | v0.1.23 | Stop a custom date range walking forward a day on every submission (`8e74c55`) |
| 29 Jul 2026 | v0.1.22 | SEO: `robots.txt`, `sitemap.xml`, the share card, per-page canonicals and the JSON-LD graph (`ca3ac6f`) |
| 29 Jul 2026 | v0.1.22 | Choose the period on the map, the incident list and the dashboard — one resolver, three surfaces (`f893eac`) |
| 28 Jul 2026 | v0.1.21 | Compliance gate asks only for the documents still outstanding (`0a79c9f`) |
| 28 Jul 2026 | v0.1.21 | Invite QR code and the map heatmap overlay (`aae92e7`) |
| 28 Jul 2026 | v0.1.20 | `villagewatch.app` is the real origin, and the fallback when `NEXT_PUBLIC_APP_URL` is unset (`4ca3e9d`) |
| 28 Jul 2026 | v0.1.19 | A real favicon set, generated from the brand mark rather than Next's default (`1fc852f`) |

`CHANGELOG.md` is the full generated history; this table is the readable
shortlist.
