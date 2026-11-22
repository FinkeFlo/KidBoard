import { APP_NAME } from "@kidboard/shared";

import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { PLACEHOLDER_TEXT } from "./placeholder-text";

export function App(): React.JSX.Element {
  return (
    <AppErrorBoundary>
      <main className="bg-surface text-text flex h-full flex-col items-center justify-center gap-4">
        <h1 className="text-display font-extrabold">{APP_NAME}</h1>
        <p className="text-title text-text-muted">
          {PLACEHOLDER_TEXT.placeholderPage}
        </p>
      </main>
    </AppErrorBoundary>
  );
}
