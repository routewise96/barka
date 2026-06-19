/**
 * src/content/packArchive.ts — формат дистрибуции пака «один файл .barka».
 *
 * ПОЧЕМУ ОДИН ФАЙЛ: реальные офлайн-транспорты (Bluetooth, Xender, SHAREit, SD-карта)
 * передают ОДИН ФАЙЛ, а не папку. Поэтому для распространения пак-папка
 * (<doc>/barka/packs/<id>/) упаковывается в один ZIP с расширением .barka, который
 * можно расшарить и импортировать обратно на другом телефоне.
 *
 * Этот модуль — тонкие I/O-обёртки (expo-file-system / expo-sharing / document-picker)
 * поверх ЧИСТОЙ логики формата из packFormat.ts (zip/unzip/хэш/валидация). Вся проверка
 * целостности и схемы — там; здесь только чтение/запись файлов и системные интенты.
 *
 * РЕШЕНИЕ по экспорту (Downloads vs Share intent): пишем .barka во временный
 * cacheDirectory и отдаём через системный Share intent (expo-sharing). Прямая запись в
 * Downloads на Android 10+ блокируется Scoped Storage (нужен SAF/нативное); Share intent
 * надёжно отдаёт файл в Xender/Bluetooth/мессенджер, и пользователь сам выбирает канал.
 *
 * РЕШЕНИЕ по импорту: только через системный file picker (expo-document-picker) —
 * он работает поверх SAF и не требует разрешений на чтение чужих папок. Автоскан папок
 * на .barka НЕ реализован: на Android 11+ Scoped Storage запрещает читать чужие
 * директории без SAF. См. scanForPacks ниже (намеренная заглушка).
 */
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { markPackInstalled } from '../db/progress';
import { packsRoot } from './catalog';
import {
  analyzeArchive,
  compareVersions,
  manifestAssetPaths,
  MANIFEST_NAME,
  PACK_ARCHIVE_EXT,
  unzipPack,
  zipPack,
  type ImportRejectReason,
  type PackFiles,
} from './packFormat';
import type { PackManifest } from './types';

/** Результат импорта .barka. */
export type ImportResult =
  | { ok: true; manifest: PackManifest; status: 'installed' | 'updated' | 'already-installed' | 'kept-newer' }
  | { ok: false; reason: ImportRejectReason; detail?: string };

// ---------------------------------------------------------------------------
// Экспорт: папка пака → один .barka в cacheDirectory
// ---------------------------------------------------------------------------

/**
 * Упаковывает папку установленного пака в один файл .barka в cacheDirectory.
 * Возвращает File готового архива (для последующего Share intent).
 * @throws если пак не найден на диске или манифест нечитаем.
 */
export async function exportPack(packId: string): Promise<File> {
  const packDir = new Directory(packsRoot(), packId);
  const manifestFile = new File(packDir, MANIFEST_NAME);
  if (!manifestFile.exists) {
    throw new Error(`exportPack: пак ${packId} не найден (${manifestFile.uri})`);
  }

  const manifest = JSON.parse(await manifestFile.text()) as PackManifest;

  // Кладём в архив manifest.json + ровно те ассеты, на которые он ссылается.
  const files: PackFiles = {};
  files[MANIFEST_NAME] = await manifestFile.bytes();
  for (const rel of manifestAssetPaths(manifest)) {
    const f = new File(packDir, ...rel.split('/'));
    if (!f.exists) throw new Error(`exportPack: отсутствует ассет ${rel}`);
    files[rel] = await f.bytes();
  }

  const archive = zipPack(files);

  const out = new File(Paths.cache, `${packId}${PACK_ARCHIVE_EXT}`);
  if (out.exists) out.delete();
  out.create();
  out.write(archive);
  return out;
}

/**
 * Экспортирует пак и открывает системный Share intent — пользователь сам отправляет
 * .barka через Xender/Bluetooth/мессенджер. Тихо выходит, если шеринг недоступен.
 */
export async function exportAndSharePack(packId: string): Promise<void> {
  const archive = await exportPack(packId);
  if (!(await Sharing.isAvailableAsync())) {
    console.warn('[packArchive] Sharing недоступен на этом устройстве');
    return;
  }
  try {
    await Sharing.shareAsync(archive.uri, {
      mimeType: 'application/zip',
      dialogTitle: 'Partager le pack Barka',
      UTI: 'public.zip-archive',
    });
  } catch {
    // Пользователь закрыл лист — намеренно тихо.
  }
}

// ---------------------------------------------------------------------------
// Импорт: .barka → зарегистрированный пак в packs/<id>/
// ---------------------------------------------------------------------------

