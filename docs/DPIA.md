# Data Protection Impact Assessment

**VillageWatch — community safety reporting for villages and neighbourhoods**

| | |
|---|---|
| **Document status** | **DRAFT TEMPLATE — not yet reviewed or signed off** |
| **Version** | 0.1 |
| **Prepared by** | Yakasista Ltd (processor) |
| **Prepared on** | 27 July 2026 |
| **Controller** | *[Parish Council name]* — one controller per village |
| **Reviewed by** | *(pending)* |
| **Signed off by** | *(pending — see signature block)* |
| **Next review** | Six months after the first village goes live |

> **This is a template.** It was written by the developer of the service from
> the source code, so it is an accurate account of what the software does. It is
> **not** a completed assessment. The parish council is the data controller and
> Article 35 places the duty to carry out the DPIA on the controller, not on us.
> Sections marked *[Controller to complete]* need the council's own answers, and
> the whole document needs the council's review and signature before any real
> resident data is processed.
>
> Where the software's behaviour is described, the relevant source file is
> named. If the code changes, this document changes in the same commit — the
> same rule the privacy notice is held to.

---

## Step 1 — Is a DPIA required?

Yes. Under UK GDPR Article 35(1) a DPIA is required where processing is likely
to result in a high risk to the rights and freedoms of individuals. This
processing meets several of the ICO's criteria for mandatory screening:

| ICO criterion | Applies | Why |
|---|---|---|
| Innovative technology | **Yes** | A large language model rewrites resident-authored reports; on-device face detection processes photographs. |
| Tracking geolocation | **Yes** | Incident locations and residents' optional home locations are collected and stored. |
| Data concerning vulnerable subjects | **Yes** | Reports may concern or be filed by vulnerable residents; the service is open to anyone aged 16 or over. |
| Criminal offence data | **Yes** | Reports describe suspected criminal activity — see §4.3. |
| Large-scale processing | Not initially | One parish of a few hundred residents. Re-assess if the service is offered to multiple parishes. |
| Denial of service / legal effect | No | No decision made by the service has a legal or similarly significant effect on anyone. |
| Matching or combining datasets | Partly | Pattern detection clusters reports by proximity and time. It is a count, not a profile of an individual. |

Two criteria alone would trigger the requirement. This DPIA is therefore
mandatory, not precautionary.

---

## Step 2 — Describe the processing

### 2.1 What the service does

VillageWatch lets residents of a village report things they have seen — a
break-in, antisocial behaviour, a fallen branch, a scam caller. Each report is
passed through an AI model that rewrites it to remove personal details and
categorises it. The rewritten version appears on a village map and incident
list, and can trigger a push notification to other residents. Village
coordinators moderate reports before publication, and a weekly job looks for
clusters that suggest a pattern.

### 2.2 Nature of the processing

| | |
|---|---|
| **Collection** | Residents submit reports through a web form. Registration collects name, email, address and an optional home location. |
| **Use** | Reports are published to other residents of the same village, aggregated into dashboard statistics, summarised in a weekly digest, and formatted into documents a coordinator can send to the police or the parish council. |
| **Storage** | Supabase Postgres (region `eu-west-2`, London) and Supabase Storage for media. |
| **Sharing** | Within the village to signed-in residents; outside it only by a deliberate coordinator action (§2.6). |
| **Deletion** | Automated retention job (§7), plus resident-initiated erasure. |

### 2.3 Scope — what personal data is processed

| Data | Source | Visibility | Notes |
|---|---|---|---|
| Name | Registration | Coordinators; not shown on public report surfaces | |
| Email address | Registration / Supabase Auth | Coordinators, platform administrators | |
| Address | Registration, optional | Coordinators | Free text |
| Home location (lat/lng) | Registration, optional | Never displayed | Jittered by 75 m before storage (`HOME_LOCATION_FUZZ_METERS`, `src/lib/geo.ts`). Used only to decide who is near enough to be alerted. |
| Incident report — original wording (`rawDescription`) | Reporter | **Reporter, coordinators and moderators only.** Never published. | Verbatim resident text; may contain names, vehicle registrations, addresses. Every read is logged. |
| Incident report — published wording (`description`) | AI rewrite, accepted by the reporter | All signed-in residents of the village | The public surface. |
| Incident location (lat/lng) | Reporter picks a point on a map | All signed-in residents of the village | Jittered by 100 m before storage (`LOCATION_FUZZ_METERS`). The exact point is never persisted. |
| Incident landmark text | Reporter | All signed-in residents of the village | e.g. "the lane behind the village hall" |
| Photographs and video | Reporter, optional | All signed-in residents of the village | Faces redacted and EXIF stripped **in the browser before upload** (§5). |
| Account role and verification status | Server-side only | — | Never accepted from a client payload. |
| Notification preferences | Resident | — | |
| Audit trail | System | Coordinators (village-scoped) | Who did what, when. Append-only. |
| Rate-limit counters | System | Nobody | Auth user id, action name, count. |

