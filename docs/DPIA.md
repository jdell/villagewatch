# Data Protection Impact Assessment

**VillageWatch — community safety reporting for villages and neighbourhoods**

| | |
|---|---|
| **Document status** | **DRAFT TEMPLATE — not yet reviewed or signed off** |
| **Version** | 0.1 |
| **Service** | VillageWatch — villagewatch.app |
| **Prepared by** | Yakasista Ltd (processor) |
| **Prepared on** | 27 July 2026 |
| **Controller** | *[Parish Council name]* — one controller per village |
| **Reviewed by** | *(pending)* |
| **Signed off by** | *(pending — see signature block)* |
| **Next review** | Six months after the first village goes live |

> **This is a template.** It was written by the developer of the service from a
> direct examination of how the software actually behaves, so it is an accurate
> account of what the service does. It is **not** a completed assessment. The
> parish council is the data controller and Article 35 places the duty to carry
> out the DPIA on the controller, not on us. Sections marked *[Controller to
> complete]* need the council's own answers, and the whole document needs the
> council's review and signature before any real resident data is processed.
>
> Every statement here about how the service behaves is a statement the
> developer is held to. If the software changes, this document is corrected at
> the same time — the same rule the privacy notice is held to.

---

## Summary

*A plain-English overview of what follows. It is not a substitute for the
assessment itself, and every conclusion in it is drawn from the sections below.*

This Data Protection Impact Assessment identifies **12 privacy risks** in
running community safety reporting for a village, and records what reduces each
of them.

**What the service already does, with nothing required from the council or its
coordinators.** Faces in photographs are found and covered automatically on the
reporter's own device, before the file leaves it. Map positions are moved by a
random distance before they are stored, so no exact location is ever held. An
artificial intelligence model rewrites every report to remove names, vehicle
registrations and addresses, and the reporter reads and accepts that rewrite
before anything is saved. The reporter's original wording is kept apart from
everything else and is never published. The database itself keeps one village's
reports away from another's. Reports are archived after 12 months and
photographs deleted after 6, automatically and overnight. None of this needs
switching on, configuring or maintaining.

**What the assessment concludes.** After those safeguards, **no risk is rated
high**: nine of the twelve are medium and three are low. Consultation with the
Information Commissioner before starting is therefore not required. The
assessment is deliberate about why nine remain at medium — they sit where
software cannot reach them, in the judgement of the coordinators who review
reports, and in the position of a person who is described in a report and does
not know it exists.

**What the council still has to do.** Accepting this document, the Appropriate
Policy Document and the data processing agreement on the compliance page is what
allows the village to begin accepting reports, and it is the coordinator's part.
It is not the whole of the council's part. Five actions at §9 are marked
**blocker** and belong to the council rather than to the software — chiefly a
written contract with the processor, the council's real details and ICO
registration in the privacy notice, written guidance for coordinators, and a
procedure for a data breach. Four of the five are documents the council writes;
no software can produce them. The contract is now drafted and sits on the
compliance page with the other two, but it takes two signatures rather than one
and is not in force until both parties have signed it. Section 9 sets out who
owns each action, and §10.3 is where the council signs.

---

## Step 1 — Is a DPIA required?

Yes. Under UK GDPR Article 35(1) a DPIA is required where processing is likely
to result in a high risk to the rights and freedoms of individuals. This
processing meets several of the ICO's criteria for mandatory screening:

| ICO criterion | Applies | Why |
|---|---|---|
| Innovative technology | **Yes** | An artificial intelligence model rewrites resident-authored reports; automatic face detection processes photographs on the resident's own device. |
| Tracking geolocation | **Yes** | Incident locations and residents' optional home locations are collected and stored. |
| Data concerning vulnerable subjects | **Yes** | Reports may concern or be filed by vulnerable residents; the service is open to anyone aged 16 or over. |
| Criminal offence data | **Yes** | Reports describe suspected criminal activity — see §4.3. |
| Large-scale processing | Not initially | One parish of a few hundred residents. Re-assess if the service is offered to multiple parishes. |
| Denial of service / legal effect | No | No decision made by the service has a legal or similarly significant effect on anyone. |
| Matching or combining datasets | Partly | Pattern detection groups reports that are close together in place and time. It is a count, not a profile of an individual. |

