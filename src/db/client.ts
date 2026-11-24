import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { migrations } from "./migrations";
import { BRAND } from "@/core/brand";

/*
 * Branded so two brands installed side by side can never read each other's
 * catalogue. A different package id already gives each app its own private
 * storage, so this is the second lock rather than the first — but the cost
 * of being wrong here is the viewer's whole library, so it gets both.
 */
const DATABASE_NAME = BRAND.databaseName;

let dbPromise: Promise<SQLiteDatabase> | null = null;

/**
 * Opens (once) and migrates the app database, tracked via SQLite's own
 * `PRAGMA user_version` rather than a custom table — avoids a chicken-and-egg
 * problem on a brand-new database file. Every migration runs inside one
 * transaction; a half-applied migration on interruption is rolled back
 * entirely, never left as a broken partial schema (master prompt §8).
 */
export function getDatabase(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate();
  }
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(DATABASE_NAME);
  await db.execAsync("PRAGMA journal_mode = WAL;");

  const versionRow = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version;");
  const currentVersion = versionRow?.user_version ?? 0;

  const pending = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.up);
      await db.execAsync(`PRAGMA user_version = ${migration.version};`);
    });
  }

  return db;
}
