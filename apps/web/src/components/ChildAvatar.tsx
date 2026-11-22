import type { Child } from "@kidboard/shared";

import { childColorStyle } from "./childColor";
import { Emoji } from "./Emoji";

/** Round avatar in the child's colour. The emoji carries the name, not only colour. */
export function ChildAvatar({
  child,
  className = "size-8 text-body",
  decorative = false,
}: {
  child: Child;
  /** True when the name is visible next to the avatar (hides the emoji from AT). */
  decorative?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      style={childColorStyle(child.color)}
      className={`rounded-pill inline-flex shrink-0 items-center justify-center bg-(--child-color) ${className}`}
    >
      <Emoji emoji={child.avatar} label={decorative ? undefined : child.name} />
    </span>
  );
}
