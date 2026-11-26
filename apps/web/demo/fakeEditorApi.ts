import {
  addCalendarDays,
  addExceptionParts,
  type AppEntryDto,
  BOARD_REFRESH_NOW,
  buildTemplates,
  calendarDaysBetween,
  type CalendarEvent,
  compareItems,
  EDITOR_TEMPLATE_DAYS_AFTER,
  EDITOR_TEMPLATE_DAYS_BEFORE,
  type EditorAppItem,
  type EditorEntryInput,
  EditorEntryInputSchema,
  type EditorGoogleItem,
  type EditorIssue,
  type EditorListResponse,
  ENTRY_EXPORT_FORMAT,
  ENTRY_EXPORT_VERSION,
  entryDateRange,
  type EntryParts,
  formatInstant,
  googleEventItem,
  googleMealItem,
  importEntryParts,
  ImportModeSchema,
  isOccurrenceDate,
  MAX_AGENDA_DAYS,
  MAX_APP_ENTRIES,
  type Meal,
  type ParentWeatherResponse,
  parseEditorEntryInput,
  type PublicConfig,
  resolveTimedRange,
  setOverrideParts,
  splitResolvable,
  todayInZone,
  updateEntryParts,
  type WeatherSetting,
  WeatherSettingSchema,
  type WeatherSettingStatus,
  WINDOW_DAYS_AFTER,
  WINDOW_DAYS_BEFORE,
} from "@kidboard/shared";
import { z } from "zod";

/*
 * An in-memory stand-in for the editor API of the worker (`/api/parent/entries`,
 * `/templates`, `/export`, `/import`; docs/ARCHITECTURE.md "Editor API (T-43)"), used
 * by the demo server (`pnpm dev:demo`) and the e2e mock. It validates with the same
 * shared model (`parseEditorEntryInput`) and the same shared entry rules as the
 * worker's store (`updateEntryParts`, `addExceptionParts`, `setOverrideParts`,
 * `importEntryParts`), answers with the same shapes and error codes
 * (409 `conflict` with `revision`, 422 `invalid_entry` with `issues`, 422
 * `limit_reached`, 404 `not_found`) and expands weekly series with exceptions and
 * "only this day" overrides. It also keeps the weather setting of `/api/parent/weather`
 * (T-56: editor setting over the config's block, `{ off: true }` wins). Unlock and
 * session are the caller's (`isSession`). Not
 * part of the app bundle; all data is synthetic and lives only in memory.
 */

export interface FakeRequest {
  method: string;
  /** Path without query, e.g. `/api/parent/entries/abc`. */
  path: string;
  /** Query string with or without `?`. */
  search: string;
  /** Raw request body, `null` without one. */
  body: string | null;
  /** Value of the `X-KidBoard-Parent` header, `null` without one. */
  session: string | null;
}

export interface FakeResponse {
  status: number;
  json: unknown;
  headers?: Record<string, string>;
}

export interface DateRange {
  from: string;
  /** Exclusive. */
  to: string;
}

export interface FakeEditorOptions {
  config: () => PublicConfig;
  /** Whether a session header is valid (else 403 `parent_locked`). */
  isSession: (token: string | null) => boolean;
  /** Epoch ms; default `Date.now`. */
  now?: () => number;
  /** Read-only Google occurrences of a range (list and templates). */
  google?: (range: DateRange) => { events: CalendarEvent[]; meals: Meal[] };
  /** Entry limit (default: the worker's `MAX_APP_ENTRIES`). */
  maxEntries?: number;
  /** Relative phone-feed URL `/api/parent/feed` answers with; none = the feed is off. */
  feedUrl?: string;
  /**
   * The config's weather block as `/api/parent/weather` describes it (default: none),
   * e.g. `{ place: "…", unit: "celsius" }` or `{ unit: "celsius", coordinates: true }`.
   */
  configWeather?: NonNullable<ParentWeatherResponse["weather"]>;
}

