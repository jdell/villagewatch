# Data Processing Agreement — VillageWatch community safety reporting

| | |
|---|---|
| **Document status** | **TEMPLATE — not yet reviewed or signed by either party** |
| **Version** | 0.1 |
| **Service** | VillageWatch — villagewatch.app |
| **Controller** | *[Parish Council name]* |
| **Processor** | Yakasista Ltd |
| **Village** | *[Village name]* |
| **Prepared on** | 28 July 2026 |
| **Signed on** | *(pending — see §12)* |
| **Next review** | One year from the date of signing |

> **This is a template, and it is a contract rather than a policy.** The two
> documents beside it — the Data Protection Impact Assessment and the
> Appropriate Policy Document — are the council's own documents, and the council
> signs them alone. This one is an agreement **between two parties**, so it is
> not in force until both the council and Yakasista Ltd have signed it.
>
> It was drafted by Yakasista Ltd from a direct examination of how the software
> actually behaves, so its account of what happens to residents' data is
> accurate. Everything in square brackets needs the council's own answer, and
> the council should take its own advice on the terms before signing. A council
> that wants to use its own standard processing agreement instead is free to do
> so; this exists because a small parish council usually has no such document to
> hand, not because it must be the one used.
>
> Read the Data Protection Impact Assessment first. It explains what the
> processing is and what it risks. This document is the promise about how it is
> carried out.

---

## 1. Why this agreement is needed

The parish council decides that residents' community safety reports should be
collected, and decides what happens to them. In data protection law that makes
the council the **controller**.

Yakasista Ltd builds and runs the software that does the collecting. It acts on
the council's decisions and takes none of its own about why the data is held. In
data protection law that makes Yakasista Ltd the **processor**.

Article 28(3) of the UK GDPR says a controller may only use a processor under a
written contract, and it lists what that contract has to cover. Without one, the
council is in breach from the first report filed — not because anything has gone
wrong with the data, but because the arrangement was never written down.

This document is that contract. Sections 2 to 5 describe the processing, as
Article 28(3) requires. Section 6 sets out the eight obligations the Article
places on the processor. Sections 7 to 11 add the practical detail those
obligations need to mean anything.

---

## 2. The parties

| | |
|---|---|
| **Controller** | *[Parish Council name]* |
| Address | *[Registered address]* |
| Contact for data protection | *[Name, role, email, telephone]* |
| ICO registration number | *[Registration number — see the DPIA, action A5]* |

| | |
|---|---|
| **Processor** | Yakasista Ltd |
| Contact for data protection | info@yakasista.com |
| Registered in | England and Wales |

In this document, "the council" means the controller and "the service" means
VillageWatch, the community safety reporting platform operated by the processor
at **villagewatch.app**.

---

## 3. Subject matter and duration

**Subject matter.** The processing of community safety incident reports, and of
the accounts of the residents who file and moderate them, through the
VillageWatch platform, for the village named above.

**Duration.** This agreement begins on the date it is signed by both parties and
continues for as long as the village uses the service. It ends when the village
stops using the service, whether because the council withdraws, because the
service closes, or because either party ends it under §11.

**Instructions.** The council's documented instructions are:

- this agreement, including the description of the processing at §§3 to 5;
- the privacy notice published to residents of the village;
- the settings a coordinator chooses in the service — whether reports are
  reviewed before they appear, how heavily faces are covered in photographs,
  whether the village runs a public WhatsApp Channel, and the name of the
  council shown on documents; and
- any further instruction the council gives in writing.

The processor will act on those instructions and on nothing else.

---

## 4. Nature and purpose of the processing

**Purpose.** To let residents of one village tell each other, and their
coordinators, about incidents affecting community safety; to warn residents of
what is happening nearby; and to help the council and the police see patterns
that are invisible in individual reports.

**Nature.** The processor carries out the following operations on the council's
behalf.

