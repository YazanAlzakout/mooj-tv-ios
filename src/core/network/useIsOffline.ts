import { useNetworkState } from "expo-network";

/**
 * True only when the device itself has no network connection at all — not
 * "this one request failed", which can mean anything from a dead provider
 * to a bad URL. Used to short-circuit a screen *before* it even attempts a
 * network call: opening a channel or a movie with Wi-Fi off should say "no
 * internet connection" immediately, not spend several seconds retrying a
 * stream and then show a generic playback error that sends the user
 * looking for the wrong problem.
 *
 * `isConnected === false` specifically (not merely falsy) — `undefined`
 * means the state hasn't resolved yet, which must read as "assume online"
 * so a screen never flashes a false offline message on first render.
 */
export function useIsOffline(): boolean {
  const state = useNetworkState();
  return state.isConnected === false;
}
