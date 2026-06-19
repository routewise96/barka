/**
 * scripts/verify-export.mjs
 *
 * Доказательство, что экспорт событий в JSON собирается верно и приватно (часть
 * «ПРОВЕРКА»). Гоняет РЕАЛЬНЫЙ продакшн-код сборки payload (diagnostics/exportPayload.ts)
 * через loadTs — ту же функцию, что вызывает нативный exportEvents.ts на устройстве.
 *
 * Проверяет:
 *   1. структура payload по формату (метаданные, агрегаты, сырые события, прогресс);
 *   2. агрегаты верны (byType, completions, errors, топы);
 *   3. ПРИВАТНОСТЬ: имён профилей нет в выводе, профили анонимны (индекс), detail очищен;
 *   4. пустая БД → валидный минимальный payload, не падает;
 *   5. device_id: генерируется один раз и стабилен между вызовами; формат UUID.
 *
 * Запуск:  node scripts/verify-export.mjs    (код возврата != 0 при провале)
 */
import { loadAll, cleanup } from './lib/loadTs.mjs';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
  if (!cond) failures++;
};
const section = (t) => console.log(`\n${t}`);

const { exportPayload } = loadAll();
const {
  buildExportPayload,
  getOrCreateDeviceId,
  newDeviceId,
  sanitizeDetail,
  shortDeviceId,
  EXPORT_SCHEMA_VERSION,
} = exportPayload;

