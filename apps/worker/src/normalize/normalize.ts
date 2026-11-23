import {
  type AppConfig,
  type CalendarEvent,
  type CalendarSource,
  type Meal,
  type MealSlot,
  parseBringList,
  type ParsedTitle,
  parseTitle,
} from "@kidboard/shared";

import type { Occurrence } from "../ical/expandCalendar";
import {
  type CalendarDate,
  formatCalendarDate,
  parseCalendarDate,
  wallTimeAt,
} from "../ical/zonedTime";

export interface NormalizeResult {
  events: CalendarEvent[];
  meals: Meal[];
}

export interface NormalizeOptions {
  /** Only emit meals for days in `[from, to)` (`YYYY-MM-DD`); bounds very long meal events. */
  from?: string;
  to?: string;
}

/** Hard cap of days a single all-day meal event is spread over (guards unbounded spans). */
export const MAX_MEAL_DAYS_PER_EVENT = 366;

const SLOT_ORDER: Record<MealSlot, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  unspecified: 3,
};

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const encoder = new TextEncoder();

/**
 * FNV-1a 64-bit over the UTF-8 bytes of the parts (separated by NUL), as 16 hex chars.
 *
 * CLAUDE.md rule 2 justification: ids only need to be stable and opaque-ish, not
 * collision-resistant against attackers (the inputs come from the family's own calendar).
 * `crypto.subtle.digest` would force an async `normalize` for no benefit, and a 64-bit
 * non-cryptographic hash is ~8 lines, so no dependency is added. The raw uid is not
 * exposed in the output.
 */
function stableId(...parts: string[]): string {
  let hash = FNV_OFFSET;
  for (const byte of encoder.encode(parts.join("\u0000"))) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * FNV_PRIME);
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Identity parts of an occurrence. Feed events without UID cannot be told apart by
 * uid/recurrenceId, so their time and summary take part.
 */
function occurrenceKey(source: CalendarSource, o: Occurrence): string[] {
  const base = [source.id, o.uid, o.recurrenceId ?? ""];
  return o.uid === "" ? [...base, o.start, o.end, o.summary] : base;
}

function mergeChildIds(parsed: ParsedTitle, source: CalendarSource): string[] {
  if (parsed.childScope === "none") {
    return source.childId === undefined ? [] : [source.childId];
  }
  if (parsed.childIds.length === 0) {
    return []; // `All:` overrides the source's child.
  }
  const ids = source.childId === undefined ? [] : [source.childId];
  for (const id of parsed.childIds) {
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(0);
  shifted.setUTCFullYear(date.year, date.month - 1, date.day + days);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function bandSlot(minutes: number, config: AppConfig): MealSlot {
  const toMinutes = (time: string): number => {
    const [h = "0", m = "0"] = time.split(":");
    return Number(h) * 60 + Number(m);
  };
  if (minutes < toMinutes(config.bands.middayStart)) {
    return "breakfast";
  }
  return minutes < toMinutes(config.bands.eveningStart) ? "lunch" : "dinner";
}

function mealsFor(
  o: Occurrence,
  parsed: ParsedTitle,
  source: CalendarSource,
  config: AppConfig,
  options: NormalizeOptions,
): Meal[] {
  const make = (date: string, slot: MealSlot): Meal => ({
    id: stableId(...occurrenceKey(source, o), date),
    sourceId: source.id,
    date,
    slot,
    title: parsed.title,
    icon: parsed.icon,
    iconIsFallback: parsed.iconIsFallback,
  });
  const prefixSlot = parsed.slot ?? "unspecified";

  if (!o.allDay) {
    const startMs = Date.parse(o.start);
    if (Number.isNaN(startMs)) {
      return [];
    }
    const wall = wallTimeAt(startMs, config.timeZone);
    const date = formatCalendarDate(wall);
    const slot =
      prefixSlot === "unspecified"
        ? bandSlot(wall.hour * 60 + wall.minute, config)
        : prefixSlot;
    return [make(date, slot)];
  }

  const first = parseCalendarDate(o.start);
  const last = parseCalendarDate(o.end);
  if (first === null || last === null) {
    return [];
  }
  const endDate = formatCalendarDate(last);
  const meals: Meal[] = [];
  let day = first;
  for (let i = 0; i < MAX_MEAL_DAYS_PER_EVENT; i++) {
    const date = formatCalendarDate(day);
    // Exclusive end; a zero/negative span still yields the start day.
    if (i > 0 && date >= endDate) {
      break;
    }
    if (options.to !== undefined && date >= options.to) {
      break;
    }
    if (options.from === undefined || date >= options.from) {
      meals.push(make(date, prefixSlot));
    }
    day = addDays(day, 1);
  }
  return meals;
}

function instantOf(event: CalendarEvent): number {
  return event.allDay
    ? Date.parse(`${event.start}T00:00:00Z`)
    : Date.parse(event.start);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Order of {@link normalize}: all-day first, then start, title, id. */
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.allDay !== b.allDay) {
    return a.allDay ? -1 : 1;
  }
  return (
    instantOf(a) - instantOf(b) ||
    compareText(a.title, b.title) ||
    compareText(a.id, b.id)
  );
}

/** Order of {@link normalize}: date, slot, title, id. */
export function compareMeals(a: Meal, b: Meal): number {
  return (
    compareText(a.date, b.date) ||
    SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] ||
    compareText(a.title, b.title) ||
    compareText(a.id, b.id)
  );
}

