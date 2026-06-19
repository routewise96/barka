/**
 * src/sharing/sharePack.ts — передача пака между устройствами.
 *
 * ИСТОРИЯ: изначально планировалась передача пака КАК ПАПКИ по WiFi Direct. Внешний
 * ревью показал, что реальные офлайн-транспорты (Bluetooth/Xender/SHAREit/SD) передают
 * ОДИН ФАЙЛ, а не папку. Поэтому формат дистрибуции — один архив .barka (ZIP), а вся
 * логика живёт в src/content/packArchive.ts. Эти тонкие обёртки сохранены для совместимости
 * вызовов и делегируют туда.
 *
 * Приёмник после импорта обязан позвать useAppStore.refreshCatalog() — обновление КОДА
 * по-прежнему не требуется (раздел 7), меняется лишь единица передачи: файл вместо папки.
 */
import { exportAndSharePack, pickAndImportPack } from '../content/packArchive';
import type { ImportResult } from '../content/packArchive';

/** Экспортировать пак в .barka и отдать через системный Share intent. */
export async function sendPack(packId: string): Promise<void> {
  return exportAndSharePack(packId);
}

/** Выбрать .barka через file picker и импортировать. null — пользователь отменил. */
export async function receivePack(): Promise<ImportResult | null> {
  return pickAndImportPack();
}
