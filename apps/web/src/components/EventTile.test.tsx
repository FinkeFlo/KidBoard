import type { Child } from "@kidboard/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FormatContext } from "../i18n/format";
import en from "../i18n/locales/en.json";
import tokensCss from "../styles/tokens.css?raw";
import { EventTile, TILE_HEIGHT_REM } from "./EventTile";
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
    expect(screen.getByText("Swimming")).toHaveClass("truncate");
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

  it("reserves room for the corner badges only when there are badges", () => {
    const title = (): HTMLElement => screen.getByText("Swimming");
    const { unmount } = render(
      <EventTile
        event={eventFixture({ title: "Swimming", childIds: ["mia"] })}
        childList={[MIA, BEN]}
        format={format}
      />,
    );
    expect(title()).toHaveClass("truncate", "pe-5");
    unmount();
    render(
      <EventTile
        event={eventFixture({ title: "Swimming", childIds: [] })}
        childList={[MIA, BEN]}
        format={format}
      />,
    );
    expect(title()).toHaveClass("truncate");
    expect(title()).not.toHaveClass("pe-5");
  });

  it("two children: split tint, no edge, two overlapping badges", () => {
    render(
      <EventTile
        event={eventFixture({ childIds: ["mia", "ben"] })}
        childList={[MIA, BEN]}
        format={format}
      />,
    );
    expect(tile()).toHaveAttribute("data-tint", "split");
    expect(tile().style.background).toContain("linear-gradient");
    expect(tile().className).not.toMatch(/inset-ring/u);
    const shown = [...badges().children];
    expect(shown.map((badge) => badge.textContent)).toEqual(["🦊", "🐻"]);
    expect(shown[1]).toHaveClass("-ms-3");
    expect(tile()).toHaveAccessibleName("Swimming, 2:30 PM, For Mia and Ben");
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
    expect(tile()).toHaveClass("ring-4", "ring-accent");
    expect(tile()).toHaveAccessibleName(
      `Swimming, 2:30 PM, For everyone, ${en.event.status.current}`,
    );

    rerender(
      <EventTile event={eventFixture()} childList={[]} format={format} next />,
    );
    expect(tile()).toHaveAttribute("data-next", "true");
    expect(tile()).toHaveClass("ring-now");
    expect(tile()).toHaveAccessibleName(
      `Swimming, 2:30 PM, For everyone, ${en.event.status.next}`,
    );
  });

  it("keeps today's emoji at 3.5rem (large) and 3rem (dense)", () => {
    for (const size of ["large", "dense"] as const) {
      const emojiClass = size === "large" ? "text-[3.5rem]" : "text-[3rem]";
      const { unmount } = render(
        <EventTile
          event={eventFixture()}
          childList={[]}
          format={format}
          size={size}
        />,
      );
      expect(screen.getByText("🏊")).toHaveClass(emojiClass);
      expect(tile()).toHaveAttribute("data-size", size);
      unmount();
    }
  });

  it("uses the tile height tokens it reports for the column capacity", () => {
    const token = (name: string): number =>
      parseFloat(
        new RegExp(`${name}:\\s*([\\d.]+)rem`).exec(tokensCss)?.[1] ?? "NaN",
      );
    expect(TILE_HEIGHT_REM.large).toBe(token("--spacing-tile"));
    expect(TILE_HEIGHT_REM.compact).toBe(token("--spacing-tile-compact"));
    // Dense sizes are shorter, but still hold the 3rem emoji line box (today) inside
    // the 4px edge on both sides (0.25rem each at the 16px baseline).
    expect(TILE_HEIGHT_REM.dense).toBeLessThan(TILE_HEIGHT_REM.large);
    expect(TILE_HEIGHT_REM.dense).toBeGreaterThanOrEqual(3 + 2 * 0.25);
    expect(TILE_HEIGHT_REM["compact-dense"]).toBeLessThan(
      TILE_HEIGHT_REM.compact,
    );
  });

  it("week sizes stack emoji over time, hide the visible title and keep the name", () => {
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
    expect(screen.queryByText("Swimming")).toBeNull();
    expect(tile()).toHaveAccessibleName("Swimming, 2:30 PM, For Mia");
    expect(within(tile()).getByText("🌞")).toBeInTheDocument();
    expect(TILE_HEIGHT_REM["week-dense"]).toBeLessThan(TILE_HEIGHT_REM.week);
    // The stacked emoji and time row fit the dense height (emoji 2.25rem + meta 1rem).
    expect(TILE_HEIGHT_REM["week-dense"]).toBeGreaterThanOrEqual(2.25 + 1.3);
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
