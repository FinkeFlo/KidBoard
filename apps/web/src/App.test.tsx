import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("./board/Board", () => ({
  Board: (): React.JSX.Element => <main>board</main>,
}));

describe("App", () => {
  it("renders the board", () => {
    render(<App />);
    expect(screen.getByRole("main")).toHaveTextContent("board");
  });
});
