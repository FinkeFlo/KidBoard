import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BEN, eventFixture, MIA } from "../components/fixtures.test-utils";
import type { FormatContext } from "../i18n/format";
import en from "../i18n/locales/en.json";
import { buildDayModel } from "./buildDayModel";
import { bandLayout, DayBoard } from "./DayBoard";

const format: FormatContext = { locale: "en", timeZone: "Europe/Berlin" };
const CONFIG = {
  timeZone: "Europe/Berlin",
  bands: { morningStart: "06:00", middayStart: "11:00", eveningStart: "17:00" },
} as const;

describe("DayBoard band symbols", () => {
  it("gives every band its own symbol and never reuses 🌙 (sleeps) or ☀️ (view toggle)", () => {
    const at = (id: string, hour: number): ReturnType<typeof eventFixture> =>
      eventFixture({
        id,
        start: `2026-11-22T${String(hour).padStart(2, "0")}:00:00+01:00`,
        end: `2026-11-22T${String(hour + 1).padStart(2, "0")}:00:00+01:00`,
      });
    const model = buildDayModel(
      { events: [at("m", 8), at("d", 12), at("e", 18)], meals: [] },
      CONFIG,
      "2026-11-22",
      Date.parse("2026-11-22T12:00:00+01:00"),
    );
    render(<DayBoard model={model} childList={[MIA, BEN]} format={format} />);
    const symbols = screen.getAllByTestId("day-band").map((band) => {
      const heading = within(band).getByRole("heading");
      return heading.querySelector(".font-emoji")?.textContent;
    });
    expect(symbols).toHaveLength(3);
    expect(new Set(symbols).size).toBe(3);
    for (const symbol of symbols) {
      expect(symbol).not.toBe("🌙");
      expect(symbol).not.toBe("☀️");
    }
  });
});

type Status = "past" | "current" | "upcoming";

/** Band items in time order: `p` past, `c` current, `u` upcoming, e.g. "pppcuu". */
function items(pattern: string): { id: string; status: Status }[] {
  const statuses: Record<string, Status> = {
    p: "past",
    c: "current",
    u: "upcoming",
  };
  return Array.from(pattern, (char) => char).map((char, i) => ({
    id: `${char}${String(i)}`,
    status: statuses[char] ?? "upcoming",
  }));
}

/** Layout summary: columns, rows, visible ids, hidden counts. */
function summary(pattern: string, hasAllDay: boolean): unknown {
  const layout = bandLayout(items(pattern), hasAllDay);
  return {
    columns: layout.columns,
    rows: layout.rows,
    visible: layout.visible.map((item) => item.id).join(","),
    earlier: layout.earlier,
    later: layout.later,
  };
}

describe("bandLayout", () => {
  it("uses one column up to 4 events, or up to 3 below an all-day row", () => {
    const shape = (pattern: string, allDay: boolean): unknown => {
      const layout = bandLayout(items(pattern), allDay);
      return [layout.columns, layout.rows, layout.visible.length];
    };
    expect(shape("u", false)).toEqual([1, 1, 1]);
    expect(shape("uuuu", false)).toEqual([1, 4, 4]);
    expect(shape("uuuuu", false)).toEqual([2, 3, 5]);
    expect(shape("uuu", true)).toEqual([1, 3, 3]);
    expect(shape("uuuu", true)).toEqual([2, 2, 4]);
    expect(shape("uuuuuuuu", true)).toEqual([2, 4, 8]);
    // An empty band keeps one row.
    expect(shape("", false)).toEqual([1, 1, 0]);
  });

  it("shows up to 8 events without any +N tile", () => {
    expect(summary("ppppuuuu", true)).toEqual({
      columns: 2,
      rows: 4,
      visible: "p0,p1,p2,p3,u4,u5,u6,u7",
      earlier: 0,
      later: 0,
    });
  });

  it("sums up the oldest past events first and keeps the rest in time order", () => {
    // 6 past, 1 current, 3 upcoming: 3 cells must go, all from the past.
    expect(summary("ppppppcuuu", false)).toEqual({
      columns: 2,
      rows: 4,
      visible: "p3,p4,p5,c6,u7,u8,u9",
      earlier: 3,
      later: 0,
    });
  });

  it("gives every slot to current and upcoming events before any past one", () => {
    // The current band: 3 past and 9 upcoming events.
    const layout = bandLayout(items("pppuuuuuuuuu"), true);
    expect(layout.visible.every((item) => item.status !== "past")).toBe(true);
    expect(layout.visible.map((item) => item.id)).toEqual([
      "u3",
      "u4",
      "u5",
      "u6",
      "u7",
      "u8",
    ]);
    // Exact counts: 6 shown + 3 over + 3 later = 12, in 8 cells (two of them "+N").
    expect(layout.earlier).toBe(3);
    expect(layout.later).toBe(3);
    expect(layout.rows).toBe(4);
  });

  it("sums up only the latest events when nothing is past", () => {
    expect(summary("cuuuuuuuuuuu", false)).toEqual({
      columns: 2,
      rows: 4,
      visible: "c0,u1,u2,u3,u4,u5,u6",
      earlier: 0,
      later: 5,
    });
  });

  it("keeps the counts exact for any mix", () => {
    for (let past = 0; past <= 14; past += 1) {
      for (let rest = 0; rest <= 14; rest += 1) {
        const all = items("p".repeat(past) + "u".repeat(rest));
        const layout = bandLayout(all, past % 2 === 0);
        const cells =
          layout.visible.length +
          (layout.earlier > 0 ? 1 : 0) +
          (layout.later > 0 ? 1 : 0);
        expect(layout.visible.length + layout.earlier + layout.later).toBe(
          all.length,
        );
        expect(cells).toBeLessThanOrEqual(layout.columns * 4);
        // A past event is only shown when every upcoming one is.
        if (layout.visible.some((item) => item.status === "past")) {
          expect(layout.later).toBe(0);
        }
        // Visible events stay in time order.
        const order = layout.visible.map((item) => all.indexOf(item));
        expect(order).toEqual([...order].sort((x, y) => x - y));
      }
    }
  });
});

