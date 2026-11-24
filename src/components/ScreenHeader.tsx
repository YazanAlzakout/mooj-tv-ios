import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { FontFamily, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";

import { BackButton } from "./BackButton";

/**
 * Shared screen header: circular back button, centered title with optional
 * subtitle, and an optional right-hand slot. Every stack screen used to
 * hand-roll this row with slightly different paddings and a text "‹ Back";
 * one component keeps them identical and gives the back button a real
 * touch target instead of a bare text label.
 */
export function ScreenHeader({
  title,
  subtitle,
  right,
  onBack,
  showBack = true,
  badge,
}: {
  title: string;
  subtitle?: string;
  /**
   * The section's own mark, in the section's own colour, before the title.
   *
   * 2026-11-17: the approved Movies, Series and Channels screens all open with
   * a small coloured tile carrying the section's glyph, and the subtitle under
   * the title is the same sentence that section's card wears on the home
   * screen. That pairing is the point — the card and the screen are two halves
   * of one thing, and the colour is what says so.
   */
  badge?: { colour: string; glyph: ReactNode };
  /**
   * False on a screen that is a tab.
   *
   * A back button offers to undo a journey, and a tab is not one: there is
   * nothing behind it, so pressing it leaves the app or lands somewhere
   * arbitrary. It also takes the first thing the eye lands on and spends it
   * on a control that does nothing useful.
   */
  showBack?: boolean;
  right?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
      {/*
        The chevron is drawn rather than typed — see BackButton. That also
        settles an old problem this file used to carry a note about: a lone
        "‹" is a direction-neutral character, and Android resolved it
        against the *device* locale, so an Arabic interface on an
        English-locale phone could draw the arrow pointing the wrong way.
        A shape made of borders points where it is built to point.
      */}
      {showBack && <BackButton onPress={onBack} />}

      {/*
        2026-11-17: the counterweight for a header that opens with neither a
        back button nor a section badge.

        This row balances its title between a 38dp leading control and the
        38dp `rightSlot`, and `rightSlot` is rendered whether or not anything
        was passed into it. Take the leading control away and only the
        trailing 38 and the row's own 12dp gap are left, so `titleWrap`
        (flex: 1) centres its text inside a box running from the 16dp padding
        to 38 + 12 short of the far edge: 16 + (W - 82) / 2, which is
        W / 2 - 25. That is the More tab, which is where it was seen:
        "المزيد" sat 25dp off the window's centre line,
        which on a title centred on purpose is visible against the two screen
        edges by itself.

        2026-11-18: the first version of this note gave the symptom as the
        word drifting from where the three browse tabs put theirs, "so the
        word jumped sideways as you moved along the bar". It cannot do that
        on the phone — live-categories, movies-categories and
        series-categories each render their ScreenHeader inside
        `{isTvBuild && …}`, so on a phone More's is the only header in the tab
        group and there is no neighbour to drift from. Side by side is a
        television observation, where those three do exist and arrive with a
        badge in the slot More leaves empty. The fix is the same on both: the
        row is 25dp lopsided whenever a leading element is missing, with or
        without something next door to measure it against.

        An empty box of the same 38 puts the missing half of the pair back.
        It is keyed on "there is no leading element" rather than on "this is
        the More screen", so a header that opts out of the back button
        because there is nothing behind it — the Terms page in gate mode, the
        provider list on first run, and the same list while a connect runs —
        is centred too, instead of each one needing to discover this
        separately.
      */}
      {!showBack && !badge && <View style={styles.leadingSpacer} />}

      {badge && (
        <View style={[styles.badge, { backgroundColor: badge.colour }]}>{badge.glyph}</View>
      )}

      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={styles.rightSlot}>{right}</View>
    </Animated.View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  /** 38 square, as the approved screens draw it. */
  badge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  titleWrap: { flex: 1, alignItems: "center" },
  title: { color: C.text, fontSize: 17, fontFamily: FontFamily.extraBold },
  subtitle: { color: C.textMuted, fontSize: 11, fontFamily: FontFamily.regular, marginTop: 1 },
  rightSlot: { minWidth: 38, alignItems: "flex-end", justifyContent: "center" },
  /*
   * `rightSlot`'s opposite number, not `rightSlot` itself: an empty view
   * with `minWidth: 38` would measure the same 38 and render identically,
   * but a box named for the trailing side sitting at the *start* of the row
   * would be wrong twice over — and in Arabic, the default locale, "right"
   * is where this one is not.
   */
  leadingSpacer: { width: 38 },
  })
);
