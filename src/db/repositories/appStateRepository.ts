import { getDatabase } from "@/db/client";

export type ThemePreference = "dark" | "light" | "system";

export interface AppState {
  legalAcceptedAt: number | null;
  legalAcceptedVersion: number | null;
  language: string | null;
  theme: ThemePreference;
  onboardingSeenAt: number | null;
  resumeEnabled: boolean;
  autoplayNextEpisode: boolean;
  /**
   * Read-only as of 2026-11-18, and read by the three player screens alone.
   *
   * The owner asked for both Settings rows to go, on 2026-11-17: "لغة الصوت
   * المفضل الغيها / لغة الترجمة الغيها". The rows, `LanguageCodeRow` and the
   * six locales' strings are gone, and with them the only callers the two
   * setters that used to sit below `setAutoplayNextEpisode` ever had — so
   * those setters are gone too.
   *
   * What is deliberately still here: these two fields, the columns behind
   * them, and `usePlaybackTracks`' auto-selection. The three players read
   * them, and the player was excluded from this pass because the owner tested
   * it himself. So the value is whatever SQLite already holds and nothing in
   * the app can change it: null on every install, since nothing has been
   * released from this tree, and frozen at the old value on a test device that
   * set one before the rows went on 2026-11-17.
   *
   * Finishing it is the treatment migration 22 gave the three "Show X section"
   * switches — DROP COLUMN, fields deleted — and it needs the three player
   * screens, `usePlaybackTracks`, `src/db/migrations/index.ts` and this file in
   * one pass. See docs/DECISIONS.md, "Preferred audio/subtitle language
   * settings removed (2026-11-18)".
   */
  preferredAudioLang: string | null;
  preferredSubtitleLang: string | null;
  /** Remembered aspect choice for the player — a preference about the viewer's own screen, not the session. */
  playerFitMode: "contain" | "cover" | "fill";
  /** Null until the viewer sets one. Stored as plain text: this gates UI, it is not a security boundary. */
  parentalPin: string | null;
  /** Whether hidden categories additionally require the PIN to reveal. */
  parentalLockedCategories: boolean;
  /**
   * Keep playing when the app goes to the background. Off by default: on a
   * line limited to one connection, a stream left running in the background
   * silently blocks every other device.
   */
  backgroundPlayback: boolean;
  /**
   * Live TV shown as a pinned player above a channel list, instead of a
   * fullscreen player you navigate into and back out of. On by default
   * (migration 15) — it is now the intended way to watch, and the
   * fullscreen layout is what the expand button reaches for a single
   * channel. Only the Settings switch writes here; the player's expand
   * button is session-only, so one tap on it never changes how the next
   * channel opens.
   */
  splitChannelView: boolean;
}

interface AppStateRow {
  legal_accepted_at: number | null;
  legal_accepted_version: number | null;
  language: string | null;
  theme: ThemePreference;
  onboarding_seen_at: number | null;
  resume_enabled: number;
  autoplay_next_episode: number;
  preferred_audio_lang: string | null;
  preferred_subtitle_lang: string | null;
  player_fit_mode: "contain" | "cover" | "fill";
  parental_pin: string | null;
  parental_locked_categories: number;
  background_playback: number;
  split_channel_view: number;
}

function toAppState(row: AppStateRow): AppState {
  return {
    legalAcceptedAt: row.legal_accepted_at,
    legalAcceptedVersion: row.legal_accepted_version,
    language: row.language,
    theme: row.theme,
    onboardingSeenAt: row.onboarding_seen_at,
    resumeEnabled: row.resume_enabled === 1,
    autoplayNextEpisode: row.autoplay_next_episode === 1,
    preferredAudioLang: row.preferred_audio_lang,
    preferredSubtitleLang: row.preferred_subtitle_lang,
    playerFitMode: row.player_fit_mode ?? "contain",
    parentalPin: row.parental_pin,
    parentalLockedCategories: row.parental_locked_categories === 1,
    backgroundPlayback: row.background_playback === 1,
    splitChannelView: row.split_channel_view === 1,
  };
}

export async function getAppState(): Promise<AppState> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AppStateRow>("SELECT * FROM app_state WHERE id = 1;");
  if (!row) throw new Error("app_state row missing — migration v6 should have seeded it.");
  return toAppState(row);
}

export async function setLegalAccepted(version: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE app_state SET legal_accepted_at = $now, legal_accepted_version = $version WHERE id = 1;",
    { $now: Date.now(), $version: version }
  );
}

export async function setLanguage(language: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET language = $language WHERE id = 1;", { $language: language });
}

export async function setTheme(theme: ThemePreference): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET theme = $theme WHERE id = 1;", { $theme: theme });
}

export async function setOnboardingSeen(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET onboarding_seen_at = $now WHERE id = 1;", { $now: Date.now() });
}

export async function setResumeEnabled(enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET resume_enabled = $enabled WHERE id = 1;", { $enabled: enabled ? 1 : 0 });
}

export async function setAutoplayNextEpisode(enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET autoplay_next_episode = $enabled WHERE id = 1;", {
    $enabled: enabled ? 1 : 0,
  });
}

/*
 * `setPreferredAudioLang` / `setPreferredSubtitleLang` stood here until
 * 2026-11-18. Both lost their last caller when the Settings rows were removed
 * on the owner's instruction (see `preferredAudioLang` above), and a setter
 * with no caller is worse than no setter: it reads as a feature that is still
 * wired up. The columns they wrote are still read — see above for why, and for
 * what a later pass has to touch to finish the job.
 */

export async function setPlayerFitMode(mode: AppState["playerFitMode"]): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET player_fit_mode = $mode WHERE id = 1;", { $mode: mode });
}

/**
 * Stores the parental PIN. Plain text on purpose, and documented as such:
 * this gates a UI toggle on the user's own device, it is not protecting a
 * secret from anyone with the device unlocked. Treating it as a credential
 * would imply a guarantee this cannot make.
 */
export async function setParentalPin(pin: string | null): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET parental_pin = $pin WHERE id = 1;", { $pin: pin });
}

export async function setParentalLockedCategories(locked: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET parental_locked_categories = $locked WHERE id = 1;", {
    $locked: locked ? 1 : 0,
  });
}

export async function setBackgroundPlayback(enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET background_playback = $enabled WHERE id = 1;", {
    $enabled: enabled ? 1 : 0,
  });
}

export async function setSplitChannelView(enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET split_channel_view = $enabled WHERE id = 1;", {
    $enabled: enabled ? 1 : 0,
  });
}
