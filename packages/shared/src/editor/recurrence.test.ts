import { describe, expect, it } from "vitest";

import type { EditorRepeat } from "./entry";
import {
  buildRecurrence,
  buildRecurrenceRule,
  exdateLines,
  parseRecurrence,
  rebaseExdates,
  type RecurrenceStart,
} from "./recurrence";

const BERLIN = "Europe/Berlin";
const LA = "America/Los_Angeles";

function weekly(
  weekdays: number[],
  interval: 1 | 2 = 1,
  until?: string,
): EditorRepeat {
  return {
    weekly: { weekdays, interval, ...(until === undefined ? {} : { until }) },
  };
}

describe("buildRecurrence", () => {
  const timed: RecurrenceStart = { date: "2026-11-23", startTime: "17:00" };
  const allDay: RecurrenceStart = { date: "2026-11-23" };

  it("none -> no lines", () => {
    expect(buildRecurrence("none", timed, BERLIN)).toEqual([]);
  });

  it.each<[EditorRepeat, RecurrenceStart, string, string]>([
    [weekly([1]), timed, BERLIN, "RRULE:FREQ=WEEKLY;BYDAY=MO"],
    [weekly([5, 1, 3]), timed, BERLIN, "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"],
    [
      weekly([7, 1], 2),
      timed,
      BERLIN,
      "RRULE:FREQ=WEEKLY;BYDAY=MO,SU;INTERVAL=2",
    ],
    // all-day: UNTIL is the DATE of the last day
    [
      weekly([1], 1, "2026-12-28"),
      allDay,
      BERLIN,
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261228",
    ],
    [
      weekly([1], 2, "2026-12-28"),
      allDay,
      LA,
      "RRULE:FREQ=WEEKLY;BYDAY=MO;INTERVAL=2;UNTIL=20261228",
    ],
    // timed: last second of the last local day, in UTC, with that day's offset
    [
      weekly([1], 1, "2026-12-31"),
      timed,
      BERLIN,
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T225959Z",
    ],
    [
      weekly([1], 1, "2026-03-28"),
      timed,
      BERLIN,
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260328T225959Z",
    ],
    [
      weekly([1], 1, "2026-03-29"),
      timed,
      BERLIN,
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260329T215959Z",
    ],
    [
      weekly([1], 1, "2026-10-25"),
      timed,
      BERLIN,
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261025T225959Z",
    ],
    [
      weekly([1], 1, "2026-07-01"),
      timed,
      BERLIN,
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260701T215959Z",
    ],
    [
      weekly([1], 1, "2026-03-07"),
      timed,
      LA,
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260308T075959Z",
    ],
    [
      weekly([1], 1, "2026-03-08"),
      timed,
      LA,
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260309T065959Z",
    ],
    [
      weekly([1], 1, "2026-11-01"),
      timed,
      LA,
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261102T075959Z",
    ],
  ])("%j %j %s -> %s", (repeat, start, zone, expected) => {
    expect(
      buildRecurrence(repeat, { ...start, date: "2026-01-05" }, zone),
    ).toEqual([expected]);
  });

  it("buildRecurrenceRule gives the value without the property name (ical.js form)", () => {
    expect(buildRecurrenceRule("none", timed, BERLIN)).toBeNull();
    expect(
      buildRecurrenceRule(weekly([3, 1], 2, "2026-12-31"), timed, BERLIN),
    ).toBe("FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=2;UNTIL=20261231T225959Z");
    expect(
      buildRecurrenceRule(weekly([1], 1, "2026-12-28"), allDay, BERLIN),
    ).toBe("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261228");
  });

  it("rejects an end before the start", () => {
    expect(() =>
      buildRecurrence(weekly([1], 1, "2026-11-16"), timed, BERLIN),
    ).toThrow(RangeError);
  });
});

