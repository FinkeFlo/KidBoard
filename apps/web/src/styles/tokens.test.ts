import { describe, expect, it } from "vitest";

import globalCss from "./global.css?raw";
import tokensCss from "./tokens.css?raw";

type TokenMap = Map<string, string>;

/** Extract the declarations of the first block that follows `selector`. */
function parseBlock(css: string, selector: string): TokenMap {
  const start = css.indexOf(selector);
  if (start === -1) {
    throw new Error(`Selector not found: ${selector}`);
  }
  const open = css.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") depth--;
    if (depth === 0) {
      end = i;
      break;
    }
  }
  const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens: TokenMap = new Map();
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      tokens.set(name, value.trim());
    }
  }
  return tokens;
}

const light = parseBlock(tokensCss, "@theme static");
const nightOverrides = parseBlock(tokensCss, '[data-theme="night"]');
const night: TokenMap = new Map([...light, ...nightOverrides]);

function channel(hex: string, offset: number): number {
  const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return (
    0.2126 * channel(hex, 1) +
    0.7152 * channel(hex, 3) +
    0.0722 * channel(hex, 5)
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

function color(theme: TokenMap, name: string): string {
  const value = theme.get(name);
  if (value === undefined || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(
      `Token ${name} is not a 6-digit hex colour: ${String(value)}`,
    );
  }
  return value;
}

const TEXT_AA = 4.5;
const UI_AA = 3;
const CHILD_TOKENS = [1, 2, 3, 4, 5, 6].map(
  (n) => `--color-child-${String(n)}`,
);
const BANDS = ["morning", "midday", "evening"] as const;

/** [foreground, background, minimum ratio] pairs the components actually use. */
const PAIRS: readonly (readonly [string, string, number])[] = [
  ["--color-text", "--color-surface", TEXT_AA],
  ["--color-text", "--color-surface-raised", TEXT_AA],
  ["--color-text", "--color-surface-sunken", TEXT_AA],
  ["--color-text-muted", "--color-surface", TEXT_AA],
  ["--color-text-muted", "--color-surface-raised", TEXT_AA],
  ["--color-on-accent", "--color-accent", TEXT_AA],
  ["--color-accent", "--color-surface", TEXT_AA],
  ["--color-on-danger", "--color-danger", TEXT_AA],
  ["--color-on-notice", "--color-notice", TEXT_AA],
  ["--color-border", "--color-surface", 1.2],
  ...BANDS.flatMap((band) => [
    [`--color-text`, `--color-band-${band}`, TEXT_AA] as const,
    [`--color-text-muted`, `--color-band-${band}`, TEXT_AA] as const,
    [`--color-band-${band}-accent`, `--color-band-${band}`, TEXT_AA] as const,
  ]),
  ["--color-text-muted", "--color-surface-sunken", TEXT_AA] as const,
  // Weekend week columns (`bg-band-morning`, label `text-band-morning-accent`) and the
  // countdown surface (`bg-band-evening`) also carry the muted text and the accent.
  ["--color-accent", "--color-band-morning", UI_AA] as const,
  ["--color-accent", "--color-band-evening", UI_AA] as const,
  ["--color-accent", "--color-surface-sunken", UI_AA] as const,
  // `ring-accent` (current tile, today's column) against what surrounds it.
  ["--color-accent", "--color-surface-raised", UI_AA] as const,
  ["--color-accent", "--color-band-midday", UI_AA] as const,
  // Band rings (`ring-band-*-accent`) against the page.
  ...BANDS.map(
    (band) =>
      [`--color-band-${band}-accent`, "--color-surface", UI_AA] as const,
  ),
  // The band surfaces must stand out from the page (edge between columns).
  ...BANDS.map(
    (band) => [`--color-band-${band}`, "--color-surface", 1.05] as const,
  ),
  ["--color-on-notice", "--color-surface", TEXT_AA] as const,
  ["--color-danger", "--color-surface", TEXT_AA] as const,
  ...CHILD_TOKENS.flatMap((child) => [
    ["--color-on-child", child, TEXT_AA] as const,
    [child, "--color-surface", UI_AA] as const,
    [child, "--color-surface-raised", UI_AA] as const,
  ]),
];

describe.each([
  ["light", light],
  ["night", night],
] as const)("%s theme contrast (WCAG AA)", (_name, theme) => {
  it.each(PAIRS)("%s on %s reaches %s:1", (fg, bg, min) => {
    expect(contrast(color(theme, fg), color(theme, bg))).toBeGreaterThanOrEqual(
      min,
    );
  });
});

describe("token structure", () => {
  it("defines at least 6 distinct child colors in both themes", () => {
    for (const theme of [light, night]) {
      const values = CHILD_TOKENS.map((t) => color(theme, t).toLowerCase());
      expect(new Set(values).size).toBe(CHILD_TOKENS.length);
    }
  });

  it("overrides only known tokens in night mode and every colour token", () => {
    for (const name of nightOverrides.keys()) {
      expect(light.has(name), `${name} missing in light set`).toBe(true);
    }
    const lightColors = [...light.keys()].filter((k) =>
      k.startsWith("--color-"),
    );
    for (const name of lightColors) {
      if (name === "--color-*") continue;
      expect(nightOverrides.has(name), `${name} not defined for night`).toBe(
        true,
      );
    }
  });

  it("covers the contrast of every band, bands, radii, shadows, sizes and durations", () => {
    for (const band of BANDS) {
      expect(light.has(`--color-band-${band}`)).toBe(true);
      expect(light.has(`--color-band-${band}-accent`)).toBe(true);
    }
    for (const prefix of ["--radius-", "--shadow-", "--text-", "--duration-"]) {
      expect([...light.keys()].some((k) => k.startsWith(prefix))).toBe(true);
    }
  });

  it("defines spacing and a touch target of at least 64px", () => {
    expect(light.get("--spacing")).toBe("0.25rem");
    expect(light.has("--spacing-gutter")).toBe(true);
    expect(light.has("--spacing-page")).toBe(true);
    const touch = light.get("--spacing-touch");
    expect(touch).toMatch(/^max\(64px,\s*4rem\)$/);
  });

  it("keeps the burn-in amplitude well below the gutter (both rem based, so at every root size)", () => {
    const rem = (name: string): number => {
      const value = light.get(name) ?? "";
      expect(value, name).toMatch(/^\d+(\.\d+)?rem$/);
      return parseFloat(value);
    };
    const burnIn = rem("--spacing-burn-in");
    expect(burnIn).toBeGreaterThan(0);
    expect(burnIn).toBeLessThanOrEqual(rem("--spacing-gutter") / 2);
    // "A few px": 8 px at the 16 px root of 1280x800, 12 px at the 24 px root of 2000x1200.
    expect(burnIn * 16).toBeLessThanOrEqual(12);
  });

  it("disables transition and animation durations for reduced motion", () => {
    expect(tokensCss).toMatch(
      /prefers-reduced-motion:\s*reduce\)\s*\{\s*:root\s*\{[^}]*--duration-normal:\s*0ms/,
    );
    expect(globalCss).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(globalCss).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(globalCss).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
  });

  it("keeps components free of raw hex colours", () => {
    const sources = import.meta.glob<string>("../**/*.tsx", {
      query: "?raw",
      import: "default",
      eager: true,
    });
    expect(Object.keys(sources).length).toBeGreaterThan(0);
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
