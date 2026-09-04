import { APP_NAME } from "@/lib/constants";
import {
  button,
  escapeHtml,
  note,
  paragraph,
  renderEmail,
  textFooter,
} from "@/lib/email/layout";

/**
 * The six emails Supabase Auth sends, in VillageWatch's own clothes.
 *
 * **Nothing in this repository sends these**, and nothing can. Confirmation,
 * invitation, magic link, email change, password recovery and reauthentication
 * all carry a token, and only Supabase Auth can mint one — so the wording lives
 * in the Supabase dashboard, at Authentication → Emails → Templates, which is a
 * form rather than a file.
 *
 * **Two of the six have no caller on this deployment today**, and are here
 * anyway. Nothing invites a user through Supabase — a resident registers with a
 * join code, and `/invite/[slug]` is a printed sheet rather than an email — and
 * nothing calls `reauthenticate()`. Both are buttons somebody can press in the
 * dashboard, or settings somebody can turn on, and the failure mode of leaving
 * them is a stock grey Supabase email going out under this service's name with
 * nobody having decided that it should. The `otp` and `resend` entries in
 * `auth-errors.ts` are in the codebase for the same reason.
 *
 * That is the problem this directory exists for. A template edited in a
 * dashboard is a change nobody can review, nobody can diff and nobody finds
 * again six months later; and until now the four most-read emails the service
 * sends were Supabase's stock ones — grey, unbranded, and signed by a company
 * no resident has heard of. The first email a village ever receives from
 * VillageWatch was the one that looked least like it.
 *
 * ## How this is meant to be used
 *
 * The `.html` files beside this module are the artefact: open one, select all,
 * paste it into the matching template in the dashboard, and copy `subject` into
 * the subject field. `docs/SUPABASE_EMAIL_SETUP.md` §5 is the procedure.
 *
 * **The files are generated, not hand-edited.** They are written by
 * `scripts/generate-supabase-templates.ts` from the constants below, and
 * `tests/supabase-templates.test.ts` fails if a committed file and the module
 * disagree. Editing the HTML directly would produce exactly the state this
 * directory exists to prevent — wording that exists in one place, drifts from
 * the product's voice, and cannot be found from the code.
 *
 * ## Go template syntax, and the one string that must survive
 *
 * Supabase interpolates these with Go's `text/template`. `{{ .ConfirmationURL }}`
 * is the action link and it is the whole point of five of these six emails —
 * anything else in that position produces a delivered email with a dead link,
 * which fails silently and looks to the resident exactly like an address they
 * mistyped. Those five carry it twice: once behind the button, and once as
 * visible text underneath, because a client that strips the button table (and
 * Outlook's Word engine does surprising things to nested tables) must still
 * leave something clickable.
 *
 * `escapeHtml` leaves it alone — there is no `&`, `<`, `>`, `"` or `'` in it —
 * and the test asserts the literal string is present rather than trusting that.
 *
 * **Reauthentication is the sixth and is not a link at all.** Supabase sends a
 * six-digit code there and populates `{{ .Token }}` rather than
 * `{{ .ConfirmationURL }}`, so that template carries the code and no button —
 * one pointing nowhere would be worse than none.
 *
 * Supabase also offers `{{ .Email }}`, `{{ .NewEmail }}` and `{{ .SiteURL }}`.
 * **None of those is used here**, deliberately: a variable a project's Supabase
 * version does not populate renders as an empty string, and an email with a
 * blank line where an address should be reads as broken to the one person who
 * cannot tell whether it is. `{{ .Token }}` is the exception that proves the
 * rule rather than a hole in it — Supabase always populates it for the one
 * template that uses it, so the blank cannot occur, and omitting it would leave
 * a resident told to type a code the email does not contain. The
 * change-of-address template is still worded so it is true of both copies
 * Supabase sends — the old address and the new one — rather than naming
 * either.
 *
 * ## Why the HTML looks like 2004
 *
 * Same reason the rest of `src/lib/email/` does, and these are rendered by the
 * same `renderEmail` shell: one table, inline styles, no external stylesheet,
 * no web font, no image. See the header of `../layout.ts`.
 */

/** Supabase's own template variable for the action link. Never interpolate. */
const CONFIRMATION_URL = "{{ .ConfirmationURL }}";

