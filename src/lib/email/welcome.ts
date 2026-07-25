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
 *   repository, which is why the strings for it are exported below as constants
 *   to paste in rather than as a function to call. They use Go template syntax
 *   (`{{ .ConfirmationURL }}`) because that is what Supabase interpolates.
 *
 * - **`welcomeEmail()` is ours**, for after a resident has joined a village —
 *   the point at which there is actually something to welcome them to. Nothing
 *   calls it yet: email delivery is unimplemented (see "Not built yet" in
 *   CLAUDE.md), and `User.notifyEmail` is settable in the schema but not
 *   honoured by any dispatch.
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

/**
 * Supabase Auth email templates.
 *
 * Paste these into Supabase → Authentication → Emails. They are here so the
 * wording lives with the rest of the product's voice and shows up in a diff
 * when it changes — the dashboard is not version controlled and a template
 * edited there is a change nobody can review.
 *
 * Keep `{{ .ConfirmationURL }}` exactly as it is. Supabase interpolates it;
 * anything else in that position produces an email with a dead link.
 */
export const SUPABASE_EMAIL_TEMPLATES = {
  confirmSignup: {
    subject: `Confirm your ${APP_NAME} account`,
    body: [
      "Hello,",
      "",
      `Confirm your email address to finish setting up your ${APP_NAME} account:`,
      "",
      "{{ .ConfirmationURL }}",
      "",
      "The link is good for 24 hours. If you did not create an account, ignore",
      "this email — nothing will happen and the address will not be used again.",
    ].join("\n"),
  },

  resetPassword: {
    subject: `Reset your ${APP_NAME} password`,
    body: [
      "Hello,",
      "",
      "Somebody asked to reset the password on this address. If it was you:",
      "",
      "{{ .ConfirmationURL }}",
      "",
      "The link is good for one hour and can be used once.",
      "",
      "If it was not you, ignore this email. Your password has not changed and",
      "nobody has been signed in.",
    ].join("\n"),
  },

  magicLink: {
    subject: `Your ${APP_NAME} sign-in link`,
    body: [
      "Hello,",
      "",
      `Here is your link to sign in to ${APP_NAME}:`,
      "",
      "{{ .ConfirmationURL }}",
      "",
      "It is good for one hour and can be used once. If you did not ask to sign",
      "in, ignore this email.",
    ].join("\n"),
  },
} as const;
