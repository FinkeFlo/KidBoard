import {
  AgendaResponseSchema,
  EditorListResponseSchema,
  PublicConfigSchema,
} from "@kidboard/shared";
import { describe, expect, it } from "vitest";

import { createDemoApi, DEMO_PARENT_PIN } from "./demoApi.ts";
import type { FakeRequest, FakeResponse } from "./fakeEditorApi.ts";

const NOW = Date.parse("2026-11-22T12:00:00+01:00");

function request(
  overrides: Partial<FakeRequest> & { path: string },
): FakeRequest {
  return { method: "GET", search: "", body: null, session: null, ...overrides };
}

function answer(response: FakeResponse | null): FakeResponse {
  if (response === null) throw new Error("not served");
  return response;
}

describe("demo API", () => {
  it("serves the demo config with the editor on", () => {
    const api = createDemoApi(() => NOW);
    const config = PublicConfigSchema.parse(
      answer(api.handle(request({ path: "/api/config" }))).json,
    );
    expect(config.editor).toBe(true);
  });

  it("unlocks only with the demo PIN and then serves the editor", () => {
    let now = NOW;
    const api = createDemoApi(() => now);
    const wrong = answer(
      api.handle(
        request({
          method: "POST",
          path: "/api/parent/unlock",
          body: JSON.stringify({ pin: "000000" }),
        }),
      ),
    );
    expect(wrong.status).toBe(403);
    expect(wrong.json).toMatchObject({ error: "wrong_pin" });
    expect(
      answer(
        api.handle(
          request({ method: "POST", path: "/api/parent/unlock", body: "{" }),
        ),
      ).status,
    ).toBe(400);
    const ok = answer(
      api.handle(
        request({
          method: "POST",
          path: "/api/parent/unlock",
          body: JSON.stringify({ pin: DEMO_PARENT_PIN }),
        }),
      ),
    );
    const { token } = ok.json as { token: string };
    expect(
      answer(
        api.handle(request({ path: "/api/parent/session", session: token })),
      ).status,
    ).toBe(200);
    const list = answer(
      api.handle(
        request({
          path: "/api/parent/entries",
          search: "from=2026-11-22&days=14",
          session: token,
        }),
      ),
    );
    expect(
      EditorListResponseSchema.parse(list.json).items.length,
    ).toBeGreaterThan(0);
    // The demo's Google entries are read-only list items.
    expect(
      EditorListResponseSchema.parse(list.json).items.every(
        (item) => item.origin === "google",
      ),
    ).toBe(true);
    // After 15 minutes the session is over.
    now += 15 * 60_000 + 1;
    expect(
      answer(
        api.handle(request({ path: "/api/parent/session", session: token })),
      ).status,
    ).toBe(403);
    expect(
      answer(
        api.handle(
          request({
            path: "/api/parent/entries",
            search: "from=2026-11-22&days=14",
            session: token,
          }),
        ),
      ).status,
    ).toBe(403);
  });

  it("shows app entries on the board agenda", () => {
    const api = createDemoApi(() => NOW);
    api.editor.seed({
      kind: "event",
      icon: "🦖",
      title: "Dino museum",
      allDay: true,
      date: "2026-11-23",
    });
    const agenda = AgendaResponseSchema.parse(
      answer(api.handle(request({ path: "/api/agenda" }))).json,
    );
    expect(agenda.events.filter((e) => e.title === "Dino museum")).toEqual([
      expect.objectContaining({ sourceId: "app-events", start: "2026-11-23" }),
    ]);
    expect(agenda.sources.map((s) => s.id)).toEqual(
      expect.arrayContaining(["app-events", "app-meals"]),
    );
  });

  it("does not serve unknown paths", () => {
    const api = createDemoApi(() => NOW);
    expect(api.handle(request({ path: "/api/other" }))).toBeNull();
  });
});
