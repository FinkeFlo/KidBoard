import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Emoji } from "./Emoji";

describe("Emoji", () => {
  it("is an image named by its label", () => {
    render(<Emoji emoji="🏊" label="Swimming" />);
    const img = screen.getByRole("img", { name: "Swimming" });
    expect(img).toHaveTextContent("🏊");
    expect(img).toHaveClass("font-emoji");
  });

  it.each([undefined, "", "  "])(
    "is decorative (hidden) without a usable label: %j",
    (label) => {
      render(<Emoji emoji="🏊" label={label} />);
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(screen.getByText("🏊")).toHaveAttribute("aria-hidden", "true");
    },
  );
});
