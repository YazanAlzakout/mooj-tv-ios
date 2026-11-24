import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { BottomTabBarProps } from "expo-router/js-tabs";

import { Focusable } from "@/components/Focusable";
import {
  HomeGlyph,
  LiveGlyph,
  MoreGlyph,
  MoviesGlyph,
  SeriesGlyph,
} from "@/components/TabIcons";

import { useTapFeedback } from "@/core/feedback/useTapFeedback";
import { isTvBuild } from "@/core/platform/isTvBuild";
import { SECTION_DISC, SECTION_FALLBACK } from "@/core/theme/sections";
import type { ThemeColors } from "@/core/theme/palettes";
import { themeColors, useThemeRerender } from "@/core/theme/themedStyles";
import { TVSafeArea } from "@/core/theme/tokens";

/**
 * The bottom bar: a shelf across the foot of the screen with a round hole in
 * it, and the active tab's icon climbing out of that hole on a coloured disc.
 *
 * ## It is flush, not floating
 *
 * Owner's instruction, 2026-11-17: "ما بدي اياها طافية بكل الاوضاع / لزقلي
 * اياها تحت / وعلى اليمين واليسار خليها ملتصقة". So the bar runs edge to edge
 * and its fill reaches the very bottom of the screen; only the row of icons is
 * held in off the edges — off the gesture area by the bottom inset, and off the
 * television's overscan by `TV_INSET_X`/`TV_INSET_Y`, which are zero on the
 * phone.
 *
 * That also settled a geometry problem the floating version could not solve.
 * A floating capsule has a rounded end at each side, and the hole — which is
 * 70dp across — has to travel to within 45dp of one of those ends to sit under
 * the first tab. Measured on the device on 2026-11-17: at the Home tab the
 * hole ate the whole left cap, and 92dp of the bar's top edge simply was not
 * drawn. The approved design (designs/nav-final.html) had hit the same thing
 * and answered it by holding the row of icons well in from the ends; that
 * answer was lost when ROW_PAD came down from 38 to 12 to fix the icons being
 * too far apart and too far from the screen edge.
 *
 * Flush, there is no cap to protect: the bar's only corners are its top two,
 * they are small (TOP_RADIUS), and the hole at the first tab stops 3.6dp short
 * of where the left one ends. The row can stay wide and near the edges, which
 * is what the owner asked for in the first place.
 *
 * ## The hole is a real hole
 *
 * Three pieces: a plain View left of the hole, a plain View right of it, and
 * between them `assets/images/bar-fill.png` — the bar WITH the bite taken out,
 * opaque everywhere except inside the circle. Nothing is painted across the
 * gap, so what shows in it is whatever is behind the bar.
 *
 * What makes that a hole rather than a patch is `styles.shell` being absolute:
 * the navigator lays a custom tabBar out as the last flex child beside the
 * screen container, so an ordinary bar reserves a band of height and the
 * screens stop above it — and the gap then reveals the page colour, a white
 * rectangle on the light theme and a black one on the dark. Absolute, the bar
 * takes no height at all, the screens run the full window and pass underneath,
 * and the hole shows the poster or the list that is there.
 *
 * The three pieces overlap by one each, because two edges that merely touch
 * can open a hairline of background while they travel.
 *
 * ## No mask, no path renderer
 *
 * The bite is baked into the PNG at 4x, drawn white so `tintColor` can paint
 * it the bar's fill. React Native has no clip-path, no mask and no path
 * renderer, and adding a native one for a 2KB asset is the trade ArtScrim
 * already refused once.
 *
 * ## The colours are the app's wayfinding
 *
 * The disc wears its section's colour, and those are the same three the home
 * screen's cards wear. Keep the two in step: that correspondence is the whole
 * reason the bar can answer "where am I" without a word being read.
 *
 * ## No labels
 *
 * Five glyphs across a phone leave no room for Arabic ones at a legible size,
 * and the active one is in the disc anyway. Every item carries an
 * `accessibilityLabel`, so a screen reader announces the same words.
 */

/** The glyph for each route, by file name. Anything unlisted gets the dots. */
const GLYPHS: Record<string, typeof HomeGlyph> = {
  home: HomeGlyph,
  "live-categories": LiveGlyph,
  "movies-categories": MoviesGlyph,
  "series-categories": SeriesGlyph,
  more: MoreGlyph,
};

