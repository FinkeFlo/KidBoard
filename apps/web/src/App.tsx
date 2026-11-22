import { Board } from "./board/Board";
import { FullscreenControl } from "./kiosk/FullscreenControl";

/** The board UI. Crash-proof kiosk effects (wake lock) live in `AppShell`, outside the error boundary. */
export function App(): React.JSX.Element {
  return (
    <>
      <Board />
      <FullscreenControl />
    </>
  );
}