**Data deliberately not collected:** date of birth (only a confirmation of being
16 or over), phone number, payment details, precise home address coordinates,
any biometric template.

### 2.4 Context — who is affected

- **Residents who register and file reports.** They provide their own data and
  can see, correct, export and erase it.
- **Residents who register and only read.** Profile data only.
- **People described in reports who have not consented and may not know.** This
  is the group at greatest risk and is the reason most of the mitigations in §8
  exist. A report about a suspected burglar, a nuisance neighbour or a
  suspicious vehicle is personal data about that person, processed without their
  knowledge, in a small community where partial details identify someone.

### 2.5 Purposes

| Purpose | Necessity |
|---|---|
| Alert residents to safety incidents near them | The core purpose. |
| Give coordinators a moderation queue | Prevents unreviewed personal data reaching the village. |
| Detect patterns across reports | Identifies repeat activity earlier than reading reports one by one. |
| Produce summaries for the police and the parish council | The route by which a village's reports become action. |
| Maintain an audit trail | Accountability under Article 5(2), and the control that makes access to original wording safe. |

### 2.6 Disclosure outside the village

There are three routes, all deliberate and all initiated by a person:

1. **A coordinator copies a formatted alert to a WhatsApp Channel.** A channel
   is a public surface. Off by default, minimum severity defaults to HIGH, and
   nothing in the software posts automatically — a coordinator pastes it
   (`src/lib/whatsapp-channel.ts`, `src/lib/format-alert.ts`).
2. **A coordinator shares a report or a period summary with the police or the
   council.** Published reports only, and the document is structurally incapable
   of carrying original wording or coordinates (`src/lib/community-report.ts`).
3. **A CSV export for a council meeting.** Anonymised column only, never
   original wording, and the export itself is audited
   (`src/lib/incident-csv.ts`).

---

## Step 3 — Consultation *[Controller to complete]*

Article 35(9) expects the controller to seek the views of data subjects or their
representatives where appropriate.

| Consultee | Method | Date | Outcome |
|---|---|---|---|
| Parish council members | *[Council meeting]* | *[ ]* | *[ ]* |
| Residents | *[Parish newsletter / public meeting / notice board]* | *[ ]* | *[ ]* |
| Neighbourhood Watch coordinator(s) | *[ ]* | *[ ]* | *[ ]* |
| Local policing team / PCSO | *[ ]* | *[ ]* | *[ ]* |
| Data protection officer, if one is appointed | *[ ]* | *[ ]* | *[ ]* |
| Processor (Yakasista Ltd) | Wrote this assessment | 27 July 2026 | See §8 |

**Recommended:** consult residents before launch, not after. The group most
affected — people described in reports — cannot be consulted individually, which
makes a general parish consultation the only realistic substitute.

---

## Step 4 — Necessity, proportionality and lawful basis

### 4.1 Lawful basis

| Processing | Lawful basis | Reasoning |
|---|---|---|
| Creating and holding a resident account | **Article 6(1)(b) — contract**, with **6(1)(a) consent** for the optional home location | The account is what the resident asked for. The home location is genuinely optional, is offered with an explicit "Skip", and skipping it costs the resident nothing but a wider alert radius. |
| Publishing incident reports to the village | **Article 6(1)(f) — legitimate interests** | Community safety. See the balancing test at §4.2. |
| Push notifications | **6(1)(f)**, with granular opt-outs, plus browser-level permission | The browser's own permission prompt is a separate consent gate the service cannot bypass. |
| The AI rewrite | **6(1)(f)** | The interest served is the *protection* of the people named in the report — the rewrite exists to remove their details. |
| Audit trail | **6(1)(c) — legal obligation** (Article 5(2) accountability) and 6(1)(f) | |
| Sharing with the police | **6(1)(f)**, and Schedule 2 Part 1 para 2 DPA 2018 where a disclosure is for the prevention or detection of crime | The disclosure is a decision made by a named coordinator and is recorded. |

