import { Image, StyleSheet } from "react-native";

/**
 * The shade that lets a title be read over artwork.
 *
 * ## It is one image, and it had to become one
 *
 * This has now been three things. A single translucent band drew a
 * straight line across every poster. Eight stacked bands with rising
 * alphas were meant to hide that line by splitting it into eight smaller
 * ones — and on screen they did not hide it, they multiplied it: a
 * screenshot of the home hero on 2026-11-08 shows all eight edges as
 * clear horizontal steps across a bright still.
 *
 * The reason is that a flat band has a hard edge no matter how faint it
 * is. The eye finds a discontinuity in a smooth surface far below the
 * contrast at which it can name the shade either side of it — which is
 * why a sky photographed in 8-bit bands and a sky painted in eight steps
 * both look wrong, and why neither gets better by making the steps
 * fainter.
 *
 * So the ramp is painted into a file instead. `assets/images/art-scrim.png`
 * is 4 by 512 pixels of black whose alpha follows `0.74 * (y/h)²`, built
 * with ffmpeg; its largest step between adjacent rows is one part in 255,
 * which is the smallest difference the format can hold. Stretched over the
 * card, the hardware interpolates between those rows, so there is no edge
 * anywhere in it to find.
 *
 * ## What it costs
 *
 * One native view instead of eight, on a screen that draws this on every
 * card — twelve on a grid, fourteen more down the home rows. The file is
 * 231 bytes. There was never a performance argument for the stack; it was
 * eight views doing worse than one.
 *
 * `expo-linear-gradient` would also solve it and remains the one thing
 * this does not reach for: it is a native module, and a 231-byte asset
 * does not justify one.
 *
 * ## Why it reaches so far up
 *
 * To 62% of the height, which is more than a single line of text needs.
 * Titles wrap: a two-line name on a poster whose shade stopped at 40% had
 * its first line sitting on bare artwork, which is the case that was
 * actually unreadable. The shade has to cover the tallest title the card
 * can produce, not the usual one. The square curve means that extra reach
 * costs almost nothing — at the halfway mark the shade is still only 18%,
 * and the artwork reads through it.
 */
export function ArtScrim() {
  return (
    <Image
      source={require("../../assets/images/art-scrim.png")}
      style={styles.scrim}
      /*
       * `stretch`, not `cover`: this is a ramp, not a picture. Its aspect
       * ratio means nothing and preserving it would letterbox the shade.
       */
      resizeMode="stretch"
      /* Android fades a decoded image in by default; a scrim must not arrive late. */
      fadeDuration={0}
    />
  );
}

const styles = StyleSheet.create({
  /*
   * `pointerEvents` lives in the style here, not as a prop: `Image` does
   * not take the prop (checked against the installed ImageProps), and a
   * shade that swallows a tap on the card under it is a broken card.
   */
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "62%",
    pointerEvents: "none",
  },
});
