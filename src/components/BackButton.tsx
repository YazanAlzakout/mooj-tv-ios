import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { BouncePressable } from "@/components/BouncePressable";
import { useI18n } from "@/core/i18n/I18nContext";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, themeColors } from "@/core/theme/themedStyles";
import { Radii } from "@/core/theme/tokens";

/**
 * The way back, on every screen that has one.
 *
 * ## What was here
 *
 * A 38dp disc filled with `fillSubtle`, holding the character `‹` at 22pt
 * with `marginTop: -3` to drag it onto the centre it would not sit on by
 * itself. Three things were wrong with it and they compounded: the glyph
 * is a *punctuation mark*, so its weight is set by the typeface rather
 * than by the design and it came out thin and small; the disc around it
 * was heavier than the mark inside it, so the eye read a grey blob before
 * it read a direction; and the hand-tuned offset is the tell — a shape
 * that needs nudging is a shape that is not the right shape. The verdict
 * on it was "مو عاجبني" and then "شكلو مش حلو", which is fair.
 *
 * ## What it is now
 *
 * The chevron is drawn: a square given only its left and bottom borders
 * and turned 45°, which is the standard way to make one out of a box and
 * the same border trick the tab bar glyphs use. Its weight is a number
 * here rather than a property of a font, it is optically centred by
 * construction, and it scales with the button instead of fighting a
 * baseline.
 *
 * The disc stops being filled and becomes a hairline ring, so the mark is
 * the heaviest thing in the control rather than the second heaviest.
 *
 * ## The floating variant
 *
 * On a detail screen the button sits on the artwork, where a hairline ring
 * on an unknown picture is not legible. `floating` gives it back a dark
 * fill and a white mark — it is over a photograph, so the one safe
 * assumption is that it needs its own ground.
 */

/** The ring, unchanged from the old control so no screen's header shifts. */
const SIZE = 38;

export function BackChevron({ color, size = 11 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderLeftWidth: 2.2,
        borderBottomWidth: 2.2,
        borderLeftColor: color,
        borderBottomColor: color,
        borderTopColor: "transparent",
        borderRightColor: "transparent",
        /*
         * A square with two borders, turned 45°, is a chevron. Nudged a
         * little past centre because the shape's mass sits to the right of
         * the point it is drawn around — unlike the old `marginTop: -3`,
         * this one is a property of the geometry rather than of a font.
         */
        transform: [{ rotate: "45deg" }, { translateX: size * 0.12 }, { translateY: -size * 0.12 }],
      }}
    />
  );
}

export function BackButton({
  onPress,
  floating = false,
}: {
  onPress?: () => void;
  /** True when the button sits on artwork rather than on the page. */
  floating?: boolean;
}) {
  const { t } = useI18n();
  const C = themeColors();

  return (
    <BouncePressable
      style={[styles.button, floating && styles.floating]}
      onPress={onPress ?? (() => router.back())}
      accessibilityLabel={t("common", "back")}
      accessibilityRole="button"
      hitSlop={8}
    >
      <BackChevron color={floating ? "#FFFFFF" : C.text} />
    </BouncePressable>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
    button: {
      width: SIZE,
      height: SIZE,
      borderRadius: Radii.pill,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: "center",
      justifyContent: "center",
    },
    /* Over a picture: its own ground, because the picture is unknown. */
    floating: {
      backgroundColor: "rgba(0,0,0,0.55)",
      borderColor: "rgba(255,255,255,0.22)",
    },
  })
);
