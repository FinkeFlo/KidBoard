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
 * Whether the parent editor is available (ADR-0013, ADR-0014): only with the D1
 * binding `KIDBOARD_DATA` and a valid `KIDBOARD_PARENT_PIN`. A set but unusable PIN, or
 * a valid PIN without the binding, logs a configuration warning (never the PIN).
 */
export function editorEnabled(
  env: Pick<Env, "KIDBOARD_DATA" | "KIDBOARD_PARENT_PIN">,
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
  return true;
}
