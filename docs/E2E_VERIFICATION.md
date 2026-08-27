# End-to-end flow verification

**Date:** 27 July 2026 · **Method:** code reading only · **Verdict:** every flow
has a complete code path; four gaps found, one fixed in this pass.

> **Resolution, 13 August 2026.** All four gaps are closed — see the note at the
> head of each. Gaps 1 and 2 were closed **the other way round from the
> recommendation below**, and deliberately: this document proposed keeping the
> singular `src/lib/village.ts` and deleting the plural module, on the grounds
> that the singular one was fuller. The plural one was the one actually wired to
> a screen, and "delete the module that runs, keep the one that does not" is a
> change with no way to test that it worked. The live module absorbed the live
> half of the dead one instead, and `src/lib/village.ts` is gone.
>
> **Line numbers in this document are from 27 July and most no longer resolve.**
> Treat them as a record of what was read, not as a way to find it. The file they
> most often point at does not exist any more.

> **Addendum, 28 July 2026 — the compliance gate.** A gate now sits in front of
> flows (c), (d) and (e): a village accepts no report until its coordinator has
> accepted the DPIA, the Appropriate Policy Document and the Article 28(3) data
> processing agreement on
> `/dashboard/compliance`. `POST /api/incidents` and `POST /api/incidents/process`
> both return **403** before parsing a body or spending a rate-limit slot, and
> `/incidents/new` renders the refusal rather than the wizard. Everything below
> about those three flows still holds — it describes what happens *after* the
> gate opens. See "The compliance gate" in CLAUDE.md.
>
> ~~The gate is **not enforced on the deployed database**~~ — **corrected 13
> August 2026.** Both migrations are applied, along with the other eight; the
> `database.yml` run that applied `20260803120000_incident_village_numbering` on
> 3 August reported every earlier one already present. This addendum said
> otherwise for a fortnight and was the older of two documents that disagreed,
> which is why `PROJECT_STATE.md` was carrying it as an open question. **The gate
> is live**, so a village that has not been through that screen is refusing
> reports right now. What is still true is the sixth entry it added to "What this
> document cannot tell you": nothing has ever been *blocked* by the gate in
> anger, and no acceptance has ever been recorded.

This walks the ten flows a resident or coordinator actually performs and checks,
step by step, that the code behind each one exists and does what the rest of the
documentation says it does. It is a **static** review. Nothing here was executed
against a database, a storage bucket, OneSignal or Anthropic — where that
distinction matters, it is called out rather than glossed.

The distinction matters more than usual on this project. Push has never
delivered to a real device, the retention job has never run, erasure has never
touched a real bucket, and the deploy pipeline has never applied a migration. A
correct code path is not a working feature, and this document does not claim
otherwise.

## Summary

| # | Flow | Path | Notes |
|---|------|------|-------|
| a | Register with email | ✅ complete | Slack fires on both paths |
| b | Google → `/welcome` | ✅ complete | Identity from session, never the body |
| c | Report an incident | ✅ complete | Blur is on-device with no server fallback |
| d | Auto-approve **on** | ✅ complete | Migration applied; never exercised |
| e | Auto-approve **off** | ✅ complete | Coordinators are pushed when the queue fills |
| f | Coordinator approve/reject | ✅ complete | Guarded on the status just read |
| g | Delete a report | ✅ complete | Never run against a real bucket |
| h | Delete an account | ⚠️ partial | `auth.users` row survives — known and documented |
| i | Rate limiting | ✅ complete | 6th AI call in an hour is a 429 |
| j | CSV export | ✅ complete | Audit row precedes the download |

**Gaps found**, in descending order of how much they matter:

1. ~~**Two village-activation modules exist and one of them is dead code.**~~
   **Closed 13 Aug** — one module, `src/lib/villages.ts`. §Gap 1.
2. ~~**A join code is still optional at registration**~~, so the guarded join
   logic in `checkVillageJoin` — written, documented, tested against nothing —
   never runs. **Closed 13 Aug**, and it was the one that mattered: anybody who
   could see a village in the picker could join it by leaving the field blank.
   §Gap 2.
