import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { GestureHudKind } from "@/playback/usePlayerGestures";

/**
 * The readout that appears while a volume or dim swipe is in progress, and
 * fades out on its own.
 *
 * ## Vertical, on the gesture's own side, and clear of the hand
 *
 * It used to be a horizontal pill in the dead centre of the picture, over
 * whatever the viewer was watching, and it was rejected for exactly that
 * (2026-09-16: "وشكل الصوت وبنصف الشاشة بشع / حطه على اليمين" — the volume's
 * shape in the middle of the screen is ugly, put it on the right; then
 * "حطهم على جنب بشكل عامودي" — put them on the side, vertically).
 *
 * So it is a slim vertical slider on the side the gesture belongs to:
 * volume on the **right**, dim on the **left**, matching the halves
 * `usePlayerGestures` divides the picture into.
 *
 * It is *not* flush with that edge, though, and the reason is the whole
 * point of `HAND_CLEARANCE` below: the hand drawing the slider is holding
 * the phone by that same edge, so a readout pinned there is hidden under
 * the thumb reading it.
 *
 * `left`/`right` are physical and never `start`/`end`. The app forces RTL,
 * and the gesture split is decided from a physical `pageX` — so a mirrored
 * readout would show volume on the side that dims. The same trap the
 * pillarbox note in the live player documents.
 *
 * Always `pointerEvents="none"`: it sits directly over the video and must
 * never intercept the gesture that is drawing it.
 */
export function GestureHud({ kind, value }: { kind: GestureHudKind; value: number }) {
  /*
    Called before the early return, because hooks have to be. The readout is
    absent far more often than it is present, and a window-dimensions
    subscription costs nothing while it is.
  */
  const { width } = useWindowDimensions();

  if (!kind) return null;

  const percent = Math.round(value * 100);
  const isVolume = kind === "volume";
  const inset = Math.min(HAND_CLEARANCE, width * MAX_CLEARANCE_FRACTION);

  return (
    <View
      style={[styles.wrap, isVolume ? { right: inset } : { left: inset }]}
      pointerEvents="none"
    >
      <Text style={styles.glyph}>{isVolume ? "♫" : "☀"}</Text>
      {/*
        The groove sits inside a slightly larger casing, which is what gives
        the bar its depth — a single flat rectangle on top of video reads as
        a stray artefact, two concentric capsules read as an object.

        `justifyContent: "flex-end"` on the groove, with the fill given a
        percentage height, is what makes the level grow upward from the
        bottom — the direction the finger moves to raise it.
      */}
      <View style={styles.casing}>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { height: `${percent}%`, backgroundColor: isVolume ? Brand.primary : DIM_FILL },
            ]}
          />
        </View>
      </View>
      <Text style={styles.value}>{percent}%</Text>
    </View>
  );
}

const TRACK_HEIGHT = 180;
/**
 * 12pt. A 6pt groove was a hairline at arm's length; this reads as something
 * you are holding and moving, and it gives the fill enough body for its
 * rounded cap to be seen rather than implied.
 */
const TRACK_WIDTH = 12;
/** How far the casing stands out past the groove on every side. */
const CASING_PADDING = 6;

/**
 * The brightness fill, warm rather than brand red.
 *
 * The two sliders are identical in shape and sit on opposite edges, so colour
 * is the only thing that tells them apart at a glance — and a warm light is
 * what brightness means, the same idea as the ☀ above it. Volume keeps the
 * brand red.
 */
const DIM_FILL = "#FFC978";

/**
 * How far in from the edge the readout sits — deliberately not a spacing
 * token.
 *
 * It began at `Spacing.xl`, 24dp, which put it directly beneath the thumb
 * that was drawing it: "عندما أضع إصبعي يختفي المسار تحت إصبعي ولا أراه"
 * (2026-09-16). A phone held sideways in two hands has a thumb lying on
 * each edge, and a thumb covers something like 60 to 90dp inward — so an
 * indicator anywhere in that band is an indicator the person adjusting it
 * cannot see.
 *
 * 88dp fixed that, and the viewer then asked for the same distance again
 * ("* 2 او 1.5"), which is this. On the 873dp landscape width it sits 20%
 * in and the two readouts stay about 520dp apart, so there is still no
 * question of which one is volume.
 *
 * It is a reach-clearance measurement, not a rhythm in the layout, which is
 * why it is its own number rather than a token.
 */
const HAND_CLEARANCE = 176;

/**
 * The cap that keeps the clearance sane on a narrow screen.
 *
 * 176dp from each edge is a fifth of a landscape screen but nearly half of
 * a portrait one: at 393dp wide it would leave the two readouts 41dp apart,
 * collapsed into the middle of the picture — which is precisely the
 * placement that was rejected in the first place. The gesture surface does
 * appear in portrait (whenever the split channel layout is switched off),
 * so this is a real case and not a hypothetical.
 *
 * A fifth of the width keeps the geometry the same shape at any size: the
 * fixed figure wins on a wide screen, the proportion takes over on a narrow
 * one, and the two never meet in the centre.
 */
const MAX_CLEARANCE_FRACTION = 0.2;

const styles = StyleSheet.create({
  /*
    Inset from one edge and centred vertically. `top: 0, bottom: 0` with
    `justifyContent: "center"` rather than a computed `top`, so it stays
    centred in portrait and landscape without measuring anything.
  */
  wrap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
  },
  /*
    The icon and the number carry a shadow instead of a box.

    Both used to sit in their own translucent pills, which meant three
    stacked rectangles for one reading. A shadow does the same job — it is
    what keeps white legible over a bright frame — without drawing another
    edge, and the result is the bar plus two marks rather than a small
    stack of panels.
  */
  glyph: {
    color: "#FFFFFF",
    fontSize: 15,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  /**
   * The casing: a soft dark capsule a few points larger than the groove on
   * every side.
   *
   * This is the whole of what makes the bar look like a control rather than
   * a scratch on the picture, and it is also what keeps it readable on any
   * frame: the groove's own translucency disappears against video of a
   * similar tone, while a capsule with a rim does not.
   */
  casing: {
    padding: CASING_PADDING,
    borderRadius: Radii.pill,
    backgroundColor: "rgba(0,0,0,0.34)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
  },
  /*
    A capsule, not a bar with square ends. `Radii.pill` on a 10pt width is
    far past half of it, which is what rounds the ends completely instead of
    merely softening the corners.
  */
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: Radii.pill,
    backgroundColor: "rgba(255,255,255,0.24)",
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  /*
    The fill is rounded too, so the level has a domed cap rather than the
    flat cut an unrounded child inside a clipped parent leaves. At a low
    level it reads as a small lozenge resting at the bottom; at full it
    meets the groove's own curve exactly.
  */
  /* `backgroundColor` is set per kind at the call site — see DIM_FILL. */
  fill: {
    width: "100%",
    borderRadius: Radii.pill,
  },
  value: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.semiBold,
    // Fixed, so the readout does not shuffle sideways between 9% and 100%.
    minWidth: 42,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
