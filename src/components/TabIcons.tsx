import { useEffect } from "react";
import { StyleSheet, View, type ColorValue } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

/**
 * The five glyphs in the bottom tab bar.
 *
 * Drawn from plain views, like the icons on the home screen and for the
 * reason that one gives: there is no monochrome character in Unicode for "a
 * television with two antennas" or "a stack of episodes", the colour emoji
 * that come closest ignore the tint, and an SVG renderer for five small
 * shapes is not worth the bundle.
 *
 * ## Outline when idle, solid when selected
 *
 * The first version drew every glyph as an outline and let the tab bar's
 * tint do the rest. The verdict on it was that the bar had no life in it,
 * and the reason is that a colour change alone is the weakest signal a
 * shape can carry: against a dark ground, a grey outline and a blue outline
 * are the same drawing. Filling the selected one changes the *amount of
 * ink*, which the eye picks up before it has read anything — and it is the
 * convention every tab bar worth copying already uses.
 *
 * So each glyph takes `focused` and swaps its own fills. The tint still
 * animates underneath and the scale nudge still fires; this is the part
 * that makes the bar legible at a glance rather than merely responsive.
 */

interface GlyphProps {
  /*
   * `ColorValue`, not `string`: the tab bar animates the tint between its
   * active and inactive values and can hand down a platform colour object
   * rather than a hex string. Narrowing this to `string` would compile only
   * by throwing that away.
   */
  color: ColorValue;
  size: number;
  focused?: boolean;
}

/** Shared square so five different shapes still line up with each other. */
function Box({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {children}
    </View>
  );
}

/** A house: a border-drawn roof over a body that fills in when selected. */
export function HomeGlyph({ color, size, focused }: GlyphProps) {
  const w = size * 0.42;
  return (
    <Box size={size}>
      <View
        style={{
          borderLeftWidth: w,
          borderRightWidth: w,
          borderBottomWidth: size * 0.3,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderBottomColor: color,
        }}
      />
      <View
        style={{
          width: size * 0.56,
          height: size * 0.34,
          borderWidth: size * 0.09,
          borderTopWidth: 0,
          borderColor: color,
          backgroundColor: focused ? color : "transparent",
        }}
      />
    </Box>
  );
}

/** A television: two antennas over a screen that fills in when selected. */
export function LiveGlyph({ color, size, focused }: GlyphProps) {
  const antenna = {
    position: "absolute" as const,
    width: size * 0.07,
    height: size * 0.3,
    backgroundColor: color,
    borderRadius: size * 0.04,
  };
  return (
    <Box size={size}>
      <View style={{ width: size * 0.5, height: size * 0.26 }}>
        <View style={[antenna, { left: size * 0.17, transform: [{ rotate: "-32deg" }] }]} />
        <View style={[antenna, { right: size * 0.17, transform: [{ rotate: "32deg" }] }]} />
      </View>
      <View
        style={{
          width: size * 0.82,
          height: size * 0.5,
          borderWidth: size * 0.09,
          borderColor: color,
          borderRadius: size * 0.12,
          backgroundColor: focused ? color : "transparent",
        }}
      />
    </Box>
  );
}

/**
 * A screen with a play mark in it.
 *
 * It was a strip of film: a frame with four sprocket holes in it. Outlined
 * that read correctly, but filled — which is what the selected tab does
 * now — four light dots inside a solid rounded rectangle is a die, and
 * that is what it looked like on the device, sitting in a row of
 * perfectly legible glyphs.
 *
 * A play mark has no such failure mode in either state, and it cannot be
 * confused with Live TV beside it, which carries two antennas that this
 * one does not.
 *
 * The triangle is border-drawn: three borders, two of them transparent, is
 * how React Native produces a solid non-rectangular shape without an SVG
 * renderer. The same trick draws the roof on the home glyph.
 */
export function MoviesGlyph({ color, size, focused }: GlyphProps) {
  /* On a filled frame the mark has to be cut out of it, not drawn on it. */
  const mark = focused ? "#050A14" : color;
  return (
    <Box size={size}>
      <View
        style={{
          width: size * 0.86,
          height: size * 0.64,
          borderWidth: size * 0.09,
          borderColor: color,
          borderRadius: size * 0.12,
          backgroundColor: focused ? color : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            marginLeft: size * 0.04,
            borderTopWidth: size * 0.11,
            borderBottomWidth: size * 0.11,
            borderLeftWidth: size * 0.18,
            borderTopColor: "transparent",
            borderBottomColor: "transparent",
            borderLeftColor: mark,
          }}
        />
      </View>
    </Box>
  );
}

