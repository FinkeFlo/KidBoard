import { describe, expect, it } from "vitest";

import {
  hasSecretTokenFormat,
  SECRET_TOKEN_MAX_LENGTH,
  SECRET_TOKEN_MIN_LENGTH,
} from "./secretToken";

describe("hasSecretTokenFormat", () => {
  it("accepts hex and base64url tokens within the length bounds", () => {
    expect(hasSecretTokenFormat("a".repeat(SECRET_TOKEN_MIN_LENGTH))).toBe(
      true,
    );
    expect(hasSecretTokenFormat("Ab0_-".repeat(10))).toBe(true);
    expect(hasSecretTokenFormat("f".repeat(SECRET_TOKEN_MAX_LENGTH))).toBe(
      true,
    );
  });

  it("rejects too short, too long, empty and other characters", () => {
    expect(hasSecretTokenFormat("")).toBe(false);
    expect(hasSecretTokenFormat("a".repeat(SECRET_TOKEN_MIN_LENGTH - 1))).toBe(
      false,
    );
    expect(hasSecretTokenFormat("a".repeat(SECRET_TOKEN_MAX_LENGTH + 1))).toBe(
      false,
    );
    expect(hasSecretTokenFormat(`${"a".repeat(40)}=`)).toBe(false);
    expect(hasSecretTokenFormat(`${"a".repeat(40)} `)).toBe(false);
    expect(hasSecretTokenFormat(`${"a".repeat(20)}+${"a".repeat(20)}`)).toBe(
      false,
    );
  });
});
