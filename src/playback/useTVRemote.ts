import { useCallback, useEffect, useRef } from "react";
import { useTVEventHandler } from "react-native";

/**
 * A remote-control key on Android TV, normalised.
 *
 * The D-pad directions, the media transport keys, the dedicated channel
 * buttons and the number keys.
 *
 * Back is deliberately absent: `KEYCODE_BACK` is not in react-native-tvos's
 * event map at all (`ReactAndroidHWInputDeviceHelper.KEY_EVENTS_ACTIONS`), it
 * goes through Android's ordinary back navigation, which expo-router already
 * handles.
 *
 * Long-press variants are absent too, and that is not an oversight: the
 * helper emits them under separate names (`longChannelUp` and friends,
 * `ReactAndroidHWInputDeviceHelper.java:97-98`), and nothing here wants them
 * yet. Note what that implies for a held key — see the ACTION_UP note below.
 */
export type TVRemoteKey =
  | "up"
  | "down"
  | "left"
  | "right"
  | "select"
  | "playPause"
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "rewind"
  | "fastForward"
  /**
   * The remote's own dedicated channel buttons.
   *
   * Android emits these as `"channelUp"` / `"channelDown"` for
   * `KEYCODE_CHANNEL_UP` / `KEYCODE_CHANNEL_DOWN` — verified in the
   * installed React Native at
   * `ReactAndroid/.../ReactAndroidHWInputDeviceHelper.java:64-65`. They were
   * simply missing from the set below, so the two buttons on a television
   * remote that exist for nothing but changing channel did nothing at all,
   * and the only way to change channel was the D-pad with the controls
   * hidden.
   */
  | "channelUp"
  | "channelDown"
  /**
   * The number keys, for direct channel entry.
   *
   * Also already emitted, as the plain strings `"0"` through `"9"`
   * (`ReactAndroidHWInputDeviceHelper.java:54-63`), and also dropped. Typing
   * a channel number was therefore impossible from a remote no matter what
   * the on-screen box did.
   */
  /**
   * The centre button **held down**.
   *
   * Android reports a hold as its own event name rather than as a modifier
   * on `select` — `KEY_EVENTS_LONG_PRESS_ACTIONS` in
   * `ReactAndroidHWInputDeviceHelper.java:83-98`, for `KEYCODE_DPAD_CENTER`,
   * `KEYCODE_ENTER`, `KEYCODE_NUMPAD_ENTER` and `KEYCODE_BUTTON_SELECT`.
   *
   * Two things about it were read in that file rather than assumed, and the
   * design of the live player's key map depends on both:
   *
   *   - A hold emits `longSelect` **instead of** `select`, never as well
   *     as it: `handleKeyEvent:159-175` takes the long branch or the plain
   *     one, not both. So a held centre button cannot also fire the short
   *     press, and the two can safely mean different things.
   *   - A hold dispatches `longSelect` **twice** — once on the key-down
   *     that crosses the 300ms threshold, and again on `ACTION_UP`
   *     (`:161`). The `ACTION_UP` filter below is what reduces that back
   *     to one delivery per press. Do not exempt this key from it: a
   *     handler that toggles anything would have run twice and undone
   *     itself.
   */
  | "longSelect"
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9";

const HANDLED = new Set<string>([
  "up",
  "down",
  "left",
  "right",
  "select",
  "playPause",
  "play",
  "pause",
  "next",
  "previous",
  "rewind",
  "fastForward",
  "channelUp",
  "channelDown",
  "longSelect",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
]);

/** `KeyEvent.ACTION_UP`. Dispatched for every press; see the note below. */
const ACTION_UP = 1;

/**
 * Runs `onKey` when the TV remote is pressed. A no-op on phones, which
 * never produce these events.
 *
 * There is deliberately no `Platform.isTV` check: it resolves to
 * `uiMode === 'tv'`, and plenty of TV boxes report themselves as ordinary
 * devices, so guarding on it silently disabled the remote on exactly the
 * hardware it was written for.
 *
 * **Acts on key-up, not key-down.** react-native-tvos only dispatches
 * `ACTION_DOWN` when `ReactFeatureFlags.enableKeyDownEvents` is set — it
 * defaults to false, there is no JS API to change it, and nothing in this
 * project sets it — while `ACTION_UP` is dispatched for every press
 * (`ReactAndroidHWInputDeviceHelper.shouldDispatchEvent`). An earlier
 * version filtered `ACTION_UP` out to avoid "acting on both halves of a
 * press", which meant it discarded the only events that ever arrived and no
 * remote key did anything at all. Filtering `ACTION_DOWN` instead is correct
 * either way: exactly one of the two is acted on even if key-down events are
 * ever turned on.
 *
 * The handler is kept in a ref and refreshed after every render rather than
 * passed straight through: `useTVEventHandler` re-subscribes whenever the
 * function identity changes, and a player screen re-renders several times a
 * second, so an inline function would rebuild the native listener
 * continuously. The ref keeps one subscription while still calling the
 * newest closure.
 */
export function useTVRemote(onKey: (key: TVRemoteKey) => void): void {
  const handler = useRef(onKey);

  useEffect(() => {
    handler.current = onKey;
  });

  useTVEventHandler(
    useCallback((event: { eventType: string; eventKeyAction?: number }) => {
      /*
        This also de-duplicates the long press. `dispatchEvent` carries the
        key action in its payload (`ReactAndroidHWInputDeviceHelper.java:199`),
        and a hold dispatches `longSelect` on both the qualifying key-down
        and the release — so dropping everything that is not `ACTION_UP`
        leaves exactly one `longSelect` per press, on release. See the note
        on that key above.
      */
      if (event.eventKeyAction !== undefined && event.eventKeyAction !== ACTION_UP) return;
      if (!HANDLED.has(event.eventType)) return;
      handler.current(event.eventType as TVRemoteKey);
    }, [])
  );
}