/**
 * Импортирует .barka по URI (из file picker). Шаги (часть 3):
 *   1) прочитать байты, распаковать ZIP в память;
 *   2-4) валидировать манифест/схему/contentHash/присутствие файлов (analyzeArchive);
 *   5) идемпотентно записать в packs/<id>/ с политикой обновления по version;
 *   6) отметить в installed_packs.
 * Каталог здесь НЕ пересобирается — это делает вызывающий (store.refreshCatalog).
 */
export async function importPackFromUri(fileUri: string): Promise<ImportResult> {
  let files: PackFiles;
  try {
    const bytes = await new File(fileUri).bytes();
    files = unzipPack(bytes);
  } catch (e) {
    // Битый/обрезанный архив — ZIP не распаковался.
    console.warn(`[packArchive] импорт отклонён: архив нечитаем (${String(e)})`);
    return { ok: false, reason: 'hash-mismatch', detail: `unzip failed: ${String(e)}` };
  }

  const analysis = analyzeArchive(files);
  if (!analysis.ok) {
    console.warn(`[packArchive] импорт отклонён: ${analysis.reason} — ${analysis.detail ?? ''}`);
    return { ok: false, reason: analysis.reason!, detail: analysis.detail };
  }
  const manifest = analysis.manifest!;
  const packId = manifest.packId;

  // --- Политика обновления при коллизии packId ---
  const existingDir = new Directory(packsRoot(), packId);
  const existingManifest = new File(existingDir, MANIFEST_NAME);
  if (existingManifest.exists) {
    let prev: PackManifest | null = null;
    try {
      prev = JSON.parse(await existingManifest.text()) as PackManifest;
    } catch {
      prev = null; // битый существующий — перезапишем входящим
    }
    if (prev) {
      const cmp = compareVersions(manifest.version, prev.version);
      if (cmp < 0) return { ok: true, manifest: prev, status: 'kept-newer' };
      if (cmp === 0) return { ok: true, manifest: prev, status: 'already-installed' };
      // cmp > 0 — входящий новее: продолжаем, перезапишем.
    }
  }

  // --- Запись на диск (валидация уже пройдена в памяти) ---
  // Пишем во временную staging-папку, затем атомарно подменяем целевую — на любом
  // сбое целевой пак не остаётся полузаписанным. Чистим staging в finally.
  const stagingName = `.import-${packId}`;
  try {
    const staging = new Directory(Paths.cache, stagingName);
    if (staging.exists) staging.delete();
    staging.create({ intermediates: true });

    for (const [rel, data] of Object.entries(files)) {
      const dest = new File(staging, ...rel.split('/'));
      const parent = dest.parentDirectory;
      if (parent && !parent.exists) parent.create({ intermediates: true });
      dest.create();
      dest.write(data);
    }

    const wasUpdate = existingDir.exists;
    if (existingDir.exists) existingDir.delete();
    staging.move(existingDir); // staging → packs/<id>/ (после move staging.uri меняется!)

    await markPackInstalled(packId, manifest.version);
    return { ok: true, manifest, status: wasUpdate ? 'updated' : 'installed' };
  } finally {
    // Свежая ссылка на временный путь: после успешного move он уже не существует
    // (удаление — no-op), при сбое до move — подчищаем недописанное.
    const leftover = new Directory(Paths.cache, stagingName);
    if (leftover.exists) leftover.delete();
  }
}

/**
 * Открывает системный file picker и импортирует выбранный .barka.
 * Возвращает null, если пользователь отменил выбор.
 */
export async function pickAndImportPack(): Promise<ImportResult | null> {
  const res = await DocumentPicker.getDocumentAsync({
    // .barka не имеет стандартного MIME; на Android фильтр по расширению ненадёжен,
    // поэтому принимаем любой файл и валидируем содержимое сами (analyzeArchive).
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  return importPackFromUri(res.assets[0].uri);
}

/**
 * Автоскан типовых директорий на .barka — НЕ реализован намеренно.
 *
 * На Android 11+ Scoped Storage запрещает читать чужие папки (Downloads и т.п.) без
 * Storage Access Framework или нативных разрешений. Надёжный путь — импорт через
 * file picker (pickAndImportPack), который и так работает поверх SAF. Если позже
 * понадобится автоскан — добавлять через expo-file-system SAF, не трогая формат.
 */
export async function scanForPacks(): Promise<string[]> {
  console.warn('[packArchive] scanForPacks: автоскан отложён (Scoped Storage) — используйте file picker');
  return [];
}