3. **OneSignal counted a failed delivery as a success.** Found and **fixed** in
   this pass, along with an app-id fallback. §Gap 3.
4. ~~**A stale docstring** points at a script that does not exist.~~ **Closed.**
   §Gap 4.

---

## a) Registration → user created → village assigned → Slack

`POST /api/auth/register` — `src/app/api/auth/register/route.ts`

| Step | Where | Verified |
|------|-------|----------|
| Config guards | `:27-39` | 503 with no Supabase, 503 with no database |
| Validation | `:48-57` | `registerSchema`, 422 with field errors |
| Home location fuzzed **server-side** | `:72-75` | `HOME_LOCATION_FUZZ_METERS`, before any write |
| Village must be `ACTIVE` | `:77-90` | A `PENDING` directory entry cannot be joined |
| Join code checked against the database | `:93-107` | Case-insensitive, trimmed |
| Auth user created | `:110-132` | `already registered` mapped to a field error |
| Profile row created | `:134-148` | `id` mirrors `auth.users.id` |
| Role derived on the server | `:145-146` | `codeMatches ? VERIFIED_RESIDENT : RESIDENT` |
| Slack | `:164-166` | After the profile write, cannot throw |
| Email confirmation reported | `:169` | `data.session === null` |

**Correct.** Domain rule 5 holds: `role` and `verifiedAt` are computed from a
code checked against the village row, and nothing in the payload can name them.
The ordering is right — the Slack line goes out *after* the profile write, so an
alert never announces a registration that then failed.

**One thing worth knowing rather than discovering:** if the profile write fails
the auth user already exists, and the route says so plainly (`:153-159`) rather
than pretending. That leaves a session with no profile, which `(app)/layout.tsx`
sends to `/welcome` — the same state Google sign-in produces routinely, so it
recovers rather than stranding anybody.

## b) Google → `/welcome` → village + home location → user created

`GET /api/auth/callback` → `POST /api/auth/complete-profile`

| Step | Where | Verified |
|------|-------|----------|
| Provider refusals handled | `callback:59-69` | `access_denied` reads as "cancelled" |
| Code exchanged server-side | `callback:77` | Route Handler — the only writable cookie store |
| `next` re-validated after the round trip | `callback:33-38` | Rejects `//evil.test` as well as absolute URLs |
| Closed account intercepted **before** `!profile` | `callback:108-112` | Signs out, `/account-closed` |
| No profile → `/welcome`, carrying `next` | `callback:114-121` | |
| Identity from the session, never the body | `complete-profile:56, :124-125` | |
| Refuses to overwrite an existing profile | `complete-profile:52-54` | Returns 200, writes nothing |
| Role derived on the server | `complete-profile:132-133` | Same derivation as the register route |
| Home location fuzzed server-side | `complete-profile:85-88` | Same constant, same function |
| Slack | `complete-profile:147-149` | Same line as the password path |

**Correct**, and the ordering of the two `callback` branches is the load-bearing
detail: checking `deletedAt` before `!profile` is what stops a closed account
being offered `/welcome` and rejoining a village by filling the form in again.

The guard at `complete-profile:52` is what makes this route safe to leave
unauthenticated-by-village — an unguarded upsert there would be a way to change
your own village, which is the tenant boundary every query is scoped by.

## c) Report an incident

Wizard: `src/components/incident-form.tsx` · Host: `src/app/(app)/incidents/new/page.tsx`

