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
| Maps       | Leaflet + react-leaflet, OpenStreetMap tiles                 |
| AI         | `@anthropic-ai/sdk`, `claude-sonnet-5` (`ANTHROPIC_MODEL`)   |
| Push       | OneSignal — `@onesignal/node-onesignal` server, v16 web SDK   |
| Toasts     | sonner                                                       |
| Hosting    | Vercel, `lhr1` (two crons in `vercel.json`)                   |
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
    layout.tsx                Root layout: fonts, metadata, Toaster
    page.tsx                  Public landing page
    not-found.tsx             Friendly 404 — also where a withdrawn report lands
    error.tsx                 Root error boundary; client, uses unstable_retry
    login/, register/         Public auth pages
    welcome/                  Village, join code and terms for a provider
                              sign-up — outside (app), or it would loop
    privacy/                  UK GDPR privacy notice
    terms/                    Terms of use + community guidelines
    (app)/                    Authenticated shell (sidebar); force-dynamic
      layout.tsx              requireSession() — the real auth boundary
      map/                    Full-screen Leaflet map, severity pins
      incidents/              List with type + severity filters (GET form)
      incidents/[id]/         Detail — media, tags, map pin; params is a Promise
      incidents/[id]/edit/    Reporter's own edit, queue statuses only
      incidents/[id]/actions.ts  Moderate / edit / withdraw server actions
      incidents/new/          Report wizard host (village lookup, server-side)
      dashboard/              Stats, breakdowns, hotspots, moderation queue
      dashboard/actions.ts    Moderate + audited raw-text reveal
      dashboard/audit/        Audit trail viewer — coordinator only, filterable
      settings/               Profile and notification preferences
      settings/actions.ts     saveSettingsAction — never touches role/village
    api/auth/                 login, logout, register route handlers
    api/auth/callback/        OAuth return leg — exchanges the code, routes on
                              whether a profile row exists
    api/auth/complete-profile/  Writes the profile for a provider sign-up
    api/incidents/            POST create report (writes AI fields + tags)
    api/incidents/process/    POST run a draft through Claude; writes nothing
    api/incidents/media/      POST blurred upload, DELETE abandoned attachment
    api/notifications/        POST re-send a published incident's alert
    api/dashboard/export/     GET village incidents as CSV (public columns only)
    api/digest/               Weekly cron — Claude summary, PatternAlert, push
    api/cron/retention/       Nightly cron — archives reports, deletes old media
  components/                 Shared UI (logo, app-shell, placeholder, auth forms)
    auth/google-button.tsx    "Continue with Google" + the or-divider, shared
    auth/welcome-form.tsx     The provider sign-up's second half
    site-footer.tsx           Public footer, incl. the legal links — shared
    legal-page.tsx            Shell + typography for /privacy and /terms
    status-screen.tsx         Shell behind not-found.tsx and error.tsx
    incident-form.tsx         5-step wizard, react-hook-form + Zod
    media-uploader.tsx        Blur-then-upload; never touches the original
    location-picker.tsx       Leaflet pin picker — dynamic import, ssr: false
    ai-preview.tsx            Review / publish screens, reprocess + edit
    incident-map.tsx          Leaflet pin layer — never import without ssr:false
    map-view.tsx              Client wrapper: dynamic import + date-range toggle
    incident-location-map.tsx Client wrapper for the detail page's single pin
    incident-card.tsx         One incident, used by preview, list and detail
    incident-actions.tsx      Detail-page actions — reporter and coordinator
    incident-edit-form.tsx    Five-field edit, no wizard, no re-anonymisation
    settings-form.tsx         Profile + notification preferences, one action
    push-registration.tsx     OneSignal init, login(userId), consent banner
    onboarding-tour.tsx       Four-step first-run tour; useSyncExternalStore
    service-worker.tsx        Registers /sw.js in production only
    dashboard/stat-card.tsx   One figure with its trend against last period
    dashboard/breakdown-bar.tsx  CSS bars — no charting dependency
    dashboard/moderation-card.tsx  Queue row; audited raw-text reveal
    severity-badge.tsx        green / amber / red / purple pill
    incident-type-icon.tsx    Enum icon name → lucide component
    no-village.tsx            Shown wherever a resident has no village yet
  lib/
    prisma.ts                 Singleton + pg driver adapter
    auth.ts                   getSession / requireSession / requireRole
    moderation.ts             applyModeration + audited readRawDescription
    notifications.ts          OneSignal dispatch, audience rules — server only
    cron.ts                   Constant-time CRON_SECRET check, shared by both jobs
    email/                    Templates only — no transport. layout, welcome,
                              weekly-digest, incident-notification
    ai/weekly-digest.ts       Claude weekly summary, structured, typed failures
    geo.ts                    fuzzCoordinates — server only, uses node:crypto
    rate-limit.ts             In-memory fixed-window limiter — server only
    format.ts                 Time-ago, dates, sizes — en-GB
    incidents.ts              PUBLIC_INCIDENT_SELECT (no rawDescription), mappers
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
  sql/postgis.sql             Extension, triggers, GiST indexes
  sql/rls_policies.sql        Row-level security — apply after postgis.sql
