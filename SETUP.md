# Setting up VillageWatch

From an empty machine to a deployed village, in twelve steps.

Nothing in this repository has ever been run against a real database. These are
the steps that do it for the first time, in the order they have to happen —
several of them will fail if the one before was skipped, and the failures are
not always obvious. Steps 1–7 are the database and its policies; 8–12 are the
services and the deploy.

Budget an hour. Most of it is waiting for Supabase to provision.

---

## Before you start

| You need | Why |
| -------- | --- |
| Node.js 20 or later | Next.js 16 |
| A Supabase account | Postgres, PostGIS, Auth and Storage |
| A Vercel account | Hosting and the two cron jobs |
| An Anthropic API key | The anonymisation pass and the weekly digest |
| `psql` (optional) | Applying the SQL files from a terminal instead of the dashboard |

An OneSignal account is optional — see step 8.

```bash
git clone https://github.com/jdell/villagewatch.git
cd villagewatch
npm install
```

`postinstall` runs `prisma generate`, so the client in `src/generated/prisma/`
is built for you. It works with no database configured.

---

## 1. Create the Supabase project

<https://supabase.com/dashboard> → **New project**.

- **Region: London (eu-west-2).** This matters. Residents' incident reports are
  personal data under UK GDPR, the privacy notice says the database is in the
  UK, and Vercel is pinned to `lhr1` in `vercel.json` so the app sits next to
  it. A project in Virginia makes the privacy notice untrue and every query
  eighty milliseconds slower.
- Choose a strong database password and save it — you need it in step 3 and
  Supabase will not show it again.

Provisioning takes a couple of minutes.

---

## 2. Enable PostGIS

Supabase ships the extension but does not enable it.

**Dashboard → Database → Extensions**, search `postgis`, toggle it on.

Or in the SQL editor:

```sql
create extension if not exists postgis;
```

Do this **before** step 4. The first migration declares the extension and
creates `geography` columns; without PostGIS it fails partway through and
leaves the schema half-applied.

---

## 3. Configure the environment

```bash
cp .env.example .env.local
```

`.env.local` is gitignored. Never commit it, and never paste a service-role key
into an issue or a chat.

From **Dashboard → Project Settings**:

| Variable | Where |
| -------- | ----- |
| `DATABASE_URL` | Database → Connection pooling → Transaction mode (**port 6543**) |
| `DIRECT_URL` | Database → Connection string → URI (**port 5432**) |
| `NEXT_PUBLIC_SUPABASE_URL` | API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | API → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | API → `service_role` — **server only, never expose** |

Both connection strings need `[YOUR-PASSWORD]` replaced with the password from
step 1. The two ports are not interchangeable: migrations cannot run through
pgBouncer, and the app should not hold a direct connection per lambda.

Also set:

```bash
NEXT_PUBLIC_APP_URL="http://localhost:3000"   # your real domain in production
CRON_SECRET="$(openssl rand -base64 32)"      # see step 11
```

---

## 4. Create the schema

```bash
npx prisma migrate dev --name init
```

This creates `prisma/migrations/` — the first migration this project has ever
had. Commit it.

It also applies the Day 4 schema change (`User.notifyRadiusMeters`), which has
been generated but never migrated.

If Supabase refuses to create a shadow database, point `SHADOW_DATABASE_URL` at
a scratch database and try again.

---

## 5. Apply the spatial triggers

Prisma cannot manage `geography` columns — it declares them `Unsupported(...)`
and cannot read or write them. This file creates the triggers that derive them
from `lat`/`lng`, plus the GiST indexes the radius queries need.

```bash
psql "$DIRECT_URL" -f prisma/sql/postgis.sql
```

Or paste the file into the SQL editor. It is re-runnable.

**Re-run it after any migration that adds a geography column.**

---

## 6. Apply row-level security

```bash
psql "$DIRECT_URL" -f prisma/sql/rls_policies.sql
```

Order matters: after step 5, not before.

This is the file that stops a leaked anon key reading every village's reports.
It has never been executed against a real database, so this is the first time
anyone finds out whether it is right.

**Test it before you put real data in.** Create two villages and a user in each,
then with the *anon* key try to read the other village's incidents. You should
get nothing back. Also confirm:

- A resident cannot read `raw_description` through PostgREST.
- A resident cannot change their own `role`, `village_id` or `verified_at`
  (the `users_guard_privilege_columns` trigger).
- `update` and `delete` on `audit_logs` fail — for everyone, including the
  table owner.

**Re-run it after any migration that adds a table.** A new table arrives with
RLS off and every row readable by the anon key.

---

