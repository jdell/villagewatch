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
  MINIMUM_AGE,
  RETENTION,
} from "@/lib/constants";

export const metadata: Metadata = {
  title: "Terms of use",
  description:
    "The rules for using VillageWatch: what may be reported, what may not, and who is responsible for what.",
  alternates: { canonical: "/terms" },
  openGraph: { url: "/terms", title: "Terms of use" },
};

/**
 * Terms of use and the community guidelines.
 *
 * The guidelines in section 5 are written to match the rules a village
 * WhatsApp group runs on — that is the thing this product replaces, and a
 * resident arriving from one should not find a different set of expectations.
 * No specific group's rules were supplied, so these are the common set: report
 * what you saw, not who you think did it; no vigilante action; 999 first;
 * nothing about a neighbour they would not say to their face. Replace them with
 * the parish's own wording if it has any.
 *
 * Section 8 matters more than it looks. The AI rewrite is good and it is not a
 * guarantee, and a resident who assumes it is will eventually file something
 * identifying and expect the software to have caught it.
 */

const SECTIONS = [
  { id: "who", title: "Who these terms are between" },
  { id: "not-emergency", title: "What VillageWatch is not" },
  { id: "account", title: "Your account" },
  { id: "acceptable-use", title: "Acceptable use" },
  { id: "guidelines", title: "Community guidelines" },
  { id: "responsibility", title: "You are responsible for what you file" },
  { id: "moderation", title: "Moderation and removal" },
  { id: "ai", title: "AI-generated summaries" },
  { id: "content", title: "Your content" },
  { id: "availability", title: "Availability and liability" },
  { id: "suspension", title: "Suspension and closing your account" },
  { id: "changes", title: "Changes to these terms" },
  { id: "law", title: "Governing law" },
  { id: "contact", title: "Contact" },
] as const satisfies readonly LegalSectionRef[];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro={`These are the rules for using ${APP_NAME}. The short version: report what you saw, not who you think did it, and never post anything that identifies a private individual. Everything below is that idea in more detail.`}
      sections={SECTIONS}
    >
      <Callout tone="warning" title="In an emergency, call 999">
        {APP_NAME} is not monitored around the clock and no one is watching for
        your report as it arrives. If a crime is in progress, if anyone is in
        danger, or if you need help now, call 999. For non-urgent police matters
        call 101. File here afterwards, when everyone is safe.
      </Callout>

      <LegalSection id="who" title="1. Who these terms are between">
        <P>
          {APP_NAME}, the service at <strong>villagewatch.app</strong>, is
          operated for your village by {DATA_CONTROLLER.name}. By creating an
          account you agree to these terms and to our{" "}
          <Link
            href="/privacy"
            className="font-medium text-brand-700 underline underline-offset-2"
          >
            privacy policy
          </Link>
          . If you do not agree with them, do not use the service.
        </P>
      </LegalSection>

      <LegalSection id="not-emergency" title="2. What VillageWatch is not">
        <UL>
          <LI>
            <strong>It is not an emergency service.</strong> Nothing you post
            here reaches the police, the fire service or an ambulance.
          </LI>
          <LI>
            <strong>It is not monitored continuously.</strong> Your coordinator
            is a volunteer neighbour. A report may sit unreviewed overnight, over
            a weekend, or while they are away.
          </LI>
          <LI>
            <strong>It is not a crime record.</strong> Reports are what residents
            believe they saw. They are not verified, not investigated, and
            carry no official status.
          </LI>
          <LI>
            <strong>It is not a substitute for reporting to the police.</strong>{" "}
            If something is a crime, report it to the police as well. There is a
            field on the report form for the reference they give you.
          </LI>
        </UL>
      </LegalSection>

      <LegalSection id="account" title="3. Your account">
        <UL>
          <LI>
            You must be at least {MINIMUM_AGE} years old and live in, or have a
            genuine connection to, the village you join.
          </LI>
          <LI>
            Give your real name. Coordinators verify residents so that a village
            map reflects its actual neighbours, and an account under a false name
            will be removed. You can still file individual reports anonymously —
            that hides your name from other residents, not from your
            coordinator.
          </LI>
          <LI>
            One account per person. Do not share your password or let anyone else
            file under your name.
          </LI>
          <LI>
            Tell your coordinator promptly if you think someone else has got into
            your account.
          </LI>
        </UL>
      </LegalSection>

      <LegalSection id="acceptable-use" title="4. Acceptable use">
        <P>You must not post, upload or share any of the following.</P>

        <H3>Anything that identifies a private individual</H3>
        <P>
          This is the rule the whole service is built around. Do not include:
        </P>
        <UL>
          <LI>Names, nicknames, or &ldquo;the family at number 14&rdquo;.</LI>
          <LI>
            Vehicle registration plates, or a vehicle described distinctively
            enough to be one particular car.
          </LI>
          <LI>Home addresses, workplaces, or schools.</LI>
          <LI>
            Phone numbers, email addresses, or social media accounts.
          </LI>
          <LI>
            Photographs or video in which a person is recognisable, including by
            build, clothing or context rather than face.
          </LI>
          <LI>
            Descriptions of ethnicity, religion, disability, sexuality or health
            unless they are genuinely necessary to the report — and they rarely
            are.
          </LI>
        </UL>
        <P>
          The AI pass removes most of this automatically and a coordinator checks
          the rest, but you should not rely on either. Write the report as though
          neither existed.
        </P>

        <H3>Anything defamatory or accusatory</H3>
        <UL>
          <LI>
            Do not accuse anyone of a crime. &ldquo;A shed was broken
            into&rdquo; is a report. &ldquo;The lad from the caravans broke into
            my shed&rdquo; is an allegation, and publishing an untrue allegation
            that damages someone&apos;s reputation is defamation — for which{" "}
            <em>you</em> are liable, not the council and not {APP_NAME}.
          </LI>
          <LI>
            Do not post about a suspect, a court case or an investigation in a
            way that could prejudice it.
          </LI>
          <LI>
            Do not use reports to pursue a dispute with a neighbour, a landlord,
            a business or the council.
          </LI>
        </UL>

        <H3>Anything else on this list</H3>
        <UL>
          <LI>
            Reports you know to be false, exaggerated, or filed to cause alarm.
          </LI>
          <LI>
            Abuse, harassment, threats, or content that is hateful towards any
            group.
          </LI>
          <LI>Indecent, obscene or gratuitously distressing images.</LI>
          <LI>
            Advertising, campaigning, canvassing, fundraising or anything
            commercial.
          </LI>
          <LI>
            Content that infringes someone else&apos;s copyright, or footage from
            a camera you had no right to use.
          </LI>
          <LI>
            Anything that would break a court order, a reporting restriction or
            the law.
          </LI>
          <LI>
            Automated filing, scraping the map, or attempting to get at reports
            from another village.
          </LI>
        </UL>
      </LegalSection>

      <LegalSection id="guidelines" title="5. Community guidelines">
        <P>
          These carry over from the village group chat this replaces. They are
          not legal obligations so much as what makes the difference between a
          watch scheme people trust and one they mute.
        </P>
        <DefinitionList>
          <Definition term="Report what you saw, not who you think did it">
            A description of a vehicle circling twice at midnight is useful. A
            name is not — it is an accusation, and it is the fastest way to make
            a village turn on someone who turns out to have been visiting their
            mother.
          </Definition>
          <Definition term="999 first, then here">
            Never let filing a report delay a call to the emergency services. The
            map can wait ten minutes. It always can.
          </Definition>
          <Definition term="No vigilante action, ever">
            Do not confront, follow, detain or organise a group to deal with
            anyone. Do not post about doing so. Watch schemes exist to observe
            and report — the moment they do more than that, someone gets hurt and
            the scheme is finished.
          </Definition>
          <Definition term="One incident, one report">
            If four people saw the same van, four reports make it look like four
            vans. Check the map first; add what you saw as a confirmation
            instead.
          </Definition>
          <Definition term="Keep it proportionate">
            An unfamiliar car parked on a lane is not a crime. A delivery driver
            with a clipboard is not a scout. Ask yourself whether you would want
            the report filed if you were the one being described.
          </Definition>
          <Definition term="Nothing you would not say to their face">
            Everything published is read by a few hundred neighbours, and there
            is a good chance the person in the report is one of them.
          </Definition>
          <Definition term="It is not a noticeboard">
            Lost cats and blocked drains, yes — that is what the categories are
            for. Parish politics, sale items, and opinions about the council
            belong somewhere else.
          </Definition>
          <Definition term="Respect the coordinators">
            They are volunteers reading every report before anyone else sees it.
            Disagree with a decision by all means; take it up with them
            privately.
          </Definition>
        </DefinitionList>
      </LegalSection>

      <LegalSection
        id="responsibility"
        title="6. You are responsible for what you file"
      >
        <P>
          You remain legally responsible for the content of every report you
          submit, including after it has been anonymised, rewritten and
          published. Neither {APP_NAME} nor {DATA_CONTROLLER.name} accepts
          responsibility for a report&apos;s accuracy.
        </P>
        <P>
          In particular, the anonymisation pass and the coordinator&apos;s review
          reduce the risk of publishing something identifying or defamatory —
          they do not transfer that risk away from you. If a report you filed
          defames someone, the claim is against you.
        </P>
        <P>
          You confirm that anything you upload is yours to upload, and that any
          photograph or video was taken lawfully.
        </P>
      </LegalSection>

      <LegalSection id="moderation" title="7. Moderation and removal">
        <UL>
          <LI>
            By default, every report is reviewed by a coordinator before
            publication, and nothing you file is visible to other residents
            until it has been. Your village&apos;s coordinators can turn that
            review off, in which case reports are published the moment they are
            filed — the screen tells you which applies before you press publish.
          </LI>
          <LI>
            Coordinators may edit, reject, resolve or archive any report in their
            village, at their discretion, with or without giving a reason.
          </LI>
          <LI>
            We may remove any content at any time, particularly where it breaches
            section 4, and we do not have to warn you first.
          </LI>
          <LI>
            You can edit or withdraw your own report yourself while it is still
            awaiting review. Once published it becomes part of the village
            record, and removing it is a coordinator&apos;s decision — though
            your right to erasure under data protection law is unaffected, and
            section 8 of the{" "}
            <Link
              href="/privacy"
              className="font-medium text-brand-700 underline underline-offset-2"
            >
              privacy policy
            </Link>{" "}
            explains how to use it.
          </LI>
          <LI>
            Published reports are archived after{" "}
            {RETENTION.incidentArchiveMonths} months and attached photos are
            deleted after {RETENTION.mediaDeleteMonths}.
          </LI>
          <LI>
            Every moderation decision is logged. So is every read of a
            report&apos;s original wording.
          </LI>
        </UL>
      </LegalSection>

      <LegalSection id="ai" title="8. AI-generated summaries">
        <P>
          {APP_NAME} uses AI to rewrite reports with identifying details removed,
          to suggest categories and severities, to flag patterns across nearby
          reports, and to write the weekly summary coordinators receive.
        </P>
        <UL>
          <LI>
            <strong>These outputs are provided without warranty.</strong> They
            can be wrong, incomplete, or miss something identifying that a person
            would have caught. Do not treat them as verified.
          </LI>
          <LI>
            <strong>You see the rewrite before it is published</strong> and can
            edit or reject it. Publishing it is your decision and it stays your
            report.
          </LI>
          <LI>
            <strong>A pattern note is an observation, not a finding.</strong>{" "}
            &ldquo;Fourth report of vehicle crime within 200 metres this
            month&rdquo; describes what has been filed. It does not establish
            that the incidents are related, and it never identifies anyone.
          </LI>
          <LI>
            To the extent the law allows, neither {APP_NAME} nor{" "}
            {DATA_CONTROLLER.name} is liable for any loss arising from reliance
            on an AI-generated summary, category, severity or pattern note.
          </LI>
        </UL>
        <P>
          Section 5 of the privacy policy explains what is sent to the AI
          provider and what happens to it.
        </P>
      </LegalSection>

      <LegalSection id="content" title="9. Your content">
        <P>
          What you file stays yours. By submitting it you give{" "}
          {DATA_CONTROLLER.name} a non-exclusive, royalty-free licence to store
          it, anonymise it, redact it, publish it to your village and include it
          in aggregated safety statistics, for as long as these terms apply and
          for the retention periods in the privacy policy.
        </P>
        <P>
          That licence exists so the service can function. It does not let anyone
          sell your content, use it for marketing, or pass it to a third party
          beyond the processors listed in the privacy policy.
        </P>
      </LegalSection>

      <LegalSection id="availability" title="10. Availability and liability">
        <UL>
          <LI>
            The service is provided as it is. We do not promise it will be
            available, uninterrupted, or free of errors, and we may change or
            withdraw features.
          </LI>
          <LI>
            Push notifications depend on your device, your browser and third-party
            networks. Alerts may be delayed or not arrive at all. Do not rely on
            receiving one.
          </LI>
          <LI>
            Nothing here limits liability for death or personal injury caused by
            negligence, for fraud, or for anything else that cannot lawfully be
            limited.
          </LI>
          <LI>
            Subject to that, neither {APP_NAME} nor {DATA_CONTROLLER.name} is
            liable for indirect or consequential loss, loss of property, or loss
            arising from a report that was inaccurate, delayed, unreviewed or
            never filed.
          </LI>
          <LI>
            You agree to indemnify {DATA_CONTROLLER.name} against claims brought
            by a third party arising from content you filed in breach of section
            4.
          </LI>
        </UL>
      </LegalSection>

      <LegalSection id="suspension" title="11. Suspension and closing your account">
        <P>
          We may suspend or remove your account if you breach these terms, if you
          repeatedly file reports that have to be rejected, or if you no longer
          live in the village. Serious breaches — harassment, deliberately false
          reports, publishing someone&apos;s details — mean immediate removal,
          and may be reported to the police.
        </P>
        <P>
          You can close your account at any time by asking your coordinator or
          the council. Reports already published stay on the village map,
          detached from your name.
        </P>
      </LegalSection>

      <LegalSection id="changes" title="12. Changes to these terms">
        <P>
          We may update these terms. The date at the top of the page changes when
          we do, and material changes will be flagged in the app before they take
          effect. Continuing to use {APP_NAME} after that means you accept them.
        </P>
      </LegalSection>

      <LegalSection id="law" title="13. Governing law">
        <P>
          These terms are governed by the law of England and Wales, and the
          courts of England and Wales have exclusive jurisdiction. If any part of
          them is found unenforceable, the rest continues to apply.
        </P>
      </LegalSection>

      <LegalSection id="contact" title="14. Contact">
        <P>
          Questions about these terms, or about a moderation decision, go to{" "}
          {DATA_CONTROLLER.name} at <strong>{DATA_CONTROLLER.email}</strong>.
        </P>
      </LegalSection>
    </LegalPage>
  );
}
