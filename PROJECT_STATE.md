# VillageWatch — project state

**Last updated:** 11 August 2026 · **Repo version:** `v0.1.27` (`508de8c`) ·
**Domain:** https://villagewatch.app

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
| Repo version | `v0.1.27`, tagged, `package.json` on `main` reads `0.1.27` |
| Version on screen | expect **v0.1.26** — the release commit carries `[skip ci]`, so production is built from `dbd85ee` and sits one patch behind `main` until the next real change deploys. This is designed behaviour, not a failed deploy (see "The version on screen" in `CLAUDE.md`) |
| Database | Supabase Postgres + PostGIS, `eu-west-2` (London) |
| Migrations in repo | 10, `20260726161847_init` → `20260803120000_incident_village_numbering` |
| Villages seeded | 270 Cambridgeshire parishes, all `PENDING`; the only `ACTIVE` village is `prisma/seed.ts`'s placeholder |
| Test suite | Vitest, unit only, **17 files, 283 tests**, all passing (~2s) — runs with no `.env.local` and no database |
| CI | `ci.yml` (lint → typecheck → test → build), `database.yml` (migrate + both SQL files), `version.yml` (standard-version bump) |

---

## Active branches

| Branch | State | Action |
| --- | --- | --- |
| `main` | The working branch. Auto-deploys to production. Local and `origin/main` are in step at `508de8c`. | — |
| `fix/database-workflow-environment-secret` | **Stale.** Fully merged — `git log origin/main..origin/fix/database-workflow-environment-secret` is empty, so it carries nothing `main` does not already have. Its two commits (`5b76757` reading `DIRECT_URL` from the Production environment, `522270a` surviving a database without `parish_council`) are both in `main`. | Safe to delete, locally and on the remote |

No other branches, local or remote. Work happens on `main` — see the push rule
under Known Pitfalls in `CLAUDE.md`.

---

## Open items

### Done — landed, not yet exercised against real data

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
  `20260728150000_village_dpa_gate`). **The record disagrees with itself and
  this is the first thing to settle.** `CLAUDE.md` was corrected on 3 August
  (`6c53bd9`) to say all ten migrations are applied, on the strength of a
  `database.yml` run reporting `Database schema is up to date!`; the addendum in
  `docs/E2E_VERIFICATION.md` (28 July, older) says these two are *not* applied
  and that the missing-column state deliberately allows reporting.

  Both cannot be true, and the difference is visible to residents: applied, the
  gate is live and every village refuses reports until a coordinator has
  accepted all three documents on `/dashboard/compliance`; unapplied, every
  village accepts reports and logs a warning nobody reads.

  **Settle it by reading the workflow log or running `npx prisma migrate
  status`, not by reading either document.** Then correct whichever of the two
  is wrong in the same pass. If they do turn out to be pending, apply them
  **together** — `_dpa_gate` alone re-closes a village that had already accepted
  the first two — and tell whoever coordinates the village first.

- **No acceptance has ever been recorded**, either way. Nothing has been blocked
  by the gate and no village has been through that screen.

### Still open (see `BACKLOG.md` for the numbered list)

- A directory village cannot be claimed from cold: nothing writes
  `Village.status`, so all 270 seeded parishes are `PENDING` forever and the
  only promotion path is editing the row by hand.
- `DATA_CONTROLLER` in `src/lib/constants.ts` is still placeholders, so
  `/privacy` names no controller.
- No push has been delivered to a real device; the retention job has never run;
  erasure has never touched a real bucket; no WhatsApp alert has been pasted
  into a real channel.
- No staging environment — CI, unit tests and auto-versioning exist, but there
  is nowhere to run a migration before production sees it.

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

---

## Where the code and the documents disagree

Found 5 August 2026 by reading the code against `CLAUDE.md`. Each is a
documented invariant the code does not currently hold. Recorded rather than
fixed — the pass that found them changed no code.

1. **`checkVillageJoin` is never called.** `src/lib/village.ts` exports it and
   four other files mention it *in comments*; nothing invokes it.
   `POST /api/auth/register` and `POST /api/auth/complete-profile` each compare
   the code inline instead, and **both accept a blank one** — the check is
   `joinCode && !codeMatches`, so an empty string short-circuits it and the
   caller joins as `RESIDENT`. The guarded join logic that "requires the code
   whenever a village has one" (BACKLOG L3) is written, documented and dead.
   Domain rule 5 is not breached — the role still comes from the server — but
   the gate meant to stand in front of a village is not standing anywhere.

2. **Two village-lifecycle modules, and half of one is dead.**
   `src/lib/villages.ts` holds the wired copies —
   `/admin/villages/actions.ts` imports `activateVillage`,
   `regenerateJoinCode` and `appointCoordinator` from it. `src/lib/village.ts`
   exports its own `activateVillage`, `suspendVillage`, `reactivateVillage` and
   `regenerateJoinCode`, and **nothing outside that file calls any of them.**
   The rest of `village.ts` is very much alive (`findVillageBySlug`,
   `getVillageController`, the parish council and privacy level accessors), so
   this is a dead half of a live module rather than a dead file.

3. **`coordinator-requests.ts` is not "the only place in the codebase that
   raises a role"**, which is what `CLAUDE.md` says under **Coordinator access
   requests**. `src/lib/villages.ts` is a second place that writes
   `COORDINATOR`. Both guard on `isPlatformAdmin` and both use
   `canApplyForCoordinator`, so neither demotes an existing `MODERATOR` or
   `ADMIN` — the invariant's *purpose* survives and the sentence does not. An
   invariant enforced in two places is one refactor from being enforced in one
   and a half.

Two smaller drifts, noted so they are not rediscovered: the `tests/` listing in
`CLAUDE.md`'s **Project structure** block omits `incident-csv.test.ts` and
`report-range.test.ts`, and the `docs/` listing omits `E2E_VERIFICATION.md`,
`FUNDING.md` and `GRANT_APPLICATION_NL_AI.md`.

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

Newest first. Dates are the commit's, versions are the release the commit
landed in.

| Date | Version | Change |
| --- | --- | --- |
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
