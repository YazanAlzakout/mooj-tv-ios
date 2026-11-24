import type { VideoPlayer } from "expo-video";
import { useEffect, useRef, useState } from "react";
import type { GestureResponderEvent, LayoutChangeEvent } from "react-native";

export type GestureHudKind = "volume" | "dim" | null;

export interface UsePlayerGesturesResult {
  /** What the on-screen indicator should show right now; `kind: null` means nothing. */
  hud: { kind: GestureHudKind; value: number };
  /** 0 = untouched picture, up to DIM_MAX = dimmed. Render as a black overlay. */
  dim: number;
  /**
   * Whether the touch that just ended was a tap rather than a swipe.
   *
   * Call it from the tap surface's `onPress`: a `Pressable` fires `onPress`
   * for any release inside its bounds, however far the finger travelled, and
   * a full-screen surface is never left. Without this a swipe toggles the
   * controls.
   */
  isTap: () => boolean;
  /** Put this on the gesture surface so the midline is measured, not guessed. */
  onLayout: (event: LayoutChangeEvent) => void;
  /** The measured surface width, for callers that need their own midline. */
  width: () => number;
  handlers: {
    onStartShouldSetResponderCapture: (event: GestureResponderEvent) => boolean;
    onMoveShouldSetResponder: (event: GestureResponderEvent) => boolean;
    onResponderTerminationRequest: () => boolean;
    onResponderGrant: (event: GestureResponderEvent) => void;
    onResponderMove: (event: GestureResponderEvent) => void;
    onResponderRelease: () => void;
    onResponderTerminate: () => void;
  };
}

/**
 * Fraction of the screen height that a full sweep of the slider covers.
 *
 * 0.35, down from 0.6. The finger does not start at the edge of the screen —
 * it starts wherever it happened to land, usually around the middle — so the
 * travel actually available in one movement is closer to half the height, not
 * all of it. At 0.6 a full 100% to 0 needed more room than that, and the
 * viewer ran out of screen and had to lift and swipe again: "انا احتاج حتى
 * انزل من 100 % الى 0 مرتين سحب لان الشاشة تخلص" (2026-09-16).
 *
 * At 0.35 the whole scale is about 138dp of travel on this phone's 393dp
 * landscape height, which is comfortably inside a single thumb sweep started
 * from the middle, while still being far enough that a small accidental
 * movement only nudges the level.
 */
const SWIPE_RANGE = 0.35;
const HUD_HIDE_MS = 900;
/** Never dim to fully black — the user must always be able to swipe back. */
const DIM_MAX = 0.85;

/**
 * How far the finger must travel before the gesture is taken — a dead zone
 * against the drift of a resting hand and the roll of a thumb during a tap.
 */
const MIN_TRAVEL = 14;

/**
 * How much more vertical than horizontal the travel must be.
 *
 * This ratio is the whole defence, and it replaced a 1.8-second hold that
 * was tried first and asked for itself: a deliberate press before every
 * volume change turned out to be worse than the accident it prevented
 * (2026-09-16 — "no need to press long to activate the feature"). The hold
 * was never what kept a horizontal swipe out anyway; the direction test is.
 *
 * 1.5 is about 56° from horizontal. A plain `dy > dx` would accept anything
 * past 45°, which a fast swipe across the picture can cross on the way; at
 * this angle the finger is unmistakably going up or down, and a volume
 * change still starts the moment it does.
 */
const VERTICAL_RATIO = 1.5;

/**
 * How far a finger may move and still count as a tap.
 *
 * The tap surface under this hook is a full-screen `Pressable`, and
 * Pressability's press rect is the view's bounds plus a small margin — which
 * a full-screen view cannot be left. So every touch that did not arm this
 * gesture was released as a tap, and a swipe across the picture toggled the
 * controls: the one thing a horizontal swipe was explicitly asked not to do.
 * Screens report their own travel through `isTap()`.
 *
 * These are density-independent points, not pixels — React Native reports
 * `pageX`/`pageY` in dp — so 20 is two and a half times Android's own 8dp
 * touch slop. Deliberately conservative: a finger that rolls on a video
 * surface travels further than one on a button, and the cost of being
 * generous here is only that a very short swipe also toggles the controls.
 */
