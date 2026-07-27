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
ADMIN_EMAILS="you@example.com"                # your own sign-in address
```

`ADMIN_EMAILS` is the entire definition of "platform administrator" — the people
who can approve a resident's application to become a village coordinator, at
`/admin/coordinators`. Put **your own** sign-in address in it now. Leave it blank
and nobody is an administrator: the gate fails closed, and coordinator
applications will be accepted and sit unreviewed with nobody able to open the
queue.

`SLACK_WEBHOOK_URL` is optional and can stay blank. With no webhook the staff
alerts are written to the server console, which is what local development wants.

---

## 4. Apply the schema

`prisma/migrations/` is committed and holds **six** migrations. On a fresh
database you apply all of them; on an existing one you apply whatever is
outstanding. Either way the command is the same and it is **not**
`migrate dev` — that is for authoring a migration, and it will offer to reset a
database that has drifted.

```bash
npx prisma migrate deploy
```

### The order, and what each one is for

They apply in filename order. This is also the order to read them in if you are
working out what a database is missing.

| # | Migration | What it adds |
|---|-----------|--------------|
| 1 | `20260726161847_init` | Every table and enum. **`villages.join_code` is here**, with its `@unique` and its index — it has existed since the first migration and no later one touches it. |
| 2 | `20260727060612_whatsapp_channel` | The four `villages.whatsapp_*` columns. |
| 3 | `20260727113000_coordinator_requests` | `coordinator_requests` and its enum. |
| 4 | `20260727150000_erasure_and_rate_limits` | `incident_status.REMOVED`, `users.deleted_at`, the `rate_limit` table. |
| 5 | `20260727161500_village_auto_approve` | `villages.auto_approve`. |
| 6 | `20260727180000_village_activation` | `villages.parish_council`. |

**As of 27 July 2026, migrations 1–5 are applied to the Supabase project and
migration 6 is not.** It has never been applied anywhere. Until it runs:

- The parish council field on `/dashboard` renders as a note explaining that a
  migration has to run first, rather than failing on Save — `getVillageParishCouncil`
  reports whether the column exists as well as what is in it, precisely so the
  screen can tell "no council named" apart from "nowhere to name one".
- `/reports` falls back to the deployment-wide `DATA_CONTROLLER` constant in
  its footers.

### Village activation needs no new migration

Activating a village writes `status` and `join_code`. Both columns have existed
since migration 1. What changed in this release is *who* writes the code —
`activateVillage()` in `src/lib/village.ts`, never a human in psql — and what it
means at registration, where it is now required whenever a village has one.
Neither is a schema change, so there is nothing to migrate for it. The only
Village column that arrived with the activation work is `parish_council`, and
that is migration 6 above.

### After it runs

**Both SQL files, in this order, every time:**

```bash
psql "$DIRECT_URL" -f prisma/sql/postgis.sql        # step 5
psql "$DIRECT_URL" -f prisma/sql/rls_policies.sql  # step 6
```

`migrate deploy` alone leaves a new table with RLS **off** and every row
readable by the anon key, and it cannot recreate the GiST indexes on the
geography columns because Prisma cannot see them. Steps 5 and 6 are not
optional follow-ups; they are part of applying a migration.

### In CI

`.github/workflows/database.yml` does all three in order on a push to `main`
touching `prisma/**`, or from the Run workflow button. It has only ever run as a
no-op — the five applied migrations were applied by hand — so migration 6 will
be the first one it actually applies. Watch that run.

With no `DIRECT_URL` secret the migrate job is **skipped rather than failed**,
so a fork or a fresh clone still goes green.

### Authoring a new migration

```bash
npx prisma migrate dev --name <what_it_does>
```

Then read the generated SQL before committing it. Every migration in this
repository is hand-written or hand-checked for one reason: `migrate diff`
against this database also proposes

```sql
DROP INDEX "incidents_location_point_idx";
DROP INDEX "pattern_alerts_centroid_point_idx";
DROP INDEX "villages_boundary_idx";
```

Those are the GiST indexes created by `prisma/sql/postgis.sql`. They sit on
`Unsupported("geography(...)")` columns, so Prisma cannot see them, reads them
as drift, and offers to remove them — which would take out every radius query
the app makes. **Delete those three lines from any generated migration.**

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
It has been applied and tested against the real database — 43 assertions from
two villages, which found and closed two holes: the `public` schema had lost its
role grants to a `prisma migrate` reset, leaving every policy dormant, and
`raw_description` and `join_code` were readable through PostgREST until they
were put behind per-column grants.

**Re-test it after every migration**, and before you put real data in. Create
two villages and a user in each,
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

**Supabase dashboard** → Authentication → URL Configuration. Both fields matter,
and getting the second one wrong produces a failure that looks like a bug in
this app:

- **Site URL** — the fallback. Set it to the production origin. Leave it at
  `http://localhost:3000` and every resident who signs in from the deployed site
  is sent to their own machine after consenting.
- **Redirect URLs** — the allow list. Add every origin the button can be pressed
  from:

  ```
  http://localhost:3000/**
  https://your-production-domain/**
  https://villagewatch-*-<your-vercel-scope>.vercel.app/**
  ```

  Vercel mints a new hostname for every preview deployment, so a preview needs
  the wildcard form or it will never be on the list.

`redirect_to` is **not** checked when the flow starts. `/auth/v1/authorize`
returns a 302 to Google for any origin at all, including one that is obviously
not yours — the check happens on the way back, and a URL that is not on the list
is silently swapped for the Site URL rather than refused. So the symptom is not
an error message: it is landing somewhere else entirely, usually `localhost`,
with a valid `?code=` in the address bar.

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

### The checklist

**Every failure mode in this integration is silent.** There is no error on
screen for any of them: the page reports a healthy init, the dispatch reports a
success, and no notification arrives. Work down the list in order — each step
names the breadcrumb that proves it, and they only appear once the step before
it has passed.

Open the browser console on any signed-in page and filter on `[push`. The
server's own lines are in the Vercel function logs (or the `npm run dev`
terminal) under the same prefix.

**1. The app id reached the browser build.**

```
[push:client] SDK queued, waiting for OneSignalSDK.page.js — appId=<uuid>
```

If instead you see *"NEXT_PUBLIC_ONESIGNAL_APP_ID is not set in this build"*,
the variable is missing from the environment that **built** the bundle.
`NEXT_PUBLIC_` variables are inlined at build time, so adding it in Vercel
requires a redeploy and adding it to `.env.local` requires restarting
`npm run dev`. Setting it in the Vercel dashboard alone changes nothing until
the next build.

**2. The resident has not muted push themselves.**

```
[push:client] this resident has notifyPush off in Settings — not initialising.
```

That is `User.notifyPush`, on `/settings`. It is a preference, not a fault, and
it suppresses the SDK entirely — no init, no login, no subscription.

**3. The SDK loaded and the service worker registered.**

```
[push:client] init → serviceWorkerPath=onesignal/OneSignalSDKWorker.js scope=/onesignal/
[push:client] init ok
```

No `init ok` means the init threw — the reason is on the `[push:client] init
failed` line beside it. The usual causes are an ad blocker eating
`cdn.onesignal.com`, a browser with no service worker support (Safari in private
browsing), and **a service worker path that does not match the dashboard**.

That last one is the trap. The dashboard's *Service Workers* settings must say
path `/onesignal/` and filename `OneSignalSDKWorker.js`, matching
`SERVICE_WORKER` in `src/components/push-registration.tsx` and the file at
`public/onesignal/OneSignalSDKWorker.js`. A 404 there fails **silently** — some
SDK versions still resolve `init()`. Confirm it directly:

```bash
curl -sI https://<your-domain>/onesignal/OneSignalSDKWorker.js | head -1   # expect 200
```

And in DevTools → Application → Service Workers you should see **two**
registrations: `/` (VillageWatch's offline worker, `public/sw.js`) and
`/onesignal/`. One registration means they are fighting over the root scope,
which is the whole reason OneSignal's was moved.

**4. The device is tied to the resident.**

```
[push:client] login ok → externalId=<supabase-uid> subscriptionId=<uuid> optedIn=true
```

`externalId` is the Supabase auth user id and is what the server addresses
residents by — there are no OneSignal segments, so if this line is missing
nothing on the server can ever find this device. `subscriptionId=(none yet)` is
normal *before* permission is granted; after step 5 it must be a uuid. Paste it
into OneSignal → **Audience → Subscriptions** and you should find this browser,
with the external id attached.

**5. Permission was actually granted.**

```
[push:client] permission=default sdkPermission=false bannerDismissed=false → prompt=true
[push:client] permission answered → granted=true subscriptionId=<uuid>
```

The banner is VillageWatch's own; the browser prompt only fires from its "Turn
on alerts" click handler. **Leave auto-prompting off in the OneSignal
dashboard** — it overrides this and asks on arrival, which is how Chrome
permanently blocks an origin and how Safari refuses the call outright.

`permission=denied` cannot be undone from the page. The resident has to clear it
in browser site settings; a second click does nothing and Chrome will not ask
again for that origin.

**6. The server tried to send.**

```
[push:dispatch] app=<uuid> village=<id> aliases=3 title=🔴 High alert url=https://…/incidents/…
```

No line at all means nothing called into `src/lib/notifications.ts` — check the
report actually reached `PUBLISHED`, since alerts fire on publish and never on
file (domain rule 6). A `[push:config]` warning at boot names the missing
variable instead:

- *"Push is off — appId=MISSING restApiKey=set"* — set `ONESIGNAL_APP_ID`.
- *"ONESIGNAL_APP_ID is not set; falling back to NEXT_PUBLIC_…"* — works, but
  set both.
- *"…name different apps"* — the broken one. Devices subscribe to the browser's
  app id and the server pushes to the other, so nothing can ever be delivered.

**7. OneSignal accepted it.**

```
[push:response] village=<id> notificationId=<uuid> sent=3/3
```

`sent=0/3 error=All included players are not subscribed` is the common one and
means exactly what it says: none of those external ids has a subscribed device.
Re-check step 4 — it is also what a **wrong app id** looks like, because the
aliases were registered against a different app.

`noSubscription=2` is a partial: two of the residents in the audience have a
profile and a notification preference and no device. That is the normal state
for anyone who has not pressed "Turn on alerts", and only those two get a
`Notification` row marked failed.

A thrown error (`[push:error]`) is a non-2xx from OneSignal and is always
configuration: **401** is a bad `ONESIGNAL_REST_API_KEY`, **403** is a key that
does not own that app id, **400** is a malformed payload.

### What the server sends, and why it looks like that

`src/lib/notifications.ts` is the only thing that sends. It targets
`include_aliases: { external_id: [...] }` with `target_channel: "push"` —
never a segment, because the audience is village membership plus each
resident's own preferences plus distance from their home location, and all
three live in the database rather than in a dashboard nobody reviews.

Authentication is the v5 REST scheme, `Authorization: Key <REST_API_KEY>`,
applied by `@onesignal/node-onesignal` — there is no hand-rolled `fetch` and no
endpoint to get wrong.

Only public columns go into a payload. A notification lands on a lock screen,
which is the least private surface in the app, so `rawDescription` never reaches
this module at all (domain rule 1).

---

## 8b. WhatsApp Channel (optional, one per village)

**Every village gets its own channel.** This is not a deployment-wide setting
and there is no environment variable naming a channel — one VillageWatch
instance serves many villages, each with its own residents, its own invite link
and its own feed. A coordinator sets theirs up on **/dashboard → Village
settings → WhatsApp Channel**, and it is stored on that village's row
(`whatsapp_channel_url`, `whatsapp_channel_id`, `whatsapp_enabled`,
`whatsapp_min_severity`). A neighbouring parish on the same deployment sets up
its own, separately, and neither can see or change the other's.

