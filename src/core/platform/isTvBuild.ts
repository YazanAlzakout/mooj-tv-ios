import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Whether the app is running as the Android TV build.
 *
 * **Use this, not `Platform.isTV`, for anything that changes the interface.**
 *
 * `Platform.isTV` is a real react-native-tvos API, but what it reports is
 * `uiMode === UI_MODE_TYPE_TELEVISION` — a device *self-description* that a
 * large share of Android TV boxes get wrong, returning `normal`. The box
 * this app is tested on is one of them. Every TV feature gated on it was
 * therefore dead on the hardware it was written for: first the focus rings
 * and the remote handler (fixed 2026-09-09 by removing the check), then the
 * category rail and the Live TV entry point, which is why the television
 * still opened a single full-screen channel with no list beside it after
 * the rail had supposedly been built (found 2026-09-10).
 *
 * The reliable signal is that the two are different binaries: the TV APK
 * comes from a prebuild run with `EXPO_TV=1`, and `app.config.js` writes
 * that fact into `extra.isTvBuild`, where it is embedded in the bundle.
 * Nothing about the device is consulted.
 *
 * `Platform.isTV` is still consulted as a second chance, never as the only
 * one: a box that *does* report itself correctly should get the TV
 * treatment even from the phone binary, and reading it here can only ever
 * turn this on — never off.
 */
export const isTvBuild: boolean =
  Constants.expoConfig?.extra?.isTvBuild === true || Platform.isTV === true;
