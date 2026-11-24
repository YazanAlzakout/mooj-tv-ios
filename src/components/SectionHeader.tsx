import { StyleSheet, Text, View } from "react-native";

import { Focusable } from "@/components/Focusable";

import { Brand, FontFamily, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";

interface SectionAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

/**
 * Accent-bar section title used across Home, details, settings, etc. —
 * one shared component so every screen's sections line up identically
 * (same bar, same weight, same action placement) instead of each screen
 * hand-rolling a slightly different variant.
 */
export function SectionHeader({
  title,
  action,
  secondaryAction,
}: {
  title: string;
  action?: SectionAction;
  secondaryAction?: SectionAction;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.bar} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {secondaryAction && (
        <Focusable onPress={secondaryAction.onPress} hitSlop={8} style={styles.actionButton}>
          <Text style={[styles.actionText, secondaryAction.destructive && styles.actionTextDestructive]}>
            {secondaryAction.label}
          </Text>
        </Focusable>
      )}
      {action && (
        <Focusable onPress={action.onPress} hitSlop={8} style={styles.actionButton}>
          <Text style={[styles.actionText, action.destructive && styles.actionTextDestructive]}>{action.label}</Text>
        </Focusable>
      )}
    </View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  bar: { width: 4, height: 18, borderRadius: 2, backgroundColor: Brand.primary },
  title: { flex: 1, color: C.text, fontSize: 16, fontFamily: FontFamily.bold },
  actionButton: { paddingHorizontal: Spacing.xs, paddingVertical: Spacing.xs },
  actionText: { color: Brand.primaryLight, fontSize: 12, fontFamily: FontFamily.semiBold },
  actionTextDestructive: { color: C.error },
  })
);
