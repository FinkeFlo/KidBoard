import { describe, expect, it } from "vitest";

import { TILE_HEIGHT_REM } from "../components/EventTile";
import { COLUMN_GAP_REM, SUMMARY_ROW_REM } from "../day/columnCapacity";
import { fitWeekColumn } from "./weekCapacity";

const WEEK = TILE_HEIGHT_REM.week;
const DENSE = TILE_HEIGHT_REM["week-dense"];
const list = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
const rows = (n: number, tile: number): number =>
  n * tile + (n - 1) * COLUMN_GAP_REM;

describe("fitWeekColumn", () => {
  it("shows everything until the column is measured", () => {
    expect(fitWeekColumn(list(3), null)).toEqual({
      size: "week",
      visible: [0, 1, 2],
      hidden: [],
    });
    expect(fitWeekColumn(list(7), null).size).toBe("week-dense");
    expect(fitWeekColumn(list(7), null).hidden).toEqual([]);
  });

  it("has no +N when all tiles fit, however many (no fixed count of 3)", () => {
    const fit = fitWeekColumn(list(5), rows(5, DENSE));
    expect(fit.visible).toHaveLength(5);
    expect(fit.hidden).toEqual([]);
    // Exactly full at the normal size: still no +N.
    expect(fitWeekColumn(list(4), rows(4, WEEK))).toMatchObject({
      size: "week",
      hidden: [],
    });
  });

  it("goes dense before it hides: five events that do not fit large", () => {
    const height = rows(5, DENSE);
    expect(rows(5, WEEK)).toBeGreaterThan(height);
    expect(fitWeekColumn(list(5), height).size).toBe("week-dense");
  });

  it("goes dense from six events even when they would fit large", () => {
    expect(fitWeekColumn(list(6), 100).size).toBe("week-dense");
  });

  it("sums up the least important events, keeping room for the +N row", () => {
    const height = rows(3, DENSE) + COLUMN_GAP_REM + SUMMARY_ROW_REM;
    const fit = fitWeekColumn(list(8), height);
    expect(fit.size).toBe("week-dense");
    expect(fit.visible).toEqual([0, 1, 2]);
    expect(fit.hidden).toEqual([3, 4, 5, 6, 7]);
  });

  it("never loses an event and never exceeds the height, for every height and count", () => {
    for (let count = 0; count <= 14; count += 1) {
      for (let height = 0; height <= 40; height += 0.25) {
        const fit = fitWeekColumn(list(count), height);
        expect([...fit.visible, ...fit.hidden]).toEqual(list(count));
        const tile = TILE_HEIGHT_REM[fit.size];
        const used =
          fit.visible.length === 0 && fit.hidden.length === 0
            ? 0
            : fit.visible.length * tile +
              (fit.hidden.length > 0 ? SUMMARY_ROW_REM : 0) +
              (fit.visible.length + (fit.hidden.length > 0 ? 1 : 0) - 1) *
                COLUMN_GAP_REM;
        // A column too short for one tile shows only "+N" (the summary row itself may
        // not fit below ~2.25 rem; nothing smaller exists).
        if (height >= SUMMARY_ROW_REM) {
          expect(used).toBeLessThanOrEqual(height + 1e-6);
        }
      }
    }
  });

  it("shows only +N in a column too short for one tile", () => {
    const fit = fitWeekColumn(list(3), SUMMARY_ROW_REM + 0.5);
    expect(fit.visible).toEqual([]);
    expect(fit.hidden).toEqual([0, 1, 2]);
  });
});
