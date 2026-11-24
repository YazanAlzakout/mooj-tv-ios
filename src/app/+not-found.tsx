import { router } from "expo-router";
import { Image, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BouncePressable } from "@/components/BouncePressable";
import { brandLogoSource } from "@/components/BrandLogo";
import { ScreenBackground } from "@/components/ScreenBackground";
import { useI18n } from "@/core/i18n/I18nContext";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";

/**
 * Where a link that points at nothing lands.
 *
 * ## What was here before
 *
 * Nothing — and that absence was the defect. expo-router answers an
 * unmatched route with a page of its own whenever the app's route tree does
 * not claim that path: `build/ExpoRoot.js` (`Content()`) mounts
 * `views/RootUnmatched` as a sibling of the app's own root in the root
 * StackRouter, and `build/getLinkingConfig.js` points the generated
 * `*not-found` entry at it unless `isPathInRootConfig` finds the path
 * already taken. It is a development page and it ships in the release
 * build: a black screen carrying expo-router's own `unmatched.png`,
 * "Unmatched Route" and "Page could not be found." set in English at 56px,
 * the raw `moojtv://…` URL printed underneath, and a "Sitemap" link that
 * opens the app's entire route table. None of it is translated, themed or
 * branded, and the root Stack runs with `headerShown: false`, so there is
 * not even a title bar to leave by. Found 2026-11-17 in the pre-submission
 * audit; a first Play review would have been one dead link away from it.
 *
 * The existence of this file is the whole fix. Note what it does *not* do:
 * `ExpoRoot.js` imports `views/RootUnmatched` and `views/Sitemap`
 * statically and mounts them unless `extra.router.notFound` /
 * `extra.router.sitemap` are `false`, so their code and their image assets
 * are still in the bundle. What changes is reachability — the generated linking
 * entries are skipped once the app's own routes claim `*not-found` and
 * `_sitemap`. Anyone verifying this by reading `getRoutesCore.js`'s
 * `appendNotFoundRoute` will conclude it did nothing: that branch sits
 * behind `if (!options.skipGenerated)` and `global-state/useStore.js`
 * always passes `skipGenerated: true`, so it never runs on device.
 *
 * ## Why a screen and not a redirect
 *
 * `<Redirect href="/" />` is the shorter answer and it was turned down
 * twice over. `/` is not a neutral destination in this app: it is the
 * startup gate (src/app/index.tsx), which opens the database, runs the 1.x
 * provider import, asks about a required update and then calls
 * `restoreSession` — an `authenticate()` round trip to a panel that bans a
 * line for asking too often (docs/DECISIONS.md). A mistyped link must not
 * cost a login, and it must not be able to put the preparation screen up.
 * And quietly teleporting someone who followed a dead link into a full app
 * boot explains nothing; one line of text does.
 *
 * ## Why the button goes to `/` and not to `/home`
 *
 * When this screen is the *first* thing the app opens — a `moojtv://…`
 * link from the launcher, which is the whole scenario it exists for — the
 * startup gate has never run, so there is no database, no language, no
 * restored session and no provider. `/home` would be a tab screen with
 * nothing behind it. `/` is the only entry point that boots the app
 * properly, and sending the viewer there is their decision to make rather
 * than something that happens to them.
 *
 * ## The words on it
 *
 * All three strings are existing keys, reused rather than invented: this
 * screen carries no translation debt and nothing on it can render raw in a
 * locale that is behind. `library.nothingHereYet` is the app's own sentence
 * for an address with nothing at it, `tabs.home` labels the way out in the
 * same word the tab bar uses, and `common.back` is the one the whole app
 * already goes back with. There is deliberately no second line
 * explaining that the *link* itself is what is wrong, because no locale
 * file has a string for it and a sentence invented here would have shipped
 * in English to five of the six languages. If one is ever added — a
 * `notFound.body` in ar, en, fr, tr, ku and ckb — it belongs directly under
 * the title, in the shape `styles.body` has in UpdateRequiredScreen.
 *
 * The shape, the type scale and every style value below are lifted from
 * `src/components/UpdateRequiredScreen.tsx`, which is the only other
 * full-screen message in the app — deliberately, so the two cannot drift.
 * `ScreenBackground` also supplies the television overscan, so the message
 * is not behind the bezel on the box.
 */
export default function NotFoundScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();

  /*
   * Read during render, the way providers.tsx reads it, so it is right
   * whichever way this screen was reached. A deep link that opened the app
   * cold has an empty history, and offering a back control there would be
   * offering to leave the app; `canGoBack()` answers false before the
   * navigator is ready, which is the right answer for exactly that case. A
   * dead `router.push` from inside the app does have history, and returning
   * the viewer to where they actually were is better than any other exit
   * this screen can offer.
   */
  const canGoBack = router.canGoBack();

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Image source={brandLogoSource()} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>{t("library", "nothingHereYet")}</Text>
          {/*
            `hasTVPreferredFocus` because a television has no cursor: if
            nothing claims focus when the screen opens, the remote has
            nowhere to go and this becomes a dead end on the TV build.
          */}
          <BouncePressable style={styles.button} onPress={() => router.replace("/")} hasTVPreferredFocus>
            <Text style={styles.buttonText}>{t("tabs", "home")}</Text>
          </BouncePressable>
          {/*
            Quieter than the button above it, the same way the update notice
            keeps "Later" quieter than "Update now": going back is the
            lesser of the two things to do here, and it is not always there.
          */}
          {canGoBack && (
            <BouncePressable style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backText}>{t("common", "back")}</Text>
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
    backButton: {
      minWidth: 220,
      minHeight: 48,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: Spacing.xl,
      borderRadius: Radii.md,
    },
    backText: {
      color: C.textSecondary,
      fontSize: 15,
      lineHeight: 24,
      fontFamily: FontFamily.semiBold,
      ...AndroidTextFix,
    },
  })
);
