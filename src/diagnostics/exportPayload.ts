/**
 * src/diagnostics/exportPayload.ts — ЧИСТАЯ сборка payload экспорта событий.
 *
 * Barka сознательно офлайн и без серверов, но события (прогресс + ошибки) копятся
 * локально в SQLite. Единственный канал обратной связи к разработчику — выгрузка
 * этих событий в JSON-файл, который взрослый передаёт «руками» (Share intent).
 * Здесь — ТОЛЬКО форма данных и агрегаты, без нативных импортов (expo/sqlite),
 * поэтому модуль headless-тестируем тем же кодом, что и рантайм (через loadTs).
 *
 * ПРИВАТНОСТЬ (это данные об использовании детьми):
 *  - имена профилей НИКОГДА не попадают в вывод — профили обозначаются анонимным
 *    индексом (profile 1, 2, 3…); даже если name придёт во вход, билдер его игнорирует;
 *  - device_id — случайный неперсональный UUID (не привязан к железу);
 *  - detail ошибок очищается от абсолютных file:// путей (см. sanitizeDetail).
 */

/** Версия СХЕМЫ экспорта — поднимать при несовместимых изменениях формата payload. */
export const EXPORT_SCHEMA_VERSION = 1;

/** Лимит на СЫРЫЕ события в файле (агрегаты считаются по ВСЕМ, см. buildExportPayload). */
export const DEFAULT_RAW_EVENT_LIMIT = 50000;

const ERROR_TYPES = ['error_image', 'error_audio', 'error_manifest', 'error_pack', 'error_fs', 'error_render'];

// --- вход (сырые строки БД, спроецированные) -------------------------------

export interface EventInput {
  profileId: number | null;
  itemId: string | null;
  type: string;
  detail?: string | null;
  createdAt: number | null;
}
export interface ProfileInput {
  id: number;
  createdAt: number | null;
  /** Может прийти, но НИКОГДА не выводится (приватность). */
  name?: string | null;
}
export interface ProgressInput {
  profileId: number | null;
  itemId: string | null;
  completedAt: number | null;
}
export interface PackInput {
  packId: string;
  version: string;
  installedAt: number | null;
}
export interface BuildInput {
  events: EventInput[];
  profiles: ProfileInput[];
  progress: ProgressInput[];
  packs: PackInput[];
  appVersion: string;
  deviceId: string;
  /** Момент экспорта (epoch ms). */
  exportedAt: number;
  rawEventLimit?: number;
}

// --- выход (стабильная версионированная схема) ------------------------------

export interface ItemCount {
  itemId: string;
  count: number;
}
export interface ExportPayload {
  exportSchemaVersion: number;
  app: {
    version: string;
    deviceId: string;
    exportedAt: number;
    exportedAtIso: string;
  };
  packs: { packId: string; version: string; installedAt: number | null }[];
  summary: {
    profiles: number;
    events: { total: number; byType: Record<string, number> };
    completions: number;
    errors: { total: number; byType: Record<string, number> };
    topOpened: ItemCount[];
    topReplayed: ItemCount[];
    topDropoff: ItemCount[];
    rawEventsTotal: number;
    rawEventsIncluded: number;
    truncated: boolean;
  };
  profiles: { index: number; createdAt: number | null; completions: number }[];
  events: { at: number | null; profile: number | null; itemId: string | null; type: string; detail: string | null }[];
  progress: { profile: number | null; itemId: string | null; completedAt: number | null }[];
}

// ---------------------------------------------------------------------------

/** Очищает detail от абсолютных file:// путей: оставляет относительный хвост/имя файла. */
export function sanitizeDetail(detail: string | null | undefined): string | null {
  if (!detail) return null;
  return detail.replace(/file:\/\/\S+/g, (uri) => {
    // Хвост после '/barka/' (относительный путь пака) — самое информативное и не чувствительное.
    const i = uri.lastIndexOf('/barka/');
    if (i >= 0) return uri.slice(i + 1); // 'barka/packs/...'
    const slash = uri.lastIndexOf('/');
    return slash >= 0 ? uri.slice(slash + 1) : uri; // иначе — имя файла
  });
}

/** Случайный неперсональный UUID v4 (не криптостойкий — нужен лишь для различения устройств). */
export function newDeviceId(): string {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += hex[((Math.random() * 4) | 0) + 8];
    else s += hex[(Math.random() * 16) | 0];
  }
  return s;
}

/** Короткий префикс device_id для имени файла. */
export function shortDeviceId(id: string): string {
  return (id || 'unknown').replace(/-/g, '').slice(0, 8);
}

/** Хранилище device_id (инъектируется: SQLite в рантайме, фейк в тесте). */
export interface DeviceIdStore {
  get(): string | null;
  set(value: string): void;
}

