import * as SecureStore from "expo-secure-store";

import type { XtreamCredentials } from "@/domain/provider/types";

/**
 * Provider credentials live only here (SecureStore), never in SQLite or
 * anywhere logged — master prompt §8/§30. Keyed by provider id so each
 * saved provider has its own entry.
 */
function keyFor(providerId: string): string {
  return `provider-credentials-${providerId}`;
}

/**
 * When iOS is allowed to hand these back.
 *
 * SecureStore's iOS default is `WHEN_UNLOCKED`, which means the keychain
 * refuses to decrypt the entry while the screen is locked. That is the right
 * default for a banking app and the wrong one here: the app plays audio in the
 * background, and the moment a stream needs re-authenticating — a token
 * expiring, a reconnect after a dropped connection — is very often the moment
 * the phone is in a pocket with the screen off. The read would fail, and the
 * viewer would hear playback stop for no reason they could see.
 *
 * `AFTER_FIRST_UNLOCK` keeps the entry encrypted at rest and unreadable until
 * the phone has been unlocked at least once since boot, which is the standard
 * setting for a credential a background task needs. Not the
 * `_THIS_DEVICE_ONLY` variant: these are the viewer's own provider logins and
 * restoring them onto a new phone from a backup is a feature, not a leak.
 *
 * Ignored on Android, which has no equivalent concept.
 */
const KEYCHAIN_ACCESSIBLE = SecureStore.AFTER_FIRST_UNLOCK;

export async function saveProviderCredentials(
  providerId: string,
  credentials: XtreamCredentials
): Promise<void> {
  await SecureStore.setItemAsync(keyFor(providerId), JSON.stringify(credentials), {
    keychainAccessible: KEYCHAIN_ACCESSIBLE,
  });
}

export async function getProviderCredentials(providerId: string): Promise<XtreamCredentials | null> {
  const raw = await SecureStore.getItemAsync(keyFor(providerId), {
    keychainAccessible: KEYCHAIN_ACCESSIBLE,
  });
  if (!raw) return null;
  return JSON.parse(raw) as XtreamCredentials;
}

export async function deleteProviderCredentials(providerId: string): Promise<void> {
  await SecureStore.deleteItemAsync(keyFor(providerId));
}