**Consent is not used as the basis for publishing reports**, and should not be:
the people most affected are those described in reports, and they are not in a
position to give or refuse it. Relying on the reporter's consent would be
consent from the wrong person. Legitimate interests, with a documented balancing
test and real mitigations, is the honest basis.

### 4.2 Legitimate interests assessment (Article 6(1)(f))

**Purpose test.** Is there a legitimate interest? Yes: reducing crime and
antisocial behaviour in a village, and letting residents take ordinary
precautions. The interest is shared by the residents, the parish council and the
local policing team.

**Necessity test.** Is the processing necessary? Yes, and the alternative is
instructive: the same information already circulates in village WhatsApp groups
and Facebook pages, unmoderated, un-anonymised, with photographs unredacted and
no retention limit at all. The processing here is necessary to achieve the same
purpose *with* those controls. It is not necessary to publish original wording,
exact coordinates or unredacted photographs — and none of those is published.

**Balancing test.**

| Factor | Assessment |
|---|---|
| Reasonable expectations of reporters | High. They wrote the report and reviewed the rewrite before it was saved. |
| Reasonable expectations of people described | **Low.** They do not know a report exists. This is the principal intrusion. |
| Severity of possible harm | Significant: misidentification, reputational damage, or a neighbour dispute escalating. In a village of a few hundred, "a white van by the Green on Tuesday" can identify one household. |
| Likelihood of harm | Reduced but not eliminated by the mitigations at §8. |
| Children | The service is 16+; reports may still describe children. Coordinator moderation is the control. |
| Balance | **Processing may proceed** on the strength of the mitigations: the original wording is never published, coordinates are jittered, faces are covered before upload, and a human reviews every report before publication unless the village has deliberately switched that off. |

**Residual concern to be managed operationally, not technically:** a report that
is accurate but hostile — naming no one, yet obviously about one household. The
moderation queue is the only control, which makes coordinator training a real
requirement rather than a formality. See §9, action A4.

### 4.3 Criminal offence data (Article 10 / DPA 2018 s.10–11)

**This assessment finds that the service processes criminal offence data, and
the controller must satisfy itself of this point before launch.**

Article 10 covers personal data relating to criminal convictions and offences.
Section 11(2) of the Data Protection Act 2018 extends the meaning to data about
**alleged** offences. A report saying "a man in a blue jacket forced the shed on
Church Row" is an allegation of an offence about an identifiable-or-not person;
where the report is specific enough to point at someone, it is Article 10 data.

Article 10 requires, in addition to an Article 6 basis, either official authority
or an authorisation in domestic law — a condition in Schedule 1 DPA 2018.
Relevant candidates:

- **Schedule 1 Part 2 para 10** — preventing or detecting unlawful acts, where
  seeking consent would prejudice the purpose.
- **Schedule 1 Part 2 para 18** — safeguarding of children and individuals at
  risk, in the narrower cases where that applies.

Either requires an **Appropriate Policy Document** under Schedule 1 Part 4,
covering the controller's compliance with the Article 5 principles and its
retention and erasure policy for this data. **The council does not have one and
needs one before launch.** See §9, action A1. This is the most significant gap
this assessment identifies.

### 4.4 Special category data (Article 9)

**No special category data is collected as a field.** There is no question about
health, ethnicity, religion, sexual orientation, politics or trade union
membership anywhere in the service.

It can nevertheless arrive **incidentally in free text**, and the controller
should assume it will: a report describing someone in mental health crisis
(health data), a description of a suspect that includes ethnicity (racial or
ethnic origin), or a report about a place of worship. Three things reduce the
exposure:

- Original wording is never published (domain rule 1).
- The AI rewrite is instructed to remove identifying detail, and the reporter
  reviews the result before it is saved.
- The moderation queue is a human check on what reaches the village.

None of these guarantees it. If a report containing special category data is
published, the controller has processed Article 9 data without a condition. The
practical answer is the same as for §4.3: coordinator guidance on what to reject
(§9, action A4), and the ability to erase a published report, which exists.

### 4.5 Data minimisation

| Decision | Effect |
|---|---|
| Coordinates jittered on the way in, not on the way out | The exact point is never in the database, so it cannot leak from it later. |
| Original wording held in a separate column omitted from the standard read | A page cannot reach it by accident (`PUBLIC_INCIDENT_SELECT`). |
| Media redacted client-side with **no server-side fallback** | An original with a face in it cannot be uploaded at all. |
| The police/council documents have no field for original wording or coordinates | Structurally incapable of carrying them, rather than relying on the caller. |
| Home location optional | A resident who skips it is included in village-wide alerts rather than excluded. |
| No date of birth | Only a 16+ confirmation. |

