import { useNetworkReconnect } from "@/core/network/useNetworkReconnect";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { useEffect, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import { InteractionManager, View } from "react-native";

import { BrandSplash } from "@/components/BrandSplash";
import { CrashScreen } from "@/components/CrashScreen";
import { I18nProvider } from "@/core/i18n/I18nContext";
import { primeCacheIndex } from "@/core/media/imageCache";
import { ThemeProvider, useTheme } from "@/core/theme/ThemeContext";
import { FontFamily } from "@/core/theme/tokens";
import { recoverDownloadsOnBoot, registerDownloadBackgroundHandling } from "@/domain/downloads/downloadManager";
import { downloadsSupported } from "@/domain/downloads/eligibility";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useEffect(() => {
    /*
     * Deferred off the cold-start path. `primeCacheIndex` lists the artwork
     * directory synchronously, constructing a native handle per file, and on
     * a device that ran an earlier build that directory can hold tens of
     * thousands of files — a JS-thread stall at every launch, right where
     * the splash and the session restore are competing for it.
     *
     * Nothing needs it before the first list is scrolled, and until it runs
     * `cacheImage` simply falls back to asking the filesystem per image, as
     * it did before the index existed.
     */
    const primeAfterFirstPaint = InteractionManager.runAfterInteractions(primeCacheIndex);
    if (downloadsSupported()) {
      recoverDownloadsOnBoot().catch(() => {});
      registerDownloadBackgroundHandling();
    }
    return () => primeAfterFirstPaint.cancel();
  }, []);

  const [fontsLoaded, fontError] = useFonts({
    [FontFamily.light]: require("../../assets/fonts/NotoKufiArabic-Light.ttf"),
    [FontFamily.regular]: require("../../assets/fonts/NotoKufiArabic-Regular.ttf"),
    [FontFamily.medium]: require("../../assets/fonts/NotoKufiArabic-Medium.ttf"),
    [FontFamily.semiBold]: require("../../assets/fonts/NotoKufiArabic-SemiBold.ttf"),
    [FontFamily.bold]: require("../../assets/fonts/NotoKufiArabic-Bold.ttf"),
    [FontFamily.extraBold]: require("../../assets/fonts/NotoKufiArabic-ExtraBold.ttf"),
    [FontFamily.black]: require("../../assets/fonts/NotoKufiArabic-Black.ttf"),
  });

  useEffect(() => {
    /*
      Either outcome takes the splash down. `preventAutoHideAsync()` runs at
      module scope, so the native splash stays up until something here
      hides it — and gating that on success alone meant a single unreadable
      font file froze the app on its splash on every launch, with no
      recovery and nothing on screen to explain it.

      A missing font is a cosmetic problem. A frozen splash is a dead app.
    */
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  // Render on a font error too — see the splash note above.
  if (!fontsLoaded && !fontError) return null;

  return (
    /*
     * `react-native-gesture-handler` has been a dependency all along — it
     * arrives with the navigator — but nothing in this app used it, so its
     * root view was never mounted. It has to be, and it has to be the
     * outermost view: without it `GestureDetector` attaches to nothing on
     * Android and every gesture built on it silently never fires, with no
     * error anywhere to say why.
     *
     * Mounted for the sideways category swipe on the browse screens
     * (2026-10-06, `CategorySwipe`). The player's own gestures are older
     * and built on React Native's responder system; they are untouched by
     * this and keep working exactly as they did.
     */
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <I18nProvider>
          <ThemedRoot />
        </I18nProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Split from `RootLayout` only so it can read the theme — a provider's own
 * component cannot consume the context it creates.
 */
/** Stable, so the root's reconnect listener is never re-subscribed. */
const NOTHING_TO_RESELECT = () => {};

function ThemedRoot() {
  /*
    Mounted here so the whole app recovers, not only the player.

    This hook clears the recorded artwork failures when the line comes back,
    and until now the only screen that used it was the live player — so a
    customer whose signal dropped while browsing kept a catalogue of empty
    tiles no matter how good the signal became afterwards. The callback is
    empty on purpose: there is nothing for the root to re-select, and the
    recovery is the hook's own doing.
  */
  useNetworkReconnect(NOTHING_TO_RESELECT);
  const { colors, scheme } = useTheme();
  const [introDone, setIntroDone] = useState(false);

  return (
    <>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      {/*
        The navigation bar's icon colour, which nothing set until now.

        With `edgeToEdgeEnabled` the bar is transparent and the app draws
        under it, so the app is what decides whether its icons are dark or
        light. Left unset they stayed light — invisible against the white
        background of the light theme, which is why the theme looked broken
        the moment a viewer switched from gesture navigation to buttons
        (reported 2026-09-15; gesture navigation shows only a small pill,
        so the same fault was there and barely visible).

        `style` names the *content* colour, the same convention as
        `StatusBar` above — confirmed in the module's own Android
        implementation, where `auto` resolves to `'dark'` on a light colour
        scheme. The two lines therefore read identically on purpose.

        Bound to the app's theme rather than left on `auto`: `auto` follows
        the *system* colour scheme, and this app has its own dark/light
        setting that a viewer can point the other way.
      */}
      <NavigationBar style={scheme === "light" ? "dark" : "light"} hidden={false} />
      {/*
        The brand intro renders *over* the navigator rather than instead of
        it, so the startup gate (src/app/index.tsx) does its session restore
        underneath while the clip plays — the two overlap instead of running
        back to back, which is what made the old app's boot feel slow.
      */}
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "fade",
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="providers" />
          <Stack.Screen name="add-provider" />
          {/*
            The five tabbed sections, as one entry.

            They are files in app/(tabs)/, and the parentheses keep the
            group out of the URL — /home and /live-categories resolve
            exactly as they did when those files sat here. Registering the
            group rather than its members is what puts the tab bar under
            them and, just as deliberately, keeps it off everything below:
            a bar drawn over a running video is a strip of the picture
            thrown away.
          */}
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="live/player/[channelId]" />
          <Stack.Screen name="movies/details/[movieId]" />
          <Stack.Screen name="movies/player/[movieId]" />
          <Stack.Screen name="series/details/[seriesId]" />
          <Stack.Screen name="series/player/[episodeId]" />
          <Stack.Screen name="search" />
          <Stack.Screen name="library/[listType]" />
          <Stack.Screen name="history" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="settings/categories/[contentType]" />
          <Stack.Screen name="downloads" />
          <Stack.Screen name="legal" />
          <Stack.Screen name="privacy" />
          <Stack.Screen name="licences" />
        </Stack>

        {!introDone && <BrandSplash onFinish={() => setIntroDone(true)} />}
      </View>
    </>
  );
}

/**
 * The app's error containment, and the only one it has.
 *
 * expo-router renders an exported ErrorBoundary in place of the subtree that
 * threw, so putting it on the ROOT layout covers every screen — a boundary on
 * one route would leave the other twenty uncovered. Exported here rather than
 * written here because the screen must not touch the theme, the translations
 * or anything else that might be what failed; see the note in CrashScreen.
 *
 * Added 2026-11-14. Before it, a single render throw anywhere took the whole
 * app to the launcher with nothing left behind to diagnose it.
 */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <CrashScreen {...props} />;
}
