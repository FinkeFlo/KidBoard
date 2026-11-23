import {
  type EventStatus,
  TILE_HEIGHT_REM,
  type TileSize,
} from "../components/EventTile";
import { COLUMN_GAP_REM, SUMMARY_ROW_REM } from "../day/columnCapacity";
import { DENSE_FROM } from "../day/columnLayout";

/** Tile sizes of a week column, largest first: the steps it shrinks through. */
export const WEEK_SIZES: readonly TileSize[] = [
  "week",
  "week-dense",
  "week-mini",
];

export interface WeekFit<T> {
  size: TileSize;
  /** Items that get a tile, in the order given (the most important first). */
  visible: T[];
  /**
   * Past events folded into the "done" strip (only today has them), in the order given.
   * Empty while every event of the column gets a tile.
   */
  past: T[];
  /** Upcoming items without a tile: they are summed up in a "+N" row. */
  hidden: T[];
}

/** Height in rem of `tiles` tile rows plus the summary rows ("done" strip, "+N"). */
function rowsRem(tiles: number, tileRem: number, summaries: number): number {
  const rows = tiles + summaries;
  if (rows === 0) return 0;
  return (
    tiles * tileRem + summaries * SUMMARY_ROW_REM + (rows - 1) * COLUMN_GAP_REM
  );
}

/**
 * How many tiles a week column can show, decided by its measured height (`heightRem`,
 * `null` until measured: show everything). `items` come most important first. The same
 * steps as the overview's columns (`fitColumn`), taking the first that fits:
 *
 * 1. every event as a tile at the normal size (past ones receded);
 * 2. otherwise *all* past events fold into the "done" strip (so a finished event never
 *    takes a slot an upcoming one needs), and the upcoming tiles shrink step by step
 *    ({@link WEEK_SIZES}: with a title line, a smaller one, then emoji and time only);
 * 3. only then the least important upcoming events are summed up in "+N", at the
 *    smallest size, with the largest number of tiles that still leaves room for it.
 *
 * A "+N" appears only when the tiles do not fit, never because of a fixed count. Nothing
 * is lost: `visible + past + hidden` are the items. A column too short for even one tile
 * shows only the summaries.
 */
export function fitWeekColumn<T extends { status: EventStatus }>(
  items: readonly T[],
  heightRem: number | null,
): WeekFit<T> {
  const largest = WEEK_SIZES[0] ?? "week";
  const smallest = WEEK_SIZES[WEEK_SIZES.length - 1] ?? "week-mini";
  const count = items.length;
  if (heightRem === null) {
    return {
      // Unmeasured: a busy day starts dense (with titles), never at the last step.
      size: count >= DENSE_FROM ? "week-dense" : largest,
      visible: [...items],
      past: [],
      hidden: [],
    };
  }
  const available = heightRem + 1e-6;
  // 1. Everything as tiles at the normal size.
  if (rowsRem(count, TILE_HEIGHT_REM[largest], 0) <= available) {
    return { size: largest, visible: [...items], past: [], hidden: [] };
  }
  // 2. All past events fold into the strip; the upcoming ones shrink step by step.
  const past = items.filter((item) => item.status === "past");
  const upcoming = items.filter((item) => item.status !== "past");
  const strip = past.length > 0 ? 1 : 0;
  for (const size of WEEK_SIZES) {
    if (rowsRem(upcoming.length, TILE_HEIGHT_REM[size], strip) <= available) {
      return { size, visible: upcoming, past, hidden: [] };
    }
  }
  // 3. Sum up the least important upcoming events, keeping room for the "+N" row.
  const tile = TILE_HEIGHT_REM[smallest];
  let tiles = Math.max(0, upcoming.length - 1);
  while (tiles > 0 && rowsRem(tiles, tile, strip + 1) > available) tiles -= 1;
  return {
    size: smallest,
    visible: upcoming.slice(0, tiles),
    past,
    hidden: upcoming.slice(tiles),
  };
}
