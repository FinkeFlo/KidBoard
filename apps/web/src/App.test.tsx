import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import { PLACEHOLDER_TEXT } from "./placeholder-text";

describe("App", () => {
  it("renders the placeholder heading", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { level: 1, name: "KidBoard" }),
    ).toBeInTheDocument();
    expect(screen.getByText(PLACEHOLDER_TEXT.placeholderPage)).toBeVisible();
  });
});
