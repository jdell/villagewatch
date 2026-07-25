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
| Toasts     | sonner                                                       |
| Hosting    | Vercel                                                       |

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
  `datasource db` block only declares `provider` and `extensions`.
- `prisma.config.ts` uses `DIRECT_URL` (port 5432) — migrations cannot run
  through pgBouncer. The application runtime uses `DATABASE_URL` (pooled, port
  6543) through the driver adapter in `src/lib/prisma.ts`.
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
    login/, register/         Public auth pages
    (app)/                    Authenticated shell (sidebar); force-dynamic
      layout.tsx              requireSession() — the real auth boundary
      map/                    Full-screen Leaflet map, severity pins
      incidents/              List with type + severity filters (GET form)
      incidents/[id]/         Detail — media, tags, map pin; params is a Promise
      incidents/new/          Report wizard host (village lookup, server-side)
      dashboard/, settings/   Placeholders
    api/auth/                 login, logout, register route handlers
    api/incidents/            POST create report (writes AI fields + tags)
    api/incidents/process/    POST run a draft through Claude; writes nothing
    api/incidents/media/      POST blurred upload, DELETE abandoned attachment
  components/                 Shared UI (logo, app-shell, placeholder, auth forms)
    incident-form.tsx         5-step wizard, react-hook-form + Zod
    media-uploader.tsx        Blur-then-upload; never touches the original
    location-picker.tsx       Leaflet pin picker — dynamic import, ssr: false
    ai-preview.tsx            Review / publish screens, reprocess + edit
    incident-map.tsx          Leaflet pin layer — never import without ssr:false
    map-view.tsx              Client wrapper: dynamic import + date-range toggle
    incident-location-map.tsx Client wrapper for the detail page's single pin
    incident-card.tsx         One incident, used by preview, list and detail
    severity-badge.tsx        green / amber / red / purple pill
    incident-type-icon.tsx    Enum icon name → lucide component
    no-village.tsx            Shown wherever a resident has no village yet
  lib/
    prisma.ts                 Singleton + pg driver adapter
    auth.ts                   getSession / requireSession / requireRole
    geo.ts                    fuzzCoordinates — server only, uses node:crypto
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
  sql/postgis.sql             Extension, triggers, GiST indexes
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
- RLS on every table is the last line of defence and is **not yet configured**
  — see Not built yet, below.
- `getSession()` uses `supabase.auth.getUser()`, which revalidates the JWT
  against Supabase. Never swap it for `getSession()` on the Supabase client,
  which trusts the cookie as-is.

---

## Deployment guardrails

- **Never push directly to `main`.** `main` auto-deploys to production.
- Feature branch → PR → Vercel preview → review → merge.
- Staging uses a separate Supabase project. Never point a preview deployment at
  the production database.
- **Never run `prisma migrate deploy` against production by hand.** Migrations
  run in the deploy pipeline against staging first.
- `prisma db push` is for local scratch databases only — it does not create
  migration history.
- After any migration that adds a geography column, re-run
  `prisma/sql/postgis.sql`.
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
npx prisma studio        # Browse data
psql "$DIRECT_URL" -f prisma/sql/postgis.sql   # Apply PostGIS triggers
```

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

## Not built yet

Days 1–3 delivered the scaffold, schema, landing page, the on-device blur and
upload, the report wizard, the Claude structuring pass, the map, the incident
list and the detail page. Still open:

- No Supabase project, no database, no migrations have been run.
- **Row-level security is not configured on any table.** Do this before any
  real resident data exists.
- Web Push delivery is unimplemented — `pushSubscription` and the `Notification`
  table are waiting for code. `aiSummary` is also still unused; the AI pass
  fills `aiModel`, `aiConfidence`, `peopleCount`, `recurring` and `patternNote`.
- `PatternAlert` rows are never created. Cross-referencing happens per report,
  at report time; the weekly digest that would write these is Day 5.
- **Storage policies are not configured.** `POST /api/incidents/media` and
  `src/lib/media/storage.ts` both use the service-role client
  (`src/lib/supabase/admin.ts`) and do their own session, village and
  path-prefix checks. Once the `incident-media` bucket has village-scoped
  policies, move both back to the request-scoped client.
- `/dashboard` and `/settings` are still placeholders.
- The incident list shows the most recent `INCIDENT_PAGE_SIZE` and does not
  paginate; the map draws up to `MAX_MAP_INCIDENTS` pins with no clustering.
- No rate limiting on `POST /api/incidents/process`. It costs money per call
  and the "Reprocess" button is unmetered.
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
