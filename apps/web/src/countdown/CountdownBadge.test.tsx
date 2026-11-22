import type { CalendarEvent } from "@kidboard/shared";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { eventFixture } from "../components/fixtures.test-utils";
import { applyLocale } from "../i18n";
import type { Countdown } from "./buildCountdown";
import {
  CountdownBadge,
  type CountdownVariant,
  MAX_INDIVIDUAL_MOONS,
  moonRows,
} from "./CountdownBadge";

const MOON = "🌙";

function party(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return eventFixture({
    id: "party",
    title: "Birthday party",
    icon: "🎂",
    countdown: true,
    ...overrides,
  });
}

function renderBadge(
  nights: number,
  events: CalendarEvent[] = [party()],
  variant: CountdownVariant = "full",
): HTMLElement {
  const countdown: Countdown = { date: "2026-11-25", nights, events };
  render(<CountdownBadge countdown={countdown} variant={variant} />);
  return screen.getByRole("region", { name: /How many sleeps|Wie oft/ });
}

/** Visible moon symbols (each one an emoji element). */
function moonCount(badge: HTMLElement): number {
  return [...badge.querySelectorAll(".font-emoji")].filter(
    (el) => el.textContent === MOON,
  ).length;
}

afterEach(() => {
  act(() => {
    applyLocale("en");
  });
});

describe("moonRows", () => {
  it("splits nights into rows of a week", () => {
    expect(moonRows(0)).toEqual([]);
    expect(moonRows(1)).toEqual([1]);
    expect(moonRows(7)).toEqual([7]);
    expect(moonRows(10)).toEqual([7, 3]);
    expect(moonRows(14)).toEqual([7, 7]);
  });
});

describe("CountdownBadge", () => {
  it("shows one moon per night up to 14, with a pluralized label", () => {
    const one = renderBadge(1);
    expect(moonCount(one)).toBe(1);
    expect(one).toHaveTextContent("1 more sleep until Birthday party");
    expect(one).toHaveAttribute("data-nights", "1");
    cleanup();

    const three = renderBadge(3);
    expect(moonCount(three)).toBe(3);
    expect(three).toHaveTextContent("3 more sleeps until Birthday party");
    cleanup();

    const max = renderBadge(MAX_INDIVIDUAL_MOONS);
    expect(moonCount(max)).toBe(14);
    expect(max.querySelector('[data-testid="countdown-grouped"]')).toBeNull();
  });

  it("groups beyond 14 nights: one moon and the number", () => {
    const badge = renderBadge(15);
    expect(moonCount(badge)).toBe(1);
    expect(screen.getByTestId("countdown-grouped")).toHaveTextContent("×15");
    expect(badge).toHaveTextContent("15 more sleeps until Birthday party");
    cleanup();
    renderBadge(30, [party()], "compact");
    expect(screen.getByTestId("countdown-grouped")).toHaveTextContent("×30");
  });

  it("shows the today state without moons", () => {
    const badge = renderBadge(0);
    expect(moonCount(badge)).toBe(0);
    expect(badge).toHaveTextContent("Today!");
    expect(badge).toHaveTextContent("Today is the day: Birthday party!");
  });

  it("names several events of the same day as a localized list, at most 3 icons", () => {
    const events = [
      party({ id: "a", title: "Advent", icon: "🎄" }),
      party({ id: "b", title: "Birthday", icon: "🎂" }),
      party({ id: "c", title: "Cinema", icon: "🎉" }),
      party({ id: "d", title: "Doughnuts", icon: "🎁" }),
    ];
    const badge = renderBadge(2, events);
    expect(badge).toHaveTextContent(
      "2 more sleeps until Advent, Birthday, Cinema, and Doughnuts",
    );
    const icons = badge.querySelector('[aria-hidden="true"]');
    expect(icons?.textContent).toBe("🎄🎂🎉");
  });

  it("hides the visuals from assistive tech; only the label is read", () => {
    const badge = renderBadge(5);
    const label = badge.querySelector("p.sr-only");
    expect(label).toHaveTextContent("5 more sleeps until Birthday party");
    for (const child of badge.children) {
      if (child !== label) {
        expect(child).toHaveAttribute("aria-hidden", "true");
      }
    }
    // Plain text: markup in a title is rendered as text, never as HTML.
    cleanup();
    const evil = renderBadge(2, [party({ title: "<b>x</b>" })]);
    expect(evil.querySelector("b")).toBeNull();
    expect(evil).toHaveTextContent("2 more sleeps until <b>x</b>");
  });

  it("uses German plural rules and list formatting", () => {
    act(() => {
      applyLocale("de");
    });
    const one = renderBadge(1);
    expect(one).toHaveAccessibleName("Wie oft noch schlafen?");
    expect(one).toHaveTextContent("Noch einmal schlafen bis Birthday party");
    cleanup();
    const many = renderBadge(4, [
      party({ id: "a", title: "Nikolaus" }),
      party({ id: "b", title: "Kino" }),
    ]);
    expect(many).toHaveTextContent("Noch 4-mal schlafen bis Nikolaus und Kino");
    cleanup();
    expect(renderBadge(0)).toHaveTextContent(
      "Heute ist es so weit: Birthday party!",
    );
  });

  it("is smaller in the compact variant", () => {
    const full = renderBadge(2, [party()], "full");
    expect(full).toHaveAttribute("data-variant", "full");
    expect(full.querySelector(".text-heading")).not.toBeNull();
    cleanup();
    const compact = renderBadge(2, [party()], "compact");
    expect(compact).toHaveAttribute("data-variant", "compact");
    expect(compact.querySelector(".text-heading")).toBeNull();
    expect(compact.querySelector(".text-title")).not.toBeNull();
  });
});
