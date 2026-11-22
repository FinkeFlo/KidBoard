import type { Child } from "@kidboard/shared";
import { useTranslation } from "react-i18next";

import { ChildAvatar } from "./ChildAvatar";

/** Who-is-who legend: avatar in the child's colour plus the name. Not interactive. */
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
      className="flex min-w-0 flex-wrap items-center justify-end gap-2"
    >
      {childList.map((child) => (
        <li
          key={child.id}
          className="bg-surface-raised text-text rounded-pill shadow-card flex items-center gap-2 py-1 ps-1 pe-4"
        >
          <ChildAvatar
            decorative
            child={child}
            className="text-title size-10"
          />
          <span className="text-body font-bold">{child.name}</span>
        </li>
      ))}
    </ul>
  );
}
