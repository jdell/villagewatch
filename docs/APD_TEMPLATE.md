# Appropriate Policy Document — [Village Name] Community Safety Reporting

| | |
|---|---|
| **Document status** | **TEMPLATE — not yet reviewed or signed** |
| **Version** | 0.1 |
| **Controller** | *[Parish Council name]* |
| **Service** | VillageWatch community safety reporting |
| **Processor** | Yakasista Ltd |
| **Prepared on** | 27 July 2026 |
| **Signed on** | *(pending — see §8)* |
| **Next review** | One year from the date of signing |

> **This is a template.** It was written from the source code, so its account of
> what the software does is accurate. It is **not** a completed policy document.
> The parish council is the data controller, and the Data Protection Act 2018
> places the duty to maintain this document on the controller. Everything in
> square brackets needs the council's own answer, and the whole document needs
> the council's review and signature before any real resident data is processed.
>
> It is the companion to `docs/DPIA.md`, which assesses the risk of this
> processing. Read that first — this document records the safeguards the DPIA
> concludes are necessary.

---

## 1. Why this document exists

Reports filed through VillageWatch describe suspected criminal activity. Data
about an individual's alleged offences is **criminal offence data** under UK GDPR
Article 10, and Article 10 permits processing it only under the control of
official authority or where authorised by domestic law.

The domestic authorisation is the Data Protection Act 2018. Section 10(5) allows
processing of criminal offence data where a condition in Schedule 1 is met, and
**paragraph 5 of Schedule 1 requires the controller to have an Appropriate
Policy Document in place** for most of the substantial public interest
conditions, including the one relied on here.

This document is that policy. Without it, the processing is unlawful — not
merely undocumented.

The Information Commissioner may ask to see it at any time, and it must be
retained until six months after the processing ends.

---

## 2. Schedule 1 condition relied on

**DPA 2018, Schedule 1, Part 2, paragraph 10 — Preventing or detecting unlawful
acts.**

The condition applies where processing:

- is necessary for the purposes of preventing or detecting an unlawful act;
- must be carried out without the consent of the data subject so as not to
  prejudice those purposes; and
- is necessary for reasons of substantial public interest.

**How each limb is met.**

*Necessary for preventing or detecting an unlawful act.* The service exists so
that residents of one village can tell each other, and their coordinators, what
they have seen. A cluster of shed break-ins along one footpath is visible to
nobody until the reports are in one place. The purpose is prevention first —
warning neighbours — and detection second, through the summaries a coordinator
sends to the police.

*Without consent.* The data subject of a report is usually the person described
in it: a suspected offender, or somebody whose behaviour a resident found
alarming. Asking that person's consent before recording the report would defeat
the purpose entirely, and refusing it would be the obvious response. Consent is
therefore not available as a lawful basis and is not sought.

*Substantial public interest.* Preventing crime in a residential community is a
recognised substantial public interest. The processing is confined to one parish
at a time, published only to residents of that parish, and reduced by
anonymisation before publication — so the interference is proportionate to the
end.

**Article 6 basis.** Legitimate interests, Article 6(1)(f) — the legitimate
interests of the village's residents in knowing what is happening where they
live. The balancing test is at §4.2 of the DPIA.

---

## 3. Description of the processing

### 3.1 What is processed

