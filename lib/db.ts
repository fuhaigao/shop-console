/**
 * SQLite handle + schema. This is the durable backbone for the reversible,
 * provenance-tracked write layer (and, later, the measurement seam that attaches
 * Search Console metrics to each change).
 *
 * The handle is cached on globalThis so Next dev HMR re-evaluating this module
 * doesn't reopen the DB or re-run migrations (same pattern as StackBoard).
 * DB file lives at ~/.shopconsole/db.sqlite, WAL mode.
 */
import Database from "better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

export const DATA_DIR = join(homedir(), ".shopconsole");

const g = globalThis as unknown as { __shopConsoleDb?: Database.Database };

function open(): Database.Database {
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(join(DATA_DIR, "db.sqlite"));
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS applied_changes (
      id           TEXT PRIMARY KEY,
      batch_id     TEXT NOT NULL,
      product_id   TEXT NOT NULL,
      product_title TEXT NOT NULL,
      field        TEXT NOT NULL,   -- seo_title|seo_description|description|product_type|tags|image_alt
      media_id     TEXT,            -- for image_alt
      old_value    TEXT,            -- JSON-encoded prior value (for revert)
      new_value    TEXT,            -- JSON-encoded applied value
      source       TEXT NOT NULL,   -- rule|ai
      rationale    TEXT,
      status       TEXT NOT NULL,   -- applied|failed|reverted
      error        TEXT,
      applied_at   INTEGER NOT NULL,
      reverted_at  INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_changes_product ON applied_changes(product_id);
    CREATE INDEX IF NOT EXISTS idx_changes_batch   ON applied_changes(batch_id);
  `);
}

export function db(): Database.Database {
  if (!g.__shopConsoleDb) g.__shopConsoleDb = open();
  return g.__shopConsoleDb;
}
