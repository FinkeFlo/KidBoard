import { Board } from "./board/Board";
import { FullscreenControl } from "./kiosk/FullscreenControl";
import { useWakeLock } from "./kiosk/useWakeLock";

export function App(): React.JSX.Element {
  useWakeLock();
  return (
    <>
      <Board />
      <FullscreenControl />
    </>
  );
}
