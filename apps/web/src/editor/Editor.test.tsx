import { addCalendarDays, type PublicConfig } from "@kidboard/shared";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BEN, eventFixture, MIA } from "../components/fixtures.test-utils";
import { TEST_TOKEN } from "../data/testing.test-utils";
import en from "../i18n/locales/en.json";
import { type EditorHarness, renderEditor } from "./editor.test-utils";
import {
  DENTIST,
  editorConfig,
  NOW_ISO,
  PIZZA,
  SESSION,
  SWIM,
  TODAY,
} from "./fixtures.test-utils";

/*
 * The whole editor (T-45) against the in-memory fake editor API: every flow goes
 * through the real ApiClient (session header, query, body) and the list is read back
 * from the fake, so the tests check what the worker would store. Only `Date` is faked
 * (Sunday 2026-11-22 12:00 in Berlin), advancing with real time.
 */

const user = userEvent.setup();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(Date.parse(NOW_ISO));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function home(): Promise<HTMLElement> {
  const list = await screen.findByTestId("entry-list");
  return list;
}

function form(name: string): HTMLElement {
  return screen.getByRole("form", { name });
}

async function save(): Promise<void> {
  await user.click(screen.getByRole("button", { name: en.editor.action.save }));
}

function writes(h: EditorHarness): string[] {
  return h.editor.writes.map(
    (w) => `${w.method} ${w.path.replace(/[0-9a-f-]{36}/u, ":id")}?${w.query}`,
  );
}