A resident files a report describing something they have seen. The report is
passed to an AI model (Anthropic's Claude) which **rewrites it to remove personal
details** — names, vehicle registrations, house numbers, physical descriptions —
and categorises it by type and severity. The rewritten text is what appears on
the village map, the incident list and any notification. The reporter's original
wording is retained separately and is never published.

| Category | Examples | Who can see it |
|---|---|---|
| Report content, anonymised | What happened, where, when, severity | Residents of that village |
| Report content, original | The reporter's own words, which may name people or vehicles | The reporter, the village's coordinators, and nobody else — every read is logged |
| Location | An approximate point, jittered before storage; a free-text landmark | Residents of that village |
| Photographs and video | Faces covered on the reporter's own device before upload | Residents of that village |
| Reporter identity | Name, email, optional phone and street, optional approximate home location | The reporter, and coordinators |
| Audit trail | Who published, rejected or read what, and when | The village's coordinators |

### 3.2 Sources

All personal data comes from residents themselves. Nothing is bought, scraped,
matched against an external dataset, or received from a third party.

### 3.3 Who it is shared with

- **Residents of the same village**, for published reports only.
- **Anthropic**, which performs the anonymisation. Reports are not used to train
  models. See DPIA §5.1.
- **Supabase** (database and file storage) and **Vercel** (hosting), as
  processors.
- **The police or the parish council**, where a coordinator produces a summary
  document to send. Anonymised content only.
- **A public WhatsApp Channel**, where the village has chosen to run one. This is
  off by default and is the only disclosure outside the village. See DPIA §2.6.

### 3.4 Automated decision-making

The AI model rewrites and categorises; it does not decide anything about a
person. No decision made by the service produces a legal or similarly
significant effect, so Article 22 does not apply. A reporter reads and accepts
the rewritten version before anything is saved, and a coordinator reviews it
before publication unless the village has turned that review off.

---

## 4. Compliance with the data protection principles

**(a) Lawfulness, fairness and transparency.** Article 6(1)(f) for the
processing generally, and DPA 2018 Schedule 1 paragraph 10 for the criminal
offence element. A privacy notice at `/privacy` describes the processing,
including what is sent to Anthropic, what is disclosed to the staff channel, and
where the boundaries of publication are. Residents accept the terms at
registration.

**(b) Purpose limitation.** Reports are used to warn residents of that village,
to let coordinators moderate, to detect repeat patterns, and to produce summaries
for the police or council. They are not used for any other purpose, not sold, and
not shared with advertisers or insurers.

**(c) Data minimisation.** Publication carries the anonymised rewrite and never
the original wording. Coordinates are jittered before they are stored, so the
exact reported point is never held at all. Faces are covered on the reporter's
device, and the redacted copy is the only file uploaded — there is deliberately
no server-side fallback that would accept an unredacted original. Where a report
concerns people, only a count is recorded, never identities.

**(d) Accuracy.** A reporter reads the rewritten version before it is saved and
can edit it. A coordinator reviews it before publication. A resident may correct
their own report, and may ask a coordinator to correct a published one.

**(e) Storage limitation.** See §5.

**(f) Integrity and confidentiality.** Access is scoped to one village
throughout; row-level security is applied at the database, so a leaked key does
not open another village's reports. The original wording of a report is behind an
explicit, logged action rather than being available on any listing. Data is
encrypted in transit and at rest by the processors. The audit trail is
append-only and cannot be altered or deleted, including by the service operator.

**(g) Accountability.** The DPIA at `docs/DPIA.md` records the assessment. This
document records the Schedule 1 safeguards. Both are reviewed together, and the
coordinator who accepts them on behalf of the council is recorded by name and
timestamp before the village can accept a single report.

---

## 5. Retention

Retention runs from the date the data was collected, not from the date of the
event described.

| Data | Retained for | Then |
|---|---|---|
| **Incident reports** | **12 months** | Archived — off the map, off the list, out of every resident-facing surface |
| **Photographs and video** | **6 months** | Deleted from storage permanently |
| **Audit trail** | **24 months** | Deleted by the controller as a deliberate administrative act |
| Dormant accounts | 24 months without sign-in | Closed and anonymised |

The first two figures are enforced automatically by a nightly job, which reads
them from the same constant the privacy notice is rendered from, so the policy
and the software cannot drift apart.

The audit trail is deliberately **not** deleted automatically. It is append-only
and the database refuses deletion from the application entirely — which is what
makes it trustworthy as an accountability record. Expiring it at 24 months is an
action the controller takes knowingly.

A resident may ask for erasure at any time and does not have to wait for these
periods. Erasure destroys the report's content and media immediately and leaves
only a shell row, because the audit trail references it.

---

## 6. Erasure of the data

Where the controller no longer needs the data, or a data subject exercises the
right to erasure and it applies:

- The report's text, landmark, coordinates, photographs and video are destroyed.
  The reporter's original wording goes with them.
- The link between the report and the person who filed it is severed.
- Stored files are deleted from the bucket before the rows referencing them, so
  no file is ever orphaned beyond reach.
- A record that the erasure happened is written to the audit trail before
  anything is destroyed.

Records of the erasure itself are retained as part of the accountability record.

---

## 7. Data subject rights

Rights are exercised by contacting the controller at the address in §8. The
service supports each of them:

| Right | How it is met |
|---|---|
| Access | The resident's own reports are visible to them at any time; a full subject access request is answered by the controller |
| Rectification | The resident can edit their own report; a coordinator can correct a published one |
| Erasure | A resident can delete a report or close their account from within the service |
| Restriction | A coordinator can take a report off every public surface without deleting it |
| Objection | Processing is under legitimate interests, so the right to object applies and is absolute where it concerns direct marketing — of which there is none |
| Portability | Does not apply: the basis is legitimate interests, not consent or contract |

A resident may complain to the Information Commissioner's Office at any time.
Doing so does not require having complained to the council first.

---

## 8. Signature

By signing, the controller confirms that this Appropriate Policy Document has
been read, that the Schedule 1 condition in §2 is the condition relied on, and
that the safeguards described are in place.

This document must be reviewed **annually from the date of signing**, and
whenever the processing changes materially.

| | |
|---|---|
| **Controller** | *[Parish Council name]* |
| **Signed by** | *[Full name]* |
| **Role** | *[Chair / Clerk / Data Protection Lead]* |
| **Date** | *[Date of signing]* |
| **Next review due** | *[One year from the date above]* |

---

*Retain this document until six months after the processing described in it has
ended, and produce it to the Information Commissioner on request.*
