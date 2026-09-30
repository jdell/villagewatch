# Community feedback and product ideas

**Date:** 30 September 2026
**Source:** Meeting with a local community group organiser who has offered to collaborate – shared GitHub access, a kanban board for ideas and ongoing discussion.

> This document records five ideas from the meeting, analyses each against the current architecture and privacy model, and proposes additional ideas in the same direction. It is written for Joel to evaluate, not as a commitment to build any of them.

---

## Ideas from the meeting

### 1. Simplify the report wizard

**What was said:** The five-step wizard has fields that could be filled automatically. The incident category (vandalism, theft, antisocial behaviour) could be inferred by the AI pass. The consent checkbox could be accepted once at sign-up rather than on every report.

**Analysis:**

The AI pass already proposes a category, a severity and a title – but it runs *after* the reporter has filled in the form, on the preview step. The suggestion is to move the AI earlier: let the reporter describe what happened, run the pass immediately, and pre-fill the category and severity from the result. The reporter would then confirm or override rather than choosing blind.

This is a good idea with one constraint. The AI pass is rate-limited at 30 per hour and costs an Anthropic call. Today it fires once, on the transition to the preview step. If it fired on every keystroke pause or on leaving the description field, the cost and the rate-limit spend would rise. The right shape is probably: fire the pass when the reporter finishes the description (on blur or on pressing Continue from step 1), pre-fill steps 2–3 from the result, and let the reporter skip straight to the preview if they accept the defaults.

The consent checkbox is a simpler change. The terms are accepted at registration; re-confirming on every report adds friction without adding legal cover, since the terms already grant the right to process what is filed. It could be removed from the wizard and replaced with a sentence: 'By publishing, you confirm this report is accurate to the best of your knowledge'. This is worth doing independently of the AI changes.

**Effort:** Medium (AI reordering), Small (consent simplification)
**Privacy impact:** None – the same data reaches the same places.
**Recommendation:** Do the consent simplification now. Prototype the AI pre-fill as a separate piece – it changes the wizard's step flow and the rate-limit arithmetic.

---

### 2. Voice input for reporting

**What was said:** Older residents would struggle with a text form. A voice option – press a button, describe what happened, and have the app transcribe and structure it – would make reporting accessible to residents who are less comfortable typing on a phone.

**Analysis:**

This aligns with a planned feature. The stack already includes `@anthropic-ai/sdk`, and Claude handles audio natively via the Messages API. The flow would be: the reporter presses a microphone button on step 1, speaks for up to 60 seconds, the audio is sent to Claude (which transcribes, anonymises and structures in one pass), and the result pre-fills the wizard – description, category, severity, title and location if mentioned.

Two things matter for the privacy model:

- **Audio must never be stored.** `/privacy` and the DPIA both promise that the original is discarded after processing. The implementation must stream to Claude and discard the buffer – the same 'no server-side fallback' principle that governs face blurring. Domain rule 3 applies by analogy.
- **Anthropic is already a listed processor.** No new `/privacy` §6 entry is needed, but the paragraph describing what goes to Anthropic would need updating to include audio.

The browser API is `MediaRecorder` + `getUserMedia`. Safari on iOS supports both since iOS 14.5. The main UX risk is background noise outdoors – a resident reporting a break-in from their garden with a lawnmower running. A 'review before submitting' step (which the wizard already has) mitigates this.

**Effort:** Medium-Large
**Privacy impact:** Low – same processor, same anonymisation, audio never stored.
**Recommendation:** High priority. This removes the single biggest barrier for non-technical residents and is a strong differentiator. Build it as an alternative input on step 1, not a replacement for text.

---

### 3. Reputation and trust circles

**What was said:** A system where residents build reputation – 'I know this person', verified reports, a count of contributions. Something like trust circles where connections vouch for each other.

**Analysis:**

This is the most complex idea and the one that needs the most careful handling. The current model is deliberately flat: every resident's report goes through the same AI pass and the same moderation queue (or auto-approve). There is no weighting by who filed it.

A reputation system introduces several risks:

- **It conflicts with anonymous reporting.** The whole point of `isAnonymous` is that a report stands on its own without identifying the reporter. A reputation score beside a report undoes that – even without a name, 'filed by a Gold contributor' narrows the field in a village of 40.
- **It creates a chilling effect.** A resident whose first report is treated with less weight than a veteran's may not file a second one. In a neighbourhood watch context, the person filing their first report is often the one who saw something nobody else did.
- **'I know this person' leaks the social graph.** A village's who-knows-whom is itself sensitive data, and storing it makes VillageWatch a social network rather than a reporting tool.
- **Verification is already handled.** Coordinators can mark residents as `VERIFIED_RESIDENT`, which is the closest the model comes to trust – and it is a coordinator's decision, not a crowd-sourced one.

