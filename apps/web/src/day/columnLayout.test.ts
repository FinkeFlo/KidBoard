import { describe, expect, it } from "vitest";

import {
  columnLayout,
  DENSE_FROM,
  MIN_SLOTS,
  STRIP_ICONS_MAX,
} from "./columnLayout";

type Status = "past" | "current" | "upcoming";

/** Items in time order: `p` past, `c` current, `u` upcoming, e.g. "pppcuu". */
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

function summary(pattern: string, capacity: number): unknown {
  const layout = columnLayout(items(pattern), capacity);
  return {
    strip: layout.pastStrip.map((item) => item.id).join(","),
    visible: layout.visible.map((item) => item.id).join(","),
    earlier: layout.hiddenEarlier,
    later: layout.hiddenLater,
  };
}

describe("columnLayout", () => {
  it("shows everything when it fits", () => {
    expect(summary("ppcuu", 5)).toEqual({
      strip: "",
      visible: "p0,p1,c2,u3,u4",
      earlier: 0,
      later: 0,
    });
    expect(summary("", 4)).toEqual({
      strip: "",
      visible: "",
      earlier: 0,
      later: 0,
    });
  });

  it("is dense from 6 events", () => {
    expect(columnLayout(items("uuuuu"), 9).dense).toBe(false);
    expect(columnLayout(items("uuuuuu"), 9).dense).toBe(true);
    // Also when folding reduces what is shown.
    expect(columnLayout(items("ppppppcu"), 3).dense).toBe(true);
  });

  it("folds the oldest past events into the strip first", () => {
    // 8 events, 6 slots: strip (1 slot) + 5 tiles.
    expect(summary("pppcuuuu", 6)).toEqual({
      strip: "p0,p1,p2",
      visible: "c3,u4,u5,u6,u7",
      earlier: 0,
      later: 0,
    });
    // Only as many as needed: 7 events, 6 slots -> fold 2.
    expect(summary("pppcuuu", 6)).toEqual({
      strip: "p0,p1",
      visible: "p2,c3,u4,u5,u6",
      earlier: 0,
      later: 0,
    });
  });

  it("sums up the latest events when past ones are not enough", () => {
    // 2 past, 8 upcoming, 6 slots: strip + 4 tiles + "+N".
    expect(summary("ppuuuuuuuu", 6)).toEqual({
      strip: "p0,p1",
      visible: "u2,u3,u4,u5",
      earlier: 0,
      later: 4,
    });
    // Nothing past: no strip, "+N" takes a slot.
    expect(summary("cuuuuuuu", 4)).toEqual({
      strip: "",
      visible: "c0,u1,u2",
      earlier: 0,
      later: 5,
    });
  });

  it("keeps every folded event in pastStrip and counts icons beyond the strip's width", () => {
    const pattern = "p".repeat(STRIP_ICONS_MAX + 3) + "cuu";
    const layout = columnLayout(items(pattern), 3);
    // All folded titles stay available for the strip's accessible name.
    expect(layout.pastStrip).toHaveLength(STRIP_ICONS_MAX + 3);
    expect(layout.stripIcons).toEqual(
      layout.pastStrip.slice(0, STRIP_ICONS_MAX),
    );
    expect(layout.hiddenEarlier).toBe(3);
    expect(layout.visible.map((i) => i.id)).toEqual([
      `c${String(STRIP_ICONS_MAX + 3)}`,
    ]);
    expect(layout.hiddenLater).toBe(2);
  });

  it("treats capacities below MIN_SLOTS as MIN_SLOTS", () => {
    for (const capacity of [1, 0, -3, Number.NaN, 0.4]) {
      expect(summary("pcu", capacity)).toEqual(summary("pcu", MIN_SLOTS));
      // Strip, one tile and "+N" fit exactly.
      expect(summary("ppcuu", capacity)).toEqual({
        strip: "p0,p1",
        visible: "c2",
        earlier: 0,
        later: 2,
      });
    }
    expect(summary("ppp", 1)).toEqual({
      strip: "",
      visible: "p0,p1,p2",
      earlier: 0,
      later: 0,
    });
  });

  it("never hides or folds a current event", () => {
    // Several current events: they stay even when that exceeds the capacity.
    const layout = columnLayout(items("pccccuuu"), 3);
    expect(layout.visible.filter((i) => i.status === "current")).toHaveLength(
      4,
    );
    expect(layout.hiddenLater).toBe(3);
    expect(summary("pcu", 3)).toEqual({
      strip: "",
      visible: "p0,c1,u2",
      earlier: 0,
      later: 0,
    });
  });

  it("keeps the counts exact, the order and the priorities for any mix", () => {
    const patterns: string[] = [];
    for (let past = 0; past <= 12; past += 1) {
      for (let rest = 0; rest <= 12; rest += 1) {
        for (const cur of ["", "c"]) {
          patterns.push("p".repeat(past) + cur + "u".repeat(rest));
        }
      }
    }
    for (const pattern of patterns) {
      for (let capacity = 1; capacity <= 10; capacity += 1) {
        const all = items(pattern);
        const slots = Math.max(MIN_SLOTS, capacity);
        const layout = columnLayout(all, capacity);
        const shown = layout.visible.length;
        const stripped = layout.pastStrip.length;
        // Nothing is lost, and every folded item is retrievable.
        expect(shown + stripped + layout.hiddenLater).toBe(all.length);
        expect(layout.stripIcons.length + layout.hiddenEarlier).toBe(stripped);
        expect(layout.stripIcons).toEqual(
          layout.pastStrip.slice(0, STRIP_ICONS_MAX),
        );
        // Strip and "+N" tile take one slot each; everything fits, for any capacity.
        const used =
          shown + (stripped > 0 ? 1 : 0) + (layout.hiddenLater > 0 ? 1 : 0);
        expect(used).toBeLessThanOrEqual(slots);
        // Folding and hiding only happen when needed.
        if (all.length <= slots) {
          expect(stripped + layout.hiddenLater).toBe(0);
        }
        // Only past events fold; the current event is always visible.
        expect(layout.pastStrip.every((i) => i.status === "past")).toBe(true);
        expect(
          layout.visible.filter((i) => i.status === "current"),
        ).toHaveLength(pattern.includes("c") ? 1 : 0);
        // Past events go before any "+N".
        if (layout.hiddenLater > 0) {
          expect(layout.visible.some((i) => i.status === "past")).toBe(false);
        }
        // Time order everywhere.
        for (const list of [layout.pastStrip, layout.visible]) {
          const order = list.map((i) => all.indexOf(i));
          expect(order).toEqual([...order].sort((x, y) => x - y));
        }
        expect(layout.dense).toBe(all.length >= DENSE_FROM);
      }
    }
  });
});