Skip the whole section and everything still works. This is the only surface in
VillageWatch that discloses outside the village, so it is off until somebody
turns it on.

### The half that needs nothing (most villages want only this)

1. In WhatsApp: **Updates → + → New channel**. Name it after the village.
2. **Copy link** on the channel gives a public invite link.
3. Sign in as that village's coordinator → **/dashboard** → **WhatsApp
   Channel** → paste it into the one field → save. The channel code the posting
   half needs is read out of the link; there is nothing else to enter.

Every resident of that village now sees a **Follow on WhatsApp** button on
their `/settings` page. Villages that have not set one up see *"WhatsApp
Channel not set up yet"* instead, and their coordinator sees a way through to
the form. No credentials, no API, nothing to break. The coordinator posts to
the channel by hand from WhatsApp.

### The half you do by hand (posting the alerts)

**There is no relay, and there is not going to be one.** Meta's WhatsApp Cloud
API sends messages to phone numbers. It has **no endpoint that posts to a
Channel** — Channels are a broadcast surface Meta expects a human to post to
from the app. Third-party relays (Whapi and similar) do offer channel posting by
driving the WhatsApp Web protocol; they work, and they can breach WhatsApp's
terms and get the number behind them banned.

So VillageWatch does not try. `WHATSAPP_CHANNEL_API_URL` and
`WHATSAPP_CHANNEL_API_TOKEN` are **gone** — if they are still in your
environment, delete them; nothing reads them. What a coordinator gets instead:

