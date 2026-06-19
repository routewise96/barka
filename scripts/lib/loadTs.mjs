/**
 * scripts/lib/loadTs.mjs — транспилирует и подгружает ЧИСТЫЕ TS-модули в Node.
 *
 * Зачем: contentHash и упаковка/распаковка .barka обязаны считаться ОДНИМ И ТЕМ ЖЕ
 * кодом на устройстве (RN) и в Node (генератор манифеста + round-trip тест). Чтобы
 * не дублировать алгоритмы, Node-скрипты подгружают РЕАЛЬНЫЕ src/content/*.ts через
 * установленный компилятор `typescript` (devDependency). Так тест гоняет продакшн-код.
 *
 * Транспилируем только модули без нативных импортов (sha256.ts, packFormat.ts).
 * `import type {...}` стирается компилятором; `import 'fflate'` → require('fflate'),
 * который резолвится из node_modules проекта (временная папка лежит внутри проекта).
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = join(HERE, '..', '..');
const SRC = join(PROJECT, 'src', 'content');
const OUT = join(PROJECT, 'scripts', '.tmp-ts-build');

/** Модули в порядке зависимостей (имя без расширения). */
const MODULES = ['sha256', 'packFormat'];

function transpileFile(name) {
  const tsSource = readFileSync(join(SRC, `${name}.ts`), 'utf8');
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
 * Транспилирует packFormat + зависимости и возвращает загруженный модуль packFormat.
 * Вызывающий сам решает, когда чистить (cleanup()).
 */
export function loadPackFormat() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const m of MODULES) transpileFile(m);
  // createRequire с базой внутри OUT: и относительные './sha256', и 'fflate' резолвятся.
  const requireFromOut = createRequire(join(OUT, 'packFormat.js'));
  return requireFromOut('./packFormat.js');
}

export function cleanup() {
  rmSync(OUT, { recursive: true, force: true });
}
