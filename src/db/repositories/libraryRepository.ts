import { dataScope } from "@/db/dataScope";
import { getDatabase } from "@/db/client";

export type LibraryListType = "favorite" | "watch_later";
export type LibraryContentType = "live" | "movie" | "series";

export interface LibraryItem {
  listType: LibraryListType;
  contentType: LibraryContentType;
  providerItemId: string;
  title: string;
  imageUrl: string | null;
  categoryId: string | null;
  /** Only meaningful for movie/series — lets the library screen play directly without the catalog loaded. */
  containerExtension: string | null;
  addedAt: number;
}

interface LibraryItemRow {
  list_type: LibraryListType;
  content_type: LibraryContentType;
  provider_item_id: string;
  title: string;
  image_url: string | null;
  category_id: string | null;
  container_extension: string | null;
  added_at: number;
}

function fromRow(row: LibraryItemRow): LibraryItem {
  return {
    listType: row.list_type,
    contentType: row.content_type,
    providerItemId: row.provider_item_id,
    title: row.title,
    imageUrl: row.image_url,
    categoryId: row.category_id,
    containerExtension: row.container_extension,
    addedAt: row.added_at,
  };
}

export async function isInLibrary(
  listType: LibraryListType,
  contentType: LibraryContentType,
  providerItemId: string
): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    "SELECT 1 FROM library_items WHERE provider_id = $providerId AND list_type = $listType AND content_type = $contentType AND provider_item_id = $providerItemId;",
    { $providerId: dataScope(), $listType: listType, $contentType: contentType, $providerItemId: providerItemId }
  );
  return row !== null;
}

export async function addLibraryItem(item: Omit<LibraryItem, "addedAt">): Promise<void> {
  const providerId = dataScope();
  /* Nothing is connected, so there is no provider for this row to belong to. */
  if (!providerId) return;
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO library_items (provider_id, list_type, content_type, provider_item_id, title, image_url, category_id, container_extension, added_at)
     VALUES ($providerId, $listType, $contentType, $providerItemId, $title, $imageUrl, $categoryId, $containerExtension, $addedAt)
     ON CONFLICT (provider_id, list_type, content_type, provider_item_id) DO NOTHING;`,
    {
      $providerId: providerId,
      $listType: item.listType,
      $contentType: item.contentType,
      $providerItemId: item.providerItemId,
      $title: item.title,
      $imageUrl: item.imageUrl,
      $categoryId: item.categoryId,
      $containerExtension: item.containerExtension,
      $addedAt: Date.now(),
    }
  );
}

export async function removeLibraryItem(
  listType: LibraryListType,
  contentType: LibraryContentType,
  providerItemId: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM library_items WHERE provider_id = $providerId AND list_type = $listType AND content_type = $contentType AND provider_item_id = $providerItemId;",
    { $providerId: dataScope(), $listType: listType, $contentType: contentType, $providerItemId: providerItemId }
  );
}

/** Returns the new state (true = now in library) after flipping it. */
export async function toggleLibraryItem(item: Omit<LibraryItem, "addedAt">): Promise<boolean> {
  const already = await isInLibrary(item.listType, item.contentType, item.providerItemId);
  if (already) {
    await removeLibraryItem(item.listType, item.contentType, item.providerItemId);
    return false;
  }
  await addLibraryItem(item);
  return true;
}

export async function getLibraryItems(listType: LibraryListType): Promise<LibraryItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<LibraryItemRow>(
    "SELECT * FROM library_items WHERE provider_id = $providerId AND list_type = $listType ORDER BY added_at DESC;",
    { $providerId: dataScope(), $listType: listType }
  );
  return rows.map(fromRow);
}

export async function clearLibraryList(listType: LibraryListType): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM library_items WHERE provider_id = $providerId AND list_type = $listType;", { $providerId: dataScope(), $listType: listType });
}

export async function getLibraryCount(listType: LibraryListType): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM library_items WHERE provider_id = $providerId AND list_type = $listType;",
    { $providerId: dataScope(), $listType: listType }
  );
  return row?.count ?? 0;
}
