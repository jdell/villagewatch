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
  APP_NAME,
  DATA_CONTROLLER,
  LOCATION_FUZZ_METERS,
  MINIMUM_AGE,
  RETENTION,
} from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How VillageWatch collects, uses and protects the personal data in a community safety report, under UK GDPR.",
};

/**
 * The privacy notice, written to Articles 13 and 14 of the UK GDPR.
 *
 * Three things here are statements about how the code actually behaves, and
 * they have to keep matching it. If any of them changes, this page changes in
 * the same commit:
 *
 *   - Faces are blurred on the device and only the re-encoded canvas output is
 *     uploaded (domain rule 3, `src/lib/media/face-blur.ts`). The claim that an
 *     unblurred original never leaves the phone is the strongest promise on
 *     this page, and it is true because `POST /api/incidents/media` has no
 *     server-side blur fallback.
 *   - Coordinates are jittered by `LOCATION_FUZZ_METERS` before they are stored
 *     (domain rule 2, `src/lib/geo.ts`).
 *   - Report text is sent to Anthropic for anonymisation
 *     (`src/lib/ai/structure-incident.ts`). Residents are told before they file,
 *     not after.
 *
 * The retention schedule is the one section that describes intent rather than
 * behaviour — there is no retention job yet. See "Not built yet" in CLAUDE.md.
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
      <Callout tone="warning" title="Before this village goes live">
        The contact details and data controller named below are placeholders.
        Your parish council must complete them, register with the ICO if it has
        not already, and have this notice reviewed alongside its own data
        protection policy before any resident signs up.
      </Callout>

      <LegalSection id="controller" title="1. Who is responsible for your data">
        <P>
          Your parish council is the <strong>data controller</strong> for
          everything described here. They decide what {APP_NAME} is used for and
          they answer for it. {APP_NAME} provides the software and processes data
          on their instructions.
        </P>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-base leading-relaxed text-slate-700">
          <p className="font-semibold text-slate-900">{DATA_CONTROLLER.name}</p>
          {DATA_CONTROLLER.addressLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p className="mt-2">Email: {DATA_CONTROLLER.email}</p>
          <p>Telephone: {DATA_CONTROLLER.phone}</p>
          <p className="mt-2 text-sm text-slate-500">
            ICO registration: {DATA_CONTROLLER.icoRegistration}
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
            exporting, and every read of an original report — including who did
            it, when, and from what IP address and browser. This is the
            accountability trail. It cannot be edited or deleted, by anyone,
            including us.
          </LI>
          <LI>
            If you turn on push notifications, an anonymous device identifier
            held by our notification provider so that a message can reach your
            phone.
          </LI>
        </UL>
      </LegalSection>

      <LegalSection id="not-collected" title="3. What we do not collect">
        <Callout title="Unblurred photos never leave your device">
          <p>
            Face detection and blurring run in your browser, on your phone or
            computer, before anything is sent. What gets uploaded is a
            re-encoded copy of the blurred image — which also strips the EXIF
            block, including the GPS tag that would otherwise say exactly where
            the photo was taken. There is no server-side fallback that accepts
            an unblurred original. If the blur cannot run, the upload does not
            happen.
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
          <Definition term="Community safety reporting — public task, Article 6(1)(e)">
            A parish council keeping its residents informed about local safety is
            exercising a function in the public interest. This covers publishing
            anonymised reports, showing them on the map and alerting nearby
            residents.
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
          photo, if you attached one and it has already been blurred — is sent to{" "}
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
            other residents.
          </Definition>
          <Definition term="Anyone, if your village runs a WhatsApp Channel">
            A WhatsApp Channel is public: anyone holding the invite link can
            read it, in or out of the village. Your village coordinator decides
            whether to run one, and it is switched off unless they turn it on.
            Nothing is posted automatically — WhatsApp gives an app no way to
            write to a channel, so a coordinator copies the alert and posts it
            themselves, which means a person makes the decision each time. An
            alert carries a headline, an approximate area, how long ago it
            happened, a short extract of the same report your neighbours see,
            and a link back to this app. Never your name, never the
            coordinates, and never a photograph.
          </Definition>
          <Definition term="Your local police officer and parish council, in a summary from a coordinator">
            Your village coordinator can produce a written summary — of one
            report, or of everything published over a period — and send it to
            your PCSO or to the parish council. This is what a neighbourhood
            watch scheme is for, and it is the same information your neighbours
            already see: the anonymised description, the category, how serious
            it was, when it happened and the landmark the reporter named. Never
            your original wording, never your name or contact details, never the
            map coordinates, and never a photograph. A summary covering a period
            is recorded in your village&rsquo;s audit trail. A single
            report&rsquo;s summary is the same text already on the village map,
            so it is not recorded separately.
          </Definition>
          <Definition term="The police, on request">
            Separately from the above: where there is a lawful basis to
            disclose, such as a formal request in the investigation of a crime.
            That can include your original wording. Your parish council decides
            this, not {APP_NAME}, and the disclosure is logged.
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
            OneSignal (push notification delivery), and Slack (the staff channel
            above). Each acts only on our instructions under a written data
            processing agreement.
          </Definition>
        </DefinitionList>
        <P>
          Map tiles come from OpenStreetMap and are fetched by your browser
          directly, so their servers see your IP address as they would for any
          website you visit. No report data is sent with those requests.
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
            Archived reports leave the map and the incident list. The anonymised
            text is retained beyond that only in aggregate, for the pattern
            history a village needs to see year-on-year trends.
          </Definition>
          <Definition term={`Original report wording — ${RETENTION.incidentArchiveMonths} months`}>
            Deleted when the report is archived. After that, only the anonymised
            version remains.
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
          Under the UK GDPR you have the following rights. Contact your parish
          council using the details in section 13 to use any of them. They must
          respond within one month, and it is free.
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
            Faces are blurred before any photo is uploaded, so a photograph of a
            child cannot be published even by mistake.
          </LI>
          <LI>
            Coordinators are asked to reject any report that names or clearly
            identifies a child, and to route safeguarding concerns to the police
            or to children&apos;s services rather than onto a village map.
          </LI>
        </UL>
        <P>
          If you believe a published report identifies a child, contact your
          coordinator or the council and it will be removed while it is reviewed.
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
          rights, contact your parish council at{" "}
          <strong>{DATA_CONTROLLER.email}</strong> or write to them at the
          address in section 1.
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
