/**
 * Email. **Server only** — every module here reads `NEXT_PUBLIC_APP_URL`, the
 * transport reads `RESEND_API_KEY`, and the templates render text meant for one
 * named recipient.
 *
 * Two halves, kept apart on purpose:
 *
 * - **The templates** are pure functions from typed data to
 *   `{ subject, text, html }`. That is the half worth writing before a provider
 *   has been chosen — the wording, the escaping and the decision about what is
 *   safe to put in an inbox do not change with the transport, and none of them
 *   changed when one was finally wired in.
 * - **`send.ts`** is that transport, over Resend. It takes an address and one
 *   of these objects, never throws, and logs the message instead when
 *   `RESEND_API_KEY` is unset. `sendBulkEmail` beside it fans a message out to
 *   an audience as one message *per recipient* — never one message addressed to
 *   the village, which would disclose the membership list to everybody on it.
 *
 * All four templates have a caller now. The welcome goes on both registration
 * paths; the incident alert and the weekly digest are dispatched from
 * `src/lib/notifications.ts`, which owns the audience rules for both channels;
 * the coordinator decision goes from `src/lib/coordinator-requests.ts` beside
 * the push.
 *
 * `supabase-templates/` is neither: those four are sent by Supabase Auth, which
 * is the only thing that can mint their tokens, so what lives there is HTML to
 * paste into a dashboard rather than a function anything calls.
 */

export type { EmailMessage } from "@/lib/email/layout";

export { welcomeEmail } from "@/lib/email/welcome";

export {
  isEmailConfigured,
  sendBulkEmail,
  sendCoordinatorDecisionEmail,
  sendEmail,
  sendWelcomeEmail,
  type BulkEmailDispatchResult,
  type BulkEmailRecipient,
  type EmailDispatchResult,
} from "@/lib/email/send";

export {
  SUPABASE_AUTH_TEMPLATES,
  SUPABASE_AUTH_TEMPLATE_LIST,
  SUPABASE_CONFIRMATION_URL_TOKEN,
  type SupabaseAuthTemplate,
} from "@/lib/email/supabase-templates";

export {
  weeklyDigestEmail,
  type WeeklyDigestEmailInput,
} from "@/lib/email/weekly-digest";

export {
  incidentNotificationEmail,
  type IncidentEmailInput,
} from "@/lib/email/incident-notification";

export {
  coordinatorDecisionEmail,
  type CoordinatorDecisionEmailInput,
} from "@/lib/email/coordinator-decision";
