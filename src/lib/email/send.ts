import { Resend } from "resend";
import { APP_HOST, APP_NAME } from "@/lib/constants";
import type { EmailMessage } from "@/lib/email/layout";
import { welcomeEmail } from "@/lib/email/welcome";

/**
 * The transport. **Server only** — `RESEND_API_KEY` has no `NEXT_PUBLIC_`
 * prefix and every caller is a route handler or a cron.
 *
 * This is the `send.ts` the header of `./index.ts` has promised since the
 * templates were written: the rendering stayed pure, the provider stayed an
 * open question, and every caller keeps handing the same
 * `{ subject, text, html }` objects across. Nothing about the four templates
 * changed to wire this in, which is the whole argument for having kept them
 * apart.
 *
 * ## The contract is `notifications.ts`'s, deliberately
 *
 * **Nothing throws, and nothing waits long.** A missing key, a refused sender,
 * a rate limit and a timeout are all ordinary states, and every one of them
 * resolves to a result the caller can ignore. Three things follow from that,
 * and each is a decision rather than a shortcut:
 *
 * 1. **A resident's registration must not fail because an email did.** The
 *    account exists, the profile row exists, they are in their village — a 500
 *    at that point would tell somebody their sign-up failed when it succeeded,
 *    and there is no way for them to tell the difference or retry safely.
 * 2. **With no key configured the message is logged instead**, the same state
 *    OneSignal and Slack have. That is what makes a fresh clone usable and what
 *    lets the wording be checked in development without a Resend account. The
 *    text part is logged rather than the HTML, because the text part *is* the
 *    message (see `./layout.ts`) and a table layout in a terminal is noise.
 * 3. **Callers `await` it**, which on Vercel is what fire-and-forget has to
 *    mean: the function instance is frozen when the response returns, so a
 *    detached promise is not "sent later", it is "sometimes never sent".
 *    Awaiting a call that cannot throw and cannot exceed
 *    {@link EMAIL_TIMEOUT_MS} buys delivery for a bounded cost. Same reasoning
 *    as `src/lib/slack.ts`, and the same shape.
 *
 * ## What this does not do
 *
 * **It does not send the auth emails.** Confirmation, magic link, email change
 * and password recovery are minted and sent by Supabase Auth, because only
 * Supabase can mint the token — see `./supabase-templates/`, which is the
 * wording for those, and `docs/SUPABASE_EMAIL_SETUP.md`, which is how to point
 * Supabase's own SMTP at Resend. Two independent uses of one Resend account,
 * and only one of them is this file.
 *
 * **It does not decide who to email.** `User.notifyEmail` is the resident's
 * preference and the audience rules live where the audience does — in
 * `notifications.ts` for a village broadcast, and at the call site for a
 * one-to-one email like the welcome. This module takes an address and a
 * message.
 */

const API_KEY = process.env.RESEND_API_KEY?.trim() ?? "";

/**
 * Who the email comes from.
 *
 * `RESEND_FROM_EMAIL` in the format Resend wants — `Name <address@domain>` —
 * falling back to a sender on the canonical host. The fallback is the real
 * domain rather than `localhost` for the reason "The canonical origin" gives:
 * an email is read on a machine that is not the one that rendered it, and a
 * sender nobody can reply to is better than one that is obviously wrong.
 *
 * The address has to be on a domain verified in Resend or every send is
 * refused. That is configuration rather than code, and
 * `docs/SUPABASE_EMAIL_SETUP.md` is where it is written down.
 */
const FROM =
  process.env.RESEND_FROM_EMAIL?.trim() || `${APP_NAME} <noreply@${APP_HOST}>`;

export const isEmailConfigured = API_KEY.length > 0;

if (!isEmailConfigured) {
  // One line at module load, so "no email arrived" can be told apart from "no
  // email was attempted" without reading every request's log.
  console.warn(
    "[email:config] RESEND_API_KEY is not set. Messages will be logged " +
      "instead of sent.",
  );
}

/**
 * How long to wait on Resend before giving up on a message.
 *
 * Five seconds, which is longer than the Slack webhook's three because this is
 * a message to a resident rather than a line in a staff channel, and short
 * enough that a registration does not visibly stall on it. The API normally
 * answers in a couple of hundred milliseconds.
 *
 * The race does not cancel the underlying request — the SDK exposes no signal
 * for it — so a message that times out here may still be delivered. That is the
 * right way round: a duplicate welcome email is a small annoyance, and a
 * registration hanging on somebody else's outage is not.
 */
