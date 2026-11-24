import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import { CategorySidebar } from "@/components/CategorySidebar";
import { CategoryTabs, type CategoryTabItem } from "@/components/CategoryTabs";
import { isTvBuild } from "@/core/platform/isTvBuild";

/**
 * One shape for browsing: the category rail down one side, the content grid
 * beside it.
 *
 * Live TV, Movies and Series are the same task — pick a category, pick a
 * thing in it — and each screen used to answer it differently. The
 * television was unified first (requested 2026-09-10: "يجب توحيد طريقة
 * العرض لكل القنوات والمسلسلات والافلام"); the phone kept a horizontal
 * strip above the grid, where four categories fit and the rest were a
 * sideways scroll nobody discovers.
 *
 * Both platforms now read the same way, each with the rail it needs:
 *
 * - **Television:** `CategorySidebar` on the left, 241dp, selection
 *   following D-pad focus on a delay. Left enters it, Up/Down walks it,
 *   Right returns.
 * - **Phone:** `CategoryTabs` above the grid, in both orientations. A strip
 *   costs height, not width, so nothing is subtracted from the grid.
 * - **Television:** `CategorySidebar` beside the grid, 241dp wide, which IS
 *   subtracted — a remote reaches a column with one Left press, and a strip
 *   above the grid competes with it for Up and Down.
 *
 * 2026-11-17: the phone's right-hand `CategoryRail` was replaced by the chip
 * strip, because the approved Movies, Series and Channels screens all draw the
 * categories as chips under the title. The rail is still in the repository —
 * nothing on a phone reaches it now.
 */
export function BrowseLayout({
  categories,
  activeId,
  onSelect,
  progress,
  children,
}: {
  /** Null while still loading — the rail simply does not appear yet. */
  categories: CategoryTabItem[] | null;
  activeId: string;
  onSelect: (id: string) => void;
  /** The pager's drag, which the horizontal strip travels with. */
  progress?: SharedValue<number>;
  children: ReactNode;
}) {
  const hasRail = Boolean(categories && categories.length > 1);

  /*
   * One tree, three arrangements — and the keys are the whole point.
   *
   * This used to `return` a different tree per platform and orientation.
   * They looked interchangeable, and they were not: in portrait the first
   * child was the content and in landscape it was the strip, so turning
   * the phone handed React a different element type at child zero and it
   * did the only thing it can with that — tore the whole subtree down and
   * built a new one. The grid lost its place, every screen replayed its
   * entrance, and what the viewer felt was the jolt reported as
   * "في قفزة بالشلاشة ونطقة مو حلوة".
   *
   * Keyed children fix it. React matches `content` to `content` no matter
   * which end of the list it sits at, so the grid below is the same mounted
   * component before and after the turn; only the rail is rebuilt, which is
   * a few dozen chips and a different component anyway.
   *
   * `row-reverse` is what lets the order stay fixed. The rail belongs on
   * the right of a phone held upright and on the left of a television, and
   * writing it first in both and reversing the row is how it gets there
   * without the array itself changing shape.
   */
  /*
   * The phone takes the horizontal chip strip, in both orientations.
   *
   * 2026-11-17: the approved Movies, Series and Channels screens all draw the
   * categories as a row of chips under the title, and that is now the decision
   * — it replaces the right-hand `CategoryRail` chosen on 2026-11-07. The rail
   * is left in the repository because the television still has nothing like it
   * and because the reasoning in its own file is worth keeping, but no phone
   * screen reaches it any more.
   *
   * The television keeps `CategorySidebar`: a remote reaches a column beside
   * the grid with one Left press, and a strip above it competes with the grid
   * for Up and Down.
   */
  const rail = !hasRail || !categories ? null : isTvBuild ? (
    <CategorySidebar key="rail" categories={categories} activeId={activeId} onSelect={onSelect} />
  ) : (
    <CategoryTabs
      key="rail"
      categories={categories}
      activeId={activeId}
      onSelect={onSelect}
      progress={progress}
    />
  );

  const content = (
    <View key="content" style={styles.content}>
      {children}
    </View>
  );

  /*
   * Turned sideways, the categories go back on top.
   *
   * The column is the right shape for a phone held upright, where height
   * is what there is plenty of. Laid on its side the window is 2400 by
   * 1080: a column down the edge of a 1080pt-tall screen shows four
   * categories where the portrait one showed eight, and it does it while
   * narrowing a grid that was already short of rows. The horizontal strip
   * costs one band of the scarce dimension and gives the artwork the rest.
   *
   * It is also the strip the pager already drives, so a sideways drag
   * moves it with the finger — which is the one thing the column cannot
   * do, a vertical rail following a horizontal drag reading as a glitch.
   */
  /* Chips above the grid on a phone, rail beside it on a television. */
  const direction = isTvBuild ? "row" : "column";

  return <View style={[styles.body, { flexDirection: direction }]}>{[rail, content]}</View>;
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  content: { flex: 1 },
});
