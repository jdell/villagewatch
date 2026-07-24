# VillageWatch

**Keep your village safe.**

Community safety reporting for villages and neighbourhoods. Residents report
what they see in under a minute. AI strips out personal details, categorises the
report and places it on a live map. Neighbours get alerted, coordinators get a
moderation queue, and pattern detection flags clusters before anyone has to join
the dots by hand.

---

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
Supabase (Postgres + PostGIS, Auth, Storage) · Prisma 7 · Zod 4 ·
Leaflet · Vercel

---

## Getting started

### 1. Install

```bash
npm install
```

`postinstall` runs `prisma generate`, so the client in `src/generated/prisma/`
is built for you.

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in the values. At minimum you need `DATABASE_URL`, `DIRECT_URL`,
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

The app runs without them — the landing page, `/login` and `/register` render
fine and tell you what is missing — but nothing behind auth will work.

From the Supabase dashboard:

| Variable                        | Where to find it                                            |
| ------------------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`                  | Settings → Database → Connection pooling (**port 6543**)     |
| `DIRECT_URL`                    | Settings → Database → Connection string (**port 5432**)      |
| `NEXT_PUBLIC_SUPABASE_URL`      | Settings → API → Project URL                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → `anon` `public`                             |
| `SUPABASE_SERVICE_ROLE_KEY`     | Settings → API → `service_role` (**server only, never expose**) |

### 3. Create the database schema

```bash
npx prisma migrate dev --name init
```

Then apply the PostGIS extension, triggers and spatial indexes — Prisma cannot
manage geography columns itself:

```bash
psql "$DIRECT_URL" -f prisma/sql/postgis.sql
```

Alternatively, paste the contents of that file into the Supabase SQL Editor.

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000>.

---

## Commands

| Command                  | What it does                                  |
| ------------------------ | --------------------------------------------- |
| `npm run dev`            | Dev server with Turbopack                     |
| `npm run build`          | Production build                              |
| `npm start`              | Serve the production build                    |
| `npm run lint`           | ESLint                                        |
| `npx tsc --noEmit`       | Typecheck                                     |
| `npx prisma generate`    | Regenerate the client after a schema change   |
| `npx prisma migrate dev` | Create and apply a migration locally          |
| `npx prisma studio`      | Browse the data                               |

---

## Architecture notes

### Next.js 16

- `middleware.ts` is now **`proxy.ts`** — it lives at `src/proxy.ts`.
- `cookies()` and `headers()` are **async**.
- Page `params` and `searchParams` are **Promises** and must be awaited.

### Prisma 7

- The connection URL lives in **`prisma.config.ts`**, not `schema.prisma`.
- There is no Rust query engine — the runtime connects through the
  `@prisma/adapter-pg` driver adapter in `src/lib/prisma.ts`.
- The CLI uses `DIRECT_URL` (migrations cannot run through pgBouncer); the app
  uses the pooled `DATABASE_URL`.

### PostGIS

`Incident.locationPoint`, `PatternAlert.centroidPoint` and `Village.boundary`
are PostGIS `geography` columns, declared to Prisma as `Unsupported(...)`.
Prisma Client cannot read or write them.

Application code writes `lat` / `lng`; triggers derive the geography columns.
Radius searches use `prisma.$queryRaw` with `ST_DWithin` — there is a worked
example at the bottom of `prisma/sql/postgis.sql`.

### Privacy model

Reported coordinates are jittered by `LOCATION_FUZZ_METERS` before they are
stored, so the exact location cannot leak later. `Incident.rawDescription` keeps
the reporter's verbatim words and is restricted to coordinators; residents only
ever see the anonymised `description`. Uploaded media is EXIF-stripped and
face/plate-blurred before it is served.

See `CLAUDE.md` for the full set of domain rules and deployment guardrails.

---

## Data model

Eight tables, all scoped to a village.

| Model           | Purpose                                                         |
| --------------- | --------------------------------------------------------------- |
| `Village`       | Tenant boundary. Map viewport, catchment, join code, alert threshold |
| `User`          | Profile mirroring `auth.users.id`. Role, village, notification prefs |
| `Incident`      | A reported event. Raw + anonymised text, severity, status, location |
| `IncidentMedia` | Photos and video in Supabase Storage, with redacted variants     |
| `IncidentTag`   | AI-generated labels — what pattern detection clusters on         |
| `Notification`  | One message, one user, one channel, with delivery state          |
| `PatternAlert`  | A detected cluster of related incidents                          |
| `AuditLog`      | Append-only trail of privileged actions                          |

Enums: `IncidentType`, `Severity`, `IncidentStatus`, `ReportSource`, `UserRole`,
`VillageStatus`.

---

## Project status

Day 1 of the build: project scaffold, full database schema, auth plumbing and
the public landing page.

**Working:** landing page, login and register pages and their API routes, auth
guard in `src/proxy.ts`, session helpers, the authenticated shell with sidebar.

**Placeholders:** `/map`, `/incidents`, `/incidents/new`, `/dashboard`,
`/settings`.

**Not started:** row-level security policies, AI anonymisation, pattern
detection, Web Push delivery, tests, CI, staging environment.

---

## Deployment

Auto-deploys to Vercel from `main`. Feature branch → PR → preview → merge.
Never push straight to `main`, and never point a preview deployment at the
production database. Full guardrails are in `CLAUDE.md`.
