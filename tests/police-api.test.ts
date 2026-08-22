import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAvailableMonths,
  fetchNeighbourhood,
  fetchNeighbourhoodTeam,
  fetchStreetLevelCrimes,
  locateNeighbourhood,
} from "@/lib/police-api";
import {
  POLICE_API_MAX_REQUESTS_PER_SECOND,
  POLICE_MAX_CRIMES_PER_MONTH,
  POLICE_TEAM_MAX_MEMBERS,
} from "@/lib/constants";

/**
 * The client for `data.police.uk`.
 *
 * `fetch` is stubbed, which is the whole boundary — this module has no other
 * dependency, no key and no database, so what is asserted here is the thing
 * that actually matters about it: what it does with what somebody else's
 * service sends back.
 *
 * Four properties, in the order they would hurt if they broke:
 *
 *   * **Nothing throws.** Every failure — a 404, a 429, a 503, a socket that
 *     died, a body that is not JSON — is a returned value with a code on it.
 *     Two callers depend on that: a cron looping over villages, where a throw
 *     ends the sweep, and `/reports`, where it would put an error page in front
 *     of a coordinator who is late for a meeting.
 *   * **A 404 is `no_data`, not a failure.** The service answers 404 for a
 *     month it has not published, which is the ordinary state of the two most
 *     recent months. Conflating that with an error is what would fill a cron
 *     log with alarm about a service working exactly as documented — and,
 *     worse, would stop the sync recording the month as published-and-empty.
 *   * **One bad record costs that record.** A month is thousands of objects
 *     published by somebody else. Parsing the array as a unit would throw a
 *     whole month away over one malformed entry, so records are parsed one at a
 *     time and the count of what was dropped comes back with them.
 *   * **`bio` never arrives.** The team endpoint returns force-authored HTML
 *     beside each officer, and the schema does not describe the field — so it
 *     is stripped at the parse rather than at whichever component would
 *     eventually render it. Asserted, because "we just do not use that field"
 *     is a decision one refactor away from being untrue.
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

const CRIME = {
  category: "vehicle-crime",
  location_type: "Force",
  location: {
    latitude: "52.2534",
    street: { id: 883345, name: "On or near Mill Road" },
    longitude: "0.0997",
  },
  context: "",
  outcome_status: { category: "Under investigation", date: "2026-06" },
  persistent_id: "",
  id: 104164419,
  location_subtype: "",
  month: "2026-05",
};

/**
 * How far the clock is wound on for each test, so no test inherits the last
 * one's slot. Anything comfortably past `1 / POLICE_API_MAX_REQUESTS_PER_SECOND`
 * does; a minute is unmistakable in a stack trace.
 */
const CLOCK_STEP_MS = 60_000;

