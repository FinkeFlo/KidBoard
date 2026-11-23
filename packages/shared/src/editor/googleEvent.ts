import { z } from "zod";

import type { AppConfig } from "../config";
import { addCalendarDays, calendarDaysBetween, isDateKey } from "../dates";
import type { CalendarSource } from "../model";
import { DateStringSchema, isValidTimeZone } from "../primitives";
import { parseBringList } from "../title/parseBringList";
import { parseTitle } from "../title/parseTitle";
import { composeDescription } from "./composeDescription";
import {
  composeTitle,
  mergeSourceChildIds,
  resolveWriteLocale,
  type WriteLocale,
} from "./composeTitle";
import type { EditorEntry, EditorEntryInput, EditorRepeat } from "./entry";
import {
  buildRecurrence,
  exdateLines,
  parseRecurrence,
  rebaseExdates,
  type RecurrenceStart,
} from "./recurrence";
import { resolveTimedRange } from "./timeRange";
import {
  formatZonedDateTime,
  wallTimeInZone,
  zonedWallTimeToEpochMs,
} from "./zonedTime";

/**
 * Google Calendar API v3 `Event` resource, only the fields the editor uses. Unknown
 * fields are stripped (`z.object`), never an error.
 */
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/u;

export const GoogleEventDateTimeSchema = z
  .object({
    date: DateStringSchema.optional(),
    /** RFC 3339; Google always sends an offset, writes may omit it when `timeZone` is set. */
    dateTime: z
      .union([
        z.iso.datetime({ offset: true }),
        z.string().regex(LOCAL_DATE_TIME),
      ])
      .optional(),
    timeZone: z.string().min(1).optional(),
  })
  .refine(
    (value) => (value.date === undefined) !== (value.dateTime === undefined),
    {
      message: "Exactly one of date and dateTime",
    },
  );
export type GoogleEventDateTime = z.infer<typeof GoogleEventDateTimeSchema>;

export const GoogleEventSchema = z.object({
  id: z.string().min(1),
  etag: z.string().optional(),
  status: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  /** Absent on cancelled instances in list responses. */
  start: GoogleEventDateTimeSchema.optional(),
  end: GoogleEventDateTimeSchema.optional(),
  recurrence: z.array(z.string()).optional(),
  recurringEventId: z.string().min(1).optional(),
  originalStartTime: GoogleEventDateTimeSchema.optional(),
});
export type GoogleEvent = z.infer<typeof GoogleEventSchema>;

/** Body for `events.insert` / `events.patch` written by the editor. */
export interface GoogleEventWrite {
  summary: string;
  description: string;
  start: GoogleEventDateTime;
  end: GoogleEventDateTime;
  /**
   * Present for series masters and single events: the rule plus the kept `EXDATE`s;
   * `[]` turns a former series into a single event. Absent for instances (their
   * recurrence belongs to the master) and for series whose rule the editor cannot
   * express (`repeatEditable: false`: the rule is left untouched).
   */
  recurrence?: string[];
}

export interface ToGoogleEventOptions {
  /** Configured calendar the event is written to (from `pickTargetCalendar`). */
  sourceId: string;
  /** Language of written words; default from `config.locale`. */
  locale?: WriteLocale | undefined;
  /** The current Google event when editing (description, recurrence, start are kept). */
  existing?: GoogleEvent | undefined;
  /** True if the write targets one instance of a series (no recurrence written). */
  instance?: boolean | undefined;
  /** False if the existing series rule is not editable: the recurrence is left as is. */
  repeatEditable?: boolean | undefined;
}

interface LocalStart extends RecurrenceStart {
  allDay: boolean;
}

