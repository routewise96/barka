/**
 * src/content/catalogPolicy.ts — ЧИСТАЯ политика отбора элементов каталога при
 * наличии повреждений на диске (часть 4). Без нативных импортов → headless-тестируемо.
 *
 * Решает «показывать / скрыть / деградировать» по ФАКТУ существования файлов:
 * проверку существования инъектирует вызывающий (RN — через expo-file-system,
 * тест — через node:fs), здесь только политика.
 *
 * ПОЛИТИКА (выбранная, разумная для аудио-первого приложения):
 *  - Страница «пригодна», если существует ХОТЯ БЫ один её файл (image ИЛИ audio):
 *    нет картинки → плейсхолдер, нет звука → тишина + кнопка повтора. Что-то одно
 *    всегда даёт ребёнку контент.
 *  - Элемент СКРЫВАЕТСЯ из каталога, если у него нет страниц вовсе ИЛИ ни одна
 *    страница не пригодна (открывать нечего — пустая активность путает ребёнка).
 *  - Отсутствующая ОБЛОЖКА элемент не скрывает: в сетке покажем плейсхолдер, а
 *    страницы могут быть целы (элемент остаётся кликабельным).
 *  - Частично битый элемент (часть страниц пуста) ОСТАЁТСЯ: недостающие страницы
 *    деградируют по месту (плейсхолдер/тишина). Страницы НЕ переиндексируются, чтобы
 *    не ломать логику выборов/прогресса — деградация точечная, а не реструктуризация.
 */
import type { ContentItem } from './types';

/** Проверка существования файла по относительному пути внутри пака. */
export type AssetExists = (relativePath: string) => boolean;

export interface ItemVerdict {
  include: boolean;
  /** Обложка отсутствует на диске (элемент всё равно включён, в сетке — плейсхолдер). */
  missingCover: boolean;
  /** Причина скрытия (для logError), если include=false. */
  reason?: string;
}

/** Пригодна ли страница: есть хотя бы один её файл (картинка или звук). */
function pageUsable(item: ContentItem, idx: number, exists: AssetExists): boolean {
  const p = item.pages[idx];
  if (!p) return false;
  return exists(p.image) || exists(p.audio);
}

/** Вердикт по одному элементу: включать ли его в каталог и состояние обложки. */
export function classifyItem(item: ContentItem, exists: AssetExists): ItemVerdict {
  const missingCover = !item.cover || !exists(item.cover);

  if (!Array.isArray(item.pages) || item.pages.length === 0) {
    return { include: false, missingCover, reason: 'нет страниц' };
  }
  const usablePages = item.pages.filter((_, i) => pageUsable(item, i, exists)).length;
  if (usablePages === 0) {
    return { include: false, missingCover, reason: 'все страницы без файлов' };
  }
  return { include: true, missingCover };
}

export interface SelectionResult {
  kept: ContentItem[];
  /** Скрытые элементы — для logError('error_pack', ...). */
  hidden: { id: string; reason: string }[];
}

/** Отбирает пригодные элементы пака, собирая список скрытых (с причинами). */
export function selectItems(items: ContentItem[], exists: AssetExists): SelectionResult {
  const kept: ContentItem[] = [];
  const hidden: { id: string; reason: string }[] = [];
  for (const item of items) {
    const v = classifyItem(item, exists);
    if (v.include) kept.push(item);
    else hidden.push({ id: item.id, reason: v.reason ?? 'неизвестно' });
  }
  return { kept, hidden };
}
