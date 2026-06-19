/**
 * src/store/useAppStore.ts — глобальный стейт (Zustand): текущий профиль,
 * язык интерфейса контента и собранный каталог.
 *
 * Здесь же живёт единая точка инициализации приложения: initialize() готовит БД,
 * распаковывает bundled-паки и строит каталог. Зовётся из app/_layout.tsx.
 */
import { create } from 'zustand';

import { bootstrapBundledPacks } from '../content/bootstrap';
import { scanCatalog } from '../content/catalog';
import type { Catalog, Lang } from '../content/types';
import { getDb } from '../db/client';
import { createProfile, listProfiles, logError } from '../db/progress';

/** Пустой каталог — крайняя деградация: приложение всё равно показывает экран. */
const EMPTY_CATALOG: Catalog = { packs: [], items: [], byId: new Map() };

interface AppState {
  /** Инициализация завершена (БД + паки + каталог готовы). */
  initialized: boolean;
  /** Идёт инициализация — защита от повторного запуска. */
  initializing: boolean;
  /** Собранный каталог контента или null до инициализации. */
  catalog: Catalog | null;
  /** Текущий активный профиль ребёнка. */
  currentProfileId: number | null;
  /** Выбранный язык контента (по умолчанию французский). */
  lang: Lang;

  /** Готовит БД, распаковывает bundled-паки, строит каталог. Идемпотентна. */
  initialize: () => Promise<void>;
  /** Пересобрать каталог (напр. после приёма side-loaded пака). */
  refreshCatalog: () => Promise<void>;
  /**
   * Возвращает id активного профиля, молча создавая единственный дефолтный,
   * если его ещё нет (MVP без экрана выбора профиля — раздел 6, шаг 6).
   */
  ensureProfile: () => Promise<number>;
  setCurrentProfile: (id: number | null) => void;
  setLang: (lang: Lang) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  initializing: false,
  catalog: null,
  currentProfileId: null,
  lang: 'fr',

  initialize: async () => {
    if (get().initialized || get().initializing) return;
    set({ initializing: true });
    try {
      // БД может не открыться (переполнен диск, битый файл) — но приложение обязано
      // подняться. Каждый шаг изолирован; в худшем случае показываем пустой каталог.
      try {
        await getDb(); // открыть БД и применить миграции
      } catch (e) {
        void logError('error_fs', `initialize/getDb: ${String(e)}`);
      }

      let catalog: Catalog = EMPTY_CATALOG;
      try {
        const bundledIds = await bootstrapBundledPacks();
        catalog = await scanCatalog(bundledIds);
      } catch (e) {
        // Не должно случаться (bootstrap/scan сами defensive), но это последний рубеж.
        void logError('error_fs', `initialize/catalog: ${String(e)}`);
      }

      set({ catalog, initialized: true });
    } finally {
      set({ initializing: false });
    }
  },

  refreshCatalog: async () => {
    try {
      const bundledIds = await bootstrapBundledPacks();
      const catalog = await scanCatalog(bundledIds);
      set({ catalog });
    } catch (e) {
      void logError('error_fs', `refreshCatalog: ${String(e)}`);
    }
  },

  ensureProfile: async () => {
    const existing = get().currentProfileId;
    if (existing != null) return existing;
    // Один дефолтный профиль на устройство (выбор профиля — позже).
    const profiles = await listProfiles();
    const id = profiles[0]?.id ?? (await createProfile('Enfant', 'default'));
    set({ currentProfileId: id });
    return id;
  },

  setCurrentProfile: (id) => set({ currentProfileId: id }),
  setLang: (lang) => set({ lang }),
}));
