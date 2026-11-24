import { ScrollView, StyleSheet, Text, View } from "react-native";
import { getLocales } from "expo-localization";

import type { ErrorBoundaryProps } from "expo-router";

import { redactDiagnosticText } from "@/core/errors/redactDiagnosticText";
import { Focusable } from "@/components/Focusable";
import { isTvBuild } from "@/core/platform/isTvBuild";
import { TVSafeArea } from "@/core/theme/tokens";

/**
 * What the viewer sees when a render throws.
 *
 * Added 2026-11-14. Until now the app had no error containment at all — no
 * `ErrorBoundary`, no `ErrorUtils.setGlobalHandler`, no crash reporter — so one
 * throw anywhere took the whole app down to the launcher, with no way back
 * except relaunching and nothing left behind to say what happened. On a player
 * whose screens are built from whatever a third-party panel returns, that is
 * not a theoretical risk: a field this app expects and a panel stops sending is
 * enough.
 *
 * ## Why it owes nothing to the rest of the app
 *
 * Every colour and every string here is local. That is deliberate: this screen
 * renders *because something else failed*, and the provider that failed may be
 * the theme, the translations, the database or the session. A crash screen that
 * reaches for `useTheme()` or `useI18n()` throws inside the boundary that was
 * supposed to catch the first throw, and the viewer gets a blank screen instead
 * of a message.
 *
 * The language is picked straight from the device rather than from the app's
 * own setting, for the same reason — the setting lives behind a provider.
 *
 * The rule is **no providers**, not "no imports": everything this file reaches
 * for is either React Native's own, a leaf Expo module, or a module of this
 * app's that is nothing but frozen constants evaluated at import time —
 * `isTvBuild` (one `expo-constants` read), `TVSafeArea` (two numbers) and
 * `Focusable`, which is a `Pressable` with a border drawn over it and imports
 * only react-native and those same tokens. None of them can be the thing that
 * threw. Note which one is *not* here: `BouncePressable`, the app's usual
 * button, which pulls in Reanimated — a native animation driver is a larger
 * bet than this screen should be making, and the bounce buys a crash screen
 * nothing.
 *
 * ## Why the trace is on screen, and selectable on the phone
 *
 * This project does not test on devices automatically and ships no crash
 * reporter, so the only route a stack trace can take back to the developer is
 * the person holding the phone. Reading one aloud is not realistic; selecting
 * it is. There is deliberately no Copy button: that would mean adding
 * expo-clipboard, and taking a new native dependency into the tree days
 * before a release build is a worse trade than a long-press.
 *
 * ## Why this screen is built twice
 *
 * 2026-11-18. This screen is the root `ErrorBoundary` (src/app/_layout.tsx),
 * so it covers both builds — and as first written it could not be operated
 * from a remote at all. Its one control was a bare `Pressable`: nothing asked
 * for focus when it mounted, and nothing changed when focus arrived, so the
 * viewer of a television saw a button that looked identical whether it was
 * focused or not and had no way to learn that Select would work. The trace
 * could not be scrolled either — a D-pad moves a `ScrollView` only as a side
 * effect of focus entering something inside it, and there was nothing inside
 * it to focus. The one screen whose whole job is to be a way out of a dead end
 * was a dead end.
 *
 * So three things are different on the box: the root carries the overscan
 * inset every other screen gets from `ScreenBackground` (which this one
 * deliberately does not use), the button is a `Focusable` holding
 * `hasTVPreferredFocus`, and the trace is split into one focus stop per line —
 * the same device legal.tsx uses to make a long document readable with a
 * remote. The caption changes with it: a television has no touch screen, and
 * telling its viewer to long-press is instructions for a different machine.
 *
 * `isTvBuild`, not `Platform.isTV`, for every one of those — see
 * src/core/platform/isTvBuild.ts. The test box reports its `uiMode` as
 * `normal`, and the list of TV features that shipped dead because they were
 * gated on `Platform.isTV` is in that file.
 */
