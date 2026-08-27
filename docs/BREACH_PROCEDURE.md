# Personal data breach procedure

**VillageWatch — community safety reporting for villages and neighbourhoods**

| | |
|---|---|
| **Document status** | **DRAFT — not yet reviewed or adopted** |
| **Version** | 0.1 |
| **Service** | VillageWatch — villagewatch.app |
| **Prepared by** | Yakasista Ltd (processor) |
| **Prepared on** | 27 August 2026 |
| **Adopted by** | *(pending — the controller adopts this)* |
| **Next review** | With the DPIA, six months after the first village goes live |

> **This closes DPIA action A10**, which has been marked *Blocker / Before
> launch / Not started* since 27 July 2026 and was the only one of the five
> blocker actions with no document behind it at all.
>
> It is written by the developer of the service from a direct examination of how
> the software behaves, so the technical half — what is held, where, what a
> breach would expose, and what can be done about it — is accurate and is a
> statement the developer is held to. **The decisions are the controller's**, and
> the places that need a name, a telephone number or an answer are marked
> *[Controller to complete]*. A procedure with nobody's name in it is a document,
> not a procedure.
>
> **It is deliberately not part of the compliance gate.** The gate is the set of
> documents a village *accepts* before it may take a report, and adding a fourth
> would re-close every village that has already been through it — the failure
> `20260728150000_village_dpa_gate` taught this codebase once already. This is
> operational guidance, read by people and rendered by nothing, so unlike the
> five documents the app renders from disk it needs **no**
> `outputFileTracingIncludes` entry in `next.config.ts`.

---

## 1. What this covers

A **personal data breach** is a security incident that leads to personal data
being destroyed, lost, altered, disclosed or accessed when it should not have
been — accidentally or deliberately. It is not only a hack. In a village watch
scheme the likeliest ones are ordinary:

- a join code photographed off a noticeboard and posted in a public group;
- a coordinator's account signed in on a shared or lost device;
- a CSV export emailed to the wrong list, or forwarded out of one;
- a report's original wording pasted into a WhatsApp group;
- a coordinator screenshotting the resident list at a parish meeting.

Four of those five are a person rather than a system, which is why §5 leads with
containment a coordinator can do themselves.

**Losing access to data is also a breach.** A database that cannot be reached,
or photographs deleted by mistake, is a loss of availability and is reportable
on the same test as a disclosure.

---

## 2. Who decides — and it depends on the village

`Village.mode` decides who the data controller is, and the controller is who
notifies the ICO. There is no single answer across a deployment.

| Village model | Controller | Who notifies the ICO | Who tells the residents |
|---|---|---|---|
| **Community** (the default) | The village coordinator, personally | The coordinator | The coordinator |
| **Council** | The parish or town council | The council's clerk or DPO | The council |

**Yakasista Ltd is the processor in both.** It does not decide, and it does not
notify the ICO on the controller's behalf unless asked to in writing — that is
§11 of the Community Coordinator Agreement and the equivalent clause of the
council's Data Processing Agreement. What it does is tell the controller, fast,
and then help.

| Role | Name | Contact | Deputy |
|---|---|---|---|
| Controller's decision-maker | *[Controller to complete]* | *[Controller to complete]* | *[Controller to complete]* |
| Processor contact | Yakasista Ltd | info@yakasista.com | — |
| Supervisory authority | Information Commissioner's Office | ico.org.uk/make-a-complaint · 0303 123 1113 | — |

> **[Controller to complete]** — name a deputy. Breaches are not considerate
> about holidays, and a 72-hour clock does not pause for one person being away.

---

## 3. The clocks

Three, and they run from different moments. Getting this wrong is the most
common way a well-handled breach still becomes an enforcement matter.

| Clock | Length | Starts | Owed to |
|---|---|---|---|
| Processor → controller | **24 hours** | Yakasista Ltd becomes aware | The controller, by contract |
| Controller → ICO | **72 hours** | The *controller* becomes aware | The ICO, by Article 33 |
| Controller → residents | **Without undue delay** | The controller becomes aware | Residents, by Article 34, where the risk to them is high |

The 24-hour processor commitment is deliberately tighter than the law requires,
and the reason is arithmetic: the controller's 72 hours cannot start until the
controller has been told, so a slow processor spends the controller's budget.

**An incomplete picture is not a reason to wait.** Article 33(4) allows
information to be provided in phases. Report what is known inside the deadline
and follow up; a late complete report is a worse outcome than a prompt partial
one, and the ICO says so.

---

## 4. Detecting one

Most breaches here will be *reported* rather than detected — by a resident, a
coordinator, or somebody who received something they should not have. Treat any
such report as a breach until it is established that it was not.

What the service itself provides:

