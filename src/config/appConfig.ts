/**
 * src/config/appConfig.ts — конфигурируемые значения уровня приложения.
 * Сюда выносится то, что заполняется на этапе релиза, чтобы не зашивать в код.
 */

/**
 * URL страницы скачивания APK для кнопки «Поделиться Barka».
 *
 * ПУСТО до первой EAS-сборки и заливки APK. ПОСЛЕ сборки подставить сюда
 * реальную ссылку — например, страницу релизов на GitHub
 * («https://github.com/routewise96/barka/releases/latest») или прямую ссылку
 * на файл в Cloudflare R2.
 *
 * Пока строка пустая — шеринг отдаёт только текст SHARE_MESSAGE (без ссылки),
 * кнопка не падает (см. src/sharing/shareAppLink.ts).
 */
export const SHARE_URL = '';

/**
 * Текст шеринга на французском (язык целевой аудитории). Адресован ВЗРОСЛОМУ
 * (родителю/учителю), не ребёнку — поэтому текст здесь уместен, в отличие от
 * детского UI. Ссылка (SHARE_URL) добавляется отдельной строкой при наличии.
 */
export const SHARE_MESSAGE =
  'Barka — une application éducative gratuite et hors ligne pour les enfants. ' +
  'Téléchargez-la et partagez-la librement !';
