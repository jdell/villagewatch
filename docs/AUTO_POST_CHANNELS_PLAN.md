# Auto-posting a published report to a village's channels

**Status:** plan only. Nothing in this document is built.
**Written:** 24 August 2026, against `v0.1.42`.
**Read this before writing any of it** — three of the decisions below are the
kind that look like tidying in a diff and are not.

This is the plan for turning "a coordinator copies the alert and pastes it into
a channel" into "the alert posts itself when a report is published". It covers
what exists today, where the hook belongs, what each of the three candidate
channels actually costs, and what a public automated disclosure changes about
the privacy position.

It is not a design document for the codebase as a whole — `CLAUDE.md` is that,
and every rule quoted here is enforced somewhere in it. It is not a numbered
item of work either; `BACKLOG.md` N7 and N8 are the entries this expands.

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

## 2. Architecture

### Where the hook goes

**Inside `notifyIncidentPublished`, exactly where `logIncidentAlert` already
sits.** That function is the join point both publish paths already share, it
already returns a `channel` field describing what happened to the WhatsApp half,
and it already cannot throw. Replacing the log line with a dispatcher is a
change to one call site and no change at all to either publish path.

```
applyModeration ─┐
                 ├─> notifyIncidentPublished ─┬─> dispatch()            (push, OneSignal)
announce()      ─┘                            └─> distributeIncident()  (new)
                                                    ├─ telegram adapter
                                                    ├─ facebook adapter
                                                    └─ whatsapp adapter (or the log line)
```

### The dispatcher

A new directory, `src/lib/channels/`, because one file per platform is what
keeps a platform's quirks out of the shared path:

```
src/lib/channels/
  index.ts        distributeIncident() — resolve, gate, format, fan out, record
  types.ts        ChannelAdapter, ChannelPostResult, VillageChannelConfig
  telegram.ts     Bot API
  facebook.ts     Graph API
  whatsapp.ts     the existing log line, moved
```

One adapter interface, and it is deliberately narrow:

```ts
type ChannelAdapter = {
  kind: ChannelKind;                                  // "telegram" | "facebook" | "whatsapp"
  post(target: string, text: string, link: string, credential: string):
    Promise<ChannelPostResult>;                        // never throws
  verify(target: string, credential: string):
    Promise<{ ok: true; label: string } | { ok: false; error: string }>;
};
```

`verify` is not optional politeness. A coordinator pasting a channel id into a
form has no way to find out they got it wrong: the failure is a post that never
appears, weeks later, reported by nobody. Both platforms offer a cheap read
(`getChat`, `GET /{page-id}`) that answers "can I actually post here", and the
dashboard should run it on save and store the answer.

`distributeIncident` owns everything that is not platform-specific:

1. Read the village's channel rows. **Fails closed** — a database error means we
   do not know what the village asked for, and the safe guess is to post
   nothing. Same direction as `getVillageAutoApprove`, opposite to
   `rate-limit.ts`, and the disagreement is the design.
2. Apply the eligibility rules (§5).
3. Format **once**, through `formatIncidentAlert`, so what lands on Telegram and
   what lands on Facebook are the same words. Per-channel adaptation is escaping
   and envelope, never wording.
4. Post to each enabled channel, recording the outcome.
5. Return a per-channel result. **Never throw** — the incident is on the map and
   the push has gone out either way, and `announce()` in particular treats an
   exception as a reference clash and would file the report a second time.

### Recording what happened

A new table. It is not bookkeeping for its own sake — three separate things need
it:

```prisma
model ChannelPost {
  id         String   @id @default(uuid()) @db.Uuid
  villageId  String   @map("village_id") @db.Uuid
  incidentId String   @map("incident_id") @db.Uuid
  kind       String                        // "telegram" | "facebook" | "whatsapp"
  status     String                        // "posted" | "failed" | "skipped"
  externalId String?  @map("external_id")  // the message/post id, for deletion
  detail     String?                       // the platform's own error, for an operator
  attempts   Int      @default(1)
  postedAt   DateTime? @map("posted_at")
  createdAt  DateTime @default(now()) @map("created_at")

  @@unique([incidentId, kind])
  @@index([villageId, status])
}
```

