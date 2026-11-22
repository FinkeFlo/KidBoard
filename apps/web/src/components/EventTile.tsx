import type { CalendarEvent, Child } from "@kidboard/shared";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { type FormatContext, formatTime } from "../i18n/format";
import { ChildAvatar } from "./ChildAvatar";
import { childColorStyle } from "./childColor";
import { Emoji } from "./Emoji";

export type EventStatus = "upcoming" | "current" | "past";

export interface EventTileProps {
  event: CalendarEvent;
  /** Configured children; `event.childIds` are looked up here (unknown ids skipped). */
  childList: readonly Child[];
  format: FormatContext;
  /** Relative to now; computed by the caller (the tile is presentational). */
  status?: EventStatus;
  /** Timed event that began on an earlier day: shows "continues" instead of the start. */
  continues?: boolean;
}

const STATUS_CLASSES: Record<EventStatus, string> = {
  upcoming: "bg-surface-raised text-text shadow-card",
  current: "bg-surface-raised text-text shadow-raised ring-accent ring-4",
  // Receded via surface/text tokens, not opacity (keeps WCAG AA contrast).
  past: "bg-surface-sunken text-text-muted",
};

export function EventTile({
  event,
  childList,
  format,
  status = "upcoming",
  continues = false,
}: EventTileProps): React.JSX.Element {
  const { t } = useTranslation();
  const titleId = useId();
  const kids = event.childIds.flatMap((id) => {
    const child = childList.find((c) => c.id === id);
    return child === undefined ? [] : [child];
  });
  return (
    <article
      aria-labelledby={titleId}
      data-status={status}
      data-all-day={event.allDay}
      style={childColorStyle(kids[0]?.color)}
      className={`${STATUS_CLASSES[status]} min-h-touch rounded-tile flex items-center gap-3 border-s-8 border-(color:--child-color) p-3`}
    >
      <Emoji emoji={event.icon} className="text-display" />
      <div className="min-w-0 flex-1">
        <p
          id={titleId}
          className="text-body line-clamp-2 font-bold break-words"
        >
          {event.title}
        </p>
        <p className="text-caption text-text-muted">
          {event.allDay
            ? t("event.allDay")
            : continues
              ? t("event.continues")
              : formatTime(event.start, format)}
        </p>
        {/* Also when every id is unconfigured: no avatar is shown, so it reads as "everyone". */}
        {kids.length === 0 && (
          <p className="sr-only">{t("event.forEveryone")}</p>
        )}
        {status !== "upcoming" && (
          <p className="sr-only">{t(`event.status.${status}`)}</p>
        )}
      </div>
      {kids.length > 0 && (
        <ul className="flex shrink-0 flex-col gap-1">
          {kids.map((child) => (
            <li key={child.id}>
              <ChildAvatar child={child} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
