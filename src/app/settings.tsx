import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Focusable } from "@/components/Focusable";
import { BouncePressable } from "@/components/BouncePressable";
import { FavoriteIcon, HistoryIcon, WatchLaterIcon } from "@/components/MenuIcons";
import { useTapFeedback } from "@/core/feedback/useTapFeedback";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ScreenBackground } from "@/components/ScreenBackground";
import { PinPrompt, PIN_LENGTH } from "@/components/PinPrompt";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { useI18n } from "@/core/i18n/I18nContext";
import { useTheme } from "@/core/theme/ThemeContext";
import { LOCALES, type LocaleCode } from "@/core/i18n/locales";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, themeColors, useThemeRerender } from "@/core/theme/themedStyles";
import { formatBytes } from "@/core/utils/formatBytes";
import { formatDate } from "@/core/utils/formatDate";
import { clearImageCache, imageCacheSize } from "@/core/media/imageCache";
import {
  getAppState,
  setAutoplayNextEpisode,
  setBackgroundPlayback,
  setSplitChannelView,
  setParentalLockedCategories,
  setParentalPin,
  setResumeEnabled,
  type AppState,
  type ThemePreference,
} from "@/db/repositories/appStateRepository";
import { getDownloadsSummary } from "@/db/repositories/downloadRepository";
import { clearLibraryList, getLibraryCount } from "@/db/repositories/libraryRepository";
import { clearAllWatchProgress, getRecentWatchProgress } from "@/db/repositories/watchProgressRepository";
import { downloadsSupported } from "@/domain/downloads/eligibility";
import { disconnectProvider, getActiveSession, setActiveSession } from "@/state/activeSessionStore";
import { authenticate, type XtreamAccountInfo } from "@/providers/xtream/xtreamAdapter";
import { MASKED_VALUE } from "@/core/storage/maskedValue";

const THEME_OPTIONS: ThemePreference[] = ["dark", "light", "system"];
const THEME_LABEL_KEYS = {
  dark: "themeDark",
  light: "themeLight",
  system: "themeSystem",
} as const;