## 7. Create the storage bucket

**Dashboard → Storage → New bucket**

- Name: `incident-media` (or set `SUPABASE_STORAGE_BUCKET` to match)
- **Private.** Not public. Only blurred media is ever written to it, but it is
  still village-scoped resident data, and it is served through signed URLs.

Storage policies are not configured yet. `POST /api/incidents/media` and
`src/lib/media/storage.ts` both use the service-role client and do their own
session, village and path-prefix checks. Once the bucket has village-scoped
policies, move both back to the request-scoped client.

---

## 8. OneSignal (optional)

Skip this and everything still works: the audience is still resolved, the
`Notification` rows are still written, and the payload is logged to the server
console instead of being sent. `skipped: "not_configured"` is a supported
state, not a bug.

To turn push on: <https://onesignal.com> → new **Web** app.

- Site URL: your production URL.
- **Service worker path: `/onesignal/`, filename `OneSignalSDKWorker.js`.**
  This is not the OneSignal default. The root scope belongs to VillageWatch's
  own offline worker at `/sw.js`, and a scope can have exactly one controlling
  registration — left at the default, whichever registered second would
  silently evict the other. The file is already at
  `public/onesignal/OneSignalSDKWorker.js` and the init in
  `src/components/push-registration.tsx` already points at it.
- Leave auto-prompting **off** in the dashboard. VillageWatch asks with its own
  banner, from a click handler, which is what Safari requires and what keeps
  Chrome from permanently blocking the origin.

```bash
NEXT_PUBLIC_ONESIGNAL_APP_ID="..."   # public by design
ONESIGNAL_APP_ID="..."               # the same value
ONESIGNAL_REST_API_KEY="..."         # SERVER ONLY
```

---

## 9. Add the Anthropic API key

<https://console.anthropic.com> → API keys.

```bash
ANTHROPIC_API_KEY="sk-ant-..."
ANTHROPIC_MODEL="claude-sonnet-5"
```

Leave it blank and the app still works. Reports file in the reporter's own
wording, the wizard says so on screen, and they wait in `PENDING_REVIEW` for a
coordinator exactly as they would otherwise. The weekly digest degrades to a
counted summary. Being unable to reach Claude must never block filing a report.

Check it locally:

```bash
npm run dev
```

Open <http://localhost:3000>, register, file a report, and watch the preview
step. If the AI pass ran, the anonymised text differs from what you typed.

---

## 10. Deploy to Vercel

<https://vercel.com/new> → import the GitHub repository.

Framework preset, build command and output directory are all detected — do not
override them. `vercel.json` sets the region to `lhr1` and declares the crons.

Or from a terminal:

```bash
npm i -g vercel
vercel        # preview
vercel --prod # production
```

The git committer email must match a GitHub account Vercel recognises, or the
deploy is blocked.

---

## 11. Add the environment variables to Vercel

**Project → Settings → Environment Variables.** Everything from `.env.local`,
with two changes:

- `NEXT_PUBLIC_APP_URL` becomes the real domain. Push deep links and email links
  are built from it; left as `localhost` every notification points at a machine
  that is not the reader's.
- `CRON_SECRET` must be set here, in Production. **Both scheduled routes refuse
  every request without it** — deliberately, because one spends Anthropic credit
  and pushes to coordinators' phones and the other deletes files and takes
  reports off the map.

Vercel sends it as `Authorization: Bearer $CRON_SECRET`, and both routes compare
it in constant time (`src/lib/cron.ts`).

The two crons, from `vercel.json`:

| Path | Schedule | What it does |
| ---- | -------- | ------------ |
| `/api/digest` | Sunday 09:00 UTC | Claude summary per village, writes a `PatternAlert`, pushes to coordinators |
| `/api/cron/retention` | Daily 02:00 UTC | Archives reports at 12 months, deletes media at 6 |

