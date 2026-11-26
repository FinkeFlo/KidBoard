import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "../data/queryKeys";
import de from "../i18n/locales/de.json";
import en from "../i18n/locales/en.json";
import { type EditorHarness, renderEditor } from "./editor.test-utils";
import { editorConfig, NOW_ISO, SESSION } from "./fixtures.test-utils";

/*
 * The editor's weather section (T-56) against the in-memory fake parent API: what is
 * set, saving a town or "off", going back to the configuration, the result as text, the
 * refetch of the board's config and weather, and that the town never reaches the
 * (persisted) query cache.
 */

const PLACE = "TESTONLY-Weatherplace";
const user = userEvent.setup();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(Date.parse(NOW_ISO));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function section(): Promise<HTMLElement> {
  const found = await screen.findByTestId("weather-section");
  await within(found).findByTestId("weather-save");
  return found;
}

function weatherSwitch(scope: HTMLElement): HTMLElement {
  return within(scope).getByRole("switch", { name: en.editor.weather.switch });
}

function statusOf(scope: HTMLElement): HTMLElement {
  return within(scope).getByTestId("weather-status");
}

function weatherRequests(h: EditorHarness): string[] {
  return h.requests.filter((r) => r.includes("/api/parent/weather"));
}

describe("Editor: weather section (T-56)", () => {
  it("is labelled, says it is not set up yet and is reachable from the jump bar", async () => {
    renderEditor();
    const scope = await section();
    expect(
      screen.getByRole("heading", { name: en.editor.weather.title }),
    ).toBeInTheDocument();
    expect(scope).toHaveAccessibleName(en.editor.weather.title);
    expect(weatherSwitch(scope)).toHaveAttribute("aria-checked", "false");
    expect(statusOf(scope)).toHaveTextContent(en.editor.weather.status.off);
    expect(statusOf(scope)).toHaveTextContent(en.editor.weather.source.none);
    expect(within(scope).queryByTestId("weather-reset")).toBeNull();
    expect(within(scope).queryByLabelText(en.editor.weather.place)).toBeNull();
    const bar = screen.getByRole("navigation", {
      name: en.editor.jump.label,
    });
    await user.click(
      within(bar).getByRole("button", { name: en.editor.jump.weather }),
    );
    expect(
      screen.getByRole("heading", { name: en.editor.weather.title }),
    ).toHaveFocus();
  });

  it("turns the weather on with a town: PUT, found, board config and weather refetched", async () => {
    const h = renderEditor();
    const scope = await section();
    h.queryClient.setQueryData(queryKeys.weather(), { stale: false });
    await user.click(weatherSwitch(scope));
    expect(weatherSwitch(scope)).toHaveAttribute("aria-checked", "true");
    await user.type(
      within(scope).getByLabelText(en.editor.weather.place),
      `  ${PLACE} `,
    );
    const country = within(scope).getByLabelText(en.editor.weather.country);
    await user.type(country, "at");
    expect(country).toHaveValue("AT");
    expect(country).toHaveAccessibleDescription(en.editor.weather.countryHint);
    await user.click(
      within(scope).getByRole("radio", {
        name: en.editor.weather.fahrenheit,
      }),
    );
    const configFetches = h.requests.filter(
      (r) => r === "GET /api/config",
    ).length;
    await user.click(within(scope).getByTestId("weather-save"));
    await waitFor(() => {
      expect(statusOf(scope)).toHaveTextContent(en.editor.weather.status.ok);
    });
    expect(statusOf(scope)).toHaveTextContent(en.editor.weather.source.editor);
    expect(h.editor.writes).toEqual([
      {
        method: "PUT",
        path: "/api/parent/weather",
        query: "",
        body: { place: PLACE, country: "AT", unit: "fahrenheit" },
      },
    ]);
    expect(
      h.headers[h.requests.indexOf("PUT /api/parent/weather")]?.session,
    ).toBe(SESSION);
    // The board's config was refetched after the save, and its forecast marked outdated.
    const putAt = h.requests.indexOf("PUT /api/parent/weather");
    expect(h.requests.slice(putAt)).toContain("GET /api/config");
    expect(
      h.requests.filter((r) => r === "GET /api/config").length,
    ).toBeGreaterThan(configFetches);
    expect(
      h.queryClient.getQueryState(queryKeys.weather())?.isInvalidated,
    ).toBe(true);
    expect(
      within(scope).getByRole("button", { name: en.editor.weather.reset }),
    ).toBeInTheDocument();
    // The town is kept in the section only, never in the (persisted) query cache.
    expect(
      JSON.stringify(
        h.queryClient
          .getQueryCache()
          .getAll()
          .map((q) => [q.queryKey, q.state.data]),
      ),
    ).not.toContain(PLACE);
  });

  it.each([
    ["place_unknown", en.editor.weather.status.place_unknown],
    ["unavailable", en.editor.weather.status.unavailable],
  ] as const)("reports %s as text after a save", async (status, text) => {
    const h = renderEditor();
    h.editor.setWeatherStatus(status);
    const scope = await section();
    await user.click(weatherSwitch(scope));
    await user.type(
      within(scope).getByLabelText(en.editor.weather.place),
      PLACE,
    );
    await user.click(within(scope).getByTestId("weather-save"));
    await waitFor(() => {
      expect(statusOf(scope)).toHaveTextContent(text);
    });
    expect(statusOf(scope)).toHaveAttribute("data-status", status);
    expect(h.editor.weatherSetting()).toEqual({
      place: PLACE,
      unit: "celsius",
    });
  });

  it("refuses an empty town or a bad country without a request", async () => {
    const h = renderEditor();
    const scope = await section();
    await user.click(weatherSwitch(scope));
    const place = within(scope).getByLabelText(en.editor.weather.place);
    await user.type(place, "   ");
    await user.click(within(scope).getByTestId("weather-save"));
    expect(place).toHaveFocus();
    expect(place).toHaveAttribute("aria-invalid", "true");
    expect(place).toHaveAccessibleDescription(
      en.editor.weather.fieldError.place,
    );
    await user.type(place, PLACE);
    expect(place).not.toHaveAttribute("aria-invalid");
    const country = within(scope).getByLabelText(en.editor.weather.country);
    await user.type(country, "d");
    await user.click(within(scope).getByTestId("weather-save"));
    expect(country).toHaveFocus();
    expect(country).toHaveAccessibleDescription(
      `${en.editor.weather.countryHint} ${en.editor.weather.fieldError.country}`,
    );
    await user.type(country, "1");
    expect(country).toHaveValue("D1");
    await user.click(within(scope).getByTestId("weather-save"));
    expect(country).toHaveAttribute("aria-invalid", "true");
    expect(h.editor.writes).toEqual([]);
  });

  it("turns the weather off over the config's block and goes back to it", async () => {
    const h = renderEditor({
      configWeather: { place: "TESTONLY-Configplace", unit: "celsius" },
    });
    const scope = await section();
    expect(weatherSwitch(scope)).toHaveAttribute("aria-checked", "true");
    expect(within(scope).getByLabelText(en.editor.weather.place)).toHaveValue(
      "TESTONLY-Configplace",
    );
    expect(statusOf(scope)).toHaveTextContent(en.editor.weather.source.config);
    expect(within(scope).queryByTestId("weather-reset")).toBeNull();

    await user.click(weatherSwitch(scope));
    await user.click(within(scope).getByTestId("weather-save"));
    await waitFor(() => {
      expect(statusOf(scope)).toHaveTextContent(en.editor.weather.status.off);
    });
    expect(h.editor.weatherSetting()).toEqual({ off: true });
    expect(statusOf(scope)).toHaveTextContent(en.editor.weather.source.editor);

    await user.click(
      within(scope).getByRole("button", { name: en.editor.weather.reset }),
    );
    await waitFor(() => {
      expect(statusOf(scope)).toHaveTextContent(
        en.editor.weather.source.config,
      );
    });
    expect(h.editor.weatherSetting()).toBeNull();
    expect(weatherSwitch(scope)).toHaveAttribute("aria-checked", "true");
    expect(within(scope).queryByTestId("weather-reset")).toBeNull();
    expect(weatherRequests(h)).toEqual([
      "GET /api/parent/weather",
      "PUT /api/parent/weather",
      "DELETE /api/parent/weather",
    ]);
  });

  it("explains coordinates from the configuration (never shows them)", async () => {
    renderEditor({ configWeather: { unit: "fahrenheit", coordinates: true } });
    const scope = await section();
    expect(scope).toHaveTextContent(en.editor.weather.coordinates);
    expect(within(scope).getByLabelText(en.editor.weather.place)).toHaveValue(
      "",
    );
    expect(
      within(scope).getByRole("radio", { name: en.editor.weather.fahrenheit }),
    ).toBeChecked();
  });

  it("a locked session offers the PIN pad; after the PIN the section loads again with the new session", async () => {
    const h = renderEditor();
    const scope = await section();
    await user.click(weatherSwitch(scope));
    await user.type(
      within(scope).getByLabelText(en.editor.weather.place),
      PLACE,
    );
    h.sessions.delete(SESSION);
    await user.click(within(scope).getByTestId("weather-save"));
    const alert = await within(scope).findByRole("alert");
    expect(alert).toHaveTextContent(en.editor.weather.error.locked);
    expect(alert).toHaveTextContent("KB-LOCK");
    expect(alert).not.toHaveTextContent(PLACE);
    await user.click(
      within(alert).getByRole("button", {
        name: en.editor.action.unlockAgain,
      }),
    );
    expect(
      screen.getByRole("dialog", { name: en.parent.pin.title }),
    ).toBeInTheDocument();
    // While the PIN pad is open the draft is still there; nothing was stored.
    expect(within(scope).getByLabelText(en.editor.weather.place)).toHaveValue(
      PLACE,
    );
    expect(h.editor.weatherSetting()).toBeNull();

    // A new session starts the section clean: it reads the stored setting again.
    const renewed = "v1.0.TESTONLY-second-session";
    h.sessions.add(renewed);
    act(() => {
      h.unlockAs(renewed);
    });
    const reloaded = await section();
    expect(within(reloaded).queryByRole("alert")).toBeNull();
    expect(weatherSwitch(reloaded)).toHaveAttribute("aria-checked", "false");
    const gets = h.requests
      .map((request, index) => ({ request, headers: h.headers[index] }))
      .filter(({ request }) => request === "GET /api/parent/weather");
    expect(gets.map(({ headers }) => headers?.session)).toEqual([
      SESSION,
      renewed,
    ]);
  });

  it("a failed load says so calmly and loads again on retry", async () => {
    const h = renderEditor({
      setup: (editor) => {
        editor.failNext(
          "GET",
          {
            status: 503,
            json: { error: "storage_unavailable", message: "x" },
          },
          "/api/parent/weather",
        );
      },
    });
    const scope = await screen.findByTestId("weather-section");
    const alert = await within(scope).findByRole("alert");
    expect(alert).toHaveTextContent(en.editor.weather.error.storage);
    expect(within(scope).queryByRole("switch")).toBeNull();
    await user.click(
      within(alert).getByRole("button", { name: en.editor.action.retry }),
    );
    expect(await within(scope).findByRole("switch")).toBeInTheDocument();
    expect(within(scope).queryByRole("alert")).toBeNull();
    expect(weatherRequests(h)).toEqual([
      "GET /api/parent/weather",
      "GET /api/parent/weather",
    ]);
  });

  it("offline, a save keeps the form and says nothing was changed", async () => {
    const h = renderEditor();
    const scope = await section();
    await user.click(weatherSwitch(scope));
    act(() => {
      h.network.offline = true;
    });
    await user.click(within(scope).getByTestId("weather-save"));
    // The draft is invalid first (no town): no request.
    expect(h.editor.writes).toEqual([]);
    await user.type(
      within(scope).getByLabelText(en.editor.weather.place),
      PLACE,
    );
    await user.click(within(scope).getByTestId("weather-save"));
    const alert = await within(scope).findByRole("alert");
    expect(alert).toHaveTextContent(en.editor.weather.error.offline);
    expect(weatherSwitch(scope)).toHaveAttribute("aria-checked", "true");
  });

  it("speaks German", async () => {
    const { default: i18n } = await import("i18next");
    try {
      // The data layer applies the config's locale.
      renderEditor({ config: editorConfig({ locale: "de" }) });
      const scope = await screen.findByTestId("weather-section");
      await within(scope).findByRole("switch", {
        name: de.editor.weather.switch,
      });
      expect(
        screen.getByRole("heading", { name: de.editor.weather.title }),
      ).toBeInTheDocument();
      expect(de.editor.weather.title).toBe("Wetter");
      expect(statusOf(scope)).toHaveTextContent(de.editor.weather.status.off);
      expect(
        within(scope).getByRole("button", { name: de.editor.weather.save }),
      ).toBeInTheDocument();
    } finally {
      await i18n.changeLanguage("en");
    }
  });

  it("every control is at least the parent touch size", async () => {
    renderEditor({
      configWeather: { place: "TESTONLY-Configplace", unit: "celsius" },
    });
    const scope = await section();
    for (const control of [
      weatherSwitch(scope),
      within(scope).getByLabelText(en.editor.weather.place),
      within(scope).getByLabelText(en.editor.weather.country),
      within(scope).getByTestId("weather-save"),
    ]) {
      expect(control.className).toContain("min-h-touch-parent");
    }
    for (const radio of within(scope).getAllByRole("radio")) {
      expect(radio.closest("label")?.className).toContain("min-h-touch-parent");
    }
  });
});
