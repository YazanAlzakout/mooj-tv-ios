import { useEffect } from "react";
import { StyleSheet, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shimmer loading placeholder — a translucent stripe sweeping across a dim
 * base, driven on the native thread by Reanimated. Deliberately built
 * without `expo-linear-gradient` (not a dependency of this project — adding
 * it would force a native rebuild, see docs/DECISIONS.md), so the stripe is
 * a soft solid band rather than a gradient; at this opacity the difference
 * is imperceptible. Measures its own width with `onLayout` so the sweep is
 * in real pixels (transform translateX doesn't accept percentages reliably).
 */
export function Skeleton({ width = "100%", height = 16, borderRadius = 8, style }: SkeletonProps) {
  const progress = useSharedValue(0);
  const measuredWidth = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }), -1, false);
    // Runs once on mount — loops for the placeholder's whole lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stripeStyle = useAnimatedStyle(() => {
    const w = measuredWidth.value;
    const stripeWidth = w * 0.6;
    return {
      width: stripeWidth,
      transform: [{ translateX: -stripeWidth + progress.value * (w + stripeWidth) }],
    };
  });

  return (
    <Animated.View
      onLayout={(e) => {
        measuredWidth.value = e.nativeEvent.layout.width;
      }}
      style={[styles.base, { width, height, borderRadius }, style]}
    >
      <Animated.View style={[styles.stripe, stripeStyle]} />
    </Animated.View>
  );
}

/*
 * Themed, because a placeholder made of translucent *white* is exactly
 * nothing on a white page — the details screens showed a blank sheet
 * while loading instead of a shimmer.
 */
const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
    base: { backgroundColor: C.fillSubtle, overflow: "hidden" },
    stripe: { position: "absolute", top: 0, bottom: 0, backgroundColor: C.fillMedium },
  })
);
