import type { EventStatus } from "../components/EventTile";

/** From this many events a day column switches to the dense tile size. */
export const DENSE_FROM = 6;
/** Past events the "vorbei" strip can draw as icons; further ones are counted ("+N"). */
export const STRIP_ICONS_MAX = 8;

/**
 * Smallest capacity the layout works with: one tile plus the strip plus the "+N" tile.
 * Below it the three could not coexist, so a smaller `capacity` is treated as this.
 */
export const MIN_SLOTS = 3;

export interface ColumnLayout<T> {
  /**
   * Every past event folded into the "vorbei" strip (oldest first); the strip's
   * accessible name lists all of them. Draw `stripIcons` as icons.
   */
  pastStrip: T[];
  /** The first `STRIP_ICONS_MAX` of `pastStrip`: the icons that fit into the strip. */
  stripIcons: T[];
  /** Events shown as full tiles, in time order. */
  visible: T[];
  /** Folded past events without an icon (`pastStrip.length - stripIcons.length`): "+N". */
  hiddenEarlier: number;
  /** Latest upcoming events summed up in a trailing "+N" tile. */
  hiddenLater: number;
  /** Compact tile size: 6 or more events in the column. */
  dense: boolean;
}

/**
 * How a day column lays out its events (given in time order) for `capacity` tiles, a
 * number the caller derives from the available space (at least `MIN_SLOTS` is assumed).
 * The strip (when used) and the "+N" tile each take one slot. Past events fold into the
 * strip first (oldest first); only if that is not enough the latest upcoming events are
 * summed up. Nothing is lost: `visible + pastStrip + hiddenLater` is always
 * `items.length`, and every list keeps the time order. A `current` event is never hidden
 * or folded; only when more events are current at once than there are tile slots can the
 * result use more slots than `capacity`.
 */
export function columnLayout<T extends { status: EventStatus }>(
  items: readonly T[],
  capacity: number,
): ColumnLayout<T> {
  const count = items.length;
  const slots = Math.max(
    MIN_SLOTS,
    Math.floor(Number.isFinite(capacity) ? capacity : MIN_SLOTS),
  );
  const dense = count >= DENSE_FROM;
  if (count <= slots) {
    return {
      pastStrip: [],
      stripIcons: [],
      visible: [...items],
      hiddenEarlier: 0,
      hiddenLater: 0,
      dense,
    };
  }

  const past = items.flatMap((item, index) =>
    item.status === "past" ? [index] : [],
  );
  // The strip takes one slot, so it must free at least `count - slots + 1` tiles.
  const folded = new Set(
    past.slice(0, Math.min(past.length, count - slots + 1)),
  );
  const remaining = count - folded.size;
  const stripSlot = folded.size > 0 ? 1 : 0;
  const tileSlots = slots - stripSlot;

  const hiddenLater = new Set<number>();
  if (remaining > tileSlots) {
    // One slot goes to the "+N" tile; hide from the latest end, never a current event.
    let toHide = remaining - Math.max(0, tileSlots - 1);
    for (let index = count - 1; index >= 0 && toHide > 0; index -= 1) {
      if (folded.has(index) || items[index]?.status === "current") continue;
      hiddenLater.add(index);
      toHide -= 1;
    }
  }

  const pastStrip = items.filter((_, index) => folded.has(index));
  const stripIcons = pastStrip.slice(0, STRIP_ICONS_MAX);
  return {
    pastStrip,
    stripIcons,
    visible: items.filter(
      (_, index) => !folded.has(index) && !hiddenLater.has(index),
    ),
    hiddenEarlier: pastStrip.length - stripIcons.length,
    hiddenLater: hiddenLater.size,
    dense,
  };
}
