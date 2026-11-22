import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ErrorBoundary,
  type FallbackProps,
  getErrorMessage,
} from "react-error-boundary";
import { useTranslation } from "react-i18next";

/** First automatic retry after this long; doubles with every failed retry. */
export const AUTO_RESET_BASE_MS = 5_000;
/** Upper bound of the backoff, so an unattended kiosk keeps trying (5 minutes). */
export const AUTO_RESET_MAX_MS = 300_000;
/** Children that ran this long without an error since the last reset start over at the base delay. */
export const AUTO_RESET_STABLE_MS = 60_000;

export interface AutoResetOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  stableMs?: number;
}

interface BackoffState {
  /** Automatic resets since the last stable period. */
  attempts: number;
  /** When the boundary was last reset (automatically or by tap). */
  lastResetAt: number;
}

type ErrorFallbackProps = FallbackProps & {
  /** Delay until the next automatic reset (computed when the fallback appears). */
  nextDelay: () => number;
  /** Counts the automatic attempt; called right before the reset. */
  onAutoReset: () => void;
  /** True when this failure starts a new incident (not a failed automatic retry). */
  isNewIncident: () => boolean;
};

function ErrorFallback({
  error,
  resetErrorBoundary,
  nextDelay,
  onAutoReset,
  isNewIncident,
}: ErrorFallbackProps): React.JSX.Element {
  const { t } = useTranslation();
  // Announced once per incident: a failed automatic retry mounts a new fallback, which
  // must not interrupt assistive tech again every few minutes. Decided once per mount.
  const [announce] = useState(isNewIncident);
  // An unattended kiosk recovers without a tap; the timer dies with the fallback
  // (manual retry, unmount of the boundary).
  // Latest reset function without restarting the timer when its identity changes.
  const reset = useRef(resetErrorBoundary);
  useEffect(() => {
    reset.current = resetErrorBoundary;
  }, [resetErrorBoundary]);
  useEffect(() => {
    const timer = setTimeout(() => {
      onAutoReset();
      reset.current();
    }, nextDelay());
    return () => {
      clearTimeout(timer);
    };
  }, [nextDelay, onAutoReset]);

  return (
    <main
      role={announce ? "alert" : undefined}
      data-testid="error-fallback"
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

/**
 * Last line of defence. Shows a friendly fallback and resets itself after a delay with
 * exponential backoff (base, x2, ... capped at the maximum). The backoff starts over once
 * the children have run for the stable period without failing again. The retry button
 * resets at once and does not count as an automatic attempt. The fallback is a live
 * `alert` only for the first failure of an incident, not for each failed automatic retry.
 */
export function AppErrorBoundary({
  children,
  baseDelayMs = AUTO_RESET_BASE_MS,
  maxDelayMs = AUTO_RESET_MAX_MS,
  stableMs = AUTO_RESET_STABLE_MS,
}: { children: ReactNode } & AutoResetOptions): React.JSX.Element {
  const backoff = useRef<BackoffState>({
    attempts: 0,
    lastResetAt: Number.NEGATIVE_INFINITY,
  });
  // Stable identities, so the fallback's timer is not restarted by re-renders.
  const nextDelay = useCallback((): number => {
    const state = backoff.current;
    if (Date.now() - state.lastResetAt >= stableMs) state.attempts = 0;
    return Math.min(baseDelayMs * 2 ** state.attempts, maxDelayMs);
  }, [baseDelayMs, maxDelayMs, stableMs]);
  const onAutoReset = useCallback((): void => {
    backoff.current.attempts += 1;
  }, []);
  const isNewIncident = useCallback((): boolean => {
    const state = backoff.current;
    return state.attempts === 0 || Date.now() - state.lastResetAt >= stableMs;
  }, [stableMs]);

  return (
    <ErrorBoundary
      fallbackRender={(props) => (
        <ErrorFallback
          {...props}
          nextDelay={nextDelay}
          onAutoReset={onAutoReset}
          isNewIncident={isNewIncident}
        />
      )}
      onError={logError}
      onReset={() => {
        backoff.current.lastResetAt = Date.now();
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
