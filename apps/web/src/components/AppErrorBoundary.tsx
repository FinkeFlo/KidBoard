import type { ReactNode } from "react";
import {
  ErrorBoundary,
  type FallbackProps,
  getErrorMessage,
} from "react-error-boundary";
import { useTranslation } from "react-i18next";

function ErrorFallback({
  error,
  resetErrorBoundary,
}: FallbackProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <main
      role="alert"
      className="bg-surface text-text gap-gutter p-page flex h-full flex-col items-center justify-center text-center"
    >
      <span aria-hidden="true" className="text-display">
        🌙
      </span>
      <h1 className="text-heading font-bold">{t("error.title")}</h1>
      <p className="text-title text-text-muted">{t("error.hint")}</p>
      <button
        type="button"
        onClick={resetErrorBoundary}
        className="bg-accent text-on-accent text-title rounded-pill min-h-touch min-w-touch px-page font-bold"
      >
        {t("error.retry")}
      </button>
      {/* Technical detail for the parent; plain text only. */}
      <p className="text-caption text-text-muted">{getErrorMessage(error)}</p>
    </main>
  );
}

function logError(error: unknown): void {
  console.error("KidBoard render error", error);
}

export function AppErrorBoundary({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onError={logError}>
      {children}
    </ErrorBoundary>
  );
}