What *would* work, without these risks, is a simpler contribution indicator visible only to the coordinator on the moderation queue: 'This resident has filed N reports, M of which were published'. That helps a coordinator weigh a borderline report without exposing anything to other residents.

**Effort:** Small (coordinator-only indicator), Large (full reputation system)
**Privacy impact:** High for trust circles, Low for the coordinator indicator.
**Recommendation:** Build the coordinator-only indicator. Do not build trust circles or public reputation scores – they conflict with the privacy model that makes the product credible.

---

### 4. Timeline slider on the map

**What was said:** A slider on the map that lets you scrub through time and watch incidents appear. See patterns emerge visually – a cluster forming over three weeks, or a problem that moved from one street to another.

**Analysis:**

This is a strong idea and technically straightforward. The map already holds every pin it draws (up to `MAX_MAP_INCIDENTS`), each with an `occurredAt` timestamp. A range slider at the bottom of the map – or an animated play button – could filter the visible pins by date, showing the village's safety picture evolving over time.

Two approaches:

- **Filter slider:** A two-handled range slider that narrows the visible set. This is the simpler version and works well for 'show me just September' or 'show me the last week'. The existing period control already does this with presets; a slider would make it continuous and visual.
- **Animation:** A play button that advances through time, showing pins appearing on the map. More compelling for presentations (parish council meetings, police briefings) but needs careful pacing – a village with two reports in a month would have 28 seconds of nothing.

The heatmap layer would also animate well – watching a hotspot build and fade is exactly the pattern detection the tool promises.

**Effort:** Medium
**Privacy impact:** None – the same published data, same fuzzed coordinates.
**Recommendation:** Build the filter slider first (it is useful daily). Add animation as a 'presentation mode' later – it is most valuable when sharing the screen at a meeting.

---

### 5. Police live view

**What was said:** A dedicated view for police officers – a tablet in the car showing incidents in real time, with exact locations and unblurred photos. Notifications as reports come in. A tool the police can act on immediately.

**Analysis:**

This is the most ambitious idea and the one with the most significant implications. It would be transformative if delivered, but it requires a fundamentally different access model from what VillageWatch currently provides.

**What it would need:**

- **A new role: `POLICE_OFFICER`.** Not a coordinator and not a resident. Police officers would see exact coordinates (not fuzzed), original photos (not blurred), `rawDescription` (not anonymised) and real-time alerts. This is a privileged view that goes beyond what even coordinators see today.
- **Authentication via a police identity.** Officers cannot use a village join code. They would need to be provisioned by an administrator, scoped to a force area (not a single village), and authenticated through a mechanism the force's IT can manage.
- **Real-time push.** The current push goes through OneSignal to residents' phones. A police tablet would need a more reliable channel – possibly a WebSocket connection or a dedicated push integration.
- **Exact coordinates and unblurred media.** This reverses domain rules 2 and 3 for this audience. The privacy model currently guarantees that fuzzed coordinates and blurred photos are all that exist on the server. To show exact locations and original photos to police, those would need to be stored – which changes the promise `/privacy` makes to every resident.

**The privacy problem is the blocker.** Today, the system can truthfully say 'your exact location is never stored' and 'the original photo never leaves your device'. A police view that shows exact locations and unblurred photos would require storing both, which means every resident's data is held at a higher fidelity than they were told. This is not unsolvable – the consent flow could be updated, and police access could be covered under a legitimate interest or law enforcement basis – but it is a significant change to the privacy architecture.

**A middle ground that works today:**

Rather than building a police-specific view, the existing report-sharing tools can serve the same need with less risk:

- The coordinator already generates PDF reports and shares individual incident summaries with police.
- The 'Write to your MP' letter feature (just built) generates strategic summaries.
- The police report narrative now includes specific locations, times and patterns per the feedback from Coffee with a Cop.
- A coordinator could share `rawDescription` verbally or via a secure channel for specific incidents the police ask about.

What is missing is *speed*. The coordinator is the bottleneck: the police see what a coordinator shares, when the coordinator shares it. A notification to the coordinator that says 'the police are asking about this report' – or a mechanism for the police to request the unredacted version of a specific report – would close the gap without changing the storage model.