public/
  manifest.json               PWA manifest — start_url /map, two shortcuts
  sw.js                       Offline worker. Caches the shell only, never HTML
  offline.html                Standalone fallback page, zero dependencies
  icons/                      Generated by scripts/generate-icons.mjs
  onesignal/                  OneSignal's worker, scoped away from root
scripts/
  generate-icons.mjs          Authoring tool — renders the icons, run by hand
.github/workflows/
  version.yml                 standard-version bump on a releasable push to main
SETUP.md                      Twelve-step first-run guide + troubleshooting
```

---

## Domain rules

These are not style preferences. Breaking them leaks residents' personal data.

1. **`Incident.rawDescription` is never public.** It holds the reporter's
   verbatim words — names, plates, addresses. Only the reporter, coordinators
   and moderators may read it, and every read writes an `AuditLog` row. The
   public surface is `Incident.description`, the anonymised rewrite. Read
   incidents through `PUBLIC_INCIDENT_SELECT` in `src/lib/incidents.ts`, which
   omits the column entirely — no page or list should be able to reach it by
   accident.
2. **Coordinates are fuzzed before they are stored.** Jitter by
   `LOCATION_FUZZ_METERS` on the way in. The exact reported point is never
   persisted, so it cannot leak later.
3. **Media is redacted and EXIF-stripped before it is *uploaded*.** Faces are
   detected and blurred on-device by `src/lib/media/face-blur.ts`, and only the
   re-encoded canvas output is sent — which also drops the EXIF block, GPS tag
   included. `POST /api/incidents/media` has no server-side blur fallback on
   purpose: a fallback would mean accepting an unblurred original. Serve
   `redactedPath` once `redactedAt` is set. Photo GPS EXIF has re-identified
   people before.
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
- The file documents its two departures from the Day 5 brief: incident SELECT
  covers `RESOLVED` as well as `PUBLISHED` (matching
  `PUBLIC_INCIDENT_STATUSES`), and notification SELECT is own-rows-only rather
  than village-wide.

## Rate limiting

`src/lib/rate-limit.ts`. Fixed windows, in memory, keyed by Supabase auth user
id — never by IP, because a village shares a broadband line often enough that
an IP limit would silence a household.

| Route                      | Limit          |
| -------------------------- | -------------- |
| `POST /api/incidents/process` | 5 per hour  |
| `POST /api/incidents`      | 10 per day     |

- **Counted after the body validates**, not at the top of the handler. A
  malformed request costs a Zod parse; burning a slot on one would let a
  client-side bug spend a reporter's quota without a single call reaching
  Claude or a single row reaching the queue.
- The counters live in the process, so on Vercel they are **per lambda
  instance** and reset on a cold start. That stops a retry loop or one resident
  hammering "Reprocess"; it does not stop a distributed attacker. When shared
  state arrives, replace the `Map` and leave every call site alone.
- A 429 carries `Retry-After` and an `error` string. The wizard already treats
  any non-200 from the AI route as "no rewrite this time" and falls back to the
  reporter's own wording — **being rate limited must never block filing**.
- `POST /api/notifications` is coordinator-only and already audited, so it has
  no user-facing limit.

## The legal pages

`/privacy` and `/terms`, public, sharing `src/components/legal-page.tsx` and
linked from `SiteFooter` and the registration form.

- `DATA_CONTROLLER` in `src/lib/constants.ts` is **placeholders**. A privacy
  notice that does not name a controller does not satisfy Article 13 — fill it
  in before a single real resident registers.
- The privacy notice makes three claims that are statements about how the code
  behaves: on-device blur with no server-side fallback (domain rule 3),
  coordinate jitter (domain rule 2), and report text going to Anthropic. If any
  of those changes, `/privacy` changes in the same commit.
- `RETENTION` describes the schedule the policy states, and
  `/api/cron/retention` now enforces the first two figures nightly. The other
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
- **Archiving is a status change**, keyed on `reportedAt` rather than
  `occurredAt`: a retention period runs from when the data was collected, and
  `occurredAt` is whatever the reporter typed.
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

## Deployment guardrails

- **Never push directly to `main`.** `main` auto-deploys to production.
- Feature branch → PR → Vercel preview → review → merge.
- **Commits are Conventional Commits.** `.github/workflows/version.yml` bumps the
  version, writes `CHANGELOG.md` and tags when a `feat`, `fix`, `perf`,
  `refactor` or `revert` lands on `main`. The release commit carries `[skip ci]`,
  which stops both the workflow re-triggering itself and Vercel spending a
  production deploy on a version bump.
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
npx prisma generate      # Regenerate client after schema changes
npx prisma migrate dev   # Create + apply a migration locally
npm run db:seed          # Seed one village — set SEED_ADMIN_USER_ID first
npx prisma studio        # Browse data
npm run release:patch    # Bump version + changelog by hand (CI usually does it)
node scripts/generate-icons.mjs   # Re-render the PWA icons from the brand mark
psql "$DIRECT_URL" -f prisma/sql/postgis.sql        # PostGIS triggers + indexes
psql "$DIRECT_URL" -f prisma/sql/rls_policies.sql  # Row-level security
```

