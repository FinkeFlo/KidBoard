import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Emoji } from "../components/Emoji";
import type { EditorFailure } from "./failure";
import { TID } from "./testIds";
import { EditorButton } from "./ui";

/**
 * A calm problem message in the editor (no red surface, no raw error text): one
 * sentence for the parent, the short `KB-*` code and optional actions. Announced once
 * (`role="alert"`).
 */
export function FailureNotice({
  failure,
  onRetry,
  onUnlock,
  "data-testid": testId = "editor-failure",
}: {
  failure: EditorFailure;
  onRetry?: (() => void) | undefined;
  /** For `locked`: show the PIN pad again (the form stays). */
  onUnlock?: (() => void) | undefined;
  "data-testid"?: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      data-testid={testId}
      data-failure={failure.kind}
      className="bg-notice text-on-notice rounded-tile flex flex-wrap items-center gap-3 px-4 py-3"
    >
      <Emoji emoji="🧸" className="text-[1.75rem]" />
      <p className="text-body min-w-0 flex-1 font-bold">
        {t(`editor.error.${failure.kind}`)}{" "}
        <span className="text-caption whitespace-nowrap">
          {t("error.code", { code: failure.code })}
        </span>
      </p>
      {failure.kind === "locked" && onUnlock !== undefined && (
        <EditorButton tone="primary" onClick={onUnlock}>
          {t("editor.action.unlockAgain")}
        </EditorButton>
      )}
      {onRetry !== undefined && failure.kind !== "locked" && (
        <EditorButton onClick={onRetry}>
          {t("editor.action.retry")}
        </EditorButton>
      )}
    </div>
  );
}

/** How long a toast stays. */
export const TOAST_MS = 4000;

/** A short, calm confirmation ("Saved") in a polite live region; hides itself. */
export function Toast({
  message,
  onDone,
}: {
  message: string | null;
  onDone: () => void;
}): React.JSX.Element {
  useEffect(() => {
    if (message === null) return undefined;
    const timer = setTimeout(onDone, TOAST_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [message, onDone]);
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={TID.editorToast}
      className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center"
    >
      {message !== null && (
        <p className="bg-nav-active text-on-nav-active rounded-pill shadow-raised text-body px-6 py-3 font-extrabold">
          {message}
        </p>
      )}
    </div>
  );
}