describe("parseRecurrence", () => {
  const start: RecurrenceStart = { date: "2026-11-23", startTime: "17:00" };

  it.each<[string[] | undefined, EditorRepeat]>([
    [undefined, "none"],
    [[], "none"],
    [["EXDATE;TZID=Europe/Berlin:20261130T170000"], "none"],
    [["RRULE:FREQ=WEEKLY;BYDAY=MO"], weekly([1])],
    [["RRULE:FREQ=WEEKLY"], weekly([1])],
    [["rrule:freq=weekly;byday=fr,mo,mo"], weekly([1, 5])],
    [["RRULE:FREQ=WEEKLY;BYDAY=MO,TH;INTERVAL=2"], weekly([1, 4], 2)],
    [["RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO"], weekly([1])],
    [["RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=MO,SU"], weekly([1, 7])],
    [["RRULE:FREQ=WEEKLY;WKST=SU;INTERVAL=2;BYDAY=MO"], weekly([1], 2)],
    [["RRULE:FREQ=WEEKLY;WKST=MO;INTERVAL=2;BYDAY=MO,SU"], weekly([1, 7], 2)],
    [
      [
        "RRULE:FREQ=WEEKLY;BYDAY=MO",
        "EXDATE;TZID=Europe/Berlin:20261130T170000",
      ],
      weekly([1]),
    ],
    // UNTIL forms: UTC (Google), DATE, floating
    [
      ["RRULE:FREQ=WEEKLY;WKST=SU;UNTIL=20261231T225959Z;BYDAY=MO"],
      weekly([1], 1, "2026-12-31"),
    ],
    [
      ["RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261207"],
      weekly([1], 1, "2026-12-07"),
    ],
    [
      ["RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261207T170000"],
      weekly([1], 1, "2026-12-07"),
    ],
    // UNTIL before that day's start time -> the day before is the last one covered
    [
      ["RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261207T120000Z"],
      weekly([1], 1, "2026-12-06"),
    ],
    [
      ["RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261207T160000Z"],
      weekly([1], 1, "2026-12-07"),
    ],
  ])("%j -> %j", (lines, expected) => {
    expect(parseRecurrence(lines, start, BERLIN)).toEqual(expected);
  });

  it.each<[string, string[]]>([
    ["COUNT", ["RRULE:FREQ=WEEKLY;COUNT=5;BYDAY=MO"]],
    ["BYMONTHDAY", ["RRULE:FREQ=WEEKLY;BYMONTHDAY=1"]],
    ["MONTHLY", ["RRULE:FREQ=MONTHLY;BYDAY=1MO"]],
    ["DAILY", ["RRULE:FREQ=DAILY"]],
    ["RDATE", ["RRULE:FREQ=WEEKLY;BYDAY=MO", "RDATE;VALUE=DATE:20261225"]],
    [
      "EXRULE",
      ["RRULE:FREQ=WEEKLY;BYDAY=MO", "EXRULE:FREQ=WEEKLY;BYDAY=MO;INTERVAL=4"],
    ],
    [
      "several RRULEs",
      ["RRULE:FREQ=WEEKLY;BYDAY=MO", "RRULE:FREQ=WEEKLY;BYDAY=TU"],
    ],
    ["INTERVAL=3", ["RRULE:FREQ=WEEKLY;BYDAY=MO;INTERVAL=3"]],
    ["ordinal day", ["RRULE:FREQ=WEEKLY;BYDAY=1MO"]],
    ["start not a rule day", ["RRULE:FREQ=WEEKLY;BYDAY=TU"]],
    ["UNTIL before start", ["RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261101"]],
    ["bad UNTIL", ["RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=tomorrow"]],
    [
      "WKST=SU with INTERVAL=2 and days",
      ["RRULE:FREQ=WEEKLY;WKST=SU;INTERVAL=2;BYDAY=MO,SU"],
    ],
    ["duplicate part", ["RRULE:FREQ=WEEKLY;BYDAY=MO;BYDAY=TU"]],
    ["unknown line", ["X-FOO:bar"]],
    ["no FREQ", ["RRULE:BYDAY=MO"]],
  ])("%s -> null", (_label, lines) => {
    expect(parseRecurrence(lines, start, BERLIN)).toBeNull();
  });

  describe("round trip with DST weeks", () => {
    const repeats: EditorRepeat[] = [
      weekly([1]),
      weekly([1, 3, 5]),
      weekly([1, 7], 2),
      weekly([1], 1, "2026-03-30"),
      weekly([1, 2], 2, "2026-11-02"),
      weekly([1], 1, "2026-10-26"),
      weekly([1, 6], 1, "2026-03-28"),
      weekly([1], 1, "2026-03-23"),
    ];
    const starts: RecurrenceStart[] = [
      { date: "2026-03-23" },
      { date: "2026-03-23", startTime: "00:00" },
      { date: "2026-03-23", startTime: "02:30" },
      { date: "2026-03-23", startTime: "17:00" },
      { date: "2026-03-23", startTime: "23:59" },
    ];
    for (const zone of [BERLIN, LA]) {
      for (const s of starts) {
        it.each(repeats)(`${zone} ${JSON.stringify(s)} %j`, (repeat) => {
          expect(
            parseRecurrence(buildRecurrence(repeat, s, zone), s, zone),
          ).toEqual(repeat);
        });
      }
    }
  });
});

describe("EXDATE handling", () => {
  const lines = [
    "RRULE:FREQ=WEEKLY;BYDAY=MO",
    "EXDATE;TZID=Europe/Berlin:20261130T170000,20261207T170000",
    "EXDATE:20261214T160000Z",
    "EXDATE;VALUE=DATE:20261221",
    "EXDATE;TZID=America/New_York:20261228T200000",
  ];

  it("keeps EXDATE lines unchanged", () => {
    expect(exdateLines(lines)).toEqual(lines.slice(1));
    expect(exdateLines(undefined)).toEqual([]);
  });

  it("rebases them to a new start time in the configured zone", () => {
    expect(
      rebaseExdates(lines, { date: "2026-11-23", startTime: "18:30" }, BERLIN),
    ).toEqual([
      "EXDATE;TZID=Europe/Berlin:20261130T183000,20261207T183000,20261214T183000,20261221T183000,20261229T183000",
    ]);
  });

  it("rebases them to all-day dates", () => {
    expect(rebaseExdates(lines, { date: "2026-11-23" }, BERLIN)).toEqual([
      "EXDATE;VALUE=DATE:20261130,20261207,20261214,20261221,20261229",
    ]);
  });

  it("drops unreadable values and returns [] without any", () => {
    expect(
      rebaseExdates(["EXDATE:garbage"], { date: "2026-11-23" }, BERLIN),
    ).toEqual([]);
    expect(
      rebaseExdates(["RRULE:FREQ=WEEKLY"], { date: "2026-11-23" }, BERLIN),
    ).toEqual([]);
  });
});
