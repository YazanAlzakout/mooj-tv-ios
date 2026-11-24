import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  useWindowDimensions,
  type ViewToken,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { BouncePressable } from "@/components/BouncePressable";
import { ScreenBackground } from "@/components/ScreenBackground";
import { useI18n } from "@/core/i18n/I18nContext";
import { LOCALES, localeMeta } from "@/core/i18n/locales";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import { brandLogoSource } from "@/components/BrandLogo";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import { setOnboardingSeen } from "@/db/repositories/appStateRepository";

interface Slide {
  title: string;
  body: string;
}

function buildSlides(t: ReturnType<typeof useI18n>["t"]): Slide[] {
  return [
    { title: t("onboarding", "slide1Title"), body: t("onboarding", "slide1Body") },
    { title: t("onboarding", "slide2Title"), body: t("onboarding", "slide2Body") },
    { title: t("onboarding", "slide3Title"), body: t("onboarding", "slide3Body") },
  ];
}


async function finishOnboarding() {
  await setOnboardingSeen();
  router.replace("/");
}

export default function OnboardingScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t, locale, setLocale } = useI18n();
  const SLIDES = buildSlides(t);
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const isLast = index === SLIDES.length - 1;

  const pulseScale = useSharedValue(1);
  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) })
      ),
      -1
    );
    // Runs once on mount — loops for the screen's whole lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }));
  /**
   * Opens by itself, on this screen only.
   *
   * The button that used to be the only way in went unnoticed: it is a
   * small pill in a corner, and a viewer who has just installed the app is
   * reading the middle of the screen, not hunting its edges. The language
   * being wrong is also the one setting that makes everything *else*
   * unreadable, so it is the one worth interrupting for — and this is the
   * only moment where interrupting costs nothing, because there is nothing
   * yet to interrupt.
   *
   * Closed on arrival, and that is the change.
   *
   * It used to open itself the moment the app did. The reasoning was that
   * language is the first decision and a dialog asks it outright — but
   * what it actually did was put a sheet of options over the brand intro
   * the second the clip ended, so the first thing anyone saw of this app
   * was a list. Nothing is to come up over the opening but the opening.
   *
   * The pill in the corner above says which language is in use and opens
   * this when tapped, which is the whole of what the dialog was for. The
   * guess from the device locale is right most of the time and visible
   * either way.
   */
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  /*
   * Measured live, not once at import. The width was read at module load,
   * so rotating during onboarding left the pager snapping by the new width
   * while the slides kept the old one — after landscape to portrait, each
   * slide was wider than the screen and its text sat half off it.
   */
  const { width: screenWidth } = useWindowDimensions();
  /*
   * And re-anchored when that width changes, which is the other half of the
   * same bug.
   *
   * The note above fixed the slides: they and `getItemLayout` now agree
   * after a rotation. The scroll offset was never re-synced, and it is
   * still index × the *old* width. `pagingEnabled` only snaps on the next
   * scroll, so a viewer on slide 2 or 3 who turned the phone was left
   * parked between two slides — the right-hand part of one and the
   * left-hand part of the next, with the dots insisting on a third answer —
   * and it stayed that way until they swiped.
   *
   * Scheduled for the next frame rather than run here. Going portrait →
   * landscape the content is still three *old* widths across at this point,
   * so an immediate scroll past that maximum is clamped to it and the
   * re-anchor silently does nothing — which is the exact direction the
   * fault was reported in. One frame later the slides have been laid out at
   * the new width and the offset lands.
   *
   * `index` is read, not depended on: the width change is the trigger, and
   * the value wanted is the one from the render the rotation interrupted.
   *
   * The television never rotates, so there this runs once at mount, scrolls
   * to an offset of 0 where the list already is, and never fires again.
   */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: index * screenWidth, animated: false });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenWidth]);

  function goNext() {
    if (isLast) {
      finishOnboarding();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  }

  function onViewableItemsChanged({ viewableItems }: { viewableItems: ViewToken[] }) {
    const first = viewableItems[0];
    if (first && typeof first.index === "number") setIndex(first.index);
  }

  return (
    <ScreenBackground particles>
      <SafeAreaView style={styles.safeArea}>
        {/*
          A row, not two absolutely-positioned corners.

          Both used to be `position: absolute` at `top: 16`, which put them
          sixteen points below the status bar — close enough to the clock
          that they read as part of it and were awkward to hit (reported
          2026-09-15). Laying them out in flow instead means the padding
          below the safe-area inset is real clearance nothing can overlap,
          and both get a proper target height rather than whatever their
          text happened to measure.

          The language pill is accented and Skip is quiet on purpose: one is
          worth noticing, the other is an escape hatch, and dressing an
          escape hatch up as the main action invites people to leave the
          three screens that explain the app.
        */}
        <View style={styles.topBar}>
          <BouncePressable onPress={() => setLanguagePickerOpen(true)} style={styles.languageButton}>
            <Text style={styles.languageButtonText}>{localeMeta(locale).label}</Text>
          </BouncePressable>

          <BouncePressable onPress={finishOnboarding} style={styles.skipButton}>
            <Text style={styles.skipButtonText}>{t("onboarding", "skip")}</Text>
          </BouncePressable>
        </View>

        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          getItemLayout={(_, i) => ({ length: screenWidth, offset: screenWidth * i, index: i })}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width: screenWidth }]}>
              <Animated.Image
                source={brandLogoSource()}
                style={[styles.logo, logoStyle]}
                resizeMode="contain"
              />
              <Animated.Text entering={FadeInDown.delay(150).duration(500)} style={styles.title}>
                {item.title}
              </Animated.Text>
              <Animated.Text entering={FadeInDown.delay(280).duration(500)} style={styles.body}>
                {item.body}
              </Animated.Text>
            </View>
          )}
        />

        <View style={styles.footer}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
          <BouncePressable style={styles.nextButton} onPress={goNext}>
            <Text style={styles.nextButtonText}>{isLast ? t("onboarding", "getStarted") : t("onboarding", "next")}</Text>
          </BouncePressable>
        </View>
        <Modal
          visible={languagePickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setLanguagePickerOpen(false)}
        >
          {/* Tap-catchers, never focus targets — see ConfirmDialog.tsx. */}
          <Pressable
            style={styles.modalBackdrop}
            focusable={false}
            onPress={() => setLanguagePickerOpen(false)}
          >
            <Pressable
              style={styles.modalCard}
              focusable={false}
              onPress={(e: GestureResponderEvent) => e.stopPropagation()}
            >
              <Text style={styles.modalTitle}>{t("settings", "language")}</Text>
              {LOCALES.map((item) => (
                <BouncePressable
                  key={item.code}
                  style={[styles.localeRow, item.code === locale && styles.localeRowActive]}
                  hasTVPreferredFocus={item.code === locale}
                  onPress={() => {
                    setLanguagePickerOpen(false);
                    void setLocale(item.code);
                  }}
                >
                  <Text style={[styles.localeLabel, item.code === locale && styles.localeLabelActive]}>
                    {item.label}
                  </Text>
                </BouncePressable>
              ))}
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1 },
  /**
   * `paddingTop` on top of the safe-area inset, so the row clears the
   * status bar by a visible margin instead of hugging it.
   */
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  /** Accented — this is the one a viewer should see. */
  languageButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Brand.primary,
    backgroundColor: Brand.primaryMuted,
  },
  languageButtonText: {
    color: Brand.primaryLight,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamily.bold,
    ...AndroidTextFix,
  },
  /** Same pill shape so the two read as a pair, without competing. */
  skipButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.pill,
    backgroundColor: C.fillSubtle,
  },
  skipButtonText: {
    color: C.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamily.semiBold,
    ...AndroidTextFix,
  },
  modalBackdrop: { flex: 1, backgroundColor: C.overlay, alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  modalCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: Radii.lg,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.border,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  modalTitle: {
    color: C.text,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: FontFamily.bold,
    marginBottom: Spacing.sm,
    ...AndroidTextFix,
  },
  localeRow: { minHeight: 42, justifyContent: "center", paddingHorizontal: Spacing.md, borderRadius: Radii.md },
  localeRowActive: { backgroundColor: Brand.primary },
  localeLabel: { color: C.text, fontSize: 14, lineHeight: 22, fontFamily: FontFamily.medium, ...AndroidTextFix },
  localeLabelActive: { color: C.onAccent, fontFamily: FontFamily.bold },

  slide: { alignItems: "center", justifyContent: "center", padding: Spacing.xxl, gap: Spacing.lg },
  logo: { width: 96, height: 54, marginBottom: Spacing.lg },
  title: { color: C.text, fontSize: 22, fontFamily: FontFamily.extraBold, textAlign: "center" },
  body: {
    color: C.textSecondary,
    fontSize: 14,
    fontFamily: FontFamily.regular,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 320,
  },

  footer: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl, gap: Spacing.lg },
  dots: { flexDirection: "row", justifyContent: "center", gap: Spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  dotActive: { backgroundColor: Brand.primary, width: 20 },

  nextButton: {
    backgroundColor: Brand.primary,
    borderRadius: Radii.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  nextButtonText: { color: C.onAccent, fontSize: 15, fontFamily: FontFamily.bold },
  })
);
