import { useEventListener } from "expo";
import type { VideoPlayer } from "expo-video";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackChevron } from "@/components/BackButton";
import { useI18n } from "@/core/i18n/I18nContext";
import { Focusable } from "@/components/Focusable";
import { isTvBuild } from "@/core/platform/isTvBuild";
import { Brand, Colors, FontFamily, Radii, Spacing } from "@/core/theme/tokens";

import { GestureHud } from "./GestureHud";
import { usePlaybackSeek } from "./usePlaybackSeek";
import { useTVRemote } from "./useTVRemote";
import { usePlayerGestures } from "./usePlayerGestures";

const AUTO_HIDE_MS = 4000;
const DOUBLE_TAP_MS = 280;
const SKIP_SECONDS = 10;

/** How far every control layer sits from the side of the screen. */
const CONTROL_EDGE = Spacing.lg;
const THUMB_SIZE = 14;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export interface VodPlayerControlsProps {
  player: VideoPlayer;
  title: string;
  isBuffering: boolean;
  onBack: () => void;
  /** Extra buttons (speed, tracks) rendered in the top-right cluster, alongside the back button/title. */
  topRightExtras?: ReactNode;
  /**
   * Episode transport, for the series player only.
   *
   * Optional because a film has no neighbours: when these are absent the
   * centre row is the three controls it has always been, and when they are
   * present it becomes five. Passing `null` rather than omitting them
   * renders the button disabled — which is what the first and last episode
   * of a series need, so the row does not change width as you move through
   * it.
   */
  onPreviousEpisode?: (() => void) | null;
  onNextEpisode?: (() => void) | null;
  /** Whether this player has episode neighbours at all — films do not. */
  hasEpisodeTransport?: boolean;
}

/**
 * Custom YouTube/Netflix-style playback controls (master prompt §24.1/§24.2)
 * to replace expo-video's `nativeControls` — the plain default Android
 * ExoPlayer control bar, which looks generic and clashes with the app's own
 * chrome (title bar, speed/track buttons layered awkwardly on top of it).
 * Center play/pause + ±10s skip, a draggable seek bar with elapsed/duration
 * labels, and the whole control set auto-hides after a few seconds — same
 * safe pattern as the live player: the back button stays reachable
 * regardless (expo-video's Android VideoView manually re-dispatches touch
 * events rather than letting them bubble naturally, so a tap landing on the
 * video surface reaching this component's toggle isn't 100% guaranteed).
 */
