import type { CSSProperties } from "react";

/** Custom property that carries the resolved child colour into the styles. */
export const CHILD_COLOR_VAR = "--child-color";

const TOKEN_NAME = /^child-[1-6]$/;
/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`. */
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
/** Plain colour keyword such as `tomato` (letters only). */
const KEYWORD = /^[a-z]{3,20}$/i;
/** `rgb(...)`, `hsl(...)` and friends: digits, separators and units only. */
const FUNCTION =
  /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\([\d\s.,%/a-z-]*\)$/i;
const FALLBACK = "var(--color-border)";

/**
 * Resolves a configured child colour (`Child.color`) to a CSS value for the
 * `--child-color` custom property. A token name ("child-1") maps to its design token;
 * a hex, functional or keyword colour passes through; anything else (config is
 * parent-edited text, not markup) falls back to the neutral border colour. The result
 * is only ever used as a style variable value, never in class names.
 */
export function resolveChildColor(color: string | undefined): string {
  const value = color?.trim() ?? "";
  if (TOKEN_NAME.test(value)) return `var(--color-${value})`;
  if (
    HEX.test(value) ||
    KEYWORD.test(value) ||
    (FUNCTION.test(value) && !/url|var|attr|env/i.test(value))
  ) {
    return value;
  }
  return FALLBACK;
}

/** Inline style that defines `--child-color` for a child (or the neutral fallback). */
export function childColorStyle(color: string | undefined): CSSProperties {
  // React's CSSProperties has no index signature for custom properties.
  return { [CHILD_COLOR_VAR]: resolveChildColor(color) } as CSSProperties;
}
