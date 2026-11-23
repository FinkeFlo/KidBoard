import { describe, expect, it } from "vitest";

import { type EventStatus, TILE_HEIGHT_REM } from "../components/EventTile";
import { COLUMN_GAP_REM, SUMMARY_ROW_REM } from "../day/columnCapacity";
import { fitWeekColumn, WEEK_SIZES } from "./weekCapacity";

const WEEK = TILE_HEIGHT_REM.week;
const DENSE = TILE_HEIGHT_REM["week-dense"];
const MINI = TILE_HEIGHT_REM["week-mini"];

interface Item {
  id: number;
  status: EventStatus;
}

/** `n` upcoming items, most important first. */
const list = (n: number, status: EventStatus = "upcoming"): Item[] =>
  Array.from({ length: n }, (_, id) => ({ id, status }));
const ids = (items: readonly Item[]): number[] => items.map((item) => item.id);
/** Height of `tiles` tiles plus `summaries` summary rows, with the gaps between. */
const rows = (tiles: number, tile: number, summaries = 0): number => {
  const count = tiles + summaries;
  return count === 0
    ? 0
    : tiles * tile + summaries * SUMMARY_ROW_REM + (count - 1) * COLUMN_GAP_REM;
};
/**
 * A day like today's week column: upcoming ones first, then `past` finished ones (the
 * ranking puts finished events last).
 */
const today = (upcoming: number, past: number): Item[] => [
  ...list(upcoming),
  ...Array.from({ length: past }, (_, i) => ({
    id: upcoming + i,
    status: "past" as const,
  })),
];

describe("fitWeekColumn", () => {
  it("steps from the normal to the dense to the mini week size", () => {
    expect(WEEK_SIZES).toEqual(["week", "week-dense", "week-mini"]);
    expect(DENSE).toBeLessThan(WEEK);
    expect(MINI).toBeLessThan(DENSE);
  });

  it("shows everything until the column is measured", () => {
    expect(fitWeekColumn(list(3), null)).toEqual({
      size: "week",
      visible: list(3),
      past: [],
      hidden: [],
    });
    expect(fitWeekColumn(list(7), null).size).toBe("week-dense");
    expect(fitWeekColumn(list(7), null).hidden).toEqual([]);
  });

  it("has no +N when all tiles fit, however many (no fixed count)", () => {
    const fit = fitWeekColumn(list(5), rows(5, DENSE));
    expect(fit.visible).toHaveLength(5);
    expect(fit.hidden).toEqual([]);
    // Exactly full at the normal size: still no +N.
    expect(fitWeekColumn(list(4), rows(4, WEEK))).toMatchObject({
      size: "week",
      hidden: [],
    });
  });

  it("decides by space alone: six or more events stay normal while they fit", () => {
    expect(fitWeekColumn(list(7), rows(7, WEEK)).size).toBe("week");
  });

  it("goes dense before it hides: five events that do not fit at the normal size", () => {
    const height = rows(5, DENSE);
    expect(rows(5, WEEK)).toBeGreaterThan(height);
    expect(fitWeekColumn(list(5), height)).toMatchObject({
      size: "week-dense",
      hidden: [],
    });
  });

  it("keeps finished events as receded tiles while everything fits", () => {
    const items = today(2, 2);
    const fit = fitWeekColumn(items, rows(4, WEEK));
    expect(fit).toMatchObject({ size: "week", past: [], hidden: [] });
    expect(ids(fit.visible)).toEqual([0, 1, 2, 3]);
  });

  it("folds every finished event into the strip before an upcoming one is hidden", () => {
    // Room for 3 normal tiles plus the strip, not for all 6 tiles.
    const items = today(3, 3);
    const fit = fitWeekColumn(items, rows(3, WEEK, 1));
    expect(fit.size).toBe("week");
    expect(ids(fit.visible)).toEqual([0, 1, 2]);
    expect(ids(fit.past)).toEqual([3, 4, 5]);
    expect(fit.hidden).toEqual([]);
  });

  it("folds the finished events first, then shrinks, then hides the least important", () => {
    const items = today(5, 4);
    // Dense tiles for all five upcoming ones plus the strip.
    const shrunk = fitWeekColumn(items, rows(5, DENSE, 1));
    expect(shrunk.size).toBe("week-dense");
    expect(ids(shrunk.visible)).toEqual([0, 1, 2, 3, 4]);
    expect(shrunk.past).toHaveLength(4);
    expect(shrunk.hidden).toEqual([]);
    // Mini tiles before anything is hidden.
    expect(fitWeekColumn(items, rows(5, MINI, 1))).toMatchObject({
      size: "week-mini",
      hidden: [],
    });
    // Room for three mini tiles, the strip and "+N": the last two upcoming are summed up.
    const hidden = fitWeekColumn(items, rows(3, MINI, 2));
    expect(hidden.size).toBe("week-mini");
    expect(ids(hidden.visible)).toEqual([0, 1, 2]);
    expect(ids(hidden.hidden)).toEqual([3, 4]);
    expect(hidden.past).toHaveLength(4);
    // A finished event never takes a slot while an upcoming one is hidden.
    expect(hidden.visible.every((item) => item.status !== "past")).toBe(true);
  });

  it("sums up the least important events, keeping room for the +N row", () => {
    const height = rows(3, MINI, 1);
    const fit = fitWeekColumn(list(8), height);
    expect(fit.size).toBe("week-mini");
    expect(ids(fit.visible)).toEqual([0, 1, 2]);
    expect(ids(fit.hidden)).toEqual([3, 4, 5, 6, 7]);
    expect(fit.past).toEqual([]);
  });

  it("never loses an event and never exceeds the height, for every height and mix", () => {
    for (let count = 0; count <= 12; count += 1) {
      for (let pastCount = 0; pastCount <= count; pastCount += 3) {
        const items = today(count - pastCount, pastCount);
        for (let height = 0; height <= 40; height += 0.25) {
          const fit = fitWeekColumn(items, height);
          expect(
            ids([...fit.visible, ...fit.past, ...fit.hidden]).sort(
              (a, b) => a - b,
            ),
          ).toEqual(ids(items));
          // Past events are either all tiles (nothing folded or hidden) or all folded.
          if (fit.past.length > 0) {
            expect(fit.past).toHaveLength(pastCount);
          }
          if (fit.hidden.length > 0) {
            expect(fit.visible.some((item) => item.status === "past")).toBe(
              false,
            );
          }
          const summaries =
            (fit.past.length > 0 ? 1 : 0) + (fit.hidden.length > 0 ? 1 : 0);
          const used = rows(
            fit.visible.length,
            TILE_HEIGHT_REM[fit.size],
            summaries,
          );
          // A column too short even for one tile shows only the summaries (they may
          // not fit below ~5 rem; nothing smaller exists).
          if (height >= 2 * SUMMARY_ROW_REM + COLUMN_GAP_REM) {
            expect(used).toBeLessThanOrEqual(height + 1e-6);
          }
        }
      }
    }
  });

  it("shows only +N in a column too short for one tile", () => {
    const fit = fitWeekColumn(list(3), SUMMARY_ROW_REM + 0.5);
    expect(fit.visible).toEqual([]);
    expect(ids(fit.hidden)).toEqual([0, 1, 2]);
  });

  it("handles a day of only finished events that does not fit", () => {
    const fit = fitWeekColumn(list(4, "past"), SUMMARY_ROW_REM + 0.5);
    expect(fit).toMatchObject({ visible: [], hidden: [] });
    expect(fit.past).toHaveLength(4);
  });
});