/** The shelf itself, not counting the bottom inset its fill also covers. */
const BAR_HEIGHT = 62;

/**
 * The disc, and the ring of daylight around it.
 *
 * Measured off the reference photo the owner sent rather than estimated: its
 * bar is 133 tall, its disc 121 across (91%), and the disc's centre sits 12
 * below the bar's top edge (9%). Scaled to this bar's 62: a 56 disc whose
 * centre is 6 below the edge.
 *
 * The ring of daylight around the disc is 7dp, and it lives in the sprite
 * rather than here: the hole IS this disc's circle grown by 7, which is how
 * the clearance comes out exactly even all the way round instead of being
 * solved for. 2026-11-17 the hole was a pair of cubic Beziers flaring to 102dp
 * at the bar's top edge; that flare is what ate the end of the bar, and it
 * bought nothing the ring does not.
 */
const LIFT_SIZE = 56;
const LIFT_RISE = 22;

/**
 * The sprite's width, which is wider than the hole on purpose.
 *
 * `assets/images/bar-fill.png` is 320 by 248 — 80 by 62 at 4x — white, with a
 * circle of radius 35 punched out of it centred 40 across and 6 down. That
 * leaves 5.5dp of opaque shoulder on each side at the bar's top edge, which is
 * what the one-dp overlap with the side pieces has to land in. A sprite cut to
 * the hole exactly would have no shoulder there and the overlap would paint a
 * sliver of fill back into the hole.
 */
const NOTCH_W = 80;

/**
 * How far the row of icons is held in from the screen's edges.
 *
 * Both of the owner's complaints about the old spacing pull the same way:
 * raising this pushes the first icon away from the edge AND squeezes the five
 * icons together, because what is left is what they divide. It came down from
 * 38 to 12 on both counts; at 16 on a full-width bar the icons are further
 * apart than they were at 12 on the inset one (73 against 66) and the first
 * one is nearer the edge (52 against 66), because the bar gained the 36dp it
 * used to give away to the float.
 */
const ROW_PAD = 16;

/**
 * What the television's overscan takes off the row of icons — nothing at all
 * on the phone.
 *
 * Added 2026-11-18. This bar is the TV build's only navigation, and it was the
 * one piece of the interface sitting outside the safe area every other screen
 * honours: `ScreenBackground` pads its children by `TVSafeArea` (96 across, 48
 * down), but the bar is not one of its children — the navigator mounts it
 * beside the screen container and `styles.shell` pins it to the window's own
 * bottom edge.
 *
 * The bottom is the part that actually disappears. The shelf is 62 tall and the
 * glyphs are centred in it, so they sat around 31dp above the physical bottom
 * edge — inside the 48dp band a set's bezel and its picture settings are free
 * to crop, which is to say the whole of the TV build's navigation could be
 * behind the frame of the set with nothing on screen to say where it went.
 * Across, 16dp from the edge is a thinner margin than the 96 the rest of the
 * app keeps rather than a certain loss, but it is the same band for the same
 * reason, so it moves with it.
 *
 * This does **not** undo the flush layout the owner asked for ("ما بدي اياها
 * طافية بكل الاوضاع / لزقلي اياها تحت / وعلى اليمين واليسار خليها ملتصقة",
 * 2026-11-17). The bar's *fill* still runs edge to edge and still reaches the
 * very bottom of the screen: `styles.skirt` paints the whole band below the
 * shelf, exactly as it already does for a gesture phone's bottom inset. What
 * moves is the row of icons, and only on the box — this is the same mechanism
 * the phone already uses, with a second number added to it.
 *
 * Phone-neutral by construction: both are literally `0` off the TV build, so
 * every measurement in the comments above still describes the phone.
 */
const TV_INSET_X = isTvBuild ? TVSafeArea.horizontal : 0;
const TV_INSET_Y = isTvBuild ? TVSafeArea.vertical : 0;

/**
 * The bar's top corners. Its bottom ones do not exist — it is flush.
 *
 * Small enough that the hole clears it: at the first tab the hole's left edge
 * sits at 17.6dp and this corner is done by 14dp, so there is 3.6dp between
 * them. Raising this eats that margin, and past about 17 the hole starts
 * biting the corner again — which is the whole defect this layout fixed.
 */
