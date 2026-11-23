import type { CoreConfig } from "../config";
import type { CalendarSource } from "../model";
import { canExpressChildren } from "./composeTitle";
import type { EditorKind } from "./entry";

/** What `pickTargetCalendar` needs to know about an entry. */
export interface TargetEntry {
  kind: EditorKind;
  childIds: readonly string[];
  /** Current calendar of an existing entry; absent for new entries. */
  sourceId?: string | undefined;
  /** Set when the edit targets one instance of a series (instances cannot move alone). */
  recurringEventId?: string | undefined;
}

export type TargetCalendar =
  /** Write into `sourceId` (insert for new entries, patch in place for existing ones). */
  | { ok: true; sourceId: string; move: false }
  /**
   * The current calendar cannot express the entry (e.g. children changed away from a
   * child's calendar): `events.move` from `fromSourceId` to `sourceId`, then patch.
   */
  | { ok: true; sourceId: string; move: true; fromSourceId: string }
  | {
      ok: false;
      reason:
        /** No writable calendar fits the entry. */
        | "no_writable_calendar"
        /** The existing entry's calendar is unknown or not writable. */
        | "source_not_writable"
        /** An instance would have to move to another calendar (only whole series can). */
        | "instance_cannot_move";
    };

function kindOf(entry: TargetEntry): CalendarSource["kind"] {
  return entry.kind === "meal" ? "meals" : "events";
}

/** True if `source` can hold the entry with the title conventions (kind and children). */
export function canHoldEntry(
  entry: TargetEntry,
  source: CalendarSource,
): boolean {
  return (
    source.kind === kindOf(entry) &&
    (entry.kind === "meal" || canExpressChildren(entry.childIds, source))
  );
}

/**
 * The ADR-0012 target rule, applied in config order (`writableSources` only says which
 * configured calendars are writable):
 *
 * - New event: the calendar of the single selected child if it is writable, else the
 *   first writable `events` calendar without `childId`.
 * - New meal: the first writable `meals` calendar.
 * - Existing entry: stays in its calendar as long as that calendar can express it
 *   ({@link canHoldEntry}: a child's calendar always implies its child, so it cannot
 *   hold an entry whose children no longer include that child). Otherwise the new-entry
 *   rule picks the destination and the result says `move: true` (the worker uses
 *   `events.move`); instances of a series cannot move on their own.
 */
export function pickTargetCalendar(
  entry: TargetEntry,
  writableSources: readonly Pick<CalendarSource, "id">[],
  config: CoreConfig,
): TargetCalendar {
  const writable = new Set(writableSources.map((source) => source.id));
  const candidates = config.calendars.filter((source) =>
    writable.has(source.id),
  );

  const pickNew = (): CalendarSource | undefined => {
    if (entry.kind === "meal") {
      return candidates.find((source) => source.kind === "meals");
    }
    const [only] = entry.childIds;
    if (entry.childIds.length === 1 && only !== undefined) {
      const own = candidates.find(
        (source) => source.kind === "events" && source.childId === only,
      );
      if (own !== undefined) {
        return own;
      }
    }
    return candidates.find(
      (source) => source.kind === "events" && source.childId === undefined,
    );
  };

  if (entry.sourceId === undefined) {
    const target = pickNew();
    return target === undefined
      ? { ok: false, reason: "no_writable_calendar" }
      : { ok: true, sourceId: target.id, move: false };
  }

  const current = candidates.find((source) => source.id === entry.sourceId);
  if (current === undefined) {
    return { ok: false, reason: "source_not_writable" };
  }
  if (canHoldEntry(entry, current)) {
    return { ok: true, sourceId: current.id, move: false };
  }
  if (entry.recurringEventId !== undefined) {
    return { ok: false, reason: "instance_cannot_move" };
  }
  const target = pickNew();
  return target === undefined
    ? { ok: false, reason: "no_writable_calendar" }
    : { ok: true, sourceId: target.id, move: true, fromSourceId: current.id };
}
