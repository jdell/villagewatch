import { APP_NAME } from "@/lib/constants";
import {
  appUrl,
  button,
  heading,
  list,
  paragraph,
  renderEmail,
  textFooter,
  type EmailMessage,
} from "@/lib/email/layout";

/**
 * The welcome email — the first thing this codebase has ever put in an inbox
 * itself.
 *
 * ## Where this gets sent from, and what it is not
 *
 * Two different emails arrive around registration, and it matters which is
 * which:
 *
 * - **Sign-up confirmation is Supabase's.** It has to be — it carries the
 *   confirmation token, and only Supabase Auth can mint one. That template
 *   lives in the Supabase dashboard (Authentication → Emails), not here. The
 *   wording and the branded HTML to paste into it are in
 *   `./supabase-templates/`.
 *
 * - **`welcomeEmail()` is ours**, for after a resident has joined a village —
 *   the point at which there is actually something to welcome them to. It is
 *   sent by `./send.ts` on both registration paths.
 *
 * ## It is branded now, and it used to argue against being
 *
 * This module was deliberately text-only, and the reasoning it carried was
 * that six sentences in a table with a header bar read as marketing, which is
 * the thing people do not read. That was a fair account of the shell as it
 * stood — a coloured bar with a word in it — and it left one consequence
 * nobody had weighed: the welcome was the only email VillageWatch sent that
 * did not look like VillageWatch. A resident who had just confirmed their
 * address through a branded email received an unbranded one immediately
 * afterwards, from a service they had heard of for the first time that week.
 * That reads as a different sender, and a different sender is what a person is
 * taught to be careful about.
 *
 * **What the old reasoning was protecting survives intact**, because the text
 * part is unchanged and is still the message. The HTML adds a shell, a mark and
 * one button around exactly the same six sentences; it does not add a headline,
 * a photograph or a call to action that was not already there. A client with
 * images or HTML off shows the version this file has always sent.
 *
 * ## One claim in here is qualified, and has to be
 *
 * "Your coordinator reviews every report" was written before
 * `Village.autoApprove` existed and is false for any village that has switched
 * review off. `/privacy` was rewritten for exactly this and says the choice is
 * the village's; this says the same, in one word, rather than repeating a
 * promise the code stopped keeping.
 */

export function welcomeEmail(input: {
  fullName: string;
  villageName: string;
}): EmailMessage {
  const firstName = input.fullName.trim().split(/\s+/)[0] || "there";

  /**
   * The three next steps.
   *
   * Only the first is a button — the shell allows one, and an email with three
   * is an email where nobody presses any of them. The third needs no link at
   * all: "Notification settings" is already in the footer of every branded
   * email, which is where somebody coming back to this a fortnight later will
   * look for it.
   */
  const steps = [
    "Look at the map, and see what has already been reported near you.",
    "File your first report. It takes about a minute, and you write it in your own words.",
    "Choose what you hear about, and how close to you it has to be, in your notification settings.",
  ];

  const text = [
    `Hello ${firstName},`,
    "",
    `You have joined ${input.villageName} on ${APP_NAME}. Here is what that means.`,
    "",
    "When you report something, you write it in your own words. Before anyone",
    "else sees it, the personal details are taken out — names, registrations,",
    "house numbers — and your location is blurred by about a hundred metres.",
    "Faces in photographs are blurred on your phone, before the picture is",
    "uploaded. By default your coordinator reviews every report before it goes",
    "on the map, and the screen tells you if your village has turned that off.",
    "",
    "Three things worth doing now:",
    "",
    `  1. Look at the map          ${appUrl("/map")}`,
    `  2. File your first report   ${appUrl("/incidents/new")}`,
    `  3. Choose what you hear about, and how close  ${appUrl("/settings")}`,
    "",
    "You can change your notification settings or delete your account at any",
    "time. If something is happening now and someone is in danger, call 999 —",
    `${APP_NAME} is not an emergency service and nobody is watching it around`,
    "the clock.",
    "",
    textFooter(),
  ].join("\n");

  const html = renderEmail({
    title: `Welcome to ${input.villageName}`,
    preheader: `What happens to what you report, and three things worth doing now.`,
    body: [
      paragraph(`Hello ${firstName},`),
      paragraph(
        `You have joined ${input.villageName} on ${APP_NAME}. Here is what that means.`,
      ),
      paragraph(
        "When you report something, you write it in your own words. Before " +
          "anyone else sees it, the personal details are taken out — names, " +
          "registrations, house numbers — and your location is blurred by about " +
          "a hundred metres. Faces in photographs are blurred on your phone, " +
          "before the picture is uploaded. By default your coordinator reviews " +
          "every report before it goes on the map, and the screen tells you if " +
          "your village has turned that off.",
      ),
      heading("Three things worth doing now"),
      list(steps),
      button("Open the map", appUrl("/map")),
      paragraph(
        "You can change what you hear about, or delete your account, at any " +
          "time. If something is happening now and someone is in danger, call " +
          `999 — ${APP_NAME} is not an emergency service and nobody is watching ` +
          "it around the clock.",
      ),
    ].join("\n"),
    footer: `You are receiving this because you have just joined ${input.villageName} on ${APP_NAME}.`,
  });

  return {
    subject: `Welcome to ${input.villageName} on ${APP_NAME}`,
    text,
    html,
  };
}