- **Approving a report** on `/dashboard` shows the alert straight away, with
  **📋 Copy alert** and **💬 Open WhatsApp** underneath it. Copy, open the
  channel, paste.
- **Any published report's own page** shows the same panel, for coordinators
  only, for as long as the report exists — so an alert can be posted later, or
  posted again.
- **A report filed by a coordinator in an auto-approving village** ends on a
  success screen carrying the same two buttons, because it went live on submit
  and there was no approval step to catch it.

Every one of those renders the same text, built by `formatIncidentAlert` in
`src/lib/format-alert.ts`, and the server writes that identical text to its log
on publish — so "what went to the channel?" is answerable from a Vercel log.

**There is nothing more to paste in.** The channel code is the last segment of
the invite link, so the app reads it out of what the coordinator already entered
and shows it back under the field ("Channel code: `0029Va…` extracted"). Only
two switches remain on the same dashboard form:

- **Prepare published alerts for the channel** — off by default. This is the
  switch that says this village's alerts are meant for an audience wider than
  "signed-in residents of this village".
- **Prepare an alert for anything at or above** — defaults to **High**,
  deliberately stricter than the push default of Low. A missing cat does not
  belong on a public feed.

Neither switch gates the copy button on a report you have just approved: that
text goes to one coordinator's clipboard, and what they do with it is their
call. What the switches gate is the server-side log line.

