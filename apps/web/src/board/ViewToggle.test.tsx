import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { applyLocale } from "../i18n";
import { ViewToggle } from "./ViewToggle";

describe("ViewToggle", () => {
  it("shows a sun and a calendar picture with localized accessible names", () => {
    render(<ViewToggle view="day" onChange={vi.fn()} />);
    const day = screen.getByRole("button", { name: "Day view" });
    const week = screen.getByRole("button", { name: "Week view" });
    expect(day).toHaveTextContent("☀️");
    expect(week).toHaveTextContent("🗓️");
    expect(day).toHaveAttribute("aria-pressed", "true");
    expect(week).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("group", { name: "View" })).toBeInTheDocument();
  });

  it("has German names", () => {
    applyLocale("de");
    render(<ViewToggle view="week" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Wochenansicht" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Tagesansicht" }),
    ).toBeInTheDocument();
    applyLocale("en");
  });

  it("reports the chosen view and has no visible text besides the pictures", () => {
    const onChange = vi.fn();
    render(<ViewToggle view="day" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Week view" }));
    expect(onChange).toHaveBeenCalledWith("week");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "☀️",
      "🗓️",
    ]);
  });

  it("makes both buttons at least 64 px via the touch token", () => {
    render(<ViewToggle view="day" onChange={vi.fn()} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toContain("min-h-touch");
      expect(button.className).toContain("min-w-touch");
    }
  });
});