| Operation | What it means in practice |
|---|---|
| **Collecting** | Taking a report from a resident — what happened, roughly where, when, and any photographs. |
| **Covering faces in photographs** | Finding faces in an attached photograph and covering them before the file leaves the resident's phone or computer. Automatic detection is used; it happens on the resident's own device, and the original photograph is never sent anywhere. |
| **Anonymising** | Rewriting each report to remove names, vehicle registrations, addresses and other identifying detail, using an artificial intelligence model. The resident reads the rewrite and accepts it before anything is saved. |
| **Structuring** | Sorting each report into a category and a severity, again using an artificial intelligence model, so the map and the alerts are usable. |
| **Storing** | Holding reports, accounts and photographs in a database and file storage, separated so that one village's reports are not reachable from another's. |
| **Publishing within the village** | Showing approved reports on the village map and list to signed-in residents of that village. |
| **Alerting** | Sending notifications to residents' phones when a report is published. |
| **Detecting patterns** | Looking for clusters of similar reports close together in place and time, and writing a weekly summary of them for coordinators. |
| **Producing documents** | Assembling summaries a coordinator can send to the police or to the council, and a spreadsheet export of the village's reports. |
| **Deleting** | Removing reports and accounts a resident asks to have removed, and deleting old photographs and archiving old reports automatically to the published schedule. |

The processor does not use any of this data for its own purposes. It does not
sell it, does not use it to advertise, and does not use it to train artificial
intelligence models.

---

## 5. Personal data and data subjects

### 5.1 Types of personal data

**Resident accounts.** Display name, email address, the village they belong to,
their role in it, their notification preferences, and — if they chose to give it
— an approximate home location. A home location is deliberately imprecise: the
point the resident taps is moved by a random distance before it is stored, and
the exact point is never kept.

**Incident reports.** The resident's own description of what happened; the
anonymised rewrite of it that other residents see; the category and severity;
the approximate place and the date and time; and any photographs, with faces
covered and with the hidden location data that cameras record stripped out. Map
positions are moved by a random distance before they are stored, in the same way
as home locations.

**Records of use.** Who published, edited, removed or read what, and when. The
law requires the council to be able to show how the data has been handled, and
these records are how it can.

**Criminal offence data.** Reports describe suspected criminal activity, so they
contain criminal offence data as the law defines it. The council's Appropriate
Policy Document sets out the authorisation for processing it, and this agreement
should be read alongside that document.

### 5.2 Special category data

The service does not ask for, and is not designed to collect, data about health,
race, religion, politics, sex life, sexual orientation, trade union membership,
or genetic or biometric identifiers.

It cannot rule out that a resident types something of that kind into a report in
their own words — a description of somebody's ethnicity, for example. Two things
reduce it: the rewrite that removes identifying detail before publication, and
the coordinator review that most villages will run. Neither is a guarantee, and
the Data Protection Impact Assessment treats it as a live risk rather than a
closed one.

Face detection is used to find where a face is in a photograph so it can be
covered. It measures nothing about the person, keeps nothing, recognises nobody,
and cannot tell one face from another.

### 5.3 Categories of data subject

- **Residents who file reports**, and residents who read them.
- **Coordinators and moderators**, who review reports and run the village's
  settings.
- **People described in reports**, who are usually not users of the service and
  will usually not know a report mentions them. They are the people with the
  most at stake and the least say, and the safeguards in §4 exist mainly for
  them.
- **Council officers and police officers** who receive a summary, to the extent
  their names appear in correspondence.

---

## 6. Obligations of the processor

This section sets out the eight obligations Article 28(3) requires. The lettering
matches the Article.

### (a) Process only on the council's documented instructions

The processor will process personal data only on the council's documented
instructions, as described at §3, including where data is transferred outside
the United Kingdom — unless the law requires otherwise, in which case the
processor will tell the council before processing unless the law forbids it from
saying so.

**If an instruction looks unlawful, the processor will say so immediately.** That
duty runs both ways in practice: the processor built the service and is often
the first to notice when an instruction and the law have parted company.

### (b) Confidentiality