Two criteria alone would trigger the requirement. This DPIA is therefore
mandatory, not precautionary.

---

## Step 2 — Describe the processing

### 2.1 What the service does

VillageWatch lets residents of a village report things they have seen — a
break-in, antisocial behaviour, a fallen branch, a scam caller. Each report is
passed through an artificial intelligence model that rewrites it to remove
personal details and sorts it into a category. The rewritten version appears on
a village map and incident list, and can trigger a notification to other
residents' phones. Village coordinators review reports before publication, and
once a week the service looks for groups of reports that suggest a pattern.

### 2.2 Nature of the processing

| | |
|---|---|
| **Collection** | Residents submit reports through a web form. Registration collects name, email, address and an optional home location. |
| **Use** | Reports are published to other residents of the same village, counted into dashboard statistics, summarised in a weekly digest, and formatted into documents a coordinator can send to the police or the parish council. |
| **Storage** | In a database and file store operated by Supabase, held in London, United Kingdom. |
| **Sharing** | Within the village to signed-in residents; outside it only by a deliberate coordinator action (§2.6). |
| **Deletion** | An automatic overnight housekeeping process (§7), plus deletion requested by the resident. |

### 2.3 Scope — what personal data is processed

Two terms used throughout this document:

- **Shifted.** A map position is moved by a random distance, in a random
  direction, before it is stored. The true position is never recorded, so it
  cannot be recovered afterwards by anyone, including the developer.
- **Original wording.** The reporter's own words, exactly as typed. This is
  held separately from the published version and is never shown to residents.

| Data | Source | Visibility | Notes |
|---|---|---|---|
| Name | Registration | Coordinators; not shown on public report surfaces | |
| Email address | Registration / sign-in provider | Coordinators, platform administrators | |
| Address | Registration, optional | Coordinators | Free text |
| Home location | Registration, optional | Never displayed to anyone | Shifted by up to 75 metres before storage. Used only to decide who is near enough to an incident to be alerted. |
| Incident report — original wording | Reporter | **Reporter, coordinators and moderators only.** Never published. | Verbatim resident text; may contain names, vehicle registrations, addresses. Every occasion on which it is read is recorded. |
| Incident report — published wording | The AI rewrite, accepted by the reporter | All signed-in residents of the village | The public version. |
| Incident location | Reporter picks a point on a map | All signed-in residents of the village | Shifted by up to 100 metres before storage. The exact point the reporter chose is never stored. |
| Incident landmark text | Reporter | All signed-in residents of the village | e.g. "the lane behind the village hall" |
| Photographs and video | Reporter, optional | All signed-in residents of the village | Faces covered and hidden photo information removed **on the reporter's own device, before the file is uploaded** (§5.3). |
| Account role and verification status | Set by the service, never by the resident's own browser | — | A resident cannot grant themselves coordinator access. |
| Notification preferences | Resident | — | |
| Audit trail | The service | Coordinators, for their own village only | Who did what, and when. Entries can be added but never changed or removed. |
| Anti-abuse counters | The service | Nobody | An internal account reference, the action being counted, and how many times it has happened. |

**Data deliberately not collected:** date of birth (only a confirmation of being
16 or over), phone number, payment details, precise home address coordinates,
any biometric record of a person's face or body.

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
| Give coordinators a queue of reports to review | Prevents unreviewed personal data reaching the village. |
| Detect patterns across reports | Identifies repeat activity earlier than reading reports one by one. |
| Produce summaries for the police and the parish council | The route by which a village's reports become action. |
| Maintain an audit trail | Accountability under Article 5(2), and the control that makes access to original wording safe. |

### 2.6 Disclosure outside the village

There are three routes, all deliberate and all initiated by a person:

1. **A coordinator copies a formatted alert to a WhatsApp Channel.** A channel
   is a public surface. This is switched off by default, is limited to the most
   serious reports unless the village changes that, and nothing in the service
   posts to it automatically — a coordinator copies the text and pastes it in
   themselves.
