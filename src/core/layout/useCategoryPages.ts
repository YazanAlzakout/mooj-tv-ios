import { useCallback, useEffect, useRef } from "react";
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

/**
 * Where the viewer was in each category, for a screen that renders several
 * lists at once (2026-10-07).
 *
 * `useCategoryScroll` keeps one list and swaps its data. `CategoryPager`
 * keeps three lists side by side, so the memory has to be keyed per category
 * rather than held per list — and it has to survive a page being unmounted,
 * which is what happens the moment the viewer moves two categories away and
 * the window no longer reaches back.
 *
 * ## No hook per page
 *
 * The obvious shape — call a hook inside each page — cannot be written: the
 * number of pages changes with the position in the strip, and a hook called
 * in a loop is a hook order that changes between renders. So this is one hook
 * for the screen, handing out a set of callbacks per category id.
 *
 * Those callback sets are **cached per id and handed back identical every
 * time**, and that is load-bearing rather than tidy. A fresh `ref` function
 * on each render is a different ref to React: it calls the old one with null
 * and the new one with the list, which looks exactly like an unmount and a
 * remount. This hook restores the scroll position when a list arrives, so a
 * new ref every render would drag the viewer back to their old position on
 * every single render.
 *
 * ## Shape, and why turning the phone is not a change of shape
 *
 * A remembered offset only means anything for the layout that produced it,
 * so a change of `shape` — the search term, which changes what is in the
 * list at all — forgets every position rather than replaying pixels into a
 * grid they were never measured in.
 *
 * Rotating the phone used to count as that, and it should not have. The
 * list is the same list; only the geometry under it moved. Throwing the
 * offsets away sent every grid back to its first row the moment the phone
 * turned, and turning it back sent it there again — which is most of what
 * was reported as "في قفزة بالشلاشة" after a rotation.
 *
 * An offset can be carried across instead, because it is a disguised row
 * number. Divide by the row height it was taken at to get the row, times
 * the old column count for the item at the top of the screen, and that
 * item is the thing the viewer was actually looking at. Put it back where
 * the new geometry would place it and they keep their place through the
 * turn — not to the pixel, since four across cannot show the same rows as
 * three, but to the title they were reading.
 */

export interface CategoryPageScroll {
  onMomentumScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollEndDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange: (width: number, height: number) => void;
}

export interface CategoryPage<T> {
  listRef: (instance: FlatList<T> | null) => void;
  scroll: CategoryPageScroll;
}

export interface CategoryPageGeometry {
  /** What invalidates a position outright: the search term, the data itself. */
  shape: string | number;
  columns: number;
  /** The height `getItemLayout` is promising for one row, at this column count. */
  rowHeight: number;
}

export function useCategoryPages<T>(geometry: CategoryPageGeometry) {
  const { shape, columns, rowHeight } = geometry;
  const offsets = useRef(new Map<string, number>());
  const lists = useRef(new Map<string, FlatList<T> | null>());
  const heights = useRef(new Map<string, number>());
  /** Categories whose currently mounted list has already been put back. */
  const restored = useRef(new Set<string>());
  const cache = useRef(new Map<string, CategoryPage<T>>());

  const lastGeometry = useRef({ shape, columns, rowHeight });
  useEffect(() => {
    const was = lastGeometry.current;
    if (was.shape === shape && was.columns === columns && was.rowHeight === rowHeight) return;

    if (was.shape !== shape) {
      /* A different list. Nothing remembered about the old one applies. */
      offsets.current.clear();
    } else if (was.rowHeight > 0 && rowHeight > 0 && columns > 0) {
      /*
       * The same list in a new geometry — see the note above. Each offset
       * is translated through the item that was at the top of the screen.
       */
      for (const [id, offset] of offsets.current) {
        if (offset <= 0) continue;
        const topItem = Math.floor(offset / was.rowHeight) * was.columns;
        offsets.current.set(id, Math.floor(topItem / columns) * rowHeight);
      }
    } else {
      /* A geometry we cannot translate through; forget rather than guess. */
      offsets.current.clear();
    }

    lastGeometry.current = { shape, columns, rowHeight };
    /*
     * Every mounted list is now owed a fresh restore. Rotation remounts
     * them anyway (FlatList cannot change `numColumns` in place), and the
     * new one reports a height of zero before it has measured — so the
     * put-back that matters is the one `onContentSizeChange` triggers,
     * which lands after this effect and reads the translated offsets.
     */
    restored.current.clear();
  }, [shape, columns, rowHeight]);

  const restore = useCallback((id: string) => {
    if (restored.current.has(id)) return;
    const list = lists.current.get(id);
    if (!list) return;
    const offset = offsets.current.get(id) ?? 0;

    /*
      Back to the top is always possible and always necessary — a page with
      nothing remembered must start at its first row, not wherever the list
      it replaced happened to be.
    */
    if (offset <= 0) {
      restored.current.add(id);
      list.scrollToOffset({ offset: 0, animated: false });
      return;
    }

    /* Nothing to scroll into yet; `onContentSizeChange` will come back here. */
    if ((heights.current.get(id) ?? 0) <= 0) return;
    restored.current.add(id);
    list.scrollToOffset({ offset, animated: false });
  }, []);

  const remember = useCallback((id: string, event: NativeSyntheticEvent<NativeScrollEvent>) => {
    /*
      Not settled yet, so this belongs to a list on its way out rather than to
      this category. Recording it would move the viewer next time they return.
    */
    if (!restored.current.has(id)) return;
    offsets.current.set(id, event.nativeEvent.contentOffset.y);
  }, []);

  /** The callbacks for one category's list. Identical object every time — see above. */
  return useCallback(
    (id: string): CategoryPage<T> => {
      const known = cache.current.get(id);
      if (known) return known;

      const made: CategoryPage<T> = {
        listRef: (instance) => {
          if (lists.current.get(id) === instance) return;
          lists.current.set(id, instance);
          /* A new list has measured nothing and been put back nowhere. */
          heights.current.set(id, 0);
          restored.current.delete(id);
          if (instance) restore(id);
        },
        scroll: {
          onMomentumScrollEnd: (event) => remember(id, event),
          onScrollEndDrag: (event) => remember(id, event),
          onContentSizeChange: (_width, height) => {
            heights.current.set(id, height);
            restore(id);
          },
        },
      };

      cache.current.set(id, made);
      return made;
    },
    [restore, remember]
  );
}