const TAP_SLOP = 20;

/**
 * Traces the whole gesture path to logcat. **One line to turn off.**
 *
 * This exists because three separate rounds of diagnosing this gesture were
 * done blind, each costing a full native rebuild, and the one round that had
 * a log attached is the round that found the answer. `console.log` survives
 * this project's release builds — there is no `transform-remove-console` and
 * `babel.config.js` runs only the worklets plugin — so a release APK can be
 * read with:
 *
 *     adb logcat -s ReactNativeJS
 *
 * It prints the claim, the geometry it was decided from, every value written
 * or skipped, and what the player reports back. Between them those answer
 * every question that has come up so far: whether the gesture is taken at
 * all, which half it landed on, whether the surface was measured, whether a
 * value was throttled away, and whether the player kept what it was given.
 *
 * Set to false once the gesture is confirmed on the device. Leave the code.
 */
const GESTURE_DEBUG = false;

function trace(message: string): void {
  if (!GESTURE_DEBUG) return;
  console.log(`[gesture] ${message}`);
}

/**
 * The shortest gap between two volume writes during a drag.
 *
 * Measured on the device 2026-09-16: a single `player.volume` write turns
 * into roughly a hundred `AudioTrack.setVolume` calls, because this
 * device's audio layer fades to a new gain in small steps instead of
 * jumping. Writing on every visible percent meant about sixty writes per
 * drag, so the fades overlapped and fought each other — 6,607 gain changes
 * in one second, and the level ended up wherever the last unfinished fade
 * happened to be. The second the finger lifted, the rate fell to zero,
 * which is how we know the storm was ours to stop.
 *
 * At 60ms a drag writes about sixteen times a second: fine enough that the
 * sound follows the finger, coarse enough that each fade finishes before
 * the next begins.
 */
const VOLUME_WRITE_INTERVAL_MS = 60;

/**
 * When the volume is re-asserted after the finger lifts, in milliseconds.
 *
 * expo-video's own audio-focus manager fights us for this property. On a
 * focus duck it runs `player.volume /= 2f`
 * (`AudioFocusManager.kt:202-208`), and on the way back it restores
 * `player.userVolume` — which every volume write also overwrites
 * (`VideoPlayer.kt:142`). So a duck/unduck cycle can leave the gain
 * halved, or restored to a level from an earlier drag. That is visible in
 * the diagnostic: writing 0.532 and reading back 0.419, then writing 0.510
 * and reading back 0.872, values this drag never asked for. On top of that,
 * `onVolumeChanged` mirrors any external change straight back into the
 * property (`VideoPlayer.kt:328-332`), so we cannot simply hold a value
 * and trust it.
 *
 * What we can do is have the last word. The churn settles within a moment
 * of the gesture ending, so the level the viewer chose is written again
 * after it does. Two passes, because a single one can land inside the
 * settling window.
 */
const VOLUME_REASSERT_MS = [180, 600];

