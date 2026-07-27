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
    account-closed/           Where a closed account lands — public, outside
                              (app) and outside AUTH_ROUTES, or it would loop
    (app)/                    Authenticated shell (sidebar); force-dynamic
      layout.tsx              requireSession() — the real auth boundary
      admin/coordinators/     Platform-admin queue — the only page not scoped
                              to one village; approve promotes to COORDINATOR
      coordinator-apply/      The resident's application form + its action
      map/                    Full-screen Leaflet map, severity pins
      incidents/              List with type + severity filters (GET form)
      incidents/[id]/         Detail — media, tags, map pin; params is a Promise
      incidents/[id]/edit/    Reporter's own edit, queue statuses only
      incidents/[id]/actions.ts  Moderate / edit / withdraw server actions
      incidents/new/          Report wizard host (village lookup, server-side)
      dashboard/              Stats, breakdowns, hotspots, moderation queue
      dashboard/actions.ts    Moderate, audited raw-text reveal, and the
                              village's WhatsApp Channel settings
      dashboard/audit/        Audit trail viewer — coordinator only, filterable
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
    api/digest/               Weekly cron — Claude summary, PatternAlert, push
    api/cron/retention/       Nightly cron — archives reports, deletes old media
  components/                 Shared UI (logo, app-shell, placeholder, auth forms)
    auth/google-button.tsx    "Continue with Google" + the or-divider, shared
    auth/welcome-form.tsx     The provider sign-up's second half
    auth/village-picker.tsx   Type-to-search village combobox + OGL attribution
    auth/forgot-password-form.tsx  Reset request — never reveals if an account exists
    auth/reset-password-form.tsx   New password; the session says whose
    site-footer.tsx           Public footer, incl. the legal links — shared
    legal-page.tsx            Shell + typography for /privacy and /terms
    status-screen.tsx         Shell behind not-found.tsx and error.tsx
    coordinator-apply-form.tsx  The application — role, detail, why
    coordinator-application.tsx Settings section: apply / pending / declined
    flash-toast.tsx           One toast after a redirecting server action
    admin/coordinator-request-card.tsx  One application, approve or reject
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
    delete-account.tsx        The danger zone — type your email to confirm
    push-registration.tsx     OneSignal init, login(userId), consent banner
    onboarding-tour.tsx       Four-step first-run tour; useSyncExternalStore
    service-worker.tsx        Registers /sw.js in production only
    dashboard/stat-card.tsx   One figure with its trend against last period
    dashboard/breakdown-bar.tsx  CSS bars — no charting dependency
    dashboard/moderation-card.tsx  Queue row; audited raw-text reveal
    dashboard/whatsapp-channel-form.tsx  The village's own channel — link, id,
                              posting switch, severity floor
    severity-badge.tsx        green / amber / red / purple pill
    incident-type-icon.tsx    Enum icon name → lucide component
    no-village.tsx            Shown wherever a resident has no village yet
  lib/
    prisma.ts                 Singleton + pg driver adapter
    auth.ts                   getSession / requireSession / requireRole /
                              requireCoordinator / requireAdmin
    admin.ts                  ADMIN_EMAILS — the platform admin allow-list
    slack.ts                  Staff webhook, fire-and-forget, server only
    moderation.ts             applyModeration + audited readRawDescription
    erasure.ts                removeIncident + eraseAccount — Article 17,
                              tombstones the row and deletes the media
    coordinator-requests.ts   Apply, approve, reject — the only place a role
                              is ever raised to COORDINATOR
    notifications.ts          OneSignal dispatch, audience rules — server only
    whatsapp-channel.ts       Public channel posting — server only, opt-in, no official API
    cron.ts                   Constant-time CRON_SECRET check, shared by both jobs
    email/                    Templates only — no transport. layout, welcome,
                              weekly-digest, incident-notification,
                              coordinator-decision
    ai/weekly-digest.ts       Claude weekly summary, structured, typed failures
    geo.ts                    fuzzCoordinates — server only, uses node:crypto
    rate-limit.ts             Fixed windows counted in `rate_limit` — server only
    erasure.ts                Article 17 — tombstone a report, close an account
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
  icons/                      Generated by scripts/generate-icons.mjs
  onesignal/                  OneSignal's worker, scoped away from root
