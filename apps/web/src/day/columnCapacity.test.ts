import { describe, expect, it } from "vitest";

import { PROMINENT_EXTRA_REM, TILE_HEIGHT_REM } from "../components/EventTile";
import {
  COLUMN_GAP_REM,
  DAY_SIZES,
  fitColumn,
  layoutHeightRem,
  SUMMARY_ROW_REM,
  tileHeightRem,
  TODAY_SIZES,
} from "./columnCapacity";
import { columnLayout } from "./columnLayout";

type Status = "past" | "current" | "upcoming";
type Item = { id: string; status: Status };

/** Items in time order: `p` past, `c` current, `u` upcoming, e.g. "ppcuu". */
function items(pattern: string): Item[] {
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

/** Height of `n` tiles of `rem` each, with the gaps between them. */
const rows = (n: number, rem: number): number =>
  n * rem + (n - 1) * COLUMN_GAP_REM;

const LARGE = TILE_HEIGHT_REM.large;
const MEDIUM = TILE_HEIGHT_REM.medium;
const DENSE = TILE_HEIGHT_REM.dense;
const STRIP = SUMMARY_ROW_REM + COLUMN_GAP_REM;

describe("tile sizes", () => {
  it("shrink step by step: today large > medium > dense, other days compact > compact-dense", () => {
    expect(TODAY_SIZES).toEqual(["large", "medium", "dense"]);
    expect(DAY_SIZES).toEqual(["compact", "compact-dense"]);
    for (const ladder of [TODAY_SIZES, DAY_SIZES]) {
      const heights = ladder.map((size) => TILE_HEIGHT_REM[size]);
      expect(heights).toEqual([...heights].sort((a, b) => b - a));
      expect(new Set(heights).size).toBe(heights.length);
    }
  });

  it("a prominent tile is about 1.2-1.3x taller in today's column, never elsewhere", () => {
    for (const size of TODAY_SIZES) {
      const ratio = tileHeightRem(size, true) / tileHeightRem(size, false);
      expect(ratio).toBeGreaterThanOrEqual(1.2);
      expect(ratio).toBeLessThanOrEqual(1.5);
    }
    for (const size of DAY_SIZES) {
      expect(PROMINENT_EXTRA_REM[size]).toBe(0);
    }
  });
});

describe("layoutHeightRem", () => {
  it("adds tiles, prominent extras, the summary rows and the gaps between rows", () => {
    expect(layoutHeightRem(columnLayout(items(""), 4), "large")).toBe(0);
    const two = items("uu");
    expect(layoutHeightRem(columnLayout(two, 4), "large")).toBe(
      2 * LARGE + COLUMN_GAP_REM,
    );
    expect(
      layoutHeightRem(columnLayout(two, 4), "large", [two[0] as Item]),
    ).toBe(2 * LARGE + PROMINENT_EXTRA_REM.large + COLUMN_GAP_REM);
    // 8 events, 2 tiles: strip + 2 tiles + "+N".
    const layout = columnLayout(items("ppppcuuu"), 2);
    expect(layout.pastStrip).toHaveLength(4);
    expect(layout.hiddenLater).toBe(2);
    expect(layoutHeightRem(layout, "dense")).toBe(
      2 * DENSE + 2 * SUMMARY_ROW_REM + 3 * COLUMN_GAP_REM,
    );
  });
});

describe("fitColumn", () => {
  it("shows everything until the list is measured (largest below 6, smallest from 6)", () => {
    const few = fitColumn(items("puu"), true, null);
    expect(few.size).toBe("large");
    expect(few.layout.visible).toHaveLength(3);
    const many = fitColumn(items("ppcuuuuu"), true, null);
    expect(many.size).toBe("dense");
    expect(many.layout.visible).toHaveLength(8);
    expect(fitColumn(items("uuuuuu"), false, null).size).toBe("compact-dense");
  });

  it("keeps the large size and enlarges the prominent tile while everything fits", () => {
    const all = items("puuu");
    const next = all[1] as Item;
    const height = rows(4, LARGE) + PROMINENT_EXTRA_REM.large;
    const fit = fitColumn(all, true, height, 0, [next]);
    expect(fit).toMatchObject({ size: "large", prominent: true });
    expect(fit.layout.visible).toHaveLength(4);
    // Six events also stay large when there is room: space decides, not a count.
    expect(fitColumn(items("uuuuuu"), true, 100).size).toBe("large");
    expect(fitColumn(items("uuu"), false, 20).size).toBe("compact");
  });

  it("folds all past events before shrinking, and drops the enlargement before shrinking", () => {
    const all = items("ppuuu");
    const next = all[2] as Item;
    // Too small for five large tiles, enough for the strip and three large ones.
    const strip3 = STRIP + rows(3, LARGE);
    expect(rows(5, LARGE)).toBeGreaterThan(strip3);
    const folded = fitColumn(all, true, strip3, 0, [next]);
    expect(folded.size).toBe("large");
    expect(folded.prominent).toBe(false);
    expect(folded.layout.pastStrip.map((i) => i.id)).toEqual(["p0", "p1"]);
    expect(folded.layout.visible.map((i) => i.id)).toEqual(["u2", "u3", "u4"]);
    // With room for the enlargement too, it is kept.
    const roomy = fitColumn(all, true, strip3 + PROMINENT_EXTRA_REM.large, 0, [
      next,
    ]);
    expect(roomy).toMatchObject({ size: "large", prominent: true });
  });

  it("shrinks large -> medium -> dense before anything is summed up", () => {
    const all = items("uuuuu");
    const medium = rows(5, MEDIUM);
    expect(rows(5, LARGE)).toBeGreaterThan(medium);
    expect(fitColumn(all, true, medium).size).toBe("medium");
    const dense = rows(5, DENSE);
    const fit = fitColumn(all, true, dense);
    expect(fit.size).toBe("dense");
    expect(fit.layout.hiddenLater).toBe(0);
    // A bit less: four dense tiles plus the "+N" row.
    const tight = fitColumn(all, true, dense - 0.1);
    expect(tight.size).toBe("dense");
    expect(tight.layout.visible).toHaveLength(4);
    expect(tight.layout.later.map((i) => i.id)).toEqual(["u4"]);
    expect(layoutHeightRem(tight.layout, "dense")).toBeLessThanOrEqual(
      dense - 0.1,
    );
  });

  it("subtracts reserved space (the now line)", () => {
    const height = rows(4, LARGE);
    expect(fitColumn(items("uuuu"), true, height).size).toBe("large");
    expect(fitColumn(items("uuuu"), true, height, 2).size).not.toBe("large");
  });

  it("sweep: fits the list from a minimum height on, never loses an event, keeps current ones, one rule for the past", () => {
    for (let count = 0; count <= 14; count += 1) {
      for (let pastCount = 0; pastCount <= count; pastCount += 1) {
        const pattern =
          "p".repeat(pastCount) +
          (count > pastCount ? "c" : "") +
          "u".repeat(Math.max(0, count - pastCount - 1));
        expect(pattern.length).toBe(count);
        for (let height = 6; height <= 40; height += 0.75) {
          for (const today of [true, false]) {
            const all = items(pattern);
            const prominent = all.filter((i) => i.status === "current");
            const fit = fitColumn(all, today, height, 2, prominent);
            const { size, layout } = fit;
            const used = layoutHeightRem(
              layout,
              size,
              fit.prominent ? prominent : [],
            );
            // From one tile plus the strip and "+N" on, it never exceeds the list.
            const minimum = tileHeightRem(size, false) + 2 * STRIP + 2;
            if (height >= minimum) {
              expect(used).toBeLessThanOrEqual(height - 2 + 1e-6);
            }
            expect(
              layout.visible.length +
                layout.pastStrip.length +
                layout.hiddenLater,
            ).toBe(count);
            for (const item of prominent) {
              expect(layout.visible).toContain(item);
            }
            // Past events are either all tiles or all folded.
            const pastShown = layout.visible.filter(
              (i) => i.status === "past",
            ).length;
            expect([0, pastCount]).toContain(pastShown);
            if (pastShown > 0) expect(layout.pastStrip).toHaveLength(0);
            // Size and enlargement come from the column's own steps.
            const ladder = today ? TODAY_SIZES : DAY_SIZES;
            expect(ladder).toContain(size);
            // Summed up only at the smallest size.
            if (layout.hiddenLater > 0) {
              expect(size).toBe(ladder[ladder.length - 1]);
            }
          }
        }
      }
    }
  });
});
