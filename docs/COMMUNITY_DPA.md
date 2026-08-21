# Community Coordinator Agreement — VillageWatch community safety reporting

| | |
|---|---|
| **Document status** | **TEMPLATE — offered on standing terms, accepted on screen** |
| **Version** | 0.1 |
| **Service** | VillageWatch — villagewatch.app |
| **Controller** | *the coordinator who accepts this agreement* |
| **Processor** | Yakasista Ltd |
| **Village** | *the village named on the acceptance screen* |
| **Prepared on** | 20 August 2026 |
| **Next review** | One year from the date it is accepted |

> **This is the agreement for a village with no parish council behind it.** If a
> parish or town council runs your village, stop here — the council is the data
> controller and it has three documents to adopt instead, which is what the
> **council model** on the compliance screen switches to. You can move to that
> model later without losing anything you have done here.
>
> It does two jobs in one document, because you are one person and not a
> council with a clerk. Sections 1 to 5 are the **policy document** the law
> requires before anyone may collect reports about suspected crime. Sections 6
> to 12 are the **contract** between you and the company that runs the software.
> Both are necessary; neither is optional; putting them in one place is the only
> shortcut taken.
>
> It was written by the people who built the service, from the code, so its
> account of what happens to residents' data is accurate rather than aspirational.

---

## 1. Who is responsible for what

You have decided that people in your village should be able to report what they
see, and you decide what happens to those reports — who moderates them, what gets
published, who is invited in. In data protection law that makes you the
**controller**. It is not a title you apply for; it is a description of what you
are already doing, and it would be true whether or not this document existed.

Yakasista Ltd builds and runs the software. It acts on your decisions and takes
none of its own about why the data is held. That makes it the **processor**.

Article 28(3) of the UK GDPR says a controller may only use a processor under a
written contract. This is that contract, and accepting it on the compliance
screen is what forms it. Unlike the council version of this agreement, it does
not wait for a second signature — the terms below are offered by Yakasista Ltd
to every community village on the same basis, and your acceptance is recorded
with your name, the date, and an entry in your village's audit trail.

---

## 2. What being the controller actually means for you

Three duties have a clock on them. The rest is either done by the software or is
a matter of behaving sensibly.

### 2.1 Answer a resident within one calendar month

Anyone in your village can ask you what you hold about them, ask you to correct
it, or ask you to delete it. You have **one calendar month** to reply and you
cannot charge for it.

Most of the work is already done for you. A resident can delete any report they
filed and close their own account without asking you, and doing so erases the
report's contents and the photographs immediately. The audit trail on your
dashboard shows every occasion anybody read a resident's original wording. If a
request is complicated, or you think it is unreasonable, write to the address in
§13 and you will get help with it.

### 2.2 Report a serious breach within 72 hours

If personal data ends up somewhere it should not — the join code posted on a
public page, a coordinator account taken over, a spreadsheet of reports emailed
to the wrong list — you have **72 hours** from becoming aware of it to tell the
Information Commissioner, and you must tell the residents affected directly if
the risk to them is high.

Tell Yakasista Ltd at the same time. It can tell you what was actually exposed,
which is usually narrower than it first looks, and §11 sets out what it will do.

### 2.3 Keep a record of what your village processes

You need a short written record of what data the village holds, why, who else
sees it and how long it is kept. **Sections 3 to 5 of this document are that
record** for everything the software does. You only have to add anything you do
outside it: a paper list of residents, a spreadsheet on your own laptop, a
WhatsApp group with reports pasted into it. If you do none of those, this
document is the whole record.

### 2.4 The things you do not have to do

You do not have to register with the Information Commissioner or pay the data
protection fee to run a village as a not-for-profit community group — but check
this yourself against the ICO's own self-assessment, because it turns on what
else your group does and it is your registration rather than ours.

You do not have to carry out a Data Protection Impact Assessment before you
start. One has been done for the service as a whole — `docs/DPIA.md` in this
repository, linked from your dashboard — and it concludes that no risk in this
processing is rated high once the safeguards are in place. You are running the
same software with the same safeguards. Read it if you want to know what was
considered; you do not have to produce one of your own.

---

## 3. The condition that lets a village collect these reports at all

This section is the part of this document that the Data Protection Act 2018
calls an **appropriate policy document**, and it is not optional. Reports
describe suspected criminal activity, which is **criminal offence data** under
UK GDPR Article 10. Article 10 allows it only where domestic law authorises it.

The authorisation is section 10(5) of the Data Protection Act 2018 together with
**Schedule 1, Part 2, paragraph 10 — preventing or detecting unlawful acts** —
and **paragraph 5 of that Schedule makes having this policy document a condition
of relying on it**. A village with no policy document is not a village with
incomplete paperwork; its processing has no authorisation at all. That is why
this section is here rather than in a folder somewhere, and why the compliance
gate will not let a village take a report until it has been accepted.

