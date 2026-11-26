import {
  addExceptionParts,
  type AppConfig,
  type AppEntryDto,
  dateKeyProblem,
  DateStringSchema,
  DateTimeStringSchema,
  type EditorEntryInput,
  EditorEntryInputSchema,
  type EditorIssue,
  EditorKindSchema,
  ENTRY_EXPORT_FORMAT,
  ENTRY_EXPORT_VERSION,
  entryDateRange,
  type EntryParts,
  type EntryRuleResult,
  importEntryParts,
  isDateKey,
  MAX_APP_ENTRIES,
  parseEditorEntryInput,
  setOverrideParts,
  singleDayProblem,
  updateEntryParts,
} from "@kidboard/shared";
import { z } from "zod";

import { logWarn } from "../log";
import { SchemaGate } from "./schema";
import { bumpStamp } from "./stamp";

/** ADR-0014: at most 8 KB (UTF-8) per entry: data, exceptions and overrides together. */
export const MAX_ENTRY_BYTES = 8 * 1024;

export { ENTRY_EXPORT_FORMAT, ENTRY_EXPORT_VERSION };

/** Entry ids are `crypto.randomUUID()` values (lower-case UUID text). */
export const EntryIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

const DateKeySchema = DateStringSchema.refine(isDateKey);

/**
 * An app entry as stored (ADR-0014), the shared DTO the editor API answers with:
 * `revision` starts at 1 and grows by 1 on every write (updates name the revision they
 * edited); `exdates` and `overrides` as in the shared `EntryParts`; timestamps ISO 8601
 * UTC.
 */
export type AppEntry = AppEntryDto;

export type StoreFailure =
  | { ok: false; error: "not_found" }
  | { ok: false; error: "conflict"; revision: number }
  | { ok: false; error: "limit_reached"; limit: "entries" | "size" }
  | { ok: false; error: "invalid"; issues: EditorIssue[] };

export type StoreResult<T> = { ok: true; value: T } | StoreFailure;

/**
 * Highest revision an import accepts (2^40, exactly representable). Larger values are
 * refused, so a crafted file cannot push revisions near 2^53, where `revision + 1` is no
 * longer exact in JavaScript and optimistic concurrency breaks.
 */
export const MAX_IMPORT_REVISION = 2 ** 40;

/**
 * An imported revision takes part in the new revision only up to this value (2^30).
 * From there, revisions grow by one per write or import, so stored revisions stay far
 * below {@link MAX_IMPORT_REVISION} and every export of this store imports again.
 */
export const IMPORT_REVISION_CLAMP = 2 ** 30;

/**
 * Most exceptions (and, separately, overrides) an imported entry may list: each takes
 * at least 13 bytes of its JSON column (`"YYYY-MM-DD",`), so more can never fit into
 * {@link MAX_ENTRY_BYTES}. Checked by the schema, before any date is validated.
 */
export const MAX_ENTRY_EXCEPTIONS = Math.floor(MAX_ENTRY_BYTES / 13);

const ExportedEntrySchema = z.strictObject({
  id: EntryIdSchema,
  revision: z.number().int().min(1).max(MAX_IMPORT_REVISION),
  kind: EditorKindSchema,
  data: z.unknown(),
  exdates: z.array(DateKeySchema).max(MAX_ENTRY_EXCEPTIONS).default([]),
  overrides: z
    .record(DateKeySchema, z.unknown())
    .refine((o) => Object.keys(o).length <= MAX_ENTRY_EXCEPTIONS, {
      message: `At most ${String(MAX_ENTRY_EXCEPTIONS)} overrides per entry`,
    })
    .default({}),
  createdAt: DateTimeStringSchema,
  updatedAt: DateTimeStringSchema,
});

