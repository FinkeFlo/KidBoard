import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import en from "./i18n/locales/en.json";

describe("App", () => {
  it("renders the placeholder heading", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { level: 1, name: "KidBoard" }),
    ).toBeInTheDocument();
    expect(screen.getByText(en.app.placeholderPage)).toBeVisible();
  });
});