describe("DayBoard crowded bands", () => {
  const morning = (
    count: number,
    allDay = false,
  ): ReturnType<typeof buildDayModel> => {
    const events = Array.from({ length: count }, (_, i) =>
      eventFixture({
        id: `m${String(i)}`,
        title: `Morning ${String(i + 1)}`,
        start: `2026-11-22T08:${String(i * 2).padStart(2, "0")}:00+01:00`,
        end: `2026-11-22T09:${String(i * 2).padStart(2, "0")}:00+01:00`,
      }),
    );
    if (allDay) {
      events.push(
        eventFixture({
          id: "a",
          allDay: true,
          start: "2026-11-22",
          end: "2026-11-23",
        }),
      );
    }
    return buildDayModel(
      { events, meals: [] },
      CONFIG,
      "2026-11-22",
      Date.parse("2026-11-22T12:00:00+01:00"),
    );
  };
  /** The band list's own cells (not the avatar lists inside the tiles). */
  const cells = (section: HTMLElement): Element[] => [
    ...(section.querySelector("ul")?.children ?? []),
  ];
  const band = (): HTMLElement => {
    const found = screen
      .getAllByTestId("day-band")
      .find((el) => el.dataset["band"] === "morning");
    if (found === undefined) throw new Error("morning band missing");
    return found;
  };

  it("lays out the rows for the cell height and lets tiles fit their cell", () => {
    render(
      <DayBoard model={morning(4, true)} childList={[MIA]} format={format} />,
    );
    const list = within(band()).getByRole("list");
    expect(list).toHaveClass("grid-cols-2");
    expect(list.style.getPropertyValue("--rows")).toBe("2");
    const tiles = within(band()).getAllByRole("article");
    expect(tiles).toHaveLength(4);
    for (const tile of tiles) expect(tile).toHaveAttribute("data-fit", "true");
  });

  it("never hides events silently: a leading tile says how many are already over", () => {
    // At 12:00 every morning event is over: the 5 oldest are summed up, first.
    render(<DayBoard model={morning(12)} childList={[MIA]} format={format} />);
    expect(within(band()).getAllByRole("article")).toHaveLength(7);
    const more = within(band()).getByTestId("day-band-more");
    expect(more).toHaveAttribute("data-kind", "earlier");
    expect(more).toHaveTextContent("+5");
    expect(
      within(more).getByText(en.day.hidden.earlier.replace("{{count}}", "5")),
    ).toHaveClass("sr-only");
    // The tile comes first, then the latest past events.
    expect(cells(band())[0]).toBe(more);
    expect(
      within(band()).queryByRole("article", { name: "Morning 5" }),
    ).toBeNull();
    expect(
      within(band()).getByRole("article", { name: "Morning 6" }),
    ).toBeInTheDocument();
    expect(
      within(band()).getByRole("article", { name: "Morning 12" }),
    ).toBeInTheDocument();
  });

  it("shows what comes next in the current band and sums up the latest at the end", () => {
    const at = (
      id: string,
      start: string,
      end: string,
    ): ReturnType<typeof eventFixture> =>
      eventFixture({
        id,
        title: id,
        start: `2026-11-22T${start}:00+01:00`,
        end: `2026-11-22T${end}:00+01:00`,
      });
    const events = [
      at("Past 1", "11:00", "11:10"),
      at("Past 2", "11:10", "11:20"),
      at("Past 3", "11:20", "11:30"),
      ...Array.from({ length: 9 }, (_, i) =>
        at(
          `Next ${String(i + 1)}`,
          `${String(13 + (i % 4))}:${String(10 * Math.floor(i / 4)).padStart(2, "0")}`,
          "16:55",
        ),
      ),
    ];
    const model = buildDayModel(
      { events, meals: [] },
      CONFIG,
      "2026-11-22",
      Date.parse("2026-11-22T12:00:00+01:00"),
    );
    render(<DayBoard model={model} childList={[MIA]} format={format} />);
    const midday = screen
      .getAllByTestId("day-band")
      .find((el) => el.dataset["band"] === "midday");
    if (midday === undefined) throw new Error("midday band missing");
    expect(midday).toHaveAttribute("data-status", "current");
    const tiles = within(midday).getAllByRole("article");
    expect(tiles).toHaveLength(6);
    for (const tile of tiles) {
      expect(tile).toHaveAttribute("data-status", "upcoming");
    }
    const [over, later] = within(midday).getAllByTestId("day-band-more");
    expect(over).toHaveAttribute("data-kind", "earlier");
    expect(over).toHaveTextContent("+3");
    expect(later).toHaveAttribute("data-kind", "later");
    expect(later).toHaveTextContent("+3");
    expect(later).toHaveTextContent(
      en.day.hidden.later.replace("{{count}}", "3"),
    );
    expect(cells(midday)[0]).toBe(over);
    expect(cells(midday).at(-1)).toBe(later);
  });

  it("shows no +N tile when everything fits", () => {
    render(<DayBoard model={morning(8)} childList={[MIA]} format={format} />);
    expect(within(band()).getAllByRole("article")).toHaveLength(8);
    expect(within(band()).queryByTestId("day-band-more")).toBeNull();
  });
});