try {
  // --- Фикстуры: 2 профиля С ИМЕНАМИ, события всех типов, прогресс ------------
  const NAME1 = 'Aïcha';
  const NAME2 = 'Moussa';
  const profiles = [
    { id: 1, createdAt: 1000, name: NAME1 },
    { id: 2, createdAt: 2000, name: NAME2 },
  ];
  const ev = (profileId, itemId, type, createdAt, detail = null) => ({ profileId, itemId, type, createdAt, detail });
  const events = [
    ev(1, 'story_001', 'open', 10),
    ev(1, 'story_001', 'open', 20),
    ev(1, 'story_001', 'open', 30),
    ev(2, 'story_001', 'open', 40),
    ev(1, 'story_002', 'open', 50),
    ev(1, 'story_001', 'complete', 60),
    ev(1, 'story_001', 'choice_correct', 25),
    ev(1, 'story_001', 'choice_wrong', 26),
    ev(null, null, 'error_image', 70, 'image cassée: file:///data/user/0/fan.barka.app/files/barka/packs/core_demo/images/x.webp'),
    ev(null, null, 'error_audio', 71, 'файл отсутствует: file:///data/user/0/fan.barka.app/cache/y.opus'),
    ev(null, null, 'error_manifest', 72, 'core_demo: невалидный JSON'),
    ev(null, null, 'error_fs', 73, 'bootstrap(core_demo): boom'),
  ];
  const progress = [{ profileId: 1, itemId: 'story_001', completedAt: 60 }];
  const packs = [{ packId: 'core_demo', version: '1.0.0', installedAt: 5 }];

  const payload = buildExportPayload({
    events,
    profiles,
    progress,
    packs,
    appVersion: '9.9.9',
    deviceId: 'test-device-xyz',
    exportedAt: 1700000000000,
  });

  // --- 1. Структура -----------------------------------------------------------
  section('1. Структура payload');
  ok(payload.exportSchemaVersion === EXPORT_SCHEMA_VERSION && payload.exportSchemaVersion === 1, 'exportSchemaVersion = 1');
  ok(payload.app?.version === '9.9.9' && payload.app?.deviceId === 'test-device-xyz', 'app.version и app.deviceId на месте');
  ok(typeof payload.app?.exportedAtIso === 'string' && payload.app.exportedAtIso.includes('2023'), `app.exportedAtIso (${payload.app.exportedAtIso})`);
  ok(Array.isArray(payload.packs) && payload.packs[0]?.packId === 'core_demo', 'packs перечислены');
  ok(payload.summary && payload.profiles && payload.events && payload.progress, 'есть summary / profiles / events / progress');

  // --- 2. Агрегаты ------------------------------------------------------------
  section('2. Агрегаты');
  ok(payload.summary.profiles === 2, `профилей = 2 (${payload.summary.profiles})`);
  ok(payload.summary.events.total === 12, `всего событий = 12 (${payload.summary.events.total})`);
  ok(payload.summary.events.byType.open === 5, `open = 5 (${payload.summary.events.byType.open})`);
  ok(payload.summary.events.byType.complete === 1, `complete = 1 (${payload.summary.events.byType.complete})`);
  ok(payload.summary.events.byType.choice_correct === 1 && payload.summary.events.byType.choice_wrong === 1, 'choice_correct/wrong = 1/1');
  ok(payload.summary.completions === 1, `completions (по progress) = 1 (${payload.summary.completions})`);
  ok(payload.summary.errors.total === 4, `ошибок всего = 4 (${payload.summary.errors.total})`);
  ok(
    payload.summary.errors.byType.error_image === 1 &&
      payload.summary.errors.byType.error_audio === 1 &&
      payload.summary.errors.byType.error_manifest === 1 &&
      payload.summary.errors.byType.error_fs === 1,
    'сводка ошибок по типам верна (image/audio/manifest/fs = 1)',
  );
  ok(payload.summary.topOpened[0]?.itemId === 'story_001' && payload.summary.topOpened[0]?.count === 4, `topOpened[0] = story_001 ×4`);
  ok(payload.summary.topReplayed[0]?.itemId === 'story_001' && payload.summary.topReplayed[0]?.count === 3, 'topReplayed[0] = story_001 (повторов 3)');
  ok(payload.summary.topDropoff[0]?.itemId === 'story_001' && payload.summary.topDropoff[0]?.count === 3, 'topDropoff[0] = story_001 (открыто-завершено = 3)');
  ok(payload.summary.topDropoff.some((d) => d.itemId === 'story_002' && d.count === 1), 'topDropoff включает story_002 (брошено)');
  ok(payload.summary.truncated === false && payload.summary.rawEventsIncluded === 12, 'сырые события не усечены (12/12)');

  // --- 3. ПРИВАТНОСТЬ ---------------------------------------------------------
  section('3. Приватность');
  const json = JSON.stringify(payload);
  ok(!json.includes(NAME1) && !json.includes(NAME2), `имён профилей НЕТ в выводе ("${NAME1}"/"${NAME2}")`);
  ok(
    payload.profiles.every((p) => !('name' in p) && typeof p.index === 'number'),
    'профили анонимны: только index, без поля name',
  );
  ok(payload.profiles[0].index === 1 && payload.profiles[1].index === 2, 'индексы профилей 1..n по дате создания');
  ok(payload.profiles[0].completions === 1, 'у профиля 1 правильный счётчик completions');
  // события ссылаются на анонимный индекс, не на сырой profile_id с именем
  const openEv = payload.events.find((e) => e.type === 'open' && e.itemId === 'story_001');
  ok(openEv && openEv.profile === 1 && !('profileId' in openEv), 'события несут анонимный profile (индекс), без profileId');
  const errFs = payload.events.find((e) => e.type === 'error_fs');
  ok(errFs && errFs.profile === null, 'ошибка без профиля → profile=null');
  // detail очищен от абсолютных file:// путей
  ok(!json.includes('file://'), 'нигде в выводе нет абсолютных file:// путей');
  ok(!json.includes('/data/user/0/'), 'нет абсолютного sandbox-пути /data/user/0/');
  const errImg = payload.events.find((e) => e.type === 'error_image');
  ok(errImg?.detail?.includes('barka/packs/core_demo/images/x.webp'), `detail сведён к относительному пути (${errImg?.detail})`);
  const errAud = payload.events.find((e) => e.type === 'error_audio');
  ok(errAud?.detail?.includes('y.opus') && !errAud.detail.includes('cache'), `detail без /barka/ → имя файла (${errAud?.detail})`);

  // --- 4. Пустая БД -----------------------------------------------------------
  section('4. Пустая БД → минимальный валидный payload');
  const empty = buildExportPayload({ events: [], profiles: [], progress: [], packs: [], appVersion: '1.0.0', deviceId: 'd', exportedAt: 1700000000000 });
  ok(empty.exportSchemaVersion === 1, 'пустой: exportSchemaVersion = 1');
  ok(empty.summary.events.total === 0 && empty.summary.errors.total === 0, 'пустой: 0 событий, 0 ошибок');
  ok(empty.summary.profiles === 0 && empty.profiles.length === 0, 'пустой: 0 профилей');
  ok(Array.isArray(empty.events) && empty.events.length === 0 && empty.summary.topOpened.length === 0, 'пустой: пустые массивы, не падает');

  // --- 5. device_id -----------------------------------------------------------
  section('5. device_id: генерируется один раз, стабилен, формат UUID');
  let stored = null;
  const store = { get: () => stored, set: (v) => (stored = v) };
  const id1 = getOrCreateDeviceId(store);
  const id2 = getOrCreateDeviceId(store);
  ok(id1 === id2 && stored === id1, 'getOrCreateDeviceId: стабилен между вызовами (создан один раз)');
  const seeded = { get: () => 'preexisting-id', set: () => ok(false, 'set не должен вызываться при наличии id') };
  ok(getOrCreateDeviceId(seeded) === 'preexisting-id', 'getOrCreateDeviceId: возвращает уже сохранённый id');
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  ok(uuidRe.test(newDeviceId()), 'newDeviceId: формат UUID v4');
  ok(newDeviceId() !== newDeviceId(), 'newDeviceId: два вызова различны (случайность)');
  ok(shortDeviceId('abcdef12-3456-...') === 'abcdef12', `shortDeviceId усекает (${shortDeviceId('abcdef12-3456-...')})`);
  ok(sanitizeDetail(null) === null && sanitizeDetail('plain') === 'plain', 'sanitizeDetail: null/без URI без изменений');

  // --- итог -------------------------------------------------------------------
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`payload: события=${payload.summary.events.total} ошибки=${payload.summary.errors.total} профили=${payload.summary.profiles} паки=${payload.packs.length}`);
  console.log(failures === 0 ? '\nРЕЗУЛЬТАТ: ✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `\nРЕЗУЛЬТАТ: ❌ ПРОВАЛОВ: ${failures}`);
} finally {
  cleanup();
}

process.exit(failures === 0 ? 0 : 1);
