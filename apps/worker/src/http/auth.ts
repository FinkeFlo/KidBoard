import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../env";

const encoder = new TextEncoder();

/**
 * Constant-time string comparison: both values are hashed to fixed-size SHA-256
 * digests first (no length leak), then compared with `crypto.subtle.timingSafeEqual`
 * (Cloudflare "Workers best practices").
 */
export async function tokensEqual(
  provided: string,
  expected: string,
): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function bearerToken(header: string | undefined): string | undefined {
  const match = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header ?? "");
  return match?.[1];
}

/** Paths that stay public even with an access token (they expose only `{ ok: true }`). */
const PUBLIC_PATHS = new Set(["/api/health"]);

/**
 * Optional access token (`KIDBOARD_ACCESS_TOKEN`). When set and non-empty, every API
 * path except {@link PUBLIC_PATHS} needs `Authorization: Bearer <token>` or
 * `?key=<token>`; otherwise 401. CORS preflights are answered by the CORS middleware
 * before this runs.
 */
export function accessToken(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const expected = c.env.KIDBOARD_ACCESS_TOKEN ?? "";
    if (expected === "" || PUBLIC_PATHS.has(c.req.path)) {
      await next();
      return;
    }
    const candidates = [
      bearerToken(c.req.header("Authorization")),
      c.req.query("key"),
    ].filter((t): t is string => t !== undefined && t !== "");
    const results = await Promise.all(
      candidates.map((t) => tokensEqual(t, expected)),
    );
    if (!results.includes(true)) {
      c.header("WWW-Authenticate", 'Bearer realm="kidboard"');
      return c.json(
        { error: "unauthorized", message: "A valid access token is required" },
        401,
      );
    }
    await next();
  };
}
