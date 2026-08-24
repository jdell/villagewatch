# VillageWatch — Backlog & Improvements Tracker

**Last updated:** 21 August 2026 (N15 closed and then finished — the
coordinator-facing copy follows `Village.mode` on all three screens, the share
panel on an incident included, and `/reports`' period control is one row with
the dates behind "Custom range". Earlier: N17 closed 20 Aug; T1 and T2 closed; L6 closed —
all ten migrations are applied; L3's join code is now actually enforced, which it
was not despite this file saying so since 27 July. Earlier still: B1, B2, B4, B5,
I1, I2, I3, N1, N9, N13, N14, T3, T4, T7, T8 closed; DPIA drafted; compliance
gate and the per-village face redaction level added; Article 28(3) processing
agreement drafted and added to the gate as L8)

**Note on numbering:** N5 is the WCAG 2.1 AA audit and is still open. The
time-range work is N13 — it was in "Can launch without", not in the N list.
**Repo:** https://github.com/jdell/villagewatch
**Domain:** https://villagewatch.app — canonical origin, `APP_ORIGIN` in
`src/lib/constants.ts`. `www` redirects to it; there is one origin, because
`NEXT_PUBLIC_APP_URL` is one value and a session cookie does not follow a
resident across hosts.

---

## Funding

Strategy, the five tracked opportunities and their status live in
`docs/FUNDING.md`; the first application is drafted in
`docs/GRANT_APPLICATION_NL_AI.md`.

| # | Item | Status | Details |
|---|------|--------|---------|
| F1 | National Lottery AI Programme | Drafting | £3m pot UK-wide via UK Community Foundations + CAST; window expected autumn 2026. Draft written and checked against the codebase — see its §Evidence. |
| F2 | Cambridgeshire PCC Community Safety Fund | Not started | £500–£35,000, rolling. Contact the PCC office for round dates. |
| F3 | Neighbourhood Watch Community Grants | Not started | £100–£300, annual; next round likely autumn 2026. |
| F4 | NL Awards for All | Not started | Up to £10,000, rolling — can be applied for at any time. |
| F5 | Innovate UK Smart Grants | Not started | £25k–£500k if framed as AI + privacy innovation. |

**A grant application is a statement about how the code behaves**, held to the
same rule as `/privacy`: change the behaviour and change the document. Three
claims are the ones that would be wrong if copied forward carelessly — the DPIA
is drafted rather than **completed** (L1), "GDPR compliant" is not available
until L1, L2 and L8 close, and the 270 seeded parishes are `PENDING` and cannot
be joined until they are activated (L6). The table at the foot of
`docs/FUNDING.md` tracks all six of these against submission.

---

## Running Tasks (in progress)

| Task | Status | Notes |
|------|--------|-------|
| Activate the first real village | Not started | `activateVillage` behind `/admin/villages` has never been run. All 270 seeded parishes are `PENDING`; the only `ACTIVE` one is the seed's placeholder (L7). This is the next operational step, and the code it mints is now genuinely required at registration. |
| DPIA sign-off | Running | `docs/DPIA.md` is written and is a template. It needs the council's review, the five blocker actions in its §9, and a signature. |
| Public invite page `/join/[slug]` | Done 28 Jul | Built with N9 — `/join/[slug]` is where a scanned QR lands and `/invite/[slug]` is the printable sheet. Both public, both `noindex`, and neither reads `joinCode` from the database: the code arrives in the query string or not at all. See I3. |
| First police-data sync | Not started | N10 shipped the whole path and nothing has run down it. Two steps, in order: apply `20260822120000_police_crime_data` and re-run `rls_policies.sql` (three new tables, each arriving with RLS off), then call `/api/cron/police-data?village=<slug>` by hand with the secret and read the response before trusting the schedule. What to watch is in "Not built yet" in `CLAUDE.md` — the neighbourhood lookup is the one whose answer only somebody local can check. |

---

