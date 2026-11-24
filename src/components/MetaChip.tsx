import { StyleSheet, Text, View } from "react-native";

import { FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";

/**
 * Small pill for a single piece of real metadata (year, runtime, season
 * count, genre). Only rendered by callers when the provider actually
 * supplied the value — an absent field shows nothing rather than a
 * placeholder chip.
 */
export function MetaChip({ label, glyph, tint }: { label: string; glyph?: string; tint?: string }) {
  return (
    <View style={[styles.chip, tint ? { backgroundColor: `${tint}22`, borderColor: `${tint}55` } : null]}>
      {glyph && <Text style={[styles.glyph, tint ? { color: tint } : null]}>{glyph}</Text>}
      <Text style={[styles.text, tint ? { color: tint } : null]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: C.fillSubtle,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
  },
  glyph: { color: C.textSecondary, fontSize: 11 },
  text: { color: C.textSecondary, fontSize: 11, fontFamily: FontFamily.medium },
  })
);
