import { dataScope } from "@/db/dataScope";
import { getDatabase } from "@/db/client";

export type CategoryContentType = "live" | "movie" | "series";

/**
 * Presence in the table means hidden; absence means visible (the default).
 *
 * Scoped to the connected provider since migration 24. A category id is a
 * small integer the panel chose, and every Xtream panel numbers its own from
 * 1 — so the same id is a different category on every account, and reading
 * this unscoped hid a category on the newly-connected provider that nobody
 * had ever hidden (2026-11-17).
 *
 * `dataScope()` is passed straight into the query rather than guarded, the
 * way the reads in watchProgressRepository.ts are: with no session
 * `provider_id = NULL` matches nothing, and "nothing is hidden" is the right
 * answer when nothing is connected. Every caller gates on an active session
 * first in any case.
 */
export async function getHiddenCategoryIds(contentType: CategoryContentType): Promise<Set<string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ category_id: string }>(
    "SELECT category_id FROM hidden_categories WHERE provider_id = $providerId AND content_type = $contentType;",
    { $providerId: dataScope(), $contentType: contentType }
  );
  return new Set(rows.map((r) => r.category_id));
}

export async function setCategoryHidden(
  contentType: CategoryContentType,
  categoryId: string,
  hidden: boolean
): Promise<void> {
  const providerId = dataScope();
  /* Nothing is connected, so there is no provider for this row to belong to. */
  if (!providerId) return;
  const db = await getDatabase();
  if (hidden) {
    await db.runAsync(
      "INSERT OR IGNORE INTO hidden_categories (provider_id, content_type, category_id) VALUES ($providerId, $contentType, $categoryId);",
      { $providerId: providerId, $contentType: contentType, $categoryId: categoryId }
    );
  } else {
    await db.runAsync(
      "DELETE FROM hidden_categories WHERE provider_id = $providerId AND content_type = $contentType AND category_id = $categoryId;",
      { $providerId: providerId, $contentType: contentType, $categoryId: categoryId }
    );
  }
}
