import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput } from "react-native";

import { Focusable } from "@/components/Focusable";

import { useI18n } from "@/core/i18n/I18nContext";
import { Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, themeColors } from "@/core/theme/themedStyles";

export const PIN_LENGTH = 4;

/**
 * Asks for the parental PIN before revealing something.
 *
 * This is a household control, not a security boundary: the PIN is stored
 * in the app database in plain text, and anyone who can unlock the phone
 * and read app storage can read it. It exists so a child tapping around
 * cannot casually turn hidden categories back on — nothing more, and the
 * code says so rather than implying a protection it does not provide.
 */
export function PinPrompt({
  visible,
  expectedPin,
  title,
  onCancel,
  onSuccess,
}: {
  visible: boolean;
  expectedPin: string;
  title: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { t } = useI18n();
  const [entry, setEntry] = useState("");
  const [wrong, setWrong] = useState(false);

  /** Reset each time the sheet opens — React's adjust-state-during-render pattern. */
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setEntry("");
      setWrong(false);
    }
  }

  function submit(value: string) {
    if (value === expectedPin) {
      onSuccess();
      return;
    }
    setWrong(true);
    setEntry("");
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} focusable={false} onPress={onCancel}>
        <Pressable style={styles.card} focusable={false} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={[styles.input, wrong && styles.inputWrong]}
            value={entry}
            onChangeText={(value) => {
              const digits = value.replace(/\D/g, "").slice(0, PIN_LENGTH);
              setEntry(digits);
              setWrong(false);
              if (digits.length === PIN_LENGTH) submit(digits);
            }}
            keyboardType="number-pad"
            secureTextEntry
            autoFocus
            maxLength={PIN_LENGTH}
            placeholder={"•".repeat(PIN_LENGTH)}
            placeholderTextColor={themeColors().textMuted}
          />
          {wrong && <Text style={styles.wrongText}>{t("parental", "wrongPin")}</Text>}
          <Focusable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>{t("common", "cancel")}</Text>
          </Focusable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  card: {
    width: "80%",
    maxWidth: 320,
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: Radii.xl,
    backgroundColor: C.surface,
  },
  title: { color: C.text, fontSize: 15, lineHeight: 24, fontFamily: FontFamily.bold, textAlign: "center" },
  input: {
    width: "100%",
    textAlign: "center",
    letterSpacing: 8,
    color: C.text,
    fontSize: 22,
    fontFamily: FontFamily.bold,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  inputWrong: { borderBottomColor: C.error },
  wrongText: { color: C.error, fontSize: 12, lineHeight: 20, fontFamily: FontFamily.medium },
  cancelButton: { paddingVertical: Spacing.xs, paddingHorizontal: Spacing.lg },
  cancelText: { color: Brand.primaryLight, fontSize: 13, lineHeight: 22, fontFamily: FontFamily.semiBold },
  })
);