/**
 * Возвращает device_id, создавая и сохраняя его ОДИН раз при первом обращении.
 * Стабилен между вызовами за счёт персистентности store.
 */
export function getOrCreateDeviceId(store: DeviceIdStore): string {
  const existing = store.get();
  if (existing) return existing;
  const id = newDeviceId();
  store.set(id);
  return id;
}

// ---------------------------------------------------------------------------

function countBy<T>(arr: T[], keyFn: (x: T) => string | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of arr) {
    const k = keyFn(x);
    if (k == null) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function topN(entries: [string, number][], n: number): ItemCount[] {
  return entries
    .map(([itemId, count]) => ({ itemId, count }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || a.itemId.localeCompare(b.itemId))
    .slice(0, n);
}

const TOP_N = 10;

/**
 * Собирает версионированный payload экспорта. Агрегаты считаются по ВСЕМ событиям;
 * массив сырых событий ограничен rawEventLimit (последние N) — агрегаты остаются
 * полными даже при усечении. Профили анонимизируются (индекс вместо имени).
 */
export function buildExportPayload(input: BuildInput): ExportPayload {
  const { events, profiles, progress, packs, appVersion, deviceId, exportedAt } = input;
  const rawLimit = input.rawEventLimit ?? DEFAULT_RAW_EVENT_LIMIT;

  // Анонимизация профилей: порядок по дате создания → индекс 1..n (имя отбрасывается).
  const ordered = [...profiles].sort(
    (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id - b.id,
  );
  const indexByPid = new Map<number, number>();
  ordered.forEach((p, i) => indexByPid.set(p.id, i + 1));
  const anon = (pid: number | null): number | null => (pid == null ? null : indexByPid.get(pid) ?? null);

  // Разбивка событий по типам.
  const byType: Record<string, number> = {};
  for (const e of events) byType[e.type] = (byType[e.type] ?? 0) + 1;

  // Сводка ошибок.
  const errorsByType: Record<string, number> = {};
  let errorsTotal = 0;
  for (const t of ERROR_TYPES) {
    if (byType[t]) {
      errorsByType[t] = byType[t];
      errorsTotal += byType[t];
    }
  }

  // Топы по item_id.
  const opens = countBy(
    events.filter((e) => e.type === 'open'),
    (e) => e.itemId,
  );
  const completes = countBy(
    events.filter((e) => e.type === 'complete'),
    (e) => e.itemId,
  );
  const topOpened = topN([...opens.entries()], TOP_N);
  // «переслушивания» — прокси: повторные открытия (openCount-1) среди открытых ≥2 раз.
  const topReplayed = topN(
    [...opens.entries()].filter(([, c]) => c >= 2).map(([id, c]) => [id, c - 1] as [string, number]),
    TOP_N,
  );
  // «где бросают» — открыто, но не завершено (opens - completes).
  const dropoff: [string, number][] = [];
  for (const [id, o] of opens.entries()) {
    const d = o - (completes.get(id) ?? 0);
    if (d > 0) dropoff.push([id, d]);
  }
  const topDropoff = topN(dropoff, TOP_N);

  // Прогресс по профилю (для счётчика completions у профиля).
  const completionsByPid = countBy(progress, (p) => (p.profileId == null ? null : String(p.profileId)));

  // Сырые события: последние rawLimit (по возрастанию времени), агрегаты — по всем.
  const sortedEvents = [...events].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const truncated = sortedEvents.length > rawLimit;
  const includedEvents = truncated ? sortedEvents.slice(-rawLimit) : sortedEvents;

  return {
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    app: {
      version: appVersion,
      deviceId,
      exportedAt,
      exportedAtIso: new Date(exportedAt).toISOString(),
    },
    packs: packs.map((p) => ({ packId: p.packId, version: p.version, installedAt: p.installedAt })),
    summary: {
      profiles: profiles.length,
      events: { total: events.length, byType },
      completions: progress.length,
      errors: { total: errorsTotal, byType: errorsByType },
      topOpened,
      topReplayed,
      topDropoff,
      rawEventsTotal: events.length,
      rawEventsIncluded: includedEvents.length,
      truncated,
    },
    profiles: ordered.map((p, i) => ({
      index: i + 1,
      createdAt: p.createdAt,
      completions: completionsByPid.get(String(p.id)) ?? 0,
    })),
    events: includedEvents.map((e) => ({
      at: e.createdAt,
      profile: anon(e.profileId),
      itemId: e.itemId,
      type: e.type,
      detail: sanitizeDetail(e.detail),
    })),
    progress: progress.map((p) => ({
      profile: anon(p.profileId),
      itemId: p.itemId,
      completedAt: p.completedAt,
    })),
  };
}