2. **A coordinator shares a report or a period summary with the police or the
   council.** Published reports only, and the document has no place in it for
   original wording or map coordinates — it is incapable of carrying them
   rather than merely omitting them.
3. **A spreadsheet export for a council meeting.** The anonymised wording only,
   never the original wording, and a record is kept every time an export is
   produced.

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
| Notifications to residents' phones | **6(1)(f)**, with detailed opt-outs, plus the permission the browser itself asks for | The browser's own permission prompt is a separate consent gate the service cannot bypass. |
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
and Facebook pages, unmoderated, with names left in, with photographs unedited
and no limit at all on how long any of it is kept. The processing here is
necessary to achieve the same purpose *with* those controls. It is not necessary
to publish original wording, exact coordinates or unedited photographs — and
none of those is published.

**Balancing test.**

| Factor | Assessment |
|---|---|
| Reasonable expectations of reporters | High. They wrote the report and reviewed the rewrite before it was saved. |
| Reasonable expectations of people described | **Low.** They do not know a report exists. This is the principal intrusion. |
| Severity of possible harm | Significant: misidentification, reputational damage, or a neighbour dispute escalating. In a village of a few hundred, "a white van by the Green on Tuesday" can identify one household. |
| Likelihood of harm | Reduced but not eliminated by the mitigations at §8. |
| Children | The service is 16+; reports may still describe children. Coordinator review is the control. |
| Balance | **Processing may proceed** on the strength of the mitigations: the original wording is never published, map positions are shifted, faces are covered before a photograph leaves the reporter's device, and a coordinator reviews every report before publication unless the village has deliberately switched that off. |

**Residual concern to be managed operationally, not technically:** a report that
is accurate but hostile — naming no one, yet obviously about one household. No
software control reaches that; the coordinator's review is the only control,
which makes coordinator training a real requirement rather than a formality.
See §9, action A4.

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

- Original wording is never published.
- The AI rewrite is instructed to remove identifying detail, and the reporter
  reviews the result before it is saved.
- A coordinator's review is a human check on what reaches the village.

None of these guarantees it. If a report containing special category data is
published, the controller has processed Article 9 data without a condition. The
practical answer is the same as for §4.3: coordinator guidance on what to reject
(§9, action A4), and the ability to erase a published report, which exists.

### 4.5 Data minimisation

| Decision | Effect |
|---|---|
| Map positions are shifted as they arrive, not hidden as they are displayed | The exact point is never in the database, so it cannot leak from it later. |
| Original wording is held apart from everything else, and the service's ordinary way of reading a report does not include it | A page cannot display it by accident. Reaching it takes a separate, deliberate and recorded action. |
| Photographs are edited on the reporter's own device, and the service has **no way of accepting an unedited original** | A photograph with an uncovered face in it cannot be uploaded at all. |
| The police and council documents have no place in them for original wording or coordinates | They are incapable of carrying those details, rather than relying on whoever produces them to leave them out. |
| Home location optional | A resident who skips it is included in village-wide alerts rather than excluded. |
| No date of birth | Only a confirmation of being 16 or over. |

---

## Step 5 — Data flows, processors and international transfers

### 5.1 The AI rewrite — disclosure to Anthropic

**This is the disclosure requiring the clearest explanation to residents, and it
is in the privacy notice.**

- **What is sent:** the reporter's own wording, the incident type, the landmark
  text and the time. It is sent to Anthropic's Claude service.
- **Why:** to produce the anonymised rewrite. The purpose of the disclosure is
  to *remove* personal data from what gets published.
- **When:** before the report is saved. Nothing is stored at this stage.
- **Where:** Anthropic processes in the **United States**. This is a restricted
  transfer.
- **Transfer mechanism:** the UK International Data Transfer Addendum to the EU
  Standard Contractual Clauses, under Anthropic's commercial terms. *[Controller
  to verify the current terms and record the date checked.]*
- **Training:** Anthropic's commercial terms state that customer inputs and
  outputs are not used to train its models. *[Controller to verify.]*
- **Retention at Anthropic:** governed by Anthropic's own policy, not by ours.
  *[Controller to record the current figure.]*
