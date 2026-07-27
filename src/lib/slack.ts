/**
 * Operational alerts to a Slack channel.
 *
 * **Server only**, and deliberately the smallest thing that works: one webhook
 * URL, one function, a plain `fetch` POST. No SDK — the Slack SDK exists to
 * manage tokens, retries and the Web API, and an incoming webhook is a URL you
 * post JSON to.
 *
 * This is a **staff channel, not a product surface.** It tells the people
 * running the deployment that something happened; residents never see it and
 * nothing in the app depends on it. That distinction is what makes the
 * error handling below correct rather than lazy.
 *
 * ## Nothing throws, and nothing waits long
 *
 * Same contract as `notifications.ts` and `whatsapp-channel.ts`: an
 * unconfigured webhook, a timeout and a 500 from Slack all log and return. A
 * resident's registration must not fail because a staff channel was
 * unreachable, and a coordinator's Approve click must not hang on it.
 *
 * Callers `await` this rather than leaving a floating promise. That looks like
 * the opposite of fire-and-forget and is the same thing: on Vercel the function
 * instance is frozen the moment the response is returned, so a detached promise
 * is not "sent later", it is "sometimes never sent at all". Awaiting a call that
 * cannot throw and cannot take more than {@link SLACK_TIMEOUT_MS} buys delivery
 * for a bounded cost.
 *
 * ## What may go in a message
 *
 * Read this before adding a call site. Slack is a third party, outside the UK,
 * and a message is retained in a channel indefinitely and readable by everyone
 * in it. `/privacy` §6 names this disclosure, so what goes in these strings is
 * a claim that document makes.
 *
 * - **Never `Incident.rawDescription`.** Domain rule 1 does not stop at the
 *   village boundary, and the whole point of the anonymised `description` is
 *   that it is the version safe to move around.
 * - **Never coordinates.** `locationText` is the anonymised landmark and is the
 *   only location that belongs here.
 * - A resident's name and email do appear, on registration and on a coordinator
 *   application. Those are the two events where the staff running a deployment
 *   need to know who — and they are named in the privacy notice for it.
 */

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? "";

export const isSlackConfigured = WEBHOOK_URL.length > 0;

/**
 * How long to wait on Slack before giving up.
 *
 * Short, because a resident or a coordinator is usually waiting on the response
 * this call is holding up. Three seconds is generous for a webhook that
 * normally answers in tens of milliseconds, and unnoticeable when it does not.
 */
const SLACK_TIMEOUT_MS = 3_000;

/**
 * Posts one line to the configured Slack channel.
 *
 * Resolves either way — check the return value only if you have something
 * useful to do with it, which so far nobody does.
 */
export async function notifySlack(text: string): Promise<{ posted: boolean }> {
  if (!isSlackConfigured) {
    // Logged rather than dropped silently: on a deployment with no webhook this
    // is the only record that the event happened, and in development it is how
    // you check the wording without creating a Slack app.
    console.log("[slack:not-configured] %s", text);
    return { posted: false };
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `text` is the whole payload. Slack renders it with mrkdwn, which is why
      // the call sites use plain sentences and a leading emoji rather than
      // blocks — a block kit payload is a schema to maintain for a staff alert
      // nobody is going to click.
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(
        "Slack webhook rejected a message: %d %s",
        response.status,
        response.statusText,
      );
      return { posted: false };
    }

    return { posted: true };
  } catch (cause) {
    // Covers the timeout, DNS failure and a revoked webhook alike. None of them
    // is worth failing a resident's request over.
    console.warn("Could not post to Slack", cause);
    return { posted: false };
  }
}
