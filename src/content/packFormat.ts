/**
 * src/content/packFormat.ts — ЧИСТАЯ (без нативных модулей) логика формата .barka.
 *
 * .barka = обычный ZIP с расширением, внутри — та же структура, что и у папки пака:
 *   manifest.json + images/*.webp + audio/*.opus.
 *
 * Здесь живёт всё, что НЕ требует устройства: упаковка/распаковка (fflate), расчёт
 * contentHash (sha256.ts), валидация схемы/версии/целостности. Благодаря отсутствию
 * импортов expo-* этот модуль исполним в headless-Node (через транспиляцию TS) — это
 * позволяет round-trip тесту гонять РЕАЛЬНЫЙ продакшн-код упаковки и проверки.
 *
 * I/O-обёртки поверх этого (чтение файлов пака, expo-sharing, document-picker) —
 * в src/content/packArchive.ts.
 */
import { unzipSync, zipSync } from 'fflate';

import { sha256Hex, utf8Bytes } from './sha256';
import type { PackManifest } from './types';

/** Расширение файла дистрибуции (один файл = один пак, передаётся по Bluetooth/Xender/SD). */
export const PACK_ARCHIVE_EXT = '.barka';

/**
 * Версия СХЕМЫ манифеста (не контента), которую понимает эта сборка приложения.
 * Поднимать при несовместимом изменении формы манифеста + добавлять миграцию.
 */
export const SUPPORTED_SCHEMA_VERSION = 1;

/** Имя файла манифеста внутри пака/архива. */
export const MANIFEST_NAME = 'manifest.json';

/** Карта «относительный путь внутри пака → байты файла». */
export type PackFiles = Record<string, Uint8Array>;

/** Причина отказа импорта — машинно-читаемый код + человекочитаемая деталь. */
export type ImportRejectReason =
  | 'no-manifest'
  | 'bad-json'
  | 'bad-shape'
  | 'schema-too-new'
  | 'schema-unreadable'
  | 'hash-mismatch'
  | 'missing-files';

export interface ImportAnalysis {
  ok: boolean;
  manifest?: PackManifest;
  reason?: ImportRejectReason;
  detail?: string;
}

// ---------------------------------------------------------------------------
// ZIP (fflate)
// ---------------------------------------------------------------------------

/** Упаковать карту файлов в один ZIP (.barka). Без сжатия мелочи — данные уже сжаты (WebP/Opus). */
export function zipPack(files: PackFiles): Uint8Array {
  // level:0 — WebP/Opus уже сжаты, повторное сжатие лишь жжёт CPU без выигрыша.
  const zippable: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const [path, bytes] of Object.entries(files)) {
    zippable[path] = [bytes, { level: 0 }];
  }
  return zipSync(zippable);
}

/** Распаковать ZIP (.barka) в карту файлов. Директории-записи отбрасываются. */
export function unzipPack(bytes: Uint8Array): PackFiles {
  const raw = unzipSync(bytes);
  const out: PackFiles = {};
  for (const [path, data] of Object.entries(raw)) {
    if (path.endsWith('/')) continue; // запись-директория
    out[path] = data;
  }
  return out;
}

// ---------------------------------------------------------------------------
// contentHash — целостность после передачи (Bluetooth оборвался / SD побилась)
// ---------------------------------------------------------------------------

/**
 * Детерминированный хэш СОДЕРЖИМОГО пака. Алгоритм (канонический, версионируется
 * префиксом `sha256:`):
 *   1. берём все файлы КРОМЕ manifest.json (манифест не может хэшировать сам себя —
 *      в нём же лежит contentHash);
 *   2. сортируем относительные пути лексикографически;
 *   3. для каждого: строка `<path>\0<sha256(bytes)>\n`;
 *   4. конкатенация → UTF-8 → sha256 → hex, с префиксом `sha256:`.
 * Любая корректная реализация SHA-256 даст тот же результат → Node и RN совпадают.
 *
 * Манифест (маленький JSON) хэшем не покрыт намеренно: при его порче падает JSON.parse
 * или валидация схемы; назначение contentHash — поймать порчу тяжёлых бинарников.
 */
export function computeContentHash(files: PackFiles): string {
  const paths = Object.keys(files)
    .filter((p) => p !== MANIFEST_NAME)
    .sort();
  let acc = '';
  for (const p of paths) {
    acc += `${p}\0${sha256Hex(files[p])}\n`;
  }
  return `sha256:${sha256Hex(utf8Bytes(acc))}`;
}

// ---------------------------------------------------------------------------
// semver-сравнение версий КОНТЕНТА (политика обновления при коллизии packId)
// ---------------------------------------------------------------------------

