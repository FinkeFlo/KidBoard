import type { Child } from "@kidboard/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FormatContext } from "../i18n/format";
import en from "../i18n/locales/en.json";
import tokensCss from "../styles/tokens.css?raw";
import { EventTile, TILE_HEIGHT_REM, tileClasses } from "./EventTile";
import { BEN, eventFixture, MIA } from "./fixtures.test-utils";

const format: FormatContext = { locale: "en", timeZone: "Europe/Berlin" };
const LEO: Child = { id: "leo", name: "Leo", color: "child-3", avatar: "🦁" };
const ZOE: Child = { id: "zoe", name: "Zoe", color: "child-4", avatar: "🐼" };

const tile = (): HTMLElement => screen.getByTestId("event-tile");
const badges = (): HTMLElement => screen.getByTestId("child-badges");

describe("EventTile", () => {
  it("shows icon, one-line title and the time in the configured zone; named title, time, children", () => {
    render(
      <EventTile
        event={eventFixture({ childIds: ["mia"] })}
        childList={[MIA, BEN]}
        format={format}
        timeOfDay="midday"
      />,
    );
    const article = screen.getByRole("article", {
      name: "Swimming, 2:30 PM, For Mia",
    });
    expect(article).toBeVisible();
    // Decorative icon: the title is announced once, via the article name.
    expect(screen.getByText("🏊")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("2:30 PM")).toBeInTheDocument();
    // Up to two lines, then clamped; the title is plain text.
    expect(screen.getByTestId("tile-title")).toHaveTextContent("Swimming");
    expect(screen.getByTestId("tile-title").parentElement).toHaveClass(
      "line-clamp-2",
    );
    // The emoji sits on a light disc (pale glyphs stay visible), the time-of-day icon
    // is at least 1.5rem.
    expect(within(tile()).getByTestId("emoji-disc")).toHaveClass(
      "bg-surface-sunken",
      "inset-ring-border",
    );
    expect(within(tile()).getByText("🌞")).toHaveClass("text-[1.5rem]");
  });

  it("uses the zone, not the instant's offset or device zone", () => {
    render(
      <EventTile
        event={eventFixture({ start: "2026-11-22T13:30:00Z" })}
        childList={[]}
        format={format}
      />,
    );
    expect(screen.getByText("2:30 PM")).toBeInTheDocument();
  });

  it("shows the time-of-day symbol: 🌅 morning, 🌞 midday, 🌆 evening, never the moon", () => {
    const { rerender } = render(
      <EventTile
        event={eventFixture()}
        childList={[]}
        format={format}
        timeOfDay="morning"
      />,
    );
    const seen: string[] = [];
    for (const timeOfDay of ["morning", "midday", "evening"] as const) {
      rerender(
        <EventTile
          event={eventFixture()}
          childList={[]}
          format={format}
          timeOfDay={timeOfDay}
        />,
      );
      const symbols = [...tile().querySelectorAll(".font-emoji")].map(
        (el) => el.textContent,
      );
      seen.push(symbols[1] ?? "");
      expect(symbols).not.toContain("🌙");
      expect(symbols).not.toContain("☀️");
    }
    expect(seen).toEqual(["🌅", "🌞", "🌆"]);
  });

  it("gives all-day events the all-day icon and label, never a formatted date key", () => {
    render(
      <EventTile
        event={eventFixture({
          allDay: true,
          start: "2026-11-22",
          end: "2026-11-23",
        })}
        childList={[]}
        format={format}
      />,
    );
    expect(screen.getByText(en.event.allDay)).toBeInTheDocument();
    expect(tile()).toHaveAttribute("data-all-day", "true");
    expect(screen.getByTestId("all-day-icon")).toBeInTheDocument();
    expect(tile().querySelectorAll(".font-emoji")).toHaveLength(1);
  });

  it("one child: the child's tint, an edge in the child colour and one badge", () => {
    render(
      <EventTile
        event={eventFixture({ childIds: ["mia", "ghost"] })}
        childList={[MIA, BEN]}
        format={format}
      />,
    );
    expect(tile()).toHaveAttribute("data-tint", "single");
    expect(tile().style.background).toBe("var(--color-child-1-tint)");
    expect(tile().style.getPropertyValue("--child-color")).toBe(
      "var(--color-child-1)",
    );
    // The edge is an overlay above the content, so the emoji never paints over it.
    expect(tile()).toHaveClass(
      "relative",
      "after:absolute",
      "after:inset-0",
      "after:inset-ring-4",
    );
    expect(within(badges()).getByText("🦊")).toBeInTheDocument();
    expect(badges()).toHaveAttribute("aria-hidden", "true");
  });

  it("puts the badges inside the tile, floated beside the title's first line only", () => {
    const { unmount } = render(
      <EventTile
        event={eventFixture({ title: "Swimming", childIds: ["mia"] })}
        childList={[MIA, BEN]}
        format={format}
      />,
    );
    const float = screen.getByTestId("badge-float");
    expect(float).toHaveClass("float-end");
    // Inside the tile (no corner overlay any more) and inside the title paragraph.
    expect(tile()).toContainElement(float);
    expect(float.parentElement).toContainElement(
      screen.getByTestId("tile-title"),
    );
    expect(float.parentElement?.className).not.toMatch(/\bpe-/u);
    unmount();
    render(
      <EventTile
        event={eventFixture({ title: "Swimming", childIds: [] })}
        childList={[MIA, BEN]}
        format={format}
      />,
    );
    expect(screen.queryByTestId("badge-float")).toBeNull();
  });

  it("two children: neutral fill with a colour stripe per child, side-by-side badges overlapping a quarter", () => {
    render(
      <EventTile
        event={eventFixture({ childIds: ["mia", "ben"] })}
        childList={[MIA, BEN]}
        format={format}
      />,
    );
    expect(tile()).toHaveAttribute("data-tint", "split");
    // No half-and-half fill that reads as a progress bar.
    expect(tile().style.background).toBe("var(--color-surface-raised)");
    expect(tile()).toHaveClass("after:inset-ring-border");
    const stripes = within(tile()).getByTestId("tile-stripes");
    expect(stripes).toHaveAttribute("aria-hidden", "true");
    expect(stripes.style.background).toContain("linear-gradient(90deg");
    expect(stripes.style.background).toContain("var(--color-child-1)");
    const shown = [...badges().children];
    expect(shown.map((badge) => badge.textContent)).toEqual(["🦊", "🐻"]);
    // size-6.5 (1.625rem) overlapping by 0.375rem: less than a quarter.
    expect(shown[0]).toHaveClass("size-6.5");
    expect(shown[1]).toHaveClass("-ms-1.5");
    expect(tile()).toHaveAccessibleName("Swimming, 2:30 PM, For Mia and Ben");
  });

  it("badges overlap by at most a quarter at every size, prominent ones included", () => {
    const sizes = [
      "large",
      "medium",
      "dense",
      "compact",
      "compact-dense",
      "week",
      "week-dense",
    ] as const;
    for (const size of sizes) {
      for (const prominent of [false, true]) {
        const { badge, badgeOverlap } = tileClasses(size, prominent);
        const width = Number(/^size-([\d.]+)$/u.exec(badge)?.[1]);
        const overlap = Number(/^-ms-([\d.]+)$/u.exec(badgeOverlap)?.[1]);
        expect(width, `${size} ${badge}`).toBeGreaterThan(0);
        expect(overlap / width, `${size} ${badgeOverlap}`).toBeGreaterThan(0);
        expect(overlap / width, `${size} ${badgeOverlap}`).toBeLessThanOrEqual(
          0.25,
        );
      }
    }
  });

  it("three and more children: neutral fill, three badges, then +N; the name lists all", () => {
    render(
      <EventTile
        event={eventFixture({ childIds: ["mia", "ben", "leo", "zoe"] })}
        childList={[MIA, BEN, LEO, ZOE]}
        format={format}
      />,
    );
    expect(tile()).toHaveAttribute("data-tint", "neutral");
    expect(tile().style.background).toBe("var(--color-surface-raised)");
    expect(within(badges()).getByTestId("child-badges-more")).toHaveTextContent(
      "+1",
    );
    expect(within(badges()).queryByText("🐼")).toBeNull();
    expect(tile()).toHaveAccessibleName(
      "Swimming, 2:30 PM, For Mia, Ben, Leo, and Zoe",
    );
  });

  it("names events without a configured child 'for everyone', without badges", () => {
    render(
      <EventTile
        event={eventFixture({ childIds: ["ghost"] })}
        childList={[MIA]}
        format={format}
      />,
    );
    expect(tile()).toHaveAccessibleName("Swimming, 2:30 PM, For everyone");
    expect(screen.queryByTestId("child-badges")).toBeNull();
    expect(tile()).toHaveAttribute("data-tint", "none");
  });

  it("past events recede through tokens, not opacity; current has a ring; next is emphasised", () => {
    const { rerender } = render(
      <EventTile
        event={eventFixture({ childIds: ["mia"] })}
        childList={[MIA]}
        format={format}
        status="past"
      />,
    );
    expect(tile()).toHaveAttribute("data-status", "past");
    expect(tile()).toHaveClass("bg-surface-sunken", "text-text-muted");
    expect(tile().className).not.toMatch(/opacity/);
    expect(tile().style.background).toBe("");
    expect(tile()).toHaveAccessibleName(
      `Swimming, 2:30 PM, For Mia, ${en.event.status.past}`,
    );

    rerender(
      <EventTile
        event={eventFixture()}
        childList={[]}
        format={format}
        status="current"
      />,
    );
    // Person-neutral "now": the ink ring and a clock cue, never a child-like accent.
    expect(tile()).toHaveClass("ring-4", "ring-now");
    expect(tile().className).not.toMatch(/accent/u);
    expect(within(tile()).getByTestId("now-cue")).toBeInTheDocument();
    expect(tile()).toHaveAccessibleName(
      `Swimming, 2:30 PM, For everyone, ${en.event.status.current}`,
    );

    rerender(
      <EventTile event={eventFixture()} childList={[]} format={format} next />,
    );
    expect(tile()).toHaveAttribute("data-next", "true");
    expect(tile()).toHaveClass("ring-today-ring", "ring-3");
    expect(within(tile()).queryByTestId("now-cue")).toBeNull();
    expect(tile()).toHaveAccessibleName(
      `Swimming, 2:30 PM, For everyone, ${en.event.status.next}`,
    );
  });

  it("keeps today's emoji at 3.5rem (large), 3rem (medium) and 2.75rem (dense)", () => {
    const expected = {
      large: "text-[3.5rem]",
      medium: "text-[3rem]",
      dense: "text-[2.75rem]",
    } as const;
    for (const size of ["large", "medium", "dense"] as const) {
      const { unmount } = render(
        <EventTile
          event={eventFixture()}
          childList={[]}
          format={format}
          size={size}
        />,
      );
      expect(screen.getByText("🏊")).toHaveClass(expected[size]);
      expect(tile()).toHaveAttribute("data-size", size);
      expect(tile()).toHaveAttribute("data-prominent", "false");
      unmount();
    }
  });

  it("a prominent tile in today's column is taller with a larger emoji; elsewhere it is ignored", () => {
    const { rerender } = render(
      <EventTile
        event={eventFixture()}
        childList={[]}
        format={format}
        size="large"
        prominent
      />,
    );
    expect(tile()).toHaveAttribute("data-prominent", "true");
    expect(tile()).toHaveClass("h-[6.5rem]");
    expect(screen.getByText("🏊")).toHaveClass("text-[4.5rem]");
    rerender(
      <EventTile
        event={eventFixture()}
        childList={[]}
        format={format}
        size="compact"
        prominent
      />,
    );
    expect(tile()).toHaveAttribute("data-prominent", "false");
    expect(tile()).toHaveClass("h-tile-compact");
    expect(screen.getByText("🏊")).toHaveClass("text-[2.5rem]");
  });

  it("uses the tile height tokens it reports for the column capacity", () => {
    const token = (name: string): number =>
      parseFloat(
        new RegExp(`${name}:\\s*([\\d.]+)rem`).exec(tokensCss)?.[1] ?? "NaN",
      );
    expect(TILE_HEIGHT_REM.large).toBe(token("--spacing-tile"));
    expect(TILE_HEIGHT_REM.compact).toBe(token("--spacing-tile-compact"));
    // Today shrinks large > medium > dense; dense still holds the 2.75rem emoji line
    // box inside the 4px edge on both sides (0.25rem each at the 16px baseline).
    expect(TILE_HEIGHT_REM.medium).toBeLessThan(TILE_HEIGHT_REM.large);
    expect(TILE_HEIGHT_REM.dense).toBeLessThan(TILE_HEIGHT_REM.medium);
    expect(TILE_HEIGHT_REM.dense).toBeGreaterThanOrEqual(2.75 + 2 * 0.25);
    expect(TILE_HEIGHT_REM["compact-dense"]).toBeLessThan(
      TILE_HEIGHT_REM.compact,
    );
  });

  it("week sizes stack emoji, a one-line title and the time, and keep the name", () => {
    render(
      <EventTile
        event={eventFixture({ childIds: ["mia"] })}
        childList={[MIA]}
        format={format}
        timeOfDay="midday"
        size="week"
      />,
    );
    expect(tile()).toHaveAttribute("data-size", "week");
    expect(tile().className).toContain("flex-col");
    // One truncated line, shown only where the week column is wide enough.
    const title = within(tile()).getByTestId("tile-title");
    expect(title).toHaveTextContent("Swimming");
    const line = title.parentElement as HTMLElement;
    expect(line).toHaveClass("truncate", "hidden", "@min-[5.5rem]:block");
    expect(tile()).toHaveAccessibleName("Swimming, 2:30 PM, For Mia");
    const icon = within(tile()).getByText("🌞");
    // The time-of-day icon is as large as in the overview (>= 1.5rem).
    expect(icon).toHaveClass("text-[1.5rem]");
    // No disc on the narrow week tiles; the badges sit inside the tile's corner.
    expect(within(tile()).queryByTestId("emoji-disc")).toBeNull();
    expect(tile()).toContainElement(badges());
    expect(TILE_HEIGHT_REM["week-dense"]).toBeLessThan(TILE_HEIGHT_REM.week);
    // Emoji + title line + time row (1.5rem icon) + gaps fit both heights:
    // week 2.5 + 1.3 + 1.5, dense 2 + 1.09 + 1.5 (rem).
    expect(TILE_HEIGHT_REM.week).toBeGreaterThanOrEqual(2.5 + 1.3 + 1.5 + 0.25);
    expect(TILE_HEIGHT_REM["week-dense"]).toBeGreaterThanOrEqual(
      2 + 1.09 + 1.5 + 0.25,
    );
  });

  it("drops the title line at the last week step (mini), keeping it in the name", () => {
    render(
      <EventTile
        event={eventFixture()}
        childList={[]}
        format={format}
        timeOfDay="midday"
        size="week-mini"
      />,
    );
    expect(within(tile()).queryByTestId("tile-title")).toBeNull();
    expect(tile()).toHaveAccessibleName("Swimming, 2:30 PM, For everyone");
    expect(within(tile()).getByText("🌞")).toHaveClass("text-[1.5rem]");
    expect(TILE_HEIGHT_REM["week-mini"]).toBeLessThan(
      TILE_HEIGHT_REM["week-dense"],
    );
    // Emoji 2rem + time row 1.5rem + gap fit.
    expect(TILE_HEIGHT_REM["week-mini"]).toBeGreaterThanOrEqual(
      2 + 1.5 + 0.125,
    );
  });

  it("cuts a long time label in a narrow week tile instead of pushing it out", () => {
    render(
      <EventTile
        event={eventFixture({
          allDay: true,
          start: "2026-11-22",
          end: "2026-11-23",
        })}
        childList={[]}
        format={format}
        size="week-mini"
      />,
    );
    const label = within(tile()).getByText("All day");
    expect(label).toHaveClass("min-w-0", "truncate");
    // The row spans the tile, so truncation has a width to work with.
    expect(label.parentElement?.parentElement).toHaveClass("w-full", "min-w-0");
  });

  it("keeps a shared week tile's title clear of its stripes", () => {
    render(
      <EventTile
        event={eventFixture({ childIds: ["mia", "ben"] })}
        childList={[MIA, BEN]}
        format={format}
        size="week-dense"
      />,
    );
    const line = within(tile()).getByTestId("tile-title")
      .parentElement as HTMLElement;
    expect(line).toHaveClass("ps-2", "text-caption");
    expect(within(tile()).getByTestId("tile-stripes")).toBeInTheDocument();
  });

  it("renders an HTML-looking title as text, never as markup", () => {
    const evil = '<img src=x onerror="alert(1)"><b>hi</b>';
    const { container } = render(
      <EventTile
        event={eventFixture({ title: evil })}
        childList={[]}
        format={format}
      />,
    );
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(container.querySelector("img, b")).toBeNull();
  });

  it("does not let a hostile child colour inject styles or markup", () => {
    const hostile = { ...MIA, color: "red; background:url(x)" };
    render(
      <EventTile
        event={eventFixture({ childIds: ["mia"] })}
        childList={[hostile]}
        format={format}
      />,
    );
    expect(tile().style.getPropertyValue("--child-color")).toBe(
      "var(--color-border)",
    );
    expect(tile().style.background).toBe("var(--color-surface-raised)");
  });

  it("shows a continues hint instead of the original start for a continuing event", () => {
    render(
      <EventTile
        event={eventFixture({ start: "2026-11-21T20:00:00+01:00" })}
        childList={[]}
        format={format}
        continues
      />,
    );
    expect(screen.getByText(en.event.continues)).toBeInTheDocument();
    expect(screen.queryByText("8:00 PM")).toBeNull();
  });
});