/**
 * The link as visible, selectable text under the button.
 *
 * Rendered rather than the resolved URL because there is no resolved URL — the
 * value only exists once Supabase has interpolated it. So this deliberately
 * emits `{{ .ConfirmationURL }}` in both the `href` and the link text, and
 * Supabase fills in both.
 *
 * `word-break: break-all` because a Supabase action link is long enough to run
 * off a phone screen, and a link that overflows its container is one a resident
 * cannot select the end of.
 */
function fallbackLink(): string {
  return `<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#475569;">
    If the button does not work, copy this link into your browser:<br>
    <a href="${CONFIRMATION_URL}" style="color:#0f2557;word-break:break-all;">${CONFIRMATION_URL}</a>
  </p>`;
}

/**
 * Supabase's variable for the six-digit reauthentication code.
 *
 * The **one** exception to "no other Supabase variable", and it is not a
 * loosening of that rule so much as the rule's own reasoning applied to a
 * different email. The objection to `{{ .Email }}` and friends is that a
 * project which does not populate them renders a blank where a fact should be.
 * Supabase always populates this one for the reauthentication template — it is
 * the entire content of that email — so the failure mode the rule guards
 * against cannot occur, and refusing to use it would leave the resident with an
 * email telling them to enter a code that is not in it.
 *
 * `{{ .ConfirmationURL }}` is the opposite: Supabase does **not** populate it
 * for reauthentication, because there is no link to follow. A button there
 * would go nowhere.
 */
const TOKEN = "{{ .Token }}";

/**
 * The code, set out to be read off a screen and typed into another one.
 *
 * Monospaced and widely letter-spaced because that is what makes a six-digit
 * code transcribable — a proportional font at body size turns `1`, `l` and `7`
 * into a guess. Centred and large for the same reason: this is the whole
 * message, and somebody is reading it on a phone with the other screen already
 * open in front of them.
 *
 * A table rather than a `div`, like everything else in these emails: Outlook's
 * Word engine ignores `padding` on a block element and this needs its box.
 */
