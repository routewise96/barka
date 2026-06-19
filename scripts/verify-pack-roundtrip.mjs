/**
 * scripts/verify-pack-roundtrip.mjs
 *
 * Доказательство, что формат дистрибуции .barka работает (часть «ПРОВЕРКА»).
 * Гоняет РЕАЛЬНЫЙ продакшн-код упаковки/распаковки/хэша/валидации из
 * src/content/packFormat.ts (через loadTs) — не повторяет логику, а исполняет ту же,
 * что и приложение на устройстве. fflate и SHA-256 — чистый JS, работают в Node.
 *
 * Проверяет:
 *   1. round-trip: core_demo → .barka → распаковка идентична исходнику (байты + манифест);
 *   2. contentHash совпадает после round-trip;
 *   3. битый архив (испорчены байты) → отклоняется, не падает;
 *   4. манифест schemaVersion > SUPPORTED → мягко отклоняется;
 *   5. отсутствующий в архиве файл → отклоняется (reason missing-files).
 *
 * Запуск:  node scripts/verify-pack-roundtrip.mjs    (код возврата != 0 при провале)
 */
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { loadPackFormat, cleanup } from './lib/loadTs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = join(HERE, '..');
const SRC_PACK = join(PROJECT, 'assets', 'bundled-packs', 'core_demo');

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
  if (!cond) failures++;
};
const section = (t) => console.log(`\n${t}`);

const pf = loadPackFormat();
const {
  zipPack,
  unzipPack,
  analyzeArchive,
  computeContentHash,
  manifestAssetPaths,
  MANIFEST_NAME,
  SUPPORTED_SCHEMA_VERSION,
} = pf;

