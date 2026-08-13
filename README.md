<div align="center">

<img src="public/android-chrome-192x192.png" alt="" width="88" height="88">

# VillageWatch

**Keep your village safe.**

Community safety reporting for villages and neighbourhoods. Residents report
what they see in under a minute. AI strips out the personal details, categorises
the report and puts it on a live map. Neighbours get alerted, coordinators get a
moderation queue, and pattern detection flags clusters before anyone has to join
the dots by hand.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-087EA4?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Prisma 7](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![Supabase](https://img.shields.io/badge/Supabase-PostGIS-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Claude](https://img.shields.io/badge/Claude-Sonnet%205-D97757?logo=anthropic&logoColor=white)](https://www.anthropic.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**[villagewatch.app](https://villagewatch.app)**

</div>

---

<!--
  Screenshots. Replace these placeholders with real captures once there is a
  database with data in it — a README that shows a product nobody has run is a
  README that shows an empty state.

  Suggested set, in this order:
    docs/screenshots/map.png        The village map, pins colour-coded by severity
    docs/screenshots/report.png     Step 3 of the wizard, with the AI preview
    docs/screenshots/dashboard.png  Coordinator dashboard and moderation queue
-->

> **Screenshots go here.** `docs/screenshots/map.png`, `report.png`,
> `dashboard.png` — capture them after the first seeded deploy.

---

## What it does

**For residents**

- Report an incident in five steps, in your own words, from a phone on the
  pavement.
- Faces are blurred **on your device** before the photo is uploaded — which also
  drops the GPS tag cameras write into every picture.
- See every published report on a live map, colour-coded by severity.
- Choose what reaches you: a minimum severity, and a radius from home.

**For coordinators**

- A moderation queue, not an inbox. Original wording, anonymised version, photos
  and map pin side by side.
- Every privileged action is audited, including every read of a reporter's
  verbatim text.
- A weekly digest written by Claude, one per village, delivered Sunday morning.
- Pattern detection that names a cluster before anyone notices it.
- CSV export of the anonymised columns.

**Underneath**

- Reported coordinates are jittered ~100m before they are stored. The exact
  point is never persisted, so it cannot leak later.
- The reporter's verbatim words live in a column no page query can reach by
  accident.
- Row-level security on every table, as the last line of defence.
- Installable as a PWA, with an offline page.
- Nightly retention job that enforces what the privacy notice promises.

---

## Quick start

```bash
git clone https://github.com/jdell/villagewatch.git
cd villagewatch
npm install
cp .env.example .env.local   # fill in the Supabase values, and set
                             # NEXT_PUBLIC_APP_URL to http://localhost:3000
npx prisma migrate dev --name init
psql "$DIRECT_URL" -f prisma/sql/postgis.sql       # spatial triggers + indexes
psql "$DIRECT_URL" -f prisma/sql/rls_policies.sql  # row-level security
npm run dev
```

Open <http://localhost:3000>.

The app runs before any of that — the landing page, `/login` and `/register`
render fine and say what is missing — but nothing behind auth will work.

**[SETUP.md](SETUP.md) is the real guide**: twelve steps from an empty Supabase
account to a deployed village, plus a troubleshooting section. The order matters
and several steps fail unhelpfully if the one before was skipped.

### The sample coordinator account

`npm run db:seed` writes a village, five incidents and one **coordinator**
profile — `coordinator@example.uk`, which is the account to sign in as to see
the dashboard, the moderation queue, the audit viewer and the "show the
reporter's original wording" button.

**Its password is in `.env.local`, under `# --- Sample coordinator sign-in ---`,
and deliberately not here.** That file is gitignored; this one is on GitHub, and
a password committed to a public repo stays in the history after it is deleted.
Coordinator is also the role that can read `rawDescription` and export the CSV,
so it is not a throwaway login even when the data behind it is invented.

The seed **does not create the Supabase Auth account** — it cannot, since only
Supabase Auth can mint an identity. It writes the profile row, and `User.id`
mirrors `auth.users.id`, so the two only line up if `SEED_ADMIN_USER_ID` is set
to a real auth UID before seeding. Left unset, the seed invents a uuid, warns
you, and the profile belongs to nobody and cannot sign in.

To create or re-create the account from scratch:

```bash
# 1. Mint the auth identity, pre-confirmed, with a password you choose.
#    Anything with the service-role key can do this; the dashboard is easiest:
#    Supabase → Authentication → Users → Add user → Auto Confirm User.
#
# 2. Copy the new row's UID into .env.local:
#      SEED_ADMIN_USER_ID="<the-uid>"
#      SEED_ADMIN_EMAIL="coordinator@example.uk"
#
# 3. Seed. The profile is created against that UID, so it can sign in.
npm run db:seed
```

To reset the password later: Supabase → Authentication → Users → ⋯ → **Reset
password**. Update the note in `.env.local` when you do, or it goes stale
silently.

---

## Commands

| Command | What it does |
| ------- | ------------ |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build — run before every PR |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Regenerate the Prisma client after a schema change |
| `npm run db:migrate` | Create and apply a migration locally |
| `npm run db:seed` | Seed one village with sample data |
| `npm run db:studio` | Browse the data |
| `npm run release:patch` | Bump the version and write the changelog |
| `node scripts/generate-icons.mjs` | Re-render the PWA icons from the brand mark |

---

## Architecture

### The shape of it

```
Resident's browser                Vercel (lhr1)              Supabase (London)
──────────────────                ─────────────              ─────────────────
 report wizard  ─── text ────────▶ /api/incidents/process
 face blur (MediaPipe, WASM)          │
   │                                  └── Claude ──▶ anonymised text, type,
   │                                                  severity, tags
   └─ blurred image ────────────▶ /api/incidents/media ────▶ Storage (private)

                                  /api/incidents ──────────▶ Postgres + PostGIS
                                       │                       (jittered lat/lng)
                                       ▼
                                  PENDING_REVIEW ── coordinator approves
                                       │
                                       ├──▶ OneSignal push to the audience
                                       └──▶ visible on the map

 Sunday 09:00 UTC  ─── cron ────▶ /api/digest ──── Claude ──▶ PatternAlert
 Daily  02:00 UTC  ─── cron ────▶ /api/cron/retention ─────▶ archive + delete
```

### Next.js 16

These differ from Next 14/15 and bite on every file.

- `middleware.ts` is now **`proxy.ts`**, at `src/proxy.ts`, exporting `proxy`.
- `cookies()` and `headers()` are **async**. Never hoist `createClient()` to a
  module constant.
- Page `params` and `searchParams` are **Promises**. Type them
  `Promise<{ id: string }>` and await them.

### Prisma 7

- The connection URL lives in **`prisma.config.ts`**, not `schema.prisma`.
- No Rust query engine — the runtime connects through the `@prisma/adapter-pg`
  driver adapter in `src/lib/prisma.ts`.
- The CLI uses `DIRECT_URL` (port 5432, migrations cannot go through pgBouncer);
  the app uses the pooled `DATABASE_URL` (port 6543).
- The generated client lands in `src/generated/prisma/` and is **gitignored** —
  `postinstall` rebuilds it, which is what keeps Vercel from serving a stale one.

### PostGIS

`Incident.locationPoint`, `PatternAlert.centroidPoint` and `Village.boundary`
are `geography` columns, declared to Prisma as `Unsupported(...)`. **Prisma
Client cannot read or write them.**

Application code writes `lat`/`lng`; database triggers derive the geography.
Radius and clustering queries use `$queryRaw` with `ST_DWithin` / `ST_Distance`
— there is a worked example at the bottom of `prisma/sql/postgis.sql`.

### Auth

Three layers, in increasing order of trustworthiness:

1. `src/proxy.ts` — **optimistic**. Keeps signed-out users out of app routes and
   refreshes session cookies. Not the authorisation boundary.
2. `src/app/(app)/layout.tsx` — calls `requireSession()`. **This is the gate.**
   Coordinator routes additionally call `requireCoordinator()`.
3. Row-level security — the last line of defence, for the `anon` path.

`getSession()` uses `supabase.auth.getUser()`, which revalidates the JWT against
Supabase. Never swap it for the client's own `getSession()`, which trusts the
cookie as-is.

### Data model

Ten tables, all scoped to a village except `RateLimit`, which is keyed by the
Supabase auth user id and has no foreign key at all.

| Model | Purpose |
| ----- | ------- |
| `Village` | Tenant boundary. Map viewport, catchment, join code, alert threshold |
| `User` | Profile mirroring `auth.users.id`. Role, village, notification preferences |
| `Incident` | A reported event. Raw + anonymised text, severity, status, location |
| `IncidentMedia` | Photos and video in Supabase Storage, with redacted variants |
| `IncidentTag` | AI-generated labels — what pattern detection clusters on |
| `Notification` | One message, one user, one channel, with delivery state |
| `PatternAlert` | A detected cluster of related incidents |
| `CoordinatorRequest` | An application for coordinator access, and its decision |
| `RateLimit` | One fixed window's count, keyed `(user, action, window start)` |
| `AuditLog` | Append-only trail of privileged actions |

---

## The privacy model

These are not style preferences. Breaking one of them leaks a resident's
personal data. The full set, with the reasoning, is in
[CLAUDE.md](CLAUDE.md#domain-rules).

1. **`Incident.rawDescription` is never public.** It holds the reporter's
   verbatim words. Only the reporter, coordinators and moderators may read it,
   and every read writes an `AuditLog` row. Reads go through
   `PUBLIC_INCIDENT_SELECT`, which omits the column entirely, so no page can
   reach it by accident.
2. **Coordinates are fuzzed before they are stored.** The exact reported point
   is never persisted.
3. **Media is redacted and EXIF-stripped before it is uploaded.** Faces are
   blurred on-device; only the re-encoded canvas output is sent, which drops the
   EXIF block and its GPS tag. There is deliberately **no server-side blur
   fallback** — a fallback would mean accepting an unblurred original.
4. **The village is the tenant boundary.** Every incident query is scoped by
   `villageId`, taken from the session and never from a request body.
5. **Roles come from the server**, never from a client payload.
6. **Only published and resolved reports reach residents.**
7. **`AuditLog` is append-only** — enforced by a trigger that rejects every
   DELETE from everyone, including the table owner, and every UPDATE **bar
   one**: severing `actor_id` to NULL while every other column stays
   byte-identical. That exception is what lets an account be deleted at all,
   since the foreign key is `ON DELETE SET NULL` and the cascade is an UPDATE.
   It costs the trail nothing — `actorEmail` and `actorRole` are denormalised
   for exactly that — and it is the only edit any caller can make.

The privacy notice at `/privacy` makes **five** claims that are statements about
how this code behaves: on-device face covering with no server fallback,
coordinate jitter, report text going to Anthropic, what the Slack staff channel
is told, and whether a human sees a report before it is published — the last of
which is conditional on `Village.autoApprove` and says so. **If any of those
changes, `/privacy` changes in the same commit.**

---

## Contributing

### Before a pull request

```bash
npm run build      # must pass — several traps fail only in a production build
npm run typecheck
npm run lint
npm run test       # what CI runs; no secret and no database needed
```

The full bar, in order, is the Definition of Done in [CLAUDE.md](CLAUDE.md) —
these four plus the documentation that makes a claim about the behaviour you
changed, updated in the same commit.

### Commits

[Conventional Commits](https://www.conventionalcommits.org). The version and
changelog are generated from them by `standard-version` when something
releasable lands on `main` — see `.github/workflows/version.yml`.

```
feat(map): cluster pins above 200 incidents
fix(digest): survive a village with no coordinates
docs(setup): note the OneSignal service worker scope
refactor(auth): fold requireCoordinator into requireRole
```

`feat`, `fix`, `perf`, `refactor` and `revert` produce a release. `chore`,
`docs`, `style` and `test` do not. A `!` after the type, or a
`BREAKING CHANGE:` trailer, produces a major.

### Deployment guardrails

- Feature branch → PR → Vercel preview → review → merge. `main` auto-deploys to
  production.
- Staging uses a **separate** Supabase project. Never point a preview deployment
  at the production database.
- Never run `prisma migrate deploy` against production by hand.
- `prisma db push` is for local scratch databases only — no migration history.
- After a migration that adds a geography column, re-run `prisma/sql/postgis.sql`.
- After a migration that adds a table, re-run `prisma/sql/rls_policies.sql`. **A
  new table arrives with RLS off and every row readable by the anon key.**
- Never commit `.env.local`, real connection strings, or
  `SUPABASE_SERVICE_ROLE_KEY`.

### House style

Read [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) first. This is not the
Next.js in your training data or your muscle memory — check
`node_modules/next/dist/docs/` before writing anything unfamiliar.

---

## Project status

Deployed to production on Vercel (`lhr1`) against a Supabase project in
`eu-west-2`. `PROJECT_STATE.md` is the live answer to "where is this right now";
this section is the shape of it.

**All ten migrations are applied**, with `prisma/sql/postgis.sql` and
`prisma/sql/rls_policies.sql` re-run after them. The RLS policies have been
tested with the anon key from two villages — 43 assertions, which found and
closed two real holes (the `public` schema had lost its role grants to a
`prisma migrate` reset, leaving every policy dormant; and `raw_description` and
`join_code` were readable through PostgREST until they went behind column
grants).

**Working:** landing page with pricing and FAQ, auth (password and Google) with
password recovery, the five-step report wizard with on-device face covering, the
Claude anonymisation pass, the live map with a heatmap layer, incident list and
detail pages, push notifications, the coordinator dashboard and moderation queue,
the compliance gate, per-village auto-approve and face redaction level, the
village invite and its QR code, CSV export, the community safety report on screen
and as a server-rendered PDF, the weekly digest cron, the nightly retention cron,
settings, the audit trail viewer, the privacy policy and terms, home location
capture, rate limiting, security headers, error pages, PWA install and offline
page, the onboarding tour, email templates, the ONS village directory, the seed
script and auto-versioning.

**Built but never exercised against reality:** a long list, and the distinction
matters — a code path is not a feature. No push has reached a device, the
retention job has never run against data, no WhatsApp alert has been pasted into
a real channel, and no compliance acceptance has been recorded. The table under
"Built, but never exercised against reality" in `PROJECT_STATE.md` is the full
set, with what to watch on each first run.

**Tests and CI exist.** Vitest over `tests/` — 18 files, 293 tests, unit only,
no secret and no database, which is what lets `.github/workflows/ci.yml` run
lint → typecheck → test → build on every push with no environment at all. What
is deliberately not covered: route handlers, server actions, React components
and the RLS policies, all of which need a database, a request context or a
browser.

**Not started:** email and SMS delivery (the templates exist, the transport does
not), resident verification UI, pattern alert screens, a Content-Security-Policy,
a staging environment. `RETENTION.auditLogMonths` and
`RETENTION.inactiveAccountMonths` are both stated by the privacy policy and
enforced by nothing — the first cannot be enforced from application code at all,
because the append-only trigger rejects DELETE from the owner too, and the second
means deleting an `auth.users` row, which wants its own route and its own review.

**Before launch:** `DATA_CONTROLLER` in `src/lib/constants.ts` is placeholders
and reads `[Parish Council name]`. The privacy policy and terms both render it.
Fill it in, register with the ICO, and have the council review both documents.
The full list is at the end of [SETUP.md](SETUP.md).

---

## Licence

[MIT](LICENSE).

The licence covers the code. It does not cover your obligations to the people
whose data you put in it — if you deploy this for a real village, you are the
data controller, and the checklist at the end of [SETUP.md](SETUP.md) is where
that starts.
