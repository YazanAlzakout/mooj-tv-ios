import { StyleSheet, Text, View, type ColorValue } from "react-native";

import { AndroidTextFix } from "@/core/theme/tokens";

/**
 * The marks on the More list and in Settings.
 *
 * ## What was there, and why it had to go
 *
 * Six characters: `⌕ ★ ⏱ ⬇ ◷ ⚙`. They look like one set in a source file
 * and are three different things on a phone. `⏱` and `⬇` are emoji —
 * Android draws them in colour from its own font and ignores the tint
 * entirely, so two of the six were never the colour they were asked to
 * be. `⌕` is U+2315, a rare glyph the bundled Noto Kufi does not carry and
 * most system fonts render as a notch or a blank. `◷` and `⚙` land at
 * wildly different optical weights from each other.
 *
 * So the five that can be drawn are drawn, out of plain views, at one
 * stroke weight, in whatever colour they are handed — the same approach
 * the tab bar glyphs take and for the same reasons given there.
 *
 * ## Except the star
 *
 * `★` stays a character, and that is a decision rather than an omission.
 * A five-pointed star cannot be built from borders without three
 * carefully offset rotated triangles, and it is the one mark in this set
 * whose meaning is already fixed elsewhere in the app: the same `★` marks
 * a favourite channel on its card and a saved title on its detail screen.
 * Drawing a slightly different star here would be the inconsistency this
 * file exists to remove. It is also a plain monochrome glyph rather than
 * an emoji, so unlike `⏱` it takes the colour it is given.
 *
 * A filled star among stroked marks is what icon sets do anyway — a
 * favourite is the thing you have already acted on.
 */

interface IconProps {
  color: ColorValue;
  size: number;
}

/** Shared square, so six different shapes sit on one baseline. */
function Box({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {children}
    </View>
  );
}

/** A magnifier: a ring with a handle off its lower corner. */
export function SearchIcon({ color, size }: IconProps) {
  const ring = size * 0.62;
  return (
    <Box size={size}>
      <View style={{ width: size, height: size }}>
        <View
          style={{
            position: "absolute",
            top: size * 0.06,
            left: size * 0.06,
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            borderWidth: size * 0.1,
            borderColor: color,
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: size * 0.08,
            right: size * 0.08,
            width: size * 0.3,
            height: size * 0.1,
            borderRadius: size * 0.05,
            backgroundColor: color,
            transform: [{ rotate: "45deg" }],
          }}
        />
      </View>
    </Box>
  );
}

/**
 * A star, as a character. See the note at the top of this file for why
 * this one is not drawn.
 */
export function FavoriteIcon({ color, size }: IconProps) {
  return (
    <Box size={size}>
      <Text style={[styles.glyph, { color, fontSize: size * 0.95 }]}>★</Text>
    </Box>
  );
}

/**
 * A bookmark: saved to come back to.
 *
 * Not a clock, although the label says "Watch Later". A clock here would
 * sit two rows above the History clock and the two would read as the same
 * thing — and what the viewer does on this row is put something aside,
 * which is what a bookmark means and what a clock does not.
 *
 * The notch at the foot is cut by a triangle drawn in reverse: transparent
 * side borders with a coloured bottom one makes a solid triangle, and here
 * it is the *background* that shows through instead, which is why this one
 * is built from two uprights and a pair of feet rather than a filled slab.
 */
export function WatchLaterIcon({ color, size }: IconProps) {
  const stroke = size * 0.1;
  const upright = {
    position: "absolute" as const,
    top: 0,
    width: stroke,
    height: size * 0.78,
    backgroundColor: color,
    borderRadius: stroke / 2,
  };
  const foot = {
    position: "absolute" as const,
    bottom: size * 0.04,
    width: stroke,
    height: size * 0.3,
    backgroundColor: color,
    borderRadius: stroke / 2,
  };
  return (
    <Box size={size}>
      <View style={{ width: size * 0.64, height: size * 0.86 }}>
        {/* The top bar closes the two uprights into a ribbon. */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: stroke,
            backgroundColor: color,
            borderRadius: stroke / 2,
          }}
        />
        <View style={[upright, { left: 0 }]} />
        <View style={[upright, { right: 0 }]} />
        {/* The two feet meet in the middle and make the notch between them. */}
        <View style={[foot, { left: size * 0.17, transform: [{ rotate: "32deg" }] }]} />
        <View style={[foot, { right: size * 0.17, transform: [{ rotate: "-32deg" }] }]} />
      </View>
    </Box>
  );
}