/** Backup / move document of `exportAll` and `importAll` (ADR-0014). */
export const EntryExportSchema = z.strictObject({
  format: z.literal(ENTRY_EXPORT_FORMAT),
  version: z.literal(ENTRY_EXPORT_VERSION),
  exportedAt: DateTimeStringSchema,
  entries: z.array(ExportedEntrySchema).max(MAX_APP_ENTRIES),
});

export interface EntryExport {
  format: typeof ENTRY_EXPORT_FORMAT;
  version: typeof ENTRY_EXPORT_VERSION;
  exportedAt: string;
  entries: AppEntry[];
}

/** `replace`: the document becomes the whole store. `merge`: upsert by id, keep the rest. */
export type ImportMode = "replace" | "merge";

export interface ImportSummary {
  mode: ImportMode;
  imported: number;
  /** Imported entries whose id was not stored before the import. */
  created: number;
  /** Imported entries that replaced a stored entry with the same id. */
  updated: number;
}

export interface EntryStoreOptions {
  /** Validates children, icons and titles of every input (ADR-0012 model). */
  config: AppConfig;
  /** Clock (epoch ms); defaults to `Date.now`. */
  now?: () => number;
  /** Schema-created memo, one per isolate; defaults to a new gate. */
  gate?: SchemaGate;
}

/** `kb_meta` key of the import base revision (a constant, not user input). */
const IMPORT_BASE_KEY = "import_base_revision";

const COLUMNS =
  "id, revision, kind, data, exdates, overrides, first_date, last_date, created_at, updated_at";
const SELECT_ENTRY = `SELECT id, revision, kind, data, exdates, overrides, created_at, updated_at FROM app_entries`;

