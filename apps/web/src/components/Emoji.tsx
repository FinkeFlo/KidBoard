/**
 * Single seam for emoji rendering (ADR-0009): native system emoji today, an asset set
 * later. With a `label` the emoji is an image for assistive tech (`role="img"`);
 * without one it is purely decorative and hidden from them.
 */
export interface EmojiProps {
  emoji: string;
  /** Accessible name, e.g. the event title. Omit when text next to it says the same. */
  label?: string | undefined;
  className?: string;
}

export function Emoji({
  emoji,
  label,
  className = "",
}: EmojiProps): React.JSX.Element {
  const labelled = label !== undefined && label.trim() !== "";
  return (
    <span
      role={labelled ? "img" : undefined}
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : true}
      className={`font-emoji leading-none ${className}`.trim()}
    >
      {emoji}
    </span>
  );
}
