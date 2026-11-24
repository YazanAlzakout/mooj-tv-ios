import Constants from "expo-constants";
import { Image, Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BouncePressable } from "@/components/BouncePressable";
import { brandLogoSource } from "@/components/BrandLogo";
import { ScreenBackground } from "@/components/ScreenBackground";
import { useI18n } from "@/core/i18n/I18nContext";
import { startPlayUpdate } from "@/core/update/playUpdate";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";

/**
 * Hands the update to Play if Play will take it, and opens the store page
 * if it will not.
 *
 * Play's own flow is much better than a store page: it downloads inside the
 * app, keeps the viewer where they are, and needs no navigating. But it
 * answers only for an install that came from Play, so on a sideloaded build
 * — which is every build we can make here — it declines, and the store page
 * is what the viewer gets. Both paths end somewhere a person can act.
 */
async function runUpdate() {
  if (await startPlayUpdate()) return;
  await openStore();
}

/**
 * Opens this app's page in the store.
 *
 * `market://` hands straight to the installed Play app — on a television as
 * well, where the Play Store handles the same scheme — and skips the
 * browser entirely. The https form is the fallback for a device without
 * Play, where it at least lands somewhere a person can act on instead of
 * failing silently.
 *
 * The package id is read from the manifest rather than written here, so
 * this cannot drift from the id the app was actually built with.
 */
async function openStore() {
  const pkg = Constants.expoConfig?.android?.package;
  if (!pkg) return;
  const appUrl = `market://details?id=${pkg}`;
  const webUrl = `https://play.google.com/store/apps/details?id=${pkg}`;
  try {
    await Linking.openURL(appUrl);
  } catch {
    await Linking.openURL(webUrl).catch(() => {});
  }
}

/**
 * The end of the road for a build that is no longer allowed to run.
 *
 * Rendered *instead of* the startup gate's routing, not pushed on top of
 * it — so there is no screen underneath, no navigation history, and no back
 * gesture that returns to the app. That is the point: this is reached only
 * when a minimum version has been published that this build is definitely
 * below (see core/update/requiredUpdate.ts, which fails open on every
 * uncertainty), and in that situation letting the viewer past it would mean
 * running code known to be broken against a live service.
 *
 * There is deliberately no "later" button **in the blocking case**. One
 * would make that mechanism a suggestion, and a suggestion is what the
 * ordinary Play auto-update already is.
 *
 * `onDismiss` switches it to the soft case: the same screen, different
 * words, and a way through. That is for a build which is merely behind the
 * newest published one — see `UpdateStatus` in core/update/requiredUpdate.ts
 * for why that case must never block, and note that it reappears on every
 * launch until the update is actually installed, which is what was asked
 * for (2026-09-17: "في كل مرة يفتح فيها المستخدم التطبيق").
 */
export function UpdateRequiredScreen({ onDismiss }: { onDismiss?: () => void } = {}) {
  const { t } = useI18n();
  const optional = onDismiss !== undefined;

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Image source={brandLogoSource()} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>
            {t("update", optional ? "availableTitle" : "requiredTitle")}
          </Text>
          <Text style={styles.body}>
            {t("update", optional ? "availableBody" : "requiredBody")}
          </Text>
          <BouncePressable style={styles.button} onPress={runUpdate} hasTVPreferredFocus>
            <Text style={styles.buttonText}>{t("update", "updateNow")}</Text>
          </BouncePressable>
          {/*
            Only in the soft case, and deliberately quieter than the update
            button: dismissing is the lesser of the two things to do here.
          */}
          {onDismiss && (
            <BouncePressable style={styles.laterButton} onPress={onDismiss}>
              <Text style={styles.laterText}>{t("update", "later")}</Text>
            </BouncePressable>
          )}
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
    safeArea: { flex: 1 },
    content: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: Spacing.xxl,
      gap: Spacing.lg,
    },
    logo: { width: 120, height: 68, marginBottom: Spacing.md },
    title: {
      color: C.text,
      fontSize: 22,
      lineHeight: 34,
      fontFamily: FontFamily.extraBold,
      textAlign: "center",
      ...AndroidTextFix,
    },
    body: {
      color: C.textSecondary,
      fontSize: 15,
      lineHeight: 24,
      fontFamily: FontFamily.regular,
      textAlign: "center",
      maxWidth: 360,
      ...AndroidTextFix,
    },
    button: {
      marginTop: Spacing.md,
      minWidth: 220,
      minHeight: 48,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: Spacing.xl,
      borderRadius: Radii.md,
      backgroundColor: Brand.primary,
    },
    buttonText: {
      color: C.onAccent,
      fontSize: 16,
      lineHeight: 24,
      fontFamily: FontFamily.bold,
      ...AndroidTextFix,
    },
    /* No fill and no border: a text button, so it cannot compete with the
       filled one above it. */
    laterButton: {
      minWidth: 220,
      minHeight: 48,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: Spacing.xl,
      borderRadius: Radii.md,
    },
    laterText: {
      color: C.textSecondary,
      fontSize: 15,
      lineHeight: 24,
      fontFamily: FontFamily.semiBold,
      ...AndroidTextFix,
    },
  })
);
