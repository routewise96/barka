/**
 * scripts/verify-degradation.mjs
 *
 * Доказательство graceful degradation при порче контента ПОСЛЕ установки (часть
 * «ПРОВЕРКА»). Гоняет РЕАЛЬНЫЙ продакшн-код решений (packFormat.isValidManifestShape /
 * checkSchemaVersion, catalogPolicy.selectItems / classifyItem, db/safeLog.runSafely)
 * через loadTs — те же функции, что catalog.ts/logError используют на устройстве.
 *
 * Проверяет:
 *   1. битый JSON-манифест в одном паке → scan пропускает ЕГО, остальные паки целы;
 *   2. пак из будущей схемы (schemaVersion > SUPPORTED) → пропускается мягко;
 *   3. элемент с отсутствующими на диске файлами → скрыт; битая обложка → элемент
 *      остаётся (missingCover); частичная порча страниц → элемент остаётся;
 *   4. runSafely (фундамент logError) проглатывает ошибку «БД недоступна», не кидает.
 *
 * Запуск:  node scripts/verify-degradation.mjs    (код возврата != 0 при провале)
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { loadAll, cleanup } from './lib/loadTs.mjs';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
  if (!cond) failures++;
};
const section = (t) => console.log(`\n${t}`);

const { packFormat, catalogPolicy, safeLog } = loadAll();
const { isValidManifestShape, checkSchemaVersion } = packFormat;
const { selectItems, classifyItem } = catalogPolicy;
const { runSafely } = safeLog;

try {
  // --- Фикстуры: packs-директория с разными видами порчи ----------------------
  const ROOT = mkdtempSync(join(tmpdir(), 'barka-degr-'));

  /** Пишет файл, создавая родителей. */
  const put = (p, data) => {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, data);
  };
  /** Создаёт пак: manifest + перечисленные ассеты (присутствующие на диске). */
  const makePack = (id, manifest, presentAssets) => {
    const dir = join(ROOT, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
    for (const rel of presentAssets) put(join(dir, ...rel.split('/')), 'x');
  };

  const page = (n, withChoices = false) => ({
    image: `images/${n}.webp`,
    audio: `audio/${n}.opus`,
    ...(withChoices ? { choices: [] } : {}),
  });

  // 1) good_pack — два целых элемента
  makePack(
    'good_pack',
    {
      packId: 'good_pack',
      schemaVersion: 1,
      version: '1.0.0',
      lang: 'fr',
      displayName: 'Good',
      sizeBytes: 0,
      dependencies: [],
      items: [
        { id: 'g1', type: 'story', lang: 'fr', title: 'G1', pack: 'good_pack', cover: 'images/c1.webp', pages: [page('g1p1')] },
        { id: 'g2', type: 'number', lang: 'fr', title: 'G2', pack: 'good_pack', cover: 'images/c2.webp', pages: [page('g2p1')] },
      ],
    },
    ['images/c1.webp', 'images/g1p1.webp', 'audio/g1p1.opus', 'images/c2.webp', 'images/g2p1.webp', 'audio/g2p1.opus'],
  );

  // 2) bad_json — манифест с битым JSON
  makePack('bad_json', '{ ceci n\'est pas du JSON', []);

  // 3) future_pack — корректная форма, но schemaVersion из будущего
  makePack(
    'future_pack',
    { packId: 'future_pack', schemaVersion: 99, version: '1.0.0', lang: 'fr', displayName: 'Future', sizeBytes: 0, items: [] },
    [],
  );

  // 4) partial_pack — смесь целых/битых элементов
  makePack(
    'partial_pack',
    {
      packId: 'partial_pack',
      schemaVersion: 1,
      version: '1.0.0',
      lang: 'fr',
      displayName: 'Partial',
      sizeBytes: 0,
      items: [
        { id: 'ok_item', type: 'story', lang: 'fr', title: 'OK', pack: 'partial_pack', cover: 'images/ok.webp', pages: [page('ok1')] },
        { id: 'no_cover', type: 'story', lang: 'fr', title: 'NoCover', pack: 'partial_pack', cover: 'images/missing.webp', pages: [page('nc1')] },
        { id: 'empty_item', type: 'story', lang: 'fr', title: 'Empty', pack: 'partial_pack', cover: 'images/e.webp', pages: [page('gone1'), page('gone2')] },
        { id: 'no_pages', type: 'story', lang: 'fr', title: 'NoPages', pack: 'partial_pack', cover: 'images/np.webp', pages: [] },
      ],
    },
    // присутствуют: ok_item (cover+page), no_cover (ТОЛЬКО page, без обложки)
    ['images/ok.webp', 'images/ok1.webp', 'audio/ok1.opus', 'images/nc1.webp', 'audio/nc1.opus'],
  );

  // --- Эмуляция scanCatalog (как catalog.ts), на РЕАЛЬНЫХ pure-решениях --------
  section('1–2. scanCatalog: битый манифест и пак из будущего пропускаются точечно');
  const validPacks = [];
  const skipped = [];
  const keptItems = [];
  const hiddenItems = [];
  for (const name of readdirSync(ROOT)) {
    const dir = join(ROOT, name);
    if (!statSync(dir).isDirectory()) continue;
    const mf = join(dir, 'manifest.json');
    if (!existsSync(mf)) continue;
    try {
      let manifest;
      try {
        manifest = JSON.parse(readFileSync(mf, 'utf8'));
      } catch {
        skipped.push({ id: name, reason: 'error_manifest:bad-json' });
        continue;
      }
      if (!isValidManifestShape(manifest)) {
        skipped.push({ id: name, reason: 'error_manifest:bad-shape' });
        continue;
      }
      const schema = checkSchemaVersion(manifest);
      if (!schema.ok) {
        skipped.push({ id: name, reason: `error_manifest:${schema.reason}` });
        continue;
      }
      const exists = (rel) => existsSync(join(dir, ...rel.split('/')));
      const { kept, hidden } = selectItems(manifest.items, exists);
      validPacks.push(manifest.packId);
      keptItems.push(...kept.map((i) => i.id));
      hiddenItems.push(...hidden.map((h) => ({ ...h, pack: manifest.packId })));
    } catch (e) {
      skipped.push({ id: name, reason: `error_fs:${String(e)}` });
    }
  }

  ok(validPacks.includes('good_pack'), 'good_pack попал в каталог');
  ok(validPacks.includes('partial_pack'), 'partial_pack попал в каталог');
  ok(!validPacks.includes('bad_json'), 'bad_json (битый JSON) пропущен, не свалил скан');
  ok(skipped.some((s) => s.id === 'bad_json' && s.reason.startsWith('error_manifest')), 'bad_json залогирован как error_manifest');
  ok(!validPacks.includes('future_pack'), 'future_pack (schemaVersion 99) пропущен');
  ok(skipped.some((s) => s.id === 'future_pack' && s.reason.includes('schema-too-new')), 'future_pack залогирован как schema-too-new');

  section('3. Точечная деградация элементов partial_pack');
  ok(keptItems.includes('ok_item'), 'ok_item (всё на месте) — в каталоге');
  ok(keptItems.includes('no_cover'), 'no_cover (нет обложки, но страница цела) — ОСТАЁТСЯ в каталоге');
  ok(!keptItems.includes('empty_item'), 'empty_item (все страницы без файлов) — СКРЫТ');
  ok(!keptItems.includes('no_pages'), 'no_pages (нет страниц) — СКРЫТ');
  ok(hiddenItems.some((h) => h.id === 'empty_item'), 'empty_item залогирован как скрытый');
  ok(hiddenItems.some((h) => h.id === 'no_pages'), 'no_pages залогирован как скрытый');
  ok(keptItems.length === 4, `всего пригодных элементов = 4 (g1,g2,ok_item,no_cover) — факт ${keptItems.length}`);

  // точные вердикты classifyItem
  const partial = JSON.parse(readFileSync(join(ROOT, 'partial_pack', 'manifest.json'), 'utf8'));
  const exists = (rel) => existsSync(join(ROOT, 'partial_pack', ...rel.split('/')));
  const byId = Object.fromEntries(partial.items.map((i) => [i.id, classifyItem(i, exists)]));
  ok(byId.ok_item.include && !byId.ok_item.missingCover, 'classifyItem(ok_item): include, обложка на месте');
  ok(byId.no_cover.include && byId.no_cover.missingCover, 'classifyItem(no_cover): include + missingCover=true');
  ok(byId.empty_item.include === false, 'classifyItem(empty_item): include=false');
  ok(byId.no_pages.include === false, 'classifyItem(no_pages): include=false');

  // --- 4. safeLog.runSafely — фундамент logError ------------------------------
  section('4. runSafely проглатывает ошибку «БД недоступна», не кидает');
  let threw = false;
  let okResult, failResult;
  try {
    failResult = await runSafely('logError:test', async () => {
      throw new Error('database is locked'); // имитируем недоступную БД
    });
    okResult = await runSafely('logError:test', async () => {
      /* успешная запись */
    });
  } catch {
    threw = true;
  }
  ok(!threw, 'runSafely НЕ пробросил исключение наружу (logError не уронит приложение)');
  ok(failResult === false, 'runSafely вернул false при сбое операции');
  ok(okResult === true, 'runSafely вернул true при успехе');

  // --- итог -------------------------------------------------------------------
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`паков валидных=${validPacks.length} пропущено=${skipped.length} | элементов: пригодно=${keptItems.length} скрыто=${hiddenItems.length}`);
  console.log(failures === 0 ? '\nРЕЗУЛЬТАТ: ✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `\nРЕЗУЛЬТАТ: ❌ ПРОВАЛОВ: ${failures}`);
} finally {
  cleanup();
}

process.exit(failures === 0 ? 0 : 1);
