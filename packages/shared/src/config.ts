import { z } from "zod";

import { CalendarSourceSchema, ChildSchema } from "./model";
import { EmojiSchema, TimeOfDaySchema, TimeZoneSchema } from "./primitives";

export const LocaleSchema = z.enum(["de", "en", "auto"]);
export type Locale = z.infer<typeof LocaleSchema>;

/**
 * Name of the secret that holds the iCal URL of calendar `id`.
 * Mapping: upper-case the id and replace `-` by `_`, e.g. `kinder` -> `CAL_KINDER_URL`,
 * `school-a` -> `CAL_SCHOOL_A_URL`. (Ids are restricted to `[a-z0-9_-]`.)
 */
export function calendarSecretName(id: string): string {
  return `CAL_${id.toUpperCase().replaceAll("-", "_")}_URL`;
}

function toMinutes(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

const DEFAULT_BANDS = {
  morningStart: "06:00",
  middayStart: "11:00",
  eveningStart: "17:00",
};

const BandsSchema = z
  .strictObject({
    morningStart: TimeOfDaySchema.default(DEFAULT_BANDS.morningStart),
    middayStart: TimeOfDaySchema.default(DEFAULT_BANDS.middayStart),
    eveningStart: TimeOfDaySchema.default(DEFAULT_BANDS.eveningStart),
  })
  .refine(
    (b) =>
      toMinutes(b.morningStart) < toMinutes(b.middayStart) &&
      toMinutes(b.middayStart) < toMinutes(b.eveningStart),
    {
      message:
        "Bands must be strictly ascending: morningStart < middayStart < eveningStart",
    },
  );

const DEFAULT_NIGHT_MODE = { enabled: true, start: "19:30", end: "06:30" };

/** Night mode window; `end` earlier than `start` means it spans midnight. */
const NightModeSchema = z
  .strictObject({
    enabled: z.boolean().default(DEFAULT_NIGHT_MODE.enabled),
    start: TimeOfDaySchema.default(DEFAULT_NIGHT_MODE.start),
    end: TimeOfDaySchema.default(DEFAULT_NIGHT_MODE.end),
  })
  .refine((n) => n.start !== n.end, { message: "start and end must differ" });

const DEFAULT_COUNTDOWN_EMOJIS = ["🎂", "🎉", "🎁", "🎄", "🐣", "✈️", "🏖️"];

const CountdownSchema = z.strictObject({
  emojis: z.array(EmojiSchema).default(DEFAULT_COUNTDOWN_EMOJIS),
});

export const AppConfigSchema = z
  .strictObject({
    locale: LocaleSchema.default("auto"),
    timeZone: TimeZoneSchema.default("Europe/Berlin"),
    children: z.array(ChildSchema).default([]),
    calendars: z
      .array(CalendarSourceSchema)
      .min(1, "At least one calendar is required"),
    bands: BandsSchema.default(DEFAULT_BANDS),
    nightMode: NightModeSchema.default(DEFAULT_NIGHT_MODE),
    countdown: CountdownSchema.default({ emojis: DEFAULT_COUNTDOWN_EMOJIS }),
    refreshMinutes: z.number().int().min(1).max(1440).default(60),
    autoReturnSeconds: z.number().int().min(10).max(3600).default(120),
  })
  .superRefine((config, ctx) => {
    const childIds = new Set<string>();
    const childNames = new Set<string>();
    config.children.forEach((child, i) => {
      if (childIds.has(child.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["children", i, "id"],
          message: `Duplicate child id "${child.id}"`,
        });
      }
      childIds.add(child.id);
      const name = child.name.toLowerCase();
      if (childNames.has(name)) {
        ctx.addIssue({
          code: "custom",
          path: ["children", i, "name"],
          message: `Duplicate child name "${child.name}" (names are compared case-insensitively)`,
        });
      }
      childNames.add(name);
    });

    const calendarIds = new Set<string>();
    const secretNames = new Map<string, string>();
    config.calendars.forEach((calendar, i) => {
      if (calendarIds.has(calendar.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["calendars", i, "id"],
          message: `Duplicate calendar id "${calendar.id}"`,
        });
      } else {
        const secret = calendarSecretName(calendar.id);
        const other = secretNames.get(secret);
        if (other !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["calendars", i, "id"],
            message: `Calendar id "${calendar.id}" maps to the same secret ${secret} as "${other}"`,
          });
        }
        secretNames.set(secret, calendar.id);
      }
      calendarIds.add(calendar.id);
      if (calendar.childId !== undefined && !childIds.has(calendar.childId)) {
        ctx.addIssue({
          code: "custom",
          path: ["calendars", i, "childId"],
          message: `Unknown child id "${calendar.childId}"`,
        });
      }
    });
  });

/** Validated config with all defaults applied. */
export type AppConfig = z.infer<typeof AppConfigSchema>;
/** Config as written by the user (defaults optional). */
export type AppConfigInput = z.input<typeof AppConfigSchema>;

export type ParseConfigResult =
  { ok: true; config: AppConfig } | { ok: false; errors: string[] };

function formatPath(path: readonly PropertyKey[]): string {
  let out = "";
  for (const segment of path) {
    out +=
      typeof segment === "number"
        ? `[${String(segment)}]`
        : `${out === "" ? "" : "."}${String(segment)}`;
  }
  return out === "" ? "(config)" : out;
}

/** Validates an unknown value (e.g. parsed `KIDBOARD_CONFIG`) and applies defaults. */
export function parseConfig(input: unknown): ParseConfigResult {
  const result = AppConfigSchema.safeParse(input);
  if (result.success) {
    return { ok: true, config: result.data };
  }
  return {
    ok: false,
    errors: result.error.issues.map(
      (issue) => `${formatPath(issue.path)}: ${issue.message}`,
    ),
  };
}

/** DTO served at `/api/config`. Secrets are not part of the config, so nothing is dropped today. */
export type PublicConfig = AppConfig;

/**
 * Builds the public config DTO. Fields are copied explicitly so that any future
 * internal-only field must be opted in deliberately.
 */
export function toPublicConfig(config: AppConfig): PublicConfig {
  return {
    locale: config.locale,
    timeZone: config.timeZone,
    children: config.children.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      avatar: c.avatar,
    })),
    calendars: config.calendars.map((c) => ({
      id: c.id,
      kind: c.kind,
      ...(c.childId === undefined ? {} : { childId: c.childId }),
      ...(c.label === undefined ? {} : { label: c.label }),
    })),
    bands: { ...config.bands },
    nightMode: { ...config.nightMode },
    countdown: { emojis: [...config.countdown.emojis] },
    refreshMinutes: config.refreshMinutes,
    autoReturnSeconds: config.autoReturnSeconds,
  };
}
