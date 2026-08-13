# VillageWatch — project state

**Last updated:** 13 August 2026 · **Repo version:** `v0.1.27` · **Branch:**
`fix/audit-code-vs-docs`, off `2af3cb6` · **Domain:** https://villagewatch.app

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
| Migrations in repo | 10, `20260726161847_init` → `20260803120000_incident_village_numbering`. All ten applied |
| Villages seeded | 270 Cambridgeshire parishes, all `PENDING`; the only `ACTIVE` village is `prisma/seed.ts`'s placeholder |
| Test suite | Vitest, unit only, **18 files, 293 tests**, all passing (~2s) — runs with no `.env.local` and no database |
| CI | `ci.yml` (lint → typecheck → test → build), `database.yml` (migrate + both SQL files), `version.yml` (standard-version bump) |

---

## Active branches

| Branch | State | Action |
| --- | --- | --- |
| `main` | The working branch. Auto-deploys to production. Head is `2af3cb6`, the Facebook share button. | — |
| `fix/audit-code-vs-docs` | **In review.** The 13 August audit pass: the join code is actually enforced now, the two village modules are one, moderation's audit rows carry an address, and nineteen code-versus-documentation contradictions are reconciled across `CLAUDE.md`, this file, `BACKLOG.md`, `README.md`, `SETUP.md`, `docs/E2E_VERIFICATION.md`, `docs/DPIA.md` and `/privacy`. | Merge to `main` |
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
  `20260728150000_village_dpa_gate`). The two documents that disagreed now
  agree: `docs/E2E_VERIFICATION.md`'s addendum was the older of the two and has
  been corrected to match the `database.yml` run that reported `Database schema
  is up to date!` on 3 August. **All ten migrations are applied**, so the gate is
  live and the seeded village is refusing reports until somebody accepts all
  three documents on `/dashboard/compliance`.

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

Newest first. Dates are the commit's, versions are the release the commit
landed in.

| Date | Version | Change |
| --- | --- | --- |
| 13 Aug 2026 | unreleased | The join code is enforced — both auth routes call `checkVillageJoin`, which had never been called; the two village modules became one; moderation's audit rows carry an address; nineteen code-versus-documentation contradictions reconciled (`fix/audit-code-vs-docs`) |
| 11 Aug 2026 | unreleased | Facebook share button beside the WhatsApp copy button (`2af3cb6`) |
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
