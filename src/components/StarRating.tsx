import { StyleSheet, Text, View } from "react-native";

import { FontFamily, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";

/**
 * Five-star display for a provider's 0–10 rating. Renders half-stars so a
 * 7.3 doesn't silently round to the same thing as a 6.6 — providers vary a
 * lot in how they score, and collapsing that detail makes every title look
 * alike. Only rendered when the provider actually reported a rating (master
 * prompt §21: never fabricate metadata).
 */
export function StarRating({ rating, showNumber = true }: { rating: number; showNumber?: boolean }) {
  const outOfFive = Math.min(5, Math.max(0, rating / 2));

  return (
    <View style={styles.row}>
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i + 1 <= Math.floor(outOfFive);
        const half = !filled && i < outOfFive;
        return (
          <Text key={i} style={[styles.star, (filled || half) && styles.starActive]}>
            {filled ? "★" : half ? "⯨" : "☆"}
          </Text>
        );
      })}
      {showNumber && <Text style={styles.number}>{rating.toFixed(1)}/10</Text>}
    </View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 3 },
  star: { color: C.fillStrong, fontSize: 14 },
  starActive: { color: "#F59E0B" },
  number: { color: C.textSecondary, fontSize: 12, fontFamily: FontFamily.bold, marginStart: Spacing.xs },
  })
);