/**
 * Сравнивает две версии контента. Понимает semver-строки ("1.2.0"), голые числа
 * ("3", 3 — legacy) и недостающие компоненты. Возвращает <0, 0, >0.
 * Нечисловые/битые компоненты трактуются как 0 (мягко, без краха).
 */
export function compareVersions(a: string | number, b: string | number): number {
  const pa = String(a).split('.');
  const pb = String(b).split('.');
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = parseInt(pa[i] ?? '0', 10) || 0;
    const y = parseInt(pb[i] ?? '0', 10) || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Валидация манифеста, версии схемы, целостности
// ---------------------------------------------------------------------------

/**
 * Эффективная schemaVersion манифеста. Отсутствует → legacy v1 (поле введено позже).
 */
export function effectiveSchemaVersion(m: { schemaVersion?: unknown }): number {
  return typeof m.schemaVersion === 'number' ? m.schemaVersion : 1;
}

/** Минимальная валидация формы манифеста (форма данных на диске, не контент). */
export function isValidManifestShape(m: unknown): m is PackManifest {
  if (typeof m !== 'object' || m === null) return false;
  const c = m as Partial<PackManifest>;
  return (
    typeof c.packId === 'string' &&
    c.packId.length > 0 &&
    (typeof c.version === 'string' || typeof c.version === 'number') &&
    Array.isArray(c.items)
  );
}

/**
 * Решение по версии схемы (часть 1):
 *  - > SUPPORTED → 'schema-too-new': пак не поддерживается этой сборкой, мягкий отказ.
 *  - < SUPPORTED → читаем (forward-compatible), место под миграцию заложено ниже.
 *  - отсутствует → legacy v1, читаем (вызывающий код логирует предупреждение).
 */
export function checkSchemaVersion(
  m: PackManifest,
): { ok: true; legacy: boolean } | { ok: false; reason: 'schema-too-new'; detail: string } {
  const v = effectiveSchemaVersion(m);
  if (v > SUPPORTED_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'schema-too-new',
      detail: `manifest schemaVersion ${v} > supported ${SUPPORTED_SCHEMA_VERSION}`,
    };
  }
  // Здесь будет ветка миграции старых схем (v < SUPPORTED), когда появится v2:
  //   if (v < SUPPORTED_SCHEMA_VERSION) m = migrateManifest(m, v);
  return { ok: true, legacy: typeof m.schemaVersion !== 'number' };
}

/** Все относительные пути ассетов, на которые ссылается манифест. */
export function manifestAssetPaths(m: PackManifest): string[] {
  const paths = new Set<string>();
  for (const item of m.items) {
    if (item.cover) paths.add(item.cover);
    for (const page of item.pages) {
      paths.add(page.image);
      paths.add(page.audio);
      for (const c of page.choices ?? []) {
        paths.add(c.image);
        paths.add(c.audio);
      }
    }
  }
  return [...paths];
}

/**
 * Полный разбор распакованного архива перед регистрацией пака (часть 3, шаги 2-4):
 * парсинг манифеста → форма → версия схемы → contentHash → присутствие всех файлов.
 * Чисто и без сайд-эффектов: возвращает решение, не трогает диск.
 */
export function analyzeArchive(files: PackFiles): ImportAnalysis {
  const manifestBytes = files[MANIFEST_NAME];
  if (!manifestBytes) return { ok: false, reason: 'no-manifest', detail: 'manifest.json отсутствует в архиве' };

  let manifest: PackManifest;
  try {
    manifest = JSON.parse(bytesToUtf8(manifestBytes)) as PackManifest;
  } catch (e) {
    return { ok: false, reason: 'bad-json', detail: String(e) };
  }
  if (!isValidManifestShape(manifest)) {
    return { ok: false, reason: 'bad-shape', detail: 'манифест не проходит валидацию формы' };
  }

  const schema = checkSchemaVersion(manifest);
  if (!schema.ok) return { ok: false, manifest, reason: schema.reason, detail: schema.detail };

  // Целостность: пересчитать contentHash и сверить с заявленным в манифесте.
  const expected = manifest.contentHash;
  if (typeof expected === 'string' && expected.length > 0) {
    const actual = computeContentHash(files);
    if (actual !== expected) {
      return { ok: false, manifest, reason: 'hash-mismatch', detail: `${expected} != ${actual}` };
    }
  }

  // Все ассеты из манифеста должны присутствовать в архиве.
  const missing = manifestAssetPaths(manifest).filter((p) => !(p in files));
  if (missing.length > 0) {
    return { ok: false, manifest, reason: 'missing-files', detail: `нет файлов: ${missing.join(', ')}` };
  }

  return { ok: true, manifest };
}

// ---------------------------------------------------------------------------
// Внутреннее
// ---------------------------------------------------------------------------

/** UTF-8 декодирование байтов в строку (TextDecoder есть в RN Hermes и в Node). */
export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}