describe("Editor: home", () => {
  it("lists the next 14 days with the session and shows the empty state", async () => {
    const h = renderEditor();
    expect(await screen.findByTestId("entry-list-empty")).toHaveTextContent(
      en.editor.list.empty,
    );
    expect(h.requests).toContain(
      `GET /api/parent/entries?from=${TODAY}&days=14`,
    );
    expect(h.requests).toContain("GET /api/parent/templates");
    expect(
      screen.getByRole("heading", { name: en.editor.list.title }),
    ).toBeInTheDocument();
    for (const name of [
      en.editor.templates.quick.swimmingWeekly,
      en.editor.templates.quick.birthday,
      en.editor.templates.quick.dentist,
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("groups by day (today first) with meals per slot and the series mark", async () => {
    renderEditor({
      setup: (editor) => {
        editor.seed(DENTIST);
        editor.seed(SWIM);
        editor.seed(PIZZA);
        editor.seed({
          ...PIZZA,
          icon: "🥣",
          title: "Muesli",
          slot: "breakfast",
        });
      },
    });
    await home();
    const days = screen.getAllByTestId("editor-day");
    expect(days.map((d) => d.dataset["date"])).toEqual([
      TODAY,
      "2026-11-23",
      "2026-11-29",
    ]);
    const first = days[0];
    if (first === undefined) throw new Error("no day");
    expect(within(first).getByRole("heading", { level: 4 })).toHaveTextContent(
      /^Today · Sunday, /u,
    );
    const meals = within(first).getByRole("list", {
      name: en.editor.list.meals,
    });
    expect(
      within(meals)
        .getAllByTestId("editor-item")
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringContaining("Muesli"),
      expect.stringContaining("Pizza"),
    ]);
    // Swimming repeats every Sunday: marked on each occurrence, single entries are not.
    expect(within(first).getAllByTestId("series-mark")).toHaveLength(1);
    expect(
      within(first).getByRole("img", { name: en.editor.list.everyWeek }),
    ).toBeInTheDocument();
    expect(
      within(days[1] as HTMLElement).queryByTestId("series-mark"),
    ).toBeNull();
  });

  it("shows Google entries read-only with 'use as template'", async () => {
    renderEditor({
      google: () => ({
        events: [
          eventFixture({
            id: "g-piano",
            title: "Piano",
            icon: "🎹",
            childIds: ["ben"],
            start: "2026-11-23T16:30:00+01:00",
            end: "2026-11-23T17:15:00+01:00",
          }),
        ],
        meals: [],
      }),
    });
    await home();
    const row = screen.getByTestId("editor-item");
    expect(row).toHaveAttribute("data-origin", "google");
    expect(within(row).getByTestId("google-note")).toHaveTextContent(
      en.editor.list.fromGoogle,
    );
    expect(within(row).queryByTestId("edit-entry")).toBeNull();
    await user.click(
      within(row).getByRole("button", { name: "Use Piano as template" }),
    );
    const newForm = form(en.editor.form.newTitle);
    expect(within(newForm).getByLabelText(en.editor.form.name)).toHaveValue(
      "Piano",
    );
    expect(within(newForm).getByLabelText(en.editor.form.start)).toHaveValue(
      "16:30",
    );
    expect(
      within(newForm).getByRole("checkbox", { name: "Ben" }),
    ).toBeChecked();
  });

  it("names unresolved entries with a fix and a delete path", async () => {
    let fakeConfig: PublicConfig = editorConfig({
      children: [
        MIA,
        BEN,
        { id: "lea", name: "Lea", color: "child-3", avatar: "🦉" },
      ],
    });
    const h = renderEditor({
      fakeConfig: () => fakeConfig,
      setup: (editor) => {
        editor.seed({ ...DENTIST, childIds: ["lea"], title: "Lea dentist" });
        fakeConfig = editorConfig();
      },
    });
    const section = await screen.findByTestId("unresolved");
    expect(section).toHaveTextContent(en.editor.list.unresolvedChild);
    await user.click(
      within(section).getByRole("button", { name: "Delete Lea dentist" }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "Delete “Lea dentist”?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: en.editor.action.delete }),
    );
    await waitFor(() => {
      expect(screen.queryByTestId("unresolved")).toBeNull();
    });
    expect(writes(h)).toEqual([
      "DELETE /api/parent/entries/:id?scope=series&revision=1",
    ]);
  });

  it("fixing an unresolved entry opens the form with the unknown child removable", async () => {
    let fakeConfig: PublicConfig = editorConfig({
      children: [
        MIA,
        BEN,
        { id: "lea", name: "Lea", color: "child-3", avatar: "🦉" },
      ],
    });
    renderEditor({
      fakeConfig: () => fakeConfig,
      setup: (editor) => {
        editor.seed({ ...DENTIST, childIds: ["lea"], title: "Lea dentist" });
        fakeConfig = editorConfig();
      },
    });
    const section = await screen.findByTestId("unresolved");
    await user.click(
      within(section).getByRole("button", { name: "Change Lea dentist" }),
    );
    const edit = form(en.editor.form.editTitle);
    const unknown = within(edit).getByRole("checkbox", {
      name: "No longer set up (lea)",
    });
    await save();
    expect(
      within(edit).getByRole("group", { name: en.editor.form.who }),
    ).toHaveAccessibleDescription(en.editor.problem.children);
    await user.click(unknown);
    await save();
    expect(await screen.findByRole("status")).toHaveTextContent(
      en.editor.toast.saved,
    );
  });

  it("shows a calm notice when the worker has no storage", async () => {
    renderEditor({
      setup: (editor) => {
        editor.setStorageUnavailable(true);
      },
    });
    const notice = await screen.findByTestId("storage-unavailable");
    expect(notice).toHaveAttribute("role", "alert");
    expect(notice).toHaveTextContent("KB-503");
  });

  it("renders XSS-looking titles as plain text", async () => {
    const evil = '<img src=x onerror="alert(1)">';
    renderEditor({
      setup: (editor) => {
        editor.seed({ ...DENTIST, title: evil });
      },
    });
    await home();
    expect(screen.getAllByText(evil, { exact: false }).length).toBeGreaterThan(
      0,
    );
    expect(document.querySelector("img[src='x']")).toBeNull();
    await user.click(screen.getByRole("button", { name: `Change ${evil}` }));
    expect(screen.getByLabelText(en.editor.form.name)).toHaveValue(evil);
    expect(document.querySelector("img[src='x']")).toBeNull();
  });
});

describe("Editor: new entries", () => {
  it("weekly swimming for Mia: quick pick, one tap, save – board refreshed", async () => {
    const h = renderEditor();
    const invalidate = vi.spyOn(h.queryClient, "invalidateQueries");
    await home();
    await user.click(
      screen.getByRole("button", {
        name: en.editor.templates.quick.swimmingWeekly,
      }),
    );
    const newForm = form(en.editor.form.newTitle);
    expect(within(newForm).getByLabelText(en.editor.form.name)).toHaveValue(
      "Swimming",
    );
    expect(
      within(newForm).getByRole("radio", { name: en.editor.form.weekly }),
    ).toBeChecked();
    await user.click(within(newForm).getByRole("checkbox", { name: "Mia" }));
    await save();
    expect(await screen.findByRole("status")).toHaveTextContent(
      en.editor.toast.saved,
    );
    expect(h.editor.entries().map((e) => e.data)).toEqual([
      expect.objectContaining({
        kind: "event",
        childIds: ["mia"],
        icon: "🏊",
        title: "Swimming",
        date: TODAY,
        startTime: "15:00",
        endTime: "16:00",
        repeat: { weekly: { weekdays: [7], interval: 1 } },
      }),
    ]);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["kidboard", "agenda"],
    });
    // Back home, the list was read again and shows the series.
    await waitFor(() => {
      expect(screen.getAllByTestId("series-mark").length).toBeGreaterThan(0);
    });
  });

  it("asks for a picture first and keeps a typed name when the picture changes", async () => {
    const h = renderEditor();
    await home();
    await user.click(
      screen.getByRole("button", { name: en.editor.home.newEntry }),
    );
    await save();
    expect(
      screen.getByRole("group", { name: en.editor.form.what }),
    ).toHaveAccessibleDescription(en.editor.problem.icon);
    expect(h.editor.writes).toEqual([]);
    await user.click(
      screen.getByRole("radio", { name: en.editor.group.appointments }),
    );
    await user.click(screen.getByRole("radio", { name: /Dentist/u }));
    const name = screen.getByLabelText(en.editor.form.name);
    expect(name).toHaveValue("Dentist");
    await user.click(screen.getByRole("radio", { name: /Doctor/u }));
    expect(name).toHaveValue("Doctor");
    await user.clear(name);
    await user.type(name, "Dr. Brown");
    await user.click(screen.getByRole("radio", { name: /Dentist/u }));
    expect(name).toHaveValue("Dr. Brown");
    expect(screen.getByTestId("entry-preview")).toHaveTextContent("Dr. Brown");
  });

  it("a countdown picture switches the countdown on for good", async () => {
    renderEditor();
    await home();
    await user.click(
      screen.getByRole("button", { name: en.editor.templates.quick.birthday }),
    );
    const toggle = screen.getByRole("checkbox", {
      name: en.editor.form.countdownToggle,
    });
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();
    expect(
      screen.getByRole("group", { name: en.editor.form.countdown }),
    ).toHaveAccessibleDescription(en.editor.form.countdownForced);
  });

  it("keeps the form when offline and saves once the network is back", async () => {
    const h = renderEditor();
    await home();
    await user.click(
      screen.getByRole("button", { name: en.editor.templates.quick.dentist }),
    );
    const name = screen.getByLabelText(en.editor.form.name);
    await user.clear(name);
    await user.type(name, "Check-up");
    h.network.offline = true;
    await save();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(en.editor.error.offline);
    expect(alert).toHaveTextContent("KB-NET");
    expect(screen.getByLabelText(en.editor.form.name)).toHaveValue("Check-up");
    h.network.offline = false;
    await save();
    expect(await screen.findByRole("status")).toHaveTextContent(
      en.editor.toast.saved,
    );
    expect(h.editor.entries()[0]?.data.title).toBe("Check-up");
  });

  it("a full editor (limit_reached) is a calm notice, nothing is lost", async () => {
    const h = renderEditor({ maxEntries: 0 });
    await home();
    await user.click(
      screen.getByRole("button", { name: en.editor.templates.quick.dentist }),
    );
    await save();
    expect(await screen.findByRole("alert")).toHaveTextContent("KB-LIMIT");
    expect(form(en.editor.form.newTitle)).toBeInTheDocument();
    expect(h.editor.entries()).toEqual([]);
  });

  it("a locked session opens the PIN pad above the form; after the PIN the form saves with the new session", async () => {
    const h = renderEditor();
    await home();
    await user.click(
      screen.getByRole("button", { name: en.editor.templates.quick.dentist }),
    );
    const name = screen.getByLabelText(en.editor.form.name);
    await user.clear(name);
    await user.type(name, "Check-up");
    // The session ran out on the worker (403 parent_locked, never 401).
    h.sessions.delete(SESSION);
    await save();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(en.editor.error.locked);
    await user.click(
      within(alert).getByRole("button", {
        name: en.editor.action.unlockAgain,
      }),
    );
    expect(
      screen.getByRole("dialog", { name: en.parent.pin.title }),
    ).toBeInTheDocument();
    expect(form(en.editor.form.newTitle)).toBeInTheDocument();
    // A 403 is never the board's 401: the gate was not locked by the editor.
    expect(h.gate.lock).not.toHaveBeenCalled();

    const renewed = "v1.0.TESTONLY-second-session";
    h.sessions.add(renewed);
    act(() => {
      h.unlockAs(renewed);
    });
    expect(screen.queryByRole("dialog", { name: en.parent.pin.title })).toBe(
      null,
    );
    expect(screen.getByLabelText(en.editor.form.name)).toHaveValue("Check-up");
    await save();
    expect(await screen.findByRole("status")).toHaveTextContent(
      en.editor.toast.saved,
    );
    const posts = h.requests
      .map((request, index) => ({ request, headers: h.headers[index] }))
      .filter(({ request }) => request === "POST /api/parent/entries");
    expect(posts.map(({ headers }) => headers?.session)).toEqual([
      SESSION,
      renewed,
    ]);
    expect(h.editor.entries().map((entry) => entry.data.title)).toEqual([
      "Check-up",
    ]);
  });

  it("a 401 from an editor call is a calm notice and keeps the board's access token", async () => {
    const h = renderEditor();
    await home();
    await waitFor(() => {
      expect(h.queryClient.getQueryData(["kidboard", "config"])).toBeDefined();
    });
    await user.click(
      screen.getByRole("button", { name: en.editor.templates.quick.dentist }),
    );
    h.editor.failNext("POST", {
      status: 401,
      json: { error: "unauthorized", message: "" },
    });
    await save();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(en.editor.error.unauthorized);
    expect(alert).toHaveTextContent("KB-401");
    expect(h.onUnauthorized).not.toHaveBeenCalled();
    expect(h.queryClient.getQueryData(["kidboard", "config"])).toBeDefined();
    expect(form(en.editor.form.newTitle)).toBeInTheDocument();
    await save();
    await screen.findByRole("status");
    expect(h.headers.at(-1)?.authorization).toBe(`Bearer ${TEST_TOKEN}`);
    expect(h.onUnauthorized).not.toHaveBeenCalled();
  });

  it("Cancel returns home without writing", async () => {
    const h = renderEditor();
    await home();
    await user.click(
      screen.getByRole("button", { name: en.editor.home.newEntry }),
    );
    await user.click(
      screen.getByRole("button", { name: en.editor.action.cancel }),
    );
    expect(await screen.findByTestId("editor-home")).toBeInTheDocument();
    expect(h.editor.writes).toEqual([]);
  });
});

describe("Editor: templates", () => {
  it("the 'Again' row offers stored entries and pre-fills a new one from them", async () => {
    const h = renderEditor({
      setup: (editor) => {
        editor.seed(SWIM);
      },
    });
    await home();
    const row = screen.getByTestId("templates-row");
    const [suggestion] = within(row).getAllByTestId("template");
    expect(suggestion).toHaveTextContent("Swimming");
    await user.click(suggestion as HTMLElement);
    const newForm = form(en.editor.form.newTitle);
    expect(within(newForm).getByLabelText(en.editor.form.name)).toHaveValue(
      "Swimming",
    );
    expect(
      within(newForm).getByRole("checkbox", { name: "Mia" }),
    ).toBeChecked();
    expect(
      within(newForm).getByRole("checkbox", { name: /Swimsuit/u }),
    ).toBeChecked();
    // A suggestion is a new single entry, not an edit of the old one.
    expect(
      within(newForm).getByRole("radio", { name: en.editor.form.once }),
    ).toBeChecked();
    expect(h.editor.writes).toEqual([]);
  });

  it("the meal form switches slot and day and takes an own dish", async () => {
    const h = renderEditor();
    await home();
    await user.click(
      screen.getByRole("button", { name: en.editor.home.newMeal }),
    );
    const mealForm = form(en.editor.meal.newTitle);
    await user.click(
      within(mealForm).getByRole("radio", { name: en.editor.meal.slots.lunch }),
    );
    await user.click(within(mealForm).getByRole("radio", { name: "Tomorrow" }));
    await user.type(
      within(mealForm).getByRole("textbox", { name: en.editor.form.ownEmoji }),
      "🫕",
    );
    await user.type(
      within(mealForm).getByLabelText(en.editor.form.name),
      "Fondue",
    );
    expect(screen.getByTestId("meal-preview")).toHaveTextContent("Fondue");
    await save();
    await screen.findByRole("status");
    expect(h.editor.entries()[0]?.data).toMatchObject({
      icon: "🫕",
      title: "Fondue",
      slot: "lunch",
      date: "2026-11-23",
    });
  });
});

describe("Editor: change and delete", () => {
  it("a series asks 'only on <date>' or 'every week' and sends scope, date and revision", async () => {
    const h = renderEditor({
      setup: (editor) => {
        editor.seed(SWIM);
      },
    });
    await home();
    const [today] = screen.getAllByRole("button", { name: "Change Swimming" });
    if (today === undefined) throw new Error("no row");
    await user.click(today);
    const edit = form(en.editor.form.editTitle);
    await user.click(within(edit).getByRole("radio", { name: "45 min" }));
    await save();
    const dialog = screen.getByRole("alertdialog", {
      name: "Change “Swimming”",
    });
    expect(dialog).toHaveAccessibleDescription(en.editor.scope.text);
    await user.click(
      within(dialog).getByRole("button", { name: "Only on Sun, Nov 22" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      en.editor.toast.saved,
    );
    expect(writes(h)).toEqual([
      "PATCH /api/parent/entries/:id?scope=one&date=2026-11-22",
    ]);
    expect(h.editor.writes[0]?.body).toMatchObject({
      revision: 1,
      entry: { startTime: "15:00", endTime: "15:45", repeat: "none" },
    });
    const stored = h.editor.entries()[0];
    expect(stored?.data.endTime).toBe("16:00");
    expect(Object.keys(stored?.overrides ?? {})).toEqual([TODAY]);
  });

  it("'every week' keeps the series start when another day was opened", async () => {
    const h = renderEditor({
      setup: (editor) => {
        editor.seed(SWIM);
      },
    });
    await home();
    const rows = screen.getAllByRole("button", { name: "Change Swimming" });
    await user.click(rows[1] as HTMLElement);
    const edit = form(en.editor.form.editTitle);
    expect(within(edit).getByLabelText(en.editor.form.otherDay)).toHaveValue(
      "2026-11-29",
    );
    await user.click(within(edit).getByRole("checkbox", { name: "Ben" }));
    await save();
    await user.click(
      screen.getByRole("button", { name: en.editor.scope.series }),
    );
    await screen.findByRole("status");
    expect(writes(h)).toEqual(["PATCH /api/parent/entries/:id?scope=series"]);
    expect(h.editor.entries()[0]?.data).toMatchObject({
      date: TODAY,
      childIds: ["mia", "ben"],
      repeat: { weekly: { weekdays: [7], interval: 1 } },
    });
  });

  it("a single entry saves without asking; a conflict keeps the form and overwrites on purpose", async () => {
    const h = renderEditor({
      setup: (editor) => {
        editor.seed(DENTIST);
      },
    });
    await home();
    await user.click(screen.getByRole("button", { name: "Change Dentist" }));
    const name = screen.getByLabelText(en.editor.form.name);
    await user.clear(name);
    await user.type(name, "Dentist Ben");
    h.editor.failNext("PATCH", {
      status: 409,
      json: { error: "conflict", message: "", revision: 4 },
    });
    await save();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("KB-409");
    expect(screen.getByLabelText(en.editor.form.name)).toHaveValue(
      "Dentist Ben",
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await save();
    await screen.findByRole("status");
    const bodies = h.editor.writes.map(
      (w) => (w.body as { revision: number }).revision,
    );
    expect(bodies).toEqual([1, 4]);
  });

  it("a delete that meets a newer version says so and deletes on the second try", async () => {
    const h = renderEditor({
      setup: (editor) => {
        editor.seed(DENTIST);
      },
    });
    await home();
    await user.click(screen.getByRole("button", { name: "Change Dentist" }));
    // Someone else changes the entry meanwhile (revision 1 → 2).
    const id = h.editor.entries()[0]?.id ?? "";
    h.editor.handle({
      method: "PATCH",
      path: `/api/parent/entries/${id}`,
      search: "scope=series",
      body: JSON.stringify({
        revision: 1,
        entry: { ...DENTIST, title: "Dentist 2" },
      }),
      session: SESSION,
    });
    await user.click(
      screen.getByRole("button", { name: en.editor.action.delete }),
    );
    await user.click(screen.getByTestId("confirm-delete"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(en.editor.error.conflictDelete);
    expect(alert).toHaveTextContent("KB-409");
    expect(alert).not.toHaveTextContent(en.editor.error.conflict);
    await user.click(
      screen.getByRole("button", { name: en.editor.action.delete }),
    );
    await user.click(screen.getByTestId("confirm-delete"));
    expect(await screen.findByRole("status")).toHaveTextContent(
      en.editor.toast.deleted,
    );
    expect(h.editor.entries()).toEqual([]);
  });

  it("delete asks once and names the entry; a series offers one day or all", async () => {
    const h = renderEditor({
      setup: (editor) => {
        editor.seed(SWIM);
      },
    });
    await home();
    const [first] = screen.getAllByRole("button", { name: "Change Swimming" });
    await user.click(first as HTMLElement);
    await user.click(
      screen.getByRole("button", { name: en.editor.action.delete }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "Delete “Swimming”?",
    });
    expect(dialog).toHaveAccessibleDescription(en.editor.delete.seriesText);
    // Keep closes the question, nothing is deleted.
    await user.click(
      within(dialog).getByRole("button", { name: en.editor.delete.keep }),
    );
    expect(h.editor.writes).toEqual([]);
    await user.click(
      screen.getByRole("button", { name: en.editor.action.delete }),
    );
    await user.click(
      screen.getByRole("button", { name: "Only on Sun, Nov 22" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      en.editor.toast.deleted,
    );
    expect(writes(h)).toEqual([
      "DELETE /api/parent/entries/:id?scope=one&date=2026-11-22&revision=1",
    ]);
    expect(h.editor.entries()[0]?.exdates).toEqual([TODAY]);
    await waitFor(() => {
      expect(
        screen.getAllByTestId("editor-day").map((day) => day.dataset["date"]),
      ).toEqual(["2026-11-29"]);
    });
  });
});

describe("Editor: series days changed on their own", () => {
  const MOVED = { ...SWIM, date: "2026-12-01", repeat: "none" as const };
  const LATER = {
    ...SWIM,
    date: "2026-11-29",
    startTime: "16:00",
    endTime: "17:00",
    repeat: "none" as const,
  };

  it("'every week' from a moved day keeps the rule's weekdays and updates that day", async () => {
    const h = renderEditor({
      setup: (editor) => {
        editor.seed(SWIM, { overrides: { "2026-11-29": MOVED } });
      },
    });
    await home();
    expect(
      screen.getAllByTestId("editor-day").map((day) => day.dataset["date"]),
    ).toEqual([TODAY, "2026-12-01"]);
    const rows = screen.getAllByRole("button", { name: "Change Swimming" });
    await user.click(rows[1] as HTMLElement);
    const edit = form(en.editor.form.editTitle);
    expect(within(edit).getByLabelText(en.editor.form.otherDay)).toHaveValue(
      "2026-12-01",
    );
    // The rule stays "every Sunday": the moved day's Tuesday is not added.
    const days = within(edit).getByRole("group", {
      name: en.editor.form.weekdays,
    });
    expect(
      within(days).getByRole("checkbox", { name: "Sunday" }),
    ).toBeChecked();
    expect(
      within(days).getByRole("checkbox", { name: "Sunday" }),
    ).toBeDisabled();
    expect(
      within(days).getByRole("checkbox", { name: "Tuesday" }),
    ).not.toBeChecked();
    const name = within(edit).getByLabelText(en.editor.form.name);
    await user.clear(name);
    await user.type(name, "Swim club");
    await save();
    const dialog = screen.getByRole("alertdialog", {
      name: "Change “Swim club”",
    });
    expect(dialog).toHaveAccessibleDescription(
      `${en.editor.scope.text} ${en.editor.scope.overrideText}`,
    );
    await user.click(
      within(dialog).getByRole("button", { name: en.editor.scope.series }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      en.editor.toast.saved,
    );
    expect(writes(h)).toEqual([
      "PATCH /api/parent/entries/:id?scope=series",
      "PATCH /api/parent/entries/:id?scope=one&date=2026-11-29",
    ]);
    const stored = h.editor.entries()[0];
    expect(stored?.data).toMatchObject({
      date: TODAY,
      title: "Swim club",
      repeat: { weekly: { weekdays: [7], interval: 1 } },
    });
    expect(stored?.revision).toBe(3);
    expect(stored?.overrides["2026-11-29"]).toMatchObject({
      date: "2026-12-01",
      title: "Swim club",
    });
    // Still once a week: today and the moved day, no new Tuesday.
    await waitFor(() => {
      expect(
        screen
          .getAllByTestId("editor-item")
          .map((row) => row.textContent.includes("Swim club")),
      ).toEqual([true, true]);
    });
    expect(
      screen.getAllByTestId("editor-day").map((day) => day.dataset["date"]),
    ).toEqual([TODAY, "2026-12-01"]);
  });

  it("'every week' from a day with other times gives that day the saved entry too", async () => {
    const h = renderEditor({
      setup: (editor) => {
        editor.seed(SWIM, { overrides: { "2026-11-29": LATER } });
      },
    });
    await home();
    const rows = screen.getAllByRole("button", { name: "Change Swimming" });
    await user.click(rows[1] as HTMLElement);
    const edit = form(en.editor.form.editTitle);
    expect(within(edit).getByLabelText(en.editor.form.start)).toHaveValue(
      "16:00",
    );
    await user.click(within(edit).getByRole("checkbox", { name: "Ben" }));
    await save();
    await user.click(
      screen.getByRole("button", { name: en.editor.scope.series }),
    );
    await screen.findByRole("status");
    const stored = h.editor.entries()[0];
    expect(stored?.data).toMatchObject({
      date: TODAY,
      childIds: ["mia", "ben"],
      startTime: "16:00",
    });
    // The day no longer keeps its old version: it shows what was saved.
    expect(stored?.overrides["2026-11-29"]).toMatchObject({
      date: "2026-11-29",
      childIds: ["mia", "ben"],
      startTime: "16:00",
    });
  });

  it("'only on' a changed day replaces just that day's change", async () => {
    const h = renderEditor({
      setup: (editor) => {
        editor.seed(SWIM, { overrides: { "2026-11-29": MOVED } });
      },
    });
    await home();
    const rows = screen.getAllByRole("button", { name: "Change Swimming" });
    await user.click(rows[1] as HTMLElement);
    const name = screen.getByLabelText(en.editor.form.name);
    await user.clear(name);
    await user.type(name, "Swim gala");
    await save();
    await user.click(
      screen.getByRole("button", { name: "Only on Sun, Nov 29" }),
    );
    await screen.findByRole("status");
    expect(writes(h)).toEqual([
      "PATCH /api/parent/entries/:id?scope=one&date=2026-11-29",
    ]);
    const stored = h.editor.entries()[0];
    expect(stored?.data.title).toBe("Swimming");
    expect(stored?.overrides["2026-11-29"]).toMatchObject({
      date: "2026-12-01",
      title: "Swim gala",
    });
  });
});

describe("Editor: meals", () => {
  it("saves a dish for tonight", async () => {
    const h = renderEditor();
    await home();
    await user.click(
      screen.getByRole("button", { name: en.editor.home.newMeal }),
    );
    const mealForm = form(en.editor.meal.newTitle);
    expect(
      within(mealForm).getByRole("radio", {
        name: en.editor.meal.slots.dinner,
      }),
    ).toBeChecked();
    await user.click(within(mealForm).getByRole("radio", { name: /Pizza/u }));
    expect(within(mealForm).getByLabelText(en.editor.form.name)).toHaveValue(
      "Pizza",
    );
    await save();
    await screen.findByRole("status");
    expect(h.editor.entries()[0]?.data).toMatchObject({
      kind: "meal",
      icon: "🍕",
      title: "Pizza",
      date: TODAY,
      slot: "dinner",
      repeat: "none",
    });
  });

  it("repeats last week's meals in one confirmed step", async () => {
    const h = renderEditor({
      setup: (editor) => {
        editor.seed({ ...PIZZA, date: "2026-11-20" });
        editor.seed({
          ...PIZZA,
          icon: "🍝",
          title: "Spaghetti",
          date: "2026-11-18",
        });
      },
    });
    await home();
    await user.click(
      screen.getByRole("button", { name: en.editor.home.newMeal }),
    );
    await user.click(
      screen.getByRole("button", { name: en.editor.copy.action }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Copy 2 meals?",
    });
    expect(dialog).toHaveAccessibleDescription(
      "They are added from Today to Sat, Nov 28.",
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: en.editor.copy.confirmAction,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "2 meals copied.",
    );
    expect(
      h.editor
        .entries()
        .map((e) => `${e.data.date} ${e.data.title}`)
        .sort(),
    ).toEqual([
      "2026-11-18 Spaghetti",
      "2026-11-20 Pizza",
      "2026-11-25 Spaghetti",
      "2026-11-27 Pizza",
    ]);
  });

  it("names a partial copy calmly; nothing to copy says so", async () => {
    const h = renderEditor({
      maxEntries: 3,
      setup: (editor) => {
        editor.seed({ ...PIZZA, date: "2026-11-20" });
        editor.seed({
          ...PIZZA,
          icon: "🍝",
          title: "Spaghetti",
          date: "2026-11-18",
        });
      },
    });
    await home();
    await user.click(
      screen.getByRole("button", { name: en.editor.home.newMeal }),
    );
    await user.click(
      screen.getByRole("button", { name: en.editor.copy.action }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: en.editor.copy.confirmAction,
      }),
    );
    const partial = await screen.findByTestId("copy-partial");
    expect(partial).toHaveTextContent("1 of 2 meals copied.");
    expect(within(partial).getByRole("alert")).toHaveTextContent("KB-LIMIT");
    expect(h.editor.entries()).toHaveLength(3);
    // The form stays open with the notice.
    expect(form(en.editor.meal.newTitle)).toBeInTheDocument();
  });

  it("says when there is nothing to copy", async () => {
    renderEditor();
    await home();
    await user.click(
      screen.getByRole("button", { name: en.editor.home.newMeal }),
    );
    await user.click(
      screen.getByRole("button", { name: en.editor.copy.action }),
    );
    expect(await screen.findByText(en.editor.copy.nothing)).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("Editor: backup", () => {
  it("downloads the export as a JSON file", async () => {
    const created: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return "blob:kidboard-test";
    });
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe(`kidboard-entries-${TODAY}.json`);
        expect(this.href).toBe("blob:kidboard-test");
      });
    renderEditor({
      setup: (editor) => {
        editor.seed(DENTIST);
      },
    });
    await home();
    await user.click(
      screen.getByRole("button", { name: en.editor.data.export }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      en.editor.toast.exported,
    );
    expect(click).toHaveBeenCalledTimes(1);
    const text = await created[0]?.text();
    const doc = JSON.parse(text ?? "{}") as {
      format?: string;
      entries?: { data: { title: string } }[];
    };
    expect(doc.format).toBe("kidboard-entries");
    expect(doc.entries?.map((entry) => entry.data.title)).toEqual(["Dentist"]);
    vi.unstubAllGlobals();
  });

  it("imports a backup after a confirmation that names the mode", async () => {
    const h = renderEditor({
      setup: (editor) => {
        editor.seed(DENTIST);
      },
    });
    await home();
    const backup = JSON.stringify({
      format: "kidboard-entries",
      version: 1,
      exportedAt: "2026-11-20T10:00:00.000Z",
      entries: [
        {
          id: "00000000-0000-4000-8000-0000000000aa",
          revision: 2,
          kind: "event",
          data: SWIM,
          exdates: [],
          overrides: {},
          createdAt: "2026-11-01T10:00:00.000Z",
          updatedAt: "2026-11-01T10:00:00.000Z",
        },
      ],
    });
    const file = new File([backup], "backup.json", {
      type: "application/json",
    });
    await user.upload(screen.getByLabelText(en.editor.data.choose), file);
    expect(await screen.findByTestId("import-choice")).toHaveTextContent(
      "backup.json: 1 entry",
    );
    await user.click(
      screen.getByRole("radio", { name: en.editor.data.replace }),
    );
    await user.click(
      screen.getByRole("button", { name: en.editor.data.import }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "Replace everything with 1 entry?",
    });
    expect(dialog).toHaveAccessibleDescription(
      en.editor.data.confirm.replaceText,
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: en.editor.data.confirm.replaceAction,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "1 entry imported.",
    );
    expect(writes(h)).toEqual(["POST /api/parent/import?mode=replace"]);
    expect(h.editor.entries().map((e) => e.data.title)).toEqual(["Swimming"]);
    await waitFor(() => {
      expect(screen.queryByTestId("import-choice")).toBeNull();
    });
  });

  it("refuses a file that is no backup", async () => {
    const h = renderEditor();
    await home();
    await user.upload(
      screen.getByLabelText(en.editor.data.choose),
      new File(["{}"], "notes.json", { type: "application/json" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      en.editor.data.notBackup,
    );
    expect(
      screen.queryByRole("button", { name: en.editor.data.import }),
    ).toBeNull();
    expect(h.editor.writes).toEqual([]);
  });
});

describe("Editor: the list covers today and 13 more days", () => {
  it("does not show entries from day 15 on", async () => {
    renderEditor({
      setup: (editor) => {
        editor.seed({ ...DENTIST, date: addCalendarDays(TODAY, 13) });
        editor.seed({
          ...DENTIST,
          title: "Later",
          date: addCalendarDays(TODAY, 14),
        });
      },
    });
    const list = await home();
    expect(within(list).getAllByTestId("editor-item")).toHaveLength(1);
    expect(within(list).queryByText("Later")).toBeNull();
  });
});

describe("Editor: phone feed (T-46)", () => {
  const FEED = "/api/feed.ics?token=TESTONLY-not-a-secret-feed-0123456789";
  const ABSOLUTE = `${window.location.origin}${FEED}`;

  function stubClipboard(writeText: (text: string) => Promise<void>): void {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("shows the absolute link in the Data section, requested with the session", async () => {
    const h = renderEditor({ feedUrl: FEED });
    await home();
    const block = await screen.findByTestId("phone-feed");
    expect(
      within(screen.getByTestId("data-section")).getByTestId("phone-feed"),
    ).toBe(block);
    expect(
      within(block).getByRole("heading", { name: en.editor.feed.title }),
    ).toBeInTheDocument();
    expect(within(block).getByText(en.editor.feed.hint)).toBeInTheDocument();
    expect(
      within(block).getByRole("textbox", { name: en.editor.feed.link }),
    ).toHaveValue(ABSOLUTE);
    const at = h.requests.indexOf("GET /api/parent/feed");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(h.headers[at]?.session).toBe(SESSION);
  });

  it("is hidden when the feed is off", async () => {
    const h = renderEditor();
    await home();
    await waitFor(() => {
      expect(h.requests).toContain("GET /api/parent/feed");
    });
    expect(screen.queryByTestId("phone-feed")).toBeNull();
    expect(
      screen.queryByRole("button", { name: en.editor.feed.copy }),
    ).toBeNull();
  });

  it("is hidden when the request fails", async () => {
    const h = renderEditor({
      feedUrl: FEED,
      setup: (editor) => {
        editor.failNext(
          "GET",
          { status: 500, json: { error: "x" } },
          "/api/parent/feed",
        );
      },
    });
    await home();
    await waitFor(() => {
      expect(h.requests).toContain("GET /api/parent/feed");
    });
    expect(screen.queryByTestId("phone-feed")).toBeNull();
  });

  it("copies the absolute URL and confirms it in a polite live region", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    stubClipboard(writeText);
    renderEditor({ feedUrl: FEED });
    await home();
    const status = await screen.findByTestId("feed-status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toBeEmptyDOMElement();
    await user.click(
      await screen.findByRole("button", { name: en.editor.feed.copy }),
    );
    expect(writeText).toHaveBeenCalledExactlyOnceWith(ABSOLUTE);
    expect(status).toHaveTextContent(en.editor.feed.copied);
  });

  it("selects the link when the Clipboard API is unavailable or refuses", async () => {
    stubClipboard(() =>
      Promise.reject(new DOMException("no", "NotAllowedError")),
    );
    renderEditor({ feedUrl: FEED });
    await home();
    await user.click(
      await screen.findByRole("button", { name: en.editor.feed.copy }),
    );
    const field = screen.getByRole("textbox", { name: en.editor.feed.link });
    expect(screen.getByTestId("feed-status")).toHaveTextContent(
      en.editor.feed.select,
    );
    expect(field).toHaveFocus();
    expect(window.getSelection()?.toString() ?? "").toBe("");
    expect((field as HTMLInputElement).selectionEnd).toBe(ABSOLUTE.length);
    // No clipboard at all: the same fallback.
    Reflect.deleteProperty(navigator, "clipboard");
    await user.click(screen.getByRole("button", { name: en.editor.feed.copy }));
    expect(screen.getByTestId("feed-status")).toHaveTextContent(
      en.editor.feed.select,
    );
  });

  it("never reaches the query cache (and so never the persisted cache)", async () => {
    const h = renderEditor({ feedUrl: FEED });
    await home();
    await screen.findByTestId("phone-feed");
    const cached = JSON.stringify(
      h.queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    );
    expect(cached).not.toContain("token=");
    expect(
      JSON.stringify(
        h.queryClient
          .getQueryCache()
          .getAll()
          .map((query) => query.queryKey),
      ),
    ).not.toMatch(/feed/iu);
    expect(h.onUnauthorized).not.toHaveBeenCalled();
  });

  it("has a touch target of at least the parent size and no raw colours", async () => {
    renderEditor({ feedUrl: FEED });
    await home();
    const button = await screen.findByRole("button", {
      name: en.editor.feed.copy,
    });
    expect(button.className).toContain("min-h-touch-parent");
    expect(
      screen.getByRole("textbox", { name: en.editor.feed.link }).className,
    ).toContain("min-h-touch-parent");
    expect(screen.getByTestId("phone-feed").outerHTML).not.toMatch(
      /#[0-9a-f]{3,8}\b/iu,
    );
  });
});
