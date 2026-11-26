/** Shortest accepted secret token (e.g. `openssl rand -hex 32` gives 64 characters). */
export const SECRET_TOKEN_MIN_LENGTH = 32;
/** Longest accepted secret token (keeps URLs short for calendar apps). */
export const SECRET_TOKEN_MAX_LENGTH = 256;

/**
 * Hex and base64url characters only: a token travels as a query value, so it must
 * survive calendar apps and copy/paste without any percent-encoding.
 */
const SECRET_TOKEN_RE = /^[A-Za-z0-9_-]+$/;

/**
 * True if `raw` has the format of a secret token (`KIDBOARD_ACCESS_TOKEN`,
 * `KIDBOARD_FEED_TOKEN`): {@link SECRET_TOKEN_MIN_LENGTH} to
 * {@link SECRET_TOKEN_MAX_LENGTH} characters of `A-Z a-z 0-9 _ -`. Taken as is, no
 * trimming. Says nothing about whether the token is the configured one.
 */
export function hasSecretTokenFormat(raw: string): boolean {
  return (
    raw.length >= SECRET_TOKEN_MIN_LENGTH &&
    raw.length <= SECRET_TOKEN_MAX_LENGTH &&
    SECRET_TOKEN_RE.test(raw)
  );
}
