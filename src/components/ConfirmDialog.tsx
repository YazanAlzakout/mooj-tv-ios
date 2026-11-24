import { useEffect } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useI18n } from "@/core/i18n/I18nContext";
import { Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, themeColors } from "@/core/theme/themedStyles";

import { BouncePressable } from "./BouncePressable";

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + red icon for destructive actions (clear, delete, disconnect). */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const OPEN_DURATION_MS = 220;
const CLOSE_DURATION_MS = 150;
const EASE = Easing.out(Easing.cubic);

/**
 * Themed, animated replacement for `Alert.alert()` confirmations — the
 * native dialog ignores the app's fonts, colors and RTL layout entirely and
 * reads as a jarring OS popup inside an otherwise fully branded app. Renders
 * in a transparent `Modal` so the hardware back button (Android) and a
 * backdrop tap both cancel, and so it sits above every other overlay.
 *
 * The open/close motion is driven directly by `visible` via `withTiming`
 * (opacity + a small scale, both easing out, no spring) rather than
 * Reanimated's declarative `entering={...}` prop. Two reasons: a spring
 * "pop" (this component's original animation) reads as playful rather than
 * the calm, deliberate motion a confirmation — often a destructive one —
 * should have; and `entering` only plays on first mount, which for a
 * `Modal` whose content stays mounted across `visible` toggles means it
 * would never replay on a second open. Driving it from `visible` fixes
 * both at once.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const accent = danger ? themeColors().error : Brand.primary;

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: visible ? OPEN_DURATION_MS : CLOSE_DURATION_MS,
      easing: EASE,
    });
  }, [visible, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.97 + progress.value * 0.03 }],
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        {/* See the note in this file's header: never focusable. */}
        <Pressable style={StyleSheet.absoluteFill} focusable={false} onPress={onCancel} />
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={[styles.iconWrap, { backgroundColor: danger ? "rgba(255,138,138,0.14)" : Brand.primaryMuted }]}>
            <Text style={[styles.iconText, { color: accent }]}>{danger ? "!" : "?"}</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttonRow}>
            {/* The remote lands on Cancel, never on the destructive option. */}
            <BouncePressable style={[styles.button, styles.cancelButton]} onPress={onCancel} hasTVPreferredFocus>
              <Text style={styles.cancelText}>{cancelLabel ?? t("common", "cancel")}</Text>
            </BouncePressable>
            <BouncePressable
              style={[styles.button, { backgroundColor: danger ? "#C81E1E" : Brand.primary }]}
              onPress={onConfirm}
            >
              <Text style={styles.confirmText}>{confirmLabel ?? t("common", "confirm")}</Text>
            </BouncePressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: C.surfaceElevated,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  iconText: { fontSize: 26, fontFamily: FontFamily.black },
  title: { color: C.text, fontSize: 17, fontFamily: FontFamily.bold, textAlign: "center" },
  message: {
    color: C.textSecondary,
    fontSize: 13,
    fontFamily: FontFamily.regular,
    textAlign: "center",
    lineHeight: 20,
  },
  buttonRow: { flexDirection: "row", gap: Spacing.md, width: "100%", marginTop: Spacing.sm },
  button: { flex: 1, height: 46, borderRadius: Radii.md, alignItems: "center", justifyContent: "center" },
  cancelButton: { backgroundColor: C.fillMedium },
  cancelText: { color: C.text, fontSize: 14, fontFamily: FontFamily.semiBold },
  confirmText: { color: "#fff", fontSize: 14, fontFamily: FontFamily.bold },
  })
);
