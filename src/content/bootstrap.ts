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

import { getInstalledPackVersion, logError, markPackInstalled } from '../db/progress';
import { ensurePacksRoot, packsRoot } from './catalog';
import { compareVersions } from './packFormat';
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
 * Сейчас содержит тестовый пак core_demo (раздел 10, шаг 4): 11 ContentItem
 * (3 story + 5 number + 3 letter), синтетические .webp/.opus плейсхолдеры.
 * Реестр сгенерирован из манифеста — каждый ассет здесь продублирован require()'ом,
 * чтобы Metro его забандлил; ключи совпадают с относительными путями в manifest.json.
 */
/* eslint-disable @typescript-eslint/no-require-imports --
   Вшитые ассеты ОБЯЗАНЫ подключаться через require(): только статический require
   заставляет Metro забандлить файл и выдать его localUri в рантайме. import тут не
   работает для .webp/.opus/.json-паков. */
export const BUNDLED_PACKS: BundledPack[] = [
  {
    manifest: require('../../assets/bundled-packs/core_demo/manifest.json'),
    assets: {
      'audio/letter_fr_a_p1.opus': require('../../assets/bundled-packs/core_demo/audio/letter_fr_a_p1.opus'),
      'audio/letter_fr_a_p1_c1.opus': require('../../assets/bundled-packs/core_demo/audio/letter_fr_a_p1_c1.opus'),
      'audio/letter_fr_a_p1_c2.opus': require('../../assets/bundled-packs/core_demo/audio/letter_fr_a_p1_c2.opus'),
      'audio/letter_fr_a_p1_c3.opus': require('../../assets/bundled-packs/core_demo/audio/letter_fr_a_p1_c3.opus'),
      'audio/letter_fr_b_p1.opus': require('../../assets/bundled-packs/core_demo/audio/letter_fr_b_p1.opus'),
      'audio/letter_fr_b_p1_c1.opus': require('../../assets/bundled-packs/core_demo/audio/letter_fr_b_p1_c1.opus'),
      'audio/letter_fr_b_p1_c2.opus': require('../../assets/bundled-packs/core_demo/audio/letter_fr_b_p1_c2.opus'),
      'audio/letter_fr_b_p1_c3.opus': require('../../assets/bundled-packs/core_demo/audio/letter_fr_b_p1_c3.opus'),
      'audio/letter_fr_c_p1.opus': require('../../assets/bundled-packs/core_demo/audio/letter_fr_c_p1.opus'),
      'audio/letter_fr_c_p1_c1.opus': require('../../assets/bundled-packs/core_demo/audio/letter_fr_c_p1_c1.opus'),
      'audio/letter_fr_c_p1_c2.opus': require('../../assets/bundled-packs/core_demo/audio/letter_fr_c_p1_c2.opus'),
      'audio/letter_fr_c_p1_c3.opus': require('../../assets/bundled-packs/core_demo/audio/letter_fr_c_p1_c3.opus'),
      'audio/number_fr_001_p1.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_001_p1.opus'),
      'audio/number_fr_001_p1_c1.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_001_p1_c1.opus'),
      'audio/number_fr_001_p1_c2.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_001_p1_c2.opus'),
      'audio/number_fr_001_p1_c3.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_001_p1_c3.opus'),
      'audio/number_fr_002_p1.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_002_p1.opus'),
      'audio/number_fr_002_p1_c1.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_002_p1_c1.opus'),
      'audio/number_fr_002_p1_c2.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_002_p1_c2.opus'),
      'audio/number_fr_002_p1_c3.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_002_p1_c3.opus'),
      'audio/number_fr_003_p1.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_003_p1.opus'),
      'audio/number_fr_003_p1_c1.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_003_p1_c1.opus'),
      'audio/number_fr_003_p1_c2.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_003_p1_c2.opus'),
      'audio/number_fr_003_p1_c3.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_003_p1_c3.opus'),
      'audio/number_fr_004_p1.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_004_p1.opus'),
      'audio/number_fr_004_p1_c1.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_004_p1_c1.opus'),
      'audio/number_fr_004_p1_c2.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_004_p1_c2.opus'),
      'audio/number_fr_004_p1_c3.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_004_p1_c3.opus'),
      'audio/number_fr_005_p1.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_005_p1.opus'),
      'audio/number_fr_005_p1_c1.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_005_p1_c1.opus'),
      'audio/number_fr_005_p1_c2.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_005_p1_c2.opus'),
      'audio/number_fr_005_p1_c3.opus': require('../../assets/bundled-packs/core_demo/audio/number_fr_005_p1_c3.opus'),
      'audio/story_fr_demo_001_p1.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_001_p1.opus'),
      'audio/story_fr_demo_001_p2.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_001_p2.opus'),
      'audio/story_fr_demo_001_p2_c1.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_001_p2_c1.opus'),
      'audio/story_fr_demo_001_p2_c2.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_001_p2_c2.opus'),
      'audio/story_fr_demo_001_p2_c3.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_001_p2_c3.opus'),
      'audio/story_fr_demo_001_p3.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_001_p3.opus'),
      'audio/story_fr_demo_001_p4.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_001_p4.opus'),
      'audio/story_fr_demo_001_p4_c1.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_001_p4_c1.opus'),
      'audio/story_fr_demo_001_p4_c2.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_001_p4_c2.opus'),
      'audio/story_fr_demo_001_p4_c3.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_001_p4_c3.opus'),
      'audio/story_fr_demo_002_p1.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_002_p1.opus'),
      'audio/story_fr_demo_002_p2.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_002_p2.opus'),
      'audio/story_fr_demo_002_p3.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_002_p3.opus'),
      'audio/story_fr_demo_003_p1.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_003_p1.opus'),
      'audio/story_fr_demo_003_p2.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_003_p2.opus'),
      'audio/story_fr_demo_003_p3.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_003_p3.opus'),
      'audio/story_fr_demo_003_p4.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_003_p4.opus'),
      'audio/story_fr_demo_003_p5.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_003_p5.opus'),
      'audio/story_fr_demo_003_p5_c1.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_003_p5_c1.opus'),
      'audio/story_fr_demo_003_p5_c2.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_003_p5_c2.opus'),
      'audio/story_fr_demo_003_p5_c3.opus': require('../../assets/bundled-packs/core_demo/audio/story_fr_demo_003_p5_c3.opus'),
      'images/cover_letter_fr_a.webp': require('../../assets/bundled-packs/core_demo/images/cover_letter_fr_a.webp'),
      'images/cover_letter_fr_b.webp': require('../../assets/bundled-packs/core_demo/images/cover_letter_fr_b.webp'),
      'images/cover_letter_fr_c.webp': require('../../assets/bundled-packs/core_demo/images/cover_letter_fr_c.webp'),
      'images/cover_number_fr_001.webp': require('../../assets/bundled-packs/core_demo/images/cover_number_fr_001.webp'),
      'images/cover_number_fr_002.webp': require('../../assets/bundled-packs/core_demo/images/cover_number_fr_002.webp'),
      'images/cover_number_fr_003.webp': require('../../assets/bundled-packs/core_demo/images/cover_number_fr_003.webp'),
      'images/cover_number_fr_004.webp': require('../../assets/bundled-packs/core_demo/images/cover_number_fr_004.webp'),
      'images/cover_number_fr_005.webp': require('../../assets/bundled-packs/core_demo/images/cover_number_fr_005.webp'),
      'images/cover_story_fr_demo_001.webp': require('../../assets/bundled-packs/core_demo/images/cover_story_fr_demo_001.webp'),
      'images/cover_story_fr_demo_002.webp': require('../../assets/bundled-packs/core_demo/images/cover_story_fr_demo_002.webp'),
      'images/cover_story_fr_demo_003.webp': require('../../assets/bundled-packs/core_demo/images/cover_story_fr_demo_003.webp'),
      'images/letter_fr_a_p1.webp': require('../../assets/bundled-packs/core_demo/images/letter_fr_a_p1.webp'),
      'images/letter_fr_a_p1_c1.webp': require('../../assets/bundled-packs/core_demo/images/letter_fr_a_p1_c1.webp'),
      'images/letter_fr_a_p1_c2.webp': require('../../assets/bundled-packs/core_demo/images/letter_fr_a_p1_c2.webp'),
      'images/letter_fr_a_p1_c3.webp': require('../../assets/bundled-packs/core_demo/images/letter_fr_a_p1_c3.webp'),
      'images/letter_fr_b_p1.webp': require('../../assets/bundled-packs/core_demo/images/letter_fr_b_p1.webp'),
      'images/letter_fr_b_p1_c1.webp': require('../../assets/bundled-packs/core_demo/images/letter_fr_b_p1_c1.webp'),
      'images/letter_fr_b_p1_c2.webp': require('../../assets/bundled-packs/core_demo/images/letter_fr_b_p1_c2.webp'),
      'images/letter_fr_b_p1_c3.webp': require('../../assets/bundled-packs/core_demo/images/letter_fr_b_p1_c3.webp'),
      'images/letter_fr_c_p1.webp': require('../../assets/bundled-packs/core_demo/images/letter_fr_c_p1.webp'),
      'images/letter_fr_c_p1_c1.webp': require('../../assets/bundled-packs/core_demo/images/letter_fr_c_p1_c1.webp'),
      'images/letter_fr_c_p1_c2.webp': require('../../assets/bundled-packs/core_demo/images/letter_fr_c_p1_c2.webp'),
      'images/letter_fr_c_p1_c3.webp': require('../../assets/bundled-packs/core_demo/images/letter_fr_c_p1_c3.webp'),
      'images/number_fr_001_p1.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_001_p1.webp'),
      'images/number_fr_001_p1_c1.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_001_p1_c1.webp'),
      'images/number_fr_001_p1_c2.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_001_p1_c2.webp'),
      'images/number_fr_001_p1_c3.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_001_p1_c3.webp'),
      'images/number_fr_002_p1.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_002_p1.webp'),
      'images/number_fr_002_p1_c1.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_002_p1_c1.webp'),
      'images/number_fr_002_p1_c2.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_002_p1_c2.webp'),
      'images/number_fr_002_p1_c3.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_002_p1_c3.webp'),
      'images/number_fr_003_p1.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_003_p1.webp'),
      'images/number_fr_003_p1_c1.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_003_p1_c1.webp'),
      'images/number_fr_003_p1_c2.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_003_p1_c2.webp'),
      'images/number_fr_003_p1_c3.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_003_p1_c3.webp'),
      'images/number_fr_004_p1.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_004_p1.webp'),
      'images/number_fr_004_p1_c1.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_004_p1_c1.webp'),
      'images/number_fr_004_p1_c2.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_004_p1_c2.webp'),
      'images/number_fr_004_p1_c3.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_004_p1_c3.webp'),
      'images/number_fr_005_p1.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_005_p1.webp'),
      'images/number_fr_005_p1_c1.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_005_p1_c1.webp'),
      'images/number_fr_005_p1_c2.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_005_p1_c2.webp'),
      'images/number_fr_005_p1_c3.webp': require('../../assets/bundled-packs/core_demo/images/number_fr_005_p1_c3.webp'),
      'images/story_fr_demo_001_p1.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_001_p1.webp'),
      'images/story_fr_demo_001_p2.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_001_p2.webp'),
      'images/story_fr_demo_001_p2_c1.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_001_p2_c1.webp'),
      'images/story_fr_demo_001_p2_c2.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_001_p2_c2.webp'),
      'images/story_fr_demo_001_p2_c3.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_001_p2_c3.webp'),
      'images/story_fr_demo_001_p3.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_001_p3.webp'),
      'images/story_fr_demo_001_p4.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_001_p4.webp'),
      'images/story_fr_demo_001_p4_c1.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_001_p4_c1.webp'),
      'images/story_fr_demo_001_p4_c2.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_001_p4_c2.webp'),
      'images/story_fr_demo_001_p4_c3.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_001_p4_c3.webp'),
      'images/story_fr_demo_002_p1.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_002_p1.webp'),
      'images/story_fr_demo_002_p2.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_002_p2.webp'),
      'images/story_fr_demo_002_p3.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_002_p3.webp'),
      'images/story_fr_demo_003_p1.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_003_p1.webp'),
      'images/story_fr_demo_003_p2.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_003_p2.webp'),
      'images/story_fr_demo_003_p3.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_003_p3.webp'),
      'images/story_fr_demo_003_p4.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_003_p4.webp'),
      'images/story_fr_demo_003_p5.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_003_p5.webp'),
      'images/story_fr_demo_003_p5_c1.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_003_p5_c1.webp'),
      'images/story_fr_demo_003_p5_c2.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_003_p5_c2.webp'),
      'images/story_fr_demo_003_p5_c3.webp': require('../../assets/bundled-packs/core_demo/images/story_fr_demo_003_p5_c3.webp'),
    },
  },
];
/* eslint-enable @typescript-eslint/no-require-imports */

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

    // Распаковка каждого пака изолирована: сбой одного (нет места, битый ассет)
    // НЕ должен валить старт — приложение поднимется с тем, что удалось распаковать.
    try {
      const current = await getInstalledPackVersion(packId);
      if (current !== null && compareVersions(current, version) >= 0) {
        // Уже распакован и не старее — пропускаем (semver-сравнение).
        installed.add(packId);
        continue;
      }

      await extractPack(pack);
      await markPackInstalled(packId, version);
      installed.add(packId);
    } catch (e) {
      // Помечаем как bundled НЕ будем (распаковка не удалась); каталог стартует без него.
      void logError('error_fs', `bootstrap(${packId}): ${String(e)}`);
    }
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
