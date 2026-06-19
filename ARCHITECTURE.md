# Barka — Архитектура

Офлайн образовательное приложение для детей Буркина-Фасо (5-12 лет).
Аудио-первое, работает без интернета, распространяется от телефона к телефону.
Стек проверен под Expo SDK 54 (стабильный).

## 1. Принципы, диктующие архитектуру
1. Офлайн навсегда. После установки — ни одного сетевого вызова в рантайме пользователя.
2. Аудио-первое. Ребёнок 5 лет без чтения пользуется сам. Каждое действие = большая картинка + звук.
3. Лёгкий APK. Базовый APK < 80 МБ (предел Bluetooth). Контент сверх минимума — отдельными паками.
4. Контент отделён от кода. Сказки/числа/буквы — данные, не код. Добавление контента не требует пересборки.
5. Без логина, без серверов. Прогресс только локально на устройстве.

## 2. Технический стек (зафиксирован)
- Framework: Expo managed workflow, SDK 54
- Язык: TypeScript strict
- Навигация: expo-router (file-based)
- БД прогресса: expo-sqlite (async API)
- Аудио: expo-audio (НЕ expo-av — он deprecated в SDK 54)
- Файлы: expo-file-system
- Шеринг APK: expo-sharing + Android Intent
- Стейт: Zustand
- Сборка: EAS Build (APK profile)
- CI/CD: GitHub Actions → EAS

Минимальная платформа: Android 7.0 (API 24, minSdkVersion 24), 1 GB RAM.
(RN 0.81 / Expo SDK 54 официально требуют API 24; Android 6 в целевом регионе — доли процента.)
Это диктует: лёгкие анимации, изображения WebP под размер экрана, аудио Opus моно низкий битрейт.

## 3. Модель контента (ядро системы)
Контент — данные на файловой системе, описанные JSON-манифестом. Приложение читает манифесты и рендерит UI динамически. Код не знает заранее, сколько сказок или паков существует.

### 3.1 Единица контента
ContentItem {
  id: string                    // напр. "story_fr_lion_001"
  type: "story" | "number" | "letter"
  lang: "fr" | "mos" | "dyu"    // французский, Mooré, Dioula
  title: string                 // для режима учителя, не для ребёнка
  pack: string                  // напр. "core_fr"
  cover: string                 // относительный путь к обложке
  pages: Page[]
}
Page {
  image: string                 // относительный путь, главная картинка экрана
  audio: string                 // относительный путь, озвучка экрана
  choices?: Choice[]            // опционально: 3 варианта выбора
}
Choice {
  image: string
  audio: string                 // звук-реакция на выбор
  correct?: boolean             // для числовых/буквенных игр
}

### 3.2 Структура паков на диске и формат дистрибуции
На диске пак — самодостаточная папка:
<documentDirectory>/barka/packs/
  core_fr/
    manifest.json
    images/  (lion_001.webp ...)
    audio/   (lion_001.opus ...)
  core_mos/ ...
  numbers_basic/ ...

Для ПЕРЕДАЧИ телефон-к-телефону папка не годится: реальные офлайн-транспорты
(Bluetooth/Xender/SHAREit/SD) передают ОДИН ФАЙЛ. Поэтому единица дистрибуции —
архив **.barka** (обычный ZIP с тем же содержимым). Экспорт/импорт — в
src/content/packArchive.ts (упаковка fflate, проверка целостности по contentHash,
версия схемы). Экспорт отдаётся через системный Share intent (expo-sharing), импорт —
через file picker (expo-document-picker); автоскан папок не делается из-за Scoped Storage.

### 3.3 Манифест пака
PackManifest {
  packId: string
  schemaVersion?: number   // версия СХЕМЫ манифеста; нет → legacy v1. SUPPORTED_SCHEMA_VERSION в packFormat.ts
  version: string          // версия КОНТЕНТА, semver ("1.2.0"); политика обновления при коллизии packId
  lang: string
  displayName: string
  sizeBytes: number
  contentHash?: string     // "sha256:<hex>" по всем файлам кроме manifest.json — целостность после передачи
  dependencies?: string[]  // РЕЗЕРВ на будущее, сейчас всегда []
  items: ContentItem[]
}
contentHash и упаковка считаются ОДНИМ кодом (src/content/sha256.ts + packFormat.ts)
на устройстве и в Node-скриптах (генерация манифеста + round-trip тест) — без нативных
модулей, поэтому хэши гарантированно совпадают.

### 3.4 Bundled vs side-loaded
- Bundled-паки: минимальный набор, кладутся в assets/, при первом запуске копируются в documentDirectory. Гарантия работы сразу после установки без интернета.
- Side-loaded паки: приходят по Bluetooth/WiFi Direct/SD как папка, приложение находит их при сканировании packs-директории.
При старте приложение сканирует packs/, читает все manifest.json, строит единый каталог в памяти. Bundled и side-loaded обрабатываются одинаково.

## 4. База данных (только прогресс, локально)
SQLite через expo-sqlite. Хранит ТОЛЬКО прогресс и события, никогда контент.