export default function SettingsScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t, locale, setLocale } = useI18n();
  const { preference: themePreference, setPreference: applyThemePreference } = useTheme();
  const session = getActiveSession();

  /**
   * Fire-and-forget: the repaint is immediate (every screen subscribes to
   * the theme store) and the write to the database is not something the
   * user waits on.
   */
  function setThemePreference(next: ThemePreference) {
    void applyThemePreference(next);
  }

  const [state, setState] = useState<AppState | null>(null);
  const [downloadsSummary, setDownloadsSummary] = useState<{ count: number; totalBytes: number } | null>(null);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmRemovePin, setConfirmRemovePin] = useState(false);
  const [pinEditorOpen, setPinEditorOpen] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  /** Set when an action needs the existing PIN before it may run. */
  const [pinChallenge, setPinChallenge] = useState<null | (() => void)>(null);
  const [stats, setStats] = useState({ history: 0, favorites: 0, watchLater: 0 });
  /**
   * The cached-artwork figure the "Clear cached artwork" row prints.
   *
   * `imageCacheSize()` is a synchronous directory read, and it used to be
   * called inline in the render — which meant it was only ever re-read when
   * something *else* happened to re-render this screen. Clearing the cache
   * does not: the directory was deleted and the row went on advertising
   * `· 61.4 MB` over nothing (2026-11-17). It is state now for one reason —
   * so `refreshCounts` can re-read it in the same place it re-reads the
   * counts, rather than the row quietly depending on some unrelated
   * `setState` to repaint it.
   */
  const [cacheBytes, setCacheBytes] = useState(() => imageCacheSize());
  /**
   * A fresher `accountInfo` than the session is carrying, or null until it
   * arrives. See the effect below for why this screen fetches one.
   */
  const [freshAccountInfo, setFreshAccountInfo] = useState<XtreamAccountInfo | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    body: string;
    run: () => Promise<void>;
  } | null>(null);

  /**
   * What the account rows display: the refreshed reading once it lands,
   * and the session's own until then, so the screen never has a gap.
   */
  const accountInfo = freshAccountInfo ?? session?.accountInfo ?? null;

  /**
   * Re-reads every number on this page that one of this page's own buttons
   * can change: the three "Your Activity" cards and the size of the artwork
   * cache.
   *
   * All four were read once, on mount, and the four clear actions below them
   * wrote straight past them. "Clear watch history" → confirm → the History
   * card still read 143; "Clear favourites" left Favourites on 27; "Clear
   * cached artwork · 61.4 MB" still said 61.4 MB over a directory that had
   * just been deleted. Nothing on screen acknowledged the destructive thing
   * the viewer had only just confirmed, so the honest reading was that it
   * had failed — and tapping again was free (2026-11-17). The numbers
   * corrected themselves only after leaving Settings and coming back.
   *
   * Deliberately not hung on a focus effect: the only writers of these four
   * numbers that this screen can see are its own confirm dialogs, and this
   * screen already spends one `player_api.php` call per open (see the effect
   * below) — it is not a screen to give more work to than it needs.
   */
  async function refreshCounts() {
    const [history, favorites, watchLater] = await Promise.all([
      getRecentWatchProgress(200),
      getLibraryCount("favorite"),
      getLibraryCount("watch_later"),
    ]);
    setStats({ history: history.length, favorites, watchLater });
    setCacheBytes(imageCacheSize());
  }

  useEffect(() => {
    getAppState().then(setState);
    getDownloadsSummary().then(setDownloadsSummary);
    /*
     * The rule below is switched off here, not worked around.
     *
     * `react-hooks/set-state-in-effect` exists to stop a *synchronous*
     * setState in an effect body, which cascades an extra render before
     * the first paint. Nothing synchronous happens here: `refreshCounts`
     * awaits three SQLite reads and sets state only after them, which is
     * the same shape as the two `.then(setState)` lines above it — call
     * setState from a callback once the external system has answered —
     * and which the rule's own text names as a correct use of an effect.
     * The linter flags it only because those awaits sit behind a named
     * function rather than a `.then`, and the name is the whole point:
     * the four confirm dialogs below call the same function when they
     * finish, which is what stopped the counts going stale (2026-11-17).
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshCounts();
    // Mount only. `refreshCounts` is redeclared on every render and closes
    // over nothing that changes, so naming it here would re-run this effect
    // on every render instead of once.
  }, []);

  /*
    Re-read the account, once, when this screen opens.

    `accountInfo` is written by `authenticate`, and `authenticate` runs in
    exactly two places: adding a provider, and restoring the session at
    launch. So the connection count on this screen was a snapshot of the
    moment the app signed in — taken before any channel had been opened —
    and it read `0/3` forever, which is what the user reported on
    2026-09-16.

    Why this screen, and why only on open:

    - It is a screen a person opens deliberately, so one extra
      `player_api.php` call here costs nothing. Refreshing per channel
      switch would be several times the panel's request budget and
      reproduces the documented lockout, where the panel answers *every*
      endpoint — login included — with an empty 404 for minutes.
    - It is also where the number is worth having. A line reading `3/3`
      while only this device is watching is the one piece of evidence that
      the connections are being spent somewhere else, and no amount of
      reading our own code can establish that.

    The result is written back into the session as well as into local
    state, so the live player's `needsReleaseWait` sees a current
    `maxConnections` instead of the one from launch.

    Failures are swallowed deliberately: this is a nicety on a settings
    screen. If the panel is busy or rate-limiting, the previous snapshot
    stays on screen and nothing else is disturbed.
  */
  useEffect(() => {
    const current = getActiveSession();
    if (!current) return;
    let cancelled = false;

    authenticate(current.config)
      .then((result) => {
        if (cancelled) return;
        setFreshAccountInfo(result.accountInfo);
        /*
          Re-read the session rather than closing over `current`: a
          provider switch could have landed while the request was in
          flight, and writing the old provider's session back would undo
          it.
        */
        const latest = getActiveSession();
        if (latest && latest.provider.id === current.provider.id) {
          setActiveSession({ ...latest, accountInfo: result.accountInfo });
        }
      })
      .catch(() => {
        // Keep whatever the session already had.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function disconnect() {
    void disconnectProvider();
    /*
     * The whole stack goes, not just this screen. `replace` alone swapped
     * Settings for Providers and left Home underneath — one hardware back
     * landed on a Home still showing the disconnected provider's name and
     * counts, where every tile bounced straight back here.
     */
    router.dismissAll();
    router.replace("/providers");
  }

  async function toggleResume(value: boolean) {
    await setResumeEnabled(value);
    setState((prev) => (prev ? { ...prev, resumeEnabled: value } : prev));
  }

  async function toggleAutoplay(value: boolean) {
    await setAutoplayNextEpisode(value);
    setState((prev) => (prev ? { ...prev, autoplayNextEpisode: value } : prev));
  }

  async function toggleBackgroundPlayback(value: boolean) {
    await setBackgroundPlayback(value);
    setState((prev) => (prev ? { ...prev, backgroundPlayback: value } : prev));
  }

  async function toggleSplitChannelView(value: boolean) {
    await setSplitChannelView(value);
    setState((prev) => (prev ? { ...prev, splitChannelView: value } : prev));
  }

  /** The write itself, shared by the free path and the one behind the PIN. */
  async function applyCategoryLock(value: boolean) {
    await setParentalLockedCategories(value);
    setState((prev) => (prev ? { ...prev, parentalLockedCategories: value } : prev));
  }

  /**
   * Turning the lock *on* is free; turning it off costs the PIN.
   *
   * This switch used to write through on one tap, and the gate in
   * `withParentalCheck` reads `parentalPin && parentalLockedCategories` — so
   * flipping it off made every row above it fall straight through. One tap
   * on the switch, one tap on "Live TV — Manage category visibility", and
   * everything a parent had hidden was visible again (2026-11-17). The note
   * under these rows promises "التصنيفات المخفية لا يمكن إعادة إظهارها إلا
   * بالرمز", and the one control that undid that sentence was the sentence's
   * own switch.
   *
   * Asymmetric on purpose: a parent switching the lock on has nothing to
   * prove, and asking them for the PIN they have just set is friction for
   * nothing. It is the switching off that has to be paid for.
   */
  function toggleParentalCategories(value: boolean) {
    if (!state?.parentalPin) return;
    if (!value && state.parentalLockedCategories) {
      setPinChallenge(() => () => void applyCategoryLock(false));
      return;
    }
    void applyCategoryLock(value);
  }

  const pinDraftComplete = pinDraft.length === PIN_LENGTH;

  /**
   * Saves only a complete PIN. An incomplete draft used to fall through to
   * `setParentalPin(null)` — so typing three digits and pressing Save
   * removed the PIN and unlocked every hidden category, with no message and
   * no way to tell it had happened.
   */
  async function savePin() {
    if (!pinDraftComplete) return;
    await setParentalPin(pinDraft);
    setState((prev) => (prev ? { ...prev, parentalPin: pinDraft } : prev));
    setPinDraft("");
    setPinEditorOpen(false);
  }

  /**
   * Removing is its own action, reached from the "Remove PIN" link in the
   * editor and only once the dialog that link opens has been confirmed.
   */
  async function removePin() {
    await setParentalPin(null);
    await setParentalLockedCategories(false);
    setState((prev) => (prev ? { ...prev, parentalPin: null, parentalLockedCategories: false } : prev));
    setPinDraft("");
    setPinEditorOpen(false);
  }

  /**
   * Runs `action` immediately when no PIN is set, otherwise asks for it
   * first. Used for the category-visibility screens, which are the whole
   * point of the lock — without this, anything hidden could simply be
   * unhidden from Settings.
   *
   * Since 2026-11-17 it also guards the PIN editor itself, which is the
   * other way to the same place: the editor carries "Remove PIN", and
   * removing the PIN clears the lock, so a row that opened it freely was a
   * second, quieter unhide-everything button.
   *
   * ## What happens when the four digits are forgotten
   *
   * Closing both doors left no third one, which is what 2026-11-18 found.
   * This PIN belongs to no account and there is nothing to send a reset to,
   * and after yesterday every control on this screen that would clear it or
   * get round it asks for it first: "Remove PIN" is inside the editor and
   * the editor is behind this gate, the lock switch pays the PIN on its way
   * off (`toggleParentalCategories`), and the three category rows are what
   * the gate was built for.
   *
   * The way out is deliberately *not* on this screen, and it is not one of
   * the clear rows below either. Clearing the history or the artwork cache
   * costs the viewer nothing, and a lock that anything free can open is not
   * a lock; the same goes for Disconnect, which leaves the provider row and
   * its saved password where they are, one tap from Connect. So the exit is
   * the one action in the app that costs more than the lock protects:
   * removing the *last* provider clears the PIN and the category lock with
   * it (providers.tsx, `performDelete`, where the reasoning is set out in
   * full). That takes the panel password out of the keystore and makes the
   * hidden categories unreachable rather than visible, so it reveals nothing
   * to whoever tries it and needs credentials only the person paying for the
   * line has in order to undo.
   *
   * This screen reads `app_state` once, on mount, so a Settings left in the
   * stack behind the provider flow goes on asking for a PIN that has since
   * been cleared — walking backwards far enough reaches it. Opening Settings
   * again is a fresh mount and a fresh `getAppState()`, which is where
   * anyone who has just re-added their provider ends up; it is not worth a
   * focus effect for the one viewer who reverses out of that flow, but it is
   * worth not pretending the stale copy cannot happen.
   *
   * What is still missing is the sentence that tells a stuck parent any of
   * this. It wants a key of its own — `parental.forgotPinNote`, to sit
   * beside `lockCategoriesNote` under the two rows below — and new strings
   * are added centrally, so it is listed with this change rather than
   * approximated here with a string that means something else.
   */
  function withParentalCheck(action: () => void) {
    if (state?.parentalPin && state.parentalLockedCategories) {
      setPinChallenge(() => action);
      return;
    }
    action();
  }

  function confirmClear(title: string, body: string, onConfirm: () => Promise<void>) {
    setPendingConfirm({ title, body, run: onConfirm });
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title={t("settings", "title")} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <SectionLabel>{t("settings", "appearance")}</SectionLabel>
        <Row label={t("settings", "language")} value={localeLabel(locale)} onPress={() => setLanguagePickerOpen(true)} />
        <Row
          label={t("settings", "theme")}
          value={t("settings", THEME_LABEL_KEYS[themePreference])}
          onPress={() => setThemePickerOpen(true)}
        />

        <SectionLabel>{t("settings", "content")}</SectionLabel>
        <Row label={`${t("liveCategories", "title")} — ${t("settings", "manageCategoryVisibility")}`} onPress={() => withParentalCheck(() => router.push({ pathname: "/settings/categories/[contentType]", params: { contentType: "live" } }))} />
        <Row label={`${t("moviesCategories", "title")} — ${t("settings", "manageCategoryVisibility")}`} onPress={() => withParentalCheck(() => router.push({ pathname: "/settings/categories/[contentType]", params: { contentType: "movie" } }))} />
        <Row label={`${t("seriesCategories", "title")} — ${t("settings", "manageCategoryVisibility")}`} onPress={() => withParentalCheck(() => router.push({ pathname: "/settings/categories/[contentType]", params: { contentType: "series" } }))} />


        <SectionLabel>{t("settings", "playback")}</SectionLabel>
        {state && (
          <>
            <ToggleRow label={t("settings", "resumePlayback")} value={state.resumeEnabled} onChange={toggleResume} />
            <ToggleRow
              label={t("settings", "backgroundPlayback")}
              value={state.backgroundPlayback}
              onChange={toggleBackgroundPlayback}
            />
            <ToggleRow
              label={t("settings", "modernChannelView")}
              value={state.splitChannelView}
              onChange={toggleSplitChannelView}
            />
            <Text style={styles.hintText}>{t("settings", "modernChannelViewNote")}</Text>
            <ToggleRow
              label={t("settings", "autoplayNextEpisode")}
              value={state.autoplayNextEpisode}
              onChange={toggleAutoplay}
            />
          </>
        )}

        {/*
          The whole Storage section, not only the row that opens Downloads.

          The gate is the platform and not `downloadsSupported()`, which is
          false on iOS *and* on the TV build (see eligibility.ts). Android TV
          ships today with this label and the "Downloaded content" card on
          screen and only the Manage row missing; that is a live build and it
          keeps exactly what it has.

          On iOS downloads are absent by decision — Guideline 5.2.3, the long
          note in eligibility.ts — so this card could only ever read
          "0 · 0 B". A counter that cannot move is of no use to the viewer,
          and in this category it is the kind of line a reviewer reads back to
          you next to App Review notes saying nothing is saved to the device.

          Nothing is left behind: every element in this section carries its
          own margin (sectionLabelRow, infoCard), and the sections around it
          are a plain stack with no separators between them.
        */}
        {Platform.OS !== "ios" && (
          <>
            <SectionLabel>{t("settings", "storage")}</SectionLabel>
            <View style={styles.infoCard}>
              <InfoRow
                label={t("settings", "downloadedContent")}
                value={
                  downloadsSummary
                    ? `${downloadsSummary.count} · ${formatBytes(downloadsSummary.totalBytes)}`
                    : "—"
                }
              />
            </View>
            {downloadsSupported() && (
              <Row label={t("settings", "manageDownloads")} onPress={() => router.push("/downloads")} />
            )}
          </>
        )}

        <SectionLabel>{t("settings", "data")}</SectionLabel>
        <Row label={t("history", "title")} onPress={() => router.push("/history")} />
        <Row
          label={t("settings", "clearWatchHistory")}
          onPress={() =>
            confirmClear(t("settings", "clearWatchHistory"), t("settings", "clearConfirmBody"), clearAllWatchProgress)
          }
          destructive
        />
        <Row
          label={t("settings", "clearFavorites")}
          onPress={() =>
            confirmClear(t("settings", "clearFavorites"), t("settings", "clearConfirmBody"), () =>
              clearLibraryList("favorite")
            )
          }
          destructive
        />
        <Row
          label={t("settings", "clearWatchLater")}
          onPress={() =>
            confirmClear(t("settings", "clearWatchLater"), t("settings", "clearConfirmBody"), () =>
              clearLibraryList("watch_later")
            )
          }
          destructive
        />

        <SectionLabel>{t("parental", "title")}</SectionLabel>
        {state && (
          <>
            {/*
              Behind the same gate as the category rows above.

              This row opened the editor with no challenge at all, and the
              editor carries "Remove PIN" — so Settings → Parental lock →
              Change PIN → Remove PIN was three taps, none of which asked for
              anything, ending in `parentalPin = null` and the lock off. The
              note directly below these rows says hidden categories can only
              be turned back on with the PIN; until 2026-11-17 that sentence
              was simply untrue, and a child tapping around was all it took.

              `withParentalCheck` is a no-op while no PIN is set, so setting
              one for the first time still asks for nothing — and a no-op
              while the lock is off, which is the state in which there is
              nothing left to protect.

              The whole block waits for `state`, as the playback section
              does. Rendered before `getAppState()` lands, `state?.parentalPin`
              is undefined, the gate falls through, and Save would overwrite
              an existing PIN with one the viewer chose — a few milliseconds
              wide, but it is the one hole that would make all of the above
              pointless.
            */}
            <Row
              label={state.parentalPin ? t("parental", "changePin") : t("parental", "setPin")}
              onPress={() =>
                withParentalCheck(() => {
                  setPinDraft("");
                  setPinEditorOpen(true);
                })
              }
            />
            <ToggleRow
              label={t("parental", "lockCategories")}
              value={state.parentalLockedCategories}
              onChange={toggleParentalCategories}
            />
          </>
        )}
        <Text style={styles.hintText}>
          {state?.parentalPin ? t("parental", "lockCategoriesNote") : t("parental", "noPinYet")}
        </Text>
        {/*
          The way out, stated where the person who needs it is standing.

          Every control that could clear the PIN now asks for the PIN — which is
          the point of a lock, and was the gap fixed on 2026-11-17. The cost of
          getting that right is that a parent who forgets four digits has no
          route back, so one was built deliberately in providers.tsx: removing
          the last provider clears the PIN and the category lock with it. It is
          the only action in the app that cannot double as a bypass, because it
          takes the panel password out of the keystore on the way — a child who
          takes it deletes their own television and is shown nothing.

          A hatch nobody can find is not a hatch, hence this line. It appears
          only once a PIN is actually set: before that, the sentence above is
          already telling the viewer what a PIN would do.
        */}
        {state?.parentalPin ? (
          <Text style={styles.hintText}>{t("parental", "forgotPinNote")}</Text>
        ) : null}

        <Row
          label={`${t("settings", "clearImageCache")} · ${formatBytes(cacheBytes)}`}
          onPress={() =>
            confirmClear(t("settings", "clearImageCache"), t("settings", "clearConfirmBody"), async () => {
              clearImageCache();
            })
          }
        />

        <SectionLabel>{t("settings", "legal")}</SectionLabel>
        <Row label={t("settings", "termsConditions")} onPress={() => router.push("/legal")} />
        {/*
          Required, not optional, and required *here* rather than only on
          the website. Google's Developer Program Policy (effective
          29 October 2026) asks for the policy link in the Play Console
          field "as well as a privacy policy link or text within the app
          itself" — an app that links it only from its store listing is
          half compliant. This opens the text, carried in the app, in the
          viewer's own language.
        */}
        <Row label={t("settings", "privacyPolicy")} onPress={() => router.push("/privacy")} />

        {/*
          The open-source notices, next to the policy because they answer the
          same kind of question. The app statically links FFmpeg under LGPL
          2.1+, and the licence requires that whoever receives the binary is
          told so — until 2026-11-14 nothing in the app, the assets or the
          listing said it anywhere.
        */}
        <Row label={t("settings", "licences")} onPress={() => router.push("/licences")} />

        {/*
          Last but one, and it used to be third.

          Everything above this point is something a viewer changes.
          This card is something they read: the line they are on, when
          it expires, how many connections it carries. Useful, looked up
          perhaps twice in the life of an install, and it was sitting
          between the appearance settings and the playback ones pushing
          both apart — eight rows of text to scroll past to reach a
          switch. Settings that are adjusted come first; settings that
          are consulted come last.

          Manage providers and Disconnect travel with it rather than
          staying behind. They act on the account this card describes,
          and one of them ends the session — neither belongs in the
          part of the page a thumb sweeps through.
        */}
        <SectionLabel>{t("settings", "accountProvider")}</SectionLabel>
        {session && (
          <View style={styles.infoCard}>
            <InfoRow label={t("settings", "provider")} value={session.provider.name} />
            {/*
              The server is masked, not printed. This card was the easiest
              place in the app to read an account off an unlocked phone —
              see core/storage/maskedValue.ts for what that is and is not
              worth. The provider's name above stays visible: the viewer
              chose it and it identifies the account without revealing it.
            */}
            <InfoRow label={t("settings", "server")} value={MASKED_VALUE} />
            {/*
              The username is shown; the server and the password are not.

              A username identifies a line, a password authenticates it, and
              masking the identifier costs support the one thing it needs
              while buying almost nothing: whoever reads it off the screen
              still cannot use it. Support asks "which line is this?" and
              this row is the answer, without the viewer having to find the
              paperwork they signed up with (2026-09-17).

              There is no password row here and there must not be one. The
              server stays masked because together with a weak password it
              is the whole attack surface — see
              core/storage/maskedValue.ts, which is also honest about how
              little any of this masking is worth on a cleartext panel.
            */}
            <InfoRow label={t("settings", "username")} value={session.config.username} />
            {/*
              Status, expiry, connections and the output formats are *not*
              repeated here. The card lower down this page already carries
              all four, in larger type, and a page that states the same
              four facts twice makes a reader check whether they disagree.
              What stays here is what that card does not say: which
              provider, which server, which login, and the server's clock —
              the things you would read out to support.
            */}
            {accountInfo?.serverTimezone && (
              <InfoRow label={t("settings", "serverTimezone")} value={accountInfo.serverTimezone} />
            )}
          </View>
        )}
        <Row label={t("settings", "manageProviders")} onPress={() => router.push("/providers")} />
        <Row label={t("settings", "disconnect")} onPress={() => setConfirmDisconnect(true)} destructive />

        {/*
          The status card and the activity counts, at the foot.

          They were the first two things on this page, and neither is a
          setting: one says when the line expires and how many of its
          connections are in use, the other counts what the viewer has
          watched and saved. Both are read, not changed — so between them
          they pushed every switch on the page down by a screen and a
          half, and the first thing anyone opening Settings had to do was
          scroll past information they had not come for.

          Everything above this line is adjustable. Everything from here
          down is something to look at.
        */}
        {session && (
          <View>
            <View style={styles.accountCard}>
              <View style={styles.accountBanner}>
                <View style={styles.accountBannerLeft}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: accountInfo?.status === "Active" ? themeColors().success : themeColors().error },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      { color: accountInfo?.status === "Active" ? themeColors().success : themeColors().error },
                    ]}
                  >
                    {accountInfo?.status ?? "—"}
                  </Text>
                </View>
                <Text style={styles.accountProviderName} numberOfLines={1}>
                  {session.provider.name}
                </Text>
              </View>
              <View style={styles.chipsRow}>
                <AccountChip
                  label={t("settings", "expiresOn")}
                  value={
                    accountInfo?.expiresAt != null
                      ? formatDate(accountInfo.expiresAt)
                      : t("settings", "neverExpires")
                  }
                  tint={Brand.primary}
                />
                <AccountChip
                  label={t("settings", "connections")}
                  value={
                    accountInfo?.maxConnections != null
                      ? `${accountInfo.activeConnections ?? "—"}/${accountInfo.maxConnections}`
                      : "—"
                  }
                  tint="#8B5CF6"
                />
                <AccountChip
                  label={t("settings", "outputFormats")}
                  value={accountInfo?.allowedOutputFormats[0]?.toUpperCase() ?? "—"}
                  tint="#06B6D4"
                />
              </View>
            </View>
          </View>
        )}

        <SectionHeader title={t("settings", "yourActivity")} />
        <View style={styles.statsRow}>
          {/*
            The same drawn marks the More list uses. These were "◷", "★"
            and a plus sign: one rare glyph, one that renders as colour
            emoji on some Android builds, and one that is simply a plus.
            Three different weights pretending to be a set.
          */}
          <StatCard Icon={HistoryIcon} tint="#06B6D4" count={stats.history} label={t("history", "title")} />
          <StatCard Icon={FavoriteIcon} tint="#EC4899" count={stats.favorites} label={t("home", "favorites")} />
          <StatCard Icon={WatchLaterIcon} tint="#F59E0B" count={stats.watchLater} label={t("home", "watchLater")} />
        </View>

        <SectionLabel>{t("settings", "about")}</SectionLabel>
        <View style={styles.infoCard}>
          <InfoRow label={t("settings", "appVersion")} value={Constants.expoConfig?.version ?? "—"} />
          <InfoRow label={t("settings", "package")} value={Constants.expoConfig?.android?.package ?? "—"} />
        </View>
      </ScrollView>

      <OptionSheet
        visible={languagePickerOpen}
        title={t("settings", "language")}
        options={LOCALES.map((l) => ({ code: l.code, label: l.label }))}
        current={locale}
        onSelect={(code) => {
          setLanguagePickerOpen(false);
          setLocale(code);
        }}
        onClose={() => setLanguagePickerOpen(false)}
      />
      <OptionSheet
        visible={themePickerOpen}
        title={t("settings", "theme")}
        options={THEME_OPTIONS.map((o) => ({ code: o, label: t("settings", THEME_LABEL_KEYS[o]) }))}
        current={themePreference}
        onSelect={(next) => {
          setThemePickerOpen(false);
          setThemePreference(next);
        }}
        onClose={() => setThemePickerOpen(false)}
      />
      </SafeAreaView>

      <ConfirmDialog
        visible={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ""}
        message={pendingConfirm?.body ?? ""}
        confirmLabel={t("common", "clear")}
        danger
        onConfirm={async () => {
          const pending = pendingConfirm;
          setPendingConfirm(null);
          if (pending) {
            await pending.run();
            /*
              After the write, not before it: this is the whole reason
              `refreshCounts` exists — see its own comment. Clearing the
              artwork cache changes no count and clearing the history
              changes no byte total, but three cached SQLite reads and a
              directory stat are cheaper than four call sites that each
              have to remember which of the two they are.
            */
            await refreshCounts();
          }
        }}
        onCancel={() => setPendingConfirm(null)}
      />

      {/*
        The same question Home asks, in the same words, because it is the
        same action — home.tsx confirms before it disconnects and this row
        did not. A thumb brushing the last row of Settings cleared the
        session, dismissed the whole stack and landed on the provider list,
        with no dialog and nothing to undo it; the viewer had to re-enter
        the provider to get back. Every other destructive row on this page
        already asks (clear history, favourites, watch later, artwork
        cache) — this one was the exception (2026-11-17).

        It cannot reuse `pendingConfirm` above: that dialog's confirm button
        is hard-wired to t("common","clear"), and the button on this one has
        to say Disconnect.
      */}
      <ConfirmDialog
        visible={confirmDisconnect}
        title={t("settings", "disconnect")}
        message={t("settings", "disconnectConfirmBody")}
        confirmLabel={t("settings", "disconnect")}
        danger
        onConfirm={() => {
          setConfirmDisconnect(false);
          disconnect();
        }}
        onCancel={() => setConfirmDisconnect(false)}
      />

      {/*
        Removing the PIN is the most destructive control on this page — it
        takes the lock with it, since `removePin` clears
        `parentalLockedCategories` as well — and it was the only destructive
        control here that asked nothing at all. Clearing the watch history
        asks; removing the thing that keeps a child out of the hidden
        categories did not (2026-11-17).

        The message names what is actually lost, which is not the four
        digits. `parental.removePinConfirmBody` says that removing the PIN
        also switches off the category lock, and that every hidden category
        can then be shown again without it. That is the consequence the
        parent is agreeing to, and the reason the four clear rows' "this
        cannot be undone" was the wrong sentence to borrow here: what
        cannot be undone is not the loss of a PIN but the loss of the lock.
      */}
      <ConfirmDialog
        visible={confirmRemovePin}
        title={t("parental", "removePin")}
        message={t("parental", "removePinConfirmBody")}
        confirmLabel={t("common", "remove")}
        danger
        onConfirm={() => {
          setConfirmRemovePin(false);
          void removePin();
        }}
        onCancel={() => {
          setConfirmRemovePin(false);
          setPinEditorOpen(true);
        }}
      />

      <Modal visible={pinEditorOpen} transparent animationType="fade" onRequestClose={() => setPinEditorOpen(false)}>
        <Pressable style={styles.pinBackdrop} focusable={false} onPress={() => setPinEditorOpen(false)}>
          <Pressable style={styles.pinCard} focusable={false} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.pinTitle}>{t("parental", "setPin")}</Text>
            <TextInput
              style={styles.pinInput}
              value={pinDraft}
              onChangeText={(value) => setPinDraft(value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
              keyboardType="number-pad"
              secureTextEntry
              autoFocus
              maxLength={PIN_LENGTH}
              placeholder={"\u2022".repeat(PIN_LENGTH)}
              placeholderTextColor={themeColors().textMuted}
            />
            <BouncePressable
              style={[styles.pinSave, !pinDraftComplete && styles.pinSaveDisabled]}
              disabled={!pinDraftComplete}
              onPress={savePin}
            >
              <Text style={styles.pinSaveText}>{t("common", "save")}</Text>
            </BouncePressable>
            {state?.parentalPin && (
              <Focusable
                onPress={() => {
                  /*
                    The editor closes and the question takes its place,
                    rather than a dialog stacking on top of a Modal that is
                    still open. Two native dialog windows at once is
                    something Android and the TV build each get wrong in
                    their own way, and this is not the screen to find out
                    on. Cancelling puts the editor back exactly where it
                    was.
                  */
                  setPinEditorOpen(false);
                  setConfirmRemovePin(true);
                }}
              >
                <Text style={styles.pinRemoveText}>{t("parental", "removePin")}</Text>
              </Focusable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <PinPrompt
        visible={pinChallenge !== null}
        expectedPin={state?.parentalPin ?? ""}
        title={t("parental", "enterPin")}
        onCancel={() => setPinChallenge(null)}
        onSuccess={() => {
          const action = pinChallenge;
          setPinChallenge(null);
          action?.();
        }}
      />
    </ScreenBackground>
  );
}

function AccountChip({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <View style={styles.accountChip}>
      <View style={[styles.accountChipDot, { backgroundColor: tint }]} />
      <Text style={styles.accountChipLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.accountChipValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function StatCard({
  Icon,
  tint,
  count,
  label,
}: {
  Icon: (props: { color: string; size: number }) => React.ReactNode;
  tint: string;
  count: number;
  label: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: `${tint}22` }]}>
        <Icon color={tint} size={19} />
      </View>
      <Text style={styles.statCount}>{count}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}


function localeLabel(code: LocaleCode): string {
  return LOCALES.find((l) => l.code === code)?.label ?? code;
}

/**
 * The sheet both pickers open.
 *
 * It was the language picker and nothing else until 2026-11-17, when the theme
 * stopped being a strip of three buttons and became a row like the language
 * one — "خليها مثل الغات بتتفح قائمة وبختار داكن او فاتح او حسب النظام". Two
 * near-identical sheets would have been two places to keep a padding value in
 * step, so there is one, and only its title and its list vary.
 */
function OptionSheet<T extends string>({
  visible,
  title,
  options,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { code: T; label: string }[];
  current: T;
  onSelect: (code: T) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} focusable={false} onPress={onClose}>
        <Pressable style={styles.modalSheet} focusable={false} onPress={(e) => e.stopPropagation()}>
          {/*
            A heading, which this sheet did not have.

            The one in onboarding does, and a list of six words with no
            title is a list of six words: it opens over the page it was
            called from and nothing on it says what choosing does. One
            line fixes that.
          */}
          <Text style={styles.modalTitle}>{title}</Text>
          {options.map((o) => (
            <Focusable
              key={o.code}
              style={styles.modalOptionRow}
              hasTVPreferredFocus={o.code === current}
              onPress={() => onSelect(o.code)}
            >
              <Text style={[styles.modalOptionText, o.code === current && styles.modalOptionTextActive]}>
                {o.label}
              </Text>
            </Focusable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionLabelBar} />
      <Text style={styles.sectionLabelText}>{children}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * One settings row, and the tick it answers with.
 *
 * The feedback hook is taken here rather than threaded down from the
 * screen, unlike the More list — this screen has upwards of twenty rows
 * but only a handful are mounted as components at once, and the
 * alternative is twenty props. Each instance loads the same cached asset.
 */
function Row({
  label,
  value,
  onPress,
  destructive,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const tap = useTapFeedback();
  return (
    <BouncePressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={styles.row}
    >
      <Text style={[styles.rowText, destructive && styles.rowTextDestructive]}>{label}</Text>
      {value && <Text style={styles.rowValue}>{value}</Text>}
      {!destructive && <Text style={styles.rowChevron}>›</Text>}
    </BouncePressable>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const tap = useTapFeedback();
  return (
    <View style={styles.row}>
      <Text style={styles.rowText}>{label}</Text>
      <Switch
        value={value}
        onValueChange={(next) => {
          tap();
          onChange(next);
        }}
        trackColor={{ true: Brand.primary }}
      />
    </View>
  );
}


const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  pinBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  pinCard: {
    width: "80%",
    maxWidth: 320,
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: Radii.xl,
    backgroundColor: C.surface,
  },
  pinTitle: { color: C.text, fontSize: 15, lineHeight: 24, fontFamily: FontFamily.bold },
  pinInput: {
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
  pinSave: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.pill,
    backgroundColor: Brand.primary,
  },
  pinSaveDisabled: { opacity: 0.4 },
  pinSaveText: { color: C.onAccent, fontSize: 13, lineHeight: 22, fontFamily: FontFamily.bold },
  pinRemoveText: { color: C.error, fontSize: 12, lineHeight: 20, fontFamily: FontFamily.semiBold },
  safeArea: { flex: 1 },

  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.sm },

  accountCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.xl,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  accountBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    backgroundColor: Brand.primaryMuted,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  accountBannerLeft: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { fontSize: 13, fontFamily: FontFamily.bold },
  accountProviderName: { flex: 1, color: C.text, fontSize: 13, fontFamily: FontFamily.semiBold, textAlign: "right" },
  chipsRow: { flexDirection: "row", gap: Spacing.sm, padding: Spacing.md },
  accountChip: {
    flex: 1,
    backgroundColor: C.surfaceElevated,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
    alignItems: "center",
    gap: 3,
  },
  accountChipDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 2 },
  accountChipLabel: { color: C.textMuted, fontSize: 9, fontFamily: FontFamily.regular, textAlign: "center" },
  accountChipValue: { color: C.text, fontSize: 12, fontFamily: FontFamily.bold, textAlign: "center" },

  statsRow: { flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.lg,
    alignItems: "center",
    paddingVertical: Spacing.lg,
    gap: Spacing.xs,
  },
  statIconWrap: { width: 36, height: 36, borderRadius: Radii.md, alignItems: "center", justifyContent: "center" },
  statGlyph: { fontSize: 16, fontFamily: FontFamily.bold },
  statCount: { color: C.text, fontSize: 19, fontFamily: FontFamily.extraBold },
  statLabel: { color: C.textMuted, fontSize: 10, fontFamily: FontFamily.regular },

  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginTop: Spacing.lg, marginBottom: Spacing.xs },
  sectionLabelBar: { width: 3, height: 16, borderRadius: 2, backgroundColor: Brand.primary },
  sectionLabelText: { color: C.text, fontSize: 14, fontFamily: FontFamily.bold },

  hintText: {
    color: C.textMuted,
    fontSize: 11,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    marginTop: 2,
    paddingBottom: Spacing.sm,
  },

  infoCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: Spacing.md },
  infoLabel: { color: C.textMuted, fontSize: 12, fontFamily: FontFamily.regular },
  infoValue: { flex: 1, color: C.text, fontSize: 12, fontFamily: FontFamily.medium, textAlign: "right" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  rowText: { flex: 1, color: C.text, fontSize: 13, fontFamily: FontFamily.medium },
  rowTextDestructive: { color: C.error },
  rowValue: { color: C.textMuted, fontSize: 12, fontFamily: FontFamily.regular },
  rowChevron: { color: C.textMuted, fontSize: 18, fontFamily: FontFamily.regular },
  rowInput: {
    color: C.text,
    fontSize: 13,
    fontFamily: FontFamily.regular,
    minWidth: 80,
    textAlign: "right",
  },



  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    padding: Spacing.lg,
  },
  modalTitle: {
    color: C.text,
    fontSize: 15,
    fontFamily: FontFamily.bold,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    ...AndroidTextFix,
  },
  /**
   * The same inset the title has, which it did not used to.
   *
   * `modalSheet` pads everything by `lg`, and `modalTitle` then adds another
   * `lg` of its own — so the heading sat 32 in while every option sat 16 in,
   * and the options read as falling off the left edge of the sheet. The owner
   * put it plainly on 2026-11-17: "كثير رايحين يسار". They line up now.
   */
  modalOptionRow: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg },
  modalOptionText: { color: C.textSecondary, fontSize: 15, fontFamily: FontFamily.medium },
  modalOptionTextActive: { color: Brand.primaryLight, fontFamily: FontFamily.bold },
  })
);
