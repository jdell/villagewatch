@AGENTS.md

# VillageWatch

Community safety reporting for villages and neighbourhoods. Residents report
what they see; AI strips out personal details and categorises the report; the
map and push alerts do the rest. Coordinators moderate, and pattern detection
flags clusters before anyone joins the dots by hand.

---

## Stack

| Layer      | Choice                                                      |
| ---------- | ----------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack), React 19                |
| Language   | TypeScript, strict                                          |
| Styling    | Tailwind CSS v4 (CSS-first config in `src/app/globals.css`)  |
| Database   | Supabase Postgres + PostGIS                                  |
| ORM        | Prisma 7 with `@prisma/adapter-pg` (no Rust query engine)    |
| Auth       | Supabase Auth via `@supabase/ssr`                            |
| Validation | Zod 4                                                        |
| Icons      | lucide-react                                                 |
| Maps       | Leaflet + react-leaflet, OpenStreetMap tiles, `leaflet.heat` |
| QR codes   | `qrcode.react` — SVG on screen, canvas for the download      |
| PDF        | `@react-pdf/renderer` — server only, `serverExternalPackages` |
| AI         | `@anthropic-ai/sdk`, `claude-sonnet-5` (`ANTHROPIC_MODEL`)   |
| Push       | OneSignal — `@onesignal/node-onesignal` server, v16 web SDK   |
| Toasts     | sonner                                                       |
| Hosting    | Vercel, `lhr1` (two crons in `vercel.json`)                   |
| Domain     | `villagewatch.app` — see The canonical origin                 |
| Versioning | `standard-version` + Conventional Commits, bumped by CI       |

---

## Next.js 16 conventions — these differ from Next 14/15

These bite on every file. Get them wrong and the build fails in ways that look
unrelated.

- **`middleware.ts` is now `proxy.ts`.** It lives at `src/proxy.ts` and exports
  a function named `proxy` (or a default export). There is no `middleware.ts`
  in this repo and there should never be one.
- **`cookies()` and `headers()` are async.** Always `await cookies()`. This is
  why `createClient()` in `src/lib/supabase/server.ts` is async — never hoist
  its result to a module constant.
- **Page `params` and `searchParams` are Promises.** Type them as
  `Promise<{ id: string }>` and await them:
  ```ts
  export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
  }
  ```
- **Route handlers** are unchanged: `export async function POST(request: NextRequest)`.
- Before writing anything unfamiliar, read the bundled docs in
  `node_modules/next/dist/docs/` rather than trusting memory.

---

## Prisma 7 conventions

- **The connection URL lives in `prisma.config.ts`, not `schema.prisma`.** The
  `datasource db` block declares `provider` and nothing else.
- **No `extensions` list and no `postgresqlExtensions` preview feature.**
  Supabase pre-installs `pg_stat_statements`, `pgcrypto`, `uuid-ossp` and
  `supabase_vault` in every project. With extension tracking on, the migrate
  engine diffs those against the migration history, calls them drift, and
  demands a reset of the whole `public` schema on *every* `migrate dev` — a
  data-loss trap once real reports exist. PostGIS is enabled by
  `prisma/sql/postgis.sql`, which has to run after the first migration anyway.
- `prisma.config.ts` uses `DIRECT_URL` (port 5432) — migrations cannot run
  through pgBouncer. The application runtime uses `DATABASE_URL` (pooled, port
  6543) through the driver adapter in `src/lib/prisma.ts`.
- **`DIRECT_URL` must be the Session pooler, not the direct connection.**
  `db.<ref>.supabase.co` has no A record — it is IPv6-only unless the project
  buys the IPv4 add-on, so on an IPv4-only network every CLI command dies with
  `P1001: Can't reach database server`. Use
  `postgres.<ref>@aws-N-<region>.pooler.supabase.com:5432`: session mode, so
  migrations work, and IPv4. Note the username differs — `postgres.<ref>` for
  either pooler, bare `postgres` only for the direct host.
- The generated client lands in `src/generated/prisma/` and is **gitignored**.
  Import from `@/generated/prisma/client`; import enums as *types* from
  `@/generated/prisma/enums` so client bundles stay clean.
- Run `npx prisma generate` after any schema change, and keep
  `postinstall: "prisma generate"` in `package.json` so Vercel never serves a
  stale client.

### PostGIS

`Incident.locationPoint`, `PatternAlert.centroidPoint` and `Village.boundary`
are `Unsupported("geography(...)")`. **Prisma Client cannot read or write
them.**

- Application code writes `lat`/`lng` only. Database triggers derive the
  geography columns — see `prisma/sql/postgis.sql`, which must be applied once
  after the first migration.
- Radius and clustering queries use `prisma.$queryRaw` with `ST_DWithin` /
  `ST_Distance`. There is a worked example at the bottom of that SQL file.
- Never add a required `Unsupported` field — Prisma Client could not create
  rows at all.

---

## Project structure