- **What happens if it fails:** if Anthropic cannot be reached, or declines the
  request, or takes too long, the reporter's own wording is used instead and the
  screen says so. **Being unable to reach Anthropic never blocks a report** —
  but it does mean the published text has not been anonymised, which the service
  warns about in red before the reporter continues.

### 5.2 Automated decision-making (Article 22)

**Article 22 does not apply.** The AI rewrite is not a decision producing legal
or similarly significant effects, and in any case it is not solely automated:
the reporter is shown the rewrite and must accept it before anything is saved,
and can edit it or discard it.

That statement holds in both village configurations. Where a village leaves
coordinator review switched on, a second person sees the report before
publication. Where a village has switched **auto-approve** on, the reporter's
review is the only human check — which is why the human named in the privacy
notice is the reporter, not the coordinator. The notice and the terms of use
both say so.

### 5.3 Face detection

- **Face detection runs entirely on the resident's own device**, inside their
  web browser. No photograph, and no measurement taken from a face, is ever
  sent anywhere for detection.
- **No biometric data is created or stored.** The detection produces only a
  rectangle marking where in the picture a face appears. That rectangle is used
  immediately to draw over the image and is then discarded. Nothing capable of
  identifying a person by their face is kept, so **this is not special category
  biometric data under Article 9(1)**, which applies to processing carried out
  *for the purpose of uniquely identifying* a person. Identification is
  precisely what is not done.
- **Two ways of covering a face.** The default is a **solid black rectangle**:
  the original pixels are not used at all, so there is nothing left underneath
  to recover. The alternative reduces the face to a handful of large blocks and
  then blurs them heavily. The black rectangle is the default on purpose —
  blurring and pixelation have a long history of being reversed.
- **Hidden information inside the photograph file is destroyed**, including any
  GPS position recorded by the camera. This happens because the file that is
  uploaded is a newly created copy of the edited picture, never the original
  file from the camera.
- **There is no fallback.** A device that cannot run the face detection cannot
  upload a photograph. A fallback would mean accepting an original with an
  uncovered face in it.

### 5.4 Sub-processors

| Sub-processor | Purpose | Location | Restricted transfer | DPA in place |
|---|---|---|---|---|
| **Supabase** | Database, sign-in, file storage | London, United Kingdom | No | Yes — Supabase DPA *[verify]* |
| **Vercel** | Running the website | London, United Kingdom | Support and network access may be from outside the UK | Yes — Vercel DPA *[verify]* |
| **Anthropic** | The AI rewrite (§5.1) | United States | **Yes** | Yes — commercial terms incl. UK IDTA *[verify]* |
| **OneSignal** | Delivering notifications to phones | United States | **Yes** | *[Verify — DPA required before launch]* |
| **Slack (Salesforce)** | Internal staff notifications | United States | **Yes** | **No separate agreement beyond Slack's standard terms — see below** |
| **Yakasista Ltd** | Development, operation and support (processor to the council) | United Kingdom | No | **Drafted, not yet signed — see §9, action A2** |

**Slack, and why it is listed differently.** A private staff channel is told when
somebody registers, when a report is published, when a coordinator applies and
when an application is decided. The messages carry an anonymised incident
summary, or the fact of a registration or application together with the
resident's name — and their email address on registration, because identifying
the person is the point of that alert. **Never the original wording of a report,
and never map coordinates.** There is no separate data processing agreement with
Salesforce beyond Slack's standard terms, and the privacy notice says so rather
than claiming otherwise. This is a proportionate position for an administrative
disclosure with no resident-facing dependency on it, at the scale of one parish.
It is not a position that survives growth: see §9, action A3.

**OneSignal** receives an internal account reference — not a name, not an email
address — and the text of the alert. Alert text carries only published,
anonymised content: a lock screen is the least private surface there is, and the
message is written accordingly.

### 5.5 What is not sent anywhere

- Original report wording never leaves the database except to Anthropic for the
  rewrite (which is what produces the anonymised version) and to a coordinator's
  screen, where every occasion is recorded.
- Map coordinates are never sent to Slack, never included in a police or council
  document, never in a notification, and never in the spreadsheet export.
