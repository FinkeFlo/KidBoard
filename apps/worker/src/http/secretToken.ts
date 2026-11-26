import {
  hasSecretTokenFormat,
  SECRET_TOKEN_MAX_LENGTH,
  SECRET_TOKEN_MIN_LENGTH,
} from "@kidboard/shared";

// The format rule lives in shared so the web client can check `?key=` the same way.
export { SECRET_TOKEN_MAX_LENGTH, SECRET_TOKEN_MIN_LENGTH };

/**
 * Marker of the template value in `.dev.vars.example`. "Deploy to Cloudflare" offers that
 * file's values as defaults, so a secret still containing it is publicly known and is
 * never accepted.
 */
export const PLACEHOLDER_TOKEN_MARKER = "REPLACE_ME";

export type SecretTokenStatus = "unset" | "invalid" | "valid";

/**
 * Classifies a secret token (`KIDBOARD_ACCESS_TOKEN`, `KIDBOARD_FEED_TOKEN`). Unset or
 * empty → `unset`; shorter than {@link SECRET_TOKEN_MIN_LENGTH}, longer than
 * {@link SECRET_TOKEN_MAX_LENGTH}, other characters than `A-Z a-z 0-9 _ -`
 * ({@link hasSecretTokenFormat}), or still containing the template marker → `invalid`
 * (fail closed). Taken as is, no trimming.
 */
export function secretTokenStatus(raw: string | undefined): SecretTokenStatus {
  if (raw === undefined || raw === "") {
    return "unset";
  }
  if (raw.toUpperCase().includes(PLACEHOLDER_TOKEN_MARKER)) {
    return "invalid";
  }
  return hasSecretTokenFormat(raw) ? "valid" : "invalid";
}