let clockOffsetMs = 0;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);

  /*
    The pacer in `police-api.ts` is module state and outlives a test, so every
    request in this file queues behind the last one's slot. At the documented
    15/s that cost nothing and was invisible; at the 1/s the service actually
    enforces it turned a 1.8s file into a 23s one, with 21 of those seconds
    bought for a property none of these tests is about.

    Winding the clock on puts the next free slot in the past, so `reserve()`
    takes it immediately and never sleeps. It is the clock that moves and not
    the pacer: the module keeps its real state, so a pacer that had stopped
    pacing still fails "the outbound pace" below, which measures the wait and is
    the one test here that is about it. `shouldAdvanceTime` is what lets that
    one still work — the fake clock tracks real time, so a real 1s wait reads as
    1s elapsed.
  */
  clockOffsetMs += CLOCK_STEP_MS;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(Date.now() + clockOffsetMs);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchStreetLevelCrimes", () => {
  it("flattens a published record into the shape this codebase stores", async () => {
    fetchMock.mockResolvedValue(ok([CRIME]));

    const result = await fetchStreetLevelCrimes({
      lat: 52.25,
      lng: 0.1,
      month: "2026-05",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.crimes).toHaveLength(1);
    expect(result.data.crimes[0]).toEqual({
      crimeId: "104164419",
      // The empty string upstream means "no persistent id", and it is the
      // common case. Stored as null so nothing downstream has to decide
      // whether `""` is absent or is a value.
      persistentId: null,
      category: "vehicle-crime",
      month: "2026-05",
      // Strings upstream, numbers here.
      lat: 52.2534,
      lng: 0.0997,
      streetId: 883345,
      streetName: "On or near Mill Road",
      locationType: "Force",
      locationSubtype: null,
      context: null,
      outcomeCategory: "Under investigation",
      outcomeDate: "2026-06",
    });
  });

  it("files a record under the month that was asked for", async () => {
    // The record's own `month` disagrees. The requested month has to win: it is
    // what the cache key was computed from, so filing the row under the other
    // label would leave a duplicate behind on the next refresh.
    fetchMock.mockResolvedValue(ok([{ ...CRIME, month: "2020-01" }]));

    const result = await fetchStreetLevelCrimes({
      lat: 52.25,
      lng: 0.1,
      month: "2026-05",
    });

    expect(result.ok && result.data.crimes[0].month).toBe("2026-05");
  });

  it("drops a malformed record and counts it, keeping the rest of the month", async () => {
    fetchMock.mockResolvedValue(
      ok([
        CRIME,
        // No category, which is one of the two fields without which a record
        // means nothing.
        { id: 1, location: CRIME.location },
        { ...CRIME, id: 2, location: { latitude: "not a number", longitude: "0" } },
        { ...CRIME, id: 3 },
      ]),
    );

    const result = await fetchStreetLevelCrimes({
      lat: 52.25,
      lng: 0.1,
      month: "2026-05",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.crimes).toHaveLength(2);
    expect(result.data.dropped).toBe(2);
  });

  it("caps a month and says that it did", async () => {
    const many = Array.from({ length: POLICE_MAX_CRIMES_PER_MONTH + 5 }, (_, i) => ({
      ...CRIME,
      id: i,
    }));

    fetchMock.mockResolvedValue(ok(many));

    const result = await fetchStreetLevelCrimes({
      lat: 52.25,
      lng: 0.1,
      month: "2026-05",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.crimes).toHaveLength(POLICE_MAX_CRIMES_PER_MONTH);
    // Reported rather than silently truncated. A capped month that said nothing
    // would read as a quieter month.
    expect(result.data.truncated).toBe(true);
  });

  it("reads a 404 as a month that has not been published", async () => {
    fetchMock.mockResolvedValue(status(404));

    const result = await fetchStreetLevelCrimes({
      lat: 52.25,
      lng: 0.1,
      month: "2026-08",
    });

    expect(result).toMatchObject({ ok: false, code: "no_data" });
  });

  it("reads a 503 as an area too busy for one request", async () => {
    fetchMock.mockResolvedValue(status(503));

    const result = await fetchStreetLevelCrimes({
      lat: 51.5,
      lng: -0.12,
      month: "2026-05",
    });

    expect(result).toMatchObject({ ok: false, code: "too_many_crimes" });
  });

  it("reads a 429 as being asked to slow down", async () => {
    fetchMock.mockResolvedValue(status(429));

    const result = await fetchStreetLevelCrimes({
      lat: 52.25,
      lng: 0.1,
      month: "2026-05",
    });

    expect(result).toMatchObject({ ok: false, code: "rate_limited" });
  });

  it("returns rather than throws when the socket dies", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));

    const result = await fetchStreetLevelCrimes({
      lat: 52.25,
      lng: 0.1,
      month: "2026-05",
    });

    expect(result).toMatchObject({ ok: false, code: "network" });
  });

  it("returns rather than throws on a body that is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    } as unknown as Response);

    const result = await fetchStreetLevelCrimes({
      lat: 52.25,
      lng: 0.1,
      month: "2026-05",
    });

    expect(result).toMatchObject({ ok: false, code: "invalid_output" });
  });

  it("refuses a 200 that is not a list", async () => {
    fetchMock.mockResolvedValue(ok({ message: "nope" }));

    const result = await fetchStreetLevelCrimes({
      lat: 52.25,
      lng: 0.1,
      month: "2026-05",
    });

    expect(result).toMatchObject({ ok: false, code: "invalid_output" });
  });

  it("identifies itself to a service that has no key to revoke", async () => {
    fetchMock.mockResolvedValue(ok([]));

    await fetchStreetLevelCrimes({ lat: 52.25, lng: 0.1, month: "2026-05" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;

    expect(headers["User-Agent"]).toContain("VillageWatch");
    // An open API with no key identifies a caller by their agent, and a service
    // that cannot say who is misbehaving blocks by address range.
    expect(headers["User-Agent"]).toContain("@");
  });
});

describe("the outbound pace", () => {
  it("holds concurrent callers to the rate the service asks for", async () => {
    fetchMock.mockResolvedValue(ok([]));

    const calls = 4;
    const interval = 1000 / POLICE_API_MAX_REQUESTS_PER_SECOND;

    const started = Date.now();

    await Promise.all(
      Array.from({ length: calls }, () =>
        fetchStreetLevelCrimes({ lat: 52.25, lng: 0.1, month: "2026-05" }),
      ),
    );

    const elapsed = Date.now() - started;

    // Four calls issued at once are spaced by the pacer rather than fired
    // together. The margin is generous because a timer is a floor and not a
    // promise; what would fail here is a pacer that had stopped pacing.
    expect(elapsed).toBeGreaterThanOrEqual((calls - 1) * interval * 0.8);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });
});

