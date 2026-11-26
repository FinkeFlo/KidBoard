import { isDateKey } from "../dates";
import {
  type EditorEntryInput,
  EditorEntryInputSchema,
  type EditorKind,
} from "./entry";
import { isOccurrenceDate } from "./items";
import type { EditorIssue } from "./validate";

/*
 * Pure rules of the editor's entry store (ADR-0014): how an update, an "only this day"
 * exception or override and an imported backup entry change the stored parts of an app
 * entry. Used by the worker's `EntryStore` and by the web demo's fake editor API, so
 * both apply exactly the same rules. No storage, no HTTP: entry in, entry or issues out.
 */

/** The stored parts of an app entry besides its bookkeeping (id, revision, stamps). */
export interface EntryParts {
  data: EditorEntryInput;
  /** Days of a series removed "only this day" (iCal `EXDATE`), sorted. */
  exdates: string[];
  /**
   * "Only this day" replacements keyed by the original occurrence date (iCal
   * `RECURRENCE-ID`); each value is a single (`repeat: "none"`) entry. Keys sorted.
   */
  overrides: Record<string, EditorEntryInput>;
}

export type EntryRuleResult<T> =
  { ok: true; value: T } | { ok: false; issues: EditorIssue[] };

/** An entry of a backup document whose envelope (ids, dates, stamps) is already parsed. */
export interface ImportEntryInput {
  id: string;
  kind: EditorKind;
  /** Not validated yet. */
  data: unknown;
  exdates: readonly string[];
  /** Values not validated yet. */
  overrides: Readonly<Record<string, unknown>>;
}

function issue(path: string, message: string): EditorIssue {
  return { code: "invalid", path, message };
}

function failed<T>(problem: EditorIssue): EntryRuleResult<T> {
  return { ok: false, issues: [problem] };
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

function withPrefix(prefix: string, issues: EditorIssue[]): EditorIssue[] {
  return issues.map((i) => ({
    ...i,
    path: i.path === "" ? prefix : `${prefix}.${i.path}`,
  }));
}

/** Shape-only validation (no config): what an imported or stored entry must satisfy. */
export function validateEntryShape(
  input: unknown,
): EntryRuleResult<EditorEntryInput> {
  const result = EditorEntryInputSchema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : {
        ok: false,
        issues: result.error.issues.map((i) =>
          issue(i.path.map(String).join("."), i.message),
        ),
      };
}

/** Why `date` cannot name a day of a series (not `YYYY-MM-DD`), or `null`. */
export function dateKeyProblem(date: string): EditorIssue | null {
  return isDateKey(date) ? null : issue("date", "date must be YYYY-MM-DD");
}

/** Why `override` cannot replace a single day (it repeats itself), or `null`. */
export function singleDayProblem(
  override: EditorEntryInput,
): EditorIssue | null {
  return override.repeat === "none"
    ? null
    : issue("repeat", "A single day cannot repeat");
}

/** Why `date` cannot carry an exception or override of `master`, or `null`. */
export function occurrenceProblem(
  master: EditorEntryInput,
  date: string,
): EditorIssue | null {
  if (master.repeat === "none") {
    return issue("date", "Only a series has single days to change");
  }
  if (!isOccurrenceDate(master, date)) {
    return issue("date", "This day is not part of the series");
  }
  return null;
}

/**
 * Replaces the entry's data. Exceptions and overrides are kept for the dates that are
 * still occurrences of the new rule (overrides only of the same kind); a single entry
 * has none.
 */
export function updateEntryParts(
  current: EntryParts,
  data: EditorEntryInput,
): EntryParts {
  if (data.repeat === "none") {
    return { data, exdates: [], overrides: {} };
  }
  return {
    data,
    exdates: current.exdates.filter((date) => isOccurrenceDate(data, date)),
    overrides: Object.fromEntries(
      Object.entries(current.overrides).filter(
        ([date, override]) =>
          isOccurrenceDate(data, date) && override.kind === data.kind,
      ),
    ),
  };
}

/** Removes one day of a series ("only this day"); drops an override of that day. */
export function addExceptionParts(
  current: EntryParts,
  date: string,
): EntryRuleResult<EntryParts> {
  const problem = dateKeyProblem(date) ?? occurrenceProblem(current.data, date);
  if (problem !== null) {
    return failed(problem);
  }
  return {
    ok: true,
    value: {
      data: current.data,
      exdates: [...new Set([...current.exdates, date])].sort(),
      overrides: Object.fromEntries(
        Object.entries(current.overrides).filter(([day]) => day !== date),
      ),
    },
  };
}

/**
 * Replaces one day of a series ("only this day") by a single entry of the same kind,
 * which may move to another day or time; re-instates the day if it was an exception.
 */
export function setOverrideParts(
  current: EntryParts,
  date: string,
  override: EditorEntryInput,
): EntryRuleResult<EntryParts> {
  const problem =
    dateKeyProblem(date) ??
    singleDayProblem(override) ??
    occurrenceProblem(current.data, date);
  if (problem !== null) {
    return failed(problem);
  }
  if (override.kind !== current.data.kind) {
    return failed(issue("kind", "A single day keeps the series' kind"));
  }
  return {
    ok: true,
    value: {
      data: current.data,
      exdates: current.exdates.filter((d) => d !== date),
      overrides: sortedRecord({ ...current.overrides, [date]: override }),
    },
  };
}

/**
 * Validates and normalises the entries of a backup document; collects every issue
 * (paths `entries.<i>.…`). Entries are checked for their shape only, not against a
 * config: a backup from before a config change is restored as it was. Exceptions are
 * de-duplicated and sorted, an exception with an override of the same day is dropped.
 * The result has one {@link EntryParts} per input entry, in order.
 */
export function importEntryParts(
  entries: readonly ImportEntryInput[],
): EntryRuleResult<EntryParts[]> {
  const issues: EditorIssue[] = [];
  const seen = new Set<string>();
  const parts: EntryParts[] = [];
  for (const [i, entry] of entries.entries()) {
    const at = `entries.${String(i)}`;
    if (seen.has(entry.id)) {
      issues.push(issue(`${at}.id`, "Duplicate entry id"));
    }
    seen.add(entry.id);
    const data = validateEntryShape(entry.data);
    if (!data.ok) {
      issues.push(...withPrefix(`${at}.data`, data.issues));
      continue;
    }
    const master = data.value;
    if (master.kind !== entry.kind) {
      issues.push(issue(`${at}.kind`, "kind must match data.kind"));
      continue;
    }
    for (const date of entry.exdates) {
      const problem = occurrenceProblem(master, date);
      if (problem !== null) {
        issues.push({ ...problem, path: `${at}.exdates` });
      }
    }
    const overrides: Record<string, EditorEntryInput> = {};
    for (const [date, raw] of Object.entries(entry.overrides)) {
      const path = `${at}.overrides.${date}`;
      const problem = occurrenceProblem(master, date);
      if (problem !== null) {
        issues.push({ ...problem, path });
        continue;
      }
      const override = validateEntryShape(raw);
      if (!override.ok) {
        issues.push(...withPrefix(path, override.issues));
      } else if (override.value.repeat !== "none") {
        issues.push(issue(`${path}.repeat`, "A single day cannot repeat"));
      } else if (override.value.kind !== master.kind) {
        issues.push(
          issue(`${path}.kind`, "A single day keeps the series' kind"),
        );
      } else {
        overrides[date] = override.value;
      }
    }
    parts.push({
      data: master,
      exdates: [...new Set(entry.exdates)]
        .filter((date) => overrides[date] === undefined)
        .sort(),
      overrides: sortedRecord(overrides),
    });
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: parts };
}
