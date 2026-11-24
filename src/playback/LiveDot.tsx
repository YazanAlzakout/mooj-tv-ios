import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

/**
 * The pulsing red dot inside the LIVE badge, matching the previous app's
 * player. Deliberately its own component: it is the only element in the
 * player that runs a continuous animation, so keeping the shared value and
 * the `useAnimatedStyle` here means a re-render of the player chrome (every
 * EPG tick, every controls show/hide) never touches the running loop.
 */
export function LiveDot() {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.25, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

const styles = StyleSheet.create({
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
});