- Photographs are never sent to any third party for processing.

---

## Step 6 — Data subject rights

| Right | How it is met | Status |
|---|---|---|
| **Be informed** (13–14) | The privacy notice on the service's website, linked from the registration form and from the foot of every page. | Live. Controller details are placeholders — §9, action A5. |
| **Access** (15) | A coordinator can produce a resident's data from the dashboard; a formal subject access request goes to the council. | **No self-service export for a resident.** Manual process. |
| **Rectification** (16) | Reporters can edit their own reports while they are still awaiting review; profile details can be changed at any time in the resident's own settings. | Live. |
| **Erasure** (17) | A resident can delete any report they filed and can close their account. Deletion empties the report: every personal field, including the original wording, is cleared, the link between the report and the person who filed it is broken, and the photographs and video are deleted from storage. | Live. **Never yet carried out against real data — see §9, action A6.** |
| **Restrict processing** (18) | Manual, via the coordinator. | Manual process. |
| **Portability** (20) | A spreadsheet export exists for coordinators, not for individual residents. | **Gap.** Article 20 applies to 6(1)(a) and 6(1)(b) processing; the account data it covers is small, and a manual export meets it. |
| **Object** (21) | A resident can close their account. A person described in a report can ask the council to remove it; a coordinator can erase it. | Manual process — and it depends on the person knowing the report exists. |
| **Rights re automated decisions** (22) | Not engaged — §5.2. | — |

**Note on erasure and the audit trail.** Entries can be added to the audit trail
but never changed or removed, which is what makes it an accountability record.
Erasing a report therefore leaves an entry recording that a report was deleted,
but the report itself holds nothing personal afterwards. Closing an account
breaks the link between the trail and the person, while keeping a record of the
email address and role that acted, so the trail still makes sense. This is a
deliberate Article 17(3)(b)/(e) retention for compliance and legal purposes, and
the controller should be comfortable with it. The sign-in record held by the
authentication provider for a closed account is currently **not** deleted — see
§9, action A7.

---

## Step 7 — Retention

| Data | Policy | Enforcement |
|---|---|---|
| Published incident reports | Archived after **12 months** — off the map, off the list | **Automatic**, by an overnight housekeeping process, measured from the date the report was filed |
| Photographs and video | Deleted from storage after **6 months** | **Automatic**, same process; the file is deleted before the record that points to it |
| Audit trail | **24 months** stated in the privacy notice | **Not enforced.** The trail is protected at the database level against deletion by anyone, including the developer, which is what makes it trustworthy. Removing old entries is therefore a deliberate, documented administrative act. **In practice the trail is currently kept indefinitely.** See §9, action A8. |
| Dormant accounts | Closed and anonymised after **24 months** without sign-in | **Not enforced.** Nothing does this yet. See §9, action A8. |
| Anti-abuse counters | 7 days | Automatic, same overnight process |
| Account data | Life of the account, then erased on closure | At the resident's request |

**The controller must know that two of the four figures its privacy notice
states are not currently enforced by the software.** Both are the two that can
only be exceeded in the resident's favour — nothing is published for longer than
it should be — but a privacy notice stating a period the service does not keep
to is a compliance gap in its own right. Either enforce them before launch or
amend the notice to describe what actually happens.

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
| **Mitigations** | Original wording is never published, and the service's ordinary way of reading a report does not include it; the AI rewrite is instructed to strip names, vehicle registrations and addresses; the reporter reviews the rewrite before saving; a coordinator reviews it as a second human check; published reports are visible only to signed-in residents of that village. |
| **Residual** | Likelihood 2, Severity 3 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

The residual is not lower because a report can be accurate, carefully worded and
still obviously about one household. No software control reaches that;
coordinator judgement does. **Action A4.**

### R2 — Original wording is disclosed to someone not entitled to it

| | |
|---|---|
| **Inherent** | Likelihood 2, Severity 3 — **High** |
| **Mitigations** | There is exactly one route by which original wording can be read, and it records who read it *before* the text appears on their screen; every other way of reading a report leaves the original wording out entirely; the database itself refuses to hand that information to anything other than the service; and the spreadsheet export, the police documents, the WhatsApp alert and the emails the service sends each have no place in them capable of carrying it. |
| **Residual** | Likelihood 1, Severity 3 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

