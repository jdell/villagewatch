import type { Metadata } from "next";
import Link from "next/link";
import {
  Callout,
  Definition,
  DefinitionList,
  H3,
  LI,
  LegalPage,
  LegalSection,
  P,
  UL,
  type LegalSectionRef,
} from "@/components/legal-page";
import {
  APP_HOST,
  APP_NAME,
  DATA_CONTROLLER,
  FALLBACK_CONTROLLER_IS_OPERATOR,
  HAS_FALLBACK_CONTROLLER_DETAILS,
  LOCATION_FUZZ_METERS,
  MINIMUM_AGE,
  OPERATOR,
  RETENTION,
} from "@/lib/constants";

/**
 * Rendered per request, so the Content-Security-Policy nonce reaches this
 * page's scripts.
 *
 * `src/proxy.ts` mints a fresh nonce for every request and Next stamps it onto
 * the script tags it renders — but only while it is rendering. Prerendered at
 * build time there is no request to take one from, the scripts go out bare, and
 * `'strict-dynamic'` in `src/lib/csp.ts` then blocks every one of them: the
 * server HTML arrives, React never hydrates, and nothing in a server log says
 * so.
 *
 * Measured rather than assumed — without this line the page serves 0 nonced
 * scripts under `npm run start`, with it, all of them. The cost is a render per
 * request instead of a file from the edge, which at a parish's traffic is not a
 * cost; the alternative is a policy covering only the pages behind a login,
 * which are the pages least in need of one.
 *
 * `export const dynamic` rather than `await connection()`, which Next's CSP
 * guide reaches for first. Both work. This one leaves the component
 * **synchronous**, and `tests/legal-placeholders.test.tsx` renders two of these
 * pages with `react-dom/server`'s synchronous API — an async Server Component
 * suspends there and the suite fails on a page nobody changed.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How VillageWatch collects, uses and protects the personal data in a community safety report, under UK GDPR.",
  // Per page, never on the root layout — metadata is inherited, so a canonical
  // there would mark this page a duplicate of the home page.
  alternates: { canonical: "/privacy" },
  openGraph: { url: "/privacy", title: "Privacy policy" },
};

/**
 * The privacy notice, written to Articles 13 and 14 of the UK GDPR.
 *
 * **Six** things here are statements about how the code actually behaves, and
 * they have to keep matching it. If any of them changes, this page changes in
 * the same commit. It said three for as long as there were five, which is the
 * kind of drift that ends with a notice nobody re-reads:
 *
 *   - Faces are covered on the device and only the re-encoded canvas output is
 *     uploaded (domain rule 3, `src/lib/media/face-blur.ts`). The claim that an
 *     original with a face in it never leaves the phone is the strongest promise
 *     on this page, and it is true because `POST /api/incidents/media` has no
 *     server-side fallback. Which cover is painted — a black box, or a mosaic
 *     under a Gaussian — is now the village's setting (`Village.privacyLevel`,
 *     `PRIVACY_LEVELS` in `src/lib/constants.ts`), with the reporter able to
 *     redact instead but never to do less. All of them run in the same place,
 *     so the promise holds whichever is chosen, and the notice names the
 *     mechanism rather than one fixed default that a coordinator can now
 *     change.
 *   - Coordinates are jittered by `LOCATION_FUZZ_METERS` before they are stored
 *     (domain rule 2, `src/lib/geo.ts`).
 *   - Report text is sent to Anthropic for anonymisation
 *     (`src/lib/ai/structure-incident.ts`). Residents are told before they file,
 *     not after.
 *   - §6 names what the staff channel is told (`src/lib/slack.ts`). Slack is a
 *     third party outside the UK and a channel is retained indefinitely, so what
 *     a message carries is a disclosure rather than an implementation detail:
 *     never `rawDescription`, never coordinates, and a resident's name and email
 *     on registration because that is what those two alerts are for.
 *   - Whether a human sees a report before it is published, which is
 *     **conditional** and says so. `Village.autoApprove` lets a village publish
 *     on submit, so the human the Article 22 paragraph rests on is the reporter,
 *     who reads the rewrite and accepts it before anything is saved — true in
 *     both configurations. See "Auto-approve" in CLAUDE.md.
 *   - §7's promise that the original wording is deleted when the report is
 *     archived (`/api/cron/retention`, `RETENTION.incidentArchiveMonths`). It is
 *     one `updateMany` with the status change, plus a catch-up for reports a
 *     coordinator archived by hand — see "Deleting the original wording" in
 *     CLAUDE.md. This was the claim that was false for months, which is why it
 *     is on the list rather than left among the schedule figures below.
 *   - §6's paragraph on data.police.uk, which is the one entry here that
 *     describes an outbound request carrying **nothing** about a resident
 *     (`src/lib/police-api.ts`). It is a claim in the same sense as the rest —
 *     it says a village's map centre and a calendar month are all that is sent —
 *     and the day that stops being true it is a false sentence in a privacy
 *     notice rather than a stale one. It is in §6 because a resident reading
 *     "who else sees it" is entitled to know about every request made on their
 *     behalf, including the ones with nothing of theirs in them.
 *   - §6's paragraph on Resend, and it changed on 31 August 2026 because the
 *     code under it did. `src/lib/email/send.ts` is still the one transport,
 *     but the welcome is no longer the one message: an incident alert now goes
 *     to residents who asked for one, and the weekly digest to coordinators.
 *     **The paragraph used to say a report's contents never appear in an
 *     email, and that is exactly what the incident alert carries** — the
 *     anonymised `description`, the same text already on the map. Leaving the
 *     old sentence there would have been the plainest kind of false statement
 *     in a privacy notice. What is still true and still structural is the
 *     boundary: `IncidentEmailInput` has no field that could carry
 *     `rawDescription`, `lat` or `lng` — the same guard `AlertIncident` and
 *     `ExportIncident` use. Change what an email carries and this changes with
 *     it.
 *   - §6's paragraph on **the one image in an email**, added 1 September 2026
 *     when the four templates were brought under one branded shell and the
 *     shell gained the shield in its header (`src/lib/email/layout.ts`). It is
 *     the police-data entry's reasoning applied to an inbound request rather
 *     than an outbound one: a remote image is the shape a tracking pixel takes,
 *     opening the message reveals an address and a time to our own server, and
 *     a resident reading "who else sees it" is entitled to be told so by us
 *     rather than to find it out. What makes the paragraph true is that the
 *     mark is the **only** remote asset, its URL is the same for every
 *     recipient, and nothing reads the access log. Add a second image, a
 *     per-recipient URL or any measurement of opens and this is a false
 *     sentence.
 *   - §6's paragraph on **who** gets one, which is a claim about
 *     `residentsToEmail` in `src/lib/notifications.ts`: `notifyEmail`, the same
 *     severity floor and the same distance test the push uses, and a control on
 *     `/settings` that turns it off. That control arrived in the same commit as
 *     the dispatch, because a preference nothing can change is not a preference.
 *   - §§2, 6 and 7 on votes (`src/lib/votes.ts`, `IncidentVote`). Three claims,
 *     and the second is the one worth guarding: the totals are public within the
 *     village and **no screen anywhere puts a name against a vote**. That is
 *     true because no query in the app selects a voter, which is a property a
 *     single well-meaning "who voted?" panel would end. The third is that a vote
 *     goes with the report and with the account — enforced in
 *     `src/lib/erasure.ts` rather than by the foreign keys, which never fire.
 *
 * ## It is one document for two models, so it names no council as a default
 *
 * `Village.mode` decides who the data controller is, and this page is public and
 * sessionless — it cannot read a village, so it cannot pick. Every sentence that
 * used to assume a parish council now either describes both models (§1, §4) or
 * says "your village's data controller" and points at §1. `community` is the
 * default and most villages have no council at all, so a notice that told every
 * resident to complain to a parish clerk was describing the minority case as the
 * only one.
 *
 * §4 is the sharpest of those. It named **Article 6(1)(e), public task** as the
 * basis for publishing reports, which is a basis a parish council has and a
 * volunteer does not — and it disagreed with `docs/DPIA.md` §4.1, which has said
 * **6(1)(f), legitimate interests** with a documented balancing test since it was
 * written. Legitimate interests is now the stated basis, with the public task
 * described beside it as what a council may rely on instead. Change the basis in
 * one of the two and change it in the other.
 *
 * The retention schedule is the section to watch. `/api/cron/retention` enforces
 * the first two figures nightly; the audit-log expiry and the dormant-account
 * closure are schedule-only, and the notice has to keep saying which is which.
 * **Archiving now deletes the original wording as well as flipping the status**
 * — the sweep clears `rawDescription` in the same statement, which is what §7
 * has always claimed and what nothing did until 20 August 2026. The sentence
 * that had to be added with it is the one about a report the rewrite never ran
 * on: those two columns held the same text, so the reporter's own wording
 * survives in the published description. It was on the map from the day it was
 * filed, so this is a fact about the report rather than a restricted copy being
 * kept — and a resident reading a promise of deletion is entitled to know that
 * before they infer more than it says.
 */