| Step | Where | Verified |
|------|-------|----------|
| Village resolved server-side | `new/page.tsx:23-38` | Map centre and tenant both off the session |
| No village → explanatory screen | `new/page.tsx:41-63` | Not a crash, not an empty map |
| Faces covered **on-device** | `src/lib/media/face-blur.ts` | MediaPipe BlazeFace, canvas output |
| Upload accepts blurred output only | `media/route.ts:36-46` | JPEG, MP4, WebM — the blur pipeline's own formats |
| **No server-side blur fallback** | `media/route.ts:16-21` | Deliberate: a fallback means accepting an unblurred original |
| EXIF dropped by re-encoding | `incidents/route.ts:314-318` | `exifStripped: true`, GPS tag with it |
| Objects keyed by tenant | `media/route.ts:150-153` | `{villageId}/{userId}/{yyyy-mm}/{uuid}` |
| Video must carry a thumbnail | `media/route.ts:139-146` | Only the browser has a decoded frame |
| AI pass on entering preview | `incident-form.tsx:472` | Not awaited — the step change stays instant |
| AI failure never blocks filing | `incident-form.tsx:384-398, :418-424` | Falls back to the reporter's own wording |
| Exact pin sent to AI, never stored | `process/route.ts:28-31` | Pattern lookup needs the real point |
| Coordinates fuzzed before the write | `incidents/route.ts:255` | `LOCATION_FUZZ_METERS` |
| Media ownership re-checked at publish | `incidents/route.ts:227-239` | A path is not proof of ownership |
| Two description columns | `incident-form.tsx:506-507` | `rawDescription` sent only when genuinely different |
| Reference clash retried | `incidents/route.ts:269, :411-423` | P2002 only, five attempts |

**Correct throughout.** Three details are better than they need to be:

- The tag `create` deduplicates with a `Set` (`incidents/route.ts:327`) because a
  reporter editing tags by hand could reintroduce a duplicate, and the resulting
  P2002 would be read by the retry loop as a reference clash and file the report
  a second time. That is a real bug that was thought about.
- `announce()` cannot throw (`incidents/route.ts:169-176`), for the same reason.
- `isAiConfigured` gates the `ai` provenance block server-side
  (`incidents/route.ts:262`), so a deployment with no key cannot be told by the
  browser that a rewrite happened.

## d) Auto-approve **on**: publish → `PUBLISHED` → alert → WhatsApp copy

`POST /api/incidents` + `announce()` — `src/app/api/incidents/route.ts:87-177`

| Step | Where | Verified |
|------|-------|----------|
| Setting read from the village row | `:266` | Never from the body |
| Fails closed to the queue | `moderation.ts:305-327` | A failed `SELECT` does not publish |
| Status set explicitly | `:267, :283` | `PUBLISHED` |
| `moderatedById`/`At` stay null | `:278-282` | Nobody moderated it |
| Village push + WhatsApp log line | `:120-132` | `notifyIncidentPublished` |
| `incident.publish` audit row | `:139-154` | `autoApproved: true`, **no** `before` |
| Staff Slack line | `:164-168` | Marked "(auto-approved)" |
| Alert text returned to the wizard | `:389-401` | Coordinators only, published only |
| Success screen instead of a redirect | `incident-form.tsx:547-556` | So the text is not lost |
| `anonymized: false` warned in red | `incident-form.tsx:552`, `CopyAlert` | The reporter's own words are about to be public |

**Correct**, and the migration behind it (`20260727161500_village_auto_approve`)
**is applied** — it is one of the five, not the sixth. So this is the one of the
three "never exercised" features whose schema is actually in place.

The fan-out matches `applyModeration`'s exactly, which is the property that has
to be maintained by hand — there is no shared function, only two call sites that
have to stay in step. Both were checked; they do.

**Not verified:** no report has ever been filed through this path against a real
database. Watch the first one — status, push, both audit rows, and what lands in
the channel if the village also has posting on.

## e) Auto-approve **off**: `PENDING_REVIEW` → coordinator notified → approve

| Step | Where | Verified |
|------|-------|----------|
| Status | `incidents/route.ts:267` | `PENDING_REVIEW` |
| Coordinators pushed | `:103-111` → `notifications.ts:423-458` | |
| Reporter excluded from their own alert | `notifications.ts:441-444` | |
| Not filtered by preference or radius | `notifications.ts:436-446` | This is work, not village news |
| **Title only** in the body | `notifications.ts:451-452` | A push lands on a lock screen |
| Nothing reaches residents yet | — | Domain rule 6: alerts fire on publish, never on file |

**Correct.** `notifyCoordinatorsOfPendingReport` deliberately ignores
`notifyPush`, `notifyMinSeverity` and `notifyRadiusMeters` — those are how a
*resident* asks to hear less, and a coordinator who muted village news has not
asked to stop being told there is work waiting.