---

## Step 5 — Data flows, processors and international transfers

### 5.1 The AI pass — disclosure to Anthropic

**This is the disclosure requiring the clearest explanation to residents, and it
is in the privacy notice.**

- **What is sent:** the reporter's own wording, the incident type, the landmark
  text and the time. Sent to Anthropic's API (`claude-sonnet-5`, configurable via
  `ANTHROPIC_MODEL`) by `POST /api/incidents/process`
  (`src/lib/ai/structure-incident.ts`).
- **Why:** to produce the anonymised rewrite. The purpose of the disclosure is
  to *remove* personal data from what gets published.
- **When:** before the report is saved. The route writes nothing to the database.
- **Where:** Anthropic processes in the **United States**. This is a restricted
  transfer.
- **Transfer mechanism:** the UK International Data Transfer Addendum to the EU
  Standard Contractual Clauses, under Anthropic's commercial terms. *[Controller
  to verify the current terms and record the date checked.]*
- **Training:** Anthropic's commercial terms state that customer API inputs and
  outputs are not used to train its models. *[Controller to verify.]*
- **Retention at Anthropic:** governed by Anthropic's own policy, not by ours.
  *[Controller to record the current figure.]*
- **What happens if it fails:** every failure returns a success response with
  `ok: false`, and the reporter's own wording is used instead, with the screen
  saying so. **Being unable to reach Anthropic never blocks a report** — but it
  does mean the published text is un-anonymised, which the interface warns about
  in red.

### 5.2 Automated decision-making (Article 22)

**Article 22 does not apply.** The AI rewrite is not a decision producing legal
or similarly significant effects, and in any case it is not solely automated:
the reporter is shown the rewrite and must accept it before anything is saved,
and can edit it or discard it.

That statement holds in both village configurations. Where a village leaves
coordinator review on, a second human sees the report before publication. Where
a village has switched **auto-approve** on, the reporter's review is the only
human check — which is why the human named in the privacy notice is the
reporter, not the coordinator. The notice and the terms of use both say so.

### 5.3 Face detection

- **MediaPipe BlazeFace (short-range), running in the resident's own browser**
  via WebAssembly (`src/lib/media/face-blur.ts`).
- **No image, and no derived face template, is ever sent anywhere for
  detection.** The model runs locally.
- **No biometric data is created or stored.** Detection returns a bounding box,
  which is used immediately to draw over the image and then discarded. Nothing
  that could identify a person biometrically — no embedding, no faceprint, no
  landmark set — is retained, so **this is not special category biometric data
  under Article 9(1)**, which requires processing *for the purpose of uniquely
  identifying* a person. Identification is precisely what is not done.
- **Two redaction modes.** The default is a **solid black rectangle**: no source
  pixels are read, so nothing remains to reconstruct. The alternative is
  pixelation to six cells across under a heavy Gaussian. The default is the
  stronger one on purpose — pixelation has a long history of being reversed.
- **EXIF, including GPS, is destroyed** because only the re-encoded canvas
  output is uploaded, never the original file.
- **There is no server-side fallback.** A browser that cannot run the detector
  cannot upload. A fallback would mean accepting an original with a face in it.

### 5.4 Sub-processors

| Sub-processor | Purpose | Location | Restricted transfer | DPA in place |
|---|---|---|---|---|
| **Supabase** | Database, authentication, file storage | `eu-west-2` (London) | No | Yes — Supabase DPA *[verify]* |
| **Vercel** | Application hosting | `lhr1` (London) | Transit/support access may be outside the UK | Yes — Vercel DPA *[verify]* |
| **Anthropic** | The AI rewrite (§5.1) | United States | **Yes** | Yes — commercial terms incl. UK IDTA *[verify]* |
| **OneSignal** | Push notification delivery | United States | **Yes** | *[Verify — DPA required before launch]* |
| **Slack (Salesforce)** | Internal staff notifications | United States | **Yes** | **No separate agreement beyond Slack's standard terms — see below** |
| **Yakasista Ltd** | Development, operation and support (processor to the council) | United Kingdom | No | **Required — see §9, action A2** |

**Slack, and why it is listed differently.** A private staff channel is told when
somebody registers, when a report is published, when a coordinator applies and
when an application is decided. The messages carry an anonymised incident
summary, or the fact of a registration or application together with the
resident's name — and their email address on registration, because identifying
the person is the point of that alert. **Never the original wording of a report,
and never coordinates.** There is no separate data processing agreement with
Salesforce beyond Slack's standard terms, and the privacy notice says so rather
than claiming otherwise. This is a proportionate position for an administrative
disclosure with no resident-facing dependency on it, at the scale of one parish.
It is not a position that survives growth: see §9, action A3.