/**
 * Vertical swipe controls: dragging on the right half of the picture
 * changes volume, on the left half it dims.
 *
 * Dimming is an in-app overlay rather than the device backlight on
 * purpose: system brightness needs a native module (`expo-brightness`) and
 * therefore a full rebuild, and it leaks outside the app — it would still
 * be dark after the user leaves. An overlay gives the same night-viewing
 * benefit, is undone the moment playback ends, and costs no dependency.
 *
 * ## How the gesture is claimed, and why it is claimed this way
 *
 * Three different touches land on the same surface and only one of them
 * belongs here:
 *
 *   - a tap, which shows or hides the controls,
 *   - a swipe across the picture, which must do nothing at all,
 *   - a vertical drag, which is this.
 *
 * `onStartShouldSetResponderCapture` returns **false**. It exists only to
 * see the touch go down — the capture phase runs parent-first, so it fires
 * before the tap `Pressable` underneath claims the touch, and returning
 * false lets that claim go through. Taps therefore keep working without
 * this hook being involved in them at all.
 *
 * `onMoveShouldSetResponder` is then the single decision point, and it
 * takes the gesture only when all three hold:
 *
 *   1. the finger has travelled at least `MIN_TRAVEL` from where it landed,
 *   2. and that travel is at least `VERTICAL_RATIO` times more vertical
 *      than horizontal.
 *
 * Claiming from here rather than at touch-down is what lets a child keep
 * the touch until the moment this becomes interested: React Native's
 * responder negotiation lets an ancestor take over on move, and the
 * `Pressable` underneath yields it, so its `onPress` never fires for a drag
 * that turned into this.
 *
 * Travel is always measured from where the finger landed, so a swipe that
 * runs along the picture can never accumulate its way into a claim: its
 * `dx` grows and its `dy` does not.
 */
