# Facebook launch guide

**Who this is for:** Joel, launching VillageWatch in one village. Read by a
person, rendered by nothing — see the note at the foot.

Facebook is where a village already talks to itself. Most parishes have a
"[Village] Community" group with a few hundred members in it and a noticeboard
nobody reads, and the group is the one that works. This is how to get in front
of it without being the person who turned up to advertise something.

The whole of it is about ten hours of work spread over three weeks, and the
single most important line in it is the one about ratio: **post nine useful
things for every one that mentions the app.**

---

## 1. Create the Page

**Facebook → Pages → Create new Page.** A Page, not a group. The group is the
village's; the Page is yours, and it is the thing a resident can check before
trusting a link.

| Field | Use |
|---|---|
| **Name** | `VillageWatch` |
| **Category** | `Software` — primary. Add `Community Organisation` as a second. |
| **Username** | `@villagewatchapp`, if it is free |
| **Website** | `https://villagewatch.app` |
| **Profile picture** | `public/android-chrome-512x512.png` — the shield, already square, already the app's own mark |
| **Cover image** | 1640 × 856. The shield on the brand blue with `Keep your village safe` beside it |

Do **not** name the Page after the village. `VillageWatch — Histon` reads as an
official village body and is not one; it also makes the same Page wrong the
moment a second parish signs up. The village's name belongs in the posts.

### The About text

Short version, for the 255-character bio:

> Report what you see in your village in seconds. Personal details are stripped
> out before neighbours read it. Not an emergency service — always call 999.

Long version, for the About section:

> VillageWatch is a community safety reporting app for villages and
> neighbourhoods. Residents report what they have seen — a break-in, a scam
> caller, a fallen branch — and it appears on a village map their neighbours can
> see. Personal details are removed before anything is published, and a
> coordinator reviews each report first.
>
> It is not an emergency service and reports made through it do not reach the
> police. In an emergency call 999. For non-urgent police matters call 101.
>
> Run by Yakasista Ltd. Privacy notice: https://villagewatch.app/privacy

**Both versions have to carry the 999 line, and it is not boilerplate.** A page
listing burglaries reads, to somebody who has never met the service, as a way of
telling the police about one. That is the only failure mode of this whole
exercise that could actually hurt somebody, and every surface in the product
carries the same sentence for the same reason.

### Before you post anything

- [ ] Page is published, not in draft.
- [ ] `https://villagewatch.app` loads and the Page links to it.
- [ ] `/privacy` and `/terms` both render with real contact details on them.
- [ ] The village is **activated** and has a join code — `/admin/villages`, or
      `npm run db:activate-village -- --slug <slug> --admin <email>`.
- [ ] The village's coordinator has been through `/dashboard/compliance`.
      **Until they have, the village accepts no reports at all** and every link
      you post lands on a page telling residents to contact their coordinator.
      This is the one that will embarrass you if you skip it.
- [ ] Open the join link on your own phone and get all the way to a finished
      account. The invite carries the join code in the URL; a link without one
      cannot be accepted.

---

## 2. Find the groups

Search Facebook for each of these and join what comes back. Expect two or three
per village that are worth being in.

```
[Village name] Community
[Village name] Village
[Village name] Noticeboard
[Village name] Residents
[Village name] Neighbourhood Watch
[Village name] & [neighbouring village]
[Village name] Chat
[Village name] Buy Sell Swap
[District] Neighbourhood Watch
Spotted [Village name]
```

Also worth searching: the parish council's own Page, which is usually a Page
rather than a group and usually has the clerk answering it.

**What to do for the first week: nothing.** Join, read, and answer things you
actually know the answer to. Most village groups have an explicit "no
advertising" rule and an admin who enforces it, and the fastest way to be
removed from the one group that matters is to introduce yourself with a link.

Three things worth doing before the intro post:

1. **Message the group admin.** One paragraph, asking whether it is all right to
   post about a free tool for the village. They will nearly always say yes, and
   the ones who would have deleted the post will tell you now instead.
