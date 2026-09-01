import { APP_NAME, APP_ORIGIN } from "@/lib/constants";

/**
 * The shared shell every VillageWatch email is rendered into, and the helpers
 * that make one safe to build.
 *
 * **These are templates, and they still know nothing about the mailer.** Each
 * module here exports a pure function from typed data to
 * `{ subject, text, html }` and nothing more. The transport lives in
 * `./send.ts`, over Resend, and takes those objects as they are — not one line
 * of a template changed when it was wired in, which is what the split was for.
 * Keeping the rendering separate is also what makes these testable without a
 * key, which is what lets CI run them at all.
 *
 * ## Why the HTML looks like 2004
 *
 * Because email clients do. Outlook renders with Word's engine, Gmail strips
 * `<style>` blocks in some contexts and `<head>` entirely in others, and none
 * of them support flexbox or grid reliably. So: one table, inline styles on
 * every element, no external stylesheet, no web font, and exactly one image —
 * the brand mark in the header, which is decorative and which the wordmark
 * beside it makes redundant. An email that degrades to legible text in a client
 * nobody tested is worth more than one that looks right in three and breaks in
 * the fourth.
 *
 * ## Every email ships a text part
 *
 * Not as a fallback. A push notification body and an email subject line are
 * read on a lock screen, and plenty of residents on a rural connection have
 * images and HTML off by default. The text part is the message; the HTML is the
 * formatting.
 */

/**
 * Canonical origin. Absolute URLs are mandatory — an email has no base href.
 *
 * Falls back to `APP_ORIGIN` rather than `localhost` for the same reason the
 * alert and the push deep link do: an email is read on a machine that is not
 * the one that rendered it.
 */
export function appUrl(path = "/"): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? APP_ORIGIN;
  return new URL(path, base).toString();
}

/**
 * Escapes text for interpolation into HTML.
 *
 * Load-bearing rather than tidy. Incident titles, descriptions and village
 * names all come from residents, and an apostrophe in "the lane behind St
 * Mary's" is the common case — a stray `<` in a report is the uncommon one that
 * would otherwise break the message or inject markup into every recipient's
 * inbox. Every interpolation in this directory goes through it.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type EmailMessage = {
  subject: string;
  /** The message itself, readable on its own. */
  text: string;
  /** The same message, formatted. Absent for emails that are text by design. */
  html?: string;
};

const BRAND = "#0f2557";
const INK = "#0f172a";
const MUTED = "#475569";
const BORDER = "#e2e8f0";
const CANVAS = "#f8fafc";

/**
 * The shield in the header bar, as an absolute URL.
 *
 * `public/android-chrome-192x192.png` rather than a new asset: it is the
 * outline weight of the same shield `src/components/logo.tsx` draws and
 * `scripts/generate-icons.mjs` renders, on the same brand gradient, with the
 * same rounded corners. Borrowing it is what keeps the email header and the app
 * header the same drawing without a second generator to keep in step — the
 * constraint that script's own header sets out. It is served from `public/`, so
 * it needs no build step and no CDN.
 *
 * **An `<img>` rather than inline SVG, and that is not a preference.** Gmail
 * strips `<svg>` entirely, Outlook renders it through Word's engine and draws
 * nothing, and Yahoo removes it — so an inline mark is a blank space in most of
 * the inboxes this reaches. A hosted PNG is the one form every client agrees on.
 *
 * Displayed at 36px from a 192px source, so it stays sharp on a retina screen.
 * Width and height are set as attributes as well as in the style, because
 * Outlook reserves the box from the attributes and ignores the style.
 *
 * **`alt` is empty on purpose.** The wordmark sits in the cell beside it and
 * already says the name, so a described image would have a reader hear
 * "VillageWatch VillageWatch" — and a client with images off would print it
 * twice. Decorative, and marked as such.
 *
 * It is also the only request an opened email makes, it is to this service's
 * own origin, and nothing counts it. That is worth saying plainly, because a
 * remote image in an email is the shape a tracking pixel takes: there is no
 * pixel here, no per-recipient URL, and nothing anywhere that reads the access
 * log to work out who opened what. Keep it that way.
 */
function markImage(): string {
  return `<img src="${escapeHtml(appUrl("/android-chrome-192x192.png"))}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border:0;border-radius:10px;">`;
}

/** A section heading inside the body. */
export function heading(text: string): string {
  return `<h2 style="margin:32px 0 12px;font-size:16px;line-height:1.4;font-weight:600;color:${INK};">${escapeHtml(text)}</h2>`;
}

/** A body paragraph. */
export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${INK};">${escapeHtml(text)}</p>`;
}

