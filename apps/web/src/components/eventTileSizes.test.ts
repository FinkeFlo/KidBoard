import { describe, expect, it } from "vitest";

import { type SizeClasses, tileClasses, type TileSize } from "./eventTileSizes";

// The whole resolved table, written out here on purpose (not imported from
// `eventTileSizes.ts`), so any changed class fails a test. Update it only for an
// intended visual change.

/** Values every size shares unless its own row says otherwise. */
const BASE: Omit<SizeClasses, "tile" | "disc" | "emoji" | "title"> = {
  titleCut: "",
  metaText: "text-meta",
  allDayIcon: "size-6",
  timeIcon: "text-[1.5rem]",
  badge: "size-6",
  badgeText: "text-caption",
  badgeOverlap: "-ms-1.5",
  badgeFloat: false,
  stacked: false,
  inline: false,
  weekRow: false,
  cue: "size-6",
};

type Row = Pick<SizeClasses, "tile" | "disc" | "emoji" | "title"> &
  Partial<SizeClasses>;

/** Per size, the four own fields plus every field that differs from {@link BASE}. */
const PLAIN: Record<TileSize, Row> = {
  large: {
    tile: "h-tile gap-3 ps-3 pe-3",
    disc: "size-[4.25rem]",
    emoji: "text-[3.5rem]",
    title: "text-tile line-clamp-2",
    badge: "size-6.5",
    badgeText: "text-meta",
    badgeFloat: true,
  },
  medium: {
    tile: "h-18 gap-3 ps-3 pe-3",
    disc: "size-[3.75rem]",
    emoji: "text-[3rem]",
    title: "text-tile-compact line-clamp-2",
    badgeFloat: true,
  },
  dense: {
    tile: "h-14 gap-2.5 ps-2.5 pe-3",
    disc: "size-[3.125rem]",
    emoji: "text-[2.75rem]",
    title: "text-tile-compact line-clamp-1",
    badge: "size-7",
    badgeText: "text-body",
    badgeOverlap: "-ms-1.75",
  },
  slim: {
    tile: "h-11 gap-2.5 ps-2 pe-3",
    disc: "size-9",
    emoji: "text-[2rem]",
    title: "text-tile-compact",
    inline: true,
    cue: "size-4",
  },
  compact: {
    tile: "h-tile-compact gap-1.5 ps-1.5 pe-1.5",
    disc: "size-12",
    emoji: "text-[2.5rem]",
    title: "text-tile-compact line-clamp-2",
    badgeFloat: true,
  },
  "compact-dense": {
    tile: "h-15 gap-1.5 ps-1.5 pe-1.5",
    disc: "size-11",
    emoji: "text-[2.25rem]",
    title: "text-tile-compact line-clamp-1",
  },
  week: {
    tile: "h-29 flex-col justify-center gap-0.5 px-1.5",
    disc: null,
    emoji: "text-[2.5rem]",
    title: "text-meta leading-tight",
    titleCut: "line-clamp-2 break-words",
    stacked: true,
  },
  "week-dense": {
    tile: "h-21 flex-col justify-center gap-0.5 px-1.5",
    disc: null,
    emoji: "text-[2rem]",
    title: "text-caption",
    titleCut: "block truncate",
    stacked: true,
  },
  "week-small": {
    tile: "h-19 flex-col justify-center gap-0.5 px-1.5",
    disc: null,
    emoji: "text-[1.75rem]",
    title: "text-caption",
    titleCut: "block truncate",
    metaText: "text-caption",
    allDayIcon: "size-5",
    timeIcon: "text-[1.125rem]",
    badge: "size-5",
    badgeText: "text-[0.75rem]",
    badgeOverlap: "-ms-1.25",
    stacked: true,
    cue: "size-4",
  },
  "week-slim": {
    tile: "h-12 gap-2 ps-1.5 pe-1",
    disc: null,
    emoji: "text-[1.75rem]",
    title: "text-caption",
    titleCut: "block truncate",
    metaText: "text-caption",
    allDayIcon: "size-4",
    timeIcon: "text-[1rem]",
    badge: "size-5",
    badgeText: "text-[0.75rem]",
    badgeOverlap: "-ms-1.25",
    weekRow: true,
    cue: "size-4",
  },
};