~~**Gap in coverage, not in code:** nothing in `tests/` asserts that a
non-auto-approving village still queues. That needs a route test with a database
behind it, and it remains the regression most worth having one for.~~

**Closed 27 August 2026** — `tests/incident-create-route.test.ts`. And the
second sentence above was wrong, which is worth leaving visible rather than
quietly editing: it did **not** need a database. Mocking Prisma, the session,
the compliance gate and the two dispatches at their boundaries leaves the
route's own decisions exercisable, which is exactly what `retention.test.ts`
had already been doing since before this paragraph was written. The belief that
a route test implied a database is what kept the gap open for a month.

`getVillageAutoApprove` is deliberately left **real** in that test, with only
its `SELECT` mocked, so the fail-closed behaviour is exercised through the route
rather than asserted against a stub. What a unit test still cannot tell you is
what Postgres did with the row — that is the by-hand step, and it is still
outstanding.

## f) Coordinator approve/reject → status change → reporter notified

`moderateIncidentAction` → `applyModeration` — `src/lib/moderation.ts:76-226`

| Step | Where | Verified |
|------|-------|----------|
| `requireCoordinator()` | `dashboard/actions.ts:61` | Re-established server-side |
| Village from the session | `dashboard/actions.ts:62` | Domain rule 4 |
| `REMOVED` excluded at the read | `moderation.ts:94` | 404, not "cannot be published" |
| Transition guarded | `moderation.ts:54-59, :121-128` | `ALLOWED_FROM` |
| Write conditional on the status just read | `moderation.ts:135-148` | Two concurrent approvals → one push |
| Audit row | `moderation.ts:150-162` | `before` and `after` both recorded |
| Village push on PUBLISH | `moderation.ts:170-184` | |
| WhatsApp text built for the coordinator | `moderation.ts:192-201` | Not gated by the village switches — one clipboard |
| Staff Slack line | `moderation.ts:207-211` | |
| Reporter told either way | `moderation.ts:214-223` | PUBLISH and REJECT both |
| Pages revalidated | `dashboard/actions.ts:90-93` | Queue, list, map, detail |

**Correct.** The `count === 0` branch (`:146-148`) is the race guard and it
returns a sentence a human can act on — "Someone else reviewed that report
first" — rather than a silent no-op.

`rawDescription` is absent from the `select` at `:95-114` and always has been.
The only way to read it is `readRawDescription` (`:240-280`), which writes the
`incident.raw_viewed` audit row **before** returning the text.

## g) Reporter deletes a report → `REMOVED` → scrubbed → media deleted

`DELETE /api/incidents/[id]` → `removeIncident` — `src/lib/erasure.ts:228-322`

| Step | Where | Verified |
|------|-------|----------|
| Village checked **before** the reporter | `erasure.ts:243-265` | 404 vs 403 — a 403 would confirm the report exists |
| Audit row first | `erasure.ts:269-285` | Written while there is still something to describe |
| **Objects before rows** | `erasure.ts:154-217` | Deleting the row first orphans the file forever |
| Both variants + the video still | `erasure.ts:171-180` | `storagePath`, `redactedPath`, `-thumb.jpg` |
| Storage failure keeps the rows | `erasure.ts:199-210` | So tonight's retention sweep retries |
| Tags deleted | `erasure.ts:289-291` | |
| Tombstone clears everything personal | `erasure.ts:94-117` | `rawDescription` included |
| `reporterId` severed | `erasure.ts:96` | The last link to a person |
| `lat`/`lng` cleared → PostGIS point cleared | `erasure.ts:90-92` | By trigger |
| Update guarded on the status just read | `erasure.ts:296-312` | Loses a moderation race gracefully |
| Excluded from the CSV export | `export/route.ts:77-80` | The one query where it had to be added by hand |

**Correct**, and the tombstone is the part that makes keeping the row
acceptable. A status flip alone would be erasure in the interface and nothing at
all in the database.

**Not verified:** `deleteStoredObjects` has never been run against a real bucket.
Watch the first deletion and confirm the object is actually gone.

## h) Delete account → reports scrubbed → `deletedAt` → signed out

