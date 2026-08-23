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

**Resend is used twice over, and only one of the two is configured here.**

- **In this app**, through `src/lib/email/send.ts`, which sends the emails
  VillageWatch itself renders — today the welcome that goes out when somebody
  joins a village. That half needs `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in
  the environment (`.env.example` documents both) and nothing in the Supabase
  dashboard. With no key it logs the message instead of sending it, which is the
  same supported state OneSignal and Slack have.
- **Inside Supabase**, as the SMTP sender for the auth emails Supabase mints
  itself — confirmation, magic link, email change and recovery. Only Supabase
  can mint those tokens, so it has to send them, and pointing it at Resend is
  what lifts the hourly quota this document exists for. That half is
  configuration on the Supabase project and adds no environment variable here.

**The two share a Resend account and nothing else.** One API key can serve both
— the app reads it from the environment and Supabase holds its own copy as an
SMTP password — and there is a case for two, so a leaked one can be rotated
without taking out the other. What follows is the Supabase half.

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

## 3. Paste the branded templates

Supabase's stock templates are grey, unbranded, and signed by a company no
resident has heard of. They are also the **most-read emails this service
sends** — a confirmation link is the first thing a new resident gets and the one
thing standing between them and their village. Until now the first email
VillageWatch ever sent somebody was the one that looked least like it.

The replacements live in `src/lib/email/supabase-templates/`, rendered through
the same shell as every other email in the product:

| File | Dashboard template | Subject |
| --- | --- | --- |
| `confirm-signup.html` | Confirm signup | Confirm your VillageWatch account |
| `magic-link.html` | Magic Link | Your VillageWatch sign-in link |
| `change-email.html` | Change Email Address | Confirm your new VillageWatch email address |
| `reset-password.html` | Reset Password | Reset your VillageWatch password |

**Supabase dashboard** → **Authentication** → **Emails** → **Templates**. For
each of the four:

1. Pick the template by the name in the middle column above.
2. Put the subject in **Subject heading**.
3. Open the matching `.html` file, select all, and paste it over everything in
   **Message body**. Replace the contents rather than appending — Supabase sends
   exactly what is in that box.
4. Save.

Three things worth knowing before you do:

- **`{{ .ConfirmationURL }}` must survive the paste.** It is Supabase's own
  placeholder for the action link and it is the whole point of every one of
  these emails. Each template carries it twice — once behind the button, once as
  visible text underneath, so a client that strips the button table still leaves
  something clickable. A template that loses it delivers a real email with a
  dead link, which is a failure that looks to the resident exactly like an
  address they mistyped.
- **No other Supabase variable is used**, on purpose. `{{ .Email }}`,
  `{{ .NewEmail }}` and `{{ .Token }}` render as an empty string where a project
  does not populate them, and a blank line where an address should be reads as
  broken. Add one only if you have checked it against your own project.
- **Do not edit the `.html` files by hand.** They are generated from
  `src/lib/email/supabase-templates/index.ts` by
  `npm run generate:supabase-templates`, and `tests/supabase-templates.test.ts`
  fails if a committed file and the module disagree. Change the wording in the
  module, regenerate, paste again.

The subject lines and the plain-text version of each message are in the same
module, so what a resident reads exists in a diff rather than only in a form
nobody can review.

---

## 4. Check it actually works

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

The wording of those emails is Supabase's own template, not `src/lib/email/`.
Only Supabase Auth can mint the tokens, so the text lives in the dashboard —
which is why section 3 above exists: the branded HTML in
`src/lib/email/supabase-templates/` is what should be in that form, so the
wording exists in a diff rather than only in a browser.

Both templates' redirect URLs must be on the allow list at
**Authentication → URL Configuration**, or the link in a delivered email
dead-ends. `SETUP.md` step 7b covers that list.

---

## 5. The cheapest mitigation of all

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
