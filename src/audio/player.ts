/**
 * src/audio/player.ts — singleton-менеджер аудио поверх expo-audio (SDK 54).
 *
 * Гарантия раздела 6, п.7: одновременно жив МАКСИМУМ один звук. Новый play()
 * сначала останавливает и освобождает предыдущий, потом создаёт новый.
 *
 * ── Почему createAudioPlayer, а НЕ хук useAudioPlayer ───────────────────────
 * Хук нельзя переинициализировать из обычной функции и нельзя на лету подменить
 * трек у живого плеера. Для «ровно один активный звук + без утечек» нужен
 * императивный контроль жизненного цикла: createAudioPlayer(...) даёт объект,
 * которым мы владеем и который сами .remove() освобождаем. Поэтому менеджер
 * держит ссылку на текущий плеер и пересоздаёт его при смене трека.
 *
 * ── БАГ RELEASE-СБОРКИ (важно, не регрессировать) ───────────────────────────
 * useAudioPlayer(require('./file')) / createAudioPlayer(require(...)) работает в
 * dev, но МОЛЧА не грузит звук в release APK. Поэтому здесь принимаем ТОЛЬКО
 * file:// URI (ассет уже распакован в documentDirectory слоем bootstrap, путь
 * приходит из resolveAssetUri). НИКОГДА не передаём require()-модуль в плеер.
 *
 * ── Авто-сброс позиции ──────────────────────────────────────────────────────
 * expo-audio НЕ перематывает в начало по окончании. Для UX «звук играет при
 * входе на экран» при повторном проигрывании того же трека делаем seekTo(0).
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File } from 'expo-file-system';

import { logError } from '../db/progress';

/** Текущий (единственный) живой плеер и URI его трека. */
let current: AudioPlayer | null = null;
let currentUri: string | null = null;

/**
 * Проиграть звук по абсолютному file:// URI, оставив живым ровно один плеер.
 *  - тот же URI и плеер ещё жив → seekTo(0) + play() (перезапуск без пересоздания);
 *  - другой URI → освободить текущий, создать новый, play().
 *
 * Graceful degradation (часть 3): НИКОГДА не кидает и не блокирует UI. Если файл
 * отсутствует/не играется — логирует 'error_audio' и возвращает false, чтобы экран
 * мог показать кнопку «повторить звук». true — воспроизведение запущено.
 *
 * @param uri ТОЛЬКО file:// URI из resolveAssetUri (см. баг release-сборки выше).
 */
export async function playFromUri(uri: string): Promise<boolean> {
  // Тот же трек ещё в памяти — просто перематываем в начало и играем заново.
  if (current && currentUri === uri) {
    try {
      await current.seekTo(0);
      current.play();
      return true;
    } catch (e) {
      // Плеер мог умереть — сбросим и попробуем пересоздать ниже.
      releaseCurrent();
      void logError('error_audio', `replay ${uri}: ${String(e)}`);
    }
  }

  // Файла нет на диске (испорчен/удалён после установки) — не пытаемся играть.
  try {
    if (!new File(uri).exists) {
      void logError('error_audio', `файл отсутствует: ${uri}`);
      return false;
    }
  } catch {
    // Проверку существования не удалось выполнить — продолжаем, плеер сам отвалится.
  }

  // Другой трек — гасим и освобождаем предыдущий, затем создаём новый.
  releaseCurrent();

  try {
    const player = createAudioPlayer({ uri });
    player.volume = 1.0;
    current = player;
    currentUri = uri;
    player.play();
    return true;
  } catch (e) {
    // Создание/старт плеера упали — деградируем тихо, экран покажет кнопку повтора.
    void logError('error_audio', `play ${uri}: ${String(e)}`);
    current = null;
    currentUri = null;
    return false;
  }
}

/** Остановить и освободить текущий звук (если есть). После — ни одного живого плеера. */
export function stop(): void {
  releaseCurrent();
}

/**
 * Разовая настройка аудио-сессии под воспроизведение коротких озвучек.
 * Зовётся один раз при инициализации приложения (шаг 6/7). Идемпотентна,
 * ошибки проглатываются — без звука приложение всё равно работает.
 */
export async function configureAudioForPlayback(): Promise<void> {
  try {
    await setAudioModeAsync({
      // Играть даже в «тихом» режиме телефона: родитель/ребёнок не поймёт, почему
      // молчит обучающее приложение (iOS-семантика silent switch).
      playsInSilentMode: true,
      // Не глушить чужое аудио намертво — лишь приглушать на время наших коротких
      // озвучек и возвращать громкость (мягкая фокус-политика на Android/iOS).
      interruptionMode: 'duckOthers',
      // Звук только при активном экране — в фоне не играем.
      shouldPlayInBackground: false,
    });
  } catch {
    // намеренно тихо: настройка сессии не критична для запуска
  }
}

// ---------------------------------------------------------------------------
// Внутреннее
// ---------------------------------------------------------------------------

/** Останавливает и освобождает текущий плеер; гарантирует отсутствие утечки. */
function releaseCurrent(): void {
  if (!current) return;
  const player = current;
  current = null;
  currentUri = null;
  try {
    player.pause();
  } catch {
    // плеер мог быть уже освобождён — игнорируем
  }
  try {
    player.remove(); // освобождает нативный ресурс (SharedObject)
  } catch {
    // повторный release безопасно игнорируем
  }
}