export interface FakeEditor {
  /** Answers an editor route; `null` for any other path. */
  handle(request: FakeRequest): FakeResponse | null;
  /** The stored entries (copies). */
  entries(): AppEntryDto[];
  /** Stores an entry directly (test and demo setup), validated like `POST`. */
  seed(
    data: unknown,
    extra?: { exdates?: string[]; overrides?: Record<string, unknown> },
  ): AppEntryDto;
  /** The next request with this method (and path prefix) gets `response` instead. */
  failNext(method: string, response: FakeResponse, pathPrefix?: string): void;
  /** When true, the list answers like a worker without D1 (`storageUnavailable`). */
  setStorageUnavailable(value: boolean): void;
  /** Turns the phone feed on (a relative URL) or off (`undefined`). */
  setFeedUrl(feedUrl: string | undefined): void;
  /** The stored weather setting (`null`: the config's block applies). */
  weatherSetting(): WeatherSetting | null;
  /**
   * Whether the board's weather is on: the stored setting if any, else `configOn` (the
   * board API's `config.weather`).
   */
  weatherOn(configOn: boolean): boolean;
  /** What resolving a town answers from now on (default `ok`). */
  setWeatherStatus(status: Exclude<WeatherSettingStatus, "off">): void;
  /** The app entries of `range` as board events and meals (`/api/agenda`). */
  agendaItems(range: DateRange): { events: CalendarEvent[]; meals: Meal[] };
  /** Every write request seen (method, path, query, parsed body). */
  writes: { method: string; path: string; query: string; body: unknown }[];
}

/** The envelope of a backup document; entries are checked by `importEntryParts`. */
const ImportDocumentSchema = z.object({
  format: z.literal(ENTRY_EXPORT_FORMAT),
  version: z.literal(ENTRY_EXPORT_VERSION),
  entries: z.array(
    z.object({
      id: z.string().min(1),
      revision: z.number().int().min(1),
      kind: z.enum(["event", "meal"]),
      data: z.unknown(),
      exdates: z.array(z.iso.date()).default([]),
      overrides: z.record(z.iso.date(), z.unknown()).default({}),
      createdAt: z.iso.datetime({ offset: true }),
      updatedAt: z.iso.datetime({ offset: true }),
    }),
  ),
});

function error(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
): FakeResponse {
  return { status, json: { error: code, message: code, ...extra } };
}

/** 422 `invalid_entry` with at most 50 issues, like the worker. */
function invalidEntry(issues: readonly EditorIssue[]): FakeResponse {
  return error(422, "invalid_entry", { issues: issues.slice(0, 50) });
}

/** The occurrence of a series on `date`: the rule's fields moved to that day. */
function movedTo(data: EditorEntryInput, date: string): EditorEntryInput {
  const shift = calendarDaysBetween(data.date, date);
  return {
    ...data,
    date,
    ...(data.endDate === undefined
      ? {}
      : { endDate: addCalendarDays(data.endDate, shift) }),
  };
}

interface Occurrence {
  /** Original date for series, `null` for single entries. */
  occurrenceDate: string | null;
  shown: EditorEntryInput;
  override: EditorEntryInput | null;
}

function occurrencesOf(entry: AppEntryDto, range: DateRange): Occurrence[] {
  const data = entry.data;
  if (data.repeat === "none") {
    return data.date >= range.from && data.date < range.to
      ? [{ occurrenceDate: null, shown: data, override: null }]
      : [];
  }
  const out: Occurrence[] = [];
  // Overrides may move a day into or out of the range: look one week around it.
  const start = addCalendarDays(
    data.date > range.from ? data.date : range.from,
    -7,
  );
  const end = addCalendarDays(range.to, 7);
  for (let date = start; date < end; date = addCalendarDays(date, 1)) {
    if (!isOccurrenceDate(data, date) || entry.exdates.includes(date)) continue;
    const override = entry.overrides[date] ?? null;
    const shown = override ?? movedTo(data, date);
    if (shown.date >= range.from && shown.date < range.to) {
      out.push({ occurrenceDate: date, shown, override });
    }
  }
  return out;
}

