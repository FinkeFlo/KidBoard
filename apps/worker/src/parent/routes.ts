import { type Context, Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

import type { AppEnv } from "../env";
import { tokensEqual } from "../http/auth";
import { parseJsonBody } from "../http/jsonBody";
import { UnlockLimiter } from "./lockout";
import { editorEnabled } from "./pin";
import {
  type ParentEnv,
  requireParentSession,
  SESSION_TTL_SECONDS,
  SessionKeys,
  signSession,
} from "./session";

/** ADR-0013: request bodies of `/api/parent/*` are at most 16 KB. */
export const MAX_PARENT_BODY_BYTES = 16 * 1024;

/** Body of `POST /api/parent/unlock`. Any string is a guess; only the length is capped. */
const UnlockBodySchema = z.strictObject({ pin: z.string().max(64) });

export interface ParentRoutesOptions {
  /** Clock, epoch ms. */
  now: () => number;
}

export interface ParentRoutes {
  /** Mount at `/api/parent` (after the access token middleware). */
  app: Hono<AppEnv>;
  /** Guard for editor routes added later (T-43), sharing this instance's key cache. */
  requireSession: MiddlewareHandler<ParentEnv>;
}

function isoSeconds(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

/**
 * Parent lock routes (ADR-0013), mounted under `/api/parent`:
 *
 * * every path: editor off (no D1 binding or no valid PIN) → 404 `not_found`; bodies
 *   over {@link MAX_PARENT_BODY_BYTES} → 413 `payload_too_large`;
 * * `POST /unlock` `{ pin }` → `{ token, expiresAt }` (15 min); wrong PIN → 403
 *   `wrong_pin` with `attemptsLeft`; the 5th wrong PIN within 15 min and every request
 *   during the following 15 min → 429 `parent_lockout` with `Retry-After`. Each attempt
 *   is reserved against the limit before the PIN is compared (see `UnlockLimiter`);
 * * `GET /session` (needs {@link requireParentSession}) → `{ expiresAt }`.
 *
 * State (key cache, per-isolate failure counter) lives in the returned instance.
 */
export function parentRoutes(options: ParentRoutesOptions): ParentRoutes {
  const keys = new SessionKeys();
  const limiter = new UnlockLimiter();
  const requireSession = requireParentSession({ keys, now: options.now });
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    if (!editorEnabled(c.env)) {
      return c.json({ error: "not_found", message: "Not found" }, 404);
    }
    await next();
  });
  app.use(
    "*",
    bodyLimit({
      maxSize: MAX_PARENT_BODY_BYTES,
      onError: (c) =>
        c.json(
          {
            error: "payload_too_large",
            message: `Request body must be at most ${String(MAX_PARENT_BODY_BYTES)} bytes`,
          },
          413,
        ),
    }),
  );

  app.post("/unlock", async (c) => {
    const db = c.env.KIDBOARD_DATA;
    const expected = c.env.KIDBOARD_PARENT_PIN;
    if (db === undefined || expected === undefined) {
      // Unreachable behind the editor gate; keeps the types honest.
      return c.json({ error: "not_found", message: "Not found" }, 404);
    }
    const nowSeconds = Math.floor(options.now() / 1000);
    // Reserve the attempt before anything is awaited (ADR-0013): parallel requests in
    // this isolate cannot all pass the check before one of them records a failure.
    const local = limiter.reserveLocal(nowSeconds);
    if (!local.ok) {
      return lockout(c, local.retryAfterSeconds);
    }
    const body = await parseJsonBody(c, UnlockBodySchema);
    if (!body.ok) {
      limiter.releaseLocal(local);
      return body.response;
    }
    await keys.ensureSchema(db);
    const reserved = await limiter.reserveRemote(db, local, nowSeconds);
    if (!reserved.ok) {
      limiter.releaseLocal(local);
      return lockout(c, reserved.retryAfterSeconds);
    }
    if (!(await tokensEqual(body.value.pin, expected))) {
      const outcome = await limiter.fail(db, nowSeconds);
      if (outcome.locked) {
        return lockout(c, outcome.retryAfterSeconds);
      }
      // 403, not 401: 401 means "access token invalid" to the board client.
      return c.json(
        {
          error: "wrong_pin",
          message: "Wrong PIN",
          attemptsLeft: outcome.attemptsLeft,
        },
        403,
      );
    }
    await limiter.release(db, reserved);
    const expiresAt = nowSeconds + SESSION_TTL_SECONDS;
    const token = await signSession(await keys.key(db, expected), expiresAt);
    return c.json({ token, expiresAt: isoSeconds(expiresAt) });
  });

  app.get("/session", requireSession, (c) =>
    c.json({ expiresAt: isoSeconds(c.var.parentSessionExpiresAt) }),
  );

  return { app, requireSession };
}

function lockout(c: Context<AppEnv>, retryAfterSeconds: number): Response {
  c.header("Retry-After", String(Math.max(1, retryAfterSeconds)));
  return c.json(
    {
      error: "parent_lockout",
      message: "Too many wrong PINs; try again later",
      retryAfterSeconds,
    },
    429,
  );
}
