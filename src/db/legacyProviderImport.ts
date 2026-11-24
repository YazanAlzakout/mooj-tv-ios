import * as SecureStore from "expo-secure-store";

import { saveProviderCredentials } from "@/core/storage/secureCredentials";
import { getDatabase } from "@/db/client";
import { normalizeBaseUrl } from "@/providers/xtream/xtreamAdapter";
import { insertProvider, listProviders } from "@/db/repositories/providerRepository";
import type { Provider } from "@/domain/provider/types";

/**
 * The keys the published 1.x app wrote its providers under. Its own
 * `utils/secure-store.ts` called `expo-secure-store` with no options, and
 * so does this app, so the same key reads back the same value now that
 * both ship under one package id.
 */
const LEGACY_PROVIDERS_KEY = "albasira_providers";
const LEGACY_ACTIVE_KEY = "albasira_active_provider";

/**
 * One provider as 1.x stored it. Credentials were kept inline in the same
 * JSON array as the rest of the record; this app splits them back out —
 * the row goes to SQLite, the username and password go to SecureStore
 * alone (docs/DECISIONS.md).
 */
interface LegacyProvider {
  id: string;
  type?: "xtream" | "m3u" | "local";
  name: string;
  url: string;
  username: string;
  password: string;
  addedAt: number;
}

function isLegacyProvider(value: unknown): value is LegacyProvider {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<LegacyProvider>;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.url === "string" &&
    typeof p.username === "string" &&
    typeof p.password === "string" &&
    typeof p.addedAt === "number"
  );
}

async function alreadyImported(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ legacy_import_done: number }>(
    "SELECT legacy_import_done FROM app_state WHERE id = 1;"
  );
  return row?.legacy_import_done === 1;
}

async function markImported(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET legacy_import_done = 1 WHERE id = 1;");
}

/**
 * Brings the providers from the published 1.x app across on first launch
 * of this one.
 *
 * This release replaces that app on Play under the same package id, so an
 * updating user keeps its files — including the SecureStore entry holding
 * every provider they had set up. Without this they would open a 2.0 that
 * had apparently forgotten them and have to type a server, username and
 * password back in.
 *
 * Deliberate limits:
 *
 * - **Nothing is deleted.** The 1.x keys are left exactly as they were.
 *   They cost a few hundred bytes, and removing them would make a rollback
 *   to the old build lose the user's setup for real.
 * - **Runs at most once**, guarded by a flag in `app_state` rather than by
 *   "are there no providers yet" — otherwise deleting an imported provider
 *   would resurrect it on the next launch.
 * - **Xtream only.** M3U and local-file providers are outside this app's
 *   scope, so they are skipped rather than imported into something that
 *   cannot open them.
 * - **Never throws.** A failure here means the user re-enters a provider,
 *   which is exactly where they would have been anyway; it must not be
 *   able to stop the app from starting.
 */
export async function importLegacyProviders(): Promise<number> {
  try {
    if (await alreadyImported()) return 0;

    const raw = await SecureStore.getItemAsync(LEGACY_PROVIDERS_KEY);
    if (!raw) {
      // A clean install, not an upgrade. Mark it done so this never runs again.
      await markImported();
      return 0;
    }

    const parsed: unknown = JSON.parse(raw);
    const legacy = Array.isArray(parsed)
      ? parsed.filter(isLegacyProvider).filter((p) => !p.type || p.type === "xtream")
      : [];

    if (legacy.length === 0) {
      /*
       * Only give up permanently when 1.x genuinely had nothing. If it
       * stored providers but none survived the shape check — a numeric
       * `id`, an `addedAt` written as a string — marking the import done
       * would discard the user's entire setup with no way to retry. Leaving
       * the flag clear costs one cheap SecureStore read per launch and
       * keeps the door open.
       */
      if (Array.isArray(parsed) && parsed.length > 0) return 0;
      await markImported();
      return 0;
    }

    const activeId = await SecureStore.getItemAsync(LEGACY_ACTIVE_KEY);
    const existing = new Set((await listProviders()).map((p) => p.id));

    let imported = 0;
    for (const old of legacy) {
      if (existing.has(old.id)) continue;

      const provider: Provider = {
        id: old.id,
        kind: "xtream",
        name: old.name,
        /*
         * Normalised, not copied. 1.x stored whatever the user typed and
         * cleaned it up at request time; this app expects a base URL that is
         * already scheme + host [+ port] with no trailing slash, and every
         * URL builder concatenates onto it directly. An imported
         * `host:8080` (no scheme) or `http://host:8080/` (trailing slash)
         * would produce a provider that fails to connect for a user whose
         * setup worked the day before.
         */
        baseUrl: normalizeBaseUrl(old.url),
        /*
         * Not marked active even when 1.x had it selected. The session is
         * restored by connecting to the provider, and doing that against a
         * line that may have expired since would strand the user on a
         * failing startup screen. They pick it from the list and connect,
         * which is one tap and cannot fail silently.
         */
        isActive: false,
        createdAt: old.addedAt,
        lastConnectedAt: activeId === old.id ? old.addedAt : null,
      };

      /*
       * Credentials before the row, matching add-provider.tsx. The other
       * order can leave a provider card whose Connect fails with "no stored
       * credentials" and whose Edit form is blank: if the SecureStore write
       * throws, the row is already committed, and the next run skips that id
       * because it now exists.
       */
      await saveProviderCredentials(old.id, { username: old.username, password: old.password });
      await insertProvider(provider);
      imported++;
    }

    await markImported();
    return imported;
  } catch {
    // See the note above: this is never allowed to block startup.
    return 0;
  }
}