**OneSignal** receives the Supabase auth user id as an external identifier and
the text of the alert. Alert text carries only published, anonymised content —
a lock screen is the least private surface there is, and the payload is built
accordingly.

### 5.5 What is not sent anywhere

- Original report wording never leaves the database except to Anthropic for the
  rewrite (which is what produces the anonymised version) and to a coordinator's
  screen, logged.
- Coordinates are never sent to Slack, never included in a police or council
  document, never in a push payload, and never in the CSV export.
- Photographs are never sent to any third party for processing.

---

## Step 6 — Data subject rights

| Right | How it is met | Status |
|---|---|---|
| **Be informed** (13–14) | Privacy notice at `/privacy`, linked from registration and the site footer. | Live. Controller details are placeholders — §9, action A5. |
| **Access** (15) | Coordinator can produce a resident's data from the dashboard; a formal SAR goes to the council. | **No self-service export for a resident.** Manual process. |
| **Rectification** (16) | Reporters can edit their own reports while in the queue; profile is editable at `/settings`. | Live. |
| **Erasure** (17) | A resident can delete any report they filed and can close their account (`src/lib/erasure.ts`). Deletion tombstones the row — every personal field, including the original wording, is cleared and the reporter link severed — and deletes the media objects. | Live. **Never exercised against real data — see §9, action A6.** |
| **Restrict processing** (18) | Manual, via the coordinator. | Manual process. |
| **Portability** (20) | CSV export exists for coordinators, not for individual residents. | **Gap.** Article 20 applies to 6(1)(a) and 6(1)(b) processing; the account data it covers is small, and a manual export meets it. |
| **Object** (21) | A resident can close their account. A person described in a report can ask the council to remove it; a coordinator can erase it. | Manual process — and it depends on the person knowing the report exists. |
| **Rights re automated decisions** (22) | Not engaged — §5.2. | — |

**Note on erasure and the audit trail.** The audit trail is append-only and
cannot be deleted from the application, which is what makes it an accountability
record. Erasing a report therefore leaves an audit row that names the report's
identifier and the fact that it was deleted, but the report itself holds nothing
personal afterwards. Closing an account severs the actor link on trail rows and
retains a denormalised email and role. This is a deliberate Article 17(3)(b)/(e)
retention for compliance and legal purposes, and the controller should be
comfortable with it. The Supabase Auth record for a closed account is currently
**not** deleted — see §9, action A7.

---

## Step 7 — Retention

| Data | Policy | Enforcement |
|---|---|---|
| Published incident reports | Archived after **12 months** — off the map, off the list | **Automated**, nightly job at 02:00 UTC (`/api/cron/retention`), keyed on the date reported |
| Photographs and video | Deleted from storage after **6 months** | **Automated**, same job, objects deleted before rows |
| Audit trail | **24 months** stated in the privacy notice | **Not enforced.** The append-only trigger rejects deletion from everyone including the table owner, which is what makes the trail trustworthy. Expiring rows is therefore a deliberate, documented database administration action. **In practice the trail is currently retained indefinitely.** See §9, action A8. |
| Dormant accounts | Closed and anonymised after **24 months** without sign-in | **Not enforced.** No job does this. See §9, action A8. |
| Rate-limit counters | 7 days | Automated, same nightly job |
| Account data | Life of the account, then erased on closure | Resident-initiated |

**The controller must know that two of the four figures its privacy notice
states are not currently enforced by software.** Both are the two that can only
be reduced, never breached, by inaction — nothing is published longer than it
should be — but a privacy notice stating a period the service does not keep is a
compliance gap in its own right. Either enforce them before launch or amend the
notice to describe what actually happens.

---

## Step 8 — Risks and mitigations

Likelihood and severity are scored *before* mitigation (inherent) and *after*
(residual), on a 1–3 scale (low / medium / high). Overall risk follows the ICO's
matrix.

### R1 — A person described in a report is identified from published content

| | |
|---|---|
| **Inherent** | Likelihood 3, Severity 3 — **High** |
| **Harm** | Misidentification, reputational damage, vigilantism, escalation of a neighbour dispute. In a village of a few hundred, small details identify people. |
| **Mitigations** | Original wording never published and omitted from the standard database read; AI rewrite instructed to strip names, registrations and addresses; reporter reviews the rewrite before saving; coordinator moderation queue as a second human check; published reports visible only to signed-in residents of that village. |
| **Residual** | Likelihood 2, Severity 3 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