const EMAIL_TIMEOUT_MS = 5_000;

let cached: Resend | null = null;

function client(): Resend {
  cached ??= new Resend(API_KEY);
  return cached;
}

export type EmailDispatchResult = {
  /** True when Resend accepted the message. False covers every other state. */
  sent: boolean;
  /** Resend's own id, for their dashboard's log. Absent unless `sent`. */
  id?: string;
  /** Why nothing was sent. Absent when it was. */
  skipped?: "not_configured" | "no_recipient" | "timeout" | "failed";
  /** The provider's wording, for the server log. Never shown to a resident. */
  error?: string;
};

/** A single address, or the honest absence of one. */
function firstAddress(to: string | readonly string[]): string | null {
  const list = typeof to === "string" ? [to] : to;
  return list.find((address) => address.trim().length > 0)?.trim() ?? null;
}

/**
 * Sends one rendered message to one or more addresses.
 *
 * Resolves either way. Check the result only if there is something useful to do
 * with it — the two registration paths log a failure and carry on, which is the
 * only sensible response to "the welcome email did not go".
 */
export async function sendEmail(input: {
  to: string | readonly string[];
  message: EmailMessage;
  /** Where a reply goes, if anywhere. Left unset the sender takes it. */
  replyTo?: string;
}): Promise<EmailDispatchResult> {
  const { message } = input;
  const to = typeof input.to === "string" ? input.to : [...input.to];

  if (!firstAddress(to)) {
    // Not an error worth alarming anybody about, and not a send either. It is
    // reachable through a profile row with a blank email, which the schema
    // permits as a string.
    console.warn("[email:no-recipient] %s", message.subject);
    return { sent: false, skipped: "no_recipient" };
  }

  if (!isEmailConfigured) {
    console.log(
      "[email:not-configured] to=%s subject=%s\n%s",
      Array.isArray(to) ? to.join(", ") : to,
      message.subject,
      message.text,
    );
    return { sent: false, skipped: "not_configured" };
  }

  try {
    /*
      Raced rather than cancelled. `Promise.race` against a timer is the only
      bound available — the SDK takes no `AbortSignal` — so a timed-out message
      may still arrive. See `EMAIL_TIMEOUT_MS` for why that is the right way
      round.

      `html` is spread conditionally: `welcomeEmail` is deliberately text-only
      (see its header), and Resend requires at least one of `html`, `text` or
      `react` rather than accepting an explicit `undefined` alongside `text`.
    */
    const result = await Promise.race([
      client().emails.send({
        from: FROM,
        to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      }),
      new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), EMAIL_TIMEOUT_MS),
      ),
    ]);

    if (result === "timeout") {
      console.warn(
        "Resend did not answer within %dms for %s",
        EMAIL_TIMEOUT_MS,
        message.subject,
      );
      return { sent: false, skipped: "timeout" };
    }

    if (result.error) {
      // The provider's wording goes to the log and no further — the same rule
      // `src/lib/auth-errors.ts` applies to Supabase's. An operator needs it to
      // tell an unverified sending domain from an exhausted plan; a resident
      // never sees this path at all.
      console.error(
        "Resend refused a message (%s): %s",
        message.subject,
        result.error.message,
      );
      return { sent: false, skipped: "failed", error: result.error.message };
    }

    return { sent: true, id: result.data?.id };
  } catch (cause) {
    // A network failure, a DNS failure, a malformed key. None of them is worth
    // failing a resident's request over.
    console.error("Could not send %s", message.subject, cause);
    return {
      sent: false,
      skipped: "failed",
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

/**
 * The welcome email, rendered and sent.
 *
 * Called by both registration paths — `POST /api/auth/register` for a password
 * sign-up and `POST /api/auth/complete-profile` for a provider one — because
 * both create a resident of a village, and an email that arrived for only one
 * of them would be a welcome that half the village never got.
 *
 * It is sent unconditionally rather than behind `User.notifyEmail`. That column
 * is a preference about *village news* — what gets reported nearby, and how
 * often — and it defaults to true on a row this call has just created, so
 * reading it here would be asking somebody whether they want the message
 * explaining how to change the setting. It is transactional: it goes once, at
 * the moment they join, and it names the three screens they need.
 */
export async function sendWelcomeEmail(input: {
  to: string;
  fullName: string;
  villageName: string;
}): Promise<EmailDispatchResult> {
  return sendEmail({
    to: input.to,
    message: welcomeEmail({
      fullName: input.fullName,
      villageName: input.villageName,
    }),
  });
}
