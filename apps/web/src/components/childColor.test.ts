import { afterEach, describe, expect, it, vi } from "vitest";

import { childColorStyle, resolveChildColor } from "./childColor";

describe("resolveChildColor", () => {
  it.each([
    ["child-1", "var(--color-child-1)"],
    ["child-6", "var(--color-child-6)"],
    [" child-3 ", "var(--color-child-3)"],
    ["#e4572e", "#e4572e"],
    ["#abc", "#abc"],
    ["tomato", "tomato"],
    ["rgb(10, 20, 30)", "rgb(10, 20, 30)"],
    ["oklch(60% 0.2 30)", "oklch(60% 0.2 30)"],
  ])("accepts %s", (input, expected) => {
    expect(resolveChildColor(input)).toBe(expected);
  });

  it.each([
    "child-7",
    "",
    "#12",
    "red; background: url(x)",
    "url(https://example.invalid/x)",
    "rgb(var(--x))",
    "red}</style><script>",
    "calc(1px)",
    "inherit",
    "initial",
    "unset",
    "currentcolor",
    "transparent",
    "notacolor",
    "rgb(red, x)",
    "rgb(1, 2)",
    "rgb(1 2 3 4 5)",
    "hsl(120deg 50% 50%) x",
    "#ggg",
  ])("falls back to the neutral colour for %j", (input) => {
    expect(resolveChildColor(input)).toBe("var(--color-border)");
  });

  it("falls back for undefined and exposes a custom property", () => {
    expect(resolveChildColor(undefined)).toBe("var(--color-border)");
    expect(childColorStyle("child-2")).toEqual({
      "--child-color": "var(--color-child-2)",
    });
  });
});

describe("resolveChildColor without and with CSS.supports", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates purely when CSS is undefined (non-DOM)", () => {
    vi.stubGlobal("CSS", undefined);
    expect(resolveChildColor("tomato")).toBe("tomato");
    expect(resolveChildColor("rgb(10 20 30 / 50%)")).toBe(
      "rgb(10 20 30 / 50%)",
    );
    expect(resolveChildColor("hsl(120deg, 50%, 50%)")).toBe(
      "hsl(120deg, 50%, 50%)",
    );
    expect(resolveChildColor("notacolor")).toBe("var(--color-border)");
    expect(resolveChildColor("inherit")).toBe("var(--color-border)");
    expect(resolveChildColor("rgb(red, x)")).toBe("var(--color-border)");
  });

  it("lets CSS.supports have the final say when available", () => {
    const supports = vi.fn(
      (_property: string, value: string) => value !== "#123",
    );
    vi.stubGlobal("CSS", { supports });
    expect(resolveChildColor("#123")).toBe("var(--color-border)");
    expect(resolveChildColor("#456")).toBe("#456");
    expect(supports).toHaveBeenCalledWith("color", "#456");
    // Strict shape check still applies before the browser is asked.
    supports.mockClear();
    expect(resolveChildColor("notacolor")).toBe("var(--color-border)");
    expect(supports).not.toHaveBeenCalled();
  });
});