### R3 — A photograph identifies someone, or reveals a location

| | |
|---|---|
| **Inherent** | Likelihood 3, Severity 3 — **High** — the GPS position saved inside a photograph file has re-identified people before |
| **Mitigations** | Faces are detected and covered on the reporter's own device before the file is uploaded; only a newly created copy of the edited picture is transmitted, which destroys the hidden information inside the original file including its GPS position; the default is an opaque black rectangle rather than a blur; and **the service has no way of accepting an unedited original**, so one cannot be uploaded at all. |
| **Residual** | Likelihood 2, Severity 2 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

Residual, not low: face *detection* can miss a face — someone side-on, someone
at the edge of the picture, poor light. A missed face is not covered. The
reporter sees the edited image before it is attached and can remove it, which is
the only check on this.

### R4 — A resident's home is located from a pin on the map

| | |
|---|---|
| **Inherent** | Likelihood 2, Severity 3 — **High** |
| **Mitigations** | Every incident position is shifted by a random distance of up to 100 metres, in a random direction, before it is stored; the exact point the reporter chose is never recorded, so it cannot leak later; positions never appear in an export, a police document, a phone notification or a staff message; home locations are shifted by up to 75 metres and are never displayed anywhere at all. |
| **Residual** | Likelihood 1, Severity 2 — **Low** |
| **Accepted?** | *[Controller to confirm]* |

### R5 — Unauthorised access to another village's data

| | |
|---|---|
| **Inherent** | Likelihood 2, Severity 3 — **High** |
| **Mitigations** | Every request for reports is limited to a single village, taken from the signed-in session and never from anything the browser sends; a resident's role and village are set by the service and the database refuses any attempt by a resident to change their own role, village or verification status; the database enforces these boundaries itself, independently of the website; and the real check on who is signed in happens on the server every time, not merely as a redirect in the browser. |
| **Residual** | Likelihood 1, Severity 3 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

These controls have been tested directly against a live database, using two
separate villages and an untrusted access key, across 43 checks covering
attempts to read another village's reports, attempts to reach original wording,
attempts to change one's own privileges, the window in which a reporter may edit
their own report, and attempts to alter the audit trail. Two weaknesses were
found and closed in the process. The processor re-applies and re-verifies these
database rules after any change to the structure of the database.

### R6 — Data sent to the AI model is retained or misused

| | |
|---|---|
| **Inherent** | Likelihood 2, Severity 2 — **Medium** |
| **Mitigations** | Disclosed by name in the privacy notice; processor terms including a UK transfer mechanism; commercial terms exclude training on customer inputs; nothing is stored at that stage, so asking for a second rewrite creates no new record; and the purpose of the disclosure is to *remove* personal data. |
| **Residual** | Likelihood 1, Severity 2 — **Low** |
| **Accepted?** | *[Controller to confirm]* — subject to verification, action A9 |

### R7 — A report reaches the open internet through a WhatsApp Channel

| | |
|---|---|
| **Inherent** | Likelihood 2, Severity 3 — **High** |
| **Mitigations** | Switched off by default; limited to the most serious reports unless the village changes that; nothing posts automatically — a coordinator copies the text and pastes it; the alert has no place in it capable of carrying original wording or map coordinates; switching the feature on is recorded in the audit trail; and where a report was not anonymised, the screen says so in red before the coordinator copies anything. |
| **Residual** | Likelihood 2, Severity 2 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

A village running **auto-approve and channel posting together** has put
unreviewed reports one paste away from a public feed. Both are off by default,
both are recorded when switched on, and the dashboard shows them together. It is
a legitimate coordinator decision and it should be an informed one.

### R8 — A coordinator misuses their access

| | |
|---|---|
| **Inherent** | Likelihood 2, Severity 3 — **High** |
| **Mitigations** | Every reading of original wording is recorded before the text is shown; every export, review decision, settings change and report produced for the police is recorded; entries can be added to the trail but never changed or removed, by the coordinator, the council or the developer; coordinators are appointed through a recorded approval by a platform administrator rather than appointing themselves; and the trail is visible to the village's coordinators. |
| **Residual** | Likelihood 2, Severity 2 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