2. **Read what the village already complains about.** Every group has a running
   theme — speeding on one road, parcels going missing, the same field being
   fly-tipped in. That theme is what your intro post should be about.
3. **Find the coordinator.** Somebody in that group already runs the
   Neighbourhood Watch or sits on the parish council. They are more use to you
   than the group is: a post from them lands, and a post from you is an
   advertisement.

---

## 3. Week 1: the intro post

Post it in the community group, not on the Page. Nobody follows a new Page.

> **Something I have been building for [Village]**
>
> Hello — I live in [village/nearby] and I have built a free app for reporting
> the sort of thing that gets posted here anyway: break-ins, suspicious callers,
> vehicles going through gardens, a branch down across a lane.
>
> The reason I built it rather than just using this group: a post here scrolls
> away in a day, and there is no way to see that the same thing has now happened
> four times on the same road. VillageWatch puts them on a map and spots the
> pattern.
>
> Two things about how it handles what you write, because they matter more than
> the features:
>
> • **Personal details are stripped out before anyone else reads them.** If you
>   name a neighbour or write down a registration, that stays visible only to
>   you and to the village coordinator — what appears on the map is a rewritten
>   version with the names taken out.
> • **Locations are approximate on purpose.** Pins are shifted slightly so a
>   report cannot be traced back to a particular house.
>
> It is free for the village, there are no adverts, and nothing is sold to
> anybody.
>
> **It is not an emergency service and it does not tell the police anything.**
> Always call 999 in an emergency, or 101 for non-urgent police matters.
>
> If you want a look: [join link]
>
> Happy to answer anything, including sceptical questions — those are the useful
> ones.

**Post it once.** If it does badly, the answer is not to post it again in a
fortnight; it is that this group is not the one, or the intro was the wrong shape
for it.

Answer every comment, including the hostile ones. "Another app nobody asked for"
is a fair thing for somebody to think, and answering it properly in public is
worth more than the post was.

### What to expect

A village group of 400 will give you perhaps 15 to 30 clicks and 3 to 8 sign-ups
from one post. That is a normal result, not a bad one. The people who sign up in
week one are the ones who were already going to; the rest join because they saw
the third weekly digest and it had something in it they cared about.

---

## 4. Every week: the digest post

**This is the habit that actually grows it**, and it is the one thing on this
page that is automated.

1. Sign in as the village's coordinator.
2. **Overview** → **Copy weekly post**.
3. Read what it copied. Then paste it into the community group.

The button builds the post from the village's published reports over the last
seven days: severity, what kind of thing, roughly where, the week's count
against the week before, and the join link. **It carries no descriptions** — not
even the anonymised ones — because a digest is a dozen reports at once and a
public feed is not the place to be checking each of them for a name somebody
typed in.

An empty week still gets a post, and the button writes one. **Post it anyway.**
"Nothing reported this week" is the single most reassuring thing a village
noticeboard can say, and going quiet in a good week is what makes the next post
look like news rather than a service.

Things worth adding by hand under the pasted text, when there is something to
add:

- A sentence about the one report that matters most this week.
- What the parish council or the PCSO said, if anything.
- A straight ask, roughly once a month and no more: *"If you have had something
  happen and not reported it, this is what it is for."*

Do not edit the reports themselves out of the post. The count and the list are
what make it worth reading.

---

## 5. Reactive sharing

The digest is the routine; this is what actually gets noticed.

When something happens that the village is already talking about, the
coordinator can share that one report — **Incidents → the report → Share to
Facebook**. That carries a link to a public preview page anybody can open
without an account.

Three rules for it:

1. **Only published reports**, which is all the button offers. A report still in
   the review queue has not been checked by anybody.
2. **Reply into the existing thread rather than starting your own.** Somebody
   has posted "has anyone else had someone knocking claiming to be from the water
   board?" — the useful answer is *"yes, two on Tuesday, both reported"* with the
   link, in that thread. A fresh post competing with theirs is an advertisement.
