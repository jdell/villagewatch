# VillageWatch — application security audit

**Audited:** 29 August 2026 against `main` at `v0.1.48`.
**Method:** manual source review of the whole working tree, plus `npm audit`
against the committed lockfile. No dynamic testing, no authenticated scanning,
and no access to the Supabase, Vercel, OneSignal or Resend dashboards.
**Scope:** the six domains in the brief — Next.js and Vercel, Supabase Auth,
database and row-level security, UK GDPR, the four integrations, and the supply
chain.

**This document is read by people and rendered by nothing.** Like
`LAUNCH_BLOCKERS.md` and `E2E_VERIFICATION.md`, and unlike the five documents
the app renders from disk, it needs **no** `outputFileTracingIncludes` entry in
`next.config.ts`.

**Line numbers are as at `v0.1.48`.** Treat them as a record of what was read
rather than as a way to find it later — `E2E_VERIFICATION.md` learned that the
hard way and says so at its head.

Findings are numbered `VW-01` to `VW-34` so they can be named in a commit
message or an issue. Where a finding is already tracked in `LAUNCH_BLOCKERS.md`
or `BACKLOG.md`, that is said rather than restated.

---

## Summary

Thirty-four findings. **Nothing is rated Critical**, and nothing found is a
remote unauthenticated compromise.

| Severity | Count | Meaning here |
|---|---|---|
| Critical | 0 | None found |
| High | 4 | Fix before the pilot |
| Medium | 16 | Fix this quarter |
| Low | 10 | Schedule |
| Informational | 4 | Verify against a dashboard; no code change |

| Domain | High | Med | Low | Info | Total |
|---|---|---|---|---|---|
| 1 · Next.js and Vercel | 2 | 3 | 2 | 1 | 8 |
| 2 · Supabase Auth | 0 | 3 | 2 | 0 | 5 |
| 3 · Database and RLS | 1 | 3 | 0 | 1 | 5 |
| 4 · Data privacy and UK GDPR | 1 | 3 | 2 | 0 | 6 |
| 5 · Integration security | 0 | 2 | 2 | 1 | 5 |
| 6 · Supply chain and CI/CD | 0 | 2 | 2 | 1 | 5 |
| **All** | **4** | **16** | **10** | **4** | **34** |

### The four highs

| # | Finding |
|---|---|
| **VW-14** | Any resident can write permanent, forged rows into `audit_logs` through PostgREST |
| **VW-01** | Supabase session cookies are set without `HttpOnly` or `Secure`, and live 400 days |
| **VW-02** | No Content-Security-Policy, on pages that load two third-party script origins |
| **VW-19** | The privacy notice names no data controller and no ICO registration, on a live service |

### What the findings have in common

This is a carefully built codebase. The tenant boundary is enforced
consistently, every server action re-establishes authorisation server-side, the
raw reporter wording is structurally unreachable from public read paths, and
`prisma/sql/rls_policies.sql` is better reasoned than most production RLS files.

What the findings cluster around instead is **trust placed in the client** — the
upload route believes the browser about a photograph, the audit trail accepts
rows written directly by residents, the session cookie is readable by any script
on the page — and **controls deferred on purpose that are now overdue**: the CSP,
and the controller details.

**Severity is calibrated to this product, not to a generic web app.** An incident
report names a resident's neighbours, and the membership list is itself sensitive
— it says who reports on whom. So account enumeration, audit-trail integrity and
push mis-delivery are rated higher here than they would be on a shop.

---

## 1. Next.js and Vercel

Server and client boundaries, route authentication, input validation, upload
handling and response headers. The header set in `next.config.ts` is
comprehensive and the tenant scoping is consistent; the gaps are the deferred
CSP, the cookie flags, and everything the media pipeline takes on trust.

### VW-01 — Session cookies are set without `HttpOnly` or `Secure`, and live for 400 days

**Severity:** High · **Status:** needs fixing
**Affects:** `src/lib/supabase/server.ts`, `src/proxy.ts`

Neither `createServerClient` call passes a `cookieOptions` object, so
`@supabase/ssr` applies its own defaults —
`{ path: "/", sameSite: "lax", httpOnly: false, maxAge: 400 days }`, verified in
`node_modules/@supabase/ssr/dist/main/utils/constants.js` and applied at
`cookies.js:203`. The access token *and* the refresh token are therefore
readable by any JavaScript running on the page.

That matters more here than on a typical app, because two third-party scripts
already run on authenticated pages: the OneSignal SDK from `cdn.onesignal.com`
(`push-registration.tsx:252`) and the MediaPipe WASM runtime from
`cdn.jsdelivr.net`. A compromise of either — or any XSS anywhere in the app —
becomes a refresh-token theft with a 400-day life, not a session hijack that
ends at the tab.

**Why this is safe to fix here.** The usual objection is that the browser client
needs to read the cookie. It does not, in this codebase.
`src/lib/supabase/client.ts` has exactly two call sites — `google-button.tsx`
(`signInWithOAuth`) and `forgot-password-form.tsx` (`resetPasswordForEmail`) —
and neither reads an existing session. The PKCE verifier is written by the
browser through `document.cookie` and is unaffected by the flag;
`PushRegistration` already receives `userId` as a server-rendered prop.

```ts
// src/lib/supabase/server.ts — and the identical block in src/proxy.ts
return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  },
  cookies: { /* unchanged */ },
});
```

After the change, walk both browser-client flows once: Google sign-in end to
end, and a password reset link. Consider shortening the refresh window in the
Supabase dashboard as well — 400 days is the library's ceiling, not a decision
anybody made about coordinators.

### VW-02 — No Content-Security-Policy

**Severity:** High · **Status:** known, deliberately deferred
**Affects:** `next.config.ts`, `src/proxy.ts`

The absence is deliberate and documented — a working CSP needs a per-request
nonce, which means `proxy.ts` rather than a static header list. That reasoning
is right, and it has now been the reasoning for long enough that the deferral is
itself the risk. With VW-01 open, a CSP is the only thing standing between an
injected script and a resident's refresh token.

```ts
// src/proxy.ts, inside proxy() before the Supabase client is built
const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://cdn.onesignal.com`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' blob: data: https://*.supabase.co https://*.tile.openstreetmap.org`,
  `connect-src 'self' https://*.supabase.co https://*.onesignal.com https://cdn.jsdelivr.net https://storage.googleapis.com`,
  `worker-src 'self'`,
  `font-src 'self'`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
  `upgrade-insecure-requests`,
].join("; ");

