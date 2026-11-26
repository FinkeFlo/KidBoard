import {
  SECRET_TOKEN_MAX_LENGTH,
  SECRET_TOKEN_MIN_LENGTH,
} from "@kidboard/shared";
import { describe, expect, it, type Mock, vi } from "vitest";

import {
  ACCESS_TOKEN_STORAGE_KEY,
  consumeAccessToken,
  forgetAccessToken,
} from "./accessToken";
import type { KeyValueStorage } from "./storage";
import { TEST_TOKEN } from "./testing.test-utils";

/** Low-entropy synthetic tokens in the server format (gitleaks-friendly). */
const OLD_TOKEN = "TESTONLY-old-access-token-0000000000000";
const NEW_TOKEN = "TESTONLY-new-access-token-0000000000000";

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

function fakeHistory(): {
  state: unknown;
  replaceState: Mock<History["replaceState"]>;
} {
  return {
    state: { from: "test" },
    replaceState: vi.fn<History["replaceState"]>(),
  };
}

describe("consumeAccessToken", () => {
  it("takes ?key=, stores it and removes it from the visible URL", () => {
    const storage = memoryStorage();
    const history = fakeHistory();

    const token = consumeAccessToken({
      storage,
      history,
      location: { href: `https://kb.test/week?view=1&key=${TEST_TOKEN}#top` },
    });

    expect(token).toBe(TEST_TOKEN);
    expect(storage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe(TEST_TOKEN);
    expect(history.replaceState).toHaveBeenCalledWith(
      { from: "test" },
      "",
      "/week?view=1#top",
    );
  });

  it("uses the stored token when the URL has none, without touching history", () => {
    const history = fakeHistory();
    const token = consumeAccessToken({
      storage: memoryStorage({ [ACCESS_TOKEN_STORAGE_KEY]: TEST_TOKEN }),
      history,
      location: { href: "https://kb.test/" },
    });

    expect(token).toBe(TEST_TOKEN);
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it("lets a new well-formed ?key= replace the stored token", () => {
    const storage = memoryStorage({ [ACCESS_TOKEN_STORAGE_KEY]: OLD_TOKEN });
    const token = consumeAccessToken({
      storage,
      history: fakeHistory(),
      location: { href: `https://kb.test/?key=${NEW_TOKEN}` },
    });

    expect(token).toBe(NEW_TOKEN);
    expect(storage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe(NEW_TOKEN);
  });

  it("trims a well-formed ?key= before storing it", () => {
    const storage = memoryStorage();
    const token = consumeAccessToken({
      storage,
      history: fakeHistory(),
      location: { href: `https://kb.test/?key=%20${NEW_TOKEN}%0A` },
    });

    expect(token).toBe(NEW_TOKEN);
    expect(storage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe(NEW_TOKEN);
  });

  it.each([
    ["too short", "x"],
    ["one below the minimum", "a".repeat(SECRET_TOKEN_MIN_LENGTH - 1)],
    ["above the maximum", "a".repeat(SECRET_TOKEN_MAX_LENGTH + 1)],
    ["other characters", `${NEW_TOKEN}%2B%3D`],
    ["an inner space", `${NEW_TOKEN}%20${NEW_TOKEN}`],
  ])(
    "strips a malformed ?key= (%s) and keeps the stored token untouched",
    (_label, key) => {
      const storage = memoryStorage({ [ACCESS_TOKEN_STORAGE_KEY]: OLD_TOKEN });
      const history = fakeHistory();
      const token = consumeAccessToken({
        storage,
        history,
        location: { href: `https://kb.test/week?key=${key}&view=1` },
      });

      expect(token).toBe(OLD_TOKEN);
      expect(storage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe(OLD_TOKEN);
      expect(history.replaceState).toHaveBeenCalledWith(
        { from: "test" },
        "",
        "/week?view=1",
      );
    },
  );

  it("strips a malformed ?key= and returns undefined without a stored token", () => {
    const storage = memoryStorage();
    const history = fakeHistory();
    const token = consumeAccessToken({
      storage,
      history,
      location: { href: "https://kb.test/?key=x" },
    });

    expect(token).toBeUndefined();
    expect(storage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBeNull();
    expect(history.replaceState).toHaveBeenCalledWith(
      expect.anything(),
      "",
      "/",
    );
  });

  it("strips an empty ?key= and keeps the stored token", () => {
    const history = fakeHistory();
    const token = consumeAccessToken({
      storage: memoryStorage({ [ACCESS_TOKEN_STORAGE_KEY]: TEST_TOKEN }),
      history,
      location: { href: "https://kb.test/?key=" },
    });

    expect(token).toBe(TEST_TOKEN);
    expect(history.replaceState).toHaveBeenCalledWith(
      expect.anything(),
      "",
      "/",
    );
  });

  it("returns undefined without any token", () => {
    expect(
      consumeAccessToken({
        storage: memoryStorage(),
        history: fakeHistory(),
        location: { href: "https://kb.test/" },
      }),
    ).toBeUndefined();
  });

  it("keeps the URL token for the session when storage is unavailable", () => {
    const token = consumeAccessToken({
      storage: undefined,
      history: fakeHistory(),
      location: { href: `https://kb.test/?key=${TEST_TOKEN}` },
    });
    expect(token).toBe(TEST_TOKEN);
  });

  it("survives storage that throws on read and write", () => {
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    expect(
      consumeAccessToken({
        storage: throwing,
        history: fakeHistory(),
        location: { href: `https://kb.test/?key=${TEST_TOKEN}` },
      }),
    ).toBe(TEST_TOKEN);
    expect(
      consumeAccessToken({
        storage: throwing,
        history: fakeHistory(),
        location: { href: "https://kb.test/" },
      }),
    ).toBeUndefined();
  });

  it("defaults to window.location and window.history", () => {
    window.history.replaceState(null, "", `/?a=1&key=${TEST_TOKEN}`);
    const token = consumeAccessToken({ storage: undefined });

    expect(token).toBe(TEST_TOKEN);
    expect(window.location.search).toBe("?a=1");
    window.history.replaceState(null, "", "/");
  });
});

describe("forgetAccessToken", () => {
  it("removes the stored token", () => {
    const storage = memoryStorage({ [ACCESS_TOKEN_STORAGE_KEY]: TEST_TOKEN });
    forgetAccessToken(storage);
    expect(storage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("ignores missing or throwing storage", () => {
    expect(() => {
      forgetAccessToken(undefined);
    }).not.toThrow();
    expect(() => {
      forgetAccessToken({
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => {
          throw new DOMException("denied", "SecurityError");
        },
      });
    }).not.toThrow();
  });
});
