import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyLocale } from "../i18n";
import de from "../i18n/locales/de.json";
import en from "../i18n/locales/en.json";
import { FULLSCREEN_HOLD_MS, FullscreenControl } from "./FullscreenControl";

const toggle = vi.fn(() => Promise.resolve());
let state: { available: boolean; active: boolean };

vi.mock("./useFullscreen", () => ({
  useFullscreen: () => ({ ...state, toggle }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  toggle.mockClear();
  state = { available: true, active: false };
});
afterEach(() => {
  vi.useRealTimers();
  applyLocale("en");
});

describe("FullscreenControl", () => {
  it("renders nothing when fullscreen is not available", () => {
    state = { available: false, active: false };
    const { container } = render(<FullscreenControl />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is labelled in both locales and reflects the state", () => {
    const { rerender } = render(<FullscreenControl />);
    expect(
      screen.getByRole("button", { name: en.fullscreen.enter }),
    ).toBeInTheDocument();
    state = { available: true, active: true };
    rerender(<FullscreenControl />);
    expect(
      screen.getByRole("button", { name: en.fullscreen.exit }),
    ).toBeInTheDocument();
    act(() => {
      applyLocale("de");
    });
    expect(
      screen.getByRole("button", { name: de.fullscreen.exit }),
    ).toBeInTheDocument();
  });

  it("ignores a short tap (children)", () => {
    render(<FullscreenControl />);
    const button = screen.getByTestId("fullscreen-control");
    fireEvent.pointerDown(button);
    vi.advanceTimersByTime(FULLSCREEN_HOLD_MS - 1);
    fireEvent.pointerUp(button);
    fireEvent.click(button, { detail: 1 });
    vi.advanceTimersByTime(FULLSCREEN_HOLD_MS * 2);
    expect(toggle).not.toHaveBeenCalled();
  });

  it("toggles on pointer-up after a long press", () => {
    render(<FullscreenControl />);
    const button = screen.getByTestId("fullscreen-control");
    fireEvent.pointerDown(button);
    vi.advanceTimersByTime(FULLSCREEN_HOLD_MS);
    expect(toggle).not.toHaveBeenCalled(); // needs the pointer-up gesture
    fireEvent.pointerUp(button);
    fireEvent.click(button, { detail: 1 });
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("cancels the hold when the pointer leaves or is cancelled", () => {
    render(<FullscreenControl />);
    const button = screen.getByTestId("fullscreen-control");
    fireEvent.pointerDown(button);
    vi.advanceTimersByTime(FULLSCREEN_HOLD_MS - 100);
    fireEvent.pointerLeave(button);
    vi.advanceTimersByTime(500);
    fireEvent.pointerUp(button);
    fireEvent.pointerDown(button);
    vi.advanceTimersByTime(FULLSCREEN_HOLD_MS);
    fireEvent.pointerCancel(button);
    fireEvent.pointerUp(button);
    expect(toggle).not.toHaveBeenCalled();
  });

  it("works at once from the keyboard", async () => {
    vi.useRealTimers();
    render(<FullscreenControl />);
    screen.getByTestId("fullscreen-control").focus();
    await userEvent.keyboard("{Enter}");
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("clears the hold timer on unmount", () => {
    const { unmount } = render(<FullscreenControl />);
    fireEvent.pointerDown(screen.getByTestId("fullscreen-control"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
