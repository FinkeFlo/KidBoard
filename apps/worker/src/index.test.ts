import { describe, expect, it } from "vitest";

import app from "./index";

describe("GET /api/health", () => {
  it("returns 200 and { ok: true }", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("X-App-Name")).toBe("KidBoard");
    expect(await response.json()).toEqual({ ok: true });
  });
});