`SETUP.md` is the first-run guide — twelve ordered steps and a troubleshooting
section. Several of them fail unhelpfully if the one before was skipped.

---

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
- **Reports still land in `PENDING_REVIEW`.** The rewrite is good; it is not a
  moderation queue.
- `rawDescription` and `description` now hold different text — the reporter's
  words and the published rewrite. When no rewrite happened, both hold the
  reporter's words, which is safe because of the point above.
- The `ai` block on the publish payload is **provenance, not authorisation**.
  It comes from the browser and could be forged; it decides nothing, because
  the moderation queue is the gate.
- Pattern detection reads **published incidents only**. Feeding pending reports
  in would let a pattern note describe something the queue has not cleared
  (domain rule 6).

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

## Reading `rawDescription`

There is exactly one path: `readRawDescription()` in `src/lib/moderation.ts`,
which writes the `incident.raw_viewed` audit row **before** returning the text
(domain rule 1). It is reached from the "Show the reporter's original wording"
button in the moderation queue.

The CSV export deliberately does **not** use it. A coordinator may read one
report's verbatim words with a trail behind each read; a spreadsheet gets
emailed and forwarded, and a name in it is not recallable. `/api/dashboard/export`
carries the anonymised column only.

## Not built yet

Days 1–7 delivered the scaffold, schema, landing page, the on-device blur and
upload, the report wizard, the Claude structuring pass, the map, the incident
list and detail pages, push notifications, the coordinator dashboard and
moderation queue, CSV export, the weekly digest cron, settings, the RLS
policies, rate limiting, the legal pages, home-location capture, the audit
viewer, security headers, the error pages, the retention cron, the seed script,
`SETUP.md`, auto-versioning, PWA install and offline support, the email
templates and the onboarding tour. Still open:

- The Supabase project exists (eu-west-2), the first migration is applied, and
  `postgis.sql` and `rls_policies.sql` have both been run against it. The
  `incident-media` bucket exists, private. What has **not** happened: no
  production deployment, no Vercel environment variables, no cron has ever
  fired.
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
  the council review both documents before launch.
