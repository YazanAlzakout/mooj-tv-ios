import { useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Brand, Radii } from "@/core/theme/tokens";

/**
 * A Pressable that also works from a TV remote.
 *
 * On a phone this is an ordinary Pressable and costs nothing: a touch
 * screen never produces a focus event, so the ring never appears. Wherever
 * a D-pad *does* move focus onto it, the ring is drawn — a remote user has
 * no cursor and no touch, and without a visible focus state the screen is
 * unusable however correct the navigation underneath is.
 *
 * `hasTVPreferredFocus` marks the control the remote should land on when a
 * screen opens; exactly one control per screen should set it.
 *
 * Note: the focus ring is drawn as a sibling overlay rather than by
 * swapping the Pressable's own style, so a focus change never re-runs the
 * child's layout — these wrap list rows, and a layout pass per D-pad step
 * is exactly the kind of cost that made scrolling stutter before.
 *
 * The ring view is also **always mounted**, and only its border colour
 * changes. Rendering it conditionally meant every single D-pad step
 * created two native views and destroyed two others — one pair for the row
 * being left, one for the row being entered — and that is view-tree work on
 * the UI thread, in the one moment that has to feel immediate. Measured on
 * the test television, view building on the UI thread was 193 of 206 janky
 * frames while navigating. A colour swap on a view that already exists
 * costs a property update and no layout at all (the ring is
 * `absoluteFill` + `pointerEvents="none"`, so it never participates in
 * layout regardless).
 */
export function Focusable({
  children,
  onPress,
  style,
  hasTVPreferredFocus,
  disabled,
  hitSlop,
  onFocus,
  /**
   * Draws the ring inside a fully rounded control instead of over its
   * corners — for pills and circular icon buttons, where a square ring
   * reads as a mistake.
   */
  round,
  accessibilityLabel,
  accessibilityState,
  /**
   * What a screen reader should call this.
   *
   * "button" is right for nearly all forty-odd call sites and stays the
   * default — but it was *hard-coded* until 2026-11-18, and by then it had
   * stopped being true everywhere. Two kinds of call site are not buttons,
   * and both appeared as this component spread onto the television:
   *
   * - the five items in MoojTabBar, which are tabs; they already pass
   *   `accessibilityState={{ selected }}`, and that state only means
   *   anything to a screen reader next to the matching role. They now pass
   *   `"tab"`.
   * - the stops that exist only to give the focus ring somewhere to go, so
   *   that Down means "read on" in a document a remote cannot otherwise
   *   scroll: the trace lines in CrashScreen (`"text"`) and the cards in
   *   legal.tsx and licences.tsx. Their `onPress` is an empty function on
   *   purpose, and announcing a paragraph of an agreement as a button
   *   promises an action that does not exist. Those two screens are twins,
   *   kept deliberately identical, so they still take the default here and
   *   should be moved off it in one edit rather than one at a time.
   *
   * A prop rather than a guess inside this component: only the caller knows
   * what the thing it is wrapping actually is.
   */
  accessibilityRole = "button",
}: {
  children: ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  hitSlop?: number;
  round?: boolean;
  accessibilityRole?: AccessibilityRole;
  /** Fired when the D-pad moves focus onto this control. */
  onFocus?: () => void;
  /**
   * Passed straight to the Pressable.
   *
   * 2026-11-14: added for the tab bar, which announces its five section names
   * to a screen reader and had to keep doing that while gaining the ring.
   * A control swapping to this one should be able to bring its accessibility
   * with it rather than lose it in the swap.
   */
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean; disabled?: boolean };
}) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={style}
      hitSlop={hitSlop}
      hasTVPreferredFocus={hasTVPreferredFocus}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => setFocused(false)}
    >
      {children}
      <View
        style={[styles.ring, round && styles.ringRound, focused && styles.ringVisible]}
        pointerEvents="none"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ring: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2,
    // Transparent rather than absent: the border box exists at all times so
    // showing the ring is a colour change, never a mount. See above.
    borderColor: "transparent",
    borderRadius: Radii.md,
  },
  ringVisible: { borderColor: Brand.primary },
  ringRound: { borderRadius: Radii.pill },
});