export function CrashScreen({ error, retry }: ErrorBoundaryProps) {
  /* Arabic unless the device clearly is not — the owner and almost every
     viewer are Arabic-speaking, and English is the safe second. */
  const code = getLocales()[0]?.languageCode ?? "ar";
  const ar = code !== "en" && code !== "fr" && code !== "tr";
  const T = ar
    ? {
        title: "توقّف شيء ما",
        body: "حدث خطأ غير متوقّع في هذه الشاشة. لم يُفقد شيء — جرّب مرة أخرى.",
        retry: "حاول مرة أخرى",
        /* No touch screen on the box, so no long-press to offer. */
        detail: isTvBuild ? "تفاصيل تقنية — تنقّل بالأسهم لقراءتها" : "تفاصيل تقنية — المسها مطوّلاً لنسخها",
      }
    : {
        title: "Something stopped",
        body: "This screen hit an unexpected error. Nothing was lost — try again.",
        retry: "Try again",
        detail: isTvBuild ? "Technical details — arrow keys to read" : "Technical details — long-press to copy",
      };

  const detail = redactDiagnosticText([error?.name, error?.message, error?.stack].filter(Boolean).join("\n"));

  return (
    <View style={[styles.root, isTvBuild && styles.tvSafe]}>
      <View style={styles.sheet}>
        <Text style={[styles.title, ar && styles.rtl]}>{T.title}</Text>
        <Text style={[styles.body, ar && styles.rtl]}>{T.body}</Text>

        {/*
          `hasTVPreferredFocus` unconditionally, the way +not-found.tsx sets
          it: a phone ignores it, and on the box nothing else here can take
          focus first, so this is where the remote has to land. The ring
          comes from Focusable — without a visible focus state the viewer
          cannot tell that Select does anything.
        */}
        <Focusable style={styles.primary} onPress={retry} hasTVPreferredFocus>
          <Text style={styles.primaryLabel}>{T.retry}</Text>
        </Focusable>

        <Text style={[styles.caption, ar && styles.rtl]}>{T.detail}</Text>
        <ScrollView style={styles.detailBox} contentContainerStyle={styles.detailInner}>
          {isTvBuild ? (
            /*
              One focus stop per line, and that is the only thing that makes
              this box scrollable with a remote: Android scrolls a newly
              focused view into view, and React Native's `ScrollView` has no
              key handling of its own, so Down has to have somewhere to go.
              A single focusable wrapping the whole trace would not do — the
              D-pad would scroll to its top once and stop, which is where the
              box already starts.

              `onPress` does nothing on purpose; these are stops, not
              buttons, which is also why they do not call themselves one.
              A blank line still needs a box to focus, hence the space, and
              the `"—"` is the same stand-in the phone shows for an error
              that arrived with no name, no message and no stack.
            */
            (detail || "—").split("\n").map((line, i) => (
              <Focusable key={i} style={styles.detailLine} onPress={() => {}} accessibilityRole="text">
                <Text style={styles.detailText}>{line || " "}</Text>
              </Focusable>
            ))
          ) : (
            <Text style={styles.detailText} selectable>
              {detail || "—"}
            </Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

/*
 * Literals, not palette. See the note above: the theme is one of the things
 * that may have thrown, and this screen has to render without it. The one
 * exception is `TVSafeArea` below, and it is not a colour — it is the
 * television's overscan, which is a property of sets rather than of this
 * app's look, and which has to be the same number here as everywhere else or
 * it is not a safe area.
 */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050A14", justifyContent: "center", padding: 22 },
  /**
   * The television's overscan, which this screen has to apply itself.
   *
   * Every other screen gets it from `ScreenBackground`, and this one does not
   * go through `ScreenBackground` — it cannot, because that component is
   * themed. So a set that crops the outer band of the picture was cropping
   * the only way out of a crash. The edge props beat `padding: 22` above for
   * the edges they name, whatever order the array puts them in, so the phone
   * keeps 22 all round and the box gets these.
   */
  tvSafe: { paddingHorizontal: TVSafeArea.horizontal, paddingVertical: TVSafeArea.vertical },
  sheet: { gap: 12 },
  rtl: { writingDirection: "rtl", textAlign: "right" },
  title: { color: "#F2F8FC", fontSize: 21, fontWeight: "700" },
  body: { color: "#9DB4C6", fontSize: 14, lineHeight: 22 },
  primary: {
    marginTop: 6,
    height: 48,
    /* 12, not the 14 this started at: Focusable draws its ring at
       `Radii.md` (12), and a ring whose corners cut across the button's own
       reads as a rendering fault rather than as focus. */
    borderRadius: 12,
    backgroundColor: "#1989C6",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  caption: { color: "#64788C", fontSize: 11.5, marginTop: 10 },
  detailBox: {
    maxHeight: 190,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1B2C3E",
    backgroundColor: "#0A141E",
  },
  detailInner: { padding: 12 },
  /* A line of the trace on the box. The vertical padding is there so the
     focus ring has a box with some height to be drawn on rather than hugging
     a 17dp line of 11pt text. TV only — the phone renders one Text. */
  detailLine: { paddingVertical: 3 },
  detailText: { color: "#8FA5B6", fontSize: 11, lineHeight: 17, fontFamily: "monospace" },
});
