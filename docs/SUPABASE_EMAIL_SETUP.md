# Auth email: the rate limit, and the SMTP sender that lifts it

What to do in the Supabase dashboard so residents stop being told there is
something wrong with their details when what has actually happened is that the
deployment has run out of email for the hour.

This document is read by a person and rendered by nothing. Unlike the four
documents the compliance gate renders, it needs **no** entry in
`outputFileTracingIncludes` in `next.config.ts` — nothing imports it and no
route serves it, so it can sit here and be edited freely.

---

## What residents were seeing

A red popup on `/register` reading, in full:

> email rate limit exceeded

That is Supabase Auth's own wording for an exhausted hourly mail quota, and it
used to be passed straight through by `POST /api/auth/register`. Two things were
wrong with it. It names an internal quota that a resident has no part in and can
do nothing about; and arriving on a form they have just filled in, it reads as a
fault in what they typed — so the only action that works, waiting a few minutes,
is the one thing it does not suggest.

**The application side is fixed.** `src/lib/auth-errors.ts` now stands in front
of every Supabase auth failure, and no provider message reaches a resident from
any auth flow. A rate limit becomes "Too many sign-ups right now. Please try
again in a few minutes", the button holds itself for as long as the server asked
for, and the exact provider wording goes to the server log where an operator can
read it.

**The dashboard side is this document**, and it is the half that stops the limit
being hit at all. Nothing below is in the repository or in an environment
variable — all of it is configuration on the Supabase project, and it survives
deploys because it has nothing to do with them.

---

## 1. Raise the hourly email limit

**Supabase dashboard** → your project → **Authentication** → **Rate Limits** →
*Rate limit for sending emails*.

Read the current figure off the screen rather than trusting a number written
here — Supabase has changed the default for new projects more than once, and it
is low: the built-in mailer is documented as being for development, not for a
service with real users. Every confirmation, every password reset and every
magic link counts against it.

Raising it here is worth doing **and is not the fix on its own**. While the
project is on Supabase's built-in mailer the ceiling stays low whatever the box
says, because the mail is going out over shared infrastructure Supabase is
rate-limiting on purpose. Step 2 is what actually lifts it.

While you are on this screen, note that there is a separate per-address limit —
the "you can only request this after 60 seconds" one. That is not the limit
behind this document, and it should be left alone: it is what stops one address
being used to send somebody else a stream of password-reset emails.

---

## 2. Configure Resend as the custom SMTP sender

**Resend is not currently used anywhere in this codebase.** `src/lib/email/`
renders four templates — welcome, weekly digest, incident notification,
coordinator decision — and has no transport behind it; nothing sends them.
Notifications that do go out go through OneSignal as push, not as email. So what
follows configures Resend **inside Supabase**, as the sender for the auth emails
Supabase mints itself (confirmation, recovery, magic link), and it adds no
dependency and no environment variable to this app.

### First, in Resend

1. <https://resend.com> → **Domains** → add `villagewatch.app` and complete the
   DNS records it asks for (SPF, DKIM, and the return-path record). A sender on
   an unverified domain is refused, so this has to finish before step 3.
2. **API Keys** → create one with **Sending access**. Copy it — `re_…` — it is
   shown once.

### Then, in Supabase

**Authentication** → **Emails** → **SMTP Settings** (on older projects this sits
under Project Settings → Authentication). Enable *Custom SMTP* and fill in:

| Field | Value |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key — the whole `re_…` string |
| Sender email | an address on the domain verified above, e.g. `noreply@villagewatch.app` |
| Sender name | `VillageWatch` |

Three things that catch people out:

- **The username is the literal word `resend`.** Not your email address, not the
  API key, not the domain. The key goes in the password field and only there.
- **Port 465 is implicit TLS.** If the project rejects it, `587` is the STARTTLS
  alternative and Resend serves both; `2465` and `2587` exist for hosts that
  block the standard pair. Do not use port 25.
- **The API key is a credential and belongs in nothing but that field.** It is
  not `SUPABASE_SERVICE_ROLE_KEY`-grade — it can send mail, not read residents'
  data — but it can send mail *as the village's domain*, which is a phishing
  primitive. It goes in the Supabase dashboard, never in `.env.example`, never
  in a commit.

Once custom SMTP is on, go back to **Authentication → Rate Limits** and set the
email limit to something a village-sized sign-up wave will not exhaust. The
limit is now yours rather than Supabase's, and it is bounded by the Resend plan
rather than by the shared mailer.

---

## 3. Check it actually works

The failure mode here is silent — a misconfigured sender does not error on
screen, it just means no email arrives, which looks exactly like a resident
mistyping their address.

1. Register a real address on `/register` and confirm the mail arrives.
2. Look at the message's headers: the sending domain should be yours, not
   `supabase.io`.
3. Resend → **Logs** shows every attempt with its result, which is the fastest
   way to tell "Supabase never tried" apart from "the recipient bounced".
4. `/forgot-password` exercises the second template. It deliberately shows the
   same "check your email" panel whether or not the address has an account (see
   `ForgotPasswordForm` — that is an account-enumeration guard, not a bug), so
   Resend's log is where you confirm the mail went.

The wording of the confirmation and recovery emails is Supabase's own template,
not `src/lib/email/`. Only Supabase Auth can mint those tokens, so the text
lives in the dashboard; `SUPABASE_EMAIL_TEMPLATES` in `src/lib/constants.ts`
holds the copy to paste in, so it exists in a diff rather than only in a form.

Both templates' redirect URLs must be on the allow list at
**Authentication → URL Configuration**, or the link in a delivered email
dead-ends. `SETUP.md` step 7b covers that list.

---

## 4. The cheapest mitigation of all

Turning on Google sign-in takes email out of the sign-up path entirely — Google
returns an address it has already verified, so nothing is sent and nothing is
counted. It is optional and off by default; `SETUP.md` step 7b is the whole
procedure, and `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` is the switch.

For a village onboarding twenty households in one evening — which is exactly the
shape of traffic that exhausts an hourly quota — that is the difference between
twenty emails and none.

---

## What the application does when the limit is hit anyway

Because it still will be, on the evening a coordinator hands out a hundred
flyers.

- Every auth flow — sign-up, sign-in, password reset request, password change,
  and the OAuth return leg — goes through `describeAuthError` in
  `src/lib/auth-errors.ts`. It never returns Supabase's wording.
- A rate-limited response is a **429** carrying `Retry-After`, so the browser
  can tell it apart from a bad password without reading the sentence.
- The form holds its own submit button for that long and counts down on the
  button's label. A toast is gone in seconds; the wait is minutes, and the
  countdown is what is still on screen when somebody comes back to try again.
- Every auth form takes a synchronous lock before submitting, so the
  double-click that used to send two emails now sends one.
- `/forgot-password` is the exception and is deliberately different: it shows
  the rate-limit notice **only** for the deployment-wide quota, which is the
  same answer for every address and therefore discloses nothing. The
  per-address limit stays swallowed into the neutral "check your email" panel,
  because surfacing it would say that an account exists.
- The provider's exact message is logged server-side on every one of these. That
  is where to look to tell an exhausted quota apart from a sender Resend is
  refusing.

`tests/auth-errors.test.ts` pins the parts of that worth pinning: that no
provider message escapes, that a rate limit is recognised whether it arrives as
a status, a code or a sentence, and that the deployment-wide quota is
distinguishable from the per-address one.
