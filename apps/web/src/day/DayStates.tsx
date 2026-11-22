import { useTranslation } from "react-i18next";

import { Emoji } from "../components/Emoji";

/** Placeholder with the day view's layout while nothing is known yet. */
export function DayLoading(): React.JSX.Element {
  const { t } = useTranslation();
  const block = "bg-surface-sunken rounded-card motion-safe:animate-pulse";
  return (
    <main
      aria-busy="true"
      className="bg-surface text-text gap-gutter p-gutter flex h-full flex-col"
    >
      <p role="status" className="sr-only">
        {t("day.loading")}
      </p>
      <div aria-hidden="true" className="flex shrink-0 flex-col gap-2">
        <div className={`${block} h-14 w-1/3`} />
        <div className={`${block} h-8 w-1/4`} />
      </div>
      <div
        aria-hidden="true"
        className="gap-gutter grid min-h-0 flex-1 grid-cols-3"
      >
        <div className={block} />
        <div className={block} />
        <div className={block} />
      </div>
    </main>
  );
}

/** Friendly illustration for a day without events and meals. */
export function DayEmpty(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      data-testid="day-empty"
      className="gap-gutter flex min-h-0 flex-1 flex-col items-center justify-center text-center"
    >
      <Emoji emoji="🏖️" className="text-display" />
      <h2 className="text-heading font-bold">{t("day.empty.title")}</h2>
      <p className="text-title text-text-muted">{t("day.empty.hint")}</p>
    </div>
  );
}

export type DayErrorKind = "unauthorized" | "offline" | "failed";

/**
 * Nothing to show and no cached state: calm for children (big emoji, short sentence),
 * with the actual reason in small text for the parent.
 */
export function DayError({ kind }: { kind: DayErrorKind }): React.JSX.Element {
  const { t } = useTranslation();
  const detail =
    kind === "unauthorized"
      ? t("status.unauthorized")
      : kind === "offline"
        ? t("status.offline")
        : t("status.error");
  return (
    <main className="bg-surface text-text p-page flex h-full flex-col items-center justify-center">
      <div
        role={kind === "offline" ? "status" : "alert"}
        data-error={kind}
        className="gap-gutter flex flex-col items-center text-center"
      >
        <Emoji emoji="🌥️" className="text-display" />
        <h1 className="text-heading font-bold">{t("day.error.title")}</h1>
        <p className="text-title text-text-muted">{t("day.error.hint")}</p>
        <p className="text-body bg-notice text-on-notice rounded-card max-w-prose px-5 py-3 font-bold">
          {detail}
        </p>
      </div>
    </main>
  );
}