- **`externalId` is what makes erasure possible.** Article 17 does not stop at
  the tenant boundary. `removeIncident` has to be able to call
  `deleteMessage` / `DELETE /{post-id}`, and it cannot do that without the id
  the platform gave back.
- **`@@unique([incidentId, kind])` is the idempotency guard.** `announce()` runs
  inside the create loop's reference-clash retry; a retry that re-posted would
  put the same report on a public feed twice.
- **`status: "failed"` with `attempts` is what a retry sweep reads.** Without a
  row, a transient 502 is a post that silently never happened.

`rls_policies.sql` **must be re-run** with the migration that adds it — a new
table arrives with RLS off and every row readable with the anon key. It wants a
village-scoped coordinator SELECT and nothing else: no INSERT, UPDATE or DELETE
to anybody, on `police_crimes`' reasoning.

### What does not get an audit row

Following the argument already in `whatsapp-channel.ts`: a post is a
deterministic consequence of `incident.publish` plus the village's own
configuration, both already in the trail, and a row per post would bury the
human actions around it. `ChannelPost` is the delivery record.

What **is** audited, and toned `sensitive`, is every change to the configuration
— the existing `village.channel_update` extended to name the channel kind. That
is the moment somebody widens who can read their neighbours' reports, and it is
the one worth being able to point at.

### Outbound pacing

Follow `src/lib/police-api.ts`, not `src/lib/rate-limit.ts`, and the distinction
matters enough that somebody will otherwise "fix" it. The `rate_limit` table is
a **security** limit on an **inbound** request, counted in Postgres because
per-instance counters hand a fresh quota to whoever wakes a cold lambda. This is
a **courtesy** pace on an **outbound** call, with no adversary, already
serialised inside one publish. A module variable is the right shape, and a
Postgres round trip in front of every post would be a cost with nothing bought.

Telegram's documented ceiling is ~30 messages/second overall and ~20 per minute
to any one channel. One village publishing one report is nowhere near either;
the pacer exists for the day a backfill or a retry sweep iterates.

### Retries

**Inline retry once, on a 5xx or a timeout, and no further.** Then leave the
`failed` row for a sweep. The sweep should ride the **existing** nightly
retention cron rather than becoming a new one: `vercel.json` already carries
three and Vercel's Hobby plan allows two (`BACKLOG.md` T11), so a fourth entry
is a rejected deploy.

A retry has to check the age. A "burglary overnight" alert posted three days
late is worse than not posted — it reads to a follower as something that
happened last night. Cap it: nothing older than a few hours gets posted at all,
and a row that ages out is marked `skipped` with a reason rather than retried
forever.

---

## 3. WhatsApp Channel — what is needed to finish it

**Short answer: it cannot be finished as a Channel, and the current design is
already the correct one.**

### Why there is no API

Meta's **WhatsApp Cloud API** (part of the WhatsApp Business Platform) sends
messages *to phone numbers*. It has no endpoint that posts to a **Channel**.
Channels are a one-to-many broadcast surface Meta expects a human to post to
from the app, and Meta has not opened them to programmatic posting. This is
already written down at the top of `src/lib/whatsapp-channel.ts` and in
`.env.example`; it has not changed.

**Third-party relays (Whapi, WAHA, Baileys and similar) do offer it**, by
driving the WhatsApp Web protocol with an unofficial client. That can breach
WhatsApp's terms and get the number behind it banned — losing the village's
channel and the coordinator's personal WhatsApp account in the same stroke.
`BACKLOG.md` N8 tracks this as "when manual copy-paste becomes painful". The
recommendation here is unchanged: **do not build it.** The failure mode is
somebody's personal account, and it is not ours to spend.

### The one sanctioned path, and why it is a different feature

The Cloud API can broadcast to **residents' phone numbers**, which is a real,
supported, and materially different product:

- A Meta Business Account, business verification, a WhatsApp Business Account
  (WABA), and a phone number registered to it that is not somebody's personal
  one.
- **Message templates approved in advance.** Outside a 24-hour customer-service
  window, a business may only send a pre-approved template. A free-form
  `formatIncidentAlert` block does not qualify — the alert would have to become
  a template with placeholder parameters, approved once and re-approved on every
  wording change. That alone breaks the "one format, every surface" property
  this codebase is built on.
