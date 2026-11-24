import { useEffect } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Brand } from "@/core/theme/tokens";

/**
 * The backdrop's slow swell: three very wide, very faint bands drifting
 * across each other behind a screen's content.
 *
 * ## Why not the dots it replaces
 *
 * The screen used to carry eight small circles rising from the bottom edge
 * to the top on a loop. Two things were wrong with them. They repeated
 * visibly — eight identical shapes on one path, so the eye found the cycle
 * in seconds and then could not unsee it. And they were generic: dots
 * rising belong to no particular app, and this one is named for waves.
 *
 * These read as water instead, and they are the brand's own shape: wide
 * flat curves, layered, each moving at its own pace so they never line up
 * into a pattern you can count.
 *
 * ## The hard edge, and how it was finally removed
 *
 * A band used to be a plain `View` with a background colour — a very long
 * rounded rectangle, far wider than the screen, so the only parts of it the
 * viewer ever saw were its dead-straight top and bottom edges. Each one was
 * a one-pixel step across the whole width of the screen.
 *
 * It was known. tokens.ts said so, and answered it by dropping the alpha to
 * 0.055 "below about 0.06 the edge stops being findable". It did not: the
 * owner found the top band's edge on the device on 2026-11-17 without being
 * asked to look — "عند اللوغو فوق بالخلفية في خط مو حلو. خط افقي". Measured
 * off that screenshot, the first band's edge sits at 69.8dp (8% of 872.7dp)
 * and steps #0A111A to #0A1824 in a single row. A gradual difference of ten
 * parts in 255 is invisible; the same ten parts in one pixel is a drawn
 * line, and no alpha low enough to hide it leaves anything worth drawing.
 *
 * The same note said the shape "cannot be softened without a blur this
 * project has no way to draw". That was the error. This project has softened
 * two other hard edges exactly this way: ArtScrim, and the home cards'
 * `card-scrim.png`. A band is now `wave-band.png` — 8 by 512 of white whose
 * alpha follows sin² from 0 at the top, through 1 at the middle, back to 0
 * at the bottom — stretched to the band's box and tinted with its colour.
 * sin² rather than a linear ramp because it leaves at zero *slope* as well
 * as zero value, so there is no Mach band where the ramp meets the page.
 *
 * The alphas below went up to compensate: a ramp averages half its peak, so
 * the same presence costs roughly twice the number, and it is safe to spend
 * because the peak is in the middle of the band where nothing is an edge.
 *
 * ## Why it is cheaper than what it replaces
 *
 * Three views instead of eight, each with one transform-only animation on
 * the native thread. Nothing re-renders — Reanimated mutates the view
 * directly — and no opacity is animated, which is what made the old dots
 * cost a full-screen re-blend on every frame.
 *
 * Each band reverses rather than restarting: `withRepeat(..., -1, true)`
 * runs the timing forwards and then backwards for ever, so there is no
 * frame where a shape jumps back to where it started. The dots did jump,
 * hidden behind a fade, and hiding it is what cost the opacity animation.
 *
 * ## Deliberately absent on television
 *
 * `ScreenBackground` never mounts this on the TV build, for the reason
 * written there: a set-top box has to find these frames while also moving a
 * focus ring in response to a remote, and they come out of the remote. A
 * decoration nobody can see from three metres is the worst trade available.
 */

interface BandProps {
  /** Fraction of the screen height the band's top sits at. */
  top: number;
  /** Multiple of the screen width — always over 1, so the ends never show. */
  width: number;
  height: number;
  color: string;
  /** One full sweep, in milliseconds. Different per band, and never a multiple of another. */
  duration: number;
  /** How far it travels, in pixels, from its resting position. */
  travel: number;
  /** Negative starts it on the other side, so the three never set off together. */
  direction: 1 | -1;
}

function Band({ top, width, height, color, duration, travel, direction }: BandProps) {
  /*
   * Measured per render, not once at module load.
   *
   * `Dimensions.get("window")` was read at import time, so after a rotation
   * every band was still sized for the portrait width. `width` is a multiple
   * of it — 1.6 to 2.1 — chosen so the rounded ends are always off-screen;
   * against a landscape screen 2.2 times wider, 1.6 is not enough and the
   * ends come into view.
   */
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const drift = useSharedValue(-travel * direction);

  useEffect(() => {
    drift.value = withRepeat(
      withTiming(travel * direction, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    // Runs once on mount; the band drifts for as long as the screen is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: drift.value }] }));

  const w = screenWidth * width;
  return (
    <Animated.Image
      source={require("../../assets/images/wave-band.png")}
      /* a ramp, not a picture: its aspect ratio means nothing */
      resizeMode="stretch"
      /* Android fades a decoded image in by default; a backdrop must not arrive late */
      fadeDuration={0}
      style={[
        styles.band,
        {
          top: screenHeight * top,
          left: (screenWidth - w) / 2,
          /* Explicit, never percentages or bare position props: an Image with
             neither a width nor a height lays out and does not paint. */
          width: w,
          height,
          tintColor: color,
        },
        style,
      ]}
    />
  );
}

/**
 * Three bands, and three is the number on purpose: two read as a pattern,
 * four start to muddy the text sitting over them.
 *
 * The durations are deliberately not multiples of one another — 23, 31 and
 * 41 seconds — so the three only return to the same arrangement once every
 * several hours rather than every half minute.
 */
export function WaveBands() {
  return (
    <>
      <Band top={0.02} width={1.9} height={300} color={Brand.wave.deep} duration={41000} travel={46} direction={1} />
      <Band top={0.3} width={1.6} height={240} color={Brand.wave.mid} duration={31000} travel={62} direction={-1} />
      <Band top={0.58} width={2.1} height={360} color={Brand.wave.soft} duration={23000} travel={38} direction={1} />
    </>
  );
}

const styles = StyleSheet.create({
  /* No container opacity: the alpha lives in the colour and in the ramp, so
     the band's weight is one multiplication rather than three. */
  /* `pointerEvents` as a style, because Animated.Image takes no such prop. */
  band: { position: "absolute", pointerEvents: "none" },
});