const TOP_RADIUS = 14;

/**
 * How much room a scrolling tab screen must leave at its bottom so its last
 * row is not hidden under the bar.
 *
 * The bar's fill covers BAR_HEIGHT plus the bottom inset, and the screens run
 * underneath all of it, so that sum is the number. Derived rather than a
 * constant: the inset is 0 on this phone and 30 to 54 on a gesture-navigation
 * one, and the 22 that was once guessed is neither.
 *
 * `TV_INSET_Y` is deliberately **not** added, and that is not an oversight.
 * The fill does cover it on the box — but every screen that asks for this
 * number is wrapped in `ScreenBackground`, whose overscan padding has already
 * held that screen's content 48dp off the bottom of the window. The icon row
 * now starts exactly where that content ends, so BAR_HEIGHT is the whole of
 * the overlap. Adding the inset here would pad for it twice; before
 * 2026-11-18 the row sat in the overscan band and this number was 48 too
 * generous instead.
 *
 * Not `tabBarStyle`: React Navigation ignores that option entirely when a
 * custom `tabBar` component is supplied, so setting it there changed nothing
 * at all while five screens were given padding for a float that was not
 * happening.
 */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return BAR_HEIGHT + insets.bottom;
}

/** How long the hole and the disc take to cross. */
const TRAVEL_MS = 300;