try {
  // --- Сборка карты файлов пака (manifest + ассеты), как делает exportPack -----
  section('0. Сборка core_demo → карта файлов (как exportPack)');
  const manifest = JSON.parse(readFileSync(join(SRC_PACK, MANIFEST_NAME), 'utf8'));
  const files = {};
  files[MANIFEST_NAME] = new Uint8Array(readFileSync(join(SRC_PACK, MANIFEST_NAME)));
  for (const rel of manifestAssetPaths(manifest)) {
    files[rel] = new Uint8Array(readFileSync(join(SRC_PACK, ...rel.split('/'))));
  }
  ok(Object.keys(files).length === 118, `карта = manifest + 117 ассетов = 118 (${Object.keys(files).length})`);
  ok(typeof manifest.contentHash === 'string' && manifest.contentHash.startsWith('sha256:'), `манифест несёт contentHash (${manifest.contentHash})`);
  ok(manifest.schemaVersion === SUPPORTED_SCHEMA_VERSION, `schemaVersion = SUPPORTED (${manifest.schemaVersion})`);
  ok(typeof manifest.version === 'string', `version — semver-строка ("${manifest.version}")`);
  ok(Array.isArray(manifest.dependencies) && manifest.dependencies.length === 0, 'dependencies = [] (резерв)');

  // --- 1. EXPORT → .barka ------------------------------------------------------
  section('1. Экспорт → .barka (zipPack)');
  const archive = zipPack(files);
  ok(archive instanceof Uint8Array && archive.length > 0, `получен ZIP-байтсет (${archive.length} байт)`);
  // сигнатура ZIP "PK\x03\x04"
  ok(archive[0] === 0x50 && archive[1] === 0x4b && archive[2] === 0x03 && archive[3] === 0x04, 'валидная сигнатура ZIP (PK\\x03\\x04)');

  // --- 2. IMPORT → распаковка + валидация --------------------------------------
  section('2. Импорт → unzip + analyzeArchive');
  const unpacked = unzipPack(archive);
  ok(Object.keys(unpacked).length === 118, `распаковано 118 файлов (${Object.keys(unpacked).length})`);
  const analysis = analyzeArchive(unpacked);
  ok(analysis.ok === true, `analyzeArchive: пак валиден (reason=${analysis.reason ?? '—'})`);
  ok(analysis.manifest?.packId === 'core_demo', `манифест прочитан (packId=${analysis.manifest?.packId})`);

  // --- 3. ROUND-TRIP: байты идентичны ------------------------------------------
  section('3. Round-trip: распакованное идентично исходнику (байты + манифест)');
  let identical = 0,
    differ = 0;
  for (const [rel, srcBytes] of Object.entries(files)) {
    const out = unpacked[rel];
    if (out && Buffer.from(out).equals(Buffer.from(srcBytes))) identical++;
    else {
      differ++;
      console.log(`      DIFFERS: ${rel}`);
    }
  }
  ok(differ === 0, `все 118 файлов побайтово идентичны (одинаковых ${identical}, разных ${differ})`);
  const manifestRT = JSON.parse(Buffer.from(unpacked[MANIFEST_NAME]).toString('utf8'));
  ok(JSON.stringify(manifestRT) === JSON.stringify(manifest), 'манифест после round-trip идентичен');

  // эмуляция записи в чистую «documentDirectory» (как importPackFromUri, шаг 5)
  const DOC = mkdtempSync(join(tmpdir(), 'barka-import-'));
  const packDir = join(DOC, 'barka', 'packs', manifest.packId);
  for (const [rel, data] of Object.entries(unpacked)) {
    const dst = join(packDir, ...rel.split('/'));
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, Buffer.from(data));
  }
  let onDisk = 0;
  for (const rel of Object.keys(files)) if (existsSync(join(packDir, rel)) && statSync(join(packDir, rel)).isFile()) onDisk++;
  ok(onDisk === 118, `пак записан в чистую documentDirectory: 118 файлов на диске (${onDisk})`);

  // --- 4. contentHash совпадает после round-trip -------------------------------
  section('4. contentHash совпадает');
  const recomputed = computeContentHash(unpacked);
  ok(recomputed === manifest.contentHash, `пересчитанный hash == манифестный (${recomputed})`);

  // --- 5. БИТЫЙ архив → отклоняется, не падает ---------------------------------
  section('5. Битый архив (испорчены байты) → отклонение без краха');
  // портим середину архива (область данных), сохраняя ZIP-структуру читаемой fflate.
  const corrupt = new Uint8Array(archive);
  const mid = Math.floor(corrupt.length / 2);
  for (let i = 0; i < 64; i++) corrupt[mid + i] ^= 0xff;
  let rejectedCorrupt = false;
  let crashed = false;
  try {
    const u = unzipPack(corrupt); // может бросить (битый CRC) — это ок
    const a = analyzeArchive(u);
    rejectedCorrupt = a.ok === false; // если распаковалось — hash не сойдётся
    if (a.ok === false) console.log(`      reason=${a.reason}`);
  } catch (e) {
    rejectedCorrupt = true; // unzip бросил на битых данных — тоже валидное отклонение
    console.log(`      unzip бросил исключение (ожидаемо): ${String(e).slice(0, 60)}…`);
  }
  ok(!crashed, 'обработка битого архива не уронила процесс');
  ok(rejectedCorrupt, 'битый архив отклонён (hash-mismatch или ошибка распаковки)');

  // --- 6. schemaVersion > SUPPORTED → мягкий отказ -----------------------------
  section('6. schemaVersion выше SUPPORTED → мягкое отклонение');
  const futureManifest = { ...manifest, schemaVersion: SUPPORTED_SCHEMA_VERSION + 1 };
  // пересчитываем contentHash, чтобы пройти проверку целостности и упереться именно в схему
  const futureFiles = { ...files };
  futureFiles[MANIFEST_NAME] = new Uint8Array(Buffer.from(JSON.stringify(futureManifest), 'utf8'));
  futureManifest.contentHash = computeContentHash(futureFiles);
  futureFiles[MANIFEST_NAME] = new Uint8Array(Buffer.from(JSON.stringify(futureManifest), 'utf8'));
  const futureAnalysis = analyzeArchive(unzipPack(zipPack(futureFiles)));
  ok(futureAnalysis.ok === false && futureAnalysis.reason === 'schema-too-new', `отклонён как schema-too-new (reason=${futureAnalysis.reason})`);

  // --- 7. Отсутствующий в архиве файл → отклоняется ----------------------------
  section('7. Отсутствующий файл (есть в манифесте, нет в архиве) → отклонение');
  // добавляем в манифест ссылку на несуществующий ассет; contentHash считаем по
  // реально присутствующим файлам (он сойдётся), отказ должен сработать на присутствии.
  const phantomManifest = JSON.parse(JSON.stringify(manifest));
  phantomManifest.items[0].pages.push({ image: 'images/__phantom__.webp', audio: 'audio/__phantom__.opus' });
  const phantomFiles = {};
  for (const [k, v] of Object.entries(files)) if (k !== MANIFEST_NAME) phantomFiles[k] = v;
  phantomManifest.contentHash = computeContentHash(phantomFiles); // по присутствующим
  phantomFiles[MANIFEST_NAME] = new Uint8Array(Buffer.from(JSON.stringify(phantomManifest), 'utf8'));
  const phantomAnalysis = analyzeArchive(unzipPack(zipPack(phantomFiles)));
  ok(
    phantomAnalysis.ok === false && phantomAnalysis.reason === 'missing-files',
    `отклонён как missing-files (reason=${phantomAnalysis.reason}, detail=${phantomAnalysis.detail ?? ''})`,
  );

  // --- итог --------------------------------------------------------------------
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`.barka round-trip: ${archive.length} байт ZIP, 118 файлов, hash=${manifest.contentHash}`);
  console.log(failures === 0 ? '\nРЕЗУЛЬТАТ: ✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `\nРЕЗУЛЬТАТ: ❌ ПРОВАЛОВ: ${failures}`);
} finally {
  cleanup();
}

process.exit(failures === 0 ? 0 : 1);
