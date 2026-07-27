# Setting up VillageWatch

From an empty machine to a deployed village, in thirteen steps.

Nothing in this repository has ever been run against a real database. These are
the steps that do it for the first time, in the order they have to happen —
several of them will fail if the one before was skipped, and the failures are
not always obvious. Steps 1–7 are the database and its policies; 8–11 are the
services and the deploy; 12 and 13 are optional seed data.

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
| `DATABASE_URL` | Database → Connect → Transaction pooler (**port 6543**) |
| `DIRECT_URL` | Database → Connect → **Session pooler** (**port 5432**) |
| `NEXT_PUBLIC_SUPABASE_URL` | API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | API → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | API → `service_role` — **server only, never expose** |

Both connection strings need `[YOUR-PASSWORD]` replaced with the password from
step 1. The two ports are not interchangeable: migrations cannot run through
pgBouncer, and the app should not hold a direct connection per lambda.

Take **both** from a pooler, not from the "Direct connection" tab. The direct
host `db.<ref>.supabase.co` publishes an AAAA record and no A record — it is
IPv6-only unless the project pays for the IPv4 add-on — so on an IPv4-only
network every Prisma CLI command fails with `P1001: Can't reach database
server`. The session pooler is on port 5432 and speaks session mode, so
migrations run through it fine. Its username is `postgres.<project-ref>`,
not the bare `postgres` the direct string uses.

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

## 7b. Google sign-in (optional)

Skip this and registration works exactly as before, with an email and a
password. `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` defaults to `false` and the button
is simply not rendered.

Worth turning on: Supabase requires email confirmation by default, so a
password sign-up cannot get into the app until the resident finds the email.
Google skips that entirely and hands back an address it has already verified.

**Google Cloud console** → APIs & Services → Credentials → **OAuth client ID**,
type *Web application*.

- Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
  — Supabase's callback, **not** this app's. Google talks to Supabase; Supabase
  then sends the resident to `/api/auth/callback` here. Putting our URL in
  Google's box is the usual first mistake and fails with `redirect_uri_mismatch`.
- The consent screen needs a support email and a privacy policy URL. `/privacy`
  is already written, and Google will not verify an app without it.

**Supabase dashboard** → Authentication → Providers → Google: paste the client
id and secret, enable it.

**Supabase dashboard** → Authentication → URL Configuration → Redirect URLs: add
`http://localhost:3000/api/auth/callback` and the production equivalent. A URL
that is not on this list is rejected after the resident has already consented,
which is the most confusing possible place to fail.

Then, locally and in Vercel:

```bash
NEXT_PUBLIC_GOOGLE_AUTH_ENABLED="true"
```

