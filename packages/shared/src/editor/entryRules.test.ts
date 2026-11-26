import { describe, expect, it } from "vitest";

import { type EditorEntryInput, EditorEntryInputSchema } from "./entry";
import {
  addExceptionParts,
  dateKeyProblem,
  type EntryParts,
  type ImportEntryInput,
  importEntryParts,
  occurrenceProblem,
  setOverrideParts,
  singleDayProblem,
  updateEntryParts,
  validateEntryShape,
} from "./entryRules";

/** Sundays from 2026-11-22, 15:00 (synthetic). */
const SWIM: EditorEntryInput = EditorEntryInputSchema.parse({
  kind: "event",
  icon: "🏊",
  title: "Swimming",
  allDay: false,
  date: "2026-11-22",
  startTime: "15:00",
  endTime: "16:00",
  repeat: { weekly: { weekdays: [7], interval: 1 } },
});

const MONDAYS: EditorEntryInput = {
  ...SWIM,
  date: "2026-11-23",
  repeat: { weekly: { weekdays: [1], interval: 1 } },
};

const SINGLE: EditorEntryInput = { ...SWIM, repeat: "none" };

function oneDay(
  date: string,
  extra: Partial<EditorEntryInput> = {},
): EditorEntryInput {
  return {
    ...SWIM,
    date,
    repeat: "none",
    startTime: "16:00",
    endTime: "17:00",
    ...extra,
  };
}

const PIZZA: EditorEntryInput = EditorEntryInputSchema.parse({
  kind: "meal",
  icon: "🍕",
  title: "Pizza",
  allDay: true,
  date: "2026-11-29",
  slot: "dinner",
});

function series(extra: Partial<EntryParts> = {}): EntryParts {
  return { data: SWIM, exdates: [], overrides: {}, ...extra };
}

function issuesOf(result: { ok: boolean; issues?: unknown }): unknown {
  return result.ok ? null : result.issues;
}

describe("single-day checks", () => {
  it("names a date that is not YYYY-MM-DD", () => {
    expect(dateKeyProblem("2026-11-29")).toBeNull();
    expect(dateKeyProblem("2026-02-30")).toMatchObject({ path: "date" });
    expect(dateKeyProblem("29.11.2026")).toMatchObject({ path: "date" });
  });

  it("names an override that repeats", () => {
    expect(singleDayProblem(oneDay("2026-11-29"))).toBeNull();
    expect(singleDayProblem(SWIM)).toEqual({
      code: "invalid",
      path: "repeat",
      message: "A single day cannot repeat",
    });
  });

  it("names a day that is not an occurrence, and every day of a single entry", () => {
    expect(occurrenceProblem(SWIM, "2026-11-29")).toBeNull();
    expect(occurrenceProblem(SWIM, "2026-11-24")).toMatchObject({
      message: "This day is not part of the series",
    });
    expect(occurrenceProblem(SWIM, "2026-11-15")).toMatchObject({
      path: "date",
    });
    expect(occurrenceProblem(SINGLE, SINGLE.date)).toMatchObject({
      message: "Only a series has single days to change",
    });
  });
});

describe("updateEntryParts", () => {
  const changed = series({
    exdates: ["2026-11-29", "2026-12-06"],
    overrides: { "2026-12-13": oneDay("2026-12-13") },
  });

  it("keeps exceptions and overrides of days that stay occurrences", () => {
    const later = { ...SWIM, title: "Swim club" };
    expect(updateEntryParts(changed, later)).toEqual({
      data: later,
      exdates: changed.exdates,
      overrides: changed.overrides,
    });
  });

  it("drops the days the new rule no longer has", () => {
    const until = {
      ...SWIM,
      repeat: { weekly: { weekdays: [7], interval: 1, until: "2026-12-06" } },
    } satisfies EditorEntryInput;
    expect(updateEntryParts(changed, until)).toEqual({
      data: until,
      exdates: ["2026-11-29", "2026-12-06"],
      overrides: {},
    });
    expect(updateEntryParts(changed, MONDAYS)).toEqual({
      data: MONDAYS,
      exdates: [],
      overrides: {},
    });
  });

  it("drops an override whose kind no longer matches, even on a remaining day", () => {
    const asMeal: EditorEntryInput = {
      ...PIZZA,
      date: SWIM.date,
      repeat: SWIM.repeat,
    };
    expect(updateEntryParts(changed, asMeal)).toEqual({
      data: asMeal,
      exdates: changed.exdates,
      overrides: {},
    });
  });

  it("clears exceptions and overrides when the entry becomes a single one", () => {
    expect(updateEntryParts(changed, SINGLE)).toEqual({
      data: SINGLE,
      exdates: [],
      overrides: {},
    });
  });
});

