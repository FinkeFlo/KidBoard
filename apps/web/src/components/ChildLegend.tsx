import type { Child } from "@kidboard/shared";
import { useTranslation } from "react-i18next";

import { ChildAvatar } from "./ChildAvatar";

/** Who-is-who legend: avatar in the child's colour plus the name. */
export function ChildLegend({
  childList,
}: {
  childList: readonly Child[];
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (childList.length === 0) return null;
  return (
    <ul
      aria-label={t("legend.label")}
      className="gap-gutter flex flex-wrap items-center"
    >
      {childList.map((child) => (
        <li
          key={child.id}
          className="bg-surface-raised text-text min-h-touch rounded-pill shadow-card flex items-center gap-3 py-2 ps-2 pe-5"
        >
          <ChildAvatar
            decorative
            child={child}
            className="text-title size-12"
          />
          <span className="text-body font-bold">{child.name}</span>
        </li>
      ))}
    </ul>
  );
}
