import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./day/DayView", () => ({
  DayView: (): React.JSX.Element => <main>day view</main>,
}));

describe("App", () => {
  it("renders the day view", () => {
    render(<App />);
    expect(screen.getByRole("main")).toHaveTextContent("day view");
  });
});