export function VodPlayerControls({
  player,
  title,
  isBuffering,
  onBack,
  topRightExtras,
  onPreviousEpisode,
  onNextEpisode,
  hasEpisodeTransport = false,
}: VodPlayerControlsProps) {
  /*
   * Clearance for the system navigation bar. The seek bar sits at
   * `bottom: 0` of a screen drawn edge to edge, so without this a
   * three-button navigation bar covered most of it — the draggable thumb
   * included. See the note in live/player/[channelId].tsx.
   */
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  /**
   * System-bar clearance plus a margin from the edge of the glass.
   *
   * `CONTROL_EDGE` is added rather than left to each layer's own
   * `paddingHorizontal`: this object is spread after the layer's style, and
   * `paddingStart`/`paddingEnd` beat `paddingHorizontal` — so with the
   * system bars hidden (insets zero) the first version of this cancelled
   * the padding the layers already had and put the buttons on the physical
   * edge. All four sides, because the navigation bar is at the bottom in
   * portrait and down one side in landscape.
   */
  /**
   * Padding for one control layer — see the twin of this in
   * live/player/[channelId].tsx for why it is a function, and why the
   * horizontal properties are physical rather than logical.
   */
  const layerPadding = (vertical: number) => ({
    paddingTop: vertical + insets.top,
    paddingBottom: vertical + insets.bottom,
    paddingLeft: CONTROL_EDGE + insets.left,
    paddingRight: CONTROL_EDGE + insets.right,
  });

  const [isPlaying, setIsPlaying] = useState(player.playing);
  const [currentTime, setCurrentTime] = useState(player.currentTime);
  const [duration, setDuration] = useState(player.duration);

  useEventListener(player, "playingChange", ({ isPlaying: playing }) => setIsPlaying(playing));
  useEventListener(player, "timeUpdate", ({ currentTime: time }) => {
    setCurrentTime(time);
    if (player.duration > 0) setDuration(player.duration);
  });

  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showControlsTemporarily() {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), AUTO_HIDE_MS);
  }

  useEffect(() => {
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), AUTO_HIDE_MS);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  /**
   * Double-tap to skip, the gesture every viewer already knows from
   * YouTube: left half goes back, right half goes forward. A single tap
   * still just shows or hides the chrome — the second tap has to land
   * within DOUBLE_TAP_MS for it to count as a skip, so nothing about the
   * old behaviour changes for someone who taps once.
   */
  const lastTapRef = useRef({ time: 0, x: 0 });

  function handleTap(event: GestureResponderEvent) {
    /*
      A swipe is not a tap. `Pressable` fires `onPress` for any release
      inside its bounds and this surface covers the screen, so without this
      a swipe both toggled the controls and — if two swipes landed inside the
      double-tap window — skipped ten seconds from wherever the second one
      ended. See usePlayerGestures.
    */
    if (!gestures.isTap()) return;
    // The touch's own timestamp, not `Date.now()`: it is what the platform
    // actually recorded for this tap, and reading the clock inside a
    // component-scoped function trips this project's `react-hooks/purity` rule.
    const now = event.nativeEvent.timestamp;
    const x = event.nativeEvent.pageX;
    const previous = lastTapRef.current;
    lastTapRef.current = { time: now, x };

    if (now - previous.time < DOUBLE_TAP_MS) {
      lastTapRef.current = { time: 0, x: 0 };
      // The measured surface, not `Dimensions` — see the note in
      // usePlayerGestures: on Android `window` excludes the navigation bar,
      // so in three-button landscape the midline sat 52px off centre.
      const isForward = x > gestures.width() / 2;
      skip(isForward ? SKIP_SECONDS : -SKIP_SECONDS);
      return;
    }
    toggleControls();
  }

  function toggleControls() {
    if (controlsVisible) {
      setControlsVisible(false);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      showControlsTemporarily();
    }
  }

  const seek = usePlaybackSeek(player);
  const gestures = usePlayerGestures(player, true);

  function togglePlayPause() {
    showControlsTemporarily();
    seek.togglePlayPause();
  }

  function skip(deltaSeconds: number) {
    showControlsTemporarily();
    seek.skipBy(deltaSeconds);
    // Mirror the jump locally instead of waiting for the next `timeUpdate`:
    // the player is authoritative and will correct this on its next tick,
    // but the bar has to move under the finger that pressed the button.
    setCurrentTime((previous) => {
      const next = previous + deltaSeconds;
      const max = duration > 0 ? duration : next;
      return Math.min(Math.max(next, 0), max);
    });
  }

  /**
   * The TV remote, handled here rather than in the two player screens
   * because everything it needs already lives in this component: the seek
   * hook, the controls-visibility timer, and `onBack`. Left and right jump
   * by the same ten seconds the on-screen buttons use, so the remote and
   * the touch controls never disagree about what a skip is.
   *
   * Up and down are left alone — the D-pad still has to be able to move
   * between the controls themselves.
   */
  useTVRemote((key) => {
    switch (key) {
      /*
       * Left and right skip only while the controls are hidden — with them
       * on screen those presses belong to the focus system, and handling
       * both meant one press moved the highlight and jumped the film.
       */
      case "left":
        if (!controlsVisible) skip(-SKIP_SECONDS);
        break;
      case "right":
        if (!controlsVisible) skip(SKIP_SECONDS);
        break;
      /* Dedicated transport keys — always ours, controls visible or not. */
      case "rewind":
        skip(-SKIP_SECONDS);
        break;
      case "fastForward":
        skip(SKIP_SECONDS);
        break;
      case "playPause":
      case "play":
      case "pause":
        togglePlayPause();
        break;
      /* `select` belongs to whichever control has focus, not to us. */
      default:
        break;
    }
  });

  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);
  const dragValueRef = useRef(0);
  const trackWidthRef = useRef(0);

  function updateDragFromX(locationX: number) {
    const total = player.duration;
    if (total <= 0 || trackWidthRef.current <= 0) return;
    const fraction = Math.min(Math.max(locationX / trackWidthRef.current, 0), 1);
    const value = fraction * total;
    dragValueRef.current = value;
    setDragValue(value);
  }

  /**
   * Drag handling uses React Native's gesture-responder props directly on
   * the track View rather than `PanResponder.create()`. A PanResponder is a
   * long-lived object that has to be memoized and then read back while
   * rendering (to spread `panHandlers`), which is exactly what the
   * `react-hooks/refs` rule forbids. These are plain event-handler props —
   * the refs they touch are only read when a touch actually happens.
   */
  function onTrackGrant(evt: GestureResponderEvent) {
    setDragging(true);
    showControlsTemporarily();
    updateDragFromX(evt.nativeEvent.locationX);
  }

  function onTrackMove(evt: GestureResponderEvent) {
    /*
      Keeps the controls alive for as long as the drag lasts.

      The auto-hide timer was armed once when the drag began and never
      refreshed, and the whole bottom bar — this track included — is inside
      `controlsVisible`. So hunting for a scene in a long film for more than
      four seconds made the bar, the thumb and the time labels vanish out
      from under the finger.
    */
    showControlsTemporarily();
    updateDragFromX(evt.nativeEvent.locationX);
  }

  function onTrackRelease() {
    const target = dragValueRef.current;
    setDragging(false);
    setCurrentTime(target);
    seek.seekTo(target);
    showControlsTemporarily();
  }

  const displayedTime = dragging ? dragValue : currentTime;
  const progressFraction = duration > 0 ? Math.min(Math.max(displayedTime / duration, 0), 1) : 0;

  return (
    <View style={styles.overlayTouchable}>
      {/*
        The gesture surface is a **sibling** of the controls, not their
        ancestor. That is the whole purpose of this extra View.

        It used to be this component's root, with the handlers on it and
        every button rendered inside — and the comment here claimed the
        controls "stay on top and keep their own presses". They did not.
        React Native's responder negotiation has nothing to do with z-order:
        an ancestor may claim the responder on *move*, and
        `usePlayerGestures` claims on any travel past 14dp that is more
        vertical than horizontal. So a finger that rolled slightly while
        pressing play, next or previous handed the touch to the swipe
        gesture, and the button's `onPress` never fired. The live player
        never had this, because its gesture View sits beside the controls
        rather than around them; this now matches it.

        `Pressable` overrides any responder handlers passed to it, which is
        why the swipe still needs its own View around the tap child instead
        of sharing one with it.
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
        onPress={handleTap}
      />
      </View>
      {gestures.dim > 0 && <View style={[styles.dimLayer, { opacity: gestures.dim }]} pointerEvents="none" />}
      <GestureHud kind={gestures.hud.kind} value={gestures.hud.value} />

      {isBuffering && !dragging && (
        <View style={styles.centerBuffering} pointerEvents="none">
          <ActivityIndicator color={Colors.text} size="large" />
        </View>
      )}

      {/*
        The back button is always visible AND interactive, regardless of
        `controlsVisible` — same reasoning as the live player: a tap landing
        on the video surface reaching this overlay's toggle isn't 100%
        guaranteed (expo-video's Android VideoView manually re-dispatches
        touch events), so the user must never be left with no way back.
        Only the title/extra buttons fade out; `pointerEvents="none"` on
        them (not the whole bar) keeps the back button tappable either way.
      */}
{/* No scrim — see the note in the live player. The viewer asked for no
          black gradients in the picture at all, controls up or not. */}

      {/*
        Both system bars follow the controls, the way a fullscreen video
        player does: picture only while watching, and the clock and the
        navigation buttons come back together with the transport row the
        moment the viewer asks for it.

        Not hidden for the player's whole life, which was the first version
        of this: with the controls up, the bar the viewer needs in order to
        leave was the one thing missing, and a clock is useful exactly when
        someone has stopped watching to press something.

        The video does **not** move when they toggle. Hiding the status bar
        takes `insets.top` to zero, so a `SafeAreaView` that padded for it
        would collapse and the picture would jump up and back on every tap.
        The top edge is therefore off the SafeAreaView in the host screens
        and applied as padding to the top bar alone — the same split already
        used at the bottom for the navigation bar.
      */}
      {/*
        Hidden for the player's whole life, not only while the controls are
        away — films and series as well as live channels. See the matching
        note in live/player/[channelId].tsx.
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

      <View style={[styles.topBar, layerPadding(Spacing.md)]} pointerEvents="box-none">
        <Focusable onPress={onBack} style={styles.iconButton} hitSlop={8} accessibilityLabel={t("common", "back")}>
          <BackChevron color={Colors.text} />
        </Focusable>
        <Text
          style={[styles.title, !controlsVisible && styles.hidden]}
          numberOfLines={1}
          pointerEvents="none"
        >
          {title}
        </Text>
        <View
          style={[styles.topRightExtras, !controlsVisible && styles.hidden]}
          pointerEvents={controlsVisible ? "box-none" : "none"}
        >
          {topRightExtras}
        </View>
      </View>

      {controlsVisible && (
        <>
          <View style={[styles.centerRow, layerPadding(0)]} pointerEvents="box-none">
            {/*
              Episode transport, outside the skip buttons.

              The order — previous episode, back 10s, play, forward 10s,
              next episode — puts the coarse jump outside the fine one on
              each side, so the two never get confused for one another.
              Rendered only for the series player; a film leaves the row at
              three controls (requested 2026-09-16, which expected forward
              and back alongside the skips and found neither).
            */}
            {hasEpisodeTransport && (
              <Focusable
                onPress={() => onPreviousEpisode?.()}
                style={[styles.episodeButton, !onPreviousEpisode && styles.episodeButtonDisabled]}
                disabled={!onPreviousEpisode}
                hitSlop={8}
              >
                <Text style={styles.episodeGlyph}>|◀</Text>
              </Focusable>
            )}
            <Focusable onPress={() => skip(-SKIP_SECONDS)} style={styles.skipButton} hitSlop={10}>
              <Text style={styles.skipButtonText}>‹‹ {SKIP_SECONDS}</Text>
            </Focusable>
            {/* Where the remote lands when the controls appear. */}
            {/* TV only — see the note in live/player/[channelId].tsx. */}
            <Focusable
              accessibilityLabel={t("livePlayer", isPlaying ? "pause" : "play")}
              onPress={togglePlayPause}
              style={styles.playButton}
              hitSlop={10}
              hasTVPreferredFocus={isTvBuild}
            >
              <Text style={styles.playButtonText}>{isPlaying ? "❙❙" : "▶"}</Text>
            </Focusable>
            <Focusable onPress={() => skip(SKIP_SECONDS)} style={styles.skipButton} hitSlop={10}>
              <Text style={styles.skipButtonText}>{SKIP_SECONDS} ››</Text>
            </Focusable>
            {hasEpisodeTransport && (
              <Focusable
                onPress={() => onNextEpisode?.()}
                style={[styles.episodeButton, !onNextEpisode && styles.episodeButtonDisabled]}
                disabled={!onNextEpisode}
                hitSlop={8}
              >
                <Text style={styles.episodeGlyph}>▶|</Text>
              </Focusable>
            )}
          </View>


          <View
            style={[styles.bottomBar, layerPadding(Spacing.md)]}
            pointerEvents="box-none"
          >
            <Text style={styles.timeText}>{formatTime(displayedTime)}</Text>
            <View
              style={styles.track}
              onLayout={(e) => {
                trackWidthRef.current = e.nativeEvent.layout.width;
              }}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              /*
                Without this, a drag is silently cancelled: the default
                answer to a termination request is "yes", so the Pressable
                wrapping the whole overlay could take the gesture back
                mid-scrub. The thumb kept following the finger (that is
                local state) but the release that actually seeks never
                fired, so the video stayed where it was — exactly the
                reported symptom.
              */
              onResponderTerminationRequest={() => false}
              onResponderGrant={onTrackGrant}
              onResponderMove={onTrackMove}
              onResponderRelease={onTrackRelease}
              /* A cancelled touch must not commit an unintended seek. */
              onResponderTerminate={() => {
                setDragging(false);
                showControlsTemporarily();
              }}
            >
              {/*
                pointerEvents="none" on all three: they are absolutely
                positioned over the track, so without it a touch landing on
                the fill or the thumb makes that child the event target and
                `locationX` is then measured from the child's own left edge
                instead of the track's.
              */}
              <View style={styles.trackBg} pointerEvents="none" />
              <View style={[styles.trackFill, { width: `${progressFraction * 100}%` }]} pointerEvents="none" />
              <View style={[styles.thumb, { left: `${progressFraction * 100}%` }]} pointerEvents="none" />
            </View>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlayTouchable: { ...StyleSheet.absoluteFill },
  dimLayer: { ...StyleSheet.absoluteFill, backgroundColor: "#000" },
  hidden: { opacity: 0 },

  centerBuffering: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },

  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    // All padding comes from `layerPadding` — see CONTROL_EDGE.
    paddingVertical: Spacing.md,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: Radii.pill,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonText: { color: Colors.text, fontSize: 20, fontFamily: FontFamily.bold },
  title: { flex: 1, color: Colors.text, fontSize: 14, fontFamily: FontFamily.bold },
  topRightExtras: { flexDirection: "row", gap: Spacing.sm },

  centerRow: {
    /* Same reasoning as `bottomBar`: back-skip stays on the left. */
    direction: "ltr",
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xxl,
  },
  skipButton: {
    width: 52,
    height: 52,
    borderRadius: Radii.pill,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  skipButtonText: { color: Colors.text, fontSize: 12, fontFamily: FontFamily.bold },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: Radii.pill,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  /** Matched to the play button's translucent fill, one size down. */
  episodeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  /** Still drawn, so the row keeps its shape at the ends of a series. */
  episodeButtonDisabled: { opacity: 0.35 },
  episodeGlyph: { color: "rgba(255,255,255,0.92)", fontSize: 15, fontFamily: FontFamily.bold },
    playButtonText: { color: "rgba(255,255,255,0.92)", fontSize: 26, fontFamily: FontFamily.bold },

  bottomBar: {
    /*
     * Pinned left-to-right whatever the interface language is.
     *
     * A media timeline is not text: time runs one way, and every control
     * built on it — the fill, the thumb, "‹‹ 10" and "10 ››", the drag
     * itself — reads from that direction. `forceRTL` mirrors the row, but
     * the track's internals are positioned with physical `left`, which does
     * not mirror; the result in Arabic was elapsed time on the right while
     * the bar filled from the left. Mirroring the whole thing instead would
     * be worse: dragging right would rewind. YouTube and Netflix keep their
     * timelines LTR in Arabic for the same reason.
     */
    direction: "ltr",
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    // All padding comes from `layerPadding` — see CONTROL_EDGE.
    paddingVertical: Spacing.md,
  },
  timeText: { color: Colors.text, fontSize: 11, fontFamily: FontFamily.medium, minWidth: 40, textAlign: "center" },
  track: { flex: 1, height: 36, justifyContent: "center" },
  trackBg: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  trackFill: { position: "absolute", left: 0, height: 3, borderRadius: 2, backgroundColor: Brand.primary },
  thumb: {
    position: "absolute",
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: Brand.primary,
    marginLeft: -THUMB_SIZE / 2,
  },
});
