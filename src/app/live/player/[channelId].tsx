import { useEventListener } from "expo";
import { useKeepAwake } from "expo-keep-awake";
import { router, useLocalSearchParams } from "expo-router";
import type { VideoContentFit } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type AppStateStatus,
} from "react-native";
import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { brandLogoOnDark } from "@/components/BrandLogo";
import { BackChevron } from "@/components/BackButton";
import { Focusable } from "@/components/Focusable";

import { playbackReasonKey } from "@/core/errors/playbackReason";
import { useI18n } from "@/core/i18n/I18nContext";
import { PROVIDER_REQUEST_HEADERS } from "@/core/network/providerHeaders";
import { useIsOffline } from "@/core/network/useIsOffline";
import { useNetworkReconnect } from "@/core/network/useNetworkReconnect";
import { AndroidTextFix, Brand, Colors, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import { getAppState, setPlayerFitMode } from "@/db/repositories/appStateRepository";
import { setLastChannelId } from "@/db/repositories/liveTvStateRepository";
import type { LiveChannel } from "@/domain/provider/types";
import { ChannelGuideOverlay } from "@/playback/ChannelGuideOverlay";
/*
  The player engine, and the only place this screen says which one it is
  using — which is nowhere: `@/playback/engine` resolves to `expo-video` on
  Android (unchanged, what ships today) and to libVLC on iOS, where
  AVFoundation refuses this provider's bare progressive MPEG-TS. Read
  `src/playback/engine/livePlaybackEngine.ios.tsx` for what libVLC cannot
  match and what is done about it; the three differences this screen has to
  know about are `releaseLiveSource` (a null source has no libVLC meaning),
  `toEnginePlaybackError` (libVLC's failures carry no HTTP status, so the
  engine classifies them itself), and rotation, noted where the two layout
  branches part company below.
*/
import {
  LiveVideoView,
  releaseLiveSource,
  toEnginePlaybackError,
  useLivePlayer,
} from "@/playback/engine";
import { isTvBuild } from "@/core/platform/isTvBuild";
import { useTVRemote } from "@/playback/useTVRemote";
import { PlayerLifecycleMonitor } from "@/playback/diagnostics/PlayerLifecycleMonitor";
import { GestureHud } from "@/playback/GestureHud";
import { LiveDot } from "@/playback/LiveDot";
import { useCategoryScroll } from "@/core/layout/useCategoryScroll";
import { CHANNEL_ROW_HEIGHT, CHANNEL_ROW_SPACING } from "@/playback/ChannelListRow";
import { SplitChannelView } from "@/playback/SplitChannelView";
import { ChannelSwitchController, type ChannelSwitchTarget } from "@/playback/switching/ChannelSwitchController";
import { TrackSelectorModal } from "@/playback/TrackSelectorModal";
import { useBackgroundPlayback } from "@/playback/useBackgroundPlayback";
import * as ScreenOrientation from "expo-screen-orientation";
import { useFullscreenOrientation } from "@/playback/useFullscreenOrientation";
import { usePlaybackTracks } from "@/playback/usePlaybackTracks";
import { usePlayerGestures } from "@/playback/usePlayerGestures";
import { usePlayerMute } from "@/playback/usePlayerMute";
import { getActiveSession } from "@/state/activeSessionStore";
import { loadLiveCategories } from "@/state/categoryQueries";
import { useEpgNowNext, useNowTick } from "@/state/epgCache";

function formatTimeOfDay(ms: number): string {
  const d = new Date(ms);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/**
 * How far every control layer sits from the side of the screen.
 *
 * Wide enough that a thumb reaching the guide button does not catch the
 * edge of the glass on the way — the phone's own edge gestures and palm
 * rejection both live in the first few millimetres.
 */
const CONTROL_EDGE = Spacing.xl;

/**
 * How long D-pad zapping waits, after the last press, before it tunes.
 *
 * Deliberately longer than the category rail's 350ms: getting a category
 * wrong costs a list re-filter, getting a channel wrong costs a connection
 * on a one-connection line. Under about 700ms a second deliberate press
 * still lands inside the window and the two merge into one tune, which is
 * the wrong result for someone stepping channels one at a time.
 */
/**
 * How long to wait between dropping a stream and opening the next one.
 *
 * On a line that allows a single connection the panel frees the slot when
 * the socket closes, and the close happens on ExoPlayer's thread after
 * `replaceAsync(null)` has already resolved. Without this beat the next
 * request overlapped the dying one and came back `403`.
 *
 * Short enough to be invisible next to the zap wait below, long enough that
 * a local socket teardown has finished. If 403s ever reappear on switching,
 * this is the number to raise first.
 */
/**
 * How long the expand button holds the landscape lock before handing
 * control back to the sensor. Long enough for a deliberate turn of the
 * wrist, short enough that a viewer who did not turn the phone is not left
 * wondering why it will not rotate.
 */
const ORIENTATION_RELEASE_MS = 1500;

const SOURCE_RELEASE_MS = 250;

/**
 * ## Why this is a fixed wait and not a measured one
 *
 * Investigated 2026-09-16, three angles in parallel. Two ideas that look
 * obvious are both dead ends, recorded here so they are not rebuilt:
 *
 * **Polling `active_cons` to ask the panel when the slot is free.** The
 * field exists (`xtreamAdapter.ts`) but is read once at login and is
 * display-only. Refreshing it means a `player_api.php` call per switch, and
 * `core/network/requestQueue.ts` carries the measurement that rules it out:
 * nine sequential requests all returned 200, and the same nine a minute
 * later returned 404 for every one, login included. One extra call per zap
 * is several times that budget. The queue also allows one request at a time
 * with a 250ms floor and 5/15/30/60s cooldowns, so a poll can wait longer
 * than the delay it was meant to replace — and if the panel counts API
 * calls against the connection allowance, it consumes the slot it is asking
 * about.
 *
 * **Waiting for a real close signal.** This one is sound but not reachable
 * from JS today: Media3 exposes it (`TransferListener.onTransferEnd`,
 * `AnalyticsListener.onLoadCanceled`) and expo-video never forwards it.
 * Getting at it means extending `patches/expo-video+57.0.3.patch`. Worth
 * doing if a single-connection line ever needs it; not worth doing while
 * the wait it would replace is already zero on any line with room for two.
 *
 * A cheaper approximation — awaiting `statusChange` → `"idle"` after
 * `replaceAsync(null)` — has a trap: expo-video only emits when the status
 * actually *changes*, so a player that is already idle never fires and a
 * naive await hangs for ever. It would need the status checked first and a
 * fallback timeout kept anyway.
 *
 * Whether the panel frees the slot promptly on socket close is still
 * unmeasured, and the operator raising their own line to three connections
 * made the question moot for them.
 *
 * Whether a channel switch has to wait for the old stream to let go.
 *
 * Only a line limited to a single connection does. With two or more, the
 * new request and the dying one can overlap in different slots, so the wait
 * is pure latency on every channel change and the release ordering below
 * becomes hygiene rather than a requirement.
 *
 * Read from what the panel reports (`max_connections` via
 * `xtreamAdapter.authenticate`), never assumed: the operator raised their
 * own line from one to three on 2026-09-16, and a number written in here
 * would have kept charging them for a constraint they had just paid to
 * remove. A panel that reports nothing is treated as the strict case —
 * being slow is recoverable, being refused is not.
 */
function needsReleaseWait(maxConnections: number | null | undefined): boolean {
  return (maxConnections ?? 1) <= 1;
}

/**
 * How long D-pad and button zapping waits, after the last press, before it
 * tunes.
 *
 * Was 900ms, which was set when every press opened a stream immediately and
 * a burst of them got the account rate-limited. Now that a switch releases
 * before it opens (see `attemptCommit`), the 900 was mostly just latency: a
 * single deliberate press waited almost a second for a second press that
 * was never coming. 400ms still coalesces a fast double-tap into one tune —
 * which is what protects the connection limit — and takes half a second off
 * every ordinary channel change.
 */
const ZAP_COMMIT_MS = 400;

/**
 * The zap wait on a line with room for more than one connection.
 *
 * Still not zero: the panel rate-limits bursts of *requests* whatever the
 * connection allowance is (docs/DECISIONS.md), so holding a run of presses
 * together is worth something. But the thing the longer wait was protecting
 * — a single slot being fought over — is gone, so it drops to the shortest
 * window that still merges a double-tap.
 */
/**
 * How long after a zap a further press still counts as part of the same run.
 *
 * Inside a run the tune is deferred; the first press of a run is not
 * deferred at all. So a single deliberate press changes channel with no
 * added wait, and mashing the button still opens one stream instead of one
 * per press.
 *
 * This is the only reason a wait survives the line going from one
 * connection to three: the panel rate-limits bursts of *requests*
 * regardless of the connection allowance (docs/DECISIONS.md). Nothing here
 * is protecting a contended slot any more.
 */
const ZAP_RUN_WINDOW_MS = 700;

/** How long a run must be quiet before its final target is tuned. */
const ZAP_RUN_SETTLE_MS = 450;

/**
 * How long after the last digit a typed channel number tunes itself.
 *
 * Long enough to reach for a second digit, short enough that a single-digit
 * channel does not feel stuck. Restarted by each digit, so the wait is
 * always measured from the last one.
 */
const NUMBER_COMMIT_MS = 1600;

/**
 * Aspect-ratio cycle. IPTV lineups mix 16:9, 4:3 and pillarboxed SD feeds
 * on the same provider, so a fit toggle is a staple of every IPTV player.
 * `contain` is the safe default (never crops), `cover` fills a 16:9 screen
 * with a 4:3 source, `fill` stretches without preserving the aspect ratio
 * for viewers who prefer that on SD channels.
 */
const FIT_MODES: VideoContentFit[] = ["contain", "cover", "fill"];
const FIT_LABEL_KEYS = {
  contain: "aspectFit",
  cover: "aspectFill",
  fill: "aspectStretch",
} as const;

export default function LivePlayerScreen() {
  const { t } = useI18n();
  useKeepAwake();

  const { channelId, categoryId } = useLocalSearchParams<{ channelId: string; categoryId?: string }>();
  const session = getActiveSession();

  const [listCategoryId, setListCategoryId] = useState<string>(categoryId ?? "all");
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  /**
   * The channels both layouts browse. Filtered by `listCategoryId` — the
   * category strip's own state, seeded from the route — rather than by the
   * route parameter, so the split list, the fullscreen previous/next
   * buttons and channel-number entry always walk the same set. They did
   * not before: switching category in the split view then expanding left
   * previous/next stepping through the category the screen was *opened*
   * with.
   */
  const channels = useMemo(() => {
    if (!session) return [];
    if (listCategoryId === "all") return session.channels;
    return session.channels.filter((c) => c.categoryId === listCategoryId);
  }, [session, listCategoryId]);

  const player = useLivePlayer(() => {
    PlayerLifecycleMonitor.playerConstructed();
  });

  const backgroundPlaybackEnabled = useBackgroundPlayback(player);

  const [status, setStatus] = useState<"idle" | "loading" | "readyToPlay" | "error">("idle");
  /**
   * The translation key for why playback stopped, or null while it has not.
   *
   * A key rather than a finished sentence, and a *reason* rather than the
   * provider's own words: the raw string was English, carried an HTTP code
   * and a credentialed URL, and told the viewer nothing they could act on.
   * See core/errors/playbackReason.ts.
   */
  const [errorReasonKey, setErrorReasonKey] = useState<string | null>(null);
  /**
   * True while a retry is armed and counting down.
   *
   * The message alone made a busy connection look like a dead end: it
   * appeared and then nothing on screen changed, so there was no way to
   * tell the player was still working from the player having given up
   * ("the message hangs and nothing changes", 2026-09-16). The spinner
   * beside it is the difference between waiting and stuck.
   */
  const [retryPending, setRetryPending] = useState(false);
  const [currentChannel, setCurrentChannel] = useState<LiveChannel | null>(
    () => channels.find((c) => c.providerItemId === channelId) ?? channels[0] ?? null
  );
  /*
    The split list's place in each category, kept here rather than in the
    list: turning the phone unmounts `SplitChannelView`, so a memory held
    inside it would be thrown away by the very thing it exists to survive.

    A category never opened before falls back to the channel that is
    playing — where someone opening the player expects to be looking. Only
    that first time: after it, wherever they scrolled to is theirs.
  */
  const splitListDefaultOffset = useCallback(() => {
    const index = channels.findIndex((channel) => channel.providerItemId === currentChannel?.providerItemId);
    return index < 0 ? 0 : index * (CHANNEL_ROW_HEIGHT + CHANNEL_ROW_SPACING);
  }, [channels, currentChannel]);
  const { listRef: splitListRef, scrollProps: splitScrollProps } = useCategoryScroll<LiveChannel>(
    listCategoryId,
    splitListDefaultOffset
  );
  const [guideVisible, setGuideVisible] = useState(false);
  const [tracksVisible, setTracksVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fitIndex, setFitIndex] = useState(0);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [numberEntry, setNumberEntry] = useState<string | null>(null);
  /** Counts down to tuning whatever digits have been typed. */
  const numberCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
    `submitChannelNumber` is declared far below this point and closes over
    state that changes, so the timer above calls it through a ref that the
    effect below keeps current — a timer holding the first render's closure
    would tune using the digits as they were when it was armed.
  */
  const submitChannelNumberRef = useRef<() => void>(() => {});
  /**
   * `null` until the stored preference loads, so the screen never flashes
   * the wrong layout before settling into it.
   */
  /**
   * The viewer's saved split-layout preference, as distinct from the layout
   * showing right now.
   *
   * The orientation lock follows this, and never the layout on screen —
   * which is the bug this separation fixes. Tapping expand used to set the
   * layout flag to false, which made `useFullscreenOrientation` lock the
   * phone to landscape, and a locked phone cannot be rotated back — so the
   * channel list became
   * unreachable by turning the device, reported 2026-09-16 as "عند ترجيع
   * الموبايل للوضع الرأسي ... لا يرجع لقائمة القنوات".
   *
   * Landscape is therefore locked only for someone who has turned the split
   * layout off in Settings and wants a fullscreen player always. Everyone
   * else keeps a free-rotating phone, and rotation is the way in and out of
   * the list.
   */
  const [splitPreference, setSplitPreference] = useState<boolean | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  useFullscreenOrientation(splitPreference === false);

  const { muted, toggleMute, unmute } = usePlayerMute(player);
  /*
    `unmute` is handed over so a volume swipe clears mute through the hook
    that owns that state, rather than the gesture writing the native
    property behind its back.
  */
  const gestures = usePlayerGestures(player, true, unmute);
  const isOffline = useIsOffline();

  const [preferredTracks, setPreferredTracks] = useState<{ audio: string | null; subtitle: string | null }>({
    audio: null,
    subtitle: null,
  });
  useEffect(() => {
    getAppState().then((state) => {
      setPreferredTracks({ audio: state.preferredAudioLang, subtitle: state.preferredSubtitleLang });
      // The aspect choice is a per-viewer preference about their own TV, not
      // a per-session one — resetting it to "fit" on every channel was a
      // small but constant annoyance on a lineup full of 4:3 SD feeds.
      const stored = FIT_MODES.indexOf(state.playerFitMode as (typeof FIT_MODES)[number]);
      if (stored >= 0) setFitIndex(stored);
      setSplitPreference(state.splitChannelView);
    });
  }, []);

  /**
   * Which layout is on screen — derived, never stored.
   *
   * The orientation is the single source of truth: upright with the
   * preference on means the channel list sits under the picture, and
   * turning the phone is how you leave that and come back to it. This used
   * to be state that the expand button flipped, and the flip was a trap —
   * it locked the phone to landscape (see `splitPreference`), so the list
   * could not be reached by rotating for the rest of the session.
   *
   * Derived rather than synchronised in an effect on purpose: an effect
   * that calls `setState` on every rotation is a cascading render, and the
   * project's lint rules reject it. There is nothing to synchronise — the
   * layout *is* a function of the orientation and the preference.
   */
  const showSplit = splitPreference === true && !isLandscape;

  /**
   * Only the split layout shows a category strip, so this is fetched lazily
   * once that layout is actually in use — and it comes from the on-device
   * catalog, so it costs no provider request.
   *
   * **Only categories that actually hold channels**, the same rule the browse
   * screen applies to the same list. A provider category with nothing in the
   * on-device catalogue used to be reachable here and nowhere else, and
   * choosing it emptied `channels`, which trips the "no channels" return far
   * below — *above* the split layout, so the video surface, the strip and the
   * drag area all vanished together and left a Back button with the audio
   * still playing. A tap could only reach such a chip if it happened to be on
   * screen; a sideways drag steps through every one of them in turn, which is
   * how it was found (review, 2026-10-07).
   */
  useEffect(() => {
    if (!showSplit || !session) return;
    let cancelled = false;
    loadLiveCategories(session.provider.id, session.config).then(
      (rows) => {
        if (!cancelled) {
          const present = new Set(session.channels.map((channel) => channel.categoryId));
          const stocked = rows.filter((row) => present.has(row.id));
          setCategories([{ id: "all", name: t("liveCategories", "allCategory") }, ...stocked]);
        }
      },
      () => {
        // A missing category strip is not worth an error over a playing video.
      }
    );
    return () => {
      cancelled = true;
    };
  }, [showSplit, session, t]);

  /**
   * `sourceKey` is the currently playing channel: this screen reuses one
   * `VideoPlayer` across every zap, so without it the track picker would
   * keep offering the previous channel's audio/subtitle tracks after a
   * switch.
   */
  const tracks = usePlaybackTracks(
    player,
    preferredTracks.audio,
    preferredTracks.subtitle,
    currentChannel?.providerItemId ?? "none"
  );

  /**
   * Modern player controls auto-hide during playback (transport row, EPG
   * bar, action chips) rather than sitting on screen permanently — tap the
   * video to bring them back. Always shown while loading or on an error,
   * since those are not "controls" the user is done looking at.
   */
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The channel the D-pad has stepped to but not yet tuned — see
   * `selectByOffset`. Null whenever the picture and the position agree,
   * which is every moment except the second or so after a press.
   */
  /**
   * Clearance for the system navigation bar, applied to the controls and not
   * to the video.
   *
   * The player screens exclude the bottom safe-area edge so the picture runs
   * to the edge of the screen — but with `edgeToEdgeEnabled` and nothing
   * hiding the system bars, that exclusion also let the controls run
   * underneath the navigation bar. On three-button navigation that bar is
   * 48dp: measured on the test phone (density 440) it covers 132 physical
   * pixels, which is the whole action-chip row in the live player and about
   * four fifths of the VOD seek bar — including the draggable thumb, so
   * scrubbing became impossible rather than merely ugly. Gesture navigation
   * insets ~24dp and hid the same bug behind half the damage, which is why it
   * went unnoticed: the test phone is set to gestures.
   *
   * Padding the controls layer alone is what keeps both properties at once —
   * video edge to edge, controls above the bar. Putting the edge back on
   * `SafeAreaView` would have inset the whole subtree and left a permanent
   * black band under the picture; hiding the system bars outright is the
   * nicer answer still, and this stays correct underneath it if that is ever
   * done (the inset is simply 0 when there is no bar).
   */
  const insets = useSafeAreaInsets();
  /**
   * What the control layers add so they clear the system bars — plus a
   * comfortable margin from the screen's own edge.
   *
   * `EDGE` is added rather than left to each layer's own
   * `paddingHorizontal`, because this object is spread *after* the layer's
   * style and `paddingStart`/`paddingEnd` beat `paddingHorizontal`. With
   * both system bars hidden the insets are zero, so the first version of
   * this silently cancelled the padding the layers already had and parked
   * the buttons on the physical edge of the glass — reported 2026-09-16 as
   * the guide button being impossible to press without catching the edge.
   *
   * All four sides, not just the bottom: the navigation bar is at the
   * bottom in portrait and down one side in landscape — and the player is
   * landscape — so a bottom-only inset was the one that did nothing here.
   */
  /**
   * Padding for one control layer: its own vertical padding plus the system
   * insets, and a fixed margin from the sides plus the same.
   *
   * A function rather than one shared object because the vertical amount
   * differs per layer, and the flat version cancelled it: `paddingTop` beats
   * the `paddingVertical` shorthand in Yoga whatever the order in the style
   * array, so with the bars hidden (insets 0) every layer silently lost the
   * padding it had declared.
   *
   * Physical `paddingLeft`/`paddingRight`, not `paddingStart`/`paddingEnd`:
   * `insets.left`/`right` are physical edges, and this app runs RTL, where
   * start and end are swapped. Pairing a logical property with a physical
   * measurement puts a display cutout's inset on the wrong side.
   */
  const layerPadding = (vertical: number) => ({
    paddingTop: vertical + insets.top,
    paddingBottom: vertical + insets.bottom,
    paddingLeft: CONTROL_EDGE + insets.left,
    paddingRight: CONTROL_EDGE + insets.right,
  });

  const [pendingZapIndex, setPendingZapIndex] = useState<number | null>(null);
  const zapCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When the last zap press happened, for the run test. */
  const lastZapAtMsRef = useRef(0);
  /**
   * The channel index the last zap aimed at, whether or not React has
   * re-rendered yet. Cleared by any selection that did not come from
   * zapping, so the next press steps from wherever the viewer actually is.
   */
  const zapTargetRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (zapCommitTimerRef.current) clearTimeout(zapCommitTimerRef.current);
      if (numberCommitTimerRef.current) clearTimeout(numberCommitTimerRef.current);
    };
  }, []);

  /*
    Back closes the number box first, and only leaves the player when there
    is no box.

    `KEYCODE_BACK` never reaches `useTVRemote` — it is absent from React
    Native's hardware-key map by design and goes to Android's own back
    navigation, which expo-router turns into "leave this screen". So a
    viewer who opened the box and changed their mind was thrown out of the
    player entirely. `BackHandler` is the only place to intercept it.

    Registered only while the box is open, and only on the television build:
    on a phone the box is dismissed by tapping elsewhere, and adding a back
    handler there would change how the player exits.

    **Placed here, above every early return.** It was first written down
    beside the number box it serves, which read better and was wrong: this
    component returns early for a missing session and for an empty lineup
    (`:1220`, `:1224`), so a hook below those runs on some renders and not
    others — `react-hooks/rules-of-hooks` caught it before it could become
    a "rendered fewer hooks than expected" crash on a provider with no
    channels.
  */
  useEffect(() => {
    if (!isTvBuild || numberEntry === null) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (numberCommitTimerRef.current) {
        clearTimeout(numberCommitTimerRef.current);
        numberCommitTimerRef.current = null;
      }
      setNumberEntry(null);
      return true;
    });
    return () => subscription.remove();
  }, [numberEntry]);

  /* The commit timer calls the newest closure — see the ref's own note. */
  useEffect(() => {
    submitChannelNumberRef.current = submitChannelNumber;
  });

  /**
   * Whether the D-pad currently means "change channel".
   *
   * It means that **only** when there is nothing else on screen for the
   * arrows to move through. The guard used to be `!controlsVisible` alone,
   * and the two things it forgot were the guide and the track sheet.
   *
   * What that cost, traced through React Native's own source: a `Modal` is
   * a separate dialog window, and `ReactModalHostView` forwards every key
   * it receives into the same global hardware-key stream that
   * `useTVRemote` listens to. So with the guide open, one press of Down
   * moved the highlight in the guide *and* tuned the next channel behind
   * it — opening a stream per press, on a panel that bans bursts of
   * requests. And because the guide's `tvFocusFirst` follows the playing
   * channel, the highlight was then dragged to the row that had just been
   * tuned, so the list moved under the viewer's hand.
   *
   * The number box is in the test for the same reason: while it is open the
   * digits belong to it.
   */
  const dpadChangesChannel =
    !controlsVisible && !guideVisible && !tracksVisible && numberEntry === null;

  /**
   * The same question as above, readable from a timer.
   *
   * The auto-hide fires four seconds after the render that armed it, so it
   * cannot read `guideVisible` from that render's closure and be right.
   * Written in a bare effect, the pattern this file already uses for
   * `submitChannelNumberRef`.
   */
  const sheetOpenRef = useRef(false);
  useEffect(() => {
    sheetOpenRef.current = guideVisible || tracksVisible || numberEntry !== null;
  });

  function showControlsTemporarily() {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      /*
        Nothing is hidden while a sheet is open over the player.

        The timer used to fire regardless, which had two consequences on a
        remote. The controls vanished under an open guide — handing the
        D-pad back to channel-changing while the viewer was plainly still
        browsing — and a half-typed channel number was wiped mid-entry,
        sometimes within a fraction of a second of the box appearing,
        because the four seconds had started when the controls last did.
      */
      if (sheetOpenRef.current) {
        /*
          Come back later on a television — and, on a phone, do exactly
          what this has always done and stop.

          The phone behaviour is deliberate and unchanged: its live-TV code
          is closed ("كود الموبايل انتها بشكل كامل", 2026-09-18), and there
          the stall below costs nothing, because a phone reveals these
          controls with a tap on the picture whenever it wants them and has
          no arrow keys to lose.

          Returning here left the controls on screen with no timer behind
          them, permanently. On a television that killed the viewer's whole
          remote: picking a channel from the side list calls this function,
          the timer then fired while the list was still open and gave up,
          and once the list was closed `controlsVisible` stayed true for
          good — so Up and Down belonged to the buttons' focus system from
          then on and no arrow ever changed channel again. Re-arming makes
          it self-healing: the controls go four seconds after the last
          sheet closes, whenever that is.
        */
        if (isTvBuild) showControlsTemporarily();
        return;
      }
      setControlsVisible(false);
      setNumberEntry(null);
    }, 4000);
  }

  function toggleControls() {
    if (guideVisible) return;
    if (controlsVisible) {
      setControlsVisible(false);
      // The box is hidden with the controls, so its digits go too —
      // otherwise the next reveal brings back a half-typed number and the
      // the hash button is a press out of phase.
      setNumberEntry(null);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      showControlsTemporarily();
    }
  }

  useEffect(() => {
    // `controlsVisible` already starts `true` (its initial state above), so
    // this only needs to arm the auto-hide timer — not call setState again
    // synchronously in the effect body (this project's
    // `react-hooks/set-state-in-effect` rule flags that).
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 4000);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      if (retryTimeoutRef.current !== null) clearTimeout(retryTimeoutRef.current);
      /*
        The controller owns a debounce timer of its own, and `dispose` had
        no caller anywhere. A selection made within its window of leaving
        the screen fired `replaceAsync` on a released player — a rejected
        promise that was swallowed, so harmless in effect, but it was also
        one more stream opened for a screen nobody is looking at.
      */
      controller.dispose();
    };
    // `controller` is created once by useState and never replaced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Bounded live retry policy (master prompt §25): a fresh channel
   * selection always resets the counter; a retry of that same failed
   * attempt does not, so at most MAX_LIVE_RETRIES automatic retries ever
   * happen per selection, never an infinite spinner. `isStale()` (from the
   * switch controller's generation token) is re-checked before every retry
   * and every commit, so a newer channel selection always wins and this
   * retry path never clobbers it. `unmountedRef` additionally guards
   * against a pending retry firing after the screen (and its native player)
   * has already been torn down.
   */
  const MAX_LIVE_RETRIES = 2;
  const RETRY_DELAY_MS = 1000;
  /**
   * The wait before retrying a stream that came back 401/403.
   *
   * Longer than `RETRY_DELAY_MS` because the thing being waited for is
   * different: not a server that might answer differently, but a connection
   * slot that frees when whatever holds it finishes letting go.
   */
  const BUSY_RETRY_DELAY_MS = 2500;
  /**
   * How many times to keep asking while the connection is busy.
   *
   * Far more generous than `MAX_LIVE_RETRIES` because the two failures are
   * not alike. A wrong URL shape will be wrong again for ever, so two
   * attempts settle it. A busy slot resolves *by itself* the moment
   * whatever holds it lets go — usually this app's own previous channel —
   * so the right response is to keep waiting, which is what a viewer
   * expects of a television.
   *
   * Six attempts at 2.5s is about fifteen seconds of patience. Past that
   * the cause is no longer "still letting go" and the message should stand
   * still rather than retry for ever against a line that rate-limits.
   */
  const MAX_BUSY_RETRIES = 6;
  /**
   * How long a channel must play without failing before its retry budget is
   * handed back.
   *
   * Comfortably longer than one retry cycle — this delay plus ExoPlayer's own
   * load retry — so a channel that reconnects and drops straight back cannot
   * refill the budget it just spent. That refill was what made the budget
   * unbounded for a flapping edge: every successful reconnection returned the
   * two retries the previous failure had used, one stream open per cycle,
   * for ever.
   */
  const STABLE_PLAYBACK_MS = 30_000;

  /**
   * Which entry of the current channel's `streamUrlCandidates` is playing.
   * Xtream panels disagree about which URL shape they serve (see
   * `buildLiveStreamCandidates`), and the wrong guess is a hard 404 on
   * every channel — so a source failure walks to the next shape *before*
   * spending any of the retry budget below, which is meant for genuinely
   * transient failures.
   */
  const candidateIndexRef = useRef(0);
  const activeCommitRef = useRef<{ target: ChannelSwitchTarget; isStale: () => boolean } | null>(null);
  /**
   * The candidate index that actually played.
   *
   * Without this, a stream that drops *after* playing fine was treated as
   * an opening failure: the error walked to the next URL shape, then the
   * next, then retried the last and worst one twice — six failed opens on
   * a line that allows exactly one connection, while the shape that had
   * been working for the past hour was never tried again.
   */
  const workingCandidateIndexRef = useRef(0);
  /** Read by the background listener, which subscribes once and must not go stale. */
  const currentChannelRef = useRef<LiveChannel | null>(null);

  /** Starts the next URL shape for the same channel. Returns false once they are exhausted. */
  function advanceCandidate(target: ChannelSwitchTarget, isStale: () => boolean): boolean {
    if (candidateIndexRef.current >= target.streamUrlCandidates.length - 1) return false;
    candidateIndexRef.current += 1;
    attemptCommit(target, isStale);
    return true;
  }

  function attemptCommit(target: ChannelSwitchTarget, isStale: () => boolean) {
    /*
      Checked first, before touching the player at all: without a network
      the whole candidate chain (.ts, then .m3u8, then the extension-less
      shapes) and the retry budget on top of it would still all fail, just
      slowly — several doomed attempts before the viewer finally sees an
      error. `useNetworkReconnect` below already re-selects the current
      channel the moment connectivity returns, so this recovers on its own.
    */
    if (isOffline) {
      setErrorReasonKey("playbackSlow");
      return;
    }
    const uri = target.streamUrlCandidates[candidateIndexRef.current] ?? target.streamUrlCandidates[0];
    PlayerLifecycleMonitor.sourceReplaceRequested();
    setErrorReasonKey(null);
    setRetryPending(false);

    /*
      The old stream is closed **before** the new one is asked for, and this
      is the whole reason channel switching was slow.

      This line replaced a bare `replaceAsync(newUri)`. A `.ts` stream is a
      single long-lived HTTP response, and handing the player a new source
      does not close the old socket before the new request goes out — so the
      panel saw two connections on a line that allows one and answered the
      new one with `403`. Every candidate shape then failed the same way,
      and the viewer waited through the whole walk to be told the broadcast
      was paused. Observed on the device 2026-09-16: "Source error /
      Response code: 403" after six quick zaps.

      `SOURCE_RELEASE_MS` is the pause between letting go and reaching for
      the next one. `releaseLiveSource` resolving means the command was
      accepted, not that the socket is shut — the close happens on
      ExoPlayer's own thread — so a beat is needed before the panel will
      count the slot as free.

      The episode player already did exactly this when moving to the next
      episode, with a comment saying why; live zapping simply never got the
      same treatment.
    */
    /*
      ## Why releasing first is now conditional, and why that matters for audio

      Stopping the player before opening the next channel costs far more
      than the wait it was measured for, and the cost is audible.

      Traced on the device 2026-09-16. Every `replaceAsync(null)` stops
      playback, which expo-video reports as `onIsPlayingChanged(false)`,
      and its `AudioFocusManager` answers that by abandoning audio focus
      (`AudioFocusManager.kt:113-120`). The new source then requests it
      back. `dumpsys audio` shows the pairs, one per zap:

          14:14:14 abandonAudioFocus() … expo.modules.video.managers.AudioFocusManager
          14:14:20 requestAudioFocus()  … AA=USAGE_MEDIA/CONTENT_TYPE_MOVIE
          14:14:23 abandonAudioFocus()
          14:14:26 requestAudioFocus()

      Each focus transition can duck, and a duck is
      `player.volume /= 2f` (`AudioFocusManager.kt:202-208`). That write
      is itself a volume change, and the same manager treats a volume
      change as a reason to re-evaluate focus
      (`AudioFocusManager.kt:123-125`: `onVolumeChanged` →
      `updateAudioFocus()`), while the player mirrors any external volume
      change back into its own property (`VideoPlayer.kt:328-332`). The
      three together close a loop inside the library.

      What that loop sounds like, measured: `AudioTrack.setVolume` called
      **5,000 to 6,350 times per second**, sustained for minutes, walking
      an 18-step ladder from 0dB down to −11.2dB. Against 1 call in the 5
      clean seconds before it began. That is the crackling — the viewer's
      "التقطيش" — and it correlated perfectly: present while the storm ran,
      gone the moment it stopped. It also explains why the first half
      minute is always clean and it worsens with zapping: the damage
      accumulates one channel change at a time.

      So the stop happens only where it buys something. On a line limited
      to a single connection it is still required — the panel counts the
      old socket and answers the new request with 403 (the comment below
      this one records that investigation) — and there, a moment of rough
      audio is the better trade against a channel that will not open at
      all. On a line with room, the new source simply replaces the old one
      and playback never stops, so focus is never dropped and the loop is
      never woken.
    */
    /*
      On the libVLC engine this condition cannot be honoured, and saying so
      is cheaper than pretending: `setSource` there always releases the old
      player before building the new one
      (`@lunarr/vlc-player/ios/VLCPlayerView.swift:159-165`), so the release
      happens whether this line asks for it or not. Nothing is lost by it —
      the cost the condition exists to avoid is expo-video's
      `AudioFocusManager` loop, measured above, which is not on that path.

      Read the asymmetry the right way round, because the obvious reading is
      backwards. On a line with room, `releaseFirst` is false, so neither the
      release nor the `SOURCE_RELEASE_MS` beat below is in play at all: there
      Android replaces the source without stopping, while iOS still tears the
      `VLCMediaPlayer` down first, and the black gap is the whole iOS-only
      cost. The beat applies only in the other branch, where iOS pays it on
      top of a release it would have performed anyway.
    */
    const releaseFirst = needsReleaseWait(session?.accountInfo?.maxConnections);

    const opened = releaseFirst
      ? releaseLiveSource(player)
          .then(
            () =>
              new Promise((resolve) => {
                setTimeout(resolve, SOURCE_RELEASE_MS);
              })
          )
          .then(() => {
            if (isStale() || unmountedRef.current) return null;
            return player.replaceAsync({ uri, headers: { ...PROVIDER_REQUEST_HEADERS } });
          })
      : player.replaceAsync({ uri, headers: { ...PROVIDER_REQUEST_HEADERS } });

    opened.then(
      () => {
        if (isStale() || unmountedRef.current) return;
        PlayerLifecycleMonitor.sourceReplaceCommitted(target.id);
        player.play();
        setLastChannelId(target.id).catch(() => {});
      },
      (error) => {
        if (isStale() || unmountedRef.current) return;

        /*
          A 403 is not a wrong URL shape, and walking the candidate list is
          the wrong answer to it.

          The list exists because panels disagree about how they serve a
          live channel — `.m3u8`, `.ts`, with or without the `/live/`
          segment — and a 404 on one shape is the signal to try the next.
          A 401/403 says something completely different: the credentials are
          fine (the catalogue loaded with them) and the single allowed
          connection is busy. Every other shape will answer 403 as well.

          Walking anyway is what turned a busy slot into a 23-second wait.
          Measured on the device 2026-09-16: 403, 403, error, 404, 403 over
          ten seconds before the message, because ExoPlayer retries each
          shape internally (~4.4s apiece) before handing the failure up. The
          eight switches after it, where the slot was free, each opened
          first time with no error at all.

          So on an authorization failure the shape is kept and the *timing*
          is retried instead — the connection may free up a moment later —
          and when the budget runs out the viewer is told the account is in
          use somewhere else, which is the one cause they can act on.
        */
        /*
          `toEnginePlaybackError`, not `toPlaybackError`: on the libVLC
          engine the failure arrives with its category already decided,
          because libVLC's error event carries no message for
          `toPlaybackError` to match against. On Android nothing sets that
          field and this is `toPlaybackError` exactly. See
          `src/playback/engine/enginePlaybackError.ts`.

          Dead on the libVLC path either way — that engine's `replaceAsync`
          never rejects, deliberately, so that one failure cannot both land
          here and arrive on `statusChange` and spend the retry budget twice.
        */
        const failure = toEnginePlaybackError(error);
        const shapeIsWrong = failure.category !== "http_unauthorized";

        if (shapeIsWrong && advanceCandidate(target, isStale)) return;
        const budget = shapeIsWrong ? MAX_LIVE_RETRIES : MAX_BUSY_RETRIES;
        if (retryCountRef.current < budget) {
          retryCountRef.current += 1;
          /*
            The reason is shown *during* the wait, not only after the budget
            runs out — so the viewer is told why the picture has not come up
            yet, and the spinner says the player is still on it.
          */
          setErrorReasonKey(playbackReasonKey(failure.category));
          setRetryPending(true);
          /*
            A busy connection is worth waiting longer for than a bad URL:
            the slot frees when whatever holds it lets go, and a second is
            not enough for that. A wrong shape, by contrast, will be wrong
            again in three seconds, so it keeps the short delay.
          */
          const delay = shapeIsWrong ? RETRY_DELAY_MS : BUSY_RETRY_DELAY_MS;
          // Clear first: the ref holds one timer, so overwriting it without
          // clearing leaves the old one running and two retry chains then
          // open two streams on a line that is already refusing one.
          if (retryTimeoutRef.current !== null) clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = setTimeout(() => {
            retryTimeoutRef.current = null;
            if (!isStale() && !unmountedRef.current) attemptCommit(target, isStale);
          }, delay);
          return;
        }
        setRetryPending(false);
        PlayerLifecycleMonitor.errorOccurred(failure.message);
        setErrorReasonKey(playbackReasonKey(failure.category));
      }
    );
  }


  /**
   * Separate from `retryCountRef` (which only covers the initial commit's
   * own `replaceAsync` rejection): this bounds retries for a stream that
   * drops mid-playback *after* a successful commit — a very common real
   * IPTV scenario, and one the original implementation didn't retry at
   * all, just froze on an error message. Reset only on a genuinely new
   * channel selection, so a channel that keeps failing can't retry forever.
   */
  const midPlaybackRetryCountRef = useRef(0);
  /** When the last playback error happened, for the stable-playback test. */
  const lastErrorAtMsRef = useRef(0);

  function commitChannel(target: ChannelSwitchTarget, isStale: () => boolean) {
    /*
      A retry armed for the *previous* channel would otherwise fire against
      the new one.

      The mid-playback retry reads `currentChannel` when the failure lands,
      and `setCurrentChannel` runs immediately while the commit is debounced
      180ms — so a drop that failed inside that window armed a 1000ms timer
      holding the newly picked channel's URI and a generation token that was
      no longer stale. The controller then opened it, and a second later the
      timer opened it again: two streams for one channel on a line that
      allows one. A new selection supersedes any retry, always.
    */
    if (retryTimeoutRef.current !== null) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    retryCountRef.current = 0;
    midPlaybackRetryCountRef.current = 0;
    candidateIndexRef.current = 0;
    workingCandidateIndexRef.current = 0;
    activeCommitRef.current = { target, isStale };
    attemptCommit(target, isStale);
  }

  /*
    `commitChannel` is redefined every render and closes over `isOffline`.
    The controller, however, is constructed once — so the callback handed to
    it captured the *first* render's closure, where `isOffline` is always
    false (expo-network's state starts as `{}`). The "fail fast when there
    is no network" branch in `attemptCommit` therefore never ran for a
    channel selection; only the retry path, reached from the fresh
    `statusChange` listener, ever saw the real value. Reading through a ref
    that every render refreshes fixes it without rebuilding the controller.
  */
  const commitChannelRef = useRef(commitChannel);
  useEffect(() => {
    commitChannelRef.current = commitChannel;
  });

  const [controller] = useState(
    () =>
      new ChannelSwitchController((target, _generation, isStale) =>
        commitChannelRef.current(target, isStale)
      )
  );

  useEventListener(player, "statusChange", ({ status: newStatus, error }) => {
    setStatus(newStatus);
    PlayerLifecycleMonitor.bufferingChanged(newStatus === "loading");

    /*
      The channel is open. Closing the commit here is what separates "this
      URL shape did not work" from "the stream dropped": after this point an
      error must retry the shape that played, not hunt for a different one.
      The mid-playback budget resets too, so a channel watched for an hour
      gets a fresh set of retries rather than the remains of the ones spent
      opening it.
    */
    if (newStatus === "readyToPlay") {
      activeCommitRef.current = null;
      workingCandidateIndexRef.current = candidateIndexRef.current;

    }

    if (newStatus === "error" && error) {
      /*
        The one expression on this screen that had to change for the second
        engine, and the most consequential one in the file.

        Everything below branches on `playbackError.category`, and on Android
        that category comes out of ExoPlayer's message, which carries the HTTP
        status ("Source error / Response code: 403"). libVLC's error event
        carries no message and no code at all, so its engine decides the
        category from libVLC's own state machine and attaches it to the error
        — and this call prefers that answer when it is there.
        `src/playback/engine/enginePlaybackError.ts` explains why, and
        `OPAQUE_OPEN_FAILURE_CATEGORY` in the libVLC adapter states plainly
        what iOS has to assume and what that costs. On Android nothing sets
        the field and this is `toPlaybackError`, unchanged.
      */
      const playbackError = toEnginePlaybackError(error);
      PlayerLifecycleMonitor.errorOccurred(playbackError.message);

      /*
        The budget is refilled by *watching*, and the test has to happen
        here rather than on `readyToPlay`.

        expo-video only emits `statusChange` when the status actually
        changes, and after a drop the only `readyToPlay` is the retry's own
        — one to three seconds later, never 30. So checking stability there
        meant the budget was never handed back at all on a stream that does
        not rebuffer: two retries for the whole session, and a channel that
        dropped once an hour showed the "paused" card on its third drop.

        Measured from the previous failure instead: 30 seconds of playing
        without one is what earns a fresh set, and a channel flapping every
        few seconds still runs out and stops re-opening.
      */
      const errorAtMs = Date.now();
      if (lastErrorAtMsRef.current !== 0 && errorAtMs - lastErrorAtMsRef.current >= STABLE_PLAYBACK_MS) {
        midPlaybackRetryCountRef.current = 0;
      }
      lastErrorAtMsRef.current = errorAtMs;

      /*
        `replaceAsync` resolves as soon as the native player accepts the
        source, not when it actually plays (expo-video's VideoModule.kt
        kicks off prepare() and resolves immediately) — so a 404 on the
        chosen URL shape usually surfaces here rather than as a rejected
        promise. Walking to the next candidate has to happen on this path
        too, otherwise the first shape is the only one ever tried.
      */
      const activeCommit = activeCommitRef.current;
      if (activeCommit && !unmountedRef.current && !activeCommit.isStale()) {
        /*
          The 2026-09-16 rule has to be applied HERE, not only in the
          rejection arm of `attemptCommit`.

          Found 2026-11-14 by audit, and it is the same bug the comment at
          the top of `attemptCommit` says must never come back. Because
          `replaceAsync` resolves the moment the native player accepts the
          source, that rejection arm almost never runs on Android — so the
          `failure.category !== "http_unauthorized"` test that lives there
          was being skipped on the one path that actually fires, and this
          walk ran on every error, 403 included.

          The effect was exactly the measured one: a channel tuned while a
          connection slot is busy answers 403, and the player opens all four
          URL shapes against a panel that answers a burst of requests with
          empty 404s and then refuses everything for a while. The candidate
          list is the answer to a wrong URL shape. It is the wrong answer to
          a busy line, where every shape will answer 403 as well.

          So: keep the shape, retry the timing, bounded — and say why while
          the viewer waits.
        */
        if (playbackError.category === "http_unauthorized") {
          if (retryCountRef.current < MAX_BUSY_RETRIES) {
            retryCountRef.current += 1;
            setErrorReasonKey(playbackReasonKey(playbackError.category));
            setRetryPending(true);
            // Clear first: two chains running at once is two streams opened.
            if (retryTimeoutRef.current !== null) clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = setTimeout(() => {
              retryTimeoutRef.current = null;
              if (unmountedRef.current || activeCommit.isStale()) return;
              attemptCommit(activeCommit.target, activeCommit.isStale);
            }, BUSY_RETRY_DELAY_MS);
            return;
          }
          /*
            Out of budget. Tell the viewer the one cause they can act on —
            the account is in use somewhere else — and stop opening streams.
          */
          setRetryPending(false);
          setErrorReasonKey(playbackReasonKey(playbackError.category));
          return;
        }

        if (advanceCandidate(activeCommit.target, activeCommit.isStale)) return;
      }

      /*
        `activeCommitRef.current === null` is the "this channel actually
        played" test, and it is what keeps this block off the opening path.

        Without it, a channel that never opened fell through to here the
        moment the candidate walk ran out — and this block resets
        `candidateIndexRef` to the working index (0, since nothing ever
        played), so the next error let `advanceCandidate` above walk all
        four URL shapes again. Twice. One dead channel cost 4 + 1 + 3 + 1 +
        3 = twelve stream opens in a few seconds, on a line limited to a
        single connection whose edge answers 404 to bursts
        (docs/DECISIONS.md) — so the retries were a cause of failures, not a
        cure for them. Found 2026-09-16 and counted by hand against the
        code.

        The opening walk now ends where it should: four shapes tried, then
        the message. These retries are for a stream that was playing and
        dropped, which is the case the budget was written for.
      */
      if (
        activeCommitRef.current === null &&
        currentChannel &&
        !unmountedRef.current &&
        midPlaybackRetryCountRef.current < MAX_LIVE_RETRIES
      ) {
        midPlaybackRetryCountRef.current += 1;
        const generation = controller.currentGeneration();
        // The shape that played, not wherever the opening walk left the index.
        candidateIndexRef.current = workingCandidateIndexRef.current;
        const uri = currentChannel.streamUrlCandidates[workingCandidateIndexRef.current] ?? currentChannel.streamUrl;
        // Clear first, same reason as the opening path above.
        if (retryTimeoutRef.current !== null) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = setTimeout(() => {
          retryTimeoutRef.current = null;
          if (unmountedRef.current || controller.isStale(generation)) return;
          setErrorReasonKey(null);
          player.replaceAsync({ uri, headers: { ...PROVIDER_REQUEST_HEADERS } }).then(
            () => {
              if (!unmountedRef.current && !controller.isStale(generation)) player.play();
            },
            () => {
              // The next "statusChange" error event re-enters this same handler and counts toward the same budget.
            }
          );
        }, RETRY_DELAY_MS);
        return;
      }
      setErrorReasonKey(playbackReasonKey(playbackError.category));
    }
  });

  useEventListener(player, "playingChange", ({ isPlaying: playing }) => {
    setIsPlaying(playing);
  });

  /**
   * `revealControls` exists for the remote.
   *
   * This used to call `showControlsTemporarily()` unconditionally, which
   * broke D-pad zapping outright: Up/Down only change channel while the
   * controls are hidden (visible, they belong to the focus system), so the
   * first zap put the controls back on screen and every press for the next
   * four seconds moved the highlight between buttons instead of changing
   * channel. Zapping worked exactly once. Reported from the television on
   * 2026-09-10 as channel switching simply not working.
   *
   * Every other caller — the channel list, the guide, number entry, a
   * network reconnect — is a deliberate act with the controls already up,
   * and still wants them shown.
   */
  function selectChannel(channel: LiveChannel, revealControls = true) {
    /*
      Any deliberate choice cancels a zap that has not landed yet.

      Up/Down arms a 900ms timer before it tunes. Picking a channel from the
      guide inside that window used to tune the guide's channel first and
      then have the zap's target tune over it ~700ms later — two opens on a
      one-connection line, and the wrong channel left playing. The same held
      for the retry button and for the resume-from-background path.
    */
    if (zapCommitTimerRef.current) {
      clearTimeout(zapCommitTimerRef.current);
      zapCommitTimerRef.current = null;
    }
    setPendingZapIndex(null);
    /*
      Picking from the guide, a retry or a resume ends any zap run — the
      next press should step from the channel actually playing, not from
      wherever the arrows had got to before the viewer changed their mind.
      `selectByOffset` re-sets this immediately afterwards for its own
      commits.
    */
    zapTargetRef.current = null;

    setCurrentChannel(channel);
    currentChannelRef.current = channel;
    if (revealControls) showControlsTemporarily();
    PlayerLifecycleMonitor.channelSelected(channel.providerItemId);
    controller.select({ id: channel.providerItemId, streamUrlCandidates: channel.streamUrlCandidates });
  }

  useNetworkReconnect(() => {
    /*
      Not while the app is in the background.

      With background playback off, the source is dropped when the app
      backgrounds — but expo-video's pause-on-background acts on the
      lifecycle transition, which by then has passed. A Wi-Fi-to-cellular
      handover after that (a pocketed phone leaving the house) reached this
      callback, which re-opened the stream and called `play()`: audible
      audio from a backgrounded app, holding the account's one connection
      until the viewer came back. The AppState handler re-selects on resume
      anyway, so there is nothing to recover here.
    */
    if (AppState.currentState !== "active") return;
    if (currentChannel) selectChannel(currentChannel);
  });

  useEffect(() => {
    if (!currentChannel) return;
    /*
      The ref, not just the controller.

      This effect deliberately bypasses `selectChannel` — it is the one
      that starts playback for the channel the route opened with — but
      `selectChannel` was also the only writer of `currentChannelRef`, so
      on a fresh open the ref stayed null and the background/resume handler
      below had nothing to re-select: coming back from Home left a black,
      sourceless player. It only ever worked by accident, because
      `useNetworkReconnect` used to fire spuriously at mount and go through
      `selectChannel`. That accident is fixed in the same change, so this
      line is now what holds the path up.
    */
    currentChannelRef.current = currentChannel;
    PlayerLifecycleMonitor.channelSelected(currentChannel.providerItemId);
    controller.select({
      id: currentChannel.providerItemId,
      streamUrlCandidates: currentChannel.streamUrlCandidates,
    });
    // Only ever runs once, to start playback for the channel the route opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { now: nowProgram } = useEpgNowNext(session?.config ?? null, currentChannel?.providerItemId ?? null);
  const nowTick = useNowTick();

  /**
   * Stops playback after the chosen number of minutes and leaves the
   * screen — the point of a sleep timer is that the stream stops holding
   * the account's single connection once the viewer has fallen asleep,
   * not just that the sound goes quiet.
   */
  useEffect(() => {
    if (sleepMinutes <= 0) return;
    const timer = setTimeout(() => {
      player.pause();
      router.back();
    }, sleepMinutes * 60 * 1000);
    return () => clearTimeout(timer);
  }, [sleepMinutes, player]);

  /**
   * The remote, as four bindings and nothing else.
   *
   * OK opens the side channel list. Up is the next channel, Down the
   * previous one. OK held pauses and resumes. Back closes the list before
   * it leaves the screen, so the first press does not drop the viewer out
   * of the player when all they wanted was to dismiss the list.
   *
   * That is the whole remote, specified that way by the viewer on
   * 2026-09-18: "لا داعي لان يكون اي شيء ثاني اضافي". The dedicated media
   * and channel keys below are kept because they are buttons that already
   * exist on the remote with one possible meaning each — honouring them is
   * not an addition to the model, and leaving them dead would be a defect.
   *
   * Left/right open the audio-track sheet. They have nothing to seek
   * through on a broadcast, and the audio language had no other route on
   * a remote once the transport row was removed.
   */
  useTVRemote((key) => {
    switch (key) {
      /*
       * The D-pad zaps only while the controls are hidden.
       *
       * When they are on screen the same presses belong to the focus
       * system: Android moves focus between the buttons, and acting on
       * them here as well meant one press both moved the highlight and
       * changed the channel. With nothing on screen to move between, the
       * D-pad is free to mean "next channel".
       */
      /*
        Up is the **next** channel and Down the previous one — the way a
        television has always worked: the number climbs as you press up.
        They were the other way round until 2026-09-18, which is a list's
        idea of up rather than a tuner's, and was reported as simply
        backwards.
      */
      case "up":
        if (dpadChangesChannel) selectByOffset(1);
        break;
      case "down":
        if (dpadChangesChannel) selectByOffset(-1);
        break;
      /* Dedicated media keys — no focus to compete with, always ours. */
      case "previous":
        selectByOffset(-1);
        break;
      case "next":
        selectByOffset(1);
        break;
      /*
        The remote's own channel buttons, which did nothing until now — the
        key names were missing from `useTVRemote`'s set entirely. Always
        ours, like the media keys: no focus system competes for a key that
        exists for one purpose.
      */
      case "channelUp":
        selectByOffset(1);
        break;
      case "channelDown":
        selectByOffset(-1);
        break;
      /*
        Digits open the box as well as fill it, which is what a television
        does: there is no need to find the # button first. The button stays
        for anyone who reaches for it.
      */
      case "0":
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9":
        pushChannelDigit(key);
        break;
      /*
        OK opens the side channel list, and that is all it does.

        It used to reveal the control overlay instead — not through this
        handler, but through the full-screen tap surface below, which holds
        focus whenever the controls are hidden and turned a centre press
        into its own onPress. On a remote that overlay is an answer to a
        question nobody asked: its buttons duplicate keys the remote
        already has, and reaching them costs arrow presses. The viewer's
        own model, given on 2026-09-18: OK opens the channel list, up and
        down change channel, OK held pauses, nothing else.

        The list this opens is `ChannelGuideOverlay` — a panel docked to
        the trailing edge at 42% width, with the picture still playing
        beside it. It is already built for a remote: its rows are
        `Focusable`, clipping is off so the highlight cannot jump, and
        focus starts on the channel now playing.

        Guarded on `dpadChangesChannel` for the same reason the arrows are:
        with the list or the track sheet already open, the centre button
        belongs to the row that holds focus, and a `Modal` forwards its
        keys into this same stream (see that flag's note). Without the
        guard, picking a channel in the list would also have re-opened the
        list underneath it.
      */
      case "select":
        if (numberEntry !== null) {
          submitChannelNumber();
        } else if (dpadChangesChannel) {
          setGuideVisible(true);
        }
        break;
      /*
        OK held pauses and resumes.

        This cannot collide with the case above: Android dispatches the
        hold as `longSelect` and does not also send `select`, and the
        hook's ACTION_UP filter reduces the hold's two dispatches to one.
        Both facts are cited in useTVRemote.
      */
      case "longSelect":
        if (dpadChangesChannel) togglePlayQuietly();
        break;
      /*
        Left and right open the audio-track sheet.

        They had no meaning at all on a live channel — there is nothing to
        seek through in a broadcast — and after the transport row came off
        the TV build the audio language was the one thing on the control
        overlay that no key could reach. Two dead buttons, one stranded
        control; binding them is the whole fix. Requested 2026-09-18, right
        after the row was removed.

        Both arrows do the same thing on purpose. A sheet is not a
        direction, so there is no left version of it and no right version,
        and making the viewer remember which arrow it was would be a worse
        answer than either.

        Only when there is actually a choice to make, which is the same
        condition the on-screen chip uses: with one audio track the sheet
        would open to a list of one. The press is then silent rather than
        opening something useless — the arrows carry no other meaning here,
        so nothing is shadowed by the silence.
      */
      case "left":
      case "right":
        if (dpadChangesChannel && tracks.audioTracks.length > 1) setTracksVisible(true);
        break;
      /*
        The remote's own play/pause buttons, which mean exactly one thing
        and are always ours. Quiet for the same reason as the held centre
        button: a key press must not hand focus to the back arrow.
      */
      case "playPause":
      case "play":
      case "pause":
        togglePlayQuietly();
        break;
      /*
       * Everything else, left/right included, belongs to whatever holds
       * focus. The note that used to sit here said `select` was
       * deliberately unhandled because the focused button's own onPress
       * fires on it — still true of buttons, which is why the case above
       * is guarded, but the tap surface no longer competes for it on a
       * television. See its onPress.
       */
      default:
        break;
    }
  });

  /**
   * Frees the provider connection while the app is in the background.
   *
   * With background playback off, expo-video only pauses — and a paused
   * `.ts` stream keeps its socket open, so this account's single connection
   * stayed locked up for as long as the viewer was in another app, with no
   * visible cause on any other device. Dropping the source releases it;
   * coming back re-opens the same channel, which also gives a live stream a
   * current buffer instead of resuming into a stale one.
   */
  useEffect(() => {
    if (backgroundPlaybackEnabled !== false) return;
    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (unmountedRef.current) return;
      if (next === "background") {
        /*
          Still needed on the libVLC engine, and for an extra reason there:
          its `continueAudioInBackground={false}` pauses on background and
          then *auto-resumes* on foreground
          (`@lunarr/vlc-player/ios/VLCPlayerView.swift:95-102`), which would
          bring back the very stream this is dropping. Dropping the source
          releases the native player, which clears that pending resume, and
          the `active` arm below is what actually re-opens the channel.
        */
        void releaseLiveSource(player);
      } else if (next === "active" && currentChannelRef.current) {
        selectChannel(currentChannelRef.current);
      }
    });
    return () => subscription.remove();
    // `selectChannel` is redefined every render; the channel is read from a
    // ref so this subscribes once instead of on every zap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundPlaybackEnabled, player]);

  useEffect(() => {
    if (!session) router.replace("/providers");
  }, [session]);

  if (!session) {
    return null;
  }

  if (channels.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t("liveChannelList", "noChannelsAvailable")}</Text>
          <Focusable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t("common", "back")}</Text>
          </Focusable>
        </View>
      </SafeAreaView>
    );
  }

  const selectedIndex = currentChannel
    ? channels.findIndex((c) => c.providerItemId === currentChannel.providerItemId)
    : -1;

  /**
   * Steps through the lineup without tuning on every press.
   *
   * Tuning is expensive in a way a remote makes very easy to abuse: each
   * one tears the current stream down and opens a new HTTP connection to
   * the panel. This account is limited to a single connection and its edge
   * starts answering 404 to bursts of requests (docs/DECISIONS.md), so a
   * viewer walking six channels up with six quick presses opened six
   * streams in about a second, got refused, and sat looking at a player
   * that had stopped responding — the hang reported from the television on
   * 2026-09-10.
   *
   * So a press moves a *pending* position and shows which channel it lands
   * on, and only silence tunes. Holding Up through twenty channels now
   * costs one connection instead of twenty, and it is also how a
   * television has always behaved: the number goes up as you press, the
   * picture follows once you stop.
   */
  function selectByOffset(offset: number) {
    if (channels.length === 0) return;
    /*
      `zapTargetRef` and not `selectedIndex`.

      A leading-edge press tunes synchronously, so a second press arriving
      in the same tick would read a `selectedIndex` derived from
      `currentChannel` state that React has not re-rendered yet — and step
      from the channel *before* the one just tuned, landing back where it
      started. The ref is written the moment a target is chosen, so a run of
      presses walks the lineup one channel at a time however fast it comes.
    */
    const base =
      pendingZapIndex ?? zapTargetRef.current ?? (selectedIndex >= 0 ? selectedIndex : 0);
    const next = (base + offset + channels.length) % channels.length;
    zapTargetRef.current = next;

    /*
     * Only *refresh* the auto-hide, never start it. A zap that came from
     * the on-screen buttons must not have the bar disappear from under the
     * finger mid-sequence; a zap that came from the D-pad must not put the
     * bar back, because Up/Down stop meaning "channel" the moment it is
     * there. Reading the current visibility distinguishes the two without
     * the caller having to say which it is.
     */
    if (controlsVisible) showControlsTemporarily();

    if (zapCommitTimerRef.current) clearTimeout(zapCommitTimerRef.current);

    /*
      Leading edge, then trailing.

      The first press of a run tunes immediately — there is nothing left for
      it to wait for, now that the line has room for more than one
      connection and the release wait is gone with it. What still needs
      holding back is a *run* of presses: the panel bans bursts of requests
      whatever the connection allowance, so once a press has happened the
      next ones inside `ZAP_RUN_WINDOW_MS` are collected and only the
      channel the viewer settles on is opened.

      A line still limited to one connection keeps the old behaviour — every
      press deferred — because there the first press does have something to
      wait for: the previous stream letting go of the only slot.
    */
    const now = Date.now();
    const insideRun = now - lastZapAtMsRef.current <= ZAP_RUN_WINDOW_MS;
    lastZapAtMsRef.current = now;

    const strictLine = needsReleaseWait(session?.accountInfo?.maxConnections);

    if (!insideRun && !strictLine) {
      setPendingZapIndex(null);
      // `revealControls: false` — see selectChannel. The banner is the
      // feedback for a zap; the full control bar is not.
      selectChannel(channels[next], false);
      zapTargetRef.current = next;
      return;
    }

    setPendingZapIndex(next);
    zapCommitTimerRef.current = setTimeout(() => {
      zapCommitTimerRef.current = null;
      setPendingZapIndex(null);
      selectChannel(channels[next], false);
      zapTargetRef.current = next;
    }, strictLine ? ZAP_COMMIT_MS : ZAP_RUN_SETTLE_MS);
  }

  function cycleFit() {
    const next = (fitIndex + 1) % FIT_MODES.length;
    setFitIndex(next);
    setPlayerFitMode(FIT_MODES[next]).catch(() => {});
  }

  function togglePlay() {
    if (isPlaying) player.pause();
    else player.play();
    showControlsTemporarily();
  }

  /**
   * The same thing, without putting the control overlay on screen. This is
   * what every key on the remote uses; `togglePlay` above is for the
   * on-screen button, where the overlay is already up by definition and
   * refreshing its timer is the point.
   *
   * The overlay is not merely redundant on a remote, it is a hazard. When
   * it appears the full-screen tap surface stops being focusable
   * (`focusable={!controlsVisible}`) and Android moves focus to the first
   * focusable in the tree — which is the top bar's back arrow. So a viewer
   * who held OK to pause and then pressed OK again left the player
   * altogether, having pressed the same button twice. Keeping the overlay
   * out of it keeps focus on the tap surface, so OK still means "open the
   * channel list" and the arrows still mean "change channel".
   *
   * The cost, stated rather than hidden: a pause has no badge over the
   * picture. The picture stops, which is the signal, and nothing was added
   * to the screen to say so — the viewer asked for nothing extra
   * (2026-09-18). A small non-focusable indicator, in the manner of the
   * zap banner, is the obvious thing to add if that turns out to be too
   * quiet in front of a real television.
   */
  function togglePlayQuietly() {
    if (isPlaying) player.pause();
    else player.play();
  }

  const epgProgress = nowProgram
    ? Math.min(
        1,
        Math.max(0, (nowTick - nowProgram.startTimestamp) / (nowProgram.stopTimestamp - nowProgram.startTimestamp))
      )
    : 0;

  function submitChannelNumber() {
    if (numberCommitTimerRef.current) {
      clearTimeout(numberCommitTimerRef.current);
      numberCommitTimerRef.current = null;
    }
    const index = Number(numberEntry) - 1;
    setNumberEntry(null);
    if (Number.isInteger(index) && index >= 0 && index < channels.length) {
      selectChannel(channels[index]);
    }
  }

  /**
   * Appends a digit pressed on the remote, and arms the tune.
   *
   * This is how a television behaves and what the viewer already expects
   * from one: type 1, type 2, stop, and channel 12 comes on by itself. The
   * alternative — type and then find something to press to confirm — is the
   * behaviour of a form, and a remote has no obvious confirm.
   *
   * `NUMBER_COMMIT_MS` restarts on every digit, so a three-digit channel is
   * reachable as long as the digits keep coming. `select` tunes at once for
   * anyone who does not want to wait.
   *
   * Capped at the width of the longest channel number there could be, so a
   * leant-on key cannot build an endless string.
   */
  function pushChannelDigit(digit: string) {
    /*
      The phone needs the overlay up, because on a phone the box lives
      inside it. The television does not — see the box's own note — and
      raising it there would hand focus to a button and cost the viewer the
      OK press that commits the number.
    */
    if (!isTvBuild) showControlsTemporarily();
    setNumberEntry((current) => ((current ?? "") + digit).slice(0, 5));
    if (numberCommitTimerRef.current) clearTimeout(numberCommitTimerRef.current);
    numberCommitTimerRef.current = setTimeout(() => {
      numberCommitTimerRef.current = null;
      submitChannelNumberRef.current();
    }, NUMBER_COMMIT_MS);
  }

  const contentFit = FIT_MODES[fitIndex];

  /**
   * Session-only, deliberately: this button expands the split layout to
   * fullscreen for the channel you are watching, it does not change which
   * layout channels *open* in. Persisting it (the original behaviour) meant
   * one tap on expand silently switched the app back to the old fullscreen
   * flow for every channel after it — which is exactly what it did in
   * testing. The Settings switch is the only thing that writes the stored
   * preference.
   */
  /**
   * Expand means "turn me landscape", not "hide the list".
   *
   * The button used to flip the layout flag, which locked the orientation
   * and stranded the viewer in fullscreen with no way back to the channel
   * list. Now it asks for landscape and then releases the lock, so the
   * sensor is back in charge: hold the phone sideways and it stays
   * fullscreen, bring it upright and the list returns.
   *
   * The release is delayed rather than immediate because an unlock that
   * lands before the device has physically turned is undone at once by the
   * sensor.
   */
  function expandToLandscape() {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
      .catch(() => {})
      .finally(() => {
        setTimeout(() => {
          ScreenOrientation.unlockAsync().catch(() => {});
        }, ORIENTATION_RELEASE_MS);
      });
  }

  /*
    Nothing at all until the layout preference is known.

    `splitView` is null while it loads, and `splitView && !isLandscape` read
    that as "fullscreen" — so a viewer who prefers the split layout got the
    fullscreen branch for a frame or two first. That branch hides both system
    bars, so the cost was not only a flash of the wrong layout but the
    navigation and status bars blinking out and back on every channel open.
    The player has no source yet at this point, so there is nothing to show
    besides the background.
  */
  if (splitPreference === null) {
    return <View style={styles.safeArea} />;
  }

  /*
    ## The two trees below cost a reconnect per rotation on iOS

    This return and the one after it are different trees — at child position
    zero the element types differ (`SplitChannelView` against `StatusBar`) —
    so React unmounts the whole subtree, video surface included, every time
    the phone is turned.

    On `expo-video` that is free, and `SplitChannelView`'s own note says why:
    the player is an object this screen owns and the view is only a window
    onto it, so the picture never unmounts and the provider connection is
    never dropped. libVLC has no such separation. Its native player is built
    inside the view and every unmount path releases it, so there is no
    adapter anywhere that can deliver one player across two render trees.

    What happens instead: the libVLC engine notices the new surface and
    re-opens the current channel itself, emitting no error, so no retry
    budget is spent and this screen only sees `loading` and then
    `readyToPlay` again. The viewer pays a black gap and a re-buffer for each
    turn of the phone, and the account pays one request — a human action, not
    a burst, so nothing near the rate the panel objects to.

    The fix, if that gap is objectionable on a real iPhone, is to fold these
    two returns into one tree that mounts the video surface exactly once and
    positions it by style — a layout edit that touches no playback logic. It
    was not done here because it changes the render path of the Android build
    that is live on Play, which this work is not allowed to touch, and it
    could not be tested on either platform from where it would have been
    written. See `VlcLivePlayer.attachSurface`.
  */
  if (showSplit) {
    return (
      /*
        All four edges, unlike the fullscreen branch below.
        
        This is not a fullscreen video: it is an ordinary portrait page with
        a video box at the top and a channel list under it, and it returns
        before the `StatusBar`/`NavigationBar` pair — so both system bars
        stay on screen and both have to be cleared. The fullscreen branch
        releases the top and bottom edges because it hides those bars and
        pads its own controls instead; doing the same here would put the
        clock over the picture and the navigation buttons over the list.
      */
      <SafeAreaView style={styles.safeArea}>
        <SplitChannelView
          player={player}
          channels={channels}
          categories={categories}
          activeCategoryId={listCategoryId}
          currentChannelId={currentChannel?.providerItemId ?? null}
          nowPlayingName={currentChannel?.name ?? ""}
          listRef={splitListRef}
          scrollProps={splitScrollProps}
          isPlaying={isPlaying}
          isBuffering={status === "loading"}
          contentFit={contentFit}
          errorReasonKey={errorReasonKey}
          retryPending={retryPending}
          onBack={() => router.back()}
          onSelectCategory={setListCategoryId}
          onSelectChannel={selectChannel}
          onTogglePlay={togglePlay}
          onExpand={expandToLandscape}
        />
      </SafeAreaView>
    );
  }

  return (
    /*
      No safe-area padding at all on this branch, deliberately.

      The picture must fill the screen and never move. Every edge here is
      applied to the control layers instead — see `layerPadding` below.

      Anything padded on this view pads the video with it, and since the
      system bars now appear and disappear with the controls, an inset
      that lives here changes size on every tap: measured on the test
      phone, landscape three-button navigation puts the bar down the
      *left* edge at 105px, so a left inset here shifted and narrowed the
      video each time the viewer touched the screen. The same was true
      vertically for the status bar. Video full-bleed, controls inset, is
      the only arrangement where neither problem exists.
    */
    <SafeAreaView style={styles.safeArea} edges={[]}>
      {/*
        Both system bars follow the controls, the way a fullscreen video
        player does: picture only while watching, and the clock and the
        navigation buttons come back together with the transport row the
        moment the viewer asks for it.

        Not hidden for the player's whole life, which was the first
        version of this: with the controls up, the bar the viewer needs in
        order to leave was the one thing missing, and a clock is useful
        exactly when someone has stopped watching to press something.

        The video does **not** move when they toggle. Hiding the status bar
        takes `insets.top` to zero, so a `SafeAreaView` that padded for it
        would collapse and the picture would jump up and back on every
        tap. The top edge is therefore off the SafeAreaView and applied as
        padding to the top bar alone — the same split already used at the
        bottom for the navigation bar.
      */}
      {/*
        Hidden for the player's whole life, not only while the controls are
        away. A clock and a battery icon over a film are the phone
        intruding on the one screen whose entire job is the picture, and
        every way out of here — the back arrow, the system back gesture —
        works without them (requested 2026-09-15).
      */}
      <StatusBar hidden />
      {/*
        The status bar comes back with the controls. The navigation bar does
        not — it stays hidden for as long as the player is on screen, and
        Android's own edge swipe is what brings it back, transiently.

        Requested 2026-09-15: only the player's own buttons should appear on
        a tap, and the navigation bar only on a swipe from its edge. It is
        also the better arrangement for a reason the request does not have
        to state: the navigation bar is the one whose inset moves the video.
        In landscape this device puts it down the left edge at 105px, so a
        bar that appeared and vanished with every tap made the picture step
        sideways and back each time. The clock costs only a top inset, which
        the controls absorb on their own.
      */}
      <NavigationBar hidden />
      <View style={styles.playerArea}>
        <LiveVideoView style={styles.video} player={player} nativeControls={false}
          allowsPictureInPicture contentFit={contentFit} />

        {/*
          The tap surface sits *over* the video, not around it.

          It used to be the container, with the VideoView as its child — and
          on Android expo-video's VideoView re-dispatches touch events itself
          rather than letting them bubble, so a tap landing on the picture
          never reached the parent's `onPress`. Once the controls auto-hid
          after four seconds there was no way to bring them back: no channel
          switching, no back button, nothing. (The VOD player never had this
          because its controls are an `absoluteFill` overlay above the video;
          this is the same arrangement.)

          Everything below is rendered after it, so the buttons stay on top
          and keep receiving their own taps — this layer only catches the
          picture.
        */}
        {/*
          The swipe handlers go on a plain View and the tap on a child,
          because `Pressable` cannot carry both. It renders
          `<View {...restProps} {...eventHandlers}>` (Pressable.js), and its
          own Pressability handlers — including
          `onStartShouldSetResponder` and the whole
          `onResponderGrant/Move/Release` set — are spread *after* anything
          passed in, silently replacing them. Volume and brightness swipes
          therefore never ran; worse, a vertical drag stayed inside the
          full-screen hit rect, so releasing it counted as a tap and toggled
          the controls instead.
        */}
        <View style={StyleSheet.absoluteFill} onLayout={gestures.onLayout} {...gestures.handlers}>
          {/*
            Focusable only while the controls are hidden — this is the single
            most important line for the remote.

            Every `Pressable` is D-pad focusable by default on
            react-native-tvos (Pressable.js: `focusable={focusable !== false
            && isTVSelectable !== false}`), so this full-screen surface was
            the first focusable in the tree and Android parked focus on it.
            Android's `FocusFinder` never treats a view *inside* the focused
            rectangle as a candidate, so no arrow could ever leave it: no ring
            appeared anywhere and every control was unreachable.

            It cannot simply be `focusable={false}` either. Android only
            delivers key events down the focused view's chain, and RN's root
            reads them from there — with nothing focused inside the root the
            remote would go completely dead. So it takes focus exactly when
            there is nothing else to take it, and yields the moment the
            controls appear.
          */}
          <Pressable
            style={StyleSheet.absoluteFill}
            focusable={!controlsVisible}
            hasTVPreferredFocus={isTvBuild && !controlsVisible}
            /*
              `isTap` — a `Pressable` fires `onPress` for any release inside
              its bounds and this one covers the screen, so without the
              check a swipe across the picture toggled the controls. See
              usePlayerGestures.
            */
            /*
              Touch only, and on a television there is no touch.

              This surface keeps focus while the controls are hidden — it
              has to, or Android would deliver the remote's keys nowhere
              (see the note above) — and react-native-tvos turns a centre
              press on a focused Pressable into its own onPress. So OK used
              to land here and toggle the control overlay, with
              `isTap()` reading `maxTravelRef` at its initial 0 and
              answering true for a press that involved no finger at all.
              Now OK means one thing, in one place: it opens the channel
              list, from the key map above.
            */
            onPress={() => {
              if (!isTvBuild && gestures.isTap()) toggleControls();
            }}
          />
        </View>

        {/*
          What the D-pad has stepped to, while it waits to tune.

          The whole point of deferring the tune is that the viewer can still
          see where they are going, so this has to be the immediate
          feedback the picture no longer is. `pointerEvents="none"` and no
          focusable child: it must not enter the focus system, or it would
          take focus from the tap surface and kill the very keys that put it
          on screen.
        */}
        {pendingZapIndex !== null && channels[pendingZapIndex] && (
          <View style={styles.zapBanner} pointerEvents="none">
            <Text style={styles.zapBannerIndex}>{pendingZapIndex + 1}</Text>
            <Text style={styles.zapBannerName} numberOfLines={1}>
              {channels[pendingZapIndex].name}
            </Text>
          </View>
        )}

        {/*
          There is no pillarbox fade, and there should not be one.

          A 16:9 broadcast on this 20:9 phone leaves a 240px black bar down
          each side ((2400 − 1920) / 2, measured from the framebuffer on
          2026-09-16). An earlier version tried to soften the seam between
          bar and picture with a 22%-wide dark ramp per side, and it was
          wrong twice over:

            - 22% of 2400 is 528px, so 264px of *picture* per side — about
              a quarter of the frame's width — was being washed with up to
              20% black, permanently, in normal viewing as well as while
              the controls were up.
            - It did not even hide the seam. The ramp is quadratic and
              measured from the screen edge, so by the time it reached the
              bar's inner boundary it was only ~20% opaque against a bar
              that is 100% black: the boundary stayed visible and the
              picture paid for it anyway. Reported on the device as black
              lines that were "جدا مزعجة".

          The bars are geometry, not a defect: a hard edge between a black
          bar and the picture is what every player and every television
          shows. The viewer who would rather fill the screen has the fit
          toggle in the controls, which crops instead — their choice to
          make, not ours to force with a gradient.
        */}

        {gestures.dim > 0 && (
          <View style={[styles.dimLayer, { opacity: gestures.dim }]} pointerEvents="none" />
        )}
        <GestureHud kind={gestures.hud.kind} value={gestures.hud.value} />

        {/*
          Shown while loading *or* while a retry is counting down — the
          second case is what keeps a busy connection from looking like a
          dead end.
        */}
        {((status === "loading" && !errorReasonKey) || retryPending) && (
          <View style={styles.overlayCenter} pointerEvents="none">
            <ActivityIndicator color={Colors.text} size="large" />
          </View>
        )}

        {errorReasonKey && (
          /*
            The brand mark and one sentence, in place of the picture — and
            nothing else on the screen changes.

            `pointerEvents="none"`, with no button inside: a tap anywhere
            goes straight through to the surface underneath and brings the
            player's own controls up exactly as it does during playback, so
            a stopped channel is navigated the same way a playing one is.
            There is deliberately no Retry button — it was one more thing
            to aim at for an action the back arrow and the channel list
            already cover, and a channel that is off the air does not come
            back because it was asked twice (requested 2026-09-16).

            What it replaces: the provider's own string, which reads
            "HTTP 403 from http://…/live/…ts" — long, in English, naming a
            server the viewer has no relationship with, carrying a
            credentialed path, and reading as the app breaking rather than
            a broadcast being off the air, which is what it almost always
            is.

            `brandLogoOnDark` rather than `brandLogoSource`: this sits on
            the player's black background in either theme, and the
            theme-aware mark is near-black in light mode.
          */
          <View style={styles.overlayCenter} pointerEvents="none">
            <Image
              source={brandLogoOnDark()}
              /*
                Twice the size in landscape. The overlay replaces the
                picture entirely, so in landscape it has the full width of
                the screen to itself and the portrait size read as a small
                mark floating in a lot of black.
              */
              style={[styles.errorLogo, isLandscape && styles.errorLogoLandscape]}
              resizeMode="contain"
            />
            <Text style={[styles.errorText, isLandscape && styles.errorTextLandscape]}>
              {t("livePlayer", errorReasonKey as "streamPaused")}
            </Text>
          </View>
        )}

        {/* Keep a visible exit on iPhone even after the transport auto-hides. */}
        <View style={[styles.topBar, layerPadding(Spacing.md)]} pointerEvents="box-none">
          <Focusable onPress={() => router.back()} style={styles.iconButton} hitSlop={8} accessibilityLabel={t("common", "back")}>
            <BackChevron color={Colors.text} />
          </Focusable>
          {controlsVisible && <>
          <Text style={styles.channelName} numberOfLines={1}>
            {currentChannel?.name ?? ""}
          </Text>
          {/*
            Channel-number entry, on the TV build only.

            A remote has a number pad as real buttons, so typing 4500
            is the fastest route to channel 4500 and there is no other
            one. A phone has a searchable list a thumb reaches in the
            same gesture, which is why this row is down to a single
            button there (requested 2026-09-16, along with the removal
            of the split-view toggle — reported as not working — and of
            the screen lock).
          */}
          {isTvBuild && (
            <Focusable
              onPress={() => setNumberEntry((current) => (current === null ? "" : null))}
              style={styles.iconButton}
              hitSlop={12}
            >
              <Text style={styles.iconButtonText}>#</Text>
            </Focusable>
          )}
          {/*
            Where the remote lands when the overlay appears, now that
            the transport row it used to land on is gone from the TV
            build.

            It has to land *somewhere*: the full-screen tap surface
            stops being focusable while the overlay is up
            (`focusable={!controlsVisible}`), so Android hands focus to
            the first focusable in the tree — which is the back arrow at
            the start of this bar. That made OK mean "leave the player"
            for as long as the overlay was up. Here it means "open the
            channel list", the same thing OK means everywhere else, so
            a viewer who presses it out of habit gets the one action
            they already expect.

            Phone excluded for the reason the old site documented:
            `hasTVPreferredFocus` is not a description of state,
            react-native-tvos calls `requestFocus()` wherever it is
            set — on a touch screen it drew a focus ring for a viewer
            with no cursor (reported 2026-09-15).
          */}
          <Focusable
            onPress={() => setGuideVisible(true)}
            accessibilityLabel={t("liveGuide", "guideButtonLabel")}
            style={[styles.iconButton, guideVisible && styles.iconButtonActive]}
            hitSlop={12}
            hasTVPreferredFocus={isTvBuild}
          >
            <Text style={styles.iconButtonText}>☰</Text>
          </Focusable>
          </>}
        </View>

        {controlsVisible && (
          <>

            {/*
              Previous, play/pause and next — **the phone only**.

              On a television all three duplicate keys that are already in
              the viewer's hand: Up and Down change channel, OK held pauses.
              A button that repeats a key costs arrow presses to reach and
              earns nothing, and while this row was on screen the arrows
              belonged to it rather than to the channels. Removed at the
              viewer's request, 2026-09-18: "مافي داعي للاشارات البلاي
              والتقديم والتاخير في شاشة التلفاز", then "حتى نيسكت وبريفيوز".

              The phone keeps all three: there is no remote there, and a
              tap on a glyph is the only way to reach any of it.
            */}
            {!isTvBuild && (
              <View style={[styles.centerControls, layerPadding(0)]} pointerEvents="box-none">
                  <Focusable style={styles.zapButton} accessibilityLabel={t("livePlayer", "previousChannel")} onPress={() => selectByOffset(-1)} hitSlop={8}>
                    <Text style={styles.zapGlyph}>|◀</Text>
                  </Focusable>
                  {/*
                    No `hasTVPreferredFocus` here any more, and none is
                    needed: this row does not exist on a television. It used
                    to carry it because it was where the remote had to land
                    when the overlay appeared — that job has moved to the
                    list button in the top bar, which is the one control
                    whose meaning matches what OK does everywhere else.
                  */}
                  <Focusable style={styles.playButton} accessibilityLabel={t("livePlayer", isPlaying ? "pause" : "play")} onPress={togglePlay} hitSlop={8}>
                    <Text style={styles.playGlyph}>{isPlaying ? "❙❙" : "▶"}</Text>
                  </Focusable>
                  <Focusable style={styles.zapButton} accessibilityLabel={t("livePlayer", "nextChannel")} onPress={() => selectByOffset(1)} hitSlop={8}>
                    <Text style={styles.zapGlyph}>▶|</Text>
                  </Focusable>
              </View>
            )}

                {/* `box-none` for the same reason as the top bar. */}
                <View style={[styles.bottomArea, layerPadding(Spacing.md)]} pointerEvents="box-none">
                  <View style={styles.liveRow}>
                    <View style={styles.liveBadge}>
                      <LiveDot />
                      <Text style={styles.liveBadgeText}>{t("liveChannelList", "liveBadge")}</Text>
                    </View>
                    {nowProgram && (
                      <Text style={styles.epgTime}>
                        {formatTimeOfDay(nowProgram.startTimestamp)} - {formatTimeOfDay(nowProgram.stopTimestamp)}
                      </Text>
                    )}
                  </View>

                  {nowProgram && (
                    <>
                      <Text style={styles.epgTitle} numberOfLines={1}>
                        {nowProgram.title}
                      </Text>
                      <View style={styles.epgProgressTrack}>
                        <View style={[styles.epgProgressFill, { width: `${epgProgress * 100}%` }]} />
                      </View>
                    </>
                  )}

                  <View style={styles.chipRow}>
                    {/*
                      No subtitles chip on live channels (removed
                      2026-09-16). A broadcast either carries a subtitle
                      track or it does not, and on this provider's lineup
                      almost none do — so the chip was a permanent button
                      that opened a modal with nothing in it. The audio chip
                      next to it opens the same modal and appears only when
                      there is actually more than one track to choose
                      between, which is the behaviour this one should have
                      had.
                    */}
                    {tracks.audioTracks.length > 1 && (
                      <Focusable style={styles.chip} onPress={() => setTracksVisible(true)}>
                        <Text style={styles.chipGlyph}>♪</Text>
                        <Text style={styles.chipText}>{t("livePlayer", "audio")}</Text>
                      </Focusable>
                    )}
                    <Focusable
                      style={[styles.chip, sleepMinutes > 0 && styles.chipActive]}
                      onPress={() => setSleepMinutes((minutes) => (minutes === 0 ? 30 : minutes === 30 ? 60 : 0))}
                    >
                      <Text style={styles.chipGlyph}>☾</Text>
                      <Text style={styles.chipText}>
                        {sleepMinutes > 0 ? `${sleepMinutes}m` : t("livePlayer", "sleepOff")}
                      </Text>
                    </Focusable>
                    <Focusable style={[styles.chip, muted && styles.chipActive]} onPress={toggleMute}>
                      <Text style={styles.chipGlyph}>{muted ? "✕" : "♫"}</Text>
                      <Text style={styles.chipText}>
                        {muted ? t("livePlayer", "unmute") : t("livePlayer", "mute")}
                      </Text>
                    </Focusable>
                    <Focusable
                      style={styles.chip}
                      onPress={cycleFit}
                    >
                      <Text style={styles.chipGlyph}>⛶</Text>
                      <Text style={styles.chipText}>{t("livePlayer", FIT_LABEL_KEYS[contentFit])}</Text>
                    </Focusable>
                  </View>
                </View>
          </>
        )}
      </View>

      {/*
        Tied to the controls, not independent of them.

        It used to stay open after the four-second auto-hide, which on a
        remote left the D-pad zapping channels underneath an open number box
        — Up and Down mean "channel" only while the controls are away, and
        the box is not a control the focus system knows about.
      */}
      {/*
        On a television the box stands on its own; on a phone it rides with
        the overlay that holds the # button which opens it.

        Tying it to `controlsVisible` meant typing a digit summoned the
        whole overlay — which moved focus off the tap surface and onto a
        button, so the very next OK press went to that button instead of
        committing the number. The box is the only thing the digits need on
        screen.
      */}
      {numberEntry !== null && (isTvBuild || controlsVisible) && (
        <View style={styles.numberEntry}>
          <Text style={styles.numberEntryLabel}>{t("livePlayer", "channelNumber")}</Text>
          {/*
            On a television this is a **readout, not a field.**

            A `TextInput` with `autoFocus` raised the Leanback keyboard over
            the video, which is absurd when the remote in the viewer's hand
            has ten number keys on it — and then the hardware OK button did
            not submit, because `ReactEditText` swallows it, so the only way
            to tune was to navigate that keyboard to its Go key. The digits
            now arrive through `useTVRemote` (they were being dropped
            entirely: Android emits them as "0".."9" and the hook's set did
            not list them), and this just shows what has been typed.

            The phone keeps the field, unchanged: there is no number pad on
            a phone, so the keyboard is the only way in.
          */}
          {isTvBuild ? (
            <Text style={styles.numberEntryInput}>
              {numberEntry.length > 0 ? numberEntry : `1 - ${channels.length}`}
            </Text>
          ) : (
            <TextInput
              style={styles.numberEntryInput}
              value={numberEntry}
              onChangeText={setNumberEntry}
              keyboardType="number-pad"
              autoFocus
              maxLength={6}
              onSubmitEditing={submitChannelNumber}
              returnKeyType="go"
              placeholder={`1 - ${channels.length}`}
              placeholderTextColor={Colors.textMuted}
            />
          )}
        </View>
      )}

      <ChannelGuideOverlay
        visible={guideVisible}
        onClose={() => {
          setGuideVisible(false);
          showControlsTemporarily();
        }}
        /*
          The category the strip is on, not the one the route opened with.
          Changing category in the split view and then expanding used to
          leave the guide listing the original category.

          On the TV build this is the *only* narrowing that happens: the
          panel takes `categoryId` too and filters again on top of this,
          which either does nothing or empties the list outright, and that
          second filter is switched off for televisions. The phone keeps
          it. See the panel's own doc comment.
        */
        channels={channels}
        categoryId={categoryId ?? null}
        currentChannelId={currentChannel?.providerItemId ?? null}
        /*
          The list closes behind the choice on a television, and stays open
          on a phone.

          Two different gestures wearing the same name. A thumb on a phone
          zaps *through* this list — tap, look, tap the next one — and
          closing after each pick meant reopening it every time (which is
          why it was made to stay open on 2026-09-16). A remote does not
          browse that way: OK is one press away at any moment, so the list
          is never more than a press from returning, and leaving it over
          the picture means the viewer has to press Back before they can
          see what they just chose. Asked for explicitly on 2026-09-18:
          "في التلفاز فقط تختفي القائمة عند اختيار القناة".

          `selectChannel` brings the control overlay up for its four
          seconds, so the choice lands on the channel name and the
          programme rather than on a bare picture.
        */
        onSelect={(channel) => {
          selectChannel(channel);
          if (isTvBuild) setGuideVisible(false);
        }}
      />

      <TrackSelectorModal visible={tracksVisible} onClose={() => setTracksVisible(false)} tracks={tracks} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.lg, padding: Spacing.xl },
  emptyText: { color: Colors.textSecondary, fontSize: 15, textAlign: "center" },
  backButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
  },
  backButtonText: { color: Colors.text, fontFamily: FontFamily.bold },

  playerArea: { flex: 1, backgroundColor: "#000", position: "relative" },
  video: { width: "100%", height: "100%" },

  overlayCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  dimLayer: { ...StyleSheet.absoluteFill, backgroundColor: "#000" },
  numberEntry: {
    position: "absolute",
    top: 56,
    alignSelf: "center",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.lg,
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  numberEntryLabel: { color: Colors.textSecondary, fontSize: 11, lineHeight: 18, fontFamily: FontFamily.medium },
  numberEntryInput: {
    minWidth: 140,
    textAlign: "center",
    color: Colors.text,
    fontSize: 20,
    fontFamily: FontFamily.bold,
    paddingVertical: Spacing.xs,
  },
  /** Large on purpose: this is the whole screen's content, not a card's icon. */
  errorLogo: { width: 220, height: 124, marginBottom: Spacing.lg },
  /** Twice over, for a landscape screen the overlay has entirely to itself. */
  errorLogoLandscape: { width: 440, height: 248 },
  /*
    White and literal, not `Colors.error`.

    Red said "something is broken in the app" about a channel that is
    simply off the air, and it was theme-derived text on a surface that is
    always black — the same reason the mark above it uses `brandLogoOnDark`.
    Plain white, at a size meant to be read across a room rather than
    squinted at: 13px was a caption under an icon, and this is the only
    thing on the screen.
  */
  errorText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: FontFamily.medium,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
    lineHeight: 26,
  },
  errorTextLandscape: { fontSize: 22, lineHeight: 34 },

  lockedBar: {
    position: "absolute",
    top: Spacing.md,
    left: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },

  /**
   * Deliberately minimal: a back arrow, the channel name, and the two
   * controls that must always be reachable. The logo, the position counter
   * and the boxed button backgrounds were all dropped — over video, chrome
   * competes with the picture, and the name is the only thing a viewer
   * actually needs to read.
   */
  /**
   * Top-centre, clear of the control bar at the bottom and of the top bar's
   * own row — the banner is often on screen while neither is, and when the
   * controls do come back it must not sit under them.
   */
  zapBanner: {
    position: "absolute",
    // Percentage, not a fixed offset: the top bar is 34pt of button plus
    // padding, and `Spacing.xxl` put this straight on top of it whenever a
    // zap started from the on-screen buttons rather than the D-pad.
    top: "18%",
    alignSelf: "center",
    maxWidth: "70%",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.pill,
    backgroundColor: "rgba(0,0,0,0.78)",
  },
  zapBannerIndex: {
    color: Brand.primary,
    fontSize: 20,
    lineHeight: 28,
    fontFamily: FontFamily.bold,
    ...AndroidTextFix,
  },
  zapBannerName: {
    flexShrink: 1,
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FontFamily.bold,
    ...AndroidTextFix,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    // All padding comes from `layerPadding` — see CONTROL_EDGE.
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: Radii.pill,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonActive: { backgroundColor: Brand.primaryMuted },
  iconButtonText: { color: Colors.text, fontSize: 18, fontFamily: FontFamily.bold },
  channelName: { flex: 1, color: Colors.text, fontSize: 15, lineHeight: 24, fontFamily: FontFamily.bold },

  centerControls: {
    ...StyleSheet.absoluteFill,
    /*
     * Pinned left-to-right, the same as the VOD control bar. Time runs one
     * way whatever the interface language is: mirrored, "previous" (|◀)
     * lands on the right and "next" (▶|) on the left, and since ▶ and ◀ are
     * not bidi-mirrored both arrows end up pointing inward at the play
     * button. YouTube and Netflix keep these LTR in Arabic for the same
     * reason.
     */
    direction: "ltr",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xl,
  },
  /*
   * "Skip to previous/next", not "rewind/fast-forward": a live stream has
   * nothing to seek through, and the double-arrow glyphs used before read
   * as exactly that. These are the only transport controls here for the
   * same reason — there is deliberately no seek bar on a live channel.
   */
  /*
    The glyph alone, with no caption under it.

    Each of these used to be a glyph above a word, in a column — so the
    button's centre was the middle of the pair, which lifted the arrow above
    the play button's centre line even though the row is `alignItems:
    "center"`. Dropping the caption aligns the three by construction rather
    than by a nudge, and the arrows say what they do on their own
    (2026-09-17: "نكتفي فقط بالرمز بدون الكلمة ... ونجعل الرمزين بمحاذاة مع
    زر البلاي").

    A fixed square rather than `minWidth`, so the tap target stays the size
    it was when there was a caption to widen it.
  */
  zapButton: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  /* Larger than the old 20pt: it is now the whole control, not its heading. */
  zapGlyph: { color: Colors.text, fontSize: 26, fontFamily: FontFamily.bold },
  /**
   * Matched to the icon tiles on Home rather than drawn as its own thing: a
   * translucent white fill over whatever is behind it, no hard outline. The
   * old version was a near-opaque black disc with a bright ring, which read
   * as a chrome button sitting on the film instead of part of the same
   * interface (requested 2026-09-16).
   */
  playButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  playGlyph: { color: "rgba(255,255,255,0.92)", fontSize: 24, fontFamily: FontFamily.bold },

  bottomArea: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    // All padding comes from `layerPadding` — see CONTROL_EDGE.
    gap: Spacing.xs,
  },
  liveRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(229,9,20,0.9)",
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  liveBadgeText: { color: Colors.text, fontSize: 9, fontFamily: FontFamily.bold },
  epgTitle: { color: Colors.text, fontSize: 12, fontFamily: FontFamily.semiBold },
  epgTime: { color: Colors.textSecondary, fontSize: 11, fontFamily: FontFamily.regular },
  epgProgressTrack: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", overflow: "hidden" },
  epgProgressFill: { height: "100%", backgroundColor: Brand.primary },

  chipRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginTop: Spacing.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 32,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.pill,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  chipActive: { backgroundColor: Brand.primaryMuted, borderWidth: 1, borderColor: Brand.primary },
  chipGlyph: { color: Colors.text, fontSize: 12 },
  chipText: { color: Colors.text, fontSize: 11, fontFamily: FontFamily.semiBold },
});