/** Smaller, quieter body text — captions and notes. */
export function note(text: string): string {
  return `<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${MUTED};">${escapeHtml(text)}</p>`;
}

/** A bulleted list. Rendered as a table so Outlook keeps the indentation. */
export function list(items: readonly string[]): string {
  if (items.length === 0) return "";

  const rows = items
    .map(
      (item) =>
        `<tr>
          <td valign="top" style="padding:0 10px 8px 0;font-size:15px;line-height:1.65;color:${MUTED};">&bull;</td>
          <td valign="top" style="padding:0 0 8px;font-size:15px;line-height:1.65;color:${INK};">${escapeHtml(item)}</td>
        </tr>`,
    )
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">${rows}</table>`;
}

/**
 * The primary action. One per email — an email with three buttons is an email
 * where nobody presses any of them.
 */
export function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td align="center" bgcolor="${BRAND}" style="border-radius:10px;">
        <a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

/** A boxed callout — the digest's headline figure, an incident's location. */
export function panel(rows: readonly { label: string; value: string }[]): string {
  if (rows.length === 0) return "";

  const cells = rows
    .map(
      (row) =>
        `<tr>
          <td style="padding:6px 16px 6px 0;font-size:13px;line-height:1.5;color:${MUTED};white-space:nowrap;">${escapeHtml(row.label)}</td>
          <td style="padding:6px 0;font-size:14px;line-height:1.5;color:${INK};font-weight:500;">${escapeHtml(row.value)}</td>
        </tr>`,
    )
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background:${CANVAS};border:1px solid ${BORDER};border-radius:12px;">
    <tr><td style="padding:16px 18px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${cells}</table></td></tr>
  </table>`;
}

/**
 * Wraps rendered body HTML in the branded shell.
 *
 * `preheader` is the line a client shows next to the subject in the inbox list.
 * Set it deliberately — left empty, clients scrape the first words of the body,
 * which for these emails is usually a greeting and tells the reader nothing.
 */
export function renderEmail(input: {
  title: string;
  preheader: string;
  body: string;
  /** Ends the email. Almost always where to change preferences. */
  footer?: string;
  /**
   * The row of links under the footer line.
   *
   * Defaults to notification settings, privacy and terms, which is right for
   * every email sent *to a resident of a village*. It is overridable for the
   * one family that is not: the Supabase auth templates in
   * `./supabase-templates/` are read by somebody who has not signed in — and
   * for the confirmation email, by somebody whose account does not work yet.
   * "Notification settings" there is a link to a sign-in wall, offered to the
   * one person who cannot get past it.
   *
   * Paths, not URLs — `appUrl` is applied here so a caller cannot accidentally
   * emit a relative href into an inbox that has no base to resolve it against.
   */
  links?: readonly { label: string; path: string }[];
}): string {
  const footer =
    input.footer ??
    `You are receiving this because you are a member of a village on ${APP_NAME}.`;

  const links = input.links ?? [
    { label: "Notification settings", path: "/settings" },
    { label: "Privacy", path: "/privacy" },
    { label: "Terms", path: "/terms" },
  ];

  const linkRow = links
    .map(
      (link) =>
        `<a href="${escapeHtml(appUrl(link.path))}" style="color:${MUTED};">${escapeHtml(link.label)}</a>`,
    )
    .join("\n              &nbsp;&middot;&nbsp;\n              ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CANVAS};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BORDER};border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

        <tr>
          <td style="padding:20px 28px;background:${BRAND};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="36" valign="middle" style="padding-right:12px;">${markImage()}</td>
                <td valign="middle"><span style="font-size:17px;font-weight:600;color:#ffffff;letter-spacing:-0.01em;">${escapeHtml(APP_NAME)}</span></td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:28px;">
            <h1 style="margin:0 0 18px;font-size:21px;line-height:1.3;font-weight:600;color:${INK};letter-spacing:-0.01em;">${escapeHtml(input.title)}</h1>
            ${input.body}
          </td>
        </tr>

        <tr>
          <td style="padding:20px 28px 26px;border-top:1px solid ${BORDER};">
            <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${MUTED};">${escapeHtml(footer)}</p>
            <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">
              ${linkRow}
            </p>
            <p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:${MUTED};">
              In an emergency always call 999. ${escapeHtml(APP_NAME)} is not an emergency service.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** The text-part equivalent of the shell's footer. */
export function textFooter(): string {
  return [
    "—",
    `Notification settings: ${appUrl("/settings")}`,
    `Privacy: ${appUrl("/privacy")}`,
    "",
    `In an emergency always call 999. ${APP_NAME} is not an emergency service.`,
  ].join("\n");
}
