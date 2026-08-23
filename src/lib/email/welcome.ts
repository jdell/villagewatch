import { APP_NAME } from "@/lib/constants";
import { appUrl, textFooter, type EmailMessage } from "@/lib/email/layout";

/**
 * The welcome email, and the Supabase templates that go with it.
 *
 * **Plain text on purpose.** The first email VillageWatch sends a resident is
 * the one most likely to be read on a phone, in a village hall, by someone who
 * signed up because a neighbour told them to. It is six sentences and three
 * links; wrapping that in a branded table would make it look like marketing,
 * which is exactly the thing people do not read.
 *
 * ## Where this actually gets sent from
 *
 * Two different places, and it matters which:
 *
 * - **Sign-up confirmation is Supabase's.** It has to be — it carries the
 *   confirmation token, and only Supabase Auth can mint one. That template
 *   lives in the Supabase dashboard (Authentication → Emails), not in this
 *   repository. The wording and the branded HTML to paste into it are in
 *   `./supabase-templates/`, which used to be a block of plain-text constants
 *   at the foot of this file.
 *
 * - **`welcomeEmail()` is ours**, for after a resident has joined a village —
 *   the point at which there is actually something to welcome them to. It is
 *   sent by `./send.ts` on both registration paths, which is what makes it the
 *   first thing this codebase has ever put in an inbox itself.
 *
 * ## Plain text, and it stays plain text
 *
 * This one is deliberately not rendered through `renderEmail`. The branded
 * shell is right for an alert somebody skims and for the auth emails, which
 * carry a button that has to be found; it is wrong here. Six sentences in a
 * table with a header bar reads as marketing, and the thing being said — here
 * is what happens to what you report — is the thing a resident most needs to
 * actually read.
 */

export function welcomeEmail(input: {
  fullName: string;
  villageName: string;
}): EmailMessage {
  const firstName = input.fullName.trim().split(/\s+/)[0] || "there";

  const text = [
    `Hello ${firstName},`,
    "",
    `You have joined ${input.villageName} on ${APP_NAME}. Here is what that means.`,
    "",
    "When you report something, you write it in your own words. Before anyone",
    "else sees it, the personal details are taken out — names, registrations,",
    "house numbers — and your location is blurred by about a hundred metres.",
    "Faces in photographs are blurred on your phone, before the picture is",
    "uploaded. Your coordinator reviews every report before it goes on the map.",
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

  return {
    subject: `Welcome to ${input.villageName} on ${APP_NAME}`,
    text,
  };
}