The residual is not lower because a report can be accurate, anonymously worded
and still obviously about one household. No software control reaches that;
coordinator judgement does. **Action A4.**

### R2 — Original wording is disclosed to someone not entitled to it

| | |
|---|---|
| **Inherent** | Likelihood 2, Severity 3 — **High** |
| **Mitigations** | Exactly one code path reads it, and it writes an audit row *before* returning the text; the standard read omits the column entirely; row-level security withholds the column from the anon key at the database layer via per-column grants; the CSV export, the police documents, the WhatsApp alert and the email templates each have no field capable of carrying it. |
| **Residual** | Likelihood 1, Severity 3 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

### R3 — A photograph identifies someone, or leaks a location through EXIF

| | |
|---|---|
| **Inherent** | Likelihood 3, Severity 3 — **High** — photo GPS metadata has re-identified people before |
| **Mitigations** | Face detection and redaction run in the browser before upload; only the re-encoded canvas output is transmitted, which destroys EXIF including GPS; the default mode is an opaque black box rather than a blur; **there is no server-side fallback**, so an unprocessed original cannot be uploaded at all. |
| **Residual** | Likelihood 2, Severity 2 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

Residual, not low: face *detection* can miss a face — a profile view, a face at
the edge of frame, poor light. A missed face is not redacted. The reporter sees
the processed image before it is attached and can remove it, which is the only
check on this.

### R4 — A resident's home is located from an incident pin

| | |
|---|---|
| **Inherent** | Likelihood 2, Severity 3 — **High** |
| **Mitigations** | Coordinates jittered by 100 m before storage using a cryptographic random source; the exact reported point is never persisted, so it cannot leak later; coordinates never appear in an export, a police document, a push payload or a Slack message; home locations jittered by 75 m and never displayed anywhere. |
| **Residual** | Likelihood 1, Severity 2 — **Low** |
| **Accepted?** | *[Controller to confirm]* |

### R5 — Unauthorised access to another village's data

| | |
|---|---|
| **Inherent** | Likelihood 2, Severity 3 — **High** |
| **Mitigations** | Every incident query scoped by village id taken from the server-side session, never from a request body; role and village are set by server code and a database trigger rejects a client changing its own role, village or verification; row-level security enforced on every table for the anon and authenticated database roles; the authorisation boundary is a server-side session check, not the redirect layer. |
| **Residual** | Likelihood 1, Severity 3 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

Tested with a real anon key across two villages — 43 assertions covering
cross-village reads, original wording, the privilege trigger, the reporter edit
window and the append-only trail. Two holes were found and closed in the
process. **Re-run the policy file after any migration that adds a table or a
column**, or a new table arrives readable.

### R6 — Data sent to the AI model is retained or misused

| | |
|---|---|
| **Inherent** | Likelihood 2, Severity 2 — **Medium** |
| **Mitigations** | Disclosed by name in the privacy notice; processor terms including a UK transfer mechanism; commercial terms exclude training on API inputs; the route writes nothing, so a re-run costs an API call and no stored data; the purpose of the disclosure is to *remove* personal data. |
| **Residual** | Likelihood 1, Severity 2 — **Low** |
| **Accepted?** | *[Controller to confirm]* — subject to verification, action A9 |

### R7 — A report reaches the open internet through a WhatsApp Channel

| | |
|---|---|
| **Inherent** | Likelihood 2, Severity 3 — **High** |
| **Mitigations** | Off by default; minimum severity defaults to HIGH; nothing posts automatically — a coordinator copies the text and pastes it; the alert has no field capable of carrying original wording or coordinates; enabling it is audited; where a report was not anonymised the copy panel says so in red before the coordinator pastes it. |
| **Residual** | Likelihood 2, Severity 2 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

A village running **auto-approve and channel posting together** has put
unreviewed reports one paste away from a public feed. Both default off, both are
audited, and the dashboard shows them together. It is a legitimate coordinator
decision and it should be an informed one.

### R8 — A coordinator misuses their access

| | |
|---|---|
| **Inherent** | Likelihood 2, Severity 3 — **High** |
| **Mitigations** | Every read of original wording is logged before the text is returned; every export, moderation decision, settings change and report generation writes an audit row; the trail is append-only and cannot be deleted by the application or by the table owner; coordinators are appointed by a platform administrator through a recorded approval, not self-serve; the trail is visible to the village's coordinators. |
| **Residual** | Likelihood 2, Severity 2 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

