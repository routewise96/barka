/**
 * scripts/lib/loadTs.mjs — транспилирует и подгружает ЧИСТЫЕ TS-модули в Node.
 *
 * Зачем: логику формата (.barka) и defensive-политики каталога нужно тестировать
 * headless ТЕМ ЖЕ кодом, что и рантайм RN. Node-скрипты подгружают РЕАЛЬНЫЕ
 * src/content|db/*.ts через установленный компилятор `typescript` (devDependency).
 *
 * Транспилируем только модули без нативных импортов (expo-*). `import type {...}`
 * стирается; `import 'fflate'` → require('fflate'), резолвится из node_modules проекта
 * (временная папка лежит внутри проекта).
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = join(HERE, '..', '..');
const OUT = join(PROJECT, 'scripts', '.tmp-ts-build');

/** Чистые модули: исходный путь относительно src/ → имя выходного файла. */
const REGISTRY = {
  sha256: 'content/sha256.ts',
  packFormat: 'content/packFormat.ts',
  catalogPolicy: 'content/catalogPolicy.ts',
  safeLog: 'db/safeLog.ts',
};

function transpileFile(name) {
  const tsSource = readFileSync(join(PROJECT, 'src', REGISTRY[name]), 'utf8');
  const { outputText } = ts.transpileModule(tsSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: `${name}.ts`,
  });
  writeFileSync(join(OUT, `${name}.js`), outputText);
}

/**
 * Транспилирует все зарегистрированные чистые модули и возвращает загруженные.
 * (sha256 нужен packFormat'у; остальные самодостаточны.)
 */
export function loadAll() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const name of Object.keys(REGISTRY)) transpileFile(name);
  const req = createRequire(join(OUT, 'packFormat.js'));
  return {
    packFormat: req('./packFormat.js'),
    catalogPolicy: req('./catalogPolicy.js'),
    safeLog: req('./safeLog.js'),
  };
}

/** Совместимость с существующими скриптами: вернуть только модуль packFormat. */
export function loadPackFormat() {
  return loadAll().packFormat;
}

export function cleanup() {
  rmSync(OUT, { recursive: true, force: true });
}
