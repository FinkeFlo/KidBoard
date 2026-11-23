import type { Env } from "../env";
import { PLACEHOLDER_TOKEN_MARKER } from "../http/auth";
import { logWarn } from "../log";

/** ADR-0013: the parent PIN is 6 to 12 ASCII digits. */
const PIN_RE = /^[0-9]{6,12}$/;

export type ParentPinStatus = "unset" | "invalid" | "valid";

/**
 * Classifies `KIDBOARD_PARENT_PIN` (ADR-0013). Unset or empty → `unset`; anything other
 * than 6-12 ASCII digits, including the `.dev.vars.example` template value, → `invalid`
 * (fail closed). The value is taken as is (no trimming), exactly as it will be compared.
 */
export function parentPinStatus(raw: string | undefined): ParentPinStatus {
  if (raw === undefined || raw === "") {
    return "unset";
  }
  if (raw.toUpperCase().includes(PLACEHOLDER_TOKEN_MARKER)) {
    return "invalid";
  }
  return PIN_RE.test(raw) ? "valid" : "invalid";
}

/** Last logged misconfiguration, so each one is logged once per isolate. */
let warnedAbout: string | undefined;

function warnOnce(key: string, message: string): void {
  if (warnedAbout !== key) {
    warnedAbout = key;
    logWarn(message);
  }
}

/**
 * Whether the access token `KIDBOARD_ACCESS_TOKEN` protects the API: set, non-empty and
 * not the template value (the access middleware refuses that one with 500).
 */
function accessTokenSet(raw: string | undefined): boolean {
  return (
    raw !== undefined &&
    raw !== "" &&
    !raw.toUpperCase().includes(PLACEHOLDER_TOKEN_MARKER)
  );
}

/**
 * Whether the parent editor (and with it the app sources on the board and the phone
 * feed) is available (ADR-0013, ADR-0014): only with the D1 binding `KIDBOARD_DATA`, a
 * valid `KIDBOARD_PARENT_PIN` and an access token `KIDBOARD_ACCESS_TOKEN` (fail closed:
 * without the token anyone who finds the URL could try PINs and the lockout would
 * lock the parents out). A set but unusable PIN, or a valid PIN without the binding or
 * the token, logs a configuration warning (never the PIN or the token). The read-only
 * board does not depend on this.
 */
export function editorEnabled(
  env: Pick<
    Env,
    "KIDBOARD_DATA" | "KIDBOARD_PARENT_PIN" | "KIDBOARD_ACCESS_TOKEN"
  >,
): boolean {
  const status = parentPinStatus(env.KIDBOARD_PARENT_PIN);
  if (status === "invalid") {
    warnOnce(
      "invalid-pin",
      "KIDBOARD_PARENT_PIN must be 6 to 12 digits (not the template value); the editor stays off",
    );
    return false;
  }
  if (status === "unset") {
    return false;
  }
  if (env.KIDBOARD_DATA === undefined) {
    warnOnce(
      "missing-d1",
      "KIDBOARD_PARENT_PIN is set but the D1 binding KIDBOARD_DATA is missing; the editor stays off",
    );
    return false;
  }
  if (!accessTokenSet(env.KIDBOARD_ACCESS_TOKEN)) {
    warnOnce(
      "missing-access-token",
      "KIDBOARD_PARENT_PIN is set but KIDBOARD_ACCESS_TOKEN is not (or is the template value); the editor and the phone feed stay off",
    );
    return false;
  }
  return true;
}