export function MoojTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const theme = useThemeRerender();
  const C = themeColors();
  const { width: windowWidth } = useWindowDimensions();

  /**
   * The bar's own fill.
   *
   * Light: #DEE7EC, and the number that matters is how far it is from the page
   * rather than what hue it is. #EDEFF4 and then `C.surface` (#F3F4F6) both sat
   * 9 to 12 parts below #FFFFFF — a bar that pale has no edge of its own and
   * reads as a smudge rather than a shelf, which is what the owner kept
   * rejecting ("باللايت مود مو حلو لون البار تحت"). This sits 19 to 33 parts
   * below it, roughly three times the step, and leans cool so it belongs to the
   * same family as the dark theme's bar rather than being a dead grey.
   *
   * It is as dark as it can go: the inactive glyph is `C.textMuted` (#687076),
   * which is 4.0 to 1 here — comfortably over the 3:1 a glyph needs — and the
   * Live disc, the weakest of the five against it, is 3.5. A few parts darker
   * and that one drops under 3.
   *
   * Dark: a literal, and that is not an oversight. `C.surface` there is
   * #12121A against a #0A0A0F page — eight parts in 255, which is the step that
   * made the hole impossible to see at all. #151B26 is the smallest step that
   * reads. The first attempt went to #1C2432 and the bar popped so hard that
   * everything around it looked like a black band.
   */
  const dark = theme === "dark";
  const barFill = dark ? "#151B26" : "#DEE7EC";

  const count = state.routes.length;
  const [barWidth, setBarWidth] = useState(0);
  /**
   * The bar's width before it has measured itself.
   *
   * It is flush to both edges, so this is not a guess — it is the window, which
   * is known a frame before `onLayout` arrives. That frame matters: without it
   * the first painted frame of every cold mount had the left piece at zero
   * width, the sprite translated clean off the left edge and the disc hanging
   * half off the screen.
   */
  const measured = barWidth > 0 ? barWidth : windowWidth;
  /*
   * The icons clear a display cutout in landscape — and the television's
   * overscan; the fill behind them does not, because a bar that stops short of
   * the corner is exactly what the owner asked not to have.
   */
  const padLeft = ROW_PAD + insets.left + TV_INSET_X;
  const padRight = ROW_PAD + insets.right + TV_INSET_X;
  const itemWidth = measured > 0 ? Math.max(0, measured - padLeft - padRight) / count : 0;
  const centre = padLeft + itemWidth * (state.index + 0.5);

  const slide = useSharedValue(centre);

  /* The tick and the haptic, shared with the More list and Settings. */
  const tap = useTapFeedback();

  /**
   * The width the hole was last placed against.
   *
   * Without it, rotating the phone made the hole travel. The spring below is
   * driven by the tab's centre, and turning the phone changes that centre
   * without changing the tab — so the hole set off across the bar to the same
   * tab's new position, an animation nobody asked for, every single rotation.
   *
   * A spring is for a tab the viewer pressed. A new geometry is not an event;
   * the hole belongs wherever the layout now puts it, at once. It starts at the
   * width the first render was built from, so the real measurement agreeing
   * with that is a no-op rather than a jump.
   */
  const placedAt = useRef(itemWidth);

  useEffect(() => {
    if (itemWidth === 0) return;
    if (placedAt.current !== itemWidth) {
      placedAt.current = itemWidth;
      slide.value = centre;
      return;
    }
    /*
     * It overshoots and comes back. The design's own curve does
     * (cubic-bezier(.34,1.4,.5,1) passes 1 before it settles), and that
     * overshoot is most of what makes the disc read as a thing with weight
     * rather than a sprite being moved. `dampingRatio` below 1 is what gives
     * it; `duration` and `dampingRatio` are the Reanimated 4 pair, and the
     * version-2 keys are ignored in silence.
     */
    slide.value = withSpring(centre, { duration: TRAVEL_MS, dampingRatio: 0.88 });
    // `slide` is a shared value and never changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.index, itemWidth, centre]);

  const notchStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value - NOTCH_W / 2 }],
  }));
  const leftStyle = useAnimatedStyle(() => ({
    left: 0,
    width: Math.max(0, slide.value - NOTCH_W / 2 + 1),
  }));
  const rightStyle = useAnimatedStyle(() => ({
    left: slide.value + NOTCH_W / 2 - 1,
    right: 0,
  }));
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value - LIFT_SIZE / 2 }],
  }));

  const press = useCallback(
    (index: number) => {
      const route = state.routes[index];
      const focused = state.index === index;

      /*
       * Feedback first, navigation second. Both are cheap, but the tick is
       * what makes the press feel acknowledged, and firing it after a
       * navigation that remounts a screen puts it on the far side of that
       * work.
       */
      tap();

      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }
    },
    [tap, navigation, state.index, state.routes]
  );

  const worn = state.routes[state.index];
  const ActiveGlyph = GLYPHS[worn.name] ?? MoreGlyph;
  const activeColours = SECTION_DISC[worn.name] ?? SECTION_FALLBACK;

  return (
    <View style={styles.shell}>
      <View
        style={[
          styles.bar,
          {
            height: BAR_HEIGHT + insets.bottom + TV_INSET_Y,
            /* The fill covers the gesture area — and the television's bottom
               overscan; the icons sit above both. */
            paddingBottom: insets.bottom + TV_INSET_Y,
            paddingLeft: padLeft,
            paddingRight: padRight,
          },
        ]}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      >
        {itemWidth > 0 && (
          <View style={styles.clip} pointerEvents="none">
            {/* Below the shelf: the band the bottom inset takes — plus the
                television's bottom overscan — which has no hole in it and so
                needs no sprite. */}
            <View style={[styles.skirt, { backgroundColor: barFill }]} />
            <Animated.View style={[styles.sidePiece, { backgroundColor: barFill }, leftStyle]} />
            <Animated.Image
              source={require("../../assets/images/bar-fill.png")}
              resizeMode="stretch"
              fadeDuration={0}
              style={[styles.middle, { tintColor: barFill }, notchStyle]}
            />
            <Animated.View style={[styles.sidePiece, { backgroundColor: barFill }, rightStyle]} />
          </View>
        )}

        {state.routes.map((route, index) => {
          const Glyph = GLYPHS[route.name] ?? MoreGlyph;
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          return (
            <Focusable
              key={route.key}
              onPress={() => press(index)}
              style={styles.item}
              /* A tab, not a button. `Focusable` announced everything it
                 wrapped as a button until 2026-11-18, which left a screen
                 reader with five buttons and no way to say which section was
                 open — the `selected` state below only means anything paired
                 with this role. */
              accessibilityRole="tab"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.title ?? route.name}
            >
              {/*
                The active tab's own glyph steps aside rather than being
                removed: the disc above is carrying it, and two of the same
                icon a few pixels apart reads as a rendering fault.

                `focused={false}` even for the active tab: its glyph is painted
                `transparent` because the disc has it, but the movies glyph
                draws its play mark in a hard-coded black that a transparent
                `color` does not reach — so the filled state leaked a black
                triangle into an otherwise invisible icon.
              */}
              <Glyph color={focused ? "transparent" : C.textMuted} size={23} focused={false} />
            </Focusable>
          );
        })}

        {itemWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[styles.lift, { backgroundColor: activeColours.disc }, liftStyle]}
          >
            <ActiveGlyph color={activeColours.ink} size={22} focused />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    /*
     * Absolute, and that one word is what makes the hole a hole.
     *
     * The navigator lays a custom tab bar out as the last flex child beside the
     * screen container, so an ordinary bar takes a band of height and the
     * screens stop above it — nothing behind the bar, nothing to show through
     * its hole. Absolute, it takes no height at all: the screens run the full
     * window and pass under it, and the bar paints over them.
     *
     * The screens get that band back as padding instead, from
     * `useTabBarSpace()`, so their last row still clears the bar.
     */
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    /*
     * No border, and no background.
     *
     * 2026-11-17 a rewrite dropped the inline `borderColor` and left
     * `borderWidth: 1` behind, and Android defaults an uncoloured border to
     * opaque black — a hard ring round the bar on the light theme, invisible on
     * the dark one, which is why a dark-mode check would miss it. The pieces
     * inside carry the shape; a fill here would fill the hole straight back in.
     *
     * Visible overflow, not hidden: the disc climbs out of the bar and has to
     * be drawn above its top edge.
     */
    overflow: "visible",
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", height: "100%" },

  /**
   * What rounds the bar's top corners, and what keeps the sprite inside them.
   *
   * Insets rather than percentages: a percentage on an absolutely positioned
   * child resolves against the parent's CONTENT box, which here excludes the
   * row's own horizontal padding and the bottom inset, so the painted bar came
   * out narrower and shorter than the bar it lives in. With all four insets
   * given, Yoga sizes the child from the parent's full border box instead.
   */
  clip: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: TOP_RADIUS,
    borderTopRightRadius: TOP_RADIUS,
    overflow: "hidden",
    /*
     * Below the buttons, not above them. It is the first child, so document
     * order already puts it underneath — but it used to carry `zIndex: 1`,
     * which beat that order and painted the bar's own fill over all five
     * icons. They vanished completely on the device.
     */
    zIndex: 0,
  },
  /* The band under the shelf — the gesture area on a phone, the bottom
     overscan on the box, and both at once in principle. No hole reaches it:
     the hole's lowest point is 41dp down and the shelf is 62 tall. */
  skirt: { position: "absolute", left: 0, right: 0, top: BAR_HEIGHT, bottom: 0 },
  /* The two flat pieces. Top and bottom rather than a height, so they agree
     with the sprite exactly whatever the bar's box turns out to be. */
  sidePiece: { position: "absolute", top: 0, bottom: 0 },
  /**
   * An explicit width and height, not insets.
   *
   * 2026-11-17, seen on the device: with only position props this Image laid
   * out and did not paint, so the bar came out as two separate blobs with a gap
   * where the sprite should be. Exactly the defect the home screen's card scrim
   * hit the same day. The height is the shelf alone — stretching the sprite
   * over the bottom inset as well would stretch the hole with it.
   */
  middle: { position: "absolute", left: 0, top: 0, width: NOTCH_W, height: BAR_HEIGHT },
  lift: {
    position: "absolute",
    left: 0,
    top: -LIFT_RISE,
    width: LIFT_SIZE,
    height: LIFT_SIZE,
    borderRadius: LIFT_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
    /*
     * No border, and no shadow.
     *
     * The light theme's Home disc used to be invisible — #E6EEF5 on a white
     * page, about 1.1 to 1 — and a hairline round every disc was the first
     * patch for it. The colour was the actual fault, so it was fixed at the
     * colour: `sectionDisc()` hands Home a dark neutral on the light theme. A
     * border here would have had to be given a colour of its own too, or
     * Android paints it opaque black, which is the bug three styles up.
     *
     * The shadow is a separate correction. The design's is a CSS `box-shadow` —
     * wide, soft, offset down. React Native has no such thing on Android:
     * `shadowRadius` and friends are iOS, and `elevation` draws its own hard,
     * round, opaque shadow. Against this app's near-black ground that read as a
     * black disc under a coloured one.
     */
  },
});

/** Kept out of the component: the palette type is only needed for the cast above. */
export type { ThemeColors };
