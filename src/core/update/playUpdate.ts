import { Platform } from "react-native";

/**
 * Asking Google Play, rather than asking a server of our own.
 *
 * The app is distributed through Play, so Play already knows both numbers
 * that matter — the version installed and the newest one published — and
 * there is nothing for us to host. This replaces the manifest URL in
 * requiredUpdate.ts for the everyday "a new version is out" case. That file
 * stays, inert, for the one thing Play cannot do: forcing an old build off
 * immediately, without publishing anything.
 *
 * The problem being solved is not technical. Play's own auto-update is
 * silent and slow, and reaches people days late or not at all if they have
 * turned it off — so customers were running old builds without knowing a
 * new one existed (2026-09-17: "المستخدمين لا يلاحظون التحديثات الجديدة الا
 * بعد فترة").
 *
 * ## Written to be safe on a device nobody can test
 *
 * This ships without ever having been seen to work, because the Play
 * In-App Updates API only answers for an app **Play itself installed** — a
 * sideloaded APK always hears "no update", so there is nothing to observe
 * on the test phone. Everything below is therefore built so that the worst
 * case is *nothing happens*:
 *
 *   - Every call is wrapped. `checkForUpdate` **rejects** rather than
 *     resolving when Play is absent, offline, or the install did not come
 *     from Play (verified in the module's own Kotlin:
 *     `addOnFailureListener { promise.reject(...) }`). Unwrapped, that is an
 *     unhandled rejection on every launch of a sideloaded build — which is
 *     every launch we can currently produce.
 *   - The native module holds `appUpdateManager` as a Kotlin `lateinit`
 *     initialised in `OnCreate`. If that construction ever fails, touching
 *     it throws `UninitializedPropertyAccessException` from inside the
 *     module. The same wrapping covers it.
 *   - The result is narrowed by hand. A native module returning a shape we
 *     did not expect must read as "no update", never as a crash.
 *   - Nothing here is awaited on the startup path. A slow or hanging Play
 *     service must not add a millisecond to opening the app.
 */

/** Deliberately not exported: callers get a boolean, not a Play object. */
interface UpdateCheckResult {
  updateAvailable?: unknown;
}

/**
 * Whether Play says a newer build of this app is published.
 *
 * `false` for every other outcome, including every error — see the note
 * above on why that is the only acceptable default here.
 */
export async function playUpdateAvailable(): Promise<boolean> {
  if (Platform.OS !== "android") return false;

  try {
    /*
      Imported here rather than at the top of the file so that a module
      which fails to link — a mis-built native artifact, a stripped
      release — cannot take the whole startup path down with it. An
      import that throws inside this try is a `false`, not a blank screen.
    */
    const { checkForUpdate } = await import("expo-in-app-updates");
    const result = (await checkForUpdate()) as UpdateCheckResult;
    return result?.updateAvailable === true;
  } catch {
    return false;
  }
}

/**
 * Hands the update to Play, and says whether Play took it.
 *
 * **Flexible, always, and passed explicitly.** The module derives the type
 * from Play's `updatePriority` when the argument is omitted, and anything
 * the console marks priority 4 or 5 becomes an *immediate* update — a
 * full-screen flow that seizes the app and restarts it. That is not a
 * decision to leave to a field in a web console that someone might set
 * months from now while nobody is watching: the viewer here pressed a
 * button on a notice they could equally have dismissed, and an update they
 * chose must remain one they can back out of. `false` maps to
 * `AppUpdateType.FLEXIBLE` (verified in the module's JS).
 *
 * One behaviour worth knowing, because it is the module's and not ours: it
 * registers an install listener and calls `completeUpdate()` by itself the
 * moment a flexible download finishes, which installs and restarts the app.
 * So a viewer who accepts an update mid-film will be interrupted when the
 * download lands. Acceptable — they asked for it — but it is why the notice
 * appears before playback rather than over it.
 *
 * Returns `false` if Play declined or the call failed, which is the
 * caller's cue to fall back to simply opening the store page.
 */
export async function startPlayUpdate(): Promise<boolean> {
  if (Platform.OS !== "android") return false;

  try {
    const { startUpdate } = await import("expo-in-app-updates");
    return (await startUpdate(false)) === true;
  } catch {
    return false;
  }
}
