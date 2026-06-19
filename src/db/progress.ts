/**
 * src/db/progress.ts — типизированный слой доступа к БД прогресса.
 *
 * Правило (раздел 4): никакого сырого SQL в UI. UI зовёт только эти функции.
 * Все пользовательские значения проходят через параметры запроса / prepared
 * statements — строковая конкатенация в SQL запрещена.
 */
import { getDb } from './client';

/** Типы событий, фиксируемые в таблице events. */
export type EventType = 'open' | 'complete' | 'choice_correct' | 'choice_wrong';

export interface Profile {
  id: number;
  name: string | null;
  avatar: string | null;
  created_at: number | null;
}

export interface ProgressRow {
  id: number;
  profile_id: number;
  item_id: string;
  completed_at: number | null;
}

// ---------------------------------------------------------------------------
// Профили
// ---------------------------------------------------------------------------

/** Создаёт профиль, возвращает его id. */
export async function createProfile(name: string, avatar: string): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    'INSERT INTO profiles (name, avatar, created_at) VALUES (?, ?, ?);',
    name,
    avatar,
    Date.now(),
  );
  return res.lastInsertRowId;
}

/** Все профили, новейшие сверху. */
export async function listProfiles(): Promise<Profile[]> {
  const db = await getDb();
  return db.getAllAsync<Profile>('SELECT * FROM profiles ORDER BY created_at DESC;');
}

// ---------------------------------------------------------------------------
// Прогресс
// ---------------------------------------------------------------------------

/**
 * Отмечает активность как пройденную профилем. Идемпотентно по смыслу:
 * пишем строку прохождения и одновременно логируем событие "complete".
 */
export async function recordCompletion(
  profileId: number,
  itemId: string,
  completedAt: number = Date.now(),
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO progress (profile_id, item_id, completed_at) VALUES (?, ?, ?);',
      profileId,
      itemId,
      completedAt,
    );
    await db.runAsync(
      'INSERT INTO events (profile_id, item_id, event_type, created_at) VALUES (?, ?, ?, ?);',
      profileId,
      itemId,
      'complete' satisfies EventType,
      completedAt,
    );
  });
}

/** Прохождения профиля (новейшие сверху). */
export async function getProgressForProfile(profileId: number): Promise<ProgressRow[]> {
  const db = await getDb();
  return db.getAllAsync<ProgressRow>(
    'SELECT * FROM progress WHERE profile_id = ? ORDER BY completed_at DESC;',
    profileId,
  );
}

/** Множество id пройденных активностей — удобно для подсветки в UI. */
export async function getCompletedItemIds(profileId: number): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ item_id: string }>(
    'SELECT DISTINCT item_id FROM progress WHERE profile_id = ?;',
    profileId,
  );
  return new Set(rows.map((r) => r.item_id));
}

// ---------------------------------------------------------------------------
// События
// ---------------------------------------------------------------------------

/** Логирует событие (открытие, выбор и т.д.). Локально, без сети. */
export async function logEvent(
  profileId: number,
  itemId: string,
  eventType: EventType,
  createdAt: number = Date.now(),
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO events (profile_id, item_id, event_type, created_at) VALUES (?, ?, ?, ?);',
    profileId,
    itemId,
    eventType,
    createdAt,
  );
}

// ---------------------------------------------------------------------------
// Установленные паки (зеркало того, что распаковано в documentDirectory)
// ---------------------------------------------------------------------------

/** Отмечает пак установленным/обновлённым (UPSERT по версии). */
export async function markPackInstalled(
  packId: string,
  version: number,
  installedAt: number = Date.now(),
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO installed_packs (pack_id, version, installed_at) VALUES (?, ?, ?)
     ON CONFLICT(pack_id) DO UPDATE SET version = excluded.version, installed_at = excluded.installed_at;`,
    packId,
    version,
    installedAt,
  );
}

/** Версия установленного пака или null, если не установлен. */
export async function getInstalledPackVersion(packId: string): Promise<number | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM installed_packs WHERE pack_id = ?;',
    packId,
  );
  return row?.version ?? null;
}