- **Two of the four retention figures are still unenforced.** The nightly job
  archives at 12 months and deletes media at 6; nothing expires audit rows at 24
  months (the append-only trigger forbids it from application code) and nothing
  closes dormant accounts. The privacy policy states all four.
- The community guidelines in `/terms` §5 are the common village-watch set,
  not any particular parish's. Swap in the group's own wording if it has any.
- No OneSignal app exists. `NEXT_PUBLIC_ONESIGNAL_APP_ID`, `ONESIGNAL_APP_ID`
  and `ONESIGNAL_REST_API_KEY` are unset, so every dispatch logs and reports
  `skipped: "not_configured"` — which is a supported state, not a bug. When one
  is created, its dashboard service worker path **must** be set to
  `/onesignal/` — see PWA and the two service workers.
- **No billing.** `PRICING` in `src/lib/constants.ts` renders a Pro tier on the
  landing page marked "Planned", and the section says in as many words that
  nothing takes payment. There is no provider, no plan column and no enforcement
  — a Pro village and a free one are the same rows in the same tables.
- **`VILLAGES_LIVE` is null**, so the landing page renders no "trusted by N
  villages" figure. Set it when somebody can point at the list, and not before:
  a made-up number there is a false statement to a parish clerk deciding whether
  to hand over their residents' reports.
- **No CI beyond the version bump.** `.github/workflows/version.yml` is the only
  workflow; nothing runs `npm run build`, `tsc` or `eslint` on a pull request.
- The README's screenshots are placeholder text. Capture them after the first
  seeded deploy.
- `aiSummary` is still unused; the AI pass fills `aiModel`, `aiConfidence`,
  `peopleCount`, `recurring` and `patternNote`.
- `PatternAlert` rows are created by the digest but nothing renders them —
  acknowledge and dismiss have no UI, and the dashboard does not list them.
  (The RLS UPDATE policy for them is already in place, waiting on the screen.)
- **Email has templates but no transport.** `src/lib/email/` renders welcome,
  weekly digest and incident notification; nothing sends them, `notifyEmail` is
  absent from the settings screen, and no dispatch honours it. SMS has neither
  templates nor transport.
- Home location is captured at registration only, and it is optional. Anyone
  who registered before Day 5, or who skipped the map, still has no
  `homeLat`/`homeLng` and falls into the village-wide audience — which is the
  intended degradation, not a bug. There is no way to set or change it
  afterwards; `/settings` does not offer it yet.
- **Storage policies are not configured.** `POST /api/incidents/media` and
  `src/lib/media/storage.ts` both use the service-role client
  (`src/lib/supabase/admin.ts`) and do their own session, village and
  path-prefix checks. Once the `incident-media` bucket has village-scoped
  policies, move both back to the request-scoped client.
- The incident list shows the most recent `INCIDENT_PAGE_SIZE` and does not
  paginate; the map draws up to `MAX_MAP_INCIDENTS` pins with no clustering;
  the moderation queue shows `MODERATION_QUEUE_SIZE` with no paging or filter.
- Rate limiting is per-process and resets on a cold start — see the section
  above. Shared state is the fix, and it is not here.
- No Content-Security-Policy. It needs a per-request nonce from `src/proxy.ts`;
  the other security headers are in `next.config.ts`. Note that a CSP now has
  three script origins to account for, not two: the App Router bootstrap, the
  OneSignal CDN, and the two service workers.
- Resident verification has no UI — no way to approve a join request or promote
  someone to `VERIFIED_RESIDENT`.
- `/forgot-password` is linked from the login form but does not exist yet.
- No tests, no CI, no staging environment, no auto-versioning.
- Light theme only. Add a dark palette deliberately — `prefers-color-scheme`
  would half-apply to the map and severity badges.

## Open product questions

Defaults were chosen to keep Day 1 moving. Confirm before seeding real data:

- `Village.country` defaults to `"GB"` and `Village.timezone` to
  `"Europe/London"`. The product language is British English throughout
  ("antisocial behaviour", "999"). Change all three together if the launch
  market is not the UK.
