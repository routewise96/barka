/**
 * src/audio/player.ts — обёртка над expo-audio. ЗАГЛУШКА каркаса.
 *
 * Контракт (раздел 6, п.7): одновременно звучит ТОЛЬКО один звук. Новый play()
 * останавливает предыдущий. Реализация — шаг 7 раздела 10 на базе expo-audio
 * (createAudioPlayer / AudioPlayer), НЕ expo-av (он deprecated в SDK 54).
 */

/** Проиграть звук по абсолютному URI, остановив текущий. */
export async function play(_uri: string): Promise<void> {
  throw new Error('audio/player.play: не реализовано (каркас)');
}

/** Остановить текущий звук, если он играет. */
export async function stop(): Promise<void> {
  throw new Error('audio/player.stop: не реализовано (каркас)');
}

/** Предзагрузить звук, чтобы реакция на нажатие была < 100мс (раздел 6, п.3). */
export async function preload(_uri: string): Promise<void> {
  throw new Error('audio/player.preload: не реализовано (каркас)');
}
