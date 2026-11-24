import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { Brand, Spacing } from "@/core/theme/tokens";
import { brandLogoSource } from "@/components/BrandLogo";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import { CURRENT_LEGAL_VERSION } from "@/core/legal/legalVersion";
import { checkRequiredUpdate, type UpdateStatus } from "@/core/update/requiredUpdate";
import { playUpdateAvailable } from "@/core/update/playUpdate";
import { getAppState } from "@/db/repositories/appStateRepository";
import { importLegacyProviders } from "@/db/legacyProviderImport";
import { getActiveProvider } from "@/db/repositories/providerRepository";
import { PreparingLibrary } from "@/components/PreparingLibrary";
import { UpdateRequiredScreen } from "@/components/UpdateRequiredScreen";
import type { PreloadProgress } from "@/state/catalogCache";
import { clearActiveSession } from "@/state/activeSessionStore";
import { restoreSession } from "@/state/sessionRestore";

/**
 * Startup gate: silently restores the active provider's session (if any)
 * and routes straight to Home, or sends the user to the provider list if
 * there's none / restore fails. Never blocks indefinitely — every path ends
 * in a router.replace.
 */
export default function StartupGateScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const [failed, setFailed] = useState(false);
  /**
   * Non-null only while a full catalog download is running — that is, the
   * first launch on a provider. Every later launch reads the stored
   * catalog and never renders the preparation screen at all.
   */
  const [preload, setPreload] = useState<PreloadProgress | null>(null);
  /**
   * True only when a published minimum version says this build may no
   * longer run. Rendered *instead of* any routing, so there is nothing
   * underneath it to go back to — see UpdateRequiredScreen.
   */
  /**
   * What the launch check found, and whether the viewer has waved it away.
   *
   * `"blocked"` has no dismissal — the screen it renders has no way past.
   * `"available"` does, and the dismissal is **not** persisted: the notice
   * is meant to reappear on every launch until the update is actually
   * installed, which is what was asked for. Remembering it would turn "a new
   * version exists" into something the app mentions once and then hides,
   * which is the behaviour this was added to replace.
   */
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("none");
  const [updateDismissed, setUpdateDismissed] = useState(false);

  const pulseScale = useSharedValue(1);
  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) })
      ),
      -1
    );
    // Runs once on mount — loops for the screen's whole (typically brief) lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }));

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        /*
         * Started here and awaited below, rather than awaited here: the
         * database open, the migrations and the legacy import all have to
         * happen anyway, and a request running alongside them costs nothing
         * on a normal launch. Awaiting it first would add its latency to
         * every single start of the app for a check that almost always says
         * "carry on".
         */
        const updatePromise = checkRequiredUpdate();

        const state = await getAppState();

        /*
         * Before any routing decision, and after `getAppState` has opened
         * the database (which is what runs the migrations this depends on).
         *
         * On a clean install this is a single SecureStore read that finds
         * nothing and flags itself done forever. On a device upgrading from
         * the published 1.x app — same package id, so its stored data is
         * still there — it brings the user's providers across so they are
         * already in the list when they reach it.
         */
        await importLegacyProviders();

        /*
         * Before every routing decision, including onboarding and the legal
         * gate. A build that must not run must not run at all — sending it
         * through onboarding first, or letting it reach the provider list
         * and open a connection, would be doing the work this is meant to
         * prevent. `checkRequiredUpdate` returns false on every uncertainty,
         * so reaching this branch means a minimum was actually published
         * and this build is definitely below it.
         */
        const update = await updatePromise;
        if (update === "blocked") {
          if (!cancelled) setUpdateStatus("blocked");
          return;
        }
        /*
          An available update does **not** return: the routing below still
          runs, so the app is fully started behind the notice and carries on
          the moment it is dismissed. Only the blocking case stops here.
        */
        if (update === "available" && !cancelled) setUpdateStatus("available");

        /*
          Then ask Play, which is the everyday source now that the app is
          distributed there — the manifest above is for emergencies and is
          inert until a URL is configured.

          Deliberately **not** awaited on this path. Play's service can be
          slow or, on a device with a damaged Play install, never answer at
          all, and none of that may delay opening the app. So the result is
          written to state whenever it arrives, which is either well before
          the viewer has finished looking at the first screen, or never —
          and never is fine.

          `playUpdateAvailable` cannot reject; every failure inside it is a
          `false`. The `void` is therefore a statement that there is
          nothing to handle, not an omission.
        */
        void playUpdateAvailable().then((available) => {
          if (available && !cancelled) setUpdateStatus("available");
        });

        if (state.onboardingSeenAt === null) {
          if (!cancelled) router.replace("/onboarding");
          return;
        }

        if (state.legalAcceptedVersion !== CURRENT_LEGAL_VERSION) {
          if (!cancelled) router.replace({ pathname: "/legal", params: { mode: "gate" } });
          return;
        }

        const provider = await getActiveProvider();
        if (!provider) {
          if (!cancelled) router.replace("/providers");
          return;
        }
        await restoreSession(provider, {
          onPreloadProgress: (progress) => {
            if (!cancelled) setPreload(progress);
          },
        });
        if (!cancelled) router.replace("/home");
      } catch {
        /*
         * Say out loud that nothing is connected, before routing.
         *
         * 2026-11-18. This catch used to only navigate, which left the app in
         * two minds: `providers.is_active` still named the provider whose
         * restore had just failed, while the in-memory session was null
         * because it had never been built. `setActiveSession`'s guard against
         * leaking one provider's data into another's session is
         * `session !== null && session.provider.id !== next.provider.id`, so
         * from here it read false and the previous provider's guide was never
         * cleared — and the commonest reason to connect a different line is
         * the old one expiring, which is exactly the rejected login that
         * lands here (`sessionRestore.ts` rethrows `XtreamAuthError` even
         * when a catalogue is cached). The viewer then saw provider A's
         * programme titles against provider B's channels for up to six hours.
         *
         * Called outside the `cancelled` check on purpose: this is state, not
         * screen. If the gate is already gone the routing is pointless, but
         * "no provider is connected" is still true and still has to be
         * recorded. And nothing reaching here can have built a session to
         * tear down by mistake: `restoreSession` builds one as its last act,
         * the two calls after it are synchronous state writes, and the
         * background catalogue refresh swallows its own failures.
         */
        clearActiveSession();
        if (!cancelled) {
          setFailed(true);
          router.replace("/providers");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Checked before the preload screen: a build that must update should not
   * be shown a catalog download it is not allowed to finish.
   */
  if (updateStatus === "blocked") {
    return <UpdateRequiredScreen />;
  }

  /*
    The soft notice, over a started app. It is rendered before the preload
    screen for the same reason the blocking one is: a viewer who is about to
    update has no use for watching a catalogue download first.
  */
  if (updateStatus === "available" && !updateDismissed) {
    return <UpdateRequiredScreen onDismiss={() => setUpdateDismissed(true)} />;
  }

  if (preload) {
    return <PreparingLibrary progress={preload} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Animated.Image
          source={brandLogoSource()}
          style={[styles.logo, logoStyle]}
          resizeMode="contain"
        />
        {!failed && <ActivityIndicator color={Brand.primary} style={styles.spinner} />}
      </View>
    </SafeAreaView>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.xl },
  logo: { width: 160, height: 90 },
  spinner: {},
  })
);