Everyone the processor authorises to access personal data under this agreement is
bound by a written duty of confidence that continues after their engagement ends.
Access is limited to the people who need it to run and support the service, and
the processor keeps the list of those people to the minimum the work allows.

### (c) Security — Article 32

The processor will take all measures required by Article 32. What is in place
now:

- **Encryption in transit.** All connections to the service are encrypted.
- **Encryption at rest.** The database and the stored files are encrypted where
  they sit.
- **Faces covered before upload.** A photograph with a face in it is covered on
  the resident's own device. There is deliberately no arrangement by which an
  uncovered original could be uploaded instead if that step failed.
- **Positions moved before storage.** Neither an incident's exact position nor a
  resident's exact home is ever stored.
- **Original wording kept apart.** A resident's own words are held separately
  from the published version, are never shown to other residents, and every
  occasion on which a coordinator reads them is recorded.
- **One village at a time.** Every read of report data is confined to a single
  village, and the database itself enforces that separately from the software.
- **Records of sensitive actions**, which cannot be altered or deleted from
  within the service once written.
- **Automatic disposal.** Reports are archived and photographs deleted on the
  published schedule, without anyone having to remember.
- **Restricted administrative access**, with sign-in protected by the
  authentication provider named at §6(d).
- **Backups**, held by the hosting provider and used only to restore the service.

The processor will keep these measures under review as the risk changes, and will
not reduce them without telling the council.

### (d) Sub-processors

The processor will not engage another processor without the council's prior
written authorisation. **By signing this agreement the council authorises the
sub-processors listed below**, and §7 sets out how the list may change.

| Sub-processor | What it does | Where the data is |
|---|---|---|
| **Supabase** | Holds the database, the sign-in records and the stored photographs | London, United Kingdom |
| **Vercel** | Runs the website | London, United Kingdom |
| **Anthropic** | Provides the artificial intelligence model that rewrites and categorises reports | United States |
| **OneSignal** | Delivers notifications to residents' phones | United States |
| **Slack (Salesforce)** | Receives internal notices to the processor's own staff | United States |

**What each one actually receives.**

- *Supabase* holds everything: accounts, reports, original wording and
  photographs. It is the database, so this is unavoidable.
- *Vercel* runs the software that reads and writes that data, and holds no
  separate copy of it.
- *Anthropic* receives the text of a report — including the resident's original
  wording, because removing the identifying detail from it is the whole point of
  sending it. It does not receive photographs, map positions, names or email
  addresses.
- *OneSignal* receives an internal account reference, which is not a name or an
  email address, and the text of an alert. Alert text carries only published,
  anonymised content.
- *Slack* receives administrative notices to the processor's own private staff
  channel: that somebody has registered, that a report has been published, that
  somebody has applied to be a coordinator, or that an application has been
  decided. It carries an anonymised summary, and a resident's name — with their
  email address on registration, because saying who is the purpose of that
  notice. It never carries a resident's original wording and never carries map
  positions.

**Where the terms are not equivalent, this document says so.** The processor has
written data processing terms with Supabase, Vercel, Anthropic and OneSignal
imposing obligations equivalent to those in this agreement. It does **not** have
a separate agreement with Salesforce for the Slack channel beyond Slack's own
standard terms. The processor considers that proportionate for an administrative
notice with no resident-facing dependency on it, at the scale of a single
parish, and the privacy notice says the same rather than claiming otherwise. It
is not a position the processor intends to keep past a second parish, and the
council is entitled to object to it under §7.

**The processor remains fully liable to the council** for the performance of
every sub-processor listed here.

### (e) Assisting with residents' rights

The processor will help the council meet a request from a resident or from
somebody described in a report, so far as it is able, by appropriate technical
and organisational measures.

Some of it the service does directly, and the council can point a resident at it:

- **See their own data** — a resident's reports and account are visible to them
  when signed in.
- **Delete a report** — a resident can delete a report they filed. The report's
  contents are removed and the link between the report and the person who filed
  it is severed.
