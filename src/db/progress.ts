/**
 * src/db/progress.ts — типизированный слой доступа к БД прогресса.
 *
 * Правило (раздел 4): никакого сырого SQL в UI. UI зовёт только эти функции.
 * Все пользовательские значения проходят через параметры запроса / prepared
 * statements — строковая конкатенация в SQL запрещена.
 */
import { getDb } from './client';
import { runSafely } from './safeLog';

/** Нормальные события прохождения, фиксируемые в таблице events. */
export type EventType = 'open' | 'complete' | 'choice_correct' | 'choice_wrong';

/**
 * Типы ОШИБОЧНЫХ событий рантайма (часть 1). Пишутся той же events-таблицей с
 * заполненным полем detail (что за файл/itemId/сообщение). Фундамент диагностики:
 * по этим записям видно, что именно повредилось после установки.
 */
export type ErrorEventType =
  | 'error_image' // картинка не загрузилась (onError expo-image)
  | 'error_audio' // аудио не проигралось/файл недоступен
  | 'error_manifest' // manifest.json битый/не проходит схему
  | 'error_pack' // пак/элемент скрыт из-за отсутствующих файлов
  | 'error_fs' // файловая операция провалилась (чтение/копирование/импорт)
  | 'error_render'; // неперехваченная ошибка рендера (Error Boundary)

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
// Ошибочные события (диагностика graceful degradation)
// ---------------------------------------------------------------------------

/**
 * Безопасно логирует ошибку рантайма в events. НИКОГДА не кидает (runSafely):
 * если БД недоступна — молча проглатывает. Пишет локально в SQLite, без сети.
 *
 * @param type  тип ошибки (ErrorEventType).
 * @param detail что именно сломалось: путь к файлу / itemId / packId / сообщение.
 * profile_id и item_id оставляем NULL — ошибка может возникнуть до выбора профиля
 * (скан каталога, bootstrap); вся информативная нагрузка идёт в detail.
 */
export async function logError(type: ErrorEventType, detail: string): Promise<void> {
  await runSafely(`logError:${type}`, async () => {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO events (profile_id, item_id, event_type, detail, created_at) VALUES (?, ?, ?, ?, ?);',
      null,
      null,
      type,
      detail,
      Date.now(),
    );
  });
}

// ---------------------------------------------------------------------------
// Установленные паки (зеркало того, что распаковано в documentDirectory)
// ---------------------------------------------------------------------------

/** Отмечает пак установленным/обновлённым (UPSERT по версии). version — semver-строка. */
export async function markPackInstalled(
  packId: string,
  version: string,
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

/** Версия (semver-строка) установленного пака или null, если не установлен. */
export async function getInstalledPackVersion(packId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ version: string }>(
    'SELECT version FROM installed_packs WHERE pack_id = ?;',
    packId,
  );
  return row?.version ?? null;
}