/** Wall-clock start of a Google date/time in `timeZone`; null if unreadable. */
function localStart(
  value: GoogleEventDateTime | undefined,
  timeZone: string,
): LocalStart | null {
  if (value?.date !== undefined) {
    return isDateKey(value.date) ? { date: value.date, allDay: true } : null;
  }
  const dateTime = value?.dateTime;
  if (dateTime === undefined) {
    return null;
  }
  let epochMs: number;
  if (LOCAL_DATE_TIME.test(dateTime)) {
    const zone =
      value?.timeZone !== undefined && isValidTimeZone(value.timeZone)
        ? value.timeZone
        : timeZone;
    const [date = "", time = ""] = dateTime.split("T");
    epochMs = zonedWallTimeToEpochMs(date, time.slice(0, 5), zone);
  } else {
    epochMs = Date.parse(dateTime);
  }
  if (Number.isNaN(epochMs)) {
    return null;
  }
  const wall = wallTimeInZone(epochMs, timeZone);
  return { date: wall.date, startTime: wall.time, allDay: false };
}

function isCountdownIcon(icon: string, config: AppConfig): boolean {
  const strip = (value: string): string => value.replace(/\uFE0F/gu, "");
  return config.countdown.emojis.some((emoji) => strip(emoji) === strip(icon));
}

/**
 * Google event fields for an editor entry (`events.insert` body, or `events.patch`
 * body with `existing`). Times are wall-clock times in `config.timeZone` (never the
 * device zone), written as RFC 3339 with that zone's offset plus
 * `timeZone: config.timeZone` on start and end, so Google expands series in that zone
 * and DST keeps the wall-clock time. All-day: `date` with an exclusive end
 * (`endDate`, default next day). Timed: via `resolveTimedRange` (without `endTime` one
 * hour later on the wall clock, or 60 real minutes when the start lies in a DST gap; an
 * explicit end that is not after the start in the zone throws a `RangeError`).
 *
 * Title via {@link composeTitle}; description (events) via {@link composeDescription}
 * on the existing description with the bring icons and the countdown decision: the
 * `#countdown` marker is written only when `countdown` is set and the icon is not
 * already a countdown emoji (those count by themselves; an existing marker is then
 * left as it is). Meals keep the existing description untouched (meals have no bring
 * list or countdown). Recurrence: {@link buildRecurrence}; existing `EXDATE` lines are
 * kept byte for byte if the series start (all-day vs. time of day) is unchanged, else
 * rebased to the new start ({@link rebaseExdates}).
 *
 * Throws `EditorCompositionError` if the title cannot be written (see composeTitle).
 */
export function toGoogleEvent(
  input: EditorEntryInput,
  config: AppConfig,
  options: ToGoogleEventOptions,
): GoogleEventWrite {
  const timeZone = config.timeZone;
  const locale = resolveWriteLocale(config.locale, options.locale);
  const summary = composeTitle(input, config, {
    sourceId: options.sourceId,
    locale,
  });

  const existingDescription = options.existing?.description ?? "";
  const description =
    input.kind === "meal"
      ? existingDescription
      : composeDescription(existingDescription, {
          bring: input.bring,
          countdown: isCountdownIcon(input.icon, config)
            ? undefined
            : input.countdown,
          locale,
        });

  let start: GoogleEventDateTime;
  let end: GoogleEventDateTime;
  if (input.allDay) {
    start = { date: input.date, timeZone };
    end = { date: input.endDate ?? addCalendarDays(input.date, 1), timeZone };
  } else {
    const range = resolveTimedRange(
      { ...input, startTime: input.startTime ?? "00:00" },
      timeZone,
    );
    if (!range.valid) {
      throw new RangeError(
        "End must be after start in the configured time zone",
      );
    }
    start = {
      dateTime: formatZonedDateTime(range.startMs, timeZone),
      timeZone,
    };
    end = { dateTime: formatZonedDateTime(range.endMs, timeZone), timeZone };
  }

  const write: GoogleEventWrite = { summary, description, start, end };
  if (options.instance === true || options.repeatEditable === false) {
    return write;
  }
  const recurrenceStart: RecurrenceStart = {
    date: input.date,
    ...(input.allDay ? {} : { startTime: input.startTime }),
  };
  const rule = buildRecurrence(input.repeat, recurrenceStart, timeZone);
  const previous = options.existing?.recurrence;
  if (rule.length > 0) {
    const before = localStart(options.existing?.start, timeZone);
    const sameStartForm =
      before !== null &&
      before.allDay === input.allDay &&
      (input.allDay || before.startTime === input.startTime);
    const kept = sameStartForm
      ? exdateLines(previous)
      : rebaseExdates(previous, recurrenceStart, timeZone);
    write.recurrence = [...rule, ...kept];
  } else if (previous !== undefined && previous.length > 0) {
    write.recurrence = [];
  }
  return write;
}

