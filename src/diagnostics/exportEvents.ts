/**
 * src/diagnostics/exportEvents.ts — выгрузка локальных событий в JSON-файл.
 *
 * Тонкая нативная обёртка (SQLite + expo-file-system + expo-sharing) поверх ЧИСТОГО
 * билдера payload (exportPayload.ts). Читает события/прогресс/профили/паки prepared
 * statements'ами, собирает анонимный версионированный отчёт и отдаёт его одним файлом
 * через системный Share intent. Без сети и серверов — единственный офлайн-канал фидбэка.
 *
 * РЕШЕНИЕ по объёму: агрегаты считаются по ВСЕМ событиям; сырые события включаются все
 * до высокого лимита (DEFAULT_RAW_EVENT_LIMIT). Для офлайн-продукта на устройство объёмы
 * невелики (тысячи), лимит — лишь страховка от патологически большого файла.
 */
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getDb } from '../db/client';
import { logError } from '../db/progress';
import {
  buildExportPayload,
  getOrCreateDeviceId,
  shortDeviceId,
  type BuildInput,
  type DeviceIdStore,
  type EventInput,
  type ExportPayload,
  type PackInput,
  type ProfileInput,
  type ProgressInput,
} from './exportPayload';

const DEVICE_ID_KEY = 'device_id';

/** Краткая сводка для превью в уголке взрослого. */
export interface EventCounts {
  events: number;
  errors: number;
}

/** Результат экспорта (для UI). */
export interface ExportResult {
  fileUri: string;
  events: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// device_id (анонимный, персистентный)
// ---------------------------------------------------------------------------

async function readAppMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?;', key);
  return row?.value ?? null;
}

async function writeAppMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    key,
    value,
  );
}

/**
 * Возвращает анонимный device_id, создавая и сохраняя его один раз. Случайный UUID,
 * НЕ привязан к железу (не IMEI/serial/MAC). Стабилен между запусками.
 */
export async function getOrCreateDeviceIdAsync(): Promise<string> {
  const existing = await readAppMeta(DEVICE_ID_KEY);
  let toPersist: string | null = null;
  const store: DeviceIdStore = {
    get: () => existing,
    set: (v) => {
      toPersist = v;
    },
  };
  const id = getOrCreateDeviceId(store);
  if (toPersist) await writeAppMeta(DEVICE_ID_KEY, toPersist);
  return id;
}

// ---------------------------------------------------------------------------
// Сбор payload из БД
// ---------------------------------------------------------------------------

/** Лёгкая сводка (счётчики) для превью — без выгрузки всех строк. */
export async function getEventCounts(): Promise<EventCounts> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ event_type: string; c: number }>(
      'SELECT event_type, COUNT(*) AS c FROM events GROUP BY event_type;',
    );
    let events = 0;
    let errors = 0;
    for (const r of rows) {
      events += r.c;
      if (r.event_type?.startsWith('error_')) errors += r.c;
    }
    return { events, errors };
  } catch (e) {
    void logError('error_fs', `getEventCounts: ${String(e)}`);
    return { events: 0, errors: 0 };
  }
}

/**
 * Собирает payload экспорта из SQLite. НЕ кидает: при ошибке логирует и возвращает
 * валидный минимальный отчёт (пустые агрегаты), чтобы экспорт всё равно прошёл.
 */
export async function buildExportPayloadFromDb(exportedAt: number = Date.now()): Promise<ExportPayload> {
  const appVersion = Constants.expoConfig?.version ?? '0.0.0';

  let deviceId = 'unknown';
  try {
    deviceId = await getOrCreateDeviceIdAsync();
  } catch (e) {
    void logError('error_fs', `deviceId: ${String(e)}`);
  }

  const empty: BuildInput = { events: [], profiles: [], progress: [], packs: [], appVersion, deviceId, exportedAt };

  try {
    const db = await getDb();
    const [eventRows, profileRows, progressRows, packRows] = await Promise.all([
      // Имя профиля НЕ выбираем — приватность по умолчанию (defense in depth).
      db.getAllAsync<{ profile_id: number | null; item_id: string | null; event_type: string; detail: string | null; created_at: number | null }>(
        'SELECT profile_id, item_id, event_type, detail, created_at FROM events ORDER BY created_at ASC;',
      ),
      db.getAllAsync<{ id: number; created_at: number | null }>('SELECT id, created_at FROM profiles;'),
      db.getAllAsync<{ profile_id: number | null; item_id: string | null; completed_at: number | null }>(
        'SELECT profile_id, item_id, completed_at FROM progress;',
      ),
      db.getAllAsync<{ pack_id: string; version: string; installed_at: number | null }>(
        'SELECT pack_id, version, installed_at FROM installed_packs;',
      ),
    ]);

    const events: EventInput[] = eventRows.map((r) => ({
      profileId: r.profile_id,
      itemId: r.item_id,
      type: r.event_type,
      detail: r.detail,
      createdAt: r.created_at,
    }));
    const profiles: ProfileInput[] = profileRows.map((r) => ({ id: r.id, createdAt: r.created_at }));
    const progress: ProgressInput[] = progressRows.map((r) => ({
      profileId: r.profile_id,
      itemId: r.item_id,
      completedAt: r.completed_at,
    }));
    const packs: PackInput[] = packRows.map((r) => ({ packId: r.pack_id, version: r.version, installedAt: r.installed_at }));

    return buildExportPayload({ events, profiles, progress, packs, appVersion, deviceId, exportedAt });
  } catch (e) {
    void logError('error_fs', `buildExportPayloadFromDb: ${String(e)}`);
    return buildExportPayload(empty);
  }
}

// ---------------------------------------------------------------------------
// Запись файла + Share intent
// ---------------------------------------------------------------------------

/** YYYY-MM-DD из epoch ms (для имени файла). */
function dateStamp(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 10);
}

/**
 * Собирает payload, пишет JSON во временный файл и отдаёт через системный Share intent.
 * Пустая БД → валидный минимальный отчёт (не падает). Возвращает сводку для UI.
 */
export async function exportEventsToFile(): Promise<ExportResult> {
  const exportedAt = Date.now();
  const payload = await buildExportPayloadFromDb(exportedAt);

  const name = `barka-events-${shortDeviceId(payload.app.deviceId)}-${dateStamp(exportedAt)}.json`;
  const out = new File(Paths.cache, name);
  if (out.exists) out.delete();
  out.create();
  out.write(JSON.stringify(payload, null, 2));

  if (await Sharing.isAvailableAsync()) {
    try {
      await Sharing.shareAsync(out.uri, {
        mimeType: 'application/json',
        dialogTitle: "Exporter les données d'usage Barka",
        UTI: 'public.json',
      });
    } catch {
      // Пользователь закрыл лист — намеренно тихо.
    }
  } else {
    console.warn('[exportEvents] Sharing недоступен на этом устройстве');
  }

  return { fileUri: out.uri, events: payload.summary.events.total, errors: payload.summary.errors.total };
}
