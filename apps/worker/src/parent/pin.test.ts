import { env as testEnv } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { editorEnabled, parentPinStatus } from "./pin";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parentPinStatus", () => {
  it.each([
    [undefined, "unset"],
    ["", "unset"],
    ["123456", "valid"],
    ["000000000000", "valid"],
    ["12345", "invalid"], // too short
    ["1234567890123", "invalid"], // too long
    ["12345a", "invalid"],
    [" 123456", "invalid"], // no trimming
    ["123456\n", "invalid"],
    ["١٢٣٤٥٦", "invalid"], // non-ASCII digits
    ["REPLACE_ME", "invalid"], // template value
    ["replace_me", "invalid"],
  ] as const)("%j → %s", (raw, expected) => {
    expect(parentPinStatus(raw)).toBe(expected);
  });
});

describe("editorEnabled", () => {
  it("needs both the D1 binding and a valid PIN", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const db = testEnv.KIDBOARD_DATA;
    expect(
      editorEnabled({ KIDBOARD_DATA: db, KIDBOARD_PARENT_PIN: "246813" }),
    ).toBe(true);
    expect(editorEnabled({ KIDBOARD_DATA: db })).toBe(false);
    expect(
      editorEnabled({ KIDBOARD_DATA: db, KIDBOARD_PARENT_PIN: "REPLACE_ME" }),
    ).toBe(false);
    expect(
      editorEnabled({ KIDBOARD_DATA: db, KIDBOARD_PARENT_PIN: "1234" }),
    ).toBe(false);
    expect(editorEnabled({ KIDBOARD_PARENT_PIN: "246813" })).toBe(false);
  });

  it("warns about a misconfiguration without logging the PIN", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    editorEnabled({ KIDBOARD_PARENT_PIN: "98765" });
    editorEnabled({ KIDBOARD_PARENT_PIN: "98765" });
    editorEnabled({ KIDBOARD_PARENT_PIN: "975318642" });
    const lines = warn.mock.calls.map((args) => args.join(" "));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("KIDBOARD_PARENT_PIN must be 6 to 12 digits");
    expect(lines[1]).toContain("KIDBOARD_DATA is missing");
    expect(lines.join("\n")).not.toMatch(/98765|975318642/);
  });
});
