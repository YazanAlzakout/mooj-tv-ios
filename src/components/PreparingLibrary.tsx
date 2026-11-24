import { Image, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenBackground } from "@/components/ScreenBackground";
import { useI18n } from "@/core/i18n/I18nContext";
import { FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import { brandLogoSource } from "./BrandLogo";
import { LogoRipple } from "./LogoRipple";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";
import type { PreloadProgress } from "@/state/catalogCache";

/**
 * Shown once per provider, while the whole catalog and the first screens'
 * artwork are downloaded and written to the device. Everything after this
 * opens from local storage, so the app starts instantly and a scroll never
 * waits on the network.
 *
 * Deliberately just the logo and a plain "Loading…" — this used to spell
 * out every step by name (categories, channels, movies…) plus a live
 * image counter, which read as debug output rather than a splash screen.
 * The bar is still driven by real progress, not a timer, but it is now the
 * only thing doing the talking; nobody needs to read "Artwork · 42 / 180"
 * to know the app is getting ready.
 */
export function PreparingLibrary({ progress }: { progress: PreloadProgress | null }) {
  const { t } = useI18n();

  const stepFraction = progress ? progress.stepIndex / progress.stepCount : 0;
  const withinStep =
    progress && progress.step === "artwork" && progress.imagesTotal > 0
      ? progress.imagesDone / progress.imagesTotal / progress.stepCount
      : 0;
  const fraction = Math.min(1, stepFraction + withinStep);

  return (
    <ScreenBackground particles>
      <SafeAreaView style={styles.safeArea}>
        <Animated.View entering={FadeIn.duration(300)} style={styles.container}>
          {/*
            The same rings the provider screen and the intro carry. This
            screen is the longest uninterrupted wait in the app — a cold
            catalogue is tens of thousands of titles — and a still logo over
            a progress bar for that long reads as a hang. Something moving
            that is clearly not the bar is what says the app is alive even
            when the bar is between steps and not advancing.
          */}
          <LogoRipple size={220}>
            <Image source={brandLogoSource()} style={styles.logo} resizeMode="contain" />
          </LogoRipple>

          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.round(fraction * 100)}%` }]} />
          </View>

          <Text style={styles.loadingText}>{t("common", "loading")}</Text>
        </Animated.View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: Spacing.lg },
  logo: { width: 360, height: 200, marginBottom: Spacing.md },
  barTrack: {
    width: "60%",
    maxWidth: 220,
    height: 4,
    borderRadius: Radii.pill,
    backgroundColor: C.fillMedium,
    overflow: "hidden",
  },
  barFill: { height: "100%", backgroundColor: C.textMuted, borderRadius: Radii.pill },
  loadingText: { color: C.textMuted, fontSize: 13, lineHeight: 22, fontFamily: FontFamily.medium },
  })
);
