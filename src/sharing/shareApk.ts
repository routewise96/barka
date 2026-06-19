/**
 * src/sharing/shareApk.ts — шеринг собственного APK (Фаза 1). ЗАГЛУШКА каркаса.
 *
 * Кнопка «Поделиться Barka» отдаёт установленный APK через Android-интент
 * (expo-sharing поверх ACTION_SEND). Работает на Android 6+. Реализация — шаг 9
 * раздела 10. Сеть не используется — передача идёт через системный шер
 * (Bluetooth/Nearby/файл).
 */

/** Поделиться собственным APK приложения через системный интент. */
export async function shareOwnApk(): Promise<void> {
  throw new Error('sharing/shareApk.shareOwnApk: не реализовано (каркас)');
}