## Bugs (must fix)

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| B1 | ~~Mobile menu unreachable~~ | Done 27 Jul | The drawer is `fixed inset-0 z-[1100] h-dvh`, above Leaflet's `z-[1000]` panes, with a separate backdrop child that animates independently of the panel and a `motion-reduce` escape. `h-dvh` rather than `h-screen`, so the browser chrome does not eat the last item. |
| B2 | ~~Face blurring too weak~~ | Done 27 Jul, **configurable 28 Jul** | Landed with I2 — the mosaic is a cell *count* (6 across) rather than a 12px cell size, so destruction no longer scales with the photo, and the Gaussian went 0.12 → 0.45 of the region's longest edge. Now a per-village setting: `Village.privacyLevel` picks light/standard/heavy/redact on `/dashboard`, and the level drives the Gaussian only. The six-cell mosaic is deliberately **not** on the scale, so no level a coordinator can choose puts a readable face back into an upload — what the scale moves is how much of the scene around the face survives. |
| B3 | OneSignal not sending push notifications | High | Verify: (1) OneSignal app ID correct, (2) service worker at /onesignal/OneSignalSDKWorker.js, (3) all 3 env vars set in Vercel, (4) browser permission granted, (5) user registered with OneSignal via OneSignal.login(userId). |
| B4 | ~~CSV download not working~~ | Done 27 Jul | The route and its headers were correct; the `<a href download>` was not. It saved every 401/403/503/500 under the export's name, so a failure looked like a corrupt spreadsheet. Now a fetch that checks the status and toasts the error, every exit from the route is JSON, formatting moved to `src/lib/incident-csv.ts`, and `tests/incident-csv.test.ts` covers it. |
| B5 | ~~Test data / stubs present~~ | Done 27 Jul | Swept `src/`, `prisma/`, `scripts/`, `tests/`, `public/`, `data/` and the config files. **No** TODO/FIXME/HACK/XXX anywhere, no hardcoded credentials, no mock timers, no fabricated ids outside the test suite. Two things changed: `ADMIN_EMAILS` in `.env.example` shipped a real address that grants platform admin, now blank (the fail-closed default the comment above it already described); and the seed's sample data is now tracked as a launch item rather than an assumption — see L7. Full findings in the commit message. |

---

## Improvements (next sprint)

| # | Feature | Priority | Details |
|---|---------|----------|---------|
| I1 | ~~Share summary with police/council~~ | Done 27 Jul | `/reports` — a period report with counts, breakdowns, hotspots and a Claude-written narrative (counted fallback when Claude is unavailable), plus a single-incident share button on any published report. One format for screen, clipboard, share sheet and print. **"Download PDF" is no longer `window.print()`** — as of v0.1.26 it is a server-rendered file from `GET /api/reports/[villageId]/pdf`, identical whoever presses the button, and the print button was removed rather than left beside it producing a second, different document. Ctrl+P still works against the `@media print` rules, which the invite sheet also rests on. Coordinator only, published and resolved incidents only, structurally incapable of carrying raw text or coordinates. The period report is audited; the share sheet deliberately is not, because an `await` before `navigator.share()` spends the user gesture and iOS refuses the call. |
| I2 | ~~Stronger face blurring~~ | Done 27 Jul, **configurable 28 Jul** | `FaceRedactionMode` — `redact` (solid black box) or `blur` (six-cell mosaic under a heavy Gaussian), recorded per file. As of 28 Jul the choice is the **village's**, not the reporter's: `Village.privacyLevel` (`light` 15px / `standard` 22px, the default / `heavy` 35px / `redact`) is set by a coordinator on `/dashboard` with a preview of each level, audited as `village.privacy_level_changed` (sensitive). The reporter keeps one control and it only points one way — black out faces completely — so nobody can file below what their village set. `tests/privacy-level.test.ts` covers the mapping, the fallback and the write schema. `/privacy` and the landing FAQ updated in the same commit; `/terms` never named a default, so it did not change. Needs `20260728120000_village_privacy_level`. |
| I3 | ~~Coordinator share invite link~~ | Done 28 Jul | Half landed 27 Jul with village activation, which minted a code to share; the sharing itself landed with N9. `InviteShare` on `/dashboard` → Village settings has the link, the code, copy buttons, a WhatsApp hand-off and the QR; `/join/[slug]` is where a scan lands and pre-fills `/register`; `/invite/[slug]` is the printable sheet a coordinator can send to whoever runs the noticeboard. Every surface builds its link from `buildJoinUrl` in `src/lib/invite.ts`, so the QR, the clipboard and the WhatsApp message cannot come apart. |

---

## Launch Blockers (remaining)