function timesOf(
  shown: EditorEntryInput,
  timeZone: string,
): { start: string; end: string } {
  if (shown.allDay || shown.startTime === undefined) {
    return {
      start: shown.date,
      end: shown.endDate ?? addCalendarDays(shown.date, 1),
    };
  }
  const range = resolveTimedRange(
    {
      date: shown.date,
      startTime: shown.startTime,
      endTime: shown.endTime,
      endDate: shown.endDate,
    },
    timeZone,
  );
  return {
    start: formatInstant(range.startMs, timeZone),
    end: formatInstant(range.endMs, timeZone),
  };
}

function appItem(
  entry: AppEntryDto,
  occurrence: Occurrence,
  timeZone: string,
): EditorAppItem {
  const { shown } = occurrence;
  return {
    origin: "app",
    id:
      occurrence.occurrenceDate === null
        ? entry.id
        : `${entry.id}/${occurrence.occurrenceDate}`,
    entryId: entry.id,
    revision: entry.revision,
    entry: entry.data,
    occurrenceDate: occurrence.occurrenceDate,
    override: occurrence.override,
    kind: shown.kind,
    icon: shown.icon,
    title: shown.title,
    childIds: [...shown.childIds],
    allDay: shown.allDay,
    ...timesOf(shown, timeZone),
    date: shown.date,
    ...(shown.slot === undefined ? {} : { slot: shown.slot }),
    bring: [...shown.bring],
    countdown: shown.countdown,
  };
}

function googleItems(google: {
  events: CalendarEvent[];
  meals: Meal[];
}): EditorGoogleItem[] {
  return [
    ...google.events.map(googleEventItem),
    ...google.meals.map(googleMealItem),
  ];
}

