import type { CSSProperties } from "react";

/** Custom property that carries the resolved child colour into the styles. */
export const CHILD_COLOR_VAR = "--child-color";

/** Matches a token child colour (`child-1` … `child-6`); the capture is its number. */
export const CHILD_TOKEN = /^child-([1-6])$/;
/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`. */
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)`;
const COMPONENT = `(?:${NUM}(?:%|deg|grad|rad|turn)?|none)`;
/** Three components, optionally followed by an alpha value (`,` or `/` separated). */
const ARGS = `${COMPONENT}(?:\\s*,\\s*|\\s+)${COMPONENT}(?:\\s*,\\s*|\\s+)${COMPONENT}(?:\\s*[,/]\\s*${COMPONENT})?`;
/** Strict grammar of the functional notations; no nesting, no `var()`, no letters. */
const FUNCTION = new RegExp(
  `^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\\(\\s*${ARGS}\\s*\\)$`,
  "i",
);

/** CSS-wide keywords and context colours: they are no colour of their own. */
const REJECTED_KEYWORDS = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
  "currentcolor",
  "transparent",
]);

/** CSS named colours (CSS Color Level 4), lowercase. */
const NAMED_COLORS = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue " +
    "blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk " +
    "crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki " +
    "darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
    "darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue " +
    "dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite " +
    "gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
    "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
    "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen " +
    "lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen " +
    "magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
    "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream " +
    "mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
    "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
    "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
    "seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen " +
    "steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow " +
    "yellowgreen"
  ).split(" "),
);

const FALLBACK = "var(--color-border)";

/**
 * Whether `value` is a plain CSS colour we pass into a style value: a named colour, hex or
 * a functional notation with the strict grammar above; CSS-wide keywords, `currentcolor`,
 * `var()`, `url()` and anything else are refused. Where the browser offers
 * `CSS.supports` it has the final say (so e.g. out-of-range syntax it rejects is refused
 * too); without it (tests, non-DOM use) the pure grammar alone decides.
 */
export function isCssColor(value: string): boolean {
  const lower = value.toLowerCase();
  if (REJECTED_KEYWORDS.has(lower)) return false;
  const shapeOk =
    HEX.test(value) || NAMED_COLORS.has(lower) || FUNCTION.test(value);
  if (!shapeOk) return false;
  // `CSS` is absent outside a browser; the global may be undefined at runtime.
  const css = (
    globalThis as { CSS?: { supports?: (p: string, v: string) => boolean } }
  ).CSS;
  return typeof css?.supports === "function"
    ? css.supports("color", value)
    : true;
}

/**
 * Resolves a configured child colour (`Child.color`) to a CSS value for the
 * `--child-color` custom property. A token name ("child-1") maps to its design token;
 * a hex, functional or keyword colour passes through; anything else (config is
 * parent-edited text, not markup) falls back to the neutral border colour. The result
 * is only ever used as a style variable value, never in class names.
 */
export function resolveChildColor(color: string | undefined): string {
  const value = color?.trim() ?? "";
  if (CHILD_TOKEN.test(value)) return `var(--color-${value})`;
  return isCssColor(value) ? value : FALLBACK;
}

/** Inline style that defines `--child-color` for a child (or the neutral fallback). */
export function childColorStyle(color: string | undefined): CSSProperties {
  // React's CSSProperties has no index signature for custom properties.
  return { [CHILD_COLOR_VAR]: resolveChildColor(color) } as CSSProperties;
}