- **The audit trail** (`/dashboard/audit`). Append-only, and it is the record of
  who did what. The entries worth reading first after a suspected account
  compromise are `incident.raw_viewed` (a coordinator read a reporter's verbatim
  words), `incident.export` (somebody downloaded the whole village as a
  spreadsheet), `incident.report_generated`, `village.resident_role_changed`,
  `village.join_code_reset` and `village.channel_update`. The trail cannot be
  edited or deleted by anyone, including the operator — a database trigger
  refuses it — which is what makes it evidence rather than a log.
- **The staff channel.** Registrations, publishes, coordinator applications and
  decisions are posted to a private Slack channel that only the people running
  the service can read.
- **Supabase's own logs**, for authentication and database access.

**What there is no alerting on**, and this is a gap rather than a design: nothing
watches for an unusual *volume* of `incident.raw_viewed` or `incident.export`
rows, so a coordinator reading every report in the village looks exactly like a
coordinator doing their job. The trail records it; nobody is told. See §9.

---

## 5. What to do, in order

### Step 1 — Contain it (immediately, before anything else)

Do not wait for a decision about reporting. These are all reversible-in-minutes
actions and none of them needs anybody's permission.

| If | Then |
|---|---|
| A **join code** has been exposed | Ask Yakasista Ltd to rotate it, or use Regenerate on `/admin/villages`. The old code stops working at once. Residents already in the village are unaffected — the code is checked at registration and never again. |
| A **coordinator account** may be compromised | Change the password immediately. Then move the account to `RESIDENT` on `/dashboard/settings` so it can no longer read verbatim wording or export. |
| Data was **sent to the wrong person** | Ask them to delete it and confirm they have. Record what you asked and what they said — it is directly relevant to the risk assessment at step 3. |
| A **report** is the exposure | The reporter or a coordinator can delete it. The row is kept as a tombstone and everything personal in it — the original wording included — is cleared, and the photographs are deleted from storage. |
| **Photographs** are the exposure | Deleting the report deletes the files. Links to stored media expire on their own after a short time, so an old link is usually already dead. |
| A **server credential** may be exposed | Yakasista Ltd rotates it. Contact info@yakasista.com and say which. |

### Step 2 — Tell the other party (within 24 hours)

**Coordinator or council → Yakasista Ltd**, at info@yakasista.com. It can
usually tell you what was actually exposed, which is very often narrower than it
first looks — the audit trail is precise about what was read and when.

**Yakasista Ltd → controller**, within 24 hours of becoming aware, with what it
knows: what happened and when it found out, the categories of data and the
approximate number of residents and records affected, the likely consequences,
what it has done and is doing, and a named contact.

### Step 3 — Assess the risk (the same day)

The question Article 33 asks is whether the breach is **likely to result in a
risk to the rights and freedoms** of the people affected. Not certain — likely.

Factors that make it more serious here:

- **The reporter's original wording was exposed.** This is the most sensitive
  data the service holds: unedited free text about suspected criminal activity,
  which may name a neighbour, a vehicle or an address. Treat any exposure of it
  as high risk until shown otherwise.
- **Somebody is identifiable as a reporter.** In a village of four hundred
  people, knowing who reported a neighbour is capable of causing real harm —
  this is the risk the whole service is built to avoid.
- **A home location or address was exposed.**
- **Children are involved.**
- **The recipient is unknown**, or the data is now public.

Factors that reduce it:

- Only the **published, anonymised** text was exposed — that text is already
  visible to every resident of the village by design.
- The recipient is known, trusted, and has confirmed deletion.
- Map positions are moved by a random distance before they are stored, so an
  exposed coordinate is precise enough to point at a street and not at a house.

**If in doubt, report it.** The ICO is explicit that over-reporting is preferable
to under-reporting, and a decision not to report has to be *recorded with its
reasoning* either way (§7). Writing that reasoning down is often what settles it.

### Step 4 — Notify the ICO (within 72 hours, if reportable)

At `ico.org.uk/for-organisations/report-a-breach/`, or 0303 123 1113. Have
ready: what happened, when, the categories and rough numbers affected, the
likely consequences, what has been done, and the contact from §2.

Late is still better than never — the form asks why, and "we were establishing
the facts" is an answer.

### Step 5 — Notify residents (where the risk is high)

Article 34, and it is a **higher** bar than the ICO test: only where the breach
is likely to result in a *high* risk. Tell them directly — in the app, by email,
or in person, not by a notice on a website — in plain language, and include what
happened, the likely consequences, what has been done, and who to contact.

Not required if the data was unintelligible to the recipient, if the risk has
since been made unlikely by the steps at step 1, or if it would involve
disproportionate effort (in which case make a public communication instead).

