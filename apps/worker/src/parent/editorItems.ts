import {
  addCalendarDays,
  type AppConfig,
  type CalendarEvent,
  EDITOR_TEMPLATES_MAX,
  type EditorAppItem,
  type EditorEntryInput,
  type EditorGoogleItem,
  type EditorKind,
  type EditorListItem,
  type EditorTemplate,
  EditorTitleSchema,
  type EditorUnresolvedEntry,
  EmojiSchema,
  type Meal,
  type MealSlot,
  parseEditorEntryInput,
} from "@kidboard/shared";

import type { AppEntry } from "../entries/entryStore";
import { renderAppCalendar } from "../entries/renderCalendar";
import { expandCalendar } from "../ical/expandCalendar";
import { parseCalendarDate, startOfDayMs } from "../ical/zonedTime";
import { logWarn } from "../log";

const KINDS: readonly EditorKind[] = ["event", "meal"];

/**
 * Splits stored entries into those the config can express and those it no longer can
 * (`parseEditorEntryInput` fails, e.g. a removed child or an import from an older
 * config). The latter are listed as unresolved with their issues, so a parent can
 * change or delete them; the renderer skips them on the board.
 */
export function splitResolvable(
  entries: readonly AppEntry[],
  config: AppConfig,
): { resolvable: AppEntry[]; unresolved: EditorUnresolvedEntry[] } {
  const resolvable: AppEntry[] = [];
  const unresolved: EditorUnresolvedEntry[] = [];
  for (const entry of entries) {
    const parsed = parseEditorEntryInput(entry.data, config);
    if (parsed.ok) {
      resolvable.push(entry);
    } else {
      unresolved.push({
        entryId: entry.id,
        revision: entry.revision,
        entry: entry.data,
        issues: parsed.issues.map((issue) => ({
          code: issue.code,
          path: issue.path,
          message: issue.message,
        })),
      });
    }
  }
  return { resolvable, unresolved };
}

/**
 * Occurrences of the app entries overlapping `[from, to)`, through the same rendering
 * and expansion as the board (`renderAppCalendar` + `expandCalendar`), so the editor
 * lists exactly the days, times and DST handling the board shows. Each item carries
 * the stored entry, its revision and, for series, the original occurrence date and the
 * "only this day" replacement shown on it. Entries the config can no longer express
 * are skipped by the renderer (logged there by code and id).
 */
export function appItems(
  entries: readonly AppEntry[],
  range: { from: string; to: string },
  config: AppConfig,
): EditorAppItem[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const items: EditorAppItem[] = [];
  for (const kind of KINDS) {
    const expanded = expandCalendar(renderAppCalendar(entries, kind, config), {
      from: range.from,
      to: range.to,
      timeZone: config.timeZone,
    });
    if (expanded.truncated) {
      logWarn(`editor list: app ${kind} expansion truncated`);
    }
    for (const occurrence of expanded.occurrences) {
      const entry = byId.get(occurrence.uid);
      if (entry === undefined) {
        continue;
      }
      const occurrenceDate =
        occurrence.recurrenceId === null
          ? null
          : occurrence.recurrenceId.slice(0, 10);
      const override =
        occurrenceDate === null
          ? null
          : (entry.overrides[occurrenceDate] ?? null);
      const shown: EditorEntryInput = override ?? entry.data;
      items.push({
        origin: "app",
        id:
          occurrenceDate === null ? entry.id : `${entry.id}/${occurrenceDate}`,
        entryId: entry.id,
        revision: entry.revision,
        entry: entry.data,
        occurrenceDate,
        override,
        kind: shown.kind,
        icon: shown.icon,
        title: shown.title,
        childIds: [...shown.childIds],
        allDay: occurrence.allDay,
        start: occurrence.start,
        end: occurrence.end,
        date: occurrence.start.slice(0, 10),
        ...(shown.slot === undefined ? {} : { slot: shown.slot }),
        bring: [...shown.bring],
        countdown: shown.countdown,
      });
    }
  }
  return items;
}

/**
 * Google occurrences as read-only list items. Built field by field from the
 * normalized board data (which never holds descriptions), so nothing beyond title,
 * icon, children, time and bring icons can reach the editor.
 */
export function googleEventItem(event: CalendarEvent): EditorGoogleItem {
  return {
    origin: "google",
    id: event.id,
    sourceId: event.sourceId,
    iconIsFallback: event.iconIsFallback,
    kind: "event",
    icon: event.icon,
    title: event.title,
    childIds: [...event.childIds],
    allDay: event.allDay,
    start: event.start,
    end: event.end,
    date: event.start.slice(0, 10),
    bring: [...(event.bring ?? [])],
    countdown: event.countdown,
  };
}

