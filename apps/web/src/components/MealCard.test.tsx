import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import en from "../i18n/locales/en.json";
import { mealFixture } from "./fixtures.test-utils";
import { MealCard } from "./MealCard";

describe("MealCard", () => {
  it("shows icon, slot label and title", () => {
    render(<MealCard meal={mealFixture({ slot: "breakfast" })} />);
    expect(screen.getByRole("article", { name: "Pasta" })).toHaveClass(
      "min-h-touch",
    );
    // The icon is decorative: the visible title already names the card.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("🍝")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(en.meal.slot.breakfast)).toBeInTheDocument();
  });

  it("labels the unspecified slot", () => {
    render(<MealCard meal={mealFixture({ slot: "unspecified" })} />);
    expect(screen.getByText(en.meal.slot.unspecified)).toBeInTheDocument();
  });

  it("renders an HTML-looking title as text and clamps it", () => {
    const evil = "<script>alert(1)</script><i>x</i>";
    const { container } = render(
      <MealCard meal={mealFixture({ title: evil })} />,
    );
    const title = screen.getByText(evil);
    expect(title).toHaveClass("line-clamp-2");
    expect(container.querySelector("script, i")).toBeNull();
  });
});
