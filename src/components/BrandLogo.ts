import type { ImageSourcePropType } from "react-native";

const MARK = require("../../assets/images/logo.png") as ImageSourcePropType;

/**
 * The brand mark.
 *
 * There used to be two files here — a near-black wordmark for light
 * backgrounds and a white one for dark — because the previous brand's mark
 * was lettering, and lettering has to be drawn in an ink that contrasts
 * with whatever is behind it. A single file would have been a white word on
 * a white page the moment light mode existed.
 *
 * Mooj's mark is not lettering. It is a self-lit sphere with its own
 * gradient and its own dark edge, so it holds against a light page and a
 * dark one without being redrawn — and the name beside it on the home
 * screen is live text taking the theme's own ink (see BRAND.wordmark),
 * which is better than a picture of a word at any size.
 *
 * So: one asset, and the two functions below kept as they were. Call sites
 * do not need to know that the answer stopped depending on the theme, and
 * a brand whose mark *is* lettering can restore the split here alone.
 */
export function brandLogoSource(): ImageSourcePropType {
  return MARK;
}

/**
 * The mark for surfaces that are black whatever the app's palette is — the
 * video players, and the message drawn over a stopped stream.
 */
export function brandLogoOnDark(): ImageSourcePropType {
  return MARK;
}