Detection, not prevention. **Action A4** — coordinators need written terms.

### R9 — False, malicious or vexatious reports

| | |
|---|---|
| **Inherent** | Likelihood 2, Severity 3 — **High** |
| **Mitigations** | Coordinator review before publication (unless the village has switched it off); a limit of 10 reports a day per account; every report is traceable to a registered account; a published report can be erased; and community guidelines in the terms of use. |
| **Residual** | Likelihood 2, Severity 2 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

A village that switches auto-approve on removes the pre-publication control here
and should understand that this is what it is removing.

### R10 — Data breach at the processor or a sub-processor

| | |
|---|---|
| **Inherent** | Likelihood 1, Severity 3 — **Medium** |
| **Mitigations** | Database and file storage are in the United Kingdom; photographs and video are held privately and are reached only through links that expire after a short time; the credentials that can reach that storage are held on the server only and are never published with the software; the database enforces its own access rules, which limits what a stolen key could reach; passwords are handled by the sign-in provider and are never held by this service; and standard web security protections are applied. |
| **Residual** | Likelihood 1, Severity 2 — **Low** |
| **Accepted?** | *[Controller to confirm]* |

**A breach notification procedure is required** — who tells the ICO within 72
hours, and who tells residents. **Action A10.**

### R11 — Children's data

| | |
|---|---|
| **Inherent** | Likelihood 2, Severity 3 — **High** |
| **Mitigations** | Minimum age 16 to hold an account; coordinator review; original wording never published. |
| **Residual** | Likelihood 2, Severity 2 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

Reports can describe children — antisocial behaviour reports often do. This is
the case for coordinator guidance most clearly. **Action A4.**

### R12 — Processing outstrips the documented legal position

| | |
|---|---|
| **Inherent** | Likelihood 3, Severity 2 — **Medium** |
| **Mitigations** | The privacy notice makes five specific claims about how the service behaves, and the processor works to a standing rule that any change to that behaviour is made together with the correction to the notice. |
| **Residual** | Likelihood 2, Severity 2 — **Medium** |
| **Accepted?** | *[Controller to confirm]* |

The practice is real but it is a working practice rather than a guarantee.
**Action A11** — the six-month review is what tests it.

---

## Step 9 — Measures to reduce risk

**The mitigations described at §8 are built into the service and are in place
now.** Covering faces before a photograph is uploaded, shifting map positions
before they are stored, the AI rewrite, keeping the original wording apart from
everything else, the village boundary enforced by the database, the recording of
every sensitive action, and the overnight archiving of old reports all operate
by default. They require no decision, no configuration and no action from the
council or its coordinators, and nothing in this section asks for any of them to
be built.

**The actions below are the things software cannot do.** They are documents,
contracts, registrations and human judgement, and they are listed here because a
DPIA that recorded only what the software handles would be an assessment of the
easy half.

**What "blocker" means.** A blocker must be complete before the service
processes real resident data. It is *not* a precondition of accepting this
document on the compliance page: accepting the three documents is what allows a
village to begin, and completing the blockers is what makes beginning lawful.
The council should treat them as two halves of one decision rather than as two
separate occasions.

Action A2 now sits across that line. The processing agreement is one of the
three documents on the compliance page, so a coordinator accepting the council's
side of it is part of what opens the village — but the agreement is a contract,
and a contract with one signature on it is not an agreement. A2 stays a blocker
until both parties have signed.

### 9.1 Actions for the council, as data controller

Four of the five blockers are here, and four of those five are documents the
council writes. Nothing in the software can produce them, and none of them is
waiting on the developer.

