import { describe, expect, it } from "vitest";

import type { CalendarSource } from "../model";
import { parseBringList } from "../title/parseBringList";
import { parseTitle } from "../title/parseTitle";
import {
  type EditorEntryInput,
  EditorEntryInputSchema,
  EditorEntrySchema,
} from "./entry";
import {
  fromGoogleEvent,
  type GoogleEvent,
  GoogleEventSchema,
  toGoogleEvent,
} from "./googleEvent";
import { editorTestConfig } from "./testConfig.test-utils";

const config = editorTestConfig();
const la = editorTestConfig({ timeZone: "America/Los_Angeles", locale: "en" });
const PRIVATE = "TESTONLY-private-note";

function source(id: string): CalendarSource {
  const found = config.calendars.find((c) => c.id === id);
  if (found === undefined) {
    throw new Error(`fixture: ${id}`);
  }
  return found;
}

function input(value: Record<string, unknown>): EditorEntryInput {
  return EditorEntryInputSchema.parse(value);
}

function google(value: Record<string, unknown>): GoogleEvent {
  return GoogleEventSchema.parse(value);
}

describe("GoogleEventSchema", () => {
  it("ignores unknown fields and keeps the used ones", () => {
    const event = google({
      kind: "calendar#event",
      id: "evt1",
      etag: '"123"',
      status: "confirmed",
      htmlLink: "https://example.invalid/event",
      summary: "Mia: 🏊 Schwimmen",
      start: {
        dateTime: "2026-11-23T17:00:00+01:00",
        timeZone: "Europe/Berlin",
      },
      end: { dateTime: "2026-11-23T18:00:00+01:00", timeZone: "Europe/Berlin" },
      reminders: { useDefault: true },
    });
    expect(event).not.toHaveProperty("htmlLink");
    expect(event).not.toHaveProperty("kind");
    expect(event.summary).toBe("Mia: 🏊 Schwimmen");
  });

  it("rejects start values with both or neither of date and dateTime", () => {
    expect(
      GoogleEventSchema.safeParse({ id: "x", start: { timeZone: "UTC" } })
        .success,
    ).toBe(false);
    expect(
      GoogleEventSchema.safeParse({
        id: "x",
        start: { date: "2026-11-23", dateTime: "2026-11-23T10:00:00Z" },
      }).success,
    ).toBe(false);
  });
});

