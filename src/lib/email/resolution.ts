import { APP_NAME } from "@/lib/constants";
import {
  appUrl,
  button,
  list,
  paragraph,
  renderEmail,
  textFooter,
  type EmailMessage,
} from "@/lib/email/layout";

/**
 * What a reporter is told when a coordinator resolves their report.
 *
 * Sent by `emailReporterOfResolution` in `src/lib/notifications.ts`, beside the
 * push. Neither is the other's fallback — a phone with notifications denied is
 * common, and "what happened about the thing I reported?" is the one question a
 * resident is most likely to have stopped hoping anybody would answer.
 *
 * **To the reporter and nobody else**, so the title is theirs to read: it is the
 * report's public title, which the reporter wrote. What the email never carries
 * is the report's original wording, an address or coordinates — the input type
 * has no field for any of them, the guard `IncidentEmailInput` uses.
 *
 * The coordinator's note goes through `list()`, which escapes it like every
 * other interpolation here. It is free text written by one resident to be read
 * by another, and set apart from the surrounding paragraphs so it is plainly the
 * coordinator speaking rather than the product.
 */

export type ResolutionEmailInput = {
  fullName: string;
  villageName: string;
  incidentId: string;
  reference: string;
  title: string;
  /** The coordinator's resolution note. Always present — the action requires it. */
  note: string;
};

export function resolutionEmail(input: ResolutionEmailInput): EmailMessage {
  const firstName = input.fullName.trim().split(/\s+/)[0] || "there";
  const link = appUrl(`/incidents/${input.incidentId}`);
  const title = input.title.trim();
  const note = input.note.trim();

  const text = [
    `Hello ${firstName},`,
    "",
    `Your report ${input.reference} in ${input.villageName} has been resolved.`,
    "",
    `  ${title}`,
    "",
    "Your coordinator said:",
    "",
    `  ${note}`,
    "",
    `See the report: ${link}`,
    "",
    "Thank you for reporting it. If something like it happens again, report it",
    "again — a second report is how a pattern gets noticed.",
    "",
    textFooter(),
  ].join("\n");

  const html = renderEmail({
    title: "Your report has been resolved",
    preheader: `${input.reference} has been resolved — ${note}`,
    body: [
      paragraph(`Hello ${firstName},`),
      paragraph(
        `Your report ${input.reference} in ${input.villageName} has been resolved.`,
      ),
      list([title]),
      paragraph("Your coordinator said:"),
      list([note]),
      button("See the report", link),
      paragraph(
        "Thank you for reporting it. If something like it happens again, report it again — a second report is how a pattern gets noticed.",
      ),
    ].join("\n"),
    footer: `You are receiving this because you filed this report on ${APP_NAME}.`,
  });

  return {
    subject: `Resolved: ${input.reference}`,
    text,
    html,
  };
}