**Effort:** Very Large (full police view), Medium (request-unredacted mechanism)
**Privacy impact:** Very High (full police view), Low (request mechanism through coordinator)
**Recommendation:** Do not build a full police view now. Instead, build a 'police request' flow: an officer (authenticated, force-scoped) can request the unredacted details of a specific published report, the coordinator is notified and approves or declines, and the unredacted view is shown for that session only. This keeps the coordinator in the loop and the storage model unchanged.

---

## Additional ideas

Building on the same themes – accessibility, community trust, police collaboration and visual storytelling:

### 6. Neighbourhood alert integration

When the police publish a bulletin through Neighbourhood Alert (eCops), show it on the VillageWatch map alongside residents' own reports. The infrastructure for this already exists (`src/lib/ecops/`), but the alerts currently appear only on the coordinator's dashboard. Surfacing them to residents would show the police's own picture beside the village's – answering the question 'are the police aware of this?' without the coordinator having to relay it.

**Effort:** Small (the data is already fetched and stored)
**Privacy impact:** None – these are public police bulletins.

### 7. Scheduled reports to police

Automate the report-sharing workflow. A coordinator sets a schedule (weekly, fortnightly) and VillageWatch automatically generates and emails the community safety report to the PCSO's address. The email templates and the report PDF already exist; what is missing is the scheduling and the PCSO's email as a village setting.

**Effort:** Small-Medium (scheduling infrastructure exists via Vercel crons)
**Privacy impact:** Low – the report contains only published, anonymised data.

### 8. Multi-village coordinator view

A coordinator who runs two neighbouring parishes (common in rural Cambridgeshire) currently has to sign out and sign in to switch villages. A village switcher in the shell – or a combined dashboard showing both villages' figures side by side – would remove that friction.

**Effort:** Medium (the tenant boundary is deeply embedded)
**Privacy impact:** Medium – needs careful scoping so a coordinator of village A cannot see village B's raw reports unless they coordinate both.

### 9. Incident follow-up and resolution

Residents currently file a report and never hear what happened. A 'resolved' status with a short note from the coordinator ('police attended', 'fallen tree cleared by highways') would close the loop and encourage future reporting. The `RESOLVED` status already exists in the schema; what is missing is a UI for the coordinator to add a resolution note and a notification to the reporter.

**Effort:** Small-Medium
**Privacy impact:** None – the resolution note is written by the coordinator about the outcome, not about the reporter.

### 10. Community events and positive reporting

The map currently shows only problems. A 'community event' pin type – a litter pick, a street party, a neighbourhood watch meeting – would balance the picture and make the app feel less like a crime log. This was mentioned in the Northstowe Town Council warden discussion as something wardens coordinate.

**Effort:** Small (new incident type, same wizard flow)
**Privacy impact:** None.

### 11. Accessibility audit

Before growing the user base, commission an accessibility review of the report wizard and the map. The voice input idea (point 2) addresses one dimension, but screen reader support, keyboard navigation and colour contrast on the severity badges all need checking. The map is the hardest surface – Leaflet is not natively accessible.

**Effort:** Medium (audit) + variable (fixes)
**Privacy impact:** None.

---

## Summary table

| # | Idea | Source | Effort | Privacy risk | Recommendation |
|---|---|---|---|---|---|
| 1 | Simplify wizard (AI pre-fill) | Meeting | Medium | None | Prototype after consent fix |
| 1b | Remove per-report consent | Meeting | Small | None | **Do now** |
| 2 | Voice input | Meeting | Medium-Large | Low | **High priority** |
| 3 | Reputation / trust circles | Meeting | Large | High | Do not build; build coordinator indicator instead |
| 4 | Timeline slider | Meeting | Medium | None | **Build filter slider** |
| 5 | Police live view | Meeting | Very Large | Very High | Build request-unredacted flow instead |
| 6 | eCops alerts for residents | Additional | Small | None | Quick win |
| 7 | Scheduled police reports | Additional | Small-Medium | Low | Good fit after MP letter |
| 8 | Multi-village coordinator | Additional | Medium | Medium | Defer until second village |
| 9 | Incident follow-up | Additional | Small-Medium | None | Residents want this |
| 10 | Community events | Additional | Small | None | Balances the map |
| 11 | Accessibility audit | Additional | Medium | None | Do before scaling |

---

## Collaboration setup

The contributor has offered to collaborate via GitHub. Suggested next steps:

- Add him as a collaborator on the `jdell/villagewatch` repository (read access initially, write after the first PR).
- Create a GitHub Project board (kanban) linked to the repo for tracking ideas and tasks.
- Move actionable items from this document into the board as issues.
- Set up a fortnightly sync to review progress and new ideas.

---

*This document is read by a person out of the repository. It is not rendered by the app and needs no `outputFileTracingIncludes` entry.*