describe("toGoogleEvent", () => {
  it("timed event with default duration in the config zone", () => {
    const write = toGoogleEvent(
      input({
        kind: "event",
        childIds: ["mia"],
        icon: "🏊",
        title: "Schwimmen",
        allDay: false,
        date: "2026-11-23",
        startTime: "17:00",
        bring: ["🩱", "🧴"],
      }),
      config,
      { sourceId: "kinder" },
    );
    expect(write).toEqual({
      summary: "Mia: 🏊 Schwimmen",
      description: "Mitbringen: 🩱 🧴",
      start: {
        dateTime: "2026-11-23T17:00:00+01:00",
        timeZone: "Europe/Berlin",
      },
      end: { dateTime: "2026-11-23T18:00:00+01:00", timeZone: "Europe/Berlin" },
    });
  });

  it("all-day and multi-day events use exclusive end dates", () => {
    const base = {
      kind: "event",
      icon: "🏕️",
      title: "Zeltlager",
      allDay: true,
      date: "2026-07-10",
    };
    expect(
      toGoogleEvent(input(base), config, { sourceId: "kinder" }),
    ).toMatchObject({
      summary: "🏕️ Zeltlager",
      start: { date: "2026-07-10", timeZone: "Europe/Berlin" },
      end: { date: "2026-07-11", timeZone: "Europe/Berlin" },
    });
    expect(
      toGoogleEvent(input({ ...base, endDate: "2026-07-13" }), config, {
        sourceId: "kinder",
      }),
    ).toMatchObject({ end: { date: "2026-07-13" } });
  });

  it("weekly series across DST keeps the wall-clock time (start.timeZone)", () => {
    const write = toGoogleEvent(
      input({
        kind: "event",
        childIds: ["ben"],
        icon: "⚽",
        title: "Fußball",
        allDay: false,
        date: "2026-03-23",
        startTime: "17:00",
        endTime: "18:30",
        repeat: { weekly: { weekdays: [1, 3], until: "2026-04-15" } },
      }),
      config,
      { sourceId: "ben-cal" },
    );
    expect(write).toEqual({
      summary: "⚽ Fußball",
      description: "",
      start: {
        dateTime: "2026-03-23T17:00:00+01:00",
        timeZone: "Europe/Berlin",
      },
      end: { dateTime: "2026-03-23T18:30:00+01:00", timeZone: "Europe/Berlin" },
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20260415T215959Z"],
    });
  });

  it("uses the configured zone, not the device zone (Los Angeles, DST week)", () => {
    const write = toGoogleEvent(
      input({
        kind: "event",
        icon: "🎹",
        title: "Piano",
        allDay: false,
        date: "2026-03-09",
        startTime: "08:00",
        endTime: "09:00",
      }),
      la,
      { sourceId: "kinder" },
    );
    expect(write.start).toEqual({
      dateTime: "2026-03-09T08:00:00-07:00",
      timeZone: "America/Los_Angeles",
    });
  });

  it("timed default end may roll over midnight; explicit endDate is honoured", () => {
    const late = toGoogleEvent(
      input({
        kind: "event",
        icon: "🌙",
        title: "Nacht",
        allDay: false,
        date: "2026-11-23",
        startTime: "23:30",
      }),
      config,
      { sourceId: "kinder" },
    );
    expect(late.end.dateTime).toBe("2026-11-24T00:30:00+01:00");
    const overnight = toGoogleEvent(
      input({
        kind: "event",
        icon: "🌙",
        title: "Nacht",
        allDay: false,
        date: "2026-11-23",
        startTime: "22:00",
        endDate: "2026-11-24",
        endTime: "07:00",
      }),
      config,
      { sourceId: "kinder" },
    );
    expect(overnight.end.dateTime).toBe("2026-11-24T07:00:00+01:00");
  });

  it.each<[string, Record<string, unknown>, string, string]>([
    [
      "Europe/Berlin",
      { date: "2026-03-29", startTime: "02:30" },
      "2026-03-29T03:30:00+02:00",
      "2026-03-29T04:30:00+02:00",
    ],
    [
      "America/Los_Angeles",
      { date: "2026-03-08", startTime: "02:15" },
      "2026-03-08T03:15:00-07:00",
      "2026-03-08T04:15:00-07:00",
    ],
    [
      "Europe/Berlin",
      { date: "2026-03-29", startTime: "02:30", endTime: "04:00" },
      "2026-03-29T03:30:00+02:00",
      "2026-03-29T04:00:00+02:00",
    ],
  ])(
    "DST gap in %s %j keeps end after start",
    (timeZone, times, start, end) => {
      const write = toGoogleEvent(
        input({
          kind: "event",
          icon: "🌙",
          title: "Nacht",
          allDay: false,
          ...times,
        }),
        editorTestConfig({ timeZone }),
        { sourceId: "kinder" },
      );
      expect([write.start.dateTime, write.end.dateTime]).toEqual([start, end]);
    },
  );

  it.each([
    ["Europe/Berlin", "2026-03-29", "02:30", "03:00"],
    ["America/Los_Angeles", "2026-03-08", "02:15", "03:00"],
  ])(
    "DST gap in %s: explicit end before the moved start throws",
    (timeZone, date, startTime, endTime) => {
      expect(() =>
        toGoogleEvent(
          input({
            kind: "event",
            icon: "🌙",
            title: "Nacht",
            allDay: false,
            date,
            startTime,
            endTime,
          }),
          editorTestConfig({ timeZone }),
          { sourceId: "kinder" },
        ),
      ).toThrow(RangeError);
    },
  );

  it("meal: slot prefix, description kept untouched", () => {
    const write = toGoogleEvent(
      input({
        kind: "meal",
        icon: "🍝",
        title: "Spaghetti",
        allDay: true,
        date: "2026-11-23",
        slot: "lunch",
      }),
      config,
      {
        sourceId: "essen",
        existing: google({
          id: "m1",
          description: `${PRIVATE}\nMitbringen: 🎨`,
        }),
      },
    );
    expect(write.summary).toBe("Mittag: 🍝 Spaghetti");
    expect(write.description).toBe(`${PRIVATE}\nMitbringen: 🎨`);
  });

  it("countdown marker only when the icon is not a countdown emoji", () => {
    const base = {
      kind: "event",
      title: "Feier",
      allDay: true,
      date: "2026-12-24",
      countdown: true,
    };
    expect(
      toGoogleEvent(input({ ...base, icon: "🎈" }), config, {
        sourceId: "kinder",
      }).description,
    ).toBe("#countdown");
    expect(
      toGoogleEvent(input({ ...base, icon: "🎄" }), config, {
        sourceId: "kinder",
      }).description,
    ).toBe("");
    // an existing marker is left alone for countdown icons
    expect(
      toGoogleEvent(input({ ...base, icon: "🎄" }), config, {
        sourceId: "kinder",
        existing: google({ id: "e", description: `${PRIVATE} #countdown` }),
      }).description,
    ).toBe(`${PRIVATE} #countdown`);
    expect(
      toGoogleEvent(input({ ...base, icon: "🎈", countdown: false }), config, {
        sourceId: "kinder",
        existing: google({ id: "e", description: `${PRIVATE}\n#countdown` }),
      }).description,
    ).toBe(PRIVATE);
  });

  describe("master edits", () => {
    const existing = google({
      id: "series",
      description: `<p>${PRIVATE}</p><p>Mitbringen: 👟</p>`,
      start: {
        dateTime: "2026-11-23T17:00:00+01:00",
        timeZone: "Europe/Berlin",
      },
      end: { dateTime: "2026-11-23T18:00:00+01:00", timeZone: "Europe/Berlin" },
      recurrence: [
        "RRULE:FREQ=WEEKLY;BYDAY=MO",
        "EXDATE;TZID=Europe/Berlin:20261130T170000",
      ],
    });
    const base = {
      kind: "event",
      icon: "🏊",
      title: "Schwimmen",
      allDay: false,
      date: "2026-11-23",
      startTime: "17:00",
      repeat: { weekly: { weekdays: [1, 4] } },
      bring: ["🩱"],
    };

    it("keeps EXDATE lines byte for byte and the description's other lines", () => {
      const write = toGoogleEvent(input(base), config, {
        sourceId: "kinder",
        existing,
      });
      expect(write.recurrence).toEqual([
        "RRULE:FREQ=WEEKLY;BYDAY=MO,TH",
        "EXDATE;TZID=Europe/Berlin:20261130T170000",
      ]);
      expect(write.description).toBe(`<p>${PRIVATE}</p><p>Mitbringen: 🩱</p>`);
    });

    it("rebases EXDATE lines when the time changes", () => {
      const write = toGoogleEvent(
        input({ ...base, startTime: "18:00" }),
        config,
        {
          sourceId: "kinder",
          existing,
        },
      );
      expect(write.recurrence).toEqual([
        "RRULE:FREQ=WEEKLY;BYDAY=MO,TH",
        "EXDATE;TZID=Europe/Berlin:20261130T180000",
      ]);
    });

    it("clears the recurrence when a series becomes a single event", () => {
      const write = toGoogleEvent(input({ ...base, repeat: "none" }), config, {
        sourceId: "kinder",
        existing,
      });
      expect(write.recurrence).toEqual([]);
    });

    it("leaves the recurrence alone for instances and non-editable rules", () => {
      expect(
        toGoogleEvent(input(base), config, {
          sourceId: "kinder",
          existing,
          instance: true,
        }),
      ).not.toHaveProperty("recurrence");
      expect(
        toGoogleEvent(input(base), config, {
          sourceId: "kinder",
          existing,
          repeatEditable: false,
        }),
      ).not.toHaveProperty("recurrence");
    });
  });
});

