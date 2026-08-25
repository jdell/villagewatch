# The coordinator dashboard, in five tabs

_Written 25 August 2026, before the implementation. Read by people, rendered by
nothing — so unlike the five documents the app renders from disk, this needs no
`outputFileTracingIncludes` line._

## The problem

`/dashboard` was one page doing four jobs. In order down the screen: three
buttons and a compliance banner, a period control, two stat cards, two
breakdowns, a hotspot list with a heatmap over it, the concern panel, the police
comparison, the moderation queue, and then five village settings forms with the
invite panel under them. Nine hundred lines of Server Component, and around
fourteen screens of scrolling on a phone.

Three things are wrong with that, and only the first is cosmetic.

1. **The queue is buried.** It is the thing a coordinator actually opens the app
   for — the one part of this page with a decision waiting on a person — and it
   sits eight sections down, below four panels nobody has to act on.
2. **Configuration is mixed in with the day's work.** The auto-approve switch
   decides whether the village moderates at all, and it lives three scrolls
   below the queue it governs, on the same page a coordinator opens twenty times
   a week. Settings somebody touches once a year should not be adjacent to
   buttons they press daily.
3. **One page means one query.** Every render pays for the police comparison, the
   vote tally, the heatmap points, the hotspot grouping, the queue, the channel
   settings, the privacy level and the compliance read — twenty parallel queries
   — whether the coordinator came to publish one report or to fix a typo in an
   invite link.

## The shape

Five tabs, and they are **sidebar entries rather than a tab bar**. The app shell
already has a navigation column with a coordinator block in it; a tab strip
inside the page would be a second navigation idiom for the same set of
destinations, and on a phone it would be a horizontally scrolling row underneath
a drawer that already lists the same five things.

| Tab      | Route                  | What it is                                    |
| -------- | ---------------------- | --------------------------------------------- |
| Overview | `/dashboard`           | Read-only. What happened, and who says so.    |
| Queue    | `/dashboard/queue`     | The decisions. Where the time goes.           |
| Map      | `/map`                 | Unchanged.                                    |
| Reports  | `/reports`             | Documents that leave the village.             |
| Settings | `/dashboard/settings`  | Everything that applies to everyone.          |

`/map` is deliberately not moved under `/dashboard`. It is the one of the five
that residents see too, and it is the same screen for both — moving it would
either give residents a coordinator-shaped URL or fork the page in two.

### What already existed

Most of this is reorganisation, which is the point. Of the five tabs, three were
already routes (`/dashboard`, `/map`, `/reports`) and the other two are new
pages assembled out of components that already existed:

- `ModerationQueue`, `ModerationCard` — moved to the Queue tab as they are.
- `AutoApproveForm`, `ParishCouncilForm`, `PrivacyLevelForm`,
  `WhatsAppChannelForm`, `InviteShare` — moved to the Settings tab as they are.
- `VillageModeForm` — was only reachable from `/dashboard/compliance`. It is
  rendered on Settings too, because "what model is my village on" is a profile
  question and the compliance page is a place a coordinator goes once.
- `StatCard`, `ConcernList`, `PoliceCrimePanel`, `BreakdownBar`,
  `HotspotHeatmap`, `TimeRangeFields` — stay on Overview.

Three components are genuinely new, and one route grows a capability. Those are
the parts worth arguing about, below.

## Tab by tab

### 1. Overview — `/dashboard`

Read-only. Nothing on this page writes anything, which is a property worth
having: it is the page a coordinator leaves open, and it is now safe to
revalidate under them.

**Four stat cards**, replacing two:

| Card              | Counts                                                    |
| ----------------- | --------------------------------------------------------- |
| Waiting for review | `PENDING_REVIEW` in the village, **all time**             |
| Published         | Published in the selected period, vs the preceding one     |
| Patterns detected | `PatternAlert` rows raised in the period                   |
| Active residents  | Accounts in the village with no `deletedAt`                |

