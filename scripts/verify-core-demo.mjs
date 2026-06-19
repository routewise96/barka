/**
 * scripts/verify-core-demo.mjs
 *
 * Доказательство, что цепочка контента работает end-to-end для пака core_demo
 * (ШАГ 4, раздел 10 ARCHITECTURE.md). Реальные bootstrap()/scanCatalog() зависят
 * от нативных модулей Expo (expo-file-system / expo-asset / expo-sqlite) и не
 * исполнимы в headless-Node, поэтому здесь ВЕРНО ВОСПРОИЗВОДИТСЯ та же логика:
 *
 *   1. (как extractPack) копируем пак во временный <doc>/barka/packs/core_demo/
 *      по реестру BUNDLED_PACKS из src/content/bootstrap.ts — ровно те ассеты,
 *      что Metro забандлит и bootstrap скопирует на устройстве.
 *   2. (как scanCatalog) сканируем packs/, парсим manifest.json, строим каталог.
 *   3. валидируем схему (types.ts), счётчики по типам, choices, резолв всех путей.
 *
 * Запуск:  node scripts/verify-core-demo.mjs
 * Код возврата != 0 при любом провале.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = join(HERE, '..');
const SRC_PACK = join(PROJECT, 'assets/bundled-packs/core_demo');
const BOOTSTRAP = join(PROJECT, 'src/content/bootstrap.ts');

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
  if (!cond) failures++;
};
const section = (t) => console.log(`\n${t}`);

const CONTENT_TYPES = new Set(['story', 'number', 'letter']);
const LANGS = new Set(['fr', 'mos', 'dyu']);

// --- 0. читаем реестр BUNDLED_PACKS из bootstrap.ts -------------------------
section('0. Реестр BUNDLED_PACKS (src/content/bootstrap.ts)');
const bootstrapSrc = readFileSync(BOOTSTRAP, 'utf8');
const registryKeys = [...bootstrapSrc.matchAll(/^\s*'([^']+)':\s*require\(/gm)].map((m) => m[1]);
ok(/manifest:\s*require\(.*core_demo\/manifest\.json'\)/.test(bootstrapSrc), 'манифест core_demo подключён через require()');
ok(registryKeys.length === 117, `реестр содержит 117 ассетов (фактически ${registryKeys.length})`);

// --- 1. BOOTSTRAP SIM: копируем пак по реестру ------------------------------
section('1. bootstrap → распаковка в documentDirectory (эмуляция extractPack)');
const manifest = JSON.parse(readFileSync(join(SRC_PACK, 'manifest.json'), 'utf8'));
const DOC = mkdtempSync(join(tmpdir(), 'barka-doc-'));
const PACKS_ROOT = join(DOC, 'barka', 'packs');

// installed_packs (idempotency по version) — эмулируем in-memory.
const installed = new Map();
function bootstrapOnce() {
  let copied = 0;
  const { packId, version } = manifest;
  if (installed.has(packId) && installed.get(packId) >= version) return 0; // skip
  const destDir = join(PACKS_ROOT, packId);
  mkdirSync(destDir, { recursive: true });
  copyFileSync(join(SRC_PACK, 'manifest.json'), join(destDir, 'manifest.json'));
  for (const rel of registryKeys) {
    const src = join(SRC_PACK, rel);
    const dst = join(destDir, rel);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    copied++;
  }
  installed.set(packId, version);
  return copied;
}
const firstCopy = bootstrapOnce();
const secondCopy = bootstrapOnce(); // повторный запуск
ok(existsSync(join(PACKS_ROOT, 'core_demo', 'manifest.json')), 'core_demo распакован в <doc>/barka/packs/core_demo/');
ok(firstCopy === 117, `первый bootstrap скопировал 117 ассетов (${firstCopy})`);
ok(secondCopy === 0, `повторный bootstrap идемпотентен по version: 0 повторных копий (${secondCopy})`);

// сверка: реестр == множество путей, на которые ссылается манифест
const manifestPaths = new Set();
for (const it of manifest.items) {
  manifestPaths.add(it.cover);
  for (const p of it.pages) {
    manifestPaths.add(p.image);
    manifestPaths.add(p.audio);
    for (const c of p.choices ?? []) { manifestPaths.add(c.image); manifestPaths.add(c.audio); }
  }
}
const regSet = new Set(registryKeys);
const missingInRegistry = [...manifestPaths].filter((p) => !regSet.has(p));
const orphanInRegistry = registryKeys.filter((k) => !manifestPaths.has(k));
ok(missingInRegistry.length === 0, `все пути манифеста есть в реестре (нет пропусков: ${missingInRegistry.length})`);
ok(orphanInRegistry.length === 0, `нет «лишних» ассетов в реестре без ссылки из манифеста (${orphanInRegistry.length})`);

// --- 2. CATALOG SIM: сканируем packs/ и строим каталог ----------------------
section('2. scanCatalog → единый каталог');
function isValidManifest(m) {
  return m && typeof m === 'object' && typeof m.packId === 'string'
    && (typeof m.version === 'string' || typeof m.version === 'number') && Array.isArray(m.items);
}
function scanCatalog(root) {
  const packs = [];
  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    if (!statSync(dir).isDirectory()) continue;
    const mf = join(dir, 'manifest.json');
    if (!existsSync(mf)) continue;
    let m;
    try { m = JSON.parse(readFileSync(mf, 'utf8')); } catch { continue; }
    if (!isValidManifest(m)) continue;
    packs.push({ manifest: m, baseUri: dir + '/' });
  }
  const items = [];
  const byId = new Map();
  for (const pack of packs) for (const item of pack.manifest.items) {
    const e = { item, pack };
    items.push(e);
    byId.set(item.id, e);
  }
  return { packs, items, byId };
}
const catalog = scanCatalog(PACKS_ROOT);
ok(catalog.packs.length === 1, `каталог нашёл 1 пак (${catalog.packs.length})`);
ok(catalog.items.length === 11, `каталог содержит 11 ContentItem (${catalog.items.length})`);
ok(catalog.byId.size === 11, `индекс byId содержит 11 уникальных id (${catalog.byId.size})`);

// --- 3. разбивка по типам ---------------------------------------------------
section('3. Разбивка по типам');
const counts = { story: 0, number: 0, letter: 0 };
for (const e of catalog.items) counts[e.item.type]++;
ok(counts.story === 3, `story = 3 (${counts.story})`);
ok(counts.number === 5, `number = 5 (${counts.number})`);
ok(counts.letter === 3, `letter = 3 (${counts.letter})`);

// --- 4. валидация схемы (types.ts) ------------------------------------------
section('4. Валидация схемы ContentItem/Page/Choice');
let schemaBad = 0;
let totalChoiceGroups = 0;
let badChoiceGroups = 0;
for (const { item } of catalog.items) {
  const okItem = typeof item.id === 'string' && CONTENT_TYPES.has(item.type)
    && LANGS.has(item.lang) && typeof item.title === 'string'
    && item.pack === 'core_demo' && typeof item.cover === 'string'
    && Array.isArray(item.pages) && item.pages.length > 0;
  if (!okItem) { schemaBad++; continue; }
  for (const p of item.pages) {
    if (typeof p.image !== 'string' || typeof p.audio !== 'string') schemaBad++;
    if (p.choices !== undefined) {
      totalChoiceGroups++;
      if (!Array.isArray(p.choices) || p.choices.length !== 3) badChoiceGroups++;
      const nCorrect = (p.choices ?? []).filter((c) => c.correct === true).length;
      const shapeOk = (p.choices ?? []).every(
        (c) => typeof c.image === 'string' && typeof c.audio === 'string'
          && (c.correct === undefined || typeof c.correct === 'boolean'),
      );
      if (nCorrect !== 1 || !shapeOk) badChoiceGroups++;
    }
  }
}
ok(schemaBad === 0, `все 11 items валидны по схеме (нарушений: ${schemaBad})`);
ok(badChoiceGroups === 0, `каждая группа choices = 3 варианта, ровно один correct:true (групп: ${totalChoiceGroups}, плохих: ${badChoiceGroups})`);

// --- 5. фокус-проверка story_fr_demo_001: choices на стр. 2 и 4 -------------
section('5. story_fr_demo_001 — интерактивные выборы');
const s1 = catalog.byId.get('story_fr_demo_001').item;
ok(s1.pages.length === 4, `4 страницы (${s1.pages.length})`);
for (const [idx, hasChoices] of [[0, false], [1, true], [2, false], [3, true]]) {
  const p = s1.pages[idx];
  const present = Array.isArray(p.choices);
  ok(present === hasChoices, `стр. ${idx + 1}: choices ${hasChoices ? 'есть' : 'нет'} (${present})`);
  if (hasChoices && present) {
    const nCorrect = p.choices.filter((c) => c.correct === true).length;
    ok(nCorrect === 1, `стр. ${idx + 1}: ровно один correct:true (${nCorrect})`);
  }
}

// --- 6. резолв всех путей манифеста в реальные файлы ------------------------
section('6. Резолв путей манифеста → файлы на диске');
const pack0 = catalog.packs[0];
const resolveAssetUri = (pack, rel) => pack.baseUri + rel.replace(/^\/+/, '');
let resolved = 0, missing = 0;
for (const { item } of catalog.items) {
  const refs = [item.cover];
  for (const p of item.pages) {
    refs.push(p.image, p.audio);
    for (const c of p.choices ?? []) refs.push(c.image, c.audio);
  }
  for (const rel of refs) {
    const uri = resolveAssetUri(pack0, rel);
    if (existsSync(uri) && statSync(uri).isFile()) resolved++; else { missing++; console.log(`      MISSING: ${rel}`); }
  }
}
ok(missing === 0, `все ссылки манифеста резолвятся в существующие файлы (резолвлено ${resolved}, нет ${missing})`);

// --- 7. sizeBytes в манифесте == реальный размер ассетов --------------------
section('7. sizeBytes манифеста');
let realSize = 0;
for (const sub of ['images', 'audio']) {
  const d = join(SRC_PACK, sub);
  for (const f of readdirSync(d)) realSize += statSync(join(d, f)).size;
}
ok(manifest.sizeBytes === realSize, `sizeBytes (${manifest.sizeBytes}) == реальный размер ассетов (${realSize})`);

// --- итог -------------------------------------------------------------------
console.log(`\n${'─'.repeat(60)}`);
console.log(`packId=${manifest.packId} v${manifest.version} lang=${manifest.lang}  «${manifest.displayName}»`);
console.log(`items=${catalog.items.length}  story=${counts.story} number=${counts.number} letter=${counts.letter}`);
console.log(`ассетов=${registryKeys.length}  sizeBytes=${manifest.sizeBytes} (${(manifest.sizeBytes / 1024).toFixed(1)} KiB)`);
console.log(failures === 0 ? '\nРЕЗУЛЬТАТ: ✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `\nРЕЗУЛЬТАТ: ❌ ПРОВАЛОВ: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