/** A Google meal is a whole day in its slot (`start` = its date, `end` = the next day). */
export function googleMealItem(meal: Meal): EditorGoogleItem {
  return {
    origin: "google",
    id: meal.id,
    sourceId: meal.sourceId,
    iconIsFallback: meal.iconIsFallback,
    kind: "meal",
    icon: meal.icon,
    title: meal.title,
    childIds: [],
    allDay: true,
    start: meal.date,
    end: addCalendarDays(meal.date, 1),
    date: meal.date,
    slot: meal.slot,
    bring: [],
    countdown: false,
  };
}

const SLOT_ORDER: Record<MealSlot, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  unspecified: 3,
};

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Start instant (epoch ms); all-day items start at midnight in the configured zone. */
export function itemStartMs(item: EditorListItem, timeZone: string): number {
  if (!item.allDay) {
    return Date.parse(item.start);
  }
  const date = parseCalendarDate(item.start);
  return date === null ? Number.NaN : startOfDayMs(date, timeZone);
}

/**
 * List order ("sorted by start"): start day, all-day before timed, start time, events
 * before meals, meal slot, title, id.
 */
export function compareItems(
  a: EditorListItem,
  b: EditorListItem,
  timeZone: string,
): number {
  return (
    compareText(a.date, b.date) ||
    Number(!a.allDay) - Number(!b.allDay) ||
    (a.allDay ? 0 : itemStartMs(a, timeZone) - itemStartMs(b, timeZone)) ||
    Number(a.kind === "meal") - Number(b.kind === "meal") ||
    (a.slot === undefined || b.slot === undefined
      ? 0
      : SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]) ||
    compareText(a.title, b.title) ||
    compareText(a.id, b.id)
  );
}

const VS16 = /️/gu;

interface Candidate {
  template: EditorTemplate;
  /** Distance of the representative occurrence from now (ms). */
  distanceMs: number;
}

/** Wall time `HH:mm` of a timed ISO string written with the configured zone's offset. */
function wallTime(iso: string): string {
  return iso.slice(11, 16);
}

/**
 * Up to {@link EDITOR_TEMPLATES_MAX} suggestions: items grouped by kind, icon (VS16
 * ignored), title and children; most occurrences first, then the group whose
 * representative (the occurrence nearest to now, which supplies times, slot, bring
 * icons and countdown) is nearest to now, then by title. Items whose title or icon
 * could not be saved as an app entry (empty or too long titles, text icons) are left
 * out, so every suggestion pre-fills a valid form.
 */
export function buildTemplates(
  items: readonly EditorListItem[],
  nowMs: number,
  timeZone: string,
): EditorTemplate[] {
  const groups = new Map<string, Candidate>();
  for (const item of items) {
    const title = EditorTitleSchema.safeParse(item.title);
    if (!title.success || !EmojiSchema.safeParse(item.icon).success) {
      continue;
    }
    const childIds = [...item.childIds].sort();
    const key = JSON.stringify([
      item.kind,
      item.icon.replace(VS16, ""),
      title.data,
      childIds,
    ]);
    const distanceMs = Math.abs(itemStartMs(item, timeZone) - nowMs);
    const known = groups.get(key);
    const origins = new Set(known?.template.origins ?? []);
    origins.add(item.origin);
    const count = (known?.template.count ?? 0) + 1;
    if (known !== undefined && !(distanceMs < known.distanceMs)) {
      known.template = {
        ...known.template,
        count,
        origins: [...origins].sort(),
      };
      continue;
    }
    // Only an end the form can hold: same day and after the start (Google allows
    // zero-length events).
    const sameDayEnd =
      !item.allDay &&
      item.end.slice(0, 10) === item.start.slice(0, 10) &&
      wallTime(item.end) > wallTime(item.start);
    groups.set(key, {
      distanceMs: Number.isNaN(distanceMs)
        ? Number.POSITIVE_INFINITY
        : distanceMs,
      template: {
        kind: item.kind,
        icon: item.icon,
        title: title.data,
        childIds: item.kind === "meal" ? [] : [...item.childIds],
        allDay: item.allDay,
        ...(item.allDay ? {} : { startTime: wallTime(item.start) }),
        ...(sameDayEnd ? { endTime: wallTime(item.end) } : {}),
        ...(item.slot === undefined ? {} : { slot: item.slot }),
        bring: item.kind === "meal" ? [] : [...item.bring],
        countdown: item.kind === "meal" ? false : item.countdown,
        count,
        origins: [...origins].sort(),
      },
    });
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        b.template.count - a.template.count ||
        a.distanceMs - b.distanceMs ||
        compareText(a.template.title, b.template.title),
    )
    .slice(0, EDITOR_TEMPLATES_MAX)
    .map((candidate) => candidate.template);
}