The first is deliberately **not** bounded by the period control. A report filed
in March that nobody has reviewed is still waiting today, and a "pending" figure
that fell to zero because the coordinator selected "Last 7 days" would be the
one number on this page that could quietly say the work is done when it is not.
It carries "all time" on its own label so the exception is visible rather than
inferred. It also links to the Queue tab, because a count of work with no way
through to the work is furniture.

The fourth is likewise unbounded — an account is open or it is not, and there is
no period over which that is a rate. It counts `deletedAt: null` and says so:
"active" here means the account has not been closed, not that anybody used it
this week. `User.lastActiveAt` exists and is unwritten by anything, so a figure
built on it would read as engagement and be zero.

**Patterns detected** is the first thing in the app to render `PatternAlert`.
The weekly digest has been writing those rows since Day 6 and nothing has ever
shown them — one of the standing entries in "Not built yet". The card counts
them; the Reports tab lists them (below).

**Recent activity** is new: the last `ACTIVITY_FEED_SIZE` rows of the village's
own `AuditLog`, rendered through `auditActionLabel` so a community village reads
its own words. It writes nothing — the audit viewer's rule, and for its reason:
a trail that records people looking at it buries the rows that matter. It is a
window onto `/dashboard/audit` rather than a replacement for it, and links there.

Everything else on Overview is unchanged: the compliance banner at the top (it
stops the village working, so it goes above the figures), the period control,
both breakdowns, the hotspot list with its heatmap, the concern panel and the
police comparison.

**The period gains "Last 12 months."** `TIME_RANGES` grows a `365` entry and
`DASHBOARD_RANGE_VALUES` takes it. It is comfortably inside
`MAX_CUSTOM_RANGE_DAYS` (730), so nothing about the custom-range clamp moves.

### 2. Queue — `/dashboard/queue`

The page a coordinator lives on, and now the only thing on its own screen.

**Pending reports** first, through the existing `ModerationQueue` — which stays
because of what it is for: `moderateIncidentAction` revalidates the page, the
approved report leaves `PENDING_REVIEW`, and the WhatsApp alert has to outlive
the card that produced it. That reasoning is unchanged by the move.

**Three buttons per card**, where there were two:

- **Publish** and **Reject** — the existing server actions, untouched.
- **Edit** — new, and the one authorisation change in this whole redesign. See
  below.

**The card grows a reporter initials chip.** The name was already rendered and
stays — a coordinator can already reveal the reporter's verbatim words, so
initials are not a privacy boundary here — but the chip is what makes a row
scannable at queue length, and an anonymous report renders a dash rather than
initials of nothing.

**Published reports below, collapsed.** A `<details>` element, closed by
default, listing the most recent `QUEUE_PUBLISHED_SIZE`. Plain HTML rather than
a client component: it needs no state that survives anything, and `<details>`
works before JavaScript loads like every other progressive control on these
screens. It is there so that "did I already publish that one?" is answerable
without leaving the tab.

The auto-approve notice moves here with the queue, because it is an explanation
of why the queue is empty and belongs beside the empty queue rather than beside
the switch that emptied it.

#### The Edit button, and why it is an authorisation change

`/incidents/[id]/edit` was the **reporter's** edit: `requireSession()`, then
`reporterId: session.user.id` and `status: { in: ["DRAFT", "PENDING_REVIEW"] }`
in the predicate. A coordinator could not reach it for somebody else's report,
so a queued report with a landmark in it that identifies a house could only be
published as filed or rejected outright.

This widens it: **a coordinator may edit a report that is still in the queue, in
their own village.** Both other constraints stay exactly as they were.

- **Queue statuses only.** A published report still cannot be rewritten by
  anybody, which is the constraint that matters — it is the one residents have
  already read.
- **Village-scoped**, from the session profile and never the URL (domain rule 4).
- **`rawDescription` is untouched.** The form edits five public fields; the
  reporter's verbatim words are not among them and there is no re-anonymisation
  pass, which is already true of the reporter's own edit.