| # | Blocker | Status | Details |
|---|---------|--------|---------|
| L1 | DPIA | Drafted 27 Jul | `docs/DPIA.md` — 12 assessed risks, none high after mitigation, conclusion is "may proceed with mitigations". **Not signed.** Its §9 carries five blockers that are the council's to produce, not ours: an Appropriate Policy Document for criminal offence data (DPA 2018 Sch 1 Pt 4), an Article 28 processing agreement with Yakasista Ltd, coordinator terms and moderation guidance, real controller details plus ICO registration, and a breach notification procedure. Two of the five now have templates — the APD, and as of 28 Jul the processing agreement. |
| L8 | Article 28(3) processing agreement | **Template drafted 28 Jul** | `docs/DATA_PROCESSING_AGREEMENT.md` — DPIA action A2, and the third document in the compliance gate. Covers all eight Article 28(3) obligations, names the five sub-processors with what each actually receives, 30-day notice and a 14-day objection window on adding one, 24-hour breach notification to the council, audit rights, and deletion within 30 days of termination with written confirmation. **Not signed by either party**, and unlike the other two documents it takes two signatures — accepting it on `/dashboard/compliance` records the council's half and nothing more, which the screen says in as many words. Needs `20260728150000_village_dpa_gate`. Open on our side: the transfer mechanisms for Anthropic and OneSignal are marked *[verify]* in it (DPIA A9 and A11), and the Slack position is disclosed rather than covered (T7 / DPIA A3). |
| L2 | Privacy policy — real controller name | Not started | `DATA_CONTROLLER` in `src/lib/constants.ts` is still placeholders and `/privacy` still reads it. Narrowed but not closed: a coordinator can name their own council on `/dashboard`, which fills the `/reports` footers — per village, and L6 has now run so the field is live rather than disabled. `/privacy` still reads the constant, so this stays open until it is filled in and the council has reviewed the notice. |
| L3 | Village activation from cold | Done 27 Jul, **enforcement fixed 13 Aug** | `src/lib/villages.ts` — activate, mint a join code before the status flips, regenerate, and appoint the first coordinator, all guarded on the status just read and all audited. `/admin/villages` is the screen. **"The registration routes now require the code whenever a village has one" was written here on 27 July and was not true until 13 August**: `checkVillageJoin` was never called and both routes let a blank code through. They call it now, and `tests/village-join.test.ts` asserts it. There was also a second, dead copy of this module at `src/lib/village.ts` until 13 Aug. Sharing the invite is I3; nobody has yet activated a real village. |
| L4 | OneSignal push not working | Not started | See B3. No push has been delivered to a real device. |
| L5 | Verify coordinator flow end-to-end | Not started | Confirm submit → PENDING_REVIEW → approve → PUBLISHED → notification. Nothing in the test suite asserts that a village with auto-approve off still queues. |
| L6 | Apply pending migrations | **Done** | All ten are applied, `postgis.sql` and `rls_policies.sql` re-run after them. The consequence is live and worth knowing rather than discovering: the compliance gate is **on**, so the seeded village is refusing reports until a coordinator has been through `/dashboard/compliance`, and no acceptance has ever been recorded. Confirm with `npx prisma migrate status` before planning around it — this is settled from the `database.yml` log rather than a first-hand check. |
| L7 | Sample seed data in the live database | Not started | The only ACTIVE village is the one `prisma/seed.ts` created, with five invented incidents and the hardcoded join code `VILLAGE1`. Both are obviously placeholders by design, and both are in the database a resident would land in. Delete the seeded village, or rotate its code and clear its incidents, before the first real resident registers. |

---

## Can launch without

Everything here is real work that makes the product better. None of it stops
the first parish going live, and treating any of it as a blocker is how a
launch date slips for reasons nobody can defend to a parish clerk.

| Item | Why it can wait |
|------|-----------------|
| Heatmap overlay | Pins on the map already answer "where is this happening". Density is a nicer way to read the same data, not a missing one. |
| CSV export | Coordinator convenience for a council meeting. The dashboard and the reports page both show the same figures on screen. (B4 is fixed, so the button works — it still does not block launch.) |
| Email digest | Push-only is fine. Push works, has no transport dependency, and the digest already reaches coordinators through it. Email needs a provider, a DPA and a sender domain. |
| WhatsApp Channel | Extra reach, not core. A village with no channel loses nothing it had — residents are alerted in the app, and the coordinator can paste an alert anywhere. |
| Notification radius filtering | Village-wide is fine at 200 people. A radius is a way to hear *less*; at parish scale there is not enough to filter. T8 now asks every new resident for a home location, but it is optional and anyone without one is included by design. |
| Severity filter | Same reasoning. Every report in a village of 200 is worth a resident's attention. |
| ~~Time-range filters~~ | **Done 29 Jul.** Built anyway — see N13. The reasoning above was sound for a village's first months and stopped being sound the moment the dashboard grew a period a coordinator wanted to move. |
| Full WCAG audit | The obvious things are in place — labels, focus rings, 44px targets, `aria-current`, reduced motion. A formal AA audit is a launch-plus-one, not a launch gate. |
| PWA offline resilience | The offline page and the shell cache exist. A resident with no signal cannot file a report to a server they cannot reach, and queueing one for later is a feature, not a fix. |
| ONS seed beyond your village | The first parish needs one row. Seeding England's other 10,400 is what makes the picker need a server-side search endpoint — cost, not benefit, until there is a second village. |
| Resident self-service export | Article 20 covers the account data, which is small, and a coordinator can produce it by hand. DPIA action A15. |