The condition applies because the processing:

- is necessary for preventing or detecting unlawful acts — a village cannot
  warn people about a pattern of break-ins without recording the break-ins;
- has to happen without asking the person suspected, since asking them would
  defeat the point; and
- is in the substantial public interest, which community safety reporting to a
  neighbourhood group and, through it, to the police, is.

**The Information Commissioner may ask to see this document at any time.** Keep
it, and keep the record of your acceptance, until six months after your village
stops processing reports.

---

## 4. How the village keeps to the data protection principles

| Principle | How it is met |
|---|---|
| **Lawfulness and fairness** | The condition at §3. Residents are told before they file what happens to their report, in the privacy notice linked from every page. |
| **Purpose limitation** | Reports are used for community safety in this village and nothing else. They are not sold, not used for advertising, and not shared outside the village except as §5 describes. |
| **Data minimisation** | An artificial intelligence rewrite removes names, vehicle registrations and addresses from every report before it is published, and the reporter reads and accepts that rewrite before anything is saved. Faces in photographs are covered on the reporter's own device, before the file leaves it. Map positions are moved by a random distance before they are stored, so no exact location is ever held. |
| **Accuracy** | A reporter can edit their own report while it is awaiting review, and can ask you to correct or remove it at any time afterwards. |
| **Storage limitation** | §5. |
| **Integrity and confidentiality** | §9. |
| **Accountability** | Every sensitive action — reading a resident's original wording, exporting the reports, producing a document for the police, changing a village setting — is recorded in a trail that cannot be altered or deleted from inside the service, by you or by us. |

---

## 5. What is held, who sees it, and for how long

### 5.1 What is held

Residents' names and email addresses; an optional address and approximate home
location; the reports they file, both in their own words and in the published
rewrite; photographs and video with faces covered; and the record of who did
what.

### 5.2 Who sees it

- **Every signed-in resident of your village** sees published reports — the
  rewrite, the approximate position, the covered photographs.
- **You and any other coordinator** additionally see reports awaiting review,
  and can read a reporter's original wording. Every one of those reads is
  recorded.
- **Nobody in another village** sees any of it. The database enforces that
  separately from the software.
- **Outside the village**: whatever you choose to share. The share buttons
  produce a summary for a police contact, a spreadsheet export, and a text you
  can paste into a WhatsApp channel or Facebook. What they carry never includes
  a reporter's original wording or a map coordinate. What you do with them after
  that is your decision as controller, and it is worth thinking about before you
  paste something to a public feed.

### 5.3 How long

| Data | Kept for | Then |
|---|---|---|
| **Photographs and video** | 6 months | Deleted from storage permanently, covered copies included |
| **Reports** | 12 months | Archived — off the map, off the list, out of every screen a resident can see |
| **The reporter's original wording** | 12 months | Deleted, in the same overnight step that archives the report |
| **The audit trail** | 24 months | Removed as a deliberate administrative act — it is protected against deletion from inside the service, which is what makes it worth having |
| **Accounts** | As long as the account is open | Erased when the resident closes it, along with every report they filed |

The first three happen automatically, overnight, from the same figures the
privacy notice states, so the policy and the software cannot drift apart. A
resident does not have to wait for any of them: deleting a report, or closing an
account, erases the contents immediately.

---

## 6. Obligations of the processor

Article 28(3) requires a written contract covering eight things. They are
lettered here to match the Article, and they are the same eight as in the
council version of this agreement — the terms are not thinner because the
controller is a volunteer.

### (a) Process only on your documented instructions

Yakasista Ltd will process personal data only on your documented instructions, as
described in §5, including where data is transferred outside the United Kingdom
— unless the law requires otherwise, in which case it will tell you first unless
the law forbids it from saying so.

**If an instruction looks unlawful, it will say so immediately.** In practice
that duty runs mostly one way: it built the service and is usually the first to
notice.

### (b) Confidentiality

Everyone Yakasista Ltd authorises to access personal data under this agreement is
bound by a written duty of confidence that continues after their engagement ends.
Access is limited to the people who need it to run and support the service.

### (c) Security

The measures in place are listed at §9. They are a term of this agreement rather
than a description of good intentions: removing one of them is a breach of this
contract, not a stale sentence.

### (d) Sub-processors

Yakasista Ltd will not engage another processor without your authorisation. **By
accepting this agreement you authorise the sub-processors at §10**, and you will
be told before any is added or replaced, with a fair chance to object.

### (e) Assisting with residents' rights

The software already answers most of a request: a resident can export nothing
today, but they can delete their own reports and close their own account, and the
audit trail shows who read what. Where the software cannot answer a request,
Yakasista Ltd will help you answer it, at no charge, within the time you have.

