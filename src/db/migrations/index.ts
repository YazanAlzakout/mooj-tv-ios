export interface Migration {
  version: number;
  /** Runs inside a transaction. Keep each migration additive — never edit a shipped one. */
  up: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE providers (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_connected_at INTEGER
      );
      CREATE INDEX idx_providers_is_active ON providers(is_active);
    `,
  },
  {
    version: 2,
    up: `
      CREATE TABLE live_tv_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_category_id TEXT,
        last_channel_id TEXT
      );
      INSERT INTO live_tv_state (id) VALUES (1);
    `,
  },
  {
    version: 3,
    up: `
      CREATE TABLE search_index (
        content_type TEXT NOT NULL,
        provider_item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        subtitle TEXT,
        image_url TEXT,
        category_id TEXT,
        PRIMARY KEY (content_type, provider_item_id)
      );
      CREATE INDEX idx_search_index_name ON search_index(name COLLATE NOCASE);
    `,
  },
  {
    version: 4,
    up: `
      CREATE TABLE watch_progress (
        content_type TEXT NOT NULL,
        provider_item_id TEXT NOT NULL,
        position_seconds REAL NOT NULL,
        duration_seconds REAL NOT NULL,
        updated_at INTEGER NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        image_url TEXT,
        container_extension TEXT NOT NULL,
        series_id TEXT,
        season_number INTEGER,
        episode_number INTEGER,
        PRIMARY KEY (content_type, provider_item_id)
      );
      CREATE INDEX idx_watch_progress_updated_at ON watch_progress(updated_at DESC);
      CREATE INDEX idx_watch_progress_series_id ON watch_progress(series_id);
    `,
  },
  {
    version: 5,
    up: `
      CREATE TABLE library_items (
        list_type TEXT NOT NULL,
        content_type TEXT NOT NULL,
        provider_item_id TEXT NOT NULL,
        title TEXT NOT NULL,
        image_url TEXT,
        category_id TEXT,
        container_extension TEXT,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (list_type, content_type, provider_item_id)
      );
      CREATE INDEX idx_library_items_list_added ON library_items(list_type, added_at DESC);
    `,
  },
  {
    version: 6,
    up: `
      CREATE TABLE app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        legal_accepted_at INTEGER
      );
      INSERT INTO app_state (id) VALUES (1);
    `,
  },
  {
    version: 7,
    up: `
      ALTER TABLE app_state ADD COLUMN language TEXT;
      ALTER TABLE app_state ADD COLUMN theme TEXT NOT NULL DEFAULT 'dark';
      ALTER TABLE app_state ADD COLUMN legal_accepted_version INTEGER;
      ALTER TABLE app_state ADD COLUMN onboarding_seen_at INTEGER;
      ALTER TABLE app_state ADD COLUMN live_section_visible INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE app_state ADD COLUMN movies_section_visible INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE app_state ADD COLUMN series_section_visible INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE app_state ADD COLUMN resume_enabled INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE app_state ADD COLUMN autoplay_next_episode INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE app_state ADD COLUMN preferred_audio_lang TEXT;
      ALTER TABLE app_state ADD COLUMN preferred_subtitle_lang TEXT;
    `,
  },
  {
    version: 8,
    up: `
      CREATE TABLE hidden_categories (
        content_type TEXT NOT NULL,
        category_id TEXT NOT NULL,
        PRIMARY KEY (content_type, category_id)
      );
    `,
  },
  {
    version: 9,
    up: `
      CREATE TABLE download_tasks (
        id TEXT PRIMARY KEY NOT NULL,
        content_type TEXT NOT NULL,
        provider_item_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        image_url TEXT,
        container_extension TEXT NOT NULL,
        source_url TEXT NOT NULL,
        local_uri TEXT,
        status TEXT NOT NULL,
        bytes_downloaded INTEGER NOT NULL DEFAULT 0,
        bytes_total INTEGER,
        series_id TEXT,
        season_number INTEGER,
        episode_number INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        error_message TEXT,
        resume_state TEXT
      );
      CREATE INDEX idx_download_tasks_status ON download_tasks(status);
      CREATE INDEX idx_download_tasks_updated_at ON download_tasks(updated_at DESC);
    `,
  },
  {
    version: 10,
    up: `
      CREATE TABLE catalog_cache (
        provider_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        PRIMARY KEY (provider_id, kind)
      );
    `,
  },
  {
    version: 11,
    up: `
      CREATE TABLE epg_programmes (
        channel_id TEXT NOT NULL,
        id TEXT NOT NULL,
        start_ms INTEGER NOT NULL,
        stop_ms INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        PRIMARY KEY (channel_id, start_ms)
      );
      CREATE INDEX idx_epg_channel_stop ON epg_programmes(channel_id, stop_ms);
      CREATE TABLE epg_fetch_log (
        channel_id TEXT PRIMARY KEY NOT NULL,
        fetched_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 12,
    up: `
      ALTER TABLE app_state ADD COLUMN player_fit_mode TEXT NOT NULL DEFAULT 'contain';
      ALTER TABLE app_state ADD COLUMN parental_pin TEXT;
      ALTER TABLE app_state ADD COLUMN parental_locked_categories INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 13,
    up: `
      ALTER TABLE app_state ADD COLUMN background_playback INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 14,
    up: `
      ALTER TABLE app_state ADD COLUMN split_channel_view INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 15,
    up: `
      UPDATE app_state SET split_channel_view = 1;
    `,
  },
  {
    /*
     * Marks whether the one-time import of the published 1.x app's saved
     * providers has run (src/db/legacyProviderImport.ts).
     *
     * A flag rather than "is the providers table empty": this release ships
     * under the same package id as 1.x and inherits its stored data, so
     * without a flag, deleting an imported provider would bring it back on
     * the next launch.
     */
    version: 16,
    up: `
      ALTER TABLE app_state ADD COLUMN legacy_import_done INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    /*
     * Scrubs provider credentials out of the download rows.
     *
     * An Xtream stream URL carries the username and password in its path,
     * and both `source_url` and the `url` inside `resume_state` held one —
     * so a user who had downloaded anything had their password sitting in
     * SQLite, and therefore in Android's automatic cloud backup. Both are
     * now rebuilt from SecureStore when a download starts or resumes
     * (src/domain/downloads/resolveSourceUrl.ts) and never written.
     *
     * Clearing `resume_state` costs a paused download its byte offset: it
     * restarts instead of continuing. That is the right trade for removing
     * a credential from disk, and it happens once.
     */
    version: 17,
    up: `
      UPDATE download_tasks SET source_url = '', resume_state = NULL;
    `,
  },
  {
    /*
     * How the Live TV section looks on Android TV. Three values:
     *
     *   'browse'    the channel list with a category sidebar, and the
     *               player opened from it — the default, because a remote
     *               needs somewhere to navigate before it needs a picture
     *   'immersive' straight to a full-screen picture, the guide on demand
     *   'split'     the picture beside a permanent channel list
     *
     * Separate from `split_channel_view`, which is the phone's portrait
     * layout: that one defaults to on and means something else entirely.
     */
    version: 18,
    up: `
      ALTER TABLE app_state ADD COLUMN tv_channel_layout TEXT NOT NULL DEFAULT 'browse';
    `,
  },
  {
    /*
     * Undoes 18. The three selectable TV layouts are gone (2026-09-10): the
     * category rail beside the channel grid is now the only shape Live TV
     * takes on a television, so there is no choice left to store.
     *
     * The other two never earned their place. "immersive" put a viewer in a
     * full-screen picture with no list to navigate, which is the situation a
     * remote handles worst, and "split" was a third code path over the same
     * player that had to be kept in step with the other two for no gain the
     * rail did not already give. A setting the viewer has to find, in order
     * to reach the layout that should have been the only one, is not a
     * feature.
     *
     * DROP COLUMN rather than a dead column left in place: SQLite has
     * supported it since 3.35 and expo-sqlite 57 bundles 3.50.3 (verified in
     * vendor/sqlite3/sqlite3.h), `app_state` is read with `SELECT *` into a
     * typed row, and nothing indexes this column.
     */
    version: 19,
    up: `
      ALTER TABLE app_state DROP COLUMN tv_channel_layout;
    `,
  },
  {
    /*
     * The index `getDownloadByContent` has always needed (2026-10-07).
     *
     * `download_tasks` carried indexes on `status` and `updated_at` only,
     * while the query every row of an episode list runs on mount looks up
     * `(content_type, provider_item_id)` — so each one was a full table scan.
     * A series on this provider can run past two hundred episodes, and the
     * list is virtualized, so a fling re-mounts rows continuously and fires
     * one scan per row on the thread that draws the screen. That is the
     * pattern this project has twice removed and documented as removed.
     *
     * The index does not remove the per-row query — that needs the state
     * hoisting out of the row, which is a larger change — but it turns each
     * one from a scan of every download ever recorded into a point lookup.
     *
     * 2026-11-18: that query gained `AND provider_id = ?`, because an item id
     * means nothing without the panel it came from (downloadRepository.ts).
     * This index still serves it and still wants exactly these two columns:
     * SQLite seeks on them and tests the provider against the row it has
     * already fetched, which EXPLAIN QUERY PLAN confirms is the same plan as
     * before. Nothing to rebuild.
     */
    version: 20,
    up: `
      CREATE INDEX IF NOT EXISTS idx_download_tasks_content
        ON download_tasks(content_type, provider_item_id);
    `,
  },
  {
    /*
     * "Modern channel view" goes back to off, which is where it was supposed
     * to be all along.
     *
     * Migration 14 added `split_channel_view` with DEFAULT 0 and migration 15
     * immediately turned it on for every row — so the default the schema
     * declares has never been the default anyone actually got, on a fresh
     * install or on an upgrade.
     *
     * The owner's decision, 2026-11-17: the setting ships off and the viewer
     * turns it on if they want it. The channel tab opens the ordinary player;
     * the split layout is a preference, not how the app behaves out of the
     * box.
     *
     * A new migration rather than an edit to 15. Editing one that has already
     * run changes nothing on a device that ran it — that device is past
     * version 15 and will never execute it again — so an edit would only fix
     * the installs that do not exist yet. This fixes both.
     */
    version: 21,
    up: `
      UPDATE app_state SET split_channel_view = 0;
    `,
  },
  {
    /*
     * The three "Show X section" switches are gone, and so are the columns
     * behind them.
     *
     * They were written and never read. Nothing in the app consulted
     * `live_section_visible`, `movies_section_visible` or
     * `series_section_visible` — not the home screen, not the tab bar, not the
     * browse grids — so turning one off did exactly nothing, which is how the
     * owner found them on 2026-11-17: "إضظهر قسم البث المباشر ما عمل شي".
     *
     * Removed rather than wired up, on his instruction: "الغي 3 إظهار من
     * السيتنغ لان مو مهمين". Hiding a whole section is not something this app
     * needs a switch for — the per-category screens next to them already do the
     * useful version of it.
     *
     * DROP COLUMN rather than dead columns left in place, for the reason
     * migration 19 gives: SQLite has supported it since 3.35, expo-sqlite 57
     * bundles 3.50.3, `app_state` is read with `SELECT *` into a typed row, and
     * nothing indexes these.
     */
    version: 22,
    up: `
      ALTER TABLE app_state DROP COLUMN live_section_visible;
      ALTER TABLE app_state DROP COLUMN movies_section_visible;
      ALTER TABLE app_state DROP COLUMN series_section_visible;
    `,
  },
  {
    /*
     * Watch history and the library become per-provider.
     *
     * Neither table had any idea which subscription a row came from. On a
     * device where two providers had been connected in turn, Continue
     * Watching, the favourites and the watch-later list all showed the other
     * account's titles — reported the moment a second provider was added on
     * 2026-11-17: "كونتنيو واتشينغ ليش طالعة ؟". Worse than the look: every
     * row carries a `provider_item_id`, and those ids are small integers that
     * two panels both use, so opening one would have asked the new provider
     * for the old provider's stream and got back something else entirely.
     *
     * The provider goes INTO the primary key rather than beside it, which is
     * why both tables are rebuilt instead of altered. Two panels numbering a
     * film 1182 is not a conflict, it is two films; under the old key the
     * second one silently overwrote the first.
     *
     * Existing rows are adopted by whichever provider is active at upgrade
     * time, and failing that by the only provider on the device.
     *
     * The active row is the honest first guess, and the right one for the
     * single-provider installs that are all that exist before the first
     * release. The second clause exists because "no active provider" stopped
     * being a rare accident in this same batch: disconnecting now actually
     * deactivates the row (`clearActiveProvider`, providerRepository.ts), and
     * every disconnect path goes through it — so a device left disconnected
     * arrives here with a full library and nothing marked active. The sequence
     * is only: tap Disconnect, close the app, install the build carrying this
     * migration.
     *
     * Adopting those rows to '' orphaned every one of them permanently.
     * `dataScope()` is only ever set from a real provider id and is never the
     * empty string, so no query could match them again and nothing deleted
     * them: Continue Watching, the favourites and the watch-later list simply
     * gone, with no control anywhere in the app that brings them back.
     * Verified on 2026-11-18 by running this chain against sqlite3 3.50.6 with
     * one provider row at is_active = 0 — every row came out at ''.
     *
     * With two or more providers it still refuses to guess: those rows take
     * the empty string, belong to nobody and stay invisible rather than
     * surfacing under the wrong account.
     *
     * Amended in place rather than corrected by a later migration because this
     * one has never shipped — the app has not been released from this tree, so
     * no device has run it.
     */
    version: 23,
    up: `
      CREATE TABLE watch_progress_scoped (
        provider_id TEXT NOT NULL,
        content_type TEXT NOT NULL,
        provider_item_id TEXT NOT NULL,
        position_seconds REAL NOT NULL,
        duration_seconds REAL NOT NULL,
        updated_at INTEGER NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        image_url TEXT,
        container_extension TEXT NOT NULL,
        series_id TEXT,
        season_number INTEGER,
        episode_number INTEGER,
        PRIMARY KEY (provider_id, content_type, provider_item_id)
      );
      INSERT INTO watch_progress_scoped
        SELECT COALESCE(
                 (SELECT id FROM providers WHERE is_active = 1 LIMIT 1),
                 (SELECT id FROM providers WHERE (SELECT COUNT(*) FROM providers) = 1 LIMIT 1),
                 ''),
               content_type, provider_item_id, position_seconds, duration_seconds,
               updated_at, title, subtitle, image_url, container_extension,
               series_id, season_number, episode_number
        FROM watch_progress;
      DROP TABLE watch_progress;
      ALTER TABLE watch_progress_scoped RENAME TO watch_progress;
      CREATE INDEX idx_watch_progress_recent ON watch_progress(provider_id, updated_at DESC);

      CREATE TABLE library_items_scoped (
        provider_id TEXT NOT NULL,
        list_type TEXT NOT NULL,
        content_type TEXT NOT NULL,
        provider_item_id TEXT NOT NULL,
        title TEXT NOT NULL,
        image_url TEXT,
        category_id TEXT,
        container_extension TEXT,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (provider_id, list_type, content_type, provider_item_id)
      );
      INSERT INTO library_items_scoped
        SELECT COALESCE(
                 (SELECT id FROM providers WHERE is_active = 1 LIMIT 1),
                 (SELECT id FROM providers WHERE (SELECT COUNT(*) FROM providers) = 1 LIMIT 1),
                 ''),
               list_type, content_type, provider_item_id, title, image_url,
               category_id, container_extension, added_at
        FROM library_items;
      DROP TABLE library_items;
      ALTER TABLE library_items_scoped RENAME TO library_items;
      CREATE INDEX idx_library_items_list_added ON library_items(provider_id, list_type, added_at DESC);
    `,
  },
  {
    /*
     * The tables migration 23 left behind.
     *
     * 23 put the provider INTO the primary key of `watch_progress` and
     * `library_items`, because a row that names a title by its panel id means
     * nothing without the panel it came from. Exactly the same is true of a
     * category id, and `hidden_categories` and `live_tv_state` both store one
     * with no record of whose it is.
     *
     * Found on 2026-11-17, the same day 23 was written. On provider A the
     * viewer hides live category "5" and `hidden_categories` keeps
     * ('live','5'). They connect provider B — every Xtream panel numbers its
     * own categories from 1, so B has a "5" too and it is something else
     * entirely — and a category nobody ever hid is missing from B's rail, with
     * nothing on screen to say why and no way back except finding it in the
     * categories screen and un-hiding it.
     *
     * `live_tv_state` is the same mistake with a louder symptom.
     * live-categories.tsx applies `last_category_id` on open without checking
     * that the id exists in the new lineup, so Live TV opens on provider A's
     * category id, matches none of B's channels, and draws an empty grid with
     * no chip lit. After this migration that lookup simply misses for a
     * provider that has never stored one, and the screen's own fallback —
     * "open on the first real category" — takes over, which is what it was
     * written to do.
     *
     * Built exactly like 23: create, copy, drop, rename. The provider belongs
     * in the key rather than beside it, because two panels both numbering a
     * category 5 is not a conflict, it is two categories — under the old key
     * the second one WAS the first one.
     *
     * `live_tv_state` stops being the single `CHECK (id = 1)` row migration 2
     * created and becomes one row per provider, keyed by the provider id.
     * Nothing outside liveTvStateRepository.ts ever read that `id` column.
     *
     * No index is added for `hidden_categories`: the new primary key's own
     * index is `(provider_id, content_type, category_id)` and the only query
     * against the table filters on the first two, which is a left prefix of
     * it.
     *
     * Existing rows are adopted exactly the way 23 adopts its own: the active
     * provider first, then the only provider on the device, and the empty
     * string only when neither clause can answer. The long version of why the
     * second clause is there — a device left disconnected now really has no
     * active row, and '' orphans the rows for good — is in 23's note above,
     * and it applies here word for word: a viewer's hidden-category choices
     * are no more recoverable from '' than their history is.
     *
     * With two or more providers it still refuses to guess, so those rows
     * belong to nobody and stay invisible rather than surfacing under the next
     * account connected.
     *
     * The two EPG tables are the third thing 23 left behind, and they are not
     * rebuilt here. A guide is a cache with a six-hour life (STORED_TTL_MS,
     * src/state/epgCache.ts), so it is emptied on a provider change instead of
     * carrying a column — see the long note in src/state/activeSessionStore.ts.
     * The one-time DELETE below is what makes that runtime rule airtight from
     * this version onward: after it, the stored guide belongs to nobody, so the
     * next row written belongs to the provider that is connected now. Without
     * it, a device that had already switched providers — or one carrying the
     * published 1.x app's database under the same package id — would keep
     * reading the old account's programme titles against the new account's
     * channel of the same id until the TTL expired. The cost is one lazy
     * re-fetch per channel the viewer actually opens, which is what the first
     * use of any day already costs.
     */
    version: 24,
    up: `
      CREATE TABLE hidden_categories_scoped (
        provider_id TEXT NOT NULL,
        content_type TEXT NOT NULL,
        category_id TEXT NOT NULL,
        PRIMARY KEY (provider_id, content_type, category_id)
      );
      INSERT INTO hidden_categories_scoped
        SELECT COALESCE(
                 (SELECT id FROM providers WHERE is_active = 1 LIMIT 1),
                 (SELECT id FROM providers WHERE (SELECT COUNT(*) FROM providers) = 1 LIMIT 1),
                 ''),
               content_type, category_id
        FROM hidden_categories;
      DROP TABLE hidden_categories;
      ALTER TABLE hidden_categories_scoped RENAME TO hidden_categories;

      CREATE TABLE live_tv_state_scoped (
        provider_id TEXT PRIMARY KEY NOT NULL,
        last_category_id TEXT,
        last_channel_id TEXT
      );
      INSERT INTO live_tv_state_scoped
        SELECT COALESCE(
                 (SELECT id FROM providers WHERE is_active = 1 LIMIT 1),
                 (SELECT id FROM providers WHERE (SELECT COUNT(*) FROM providers) = 1 LIMIT 1),
                 ''),
               last_category_id, last_channel_id
        FROM live_tv_state WHERE id = 1;
      DROP TABLE live_tv_state;
      ALTER TABLE live_tv_state_scoped RENAME TO live_tv_state;

      DELETE FROM epg_programmes;
      DELETE FROM epg_fetch_log;
    `,
  },
];
