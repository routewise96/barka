/**
 * src/content/bootstrap.ts — распаковка bundled-паков при первом запуске.
 *
 * Bundled-паки вшиты в APK (assets/bundled-packs/). Чтобы каталог (catalog.ts)
 * видел их так же, как side-loaded паки, при первом запуске их надо СКОПИРОВАТЬ
 * в <documentDirectory>/barka/packs/. После этого код различий не делает.
 *
 * Метаданные «что установлено и какой версии» дублируются в таблицу
 * installed_packs (db/progress.ts) — это даёт дешёвую проверку «нужно ли
 * перезаписывать пак» без перечитывания файлов.
 *
 * Важно про bundled-ассеты в Expo: файлы из assets/ недоступны как обычные пути
 * в собранном приложении — их надо require() (чтобы Metro их забандлил) и
 * получить локальный URI через expo-asset. Поэтому bundled-пак описывается
 * РЕЕСТРОМ: манифест + карта «относительный путь → require(...)». Этот реестр
 * генерирует контент-пайплайн (раздел 8); здесь он пока пуст.
 */
import { Asset } from 'expo-asset';
import { Directory, File } from 'expo-file-system';

import { getInstalledPackVersion, markPackInstalled } from '../db/progress';
import { ensurePacksRoot, packsRoot } from './catalog';
import type { PackManifest } from './types';

/**
 * Описание одного вшитого пака для распаковки.
 * `assets` — относительный путь внутри пака → результат require() этого файла
 * (картинки/аудио). Манифест передаётся объектом (его тоже можно require()).
 */
export interface BundledPack {
  manifest: PackManifest;
  assets: Record<string, number>;
}

/**
 * Реестр вшитых паков. Заполняется контент-пайплайном, напр.:
 *
 *   export const BUNDLED_PACKS: BundledPack[] = [
 *     {
 *       manifest: require('../../assets/bundled-packs/core_fr/manifest.json'),
 *       assets: {
 *         'images/lion_001.webp': require('../../assets/bundled-packs/core_fr/images/lion_001.webp'),
 *         'audio/lion_001.opus':  require('../../assets/bundled-packs/core_fr/audio/lion_001.opus'),
 *       },
 *     },
 *   ];
 *
 * Пока пуст — на этапе каркаса вшитых паков ещё нет.
 */
export const BUNDLED_PACKS: BundledPack[] = [];

/**
 * Идемпотентно распаковывает все вшитые паки в documentDirectory.
 * Зовётся один раз при инициализации (app/_layout.tsx) ДО построения каталога.
 * Возвращает множество packId распакованных паков — для пометки bundled в каталоге.
 */
export async function bootstrapBundledPacks(): Promise<Set<string>> {
  ensurePacksRoot();
  const installed = new Set<string>();

  for (const pack of BUNDLED_PACKS) {
    const { packId, version } = pack.manifest;
    installed.add(packId);

    const current = await getInstalledPackVersion(packId);
    if (current !== null && current >= version) {
      // Уже распакован и не старее — пропускаем.
      continue;
    }

    await extractPack(pack);
    await markPackInstalled(packId, version);
  }

  return installed;
}

/** Записывает один пак (манифест + ассеты) в packs/<packId>/. */
async function extractPack(pack: BundledPack): Promise<void> {
  const packDir = new Directory(packsRoot(), pack.manifest.packId);
  if (!packDir.exists) {
    packDir.create({ intermediates: true });
  }

  // 1. manifest.json
  writeText(new File(packDir, 'manifest.json'), JSON.stringify(pack.manifest));

  // 2. ассеты по относительным путям (images/..., audio/...)
  for (const [relPath, assetModule] of Object.entries(pack.assets)) {
    const asset = Asset.fromModule(assetModule);
    await asset.downloadAsync(); // для вшитых ассетов лишь резолвит localUri
    if (!asset.localUri) continue;

    const dest = new File(packDir, ...relPath.split('/'));
    ensureParent(dest);
    if (dest.exists) dest.delete();
    new File(asset.localUri).copy(dest);
  }
}

// ---------------------------------------------------------------------------
// Внутреннее
// ---------------------------------------------------------------------------

function writeText(file: File, contents: string): void {
  if (file.exists) file.delete();
  file.create({ intermediates: true });
  file.write(contents);
}

/** Гарантирует существование родительской директории файла. */
function ensureParent(file: File): void {
  const parent = file.parentDirectory;
  if (parent && !parent.exists) {
    parent.create({ intermediates: true });
  }
}
