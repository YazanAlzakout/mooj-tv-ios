import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { isTvBuild } from "@/core/platform/isTvBuild";
import { Brand } from "@/core/theme/tokens";

/**
 * Rings leaving the brand mark, the way they leave it in the intro.
 *
 * The opening clip does three things in four seconds: the sphere forms, the
 * wordmark lands, and then rings ripple out of it, over and over, for the
 * rest of the shot. The first two cannot be repeated on a page — they are a
 * beginning — but the third is a resting state, and it is the part that
 * makes the mark look alive rather than placed. So the provider screen,
 * which is a page the viewer sits on while they type, gets it.
 *
 * ## Three rings, and why they restart rather than reverse
 *
 * `WaveBands` reverses its animations on purpose: a shape that jumps back
 * to its start is a visible glitch, and hiding the jump behind a fade is
 * what made the old particles expensive. A ring is the one case where that
 * reasoning inverts. A ripple *must* fade as it widens — that is what a
 * ripple is — so by the moment it restarts it is already at zero opacity
 * and there is nothing to hide. Reversing instead would draw a ring
 * shrinking back into the mark, which water does not do.
 *
 * Three, staggered by a third of the cycle each, so one is always mid-flight
 * and the eye never catches the moment a new one begins.
 *
 * ## Cost
 *
 * Three views, each with one transform and one opacity, both driven on the
 * native thread — nothing here re-renders. They sit behind the mark and
 * are smaller than it for most of their life, so the compositor is
 * re-blending a few hundred points, not a screen.
 *
 * Never on the television, for the reason `ScreenBackground` gives about
 * the particles: a set-top box has to find these frames while moving a
 * focus ring for a remote, and they come out of the remote.
 */

/** One full expansion, in milliseconds. Slow — this is a resting state, not an event. */
const CYCLE_MS = 3400;

function Ring({ size, delay }: { size: number; delay: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        /*
         * `Easing.out` so the ring leaves quickly and slows as it widens,
         * which is how a wave front actually behaves — linear expansion
         * reads as a growing circle rather than as something travelling.
         */
        withTiming(1, { duration: CYCLE_MS, easing: Easing.out(Easing.quad) }),
        -1,
        false
      )
    );
    // Runs once on mount; the rings travel for as long as the screen is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.78 + t.value * 0.5 }],
    /*
     * Squared, so most of the fade happens in the second half. A linear
     * fade makes the ring faintest where it is still close to the mark,
     * which reads as the mark being dim rather than the ring being far.
     */
    opacity: (1 - t.value) * (1 - t.value) * 0.55,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        /*
         * `start`/`top`, not negative margins.
         *
         * This was `marginStart: -size / 2, marginTop: -size / 2`, and on
         * a device the rings came out half a radius down and to the right
         * of the mark — orbiting a point beside it rather than sitting on
         * it. Yoga does not apply margin to an absolutely positioned child
         * that specifies no inset on that axis, so the offsets were simply
         * dropped and each ring was drawn from the centre anchor outward
         * instead of around it. An inset is not ignorable.
         */
        { width: size, height: size, borderRadius: size / 2, start: -size / 2, top: -size / 2 },
        style,
      ]}
    />
  );
}

/**
 * Wraps the brand mark and lays the rings behind it.
 *
 * `size` is the mark's own box; the rings are drawn from its centre and
 * reach about a quarter past its edge at their widest.
 */
export function LogoRipple({ size, children }: { size: number; children: React.ReactNode }) {
  if (isTvBuild) return <>{children}</>;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={styles.centre} pointerEvents="none">
        <Ring size={size} delay={0} />
        <Ring size={size} delay={CYCLE_MS / 3} />
        <Ring size={size} delay={(CYCLE_MS / 3) * 2} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center", justifyContent: "center" },
  /*
   * A zero-sized anchor at the exact centre, with each ring pulled back by
   * half its own width. Centring them with `alignSelf` instead would make
   * the layout re-measure as they scale, and a scale transform is supposed
   * to cost nothing above the compositor.
   */
  centre: { position: "absolute", left: "50%", top: "50%", width: 0, height: 0 },
  ring: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: Brand.primaryLight,
  },
});