Detection, not prevention. **Action A4** — coordinators need written terms.

### R9 — False, malicious or vexatious reports

| | |
|---|---|
| **Inherent** | Likelihood 2, Severity 3 — **High** |
| **Mitigations** | Coordinator moderation before publication (unless the village disables it); reports are rate limited to 10 per day per account; every report is attributable to a registered account; a published report can be erased; community guidelines in the terms of use. |
| **Residual** | Likelihood 2, Severity 2 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

A village that switches auto-approve on removes the pre-publication control here
and should understand that this is what it is removing.

### R10 — Data breach at the processor or a sub-processor

| | |
|---|---|
| **Inherent** | Likelihood 1, Severity 3 — **Medium** |
| **Mitigations** | Database and storage in the UK; storage bucket private, served through short-lived signed URLs; service-role credentials server-side only and never committed; row-level security limits the blast radius of a leaked anon key; passwords handled by Supabase Auth and never stored by the application; security headers set. |
| **Residual** | Likelihood 1, Severity 2 — **Low** |
| **Accepted?** | *[Controller to confirm]* |

**A breach notification procedure is required** — who tells the ICO within 72
hours, and who tells residents. **Action A10.**

### R11 — Children's data

| | |
|---|---|
| **Inherent** | Likelihood 2, Severity 3 — **High** |
| **Mitigations** | Minimum age 16 to hold an account; moderation queue; original wording never published. |
| **Residual** | Likelihood 2, Severity 2 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

Reports can describe children — antisocial behaviour reports often do. This is
the case for coordinator guidance most clearly. **Action A4.**

### R12 — Processing outstrips the documented legal position

| | |
|---|---|
| **Inherent** | Likelihood 3, Severity 2 — **Medium** |
| **Mitigations** | The privacy notice makes five specific claims about how the software behaves, and the repository holds the developer to changing the notice in the same commit as the behaviour. |
| **Residual** | Likelihood 2, Severity 2 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

The convention is real but it is a convention. **Action A11** — the six-month
review is what tests it.

---

## Step 9 — Measures to reduce risk

| # | Action | Addresses | Owner | Priority | Due | Status |
|---|---|---|---|---|---|---|
| **A1** | Adopt an **Appropriate Policy Document** under Schedule 1 Part 4 DPA 2018 for criminal offence data, and identify the Schedule 1 condition relied on | §4.3 | Controller | **Blocker** | Before launch | Not started |
| **A2** | Execute a **written data processing agreement** between the parish council (controller) and Yakasista Ltd (processor), meeting Article 28(3) | §5.4 | Controller + processor | **Blocker** | Before launch | Not started |
| **A3** | Verify or replace the Slack disclosure — either a signed agreement, or move the staff channel to a service already covered | R6, §5.4 | Processor | Medium | Before a second parish | Disclosed in the notice |
| **A4** | Write **coordinator terms and moderation guidance** — what to reject, how to handle a report about a child, what "obviously about one household" looks like, and the consequences of misusing access | R1, R8, R9, R11 | Controller | **Blocker** | Before launch | Not started |
| **A5** | Replace the placeholder controller details in the privacy notice with the council's real name, address, contact and **ICO registration number**; register with the ICO if not already registered | §6 | Controller | **Blocker** | Before launch | Placeholders in place |
| **A6** | Exercise erasure and the retention job against real data once and verify the storage objects are actually gone | §6, §7 | Processor | High | Before launch | Never run |
| **A7** | Decide and document what happens to the Supabase Auth record when an account is closed; build the deletion route or state the retention in the notice | §6 | Processor | High | Before launch | Open |
| **A8** | Either enforce the audit-log and dormant-account retention periods, or amend the privacy notice to state what actually happens | §7 | Processor | High | Before launch | Open |
| **A9** | Verify Anthropic's current terms — transfer mechanism, training exclusion, retention period — and record the date checked | R6, §5.1 | Controller | High | Before launch | Not verified |
| **A10** | Write a **personal data breach procedure** — detection, the 72-hour ICO notification, resident notification, and who decides | R10 | Controller | **Blocker** | Before launch | Not started |
| **A11** | Verify the OneSignal data processing agreement and its transfer mechanism | §5.4 | Controller | High | Before launch | Not verified |
| **A12** | Consult residents through the parish newsletter or a public meeting and record the outcome at §3 | §3 | Controller | High | Before launch | Not started |
| **A13** | Maintain a **record of processing activities** under Article 30 | Accountability | Controller | Medium | Before launch | Not started |
| **A14** | Remove the sample seed data from any database a resident will use, and rotate the seeded village's join code | Data quality | Processor | High | Before launch | Open |
| **A15** | Give residents a self-service data export | §6, Article 20 | Processor | Low | Post-launch | Open |
| **A16** | Review this DPIA at six months, or sooner on any change to the AI processor, the sub-processor list, retention, or the disclosure routes | R12 | Controller | Medium | Six months after launch | Scheduled |

