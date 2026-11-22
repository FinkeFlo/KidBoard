import {
  CalendarEventSchema,
  DateStringSchema,
  DateTimeStringSchema,
  MealSchema,
} from "@kidboard/shared";
import { z } from "zod";

/** Normalized data of one source for a fixed window (what the caches hold). */
export const SourceEntrySchema = z.object({
  v: z.literal(1),
  sourceId: z.string().min(1),
  fetchedAt: DateTimeStringSchema,
  /** `[from, to)` the data was expanded for, `YYYY-MM-DD` in the config zone. */
  window: z.object({ from: DateStringSchema, to: DateStringSchema }),
  truncated: z.boolean(),
  events: z.array(CalendarEventSchema),
  meals: z.array(MealSchema),
});
export type SourceEntry = z.infer<typeof SourceEntrySchema>;

/** ADR-0006: an entry is kept (and usable as last-good) for 7 days. */
export const LAST_GOOD_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Max entries in the per-isolate memory layer (one per source). */
const MEMORY_LIMIT = 64;

/**
 * Logical key of a source's entry. One entry per source serves both roles: it is
 * *fresh* while younger than the TTL and expanded for the current window, and
 * *last-good* for 7 days (one write per refresh, which matters for KV's write quota).
 */
export function sourceKey(sourceId: string, hash: string): string {
  return `v1/source/${sourceId}/${hash}`;
}

/** Persistent layer behind the memory map. */
export interface StoreBackend {
  readonly kind: "kv" | "cache";
  /** Raw JSON text under `key`, or null. */
  read(key: string): Promise<string | null>;
  write(key: string, json: string, ttlSeconds: number): Promise<void>;
}

/** Workers KV (`KIDBOARD_CACHE` binding): global, survives isolates, works on workers.dev. */
export function kvBackend(namespace: KVNamespace): StoreBackend {
  return {
    kind: "kv",
    read: (key) => namespace.get(key, "text"),
    write: (key, json, ttlSeconds) =>
      // KV requires expirationTtl >= 60 s.
      namespace.put(key, json, { expirationTtl: Math.max(60, ttlSeconds) }),
  };
}

/** Host of the synthetic Cache API keys; never fetched (`.invalid` is reserved, RFC 2606). */
const CACHE_KEY_ORIGIN = "https://cache.kidboard.invalid";

/**
 * Workers Cache API fallback (per data center; functional only on custom domains, a
 * no-op e.g. on `*.workers.dev`).
 */
export function cacheBackend(openCache: () => Promise<Cache>): StoreBackend {
  return {
    kind: "cache",
    read: async (key) => {
      const cache = await openCache();
      const response = await cache.match(`${CACHE_KEY_ORIGIN}/${key}`);
      return response === undefined ? null : response.text();
    },
    write: async (key, json, ttlSeconds) => {
      const cache = await openCache();
      await cache.put(
        `${CACHE_KEY_ORIGIN}/${key}`,
        new Response(json, {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `max-age=${String(ttlSeconds)}`,
          },
        }),
      );
    },
  };
}

interface MemoryItem {
  entry: SourceEntry;
  expiresAtMs: number;
}

/**
 * Store for {@link SourceEntry}s: a small per-isolate memory map in front of a
 * persistent {@link StoreBackend} (KV when bound, else the Cache API; ADR-0006).
 * Entries are validated on read and expire after {@link LAST_GOOD_TTL_SECONDS},
 * enforced by the backend's TTL and by the entry's own `fetchedAt`.
 */
export class SourceStore {
  readonly #memory = new Map<string, MemoryItem>();

  /** Returns the entry under `key` if it is younger than 7 days at `nowMs`. */
  async get(
    backend: StoreBackend,
    key: string,
    nowMs: number,
  ): Promise<SourceEntry | null> {
    const item = this.#memory.get(key);
    if (item !== undefined) {
      if (item.expiresAtMs > nowMs) {
        return item.entry;
      }
      this.#memory.delete(key);
    }
    try {
      const text = await backend.read(key);
      if (text === null) {
        return null;
      }
      const parsed = SourceEntrySchema.safeParse(JSON.parse(text));
      if (!parsed.success || expiresAtMs(parsed.data) <= nowMs) {
        return null;
      }
      this.#remember(key, parsed.data);
      return parsed.data;
    } catch {
      // Unreadable entry or backend failure: treat as a miss.
      return null;
    }
  }

  /** Stores `entry` in memory immediately and in the backend for 7 days. */
  async put(
    backend: StoreBackend,
    key: string,
    entry: SourceEntry,
  ): Promise<void> {
    this.#remember(key, entry);
    await backend.write(key, JSON.stringify(entry), LAST_GOOD_TTL_SECONDS);
  }

  #remember(key: string, entry: SourceEntry): void {
    this.#memory.delete(key);
    if (this.#memory.size >= MEMORY_LIMIT) {
      const oldest = this.#memory.keys().next();
      if (oldest.done !== true) {
        this.#memory.delete(oldest.value);
      }
    }
    this.#memory.set(key, { entry, expiresAtMs: expiresAtMs(entry) });
  }
}

function expiresAtMs(entry: SourceEntry): number {
  return Date.parse(entry.fetchedAt) + LAST_GOOD_TTL_SECONDS * 1000;
}
