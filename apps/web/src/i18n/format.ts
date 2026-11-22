import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";

import { type AppLocale, FALLBACK_LOCALE, matchLocale } from "./locale";

const DATE_FNS_LOCALES = { de, en: enUS } as const;

export interface FormatContext {
  locale: AppLocale;
  /** IANA zone from the config; the device zone is never used. */
  timeZone: string;
}

type DateInput = Date | number | string;

function fmt(
  value: DateInput,
  pattern: string,
  { locale, timeZone }: FormatContext,
): string {
  return format(value, pattern, {
    locale: DATE_FNS_LOCALES[locale],
    in: tz(timeZone),
  });
}

/** Full weekday name, e.g. "Sonntag" / "Sunday". */
export function formatWeekday(value: DateInput, ctx: FormatContext): string {
  return fmt(value, "EEEE", ctx);
}

/** Long date, e.g. "26. Oktober 2025" / "October 26, 2025". */
export function formatLongDate(value: DateInput, ctx: FormatContext): string {
  return fmt(value, ctx.locale === "de" ? "d. MMMM yyyy" : "MMMM d, yyyy", ctx);
}

/** Day and month, e.g. "26. Oktober" / "October 26". */
export function formatDayMonth(value: DateInput, ctx: FormatContext): string {
  return fmt(value, ctx.locale === "de" ? "d. MMMM" : "MMMM d", ctx);
}

/** Wall-clock time, 24 h for `de` ("14:30"), 12 h for `en` ("2:30 PM"). */
export function formatTime(value: DateInput, ctx: FormatContext): string {
  return fmt(value, ctx.locale === "de" ? "HH:mm" : "h:mm a", ctx);
}

/** Formatting context bound to the active UI language and the given zone. */
export function useFormatContext(timeZone: string): FormatContext {
  const { i18n } = useTranslation();
  return { locale: matchLocale(i18n.language) ?? FALLBACK_LOCALE, timeZone };
}
