# VillageWatch — project state

**Last updated:** 25 August 2026 · **Repo version:** `v0.1.43` · **Branch:**
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
| Repo version | `v0.1.42` in `package.json` on `main` — `version.yml` released voting, the email transport and the Supabase templates as 0.1.41, then the iPhone safe-area fix (PR #12) as 0.1.42. The map-corners fix bumps it to `v0.1.43` when it next runs |
| Version on screen | expect **v0.1.41** — the release commit carries `[skip ci]`, so production is built from the commit before the bump and sits one patch behind `main` until the next real change deploys. This is designed behaviour, not a failed deploy (see "The version on screen" in `CLAUDE.md`) |
| Database | Supabase Postgres + PostGIS, `eu-west-2` (London) |
| Migrations in repo | 14, `20260726161847_init` → `20260823120000_incident_votes`. **13 are applied; the fourteenth is not.** `20260823120000_incident_votes` lands with this change — one table and one enum, no column added to any existing table, and every read on top of it degrades to "no votes yet", so nothing a resident can do changes when it applies. **`rls_policies.sql` must be re-run with it**: a new table arrives with RLS off, and here that means the anon key could read who in a village thought which of their neighbours' reports was overblown. `postgis.sql` need not be — no geography column, on purpose. `database.yml` applied 11 on the merge of PR #5 and 12 on the merge of PR #6, both on 21 August, each followed by `postgis.sql` and `rls_policies.sql`. The thirteenth landed with PR #10 on 22 August: three new tables, no change to any existing one. **It is applied, and the first cron run is the evidence** — `syncVillagePoliceData` reads `police_data_syncs` before it fetches anything, so a missing table would have failed the run with `P2021` before a single outbound request; instead the run reached data.police.uk and came back with 429s. Nothing here was ever schema drift: `keep_existing_crimes` appears in no migration and on no model, and the bug that stopped the run was code passing a field that has never existed. **Still to confirm: that `rls_policies.sql` was re-run on that merge** — a new table arrives with RLS off, and until it is re-run every police row is readable with the anon key. `postgis.sql` does not need re-running, because there is no geography column in it |
| Villages seeded | 270 Cambridgeshire parishes, all `PENDING`; the only `ACTIVE` village is `prisma/seed.ts`'s placeholder |
| Test suite | Vitest, **33 files, 525 tests**, all passing (~3.5s; the pacer test spends 3s of that genuinely measuring the wait) — runs with no `.env.local` and no database. Unit only bar one: `period-control.test.tsx` renders three components to a string, which needs no DOM |
| CI | `ci.yml` (lint → typecheck → test → build), `database.yml` (migrate + both SQL files), `version.yml` (standard-version bump, stepping past a tag that already exists) |

---

## Active branches

| Branch | State | Action |
| --- | --- | --- |
| `main` | The working branch. Auto-deploys to production. | — |
| `fix/map-controls-overlap` | In review as a PR. The map's corners below — CSS and one Leaflet prop, two files plus the documents. | Review, merge, then look at `/map` on a phone |
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

  **The one finding that moves the critical path is L1's.** `Village.mode`
  defaults to `community`, where the gate asks for one document rather than
  three — so running the Histon pilot as a community village takes A1 (the
  council's Appropriate Policy Document), A2 (the countersigned Article 28(3)
  agreement) and the council's review of an Article 35 assessment off the
  pilot's path and replaces them with `COMMUNITY_DPA.md`, in force on
  acceptance. What it does **not** remove is A4 (coordinator review guidance),
  A10 (breach procedure) or A5/L2 — in community mode those attach to the
  coordinator, who is the controller.

- **`docs/MARKETING_GTM_PLAN.md`** — positioning, the coordinator-first funnel,
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

  **What has not been done is the part that stops the limit being hit**: the
  project is still on Supabase's built-in mailer, whose quota is small and which
  Supabase documents as being for development.
  `docs/SUPABASE_EMAIL_SETUP.md` is the procedure — raise the hourly limit under
  Auth → Rate Limits, and set Resend as the custom SMTP sender under Auth →
  Emails → SMTP Settings. Both are dashboard settings and neither is in this
  repository. **Resend is now used in the codebase as well**, through
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

  **Nothing has ever spoken to the service.** Migration 13 is unapplied, no sync
  has run, and the tests stub `fetch` and mock Prisma. Four things to watch on
  the first run — the neighbourhood lookup (a village centre resolving to a
  neighbouring parish's team is wrong in a way only somebody local spots), the
  availability list the month-selection strategy rests on, a real month's volume
  against `POLICE_MAX_CRIMES_PER_MONTH`, and the two freehand fields whose markup
  is stripped. None can fail a page; all four degrade, which is why they want
  looking at.

  **It is a third Vercel cron and Hobby allows two.** If this deployment is on
  Hobby the `vercel.json` entry has to go and the route be called from an
  external scheduler — it is `CRON_SECRET`-guarded and takes `?village=`,
  `?months=` and `?force=1`. Settle it before the first deploy of this branch.

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
  leaves the seeded village on `community` (nothing has been accepted anywhere,
  so it should), that accepting the one agreement actually opens reporting, and
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
  applied**, so the gate is live and the seeded village is refusing reports
  until somebody accepts all three documents on `/dashboard/compliance`. The
  eleventh, `20260820100000_archive_deletes_raw_description`, is new and is not
  applied yet.

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
- No push has been delivered to a real device; the retention job has never run;
  erasure has never touched a real bucket; no WhatsApp alert has been pasted
  into a real channel; no email has reached a real inbox; nobody has voted on a
  report.
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
| Push notifications | No push has reached a device | Both failure modes are silent — the worker path and the three keys reaching Vercel |
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
| The coordinator flow end to end | Never run | Nothing in the suite asserts that a village with auto-approve **off** still queues. This is the regression worth a route test |
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
