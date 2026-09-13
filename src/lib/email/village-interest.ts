import { APP_NAME, DATA_CONTROLLER } from "@/lib/constants";
import {
  heading,
  list,
  paragraph,
  renderEmail,
  textFooter,
  type EmailMessage,
} from "@/lib/email/layout";

/**
 * The confirmation for somebody who registered interest in a village that is
 * not in service yet.
 *
 * **The fifth template, and the first one addressed to somebody with no
 * account.** Every other email this codebase renders goes to a resident of a
 * village — the welcome, the incident alert, the weekly digest, the coordinator
 * decision. This one goes to a stranger, and three things follow from that:
 *
 * - **The footer links are Privacy and Terms, not notification settings.** The
 *   default row offers a page the recipient cannot reach, for the reason the
 *   Supabase auth templates give: there is nothing to sign in to.
 * - **It says how to be removed, in the body rather than in the small print.**
 *   A resident can delete their own account from `/settings`; nobody here can,
 *   because there is no session to authenticate them and therefore no screen
 *   that could offer a button. An email address is the only removal route this
 *   person has, so it goes where they will read it.
 * - **It promises nothing about when.** "We'll be in touch when your village is
 *   ready" is true; a date would not be, because activating a village needs a
 *   coordinator to volunteer and there is no way to know when that happens. The
 *   coordinator version is the one place the email asks for anything, and it
 *   asks softly for the same reason.
 *
 * ## Two messages, one function
 *
 * The brief asked for different copy per path and that is what `role` picks.
 * They share a shell and a footer because they are the same act — an
 * acknowledgement — and the difference is two paragraphs. Two exported
 * functions would be two places to keep the removal sentence in step, and that
 * sentence is the one with a legal obligation behind it.
 */
export function villageInterestEmail(input: {
  name: string;
  villageName: string;
  isCoordinatorCandidate: boolean;
}): EmailMessage {
  // First name only, the welcome's rule: an email that opens with somebody's
  // full legal name reads as a mailshot rather than as a person writing.
  const firstName = input.name.trim().split(/\s+/)[0] || input.name.trim();

  const opening = `Thanks — we have your interest in bringing ${APP_NAME} to ${input.villageName}.`;

  const whatHappens = input.isCoordinatorCandidate
    ? `You said you would be willing to coordinate ${input.villageName}, which is the part that actually gets a village started. Somebody will be in touch about what the role involves before anything is set up — there is no commitment in having said yes.`
    : `We will email you when ${input.villageName} goes live. That usually waits on one thing: somebody in the village willing to coordinate it, which is a volunteer role and the reason most villages start when they do.`;

  const removal = `If you would rather we did not keep your details, reply to this message or write to ${DATA_CONTROLLER.email} and we will delete them. We keep them until your village launches or you ask us to remove them, and we will not use them for anything else.`;

  const text = [
    `Hello ${firstName},`,
    "",
    opening,
    "",
    whatHappens,
    "",
    "What we have recorded:",
    `- Your name and email address`,
    `- ${input.villageName}, as the village you are asking for`,
    ...(input.isCoordinatorCandidate
      ? ["- That you are interested in coordinating it"]
      : []),
    "",
    removal,
    "",
    `${APP_NAME} is not an emergency service. If something is happening now and`,
    "somebody is in danger, call 999.",
    "",
    textFooter(),
  ].join("\n");

  const html = renderEmail({
    title: input.isCoordinatorCandidate
      ? `About coordinating ${input.villageName}`
      : `We'll let you know about ${input.villageName}`,
    preheader: input.isCoordinatorCandidate
      ? "We'll be in touch about the coordinator role."
      : `We'll email you when ${input.villageName} is ready.`,
    body: [
      paragraph(`Hello ${firstName},`),
      paragraph(opening),
      paragraph(whatHappens),
      heading("What we have recorded"),
      list([
        "Your name and email address",
        `${input.villageName}, as the village you are asking for`,
        ...(input.isCoordinatorCandidate
          ? ["That you are interested in coordinating it"]
          : []),
      ]),
      paragraph(removal),
      paragraph(
        `${APP_NAME} is not an emergency service. If something is happening ` +
          "now and somebody is in danger, call 999.",
      ),
    ].join("\n"),
    /*
      Privacy and Terms rather than the default row, which offers notification
      settings — a page behind a session this recipient does not have. The
      Supabase confirmation template makes the same swap for the same reason.
    */
    links: [
      { label: "Privacy", path: "/privacy" },
      { label: "Terms", path: "/terms" },
    ],
    footer: `You are receiving this because you registered interest in ${APP_NAME} for ${input.villageName}.`,
  });

  return {
    subject: input.isCoordinatorCandidate
      ? `Coordinating ${APP_NAME} in ${input.villageName}`
      : `${APP_NAME} in ${input.villageName}`,
    text,
    html,
  };
}
