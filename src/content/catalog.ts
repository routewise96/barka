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

import type { Catalog, CatalogEntry, ContentType, Lang, PackManifest, ResolvedPack } from './types';

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
  for (const entry of root.list()) {
    // Нас интересуют только подпапки-паки.
    if (!(entry instanceof Directory)) continue;

    const manifestFile = new File(entry, 'manifest.json');
    if (!manifestFile.exists) continue;

    let manifest: PackManifest;
    try {
      manifest = JSON.parse(await manifestFile.text()) as PackManifest;
    } catch {
      // Невалидный JSON — пропускаем пак, не падаем.
      continue;
    }
    if (!isValidManifest(manifest)) continue;

    packs.push({
      manifest,
      baseUri: withTrailingSlash(entry.uri),
      bundled: bundledPackIds.has(manifest.packId),
    });
  }

  // Собираем плоский список элементов и индекс по id.
  const items: CatalogEntry[] = [];
  const byId = new Map<string, CatalogEntry>();
  for (const pack of packs) {
    for (const item of pack.manifest.items) {
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

/** Минимальная валидация формы манифеста перед доверием к нему. */
function isValidManifest(m: unknown): m is PackManifest {
  if (typeof m !== 'object' || m === null) return false;
  const c = m as Partial<PackManifest>;
  return (
    typeof c.packId === 'string' &&
    typeof c.version === 'number' &&
    Array.isArray(c.items)
  );
}
