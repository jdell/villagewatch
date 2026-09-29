import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupMpByPostcode } from "@/lib/parliament";

/**
 * The client for Parliament's Members API.
 *
 * `fetch` is stubbed, which is the whole boundary — the module has no key, no
 * database and no other dependency. The property that matters is the one
 * `police-api.test.ts` pins for its own client: **nothing throws**. The caller
 * is a coordinator pressing a button on `/reports`, and a timeout, a 500 or an
 * unknown postcode must come back as a value with a code on it rather than as
 * an error page.
 *
 * The second property is that the contact call is optional. The constituency
 * search is what says who the MP is; the email and office address are a
 * second request, and losing it costs those two fields rather than the lookup.
 */

const fetchMock = vi.fn();

function ok(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function status(code: number): Response {
  return {
    ok: false,
    status: code,
    json: async () => ({}),
  } as unknown as Response;
}

const CONSTITUENCY = {
  items: [
    {
      value: {
        id: 4000,
        name: "South Cambridgeshire",
        currentRepresentation: {
          member: {
            value: {
              id: 5100,
              nameDisplayAs: "Pippa Heylings",
              nameFullTitle: "Pippa Heylings MP",
              nameAddressAs: "Ms Heylings",
              latestParty: { name: "Liberal Democrat" },
              thumbnailUrl: "https://members-api.parliament.uk/api/Members/5100/Thumbnail",
            },
          },
        },
      },
    },
  ],
};

const CONTACT = {
  value: [
    {
      type: "Constituency",
      email: "constituency@example.test",
      line1: "1 High Street",
    },
    {
      type: "Parliamentary office",
      email: "pippa.heylings.mp@parliament.uk",
      line1: "House of Commons",
      line2: "London",
      postcode: "SW1A 0AA",
    },
  ],
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lookupMpByPostcode", () => {
  it("returns the MP's name, constituency and email for a postcode", async () => {
    fetchMock
      .mockResolvedValueOnce(ok(CONSTITUENCY))
      .mockResolvedValueOnce(ok(CONTACT));

    const result = await lookupMpByPostcode(" cb24 9aa ");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mp.name).toBe("Pippa Heylings");
    expect(result.mp.fullTitle).toBe("Pippa Heylings MP");
    expect(result.mp.party).toBe("Liberal Democrat");
    expect(result.mp.constituency).toBe("South Cambridgeshire");
    expect(result.mp.memberId).toBe(5100);
    // The parliamentary office is chosen over the constituency one.
    expect(result.mp.email).toBe("pippa.heylings.mp@parliament.uk");
    expect(result.mp.officeAddress).toBe("House of Commons, London, SW1A 0AA");

    // The postcode is trimmed, upper-cased and is all that is sent.
    const searchUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(searchUrl.host).toBe("members-api.parliament.uk");
    expect(searchUrl.searchParams.get("searchText")).toBe("CB24 9AA");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/Members/5100/Contact");
  });

  it.each([null, undefined, "", "   "])(
    "returns no_postcode for %j without calling the API",
    async (postcode) => {
      const result = await lookupMpByPostcode(postcode);

      expect(result).toMatchObject({ ok: false, code: "no_postcode" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("returns api_error when the API answers 500", async () => {
    fetchMock.mockResolvedValueOnce(status(500));

    await expect(lookupMpByPostcode("CB24 9AA")).resolves.toMatchObject({
      ok: false,
      code: "api_error",
    });
  });

  it("returns api_error when the request itself fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(lookupMpByPostcode("CB24 9AA")).resolves.toMatchObject({
      ok: false,
      code: "api_error",
    });
  });

  it("returns timeout when the request is aborted by its deadline", async () => {
    fetchMock.mockRejectedValueOnce(
      new DOMException("The operation timed out.", "TimeoutError"),
    );

    await expect(lookupMpByPostcode("CB24 9AA")).resolves.toMatchObject({
      ok: false,
      code: "timeout",
    });
  });

  it("returns not_found when the search has no results", async () => {
    fetchMock.mockResolvedValueOnce(ok({ items: [] }));

    await expect(lookupMpByPostcode("ZZ99 9ZZ")).resolves.toMatchObject({
      ok: false,
      code: "not_found",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns parse_error when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    } as unknown as Response);

    await expect(lookupMpByPostcode("CB24 9AA")).resolves.toMatchObject({
      ok: false,
      code: "parse_error",
    });
  });

  it("returns no_mp for a constituency with no current representative", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ items: [{ value: { name: "Vacant Seat", currentRepresentation: null } }] }),
    );

    await expect(lookupMpByPostcode("CB24 9AA")).resolves.toMatchObject({
      ok: false,
      code: "no_mp",
    });
  });

  describe("when the contact call fails, the lookup still succeeds", () => {
    it.each([
      ["a 500", () => fetchMock.mockResolvedValueOnce(status(500))],
      ["a network error", () => fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))],
      [
        "a timeout",
        () =>
          fetchMock.mockRejectedValueOnce(
            new DOMException("The operation timed out.", "TimeoutError"),
          ),
      ],
      ["an unexpected shape", () => fetchMock.mockResolvedValueOnce(ok({ nope: true }))],
    ])("%s", async (_label, failContact) => {
      fetchMock.mockResolvedValueOnce(ok(CONSTITUENCY));
      failContact();

      const result = await lookupMpByPostcode("CB24 9AA");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.mp.name).toBe("Pippa Heylings");
      expect(result.mp.constituency).toBe("South Cambridgeshire");
      expect(result.mp.email).toBeNull();
      expect(result.mp.officeAddress).toBeNull();
    });
  });
});