### Step 6 — Record it (always)

Article 33(5). **Every breach is recorded, including the ones not reported.** The
record is what demonstrates the decision was made rather than missed. §7 is the
template.

### Step 7 — Learn from it

At the next village meeting, or immediately if it was serious. Most breaches
here will be a person and a habit rather than a fault in the software; the
Coordinator Guide's "Privacy responsibilities" section is the standing guidance
and is the thing to re-read.

---

## 6. What could actually be exposed

Worth knowing before an incident rather than during one.

| Held | Where | Sensitivity | Notes |
|---|---|---|---|
| Reporter's original wording | UK database | **Highest** | Never public. Every read is recorded in the audit trail. Deleted when a report is archived at 12 months. |
| Published report text | UK database | Medium | Anonymised by an AI rewrite the reporter reads and accepts. Already visible to every resident of the village. |
| Photographs and video | UK private storage | Medium–high | Faces are covered on the reporter's own device before upload, and the location tag is stripped with them. Reached only through links that expire. |
| Names and email addresses | UK database | Medium | Masked on the resident list; revealed one at a time. |
| Home locations | UK database | Medium | Moved by a random distance before storing. Optional — many residents have none. |
| Join codes | UK database | **Credential** | Withheld from the public database grants. Rotatable. |
| Audit trail | UK database | Medium | Append-only. Names actors and actions, never report contents. |

**Everything above is in the United Kingdom** (`eu-west-2`, London). That is a
commitment in both agreements and in the privacy notice, not a hosting
preference.

Personal data also reaches four processors outside that database — Anthropic
(report text, for the rewrite), OneSignal (a device token and a notification),
Slack (staff alerts, including a name and an email on registration) and Resend
(the welcome email). A breach at any of them is a breach here; §5.2 of the DPIA
and §10 of the Community Coordinator Agreement list what each receives.
`data.police.uk` is the exception and receives **nothing** about any resident: a
village's map centre and a calendar month.

---

## 7. The breach record

Copy this for each one. Keep it wherever the village keeps its record of
processing.

```
Reference:            BR-YYYY-NN
Date and time of the breach (or best estimate):
Date and time we became aware:
How we found out:

What happened:

Categories of personal data affected:
Approximate number of residents affected:
Approximate number of records affected:

Likely consequences for those affected:

Containment — what was done, when, by whom:

Risk assessment:      Low / Medium / High
Reasoning:

Reportable to the ICO?     Yes / No
  If yes:  reported at (date, time), reference:
  If no:   why not —

Residents notified?        Yes / No / Not required
  If notified: how, when, how many
  If not required: why —

Processor notified?        Yes / No — date, time

What we are changing so it does not happen again:

Recorded by:               Date:
```

---

## 8. Fast reference

Pin this somewhere. It is the whole procedure for somebody who has thirty
seconds and a problem.

1. **Contain it.** Rotate the join code, change the password, ask for the email
   to be deleted. Do this first.
2. **Tell Yakasista Ltd** — info@yakasista.com — within 24 hours.
3. **Decide within 72 hours** whether it goes to the ICO. If unsure, report it.
4. **ICO:** ico.org.uk/for-organisations/report-a-breach/ · 0303 123 1113.
5. **Tell the residents** if the risk to them is high.
6. **Write it down either way.**

---

## 9. Known gaps

Stated rather than left to be discovered. Each is a candidate for the six-month
review.

| Gap | Consequence | Owner |
|---|---|---|
| No alerting on unusual volumes of `incident.raw_viewed` or `incident.export` | A coordinator reading or exporting an entire village is recorded and nobody is told | Processor |
| Closing an account leaves the sign-in record with the authentication provider | The email address is still held there after the profile has been scrubbed | Processor (DPIA A7) |
| Audit-trail and dormant-account retention are stated but not enforced | Records are kept longer than the notice says | Processor (DPIA A8) |
| This procedure has never been rehearsed | The first real breach is also the first run-through | Controller |
| No named decision-maker or deputy yet | §2 is incomplete, and a 72-hour clock does not pause for a holiday | Controller |

---

## 10. Related documents

- `docs/DPIA.md` — the impact assessment. R10 is the breach risk; A10 is this
  document.
- `docs/COMMUNITY_DPA.md` — the community model's agreement. §2.2 is the
  coordinator's 72-hour duty; §11 is what Yakasista Ltd does.
- `docs/DATA_PROCESSING_AGREEMENT.md` — the council model's. The 24-hour
  processor notification and what it must contain.
- `docs/COORDINATOR_GUIDE.md` — "Privacy responsibilities", which is the
  standing guidance that prevents most of what is in §1.
- `/privacy` — what residents have been told is held about them.
