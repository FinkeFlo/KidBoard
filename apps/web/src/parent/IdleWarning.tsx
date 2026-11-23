import { useTranslation } from "react-i18next";

import { PARENT_IDLE_WARNING_MS, useParentGate } from "./parentGate";

/**
 * "Locking soon" (ADR-0013 auto-lock): a calm banner at the bottom of the PIN pad or
 * the editor while the gate has been idle for all but the last
 * {@link PARENT_IDLE_WARNING_MS} of the idle lock, with one large "Keep editing"
 * button that restarts the idle time (any other touch or key does too). No motion; the
 * live region exists all the time and is announced when the warning fills it. Rendered
 * inside the open dialog, so assistive tech does not treat it as outside the modal.
 */
export function IdleWarning(): React.JSX.Element {
  const { t } = useTranslation();
  const { idleWarning, stayActive } = useParentGate();
  return (
    <div aria-live="assertive" data-testid="idle-warning-region">
      {idleWarning && (
        <div
          data-testid="idle-warning"
          className="p-page pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center"
        >
          <div className="bg-surface-raised rounded-column shadow-raised gap-gutter text-text pointer-events-auto flex w-full max-w-[40rem] flex-wrap items-center justify-between p-6">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-title">{t("parent.idle.title")}</p>
              <p className="text-body text-text-muted">
                {t("parent.idle.text", {
                  count: PARENT_IDLE_WARNING_MS / 1000,
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={stayActive}
              className="min-h-touch rounded-pill bg-accent text-on-accent text-title focus-visible:outline-text px-8 focus-visible:outline-4 focus-visible:outline-offset-2"
            >
              {t("parent.idle.stay")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