request.headers.set("x-nonce", nonce);
response.headers.set("Content-Security-Policy", csp);
```

Ship it as `Content-Security-Policy-Report-Only` for a fortnight first. The two
things that will violate it are the Leaflet tile layer and the OneSignal SDK's
own injected script — both are in the list above, and report mode is how you
find the third one. Copying the MediaPipe WASM and the BlazeFace model into
`public/` (already documented in `.env.example`) removes two origins from
`connect-src` outright. See VW-28.

### VW-03 — The upload route believes the browser about content type and about redaction

**Severity:** Medium · **Status:** needs fixing
**Affects:** `src/app/api/incidents/media/route.ts`, `src/app/api/incidents/route.ts:395`

`baseMimeType(file.type)` reads the `Content-Type` the browser wrote into the
multipart part. It is entirely attacker-controlled, there is no magic-byte
check, and the same value is handed straight to Supabase as the stored object's
content type. A modified client can put arbitrary bytes into a village's bucket
under an attacker-chosen type.

The sharper half is the privacy claim. `POST /api/incidents` writes
`redactedAt: new Date()` and `exifStripped: true` unconditionally, on the
strength of the upload having happened. A client that skips `blurFaces()`
uploads an untouched original — faces intact, EXIF GPS intact — and every
surface in the app then serves it as the redacted variant. `/privacy` states
that faces are covered on-device and that EXIF including GPS is gone; today that
is a statement about the shipped browser code, not about the system.

**This is not the server-side fallback CLAUDE.md forbids.** The rule is that the
server must never accept an unblurred original *as acceptable* by blurring it
itself. Sniffing the container and re-encoding to drop metadata is hygiene on
something already claimed to be redacted, and it makes the `exifStripped` column
true rather than hopeful.

```ts
// Trust the bytes, not the header.
const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
const sniffed =
  head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff ? "image/jpeg" :
  head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70 ? "video/mp4" :
  head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3 ? "video/webm" :
  null;