- **Audited.** `incident.edit` already exists and the row already carries
  `actorRole`, so a coordinator's edit and a reporter's are distinguishable in
  the trail without a new action.

The predicate keeps ownership in the `where` clause rather than moving it to a
prior read — the property the original comment argues for — by dropping the
`reporterId` clause for a coordinator and keeping it for everybody else.

### 3. Map — `/map`

Unchanged. Not moved, not wrapped, not re-queried. The sidebar entry it already
had is the tab.

### 4. Reports — `/reports`

Unchanged except that it gains the second half of what it was always missing.

- **The PDF generator with its date range picker** — already there.
- **Share with police** — already there, in `ReportView` and `ShareSummary`.
- **Weekly summary history** — new. The weekly digest writes a `PatternAlert`
  per village per run and nothing has ever rendered one. This lists the most
  recent `WEEKLY_SUMMARY_HISTORY_SIZE` for the village: title, the summary
  Claude wrote (or the counted fallback), the window it covers, how many reports
  were in it, and the detector that produced it. `detector: "weekly-count"` is
  labelled as counted rather than analysed, for the reason
  `GENERATED_BY` is conditional on the narrative's source — a reader deciding
  how much of a document to trust is entitled to know which of the two they are
  holding.

  Acknowledge and dismiss still have no UI and this does not add them. Listing
  is read-only; acting on an alert is a decision with a write behind it and
  wants its own thinking.

The "Dashboard" link in the header stays and still points at Overview.

### 5. Settings — `/dashboard/settings`

Everything that applies to the whole village, in four groups.

1. **Village profile** — the village's name and region (read-only; changing them
   is `/admin/villages`, because a village is a directory entry), the compliance
   model through the existing `VillageModeForm`, and coordinator review through
   `AutoApproveForm`.
2. **Invite residents** — `InviteShare`, moved wholesale from the bottom of the
   old dashboard. It is the same component with the same reasoning: this is the
   one screen that shows a village's join code, to the coordinator whose village
   it is, from their own session.
3. **Residents** — new. See below.
4. **Channels and privacy** — `WhatsAppChannelForm`, `PrivacyLevelForm` and
   `ParishCouncilForm`.

The ordering of auto-approve and the channel form mattered on the old page and
matters here: a village running both has put unreviewed reports one paste from
the open internet. They are no longer adjacent — the invite and resident
sections sit between them — so the auto-approve card carries the sentence
itself rather than relying on proximity to say it.

`#village-settings` was an anchor on the old page and `/reports` links to it.
That link is updated to `/dashboard/settings`.

#### The resident list, and what a coordinator may change

The genuinely new capability, and the one that closes a standing "Not built yet"
entry: _"Resident verification has no UI — no way to approve a join request or
promote someone to `VERIFIED_RESIDENT`."_

The list shows every account in the village: name, email, role, whether they are
verified, and when they joined.

**Email addresses are masked** — `j***@gmail.com` — with a Show button per row.
The masking happens in `listVillageResidents`, on the server, so the page
carries no full addresses at all; `getResidentEmail` returns one at a time
behind `revealResidentEmailAction`. That is data minimisation in the only sense
worth claiming here: a coordinator is entitled to these addresses and can press
the button as often as they like, so this is not an access control. What it
answers is *incidental* exposure — a screen-share at a parish meeting, a
screenshot pasted into a WhatsApp group, a saved page, a HAR file on a bug
report — which is how a village's contact list actually leaks. Doing the
masking in the component would have been a line shorter and put all fifty
addresses in the payload, which is the version that looks the same on screen and
protects nothing off it.

The reveal writes **no audit row**, deliberately, and it is the audit viewer's
own argument: a row every time somebody glanced at an address they are entitled
to would bury `incident.raw_viewed`, which records a coordinator reading a
resident's unedited words. Those are not the same act and should not be the same
weight of entry.

**Closed accounts do not appear**, and `villageId` rather than `deletedAt` is
what decides it: `eraseAccount` nulls both, so a closed account leaves the
tenant boundary this query is scoped by and drops out without being filtered.
The component still renders a closed state from `deletedAt` as a backstop for a
row closed some other way, but in the ordinary case that branch never runs.

