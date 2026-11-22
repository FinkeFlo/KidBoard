import {
  type EventStatus,
  TILE_HEIGHT_REM,
  type TileSize,
} from "../components/EventTile";
import { type ColumnLayout, columnLayout, DENSE_FROM } from "./columnLayout";

/** Gap between the rows of a day column's event list in rem (`gap-2`). */
export const COLUMN_GAP_REM = 0.5;
/** Height of the "vorbei" strip and of the "+N" row in rem (`h-9`). */
export const SUMMARY_ROW_REM = 2.25;

export interface ColumnFit<T> {
  size: TileSize;
  layout: ColumnLayout<T>;
}

/** Height in rem that `layout` takes with tiles of `tileRem` (rows plus gaps). */
export function layoutHeightRem<T>(
  layout: ColumnLayout<T>,
  tileRem: number,
): number {
  const rows =
    layout.visible.length +
    (layout.pastStrip.length > 0 ? 1 : 0) +
    (layout.hiddenLater > 0 ? 1 : 0);
  if (rows === 0) return 0;
  return (
    layout.visible.length * tileRem +
    (layout.pastStrip.length > 0 ? SUMMARY_ROW_REM : 0) +
    (layout.hiddenLater > 0 ? SUMMARY_ROW_REM : 0) +
    (rows - 1) * COLUMN_GAP_REM
  );
}

/**
 * Tile size and layout of a day column whose list is `heightRem` high (`null`: not
 * measured yet, then everything is shown). `reservedRem` is space other rows take (the
 * now line plus its gap). The large size is used while every event fits at it and there
 * are fewer than `DENSE_FROM`; otherwise the dense size with the largest `columnLayout`
 * capacity whose real height (tiles, the smaller strip and "+N" rows, gaps) fits. Below
 * `MIN_SLOTS` `columnLayout` keeps its minimum, so a tiny column may still overflow.
 */
export function fitColumn<T extends { status: EventStatus }>(
  items: readonly T[],
  today: boolean,
  heightRem: number | null,
  reservedRem = 0,
): ColumnFit<T> {
  const large: TileSize = today ? "large" : "compact";
  const dense: TileSize = today ? "dense" : "compact-dense";
  const count = items.length;
  if (heightRem === null) {
    return {
      size: count >= DENSE_FROM ? dense : large,
      layout: columnLayout(items, count),
    };
  }
  const available = heightRem - reservedRem + 1e-6;
  const all = columnLayout(items, count);
  if (
    count < DENSE_FROM &&
    layoutHeightRem(all, TILE_HEIGHT_REM[large]) <= available
  ) {
    return { size: large, layout: all };
  }
  // Scanning from the most slots down, the first capacity that fits is the largest.
  for (let capacity = count; capacity > 0; capacity -= 1) {
    const layout = columnLayout(items, capacity);
    if (layoutHeightRem(layout, TILE_HEIGHT_REM[dense]) <= available) {
      return { size: dense, layout };
    }
  }
  return { size: dense, layout: columnLayout(items, 0) };
}
