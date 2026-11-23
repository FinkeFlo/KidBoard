import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiClient } from "../data/apiClient";
import { ApiClientContext } from "../data/apiContext";
import {
  createFakeFetch,
  type FakeFetch,
  TEST_TOKEN,
} from "../data/testing.test-utils";
import { applyLocale } from "../i18n";
import de from "../i18n/locales/de.json";
import en from "../i18n/locales/en.json";
import { fakeGate, renderWithGate } from "./gate.test-utils";
import { IdleWarning } from "./IdleWarning";
import { PARENT_HOLD_MS, ParentEntry } from "./ParentEntry";
import {
  PARENT_IDLE_LOCK_MS,
  PARENT_IDLE_WARNING_MS,
  useParentGate,
} from "./parentGate";
import { ParentGateProvider } from "./ParentGateProvider";
import { PinPad } from "./PinPad";

const T0 = Date.parse("2026-11-22T11:00:00Z");

let fake: FakeFetch;

/** The pencil and, while open, the PIN pad, with the real gate provider. */
function Gate(): React.JSX.Element {
  const { stage } = useParentGate();
  return (
    <>
      <ParentEntry />
      {stage === "pin" && <PinPad />}
    </>
  );
}

function renderGate(): void {
  const api = createApiClient({ fetch: fake.fetch, token: TEST_TOKEN });
  render(
    <ApiClientContext value={api}>
      <ParentGateProvider>
        <Gate />
      </ParentGateProvider>
    </ApiClientContext>,
  );
}

function pencil(): HTMLElement {
  return screen.getByRole("button", { name: en.parent.entry });
}

function holdKey(key: string): void {
  const button = pencil();
  button.focus();
  fireEvent.keyDown(button, { key });
  act(() => {
    vi.advanceTimersByTime(PARENT_HOLD_MS);
  });
  fireEvent.keyUp(document.activeElement ?? document.body, { key });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  fake = createFakeFetch();
});
afterEach(() => {
  vi.useRealTimers();
  applyLocale("en");
});

describe("parent gate flow (provider, pencil, PIN pad)", () => {
  it.each([
    ["Enter", "Enter"],
    ["Space", " "],
  ])(
    "opens with a held %s and Escape returns the focus to the pencil",
    (_, key) => {
      renderGate();
      holdKey(key);
      const pad = screen.getByTestId("pin-pad");
      expect(pad).toHaveFocus();
      fireEvent.keyDown(pad, { key: "Escape" });
      expect(screen.queryByTestId("pin-pad")).toBeNull();
      expect(pencil()).toHaveFocus();
    },
  );

  it("after a wrong PIN typed on the keyboard, keeps typing and Escape still closes", async () => {
    fake.setReplies("/api/parent/unlock", {
      status: 403,
      body: { error: "wrong_pin", attemptsLeft: 3 },
    });
    renderGate();
    holdKey("Enter");
    for (const digit of "000000") {
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: digit,
      });
    }
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Enter",
      });
      await vi.runOnlyPendingTimersAsync();
    });
    expect(screen.getByTestId("pin-feedback")).toHaveTextContent(
      "Wrong PIN. 3 more tries.",
    );
    expect(screen.getByTestId("pin-dots")).toHaveAttribute("data-count", "0");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "4" });
    expect(screen.getByTestId("pin-dots")).toHaveAttribute("data-count", "1");
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    expect(screen.queryByTestId("pin-pad")).toBeNull();
    expect(pencil()).toHaveFocus();
  });

  it("shows the idle warning on the open pad and Keep editing restarts the time", () => {
    renderGate();
    holdKey("Enter");
    expect(screen.queryByTestId("idle-warning")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(PARENT_IDLE_LOCK_MS - PARENT_IDLE_WARNING_MS);
    });
    const warning = screen.getByTestId("idle-warning");
    expect(warning).toHaveTextContent(en.parent.idle.title);
    expect(screen.getByTestId("idle-warning-region")).toHaveAttribute(
      "aria-live",
      "assertive",
    );
    fireEvent.click(screen.getByRole("button", { name: en.parent.idle.stay }));
    expect(screen.queryByTestId("idle-warning")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(PARENT_IDLE_LOCK_MS - 1000);
    });
    expect(screen.getByTestId("pin-pad")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByTestId("pin-pad")).toBeNull();
  });
});

describe("IdleWarning", () => {
  it("renders only the empty live region without a warning", () => {
    renderWithGate(<IdleWarning />, fakeGate({ stage: "editor" }));
    expect(screen.getByTestId("idle-warning-region")).toBeEmptyDOMElement();
  });

  it("is a calm banner with a large Keep editing button, translated", () => {
    const gate = fakeGate({ stage: "editor", idleWarning: true });
    renderWithGate(<IdleWarning />, gate);
    expect(screen.getByTestId("idle-warning")).toHaveTextContent(
      "Without input the parent area locks in 30 seconds.",
    );
    expect(screen.getByTestId("idle-warning").innerHTML).not.toMatch(
      /animate-/,
    );
    const button = screen.getByRole("button", { name: en.parent.idle.stay });
    expect(button).toHaveClass("min-h-touch");
    fireEvent.click(button);
    expect(gate.stayActive).toHaveBeenCalledTimes(1);
    act(() => {
      applyLocale("de");
    });
    expect(screen.getByTestId("idle-warning")).toHaveTextContent(
      de.parent.idle.title,
    );
    expect(
      screen.getByRole("button", { name: de.parent.idle.stay }),
    ).toBeInTheDocument();
  });
});