- **Close an account** — a resident can close their account, which scrubs their
  profile and their reports.
- **Correct a report** — a resident can edit a report that has not yet been
  published.

The rest the processor will do on the council's written request, within **7
working days** unless the request is unusually large, in which case the processor
will say so and agree a date.

A request that reaches the processor directly will be passed to the council
promptly and will not be answered by the processor on its own initiative — the
council is the controller and the answer is the council's to give.

### (f) Assisting with security, breaches and impact assessments

The processor will help the council meet its obligations under Articles 32 to
36, taking into account what the processor knows and what the processing
involves:

- **Article 32 — security.** Maintaining the measures at §6(c) and telling the
  council if they change.
- **Articles 33 and 34 — breaches.** Notifying the council under §9, and giving
  it what it needs to notify the Information Commissioner and, where required,
  the residents affected.
- **Articles 35 and 36 — impact assessment and prior consultation.** The
  processor has drafted a Data Protection Impact Assessment for this service and
  will keep it current, and will provide what the council needs for any
  consultation with the Information Commissioner. The assessment remains the
  council's to review, adopt and sign; the duty to carry it out sits with the
  controller.

### (g) Deletion or return at the end

At the end of this agreement the processor will delete or return all personal
data, at the council's choice, and delete existing copies unless the law requires
it to keep them. Section 11 sets out how and by when.

### (h) Demonstrating compliance

The processor will make available to the council all information necessary to
show that the obligations in this section are being met, and will allow and
contribute to audits under §10.

---

## 7. Changing the list of sub-processors

The processor may add or replace a sub-processor, subject to the following.

1. **Thirty days' notice.** The processor will tell the council in writing at
   least 30 days before a new sub-processor begins processing, saying what it
   will do and where the data will be.
2. **Fourteen days to object.** The council may object in writing within 14 days
   of that notice, on reasonable data protection grounds.
3. **What happens then.** The parties will discuss the objection in good faith
   and look for a change that resolves it. If none can be found within 30 days,
   the council may end this agreement under §11 with no penalty and no charge,
   and the processor will delete or return the data as §11 requires.
4. **Silence is agreement.** If the council does not object within 14 days, the
   new sub-processor is authorised.
5. **Urgent replacements.** If a sub-processor has to be replaced immediately —
   because it has failed, or because keeping it would itself be a security risk
   — the processor may do so and will tell the council as soon as it can and in
   any event within 3 working days. The council's right to object under
   paragraphs 2 and 3 is unaffected.

The processor will keep the list at §6(d) current and will make the current
version available to the council on request.

---

## 8. Sending data outside the United Kingdom

Two of the five sub-processors process personal data outside the United Kingdom.

| Sub-processor | Where | How the transfer is covered |
|---|---|---|
| **Anthropic** | United States | Standard Contractual Clauses, with the UK International Data Transfer Addendum, under Anthropic's commercial terms *[processor to confirm the current mechanism and record the date checked — DPIA action A9]* |
| **OneSignal** | United States | Standard Contractual Clauses with the UK Addendum *[processor to confirm — DPIA action A11]* |
| **Slack (Salesforce)** | United States | Salesforce's standard terms and transfer clauses. See the qualification at §6(d) |

Supabase and Vercel process this service's data in London. Vercel's support and
network operations may be carried out from outside the United Kingdom, which is
covered by Vercel's own terms.

The processor will not begin any new transfer outside the United Kingdom without
a valid transfer mechanism in place, and will tell the council under §7 before it
does.

---

## 9. If there is a personal data breach

A personal data breach is any security failure that leads to personal data being
destroyed, lost, altered, disclosed or accessed when it should not have been —
accidentally or deliberately.

**The processor will notify the council without undue delay and in any event
within 24 hours** of becoming aware of one. That is deliberately tighter than the
law requires of the council itself: the council has 72 hours to notify the
Information Commissioner, and it cannot start counting until it has been told.

The notification will describe, so far as the processor knows at the time:

- what happened and when the processor became aware of it;
- the categories of personal data and the approximate number of residents and
  records affected;
- the likely consequences;
- what the processor has done and is doing about it; and
- a named contact for further information.

**An incomplete picture is not a reason to wait.** The processor will send what
it has within 24 hours and follow up as it learns more.

The processor will not notify the Information Commissioner or any resident on
the council's behalf unless the council asks it to in writing. The decision to
notify is the controller's.

The council should keep its own breach procedure — who decides, who is called,
and how the 72 hours are counted. That procedure is action A10 in the Data
Protection Impact Assessment and is the council's to write.

---

## 10. Audit

The council may satisfy itself that the processor is meeting this agreement.

- **Information on request.** The processor will answer the council's written
  questions about the processing, and provide the current sub-processor list, the
  security measures, and the Data Protection Impact Assessment, within **14 days**.
- **Audit or inspection.** The council, or an auditor it appoints who is not a
  competitor of the processor, may audit the processing on **30 days'** written
  notice, no more than once in a 12-month period, during business hours, and in a
  way that does not disrupt the service. There is no notice period and no
  frequency limit following a personal data breach, or where the Information
  Commissioner requires it.
- **Cost.** Each party bears its own costs, unless the audit finds a material
  breach of this agreement by the processor, in which case the processor bears
  the reasonable cost of the audit.
- **Other villages.** An audit will not extend to the personal data of any other
  village. Those residents are not this council's data subjects, and their
  privacy does not yield to this council's audit rights.
- **Confidentiality.** Anything the council learns about the processor's systems
  during an audit is confidential to the audit.

---

## 11. Term, ending, and what happens to the data

**Term.** This agreement starts when both parties have signed it and continues
for as long as the processing described in it continues.

**Ending it.**

- Either party may end it on **90 days'** written notice.
- The council may end it immediately if the processor is in material breach and
  has not put it right within 30 days of being told.
- The council may end it under §7 if an objection to a new sub-processor cannot
  be resolved.
- It ends automatically when the village stops using the service.

**What happens to the data.** Within **30 days** of the end, at the council's
written choice:

- **Return.** The processor provides the village's data in a common, readable
  format — the reports, the account records and the record of sensitive actions
  — and then deletes it; or
- **Delete.** The processor deletes it without returning it.

If the council does not say which by the end of the 30 days, the processor will
delete the data and will tell the council it has done so.

**Deletion means deletion.** Reports, accounts, photographs and the record of
sensitive actions are removed from the live systems. Backup copies held by the
hosting provider are overwritten on that provider's normal cycle and are not
restored except to recover the service; they are not searched, read or used for
any other purpose in the meantime.

**The processor will confirm in writing that deletion is complete**, within 7
days of doing it.

**The exception.** The processor may keep personal data where the law requires
it to, and only for as long as the law requires. It will tell the council what it
is keeping and why.

**What survives the end.** The confidentiality obligation at §6(b), this section,
and any right or remedy either party already had.

---

## 12. Signatures

By signing, each party confirms it has read this agreement and agrees to be bound
by it. **It is not in force until both have signed.**

This agreement should be reviewed **annually from the date of signing**, and
whenever the processing, the sub-processor list or the transfer arrangements
change materially.

### The controller

| | |
|---|---|
| **Organisation** | *[Parish Council name]* |
| **Signed by** | *[Full name]* |
| **Role** | *[Chair / Clerk / Data Protection Lead]* |
| **Date** | *[Date of signing]* |
| **Signature** | *_______________________________* |

### The processor

| | |
|---|---|
| **Organisation** | Yakasista Ltd |
| **Signed by** | Joel Castro Reynoso |
| **Role** | Director |
| **Date** | *[Date of signing]* |
| **Signature** | *_______________________________* |

---

*Keep this agreement for as long as the processing continues and for six years
after it ends, and produce it to the Information Commissioner on request. It
should be read alongside the Data Protection Impact Assessment and the
Appropriate Policy Document for this village.*