describe("addExceptionParts", () => {
  it("adds the day sorted and once, and drops an override of that day", () => {
    const current = series({
      exdates: ["2026-12-06"],
      overrides: {
        "2026-11-29": oneDay("2026-11-29"),
        "2026-12-13": oneDay("2026-12-13"),
      },
    });
    const result = addExceptionParts(current, "2026-11-29");
    expect(result).toEqual({
      ok: true,
      value: {
        data: SWIM,
        exdates: ["2026-11-29", "2026-12-06"],
        overrides: { "2026-12-13": oneDay("2026-12-13") },
      },
    });
    expect(addExceptionParts(current, "2026-12-06")).toMatchObject({
      ok: true,
      value: { exdates: ["2026-12-06"] },
    });
  });

  it("refuses a malformed date, a day off the rule and a single entry", () => {
    expect(issuesOf(addExceptionParts(series(), "2026-13-01"))).toEqual([
      expect.objectContaining({ message: "date must be YYYY-MM-DD" }),
    ]);
    expect(issuesOf(addExceptionParts(series(), "2026-11-24"))).toEqual([
      expect.objectContaining({
        message: "This day is not part of the series",
      }),
    ]);
    expect(
      issuesOf(addExceptionParts(series({ data: SINGLE }), SINGLE.date)),
    ).toEqual([
      expect.objectContaining({
        message: "Only a series has single days to change",
      }),
    ]);
  });
});

describe("setOverrideParts", () => {
  it("stores the single day under its original date, sorted, and re-instates an exception", () => {
    const current = series({
      exdates: ["2026-11-29", "2026-12-06"],
      overrides: { "2026-12-13": oneDay("2026-12-13") },
    });
    // Moved to the Monday after: still keyed by the original Sunday.
    const moved = oneDay("2026-11-30");
    const result = setOverrideParts(current, "2026-11-29", moved);
    expect(result).toEqual({
      ok: true,
      value: {
        data: SWIM,
        exdates: ["2026-12-06"],
        overrides: {
          "2026-11-29": moved,
          "2026-12-13": oneDay("2026-12-13"),
        },
      },
    });
    expect(Object.keys(result.ok ? result.value.overrides : {})).toEqual([
      "2026-11-29",
      "2026-12-13",
    ]);
  });

  it("refuses a repeating day, another kind, a day off the rule and a single entry", () => {
    expect(issuesOf(setOverrideParts(series(), "2026-11-29", SWIM))).toEqual([
      expect.objectContaining({ path: "repeat" }),
    ]);
    expect(issuesOf(setOverrideParts(series(), "2026-11-29", PIZZA))).toEqual([
      expect.objectContaining({
        path: "kind",
        message: "A single day keeps the series' kind",
      }),
    ]);
    expect(
      issuesOf(setOverrideParts(series(), "2026-11-24", oneDay("2026-11-24"))),
    ).toEqual([expect.objectContaining({ path: "date" })]);
    expect(
      issuesOf(setOverrideParts(series(), "2026-11", oneDay("2026-11-29"))),
    ).toEqual([
      expect.objectContaining({ message: "date must be YYYY-MM-DD" }),
    ]);
    expect(
      issuesOf(
        setOverrideParts(
          series({ data: SINGLE }),
          SINGLE.date,
          oneDay(SINGLE.date),
        ),
      ),
    ).toEqual([
      expect.objectContaining({
        message: "Only a series has single days to change",
      }),
    ]);
  });
});

