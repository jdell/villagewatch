import { APP_NAME } from "@/lib/constants";
import {
  appUrl,
  button,
  list,
  paragraph,
  note,
  renderEmail,
  textFooter,
  type EmailMessage,
} from "@/lib/email/layout";

/**
 * What an applicant is told when an administrator decides on their coordinator
 * application.
 *
 * **Nothing sends this yet.** `src/lib/email/` renders; there is no transport
 * (see the module comment in `index.ts`), so the decision reaches the applicant
 * as a push notification today — `notifyApplicantOfCoordinatorDecision` in
 * `src/lib/notifications.ts` — and this is the same message ready for the day a
 * mailer is wired in. Push is the fallback that actually runs, not the other way
 * round: a phone with notifications denied is common, and an application somebody
 * waited a week on should not be decided in silence.
 *
 * Two things shape the wording:
 *
 * - **An approval is a briefing, not a congratulation.** The person now has the
 *   ability to read their neighbours' verbatim reports, and every time they do it
 *   is written to an audit trail with their name against it (domain rule 1).
 *   Saying so here is the last cheap moment to say it — after this it is a UI
 *   they are already using.
 * - **A rejection carries the reviewer's own words and an open door.** The note
 *   is required by `coordinatorRequestDecisionSchema` for this reason: "declined"
 *   with nothing after it tells the applicant nothing about whether to try again.
 *
 * The reviewer's note goes through `escapeHtml` like every other interpolation
 * here — it is free text written by one human about another.
 */

export type CoordinatorDecisionEmailInput = {
  fullName: string;
  villageName: string;
  approved: boolean;
  /** The reviewer's note. Always present on a rejection. */
  note?: string | null;
};

export function coordinatorDecisionEmail(
  input: CoordinatorDecisionEmailInput,
): EmailMessage {
  const firstName = input.fullName.trim().split(/\s+/)[0] || "there";

  return input.approved
    ? approved(firstName, input.villageName)
    : declined(firstName, input.villageName, input.note ?? null);
}

function approved(firstName: string, villageName: string): EmailMessage {
  const responsibilities = [
    "Every report filed in the village waits in your queue until you approve or reject it. Nothing reaches a resident's phone until you do.",
    "You can read the reporter's original wording, before the personal details were taken out. Each time you do, it is recorded in the audit trail with your name and the time against it.",
    "Approving a report sends a push notification to residents nearby, and — if your village has switched one on — posts a headline to a public WhatsApp Channel.",
  ];

  const text = [
    `Hello ${firstName},`,
    "",
    `Your application to coordinate ${villageName} has been approved. The`,
    "moderation dashboard is now open to you.",
    "",
    "What that means:",
    "",
    ...responsibilities.map((line) => `  * ${line}`),
    "",
    `Start here: ${appUrl("/dashboard")}`,
    "",
    "If any of that is not what you expected, say so before you approve your",
    "first report rather than after.",
    "",
    textFooter(),
  ].join("\n");

  const html = renderEmail({
    title: "You are now a village coordinator",
    preheader: `Your application to coordinate ${villageName} has been approved.`,
    body: [
      paragraph(`Hello ${firstName},`),
      paragraph(
        `Your application to coordinate ${villageName} has been approved. The moderation dashboard is now open to you.`,
      ),
      paragraph("What that means:"),
      list(responsibilities),
      button("Open the dashboard", appUrl("/dashboard")),
      note(
        "If any of that is not what you expected, say so before you approve your first report rather than after.",
      ),
    ].join("\n"),
    footer: `You are receiving this because you applied for coordinator access on ${APP_NAME}.`,
  });

  return {
    subject: `You are now a coordinator for ${villageName}`,
    text,
    html,
  };
}

function declined(
  firstName: string,
  villageName: string,
  reviewerNote: string | null,
): EmailMessage {
  const reason = reviewerNote ?? "No reason was recorded.";

  const text = [
    `Hello ${firstName},`,
    "",
    `Your application to coordinate ${villageName} was not approved.`,
    "",
    "The administrator who reviewed it said:",
    "",
    `  ${reason}`,
    "",
    "This does not affect your account in any other way — you can carry on",
    "filing reports and reading the village map exactly as before. If your",
    "circumstances change, or if you can answer the point above, you can apply",
    `again from your settings: ${appUrl("/settings")}`,
    "",
    textFooter(),
  ].join("\n");

  const html = renderEmail({
    title: "Your coordinator application",
    preheader: `Your application to coordinate ${villageName} was not approved.`,
    body: [
      paragraph(`Hello ${firstName},`),
      paragraph(
        `Your application to coordinate ${villageName} was not approved.`,
      ),
      paragraph("The administrator who reviewed it said:"),
      // Quoted rather than run into the paragraph above, so it is unmistakably
      // the reviewer speaking and not the product.
      list([reason]),
      paragraph(
        "This does not affect your account in any other way — you can carry on filing reports and reading the village map exactly as before.",
      ),
      paragraph(
        "If your circumstances change, or if you can answer the point above, you can apply again.",
      ),
      button("Apply again", appUrl("/settings")),
    ].join("\n"),
    footer: `You are receiving this because you applied for coordinator access on ${APP_NAME}.`,
  });

  return {
    subject: `Your coordinator application for ${villageName}`,
    text,
    html,
  };
}