### (f) Assisting with security, breaches and assessments

Yakasista Ltd will help you meet your obligations on security, breach
notification and impact assessment, taking account of what it knows and you do
not — which, on a technical question, is most of it.

### (g) Deletion or return at the end

When your village stops using the service, you choose: the data is exported to
you, or it is deleted. §12 sets out the timing.

### (h) Demonstrating compliance

Yakasista Ltd will make available the information needed to show these
obligations are met, and will allow and contribute to audits — see §12.

---

## 7. Where the data is

The database, the sign-in records and the stored photographs are held by
**Supabase in London**, United Kingdom. That is a term of this agreement and not
a hosting preference.

---

## 8. What leaves the United Kingdom

Two things, and both are named in the privacy notice residents read:

- **Anthropic**, in the United States, receives the text of a report in order to
  produce the anonymised rewrite. It receives no name, no email address and no
  coordinate.
- **OneSignal**, in the United States, receives an internal account reference and
  the text of a push alert, which carries only published, anonymised content.

There is also a staff notification channel on **Slack**, which receives an
anonymised summary of a published report, or the fact that somebody has
registered or applied to coordinate — with their name, and their email address on
registration. It is a private channel that only the people running the service
can read. This is a **disclosure to you rather than a claim of cover**: there is
no separate processing agreement with Slack beyond its standard terms, and the
privacy notice says so in the same words. If you would rather it did not happen
for your village, write to the address at §13 and it will be switched off.

The transfer mechanisms for Anthropic and OneSignal are being confirmed and are
marked as outstanding in the impact assessment. You are entitled to know that
before you accept rather than after.

---

## 9. Security measures in place

- **Encryption in transit.** Every connection to the service is encrypted.
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
  village, and the database enforces that separately from the software.
- **Records of sensitive actions**, which cannot be altered or deleted from
  inside the service once written.
- **Automatic disposal** on the schedule at §5.3, without anyone having to
  remember.
- **Restricted administrative access**, with sign-in protected by the
  authentication provider at §10.
- **Backups**, held by the hosting provider and used only to restore the service.

These will be kept under review as the risk changes, and will not be reduced
without telling you.

---

## 10. The sub-processors you are authorising

| Sub-processor | What it does | Where the data is |
|---|---|---|
| **Supabase** | Holds the database, the sign-in records and the stored photographs | London, United Kingdom |
| **Vercel** | Runs the application itself | London region |
| **Anthropic** | Rewrites report text to remove identifying details | United States |
| **OneSignal** | Delivers push notifications to residents' devices | United States |

---

## 11. If there is a personal data breach

Yakasista Ltd will tell you **without undue delay** after becoming aware of one,
and in any event within 24 hours, with what it knows: what happened, roughly how
many people are affected, what the likely consequences are and what is being done
about it. If it does not know everything at that point it will tell you anyway
and follow up.

**You decide whether to notify the Information Commissioner**, because you are
the controller and the 72-hour clock is yours. You will be given whatever you
need to make that decision and to make the notification.

---

## 12. Ending, auditing, and moving to a council

**Ending.** Either party may end this agreement on 30 days' written notice, and
you can close the village at any time. Within 30 days of the end you choose
export or deletion; if you choose neither, the data is deleted after 90 days and
you will be reminded before that happens. The audit trail is kept as long as the
law requires it and no longer.

**Auditing.** You may ask for the information needed to satisfy yourself that
these obligations are met, once a year and more often if there has been a breach.
The service is built openly enough that most questions can be answered by
pointing at the code.

**Moving to a council.** If a parish or town council later takes your village on,
switch to the council model on the compliance screen. The council then adopts the
impact assessment, its own policy document and the council version of this
agreement, and becomes the controller from the date it does so. Your acceptance
of this agreement is not deleted and is not undone — you *were* the controller
for that period, and the record of it is what shows the handover was orderly.
Your village keeps running on these terms until the council has finished.

---

## 13. Contact

Write to **info@yakasista.com** for anything in this agreement: a resident's
request you are not sure how to answer, a breach, a question about the terms, or
to ask for the Slack notifications to be switched off for your village.

---

## 14. Acceptance

Accepting this agreement on the compliance screen records your name, your email
address and the date against your village, and writes an entry in the audit
trail. It cannot be undone from that screen: you did accept it, on that date, and
a record that could be rewritten would be worth nothing to the person who one day
asks to see it.

By accepting you confirm that:

- you are the data controller for community safety reports in your village;
- you have read §2 and understand the three duties with a deadline on them;
- you agree to the terms in §6 to §12 with Yakasista Ltd; and
- §3 to §5 are your village's policy document and record of processing, and you
  will keep them until six months after the processing ends.

Review this agreement **one year** from the date you accept it, and whenever the
processing, the sub-processor list or the transfer arrangements change
materially.