describe("fromGoogleEvent", () => {
  it("timed event: title, children, bring, times in the config zone", () => {
    const entry = fromGoogleEvent(
      google({
        id: "e1",
        etag: '"e1"',
        summary: "Ben: 🏊 Schwimmen",
        description: `${PRIVATE}\nMitbringen: 🩱 🧴`,
        // returned in another offset: still read in the config zone
        start: { dateTime: "2026-11-23T16:00:00Z" },
        end: { dateTime: "2026-11-23T12:30:00-05:00" },
      }),
      source("mia-cal"),
      config,
    );
    expect(entry).toEqual({
      kind: "event",
      childIds: ["mia", "ben"],
      icon: "🏊",
      title: "Schwimmen",
      allDay: false,
      date: "2026-11-23",
      startTime: "17:00",
      endTime: "18:30",
      repeat: "none",
      bring: ["🩱", "🧴"],
      countdown: false,
      id: "e1",
      etag: '"e1"',
      sourceId: "mia-cal",
      repeatEditable: true,
    });
    expect(EditorEntrySchema.safeParse(entry).success).toBe(true);
  });

  it("all-day and multi-day events", () => {
    const one = fromGoogleEvent(
      google({
        id: "a",
        summary: "Zahnarzt",
        start: { date: "2026-11-24" },
        end: { date: "2026-11-25" },
      }),
      source("kinder"),
      config,
    );
    expect(one).toMatchObject({
      allDay: true,
      date: "2026-11-24",
      icon: "🦷",
      childIds: [],
    });
    expect(one).not.toHaveProperty("endDate");
    const multi = fromGoogleEvent(
      google({
        id: "b",
        summary: "🏕️ Zeltlager",
        start: { date: "2026-07-10" },
        end: { date: "2026-07-13" },
      }),
      source("kinder"),
      config,
    );
    expect(multi).toMatchObject({
      allDay: true,
      date: "2026-07-10",
      endDate: "2026-07-13",
    });
  });

  it("timed event across midnight keeps the end date", () => {
    const entry = fromGoogleEvent(
      google({
        id: "n",
        summary: "🌙 Nacht",
        start: { dateTime: "2026-11-23T22:00:00+01:00" },
        end: { dateTime: "2026-11-24T07:00:00+01:00" },
      }),
      source("kinder"),
      config,
    );
    expect(entry).toMatchObject({
      startTime: "22:00",
      endTime: "07:00",
      endDate: "2026-11-24",
    });
    expect(EditorEntrySchema.safeParse(entry).success).toBe(true);
  });

  it("series master with an editable rule and one without", () => {
    const master = google({
      id: "m",
      summary: "Alle: 🎵 Musik",
      start: {
        dateTime: "2026-11-23T15:00:00+01:00",
        timeZone: "Europe/Berlin",
      },
      end: { dateTime: "2026-11-23T16:00:00+01:00", timeZone: "Europe/Berlin" },
      recurrence: [
        "RRULE:FREQ=WEEKLY;WKST=SU;INTERVAL=2;UNTIL=20261231T225959Z;BYDAY=MO",
      ],
    });
    expect(fromGoogleEvent(master, source("mia-cal"), config)).toMatchObject({
      childIds: [],
      repeat: { weekly: { weekdays: [1], interval: 2, until: "2026-12-31" } },
      repeatEditable: true,
    });
    const monthly = { ...master, recurrence: ["RRULE:FREQ=MONTHLY;BYDAY=4MO"] };
    expect(fromGoogleEvent(monthly, source("mia-cal"), config)).toMatchObject({
      childIds: [],
      repeat: "none",
      repeatEditable: false,
    });
  });

  it("instance: rule from the master when given, else not editable", () => {
    const master = google({
      id: "m",
      summary: "🎵 Musik",
      start: { dateTime: "2026-11-23T15:00:00+01:00" },
      end: { dateTime: "2026-11-23T16:00:00+01:00" },
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO"],
    });
    const instance = google({
      id: "m_20261201T140000Z",
      summary: "🎵 Musik (verschoben)",
      recurringEventId: "m",
      originalStartTime: { dateTime: "2026-11-30T15:00:00+01:00" },
      start: { dateTime: "2026-12-01T15:00:00+01:00" },
      end: { dateTime: "2026-12-01T16:00:00+01:00" },
    });
    const withMaster = fromGoogleEvent(instance, source("kinder"), config, {
      master,
    });
    expect(withMaster).toMatchObject({
      id: "m_20261201T140000Z",
      recurringEventId: "m",
      date: "2026-12-01",
      title: "Musik (verschoben)",
      repeat: { weekly: { weekdays: [1], interval: 1 } },
      repeatEditable: true,
    });
    expect(EditorEntrySchema.safeParse(withMaster).success).toBe(true);
    expect(fromGoogleEvent(instance, source("kinder"), config)).toMatchObject({
      repeat: "none",
      repeatEditable: false,
    });
  });

  it("meal: slot from the prefix, no children/bring/countdown", () => {
    expect(
      fromGoogleEvent(
        google({
          id: "meal",
          summary: "Abendessen: 🍕 Pizza",
          description: "Mitbringen: 🎨 #countdown",
          start: { date: "2026-11-23" },
          end: { date: "2026-11-24" },
        }),
        source("essen"),
        config,
      ),
    ).toMatchObject({
      kind: "meal",
      slot: "dinner",
      icon: "🍕",
      title: "Pizza",
      childIds: [],
      bring: [],
      countdown: false,
    });
  });

  it("returns null for cancelled or unreadable events", () => {
    expect(
      fromGoogleEvent(
        google({ id: "c", status: "cancelled" }),
        source("kinder"),
        config,
      ),
    ).toBeNull();
    expect(
      fromGoogleEvent(
        google({ id: "c", summary: "x" }),
        source("kinder"),
        config,
      ),
    ).toBeNull();
    expect(
      fromGoogleEvent(
        google({
          id: "c",
          start: { date: "2026-11-23" },
          end: { dateTime: "2026-11-23T10:00:00Z" },
        }),
        source("kinder"),
        config,
      ),
    ).toBeNull();
  });

  it("round trip: toGoogleEvent -> fromGoogleEvent gives the same entry", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [
        {
          kind: "event",
          childIds: ["ben"],
          icon: "⚽",
          title: "Mia: Training",
          allDay: false,
          date: "2026-03-23",
          startTime: "17:00",
          endTime: "18:30",
          repeat: {
            weekly: { weekdays: [1, 3], interval: 2, until: "2026-04-15" },
          },
          bring: ["👟", "🧴"],
          countdown: false,
        },
        "ben-cal",
      ],
      [
        {
          kind: "event",
          childIds: [],
          icon: "🎈",
          title: "Fest",
          allDay: true,
          date: "2026-10-24",
          endDate: "2026-10-26",
          repeat: "none",
          bring: [],
          countdown: true,
        },
        "mia-cal",
      ],
      [
        {
          kind: "event",
          childIds: ["mia", "juergen"],
          icon: "🛁",
          title: "Baden",
          allDay: false,
          date: "2026-10-25",
          startTime: "02:30",
          endTime: "03:00",
          repeat: { weekly: { weekdays: [7] } },
          bring: [],
          countdown: false,
        },
        "kinder",
      ],
      [
        {
          kind: "meal",
          childIds: [],
          icon: "🍝",
          title: "Spaghetti",
          allDay: true,
          date: "2026-11-23",
          repeat: { weekly: { weekdays: [1, 5] } },
          bring: [],
          countdown: false,
          slot: "lunch",
        },
        "essen",
      ],
    ];
    for (const [value, sourceId] of cases) {
      const entry = input(value);
      const write = toGoogleEvent(entry, config, { sourceId });
      const back = fromGoogleEvent(
        google({ id: "rt", ...write }),
        source(sourceId),
        config,
      );
      const expected: Record<string, unknown> = {
        ...entry,
        id: "rt",
        sourceId,
        repeatEditable: true,
      };
      expect(back, JSON.stringify(value)).toEqual(expected);
      // and the board's reader agrees with the written fields
      const parsed = parseTitle(write.summary, {
        kind: source(sourceId).kind,
        children: config.children,
        countdownEmojis: config.countdown.emojis,
        description: write.description,
      });
      expect(parsed.title).toBe(entry.title);
      if (entry.kind === "event") {
        expect(parseBringList(write.description)).toEqual(entry.bring);
        expect(parsed.countdown).toBe(entry.countdown);
      }
    }
  });
});