`deleteAccountAction` → `eraseAccount` — `src/lib/erasure.ts:361-506`

| Step | Where | Verified |
|------|-------|----------|
| Types their own email to confirm | `settings/actions.ts:113-125` | Case-insensitive, trimmed |
| Audit row first | `erasure.ts:385-397` | `account.deleted` |
| Every report tombstoned | `erasure.ts:376-413` | Every status except `REMOVED` |
| Media deleted, objects before rows | `erasure.ts:399` | Same function as a single report |
| Notifications and pending applications dropped | `erasure.ts:421-426` | Neither has a trail argument |
| Profile scrubbed | `erasure.ts:429-483` | Address, home location, phone, avatar, push subscription, name |
| `email` deliberately kept | `erasure.ts:460-464` | The unique key the sign-in gates match on |
| `villageId`, `role`, `verifiedAt` cleared | `erasure.ts:466-473` | Out of the tenant boundary |
| Signed out | `settings/actions.ts:141-158` | Failure here cannot fail the closure |
| `/account-closed` | `settings/actions.ts:164` | Outside `(app)`, so no loop |
| Three gates read `deletedAt` | login route, callback `:108`, `layout.tsx:41` | Plus `residentsToNotify` |

⚠️ **Partial, and knowingly so.** The Supabase `auth.users` row is **not**
deleted, so the email address is still held by Supabase Auth after the profile
has been scrubbed. That is an admin API call with no undo and wants its own
reviewed route. `/privacy` should say so before launch — it currently does not.

The `deletedAt` column is in the `users_guard_privilege_columns` trigger, which
is what stops a closed account signing in to Supabase directly with the anon key
and nulling its own column. **That trigger is in `rls_policies.sql` and the file
has been re-run**, so this one is closed.

## i) Rate limiting: the 6th AI call in an hour

`src/lib/rate-limit.ts` · `RATE_LIMITS.aiProcess` = 5/hour

> **Addendum, 25 August 2026 — the figure moved, the mechanism did not.**
> `RATE_LIMITS.aiProcess` is **30/hour**, not 5. Five was tighter than the ten
> reports a day `incidentCreate` allows, and residents were meeting it inside a
> single report: the wizard's `aiSignature` keys on the description, so each
> edit-and-preview is a fresh call. Every row in the table below was verified
> against the limiter rather than against the number, so all eight still hold —
> read "the 6th call" as "the 31st". See "Rate limiting" in CLAUDE.md.

| Step | Where | Verified |
|------|-------|----------|
| Counted **after** the body validates | `process/route.ts:83-86` | A malformed request costs a Zod parse, not a slot |
| One atomic statement | `rate-limit.ts:157-163` | `INSERT … ON CONFLICT DO UPDATE … RETURNING` |
| Window aligned to the clock | `rate-limit.ts:112-114` | Every instance computes the same key |
| `ok = count <= limit` | `rate-limit.ts:180` | 6th call → `count = 6` → `ok: false` |
| 429 with `Retry-After` | `rate-limit.ts:246-259` | Plus `X-RateLimit-*` |
| Rejected calls still consume | `rate-limit.ts:128-131` | No free probe |
| **Fails open** | `rate-limit.ts:166-177` | A database blip must not block filing |
| The wizard treats it as "no rewrite" | `incident-form.tsx:418-424` | Filing is never blocked |

**Correct**, and asserted — `tests/rate-limit.test.ts` mocks `$queryRaw` with a
counter keyed on `(userId, action, windowStart)`, which is the real unique
constraint rather than a stub returning a number somebody chose.

Swept nightly at `RATE_LIMIT_RETENTION_DAYS` (7), which is longer than the
longest window, so a sweep can never reopen one that is still counting.

## j) CSV export

`GET /api/dashboard/export` + `src/lib/incident-csv.ts`

