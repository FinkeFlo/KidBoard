import { describe, expect, it } from "vitest";

import {
  MAX_BADGES,
  resolveChildTint,
  resolveTileTint,
  tileTintStyle,
} from "./childTint";
import { BEN, MIA } from "./fixtures.test-utils";

const child = (id: string, color: string): typeof MIA => ({
  ...MIA,
  id,
  color,
});

describe("resolveChildTint", () => {
  it("maps token colours to their tint token", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(resolveChildTint(`child-${String(n)}`)).toBe(
        `var(--color-child-${String(n)}-tint)`,
      );
    }
    expect(resolveChildTint({ color: " child-3 " })).toBe(
      "var(--color-child-3-tint)",
    );
  });

  it("mixes other CSS colours 20 % into the surface", () => {
    expect(resolveChildTint("#ff00aa")).toBe(
      "color-mix(in oklab, #ff00aa 20%, var(--color-surface))",
    );
    expect(resolveChildTint({ color: "tomato" })).toBe(
      "color-mix(in oklab, tomato 20%, var(--color-surface))",
    );
    expect(resolveChildTint("rgb(10 20 30)")).toContain("rgb(10 20 30) 20%");
  });

  it("falls back to the neutral fill for unusable colours", () => {
    for (const bad of [
      "child-7",
      "inherit",
      "initial",
      "notacolor",
      "rgb(red, x)",
      "url(http://x)",
      "red; background: blue",
      "",
      undefined,
    ]) {
      expect(resolveChildTint(bad)).toBe("var(--color-surface-raised)");
    }
  });
});

describe("resolveTileTint", () => {
  it("is neutral without children", () => {
    expect(resolveTileTint([])).toEqual({
      kind: "none",
      background: "var(--color-surface-raised)",
      edge: null,
      badges: [],
      overflow: 0,
    });
  });

  it("uses tint, edge and one badge for a single child", () => {
    const tint = resolveTileTint([child("a", "child-2")]);
    expect(tint.kind).toBe("single");
    expect(tint.background).toBe("var(--color-child-2-tint)");
    expect(tint.edge).toBe("var(--color-child-2)");
    expect(tint.badges).toHaveLength(1);
  });

  it("splits hard at 50 % for two children, child 1 left", () => {
    const tint = resolveTileTint([MIA, BEN]);
    expect(tint.kind).toBe("split");
    expect(tint.edge).toBeNull();
    expect(tint.background).toBe(
      `linear-gradient(90deg, ${resolveChildTint(MIA)} 50%, ${resolveChildTint(BEN)} 50%)`,
    );
    expect(tint.badges).toEqual([MIA, BEN]);
  });

  it("is neutral for 3+ children with up to three badges and +N", () => {
    const four = ["a", "b", "c", "d"].map((id) => child(id, "child-1"));
    const tint = resolveTileTint(four);
    expect(tint.kind).toBe("neutral");
    expect(tint.background).toBe("var(--color-surface-raised)");
    expect(tint.badges).toHaveLength(MAX_BADGES);
    expect(tint.overflow).toBe(1);
    expect(resolveTileTint(four.slice(0, 3)).overflow).toBe(0);
  });

  it("validates the edge like the tint", () => {
    const bad = resolveTileTint([child("a", "notacolor")]);
    expect(bad.background).toBe("var(--color-surface-raised)");
    expect(bad.edge).toBe("var(--color-border)");
    expect(resolveTileTint([child("a", "#e4572e")]).edge).toBe("#e4572e");
  });

  it("builds a style value, with the edge only for one child", () => {
    const single = tileTintStyle(resolveTileTint([child("a", "child-1")]));
    expect(single).toEqual({
      background: "var(--color-child-1-tint)",
      "--child-color": "var(--color-child-1)",
    });
    expect(tileTintStyle(resolveTileTint([MIA, BEN]))).not.toHaveProperty(
      "--child-color",
    );
  });
});