/** What a prominent tile changes on top of its plain row; sizes not listed have none. */
const PROMINENT: Partial<Record<TileSize, Partial<SizeClasses>>> = {
  large: {
    tile: "h-[6.5rem] gap-4 ps-3 pe-3",
    disc: "size-[5.5rem]",
    emoji: "text-[4.5rem]",
    title: "text-heading line-clamp-2",
    timeIcon: "text-[1.75rem]",
    badge: "size-9",
    badgeText: "text-body",
    badgeOverlap: "-ms-2.25",
  },
  medium: {
    tile: "h-[5.5rem] gap-3 ps-3 pe-3",
    disc: "size-[4.5rem]",
    emoji: "text-[3.75rem]",
    title: "text-tile line-clamp-2",
    badge: "size-6.5",
    badgeText: "text-meta",
  },
  dense: {
    tile: "h-[4.5rem] gap-3 ps-2.5 pe-3",
    disc: "size-[4rem]",
    emoji: "text-[3.25rem]",
    title: "text-tile-compact line-clamp-2",
    badge: "size-6",
    badgeText: "text-caption",
    badgeOverlap: "-ms-1.5",
    badgeFloat: true,
  },
};

const SIZES = Object.keys(PLAIN) as TileSize[];

const FIELDS: readonly (keyof SizeClasses)[] = [
  "tile",
  "disc",
  "emoji",
  "title",
  "titleCut",
  "metaText",
  "allDayIcon",
  "timeIcon",
  "badge",
  "badgeText",
  "badgeOverlap",
  "badgeFloat",
  "stacked",
  "inline",
  "weekRow",
  "cue",
];

const BOOLEAN_FIELDS: ReadonlySet<keyof SizeClasses> = new Set([
  "badgeFloat",
  "stacked",
  "inline",
  "weekRow",
]);

function expectedPlain(size: TileSize): SizeClasses {
  return { ...BASE, ...PLAIN[size] };
}

describe("tileClasses", () => {
  it.each(SIZES)("resolves %s to the base row plus its overrides", (size) => {
    expect(tileClasses(size, false)).toStrictEqual(expectedPlain(size));
  });

  it.each(SIZES)(
    "resolves prominent %s to its plain row plus the prominent overrides",
    (size) => {
      expect(tileClasses(size, true)).toStrictEqual({
        ...expectedPlain(size),
        ...PROMINENT[size],
      });
    },
  );

  it.each(
    SIZES.flatMap(
      (size) =>
        [
          [size, false],
          [size, true],
        ] as const,
    ),
  )("resolves every field of %s (prominent: %s)", (size, prominent) => {
    const resolved = tileClasses(size, prominent);
    expect(Object.keys(resolved).sort()).toStrictEqual([...FIELDS].sort());
    for (const field of FIELDS) {
      const value = resolved[field];
      if (BOOLEAN_FIELDS.has(field)) {
        expect(typeof value, field).toBe("boolean");
      } else if (field === "disc" && size.startsWith("week")) {
        // Week tiles have no disc behind the emoji.
        expect(value, field).toBeNull();
      } else if (field === "titleCut" && !size.startsWith("week")) {
        // Only week tiles cut the title text itself.
        expect(value, field).toBe("");
      } else {
        expect(value, field).toEqual(expect.any(String));
        expect(value, field).not.toBe("");
      }
    }
  });

  it("returns the plain classes for sizes without a prominent variant", () => {
    // The same object, resolved once at module load.
    expect(tileClasses("week", true)).toBe(tileClasses("week", false));
  });
});