const RowSchema = z.object({
  id: z.string(),
  revision: z.number().int().min(1),
  kind: EditorKindSchema,
  data: z.string(),
  exdates: z.string(),
  overrides: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const StoredPartsSchema = z.object({
  data: EditorEntryInputSchema,
  exdates: z.array(DateKeySchema),
  overrides: z.record(DateKeySchema, EditorEntryInputSchema),
});

const encoder = new TextEncoder();

interface SerializedParts {
  data: string;
  exdates: string;
  overrides: string;
  bytes: number;
}

interface ImportRow {
  id: string;
  /** Revision in the document; the stored one is above it and above every old one. */
  revision: number;
  createdAt: string;
  parts: EntryParts;
  serialized: SerializedParts;
}

function serialize(parts: EntryParts): SerializedParts {
  const data = JSON.stringify(parts.data);
  const exdates = JSON.stringify(parts.exdates);
  const overrides = JSON.stringify(parts.overrides);
  return {
    data,
    exdates,
    overrides,
    bytes: encoder.encode(data + exdates + overrides).byteLength,
  };
}

function issue(path: string, message: string): EditorIssue {
  return { code: "invalid", path, message };
}

type InvalidFailure = Extract<StoreFailure, { error: "invalid" }>;

function invalid(issues: EditorIssue[]): InvalidFailure {
  return { ok: false, error: "invalid", issues };
}

const NOT_FOUND: StoreFailure = { ok: false, error: "not_found" };
const TOO_LARGE: StoreFailure = {
  ok: false,
  error: "limit_reached",
  limit: "size",
};
const TOO_MANY: StoreFailure = {
  ok: false,
  error: "limit_reached",
  limit: "entries",
};

/** A shared entry rule's outcome as a store result. */
function fromRule<T>(result: EntryRuleResult<T>): StoreResult<T> {
  return result.ok ? result : invalid(result.issues);
}

/**
 * Parses a row read from D1. Rows are validated on read too: a corrupt row (manual
 * edit, bug, partial restore) is skipped and logged by failure type only, so it can
 * never break the board.
 */
function parseRow(row: unknown): AppEntry | null {
  const columns = RowSchema.safeParse(row);
  if (!columns.success) {
    logWarn("skipped a stored app entry: invalid_columns");
    return null;
  }
  let json: unknown;
  try {
    json = {
      data: JSON.parse(columns.data.data) as unknown,
      exdates: JSON.parse(columns.data.exdates) as unknown,
      overrides: JSON.parse(columns.data.overrides) as unknown,
    };
  } catch {
    logWarn("skipped a stored app entry: invalid_json");
    return null;
  }
  const parts = StoredPartsSchema.safeParse(json);
  if (!parts.success || parts.data.data.kind !== columns.data.kind) {
    logWarn("skipped a stored app entry: invalid_data");
    return null;
  }
  return {
    id: columns.data.id,
    revision: columns.data.revision,
    kind: columns.data.kind,
    data: parts.data.data,
    exdates: parts.data.exdates,
    overrides: parts.data.overrides,
    createdAt: columns.data.created_at,
    updatedAt: columns.data.updated_at,
  };
}

/**
 * Repository of app entries in D1 (ADR-0014). Every input is validated with the T-39
 * model (`parseEditorEntryInput` against the config), every query is a prepared
 * statement with bound values, and the tables are created on first use.
 * Methods resolve to a {@link StoreResult}; D1 errors (database unavailable) reject.
 */
export class EntryStore {
  private readonly config: AppConfig;
  private readonly now: () => number;
  private readonly gate: SchemaGate;

  constructor(
    private readonly db: D1Database,
    options: EntryStoreOptions,
  ) {
    this.config = options.config;
    this.now = options.now ?? Date.now;
    this.gate = options.gate ?? new SchemaGate();
  }

  /**
   * Entries that may have an occurrence touching `[from, to)` (both optional,
   * `YYYY-MM-DD`), ordered by first date. A pre-filter: callers expand occurrences
   * themselves. Corrupt rows are skipped.
   */
  async list(from?: string, to?: string): Promise<AppEntry[]> {
    for (const date of [from, to]) {
      if (date !== undefined && !isDateKey(date)) {
        throw new RangeError("from/to must be YYYY-MM-DD");
      }
    }
    return this.run(async () => {
      const { results } = await this.db
        .prepare(
          `${SELECT_ENTRY} WHERE (?1 IS NULL OR last_date IS NULL OR last_date >= ?1) AND (?2 IS NULL OR first_date < ?2) ORDER BY first_date, id`,
        )
        .bind(from ?? null, to ?? null)
        .run();
      return results.flatMap((row) => parseRow(row) ?? []);
    });
  }

  async get(id: string): Promise<StoreResult<AppEntry>> {
    if (!EntryIdSchema.safeParse(id).success) {
      return NOT_FOUND;
    }
    return this.run(async () => {
      const entry = await this.load(id);
      return entry === null ? NOT_FOUND : { ok: true, value: entry };
    });
  }

  async create(input: unknown): Promise<StoreResult<AppEntry>> {
    const parsed = this.validate(input);
    if (!parsed.ok) {
      return parsed;
    }
    const parts: EntryParts = {
      data: parsed.value,
      exdates: [],
      overrides: {},
    };
    const serialized = serialize(parts);
    if (serialized.bytes > MAX_ENTRY_BYTES) {
      return TOO_LARGE;
    }
    return this.run(async () => {
      const id = crypto.randomUUID();
      const at = this.timestamp();
      const range = entryDateRange(parts.data, parts.overrides);
      // One statement: the count check and the insert are atomic; the change stamp is
      // replaced in the same batch (one transaction).
      const [result] = await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO app_entries (${COLUMNS}) SELECT ?, 1, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM app_entries) < ?`,
          )
          .bind(
            id,
            parts.data.kind,
            serialized.data,
            serialized.exdates,
            serialized.overrides,
            range.first,
            range.last,
            at,
            at,
            MAX_APP_ENTRIES,
          ),
        bumpStamp(this.db),
      ]);
      if (result === undefined || result.meta.changes === 0) {
        return TOO_MANY;
      }
      return {
        ok: true,
        value: {
          id,
          revision: 1,
          kind: parts.data.kind,
          ...parts,
          createdAt: at,
          updatedAt: at,
        },
      };
    });
  }

  /**
   * Replaces the entry's data. Exceptions and overrides are kept for the dates that are
   * still occurrences of the new rule (and of the same kind); a single entry has none.
   */
  async update(
    id: string,
    revision: number,
    input: unknown,
  ): Promise<StoreResult<AppEntry>> {
    const parsed = this.validate(input);
    if (!parsed.ok) {
      return parsed;
    }
    const data = parsed.value;
    return this.modify(id, revision, (current) => ({
      ok: true,
      value: updateEntryParts(current, data),
    }));
  }

  async remove(id: string, revision: number): Promise<StoreResult<null>> {
    if (!EntryIdSchema.safeParse(id).success) {
      return NOT_FOUND;
    }
    if (!Number.isInteger(revision) || revision < 1) {
      return invalid([
        issue("revision", "revision must be a positive integer"),
      ]);
    }
    return this.run(async () => {
      const [deleted] = await this.db.batch([
        this.db
          .prepare(
            "DELETE FROM app_entries WHERE id = ? AND revision = ? RETURNING id",
          )
          .bind(id, revision),
        bumpStamp(this.db),
      ]);
      return (deleted?.results.length ?? 0) === 0
        ? this.missOrConflict(id)
        : { ok: true, value: null };
    });
  }

  /** Removes one day of a series ("only this day"); drops an override of that day. */
  async addException(
    id: string,
    revision: number,
    date: string,
  ): Promise<StoreResult<AppEntry>> {
    const badDate = dateKeyProblem(date);
    if (badDate !== null) {
      return invalid([badDate]);
    }
    return this.modify(id, revision, (current) =>
      fromRule(addExceptionParts(current, date)),
    );
  }

  /**
   * Replaces one day of a series ("only this day") by a single entry, which may move to
   * another day or time; re-instates the day if it was an exception.
   */
  async setOverride(
    id: string,
    revision: number,
    date: string,
    input: unknown,
  ): Promise<StoreResult<AppEntry>> {
    // Checks that need no stored entry come first (before not_found and conflict).
    const badDate = dateKeyProblem(date);
    if (badDate !== null) {
      return invalid([badDate]);
    }
    const parsed = this.validate(input);
    if (!parsed.ok) {
      return parsed;
    }
    const override = parsed.value;
    const repeats = singleDayProblem(override);
    if (repeats !== null) {
      return invalid([repeats]);
    }
    return this.modify(id, revision, (current) =>
      fromRule(setOverrideParts(current, date, override)),
    );
  }

  /** All readable entries as a backup document (corrupt rows are skipped). */
  async exportAll(): Promise<EntryExport> {
    return this.run(async () => {
      const { results } = await this.db
        .prepare(`${SELECT_ENTRY} ORDER BY created_at, id`)
        .run();
      return {
        format: ENTRY_EXPORT_FORMAT,
        version: ENTRY_EXPORT_VERSION,
        exportedAt: this.timestamp(),
        entries: results.flatMap((row) => parseRow(row) ?? []),
      };
    });
  }

  /**
   * Imports an {@link EntryExport} document. Every entry, exception and override is
   * validated for its shape first (see `prepareImport`); nothing is written unless all
   * are valid. The
   * write is one batch (one transaction): all or nothing. Imported entries get a
   * revision above every revision the store has handed out, so a client still holding
   * an old revision gets a conflict instead of overwriting imported data.
   */
  async importAll(
    doc: unknown,
    mode: ImportMode,
  ): Promise<StoreResult<ImportSummary>> {
    const parsedDoc = EntryExportSchema.safeParse(doc);
    if (!parsedDoc.success) {
      return invalid(
        parsedDoc.error.issues.map((i) =>
          issue(i.path.map(String).join("."), i.message),
        ),
      );
    }
    const prepared = this.prepareImport(parsedDoc.data.entries);
    if (!prepared.ok) {
      return prepared;
    }
    const rows = prepared.value;
    return this.run(async () => {
      const { results: existing } = await this.db
        .prepare("SELECT id FROM app_entries")
        .run<{ id: string }>();
      const existingIds = new Set(existing.map((row) => row.id));
      const newCount = (): number =>
        mode === "replace"
          ? rows.length
          : existingIds.size +
            rows.filter((row) => !existingIds.has(row.id)).length;
      if (newCount() > MAX_APP_ENTRIES) {
        return TOO_MANY;
      }
      const at = this.timestamp();
      // The base revision is computed inside the batch (one transaction, before the
      // replace-mode delete), so no write between a read and the batch can be missed.
      const upsert = this.db.prepare(
        `INSERT INTO app_entries (${COLUMNS}) VALUES (?,
           MAX((SELECT value FROM kb_meta WHERE key = '${IMPORT_BASE_KEY}'), ?) + 1,
           ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           revision = MAX(app_entries.revision + 1, excluded.revision),
           kind = excluded.kind, data = excluded.data, exdates = excluded.exdates,
           overrides = excluded.overrides, first_date = excluded.first_date,
           last_date = excluded.last_date, created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
      );
      const statements: D1PreparedStatement[] = [
        this.db.prepare(
          `INSERT OR REPLACE INTO kb_meta (key, value) SELECT '${IMPORT_BASE_KEY}', COALESCE(MAX(revision), 0) FROM app_entries`,
        ),
      ];
      if (mode === "replace") {
        statements.push(this.db.prepare("DELETE FROM app_entries"));
      }
      for (const row of rows) {
        const range = entryDateRange(row.parts.data, row.parts.overrides);
        statements.push(
          upsert.bind(
            row.id,
            Math.min(row.revision, IMPORT_REVISION_CLAMP),
            row.parts.data.kind,
            row.serialized.data,
            row.serialized.exdates,
            row.serialized.overrides,
            range.first,
            range.last,
            row.createdAt,
            at,
          ),
        );
      }
      // Atomic limit guard: a concurrent create may have added rows since the count.
      statements.push(
        this.db
          .prepare(
            "INSERT INTO kb_guard (ok) SELECT 0 WHERE (SELECT COUNT(*) FROM app_entries) > ?",
          )
          .bind(MAX_APP_ENTRIES),
        this.db.prepare(`DELETE FROM kb_meta WHERE key = '${IMPORT_BASE_KEY}'`),
        bumpStamp(this.db),
      );
      try {
        await this.db.batch(statements);
      } catch (error) {
        // The guard (or anything else) rolled the batch back. Over the limit now → a
        // concurrent create won the race; otherwise a real D1 error.
        const { results: after } = await this.db
          .prepare("SELECT id FROM app_entries")
          .run<{ id: string }>();
        existingIds.clear();
        for (const row of after) {
          existingIds.add(row.id);
        }
        if (newCount() > MAX_APP_ENTRIES) {
          return TOO_MANY;
        }
        throw error;
      }
      // Counted against the ids read before the batch (for the parent's message only):
      // entry ids are random, so a concurrent create cannot add one of them in between;
      // only a delete racing the import could make one "updated" really "created".
      const updated = rows.filter((row) => existingIds.has(row.id)).length;
      return {
        ok: true,
        value: {
          mode,
          imported: rows.length,
          created: rows.length - updated,
          updated,
        },
      };
    });
  }

  /**
   * Validates every entry of an import document with the shared `importEntryParts`
   * (shape only, not against the config: a backup from before a config change, a
   * removed child, … is restored as it was, the board skips what the config cannot
   * express and the editor lists it as unresolved, so the parent can fix or delete it)
   * and checks the size of each. New and changed entries (`create`, `update`,
   * `setOverride`) are still checked against the config.
   */
  private prepareImport(
    entries: z.output<typeof ExportedEntrySchema>[],
  ): StoreResult<ImportRow[]> {
    const prepared = importEntryParts(entries);
    if (!prepared.ok) {
      return invalid(prepared.issues);
    }
    const rows: ImportRow[] = [];
    let tooLarge = false;
    for (const [i, parts] of prepared.value.entries()) {
      const entry = entries[i];
      if (entry === undefined) {
        throw new RangeError("importEntryParts returned an extra entry");
      }
      const serialized = serialize(parts);
      if (serialized.bytes > MAX_ENTRY_BYTES) {
        tooLarge = true;
      }
      rows.push({
        id: entry.id,
        revision: entry.revision,
        createdAt: entry.createdAt,
        parts,
        serialized,
      });
    }
    return tooLarge ? TOO_LARGE : { ok: true, value: rows };
  }

  private validate(
    input: unknown,
  ): { ok: true; value: EditorEntryInput } | InvalidFailure {
    const result = parseEditorEntryInput(input, this.config);
    return result.ok
      ? { ok: true, value: result.entry }
      : invalid(result.issues);
  }

  /** Read-check-write with optimistic concurrency on `revision`. */
  private async modify(
    id: string,
    revision: number,
    change: (current: AppEntry) => StoreResult<EntryParts>,
  ): Promise<StoreResult<AppEntry>> {
    if (!EntryIdSchema.safeParse(id).success) {
      return NOT_FOUND;
    }
    if (!Number.isInteger(revision) || revision < 1) {
      return invalid([
        issue("revision", "revision must be a positive integer"),
      ]);
    }
    return this.run(async () => {
      const current = await this.load(id);
      if (current === null) {
        return NOT_FOUND;
      }
      if (current.revision !== revision) {
        return { ok: false, error: "conflict", revision: current.revision };
      }
      const next = change(current);
      if (!next.ok) {
        return next;
      }
      const parts = next.value;
      const serialized = serialize(parts);
      if (serialized.bytes > MAX_ENTRY_BYTES) {
        return TOO_LARGE;
      }
      const range = entryDateRange(parts.data, parts.overrides);
      const at = this.timestamp();
      // The revision condition makes the write fail if another write came in between;
      // the change stamp is replaced in the same batch (one transaction).
      const [result] = await this.db.batch<{ revision: unknown }>([
        this.db
          .prepare(
            `UPDATE app_entries SET revision = revision + 1, kind = ?, data = ?, exdates = ?,
             overrides = ?, first_date = ?, last_date = ?, updated_at = ?
           WHERE id = ? AND revision = ? RETURNING revision`,
          )
          .bind(
            parts.data.kind,
            serialized.data,
            serialized.exdates,
            serialized.overrides,
            range.first,
            range.last,
            at,
            id,
            revision,
          ),
        bumpStamp(this.db),
      ]);
      const written = result?.results[0]?.revision;
      if (typeof written !== "number") {
        return this.missOrConflict(id);
      }
      return {
        ok: true,
        value: {
          ...current,
          ...parts,
          kind: parts.data.kind,
          revision: written,
          updatedAt: at,
        },
      };
    });
  }

  private async load(id: string): Promise<AppEntry | null> {
    const row = await this.db
      .prepare(`${SELECT_ENTRY} WHERE id = ?`)
      .bind(id)
      .first();
    return row === null ? null : parseRow(row);
  }

  private async missOrConflict(id: string): Promise<StoreFailure> {
    const current = await this.db
      .prepare("SELECT revision FROM app_entries WHERE id = ?")
      .bind(id)
      .first<number>("revision");
    return current === null
      ? NOT_FOUND
      : { ok: false, error: "conflict", revision: current };
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }

  private run<T>(op: () => Promise<T>): Promise<T> {
    return this.gate.run(this.db, op);
  }
}