3. **Watch the wording on a report that was never rewritten.** The share panel
   warns you in amber when the AI pass did not run, which means the text is the
   reporter's own. Read it through for names and registrations before it goes
   anywhere public.

Do not share a report about a named individual, an ongoing police matter, or
anything involving a child, however carefully worded. The village will remember
that post far longer than it remembers any of the others.

---

## 6. Posting tips

**Timing.** Village groups are read in three windows: 07:30–09:00, 12:00–13:30
and — the one that matters — **19:00–21:30**. Sunday and Monday evenings are the
best of the week. Saturday is the worst.

**Frequency.** One digest a week, plus reactive comments as things come up. Two
scheduled posts a week is the ceiling; three is when people start hiding the
Page.

**The ratio.** Nine useful posts for every one that asks for something. Useful
means answering a question, sharing a real incident, or passing on what the PCSO
said. This is the rule that decides whether you are a neighbour or a
salesperson, and it is judged by the group rather than by you.

**Format for the phone.** Almost everyone is reading this on a phone in a feed.
Short first line, a blank line after it, and no paragraph over three lines. The
emoji in the digest post are doing structural work — they are what makes a list
of eight reports scannable — rather than being decoration.

**Never argue in public.** If somebody is wrong about privacy, answer once,
factually, with a link to `/privacy`, and leave it. A thread you win is a thread
four hundred people watched you have.

**Never post the same thing to five groups in one evening.** Facebook reads that
as spam and it is also just obvious. One group at a time, a few days apart.

---

## 7. Tracking whether it is working

Check weekly. Ten minutes.

| What | Where | What good looks like, month one |
|---|---|---|
| Registered residents | `/dashboard/settings` → resident list | 20–40 in a village of 400 |
| Reports filed | Overview → reports this period | 2–6 a week |
| Page follows | Facebook → Page → Insights | 30–80 |
| Post reach | Insights → per post | 150–400 in a group of 400 |
| Link clicks | Insights → per post | 10–30 per digest |
| Group members joined | Manually, per group | — |

Keep it in a spreadsheet with one row per week. Six weeks of rows tells you
something no single week does.

**Two figures that are not vanity, and are the ones to actually watch:**

- **Reports per registered resident per month.** Follows and sign-ups measure
  the posting; this measures whether the thing is any use. Below about 0.2 the
  village has an app nobody files anything in, and that is a product problem
  rather than a marketing one.
- **Repeat reporters.** How many residents have filed more than once. One is
  curiosity; two is a habit.

### What to do if it is not working

- **Sign-ups but no reports** → the app is not the problem, the moment is. Post
  a reactive share the next time the group is talking about something.
- **No sign-ups from a good post** → the join link is broken or the village is
  not open. Check the compliance gate first; it is the likeliest cause and the
  least visible.
- **Nothing from any post** → wrong group. Find the one with the parish clerk in
  it.

---

## 8. What not to do

- **Do not post as the village.** The Page is VillageWatch's; the parish
  council's voice is the parish council's.
- **Do not run ads.** Not in month one. A village of 400 is reachable for
  nothing, and a boosted post reads as a company rather than a neighbour.
- **Do not post a report's screenshot.** Use the share button, which links to a
  page carrying only what is meant to be public. A screenshot of the coordinator
  dashboard has the review queue in it.
- **Do not publish a coordinator's or a reporter's name.**
- **Do not promise anything the product does not do.** No integration with the
  police, no guaranteed response, no crime prevention. The claims on
  `villagewatch.app` are the claims that have been checked.

---

*This document is read by a person out of the repository. Unlike the four the
compliance gate renders, it needs **no** `outputFileTracingIncludes` entry in
`next.config.ts` — nothing in the app imports or serves it.*

*Every claim in it about how the product behaves is held to the rule
`/privacy` is held to: change the behaviour and change the sentence in the same
commit. The two that are load-bearing are the anonymisation and the location
fuzzing, both of which the intro post states to several hundred people.*