**Post to a test channel first and read what actually lands.** This is the one
feature whose output an unauthenticated stranger can read. An alert carries a
headline, the area, the time, a short anonymised description and a link back
into the app — never the reporter's name, their original wording, or the exact
coordinates. Changing what an alert contains changes `/privacy` §6 and the
landing-page FAQ in the same commit.

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
with three changes:

- `NEXT_PUBLIC_APP_URL` becomes the real domain. Push deep links and email links
  are built from it; left as `localhost` every notification points at a machine
  that is not the reader's.
- `CRON_SECRET` must be set here, in Production. **Both scheduled routes refuse
  every request without it** — deliberately, because one spends Anthropic credit
  and pushes to coordinators' phones and the other deletes files and takes
  reports off the map.
- `ADMIN_EMAILS` becomes the real administrators, not your local test address.
  It is a credential in everything but name: anyone on that list can grant
  somebody the ability to read the original, un-anonymised wording of every
  report their village files. Changing it takes effect on the next deploy.

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

### Taking it back out again — run this before going live

The five incidents are invented crimes with invented names and registrations in
them, and the village is called `[Your Village]` and sits in a field in
Leicestershire. None of that should be in front of a real resident.
`scripts/clean-seed-data.ts` removes it.

```bash
npm run db:clean-seed                    # dry run — prints, changes nothing
npm run db:clean-seed -- --confirm       # actually delete it
npm run db:clean-seed -- --confirm --deactivate   # …and take the village out of the pickers
```

**It is a dry run by default.** Read the report first: it lists every incident,
pattern alert and profile it would delete, and everything in the sample village
it is leaving alone and why.

What it targets is deliberately narrow — the five sample incidents matched by
their own hardcoded titles, the one pattern alert with `detector = "seed"`, and
the sample coordinator profile. Three things it will not do:

- **It only ever touches the village with slug `your-village`.** That slug is
  what `prisma/seed.ts` hardcodes, and there is no flag or variable that can
  point the script at another village. Against a database that was never seeded
  it finds nothing and exits.
- **It never deletes a profile that has a Supabase Auth account behind it**, so
  a real coordinator who joined the sample village during testing survives. That
  check needs `SUPABASE_SERVICE_ROLE_KEY`; without it **no** profile is deleted
  and the script says so. `SEED_ADMIN_USER_ID`, if set, is protected outright.
