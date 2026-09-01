import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SUPABASE_AUTH_TEMPLATES,
  SUPABASE_AUTH_TEMPLATE_LIST,
  SUPABASE_CONFIRMATION_URL_TOKEN,
  SUPABASE_TEMPLATE_DIR,
} from "@/lib/email/supabase-templates";

/**
 * The four emails Supabase Auth sends, in VillageWatch's clothes.
 *
 * This is the third file in the suite to read the working tree, and it earns
 * the exception the same way `compliance-documents.test.ts` does: it needs no
 * secret and no database, and the failure it catches is otherwise invisible
 * until a resident cannot get into their account.
 *
 * What is asserted is the promise rather than the wording:
 *
 *   * every template carries `{{ .ConfirmationURL }}`, which is the whole point
 *     of every one of these emails — anything else in that position is a
 *     delivered email with a dead link, and it fails *silently*: it looks to
 *     the resident exactly like an address they mistyped;
 *   * no other Go template variable appears, because one a project's Supabase
 *     version does not populate renders as an empty string rather than an
 *     error;
 *   * the committed `.html` file and the module agree, so a word changed in one
 *     and not regenerated fails here rather than shipping as an email nobody
 *     chose.
 *
 * The sentences themselves are deliberately not asserted. They are copy under
 * revision, and a test that failed whenever somebody improved one is the test
 * `compliance-documents.test.ts` explains why this suite does not write.
 */

const dir = path.join(process.cwd(), SUPABASE_TEMPLATE_DIR);

describe("the Supabase auth templates", () => {
  it("covers the four templates the dashboard has", () => {
    expect(Object.keys(SUPABASE_AUTH_TEMPLATES).sort()).toEqual([
      "changeEmail",
      "confirmSignup",
      "magicLink",
      "resetPassword",
    ]);

    expect(SUPABASE_AUTH_TEMPLATE_LIST).toHaveLength(4);
  });

  it.each(SUPABASE_AUTH_TEMPLATE_LIST)(
    "$dashboardName carries the confirmation URL in the link and in the text",
    (template) => {
      // Twice in the HTML: once as the button's href, once as the visible
      // fallback link — a client that strips the button table must still leave
      // something clickable.
      const occurrences = template.html.split(
        SUPABASE_CONFIRMATION_URL_TOKEN,
      ).length - 1;

      expect(occurrences).toBeGreaterThanOrEqual(2);
      expect(template.text).toContain(SUPABASE_CONFIRMATION_URL_TOKEN);
    },
  );

  it.each(SUPABASE_AUTH_TEMPLATE_LIST)(
    "$dashboardName uses no other Supabase template variable",
    (template) => {
      // `{{ .Email }}`, `{{ .NewEmail }}` and `{{ .Token }}` render as an empty
      // string where a project does not populate them, and a blank line where
      // an address should be reads as broken to the one person who cannot tell
      // whether it is. See the module header.
      const actions = template.html.match(/\{\{[^}]*\}\}/g) ?? [];

      expect(actions.length).toBeGreaterThan(0);
      expect(new Set(actions)).toEqual(
        new Set([SUPABASE_CONFIRMATION_URL_TOKEN]),
      );
    },
  );

  it.each(SUPABASE_AUTH_TEMPLATE_LIST)(
    "$dashboardName has a subject and does not send the reader to a sign-in wall",
    (template) => {
      expect(template.subject.trim().length).toBeGreaterThan(0);
      expect(template.subject).toContain("VillageWatch");

      // The reader of an auth email has not signed in — and for the
      // confirmation, cannot. "Notification settings" is behind
      // `requireSession()`, so linking it here offers the one page to the one
      // person it will not let through.
      expect(template.html).not.toContain("/settings");

      // The two that are right for somebody with no account yet.
      expect(template.html).toContain("/privacy");
      expect(template.html).toContain("/terms");
    },
  );

  it.each(SUPABASE_AUTH_TEMPLATE_LIST)(
    "$dashboardName matches its committed .html file",
    (template) => {
      const file = readFileSync(path.join(dir, template.filename), "utf8");

      // The generator writes a trailing newline; the module does not carry one.
      expect(file).toBe(`${template.html}\n`);
    },
  );

  it("renders a complete document with the brand colour in it", () => {
    for (const template of SUPABASE_AUTH_TEMPLATE_LIST) {
      expect(template.html.startsWith("<!doctype html>")).toBe(true);
      expect(template.html.trimEnd().endsWith("</html>")).toBe(true);
      // The header bar and the shield in it. Not a wording assertion — they
      // are the two things that make these look like the product rather than
      // like Supabase, and the mark is shared with the four emails the app
      // sends itself (`tests/email-branding.test.ts`).
      expect(template.html).toContain("#0f2557");
      expect(template.html).toContain(
        "https://villagewatch.app/android-chrome-192x192.png",
      );
    }
  });
});
