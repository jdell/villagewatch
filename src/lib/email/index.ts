/**
 * Email templates. **Server only** — every module here reads
 * `NEXT_PUBLIC_APP_URL` and renders text meant for one named recipient.
 *
 * There is no mailer behind these. Each export is a pure function from typed
 * data to `{ subject, text, html }`, which is the half worth writing before a
 * provider has been chosen: the wording, the escaping and the decision about
 * what is safe to put in an inbox do not change whether the transport ends up
 * being Resend, Postmark or Supabase SMTP.
 *
 * When one is wired in, it goes in a `send.ts` alongside these and every caller
 * keeps handing it the same objects.
 */

export type { EmailMessage } from "@/lib/email/layout";

export { welcomeEmail, SUPABASE_EMAIL_TEMPLATES } from "@/lib/email/welcome";

export {
  weeklyDigestEmail,
  type WeeklyDigestEmailInput,
} from "@/lib/email/weekly-digest";

export {
  incidentNotificationEmail,
  type IncidentEmailInput,
} from "@/lib/email/incident-notification";