scripts/
  generate-icons.mjs          Authoring tool — renders the icons, run by hand
  download-ons-places.ts      Finds + fetches the newest IPN release, unzips it
  convert-grid-refs.ts        OSGB36 → WGS84 via geodesy; library + CLI
.github/workflows/
  version.yml                 standard-version bump on a releasable push to main
SETUP.md                      Thirteen-step first-run guide + troubleshooting
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

| Route                      | Limit          |
| -------------------------- | -------------- |
| `POST /api/incidents/process` | 5 per hour  |
| `POST /api/incidents`      | 10 per day     |

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
  in before a single real resident registers.
- The privacy notice makes four claims that are statements about how the code
  behaves: on-device blur with no server-side fallback (domain rule 3),
  coordinate jitter (domain rule 2), report text going to Anthropic, and what
  the Slack staff channel is told. If any of those changes, `/privacy` changes
  in the same commit.
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
npm run download:ons     # Fetch the ONS Index of Place Names to data/ (47MB)
npm run db:seed:villages # Seed the Cambridgeshire directory — 270 parishes
npm run db:seed:villages:all      # Every parish in England — 10,670
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

## Staff alerts on Slack

`src/lib/slack.ts`. One webhook URL, one function, a plain `fetch` POST — no
SDK, because an incoming webhook is a URL you post JSON to. Optional: with
`SLACK_WEBHOOK_URL` blank every alert is written to the server console instead,
the same supported state OneSignal and the WhatsApp relay have.

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

`src/lib/whatsapp-channel.ts`. Optional, off by default, and the only surface in
the app that discloses outside the village.

- **There is no official API for this.** Meta's Cloud API sends messages to
  phone numbers; it has no endpoint that posts to a Channel. Third-party relays
  (Whapi and similar) do it by driving the WhatsApp Web protocol, which can
  breach WhatsApp's terms and get the number banned. So the module is a
  provider-agnostic `POST {channelId, text}` to `WHATSAPP_CHANNEL_API_URL` and
  takes no view on who answers. Change providers in `post()`; every call site
  stays the same.
- **The channel is the village's; the relay account is the platform's.** Both
  halves of a channel's identity — the public invite link and the id a relay
  writes to — are columns on `Village`, set by that village's coordinator on
  `/dashboard`. **No environment variable names a channel**, and none should: a
  deployment serves many villages and each runs its own. `WHATSAPP_CHANNEL_API_URL`
  and `WHATSAPP_CHANNEL_API_TOKEN` are the one shared thing, because they are one
  relay account rather than one feed.
- **The follow link needs none of that.** A coordinator pastes the invite link
  into the dashboard form and `/settings` renders "Follow on WhatsApp" for every
  resident of that village; a village without one shows "WhatsApp Channel not set
  up yet". That half is officially supported, needs no credentials, and is what
  most villages will actually use.
- **`getVillageChannel` filters, `getVillageChannelSettings` does not.** The
  first is the read path and puts `url` through `safeChannelUrl`, because it
  feeds an `href`. The second is for the form that edits the column, where a bad
  link has to be visible to be correctable — it goes into a text input and never
  into an anchor.
- **Changing the settings is audited; the posts are not.** `village.channel_update`
  is the only configuration change in `AUDIT_ACTIONS` and is toned `sensitive`,
  because turning posting on widens the audience for every alert published
  afterwards past the tenant boundary. Who did that, and when, is exactly what
  the trail is for. A post itself still writes nothing — see below.
- **A channel is public**, so the rules are stricter than anywhere else:
  `whatsappEnabled` defaults false, `whatsappMinSeverity` defaults **HIGH** (push
  defaults to LOW), and `ChannelIncident` has no field that could carry
  `rawDescription`, `lat` or `lng` — the same structural guard
  `IncidentEmailInput` uses. `locationText` is the one field whose audience
  widens; it is the anonymised landmark, and an alert with no place is not an
  alert.
- The post carries a headline, an area, a time and a **link** — not the
  `description`. Anyone entitled to the full report can open the link and sign
  in.
- **Nothing throws**, same contract as `notifications.ts`. Unconfigured relay,
  timeout and a 500 all log and return `posted: false` with a reason. The relay
  call sits inside a coordinator's Approve click, so it has an 8s timeout
  (`WHATSAPP_RELAY_TIMEOUT_MS`) and runs *after* the push rather than racing it.