- **Per-message pricing**, by category and country. Utility and marketing
  templates are billed. Push and Telegram are free; this is not.
- **Phone numbers, held and processed.** `User.phone` exists on the schema and
  is unused; `notifySms` exists and is unused. Collecting numbers for broadcast
  is a new category of personal data, a new consent record, a new opt-out, and
  a `/privacy` and DPIA change. It also makes the audience *known*, which is the
  opposite of a Channel and changes the argument for why no `Notification` rows
  are written.

Credentials it would need: `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN` (a System User token —
long-lived, and a credential that can message every subscriber), plus template
names per language.

**Recommendation: keep the copy-paste for Channels.** It works, it costs
nothing, it cannot be banned, and the coordinator reading the alert before
pasting is a safety property this plan otherwise has to rebuild (§5). Revisit
the Cloud API only as a deliberate "WhatsApp alerts to residents who gave us
their number" feature, with its own consent flow — not as a way to feed a
Channel, which it cannot do.

---

## 4. Telegram Channel — what is needed

**This is the cheap one, and it should go first.**

### What it takes

- **A bot.** `@BotFather` → `/newbot` → a token. Free, instant, no review, no
  business verification, no per-message cost.
- **The bot added to the village's channel as an administrator** with "Post
  messages" enabled. The coordinator does this in Telegram in about thirty
  seconds; there is no OAuth flow to build.
- **One HTTP call to post:** `POST https://api.telegram.org/bot<token>/sendMessage`
  with `chat_id`, `text`, and `link_preview_options` to control the preview.

### The credential split, and why it differs from WhatsApp

`CLAUDE.md` says of WhatsApp that "nothing about a channel is an environment
variable, because a deployment serves many villages and each runs its own".
Telegram splits differently and the plan should say so rather than have somebody
discover it:

- **The bot token is platform-level.** It is VillageWatch's identity — one
  `TELEGRAM_BOT_TOKEN`, server-only, in Vercel. Asking each village to run its
  own bot would mean each coordinator creating one, and the platform storing a
  write credential per village for no gain.
- **The chat id is village-level.** `@villagename` or the numeric
  `-100…` id, stored on the village's channel row, set by its own coordinator.

So: one env var, and a per-village target. That is a smaller surface than the
WhatsApp columns and needs no encryption at rest, because the only secret is the
deployment's own.

### Rules and failure modes worth pinning

- Rate limits: ~30 messages/second overall, ~20 per minute per channel. A 429
  carries `parameters.retry_after` in the body — honour it rather than
  reconstructing it from a header.
- A bot removed from the channel returns **403**; a wrong id returns **400**
  `chat not found`. Both are permanent and must mark the row `failed` and stop
  retrying, and should surface on the dashboard rather than in a log only a
  developer reads.
- `parse_mode` is optional and the plan is to send **plain text**. The alert
  format deliberately carries no `*bold*` markup, and MarkdownV2 requires
  escaping fourteen characters — a resident-written landmark containing a `.` or
  a `-` would fail the send outright. Plain text has no escaping and no failure
  mode.
- Deleting a bot's own message in a channel needs the `can_delete_messages`
  admin right; ask for it when the bot is added, so erasure is possible later.

### Verification on save

`getChat` confirms the chat exists and the bot can see it; `getChatMember` with
the bot's own id confirms it is an administrator with `can_post_messages`. Run
both when a coordinator saves, store the resolved channel title next to the id,
and render it back — the same reason the WhatsApp form previews the extracted
code back at them.

---

## 5. Facebook Page — what is needed

The most work, and most of the cost is calendar rather than engineering.

### What it takes

- **A Facebook App** in Meta for Developers, with Facebook Login configured.
- **Permissions:** `pages_show_list` (to let a coordinator pick the Page),
  `pages_read_engagement`, and `pages_manage_posts` (to publish). All three
  require **App Review** before anyone outside the app's own developers can
  grant them, and App Review for a business-facing app means business
  verification too. Budget weeks, not days, and expect a rejection round —
  reviewers want a screencast of the exact flow.
