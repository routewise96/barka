/**
 * src/db/client.ts — инициализация expo-sqlite и миграции.
 *
 * Архитектурные решения:
 * - Одна БД `barka.db`, открывается один раз (singleton). Хранит ТОЛЬКО прогресс
 *   и события (раздел 4), никогда контент.
 * - Версионирование схемы через `PRAGMA user_version`. Это рекомендованный
 *   expo-sqlite способ миграций без отдельной таблицы версий. Каждая миграция —
 *   шаг от N-1 к N; применяются по порядку, идемпотентно.
 * - DDL миграции v1 = содержимое schema.sql (тот файл — человекочитаемый источник
 *   правды; здесь он встроен строкой, т.к. Metro не импортирует .sql как модуль).
 * - foreign_keys включаются на каждом открытии (PRAGMA не персистится).
 * - WAL для производительности на дешёвых устройствах.
 */
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'barka.db';

/** Целевая версия схемы. Поднимать при добавлении миграции. */
const SCHEMA_VERSION = 1;

/**
 * Миграции по индексу: MIGRATIONS[0] переводит схему с v0 на v1 и т.д.
 * v1 повторяет schema.sql (раздел 4 ARCHITECTURE.md).
 */
const MIGRATIONS: string[] = [
  // --- v1 ---
  `
  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    avatar TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER,
    item_id TEXT,
    completed_at INTEGER,
    FOREIGN KEY (profile_id) REFERENCES profiles(id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER,
    item_id TEXT,
    event_type TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS installed_packs (
    pack_id TEXT PRIMARY KEY,
    version INTEGER,
    installed_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_progress_profile ON progress (profile_id);
  CREATE INDEX IF NOT EXISTS idx_events_profile ON events (profile_id);
  `,
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Возвращает singleton-подключение к БД, выполнив миграции при первом вызове.
 * Безопасно звать многократно: инициализация происходит один раз.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = initDb();
  }
  return dbPromise;
}

async function initDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await migrate(db);
  return db;
}

/** Применяет недостающие миграции, опираясь на PRAGMA user_version. */
async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let current = row?.user_version ?? 0;

  if (current >= SCHEMA_VERSION) return;

  // Каждая миграция — в транзакции; user_version нельзя биндить параметром.
  for (let next = current + 1; next <= SCHEMA_VERSION; next++) {
    const sql = MIGRATIONS[next - 1];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    await db.execAsync(`PRAGMA user_version = ${next};`);
    current = next;
  }
}