describe("validateEntryShape", () => {
  it("parses an entry without a config and reports shape issues by path", () => {
    expect(validateEntryShape({ ...SWIM, childIds: ["anyone"] })).toMatchObject(
      {
        ok: true,
        value: { childIds: ["anyone"] },
      },
    );
    expect(issuesOf(validateEntryShape({ ...SWIM, icon: "" }))).toEqual([
      expect.objectContaining({ code: "invalid", path: "icon" }),
    ]);
  });
});

describe("importEntryParts", () => {
  function entry(extra: Partial<ImportEntryInput> = {}): ImportEntryInput {
    return {
      id: "a",
      kind: "event",
      data: SWIM,
      exdates: [],
      overrides: {},
      ...extra,
    };
  }

  it("returns one normalised part per entry: exceptions deduplicated, sorted and not overridden", () => {
    const result = importEntryParts([
      entry({
        exdates: ["2026-12-06", "2026-11-29", "2026-12-06", "2026-12-13"],
        overrides: {
          "2026-12-13": oneDay("2026-12-13"),
          "2026-11-29": oneDay("2026-11-29"),
        },
      }),
      entry({ id: "b", kind: "meal", data: PIZZA }),
    ]);
    expect(result).toEqual({
      ok: true,
      value: [
        {
          data: SWIM,
          exdates: ["2026-12-06"],
          overrides: {
            "2026-11-29": oneDay("2026-11-29"),
            "2026-12-13": oneDay("2026-12-13"),
          },
        },
        { data: PIZZA, exdates: [], overrides: {} },
      ],
    });
    const keys = result.ok ? Object.keys(result.value[0]?.overrides ?? {}) : [];
    expect(keys).toEqual(["2026-11-29", "2026-12-13"]);
  });

  it("does not check against a config (an unknown child stays)", () => {
    expect(
      importEntryParts([entry({ data: { ...SWIM, childIds: ["gone"] } })]),
    ).toMatchObject({ ok: true, value: [{ data: { childIds: ["gone"] } }] });
  });

  it("collects every issue with its path in the document", () => {
    const result = importEntryParts([
      entry({ data: { ...SWIM, icon: "" } }),
      entry({ id: "a", kind: "meal" }),
      entry({
        id: "c",
        exdates: ["2026-11-24"],
        overrides: {
          "2026-11-25": oneDay("2026-11-25"),
          "2026-11-29": { ...SWIM, title: 7 },
          "2026-12-06": SWIM,
          "2026-12-13": { ...PIZZA, date: "2026-12-13" },
        },
      }),
      entry({ id: "d", data: SINGLE, exdates: [SINGLE.date] }),
    ]);
    expect(issuesOf(result)).toEqual([
      expect.objectContaining({ path: "entries.0.data.icon" }),
      { code: "invalid", path: "entries.1.id", message: "Duplicate entry id" },
      {
        code: "invalid",
        path: "entries.1.kind",
        message: "kind must match data.kind",
      },
      expect.objectContaining({
        path: "entries.2.exdates",
        message: "This day is not part of the series",
      }),
      expect.objectContaining({
        path: "entries.2.overrides.2026-11-25",
        message: "This day is not part of the series",
      }),
      expect.objectContaining({ path: "entries.2.overrides.2026-11-29.title" }),
      expect.objectContaining({
        path: "entries.2.overrides.2026-12-06.repeat",
        message: "A single day cannot repeat",
      }),
      expect.objectContaining({
        path: "entries.2.overrides.2026-12-13.kind",
        message: "A single day keeps the series' kind",
      }),
      expect.objectContaining({
        path: "entries.3.exdates",
        message: "Only a series has single days to change",
      }),
    ]);
  });
});