- **A connect flow.** The coordinator signs in with Facebook, picks the Page,
  and the app exchanges: short-lived user token → long-lived user token
  (~60 days) → **Page access token** via `GET /me/accounts`. A long-lived Page
  token does not expire on a clock, but it dies when the granting user changes
  their password, revokes the app, loses their admin role on the Page, or the
  app's permissions change. So it needs a stored `verifiedAt`, a periodic
  liveness check, and a dashboard state that says "reconnect" rather than a post
  that silently stops.
- **Posting:** `POST /{page-id}/feed` with `message` and `link`, against a
  **pinned Graph API version** (`FACEBOOK_GRAPH_VERSION`). Meta deprecates a
  version roughly every two years and an unpinned call breaks on their schedule
  rather than ours.

### Storing the token

A Page access token is a write credential for somebody else's Page and must not
land in a column that any grant can reach. `prisma/sql/rls_policies.sql` grants
SELECT on `villages` **per column**, precisely so a new column arrives withheld
— but the safer answer is that it never goes on `villages` at all. Two options,
in order of preference:

1. **A separate `VillageChannel` table with no SELECT grant to any role**, the
   way `rate_limit` has RLS enabled and no policy at all. Prisma is the table
   owner and reads it; PostgREST cannot.
2. **Supabase Vault**, which is pre-installed in every Supabase project
   (`CLAUDE.md`, Prisma 7 conventions). Heavier, and it puts a second access
   path in front of a value only one module reads.

Either way the token is server-only, never logged, and never returned to the
dashboard — the form shows "Connected as *Page name*, reconnect" and never the
value.

### The card is going to be generic, and that is correct

Facebook builds its preview by crawling the `link`. `/incidents/[id]` is behind
`requireSession()`, so the crawler lands on the sign-in redirect and falls back
to the site's own Open Graph image and tagline. `CLAUDE.md` already says so
under The public share buttons, and it is the right outcome: a card rendering a
village's incident detail for a logged-out crawler would be domain rule 6
leaking through a preview. Expect every auto-post to carry the generic
VillageWatch card. Do not "fix" it by making incident pages crawlable.

---

## 6. Message format

**Reuse `formatIncidentAlert`. Do not write a second format.** Two formats is
two formats until the day somebody edits one, and then it is a coordinator
looking at a Telegram post and a Facebook post that describe the same report
differently.

What the post contains, which is what it already contains:

```
🔴 HIGH — Shed broken into overnight
📍 The lane behind the village hall · 2 hours ago

A garden shed was forced open overnight and tools were taken.

⚠️ Pattern: fourth report in this area this month

View details: https://villagewatch.app/incidents/abc123
```

- **Severity emoji and label**, upper-cased — the one word that has to survive
  being read at arm's length.
- **Title**, the anonymised public column.
- **`locationText`** — the anonymised landmark, and the field whose audience
  genuinely widens when a village enables this. Never coordinates.
- **A truncated `description`**, `ALERT_DESCRIPTION_MAX_CHARS`, with the link
  budgeted first so it is never the thing that gets cut.
- **The pattern note**, only when `recurring` is true.
- **An absolute link** to the report's own page, which needs a signed-in
  resident of that village to open.

What it must never contain, and this is structural rather than remembered:
`AlertIncident` in `src/lib/format-alert.ts` **has no field** for
`rawDescription`, `lat`, `lng`, the reporter, or any media. That guard is the
same one `IncidentEmailInput`, `ExportIncident` and `ReportIncident` use, and
extending it is the wrong instinct every time.

Per-channel adaptation is envelope only:

| Channel | Envelope |
| --- | --- |
| Telegram | `text` as-is, plain text, no `parse_mode`. `link_preview_options` set to show a small preview or none — a large preview of a generic card is noise. |
| Facebook | `message` = the alert with the trailing `View details:` line removed, `link` = the incident URL, because the card carries the address. |
| WhatsApp | Unchanged: the log line and the clipboard. |

**No images, in any channel, in any phase.** The bucket is private and its URLs
are signed and expiring, so there is no public URL to attach; producing one
would mean making redacted media publicly addressable, which is a much larger
decision than this feature. Link only.

---

## 7. Privacy considerations

This is the section to argue about before any of the code is written. Every
other channel in the app discloses inside the tenant boundary; this one
discloses to the open internet, automatically, with nobody reading it first.

### The rules that carry over unchanged

