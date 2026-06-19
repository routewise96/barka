/**
 * src/theme/assets.ts — статические UI-ассеты (не контент паков), вшитые в APK.
 *
 * Зашитый путь к плейсхолдеру «сломанная картинка» для graceful degradation
 * (часть 2): когда file:// картинка контента не грузится, рисуем этот нейтральный
 * дружелюбный образ вместо пустоты/краша. Картинки через require() — штатный путь
 * Metro (в отличие от аудио, где require ломается в release; см. audio/player.ts).
 */
// Статический ассет подключается через require, чтобы Metro его забандлил и выдал
// модуль-источник для expo-image (для картинок require — штатный путь).
export const BROKEN_IMAGE_PLACEHOLDER = require('../../assets/ui/broken-image.png');