---

## Technical Debt

| # | Item | Priority | Details |
|---|------|----------|---------|
| T1 | ~~CLAUDE.md push rule~~ | Done | Overridden in the Deployment guardrails and repeated at the top of Known Pitfalls, so it cannot be quietly reinstated by a later edit: Joel pushes directly to `main`. What still holds is what the rule protected — `main` deploys to production on landing, so the Definition of Done is the review beat. |
| T2 | ~~Stale CLAUDE.md entries~~ | Done 13 Aug | Nineteen contradictions across `CLAUDE.md`, `PROJECT_STATE.md`, this file, `README.md`, `SETUP.md`, `docs/E2E_VERIFICATION.md`, `docs/DPIA.md` and `/privacy`, reconciled in one pass — and two of them turned out to be code bugs rather than stale prose (the unenforced join code, and moderation's audit rows carrying no address). The full list is under "Where the code and the documents disagreed" in `PROJECT_STATE.md`. |
| T3 | ~~No automated tests~~ | Done 27 Jul | Vitest over `tests/`, `npm run test`. Landed as 139 tests across seven files; **now 293 across eighteen** — the seven plus the compliance gate and its three documents, the Markdown parser, the privacy level, the heat scale, the invite link, both date-range resolvers, the incident reference, the PDF layout and the join check. Unit only, and still no route, action, component or RLS coverage: those need a database, a request context or a browser, and a suite that needed one would stop being the thing CI runs on every push. |
| T4 | ~~No CI quality gate~~ | Done 27 Jul | `.github/workflows/ci.yml` runs lint → typecheck → test → build on every PR and every push to main. No secrets needed — every test mocks at the module boundary, so a fresh clone goes green. |
| T5 | Retention cron untested | Medium | Never run against real data. It deletes files and takes reports off the map. DPIA action A6 pairs it with erasure, which has the same gap. |
| T6 | Audit log expiry | Medium | Stated in `/privacy` at 24 months and not enforceable from application code — the append-only trigger rejects DELETE from everyone including the owner, which is the point of it. Dormant account closure is unenforced too. Either enforce both as a documented DBA action or amend the notice. DPIA action A8. |
| T7 | ~~Slack DPA~~ | Done 27 Jul (as a disclosure) | `/privacy` §6 now names Slack (Salesforce) separately: admin-only notifications to a private channel, no resident-facing dependency, and it says plainly that there is no separate agreement beyond Slack's standard terms. The blanket "every processor under a written DPA" claim was untrue and is gone. A signed agreement is still the answer past a single parish — DPIA action A3. |
| T8 | ~~homeLat/homeLng not captured~~ | Done 27 Jul | Both halves of registration already captured it; it is now one shared `HomeLocationField` across `/register` and `/welcome`, the jitter is named with its actual figure (`HOME_LOCATION_FUZZ_METERS`, 75m) rather than described vaguely, and Skip says what skipping costs. Setting it *after* registration is still missing — `/settings` does not offer it. |
| T10 | ~~Original wording survives archiving~~ | Medium | **Done 20 Aug.** The decision went to deletion, which is what the notice promised in the first place. `archiveExpiredIncidents` now sets `status: "ARCHIVED"` and `rawDescription: null` in one `updateMany` — one statement, because a second pass is one a timeout can leave un-run. `Incident.rawDescription` is nullable (`20260820100000_archive_deletes_raw_description`, which also clears the rows already archived) and null is the deletion rather than the tombstone's placeholder: a sentinel is a value a reporter could have typed. `clearArchivedRawWording` is the catch-up for reports a coordinator archived by hand — those leave `PUBLIC_INCIDENT_STATUSES` on the day they are archived, so the archive pass never sees them again, and a `REJECTED` one is the report most likely to be full of unedited words. Deletion still waits for the retention age, so tidying the map does not destroy anything that afternoon. `readRawDescription` returns `RAW_DESCRIPTION_DELETED_MESSAGE` and writes **no** audit row when there is nothing to disclose. `/privacy` §7, `docs/DPIA.md` §7 and `docs/APD_TEMPLATE.md` §5 all changed with it; `tests/retention.test.ts` covers the archive pass. |
| T11 | Three Vercel crons, and Hobby allows two | Medium | `vercel.json` gained `/api/cron/police-data` on `0 4 * * 1` with N10, alongside the weekly digest and the nightly retention sweep. Vercel's Hobby plan caps cron jobs at two, so on Hobby this either needs the plan or needs the entry removed and the route called from an external scheduler — it is `CRON_SECRET`-guarded and takes `?village=`, `?months=` and `?force=1`, so nothing in the code has to change either way. Settle it before the first deploy of that branch: the failure is a rejected deploy rather than a quiet one, which is the good kind, but it is still a rejected deploy. |
| T9 | Supabase `auth.users` row survives account closure | Medium | `eraseAccount` scrubs the profile and tombstones the reports; the auth record, and therefore the email address, stays. It needs an admin API call with no undo and its own reviewed route. Until then `/privacy` should say so. DPIA action A7. |

---

## Nice-to-Have (future)

| # | Feature | Details |
|---|---------|---------|
| N1 | ~~Heatmap overlay~~ | **Done 28 Jul.** `leaflet.heat` behind `src/components/map/heatmap-layer.tsx`, fed by `src/lib/heatmap.ts` — intensity is severity weight × recency decay, so red means accumulation rather than one serious report. `/map` gains a Pins / Heatmap / Both toggle, default Pins, remembered per device in localStorage through `useSyncExternalStore`, and the heat reads the same date-filtered set the pins do. `/dashboard` gains a non-interactive density thumbnail beside the hotspot list, which is the same period read off coordinates rather than off the landmark text. `tests/heatmap.test.ts` covers the scale. |
| N2 | Email digest | Weekly digest via email. The template and the transport both exist now — `src/lib/email/weekly-digest.ts` and `src/lib/email/send.ts` — so what is missing is the audience and the caller: `notifyEmail` is not on the settings screen and no dispatch honours it. `notifyCoordinatorsOfDigest` is where the second delivery would go. |
| N3 | Notification radius filtering | Alert within X metres. |
| N4 | Severity filter | Alert on Moderate+ or High+. |
| N5 | WCAG 2.1 AA audit | Accessibility pass. |
| N6 | ONS seed all England | ~10,000 parishes. Needs a server-side search endpoint for the picker first. |
| N7 | Telegram Channel | Free official Bot API, and the cheapest of the three distribution channels — one platform bot token, a per-village chat id, no review and no per-message cost. Planned in `docs/AUTO_POST_CHANNELS_PLAN.md`, which recommends it lands first because it proves the dispatcher against a real platform for the price of a bot token. |
| N8 | Auto-posting a published report to a village's channels | Planned in `docs/AUTO_POST_CHANNELS_PLAN.md`. The hook belongs in `notifyIncidentPublished` and **not** on a publish route — there is no publish route, there are two publish paths, and the coordinator's Approve click is a server action. WAHA/Whapi is the one option the plan rules out rather than schedules: an unofficial WhatsApp Web client can breach Meta's terms and get the number behind it banned, and there is no sanctioned API that posts to a Channel at all. What the plan does recommend is a shared dispatcher and a `ChannelPost` record first (behaviour unchanged), then Telegram, then a Facebook Page once App Review clears. Its load-bearing new rule: **a report whose `anonymized` is false is never auto-posted** — `CopyAlert`'s red warning is a human reading the reporter's own wording before pasting it, and automation is what removes that person. |
| N9 | ~~QR code for village invite~~ | **Done 28 Jul.** `qrcode.react` behind `src/components/qr-invite.tsx` — an SVG at 256px on screen because that is what prints, and an off-screen 1024px canvas behind "Download QR" because `toDataURL` needs one. "Print" is `window.print()` against the `[data-print-region]` rules already in `globals.css`, and the sheet carries the QR, the village name, the join code as text and the three steps. Rendered on `/dashboard` for the coordinator's own village and on the public `/invite/[slug]`. The code travels in the URL and is never read from the database by either public page — see `src/lib/invite.ts`. Closes the rest of I3. |
| N10 | ~~Police API integration~~ | **Done 22 Aug.** Not the "direct feed to police systems" this line originally meant — that is an outbound integration with a force's own case management and needs a relationship rather than a client. What shipped is the inbound half, which is the one a coordinator can use today: `data.police.uk`, the Home Office's open recorded-crime service, read into `PoliceCrime` / `PoliceDataSync` / `PoliceNeighbourhood` by `GET|POST /api/cron/police-data` and rendered on `/dashboard` and in all three versions of the community safety report. Four modules — `police-api.ts` (typed failures, never a throw, a 1/s outbound pacer that is deliberately *not* the `rate_limit` table and says why), `police-data.ts` (the Prisma half, every read degrading on a missing table), `police-report.ts` (client-safe types and words, so the browser assembles the police section like every other one) and the sync route. **Nothing maps a police category onto `IncidentType`**: the two series count different things over different areas two months apart, so they render side by side under one shared caveat rather than in a chart that would look like a comparison and be an assertion. `PoliceDataSync` is what separates "the police published nothing" from "we never asked" — a `count(*)` returns zero for both, and the second printed as a figure in a document addressed to a PCSO is a false statement made by correct arithmetic. Every surface names the months it holds and the months it does not, and a village with nothing held gets no section at all. It also closes the smaller thing nobody had a line for: the neighbourhood policing team is resolved from the village's map centre and stored, so `/dashboard` finally answers "who is our PCSO". An officer's `bio` is force-authored HTML and never reaches the database, because the schema does not describe the field. `/privacy` §6 gained a paragraph in the same commit — the seventh claim that page makes about how the code behaves, and the only one about an outbound request carrying nothing of a resident's. `20260822120000_police_crime_data` adds three tables and changes no existing one; `rls_policies.sql` must be re-run with it. |
| N11 | Multi-language support | Welsh, Polish, other community languages. |
| N19 | ~~Upvote / downvote the criticality of a report~~ | **Done 23 Aug.** Asked for as "the option to upvote or downvote the criticality of each incident post". `IncidentVote` behind `POST /api/incidents/[id]/vote`, two buttons on every published report, and it is deliberately **advisory** — no status moves, no severity moves, nothing is published and no alert is sent. Severity drives the push audience and the WhatsApp Channel's floor, so a control that moved it would let a handful of taps decide who gets woken up, and the obvious failure is a popular report about a lost dog outranking an unpopular one about a neighbour. What it produces is an ordering: a "what your village thinks" panel on `/dashboard` with three sortings, and a "most concerning" section in all three versions of the community safety report. Three states and no `NEUTRAL` — up, down, and the absence of a row, which is what pressing the same button again leaves. `nextVote` in `src/lib/votes.ts` is that rule and both the browser and the route call it, so the optimistic count and the row written cannot disagree; `applyVote` is derived from it rather than reimplementing it. Rate limited **per incident** rather than per resident, one change per ten seconds, because a per-resident window would refuse a vote on the second report in a list. **No screen anywhere names a voter**, and it is structural: no query in the app selects one. RLS gives a resident own-rows SELECT and a coordinator their village's — matching what a coordinator can already reach — with INSERT and UPDATE checked against the same public-status and village rules the route applies. Erasure takes votes in both directions explicitly, because neither foreign-key cascade ever fires. `/privacy` §§2, 6 and 7 and `/terms` §7 changed with it. `20260823120000_incident_votes` adds one table and one enum and changes no existing one; `rls_policies.sql` must be re-run with it. |
| N20 | ~~Branded Supabase auth email templates, and an email transport~~ | **Done 23 Aug.** Two things that had been waiting on each other in the wrong order. `src/lib/email/send.ts` is the transport the barrel's header has promised since the templates were written — Resend, `RESEND_API_KEY`, never throws, logs the message with no key set — and **not one line of a template changed to wire it in**, which was the argument for the split. `welcomeEmail` is its only caller and fires on both registration paths. Separately, `src/lib/email/supabase-templates/` holds the four emails Supabase itself sends — confirm signup, magic link, change email, reset password — as branded `.html` to paste into its dashboard, because only Supabase can mint those tokens and a template edited in a form is a change nobody can review. They are generated from the module beside them and a test fails when the two drift. `{{ .ConfirmationURL }}` is in each one twice and no other Go variable is used, both asserted. `/privacy` §6 names Resend as a processor. Neither half is exercised: no email has reached a real inbox and nothing has been pasted into the dashboard yet. |
| N12 | Render `PatternAlert` rows | The digest creates them and nothing shows them; acknowledge and dismiss have no UI. The RLS policy is already in place, waiting on the screen. |
| N13 | ~~Time-range filters~~ | **Done 29 Jul.** One resolver behind three screens — `src/lib/date-range.ts`, client-safe, so the map filters in the browser over incidents it already holds while `/incidents` and `/dashboard` resolve the same query string into the same SQL. `TIME_RANGES` is the one list of periods; each surface picks a subset (`BROWSE_RANGE_VALUES`, `DASHBOARD_RANGE_VALUES`), so "Last 30 days" is one span everywhere. `/map` gains a Custom pill that reveals two date inputs and redraws both layers with no round trip; `/incidents` gains the same control as submit buttons inside its existing GET form, so a period is a shareable URL and carries the type and severity filters with it; `/dashboard` gains 7/30/90/Custom driving the stat cards, both breakdowns, the hotspot list and the density thumbnail together — every figure on the page was a hardcoded window before. `tests/date-range.test.ts` covers the resolver, including that `all` contributes no `occurredAt` key at all. |
| N17 | ~~Community Mode~~ | **Done 20 Aug.** A two-tier compliance model behind `Village.mode`, defaulting to `community`. A village with no parish council behind it — most of them — has its **coordinator** as the data controller and accepts one document, `docs/COMMUNITY_DPA.md`, instead of the council's three. The Schedule 1 paragraph 5 policy document is **not** dropped and could not be, since it is what authorises processing criminal offence data at all: it is folded into that one agreement alongside the Article 28(3) terms, and `tests/compliance-documents.test.ts` asserts all eight of those obligations against both agreements. What community mode genuinely does without is the Article 35 assessment, on the strength of `docs/DPIA.md` rating no risk high after mitigation for the same software. `documentsForMode` is the one place the model turns into a list; `isComplete` keeps a village **open** while it upgrades to the council model, because the coordinator is still the controller until the council adopts. The upgrade is one-way, audited as `village.mode_changed`, and clears nothing. `/admin/villages` and the community compliance screen both render `CONTROLLER_RESPONSIBILITIES` — SAR within a month, breach within 72 hours, a record of processing — because nobody had ever told a volunteer what being a controller means. `20260820120000_village_community_mode` backfills any village that has accepted a council document back to `council`, which is what stops it re-closing one mid-flow. `/privacy` §1, `/terms` §1, `docs/DPIA.md` and the Coordinator Guide all changed with it. |
| N15 | ~~Report footers name the deployment constant in a community village~~ | **Done 21 Aug.** The three coordinator-facing screens follow `Village.mode` now. The third was missed in the first pass and flagged in review on PR #7: the share panel on `/incidents/[id]` offered "a written summary of this report for your PCSO or parish council" to every village, and now reads "or your records" in a community one. `ShareSummary` takes a `mode` and picks between two sets of copy the way `ParishCouncilForm` does; the police are in both, because having no council says nothing about having no PCSO. The document itself never changed — `formatIncidentSummary` names no recipient — so only the panel around it reads the village. `/reports` says a report is "for your PCSO or parish council" in a council village and "for your community records" in a community one, and its amber warning names the coordinator as the controller rather than telling them to ask a platform administrator — it links to `/dashboard#village-settings`, which has had the field since the parish council work. The dashboard card is headed "Parish council" or "Data controller" and asks for a council's legal name or the group's own; `Village.parishCouncil` is the same column either way, and only the labels move. `getVillageMode` is the read behind it — deliberately not a column on `getVillageController`, whose fallback drops `parish_council` and would have dropped it for a database missing `mode` too. `/dashboard` passes `compliance.mode` down rather than reading twice. |
| N18 | ~~Dashboard date range is clumsy and its dates are live under a preset~~ | **Done 22 Aug.** Raised against `/dashboard`, and it was two screens: `TimeRangeFields` is shared with `/incidents`, and both rendered a From and a To that `resolveTimeRange` ignores for every preset but `custom`. Filling them in under "Last 7 days" moved nothing, which is worse than clutter. Fixed the way `/reports` was in PR #7 — the dates collapse behind a chip that appears only under "Custom range" — and the calendar behind all three screens is now one component, `src/components/date-range-chip.tsx`, parameterised by the ceiling each enforces (`REPORT_MAX_RANGE_DAYS` against `MAX_CUSTOM_RANGE_DAYS`). The pills became a `<select name="range">`: a submit button carried its own `name`/`value`, which is what made the pills work with no JavaScript, and a select beside a real submit button has that property too — while adding the one pills could not, that a preset can be chosen without navigating. `from` and `to` ride along as hidden inputs, so a custom range survives a trip through a preset. `/incidents`' Apply button dropped the hand-written `name="range"` it needed while every period control was a submit button. `/map` already revealed its pair only under Custom and is untouched. `tests/period-control.test.tsx` is the suite's first component test — rendered to a string, no DOM — and pins the promise rather than the markup: no date input in the document under a preset. |
| N16 | `/privacy` cannot name a village's own controller | Not started | It is a public, sessionless page, so it describes both models and points a resident at their coordinator rather than naming anybody. A per-village privacy notice — `/privacy?village=<slug>`, or a section on the village's own page — is the real fix, and it needs the controller's contact details, which nothing collects yet. |
| N14 | ~~SEO audit~~ | **Done 29 Jul.** `src/app/robots.ts` and `src/app/sitemap.ts` as file conventions rather than static files, so both read the same `NEXT_PUBLIC_APP_URL ?? APP_ORIGIN` pair `metadataBase` does and a preview deployment cannot point crawlers at production. `opengraph-image.tsx` renders a 1200×630 card from the same constants and the same shield as the app, with `twitter-image.tsx` re-exporting it. Canonicals are **per page, never on the root layout** — metadata is inherited, so one there would mark `/privacy` and `/terms` duplicates of the home page. Landing page gains its own search-result description and a JSON-LD graph (`Organization` for Yakasista Ltd, `WebSite`, `SoftwareApplication`) in `src/lib/structured-data.ts`, which carries no `aggregateRating` and no `Offer` for the Pro tier, because nothing has been rated and nothing takes payment. `/welcome` is now `noindex`; `/join/[slug]` gained a description for the WhatsApp preview that names the village and never the join code. |

---

## Completed Features

| Date | Feature |
|------|---------|
| 24 Jul | Scaffold, schema, landing page |
| 25 Jul | MediaPipe face blur, incident form, Claude AI, map, pattern detection |
| 25 Jul | Push notifications, coordinator dashboard, weekly digest |
| 26 Jul | RLS, rate limiting, privacy/terms, security headers |
| 26 Jul | Deploy config, seed, retention cron, README, PWA, onboarding |
| 26 Jul | WhatsApp Channel alerts, ONS village seed |
| 27 Jul | Coordinator approval flow, per-village channels, admin sidebar |
| 27 Jul | Slack webhooks, right to erasure, persistent rate limiting |
| 27 Jul | Auto-extract channel code from the invite link (one field, not two) |
| 27 Jul | Auto-approve setting — publish on submit, off by default, audited |
| 27 Jul | Mobile drawer above the map (B1) — `z-[1100]`, `h-dvh`, backdrop |
| 27 Jul | Vitest suite (T3), CI test gate (T4), Slack disclosure in /privacy (T7) |
| 27 Jul | CI reads `DIRECT_URL` from the Production environment (PR #3) |
| 27 Jul | Stronger face redaction — black box by default (B2, I2) |
| 27 Jul | CSV export reports its own failures; formatting extracted and tested (B4) |
| 27 Jul | Shared home location step, jitter named with its figure (T8) |
| 27 Jul | Share with police and the parish council — `/reports`, print, share sheet (I1) |
| 27 Jul | Copy to WhatsApp — one alert format across queue, report page and wizard |
| 27 Jul | Parish council field on `/dashboard` — the data controller per village |
| 27 Jul | Village activation — activate, mint, suspend, regenerate, appoint (L3) |
| 27 Jul | Test data and stub audit (B5) |
| 27 Jul | DPIA drafted — `docs/DPIA.md` (L1) |
| 28 Jul | Article 28(3) processing agreement drafted; third document in the compliance gate (L8, DPIA A2) |
| 28 Jul | Real domain — `villagewatch.app` throughout; `APP_ORIGIN` replaces the `localhost` fallback behind push, email and WhatsApp links |
| 28 Jul | Invite QR code, `/join/[slug]` and the printable `/invite/[slug]`; registration pre-fills from the link (N9, I3) |
| 28 Jul | Heatmap overlay — Pins / Heatmap / Both on `/map`, density thumbnail on `/dashboard` (N1) |
| 29 Jul | Time-range filters — one resolver behind `/map`, `/incidents` and `/dashboard`, custom ranges throughout (N13) |
| 29 Jul | SEO — robots, sitemap, OG image, per-page canonicals, JSON-LD on the landing page (N14) |
| 3 Aug | Per-village incident numbering — `VW-HIS-2026-0003` |
| 4 Aug | Community safety report as a server-rendered PDF; the print button removed |
| 11 Aug | Facebook share button beside the WhatsApp copy button |
| 13 Aug | Join code enforced, the two village modules merged, audit rows carry an address, nineteen doc contradictions closed (T1, T2, L6) |
| 20 Aug | Archiving deletes the reporter's original wording, plus a catch-up for hand-archived reports (T10) |
| 20 Aug | Community Mode — a two-tier compliance model, one agreement for a village with no council, and the controller's duties in plain English (N17) |
| 21 Aug | `/reports`' period control redesigned — one row, a two-month picker behind "Custom range", 90 days and This year — and the mode-aware copy that goes with it (N15) |
| 21 Aug | The incident share panel follows `Village.mode` too — the third screen N15 missed, flagged in review on PR #7 |

---

*Maintained by Yakasista Ltd*
