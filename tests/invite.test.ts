import { describe, expect, it } from "vitest";
import {
  buildInviteUrl,
  buildJoinUrl,
  readJoinCodeParam,
} from "@/lib/invite";
import { normalizeJoinCode } from "@/lib/validations";

/**
 * The village invite link.
 *
 * Two properties are worth pinning down, and both are about the join code being
 * a credential rather than a decoration.
 *
 * **The code has to survive intact.** It is printed on a flyer, encoded into a
 * QR nobody can proof-read, and then compared byte for byte against the column
 * by `checkVillageJoin`. A link that dropped it, lower-cased it or double-encoded
 * it would produce a QR that scans, opens a real page, and refuses everybody —
 * with nothing on screen to say why.
 *
 * **A missing code must not become an empty one.** `?code=` with nothing after
 * it reads as "this village needs a join code" on the server, which is the right
 * refusal for a resident who typed nothing and the wrong one to build into a
 * printed invite. No code means no parameter.
 *
 * The base URL is a fixture rather than the real origin, the same choice
 * `format-alert.test.ts` makes and for the same reason: the point is that the
 * function threads the base it is handed through to the link, and an assertion
 * against the production host would still pass if the argument were ignored.
 */

const BASE = "https://villagewatch.example";
const TARGET = { slug: "bourn-cambridgeshire", joinCode: "K7M2QX", baseUrl: BASE };

describe("buildJoinUrl", () => {
  it("points at the join page for the slug, with the code attached", () => {
    expect(buildJoinUrl(TARGET)).toBe(
      `${BASE}/join/bourn-cambridgeshire?code=K7M2QX`,
    );
  });

  it("omits the parameter entirely when there is no code", () => {
    // Not `?code=`. An empty value is a refusal on the server, and a village
    // with no code is one that accepts anybody in the picker.
    expect(buildJoinUrl({ slug: "bourn-cambridgeshire", baseUrl: BASE })).toBe(
      `${BASE}/join/bourn-cambridgeshire`,
    );
    expect(
      buildJoinUrl({ slug: "bourn-cambridgeshire", joinCode: null, baseUrl: BASE }),
    ).toBe(`${BASE}/join/bourn-cambridgeshire`);
  });

  it("normalises a code that was typed in by hand", () => {
    // Rows set in psql before `generateJoinCode` existed are not guaranteed to
    // be normalised, and neither is a coordinator reading one off a newsletter.
    const url = buildJoinUrl({ ...TARGET, joinCode: "k7m2-qx" });

    expect(url).toBe(`${BASE}/join/bourn-cambridgeshire?code=K7M2QX`);
    expect(new URL(url).searchParams.get("code")).toBe(
      normalizeJoinCode("k7m2-qx"),
    );
  });

  it("survives a base URL that is not a URL", () => {
    // This runs inside a render. A broken `NEXT_PUBLIC_APP_URL` costs a shorter
    // link, never a blank screen.
    expect(buildJoinUrl({ ...TARGET, baseUrl: "not a url" })).toBe(
      "/join/bourn-cambridgeshire?code=K7M2QX",
    );
  });

  it("encodes a slug that would otherwise change the path", () => {
    const url = buildJoinUrl({ ...TARGET, slug: "a/b?c" });

    expect(url).toBe(`${BASE}/join/a%2Fb%3Fc?code=K7M2QX`);
    expect(new URL(url).searchParams.get("code")).toBe("K7M2QX");
  });
});

describe("buildInviteUrl", () => {
  it("points at the printable page, carrying the same code", () => {
    expect(buildInviteUrl(TARGET)).toBe(
      `${BASE}/invite/bourn-cambridgeshire?code=K7M2QX`,
    );
  });
});

describe("readJoinCodeParam", () => {
  it("normalises what arrives in the query string", () => {
    expect(readJoinCodeParam("k7m2qx")).toBe("K7M2QX");
    expect(readJoinCodeParam("K7M2-QX")).toBe("K7M2QX");
  });

  it("takes the first of a repeated parameter", () => {
    expect(readJoinCodeParam(["K7M2QX", "OTHER1"])).toBe("K7M2QX");
  });

  it("refuses anything that is not code-shaped", () => {
    // Both public pages render this straight into a QR that somebody then
    // prints a hundred of, so a value that cannot be a code is no value at all.
    expect(readJoinCodeParam(undefined)).toBeNull();
    expect(readJoinCodeParam("")).toBeNull();
    expect(readJoinCodeParam("   ")).toBeNull();
    expect(readJoinCodeParam("ab")).toBeNull();
    expect(readJoinCodeParam("<script>alert(1)</script>")).toBeNull();
    expect(readJoinCodeParam("K7M2QX'; DROP TABLE")).toBeNull();
  });
});
