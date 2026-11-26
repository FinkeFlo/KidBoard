import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";

import { type AppOptions, createApp } from "./app";
import type { Env } from "./env";

/** Origin of every test request (a reserved test domain). */
export const TEST_ORIGIN = "https://board.example.test";

export interface TestAppOptions extends Omit<AppOptions, "now" | "openCache"> {
  /** Start of the app's clock (epoch ms). */
  now: number;
  /** Named Cache API cache of the app; without one the app's default (`caches.default`). */
  cacheName?: string | undefined;
}

export interface TestApp {
  /** The app's clock: tests move time by setting `clock.now`. */
  clock: { now: number };
  /**
   * Sends one request (`path` below {@link TEST_ORIGIN}) with its own execution context
   * and waits for the work it hands to `waitUntil` before resolving.
   */
  fetch: (
    path: string,
    init: RequestInit | undefined,
    env: Env,
  ) => Promise<Response>;
}

/** A fresh app (own memory layer, i.e. a new isolate) on a settable clock. */
export function testApp(options: TestAppOptions): TestApp {
  const { now, cacheName, ...appOptions } = options;
  const clock = { now };
  const app = createApp({
    ...appOptions,
    now: () => clock.now,
    ...(cacheName === undefined
      ? {}
      : { openCache: () => caches.open(cacheName) }),
  });
  return {
    clock,
    fetch: async (path, init, env) => {
      const ctx = createExecutionContext();
      const response = await app.fetch(
        new Request(`${TEST_ORIGIN}${path}`, init),
        env,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      return response;
    },
  };
}
