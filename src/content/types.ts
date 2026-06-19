/**
 * src/content/types.ts — модель контента (раздел 3 ARCHITECTURE.md).
 *
 * Это форма данных на диске (манифесты), а НЕ код. Приложение не знает заранее,
 * сколько сказок/паков существует — оно читает манифесты и рендерит динамически.
 *
 * Два уровня типов:
 *  1. "сырые" типы манифеста (ContentItem, Page, Choice, PackManifest) — ровно то,
 *     что лежит в manifest.json. Пути в них ОТНОСИТЕЛЬНЫЕ к папке пака.
 *  2. "разрешённые" типы (ResolvedPack, CatalogEntry, Catalog) — то, что строит
 *     каталог в памяти: относительные пути превращены в абсолютные file:// URI.
 */

/** Языки контента: французский, Mooré, Dioula. */
export type Lang = 'fr' | 'mos' | 'dyu';

/** Вид активности. */
export type ContentType = 'story' | 'number' | 'letter';

/** Один вариант выбора на экране (опционально, до 3 по UX-контракту). */
export interface Choice {
  /** Относительный путь к картинке варианта. */
  image: string;
  /** Относительный путь к звуку-реакции на выбор. */
  audio: string;
  /** Для числовых/буквенных игр — правильный ли это вариант. */
  correct?: boolean;
}

/** Один экран активности: одна картинка + один звук (+ опционально выборы). */
export interface Page {
  /** Относительный путь, главная картинка экрана. */
  image: string;
  /** Относительный путь, озвучка экрана. */
  audio: string;
  /** Опционально: до 3 вариантов выбора. */
  choices?: Choice[];
}

/** Единица контента — сказка / число / буква. */
export interface ContentItem {
  /** Глобально уникальный id, напр. "story_fr_lion_001". */
  id: string;
  type: ContentType;
  lang: Lang;
  /** Заголовок для режима учителя, НЕ для ребёнка. */
  title: string;
  /** id пака, которому принадлежит элемент, напр. "core_fr". */
  pack: string;
  /** Относительный путь к обложке. */
  cover: string;
  pages: Page[];
}

/** Манифест пака — описание самодостаточной папки контента (раздел 3.3). */
export interface PackManifest {
  packId: string;
  /**
   * Версия СХЕМЫ манифеста (не контента). Определяет, понимает ли эта сборка
   * приложения форму манифеста. Отсутствует → трактуется как legacy v1.
   * См. SUPPORTED_SCHEMA_VERSION и checkSchemaVersion в packFormat.ts.
   */
  schemaVersion?: number;
  /**
   * Версия КОНТЕНТА пака — semver-строка ("1.2.0"). Используется политикой
   * обновления при коллизии packId (не затирать новее старым). Допускается
   * число (legacy) — compareVersions это понимает.
   */
  version: string;
  lang: string;
  displayName: string;
  sizeBytes: number;
  /**
   * Хэш СОДЕРЖИМОГО пака (`sha256:<hex>`) — проверка целостности после передачи
   * телефон-к-телефону (Bluetooth оборвался / SD побилась). Считается по всем
   * файлам кроме manifest.json. См. computeContentHash в packFormat.ts.
   * Опционален для forward-compat; при наличии — сверяется на импорте.
   */
  contentHash?: string;
  /**
   * РЕЗЕРВ на будущее: контентные зависимости (story-пак ← audio-language-пак).
   * Сейчас ВСЕГДА []. Логика разрешения зависимостей пока не реализована.
   */
  dependencies?: string[];
  items: ContentItem[];
}

// ---------------------------------------------------------------------------
// Разрешённый (in-memory) уровень
// ---------------------------------------------------------------------------

/**
 * Пак, найденный на диске: его манифест + абсолютный путь к папке пака.
 * Через baseUri относительные пути элементов превращаются в абсолютные URI.
 */
export interface ResolvedPack {
  manifest: PackManifest;
  /** Абсолютный file:// URI папки пака (с завершающим слэшем). */
  baseUri: string;
  /** true — пак вшит в APK и распакован; false — приехал side-load'ом. */
  bundled: boolean;
}

/** Элемент каталога: исходный item + к какому паку он относится. */
export interface CatalogEntry {
  item: ContentItem;
  pack: ResolvedPack;
}

/**
 * Единый каталог в памяти, собранный из всех манифестов.
 * Bundled и side-loaded паки представлены одинаково (раздел 3.4).
 */
export interface Catalog {
  packs: ResolvedPack[];
  /** Все элементы из всех паков. */
  items: CatalogEntry[];
  /** Быстрый доступ по id элемента. */
  byId: Map<string, CatalogEntry>;
}
