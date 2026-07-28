# VillageWatch — Backlog & Improvements Tracker

**Last updated:** 28 July 2026 (B1, B2, B4, B5, I1, I2, T3, T4, T7, T8 closed;
village activation landed; DPIA drafted; compliance gate and the per-village
face redaction level added — B2/I2 are configurable rather than fixed now;
Article 28(3) processing agreement drafted and added to the gate as L8)
**Repo:** https://github.com/jdell/villagewatch
**Domain:** https://villagewatch.app — canonical origin, `APP_ORIGIN` in
`src/lib/constants.ts`. `www` redirects to it; there is one origin, because
`NEXT_PUBLIC_APP_URL` is one value and a session cookie does not follow a
resident across hosts.

---

## Running Tasks (in progress)

| Task | Status | Notes |
|------|--------|-------|
| Apply `20260727180000_village_activation` | Running | The one migration never applied anywhere. Until it runs, the parish council field on `/dashboard` is disabled on screen and `/reports` falls back to the deployment-wide `DATA_CONTROLLER`. Re-run `rls_policies.sql` after it. |
| DPIA sign-off | Running | `docs/DPIA.md` is written and is a template. It needs the council's review, the five blocker actions in its §9, and a signature. |
| Public invite page `/join/[slug]` | Running | The remaining half of I3 — see below. Activation mints and shows the code; nothing yet shares it. |

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
| I1 | ~~Share summary with police/council~~ | Done 27 Jul | `/reports` — a period report with counts, breakdowns, hotspots and a Claude-written narrative (counted fallback when Claude is unavailable), plus a single-incident share button on any published report. One format for screen, clipboard, share sheet and print; "Download PDF" is `window.print()` and `@media print`. Coordinator only, published and resolved incidents only, structurally incapable of carrying raw text or coordinates. The period report is audited; the share sheet deliberately is not, because an `await` before `navigator.share()` spends the user gesture and iOS refuses the call. |
| I2 | ~~Stronger face blurring~~ | Done 27 Jul, **configurable 28 Jul** | `FaceRedactionMode` — `redact` (solid black box) or `blur` (six-cell mosaic under a heavy Gaussian), recorded per file. As of 28 Jul the choice is the **village's**, not the reporter's: `Village.privacyLevel` (`light` 15px / `standard` 22px, the default / `heavy` 35px / `redact`) is set by a coordinator on `/dashboard` with a preview of each level, audited as `village.privacy_level_changed` (sensitive). The reporter keeps one control and it only points one way — black out faces completely — so nobody can file below what their village set. `tests/privacy-level.test.ts` covers the mapping, the fallback and the write schema. `/privacy` and the landing FAQ updated in the same commit; `/terms` never named a default, so it did not change. Needs `20260728120000_village_privacy_level`. |
| I3 | Coordinator share invite link | High | **Half done 27 Jul.** Village activation landed, so a code now exists to share: `activateVillage()` mints it, `/admin/villages` shows it once, and `regenerateJoinCode()` rotates it. What is still missing is the sharing itself — copy button, WhatsApp hand-off, QR code, and a public `/join/[slug]` that pre-fills registration. Carried as a running task above. |

---

## Launch Blockers (remaining)

| # | Blocker | Status | Details |
|---|---------|--------|---------|
| L1 | DPIA | Drafted 27 Jul | `docs/DPIA.md` — 12 assessed risks, none high after mitigation, conclusion is "may proceed with mitigations". **Not signed.** Its §9 carries five blockers that are the council's to produce, not ours: an Appropriate Policy Document for criminal offence data (DPA 2018 Sch 1 Pt 4), an Article 28 processing agreement with Yakasista Ltd, coordinator terms and moderation guidance, real controller details plus ICO registration, and a breach notification procedure. Two of the five now have templates — the APD, and as of 28 Jul the processing agreement. |
| L8 | Article 28(3) processing agreement | **Template drafted 28 Jul** | `docs/DATA_PROCESSING_AGREEMENT.md` — DPIA action A2, and the third document in the compliance gate. Covers all eight Article 28(3) obligations, names the five sub-processors with what each actually receives, 30-day notice and a 14-day objection window on adding one, 24-hour breach notification to the council, audit rights, and deletion within 30 days of termination with written confirmation. **Not signed by either party**, and unlike the other two documents it takes two signatures — accepting it on `/dashboard/compliance` records the council's half and nothing more, which the screen says in as many words. Needs `20260728150000_village_dpa_gate`. Open on our side: the transfer mechanisms for Anthropic and OneSignal are marked *[verify]* in it (DPIA A9 and A11), and the Slack position is disclosed rather than covered (T7 / DPIA A3). |
| L2 | Privacy policy — real controller name | Not started | `DATA_CONTROLLER` in `src/lib/constants.ts` is still placeholders and `/privacy` still reads it. Narrowed but not closed: a coordinator can now name their own council on `/dashboard`, which fills the `/reports` footers — per village, and only once L6 has run. |
| L3 | Village activation from cold | Done 27 Jul | `src/lib/village.ts` — activate, mint a join code before the status flips, suspend, reactivate, regenerate, and appoint the first coordinator, all guarded on the status just read and all audited. `/admin/villages` is the screen. The registration routes now require the code whenever a village has one. Sharing the invite is I3; applying the migration is L6. |
| L4 | OneSignal push not working | Not started | See B3. No push has been delivered to a real device. |
| L5 | Verify coordinator flow end-to-end | Not started | Confirm submit → PENDING_REVIEW → approve → PUBLISHED → notification. Nothing in the test suite asserts that a village with auto-approve off still queues. |
| L6 | Apply pending migrations | **4 pending** | `20260727180000_village_activation`, `20260728090000_village_compliance_gate`, `20260728120000_village_privacy_level` and `20260728150000_village_dpa_gate` have never run anywhere. Order and consequences are in SETUP.md §4. `migrate deploy`, then `postgis.sql`, then `rls_policies.sql`. **The two compliance ones are not routine**: applying them closes every existing village's reporting until a coordinator has been through `/dashboard/compliance`, so tell whoever coordinates the village before they run. Apply them together — the DPA one alone re-closes a village that had already accepted the first two. The other two are additive and change nothing until somebody uses the screen. |
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
| Time-range filters | The list shows the most recent 30 and the map the last 500. That is the whole history for a village in its first months. |
| Full WCAG audit | The obvious things are in place — labels, focus rings, 44px targets, `aria-current`, reduced motion. A formal AA audit is a launch-plus-one, not a launch gate. |
| PWA offline resilience | The offline page and the shell cache exist. A resident with no signal cannot file a report to a server they cannot reach, and queueing one for later is a feature, not a fix. |
| ONS seed beyond your village | The first parish needs one row. Seeding England's other 10,400 is what makes the picker need a server-side search endpoint — cost, not benefit, until there is a second village. |
| Resident self-service export | Article 20 covers the account data, which is small, and a coordinator can produce it by hand. DPIA action A15. |

