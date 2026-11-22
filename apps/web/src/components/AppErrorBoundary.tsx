import type { ReactNode } from "react";
import {
  ErrorBoundary,
  type FallbackProps,
  getErrorMessage,
} from "react-error-boundary";

import { PLACEHOLDER_TEXT } from "../placeholder-text";

function ErrorFallback({
  error,
  resetErrorBoundary,
}: FallbackProps): React.JSX.Element {
  return (
    <main
      role="alert"
      className="bg-surface text-text gap-gutter p-page flex h-full flex-col items-center justify-center text-center"
    >
      <span aria-hidden="true" className="text-display">
        🌙
      </span>
      <h1 className="text-heading font-bold">{PLACEHOLDER_TEXT.errorTitle}</h1>
      <p className="text-title text-text-muted">{PLACEHOLDER_TEXT.errorHint}</p>
      <button
        type="button"
        onClick={resetErrorBoundary}
        className="bg-accent text-on-accent text-title rounded-pill min-h-touch min-w-touch px-page font-bold"
      >
        {PLACEHOLDER_TEXT.errorRetry}
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
