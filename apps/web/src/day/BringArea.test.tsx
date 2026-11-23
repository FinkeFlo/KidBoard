import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BEN, MIA } from "../components/fixtures.test-utils";
import { applyLocale } from "../i18n";
import {
  BRING_AREA_METRICS,
  BringArea,
  type BringGroupSize,
  bringGroupsThatFit,
  bringRowRem,
} from "./BringArea";
import type { BringReminder } from "./buildBringReminder";

/** Makes every observed element report `widthRem` (at a 16px root). */
function stubWidth(widthRem: number): void {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(
        private readonly callback: (
          entries: { contentRect: { width: number } }[],
        ) => void,
      ) {}
      observe(): void {
        this.callback([{ contentRect: { width: widthRem * 16 } }]);
      }
      disconnect(): void {}
    },
  );
}

const REMINDER: BringReminder = {
  when: "tomorrow",
  groups: [
    { child: null, icons: ["🧺"] },
    { child: MIA, icons: ["🩱", "🧴", "🥽"] },
    { child: BEN, icons: ["👟"] },
  ],
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  applyLocale("en");
});

describe("bringGroupsThatFit", () => {
  const GROUPS: BringGroupSize[] = [
    { icons: 2, badge: false },
    { icons: 8, badge: true },
    { icons: 5, badge: true },
  ];
  const total = GROUPS.reduce((sum, group) => sum + group.icons, 0);

  it("draws everything before the row is measured and while it fits", () => {
    expect(bringGroupsThatFit(GROUPS, null)).toEqual({
      drawn: [2, 8, 5],
      hiddenIcons: 0,
    });
    const all = bringRowRem(GROUPS, [2, 8, 5], false);
    expect(bringGroupsThatFit(GROUPS, all)).toEqual({
      drawn: [2, 8, 5],
      hiddenIcons: 0,
    });
    expect(bringGroupsThatFit([], 10)).toEqual({ drawn: [], hiddenIcons: 0 });
  });

  it("shares a short row out fairly, one chip per group in turn", () => {
    const m = BRING_AREA_METRICS;
    const long: BringGroupSize[] = [
      { icons: 4, badge: false },
      { icons: 8, badge: true },
      { icons: 5, badge: true },
    ];
    // Room for every group's badge and "+N" plus exactly two chips per group.
    const width =
      bringRowRem(long, [0, 0, 0], false) + 3 * 2 * (m.chipRem + m.itemGapRem);
    expect(bringGroupsThatFit(long, width)).toEqual({
      drawn: [2, 2, 2],
      hiddenIcons: 0,
    });
    // A group's last chip takes the place of its "+N": it costs no extra room, so a
    // group that completes leaves its share to the others.
    const short =
      bringRowRem(GROUPS, [0, 0, 0], false) +
      3 * 2 * (m.chipRem + m.itemGapRem);
    expect(bringGroupsThatFit(GROUPS, short)).toEqual({
      drawn: [2, 3, 2],
      hiddenIcons: 0,
    });
  });

  it("leaves out the last groups only when not every badge fits, counting them in a trailing +N", () => {
    const width = bringRowRem(GROUPS, [2, 0], true);
    const fit = bringGroupsThatFit(GROUPS, width);
    expect(fit.drawn).toEqual([2, 0]);
    expect(fit.hiddenIcons).toBe(5);
    // Not even the first group: everything is counted.
    expect(bringGroupsThatFit(GROUPS, 0.5)).toEqual({
      drawn: [],
      hiddenIcons: total,
    });
  });

  it('reserves room for a two-digit +N (2rem, as measured for "+12" in the e2e)', () => {
    const m = BRING_AREA_METRICS;
    expect(m.moreRem).toBeGreaterThanOrEqual(2);
    // One child with 20 icons: room for 3 chips plus the "+17" is exactly enough for 3.
    const one: BringGroupSize[] = [{ icons: 20, badge: true }];
    const width = bringRowRem(one, [3], false);
    const fit = bringGroupsThatFit(one, width);
    expect(fit.drawn).toEqual([3]);
    // One chip fewer in the same room would leave the "+N" no less room (it is reserved).
    expect(bringRowRem(one, [4], false)).toBeGreaterThan(width);
    // The row with its drawn chips and "+N" never needs more than the room it was given.
    expect(bringRowRem(one, fit.drawn, false)).toBeLessThanOrEqual(width);
  });

  it("at every width: nothing lost, never wider than the row, no +N while another chip fits", () => {
    for (let tenths = 0; tenths <= 600; tenths += 1) {
      const width = tenths / 10;
      const { drawn, hiddenIcons } = bringGroupsThatFit(GROUPS, width);
      const hidden = drawn.length < GROUPS.length;
      const counted =
        drawn.reduce(
          (sum, count, index) => sum + ((GROUPS[index]?.icons ?? 0) - count),
          0,
        ) + hiddenIcons;
      const shown = drawn.reduce((sum, count) => sum + count, 0);
      expect(shown + counted, `width ${String(width)}`).toBe(total);
      expect(hiddenIcons > 0).toBe(hidden);
      drawn.forEach((count, index) => {
        expect(count).toBeGreaterThanOrEqual(0);
        expect(count).toBeLessThanOrEqual(GROUPS[index]?.icons ?? 0);
      });
      if (drawn.length > 0 || hidden) {
        const used = bringRowRem(GROUPS, drawn, hidden);
        if (drawn.length > 0) {
          expect(used, `width ${String(width)}`).toBeLessThanOrEqual(
            width + 1e-6,
          );
        }
        // No group could draw one more chip in the room left.
        drawn.forEach((count, index) => {
          if (count >= (GROUPS[index]?.icons ?? 0)) return;
          const more = drawn.map((c, i) => (i === index ? c + 1 : c));
          expect(bringRowRem(GROUPS, more, hidden)).toBeGreaterThan(
            width + 1e-6,
          );
        });
      }
    }
  });
});