- **Published only, at publish time.** Both hooks sit after the status is
  written and only on `PUBLISH`. A report in the queue has not cleared
  moderation (domain rule 6) and must never reach a channel.
- **No reporter, ever.** Not a name, not an id, not an initial. The type has no
  field for one.
- **No coordinates.** They were jittered on the way in (domain rule 2), so they
  are precise enough to point at a house and not precise enough to be right
  about which one — the worst of both.
- **No `rawDescription`.** Domain rule 1 does not stop at the village boundary.
- **Media stays where it is.** Only `redactedPath` is ever served, only once
  `redactedAt` is set, and nothing is attached to a post regardless.

### The rule this feature has to invent

**Refuse to auto-post a report whose `anonymized` is false.**

This is the single most important recommendation in the document. Today the
chain has a human in it: `CopyAlert` reads `anonymized` and renders a red
warning saying the text is the reporter's own wording, and a coordinator decides
whether to paste it. Auto-posting removes that person. Combine it with
`autoApprove` — which a village may switch on, and which removes the *other*
person — and a report can go from a resident's phone to a public feed with no
human having read it at any point, carrying verbatim wording that the AI pass
failed to rewrite because the key was missing or the call timed out.

`Incident.anonymized` already records exactly this and defaults to `false`. The
gate is one condition in `distributeIncident`, it fails in the safe direction,
and the dashboard should say plainly that a report the AI could not rewrite is
alerted in-app and not posted publicly.

### Erasure and retention reach outside now

- `removeIncident` (Article 17) must delete the posts. `ChannelPost.externalId`
  is what makes that possible; Telegram's `deleteMessage` and Facebook's
  `DELETE /{post-id}` are the calls. A failure must be logged and retried, and
  must not fail the erasure itself — the row is tombstoned either way.
- `eraseAccount` reaches the same code through the reports it erases.
- **A deletion is not an un-send.** A post that has been forwarded,
  screenshotted or indexed is gone from the channel and not from the world.
  `/privacy` has to say that rather than implying deletion is complete.
- The nightly retention sweep archives at twelve months. An archived report
  leaves `PUBLIC_INCIDENT_STATUSES`; its old channel posts should go with it,
  which is another reader for `ChannelPost`.

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

## 8. Village settings

### Prefer a table over more columns

Three channels at four columns each is twelve columns on `villages`, and one of
them would be a Facebook Page token. Recommend instead:

```prisma
model VillageChannel {
  id         String   @id @default(uuid()) @db.Uuid
  villageId  String   @map("village_id") @db.Uuid
  kind       String                          // "telegram" | "facebook" | "whatsapp"
  enabled    Boolean  @default(false)
  target     String?                         // chat id, page id
  label      String?                         // resolved channel/page name, shown back
  credential String?                         // Facebook page token; null elsewhere
  minSeverity Severity @default(HIGH) @map("min_severity")
  verifiedAt DateTime? @map("verified_at")
  lastErrorAt DateTime? @map("last_error_at")
  lastError   String?   @map("last_error")

  @@unique([villageId, kind])
}
```

Three reasons, and the second is the one that decides it:

1. A fourth channel is a row rather than a migration touching `villages`.
2. **`credential` must not be on `villages`.** That table's SELECT grant is
   enumerated per column in `rls_policies.sql` specifically so a new column
   arrives withheld — but a table with no grant at all is a stronger guarantee
   than a list somebody has to remember to not extend.
3. `lastError` / `verifiedAt` give the dashboard something true to render when a
   bot is removed or a token dies, instead of posts quietly stopping.

**Leave `Village.whatsappChannelUrl` where it is.** It is the public follow link
residents see on `/settings`, not a posting target, and moving it would churn a
screen for nothing. Backfill the other three WhatsApp columns into a
`kind: "whatsapp"` row when — and only when — WhatsApp gains a real transport;
until then there is no second reader and no drift to worry about.

### The dashboard

One card per channel, in the section that already holds the WhatsApp form, and
following the patterns already established there:

- **Off by default**, every channel, every village.
- **A per-channel severity floor**, defaulting `HIGH` like WhatsApp's and unlike
  push's `LOW`.
- **Verify on save** and show the resolved channel or Page name back, the way
  the WhatsApp form previews the extracted code.