---

## Technical Debt

| # | Item | Priority | Details |
|---|------|----------|---------|
| T1 | CLAUDE.md push rule | Low | Still blocking automation. Change to allow direct push. |
| T2 | Stale CLAUDE.md entries | Medium | Now several: "Not built yet" still names village activation as the blocker (L3 is done), still says five migrations rather than six, and still describes the picker's ACTIVE filter as unreachable. |
| T3 | ~~No automated tests~~ | Done 27 Jul | Vitest over `tests/` — 139 tests across seven files: rate limiter, auth guards, AI failure modes, Zod schemas, channel code, alert format and the CSV export's escaping and formula-injection guard. `npm run test`. Unit only: no route, action, component or RLS coverage yet. |
| T4 | ~~No CI quality gate~~ | Done 27 Jul | `.github/workflows/ci.yml` runs lint → typecheck → test → build on every PR and every push to main. No secrets needed — every test mocks at the module boundary, so a fresh clone goes green. |
| T5 | Retention cron untested | Medium | Never run against real data. It deletes files and takes reports off the map. DPIA action A6 pairs it with erasure, which has the same gap. |
| T6 | Audit log expiry | Medium | Stated in `/privacy` at 24 months and not enforceable from application code — the append-only trigger rejects DELETE from everyone including the owner, which is the point of it. Dormant account closure is unenforced too. Either enforce both as a documented DBA action or amend the notice. DPIA action A8. |
| T7 | ~~Slack DPA~~ | Done 27 Jul (as a disclosure) | `/privacy` §6 now names Slack (Salesforce) separately: admin-only notifications to a private channel, no resident-facing dependency, and it says plainly that there is no separate agreement beyond Slack's standard terms. The blanket "every processor under a written DPA" claim was untrue and is gone. A signed agreement is still the answer past a single parish — DPIA action A3. |
| T8 | ~~homeLat/homeLng not captured~~ | Done 27 Jul | Both halves of registration already captured it; it is now one shared `HomeLocationField` across `/register` and `/welcome`, the jitter is named with its actual figure (`HOME_LOCATION_FUZZ_METERS`, 75m) rather than described vaguely, and Skip says what skipping costs. Setting it *after* registration is still missing — `/settings` does not offer it. |
| T9 | Supabase `auth.users` row survives account closure | Medium | `eraseAccount` scrubs the profile and tombstones the reports; the auth record, and therefore the email address, stays. It needs an admin API call with no undo and its own reviewed route. Until then `/privacy` should say so. DPIA action A7. |

---

## Nice-to-Have (future)

| # | Feature | Details |
|---|---------|---------|
| N1 | Heatmap overlay | Incident density on map. |
| N2 | Email digest | Weekly digest via email. |
| N3 | Notification radius filtering | Alert within X metres. |
| N4 | Severity filter | Alert on Moderate+ or High+. |
| N5 | WCAG 2.1 AA audit | Accessibility pass. |
| N6 | ONS seed all England | ~10,000 parishes. Needs a server-side search endpoint for the picker first. |
| N7 | Telegram Channel | Free official Bot API. |
| N8 | Auto-posting via WAHA/Whapi | When manual copy-paste becomes painful. |
| N9 | QR code for village invite | For printed flyers. Pairs with the rest of I3. |
| N10 | Police API integration | Direct feed to police systems. |
| N11 | Multi-language support | Welsh, Polish, other community languages. |
| N12 | Render `PatternAlert` rows | The digest creates them and nothing shows them; acknowledge and dismiss have no UI. The RLS policy is already in place, waiting on the screen. |

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

---

*Maintained by Yakasista Ltd*
