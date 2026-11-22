import { APP_NAME } from "@kidboard/shared";
import { useTranslation } from "react-i18next";

export function App(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <main className="bg-surface text-text flex h-full flex-col items-center justify-center gap-4">
      <h1 className="text-display font-extrabold">{APP_NAME}</h1>
      <p className="text-title text-text-muted">{t("app.placeholderPage")}</p>
    </main>
  );
}