const SECTIONS = [
  { id: "controller", title: "Who is responsible for your data" },
  { id: "collected", title: "What we collect" },
  { id: "not-collected", title: "What we do not collect" },
  { id: "why", title: "Why we use it, and our lawful basis" },
  { id: "ai", title: "Automated processing with AI" },
  { id: "sharing", title: "Who else sees it" },
  { id: "retention", title: "How long we keep it" },
  { id: "rights", title: "Your rights" },
  { id: "children", title: "Children and young people" },
  { id: "security", title: "How we protect it" },
  { id: "cookies", title: "Cookies" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact and complaints" },
] as const satisfies readonly LegalSectionRef[];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={`${APP_NAME} exists to move safety information around a village without moving people's personal details with it. This page explains exactly what we hold, why, who else sees it, and how to get it back or get rid of it.`}
      sections={SECTIONS}
    >
      {!HAS_FALLBACK_CONTROLLER_DETAILS && (
        <Callout tone="warning" title="Before this village goes live">
          No deployment-wide data controller has been named on this
          installation. Whoever is the data controller for your village — your
          coordinator, or a parish or town council that has taken it on — must
          identify themselves to residents, register with the ICO if they have
          not already, and have this notice reviewed alongside their own data
          protection arrangements before any resident signs up. Everything else
          on this page describes the service accurately and applies either way.
        </Callout>
      )}

      <LegalSection id="controller" title="1. Who is responsible for your data">
        <P>
          This notice covers {APP_NAME}, the community safety reporting service
          at <strong>{APP_HOST}</strong>.
        </P>
        <P>
          Every village has a <strong>data controller</strong> — the person or
          body that decides what {APP_NAME} is used for there and answers for it.
          Which one depends on how your village is run.{" "}
          <strong>Where a parish or town council has taken the village on</strong>
          , the council is the controller. <strong>Otherwise</strong> — and this
          is the ordinary case for a neighbourhood group — your village
          coordinator is the controller, and they have signed an agreement
          setting out what that obliges them to do. Either way, {APP_NAME} itself
          provides the software and processes data on the controller&rsquo;s
          instructions.
        </P>
        <P>
          Ask your coordinator which applies to your village if you are not sure;
          they are also who to ask for the contact details of a council that has
          taken it on.
        </P>
        {/*
          One box or two, and the difference is whether the fallback names the
          same body as the operator.

          It does today — see `FALLBACK_CONTROLLER_IS_OPERATOR`. Rendering both
          put Yakasista Ltd on the page twice, presented as the fallback
          controller in the first box and, immediately beneath, declared in bold
          **not** to be the controller in the second. Two adjacent paragraphs
          contradicting each other is worse than a notice that says less, and it
          is only visible on a rendered page rather than in a diff.

          The two-box shape stays for the case the constant was designed for: a
          deployment that names a genuine third-party controller here.
        */}
        {HAS_FALLBACK_CONTROLLER_DETAILS && !FALLBACK_CONTROLLER_IS_OPERATOR ? (
          <>
            <P>
              The details below are the deployment&rsquo;s own and are the
              fallback where no village-specific controller has been named.
            </P>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-base leading-relaxed text-slate-700">
              <p className="font-semibold text-slate-900">
                {DATA_CONTROLLER.name}
              </p>
              {DATA_CONTROLLER.addressLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p className="mt-2">
                Email:{" "}
                <a
                  href={`mailto:${DATA_CONTROLLER.email}`}
                  className="font-medium text-brand-700 underline underline-offset-2"
                >
                  {DATA_CONTROLLER.email}
                </a>
              </p>
              {DATA_CONTROLLER.phone ? (
                <p>Telephone: {DATA_CONTROLLER.phone}</p>
              ) : null}
              <p className="mt-2 text-sm text-slate-500">
                ICO registration: {DATA_CONTROLLER.icoRegistration}
              </p>
            </div>
          </>
        ) : null}

        {!HAS_FALLBACK_CONTROLLER_DETAILS ? (
          <P>
            This installation has not named a fallback controller, so there is no
            single address here to give you — it depends on your village. If you
            cannot reach your coordinator, or you do not know who they are, write
            to the company that operates the software and it will tell you who
            the controller for your village is and pass anything you send on to
            them.
          </P>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-white p-4 text-base leading-relaxed text-slate-700">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Operator (processor)
          </p>
          <p className="mt-1 font-semibold text-slate-900">{OPERATOR.name}</p>
          {/*
            The postal address and the ICO registration number ride in this
            box when the two are the same body, because this is then the only
            box and a resident needs somewhere to write to. `DATA_CONTROLLER` is where both
            live — see the constant for why that object is a contact route rather
            than an answer to who controls a given village.
          */}
          {FALLBACK_CONTROLLER_IS_OPERATOR
            ? DATA_CONTROLLER.addressLines.map((line) => (
                <p key={line}>{line}</p>
              ))
            : null}
          <p className="mt-2">
            Email:{" "}
            <a
              href={`mailto:${OPERATOR.email}`}
              className="font-medium text-brand-700 underline underline-offset-2"
            >
              {OPERATOR.email}
            </a>
          </p>
          {FALLBACK_CONTROLLER_IS_OPERATOR && DATA_CONTROLLER.phone ? (
            <p>Telephone: {DATA_CONTROLLER.phone}</p>
          ) : null}
          {FALLBACK_CONTROLLER_IS_OPERATOR ? (
            <p className="mt-2 text-sm text-slate-500">
              ICO registration: {DATA_CONTROLLER.icoRegistration}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-slate-500">
            {OPERATOR.name} builds and runs {APP_NAME} and processes data on the
            controller&rsquo;s instructions under a written agreement. It is{" "}
            <strong>not</strong> the controller and cannot decide what your
            village does with your data — but it is a route that always works,
            and it will put you in touch with whoever can.
            {FALLBACK_CONTROLLER_IS_OPERATOR ? (
              <>
                {" "}
                Write here if your village has not named its own controller, or
                if you do not know who yours is.
              </>
            ) : null}
          </p>
        </div>
      </LegalSection>

      <LegalSection id="collected" title="2. What we collect">
        <H3>When you create an account</H3>
        <UL>
          <LI>Your name and email address.</LI>
          <LI>
            Your village, and a join code if your coordinator gave you one.
          </LI>
          <LI>
            Optionally, your telephone number and street or address. The address
            is used by your coordinator to confirm you actually live in the
            village. It is never shown to other residents.
          </LI>
          <LI>
            Optionally, an approximate home location that you pin on a map. We
            shift the point you drop by up to 100 metres before saving it, and we
            never ask for your exact address on the map. It is used for one thing
            only: deciding whether an incident is close enough to be worth
            alerting you about.
          </LI>
        </UL>

        <H3>When you file a report</H3>
        <UL>
          <LI>
            <strong>What you wrote, in your own words.</strong> This is kept
            separately from the version other residents see, and it is restricted
            to you, your village coordinators and moderators. Every single time
            one of them opens it, that is recorded with their name and the time.
          </LI>
          <LI>
            <strong>The anonymised version.</strong> A rewrite with names,
            registration plates, addresses and other identifying details removed.
            This is what appears on the map, in the incident list and in alerts.
          </LI>
          <LI>
            <strong>An approximate location.</strong> Every pin is moved by a
            random offset of up to {LOCATION_FUZZ_METERS} metres before it is
            saved. The exact point you tapped is never written to our database,
            so it cannot leak later.
          </LI>
          <LI>
            <strong>Photos and video, after redaction.</strong> See the next
            section — the originals stay on your device.
          </LI>
          <LI>
            The category, how serious you judged it, when it happened, any
            landmark you typed, and whether you have reported it to the police.
          </LI>
        </UL>

        <H3>While you use the service</H3>
        <UL>
          <LI>
            Your notification preferences: whether you want push alerts, the
            minimum severity worth disturbing you for, and how close an incident
            has to be.
          </LI>
          <LI>
            A record of privileged actions — publishing, rejecting, editing,
            exporting, confirming that a resident lives in the village, and every
            read of an original report — including who did it, when, and from
            what IP address and browser. This is the accountability trail. It
            cannot be edited or deleted, by anyone, including us.
          </LI>
          <LI>
            If you turn on push notifications, an anonymous device identifier
            held by our notification provider so that a message can reach your
            phone.
          </LI>
          <LI>
            <strong>Your votes on published reports.</strong> Every published
            report carries a thumbs up and a thumbs down, meaning &ldquo;more
            serious than it looks&rdquo; and &ldquo;less&rdquo;. We record which
            way you voted so that pressing the button again can take it back —
            so the record is linked to your account, not anonymous to us. Your
            neighbours only ever see the totals. See section 6.
          </LI>
        </UL>
      </LegalSection>

      <LegalSection id="not-collected" title="3. What we do not collect">
        <Callout title="Photos with faces in them never leave your device">
          <p>
            Face detection runs in your browser, on your phone or computer,
            before anything is sent. Every face found is covered there and then.
            Your village coordinator chooses how — a solid black box, or a
            mosaic that reduces the face to a handful of blocks and then blurs
            it — and you can always choose the black box for your own photo
            whatever your village is set to. Every one of those options destroys
            the face before the file is made: the original pixels are gone, not
            hidden. What gets uploaded is a re-encoded copy of the covered
            image, which also strips the EXIF block, including the GPS tag that
            would otherwise say exactly where the photo was taken. There is no
            server-side fallback that accepts the original. If the faces cannot
            be covered, the upload does not happen.
          </p>
        </Callout>
        <P>We also do not collect any of the following:</P>
        <UL>
          <LI>
            Your exact location, at any point. Not when you file, not in the
            background, not ever.
          </LI>
          <LI>Your precise home address on a map.</LI>
          <LI>
            Analytics, advertising identifiers, or any behavioural tracking. We
            run no third-party analytics and no advertising.
          </LI>
          <LI>
            Payment details. {APP_NAME} is free for residents and takes no
            payments.
          </LI>
          <LI>
            Special category data, deliberately. Reports sometimes touch on
            things like someone&apos;s health or ethnicity because a resident
            described what they saw — the anonymisation pass exists to take that
            out, and coordinators are asked to reject anything that survives it.
          </LI>
        </UL>
      </LegalSection>

      <LegalSection id="why" title="4. Why we use it, and our lawful basis">
        <DefinitionList>
          <Definition term="Running your account — contract, Article 6(1)(b)">
            We need your name, email and village to give you an account, put your
            reports in the right place and let you sign in.
          </Definition>
          <Definition term="Community safety reporting — legitimate interests, Article 6(1)(f)">
            Keeping the people who live somewhere informed about local safety is
            a legitimate interest, shared by the residents, the controller and
            the local policing team. This covers publishing anonymised reports,
            showing them on the map and alerting nearby residents. We have
            carried out and documented the balancing test this basis requires,
            and the mitigations it turns on are the ones described on this page:
            your original wording is never published, map positions are shifted,
            and faces are covered before a photograph leaves your device. This is
            the basis in the ordinary case, where your village coordinator is the
            controller.
          </Definition>
          <Definition term="Where a council runs your village — public task, Article 6(1)(e)">
            A parish or town council keeping its residents informed about local
            safety is also exercising a function in the public interest, and a
            council that has taken your village on may rely on that instead for
            the same processing. It changes nothing about what is collected, who
            sees it, how long it is kept, or your right to object to it — see
            &ldquo;Objection&rdquo; in section 8, which covers both bases.
          </Definition>
          <Definition term="Push notifications — consent, Article 6(1)(a)">
            Alerts only go to residents who have switched them on and granted
            their browser permission. You can withdraw that at any time in
            Settings, or in your browser, without affecting anything else.
          </Definition>
          <Definition term="Moderation and the audit trail — legal obligation and legitimate interests, Article 6(1)(c) and (f)">
            Reviewing reports before publication is what stops personal details
            reaching a few hundred neighbours. Logging who read an original
            report is what makes that promise checkable.
          </Definition>
        </DefinitionList>
        <P>
          Reports frequently describe suspected criminal offences. Personal data
          about criminal offences has extra protection under Article 10 of the UK
          GDPR and Schedule 1 of the Data Protection Act 2018. This is precisely
          why the original wording of a report is restricted to coordinators,
          audited on every read, and never published — what residents see is the
          version with the identifying details taken out.
        </P>
      </LegalSection>

      <LegalSection id="ai" title="5. Automated processing with AI">
        <P>
          When you file a report, the text you wrote — and a still frame from a
          photo, if you attached one and its faces have already been covered — is
          sent to{" "}
          <strong>Anthropic</strong>, the company behind the Claude AI models, and
          processed on their servers. Claude rewrites the report with identifying
          details removed, suggests a category and a severity, and pulls out a
          few keywords.
        </P>
        <UL>
          <LI>
            <strong>You see the result before anyone else does.</strong> The
            rewrite comes back to your screen for you to read, edit or reject.
            Nothing is saved until you press publish.
          </LI>
          <LI>
            <strong>It is not a decision about you.</strong> There is no automated
            decision-making with legal or similarly significant effects, in the
            sense of Article 22. The rewrite is shown to you before anything is
            saved, and nothing is published unless you accept it — the
            AI&apos;s judgement is advice, never the last word.
          </LI>
          <LI>
            <strong>Whether a coordinator reads it first is your village&apos;s
            choice.</strong> By default every report waits in a moderation queue
            until a coordinator approves it, and that is what the screens tell
            you as you file. A village&apos;s coordinators can switch that off,
            in which case reports are published the moment you press publish and
            you are told so on the screen before you do. Either way the
            anonymised text is what other residents see, and your original
            wording stays restricted to you, your coordinators and moderators.
          </LI>
          <LI>
            <strong>If it is unavailable, nothing breaks.</strong> Reports filed
            when the AI cannot be reached use your own wording, and the screen
            says so — including a warning that they will be published as written
            if your village has turned review off.
          </LI>
          <LI>
            Anthropic processes this data as a processor on our behalf, under
            their commercial terms, and does not use it to train their models.
          </LI>
        </UL>
        <P>
          The AI is a filter, not a guarantee. Assume a coordinator will read
          your original words, and write your report as though the person you are
          describing might one day read the published version.
        </P>
      </LegalSection>

      <LegalSection id="sharing" title="6. Who else sees it">
        <P>
          We do not sell your data and we do not share it for marketing. It is
          shared only with the following:
        </P>
        <DefinitionList>
          <Definition term="Other residents of your village">
            The anonymised report, its category, severity, approximate location
            and any redacted photos. Your name, unless you filed anonymously.
            Never your original wording, your address, your email or your home
            location.
          </Definition>
          <Definition term="Your village coordinators and moderators">
            Everything above, plus your original wording — recorded each time —
            and your name against the report even when you filed anonymously to
            other residents. They also see the village&rsquo;s membership list:
            your name, when you joined, how many of your reports are on the map,
            and your email address &mdash; which is shown partly hidden, as
            &ldquo;j***@example.com&rdquo;, until they ask for it. That is how a
            coordinator confirms the people on the map are the neighbours they
            think they are; confirming you, or withdrawing that, is recorded in
            the trail above.
          </Definition>
          <Definition term="Anyone, if your coordinator posts an alert somewhere public">
            Once a report is published, your village coordinator can post an
            alert about it to your village&rsquo;s WhatsApp Channel — public to
            anyone holding the invite link, in or out of the village — or share
            it to Facebook, where a post is public. Nothing is posted
            automatically. Neither service gives an app a way to write on
            somebody&rsquo;s behalf, so a coordinator copies the alert and posts
            it themselves, which means a person makes the decision each time.
            An alert carries a headline, an approximate area, how long ago it
            happened, a short extract of the same report your neighbours see,
            and a link back to this app. Never your name, never the
            coordinates, and never a photograph. A WhatsApp Channel is switched
            off unless your coordinator sets one up; sharing to Facebook needs
            no setting, so on a published report it is always one of the options
            in front of them.
          </Definition>
          <Definition term="Anyone given a link to a published report">
            Every published report has a preview page that opens without an
            account, so that a link shared with your village actually shows
            something to a neighbour who has not joined yet. It carries the
            category, how serious it was, roughly when it happened, which
            village, and the first line or so of the same anonymised
            description your neighbours see &mdash; about a hundred characters,
            cut off mid-sentence. Never the rest of it, never the landmark or
            the map location, never a photograph, and never your name. Reading
            the report itself still needs an account in your village. The page
            is not listed in search engines and its address cannot be guessed,
            so in practice it is visible to whoever was handed the link
            &mdash; which, for a report your coordinator has shared publicly, is
            the same audience as the alert above, and a shorter extract than the
            alert carries.
          </Definition>
          <Definition term="Your local police officer, in a summary from a coordinator">
            Your village coordinator can produce a written summary — of one
            report, or of everything published over a period — and send it to
            your PCSO, or to a parish or town council where one runs your
            village, or keep it for the group&rsquo;s own records. This is what a neighbourhood
            watch scheme is for, and it is the same information your neighbours
            already see: the anonymised description, the category, how serious
            it was, when it happened and the landmark the reporter named. Never
            your original wording, never your name or contact details, never the
            map coordinates, and never a photograph. A summary covering a period
            is recorded in your village&rsquo;s audit trail. A single
            report&rsquo;s summary is the same text already on the village map,
            so it is not recorded separately.
          </Definition>
          <Definition term="Nobody, in the case of how you voted on a report">
            The totals are shown to everyone in your village and to your
            coordinator — &ldquo;four residents rated this more serious than it
            looks&rdquo; — and they can appear in a summary a coordinator sends
            to your PCSO. Who voted which way is shown to nobody: there is no
            screen in this service, for a resident or a coordinator, that puts a
            name against a vote. Your coordinator can reach the underlying
            records, in the same way they can already read original report
            wording, and nothing displays them. Your vote goes when you take it
            back, when you close your account, and when the report itself is
            deleted.
          </Definition>
          <Definition term="The police, on request">
            Separately from the above: where there is a lawful basis to
            disclose, such as a formal request in the investigation of a crime.
            That can include your original wording. Your village&rsquo;s data
            controller decides this, not {APP_NAME}, and the disclosure is
            logged.
          </Definition>
          <Definition term="The people who run this service">
            We keep an internal staff channel on Slack that is told when
            somebody registers, when a report is published, and when somebody
            applies to become a coordinator. It carries your name, and on
            registration your email address, so that the people running{" "}
            {APP_NAME} can see the service is working and spot abuse. For a
            published report it carries the same headline, severity and
            approximate area your neighbours see — never your original wording,
            never your address, never coordinates, and never a photograph.
          </Definition>
          <Definition term="Our processors">
            Supabase (database, authentication and file storage, in the UK or
            EU), Vercel (hosting), Anthropic (the AI pass described above),
            OneSignal (push notification delivery), Resend (email delivery — see
            below), and Slack (the staff channel above). Each acts only on our
            instructions, under a written data processing agreement in every
            case but Slack — see below.
          </Definition>
          <Definition term="Resend, which delivers our email">
            Your email address, your first name and your village&rsquo;s name,
            so that the message can be addressed and sent. Four kinds of email
            go out. The sign-up confirmation and password reset links, which are
            sent when you ask for them. A welcome message when you join a
            village, which explains what happens to a report once you file one.
            An alert when a report is published in your village, if you have
            asked for those — it carries the published description, which is the
            same anonymised text your neighbours can already read on the map,
            and never the reporter&rsquo;s original wording, never an address,
            never coordinates and never a photograph. And, for coordinators
            only, a weekly summary of what their village published. We send no
            marketing.
          </Definition>
          <Definition term="The one image in an email">
            Every email we send carries our logo, and your email program fetches
            it from {APP_HOST} when it opens the message. That request tells our
            server your internet address and the fact that the message was
            opened. It is our own address, not a third party&rsquo;s, and it is
            the only thing an email loads &mdash; there is no tracking pixel, no
            link that reports back, and nothing anywhere that reads those
            requests to work out who opened what. Most email programs block
            remote images until you allow them, and the message reads correctly
            either way.
          </Definition>
          <Definition term="Choosing whether we email you">
            Village alerts by email are a setting, sitting beside the one for
            notifications on your phone. The two are independent — you can have
            either, both or neither — and the same choices about how serious an
            incident has to be, and how close to your home, apply to both. Turn
            either off at any time in your settings. Two kinds of message are
            not covered by that switch and will still reach you: the
            confirmation and password links you ask for, and messages about
            something you did yourself — joining a village, or a decision on an
            application you made.
          </Definition>
          <Definition term="Slack (Salesforce), and why it is listed separately">
            Administrative notifications only, to a private channel that only
            the people who run {APP_NAME} can read. It is never used to deliver
            anything to a resident and no part of this service depends on it.
            What a message carries is an anonymised incident summary — the same
            headline, severity and approximate area published to your village —
            or the fact that somebody has registered, applied to coordinate, or
            been given coordinator access. Never your original wording, never
            your address, never coordinates, and never a photograph. It does
            carry your name, and on registration your email address, so that
            abuse can be spotted; nothing else about you is sent. We have no
            separate data processing agreement with Salesforce beyond Slack&rsquo;s
            standard terms, which is why this is set out here rather than left
            inside the list above. If you would rather this disclosure did not
            happen at all, tell us using the contact details in section 13 and
            we will act on it.
          </Definition>
        </DefinitionList>
        <P>
          Map tiles come from OpenStreetMap and are fetched by your browser
          directly, so their servers see your IP address as they would for any
          website you visit. No report data is sent with those requests.
        </P>
        {/*
          Not a disclosure, and it is in this section anyway because a resident
          reading "who else sees it" is entitled to know about every outbound
          request the service makes on their behalf — including the ones that
          carry nothing about them. Nothing in a report, nothing about an
          account and no IP address of a resident reaches data.police.uk: the
          request is made by our server and it contains a village&rsquo;s map
          centre, which is published by the Office for National Statistics, and
          a calendar month.

          This paragraph is a statement about how the code behaves in the same
          sense the six named at the head of this file are. If
          `src/lib/police-api.ts` ever sends anything else, this changes in the
          same commit.
        */}
        <P>
          {APP_NAME} also shows the official recorded-crime figures the Home
          Office publishes for your area, so that your village&rsquo;s own
          reports can be read against an independent number. Those figures are
          fetched by our servers from data.police.uk, and nothing about you is
          sent to get them &mdash; the request carries your village&rsquo;s map
          centre and a calendar month, and nothing else. No report, no account,
          no location of yours and not your IP address. What comes back is open
          data published under the Open Government Licence, in which every crime
          has already been anonymised by the police to a point &ldquo;on or
          near&rdquo; a street rather than an address.
        </P>
        <P>
          Some of our processors operate outside the UK. Where data is
          transferred, it is protected by the UK International Data Transfer
          Addendum or an adequacy decision.
        </P>
      </LegalSection>

      <LegalSection id="retention" title="7. How long we keep it">
        <DefinitionList>
          <Definition term={`Photos and video — ${RETENTION.mediaDeleteMonths} months`}>
            Deleted from storage entirely, redacted copies included. A photo is
            the most identifying thing in a report and the least useful once the
            incident is old.
          </Definition>
          <Definition term={`Reports — archived at ${RETENTION.incidentArchiveMonths} months`}>
            Archived reports leave the map and the incident list. They are not
            deleted: the record is kept for the pattern history a village needs
            to see year-on-year trends.
          </Definition>
          <Definition
            term={`Original report wording — deleted at ${RETENTION.incidentArchiveMonths} months`}
          >
            Your original wording is deleted twelve months after you file it,
            in the same overnight step that archives the report and takes it off
            the map. That is twelve months from filing however the report got
            there — if a coordinator archives it sooner, the wording still goes
            at twelve months and not before. Until then it stays with the
            report, restricted to your coordinators, and every single read of it
            is recorded in the audit trail. You do not have to wait: delete the
            report, or close your account, and it goes immediately, along with
            the photos. One thing to know — if the rewrite described in section
            4 did not run on your report, the published description is your own
            wording, and that is the report itself rather than a restricted copy
            of it, so it stays with the archived record.
          </Definition>
          <Definition term="Votes on reports — until the report goes">
            How you voted is kept while the report is. It goes when you take the
            vote back, when the report is deleted by the person who filed it, and
            when you close your own account — in that last case, every vote you
            have ever cast, on every report.
          </Definition>
          <Definition term={`Audit records — ${RETENTION.auditLogMonths} months`}>
            Kept longer than the reports they describe, because their whole
            purpose is to show, afterwards, who looked at what.
          </Definition>
          <Definition term={`Inactive accounts — ${RETENTION.inactiveAccountMonths} months`}>
            An account with no sign-in for two years is closed and its personal
            details removed. Reports already published stay up, detached from
            the account.
          </Definition>
          <Definition term="Accounts you close yourself — immediately">
            Closing your own account from Settings does not wait for any of the
            periods above. Every report you filed is deleted there and then, the
            photos are removed from storage, and your name, address, phone
            number and approximate home location are erased from your profile.
            Your email address is kept, because it is what stops the closed
            account being signed into again.
          </Definition>
        </DefinitionList>
      </LegalSection>

      <LegalSection id="rights" title="8. Your rights">
        <P>
          Under the UK GDPR you have the following rights. To use any of them,
          contact your village&rsquo;s data controller — your coordinator, or the
          council if one has taken the village on; section 1 explains which —
          using the details in section 13. They must respond within one month,
          and it is free.
        </P>
        <DefinitionList>
          <Definition term="Access">
            Ask for a copy of the personal data we hold about you, including your
            reports in their original wording and the record of who has read
            them.
          </Definition>
          <Definition term="Rectification">
            Have inaccurate details corrected. You can edit your own report
            yourself, in the app, at any point before a coordinator has reviewed
            it.
          </Definition>
          <Definition term="Erasure">
            Ask for your data to be deleted — and you do not have to ask us. Any
            report you have filed has a <strong>Delete</strong> button on its own
            page, whatever stage it has reached, published included; and{" "}
            <strong>Settings</strong> has a <strong>Delete my account</strong>{" "}
            option that does the same to every report you have ever filed and
            closes the account. Both act immediately. Deleting a report removes
            its wording, its location and any photos or video, and takes it off
            the map; the photos are deleted from our storage, not merely hidden.
            What is left is the reference, the category, how serious it was and
            the date — a report the village can still count without a word of
            what you wrote. Audit records cannot be deleted: they are the
            accountability trail, and a trail that can be erased on request is
            not one. They record what a coordinator decided about a report, not
            what the report said.
          </Definition>
          <Definition term="Portability">
            Receive the data you gave us in a structured, machine-readable
            format, or have it sent to another controller.
          </Definition>
          <Definition term="Objection">
            Object to processing carried out under our public task or legitimate
            interests. Tell us why it affects you, and we will stop unless we can
            show compelling grounds that override your interests.
          </Definition>
          <Definition term="Restriction">
            Ask us to hold your data but stop using it, for example while a
            complaint about its accuracy is being resolved.
          </Definition>
          <Definition term="Withdraw consent">
            Turn push notifications off in Settings at any time. Withdrawing does
            not affect anything done before you withdrew.
          </Definition>
        </DefinitionList>
      </LegalSection>

      <LegalSection id="children" title="9. Children and young people">
        <P>
          You must be at least {MINIMUM_AGE} to hold a {APP_NAME} account. We do
          not knowingly create accounts for anyone younger, and we do not ask for
          anyone&apos;s date of birth beyond that confirmation.
        </P>
        <P>
          Reports frequently mention young people — a group causing a nuisance,
          a missing teenager, someone seen near a shed. That is legitimate and
          the service is built for it, with three safeguards:
        </P>
        <UL>
          <LI>
            The anonymisation pass removes names, schools, and descriptions
            distinctive enough to identify one particular child.
          </LI>
          <LI>
            Faces are covered before any photo is uploaded, at every setting a
            village can choose, so a photograph of a child cannot be published
            even by mistake.
          </LI>
          <LI>
            Coordinators are asked to reject any report that names or clearly
            identifies a child, and to route safeguarding concerns to the police
            or to children&apos;s services rather than onto a village map.
          </LI>
        </UL>
        <P>
          If you believe a published report identifies a child, contact your
          coordinator and it will be removed while it is reviewed.
          If a parent or guardian asks us to remove data about their child, we
          will do so.
        </P>
      </LegalSection>

      <LegalSection id="security" title="10. How we protect it">
        <UL>
          <LI>
            Everything is served over HTTPS, and the browser is instructed never
            to use anything else.
          </LI>
          <LI>
            Your village is a hard boundary. Every query for reports, residents
            and alerts is scoped to it, and that scope comes from your session on
            our servers — never from anything a browser sends.
          </LI>
          <LI>
            Original report wording sits behind a deliberate action that records
            who read it, rather than being loaded onto a page where a glance
            leaves no trace.
          </LI>
          <LI>
            Passwords are handled by Supabase Auth and are never stored by us in
            any form we can read.
          </LI>
          <LI>
            The database enforces access rules of its own, underneath the
            application, so a bug in one screen cannot expose another
            village&apos;s reports.
          </LI>
        </UL>
        <P>
          If a breach occurs that is likely to risk your rights and freedoms, we
          will report it to the ICO within 72 hours and tell you directly where
          the risk is high.
        </P>
      </LegalSection>

      <LegalSection id="cookies" title="11. Cookies">
        <P>
          {APP_NAME} sets only strictly necessary cookies: the ones that keep you
          signed in and protect the sign-in form. There are no analytics cookies,
          no advertising cookies, and nothing that follows you to other sites —
          which is why you have not been asked to accept anything.
        </P>
      </LegalSection>

      <LegalSection id="changes" title="12. Changes to this policy">
        <P>
          We will update this page when what we do changes, and the date at the
          top will change with it. Where a change materially affects you — a new
          processor, a new purpose, a shorter or longer retention period — we
          will tell you in the app before it takes effect.
        </P>
      </LegalSection>

      <LegalSection id="contact" title="13. Contact and complaints">
        <P>
          For anything in this policy, including a request to exercise your
          rights, contact your village&rsquo;s data controller. If your
          coordinator is the controller — the ordinary case — they are who to
          ask.{" "}
          {HAS_FALLBACK_CONTROLLER_DETAILS ? (
            <>
              Where no village-specific controller has been named, write to{" "}
              {/*
                A real `mailto:`, not the bare address this used to print. This
                is the sentence a subject access request starts from, and a
                resident reading it on a phone should be able to tap it — which
                is also the invariant `tests/legal-placeholders.test.tsx` holds
                both pages to.
              */}
              <a
                href={`mailto:${DATA_CONTROLLER.email}`}
                className="font-medium text-brand-700 underline underline-offset-2"
              >
                {DATA_CONTROLLER.email}
              </a>{" "}
              or to the address in section 1, and {OPERATOR.name} will identify
              the controller for your village and pass your request to them.
            </>
          ) : (
            <>
              If you cannot reach them or do not know who they are, email{" "}
              <a
                href={`mailto:${OPERATOR.email}`}
                className="font-medium text-brand-700 underline underline-offset-2"
              >
                {OPERATOR.email}
              </a>{" "}
              and {OPERATOR.name} will identify the controller for your village
              and pass your request to them.
            </>
          )}
        </P>
        <P>
          If you are not satisfied with the response, you can complain to the
          Information Commissioner&apos;s Office, the UK&apos;s data protection
          regulator, at{" "}
          <a
            href="https://ico.org.uk/make-a-complaint/"
            className="font-medium text-brand-700 underline underline-offset-2"
            rel="noreferrer"
          >
            ico.org.uk/make-a-complaint
          </a>{" "}
          or on 0303 123 1113. We would rather you came to us first, but you do
          not have to.
        </P>
        <P>
          See also our{" "}
          <Link
            href="/terms"
            className="font-medium text-brand-700 underline underline-offset-2"
          >
            terms of use
          </Link>
          , which cover what may and may not be posted.
        </P>
      </LegalSection>
    </LegalPage>
  );
}
