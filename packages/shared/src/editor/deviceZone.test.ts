import { describe, expect, it } from "vitest";

import { EditorEntryInputSchema } from "./entry";
import {
  fromGoogleEvent,
  GoogleEventSchema,
  toGoogleEvent,
} from "./googleEvent";
import { editorTestConfig } from "./testConfig.test-utils";

describe("device time zone is never used", () => {
  it("runs under a device zone different from the configured ones", () => {
    // Set in packages/shared/vitest.config.ts; if this fails the guard is not active.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
      "Pacific/Kiritimati",
    );
    expect(new Date("2026-11-23T12:00:00Z").getTimezoneOffset()).toBe(-14 * 60);
    expect(new Date("2026-11-23T12:00:00Z").getDate()).toBe(24);
  });

  it("writes and reads wall-clock times in the configured zone", () => {
    const config = editorTestConfig();
    const entry = EditorEntryInputSchema.parse({
      kind: "event",
      icon: "🏊",
      title: "Schwimmen",
      allDay: false,
      date: "2026-11-23",
      startTime: "17:00",
    });
    const write = toGoogleEvent(entry, config, { sourceId: "kinder" });
    expect(write.start.dateTime).toBe("2026-11-23T17:00:00+01:00");
    const back = fromGoogleEvent(
      GoogleEventSchema.parse({ id: "x", ...write }),
      { id: "kinder", kind: "events" },
      config,
    );
    expect(back).toMatchObject({
      date: "2026-11-23",
      startTime: "17:00",
      endTime: "18:00",
    });
  });
});
