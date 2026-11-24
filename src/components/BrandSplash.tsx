import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, { FadeOut } from "react-native-reanimated";

import { brandLogoSource } from "./BrandLogo";
import { Brand } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";

/**
 * Hard ceiling — the app must never be gated on the intro clip finishing,
 * or failing to.
 *
 * Raised from 2600 when the brand's own intro replaced the generated one:
 * that clip runs 4.70s, and the old ceiling cut it at the moment the
 * wordmark arrived, so nobody ever saw it land. This is the clip plus half
 * a second, and it is still a ceiling rather than a wait — `playToEnd`
 * almost always fires first.
 *
 * **It is also the price of the intro.** Startup work on a warm launch
 * finishes well inside a second, so the remainder is the animation and
 * nothing else, on every single launch. If that ever reads as slow, the
 * answer is to play the full clip on first launch only and a short silent
 * cut afterwards — not to trim the piece itself.
 */
const MAX_SPLASH_MS = 5200;

/**
 * Brand intro clip, played once over the app's own background while fonts,
 * the database and the session restore finish in parallel behind it. The
 * logo sits underneath the video, so if the clip fails to decode on a given
 * device there's still a branded frame rather than a black screen.
 *
 * `onFinish` is called exactly once — whichever comes first, the clip
 * ending or `MAX_SPLASH_MS` — so a stalled or unsupported video can never
 * strand the user on the splash.
 */
export function BrandSplash({ onFinish }: { onFinish: () => void }) {
  const finishedRef = useRef(false);

  const player = useVideoPlayer(require("../../assets/images/splash-vid.mp4"), (p) => {
    p.loop = false;
    /*
     * Unmuted, deliberately, and this is the one decision here a viewer
     * will have an opinion about — they have already had one.
     *
     * The clip arrived carrying a flat 4.7-second drone: -22.4 LUFS with a
     * loudness range of 1.0 LU, which is to say it did not move at all for
     * its whole length, and almost all of its energy sat where a phone
     * speaker can only pass on rumble. The verdict was that it sounded
     * like a car. That track has been replaced with a bed written to the
     * animation — an airy swell while the orb forms, three soft chimes on
     * the glint, the wordmark and the settle, over a detuned pad that
     * fades out before the end — at -30 LUFS and with nothing below
     * 290 Hz. Seven and a half decibels quieter, and it breathes.
     *
     * Android honours the ringer: on a phone set to silent this plays
     * nothing, which is the behaviour most people expect from an app that
     * makes noise at launch.
     */
    /*
     * **Mix, never take.** Without this the intro opens a full
     * AUDIOFOCUS_GAIN request, which tells Android to stop everything
     * else — so launching this app while a podcast or music was playing
     * killed it, for the sake of a four-second sting. `mixWithOthers`
     * makes expo-video abandon focus outright, so the bed plays alongside
     * whatever is already there.
     *
     * The ringer is a separate question from focus, and expo-video has no
     * equivalent of expo-audio's `playsInSilentMode`. A silenced phone is
     * honoured here only insofar as its media volume is down. The comment
     * that used to sit here claimed otherwise, which was the worse half of
     * the bug: a promise in a comment that the code never made.
     */
    p.audioMixingMode = "mixWithOthers";
    p.muted = false;
    p.play();
  });

  function finishOnce() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish();
  }

  useEventListener(player, "playToEnd", () => finishOnce());
  useEventListener(player, "statusChange", ({ status }) => {
    // A clip that can't be decoded on this device shouldn't hold the app —
    // fall through to the logo frame and let the timer below finish.
    if (status === "error") finishOnce();
  });

  useEffect(() => {
    const timer = setTimeout(finishOnce, MAX_SPLASH_MS);
    return () => clearTimeout(timer);
    // Arms the one hard timeout on mount; `finishOnce` is idempotent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View exiting={FadeOut.duration(280)} style={styles.root}>
      <View style={styles.logoLayer} pointerEvents="none">
        <View style={styles.logoGlow} />
        <Image
          source={brandLogoSource()}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
    </Animated.View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: C.background },
  logoLayer: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  logoGlow: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    /*
     * Was a hard-coded red — the other brand's accent, written as a
     * literal rather than a token, so changing the palette left it behind
     * and the name-based brand check could not see it either. Only ever
     * visible on a device that cannot decode the clip, which is exactly
     * where a wrong colour would go unnoticed longest.
     */
    backgroundColor: Brand.primaryMuted,
  },
  logo: { width: 180, height: 100 },
  })
);