/** An arrow falling into a tray. */
export function DownloadIcon({ color, size }: IconProps) {
  const stroke = size * 0.1;
  return (
    <Box size={size}>
      <View style={{ width: size * 0.8, height: size * 0.86 }}>
        <View
          style={{
            position: "absolute",
            top: 0,
            left: size * 0.35,
            width: stroke,
            height: size * 0.4,
            backgroundColor: color,
            borderRadius: stroke / 2,
          }}
        />
        {/* Border-drawn arrowhead — the same trick as the tab bar's play mark. */}
        <View
          style={{
            position: "absolute",
            top: size * 0.36,
            left: size * 0.21,
            borderLeftWidth: size * 0.19,
            borderRightWidth: size * 0.19,
            borderTopWidth: size * 0.22,
            borderLeftColor: "transparent",
            borderRightColor: "transparent",
            borderTopColor: color,
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: stroke,
            backgroundColor: color,
            borderRadius: stroke / 2,
          }}
        />
      </View>
    </Box>
  );
}

/** A clock, hands at ten past ten so neither lies along an edge. */
export function HistoryIcon({ color, size }: IconProps) {
  const face = size * 0.84;
  const stroke = size * 0.09;
  return (
    <Box size={size}>
      <View
        style={{
          width: face,
          height: face,
          borderRadius: face / 2,
          borderWidth: stroke,
          borderColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* The long hand, up. */}
        <View
          style={{
            position: "absolute",
            top: face * 0.16,
            width: stroke * 0.8,
            height: face * 0.3,
            backgroundColor: color,
            borderRadius: stroke,
          }}
        />
        {/* The short hand, out to the right. */}
        <View
          style={{
            position: "absolute",
            left: face * 0.36,
            width: face * 0.24,
            height: stroke * 0.8,
            backgroundColor: color,
            borderRadius: stroke,
          }}
        />
      </View>
    </Box>
  );
}

/** Sliders: three settings, each at its own position. */
export function SettingsIcon({ color, size }: IconProps) {
  const stroke = size * 0.09;
  const knob = size * 0.22;
  const rail = {
    position: "absolute" as const,
    left: 0,
    right: 0,
    height: stroke,
    backgroundColor: color,
    borderRadius: stroke / 2,
  };
  const dot = {
    position: "absolute" as const,
    width: knob,
    height: knob,
    borderRadius: knob / 2,
    borderWidth: stroke,
    borderColor: color,
    /*
     * The knob has to cover the rail it sits on or the rail shows through
     * its middle and it stops reading as a control. There is no page
     * colour available here, so it is drawn as a ring and the rail is
     * broken by the ring's own border — which is why the border is the
     * full stroke weight rather than a hairline.
     */
    backgroundColor: "#050A14",
  };
  return (
    <Box size={size}>
      <View style={{ width: size * 0.92, height: size * 0.78 }}>
        <View style={[rail, { top: size * 0.06 }]} />
        <View style={[dot, { top: size * 0.06 - (knob - stroke) / 2, left: size * 0.14 }]} />

        <View style={[rail, { top: size * 0.35 }]} />
        <View style={[dot, { top: size * 0.35 - (knob - stroke) / 2, right: size * 0.14 }]} />

        <View style={[rail, { top: size * 0.64 }]} />
        <View style={[dot, { top: size * 0.64 - (knob - stroke) / 2, left: size * 0.38 }]} />
      </View>
    </Box>
  );
}

const styles = StyleSheet.create({
  glyph: { ...AndroidTextFix },
});
