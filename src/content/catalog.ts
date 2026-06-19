/**
 * src/content/catalog.ts — сканер packs-директории и сборка единого каталога.
 *
 * При старте приложение сканирует <documentDirectory>/barka/packs/, читает все
 * manifest.json и строит каталог в памяти (раздел 3.4). Bundled и side-loaded
 * паки обрабатываются ОДИНАКОВО: критерий — наличие папки с валидным манифестом.
 *
 * Использует объектный FS-API Expo SDK 54 (File / Directory / Paths).
 */
import { Directory, File, Paths } from 'expo-file-system';

import { logError } from '../db/progress';
import { selectItems, type AssetExists } from './catalogPolicy';
import { checkSchemaVersion, isValidManifestShape } from './packFormat';
import type { Catalog, CatalogEntry, ContentItem, ContentType, Lang, PackManifest, ResolvedPack } from './types';

/** Имя корневой папки приложения в documentDirectory. */
export const APP_DIR = 'barka';
/** Имя папки с паками. */
export const PACKS_DIR = 'packs';

/** Корневая packs-директория: <documentDirectory>/barka/packs/. */
export function packsRoot(): Directory {
  return new Directory(Paths.document, APP_DIR, PACKS_DIR);
}

/** Гарантирует существование packs-директории (idempotent). */
export function ensurePacksRoot(): Directory {
  const root = packsRoot();
  if (!root.exists) {
    root.create({ intermediates: true });
  }
  return root;
}

/**
 * Сканирует packs/, парсит каждый manifest.json и строит единый каталог.
 * Битый/отсутствующий манифест пропускается, а не роняет приложение.
 *
 * @param bundledPackIds id паков, которые были распакованы из APK — нужно лишь
 *        чтобы пометить запись bundled/side-loaded; на логику не влияет.
 */
export async function scanCatalog(bundledPackIds: ReadonlySet<string> = new Set()): Promise<Catalog> {
  const root = ensurePacksRoot();

  const packs: ResolvedPack[] = [];
  // Отобранные (пригодные) элементы каждого пака — параллельно packs.
  const keptByPack = new Map<ResolvedPack, ContentItem[]>();

  for (const entry of root.list()) {
    // Нас интересуют только подпапки-паки.
    if (!(entry instanceof Directory)) continue;

    // Весь разбор пака — в try/catch: один битый пак не должен ронять весь каталог.
    try {
      const manifestFile = new File(entry, 'manifest.json');
      if (!manifestFile.exists) continue;

      let manifest: PackManifest;
      try {
        manifest = JSON.parse(await manifestFile.text()) as PackManifest;
      } catch {
        // Невалидный JSON — пропускаем ЭТОТ пак, остальные строятся как обычно.
        void logError('error_manifest', `${entry.uri}: невалидный JSON manifest.json`);
        continue;
      }
      if (!isValidManifestShape(manifest)) {
        void logError('error_manifest', `${entry.uri}: manifest не проходит схему`);
        continue;
      }

      // Версия схемы (часть 1): пак из будущей версии формата — мягко пропускаем.
      const schema = checkSchemaVersion(manifest);
      if (!schema.ok) {
        void logError('error_manifest', `${manifest.packId}: ${schema.detail}`);
        continue;
      }
      if (schema.legacy) {
        console.warn(`[catalog] пак ${manifest.packId} без schemaVersion — legacy v1`);
      }

      const pack: ResolvedPack = {
        manifest,
        baseUri: withTrailingSlash(entry.uri),
        bundled: bundledPackIds.has(manifest.packId),
      };

      // Точечная деградация (часть 4): отсеиваем элементы без пригодных страниц.
      const exists: AssetExists = (rel) => new File(entry, ...rel.split('/')).exists;
      const { kept, hidden } = selectItems(manifest.items, exists);
      for (const h of hidden) {
        void logError('error_pack', `${manifest.packId}/${h.id}: скрыт (${h.reason})`);
      }

      packs.push(pack);
      keptByPack.set(pack, kept);
    } catch (e) {
      // Любая FS-ошибка при разборе пака — пропускаем пак, не падаем.
      void logError('error_fs', `scanCatalog(${entry.uri}): ${String(e)}`);
      continue;
    }
  }

  // Собираем плоский список ПРИГОДНЫХ элементов и индекс по id.
  const items: CatalogEntry[] = [];
  const byId = new Map<string, CatalogEntry>();
  for (const pack of packs) {
    for (const item of keptByPack.get(pack) ?? []) {
      const e: CatalogEntry = { item, pack };
      items.push(e);
      byId.set(item.id, e); // при коллизии id побеждает последний найденный пак
    }
  }

  return { packs, items, byId };
}

/**
 * Превращает относительный путь из манифеста (image/audio/cover) в абсолютный
 * file:// URI внутри папки пака. UI и аудио-плеер работают только с этими URI.
 */
export function resolveAssetUri(pack: ResolvedPack, relativePath: string): string {
  return pack.baseUri + relativePath.replace(/^\/+/, '');
}

/** Элементы каталога заданного типа. */
export function entriesByType(catalog: Catalog, type: ContentType): CatalogEntry[] {
  return catalog.items.filter((e) => e.item.type === type);
}

/** Элементы каталога заданного языка. */
export function entriesByLang(catalog: Catalog, lang: Lang): CatalogEntry[] {
  return catalog.items.filter((e) => e.item.lang === lang);
}

// ---------------------------------------------------------------------------
// Внутреннее
// ---------------------------------------------------------------------------

function withTrailingSlash(uri: string): string {
  return uri.endsWith('/') ? uri : uri + '/';
}
