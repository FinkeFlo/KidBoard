import { describe, expect, it } from "vitest";

import { tileClasses, type TileSize } from "./eventTileSizes";

const SIZES: readonly TileSize[] = [
  "large",
  "medium",
  "dense",
  "slim",
  "compact",
  "compact-dense",
  "week",
  "week-dense",
  "week-small",
  "week-slim",
];

describe("tileClasses", () => {
  it("resolves every size, plain and prominent, to the pinned classes", () => {
    // Pins the full resolved table, so a restructuring of the size definitions is
    // provably identical. Update the snapshot only for an intended visual change.
    const resolved = Object.fromEntries(
      SIZES.map((size) => [
        size,
        { plain: tileClasses(size, false), prominent: tileClasses(size, true) },
      ]),
    );
    expect(resolved).toMatchSnapshot();
  });

  it("returns the plain classes for sizes without a prominent variant", () => {
    // The same object, resolved once at module load.
    expect(tileClasses("week", true)).toBe(tileClasses("week", false));
  });
});