- **It never deletes an incident that has media attached.** The seed attaches
  none, so one that has some was filed through the wizard whatever its title
  says — and deleting the row would orphan the file in the bucket forever
  (`src/lib/erasure.ts` explains the ordering). Those are reported and skipped.

Two consequences worth reading before you run it with `--confirm`:

- **Audit trail rows are not deleted and cannot be.** The trail is append-only
  and the database trigger rejects a DELETE from everyone including the table
  owner (domain rule 7). Rows written while you were testing moderation will
  name incident ids that no longer resolve. The report counts them for you. That
  is the right way round — a trail with a gap in it would be worse.
- **The village row itself is never deleted either**, because `AuditLog`
  references it and that foreign key is `ON DELETE SET NULL`, which the same
  trigger refuses. `--deactivate` sets its status to `ARCHIVED` instead, which
  is what takes `[Your Village]` out of the picker on `/register` and
  `/welcome`.

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
- [ ] **Complete and sign the DPIA.** `docs/DPIA.md` is written and is a
      template — the council is the data controller and Article 35 puts the duty
      on the controller, not on us. Its §9 carries five blockers that are
      documents the council must produce: an Appropriate Policy Document for
      criminal offence data, an Article 28 agreement with the processor,
      coordinator moderation guidance, the real controller details, and a breach
      notification procedure.
- [ ] **Re-test the RLS policies with the anon key after migration 6.** They
      have been applied and tested from two villages — 43 assertions, two holes
      found and closed — but the `villages` SELECT grant is enumerated per
      column, so every new column needs the file re-run. See step 6.
- [ ] **Confirm the retention job.** Watch `/api/cron/retention` run once and
      check the numbers in the response. It deletes files.
- [ ] **Decide on HSTS preload.** `next.config.ts` sends
      `Strict-Transport-Security` with `preload`. Submitting the domain to the
      preload list is a months-long commitment for every subdomain. Drop the
      directive if anything on a subdomain may ever need plain HTTP.
- [ ] **Post to a test WhatsApp Channel first** if any village has switched
      posting on in step 8b, and read what lands. It is the only output an
      unauthenticated stranger can read, and a post cannot be un-forwarded.
- [ ] **Clear the sample data** if you ran step 12. `npm run db:clean-seed`
      prints what it would remove; `-- --confirm --deactivate` removes it and
      takes `[Your Village]` out of the village pickers. The five seeded reports
      are invented crimes with invented names and registrations in them. Change
      the seeded join code too if you keep the village for anything.
- [ ] **Deliver one push to a real device.** No notification has ever arrived
      from this deployment. Every failure mode in that integration is silent —
      work down the checklist in step 8, which names the console breadcrumb that
      proves each stage.
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
counters are rows in the `rate_limit` table, keyed by Supabase auth user id and
by a window aligned to the clock, so they are shared across lambda instances and
survive a cold start. It fails open: a database error is logged and the request
is allowed, because being rate limited must never block filing a report.

**Push notifications do nothing**
With no `ONESIGNAL_*` keys, that is the supported state: the payload is logged
and `skipped: "not_configured"` is returned. With keys set, work down **the
checklist in step 8** — every failure mode here is silent, and each step names
the console breadcrumb that proves it. The two that catch people are a service
worker path that does not match the OneSignal dashboard (a 404 there reports a
healthy init) and `NEXT_PUBLIC_ONESIGNAL_APP_ID` missing from the environment
that *built* the bundle rather than the one running it.

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

**Google sign-in sends me to localhost from the deployed site**
The origin you signed in from is not on the Redirect URLs allow list, so
Supabase fell back to the **Site URL** — and that is still
`http://localhost:3000`. Nothing is wrong with the app: the button builds its
callback from `window.location.origin`, so it asked for the right one.

The confusing part is that nothing rejects it up front. `redirect_to` is not
validated when the flow starts — this returns 302 to Google for an origin that
could not possibly be yours:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/authorize?provider=google&redirect_to=https://definitely-not-allowed.example.com/api/auth/callback"
```

Fix both fields in step 7b: point Site URL at production, and add every origin —
including a wildcard for Vercel preview hostnames, which change on every
deployment.

**A resident is stuck on /welcome**
`/welcome` writes the profile row, and it needs an `ACTIVE` village to put them
in. With no villages the select is empty and the form cannot be completed — seed
one, or set an existing village's status to `ACTIVE`.