- **No `Notification` rows** — that table is one row per user per delivery and a
  channel has no known recipients. **No `AuditLog` row** either: the post is a
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
what writes `role: "COORDINATOR"`. This module is the only place in the codebase
that raises a role, which is why the rules live here rather than at the two call
sites — the API route and the admin page's server action both go through it.

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

- The Supabase project exists (eu-west-2), the first migration is applied, and
  `postgis.sql` and `rls_policies.sql` have both been run against it. The
  `incident-media` bucket exists, private. What has **not** happened: no
  production deployment, no Vercel environment variables, no cron has ever
  fired.
- **Two migrations have not been applied anywhere.**
  `20260727113000_coordinator_requests` and
  `20260727150000_erasure_and_rate_limits` are both hand-written, like the
  WhatsApp one before them, and neither has met a database. Apply them in order,
  then re-run the whole RLS file — a new table arrives with row-level security
  off, so until that second step an application sitting in the queue is readable
  through PostgREST by anyone with a key, and every resident's remaining quota
  is readable and resettable.
  The erasure migration is the one to watch. It carries
  `ALTER TYPE "incident_status" ADD VALUE 'REMOVED'`, which is only safe inside
  Prisma's migration transaction because nothing else in that file uses the new
  value — a statement in the same transaction that referenced it would fail with
  "unsafe use of new value of enum type". Keep it that way if you edit the file.
  The RLS file also gained `deleted_at` in `users_guard_privilege_columns`;
  until it is re-run, a closed account can null its own column through PostgREST
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
- **A directory entry still cannot be claimed from cold, and this is now the
  blocker.** Nothing in the repo writes `Village.status` except `prisma/seed.ts`,
  which hardcodes `ACTIVE` for its one placeholder; `seed-villages.ts`
  deliberately never touches it, and every other `status: "ACTIVE"` in `src/` is
  a read filter. So a seeded parish is `PENDING` forever and the only promotion
  path is editing the row by hand in Prisma Studio or psql. Joining it would
  still need a join code a seeded village does not have, and both auth routes
  hardcode `role: codeMatches ? "VERIFIED_RESIDENT" : "RESIDENT"`. Coordinator
  access requests close the *second* half of this — `coordinator-requests.ts`
  does assign `COORDINATOR` on approval — but that flow starts from a resident
  who is *already* in the village, so it cannot bootstrap one. The missing piece
  is the first step, not the last: activate a village, mint its join code and
  appoint its first coordinator in the same operation, or the village is a black
  hole where every report filed sits in `PENDING_REVIEW` unreachable (domain
  rule 6).
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
- **No data processing agreement with Slack.** `/privacy` §6 now says every
  processor acts under a written one, and for Slack there is not yet a signed
  agreement — that sentence has to become true before a real resident registers,
  or the alert has to go somewhere that is. It is the same class of debt as
  `DATA_CONTROLLER`: the code is right and the paperwork is not.
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
- **The WhatsApp Channel has a UI now but still no relay.** All four `Village`
  columns are set by a coordinator on `/dashboard`, validated by
  `villageChannelFormSchema`. What is still missing is the other end:
  `WHATSAPP_CHANNEL_API_URL` is unset, so every post logs and reports
  `skipped: "not_configured"` — a supported state, like OneSignal. Nothing has
  ever been posted to a real channel. **Before turning one on for a live
  village, post to a test channel first and read what actually lands** — this is
  the one feature whose output an unauthenticated stranger can read.
- No test suite. `.github/workflows/ci.yml` runs `lint`, `typecheck` and `build`
  on every pull request and every push to `main`, which is the floor rather than
  the goal — there is still nothing asserting behaviour.
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
- No test suite and no staging environment. CI and auto-versioning both exist.
- Light theme only. Add a dark palette deliberately — `prefers-color-scheme`
  would half-apply to the map and severity badges.

## Open product questions

Defaults were chosen to keep Day 1 moving. Confirm before seeding real data:

- `Village.country` defaults to `"GB"` and `Village.timezone` to
  `"Europe/London"`. The product language is British English throughout
  ("antisocial behaviour", "999"). Change all three together if the launch
  market is not the UK.
