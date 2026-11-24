import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect } from "react";
import { Platform } from "react-native";

/**
 * The tick and the tap the app answers a press with.
 *
 * It started inside the bottom tab bar and belongs to more than the tab
 * bar: a menu of six destinations and a settings screen of switches are
 * the same gesture, and answering it on one screen and not the next is
 * worse than never answering it at all. So the sound lives here and the
 * screens that press-and-go call it.
 *
 * ## The level is in the file, not here
 *
 * Setting `player.volume` would be the obvious way and the React Compiler
 * refuses it: anything a hook hands back is frozen, in an effect as much
 * as in render. So the asset itself is mixed down — about 15 dB below
 * where it arrived, after two rounds of "quieter" — which is where it
 * needed to be anyway. A tick you notice is a tick that is too loud, and
 * this one fires several times a minute.
 *
 * ## One player per screen, re-fired rather than re-made
 *
 * `useAudioPlayer` loads the asset once and `seekTo(0)` + `play()` fires
 * it again, which is the pattern the SDK 57 docs give. A player per press
 * would allocate a decoder on the thread that draws the screen.
 *
 * ## The haptic respects the system setting, deliberately
 *
 * `performAndroidHapticsAsync` goes through the platform's own feedback
 * constants, so a phone with haptics switched off feels nothing — which
 * is the correct behaviour and was mistaken for a bug once already. The
 * alternative, `impactAsync`, drives the motor directly and would buzz at
 * somebody who has asked the system not to. It also needs no VIBRATE
 * permission, which keeps one line out of the manifest.
 */
/**
 * Whether this process has already set the audio mode for the tick.
 *
 * `setAudioModeAsync` is scoped to neither a player nor a screen: it writes
 * the process's audio session, which on iOS is the same `AVAudioSession`
 * category that governs video playback. Four components call this hook — the
 * tab bar, the More tab and two sections of Settings — so the write used to
 * happen again on every one of their mounts, and each one is a late-arriving
 * claim on a setting the live player depends on.
 *
 * That is the player's problem rather than the tick's. libVLC sets `.playback`
 * and activates the session from inside `setupNowPlayingControls`
 * (`@lunarr/vlc-player/ios/VLCPlayerView.swift:665-667`), guarded so it never
 * re-asserts for the life of that view — while `playsInSilentMode: false` is
 * precisely the value that silences a live channel on a phone with the ring
 * switch off and breaks the background playback the Settings toggle sells.
 * Last writer wins, and before this guard the ordering was luck: the tab bar
 * mounts at app start and the player is pushed afterwards, so the player
 * happened to win — but `more.tsx` and `settings.tsx` mount lazily, the first
 * time the viewer opens them, and nothing kept that from landing badly.
 *
 * Writing once per process is both sufficient and honest about what the call
 * does: the mode is global, so the later writes never carried information the
 * first had not. Android is unchanged — identical arguments, and the first
 * write still happens at the same moment — which matters, because that build
 * ships.
 *
 * It is not a complete answer. Nothing in this app owns the audio session as a
 * policy, and after a Siri or telephone interruption nobody re-asserts
 * anything at all. The first build on real Apple hardware should check the
 * ring switch and an incoming call against a playing channel.
 */
let audioModeApplied = false;

export function useTapFeedback(): () => void {
  const click = useAudioPlayer(require("../../../assets/sounds/tab-tap.m4a"));

  useEffect(() => {
    if (audioModeApplied) return;
    audioModeApplied = true;
    /*
     * `mixWithOthers` so an 85ms tick never takes audio focus — without it
     * Android pauses whatever the viewer was listening to, for a sound
     * shorter than the gap between two words.
     *
     * `playsInSilentMode: false` so a phone set to silent stays silent.
     * Somebody who has silenced their phone has already answered the
     * question of whether they want to hear this.
     */
    setAudioModeAsync({ interruptionMode: "mixWithOthers", playsInSilentMode: false }).catch(() => {
      /*
       * An audio mode the app can live without; the tick may simply duck. The
       * flag goes back so the next screen that mounts tries once more — a
       * failed write claimed nothing.
       */
      audioModeApplied = false;
    });
  }, []);

  return useCallback(() => {
    click.seekTo(0);
    click.play();
    if (Platform.OS === "android") {
      Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Toggle_On).catch(() => {});
    } else {
      Haptics.selectionAsync().catch(() => {});
    }
  }, [click]);
}