function code(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
      <tr>
        <td align="center" style="padding:20px 16px;background-color:#f1f5f9;border-radius:8px;">
          <div style="font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#0f2557;">${TOKEN}</div>
        </td>
      </tr>
    </table>`;
}

/**
 * The footer links on an auth email.
 *
 * Not the default three. The reader of one of these has not signed in — and for
 * the confirmation email, cannot — so "Notification settings" is a link to a
 * sign-in wall offered to the one person it will not let through.
 */
const AUTH_LINKS = [
  { label: "Privacy", path: "/privacy" },
  { label: "Terms", path: "/terms" },
] as const;

/** The footer line, in place of the "you are a member of a village" default. */
const AUTH_FOOTER = `This email was sent by ${APP_NAME} because somebody used this address to sign up or sign in.`;

type SupabaseTemplateId =
  | "confirmSignup"
  | "inviteUser"
  | "magicLink"
  | "changeEmail"
  | "resetPassword"
  | "reauthentication";

export type SupabaseAuthTemplate = {
  id: SupabaseTemplateId;
  /**
   * What the template is called in the Supabase dashboard, exactly.
   *
   * Copied from the tabs on Authentication → Emails → Templates, so that
   * pasting is a matter of matching a name rather than guessing which of four
   * near-identical emails a file is for.
   */
  dashboardName: string;
  /** Goes in the dashboard's Subject heading field. */
  subject: string;
  /** The file beside this module holding `html`, for copy and paste. */
  filename: string;
  /** Goes in the dashboard's Message body field. */
  html: string;
  /**
   * The same message as text.
   *
   * Supabase's template editor takes one body and sends it as HTML, so this is
   * not delivered — it is the plain-English record of what each email says,
   * kept for the same reason every other template in this directory ships a
   * text part: the wording is the message, and it should be readable in a diff
   * without parsing a table layout.
   */
  text: string;
};

function template(input: {
  id: SupabaseTemplateId;
  dashboardName: string;
  subject: string;
  filename: string;
  title: string;
  preheader: string;
  /** Sentences before the button. */
  lead: readonly string[];
  action: string;
  /** Sentences after the link, usually the "if this was not you" line. */
  tail: readonly string[];
  /** The text part, which is written out rather than derived from the HTML. */
  text: readonly string[];
}): SupabaseAuthTemplate {
  return {
    id: input.id,
    dashboardName: input.dashboardName,
    subject: input.subject,
    filename: input.filename,
    html: renderEmail({
      title: input.title,
      preheader: input.preheader,
      footer: AUTH_FOOTER,
      links: AUTH_LINKS,
      body: [
        ...input.lead.map(paragraph),
        button(input.action, CONFIRMATION_URL),
        fallbackLink(),
        ...input.tail.map(note),
      ].join("\n            "),
    }),
    text: [...input.text, "", textFooter()].join("\n"),
  };
}

/**
 * The one template whose action is a code rather than a link.
 *
 * A separate builder rather than a flag on `template()`, because almost nothing
 * is shared: no button, no fallback link, no `{{ .ConfirmationURL }}`, and the
 * whole body is one block that has to be transcribable. A boolean threaded
 * through the other one would make every branch of it read "unless this is the
 * reauthentication email".
 */
function codeTemplate(input: {
  id: SupabaseTemplateId;
  dashboardName: string;
  subject: string;
  filename: string;
  title: string;
  preheader: string;
  lead: readonly string[];
  tail: readonly string[];
  text: readonly string[];
}): SupabaseAuthTemplate {
  return {
    id: input.id,
    dashboardName: input.dashboardName,
    subject: input.subject,
    filename: input.filename,
    html: renderEmail({
      title: input.title,
      preheader: input.preheader,
      footer: AUTH_FOOTER,
      links: AUTH_LINKS,
      body: [
        ...input.lead.map(paragraph),
        code(),
        ...input.tail.map(note),
      ].join("\n            "),
    }),
    text: [...input.text, "", textFooter()].join("\n"),
  };
}

/**
 * The six templates, keyed by the thing they are for.
 *
 * Ordered the way the dashboard orders its tabs, so working down this file and
 * working across that screen are the same pass.
 */
export const SUPABASE_AUTH_TEMPLATES = {
  confirmSignup: template({
    id: "confirmSignup",
    dashboardName: "Confirm signup",
    subject: `Confirm your ${APP_NAME} account`,
    filename: "confirm-signup.html",
    title: "Confirm your email address",
    preheader: `One tap finishes setting up your ${APP_NAME} account.`,
    lead: [
      `Somebody used this address to create a ${APP_NAME} account for their village. If that was you, confirm the address to finish setting it up.`,
    ],
    action: "Confirm my email address",
    tail: [
      "The link is good for 24 hours and can be used once.",
      "If you did not create an account, ignore this email. Nothing has been set up and this address will not be used again.",
    ],
    text: [
      "Hello,",
      "",
      `Confirm your email address to finish setting up your ${APP_NAME} account:`,
      "",
      CONFIRMATION_URL,
      "",
      "The link is good for 24 hours. If you did not create an account, ignore",
      "this email — nothing will happen and the address will not be used again.",
    ],
  }),

  inviteUser: template({
    id: "inviteUser",
    dashboardName: "Invite user",
    subject: `You have been invited to ${APP_NAME}`,
    filename: "invite-user.html",
    title: "You have been invited",
    preheader: `Accept your invitation and join your village on ${APP_NAME}.`,
    lead: [
      `Somebody invited this address to ${APP_NAME}, the neighbourhood watch your village runs itself. Accept the invitation to set up your account.`,
      "You will be asked which village you are in, and for the join code your coordinator gave you. Without the code you can still create an account, but a coordinator has to confirm you before you count as a verified resident.",
    ],
    action: "Accept the invitation",
    tail: [
      "The link is good for 24 hours and can be used once.",
      "If you were not expecting this, ignore the email. No account has been created and this address will not be used again.",
    ],
    text: [
      "Hello,",
      "",
      `Somebody invited this address to ${APP_NAME}, the neighbourhood watch your`,
      "village runs itself. Accept the invitation to set up your account:",
      "",
      CONFIRMATION_URL,
      "",
      "You will be asked which village you are in, and for the join code your",
      "coordinator gave you.",
      "",
      "The link is good for 24 hours and can be used once. If you were not",
      "expecting this, ignore the email — no account has been created.",
    ],
  }),

  magicLink: template({
    id: "magicLink",
    dashboardName: "Magic Link",
    subject: `Your ${APP_NAME} sign-in link`,
    filename: "magic-link.html",
    title: "Your sign-in link",
    preheader: `Sign in to ${APP_NAME} without a password.`,
    lead: [
      `Here is the link you asked for. It signs you in to ${APP_NAME} on the device you open it on.`,
    ],
    action: "Sign me in",
    tail: [
      "The link is good for one hour and can be used once.",
      "If you did not ask to sign in, ignore this email. Nobody has been signed in and your account is unchanged.",
    ],
    text: [
      "Hello,",
      "",
      `Here is your link to sign in to ${APP_NAME}:`,
      "",
      CONFIRMATION_URL,
      "",
      "It is good for one hour and can be used once. If you did not ask to sign",
      "in, ignore this email.",
    ],
  }),

  changeEmail: template({
    id: "changeEmail",
    dashboardName: "Change Email Address",
    subject: `Confirm your new ${APP_NAME} email address`,
    filename: "change-email.html",
    title: "Confirm your new email address",
    preheader: `Confirm the change to your ${APP_NAME} sign-in address.`,
    lead: [
      `Somebody asked to change the email address on a ${APP_NAME} account. Confirming from this address is what completes the change.`,
      "You may receive this at both your old address and your new one. Both have to be confirmed before the change takes effect.",
    ],
    action: "Confirm this address",
    tail: [
      "The link is good for 24 hours and can be used once.",
      "If you did not ask for this, ignore this email and change your password. Your address has not been changed and nobody has been signed in.",
    ],
    text: [
      "Hello,",
      "",
      `Somebody asked to change the email address on a ${APP_NAME} account.`,
      "Confirm it from this address:",
      "",
      CONFIRMATION_URL,
      "",
      "You may receive this at both the old address and the new one — both have",
      "to be confirmed before the change takes effect. The link is good for 24",
      "hours and can be used once.",
      "",
      "If you did not ask for this, ignore this email and change your password.",
      "The address has not been changed and nobody has been signed in.",
    ],
  }),

  resetPassword: template({
    id: "resetPassword",
    dashboardName: "Reset Password",
    subject: `Reset your ${APP_NAME} password`,
    filename: "reset-password.html",
    title: "Reset your password",
    preheader: `Choose a new password for your ${APP_NAME} account.`,
    lead: [
      "Somebody asked to reset the password on this address. If that was you, choose a new one now.",
    ],
    action: "Choose a new password",
    tail: [
      "The link is good for one hour and can be used once.",
      "If it was not you, ignore this email. Your password has not changed and nobody has been signed in.",
    ],
    text: [
      "Hello,",
      "",
      "Somebody asked to reset the password on this address. If it was you:",
      "",
      CONFIRMATION_URL,
      "",
      "The link is good for one hour and can be used once.",
      "",
      "If it was not you, ignore this email. Your password has not changed and",
      "nobody has been signed in.",
    ],
  }),

  reauthentication: codeTemplate({
    id: "reauthentication",
    dashboardName: "Reauthentication",
    subject: `Your ${APP_NAME} confirmation code`,
    filename: "reauthentication.html",
    title: "Confirm it is you",
    preheader: "Your confirmation code, good for a few minutes.",
    lead: [
      `${APP_NAME} asked for this code before making a change to your account. Type it into the screen that asked for it.`,
    ],
    tail: [
      "The code is good for a few minutes and can be used once. Nobody will ever ask you for it by phone, by text or in a reply to this email.",
      "If you did not ask for it, ignore this email and change your password. Somebody knows your address, and they may know more than that.",
    ],
    text: [
      "Hello,",
      "",
      `${APP_NAME} asked for a code before making a change to your account.`,
      "Type this into the screen that asked for it:",
      "",
      `    ${TOKEN}`,
      "",
      "The code is good for a few minutes and can be used once. Nobody will ever",
      "ask you for it by phone, by text or in a reply to this email.",
      "",
      "If you did not ask for it, ignore this email and change your password.",
    ],
  }),
} as const satisfies Record<SupabaseTemplateId, SupabaseAuthTemplate>;

/** The six, in dashboard order — for the generator and the test to walk. */
export const SUPABASE_AUTH_TEMPLATE_LIST: readonly SupabaseAuthTemplate[] =
  Object.values(SUPABASE_AUTH_TEMPLATES);

/**
 * The string every one of these has to contain, exported so the test asserting
 * it and the module producing it cannot disagree about what it is.
 */
export const SUPABASE_CONFIRMATION_URL_TOKEN = CONFIRMATION_URL;

/**
 * The other one, for the single template that sends a code instead of a link.
 * Exported for the same reason as the URL above: the test asserting the literal
 * and the module emitting it must not be able to drift apart.
 */
export const SUPABASE_TOKEN_TOKEN = TOKEN;

/** Where the generated files live, relative to the repository root. */
export const SUPABASE_TEMPLATE_DIR = "src/lib/email/supabase-templates";

/** Escapes a value for these templates. Re-exported so callers need one import. */
export { escapeHtml };
