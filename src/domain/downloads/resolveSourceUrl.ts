import { getProviderCredentials } from "@/core/storage/secureCredentials";
import { getProviderById } from "@/db/repositories/providerRepository";
import type { DownloadContentType } from "@/db/repositories/downloadRepository";
import { toProviderConfig } from "@/domain/provider/types";
import { episodeStreamUrl } from "@/providers/xtream/seriesAdapter";
import { movieStreamUrl } from "@/providers/xtream/vodAdapter";

/**
 * Rebuilds a download's stream URL from the provider's stored credentials.
 *
 * An Xtream stream URL carries the username and password as path segments,
 * so holding one is holding the credentials. It used to be handed to
 * `startDownload` by the details screens and written straight into
 * `download_tasks.source_url` — which put every downloading user's password
 * into SQLite, and from there into Android's automatic cloud backup, in
 * direct contradiction of this project's rule that credentials live only in
 * SecureStore (docs/DECISIONS.md).
 *
 * Nothing needs to be stored: the row already identifies the provider, the
 * item and the container, which is everything the URL is made of. It is
 * built here, used immediately, and never persisted.
 */
export async function resolveDownloadSourceUrl(item: {
  contentType: DownloadContentType;
  providerId: string;
  providerItemId: string;
  containerExtension: string;
}): Promise<string | null> {
  const provider = await getProviderById(item.providerId);
  if (!provider) return null;

  const credentials = await getProviderCredentials(item.providerId);
  if (!credentials) return null;

  const config = toProviderConfig(provider, credentials);
  return item.contentType === "movie"
    ? movieStreamUrl(config, item.providerItemId, item.containerExtension)
    : episodeStreamUrl(config, item.providerItemId, item.containerExtension);
}
