import { APP_NAME } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import {
  appUrl,
  button,
  escapeHtml,
  note,
  paragraph,
  renderEmail,
  type EmailMessage,
} from "@/lib/email/layout";

/**
 * The community safety report, as a scheduled email to the village's police
 * contact.
 *
 * Sent by `sendVillagePoliceReport` in `src/lib/police-report-schedule.ts`,
 * on the schedule a coordinator set on Village settings, or when they press
 * "Send now". **The body is the report itself** — the same text
 * `formatCommunityReport` produces for the clipboard and the share sheet — so
 * an officer reading it on a phone has the whole document without opening an
 * attachment or signing in to anything. There is no attachment: the PDF route
 * needs a coordinator's session, so the link to it is labelled for the
 * coordinator rather than offered to the recipient as if it would open.
 *
 * **Nothing in it is new.** The text is built from published, anonymised
 * reports only — `ReportIncident` has no field for `rawDescription` or
 * coordinates — and is exactly what a coordinator already sends by hand.
 *
 * The recipient is not a resident, which shapes two things: the footer links
 * are Privacy and Terms rather than "Notification settings" (a sign-in wall to
 * somebody with no account), and the way to stop receiving these is the
 * coordinator, which the email says.
 */

export type PoliceReportEmailInput = {
  villageName: string;
  /** The report as `formatCommunityReport` renders it. */
  reportText: string;
  from: Date;
  to: Date;
  /** Whole days covered — for the coordinator's PDF link. */
  days: number;
  /** "weekly" etc., or null for a one-off "Send now". */
  schedule: string | null;
};

/** "1 September 2026 – 30 September 2026", for the subject line. */
function periodLabel(from: Date, to: Date): string {
  return `${formatDate(from)} – ${formatDate(to)}`;
}

/**
 * The report text as HTML: escaped, then kept in its own lines and spacing.
 * `white-space: pre-wrap` rather than `<pre>` alone, so a long line wraps on a
 * phone instead of scrolling sideways; a monospace face because the text aligns
 * its labels with spaces.
 */
function preformatted(text: string): string {
  return `<div style="margin:0 0 20px;padding:16px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.55;color:#0f172a;white-space:pre-wrap;word-break:break-word;">${escapeHtml(text)}</div>`;
}

export function policeReportEmail(input: PoliceReportEmailInput): EmailMessage {
  const period = periodLabel(input.from, input.to);
  const pdfLink = appUrl(`/reports?days=${input.days}`);
  const how = input.schedule
    ? `It is sent ${input.schedule} on a schedule the village's coordinator set up.`
    : "It was sent by the village's coordinator.";

  const subject = `${APP_NAME} Community Safety Report — ${input.villageName} — ${period}`;

  const text = [
    `This is the community safety report for ${input.villageName}, covering ${period}. ${how}`,
    "",
    input.reportText,
    "",
    `For the village coordinator — the same report as a PDF: ${pdfLink}`,
    "",
    `To stop receiving these, or to have them sent to a different address, ask the coordinator who set this up.`,
  ].join("\n");

  const html = renderEmail({
    title: `Community safety report — ${input.villageName}`,
    preheader: `${input.villageName}, ${period}`,
    body: [
      paragraph(
        `This is the community safety report for ${input.villageName}, covering ${period}. ${how}`,
      ),
      preformatted(input.reportText),
      button("Coordinator: download as PDF", pdfLink),
      note(
        "The PDF link needs a coordinator's sign-in. Everything in the report is in this email.",
      ),
    ].join("\n"),
    footer:
      "You are receiving this because a village coordinator entered this address as their police contact. To stop receiving it, ask them to change or remove it.",
    links: [
      { label: "Privacy", path: "/privacy" },
      { label: "Terms", path: "/terms" },
    ],
  });

  return { subject, text, html };
}