export interface FromGoogleEventOptions {
  /** The series master of an instance, to show its repeat rule. */
  master?: GoogleEvent | undefined;
}

/**
 * Editor entry for a Google event of `source` (as listed with `singleEvents=true`, or
 * a master). Title, icon, children and slot via `parseTitle` (children merged with the
 * calendar's child like the board does), bring via `parseBringList` (events only),
 * countdown from the icon or the `#countdown` marker, times as wall-clock times in
 * `config.timeZone` (whole minutes). Returns `null` for cancelled events and events
 * without readable start/end.
 *
 * Repeat: a master's rule via {@link parseRecurrence}; for an instance the master's
 * rule if `options.master` is given. Rules the editor cannot express (or an unknown
 * master) -> `repeat: "none"`, `repeatEditable: false`.
 */
export function fromGoogleEvent(
  event: GoogleEvent,
  source: CalendarSource,
  config: AppConfig,
  options: FromGoogleEventOptions = {},
): EditorEntry | null {
  const timeZone = config.timeZone;
  if (event.status === "cancelled") {
    return null;
  }
  const start = localStart(event.start, timeZone);
  const end = localStart(event.end, timeZone);
  if (start === null || end === null || start.allDay !== end.allDay) {
    return null;
  }
  const kind = source.kind === "meals" ? "meal" : "event";
  const description = event.description ?? "";
  const parsed = parseTitle(event.summary ?? "", {
    kind: source.kind,
    children: config.children,
    countdownEmojis: config.countdown.emojis,
    description,
  });

  let repeat: EditorRepeat = "none";
  let repeatEditable = true;
  if (event.recurringEventId !== undefined) {
    const masterStart = localStart(options.master?.start, timeZone);
    const parsedRepeat =
      options.master === undefined || masterStart === null
        ? null
        : parseRecurrence(options.master.recurrence, masterStart, timeZone);
    repeat = parsedRepeat ?? "none";
    repeatEditable = parsedRepeat !== null;
  } else if (event.recurrence !== undefined && event.recurrence.length > 0) {
    const parsedRepeat = parseRecurrence(event.recurrence, start, timeZone);
    repeat = parsedRepeat ?? "none";
    repeatEditable = parsedRepeat !== null;
  }

  const entry: EditorEntry = {
    kind,
    childIds: kind === "meal" ? [] : mergeSourceChildIds(parsed, source),
    icon: parsed.icon,
    title: parsed.title,
    allDay: start.allDay,
    date: start.date,
    repeat,
    bring: kind === "meal" ? [] : parseBringList(description),
    countdown: kind === "meal" ? false : parsed.countdown,
    id: event.id,
    sourceId: source.id,
    repeatEditable,
  };
  if (kind === "meal") {
    entry.slot = parsed.slot ?? "unspecified";
  }
  if (event.etag !== undefined && event.etag !== "") {
    entry.etag = event.etag;
  }
  if (event.recurringEventId !== undefined) {
    entry.recurringEventId = event.recurringEventId;
  }
  if (start.allDay) {
    if (calendarDaysBetween(start.date, end.date) > 1) {
      entry.endDate = end.date;
    }
  } else if (start.startTime !== undefined && end.startTime !== undefined) {
    entry.startTime = start.startTime;
    entry.endTime = end.startTime;
    const days = calendarDaysBetween(start.date, end.date);
    if (days > 0) {
      entry.endDate = end.date;
    } else if (days < 0 || end.startTime < start.startTime) {
      // Inconsistent upstream data (end before start): show it as zero length.
      entry.endTime = start.startTime;
    }
  }
  return entry;
}