// - const mimeType = baseMimeType(file.type);
const mimeType = sniffed;
if (!mimeType || baseMimeType(file.type) !== mimeType) {
  return NextResponse.json(
    { error: "Only blurred JPEG, MP4 and WebM output can be uploaded" },
    { status: 415 },
  );
}
```

Then either strip the JPEG APPn/EXIF segments server-side before
`storage.upload`, or change `exifStripped` to record what was actually verified.
Leaving the column asserting something nobody checked is the part that turns a
hardening gap into a false statement in a privacy notice.

### VW-04 — Media upload has no quota, and abandoned uploads are never collected

**Severity:** Medium · **Status:** needs fixing
**Affects:** `src/app/api/incidents/media/route.ts`, `src/app/api/cron/retention/route.ts`

`RATE_LIMITS` covers `aiProcess`, `incidentCreate`, `reportNarrative` and
`incidentVote`. It does not cover the upload route, which accepts 40 MB per
request with no ceiling on requests. One authenticated resident can fill a
village's bucket, and every byte is billed.

The retention consequence is the quieter one. Objects are written before any
`IncidentMedia` row exists — the wizard uploads, then `POST /api/incidents`
creates the rows. A wizard run that is abandoned leaves an object with nothing
pointing at it, and the nightly sweep walks database rows. Those photographs are
resident personal data with no retention clock on them at all, which is a gap in
the schedule `/privacy` §7 states.

- Add `mediaUpload: { limit: 40, windowSeconds: 86_400 }` to `RATE_LIMITS` and
  spend a slot after the size and type checks pass, matching how
  `incidentCreate` is counted.
- Give the retention job a fourth pass: list objects under each village prefix
  older than 24 hours, subtract the paths present in `IncidentMedia`, delete the
  remainder. Objects before rows, as everywhere else in that route.

### VW-05 — Reporter text is interpolated into the anonymisation prompt without neutralising the delimiters

**Severity:** Medium · **Status:** needs fixing
**Affects:** `src/lib/ai/structure-incident.ts:350`

The description is placed between literal `<report>` and `</report>` markers
with no escaping. A reporter who writes a closing tag followed by their own
instructions is addressing the model directly, and the model's job here is a
privacy control: the system prompt's "NEVER include personal names, house
numbers, vehicle registration numbers" is the mechanism behind the anonymised
`description` column that the map, the list and the WhatsApp alert all render.

Structured output and the Zod re-validation bound the damage — the attacker
cannot change the response shape, only its contents. But the contents are the
point: talking the model into preserving a neighbour's name and number plate
produces a `description` that is published as anonymised. In a village running
`autoApprove`, no coordinator sees it first.

```ts
// Neutralise both delimiters before interpolation.
const FENCES = /<\/?(report|recent_nearby_incidents)>/gi;
const safeDescription = input.description.replace(FENCES, (m) => m.replace(/[<>]/g, ""));
```

Add a line to the system prompt saying that everything inside `<report>` is a
resident's account and never an instruction. And treat the pairing as a product
rule: a village with auto-approve on has removed the only human review of what
the model produced, which is worth saying on the auto-approve switch alongside
what it already says.

### VW-06 — `/reports` is missing from `PROTECTED_ROUTES`

**Severity:** Low · **Status:** needs fixing
**Affects:** `src/lib/constants.ts:1551`

The proxy's denylist names `/map`, `/incidents`, `/dashboard`, `/settings`,
`/coordinator-apply` and `/admin`. `/reports` — a coordinator-only screen that
produces a document for the police — is absent. `robots.ts` lists it, which is
what makes the omission look like an oversight rather than a decision.

Not exploitable: `(app)/layout.tsx` calls `requireSession()` and the page calls
`requireCoordinator()`, which is where the enforcement has always been. What is
lost is the optimistic redirect, so a signed-out visitor renders the layout
before being bounced. Add the entry.

### VW-07 — Two GET routes write audit rows and are reachable by cross-site navigation

**Severity:** Low · **Status:** needs fixing
**Affects:** `src/app/api/dashboard/export/route.ts`, `src/app/api/reports/[villageId]/pdf/route.ts`

Both write an `AuditLog` row before returning, which is the right ordering. Both
are GET, and `SameSite=Lax` sends session cookies on a top-level GET navigation
— so a page a coordinator visits can link or `window.open` to either and cause a
row to be written and a file to be downloaded.

The response cannot be read cross-origin, so this is not exfiltration. What it
is, is a way to write entries into a table that the `audit_logs_append_only`
trigger makes undeletable — noise in the one record that is supposed to be the
accountability answer.

```ts
const site = request.headers.get("sec-fetch-site");
if (site && site !== "same-origin" && site !== "none") {
  return NextResponse.json({ error: "Not allowed" }, { status: 403 });
}
```

The same header check is worth applying to the JSON `POST` routes. They are
currently protected from cross-site submission only by the cookie's
`SameSite=Lax` default — `request.json()` parses a body regardless of its
declared content type, so a `text/plain` form post is otherwise well formed.
Making the protection explicit means it survives anyone setting
`sameSite: "none"` later.

### VW-08 — Vercel deployment protection and environment scoping cannot be verified from the repository

**Severity:** Informational · **Status:** verify
**Affects:** Vercel project settings

There is no staging Supabase project (stated in `database.yml`), so any preview
deployment that inherits production environment variables is a second,
unauthenticated-by-default front door to the production database. Three things
to confirm in the dashboard:

- **Deployment Protection** is on for Preview and Branch deployments — Vercel
  Authentication at minimum, so preview URLs are not publicly reachable.
- **Environment variable scope.** `DATABASE_URL`, `DIRECT_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY`,
  `RESEND_API_KEY` and `ONESIGNAL_REST_API_KEY` should be Production-only, not
  "All Environments".
- **Three crons are declared in `vercel.json`** and the Hobby plan allows two. If
  this project is on Hobby, one is silently not running — most likely the newest,
  `/api/cron/police-data`. Confirm on the plan and in the cron log. CLAUDE.md
  already flags this under "Official police data"; it is repeated here because it
  is a deployment fact rather than a code one.

### Confirmed sound in this domain

- Header set in `next.config.ts`: HSTS with preload, `X-Frame-Options: DENY`,
  nosniff, COOP, CORP, a tight Permissions-Policy, `poweredByHeader: false`.
- `Cache-Control: no-store` on all of `/api` — the CSV export cannot be served
  from an edge cache to the next caller.
- Every server action re-establishes authorisation server-side (`requireAdmin` /
  `requireCoordinator` / `requireSession`) and parses input with Zod. All eight
  were checked.
- Tenant scoping is consistent: `villageId` always from the session profile,
  never from a body or a path. The PDF route compares the path segment and 403s
  rather than ignoring it.
- `PUBLIC_INCIDENT_SELECT` omits `rawDescription` and `reporterId` entirely.
- The media path prefix re-check in `POST /api/incidents` stops one resident
  attaching another's upload.
- One `dangerouslySetInnerHTML`, on JSON-LD, with `<` escaped. Compliance
  documents render through a typed Markdown tree.
- Both raw SQL sites use Prisma tagged templates — parameterised, not
  interpolated.
- Every `target="_blank"` carries `rel="noopener noreferrer"`.
- Zod caps the length of every free-text field; `safeNext()` in the OAuth
  callback rejects protocol-relative values and the redirect is built on a cloned
  same-origin URL, so the target cannot leave the origin even if the check were
  bypassed.

---

## 2. Supabase authentication

Both flows are carefully built. `getSession()` uses `auth.getUser()` so the JWT
is revalidated rather than trusted, the closed-account gate is applied at all
three entry points, and no provider error message ever reaches a resident. The
findings are about what happens *before* authentication succeeds.

### VW-09 — Registration discloses whether an email address already has an account

**Severity:** Medium · **Status:** needs fixing
**Affects:** `src/app/api/auth/register/route.ts:112`

The route inspects Supabase's error for `"already registered"` and answers
`400 { error: "An account with that email already exists", fieldErrors: { email:
"Try signing in instead" } }`. That is an unauthenticated, unrate-limited
membership oracle.

It directly contradicts the reasoning applied two files away. `/forgot-password`
goes to considerable trouble not to reveal the same fact — `isEmailQuotaError`
exists specifically so the per-address rate limit cannot leak it — on the
grounds, correct in this product, that the membership list says who reports on
their neighbours. The registration form gives the answer away directly.

Return the same neutral response for a taken address as for a new one, and let
Supabase's confirmation email carry the distinction to the mailbox owner. Turn on
**Prevent enumeration** (obfuscation) in the Supabase Auth dashboard so `signUp`
stops reporting it at all, and drop the branch:

```ts
// The address either gets a confirmation link or a "you already have an account"
// email. Both land in the same inbox; neither lands on the screen.
// - const alreadyRegistered = error?.message?.toLowerCase().includes("already registered");
// - if (alreadyRegistered) { /* 400 naming the address */ }
```

Same treatment for `POST /api/auth/complete-profile`: a P2002 there currently
surfaces as a generic 500, which is already neutral, but it should be a
deliberate 409 with wording that names nothing.

### VW-10 — No application-layer rate limit on any pre-authentication endpoint

**Severity:** Medium · **Status:** needs fixing
**Affects:** `src/lib/rate-limit.ts`, `src/app/api/auth/*`

`rateLimit()` keys on the Supabase auth user id, deliberately and for a good
reason — a village shares a broadband line, so an IP limit would silence a
household. The consequence is that `/api/auth/login`, `/api/auth/register` and
`/api/auth/complete-profile` have no limiter at all, because there is no user id
yet. Everything rests on Supabase's own per-project limits, which this
deployment has already exhausted once for email.

Two concrete exposures. Password spraying against `signInWithPassword`, where
the app's own response distinguishes 401 from 429 and so tells an attacker
exactly when to back off. And join-code guessing: `checkVillageJoin` is called
before `signUp`, so registration is a free oracle for a village's code. Eight
characters from a 31-symbol alphabet is ~39.6 bits and not practically
brute-forceable over HTTP — but the endpoint that would tell you is unmetered,
and the codes are printed on posters.

A narrow exception rather than a reversal of the no-IP-keying rule:

- Enable **Vercel WAF rate limiting** on `/api/auth/*`. It is edge-side, needs no
  schema change, and does not put the household problem inside the application.
- Where an application-layer counter is wanted, key it on *the email address
  being attempted* rather than on the IP — that limits an attack on one account
  without limiting a household, and `rate_limit.user_id` is already a bare `TEXT`
  column with no foreign key.
- Add a separate failure counter for wrong join codes per village, and alert on
  it: a code being guessed at is a village whose poster should be rotated with
  `regenerateJoinCode()`.

### VW-11 — A password reset does not demonstrably revoke the attacker's other sessions

**Severity:** Medium · **Status:** verify, then fix
**Affects:** `src/app/api/auth/reset-password/route.ts:63`

The route calls `supabase.auth.updateUser({ password })` and returns. Whether
sibling refresh tokens are revoked depends on a project setting, not on this
code — and reset is the control a resident reaches for precisely when they
believe someone else is in the account. If the other sessions survive, the reset
achieves nothing against the case it exists for. Combined with VW-01's 400-day
refresh cookie, the stolen session outlives the remedy.

```ts
const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
if (!error) {
  // Everything but this browser. The recovery link authenticated this one.
  await supabase.auth.signOut({ scope: "others" });
}
```

And confirm in Authentication → Settings that reauthentication is required for a
password change from a live session, so an already-hijacked session cannot lock
the owner out.

### VW-12 — No absolute session lifetime, and coordinators hold the widest read in the product

**Severity:** Low · **Status:** needs fixing
**Affects:** Supabase Auth settings

A coordinator can read every resident's verbatim report wording, reveal email
addresses one at a time and export the village to CSV. There is no inactivity
timeout and no absolute session cap, so a coordinator's device stays authorised
until they sign out. Set a refresh-token inactivity timeout in the Supabase
dashboard and consider a shorter absolute lifetime for accounts holding
`COORDINATOR_ROLES`.

### VW-13 — The join code is compared with `!==`

**Severity:** Low · **Status:** optional
**Affects:** `src/lib/villages.ts:548`

`supplied !== normalizeJoinCode(village.joinCode)` short-circuits on the first
differing character. The code is a shared secret handed out on a poster, and
network jitter swamps the signal at this length, so the practical risk is small —
but `src/lib/cron.ts` already models the fix for exactly this shape of
comparison. Use `timingSafeEqual` over equal-length buffers, or accept it
explicitly with a comment so the next reader knows it was considered.

### Confirmed sound in this domain

- `getSession()` revalidates the JWT with `auth.getUser()` rather than trusting
  the cookie, and is wrapped in React `cache`.
- The closed-account gate (`deletedAt`) is applied at all three entry points —
  password login, OAuth callback and the app layout — and checked *before* the
  missing-profile branch, so a closed account cannot be sent to `/welcome` and
  rejoin.
- `describeAuthError` is a real boundary: no Supabase wording reaches a resident
  from any flow, rate limits are recognised three ways, and `/forgot-password`
  uses the narrower quota test so it cannot become an enumeration oracle.
- `safeNext()` rejects non-relative and protocol-relative values; the redirect is
  built from a cloned same-origin URL.
- Logout is POST-only with a 303.
- Reset carries no identifier in the body — the session decides whose password
  changes — and the session check precedes body validation, so an unauthenticated
  caller gets 401 rather than the password rules.
- `useAuthSubmit`'s ref-based lock is a genuine double-submit guard, not a
  disabled attribute.
- Passwords are floored at 10 characters, above the Supabase default of 6.
- Role, village and verification are derived server-side from `checkVillageJoin`
  on both registration paths — no client payload can set them (domain rule 5).

---

## 3. Database and row-level security

`prisma/sql/rls_policies.sql` is 1,197 lines and among the better RLS files I
have read: per-column SELECT grants rather than table-wide ones, definer helpers
with `search_path` pinned empty, `anon` stripped of schema USAGE, and two
triggers doing what a policy cannot. The findings below are the four seams in
it, and one of them is a real hole.

### VW-14 — Any resident can write permanent, forged rows into the audit trail

**Severity:** High · **Status:** needs fixing
**Affects:** `prisma/sql/rls_policies.sql:1019`, `:1041`

`GRANT SELECT, INSERT ON public.audit_logs TO authenticated`, with
`audit_logs_insert_self` checking one thing:

```sql
CREATE POLICY audit_logs_insert_self
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = (SELECT auth.uid()));
```

The policy's own comment says it stops "a client forging a trail naming somebody
else". It does not. `actor_email` and `actor_role` are denormalised columns —
deliberately, so the trail survives an account deletion — and the policy
constrains neither. Nor does it constrain `village_id`, `action`, `entity_type`,
`entity_id`, or the `before`/`after` JSON.

So any resident holding the public anon key and their own session can
`POST /rest/v1/audit_logs` with `actor_id` set to themselves and every other
column set to anything: a coordinator's email in `actor_email`,
`actor_role: 'COORDINATOR'`, `action: 'incident.raw_viewed'`, another village's
id. The audit viewer falls back to `actorEmail` when rendering, which is exactly
the column that is unconstrained.

And it cannot be undone. `vw_audit_logs_append_only()` rejects every DELETE
**including from the table owner** — that is what makes domain rule 7 real — so
cleaning up forged rows means a DBA disabling a trigger under an ACCESS
EXCLUSIVE lock on the accountability record. Unbounded insert into an
undeletable table is also a storage flood with no application-side ceiling.

**The fix is one line, and nothing in the app notices.** No code path in
VillageWatch writes an audit row through the Supabase client. Prisma connects as
the table owner and bypasses RLS entirely; the only thing reached through the
Supabase JS client anywhere in the codebase is Storage. The grant buys nothing
and costs the trail's integrity.

```sql
-- prisma/sql/rls_policies.sql, replacing the INSERT grant and its policy
REVOKE INSERT ON public.audit_logs FROM authenticated;
DROP POLICY IF EXISTS audit_logs_insert_self ON public.audit_logs;
-- SELECT stays as it is: admin-only, village-scoped.
-- Rows are written by the application as the owner, which is the only writer
-- there has ever been.
```

Add an INSERT arm to `vw_audit_logs_append_only()` that rejects any row where
`current_user = 'authenticated'`, so the constraint survives someone re-granting
later. Then check the existing table for rows whose `actor_email` disagrees with
the `users` row for `actor_id` — that query is the detection for whether this has
already been used.

### VW-15 — The `ADMIN` role holds an unscoped write on every village, including the compliance gate

**Severity:** Medium · **Status:** needs fixing
**Affects:** `prisma/sql/rls_policies.sql:288`, `:303`

`GRANT INSERT, UPDATE ON public.villages TO authenticated` is table-wide, gated
by `villages_update_admin` with `USING (vw_is_admin())` — and `vw_is_admin()`
tests `users.role = 'ADMIN'`, which is *not* what the application means by
administrator. The app gates `/admin` on `ADMIN_EMAILS` against the verified JWT;
the RLS definition is a different, older one that the file itself flags as
divergent.

The policy carries no village predicate, unlike `users_select_admin` which does.
So any account whose `role` column reads `ADMIN` — the bootstrap state that was
once created by an `UPDATE` in a SQL console — can, through PostgREST with the
public anon key, write *any* village row: rotate `join_code`, flip `auto_approve`
on to publish reports unreviewed, change `privacy_level` to `light`, or backdate
`dpia_accepted_at`, `apd_accepted_at` and `dpa_accepted_at` and so open the
compliance gate for a village that has accepted nothing.

```sql
-- Villages are written by the application (activateVillage, the settings
-- actions), all audited, all as the owner. Nothing needs this grant.
REVOKE INSERT, UPDATE ON public.villages FROM authenticated;
DROP POLICY IF EXISTS villages_insert_admin ON public.villages;
DROP POLICY IF EXISTS villages_update_admin ON public.villages;
```

If a write is wanted later, scope it and enumerate the columns — the four
compliance timestamps and `join_code` should never be in it, on the same
reasoning that already keeps `*_accepted_by_id` out of the SELECT list.
Separately: audit the database now for any row with `role = 'ADMIN'`. Since
nothing in the app sets it, any that exist are bootstrap leftovers and should be
demoted.

### VW-16 — `users.email` is self-writable, and the admin push audience is resolved by matching it

**Severity:** Medium · **Status:** needs fixing
**Affects:** `prisma/sql/rls_policies.sql:380`, `src/lib/notifications.ts:663`

`vw_guard_user_privilege_columns()` protects `role`, `village_id`,
`verified_at`, `verified_by_id` and `deleted_at`. It does not protect `email`,
and `GRANT SELECT, UPDATE ON public.users` is table-wide — so a resident can
rewrite their own profile email through PostgREST.

`notifyAdminsOfCoordinatorRequest` resolves its audience by looking
`ADMIN_EMAILS` up in the `users` table, case-insensitively. And CLAUDE.md notes
that a platform administrator "who has never joined a village can open the queue
and decide, they just will not be notified" — meaning there may well be *no*
`users` row holding `info@yakasista.com` for the unique index to protect.

A resident who takes that address receives the push notifications about every
coordinator application — which name the applicant and their claimed standing —
and permanently blocks the real administrator from ever holding a profile row on
that address. It does **not** grant `/admin`: `isPlatformAdmin` reads
`session.user.email` off the revalidated JWT, which is the right call and is what
contains this to a Medium.

```sql
-- The address is the identity provider's answer, not the profile's.
IF current_user = 'authenticated' THEN
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.village_id IS DISTINCT FROM OLD.village_id
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.verified_by_id IS DISTINCT FROM OLD.verified_by_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
```

Better still, resolve the admin audience from `auth.users`, or from the ids the
`ADMIN_EMAILS` addresses map to at sign-in, so the push audience never depends on
a column a resident can write.

### VW-17 — RLS is not a backstop for the application's own queries, by design

**Severity:** Medium · **Status:** accepted design — add a compensating control
**Affects:** `prisma/sql/rls_policies.sql`, `src/lib/prisma.ts`

Prisma connects as the table owner and `FORCE ROW LEVEL SECURITY` is deliberately
not set, so every policy in that file is inert against the application. The
reasoning is sound — `auth.uid()` is NULL on that connection and the app would
lose access to its own tables — and the file says so plainly. But it means the
answer to "what stops a query that forgets `villageId`?" is: nothing except
review.

Today the scoping is genuinely consistent — the map, the list, the detail page,
both export routes, the vote route and the notification route were each checked,
and every one takes the village from the session. The exposure is future-tense:
the first query that forgets is a silent cross-village disclosure of neighbours'
incident reports with no database layer to catch it.

Compensating controls, cheapest first:

- An ESLint rule (or a test that walks the Prisma call sites) requiring every
  `incident`, `user`, `patternAlert` and `incidentVote` query to carry a
  `villageId` in its `where`. Mechanical, and it catches the case review misses.
- A Prisma client extension that asserts the same at run time in development,
  throwing on a village-scoped model queried without the key.
- Longer term: a second, request-scoped Postgres role for read paths with
  `FORCE ROW LEVEL SECURITY`, keeping the owner connection for writes. That is a
  real project, and it is what would make the RLS file load-bearing rather than
  defensive.

### VW-18 — Confirm RLS is live on the two newest tables

**Severity:** Informational · **Status:** verify
**Affects:** `prisma/migrations/20260822120000_police_crime_data`, `…20260823120000_incident_votes`

A new table arrives with RLS off and every row readable by the anon key. For
`incident_votes` that would mean an unauthenticated reader learning which
residents thought which of their neighbours' reports was overblown — precisely
the thing the vote feature promises not to expose. `database.yml` re-runs the
policy file after every migration, so the pipeline handles it; CLAUDE.md's "Not
built yet" notes still describe both migrations as unapplied, so the two records
disagree. Settle it against the database rather than the file:

```bash
psql "$DIRECT_URL" -c "
  SELECT relname, relrowsecurity
    FROM pg_class
   WHERE relnamespace = 'public'::regnamespace
     AND relkind = 'r'
   ORDER BY relrowsecurity, relname;"
```

Any `false` in that output is a table the anon key can read in full. Worth wiring
into the `database.yml` run as a final assertion step, so a table added without a
policy fails the workflow instead of being discovered later.

### Confirmed sound in this domain

- Per-column SELECT grants on `villages` and `incidents`, enumerating the safe
  columns rather than revoking the unsafe ones — so a column added by a migration
  is withheld until somebody thinks about it. `raw_description`, `join_code` and
  `whatsapp_channel_id` are simply absent.
- All four helper functions are `SECURITY DEFINER` with `SET search_path = ''`
  and every reference schema-qualified.
- `anon` has no USAGE on the schema and no grant on any table; the Supabase
  default ACLs are revoked.
- `rate_limit` is closed to both roles entirely — own-rows SELECT would leak
  remaining quota, own-rows UPDATE would reset it.
- Incident policies exclude `REMOVED` from both wide reads, so an erased report's
  reference and date do not leak from the tombstone.
- `incidents_insert_own` pins the status to the queue values, and
  `incidents_update_coordinator` excludes `REMOVED` at both ends so erasure
  cannot be faked as a status flip.
- The `users` privilege trigger is `SECURITY INVOKER` — the one detail that makes
  the `current_user` test fire at all.
- `deleted_at` is guarded, closing the path where a closed account nulls its own
  column through PostgREST and signs back in.
- Storage uses the service-role client with the session, village and path prefix
  checked in the route first — correct while bucket policies are unwritten.

---

## 4. Data privacy and UK GDPR

The data-protection engineering here is unusually strong: coordinate jittering,
on-device redaction, audited raw-text reads, a real tombstone on erasure, a
nightly retention job that deletes the reporter's verbatim wording in the same
statement as the archive, and a compliance gate that refuses reports rather than
reminding anybody. The findings are about the documents and the two erasure paths
that stop at the boundary.

### VW-19 — The privacy notice names no data controller and no ICO registration, on a live service

**Severity:** High · **Status:** known — tracked as L2 in `LAUNCH_BLOCKERS.md`
**Affects:** `src/lib/constants.ts:1952`, `/privacy`, `/terms`

`DATA_CONTROLLER` is still every placeholder it shipped with —
`[Data controller name]`, `[contact@example.uk]`, `[ICO registration number]`.
The 27 August pass closed the visible half well: both pages branch on
`HAS_FALLBACK_CONTROLLER_DETAILS`, no bracket reaches a resident, and
`tests/legal-placeholders.test.tsx` asserts it. That is a good mitigation and it
is not compliance.

Article 13(1)(a) requires the identity and contact details of the controller at
the point personal data is collected. A resident registering today is told the
controller is "your village's data controller" and given the *processor's*
address as a route that works. Since the service is live and accepting
registrations, the obligation is live too. The ICO registration is separately a
legal requirement with a fee and a lead time, and it has not been started.

What actually closes it:

- Register with the ICO as a data controller and put the number in the constant.
- Name the controller for the first pilot village — under `community` mode that
  is the coordinator personally, which is what `COMMUNITY_DPA.md` already says,
  so the answer exists and only needs writing down.
- Have the finished notice read by somebody with UK data-protection standing
  before the first real resident registers. Every factual claim in it about the
  code is currently accurate, which is the hard part and is already done.

### VW-20 — The legal pages have carried a "last updated" of 27 July through five substantive rewrites

**Severity:** Medium · **Status:** needs fixing
**Affects:** `src/lib/constants.ts:1713`

`LEGAL_LAST_UPDATED = "2026-07-27"`, and `git log -S` shows the value has not
changed since the commit that introduced it. `src/app/privacy/page.tsx` has
changed in at least five commits since — the police figures, the votes feature,
the coordinator tab split, the email masking, and the 27 August launch-blocker
pass. The constant's own comment states the rule it is breaking: "a policy with a
stale date is worse than one with no date, because it claims a review that did
not happen."

It has a second effect. `src/app/sitemap.ts` publishes the same date as
`lastModified` for both legal pages, so search engines are also told the
documents have not moved since July.

Bump it, and make the rule mechanical rather than remembered — a test in the
pattern of `tests/supabase-templates.test.ts`, which already catches drift
between a generated file and its source:

```ts
// tests/legal-updated.test.ts — fails when the pages move and the date does not.
const pages = ["src/app/privacy/page.tsx", "src/app/terms/page.tsx"];
const changed = execSync(
  `git log -1 --format=%cs -- ${pages.join(" ")}`,
).toString().trim();

expect(LEGAL_LAST_UPDATED >= changed).toBe(true);
```

### VW-21 — Erasure stops at two boundaries: the Supabase auth row, and the OneSignal subscription

**Severity:** Medium · **Status:** needs fixing
**Affects:** `src/lib/erasure.ts:481`

`eraseAccount` is thorough inside the application database — address, home
coordinates, phone, avatar, push subscription JSON and the display name all go,
votes are deleted in both directions, every report is tombstoned and its media
removed from the bucket. Two copies survive outside it.

**The `auth.users` row.** Documented and acknowledged: the email address remains
held by Supabase Auth after the profile is scrubbed. That is an Article 17
request that is not fully actioned, and `/privacy` does not currently say so.

**The OneSignal user.** Not documented anywhere, and it is the one that keeps
working. `OneSignal.login(userId)` binds the resident's Supabase user id as an
external id at OneSignal; nothing in `eraseAccount` unbinds it.
`notifyPush: false` stops VillageWatch selecting them into an audience, but
OneSignal keeps the external id, the subscription and the device mapping
indefinitely, and a bug or a manual send from the dashboard would still reach a
device belonging to somebody who closed their account.

```ts
// src/lib/erasure.ts, alongside the media deletion. Must not throw — same
// contract as notifications.ts: the account closure has already happened.
await deleteOneSignalUser(session.user.id);   // DELETE /users/by/external_id/{id}
```

- Add a reviewed admin route that calls `supabase.auth.admin.deleteUser()` — the
  open item that `RETENTION.inactiveAccountMonths` also waits on. Until it
  exists, `/privacy` should state plainly that the address remains with Supabase
  Auth.
- Resend retains delivery metadata for sent messages; note it in the processor
  entry, or set a retention policy in the Resend dashboard.

### VW-22 — §11 says no consent was needed; OneSignal initialises on the first authenticated page load

**Severity:** Medium · **Status:** needs fixing
**Affects:** `src/app/privacy/page.tsx:797`, `src/components/push-registration.tsx`

The notice reads: "VillageWatch sets only strictly necessary cookies… which is
why you have not been asked to accept anything." `User.notifyPush` defaults to
`true` (`schema.prisma:394`), and `PushRegistration` is mounted in the app shell
— so on the very first authenticated page view the OneSignal SDK is fetched from
`cdn.onesignal.com`, initialises, writes its own identifiers into device storage,
and calls `login(userId)`, transferring the resident's Supabase user id to a US
processor. All of that before the in-app banner has been shown, let alone
accepted.

The careful design decision here — never triggering the browser permission prompt
on load, because Chrome and Firefox permanently block a site that does — is right
and should stay. The issue is narrower: PECR regulation 6 attaches to *storing or
accessing information on the device*, and that happens at SDK init, not at
permission grant. The claim in §11 is therefore not accurate as written.

Either half works:

- **Defer the SDK.** Do not load the `<Script>` until the resident presses the
  in-app banner. The banner is already the consent moment; this makes it the
  technical one too, and it removes a third-party script from every page load for
  residents who never enable push.
- **Or amend §11** to say that enabling notifications stores an identifier on the
  device through OneSignal, name the lawful basis, and offer the off switch. The
  notice already names OneSignal as a processor in §6, so this is a paragraph
  rather than a rewrite.

The first is better, and it is also the one that makes the sentence in §11 true
rather than qualified.

### VW-23 — A stated 24-month audit retention that the database is built to prevent

**Severity:** Low · **Status:** needs a decision
**Affects:** `src/lib/constants.ts:2038`, `prisma/sql/rls_policies.sql:1068`

`RETENTION.auditLogMonths = 24` is published in the privacy notice.
`vw_audit_logs_append_only()` rejects DELETE from everyone including the owner,
so nothing can enforce it — CLAUDE.md is candid that expiring rows is "a
deliberate DBA action". The trail holds `ip_address` and `user_agent`, which are
personal data, alongside every `incident.raw_viewed` row.

The trigger is the right design and should stay. What is missing is the
operational half: a documented, scheduled purge procedure (the file already shows
the `DISABLE TRIGGER` / purge / `ENABLE TRIGGER` shape, and warns to wrap both
ends in one transaction), with an owner and a date. Otherwise the notice states a
period nobody is accountable for. Consider also whether the IP needs to be kept
for the full 24 months, or whether it could be truncated after 90 days while the
action, the actor and the entity remain.

### VW-24 — No self-service subject access export

**Severity:** Low · **Status:** schedule
**Affects:** `src/app/(app)/settings/`

Article 17 is implemented in code; Article 15 and Article 20 are handled by
telling a resident to contact their controller. That is legally acceptable — a
manual process satisfies the right — but the controller is now often an unpaid
coordinator with a one-month deadline and no tooling, and `ControllerDuties`
tells them so on the screen where they take the role on.

A "Download my data" button beside the danger zone, producing JSON of the
resident's own profile, their reports, their votes and their notifications, would
turn a month of volunteer effort into a click. The read paths and the mappers
already exist; this is assembly, not new access.

### Confirmed sound in this domain

- Coordinates are jittered server-side on both the report path and both
  registration paths — never in the browser, so a modified client cannot skip it.
- `rawDescription` is unreachable from every public read path, and
  `readRawDescription()` writes the audit row before it returns the text.
- The retention job archives and clears the verbatim wording in one `updateMany`,
  so a timeout cannot leave a report off the map with the reporter's words still
  in it.
- The erasure tombstone clears the landmark and the pin as well as the text,
  severs `reporterId`, and deletes votes in both directions explicitly rather than
  relying on the cascade.
- Email masking is applied on the server — the full address is not on the payload
  — and `maskEmail` fails closed to `***` rather than echoing an unparseable
  input.
- The resident list selects no `homeLat`/`homeLng`, `phone` or `addressLine`.
- The compliance gate blocks `POST /api/incidents` and `/process` before the body
  is parsed and before a rate-limit slot is spent, and refuses on a lawfulness
  question rather than a configuration one.
- Structural guards rather than remembered ones: `AlertIncident`,
  `ReportIncident`, `ExportIncident` and `IncidentEmailInput` have no field that
  *could* carry raw text or coordinates.
- The CSV export guards formula injection behind both laundering prefixes and is
  asserted by parsing the output back.
- Every claim the privacy notice makes about code behaviour that was checked in
  this pass was accurate.

---

## 5. Integration security

Resend, OneSignal, Slack and data.police.uk. All four share the same contract —
nothing throws, nothing blocks, a missing key logs instead of sending — which is
the right shape. There are no webhook endpoints in the codebase, which removes a
whole class of finding.

### VW-25 — OneSignal Identity Verification is not enabled, so an external id can be claimed by anybody

**Severity:** Medium · **Status:** needs fixing
**Affects:** `src/components/push-registration.tsx:162`, OneSignal dashboard

`OneSignal.login(userId)` is called with the raw Supabase user id and no identity
verification hash. OneSignal's SDK accepts whatever external id the page gives it
— that is exactly what the Identity Verification feature exists to prevent.
Anybody who learns another resident's user id can call `login()` with it from
their own browser console and bind their device to that external id.

Because `src/lib/notifications.ts` targets by
`include_aliases: { external_id: [...] }` and by nothing else, that device then
receives every alert addressed to the impersonated resident: village broadcasts,
and — if the id belongs to a coordinator — the pending-report alerts, which carry
a report's reference and title to a lock screen.

The user ids are UUIDs, so this is not casually guessable. It is not secret
either: `reporter_id` is inside the `incidents` SELECT grant for `authenticated`,
so any resident with the anon key can read the ids of everyone who has filed a
report in their village.

- Turn on **Identity Verification** for the OneSignal app.
- Mint the JWT server-side and pass it to the component alongside `userId` — the
  shell already computes props on the server, so the shape of the change is the
  one `isAdmin` already uses.
- While in that file: remove `reporter_id` from the `incidents` SELECT column
  grant unless something needs it through PostgREST. Nothing in the app reads
  incidents that way.

### VW-26 — The IP address in every audit row is written by the client

**Severity:** Medium · **Status:** needs fixing
**Affects:** `src/lib/audit-context.ts:69`, and four route handlers

`auditContext()` takes `x-forwarded-for.split(",")[0]` — the *first* entry — on
the documented reasoning that the first entry is the client and the rest are
hops. That is true of a well-behaved chain. It is not true of a chain a caller
can prepend to: a request arriving at Vercel with its own
`X-Forwarded-For: 8.8.8.8` is forwarded with the platform's value appended, so
the first entry is whatever the attacker wrote.

The four route handlers (`api/incidents`, `api/notifications`,
`api/dashboard/export`, `api/reports/[villageId]/pdf`) store the whole header,
which is at least honest about being a chain. The server actions take the first
entry, and those are the three rows the module exists for: publishing a report,
rejecting one, and reading a reporter's verbatim words. A coordinator account
being misused is precisely what those rows are for, and the address against them
is forgeable.

```ts
// Vercel sets this itself and it is not client-appendable.
const ip =
  store.get("x-vercel-forwarded-for") ??
  store.get("x-real-ip") ??
  store.get("x-forwarded-for")?.split(",").pop()?.trim() ??  // last hop, not first
  null;
```

Apply the same change at the four route handlers so the trail records one thing
consistently.

### VW-27 — Confirm Resend domain authentication and publish a DMARC policy

**Severity:** Low · **Status:** verify
**Affects:** DNS for `villagewatch.app`, `src/lib/email/send.ts:72`

Not verifiable from the repository, and it fails quietly in both directions.
`RESEND_FROM_EMAIL` falls back to `noreply@villagewatch.app`, and if that domain
is not verified in Resend every send is refused with the refusal only in the
server log — indistinguishable from a healthy deployment until somebody asks why
they never got a welcome email.

The phishing surface is the reason to care beyond deliverability. Residents will
receive mail from this domain telling them things about crime in their village.
Without a DMARC policy at `p=reject`, anybody can send mail that appears to come
from it — and the population is exactly the one least equipped to check a header.
Publish SPF, DKIM (both Resend keys) and:

```
_dmarc.villagewatch.app.  TXT  "v=DMARC1; p=reject; rua=mailto:dmarc@villagewatch.app; adkim=s; aspf=s"
```

Start at `p=none` with reporting, read a fortnight of aggregate reports, then
move to `quarantine` and `reject`. Note that Supabase sends the auth email over
its own mailer — pointing it at Resend (`docs/SUPABASE_EMAIL_SETUP.md`) is what
brings confirmation and recovery mail under the same alignment, which is a second
reason to do that outstanding task.

### VW-28 — Three third-party origins are fetched at runtime with no integrity check

**Severity:** Low · **Status:** needs fixing
**Affects:** `src/lib/media/face-blur.ts:48`, `src/components/push-registration.tsx:252`

The MediaPipe WASM runtime comes from `cdn.jsdelivr.net`, the BlazeFace model
from `storage.googleapis.com`, and the OneSignal SDK from `cdn.onesignal.com`.
The first two are the redaction pipeline: a compromised or substituted WASM
binary is a face-blur that reports success and blurs nothing, on a service whose
central privacy promise is that it does.

`.env.example` already documents the fix for two of the three —
`NEXT_PUBLIC_MEDIAPIPE_WASM_PATH` and `NEXT_PUBLIC_FACE_MODEL_URL` pointing at
`public/mediapipe/`. Doing it removes two origins from the CSP in VW-02 and puts
the model that enforces domain rule 3 under version control. The OneSignal SDK
has to stay remote; the CSP is what bounds it.

### VW-29 — There are no webhook endpoints, and the outbound clients are correctly shaped

**Severity:** Informational · **Status:** nothing to fix

No route accepts an inbound callback from Resend, OneSignal, Supabase or anybody
else. The only unauthenticated-in-the-ordinary-sense routes are the three crons,
and all three are behind `isCronAuthorised()`: constant-time comparison, fails
closed on an unset secret, and a 401 that says nothing about which of the three
states produced it. That is the right shape.

Two notes for the day one is added. Signature verification must happen before the
body is parsed and must be constant-time — `src/lib/cron.ts` is the model to
copy. And `src/lib/police-api.ts` is worth reading first as the template for
consuming a third party: it drops the force-authored `bio` field at the schema so
no later "just render the bio" finds it, strips tags from `description` rather
than sanitising them, and puts every outbound-supplied URL through the same
`http(s)`-only guard the stored WhatsApp link gets.

### Confirmed sound in this domain

- Every server-only key is unprefixed and read only from server modules; the
  admin Supabase client is imported by Route Handlers alone.
- Email templates escape every interpolation, and `IncidentEmailInput` has no
  field that could carry raw text.
- `sendEmail` resolves to a value for every failure — missing key, refused
  sender, network throw, timeout — which is what stops a registration reporting
  failure after it succeeded.
- Push payloads carry only public columns; the audience is resolved against the
  database, not against OneSignal segments.
- Slack is `await`ed rather than fire-and-forget, correct on a frozen Vercel
  instance, and never carries raw wording or coordinates.
- Signed storage URLs are one hour and are only ever produced after the route has
  established the session and the village.
- The police client's 1-per-second outbound pacer is correctly a module variable,
  not a database counter — a courtesy pace, not a security limit.

---

## 6. Supply chain and CI/CD

The pipeline is well built — least-privilege tokens, concurrency guards, a
migration workflow that fails closed on a missing secret and re-applies both SQL
files in the right order. What is missing is any automated security signal at
all.

### VW-30 — Eleven advisories in the production dependency tree, all reachable through `next`

**Severity:** Medium · **Status:** needs fixing
**Affects:** `package.json`, `package-lock.json`

`npm audit --omit=dev` reports 11 (1 moderate, 10 high) against the current
lockfile. The two that matter both come in through `next@16.2.11`:

- **`postcss`** — GHSA-r28c-9q8g-f849, path traversal in source-map auto-loading
  leading to arbitrary `.map` file disclosure. Build-time in this project's use,
  so the exposure is a compromised build rather than a live request.
- **`sharp` / libvips** — GHSA-f88m-g3jw-g9cj, four CVEs. Worth stating
  precisely: this app does *not* use `next/image` (media is rendered with plain
  `<img>` against Supabase signed URLs), so resident-uploaded photographs never
  reach libvips at request time. The advisory is real and the exposure here is
  small.

```bash
npm install next@16.3.3 eslint-config-next@16.3.3
npm run build && npm run test          # both must stay green
npm audit --omit=dev                    # expect 0
```

Leave `prisma` where it is — the advisories under it (`@prisma/config`,
`@prisma/dev`, `valibot`) are dev-tooling paths and the "fix" npm proposes is a
downgrade to Prisma 6, which this codebase cannot take. Record that decision
rather than re-deciding it every time somebody runs the command.

### VW-31 — No automated dependency, secret or code scanning

**Severity:** Medium · **Status:** needs fixing
**Affects:** `.github/`

There is no `dependabot.yml`, no Renovate config, no `npm audit` step in
`ci.yml`, no CodeQL workflow and no secret scanning. `main` auto-deploys to
production, so the Definition of Done is the review beat — and it has no security
check in it. The eleven advisories above went unnoticed for exactly that reason.

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
    groups:
      production: { dependency-type: production }
  - package-ecosystem: github-actions
    directory: "/"
    schedule: { interval: monthly }
```

```yaml
# .github/workflows/ci.yml — after the Test step
- name: Audit production dependencies
  run: npm audit --omit=dev --audit-level=high
```

- Add the stock **CodeQL** workflow for `javascript-typescript`. It is one file
  and it reads the whole App Router.
- Turn on **secret scanning with push protection** in repository settings. The
  history is clean today — verified across every tracked file — and push
  protection is what keeps it that way when somebody pastes a `DIRECT_URL` into a
  migration comment.
- Consider **Socket.dev** or `npm audit signatures` alongside the advisory check:
  the audit database catches known CVEs, not a freshly published malicious
  version of a transitive package, which is the realistic npm attack.

### VW-32 — CI runs install lifecycle scripts for every dependency

**Severity:** Low · **Status:** needs fixing
**Affects:** `.github/workflows/ci.yml`

`npm ci` runs without `--ignore-scripts`, and the comment explains why: the
`postinstall` is `prisma generate`, and `src/generated/prisma` is gitignored, so
the typecheck and build fail without it. Correct, but it means a `postinstall` in
any transitive dependency executes on a runner that has checked out the
repository. `version.yml` already gets this right with `--ignore-scripts`.

```yaml
- name: Install
  run: npm ci --ignore-scripts

- name: Generate Prisma client
  run: npx prisma generate
```

Same result, one script instead of every script.

### VW-33 — Actions are pinned to mutable major tags

**Severity:** Low · **Status:** needs fixing
**Affects:** `.github/workflows/*.yml`

`actions/checkout@v5` and `actions/setup-node@v5` resolve a tag the upstream
repository can move. It matters most in `version.yml`, which holds
`contents: write` and pushes to `main` — the branch that auto-deploys to
production. Pin to a commit SHA with the tag in a trailing comment; Dependabot's
`github-actions` ecosystem (VW-31) then keeps them current.

```yaml
- uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8  # v5.0.0
```

### VW-34 — No credentials in the repository or its history

**Severity:** Informational · **Status:** verified clean

Every tracked file was searched for JWT-shaped strings, `sk-ant-` and `re_`
prefixes, service-role keys and Postgres URLs carrying a password. The only
matches are the placeholder connection strings in `.env.example` and the word
`service_role` in the RLS file's comments. `.gitignore` covers `.env*` with an
exception only for the example, and no `.env` file has ever been added in the
history.

### Confirmed sound in this domain

- `ci.yml` declares `permissions: contents: read` and needs no secrets at all — a
  property the test suite's no-database rule is what buys.
- `version.yml` installs with `--ignore-scripts` and is the workflow holding
  write access.
- `database.yml` fails closed on a missing `DIRECT_URL`, never cancels a run
  mid-`psql`, uses `ON_ERROR_STOP=1`, and re-applies `postgis.sql` then
  `rls_policies.sql` in that order after every migration.
- Both SQL files are re-runnable by construction, so a repeated apply is safe.
- The release job checks the tag locally and on the remote before writing
  anything.

---

## Order of work

Sequenced by what each step unblocks rather than by severity alone. Everything in
the first two rungs is a small, well-bounded change; the third is where the real
project is.

### 1. This week — four one-line database and config changes

`VW-14`, `VW-15`, `VW-16`, `VW-01`, `VW-18`

Revoke the two grants that give `authenticated` write access it never needed, add
`email` to the privilege trigger, and set `cookieOptions`. Each is a few lines,
none changes application behaviour, and together they close the highest-rated
finding and two of the three database ones. Re-run `rls_policies.sql` and check
`relrowsecurity` across the schema while you are there.

### 2. Before the first pilot village — the legal and identity work

`VW-19`, `VW-20`, `VW-22`, `VW-25`, `VW-30`, `VW-31`, `VW-32`

The ICO registration has the longest lead time of anything on this list and
nothing else depends on it, so start it first. Bump the legal date and add the
test that keeps it honest. Enable OneSignal Identity Verification and defer its
SDK behind the consent banner, which closes a PECR finding and an impersonation
finding with one change. Upgrade Next and add Dependabot.

### 3. Next quarter — the CSP, the upload contract, and the erasure tail

`VW-02`, `VW-03`, `VW-04`, `VW-05`, `VW-21`, `VW-28`

The CSP is the largest single piece and wants a report-only fortnight first;
moving the MediaPipe assets first-party makes it materially simpler. Server-side
sniffing and metadata stripping make `exifStripped` a fact rather than a claim.
The auth-row deletion route and the OneSignal unbind finish Article 17.

### 4. Standing — make the invariants mechanical

`VW-17`, `VW-06`, `VW-07`, `VW-11`, `VW-12`, `VW-23`, `VW-24`, `VW-33`

The consistent theme in what is already good here is that a rule survives when
something asserts it. The village-scoping lint rule, the RLS assertion in
`database.yml`, and the legal-date test each turn a convention this codebase
currently keeps by care into one it keeps by construction.

---

## A note on the codebase rather than the findings

Several of these were found because the code explains itself — the RLS file
states what its policies cannot do, `rate-limit.ts` argues with `police-api.ts`
about counter placement and both are right, and CLAUDE.md's "Not built yet"
section is honest to the point of listing its own stale entries. That is rare,
and it is what made a review at this depth possible in a single pass.

Two of the three findings rated most severe are places where a comment states an
invariant the code next to it does not quite keep — `audit_logs_insert_self`'s
"a client could forge a trail naming somebody else", and
`vw_is_admin()`'s divergence from what the application means by administrator.
Both comments flag the risk; neither closes it. That is worth knowing about this
codebase's failure mode: the reasoning is nearly always written down, so the
place to look for a gap is where the reasoning and the statement have drifted
apart.
