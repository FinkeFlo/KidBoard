import { useTranslation } from "react-i18next";

import {
  type ApiErrorKind,
  type ConnectionStatus,
  useApiErrorKind,
  useConnectionStatus,
} from "../data";

export interface StatusBannerProps {
  status: ConnectionStatus;
  errorKind?: ApiErrorKind | undefined;
}

/**
 * Discreet banner for offline, stale and error states; nothing while loading or ready.
 * An `unauthorized` error takes precedence in every state: it needs a parent to act.
 */
export function StatusBanner({
  status,
  errorKind,
}: StatusBannerProps): React.JSX.Element | null {
  const { t } = useTranslation();
  let message: string;
  let alert = false;
  if (errorKind === "unauthorized") {
    message = t("status.unauthorized");
    alert = true;
  } else if (status === "error") {
    message = t("status.error");
    alert = true;
  } else if (status === "offline") {
    message = t("status.offline");
  } else if (status === "stale") {
    message = t("status.stale");
  } else {
    return null;
  }
  return (
    <p
      role={alert ? "alert" : "status"}
      data-status={errorKind === "unauthorized" ? "unauthorized" : status}
      className={`${
        alert ? "bg-danger text-on-danger" : "bg-notice text-on-notice"
      } text-caption rounded-pill inline-flex items-center px-5 py-2 font-bold`}
    >
      {message}
    </p>
  );
}

/** {@link StatusBanner} wired to the data layer's connection status. */
export function ConnectedStatusBanner(): React.JSX.Element | null {
  return (
    <StatusBanner
      status={useConnectionStatus()}
      errorKind={useApiErrorKind()}
    />
  );
}
