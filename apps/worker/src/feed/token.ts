import type { Env } from "../env";
import { PLACEHOLDER_TOKEN_MARKER } from "../http/auth";
import { logWarn } from "../log";

/** Shortest accepted feed token (e.g. `openssl rand -hex 32` gives 64 characters). */
export const FEED_TOKEN_MIN_LENGTH = 32;
/** Longest accepted feed token (keeps the path short for calendar apps). */
export const FEED_TOKEN_MAX_LENGTH = 256;

/**
 * Hex and base64url characters only: the token is a query value, so it must survive
 * calendar apps and copy/paste without any percent-encoding.
 */
const FEED_TOKEN_RE = /^[A-Za-z0-9_-]+$/;

export type FeedTokenStatus = "unset" | "invalid" | "valid";

/**
 * Classifies `KIDBOARD_FEED_TOKEN` (ADR-0014 "Getting data out"). Unset or empty →
 * `unset`; shorter than {@link FEED_TOKEN_MIN_LENGTH}, longer than
 * {@link FEED_TOKEN_MAX_LENGTH}, other characters than `A-Z a-z 0-9 _ -`, or still
 * containing the template marker → `invalid` (fail closed). Taken as is, no trimming.
 */
export function feedTokenStatus(raw: string | undefined): FeedTokenStatus {
  if (raw === undefined || raw === "") {
    return "unset";
  }
  if (raw.toUpperCase().includes(PLACEHOLDER_TOKEN_MARKER)) {
    return "invalid";
  }
  return raw.length >= FEED_TOKEN_MIN_LENGTH &&
    raw.length <= FEED_TOKEN_MAX_LENGTH &&
    FEED_TOKEN_RE.test(raw)
    ? "valid"
    : "invalid";
}

/** Whether the invalid-token warning was logged in this isolate. */
let warned = false;

/**
 * The feed token when the feed is configured, else `undefined`. An unusable value logs
 * one warning per isolate (never the value).
 */
export function configuredFeedToken(
  env: Pick<Env, "KIDBOARD_FEED_TOKEN">,
): string | undefined {
  const raw = env.KIDBOARD_FEED_TOKEN;
  const status = feedTokenStatus(raw);
  if (status === "invalid" && !warned) {
    warned = true;
    logWarn(
      `KIDBOARD_FEED_TOKEN must be ${String(FEED_TOKEN_MIN_LENGTH)} to ${String(FEED_TOKEN_MAX_LENGTH)} characters of A-Z, a-z, 0-9, _ or - (not the template value); the phone feed stays off`,
    );
  }
  return status === "valid" ? raw : undefined;
}

/** Test hook: lets the next invalid token log its warning again. */
export function resetFeedTokenWarning(): void {
  warned = false;
}
