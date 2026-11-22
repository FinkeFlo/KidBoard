import { TILE_HEIGHT_REM, type TileSize } from "../components/EventTile";
import { COLUMN_GAP_REM, SUMMARY_ROW_REM } from "../day/columnCapacity";
import { DENSE_FROM } from "../day/columnLayout";

export interface WeekFit<T> {
  size: TileSize;
  /** Items that get a tile, in the order given (the most important first). */
  visible: T[];
  /** Items without a tile: they are summed up in a "+N" row. */
  hidden: T[];
}

/** Height in rem of `tiles` tile rows, with a trailing "+N" row if `more`. */
function rowsRem(tiles: number, tileRem: number, more: boolean): number {
  const rows = tiles + (more ? 1 : 0);
  if (rows === 0) return 0;
  return (
    tiles * tileRem + (more ? SUMMARY_ROW_REM : 0) + (rows - 1) * COLUMN_GAP_REM
  );
}

/**
 * How many tiles a week column can show, decided by its measured height (`heightRem`,
 * `null` until measured: show everything). `items` come most important first; the first
 * `k` get a tile, the rest are summed up in "+N", so a "+N" appears only when the tiles do
 * not fit, never because of a fixed count. The normal size is used while everything fits
 * at it and there are fewer than `DENSE_FROM` events; otherwise the dense size, with the
 * largest `k` that still leaves room for the "+N" row. Nothing is lost:
 * `visible + hidden === items`. A column too short for even one tile shows only "+N".
 */
export function fitWeekColumn<T>(
  items: readonly T[],
  heightRem: number | null,
): WeekFit<T> {
  const count = items.length;
  if (heightRem === null) {
    return {
      size: count >= DENSE_FROM ? "week-dense" : "week",
      visible: [...items],
      hidden: [],
    };
  }
  const available = heightRem + 1e-6;
  if (
    count < DENSE_FROM &&
    rowsRem(count, TILE_HEIGHT_REM.week, false) <= available
  ) {
    return { size: "week", visible: [...items], hidden: [] };
  }
  const dense = TILE_HEIGHT_REM["week-dense"];
  if (rowsRem(count, dense, false) <= available) {
    return { size: "week-dense", visible: [...items], hidden: [] };
  }
  let tiles = count - 1;
  while (tiles > 0 && rowsRem(tiles, dense, true) > available) tiles -= 1;
  return {
    size: "week-dense",
    visible: items.slice(0, tiles),
    hidden: items.slice(tiles),
  };
}
