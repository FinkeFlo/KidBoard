import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../i18n/locales/en.json";
import { AppErrorBoundary } from "./AppErrorBoundary";

let shouldThrow = true;

function Bomb(): React.JSX.Element {
  if (shouldThrow) {
    throw new Error("boom <b>not html</b>");
  }
  return <p>recovered</p>;
}

describe("AppErrorBoundary", () => {
  beforeEach(() => {
    shouldThrow = true;
    // React logs caught errors; keep the test output clean.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when nothing throws", () => {
    shouldThrow = false;
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );
    expect(screen.getByText("recovered")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a friendly fallback with the error as plain text", () => {
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: en.error.title }),
    ).toBeInTheDocument();
    expect(screen.getByText("boom <b>not html</b>")).toBeInTheDocument();
  });

  it("retries rendering when the button is pressed", async () => {
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );
    shouldThrow = false;
    await userEvent.click(screen.getByRole("button", { name: en.error.retry }));
    expect(screen.getByText("recovered")).toBeInTheDocument();
  });
});
