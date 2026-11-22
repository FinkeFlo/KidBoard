import type { AgendaRange } from "./apiClient";

/** Root of every KidBoard query key (also the persistence filter). */
export const QUERY_ROOT = "kidboard";

/**
 * Query keys. They contain only public request parameters, never the access token,
 * so nothing secret ends up in the persisted cache.
 */
export const queryKeys = {
  config: (): readonly ["kidboard", "config"] => [QUERY_ROOT, "config"],
  agenda: (
    range: AgendaRange,
  ): readonly ["kidboard", "agenda", string, number] => [
    QUERY_ROOT,
    "agenda",
    range.from,
    range.days,
  ],
};

export type QueryKind = "config" | "agenda";

/** Which KidBoard query a key belongs to, `undefined` for foreign keys. */
export function queryKindOf(
  queryKey: readonly unknown[],
): QueryKind | undefined {
  if (queryKey[0] !== QUERY_ROOT) {
    return undefined;
  }
  if (queryKey[1] === "config" && queryKey.length === 2) {
    return "config";
  }
  if (
    queryKey[1] === "agenda" &&
    queryKey.length === 4 &&
    typeof queryKey[2] === "string" &&
    typeof queryKey[3] === "number"
  ) {
    return "agenda";
  }
  return undefined;
}
