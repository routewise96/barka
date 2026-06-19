/**
 * src/sharing/sharePack.ts — приём/передача пака между устройствами (Фаза 2).
 * ЗАГЛУШКА каркаса.
 *
 * Передача папки пака по WiFi Direct. Приёмник кладёт папку в packs/ и зовёт
 * useAppStore.refreshCatalog() — обновление КОДА не требуется (раздел 7).
 */
import type { PackManifest } from '../content/types';

/** Отправить папку пака на другое устройство. */
export async function sendPack(_packId: string): Promise<void> {
  throw new Error('sharing/sharePack.sendPack: не реализовано (Фаза 2)');
}

/** Принять папку пака и положить её в packs/. Возвращает манифест принятого пака. */
export async function receivePack(): Promise<PackManifest> {
  throw new Error('sharing/sharePack.receivePack: не реализовано (Фаза 2)');
}