| Step | Where | Verified |
|------|-------|----------|
| Coordinators only | `export/route.ts:52-57` | `isCoordinatorRole` |
| Scoped by village | `export/route.ts:78` | |
| `description`, never `rawDescription` | `export/route.ts:87-88` | A spreadsheet gets forwarded |
| `REMOVED` excluded | `export/route.ts:79` | |
| Audit row **before** the response | `export/route.ts:103-116` | And allowed to fail the request |
| Every exit is JSON | `export/route.ts:125-136` | So a 500 is not saved as a spreadsheet |
| Headers + `Content-Disposition` | `export/route.ts:118-124` | |
| Formula injection guarded | `incident-csv.ts` · `isFormulaBait` | Leading whitespace and `\n` both covered |

**Correct.** `ExportIncident` has no field for `rawDescription`, `lat` or `lng` —
the structural guard, in its sharpest form. `tests/incident-csv.test.ts` parses
the output back rather than string-matching it.

---

# The gaps

## Gap 1 — two village-activation modules, one of them dead

**Severity: high.** Not a broken path; a duplicated one, where the copy that
runs is not the copy that is documented. **Closed 13 August 2026** — see the foot
of this section, and note that it was closed the opposite way round from the
recommendation.

`src/lib/village.ts` (803 lines) and `src/lib/villages.ts` (374 lines) both
implement the seeded-directory-entry → live-village lifecycle. Singular and
plural, one character apart.

Only the **plural** one is wired. `src/app/(app)/admin/villages/actions.ts:5-9`
imports `activateVillage`, `appointCoordinator` and `regenerateJoinCode` from
`@/lib/villages`. From the singular module, only four functions have callers —
`getVillageController`, `getVillageParishCouncil`, `setVillageParishCouncil` and
`saveVillageAdminSettings`.

These exports of `src/lib/village.ts` have **zero callers** anywhere outside the
file:

`activateVillage` · `suspendVillage` · `reactivateVillage` · `regenerateJoinCode`
· `checkVillageJoin` · `generateJoinCode` · `normalizeJoinCode` ·
`JOIN_CODE_ALPHABET`

Two consequences, and the second is the one that matters:

1. **`suspendVillage` and `reactivateVillage` do not exist as features.** They
   are written, documented and audited, and no screen can reach them. The plural
   module has no equivalent, so a village can be activated and never suspended.
2. **Two implementations now raise a role to `COORDINATOR`.**
   `src/lib/villages.ts:277` has its own `appointCoordinator`, distinct from the
   one in `src/lib/coordinator-requests.ts:418`. CLAUDE.md states that
   `coordinator-requests.ts` "is the only place in the codebase that raises a
   role", and that is **no longer true** — the wired admin screen goes through
   the other one. The singular `village.ts` imports the canonical function
   (`village.ts:7`) and is itself unreachable, so the module that got this right
   is the one nobody calls.

Domain rule 5 is not *violated* — both implementations write the role from server
code, off an admin-gated action, never from a payload. But the invariant that
made it easy to audit is gone, and a future change to the canonical function
would silently not apply to the path that runs.

**Recommended at the time:** delete `src/lib/villages.ts`, point
`admin/villages/actions.ts` at `src/lib/village.ts`, and keep the singular
module — it is the fuller one, it delegates role-raising to
`coordinator-requests.ts`, and it has the suspend/reactivate half.

**Closed 13 August 2026, the other way round.** `src/lib/villages.ts` is the one
with a screen behind it, and replacing the module that runs with the module that
does not is a refactor whose success is unobservable. So the live module absorbed
the live half of the singular one — `findVillageBySlug`, `getVillageController`,
the parish council and privacy-level accessors, and `checkVillageJoin` — and
`src/lib/village.ts` was deleted, along with the dead `appointCoordinator` and
`removeCoordinator` in `coordinator-requests.ts` that only it reached.

Two things were given up and both were already unreachable: `suspendVillage` and
`reactivateVillage`, which no screen could call. A village can still be activated
and not suspended. That is now a missing *feature* with nothing pretending
otherwise, rather than dead code that reads as one — and if it is wanted, it is a
form and an action over `updateMany` guarded on the status just read.

The third finding stands as a correction to `CLAUDE.md` rather than to the code:
two implementations do raise a role, and the second one has to exist, because an
application comes *from* a resident and a cold village has none. Both files now
say so.

## Gap 2 — the join code is still optional at registration

