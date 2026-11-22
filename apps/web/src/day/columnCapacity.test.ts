import { describe, expect, it } from "vitest";

import { TILE_HEIGHT_REM } from "../components/EventTile";
import {
  COLUMN_GAP_REM,
  fitColumn,
  layoutHeightRem,
  SUMMARY_ROW_REM,
} from "./columnCapacity";
import { columnLayout, MIN_SLOTS } from "./columnLayout";

type Status = "past" | "current" | "upcoming";

/** Items in time order: `p` past, `c` current, `u` upcoming, e.g. "ppcuu". */
function items(pattern: string): { id: string; status: Status }[] {
  const statuses: Record<string, Status> = {
    p: "past",
    c: "current",
    u: "upcoming",
  };
  return Array.from(pattern).map((char, i) => ({
    id: `${char}${String(i)}`,
    status: statuses[char] ?? "upcoming",
  }));
}

const LARGE = TILE_HEIGHT_REM.large;
const DENSE = TILE_HEIGHT_REM.dense;

describe("layoutHeightRem", () => {
  it("adds tiles, the smaller summary rows and the gaps between rows", () => {
    expect(layoutHeightRem(columnLayout(items(""), 4), LARGE)).toBe(0);
    expect(layoutHeightRem(columnLayout(items("uu"), 4), LARGE)).toBe(
      2 * LARGE + COLUMN_GAP_REM,
    );
    // 8 events in 4 slots: strip + 2 tiles + "+N".
    const layout = columnLayout(items("ppppcuuu"), 4);
    expect(layout.pastStrip.length).toBeGreaterThan(0);
    expect(layout.hiddenLater).toBeGreaterThan(0);
    expect(layoutHeightRem(layout, DENSE)).toBe(
      layout.visible.length * DENSE + 2 * SUMMARY_ROW_REM + 3 * COLUMN_GAP_REM,
    );
  });
});

describe("fitColumn", () => {
  it("shows everything until the list is measured (large below 6, dense from 6)", () => {
    const few = fitColumn(items("puu"), true, null);
    expect(few.size).toBe("large");
    expect(few.layout.visible).toHaveLength(3);
    const many = fitColumn(items("ppcuuuuu"), true, null);
    expect(many.size).toBe("dense");
    expect(many.layout.visible).toHaveLength(8);
    expect(fitColumn(items("uuuuuu"), false, null).size).toBe("compact-dense");
  });

  it("uses the large size while every event fits at it", () => {
    const fit = fitColumn(items("puuu"), true, 4 * LARGE + 3 * COLUMN_GAP_REM);
    expect(fit.size).toBe("large");
    expect(fit.layout.visible).toHaveLength(4);
    expect(fitColumn(items("uuu"), false, 20).size).toBe("compact");
  });

  it("switches to the dense size before folding anything", () => {
    // 5 events: too tall at the large size, fine dense.
    const height = 5 * DENSE + 4 * COLUMN_GAP_REM;
    expect(5 * LARGE + 4 * COLUMN_GAP_REM).toBeGreaterThan(height);
    const fit = fitColumn(items("ppuuu"), true, height);
    expect(fit.size).toBe("dense");
    expect(fit.layout.visible).toHaveLength(5);
    expect(fit.layout.pastStrip).toHaveLength(0);
  });

  it("is dense from 6 events even when they would fit large", () => {
    expect(fitColumn(items("uuuuuu"), true, 100).size).toBe("dense");
  });

  it("folds past events into the strip first, then sums up the latest", () => {
    // Room for the strip and three dense tiles.
    const height = SUMMARY_ROW_REM + 3 * DENSE + 3 * COLUMN_GAP_REM;
    const fit = fitColumn(items("ppppcuu"), true, height);
    expect(fit.layout.pastStrip.map((item) => item.id)).toEqual([
      "p0",
      "p1",
      "p2",
      "p3",
    ]);
    expect(fit.layout.visible.map((item) => item.id)).toEqual([
      "c4",
      "u5",
      "u6",
    ]);
    expect(fit.layout.hiddenLater).toBe(0);
  });

  it("subtracts reserved space (the now line)", () => {
    const height = 4 * LARGE + 3 * COLUMN_GAP_REM;
    expect(fitColumn(items("uuuu"), true, height).size).toBe("large");
    expect(fitColumn(items("uuuu"), true, height, 2).size).toBe("dense");
  });

  it("sweep: never taller than the list when the minimum fits, never loses an event, keeps current ones", () => {
    for (let count = 0; count <= 14; count += 1) {
      for (let pastCount = 0; pastCount <= count; pastCount += 1) {
        const pattern =
          "p".repeat(pastCount) +
          (count > pastCount ? "c" : "") +
          "u".repeat(Math.max(0, count - pastCount - 1));
        expect(pattern.length).toBe(count);
        for (let height = 8; height <= 40; height += 0.75) {
          for (const today of [true, false]) {
            const all = items(pattern);
            const { size, layout } = fitColumn(all, today, height, 2);
            const used = layoutHeightRem(layout, TILE_HEIGHT_REM[size]);
            // `columnLayout` keeps `MIN_SLOTS` slots (at worst three tiles); from that
            // height on the fitted layout never exceeds the list.
            const minimum =
              MIN_SLOTS * TILE_HEIGHT_REM[size] +
              (MIN_SLOTS - 1) * COLUMN_GAP_REM +
              2;
            if (height >= minimum) {
              expect(used).toBeLessThanOrEqual(height - 2 + 1e-6);
            }
            expect(
              layout.visible.length +
                layout.pastStrip.length +
                layout.hiddenLater,
            ).toBe(count);
            const current = all.filter((item) => item.status === "current");
            for (const item of current) {
              expect(layout.visible).toContain(item);
            }
          }
        }
      }
    }
  });
});
