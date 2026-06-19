/**
 * src/sharing/shareAppLink.ts — «Поделиться Barka» через ТЕКСТОВУЮ ссылку
 * на скачивание (упрощённый вариант шага 9).
 *
 * Открывает системный share-лист (Bluetooth, мессенджеры, SHAREit и т.д.) с
 * дружелюбным текстом + ссылкой на APK. Пользователь сам выбирает канал.
 *
 * Почему RN Share, а не expo-sharing: expo-sharing заточен под отправку ФАЙЛА
 * (Sharing.shareAsync(fileUri)), а нам нужно отдать ТЕКСТ + URL. Системный
 * текстовый share-лист — это React Native Share.share({ message }).
 *
 * Важно про Android: Share использует только `message` (поле `url` — iOS-only),
 * поэтому ссылку кладём прямо в текст сообщения; `url`/`title` передаём
 * дополнительно ради корректного листа на iOS.
 *
 * Офлайн-передача самого APK-файла (через нативный интент) — отдельный путь на
 * будущее, см. src/sharing/shareApk.ts.
 */
import { Share } from 'react-native';

import { SHARE_MESSAGE, SHARE_URL } from '../config/appConfig';

/** Открывает системный share-лист с сообщением и (если задана) ссылкой на APK. */
export async function shareAppLink(): Promise<void> {
  const message = SHARE_URL ? `${SHARE_MESSAGE}\n${SHARE_URL}` : SHARE_MESSAGE;
  try {
    if (SHARE_URL) {
      await Share.share({ message, url: SHARE_URL, title: 'Barka' });
    } else {
      // Ссылки ещё нет — мягко шерим только текст, без краша.
      await Share.share({ message, title: 'Barka' });
    }
  } catch {
    // Пользователь отменил лист или шер недоступен — намеренно тихо.
  }
}