Check the provider is really on before trusting the button — this asks Supabase
directly, and answers without involving a browser:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/authorize?provider=google&redirect_to=http://localhost:3000/api/auth/callback"
```

`302` means enabled. `400` with `"Unsupported provider: provider is not enabled"`
means the dashboard step above has not been done.

A Google account arrives with an identity and nothing else — no village, no join
code, no acceptance of the terms — so `/api/auth/callback` sends a first-time
resident to `/welcome` to supply them, and only then is the profile row written.
`role` and `verifiedAt` are still derived on the server from a join code checked
against the database (domain rule 5); nothing in the browser can ask for them.

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

## 13. Seed the village directory (optional)

Step 12 builds one village with sample incidents in it. This builds the empty
directory a real resident picks their village out of, from the ONS **Index of
Place Names**. The two do not overlap and either can run without the other.

```bash
npm run download:ons          # writes data/ons-places.csv — 47MB, gitignored
npm run db:seed:villages      # Cambridgeshire — 270 parishes
npm run db:seed:villages:all  # every parish in England — 10,670
```

`download:ons` finds the newest release on the Open Geography Portal by itself,
so it keeps working when ONS publishes the next annual vintage. Check what you
are about to write before you write it:

```bash
npx tsx prisma/seed-villages.ts --county Norfolk --dry-run
```

Other flags: `--country Wales|Scotland` (England is the default),
`--include-localities` to add hamlets and farmsteads to the parish layer, and
`--limit n`. `npx tsx prisma/seed-villages.ts --help` lists them all.

**Villages land as `PENDING` with no join code.** That status renders as
"Pending approval" and it is what keeps a seeded village dormant — a directory
entry becomes a real village when a coordinator claims it, which is a status
change and a join code, and the seed does neither. Re-running is safe: new
slugs are inserted, villages still at `PENDING` have their ONS fields refreshed
if the next release moved or renamed them, and **anything no longer `PENDING`
is left completely alone**, including a map centre a coordinator has adjusted.

### If the portal is unreachable

Some networks block `arcgis.com`, and the portal occasionally rate limits.
Either download it by hand — the instructions are in the header of
`scripts/download-ons-places.ts`, and the seed only reads the file — or seed
from the committed snapshot, which needs no network at all:

```bash
npx tsx prisma/seed-villages.ts --file data/cambridgeshire-villages.json
```

That file is 270 Cambridgeshire parishes cut from the real IPN by this same
pipeline. Regenerate it with `--json data/cambridgeshire-villages.json`.

(270 rather than 298 because a parish on a county boundary belongs to whichever
county its centre falls in, not to both. Seeding a county and then all of
England therefore never lists the same parish twice.)

### Attribution is a licence condition

The IPN is Open Government Licence v3.0 — free to use commercially, and the one
thing it asks for is an acknowledgement **wherever the data is shown**. The
wording is `ONS_ATTRIBUTION` in `src/lib/constants.ts`. Nothing renders it yet
because nothing renders the directory yet; when a village picker is built, that
goes under it.

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
- [ ] **Show the ONS attribution** if you ran step 13 and anything renders the
      village directory. `ONS_ATTRIBUTION` in `src/lib/constants.ts` is a
      condition of the Open Government Licence, not a courtesy.

---

## Troubleshooting

**`Error: P1001: Can't reach database server`**
Most often the host is `db.<ref>.supabase.co`. That name is IPv6-only — it has
an AAAA record and no A record — so it is unreachable from an IPv4-only network
however healthy the project is. Check with `nslookup db.<ref>.supabase.co`; if
the only answer is a `2a05:`/`2600:` address and `ipconfig` shows you no global
IPv6 address of your own, that is the whole fault. Use the **session pooler**
host for `DIRECT_URL` — `aws-N-<region>.pooler.supabase.com:5432`, username
`postgres.<ref>` — which is IPv4 and still session mode, so migrations run.

Failing that: the connection string still has `[YOUR-PASSWORD]` in it, or the
project is paused. Free Supabase projects pause after a week of inactivity —
open the dashboard to wake it.

**`Drift detected` naming only extensions, on a database you never touched**
`pg_stat_statements`, `pgcrypto`, `uuid-ossp` and `supabase_vault` come
pre-installed in every Supabase project. They only register as drift if
`postgresqlExtensions` is enabled in `schema.prisma` — it is deliberately not,
and must stay off. Do **not** accept the offered reset; it drops the `public`
schema and every report in it. See the Prisma 7 conventions in `CLAUDE.md`.

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

**"Continue with Google" is not on the sign-in page**
`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` is not `"true"` in that environment. It is a
`NEXT_PUBLIC_` variable, so it is inlined at build time — setting it in Vercel
needs a redeploy, and setting it locally needs the dev server restarted.

**Google sign-in returns `redirect_uri_mismatch`**
The redirect URI registered in the Google console must be Supabase's
`https://<project-ref>.supabase.co/auth/v1/callback`, not this app's
`/api/auth/callback`. See step 7b.

**Google sign-in lands back on /login saying it did not complete**
Either the provider is off in the Supabase dashboard — check with the `curl` in
step 7b — or `/api/auth/callback` is missing from Authentication → URL
Configuration → Redirect URLs for that environment.

**A resident is stuck on /welcome**
`/welcome` writes the profile row, and it needs an `ACTIVE` village to put them
in. With no villages the select is empty and the form cannot be completed — seed
one, or set an existing village's status to `ACTIVE`.
