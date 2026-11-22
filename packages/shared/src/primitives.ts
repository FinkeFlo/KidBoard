import { z } from "zod";

/** Calendar date `YYYY-MM-DD`. */
export const DateStringSchema = z.iso.date();

/** ISO 8601 date-time that carries an offset (`Z` or `+02:00`). */
export const DateTimeStringSchema = z.iso.datetime({ offset: true });

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Time of day `HH:mm` (24 h, zero padded). */
export const TimeOfDaySchema = z
  .string()
  .regex(HH_MM, 'Expected time as "HH:mm" (00:00-23:59)');

/** Slug used for child and calendar ids: lower case letters, digits, `_` and `-`. */
export const SlugSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9_-]{0,31}$/,
    "Expected 1-32 characters of a-z, 0-9, '_' or '-', starting with a letter or digit",
  );

/** Returns true if `timeZone` is an IANA zone known to the runtime (Node, browsers, workerd). */
export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.trim() === "") {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** IANA time zone name such as `Europe/Berlin`. */
export const TimeZoneSchema = z.string().refine(isValidTimeZone, {
  message: "Expected a valid IANA time zone, e.g. Europe/Berlin",
});

const EMOJI_PART = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;

/** True if `value` is exactly one grapheme cluster that looks like an emoji. */
export function isSingleEmoji(value: string): boolean {
  const graphemes = [
    ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
      value,
    ),
  ];
  return graphemes.length === 1 && EMOJI_PART.test(value);
}

/** A single emoji (one grapheme cluster, ZWJ sequences and flags allowed). */
export const EmojiSchema = z
  .string()
  .refine(isSingleEmoji, { message: "Expected a single emoji" });