---

## Step 10 — Outcome and sign-off

### 10.1 Residual risk summary

| Risk | Residual | Accepted by controller |
|---|---|---|
| R1 — Identification from published content | Medium | *[ ]* |
| R2 — Disclosure of original wording | Medium | *[ ]* |
| R3 — Photograph identifies someone | Medium | *[ ]* |
| R4 — Home located from a pin | Low | *[ ]* |
| R5 — Cross-village access | Medium | *[ ]* |
| R6 — AI processor | Low | *[ ]* |
| R7 — Public WhatsApp Channel | Medium | *[ ]* |
| R8 — Coordinator misuse | Medium | *[ ]* |
| R9 — False or malicious reports | Medium | *[ ]* |
| R10 — Breach at a processor | Low | *[ ]* |
| R11 — Children's data | Medium | *[ ]* |
| R12 — Documentation drifting from behaviour | Medium | *[ ]* |

**No residual risk is assessed as high.** Under Article 36, prior consultation
with the ICO is required only where a DPIA indicates a high residual risk that
the controller cannot mitigate. **On this assessment, prior consultation is not
required** — provided the blocker actions at §9 are completed first. If the
controller does not accept a residual rating above, or cannot complete A1, A2,
A4, A5 or A10, that conclusion does not hold and the ICO should be consulted.

### 10.2 Conclusion

**The processing may proceed, subject to the mitigations described in §8 being
in place and the blocker actions in §9 being completed before any real resident
data is processed.**

The technical mitigations are substantive rather than declaratory: the original
wording of a report is structurally unreachable from the surfaces that publish,
export or share it; coordinates are destroyed at the point of collection rather
than filtered at the point of display; and photographs cannot be uploaded
un-redacted because there is no code path that accepts one. The residual risks
are concentrated where they cannot be engineered away — in the judgement of the
people moderating reports, and in the position of people described in reports
who do not know that they are.

That is where the outstanding work is. Five actions are blockers, and four of
them — the Appropriate Policy Document, the processor agreement, coordinator
guidance, and the breach procedure — are documents the council must produce, not
software the developer can write.

### 10.3 Sign-off

| | |
|---|---|
| **Measures approved by** | |
| Name | ................................................................ |
| Position | ................................................................ |
| Organisation | *[Parish Council name]* |
| Signature | ................................................................ |
| Date | ................................................................ |
| *Residual risks approved:* | *[ ] All as recorded at §10.1  [ ] With the exceptions noted below* |
| Notes | ................................................................ |

<br>

| | |
|---|---|
| **DPO advice** *(if a data protection officer is appointed)* | |
| Name | ................................................................ |
| Advice provided | ................................................................ |
| Advice accepted or overruled by | ................................................................ |
| If overruled, reasons | ................................................................ |
| Signature | ................................................................ |
| Date | ................................................................ |

<br>

| | |
|---|---|
| **Processor confirmation** | |
| Organisation | Yakasista Ltd |
| Name | ................................................................ |
| Position | ................................................................ |
| Confirms | The description of the processing at §2 and §5 is an accurate account of the software as at the version below, and the processor will notify the controller before any change to the AI processor, the sub-processor list, the retention schedule or the disclosure routes. |
| Application version | *[ ]* |
| Signature | ................................................................ |
| Date | ................................................................ |

<br>

| | |
|---|---|
| **Consultation with data subjects** | |
| Method | ................................................................ |
| Date | ................................................................ |
| Outcome and how views were taken into account | ................................................................ |
| If views were not sought, why not | ................................................................ |

<br>

| | |
|---|---|
| **Review** | |
| Next review due | Six months after the first village goes live |
| Review triggered early by | A change to the AI processor; a new or removed sub-processor; a change to the retention schedule; a new disclosure route; a personal data breach; a substantial change in the number of villages served |
| Reviewed on | ................................................................ |
| Outcome | ................................................................ |

---

*Prepared by Yakasista Ltd. This document must be reviewed and signed by the
parish council as data controller before it has any effect.*