```
src/
  proxy.ts                    Next 16 proxy — session refresh + auth routing
  app/
    layout.tsx                Root layout: fonts, metadata, Toaster. No canonical
                              here on purpose — metadata is inherited
    page.tsx                  Public landing page + the JSON-LD graph
    opengraph-image.tsx       The 1200×630 share card, rendered by next/og
    twitter-image.tsx         The same picture, re-exported — Next needs both
    robots.ts                 /robots.txt. Not a security boundary; see the file
    sitemap.ts                /sitemap.xml — the five public pages, by hand
    not-found.tsx             Friendly 404 — also where a withdrawn report lands
    error.tsx                 Root error boundary; client, uses unstable_retry
    login/, register/         Public auth pages. /register pre-fills the village
                              and code from an invite link — neither is trusted
    welcome/                  Village, join code and terms for a provider
                              sign-up — outside (app), or it would loop
    join/[slug]/              Where a scanned invite QR lands — public, noindex.
                              One screen between the camera and registration
    invite/[slug]/            The printable invite sheet — public, noindex, needs
                              no account. Neither page reads joinCode from the
                              database; it arrives in the query string
    privacy/                  UK GDPR privacy notice
    terms/                    Terms of use + community guidelines
    account-closed/           Where a closed account lands — public, outside
                              (app) and outside AUTH_ROUTES, or it would loop
    (app)/                    Authenticated shell (sidebar); force-dynamic
      layout.tsx              requireSession() — the real auth boundary
      admin/coordinators/     Platform-admin queue — one of two pages not scoped
                              to one village; approve promotes to COORDINATOR
      admin/villages/         The other. Activate a directory entry, mint and
                              rotate its join code, appoint its first
                              coordinator. Platform-admin only, all audited —
                              this is the bootstrap, over src/lib/villages.ts
      coordinator-apply/      The resident's application form + its action
      map/                    Full-screen Leaflet map, severity pins, heatmap
      incidents/              List with type + severity filters (GET form)
      incidents/[id]/         Detail — media, tags, map pin; params is a Promise
      incidents/[id]/edit/    Reporter's own edit, queue statuses only
      incidents/[id]/actions.ts  Moderate / edit / withdraw server actions
      incidents/new/          Report wizard host (village lookup, server-side)
      dashboard/              Stats, breakdowns, hotspots, moderation queue
      dashboard/actions.ts    Moderate, audited raw-text reveal, and the four
                              village settings — the parish council,
                              auto-approve, the WhatsApp Channel and the face
                              redaction level
      dashboard/audit/        Audit trail viewer — coordinator only, filterable
      dashboard/compliance/   The legal gate — renders whichever documents the
                              village's mode calls for, in full, and records the
                              acceptance. Until they are accepted the village
                              accepts no report at all
      dashboard/compliance/actions.ts  acceptComplianceAction — the one-way
                              write, one audit row per document — and
                              setVillageModeAction, the one-way upgrade
      dashboard/guide/        The Coordinator Guide, rendered from docs/. Gates
                              nothing — linked from the sidebar and offered on
                              the compliance page once all three are accepted
      reports/                Community safety report for police or the council
                              — date range as a GET form, coordinator only
      reports/actions.ts      generateNarrativeAction — the one Claude call,
                              rate limited, and where the audit row is written
      settings/               Profile and notification preferences
      settings/actions.ts     saveSettingsAction — never touches role/village
    forgot-password/          Ask for a reset link — public, no session
    reset-password/           Where the link lands; expired-link state built in
    api/auth/                 login, logout, register route handlers
    api/auth/callback/        OAuth return leg — exchanges the code, routes on
                              whether a profile row exists. Also the recovery leg
    api/auth/complete-profile/  Writes the profile for a provider sign-up
    api/auth/reset-password/  Sets a new password for the current session
    api/coordinator-requests/   POST apply (resident), GET list (admin only)
    api/coordinator-requests/[id]/  PATCH approve or reject — admin only
    api/incidents/            POST create report (writes AI fields + tags)
    api/incidents/[id]/       DELETE the reporter's own report — 204/403/404
    api/incidents/process/    POST run a draft through Claude; writes nothing
    api/incidents/media/      POST blurred upload, DELETE abandoned attachment
    api/notifications/        POST re-send a published incident's alert
    api/dashboard/export/     GET village incidents as CSV (public columns only)
    api/reports/[villageId]/pdf/  GET the community safety report as a file.
                              The id in the path decides nothing — see The PDF
    api/digest/               Weekly cron — Claude summary, PatternAlert, push
    api/cron/retention/       Nightly cron — archives reports, deletes old media
  components/                 Shared UI (logo, app-shell, placeholder, auth forms)
    auth/google-button.tsx    "Continue with Google" + the or-divider, shared
    auth/login-form.tsx       Email and password, plus the Google button
    auth/register-form.tsx    The password sign-up — village, join code, terms
    auth/welcome-form.tsx     The provider sign-up's second half
    auth/home-location-field.tsx  The optional pin, shared by both halves of
                              registration so one promise covers both screens
    auth/village-picker.tsx   Type-to-search village combobox + OGL attribution
    auth/forgot-password-form.tsx  Reset request — never reveals if an account exists
    auth/reset-password-form.tsx   New password; the session says whose
    site-footer.tsx           Public footer, incl. the legal links — shared
    legal-page.tsx            Shell + typography for /privacy and /terms
    status-screen.tsx         Shell behind not-found.tsx and error.tsx
    coordinator-apply-form.tsx  The application — role, detail, why
    coordinator-application.tsx Settings section: apply / pending / declined
    flash-toast.tsx           One toast after a redirecting server action
    markdown-view.tsx         Renders lib/markdown.ts's tree as React — no
                              dangerouslySetInnerHTML, so nothing to sanitise
    admin/coordinator-request-card.tsx  One application, approve or reject
    admin/village-card.tsx    One directory entry: activate, rotate the code,
                              appoint a coordinator
    incident-form.tsx         5-step wizard, react-hook-form + Zod
    media-uploader.tsx        Blur-then-upload; never touches the original
    location-picker.tsx       Leaflet pin picker — dynamic import, ssr: false
    ai-preview.tsx            Review / publish screens, reprocess + edit
    incident-map.tsx          Leaflet pin + heat layers — never import without
                              ssr:false. `mode` picks pins / heat / both
    map-view.tsx              Client wrapper: dynamic import, date range incl.
                              the custom pair, and the layer toggle in localStorage
    time-range-fields.tsx     The period control on /incidents and /dashboard.
                              Renders inside the caller's own GET form
    map/heatmap-layer.tsx     leaflet.heat as a react-leaflet child. The plugin
                              is imported dynamically inside the effect
    map/hotspot-heatmap.tsx   The dashboard's density thumbnail — heat only,
                              not interactive
    qr-invite.tsx             The invite QR — SVG on screen, canvas behind the
                              download, `[data-print-region]` for the sheet
    incident-location-map.tsx Client wrapper for the detail page's single pin
    incident-card.tsx         One incident, used by preview, list and detail
    incident-actions.tsx      Detail-page actions — reporter and coordinator
    share-summary.tsx         One report for a PCSO — navigator.share, then
                              the clipboard. Coordinator, published only
    copy-alert.tsx            The three share buttons — copy, WhatsApp, Facebook
                              — over one alert text. Coordinator, published only
    reports/report-period-picker.tsx  The period — one row, and the dates only
                              when the preset is Custom. Still a GET form
    reports/download-pdf-button.tsx  Fetch, check the status, then save. Sends
                              analysis=ai only once one is on screen
    reports/report-view.tsx   The period report on screen, on the clipboard and
                              on paper — one format, three destinations
    incident-edit-form.tsx    Five-field edit, no wizard, no re-anonymisation
    settings-form.tsx         Profile + notification preferences, one action
    delete-account.tsx        The danger zone — type your email to confirm
    push-registration.tsx     OneSignal init, login(userId), consent banner
    onboarding-tour.tsx       Four-step first-run tour; useSyncExternalStore
    service-worker.tsx        Registers /sw.js in production only
    dashboard/stat-card.tsx   One figure with its trend against last period
    dashboard/breakdown-bar.tsx  CSS bars — no charting dependency
    dashboard/moderation-card.tsx  Queue row; audited raw-text reveal
    dashboard/moderation-queue.tsx  Wraps the cards and holds the alert panel,
                              which has to outlive the card that produced it
    dashboard/compliance-form.tsx  The council model's acceptance checkboxes
    dashboard/community-compliance-form.tsx  The community model's — one box, and
                              the person ticking it is the data controller
    dashboard/village-mode-form.tsx  Handing the village to a parish council.
                              One direction, and the copy says so
    controller-duties.tsx     The three duties with a deadline, shared by the
                              community gate and the activation screen
    dashboard/parish-council-form.tsx  The data controller's name, or a note
                              saying the column is not there yet
    dashboard/export-csv-button.tsx  Fetches, checks the status, toasts the
                              route's own error — never saves a 403 as a file
    dashboard/auto-approve-form.tsx  The switch that turns coordinator review
                              off for the whole village — warns on the way on
    dashboard/whatsapp-channel-form.tsx  The village's own channel — link, id,
                              posting switch, severity floor
    dashboard/privacy-level-form.tsx  How the village covers faces — four
                              levels, each with a preview of what it looks like
    dashboard/invite-share.tsx  The invite: link, code, copy, WhatsApp, QR. The
                              one screen that shows a village's join code
    severity-badge.tsx        green / amber / red / purple pill
    incident-type-icon.tsx    Enum icon name → lucide component
    no-village.tsx            Shown wherever a resident has no village yet
  lib/
    prisma.ts                 Singleton + pg driver adapter
    auth.ts                   getSession / requireSession / requireRole /
                              requireCoordinator / requireAdmin
    admin.ts                  ADMIN_EMAILS — the platform admin allow-list
    slack.ts                  Staff webhook, fire-and-forget, server only
    moderation.ts             applyModeration, audited readRawDescription, and
                              the village's auto-approve setting (fails closed)
    erasure.ts                removeIncident + eraseAccount — Article 17,
                              tombstones the row and deletes the media
    audit-context.ts          The caller's IP and browser for an AuditLog row.
                              Server only, never throws — the server actions
                              have no `request` to read them off
    villages.ts               The one village module: activate, mint and rotate
                              a join code, appoint the first coordinator, check
                              a resident's join, and the columns the dashboard
                              reads. Server only
    coordinator-requests.ts   Apply, approve, reject — the applied-for route to
                              COORDINATOR. `villages.ts` is the other one
    compliance.ts             The gate — three states, the missing column is one
                              of them, and `Village.mode` decides whether it asks
                              for one document or three. Server only
    docs.ts                   Reads one docs/*.md and parses it. Server only,
                              and where the outputFileTracingIncludes trap is
                              written down — every file needs a line there
    compliance-documents.ts   The four gate documents, over docs.ts. Which of
                              them a village sees is `documentsForMode`
    markdown.ts               A small Markdown parser to a typed tree, so the
                              renderer needs no dangerouslySetInnerHTML
    notifications.ts          OneSignal dispatch, audience rules — server only
    whatsapp-channel.ts       Village channel config + the publish log line —
                              server only, opt-in, no API that can post
    format-alert.ts           formatIncidentAlert — the one WhatsApp alert
                              format, client-safe, shared by log and clipboard.
                              Also the WhatsApp and Facebook share links, over
                              the one exported `incidentUrl`
    report-pdf.tsx            The same period report as an A4 PDF. Server only —
                              the one module that renders one, and where the
                              hyphenation callback is registered
    community-report.ts       The police/council documents — one incident and a
                              period. Client-safe, no rawDescription/lat/lng
    incident-reference.ts     VW-HIS-2026-0003 — the village's code, the year and
                              the village's own count. Client-safe, one format
    invite.ts                 buildJoinUrl / buildInviteUrl / readJoinCodeParam —
                              client-safe, and the code never comes from the DB
    date-range.ts             The period behind /map, /incidents and /dashboard
                              — one resolver, client-safe, nothing rejects
    calendar.ts               The month grid and the range chip behind /reports'
                              date picker. Client-safe, pure, host zone
    structured-data.ts        The landing page's JSON-LD graph. Server or client;
                              every field in it is a claim that has to be true
    heatmap.ts                Severity × recency → heat intensity, plus the
                              layer's config. Client-safe
    reports.ts                Resolves the date range, counts the period, and
                              writes the narrative when Claude is unavailable
    clipboard.ts              copyText + shareText, browser only, shared by the
                              three surfaces that copy
    cron.ts                   Constant-time CRON_SECRET check, shared by both jobs
    email/                    Templates only — no transport. layout, welcome,
                              weekly-digest, incident-notification,
                              coordinator-decision
    ai/weekly-digest.ts       Claude weekly summary, structured, typed failures
    ai/report-narrative.ts    Claude pattern analysis for a date range — same
                              contract, written for a PCSO rather than residents
    geo.ts                    fuzzCoordinates — server only, uses node:crypto
    rate-limit.ts             Fixed windows counted in `rate_limit` — server only
    format.ts                 Time-ago, dates, sizes — en-GB
    incidents.ts              PUBLIC_INCIDENT_SELECT (no rawDescription), mappers
    incident-csv.ts           The export's formatting — pure, so it is testable
                              without a session. Quoting *and* formula guarding
    ai/client.ts              Anthropic client + isAiConfigured — server only
    ai/structure-incident.ts  Claude call, structured output, typed failures
    ai/detect-patterns.ts     200m/30d lookup + deterministic pattern heuristic
    media/face-blur.ts        MediaPipe WASM face detection + canvas blur
    media/storage.ts          Signed URLs + base64 stills — service-role, server only
    supabase/                 server.ts, client.ts, admin.ts, env.ts
    constants.ts              Enum display metadata, severity colours, map config
    validations.ts            Zod 4 schemas
  generated/prisma/           Generated client — gitignored, never edit
prisma/
  schema.prisma
  seed.ts                     One village, 5 incidents, 1 pattern alert; idempotent
  seed-villages.ts            The ONS village directory — parish layer, PENDING
  sql/postgis.sql             Extension, triggers, GiST indexes
  sql/rls_policies.sql        Row-level security — apply after postgis.sql
data/
  cambridgeshire-villages.json  Committed snapshot — the offline seed fallback
  ons-places.csv              The IPN download. Gitignored, 47MB, fetched on demand
public/
  manifest.json               PWA manifest — start_url /map, two shortcuts
  sw.js                       Offline worker. Caches the shell only, never HTML
  offline.html                Standalone fallback page, zero dependencies
  favicon.ico                 16 + 32 multi-size — the one icon requested with
                              no HTML in front of it to say where else to look
  favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png,
  android-chrome-192x192.png, android-chrome-512x512.png
                              The conventional names, at the root because that
                              is where a browser looks for them
  icons/                      The two maskable icons only — everything else
                              moved to the root. Generated by generate-icons.mjs
  onesignal/                  OneSignal's worker, scoped away from root
docs/                         The documents rendered from disk, not restated
  DPIA.md, APD_TEMPLATE.md, DATA_PROCESSING_AGREEMENT.md   The council model's
  COMMUNITY_DPA.md            The community model's one, for a village with no
                              council: the Article 28(3) terms and the Schedule 1
                              paragraph 5 policy document in one agreement
  COORDINATOR_GUIDE.md        How to run a village, for a coordinator
                              The five above are rendered by the app and need a
                              line in `outputFileTracingIncludes`. The three
                              below are not — they are read by people, in the
                              repository, and nothing imports them
  E2E_VERIFICATION.md         What was checked by hand against the deployment,
                              and what its addenda got wrong afterwards
  FUNDING.md                  The five tracked grant opportunities
  GRANT_APPLICATION_NL_AI.md  The first application, drafted. Every claim in it
                              is held to the rule /privacy is held to
scripts/
  generate-icons.mjs          Authoring tool — renders the icons, run by hand
  download-ons-places.ts      Finds + fetches the newest IPN release, unzips it
  convert-grid-refs.ts        OSGB36 → WGS84 via geodesy; library + CLI
  clean-seed-data.ts          Removes the sample village's invented incidents —
                              one hardcoded slug, matched by title, dry run first
  clean-village.ts            Empties one village by slug and re-opens its
                              compliance gate. Deletes every report in it, not
                              just test data. Dry run first
tests/                        Vitest, unit only — see The test suite
  rate-limit.test.ts          Quotas, independence, fail-open, the 429
  auth.test.ts                requireSession / requireAdmin / isPlatformAdmin
  structure-incident.test.ts  Every typed failure of the AI pass, none thrown
  validations.test.ts         The Zod schemas, both directions
  channel-code.test.ts        extractChannelCode + the dashboard's channel form
  format-alert.test.ts        The WhatsApp alert — severity, place, the link —
                              and the two share links, incl. Facebook refusing
                              a relative URL rather than posting a dead one
  compliance.test.ts          The gate's three states, its one-way write, all
                              three council documents being required, and the
                              community model — its one agreement, the tick that
                              is dropped, and the village that stays open
                              mid-upgrade
  compliance-documents.test.ts  The four docs/*.md load and parse, each mode
                              loads exactly its own, and **both** agreements
                              carry all eight Article 28(3) obligations
  markdown.test.ts            The parser, incl. leaving snake_case alone
  heatmap.test.ts             The intensity scale — no point exceeds the layer's
                              max, and the legend's CSS stops ascend
  invite.test.ts              The invite link — the code survives, a missing one
                              stays missing, and a bad base costs a relative path
  privacy-level.test.ts       The four levels, the free-text column's fallback
                              (including `toString`), and the write schema
  date-range.test.ts          The period resolver — presets, the allowed-list
                              narrowing, custom inclusivity, and `all` adding no
                              `occurredAt` key at all
  report-pdf.test.ts          The PDF — the column widths totalling 100, and a
                              real render of the empty, the wrapping and the
                              200-row cases
  incident-reference.test.ts  The village code, the four digits, the fallback for
                              a row with no number, and 0 not being falsy
  incident-csv.test.ts        The export, parsed back rather than string-matched
                              — and the formula guard behind its two laundering
                              prefixes
  report-range.test.ts        /reports' own resolver — the clamp, `?days=`, the
                              round trip a date input has to survive, and the
                              two presets that are not a count of days back
  calendar.test.ts            The picker's arithmetic — the Sunday that shifts a
                              month, the 31st that skips February, the date that
                              is shaped right and does not exist, and the year
                              the chip prints only where it says something
  village-join.test.ts        checkVillageJoin — the blank code, the empty
                              string, normalisation, the legacy null, and status
                              refusing before the code is looked at
  village-mode.test.ts        The mode resolver — the prototype key, the
                              fallback's direction, and the two document sets
                              having nothing in common
  retention.test.ts           The nightly archive pass — the wording deleted in
                              the same statement, and the hand-archived catch-up
vitest.config.ts              node environment, the `@/*` alias, no setup file
.github/workflows/
  ci.yml                      lint → typecheck → test → build, PRs and main
  database.yml                migrate deploy → postgis.sql → rls_policies.sql
  version.yml                 standard-version bump on a releasable push to main
SETUP.md                      Thirteen-step first-run guide + troubleshooting
PROJECT_STATE.md              Where the project is right now — live version,
                              branches, open items, blockers, what shipped.
                              Updated in the same commit as the work
BACKLOG.md                    The numbered items of work and their status
```

---

## Domain rules

These are not style preferences. Breaking them leaks residents' personal data.

1. **`Incident.rawDescription` is never public, and it does not survive
   archiving.** It holds the reporter's verbatim words — names, plates,
   addresses. Only the reporter, coordinators and moderators may read it, and
   every read writes an `AuditLog` row. The public surface is
   `Incident.description`, the anonymised rewrite. Read incidents through
   `PUBLIC_INCIDENT_SELECT` in `src/lib/incidents.ts`, which omits the column
   entirely — no page or list should be able to reach it by accident. The column
   is **nullable, and null means deleted**: `/api/cron/retention` clears it at
   `RETENTION.incidentArchiveMonths`, which is what `/privacy` §7 promises. See
   The retention job.
2. **Coordinates are fuzzed before they are stored.** Jitter by
   `LOCATION_FUZZ_METERS` on the way in. The exact reported point is never
   persisted, so it cannot leak later.
3. **Media is redacted and EXIF-stripped before it is *uploaded*.** Faces are
   detected and covered on-device by `src/lib/media/face-blur.ts`, and only the
   re-encoded canvas output is sent — which also drops the EXIF block, GPS tag
   included. `POST /api/incidents/media` has no server-side fallback on
   purpose: a fallback would mean accepting an original with a face in it. Serve
   `redactedPath` once `redactedAt` is set. Photo GPS EXIF has re-identified
   people before. **There are two ways to cover a face and the default is the
   black box** — see Covering faces.
4. **The village is the tenant boundary.** Every incident query must be scoped
   by `villageId`. Use `getCurrentVillageId()` — never trust a village id that
   arrived in a request body.
5. **Roles come from the server.** `role` and `verifiedAt` are set by server
   code from a verified join code or a coordinator action, never from a client
   payload.
6. **Only `PUBLIC_INCIDENT_STATUSES` reach residents.** Drafts, pending and
   rejected reports stay in the moderation queue.
7. **`AuditLog` is append-only.** Never update or delete rows from application
   code.

## Auth model

- `src/proxy.ts` is an **optimistic** redirect layer — it keeps signed-out users
  out of app routes and refreshes session cookies. It is not the authorisation
  boundary.
- `src/app/(app)/layout.tsx` calls `requireSession()`. That is the real gate.
- Coordinator routes additionally call `requireCoordinator()`.
- RLS on every table is applied and tested — `prisma/sql/rls_policies.sql`.
- `getSession()` uses `supabase.auth.getUser()`, which revalidates the JWT
  against Supabase. Never swap it for `getSession()` on the Supabase client,
  which trusts the cookie as-is.

### Two ways in, one profile row

`Session.profile` is nullable, and with Google sign-in that state is now routine
rather than an anomaly. An auth user is an identity; a `User` row is a resident
of a village. The two are created together by `POST /api/auth/register` and
separately by everything else.

- **Password.** `/api/auth/register` collects the village, join code and terms
  alongside the credentials and writes the profile before it returns. Supabase
  requires email confirmation, so the account cannot sign in until the link is
  clicked.
- **Google.** `signInWithOAuth` from the browser client (it starts PKCE, and the
  verifier has to live where the callback can read it), Google returns to
  Supabase, Supabase to `/api/auth/callback`. That route exchanges the code —
  server-side, because only a Route Handler has a writable cookie store — and
  then routes on one question: does a profile row exist? Yes, straight to the
  app; no, to `/welcome`.
- **`/welcome` is the second half of registration**, not a settings screen.
  `POST /api/auth/complete-profile` takes the id and email from the session and
  never from the body, derives `role` and `verifiedAt` from a join code checked
  against the database (domain rule 5), and refuses to overwrite a profile that
  already exists — an unguarded upsert there would be a way to change your own
  village.
- **`(app)/layout.tsx` redirects a profile-less session to `/welcome`.** Before
  Google that state was only reachable by a registration whose auth user was
  created and whose profile write then failed; the app has nothing to show
  someone with no `villageId`, since that is the tenant boundary every query is
  scoped by. `/welcome` sits outside the `(app)` group precisely so this cannot
  loop.
- **`next` is hostile input.** It survives a round trip through Google, so the
  callback re-validates it: relative paths only, and never protocol-relative —
  `//evil.test` is off-origin and starts with the `/` a naive check accepts.

### The password reset

`/forgot-password` → email → `/api/auth/callback` → `/reset-password` →
`POST /api/auth/reset-password`. Three of those four already existed.

- **`resetPasswordForEmail` runs in the browser**, for the same reason
  `signInWithOAuth` does: it starts PKCE and stores a verifier the callback has
  to read back. Called server-side, the verifier lands on the wrong machine and
  the exchange fails with nothing on screen to explain it.
- **The recovery link reuses `/api/auth/callback`.** It already exchanges a code
  and already validates `next`, so the recovery leg inherits that hardening
  instead of growing a second, less careful copy. `redirectTo` is the callback
  with `next=/reset-password`.
- **The request screen never reveals whether an account exists.** A Supabase
  error is logged and swallowed, and the same "check your email" panel renders
  either way. A form that says "no account with that email" is an enumeration
  oracle, and here the membership list is itself sensitive — it says who reports
  on their neighbours.
- **Nothing in the reset payload identifies a user.** No email, no id: the
  session decides whose password changes, which is what stops a link addressed
  to one resident setting another's. The route checks the session *before* it
  validates the body, so an unauthenticated caller gets 401 rather than a 422
  describing the password rules.
- **Neither route needs a proxy change** — `PROTECTED_ROUTES` is a denylist, so
  both are reachable signed-out, and `/reset-password` is deliberately not in
  `AUTH_ROUTES`, which would bounce to `/map` the very session a recovery link
  creates.
- `/reset-password` uses `getSession()` rather than `requireSession()`. The
  redirect to `/login` would tell somebody whose link expired only that they
  need to sign in — the one thing they cannot do. It renders an expired state
  with a link back instead.
- **Supabase sends the email, and its redirect URL must be allow-listed** in
  Authentication → URL Configuration, or the link dead-ends. The wording is
  Supabase's own template, not `src/lib/email/` — same constraint as the sign-up
  confirmation, and for the same reason.

---

## Row-level security

`prisma/sql/rls_policies.sql`, applied once after the first migration and after
`postgis.sql`. Re-runnable — every policy is dropped before it is created.

- **It does not gate the application's own reads.** Prisma connects as the table
  owner, and an owner bypasses RLS. Everything above — `requireSession()`, the
  `villageId` scoping, `PUBLIC_INCIDENT_SELECT` — is still the enforcement.
  What RLS closes is the `authenticated` / `anon` path: the Supabase JS client,
  PostgREST, Realtime, and anything reached with a leaked anon key.
- `FORCE ROW LEVEL SECURITY` is deliberately **not** set. It would apply the
  policies to the Prisma connection, where `auth.uid()` is NULL, and the app
  would lose access to its own tables.
- Policy predicates go through four `SECURITY DEFINER` helpers
  (`vw_current_village_id`, `vw_current_role`, `vw_is_coordinator`,
  `vw_is_admin`). Definer, because a policy on `users` that reads `users`
  recurses; `search_path` pinned empty, because a definer function that
  resolves names through the caller's path is an escalation primitive.
- Two triggers do what a policy cannot. `users_guard_privilege_columns` rejects
  a client changing its own `role`, `village_id` or `verified_at` (domain rule
  5 — a policy filters rows, not columns). `audit_logs_append_only` rejects
  every DELETE on the trail **including from the owner**, which is the only way
  domain rule 7 survives a careless `deleteMany`, and every UPDATE bar one:
  severing `actor_id` to NULL while every other column stays byte-identical.
  That single exception is what lets an account be deleted at all — the FK is
  `ON DELETE SET NULL`, so the cascade is an UPDATE — and it costs the trail
  nothing, because `actorEmail` and `actorRole` are denormalised for exactly
  that. `village_id` is the other `SET NULL` foreign key and is deliberately
  not carved out with it: there is no denormalised village column, so nulling
  it would destroy the only record of which village an entry belongs to.
  `DELETE FROM villages` therefore still fails, and should.
- **`villages` and `incidents` grant SELECT per column, not table-wide.**
  `join_code`, `whatsapp_channel_id` and `raw_description` are credentials or
  verbatim personal data, and a row policy cannot withhold a column — a
  table-wide grant hands all three to anyone with the anon key regardless of
  what the application selects. Safe columns are listed rather than unsafe ones
  revoked, so a column added later is withheld until someone thinks about it.
  Add a `Village` or `Incident` column and it needs a line there before a
  browser can read it. The cost is that `select=*` from PostgREST errors rather
  than quietly returning less — a loud failure over a silent one.
- **The `public` schema's role grants are set here, not assumed.** A
  `prisma migrate` reset runs `DROP SCHEMA public CASCADE` and the schema comes
  back with no grants to `anon`, `authenticated` or `service_role`. Nothing in
  the app breaks — Prisma is the owner — but every policy in the file goes
  dormant, failing at `42501 permission denied for schema public` before a
  policy is consulted, which reads as applied and enforces nothing. `anon` is
  deliberately left without USAGE, and the Supabase default ACLs are revoked so
  the next migration's table arrives closed rather than fully readable.
- The file documents its two departures from the Day 5 brief: incident SELECT
  covers `RESOLVED` as well as `PUBLISHED` (matching
  `PUBLIC_INCIDENT_STATUSES`), and notification SELECT is own-rows-only rather
  than village-wide.

## Rate limiting

`src/lib/rate-limit.ts`. Fixed windows counted in the `rate_limit` table, keyed
by Supabase auth user id — never by IP, because a village shares a broadband
line often enough that an IP limit would silence a household.

| Route                              | Rule              | Limit       |
| ---------------------------------- | ----------------- | ----------- |
| `POST /api/incidents/process`      | `aiProcess`       | 5 per hour  |
| `POST /api/incidents`              | `incidentCreate`  | 10 per day  |
| `generateNarrativeAction` (`/reports`) | `reportNarrative` | 12 per hour |

The third is the most expensive single call in the app — a month of a village's
reports goes into the prompt — and the only one a *coordinator* triggers by hand,
repeatedly, from a button. Twelve an hour is well above regenerating a report
while adjusting the dates and well below what a stuck retry loop would spend.
Being limited there costs the prose and not the document: every other section is
counted from the database, and `countedNarrative` writes the summary instead.
`GET /api/reports/[villageId]/pdf` shares that rule when the button asks for
`?analysis=ai`, and falls back rather than failing the download.

- **Counted after the body validates**, not at the top of the handler. A
  malformed request costs a Zod parse; burning a slot on one would let a
  client-side bug spend a reporter's quota without a single call reaching
  Claude or a single row reaching the queue.
- **It was a `Map` in the process until now, and that meant the limits were not
  limits.** On Vercel the counters were per lambda instance and reset on every
  cold start, so an idle deployment handed a fresh quota to whoever woke it up
  — precisely the caller worth limiting. The table is the shared state that
  comment always said was the fix, and the only change at the two call sites
  was an `await`.
- **One statement per check.** `INSERT ... ON CONFLICT (user_id, action,
  window_start) DO UPDATE SET count = count + 1 RETURNING count`, through
  `$queryRaw`. Not `prisma.upsert`, which is a read and a write that two
  concurrent requests can interleave between — the exact race a limiter exists
  to lose gracefully.
- **`windowStart` is aligned to a multiple of the rule's length**, not set from
  the first call. That is what lets every instance compute the same key from
  the clock alone, with nothing to agree on and no read before the write.
- **It fails open.** A database error is logged and the request is allowed. A
  limiter that failed closed would turn a blip into "you cannot file a report",
  and both limited routes need the database for their real work anyway.
- A 429 carries `Retry-After` and an `error` string. The wizard already treats
  any non-200 from the AI route as "no rewrite this time" and falls back to the
  reporter's own wording — **being rate limited must never block filing**.
- **The table is server-only.** `rls_policies.sql` enables RLS and writes no
  policy at all: own-rows SELECT would tell a caller how much quota is left
  before spending it, and own-rows UPDATE or DELETE would let them reset it.
  `userId` is `TEXT` with no foreign key, so a closed account cannot clear its
  counters by re-registering.
- Old windows are swept nightly by `/api/cron/retention` at
  `RATE_LIMIT_RETENTION_DAYS` (7). Longer than the longest window, so a sweep
  can never reopen one that is still counting.
- `POST /api/notifications` is coordinator-only and already audited, so it has
  no user-facing limit.

## The right to erasure

`src/lib/erasure.ts`, UK GDPR Article 17. A resident can delete a report they
filed and can close their account. Two entry points, one implementation:
`DELETE /api/incidents/[id]` and the "Delete report" button both call
`removeIncident`; `/settings` calls `eraseAccount`.

- **The row survives as `REMOVED`; its contents do not.** `AuditLog.entityId`
  points at the incident and the trail is append-only (domain rule 7), so a hard
  delete would leave the trail naming an id that resolves to nothing. What makes
  keeping the row acceptable is that the `TOMBSTONE` object in that file clears
  everything personal — `rawDescription` included. A status flip alone would be
  erasure in the interface and nothing at all in the database.
- **`reporterId` is severed.** It is the last link between the row and a person.
  The consequence is worth knowing rather than discovering: the reporter cannot
  see their own tombstone afterwards, because every reporter-scoped query keys
  on that column.
- **Clearing `lat`/`lng` clears the PostGIS point for free** — the trigger in
  `postgis.sql` nulls `location_point` whenever either coordinate is null.
- **Objects before rows**, the same order the retention job uses. Deleting the
  `IncidentMedia` row first would drop the only record of the storage path and
  orphan the file forever. If storage is unconfigured or a `remove()` errors,
  the rows stay and tonight's retention sweep finds them again.
- **The audit row is written before anything goes**, so it exists while there is
  still something to describe. `incident.deleted` and `account.deleted`;
  `incident.delete` stays in `AUDIT_ACTIONS` because rows written by the older
  withdraw button are still in the trail.
- **Every status except `REMOVED` can be erased** (`canReporterErase`). The old
  withdraw button covered the queue only, on the reasoning that a published
  report belongs to the village — a fair account of *editing* and none at all of
  erasure. It was also inconsistent: it allowed erasing a `PUBLISHED` report but
  not a `REJECTED` one, which is the report most likely to be full of a
  resident's unedited words.
- **The CSV export excludes `REMOVED`** and is the one query where that had to be
  added by hand — every other read is already narrowed to a status list, and a
  spreadsheet gets emailed and forwarded.
- **Closing an account does not delete the `User` row.** `deletedAt` is what
  closes it, and three gates read it: `POST /api/auth/login`,
  `/api/auth/callback` and `(app)/layout.tsx`, all of which land on
  `/account-closed`. `residentsToNotify` reads it too. It is deliberately **not**
  enforced in `getSession()` — that returns null for "signed out",
  `requireSession()` sends null to `/login`, and `proxy.ts` bounces a signed-in
  browser off `/login`, so a closed account would ricochet between the two.
- **`deleted_at` is in the privilege-column trigger** alongside `role`,
  `village_id` and `verified_at`. Without that clause a closed account could sign
  in to Supabase Auth directly with the anon key, null the column, and let itself
  back in past both sign-in gates.
- The Supabase `auth.users` row is still not deleted — that is an admin API call
  with no undo and it wants its own reviewed route, the same open item
  `RETENTION.inactiveAccountMonths` has.

## The legal pages

`/privacy` and `/terms`, public, sharing `src/components/legal-page.tsx` and
linked from `SiteFooter` and the registration form.

- `DATA_CONTROLLER` in `src/lib/constants.ts` is **placeholders**. A privacy
  notice that does not name a controller does not satisfy Article 13 — fill it
  in before a single real resident registers. It is also no longer the only
  answer: `Village.mode` decides whether the controller is a parish council or
  the village's own coordinator, so `/privacy` §1 and `/terms` §1 describe both
  and the constant is the fallback where no village-specific controller is
  named. See The two compliance models.
- The privacy notice makes six claims that are statements about how the code
  behaves: on-device blur with no server-side fallback (domain rule 3),
  coordinate jitter (domain rule 2), report text going to Anthropic, what the
  Slack staff channel is told, whether a human sees a report before it is
  published, and that the reporter's original wording is deleted when the report
  is archived. If any of those changes, `/privacy` changes in the same commit.
- **The fifth one is now conditional, and both documents say so.** `/privacy`
  §"It is not a decision about you" used to rest the Article 22 position on a
  coordinator reviewing every report; `Village.autoApprove` made that false for
  any village that switches it off. The human in the loop the notice now names
  is the reporter, who reads the rewrite and accepts it before anything is
  saved — which is true in both configurations. `/terms` §7 opened with the same
  claim and carries the same qualification. See Auto-approve.
- `RETENTION` describes the schedule the policy states, and
  `/api/cron/retention` now enforces the first two figures nightly, plus the
  deletion of `rawDescription` that rides on the archive statement. The other
  two — audit log expiry and dormant account closure — are still schedule-only;
  see The retention job for why neither belongs in that route.

## The retention job

`GET|POST /api/cron/retention`, daily at 02:00 UTC. It enforces the schedule
`/privacy` states, reading its numbers from `RETENTION` in `src/lib/constants.ts`
so the policy and the job cannot disagree.

- **Media first, then archiving.** Media deletion is the irreversible half and
  runs while the full 60 seconds are still available.
- **Objects before rows.** Deleting the `IncidentMedia` row first would drop the
  only record of the path and orphan the file forever. If `storage.remove()`
  errors the rows stay and tomorrow's run retries them.
- **Unconfigured storage deletes nothing** — not the objects, and therefore not
  the rows either. It reports `skipped: "storage_not_configured"`.
- **Archiving is a status change *and* a deletion**, keyed on `reportedAt`
  rather than `occurredAt`: a retention period runs from when the data was
  collected, and `occurredAt` is whatever the reporter typed. The same
  `updateMany` sets `status: "ARCHIVED"` and `rawDescription: null` — one
  statement, because a second pass is one a timeout can leave un-run, and the
  state it would leave behind is a report off the map with the reporter's words
  still in it, which is precisely the thing nobody notices. See Deleting the
  original wording.
- **One `AuditLog` row per village per run**, action `retention.sweep`, written
  only when something changed. Per incident would bury every human action in the
  trail for that month.
- Batched at `RETENTION_MEDIA_BATCH` per run. A backlog drains over several
  nights rather than timing out halfway.
- **`RETENTION.auditLogMonths` is not enforced and cannot be** — the
  `audit_logs_append_only` trigger rejects DELETE from everyone including the
  owner, which is what makes domain rule 7 survive. Expiring old trail rows is a
  deliberate DBA action. `inactiveAccountMonths` is not enforced either; closing
  an account means deleting an `auth.users` row and wants its own reviewed route.

`src/lib/cron.ts` holds the `CRON_SECRET` check both scheduled routes share.
Constant time, fails closed with no secret set.

## Deleting the original wording

`Incident.rawDescription` is `String?` and null is the deletion. Two things
write it: `/api/cron/retention`, at `RETENTION.incidentArchiveMonths`, and
nothing else. Erasure is the other direction and does not use null —
`src/lib/erasure.ts` writes `ERASED_TEXT`.

- **The notice was right and the code was not.** `/privacy` §7 stated that the
  verbatim submission went when a report was archived, and for as long as the
  retention job has existed its archive step was `status: "ARCHIVED"` and
  nothing else. The 13 August audit corrected the notice, which was the honest
  half; this is the half a resident was actually promised. `20260820100000_archive_deletes_raw_description`
  drops the NOT NULL and clears the rows already sitting archived.
- **Null, not a placeholder.** A sentinel string is a value a reporter could
  have typed, and this is the one column in the schema holding a resident's
  unedited words. The tombstone gets a placeholder because somebody opens an
  erased report and is owed a sentence; nobody opens an archived report's raw
  column except `readRawDescription()`, which returns
  `RAW_DESCRIPTION_DELETED_MESSAGE` instead — **and writes no
  `incident.raw_viewed` row**, because an entry against a report with no wording
  left reads, to the only audience the trail has, as a coordinator having looked
  at somebody's words.
- **`description` is untouched.** The anonymised rewrite is the report as far as
  every other surface is concerned, and archiving is a retention step rather
  than an erasure. Where the AI pass never ran the two columns held the same
  text, so the reporter's own wording survives in the public column — it was on
  the map from the day it was filed, so that is the report itself rather than a
  restricted copy being kept. `/privacy` §7 says so rather than leaving a
  resident to infer more than the promise covers.
- **A coordinator can archive by hand, which is the hole the one-line fix
  leaves.** `applyModeration` archives from `PUBLISHED`, `RESOLVED` or
  `REJECTED` at any time; such a report leaves `PUBLIC_INCIDENT_STATUSES` that
  day, so the archive pass — which selects on exactly that list — never sees it
  again and its wording would sit there for good. `clearArchivedRawWording` is
  the catch-up, and it is worst where it matters most: a `REJECTED` report is
  the one most likely to be full of a resident's unedited words.
- **The catch-up still waits for the retention age.** Tidying the map is
  housekeeping; destroying the reporter's words is not something housekeeping
  should quietly do, and a duplicate archived a week after filing may be the one
  a complaint turns on. Twelve months from `reportedAt`, whoever pressed what —
  which is also the only version of this that fits in a sentence of the notice.
- **`rawDescription: { not: null }` is what makes the catch-up self-limiting.**
  Every row it touches is a row it never touches again, so a village with a long
  archive does not write a `retention.sweep` audit row every night for the rest
  of time describing a deletion that already happened.
- **The audit row carries `rawDescriptionsDeleted` separately from
  `archivedIncidents`.** They differ on any run that catches one up, and the
  number a regulator asks about is the first.

## PWA and the two service workers

There are two, and the split is load-bearing. **A scope can have exactly one
controlling registration** — left at their defaults both would claim `/` and
whichever registered second would silently evict the other, giving either no
offline page or no push, with nothing on screen to say which.

- **`public/sw.js` owns the root scope.** Registered by
  `src/components/service-worker.tsx`, production only. It answers navigations
  the network refused, with `public/offline.html`, and that is all it does.
- **It never caches HTML, `/api`, or Supabase Storage responses.** Every page
  behind `(app)` is one village's data rendered for one signed-in resident; a
  cached copy would outlive sign-out on a shared device. The cache holds the
  offline page and the icons — public, static, identical for everyone.
- **OneSignal's worker moved to `/onesignal/`.** The file is at
  `public/onesignal/OneSignalSDKWorker.js` and `serviceWorkerPath` /
  `serviceWorkerParam` in `push-registration.tsx` point at it. Move one and the
  other must move with it. **The OneSignal dashboard's service worker path must
  match** — a 404 there fails silently, reporting a healthy init that never
  delivers.
- Icons are generated by `scripts/generate-icons.mjs` and committed. It borrows
  `sharp` from Next.js rather than adding a dependency; if Next drops it the
  script stops working and the committed icons carry on being fine.
- **One generator, one mark, three weights.** Every icon in the set is the
  shield from `src/components/logo.tsx`, and the only thing that changes with
  size is how much of it survives: `outline` above 48px (the header treatment,
  so the launcher icon and the sidebar logo are the same drawing), `solid` at
  32px where a 1.6/24 stroke lands near one pixel, and `silhouette` at 16px,
  which drops the house because at four pixels across it stops reading as a
  house and turns the shield into a white ring with a blue dot in it — a
  keyhole. Add a size and pick the band; do not add a second drawing.
- **There must be no `src/app/favicon.ico`.** Next's file convention serves that
  at `/favicon.ico` and it conflicts with `public/favicon.ico`, which is where
  this set puts it. The file that used to be there was Create Next App's default
  and was what every tab actually showed until Day 8.

## Email templates

`src/lib/email/` renders; it does not send. Every export is a pure function from
typed data to `{ subject, text, html }`. There is no transport, no provider and
no dependency — when one is chosen it goes in a `send.ts` alongside these and
every caller keeps handing it the same objects.

- **Every interpolation goes through `escapeHtml`.** Incident titles and
  descriptions are resident-written; an apostrophe is the common case and a `<`
  is the one that would inject markup into every recipient's inbox.
- **Every email ships a text part**, not as a fallback but as the message.
- `IncidentEmailInput` has no field that could carry `rawDescription`. An inbox
  is barely more private than a lock screen, and an email is the one place a
  leak is permanent and forwarded.
- Sign-up confirmation is Supabase's and has to be — only Supabase Auth can mint
  the token. `SUPABASE_EMAIL_TEMPLATES` holds that wording as constants to paste
  into the dashboard, so it lives in a diff rather than in an unversioned form.

## The onboarding tour

`src/components/onboarding-tour.tsx`, four steps, mounted in the app shell.

- **`useSyncExternalStore`, not `useEffect` + `setState`.** localStorage cannot
  be read during render; the server snapshot says "already completed" so nothing
  flashes for a resident who finished it weeks ago, and dismissing it in one tab
  closes it in the others.
- **It measures nothing.** The card is fixed to the bottom of the viewport and
  the highlight is a CSS attribute selector: the tour writes `data-tour-step` to
  `<body>` and `globals.css` rings the matching `[data-tour]`. No positioning
  library, nothing that can drift on a resize.
- **`body[data-tour-active]` hides the push prompt** while the tour runs. Both
  want the same corner, and being asked for notification permission over the top
  of an introduction is how a resident denies it permanently — which cannot be
  undone from the same origin.
- Completion is device-local on purpose. `User.onboardedAt` exists and is unused;
  it is the column for a cross-device version if one is ever wanted.

## The test suite

`tests/`, run by `npm run test` (Vitest), and by `.github/workflows/ci.yml`
between the typecheck and the build. Twenty-one files, 350 tests, covering the
paths where being wrong is expensive: the rate limiter, the two auth guards, the
join check, the AI pass's failure modes, the Zod schemas, the WhatsApp channel
code, the alert format, the incident reference, the CSV export's escaping and
formula-injection guard, the compliance gate's three states, the three legal
documents loading and parsing, the Markdown parser the compliance page renders
them through, the per-village face redaction level, the heat intensity scale,
the two date-range resolvers, the date picker's month arithmetic, the PDF's
layout, the invite link, the nightly retention sweep's archive pass and the two
compliance models.

- **Unit only, and no test may need a secret.** Prisma, Supabase and Anthropic
  are mocked at their module boundaries, so the suite runs on a fresh clone with
  no `.env.local` — the same property the lint, typecheck and build steps rely
  on, and the reason CI needs no environment at all. A test that wanted a
  database would be a test CI could not run.
- **`compliance-documents.test.ts` is the one that touches the disk**, and it
  earns the exception: it reads three files out of the working tree, needs no
  secret, and catches a failure that is otherwise invisible until a coordinator
  opens the page — a renamed or unparseable document renders as a red panel
  beside an acceptance form that still works, so a council would accept a
  document it was not shown. It asserts loading, parsing, a non-empty table of
  contents, and that the processing agreement still carries all eight Article
  28(3) obligations as lettered headings. It deliberately asserts no wording:
  these are documents under a council's review, and a test that failed whenever
  somebody corrected a sentence would train people to edit the assertion.
- **The mocks stop at the boundary, not before it.** `rate-limit.test.ts` mocks
  `$queryRaw` with a counter keyed `(userId, action, windowStart)` — the unique
  constraint the real SQL relies on — so "each action has its own quota" is
  exercised against the key rather than against a stub returning a number
  somebody chose. A mock that just returns `[{ count: 6 }]` would pass whatever
  the module did with the rule name.
- **A redirect is the refusal.** `next/navigation`'s `redirect()` throws, so the
  auth tests assert on the thrown target: a guard that failed to redirect would
  return a session and the page would render. `/login` for signed-out,
  `/map` for signed-in-but-not-allowed, and `requireAdmin` refusing a
  coordinator is asserted explicitly — it is not a superset of
  `requireCoordinator`.
- **`ADMIN_EMAILS` is read at module load**, so those tests `vi.resetModules()`
  and re-import with the environment they want. The fail-closed case — an empty
  allow-list admitting nobody, including a `role: "ADMIN"` profile — is the one
  worth reading.
- **Every failure code of the AI pass is asserted, and none of them throws.**
  That is the contract the wizard depends on: being rate limited, timing out or
  having no key must never block filing a report. Anonymisation itself is the
  model's behaviour and cannot be unit tested, so what is asserted at that
  boundary is the instruction sent (the system prompt forbidding names, which
  `/privacy` makes a claim about) and that nothing identifying comes back in the
  record.
- **The CSV tests are the reason `incident-csv.ts` exists.** They parse the
  output back rather than string-matching it, so "one record is always
  `CSV_COLUMNS.length` fields" is asserted against a description containing a
  comma, a quote and a CRLF — the three things that break a naive reader. The
  formula payloads are a table, each one behind the whitespace and control-
  character prefixes that used to launder it.
- **`tests/retention.test.ts` is the one route handler in the suite**, and it
  earns the exception the same way `compliance-documents.test.ts` does. The
  archive pass deletes a resident's verbatim words on a schedule with nobody
  watching, it needs no secret and no database once Prisma, the cron check,
  Storage and the rate-limit sweep are mocked at their boundaries, and the
  regression it catches — the wording surviving an archive — is invisible from
  every screen in the app. It asserts the predicate and the `data` object rather
  than a row count, because what matters is *which* rows are matched and which
  columns are written.
- **What is deliberately not covered**: no other route handler, no server
  action, no React component, no RLS policy. Those need a database, a request context or a
  browser, and a suite that needed any of them would stop being the thing CI can
  run on every push. The gap that matters most is named in Not built yet —
  nothing asserts that a `PENDING_REVIEW` village still queues.

## The canonical origin

`https://villagewatch.app`. It is written out exactly twice — as `APP_ORIGIN` in
`src/lib/constants.ts` and as the `.env.example` default — and everything else
builds absolute links from `NEXT_PUBLIC_APP_URL`, with `APP_ORIGIN` as the
fallback when it is unset.

- **That sentence was false for a while, and centralising was the fix rather
  than recounting.** The host was also written out in `/privacy`, in `/terms`
  and in the share card, in each case as a word rather than a link — the two
  notices name the service by the address a resident types, and the card prints
  it under the tagline. Three copies that would have carried on naming the old
  host on the day the domain changed, in the two documents where naming the
  wrong service is worst. `APP_HOST` in `constants.ts` is `APP_ORIGIN` with the
  scheme stripped, and those three render it.

- **The fallback is the real domain rather than `localhost`, and that is the
  change.** Three surfaces build absolute URLs — the "View details" line in a
  pasted WhatsApp alert (`format-alert.ts`), a push deep link
  (`notifications.ts`) and an email link (`email/layout.ts`) — and all three are
  read somewhere other than the machine that rendered them. A missing
  environment variable used to produce a link that could not work for anybody,
  and in the WhatsApp case it was pasted onto a public feed by a coordinator
  with no way to see which of the two hosts they had. Failing to the real origin
  is wrong only on a deployment that is not this one; failing to `localhost` was
  wrong everywhere but a laptop, where `.env.local` sets the variable anyway.
- **`NEXT_PUBLIC_APP_URL` still wins wherever it is set**, so a preview
  deployment describes itself. That is also why `metadataBase` in
  `src/app/layout.tsx` reads the variable first and only then `APP_ORIGIN`.
- **`.env.example` now defaults to production**, which is the one place this
  costs something: a fresh clone has to change it to `http://localhost:3000` in
  its own `.env.local` or every link it generates points at the live site. The
  file says so, and so does the README's quick start.
- **One canonical host, not two.** `www.villagewatch.app` is a redirect rather
  than a second origin: `NEXT_PUBLIC_APP_URL` is a single value, and a resident
  who signed in on one host and follows a push notification to the other arrives
  without their session cookie.
- **Three places outside the repo name the same host and all fail quietly if
  they disagree**: the Vercel environment variable, both fields of Supabase →
  Authentication → URL Configuration (a mismatch there sends a resident who
  signed in with Google to somebody else's `localhost`), and the OneSignal site
  URL. SETUP.md steps 7b, 8 and 10 cover them.
- `tests/format-alert.test.ts` deliberately passes `https://villagewatch.example`
  rather than the real domain. It is a fixture, and the point of it is that the
  function threads the base it is handed through to the link — an assertion
  against the production host would still pass if the argument were ignored.

## Deployment guardrails

- **`main` auto-deploys to production.** The rule here used to be "never push
  directly to `main`", and it is **overridden** — Joel pushes straight to `main`
  and that is the working arrangement. See Known Pitfalls below; do not block on
  it, do not open a PR to route around it, and do not reinstate the rule in a
  later edit of this file.
- Feature branch → PR → Vercel preview → review → merge is still the shape for
  anything somebody else is meant to read before it lands.
- **Commits are Conventional Commits.** `.github/workflows/version.yml` bumps the
  version, writes `CHANGELOG.md` and tags when a `feat`, `fix`, `perf`,
  `refactor` or `revert` lands on `main`. The release commit carries `[skip ci]`,
  which stops both the workflow re-triggering itself and Vercel spending a
  production deploy on a version bump.
- **The release step works out its own tag first and steps past one that is
  taken.** standard-version derives the next version from `package.json` and then
  runs `git tag`; where the tags and `package.json` have drifted apart the run
  dies at that line — *after* writing the changelog and the bump commit — and
  every subsequent push to `main` computes the same taken version and dies the
  same way. It is not hypothetical: `v0.1.30` is on the remote while
  `package.json` on `main` reads `0.1.29`, which is one force-push or hand-made
  tag away in any repository. The job asks `standard-version --dry-run` what it
  would call the release, checks that tag locally **and** on the remote — a local
  one is what `git tag` refuses, a remote one is what `git push --follow-tags`
  refuses several steps later — and passes `--release-as` the next free patch.
  Stepping past rather than skipping: the commits that earned the release are
  real, and a job that quietly released nothing would leave them out of the
  changelog for good.
- Staging uses a separate Supabase project. Never point a preview deployment at
  the production database.
- **Never run `prisma migrate deploy` against production by hand.** Migrations
  run in the deploy pipeline against staging first.
- `prisma db push` is for local scratch databases only — it does not create
  migration history.
- After any migration that adds a geography column, re-run
  `prisma/sql/postgis.sql`.
- After any migration that adds a table, re-run `prisma/sql/rls_policies.sql`.
  A new table arrives with RLS **off** and every row readable by the anon key.
- Never commit `.env.local`, real connection strings, or
  `SUPABASE_SERVICE_ROLE_KEY`. Only `.env.example` is committed.
- The git committer email must match a GitHub account Vercel recognises, or the
  deploy is blocked.

---

## Commands

```bash
npm run dev              # Dev server (Turbopack)
npm run build            # Production build — run before every PR
npx tsc --noEmit         # Typecheck
npx eslint .             # Lint
npm run test             # Vitest, once — what CI runs
npm run test:watch       # Vitest, watching
npx prisma generate      # Regenerate client after schema changes
npx prisma migrate dev   # Create + apply a migration locally
npm run db:seed          # Seed one village — set SEED_ADMIN_USER_ID first
npm run download:ons     # Fetch the ONS Index of Place Names to data/ (47MB)
npm run db:seed:villages # Seed the Cambridgeshire directory — 270 parishes
npm run db:seed:villages:all      # Every parish in England — 10,670
npm run db:clean-seed    # Remove the sample village's data — dry run by default
npm run db:clean-village -- --slug <slug>   # Empty one village — dry run first
npx prisma studio        # Browse data
npm run release:patch    # Bump version + changelog by hand (CI usually does it)
node scripts/generate-icons.mjs   # Re-render the favicons + PWA icons from the mark
psql "$DIRECT_URL" -f prisma/sql/postgis.sql        # PostGIS triggers + indexes
psql "$DIRECT_URL" -f prisma/sql/rls_policies.sql  # Row-level security
```

`SETUP.md` is the first-run guide — thirteen ordered steps, three lettered
sub-steps and a troubleshooting section. Several of them fail unhelpfully if the
one before was skipped.

---

## Definition of Done

A change is not finished when it works on the machine it was written on. All of
these, in this order — the first three are what CI runs, so failing them locally
only moves the failure somewhere slower and more public.

1. **`npm run build` passes.** The production build, not `npm run dev`. Several
   traps in this codebase — `serverExternalPackages` for `@react-pdf/renderer`,
   `outputFileTracingIncludes` for `docs/*.md` — fail **only** here and only in
   production, so a dev server that looks healthy proves nothing about them.
2. **`npx tsc --noEmit` is clean.** No new `any`, no `@ts-expect-error` left
   behind to be somebody else's problem.
3. **`npm run lint` passes.** No new warnings either — a warning nobody clears
   is a warning everybody learns to scroll past.
4. **`npm run test` passes**, and a new rule with a failure mode gets a test.
   Unit only, and **no test may need a secret or a database** — that property is
   what lets CI run the suite on every push with no environment at all. If the
   change has no testable seam, say so in the commit message rather than leaving
   it unremarked.
5. **No TODOs and no stubs introduced.** A function that returns a placeholder,
   a branch that logs and carries on, a `// TODO: handle this` — none of them
   ship. Either finish it or write it down in `BACKLOG.md` where it can be
   scheduled, because a TODO in the source is a decision nobody is tracking.
6. **`PROJECT_STATE.md` is updated** in the same commit. New status, new
   blocker, a branch that is now stale, a feature shipped — all of it belongs
   there while it is still true. A status file updated in a separate later pass
   is a status file that will not be.
7. **The documentation that makes a claim about this behaviour changes in the
   same commit.** This is not tidiness here — `/privacy`, `/terms`, the landing
   FAQ and the three documents in `docs/` all make statements about what the
   code actually does, and a false sentence in a privacy notice is worse debt
   than a missing one. `CLAUDE.md` too, if the change alters something this file
   describes.
8. **Pushed to `main`.** Conventional Commit subject, so `version.yml` can bump
   the version and write `CHANGELOG.md`.
9. **The Vercel deploy succeeds** — open the deployment and look at it. A green
   local build and a green deploy are different claims, and the difference is
   the environment variables. Check the preview URL renders the changed screen,
   not just that the build went green.

Anything touching the database adds one more: after a migration, re-run
`prisma/sql/postgis.sql` if it added a geography column and
`prisma/sql/rls_policies.sql` if it added a table **or a column** — the SELECT
grants are enumerated per column, so a new one is invisible through PostgREST
until it is named there, and a new table arrives with RLS off.

---

## Known Pitfalls

The gotchas that have cost time, in one place. Each has a fuller section
elsewhere in this file; this is the index to read before starting, not a
replacement for them.

- **"Never push to `main`" is overridden.** Joel pushes directly to `main`. Do
  not block on it, do not insist on a PR, and do not restore the old rule when
  editing Deployment guardrails. What still holds is everything the rule was
  protecting: `main` deploys to production the moment it lands, so the Definition
  of Done above is the review beat, and a migration that DROPs or renames still
  wants the deploy to land first.
- **Next.js 16 is not the Next.js you know.** `middleware.ts` is `proxy.ts` and
  lives at `src/proxy.ts`; `cookies()` and `headers()` are **async**, which is
  why `createClient()` in `src/lib/supabase/server.ts` is async and must never
  be hoisted to a module constant; page `params` and `searchParams` are
  **Promises** and have to be awaited. Read
  `node_modules/next/dist/docs/` before writing anything unfamiliar rather than
  trusting memory. Getting these wrong fails the build in ways that look
  unrelated to the cause.
- **Prisma 7 keeps the connection URL in `prisma.config.ts`, not
  `schema.prisma`.** The `datasource db` block declares `provider` and nothing
  else. The runtime goes through `@prisma/adapter-pg` — there is no Rust query
  engine — and `prisma.config.ts` uses `DIRECT_URL` on port 5432 because
  migrations cannot run through pgBouncer. `DIRECT_URL` must be the **session
  pooler** (`postgres.<ref>@aws-N-<region>.pooler.supabase.com:5432`), not
  `db.<ref>.supabase.co`, which is IPv6-only and dies with `P1001` on an
  IPv4-only network. Add no `extensions` list — extension tracking turns
  Supabase's pre-installed extensions into drift and demands a schema reset on
  every `migrate dev`.
- **Supabase is in London (`eu-west-2`) and every resident's data stays in the
  UK.** That is a claim `/privacy` and the processing agreement both make, so it
  is a constraint rather than a hosting preference. Anything that moves personal
  data to another region — a new processor, a different bucket, an API in
  another jurisdiction — needs the transfer mechanism settled and both documents
  changed before it ships.
- **OneSignal's service worker is scoped to `/onesignal/`, not the root.** A
  scope can have exactly one controlling registration, and `public/sw.js`
  already owns `/`. Left at their defaults, whichever registered second
  silently evicts the other — giving either no offline page or no push, with
  nothing on screen to say which. The file lives at
  `public/onesignal/OneSignalSDKWorker.js`, `serviceWorkerPath` and
  `serviceWorkerParam` in `push-registration.tsx` point at it, and **the
  OneSignal dashboard's path must match**: a 404 there reports a perfectly
  healthy init that never delivers a notification.
- **Unblurred media never leaves the device.** Faces are detected by MediaPipe
  WASM in the browser and covered on the canvas, and only the re-encoded output
  is uploaded — which is also what drops the EXIF block and its GPS tag.
  `POST /api/incidents/media` has **no server-side fallback on purpose**: a
  fallback means accepting an original with a face in it. Never add one, and
  never "temporarily" send the original to debug detection.
- **The compliance gate closes reporting.** With
  `20260728090000_village_compliance_gate` and `20260728150000_village_dpa_gate`
  applied, a village accepts **no** report until a coordinator has accepted the
  documents its mode calls for on `/dashboard/compliance` — `POST /api/incidents`
  and `POST /api/incidents/process` both 403 before parsing a body. Applying them
  is therefore a visible change to what residents can do: run the two
  **together** (the DPA one alone re-closes a village that had accepted the first
  two) and tell whoever coordinates the village first. The columns not existing
  allows reporting, loudly and deliberately — an unapplied migration is a
  deployment fault, not a council's decision.
  `20260820120000_village_community_mode` is the third of these and is the one
  that *opens* villages rather than closing them: it defaults every village to
  the community model, where the gate asks for one document instead of three. It
  backfills any village that has accepted a council document back to `council`,
  which is what stops it re-closing a village mid-flow. See The two compliance
  models.
- **`ADMIN_EMAILS=info@yakasista.com` is what gates `/admin`.** An administrator
  is an email address on the revalidated JWT, not a role: `UserRole.ADMIN` no
  longer opens anything (it survives because `vw_is_admin()` in the RLS policies
  is defined against it). The variable is server-only and comma-separated, it is
  read at module load, and it **fails closed** — unset, nobody is an
  administrator and the coordinator queue refuses everyone while applications
  keep arriving. Set it in Vercel as well as `.env.local`.
- **Fail-open and fail-closed are per module, and the disagreement is the
  design.** `rate-limit.ts` fails **open**, because a database blip must not
  become "you cannot file a report". `getVillageAutoApprove` fails **closed**,
  because a report published on the strength of a failed `SELECT` is not
  recallable. The compliance gate **allows** when its columns do not exist — an
  unapplied migration is a deployment fault rather than a council's decision —
  while any *other* database error there blocks. Three directions, three
  different failure modes, each chosen against the thing it would cost. A
  tidying pass that makes them consistent is a regression, and it will look like
  an improvement in the diff.
- **Three invariants this file stated were not true of the code. Two are fixed
  and the third was the sentence rather than the code.** Found 5 August 2026,
  closed 13 August. `checkVillageJoin` was never called and both auth routes
  accepted a blank join code — both now call it, and the code is required
  whenever the village has one. `src/lib/village.ts` and `src/lib/villages.ts`
  both implemented the village lifecycle and only the plural one was wired up —
  there is one module now, `villages.ts`, and the singular file is gone. The
  third stands as a correction to this file: `coordinator-requests.ts` is **not**
  "the only place in the codebase that raises a role", because
  `appointCoordinator` in `villages.ts` does it too and has to, since an
  application comes *from* a resident of a village and the first coordinator of
  a cold village is not one yet. Both share their two rules by convention rather
  than by code — never demote somebody who has since gained more access, fill
  `verifiedAt` only when it is empty — so a change to either is a change to
  check against the other.

---

## Covering faces

`src/lib/media/face-blur.ts`. Detection is MediaPipe's BlazeFace short-range
running in the browser; what happens to the box it returns is now a choice, and
`FaceRedactionMode` is that choice.

- **What actually runs by default is the standard blur, not the black box, and
  this file said otherwise for as long as both were true of something.** There
  are two defaults and they are different constants. `DEFAULT_REDACTION_MODE` in
  `face-blur.ts` is `redact` and is the fallback when `blurFaces` is called with
  no mode — which nothing does. `DEFAULT_PRIVACY_LEVEL` in `constants.ts` is
  `standard`, and *that* is what a village gets until a coordinator changes it,
  so what a reporter's photo actually receives is a six-cell mosaic under a 22px
  Gaussian. Quote the second one when describing behaviour to anybody; the first
  is a library default with no caller.
- **`redact` is a solid black rectangle.** No source pixels are read, so there
  is nothing left in the output to reconstruct from, no `ctx.filter` to be
  unsupported, and no browser on which it quietly degrades. Square corners on
  purpose — the rounded ones the blur used to draw read as styling, and the
  corners of the padded box are exactly where a jaw and an ear sit.
- **`blur` is the option, and it is pixelation rather than a smudge.** The
  mosaic is what destroys the identity: the region is resampled to
  `MOSAIC_CELLS` (6) across, so the original pixels no longer exist anywhere in
  the output and the Gaussian on top has nothing to sharpen back up. That
  ordering is also what makes it safe where `ctx.filter` is ignored — the worst
  case is a visible six-cell mosaic, not a recognisable face.
- **The old constants were the bug.** `MOSAIC_CELL_PX = 12` was a cell *size*,
  so destruction scaled with the photo — a face 400px across survived as a
  33-cell mosaic, with a jawline, a hairline and two eye sockets still in it.
  A count fixes every face at the same handful of blocks whatever its size on
  the sensor. `BLUR_RADIUS_RATIO` went 0.12 → 0.45, which is the difference
  between a pass its own comment called cosmetic and one that carries weight.
- **The blur draws overscanned.** A Gaussian that wide samples transparent
  pixels beyond the region's edge and drags them inwards, which left a
  translucent border showing the unblurred frame through it. The source is bled
  out by a blur radius on every side and clipped back, so every sampled pixel is
  real.
- **`redact` is the module's fallback because the failure modes are not
  symmetrical.** A redaction that was not needed costs a black rectangle in a
  photo of a hedge; a blur that was not heavy enough costs a resident their
  anonymity, in a file already published to the village and not recallable.
  Pixelation also has a long history of being undone — the search space behind a
  known mosaic is small enough to brute-force. What makes shipping `standard` as
  the *village* default defensible against that reasoning is the mosaic: it is
  fixed at six cells and is off the level scale entirely, so the original pixels
  stop existing at every level. The scale moves how much of the scene around a
  face survives, not whether the face does. See The privacy level.
- **The mode is recorded per file, not read off the control.** `BlurredMedia`
  and `AttachedMedia` both carry it, because the control can be changed after a
  file is processed and the file cannot. Telling a reporter their photo was
  redacted when it was blurred is the one label here that would matter.
- **Which mode runs is the village's decision now, not the reporter's.** See
  The privacy level below. `MediaUploader` takes a `privacyLevel` prop, maps it
  through `PRIVACY_LEVELS` and hands `blurFaces` a `mode` and a `blurRadius`.
  It applies to files added after a change; anything already attached keeps what
  it was processed with, and the panel says so once there is something to say it
  about.
- **The reporter's one remaining control only points one way.** A checkbox that
  blacks a face out completely, offered in any village not already set to
  `redact`. There is deliberately no control that covers a face *less* than the
  village asked for — the direction that cannot go wrong is the only one on
  offer.

## The privacy level

`Village.privacyLevel`, `PRIVACY_LEVELS` in `src/lib/constants.ts`, and a
selector on `/dashboard`. Four levels — `light` (blur, 15px), `standard` (blur,
22px, the default), `heavy` (blur, 35px), `redact` (black box).

- **It moves the Gaussian and nothing else.** `MOSAIC_CELLS` is fixed at six and
  is deliberately off the scale. The mosaic is what destroys the identity — the
  original pixels stop existing anywhere in the output — so the level decides
  how much of the *scene around* a face survives, not whether the face does.
  That asymmetry is the whole safety argument for putting a "light" option on a
  settings screen at all: a coordinator can make the cover look softer and
  cannot reach an upload somebody is recognisable in.
- **A `String` column, not an enum**, and there is no CHECK constraint. The
  narrowing happens in two places instead: `villagePrivacyLevelFormSchema` is a
  Zod enum and is the only thing in the application that writes the column, and
  `resolvePrivacyLevel` narrows on the way out. It falls back to `standard`
  rather than throwing, because this value becomes a redaction mode in a
  reporter's browser and an exception there is a wizard that cannot attach a
  photo.
- **`resolvePrivacyLevel` uses `Object.hasOwn`, not `in`.** `PRIVACY_LEVEL_META`
  is a plain object, so `in` answers true for `toString` and `constructor` — and
  this reads a free-text column, which is exactly where one of those could
  arrive. Asserted in `tests/privacy-level.test.ts`.
- **The value is applied in the browser and cannot be re-checked server-side.**
  `POST /api/incidents/media` never sees the original (domain rule 3), only the
  covered copy, so there is nothing to validate against. What bounds it is the
  scale: every level covers every face.
- **`getVillagePrivacyLevel` reports whether the column exists**, the same
  two-part answer `getVillageParishCouncil` gives and for the same reason —
  `20260728120000_village_privacy_level` is new. The difference is that `value`
  is never null: it ends up as a redaction mode, and there is no state whose
  right answer is to cover nothing, so an unmigrated database reports
  `available: false` with the standard blur.
- **`village.privacy_level_changed` is audited and toned `sensitive`**, the
  fourth village setting in `AUDIT_ACTIONS`. Its reason is its own: it is the
  only setting whose subject is neither the reporter nor the coordinator but
  whoever happened to be in shot and never chose to be.
- **The dashboard shows a preview of each level** — a six-by-six grid of flat
  colours under a CSS blur, which is the pipeline itself at a scale that fits in
  a settings row. No asset, no photograph of anybody, nothing to fetch, and
  labelled an illustration on screen.
- **`/privacy` and the landing FAQ changed in the same commit**, for the reason
  the legal-pages section gives. Both named a fixed default ("a black box by
  default"), which a coordinator can now change; they describe the mechanism and
  the village's choice instead. `/terms` never named a default and did not
  change.
- **`/privacy`, `/terms` and the landing FAQ changed in the same commit**, for
  the reason the legal-pages section gives. All three said photos were blurred;
  the notice now names both modes and which is the default. The promise that
  matters is unchanged and still structural — there is no server-side fallback,
  so an original with a face in it cannot be uploaded either way.

## The AI pass

`POST /api/incidents/process` runs a draft through Claude and returns a
structured record; it writes nothing, so the "Reprocess" button costs an API
call and no more. The wizard calls it on the way into the preview step, the
reporter reads and edits the result, and `POST /api/incidents` saves it.

- The model is constrained by `output_config.format` and the result is
  re-validated by `structuredIncidentSchema`. There is no prose to strip.
- **Every failure is a 200 with `ok: false`.** A missing key, a rate limit, a
  timeout and a refusal are all ordinary states; the wizard falls back to the
  reporter's own wording and says on screen that it did. Never make this path
  block filing a report.
- **Reports land in `PENDING_REVIEW` unless the village turned that off.** The
  rewrite is good; it is not a moderation queue. See Auto-approve below — the
  queue is still the default and the setting is the village's own decision.
- `rawDescription` and `description` now hold different text — the reporter's
  words and the published rewrite. When no rewrite happened, both hold the
  reporter's words. That was unconditionally safe while everything went through
  the queue; under auto-approve the reporter's read of the preview step is the
  only check, which is what the red warning on that screen is for.
- The `ai` block on the publish payload is **provenance, not authorisation**.
  It comes from the browser and could be forged; it decides nothing, because
  the moderation queue is the gate — and where there is no queue, because it
  still writes no column a resident could not have typed by hand.
- Pattern detection reads **published incidents only**. Feeding pending reports
  in would let a pattern note describe something the queue has not cleared
  (domain rule 6).

## The two compliance models

`Village.mode` — `community` or `council`, `community` by default. It is the one
thing that decides which documents the gate asks for, and the two differ in **who
the data controller is**. `VILLAGE_MODES`, `resolveVillageMode` and
`documentsForMode` in `src/lib/constants.ts`; the gate reads them in
`src/lib/compliance.ts`.

- **Why there are two.** The gate was built for a parish council: three
  documents, accepted by a coordinator *on the council's behalf*. That is the
  right set when a council is the controller and an impossible set when there is
  no council — which is most neighbourhood watch groups. Six neighbours and a
  WhatsApp group cannot produce a council's impact assessment, and asking them to
  is asking them not to start.
- **`community` makes the coordinator the controller**, which is what they
  already are in fact, and gives them one document: `docs/COMMUNITY_DPA.md`,
  carrying the Article 28(3) processing terms and the Schedule 1 paragraph 5
  policy document in one agreement written for a volunteer. One signature, in
  force on acceptance — unlike the council's DPA, which waits on a paper
  countersignature and says so in three places.
- **The paragraph 5 condition is not skipped and could not be.** It authorises
  processing criminal offence data at all and attaches to the *processing*
  rather than to the kind of body doing it, so dropping it would leave a
  community village with no lawful basis — the exact failure the gate exists to
  prevent. It is folded into the one document.
  `tests/compliance-documents.test.ts` asserts the eight Article 28(3)
  obligations against **both** agreements: the community model exists to ask a
  volunteer for less reading, not to give them a contract with fewer terms in it.
- **What community mode genuinely does without is the Article 35 assessment**,
  and that is a judgement rather than an omission. `docs/DPIA.md` assesses this
  service and rates no risk high after mitigation; a community village runs the
  same software with the same safeguards. The DPIA's own header note says so, and
  the community agreement links to it.
- **A village mid-upgrade stays open, and `isComplete` is where that lives.**
  Council mode is complete on the three documents **or** on a community
  acceptance that has not been superseded. Upgrading is a declaration that a
  council is taking the village on; the council then has to meet and adopt three
  documents, which takes weeks, and until it does the coordinator is still the
  controller and their agreement is still the authorisation. Blocking there would
  take a running village offline for the duration of its own paperwork, which is
  the surest way to make nobody press the button. A village activated straight
  into `council` mode has no earlier controller to fall back on and is blocked
  until all three land.
- **The upgrade is one-way and nothing is cleared.** `setVillageMode` refuses
  anything but `council` with `not_an_upgrade` and a sentence, rather than a
  validation error. The community acceptance stays: the coordinator *was* the
  controller for that period, and it is also what keeps the village open above.
- **The migration backfills, and that is the load-bearing statement in it.**
  `20260820120000_village_community_mode` defaults every village to `community`
  and then marks any village that has accepted *any* council document as
  `council`. Without it, a village part-way through the council flow would wake
  up owing a document it has never seen and its reporting would close — the
  failure `20260728150000_village_dpa_gate` already taught this codebase once.
- **A tick for a document the village's model does not ask for is dropped.**
  `acceptCompliance` filters against `documentsForMode` rather than trusting the
  payload. The screen never renders the other boxes, so reaching that state is a
  hand-made POST — and writing it would record a volunteer adopting a council's
  DPIA, or a coordinator personally taking on duties their council holds.
- **Two forms, not one with a flag.** `compliance-form.tsx` is the council's and
  `community-compliance-form.tsx` is the community one. Every sentence in the
  first is about accepting on somebody else's behalf and every sentence in the
  second is about the person reading it; one component with a mode boolean would
  be two sets of copy interleaved, which is how the wrong one ends up on screen.
- **`CONTROLLER_RESPONSIBILITIES` is rendered by `ControllerDuties` on two
  screens.** The community compliance screen shows it to the coordinator about to
  become a controller; `/admin/villages` shows it to the administrator activating
  a village, about the coordinator they are about to make one. Three duties, and
  they are the ones with a clock on them — a subject access request has a
  deadline, a breach has a shorter one, and the record of processing is what the
  ICO asks for first.
- **`/privacy` §1, `/terms` §1 and the Coordinator Guide changed in the same
  commit**, for the reason the legal-pages section gives. All three said the
  parish council is the data controller, which is now true of a minority of
  villages. `/terms` cannot read a village — it is public and sessionless — so it
  describes both and points at `/privacy` §1.
- **The coordinator-facing copy follows the mode too, and that was N15.** Two
  screens told every village it had a council: `/reports` said the document was
  "for your PCSO or parish council", and the dashboard's controller field was
  headed "Parish council" and asked for a council's legal name. In the community
  model there is no council to name — the coordinator is the controller — so the
  field a volunteer needs to fill in was asking them for something that does not
  exist, which is how it stays empty and every report they send names
  `DATA_CONTROLLER`, still placeholder text. The column is `Village.parishCouncil`
  either way; only the labels move.
- **`getVillageMode` is the cheap read for copy, and `getVillageCompliance` is
  the read for the gate.** The second joins four acceptance relations to work out
  whether a village may accept a report; a page changing one sentence needs none
  of them, and `/reports` re-renders on every change of period. `/dashboard`
  already calls the second, so it passes `compliance.mode` down rather than
  asking twice.
- **`mode` is deliberately not a column on `getVillageController`.** That
  function's shape is a retry that drops `parish_council` when the database is
  missing it; a second new column in the same SELECT would mean a database
  missing `mode` losing the council name with it — an amber warning about an
  unnamed data controller on a village that has named one.

## The compliance gate

`src/lib/compliance.ts`, `/dashboard/compliance`, and nine columns on `Village`.
A village accepts **no** report until its coordinator has read and accepted the
documents its **mode** calls for. It is the only gate in the app with no switch
to turn it off, and the reason is that it is a lawfulness question rather than a
configuration one. See The two compliance models for what each asks for.

- **Why it blocks rather than reminds.** Reports describe suspected criminal
  activity, which is criminal offence data under Article 10. Article 10 allows
  it only where domestic law authorises it; the authorisation is DPA 2018
  s.10(5) with Schedule 1 paragraph 10, and **paragraph 5 of that Schedule makes
  an APD a condition of relying on it**. A village with no APD is not a village
  with incomplete paperwork — its processing has no authorisation at all. The
  processing agreement is here for the same shape of reason: Article 28(3)
  permits a controller to use a processor **only** under a written contract, so
  a council with none is in breach from the first report filed. All three are
  authorisations that have to exist before the processing, not records made
  after it.
- **Three states, and the third is the interesting one.** Not accepted **blocks**.
  Accepted **allows**. And the columns not existing — because
  `20260728090000_village_compliance_gate` or `20260728150000_village_dpa_gate`
  has not been applied — **allows**,
  loudly. That last one is the opposite direction to the gate's whole purpose
  and it is deliberate: an unapplied migration is a deployment fault, not a
  council's decision, and taking every village offline over one would be a
  compliance feature causing the outage it exists to prevent. It is logged on
  every check and the dashboard names the migrations. Any *other* database error
  blocks, on `getVillageAutoApprove`'s reasoning.
- **`isMissingComplianceColumn` names `mode` in no message match.** Three
  letters that appear in half the errors Postgres emits, and matching them would
  turn an unrelated failure into "allow every report through". It needs no
  branch: it arrives in the same migration as `community_dpa_accepted_at`, so a
  database missing one is missing both, and `P2022`/`42703` catch it in the two
  shapes that carry a code.
- **`isMissingComplianceColumn` tests `dpa_accepted` separately from
  `dpia_accepted`.** They differ by one letter and neither is a substring of the
  other, so the obvious two-branch matcher would miss a database with migration
  7 applied and 8 not — and missing it means blocking rather than allowing,
  which is the direction that takes a village offline. Asserted per column in
  `tests/compliance.test.ts`.
- **Applying the migration closes every existing village at once.** Nullable,
  no default, null means not accepted. A default that let existing villages
  carry on would be a gate that gates nothing. That applies to the DPA migration
  too: a village that had already accepted the first two re-closes until
  somebody accepts the third. Apply both together and nobody notices.
- **Three documents, three acceptances, three audit rows — in council mode.**
  They answer to three
  different instruments — Article 35, Schedule 1 paragraph 5 and Article 28(3) —
  and a regulator asking when a council adopted its APD is entitled to an answer
  that is not "at the same time as something else". `compliance.dpia_accepted`,
  `compliance.apd_accepted` and `compliance.dpa_accepted`, all toned
  `sensitive`.
- **The third one records half of something, and says so.** The DPIA and the APD
  are the council's own documents and the council adopts them alone. The
  processing agreement is a **contract**, and is not in force until Yakasista Ltd
  has signed the paper copy too — nothing on a screen can evidence a second
  party's signature. So `dpaAcceptedAt` is the council's acceptance of the terms
  and nothing more; the audit row carries `party: "controller"`, the checkbox
  says it, and the completed panel says it again. A coordinator finishing this
  screen believing an agreement exists when one does not is the failure mode
  that copy exists for.
- **Acceptance is one-way, and re-accepting is a no-op.** Nothing here clears a
  timestamp or moves an existing one onto today, and nothing replaces the name
  against it — a council that adopted a document on a date did adopt it on that
  date, and a screen that could rewrite that would make the record worthless to
  its only audience. The annual review is a new signature on the paper document.
  Withdrawing is suspending the village, which is a different act.
- **The whole document is on screen, expanded, not summarised and not in an
  accordion.** The coordinator is accepting on the *council's* behalf, and an
  acceptance recorded against a summary would be worth less than none — it would
  look like a controlled process in the trail while standing for something
  nobody was shown. `src/lib/markdown.ts` parses to a typed tree and
  `MarkdownView` renders it as React, so there is no HTML string in the path and
  nothing to sanitise. It supports no `_underscore_` emphasis on purpose, so a
  snake_case identifier written outside backticks cannot have its middle eaten.
- **All three documents are written for a parish councillor, not for a
  developer.** They name no source file, no function and no column, and they
  explain what the service does rather than how it does it — the council is the
  data controller and these are the documents it signs. Every statement in them
  is still a statement about how the code behaves, so the rule the privacy
  notice is held to applies here too: change the behaviour and change the
  document in the same commit, in the same plain English. The processing
  agreement's §6(c) is the sharpest case — it is a list of the security measures
  actually in place, in a contract, so removing one of them is a breach rather
  than a stale sentence.
- **`docs/*.md` need `outputFileTracingIncludes`.** Nothing imports them, so
  Next's tracing would leave them out of the serverless bundle — it works in
  `npm run dev` and fails **only in production**. `next.config.ts` names all
  three. Add a document and add it there in the same commit. Also keep the
  literal `docs` segment in the `path.join`: a fully dynamic path makes Turbopack
  trace the whole project into the bundle.
- **Both routes are gated, not just the write.** `POST /api/incidents` refuses
  with 403 before the body is parsed and before a rate-limit slot is spent.
  `POST /api/incidents/process` refuses too — it sends a resident's verbatim
  words to Anthropic, and doing that for a report the village cannot lawfully
  accept would be a disclosure with nothing behind it.
- **`/incidents/new` renders the refusal rather than relying on it**, so nobody
  fills in five steps and attaches a photo before being told. A coordinator
  landing there gets a link through to the fix; a resident gets the sentence and
  the 999/101 numbers, because there is nothing they can do.
- **The checkbox names `Village.parishCouncil`**, falling back to
  `DATA_CONTROLLER` — which is still placeholders. A coordinator accepting "on
  behalf of [Parish Council name]" has accepted on behalf of nobody, so fill
  that in first. See The parish council.
- The three `*_accepted_by_id` columns are deliberately **absent** from the
  `villages` SELECT grant in `rls_policies.sql`. They are `users.id` values; the
  timestamps are granted and the identities are not.

## Auto-approve

`Village.autoApprove`, off by default, set by a coordinator on `/dashboard`. It
is the only setting in the app that removes a person from a path rather than
adding one, and it is read in exactly one place that matters:
`POST /api/incidents` asks `getVillageAutoApprove()` and files the report as
`PUBLISHED` or `PENDING_REVIEW` accordingly.

- **It changes the status a report is filed in, never which statuses are
  public.** Domain rule 6 is untouched — residents still see
  `PUBLIC_INCIDENT_STATUSES` and nothing else. Everything that reads incidents
  is unchanged, which is why the diff is small and the consequences are not.
- **The setting is read server-side from the village row and never from the
  body.** A client-supplied status or "publish me" flag would be precisely the
  escalation the queue exists to prevent. The wizard is *told* the value so its
  copy can be true; it is not asked for it.
- **`getVillageAutoApprove` fails closed**, the opposite of `rate-limit.ts` and
  deliberately so. A database error means we do not know what the village asked
  for, and the safe guess is the queue: a report that waits for a coordinator
  who was not expecting it is an inconvenience, and a report published because a
  `SELECT` failed is not recallable.
- **Auto-publishing owes the same fan-out a coordinator's Approve does** —
  village push, the public WhatsApp Channel log line, the staff Slack line and an
  `incident.publish` audit row. `announce()` in the route is where that set
  lives; keep it in step with `applyModeration`, which is where the same set is
  defined for the human path.
- **`announce()` cannot throw.** It is called inside the reference-clash retry
  loop, where an exception would be read as a P2002 and the report filed a
  second time. Every failure in it is a log.
- **The `incident.publish` row carries `autoApproved: true` and no `before`.**
  Without the row, the audit viewer's "Published" filter is empty in an
  auto-approving village and a coordinator asking what went live gets nothing.
  Without the flag it would read as somebody's decision. A `before` of
  `PENDING_REVIEW` would put a review in the trail that never happened.
- **`moderatedById` and `moderatedAt` stay null.** Nobody moderated it, and
  filling them with the reporter would put a resident's name against a review
  that did not occur.
- **Turning it on does not flush the queue.** Reports already filed were filed
  under a promise of review, and some are sitting there because a coordinator
  had doubts. It applies to what is filed next. The dashboard says so, and keeps
  rendering the queue underneath the notice while anything is still in it —
  a notice shown *instead* of a non-empty queue would leave a resident's report
  invisible to the village and to the only people who could publish it.
- **Coordinators are pushed when a report enters the queue**
  (`notifyCoordinatorsOfPendingReport`), which is new and is the other half of
  this: the queue only works if somebody knows it filled up. Not filtered by
  `notifyPush`, radius or `notifyMinSeverity` — those are how a *resident* asks
  to hear less village news, and this is work, not news. The reporter is
  excluded from their own alert. Reference and title only; a push body lands on
  a lock screen.
- **`village.auto_approve_changed` is audited and toned `sensitive`**, alongside
  `village.channel_update`. That one widens who can read a published report;
  this one removes the person who decides whether it is published at all.
- **Three screens had to stop making a promise the code no longer keeps**: the
  wizard's "what happens when you publish" list, the "Not anonymised" panel
  (which goes red and inverts its advice — the reporter's own words are about to
  be public), and the success toast. All three read the *server's* answer or the
  village row, never an assumption.
- **`/privacy` and `/terms` changed in the same commit**, for the reason the
  legal-pages section gives. Both stated that a coordinator reviews every report
  before publication; the Article 22 paragraph rested on it. The rewrite makes
  the human in the loop the reporter — who sees the rewrite and accepts it
  before anything is saved — and names the village setting as the village's
  choice. The landing FAQ said the same thing and changed with them.
- **A village running auto-approve *and* WhatsApp Channel posting has put
  unreviewed reports one paste away from the open internet.** Both default off,
  both are audited, and the dashboard orders them so the pair is visible at a
  glance. Nothing forbids the combination; it is a coordinator's call and it
  should be an informed one. The paste is now the safety margin that used to be
  the relay's absence: a coordinator filing into an auto-approving village lands
  on a success screen with the alert on it, having just read what it says.
- **A coordinator's own auto-approved report ends on a success screen, not a
  redirect.** Everyone else still gets the toast and `/incidents` — there is
  nothing for them to act on. See The WhatsApp Channel.

## The parish council

`Village.parishCouncil`, set by a coordinator on `/dashboard`. The third village
setting, and the only one that changes nothing about how a report flows.

- **What it decides is a name on a document.** It is the data controller printed
  at the foot of both things `/reports` produces — the period report a
  coordinator sends to a PCSO and the single-incident summary that leaves
  through the share sheet — and, once `/privacy` reads it, the body a resident
  is told to take a UK GDPR complaint to. Named wrongly, a subject access
  request goes somewhere with no authority to answer it.
- **What it is called depends on `Village.mode`.** "Parish council" in a council
  village and "Data controller" in a community one, where there is no council and
  the coordinator is the controller — one component with the mode passed in,
  because this is one field and one sentence changing rather than two sets of
  copy about who accepts what on whose behalf. See The two compliance models.
- **The coordinator sets it because the coordinator is who knows.** The column
  already existed and `saveVillageAdminSettings` already wrote it, but that is
  platform-admin only, so a village whose coordinator could answer the question
  had to ask somebody who could not. `requireCoordinator()` and the village from
  the session profile, same as the other two settings (domain rule 4).
- **Empty stores `null`, never `""`.** `reportController` falls back to
  `DATA_CONTROLLER` on a truthiness check, so an empty string would count as a
  controller being named and print a blank where a police report says who is
  answerable. The transform on `villageParishCouncilFormSchema` is what
  guarantees that, and it is asserted.
- **No format validation beyond a length cap.** These are the legal names of
  real bodies and they are not uniform — "Cyngor Cymuned Llanddewi", "The Parish
  Meeting of Croxton", "Bishop's Stortford Town Council". A pattern would reject
  somebody's actual council.
- **`village.parish_council_changed` is audited and toned `sensitive`**, next to
  the other two village settings but for a different reason. It widens no
  audience and removes no reviewer; it is a statement of legal accountability
  leaving the village on paper.
- **The form is disabled outright when the column does not exist.**
  `parish_council` arrives with `20260727180000_village_activation`, which is
  applied on the deployed database now but was not for as long as this form has
  existed — and a fresh clone or a restored copy can still be behind.
  `getVillageParishCouncil` returns whether the column is there as well as what
  is in it, because a plain null cannot tell "no council named" apart from "no
  column to name one in" — the first is the coordinator's to fix and the second
  is not. Typing a council name into a box that then refuses it teaches nobody
  anything, so the field is replaced by a note saying what has to happen and who
  has to do it. `setVillageParishCouncil` returns the same distinction rather
  than throwing, so the action never tells somebody to "try again" at something
  that cannot work until a migration runs.

## Push notifications

`src/lib/notifications.ts` is the only place that sends anything. Everything
else calls into it.

- **Alerts fire on publish, never on file.** `applyModeration` sends the village
  broadcast the moment a coordinator approves a report. A report sitting in the
  queue has not cleared moderation (domain rule 6), so nothing about it reaches
  a resident's phone.
- **Residents are targeted by OneSignal external id**, set to the Supabase auth
  user id by `OneSignal.login()` in `push-registration.tsx`. No segments — the
  audience is resolved here, against the database, where the village boundary
  and each resident's preferences actually live. `User.pushSubscription` is the
  VAPID-era column and stays unused.
- **The audience is village → preference → distance.** Distance is computed in
  JavaScript with `LOCATION_FUZZ_METERS` added to the resident's radius, because
  the stored point was jittered on the way in (domain rule 2). Anyone the test
  cannot be run against — no home location, or an incident with no coordinates —
  is **included**: a radius is a way to hear less, not a reason to silently drop
  an alert.
- **Nothing throws.** With no `ONESIGNAL_*` keys the payload is logged, the
  `Notification` rows are still written, and the caller gets
  `skipped: "not_configured"`. Publishing a report must never fail because a
  push did.
- Only public columns reach a payload. A lock screen is the least private
  surface there is.

## Staff alerts on Slack

`src/lib/slack.ts`. One webhook URL, one function, a plain `fetch` POST — no
SDK, because an incoming webhook is a URL you post JSON to. Optional: with
`SLACK_WEBHOOK_URL` blank every alert is written to the server console instead,
the same supported state OneSignal has.

- **It is a staff channel, not a product surface.** Residents never see it and
  nothing in the app depends on it. Four events: a registration (both the
  password and Google paths), a publish, a coordinator application, and a
  decision on one.
- **Nothing throws**, same contract as `notifications.ts`. A resident's
  registration must not fail because a staff channel was unreachable.
- **Callers `await` it, which is what fire-and-forget has to mean here.** On
  Vercel the function instance is frozen when the response returns, so a
  detached promise is not "sent later", it is "sometimes never sent". The call
  cannot throw and cannot exceed a 3s timeout, so awaiting buys delivery for a
  bounded cost.
- **What goes in a message is a privacy claim.** Slack is a third party outside
  the UK and a channel is retained indefinitely, so `/privacy` §6 names this
  disclosure — change what a message carries and that section changes in the
  same commit. Never `rawDescription` (domain rule 1 does not stop at the
  village boundary), never coordinates. A resident's name and email appear on
  registration and an application; that is the point of those two alerts and the
  notice says so.

## The WhatsApp Channel

`src/lib/whatsapp-channel.ts` and `src/lib/format-alert.ts`. Optional, off by
default, and — with the Facebook share beside it — one of the two ways an alert
leaves the village. See The public share buttons below for the pair.

- **Nothing posts to it, and that is the design now.** Meta's Cloud API sends
  messages to phone numbers; it has no endpoint that posts to a Channel.
  Third-party relays (Whapi and similar) do it by driving the WhatsApp Web
  protocol, which can breach WhatsApp's terms and get the number banned. The
  module used to be a provider-agnostic `POST {channelId, text}` to
  `WHATSAPP_CHANNEL_API_URL`; nothing was ever pointed at one, so its success
  path never ran and every publish took the `not_configured` branch. **The relay
  is gone** — both environment variables with it. What replaced it is a person:
  approving a report shows the coordinator the alert with a **Copy to WhatsApp**
  button, and they paste it.
- **`formatIncidentAlert(incident, appUrl)` is the one format**, in
  `src/lib/format-alert.ts`, and it is client-safe on purpose — `constants.ts`
  and `format.ts` and nothing else, so the same function builds the text the
  server logs and the text three screens render. Severity emoji and label,
  title, `📍 landmark · time ago`, a truncated description, the pattern note when
  the report is recurring, and the link. **The link is never sacrificed to the
  length limit**: the fixed parts are built first and the description gets what
  is left of `WHATSAPP_POST_MAX_CHARS`, capped at `ALERT_DESCRIPTION_MAX_CHARS`.
- **Three surfaces render it, all coordinator-only** (`CopyAlert` in
  `src/components/copy-alert.tsx`): the moderation queue the moment a report is
  approved, any published report's own page, and the wizard's success screen when
  a coordinator files into an auto-approving village. A resident never gets a
  button that republishes their neighbour's report outside the village. The
  Facebook button rides on the same three — same panel, same gate, same text.
- **The queue's alert lives in `ModerationQueue`, not in `ModerationCard`.**
  `moderateIncidentAction` revalidates `/dashboard`, so the approved report
  leaves `PENDING_REVIEW` and its card unmounts on the next render — an alert
  panel inside the card would appear and vanish in the same frame. The card hands
  it upwards through `onPublished`; the wrapper is not re-keyed by the queue, so
  React keeps it mounted and the text survives.
- **"Open WhatsApp" copies first, then navigates**, and it is `https://wa.me/`
  rather than a `whatsapp://` scheme URL. A channel invite link opens the channel
  and cannot carry a prefilled message, so a coordinator who pressed only that
  button would arrive with an empty clipboard; and `whatsapp://` fails silently
  on a desktop with no WhatsApp installed, where `wa.me` falls through to
  WhatsApp Web. `navigator.clipboard` needs a secure context, so there is an
  `execCommand` fallback behind it and the text stays selectable on screen.
- **The channel is the village's.** Both halves of a channel's identity — the
  public invite link and the code that addresses it — are columns on `Village`,
  set by that village's coordinator on `/dashboard`. **No environment variable
  names a channel**, and now none names anything else either: a deployment serves
  many villages and each runs its own.
- **The coordinator fills in one field, not two.** `whatsappChannelId` is still a
  column, but it is *derived* from the invite link by `extractChannelCode` in
  `src/lib/validations.ts` — the code is the last segment of the link WhatsApp
  hands the channel owner under "Copy link", so asking for it separately asked
  somebody to split a string by hand and let the two disagree: alerts to one
  channel, residents following another, nothing on screen to show it. The form
  previews the extracted code back, because a derived value that silently came
  out empty is the failure this replaced. Anything posted as `whatsappChannelId`
  is ignored — the transform on `villageChannelFormSchema` is the only thing that
  sets that column from the application. `getVillageChannel` falls back to the
  code in the link when the column is empty, which is what keeps the rows set by
  hand in psql — the only rows that have ever existed — from being enabled,
  configured and silently skipped as `no_channel`.
- **The follow link needs none of that.** A coordinator pastes the invite link
  into the dashboard form and `/settings` renders "Follow on WhatsApp" for every
  resident of that village; a village without one shows "WhatsApp Channel not set
  up yet". That half is officially supported, needs no credentials, and is what
  most villages will actually use.
- **`getVillageChannel` filters, `getVillageChannelSettings` does not.** The
  first is the read path and puts `url` through `safeChannelUrl`, because it
  feeds an `href` — including the "Open WhatsApp" button. The second is for the
  form that edits the column, where a bad link has to be visible to be
  correctable — it goes into a text input and never into an anchor.
- **The two village switches gate the log line, not the copy button.**
  `whatsappEnabled` and `whatsappMinSeverity` decide whether `logIncidentAlert`
  writes an alert for this village on publish. The button on a report a
  coordinator has just approved is not gated by them: that text goes to one
  person's clipboard, they have just read the report, and a village with no
  channel row still has a parish mailing list.
- **Changing the settings is audited; the alerts are not.**
  `village.channel_update` is toned `sensitive`, because switching it on says
  this village's alerts are meant for an audience wider than its own residents.
  An alert itself writes nothing — see below.
- **A channel is public**, so the rules are stricter than anywhere else:
  `whatsappEnabled` defaults false, `whatsappMinSeverity` defaults **HIGH** (push
  defaults to LOW), and `AlertIncident` has no field that could carry
  `rawDescription`, `lat` or `lng` — the same structural guard
  `IncidentEmailInput` uses. `locationText` is the anonymised landmark, and an
  alert with no place is not an alert.
- **The alert now carries the `description`, which the relay post did not.** The
  old post was a headline and a link on the reasoning that anyone entitled to the
  detail could sign in; this one is truncated to `ALERT_DESCRIPTION_MAX_CHARS` and
  is pasted by a coordinator who has just read the report, so the judgement is a
  person's and it is made with the text in front of them. **Where the AI pass did
  not run, `description` is the reporter's own wording** — the same text as
  `rawDescription`, already public on the map. `CopyAlert` reads `anonymized` and
  says so in red when it is false, because these are the buttons that put it in
  front of the open internet.
- **Nothing throws**, same contract as `notifications.ts`. There is no network
  call left in the module to fail.
- **No `Notification` rows** — that table is one row per user per delivery and a
  channel has no known recipients. **No `AuditLog` row** either: the alert is a
  deterministic consequence of `incident.publish` plus the village's own
  configuration, both already in the trail.
- `getVillageChannel()` refuses to return a `url` that is not `https:`. The
  dashboard form validates on the way in now, but the read-time guard stays:
  the column predates that screen and was set by hand for as long as it has
  existed, so nothing guarantees a stored value ever met a validator. A
  `javascript:` URL rendered into `/settings` would be stored XSS against the
  whole village.
- **`/privacy` §6 names this disclosure and the landing-page FAQ carves it out.**
  Both are statements about how the code behaves — change what a post contains
  and they change in the same commit.

## The public share buttons

`CopyAlert` renders three: **Copy alert**, **Open WhatsApp** and **Share to
Facebook**. One panel, one text, three destinations, and the same gate on all of
them — coordinators, published reports only. The share URLs are built by
`whatsappShareUrl` and `facebookShareUrl` in `src/lib/format-alert.ts`, beside
the format they carry.

- **They are the same act, so they get the same paragraph.** Both put a
  published report in front of people outside the village, both are a person
  with a clipboard rather than an integration, and both are covered by one
  entry in `/privacy` §6 rather than a WhatsApp sentence and a Facebook
  footnote. Adding a third destination means editing that entry, not adding
  another.
- **The link builders live in `format-alert.ts` and `incidentUrl` is exported
  for them.** Facebook needs the report's address as a parameter and the alert
  text already contains it; two builders would be two links, and the day they
  disagreed a coordinator would post a card pointing at one report under the
  text of another. Asserted in `tests/format-alert.test.ts`.
- **`facebookShareUrl` returns `null` for anything that is not absolute
  `http(s)`, and the button is hidden rather than broken.** `incidentUrl` falls
  back to a relative path on a malformed `NEXT_PUBLIC_APP_URL`, and `u=/incidents/<id>`
  posts `facebook.com/incidents/<id>` to a public feed — a dead link that reads
  as a working one. The same guard refuses a `javascript:` URL, which nothing
  here builds and which would otherwise reach `window.open`.
- **Facebook drops `quote` more often than it honours it.** Prefilled text is
  deprecated as a platform policy — a share the user did not write is a share
  they did not mean — so the composer frequently opens empty whatever is sent.
  That is why the button copies the alert to the clipboard *before* it
  navigates, exactly as "Open WhatsApp" does: the copy is what makes the button
  reliable, not a nicety on top of it. The note under the buttons says so, so a
  coordinator meeting an empty composer knows to paste rather than assuming the
  feature is broken.
- **Facebook's crawler cannot read the card it is building.** `/incidents/[id]`
  is behind `requireSession()`, so the scrape lands on the sign-in redirect and
  the card falls back to the site's own Open Graph image and tagline. That is
  the right outcome and worth stating rather than rediscovering: a card that
  rendered a village's incident detail for a logged-out crawler would be domain
  rule 6 leaking through a preview.
- **No new gate, no new audit row, no new environment variable.** The two
  village switches gate the channel *log line* and never gated the copy button
  (see The WhatsApp Channel); Facebook has no configuration at all, so on a
  published report it is simply one of the options in front of a coordinator.
  `/privacy` §6 says that in as many words rather than implying a setting that
  does not exist.

## Sharing with police and the parish council

`src/lib/community-report.ts` formats, `src/lib/reports.ts` counts,
`src/lib/ai/report-narrative.ts` writes the prose, and `/reports` puts the three
together. Two documents: one incident, and everything published over a period.

- **`community-report.ts` is client-safe, and that is load-bearing.** The
  narrative arrives in the browser from a server action, so the final text has
  to be assembled there — which is what makes the copy, the print and the share
  the same document by construction rather than by three call sites agreeing.
  Same import budget as `format-alert.ts`: `constants.ts`, `format.ts`, and
  nothing that touches Prisma or a secret.
- **`ReportIncident` has no field for `rawDescription`, `lat` or `lng`**, the
  same structural guard `AlertIncident` and `IncidentEmailInput` use, and here
  for a sharper reason: this text goes to the operating system's share sheet,
  and the app cannot see whether the coordinator taps an email to one officer
  or a group chat with forty people in it. The "map link" is the report's own
  page, which needs a signed-in resident of the village to open. A coordinate
  pair would be worse than useless — it was jittered on the way in (domain rule
  2), so it is precise enough to point at a house and not precise enough to be
  right about which one.
- **Published and resolved only**, which is narrower than the CSV export. The
  spreadsheet is a coordinator's own copy; this is written to be sent outside
  the village, and a report still in the queue has not cleared moderation
  (domain rule 6) while a rejected one is a report somebody decided should not
  be published at all.
- **The single-incident summary is gated exactly like the WhatsApp alert** —
  coordinators, published reports only. The destination is different and the
  reasoning still carries: approving is the act that says a report is fit to
  leave the queue, and a button that sends an unreviewed one over the reporter's
  head to the police is not one to hand out. A coordinator who wants the police
  to have it can approve it first, which is a decision and leaves a trail.
- **That summary is deliberately not audited, and the reason is a platform
  constraint rather than a preference.** `navigator.share()` has to be called
  inside the user gesture that triggered it; an `await` in front of it spends
  the gesture and iOS Safari refuses the call. An audit write before the sheet
  opens is a share button that does not work on a phone. What is left is a
  coordinator formatting one report they are already looking at, carrying only
  what every resident can already read.
- **The period report is audited** — `incident.report_generated`, toned
  `sensitive` next to `incident.export`, and written by the action rather than
  the page render. Same reasoning as `incident.raw_viewed`: a row per page view
  is a trail nobody can read, and viewing the figures is the dashboard's data in
  a different arrangement. Producing the document is the act.
- **The rate limit comes before the audit write, not after.** `AuditLog` is
  append-only including to the owner (domain rule 7), so a row written on every
  press with no ceiling in front of it is a held button filling a table nothing
  can clear. `RATE_LIMITS.reportNarrative` is that ceiling.
- **The narrative is a button, and the report is complete without it.** Every
  other section is counted from the database; this one is an Anthropic call over
  a month of a village's reports, and a page that spent it on render would spend
  it again on every date change, refresh and back button. When Claude is
  unavailable, `countedNarrative` produces a summary assembled from the counts
  and the document says which of the two it has — inventing prose to fill the
  gap would make an outage look like a working report to an officer with no way
  to tell.
- **There is no print button any more, and the print rules stay.** "Download
  PDF" was `window.print()` against `@media print` in `globals.css` until the
  server-rendered file replaced it; the button went with it, because two buttons
  producing two different PDFs is worse than one producing a predictable file —
  see The PDF report. What is left is Ctrl+P, which nothing advertises and which
  still produces the report rather than the app shell. The rules are page-global
  and the printable invite sheet rests on them too, so they are not `/reports`'s
  to remove. `[data-print-region]` marks what survives, `[data-print-hide]` the
  controls inside it that do not. They use `visibility` rather than `display`
  because the report sits several layers deep in the app shell and hiding an
  ancestor would hide the report with it.
- **What bounds the printed page is `table-layout: fixed`, not `width: 100%`.**
  Automatic table layout sizes from content and exceeds a percentage width to
  fit a column's longest unbreakable run, so the incident log ran off the right
  of the paper — where a printer, unlike the screen's `overflow-x-auto` wrapper,
  has no scrollbar and simply loses the columns past the fold. Fixed layout
  takes its widths from the header row, which is why every `<th>` in
  `report-view.tsx` carries a `print:w-[…]`: declare none and six columns split
  evenly, giving the description a sixth of the page. The page is `A4` at
  `15mm 10mm` — British product, and 10mm at the sides is 12mm of column width
  the log did not have at 16mm all round.
- **The print scale is `html { font-size }`, and it has to be.** Every size in
  the app is a Tailwind rem utility, and rem resolves against the *root*, so
  `body { font-size }` is inherited by nothing and changes nothing. 81.25% puts
  `text-sm` at ~11.4px and scales the padding and the table's minimum widths
  with it rather than leaving 16px gutters around 11px type.
- **The print rules in `globals.css` sit outside Tailwind's cascade layers**, so
  they beat any utility outright. That is what lets `white-space: normal` unpick
  the timestamp's `whitespace-nowrap` and `min-width: 0` unpick the table's
  `min-w-[46rem]` without resting on which variant the compiler emitted last.
  Set a property there and the matching `print:` utility becomes dead weight —
  pick one place per property.
- **`break-inside: avoid` is on rows and short sections, never on the log.** A
  box taller than a page is a request no engine can honour: some ignore it,
  others push the section to a fresh page, leave the one before it blank, and
  overflow anyway. `Section` takes `allowBreak` and the incident log is the only
  caller that sets it. Headings carry `break-after: avoid` instead, and `thead`
  is `table-header-group` so the columns repeat on every page the log runs onto.
- **The app shell's sidebar and top bar carry `data-print-hide`.** Under the
  `visibility` rule they were invisible and still occupied their boxes — 256px
  of nothing down the left of every page, taken out of the width the report had
  to fit into. The onboarding tour's card carries it too; the existing
  `[data-tour]` rule matches the sidebar links it points at, not the card, which
  is fixed to the viewport and printed over the top of the first page.
- **`Village.parishCouncil` names the data controller in the footer**, falling
  back to `DATA_CONTROLLER` in `constants.ts` — which is still placeholders, so
  `/reports` shows a warning when the footer would read "[Parish Council name]".
  That is the first thing in the app to actually read the column, and the
  dashboard's parish council field is what fills it — see The parish council.
- **`/privacy` §6 changed in the same commit**, for the reason the legal-pages
  section gives. It named one route to the police — a formal request the council
  decides on — and this adds a routine one a coordinator drives. The notice now
  describes both, says what a summary carries, and says which of the two is
  recorded in the audit trail.
- **The period is one row, and the dates are only on screen when they are being
  used.** `ReportPeriodPicker` is a Client Component around the same
  `<form method="get">` the page always had: a preset, a submit button, and — for
  `custom` alone — a chip reading "22 Jul – 21 Aug" that opens a two-month
  calendar. Both date inputs used to sit there permanently, doing nothing for
  every preset but one, which is four controls for a screen whose answer is "last
  month" nine times in ten. The presets gained "Last 90 days" and "This year"
  with the room that freed up.
- **Every preset still works with no JavaScript.** The `<select>` is a real one
  named `range` and "Build report" is a real submit button, so the property the
  GET form was built for — a period is a URL a coordinator can bookmark and send
  to whoever asks for the same report every month — survives the redesign. What
  needs JavaScript is the custom range, which was already the option that needed
  a person to work out that two fields elsewhere governed it.
- **`from` and `to` are submitted whatever is selected**, as hidden inputs. Two
  parameters `resolveReportRange` ignores for every preset bar `custom`, and a
  custom range that survives a trip through "Last 7 days" and back.
- **"This year" has its own branch in the resolver**, because it is the one
  preset whose span cannot be written as a number of days back from now — one day
  long on 1 January, 365 on 31 December — and it is deliberately not clamped to
  `REPORT_MAX_RANGE_DAYS`. That ceiling bounds what somebody can type; a leap year
  would otherwise shorten a named period by a day and claim it had been adjusted.
- **The grid disables what the resolver would have to fix**: days in the future,
  and days more than `REPORT_MAX_RANGE_DAYS` back. The clamp and its `notice` stay
  — they are what make a hand-edited URL safe — but a notice explaining that the
  dates somebody just clicked have been moved is worse than not being able to
  click them.
- **`src/lib/calendar.ts` is the arithmetic, and it is a module rather than
  three functions in the component** so the off-by-ones can be tested: the Sunday
  that shifts a month a column left (`getDay()` is 0, so `weekday - 1` is -1), the
  31st that skips February when a month is added to a day rather than to a month,
  and `2026-02-30`, which is shaped like a date and rolls forward to 2 March
  rather than failing. None of the three throws; each draws the wrong month.
- **Everything in the picker is the host zone**, which is `dateInputValue`'s own
  reasoning one layer up: a cell is built with `new Date(y, m, d)` and rendered
  back with the exact inverse of how `resolveReportRange` parses it. Formatting a
  cell in `Europe/London` would highlight a day either side of the one clicked on
  a UTC host.
- The date-range boundaries are the server's midnight, not London's. See
  `resolveReportRange` for why that hour is left alone.

## The PDF report

`src/lib/report-pdf.tsx` draws it, `GET /api/reports/[villageId]/pdf` serves it,
and `DownloadPdfButton` on `/reports` is the only thing that asks for one. The
same document the page already renders, as a file.

- **It replaced "Print or save as PDF", which is gone from the screen.** Print
  put *what is on the screen* on paper, wording for wording, which is what a
  coordinator wants when they have just read it — and that is the one thing lost
  here, softened by "Copy report" carrying the on-screen wording exactly. What
  print could not do is produce the same file twice: the page size, the margins,
  whether the browser prints its own headers and whether backgrounds survive are
  all the recipient's own settings, so the monthly report to the same PCSO came
  out different every month, and on a phone it usually arrived with the app's
  chrome in it. This route renders server-side, so the file is identical whoever
  presses the button. Keeping both would have meant a village sending its PCSO
  two documents with the same title and different layouts, and no way to say
  which one they had.
- **The village id in the path decides nothing.** It is there because a report
  is a village's document, but the village comes from the session profile and a
  path id that does not match is a 403 (domain rule 4). Written as a comparison
  rather than by ignoring the segment: a route that quietly served your own
  village whatever id you typed would look like a working access check to
  anybody testing it. The 403 is worded identically to a non-coordinator's, so
  it is not an oracle for which parishes are live.
- **Every exit is JSON and the file is built whole before the response starts.**
  Both are the CSV export's reasoning, and the second one is why
  `renderToBuffer` rather than `renderToStream`: once a response has started
  streaming its status is spent, and a failure halfway through the log would
  reach the browser as a truncated PDF under the report's own filename. The cap
  at `REPORT_MAX_INCIDENTS` is what makes buffering affordable.
- **The pattern analysis is counted unless `?analysis=ai` asks otherwise.** A
  file download is the worst possible trigger for a paid call — a browser
  re-requests one on a refresh, a retry, a preview pane and a "save link as" —
  so the default costs nothing and the button sends the flag only once the
  coordinator has already generated an analysis on screen. It is written by the
  route rather than posted in by the browser, which means the wording can differ
  from the paragraph on the page; the line under the buttons says so, and "Copy
  report" is the answer for anyone who wants the exact sentences they are
  looking at — it is built in the browser from the state holding them. A
  refused rate limit or an unreachable model falls back to `countedNarrative`
  rather than failing the download, and `source` on the document says which of
  the two a reader is holding.
- **It writes `incident.report_generated`**, the same action the narrative
  button writes, with `format: "pdf"` to tell them apart. Before the response
  and still able to fail the request, for the CSV export's reason: nothing has
  left the building yet, and a village's reports assembled into a document for
  the police with no trail behind it is worse than a download that did not work.
- **`LOG_COLUMNS` and the `print:w-` utilities in `report-view.tsx` are the same
  six percentages** and have to stay that way, or one report comes out in two
  shapes. They cannot be imported — Tailwind needs the class as a literal. Two
  of them were widened when the PDF's own metrics proved the web view's were too
  tight: a reference is sixteen Courier characters and had 53pt of column, so
  every row printed its reference over the top of the category beside it.
  Nothing here wraps a run with no space in it, so a column that has to hold one
  has to be wide enough for it.
- **`Font.registerHyphenationCallback` turns hyphenation off.** The library's
  default splits on syllables, which in a 12% column gives "Antisocial be- /
  haviour" — a hyphen inside a category label reads as a different category to
  somebody skimming a log — and it declines to split `VW-HIS-2026-0003`, which
  is the only string that needed splitting. The callback returns each word whole
  and chops only runs longer than `MAX_UNBROKEN`, which is what a resident's
  free-text landmark can turn out to be.
- **There are no page numbers, and that is the library rather than an
  oversight.** A page carrying both a dynamic node (`render={({ pageNumber }) =>
  …}`) and an absolutely positioned `fixed` one corrupts its own layout past
  about eight pages — `splitPage` re-runs a full relayout per split and PDFKit
  throws on a transform of -2.9e+22. Either feature works alone. The
  every-page disclaimer is the one a recipient is entitled to, so the numbers
  went. `tests/report-pdf.test.ts` renders a 200-row log, which is what makes
  this a test failure rather than a rediscovery: the broken shape is the obvious
  one, it is what the library's own examples show, and it works on every report
  short enough to try by hand.
- **`serverExternalPackages` in `next.config.ts` is required, not tidiness.**
  `@react-pdf/renderer` carries a fork of PDFKit that reads its built-in font
  metrics from binary blobs through Node's own module resolution; bundled, it
  builds cleanly and throws on the first render, in production only.
- `?days=<n>` is a third way into `resolveReportRange`, for a link with no form
  behind it to carry three fields. It wins over `range`, clamps to
  `REPORT_MAX_RANGE_DAYS` and says so in `notice`.

## The village invite

`src/lib/invite.ts` builds the link, `src/components/qr-invite.tsx` draws it,
`InviteShare` on `/dashboard` hands it to the coordinator, and two public pages
— `/join/[slug]` and `/invite/[slug]` — are where it lands. This is the other
half of village activation: `activateVillage()` mints a join code, and until now
nothing shared it.

- **One builder, four surfaces.** `buildJoinUrl` produces
  `https://villagewatch.app/join/<slug>?code=<CODE>`, and the QR, the clipboard,
  the WhatsApp message and the printed sheet all call it. A link assembled at
  four call sites is a link that will one day point four different ways — the
  same reasoning `formatIncidentAlert` is built on, and `invite.ts` keeps the
  same client-safe import budget so the browser can call it too.
- **The join code travels in the URL, and the public pages never read it from
  the database.** `findVillageBySlug` does not select the column. A page that
  looked the code up by slug would hand a village's credential to anybody who
  could guess a parish name, and the slugs are `name-county` — guessing is the
  easy case. Someone opening `/invite/<slug>` with no `?code=` gets the village's
  name and a sentence explaining what is missing. Both pages are `noindex` for
  the same reason: a crawled invite would put the code in an index nobody can
  rotate.
- **`readJoinCodeParam` narrows before anything renders it.** The value goes
  into a QR that somebody then prints a hundred of, so anything not code-shaped
  becomes null rather than reaching the encoder.
- **The dashboard shows the code, and `/admin/villages` deliberately does not.**
  That is not an inconsistency. The admin page browses 10,670 parishes it has
  nothing to do with and selects `joinCode` only to test whether one exists; this
  is a coordinator looking at their own village, from their own session (domain
  rule 4), at the thing they are there to hand out. The flyer is the exposure,
  not the panel, and `regenerateJoinCode()` is the answer when one ends up
  somewhere it should not.
- **`/register` pre-fills from the link and trusts none of it.** The village id
  is honoured only if it is one of the villages already on that screen, the code
  is normalised and shown in the field rather than posted invisibly, and
  `POST /api/auth/register` still puts both through `checkVillageJoin` — so a
  hand-edited URL buys nothing (domain rule 5).
- **`normalizeJoinCode` lives in `src/lib/validations.ts`.** It cannot live
  beside the join check: `villages.ts` imports `node:crypto` and Prisma, so a
  Client Component reaching for it breaks the build. Both sides of the
  comparison in `checkVillageJoin` and the invite link built in the browser
  share the one copy, which is what makes a scanned QR and a code typed off a
  newsletter compare equal.
- **`/join/[slug]` exists rather than sending a scan straight to `/register`.** A
  QR code is not readable by a human, so this is the first chance anybody has had
  to see which village they are about to join — and a village that is not
  `ACTIVE` can say so here instead of after four filled-in fields.
- The printed sheet is `[data-print-region]` against the rules `/reports`
  already added to `globals.css`. Those rules are page-global, so this claims
  Ctrl+P on whatever page it renders on — intended, since the sheet is the only
  thing on either page anybody wants on paper, and worth knowing before a second
  print region joins it.

## The heatmap

`src/lib/heatmap.ts` decides the intensities, `src/components/map/heatmap-layer.tsx`
draws them, and two screens show them: `/map` behind a Pins / Heatmap / Both
toggle, and `/dashboard` as a thumbnail beside the hotspot list.

- **Intensity is severity weight × recency decay**, both in 0..1, so a single
  point never exceeds the layer's `max` of 1. That is what makes the top of the
  gradient mean *accumulation* rather than "one serious report": a handful of
  recent moderate reports on the same corner reach red, which is the property a
  coordinator is looking for. `tests/heatmap.test.ts` pins the ceiling down,
  because a scale that could exceed it would paint every pin red and look like a
  working heatmap in a screenshot.
- **The decay is piecewise linear through the anchors it was specified with** —
  today 1.0, 7 days 0.7, 30 days 0.3 — and floors at 0.1 rather than zero. "All
  time" has to keep meaning all time; a weight of zero would quietly turn the
  range toggle into a filter that does nothing past a month. The boundary test is
  strict (`days > 30`), so 30 days old is the anchor's own 0.3.
- **`leaflet.heat` is a 2014 plugin and is handled like one.** It has no module
  exports, reads `L` off the global scope, and touches `document` on load. The
  import is dynamic and inside the effect; Leaflet's own dist sets `window.L`
  unconditionally (its comment: "Always export us to window global"), and being
  inside a `MapContainer` is what guarantees Leaflet loaded first — there is
  nothing to sequence by hand. `@types/leaflet.heat` augments `declare module
  "leaflet"` rather than declaring its own, which is why `L.heatLayer` types.
- **The layer is created once and fed new points.** `setLatLngs` redraws in
  place; recreating it per render would flash the canvas and drop the plugin's
  own pan and zoom listeners.
- **The heat reads the date-filtered set the pins read.** A density map of "all
  time" beside a pin set of "last 7 days" would be two different claims about the
  same village.
- **Pins are the default and the choice is remembered per device**, in
  localStorage through `useSyncExternalStore` — the same store shape as the
  onboarding tour and for the same reasons: localStorage cannot be read during
  render, the server snapshot is the existing behaviour, and a resident who
  chose the heatmap last week does not watch the pins flash first.
- **The legend follows the layers.** A severity key beside a map with no pins
  explains nothing, and a heat scale beside a map with no heat invites somebody
  to read pin colours as density.
- **`HEATMAP_LEGEND_CSS` sorts its stops, and that is a real bug it fixes.**
  `1.0` is an integer-like key, so JavaScript enumerates it *first* —
  `Object.keys` on the gradient returns `["1", "0.3", "0.5", "0.7"]`. Canvas does
  not care, because `addColorStop` sorts by offset; CSS clamps a stop up to the
  one before it, so the unsorted legend rendered as a solid red bar under a map
  whose whole point is that red is rare. Asserted.
- **Every coordinate feeding it was jittered by `LOCATION_FUZZ_METERS`** on the
  way in (domain rule 2). At `radius: 50` the blob is comfortably wider than the
  fuzz, so the heat says "around here" — which is all the underlying data
  supports. It is not a pattern detector; `ai/detect-patterns.ts` is, against the
  database, with `ST_DWithin`.
- **The dashboard thumbnail is heat only and not interactive.** The hotspot list
  beside it counts `locationText`, the landmark residents typed, which is the
  right unit for a police report and a poor one for geography — "Mill Lane" and
  "the bus stop on Mill Lane" are two rows and one place, and a report filed
  without a landmark is in neither. The map is the same period read off the
  coordinates, so the two cover each other's blind spots. `interactive={false}`
  drops dragging and both zooms, so scrolling the page past a 200px map does not
  zoom it.

## The village directory

`prisma/seed-villages.ts`, fed by `scripts/download-ons-places.ts`. Builds the
empty directory a resident picks their village out of, from the ONS Index of
Place Names. Distinct from `prisma/seed.ts`, which builds one village with
sample incidents in it; neither needs the other.

- **The IPN's `descnm` is a code, not a word.** There is no "Village" or
  "Hamlet" value to filter on and has not been since the 2021 release. The
  layers are `PAR` (civil parish), `COM` (Welsh community) and `LOC` (locality),
  plus a dozen administrative geographies — wards, districts, unitary
  authorities, built-up areas — which are never seeded.
- **The default is the parish layer**, `PAR` + `COM`: 10,670 in England, 878 in
  Wales. That is the unit a watch scheme organises around — a parish council, a
  clerk, a boundary everyone agrees on. `LOC` is 61,000 rows and mostly
  farmsteads and field names; `--include-localities` opts into it.
- **Dedupe on the ONS code, never the name.** A place straddling a boundary
  appears once per geography (`splitind = 1`), so the 298 parishes tagged
  Cambridgeshire arrive as 358 rows. The key is `par23cd` for a parish and
  `placeid` for a locality — and it has to be layer-dependent, because a
  locality row also carries the `par23cd` of the parish it sits in, which would
  collapse every hamlet in a parish into one village.
- Split members collapse to their **medoid**, not their mean. The widest split
  in the file spans 82km and its mean is in neither half.
- **`--county` filters after the collapse, not before**, and the ordering is
  load-bearing. 747 English parishes have rows in more than one lieutenancy
  county; filtering rows first would give each one a different county — and so a
  different slug — depending on what you asked for, and seeding Cambridgeshire
  and then England would list Barnack twice, once per county. Collapsing first
  lets the medoid decide, so a parish has one county however it is selected.
  Cambridgeshire ends up with 270 of its 298 for that reason.
- **Slugs are `name-county`**, with the district added for the 44 English
  name/county pairs that collide (`aislaby-whitby-north-yorkshire`) and a
  counter behind that. Uniqueness is enforced against a set as they are built,
  so the column's `@unique` is never what discovers a clash.
- **Everything lands `PENDING` with no join code.** `PENDING` already renders as
  "Pending approval" in `VILLAGE_STATUS_LABELS` and already means "exists, not
  yet live" — there is deliberately no second `PENDING_APPROVAL` value, which
  would leave two dormant statuses with nothing to tell them apart.
- **Re-running refreshes but never clobbers.** New slugs are inserted; a village
  still at `PENDING` has its ONS-derived fields updated if the next release
  moved or renamed it; anything past `PENDING` is skipped entirely, so a
  coordinator's adjusted map centre survives the annual refresh. `createMany` +
  a targeted update rather than a blind upsert, for that reason and because
  10,670 upserts is 10,670 round trips.
- `Village.country` is `Char(2)`, so every IPN country is `GB`. Which one a
  village is actually in survives in `description` and `region`.
- **The encoding is sniffed, not assumed.** ONS ships the CSV as Windows-1252
  and `download:ons` transcodes it, so both are in circulation — and a
  hand-unzipped copy is the untranscoded one. Guessing wrong turns
  `A' Chrìon Làraich` into mojibake and the village becomes unfindable by the
  people who live in it.
- **Attribution is a licence condition.** The IPN is OGL v3.0, which asks for an
  acknowledgement wherever the data is shown. `ONS_ATTRIBUTION` in
  `src/lib/constants.ts` holds it, and `VillageAttribution` in
  `src/components/auth/village-picker.tsx` renders it under the picker on both
  `/register` and `/welcome` — the only two screens a resident sees the
  directory through. Any further surface that lists villages needs it too.
- `data/ons-places.csv` is gitignored; `data/cambridgeshire-villages.json` is
  not. The snapshot is the same pipeline's output, committed, so the directory
  can be seeded with no network at all.

## The weekly digest

`GET|POST /api/digest`, wired to Sunday 09:00 UTC in `vercel.json`. This is what
finally creates `PatternAlert` rows.

- **`CRON_SECRET` is required and compared in constant time.** With none set the
  route refuses everything — it spends Anthropic credit and pushes to
  coordinators, so it fails closed.
- Published incidents only, one Claude call per active village, and one village
  failing does not stop the sweep.
- **It survives Claude being unavailable**: no key or a rate limit produces a
  counted summary (`detector: "weekly-count"`, `confidence: 0`) instead of
  nothing. Inventing prose to fill the gap would make an outage look like a
  working digest.
- The digest pushes to coordinators only, ignoring `notifyPush` and radius — it
  is a working document for moderators, not a broadcast.

## Coordinator access requests

`src/lib/coordinator-requests.ts`. A resident applies from `/settings`, a
**platform** administrator decides at `/admin/coordinators`, and an approval is
what writes `role: "COORDINATOR"`. The rules live in the module rather than at
the two call sites — the API route and the admin page's server action both go
through it.

**It is not the only place a role is raised, and this file used to say it was.**
`appointCoordinator` in `src/lib/villages.ts` is the other, and it has to exist:
an application comes *from* a resident of a village, so the first coordinator of
a cold village has nobody to be. The two share their rules by convention rather
than by code — `isPlatformAdmin` on the way in, `canApplyForCoordinator` so
nobody who has since become a `MODERATOR` is demoted by a promotion, and
`verifiedAt` filled only when it is empty. A change to either is a change to
check against the other, and a third would be one too many.

- **An administrator is an email address, not a role.** `ADMIN_EMAILS` is a
  comma-separated server-only variable; `isPlatformAdmin()` in `src/lib/auth.ts`
  tests the address on the revalidated JWT against it, case-insensitively. That
  is the whole gate. `UserRole.ADMIN` stays in the schema because
  `vw_is_admin()` in the RLS policies is defined against it, and **no longer
  opens `/admin`** — the two definitions are currently two, which matters only
  if the runtime ever moves onto a request-scoped role. The reason for the
  change is the bootstrap: nothing in the app ever set that role, so the first
  administrator was an `UPDATE` typed into a SQL console.
- **It fails closed.** No `ADMIN_EMAILS`, nobody is an administrator, and
  `/admin/coordinators` refuses everyone. Applications are still accepted and
  `submitCoordinatorRequest` logs a warning each time it finds nobody to tell,
  because an unreviewable queue looks exactly like an empty one.
- `AppShell` is a Client Component and cannot read the variable, so
  `(app)/layout.tsx` computes `isAdmin` and passes it in. The push audience in
  `notifyAdminsOfCoordinatorRequest` is resolved from the same list rather than
  from `role`, so the people alerted are the people who can act.
- **The reviewer is platform-wide, and it is the one thing in the app that is.**
  Every other authenticated surface renders one village (domain rule 4). This
  one cannot: `seed-villages.ts` seeds 10,670 parishes with nobody in them, so a
  village-scoped reviewer would mean an application could only be approved by
  somebody who already holds the access being applied for. Fine for the first
  village, impossible for the second. `requireAdmin()` guards it; the RLS
  section says the same thing and names the consequence (an admin can read a
  cross-village application but not, through PostgREST, the applicant's `users`
  row — `users_select_admin` is still village-scoped).
- **`CoordinatorRequest.role` is not a `UserRole`.** It is the standing the
  applicant claims — "Parish councillor", "Neighbourhood Watch coordinator" —
  free text in the column, constrained to `COORDINATOR_APPLICANT_ROLES` by Zod,
  and it grants nothing. The role that is granted is a constant written by
  server code on approval (domain rule 5).
- **Both resident roles can apply**, not `RESIDENT` alone. A
  `VERIFIED_RESIDENT` is somebody a coordinator has already confirmed lives in
  the village, which makes them the strongest candidate rather than one to lock
  out. `canApplyForCoordinator()` is the test; the roles that cannot apply are
  the ones in `COORDINATOR_ROLES`, which already have the access.
- **Approving also fills `verifiedAt`** when it is empty, with the approving
  admin as `verifiedById`. Approving somebody to coordinate a village answers
  the question that column records. An existing verification is left alone.
- **A rejection requires a note.** `coordinatorRequestDecisionSchema` enforces
  it, because the rejection notification quotes it back to the applicant —
  "declined" with nothing after it tells a volunteer nothing about whether to
  ask again. Reapplying is supported and `/coordinator-apply` shows the previous
  note above the form.
- **One pending application per resident**, enforced by a read-then-create
  rather than a partial unique index: Prisma cannot express one, so it would be
  a second database object the migrate engine offers to drop on every diff (the
  problem the PostGIS GiST indexes already cause). The race that leaves open
  costs an administrator one extra click.
- Three audit actions — `coordinator_request.created`, `.approved`,
  `.rejected`, the middle one toned `sensitive` alongside reading raw text.
  The applicant's `reason` is deliberately **not** in the trail: every
  coordinator in the village can read `/dashboard/audit`, and that answer was
  written for the reviewer.
- Push goes to admins on a new application and to the applicant on a decision.
  `notifyAdminsOfCoordinatorRequest` is the only dispatch in
  `notifications.ts` whose audience is not a village.
- `src/lib/email/coordinator-decision.ts` renders the same decision as an email.
  Nothing sends it — there is still no transport — so push is what actually
  runs.
- The administrator still needs a `User` row to receive the **push**: the
  audience is resolved by looking their email up in the database. The gate
  itself does not — somebody in `ADMIN_EMAILS` who has never joined a village
  can open the queue and decide, they just will not be notified about it.

## Reading `rawDescription`

There is exactly one path: `readRawDescription()` in `src/lib/moderation.ts`,
which writes the `incident.raw_viewed` audit row **before** returning the text
(domain rule 1). It is reached from the "Show the reporter's original wording"
button in the moderation queue.

The CSV export deliberately does **not** use it. A coordinator may read one
report's verbatim words with a trail behind each read; a spreadsheet gets
emailed and forwarded, and a name in it is not recallable. `/api/dashboard/export`
carries the anonymised column only.

## The CSV export

`GET /api/dashboard/export` holds the request — the gate, the query and the
audit row. `src/lib/incident-csv.ts` holds the formatting, and is what
`tests/incident-csv.test.ts` asserts against.

- **The split is what made it testable.** Everything with a rule in it used to
  live inside the route, so reaching it needed a session and a database, and
  nothing anywhere asserted what a correct export looks like. The builder is now
  pure: no Prisma, no secret, and `ExportIncident` has no field for
  `rawDescription`, `lat` or `lng` — the structural guard `AlertIncident` and
  `ReportIncident` use, here in its sharpest form.
- **Quoting is not formula protection.** Excel strips the surrounding quotes
  while parsing and *then* evaluates, so `"=1+1"` is a formula. The leading
  apostrophe is what makes it text, and both are applied.
- **The guard had two holes and both are now tested.** Leading whitespace
  laundered the trigger — Excel discards it, so `" =1+1"` arrived as `=1+1` and
  evaluated straight past a regex anchored at the trigger character, which is
  the first thing anybody tries. And `\n` was not treated as a start character
  though `\t` and `\r` were, for no reason. `isFormulaBait` covers both, and the
  test asserts the ordinary-prose cases too: a guard that fired on `3 - 4 people`
  or `email@example.test` would put a stray apostrophe in front of half the file.
- **Every exit from the route is JSON, and that is what fixed the button.** The
  dashboard reached it with a bare `<a href download>`, which saves whatever
  arrives under the export's name — a 401, a 403, a 503 or an unhandled 500 all
  became a file called `export` full of JSON or HTML, sitting in Downloads
  looking like a corrupt spreadsheet with nothing on screen to say why.
  `ExportCsvButton` fetches, checks the status, and raises the route's own
  `error` string as a toast; only a 200 becomes a download. The `try/catch` in
  the route is what guarantees there is an `error` string to raise rather than
  Next's HTML error page.
- **The audit row is written before the response and is still allowed to fail
  the request.** Everywhere else an audit write that follows a completed act is
  swallowed, because telling somebody their action failed when it succeeded
  would be false. This one precedes the act: nothing has left the building yet,
  and a bulk read of a village's reports that no trail records is the one
  outcome worse than a download that did not work.

## The incident reference

`VW-HIS-2026-0003` — VillageWatch, Histon, 2026, the third report Histon filed
that year. `src/lib/incident-reference.ts` is the one place the string is built,
`POST /api/incidents` allocates the number, and `Incident.reference` stores the
result.

- **The number is the village's own, and that is the whole change.** It was a
  single platform-wide sequence (`VW-2026-0184`), so the first report a new
  parish ever filed was numbered by how busy every other parish had been — a
  number a coordinator cannot explain to a resident, and one that tells anybody
  holding two references from different villages how large the deployment is.
  `villageIncidentNumber` and `referenceYear` are the columns behind it, and the
  sequence restarts on 1 January.
- **`reference` is no longer `@unique`, and it cannot be.** The village code is
  the first three letters of the name, which does not separate 10,670 parishes
  — every "Great …" derives `GRE`. A global unique index would mean the second
  `GRE` village to file its third report of the year could not file it at all:
  the number it computed for itself is spoken for, and the retry computes the
  same number again. What replaced it is
  `@@unique([villageId, referenceYear, villageIncidentNumber])`, which is the
  constraint that was always meant — references are unique *per village*,
  because the village is the tenant boundary (domain rule 4).
- **`Village.villageCode` is the answer to a collision that matters**, set by
  hand and null everywhere. Nothing breaks without it; what it buys is a police
  officer covering two `GRE` parishes being able to tell their references apart.
  Changing it changes nothing already issued — stored strings stay as they are,
  which is the point of storing them.
- **The string is stored, not derived on read.** It is what the audit trail
  holds, what a police summary prints and what a resident reads out on the
  phone, and deriving it at render time would mean threading a village name
  through every card, popup, CSV row and email — where the one surface that
  forgot would print a different reference for the same report. So
  `formatIncidentReference` is called once, when the row is created, and the
  eight surfaces that show a reference render the column. It falls back to the
  stored string for a row with no number, which is what makes it safe to call
  from a read path.
- **`MAX(villageIncidentNumber) + 1` races, and the constraint is what catches
  it.** Two requests read the same maximum; the loser gets a P2002 and the
  create loop — which already existed for the old scheme — allocates again
  against a moved maximum. Deliberately not a lock or an interactive
  transaction: both would serialise every report filed in a village behind one
  connection, through pgBouncer in transaction mode, to buy an ordering the
  unique key already guarantees.
- **`referenceYear` comes from `reportedAt`, never `occurredAt`.** The sequence
  is a filing order. A report made on 2 January about New Year's Eve belongs to
  this year's numbering, or a village's log has gaps in it that only make sense
  to whoever remembers what happened last December.
- **The backfill in `20260803120000_incident_village_numbering` renumbers what
  is already there**, and writes the derivation a second time in SQL. Rows could
  have been left alone — Postgres treats NULLs as distinct in a unique index, so
  they would not have blocked anything — but two schemes in one column is a
  coordinator with no way to know which reports are numbered against what. The
  `[^A-Za-z]` class and the `VIL` fallback in that file are
  `villageReferenceCode`'s rules; keep the two in step, or a rebuilt reference
  stops agreeing with a stored one.

## The version on screen

`APP_VERSION` and `VERSION_LABEL` in `src/lib/constants.ts`, filled from
`package.json` by `next.config.ts` at build time. Three surfaces render it: the
app sidebar under Sign out, the foot of `/settings` with the product name in
front of it, and the public footer beside the copyright line.

- **It is read in `next.config.ts` rather than imported where it is rendered.**
  `package.json` carries the whole dependency list; importing it from
  `constants.ts` would ship every package and pinned version this deployment
  runs to every browser. One string in `env` is inlined into both bundles
  instead.
- **`NEXT_PUBLIC_APP_VERSION` wins where it is set**, which is the escape hatch
  for a preview that wants to label itself a commit SHA. Inlined at build time,
  so changing it needs a redeploy.
- **Empty renders nothing.** A build with no version says nothing rather than
  inventing a number, and each of the three surfaces tests the label first.
- **Production sits one patch behind `main`, and that is not a failed deploy.**
  `version.yml` bumps the version *after* a release lands, in a commit carrying
  `[skip ci]` — which is what stops Vercel spending a production deploy on a
  version bump. So the number on screen is the version of the commit the build
  came from, and `package.json` on `main` is a patch ahead until the next real
  change deploys.

## The period

`src/lib/date-range.ts` resolves it, `TIME_RANGES` in `src/lib/constants.ts` is
the one list of them, and three screens read it: `/map`, `/incidents` and
`/dashboard`.

- **One resolver, three surfaces, and it is client-safe** — same import budget
  as `format-alert.ts` and `community-report.ts`: `constants.ts`,
  `validations.ts`, nothing that touches Prisma or a secret. That is what lets
  the map filter in the browser, over incidents the server already sent, while
  the other two resolve the same query string into the same SQL. A custom range
  cannot mean one thing on the map and another in the list beside it.
- **The map filters in the browser and the list does not, and that is not an
  inconsistency.** The map already holds every pin it draws. The list is capped
  at `INCIDENT_PAGE_SIZE`, so a client-side filter would narrow *the most recent
  thirty* rather than find the thirty most recent **in the period** — a June
  filter on a busy July would show nothing and look like a quiet June.
- **Each surface picks a subset, and a preset outside it is ignored rather than
  honoured.** `BROWSE_RANGE_VALUES` for the map and the list,
  `DASHBOARD_RANGE_VALUES` for the dashboard. Honouring `range=90` on a screen
  with no 90-day control would leave "Last 30 days" highlighted over ninety days
  of data, which is a screen lying about what is on it.
- **`all` is absent from the dashboard on purpose.** Every stat card is a
  comparison against the preceding period of equal length, and there is no
  period preceding all time. `previousPeriod` returns null rather than assuming
  the caller checked.
- **Unbounded means the key is absent, not undefined.** `timeRangeFilter` is
  spread into a Prisma `where`, and for `all` it contributes no `occurredAt` at
  all. `{ gte: undefined }` works today and is one Prisma release from meaning
  something. Asserted.
- **Nothing rejects.** Junk in the query string, half a custom range, dates the
  wrong way round, an end date in the future, a span past
  `MAX_CUSTOM_RANGE_DAYS` — every one produces a period, and `notice` is how the
  adjustment is admitted rather than applied silently. This runs on a page
  render; a throw here is an error page in front of somebody looking at a map.
- **The two server forms use submit buttons rather than a `<select>`**, because
  a submit button carries its own `name`/`value` and the map's control is a row
  of pills. `TimeRangeFields` renders **inside the caller's form**, which is what
  lets a change of period on `/incidents` carry the type and severity selects
  through the same submission. The list's own Apply button carries
  `name="range"` with the resolved preset for the mirror-image reason: every
  other control in that form is named `range`, so a bare Apply would send none
  and drop the reader back to the default month while they were filtering by
  type.
- **The first submit button in each form is a hidden `range=custom`.** A browser
  presses the first one on Enter, and somebody typing in a date field and
  pressing Enter means "use these dates" — without it they would get whichever
  preset happened to be leftmost, discarding what they just typed.
- **The dashboard's second stat card changed rather than gaining a window.**
  "This week" and "this month" were two fixed windows because there was no
  control; with one, a second window on the same number says nothing. It counts
  `HIGH` and `CRITICAL` over the selected period instead — a constant, not a
  `gte` on the enum, because Prisma orders enum members by schema position and a
  comparison would silently change meaning the day somebody inserted a level in
  the middle of `Severity`.
- **The boundaries are the server's midnight, not London's**, the same departure
  `resolveReportRange` documents and for the same reason. The resolvers stay
  separate — the periods `/reports` offers are not the periods a resident
  browsing a map wants — but `dateInputValue` is shared, so the string a date
  input renders cannot drift between them.
- **`dateInputValue` formats in the host zone, and that is a fix rather than a
  detail.** It is the exact inverse of `new Date("yyyy-mm-ddT00:00:00")`, which
  is how a submitted date is parsed. Formatting in `Europe/London` instead is a
  round trip that does not close: on a UTC host — every Vercel lambda —
  `2026-07-07T23:59:59.999` is `2026-07-08T00:59` British Summer Time, so the
  "To" field came back a day later than the one picked and walked forward again
  on every submission. **`/reports` had the same latent bug and shares the fix.**
  It passed on a British laptop and failed in CI, which is the shape of bug the
  suite exists for; `tests/date-range.test.ts` pins both the single round trip
  and three passes of the form feeding its own output back in. A display zone is
  right for text a person reads — `customLabel` uses London — and wrong for a
  value that gets parsed back.

## SEO

- **`robots.ts` and `sitemap.ts` are file conventions, not files in `public/`.**
  Both read the same `NEXT_PUBLIC_APP_URL ?? APP_ORIGIN` pair `metadataBase`
  does, so a preview deployment describes itself rather than pointing crawlers
  at production's sitemap — which is how a staging host ends up in the index.
- **`robots.txt` is not a security boundary and the file says so.** `/dashboard`
  is guarded by `requireCoordinator()` and `/api` by its own handlers; a
  disallow line is a request to well-behaved crawlers. The list is deliberately
  **not** `PROTECTED_ROUTES` — that constant answers a different question and
  omits `/api`, `/join` and `/invite`, the last two of which carry a join code
  in the query string.
- **The invite pages are excluded three times over** — `noindex` in their own
  metadata, disallowed in `robots.txt`, and absent from the sitemap. A crawled
  join code cannot be rotated out of a search cache.
- **The sitemap is a hand-written list of five pages**, because every other
  route is one village's data behind a session (domain rule 4). The village
  directory is 10,670 parishes with nobody in them; listing those would put ten
  thousand empty pages in front of a crawler. `lastModified` is
  `LEGAL_LAST_UPDATED` on the two legal pages — the same date the document
  prints — and **absent** elsewhere rather than `new Date()`, which would claim
  every page changed on every build and make the output nondeterministic between
  two builds of the same commit.
- **Canonicals are per page and never on the root layout.** Metadata is
  inherited in Next, so a canonical of `/` on the layout would tell a crawler
  that `/privacy` and `/terms` are duplicates of the home page and drop both.
  This is the one SEO mistake in this codebase that would have looked correct in
  a diff.
- **`opengraph-image.tsx` renders from the same constants and the same shield as
  the app**, so a change to `APP_TAGLINE` cannot leave a stale picture behind
  saying the old one. `twitter-image.tsx` re-exports it — Next fills `og:image`
  from the first convention and `twitter:image` from the second, and without the
  second file the `summary_large_image` card the root layout declares falls back
  to a bare text card. No `fonts` array is passed, deliberately: fetching a font
  would put a network call on the critical path of `npm run build`.
- **Satori renders a subset of CSS.** Flexbox and absolute positioning work;
  grid, floats and most shorthands do not, and every element with more than one
  child needs an explicit `display: "flex"`. It cannot see Tailwind's custom
  properties either, so the brand colours are written out as hex and the two are
  only checked by eye.
- **`src/lib/structured-data.ts` carries no `aggregateRating` and no `review`,**
  and no `Offer` for the Pro tier. Structured data is shown to people who never
  visit the page, so a wrong figure there is worse than one on screen — nobody
  can see the context that would correct it. Nothing has been rated, and nothing
  takes payment (see **No billing** below). The free tier is matched on the
  string `"Free"` because `PricingTier.price` is rendered text, not a number; if
  it is ever renamed the `Offer` is omitted, which is the right way to be wrong.
- **The landing page's JSON-LD is the only `dangerouslySetInnerHTML` in the
  app.** A `<script type="application/ld+json">` has to receive a raw string.
  Nothing user-supplied reaches it, and `serialiseJsonLd` escapes `<` anyway so
  a `</script>` inside a value could never break out of the block — cheaper to
  be right now than on the day somebody interpolates a village name into it.
- **`OPERATOR` is Yakasista Ltd and is not `DATA_CONTROLLER`.** The company
  running the service is the **processor**; the council is the controller. The
  `Organization` node names the operator, which is who publishes the site and
  takes support mail — deliberately not who a subject access request goes to.

## Not built yet

Days 1–7 delivered the scaffold, schema, landing page, the on-device blur and
upload, the report wizard, the Claude structuring pass, the map, the incident
list and detail pages, push notifications, the coordinator dashboard and
moderation queue, CSV export, the weekly digest cron, settings, the RLS
policies, rate limiting, the legal pages, home-location capture, the audit
viewer, security headers, the error pages, the retention cron, the seed script,
`SETUP.md`, auto-versioning, PWA install and offline support, the email
templates, the onboarding tour and the ONS village directory pipeline. Still
open:

- The Supabase project exists (eu-west-2) and **ten of the twelve migrations
  are applied**, with `postgis.sql` and `rls_policies.sql` re-run after them.
  The eleventh and twelfth are
  `20260820100000_archive_deletes_raw_description` and
  `20260820120000_village_community_mode`, which are new
  and have not been through `database.yml` yet. The first drops a NOT NULL and
  clears the wording of reports already archived, which is nothing on this
  deployment because no report has ever reached twelve months; the second adds
  `mode` and the community acceptance, defaulting every village to the community
  model. This
  entry said "1–5 of the nine" until 3 August 2026 and was stale: the run that
  applied `20260803120000_incident_village_numbering` reported every other
  migration already present and finished `Database schema is up to date!`, so 6
  to 9 had gone in at some point without this file being told. **Read the
  workflow's log rather than this paragraph** before planning around what is
  applied — that is the record, and this is a note about it.
  The `incident-media` bucket exists, private. **The app is deployed** — Vercel,
  `lhr1`, serving `villagewatch.app`, and `main` auto-deploys on every push. Two
  earlier entries in this section said there had been no production deployment;
  they were written before there was one and were never corrected, which is how
  a file ends up contradicting itself twice in the same list. What has **not**
  happened is that **no cron has ever fired** — neither the weekly digest nor the
  nightly retention sweep.
- **Applying migrations 7 and 9 closes every village's reporting** until a
  coordinator has been through `/dashboard/compliance`. That is the gate working
  as designed — see The compliance gate — but they are the only migrations in
  this repository whose application is a visible change to what residents can
  do, so do not run them without telling whoever coordinates the village. Run
  them together: 9 alone re-closes a village that had already accepted the first
  two documents. Both are applied, so the gate is live: a village that has not
  been through that screen is refusing reports right now.
- **Migrations are applied by `.github/workflows/database.yml`**, on a push to
  main touching `prisma/**` or from the Run workflow button: `migrate deploy`,
  then `postgis.sql`, then `rls_policies.sql`, in that order. It is not in the
  Vercel build command because Vercel builds every preview and there is no
  staging project, and because `migrate deploy` alone would leave a new table
  with RLS off — the header of that file has the full reasoning. With no
  `DIRECT_URL` secret the `migrate` job is skipped rather than failed, so a fork
  or a fresh clone goes green. **It has now applied one for real** —
  `20260803120000_incident_village_numbering`, on 3 August 2026, followed by
  both SQL files in order. Everything before that was applied by hand and the
  workflow had only ever run as a no-op.
  A note kept for whoever writes the next hand-written migration: the erasure
  one carries
  `ALTER TYPE "incident_status" ADD VALUE 'REMOVED'`, which is only safe inside
  Prisma's migration transaction because nothing else in that file uses the new
  value — a statement in the same transaction that referenced it would fail with
  "unsafe use of new value of enum type". Keep it that way if you edit the file.
  The RLS file also gained `deleted_at` in `users_guard_privilege_columns`;
  until it is re-run, a closed account could null its own column through PostgREST
  and sign back in.
- **Only Cambridgeshire is seeded.** The 270 parishes from
  `data/cambridgeshire-villages.json` are in the real database as `PENDING`,
  seeded from the committed snapshot rather than the CSV (`--file`, because
  `data/ons-places.csv` is gitignored and not downloaded). Re-running reported
  `unchanged 270`, so idempotency is now confirmed against the real schema and
  not only the throwaway Postgres the pipeline was first built against. England's
  other 10,400 parishes are **not** seeded. `Village.boundary` is null on all 271
  rows, which is correct — it is a hand-drawn polygon with a GiST index and no
  trigger, unlike the geography columns on `Incident` and `PatternAlert`.
- **The picker searches, but the `ACTIVE` filter still decides.**
  `src/components/auth/village-picker.tsx` replaced the `<select>` on
  `/register` and `/welcome`: a type-to-search combobox, folding case and
  diacritics so `Chrion` finds `A' Chrìon Làraich`, capped at `MAX_VISIBLE`
  rendered rows. Both pages still query `status: "ACTIVE"` and both auth routes
  still enforce it, so **the 270 seeded parishes do not appear in it** — the only
  selectable village is whatever `prisma/seed.ts` created. Filtering happens in
  the browser over the whole list; at a county's 270 that is free, but activating
  the national directory wholesale wants a server-side search endpoint first.
- **A directory entry can be claimed from cold, and this entry said otherwise
  long after it stopped being true.** `src/lib/villages.ts` writes
  `Village.status`: `activateVillage` mints a join code, flips the status to
  `ACTIVE` and optionally appoints the first coordinator by email, all guarded on
  the status just read and all audited; `regenerateJoinCode` rotates a code that
  has ended up somewhere it should not; `appointCoordinator` is the promotion the
  application flow structurally cannot perform, because an application comes
  *from* a resident and a cold village has none. `/admin/villages` is the screen,
  platform-admin only. That is the bootstrap this paragraph called the blocker,
  and it closed with L3 on 27 July 2026.

  **What is still true is the operational half**: nobody has run it. The 270
  seeded Cambridgeshire parishes are `PENDING`, the only `ACTIVE` village is
  `prisma/seed.ts`'s placeholder with its hardcoded `VILLAGE1` code (L7 in
  `BACKLOG.md`), and no village has ever been activated through the screen. So a
  seeded parish is still not joinable *today* — the difference is that promoting
  one is now a button rather than an `UPDATE` typed into psql, and the code it
  mints is now actually demanded at registration.
- **The retention job has never run against data.** It deletes files and takes
  reports off the map, and every line of it is untested against a real bucket.
  Watch the first run and read the counts in the response before trusting the
  schedule.
- The RLS policies are applied and have been tested with the anon key from two
  villages — 43 assertions covering cross-village reads, `raw_description`, the
  privilege-column trigger, the reporter edit window, moderation scope and
  `audit_logs` append-only. Two holes were found and closed in the process: the
  `public` schema had lost its role grants to a `prisma migrate` reset, which
  left every policy dormant; and `raw_description` and `join_code` were readable
  through PostgREST until they were put behind column grants. **Re-run the file
  after any migration that adds a table or a column** — a new table arrives with
  RLS off, and the column grants are enumerated at run time.
- **`DATA_CONTROLLER` in `src/lib/constants.ts` is placeholders.** The privacy
  policy and terms both name it. Fill it in, register with the ICO, and have
  the council review both documents before launch. A coordinator can now name
  their own council on `/dashboard`, which covers the `/reports` footers — but
  that is per village and `/privacy` still reads the constant, so this is
  narrowed rather than closed. The dashboard field needs
  `20260727180000_village_activation`, which is applied — it says so on screen
  rather than failing on Save where it is not.
- **Slack is disclosed rather than covered by its own agreement, and `/privacy`
  §6 now says so in as many words.** The blanket claim that every processor acts
  under a written data processing agreement was untrue for Slack, and a false
  sentence in a privacy notice is worse debt than a missing one. There is now a
  named entry for Slack (Salesforce) beside the processor list: administrative
  notifications only, to a private channel nobody outside the people running the
  service can read, carrying an anonymised incident summary or the fact of a
  registration, an application or an appointment — plus the resident's name, and
  their email on registration, because those two alerts exist to say who. That
  is a proportionate answer for a disclosure with no resident-facing dependency
  on it, and it is the accurate one. **The entry states what `src/lib/slack.ts`
  sends**, so it is a statement about how the code behaves in the same sense the
  other five are: change what a message carries and that paragraph changes in
  the same commit. What is still open is the paperwork rather than the notice —
  a signed agreement, or moving the alert somewhere covered by one, before the
  service grows past a single parish.
- **Two of the retention figures are still unenforced.** The nightly job
  archives at 12 months, deletes the reporter's original wording in the same
  statement, and deletes media at 6; nothing expires audit rows at 24 months
  (the append-only trigger forbids it from application code) and nothing closes
  dormant accounts. The privacy policy states all of them. The wording deletion
  was a third unenforced figure until 20 August 2026 — see Deleting the original
  wording — and it has never run against real data, like everything else in that
  job.
- The community guidelines in `/terms` §5 are the common village-watch set,
  not any particular parish's. Swap in the group's own wording if it has any.
- **The OneSignal app exists**, so `skipped: "not_configured"` is no longer the
  expected outcome of a dispatch and reading it in a log now means a missing key
  rather than a deployment that never had one. Two things still to confirm
  against it, both of which fail *silently*: the dashboard's service worker path
  must be `/onesignal/` (a 404 there reports a healthy init that never delivers
  — see PWA and the two service workers), and all three of
  `NEXT_PUBLIC_ONESIGNAL_APP_ID`, `ONESIGNAL_APP_ID` and
  `ONESIGNAL_REST_API_KEY` have to reach Vercel, not just `.env.local`. **No
  push has been delivered to a real device yet.** `notifyCoordinatorsOfPendingReport`
  is the newest dispatch and the one most likely to surprise: it now fires on
  every report filed into a queue.
- **No billing.** `PRICING` in `src/lib/constants.ts` renders a Pro tier on the
  landing page marked "Planned", and the section says in as many words that
  nothing takes payment. There is no provider, no plan column and no enforcement
  — a Pro village and a free one are the same rows in the same tables.
- **`VILLAGES_LIVE` is null**, so the landing page renders no "trusted by N
  villages" figure. Set it when somebody can point at the list, and not before:
  a made-up number there is a false statement to a parish clerk deciding whether
  to hand over their residents' reports.
- **The WhatsApp Channel is copy-and-paste, and no alert has been pasted into a
  real channel yet.** All four `Village` columns are set from `/dashboard` —
  three by the coordinator and `whatsappChannelId` derived from the invite link —
  validated by `villageChannelFormSchema`. The relay that was supposed to be the
  other end is gone, along with `WHATSAPP_CHANNEL_API_URL` and
  `WHATSAPP_CHANNEL_API_TOKEN`; the alert is now built by `formatIncidentAlert`,
  logged on publish and offered with a copy button. **Paste one into a test
  channel first and read what actually lands** — this is the one feature whose
  output an unauthenticated stranger can read, and the description in it is a
  field the old relay post never carried. Watch in particular a report where the
  AI pass did not run: `anonymized` is false, the description is the reporter's
  own wording, and the red warning on the panel is the only thing between it and
  a public feed. **The Facebook button beside it has never been pressed either.**
  Two things to look at on the first share, both of which fail quietly rather
  than loudly: whether the composer actually arrives prefilled — Facebook drops
  `quote` more often than it honours it, which is what the clipboard copy is
  there for — and what the card looks like, given the crawler scrapes a sign-in
  redirect and should fall back to the site's own OG image, itself never fetched
  by a real crawler. See The public share buttons.
- **Auto-approve has a UI, an applied migration and no village behind it.**
  Nothing has ever been filed through the published-on-submit path against a
  real database. Watch the
  first report filed with it on: check the status, the push, the audit rows and —
  if the village also has channel posting on — what actually lands in the
  channel, which is the one surface an unauthenticated stranger can read.
- **The privacy level has a column, a screen and no village behind it.**
  `20260728120000_village_privacy_level` is applied, so the dashboard renders
  the selector rather than the "not ready yet" panel and
  `getVillagePrivacyLevel` reports `available: true` — the unmigrated path is
  now only reachable on a database that is behind. Nothing has ever been
  uploaded at a level somebody chose.
  Watch the first one: attach a photo with a face in it at `light` and again at
  `heavy`, and look at the two files. The scale is meant to be visibly different
  and never to leave a face readable, and only a real photograph settles the
  second half of that.
- **The compliance gate has never been exercised against a database**, though
  both of its original migrations are applied — which means it is live and the
  seeded village is refusing reports until somebody accepts its documents.
  No acceptance has ever been recorded, in either model. Its unit tests cover the
  three states, the one-way write, all three council documents being required and
  the community model's single agreement; what they cannot cover is the 403
  actually reaching a resident, which wants the route test named below.
- **Community mode has a column, two screens, a document and no village behind
  it.** `20260820120000_village_community_mode` is new and unapplied, so nothing
  is on the community model yet and nothing has read `Village.mode` against a
  real row. Watch three things on the first village through it: that the
  migration's backfill leaves the seeded village where it should be (nothing has
  been accepted anywhere, so it should stay `community`), that a coordinator
  accepting the one agreement actually opens reporting, and — much later, and the
  one that is easiest to get wrong — that a village upgrading to the council
  model **stays open** rather than closing while the council reads three
  documents. `docs/COMMUNITY_DPA.md` has never been read by a lawyer, only
  written from the code.
- **The Article 28(3) processing agreement is drafted and signed by nobody.**
  `docs/DATA_PROCESSING_AGREEMENT.md` is the third document in the gate and is
  DPIA action A2. Unlike the other two it takes **two** signatures, so the
  screen records the council's half and says so in three places. Two things in
  it are still open on our side and are marked in the document itself: the
  transfer mechanisms for Anthropic and OneSignal are `[verify]` (DPIA A9 and
  A11), and the Slack position is a disclosure rather than an agreement (A3) —
  §6(d) states that plainly rather than claiming cover it does not have. Its
  §6(c) is a list of the security measures actually in place, in a contract:
  removing one of them is a breach, not a stale sentence.
- **The invite has never been scanned and the heatmap has never been drawn over
  real reports.** Both build, both are unit tested where there is logic to test,
  and neither has been exercised against a database — the only `ACTIVE` village is
  `prisma/seed.ts`'s placeholder with its hardcoded `VILLAGE1` code (L7 in
  BACKLOG.md), so the first real invite is still ahead. Two things to check on the
  first run of each. **Print the QR sheet before printing a hundred of them**: the
  print rules force black on transparent inside `[data-print-region]`, which an
  SVG `fill` is untouched by in theory and a browser could still surprise us over.
  And **watch a scan end to end** — camera to `/join/[slug]` to `/register` with
  the village and code filled in to a `VERIFIED_RESIDENT` row — because the last
  step is the one nothing in the suite can assert. For the heatmap, look at
  `/map` in a village with a handful of reports and check the blobs sit where the
  pins do: `leaflet.heat` reads `L` off the global scope, and the failure mode if
  that ever stops being true is a silent no-op layer rather than an error.
- **There is a test suite, and it covers eighteen modules rather than the app.**
  `npm run test` runs Vitest over `tests/`, and `.github/workflows/ci.yml` runs
  it between the typecheck and the build. See The test suite above for what is
  asserted and what is deliberately not. Nothing yet asserts that a village with
  auto-approve off still queues — that needs a route test with a database behind
  it, and it is still the regression worth having one for.
- The README's screenshots are placeholder text. Capture them after the first
  seeded deploy.
- `aiSummary` is still unused; the AI pass fills `aiModel`, `aiConfidence`,
  `peopleCount`, `recurring` and `patternNote`.
- `PatternAlert` rows are created by the digest but nothing renders them —
  acknowledge and dismiss have no UI, and the dashboard does not list them.
  (The RLS UPDATE policy for them is already in place, waiting on the screen.)
- **Email has templates but no transport.** `src/lib/email/` renders welcome,
  weekly digest, incident notification and the coordinator decision; nothing
  sends them, `notifyEmail` is absent from the settings screen, and no dispatch
  honours it. SMS has neither templates nor transport.
- Home location is captured at registration only, and it is optional. Both
  halves of registration ask for it through one shared
  `HomeLocationField` — `/register` and `/welcome` write the same two columns,
  so a promise about what happens to the pin cannot be true on one screen and
  stale on the other. The exact point tapped is sent and
  `HOME_LOCATION_FUZZ_METERS` is applied server-side by `fuzzCoordinates` in
  both routes; the field names that figure by interpolating the constant, so
  the number on screen cannot drift from the one applied. Anyone who registered
  before Day 5, or who skipped the map, still has no `homeLat`/`homeLng` and
  falls into the village-wide audience — which is the intended degradation, not
  a bug, and what the Skip copy tells a resident rather than leaving them to
  infer it. **There is still no way to set or change it afterwards**;
  `/settings` does not offer it yet, which is the half of this that is missing.
- **Storage policies are not configured.** `POST /api/incidents/media` and
  `src/lib/media/storage.ts` both use the service-role client
  (`src/lib/supabase/admin.ts`) and do their own session, village and
  path-prefix checks. Once the `incident-media` bucket has village-scoped
  policies, move both back to the request-scoped client.
- The incident list shows the most recent `INCIDENT_PAGE_SIZE` **in the selected
  period** and does not paginate; the map draws up to `MAX_MAP_INCIDENTS` pins
  with no clustering; the moderation queue shows `MODERATION_QUEUE_SIZE` with no
  paging or filter. The period control narrows what the cap applies to, which is
  why it is resolved server-side there — it does not replace pagination.
- **The period controls have never been used against a village with enough
  history to need one.** The resolver is unit tested and the three screens
  build, but no database anywhere holds reports spanning ninety days, so the
  first real use is still ahead. The one to watch is `/dashboard`: every figure
  on it now reads one selection, and a stat card silently keyed to a different
  window from the breakdown beneath it is the failure that would look correct.
- **The OG image has never been fetched by a real crawler.** It renders at build
  time and was checked by eye; what has not happened is a paste into WhatsApp,
  Slack or a search console. `robots.txt` and `sitemap.xml` have likewise never
  been read by anything. The deployment is live, so all three are actually
  served and verifying them is now a matter of pasting a link and opening two
  URLs — which is worth doing rather than assuming, since each fails silently.
- **The PDF has never been built from a real village's reports.** Its layout was
  settled against generated fixtures — every column width, the wrap in each cell
  and the page breaks — and `tests/report-pdf.test.ts` renders the empty, the
  wrapping and the 200-row cases on every push, so what is untested is the data
  rather than the renderer. Two things to look at on the first real one:
  **`locationText` and the title are resident-written**, which is where a run
  with no space in it comes from, and the hyphenation callback rather than the
  column width is what handles those; and **`?analysis=ai` has never reached
  Anthropic from this route**, so the first download with an analysis on screen
  is the first time that call is made anywhere but the `/reports` button. Neither
  can fail the download — both fall back — which is exactly why they want
  looking at rather than waiting for a bug report.
- **Erasure has never run against real data.** `removeIncident` and
  `eraseAccount` both delete files from the bucket and neither has been tried
  against one. Watch the first deletion and check the object is gone, the same
  caution the retention job carries and for the same reason.
- Closing an account leaves its Supabase `auth.users` row in place — see The
  right to erasure. The address is therefore still held by Supabase Auth after
  the profile has been scrubbed, which `/privacy` should say before launch.
- No Content-Security-Policy. It needs a per-request nonce from `src/proxy.ts`;
  the other security headers are in `next.config.ts`. Note that a CSP now has
  three script origins to account for, not two: the App Router bootstrap, the
  OneSignal CDN, and the two service workers.
- Resident verification has no UI — no way to approve a join request or promote
  someone to `VERIFIED_RESIDENT`. Approving a coordinator request is the one
  path that sets `verifiedAt` today, and it is a side effect of a different
  decision rather than the verification screen this still wants.
- The coordinator request queue does not paginate, filter or search; it shows
  the first `COORDINATOR_REQUEST_PAGE_SIZE` of each tab. Nothing renders the
  `PatternAlert`-style badge count anywhere but on that page's own tab, so an
  administrator finds out there is something waiting from the push
  notification.
- Password recovery exists but **no email has ever been sent through it**.
  Supabase's own recovery template is what arrives, and its redirect URL must be
  on the project's allow list or the link dead-ends — see The password reset.
- No staging environment. CI, unit tests and auto-versioning all exist; there is
  still nowhere to run a migration before production sees it.
- Light theme only. Add a dark palette deliberately — `prefers-color-scheme`
  would half-apply to the map and severity badges.

## Open product questions

Defaults were chosen to keep Day 1 moving. Confirm before seeding real data:

- `Village.country` defaults to `"GB"` and `Village.timezone` to
  `"Europe/London"`. The product language is British English throughout
  ("antisocial behaviour", "999"). Change all three together if the launch
  market is not the UK.
