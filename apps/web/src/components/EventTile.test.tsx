import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FormatContext } from "../i18n/format";
import en from "../i18n/locales/en.json";
import { EventTile } from "./EventTile";
import { BEN, eventFixture, MIA } from "./fixtures.test-utils";

const format: FormatContext = { locale: "en", timeZone: "Europe/Berlin" };

describe("EventTile", () => {
  it("shows icon, title and formatted time in the configured zone", () => {
    render(
      <EventTile
        event={eventFixture()}
        childList={[MIA, BEN]}
        format={format}
      />,
    );
    expect(screen.getByRole("article", { name: "Swimming" })).toBeVisible();
    // Decorative icon: the title is announced once, via the article name.
    expect(screen.queryByRole("img", { name: "Swimming" })).toBeNull();
    expect(screen.getByText("🏊")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("2:30 PM")).toBeInTheDocument();
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

  it("renders all-day events with a label and never formats the date key", () => {
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
    expect(screen.getByRole("article")).toHaveAttribute("data-all-day", "true");
  });

  it("shows an avatar dot per known child and skips unknown ids", () => {
    render(
      <EventTile
        event={eventFixture({ childIds: ["mia", "ben", "ghost"] })}
        childList={[MIA, BEN]}
        format={format}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Mia" })).toHaveTextContent("🦊");
    expect(screen.getByRole("img", { name: "Ben" })).toBeInTheDocument();
    // Colour edge from the first child (token name -> design token variable).
    expect(
      screen.getByRole("article").style.getPropertyValue("--child-color"),
    ).toBe("var(--color-child-1)");
  });

  it("has a neutral edge and no dots for everyone", () => {
    render(
      <EventTile event={eventFixture()} childList={[MIA]} format={format} />,
    );
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(
      screen.getByRole("article").style.getPropertyValue("--child-color"),
    ).toBe("var(--color-border)");
  });

  it("marks past and current tiles for assistive tech and styling", () => {
    const { rerender } = render(
      <EventTile
        event={eventFixture()}
        childList={[]}
        format={format}
        status="past"
      />,
    );
    expect(screen.getByRole("article")).toHaveAttribute("data-status", "past");
    expect(screen.getByText(en.event.status.past)).toBeInTheDocument();
    rerender(
      <EventTile
        event={eventFixture()}
        childList={[]}
        format={format}
        status="current"
      />,
    );
    expect(screen.getByRole("article")).toHaveClass("ring-4");
    expect(screen.getByText(en.event.status.current)).toBeInTheDocument();
  });

  it("clamps long titles to two lines and meets the touch-target size", () => {
    render(
      <EventTile
        event={eventFixture({ title: "Very ".repeat(60) })}
        childList={[]}
        format={format}
      />,
    );
    expect(screen.getByRole("article")).toHaveClass("min-h-touch");
    expect(screen.getByText(/^Very/)).toHaveClass("line-clamp-2");
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
    expect(
      screen.getByRole("article").style.getPropertyValue("--child-color"),
    ).toBe("var(--color-border)");
  });
});
