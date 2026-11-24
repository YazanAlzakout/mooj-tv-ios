import { useState, type ReactNode } from "react";
import type { GestureResponderEvent, PressableProps, StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

import { Brand, Radii } from "@/core/theme/tokens";

interface BouncePressableProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A `Pressable` with a quick scale-down/scale-up "bounce" on press — a
 * light, native-thread press-feedback animation (Reanimated mutates the
 * view directly, no React re-render) reused across card/row-style
 * touch targets. Deliberately a one-shot 200ms sequence, not a loop, so it
 * costs nothing once it settles.
 *
 * `Animated.createAnimatedComponent(Pressable)` directly, not a `Pressable`
 * nested inside a separate `Animated.View` — that nested form was this
 * component's original implementation, and it had a real bug: the caller's
 * `style` (which usually carries `flex: 1` / an explicit width, e.g. a
 * dialog's side-by-side buttons) landed on the *inner* Pressable, while the
 * *outer* View — the one actually laid out by the parent's flexbox — got
 * only the transform. A column-default View sizes itself from its content,
 * so with no dimension of its own to report, several real button rows
 * collapsed to zero usable width and were effectively untappable (found
 * 2026-09-03 via `ConfirmDialog`'s confirm button). Applying `style`
 * directly to the one component RN actually lays out removes the
 * possibility of that split entirely.
 */
export function BouncePressable({ style, onPress, children, ...rest }: BouncePressableProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  /**
   * A remote has no cursor and no touch, so a control that does not show
   * when it holds focus is unusable no matter how correct the D-pad
   * navigation underneath it is. This is the app's standard button, so the
   * ring here is what makes most screens navigable at all.
   *
   * Driven by the focus event rather than by `Platform.isTV` — see the note
   * in Focusable.tsx for why that check could not be trusted.
   */
  const [focused, setFocused] = useState(false);

  function handlePress(event: GestureResponderEvent) {
    // Writing a Reanimated shared value is the library's intended API (it
    // drives the native-thread animation, it isn't React state) — the
    // `react-hooks/immutability` rule can't distinguish that from mutating
    // a real prop, so the disable is scoped to exactly this line.
    // eslint-disable-next-line react-hooks/immutability
    scale.value = withSequence(withTiming(0.96, { duration: 80 }), withTiming(1, { duration: 120 }));
    onPress?.(event);
  }

  return (
    <AnimatedPressable
      style={[style, animatedStyle]}
      onPress={handlePress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...rest}
    >
      {children}
      {/* Always mounted, colour-toggled — see the note in Focusable.tsx. */}
      <View style={[styles.ring, focused && styles.ringVisible]} pointerEvents="none" />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  ring: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: Radii.md,
  },
  ringVisible: { borderColor: Brand.primary },
});