- **Refuse "enabled with no target"** — `villageChannelFormSchema` already makes
  exactly this argument for WhatsApp: a switch that reads as on and does nothing
  is found out weeks later, by nobody.
- **Say what enabling it means**, in a sentence, next to the switch. The
  dashboard already orders auto-approve and channel posting together so the pair
  is visible at a glance; a third and fourth public surface belongs in the same
  place with the same framing.
- **A recent-posts list** off `ChannelPost` — the last handful with their
  status. It is the only way a coordinator finds out a post failed.

---

## 9. Effort

Engineering days, at the standard this codebase holds (tests where there is a
seam, documents changed in the same commit, no TODOs left behind). Calendar lead
time is listed separately because for one of them it dominates.

| Work | Engineering | Calendar lead | Notes |
| --- | --- | --- | --- |
| **Phase 0** — dispatcher, `ChannelPost`, migration, RLS, `anonymized` gate, erasure delete hook, dashboard scaffolding | **3–4 days** | none | The half that is the same whatever channel lands first. |
| **Telegram** | **1–2 days** | none | One env var, one POST, `getChat`/`getChatMember` on save. Free, official, no review. |
| **Facebook Page** | **3–5 days** | **2–6 weeks** | The code is a day of Graph calls and three days of OAuth, token lifecycle and reconnect states. App Review and business verification are the long pole and are outside our control. |
| **WhatsApp Channel (relay)** | — | — | **Not recommended.** Terms breach, ban risk, somebody's personal account. |
| **WhatsApp Cloud API broadcast** | **6–10 days** | **2–4 weeks** | A different feature: phone numbers, consent records, opt-out, approved templates, per-message billing, business verification. Its own DPIA entry. |
| **Legal and documents** | **1–2 days** | — | `/privacy`, `/terms`, DPIA, both agreements, the FAQ, the guide and its PDF. Not optional and not deferrable. |

Testing fits the suite's constraints without an exception: adapters over a
stubbed `fetch`, the way `tests/police-api.test.ts` does it — every failure a
value rather than a throw — plus the eligibility rules as pure functions
(severity floor, `anonymized` refusal, status, age cap). No secret, no database,
no browser.

---

## 10. Recommended order

1. **Phase 0 — the dispatcher and the gates, with no new channel.**
   Move `logIncidentAlert` behind `distributeIncident`, add `ChannelPost` and
   re-run `rls_policies.sql`, add the `anonymized` refusal, wire the erasure
   delete hook. Behaviour is unchanged at the end of it — the WhatsApp log line
   still logs — which is exactly what makes it safe to land first. It also
   removes the duplicated fan-out set that `CLAUDE.md` currently asks people to
   keep in step by hand.

2. **Telegram.** Cheapest, official, free, no review, and it proves the
   dispatcher against a real platform. If any of this is wrong, this is where it
   shows up, at the cost of a bot token.

3. **Start Facebook App Review in parallel with (2).** The review is calendar
   time, not engineering time; starting it while Telegram ships is free.

4. **Facebook Page**, once the permissions are granted.

5. **WhatsApp: leave it as copy-and-paste.** Revisit only as a deliberate
   "alerts to residents who gave us their number" feature, on the Cloud API,
   with its own consent model. Never as a relay.

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

## 11. Notes for whoever implements this

- **This document is read by people and rendered by nothing.** It needs **no**
  `outputFileTracingIncludes` entry in `next.config.ts` — that list is only for
  the five documents the app reads off disk at run time.
- The fail-open / fail-closed directions are per module and the disagreement is
  deliberate. Posting must **fail open with respect to publishing** — never
  block or fail a publish — while the decision to post must **fail closed** — an
  unreadable config posts nothing. A tidying pass that makes them consistent is
  a regression and will look like an improvement in the diff.
- `announce()` cannot throw, and the reason is not defensive style: it runs
  inside the reference-clash retry loop, where an exception is read as a P2002
  and the report is filed a second time.
- Callers must `await`. On Vercel the instance is frozen when the response
  returns, so a detached promise is not "posted later", it is "sometimes never
  posted" — the same reasoning `slack.ts` and `email/send.ts` carry.
- Keep `formatIncidentAlert` client-safe. Its import budget is `constants.ts`
  and `format.ts`, and it is what lets the clipboard and the server render the
  identical text.