Both are visible under **Project → Cron Jobs** after the first production
deploy. Test one by hand before trusting it:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/digest
```

A Hobby plan allows two cron jobs, each running at most once a day. These two
fit exactly; a third needs Pro.

---

## 12. Seed (optional)

Only for a scratch or staging database. It writes five invented incidents.

```bash
# Register at /register first, then find your UID:
# Supabase → Authentication → Users → the row's UID
SEED_ADMIN_USER_ID="your-auth-uid" \
SEED_VILLAGE_NAME="Little Mowbray" \
npm run db:seed
```

`User.id` mirrors `auth.users.id`. Without `SEED_ADMIN_USER_ID` the seed makes
one up, warns you, and the resulting coordinator profile belongs to nobody and
cannot sign in.

The seed is idempotent — everything is an upsert on a natural key, and the
update halves are deliberately narrow, so re-running will not resurrect a report
you rejected.

---

## Before real residents

None of these are optional, and none of them are code.

- [ ] **Fill in `DATA_CONTROLLER`** in `src/lib/constants.ts`. It currently
      reads `[Parish Council name]`. A privacy notice that does not name a
      controller and give a working contact address does not satisfy Article 13,
      and `/privacy` and `/terms` both render it.
- [ ] **Register with the ICO.** The registration number goes in the same
      constant.
- [ ] **Have the council read `/privacy` and `/terms`.** The community
      guidelines in §5 are the common village-watch set, not any particular
      parish's.
- [ ] **Test the RLS policies with the anon key, from two villages.** See step 6.
      They have never been run.
- [ ] **Confirm the retention job.** Watch `/api/cron/retention` run once and
      check the numbers in the response. It deletes files.
- [ ] **Decide on HSTS preload.** `next.config.ts` sends
      `Strict-Transport-Security` with `preload`. Submitting the domain to the
      preload list is a months-long commitment for every subdomain. Drop the
      directive if anything on a subdomain may ever need plain HTTP.
- [ ] **Change the seeded join code** if you ran step 12, and delete the sample
      incidents.

---

## Troubleshooting

**`Error: P1001: Can't reach database server`**
The connection string still has `[YOUR-PASSWORD]` in it, or the project is
paused. Free Supabase projects pause after a week of inactivity — open the
dashboard to wake it.

**`prisma migrate dev` hangs or errors about a shadow database**
Hosted Supabase often cannot create one on the fly. Point `SHADOW_DATABASE_URL`
at a scratch database. Check you are using `DIRECT_URL` (port 5432) and not the
pooled URL — migrations cannot run through pgBouncer.

**`type "geography" does not exist`**
Step 2 was skipped. Enable PostGIS, then re-run the migration.

**Map pins are in the sea off West Africa**
Latitude and longitude are swapped somewhere, or a `lat`/`lng` pair is null and
defaulting to 0,0. Check the incident row — the geography column is derived from
those two by trigger, so the trigger is not the problem.

**Radius queries return nothing, or `function st_dwithin does not exist`**
Step 5 was skipped or was run before the migration. Re-run
`prisma/sql/postgis.sql`; it is safe to run twice.

**The app can read everything even though RLS is on**
Correct, and intended. Prisma connects as the table owner and an owner bypasses
RLS. `FORCE ROW LEVEL SECURITY` is deliberately not set — it would apply the
policies to the Prisma connection, where `auth.uid()` is NULL, and the app would
lose access to its own tables. RLS closes the `authenticated`/`anon` path: the
Supabase JS client, PostgREST, Realtime, and anything reached with a leaked anon
key. The application's own enforcement is `requireSession()`, the `villageId`
scoping and `PUBLIC_INCIDENT_SELECT`.

**Nothing is visible after a migration that added a table**
Or worse: everything is. A new table arrives with RLS **off**. Re-run
`prisma/sql/rls_policies.sql`.

**`prisma generate` output is stale on Vercel**
`postinstall` must stay in `package.json`. The generated client is gitignored
and rebuilt on every install.

**The AI pass never runs**
Check `ANTHROPIC_API_KEY` is set in the right Vercel environment. Every failure
is a 200 with `ok: false` on purpose, so the wizard shows the fallback message
rather than an error — look at the function logs for the reason code.

**"Reprocess" stops working after a few tries**
Rate limiting. Five AI passes an hour and ten reports a day, per resident. The
counters are in-process, so they reset on a cold start and are per lambda
instance — that stops a retry loop, not a distributed attacker.

**Push notifications do nothing**
With no `ONESIGNAL_*` keys, that is the supported state: the payload is logged
and `skipped: "not_configured"` is returned. With keys set, check the worker is
at `/onesignal/OneSignalSDKWorker.js` and the OneSignal dashboard's service
worker path matches (step 8). A 404 there fails silently — the page reports a
healthy init and no push ever arrives.

**The offline page appears when the site is up**
A stale service worker. DevTools → Application → Service Workers → Unregister,
then hard reload. `public/sw.js` never caches HTML, so this should only happen
if a worker from another project was registered on the same origin — `localhost`
is the usual culprit.

**Cron jobs return 401**
`CRON_SECRET` is not set in the environment the cron runs in (Production), or it
differs between Vercel and what you are sending. The routes fail closed by
design.

**The deploy is blocked on a git author**
The committer email must match a GitHub account Vercel recognises.