/**
 * A stack of episodes: three cards seen from the front, each narrower than
 * the one in front of it so the stack reads as depth rather than as a list.
 */
export function SeriesGlyph({ color, size, focused }: GlyphProps) {
  return (
    <Box size={size}>
      <View style={{ alignItems: "center" }}>
        <View
          style={{
            width: size * 0.42,
            height: size * 0.07,
            backgroundColor: color,
            borderRadius: size * 0.04,
            opacity: 0.55,
          }}
        />
        <View
          style={{
            width: size * 0.62,
            height: size * 0.07,
            backgroundColor: color,
            borderRadius: size * 0.04,
            marginTop: size * 0.06,
            opacity: 0.78,
          }}
        />
        <View
          style={{
            width: size * 0.84,
            height: size * 0.42,
            borderWidth: size * 0.09,
            borderColor: color,
            borderRadius: size * 0.1,
            marginTop: size * 0.06,
            backgroundColor: focused ? color : "transparent",
          }}
        />
      </View>
    </Box>
  );
}

/**
 * Three dots. The one glyph that needs no explaining in any language, and
 * the one that cannot fill in — so it grows instead.
 *
 * It was briefly four panes, on the argument that an ellipsis means
 * overflow and this tab is a place rather than an overflow. That argument
 * is tidy and it was not what had been asked for: the request was about
 * the *list* behind this tab, which is where the marks needed work — see
 * MenuIcons. The dots stay.
 */
export function MoreGlyph({ color, size, focused }: GlyphProps) {
  const d = focused ? 0.2 : 0.16;
  const dot = {
    width: size * d,
    height: size * d,
    borderRadius: (size * d) / 2,
    backgroundColor: color,
  };
  return (
    <Box size={size}>
      <View style={{ flexDirection: "row", gap: size * 0.11 }}>
        <View style={dot} />
        <View style={dot} />
        <View style={dot} />
      </View>
    </Box>
  );
}

/**
 * The glyph as the tab bar actually renders it: filled while its tab is the
 * selected one, and scaled up a touch on the way in.
 *
 * The spring is small on purpose, and was made smaller after the first
 * build read as overdone: this fires on every tab press, several times a
 * minute, and anything with real travel in it is tiring by the third day. A
 * 7% scale and a pixel and a half of lift is enough to say that something
 * responded, and little enough that nobody will ever describe it.
 *
 * `{ duration, dampingRatio }` is the Reanimated 4 spring form. The older
 * `{ stiffness, damping }` pair still works, but `restDisplacementThreshold`
 * and friends do not — version 4 ignores them in silence, which is how a
 * spring that looked configured sat visibly wrong for a week in the project
 * this was cloned from.
 */
export function AnimatedTabGlyph({
  Glyph,
  color,
  focused,
}: {
  Glyph: (props: GlyphProps) => React.ReactElement;
  color: ColorValue;
  focused: boolean;
}) {
  const lift = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    lift.value = withSpring(focused ? 1 : 0, { duration: 260, dampingRatio: 0.9 });
    // `lift` is a shared value and never changes identity; `focused` is the input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + lift.value * 0.07 }, { translateY: -lift.value * 1.5 }],
  }));

  /*
   * The pill is what makes the bar look like it was drawn this decade.
   *
   * A row of glyphs that differ only in tint is the oldest tab bar there
   * is, and that was the complaint. A shape *behind* the selected one
   * carries the state at a glance and from the corner of the eye, which a
   * tint cannot — and it grows in from 0.7 rather than appearing, so the
   * selection moves between tabs instead of blinking from one to the next.
   */
  const pill = useAnimatedStyle(() => ({
    opacity: lift.value,
    transform: [{ scale: 0.7 + lift.value * 0.3 }],
  }));

  return (
    <Animated.View style={style}>
      <Animated.View pointerEvents="none" style={[styles.pill, pill]} />
      <Glyph color={color} size={22} focused={focused} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    left: -14,
    right: -14,
    top: -6,
    bottom: -6,
    borderRadius: 999,
    backgroundColor: "rgba(62,185,235,0.16)",
  },
});
