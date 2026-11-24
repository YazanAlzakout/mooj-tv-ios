import { getDatabase } from "@/db/client";
import type { Provider } from "@/domain/provider/types";

interface ProviderRow {
  id: string;
  kind: string;
  name: string;
  base_url: string;
  is_active: number;
  created_at: number;
  last_connected_at: number | null;
}

function fromRow(row: ProviderRow): Provider {
  return {
    id: row.id,
    kind: "xtream",
    name: row.name,
    baseUrl: row.base_url,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    lastConnectedAt: row.last_connected_at,
  };
}

export async function listProviders(): Promise<Provider[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ProviderRow>("SELECT * FROM providers ORDER BY created_at DESC;");
  return rows.map(fromRow);
}

export async function getActiveProvider(): Promise<Provider | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ProviderRow>("SELECT * FROM providers WHERE is_active = 1 LIMIT 1;");
  return row ? fromRow(row) : null;
}

export async function insertProvider(provider: Provider): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO providers (id, kind, name, base_url, is_active, created_at, last_connected_at)
     VALUES ($id, $kind, $name, $baseUrl, $isActive, $createdAt, $lastConnectedAt);`,
    {
      $id: provider.id,
      $kind: provider.kind,
      $name: provider.name,
      $baseUrl: provider.baseUrl,
      $isActive: provider.isActive ? 1 : 0,
      $createdAt: provider.createdAt,
      $lastConnectedAt: provider.lastConnectedAt,
    }
  );
}

export async function getProviderById(providerId: string): Promise<Provider | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ProviderRow>("SELECT * FROM providers WHERE id = $id;", { $id: providerId });
  return row ? fromRow(row) : null;
}

export async function updateProvider(provider: Pick<Provider, "id" | "name" | "baseUrl">): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE providers SET name = $name, base_url = $baseUrl WHERE id = $id;", {
    $id: provider.id,
    $name: provider.name,
    $baseUrl: provider.baseUrl,
  });
}

export async function touchLastConnected(providerId: string, timestamp: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE providers SET last_connected_at = $timestamp WHERE id = $id;", {
    $timestamp: timestamp,
    $id: providerId,
  });
}

/** Deactivates every other provider first — exactly one active provider at a time. */
export async function setActiveProvider(providerId: string): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE providers SET is_active = 0;");
    await db.runAsync("UPDATE providers SET is_active = 1 WHERE id = $id;", { $id: providerId });
  });
}

/**
 * Leaves no provider active, which is what disconnecting is supposed to mean.
 *
 * `clearActiveSession()` empties the catalogue held in memory and nothing else
 * — the row in `providers` stays `is_active = 1`. So the app's own launch
 * path, which asks `getActiveProvider()` and reconnects whatever it finds,
 * connected straight back to the provider the viewer had just disconnected
 * from. From the home screen that round trip was invisible and instant, and
 * the owner reported it on 2026-11-17 as the button doing nothing at all.
 *
 * Deactivating rather than deleting: the viewer disconnected, they did not ask
 * to forget the provider. It stays in the list, with its credentials, ready to
 * be picked again on the providers screen they land on.
 */
export async function clearActiveProvider(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE providers SET is_active = 0;");
}

export async function deleteProvider(providerId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM providers WHERE id = $id;", { $id: providerId });
}