function parseQuery(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function parseJson(body: string | null): { ok: true; value: unknown } | null {
  try {
    return { ok: true, value: JSON.parse(body ?? "") as unknown };
  } catch {
    return null;
  }
}

export function createFakeEditor(options: FakeEditorOptions): FakeEditor {
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? MAX_APP_ENTRIES;
  const store = new Map<string, AppEntryDto>();
  const failures: { method: string; prefix: string; response: FakeResponse }[] =
    [];
  const writes: FakeEditor["writes"] = [];
  let feedUrl: string | undefined = options.feedUrl;
  let storageUnavailable = false;
  let weatherSetting: WeatherSetting | null = null;
  let weatherStatus: Exclude<WeatherSettingStatus, "off"> = "ok";

  const config = (): PublicConfig => options.config();
  const today = (): string => todayInZone(now(), config().timeZone);
  const stamp = (): string => new Date(now()).toISOString();
  /** Stored entries with a day in `range`, split like the worker's list does. */
  const stored = (
    range: DateRange,
  ): ReturnType<typeof splitResolvable<AppEntryDto>> =>
    splitResolvable(
      [...store.values()].filter((entry) => {
        const days = entryDateRange(entry.data, entry.overrides);
        return (
          days.first < range.to &&
          (days.last === null || days.last >= range.from)
        );
      }),
      config(),
    );

  const validate = (
    value: unknown,
  ):
    | { ok: true; entry: EditorEntryInput }
    | { ok: false; response: FakeResponse } => {
    const result = parseEditorEntryInput(value, config());
    return result.ok
      ? { ok: true, entry: result.entry }
      : { ok: false, response: invalidEntry(result.issues) };
  };

  const create = (
    data: EditorEntryInput,
    extra: {
      exdates?: string[];
      overrides?: Record<string, EditorEntryInput>;
    } = {},
  ): AppEntryDto => {
    const at = stamp();
    const entry: AppEntryDto = {
      id: crypto.randomUUID(),
      revision: 1,
      kind: data.kind,
      data,
      exdates: [...(extra.exdates ?? [])].sort(),
      overrides: { ...extra.overrides },
      createdAt: at,
      updatedAt: at,
    };
    store.set(entry.id, entry);
    return entry;
  };

  const appItems = (range: DateRange): EditorAppItem[] => {
    const timeZone = config().timeZone;
    return stored(range).resolvable.flatMap((entry) =>
      occurrencesOf(entry, range).map((occurrence) =>
        appItem(entry, occurrence, timeZone),
      ),
    );
  };

  const list = (query: URLSearchParams): FakeResponse => {
    const day = today();
    const from = query.get("from") ?? day;
    const days = Number(query.get("days") ?? "8");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !Number.isInteger(days) ||
      days < 1 ||
      days > MAX_AGENDA_DAYS
    ) {
      return error(400, "bad_request");
    }
    const range = { from, to: addCalendarDays(from, days) };
    if (
      range.from < addCalendarDays(day, -WINDOW_DAYS_BEFORE) ||
      range.to > addCalendarDays(day, WINDOW_DAYS_AFTER)
    ) {
      return error(400, "bad_request");
    }
    const timeZone = config().timeZone;
    const google = options.google?.(range) ?? { events: [], meals: [] };
    const body: EditorListResponse = {
      timeZone,
      range,
      sources: config().calendars.map((calendar) => ({
        id: calendar.id,
        status: "ok" as const,
      })),
      items: [
        ...(storageUnavailable ? [] : appItems(range)),
        ...googleItems(google),
      ].sort((a, b) => compareItems(a, b, timeZone)),
      unresolved: storageUnavailable ? [] : stored(range).unresolved,
      storageUnavailable,
    };
    return { status: 200, json: body };
  };

  const templates = (): FakeResponse => {
    const day = today();
    const timeZone = config().timeZone;
    const range = {
      from: addCalendarDays(day, -EDITOR_TEMPLATE_DAYS_BEFORE),
      to: addCalendarDays(day, EDITOR_TEMPLATE_DAYS_AFTER),
    };
    const google = options.google?.(range) ?? { events: [], meals: [] };
    return {
      status: 200,
      json: {
        templates: buildTemplates(
          [...appItems(range), ...googleItems(google)],
          now(),
          timeZone,
        ),
      },
    };
  };

  const written = (entry: AppEntryDto | null, status = 200): FakeResponse => ({
    status,
    json: { entry, boardRefresh: BOARD_REFRESH_NOW },
  });

  /** Stores the changed parts as the entry's next revision. */
  const save = (entry: AppEntryDto, parts: EntryParts): FakeResponse => {
    const next: AppEntryDto = {
      ...entry,
      ...parts,
      kind: parts.data.kind,
      revision: entry.revision + 1,
      updatedAt: stamp(),
    };
    store.set(entry.id, next);
    return written(next);
  };

  const handleEntry = (
    request: FakeRequest,
    id: string,
    query: URLSearchParams,
  ): FakeResponse => {
    const entry = store.get(id);
    const scope = query.get("scope") ?? "series";
    const date = query.get("date");
    if (scope !== "one" && scope !== "series") return error(400, "bad_request");
    if (scope === "one" && date === null) return error(400, "bad_request");
    if (request.method === "PATCH") {
      const body = parseJson(request.body);
      const parsed = z
        .object({ revision: z.number().int().min(1), entry: z.unknown() })
        .safeParse(body?.value);
      if (!parsed.success) return error(400, "bad_request");
      if (entry === undefined) return error(404, "not_found");
      if (parsed.data.revision !== entry.revision) {
        return error(409, "conflict", { revision: entry.revision });
      }
      const valid = validate(parsed.data.entry);
      if (!valid.ok) return valid.response;
      if (scope === "one" && date !== null) {
        const parts = setOverrideParts(entry, date, valid.entry);
        return parts.ok ? save(entry, parts.value) : invalidEntry(parts.issues);
      }
      return save(entry, updateEntryParts(entry, valid.entry));
    }
    if (request.method === "DELETE") {
      const revision = Number(query.get("revision"));
      if (!Number.isInteger(revision) || revision < 1) {
        return error(400, "bad_request");
      }
      if (entry === undefined) return error(404, "not_found");
      if (revision !== entry.revision) {
        return error(409, "conflict", { revision: entry.revision });
      }
      if (scope === "one" && date !== null) {
        const parts = addExceptionParts(entry, date);
        return parts.ok ? save(entry, parts.value) : invalidEntry(parts.issues);
      }
      store.delete(id);
      return written(null);
    }
    return error(404, "not_found");
  };

  const importDocument = (
    request: FakeRequest,
    query: URLSearchParams,
  ): FakeResponse => {
    const mode = ImportModeSchema.safeParse(query.get("mode"));
    if (!mode.success) return error(400, "bad_request");
    const doc = ImportDocumentSchema.safeParse(parseJson(request.body)?.value);
    if (!doc.success) {
      return invalidEntry(
        doc.error.issues.map((issue) => ({
          code: "invalid",
          path: issue.path.map(String).join("."),
          message: issue.message,
        })),
      );
    }
    const prepared = importEntryParts(doc.data.entries);
    if (!prepared.ok) return invalidEntry(prepared.issues);
    // Like the worker: `updated` = ids stored before the import, in either mode.
    const updated = doc.data.entries.filter((entry) =>
      store.has(entry.id),
    ).length;
    if (mode.data === "replace") store.clear();
    for (const [i, parts] of prepared.value.entries()) {
      const entry = doc.data.entries[i];
      if (entry === undefined) continue;
      store.set(entry.id, { ...entry, ...parts });
    }
    return {
      status: 200,
      json: {
        mode: mode.data,
        imported: doc.data.entries.length,
        created: doc.data.entries.length - updated,
        updated,
        boardRefresh: BOARD_REFRESH_NOW,
      },
    };
  };

  /** `/api/parent/weather` answer for the current setting (as the worker's shape). */
  const weatherAnswer = (): FakeResponse => {
    const fromConfig = options.configWeather;
    let body: ParentWeatherResponse;
    if (weatherSetting !== null) {
      body =
        "off" in weatherSetting
          ? { source: "editor", weather: null, status: "off" }
          : {
              source: "editor",
              weather: { ...weatherSetting },
              status: weatherStatus,
            };
    } else if (fromConfig === undefined) {
      body = { source: "none", weather: null, status: "off" };
    } else {
      body = { source: "config", weather: { ...fromConfig }, status: "ok" };
    }
    return { status: 200, json: body };
  };

  const weatherRoute = (request: FakeRequest): FakeResponse => {
    if (request.method === "GET") return weatherAnswer();
    if (request.method === "DELETE") {
      weatherSetting = null;
      return weatherAnswer();
    }
    if (request.method === "PUT") {
      const parsed = WeatherSettingSchema.safeParse(
        parseJson(request.body)?.value,
      );
      if (!parsed.success) return error(400, "bad_request");
      weatherSetting = parsed.data;
      return weatherAnswer();
    }
    return error(404, "not_found");
  };

  const route = (request: FakeRequest): FakeResponse | null => {
    const query = parseQuery(request.search);
    const { method, path } = request;
    if (path === "/api/parent/entries") {
      if (method === "GET") return list(query);
      if (method === "POST") {
        const body = parseJson(request.body);
        if (body === null) return error(400, "bad_request");
        const valid = validate(body.value);
        if (!valid.ok) return valid.response;
        if (store.size >= maxEntries) {
          return error(422, "limit_reached", { limit: "entries" });
        }
        return written(create(valid.entry), 201);
      }
      return error(404, "not_found");
    }
    const match = /^\/api\/parent\/entries\/([^/]+)$/.exec(path);
    if (match?.[1] !== undefined) {
      return handleEntry(request, decodeURIComponent(match[1]), query);
    }
    if (path === "/api/parent/templates" && method === "GET")
      return templates();
    if (path === "/api/parent/weather") return weatherRoute(request);
    if (path === "/api/parent/feed" && method === "GET") {
      return {
        status: 200,
        json: feedUrl === undefined ? {} : { feedUrl },
      };
    }
    if (path === "/api/parent/export" && method === "GET") {
      return {
        status: 200,
        headers: {
          "Content-Disposition": `attachment; filename="kidboard-entries-${today()}.json"`,
        },
        json: {
          format: ENTRY_EXPORT_FORMAT,
          version: ENTRY_EXPORT_VERSION,
          exportedAt: stamp(),
          entries: [...store.values()],
        },
      };
    }
    if (path === "/api/parent/import" && method === "POST") {
      return importDocument(request, query);
    }
    return null;
  };

  return {
    handle(request) {
      const isEditorRoute =
        /^\/api\/parent\/(entries|templates|export|import|feed|weather)(\/|$)/.test(
          request.path,
        );
      if (!isEditorRoute) return null;
      if (!options.isSession(request.session)) {
        return error(403, "parent_locked");
      }
      if (request.method !== "GET") {
        writes.push({
          method: request.method,
          path: request.path,
          query: parseQuery(request.search).toString(),
          body: parseJson(request.body)?.value ?? null,
        });
      }
      const failure = failures.findIndex(
        (f) => f.method === request.method && request.path.startsWith(f.prefix),
      );
      if (failure !== -1) {
        const [next] = failures.splice(failure, 1);
        if (next !== undefined) return next.response;
      }
      return route(request);
    },
    entries: () => [...store.values()].map((entry) => structuredClone(entry)),
    seed(data, extra = {}) {
      const valid = parseEditorEntryInput(data, config());
      if (!valid.ok) {
        throw new Error(`Invalid seed entry: ${JSON.stringify(valid.issues)}`);
      }
      const overrides: Record<string, EditorEntryInput> = {};
      for (const [date, value] of Object.entries(extra.overrides ?? {})) {
        overrides[date] = EditorEntryInputSchema.parse(value);
      }
      return create(valid.entry, {
        ...(extra.exdates === undefined ? {} : { exdates: extra.exdates }),
        overrides,
      });
    },
    setFeedUrl(value) {
      feedUrl = value;
    },
    failNext(method, response, pathPrefix = "/api/parent/") {
      failures.push({ method, prefix: pathPrefix, response });
    },
    setStorageUnavailable(value) {
      storageUnavailable = value;
    },
    weatherSetting: () =>
      weatherSetting === null ? null : structuredClone(weatherSetting),
    weatherOn: (configOn) =>
      weatherSetting === null ? configOn : !("off" in weatherSetting),
    setWeatherStatus(status) {
      weatherStatus = status;
    },
    agendaItems(range) {
      const items = appItems(range);
      return {
        events: items
          .filter((item) => item.kind === "event")
          .map((item): CalendarEvent => ({
            id: `app-${item.id}`,
            sourceId: "app-events",
            title: item.title,
            icon: item.icon,
            iconIsFallback: false,
            childIds: item.childIds,
            allDay: item.allDay,
            start: item.start,
            end: item.end,
            countdown: item.countdown,
            ...(item.bring.length > 0 ? { bring: item.bring } : {}),
          })),
        meals: items
          .filter((item) => item.kind === "meal")
          .map((item): Meal => ({
            id: `app-${item.id}`,
            sourceId: "app-meals",
            date: item.date,
            slot: item.slot ?? "unspecified",
            title: item.title,
            icon: item.icon,
            iconIsFallback: false,
          })),
      };
    },
    writes,
  };
}