**What a coordinator may do is exactly one thing: verify a resident, or undo
it.** `RESIDENT` ↔ `VERIFIED_RESIDENT`, and nothing else. Specifically:

- **No promotion to `COORDINATOR` from here.** There are exactly two routes to
  that role — `decideCoordinatorRequest` and `appointCoordinator` — both
  platform-admin only, both audited, and `CLAUDE.md` says in as many words that
  a third would be one too many. A coordinator who could mint coordinators would
  make the platform-admin review of an application decorative.
- **No editing anybody who already holds coordinator access.** A coordinator
  cannot demote a fellow coordinator, a moderator or an administrator. Two
  coordinators who fell out should not be able to remove each other, and the
  route that granted the access is the route that should remove it.
- **No editing yourself.** Not because self-verification is dangerous — a
  coordinator is verified already — but because the guard above is what stops a
  coordinator demoting themselves out of the page they are standing on.
- **The role is written by server code from a fixed pair of constants**, never
  from the payload as a free `UserRole` (domain rule 5). The form posts an
  intent — verify or unverify — and the action decides what that means.

`verifiedAt` and `verifiedById` follow the role: verifying fills them with the
acting coordinator, unverifying clears both. That is the same pair
`appointCoordinator` fills, and unlike that function this one does clear them —
because here removing the verification *is* the act, not a side effect of one.

Audited as `village.resident_role_changed`, toned `sensitive`. It changes what
somebody can do inside the village, which is the same class of act as the three
village settings already toned that way.

## What is deliberately not in this

- **No tab bar component.** Covered above.
- **No shadcn/ui.** The brief mentions it; this codebase does not use it and has
  no `components/ui` directory. Every surface here is plain Tailwind against the
  project's own palette (`brand-*`, `safe-*`, the severity meta). Introducing a
  component library to reorganise five pages would be a rewrite wearing a
  reorganisation's clothes, and the brief also says to keep the existing
  components.
- **No change to any resident-facing view.** `/map`, `/incidents`,
  `/incidents/[id]`, `/incidents/new` and `/settings` render identically for a
  resident. The only resident-visible change in the whole branch is that a
  coordinator can now edit a queued report before publishing it, which shows up
  as the report being better rather than as a different screen.
- **No Telegram.** The Settings tab says the channel section is WhatsApp today
  and names Telegram as not built, rather than rendering a disabled form for a
  thing with no column, no validator and no module behind it.
- **No pattern acknowledge/dismiss.** Listing is read-only, as above.
- **No pagination on the resident list.** It shows the first
  `RESIDENT_LIST_SIZE` and says how many more there are, which is what the
  moderation queue and the coordinator request queue already do. A village that
  outgrows it wants a search box rather than a page control.

## The queries, before and after

The old page ran twenty parallel queries on every render. Split, the common
case gets cheaper: Overview keeps the counting and the panels, Queue runs the
queue and the published list, Settings runs the four village settings reads and
the resident list. A coordinator publishing three reports no longer pays for the
police comparison, the heatmap points or the channel settings three times.

## Testing

`tests/resident-role.test.ts` is the new file, and it is there because the
resident role change is a rule with a failure mode: the four refusals above are
the whole safety argument for putting the control on a coordinator's screen at
all. It asserts the pair of allowed roles, both directions of the
`verifiedAt`/`verifiedById` write, and each refusal — a coordinator role as the
target, self as the target, a resident in another village, and an arbitrary
`UserRole` posted through the form. Prisma is mocked at its module boundary, so
it needs no database and no secret, like every other file in the suite.

The existing suites cover the rest of what moved: nothing in `date-range`,
`compliance`, `votes` or the report modules changes behaviour, and
`tests/date-range.test.ts` already asserts that every value in
`DASHBOARD_RANGE_VALUES` is a known `TIME_RANGES` preset — which is what
catches the new `365` entry being added to one list and not the other.