/**
 * Turns the occurrences of one calendar source into API events or meals.
 *
 * - `events` sources yield only `CalendarEvent`s (a multi-day event stays one event);
 *   `meals` sources yield only `Meal`s (one per covered day; timed ones on the day of
 *   their start in `config.timeZone`, slot by title prefix, else by `config.bands`).
 * - Occurrences whose title is empty and that carry no emoji are dropped: there is
 *   nothing a child could recognize and the placeholder icon would be noise.
 * - Events get `bring` from the description's `Mitbringen:` / `Bring:` lines (ADR-0010),
 *   omitted when empty; meals never do. Nothing else of the description is emitted.
 * - Ids are stable hashes of source, uid and recurrence id (plus the date for meals).
 * - Output order: events all-day first, then by start, title, id; meals by date, slot
 *   (breakfast, lunch, dinner, unspecified), title, id.
 */
export function normalize(
  occurrences: readonly Occurrence[],
  source: CalendarSource,
  config: AppConfig,
  options: NormalizeOptions = {},
): NormalizeResult {
  const events: CalendarEvent[] = [];
  const meals: Meal[] = [];
  // A series shares one description: parse each distinct description once.
  const bringByDescription = new Map<string, string[]>();
  const bringOf = (description: string): string[] => {
    let bring = bringByDescription.get(description);
    if (bring === undefined) {
      bring = parseBringList(description);
      bringByDescription.set(description, bring);
    }
    return bring;
  };

  for (const o of occurrences) {
    const parsed = parseTitle(o.summary, {
      kind: source.kind,
      children: config.children,
      countdownEmojis: config.countdown.emojis,
      description: o.description,
    });
    if (parsed.isEmpty) {
      continue;
    }
    if (source.kind === "meals") {
      meals.push(...mealsFor(o, parsed, source, config, options));
    } else {
      const bring = bringOf(o.description);
      events.push({
        id: stableId(...occurrenceKey(source, o)),
        sourceId: source.id,
        title: parsed.title,
        icon: parsed.icon,
        iconIsFallback: parsed.iconIsFallback,
        childIds: mergeChildIds(parsed, source),
        allDay: o.allDay,
        start: o.start,
        end: o.end,
        countdown: parsed.countdown,
        ...(bring.length > 0 ? { bring: [...bring] } : {}),
      });
    }
  }

  return {
    events: events.sort(compareEvents),
    meals: meals.sort(compareMeals),
  };
}
