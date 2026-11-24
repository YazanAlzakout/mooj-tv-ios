import { useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";

import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";

/**
 * The artwork at the top of a detail screen, ending in a shallow arc
 * instead of a straight cut.
 *
 * ## Why an arc at all
 *
 * The picture used to stop at a hard horizontal line, and a hard line is
 * the one edge a screen gets for free — it is what happens when nobody
 * decides anything. A curve is visibly a decision, it hands the eye down
 * into the title and the Play button beneath, and it is the single
 * cheapest thing that separates this screen from the one it was cloned
 * from. The brief for it was "like an arc, but light".
 *
 * ## How it is drawn, with no clip-path and no SVG
 *
 * React Native has neither, and this project carries no SVG renderer. But
 * a rounded corner *is* a quarter ellipse, and a clipping view whose
 * bottom-left and bottom-right radii add up to exactly its own width has
 * no straight section left along the bottom at all: its bottom edge is one
 * continuous curve from corner to corner.
 *
 * So the clip is made deliberately **wider than the screen** and given
 * that pair of radii, and the artwork is placed inside it at the screen's
 * own width, centred. What shows through the window is the middle of a
 * very large circle — a shallow, even sweep rather than two corners with a
 * flat run between them. The rest of the clip hangs off both edges of the
 * display where nobody can see it.
 *
 * The artwork keeps its own width inside that wider box, which is the
 * point of the inner view: stretching the image to the clip's width would
 * scale the poster up by more than twice and crop away the part people
 * came to look at.
 *
 * ## Why the radius is capped at the height, and what happens in landscape
 *
 * A corner radius can never exceed the side it sits on, so the sweep's
 * radius is bounded by the artwork's own height; past that Android scales
 * both radii down, a flat section reappears in the middle, and the even
 * curve becomes two corners again. Hence `Math.min` — and hence the
 * fallback: sideways the hero is a short wide band, no radius that fits
 * its height can span its width, and the honest answer is a plain soft
 * corner rather than a curve that would have to bite a third of the
 * picture away to exist.
 *
 * A deeper arc is not a better one here. The sweep is deepest where the
 * radius is *smallest*, so the cap above is also what keeps it light: on a
 * normal phone it takes about 50dp out of the corners of a 400dp hero, and
 * the eye reads a curve without ever noticing how much picture it cost.
 */
export function ArcHero({ height, children }: { height: number; children: React.ReactNode }) {
  const { width } = useWindowDimensions();

  const arc = useMemo(() => {
    /*
     * `width * 1.4` is the flat end of the range, not an aesthetic
     * preference: beyond it the sweep is shallow enough that it reads as
     * a rendering artefact rather than a shape. The height is the hard
     * ceiling, for the reason in the note above.
     */
    const radius = Math.min(height, Math.round(width * 1.4));
    const span = radius * 2;
    /* Too short to reach across the display — see the landscape note. */
    if (span < width) return null;
    return { radius, span, inset: Math.round((span - width) / 2) };
  }, [height, width]);

  const fallbackRadius = Math.round(Math.min(height * 0.5, width * 0.06));

  return (
    <View style={[styles.outer, { height }]}>
      <View
        style={[
          styles.clip,
          arc
            ? {
                width: arc.span,
                marginStart: -arc.inset,
                borderBottomLeftRadius: arc.radius,
                borderBottomRightRadius: arc.radius,
              }
            : {
                width: "100%",
                /*
                 * Measured against the width as well as the height. Half
                 * the height alone rounds the bottom of an 870-by-180 band
                 * all the way to its midline, which reads as a lozenge
                 * rather than a hero; 6% of the width keeps it a corner.
                 */
                borderBottomLeftRadius: fallbackRadius,
                borderBottomRightRadius: fallbackRadius,
              },
        ]}
      >
        <View style={[styles.art, arc ? { start: arc.inset, width } : { start: 0, end: 0 }]}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
    /*
     * The page colour, not the surface: this is what the arc reveals at
     * the two corners, so it has to be the ground the title sits on or
     * the curve reads as a notch cut in a panel.
     */
    outer: { width: "100%", overflow: "hidden", backgroundColor: C.background },
    /* The surface stays here, arc-shaped, as the backdrop while art loads. */
    clip: { flex: 1, overflow: "hidden", backgroundColor: C.surface },
    art: { position: "absolute", top: 0, bottom: 0 },
  })
);