describe("BringArea", () => {
  it("is a labelled region (not a live region) naming every child and icon", () => {
    render(<BringArea reminder={REMINDER} />);
    const area = screen.getByRole("region", {
      name: "Pack for tomorrow: Everyone 🧺, Mia 🩱 🧴 🥽, and Ben 👟",
    });
    expect(area).toHaveAttribute("data-when", "tomorrow");
    expect(area).not.toHaveAttribute("aria-live");
    expect(area.querySelector("[aria-live]")).toBeNull();
    // Nothing to touch.
    expect(within(area).queryAllByRole("button")).toEqual([]);
    expect(area.querySelector("a, button, [tabindex]")).toBeNull();
  });

  it("the morning variant and German", () => {
    const { rerender } = render(
      <BringArea reminder={{ ...REMINDER, when: "today" }} />,
    );
    expect(
      screen.getByRole("region", {
        name: "Today bring: Everyone 🧺, Mia 🩱 🧴 🥽, and Ben 👟",
      }),
    ).toBeInTheDocument();
    applyLocale("de");
    rerender(<BringArea reminder={REMINDER} />);
    expect(
      screen.getByRole("region", {
        name: "Für morgen einpacken: Alle 🧺, Mia 🩱 🧴 🥽 und Ben 👟",
      }),
    ).toBeInTheDocument();
    rerender(<BringArea reminder={{ ...REMINDER, when: "today" }} />);
    expect(
      screen.getByRole("region", {
        name: "Heute mitbringen: Alle 🧺, Mia 🩱 🧴 🥽 und Ben 👟",
      }),
    ).toBeInTheDocument();
  });

  it("leads with 🎒, then one group per child (badge, tint, edge), the neutral one first", () => {
    render(<BringArea reminder={REMINDER} />);
    const area = screen.getByTestId("bring-area");
    const first = area.querySelector(".font-emoji");
    expect(first?.textContent).toBe("🎒");
    expect(first).toHaveAttribute("aria-hidden", "true");
    const groups = within(area).getAllByTestId("bring-group");
    expect(groups.map((group) => group.dataset["child"])).toEqual([
      "",
      "mia",
      "ben",
    ]);
    // Neutral group: no badge, a raised pill; child groups: avatar badge on their tint.
    expect(groups[0]?.querySelectorAll(".font-emoji")).toHaveLength(1);
    expect(groups[0]).toHaveClass("bg-surface-raised");
    expect(groups[1]?.textContent).toContain("🦊");
    expect(groups[1]?.getAttribute("style")).toContain(
      "var(--color-child-1-tint)",
    );
    expect(groups[2]?.textContent).toContain("🐻");
    const chips = within(area).getAllByTestId("bring-area-chip");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "🧺",
      "🩱",
      "🧴",
      "🥽",
      "👟",
    ]);
    for (const chip of chips) {
      expect(chip).toHaveClass("bg-chip", "inset-ring-border", "rounded-pill");
      expect(chip.querySelector(".font-emoji")).not.toBeNull();
    }
    // The visual row is decorative; the region's name carries the content.
    expect(screen.getByTestId("bring-groups")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(within(area).queryByTestId("bring-group-more")).toBeNull();
    expect(within(area).queryByTestId("bring-area-more")).toBeNull();
  });

  it("one row of fixed height that never wraps", () => {
    render(<BringArea reminder={REMINDER} />);
    expect(screen.getByTestId("bring-area")).toHaveClass("h-11", "shrink-0");
    expect(screen.getByTestId("bring-groups")).toHaveClass(
      "overflow-hidden",
      "min-w-0",
    );
    expect(screen.getByTestId("bring-groups")).not.toHaveClass("flex-wrap");
  });

  it("draws whole chips only and counts the rest in a plain-text +N per group", () => {
    const m = BRING_AREA_METRICS;
    const sizes = REMINDER.groups.map((group) => ({
      icons: group.icons.length,
      badge: group.child !== null,
    }));
    // Every group's minimum plus room for one chip: the single-icon groups complete for
    // free (their chip replaces their "+N"), Mia gets one chip and "+2".
    stubWidth(
      bringRowRem(sizes, [0, 0, 0], false) + (m.chipRem + m.itemGapRem),
    );
    render(<BringArea reminder={REMINDER} />);
    const groups = screen.getAllByTestId("bring-group");
    expect(groups.map((group) => group.dataset["drawn"])).toEqual([
      "1",
      "1",
      "1",
    ]);
    expect(
      within(groups[1] as HTMLElement).getAllByTestId("bring-area-chip"),
    ).toHaveLength(1);
    expect(
      within(groups[1] as HTMLElement).getByTestId("bring-group-more"),
    ).toHaveTextContent("+2");
    // The name still lists every icon.
    expect(screen.getByRole("region")).toHaveAccessibleName(
      "Pack for tomorrow: Everyone 🧺, Mia 🩱 🧴 🥽, and Ben 👟",
    );
  });

  it("counts groups without room in a trailing +N", () => {
    const sizes = REMINDER.groups.map((group) => ({
      icons: group.icons.length,
      badge: group.child !== null,
    }));
    // Room for the neutral group and Mia's badge with their "+N" (the neutral icon then
    // fits whole, as a chip is narrower than a "+N"), but not Ben's badge.
    stubWidth(bringRowRem(sizes, [0, 0], true) + 0.05);
    const { unmount } = render(<BringArea reminder={REMINDER} />);
    expect(
      screen.getAllByTestId("bring-group").map((g) => g.dataset["child"]),
    ).toEqual(["", "mia"]);
    expect(screen.getByTestId("bring-group-more")).toHaveTextContent("+3");
    expect(screen.getByTestId("bring-area-more")).toHaveTextContent("+1");
    unmount();
    // Too narrow for any group: one "+N" counts every icon.
    stubWidth(1);
    render(<BringArea reminder={REMINDER} />);
    expect(screen.queryAllByTestId("bring-group")).toEqual([]);
    expect(screen.getByTestId("bring-area-more")).toHaveTextContent("+5");
  });

  it("renders nothing when there is nothing to pack", () => {
    const { container } = render(
      <BringArea reminder={{ when: "tomorrow", groups: [] }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
