/**
 * scripts/gen-pack-manifest.mjs — нормализует манифест пака под формат дистрибуции.
 *
 * Дописывает/пересчитывает поля части 1 (версионирование + целостность):
 *   - schemaVersion: SUPPORTED_SCHEMA_VERSION
 *   - version: semver-строка (legacy-число N → "N.0.0")
 *   - dependencies: [] (резерв)
 *   - contentHash: РЕАЛЬНО посчитан по ассетам пака тем же кодом, что и рантайм RN
 *
 * Использует продакшн packFormat.ts (через loadTs) → contentHash гарантированно
 * совпадёт с тем, что приложение пересчитает при импорте .barka.
 *
 * Запуск:  node scripts/gen-pack-manifest.mjs [путь-к-папке-пака]
 *          (по умолчанию assets/bundled-packs/core_demo)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPackFormat, cleanup } from './lib/loadTs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = join(HERE, '..');
const packDir = process.argv[2]
  ? join(process.cwd(), process.argv[2])
  : join(PROJECT, 'assets', 'bundled-packs', 'core_demo');

const { SUPPORTED_SCHEMA_VERSION, computeContentHash, manifestAssetPaths } = loadPackFormat();

try {
  const manifestPath = join(packDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  // 1. schemaVersion
  manifest.schemaVersion = SUPPORTED_SCHEMA_VERSION;

  // 2. version → semver-строка
  if (typeof manifest.version === 'number') {
    manifest.version = `${manifest.version}.0.0`;
  } else if (typeof manifest.version !== 'string') {
    manifest.version = '1.0.0';
  }

  // 3. dependencies — резерв, всегда []
  manifest.dependencies = Array.isArray(manifest.dependencies) ? manifest.dependencies : [];

  // 4. contentHash — по тем же ассетам, что попадут в .barka (referenced paths)
  const files = {};
  for (const rel of manifestAssetPaths(manifest)) {
    files[rel] = new Uint8Array(readFileSync(join(packDir, rel)));
  }
  // contentHash хэширует только ассеты (manifest.json исключён внутри функции).
  manifest.contentHash = computeContentHash(files);

  // Перезаписываем манифест в стабильном порядке ключей (читаемый diff).
  const ordered = {
    packId: manifest.packId,
    schemaVersion: manifest.schemaVersion,
    version: manifest.version,
    lang: manifest.lang,
    displayName: manifest.displayName,
    sizeBytes: manifest.sizeBytes,
    contentHash: manifest.contentHash,
    dependencies: manifest.dependencies,
    items: manifest.items,
  };
  writeFileSync(manifestPath, JSON.stringify(ordered, null, 2) + '\n');

  console.log(`✓ ${manifest.packId}: schemaVersion=${manifest.schemaVersion} version=${manifest.version}`);
  console.log(`  contentHash=${manifest.contentHash}`);
  console.log(`  ассетов захэшировано: ${Object.keys(files).length}`);
} finally {
  cleanup();
}