CREATE TABLE profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  avatar TEXT,
  created_at INTEGER
);
CREATE TABLE progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER,
  item_id TEXT,
  completed_at INTEGER,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER,
  item_id TEXT,
  event_type TEXT,              -- "open" | "complete" | "choice_correct" | "choice_wrong"
  created_at INTEGER
);
CREATE TABLE installed_packs (
  pack_id TEXT PRIMARY KEY,
  version INTEGER,
  installed_at INTEGER
);

Доступ к БД — через тонкий слой db/ с типизированными функциями. Никакого сырого SQL в UI. Все пользовательские значения — через prepared statements.

## 5. Структура проекта (file-based routing)
barka/
  app/
    _layout.tsx                 // корневой layout, инициализация (БД, копирование bundled-паков)
    index.tsx                   // стартовый экран: выбор профиля / 3 раздела
    sections/
      stories.tsx               // список сказок по языкам
      numbers.tsx               // счёт 1-20
      letters.tsx               // алфавит
    play/
      [itemId].tsx              // плеер активности: картинка + аудио + выборы
    teacher/
      index.tsx                 // режим учителя (Фаза 2), скрыт за жестом/пином
  src/
    content/
      catalog.ts                // сканирование packs/, парсинг манифестов, единый каталог
      types.ts                  // ContentItem, Page, PackManifest и т.д.
      bootstrap.ts              // копирование bundled-паков в documentDirectory при 1м запуске
    db/
      client.ts                 // инициализация expo-sqlite, миграции
      schema.sql                // DDL из раздела 4
      progress.ts               // типизированные операции прогресса
    audio/
      player.ts                 // обёртка expo-audio: play/stop/preload, один активный звук
    sharing/
      shareApk.ts               // шеринг собственного APK через Intent (Фаза 1)
      sharePack.ts              // отправка/приём пака (Фаза 2: WiFi Direct)
    store/
      useAppStore.ts            // Zustand: текущий профиль, язык, каталог
    ui/
      BigButton.tsx             // крупная тач-цель (мин 64dp), картинка + звук при нажатии
      ImageScreen.tsx           // переиспользуемый «экран = одна картинка»
      ChoiceRow.tsx             // ряд из 3 вариантов выбора
    theme/
      tokens.ts                 // цвета, размеры (крупные!), отступы
  assets/
    bundled-packs/              // паки, вшитые в APK
    ui/                         // картинки интерфейса, аватары, иконки
  app.json
  eas.json                      // preview = APK
  .github/workflows/build.yml
  tsconfig.json                 // strict

## 6. UX-контракт (требования к каждому экрану)
1. Один экран = одна большая картинка + один звук. Звук играет автоматически при входе.
2. Тач-цели крупные. Минимум 64dp, лучше больше.
3. Любое нажатие даёт мгновенную реакцию (звук/визуал в пределах 100мс).
4. Не больше 3 вариантов выбора на экране.
5. Без текстовых инструкций для ребёнка. Навигация иконками и звуком. Текст только в режиме учителя.
6. Назад — всегда крупная очевидная стрелка в одном месте.
7. Только один звук одновременно. Новый звук останавливает предыдущий.

## 7. Шеринг
- Фаза 1 — шеринг приложения. Кнопка «Поделиться Barka» вызывает Android-интент, отдаёт собственный APK. Файл sharing/shareApk.ts. Работает на Android 6+.
- Фаза 2 — шеринг контента. Передача папки пака между устройствами через WiFi Direct. Приёмник кладёт папку в packs/ и пересканирует каталог.
Ключевое: приёмник пака не нуждается в обновлении кода. Любой валидный пак с корректным манифестом подхватывается существующим каталогом.

## 8. Контент-пайплайн (отдельная папка tools/, НЕ в APK)
Python-скрипты скачивают контент из African Storybook и Global Digital Library (CC-BY), конвертируют в формат паков, упаковывают. Инструмент разработчика, в APK не попадает.
Задачи: скачать книги → распарсить страницы и аудио → сжать картинки в WebP → перекодировать аудио в Opus моно → сгенерировать manifest.json → при отсутствии аудио на Mooré использовать TTS Facebook MMS.
Живёт в tools/content-pipeline/.

## 9. Что НЕ делаем сейчас
- Нет бэкенда для конечного пользователя. Никогда.
- Нет сетевой аналитики. Нет аккаунтов, паролей, email.
- Нет тяжёлых зависимостей.
- Dioula, режим учителя, WiFi Direct — заложены в архитектуру, реализуются в Фазах 2-3.

## 10. Порядок реализации MVP
1. Каркас Expo SDK 54 + expo-router + TypeScript strict.
2. Слой БД (db/): инициализация, схема, миграции.
3. Слой контента (content/): типы, сканер каталога, bootstrap bundled-паков.
4. Один тестовый bundled-пак вручную (2-3 сказки) для разработки UI.
5. UI-примитивы (ui/): ImageScreen, BigButton, ChoiceRow.
6. Экраны: index → sections → play.
7. Аудио-плеер с гарантией одного активного звука.
8. Запись прогресса в БД.
9. Кнопка шеринга APK (Фаза 1).
10. EAS build preview (APK) + GitHub Actions.
11. Тест на реальном дешёвом Android.