**Severity: medium** as assessed — **high in hindsight**, and the gap between
those two readings is the lesson. It was filed as "a feature is not wired up".
What it actually was: the only credential standing between a stranger and a
village's reports was optional, in a product whose whole premise is that the
village is the boundary. **Closed 13 August 2026** — see the foot of this
section.

`src/lib/village.ts:239` defines `checkVillageJoin`, and the migration comment
in `20260727180000_village_activation` describes the intended rule: a join code
is **required at registration whenever the village has one set**, rather than
being an optional shortcut to `VERIFIED_RESIDENT`.

Neither auth route does that. Both still read:

```ts
role: codeMatches ? "VERIFIED_RESIDENT" : "RESIDENT",
```

— `register/route.ts:145` and `complete-profile/route.ts:132`. The schemas make
it optional (`validations.ts:462`, `:525`), and a missing code is accepted; only
a *wrong* code is rejected (`register/route.ts:99-107`).

So anybody who can see a village in the picker can join it without a code. For
the one seeded sample village that is intentional. For an activated parish it is
not what the activation flow mints a code *for*, and `checkVillageJoin` is the
function that was written to close it — unreachable, along with the rest of its
module.

**Closed 13 August 2026.** Both routes call `checkVillageJoin`, which now lives
in `src/lib/villages.ts`. The code is required whenever the village has one; a
village with none is refused on `status` first, so the null branch is reachable
only by rows that predate activation, and `activateVillage` mints the code before
it flips the status so nothing new can land in that state.
`tests/village-join.test.ts` asserts the blank code, the empty string, the
whitespace-only case, normalisation, the legacy null and the status refusal.

Worth recording, because it is the reason this sat open for a fortnight: this was
not a missing feature. `checkVillageJoin` was complete, correct, commented and
referenced by four other files' documentation. Nothing called it, and nothing
could have told you that except counting the callers.

## Gap 3 — OneSignal reported failures as successes *(fixed in this pass)*

**Severity: medium. Now fixed.** Two defects in `src/lib/notifications.ts`:

**The app id was configured twice and only one name was read.** `APP_ID` came
from `ONESIGNAL_APP_ID` alone. The browser SDK can only read
`NEXT_PUBLIC_ONESIGNAL_APP_ID`, so a deployment that set only the public one —
the obvious mistake, since it is the one the SDK documentation names — had
devices subscribing happily while `isPushConfigured` was false and every
dispatch reported `not_configured`. The server now falls back to the public
variable, warns when only one is set, and warns loudly when the two name
**different** apps, which is the genuinely undeliverable state.

**A 200 from OneSignal was counted as a full delivery.** `createNotification`
returns `{ id, errors }`, and two everyday outcomes arrive with a success status:

- `errors: ["All included players are not subscribed"]` — nobody in the batch has
  a subscribed device. This is also exactly what a **wrong app id** looks like.
- `errors.invalid_aliases.external_id: [...]` — a partial miss, naming the
  external ids with no subscription behind them.

Both were previously counted as `sent: audience.length`. That number is what a
coordinator is told after approving a report, so the dashboard could say "42
neighbours alerted" when the answer was none. The response is now read: a total
failure returns `skipped: "failed"`, a partial marks only the missed recipients'
`Notification` rows as failed, and both are logged.

**Breadcrumbs added**, since every failure mode in this integration is silent:
`[push:config]` at boot, `[push:dispatch]` and `[push:response]` per send,
`[push:error]` on a non-2xx, and `[push:client]` in the browser for init, login
(with the external id and subscription id), and the permission answer. The full
checklist is now step 8 of `SETUP.md`.

**Verified correct and left alone:** the service worker is at
`public/onesignal/OneSignalSDKWorker.js` with `serviceWorkerPath` and
`serviceWorkerParam` pointing at it (`push-registration.tsx:53-56`);
`OneSignal.login(userId)` runs after `init` with the Supabase auth user id
(`:116`); `ONESIGNAL_REST_API_KEY` is server-only and applied by the SDK as
`Authorization: Key …`, which is the correct v5 scheme; the permission prompt is
a non-blocking banner whose click handler is the only caller of
`requestPermission()`; and the payload carries public columns only.

