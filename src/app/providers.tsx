import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { Focusable } from "@/components/Focusable";
import { BouncePressable } from "@/components/BouncePressable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ScreenBackground } from "@/components/ScreenBackground";
import { PreparingLibrary } from "@/components/PreparingLibrary";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toUserFacingMessage } from "@/core/errors/providerErrorMessage";
import { useI18n } from "@/core/i18n/I18nContext";
import { deleteProviderCredentials } from "@/core/storage/secureCredentials";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import { brandLogoSource } from "@/components/BrandLogo";
import { LogoRipple } from "@/components/LogoRipple";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import { setParentalLockedCategories, setParentalPin } from "@/db/repositories/appStateRepository";
import { clearCatalogCache } from "@/db/repositories/catalogCacheRepository";
import { deleteProvider, listProviders, setActiveProvider } from "@/db/repositories/providerRepository";
import type { Provider } from "@/domain/provider/types";
import { clearActiveSession, getActiveSession } from "@/state/activeSessionStore";
import type { PreloadProgress } from "@/state/catalogCache";
import { MASKED_VALUE } from "@/core/storage/maskedValue";
import { restoreSession } from "@/state/sessionRestore";

function formatLastConnected(t: ReturnType<typeof useI18n>["t"], timestamp: number | null): string {
  if (timestamp === null) return t("providers", "neverConnected");
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t("common", "justNow");
  if (minutes < 60) return t("common", "minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("common", "hoursAgo", { n: hours });
  return t("common", "daysAgo", { n: Math.floor(hours / 24) });
}

export default function ProvidersScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  /**
   * This screen arrives two ways, and they are not the same screen.
   *
   * The startup gate *replaces* into it — first run, after the legal gate,
   * after a disconnect — and then there is nothing behind it: it is the
   * app's front door, so it keeps the full-size mark and offers no back
   * control, which would have nowhere to go. Settings → "إدارة المزودين"
   * *pushes* it, and then it is a management screen inside a running
   * session: it needs the way back it simply did not have before
   * 2026-11-17, and a 190dp logo there is 190dp of nothing between the
   * viewer and the list they came to change.
   *
   * Read during render on purpose. It is a fact about how this screen was
   * entered, and that cannot change while it is on screen. (It also answers
   * `false` before the navigator is mounted, which is the right answer for
   * the one case — the root entrance — that can render that early.)
   */
  const canGoBack = router.canGoBack();
  /** Half-size mark: little height to spend, or no welcome to make. */
  const compact = isLandscape || canGoBack;
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Provider | null>(null);
  /**
   * Non-null only while a *cold* catalogue is coming down — a provider this
   * device has never cached. `restoreSession` reports progress on that path
   * only (`sessionRestore.ts` hands the callback to `preloadCatalog` and
   * nowhere else), so an everyday reconnect never touches it and the screen
   * never flickers through the preparation view.
   *
   * Found 2026-11-17: without it that download ran behind the 20dp spinner
   * in one row's Connect slot and nothing else on screen moved. It is the
   * most likely first action of anyone upgrading from the published 1.x —
   * `legacyProviderImport` brings their providers across deliberately
   * inactive and writes no catalogue, so day one is a tap on Connect with
   * nothing stored. For minutes the app read as hung.
   */
  const [preload, setPreload] = useState<PreloadProgress | null>(null);

  const reload = useCallback(() => {
    /*
      The empty list on failure is deliberate, and it is this app's only
      escape hatch.

      `providers === null` renders a bare spinner with no text and no retry,
      and this screen is where the startup sequence sends anyone whose
      routing could not be decided. `getDatabase()` memoises its promise,
      a rejected one included, so a database that fails to open once fails
      for the life of the process — leaving that spinner on screen on every
      launch, for ever, with nothing to press. An empty list at least draws
      the "add a provider" screen, which is somewhere a person can act from.
    */
    listProviders().then(setProviders, () => setProviders([]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function handleSelect(provider: Provider) {
    if (busyId) return;
    if (provider.isActive && getActiveSession()?.provider.id === provider.id) {
      /*
       * Both exits from this function dismiss the stack, and this is the
       * branch that needed it most. Settings reaches this screen with
       * `router.push`, so the stack is [(tabs), settings, providers]; a bare
       * `replace` swapped only the top entry and left
       * [(tabs), settings, (tabs)] — two tab navigators mounted at once, two
       * Homes with their own lists and wave animations, double the memory,
       * and a second back landing on the stale one. That is exactly what the
       * comment on this function's other exit — the successful-restore one
       * below — was written to prevent, and tapping the provider that is
       * *already* connected was the one way round it. Found 2026-11-17.
       */
      router.dismissAll();
      router.replace("/home");
      return;
    }
    setBusyId(provider.id);
    setErrorMessage(null);
    try {
      await restoreSession(provider, {
        /*
         * The same screen the rest of the app shows for this work.
         *
         * `restoreSession` reports progress only when it has to download a
         * cold catalogue, so this costs nothing on a provider the device has
         * already cached. When it does fire it is seven steps and 180
         * artwork fetches — minutes on a cold line — and until 2026-11-17
         * the only thing moving on screen was a 20dp spinner in one row's
         * Connect slot. index.tsx and add-provider.tsx have passed this all
         * along; this was the one entrance to the same wait that showed
         * nothing.
         */
        onPreloadProgress: setPreload,
      });
      /*
       * Persist the choice, not just the in-memory session. Without this the
       * `providers.is_active` flag stayed on whichever provider was added
       * last, so the next launch silently restored *that* one — the user
       * connected to B, used it, reopened the app and was back on A — and
       * the list kept its "Active" dot on the wrong row.
       */
      await setActiveProvider(provider.id);
      /*
       * Same reason as Settings' disconnect: reached from Settings, a plain
       * `replace` would leave the previous provider's Home in the stack,
       * and two backs would land on it — its header describing provider A
       * over provider B's catalogue.
       */
      router.dismissAll();
      router.replace("/home");
    } catch (error) {
      // The same translated wording every other screen uses; the raw message
      // is a transport detail ("HTTP 404 from http://…"), not something to show.
      setErrorMessage(toUserFacingMessage(error, t("providers", "connectError")));
      reload();
    } finally {
      setBusyId(null);
      // Torn down on every exit, success or failure, exactly as add-provider
      // does it — a connect that fails has to come back to the list, not sit
      // on a progress bar that has stopped.
      setPreload(null);
    }
  }

  function handleEdit(provider: Provider) {
    router.push({ pathname: "/add-provider", params: { providerId: provider.id } });
  }

  async function performDelete(provider: Provider) {
    await deleteProvider(provider.id);
    await deleteProviderCredentials(provider.id);
    /*
     * The catalogue goes with the provider.
     *
     * `catalog_cache` has no foreign key to `providers` — migration 10
     * declares `PRIMARY KEY (provider_id, kind)` and nothing else — so
     * nothing cascaded, and removing a line left its six rows (live, movies,
     * series and their three category lists, each a JSON copy of a lineup
     * that can run to tens of thousands of titles) in SQLite for ever,
     * unreachable by any code path: `readCachedCatalog` is only ever called
     * with a live provider's id. Storage never went down after a removal,
     * and it compounded with every provider added and dropped. add-provider
     * was this function's only caller until 2026-11-17.
     */
    await clearCatalogCache(provider.id);
    if (getActiveSession()?.provider.id === provider.id) {
      clearActiveSession();
    }
    /*
     * The last provider takes the parental PIN with it, and that is the only
     * way back for whoever has forgotten it.
     *
     * 2026-11-18. Yesterday both the "Change PIN" row and the "Require PIN"
     * switch in Settings were put behind `withParentalCheck`, which was
     * right — between them they were a three-tap unhide-everything path. The
     * consequence nobody checked is that they were also the last two doors
     * out: the PIN lives in `app_state`, it is attached to no account, there
     * is no address to send a reset to, and every remaining control that
     * would clear it asks for it first. A parent who forgets four digits had
     * nothing left to press.
     *
     * Why the exit is here and not on the screen that locked them out:
     *
     * - A PIN that can be cleared for free is not a lock. Disconnect is
     *   free — it clears the session and leaves the provider row and its
     *   password exactly where they are, one tap from Connect — so clearing
     *   the PIN there would be the same unhide-everything with two extra
     *   steps. Removing a provider is not free: the two lines above take the
     *   panel password out of the keystore and the catalogue out of SQLite,
     *   and `hidden_categories` has been scoped to `provider_id` since
     *   migration 24 while every added provider is minted with a fresh id —
     *   so what was hidden does not come back either. (Those rows are not
     *   deleted, there being no cascade on that table; they are simply
     *   stranded under an id nothing will ever carry again.)
     *   Whoever takes this route is left at the add-provider form needing
     *   credentials that only the person paying for the line has. A child who
     *   finds it deletes their own television; nothing is revealed to them,
     *   which is the whole test.
     * - At zero providers, not on every removal. With two lines saved,
     *   clearing the household PIN because one of them was dropped would
     *   expose what is still hidden on the other. With none left there is no
     *   catalogue, no category and no session for the lock to stand in front
     *   of.
     *
     * The list is read again rather than counted from what `reload()` is
     * about to fetch, because that one is fire-and-forget; `providers` is a
     * handful of rows. A read that fails leaves the PIN alone — a lock is
     * the wrong thing to open on a database that just refused a SELECT.
     */
    const remaining = await listProviders().catch(() => null);
    if (remaining?.length === 0) {
      await setParentalPin(null);
      await setParentalLockedCategories(false);
    }
    reload();
  }

  /*
    Before every other branch, for the same reason index.tsx puts it first:
    while a cold catalogue is coming down there is nothing on this screen
    worth looking at, and the preparation view is the app's one answer to
    "this will take a while" — a real bar driven by real progress, and rings
    that keep moving between steps.
  */
  if (preload) {
    return <PreparingLibrary progress={preload} />;
  }

  if (providers === null) {
    return (
      <ScreenBackground>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centered}>
            <ActivityIndicator color={Brand.primary} />
          </View>
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground particles>
      <SafeAreaView style={styles.safeArea}>
        {/*
          The screen had no title and no way back at all. It is pushed from
          Settings → "إدارة المزودين", and in that case the only exit was the
          hardware key — on the television, the remote's back button and
          nothing on screen. Worse to look at: the biggest type here was the
          card's own 15pt panel header, so the parent read as less finished
          than the add-provider screen it opens with a 22pt title. This is the
          same header the other twelve pushed screens use, and it is drawn off
          the same `canGoBack` that sizes the mark below — there is a way back
          only when something pushed us. Found 2026-11-17.

          2026-11-18: and only while nothing is in flight. The chevron stayed
          live through a connect, and `handleSelect` goes on running after the
          screen it was started from is popped — so leaving through it meant
          `setPreload` landing on something unmounted, the PreparingLibrary
          view that the same change added never appearing at all, and a
          `dismissAll()` + `replace("/home")` arriving some minutes later from
          a closure the viewer had walked away from. Every other control on
          this screen is already dead for the duration.

          Taken away rather than dimmed, which is the opposite of what the
          rows do, and for a reason: the empty 38dp leading box ScreenHeader
          draws when there is no back button is exactly the width the button
          occupied, so the title does not move when this flips. Dimming it
          would need either a `disabled` BackButton does not have or a
          `pointerEvents` wrapper — and `pointerEvents` stops a finger, not
          the select key on a remote, so on the television that leaves a lit,
          focusable control that still fires. The remote's own back button
          still pops the screen; that is Android's, not ours, and it was
          already true when this header had no chevron at all.
        */}
        <ScreenHeader
          title={t("providers", "title")}
          showBack={canGoBack && busyId === null}
          right={
            providers.length > 0 ? (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{providers.length}</Text>
              </View>
            ) : undefined
          }
        />
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.duration(500)} style={styles.brand}>
            <LogoRipple size={compact ? 120 : 200}>
              <View style={[styles.logoWrap, compact && styles.logoWrapCompact]}>
                <Image
                  source={brandLogoSource()}
                  style={[styles.logo, compact && styles.logoCompact]}
                  resizeMode="contain"
                />
              </View>
            </LogoRipple>
            <Text style={styles.tagline}>{t("providers", "tagline")}</Text>
          </Animated.View>

          {/*
            The providers live inside one bordered panel rather than as bare
            rows on the page background: the grouping is what makes the screen
            read as designed instead of as a list dropped onto a backdrop, and
            it gives the "add" action a natural home at the head of the list
            it adds to.

            The panel used to carry its own 15pt "المزودون" header and the
            count beside it. Both moved into the ScreenHeader above on
            2026-11-17: the title because two of them a few points apart was
            the whole of this screen's hierarchy problem — the in-card one was
            the largest type on a screen with no screen title — and the count
            because it belongs to the screen, not to the panel. Nothing takes
            their place here: a second label would say the same word twice,
            and the rows underneath are self-evidently the providers.
          */}
          <Animated.View entering={FadeInUp.delay(150).duration(600)} style={styles.section}>
            <View style={styles.sectionHeader}>
              {/*
                Dead while a connect runs, like every other control here: the
                form this opens would be torn down under the viewer by the
                `dismissAll()` + `replace("/home")` that ends a successful
                restore, taking whatever they had typed with it.
              */}
              <BouncePressable
                style={[styles.addChip, busyId !== null && styles.disabledWhileBusy]}
                onPress={() => router.push("/add-provider")}
                disabled={busyId !== null}
              >
                <Text style={styles.addChipText}>{t("providers", "addProvider")}</Text>
              </BouncePressable>
            </View>

            {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

            {providers.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIconText}>▭</Text>
                <Text style={styles.emptyText}>{t("providers", "noProvidersYet")}</Text>
              </View>
            ) : (
              <View style={styles.providerList}>
                {/*
                  `.map`, not a FlatList: this sits inside a ScrollView (a
                  nested virtualised list is a documented RN anti-pattern),
                  and a saved-provider list is a handful of rows — there is
                  nothing here to virtualise.
                */}
                {providers.map((item, index) => (
                  <Animated.View key={item.id} entering={FadeInDown.delay(index * 60).duration(400)}>
                    <ProviderCard
                      provider={item}
                      isBusy={busyId === item.id}
                      disabled={busyId !== null}
                      onSelect={() => handleSelect(item)}
                      onEdit={() => handleEdit(item)}
                      onDelete={() => setPendingDelete(item)}
                      t={t}
                    />
                  </Animated.View>
                ))}
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title={t("providers", "removeTitle")}
        message={t("providers", "removeBody", { name: pendingDelete?.name ?? "" })}
        confirmLabel={t("common", "remove")}
        danger
        onConfirm={async () => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) await performDelete(target);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </ScreenBackground>
  );
}

function ProviderCard({
  provider,
  isBusy,
  disabled,
  onSelect,
  onEdit,
  onDelete,
  t,
}: {
  provider: Provider;
  isBusy: boolean;
  disabled: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <View
      style={[
        styles.row,
        provider.isActive && styles.rowActive,
        // The row being connected keeps its full opacity, so the dimming also
        // says which one the viewer pressed.
        disabled && !isBusy && styles.disabledWhileBusy,
      ]}
    >
      {provider.isActive && (
        <View style={styles.activeBadge}>
          <View style={styles.activeDot} />
        </View>
      )}
      <BouncePressable style={styles.rowMainTouchable} onPress={onSelect} disabled={disabled}>
        <View style={styles.rowMain}>
          <View style={[styles.iconWrap, provider.isActive && styles.iconWrapActive]}>
            <Text style={styles.iconText}>{provider.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.rowTextCol}>
            <Text style={styles.rowName} numberOfLines={1}>
              {provider.name}
            </Text>
            {/* Masked for the same reason as the Settings card. */}
            <Text style={styles.rowHost} numberOfLines={1}>
              {MASKED_VALUE}
            </Text>
            <Text style={styles.rowMeta}>{formatLastConnected(t, provider.lastConnectedAt)}</Text>
          </View>
        </View>
      </BouncePressable>

      {/*
        The card was already tappable as a whole, and stays so — but tapping
        a row to connect is a convention people have to be told about, and
        nothing on screen said it. A filled button states the action
        outright; the row itself remains a shortcut for anyone who found it.
      */}
      <View style={styles.rowActions}>
        {isBusy ? (
          <ActivityIndicator color={Brand.primary} style={styles.busyIndicator} />
        ) : (
          <BouncePressable style={styles.connectButton} onPress={onSelect} disabled={disabled}>
            <Text style={styles.connectButtonText} numberOfLines={1}>
              {t("providers", "connect")}
            </Text>
          </BouncePressable>
        )}
        <Focusable onPress={onEdit} hitSlop={10} disabled={disabled} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>{t("providers", "edit")}</Text>
        </Focusable>
        <Focusable onPress={onDelete} hitSlop={10} disabled={disabled} style={styles.actionButton}>
          <Text style={styles.deleteButtonText}>{t("common", "remove")}</Text>
        </Focusable>
      </View>
    </View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.lg, padding: Spacing.xl },

  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  brand: { alignItems: "center", paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.sm },
  /**
   * No plate behind the mark.
   *
   * There was one: a 200dp rounded square filled with `fillSubtle`, so the
   * logo would have "a defined edge on a dark, particle-lit background
   * instead of letting it dissolve into it". That was written for the
   * previous brand, whose mark was lettering — thin white strokes that
   * genuinely do dissolve into a dark page and need something behind them.
   *
   * Mooj's mark is a self-lit sphere with its own gradient and its own
   * dark rim. It has the edge the plate was there to give it, so all the
   * plate did was put a visibly lighter square behind a circle, which is
   * what it looks like on a device: a mistake. The wrapper stays for the
   * sizing and the compact cases below; only the fill goes.
   */
  logoWrap: {
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  /**
   * Half size, in the two cases where a full-screen welcome is not what is
   * wanted: landscape, which has roughly half the height to spend, and the
   * screen reached from Settings, where the viewer came to change a line
   * rather than to be greeted. The first run keeps the big mark — that is the
   * only time this screen is the app's front door.
   */
  logoWrapCompact: { width: 120, height: 120 },
  logo: { width: 190, height: 190 },
  logoCompact: { width: 112, height: 112 },
  tagline: {
    color: C.textMuted,
    fontSize: 13,
    lineHeight: 22,
    fontFamily: FontFamily.regular,
    textAlign: "center",
    ...AndroidTextFix,
  },

  section: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  /**
   * `flex-end`, not `space-between`: the row held a title at the start and
   * the add chip at the end, and since the title moved into the ScreenHeader
   * (2026-11-17) the chip is the only thing left in it. `space-between` with
   * one child parks it at the start, which would have walked it across the
   * panel; `flex-end` leaves it exactly where it has always been drawn.
   */
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: Brand.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: { color: "#fff", fontSize: 12, fontFamily: FontFamily.bold },
  addChip: {
    backgroundColor: Brand.primary,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  addChipText: { color: "#fff", fontSize: 13, lineHeight: 22, fontFamily: FontFamily.bold, ...AndroidTextFix },

  /**
   * Dead controls that look dead.
   *
   * While a connect runs, every other row and the add chip are passed
   * `disabled` — and neither BouncePressable nor Focusable draws anything for
   * it. On 2026-11-17 a list of four providers therefore showed thirteen
   * fully lit controls that did nothing at all for as long as the connection
   * took, which on a cold catalogue is minutes: three untouched rows carrying
   * four targets each (the row itself, Connect, Edit, Remove), plus the add
   * chip. The connecting row is left at full opacity on purpose — its spinner
   * is already saying what it is doing.
   */
  disabledWhileBusy: { opacity: 0.45 },

  providerList: { gap: Spacing.sm },

  error: {
    color: C.error,
    fontSize: 13,
    lineHeight: 22,
    fontFamily: FontFamily.regular,
    marginBottom: Spacing.sm,
  },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xxl,
    borderRadius: Radii.lg,
    backgroundColor: C.surfaceElevated,
  },
  emptyIconText: { color: C.fillMedium, fontSize: 34 },
  emptyText: { color: C.textMuted, fontSize: 13, lineHeight: 22, fontFamily: FontFamily.regular },

  /**
   * A column, not a row: the connect button sits under the provider's
   * details rather than beside them, so it gets the full width of the card
   * and reads as the card's primary action instead of as a third small
   * control competing with edit and remove.
   */
  row: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.lg,
    overflow: "hidden",
  },
  rowActive: { borderColor: Brand.primary, backgroundColor: Brand.primaryMuted },
  rowMainTouchable: { alignSelf: "stretch" },
  rowMain: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.lg },
  activeBadge: { position: "absolute", top: Spacing.sm, end: Spacing.sm, zIndex: 1 },
  activeDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Brand.primary },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radii.md,
    backgroundColor: C.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: { backgroundColor: Brand.primaryMuted },
  iconText: { color: C.textSecondary, fontSize: 18, fontFamily: FontFamily.extraBold },
  rowTextCol: { flex: 1, gap: 2 },
  rowName: { color: C.text, fontSize: 15, fontFamily: FontFamily.bold },
  rowHost: { color: C.textSecondary, fontSize: 12, fontFamily: FontFamily.regular },
  rowMeta: { color: C.textMuted, fontSize: 11, fontFamily: FontFamily.regular },

  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  /**
   * `minHeight`, never a fixed height — a mixed Arabic/Latin label measures
   * a taller line box than a plain-Arabic one, and a fixed height can only
   * clip that (docs/DECISIONS.md).
   */
  connectButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: Radii.md,
    backgroundColor: Brand.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  connectButtonText: {
    color: C.onAccent,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: FontFamily.bold,
    ...AndroidTextFix,
  },
  /** Occupies the button's slot while connecting, so the row does not jump. */
  busyIndicator: { flex: 1, minHeight: 40 },
  actionButton: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  actionButtonText: { color: Brand.primaryLight, fontSize: 12, fontFamily: FontFamily.semiBold },
  deleteButtonText: { color: C.error, fontSize: 12, fontFamily: FontFamily.semiBold },
  })
);
