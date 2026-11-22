import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NightMode } from "./night";
import { useNightTheme } from "./useNightTheme";

const BERLIN = "Europe/Berlin";
const NIGHT: NightMode = { enabled: true, start: "19:30", end: "06:30" };
const at = (iso: string): number => Date.parse(iso);

function theme(): string | undefined {
  return document.documentElement.dataset["theme"];
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  document.head.insertAdjacentHTML(
    "beforeend",
    '<meta name="theme-color" content="brand-light">',
  );
  document.documentElement.style.setProperty(
    "--color-surface",
    "night-surface",
  );
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-switching");
  document.documentElement.style.removeProperty("--color-surface");
  document.querySelector('meta[name="theme-color"]')?.remove();
});

describe("useNightTheme", () => {
  it("switches at the configured minute and back, following the clock", () => {
    vi.useFakeTimers({ now: at("2026-11-22T18:28:30Z") }); // 19:28:30 Berlin
    const { result, unmount } = renderHook(() => useNightTheme(NIGHT, BERLIN));
    expect(result.current).toBe(false);
    expect(theme()).toBe("light");
    advance(60_000); // 19:29:30
    expect(theme()).toBe("light");
    advance(60_000); // 19:30:30
    expect(result.current).toBe(true);
    expect(theme()).toBe("night");
    advance(11 * 3_600_000); // 06:30:30
    expect(theme()).toBe("light");
    unmount();
  });

  it("leaves the theme untouched until the config (window and zone) is known", () => {
    vi.useFakeTimers({ now: at("2026-11-22T23:00:00Z") });
    const { result, unmount } = renderHook(() =>
      useNightTheme(undefined, undefined),
    );
    expect(result.current).toBe(false);
    expect(theme()).toBeUndefined();
    unmount();
  });

  it("applies the first known theme without a fade", () => {
    vi.useFakeTimers({ now: at("2026-11-22T23:00:00Z") });
    const { rerender, unmount } = renderHook(
      ({ mode }: { mode: NightMode | undefined }) =>
        useNightTheme(mode, mode === undefined ? undefined : BERLIN),
      { initialProps: { mode: undefined as NightMode | undefined } },
    );
    rerender({ mode: NIGHT });
    expect(theme()).toBe("night");
    expect(document.documentElement.hasAttribute("data-theme-switching")).toBe(
      false,
    );
    unmount();
  });

  it("updates theme-color to the night surface and restores the light value", () => {
    vi.useFakeTimers({ now: at("2026-11-22T18:29:30Z") });
    const meta = (): string | null =>
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute("content") ?? null;
    const { unmount } = renderHook(() => useNightTheme(NIGHT, BERLIN));
    expect(meta()).toBe("brand-light");
    advance(60_000);
    expect(meta()).toBe("night-surface");
    advance(11 * 3_600_000);
    expect(meta()).toBe("brand-light");
    unmount();
  });

  it("fades only on a switch (not on first render) and stops after the transition", () => {
    vi.useFakeTimers({ now: at("2026-11-22T18:29:30Z") });
    const root = document.documentElement;
    const { unmount } = renderHook(() => useNightTheme(NIGHT, BERLIN));
    expect(root.hasAttribute("data-theme-switching")).toBe(false);
    advance(60_000);
    expect(root.hasAttribute("data-theme-switching")).toBe(true);
    advance(900);
    expect(root.hasAttribute("data-theme-switching")).toBe(false);
    unmount();
  });

  it("?night=1 forces night, ?night=0 forces day, regardless of the clock", () => {
    vi.useFakeTimers({ now: at("2026-11-22T11:00:00Z") }); // midday
    window.history.replaceState(null, "", "/?night=1");
    const forcedNight = renderHook(() => useNightTheme(NIGHT, BERLIN));
    expect(forcedNight.result.current).toBe(true);
    expect(theme()).toBe("night");
    forcedNight.unmount();

    vi.setSystemTime(at("2026-11-22T23:00:00Z")); // midnight
    window.history.replaceState(null, "", "/?night=0");
    const forcedDay = renderHook(() => useNightTheme(NIGHT, BERLIN));
    expect(forcedDay.result.current).toBe(false);
    expect(theme()).toBe("light");
    forcedDay.unmount();
  });

  it("does not persist the override: a clean URL follows the clock again", () => {
    vi.useFakeTimers({ now: at("2026-11-22T11:00:00Z") });
    window.history.replaceState(null, "", "/?night=1");
    renderHook(() => useNightTheme(NIGHT, BERLIN)).unmount();
    window.history.replaceState(null, "", "/");
    const { result, unmount } = renderHook(() => useNightTheme(NIGHT, BERLIN));
    expect(result.current).toBe(false);
    unmount();
  });

  it("survives a missing theme-color meta tag", () => {
    document.querySelector('meta[name="theme-color"]')?.remove();
    vi.useFakeTimers({ now: at("2026-11-22T23:00:00Z") });
    const { unmount } = renderHook(() => useNightTheme(NIGHT, BERLIN));
    expect(theme()).toBe("night");
    unmount();
  });
});
