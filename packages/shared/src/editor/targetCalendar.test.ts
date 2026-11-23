import { describe, expect, it } from "vitest";

import {
  canHoldEntry,
  pickTargetCalendar,
  type TargetCalendar,
  type TargetEntry,
} from "./targetCalendar";
import { editorTestConfig } from "./testConfig.test-utils";

const config = editorTestConfig();
const all = config.calendars.map((c) => ({ id: c.id }));
const ids = (...list: string[]): Array<{ id: string }> =>
  list.map((id) => ({ id }));

describe("pickTargetCalendar (ADR-0012)", () => {
  it.each<[string, TargetEntry, Array<{ id: string }>, TargetCalendar]>([
    // new events
    [
      "single child -> own calendar",
      { kind: "event", childIds: ["mia"] },
      all,
      { ok: true, sourceId: "mia-cal", move: false },
    ],
    [
      "single child without own calendar -> shared",
      { kind: "event", childIds: ["emile"] },
      all,
      { ok: true, sourceId: "kinder", move: false },
    ],
    [
      "own calendar not writable -> shared",
      { kind: "event", childIds: ["mia"] },
      ids("kinder", "ben-cal"),
      { ok: true, sourceId: "kinder", move: false },
    ],
    [
      "several children -> shared",
      { kind: "event", childIds: ["mia", "ben"] },
      all,
      { ok: true, sourceId: "kinder", move: false },
    ],
    [
      "everyone -> shared",
      { kind: "event", childIds: [] },
      all,
      { ok: true, sourceId: "kinder", move: false },
    ],
    [
      "no shared writable",
      { kind: "event", childIds: ["mia", "ben"] },
      ids("mia-cal", "essen"),
      { ok: false, reason: "no_writable_calendar" },
    ],
    [
      "nothing writable",
      { kind: "event", childIds: [] },
      [],
      { ok: false, reason: "no_writable_calendar" },
    ],
    // new meals
    [
      "meal -> first meals calendar",
      { kind: "meal", childIds: [] },
      all,
      { ok: true, sourceId: "essen", move: false },
    ],
    [
      "meal without meals calendar",
      { kind: "meal", childIds: [] },
      ids("kinder"),
      { ok: false, reason: "no_writable_calendar" },
    ],
    // existing entries stay where they can
    [
      "shared stays for a single child",
      { kind: "event", childIds: ["mia"], sourceId: "kinder" },
      all,
      { ok: true, sourceId: "kinder", move: false },
    ],
    [
      "child calendar stays for everyone (Alle:)",
      { kind: "event", childIds: [], sourceId: "mia-cal" },
      all,
      { ok: true, sourceId: "mia-cal", move: false },
    ],
    [
      "child calendar stays when its child remains",
      { kind: "event", childIds: ["mia", "ben"], sourceId: "mia-cal" },
      all,
      { ok: true, sourceId: "mia-cal", move: false },
    ],
    // moves
    [
      "child removed -> move to the new child's calendar",
      { kind: "event", childIds: ["ben"], sourceId: "mia-cal" },
      all,
      { ok: true, sourceId: "ben-cal", move: true, fromSourceId: "mia-cal" },
    ],
    [
      "child removed -> move to shared",
      { kind: "event", childIds: ["ben", "juergen"], sourceId: "mia-cal" },
      all,
      { ok: true, sourceId: "kinder", move: true, fromSourceId: "mia-cal" },
    ],
    [
      "move without destination",
      { kind: "event", childIds: ["ben", "juergen"], sourceId: "mia-cal" },
      ids("mia-cal"),
      { ok: false, reason: "no_writable_calendar" },
    ],
    [
      "instances cannot move alone",
      {
        kind: "event",
        childIds: ["ben"],
        sourceId: "mia-cal",
        recurringEventId: "series",
      },
      all,
      { ok: false, reason: "instance_cannot_move" },
    ],
    [
      "instance stays when expressible",
      {
        kind: "event",
        childIds: ["mia"],
        sourceId: "mia-cal",
        recurringEventId: "series",
      },
      all,
      { ok: true, sourceId: "mia-cal", move: false },
    ],
    [
      "kind changed -> move",
      { kind: "meal", childIds: [], sourceId: "kinder" },
      all,
      { ok: true, sourceId: "essen", move: true, fromSourceId: "kinder" },
    ],
    // current calendar not writable / unknown
    [
      "source not writable",
      { kind: "event", childIds: [], sourceId: "kinder" },
      ids("mia-cal"),
      { ok: false, reason: "source_not_writable" },
    ],
    [
      "unknown source",
      { kind: "event", childIds: [], sourceId: "gone" },
      all,
      { ok: false, reason: "source_not_writable" },
    ],
    [
      "writable ids not in config are ignored",
      { kind: "event", childIds: [] },
      ids("other"),
      { ok: false, reason: "no_writable_calendar" },
    ],
  ])("%s", (_label, entry, writable, expected) => {
    expect(pickTargetCalendar(entry, writable, config)).toEqual(expected);
  });

  it("uses config order for 'first'", () => {
    const twoShared = editorTestConfig({
      calendars: [
        { id: "b-shared", kind: "events" },
        { id: "a-shared", kind: "events" },
        { id: "essen-2", kind: "meals" },
        { id: "essen", kind: "meals" },
      ],
    });
    expect(
      pickTargetCalendar(
        { kind: "event", childIds: [] },
        ids("a-shared", "b-shared"),
        twoShared,
      ),
    ).toEqual({ ok: true, sourceId: "b-shared", move: false });
    expect(
      pickTargetCalendar(
        { kind: "meal", childIds: [] },
        ids("essen", "essen-2"),
        twoShared,
      ),
    ).toEqual({ ok: true, sourceId: "essen-2", move: false });
  });

  it("canHoldEntry checks kind and children", () => {
    const miaCal = { id: "mia-cal", kind: "events" as const, childId: "mia" };
    expect(canHoldEntry({ kind: "event", childIds: ["mia"] }, miaCal)).toBe(
      true,
    );
    expect(canHoldEntry({ kind: "event", childIds: ["ben"] }, miaCal)).toBe(
      false,
    );
    expect(canHoldEntry({ kind: "meal", childIds: [] }, miaCal)).toBe(false);
    expect(
      canHoldEntry(
        { kind: "meal", childIds: [] },
        { id: "essen", kind: "meals" },
      ),
    ).toBe(true);
  });
});
