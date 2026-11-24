import { useNetworkState } from "expo-network";
import { forgetImageFailures } from "@/core/media/deadImageHosts";
import { useEffect, useRef } from "react";

/**
 * Fires `onReconnect` once when connectivity transitions from lost to
 * present — master prompt §31's "temporary network loss / Wi-Fi → cellular
 * changes" handling. Does not fire on first mount even if already
 * connected; only on an actual recovery.
 *
 * `onReconnectRef` mirrors the callback on every render (same pattern as
 * `useWatchProgress.ts`'s `metaRef`) so the effect below — intentionally
 * keyed only on `[isConnected]`, not re-running on every render — always
 * invokes the *latest* callback rather than whichever closure happened to
 * be in scope the last time connectivity changed. The live player's caller
 * passes a fresh inline callback every render (closing over the currently
 * selected channel); without this, a reconnect after the user had already
 * switched channels would re-select a stale, no-longer-current channel.
 */
export function useNetworkReconnect(onReconnect: () => void): void {
  const state = useNetworkState();
  const wasDisconnectedRef = useRef(false);
  /*
    Three states, not two — and telling "not connected" from "not known
    yet" is the whole point.

    `useNetworkState` starts as `{}` and fills in asynchronously
    (expo-network/src/Network.ts), so `isConnected === true` is false for
    the first render of every screen that uses this. Treating that as
    "disconnected" armed the recovery flag immediately, and the hook then
    fired the moment the real state arrived — on every mount, connected or
    not, contrary to the paragraph above. In the live player that meant a
    second `controller.select` for the channel that was already opening:
    two stream opens on a line limited to one connection, coalesced only if
    the network state happened to resolve inside a 180ms debounce.

    Only an explicit `false` now arms the flag. While the state is unknown
    this decides nothing and waits.
  */
  const isConnected = state.isConnected === true;
  const isDisconnected = state.isConnected === false;

  const onReconnectRef = useRef(onReconnect);
  useEffect(() => {
    onReconnectRef.current = onReconnect;
  });

  useEffect(() => {
    if (isDisconnected) {
      wasDisconnectedRef.current = true;
      return;
    }
    if (!isConnected) return;
    if (wasDisconnectedRef.current) {
      wasDisconnectedRef.current = false;
      /*
        Every artwork failure recorded while the line was down says nothing
        about the image or its host — only about the line. Keeping them
        meant a customer who walked through a tunnel came out to a catalogue
        of empty tiles that stayed empty until the app was killed.
      */
      forgetImageFailures();
      onReconnectRef.current();
    }
  }, [isConnected, isDisconnected]);
}
