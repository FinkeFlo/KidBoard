/**
 * Worker bindings: plain-text variables, secrets and the optional KV namespace.
 *
 * Typed by hand instead of `wrangler types`: the calendar secrets have dynamic names
 * (`CAL_<ID>_URL`, one per configured calendar) and the variables are not declared in
 * `wrangler.jsonc`, so the generator would only see the KV binding.
 */
export interface Env {
  /** Non-secret settings as one JSON document (docs/CONFIG.md). Required. */
  KIDBOARD_CONFIG?: string;
  /** If set (non-empty), `/api/*` except `/api/health` requires this token. */
  KIDBOARD_ACCESS_TOKEN?: string;
  /** Comma-separated list of allowed CORS origins; default none. */
  KIDBOARD_ALLOWED_ORIGINS?: string;
  /** Seconds a fetched feed counts as fresh; default 3600. */
  KIDBOARD_CACHE_TTL?: string;
  /**
   * Optional KV namespace for the source cache (declared without an id in
   * `wrangler.jsonc`, auto-provisioned on deploy). Without it the Cache API is used.
   */
  KIDBOARD_CACHE?: KVNamespace;
  /** Secret iCal URL per calendar, see `calendarSecretName` in `@kidboard/shared`. */
  [secret: `CAL_${string}_URL`]: string | undefined;
}

/** Hono environment of the app. */
export interface AppEnv {
  Bindings: Env;
}