| # | Action | Addresses | Priority | Due | Status |
|---|---|---|---|---|---|
| **A1** | Adopt an **Appropriate Policy Document** under Schedule 1 Part 4 DPA 2018 for criminal offence data, and identify the Schedule 1 condition relied on. The accompanying template is drafted and ready for the council to review and sign; adopting it is the council's act, and until it is signed the template is a draft | §4.3 | **Blocker** | Before launch | Template drafted, not yet adopted |
| **A2** | Execute a **written data processing agreement** with Yakasista Ltd (processor), meeting Article 28(3). Jointly with the processor. The agreement is drafted and is the third document on the compliance page, so the council's acceptance is recorded there alongside this assessment and the Appropriate Policy Document. It is a contract rather than a policy, so it is **not in force until both parties have signed the paper copy** — accepting it on screen is the council's half | §5.4 | **Blocker** | Before launch | Template drafted, included in compliance flow |
| **A4** | Write **coordinator terms and review guidance** — what to reject, how to handle a report about a child, what "obviously about one household" looks like, and the consequences of misusing access | R1, R8, R9, R11 | **Blocker** | Before launch | Not started |
| **A5** | Replace the placeholder controller details in the privacy notice with the council's real name, address, contact and **ICO registration number**; register with the ICO if not already registered | §6 | **Blocker** | Before launch | Placeholders in place |
| **A10** | Write a **personal data breach procedure** — detection, the 72-hour ICO notification, resident notification, and who decides | R10 | **Blocker** | Before launch | Not started |
| **A9** | Verify Anthropic's current terms — transfer mechanism, training exclusion, retention period — and record the date checked | R6, §5.1 | High | Before launch | Not verified |
| **A11** | Verify the OneSignal data processing agreement and its transfer mechanism | §5.4 | High | Before launch | Not verified |
| **A12** | Consult residents through the parish newsletter or a public meeting and record the outcome at §3 | §3 | High | Before launch | Not started |
| **A13** | Maintain a **record of processing activities** under Article 30 | Accountability | Medium | Before launch | Not started |
| **A16** | Review this DPIA at six months, or sooner on any change to the AI provider, the sub-processor list, retention, or the disclosure routes | R12 | Medium | Six months after launch | Scheduled |

### 9.2 Actions for Yakasista Ltd, as processor

Listed for completeness and for the council's oversight. **No action is required
from the council or its coordinators on any of these**, beyond being told when
they are done.

| # | Action | Addresses | Priority | Due | Status |
|---|---|---|---|---|---|
| **A3** | Verify or replace the Slack disclosure — either a signed agreement, or move the staff channel to a service already covered | R6, §5.4 | Medium | Before a second parish | Disclosed in the notice |
| **A6** | Carry out a deletion and an overnight housekeeping run against real data once, and confirm the stored photographs are genuinely gone | §6, §7 | High | Before launch | Never run |
| **A7** | Decide and document what happens to the sign-in record held by the authentication provider when an account is closed; either delete it or state the retention in the notice | §6 | High | Before launch | Open |
| **A8** | Either enforce the audit trail and dormant account retention periods, or amend the privacy notice to state what actually happens | §7 | High | Before launch | Open |
| **A14** | Remove the sample demonstration data from any database a resident will use, and issue a fresh village join code | Data quality | High | Before launch | Open |
| **A15** | Give residents a self-service copy of their own data | §6, Article 20 | Low | Post-launch | Open |

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
| R6 — AI provider | Low | *[ ]* |
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
wording of a report cannot be reached at all by the parts of the service that
publish, export or share reports; map positions are destroyed at the point of
collection rather than merely hidden at the point of display; and photographs
cannot be uploaded with faces uncovered, because the service has no means of
accepting one. The residual risks are concentrated where they cannot be
engineered away — in the judgement of the people reviewing reports, and in the
position of people described in reports who do not know that they are.

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
| Confirms | The description of the processing at §2 and §5 is an accurate account of the service as at the version below, and the processor will notify the controller before any change to the AI provider, the sub-processor list, the retention schedule or the disclosure routes. |
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
| Review triggered early by | A change to the AI provider; a new or removed sub-processor; a change to the retention schedule; a new disclosure route; a personal data breach; a substantial change in the number of villages served |
| Reviewed on | ................................................................ |
| Outcome | ................................................................ |

---

*Prepared by Yakasista Ltd. This document must be reviewed and signed by the
parish council as data controller before it has any effect.*
