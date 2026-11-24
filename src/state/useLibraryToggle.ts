import { useEffect, useState } from "react";

import {
  addLibraryItem,
  isInLibrary,
  removeLibraryItem,
  type LibraryContentType,
  type LibraryListType,
} from "@/db/repositories/libraryRepository";

interface LibraryToggleItem {
  contentType: LibraryContentType;
  providerItemId: string;
  title: string;
  imageUrl: string | null;
  categoryId: string | null;
  containerExtension: string | null;
}

export interface UseLibraryToggleResult {
  isSaved: boolean;
  toggle: () => void;
}

/** Shared Favorite/Watch Later toggle state + persistence for one content item. */
export function useLibraryToggle(listType: LibraryListType, item: LibraryToggleItem | null): UseLibraryToggleResult {
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    isInLibrary(listType, item.contentType, item.providerItemId).then((result) => {
      if (!cancelled) setIsSaved(result);
    });
    return () => {
      cancelled = true;
    };
    // Deliberately depends on primitive fields, not `item` itself — callers
    // pass a fresh object literal every render, so depending on the object
    // reference would re-run this on every render instead of only when the
    // underlying content item actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listType, item?.contentType, item?.providerItemId]);

  function toggle() {
    if (!item) return;
    if (isSaved) {
      setIsSaved(false);
      removeLibraryItem(listType, item.contentType, item.providerItemId).catch(() => setIsSaved(true));
    } else {
      setIsSaved(true);
      addLibraryItem({ listType, ...item }).catch(() => setIsSaved(false));
    }
  }

  return { isSaved, toggle };
}