**Still unverified, and only a device can settle it:** the OneSignal dashboard's
service worker path must be `/onesignal/` — a 404 there reports a healthy init
and delivers nothing — and all three variables have to reach Vercel, with
`NEXT_PUBLIC_ONESIGNAL_APP_ID` present at **build** time.

## Gap 4 — a docstring points at a script that does not exist

**Severity: trivial.** `src/app/api/dashboard/export/route.ts:37` says the CSV
builder "is exercised by `scripts/check-incident-csv.ts`". That file is not in
the repository; the tests are `tests/incident-csv.test.ts`, run by Vitest in CI.

**Closed** — the docstring names the test file.

---

# Things that are correct and easy to break

Collected because each one is load-bearing and none of them is obvious from the
line it sits on.

- **Alerts fire on publish, never on file.** A report in the queue reaches no
  resident's phone (domain rule 6). Both publish paths — `applyModeration` and
  `announce()` — carry the same fan-out, and they are kept in step by hand.
- **`announce()` cannot throw.** It runs inside the reference-clash retry loop,
  where an exception would be read as a P2002 and file the report twice.
- **The rate limiter fails open; auto-approve fails closed.** Opposite defaults,
  both correct: a limiter that failed closed would block filing, and a village
  setting that failed open would publish a report because a `SELECT` failed.
- **The audit write precedes the act in exactly two places** — the CSV export and
  both erasure entry points — and is allowed to fail the request there. Everywhere
  else it follows a completed act and is swallowed.
- **`AuditLog` deletion is refused by a trigger, including to the table owner.**
  That is what makes domain rule 7 survive a careless `deleteMany`, and it is why
  `RETENTION.auditLogMonths` cannot be enforced from application code. UPDATE is
  refused too, **bar one**: severing `actor_id` to NULL while every other column
  stays byte-identical, which is what lets an account be deleted at all — the FK
  is `ON DELETE SET NULL`, so the cascade is an UPDATE.
- **Four types have no field that could carry `rawDescription`, `lat` or `lng`** —
  `AlertIncident`, `ReportIncident`, `ExportIncident`, `IncidentEmailInput`. The
  guard is structural, not a code review.
- **Every read of `parish_council` handles the column's absence**, and still
  should even though its migration is applied now: `getVillageController` falls
  back, `getVillageParishCouncil` distinguishes "not named" from "no column" by
  matching P2022/42703 narrowly, and the dashboard field is disabled with an
  explanation rather than failing on Save. A fresh clone or a restored copy can
  be behind. (Both functions live in `src/lib/villages.ts` now; this entry
  originally cited line numbers in `village.ts`, which no longer exists.)

---

# What this document cannot tell you

Static reading verifies structure. It cannot verify behaviour, and five things
here have never run at all:

1. **No push has reached a device.** Gap 3 fixed two defects by reading; the
   remaining failure modes are in a dashboard and a build environment.
2. **The retention job has never run against data.** It deletes files.
3. **Erasure has never touched a real bucket.** Both entry points delete objects.
4. ~~**`.github/workflows/database.yml` has never applied a migration.**~~
   **Corrected 13 August 2026**: it has applied one for real —
   `20260803120000_incident_village_numbering`, on 3 August, followed by both SQL
   files in order. Everything before that was applied by hand, and the workflow
   ran as a no-op until its `DIRECT_URL` secret was reachable. All ten are
   applied now.
5. **Auto-approve has never published a report.** Its migration *is* applied,
   which is the part that would otherwise have failed loudest.
6. **No village has ever been activated** through `/admin/villages`, so the join
   code this document spent two gaps on has never been minted in anger.

The suite in `tests/` covered **six** modules when this was written and covers
**eighteen** now — the six plus the compliance gate and its three documents, the
Markdown parser, the privacy level, the heat scale, the invite link, both
date-range resolvers, the incident reference, the PDF layout and the join check
that Gap 2 was about. It covers no route handler, no server action, no component
and no policy, by design: a test needing a database is a test CI cannot run on
every push. The gap that matters most is still the one named above — nothing
asserts that a village with auto-approve off queues its reports.
