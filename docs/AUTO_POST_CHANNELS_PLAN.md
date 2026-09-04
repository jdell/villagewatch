# Auto-posting a published report to a village's channels

**Status:** plan only. Nothing in this document is built.
**Written:** 24 August 2026, against `v0.1.42`. **Expanded:** 25 August 2026.
**Read this before writing any of it** — three of the decisions below are the
kind that look like tidying in a diff and are not.

This is the plan for turning "a coordinator copies the alert and pastes it into
a channel" into "the alert posts itself when a report is published". It covers
what exists today, where the hook belongs, the record every post has to leave
behind, the rules that decide whether a post happens at all, and then one
detailed section per channel — what it takes to set up, what the API actually
looks like, what it costs, and what it would take to change the answer.

It is not a design document for the codebase as a whole — `CLAUDE.md` is that,
and every rule quoted here is enforced somewhere in it. It is not a numbered
item of work either; `BACKLOG.md` N7 and N8 are the entries this expands.

**Contents**

1. [Current state](#1-current-state)
2. [Architecture — where the hook goes](#2-architecture--where-the-hook-goes)
3. [The `ChannelPost` table](#3-the-channelpost-table)
4. [The safety rules](#4-the-safety-rules)
5. [Item 1 — the shared dispatcher](#5-item-1--the-shared-dispatcher)
6. [Item 2 — Telegram Channel](#6-item-2--telegram-channel)
7. [Item 3 — Facebook Page](#7-item-3--facebook-page)
8. [Item 4 — WhatsApp](#8-item-4--whatsapp)
9. [Message format](#9-message-format)
10. [Privacy considerations](#10-privacy-considerations)
11. [Village settings](#11-village-settings)
12. [Effort](#12-effort)
13. [Recommended order](#13-recommended-order)
14. [Notes for whoever implements this](#14-notes-for-whoever-implements-this)

---

## 1. Current state

### What is built

**One alert format, three surfaces, no transport.**
`formatIncidentAlert` in `src/lib/format-alert.ts` renders a published incident
as a block of text — severity emoji and label, title, `📍 landmark · time ago`,
a truncated description, the pattern note when the report is recurring, and an
absolute link. The link is built first and the description gets whatever is left
of `WHATSAPP_POST_MAX_CHARS` (900), capped at `ALERT_DESCRIPTION_MAX_CHARS`
(240), so a very long report loses its summary rather than the address of the
full one. The module is client-safe on purpose: `constants.ts` and `format.ts`
and nothing else, which is what lets the server log and the coordinator's
clipboard carry the identical text.

`CopyAlert` (`src/components/copy-alert.tsx`) renders three buttons over that
one text — **Copy alert**, **Open WhatsApp** (`https://wa.me/?text=`) and
**Share to Facebook** (`sharer.php`, with the alert copied to the clipboard
first because Facebook drops `quote` more often than it honours it). It appears
on three coordinator-only surfaces: the moderation queue the moment a report is
approved, any published report's own page, and the wizard's success screen when
a coordinator files into an auto-approving village.

**Per-village WhatsApp configuration, and it already works.** Four columns on
`Village`:

| Column | Meaning |
| --- | --- |
| `whatsappChannelUrl` | The public invite link. Rendered on `/settings` as "Follow on WhatsApp" for every resident. |
| `whatsappChannelId` | The code inside that link. **Derived**, never typed — `extractChannelCode` in `src/lib/validations.ts` is the only thing that sets it from the application. |
| `whatsappEnabled` | Off by default. |
| `whatsappMinSeverity` | `HIGH` by default, against push's `LOW`. |

`src/lib/whatsapp-channel.ts` reads and writes them, `saveChannelSettingsAction`
in `src/app/(app)/dashboard/actions.ts` is the write path, and the change is
audited as `village.channel_update`, toned `sensitive`.

**A logging stub where the transport used to be.** `logIncidentAlert` applies
the three refusals — `village_disabled`, `no_channel`, `below_threshold` — and
then writes the alert to the server console as `[whatsapp:alert] channel X ← …`.
`logDigestAlert` does the same for the weekly digest and is deliberately **not**
severity-gated. Both are called from `src/lib/notifications.ts` and
`src/app/api/digest/route.ts` respectively.

**Push and email exist and are unrelated to this.** OneSignal is the resident
broadcast (`notifyIncidentPublished` → `dispatch`), Resend sends the one email
VillageWatch renders (the welcome), and Slack is the staff channel. All three
share the contract this work has to join: **nothing throws, and callers `await`
rather than detach**, because on Vercel the instance is frozen when the response
returns.

### What is not built

- **Nothing posts anywhere.** There is no outbound HTTP call to any social
  platform in the codebase. The WhatsApp relay that used to sit behind
  `WHATSAPP_CHANNEL_API_URL` / `WHATSAPP_CHANNEL_API_TOKEN` was removed
  because nothing was ever pointed at one, so its success path had never run.
  Both variables are gone from `.env.example`, which now says in as many words
  that there is nothing to configure.
- **No Telegram anything.** One line in `BACKLOG.md` (N7) and no code.
- **No Facebook Graph integration.** The only Facebook code is
  `facebookShareUrl`, which builds a `sharer.php` link for a human to click.
  There is no app, no token, no page.
- **No record that a post happened.** No table, no `AuditLog` row, no external
  message id. "Did that alert reach the channel?" is answerable today only by
  looking in the channel.
- **No delete path.** `removeIncident` and `eraseAccount` in
  `src/lib/erasure.ts` tombstone the row and delete the media; they have nothing
  to un-post, because nothing was posted.
- **Nobody has pasted one for real.** `PROJECT_STATE.md` lists the WhatsApp
  copy button and the Facebook button among the things built and never exercised
  against reality. The first automated post would therefore be the first post of
  any kind.

### The one fact that shapes everything below

**There is no publish API route.** A report becomes `PUBLISHED` by two paths and
they are different kinds of thing:

1. `applyModeration` in `src/lib/moderation.ts` — a coordinator clicks Approve.
   It is reached from a **server action**, not a route handler.
2. `announce()` in `src/app/api/incidents/route.ts` — a village with
   `autoApprove` on files a report straight to `PUBLISHED`.

Both call `notifyIncidentPublished`. `CLAUDE.md` already flags that the fan-out
set is defined twice and has to be kept in step by hand. A hook on "the publish
API route" would catch the auto-approve path and silently miss every report a
coordinator approves — which is the majority of them, since `autoApprove`
defaults off.

---

## 2. Architecture — where the hook goes

**Inside `notifyIncidentPublished`, exactly where `logIncidentAlert` already
sits.** That function is the join point both publish paths already share, it
already returns a `channel` field describing what happened to the WhatsApp half,
and it already cannot throw. Replacing the log line with a dispatcher is a
change to one call site and no change at all to either publish path.

```
applyModeration ─┐                            ┌─> dispatch()            (push, OneSignal)
                 ├─> notifyIncidentPublished ─┤
announce()      ─┘                            └─> dispatchToChannels()  (new)
                                                    ├─ telegram adapter
                                                    ├─ facebook adapter
                                                    └─ whatsapp adapter (the log line)
```

A new directory, `src/lib/channels/`, because one file per platform is what
keeps a platform's quirks out of the shared path:

```
src/lib/channels/
  index.ts        dispatchToChannels() — resolve, gate, render, fan out, record
  types.ts        ChannelAdapter, ChannelMessage, ChannelPostResult, VillageChannelConfig
  config.ts       reads/writes VillageChannel rows; server only
  telegram.ts     Bot API
  facebook.ts     Graph API
  whatsapp.ts     the existing log line, moved
```

One adapter interface, and it is deliberately narrow:

```ts
type ChannelAdapter = {
  kind: ChannelKind;                        // "telegram" | "facebook" | "whatsapp"

  /** Post one message. NEVER throws — every failure is a returned value. */
  post(
    config: VillageChannelConfig,
    message: ChannelMessage,
  ): Promise<ChannelPostResult>;

  /** Un-post one, for Article 17. Never throws. */
  remove(
    config: VillageChannelConfig,
    externalId: string,
  ): Promise<{ ok: boolean; error?: string }>;

  /** "Can I actually post here?" — run when a coordinator saves the setting. */
  verify(
    config: VillageChannelConfig,
  ): Promise<{ ok: true; label: string } | { ok: false; error: string }>;
};
```

`verify` is not optional politeness. A coordinator pasting a channel id into a
form has no way to find out they got it wrong: the failure is a post that never
appears, weeks later, reported by nobody. Both platforms offer a cheap read
(`getChat`, `GET /{page-id}`) that answers the question, and the dashboard
should run it on save and store the answer.

`dispatchToChannels` owns everything that is not platform-specific — the
resolve, the gates, the render, the fan-out and the record. §5 is its detailed
breakdown.

### Outbound pacing

Follow `src/lib/police-api.ts`, not `src/lib/rate-limit.ts`, and the distinction
matters enough that somebody will otherwise "fix" it. The `rate_limit` table is
a **security** limit on an **inbound** request, counted in Postgres because
per-instance counters hand a fresh quota to whoever wakes a cold lambda. This is
a **courtesy** pace on an **outbound** call, with no adversary, already
serialised inside one publish. A module variable is the right shape, and a
Postgres round trip in front of every post would be a cost with nothing bought.

### Retries

**Inline retry once, on a 5xx or a timeout, and no further.** Then leave the
`failed` row for a sweep. The sweep should ride the **existing** nightly
retention cron rather than becoming a new one: `vercel.json` already carries
three and Vercel's Hobby plan allows two (`BACKLOG.md` T11), so a fourth entry
is a rejected deploy.

A retry has to check the age — see safety rule **S8**.

---

## 3. The `ChannelPost` table

Every post leaves a row. It is not bookkeeping for its own sake; three separate
things are impossible without it.

```prisma
/// One attempt to put one published report on one village's channel.
///
/// Written by `dispatchToChannels` on every attempt, successful or not. This is
/// the delivery record — deliberately NOT an `AuditLog` row, for the reason
/// `src/lib/whatsapp-channel.ts` already gives: a post is a deterministic
/// consequence of `incident.publish` plus the village's own configuration, both
/// already in the trail, and a row per post would bury the human actions around
/// it.
model ChannelPost {
  id String @id @default(uuid()) @db.Uuid

  villageId String  @map("village_id") @db.Uuid
  village   Village @relation(fields: [villageId], references: [id], onDelete: Cascade)

  incidentId String   @map("incident_id") @db.Uuid
  incident   Incident @relation(fields: [incidentId], references: [id], onDelete: Cascade)

  /// "telegram" | "facebook" | "whatsapp". A `String` and not an enum, for the
  /// reason `Village.privacyLevel` and `Village.mode` are: narrowing happens in
  /// Zod on the way in and in a resolver on the way out, so a channel added
  /// later is not a migration on a table with rows in it.
  kind String

  /// "posted" | "failed" | "skipped".
  status String

  /// Why, when it is "skipped" or "failed": `village_disabled`, `no_target`,
  /// `below_threshold`, `not_anonymised`, `too_old`, `rate_limited`,
  /// `permission_denied`, `platform_error`.
  reason String?

  /// The platform's own id for the post — Telegram's `message_id`, Facebook's
  /// `{page-id}_{post-id}`. **This is what makes erasure possible**; without
  /// it there is nothing to send to `deleteMessage` or `DELETE /{post-id}`.
  externalId String? @map("external_id")

  /// The platform's own error text, verbatim, for an operator. Never rendered
  /// to a resident and never to a coordinator unedited — the dashboard shows a
  /// sentence written here, the way `describeAuthError` does for Supabase.
  detail String?

  attempts Int @default(1)

  postedAt   DateTime? @map("posted_at")
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")

  /// One row per report per channel. This is the idempotency guard, not a
  /// tidiness constraint — see S9.
  @@unique([incidentId, kind])
  @@index([villageId, status])
  @@index([status, createdAt])
  @@map("channel_posts")
}
```

### Why each of those columns is there

- **`externalId` is the erasure hook.** Article 17 does not stop at the tenant
  boundary. `removeIncident` has to be able to call Telegram's `deleteMessage`
  and Facebook's `DELETE /{post-id}`, and it cannot do either without the id the
  platform handed back. A design that logged success and discarded the id would
  make every post permanent.
- **`@@unique([incidentId, kind])` is the idempotency guard.** `announce()` runs
  inside the create loop's reference-clash retry, where an exception is read as
  a P2002 and the whole create is attempted again. A retry that re-posted would
  put the same report on a public feed twice. The unique key is what makes the
  second attempt a no-op rather than a duplicate.
- **`status: "failed"` plus `attempts` is what the retry sweep reads.** Without
  a row, a transient 502 is a post that silently never happened, and nobody
  finds out.
- **`status: "skipped"` plus `reason` is what makes a *deliberate* non-post
  visible.** "This report was not posted because the AI could not anonymise it"
  is a thing a coordinator is entitled to see, and it is indistinguishable from
  a bug unless it is written down.
- **`detail` holds the platform's words, not ours.** An operator needs Meta's
  `error_subcode` to tell an expired token from a revoked permission; a
  coordinator needs a sentence. Same split `auth-errors.ts` already makes.

### Row-level security

`prisma/sql/rls_policies.sql` **must be re-run** with the migration that adds
this table — a new table arrives with RLS **off** and every row readable with
the anon key. It wants a village-scoped coordinator SELECT and nothing else: no
INSERT, UPDATE or DELETE to anybody, on `police_crimes`' reasoning. A client
that could write here could fabricate a delivery record for a post that never
happened, or erase the id that erasure depends on.

`postgis.sql` does **not** need re-running: there is no geography column here,
deliberately.

### Who reads it

1. **The dashboard** — the last handful of posts per channel with their status,
   which is the only way a coordinator finds out a post failed.
2. **The retry sweep**, on the nightly retention cron.
3. **`removeIncident` / `eraseAccount`**, to un-post.
4. **The nightly retention sweep again**, to un-post the posts of a report that
   has just been archived past `RETENTION.incidentArchiveMonths`.

### Retention of the rows themselves

They carry no personal data of their own — a village id, an incident id, a
platform id and a status — so they live as long as the incident does and go with
it on the `onDelete: Cascade`. Note that the cascade genuinely fires here,
unlike `IncidentVote`'s: `removeIncident` keeps the incident row as a tombstone,
so the *rows* survive an erasure and it is the explicit un-post that has to
happen first. Delete the `ChannelPost` row **after** the platform confirms the
delete, for the same reason the retention job deletes storage objects before
their rows: drop the row first and the only record of what to delete is gone.

---

## 4. The safety rules

These are the gates in `dispatchToChannels`, in the order it applies them. Each
one is a sentence somebody will be tempted to relax, so each has its reason
attached.

| # | Rule | Why |
| --- | --- | --- |
| **S1** | **Published only, at publish time.** The dispatcher is reached only from `notifyIncidentPublished`, which is called only on a `PUBLISH`. | A report in the queue has not cleared moderation (domain rule 6) and must never reach residents, let alone the public. |
| **S2** | **Skip when `anonymized === false`.** Record `status: "skipped"`, `reason: "not_anonymised"`. | The load-bearing new rule. See below. |
| **S3** | **Never the reporter.** No name, no id, no initial, no "reported by". | Structural: `AlertIncident` and the new `ChannelMessage` have **no field** that could carry one, the same guard `IncidentEmailInput`, `ExportIncident` and `ReportIncident` use. |
| **S4** | **Never coordinates.** No `lat`, no `lng`, no map pin, and **no `sendLocation`**. | They were jittered by `LOCATION_FUZZ_METERS` on the way in (domain rule 2), so a public pin is precise enough to point at a house and not precise enough to be right about which one — the worst of both. `locationText`, the anonymised landmark, is the location this feature publishes. |
| **S5** | **Never `rawDescription`.** | Domain rule 1 does not stop at the village boundary. The public column is `description`; the type has no field for the other one. |
| **S6** | **No media, on any channel, in any phase.** | Two reasons and the second is the sharper one. The bucket is private and its URLs are signed and expiring, so there is no public URL to attach. And `src/lib/media/face-blur.ts` detects **faces** — it covers nobody's number plate, house number or the address label on a parcel, because nothing looks for them. A face-covered photo is safe for the village's own map and is not automatically safe for an open feed. |
| **S7** | **Every failure is swallowed.** No throw escapes the dispatcher, ever. | `announce()` runs inside the reference-clash retry loop, where an exception is read as a P2002 and the report is filed **a second time**. And publishing must not fail because a social platform did — the incident is on the map and the push has gone out either way. Same contract `notifications.ts`, `slack.ts` and `email/send.ts` all carry. |
| **S8** | **Age cap.** Nothing older than a few hours is posted at all; a row that ages out is marked `skipped`, `reason: "too_old"`, and never retried. | A "burglary overnight" alert posted three days late reads to a follower as something that happened last night. A retry loop with no age check is a machine for publishing yesterday's alarm. |
| **S9** | **Idempotent per report per channel.** `@@unique([incidentId, kind])`. | The same report on a public feed twice is worse than not posted, and the retry loop above makes it reachable. |
| **S10** | **Fail closed on the config read; fail open on delivery.** An unreadable `VillageChannel` row posts nothing. A failed post never blocks the publish. | Two directions, deliberately. Not knowing what the village asked for means not posting — `getVillageAutoApprove`'s reasoning, and the opposite of `rate-limit.ts`'s. A tidying pass that makes them consistent is a regression and will look like an improvement in the diff. |
| **S11** | **Per-channel severity floor**, defaulting `HIGH`. | The existing `whatsappMinSeverity` default, and for the existing reason: a missing cat does not belong on a public feed. Push defaults `LOW` because push reaches residents who asked for it. |
| **S12** | **Erasure and archiving reach outside.** `removeIncident`, `eraseAccount` and the nightly archive pass all un-post. | Article 17, and `/privacy` §7's retention promise. **A deletion is not an un-send** — a post that has been forwarded, screenshotted or indexed is gone from the channel and not from the world — and the notice has to say so rather than implying otherwise. |

### S2 in full, because it is the one this feature invents

**A report whose `anonymized` is false must never be auto-posted.**

Today the chain has a human in it. `CopyAlert` reads `anonymized` and renders a
red warning saying the text is the reporter's own wording, and a coordinator
decides whether to paste it. Auto-posting removes that person. Combine it with
`autoApprove` — which a village may switch on, and which removes the *other*
person — and a report can go from a resident's phone to a public feed with no
human having read it at any point, carrying verbatim wording that the AI pass
failed to rewrite because the key was missing, the call timed out, or the
reporter declined the rewrite.

`Incident.anonymized` already records exactly this and defaults to `false`. The
gate is one condition, it fails in the safe direction, and the dashboard should
say plainly that a report the AI could not rewrite is alerted in-app and not
posted publicly. A village that finds that surprising has learned something true
about what the AI pass is for.

---

## 5. Item 1 — the shared dispatcher

**The foundation. Land it first, with no new channel attached, so that nothing
observable changes when it merges.**

### What it does, in order

```ts
export async function dispatchToChannels(
  incident: NotifiableIncident,
): Promise<ChannelDispatchResult> {
  // 1. Resolve. Fails CLOSED — an error here posts nothing (S10).
  const channels = await getVillageChannels(incident.villageId);
  if (!channels) return { channels: [] };

  // 2. Gate once, globally. S2 and S8 do not depend on which channel it is.
  const blocked = globalRefusal(incident);           // "not_anonymised" | "too_old" | null

  // 3. Render once. One payload, adapters own the envelope (§9).
  const message = buildChannelMessage(incident);

  // 4. Fan out. Each adapter gets the per-channel gates applied first (S11),
  //    and each result is recorded whatever it is.
  const results = await Promise.all(
    channels.map((channel) => postAndRecord(channel, incident, message, blocked)),
  );

  return { channels: results };
}
```

`Promise.all` rather than sequential: three channels are three independent
outbound calls and one being slow should not delay the others. Every branch
inside `postAndRecord` resolves — none rejects — so `Promise.all` cannot reject
either, which is what makes S7 structural rather than a `try/catch` somebody can
delete.

### What it changes at the call site

One line in `src/lib/notifications.ts`. `notifyIncidentPublished` currently
returns `{ ...push, channel }`; it returns `{ ...push, channels }` instead, and
`PublishDispatchResult` widens. The two publish paths are untouched, which is
the whole point of landing this first.

### What ships with it

- The `ChannelPost` migration, plus `rls_policies.sql` re-run (§3).
- The `VillageChannel` migration (§11), with the WhatsApp columns left alone.
- `dispatchToChannels`, `buildChannelMessage`, the adapter interface, and the
  WhatsApp adapter — which is `logIncidentAlert` moved, behaviour identical.
- The S2 gate, the S8 age cap, the S9 idempotency guard.
- The erasure hook: `removeIncident` and `eraseAccount` call
  `removeChannelPosts(incidentId)`, which is a no-op while nothing has posted.
- Dashboard scaffolding: the channels card, rendering only WhatsApp for now,
  plus the recent-posts list off `ChannelPost`.
- Tests: the gates as pure functions (severity floor, `anonymized`, status, age
  cap), and `buildChannelMessage`'s output. No secret, no database, no browser —
  the constraint the suite is built on.

### What it deliberately does not do

It does not send anything anywhere. At the end of Phase 1 the WhatsApp adapter
still writes a log line and a coordinator still pastes. That is what makes it
reviewable: the diff is large, the behaviour change is nil, and the first real
post is a separate, smaller commit that can be watched.

---

## 6. Item 2 — Telegram Channel

**The best first channel, and it is not close.** Free, official, no review, no
business verification, no per-message cost, and the whole transport is one
`POST` with a JSON body. If any of the dispatcher's assumptions are wrong, this
is where they surface, at the price of a bot token.

### Setup, end to end

**What we do once, for the deployment:**

1. In Telegram, message **@BotFather** → `/newbot` → give it a display name
   ("VillageWatch") and a username ending in `bot` (`villagewatch_alerts_bot`).
2. BotFather returns a token shaped `123456789:AAH…`. That is the credential.
   Server-only, into Vercel as `TELEGRAM_BOT_TOKEN`, never `NEXT_PUBLIC_`.
3. Optional and worth doing: `/setuserpic` with the shield from
   `src/components/logo.tsx`, `/setdescription`, and `/setabouttext`. A bot with
   no avatar in a village channel's admin list looks like something a
   coordinator should be suspicious of.

**What a coordinator does once, per village** — and this is the whole reason
Telegram is cheap, because there is no OAuth flow to build:

4. In Telegram: **New Channel** → name it → public (which gives it a
   `@username`) or private.
5. Channel → **Administrators** → **Add Administrator** → search for the bot's
   username → grant **Post Messages**, and **Delete Messages** as well, because
   that is what makes erasure possible later (S12).
6. Find the chat id. A public channel *is* its username: `@histon_watch`. A
   private one is a numeric id beginning `-100…`, which the coordinator gets by
   forwarding any channel message to `@userinfobot`, or which we resolve for
   them from the invite link.
7. Paste it into `/dashboard` → Village settings → Channels → Telegram, and
   save. The app calls `getChat` and `getChatMember` (below) and shows the
   resolved channel title back, so a wrong id is caught on the spot rather than
   discovered weeks later by nobody.

### The API

**Posting:**

```
POST https://api.telegram.org/bot<TOKEN>/sendMessage
Content-Type: application/json

{
  "chat_id": "@histon_watch",
  "text": "🔴 HIGH — Shed broken into overnight\n📍 The lane behind …",
  "link_preview_options": { "is_disabled": true },
  "disable_notification": false
}
```

Success:

```json
{ "ok": true, "result": { "message_id": 4127, "date": 1756089600, "chat": { … } } }
```

`result.message_id` is the `ChannelPost.externalId`. Store it or the post is
permanent.

Failure — and note it is a **200 with `ok: false`** as often as it is a 4xx, so
never branch on the HTTP status alone:

```json
{ "ok": false, "error_code": 403, "description": "Forbidden: bot is not a member of the channel chat" }
```

| Code | Meaning | What to do |
| --- | --- | --- |
| 400 | `chat not found` — wrong id | Permanent. `failed`, `reason: "no_target"`, surface "reconnect" on the dashboard. Do not retry. |
| 403 | Bot removed, or not an admin, or lacks Post Messages | Permanent. Same treatment. This is the common one, because a coordinator tidying the admin list is how it happens. |
| 429 | Rate limited | `parameters.retry_after` in the **body**, in seconds. Honour that number rather than reconstructing it from a header. |
| 5xx | Telegram's problem | Retry once inline, then leave the row for the sweep. |

**Limits:** roughly 30 messages/second overall and ~20 per minute to any one
chat. One village publishing one report is nowhere near either; the pacer (§2)
exists for the day a sweep iterates. `text` caps at **4096 characters** and the
alert is budgeted at 900, so it is comfortably inside.

**Verifying on save:**

```
GET https://api.telegram.org/bot<TOKEN>/getChat?chat_id=@histon_watch
GET https://api.telegram.org/bot<TOKEN>/getChatMember?chat_id=@histon_watch&user_id=<bot id>
```

The first proves the chat exists and the bot can see it, and returns the title
to render back. The second proves the bot is an administrator and that
`can_post_messages` is true — the failure that otherwise shows up as silence.

**Deleting, for S12:**

```
POST https://api.telegram.org/bot<TOKEN>/deleteMessage
{ "chat_id": "@histon_watch", "message_id": 4127 }
```

Needs the `can_delete_messages` right, which is why step 5 asks for it up front.
A bot can delete its own messages in a channel it administers.

### Markdown, and why the first version should not use it

Telegram offers `parse_mode` of `MarkdownV2` or `HTML`, and the choice matters
more than it looks:

- **`MarkdownV2` requires escaping eighteen characters** — ``_ * [ ] ( ) ~ ` >
  # + - = | { } . !`` — anywhere in the text, including inside ordinary prose.
  `locationText` is resident-written. "Mill Lane, opp. the shop" contains two of
  them. An unescaped one does not render oddly; it **fails the send outright**
  with a 400, which means a report that silently never posted because somebody
  typed a full stop.
- **`HTML` needs three escapes** (`&`, `<`, `>`) and gives `<b>`, `<i>` and
  `<a href>`. If bold severity is wanted, this is the safe way to get it.
- **Plain text needs none.** `formatIncidentAlert` deliberately carries no
  `*bold*` markup already, precisely because the same text is as likely to be
  pasted into a parish newsletter as into a channel.

**Recommendation: ship plain text.** If a later pass wants the severity line
bold, use `parse_mode: "HTML"` with a three-character escape applied to every
interpolated field — never `MarkdownV2`, and never an escape applied to the
assembled string instead of to each field, which is the bug that lets a
resident's punctuation break the send.

### `sendLocation` — do not

Telegram has `sendLocation` with `latitude`/`longitude` and it is the obvious
next idea. **It breaches S4 and should never be built.** Every coordinate in
this database was jittered by `LOCATION_FUZZ_METERS` on the way in (domain rule
2). A pin on a public channel is therefore precise enough to point at a house
and not precise enough to be right about which one, which manages to be both a
privacy leak and a false statement. `AlertIncident` has no `lat`/`lng` field for
exactly this reason and `ChannelMessage` must not grow one.

The anonymised landmark — "the lane behind the village hall" — is the location
this feature publishes, and it is the right grain.

### `sendPhoto` — not in any planned phase

`sendPhoto` takes a URL or an upload, with a 1024-character caption. It is
blocked twice over by S6:

- **There is no public URL to send.** The `incident-media` bucket is private and
  `src/lib/media/storage.ts` issues signed, expiring URLs. Telegram fetches the
  URL server-side, so an expiring link is a photo that works in testing and 404s
  in a week — and making the bucket public is a much larger decision than this
  feature.
- **Face blur covers faces.** `src/lib/media/face-blur.ts` runs BlazeFace and
  covers what it detects. Nothing in the pipeline looks for a number plate, a
  house number, a street sign or the address label on a parcel, because nothing
  was built to. A photo that is correctly redacted for the village's own map is
  not automatically fit for an open feed, and the difference is not something
  the code can assert.

If images are ever wanted, they are their own project: a public bucket or a
proxy route, a second redaction pass that looks for text, and a paragraph in
`/privacy`. Link only until then.

### Per-village configuration

Three settings, and the token is the interesting one:

| Setting | Column | Notes |
| --- | --- | --- |
| `telegram_enabled` | `VillageChannel.enabled` | Off by default, like every other public surface. |
| `telegram_channel_id` | `VillageChannel.target` | `@username` or `-100…`. Verified on save; the resolved title is stored in `label` and rendered back. |
| `telegram_bot_token` | `VillageChannel.credential` | **Nullable, and normally null.** |

**On the token.** The default and expected arrangement is **one platform bot**:
`TELEGRAM_BOT_TOKEN` in the environment, added as an admin to each village's
channel, with the village supplying only a chat id. That is a smaller surface
than the WhatsApp columns, needs no encryption at rest, and means a coordinator
never handles a credential.

The per-village column exists anyway, and nullable, because some villages will
want their own bot — a parish that already runs one, or one that would rather
the posts came from a name they chose. `credential` falls back to the platform
token when it is null. Where it is set it is a write credential for somebody
else's channel and is encrypted at rest exactly like the Facebook token (§7),
never returned to the dashboard, and never logged.

This is the one place Telegram departs from `CLAUDE.md`'s rule that "nothing
about a channel is an environment variable". The rule was written about
*which channel* — that is still per village, and always will be. What is
platform-level here is *who is posting*, which is VillageWatch's own identity.

### Why it is the best first channel

- **Zero review, zero verification, zero cost.** No App Review, no Meta business
  verification, no per-message billing. Ten minutes from `/newbot` to a post.
- **The transport is one POST.** No OAuth, no token exchange, no refresh, no
  reconnect state to design.
- **Failures are legible.** A 403 says the bot is not in the channel. Compare
  Meta's `error_subcode`.
- **It proves the dispatcher.** Everything in §5 — the gates, the record, the
  external id, the un-post, the dashboard states — gets exercised against a real
  platform before the expensive one is built.
- **The un-post actually works**, which not every platform can say.
- **It is genuinely useful.** A village that wants a public feed and does not
  want a Facebook Page has nothing today.

---

## 7. Item 3 — Facebook Page

The most work of the three, and most of the cost is calendar rather than
engineering. The code is a day of Graph calls; the token lifecycle is three
days; App Review is two to six weeks and is not ours to shorten.

### Setup, end to end

**What the village already has, usually:** a Facebook Page. Most parishes run
one. This feature posts to theirs — it does not create one, and it should not.

**What we do once, for the deployment:**

1. **Create a Facebook App** at developers.facebook.com — type *Business*,
   linked to a Meta Business Account.
2. **Add Facebook Login for Business** as a product, and set the valid OAuth
   redirect URI to `<APP_ORIGIN>/api/channels/facebook/callback`. It has to
   match exactly, including the scheme and any trailing slash, and a mismatch
   fails on the *return* leg with an error the user sees.
3. **Request permissions.** Three, and all three need review:
   - `pages_show_list` — so the coordinator can pick which Page.
   - `pages_read_engagement` — required alongside the next one.
   - `pages_manage_posts` — the one that actually publishes.
4. **Business verification**, which Meta requires for a business-type app
   requesting Page permissions. Documents about the operating company —
   Yakasista Ltd — and it is a separate queue from App Review.
5. **App Review.** A written justification per permission and a **screencast of
   the exact flow** — a reviewer signing in, picking a Page, and seeing a post
   appear. Reviewers reject vague submissions as a matter of routine; budget a
   rejection round.
6. Move the app from Development to **Live**. Until then only people listed as
   app developers or testers can grant the permissions, which is fine for
   building and useless for a village.

**What a coordinator does, per village:**

7. `/dashboard` → Channels → Facebook → **Connect**. That opens Meta's login
   dialog, they approve the three permissions, pick their Page, and land back on
   the callback. They must be an **admin of that Page** — an editor cannot grant
   `pages_manage_posts`.

### The API

**Posting:**

```
POST https://graph.facebook.com/v20.0/{page-id}/feed
Content-Type: application/x-www-form-urlencoded

message=<the alert, minus its trailing "View details:" line>
&link=https://villagewatch.app/incidents/abc123
&access_token=<page access token>
```

Success: `{ "id": "{page-id}_{post-id}" }`. That whole string is the
`ChannelPost.externalId`.

**Deleting, for S12:**

```
DELETE https://graph.facebook.com/v20.0/{page-id}_{post-id}?access_token=<page token>
```

**Errors** come back as a structured object and the subcode is what matters:

```json
{ "error": { "message": "…", "type": "OAuthException",
             "code": 190, "error_subcode": 460, "fbtrace_id": "…" } }
```

| Code | Meaning | What to do |
| --- | --- | --- |
| 190 | Invalid or expired token. Subcodes: 458 app removed, 460 password changed, 463 expired, 467 invalidated | Permanent until reconnected. Mark `failed`, `reason: "permission_denied"`, set the channel to a **Reconnect** state on the dashboard. |
| 200 | Permission missing — usually `pages_manage_posts` was not granted | Same. |
| 4 / 17 / 32 / 613 | Rate or throttling limits | Retry-with-backoff on the sweep. Page-level limits scale with engaged users and posting a few times a day is nowhere near them. |
| 100 | Bad parameter — a malformed `link` is the usual cause | Permanent; log `detail` and do not retry. |

**Pin the API version.** `v20.0` is the version named in this document; pin
whatever is current when it is built, put it in `FACEBOOK_GRAPH_VERSION`, and
diary its deprecation. Meta retires a version roughly every two years and an
unpinned call breaks on their schedule rather than ours.

### Token management — the part that is actually the work

Three tokens, and only the third is useful:

1. **Short-lived user token** (~1–2 hours) comes back from the login dialog.
2. **Long-lived user token** (~60 days):
   ```
   GET https://graph.facebook.com/v20.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id=<FACEBOOK_APP_ID>
     &client_secret=<FACEBOOK_APP_SECRET>
     &fb_exchange_token=<short-lived token>
   ```
3. **Page access token**, derived from the long-lived user token:
   ```
   GET https://graph.facebook.com/v20.0/me/accounts?access_token=<long-lived user token>
   ```
   Returns one entry per Page the user administers, each with its own
   `access_token`. That is what gets stored.

**A page token derived this way does not expire on a clock**, which is the good
news, and it dies without warning on any of: the granting user changing their
Facebook password, removing the app, losing their admin role on the Page, the
app's permissions changing, or a Meta security event. So it needs active
management rather than a `setInterval`:

- **Store `verifiedAt`** on the channel row.
- **Check liveness on a schedule** with `GET /debug_token?input_token=…
  &access_token=<app-id>|<app-secret>`, which returns `is_valid`, `expires_at`
  and the granted `scopes` — the one call that answers all three questions.
  Ride the **existing nightly retention cron**; a fourth `vercel.json` entry is
  a rejected deploy on Hobby (`BACKLOG.md` T11).
- **Render a Reconnect state**, not a silence. A dead token whose only symptom
  is that posts stopped is the failure this whole section exists to avoid.
- **Never return the token to the browser.** The form shows "Connected as
  *Histon Parish Council*, reconnect" and never the value.

### Storing the token

A Page access token is a write credential for somebody else's Page. It must not
land in a column any grant can reach.

`prisma/sql/rls_policies.sql` grants SELECT on `villages` **per column**,
specifically so a new column arrives withheld — but a table with **no** grant at
all is a stronger guarantee than a list somebody has to remember not to extend.
Two options, in order of preference:

1. **`VillageChannel.credential`, on a table with RLS enabled and no policy**,
   the way `rate_limit` is. Prisma is the table owner and reads it; PostgREST
   cannot, whatever key is presented. Encrypt at rest with AES-256-GCM through
   `node:crypto` (already a server dependency — `src/lib/geo.ts` uses it) under
   a `CHANNEL_TOKEN_KEY` env var, so a database dump is not a set of live Page
   tokens.
2. **Supabase Vault**, pre-installed in every Supabase project. Heavier, and it
   puts a second access path in front of a value only one module reads.

### The card is no longer generic — superseded 4 September 2026

This section used to say the card would be generic and that it was the right
outcome, because `/incidents/[id]` is behind `requireSession()` and a crawler
landed on the sign-in redirect. That reasoning still holds for the *detail*
page, which is unchanged and still behind the session.

What changed is the link. `incidentUrl` in `src/lib/format-alert.ts` now builds
from `publicIncidentPath` and points at **`/incident/[id]`** — the public
preview, which renders a category, a severity, a date, a village and about a
hundred characters of the anonymised description, and exports its own
`opengraph-image`. So a shared report now carries a per-incident card.

That is the escape hatch this section named: *"a dedicated public OG route that
renders the category, the area and the date and nothing else — a separate
decision with its own privacy paragraph."* It was taken deliberately and the
privacy paragraph exists — `/privacy` §6, "Anyone given a link to a published
report", plus the landing FAQ.

**The original warning still stands and is worth restating**: do not fix
anything here by making `/incidents/[id]` crawlable. The two paths differ by one
letter and by everything else — the plural renders the full description, the
landmark, the map pin, the media and the votes to a signed-in resident. The
preview is a separate page written to be scraped, and it is `noindex`.

### Per-village configuration

| Setting | Column | Notes |
| --- | --- | --- |
| `facebook_enabled` | `VillageChannel.enabled` | Off by default. |
| `facebook_page_id` | `VillageChannel.target` | Numeric Page id, captured from `/me/accounts` during connect — never typed. |
| `facebook_page_token` | `VillageChannel.credential` | Encrypted at rest. Never rendered, never logged, never returned to the browser. |

Plus, per deployment: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` (server only),
`FACEBOOK_GRAPH_VERSION`, and `CHANNEL_TOKEN_KEY`.

`VillageChannel.label` holds the Page name so the dashboard can say which Page
is connected, and `verifiedAt` / `lastError` carry the reconnect state.

---

## 8. Item 4 — WhatsApp

**Short answer: it cannot be automated, the current design is already the
correct one, and this plan schedules no work against it.**

### Why it cannot be automated

Three separate routes, and each is closed for a different reason.

**1. WhatsApp Channels have no API at all.** Channels are Meta's one-to-many
broadcast surface, and Meta expects a human to post to them from the app. There
is no endpoint in the WhatsApp Business Platform — or anywhere else public —
that posts to a Channel. This is not a permissions problem or a review queue; it
is a capability that does not exist. It is already written down at the top of
`src/lib/whatsapp-channel.ts` and in `.env.example`, and it has not changed.

**2. The WhatsApp Business (Cloud) API is a different product.** It sends
messages **to phone numbers**, one recipient at a time, and it cannot address a
Channel. Using it as a broadcast would mean:

- **Holding residents' phone numbers.** `User.phone` exists on the schema and is
  unused; `notifySms` exists and is unused. Collecting numbers for broadcast is
  a new category of personal data, a new consent record, a new opt-out, a
  `/privacy` change and a DPIA entry.
- **Pre-approved message templates.** Outside a 24-hour customer-service window
  a business may only send a template approved in advance. A free-form
  `formatIncidentAlert` block does not qualify: the alert would become a
  template with placeholder parameters, approved once and **re-approved on every
  wording change**. That breaks the "one format, every surface" property this
  codebase is built on, and it means a typo fix waits on Meta.
- **Per-message billing**, by category and destination country. Push and
  Telegram are free; this is not, and the cost scales with the village.
- **Business verification and a WABA**, plus a phone number registered to it
  that is not somebody's personal one.

It is a legitimate product. It is simply not "post to the village's Channel",
and pretending otherwise is how a village ends up with a bill and a consent
problem instead of a feed.

**3. Unofficial relays are a ban risk carried by a person.** Whapi, WAHA,
Baileys and similar do offer channel posting, by driving the WhatsApp Web
protocol with an unofficial client. That can breach WhatsApp's terms, and the
account that gets banned is the one the relay was authenticated as — in
practice, a coordinator's personal WhatsApp. Losing the village's channel and a
volunteer's personal account in the same stroke is not a risk this project gets
to take on somebody else's behalf. `BACKLOG.md` N8 tracked this as "when manual
copy-paste becomes painful"; the answer is that painful is cheaper than banned.

### What exists in the codebase today

And it is more than it sounds, which is why the recommendation is to stop here:

- **`formatIncidentAlert`** — the alert, client-safe, one format, link budgeted
  first.
- **`CopyAlert`** — Copy alert, Open WhatsApp (`wa.me`, which copies to the
  clipboard first and then navigates, because a channel invite link cannot carry
  a prefilled message), and Share to Facebook. Coordinator-only, published
  reports only, with a red warning when `anonymized` is false.
- **Four `Village` columns** — the follow link, the derived code, the switch and
  the severity floor — with a dashboard form, Zod validation that refuses
  "enabled with no channel", and a `village.channel_update` audit row toned
  `sensitive`.
- **`logIncidentAlert`** — the three refusals plus a server log line, so
  "should this have gone out?" is answerable from a Vercel log.
- **`/settings`** renders "Follow on WhatsApp" for every resident of a village
  that has pasted a link. That half is officially supported, needs no
  credentials, and is what most villages will actually use.

So the gap is exactly one thing: a person pressing paste. Everything either side
of that is built.

### When this could change

Watch for a **Channels admin or publishing API** in the WhatsApp Business
Platform changelog. Nothing of the sort is announced as of writing, and Meta has
had Channels for long enough that the absence looks deliberate rather than
pending. Two things would make this worth revisiting:

- Meta shipping an endpoint that posts to a Channel with a business token. At
  that point the work is a `whatsapp.ts` adapter against the existing
  dispatcher — a day, because §5 already did everything else.
- A village asking specifically for WhatsApp **messages to residents who gave us
  their number**, which is the Cloud API path above. That is a separate feature
  with its own consent model, its own templates and its own DPIA entry, and it
  should be scoped as one rather than smuggled in as "finishing WhatsApp".

### Recommendation

**Keep it as manual one-tap copy-paste.** It works, it costs nothing, it cannot
be banned, and the coordinator reading the alert before pasting is a safety
property this plan otherwise has to rebuild from scratch — S2 exists precisely
because automation removes that reader.

The one improvement worth making is to the existing button rather than to the
transport: the moderation queue already shows the alert the instant a report is
approved, and the same panel could show which *other* channels posted
automatically, so a coordinator can see at a glance that Telegram and Facebook
went out and WhatsApp is theirs to paste. That is a rendering change over
`ChannelPost` and belongs in Phase 1's dashboard work.

---

## 9. Message format

**One payload, rendered once, adapters own the envelope.** Two formats is two
formats until the day somebody edits one, and then it is a coordinator looking
at a Telegram post and a Facebook post that describe the same report
differently.

### The channel-agnostic payload

```ts
/**
 * One published report, as much of it as may leave the village.
 *
 * Client-safe, same import budget as `format-alert.ts`. There is deliberately
 * NO field for the reporter, `rawDescription`, `lat`, `lng` or media — the
 * structural guard `AlertIncident`, `IncidentEmailInput`, `ExportIncident` and
 * `ReportIncident` all use. Adding one is not a small change; see S3–S6.
 */
export type ChannelMessage = {
  /** "Burglary" — INCIDENT_TYPE_LABELS[incident.type]. */
  category: string;
  /** "HIGH", with its emoji, from SEVERITY_META. */
  severity: Severity;
  /** The anonymised public title. */
  title: string;
  /** The anonymised landmark — "the lane behind the village hall". Never a coordinate. */
  area: string | null;
  /** The anonymised public `description`, truncated. Never `rawDescription`. */
  summary: string;
  /** When it happened, for "2 hours ago". */
  occurredAt: Date;
  /** The pattern note, only when `recurring` is true. */
  patternNote: string | null;
  /** Absolute URL to the report's own page — which needs a signed-in resident to open. */
  link: string;
};
```

`buildChannelMessage(incident)` is the one thing that produces it, and
`formatIncidentAlert` becomes its plain-text renderer rather than being
duplicated. The existing three surfaces keep rendering exactly what they render
today.

**One small real change:** `AlertIncident` currently has no `type` field, so
adding the **category** to the post means threading `IncidentType` through —
one column on two `select`s, and `INCIDENT_TYPE_LABELS` in `constants.ts` is
already the lookup. Worth doing: "Burglary" tells a follower what kind of thing
happened in a word, where a title might not.

### What a post looks like

```
🔴 HIGH · Burglary
Shed broken into overnight
📍 The lane behind the village hall · 2 hours ago

A garden shed was forced open overnight and tools were taken.

⚠️ Pattern: fourth report in this area this month

View details: https://villagewatch.app/incidents/abc123
```

The link is built first and the summary gets whatever is left of the budget, so
a very long report loses its summary rather than the address of the full one —
the half a reader can do something with.

### Per-channel envelopes

| Channel | Envelope |
| --- | --- |
| **Telegram** | The whole block as `text`, plain, no `parse_mode` (§6). `link_preview_options.is_disabled` true — a large preview of a generic card is noise under a short alert. No `sendLocation`, no `sendPhoto`. |
| **Facebook** | `message` = the block with its trailing `View details:` line removed, `link` = the URL. The card carries the address, so repeating it in the message is clutter. |
| **WhatsApp** | Unchanged: the same block, to the log line and the clipboard. |

Envelope differences are escaping, field-splitting and preview flags. **Wording
is never per channel.** The day one platform says "burglary" and another says
"break-in" is the day the format stopped being one format.

---

## 10. Privacy considerations

This is the section to argue about before any of the code is written. Every
other channel in the app discloses inside the tenant boundary; this one
discloses to the open internet, automatically, with nobody reading it first.

§4 is the enforceable list. What follows is what it means outside the code.

### The position in one paragraph

A village that enables a channel is publishing its residents' reports outside
the village, automatically, at the moment of publication. Everything in the post
is already the anonymised public column that every resident of that village can
read — but "readable by two hundred neighbours who signed in" and "readable by
anyone, forever, forwarded and indexed" are different disclosures, and only the
first is what a reporter agreed to when they filed. That is why every channel is
off by default, why each has its own severity floor defaulting `HIGH`, and why
S2 refuses a report the AI could not rewrite.

### Erasure and retention reach outside now

- `removeIncident` (Article 17) must un-post. `ChannelPost.externalId` is what
  makes that possible.
- `eraseAccount` reaches the same code through the reports it erases.
- The nightly archive pass at `RETENTION.incidentArchiveMonths` should un-post
  too: an archived report has left `PUBLIC_INCIDENT_STATUSES`, and a post
  pointing at a page nobody can open is a worse artefact than no post.
- **A deletion is not an un-send.** A post that has been forwarded,
  screenshotted or indexed is gone from the channel and not from the world.
  `/privacy` has to say that plainly rather than implying deletion is complete.

### Documents that change in the same commit

Non-negotiable, and it is the Definition of Done rather than a preference:

- **`/privacy` §6** — a new named processor per channel, what a post carries,
  that it is automatic, and who can read it. This is the eighth and ninth claim
  that page makes about how the code behaves.
- **`/terms`** — a village enabling a channel is publishing its residents'
  reports outside the village.
- **`docs/DPIA.md`** — automated public disclosure is a new processing
  operation with a new risk rating, not a variation on the existing one.
- **`docs/COMMUNITY_DPA.md` and `docs/DATA_PROCESSING_AGREEMENT.md`** — §6(c)
  of the latter is a list of the security measures actually in place, in a
  contract. The processor list and the sub-processor position both move.
- **The landing FAQ**, which carves out the WhatsApp Channel today and would
  need to carve out all three.
- **`docs/COORDINATOR_GUIDE.md`**, and therefore
  `docs/VillageWatch-Coordinator-Guide.pdf` rebuilt in the same commit.

### International transfers

Neither new processor is in the UK, and both need a transfer mechanism settled
before a real village uses them — `CLAUDE.md` already treats "personal data
stays in the UK" as a constraint rather than a hosting preference.

- **Telegram** — Telegram FZ-LLC, Dubai. The UAE has no UK adequacy decision, so
  this needs an IDTA or the Addendum, plus a transfer risk assessment.
- **Meta** — the existing UK/EU adequacy and SCC position applies, and the DPIA
  already has `[verify]` actions open against Anthropic (A9) and OneSignal
  (A11). This adds a third of the same shape.

An argument that this is "public data anyway" does not survive contact: the
report is personal data about the incident and, in a small parish, frequently
about identifiable people. Publishing it is processing.

---

## 11. Village settings

### Prefer a table over more columns

Three channels at four columns each is twelve columns on `villages`, two of them
credentials. Recommend instead:

```prisma
model VillageChannel {
  id        String  @id @default(uuid()) @db.Uuid
  villageId String  @map("village_id") @db.Uuid
  village   Village @relation(fields: [villageId], references: [id], onDelete: Cascade)

  /// "telegram" | "facebook" | "whatsapp".
  kind    String
  enabled Boolean @default(false)

  /// Chat id or Page id. Never typed for Facebook — captured during connect.
  target String?

  /// The resolved channel or Page name, rendered back so a wrong id is visible.
  label String?

  /// Encrypted at rest. Null for Telegram on the platform bot; a Page access
  /// token for Facebook. Never rendered, never logged, never sent to a browser.
  credential String?

  minSeverity Severity @default(HIGH) @map("min_severity")

  verifiedAt  DateTime? @map("verified_at")
  lastErrorAt DateTime? @map("last_error_at")
  lastError   String?   @map("last_error")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([villageId, kind])
  @@map("village_channels")
}
```

Three reasons, and the second is the one that decides it:

1. A fourth channel is a row rather than a migration touching `villages`.
2. **`credential` must not be on `villages`.** That table's SELECT grant is
   enumerated per column in `rls_policies.sql` specifically so a new column
   arrives withheld — but a table with no grant at all is a stronger guarantee
   than a list somebody has to remember not to extend.
3. `lastError` / `verifiedAt` give the dashboard something true to render when a
   bot is removed or a token dies, instead of posts quietly stopping.

`rls_policies.sql` must be re-run with this migration too, and this table gets
**no** SELECT grant to any role — not even a coordinator's, because one column
in it is a credential.

**Leave `Village.whatsappChannelUrl` where it is.** It is the public follow link
residents see on `/settings`, not a posting target, and moving it would churn a
screen for nothing. Backfill the other three WhatsApp columns into a
`kind: "whatsapp"` row when — and only when — WhatsApp gains a real transport;
until then there is no second reader and no drift to worry about.

### The dashboard

One card per channel, in the section that already holds the WhatsApp form, and
following the patterns already established there:

- **Off by default**, every channel, every village.
- **A per-channel severity floor**, defaulting `HIGH`.
- **Verify on save**, showing the resolved channel or Page name back — the way
  the WhatsApp form previews the extracted code.
- **Refuse "enabled with no target"** — `villageChannelFormSchema` already makes
  exactly this argument for WhatsApp: a switch that reads as on and does nothing
  is found out weeks later, by nobody.
- **A Reconnect state** for Facebook, driven by `verifiedAt` / `lastError`.
- **Say what enabling it means**, in a sentence, next to the switch. The
  dashboard already orders auto-approve and channel posting together so the pair
  is visible at a glance; a third and fourth public surface belongs in the same
  place with the same framing.
- **A recent-posts list** off `ChannelPost` — the last handful with their
  status and reason. It is the only way a coordinator finds out a post failed,
  or that one was skipped because the AI could not anonymise it.
- **Audited.** `village.channel_update` extended to name the channel kind, still
  toned `sensitive`. That is the moment somebody widens who can read their
  neighbours' reports.

---

## 12. Effort

Engineering days, at the standard this codebase holds (tests where there is a
seam, documents changed in the same commit, no TODOs left behind). Calendar lead
time is listed separately because for one of them it dominates.

| Work | Engineering | Calendar lead | Notes |
| --- | --- | --- | --- |
| **1. Shared dispatcher + `ChannelPost`** — `dispatchToChannels`, `ChannelMessage`, adapter interface, two migrations, RLS re-run, S2/S8/S9 gates, erasure hook, dashboard scaffolding | **3–4 days** | none | Behaviour unchanged at the end of it. That is what makes a large diff reviewable. |
| **2. Telegram** | **1–2 days** | none | One env var, one POST, `getChat`/`getChatMember` on save, `deleteMessage` for erasure. Free, official, no review. |
| **3. Facebook Page** | **3–5 days** | **2–6 weeks** | A day of Graph calls, three days of OAuth, token lifecycle, liveness check and reconnect states. App Review plus business verification is the long pole and is outside our control. |
| **4. WhatsApp** | **0 days** | — | No work scheduled. Keep the copy-paste. |
| — *WhatsApp Cloud API broadcast, if ever* | *6–10 days* | *2–4 weeks* | *A different feature: phone numbers, consent, opt-out, approved templates, per-message billing, business verification, its own DPIA entry.* |
| **Legal and documents** | **1–2 days** | — | `/privacy`, `/terms`, DPIA, both agreements, the FAQ, the guide and its PDF. Not optional and not deferrable. |

**Total to a working Telegram channel: about a week.** Facebook adds three to
five days of code behind a review queue that should be started on day one.

Testing fits the suite's constraints without an exception: adapters over a
stubbed `fetch`, the way `tests/police-api.test.ts` does it — every failure a
value rather than a throw — plus the gates as pure functions (severity floor,
`anonymized` refusal, status, age cap) and `buildChannelMessage`'s output. No
secret, no database, no browser.

---

## 13. Recommended order

1. **Item 1 — the dispatcher and the gates, with no new channel.**
   Move `logIncidentAlert` behind `dispatchToChannels`, add `ChannelPost` and
   `VillageChannel` and re-run `rls_policies.sql`, add the S2 refusal and the
   S8 age cap, wire the erasure un-post. Behaviour is unchanged at the end of it
   — the WhatsApp adapter still logs — which is exactly what makes it safe to
   land first. It also removes the duplicated fan-out set that `CLAUDE.md`
   currently asks people to keep in step by hand.

2. **Item 2 — Telegram.** Cheapest, official, free, no review, and it proves the
   dispatcher against a real platform. If any of this is wrong, this is where it
   shows up, at the cost of a bot token.

3. **Start Facebook App Review in parallel with (2).** The review is calendar
   time, not engineering time; starting it while Telegram ships is free.

4. **Item 3 — Facebook Page**, once the permissions are granted.

5. **Item 4 — WhatsApp: leave it as copy-and-paste.** Revisit only if Meta ships
   a Channels publishing API, or as a deliberate "alerts to residents who gave
   us their number" feature on the Cloud API, with its own consent model. Never
   as a relay.

### Before any of it

Two things are true today and both should be fixed first, because they make the
first automated post the first post of any kind:

- **No alert has ever been pasted into a real channel** and **no Facebook share
  has ever been pressed.** `PROJECT_STATE.md` lists both. Paste one by hand into
  a test channel and read what actually lands — particularly a report where the
  AI pass did not run.
- **The only `ACTIVE` village is the seed placeholder**, so there is no real
  village to post for. Automating a distribution channel ahead of having a
  village is building the loudest possible surface on top of the least exercised
  path in the app.

---

## 14. Notes for whoever implements this

- **This document is read by people and rendered by nothing.** It needs **no**
  `outputFileTracingIncludes` entry in `next.config.ts` — that list is only for
  the five documents the app reads off disk at run time.
- The fail-open / fail-closed directions are per module and the disagreement is
  deliberate (**S10**). Posting must fail **open** with respect to publishing —
  never block or fail a publish — while the decision to post must fail
  **closed** — an unreadable config posts nothing. A tidying pass that makes
  them consistent is a regression and will look like an improvement in the diff.
- `announce()` cannot throw, and the reason is not defensive style: it runs
  inside the reference-clash retry loop, where an exception is read as a P2002
  and the report is filed a second time.
- Callers must `await`. On Vercel the instance is frozen when the response
  returns, so a detached promise is not "posted later", it is "sometimes never
  posted" — the same reasoning `slack.ts` and `email/send.ts` carry.
- Keep `formatIncidentAlert` and `buildChannelMessage` client-safe. Their import
  budget is `constants.ts` and `format.ts`, and it is what lets the clipboard and
  the server render the identical text.
- **Two migrations, and `rls_policies.sql` re-run with each.** A new table
  arrives with RLS off and every row readable with the anon key. `postgis.sql`
  does not need re-running — there is no geography column in either, on purpose.
- Never log a credential. `TELEGRAM_BOT_TOKEN` in a stack trace is a bot
  somebody else can post as; a Page token in one is worse.
