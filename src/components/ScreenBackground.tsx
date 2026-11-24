import { useEffect, type ReactNode } from "react";
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

import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";
import { TVSafeArea } from "@/core/theme/tokens";

import { WaveBands } from "./WaveBands";

/**
 * The horizontal room `tvOverscan` takes out of every screen this component
 * wraps — zero off the television.
 *
 * Exported because a screen cannot measure it: `useWindowDimensions` reports
 * the whole display, and `useSafeAreaInsets` reports zero on a TV, so a grid
 * computing its own column width from either one is wrong by this much. The
 * three browse grids promise FlatList a row height derived from that width
 * (`getItemLayout`), and a promise that is too large puts the render window
 * out of step with the highlight — which on a D-pad stops navigation rather
 * than merely leaving a gap.
 *
 * Any screen that measures itself must subtract this. Adding the overscan
 * without this constant is how that bug was introduced.
 */
export const TV_OVERSCAN_X = isTvBuild ? TVSafeArea.horizontal * 2 : 0;

/**
 * The shared screen backdrop: base color, a soft blue glow bleeding in from
 * the top (a stacked pair of large translucent circles — the same depth
 * the old app got from a gradient, without `expo-linear-gradient`), and
 * optionally the drifting particles. Wrap a screen's `SafeAreaView` in it
 * so every screen shares one look instead of each painting its own.
 *
 * The particles never run on the TV build. They are eight views under a
 * continuous native-thread animation that lasts as long as the screen is
 * mounted, and `root` clips them, so the compositor re-blends a
 * full-screen clipped layer every frame for ever. A phone GPU shrugs; the
 * set-top boxes this ships to have to find those frames while the same
 * screen is also trying to move a focus ring in response to a remote, and
 * the frames come out of the remote. They are also a decoration nobody can
 * see from three metres away — the worst possible trade for a television.
 */
/**
 * One breath of the glow, in milliseconds.
 *
 * Long on purpose. This is behind everything the viewer is reading, so it
 * has to be the kind of movement you only notice when you stop looking at
 * the text — around the pace of slow breathing. Anything under three
 * seconds starts to pull the eye up to the top of the screen.
 */
const GLOW_CYCLE_MS = 4600;

/**
 * The lag between the small circle and the large one.
 *
 * This is the whole effect. Both circles breathing together is just a
 * screen getting brighter and darker; the small one brightening *first*
 * and the large one answering a beat later is light travelling outward
 * from the middle. Roughly a sixth of the cycle — enough to read as cause
 * and effect, short enough that they are never in opposition.
 */
const GLOW_LAG_MS = 760;

function useGlowBreath(delay: number) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: GLOW_CYCLE_MS, easing: Easing.inOut(Easing.sin) }),
        -1,
        /* Reverses rather than restarting: a glow that snapped back to dim would be a flicker. */
        true
      )
    );
    // Runs once on mount; the glow breathes for as long as the screen is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return t;
}

/**
 * The two circles, breathing.
 *
 * The alpha is already in the colour (see `glowOuter`/`glowInner`), so the
 * opacity animated here multiplies it — which is why the range is 0.62 to
 * 1 rather than anything wider. Below about 0.6 the circle visibly leaves
 * the screen instead of dimming.
 *
 * The scale is tiny, 3%, and it is doing more work than it looks: a light
 * source that brightens without growing reads as a screen effect, and one
 * that grows as it brightens reads as light.
 */
function BreathingGlow() {
  const inner = useGlowBreath(0);
  const outer = useGlowBreath(GLOW_LAG_MS);

  const innerStyle = useAnimatedStyle(() => ({
    opacity: 0.62 + inner.value * 0.38,
    transform: [{ scale: 1 + inner.value * 0.03 }],
  }));
  const outerStyle = useAnimatedStyle(() => ({
    opacity: 0.68 + outer.value * 0.32,
    transform: [{ scale: 1 + outer.value * 0.03 }],
  }));

  return (
    <>
      <Animated.View style={[styles.glowOuter, outerStyle]} pointerEvents="none" />
      <Animated.View style={[styles.glowInner, innerStyle]} pointerEvents="none" />
    </>
  );
}

export function ScreenBackground({ children, particles = false }: { children: ReactNode; particles?: boolean }) {
  /*
   * The same flag the bands already use. `particles` has never really meant
   * particles — it means "this screen is one the viewer looks at rather
   * than works in", and the four that pass it are the four that should
   * move: onboarding, the provider screens and home. A settings list does
   * not want a pulse behind it.
   *
   * Off on the television for the reason written above the component: the
   * box has to find these frames while moving a focus ring, and they come
   * out of the remote.
   */
  const alive = particles && !isTvBuild;

  return (
    <View style={[styles.root, isTvBuild && styles.tvOverscan]}>
      {alive ? (
        <BreathingGlow />
      ) : (
        <>
          <View style={styles.glowOuter} pointerEvents="none" />
          <View style={styles.glowInner} pointerEvents="none" />
        </>
      )}
      {alive && <WaveBands />}
      {children}
    </View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background, overflow: "hidden" },
  /**
   * Overscan. The television's own bezel and its picture settings can crop
   * the outer band of the signal, and nothing in this app allowed for that
   * until now: `TVSafeArea` was defined in tokens.ts and referenced from
   * nowhere at all, so a row pinned to the edge could be sitting behind the
   * frame of the set.
   *
   * Here rather than per screen, because this component already wraps
   * sixteen of the twenty screens — and, just as usefully, it does **not**
   * wrap the four players. A player must fill the glass; it is its controls
   * that need the inset, and they have their own (`CONTROL_EDGE`).
   *
   * The glow circles are absolutely positioned, so they still bleed to the
   * true edge behind the inset content, which is what makes the padding
   * read as margin rather than as a border.
   *
   * Phone-neutral by construction: the style is only in the array when
   * `isTvBuild`.
   */
  tvOverscan: {
    paddingHorizontal: TVSafeArea.horizontal,
    paddingVertical: TVSafeArea.vertical,
  },
  glowOuter: {
    position: "absolute",
    top: -260,
    alignSelf: "center",
    width: 520,
    height: 520,
    borderRadius: 260,
    backgroundColor: C.glowOuter,
  },
  glowInner: {
    position: "absolute",
    top: -160,
    alignSelf: "center",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: C.glowInner,
  },
  })
);