export function usePlayerGestures(
  player: VideoPlayer,
  enabled: boolean,
  /** Called when a volume drag begins — the live player clears mute here. */
  onVolumeGesture?: () => void
): UsePlayerGesturesResult {
  const [hud, setHud] = useState<{ kind: GestureHudKind; value: number }>({ kind: null, value: 0 });
  const [dim, setDim] = useState(0);

  const startYRef = useRef(0);
  const startValueRef = useRef(0);
  /**
   * The volume this hook last asked for, which is not the same thing as
   * `player.volume`.
   *
   * Measured on the device 2026-09-16 while a mono 64kbps channel played:
   * something inside the process was calling `AudioTrack.setVolume`
   * **~5,000 times a second** with non-monotonic values — eight different
   * ones inside a single millisecond — and `AudioFlinger` logged a `DAP`
   * (Dolby Audio Processing) effect being added to the chain. It was
   * provably not this hook: two of those seconds carried ~4,000 writes and
   * *zero* renders, while every write here is followed by `showHud`, which
   * re-renders. On the stereo 48kHz channel that followed, the writes
   * stopped entirely.
   *
   * The consequence for us is that `player.volume` is not a safe place to
   * read our own value back from: on such a stream it holds whatever wrote
   * to the track last, not what the viewer asked for. Reading it at the
   * start of a drag made the drag begin from a stranger's number, so the
   * level appeared not to respond at all ("ما عم يتغير مستوى الصوت"). The
   * hook now keeps its own figure and only ever writes outward.
   *
   * Starts at 1, `VideoPlayer`'s documented default, and is deliberately
   * not written to the player on mount — an unasked-for volume write at
   * startup would be its own bug.
   */
  const volumeRef = useRef(1);
  /** The dim level last pushed to React, so a move that changes nothing costs nothing. */
  const dimPercentRef = useRef(1);
  const kindRef = useRef<GestureHudKind>(null);
  /** When the last volume write went out, for the throttle. */
  const lastVolumeWriteRef = useRef(0);
  /** Timers that re-assert the chosen level after the gesture ends. */
  const reassertTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dimRef = useRef(0);

  /** Where the touch went down — the reference for both travel tests. */
  const downPointRef = useRef({ x: 0, y: 0 });
  /** The furthest this touch has been from where it started. */
  const maxTravelRef = useRef(0);
  /**
   * The surface's own size.
   *
   * Measured rather than read from `Dimensions.get("window")`: on Android
   * `window` comes from resource metrics, which exclude the navigation bar
   * — so in three-button landscape, where this device puts the bar down the
   * left edge at 105px, the midline between "volume" and "dim" sat 52px
   * left of the physical centre of a surface that is drawn edge to edge.
   * The seek bar already measures its own track for the same reason.
   */
  const sizeRef = useRef({ width: 0, height: 0 });

  /* The HUD's own hide timer, cancelled if the screen goes away first. */
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      for (const timer of reassertTimersRef.current) clearTimeout(timer);
      reassertTimersRef.current = [];
    };
  }, []);

  function showHud(kind: GestureHudKind, value: number) {
    setHud({ kind, value });
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setHud({ kind: null, value: 0 }), HUD_HIDE_MS);
  }

  return {
    hud,
    dim,
    isTap: () => maxTravelRef.current <= TAP_SLOP,
    width: () => sizeRef.current.width,
    onLayout: (event) => {
      const { width, height } = event.nativeEvent.layout;
      sizeRef.current = { width, height };
    },
    handlers: {
      /* Observes the touch going down without taking it — see the note above. */
      onStartShouldSetResponderCapture: (event) => {
        const { pageX, pageY } = event.nativeEvent;
        downPointRef.current = { x: pageX, y: pageY };
        maxTravelRef.current = 0;
        return false;
      },
      onMoveShouldSetResponder: (event) => {
        /*
          One finger only. A second touch reaches the capture handler too and
          overwrites the point travel is measured from, so with two fingers
          on the picture the distance between them reads as travel and either
          one can start a drag nobody asked for.
        */
        const touches = event.nativeEvent.touches;
        if (touches && touches.length > 1) return false;

        const { pageX, pageY } = event.nativeEvent;

        /*
          Recorded for every move, armed or not, claimed or not — this is
          what `isTap()` reads, and it has to be true even for the touches
          this hook declines.
        */
        const travelX = pageX - downPointRef.current.x;
        const travelY = pageY - downPointRef.current.y;
        maxTravelRef.current = Math.max(
          maxTravelRef.current,
          Math.sqrt(travelX * travelX + travelY * travelY)
        );

        if (!enabled) return false;

        const dx = Math.abs(travelX);
        const dy = Math.abs(travelY);
        if (dy < MIN_TRAVEL) return false;
        return dy > dx * VERTICAL_RATIO;
      },
      onResponderTerminationRequest: () => false,
      onResponderGrant: (event) => {
        const { pageX, pageY } = event.nativeEvent;
        const isVolume = pageX > sizeRef.current.width / 2;
        trace(
          `grant ${isVolume ? "volume" : "dim"} pageX=${Math.round(pageX)} ` +
            `surface=${Math.round(sizeRef.current.width)}x${Math.round(sizeRef.current.height)} ` +
            `from=${(isVolume ? volumeRef.current : 1 - dimRef.current / DIM_MAX).toFixed(3)}`
        );
        kindRef.current = isVolume ? "volume" : "dim";
        startYRef.current = pageY;
        // Brightness runs inverted: swiping up must brighten, so the slider
        // tracks "how lit the picture is", not "how much black is on top".
        // `volumeRef`, never `player.volume` — see the ref's own note.
        startValueRef.current = isVolume ? volumeRef.current : 1 - dimRef.current / DIM_MAX;
      },
      onResponderMove: (event) => {
        if (kindRef.current === null) return;
        const { height } = sizeRef.current;

        /*
          Every input checked for being a finite number before it can reach
          the player.

          This is not defensive decoration; it is the shape of a bug that
          was measured on the device on 2026-09-16. The indicator moved and
          read 0%, the sound stayed at full volume, and over fifty seconds
          of dragging the audio track received five volume writes — all of
          them exactly `1.000000`, i.e. none of ours. Meanwhile
          `player.muted` worked perfectly from the same player object, in
          the same session, which rules out the native bridge, the shared
          object and the module registration.

          What survives that evidence is a value the native side accepts
          and then drops. `Math.min(1, Math.max(0, NaN))` is `NaN`, and
          `IgnoreSameSet` (verified in expo-video's own source) compares
          with `equals`, so `NaN` never equals the stored value and the
          write is always forwarded — into `ExoPlayer.setVolume(NaN)`,
          which changes no gain and logs nothing. A `NaN` percentage also
          renders as an empty bar, which is exactly the "0" that was
          reported.

          `NaN` can enter from three places, so all three are closed:
          `height` zero (division), `pageY` absent, and a `startValue` that
          was itself poisoned by an earlier round.
        */
        if (!(height > 0)) return;

        const pageY = event.nativeEvent.pageY;
        if (!Number.isFinite(pageY)) return;

        const delta = (startYRef.current - pageY) / (height * SWIPE_RANGE);
        if (!Number.isFinite(delta)) return;

        const base = Number.isFinite(startValueRef.current) ? startValueRef.current : 1;
        const next = Math.min(1, Math.max(0, base + delta));
        if (!Number.isFinite(next)) return;

        if (kindRef.current === "volume") {
          /*
            Unmuting is part of asking for volume.

            Mute and volume are two separate properties on the native
            player and nothing connected them: swiping up while muted took
            the indicator to 100% over complete silence, with the Mute chip
            still offering to unmute. Routed through the caller rather than
            written here, so whichever hook owns the mute state stays the
            one that knows it.
          */
          onVolumeGesture?.();

          /*
            The indicator follows every step; the player does not.

            The readout is drawn to the nearest whole percent, so a move
            that does not change that percent has nothing to say to either.
            But even one write per percent was far too many for this
            device's audio layer — see `VOLUME_WRITE_INTERVAL_MS` — so the
            level the viewer sees updates freely while the native write is
            throttled, and the value they settled on is written once more
            after the gesture ends.
          */
          if (Math.round(next * 100) === Math.round(volumeRef.current * 100)) return;
          volumeRef.current = next;
          showHud("volume", next);

          const now = Date.now();
          if (now - lastVolumeWriteRef.current < VOLUME_WRITE_INTERVAL_MS) {
            trace(`hud=${Math.round(next * 100)}% (write throttled)`);
            return;
          }
          lastVolumeWriteRef.current = now;

          // eslint-disable-next-line react-hooks/immutability -- native player property setter, same reasoning as useWatchProgress.ts.
          player.volume = next;
          trace(`set=${next.toFixed(3)} readback=${String(player.volume)} muted=${String(player.muted)}`);
        } else {
          /*
            The same early return the volume branch makes above, and for the
            same reason — it was simply never written here.

            `setDim` and `showHud` are React state read by the fullscreen
            player, and nothing in that subtree is memoised, so every move
            event re-rendered the whole screen while a video was decoding.
            A finger crossing the screen produces move events far faster
            than the dim can visibly change: at `DIM_MAX` the overlay has
            about a hundred distinguishable steps, and a drag fires several
            hundred events. Rounding to the percent the viewer can actually
            see drops the great majority of those renders and changes
            nothing about how the gesture looks.
          */
          if (Math.round(next * 100) === Math.round(dimPercentRef.current * 100)) return;
          dimPercentRef.current = next;
          const nextDim = (1 - next) * DIM_MAX;
          trace(`dim=${Math.round(next * 100)}%`);
          dimRef.current = nextDim;
          setDim(nextDim);
          showHud("dim", next);
        }
      },
      onResponderRelease: () => {
        /*
          The level the viewer let go on is written again, twice, after the
          focus churn this gesture provokes has settled — see
          `VOLUME_REASSERT_MS`. Without this the last thing to touch the
          gain is expo-video's duck/unduck, not the viewer.
        */
        if (kindRef.current === "volume") {
          const target = volumeRef.current;
          for (const timer of reassertTimersRef.current) clearTimeout(timer);
          reassertTimersRef.current = VOLUME_REASSERT_MS.map((delay) =>
            setTimeout(() => {
              if (!Number.isFinite(target)) return;
              player.volume = target;
              trace(`reassert=${target.toFixed(3)} readback=${String(player.volume)}`);
            }, delay)
          );
        }
        kindRef.current = null;
      },
      onResponderTerminate: () => {
        kindRef.current = null;
      },
    },
  };
}