describe("locateNeighbourhood", () => {
  it("returns the force and neighbourhood pair", async () => {
    fetchMock.mockResolvedValue(
      ok({ force: "cambridgeshire", neighbourhood: "CN1" }),
    );

    const result = await locateNeighbourhood({ lat: 52.25, lng: 0.1 });

    expect(result).toEqual({
      ok: true,
      data: { force: "cambridgeshire", neighbourhood: "CN1" },
    });
  });

  it("treats a point outside the coverage as no data rather than a fault", async () => {
    fetchMock.mockResolvedValue(status(404));

    const result = await locateNeighbourhood({ lat: 57.5, lng: -4.2 });

    expect(result).toMatchObject({ ok: false, code: "no_data" });
  });
});

describe("fetchNeighbourhood", () => {
  const DETAIL = {
    id: "CN1",
    name: "Histon and Impington",
    description:
      "<p>Your local team covers <strong>Histon</strong> &amp; Impington.</p>",
    url_force: "https://www.cambs.police.uk/area/histon",
    population: "0",
    centre: { latitude: "52.2534", longitude: "0.0997" },
    contact_details: {
      email: "histon@cambs.police.uk",
      telephone: "101",
      twitter: "https://twitter.com/cambscops",
      facebook: "",
    },
  };

  it("strips the markup out of a force's description", async () => {
    fetchMock.mockResolvedValue(ok(DETAIL));

    const result = await fetchNeighbourhood("cambridgeshire", "CN1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Nothing in this codebase renders third-party HTML, so the tags are
    // removed on the way in rather than trusted to a component later.
    expect(result.data.description).toBe(
      "Your local team covers Histon & Impington.",
    );
    expect(result.data.description).not.toContain("<");
  });

  it("drops a population of zero rather than storing a claim", async () => {
    fetchMock.mockResolvedValue(ok(DETAIL));

    const result = await fetchNeighbourhood("cambridgeshire", "CN1");

    // `"0"` is a force that has not filled the field in. A zero on a screen is
    // a statement about how many people live somewhere.
    expect(result.ok && result.data.population).toBeNull();
  });

  it("refuses a link that is not http(s)", async () => {
    fetchMock.mockResolvedValue(
      ok({ ...DETAIL, url_force: "javascript:alert(1)" }),
    );

    const result = await fetchNeighbourhood("cambridgeshire", "CN1");

    // These end up in an `href` on a coordinator's dashboard, and this one came
    // out of somebody else's CMS — the same guard `getVillageChannel` puts in
    // front of a stored channel link.
    expect(result.ok && result.data.urlForce).toBeNull();
  });
});

describe("fetchNeighbourhoodTeam", () => {
  it("never carries an officer's bio through", async () => {
    fetchMock.mockResolvedValue(
      ok([
        {
          name: "Nick Dale",
          rank: "PCSO",
          bio: "<p>Nick has served since 2009 and enjoys <em>cycling</em>.</p>",
          contact_details: { email: "nick.dale@cambs.police.uk" },
        },
      ]),
    );

    const result = await fetchNeighbourhoodTeam("cambridgeshire", "CN1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toEqual([
      { name: "Nick Dale", rank: "PCSO", email: "nick.dale@cambs.police.uk" },
    ]);
    // Stripped at the parse, so it cannot reach the database and cannot be
    // found there by a later "just render the bio".
    expect(Object.keys(result.data[0])).not.toContain("bio");
  });

  it("caps a city-centre team", async () => {
    fetchMock.mockResolvedValue(
      ok(
        Array.from({ length: POLICE_TEAM_MAX_MEMBERS + 6 }, (_, i) => ({
          name: `Officer ${i}`,
          rank: "PC",
        })),
      ),
    );

    const result = await fetchNeighbourhoodTeam("leicestershire", "NC04");

    expect(result.ok && result.data).toHaveLength(POLICE_TEAM_MAX_MEMBERS);
  });

  it("skips an entry with no name rather than rendering a blank row", async () => {
    fetchMock.mockResolvedValue(ok([{ rank: "PC" }, { name: "Sam Reed" }]));

    const result = await fetchNeighbourhoodTeam("cambridgeshire", "CN1");

    expect(result.ok && result.data.map((m) => m.name)).toEqual(["Sam Reed"]);
  });
});

describe("fetchAvailableMonths", () => {
  it("sorts the published months newest first rather than trusting the order", async () => {
    fetchMock.mockResolvedValue(
      ok([{ date: "2026-04" }, { date: "2026-06" }, { date: "2026-05" }]),
    );

    const result = await fetchAvailableMonths();

    expect(result).toEqual({ ok: true, data: ["2026-06", "2026-05", "2026-04"] });
  });

  it("drops an entry that is not a month", async () => {
    fetchMock.mockResolvedValue(ok([{ date: "2026-06" }, { date: "soon" }]));

    const result = await fetchAvailableMonths();

    expect(result).toEqual({ ok: true, data: ["2026-06"] });
  });
});
